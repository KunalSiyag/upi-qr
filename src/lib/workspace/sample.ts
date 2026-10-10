import { addDays, upsertClient, upsertInvoice, type Invoice, type Workspace } from "./model.ts";

/**
 * Demo records for an empty workspace so first-time visitors see the chase
 * list, aging and reminders working. Every id contains "sample" so the whole
 * set can be removed in one step.
 */
export const SAMPLE_MARK = "sample";

export function isSampleId(id: string): boolean {
  return id.includes(SAMPLE_MARK);
}

export function hasSampleData(ws: Workspace): boolean {
  return Object.values(ws.invoices).some((i) => !i.deletedAt && isSampleId(i.id));
}

export function addSampleData(ws: Workspace, today: string, now: number): Workspace {
  const clients = [
    { id: "cli_sample01", name: "Sharma Traders (sample)", phone: "" },
    { id: "cli_sample02", name: "Riya Kapoor (sample)", phone: "" },
    { id: "cli_sample03", name: "Bright Kids School (sample)", phone: "" },
  ];
  let next = ws;
  for (const c of clients) next = upsertClient(next, { ...c, email: "", gstin: "", createdAt: now, updatedAt: now }, now);
  const invoice = (id: string, number: string, clientId: string, issueOffset: number, dueOffset: number, amountPaise: number, description: string, paid = 0): Invoice => ({
    id, number, clientId, issueDate: addDays(today, issueOffset), dueDate: addDays(today, dueOffset), amountPaise, description,
    payments: paid ? [{ id: `pay_${id.slice(4)}`, amountPaise: paid, date: addDays(today, dueOffset - 2), mode: "upi", reference: "", createdAt: now }] : [],
    reminders: [], voided: false, createdAt: now, updatedAt: now,
  });
  for (const inv of [
    invoice("inv_sample01", "SAMPLE-001", "cli_sample01", -50, -20, 2_850_000, "Website redesign — final milestone", 1_000_000),
    invoice("inv_sample02", "SAMPLE-002", "cli_sample02", -15, 0, 450_000, "October tuition fees"),
    invoice("inv_sample03", "SAMPLE-003", "cli_sample03", -2, 10, 1_200_000, "Annual day photography"),
    invoice("inv_sample04", "SAMPLE-004", "cli_sample02", -40, -25, 450_000, "September tuition fees", 450_000),
  ]) next = upsertInvoice(next, inv, now);
  return next;
}

/** Tombstones every sample record (so a synced copy drops them too). */
export function removeSampleData(ws: Workspace, now: number): Workspace {
  const clients = Object.fromEntries(Object.entries(ws.clients).map(([id, c]) => [id, isSampleId(id) && !c.deletedAt ? { ...c, deletedAt: now, updatedAt: now } : c]));
  const invoices = Object.fromEntries(Object.entries(ws.invoices).map(([id, i]) => [id, isSampleId(id) && !i.deletedAt ? { ...i, deletedAt: now, updatedAt: now } : i]));
  return { ...ws, clients, invoices };
}
