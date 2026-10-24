import {
  allLiveInvoices, currencyOf, getInvoice, intlPayable, invoiceExportNote, isIsoDate, liveInvoices, payDetailsFor, viewInvoice,
  type IntlSettings, type InvoiceState, type InvoiceView, type Workspace,
} from "./model.ts";
import { FOREIGN_CURRENCIES, isForeignCurrency, safePayUrl, type ForeignCurrency, type Minor } from "./currency.ts";
import { isBookId, parseLinkKey, PRIMARY_BOOK_ID } from "./books.ts";

/**
 * Hosted pay links (/i/<token>/). A link stores only { owner, invoiceId }; the
 * public page reads the invoice live from the owner's synced workspace, so the
 * amount is always the current balance and a paid invoice says so.
 *
 * A payer's "I've paid" + UTR is a claim, never a payment: the merchant
 * confirms it in the workspace. Pro UPI QR never touches the money.
 *
 * Foreign-currency invoices (docs/spec-foreign-clients.md §4) get their own snapshot kinds, "foreign" and
 * "statement2", which older pay pages can't parse: they show the amount in its currency and the business's
 * international payment details, never a UPI ID or a ₹ figure.
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
  /**
   * 1 on a link created for a foreign-currency invoice (an invoice's currency never changes under its id). Older
   * tabs can't see foreign invoices and would count such a link as paid and revoke it, so the list API hides it
   * and the delete API refuses it unless the client sends ?intl=1 (docs/spec-foreign-clients.md §1.7).
   */
  intl?: 1;
}

