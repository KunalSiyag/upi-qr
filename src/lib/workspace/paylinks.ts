import { isIsoDate, viewInvoice, type InvoiceState, type Workspace } from "./model.ts";
import { isBookId, parseLinkKey, PRIMARY_BOOK_ID } from "./books.ts";

/**
 * Hosted pay links (/i/<token>/). A link stores only { owner, invoiceId }; the
 * public page reads the invoice live from the owner's synced workspace, so the
 * amount is always the current balance and a paid invoice says so.
 *
 * A payer's "I've paid" + UTR is a claim, never a payment: the merchant
 * confirms it in the workspace. Pro UPI QR never touches the money.
 */

export const FREE_ACTIVE_PAYLINKS = 10;
export const MAX_PENDING_CLAIMS = 5;
const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;

export function validPaylinkToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_RE.test(value);
}

export interface PaylinkRecord {
  owner: string;
  /** The store key: a bare subject (inv_… or stmt:cli_…) for the primary book; "<bookId>/<subject>" for other books (books.ts linkKey). */
  invoiceId: string;
  createdAt: number;
  /** Non-primary books only: the owning book, a redundant check of the invoiceId prefix. Absent on primary links. */
  businessId?: string;
}

export interface PaylinkClaim {
  utr: string;
  amountPaise: number | null;
  at: number;
}

export interface PaylinkStore {
  get(token: string): Promise<PaylinkRecord | null>;
  /** Pre-rendered page data per token for one owner (written at sync), so a page view reads ~300 bytes. */
  getView(owner: string, token: string): Promise<PaylinkSnapshot | null>;
  /** Replaces all of an owner's snapshots. */
  putViews(owner: string, views: Record<string, PaylinkSnapshot>): Promise<void>;
  /** Existing token for this invoice, if any. */
  tokenFor(owner: string, invoiceId: string): Promise<string | null>;
  /** invoiceId → token for every active link of the owner. */
  list(owner: string): Promise<Record<string, string>>;
  put(token: string, record: PaylinkRecord): Promise<void>;
  remove(owner: string, token: string, invoiceId: string): Promise<void>;
  claims(token: string): Promise<PaylinkClaim[]>;
  addClaim(token: string, claim: PaylinkClaim): Promise<void>;
  clearClaims(token: string): Promise<void>;
}

export interface PayPageView {
  merchantName: string;
  upiId: string;
  invoiceNumber: string;
  amountPaise: number;
  balancePaise: number;
  dueDate: string;
  description: string;
  state: InvoiceState;
}

/** What the public page may show. Deliberately excludes the client's name and contact details. */
export function payPageView(ws: Workspace, invoiceId: string, today: string): PayPageView | null {
  const invoice = ws.invoices[invoiceId];
  if (!invoice || invoice.deletedAt) return null;
  const view = viewInvoice(invoice, ws.clients, today);
  return {
    merchantName: ws.business.name.trim() || "Merchant",
    upiId: ws.business.upiId.trim(),
    invoiceNumber: invoice.number,
    amountPaise: invoice.amountPaise,
    balancePaise: view.balancePaise,
    dueDate: isIsoDate(invoice.dueDate) ? invoice.dueDate : "",
    description: invoice.description,
    state: view.state,
  };
}

// ---------------------------------------------------------------------------
// Client statement links (Pro): one link listing all of a client's dues.

/** Statement links reuse the pay-link store; their subject key is "stmt:<clientId>". */
export const statementSubject = (clientId: string) => `stmt:${clientId}`;

export function subjectOf(key: string): { kind: "invoice"; invoiceId: string } | { kind: "statement"; clientId: string } {
  return key.startsWith("stmt:") ? { kind: "statement", clientId: key.slice(5) } : { kind: "invoice", invoiceId: key };
}

export interface StatementLine {
  number: string;
  issueDate: string;
  dueDate: string;
  balancePaise: number;
  overdue: boolean;
}

export interface StatementView {
  merchantName: string;
  upiId: string;
  lines: StatementLine[];
  totalPaise: number;
  overduePaise: number;
}

