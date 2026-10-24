import { allInvoiceViews, allLiveInvoices, allLiveRecurring, chaseList, currencyOf, emptyWorkspace, generateRecurring, planMonths, recurringInvoiceId, viewInvoice, type InvoiceView, type Workspace } from "./model.ts";
import { addMoney, formatMoney, isForeignCurrency, moneyList, type ForeignCurrency, type MoneyByCurrency } from "./currency.ts";
import { PRIMARY_BOOK_ID } from "./books.ts";

/**
 * Lock-screen business names (spec Open question 6): off. When on, multi-business
 * digests and claim alerts name the business; the privacy lines ship with the flip.
 */
export const NAME_BUSINESSES_ON_LOCK_SCREEN = false;

/** The morning "who to chase today" notification, or null when nothing is due. */
export interface Digest {
  title: string;
  body: string;
  url: string;
  tag: string;
  count: number;
}

/**
 * "₹25,000 overdue", or per currency "₹25,000 + US$1,200.00 overdue" (INR first, then CURRENCIES order).
 * A ₹ figure never includes a foreign amount, and an INR-only book gets exactly the text from before.
 */
function overdueText(overdue: InvoiceView[]): string {
  let sums: MoneyByCurrency = {};
  for (const view of overdue) sums = addMoney(sums, view.currency, view.balancePaise);
  return `${moneyList(sums).map((m) => formatMoney(m.minor, m.currency)).join(" + ")} overdue`;
}

export function morningDigest(ws: Workspace, today: string): Digest | null {
  // Include this month's recurring invoices even if the app hasn't been opened yet.
  const chase = chaseList(allInvoiceViews(generateRecurring(ws, today, 0).ws, today));
  if (chase.length === 0) return null;
  const overdue = chase.filter((v) => v.state === "overdue");
  const dueToday = chase.filter((v) => v.daysPastDue === 0);
  const parts: string[] = [];
  if (overdue.length) parts.push(overdueText(overdue));
  if (dueToday.length) parts.push(`${dueToday.length} due today`);
  const top = chase[0];
  const who = top.client?.name ?? top.invoice.number;
  const when = top.daysPastDue > 0 ? `${top.daysPastDue} day${top.daysPastDue === 1 ? "" : "s"} late` : "due today";
  const body = `${parts.join(", ")}. Start with ${who} — ${formatMoney(top.balancePaise, top.currency)}, ${when}.`;
  return {
    title: `${chase.length} invoice${chase.length === 1 ? "" : "s"} to chase today`,
    body: body.length > 180 ? `${body.slice(0, 177)}…` : body,
    url: "/app/",
    tag: `digest-${today}`,
    count: chase.length,
  };
}

/**
 * One notification for all of an account's books. One book: exactly
 * morningDigest (byte-identical). Several: each book's views are built inside
 * that book (never one merged workspace, which would collapse same-named
 * clients), then chased together. With nameBooks the top client is followed by
 * its business name. The URL opens the top book.
 */
export function morningDigestBooks(books: { id: string; name: string; ws: Workspace }[], today: string, nameBooks: boolean): Digest | null {
  if (books.length === 0) return null;
  if (books.length === 1) return morningDigest(books[0].ws, today);
  const owner = new Map<InvoiceView, { id: string; name: string }>();
  const views: InvoiceView[] = [];
  for (const book of books) {
    for (const view of allInvoiceViews(generateRecurring(book.ws, today, 0).ws, today)) {
      owner.set(view, book);
      views.push(view);
    }
  }
  const chase = chaseList(views);
  if (chase.length === 0) return null;
  const overdue = chase.filter((v) => v.state === "overdue");
  const dueToday = chase.filter((v) => v.daysPastDue === 0);
  const parts: string[] = [];
  if (overdue.length) parts.push(overdueText(overdue));
  if (dueToday.length) parts.push(`${dueToday.length} due today`);
  const top = chase[0];
  const book = owner.get(top) as { id: string; name: string };
  const who = top.client?.name ?? top.invoice.number;
  const label = nameBooks && book.name.trim() ? ` (${book.name.trim()})` : "";
  const when = top.daysPastDue > 0 ? `${top.daysPastDue} day${top.daysPastDue === 1 ? "" : "s"} late` : "due today";
  const body = `${parts.join(", ")}. Start with ${who}${label} — ${formatMoney(top.balancePaise, top.currency)}, ${when}.`;
  return {
    title: `${chase.length} invoice${chase.length === 1 ? "" : "s"} to chase today`,
    body: body.length > 180 ? `${body.slice(0, 177)}…` : body,
    url: book.id === PRIMARY_BOOK_ID ? "/app/" : `/app/?business=${encodeURIComponent(book.id)}`,
    tag: `digest-${today}`,
    count: chase.length,
  };
}

