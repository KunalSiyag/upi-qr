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
 * this file free of runtime imports other than ./currency.ts (itself import-free).
 *
 * Clients abroad (docs/spec-foreign-clients.md): foreign-currency invoices and
 * plans live only in `ws.intl`, a section code from before that feature drops,
 * so an old reader only ever sees INR records. `amountPaise` means integer minor
 * units of the record's currency (paise for INR, cents for USD).
 */

import {
  CURRENCIES, exportNote, formatIban, formatMoney, FOREIGN_CURRENCIES, isForeignCurrency, looksLikeIban, MAX_MINOR, minorToDecimal,
  normalizeAccount, normalizeFy, normalizeLutArn, normalizeSwift, parseMoneyToMinor, safePayUrl, type CurrencyCode, type ForeignCurrency,
  type Minor,
} from "./currency.ts";

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
  /** Udyam registration number (UDYAM-XX-00-0000000) of a micro/small enterprise; "" if none. */
  udyam: string;
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
  /** Minor units of the invoice's currency (paise for INR). */
  amountPaise: Minor;
  date: string;
  mode: PaymentMode;
  reference: string;
  createdAt: number;
  /** Foreign-currency invoices only: rupees actually credited by the bank (FIRA/FIRC), integer paise. Absent = not recorded. */
  inrCreditedPaise?: number;
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
  /** Minor units of `currency` (paise for INR). */
  amountPaise: Minor;
  description: string;
  payments: Payment[];
  reminders: ReminderLog[];
  voided: boolean;
  /** Set on invoices generated from a monthly plan. */
  recurringId?: string;
  /** Set only on records in ws.intl.invoices; absent = INR. Never written as "INR". */
  currency?: ForeignCurrency;
  /** Only on records in ws.intl.invoices: marked as an export of services under LUT. Never inferred from the currency. */
  exportLut?: true;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

