import assert from "node:assert/strict";
import { addSampleData, hasSampleData, removeSampleData } from "../src/lib/workspace/sample.ts";
import { generateRecurring, liveRecurring, MAX_BACKFILL_MONTHS, recurringInvoiceId, upsertPlan } from "../src/lib/workspace/model.ts";
import {
  addDays, addPayment, canonicalJson, eraseWorkspace, restoreFrom, agingBuckets, chaseList, clientBalances, daysBetween, deleteClient, deleteInvoice,
  emptyWorkspace, findClient, formatPaise, invoiceViews, invoicesCsv, isIsoDate, mergeWorkspaces, nextInvoiceNumber,
  paiseToDecimal, parseRupeesToPaise, pruneTombstones, reminderMessage, sanitizeWorkspace, summarize, updateBusiness,
  upsertClient, upsertInvoice, viewInvoice, whatsappLink,
} from "../src/lib/workspace/model.ts";

// Money parsing is exact (no float drift).
assert.equal(parseRupeesToPaise("0.1"), 10);
assert.equal(parseRupeesToPaise("1,250.5"), 125050);
assert.equal(parseRupeesToPaise("₹ 99.99"), 9999);
assert.equal(parseRupeesToPaise("1.005"), null);
assert.equal(parseRupeesToPaise("-5"), null);
assert.equal(parseRupeesToPaise("abc"), null);
assert.equal(formatPaise(12345678), "₹1,23,456.78");
assert.equal(formatPaise(1000000), "₹10,000");
assert.equal(paiseToDecimal(125050), "1250.50");

// Dates are timezone-independent calendar days.
assert.equal(daysBetween("2026-10-01", "2026-10-10"), 9);
assert.equal(daysBetween("2026-02-28", "2026-03-01"), 1);
assert.equal(addDays("2026-12-25", 15), "2027-01-09");
assert.equal(isIsoDate("2026-02-30"), false);
assert.equal(isIsoDate("2026-02-28"), true);

// Build a workspace.
const T = 1_790_000_000_000;
const today = "2026-10-10";
let ws = updateBusiness(emptyWorkspace(), { name: "Sharma Tuition", upiId: "sharma@okaxis", invoicePrefix: "ST-" }, T);
ws = upsertClient(ws, { id: "cli_aaaaaaaa", name: "Rohan", phone: "98765 43210", email: "", gstin: "", createdAt: T, updatedAt: T }, T);
ws = upsertClient(ws, { id: "cli_bbbbbbbb", name: "Acme Pvt Ltd", phone: "", email: "", gstin: "", createdAt: T, updatedAt: T }, T);
const inv = (id, number, clientId, issueDate, dueDate, amountPaise) => ({
  id, number, clientId, issueDate, dueDate, amountPaise, description: "", payments: [], reminders: [], voided: false, createdAt: T, updatedAt: T,
});
ws = upsertInvoice(ws, inv("inv_00000001", "ST-0001", "cli_aaaaaaaa", "2026-09-01", "2026-09-05", 300000), T); // 35 days late
ws = upsertInvoice(ws, inv("inv_00000002", "ST-0002", "cli_bbbbbbbb", "2026-08-01", "2026-08-15", 5000000), T); // 56 days late
ws = upsertInvoice(ws, inv("inv_00000003", "ST-0003", "cli_aaaaaaaa", "2026-10-05", "2026-10-15", 150000), T); // not due
ws = upsertInvoice(ws, inv("inv_00000004", "ST-0009", "cli_bbbbbbbb", "2026-10-01", "2026-10-10", 99999), T); // due today
assert.equal(nextInvoiceNumber(ws), "ST-0010");

// Partial payment, then full payment.
ws = addPayment(ws, "inv_00000001", { amountPaise: 100000, date: "2026-10-02", mode: "upi", reference: "123456789012" }, T + 1);
let v1 = viewInvoice(ws.invoices.inv_00000001, ws.clients, today);
assert.equal(v1.paidPaise, 100000);
assert.equal(v1.balancePaise, 200000);
assert.equal(v1.state, "overdue");
assert.equal(v1.daysPastDue, 35);
ws = addPayment(ws, "inv_00000001", { amountPaise: 200000, date: "2026-10-09", mode: "cash", reference: "" }, T + 2);
v1 = viewInvoice(ws.invoices.inv_00000001, ws.clients, today);
assert.equal(v1.state, "paid");
assert.equal(v1.balancePaise, 0);
// Invalid payment amounts are ignored.
assert.equal(addPayment(ws, "inv_00000003", { amountPaise: 0, date: today, mode: "upi", reference: "" }, T), ws);
assert.equal(addPayment(ws, "inv_00000003", { amountPaise: 1.5, date: today, mode: "upi", reference: "" }, T), ws);

