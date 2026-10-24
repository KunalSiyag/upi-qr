// src/lib/workspace/paylinks.ts at the PR 2 commit (f1d151c), verbatim except the two import paths: the server view
// builders a rollback of PR 3 lands on (PR 1/PR 2), which refuse foreign records. Tests keep pinning that rollback
// guarantee now that PR 3 renders them (docs/spec-foreign-clients.md §4.1, §10).
import { allLiveInvoices, currencyOf, getInvoice, isIsoDate, liveInvoices, viewInvoice, type InvoiceState, type Workspace } from "../../src/lib/workspace/model.ts";
import { isBookId, parseLinkKey, PRIMARY_BOOK_ID } from "../../src/lib/workspace/books.ts";

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
  /** Replaces all of an owner's snapshots. Only for owners whose links are all in the primary book (see refreshViews). */
  putViews(owner: string, views: Record<string, PaylinkSnapshot>): Promise<void>;
  /** Sets some snapshots and removes others, leaving the rest (other books' snapshots) untouched. */
  patchViews(owner: string, set: Record<string, PaylinkSnapshot>, drop: string[]): Promise<void>;
  /** Tokens that have a stored snapshot (for orphan cleanup on "Delete cloud copy"). */
  viewTokens(owner: string): Promise<string[]>;
  /** Existing token for this invoice, if any. */
  tokenFor(owner: string, invoiceId: string): Promise<string | null>;
  /** invoiceId → token for every active link of the owner. */
  list(owner: string): Promise<Record<string, string>>;
  put(token: string, record: PaylinkRecord): Promise<void>;
  /** Revokes one link: record, claims, its pl:own field (the record's invoiceId) and its snapshot. */
  remove(owner: string, token: string, invoiceId: string): Promise<void>;
  /** Revokes every link of one non-primary book (keys "<bookId>/…"); payers then get 404. */
  removeBook(owner: string, bookId: string): Promise<void>;
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

/**
 * What the public page may show. Deliberately excludes the client's name and contact details.
 * INR invoices only: a foreign-currency invoice is null (no ₹ amount, no UPI QR for it), so a server
 * that can't render foreign links answers 404 instead (docs/spec-foreign-clients.md §1.6).
 */
