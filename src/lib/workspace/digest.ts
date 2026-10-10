import { chaseList, emptyWorkspace, formatPaise, generateRecurring, invoiceViews, liveInvoices, liveRecurring, recurringInvoiceId, viewInvoice, type Workspace } from "./model.ts";

/** The morning "who to chase today" notification, or null when nothing is due. */
export interface Digest {
  title: string;
  body: string;
  url: string;
  tag: string;
  count: number;
}

export function morningDigest(ws: Workspace, today: string): Digest | null {
  // Include this month's recurring invoices even if the app hasn't been opened yet.
  const chase = chaseList(invoiceViews(generateRecurring(ws, today, 0).ws, today));
  if (chase.length === 0) return null;
  const overdue = chase.filter((v) => v.state === "overdue");
  const dueToday = chase.filter((v) => v.daysPastDue === 0);
  const parts: string[] = [];
  if (overdue.length) parts.push(`${formatPaise(overdue.reduce((sum, v) => sum + v.balancePaise, 0))} overdue`);
  if (dueToday.length) parts.push(`${dueToday.length} due today`);
  const top = chase[0];
  const who = top.client?.name ?? top.invoice.number;
  const when = top.daysPastDue > 0 ? `${top.daysPastDue} day${top.daysPastDue === 1 ? "" : "s"} late` : "due today";
  const body = `${parts.join(", ")}. Start with ${who} — ${formatPaise(top.balancePaise)}, ${when}.`;
  return {
    title: `${chase.length} invoice${chase.length === 1 ? "" : "s"} to chase today`,
    body: body.length > 180 ? `${body.slice(0, 177)}…` : body,
    url: "/app/",
    tag: `digest-${today}`,
    count: chase.length,
  };
}

// ---------------------------------------------------------------------------
// Compact projection for the daily cron: everything morningDigest needs from a
// workspace (open invoices + monthly plans) in a few KB instead of the full
// document (up to 900 KB), so the 09:00 run reads little and scales with accounts.

export const PROJECTION_VERSION = 1;
const MAX_PROJECTED_INVOICES = 500;
const RECURRING_LOOKBACK_MONTHS = 13;

export interface DigestProjection {
  v: number;
  /** Open (unpaid, not void) invoices: id, number, client name, issue date, due date, balance paise. */
  open: [string, string, string, string, string, number][];
  /** Live, unpaused plans: id, client name, amount paise, day of month, due-after days, start month, end month, months already created. */
  plans: [string, string, number, number, number, string, string, string[]][];
}

export function digestProjection(ws: Workspace): DigestProjection {
  const today = "9999-12-31"; // state-independent: keep every open invoice, the digest re-dates them
  const open = liveInvoices(ws)
    .map((inv) => viewInvoice(inv, ws.clients, today))
    .filter((v) => v.balancePaise > 0 && !v.invoice.voided)
    .sort((a, b) => a.invoice.dueDate.localeCompare(b.invoice.dueDate))
    .slice(0, MAX_PROJECTED_INVOICES)
    .map((v): DigestProjection["open"][number] => [v.invoice.id, v.invoice.number, v.client?.name ?? "", v.invoice.issueDate, v.invoice.dueDate, v.balancePaise]);
  const plans = liveRecurring(ws)
    .filter((plan) => !plan.paused && ws.clients[plan.clientId] && !ws.clients[plan.clientId].deletedAt)
    .map((plan): DigestProjection["plans"][number] => {
      const months: string[] = [];
      for (const id of Object.keys(ws.invoices)) {
        const prefix = recurringInvoiceId(plan.id, "0000-00").slice(0, -6);
        if (id.startsWith(prefix)) months.push(`${id.slice(-6, -2)}-${id.slice(-2)}`);
      }
      months.sort();
      return [plan.id, ws.clients[plan.clientId].name, plan.amountPaise, plan.dayOfMonth, plan.dueAfterDays, plan.startMonth, plan.endMonth, months.slice(-RECURRING_LOOKBACK_MONTHS)];
    });
  return { v: PROJECTION_VERSION, open, plans };
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
  return ws;
}

export function parseProjection(raw: unknown): DigestProjection | null {
  const value = typeof raw === "string" ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw;
  if (!value || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  return r.v === PROJECTION_VERSION && Array.isArray(r.open) && Array.isArray(r.plans) ? (r as unknown as DigestProjection) : null;
}