/** Open invoices for one client, oldest due first. No client identity and no descriptions (they often contain names). */
export function statementView(ws: Workspace, clientId: string, today: string): StatementView | null {
  const client = ws.clients[clientId];
  if (!client || client.deletedAt) return null;
  const lines = Object.values(ws.invoices)
    .filter((inv) => !inv.deletedAt && inv.clientId === clientId)
    .map((inv) => viewInvoice(inv, ws.clients, today))
    .filter((v) => v.balancePaise > 0 && v.state !== "void")
    .sort((a, b) => a.invoice.dueDate.localeCompare(b.invoice.dueDate) || a.invoice.issueDate.localeCompare(b.invoice.issueDate))
    .map((v) => ({ number: v.invoice.number, issueDate: v.invoice.issueDate, dueDate: v.invoice.dueDate, balancePaise: v.balancePaise, overdue: v.state === "overdue" }));
  return {
    merchantName: ws.business.name.trim() || "Merchant",
    upiId: ws.business.upiId.trim(),
    lines,
    totalPaise: lines.reduce((sum, l) => sum + l.balancePaise, 0),
    overduePaise: lines.filter((l) => l.overdue).reduce((sum, l) => sum + l.balancePaise, 0),
  };
}

export async function createStatementLink(
  store: PaylinkStore,
  owner: string,
  ws: Workspace,
  clientId: string,
  newToken: () => string,
  now: number,
  plan: { statementLinks: boolean; activePaylinks: number },
  validVpa: (vpa: string) => boolean,
): Promise<CreateResult> {
  if (!plan.statementLinks) return { status: "not_pro", message: "Statement links are part of Pro." };
  const view = statementView(ws, clientId, "1970-01-01");
  if (!view) return { status: "missing_client", message: "This client hasn't synced yet. Wait a moment and try again." };
  if (view.totalPaise <= 0) return { status: "no_balance", message: "This client has nothing due." };
  if (!validVpa(view.upiId)) return { status: "no_upi", message: "Add your UPI ID in Settings before sharing links." };
  const subject = statementSubject(clientId);
  const existing = await store.tokenFor(owner, subject);
  if (existing && (await store.get(existing))) return { status: "ok", token: existing, created: false };
  if (Object.keys(await store.list(owner)).length >= plan.activePaylinks) {
    return { status: "limit", message: `You can keep ${plan.activePaylinks} links active. Turn some off to make room.` };
  }
  const token = newToken();
  await store.put(token, { owner, invoiceId: subject, createdAt: now });
  return { status: "ok", token, created: true };
}

export type CreateResult =
  | { status: "ok"; token: string; created: boolean }
  | { status: "missing_invoice" | "missing_client" | "not_pro" | "no_balance" | "no_upi" | "limit"; message: string };

export async function createPaylink(
  store: PaylinkStore,
  owner: string,
  ws: Workspace,
  invoiceId: string,
  newToken: () => string,
  now: number,
  activeLimit: number,
  validVpa: (vpa: string) => boolean,
): Promise<CreateResult> {
  const view = payPageView(ws, invoiceId, "1970-01-01");
  if (!view) return { status: "missing_invoice", message: "This invoice hasn't synced yet. Wait a moment and try again." };
  if (view.state === "void" || view.balancePaise <= 0) return { status: "no_balance", message: "Nothing is due on this invoice." };
  if (!validVpa(view.upiId)) return { status: "no_upi", message: "Add your UPI ID in Settings before sharing pay links." };
  const existing = await store.tokenFor(owner, invoiceId);
  if (existing && (await store.get(existing))) return { status: "ok", token: existing, created: false };
  const active = Object.keys(await store.list(owner)).length;
  if (active >= activeLimit) {
    return { status: "limit", message: `Free accounts can keep ${activeLimit} pay links active. Revoke links for paid invoices to make room.` };
  }
  const token = newToken();
  await store.put(token, { owner, invoiceId, createdAt: now });
  return { status: "ok", token, created: true };
}

export async function addClaim(store: PaylinkStore, token: string, claim: PaylinkClaim): Promise<"ok" | "full"> {
  const pending = await store.claims(token);
  if (pending.some((c) => c.utr === claim.utr)) return "ok";
  if (pending.length >= MAX_PENDING_CLAIMS) return "full";
  await store.addClaim(token, claim);
  return "ok";
}