const views = invoiceViews(ws, today);
const s = summarize(views, today);
assert.equal(s.outstandingPaise, 5000000 + 150000 + 99999);
assert.equal(s.overduePaise, 5000000);
assert.equal(s.overdueCount, 1);
assert.equal(s.dueSoonPaise, 150000 + 99999);
assert.equal(s.collectedThisMonthPaise, 300000);
assert.equal(s.openCount, 3);

const buckets = Object.fromEntries(agingBuckets(views).map((b) => [b.key, b.balancePaise]));
assert.deepEqual(buckets, { current: 249999, d1_15: 0, d16_30: 0, d31_45: 0, d45_plus: 5000000 });

assert.deepEqual(chaseList(views).map((v) => v.invoice.number), ["ST-0002", "ST-0009"]);
assert.equal(clientBalances(views).get("cli_bbbbbbbb").balancePaise, 5099999);

// Voided invoices carry no balance.
ws = upsertInvoice(ws, { ...ws.invoices.inv_00000004, voided: true }, T + 3);
assert.equal(viewInvoice(ws.invoices.inv_00000004, ws.clients, today).state, "void");
assert.equal(summarize(invoiceViews(ws, today), today).outstandingPaise, 5150000);

// Client de-duplication by phone (last 10 digits) or name.
assert.equal(findClient(ws, "", "+91 98765-43210")?.id, "cli_aaaaaaaa");
assert.equal(findClient(ws, "acme pvt ltd", "")?.id, "cli_bbbbbbbb");
assert.equal(findClient(ws, "Nobody", "12345"), undefined);
// Clients with live invoices cannot be deleted.
assert.equal(deleteClient(ws, "cli_aaaaaaaa", T + 4), ws);

