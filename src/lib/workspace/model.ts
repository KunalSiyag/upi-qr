/**
 * Payments workspace domain model — pure functions, no DOM, no storage.
 *
 * Money is integer paise everywhere. Dates are ISO calendar days
 * ("YYYY-MM-DD") compared as UTC midnights so results do not drift with the
 * viewer's timezone. Every record carries `updatedAt` (epoch ms) and deletes
 * are tombstones (`deletedAt`) so two copies of a workspace (this browser,
 * another device, the cloud) can be merged last-writer-wins per record.
 *
 * Imported by the browser island and by scripts/workspace.test.mjs, so keep
 * this file free of runtime imports.
 */

export const WORKSPACE_VERSION = 1;
export const MSMED_CREDIT_DAYS = 45;

export type PaymentMode = "upi" | "cash" | "bank" | "card" | "cheque" | "other";
export const PAYMENT_MODES: readonly PaymentMode[] = ["upi", "cash", "bank", "card", "cheque", "other"];

export interface Business {
  name: string;
  upiId: string;
  phone: string;
  gstin: string;
  invoicePrefix: string;
  updatedAt: number;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  email: string;
  gstin: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface Payment {
  id: string;
  amountPaise: number;
  date: string;
  mode: PaymentMode;
  reference: string;
  createdAt: number;
}

export interface ReminderLog {
  at: number;
  channel: "whatsapp" | "sms" | "email" | "copy";
}

export interface Invoice {
  id: string;
  number: string;
  clientId: string;
  issueDate: string;
  dueDate: string;
  amountPaise: number;
  description: string;
  payments: Payment[];
  reminders: ReminderLog[];
  voided: boolean;
  /** Set on invoices generated from a monthly plan. */
  recurringId?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

/** "Bill this client every month" — tuition fees, rent, memberships, maintenance. */
export interface RecurringPlan {
  id: string;
  clientId: string;
  amountPaise: number;
  description: string;
  /** Issue day of the month, 1–28 so every month has it. */
  dayOfMonth: number;
  dueAfterDays: number;
  /** First month to bill, "YYYY-MM". */
  startMonth: string;
  /** Last month to bill, "YYYY-MM", or "" for no end. */
  endMonth: string;
  paused: boolean;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface Workspace {
  version: number;
  business: Business;
  clients: Record<string, Client>;
  invoices: Record<string, Invoice>;
  recurring: Record<string, RecurringPlan>;
}

export type InvoiceState = "paid" | "void" | "overdue" | "partial" | "due";

export interface InvoiceView {
  invoice: Invoice;
  client: Client | undefined;
  paidPaise: number;
  balancePaise: number;
  state: InvoiceState;
  /** Positive when overdue, 0 on the due date, negative before it. */
  daysPastDue: number;
}

// ---------------------------------------------------------------------------
// Construction

export function emptyBusiness(now = 0): Business {
  return { name: "", upiId: "", phone: "", gstin: "", invoicePrefix: "INV-", updatedAt: now };
}

export function emptyWorkspace(now = 0): Workspace {
  return { version: WORKSPACE_VERSION, business: emptyBusiness(now), clients: {}, invoices: {}, recurring: {} };
}

export function newId(prefix: string): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replace(/-/g, "")
    : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  return `${prefix}_${random.slice(0, 20)}`;
}

// ---------------------------------------------------------------------------
// Money and dates

/** Exact rupee-string → paise. Accepts "1,250.5" style input; null if invalid. */
export function parseRupeesToPaise(input: string): number | null {
  const value = input.replace(/[,\s₹]/g, "");
  const match = /^(\d{1,10})(?:\.(\d{0,2}))?$/.exec(value);
  if (!match) return null;
  const paise = Number(match[1]) * 100 + Number((match[2] || "").padEnd(2, "0"));
  return Number.isSafeInteger(paise) ? paise : null;
}

/** ₹ with Indian digit grouping; paise shown only when non-zero. */
export function formatPaise(paise: number): string {
  const negative = paise < 0;
  const abs = Math.abs(Math.trunc(paise));
  const rupees = Math.floor(abs / 100);
  const rem = abs % 100;
  const grouped = new Intl.NumberFormat("en-IN").format(rupees);
  return `${negative ? "−" : ""}₹${grouped}${rem ? `.${String(rem).padStart(2, "0")}` : ""}`;
}

/** Plain decimal for form fields and UPI `am` (e.g. 125050 → "1250.50"). */
export function paiseToDecimal(paise: number): string {
  return `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, "0")}`;
}

const DAY_MS = 86_400_000;

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function dayNumber(iso: string): number {
  return Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return dayNumber(toIso) - dayNumber(fromIso);
}

export function addDays(iso: string, days: number): string {
  return new Date((dayNumber(iso) + days) * DAY_MS).toISOString().slice(0, 10);
}

/** The viewer's local calendar day as ISO (what "today" means to a shop owner). */
export function localToday(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ---------------------------------------------------------------------------
// Derived invoice state

export function paidPaise(invoice: Invoice): number {
  return invoice.payments.reduce((sum, p) => sum + p.amountPaise, 0);
}

export function viewInvoice(invoice: Invoice, clients: Record<string, Client>, today: string): InvoiceView {
  const paid = paidPaise(invoice);
  const balance = Math.max(0, invoice.amountPaise - paid);
  const daysPastDue = daysBetween(invoice.dueDate, today);
  let state: InvoiceState;
  if (invoice.voided) state = "void";
  else if (balance === 0) state = "paid";
  else if (daysPastDue > 0) state = "overdue";
  else if (paid > 0) state = "partial";
  else state = "due";
  return { invoice, client: clients[invoice.clientId], paidPaise: paid, balancePaise: invoice.voided ? 0 : balance, state, daysPastDue };
}

export function liveInvoices(ws: Workspace): Invoice[] {
  return Object.values(ws.invoices).filter((invoice) => !invoice.deletedAt);
}

export function liveClients(ws: Workspace): Client[] {
  return Object.values(ws.clients).filter((client) => !client.deletedAt).sort((a, b) => a.name.localeCompare(b.name));
}

export function invoiceViews(ws: Workspace, today: string): InvoiceView[] {
  return liveInvoices(ws)
    .map((invoice) => viewInvoice(invoice, ws.clients, today))
    .sort((a, b) => b.invoice.issueDate.localeCompare(a.invoice.issueDate) || b.invoice.createdAt - a.invoice.createdAt);
}

export interface AgingBucket {
  key: "current" | "d1_15" | "d16_30" | "d31_45" | "d45_plus";
  label: string;
  balancePaise: number;
  count: number;
}

/** Buckets by days past due; 45+ is where MSMED Act interest applies to B2B dues. */
export function agingBuckets(views: InvoiceView[]): AgingBucket[] {
  const buckets: AgingBucket[] = [
    { key: "current", label: "Not yet due", balancePaise: 0, count: 0 },
    { key: "d1_15", label: "1–15 days late", balancePaise: 0, count: 0 },
    { key: "d16_30", label: "16–30 days late", balancePaise: 0, count: 0 },
    { key: "d31_45", label: "31–45 days late", balancePaise: 0, count: 0 },
    { key: "d45_plus", label: "45+ days late", balancePaise: 0, count: 0 },
  ];
  for (const view of views) {
    if (view.balancePaise === 0) continue;
    const d = view.daysPastDue;
    const bucket = d <= 0 ? buckets[0] : d <= 15 ? buckets[1] : d <= 30 ? buckets[2] : d <= MSMED_CREDIT_DAYS ? buckets[3] : buckets[4];
    bucket.balancePaise += view.balancePaise;
    bucket.count += 1;
  }
  return buckets;
}

export interface Summary {
  outstandingPaise: number;
  overduePaise: number;
  overdueCount: number;
  dueSoonPaise: number;
  dueSoonCount: number;
  collectedThisMonthPaise: number;
  openCount: number;
}

export function summarize(views: InvoiceView[], today: string, dueSoonDays = 7): Summary {
  const month = today.slice(0, 7);
  const summary: Summary = {
    outstandingPaise: 0, overduePaise: 0, overdueCount: 0,
    dueSoonPaise: 0, dueSoonCount: 0, collectedThisMonthPaise: 0, openCount: 0,
  };
  for (const view of views) {
    if (!view.invoice.voided) {
      for (const payment of view.invoice.payments) {
        if (payment.date.slice(0, 7) === month) summary.collectedThisMonthPaise += payment.amountPaise;
      }
    }
    if (view.balancePaise === 0) continue;
    summary.openCount += 1;
    summary.outstandingPaise += view.balancePaise;
    if (view.state === "overdue") {
      summary.overduePaise += view.balancePaise;
      summary.overdueCount += 1;
    } else if (view.daysPastDue >= -dueSoonDays) {
      summary.dueSoonPaise += view.balancePaise;
      summary.dueSoonCount += 1;
    }
  }
  return summary;
}

/** Overdue first, oldest and largest first — the order to chase payments in. */
export function chaseList(views: InvoiceView[]): InvoiceView[] {
  return views
    .filter((view) => view.state === "overdue" || (view.balancePaise > 0 && view.daysPastDue === 0))
    .sort((a, b) => b.daysPastDue - a.daysPastDue || b.balancePaise - a.balancePaise);
}

export function clientBalances(views: InvoiceView[]): Map<string, { balancePaise: number; overduePaise: number; open: number }> {
  const map = new Map<string, { balancePaise: number; overduePaise: number; open: number }>();
  for (const view of views) {
    if (view.balancePaise === 0) continue;
    const entry = map.get(view.invoice.clientId) ?? { balancePaise: 0, overduePaise: 0, open: 0 };
    entry.balancePaise += view.balancePaise;
    if (view.state === "overdue") entry.overduePaise += view.balancePaise;
    entry.open += 1;
    map.set(view.invoice.clientId, entry);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Mutations (return new workspaces; never mutate the input)

export function nextInvoiceNumber(ws: Workspace): string {
  const prefix = ws.business.invoicePrefix || "INV-";
  let max = 0;
  let width = 4;
  for (const invoice of liveInvoices(ws)) {
    if (!invoice.number.startsWith(prefix)) continue;
    const digits = /^(\d+)$/.exec(invoice.number.slice(prefix.length))?.[1];
    if (!digits) continue;
    width = Math.max(width, digits.length);
    max = Math.max(max, Number(digits));
  }
  return `${prefix}${String(max + 1).padStart(width, "0")}`;
}

export function upsertClient(ws: Workspace, client: Client, now: number): Workspace {
  return { ...ws, clients: { ...ws.clients, [client.id]: { ...client, updatedAt: now } } };
}

export function upsertInvoice(ws: Workspace, invoice: Invoice, now: number): Workspace {
  return { ...ws, invoices: { ...ws.invoices, [invoice.id]: { ...invoice, updatedAt: now } } };
}

export function updateBusiness(ws: Workspace, patch: Partial<Omit<Business, "updatedAt">>, now: number): Workspace {
  return { ...ws, business: { ...ws.business, ...patch, updatedAt: now } };
}

export function addPayment(ws: Workspace, invoiceId: string, payment: Omit<Payment, "id" | "createdAt">, now: number): Workspace {
  const invoice = ws.invoices[invoiceId];
  if (!invoice || invoice.deletedAt) return ws;
  if (!Number.isSafeInteger(payment.amountPaise) || payment.amountPaise <= 0) return ws;
  const record: Payment = { ...payment, id: newId("pay"), createdAt: now };
  return upsertInvoice(ws, { ...invoice, payments: [...invoice.payments, record] }, now);
}

/**
 * Spreads one payment from a client across their open invoices, oldest due
 * first (how a statement payment is applied). Any excess is reported, not recorded.
 */
export function allocatePayment(
  ws: Workspace,
  clientId: string,
  amountPaise: number,
  payment: Omit<Payment, "id" | "createdAt" | "amountPaise">,
  today: string,
  now: number,
): { ws: Workspace; allocations: { invoiceId: string; amountPaise: number }[]; unallocatedPaise: number } {
  const allocations: { invoiceId: string; amountPaise: number }[] = [];
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) return { ws, allocations, unallocatedPaise: 0 };
  const open = liveInvoices(ws)
    .filter((inv) => inv.clientId === clientId)
    .map((inv) => viewInvoice(inv, ws.clients, today))
    .filter((v) => v.balancePaise > 0 && v.state !== "void")
    .sort((a, b) => a.invoice.dueDate.localeCompare(b.invoice.dueDate) || a.invoice.issueDate.localeCompare(b.invoice.issueDate));
  let left = amountPaise;
  let next = ws;
  for (const view of open) {
    if (left <= 0) break;
    const part = Math.min(left, view.balancePaise);
    next = addPayment(next, view.invoice.id, { ...payment, amountPaise: part }, now);
    allocations.push({ invoiceId: view.invoice.id, amountPaise: part });
    left -= part;
  }
  return { ws: next, allocations, unallocatedPaise: left };
}

export interface ReceiptPayment {
  receiptNo: string;
  date: string;
  customer: string;
  customerPhone: string;
  amountPaise: number;
  mode: PaymentMode;
  /** UTR, cheque, or bank reference printed on the receipt; may be empty. */
  reference: string;
  description: string;
}

/**
 * Records a receipt from the receipt generator. The payment first settles the
 * client's open invoices, oldest due first (so a receipt marks what you were
 * chasing as paid); anything left over becomes a paid entry numbered like the
 * receipt. The payment reference is the receipt's UTR/cheque number when it has
 * one (so a bank statement import later skips that credit), else
 * "Receipt <no>"; the same reference on the same client means it's already
 * recorded, and nothing changes.
 */
export function recordReceiptPayment(
  ws: Workspace,
  receipt: ReceiptPayment,
  today: string,
  now: number,
): { ws: Workspace; clientId: string; appliedPaise: number; entryId: string | null; duplicate: boolean } | null {
  const number = receipt.receiptNo.trim().slice(0, 40);
  const name = receipt.customer.trim().slice(0, 80);
  if (!number || !name || !isIsoDate(receipt.date) || !Number.isSafeInteger(receipt.amountPaise) || receipt.amountPaise <= 0) return null;
  const phone = receipt.customerPhone.replace(/[^\d+]/g, "").slice(0, 15);
  let next = ws;
  let client = findClient(next, name, phone);
  if (!client) {
    client = { id: newId("cli"), name, phone, email: "", gstin: "", createdAt: now, updatedAt: now };
    next = upsertClient(next, client, now);
  } else if (!client.phone && phone) {
    client = { ...client, phone, updatedAt: now };
    next = upsertClient(next, client, now);
  }
  const reference = (receipt.reference.trim() || `Receipt ${number}`).slice(0, 60);
  const clientId = client.id;
  const recorded = liveInvoices(next).some((inv) => inv.clientId === clientId && inv.payments.some((p) => p.reference.trim() === reference));
  if (recorded) return { ws, clientId, appliedPaise: 0, entryId: null, duplicate: true };

  const payment = { date: receipt.date, mode: receipt.mode, reference };
  const allocated = allocatePayment(next, clientId, receipt.amountPaise, payment, today, now);
  next = allocated.ws;
  let entryId: string | null = null;
  if (allocated.unallocatedPaise > 0) {
    entryId = newId("inv");
    next = upsertInvoice(next, {
      id: entryId, number, clientId, issueDate: receipt.date, dueDate: receipt.date, amountPaise: allocated.unallocatedPaise,
      description: receipt.description.trim().slice(0, 300), payments: [], reminders: [], voided: false, createdAt: now, updatedAt: now,
    }, now);
    next = addPayment(next, entryId, { ...payment, amountPaise: allocated.unallocatedPaise }, now);
  }
  return { ws: next, clientId, appliedPaise: receipt.amountPaise - allocated.unallocatedPaise, entryId, duplicate: false };
}

export function removePayment(ws: Workspace, invoiceId: string, paymentId: string, now: number): Workspace {
  const invoice = ws.invoices[invoiceId];
  if (!invoice) return ws;
  return upsertInvoice(ws, { ...invoice, payments: invoice.payments.filter((p) => p.id !== paymentId) }, now);
}

export function logReminder(ws: Workspace, invoiceId: string, channel: ReminderLog["channel"], now: number): Workspace {
  const invoice = ws.invoices[invoiceId];
  if (!invoice) return ws;
  return upsertInvoice(ws, { ...invoice, reminders: [...invoice.reminders, { at: now, channel }].slice(-20) }, now);
}

export function deleteInvoice(ws: Workspace, invoiceId: string, now: number): Workspace {
  const invoice = ws.invoices[invoiceId];
  if (!invoice) return ws;
  return upsertInvoice(ws, { ...invoice, deletedAt: now }, now);
}

/** Tombstones the client; refuses while live invoices still reference it. */
export function deleteClient(ws: Workspace, clientId: string, now: number): Workspace {
  const client = ws.clients[clientId];
  if (!client) return ws;
  if (liveInvoices(ws).some((invoice) => invoice.clientId === clientId)) return ws;
  return upsertClient(ws, { ...client, deletedAt: now }, now);
}

/** Tombstones every record (so merges with other copies honour the erase) and clears business details. */
export function eraseWorkspace(ws: Workspace, now: number): Workspace {
  return {
    version: ws.version,
    business: { ...emptyBusiness(now) },
    clients: Object.fromEntries(Object.entries(ws.clients).map(([id, c]) => [id, c.deletedAt ? c : { ...c, deletedAt: now, updatedAt: now }])),
    invoices: Object.fromEntries(Object.entries(ws.invoices).map(([id, i]) => [id, i.deletedAt ? i : { ...i, deletedAt: now, updatedAt: now }])),
    recurring: Object.fromEntries(Object.entries(ws.recurring).map(([id, r]) => [id, r.deletedAt ? r : { ...r, deletedAt: now, updatedAt: now }])),
  };
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().filter((k) => record[k] !== undefined).map((k) => [k, sortKeysDeep(record[k])]));
  }
  return value;
}

/**
 * Same content always serializes identically (keys sorted at every depth), so
 * tabs and the sync engine can compare copies by string without ping-pong writes.
 */
export function canonicalJson(ws: Workspace): string {
  return JSON.stringify(sortKeysDeep(ws));
}

/** Finds a live client by phone (last 10 digits) or exact name, for de-duplication. */
export function findClient(ws: Workspace, name: string, phone: string): Client | undefined {
  const digits = phone.replace(/\D/g, "").slice(-10);
  const lower = name.trim().toLowerCase();
  return liveClients(ws).find((client) =>
    (digits.length === 10 && client.phone.replace(/\D/g, "").slice(-10) === digits) ||
    (lower !== "" && client.name.trim().toLowerCase() === lower)
  );
}

// ---------------------------------------------------------------------------
// Sync: last-writer-wins per record, tombstones win ties.

function pickNewer<T extends { updatedAt: number; deletedAt?: number }>(a: T | undefined, b: T | undefined): T | undefined {
  if (!a) return b;
  if (!b) return a;
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
  return b.deletedAt && !a.deletedAt ? b : a;
}

export function mergeWorkspaces(a: Workspace, b: Workspace): Workspace {
  const clients: Record<string, Client> = {};
  for (const id of new Set([...Object.keys(a.clients), ...Object.keys(b.clients)])) {
    clients[id] = pickNewer(a.clients[id], b.clients[id])!;
  }
  const invoices: Record<string, Invoice> = {};
  for (const id of new Set([...Object.keys(a.invoices), ...Object.keys(b.invoices)])) {
    invoices[id] = pickNewer(a.invoices[id], b.invoices[id])!;
  }
  const recurring: Record<string, RecurringPlan> = {};
  for (const id of new Set([...Object.keys(a.recurring), ...Object.keys(b.recurring)])) {
    recurring[id] = pickNewer(a.recurring[id], b.recurring[id])!;
  }
  return {
    version: Math.max(a.version, b.version),
    business: b.business.updatedAt > a.business.updatedAt ? b.business : a.business,
    clients,
    invoices,
    recurring,
  };
}

/**
 * Explicit restore from a backup: like a merge, but a live record in the backup
 * also brings back a record this copy has deleted (bumped to `now` so the
 * restore wins in later syncs too).
 */
export function restoreFrom(current: Workspace, backup: Workspace, now: number): Workspace {
  const merged = mergeWorkspaces(current, backup);
  for (const [id, client] of Object.entries(backup.clients)) {
    if (!client.deletedAt && merged.clients[id]?.deletedAt) merged.clients[id] = { ...client, updatedAt: now };
  }
  for (const [id, invoice] of Object.entries(backup.invoices)) {
    if (!invoice.deletedAt && merged.invoices[id]?.deletedAt) merged.invoices[id] = { ...invoice, updatedAt: now };
  }
  for (const [id, plan] of Object.entries(backup.recurring)) {
    if (!plan.deletedAt && merged.recurring[id]?.deletedAt) merged.recurring[id] = { ...plan, updatedAt: now };
  }
  if (!merged.business.name && backup.business.name) merged.business = { ...backup.business, updatedAt: now };
  return merged;
}

/** Drops tombstones older than `maxAgeDays` so storage does not grow forever. */
export function pruneTombstones(ws: Workspace, now: number, maxAgeDays = 90): Workspace {
  const cutoff = now - maxAgeDays * DAY_MS;
  const keep = <T extends { deletedAt?: number }>(record: T) => !record.deletedAt || record.deletedAt > cutoff;
  return {
    ...ws,
    clients: Object.fromEntries(Object.entries(ws.clients).filter(([, c]) => keep(c))),
    invoices: Object.fromEntries(Object.entries(ws.invoices).filter(([, i]) => keep(i))),
    recurring: Object.fromEntries(Object.entries(ws.recurring).filter(([, r]) => keep(r))),
  };
}

// ---------------------------------------------------------------------------
// Validation of untrusted input (localStorage, imported backups, cloud copies)

const str = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : "");
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const paise = (value: unknown) => (typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 100_000_000_000 ? value : null);

function sanitizePayment(raw: unknown): Payment | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const amount = paise(r.amountPaise);
  const date = str(r.date, 10);
  if (!amount || !isIsoDate(date)) return null;
  const mode = PAYMENT_MODES.includes(r.mode as PaymentMode) ? (r.mode as PaymentMode) : "other";
  return { id: str(r.id, 40) || newId("pay"), amountPaise: amount, date, mode, reference: str(r.reference, 60), createdAt: num(r.createdAt) };
}

