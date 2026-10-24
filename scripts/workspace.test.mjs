import assert from "node:assert/strict";
import { addSampleData, hasSampleData, removeSampleData } from "../src/lib/workspace/sample.ts";
import { generateRecurring, liveRecurring, MAX_BACKFILL_MONTHS, recurringInvoiceId, upsertPlan } from "../src/lib/workspace/model.ts";
import { isUdyam, liveInvoices, msmeDeadline, msmeInterestPaise, normalizeUdyam, recordReceiptPayment } from "../src/lib/workspace/model.ts";
import { matchCredits } from "../src/lib/workspace/statement.ts";
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

// Receipts from the receipt generator settle open invoices first (oldest due), then record the rest as a paid entry.
{
  const R = 1_790_500_000_000;
  const receipt = (over = {}) => ({ receiptNo: "RCPT-0007", date: "2026-10-11", customer: "Riya Sharma", customerPhone: "", amountPaise: 300000, mode: "upi", reference: "", description: "October fees", ...over });
  const open = (id, number, dueDate, amountPaise, clientId) => ({ id, number, clientId, issueDate: "2026-09-01", dueDate, amountPaise, description: "", payments: [], reminders: [], voided: false, createdAt: R, updatedAt: R });
  const paidOf = (w, id) => w.invoices[id].payments.reduce((sum, p) => sum + p.amountPaise, 0);

  // New client, nothing open: one paid entry numbered like the receipt.
  let out = recordReceiptPayment(emptyWorkspace(), receipt(), "2026-10-11", R);
  assert.equal(out.duplicate, false);
  assert.equal(out.appliedPaise, 0);
  const entry = out.ws.invoices[out.entryId];
  assert.deepEqual([entry.number, entry.amountPaise, paidOf(out.ws, out.entryId), entry.payments[0].mode, entry.payments[0].reference], ["RCPT-0007", 300000, 300000, "upi", "Receipt RCPT-0007"]);
  assert.equal(viewInvoice(entry, out.ws.clients, "2026-10-11").balancePaise, 0);
  assert.equal(out.ws.clients[out.clientId].name, "Riya Sharma");
  // Saving the same receipt again changes nothing.
  const again = recordReceiptPayment(out.ws, receipt(), "2026-10-11", R + 1);
  assert.deepEqual([again.duplicate, again.ws === out.ws], [true, true]);

  // Existing client (case-insensitive name) with two open invoices: oldest due is paid first; the rest becomes an entry.
  let ws0 = upsertClient(emptyWorkspace(), { id: "cli_riya0001", name: "riya sharma", phone: "", email: "", gstin: "", createdAt: R, updatedAt: R }, R);
  ws0 = upsertInvoice(ws0, open("inv_newer001", "INV-9", "2026-10-20", 200000, "cli_riya0001"), R);
  ws0 = upsertInvoice(ws0, open("inv_older001", "INV-8", "2026-10-05", 150000, "cli_riya0001"), R);
  out = recordReceiptPayment(ws0, receipt({ amountPaise: 300000, customerPhone: "+91 98765 43210" }), "2026-10-11", R);
  assert.equal(out.clientId, "cli_riya0001");
  assert.deepEqual([paidOf(out.ws, "inv_older001"), paidOf(out.ws, "inv_newer001"), out.appliedPaise, out.entryId], [150000, 150000, 300000, null]);
  assert.equal(out.ws.clients.cli_riya0001.phone, "+919876543210", "a phone on the receipt fills in a client that had none");
  out = recordReceiptPayment(ws0, receipt({ amountPaise: 400000 }), "2026-10-11", R);
  assert.deepEqual([out.appliedPaise, out.ws.invoices[out.entryId].amountPaise], [350000, 50000], "overpayment beyond open dues is kept as its own paid entry");
  assert.equal(liveInvoices(out.ws).reduce((sum, inv) => sum + inv.payments.reduce((a, p) => a + p.amountPaise, 0), 0), 400000, "every paisa of the receipt is recorded exactly once");

  // A phone match wins over a different spelling of the name.
  const byPhone = upsertClient(emptyWorkspace(), { id: "cli_phone001", name: "Riya S.", phone: "9876543210", email: "", gstin: "", createdAt: R, updatedAt: R }, R);
  assert.equal(recordReceiptPayment(byPhone, receipt({ customerPhone: "+91-98765-43210" }), "2026-10-11", R).clientId, "cli_phone001");

  // A UTR on the receipt becomes the payment reference, so importing the bank statement later skips that credit.
  out = recordReceiptPayment(emptyWorkspace(), receipt({ reference: "412345678901" }), "2026-10-11", R);
  const credit = { key: "k1", date: "2026-10-11", amountPaise: 300000, narration: "UPI/412345678901/RIYA", utr: "412345678901", reference: "" };
  assert.equal(matchCredits([credit], invoiceViews(out.ws, "2026-10-11")).alreadyRecorded, 1);

  // Invalid receipts are refused.
  for (const bad of [{ customer: " " }, { receiptNo: "" }, { amountPaise: 0 }, { amountPaise: 12.5 }, { date: "2026-02-30" }]) {
    assert.equal(recordReceiptPayment(emptyWorkspace(), receipt(bad), "2026-10-11", R), null, JSON.stringify(bad));
  }
}

// MSME mode: Udyam numbers, the Section 15 deadline (agreed days, capped at 45), Section 16 interest, and the reminder line.
{
  assert.equal(normalizeUdyam(" udyam-mh-12-1234567 "), "UDYAM-MH-12-1234567");
  for (const bad of ["UDYAM-12", "UDYAM-MH-1-1234567", "UDYAM-MH-12-123456", "MH-12-1234567", ""]) assert.equal(normalizeUdyam(bad), "", bad);
  assert.equal(isUdyam("UDYAM-MH-12-1234567"), true);
  assert.equal(sanitizeWorkspace({ business: { name: "A", udyam: "udyam-ka-03-0000123" } }).business.udyam, "UDYAM-KA-03-0000123");
  assert.equal(sanitizeWorkspace({ business: { name: "A", udyam: "<script>" } }).business.udyam, "", "invalid Udyam is dropped");
  assert.equal(sanitizeWorkspace({ business: { name: "A" } }).business.udyam, "", "older workspaces get an empty Udyam");

  assert.equal(msmeDeadline({ issueDate: "2026-09-01", dueDate: "2026-10-01" }), "2026-10-01", "agreed 30 days");
  assert.equal(msmeDeadline({ issueDate: "2026-09-01", dueDate: "2026-12-01" }), "2026-10-16", "agreed 91 days is capped at 45");
  assert.equal(msmeDeadline({ issueDate: "2026-09-01", dueDate: "2026-08-20" }), "2026-09-01", "a due date before the invoice means pay on receipt");
  assert.equal(msmeInterestPaise(10_000_000, "2026-08-27", "2026-10-11", 17.25), 216398, "₹1,00,000, 45 days late at 17.25% → ₹2,163.98");
  assert.equal(msmeInterestPaise(10_000_000, "2026-10-10", "2026-10-11", 17.25), 4759);
  assert.equal(msmeInterestPaise(10_000_000, "2026-10-11", "2026-10-11", 17.25), 0, "no interest on the deadline itself");
  assert.equal(msmeInterestPaise(0, "2026-08-27", "2026-10-11", 17.25), 0);

  const M = 1_790_600_000_000;
  let mw = updateBusiness(emptyWorkspace(), { name: "Mehta Fab", upiId: "mehta@okaxis", udyam: "UDYAM-GJ-01-7654321" }, M);
  mw = upsertClient(mw, { id: "cli_buyer001", name: "Acme Retail", phone: "", email: "", gstin: "", createdAt: M, updatedAt: M }, M);
  mw = upsertInvoice(mw, { id: "inv_msme0001", number: "MF-21", clientId: "cli_buyer001", issueDate: "2026-08-01", dueDate: "2026-08-31", amountPaise: 5_000_000, description: "", payments: [], reminders: [], voided: false, createdAt: M, updatedAt: M }, M);
  const mv = viewInvoice(mw.invoices.inv_msme0001, mw.clients, "2026-10-11");
  const en = reminderMessage(mv, mw.business, "overdue", undefined, "en", true);
  assert.ok(en.includes("We are a registered micro/small enterprise (Udyam UDYAM-GJ-01-7654321).") && en.includes("43B(h) rule, carried into the 2025 Act") && en.includes("15 days without a written agreement") && en.includes("Section 16"), en);
  assert.ok(en.indexOf("Pay by UPI to") < en.indexOf("We are a registered") && en.indexOf("We are a registered") < en.indexOf("If you have already paid"), "rights line sits between the pay line and the sign-off");
  const hi = reminderMessage(mv, mw.business, "overdue", undefined, "hi", true);
  assert.ok(hi.includes("Udyam UDYAM-GJ-01-7654321") && hi.includes("43B(h)") && hi.includes("धारा 16"), hi);
  assert.ok(!reminderMessage(mv, mw.business, "overdue", undefined, "en").includes("Udyam"), "only when asked");
  assert.ok(!reminderMessage(mv, { ...mw.business, udyam: "" }, "overdue", undefined, "en", true).includes("Udyam"), "never without a Udyam number");
}