export interface PaylinkClaim {
  /** The UPI UTR, or on a foreign-currency link the transfer reference (it is the dedupe key either way). */
  utr: string;
  /** Minor units of `currency` (paise when absent). */
  amountPaise: number | null;
  at: number;
  /** A claim on a foreign-currency link: set from the server's snapshot, never from the payer's form. */
  currency?: ForeignCurrency;
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

/** The public subset of the business's international payment details; empty fields are left out of the JSON. */
export interface IntlPayDetails {
  accountName?: string;
  bankName?: string;
  swift?: string;
  account?: string;
  bankDetails?: string;
  payUrl?: string;
}

/** The pay page of a foreign-currency invoice: its own currency and the bank/URL details, never a UPI ID. */
export interface ForeignPayView {
  merchantName: string;
  currency: ForeignCurrency;
  invoiceNumber: string;
  amountMinor: Minor;
  balanceMinor: Minor;
  dueDate: string;
  description: string;
  state: InvoiceState;
  /** payDetailsFor(settings, currency): the currency's own set when the business added one. */
  pay: IntlPayDetails;
  /** The GST export line (Rule 46 endorsement + LUT ARN) when the invoice qualifies (invoiceExportNote). */
  exportNote?: string;
}

const PUBLIC_PAY_FIELDS = ["accountName", "bankName", "swift", "account", "bankDetails", "payUrl"] as const;

/** The details a payer in `currency` sees: payDetailsFor, the URL checked again, empty fields left out. */
export function publicPayDetails(settings: IntlSettings | undefined, currency: ForeignCurrency): IntlPayDetails {
  const details = payDetailsFor(settings, currency);
  const out: IntlPayDetails = {};
  if (!details) return out;
  for (const field of PUBLIC_PAY_FIELDS) {
    const value = field === "payUrl" ? safePayUrl(details.payUrl) : details[field].trim();
    if (value) out[field] = value;
  }
  return out;
}

/**
 * What the public page of a foreign-currency invoice may show (null for an INR, missing or deleted one). Like
 * payPageView it leaves out the client's identity, and it also leaves out payments, references and INR credited.
 */
export function foreignPayView(ws: Workspace, invoiceId: string, today: string): ForeignPayView | null {
  const invoice = getInvoice(ws, invoiceId);
  if (!invoice || invoice.deletedAt) return null;
  const currency = currencyOf(invoice);
  if (!isForeignCurrency(currency)) return null;
  const view = viewInvoice(invoice, ws.clients, today);
  const note = invoiceExportNote(ws, invoice);
  return {
    merchantName: ws.business.name.trim() || "Merchant",
    currency,
    invoiceNumber: invoice.number,
    amountMinor: invoice.amountPaise,
    balanceMinor: view.balancePaise,
    dueDate: isIsoDate(invoice.dueDate) ? invoice.dueDate : "",
    description: invoice.description,
    state: view.state,
    pay: publicPayDetails(ws.intl?.settings, currency),
    ...(note ? { exportNote: note } : {}),
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
  /** Minor units of the line's currency (paise on the INR lines). */
  balancePaise: number;
  overdue: boolean;
  /** Foreign lines only: the invoice carries the GST export line (invoiceExportNote), so the page can say which. */
  export?: true;
}

/** One currency's open invoices on a statement (never added into the ₹ total). */
export interface ForeignStatementSection {
  currency: ForeignCurrency;
  lines: StatementLine[];
  totalMinor: Minor;
  overdueMinor: Minor;
}

export interface StatementView {
  merchantName: string;
  upiId: string;
  /** INR invoices only, as before; a client with only INR invoices gets exactly today's view. */
  lines: StatementLine[];
  totalPaise: number;
  overduePaise: number;
  /** Present only when the client has open foreign-currency invoices: one section per currency, CURRENCIES order. */
  foreign?: ForeignStatementSection[];
  /** With `foreign`, when every section's currency uses the same details: those details. */
  pay?: IntlPayDetails;
  /** With `foreign`, when the currencies use different details: each currency's own (then `pay` is absent). */
  payByCurrency?: Partial<Record<ForeignCurrency, IntlPayDetails>>;
  /** With `foreign`, when any foreign line is marked `export`: the GST export line. */
  exportNote?: string;
}

const openView = (v: InvoiceView) => v.balancePaise > 0 && v.state !== "void";
const byDue = (a: InvoiceView, b: InvoiceView) => a.invoice.dueDate.localeCompare(b.invoice.dueDate) || a.invoice.issueDate.localeCompare(b.invoice.issueDate);
const lineOf = (v: InvoiceView): StatementLine => ({ number: v.invoice.number, issueDate: v.invoice.issueDate, dueDate: v.invoice.dueDate, balancePaise: v.balancePaise, overdue: v.state === "overdue" });
const sumOf = (lines: StatementLine[]) => lines.reduce((sum, l) => sum + l.balancePaise, 0);
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Open invoices for one client, oldest due first. No client identity and no descriptions (they often contain
 * names). The INR lines and total are exactly today's; each foreign currency gets its own section with the
 * business's details for it, so a client who owes only US$ never reads "Paid".
 */
export function statementView(ws: Workspace, clientId: string, today: string): StatementView | null {
  const client = Object.prototype.hasOwnProperty.call(ws.clients, clientId) ? ws.clients[clientId] : undefined;
  if (!client || client.deletedAt) return null;
  const lines = liveInvoices(ws)
    .filter((inv) => inv.clientId === clientId)
    .map((inv) => viewInvoice(inv, ws.clients, today))
    .filter(openView)
    .sort(byDue)
    .map(lineOf);
  const view: StatementView = {
    merchantName: ws.business.name.trim() || "Merchant",
    upiId: ws.business.upiId.trim(),
    lines,
    totalPaise: sumOf(lines),
    overduePaise: sumOf(lines.filter((l) => l.overdue)),
  };
  const foreignViews = allLiveInvoices(ws)
    .filter((inv) => inv.clientId === clientId && currencyOf(inv) !== "INR")
    .map((inv) => viewInvoice(inv, ws.clients, today))
    .filter(openView)
    .sort(byDue);
  if (!foreignViews.length) return view;
  let note = "";
  const foreign: ForeignStatementSection[] = [];
  for (const currency of FOREIGN_CURRENCIES) {
    const sectionLines = foreignViews.filter((v) => v.currency === currency).map((v) => {
      const exportLine = invoiceExportNote(ws, v.invoice);
      if (exportLine) note ||= exportLine;
      return exportLine ? { ...lineOf(v), export: true as const } : lineOf(v);
    });
    if (sectionLines.length) foreign.push({ currency, lines: sectionLines, totalMinor: sumOf(sectionLines), overdueMinor: sumOf(sectionLines.filter((l) => l.overdue)) });
  }
  const details = foreign.map((s) => publicPayDetails(ws.intl?.settings, s.currency));
  const shared = details.every((d) => sameJson(d, details[0]));
  return {
    ...view,
    foreign,
    ...(shared ? { pay: details[0] } : { payByCurrency: Object.fromEntries(foreign.map((s, i) => [s.currency, details[i]])) }),
    ...(note ? { exportNote: note } : {}),
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
  const view = statementView(ws, clientId, "1970-01-01");
  if (!view) return { status: "missing_client", message: "This client hasn't synced yet. Wait a moment and try again." };
  const foreign = view.foreign ?? [];
  if (view.totalPaise <= 0 && !foreign.length) return { status: "no_balance", message: "This client has nothing due." };
  const qualified = key !== statementSubject(clientId);
  // Allowed when the ₹ part can be paid by UPI, or every foreign currency the client owes in can be paid with the
  // saved international details (§4.2). Otherwise the refusal matches the client's invoices.
  const inrPayable = view.totalPaise > 0 && validVpa(view.upiId);
  const foreignPayable = foreign.length > 0 && foreign.every((section) => intlPayable(ws.intl?.settings, section.currency));
  if (!inrPayable && !foreignPayable) {
    return view.totalPaise > 0
      ? { status: "no_upi", message: qualified ? noUpiFor(ws) : "Add your UPI ID in Settings before sharing links." }
      : { status: "no_intl", message: qualified ? noIntlFor(ws) : NO_INTL };
  }
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

/** A foreign-currency link without international payment details (no_intl); the client tr()s both texts. */
export const NO_INTL = "Add international payment details in Settings before sharing pay links for foreign-currency invoices.";
/** no_intl for a non-primary book; the client translates the template with its own { business } (paylinkClient). */
export const NO_INTL_FOR = "Add international payment details for {business} in Settings before sharing pay links.";

const noIntlFor = (ws: Workspace) => NO_INTL_FOR.replace("{business}", () => ws.business.name.trim() || "this business");

/**
 * Claims waiting per business, for the switcher badge. Until the UI shows foreign-currency claim cards (PR 4),
 * claims on foreign links (they always carry `currency`) are left out, so the badge never counts a claim the
 * screen can't show, confirm or dismiss.
 */
export function pendingClaimCounts(links: Record<string, { claims: readonly { currency?: string }[] }>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [key, link] of Object.entries(links)) {
    const { bookId } = parseLinkKey(key);
    counts[bookId] = (counts[bookId] ?? 0) + link.claims.filter((claim) => !claim.currency).length;
  }
  return counts;
}

/**
 * Primary records stay byte-identical ({ owner, invoiceId, createdAt }); other books also carry businessId, and a
 * link for a foreign-currency invoice carries intl: 1 (INR records never do).
 */
function recordFor(owner: string, key: string, now: number, intl = false): PaylinkRecord {
  const { bookId } = parseLinkKey(key);
  if (!bookId) throw new RangeError("Invalid pay-link key.");
  const record: PaylinkRecord = bookId === PRIMARY_BOOK_ID ? { owner, invoiceId: key, createdAt: now } : { owner, invoiceId: key, createdAt: now, businessId: bookId };
  return intl ? { ...record, intl: 1 } : record;
}

export type CreateResult =
  | { status: "ok"; token: string; created: boolean }
  | { status: "missing_invoice" | "missing_client" | "not_pro" | "no_balance" | "no_upi" | "no_intl" | "limit"; message: string };

/** HTTP status of a refused link creation (no_intl is a 409 like no_upi). */
export function createStatusCode(status: Exclude<CreateResult["status"], "ok">): number {
  return status === "limit" || status === "not_pro" ? 402 : 409;
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
  const view = payPageView(ws, invoiceId, "1970-01-01");
  const foreign = view ? null : foreignPayView(ws, invoiceId, "1970-01-01");
  if (!view && !foreign) return { status: "missing_invoice", message: "This invoice hasn't synced yet. Wait a moment and try again." };
  if (view && (view.state === "void" || view.balancePaise <= 0)) return { status: "no_balance", message: "Nothing is due on this invoice." };
  if (foreign && (foreign.state === "void" || foreign.balanceMinor <= 0)) return { status: "no_balance", message: "Nothing is due on this invoice." };
  // INR: the UPI ID, as before. A foreign invoice needs no UPI ID, only payable details for its currency.
  if (view && !validVpa(view.upiId)) return { status: "no_upi", message: key !== invoiceId ? noUpiFor(ws) : "Add your UPI ID in Settings before sharing pay links." };
  if (foreign && !intlPayable(ws.intl?.settings, foreign.currency)) return { status: "no_intl", message: key !== invoiceId ? noIntlFor(ws) : NO_INTL };
  const existing = await store.tokenFor(owner, key);
  if (existing && (await store.get(existing))) return { status: "ok", token: existing, created: false };
  const active = Object.keys(await store.list(owner)).length;
  if (active >= activeLimit) {
    return { status: "limit", message: `Free accounts can keep ${activeLimit} pay links active. Revoke links for paid invoices to make room.` };
  }
  const token = newToken();
  await store.put(token, recordFor(owner, key, now, Boolean(foreign)));
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
  // 40: a transfer reference (a UETR is 36); a UPI UTR is at most 35, as before.
  const claim: PaylinkClaim = { utr: r.utr.slice(0, 40), amountPaise: amount, at: r.at };
  return isForeignCurrency(r.currency) ? { ...claim, currency: r.currency } : claim;
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
  if (r.intl === 1) record.intl = 1;
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

/**
 * "invoice" and "statement" are INR-only and keep today's bytes. "foreign" (a foreign-currency invoice) and
 * "statement2" (a statement with `foreign` sections) are kinds no older page parses: a rollback answers 404
 * from them rather than a ₹ QR or "Paid" (docs/spec-foreign-clients.md §4.1).
 */
export type PaylinkSnapshot =
  | { kind: "invoice"; view: PayPageView }
  | { kind: "statement"; view: StatementView }
  | { kind: "statement2"; view: StatementView }
  | { kind: "foreign"; view: ForeignPayView };

/** Today-independent snapshot for a link subject (invoice id or "stmt:<clientId>"), or null if gone. */
export function snapshotFor(ws: Workspace, subject: string): PaylinkSnapshot | null {
  const s = subjectOf(subject);
  if (s.kind === "statement") {
    const view = statementView(ws, s.clientId, "0000-01-01");
    return view ? (view.foreign ? { kind: "statement2", view } : { kind: "statement", view }) : null;
  }
  const view = payPageView(ws, s.invoiceId, "0000-01-01");
  if (view) return { kind: "invoice", view };
  const foreign = foreignPayView(ws, s.invoiceId, "0000-01-01");
  return foreign ? { kind: "foreign", view: foreign } : null;
}

const withOverdue = (lines: StatementLine[], today: string) => lines.map((line) => ({ ...line, overdue: line.dueDate < today }));
const stateAsOf = (state: InvoiceState, dueDate: string, balance: number, amount: number, today: string): InvoiceState =>
  state === "paid" || state === "void" ? state : dueDate && dueDate < today ? "overdue" : balance < amount ? "partial" : "due";

/** The snapshot as of `today`: same result as computing from the full workspace. */
export function snapshotView(snapshot: PaylinkSnapshot, today: string): PaylinkSnapshot {
  if (snapshot.kind === "statement" || snapshot.kind === "statement2") {
    const lines = withOverdue(snapshot.view.lines, today);
    const view: StatementView = { ...snapshot.view, lines, overduePaise: sumOf(lines.filter((l) => l.overdue)) };
    if (snapshot.kind === "statement") return { kind: "statement", view };
    const foreign = (snapshot.view.foreign ?? []).map((section) => {
      const sectionLines = withOverdue(section.lines, today);
      return { ...section, lines: sectionLines, overdueMinor: sumOf(sectionLines.filter((l) => l.overdue)) };
    });
    return { kind: "statement2", view: { ...view, foreign } };
  }
  if (snapshot.kind === "foreign") {
    const v = snapshot.view;
    return { kind: "foreign", view: { ...v, state: stateAsOf(v.state, v.dueDate, v.balanceMinor, v.amountMinor, today) } };
  }
  const v = snapshot.view;
  return { kind: "invoice", view: { ...v, state: stateAsOf(v.state, v.dueDate, v.balancePaise, v.amountPaise, today) } };
}

const isMinor = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const isRecord = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);

/** The foreign parts a page renders are checked (currency, amounts, section shape); the rest is trusted as before. */
function foreignShapeOk(kind: unknown, view: Record<string, unknown>): boolean {
  if (kind === "foreign") return isForeignCurrency(view.currency) && isMinor(view.amountMinor) && isMinor(view.balanceMinor) && isRecord(view.pay);
  if (kind !== "statement2") return true;
  return Array.isArray(view.lines) && Array.isArray(view.foreign) && view.foreign.length > 0 && view.foreign.every((section) =>
    isRecord(section) && isForeignCurrency(section.currency) && Array.isArray(section.lines) && isMinor(section.totalMinor));
}

export function parseSnapshot(raw: unknown): PaylinkSnapshot | null {
  const value = typeof raw === "string" ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw;
  if (!value || typeof value !== "object") return null;
  const r = value as { kind?: unknown; view?: unknown };
  if (r.kind !== "invoice" && r.kind !== "statement" && r.kind !== "statement2" && r.kind !== "foreign") return null;
  return isRecord(r.view) && foreignShapeOk(r.kind, r.view) ? (value as PaylinkSnapshot) : null;
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