function sanitizeClient(id: string, raw: unknown): Client | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = str(r.name, 80).trim();
  if (!name) return null;
  const client: Client = {
    id, name, phone: str(r.phone, 20), email: str(r.email, 120), gstin: str(r.gstin, 15),
    createdAt: num(r.createdAt), updatedAt: num(r.updatedAt),
  };
  if (num(r.deletedAt)) client.deletedAt = num(r.deletedAt);
  return client;
}

function sanitizeInvoice(id: string, raw: unknown): Invoice | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const amount = paise(r.amountPaise);
  const issueDate = str(r.issueDate, 10);
  const dueDate = str(r.dueDate, 10);
  if (amount === null || !isIsoDate(issueDate) || !isIsoDate(dueDate)) return null;
  const payments = Array.isArray(r.payments) ? r.payments.map(sanitizePayment).filter((p): p is Payment => p !== null).slice(0, 200) : [];
  const reminders = Array.isArray(r.reminders)
    ? r.reminders.filter((x): x is ReminderLog => !!x && typeof x === "object" && typeof (x as ReminderLog).at === "number").slice(-20)
    : [];
  const invoice: Invoice = {
    id, number: str(r.number, 40), clientId: str(r.clientId, 40), issueDate, dueDate, amountPaise: amount,
    description: str(r.description, 300), payments, reminders, voided: r.voided === true,
    createdAt: num(r.createdAt), updatedAt: num(r.updatedAt),
  };
  if (typeof r.recurringId === "string" && ID_RE.test(r.recurringId)) invoice.recurringId = r.recurringId;
  if (num(r.deletedAt)) invoice.deletedAt = num(r.deletedAt);
  return invoice;
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function sanitizePlan(id: string, raw: unknown): RecurringPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const amount = paise(r.amountPaise);
  const startMonth = str(r.startMonth, 7);
  const endMonth = str(r.endMonth, 7);
  const day = Math.trunc(num(r.dayOfMonth));
  if (!amount || !MONTH_RE.test(startMonth) || (endMonth && !MONTH_RE.test(endMonth)) || day < 1 || day > 28) return null;
  const plan: RecurringPlan = {
    id, clientId: str(r.clientId, 40), amountPaise: amount, description: str(r.description, 300), dayOfMonth: day,
    dueAfterDays: Math.min(90, Math.max(0, Math.trunc(num(r.dueAfterDays)))), startMonth, endMonth, paused: r.paused === true,
    createdAt: num(r.createdAt), updatedAt: num(r.updatedAt),
  };
  if (num(r.deletedAt)) plan.deletedAt = num(r.deletedAt);
  return plan;
}

