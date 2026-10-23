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

  /* ---------- merge (§1.5) ---------- */
  {
    let seed = 42;
    const rnd = (n) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
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
    for (let i = 0; i < 300; i++) {
      const a = randomIntl();
      const b = randomIntl();
      const ab = M.mergeIntl(a, b);
      const ba = M.mergeIntl(b, a);
      assert.equal(M.canonicalJson({ ...emptyWorkspace(), ...(ab ? { intl: ab } : {}) }), M.canonicalJson({ ...emptyWorkspace(), ...(ba ? { intl: ba } : {}) }), "mergeIntl is commutative");
      // Absence never deletes, at entry level too.
      for (const id of Object.keys(a?.invoices ?? {})) assert.ok(ab.invoices[id], "an entry missing on one side is kept");
      if (a?.settings || b?.settings) assert.ok(ab.settings);
    }
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
    // Settings with content are never overwritten by a restore.
    const kept = M.restoreFrom({ ...W, intl: { ...W.intl, settings: { ...settings, accountName: "Current", updatedAt: X + 1 } } }, W, X + 60);
    assert.equal(kept.intl.settings.accountName, "Current");
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
      assert.equal(merged.clients.cli_globex01.updatedAt, X + 200);
      assert.ok(Object.keys(merged.invoices).every((id) => !merged.intl.invoices[id]));
      assert.equal(M.repairIntl(merged, X + 300), merged, "repairIntl is idempotent (same object, no extra writes)");
    }
    assert.equal(M.canonicalJson(M.repairIntl(M.mergeWorkspaces(W, L), X + 200)), M.canonicalJson(M.repairIntl(M.mergeWorkspaces(L, W), X + 200)));
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
    assert.ok(M.invoiceViews(mixed, today).every((v) => v.currency === "INR"));
    assert.equal(snapshotFor(mixed, "inv_usd00001"), null, "a PR 1 server answers 404 for a foreign invoice link");
    assert.equal(payPageView(mixed, "inv_usd00001", today), null);
    assert.ok(payPageView(mixed, "inv_inr00001", today));
    assert.equal(statementView(mixed, "cli_acme0001", today), null, "never a ₹-only statement for a client who owes US$");
    assert.equal(statementView(mixed, "cli_globex01", today), null, "never 'Paid' for a client who owes only US$");
    assert.equal(snapshotFor(mixed, "stmt:cli_globex01"), null);
    assert.deepEqual(digestProjection(mixed), digestProjection(inrOnly), "the digest projection leaves foreign records out");
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

console.log("[workspace] money, dates, aging, reminders, CSV, merge, sanitizer, receipt, and MSME checks passed");