// ---------------------------------------------------------------------------
// Compact projection for the daily cron: everything morningDigest needs from a
// workspace (open invoices + monthly plans) in a few KB instead of the full
// document (up to 900 KB), so the 09:00 run reads little and scales with accounts.

/** The version written today. v2 adds the book's business name (multi-business digest); readers accept both. */
export const PROJECTION_VERSION = 1;
export const PROJECTION_VERSIONS_READ: readonly number[] = [1, 2];
const MAX_PROJECTED_NAME = 200;
const MAX_PROJECTED_INVOICES = 500;
const RECURRING_LOOKBACK_MONTHS = 13;

export interface DigestProjection {
  v: number;
  /** v2: the book's business name. Parsed v1 projections carry "". Not written while PROJECTION_VERSION is 1. */
  name?: string;
  /** Open (unpaid, not void) invoices: id, number, client name, issue date, due date, balance paise. */
  open: [string, string, string, string, string, number][];
  /** Live, unpaused plans: id, client name, amount paise, day of month, due-after days, start month, end month, months already created. */
  plans: [string, string, number, number, number, string, string, string[]][];
  /**
   * Foreign-currency open invoices and plans, the same tuples plus the currency (amounts in its minor units).
   * Present only when the book has some; readers from before clients abroad ignore it, so `open`/`plans` stay INR.
   */
  fx?: {
    open: [string, string, string, string, string, number, ForeignCurrency][];
    plans: [string, string, number, number, number, string, string, string[], ForeignCurrency][];
  };
}

/** INR invoices and plans in `open`/`plans`, foreign ones in `fx` (docs/spec-foreign-clients.md §4.7). */
export function digestProjection(ws: Workspace): DigestProjection {
  const today = "9999-12-31"; // state-independent: keep every open invoice, the digest re-dates them
  // One cap over both lists, in due-date order (INR before foreign on equal dates, as allLiveInvoices lists them).
  const views = allLiveInvoices(ws)
    .map((inv) => viewInvoice(inv, ws.clients, today))
    .filter((v) => v.balancePaise > 0 && !v.invoice.voided)
    .sort((a, b) => a.invoice.dueDate.localeCompare(b.invoice.dueDate))
    .slice(0, MAX_PROJECTED_INVOICES);
  const open: DigestProjection["open"] = [];
  const fxOpen: NonNullable<DigestProjection["fx"]>["open"] = [];
  for (const v of views) {
    const tuple: DigestProjection["open"][number] = [v.invoice.id, v.invoice.number, v.client?.name ?? "", v.invoice.issueDate, v.invoice.dueDate, v.balancePaise];
    if (isForeignCurrency(v.currency)) fxOpen.push([...tuple, v.currency]);
    else open.push(tuple);
  }
  const plans: DigestProjection["plans"] = [];
  const fxPlans: NonNullable<DigestProjection["fx"]>["plans"] = [];
  for (const plan of allLiveRecurring(ws)) {
    const client = Object.prototype.hasOwnProperty.call(ws.clients, plan.clientId) ? ws.clients[plan.clientId] : undefined;
    if (plan.paused || !client || client.deletedAt) continue;
    // Month markers come from the map the plan's invoices live in (planMonths): intl.invoices for a foreign plan.
    const months = planMonths(ws, plan).slice(-RECURRING_LOOKBACK_MONTHS);
    const tuple: DigestProjection["plans"][number] = [plan.id, client.name, plan.amountPaise, plan.dayOfMonth, plan.dueAfterDays, plan.startMonth, plan.endMonth, months];
    const currency = currencyOf(plan);
    if (isForeignCurrency(currency)) fxPlans.push([...tuple, currency]);
    else plans.push(tuple);
  }
  const projection: DigestProjection = { v: PROJECTION_VERSION, open, plans };
  if (fxOpen.length || fxPlans.length) projection.fx = { open: fxOpen, plans: fxPlans };
  return projection;
}