/* =====================================================================================================
 * Clients abroad, PR 1 (docs/spec-foreign-clients.md §1, §9.1): storage, sanitizer, merge, routing, repairs.
 * ===================================================================================================== */
{
  const M = await import("../src/lib/workspace/model.ts");
  const legacy = await import("./fixtures/legacy-model.ts");
  const { bookHash } = await import("../src/lib/workspace/books.ts");
  const { snapshotFor, statementView, payPageView } = await import("../src/lib/workspace/paylinks.ts");
  const { digestProjection } = await import("../src/lib/workspace/digest.ts");
  const X = 1_791_000_000_000;
  const DAY = 86_400_000;
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const cli = (id, name, gstin = "") => ({ id, name, phone: "", email: "", gstin, createdAt: X, updatedAt: X });
  const invoice = (id, number, clientId, amountPaise, extra = {}) => ({
    id, number, clientId, issueDate: "2026-09-01", dueDate: "2026-09-20", amountPaise, description: "", payments: [], reminders: [], voided: false, createdAt: X, updatedAt: X, ...extra,
  });
  const settings = {
    on: true, accountName: "Sharma Tuition LLP", bankName: "HDFC Bank", swift: "HDFCINBB", account: "50100123456789", bankDetails: "Fort, Mumbai",
    payUrl: "https://paypal.me/sharma", exportUnderLut: true, lutArn: "AD270326000123X", lutFy: "2026-27", updatedAt: X,
    byCurrency: { USD: { accountName: "Sharma Tuition", bankName: "Wise US", swift: "", account: "8310006789", bankDetails: "ACH routing 026073150", payUrl: "" } },
  };

  // An INR book plus a foreign section: Globex is billed only in US$, Acme in ₹ and US$ (equal minor amounts).
  let inrBook = updateBusiness(emptyWorkspace(), { name: "Sharma Tuition", upiId: "sharma@okaxis", invoicePrefix: "ST-", gstin: "27AAAAA0000A1Z5" }, X);
  inrBook = upsertClient(inrBook, cli("cli_acme0001", "Acme Pvt Ltd"), X);
  inrBook = upsertClient(inrBook, cli("cli_globex01", "Globex LLC"), X);
  inrBook = upsertInvoice(inrBook, invoice("inv_inr00001", "ST-0001", "cli_acme0001", 450000), X);
  inrBook = upsertInvoice(inrBook, invoice("inv_inr00002", "ST-0002", "cli_acme0001", 120000, { dueDate: "2026-10-10" }), X);
  let W = M.upsertInvoice(inrBook, invoice("inv_usd00001", "ST-0003", "cli_acme0001", 450000, { currency: "USD", exportLut: true }), X);
  W = M.upsertInvoice(W, invoice("inv_usd00002", "ST-0004", "cli_globex01", 120050, { currency: "USD" }), X);
  W = M.addPayment(W, "inv_usd00002", { amountPaise: 50, date: "2026-09-25", mode: "bank", reference: "UETR1", inrCreditedPaise: 4150 }, X + 1);
  W = { ...W, intl: { ...W.intl, settings, clients: { cli_globex01: { currency: "USD", updatedAt: X } } } };
  W = M.sanitizeWorkspace(clone(W));

  /* ---------- routing ---------- */
  assert.deepEqual(Object.keys(W.invoices).sort(), ["inv_inr00001", "inv_inr00002"], "foreign invoices never live in ws.invoices");
  assert.deepEqual(Object.keys(W.intl.invoices).sort(), ["inv_usd00001", "inv_usd00002"]);
  assert.equal(M.getInvoice(W, "inv_usd00001").currency, "USD");
  assert.equal(M.getInvoice(W, "inv_inr00001").currency, undefined);
  assert.equal(M.getInvoice(W, "__proto__"), undefined);
  assert.equal(M.getInvoice(W, "inv_usd00002").payments[0].inrCreditedPaise, 4150);
  assert.equal(M.currencyOf(W.intl.invoices.inv_usd00001), "USD");
  assert.equal(M.currencyOf(W.invoices.inv_inr00001), "INR");
  assert.equal(M.upsertInvoice(W, { ...W.invoices.inv_inr00001, currency: "EUR" }, X + 2), W, "an INR id can't move into intl under its id");
  assert.equal(M.upsertInvoice(W, { ...W.intl.invoices.inv_usd00001, currency: undefined }, X + 2), W, "a foreign id can't move into the legacy map");
  const toLegacy = M.upsertInvoice(emptyWorkspace(), { ...invoice("inv_inr00009", "X", "cli_acme0001", 1), currency: "INR", exportLut: true, payments: [{ id: "pay_x", amountPaise: 1, date: "2026-09-01", mode: "upi", reference: "", createdAt: 1, inrCreditedPaise: 5 }] }, X);
  assert.ok(!("currency" in toLegacy.invoices.inv_inr00009) && !("exportLut" in toLegacy.invoices.inv_inr00009) && !("inrCreditedPaise" in toLegacy.invoices.inv_inr00009.payments[0]), "a legacy record never carries a currency");
  assert.equal(toLegacy.intl, undefined);
  assert.equal(M.addPayment(W, "inv_usd00001", { amountPaise: 100, date: "2026-09-26", mode: "bank", reference: "" }, X + 3).intl.invoices.inv_usd00001.payments.length, 1, "mutators find foreign invoices");
  assert.equal(M.deleteInvoice(W, "inv_usd00001", X + 3).intl.invoices.inv_usd00001.deletedAt, X + 3);
  assert.equal(M.logReminder(W, "inv_usd00001", "copy", X + 3).intl.invoices.inv_usd00001.reminders.length, 1);
  assert.equal(M.removePayment(W, "inv_usd00002", W.intl.invoices.inv_usd00002.payments[0].id, X + 3).intl.invoices.inv_usd00002.payments.length, 0);
  assert.equal(M.nextInvoiceNumber(W), "ST-0005", "one number series across both maps");
  assert.equal(legacy.nextInvoiceNumber(legacy.sanitizeWorkspace(clone(W))), "ST-0003", "(old tabs can't see foreign numbers: §1.7 duplicate warning, PR 4)");
  // deleteClient refuses while a foreign invoice references the client, and tombstones the client's currency entry.
  assert.equal(M.deleteClient(W, "cli_globex01", X + 4), W);
  {
    const cleared = M.deleteInvoice(W, "inv_usd00002", X + 4);
    const gone = M.deleteClient(cleared, "cli_globex01", X + 5);
    assert.equal(gone.clients.cli_globex01.deletedAt, X + 5);
    assert.equal(gone.intl.clients.cli_globex01.deletedAt, X + 5);
  }
  // Review round 3: a client whose only foreign record is a plan (a US$ retainer starting next month, no invoice yet).
  {
    const TP = Date.UTC(2026, 9, 20);
    let P = M.upsertClient(M.updateBusiness(emptyWorkspace(), { name: "Kunal Design", upiId: "k@okaxis" }, TP), cli("cli_planonly", "Acme Inc"), TP);
    const plan = { id: "rec_usdplan1", clientId: "cli_planonly", amountPaise: 150000, description: "Retainer", dayOfMonth: 1, dueAfterDays: 15, startMonth: "2026-11", endMonth: "", paused: false, currency: "USD", createdAt: TP, updatedAt: TP };
    P = M.upsertPlan(P, plan, TP);
    assert.equal(M.clientHasForeignRecords(P, "cli_planonly"), true);
    assert.equal(M.deleteClient(P, "cli_planonly", TP + 1000), P, "deleteClient refuses while a live foreign plan references the client");
    assert.equal(M.deleteClient(M.upsertPlan(P, { ...plan, paused: true, updatedAt: TP + 1 }, TP + 1), "cli_planonly", TP + 1000).clients.cli_planonly.deletedAt, undefined, "a paused one too");
    const ended = M.upsertPlan(P, { ...plan, deletedAt: TP + 2, updatedAt: TP + 2 }, TP + 2);
    assert.equal(M.clientHasForeignRecords(ended, "cli_planonly"), false);
    assert.equal(M.deleteClient(ended, "cli_planonly", TP + 1000).clients.cli_planonly.deletedAt, TP + 1000, "a deleted plan doesn't block");
    // INR plans keep today's behaviour: the client may still be removed.
    const inrPlan = M.upsertPlan(M.upsertClient(emptyWorkspace(), cli("cli_inrplan1", "Rohan"), TP), { ...plan, id: "rec_inrplan9", clientId: "cli_inrplan1", currency: undefined }, TP);
    assert.equal(M.deleteClient(inrPlan, "cli_inrplan1", TP + 1000).clients.cli_inrplan1.deletedAt, TP + 1000);
    assert.equal(legacy.deleteClient(legacy.sanitizeWorkspace(clone(inrPlan)), "cli_inrplan1", TP + 1000).clients.cli_inrplan1.deletedAt, TP + 1000, "(same as deployed code)");
    // An old tab sees no plan and no invoice for the client and deletes it; new code revives it deterministically.
    const old = legacy.sanitizeWorkspace(clone(P));
    assert.equal(legacy.liveRecurring(old).length, 0);
    const oldAfter = legacy.deleteClient(old, "cli_planonly", TP + 1000);
    assert.ok(oldAfter.clients.cli_planonly.deletedAt);
    for (const merged of [M.repairIntl(M.mergeWorkspaces(P, oldAfter), TP + 2000), M.repairIntl(M.mergeWorkspaces(oldAfter, P), TP + 9 * DAY)]) {
      assert.equal(merged.clients.cli_planonly.deletedAt, undefined, "a client with a live foreign plan is revived");
      assert.equal(merged.clients.cli_planonly.updatedAt, TP + 1001, "one millisecond after the delete, never the clock");
      assert.equal(M.repairIntl(merged, TP + 3000), merged, "idempotent");
      assert.deepEqual(M.generateRecurring(merged, "2026-12-05", TP + 3000).created, ["2026-11", "2026-12"].map((m) => recurringInvoiceId("rec_usdplan1", m)), "billing goes on");
      const pruned = M.pruneTombstones(merged, TP + 91 * DAY);
      assert.ok(pruned.clients.cli_planonly && !pruned.clients.cli_planonly.deletedAt, "the client outlives the 90-day prune");
    }
    // A paused plan revives its client as well; an erased one doesn't (its plan went with the erase).
    const pausedOld = legacy.deleteClient(legacy.sanitizeWorkspace(clone(M.upsertPlan(P, { ...plan, paused: true, updatedAt: TP + 1 }, TP + 1))), "cli_planonly", TP + 1000);
    assert.equal(M.repairIntl(M.mergeWorkspaces(M.upsertPlan(P, { ...plan, paused: true, updatedAt: TP + 1 }, TP + 1), pausedOld), TP + 2000).clients.cli_planonly.deletedAt, undefined);
    const erasedOld = legacy.eraseWorkspace(legacy.sanitizeWorkspace(clone(P)), TP + 5000);
    const afterErase = M.repairIntl(M.mergeWorkspaces(P, erasedOld), TP + 6000);
    assert.equal(afterErase.clients.cli_planonly.deletedAt, TP + 5000, "an erased client is never revived");
    assert.equal(afterErase.intl.recurring.rec_usdplan1.deletedAt, TP + 5000, "its foreign plan is erased with it");
  }

  /* ---------- byte identity for INR-only books (§1.8) ---------- */
  const corpus = [ws, inrBook, emptyWorkspace(), M.withoutIntl(W), eraseWorkspace(inrBook, X + 9), addSampleData(inrBook, today, X)];
  for (const x of corpus) {
    const now = M.canonicalJson(M.sanitizeWorkspace(clone(x)));
    assert.equal(now, legacy.canonicalJson(legacy.sanitizeWorkspace(clone(x))), "sanitize → canonicalJson is byte-identical to the deployed code");
    assert.doesNotMatch(now, /"intl"|"currency"|"inrCreditedPaise"|"exportLut"/);
    assert.equal(bookHash(M.sanitizeWorkspace(clone(x))), bookHash(legacy.sanitizeWorkspace(clone(x))));
    assert.equal(M.canonicalJson(M.mergeWorkspaces(x, x)), legacy.canonicalJson(legacy.mergeWorkspaces(x, x)));
    assert.equal(M.canonicalJson(M.pruneTombstones(x, X + 200 * DAY)), legacy.canonicalJson(legacy.pruneTombstones(x, X + 200 * DAY)));
    assert.ok(!("intl" in M.eraseWorkspace(x, X + 10)), "erasing an INR-only book writes no intl");
    assert.ok(!("intl" in M.mergeWorkspaces(x, x)) && !("intl" in M.pruneTombstones(x, X)) && !("intl" in M.restoreFrom(x, x, X)));
  }
  assert.deepEqual(M.sanitizeWorkspace(clone(M.withoutIntl(W))), M.withoutIntl(W));
  assert.equal(M.withoutIntl(inrBook), inrBook, "withoutIntl of an INR-only book is the same object");

  /* ---------- sanitizer (§1.4) ---------- */
  assert.deepEqual(M.sanitizeWorkspace(clone(W)), W, "intl round-trips");
  {
    // Review round 3: a foreign plan keeps its currency through the sanitizer (sanitizePlan builds a new object
    // without it; only sanitizeIntl puts it back). Without it a US$ plan bills in rupees, then gets dropped.
    const plan = (id, clientId, extra) => ({ id, clientId, amountPaise: 250000, description: "Retainer", dayOfMonth: 5, dueAfterDays: 7, startMonth: "2026-09", endMonth: "", paused: false, createdAt: X, updatedAt: X, ...extra });
    let P = M.upsertPlan(W, plan("rec_usdplan01", "cli_globex01", { currency: "USD" }), X);
    P = M.upsertPlan(P, plan("rec_eurplan01", "cli_acme0001", { currency: "EUR", paused: true }), X);
    const clean = M.sanitizeWorkspace(clone(P));
    assert.deepEqual(clean, P, "a live and a paused foreign plan round-trip");
    assert.deepEqual([clean.intl.recurring.rec_usdplan01.currency, clean.intl.recurring.rec_eurplan01.currency], ["USD", "EUR"]);
    assert.deepEqual(M.sanitizeWorkspace(clone(clean)), clean, "and stay through a second pass");
    const gen = M.generateRecurring(clean, "2026-10-10", X + 10).ws;
    assert.deepEqual(Object.keys(gen.invoices).sort(), Object.keys(clean.invoices).sort(), "a foreign plan never writes a rupee invoice");
    const made = Object.values(gen.intl.invoices).filter((i) => !clean.intl.invoices[i.id]);
    assert.equal(made.length, 2, "the live US$ plan bills September and October; the paused one nothing");
    assert.ok(made.every((i) => i.currency === "USD" && i.clientId === "cli_globex01"));
    // The legacy route strips a currency key, as upsertInvoice does (§1.6, §1.8: never written as INR).
    for (const currency of ["INR", "XYZ"]) {
      const legacyPlan = M.upsertPlan(emptyWorkspace(), plan("rec_inrplan01", "cli_acme0001", { currency }), X);
      assert.ok(!("currency" in legacyPlan.recurring.rec_inrplan01), `a legacy plan never carries a currency (${currency})`);
      assert.equal(legacyPlan.intl, undefined);
    }
  }
  {
    const raw = clone(W);
    raw.intl.invoices.inv_nocur001 = { ...invoice("inv_nocur001", "N", "cli_acme0001", 5) };
    raw.intl.invoices.inv_inrcur01 = { ...invoice("inv_inrcur01", "N", "cli_acme0001", 5), currency: "INR" };
    raw.intl.invoices.inv_xyzcur01 = { ...invoice("inv_xyzcur01", "N", "cli_acme0001", 5), currency: "XYZ" };
    raw.intl.invoices.inv_inr00001 = { ...raw.invoices.inv_inr00001, currency: "USD" };
    raw.intl.invoices["../../etc"] = { ...raw.intl.invoices.inv_usd00001 };
    raw.intl.invoices.inv_usd00001.exportLut = "yes";
    raw.intl.recurring = { rec_nocur00001: { id: "rec_nocur00001", clientId: "cli_acme0001", amountPaise: 5, description: "", dayOfMonth: 5, dueAfterDays: 7, startMonth: "2026-08", endMonth: "", paused: false, createdAt: X, updatedAt: X } };
    raw.intl.clients.cli_inrcli01 = { currency: "INR", updatedAt: X };
    raw.intl.clients["bad id"] = { currency: "USD", updatedAt: X };
    raw.invoices.inv_inr00001.currency = "USD";
    raw.invoices.inv_inr00001.payments = [{ id: "pay_legacy01", amountPaise: 100, date: "2026-09-02", mode: "upi", reference: "", createdAt: X, inrCreditedPaise: 100 }];
    const clean = M.sanitizeWorkspace(raw);
    assert.deepEqual(Object.keys(clean.intl.invoices).sort(), ["inv_usd00001", "inv_usd00002"], "no currency, INR, XYZ, a legacy id and a hostile id are all dropped, never coerced to INR");
    assert.equal(clean.intl.invoices.inv_usd00001.exportLut, undefined, "exportLut only as true");
    assert.deepEqual(clean.intl.recurring, {});
    assert.deepEqual(Object.keys(clean.intl.clients), ["cli_globex01"]);
    assert.equal(clean.invoices.inv_inr00001.currency, undefined, "a currency key on a legacy record is ignored");
    assert.equal(clean.invoices.inv_inr00001.payments[0].inrCreditedPaise, undefined, "inrCreditedPaise on a legacy payment is dropped");
  }
  {
    // Review round 2 (§1.4, §1.8): a foreign payment keeps inrCreditedPaise only as a positive integer; never a stored 0.
    const credited = (value) => {
      const pay = { id: "pay_usd00001", amountPaise: 100, date: "2026-09-02", mode: "bank", reference: "", createdAt: X, inrCreditedPaise: value };
      const clean = M.sanitizeWorkspace({ intl: { invoices: { inv_usd00001: { ...invoice("inv_usd00001", "U1", "cli_acme0001", 500), currency: "USD", payments: [pay] } } } });
      return clean.intl.invoices.inv_usd00001.payments[0];
    };
    for (const bad of [0, -1, 1.5, NaN, "4150", null]) assert.ok(!("inrCreditedPaise" in credited(bad)), `inrCreditedPaise ${String(bad)} is dropped`);
    assert.equal(credited(4150).inrCreditedPaise, 4150, "a positive integer is kept");
  }
  {
    const s = M.sanitizeWorkspace({ intl: { settings: {
      on: "yes", accountName: `${"A".repeat(100)} `, bankName: "Wise", swift: "deut de ff", account: "gb82 west 1234 5698 7654 32",
      bankDetails: "line1\r\nline2\u0007\n3\n4\n5\n6\n7", payUrl: "javascript:alert(1)", exportUnderLut: false, lutArn: "AD270326000123X", lutFy: "2026-27", updatedAt: 5,
      byCurrency: { USD: { account: "8310006789" }, INR: { account: "12345678" }, EUR: { swift: "bad" }, XYZ: { account: "12345678" } },
    } } }).intl.settings;
    assert.equal(s.on, false);
    assert.equal(s.accountName.length, 80);
    assert.equal(s.swift, "DEUTDEFF");
    assert.equal(s.account, "GB82WEST12345698765432");
    assert.equal(s.bankDetails, "line1\nline2\n3\n4\n5\n6", "≤ 6 lines, no control characters but newlines");
    assert.equal(s.payUrl, "");
    assert.deepEqual([s.lutArn, s.lutFy], ["", ""], "the ARN and FY are kept only with exportUnderLut");
    assert.deepEqual(Object.keys(s.byCurrency), ["USD"], "a non-foreign key, an all-empty entry and an unknown key are dropped");
    assert.equal(M.sanitizeWorkspace({ intl: { settings: { ...settings, lutFy: "2026-28" } } }).intl.settings.lutFy, "");
    assert.equal(M.sanitizeWorkspace({ intl: { settings: { ...settings, byCurrency: { USD: { payUrl: "http://x" } } } } }).intl.settings.byCurrency, undefined);
    // Review round 4: exportUnderLut is `=== true` like `on`; a truthy non-boolean drops the ARN and FY too.
    for (const truthy of [1, "true", "yes", {}]) {
      const t = M.sanitizeWorkspace({ intl: { settings: { ...settings, exportUnderLut: truthy } } }).intl.settings;
      assert.deepEqual([t.exportUnderLut, t.lutArn, t.lutFy], [false, "", ""], `exportUnderLut ${JSON.stringify(truthy)}`);
    }
  }
  {
    // Separate caps: old clients grow ws.invoices without knowing about intl.
    const raw = { invoices: {}, intl: { invoices: {} } };
    for (let i = 0; i < 20_000; i++) raw.invoices[`inv_l${String(i).padStart(7, "0")}`] = invoice(`inv_l${String(i).padStart(7, "0")}`, `L${i}`, "cli_acme0001", 100);
    for (let i = 0; i < 10; i++) raw.intl.invoices[`inv_f${String(i).padStart(7, "0")}`] = invoice(`inv_f${String(i).padStart(7, "0")}`, `F${i}`, "cli_acme0001", 100, { currency: "EUR" });
    const big = M.sanitizeWorkspace(raw);
    assert.equal(Object.keys(big.invoices).length, 20_000);
    assert.equal(Object.keys(big.intl.invoices).length, 10, "20,000 legacy invoices never truncate foreign ones");
  }
  {
    // Review round 3: plans and client currencies have their own caps too (2,000 and 5,000), never reduced by the legacy count.
    const pid = (p, i) => `rec_${p}${String(i).padStart(7, "0")}`;
    const cid = (p, i) => `cli_${p}${String(i).padStart(7, "0")}`;
    const plan = (id, extra = {}) => ({ id, clientId: "cli_acme0001", amountPaise: 100, description: "", dayOfMonth: 5, dueAfterDays: 7, startMonth: "2026-09", endMonth: "", paused: true, createdAt: X, updatedAt: X, ...extra });
    const raw = { recurring: {}, clients: {}, intl: { recurring: {}, clients: {} } };
    for (let i = 0; i < 2_000; i++) raw.recurring[pid("l", i)] = plan(pid("l", i));
    for (let i = 0; i < 5_000; i++) raw.clients[cid("l", i)] = cli(cid("l", i), `L${i}`);
    for (let i = 0; i < 3; i++) raw.intl.recurring[pid("f", i)] = plan(pid("f", i), { currency: "USD" });
    for (let i = 0; i < 3; i++) raw.intl.clients[cid("f", i)] = { currency: "EUR", updatedAt: X };
    const big = M.sanitizeWorkspace(raw);
    assert.equal(Object.keys(big.recurring).length, 2_000);
    assert.equal(Object.keys(big.clients).length, 5_000);
    assert.equal(Object.keys(big.intl.recurring).length, 3, "2,000 legacy plans never truncate foreign ones");
    assert.equal(Object.keys(big.intl.clients).length, 3, "5,000 legacy clients never truncate client currencies");
    const over = { intl: { recurring: {}, clients: {} } };
    for (let i = 0; i < 2_001; i++) over.intl.recurring[pid("f", i)] = plan(pid("f", i), { currency: "USD" });
    for (let i = 0; i < 5_001; i++) over.intl.clients[cid("f", i)] = { currency: "EUR", updatedAt: X };
    const capped = M.sanitizeWorkspace(over);
    assert.equal(Object.keys(capped.intl.recurring).length, 2_000, "the 2,001st foreign plan is dropped");
    assert.equal(Object.keys(capped.intl.clients).length, 5_000, "the 5,001st client currency is dropped");
  }
  assert.equal(M.sanitizeWorkspace({ intl: {} }).intl, undefined, "an empty intl is omitted");
  assert.equal(M.sanitizeWorkspace({ intl: { invoices: {}, recurring: {}, clients: {} } }).intl, undefined);
  assert.deepEqual(M.sanitizeWorkspace({ intl: { clients: { cli_globex01: { currency: "USD", updatedAt: 1 } } } }).intl, { invoices: {}, recurring: {}, clients: { cli_globex01: { currency: "USD", updatedAt: 1 } } }, "present means all three maps");
  {
    // Pruning the last foreign tombstone returns the exact INR-only bytes.
    let only = M.upsertInvoice(inrBook, invoice("inv_usd00009", "ST-0009", "cli_acme0001", 100, { currency: "USD" }), X);
    only = M.deleteInvoice(only, "inv_usd00009", X + 1);
    assert.ok(M.pruneTombstones(only, X + 30 * DAY).intl);
    assert.equal(M.canonicalJson(M.pruneTombstones(only, X + 91 * DAY)), M.canonicalJson(M.pruneTombstones(inrBook, X + 91 * DAY)));
  }
  {
    // Review round 2: the same for a book whose only foreign content is a client tombstone, or a plan tombstone.
    const usdPlan = { id: "rec_usdplan09", clientId: "cli_acme0001", amountPaise: 5000, description: "", dayOfMonth: 5, dueAfterDays: 7, startMonth: "2026-08", endMonth: "", paused: false, currency: "USD", createdAt: X, updatedAt: X + 1, deletedAt: X + 1 };
    const cases = {
      client: { invoices: {}, recurring: {}, clients: { cli_globex01: { currency: "USD", updatedAt: X + 1, deletedAt: X + 1 } } },
      plan: { invoices: {}, recurring: { [usdPlan.id]: usdPlan }, clients: {} },
    };
    for (const [name, intl] of Object.entries(cases)) {
      const only = M.sanitizeWorkspace(JSON.parse(JSON.stringify({ ...inrBook, intl })));
      assert.ok(only.intl, `${name}: the tombstone is kept by the sanitizer`);
      assert.ok(M.pruneTombstones(only, X + 89 * DAY).intl, `${name}: a tombstone younger than 90 days stays`);
      const pruned = M.pruneTombstones(only, X + 91 * DAY);
      assert.equal(pruned.intl, undefined, `${name}: pruned, the book has no foreign section`);
      assert.equal(M.canonicalJson(pruned), M.canonicalJson(M.pruneTombstones(inrBook, X + 91 * DAY)), `${name}: the exact INR-only bytes`);
    }
  }

  /* ---------- merge (§1.5) ---------- */
  {
    let seed = 42;
    // High bits of the LCG: its low bits repeat with a very short period (review round 2: a and b never both had settings).
    const rnd = (n) => Math.floor((seed = (seed * 1103515245 + 12345) % 2147483648) / 65536) % n;
    const pick = (list) => list[rnd(list.length)];
    const randomIntl = () => {
      const intl = { invoices: {}, recurring: {}, clients: {} };
      for (const id of ["inv_aaaaaa01", "inv_aaaaaa02", "inv_aaaaaa03"]) {
        if (rnd(3) === 0) continue;
        const rec = invoice(id, `N${rnd(3)}`, "cli_acme0001", 100 + rnd(3), { currency: pick(["USD", "EUR"]), updatedAt: X + rnd(3) });
        if (rnd(3) === 0) rec.deletedAt = X + rnd(3);
        intl.invoices[id] = rec;
      }
      for (const id of ["cli_acme0001", "cli_globex01"]) if (rnd(2)) intl.clients[id] = { currency: pick(["USD", "GBP"]), updatedAt: X + rnd(2), ...(rnd(4) === 0 ? { deletedAt: X } : {}) };
      if (rnd(2)) intl.settings = { ...settings, accountName: pick(["A", "B"]), updatedAt: X + rnd(2) };
      return rnd(5) === 0 ? undefined : M.sanitizeWorkspace({ intl }).intl;
    };
    const seen = { both: 0, tie: 0, tieDiffer: 0 };
    for (let i = 0; i < 300; i++) {
      const a = randomIntl();
      const b = randomIntl();
      if (a?.settings && b?.settings) {
        seen.both++;
        if (a.settings.updatedAt === b.settings.updatedAt) {
          seen.tie++;
          if (a.settings.accountName !== b.settings.accountName) seen.tieDiffer++;
        }
      }
      const ab = M.mergeIntl(a, b);
      const ba = M.mergeIntl(b, a);
      assert.equal(M.canonicalJson({ ...emptyWorkspace(), ...(ab ? { intl: ab } : {}) }), M.canonicalJson({ ...emptyWorkspace(), ...(ba ? { intl: ba } : {}) }), "mergeIntl is commutative");
      // Absence never deletes, at entry level too.
      for (const id of Object.keys(a?.invoices ?? {})) assert.ok(ab.invoices[id], "an entry missing on one side is kept");
      if (a?.settings || b?.settings) assert.ok(ab.settings);
    }
    assert.ok(seen.both > 0 && seen.tie > 0 && seen.tieDiffer > 0, `the fuzz merges two settings records, also at equal updatedAt (${JSON.stringify(seen)})`);
  }
  {
    // Settings at equal updatedAt: the greater canonical string wins, whatever the argument order.
    const s1 = M.sanitizeWorkspace({ intl: { settings: { ...settings, accountName: "Alpha Exports", updatedAt: X } } }).intl;
    const s2 = M.sanitizeWorkspace({ intl: { settings: { ...settings, accountName: "Beta Exports", bankName: "ICICI Bank", updatedAt: X } } }).intl;
    const ab = M.mergeIntl(s1, s2);
    assert.equal(M.canonicalJson({ ...emptyWorkspace(), intl: ab }), M.canonicalJson({ ...emptyWorkspace(), intl: M.mergeIntl(s2, s1) }));
    assert.equal(ab.settings.accountName, "Beta Exports", "the greater canonical string wins a tie");
    assert.equal(ab.settings.bankName, "ICICI Bank", "…as a whole record");
  }
  assert.deepEqual(M.mergeWorkspaces(W, M.withoutIntl(W)).intl, W.intl, "an old client's copy (no intl) leaves intl exactly as it was");
  assert.deepEqual(M.mergeWorkspaces(M.withoutIntl(W), W).intl, W.intl);
  {
    const del = M.deleteInvoice(W, "inv_usd00001", X + 5);
    const sameTime = M.upsertInvoice(W, { ...W.intl.invoices.inv_usd00001, description: "edited" }, X + 5);
    assert.ok(M.mergeWorkspaces(sameTime, del).intl.invoices.inv_usd00001.deletedAt, "tombstones win ties");
    assert.ok(M.mergeWorkspaces(del, sameTime).intl.invoices.inv_usd00001.deletedAt);
  }
  {
    // The legacy tie rule is unchanged: equal updatedAt keeps argument a.
    const a = upsertInvoice(inrBook, { ...inrBook.invoices.inv_inr00001, description: "from a" }, X + 7);
    const b = upsertInvoice(inrBook, { ...inrBook.invoices.inv_inr00001, description: "from b" }, X + 7);
    assert.equal(M.mergeWorkspaces(a, b).invoices.inv_inr00001.description, "from a");
    assert.equal(M.mergeWorkspaces(b, a).invoices.inv_inr00001.description, "from b");
  }
  {
    // restoreFrom brings back deleted foreign entries and settings an erase emptied.
    const erasedW = M.eraseWorkspace(W, X + 50);
    assert.ok(Object.values(erasedW.intl.invoices).every((i) => i.deletedAt === X + 50));
    assert.deepEqual(erasedW.intl.settings, M.emptyIntlSettings(X + 50));
    assert.ok(erasedW.intl.clients.cli_globex01.deletedAt);
    const back = M.restoreFrom(erasedW, W, X + 60);
    assert.deepEqual(M.allLiveInvoices(back).map((i) => i.id).sort(), ["inv_inr00001", "inv_inr00002", "inv_usd00001", "inv_usd00002"]);
    assert.equal(back.intl.invoices.inv_usd00001.currency, "USD");
    assert.equal(back.intl.settings.swift, "HDFCINBB");
    assert.equal(back.intl.settings.updatedAt, X + 60);
    assert.equal(back.intl.clients.cli_globex01.deletedAt, undefined);
    // Review round 3: revived entries are bumped to the restore time, so they win the next merge with a copy that
    // still holds the tombstone (the server's), in both orders. Plans too.
    const plan = { id: "rec_usdplan01", clientId: "cli_globex01", amountPaise: 250000, description: "", dayOfMonth: 5, dueAfterDays: 7, startMonth: "2026-09", endMonth: "", paused: false, createdAt: X, updatedAt: X, currency: "USD" };
    const withPlan = M.upsertPlan(W, plan, X);
    const erasedP = M.eraseWorkspace(withPlan, X + 50);
    const backP = M.restoreFrom(erasedP, withPlan, X + 60);
    for (const merged of [M.mergeWorkspaces(backP, erasedP), M.mergeWorkspaces(erasedP, backP)]) {
      for (const record of [...Object.values(merged.intl.invoices), merged.intl.recurring.rec_usdplan01, merged.intl.clients.cli_globex01]) {
        assert.equal(record.deletedAt, undefined, "a restored foreign entry stays live after merging with the tombstone");
        assert.equal(record.updatedAt, X + 60);
      }
    }
    // Settings with content are never overwritten by a restore.
    const kept = M.restoreFrom({ ...W, intl: { ...W.intl, settings: { ...settings, accountName: "Current", updatedAt: X + 1 } } }, W, X + 60);
    assert.equal(kept.intl.settings.accountName, "Current");
    // Review round 4: so are settings holding only a per-currency override, or only the switch (§1.5).
    const onlyOverride = { ...M.emptyIntlSettings(X + 1), byCurrency: { EUR: { accountName: "Sharma EU", bankName: "Wise EU", swift: "", account: "BE71096123456769", bankDetails: "", payUrl: "" } } };
    const onlyOn = { ...M.emptyIntlSettings(X + 1), on: true };
    for (const [label, current] of [["a byCurrency override", onlyOverride], ["on: true", onlyOn]]) {
      const base = M.sanitizeWorkspace(clone({ ...W, intl: { ...W.intl, settings: current } }));
      const after = M.restoreFrom(base, W, X + 60);
      assert.deepEqual(after.intl.settings, base.intl.settings, `settings with only ${label} are kept`);
    }
  }

  /* ---------- old-client simulation (legacy-model.ts = model.ts at 3ce60ef) ---------- */
  {
    const L0 = legacy.sanitizeWorkspace(clone(W));
    assert.equal(L0.intl, undefined, "old code drops intl");
    assert.deepEqual(Object.keys(L0.invoices).sort(), ["inv_inr00001", "inv_inr00002"], "no foreign record ever appears in an old copy");
    let L = legacy.addPayment(L0, "inv_inr00001", { amountPaise: 1000, date: "2026-10-01", mode: "upi", reference: "UTR1" }, X + 100);
    L = legacy.updateBusiness(L, { name: "Sharma Tuition Classes" }, X + 101);
    L = legacy.upsertClient(L, cli("cli_newcli01", "New Client"), X + 102);
    L = legacy.deleteClient(L, "cli_globex01", X + 103);
    assert.ok(L.clients.cli_globex01.deletedAt, "the old UI shows Globex with 0 invoices, so it deletes it");
    L = legacy.upsertPlan(L, { id: "rec_inrplan001", clientId: "cli_acme0001", amountPaise: 300000, description: "Fees", dayOfMonth: 5, dueAfterDays: 7, startMonth: "2026-09", endMonth: "", paused: false, createdAt: X, updatedAt: X }, X + 104);
    L = legacy.generateRecurring(L, "2026-10-10", X + 105).ws;
    assert.ok(Object.values(L.invoices).every((i) => !("currency" in i)));
    for (const merged of [M.repairIntl(M.mergeWorkspaces(W, L), X + 200), M.repairIntl(M.mergeWorkspaces(L, W), X + 200)]) {
      assert.deepEqual(merged.intl.invoices, W.intl.invoices, "every foreign invoice is kept, with its currency and INR credited");
      assert.deepEqual(merged.intl.settings, W.intl.settings, "an old business edit never wipes the bank details");
      assert.equal(merged.business.name, "Sharma Tuition Classes");
      assert.equal(merged.invoices.inv_inr00001.payments.length, 1);
      assert.equal(merged.clients.cli_globex01.deletedAt, undefined, "a client with live foreign invoices is revived");
      assert.equal(merged.clients.cli_globex01.updatedAt, X + 104, "revived one millisecond after the delete (X + 103), never at the clock's time");
      assert.ok(Object.keys(merged.invoices).every((id) => !merged.intl.invoices[id]));
      assert.equal(M.repairIntl(merged, X + 300), merged, "repairIntl is idempotent (same object, no extra writes)");
    }
    assert.equal(M.canonicalJson(M.repairIntl(M.mergeWorkspaces(W, L), X + 200)), M.canonicalJson(M.repairIntl(M.mergeWorkspaces(L, W), X + 200)));
    // Review round 2: the revive doesn't depend on the clock, so repairing the same stored copy on later loads (or
    // on the server) gives the same bytes, and an unsaved non-primary book never looks changed against its sync meta.
    assert.equal(M.canonicalJson(M.repairIntl(M.mergeWorkspaces(W, L), X + 200)), M.canonicalJson(M.repairIntl(M.mergeWorkspaces(W, L), X + 90 * DAY)));
    {
      const revived = M.repairIntl(M.mergeWorkspaces(W, L), X + 200);
      const stillDeleted = M.mergeWorkspaces(W, L);
      assert.equal(M.mergeWorkspaces(stillDeleted, revived).clients.cli_globex01.deletedAt, undefined, "the revive wins over the tombstone");
      assert.equal(M.mergeWorkspaces(revived, stillDeleted).clients.cli_globex01.deletedAt, undefined, "in both merge orders");
    }
    // An old tab's erase is honoured at its own time.
    const TE = X + 400;
    const erased = legacy.eraseWorkspace(L0, TE);
    for (const merged of [M.repairIntl(M.mergeWorkspaces(W, erased), X + 500), M.repairIntl(M.mergeWorkspaces(erased, W), X + 500)]) {
      assert.ok(Object.values(merged.intl.invoices).every((i) => i.deletedAt === TE && i.updatedAt === TE), "intl tombstoned at the erase time");
      assert.ok(Object.values(merged.intl.clients).every((c) => c.deletedAt === TE));
      assert.deepEqual(merged.intl.settings, M.emptyIntlSettings(TE));
      assert.equal(M.allLiveInvoices(merged).length, 0);
      assert.ok(merged.clients.cli_globex01.deletedAt, "an erased client is never revived");
      assert.equal(M.repairIntl(merged, X + 600), merged);
    }
    // Review round 2: not an erase when a legacy record created before T is still live (the erasing tab missed an
    // INR invoice made elsewhere): the foreign section and bank details from before T stay.
    {
      const missed = M.upsertInvoice(W, invoice("inv_inrmiss1", "ST-0050", "cli_acme0001", 7700, { createdAt: X + 300, updatedAt: X + 300 }), X + 300);
      for (const merged of [M.mergeWorkspaces(missed, erased), M.mergeWorkspaces(erased, missed)]) {
        assert.ok(!merged.invoices.inv_inrmiss1.deletedAt, "the missed INR invoice is live");
        const repaired = M.repairIntl(merged, X + 500);
        assert.ok(Object.values(repaired.intl.invoices).every((i) => !i.deletedAt), "no foreign invoice is tombstoned");
        assert.equal(repaired.intl.settings.swift, "HDFCINBB", "the bank details stay");
      }
    }
    // Nor when every legacy record shares one tombstone time but the business was last written before it (an old
    // tab deleting the only client with its invoices): the business is neither emptyBusiness(T) nor rewritten after T.
    {
      const TD = X + 450;
      const tomb = (map) => Object.fromEntries(Object.entries(map).map(([id, r]) => [id, r.deletedAt ? r : { ...r, updatedAt: TD, deletedAt: TD }]));
      const allGone = M.sanitizeWorkspace(clone({ ...L0, clients: tomb(L0.clients), invoices: tomb(L0.invoices), recurring: tomb(L0.recurring) }));
      assert.ok(allGone.business.updatedAt < TD);
      const merged = M.mergeWorkspaces(W, allGone);
      const repaired = M.repairIntl(merged, TD + 100);
      assert.ok(Object.values(repaired.intl.invoices).every((i) => i.deletedAt !== TD), "no erase detected");
      assert.equal(repaired.intl.settings.swift, "HDFCINBB");
    }
    // Erase with an older tombstone: an INR invoice and a client deleted 30 days before keep their deletedAt.
    const TE2 = X + 60 * DAY;
    let older = M.deleteInvoice(W, "inv_inr00002", TE2 - 30 * DAY);
    older = M.upsertClient(older, cli("cli_oldcli01", "Old Client"), X);
    older = M.upsertInvoice(older, invoice("inv_usd00003", "ST-0007", "cli_oldcli01", 900, { currency: "USD" }), X);
    const oldTab = legacy.deleteClient(legacy.sanitizeWorkspace(clone(older)), "cli_oldcli01", TE2 - 30 * DAY);
    const erasedOld = legacy.eraseWorkspace(oldTab, TE2);
    assert.equal(erasedOld.invoices.inv_inr00002.deletedAt, TE2 - 30 * DAY);
    const repaired = M.repairIntl(M.mergeWorkspaces(older, erasedOld), TE2 + 500);
    assert.ok(Object.values(repaired.intl.invoices).every((i) => i.deletedAt === TE2), "detected despite the older tombstones");
    assert.equal(repaired.clients.cli_oldcli01.deletedAt, TE2 - 30 * DAY, "not revived: its foreign invoice went with the erase");
    assert.ok(repaired.clients.cli_globex01.deletedAt === TE2 && repaired.clients.cli_acme0001.deletedAt === TE2);
    // Review round 3: an old tab erases twice (T1 < T2) with no repair in between: the newest erase wins, so a
    // foreign invoice written between T1 and T2 goes with the second erase too.
    {
      const T1 = X + 1000;
      const T2 = X + 2000;
      let oldCopy = legacy.eraseWorkspace(legacy.sanitizeWorkspace(clone(W)), T1);
      oldCopy = legacy.upsertClient(oldCopy, { ...cli("cli_after001", "After"), createdAt: T1 + 10, updatedAt: T1 + 10 }, T1 + 10);
      oldCopy = legacy.upsertInvoice(oldCopy, invoice("inv_after001", "ST-0100", "cli_after001", 500, { createdAt: T1 + 10, updatedAt: T1 + 10 }), T1 + 10);
      oldCopy = legacy.eraseWorkspace(oldCopy, T2);
      const newCopy = M.upsertInvoice(W, invoice("inv_usdmid01", "ST-0101", "cli_acme0001", 700, { currency: "USD", createdAt: T1 + 20, updatedAt: T1 + 20 }), T1 + 20);
      for (const merged of [M.mergeWorkspaces(newCopy, oldCopy), M.mergeWorkspaces(oldCopy, newCopy)]) {
        const repaired = M.repairIntl(merged, T2 + 100);
        assert.deepEqual(Object.values(repaired.intl.invoices).map((i) => [i.id, i.deletedAt]).sort(), ["inv_usd00001", "inv_usd00002", "inv_usdmid01"].map((id) => [id, T2]), "every older foreign invoice is tombstoned at T2");
      }
    }
    // A book whose only foreign content is a client's currency: an old tab's erase is still detected.
    {
      const TC = X + 3000;
      const onlyClients = M.sanitizeWorkspace(clone({ ...inrBook, intl: { clients: { cli_globex01: { currency: "USD", updatedAt: X } } } }));
      const erasedOnly = legacy.eraseWorkspace(legacy.sanitizeWorkspace(clone(onlyClients)), TC);
      for (const merged of [M.mergeWorkspaces(onlyClients, erasedOnly), M.mergeWorkspaces(erasedOnly, onlyClients)]) {
        assert.equal(M.repairIntl(merged, TC + 100).intl.clients.cli_globex01.deletedAt, TC, "the client currency goes with the erase");
      }
    }
    // The same shape written by new code (no older intl content) is no erase to repair.
    const newErase = M.eraseWorkspace(W, TE);
    assert.equal(M.repairIntl(newErase, X + 500), newErase);
    // A legacy paidLinkTokens-style read of the stripped copy can't see the foreign invoice (the bug the PR 3 server guard closes).
    assert.equal(L0.invoices.inv_usd00001, undefined);
  }

  /* ---------- PR 1–PR 3 UI-model simulation: the build shows and matches nothing foreign ---------- */
  {
    const mixed = W;
    const inrOnly = M.withoutIntl(W);
    // ClientSheet (PaymentsWorkspace.tsx): "delete their invoices first" only for INR invoices this build shows;
    // a client held only by foreign records (Globex: inv_usd00002) gets the "can't show yet" message instead
    // (review round 3). Neither offers "Remove client", which deleteClient would refuse.
    const sheet = (ws, id) => {
      const hasInvoices = M.liveInvoices(ws).some((i) => i.clientId === id);
      return { hasInvoices, hasHidden: !hasInvoices && M.clientHasForeignRecords(ws, id), removable: M.deleteClient(ws, id, X + 50) !== ws };
    };
    assert.deepEqual(sheet(mixed, "cli_globex01"), { hasInvoices: false, hasHidden: true, removable: false });
    assert.deepEqual(sheet(inrOnly, "cli_globex01"), { hasInvoices: false, hasHidden: false, removable: true });
    assert.deepEqual(sheet(mixed, "cli_acme0001"), { hasInvoices: true, hasHidden: false, removable: false });
    for (const c of M.liveClients(mixed)) {
      const f = sheet(mixed, c.id);
      assert.equal(f.removable, !f.hasInvoices && !f.hasHidden, `${c.id}: "Remove client" is shown exactly when deleteClient would remove`);
    }
    for (const day of ["2026-09-10", "2026-10-11", "2026-12-01"]) {
      assert.deepEqual(M.invoiceViews(mixed, day), M.invoiceViews(inrOnly, day));
      assert.deepEqual(M.summarize(M.invoiceViews(mixed, day), day), M.summarize(M.invoiceViews(inrOnly, day), day));
      assert.deepEqual(M.agingBuckets(M.invoiceViews(mixed, day)), M.agingBuckets(M.invoiceViews(inrOnly, day)));
      assert.deepEqual(M.chaseList(M.invoiceViews(mixed, day)), M.chaseList(M.invoiceViews(inrOnly, day)));
      assert.deepEqual([...M.clientBalances(M.invoiceViews(mixed, day))], [...M.clientBalances(M.invoiceViews(inrOnly, day))]);
      // ₹ aggregates over every view (equal minor amounts) still equal the INR-only figures.
      const all = M.allInvoiceViews(mixed, day);
      assert.equal(all.length, 4);
      assert.deepEqual(M.summarize(all, day), M.summarize(M.invoiceViews(inrOnly, day), day));
      assert.deepEqual(M.agingBuckets(all), M.agingBuckets(M.invoiceViews(inrOnly, day)));
      assert.deepEqual([...M.clientBalances(all)], [...M.clientBalances(M.invoiceViews(inrOnly, day))]);
      // StatementSheet's matchCredits input is invoiceViews: a ₹4,500 credit is never offered for the US$ invoice of 450000 cents.
      const credit = [{ key: "k", date: day, amountPaise: 450000, narration: "ACME PVT LTD", utr: "", reference: "" }];
      assert.deepEqual(matchCredits(credit, M.invoiceViews(mixed, day)), matchCredits(credit, M.invoiceViews(inrOnly, day)));
      assert.ok(matchCredits(credit, M.invoiceViews(mixed, day)).suggestions.every((m) => m.invoiceId !== "inv_usd00001"));
    }
    assert.deepEqual(M.liveInvoices(mixed), M.liveInvoices(inrOnly));
    assert.deepEqual(M.liveRecurring(mixed), M.liveRecurring(inrOnly));
    // Review round 4: allInvoiceViews orders both maps like invoiceViews (issueDate desc, then createdAt desc).
    {
      let o = upsertInvoice(inrBook, { ...inrBook.invoices.inv_inr00002, issueDate: "2026-09-10" }, X);
      o = M.upsertInvoice(o, invoice("inv_usd00001", "ST-0003", "cli_acme0001", 450000, { currency: "USD", issueDate: "2026-09-05" }), X);
      o = M.upsertInvoice(o, invoice("inv_usd00002", "ST-0004", "cli_globex01", 120050, { currency: "USD", issueDate: "2026-09-10", createdAt: X + 5 }), X);
      o = M.sanitizeWorkspace(clone(o));
      const day = "2026-10-11";
      const order = M.allInvoiceViews(o, day).map((v) => v.invoice.id);
      assert.deepEqual(order, ["inv_usd00002", "inv_inr00002", "inv_usd00001", "inv_inr00001"], "a foreign invoice sits between two INR ones by date");
      assert.deepEqual(order.filter((id) => !id.startsWith("inv_usd")), M.invoiceViews(o, day).map((v) => v.invoice.id));
    }
    assert.ok(M.invoiceViews(mixed, today).every((v) => v.currency === "INR"));
    assert.equal(snapshotFor(mixed, "inv_usd00001"), null, "a PR 1 server answers 404 for a foreign invoice link");
    assert.equal(payPageView(mixed, "inv_usd00001", today), null);
    assert.ok(payPageView(mixed, "inv_inr00001", today));
    assert.equal(statementView(mixed, "cli_acme0001", today), null, "never a ₹-only statement for a client who owes US$");
    assert.equal(statementView(mixed, "cli_globex01", today), null, "never 'Paid' for a client who owes only US$");
    assert.equal(snapshotFor(mixed, "stmt:cli_globex01"), null);
    // PR 2 adds the foreign records as `fx`, which PR 1 and older readers ignore: the lists they read stay INR only.
    const { fx, ...inrLists } = digestProjection(mixed);
    assert.deepEqual(inrLists, digestProjection(inrOnly), "the projection's open/plans lists leave foreign records out");
    assert.deepEqual(fx.open.map((t) => [t[0], t[6]]), [["inv_usd00001", "USD"], ["inv_usd00002", "USD"]]);
  }

  /* ---------- currency changes, plans and generateRecurring ---------- */
  {
    const moved = M.replaceInvoiceCurrency(W, "inv_usd00001", "EUR", X + 10);
    assert.ok(moved && moved.id !== "inv_usd00001");
    assert.equal(moved.ws.intl.invoices.inv_usd00001.deletedAt, X + 10, "the old id is tombstoned");
    assert.deepEqual([moved.ws.intl.invoices[moved.id].currency, moved.ws.intl.invoices[moved.id].number, moved.ws.intl.invoices[moved.id].amountPaise], ["EUR", "ST-0003", 450000]);
    const toInr = M.replaceInvoiceCurrency(W, "inv_usd00001", "INR", X + 10);
    assert.ok(toInr.ws.invoices[toInr.id] && !("currency" in toInr.ws.invoices[toInr.id]), "to INR lands in the legacy map without a currency");
    assert.equal(M.replaceInvoiceCurrency(W, "inv_usd00002", "EUR", X + 10), null, "refused with payments");
    assert.deepEqual(M.replaceInvoiceCurrency(W, "inv_usd00001", "USD", X + 10), { ws: W, id: "inv_usd00001" });
    // The export (LUT) mark: kept on a foreign-to-foreign move, dropped on a move to INR (review round 3).
    {
      const marked = W;
      assert.equal(marked.intl.invoices.inv_usd00001.exportLut, true);
      const eur = M.replaceInvoiceCurrency(marked, "inv_usd00001", "EUR", X + 10);
      assert.deepEqual([eur.ws.intl.invoices[eur.id].currency, eur.ws.intl.invoices[eur.id].exportLut], ["EUR", true]);
      assert.equal(M.sanitizeWorkspace(JSON.parse(JSON.stringify(eur.ws))).intl.invoices[eur.id].exportLut, true, "survives the sanitizer");
      const inr = M.replaceInvoiceCurrency(marked, "inv_usd00001", "INR", X + 10);
      assert.ok(!("exportLut" in inr.ws.invoices[inr.id]) && !("currency" in inr.ws.invoices[inr.id]), "an INR copy carries neither");
      const { exportLut: _mark, ...unmarked } = W.intl.invoices.inv_usd00001;
      const plain = M.replaceInvoiceCurrency(M.upsertInvoice(W, { ...unmarked, updatedAt: X + 5 }, X + 5), "inv_usd00001", "GBP", X + 10);
      assert.ok(!("exportLut" in plain.ws.intl.invoices[plain.id]), "no mark is invented");
    }
    // Prune after a currency change: nothing comes back.
    const later = M.pruneTombstones(moved.ws, X + 10 + 91 * DAY);
    assert.equal(M.getInvoice(later, "inv_usd00001"), undefined);
    assert.equal(M.generateRecurring(later, "2026-12-01", X + 11 + 91 * DAY).created.length, 0);

    const plan = { id: "rec_usdplan001", clientId: "cli_globex01", amountPaise: 50000, description: "Retainer", dayOfMonth: 5, dueAfterDays: 15, startMonth: "2026-08", endMonth: "", paused: false, createdAt: X, updatedAt: X, currency: "USD" };
    let P = M.upsertPlan(W, plan, X);
    assert.ok(P.intl.recurring.rec_usdplan001 && !P.recurring.rec_usdplan001, "a USD plan lives in intl.recurring");
    assert.deepEqual(M.liveRecurring(P), M.liveRecurring(W), "liveRecurring stays legacy-only");
    assert.equal(M.allLiveRecurring(P).length, 1);
    const g = M.generateRecurring(P, "2026-10-10", X + 20);
    assert.deepEqual(g.created, ["2026-08", "2026-09", "2026-10"].map((m) => recurringInvoiceId(plan.id, m)));
    for (const id of g.created) {
      assert.equal(g.ws.intl.invoices[id].currency, "USD", "a USD plan's months go into intl.invoices with the currency");
      assert.equal(g.ws.invoices[id], undefined);
    }
    assert.deepEqual(g.created.map((id) => g.ws.intl.invoices[id].number), ["ST-0005", "ST-0006", "ST-0007"]);
    assert.deepEqual(M.planMonths(g.ws, plan), ["2026-08", "2026-09", "2026-10"]);
    // Idempotent: a paid month is never regenerated over, a tombstoned month never comes back.
    let paid = M.addPayment(g.ws, recurringInvoiceId(plan.id, "2026-09"), { amountPaise: 50000, date: "2026-09-20", mode: "bank", reference: "W1" }, X + 21);
    const again = M.generateRecurring(paid, "2026-10-10", X + 22);
    assert.equal(again.created.length, 0);
    assert.equal(M.canonicalJson(again.ws), M.canonicalJson(paid));
    assert.equal(again.ws.intl.invoices[recurringInvoiceId(plan.id, "2026-09")].payments.length, 1);
    const tomb = M.deleteInvoice(paid, recurringInvoiceId(plan.id, "2026-10"), X + 23);
    assert.equal(M.generateRecurring(tomb, "2026-10-10", X + 24).created.length, 0);
    assert.equal(M.replaceInvoiceCurrency(g.ws, recurringInvoiceId(plan.id, "2026-10"), "EUR", X + 25), null, "a plan month can't change currency");
    // A plan's currency change ends the old plan after its last month and starts a new one; nothing regenerates.
    const re = M.replacePlanCurrency(g.ws, plan.id, "EUR", X + 26);
    assert.equal(re.ws.intl.recurring[plan.id].endMonth, "2026-10");
    assert.deepEqual([re.ws.intl.recurring[re.id].startMonth, re.ws.intl.recurring[re.id].currency, re.ws.intl.recurring[re.id].amountPaise], ["2026-11", "EUR", 50000]);
    assert.notEqual(re.id, plan.id);
    assert.equal(M.generateRecurring(re.ws, "2026-10-31", X + 27).created.length, 0);
    const nov = M.generateRecurring(re.ws, "2026-11-10", X + 28);
    assert.deepEqual(nov.created.map((id) => nov.ws.intl.invoices[id].currency), ["EUR"]);
    const toInrPlan = M.replacePlanCurrency(P, plan.id, "INR", X + 29);
    assert.ok(toInrPlan.ws.recurring[toInrPlan.id] && !("currency" in toInrPlan.ws.recurring[toInrPlan.id]));
    assert.equal(toInrPlan.ws.intl.recurring[plan.id].deletedAt, X + 29, "a plan with no month yet is replaced whole");
    // An old copy can't see the foreign plan, so it never generates an INR twin of its months.
    assert.equal(legacy.generateRecurring(legacy.sanitizeWorkspace(clone(P)), "2026-10-10", X).created.length, 0);
  }

  /* ---------- the intl merge: last writer wins per entry, in both argument orders ---------- */
  {
    const usd = (t, extra = {}) => ({ ...invoice("inv_usd00001", "ST-0003", "cli_acme0001", 1000), currency: "USD", updatedAt: t, ...extra });
    const plan = (t, extra = {}) => ({ id: "rec_usdplan001", clientId: "cli_acme0001", amountPaise: 500, description: "", dayOfMonth: 5, dueAfterDays: 15, startMonth: "2026-08", endMonth: "", paused: false, currency: "USD", createdAt: X, updatedAt: t, ...extra });
    const cur = (t, extra = {}) => ({ currency: "USD", updatedAt: t, ...extra });
    const maps = [
      ["invoices", "inv_usd00001", (t, x) => usd(t, { description: x })],
      ["recurring", "rec_usdplan001", (t, x) => plan(t, { description: x })],
      ["clients", "cli_acme0001", (t, x) => cur(t, { currency: x === "new" ? "USD" : "EUR" })],
    ];
    for (const [map, id, entry] of maps) {
      const one = (value) => {
        const intl = M.sanitizeWorkspace({ intl: { invoices: {}, recurring: {}, clients: {}, [map]: { [id]: value } } }).intl;
        assert.ok(intl?.[map][id], `${map}: the fixture survives the sanitizer`);
        return intl;
      };
      const pairs = [
        ["a newer edit beats an older one", entry(X + 1, "old"), entry(X + 2, "new")],
        ["a newer tombstone beats an older live entry", entry(X + 1, "old"), { ...entry(X + 2, "old"), deletedAt: X + 2 }],
        ["a newer live entry beats an older tombstone", { ...entry(X + 1, "old"), deletedAt: X + 1 }, entry(X + 2, "new")],
      ];
      for (const [what, older, newer] of pairs) {
        const a = one(older);
        const b = one(newer);
        const expected = b[map][id];
        assert.deepEqual(M.mergeIntl(a, b)[map][id], expected, `${map}: ${what}`);
        assert.deepEqual(M.mergeIntl(b, a)[map][id], expected, `${map}: ${what} (other order)`);
        const wa = { ...emptyWorkspace(), intl: a };
        const wb = { ...emptyWorkspace(), intl: b };
        assert.deepEqual(M.mergeWorkspaces(wa, wb).intl[map][id], expected, `${map}: ${what} (mergeWorkspaces)`);
        assert.deepEqual(M.mergeWorkspaces(wb, wa).intl[map][id], expected);
      }
    }
    // Settings too.
    const s1 = { ...emptyWorkspace(), intl: { invoices: {}, recurring: {}, clients: {}, settings: { ...settings, accountName: "Old", updatedAt: X + 1 } } };
    const s2 = { ...emptyWorkspace(), intl: { invoices: {}, recurring: {}, clients: {}, settings: { ...settings, accountName: "New", updatedAt: X + 2 } } };
    assert.equal(M.mergeWorkspaces(s1, s2).intl.settings.accountName, "New");
    assert.equal(M.mergeWorkspaces(s2, s1).intl.settings.accountName, "New");
  }

  /* ---------- repairs of an old tab's erase: newer foreign content, settings-only books, a single pass ---------- */
  {
    const TE = X + 400;
    // An old tab erases at TE. Another device recorded a payment on Globex's US$ invoice after TE and created a
    // new US$ invoice for Acme after TE. Older foreign content goes with the erase; the newer records stay live,
    // and the clients they reference (erased at TE) are revived in the same pass, so a second repair (on this
    // device or the server) changes nothing.
    let later = M.addPayment(W, "inv_usd00002", { amountPaise: 100, date: "2026-10-01", mode: "bank", reference: "W2" }, TE + 50);
    later = M.upsertInvoice(later, { ...invoice("inv_usd00005", "ST-0009", "cli_acme0001", 700), currency: "USD", createdAt: TE + 60, updatedAt: TE + 60 }, TE + 60);
    const erased = legacy.eraseWorkspace(legacy.sanitizeWorkspace(clone(W)), TE);
    for (const merged of [M.mergeWorkspaces(later, erased), M.mergeWorkspaces(erased, later)]) {
      const once = M.repairIntl(merged, TE + 100);
      assert.equal(once.intl.invoices.inv_usd00001.deletedAt, TE, "foreign content older than the erase is erased at its time");
      assert.deepEqual(once.intl.settings, M.emptyIntlSettings(TE));
      assert.equal(once.intl.invoices.inv_usd00002.deletedAt, undefined, "an invoice paid after the erase stays live");
      assert.equal(once.intl.invoices.inv_usd00005.deletedAt, undefined, "an invoice created after the erase stays live");
      assert.equal(once.clients.cli_globex01.deletedAt, undefined, "its client, erased at T, is revived (never a live invoice on a tombstone)");
      assert.equal(once.clients.cli_globex01.updatedAt, TE + 1);
      assert.equal(once.clients.cli_acme0001.deletedAt, undefined);
      assert.equal(M.repairIntl(once, TE + 9 * DAY), once, "one pass reaches the fixed point");
    }
    // Bank details saved after the erase (another device, TE + 70) stay as they are; only older ones are emptied
    // (review round 5: the settings half of "content written after the erase is left alone").
    const laterBank = M.sanitizeWorkspace(clone({ ...later, intl: { ...later.intl, settings: { ...settings, swift: "BARCGB22", updatedAt: TE + 70 } } }));
    assert.equal(laterBank.intl.invoices.inv_usd00001.deletedAt, undefined, "(an older foreign invoice, so the erase is detected)");
    for (const merged of [M.mergeWorkspaces(laterBank, erased), M.mergeWorkspaces(erased, laterBank)]) {
      const once = M.repairIntl(merged, TE + 100);
      assert.equal(once.intl.invoices.inv_usd00001.deletedAt, TE, "(the erase was detected)");
      assert.deepEqual(once.intl.settings, laterBank.intl.settings, "settings newer than the erase are kept unchanged");
      assert.equal(M.repairIntl(once, TE + 200), once, "one pass reaches the fixed point");
    }
    // Same shape where nothing is newer than the erase: no client comes back.
    for (const merged of [M.mergeWorkspaces(W, erased), M.mergeWorkspaces(erased, W)]) {
      const once = M.repairIntl(merged, TE + 100);
      assert.ok(once.clients.cli_globex01.deletedAt === TE && once.clients.cli_acme0001.deletedAt === TE);
      assert.equal(M.repairIntl(once, TE + 200), once);
    }
    // A book whose only foreign content is bank details (set up first): the erase empties them too.
    const bankOnly = M.sanitizeWorkspace(clone({ ...inrBook, intl: { invoices: {}, recurring: {}, clients: {}, settings } }));
    const erasedBank = legacy.eraseWorkspace(legacy.sanitizeWorkspace(clone(bankOnly)), TE);
    for (const merged of [M.mergeWorkspaces(bankOnly, erasedBank), M.mergeWorkspaces(erasedBank, bankOnly)]) {
      assert.equal(merged.intl.settings.swift, "HDFCINBB", "(the old tab couldn't see them)");
      const repaired = M.repairIntl(merged, TE + 100);
      assert.deepEqual(repaired.intl.settings, M.emptyIntlSettings(TE), "settings-only foreign content is erased");
      assert.equal(M.repairIntl(repaired, TE + 200), repaired);
    }
    // This device's own erase of a book with foreign invoices but no settings writes an empty settings record,
    // so another device's older bank details don't survive the merge.
    const noSettings = M.sanitizeWorkspace(clone({ ...W, intl: { ...W.intl, settings: undefined } }));
    assert.equal(noSettings.intl.settings, undefined);
    const wiped = M.eraseWorkspace(noSettings, X + 70);
    assert.deepEqual(wiped.intl.settings, M.emptyIntlSettings(X + 70));
    assert.deepEqual(M.mergeWorkspaces(wiped, W).intl.settings, M.emptyIntlSettings(X + 70));
    assert.deepEqual(M.mergeWorkspaces(W, wiped).intl.settings, M.emptyIntlSettings(X + 70));
  }

  /* ---------- foreign plans: routing, sanitizer, deleted plans ---------- */
  {
    const usdPlan = { id: "rec_usdplan002", clientId: "cli_globex01", amountPaise: 50000, description: "Retainer", dayOfMonth: 5, dueAfterDays: 15, startMonth: "2026-08", endMonth: "", paused: false, createdAt: X, updatedAt: X, currency: "USD" };
    const withInr = M.upsertPlan(W, { ...usdPlan, id: "rec_inrplan002", currency: undefined }, X);
    assert.ok(withInr.recurring.rec_inrplan002);
    assert.equal(M.upsertPlan(withInr, { ...usdPlan, id: "rec_inrplan002" }, X + 1), withInr, "an INR plan id can't move into intl under its id");
    const withUsd = M.upsertPlan(W, usdPlan, X);
    assert.equal(M.upsertPlan(withUsd, { ...usdPlan, currency: undefined }, X + 1), withUsd, "a foreign plan id can't move into the legacy map");
    // An intl plan id that is also in ws.recurring is dropped by the sanitizer (the legacy one stays).
    const dup = M.sanitizeWorkspace(clone({ ...withInr, intl: { ...withInr.intl, recurring: { rec_inrplan002: { ...usdPlan, id: "rec_inrplan002" } } } }));
    assert.ok(dup.recurring.rec_inrplan002 && !dup.intl?.recurring.rec_inrplan002);
    // A deleted foreign plan whose client is live generates nothing.
    assert.equal(M.generateRecurring(withUsd, "2026-10-10", X + 2).created.length, 3);
    const ended = M.upsertPlan(withUsd, { ...usdPlan, deletedAt: X + 2 }, X + 2);
    assert.deepEqual(M.generateRecurring(ended, "2026-10-10", X + 3).created, []);
  }

  /* ---------- allocation is per currency (§3.4) ---------- */
  {
    const R = X + 1000;
    const receipt = { receiptNo: "RCPT-1", date: "2026-10-11", customer: "Acme Pvt Ltd", customerPhone: "", amountPaise: 700000, mode: "upi", reference: "", description: "" };
    const out = M.recordReceiptPayment(W, receipt, "2026-10-11", R);
    assert.equal(out.appliedPaise, 570000, "settles only the ₹ invoices");
    assert.deepEqual(out.ws.intl.invoices.inv_usd00001.payments, [], "never touches the US$ invoice of the same minor amount");
    assert.ok(out.ws.invoices[out.entryId] && !("currency" in out.ws.invoices[out.entryId]), "the leftover entry is a legacy INR record");
    const usd = M.allocatePayment(W, "cli_acme0001", 1000, { date: "2026-10-11", mode: "bank", reference: "" }, "2026-10-11", R, "USD");
    assert.deepEqual(usd.allocations, [{ invoiceId: "inv_usd00001", amountPaise: 1000 }]);
    const inr = M.allocatePayment(W, "cli_acme0001", 1000, { date: "2026-10-11", mode: "bank", reference: "" }, "2026-10-11", R);
    assert.deepEqual(inr.allocations, [{ invoiceId: "inv_inr00001", amountPaise: 1000 }]);
  }
}