const ID_RE = /^[a-z]{2,8}_[A-Za-z0-9]{6,40}$/;

/** Returns a well-formed workspace from untrusted JSON, dropping bad records. */
export function sanitizeWorkspace(raw: unknown): Workspace {
  const ws = emptyWorkspace();
  if (!raw || typeof raw !== "object") return ws;
  const r = raw as Record<string, unknown>;
  const b = (r.business && typeof r.business === "object" ? r.business : {}) as Record<string, unknown>;
  ws.business = {
    name: str(b.name, 80), upiId: str(b.upiId, 100), phone: str(b.phone, 20), gstin: str(b.gstin, 15),
    invoicePrefix: str(b.invoicePrefix, 12) || "INV-", updatedAt: num(b.updatedAt),
  };
  const clients = (r.clients && typeof r.clients === "object" ? r.clients : {}) as Record<string, unknown>;
  for (const [id, value] of Object.entries(clients).slice(0, 5000)) {
    if (!ID_RE.test(id)) continue;
    const client = sanitizeClient(id, value);
    if (client) ws.clients[id] = client;
  }
  const invoices = (r.invoices && typeof r.invoices === "object" ? r.invoices : {}) as Record<string, unknown>;
  for (const [id, value] of Object.entries(invoices).slice(0, 20000)) {
    if (!ID_RE.test(id)) continue;
    const invoice = sanitizeInvoice(id, value);
    if (invoice) ws.invoices[id] = invoice;
  }
  const recurring = (r.recurring && typeof r.recurring === "object" ? r.recurring : {}) as Record<string, unknown>;
  for (const [id, value] of Object.entries(recurring).slice(0, 2000)) {
    if (!ID_RE.test(id)) continue;
    const plan = sanitizePlan(id, value);
    if (plan) ws.recurring[id] = plan;
  }
  return ws;
}

