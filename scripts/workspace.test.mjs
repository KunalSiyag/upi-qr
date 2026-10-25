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
  // The PR 1/PR 2 server builders (what a rollback of PR 3 runs); PR 3's own are tested in paylinks.test.mjs.
  const { snapshotFor, statementView, payPageView } = await import("./fixtures/pr2-paylinks.ts");
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
  // generateRecurring on an INR-only book writes what the deployed code writes (updatedAt === createdAt, no settled
  // +1: that is for foreign months only).
  {
    const planned = upsertPlan(inrBook, { id: "rec_inrbyte01", clientId: "cli_acme0001", amountPaise: 250000, description: "Fees", dayOfMonth: 5, dueAfterDays: 7, startMonth: "2026-08", endMonth: "", paused: false, createdAt: X, updatedAt: X }, X);
    const now = M.generateRecurring(M.sanitizeWorkspace(clone(planned)), "2026-10-10", X + 300);
    const old = legacy.generateRecurring(legacy.sanitizeWorkspace(clone(planned)), "2026-10-10", X + 300);
    assert.equal(now.created.length, 3);
    assert.deepEqual(now.created, old.created);
    assert.equal(M.canonicalJson(now.ws), legacy.canonicalJson(old.ws), "an INR plan's months are byte-identical to the deployed code");
    assert.ok(now.created.every((id) => now.ws.invoices[id].updatedAt === now.ws.invoices[id].createdAt));
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
    assert.equal(snapshotFor(mixed, "inv_usd00001"), null, "a PR 1/PR 2 server answers 404 for a foreign invoice link");
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
    // Review round 4: the copy's id is derived from the old id (replacementInvoiceId), so a stale write that brings
    // the old invoice back is found: deleted again without a payment, shown as a pair with one.
    {
      assert.equal(moved.id, M.replacementInvoiceId("inv_usd00001", "EUR"));
      const st3 = (book) => M.allLiveInvoices(book).filter((i) => i.number === "ST-0003").map((i) => [i.id, M.currencyOf(i)]).sort();
      const again = M.replaceInvoiceCurrency(W, "inv_usd00001", "EUR", X + 11);
      assert.deepEqual(st3(M.repairIntl(M.mergeWorkspaces(moved.ws, again.ws), X + 12)), [[moved.id, "EUR"]], "the same move on two devices makes one invoice");
      // A reminder logged on the old id by a copy that hadn't seen the move.
      const reminded = M.mergeWorkspaces(moved.ws, M.logReminder(W, "inv_usd00001", "whatsapp", X + 20));
      assert.equal(reminded.intl.invoices.inv_usd00001.deletedAt, undefined, "(the stale reminder brought the old one back)");
      assert.deepEqual([...M.invoicesMovedTwice(reminded)].sort(), ["inv_usd00001", moved.id].sort(), "flagged before the repair");
      const repaired = M.repairIntl(reminded, X + 21);
      assert.deepEqual([repaired.intl.invoices.inv_usd00001.deletedAt, repaired.intl.invoices.inv_usd00001.updatedAt], [X + 21, X + 21], "deleted again at updatedAt + 1");
      assert.equal(M.repairIntl(repaired, X + 22), repaired, "one pass is the fixed point");
      assert.deepEqual(st3(repaired), [[moved.id, "EUR"]]);
      assert.equal(M.invoicesMovedTwice(repaired).size, 0);
      // A backup from before the move, restored after it.
      assert.deepEqual(st3(M.repairIntl(M.restoreFrom(moved.ws, W, X + 30), X + 30)), [[moved.id, "EUR"]], "a restore doesn't bring the old one back");
      // The copy deleted by the user since: a stale write that brings the old one back leaves it live (review round 5:
      // a deleted copy means the user resolved the pair or deleted the invoice; they can delete this one too).
      const gone = M.mergeWorkspaces(M.deleteInvoice(moved.ws, moved.id, X + 31), M.logReminder(W, "inv_usd00001", "sms", X + 32));
      assert.deepEqual(st3(M.repairIntl(gone, X + 33)), [["inv_usd00001", "USD"]], "a deleted copy never deletes the old one");
      assert.equal(M.invoicesMovedTwice(M.repairIntl(gone, X + 33)).size, 0);
      // A payment recorded on the old id by a stale copy is kept: both stay, both flagged.
      const paid = M.repairIntl(M.mergeWorkspaces(moved.ws, M.addPayment(W, "inv_usd00001", { amountPaise: 1000, date: "2026-10-02", mode: "bank", reference: "" }, X + 40)), X + 41);
      assert.deepEqual(st3(paid), [["inv_usd00001", "USD"], [moved.id, "EUR"]].sort());
      assert.deepEqual([...M.invoicesMovedTwice(paid)].sort(), ["inv_usd00001", moved.id].sort());
      // ₹ → US$, then a pre-intl tab records the client's UPI payment on the ₹ invoice.
      const toUsd = M.replaceInvoiceCurrency(W, "inv_inr00001", "USD", X + 50);
      const oldTab = legacy.addPayment(legacy.sanitizeWorkspace(JSON.parse(JSON.stringify(M.withoutIntl(W)))), "inv_inr00001", { amountPaise: 450000, date: "2026-10-03", mode: "upi", reference: "" }, X + 60);
      const upi = M.repairIntl(M.mergeWorkspaces(toUsd.ws, oldTab), X + 61);
      assert.equal(upi.invoices.inv_inr00001.payments.length, 1, "the ₹ payment is kept");
      assert.deepEqual([...M.invoicesMovedTwice(upi)].sort(), ["inv_inr00001", toUsd.id].sort(), "the paid ₹ invoice and its open US$ copy are shown");
      // Two devices moving one invoice to two currencies.
      const gbp = M.replaceInvoiceCurrency(W, "inv_usd00001", "GBP", X + 70);
      assert.deepEqual([...M.invoicesMovedTwice(M.repairIntl(M.mergeWorkspaces(moved.ws, gbp.ws), X + 71))].sort(), [moved.id, gbp.id].sort());
      // A live copy (with a payment from the other device) is never overwritten by the same move again.
      const copyPaid = M.addPayment(moved.ws, moved.id, { amountPaise: 2000, date: "2026-10-04", mode: "bank", reference: "" }, X + 80);
      const revived = M.upsertInvoice(copyPaid, M.withoutTombstone(M.getInvoice(copyPaid, "inv_usd00001")), X + 81);
      const re = M.replaceInvoiceCurrency(revived, "inv_usd00001", "EUR", X + 82);
      assert.equal(re.id, moved.id);
      assert.equal(M.getInvoice(re.ws, moved.id).payments.length, 1, "the copy's payment stays");
      assert.ok(M.getInvoice(re.ws, "inv_usd00001").deletedAt);
      // Review round 6: moving the old one again (Edit on it, next to its live copy) puts the sheet's edits on the live
      // copy, at now; an edit that changes nothing leaves the copy as it is.
      {
        const edited = M.replaceInvoiceCurrency(reminded, "inv_usd00001", "EUR", X + 90, (copy) => ({ ...copy, description: "Edited" }));
        assert.equal(edited.id, moved.id);
        assert.deepEqual([M.getInvoice(edited.ws, moved.id).description, M.getInvoice(edited.ws, moved.id).updatedAt], ["Edited", X + 90], "the edit reaches the live copy");
        assert.ok(M.getInvoice(edited.ws, "inv_usd00001").deletedAt);
        const same = M.replaceInvoiceCurrency(reminded, "inv_usd00001", "EUR", X + 90, (copy) => ({ ...copy }));
        assert.equal(M.getInvoice(same.ws, moved.id), M.getInvoice(reminded, moved.id), "an edit that changes nothing doesn't rewrite it");
      }
      assert.equal(M.invoicesMovedTwice(W).size, 0, "nothing moved, nothing flagged");

      // Review round 5. A void recorded on the old id by a stale copy is kept, like a payment: both stay, both flagged.
      {
        const voided = M.repairIntl(M.mergeWorkspaces(moved.ws, M.upsertInvoice(W, { ...W.intl.invoices.inv_usd00001, voided: true }, X + 40)), X + 41);
        assert.deepEqual([Boolean(voided.intl.invoices.inv_usd00001.deletedAt), voided.intl.invoices.inv_usd00001.voided], [false, true], "the void is kept");
        assert.deepEqual([...M.invoicesMovedTwice(voided)].sort(), ["inv_usd00001", moved.id].sort());
      }
      // The user keeps the ₹ invoice a stale tab paid and deletes its US$ copy; undoing that payment later doesn't
      // delete the kept invoice.
      {
        const usd = M.replaceInvoiceCurrency(W, "inv_inr00001", "USD", X + 50);
        const stale = legacy.addPayment(legacy.sanitizeWorkspace(JSON.parse(JSON.stringify(M.withoutIntl(W)))), "inv_inr00001", { amountPaise: 450000, date: "2026-10-03", mode: "upi", reference: "" }, X + 60);
        let kept = M.repairIntl(M.deleteInvoice(M.repairIntl(M.mergeWorkspaces(usd.ws, stale), X + 61), usd.id, X + 62), X + 63);
        assert.equal(M.invoicesMovedTwice(kept).size, 0, "resolved");
        kept = M.repairIntl(M.removePayment(kept, "inv_inr00001", kept.invoices.inv_inr00001.payments[0].id, X + 64), X + 65);
        assert.ok(!kept.invoices.inv_inr00001.deletedAt, "the kept ₹ invoice stays after its payment is undone");
      }
      // A backup from before the move restores the old invoice once its copy is gone: deleted by the user, or erased.
      {
        const usd = M.replaceInvoiceCurrency(W, "inv_inr00001", "USD", X + 50);
        const restoredAfter = (book) => M.repairIntl(M.restoreFrom(book, W, X + 70), X + 70);
        assert.ok(!restoredAfter(M.deleteInvoice(usd.ws, usd.id, X + 60)).invoices.inv_inr00001.deletedAt, "copy deleted, then restore: the ₹ invoice is back");
        const erased = restoredAfter(M.eraseWorkspace(usd.ws, X + 60));
        assert.ok(!erased.invoices.inv_inr00001.deletedAt, "Erase, then restore of a pre-move backup: the ₹ invoice is back");
        assert.ok(M.getInvoice(erased, usd.id).deletedAt, "and the copy stays erased");
      }
      // A chain of moves: the old invoice is deleted again while any later copy is live, never after the last is deleted.
      {
        const usd = M.replaceInvoiceCurrency(W, "inv_inr00001", "USD", X + 50);
        const eur = M.replaceInvoiceCurrency(usd.ws, usd.id, "EUR", X + 51);
        assert.equal(M.movedCopyOf(eur.ws, W.invoices.inv_inr00001).id, eur.id, "followed through the deleted US$ copy");
        const stale = M.mergeWorkspaces(eur.ws, M.logReminder(W, "inv_inr00001", "whatsapp", X + 60));
        assert.ok(M.repairIntl(stale, X + 61).invoices.inv_inr00001.deletedAt, "₹ → US$ → €: a stale ₹ write is deleted again");
        const allGone = M.mergeWorkspaces(M.deleteInvoice(eur.ws, eur.id, X + 55), M.logReminder(W, "inv_inr00001", "whatsapp", X + 60));
        assert.ok(!M.repairIntl(allGone, X + 61).invoices.inv_inr00001.deletedAt, "…and left alone once the € copy was deleted");
      }
      // Two devices make the same move; one records the client's payment on the copy before the other's move syncs.
      // The bare copy is written at a time derived from the old invoice, so the same move again never overwrites it.
      {
        const sheetMove = (book, now, amount) => M.replaceInvoiceCurrency(book, "inv_inr00001", "USD", now, (copy) => ({ ...copy, amountPaise: amount, description: "Design" }));
        const bare = M.replaceInvoiceCurrency(W, "inv_inr00001", "USD", X + 100);
        assert.equal(M.getInvoice(bare.ws, bare.id).updatedAt, W.invoices.inv_inr00001.updatedAt + 1, "the bare copy's time comes from the old invoice");
        const paidX = M.addPayment(bare.ws, bare.id, { amountPaise: 100_000, date: "2026-10-20", mode: "bank", reference: "FIRA-778", inrCreditedPaise: 8_350_000 }, X + 200);
        const y = M.replaceInvoiceCurrency(W, "inv_inr00001", "USD", X + 300);
        assert.equal(y.id, bare.id);
        for (const merged of [M.mergeWorkspaces(paidX, y.ws), M.mergeWorkspaces(y.ws, paidX)]) {
          const copy = M.getInvoice(M.repairIntl(merged, X + 400), bare.id);
          assert.deepEqual([copy.payments.length, copy.payments[0]?.inrCreditedPaise, Boolean(copy.deletedAt)], [1, 8_350_000, false], "the payment and its INR credited survive");
        }
        // Review round 6: the sheet's edits are an ordinary edit at `now`, so a later amount typed on another device
        // wins as any later edit does, even over a reminder logged in between on the first device.
        const x = sheetMove(W, X + 100, 110_000);
        assert.deepEqual([M.getInvoice(x.ws, x.id).updatedAt, M.getInvoice(x.ws, x.id).amountPaise, M.getInvoice(x.ws, x.id).description], [X + 100, 110_000, "Design"], "the edit is in the copy, at now");
        const reminded = M.logReminder(x.ws, x.id, "whatsapp", X + 105);
        const later = sheetMove(W, X + 200, 120_000);
        for (const merged of [M.mergeWorkspaces(reminded, later.ws), M.mergeWorkspaces(later.ws, reminded)]) {
          assert.equal(M.getInvoice(M.repairIntl(merged, X + 300), x.id).amountPaise, 120_000, "the later amount survives");
        }
        assert.equal(M.getInvoice(sheetMove(W, X - 50, 110_000).ws, x.id).updatedAt, W.invoices.inv_inr00001.updatedAt + 2, "an edit is never older than the bare copy");
        // An edit that changes nothing leaves the bare copy at its derived time.
        assert.equal(M.getInvoice(M.replaceInvoiceCurrency(W, "inv_inr00001", "USD", X + 100, (copy) => ({ ...copy })).ws, x.id).updatedAt, X + 1);
      }
      // Review round 6: two devices move one US$ invoice to ₹ offline, each typing its own amount. The ₹ copy lives in
      // the legacy map, whose merge breaks ties by argument order (the server and the client merge in opposite orders),
      // so the copies must never tie: through the real sync and the client's merge, in both push orders, every copy
      // ends with the same bytes.
      {
        const { memoryCloudStore, syncWorkspace } = await import("../src/lib/workspace/cloud.ts");
        const toInr = (now, amount) => M.replaceInvoiceCurrency(W, "inv_usd00001", "INR", now, (copy) => ({ ...copy, amountPaise: amount })).ws;
        for (const first of ["a", "b"]) {
          const store = memoryCloudStore();
          await syncWorkspace(store, "ws:doc:o", W, X + 10);
          const devices = { a: toInr(X + 1_000, 8_000_000), b: toInr(X + 2_000, 8_500_000) };
          const order = first === "a" ? ["a", "b", "a", "b"] : ["b", "a", "b", "a"];
          for (const [i, d] of order.entries()) {
            const reply = await syncWorkspace(store, "ws:doc:o", devices[d], X + 3_000 + i);
            devices[d] = M.repairIntl(M.mergeWorkspaces(devices[d], reply.workspace), X + 3_000 + i);
          }
          const server = M.canonicalJson((await syncWorkspace(store, "ws:doc:o", devices.a, X + 4_000)).workspace);
          assert.equal(M.canonicalJson(devices.a), server, `${first} first: device A converged`);
          assert.equal(M.canonicalJson(devices.b), server, `${first} first: device B converged`);
          assert.equal(M.sanitizeWorkspace(JSON.parse(server)).invoices[M.replacementInvoiceId("inv_usd00001", "INR")].amountPaise, 8_500_000, "the later amount");
        }
      }
      {
        const x = M.replaceInvoiceCurrency(W, "inv_inr00001", "USD", X + 100, (copy) => ({ ...copy, amountPaise: 100_000, description: "Design" }));
        // The edit can't change the copy's id or currency.
        const forced = M.replaceInvoiceCurrency(W, "inv_inr00001", "EUR", X + 100, (copy) => ({ ...copy, id: "inv_other", currency: "GBP" }));
        assert.deepEqual([forced.id, M.getInvoice(forced.ws, forced.id).currency, M.getInvoice(forced.ws, "inv_other")], [M.replacementInvoiceId("inv_inr00001", "EUR"), "EUR", undefined]);
        // A copy the user deleted is written again past its tombstone, so the new move wins every merge.
        // (The old one came back through a stale reminder at X + 150, older than the copy's deletion at X + 500.)
        const userDeleted = M.deleteInvoice(M.mergeWorkspaces(x.ws, M.logReminder(W, "inv_inr00001", "sms", X + 150)), x.id, X + 500);
        assert.ok(!M.repairIntl(userDeleted, X + 501).invoices.inv_inr00001.deletedAt);
        const again = M.replaceInvoiceCurrency(userDeleted, "inv_inr00001", "USD", X + 600);
        assert.ok(!M.getInvoice(M.mergeWorkspaces(again.ws, userDeleted), x.id).deletedAt, "moved again after the copy was deleted");
      }
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
    // Review round 5: a deleted foreign plan month keeps its tombstone while generateRecurring could still bill the
    // month (monthsBilledTwice asks the user to delete one), so prune-then-generate never bills it again.
    for (const days of [91, 200, 330]) {
      const later = M.pruneTombstones(tomb, X + 23 + days * DAY);
      const day = new Date(X + 23 + days * DAY).toISOString().slice(0, 10);
      assert.ok(M.getInvoice(later, recurringInvoiceId(plan.id, "2026-10"))?.deletedAt, `kept after ${days} days`);
      assert.ok(!M.generateRecurring(later, day, X + 24 + days * DAY).created.includes(recurringInvoiceId(plan.id, "2026-10")), `not billed again after ${days} days`);
    }
    assert.equal(M.getInvoice(M.pruneTombstones(tomb, X + 23 + 500 * DAY), recurringInvoiceId(plan.id, "2026-10")), undefined, "pruned once the month is past the backfill window");
    // Review round 6: exactly at the window's edge. In September and October 2027 (October 2026 is 11 and 12 months
    // back) the month can still be billed somewhere in the world, so the tombstone stays; in November it can't.
    for (const at of ["2027-09-20", "2027-10-20", "2027-11-20"]) {
      const t = Date.parse(`${at}T12:00:00Z`);
      const later = M.pruneTombstones(tomb, t);
      const kept = Boolean(M.getInvoice(later, recurringInvoiceId(plan.id, "2026-10"))?.deletedAt);
      assert.equal(kept, at !== "2027-11-20", `${at}: the tombstone ${at === "2027-11-20" ? "is pruned" : "stays"}`);
      assert.ok(!M.generateRecurring(later, at, t).created.includes(recurringInvoiceId(plan.id, "2026-10")), `${at}: never billed again`);
    }
    assert.equal(M.replaceInvoiceCurrency(g.ws, recurringInvoiceId(plan.id, "2026-10"), "EUR", X + 25), null, "a plan month can't change currency");
    // A plan's currency change ends the old plan after its last month and starts a new one; nothing regenerates.
    // The amount is given in the new currency: a plan's minor units never carry across currencies.
    for (const bad of [0, -1, 1.5, NaN, 100_000_000_001]) assert.equal(M.replacePlanCurrency(g.ws, plan.id, "EUR", X + 26, bad), null, `amount ${bad} is refused`);
    const re = M.replacePlanCurrency(g.ws, plan.id, "EUR", X + 26, 46000);
    assert.equal(re.ws.intl.recurring[plan.id].endMonth, "2026-10");
    assert.deepEqual([re.ws.intl.recurring[re.id].startMonth, re.ws.intl.recurring[re.id].currency, re.ws.intl.recurring[re.id].amountPaise], ["2026-11", "EUR", 46000]);
    assert.notEqual(re.id, plan.id);
    assert.equal(M.generateRecurring(re.ws, "2026-10-31", X + 27).created.length, 0);
    const nov = M.generateRecurring(re.ws, "2026-11-10", X + 28);
    assert.deepEqual(nov.created.map((id) => [nov.ws.intl.invoices[id].currency, nov.ws.intl.invoices[id].amountPaise]), [["EUR", 46000]]);
    const toInrPlan = M.replacePlanCurrency(P, plan.id, "INR", X + 29, 4_200_000);
    assert.equal(toInrPlan.ws.recurring[toInrPlan.id].amountPaise, 4_200_000);
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
    assert.equal(M.replacePlanCurrency(generated, "rec_usd00002", "EUR", X + 3, 90), null, "an ended, fully billed plan is never replaced by one that starts after its end");
    const open = M.upsertPlan(w, { ...M.getPlan(w, "rec_usd00002"), endMonth: "2026-12" }, X + 1);
    const g2 = M.generateRecurring(open, "2026-10-10", X + 1).ws;
    const r = M.replacePlanCurrency(g2, "rec_usd00002", "EUR", X + 3, 90);
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
    // The default window is summarize's 7 days: an INR invoice and a € one due the same day count as due soon together.
    {
      const mirrored = M.upsertInvoice(W, invoice("inv_inr00099", "ST-0099", "cli_globex01", 99, { dueDate: "2026-10-30" }), X + 2);
      for (const [d, expected] of [["2026-10-22", 0], ["2026-10-23", 1]]) {
        const views = M.allInvoiceViews(mirrored, d);
        const base = M.summarize(M.allInvoiceViews(W, d), d);
        const inr = M.summarize(views, d);
        assert.deepEqual([M.summarizeForeign(views, d).EUR.dueSoonCount, M.summarizeForeign(views, d).EUR.dueSoonPaise], [expected, 99 * expected], `default € window at ${d}`);
        assert.deepEqual([inr.dueSoonCount - base.dueSoonCount, inr.dueSoonPaise - base.dueSoonPaise], [expected, 99 * expected], `the INR twin at ${d}`);
      }
      assert.equal(M.summarizeForeign(M.allInvoiceViews(mirrored, "2026-10-22"), "2026-10-22", 8).EUR.dueSoonCount, 1, "an explicit 8 days widens it");
    }

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
    // A clientId that is an Object.prototype key (crafted sync or hand-edited backup) has no client: the view's
    // client is undefined (never a prototype value), the reminder is built, and its export note is invoiceExportNote's.
    for (const clientId of ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"]) {
      const raw = clone(W);
      raw.intl.invoices.inv_usd00001.clientId = clientId;
      raw.invoices.inv_inr00001.clientId = clientId;
      const pw = M.sanitizeWorkspace(raw);
      assert.equal(pw.intl.invoices.inv_usd00001.clientId, clientId, "the sanitizer keeps the invoice");
      const v = viewOf("inv_usd00001", pw);
      assert.equal(v.client, undefined, `${clientId}: no client`);
      const note = M.invoiceExportNote(pw, v.invoice);
      assert.ok(note.includes(ARN), "the note applies (no client GSTIN)");
      for (const tone of tones) for (const lang of ["en", "hi"]) {
        const t = M.reminderMessage(v, pw.business, tone, undefined, lang, true, pw.intl.settings).split("\n");
        assert.ok(t.includes(note), `${clientId} ${tone} ${lang}: the same export note`);
        assert.ok(t[0].startsWith(lang === "hi" ? "नमस्ते जी," : "Hi there,"), t[0]);
      }
      const inr = viewOf("inv_inr00001", pw);
      assert.equal(inr.client, undefined);
      assert.ok(M.reminderMessage(inr, pw.business, "overdue").startsWith("Hi there,"), "an INR invoice too: never \"Hi Object\"");
    }
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
    // A bracketed "(0)" is the trunk prefix, dropped; a significant 0 (Italy) stays.
    assert.equal(M.whatsappLink("+44 (0)20 7946 0958", "Hi", intl), "https://wa.me/442079460958?text=Hi");
    assert.equal(M.whatsappLink("+44 ( 0 ) 20 7946 0958", "Hi", intl), "https://wa.me/442079460958?text=Hi");
    assert.equal(M.whatsappLink("0044(0)2079460958", "Hi", intl), "https://wa.me/442079460958?text=Hi");
    assert.equal(M.whatsappLink("+39 06 1234 5678", "Hi", intl), "https://wa.me/390612345678?text=Hi", "Italy keeps its 0");
    assert.equal(M.whatsappLink("+39 (06) 1234 5678", "Hi", intl), "https://wa.me/390612345678?text=Hi", "only a lone bracketed 0 goes");
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

/* ---------- PR 4 helpers: client billing currency and the settings record (§1.6) ---------- */
{
  const M = await import("../src/lib/workspace/model.ts");
  const X = Date.UTC(2026, 9, 1);
  const client = { id: "cli_globex01", name: "Globex LLC", phone: "+1 415 555 0100", email: "", gstin: "", createdAt: X, updatedAt: X };
  const inr = M.upsertClient(M.updateBusiness(M.emptyWorkspace(), { name: "Shop", upiId: "s@okaxis" }, X), client, X);
  const bytes = M.canonicalJson(M.sanitizeWorkspace(inr));

  // INR is the default and is never written: an INR-only book keeps its bytes (no intl key).
  assert.equal(M.clientCurrency(inr, client.id), "INR");
  assert.equal(M.setClientCurrency(inr, client.id, "INR", X + 1), inr, "INR on a client without an entry writes nothing");
  assert.equal(M.canonicalJson(M.sanitizeWorkspace(M.setClientCurrency(inr, client.id, "INR", X + 1))), bytes);
  assert.equal(M.clientCurrency(inr, "constructor"), "INR", "own keys only");

  const usd = M.setClientCurrency(inr, client.id, "USD", X + 2);
  assert.equal(M.clientCurrency(usd, client.id), "USD");
  assert.deepEqual(usd.intl.clients[client.id], { currency: "USD", updatedAt: X + 2 });
  assert.equal(M.setClientCurrency(usd, client.id, "USD", X + 3), usd, "unchanged → same object (no write)");
  assert.deepEqual(M.sanitizeWorkspace(JSON.parse(JSON.stringify(usd))).intl.clients, usd.intl.clients, "round trip");
  const eur = M.setClientCurrency(usd, client.id, "EUR", X + 4);
  assert.equal(M.clientCurrency(eur, client.id), "EUR");
  // Back to INR: a tombstone, never an "INR" entry.
  const back = M.setClientCurrency(eur, client.id, "INR", X + 5);
  assert.equal(M.clientCurrency(back, client.id), "INR");
  assert.deepEqual(back.intl.clients[client.id], { currency: "EUR", updatedAt: X + 5, deletedAt: X + 5 });
  assert.ok(!JSON.stringify(back).includes('"INR"'));
  // The tombstone wins the merge against the older entry in both orders, and the pruned book is INR bytes again.
  assert.equal(M.clientCurrency(M.mergeWorkspaces(eur, back), client.id), "INR");
  assert.equal(M.clientCurrency(M.mergeWorkspaces(back, eur), client.id), "INR");
  assert.equal(M.canonicalJson(M.pruneTombstones(M.sanitizeWorkspace(back), X + 5 + 91 * 86_400_000)), bytes);
  // USD → INR → EUR: setting a foreign currency again after the tombstone writes a live entry that wins the merge.
  const again = M.setClientCurrency(back, client.id, "EUR", X + 6);
  assert.notEqual(again, back, "a tombstoned entry is never 'unchanged'");
  assert.equal(M.clientCurrency(again, client.id), "EUR");
  assert.ok(!("deletedAt" in again.intl.clients[client.id]), "the tombstone is not carried into the new entry");
  assert.equal(M.clientCurrency(M.mergeWorkspaces(again, back), client.id), "EUR");
  assert.equal(M.clientCurrency(M.mergeWorkspaces(back, again), client.id), "EUR");

  // Settings: one record, normalized like the sanitizer; every field kept on a later patch.
  const on = M.updateIntlSettings(inr, { on: true }, X + 10);
  assert.equal(on.intl.settings.on, true);
  assert.equal(on.intl.settings.updatedAt, X + 10);
  assert.deepEqual(Object.keys(on.intl.invoices), []);
  const details = M.updateIntlSettings(on, {
    accountName: "  Sharma Tuition LLP ", bankName: "HDFC Bank", swift: "hdfc in bb", account: "gb82 west 1234 5698 7654 32",
    bankDetails: "ABA 026009593\n\n", payUrl: "https://paypal.me/sharma",
  }, X + 11);
  const s = details.intl.settings;
  assert.equal(s.on, true, "an earlier field survives a later patch");
  assert.equal(s.swift, "HDFCINBB");
  assert.equal(s.account, "GB82WEST12345698765432");
  assert.equal(s.payUrl, "https://paypal.me/sharma");
  assert.ok(M.intlPayable(s, "USD"));
  assert.equal(M.updateIntlSettings(on, { payUrl: "https://evil.example/pay" }, X + 12).intl.settings.payUrl, "", "unsafe URLs are dropped");
  // LUT fields are kept only with the LUT on; an all-empty per-currency set is dropped.
  const lutOff = M.updateIntlSettings(details, { lutArn: "AD2704260012345", lutFy: "2026-27" }, X + 13).intl.settings;
  assert.equal(lutOff.lutArn, "");
  const lut = M.updateIntlSettings(details, { exportUnderLut: true, lutArn: "ad27 0426 0012345", lutFy: "2026-27" }, X + 14).intl.settings;
  assert.equal(lut.lutArn, "AD2704260012345");
  assert.equal(lut.lutFy, "2026-27");
  const empty = { accountName: "", bankName: "", swift: "", account: "", bankDetails: "", payUrl: "" };
  const withUsd = M.updateIntlSettings(details, { byCurrency: { USD: { ...empty, accountName: "Wise USD", account: "8310123456", bankDetails: "ACH 026073150" }, EUR: empty } }, X + 15);
  assert.deepEqual(Object.keys(withUsd.intl.settings.byCurrency), ["USD"]);
  assert.equal(M.payDetailsFor(withUsd.intl.settings, "USD").accountName, "Wise USD");
  assert.equal(M.payDetailsFor(withUsd.intl.settings, "EUR").accountName, "Sharma Tuition LLP");
  const cleared = M.updateIntlSettings(withUsd, { byCurrency: { USD: empty } }, X + 16);
  assert.ok(!("byCurrency" in cleared.intl.settings), "clearing all six fields removes the override");
  // What is kept in memory equals what the next load reads.
  assert.equal(M.canonicalJson(M.sanitizeWorkspace(JSON.parse(JSON.stringify(withUsd)))), M.canonicalJson(withUsd));
  // The settings record merges last-writer-wins as a whole.
  assert.equal(M.mergeWorkspaces(details, withUsd).intl.settings.updatedAt, X + 15);
  assert.equal(M.mergeWorkspaces(withUsd, details).intl.settings.updatedAt, X + 15);

  // An all-empty save on a book with no settings writes nothing (no intl key, INR bytes); an existing record is written.
  const blank = { on: false, ...empty, byCurrency: {}, exportUnderLut: false, lutArn: "", lutFy: "" };
  assert.equal(M.updateIntlSettings(inr, blank, X + 17), inr);
  assert.equal(M.canonicalJson(M.sanitizeWorkspace(M.updateIntlSettings(inr, blank, X + 17))), bytes);
  const off = M.updateIntlSettings(on, blank, X + 17);
  assert.equal(off.intl.settings.on, false);
  assert.equal(off.intl.settings.updatedAt, X + 17, "turning everything off is a write that beats the older record");
  assert.equal(M.mergeWorkspaces(on, off).intl.settings.on, false);

  // A save from a stale form (§5.2): only what the user changed is applied, onto the settings as they are now.
  const formOf = (st) => ({
    on: st?.on ?? false, accountName: st?.accountName ?? "", bankName: st?.bankName ?? "", swift: st?.swift ?? "", account: st?.account ?? "",
    bankDetails: st?.bankDetails ?? "", payUrl: st?.payUrl ?? "", byCurrency: { ...st?.byCurrency }, exportUnderLut: st?.exportUnderLut ?? false,
    lutArn: st?.lutArn ?? "", lutFy: st?.lutFy ?? "",
  });
  const biz = M.updateBusiness(details, { gstin: "27AAPFU0939F1ZV" }, X + 18);
  const mounted = formOf(biz.intl.settings); // device A fills its form now
  // Device B adds a USD set and the LUT later; sync merges that into A's book while A's form is open.
  const remote = M.updateIntlSettings(biz, {
    byCurrency: { USD: { ...empty, accountName: "Wise USD", account: "8310123456", bankDetails: "ACH 026073150" } },
    exportUnderLut: true, lutArn: "AD2704260012345", lutFy: "2026-27",
  }, X + 20);
  const merged = M.mergeWorkspaces(biz, remote);
  // A edits only the bank name and saves.
  const saved = M.editIntlSettings(merged, mounted, { ...mounted, bankName: "ICICI Bank" }, X + 21).intl.settings;
  assert.equal(saved.bankName, "ICICI Bank");
  assert.equal(saved.updatedAt, X + 21);
  assert.equal(saved.byCurrency?.USD?.accountName, "Wise USD", "the remote USD set survives");
  assert.deepEqual([saved.exportUnderLut, saved.lutArn, saved.lutFy], [true, "AD2704260012345", "2026-27"], "the remote LUT survives");
  assert.equal(saved.accountName, "Sharma Tuition LLP");
  // An unedited save writes nothing.
  assert.equal(M.editIntlSettings(merged, mounted, mounted, X + 21), merged);
  assert.equal(M.editIntlSettings(inr, formOf(undefined), formOf(undefined), X + 21), inr);
  // Touching one currency's set keeps the others as they are now; clearing a set removes only that set.
  const withEur = M.editIntlSettings(merged, mounted, { ...mounted, byCurrency: { EUR: { ...empty, accountName: "Wise EUR", account: "BE68539007547034" } } }, X + 22).intl.settings;
  assert.deepEqual(Object.keys(withEur.byCurrency).sort(), ["EUR", "USD"]);
  const fromRemote = formOf(remote.intl.settings);
  const noUsd = M.editIntlSettings(remote, fromRemote, { ...fromRemote, byCurrency: { USD: empty } }, X + 23).intl.settings;
  assert.ok(!noUsd.byCurrency, "an emptied set is removed");
  // The LUT moves as a group: turning it off clears the ARN and year together.
  const lutGone = M.editIntlSettings(remote, fromRemote, { ...fromRemote, exportUnderLut: false, lutArn: "", lutFy: "" }, X + 24).intl.settings;
  assert.deepEqual([lutGone.exportUnderLut, lutGone.lutArn, lutGone.lutFy, lutGone.byCurrency?.USD?.accountName], [false, "", "", "Wise USD"]);
  // Editing only the ARN saves the whole group from the form: never this form's ARN with another device's year.
  const otherLut = M.updateIntlSettings(remote, { lutArn: "AD2704250099999", lutFy: "2025-26" }, X + 25);
  const arnOnly = M.editIntlSettings(M.mergeWorkspaces(remote, otherLut), fromRemote, { ...fromRemote, lutArn: "AD2704260054321" }, X + 26).intl.settings;
  assert.deepEqual([arnOnly.exportUnderLut, arnOnly.lutArn, arnOnly.lutFy], [true, "AD2704260054321", "2026-27"], "the LUT group moves together");

  // A foreign plan started as an export (§6, Q3): the mark carries to later months; unticking a month stops it from then on.
  {
    const rid = M.recurringInvoiceId;
    let w = M.upsertClient(remote, { ...client, id: "cli_export01", name: "Export Co" }, X);
    w = M.upsertPlan(w, { id: "rec_export01", clientId: "cli_export01", amountPaise: 120000, description: "", dayOfMonth: 1, dueAfterDays: 15, startMonth: "2026-10", endMonth: "", paused: false, currency: "USD", createdAt: X, updatedAt: X }, X);
    const first = rid("rec_export01", "2026-10");
    w = M.upsertInvoice(w, { id: first, number: "EX-1", clientId: "cli_export01", issueDate: "2026-10-01", dueDate: "2026-10-16", amountPaise: 120000, description: "", payments: [], reminders: [], voided: false, recurringId: "rec_export01", currency: "USD", exportLut: true, createdAt: X, updatedAt: X }, X);
    assert.ok(M.getInvoice(w, first), "the plan month id matches recurringInvoiceId");
    const nov = M.generateRecurring(w, "2026-11-02", X + 30);
    const novInv = M.getInvoice(nov.ws, rid("rec_export01", "2026-11"));
    assert.equal(novInv.exportLut, true, "November keeps the export mark");
    assert.match(M.invoiceExportNote(nov.ws, novInv), /LUT ARN AD2704260012345/);
    const { exportLut: _x, ...unmarked } = novInv;
    const off2 = M.upsertInvoice(nov.ws, unmarked, X + 31);
    const dec = M.generateRecurring(off2, "2026-12-02", X + 32);
    assert.ok(!("exportLut" in M.getInvoice(dec.ws, rid("rec_export01", "2026-12"))), "unticked in November → December has no mark");
    // INR plans never get one.
    const inrPlan = M.upsertPlan(w, { id: "rec_inrplan1", clientId: "cli_export01", amountPaise: 500000, description: "", dayOfMonth: 1, dueAfterDays: 15, startMonth: "2026-11", endMonth: "", paused: false, createdAt: X, updatedAt: X }, X);
    const inrGen = M.generateRecurring(inrPlan, "2026-11-02", X + 33);
    assert.ok(!("exportLut" in M.getInvoice(inrGen.ws, rid("rec_inrplan1", "2026-11"))));
  }

  // The export mark never depends on which copy generated a month last (§6). A PR 3 copy (production before PR 4: open
  // tabs, offline PWAs) generates the same month id without the mark; repairIntl gives an unedited generated month the
  // mark it carries, on every device and the server, and leaves an edited month (an untick) alone.
  {
    const pr3 = await import("./fixtures/pr3-model.ts");
    const rid = M.recurringInvoiceId;
    const load = (Model, w) => Model.sanitizeWorkspace(JSON.parse(JSON.stringify(w)));
    const monthOf = (w, plan, month) => M.getInvoice(w, rid(plan, month));
    const usdPlan = (id, startMonth, extra = {}) => ({ id, clientId: "cli_export02", amountPaise: 120000, description: "", dayOfMonth: 1, dueAfterDays: 15, startMonth, endMonth: "", paused: false, currency: "USD", createdAt: X, updatedAt: X, ...extra });
    const sheetMonth = (plan, month, exportLut, at = X) => ({ id: rid(plan, month), number: `EX-${plan}-${month}`, clientId: "cli_export02", issueDate: `${month}-01`, dueDate: `${month}-16`, amountPaise: 120000, description: "", payments: [], reminders: [], voided: false, recurringId: plan, currency: "USD", ...(exportLut ? { exportLut: true } : {}), createdAt: at, updatedAt: at });
    let w = M.upsertClient(remote, { ...client, id: "cli_export02", name: "Export Two" }, X);
    w = M.upsertPlan(w, usdPlan("rec_export02", "2026-10"), X);
    w = M.upsertInvoice(w, sheetMonth("rec_export02", "2026-10", true), X);
    const laptop = M.generateRecurring(w, "2026-11-02", X + 40).ws; // PR 4 at 09:00
    const phone = pr3.generateRecurring(load(pr3, w), "2026-11-02", X + 41).ws; // PR 3 an hour later
    assert.equal(monthOf(load(M, phone), "rec_export02", "2026-11").exportLut, undefined, "the PR 3 copy generates November without the mark");
    const ab = M.repairIntl(M.mergeWorkspaces(laptop, load(M, phone)), X + 42);
    const ba = M.repairIntl(M.mergeWorkspaces(load(M, phone), laptop), X + 42);
    assert.equal(monthOf(ab, "rec_export02", "2026-11").exportLut, true, "the merged November keeps the mark");
    assert.equal(monthOf(ab, "rec_export02", "2026-11").updatedAt, X + 42, "the repair writes at updatedAt + 1, so every build's merge keeps it");
    // A PR 3 copy (open tab, or the server after a rollback) merges the repaired month back and keeps the mark, in both
    // orders: before the + 1 the two tied on updatedAt, the unmarked copy won the tie-break, and sync re-sent forever.
    for (const merged3 of [pr3.mergeWorkspaces(load(pr3, ab), load(pr3, phone)), pr3.mergeWorkspaces(load(pr3, phone), load(pr3, ab))]) {
      assert.equal(monthOf(merged3, "rec_export02", "2026-11").exportLut, true, "a PR 3 merge keeps the repaired mark");
      assert.equal(M.canonicalJson(M.repairIntl(M.mergeWorkspaces(ab, load(M, merged3)), X + 43)), M.canonicalJson(ab), "and PR 4 takes it back unchanged");
    }
    assert.equal(M.canonicalJson(ab), M.canonicalJson(ba), "both merge orders repair to the same bytes");
    assert.equal(M.repairIntl(ab, X + 99), ab, "a repaired book needs no second repair");
    assert.match(M.invoiceExportNote(ab, monthOf(ab, "rec_export02", "2026-11")), /LUT ARN AD2704260012345/);
    // A chain of PR 3 months is repaired in order: December carries November's restored mark.
    const phoneDec = pr3.generateRecurring(load(pr3, phone), "2026-12-02", X + 50).ws;
    const chain = M.repairIntl(M.mergeWorkspaces(laptop, load(M, phoneDec)), X + 51);
    assert.deepEqual(["2026-11", "2026-12"].map((m) => monthOf(chain, "rec_export02", m).exportLut), [true, true]);
    // The server copy repairs to the same thing a PR 3 push leaves it with.
    assert.equal(M.canonicalJson(M.repairIntl(M.mergeWorkspaces(chain, load(M, phoneDec)), X + 52)), M.canonicalJson(chain));
    // An untick is an edit: kept, and later unedited months follow it.
    const { exportLut: _x, ...plainNov } = monthOf(ab, "rec_export02", "2026-11");
    const unticked = M.upsertInvoice(ab, plainNov, X + 60);
    assert.equal(M.repairIntl(unticked, X + 61), unticked, "an unticked month stays unticked");
    const decAfter = M.repairIntl(M.mergeWorkspaces(M.generateRecurring(unticked, "2026-12-02", X + 62).ws, load(M, pr3.generateRecurring(load(pr3, unticked), "2026-12-02", X + 63).ws)), X + 64);
    assert.ok(!monthOf(decAfter, "rec_export02", "2026-12").exportLut, "December follows the unticked November");
    // A month with a reminder or payment is never touched (the client may have it already).
    const reminded = M.upsertInvoice(load(M, phone), { ...monthOf(load(M, phone), "rec_export02", "2026-11"), reminders: [{ at: X + 41, channel: "copy" }], updatedAt: X + 41 }, X + 41);
    const remindedNov = monthOf(reminded, "rec_export02", "2026-11");
    assert.equal(remindedNov.createdAt, remindedNov.updatedAt);
    assert.ok(!monthOf(M.repairIntl(reminded, X + 65), "rec_export02", "2026-11").exportLut, "a reminded month keeps what was sent");

    // A deleted month is skipped: December carries October's mark past a deleted November.
    const novGone = M.deleteInvoice(M.upsertInvoice(laptop, plainNov, X + 70), rid("rec_export02", "2026-11"), X + 71);
    assert.equal(monthOf(M.generateRecurring(novGone, "2026-12-02", X + 72).ws, "rec_export02", "2026-12").exportLut, true);

    // Across a currency change (US$ → €): the new plan's first month carries the old plan's last mark.
    const toEur = M.replacePlanCurrency(laptop, "rec_export02", "EUR", X + 80, 110_000);
    const eurDec = M.generateRecurring(toEur.ws, "2026-12-02", X + 81).ws;
    assert.equal(monthOf(eurDec, toEur.id, "2026-12").exportLut, true, "the first € month keeps the export mark");
    assert.equal(monthOf(M.generateRecurring(eurDec, "2027-01-02", X + 82).ws, toEur.id, "2027-01").exportLut, true);
    const eurPhone = pr3.generateRecurring(load(pr3, toEur.ws), "2026-12-02", X + 83).ws;
    assert.equal(monthOf(M.repairIntl(M.mergeWorkspaces(eurDec, load(M, eurPhone)), X + 84), toEur.id, "2026-12").exportLut, true, "…also when a PR 3 copy generated it later");
    // From an unmarked old plan, or from INR, the first month is unmarked (the user ticks it).
    let inrBook = M.upsertPlan(laptop, { ...usdPlan("rec_inrexp01", "2026-10"), currency: undefined, amountPaise: 9_000_000 }, X);
    inrBook = M.generateRecurring(inrBook, "2026-10-02", X + 85).ws;
    const fromInr = M.replacePlanCurrency(inrBook, "rec_inrexp01", "USD", X + 85, 100_000);
    assert.ok(!monthOf(M.generateRecurring(fromInr.ws, "2026-11-02", X + 86).ws, fromInr.id, "2026-11").exportLut, "₹ → US$: the first month is unmarked");
    const unmarkedOld = M.replacePlanCurrency(unticked, "rec_export02", "EUR", X + 86, 110_000);
    assert.ok(!monthOf(M.generateRecurring(unmarkedOld.ws, "2026-12-02", X + 87).ws, unmarkedOld.id, "2026-12").exportLut);
    // A plan's first month made by the invoice sheet with the box unticked is the user's choice, never repaired.
    const ended = M.upsertPlan(laptop, { ...M.getPlan(laptop, "rec_export02"), endMonth: "2026-11" }, X + 90);
    let fresh = M.upsertPlan(ended, usdPlan("rec_export03", "2026-12", { createdAt: X + 91, updatedAt: X + 91 }), X + 91);
    fresh = M.upsertInvoice(fresh, sheetMonth("rec_export03", "2026-12", false, X + 91), X + 91);
    assert.equal(M.repairIntl(fresh, X + 92), fresh, "a sheet-made first month keeps its unticked box");

    // A month already issued never changes its mark later: this build writes generated months settled
    // (updatedAt = createdAt + 1), and a PR 3 month is settled once, at the first repair. Deleting or re-ticking an
    // earlier month then leaves later months as they are (the untick "stops it from then on" holds).
    {
      const novPr4 = monthOf(laptop, "rec_export02", "2026-11");
      assert.equal(novPr4.updatedAt, novPr4.createdAt + 1, "a generated foreign month is written settled");
      const off = M.upsertInvoice(laptop, (({ exportLut: _m, ...rest }) => rest)(novPr4), X + 100);
      const later = M.generateRecurring(off, "2027-01-02", X + 101).ws;
      assert.deepEqual(["2026-12", "2027-01"].map((m) => Boolean(monthOf(later, "rec_export02", m).exportLut)), [false, false]);
      const novDeleted = M.deleteInvoice(later, rid("rec_export02", "2026-11"), X + 102);
      assert.equal(M.repairIntl(novDeleted, X + 103), novDeleted, "deleting the unticked month marks nothing later");
      const reTicked = M.upsertInvoice(later, { ...monthOf(later, "rec_export02", "2026-11"), exportLut: true }, X + 104);
      assert.equal(M.repairIntl(reTicked, X + 105), reTicked, "re-ticking it marks nothing already issued");
      // A PR 3 month after the untick is settled unmarked once, then stays so.
      const pr3Dec = load(M, pr3.generateRecurring(load(pr3, off), "2026-12-02", X + 106).ws);
      const settled = M.repairIntl(pr3Dec, X + 107);
      assert.deepEqual([Boolean(monthOf(settled, "rec_export02", "2026-12").exportLut), monthOf(settled, "rec_export02", "2026-12").updatedAt], [false, X + 107], "settled unmarked at updatedAt + 1");
      const gone = M.deleteInvoice(settled, rid("rec_export02", "2026-11"), X + 108);
      assert.equal(M.repairIntl(gone, X + 109), gone, "a settled month is never re-derived");
    }

    // Candidates are settled in month order whatever the key order: one pass, same bytes on every device.
    {
      const base = load(M, phoneDec);
      const keys = Object.keys(base.intl.invoices).sort().reverse();
      const reversed = { ...base, intl: { ...base.intl, invoices: Object.fromEntries(keys.map((k) => [k, base.intl.invoices[k]])) } };
      const once = M.repairIntl(reversed, X + 110);
      assert.deepEqual(["2026-11", "2026-12"].map((m) => monthOf(once, "rec_export02", m).exportLut), [true, true], "December reads November's settled mark");
      assert.equal(M.canonicalJson(once), M.canonicalJson(M.repairIntl(base, X + 110)));
      assert.equal(M.repairIntl(once, X + 111), once, "one pass is the fixed point");
    }

    // The carry across a currency change follows the replaced plan only, never another client's plan.
    {
      let two = M.upsertClient(laptop, { ...client, id: "cli_export04", name: "Other abroad" }, X);
      two = M.upsertPlan(two, usdPlan("rec_export04", "2026-10", { clientId: "cli_export04" }), X);
      two = M.upsertInvoice(two, { ...sheetMonth("rec_export04", "2026-10", false), clientId: "cli_export04" }, X);
      const moved = M.replacePlanCurrency(two, "rec_export04", "EUR", X + 112, 100_000);
      assert.ok(!monthOf(M.generateRecurring(moved.ws, "2026-11-02", X + 113).ws, moved.id, "2026-11").exportLut, "another client's marked plan never lends its mark");
      // US$ (marked) → ₹ (a month billed) → US$: the ₹ month is the latest, and an INR month is unmarked.
      const toInr = M.replacePlanCurrency(laptop, "rec_export02", "INR", X + 114, 9_000_000);
      const inrDec = M.generateRecurring(toInr.ws, "2026-12-02", X + 115).ws;
      const toUsd = M.replacePlanCurrency(inrDec, toInr.id, "USD", X + 116, 120_000);
      assert.ok(!monthOf(M.generateRecurring(toUsd.ws, "2027-01-02", X + 117).ws, toUsd.id, "2027-01").exportLut, "US$ → ₹ → US$: unmarked");
      // Same day (the ₹ plan had no month and was deleted): the chain reaches back to the marked US$ month.
      const sameDay = M.replacePlanCurrency(toInr.ws, toInr.id, "USD", X + 118, 120_000);
      assert.equal(monthOf(M.generateRecurring(sameDay.ws, "2026-12-02", X + 119).ws, sameDay.id, "2026-12").exportLut, true, "US$ → ₹ → US$ the same day keeps the mark");
      // A deleted month of the replaced plan is never the source: the latest live one is.
      let src = M.upsertInvoice(laptop, (({ exportLut: _m, ...rest }) => rest)(monthOf(laptop, "rec_export02", "2026-10")), X + 120);
      src = M.deleteInvoice(src, rid("rec_export02", "2026-11"), X + 121);
      const fromDeleted = M.replacePlanCurrency(src, "rec_export02", "EUR", X + 122, 110_000);
      assert.equal(M.getPlan(fromDeleted.ws, fromDeleted.id).startMonth, "2026-12");
      assert.ok(!monthOf(M.generateRecurring(fromDeleted.ws, "2026-12-02", X + 123).ws, fromDeleted.id, "2026-12").exportLut, "the marked, deleted November is skipped");
    }
  }

  // A currency change on device A while device B (pre-intl code) is offline: both bill November (risk 22). The two
  // can't converge (new plan id), so the old plan's month past its endMonth is flagged for the user to delete.
  {
    const legacy = await import("./fixtures/legacy-model.ts");
    const load = (Model, book) => Model.sanitizeWorkspace(JSON.parse(JSON.stringify(book)));
    let w = M.upsertClient(M.updateBusiness(M.emptyWorkspace(), { name: "Shop", upiId: "s@okaxis" }, X), { ...client, id: "cli_plan0001" }, X);
    w = M.upsertPlan(w, { id: "rec_plan0001", clientId: "cli_plan0001", amountPaise: 5_000_000, description: "", dayOfMonth: 5, dueAfterDays: 15, startMonth: "2026-08", endMonth: "", paused: false, createdAt: X, updatedAt: X }, X);
    w = M.generateRecurring(w, "2026-10-25", X).ws;
    assert.equal(M.monthsBilledTwice(w).size, 0);
    const a = M.replacePlanCurrency(w, "rec_plan0001", "USD", X + 40, 60_000).ws;
    const b = legacy.sanitizeWorkspace(JSON.parse(JSON.stringify(w)));
    const aNov = M.generateRecurring(a, "2026-11-06", X + 41).ws;
    const bNov = legacy.generateRecurring(b, "2026-11-06", X + 41).ws;
    const merged = M.mergeWorkspaces(aNov, bNov);
    const nov = M.allLiveInvoices(merged).filter((i) => i.issueDate.startsWith("2026-11"));
    assert.deepEqual(nov.map((i) => M.currencyOf(i)).sort(), ["INR", "USD"], "November exists twice");
    const oldNov = M.recurringInvoiceId("rec_plan0001", "2026-11");
    assert.deepEqual([...M.monthsBilledTwice(merged)], [oldNov], "only the old plan's month past its end is flagged");
    assert.equal(M.monthsBilledTwice(M.deleteInvoice(merged, oldNov, X + 42)).size, 0, "deleting it clears the note");
    // An INR-only book never flags anything (no intl), even with a month past a stopped plan's end.
    const stopped = M.upsertPlan(w, { ...M.getPlan(w, "rec_plan0001"), endMonth: "2026-09" }, X + 43);
    assert.equal(M.monthsBilledTwice(stopped).size, 0);
    // Each filter: a paid month, another client's plan, a same-currency plan, a plan that starts later or ended earlier.
    const paidNov = M.addPayment(merged, oldNov, { amountPaise: 5_000_000, date: "2026-11-06", mode: "upi", reference: "" }, X + 44);
    // A paid month is never flagged; the unpaid month billed next to it is (review round 4: the client paid the ₹
    // month, so the US$ one is the one to delete, not chase).
    assert.deepEqual([...M.monthsBilledTwice(paidNov)], [M.recurringInvoiceId(M.allLiveRecurring(merged).find((p) => M.currencyOf(p) === "USD").id, "2026-11")], "a paid month is never flagged");
    assert.equal(M.monthsBilledTwice(M.addPayment(paidNov, [...M.monthsBilledTwice(paidNov)][0], { amountPaise: 60_000, date: "2026-11-07", mode: "bank", reference: "" }, X + 44)).size, 0, "both paid: nothing to delete");
    const newPlan = M.getPlan(merged, M.allLiveRecurring(merged).find((p) => M.currencyOf(p) === "USD").id);
    const swap = (patch) => M.upsertPlan(merged, { ...newPlan, ...patch }, X + 45);
    const otherClient = M.upsertClient(merged, { ...client, id: "cli_plan0002", name: "Other" }, X);
    assert.equal(M.monthsBilledTwice(M.upsertPlan(otherClient, { ...newPlan, clientId: "cli_plan0002" }, X + 45)).size, 0, "another client's plan never flags it");
    // A replacement whose range doesn't reach the month and that has no month for it never flags it. With a live
    // month there anyway (review round 4), the month is billed twice: both are outside their plans, both shown.
    const noMonth = (book) => M.deleteInvoice(book, M.recurringInvoiceId(newPlan.id, "2026-11"), X + 45);
    assert.equal(M.monthsBilledTwice(noMonth(swap({ startMonth: "2026-12" }))).size, 0, "a plan that starts after the month");
    assert.equal(M.monthsBilledTwice(noMonth(swap({ endMonth: "2026-10" }))).size, 0, "a plan that ended before the month");
    assert.deepEqual([...M.monthsBilledTwice(swap({ startMonth: "2026-12" }))].sort(), [oldNov, M.recurringInvoiceId(newPlan.id, "2026-11")].sort());
    // Only a replacement flags it: another plan of the same client that no currency change created never does, in
    // any currency. (The US$ replacement and its month gone; a second ₹ plan and an unrelated US$ plan from August on.)
    assert.equal(newPlan.id, M.replacementPlanId("rec_plan0001", "USD"), "a currency change derives the new plan's id");
    let unrelated = M.deleteInvoice(M.upsertPlan(merged, { ...newPlan, deletedAt: X + 46 }, X + 46), M.recurringInvoiceId(newPlan.id, "2026-11"), X + 46);
    unrelated = M.upsertPlan(unrelated, { ...M.getPlan(merged, "rec_plan0001"), id: "rec_plan0003", endMonth: "", createdAt: X + 46 }, X + 46);
    unrelated = M.upsertPlan(unrelated, { ...newPlan, id: "rec_plan0004", startMonth: "2026-08", deletedAt: undefined }, X + 47);
    assert.equal(M.monthsBilledTwice(unrelated).size, 0, "plans that replaced nothing never flag it");
    const restoredPlan = M.upsertPlan(unrelated, { ...newPlan, deletedAt: undefined }, X + 48);
    assert.equal(M.monthsBilledTwice(M.upsertInvoice(restoredPlan, M.withoutTombstone(M.getInvoice(restoredPlan, M.recurringInvoiceId(newPlan.id, "2026-11"))), X + 48)).size, 1, "(control: the replacement flags it)");
    // Deleting the replacement's month instead (either of the two, as the note says) clears it too: a month the user
    // deleted is not billed, although the plan's range covers it.
    assert.equal(M.monthsBilledTwice(M.deleteInvoice(merged, M.recurringInvoiceId(newPlan.id, "2026-11"), X + 49)).size, 0, "deleting the other one clears the note");

    // The month is the one the id was generated for: a last month re-dated into the next month is not flagged.
    {
      let r = M.generateRecurring(w, "2026-10-25", X).ws;
      const oct = M.recurringInvoiceId("rec_plan0001", "2026-10");
      r = M.upsertInvoice(r, { ...M.getInvoice(r, oct), issueDate: "2026-11-01", dueDate: "2026-11-16" }, X + 47);
      const changed = M.replacePlanCurrency(r, "rec_plan0001", "USD", X + 48, 60_000);
      assert.equal(M.getPlan(changed.ws, "rec_plan0001").endMonth, "2026-10");
      const usdNov = M.generateRecurring(changed.ws, "2026-11-28", X + 49).ws;
      assert.equal(M.monthsBilledTwice(usdNov).size, 0, "October's only invoice, re-dated, is never flagged");
    }

    // A plan a currency change deleted (it had no month yet) covers no month: ₹ → US$, then US$ → € before November.
    // A copy that saw only the first change bills November in US$; the € plan bills it too: the US$ month is flagged.
    {
      const usd = M.replacePlanCurrency(w, "rec_plan0001", "USD", X + 50, 60_000);
      const stale = load(M, usd.ws);
      const eur = M.replacePlanCurrency(usd.ws, usd.id, "EUR", X + 51, 55_000);
      assert.ok(M.getPlan(eur.ws, usd.id).deletedAt && !M.getPlan(eur.ws, usd.id).endMonth, "the US$ plan is deleted, not ended");
      const twice = M.repairIntl(M.mergeWorkspaces(M.generateRecurring(eur.ws, "2026-11-06", X + 52).ws, M.generateRecurring(stale, "2026-11-06", X + 53).ws), X + 54);
      const novs = M.allLiveInvoices(twice).filter((i) => i.issueDate.startsWith("2026-11")).map((i) => M.currencyOf(i)).sort();
      assert.deepEqual(novs, ["EUR", "USD"]);
      assert.deepEqual([...M.monthsBilledTwice(twice)], [M.recurringInvoiceId(usd.id, "2026-11")], "the deleted plan's month is flagged");
      // The same from a PR 3 copy.
      const pr3 = await import("./fixtures/pr3-model.ts");
      const fromPr3 = M.mergeWorkspaces(M.generateRecurring(eur.ws, "2026-11-06", X + 52).ws, load(M, pr3.generateRecurring(load(pr3, usd.ws), "2026-11-06", X + 53).ws));
      assert.deepEqual([...M.monthsBilledTwice(M.repairIntl(fromPr3, X + 54))], [M.recurringInvoiceId(usd.id, "2026-11")]);
    }

    // A change undone or chained (₹ → US$ → ₹, US$ → € → US$): the plan that bills the month now may be in the old
    // plan's own currency. "Replaced" follows the chain of currency changes, not the currency.
    {
      const rid = M.recurringInvoiceId;
      const months = (book, month) => M.allLiveInvoices(book).filter((i) => i.recurringId && i.id.endsWith(month.replace("-", ""))).map((i) => i.id).sort();
      // Same day: the US$ plan has no month yet, so it is deleted and the ₹ plan starts in November.
      const usd = M.replacePlanCurrency(w, "rec_plan0001", "USD", X + 60, 60_000);
      const back = M.replacePlanCurrency(usd.ws, usd.id, "INR", X + 61, 5_000_000);
      assert.equal(back.id, M.replacementPlanId(usd.id, "INR"));
      assert.deepEqual([M.getPlan(back.ws, "rec_plan0001").endMonth, Boolean(M.getPlan(back.ws, usd.id).deletedAt), M.getPlan(back.ws, back.id).startMonth], ["2026-10", true, "2026-11"]);
      const stale = legacy.generateRecurring(legacy.sanitizeWorkspace(JSON.parse(JSON.stringify(w))), "2026-12-06", X + 62).ws;
      const both = M.repairIntl(M.mergeWorkspaces(M.generateRecurring(back.ws, "2026-12-06", X + 63).ws, load(M, stale)), X + 64);
      assert.deepEqual(months(both, "2026-11"), [rid(back.id, "2026-11"), rid("rec_plan0001", "2026-11")].sort(), "November billed by both ₹ plans");
      assert.deepEqual([...M.monthsBilledTwice(both)].sort(), [rid("rec_plan0001", "2026-11"), rid("rec_plan0001", "2026-12")], "₹ → US$ → ₹: the stale ₹ months are flagged");
      // With a US$ month between: ₹ to October, US$ November, ₹ from December.
      const usdNov = M.generateRecurring(usd.ws, "2026-11-06", X + 65).ws;
      const back2 = M.replacePlanCurrency(usdNov, usd.id, "INR", X + 66, 5_000_000);
      assert.equal(M.getPlan(back2.ws, back2.id).startMonth, "2026-12");
      const both2 = M.repairIntl(M.mergeWorkspaces(M.generateRecurring(back2.ws, "2026-12-06", X + 67).ws, load(M, stale)), X + 68);
      assert.deepEqual([...M.monthsBilledTwice(both2)].sort(), [rid("rec_plan0001", "2026-11"), rid("rec_plan0001", "2026-12")], "…and with a month between, December too");
      // US$ → € → US$ against a PR 3 copy that saw none of it.
      const pr3 = await import("./fixtures/pr3-model.ts");
      let f = M.upsertPlan(w, { id: "rec_usdloop1", clientId: "cli_plan0001", amountPaise: 60_000, description: "", dayOfMonth: 5, dueAfterDays: 15, startMonth: "2026-09", endMonth: "", paused: false, currency: "USD", createdAt: X, updatedAt: X }, X);
      f = M.generateRecurring(f, "2026-10-25", X + 1).ws;
      const eur = M.replacePlanCurrency(f, "rec_usdloop1", "EUR", X + 70, 55_000);
      const usdAgain = M.replacePlanCurrency(eur.ws, eur.id, "USD", X + 71, 61_000);
      const pr3Copy = pr3.generateRecurring(load(pr3, f), "2026-11-06", X + 72).ws;
      const loop = M.repairIntl(M.mergeWorkspaces(M.generateRecurring(usdAgain.ws, "2026-11-06", X + 73).ws, load(M, pr3Copy)), X + 74);
      assert.ok([...M.monthsBilledTwice(loop)].includes(rid("rec_usdloop1", "2026-11")), "US$ → € → US$: the stale US$ month is flagged");
      assert.ok(![...M.monthsBilledTwice(loop)].includes(rid(usdAgain.id, "2026-11")), "the current plan's month never is");
      // Two devices making the same change offline make one plan, not two.
      const again = M.replacePlanCurrency(load(M, w), "rec_plan0001", "USD", X + 75, 61_000);
      assert.equal(again.id, usd.id);
      assert.equal(M.allLiveRecurring(M.mergeWorkspaces(usd.ws, again.ws)).filter((p) => M.currencyOf(p) === "USD").length, 1);
    }

    // A stale copy edits the old plan after the change (a pause, resume or description from an older tab): its whole
    // record wins last-writer-wins and brings back endMonth "". repairIntl ends it again from its replacement.
    {
      const rid = M.recurringInvoiceId;
      const changed = M.replacePlanCurrency(w, "rec_plan0001", "USD", X + 80, 60_000);
      const usdNov = M.generateRecurring(changed.ws, "2026-11-06", X + 81).ws;
      let stale = legacy.sanitizeWorkspace(JSON.parse(JSON.stringify(w)));
      stale = legacy.upsertPlan(stale, { ...stale.recurring.rec_plan0001, description: "Retainer (edited)" }, X + 90);
      stale = legacy.generateRecurring(stale, "2026-11-06", X + 91).ws;
      const merged = M.mergeWorkspaces(usdNov, load(M, stale));
      assert.equal(merged.recurring.rec_plan0001.endMonth, "", "(the stale edit brought the empty endMonth back)");
      assert.equal(M.planEnd(merged, merged.recurring.rec_plan0001), "2026-10", "the end is read from the replacement");
      assert.deepEqual([...M.monthsBilledTwice(merged)], [rid("rec_plan0001", "2026-11")], "flagged even before the repair");
      const repaired = M.repairIntl(merged, X + 92);
      assert.deepEqual([repaired.recurring.rec_plan0001.endMonth, repaired.recurring.rec_plan0001.updatedAt, repaired.recurring.rec_plan0001.description], ["2026-10", X + 91, "Retainer (edited)"], "ended again at updatedAt + 1, the edit kept");
      assert.equal(M.repairIntl(repaired, X + 93), repaired, "one pass is the fixed point");
      assert.deepEqual([...M.monthsBilledTwice(repaired)], [rid("rec_plan0001", "2026-11")]);
      const dec = M.generateRecurring(repaired, "2027-01-06", X + 94).ws;
      assert.ok(!M.getInvoice(dec, rid("rec_plan0001", "2026-12")) && M.getInvoice(dec, rid(changed.id, "2026-12")), "the old plan bills no more months");
      assert.ok(!M.getInvoice(M.generateRecurring(merged, "2026-12-06", X + 94).ws, rid("rec_plan0001", "2026-12")), "…even before the repair");
      // The legacy copy merges the repaired plan back and stops billing too.
      const legacyAfter = legacy.mergeWorkspaces(stale, legacy.sanitizeWorkspace(JSON.parse(JSON.stringify(repaired))));
      assert.equal(legacyAfter.recurring.rec_plan0001.endMonth, "2026-10");
      assert.ok(!legacy.generateRecurring(legacyAfter, "2026-12-06", X + 95).ws.invoices[rid("rec_plan0001", "2026-12")]);
      // A plan replaced as a whole (no month yet) and undeleted by a stale edit is deleted again.
      let fresh = M.upsertPlan(w, { ...M.getPlan(w, "rec_plan0001"), id: "rec_plan0009", startMonth: "2026-12", createdAt: X, updatedAt: X }, X);
      const whole = M.replacePlanCurrency(fresh, "rec_plan0009", "USD", X + 96, 60_000);
      assert.ok(M.getPlan(whole.ws, "rec_plan0009").deletedAt);
      const undeleted = M.mergeWorkspaces(whole.ws, M.upsertPlan(fresh, { ...M.getPlan(fresh, "rec_plan0009"), paused: true }, X + 97));
      assert.ok(!M.getPlan(undeleted, "rec_plan0009").deletedAt, "(the stale pause undeleted it)");
      const redeleted = M.repairIntl(undeleted, X + 98).recurring.rec_plan0009;
      assert.deepEqual([redeleted.deletedAt, redeleted.updatedAt], [X + 98, X + 98], "deleted again at updatedAt + 1");
      assert.equal(M.planCanChangeCurrency(undeleted, M.getPlan(undeleted, "rec_plan0009")), false);
    }

    // Review round 4: the same change made on two devices from different months. Both write one plan
    // (replacementPlanId) and the later write's startMonth wins, so a month the first device billed under the new plan
    // falls before its start, while the old plan (ended later by the second device) bills it too.
    {
      const rid = M.recurringInvoiceId;
      const one = M.replacePlanCurrency(w, "rec_plan0001", "USD", X + 100, 60_000);
      const d1 = M.generateRecurring(one.ws, "2026-11-06", X + 101).ws;
      const two = M.replacePlanCurrency(M.generateRecurring(w, "2026-11-06", X + 102).ws, "rec_plan0001", "USD", X + 103, 60_000);
      assert.equal(two.id, one.id, "(the same change gives the same plan)");
      for (const merged of [M.mergeWorkspaces(d1, two.ws), M.mergeWorkspaces(two.ws, d1)]) {
        const book = M.repairIntl(merged, X + 104);
        assert.deepEqual([M.getPlan(book, one.id).startMonth, M.planEnd(book, M.getPlan(book, "rec_plan0001"))], ["2026-12", "2026-11"], "(the later change's start wins)");
        const nov = M.allLiveInvoices(book).filter((i) => i.issueDate.startsWith("2026-11")).map((i) => [i.id, M.currencyOf(i)]).sort();
        assert.deepEqual(nov, [[rid(one.id, "2026-11"), "USD"], [rid("rec_plan0001", "2026-11"), "INR"]].sort(), "November is billed in ₹ and US$");
        assert.deepEqual([...M.monthsBilledTwice(book)], [rid(one.id, "2026-11")], "the month before its own plan's start is flagged");
        const dec = M.repairIntl(M.generateRecurring(book, "2026-12-06", X + 105).ws, X + 105);
        assert.ok(M.getInvoice(dec, rid(one.id, "2026-12")) && !M.getInvoice(dec, rid("rec_plan0001", "2026-12")), "December is billed once");
        assert.deepEqual([...M.monthsBilledTwice(dec)], [rid(one.id, "2026-11")], "November stays flagged");
        assert.equal(M.monthsBilledTwice(M.deleteInvoice(dec, rid(one.id, "2026-11"), X + 106)).size, 0, "deleting it clears the note");
        // The stray month paid: the other, unpaid one is shown instead.
        const paid = M.addPayment(dec, rid(one.id, "2026-11"), { amountPaise: 60_000, date: "2026-11-10", mode: "bank", reference: "" }, X + 107);
        assert.deepEqual([...M.monthsBilledTwice(paid)], [rid("rec_plan0001", "2026-11")], "the stray month was paid: the ₹ month is flagged");
      }
    }

    // Two devices changing one plan to two currencies make two replacements that both bill every month: all their
    // months are flagged until one plan is deleted, then only that plan's months are.
    {
      const rid = M.recurringInvoiceId;
      const usd = M.replacePlanCurrency(w, "rec_plan0001", "USD", X + 110, 60_000);
      const eur = M.replacePlanCurrency(w, "rec_plan0001", "EUR", X + 111, 55_000);
      const book = M.repairIntl(M.generateRecurring(M.repairIntl(M.mergeWorkspaces(usd.ws, eur.ws), X + 112), "2026-12-06", X + 113).ws, X + 113);
      const all = [rid(usd.id, "2026-11"), rid(usd.id, "2026-12"), rid(eur.id, "2026-11"), rid(eur.id, "2026-12")].sort();
      assert.deepEqual([...M.monthsBilledTwice(book)].sort(), all, "siblings: every shared month is flagged");
      const dropped = M.upsertPlan(book, { ...M.getPlan(book, eur.id), deletedAt: X + 114 }, X + 114);
      assert.deepEqual([...M.monthsBilledTwice(dropped)].sort(), [rid(eur.id, "2026-11"), rid(eur.id, "2026-12")], "the deleted plan's months are the ones to delete");
      assert.equal(M.monthsBilledTwice(M.repairIntl(M.generateRecurring(w, "2026-12-06", X + 115).ws, X + 115)).size, 0, "no change, nothing flagged");
    }

    // planEnd takes the earlier of the plan's own endMonth and the month before its replacement starts: a plan made
    // with "Last month to bill" set, changed in October, comes back from a stale copy with its original endMonth.
    {
      const rid = M.recurringInvoiceId;
      const until = M.upsertPlan(w, { ...M.getPlan(w, "rec_plan0001"), endMonth: "2027-03" }, X + 120);
      const changed = M.replacePlanCurrency(until, "rec_plan0001", "USD", X + 121, 60_000);
      assert.equal(M.getPlan(changed.ws, "rec_plan0001").endMonth, "2026-10");
      const stale = M.upsertPlan(until, { ...M.getPlan(until, "rec_plan0001"), description: "Retainer (edited)" }, X + 122);
      const merged = M.mergeWorkspaces(changed.ws, stale);
      assert.equal(merged.recurring.rec_plan0001.endMonth, "2027-03", "(the stale edit brought the original end back)");
      assert.equal(M.planEnd(merged, merged.recurring.rec_plan0001), "2026-10");
      const repaired = M.repairIntl(merged, X + 123);
      assert.equal(repaired.recurring.rec_plan0001.endMonth, "2026-10", "ended again at the change");
      const nov = M.generateRecurring(repaired, "2026-11-06", X + 124).ws;
      assert.ok(!M.getInvoice(nov, rid("rec_plan0001", "2026-11")) && M.getInvoice(nov, rid(changed.id, "2026-11")), "November is billed only in US$");
    }

    // "Change currency" is offered only while a month is left to bill.
    const replaced = M.replacePlanCurrency(w, "rec_plan0001", "USD", X + 55, 60_000);
    assert.equal(M.planCanChangeCurrency(replaced.ws, M.getPlan(replaced.ws, "rec_plan0001")), false, "the old plan of a change has none");
    assert.equal(M.replacePlanCurrency(replaced.ws, "rec_plan0001", "EUR", X + 56, 1), null);
    assert.equal(M.planCanChangeCurrency(replaced.ws, M.getPlan(replaced.ws, replaced.id)), true);
    const stoppedNow = M.upsertPlan(w, { ...M.getPlan(w, "rec_plan0001"), endMonth: "2026-10" }, X + 57);
    assert.equal(M.planCanChangeCurrency(stoppedNow, M.getPlan(stoppedNow, "rec_plan0001")), false, "stopped after its last created month");
    assert.equal(M.planCanChangeCurrency(w, M.getPlan(w, "rec_plan0001")), true);
    // Review round 6: the boundary. Months to October; ending in November leaves one to bill, ending in October none.
    const untilNov = M.upsertPlan(w, { ...M.getPlan(w, "rec_plan0001"), endMonth: "2026-11" }, X + 58);
    assert.equal(M.planCanChangeCurrency(untilNov, M.getPlan(untilNov, "rec_plan0001")), true, "one month left");

    // Review round 6: a stray month is flagged as soon as it exists, while the plan that covers it hasn't billed it
    // yet (it will): device A changed the plan to US$ in October, and a pre-intl copy billed ₹ November first.
    {
      const a = M.replacePlanCurrency(w, "rec_plan0001", "USD", X + 60, 60_000).ws;
      const bNov = legacy.generateRecurring(legacy.sanitizeWorkspace(JSON.parse(JSON.stringify(w))), "2026-11-06", X + 61).ws;
      const early = M.repairIntl(M.mergeWorkspaces(a, bNov), X + 62);
      assert.equal(M.getInvoice(early, M.recurringInvoiceId(M.replacementPlanId("rec_plan0001", "USD"), "2026-11")), undefined, "(US$ November not billed yet)");
      assert.deepEqual([...M.monthsBilledTwice(early)], [M.recurringInvoiceId("rec_plan0001", "2026-11")], "flagged before its sibling exists");
    }

    // Review round 6: a month a family note asked to delete stays deleted after its tombstone would have aged out.
    {
      const rid = M.recurringInvoiceId;
      const at = (iso) => Date.parse(`${iso}T12:00:00Z`);
      const usdPlan = { id: "rec_usdfam01", clientId: "cli_plan0001", amountPaise: 120_000, description: "Retainer", dayOfMonth: 5, dueAfterDays: 15, startMonth: "2026-08", endMonth: "", paused: false, currency: "USD", createdAt: X, updatedAt: X };
      const u = M.generateRecurring(M.upsertPlan(w, usdPlan, X), "2026-10-10", at("2026-10-10")).ws;
      const later = (book, deleted, iso) => {
        const t = at(iso);
        return M.generateRecurring(M.pruneTombstones(M.repairIntl(book, t), t), iso, t).ws;
      };
      // ₹ side: device A changed the US$ plan to ₹ (R starts November); device B, stale, billed US$ November and the
      // client paid it. R's ₹ November (legacy map) is the month to delete.
      {
        const A = M.replacePlanCurrency(u, "rec_usdfam01", "INR", at("2026-10-11"), 10_000_000);
        let B = M.generateRecurring(u, "2026-11-06", at("2026-11-06")).ws;
        B = M.addPayment(B, rid("rec_usdfam01", "2026-11"), { amountPaise: 120_000, date: "2026-11-08", mode: "bank", reference: "" }, at("2026-11-08"));
        let book = M.generateRecurring(M.repairIntl(M.mergeWorkspaces(A.ws, B), at("2026-11-09")), "2026-11-09", at("2026-11-09")).ws;
        assert.deepEqual([...M.monthsBilledTwice(book)], [rid(A.id, "2026-11")], "(the unpaid ₹ month is flagged)");
        book = M.deleteInvoice(book, rid(A.id, "2026-11"), at("2026-11-10"));
        for (const iso of ["2027-02-15", "2027-06-15", "2027-10-15"]) {
          const next = later(book, rid(A.id, "2026-11"), iso);
          assert.ok(M.getInvoice(next, rid(A.id, "2026-11"))?.deletedAt, `${iso}: ₹ November stays deleted`);
          assert.equal(M.monthsBilledTwice(next).size, 0, `${iso}: nothing flagged again`);
        }
      }
      // Foreign side, ended plan: device B changed the plan to ₹ in October, billed ₹ November and the client paid it;
      // device A billed US$ November and then made the same change, later, so the old plan ends in November. US$
      // November is in the ended plan's own range; once today is more than a year past it, it must still not return.
      {
        let B = M.replacePlanCurrency(u, "rec_usdfam01", "INR", at("2026-10-11"), 10_000_000).ws;
        B = M.generateRecurring(B, "2026-11-06", at("2026-11-06")).ws;
        const R = M.replacementPlanId("rec_usdfam01", "INR");
        B = M.addPayment(B, rid(R, "2026-11"), { amountPaise: 10_000_000, date: "2026-11-08", mode: "upi", reference: "" }, at("2026-11-08"));
        const A = M.replacePlanCurrency(M.generateRecurring(u, "2026-11-06", at("2026-11-06")).ws, "rec_usdfam01", "INR", at("2026-11-20"), 10_000_000).ws;
        let book = M.repairIntl(M.mergeWorkspaces(A, B), at("2026-11-21"));
        assert.equal(M.planEnd(book, M.getPlan(book, "rec_usdfam01")), "2026-11", "(the later change wins: the old plan ends in November)");
        assert.deepEqual([...M.monthsBilledTwice(book)], [rid("rec_usdfam01", "2026-11")], "(US$ November is flagged)");
        book = M.deleteInvoice(book, rid("rec_usdfam01", "2026-11"), at("2026-11-22"));
        for (const iso of ["2027-11-15", "2027-12-15", "2028-06-15"]) {
          const next = later(book, rid("rec_usdfam01", "2026-11"), iso);
          assert.ok(M.getInvoice(next, rid("rec_usdfam01", "2026-11"))?.deletedAt, `${iso}: US$ November stays deleted`);
          assert.equal(M.monthsBilledTwice(next).size, 0, `${iso}: nothing flagged again`);
        }
      }
      // An INR plan no currency change touched keeps the deployed 90-day rule in the legacy map, byte for byte.
      {
        const plain = M.deleteInvoice(u, rid("rec_plan0001", "2026-09"), at("2026-10-12"));
        const t = at("2027-01-20");
        assert.equal(M.pruneTombstones(plain, t).invoices[rid("rec_plan0001", "2026-09")], undefined, "pruned after 90 days");
        assert.equal(M.canonicalJson(M.withoutIntl(M.pruneTombstones(plain, t))), M.canonicalJson(legacy.pruneTombstones(M.withoutIntl(plain), t)));
      }
    }
  }

  // An edit saved after another tab deleted the record while the sheet was open brings it back with the edits (as
  // before ws.intl): the sheets spread the stored record through withoutTombstone, never the tombstone itself.
  {
    const T1 = X + 1000;
    let w = M.upsertClient(M.emptyWorkspace(), { ...client, id: "cli_tomb0001", name: "Ravi K" }, T1);
    w = M.upsertInvoice(w, { id: "inv_tomb0001", number: "INV-1", clientId: "cli_tomb0001", issueDate: "2026-10-01", dueDate: "2026-10-15", amountPaise: 150000, description: "", payments: [], reminders: [], voided: false, createdAt: T1, updatedAt: T1 }, T1);
    const deleted = M.deleteClient(M.deleteInvoice(w, "inv_tomb0001", T1 + 30), "cli_tomb0001", T1 + 31);
    assert.ok(M.getInvoice(deleted, "inv_tomb0001").deletedAt && deleted.clients.cli_tomb0001.deletedAt);
    const saved = M.upsertInvoice(deleted, { ...M.withoutTombstone(M.getInvoice(deleted, "inv_tomb0001")), amountPaise: 175000 }, T1 + 40);
    const savedClient = M.upsertClient(saved, { ...M.withoutTombstone(saved.clients.cli_tomb0001), name: "Ravi Kumar", updatedAt: T1 + 41 }, T1 + 41);
    for (const merged of [M.mergeWorkspaces(savedClient, deleted), M.mergeWorkspaces(deleted, savedClient)]) {
      assert.deepEqual(M.liveInvoices(merged).map((i) => [i.number, i.amountPaise]), [["INV-1", 175000]], "the edited invoice is live on both devices");
      assert.deepEqual(M.liveClients(merged).map((c) => c.name), ["Ravi Kumar"]);
    }
    const live = M.getInvoice(w, "inv_tomb0001");
    assert.equal(M.withoutTombstone(live), live, "a live record is returned as is");
  }

  // Review round 6: move detection stays cheap for an INR-heavy book that turned on clients abroad. repairIntl and
  // invoicesMovedTwice run on every load, merge, sync and edit; with 5,000 ₹ invoices they cost ~16x a merge of the same
  // book before the derived ids were cached (40 ms), ~2x after. Best of 7 against a merge timed alike, so a busy
  // machine slows both.
  {
    const invoices = {};
    for (let i = 0; i < 5000; i++) {
      const id = `inv_perf${String(i).padStart(8, "0")}`;
      invoices[id] = { id, number: `INV-${i}`, clientId: "cli_perf0001", issueDate: "2026-09-01", dueDate: "2026-09-15", amountPaise: 100000, description: "", payments: [], reminders: [], voided: false, createdAt: X, updatedAt: X };
    }
    const inr = { ...M.upsertClient(M.emptyWorkspace(), { ...client, id: "cli_perf0001" }, X), invoices };
    const book = { ...inr, intl: { settings: { ...M.emptyIntlSettings(X), on: true }, invoices: {}, recurring: {}, clients: {} } };
    const best = (fn) => {
      fn();
      let fastest = Infinity;
      for (let k = 0; k < 7; k++) {
        const t0 = performance.now();
        fn();
        fastest = Math.min(fastest, performance.now() - t0);
      }
      return fastest;
    };
    const merge = best(() => M.mergeWorkspaces(inr, inr));
    for (const [name, fn] of [["repairIntl", () => M.repairIntl(book, X)], ["invoicesMovedTwice", () => M.invoicesMovedTwice(book)]]) {
      const ms = best(fn);
      assert.ok(ms < 5 * merge + 1, `${name}: ${ms.toFixed(2)} ms for 5,000 invoices (a merge takes ${merge.toFixed(2)} ms)`);
    }
  }

  // WhatsApp and SMS dial the same number for a client abroad: the bracketed trunk prefix is dropped for both.
  assert.equal(M.internationalDigits("+44 (0)20 7946 0958"), "442079460958");
  assert.equal(M.internationalDigits("0044(0)2079460958"), "442079460958");
  assert.equal(M.internationalDigits("+1 415 555 0100"), "14155550100");
  assert.equal(M.internationalDigits("98765 43210"), "");
  for (const phone of ["+44 (0)20 7946 0958", "0044(0)2079460958", "+1 415 555 0100"]) {
    assert.equal(M.whatsappLink(phone, "x", { international: true }), `https://wa.me/${M.internationalDigits(phone)}?text=x`);
  }
}

console.log("[workspace] money, dates, aging, reminders, CSV, merge, sanitizer, receipt, and MSME checks passed");