// Clients abroad, review round 1 (docs/spec-foreign-clients.md §1.4-§1.7, §3.4-§3.5).
{
  const M = await import("../src/lib/workspace/model.ts");
  const legacy = await import("./fixtures/legacy-model.ts");
  const { memoryCloudStore, syncWorkspace } = await import("../src/lib/workspace/cloud.ts");
  const X = Date.UTC(2026, 9, 1);
  const DAY = 86_400_000;
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const cl = (id, name, at = X) => ({ id, name, phone: "", email: "", gstin: "", createdAt: at, updatedAt: at });
  const inv = (id, clientId, extra = {}) => ({ id, number: id, clientId, issueDate: "2026-10-01", dueDate: "2026-10-15", amountPaise: 50000, description: "", payments: [], reminders: [], voided: false, createdAt: X, updatedAt: X, ...extra });
  const settings = (extra = {}) => ({ ...M.emptyIntlSettings(X), on: true, accountName: "Shop Pvt Ltd", account: "GB82WEST12345698765432", swift: "WESTGB2L", ...extra });

  /* ---------- the sanitizer is a fixed point (no PUT ever writes twice for the same content) ---------- */
  {
    let seed = 5;
    const rand = (n) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
    const pieces = ["x", " ", "\n", "\r\n", "\t", "ABA 026009593", "  ", "Sort code 12-34-56", "\u0007", "é", "\n\n"];
    const text = (max) => Array.from({ length: rand(max) }, () => pieces[rand(pieces.length)]).join("");
    for (let i = 0; i < 400; i++) {
      const long = "x".repeat(250 + rand(60));
      const raw = {
        ...M.emptyWorkspace(),
        intl: { invoices: {}, recurring: {}, clients: {}, settings: {
          ...settings(), accountName: text(30) + "A" + text(30), bankName: " " + text(20),
          bankDetails: [text(40), long + text(8) + "\n" + text(20), text(400)][rand(3)],
          byCurrency: { USD: { accountName: text(10) + "B", bankName: "", swift: "", account: "", bankDetails: long + "\n  \n" + text(30), payUrl: "" } },
        } },
      };
      const once = M.sanitizeWorkspace(raw);
      const twice = M.sanitizeWorkspace(clone(once));
      assert.equal(M.canonicalJson(twice), M.canonicalJson(once), "sanitize(sanitize(x)) === sanitize(x)");
      assert.ok(once.intl.settings.bankDetails.length <= 300);
    }
    // The review's case: a 300-character cut right after a line break.
    {
      // Review round 2: C1 controls (NEL, CSI) and U+2028/U+2029 go too, so the line cap can't be got around.
      const c1 = M.sanitizeWorkspace({ ...M.emptyWorkspace(), intl: { invoices: {}, recurring: {}, clients: {}, settings: settings({ bankDetails: "ABA 026009593\u0085Line\u009bX\u0080\u009f\u2028A\u2029B\nSort 12-34-56" }) } });
      assert.equal(c1.intl.settings.bankDetails, "ABA 026009593LineXAB\nSort 12-34-56");
      assert.equal(M.canonicalJson(M.sanitizeWorkspace(JSON.parse(M.canonicalJson(c1)))), M.canonicalJson(c1), "still a fixed point");
      assert.equal(M.sanitizeWorkspace({ intl: { settings: settings({ bankDetails: "café ₹ 日本 ok" }) } }).intl.settings.bankDetails, "café ₹ 日本 ok", "printable non-ASCII is kept");
    }
    const raw = { ...M.emptyWorkspace(), intl: { invoices: {}, recurring: {}, clients: {}, settings: settings({ bankDetails: "x".repeat(299) + "\nABA 026009593" }) } };
    const store = memoryCloudStore();
    const revs = [];
    for (let i = 0; i < 4; i++) revs.push((await syncWorkspace(store, "ws:doc:o", raw, X + 1000 + i)).rev);
    assert.deepEqual(revs, [1, 1, 1, 1], "the same content never writes a new revision");
    const reply = M.sanitizeWorkspace(JSON.parse(store.docs.get("ws:doc:o").json));
    const mine = M.sanitizeWorkspace(clone(raw));
    assert.equal(M.canonicalJson(M.mergeWorkspaces(mine, reply)), M.canonicalJson(reply), "the client's copy equals the server's, so push stops");
  }

  /* ---------- INR credited: never copied across a split, kept only as positive paise on a foreign payment ---------- */
  {
    let w = M.upsertClient(M.emptyWorkspace(), cl("cli_abroad01", "Acme GmbH"), X);
    w = M.upsertInvoice(w, inv("inv_usd00001", "cli_abroad01", { currency: "USD", dueDate: "2026-10-10" }), X);
    w = M.upsertInvoice(w, inv("inv_usd00002", "cli_abroad01", { currency: "USD" }), X);
    w = M.upsertInvoice(w, inv("inv_inr00001", "cli_abroad01"), X);
    const split = M.allocatePayment(w, "cli_abroad01", 100000, { date: "2026-10-12", mode: "bank", reference: "FIRA1", inrCreditedPaise: 8_300_000 }, "2026-10-20", X + 1, "USD");
    assert.deepEqual(split.allocations, [{ invoiceId: "inv_usd00001", amountPaise: 50000 }, { invoiceId: "inv_usd00002", amountPaise: 50000 }]);
    const credited = M.allLiveInvoices(M.sanitizeWorkspace(clone(split.ws))).flatMap((i) => i.payments.map((p) => p.inrCreditedPaise ?? 0));
    assert.equal(credited.reduce((a, b) => a + b, 0), 0, "a split payment never counts the rupees credited once per invoice");
    const pay = (ws, id, inrCreditedPaise) => M.getInvoice(M.addPayment(ws, id, { amountPaise: 100, date: "2026-10-12", mode: "bank", reference: "", inrCreditedPaise }, X + 2), id).payments.at(-1);
    assert.equal(pay(w, "inv_usd00001", 8_300_000).inrCreditedPaise, 8_300_000);
    for (const bad of [-12.5, 12.5, -100, 0, Number.NaN, "100", M.MAX_MINOR + 1]) assert.ok(!("inrCreditedPaise" in pay(w, "inv_usd00001", bad)), `INR credited ${bad} is dropped`);
    assert.ok(!("inrCreditedPaise" in pay(w, "inv_inr00001", 500)), "an INR invoice's payment never carries INR credited");
    const kept = M.addPayment(w, "inv_usd00001", { amountPaise: 100, date: "2026-10-12", mode: "bank", reference: "", inrCreditedPaise: 700 }, X + 2);
    assert.equal(M.canonicalJson(M.sanitizeWorkspace(clone(kept))), M.canonicalJson(kept), "what addPayment stores is already sanitized");
  }

  /* ---------- this device's erase tombstones every intl entry, a future-skewed one too ---------- */
  {
    const skew = X + 5000;
    let w = M.upsertClient(M.emptyWorkspace(), cl("cli_abroad01", "Acme GmbH"), X);
    w = M.upsertInvoice(w, inv("inv_inr00001", "cli_abroad01"), skew);
    w = M.upsertInvoice(w, inv("inv_usd00001", "cli_abroad01", { currency: "USD" }), skew);
    w = M.upsertPlan(w, { id: "rec_usd00001", clientId: "cli_abroad01", amountPaise: 100, description: "", dayOfMonth: 1, dueAfterDays: 7, startMonth: "2026-10", endMonth: "", paused: false, currency: "USD", createdAt: skew, updatedAt: skew }, skew);
    w = { ...w, intl: { ...w.intl, settings: settings({ updatedAt: skew }), clients: { cli_abroad01: { currency: "USD", updatedAt: skew } } } };
    const erased = M.eraseWorkspace(M.sanitizeWorkspace(clone(w)), X + 1);
    assert.equal(erased.invoices.inv_inr00001.deletedAt, X + 1);
    assert.equal(erased.intl.invoices.inv_usd00001.deletedAt, X + 1, "a foreign record written 'later' is erased like its INR neighbour");
    assert.equal(erased.intl.recurring.rec_usd00001.deletedAt, X + 1);
    assert.equal(erased.intl.clients.cli_abroad01.deletedAt, X + 1);
    assert.deepEqual(erased.intl.settings, M.emptyIntlSettings(X + 1), "settings are emptied whatever their updatedAt");
  }

  /* ---------- a plan currency change needs a month left to bill ---------- */
  {
    let w = M.upsertClient(M.emptyWorkspace(), cl("cli_abroad01", "Acme GmbH"), X);
    w = M.upsertPlan(w, { id: "rec_usd00002", clientId: "cli_abroad01", amountPaise: 100, description: "", dayOfMonth: 1, dueAfterDays: 7, startMonth: "2026-08", endMonth: "2026-09", paused: false, currency: "USD", createdAt: X, updatedAt: X }, X);
    const generated = M.generateRecurring(w, "2026-10-10", X).ws;
    assert.deepEqual(M.planMonths(generated, M.getPlan(generated, "rec_usd00002")), ["2026-08", "2026-09"]);
    assert.equal(M.replacePlanCurrency(generated, "rec_usd00002", "EUR", X + 3), null, "an ended, fully billed plan is never replaced by one that starts after its end");
    const open = M.upsertPlan(w, { ...M.getPlan(w, "rec_usd00002"), endMonth: "2026-12" }, X + 1);
    const g2 = M.generateRecurring(open, "2026-10-10", X + 1).ws;
    const r = M.replacePlanCurrency(g2, "rec_usd00002", "EUR", X + 3);
    assert.ok(r);
    const replacement = M.getPlan(r.ws, r.id);
    assert.deepEqual([replacement.startMonth, replacement.endMonth, replacement.currency], ["2026-11", "2026-12", "EUR"]);
    assert.equal(M.getPlan(r.ws, "rec_usd00002").endMonth, "2026-10");
  }

  /* ---------- an old tab's erase is honoured even after the user started over there ---------- */
  {
    let W = M.upsertClient(M.updateBusiness(M.emptyWorkspace(), { name: "Shop", upiId: "s@okaxis" }, X), cl("cli_abroad01", "Acme GmbH"), X);
    W = M.upsertInvoice(W, inv("inv_inr00001", "cli_abroad01"), X);
    W = M.upsertInvoice(W, inv("inv_usd00001", "cli_abroad01", { currency: "USD" }), X);
    W = M.sanitizeWorkspace({ ...W, intl: { ...W.intl, settings: settings(), clients: { cli_abroad01: { currency: "USD", updatedAt: X } } } });
    const E = X + DAY;
    const erasedOld = () => legacy.eraseWorkspace(legacy.sanitizeWorkspace(clone(W)), E);
    const startOvers = {
      "a new client": (o) => legacy.upsertClient(o, cl("cli_newstart", "First new client", E + 60_000), E + 60_000),
      "a new invoice": (o) => legacy.upsertInvoice(legacy.upsertClient(o, cl("cli_newstart", "New", E + 60_000), E + 60_000), { ...inv("inv_newstart", "cli_newstart"), createdAt: E + 70_000, updatedAt: E + 70_000 }, E + 70_000),
      "a business rename": (o) => legacy.updateBusiness(o, { name: "New Shop", upiId: "new@okaxis" }, E + 30_000),
      "all three": (o) => legacy.updateBusiness(legacy.upsertInvoice(legacy.upsertClient(o, cl("cli_newstart", "New", E + 1), E + 1), { ...inv("inv_newstart", "cli_newstart"), createdAt: E + 2, updatedAt: E + 2 }, E + 2), { name: "New Shop" }, E + 3),
      "nothing": (o) => o,
    };
    const honoured = (ws, what) => {
      assert.equal(ws.intl.invoices.inv_usd00001.deletedAt, E, `${what}: the foreign invoice is erased at the erase time`);
      assert.equal(ws.intl.settings.account, "", `${what}: the IBAN is erased`);
      assert.equal(ws.intl.settings.swift, "", `${what}: the SWIFT is erased`);
      assert.equal(ws.clients.cli_abroad01.deletedAt, E, `${what}: the erased client is never revived`);
      assert.equal(ws.intl.clients.cli_abroad01.deletedAt, E);
    };
    for (const [what, startOver] of Object.entries(startOvers)) {
      const L = startOver(erasedOld());
      for (const merged of [M.mergeWorkspaces(W, M.sanitizeWorkspace(clone(L))), M.mergeWorkspaces(M.sanitizeWorkspace(clone(L)), W)]) {
        const repaired = M.repairIntl(merged, E + 120_000);
        honoured(repaired, what);
        assert.equal(M.repairIntl(repaired, E + 200_000), repaired, `${what}: a second repair changes nothing`);
        for (const id of Object.keys(L.clients)) if (!L.clients[id].deletedAt) assert.equal(repaired.clients[id].deletedAt, undefined, `${what}: the fresh start stays`);
      }
      // Through the server: the new device's copy is stored, then the old tab pushes erase and fresh start together.
      const store = memoryCloudStore();
      await syncWorkspace(store, "ws:doc:o", W, X + 10);
      const reply = await syncWorkspace(store, "ws:doc:o", legacy.sanitizeWorkspace(clone(L)), E + 120_000);
      honoured(M.sanitizeWorkspace(clone(reply.workspace)), `${what} (server)`);
    }
    // Not an erase: a single deletion of a client whose only invoices are foreign, then a rename, revives it.
    let D = legacy.sanitizeWorkspace(clone(M.deleteInvoice(W, "inv_inr00001", X + 1)));
    D = legacy.updateBusiness(legacy.deleteClient(D, "cli_abroad01", E), { name: "Renamed" }, E + 10);
    const kept = M.repairIntl(M.mergeWorkspaces(W, M.sanitizeWorkspace(clone(D))), E + 20);
    assert.equal(kept.intl.invoices.inv_usd00001.deletedAt, undefined, "a single deletion is never taken for an erase");
    assert.equal(kept.intl.settings.account, "GB82WEST12345698765432");
    assert.equal(kept.clients.cli_abroad01.deletedAt, undefined, "the client is revived");
    // Not an erase: clearing sample data tombstones several records at one time.
    let S = addSampleData(M.updateBusiness(M.emptyWorkspace(), { name: "Shop" }, X), "2026-10-01", X);
    S = M.sanitizeWorkspace({ ...S, intl: { invoices: {}, recurring: {}, clients: {}, settings: settings() } });
    const cleared = M.updateBusiness(removeSampleData(S, E), { name: "Shop 2" }, E + 5);
    assert.equal(M.repairIntl(cleared, E + 10).intl.settings.account, "GB82WEST12345698765432", "clearing sample data never erases bank details");

    // Review round 2: an erase of a book with no live legacy record at the erase time leaves no record tombstoned
    // at T, only the business as emptyBusiness(T). Its only client was deleted earlier, or it never had one.
    let gone = M.upsertClient(M.updateBusiness(M.emptyWorkspace(), { name: "Asha Design", upiId: "asha@okaxis" }, X), cl("cli_onlyone1", "Old"), X);
    gone = M.deleteClient(gone, "cli_onlyone1", X + 5);
    gone = M.sanitizeWorkspace({ ...gone, intl: { invoices: {}, recurring: {}, clients: { cli_abroad01: { currency: "USD", updatedAt: X } }, settings: settings() } });
    const none = M.sanitizeWorkspace({ ...M.updateBusiness(M.emptyWorkspace(), { name: "Asha Design" }, X), intl: gone.intl });
    for (const [what, book] of [["only client deleted earlier", gone], ["no client yet", none]]) {
      const oldErase = legacy.eraseWorkspace(legacy.sanitizeWorkspace(clone(book)), E);
      for (const merged of [M.mergeWorkspaces(book, M.sanitizeWorkspace(clone(oldErase))), M.mergeWorkspaces(M.sanitizeWorkspace(clone(oldErase)), book)]) {
        const repaired = M.repairIntl(merged, E + 1000);
        assert.equal(repaired.intl.settings.account, "", `${what}: the IBAN goes with the erase`);
        assert.equal(repaired.intl.settings.accountName, "", `${what}: the account name goes with the erase`);
        assert.equal(repaired.intl.clients.cli_abroad01.deletedAt, E, `${what}: client currencies go with the erase`);
        assert.equal(M.repairIntl(repaired, E + 2000), repaired, `${what}: idempotent`);
      }
      const store = memoryCloudStore();
      await syncWorkspace(store, "ws:doc:o", book, X + 10);
      const reply = await syncWorkspace(store, "ws:doc:o", legacy.sanitizeWorkspace(clone(oldErase)), E + 1000);
      assert.equal(M.sanitizeWorkspace(clone(reply.workspace)).intl.settings.account, "", `${what} (server): the IBAN goes with the erase`);
    }
    // Not an erase: every INR record deleted one by one while the business keeps its name.
    const allDeleted = M.repairIntl(M.updateBusiness(gone, { phone: "" }, E), E + 10);
    assert.equal(allDeleted.intl.settings.account, "GB82WEST12345698765432", "deleting every INR record is never an erase");
    // Not an erase: a business without a time (never named, emptyBusiness(0)) with bank details set up first.
    const unnamed = M.sanitizeWorkspace({ ...M.emptyWorkspace(), intl: gone.intl });
    assert.equal(M.repairIntl(unnamed, E), unnamed);
  }
}