export function payPageView(ws: Workspace, invoiceId: string, today: string): PayPageView | null {
  const invoice = getInvoice(ws, invoiceId);
  if (!invoice || invoice.deletedAt || currencyOf(invoice) !== "INR") return null;
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

/** A live client with an open (unpaid, not void) foreign-currency invoice. */
export function hasOpenForeign(ws: Workspace, clientId: string): boolean {
  return allLiveInvoices(ws).some((inv) => inv.clientId === clientId && currencyOf(inv) !== "INR" && viewInvoice(inv, ws.clients, "0000-01-01").balancePaise > 0);
}

/**
 * Open INR invoices for one client, oldest due first. No client identity and no descriptions (they often
 * contain names). Null for a client with open foreign-currency invoices: this build can't show them, and a
 * statement without them would read "Paid" while money is still owed.
 */
export function statementView(ws: Workspace, clientId: string, today: string): StatementView | null {
  const client = Object.prototype.hasOwnProperty.call(ws.clients, clientId) ? ws.clients[clientId] : undefined;
  if (!client || client.deletedAt || hasOpenForeign(ws, clientId)) return null;
  const lines = liveInvoices(ws)
    .filter((inv) => inv.clientId === clientId)
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
  /** Store key: the bare subject for the primary book, linkKey(bookId, subject) for others. */
  key: string = statementSubject(clientId),
): Promise<CreateResult> {
  if (!plan.statementLinks) return { status: "not_pro", message: "Statement links are part of Pro." };
  if (hasOpenForeign(ws, clientId)) return { status: "not_found", message: NOT_YET_FOREIGN };
  const view = statementView(ws, clientId, "1970-01-01");
  if (!view) return { status: "missing_client", message: "This client hasn't synced yet. Wait a moment and try again." };
  if (view.totalPaise <= 0) return { status: "no_balance", message: "This client has nothing due." };
  const qualified = key !== statementSubject(clientId);
  if (!validVpa(view.upiId)) return { status: "no_upi", message: qualified ? noUpiFor(ws) : "Add your UPI ID in Settings before sharing links." };
  const existing = await store.tokenFor(owner, key);
  if (existing && (await store.get(existing))) return { status: "ok", token: existing, created: false };
  if (Object.keys(await store.list(owner)).length >= plan.activePaylinks) {
    return { status: "limit", message: `You can keep ${plan.activePaylinks} links active. Turn some off to make room.` };
  }
  const token = newToken();
  await store.put(token, recordFor(owner, key, now));
  return { status: "ok", token, created: true };
}

/** The no-UPI message for a non-primary book names that business (the primary keeps today's text). */
const noUpiFor = (ws: Workspace) => `Add a UPI ID for ${ws.business.name.trim() || "this business"} in Settings before sharing pay links.`;

/** Primary records stay byte-identical ({ owner, invoiceId, createdAt }); other books also carry businessId. */
function recordFor(owner: string, key: string, now: number): PaylinkRecord {
  const { bookId } = parseLinkKey(key);
  if (!bookId) throw new RangeError("Invalid pay-link key.");
  return bookId === PRIMARY_BOOK_ID ? { owner, invoiceId: key, createdAt: now } : { owner, invoiceId: key, createdAt: now, businessId: bookId };
}

/** not_found (API 404): a link for foreign-currency invoices, which this server can't render yet. */
export type CreateResult =
  | { status: "ok"; token: string; created: boolean }
  | { status: "missing_invoice" | "missing_client" | "not_pro" | "no_balance" | "no_upi" | "limit" | "not_found"; message: string };

export const NOT_YET_FOREIGN = "Pay links for foreign-currency invoices aren't available yet.";

/** HTTP status of a refused link creation. */
export function createStatusCode(status: Exclude<CreateResult["status"], "ok">): number {
  return status === "limit" || status === "not_pro" ? 402 : status === "not_found" ? 404 : 409;
}

export async function createPaylink(
  store: PaylinkStore,
  owner: string,
  ws: Workspace,
  invoiceId: string,
  newToken: () => string,
  now: number,
  activeLimit: number,
  validVpa: (vpa: string) => boolean,
  /** Store key: the bare invoice id for the primary book, linkKey(bookId, invoiceId) for others. */
  key: string = invoiceId,
): Promise<CreateResult> {
  const subject = getInvoice(ws, invoiceId);
  if (subject && !subject.deletedAt && currencyOf(subject) !== "INR") return { status: "not_found", message: NOT_YET_FOREIGN };
  const view = payPageView(ws, invoiceId, "1970-01-01");
  if (!view) return { status: "missing_invoice", message: "This invoice hasn't synced yet. Wait a moment and try again." };
  if (view.state === "void" || view.balancePaise <= 0) return { status: "no_balance", message: "Nothing is due on this invoice." };
  if (!validVpa(view.upiId)) return { status: "no_upi", message: key !== invoiceId ? noUpiFor(ws) : "Add your UPI ID in Settings before sharing pay links." };
  const existing = await store.tokenFor(owner, key);
  if (existing && (await store.get(existing))) return { status: "ok", token: existing, created: false };
  const active = Object.keys(await store.list(owner)).length;
  if (active >= activeLimit) {
    return { status: "limit", message: `Free accounts can keep ${activeLimit} pay links active. Revoke links for paid invoices to make room.` };
  }
  const token = newToken();
  await store.put(token, recordFor(owner, key, now));
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
    async viewTokens(owner) { return Object.keys(views.get(owner) ?? {}); },
    async patchViews(owner, set, drop) {
      const next = { ...(views.get(owner) ?? {}), ...set };
      for (const token of drop) delete next[token];
      views.set(owner, next);
    },
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
      if (views.get(owner)) delete views.get(owner)![token];
    },
    async removeBook(owner, bookId) {
      if (bookId === PRIMARY_BOOK_ID) return;
      for (const [key, token] of [...(byOwner.get(owner) ?? [])]) {
        if (parseLinkKey(key).bookId !== bookId) continue;
        records.delete(token);
        claimLists.delete(token);
        byOwner.get(owner)?.delete(key);
        if (views.get(owner)) delete views.get(owner)![token];
      }
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

/**
 * Re-renders the snapshots of one book's links from that book's workspace (the
 * owning book, so the page shows that business's name and UPI ID). Accounts
 * whose links are all in the primary book keep today's exact write (one
 * replace of the owner's snapshots); otherwise only this book's snapshots are
 * set or dropped and other books' stay as they are.
 * extra: snapshots to set as well (the pay page's own token when its link isn't listed).
 * skipWhenNoLinks: write nothing when the owner has no links (the sync path).
 * Returns the tokens whose snapshots it wrote, so a caller that must undo can drop them.
 */
export async function refreshViews(
  store: PaylinkStore,
  owner: string,
  bookId: string,
  ws: Workspace,
  opts: { extra?: Record<string, PaylinkSnapshot>; skipWhenNoLinks?: boolean } = {},
): Promise<string[]> {
  const links = await store.list(owner);
  const keys = Object.keys(links);
  const extra = opts.extra ?? {};
  if (bookId === PRIMARY_BOOK_ID && keys.every((key) => !key.includes("/"))) {
    if (opts.skipWhenNoLinks && !keys.length) return [];
    const views = { ...snapshotsForLinks(ws, links), ...extra };
    await store.putViews(owner, views);
    return Object.keys(views);
  }
  const mine: Record<string, string> = {};
  for (const [key, token] of Object.entries(links)) {
    const parsed = parseLinkKey(key);
    if (parsed.bookId === bookId) mine[parsed.subject] = token;
  }
  const set = { ...snapshotsForLinks(ws, mine), ...extra };
  const drop = Object.values(mine).filter((token) => !set[token]);
  if (Object.keys(set).length || drop.length) await store.patchViews(owner, set, drop);
  return Object.keys(set);
}