/** "Bill this client every month" — tuition fees, rent, memberships, maintenance. */
export interface RecurringPlan {
  id: string;
  clientId: string;
  /** Minor units of `currency` (paise for INR). */
  amountPaise: Minor;
  description: string;
  /** Issue day of the month, 1–28 so every month has it. */
  dayOfMonth: number;
  dueAfterDays: number;
  /** First month to bill, "YYYY-MM". */
  startMonth: string;
  /** Last month to bill, "YYYY-MM", or "" for no end. */
  endMonth: string;
  paused: boolean;
  /** Only in ws.intl.recurring; absent = INR. */
  currency?: ForeignCurrency;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface PayDetailsFields {
  accountName: string;
  bankName: string;
  /** normalizeSwift or "" */
  swift: string;
  /** IBAN or account number: normalizeAccount or "" */
  account: string;
  /** Bank address, ABA routing, sort code, BSB, transit: free text, ≤ 300 chars, ≤ 6 lines. */
  bankDetails: string;
  /** safePayUrl or "" */
  payUrl: string;
}

export interface IntlSettings extends PayDetailsFields {
  /** "Invoice clients in other currencies": shows currency pickers. Existing foreign invoices show either way. */
  on: boolean;
  /** Optional per-currency receiving details, used whole (never mixed field by field with the default set). */
  byCurrency?: Partial<Record<ForeignCurrency, PayDetailsFields>>;
  exportUnderLut: boolean;
  /** normalizeLutArn or "" */
  lutArn: string;
  /** The financial year the LUT was furnished for (normalizeFy, "2026-27"). */
  lutFy: string;
  updatedAt: number;
}

export interface ClientIntl { currency: ForeignCurrency; updatedAt: number; deletedAt?: number }

export interface IntlData {
  settings?: IntlSettings;
  /** Foreign-currency invoices; every record has a valid `currency`. Ids never also appear in ws.invoices. */
  invoices: Record<string, Invoice>;
  recurring: Record<string, RecurringPlan>;
  /** Client default billing currency, keyed by ws.clients id. */
  clients: Record<string, ClientIntl>;
}

export interface Workspace {
  version: number;
  business: Business;
  clients: Record<string, Client>;
  invoices: Record<string, Invoice>;
  recurring: Record<string, RecurringPlan>;
  /** Clients abroad (docs/spec-foreign-clients.md). Absent on INR-only books. Code from before this feature drops it. */
  intl?: IntlData;
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
  /** Derived, never stored: "INR" for legacy records. */
  currency: CurrencyCode;
}

// ---------------------------------------------------------------------------
// Construction

export function emptyBusiness(now = 0): Business {
  return { name: "", upiId: "", phone: "", gstin: "", invoicePrefix: "INV-", udyam: "", updatedAt: now };
}

export function emptyWorkspace(now = 0): Workspace {
  return { version: WORKSPACE_VERSION, business: emptyBusiness(now), clients: {}, invoices: {}, recurring: {} };
}

/** `<prefix>_` plus 20 hex characters from the platform CSPRNG (getRandomValues also works outside secure contexts). */
export function newId(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return `${prefix}_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

// ---------------------------------------------------------------------------
// Money and dates

/** Exact rupee-string → paise. Accepts "1,250.5" style input; null if invalid or above MAX_MINOR (₹100 crore). */
export function parseRupeesToPaise(input: string): number | null {
  return parseMoneyToMinor(input, "INR");
}

/** ₹ with Indian digit grouping; paise shown only when non-zero. */
export function formatPaise(paise: number): string {
  return formatMoney(paise, "INR");
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

/** An own entry of a record map: never an Object.prototype value for an id like "constructor" or "__proto__". */
const own = <T>(map: Record<string, T> | undefined, id: string): T | undefined =>
  map && Object.prototype.hasOwnProperty.call(map, id) ? map[id] : undefined;

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
  return { invoice, client: own(clients, invoice.clientId), paidPaise: paid, balancePaise: invoice.voided ? 0 : balance, state, daysPastDue, currency: currencyOf(invoice) };
}

/** The record's currency: "INR" unless it carries a foreign one (only records in ws.intl do). */
export function currencyOf(record: Invoice | RecurringPlan): CurrencyCode {
  return isForeignCurrency(record.currency) ? record.currency : "INR";
}

/** An invoice in either map (legacy first), tombstones included. */
export function getInvoice(ws: Workspace, id: string): Invoice | undefined {
  return own(ws.invoices, id) ?? own(ws.intl?.invoices, id);
}

/**
 * `record` without its tombstone. A sheet saving an edit to a record another tab or device deleted while it was open
 * spreads the stored record; without this the edit would land on the tombstone (and, newer, win against the delete
 * on every device) while the toast says it was saved. With it the record comes back with the edits, as before.
 */
export function withoutTombstone<T extends { deletedAt?: number }>(record: T): T {
  if (record.deletedAt === undefined) return record;
  const { deletedAt: _gone, ...rest } = record;
  return rest as T;
}

/** A plan in either map (legacy first), tombstones included. */
export function getPlan(ws: Workspace, id: string): RecurringPlan | undefined {
  return own(ws.recurring, id) ?? own(ws.intl?.recurring, id);
}

/**
 * Live INR invoices only (the legacy map). UI code keeps using this until it is currency-aware
 * (spec §1.6), so it never shows, sums or edits a foreign invoice half-way.
 */
export function liveInvoices(ws: Workspace): Invoice[] {
  return Object.values(ws.invoices).filter((invoice) => !invoice.deletedAt);
}

/** Every live invoice, INR and foreign. Only for currency-aware code. */
export function allLiveInvoices(ws: Workspace): Invoice[] {
  const foreign = ws.intl ? Object.values(ws.intl.invoices).filter((invoice) => !invoice.deletedAt) : [];
  return foreign.length ? [...liveInvoices(ws), ...foreign] : liveInvoices(ws);
}

/**
 * Whether a live foreign record (an invoice in ws.intl.invoices or a plan in ws.intl.recurring) references the client.
 * Older code (and the INR-only UI before the foreign UI ships) can't see these, so the client mustn't go while any is
 * live: deleteClient refuses, and repairIntl revives a client an older tab deleted anyway. Paused and ended plans
 * count too (a paused plan can be resumed; the answer never depends on the clock).
 */
export function clientHasForeignRecords(ws: Workspace, clientId: string): boolean {
  if (!ws.intl) return false;
  const refers = (r: { clientId: string; deletedAt?: number }) => !r.deletedAt && r.clientId === clientId;
  return Object.values(ws.intl.invoices).some(refers) || Object.values(ws.intl.recurring).some(refers);
}

export function liveClients(ws: Workspace): Client[] {
  return Object.values(ws.clients).filter((client) => !client.deletedAt).sort((a, b) => a.name.localeCompare(b.name));
}

const byIssueDesc = (a: InvoiceView, b: InvoiceView) => b.invoice.issueDate.localeCompare(a.invoice.issueDate) || b.invoice.createdAt - a.invoice.createdAt;

/** Views of live INR invoices only (see liveInvoices). */
export function invoiceViews(ws: Workspace, today: string): InvoiceView[] {
  return liveInvoices(ws).map((invoice) => viewInvoice(invoice, ws.clients, today)).sort(byIssueDesc);
}

/** Views of every live invoice, INR and foreign, in invoiceViews order. Only for currency-aware code. */
export function allInvoiceViews(ws: Workspace, today: string): InvoiceView[] {
  return allLiveInvoices(ws).map((invoice) => viewInvoice(invoice, ws.clients, today)).sort(byIssueDesc);
}

export interface AgingBucket {
  key: "current" | "d1_15" | "d16_30" | "d31_45" | "d45_plus";
  label: string;
  balancePaise: number;
  count: number;
}

/** Buckets by days past due; 45+ is where MSMED Act interest applies to B2B dues. */
export function agingBuckets(views: InvoiceView[]): AgingBucket[] {
  return agingBucketsOf(views, "INR");
}

/**
 * The same buckets per currency, over each currency's own views (amounts in that currency's minor units).
 * Only currencies with an open balance get an entry. Not shown yet (a later per-currency aging card).
 */
export function agingBucketsByCurrency(views: InvoiceView[]): Partial<Record<CurrencyCode, AgingBucket[]>> {
  const out: Partial<Record<CurrencyCode, AgingBucket[]>> = {};
  for (const currency of CURRENCIES) {
    if (views.some((v) => v.currency === currency && v.balancePaise > 0)) out[currency] = agingBucketsOf(views, currency);
  }
  return out;
}

function agingBucketsOf(views: InvoiceView[], currency: CurrencyCode): AgingBucket[] {
  const buckets: AgingBucket[] = [
    { key: "current", label: "Not yet due", balancePaise: 0, count: 0 },
    { key: "d1_15", label: "1–15 days late", balancePaise: 0, count: 0 },
    { key: "d16_30", label: "16–30 days late", balancePaise: 0, count: 0 },
    { key: "d31_45", label: "31–45 days late", balancePaise: 0, count: 0 },
    { key: "d45_plus", label: "45+ days late", balancePaise: 0, count: 0 },
  ];
  for (const view of views) {
    if (view.balancePaise === 0 || view.currency !== currency) continue;
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

/** ₹ figures over INR views only: a foreign amount is never added to them. */
export function summarize(views: InvoiceView[], today: string, dueSoonDays = 7): Summary {
  return summarizeOf(views, today, dueSoonDays, "INR");
}

/** The same Summary per foreign currency, each over that currency's views only (minor units of that currency). */
export function summarizeForeign(views: InvoiceView[], today: string, dueSoonDays = 7): Partial<Record<ForeignCurrency, Summary>> {
  const out: Partial<Record<ForeignCurrency, Summary>> = {};
  for (const currency of FOREIGN_CURRENCIES) {
    if (views.some((v) => v.currency === currency)) out[currency] = summarizeOf(views, today, dueSoonDays, currency);
  }
  return out;
}

function summarizeOf(views: InvoiceView[], today: string, dueSoonDays: number, currency: CurrencyCode): Summary {
  const month = today.slice(0, 7);
  const summary: Summary = {
    outstandingPaise: 0, overduePaise: 0, overdueCount: 0,
    dueSoonPaise: 0, dueSoonCount: 0, collectedThisMonthPaise: 0, openCount: 0,
  };
  for (const view of views) {
    if (view.currency !== currency) continue;
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

/** The INR-earned figure for a month: rupees the bank credited on foreign payments, as recorded. Never estimated. */
export interface InrEarned {
  /** Sum of inrCreditedPaise over foreign payments dated in the month (non-void invoices), integer paise. */
  creditedPaise: number;
  /** Foreign payments dated in the month (non-void invoices), with or without INR credited. */
  payments: number;
  /** Of those, the payments without INR credited. */
  missing: number;
}

export function inrEarned(views: InvoiceView[], month: string): InrEarned {
  const out: InrEarned = { creditedPaise: 0, payments: 0, missing: 0 };
  for (const view of views) {
    if (view.currency === "INR" || view.invoice.voided) continue;
    for (const payment of view.invoice.payments) {
      if (payment.date.slice(0, 7) !== month) continue;
      out.payments += 1;
      if (payment.inrCreditedPaise) out.creditedPaise += payment.inrCreditedPaise;
      else out.missing += 1;
    }
  }
  return out;
}

const currencyRank = (c: CurrencyCode) => CURRENCIES.indexOf(c);

/**
 * Overdue first, oldest and largest first — the order to chase payments in. Foreign invoices are included
 * (chasing is about days late). Within one currency the order is today's (balance, then the stable input
 * order); amounts in different currencies are never compared: INR first, then CURRENCIES order.
 */
export function chaseList(views: InvoiceView[]): InvoiceView[] {
  return views
    .filter((view) => view.state === "overdue" || (view.balancePaise > 0 && view.daysPastDue === 0))
    .sort((a, b) => b.daysPastDue - a.daysPastDue
      || (a.currency === b.currency ? b.balancePaise - a.balancePaise : currencyRank(a.currency) - currencyRank(b.currency)));
}

export function clientBalances(views: InvoiceView[]): Map<string, { balancePaise: number; overduePaise: number; open: number }> {
  const map = new Map<string, { balancePaise: number; overduePaise: number; open: number }>();
  for (const view of views) {
    if (view.balancePaise === 0 || view.currency !== "INR") continue;
    const entry = map.get(view.invoice.clientId) ?? { balancePaise: 0, overduePaise: 0, open: 0 };
    entry.balancePaise += view.balancePaise;
    if (view.state === "overdue") entry.overduePaise += view.balancePaise;
    entry.open += 1;
    map.set(view.invoice.clientId, entry);
  }
  return map;
}

export interface ClientBalance { balancePaise: number; overduePaise: number; open: number }

/** Per client, per foreign currency: open balance, overdue part and open count, in that currency's minor units. */
export function clientForeignBalances(views: InvoiceView[]): Map<string, Partial<Record<ForeignCurrency, ClientBalance>>> {
  const map = new Map<string, Partial<Record<ForeignCurrency, ClientBalance>>>();
  for (const view of views) {
    const currency = view.currency;
    if (view.balancePaise === 0 || !isForeignCurrency(currency)) continue;
    const byCurrency = map.get(view.invoice.clientId) ?? {};
    const entry = byCurrency[currency] ?? { balancePaise: 0, overduePaise: 0, open: 0 };
    entry.balancePaise += view.balancePaise;
    if (view.state === "overdue") entry.overduePaise += view.balancePaise;
    entry.open += 1;
    byCurrency[currency] = entry;
    map.set(view.invoice.clientId, byCurrency);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Mutations (return new workspaces; never mutate the input)

export function nextInvoiceNumber(ws: Workspace): string {
  const prefix = ws.business.invoicePrefix || "INV-";
  let max = 0;
  let width = 4;
  // One number series across INR and foreign invoices.
  for (const invoice of allLiveInvoices(ws)) {
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

function emptyIntl(): IntlData {
  return { invoices: {}, recurring: {}, clients: {} };
}

/** A legacy (INR) record never carries a currency, an export mark or INR-credited amounts. */
function asLegacyInvoice(invoice: Invoice): Invoice {
  const { currency: _currency, exportLut: _export, ...rest } = invoice;
  if (!rest.payments.some((p) => p.inrCreditedPaise !== undefined)) return rest;
  return { ...rest, payments: rest.payments.map(({ inrCreditedPaise: _credited, ...p }) => p) };
}

/**
 * Routes by currency: a foreign currency → ws.intl.invoices (creating intl if needed); anything else →
 * ws.invoices with any currency key removed. Refuses (returns ws unchanged) when the id already lives in the
 * other map: a record's currency never changes under its id (replaceInvoiceCurrency makes a new id).
 */
export function upsertInvoice(ws: Workspace, invoice: Invoice, now: number): Workspace {
  if (isForeignCurrency(invoice.currency)) {
    if (own(ws.invoices, invoice.id)) return ws;
    const intl = ws.intl ?? emptyIntl();
    return { ...ws, intl: { ...intl, invoices: { ...intl.invoices, [invoice.id]: { ...invoice, updatedAt: now } } } };
  }
  if (own(ws.intl?.invoices, invoice.id)) return ws;
  return { ...ws, invoices: { ...ws.invoices, [invoice.id]: { ...asLegacyInvoice(invoice), updatedAt: now } } };
}

export function updateBusiness(ws: Workspace, patch: Partial<Omit<Business, "updatedAt">>, now: number): Workspace {
  return { ...ws, business: { ...ws.business, ...patch, updatedAt: now } };
}

export function addPayment(ws: Workspace, invoiceId: string, payment: Omit<Payment, "id" | "createdAt">, now: number): Workspace {
  const invoice = getInvoice(ws, invoiceId);
  if (!invoice || invoice.deletedAt) return ws;
  if (!Number.isSafeInteger(payment.amountPaise) || payment.amountPaise <= 0) return ws;
  // INR credited is kept only on a foreign invoice's payment and only as positive integer paise (the sanitizer's rule).
  const { inrCreditedPaise, ...rest } = payment;
  const credited = isForeignCurrency(invoice.currency) ? paise(inrCreditedPaise) : null;
  const record: Payment = { ...rest, ...(credited ? { inrCreditedPaise: credited } : {}), id: newId("pay"), createdAt: now };
  return upsertInvoice(ws, { ...invoice, payments: [...invoice.payments, record] }, now);
}

/**
 * Spreads one payment from a client across their open invoices of one currency
 * (INR unless given), oldest due first (how a statement payment is applied).
 * Any excess is reported, not recorded.
 */
export function allocatePayment(
  ws: Workspace,
  clientId: string,
  amountPaise: number,
  payment: Omit<Payment, "id" | "createdAt" | "amountPaise">,
  today: string,
  now: number,
  currency: CurrencyCode = "INR",
): { ws: Workspace; allocations: { invoiceId: string; amountPaise: number }[]; unallocatedPaise: number } {
  const allocations: { invoiceId: string; amountPaise: number }[] = [];
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) return { ws, allocations, unallocatedPaise: 0 };
  const open = allLiveInvoices(ws)
    .filter((inv) => inv.clientId === clientId && currencyOf(inv) === currency)
    .map((inv) => viewInvoice(inv, ws.clients, today))
    .filter((v) => v.balancePaise > 0 && v.state !== "void")
    .sort((a, b) => a.invoice.dueDate.localeCompare(b.invoice.dueDate) || a.invoice.issueDate.localeCompare(b.invoice.issueDate));
  // The rupees credited belong to the whole payment, so a split never copies them onto each invoice.
  const { inrCreditedPaise: _credited, ...base } = payment;
  let left = amountPaise;
  let next = ws;
  for (const view of open) {
    if (left <= 0) break;
    const part = Math.min(left, view.balancePaise);
    next = addPayment(next, view.invoice.id, { ...base, amountPaise: part }, now);
    allocations.push({ invoiceId: view.invoice.id, amountPaise: part });
    left -= part;
  }
  return { ws: next, allocations, unallocatedPaise: left };
}

/* ---------- MSME (MSMED Act) ---------- */

/** Section 15 MSMED Act: a buyer must pay a micro/small supplier within the agreed period, at most 45 days. */
export const MSME_MAX_CREDIT_DAYS = 45;

export function isUdyam(value: string): boolean {
  return /^UDYAM-[A-Z]{2}-\d{2}-\d{7}$/.test(value);
}

/** "udyam-mh-12-1234567 " → "UDYAM-MH-12-1234567"; anything else → "". */
export function normalizeUdyam(value: string): string {
  const v = value.trim().toUpperCase().replace(/\s+/g, "");
  return isUdyam(v) ? v : "";
}

/**
 * Last day to pay under Section 15: the agreed due date, capped at 45 days.
 * The Act counts from the day goods or services are accepted; the invoice date
 * stands in for that here.
 */
export function msmeDeadline(invoice: Pick<Invoice, "issueDate" | "dueDate">): string {
  const agreed = Math.max(0, daysBetween(invoice.issueDate, invoice.dueDate));
  return addDays(invoice.issueDate, Math.min(MSME_MAX_CREDIT_DAYS, agreed));
}

/**
 * Section 16 interest on an unpaid balance after the deadline: compound with
 * monthly rests at `ratePct` a year (three times the RBI Bank Rate), in paise.
 * Months are days / 30, matching the MSMED interest calculator.
 */
export function msmeInterestPaise(balancePaise: number, deadline: string, today: string, ratePct: number): number {
  const days = daysBetween(deadline, today);
  if (days <= 0 || balancePaise <= 0 || !(ratePct > 0)) return 0;
  return Math.round(balancePaise * (Math.pow(1 + ratePct / 1200, days / 30) - 1));
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
  const invoice = getInvoice(ws, invoiceId);
  if (!invoice) return ws;
  return upsertInvoice(ws, { ...invoice, payments: invoice.payments.filter((p) => p.id !== paymentId) }, now);
}

export function logReminder(ws: Workspace, invoiceId: string, channel: ReminderLog["channel"], now: number): Workspace {
  const invoice = getInvoice(ws, invoiceId);
  if (!invoice) return ws;
  return upsertInvoice(ws, { ...invoice, reminders: [...invoice.reminders, { at: now, channel }].slice(-20) }, now);
}

export function deleteInvoice(ws: Workspace, invoiceId: string, now: number): Workspace {
  const invoice = getInvoice(ws, invoiceId);
  if (!invoice) return ws;
  return upsertInvoice(ws, { ...invoice, deletedAt: now }, now);
}

/**
 * Tombstones the client (and its billing-currency entry); refuses while live invoices in either map
 * still reference it.
 */
export function deleteClient(ws: Workspace, clientId: string, now: number): Workspace {
  const client = own(ws.clients, clientId);
  if (!client) return ws;
  // INR plans keep today's behaviour (the client may go; the plan then stops). A foreign plan blocks it: repairIntl
  // would revive the client anyway, so deleting it here would only be undone.
  if (liveInvoices(ws).some((invoice) => invoice.clientId === clientId) || clientHasForeignRecords(ws, clientId)) return ws;
  const next = upsertClient(ws, { ...client, deletedAt: now }, now);
  const entry = own(next.intl?.clients, clientId);
  if (!next.intl || !entry || entry.deletedAt) return next;
  return { ...next, intl: { ...next.intl, clients: { ...next.intl.clients, [clientId]: { ...entry, deletedAt: now, updatedAt: now } } } };
}

export function emptyIntlSettings(now: number): IntlSettings {
  return { on: false, accountName: "", bankName: "", swift: "", account: "", bankDetails: "", payUrl: "", exportUnderLut: false, lutArn: "", lutFy: "", updatedAt: now };
}

/**
 * The intl part of an erase at `at`. This device's own erase (`everything`) tombstones every live entry and
 * empties settings, as the legacy maps are. An erase found in another device's copy (repairIntl) leaves
 * entries and settings written after `at` alone: they are newer than that erase.
 */
function eraseIntl(intl: IntlData, at: number, everything = false): IntlData {
  const erase = (r: { updatedAt: number; deletedAt?: number }) => !r.deletedAt && (everything || r.updatedAt <= at);
  const tomb = <T extends { updatedAt: number; deletedAt?: number }>(map: Record<string, T>): Record<string, T> =>
    Object.fromEntries(Object.entries(map).map(([id, r]) => [id, erase(r) ? { ...r, deletedAt: at, updatedAt: at } : r]));
  const out: IntlData = { invoices: tomb(intl.invoices), recurring: tomb(intl.recurring), clients: tomb(intl.clients) };
  if (intl.settings) out.settings = everything || intl.settings.updatedAt <= at ? emptyIntlSettings(at) : intl.settings;
  return out;
}

/** Tombstones every record (so merges with other copies honour the erase) and clears business details. */
export function eraseWorkspace(ws: Workspace, now: number): Workspace {
  const erased: Workspace = {
    version: ws.version,
    business: { ...emptyBusiness(now) },
    clients: Object.fromEntries(Object.entries(ws.clients).map(([id, c]) => [id, c.deletedAt ? c : { ...c, deletedAt: now, updatedAt: now }])),
    invoices: Object.fromEntries(Object.entries(ws.invoices).map(([id, i]) => [id, i.deletedAt ? i : { ...i, deletedAt: now, updatedAt: now }])),
    recurring: Object.fromEntries(Object.entries(ws.recurring).map(([id, r]) => [id, r.deletedAt ? r : { ...r, deletedAt: now, updatedAt: now }])),
  };
  // An empty settings record is written only when intl already exists (INR-only bytes stay as they are).
  if (ws.intl) erased.intl = eraseIntl({ ...ws.intl, settings: ws.intl.settings ?? emptyIntlSettings(now) }, now, true);
  return erased;
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

const canonicalOf = (value: unknown): string => JSON.stringify(sortKeysDeep(value));

/**
 * The new section's merge is commutative (only new code writes it): higher updatedAt, then the tombstone,
 * then the greater canonical string. Legacy maps keep pickNewer and its tie rule (old clients rely on it).
 */
function pickNewerIntl<T extends { updatedAt: number; deletedAt?: number }>(a: T | undefined, b: T | undefined): T | undefined {
  if (!a) return b;
  if (!b) return a;
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
  if (Boolean(a.deletedAt) !== Boolean(b.deletedAt)) return a.deletedAt ? a : b;
  return canonicalOf(b) > canonicalOf(a) ? b : a;
}

function mergeIntlMap<T extends { updatedAt: number; deletedAt?: number }>(a: Record<string, T>, b: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) out[id] = pickNewerIntl(own(a, id), own(b, id))!;
  return out;
}

/** Normal form: undefined unless there are settings or at least one entry; when present, all three maps. */
export function normalizeIntl(intl: IntlData | undefined): IntlData | undefined {
  if (!intl) return undefined;
  const invoices = intl.invoices ?? {};
  const recurring = intl.recurring ?? {};
  const clients = intl.clients ?? {};
  if (!intl.settings && !Object.keys(invoices).length && !Object.keys(recurring).length && !Object.keys(clients).length) return undefined;
  return { ...(intl.settings ? { settings: intl.settings } : {}), invoices, recurring, clients };
}

/** ws with `intl` set to the normal form of `intl` (the key is removed when that is empty). */
function withIntl(ws: Workspace, intl: IntlData | undefined): Workspace {
  const normal = normalizeIntl(intl);
  if (normal) return { ...ws, intl: normal };
  if (!("intl" in ws)) return ws;
  const { intl: _gone, ...rest } = ws;
  return rest;
}

/** The book without its foreign section: exactly what code from before that feature holds for the same data. */
export function withoutIntl(ws: Workspace): Workspace {
  return withIntl(ws, undefined);
}

/** Absence never deletes, at section, map and entry level; the result is in normal form. */
export function mergeIntl(a: IntlData | undefined, b: IntlData | undefined): IntlData | undefined {
  if (!a && !b) return undefined;
  if (!a || !b) return normalizeIntl(a ?? b);
  let settings = a.settings ?? b.settings;
  if (a.settings && b.settings) {
    settings = a.settings.updatedAt !== b.settings.updatedAt
      ? (a.settings.updatedAt > b.settings.updatedAt ? a.settings : b.settings)
      : (canonicalOf(b.settings) > canonicalOf(a.settings) ? b.settings : a.settings);
  }
  return normalizeIntl({
    ...(settings ? { settings } : {}),
    invoices: mergeIntlMap(a.invoices, b.invoices),
    recurring: mergeIntlMap(a.recurring, b.recurring),
    clients: mergeIntlMap(a.clients, b.clients),
  });
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
  const merged: Workspace = {
    version: Math.max(a.version, b.version),
    business: b.business.updatedAt > a.business.updatedAt ? b.business : a.business,
    clients,
    invoices,
    recurring,
  };
  const intl = mergeIntl(a.intl, b.intl);
  if (intl) merged.intl = intl;
  return merged;
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
  if (backup.intl) {
    const intl = merged.intl ?? emptyIntl();
    const revive = <T extends { deletedAt?: number }>(into: Record<string, T>, from: Record<string, T>): Record<string, T> => {
      const out = { ...into };
      for (const [id, record] of Object.entries(from)) if (!record.deletedAt && own(out, id)?.deletedAt) out[id] = { ...record, updatedAt: now };
      return out;
    };
    const restored: IntlData = {
      ...(intl.settings ? { settings: intl.settings } : {}),
      invoices: revive(intl.invoices, backup.intl.invoices),
      recurring: revive(intl.recurring, backup.intl.recurring),
      clients: revive(intl.clients, backup.intl.clients),
    };
    // Settings come back only when this copy has none, or only empty ones (the business.name rule).
    if (backup.intl.settings && !settingsEmpty(backup.intl.settings) && (!restored.settings || settingsEmpty(restored.settings))) {
      restored.settings = { ...backup.intl.settings, updatedAt: now };
    }
    return withIntl(merged, restored);
  }
  return merged;
}

const detailsEmpty = (d: PayDetailsFields) => !d.accountName && !d.bankName && !d.swift && !d.account && !d.bankDetails && !d.payUrl;

function settingsEmpty(s: IntlSettings): boolean {
  return !s.on && !s.exportUnderLut && !s.lutArn && !s.lutFy && detailsEmpty(s) && !Object.keys(s.byCurrency ?? {}).length;
}

/** Drops tombstones older than `maxAgeDays` so storage does not grow forever. */
export function pruneTombstones(ws: Workspace, now: number, maxAgeDays = 90): Workspace {
  const cutoff = now - maxAgeDays * DAY_MS;
  const keep = <T extends { deletedAt?: number }>(record: T) => !record.deletedAt || record.deletedAt > cutoff;
  const pruned: Workspace = {
    ...ws,
    clients: Object.fromEntries(Object.entries(ws.clients).filter(([, c]) => keep(c))),
    invoices: Object.fromEntries(Object.entries(ws.invoices).filter(([, i]) => keep(i))),
    recurring: Object.fromEntries(Object.entries(ws.recurring).filter(([, r]) => keep(r))),
  };
  if (!ws.intl) return pruned;
  // Pruning the last foreign tombstone returns the exact INR-only bytes.
  return withIntl(pruned, {
    ...(ws.intl.settings ? { settings: ws.intl.settings } : {}),
    invoices: Object.fromEntries(Object.entries(ws.intl.invoices).filter(([, i]) => keep(i))),
    recurring: Object.fromEntries(Object.entries(ws.intl.recurring).filter(([, r]) => keep(r))),
    clients: Object.fromEntries(Object.entries(ws.intl.clients).filter(([, c]) => keep(c))),
  });
}

// ---------------------------------------------------------------------------
// Validation of untrusted input (localStorage, imported backups, cloud copies)

const str = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : "");
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
/** Integer minor units, 0 to MAX_MINOR (the ceiling the parsers use too). */
const paise = (value: unknown) => (typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= MAX_MINOR ? value : null);

/** `foreign`: a payment of a ws.intl invoice, which may carry the INR credited for it. */
function sanitizePayment(raw: unknown, foreign = false): Payment | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const amount = paise(r.amountPaise);
  const date = str(r.date, 10);
  if (!amount || !isIsoDate(date)) return null;
  const mode = PAYMENT_MODES.includes(r.mode as PaymentMode) ? (r.mode as PaymentMode) : "other";
  const payment: Payment = { id: str(r.id, 40) || newId("pay"), amountPaise: amount, date, mode, reference: str(r.reference, 60), createdAt: num(r.createdAt) };
  if (foreign) {
    const credited = paise(r.inrCreditedPaise);
    if (credited) payment.inrCreditedPaise = credited;
  }
  return payment;
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

/** A `currency` key on a legacy record is ignored (it stays INR, as every old reader shows it). */
function sanitizeInvoice(id: string, raw: unknown, foreign = false): Invoice | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const amount = paise(r.amountPaise);
  const issueDate = str(r.issueDate, 10);
  const dueDate = str(r.dueDate, 10);
  if (amount === null || !isIsoDate(issueDate) || !isIsoDate(dueDate)) return null;
  const payments = Array.isArray(r.payments) ? r.payments.map((p) => sanitizePayment(p, foreign)).filter((p): p is Payment => p !== null).slice(0, 200) : [];
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

const MAX_INTL_INVOICES = 20_000;
const MAX_INTL_PLANS = 2_000;
const MAX_INTL_CLIENTS = 5_000;

function sanitizeBankDetails(value: unknown): string {
  // Cut first, then trim: the result is a fixed point (sanitizing it again changes nothing), so the server's
  // re-sanitized copy always equals the client's and an unchanged PUT never writes.
  // C0 and C1 controls (NEL U+0085 is a line break to some renderers) and the Unicode line/paragraph separators.
  const text = str(value, 2000).replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u2028\u2029]/g, "").slice(0, 300);
  return text.split("\n").map((line) => line.trim()).slice(0, 6).join("\n").trim();
}

function sanitizePayDetails(raw: unknown): PayDetailsFields {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    accountName: str(r.accountName, 80).trim(),
    bankName: str(r.bankName, 80).trim(),
    swift: normalizeSwift(str(r.swift, 40)),
    account: normalizeAccount(str(r.account, 80)),
    bankDetails: sanitizeBankDetails(r.bankDetails),
    payUrl: typeof r.payUrl === "string" ? safePayUrl(r.payUrl) : "",
  };
}

/** Every field through its normalizer: an invalid SWIFT, URL, ARN or FY becomes "", never an error. */
function sanitizeIntlSettings(raw: unknown): IntlSettings | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const exportUnderLut = r.exportUnderLut === true;
  const settings: IntlSettings = {
    on: r.on === true,
    ...sanitizePayDetails(r),
    exportUnderLut,
    lutArn: exportUnderLut ? normalizeLutArn(str(r.lutArn, 40)) : "",
    lutFy: exportUnderLut ? normalizeFy(str(r.lutFy, 10)) : "",
    updatedAt: num(r.updatedAt),
  };
  if (r.byCurrency && typeof r.byCurrency === "object") {
    const byCurrency: Partial<Record<ForeignCurrency, PayDetailsFields>> = {};
    for (const currency of FOREIGN_CURRENCIES) {
      const value = own(r.byCurrency as Record<string, unknown>, currency);
      if (!value || typeof value !== "object") continue;
      const details = sanitizePayDetails(value);
      if (!detailsEmpty(details)) byCurrency[currency] = details;
    }
    if (Object.keys(byCurrency).length) settings.byCurrency = byCurrency;
  }
  return settings;
}

/**
 * The foreign section from untrusted JSON. Records without a foreign currency are dropped, never coerced to
 * INR; ids that also exist in the legacy maps are dropped (the legacy record is what old readers see). Each
 * map has its own cap, never reduced by the legacy count (the byte cap bounds the total).
 */
function sanitizeIntl(raw: unknown, legacyInvoices: Record<string, Invoice>, legacyPlans: Record<string, RecurringPlan>): IntlData | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const intl = emptyIntl();
  const settings = sanitizeIntlSettings(r.settings);
  if (settings) intl.settings = settings;
  const invoices = (r.invoices && typeof r.invoices === "object" ? r.invoices : {}) as Record<string, unknown>;
  for (const [id, value] of Object.entries(invoices).slice(0, MAX_INTL_INVOICES)) {
    if (!ID_RE.test(id) || own(legacyInvoices, id)) continue;
    const currency = (value as Record<string, unknown> | null)?.currency;
    if (!isForeignCurrency(currency)) continue;
    const invoice = sanitizeInvoice(id, value, true);
    if (!invoice) continue;
    invoice.currency = currency;
    if ((value as Record<string, unknown>).exportLut === true) invoice.exportLut = true;
    intl.invoices[id] = invoice;
  }
  const recurring = (r.recurring && typeof r.recurring === "object" ? r.recurring : {}) as Record<string, unknown>;
  for (const [id, value] of Object.entries(recurring).slice(0, MAX_INTL_PLANS)) {
    if (!ID_RE.test(id) || own(legacyPlans, id)) continue;
    const currency = (value as Record<string, unknown> | null)?.currency;
    if (!isForeignCurrency(currency)) continue;
    const plan = sanitizePlan(id, value);
    if (!plan) continue;
    plan.currency = currency;
    intl.recurring[id] = plan;
  }
  const clients = (r.clients && typeof r.clients === "object" ? r.clients : {}) as Record<string, unknown>;
  for (const [id, value] of Object.entries(clients).slice(0, MAX_INTL_CLIENTS)) {
    if (!ID_RE.test(id) || !value || typeof value !== "object") continue;
    const v = value as Record<string, unknown>;
    if (!isForeignCurrency(v.currency)) continue;
    const entry: ClientIntl = { currency: v.currency, updatedAt: num(v.updatedAt) };
    if (num(v.deletedAt)) entry.deletedAt = num(v.deletedAt);
    intl.clients[id] = entry;
  }
  return normalizeIntl(intl);
}

/** Returns a well-formed workspace from untrusted JSON, dropping bad records. */
export function sanitizeWorkspace(raw: unknown): Workspace {
  const ws = emptyWorkspace();
  if (!raw || typeof raw !== "object") return ws;
  const r = raw as Record<string, unknown>;
  const b = (r.business && typeof r.business === "object" ? r.business : {}) as Record<string, unknown>;
  ws.business = {
    name: str(b.name, 80), upiId: str(b.upiId, 100), phone: str(b.phone, 20), gstin: str(b.gstin, 15),
    invoicePrefix: str(b.invoicePrefix, 12) || "INV-", udyam: normalizeUdyam(str(b.udyam, 30)), updatedAt: num(b.updatedAt),
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
  const intl = sanitizeIntl(r.intl, ws.invoices, ws.recurring);
  if (intl) ws.intl = intl;
  return ws;
}

// ---------------------------------------------------------------------------
// Recurring monthly invoices

export const MAX_BACKFILL_MONTHS = 12;

/** Live INR plans only (the legacy map); see liveInvoices. */
export function liveRecurring(ws: Workspace): RecurringPlan[] {
  return Object.values(ws.recurring).filter((plan) => !plan.deletedAt);
}

/** Every live plan, INR and foreign. Only for currency-aware code. */
export function allLiveRecurring(ws: Workspace): RecurringPlan[] {
  const foreign = ws.intl ? Object.values(ws.intl.recurring).filter((plan) => !plan.deletedAt) : [];
  return foreign.length ? [...liveRecurring(ws), ...foreign] : liveRecurring(ws);
}

/** Same routing and refusal as upsertInvoice. */
export function upsertPlan(ws: Workspace, plan: RecurringPlan, now: number): Workspace {
  if (isForeignCurrency(plan.currency)) {
    if (own(ws.recurring, plan.id)) return ws;
    const intl = ws.intl ?? emptyIntl();
    return { ...ws, intl: { ...intl, recurring: { ...intl.recurring, [plan.id]: { ...plan, updatedAt: now } } } };
  }
  if (own(ws.intl?.recurring, plan.id)) return ws;
  const { currency: _currency, ...legacy } = plan;
  return { ...ws, recurring: { ...ws.recurring, [plan.id]: { ...legacy, updatedAt: now } } };
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
 * Months ("YYYY-MM", sorted) that already have an invoice of this plan, tombstones included, read from the
 * map the plan's invoices live in (ws.invoices for an INR plan, ws.intl.invoices for a foreign one).
 */
export function planMonths(ws: Workspace, plan: RecurringPlan): string[] {
  const map = currencyOf(plan) === "INR" ? ws.invoices : (ws.intl?.invoices ?? {});
  const prefix = recurringInvoiceId(plan.id, "0000-00").slice(0, -6);
  const months: string[] = [];
  for (const id of Object.keys(map)) if (id.startsWith(prefix)) months.push(`${id.slice(-6, -2)}-${id.slice(-2)}`);
  return months.sort();
}

/** The month a plan month's id was generated for ("YYYY-MM"), or "" when `invoice` isn't one of `plan`'s months. */
function planMonthOf(plan: RecurringPlan, invoice: Invoice): string {
  const month = `${invoice.id.slice(-6, -2)}-${invoice.id.slice(-2)}`;
  return invoice.recurringId === plan.id && invoice.id === recurringInvoiceId(plan.id, month) ? month : "";
}

const MAX_REPLACEMENT_HOPS = 16;
const monthBefore = (month: string) => monthFromIndex(monthIndex(month) - 1);

/** 20 hex characters derived from `text` (three 32-bit FNV-1a lanes, murmur3 finaliser): the same on every device and server. */
function hashHex20(text: string): string {
  let out = "";
  for (const seed of [0x811c9dc5, 0x2f6b7a1d, 0x9e3779b9]) {
    let h = seed;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    out += (h >>> 0).toString(16).padStart(8, "0");
  }
  return out.slice(0, 20);
}

/**
 * The id of the plan a currency change of `planId` to `currency` creates. Derived, never random, so "this plan
 * replaced that one" lives in ids no copy rewrites: an older copy that edits the old plan (bringing back its empty
 * endMonth or its liveness) can't lose the link, and two devices making the same change offline make one plan, not
 * two. The target currency is part of it, so an INR and a foreign replacement never share an id across the two maps.
 */
export function replacementPlanId(planId: string, currency: CurrencyCode): string {
  return `rec_${hashHex20(`replaces ${planId} ${currency}`)}`;
}

/** The plans currency changes of `plan` created, tombstones included (at most one per currency). Empty without intl. */
function replacementsOf(ws: Workspace, plan: RecurringPlan): RecurringPlan[] {
  // A replacement is in another currency than its plan, so one of the two is foreign: no intl, no replacement.
  if (!ws.intl) return [];
  const out: RecurringPlan[] = [];
  for (const currency of CURRENCIES) {
    if (currency === currencyOf(plan)) continue;
    const next = getPlan(ws, replacementPlanId(plan.id, currency));
    if (next && next.clientId === plan.clientId && currencyOf(next) === currency) out.push(next);
  }
  return out;
}

/** The plan `plan` replaced in a currency change (tombstones included), or undefined. */
function replacedPlanOf(ws: Workspace, plan: RecurringPlan): RecurringPlan | undefined {
  if (!ws.intl) return undefined;
  const currency = currencyOf(plan);
  for (const map of [ws.recurring, ws.intl.recurring]) {
    for (const other of Object.values(map)) {
      if (other.id !== plan.id && other.clientId === plan.clientId && replacementPlanId(other.id, currency) === plan.id) return other;
    }
  }
  return undefined;
}

/**
 * The last month a plan bills ("" = no end): its endMonth, or the month before a replacement from a currency change
 * starts, whichever is earlier. Read from the replacement too, so a stale copy that brought back the old plan's empty
 * endMonth never makes it bill next to its replacement. Before the plan's startMonth for a plan replaced as a whole.
 */
export function planEnd(ws: Workspace, plan: RecurringPlan): string {
  let end = plan.endMonth;
  for (const next of replacementsOf(ws, plan)) {
    const before = monthBefore(next.startMonth);
    if (!end || before < end) end = before;
  }
  return end;
}

/** Whether `plan` bills `month` now: live, and the month inside its own range (startMonth to planEnd). */
function planCovers(ws: Workspace, plan: RecurringPlan, month: string): boolean {
  const end = planEnd(ws, plan);
  return !plan.deletedAt && plan.startMonth <= month && (!end || month <= end);
}

/**
 * Records linked by currency changes, grouped: `derive(id, currency)` is the id a change of `id` to `currency`
 * creates, so a link is read from the ids alone (no copy can rewrite it). Returns the family of every linked record
 * (record id → a representative id of its family); a record no change touched is left out. Tombstones count, so a
 * family survives one of its records being deleted.
 */
function changeFamilies<T extends { id: string; currency?: CurrencyCode }>(
  records: T[], get: (id: string) => T | undefined, derive: (id: string, currency: CurrencyCode) => string, linked: (from: T, to: T) => boolean,
): Map<string, string> {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root) as string;
    for (let at = id; at !== root;) { const up = parent.get(at) as string; parent.set(at, root); at = up; }
    return root;
  };
  for (const record of records) {
    for (const currency of CURRENCIES) {
      if (currency === currencyOf(record)) continue;
      const next = get(derive(record.id, currency));
      if (!next || currencyOf(next) !== currency || !linked(record, next)) continue;
      if (!parent.has(record.id)) parent.set(record.id, record.id);
      if (!parent.has(next.id)) parent.set(next.id, next.id);
      const [a, b] = [find(record.id), find(next.id)];
      if (a !== b) parent.set(b, a);
    }
  }
  const out = new Map<string, string>();
  for (const id of parent.keys()) out.set(id, find(id));
  return out;
}

/**
 * The export mark (§6) a foreign plan's month gets: the mark of the plan's latest earlier live month, so a plan
 * started with "Export of services" ticked keeps the LUT line every month, and unticking it on a month stops it from
 * then on. A plan with no earlier live month (one a currency change created) takes the mark of the latest live month
 * before `month` of the plan it replaced, following the chain of currency changes back (replacedPlanOf); an INR
 * month counts as unmarked. No such month → false: the user ticks it on that month. Reads only the book, so
 * generateRecurring and repairExportMarks agree on every device.
 */
function carriedExportMark(ws: Workspace, plan: RecurringPlan, month: string): boolean {
  for (let back = monthIndex(month) - 1; back >= monthIndex(plan.startMonth); back--) {
    const earlier = getInvoice(ws, recurringInvoiceId(plan.id, monthFromIndex(back)));
    if (!earlier || earlier.deletedAt) continue;
    return earlier.exportLut === true;
  }
  let from = replacedPlanOf(ws, plan);
  for (let hops = 0; from && hops < MAX_REPLACEMENT_HOPS; hops++, from = replacedPlanOf(ws, from)) {
    const months = planMonths(ws, from);
    for (let i = months.length - 1; i >= 0; i--) {
      if (months[i] >= month) continue;
      const earlier = getInvoice(ws, recurringInvoiceId(from.id, months[i]));
      if (!earlier || earlier.deletedAt) continue;
      return earlier.exportLut === true;
    }
  }
  return false;
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
  for (const plan of allLiveRecurring(ws)) {
    // Own keys only (as digestProjection checks): a plan whose clientId is "constructor" has no client.
    const client = own(next.clients, plan.clientId);
    if (plan.paused || !client || client.deletedAt) continue;
    const end = planEnd(next, plan);
    const last = Math.min(todayIndex, end ? monthIndex(end) : todayIndex);
    const first = Math.max(monthIndex(plan.startMonth), last - MAX_BACKFILL_MONTHS + 1);
    for (let index = first; index <= last; index++) {
      const month = monthFromIndex(index);
      const issueDate = `${month}-${String(plan.dayOfMonth).padStart(2, "0")}`;
      if (issueDate > today) continue;
      const id = recurringInvoiceId(plan.id, month);
      // Either map, tombstones included: a foreign plan's months live in ws.intl.invoices.
      if (getInvoice(next, id)) continue;
      const foreign = isForeignCurrency(plan.currency);
      const exportLut = foreign && carriedExportMark(next, plan, month);
      // A foreign month is written settled (updatedAt = createdAt + 1): its mark was carried here, so repairExportMarks
      // never re-derives it later (only a month an older build generated, createdAt === updatedAt, is repaired).
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
        ...(isForeignCurrency(plan.currency) ? { currency: plan.currency, ...(exportLut ? { exportLut: true } : {}) } : {}),
        createdAt: now,
        updatedAt: foreign ? now + 1 : now,
      }, foreign ? now + 1 : now);
      created.push(id);
    }
  }
  return { ws: next, created };
}

const monthAfter = (month: string) => monthFromIndex(monthIndex(month) + 1);

/**
 * The id of the invoice a currency change of `invoiceId` to `currency` creates. Derived, never random (as
 * replacementPlanId), so the link between the old invoice and its copy lives in ids: when a stale write (a reminder or
 * payment from an older tab, a restored backup) brings the old one back, repairIntl and invoicesMovedTwice find the
 * copy, and two devices making the same change make one invoice.
 */
export function replacementInvoiceId(invoiceId: string, currency: CurrencyCode): string {
  return `inv_${hashHex20(`moves ${invoiceId} ${currency}`)}`;
}

/**
 * Moves an invoice to another currency: tombstones `id` and creates a copy (replacementInvoiceId), the same number
 * and fields, in `currency`. Only while it has no payments, and never for a plan month (null): a plan month's id is
 * recurringInvoiceId(plan, month), and once its tombstone is pruned generateRecurring would bill that month again.
 * A live copy from the same change on another device is kept as it is (its payments too), never overwritten.
 */
export function replaceInvoiceCurrency(ws: Workspace, id: string, currency: CurrencyCode, now: number): { ws: Workspace; id: string } | null {
  const invoice = getInvoice(ws, id);
  if (!invoice || invoice.deletedAt || invoice.payments.length || invoice.recurringId) return null;
  if (currencyOf(invoice) === currency) return { ws, id };
  const copyId = replacementInvoiceId(id, currency);
  const existing = getInvoice(ws, copyId);
  if (existing && !existing.deletedAt && currencyOf(existing) === currency) return { ws: deleteInvoice(ws, id, now), id: copyId };
  const { currency: _from, exportLut: _export, ...rest } = invoice;
  // The export mark moves with a foreign copy (US$ → €: still an export under the LUT); an INR copy never has one.
  const copy: Invoice = {
    ...rest, id: copyId, ...(isForeignCurrency(currency) ? { currency, ...(invoice.exportLut === true ? { exportLut: true } : {}) } : {}),
  };
  return { ws: upsertInvoice(deleteInvoice(ws, id, now), copy, now), id: copy.id };
}

/** Invoices linked by currency changes (replacementInvoiceId), tombstones included: id → family. Plan months never move. */
function invoiceFamilies(ws: Workspace): Map<string, string> {
  if (!ws.intl) return new Map();
  const records = [...Object.values(ws.invoices), ...Object.values(ws.intl.invoices)].filter((invoice) => !invoice.recurringId);
  return changeFamilies(records, (id) => getInvoice(ws, id), replacementInvoiceId, () => true);
}

/**
 * Live invoices that a currency change moved and that are live again next to their copy (§1.7): the old one came back
 * with a payment or a void an older copy recorded on it (repairIntl deletes it again otherwise), or two devices moved
 * one invoice to two currencies. Every live invoice of such a family is returned, for the user to keep one. Empty
 * for an INR-only book.
 */
export function invoicesMovedTwice(ws: Workspace): Set<string> {
  const out = new Set<string>();
  const families = invoiceFamilies(ws);
  if (!families.size) return out;
  const live = new Map<string, string[]>();
  for (const [id, family] of families) {
    const invoice = getInvoice(ws, id);
    if (invoice && !invoice.deletedAt) live.set(family, [...(live.get(family) ?? []), id]);
  }
  for (const ids of live.values()) if (ids.length > 1) for (const id of ids) out.add(id);
  return out;
}

/**
 * Whether a plan has a month left to bill, so its currency can change: live, and not ended with all its months
 * created (a plan a currency change already ended, or one stopped after its last created month, has none).
 */
export function planCanChangeCurrency(ws: Workspace, plan: RecurringPlan): boolean {
  if (plan.deletedAt) return false;
  const end = planEnd(ws, plan);
  if (end && end < plan.startMonth) return false;
  const months = planMonths(ws, plan);
  const last = months[months.length - 1];
  return !(last && end && monthAfter(last) > end);
}

/**
 * A plan's currency change: `planId` ends after its last generated month and a new plan (new id, same client,
 * day, due days and description) in `currency`, billing `amountMinor` (minor units of `currency`), starts the month
 * after. The old amount never carries over: ₹50,000 is not US$50,000. Existing months keep their ids and currency,
 * so nothing regenerates. A plan with no month yet is replaced as a whole. Null for an invalid amount.
 */
export function replacePlanCurrency(ws: Workspace, planId: string, currency: CurrencyCode, now: number, amountMinor: Minor): { ws: Workspace; id: string } | null {
  const plan = getPlan(ws, planId);
  if (!plan || !planCanChangeCurrency(ws, plan)) return null;
  if (currencyOf(plan) === currency) return { ws, id: planId };
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || amountMinor > MAX_MINOR) return null;
  const months = planMonths(ws, plan);
  const last = months[months.length - 1];
  const { currency: _from, ...rest } = plan;
  const replacement: RecurringPlan = {
    ...rest, id: replacementPlanId(plan.id, currency), amountPaise: amountMinor, startMonth: last ? monthAfter(last) : plan.startMonth, createdAt: now, updatedAt: now,
    ...(isForeignCurrency(currency) ? { currency } : {}),
  };
  const ended = last ? { ...plan, endMonth: last } : { ...plan, deletedAt: now };
  return { ws: upsertPlan(upsertPlan(ws, ended, now), replacement, now), id: replacement.id };
}

/**
 * Plan months billed twice after a currency change (§1.7, risk 22). The plans one plan's currency changes link
 * (replacementPlanId, in any direction and through further changes) form a family, and a month should be billed by
 * one of them. It is billed twice when two of them have a live month for it, or one has and another covers it with
 * no month yet (it will bill it). That happens when a copy that hadn't seen a change (an offline device, an older tab)
 * billed the old plan after its end; when two devices made the same change from different months (one plan, and the
 * later write's startMonth wins, so a month the other device billed under it falls before its start); or when two
 * devices changed one plan to two currencies (two live replacements). The months can't converge (other ids), so they
 * are shown for the user to delete one: the unpaid months outside their own plan's range (deleted plan, before its
 * start, after planEnd), else, when there is none (siblings, or the stray month was paid), the unpaid ones. Empty for
 * an INR-only book. planEnd is read from the replacement, so a stale edit that cleared endMonth doesn't hide it, and
 * the month is the one the id was generated for, never the editable issue date.
 */
export function monthsBilledTwice(ws: Workspace): Set<string> {
  const out = new Set<string>();
  if (!ws.intl) return out;
  const plans = [...Object.values(ws.recurring), ...Object.values(ws.intl.recurring)];
  const families = changeFamilies(plans, (id) => getPlan(ws, id), replacementPlanId, (from, to) => from.clientId === to.clientId);
  if (!families.size) return out;
  const members = new Map<string, RecurringPlan[]>();
  for (const plan of plans) {
    const family = families.get(plan.id);
    if (family) members.set(family, [...(members.get(family) ?? []), plan]);
  }
  const groups = new Map<string, { invoice: Invoice; inRange: boolean }[]>();
  for (const invoice of allLiveInvoices(ws)) {
    const family = invoice.recurringId ? families.get(invoice.recurringId) : undefined;
    const plan = family ? getPlan(ws, invoice.recurringId as string) : undefined;
    const month = plan ? planMonthOf(plan, invoice) : "";
    if (!plan || !month) continue;
    const key = `${family} ${month}`;
    groups.set(key, [...(groups.get(key) ?? []), { invoice, inRange: planCovers(ws, plan, month) }]);
  }
  for (const [key, billed] of groups) {
    const [family, month] = key.split(" ");
    const pending = (members.get(family) ?? []).filter((plan) => planCovers(ws, plan, month) && !getInvoice(ws, recurringInvoiceId(plan.id, month)));
    if (billed.length + pending.length < 2) continue;
    const unpaid = billed.filter((entry) => !entry.invoice.payments.length);
    const stray = unpaid.filter((entry) => !entry.inRange);
    for (const entry of stray.length ? stray : unpaid) out.add(entry.invoice.id);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Repairs for what code from before ws.intl can still do to a book (spec §1.7)

/** Sample records (ids contain "sample", see sample.ts) are removed together at one time; that is not an erase. */
const isSampleRecordId = (id: string) => id.includes("sample");

/**
 * The time T of a pre-intl "Erase workspace" this book went through, found by what that erase wrote, even
 * after the user started over in the old tab. At T the erase tombstoned every live legacy record (deletedAt =
 * updatedAt = T; records deleted earlier keep their own deletedAt) and replaced the business with
 * emptyBusiness(T). So T is a candidate when the business is still emptyBusiness(T), or when at least two
 * non-sample legacy records were tombstoned at exactly T (no other single action does that). It is the erase when:
 * - the business was erased at T (still emptyBusiness(T)) or rewritten after it (updatedAt > T);
 * - some legacy record was tombstoned at exactly T, or the business is still emptyBusiness(T) (a book whose
 *   legacy records were all deleted earlier, or that never had one, leaves no other trace). No user edit writes
 *   emptyBusiness(T) with T > 0: both business forms require a name, and a restore never starts a new book
 *   from emptyWorkspace(now);
 * - every legacy record created up to T was tombstoned by T; records created after T are the fresh start;
 * - some intl content was last written before T (the erase couldn't see it).
 * The newest such T wins. Otherwise null. An erase of a book with at most one live legacy record, followed by
 * a business rename in the old tab, leaves no trace to tell it from a single deletion, and is not detected.
 */
function detectLegacyErase(ws: Workspace): number | null {
  const intl = ws.intl;
  if (!intl) return null;
  const b = ws.business;
  const legacy: { id: string; createdAt: number; updatedAt: number; deletedAt?: number }[] =
    [...Object.values(ws.clients), ...Object.values(ws.invoices), ...Object.values(ws.recurring)];
  const shared = new Map<number, number>();
  for (const r of legacy) {
    if (r.deletedAt && r.deletedAt === r.updatedAt && !isSampleRecordId(r.id)) shared.set(r.deletedAt, (shared.get(r.deletedAt) ?? 0) + 1);
  }
  const emptyAt = (t: number) => {
    const empty = emptyBusiness(t);
    return b.updatedAt === t && b.name === empty.name && b.upiId === empty.upiId && b.phone === empty.phone && b.gstin === empty.gstin
      && b.invoicePrefix === empty.invoicePrefix && b.udyam === empty.udyam;
  };
  const candidates = new Set<number>([...shared].filter(([, n]) => n >= 2).map(([t]) => t));
  if (emptyAt(b.updatedAt)) candidates.add(b.updatedAt);
  const older = (map: Record<string, { updatedAt: number; deletedAt?: number }>, T: number) =>
    Object.values(map).some((r) => !r.deletedAt && r.updatedAt < T);
  for (const T of [...candidates].sort((x, y) => y - x)) {
    if (!(T > 0)) continue;
    if (!(emptyAt(T) || b.updatedAt > T)) continue;
    // A record tombstoned at T, or (business still emptyBusiness(T)) a book with no live legacy record at T:
    // every record was deleted earlier, or there never was one (bank details set up first).
    if (!legacy.some((r) => r.deletedAt === T) && !emptyAt(T)) continue;
    if (!legacy.every((r) => r.createdAt > T || (r.deletedAt !== undefined && r.deletedAt <= T))) continue;
    const settingsOlder = Boolean(intl.settings && !settingsEmpty(intl.settings) && intl.settings.updatedAt < T);
    if (older(intl.invoices, T) || older(intl.recurring, T) || older(intl.clients, T) || settingsOlder) return T;
  }
  return null;
}

/**
 * Deterministic repairs after every load and merge (client and server). First a legacy erase is applied to the
 * foreign section at its own time; then a client an old tab deleted while it still had live foreign invoices or plans
 * (which that tab couldn't see) is revived. An erased client's foreign records older than the erase are tombstoned
 * first, so only a record written after the erase revives it. Then an invoice a currency change moved is deleted
 * again if a stale write brought it back (repairMovedInvoices), a plan a currency change replaced is ended again
 * if an older copy wrote it back (repairReplacedPlans), and last, plan months an older build generated get their
 * export mark settled (repairExportMarks). Returns `ws` itself when nothing needs repair. Every repaired record is
 * written at its own updatedAt + 1, so the repair wins in older builds' merges too and copies converge. The result never depends on the clock
 * (`_now` is kept for callers), so repairing the same copy anywhere gives the same bytes.
 */
export function repairIntl(ws: Workspace, _now: number): Workspace {
  if (!ws.intl) return ws;
  let next = ws;
  const erasedAt = detectLegacyErase(ws);
  if (erasedAt !== null) next = withIntl(next, eraseIntl(ws.intl, erasedAt));
  let clients: Record<string, Client> | null = null;
  // Live foreign invoices and live foreign plans (paused or not): a plan whose client is gone stops billing with no
  // message, and its client would be pruned after 90 days while the plan still points at it.
  const foreign: { clientId: string; deletedAt?: number }[] = [...Object.values(next.intl?.invoices ?? {}), ...Object.values(next.intl?.recurring ?? {})];
  for (const record of foreign) {
    if (record.deletedAt) continue;
    const client: Client | undefined = own(clients ?? next.clients, record.clientId);
    // A client erased at T with everything else is revived too when a foreign record that still references it is
    // newer than T (eraseIntl tombstoned the older ones above): a single pass then reaches the fixed point, so a
    // second repair, on this device or the server, changes nothing.
    if (!client || !client.deletedAt) continue;
    const { deletedAt: _gone, ...revived } = client;
    // Deterministic (never the clock): every device and the server revive to the same bytes, so a book that is
    // loaded but not saved (non-primary books) never looks changed against its sync meta on the next load.
    clients = { ...(clients ?? next.clients), [client.id]: { ...revived, updatedAt: Math.max(client.updatedAt, client.deletedAt) + 1 } };
  }
  if (clients) next = { ...next, clients };
  return repairExportMarks(repairReplacedPlans(repairMovedInvoices(next)));
}

/**
 * Deletes again an invoice a currency change moved, when a stale write brought it back next to its copy (a reminder
 * or edit from an older tab or offline device, a restored backup from before the move): it is live, and a copy from
 * replacementInvoiceId exists (live, or deleted by the user since). Only while it has no payment and isn't void: a
 * payment or void recorded on it is kept, and invoicesMovedTwice shows the pair instead. Written at updatedAt + 1
 * (deletedAt the same), never the clock, so every build's last-writer-wins merge keeps it and copies converge; it
 * only reads ids, so one pass is the fixed point. `ws` itself when nothing changes.
 */
function repairMovedInvoices(ws: Workspace): Workspace {
  const intl = ws.intl;
  if (!intl) return ws;
  const fix = (map: Record<string, Invoice>): Record<string, Invoice> | null => {
    let out: Record<string, Invoice> | null = null;
    for (const invoice of Object.values(map)) {
      if (invoice.deletedAt || invoice.recurringId || invoice.payments.length || invoice.voided) continue;
      const moved = CURRENCIES.some((currency) => {
        if (currency === currencyOf(invoice)) return false;
        const copy = getInvoice(ws, replacementInvoiceId(invoice.id, currency));
        return Boolean(copy && currencyOf(copy) === currency);
      });
      if (!moved) continue;
      const at = invoice.updatedAt + 1;
      out ??= { ...map };
      out[invoice.id] = { ...invoice, updatedAt: at, deletedAt: at };
    }
    return out;
  };
  const invoices = fix(ws.invoices);
  const foreign = fix(intl.invoices);
  if (!invoices && !foreign) return ws;
  return { ...ws, ...(invoices ? { invoices } : {}), intl: { ...intl, ...(foreign ? { invoices: foreign } : {}) } };
}

/**
 * Ends again a plan a currency change replaced, when a copy that hadn't seen the change wrote it back (a pause,
 * resume or edit from an older tab or offline PWA brings back `endMonth: ""`, or undeletes a plan replaced as a
 * whole): endMonth becomes planEnd (the month before the replacement starts), or the plan is deleted again when that
 * is before its start. updatedAt + 1, never the clock, so every build's last-writer-wins merge keeps the repair and
 * every device and the server repair to the same bytes; it only reads replacements, so one pass is the fixed point.
 * Months the stale copy billed stay, for monthsBilledTwice to show. `ws` itself when nothing changes.
 */
function repairReplacedPlans(ws: Workspace): Workspace {
  const intl = ws.intl;
  if (!intl) return ws;
  const fix = (map: Record<string, RecurringPlan>): Record<string, RecurringPlan> | null => {
    let out: Record<string, RecurringPlan> | null = null;
    for (const plan of Object.values(map)) {
      if (plan.deletedAt) continue;
      const end = planEnd(ws, plan);
      if (end === plan.endMonth) continue;
      const at = plan.updatedAt + 1;
      out ??= { ...map };
      out[plan.id] = end < plan.startMonth ? { ...plan, updatedAt: at, deletedAt: at } : { ...plan, endMonth: end, updatedAt: at };
    }
    return out;
  };
  const recurring = fix(ws.recurring);
  const foreign = fix(intl.recurring);
  if (!recurring && !foreign) return ws;
  return { ...ws, ...(recurring ? { recurring } : {}), intl: { ...intl, ...(foreign ? { recurring: foreign } : {}) } };
}

/**
 * Settles the export mark (§6) of a foreign plan month an older build generated. Copies of the app from before the
 * carry (PR 3, open tabs and offline PWAs) generate the same month id without the mark, and the later copy wins the
 * merge, so without this the LUT line would depend on which device generated the month last, and every later month
 * would carry the loss. Such a month is unedited, written once (createdAt === updatedAt; this build writes its own
 * generated months settled, updatedAt = createdAt + 1), not created together with its plan by the invoice sheet, and
 * has no payment, reminder or void. It gets the mark carriedExportMark gives it now, and updatedAt + 1 (never the
 * clock): the settled copy wins every build's merge, and the month is never re-derived later, so deleting or
 * re-ticking an earlier month never changes a month already issued. Month by month in order, so one pass is the
 * fixed point and every device and the server settle to the same bytes. `ws` itself when nothing changes.
 */
function repairExportMarks(ws: Workspace): Workspace {
  const intl = ws.intl;
  if (!intl) return ws;
  const candidates: { month: string; invoice: Invoice; plan: RecurringPlan }[] = [];
  for (const invoice of Object.values(intl.invoices)) {
    if (invoice.exportLut || invoice.deletedAt || invoice.voided || !invoice.recurringId || invoice.createdAt !== invoice.updatedAt
      || invoice.payments.length || invoice.reminders.length) continue;
    const plan = own(intl.recurring, invoice.recurringId);
    const month = plan ? planMonthOf(plan, invoice) : "";
    if (!plan || !month || invoice.createdAt === plan.createdAt) continue;
    candidates.push({ month, invoice, plan });
  }
  if (!candidates.length) return ws;
  candidates.sort((a, b) => (a.month === b.month ? (a.invoice.id < b.invoice.id ? -1 : 1) : a.month < b.month ? -1 : 1));
  const invoices: Record<string, Invoice> = { ...intl.invoices };
  let view = ws;
  for (const { month, invoice, plan } of candidates) {
    const mark = carriedExportMark(view, plan, month);
    invoices[invoice.id] = { ...invoice, ...(mark ? { exportLut: true as const } : {}), updatedAt: invoice.updatedAt + 1 };
    view = { ...ws, intl: { ...intl, invoices } };
  }
  return view;
}

// ---------------------------------------------------------------------------
// International payment details and the GST export note (spec §1.6, §6)

const PAY_DETAIL_FIELDS = ["accountName", "bankName", "swift", "account", "bankDetails", "payUrl"] as const;

/**
 * The receiving details for one currency: the currency's own set (settings.byCurrency) when present, else the
 * business-level fields. A set is used whole, never mixed field by field with the other, so a payer never sees
 * one currency's account with another currency's routing. Undefined without settings.
 */
export function payDetailsFor(settings: IntlSettings | undefined, currency: ForeignCurrency): PayDetailsFields | undefined {
  if (!settings) return undefined;
  const source = settings.byCurrency?.[currency] ?? settings;
  const out = {} as PayDetailsFields;
  for (const field of PAY_DETAIL_FIELDS) out[field] = typeof source[field] === "string" ? source[field] : "";
  return out;
}

/**
 * Whether a payer abroad can pay in `currency` from the saved details: a bank account (name, account and a SWIFT
 * code or routing text) or a payment link. Pay links for foreign-currency invoices require it (no_intl).
 */
export function intlPayable(settings: IntlSettings | undefined, currency: ForeignCurrency): boolean {
  const d = payDetailsFor(settings, currency);
  if (!d) return false;
  return Boolean((d.accountName.trim() && d.account.trim() && (d.swift.trim() || d.bankDetails.trim())) || safePayUrl(d.payUrl));
}

/** The client's default billing currency: its live intl.clients entry, else "INR". It only pre-fills the invoice sheet. */
export function clientCurrency(ws: Workspace, clientId: string): CurrencyCode {
  const entry = own(ws.intl?.clients, clientId);
  return entry && !entry.deletedAt && isForeignCurrency(entry.currency) ? entry.currency : "INR";
}

/**
 * Sets a client's billing currency. A foreign currency writes the side record; "INR" tombstones an existing one
 * (INR is the default and is never written). Unchanged → the same workspace, so saving a client writes nothing new.
 */
export function setClientCurrency(ws: Workspace, clientId: string, currency: CurrencyCode, now: number): Workspace {
  const entry = own(ws.intl?.clients, clientId);
  if (isForeignCurrency(currency)) {
    if (entry && !entry.deletedAt && entry.currency === currency) return ws;
    const intl = ws.intl ?? emptyIntl();
    return { ...ws, intl: { ...intl, clients: { ...intl.clients, [clientId]: { currency, updatedAt: now } } } };
  }
  if (!ws.intl || !entry || entry.deletedAt) return ws;
  return { ...ws, intl: { ...ws.intl, clients: { ...ws.intl.clients, [clientId]: { ...entry, deletedAt: now, updatedAt: now } } } };
}

/**
 * The business's clients-abroad settings, patched (one last-writer-wins record). The result goes through the
 * sanitizer's own rules (normalized fields, LUT fields only with the LUT on, empty per-currency sets dropped), so
 * what is kept in memory is exactly what the next load would read.
 */
export function updateIntlSettings(ws: Workspace, patch: Partial<Omit<IntlSettings, "updatedAt">>, now: number): Workspace {
  const intl = ws.intl ?? emptyIntl();
  const settings = sanitizeIntlSettings({ ...(intl.settings ?? emptyIntlSettings(now)), ...patch, updatedAt: now });
  if (!settings) return ws;
  // An all-empty save with no record yet writes nothing: an INR-only book keeps its bytes (no intl key). An existing
  // record is always written, so turning everything off beats an older record on another device.
  if (!intl.settings && settingsEmpty(settings)) return ws;
  return { ...ws, intl: { ...intl, settings } };
}

/** What the Clients abroad form edits: the settings record without its timestamp. */
export type IntlSettingsForm = Omit<IntlSettings, "updatedAt" | "byCurrency"> & { byCurrency: Partial<Record<ForeignCurrency, PayDetailsFields>> };

/**
 * A save from the Clients abroad form: only what the user changed between `before` (the form as it was filled) and
 * `after` is applied, onto the settings as they are in `ws` now. Sync or another tab may have merged newer settings
 * into `ws` since the form was filled, and a field, the LUT group or a per-currency set the user didn't touch keeps
 * that newer value. The LUT toggle, ARN and year move together; a per-currency set moves whole. Nothing changed →
 * `ws` itself (no write).
 */
export function editIntlSettings(ws: Workspace, before: IntlSettingsForm, after: IntlSettingsForm, now: number): Workspace {
  const patch: Partial<Omit<IntlSettings, "updatedAt">> = {};
  if (before.on !== after.on) patch.on = after.on;
  for (const field of PAY_DETAIL_FIELDS) if (before[field] !== after[field]) patch[field] = after[field];
  if (before.exportUnderLut !== after.exportUnderLut || before.lutArn !== after.lutArn || before.lutFy !== after.lutFy) {
    patch.exportUnderLut = after.exportUnderLut;
    patch.lutArn = after.lutArn;
    patch.lutFy = after.lutFy;
  }
  const sameSet = (a?: PayDetailsFields, b?: PayDetailsFields) => PAY_DETAIL_FIELDS.every((f) => (a?.[f] ?? "") === (b?.[f] ?? ""));
  const touched = FOREIGN_CURRENCIES.filter((c) => !sameSet(own(before.byCurrency, c), own(after.byCurrency, c)));
  if (touched.length) {
    const byCurrency: Partial<Record<ForeignCurrency, PayDetailsFields>> = { ...ws.intl?.settings?.byCurrency };
    for (const c of touched) {
      const set = own(after.byCurrency, c);
      if (set) byCurrency[c] = set;
      else delete byCurrency[c];
    }
    patch.byCurrency = byCurrency;
  }
  if (!Object.keys(patch).length) return ws;
  return updateIntlSettings(ws, patch, now);
}

/**
 * The export line for an invoice: only for a foreign invoice the user marked as an export (exportLut), with the
 * LUT toggle and ARN set, a business GSTIN, a client without a GSTIN, and the issue date in the LUT's financial
 * year. Otherwise "". The currency alone never makes an invoice an export (IGST Act s.2(6)).
 */
function exportNoteFor(settings: IntlSettings | undefined, business: Business, client: Client | undefined, invoice: Invoice): string {
  if (!settings?.exportUnderLut || invoice.exportLut !== true || !isForeignCurrency(invoice.currency)) return "";
  if (!business.gstin.trim() || client?.gstin.trim()) return "";
  return exportNote(settings.lutArn, settings.lutFy, invoice.issueDate);
}

export function invoiceExportNote(ws: Workspace, invoice: Invoice): string {
  return exportNoteFor(ws.intl?.settings, ws.business, own(ws.clients, invoice.clientId), invoice);
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
/** A factual note of the supplier's MSMED rights, for business buyers; only with a valid Udyam number. */
export function msmeRightsLine(business: Business, lang: ReminderLang): string {
  if (!isUdyam(business.udyam)) return "";
  return lang === "hi"
    ? `हम एक पंजीकृत सूक्ष्म/लघु उद्यम हैं (Udyam ${business.udyam})। MSMED Act के तहत भुगतान तय क्रेडिट अवधि (अधिकतम 45 दिन; लिखित समझौता न हो तो 15 दिन) में देय है; देर से भुगतान पर चक्रवृद्धि ब्याज लगता है (धारा 16), और व्यावसायिक खरीदार MSE को देर से किया गया भुगतान उसी वर्ष घटा सकता है जिसमें भुगतान किया गया हो (आयकर अधिनियम का 43B(h) नियम, जो 2025 के अधिनियम में भी जारी है)।`
    : `We are a registered micro/small enterprise (Udyam ${business.udyam}). Under the MSMED Act, payment is due within the agreed credit period of up to 45 days (15 days without a written agreement); later payments carry compound interest (Section 16), and a business buyer can deduct a late payment to an MSE only in the year it is paid (the Income-tax Act's 43B(h) rule, carried into the 2025 Act).`;
}

/**
 * How a client abroad pays, for a reminder without a pay link: the bank block (only the lines that are set) and
 * the payment URL, or the URL alone, or nothing.
 */
function foreignPayLines(details: PayDetailsFields | undefined, lang: ReminderLang): string[] {
  if (!details) return [];
  const hi = lang === "hi";
  const url = safePayUrl(details.payUrl);
  const raw = details.account.trim();
  const account = looksLikeIban(raw) ? formatIban(raw) : raw;
  const bank: string[] = [];
  if (details.accountName.trim()) bank.push(`${hi ? "खाताधारक" : "Account name"}: ${details.accountName.trim()}`);
  if (details.bankName.trim()) bank.push(`${hi ? "बैंक" : "Bank"}: ${details.bankName.trim()}`);
  if (details.swift.trim()) bank.push(`SWIFT/BIC: ${details.swift.trim()}`);
  if (account) bank.push(`${hi ? "IBAN / खाता नंबर" : "IBAN / account no."}: ${account}`);
  for (const line of details.bankDetails.split("\n")) if (line.trim()) bank.push(line.trim());
  if (!bank.length) return url ? [`${hi ? "ऑनलाइन भुगतान करें" : "Pay online"}: ${url}`] : [];
  const lines = [hi ? "बैंक ट्रांसफ़र से भुगतान करें:" : "Pay by bank transfer:", ...bank];
  if (url) lines.push(`${hi ? "या ऑनलाइन भुगतान करें" : "Or pay online"}: ${url}`);
  return lines;
}

/**
 * INR invoices: the UPI ID (or the pay link) and, if asked, the MSMED rights line; byte-identical to the text
 * before clients abroad. Foreign invoices (spec §3.8): the amount in its currency, the pay link or the bank
 * details for that currency (`intl`, the book's settings), the GST export line when it applies, and never UPI,
 * UTR or MSMED text.
 */
export function reminderMessage(
  view: InvoiceView, business: Business, tone: ReminderTone, payLink?: string, lang: ReminderLang = "en", msmeRights = false, intl?: IntlSettings,
): string {
  const currency = view.currency;
  const foreign = isForeignCurrency(currency);
  // The MSMED Act protects suppliers against buyers in India: never on a foreign invoice, even if asked.
  const rights = msmeRights && !foreign ? msmeRightsLine(business, lang) : "";
  const amount = formatMoney(view.balancePaise, currency);
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
    else if (foreign) lines.push(...foreignPayLines(payDetailsFor(intl, currency), lang));
    else if (business.upiId) lines.push(`UPI से भुगतान करें: ${business.upiId}`);
    if (rights) lines.push(rights);
    // Statutory text, kept in English in Hindi reminders too (the reader is abroad).
    const note = foreign ? exportNoteFor(intl, business, view.client, view.invoice) : "";
    if (note) lines.push(note);
    lines.push(tone === "friendly" ? "धन्यवाद!" : foreign
      ? "अगर आपने भुगतान कर दिया है, तो कृपया ट्रांसफ़र रेफ़रेंस भेज दें ताकि हम रिकॉर्ड अपडेट कर सकें। धन्यवाद!"
      : "अगर आपने भुगतान कर दिया है, तो कृपया UTR भेज दें ताकि हम रिकॉर्ड अपडेट कर सकें। धन्यवाद!");
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
  else if (foreign) lines.push(...foreignPayLines(payDetailsFor(intl, currency), lang));
  else if (business.upiId) lines.push(`Pay by UPI to: ${business.upiId}`);
  if (rights) lines.push(rights);
  const note = foreign ? exportNoteFor(intl, business, view.client, view.invoice) : "";
  if (note) lines.push(note);
  lines.push(tone === "friendly" ? "Thank you!" : foreign
    ? "If you have already paid, please share the transfer reference so we can update our records. Thank you!"
    : "If you have already paid, please share the UTR so we can update our records. Thank you!");
  lines.push(`— ${from}`);
  return lines.join("\n");
}

/**
 * wa.me link; 10-digit Indian numbers get the 91 country code. With `international` (the invoice is foreign, or
 * the client is billed in a foreign currency), a number typed with "+" or "00" is used as typed, without 91 and
 * without dropping a leading 0 (only a bracketed "(0)" trunk prefix goes). Every other number keeps today's rule (so an INR client's "+98765 43210" still
 * goes to 919876543210).
 */
/**
 * A number typed with "+" or "00" (a client abroad), as dialled from another country: country code and number, with
 * the bracketed trunk prefix dropped ("+44 (0)20 7946 0958" → 442079460958; every other 0 stays). "" when the number
 * isn't typed that way. WhatsApp and SMS both use it, so both go to the same number.
 */
export function internationalDigits(phone: string): string {
  const typed = phone.trim();
  if (!typed.startsWith("+") && !typed.startsWith("00")) return "";
  const digits = typed.replace(/\(\s*0\s*\)/g, "").replace(/\D/g, "");
  return typed.startsWith("+") ? digits : digits.slice(2);
}

export function whatsappLink(phone: string, text: string, opts?: { international?: boolean }): string {
  let digits = phone.replace(/\D/g, "");
  const typed = phone.trim();
  if (opts?.international && (typed.startsWith("+") || typed.startsWith("00"))) {
    digits = internationalDigits(phone);
    const base = digits.length >= 8 ? `https://wa.me/${digits}` : "https://wa.me/";
    return `${base}?text=${encodeURIComponent(text)}`;
  }
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

/** Rupees credited on an invoice's payments, only when every payment has a figure (a partial sum never looks complete). */
function creditedOf(invoice: Invoice): string {
  const payments = invoice.payments;
  if (!payments.length || !payments.every((p) => p.inrCreditedPaise)) return "";
  return paiseToDecimal(payments.reduce((sum, p) => sum + (p.inrCreditedPaise ?? 0), 0));
}

/**
 * Invoices as CSV. Without a foreign invoice: exactly the columns and bytes from before clients abroad.
 * With one (spec §3.7): the (INR) columns stay rupees only (empty on foreign rows, so a SUM over them is still
 * rupees), and Currency, Amount, Paid, Balance (each in the row's own currency) and INR credited are appended.
 */
export function invoicesCsv(views: InvoiceView[]): string {
  const header = ["Invoice", "Client", "Phone", "Issue date", "Due date", "Amount (INR)", "Paid (INR)", "Balance (INR)", "Status", "Days past due", "Description"];
  const mixed = views.some((v) => v.currency !== "INR");
  const rows = views.map((v) => {
    const inr = v.currency === "INR";
    const cells: (string | number)[] = [
      v.invoice.number, v.client?.name ?? "", v.client?.phone ?? "", v.invoice.issueDate, v.invoice.dueDate,
      inr ? paiseToDecimal(v.invoice.amountPaise) : "", inr ? paiseToDecimal(v.paidPaise) : "", inr ? paiseToDecimal(v.balancePaise) : "",
      v.state, Math.max(0, v.daysPastDue), v.invoice.description,
    ];
    if (mixed) {
      cells.push(v.currency, minorToDecimal(v.invoice.amountPaise), minorToDecimal(v.paidPaise), minorToDecimal(v.balancePaise), inr ? "" : creditedOf(v.invoice));
    }
    return cells.map(csvCell).join(",");
  });
  if (mixed) header.push("Currency", "Amount", "Paid", "Balance", "INR credited");
  return [header.join(","), ...rows].join("\n");
}