// ---------------------------------------------------------------------------
// Recurring monthly invoices

export const MAX_BACKFILL_MONTHS = 12;

export function liveRecurring(ws: Workspace): RecurringPlan[] {
  return Object.values(ws.recurring).filter((plan) => !plan.deletedAt);
}

export function upsertPlan(ws: Workspace, plan: RecurringPlan, now: number): Workspace {
  return { ...ws, recurring: { ...ws.recurring, [plan.id]: { ...plan, updatedAt: now } } };
}

function monthIndex(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return y * 12 + (m - 1);
}

function monthFromIndex(index: number): string {
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** Same id on every device for a plan's month, so offline devices converge instead of duplicating. */
export function recurringInvoiceId(planId: string, month: string): string {
  return `inv_${planId.split("_")[1]}M${month.replace("-", "")}`;
}

/**
 * Creates every due invoice for active plans up to `today` (newest
 * MAX_BACKFILL_MONTHS at most). Months that already have an invoice — or had
 * one the user deleted — are skipped, so this is safe to run on every load.
 */
export function generateRecurring(ws: Workspace, today: string, now: number): { ws: Workspace; created: string[] } {
  const created: string[] = [];
  let next = ws;
  const todayIndex = monthIndex(today.slice(0, 7));
  for (const plan of liveRecurring(ws)) {
    if (plan.paused || !next.clients[plan.clientId] || next.clients[plan.clientId].deletedAt) continue;
    const last = Math.min(todayIndex, plan.endMonth ? monthIndex(plan.endMonth) : todayIndex);
    const first = Math.max(monthIndex(plan.startMonth), last - MAX_BACKFILL_MONTHS + 1);
    for (let index = first; index <= last; index++) {
      const month = monthFromIndex(index);
      const issueDate = `${month}-${String(plan.dayOfMonth).padStart(2, "0")}`;
      if (issueDate > today) continue;
      const id = recurringInvoiceId(plan.id, month);
      if (next.invoices[id]) continue;
      next = upsertInvoice(next, {
        id,
        number: nextInvoiceNumber(next),
        clientId: plan.clientId,
        issueDate,
        dueDate: addDays(issueDate, plan.dueAfterDays),
        amountPaise: plan.amountPaise,
        description: plan.description,
        payments: [],
        reminders: [],
        voided: false,
        recurringId: plan.id,
        createdAt: now,
        updatedAt: now,
      }, now);
      created.push(id);
    }
  }
  return { ws: next, created };
}

// ---------------------------------------------------------------------------
// Reminders and exports

export type ReminderTone = "friendly" | "due_today" | "overdue" | "final";

export function suggestedTone(view: InvoiceView): ReminderTone {
  if (view.daysPastDue > 30) return "final";
  if (view.daysPastDue > 0) return "overdue";
  if (view.daysPastDue === 0) return "due_today";
  return "friendly";
}

export type ReminderLang = "en" | "hi";

function displayDate(iso: string, lang: ReminderLang = "en"): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/**
 * Plain-text reminder for WhatsApp/SMS, in English or Hindi. Shares the UPI ID
 * as text, never a raw upi://pay link (chat apps mangle them; see AGENTS.md).
 */
export function reminderMessage(view: InvoiceView, business: Business, tone: ReminderTone, payLink?: string, lang: ReminderLang = "en"): string {
  const amount = formatPaise(view.balancePaise);
  const number = view.invoice.number;
  const due = displayDate(view.invoice.dueDate, lang);
  const days = view.daysPastDue;
  const lines: string[] = [];
  if (lang === "hi") {
    const name = view.client?.name || "जी";
    const from = business.name || "हम";
    const opening: Record<ReminderTone, string> = {
      friendly: `नमस्ते ${name}, याद दिला दें कि इनवॉइस ${number} के ${amount} की देय तिथि ${due} है।`,
      due_today: `नमस्ते ${name}, इनवॉइस ${number} के ${amount} आज (${due}) देय हैं।`,
      overdue: `नमस्ते ${name}, इनवॉइस ${number} के ${amount} ${due} को देय थे और अब ${days} दिन से बकाया हैं।`,
      final: `नमस्ते ${name}, इनवॉइस ${number} के ${amount} ${days} दिन से बकाया हैं (देय तिथि ${due})। कृपया जल्द से जल्द भुगतान करें।`,
    };
    lines.push(opening[tone]);
    if (payLink) lines.push(`यहाँ सुरक्षित भुगतान करें: ${payLink}`);
    else if (business.upiId) lines.push(`UPI से भुगतान करें: ${business.upiId}`);
    lines.push(tone === "friendly" ? "धन्यवाद!" : "अगर आपने भुगतान कर दिया है, तो कृपया UTR भेज दें ताकि हम रिकॉर्ड अपडेट कर सकें। धन्यवाद!");
    lines.push(`— ${from}`);
    return lines.join("\n");
  }
  const name = view.client?.name || "there";
  const from = business.name || "us";
  const opening: Record<ReminderTone, string> = {
    friendly: `Hi ${name}, a friendly reminder that invoice ${number} for ${amount} is due on ${due}.`,
    due_today: `Hi ${name}, invoice ${number} for ${amount} is due today (${due}).`,
    overdue: `Hi ${name}, invoice ${number} for ${amount} was due on ${due} and is now ${days} day${days === 1 ? "" : "s"} overdue.`,
    final: `Hi ${name}, invoice ${number} for ${amount} is ${days} days overdue (due ${due}). Please clear it at the earliest to avoid further follow-up.`,
  };
  lines.push(opening[tone]);
  if (payLink) lines.push(`Pay securely here: ${payLink}`);
  else if (business.upiId) lines.push(`Pay by UPI to: ${business.upiId}`);
  lines.push(tone === "friendly" ? "Thank you!" : "If you have already paid, please share the UTR so we can update our records. Thank you!");
  lines.push(`— ${from}`);
  return lines.join("\n");
}

/** wa.me link; 10-digit Indian numbers get the 91 country code. */
export function whatsappLink(phone: string, text: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10) digits = `91${digits}`;
  const base = digits.length >= 11 ? `https://wa.me/${digits}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(text)}`;
}

function csvCell(value: string | number): string {
  const text = String(value);
  // Neutralize spreadsheet formula injection from user-entered text.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function invoicesCsv(views: InvoiceView[]): string {
  const header = ["Invoice", "Client", "Phone", "Issue date", "Due date", "Amount (INR)", "Paid (INR)", "Balance (INR)", "Status", "Days past due", "Description"];
  const rows = views.map((v) => [
    v.invoice.number, v.client?.name ?? "", v.client?.phone ?? "", v.invoice.issueDate, v.invoice.dueDate,
    paiseToDecimal(v.invoice.amountPaise), paiseToDecimal(v.paidPaise), paiseToDecimal(v.balancePaise),
    v.state, Math.max(0, v.daysPastDue), v.invoice.description,
  ].map(csvCell).join(","));
  return [header.join(","), ...rows].join("\n");
}