// Reminders: UPI ID as plain text, never a upi:// link; WhatsApp gets +91.
const overdue = viewInvoice(ws.invoices.inv_00000002, ws.clients, today);
const msg = reminderMessage(overdue, ws.business, "overdue");
assert.match(msg, /ST-0002/);
assert.match(msg, /₹50,000/);
assert.match(msg, /56 days overdue/);
assert.match(msg, /sharma@okaxis/);
assert.doesNotMatch(msg, /upi:\/\//);
assert.match(reminderMessage(overdue, ws.business, "overdue", "https://www.proupiqr.in/i/x/"), /Pay securely here: https:\/\/www\.proupiqr\.in\/i\/x\//);
assert.ok(whatsappLink("98765 43210", "hi").startsWith("https://wa.me/919876543210?text=hi"));
assert.ok(whatsappLink("09876543210", "hi").startsWith("https://wa.me/919876543210?"));
assert.ok(whatsappLink("", "hi").startsWith("https://wa.me/?text="));

// CSV neutralizes formula injection.
const evil = upsertInvoice(ws, { ...ws.invoices.inv_00000003, description: "=HYPERLINK(\"x\")" }, T + 5);
assert.match(invoicesCsv(invoiceViews(evil, today)), /"'=HYPERLINK\(""x""\)"/);

// Merge: newer record wins per id; tombstones propagate; tie goes to tombstone.
const deviceA = deleteInvoice(ws, "inv_00000003", T + 10);
const deviceB = addPayment(ws, "inv_00000002", { amountPaise: 1000000, date: today, mode: "bank", reference: "" }, T + 11);
const merged = mergeWorkspaces(deviceA, deviceB);
assert.ok(merged.invoices.inv_00000003.deletedAt, "deletion from device A survives");
assert.equal(merged.invoices.inv_00000002.payments.length, 1, "payment from device B survives");
assert.deepEqual(mergeWorkspaces(deviceB, deviceA), merged, "merge is order-independent");
const tie = mergeWorkspaces(
  upsertInvoice(ws, ws.invoices.inv_00000003, T + 20),
  deleteInvoice(ws, "inv_00000003", T + 20),
);
assert.ok(tie.invoices.inv_00000003.deletedAt);

// Tombstone pruning.
const pruned = pruneTombstones(deviceA, T + 91 * 86_400_000);
assert.equal(pruned.invoices.inv_00000003, undefined);
assert.ok(pruned.invoices.inv_00000002);

// Sanitizer drops malformed records and hostile ids, keeps good ones.
const dirty = JSON.parse(JSON.stringify(ws));
dirty.invoices["../../etc"] = dirty.invoices.inv_00000002;
dirty.invoices.inv_badbadbad = { amountPaise: -1, issueDate: "x", dueDate: "y" };
dirty.invoices.inv_00000002.payments.push({ amountPaise: 1.5, date: today });
dirty.clients.cli_cccccccc = { name: "" };
dirty.business.name = "x".repeat(500);
const clean = sanitizeWorkspace(dirty);
assert.equal(clean.invoices["../../etc"], undefined);
assert.equal(clean.invoices.inv_badbadbad, undefined);
assert.equal(clean.invoices.inv_00000002.payments.length, 0);
assert.equal(clean.clients.cli_cccccccc, undefined);
assert.equal(clean.business.name.length, 80);
assert.equal(Object.keys(clean.invoices).length, 4);
assert.deepEqual(sanitizeWorkspace("garbage"), emptyWorkspace());
assert.deepEqual(sanitizeWorkspace(JSON.parse(JSON.stringify(ws))), ws, "valid workspaces round-trip unchanged");

// Erase writes tombstones, so merging with an older copy cannot resurrect data.
const erased = eraseWorkspace(ws, T + 100);
const afterMerge = mergeWorkspaces(erased, ws);
assert.equal(invoiceViews(afterMerge, today).length, 0);
assert.equal(afterMerge.business.name, "");
// Restoring a backup after an erase brings the data back.
const restored = restoreFrom(erased, ws, T + 200);
assert.equal(invoiceViews(restored, today).length, invoiceViews(ws, today).length);
assert.equal(restored.business.name, "Sharma Tuition");
// ...and the restore wins over the erase in later merges.
assert.equal(invoiceViews(mergeWorkspaces(erased, restored), today).length, invoiceViews(ws, today).length);
// Hindi reminders: same facts, Hindi wording, no upi:// links.
const hi = reminderMessage(overdue, ws.business, "overdue", undefined, "hi");
assert.match(hi, /नमस्ते Acme Pvt Ltd/);
assert.match(hi, /ST-0002/);
assert.match(hi, /₹50,000/);
assert.match(hi, /56 दिन से बकाया/);
assert.match(hi, /UPI से भुगतान करें: sharma@okaxis/);
assert.doesNotMatch(hi, /upi:\/\//);
assert.match(reminderMessage(overdue, ws.business, "friendly", "https://x.test/i/a/", "hi"), /यहाँ सुरक्षित भुगतान करें: https:\/\/x\.test\/i\/a\//);

// Sample data: realistic states, fully removable, never touches real records.
{
  const real = upsertInvoice(emptyWorkspace(), inv("inv_real0001", "R-1", "cli_aaaaaaaa", "2026-10-01", "2026-10-20", 1000), T);
  const withSample = addSampleData(real, today, T);
  assert.ok(hasSampleData(withSample));
  const sv = invoiceViews(withSample, today);
  assert.deepEqual(sv.filter((v) => v.invoice.id.includes("sample")).map((v) => v.state).sort(), ["due", "due", "overdue", "paid"].sort());
  const cleared = removeSampleData(withSample, T + 1);
  assert.equal(hasSampleData(cleared), false);
  assert.deepEqual(invoiceViews(cleared, today).map((v) => v.invoice.id), ["inv_real0001"]);
  assert.equal(Object.values(cleared.clients).filter((c) => !c.deletedAt).length, 0, "only sample clients existed, all removed");
  assert.deepEqual(sanitizeWorkspace(JSON.parse(JSON.stringify(withSample))), withSample, "sample ids pass the sanitizer");
}

// Canonical JSON ignores key order inside records too (sanitized vs UI-built objects).
assert.equal(canonicalJson(sanitizeWorkspace(JSON.parse(JSON.stringify(ws)))), canonicalJson(ws));
const reordered = JSON.parse(JSON.stringify(ws));
for (const id of Object.keys(reordered.invoices)) reordered.invoices[id] = Object.fromEntries(Object.entries(reordered.invoices[id]).reverse());
assert.equal(canonicalJson(reordered), canonicalJson(ws));
// Canonical JSON ignores key insertion order.
assert.equal(canonicalJson(mergeWorkspaces(deviceA, deviceB)), canonicalJson(mergeWorkspaces(deviceB, deviceA)));

// Recurring monthly invoices.
{
  const base = upsertClient(updateBusiness(emptyWorkspace(), { name: "Tuition", invoicePrefix: "TU-" }, T), { id: "cli_riya0001", name: "Riya", phone: "", email: "", gstin: "", createdAt: T, updatedAt: T }, T);
  const plan = { id: "rec_abcdefghij0123456789", clientId: "cli_riya0001", amountPaise: 300000, description: "Monthly tuition", dayOfMonth: 5, dueAfterDays: 7, startMonth: "2026-08", endMonth: "", paused: false, createdAt: T, updatedAt: T };
  let w = upsertPlan(base, plan, T);
  let g = generateRecurring(w, "2026-10-10", T + 1);
  assert.deepEqual(g.created, ["2026-08", "2026-09", "2026-10"].map((m) => recurringInvoiceId(plan.id, m)));
  const oct = g.ws.invoices[recurringInvoiceId(plan.id, "2026-10")];
  assert.deepEqual([oct.issueDate, oct.dueDate, oct.amountPaise, oct.recurringId, oct.description], ["2026-10-05", "2026-10-12", 300000, plan.id, "Monthly tuition"]);
  assert.deepEqual(Object.values(g.ws.invoices).map((i) => i.number).sort(), ["TU-0001", "TU-0002", "TU-0003"]);
  assert.equal(generateRecurring(g.ws, "2026-10-10", T + 2).created.length, 0, "idempotent");
  // A deleted month is not recreated.
  const del = deleteInvoice(g.ws, recurringInvoiceId(plan.id, "2026-09"), T + 3);
  assert.equal(generateRecurring(del, "2026-10-10", T + 4).created.length, 0);
  // Not before the issue day; paused plans and ended plans stop.
  assert.equal(generateRecurring(w, "2026-08-04", T).created.length, 0);
  assert.equal(generateRecurring(upsertPlan(w, { ...plan, paused: true }, T), "2026-10-10", T).created.length, 0);
  assert.equal(generateRecurring(upsertPlan(w, { ...plan, endMonth: "2026-09" }, T), "2026-10-10", T).created.length, 2);
  // Backfill is capped.
  assert.equal(generateRecurring(upsertPlan(w, { ...plan, startMonth: "2023-01" }, T), "2026-10-10", T).created.length, MAX_BACKFILL_MONTHS);
  // Deleted client → nothing generated.
  assert.equal(generateRecurring({ ...w, clients: { cli_riya0001: { ...w.clients.cli_riya0001, deletedAt: T } } }, "2026-10-10", T).created.length, 0);
  // Two devices generating offline converge without duplicates.
  const phone = generateRecurring(w, "2026-10-10", T + 10).ws;
  const laptop = generateRecurring(w, "2026-10-10", T + 20).ws;
  assert.equal(Object.keys(mergeWorkspaces(phone, laptop).invoices).length, 3);
  // Sanitizer keeps plans and links; rejects impossible days.
  assert.deepEqual(sanitizeWorkspace(JSON.parse(JSON.stringify(g.ws))), g.ws);
  assert.equal(liveRecurring(sanitizeWorkspace({ ...JSON.parse(JSON.stringify(w)), recurring: { rec_badbadbad1: { ...plan, id: "rec_badbadbad1", dayOfMonth: 31 } } })).length, 0);
  // Erase tombstones plans too; restore brings them back.
  const erased = eraseWorkspace(g.ws, T + 30);
  assert.equal(liveRecurring(erased).length, 0);
  assert.equal(liveRecurring(restoreFrom(erased, g.ws, T + 40)).length, 1);
}

console.log("[workspace] money, dates, aging, reminders, CSV, merge, and sanitizer checks passed");