function parseClaim(raw: unknown): PaylinkClaim | null {
  const value = typeof raw === "string" ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw;
  if (!value || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  if (typeof r.utr !== "string" || typeof r.at !== "number") return null;
  const amount = typeof r.amountPaise === "number" && Number.isSafeInteger(r.amountPaise) && r.amountPaise > 0 ? r.amountPaise : null;
  return { utr: r.utr.slice(0, 35), amountPaise: amount, at: r.at };
}

export function parseClaims(raw: unknown): PaylinkClaim[] {
  return Array.isArray(raw) ? raw.map(parseClaim).filter((c): c is PaylinkClaim => c !== null) : [];
}

export function parseRecord(raw: unknown): PaylinkRecord | null {
  const value = typeof raw === "string" ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw;
  if (!value || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  if (typeof r.owner !== "string" || typeof r.invoiceId !== "string" || typeof r.createdAt !== "number") return null;
  const record: PaylinkRecord = { owner: r.owner, invoiceId: r.invoiceId, createdAt: r.createdAt };
  // A businessId is kept only if valid, and must agree with the book the key names (no "/" = primary).
  const businessId = isBookId(r.businessId) ? r.businessId : undefined;
  if (parseLinkKey(r.invoiceId).bookId !== (businessId ?? PRIMARY_BOOK_ID)) return null;
  if (businessId && businessId !== PRIMARY_BOOK_ID) record.businessId = businessId;
  return record;
}

export function memoryPaylinkStore(): PaylinkStore {
  const records = new Map<string, PaylinkRecord>();
  const byOwner = new Map<string, Map<string, string>>();
  const claimLists = new Map<string, PaylinkClaim[]>();
  const views = new Map<string, Record<string, PaylinkSnapshot>>();
  return {
    async getView(owner, token) { return views.get(owner)?.[token] ?? null; },
    async putViews(owner, next) { views.set(owner, { ...next }); },
    async get(token) { return records.get(token) ?? null; },
    async tokenFor(owner, invoiceId) { return byOwner.get(owner)?.get(invoiceId) ?? null; },
    async list(owner) { return Object.fromEntries(byOwner.get(owner) ?? []); },
    async put(token, record) {
      records.set(token, record);
      if (!byOwner.has(record.owner)) byOwner.set(record.owner, new Map());
      byOwner.get(record.owner)!.set(record.invoiceId, token);
    },
    async remove(owner, token, invoiceId) {
      records.delete(token);
      claimLists.delete(token);
      byOwner.get(owner)?.delete(invoiceId);
    },
    async claims(token) { return [...(claimLists.get(token) ?? [])]; },
    async addClaim(token, claim) { claimLists.set(token, [claim, ...(claimLists.get(token) ?? [])].slice(0, MAX_PENDING_CLAIMS)); },
    async clearClaims(token) { claimLists.delete(token); },
  };
}

// ---------------------------------------------------------------------------
// Snapshots: what /i/<token>/ shows, written whenever the owner's workspace
// syncs. Date-dependent bits (overdue) are recomputed per view in
// snapshotView(), so a snapshot never goes stale between syncs.

export type PaylinkSnapshot =
  | { kind: "invoice"; view: PayPageView }
  | { kind: "statement"; view: StatementView };

/** Today-independent snapshot for a link subject (invoice id or "stmt:<clientId>"), or null if gone. */
export function snapshotFor(ws: Workspace, subject: string): PaylinkSnapshot | null {
  const s = subjectOf(subject);
  if (s.kind === "statement") {
    const view = statementView(ws, s.clientId, "0000-01-01");
    return view ? { kind: "statement", view } : null;
  }
  const view = payPageView(ws, s.invoiceId, "0000-01-01");
  return view ? { kind: "invoice", view } : null;
}

/** The snapshot as of `today`: same result as computing from the full workspace. */
export function snapshotView(snapshot: PaylinkSnapshot, today: string): PaylinkSnapshot {
  if (snapshot.kind === "statement") {
    const lines = snapshot.view.lines.map((line) => ({ ...line, overdue: line.dueDate < today }));
    return {
      kind: "statement",
      view: { ...snapshot.view, lines, overduePaise: lines.filter((l) => l.overdue).reduce((sum, l) => sum + l.balancePaise, 0) },
    };
  }
  const v = snapshot.view;
  const state: InvoiceState = v.state === "paid" || v.state === "void" ? v.state : v.dueDate && v.dueDate < today ? "overdue" : v.balancePaise < v.amountPaise ? "partial" : "due";
  return { kind: "invoice", view: { ...v, state } };
}

export function parseSnapshot(raw: unknown): PaylinkSnapshot | null {
  const value = typeof raw === "string" ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw;
  if (!value || typeof value !== "object") return null;
  const r = value as { kind?: unknown; view?: unknown };
  return (r.kind === "invoice" || r.kind === "statement") && r.view && typeof r.view === "object" ? (value as PaylinkSnapshot) : null;
}

/** Snapshots for every active link of an owner (token → snapshot). */
export function snapshotsForLinks(ws: Workspace, links: Record<string, string>): Record<string, PaylinkSnapshot> {
  const out: Record<string, PaylinkSnapshot> = {};
  for (const [subject, token] of Object.entries(links)) {
    const snapshot = snapshotFor(ws, subject);
    if (snapshot) out[token] = snapshot;
  }
  return out;
}