/* =====================================================================================================
 * Clients abroad, PR 2 (docs/spec-foreign-clients.md §3, §6, §9.1): money logic and text. Pure functions with no
 * UI caller yet; every INR output is compared with the model from before clients abroad (legacy-model.ts).
 * ===================================================================================================== */
{
  const M = await import("../src/lib/workspace/model.ts");
  const legacy = await import("./fixtures/legacy-model.ts");
  const { LUT_ENDORSEMENT } = await import("../src/lib/workspace/currency.ts");
  const X = 1_791_000_000_000;
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const cli = (id, name, extra = {}) => ({ id, name, phone: "", email: "", gstin: "", createdAt: X, updatedAt: X, ...extra });
  const invoice = (id, number, clientId, amountPaise, extra = {}) => ({
    id, number, clientId, issueDate: "2026-09-01", dueDate: "2026-09-20", amountPaise, description: "", payments: [], reminders: [], voided: false, createdAt: X, updatedAt: X, ...extra,
  });
  const ARN = "AD270326000123X";
  const settings = {
    on: true, accountName: "Sharma Tuition LLP", bankName: "HDFC Bank", swift: "HDFCINBB", account: "50100123456789", bankDetails: "Fort, Mumbai\n\nIFSC HDFC0000001",
    payUrl: "https://paypal.me/sharma", exportUnderLut: true, lutArn: ARN, lutFy: "2026-27", updatedAt: X,
    byCurrency: { USD: { accountName: "Sharma Tuition", bankName: "Wise US", swift: "", account: "8310006789", bankDetails: "ACH routing 026073150", payUrl: "" } },
  };
  // INR and US$ invoices of equal minor amounts (Acme); Globex is billed in US$ and €; Initech has an Indian GSTIN.
  let inrBook = updateBusiness(emptyWorkspace(), { name: "Sharma Tuition", upiId: "sharma@okaxis", invoicePrefix: "ST-", gstin: "27AAAAA0000A1Z5", udyam: "UDYAM-MH-12-1234567" }, X);
  inrBook = upsertClient(inrBook, cli("cli_acme0001", "Acme Pvt Ltd", { phone: "98765 43210" }), X);
  inrBook = upsertClient(inrBook, cli("cli_globex01", "Globex LLC", { phone: "+1 415 555 0100" }), X);
  inrBook = upsertClient(inrBook, cli("cli_initech1", "Initech India", { gstin: "29BBBBB1111B1Z5" }), X);
  inrBook = upsertInvoice(inrBook, invoice("inv_inr00001", "ST-0001", "cli_acme0001", 450000), X);
  inrBook = upsertInvoice(inrBook, invoice("inv_inr00002", "ST-0002", "cli_acme0001", 120000, { dueDate: "2026-10-10" }), X);
  let W = M.upsertInvoice(inrBook, invoice("inv_usd00001", "ST-0003", "cli_acme0001", 450000, { currency: "USD", exportLut: true }), X);
  W = M.upsertInvoice(W, invoice("inv_usd00002", "ST-0004", "cli_globex01", 120050, { currency: "USD", exportLut: true }), X);
  W = M.upsertInvoice(W, invoice("inv_eur00001", "ST-0005", "cli_globex01", 99, { currency: "EUR", exportLut: true, dueDate: "2026-10-30" }), X);
  W = M.upsertInvoice(W, invoice("inv_usd00003", "ST-0006", "cli_initech1", 7000, { currency: "USD", exportLut: true }), X);
  W = M.addPayment(W, "inv_usd00002", { amountPaise: 50, date: "2026-09-25", mode: "bank", reference: "UETR1", inrCreditedPaise: 4150 }, X + 1);
  W = { ...W, intl: { ...W.intl, settings } };
  W = M.sanitizeWorkspace(clone(W));
  assert.equal(W.intl.settings.bankDetails, settings.bankDetails);
  const inrOnly = M.withoutIntl(W);
  const day = "2026-10-11";
  const all = M.allInvoiceViews(W, day);
  const viewOf = (id, ws = W) => M.allInvoiceViews(ws, day).find((v) => v.invoice.id === id);

  /* ---------- aggregates (§3.3): ₹ figures equal the INR-only book's; foreign ones are exact per currency ---------- */
  {
    assert.deepEqual(M.summarize(all, day), M.summarize(M.invoiceViews(inrOnly, day), day));
    assert.deepEqual(M.summarize(all, day), legacy.summarize(legacy.invoiceViews(inrOnly, day), day), "the ₹ summary is the old model's");
    const foreign = M.summarizeForeign(all, day);
    assert.deepEqual(Object.keys(foreign), ["USD", "EUR"]);
    assert.deepEqual(foreign.USD, { outstandingPaise: 450000 + 120000 + 7000, overduePaise: 577000, overdueCount: 3, dueSoonPaise: 0, dueSoonCount: 0, collectedThisMonthPaise: 0, openCount: 3 });
    assert.deepEqual(foreign.EUR, { outstandingPaise: 99, overduePaise: 0, overdueCount: 0, dueSoonPaise: 0, dueSoonCount: 0, collectedThisMonthPaise: 0, openCount: 1 });
    assert.equal(M.summarizeForeign(all, "2026-09-26").USD.collectedThisMonthPaise, 50, "collected in the invoice's own currency");
    assert.equal(M.summarizeForeign(M.allInvoiceViews(W, "2026-10-25"), "2026-10-25").EUR.dueSoonPaise, 99);
    assert.deepEqual(M.summarizeForeign(M.invoiceViews(inrOnly, day), day), {}, "no entry for an INR-only book");

    assert.deepEqual(M.agingBuckets(all), legacy.agingBuckets(legacy.invoiceViews(inrOnly, day)));
    const aging = M.agingBucketsByCurrency(all);
    assert.deepEqual(Object.keys(aging), ["INR", "USD", "EUR"]);
    assert.deepEqual(aging.INR, M.agingBuckets(all));
    assert.deepEqual(aging.USD.map((b) => [b.key, b.balancePaise, b.count]), [["current", 0, 0], ["d1_15", 0, 0], ["d16_30", 577000, 3], ["d31_45", 0, 0], ["d45_plus", 0, 0]]);
    assert.deepEqual(aging.EUR.find((b) => b.key === "current").balancePaise, 99);
    // A currency whose invoices are all paid or void gets no entry.
    const eurPaid = M.addPayment(W, "inv_eur00001", { amountPaise: 99, date: day, mode: "bank", reference: "" }, X + 2);
    assert.deepEqual(Object.keys(M.agingBucketsByCurrency(M.allInvoiceViews(eurPaid, day))), ["INR", "USD"], "a fully paid currency drops out");
    const eurVoid = M.upsertInvoice(W, { ...W.intl.invoices.inv_eur00001, voided: true }, X + 2);
    assert.deepEqual(Object.keys(M.agingBucketsByCurrency(M.allInvoiceViews(eurVoid, day))), ["INR", "USD"], "a void-only currency drops out");
    // dueSoonDays reaches the foreign summaries: the € invoice is due in 19 days.
    assert.deepEqual([M.summarizeForeign(all, day).EUR.dueSoonPaise, M.summarizeForeign(all, day).EUR.dueSoonCount], [0, 0]);
    assert.deepEqual([M.summarizeForeign(all, day, 30).EUR.dueSoonPaise, M.summarizeForeign(all, day, 30).EUR.dueSoonCount], [99, 1]);
    assert.deepEqual([M.summarizeForeign(all, day, 18).EUR.dueSoonPaise, M.summarizeForeign(all, day, 19).EUR.dueSoonPaise], [0, 99], "the window's edge");

    assert.deepEqual([...M.clientBalances(all)], [...legacy.clientBalances(legacy.invoiceViews(inrOnly, day))]);
    const fb = M.clientForeignBalances(all);
    assert.deepEqual(Object.fromEntries(fb), {
      cli_acme0001: { USD: { balancePaise: 450000, overduePaise: 450000, open: 1 } },
      cli_globex01: { USD: { balancePaise: 120000, overduePaise: 120000, open: 1 }, EUR: { balancePaise: 99, overduePaise: 0, open: 1 } },
      cli_initech1: { USD: { balancePaise: 7000, overduePaise: 7000, open: 1 } },
    });
    assert.equal(M.clientForeignBalances(M.invoiceViews(inrOnly, day)).size, 0);
    // A paid or void foreign invoice owes nothing.
    const settled = M.addPayment(M.upsertInvoice(W, { ...W.intl.invoices.inv_usd00003, voided: true }, X + 2), "inv_usd00001", { amountPaise: 450000, date: day, mode: "bank", reference: "" }, X + 2);
    assert.deepEqual(Object.keys(Object.fromEntries(M.clientForeignBalances(M.allInvoiceViews(settled, day)))), ["cli_globex01"]);
  }

  /* ---------- INR earned (§3.5): recorded credits only, never estimated ---------- */
  {
    assert.deepEqual(M.inrEarned(all, "2026-09"), { creditedPaise: 4150, payments: 1, missing: 0 });
    assert.deepEqual(M.inrEarned(all, "2026-10"), { creditedPaise: 0, payments: 0, missing: 0 });
    let w = M.addPayment(W, "inv_usd00001", { amountPaise: 1000, date: "2026-10-02", mode: "bank", reference: "" }, X + 3);
    w = M.addPayment(w, "inv_usd00001", { amountPaise: 2000, date: "2026-10-03", mode: "other", reference: "PayPal", inrCreditedPaise: 166_000 }, X + 3);
    w = M.addPayment(w, "inv_inr00001", { amountPaise: 5000, date: "2026-10-03", mode: "upi", reference: "" }, X + 3);
    w = M.addPayment(w, "inv_eur00001", { amountPaise: 99, date: "2026-10-04", mode: "bank", reference: "", inrCreditedPaise: 9_900 }, X + 3);
    assert.deepEqual(M.inrEarned(M.allInvoiceViews(w, day), "2026-10"), { creditedPaise: 175_900, payments: 3, missing: 1 }, "INR payments never count");
    const voided = M.upsertInvoice(w, { ...M.getInvoice(w, "inv_eur00001"), voided: true }, X + 4);
    assert.deepEqual(M.inrEarned(M.allInvoiceViews(voided, day), "2026-10"), { creditedPaise: 166_000, payments: 2, missing: 1 }, "a void invoice's payments don't count");
  }

  /* ---------- chase order (§3.3): INR order unchanged; currencies never compared by amount ---------- */
  {
    assert.deepEqual(M.chaseList(all).map((v) => v.invoice.id), ["inv_inr00001", "inv_usd00001", "inv_usd00002", "inv_usd00003", "inv_inr00002"]);
    assert.deepEqual(M.chaseList([...all].reverse()).map((v) => v.invoice.id), ["inv_inr00001", "inv_usd00001", "inv_usd00002", "inv_usd00003", "inv_inr00002"], "the cross-currency tiebreak is deterministic");
    assert.deepEqual(M.chaseList(all).filter((v) => v.currency === "INR"), M.chaseList(M.invoiceViews(inrOnly, day)));
    // Two INR invoices with the same days and balance keep the input order (the id never decides), as before.
    const twins = [invoice("inv_zzzz0001", "Z-1", "cli_acme0001", 5000), invoice("inv_aaaa0001", "A-1", "cli_acme0001", 5000)].map((i) => M.viewInvoice(i, W.clients, day));
    for (const order of [twins, [...twins].reverse()]) {
      assert.deepEqual(M.chaseList(order).map((v) => v.invoice.id), order.map((v) => v.invoice.id));
      assert.deepEqual(M.chaseList(order).map((v) => v.invoice.id), legacy.chaseList(order).map((v) => v.invoice.id));
    }
    // Same-currency foreign ties behave the same way; mixed ties: INR, then CURRENCIES order (USD before EUR before SGD).
    const mixedTies = ["SGD", "EUR", "INR", "USD"].map((c, n) => M.viewInvoice(invoice(`inv_tie${n}0001`, `T-${n}`, "cli_acme0001", 5000, c === "INR" ? {} : { currency: c }), W.clients, day));
    assert.deepEqual(M.chaseList(mixedTies).map((v) => v.currency), ["INR", "USD", "EUR", "SGD"]);
    // Same days late, the foreign minor amount larger: still INR first, then USD before EUR (amounts never compared).
    const sameDay = [["inv_inr0small", 1000, "INR"], ["inv_usd00big1", 5000, "USD"], ["inv_eur00big1", 900000, "EUR"], ["inv_usd0small", 1, "USD"]]
      .map(([id, amount, c]) => M.viewInvoice(invoice(id, id.slice(-4), "cli_acme0001", amount, c === "INR" ? {} : { currency: c }), W.clients, day));
    for (const order of [sameDay, [...sameDay].reverse(), [sameDay[2], sameDay[1], sameDay[3], sameDay[0]]]) {
      assert.deepEqual(M.chaseList(order).map((v) => v.invoice.id), ["inv_inr0small", "inv_usd00big1", "inv_usd0small", "inv_eur00big1"], "₹10.00 before US$50.00 before €9,000.00");
    }
    // The bare pairs from the review: ₹10.00 vs US$50.00, US$1.00 vs €9,000.00, either input order.
    for (const [a, b] of [[sameDay[0], sameDay[1]], [sameDay[3], sameDay[2]]]) {
      assert.deepEqual(M.chaseList([a, b]).map((v) => v.invoice.id), [a.invoice.id, b.invoice.id]);
      assert.deepEqual(M.chaseList([b, a]).map((v) => v.invoice.id), [a.invoice.id, b.invoice.id]);
    }
    // A randomized INR corpus orders exactly as the old model did.
    let seed = 7;
    const rand = (n) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
    for (let trial = 0; trial < 200; trial++) {
      const views = Array.from({ length: 2 + rand(12) }, (_, n) => M.viewInvoice(invoice(`inv_r${trial}n${n}xxx`, `R-${n}`, "cli_acme0001", 1000 * (1 + rand(4)), { dueDate: `2026-10-${String(1 + rand(12)).padStart(2, "0")}` }), W.clients, day));
      assert.deepEqual(M.chaseList(views).map((v) => v.invoice.id), legacy.chaseList(views).map((v) => v.invoice.id), `trial ${trial}`);
    }
  }

  /* ---------- payment details and the export note (§1.6, §6) ---------- */
  {
    assert.deepEqual(M.payDetailsFor(W.intl.settings, "USD"), settings.byCurrency.USD, "the currency's own set, whole");
    assert.deepEqual(M.payDetailsFor(W.intl.settings, "EUR"), { accountName: "Sharma Tuition LLP", bankName: "HDFC Bank", swift: "HDFCINBB", account: "50100123456789", bankDetails: settings.bankDetails, payUrl: "https://paypal.me/sharma" });
    assert.equal(M.payDetailsFor(undefined, "USD"), undefined);
    assert.ok(!("on" in M.payDetailsFor(W.intl.settings, "EUR")) && !("lutArn" in M.payDetailsFor(W.intl.settings, "EUR")), "only the six public fields");

    const line = `${LUT_ENDORSEMENT} (LUT ARN ${ARN})`;
    assert.equal(M.invoiceExportNote(W, M.getInvoice(W, "inv_usd00001")), line, "a marked US$ invoice issued in the LUT's FY");
    assert.equal(M.invoiceExportNote(W, M.getInvoice(W, "inv_usd00003")), "", "never for a client with a GSTIN");
    const unmarked = M.upsertInvoice(W, (({ exportLut, ...rest }) => rest)(M.getInvoice(W, "inv_usd00001")), X + 5);
    assert.equal(M.invoiceExportNote(unmarked, M.getInvoice(unmarked, "inv_usd00001")), "", "never inferred from the currency");
    assert.equal(M.invoiceExportNote(W, { ...M.getInvoice(W, "inv_usd00001"), issueDate: "2027-04-01" }), "", "issued in the next FY: the LUT has expired");
    assert.equal(M.invoiceExportNote(W, { ...M.getInvoice(W, "inv_usd00001"), issueDate: "2027-03-31" }), line);
    assert.equal(M.invoiceExportNote(updateBusiness(W, { gstin: "" }, X + 5), M.getInvoice(W, "inv_usd00001")), "", "no business GSTIN, no LUT");
    const off = { ...W, intl: { ...W.intl, settings: { ...W.intl.settings, exportUnderLut: false } } };
    assert.equal(M.invoiceExportNote(off, M.getInvoice(W, "inv_usd00001")), "", "the LUT toggle off");
    assert.equal(M.invoiceExportNote(inrOnly, M.getInvoice(W, "inv_inr00001")), "", "never on an INR record");
    assert.equal(M.invoiceExportNote(W, { ...M.getInvoice(W, "inv_inr00001"), exportLut: true }), "", "an INR record never carries the line, even if marked");
  }

  /* ---------- reminders (§3.8) ---------- */
  {
    const tones = ["friendly", "due_today", "overdue", "final"];
    // INR: byte-identical to the old model for every tone, language, link and MSMED choice, with intl settings passed.
    for (const ws of [W, inrOnly]) {
      for (const v of M.invoiceViews(ws, day)) {
        for (const tone of tones) for (const lang of ["en", "hi"]) for (const link of [undefined, "https://www.proupiqr.in/i/Tok1/"]) for (const rights of [false, true]) {
          assert.equal(M.reminderMessage(v, ws.business, tone, link, lang, rights, ws.intl?.settings), legacy.reminderMessage(v, ws.business, tone, link, lang, rights), `${v.invoice.id} ${tone} ${lang}`);
        }
      }
    }
    const banned = /UPI|UTR|upi:\/\/|okaxis|MSMED|Udyam|UDYAM|43B/;
    const usd = viewOf("inv_usd00001");
    const text = M.reminderMessage(usd, W.business, "overdue", undefined, "en", true, W.intl.settings);
    assert.deepEqual(text.split("\n").slice(1), [
      "Pay by bank transfer:",
      "Account name: Sharma Tuition",
      "Bank: Wise US",
      "IBAN / account no.: 8310006789",
      "ACH routing 026073150",
      `${LUT_ENDORSEMENT} (LUT ARN ${ARN})`,
      "If you have already paid, please share the transfer reference so we can update our records. Thank you!",
      "— Sharma Tuition",
    ], "the USD override, the export line, a transfer reference");
    assert.match(text.split("\n")[0], /^Hi Acme Pvt Ltd, invoice ST-0003 for US\$4,500\.00 was due on .+ and is now 21 days overdue\.$/);
    assert.doesNotMatch(text, banned);
    const eur = M.reminderMessage(viewOf("inv_eur00001"), W.business, "friendly", undefined, "en", true, W.intl.settings);
    assert.deepEqual(eur.split("\n"), [
      eur.split("\n")[0],
      "Pay by bank transfer:",
      "Account name: Sharma Tuition LLP",
      "Bank: HDFC Bank",
      "SWIFT/BIC: HDFCINBB",
      "IBAN / account no.: 50100123456789",
      "Fort, Mumbai",
      "IFSC HDFC0000001",
      "Or pay online: https://paypal.me/sharma",
      `${LUT_ENDORSEMENT} (LUT ARN ${ARN})`,
      "Thank you!",
      "— Sharma Tuition",
    ], "EUR has no override: the default set, blank lines dropped");
    assert.match(eur, /^Hi Globex LLC, a friendly reminder that invoice ST-0005 for €0\.99 is due on /);
    // Hindi: the Hindi bank block, the export line in English, a transfer reference.
    const hi = M.reminderMessage(viewOf("inv_eur00001"), W.business, "overdue", undefined, "hi", true, W.intl.settings).split("\n");
    assert.deepEqual(hi.slice(1), [
      "बैंक ट्रांसफ़र से भुगतान करें:",
      "खाताधारक: Sharma Tuition LLP",
      "बैंक: HDFC Bank",
      "SWIFT/BIC: HDFCINBB",
      "IBAN / खाता नंबर: 50100123456789",
      "Fort, Mumbai",
      "IFSC HDFC0000001",
      "या ऑनलाइन भुगतान करें: https://paypal.me/sharma",
      `${LUT_ENDORSEMENT} (LUT ARN ${ARN})`,
      "अगर आपने भुगतान कर दिया है, तो कृपया ट्रांसफ़र रेफ़रेंस भेज दें ताकि हम रिकॉर्ड अपडेट कर सकें। धन्यवाद!",
      "— Sharma Tuition",
    ]);
    assert.match(hi[0], /€0\.99/);
    // With a pay link: the link only (the page shows the details).
    const linked = M.reminderMessage(usd, W.business, "final", "https://www.proupiqr.in/i/Tok9/", "en", false, W.intl.settings).split("\n");
    assert.deepEqual(linked.slice(1), ["Pay securely here: https://www.proupiqr.in/i/Tok9/", `${LUT_ENDORSEMENT} (LUT ARN ${ARN})`, "If you have already paid, please share the transfer reference so we can update our records. Thank you!", "— Sharma Tuition"]);
    assert.equal(M.reminderMessage(usd, W.business, "final", "https://x.example/i/T/", "hi", false, W.intl.settings).split("\n")[1], "यहाँ सुरक्षित भुगतान करें: https://x.example/i/T/");
    // An IBAN is grouped in fours; a URL alone; nothing set.
    const withIban = { ...settings, byCurrency: undefined, account: "GB82WEST12345698765432", payUrl: "" };
    assert.ok(M.reminderMessage(usd, W.business, "overdue", undefined, "en", false, withIban).includes("\nIBAN / account no.: GB82 WEST 1234 5698 7654 32\n"));
    assert.ok(!M.reminderMessage(usd, W.business, "overdue", undefined, "en", false, withIban).includes("Or pay online"));
    const urlOnly = { ...M.emptyIntlSettings(X), payUrl: "https://wise.com/pay/me/sharma" };
    assert.deepEqual(M.reminderMessage(usd, W.business, "friendly", undefined, "en", false, urlOnly).split("\n").slice(1), ["Pay online: https://wise.com/pay/me/sharma", "Thank you!", "— Sharma Tuition"]);
    assert.equal(M.reminderMessage(usd, W.business, "friendly", undefined, "hi", false, urlOnly).split("\n")[1], "ऑनलाइन भुगतान करें: https://wise.com/pay/me/sharma");
    // A hostile URL that reached the settings some other way is never printed.
    const hostile = { ...M.emptyIntlSettings(X), payUrl: "javascript:alert(1)" };
    assert.deepEqual(M.reminderMessage(usd, W.business, "friendly", undefined, "en", false, hostile).split("\n").slice(1), ["Thank you!", "— Sharma Tuition"]);
    for (const nothing of [undefined, M.emptyIntlSettings(X)]) {
      const t = M.reminderMessage(usd, W.business, "overdue", undefined, "en", true, nothing).split("\n");
      assert.deepEqual(t.slice(1), ["If you have already paid, please share the transfer reference so we can update our records. Thank you!", "— Sharma Tuition"], "no payment line, no export line without settings");
    }
    // LUT without a business GSTIN, or for a client with a GSTIN: no export line.
    assert.ok(!M.reminderMessage(usd, { ...W.business, gstin: "" }, "overdue", undefined, "en", false, W.intl.settings).includes("LUT ARN"));
    assert.ok(!M.reminderMessage(viewOf("inv_usd00003"), W.business, "overdue", undefined, "en", false, W.intl.settings).includes("LUT ARN"));
    // Never UPI, UTR, upi:// or MSMED text on a foreign reminder, whatever is asked.
    for (const v of all.filter((x) => x.currency !== "INR")) {
      for (const tone of tones) for (const lang of ["en", "hi"]) for (const link of [undefined, "https://www.proupiqr.in/i/Tok1/"]) for (const intl of [undefined, W.intl.settings, urlOnly]) {
        const t = M.reminderMessage(v, W.business, tone, link, lang, true, intl);
        assert.doesNotMatch(t, banned, `${v.invoice.id} ${tone} ${lang}`);
        assert.ok(!t.includes("₹"), "a foreign reminder has no ₹ amount");
      }
    }
  }

  /* ---------- WhatsApp numbers (§3.8) ---------- */
  {
    const intl = { international: true };
    assert.equal(M.whatsappLink("+1 415 555 0100", "Hi", intl), "https://wa.me/14155550100?text=Hi");
    assert.equal(M.whatsappLink("+44 7700 900123", "Hi", intl), "https://wa.me/447700900123?text=Hi");
    assert.equal(M.whatsappLink("00971501234567", "Hi", intl), "https://wa.me/971501234567?text=Hi");
    assert.equal(M.whatsappLink("+44 07700 900123", "Hi", intl), "https://wa.me/4407700900123?text=Hi", "used as typed, no 0 stripped");
    assert.equal(M.whatsappLink("+1 234", "Hi", intl), "https://wa.me/?text=Hi", "too short to be a number");
    assert.equal(M.whatsappLink("+65 8123 4567", "Hi", intl), "https://wa.me/6581234567?text=Hi", "a 10-digit Singapore number");
    assert.equal(M.whatsappLink("0065 8123 4567", "Hi", intl), "https://wa.me/6581234567?text=Hi", "the 00 prefix at that length");
    assert.equal(M.whatsappLink("+12 345 678", "Hi", intl), "https://wa.me/12345678?text=Hi", "8 digits: the shortest number kept");
    assert.equal(M.whatsappLink("+12 345 67", "Hi", intl), "https://wa.me/?text=Hi", "7 digits: dropped");
    // International without a "+": today's rule (a 10-digit number is Indian).
    assert.equal(M.whatsappLink("98765 43210", "Hi", intl), "https://wa.me/919876543210?text=Hi");
    // Without the option (INR): today's output, byte for byte, including a "+" typed before an Indian number.
    for (const phone of ["+98765 43210", "98765 43210", "098765 43210", "+91 98765 43210", "+1 415 555 0100", "00971501234567", "", "12345"]) {
      assert.equal(M.whatsappLink(phone, "Hi ₹"), legacy.whatsappLink(phone, "Hi ₹"), phone);
      assert.equal(M.whatsappLink(phone, "Hi ₹", { international: false }), legacy.whatsappLink(phone, "Hi ₹"), phone);
    }
    assert.equal(M.whatsappLink("+98765 43210", "Hi"), "https://wa.me/919876543210?text=Hi");
  }

  /* ---------- CSV (§3.7) ---------- */
  {
    // No foreign invoice in the export: exactly the old bytes (also for an export of a mixed book's INR views).
    assert.equal(M.invoicesCsv(M.invoiceViews(W, day)), legacy.invoicesCsv(legacy.invoiceViews(inrOnly, day)));
    assert.equal(M.invoicesCsv([]), legacy.invoicesCsv([]));
    const csv = M.invoicesCsv(all).split("\n");
    assert.equal(csv[0], "Invoice,Client,Phone,Issue date,Due date,Amount (INR),Paid (INR),Balance (INR),Status,Days past due,Description,Currency,Amount,Paid,Balance,INR credited");
    const row = (number) => csv.find((r) => r.startsWith(`${number},`));
    assert.equal(row("ST-0001"), "ST-0001,Acme Pvt Ltd,98765 43210,2026-09-01,2026-09-20,4500.00,0.00,4500.00,overdue,21,,INR,4500.00,0.00,4500.00,");
    assert.equal(row("ST-0004"), "ST-0004,Globex LLC,'+1 415 555 0100,2026-09-01,2026-09-20,,,,overdue,21,,USD,1200.50,0.50,1200.00,41.50", "(INR) columns empty on foreign rows");
    assert.equal(row("ST-0005"), "ST-0005,Globex LLC,'+1 415 555 0100,2026-09-01,2026-10-30,,,,due,0,,EUR,0.99,0.00,0.99,", "no payments: no INR credited");
    // The first 11 columns keep their positions; a SUM over Amount (INR) is still rupees only.
    const inrSum = csv.slice(1).map((r) => r.split(",")[5]).filter(Boolean).reduce((s, x) => s + Number(x.replace(".", "")), 0);
    assert.equal(inrSum, 450000 + 120000);
    // INR credited only when every payment has it.
    const partial = M.addPayment(W, "inv_usd00002", { amountPaise: 100, date: "2026-10-01", mode: "bank", reference: "" }, X + 6);
    assert.ok(M.invoicesCsv(M.allInvoiceViews(partial, day)).split("\n").find((r) => r.startsWith("ST-0004,")).endsWith(",USD,1200.50,1.50,1199.00,"));
    const full = M.addPayment(W, "inv_usd00002", { amountPaise: 100, date: "2026-10-01", mode: "bank", reference: "", inrCreditedPaise: 8_300 }, X + 6);
    assert.ok(M.invoicesCsv(M.allInvoiceViews(full, day)).split("\n").find((r) => r.startsWith("ST-0004,")).endsWith(",USD,1200.50,1.50,1199.00,124.50"));
    // Formula injection is neutralized on foreign rows too.
    const hostile = M.upsertInvoice(W, { ...M.getInvoice(W, "inv_eur00001"), number: "=HYPERLINK(\"x\")", description: "@SUM(A1)" }, X + 6);
    const hostileRow = M.invoicesCsv(M.allInvoiceViews(hostile, day)).split("\n").find((r) => r.includes("HYPERLINK"));
    assert.ok(hostileRow.startsWith(`"'=HYPERLINK(""x"")"`) && hostileRow.includes(",'@SUM(A1),EUR,"));
  }

  /* ---------- MSMED rights and statement import stay INR-only (§3.6) ---------- */
  {
    assert.equal(M.msmeRightsLine(W.business, "en").includes("UDYAM-MH-12-1234567"), true, "the INR line exists for this business");
    assert.ok(!M.reminderMessage(viewOf("inv_usd00001"), W.business, "final", undefined, "en", true, W.intl.settings).includes("UDYAM"));
  }
}

console.log("[workspace] money, dates, aging, reminders, CSV, merge, sanitizer, receipt, and MSME checks passed");