/** v2 projection of a non-primary book: v1 plus the book's business name. The primary keeps writing v1. */
export function bookProjection(ws: Workspace): DigestProjection {
  return { ...digestProjection(ws), v: 2, name: ws.business.name.trim().slice(0, MAX_PROJECTED_NAME) };
}

/** Rebuilds just enough of a workspace from a projection to run morningDigest. */
export function workspaceFromProjection(p: DigestProjection): Workspace {
  const ws = emptyWorkspace();
  const clientId = (name: string) => {
    const id = `cli_p${Object.keys(ws.clients).length.toString().padStart(6, "0")}`;
    const existing = Object.values(ws.clients).find((c) => c.name === name);
    if (existing) return existing.id;
    ws.clients[id] = { id, name, phone: "", email: "", gstin: "", createdAt: 0, updatedAt: 0 };
    return id;
  };
  for (const [id, number, client, issueDate, dueDate, balance] of p.open) {
    ws.invoices[id] = { id, number, clientId: clientId(client), issueDate, dueDate, amountPaise: balance, description: "", payments: [], reminders: [], voided: false, createdAt: 0, updatedAt: 0 };
  }
  for (const [id, client, amountPaise, dayOfMonth, dueAfterDays, startMonth, endMonth, months] of p.plans) {
    const cid = clientId(client);
    ws.recurring[id] = { id, clientId: cid, amountPaise, description: "", dayOfMonth, dueAfterDays, startMonth, endMonth, paused: false, createdAt: 0, updatedAt: 0 };
    // Months that already exist (paid, open or deleted) must not be generated again.
    for (const month of months) {
      const rid = recurringInvoiceId(id, month);
      if (!ws.invoices[rid]) ws.invoices[rid] = { id: rid, number: "", clientId: cid, issueDate: `${month}-01`, dueDate: `${month}-01`, amountPaise: 0, description: "", payments: [], reminders: [], voided: false, recurringId: id, createdAt: 0, updatedAt: 0, deletedAt: 1 };
    }
  }
  if (p.fx) {
    // Foreign records go where the model keeps them: ws.intl, with each plan's month markers in intl.invoices.
    const intl: NonNullable<Workspace["intl"]> = { invoices: {}, recurring: {}, clients: {} };
    for (const [id, number, client, issueDate, dueDate, balance, currency] of p.fx.open) {
      intl.invoices[id] = { id, number, clientId: clientId(client), issueDate, dueDate, amountPaise: balance, description: "", payments: [], reminders: [], voided: false, currency, createdAt: 0, updatedAt: 0 };
    }
    for (const [id, client, amountPaise, dayOfMonth, dueAfterDays, startMonth, endMonth, months, currency] of p.fx.plans) {
      const cid = clientId(client);
      intl.recurring[id] = { id, clientId: cid, amountPaise, description: "", dayOfMonth, dueAfterDays, startMonth, endMonth, paused: false, currency, createdAt: 0, updatedAt: 0 };
      for (const month of months) {
        const rid = recurringInvoiceId(id, month);
        if (!intl.invoices[rid]) intl.invoices[rid] = { id: rid, number: "", clientId: cid, issueDate: `${month}-01`, dueDate: `${month}-01`, amountPaise: 0, description: "", payments: [], reminders: [], voided: false, recurringId: id, currency, createdAt: 0, updatedAt: 0, deletedAt: 1 };
      }
    }
    ws.intl = intl;
  }
  return ws;
}

/** `fx` when present: both arrays, every tuple of its length with a foreign currency last. Anything else is unusable. */
function parseFx(raw: unknown): DigestProjection["fx"] | null {
  if (!raw || typeof raw !== "object") return null;
  const fx = raw as Record<string, unknown>;
  if (!Array.isArray(fx.open) || !Array.isArray(fx.plans)) return null;
  const ok = (rows: unknown[], length: number) => rows.every((t) => Array.isArray(t) && t.length === length && isForeignCurrency(t[length - 1]));
  if (!ok(fx.open, 7) || !ok(fx.plans, 9)) return null;
  return { open: fx.open as NonNullable<DigestProjection["fx"]>["open"], plans: fx.plans as NonNullable<DigestProjection["fx"]>["plans"] };
}

export function parseProjection(raw: unknown): DigestProjection | null {
  const value = typeof raw === "string" ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw;
  if (!value || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  if (typeof r.v !== "number" || !PROJECTION_VERSIONS_READ.includes(r.v) || !Array.isArray(r.open) || !Array.isArray(r.plans)) return null;
  if (r.v >= 2 && typeof r.name !== "string") return null;
  const name = r.v >= 2 ? (r.name as string).slice(0, MAX_PROJECTED_NAME) : "";
  const parsed: DigestProjection = { v: r.v, name, open: r.open as DigestProjection["open"], plans: r.plans as DigestProjection["plans"] };
  if (r.fx !== undefined) {
    // A bad fx makes the whole projection unusable: the runner then reads the workspace instead.
    const fx = parseFx(r.fx);
    if (!fx) return null;
    parsed.fx = fx;
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Projection storage (KV implementation in kvCloudStore.ts)

export interface AccountProjections {
  /** Book id → projection (the primary from the legacy key). */
  projections: Record<string, DigestProjection>;
  /** The stored book index, raw (null when the account never registered a book). */
  index: unknown;
}

export interface ProjectionStore {
  /** The primary book's projection. */
  get(owner: string): Promise<DigestProjection | null>;
  put(owner: string, bookId: string, projection: DigestProjection): Promise<void>;
  /** Non-primary books only; the primary's projection is kept. */
  drop(owner: string, bookId: string): Promise<void>;
  /** Ids of the stored non-primary projections. */
  bookIds(owner: string): Promise<string[]>;
  /** Everything the digest needs for one account, in one request. */
  getAll(owner: string): Promise<AccountProjections>;
}

/** Assembles getAll's result from the raw primary value, the book hash and the index. */
export function projectionsFrom(primary: unknown, hash: Record<string, unknown> | null | undefined, index: unknown): AccountProjections {
  const projections: Record<string, DigestProjection> = {};
  for (const [id, raw] of Object.entries(hash ?? {})) {
    if (id === PRIMARY_BOOK_ID) continue;
    const parsed = parseProjection(raw);
    if (parsed) projections[id] = parsed;
  }
  const first = parseProjection(primary ?? null);
  if (first) projections[PRIMARY_BOOK_ID] = first;
  return { projections, index: index ?? null };
}

/** In-memory ProjectionStore for tests and local development. `index` reads the account's book index (raw). */
export function memoryProjectionStore(index: (owner: string) => Promise<unknown> = async () => null): ProjectionStore & { primary: Map<string, string>; books: Map<string, Map<string, string>> } {
  const primary = new Map<string, string>();
  const books = new Map<string, Map<string, string>>();
  return {
    primary,
    books,
    async get(owner) { return parseProjection(primary.get(owner) ?? null); },
    async put(owner, bookId, projection) {
      if (bookId === PRIMARY_BOOK_ID) primary.set(owner, JSON.stringify(projection));
      else {
        if (!books.has(owner)) books.set(owner, new Map());
        books.get(owner)!.set(bookId, JSON.stringify(projection));
      }
    },
    async drop(owner, bookId) { if (bookId !== PRIMARY_BOOK_ID) books.get(owner)?.delete(bookId); },
    async bookIds(owner) { return [...(books.get(owner)?.keys() ?? [])]; },
    async getAll(owner) {
      return projectionsFrom(primary.get(owner) ?? null, Object.fromEntries(books.get(owner) ?? []), await index(owner));
    },
  };
}
