import assert from "node:assert/strict";
import {
  addBook, applyIncomingIndex, bookHash, bookRank, BOOK_ID_RE, canAddBook, capAdditions, capBookIndex, deleteBook, emptyIndex,
  fnv1a, isBookId, isTombstoned, linkFor, linkKey, liveBookIds, MAX_BOOK_ENTRIES, mergeBookIndex, newBookId, paidLinkTokens,
  parseBookIndex, parseLinkKey, pickBookForDocument, PRIMARY_BOOK_ID, routeLegacyBackup, sanitizeBookIndex,
} from "../src/lib/workspace/books.ts";
import { businessesFor, FREE_BUSINESSES, planFromSubscription, PLANS, PRO_BUSINESSES } from "../src/lib/workspace/entitlements.ts";
import { planFor, planForStrict } from "../src/lib/billing/plans.ts";
import { parseRecord } from "../src/lib/workspace/paylinks.ts";
import { digestProjection, parseProjection, PROJECTION_VERSION } from "../src/lib/workspace/digest.ts";
import { claimNotification } from "../src/lib/push/claimAlert.ts";
import { METRICS, METRIC_LABELS } from "../src/lib/metricsCore.ts";
import { addPayment, emptyWorkspace, updateBusiness, upsertClient, upsertInvoice } from "../src/lib/workspace/model.ts";

const NOW = Date.UTC(2026, 9, 18, 6, 0, 0);
const DAY = 86_400_000;
const A = "biz_aaaaaaaa";
const B = "biz_bbbbbbbb";
const C = "biz_cccccccc";

/* ---------- ids ---------- */
assert.equal(PRIMARY_BOOK_ID, "biz_primary");
assert.ok(isBookId(PRIMARY_BOOK_ID));
assert.ok(isBookId(newBookId()) && BOOK_ID_RE.test(newBookId()));
for (const bad of ["", "biz_", "biz_abc", "inv_aaaaaaaa", "biz_aaaa/aaaa", "biz_" + "a".repeat(41), null, 7]) assert.equal(isBookId(bad), false, String(bad));

/* ---------- index: empty, sanitize, parse ---------- */
assert.deepEqual(emptyIndex(), { v: 1, books: { biz_primary: { id: "biz_primary", createdAt: 0 } } });
assert.deepEqual(liveBookIds(emptyIndex()), ["biz_primary"]);
// The primary is always present, never tombstoned; junk entries dropped; keys sorted.
const dirty = sanitizeBookIndex({
  v: 1,
  owner: "f".repeat(32),
  books: {
    biz_primary: { id: "biz_primary", createdAt: 99, deletedAt: 5 },
    [B]: { id: B, createdAt: 20 },
    [A]: { id: A, createdAt: 10, deletedAt: 30, purgedAt: 40 },
    "not-an-id": { createdAt: 1 },
    [C]: { id: "biz_mismatch1", createdAt: 1 },
  },
  deleted: [C, C, A, "junk", PRIMARY_BOOK_ID],
});
assert.deepEqual(Object.keys(dirty.books), [A, B, PRIMARY_BOOK_ID]);
assert.deepEqual(dirty.books[PRIMARY_BOOK_ID], { id: PRIMARY_BOOK_ID, createdAt: 0 });
assert.deepEqual(dirty.books[A], { id: A, createdAt: 10, deletedAt: 30, purgedAt: 40 });
assert.equal(dirty.owner, "f".repeat(32));
assert.deepEqual(dirty.deleted, [C], "deleted: de-duplicated, ids still in books removed, primary never listed");
assert.equal(sanitizeBookIndex({ owner: "Not-An-Owner", books: {} }).owner, undefined);
assert.equal(parseBookIndex("not json"), null);
assert.equal(parseBookIndex({ v: 2, books: {} }), null, "unknown version is unreadable, not empty");
assert.equal(parseBookIndex({ v: 1 }), null);
assert.deepEqual(parseBookIndex(JSON.stringify({ v: 1, books: {} })), emptyIndex());

/* ---------- add-once, delete-final ---------- */
let idx = addBook(emptyIndex(), A, NOW);
idx = addBook(idx, B, NOW + 1);
assert.deepEqual(liveBookIds(idx), [PRIMARY_BOOK_ID, A, B], "rank: primary, then createdAt");
assert.equal(bookRank(idx, B), 2);
assert.equal(bookRank(idx, "biz_unknown1"), -1);
assert.equal(addBook(idx, A, NOW + 5), idx, "adding a known id is a no-op");
assert.equal(addBook(idx, PRIMARY_BOOK_ID, NOW), idx);
assert.equal(addBook(idx, "bad", NOW), idx);
idx = deleteBook(idx, A, NOW + 10);
assert.deepEqual(idx.books[A], { id: A, createdAt: NOW, deletedAt: NOW + 10 });
assert.ok(isTombstoned(idx, A));
assert.deepEqual(liveBookIds(idx), [PRIMARY_BOOK_ID, B]);
assert.equal(deleteBook(idx, A, NOW + 99), idx, "a tombstone is final (no re-stamp)");
assert.equal(addBook(idx, A, NOW + 99), idx, "a deleted id is never revived");
assert.equal(deleteBook(idx, PRIMARY_BOOK_ID, NOW), idx, "the first business can't be deleted");
assert.equal(addBook({ ...emptyIndex(), deleted: [C] }, C, NOW).books[C], undefined, "evicted ids stay dead");
assert.ok(isTombstoned({ ...emptyIndex(), deleted: [C] }, C));
assert.equal(canAddBook(emptyIndex(), 1), false);
assert.equal(canAddBook(emptyIndex(), 20), true);

/* ---------- local merge: commutative, tombstone wins ---------- */
const left = { v: 1, owner: "a".repeat(32), books: { biz_primary: { id: PRIMARY_BOOK_ID, createdAt: 0 }, [A]: { id: A, createdAt: 50 }, [B]: { id: B, createdAt: 70, deletedAt: 90 } } };
const right = { v: 1, owner: "a".repeat(32), books: { biz_primary: { id: PRIMARY_BOOK_ID, createdAt: 0 }, [A]: { id: A, createdAt: 40, deletedAt: 95, purgedAt: 99 }, [B]: { id: B, createdAt: 70, deletedAt: 80 } } };
const merged = mergeBookIndex(left, right);
assert.deepEqual(merged, mergeBookIndex(right, left), "merge is commutative");
assert.deepEqual(merged.books[A], { id: A, createdAt: 40, deletedAt: 95, purgedAt: 99 });
assert.deepEqual(merged.books[B], { id: B, createdAt: 70, deletedAt: 80 }, "earliest deletedAt");
assert.equal(merged.owner, "a".repeat(32));
assert.equal(mergeBookIndex({ ...left, owner: "b".repeat(32) }, right).owner, undefined, "differing owners give no owner");

/* ---------- server merge ---------- */
const server = { ...addBook(emptyIndex(), A, 1000), deleted: [C] };
const incoming = sanitizeBookIndex({
  v: 1,
  books: { [A]: { id: A, createdAt: 5, deletedAt: 6 }, [B]: { id: B, createdAt: 7 }, [C]: { id: C, createdAt: 8 }, biz_ghostgho: { createdAt: 1, deletedAt: 2 } },
});
const applied = applyIncomingIndex(server, incoming, NOW);
assert.deepEqual(applied.added, [B]);
assert.deepEqual(applied.removed, [A]);
assert.deepEqual(applied.deleted, [C], "an evicted id is reported back as deleted, never revived");
assert.deepEqual(applied.merged.books[A], { id: A, createdAt: 1000, deletedAt: NOW }, "server keeps its createdAt and stamps its own clock");
assert.deepEqual(applied.merged.books[B], { id: B, createdAt: NOW });
assert.equal(applied.merged.books.biz_ghostgho, undefined, "unknown tombstones are ignored");
const absent = applyIncomingIndex(server, emptyIndex(), NOW);
assert.deepEqual([absent.added, absent.removed], [[], []], "absence never deletes");
assert.deepEqual(liveBookIds(absent.merged), [PRIMARY_BOOK_ID, A]);

/* ---------- plan cap on additions (Free 1 / Pro 20) ---------- */
const two = applyIncomingIndex(emptyIndex(), sanitizeBookIndex({ v: 1, books: { [A]: { createdAt: 1 }, [B]: { createdAt: 2 } } }), NOW);
const freeCap = capAdditions(two.merged, two.added, FREE_BUSINESSES);
assert.deepEqual(freeCap.rejected, [A, B]);
assert.deepEqual(liveBookIds(freeCap.index), [PRIMARY_BOOK_ID]);
const proCap = capAdditions(two.merged, two.added, PRO_BUSINESSES);
assert.deepEqual(proCap.rejected, []);
const threeLimit = capAdditions(two.merged, two.added, 2);
assert.deepEqual(threeLimit.rejected, [B], "keeps additions in rank order up to the limit");
// Downgrade: books already live above the limit are never touched.
const live3 = addBook(addBook(emptyIndex(), A, 1), B, 2);
assert.deepEqual(capAdditions(live3, [], FREE_BUSINESSES), { index: live3, rejected: [] });

/* ---------- eviction never drops a live book or an unpurged tombstone ---------- */
let big = emptyIndex();
for (let i = 0; i < MAX_BOOK_ENTRIES + 5; i++) big = addBook(big, `biz_${String(i).padStart(8, "0")}`, i + 1);
assert.equal(Object.keys(capBookIndex(big).index.books).length, MAX_BOOK_ENTRIES + 6, "all live: nothing evicted, cap exceeded");
for (let i = 0; i < 10; i++) big = deleteBook(big, `biz_${String(i).padStart(8, "0")}`, 100 + i);
assert.deepEqual(capBookIndex(big).evicted, [], "tombstones without purgedAt stay");
for (let i = 0; i < 10; i++) big.books[`biz_${String(i).padStart(8, "0")}`].purgedAt = 200;
const capped = capBookIndex(big);
assert.deepEqual(capped.evicted, ["biz_00000000", "biz_00000001", "biz_00000002", "biz_00000003", "biz_00000004", "biz_00000005"], "oldest purged tombstones first");
assert.equal(Object.keys(capped.index.books).length, MAX_BOOK_ENTRIES);
// Reading an over-full stored index evicts purged tombstones into `deleted`: they can never come back.
const reread = parseBookIndex(JSON.stringify({ ...big, deleted: [] }));
assert.equal(Object.keys(reread.books).length, MAX_BOOK_ENTRIES);
assert.deepEqual(reread.deleted, ["biz_00000000", "biz_00000001", "biz_00000002", "biz_00000003", "biz_00000004", "biz_00000005"]);
assert.ok(isTombstoned(reread, "biz_00000000"));
const comeback = applyIncomingIndex(reread, sanitizeBookIndex({ v: 1, books: { biz_00000000: { createdAt: 1 } } }), NOW);
assert.deepEqual([comeback.added, comeback.deleted], [[], ["biz_00000000"]], "an offline device can't revive an evicted business");

/* ---------- pay-link keys ---------- */
assert.equal(linkKey(PRIMARY_BOOK_ID, "inv_abc"), "inv_abc", "the primary's keys are byte-identical to today");
assert.equal(linkKey(PRIMARY_BOOK_ID, "stmt:cli_1"), "stmt:cli_1");
assert.equal(linkKey(A, "inv_abc"), `${A}/inv_abc`);
assert.throws(() => linkKey("bad", "inv_abc"));
assert.throws(() => linkKey(A, "a/b"));
assert.throws(() => linkKey(A, ""));
assert.deepEqual(parseLinkKey("inv_abc"), { bookId: PRIMARY_BOOK_ID, subject: "inv_abc" });
assert.deepEqual(parseLinkKey(`${A}/stmt:cli_1`), { bookId: A, subject: "stmt:cli_1" });
assert.deepEqual(parseLinkKey(`${PRIMARY_BOOK_ID}/inv_abc`), { bookId: "", subject: `${PRIMARY_BOOK_ID}/inv_abc` }, "the primary is never qualified");
assert.deepEqual(parseLinkKey("junk/inv_abc"), { bookId: "", subject: "junk/inv_abc" });
assert.deepEqual(parseLinkKey(`${A}/x/y`), { bookId: "", subject: `${A}/x/y` });
const links = { inv_1: { token: "t-primary" }, [`${A}/inv_1`]: { token: "t-a" } };
assert.equal(linkFor(links, PRIMARY_BOOK_ID, "inv_1")?.token, "t-primary");
assert.equal(linkFor(links, A, "inv_1")?.token, "t-a", "same invoice id in another business is a different link");
assert.equal(linkFor(links, B, "inv_1"), undefined, "never another book's entry");
assert.equal(linkFor(links, A, "toString"), undefined);
assert.equal(linkFor(undefined, A, "inv_1"), undefined);

/* ---------- routing documents and legacy backups ---------- */
const book = (name, upiId) => updateBusiness(emptyWorkspace(), { name, upiId }, NOW);
const shelf = {
  index: addBook(addBook(emptyIndex(), A, 1), B, 2),
  books: { [PRIMARY_BOOK_ID]: book("Sharma Store", "sharma@okaxis"), [A]: book("Sharma Tuition", "tuition@oksbi"), [B]: book("Riya Designs", "riya@ybl") },
};
const vpa = (v) => /^[\w.-]+@[\w.-]+$/.test(v);
assert.deepEqual(pickBookForDocument(shelf, { upiId: " TUITION@oksbi ", merchant: "x" }, PRIMARY_BOOK_ID, vpa), { bookId: A }, "UPI match, trimmed, case-insensitive");
assert.deepEqual(pickBookForDocument(shelf, { upiId: "", merchant: "Riya Designs" }, PRIMARY_BOOK_ID, vpa), { bookId: B }, "then exact name");
assert.deepEqual(pickBookForDocument(shelf, { upiId: "new@okicici", merchant: "Someone" }, A, vpa), { ask: true }, "a real unknown VPA asks");
assert.deepEqual(pickBookForDocument(shelf, { upiId: "merchant@upi", merchant: "" }, A, vpa), { bookId: A }, "placeholder → active book");
assert.deepEqual(pickBookForDocument(shelf, { upiId: "", merchant: "" }, B, vpa), { bookId: B }, "empty → active book");
const oneBook = { index: emptyIndex(), books: { [PRIMARY_BOOK_ID]: book("Solo", "solo@ybl") } };
assert.deepEqual(pickBookForDocument(oneBook, { upiId: "other@ybl", merchant: "" }, PRIMARY_BOOK_ID, vpa), { bookId: PRIMARY_BOOK_ID }, "one book never asks");
assert.deepEqual(routeLegacyBackup(shelf, { upiId: "riya@ybl", name: "" }, PRIMARY_BOOK_ID), { bookId: B, confirm: true }, "not the active book → confirm");
assert.deepEqual(routeLegacyBackup(shelf, { upiId: "sharma@okaxis", name: "" }, PRIMARY_BOOK_ID), { bookId: PRIMARY_BOOK_ID, confirm: false });
assert.deepEqual(routeLegacyBackup(shelf, { upiId: "other@ybl", name: "" }, PRIMARY_BOOK_ID), { bookId: PRIMARY_BOOK_ID, confirm: true }, "different UPI IDs → confirm");

/* ---------- paid-link tokens never cross books ---------- */
let primaryWs = upsertClient(book("Sharma Store", "sharma@okaxis"), { id: "cli_1", name: "Asha", phone: "", email: "", gstin: "", createdAt: NOW, updatedAt: NOW }, NOW);
primaryWs = upsertInvoice(primaryWs, { id: "inv_paid", number: "INV-0001", clientId: "cli_1", issueDate: "2026-10-01", dueDate: "2026-10-08", amountPaise: 50_000, description: "", payments: [], reminders: [], voided: false, createdAt: NOW, updatedAt: NOW }, NOW);
primaryWs = addPayment(primaryWs, "inv_paid", { amountPaise: 50_000, date: "2026-10-05", mode: "upi", reference: "" }, NOW);
primaryWs = upsertInvoice(primaryWs, { id: "inv_open", number: "INV-0002", clientId: "cli_1", issueDate: "2026-10-01", dueDate: "2026-10-30", amountPaise: 20_000, description: "", payments: [], reminders: [], voided: false, createdAt: NOW, updatedAt: NOW }, NOW);
const tokShelf = { index: addBook(emptyIndex(), A, 1), books: { [PRIMARY_BOOK_ID]: primaryWs, [A]: book("Other", "o@ybl") } };
const linkMap = {
  inv_paid: { token: "p-paid" }, inv_open: { token: "p-open" }, inv_gone: { token: "p-gone" }, "stmt:cli_1": { token: "p-stmt" },
  [`${A}/inv_paid`]: { token: "a-paid" }, [`${B}/inv_x`]: { token: "b-x" },
};
assert.deepEqual(paidLinkTokens(linkMap, tokShelf, new Set([PRIMARY_BOOK_ID]), "2026-10-18"), ["p-paid", "p-gone"], "only synced books; statements never");
assert.deepEqual(paidLinkTokens(linkMap, tokShelf, new Set([PRIMARY_BOOK_ID, A]), "2026-10-18"), ["p-paid", "p-gone", "a-paid"], "missing invoice in its own book counts; unknown book B never");

/* ---------- hashes ---------- */
assert.equal(fnv1a(""), "811c9dc5");
assert.equal(fnv1a("a"), "e40c292c");
assert.equal(bookHash(emptyWorkspace()), bookHash(JSON.parse(JSON.stringify(emptyWorkspace()))));

/* ---------- plans: Free 1, Pro 20, trial 3 ---------- */
assert.equal(PLANS.free.businesses, 1);
assert.equal(PLANS.pro.businesses, 20);
const sub = (over) => ({ subscriptionId: "sub_1", status: "active", interval: "monthly", currentEnd: NOW + 20 * DAY, updatedAt: NOW, ...over });
assert.equal(businessesFor(null, NOW), 1, "free");
assert.equal(businessesFor(sub(), NOW), 20, "paid Pro");
assert.equal(businessesFor(sub({ trialEndsAt: NOW + 5 * DAY }), NOW), 3, "in trial: three businesses until the first payment");
assert.equal(businessesFor(sub({ trialEndsAt: NOW - DAY }), NOW), 20, "trial over and paying");
assert.equal(businessesFor(sub({ status: "cancelled", currentEnd: NOW - DAY }), NOW), 1, "expired");
// A trial whose first charge failed (Dodo on_hold/past_due → pending, grace period) has paid nothing: still 1.
assert.equal(businessesFor(sub({ status: "pending", trialEndsAt: NOW - DAY, currentEnd: NOW - DAY }), NOW), 1, "first charge failed: unpaid");
assert.equal(businessesFor(sub({ status: "pending", trialEndsAt: NOW - DAY, currentEnd: null }), NOW + 365 * DAY), 1, "no period end: still unpaid");
// A paid account whose later renewal is pending keeps 20 during the grace period (currentEnd moved a cycle past the trial).
assert.equal(businessesFor(sub({ status: "pending", trialEndsAt: NOW - 40 * DAY, currentEnd: NOW - DAY }), NOW), 20, "renewal pending after real payments");
assert.equal(businessesFor(sub({ status: "pending", currentEnd: NOW - DAY }), NOW), 20, "pending without a trial is a paid account's renewal");
const trialPlan = planFromSubscription(sub({ trialEndsAt: NOW + 5 * DAY }), NOW);
assert.equal(trialPlan.id, "pro", "every other Pro benefit applies during the trial");
assert.equal(trialPlan.statementLinks, true);
assert.equal(trialPlan.businesses, 3);
assert.equal(planFromSubscription(sub(), NOW), PLANS.pro);
assert.equal(planFromSubscription(null, NOW), PLANS.free);
// planForStrict rethrows store errors (callers answer 503); planFor still falls back to Free.
const broken = { get: async () => { throw new Error("kv down"); } };
await assert.rejects(planForStrict("owner", broken, NOW), /kv down/);
assert.equal(await planFor("owner", broken, NOW), PLANS.free);
assert.equal(await planForStrict("owner", { get: async () => sub() }, NOW), PLANS.pro);

/* ---------- pay-link records: today's records parse byte-identically ---------- */
assert.deepEqual(parseRecord(JSON.stringify({ owner: "o", invoiceId: "inv_1", createdAt: 5 })), { owner: "o", invoiceId: "inv_1", createdAt: 5 });
assert.deepEqual(parseRecord({ owner: "o", invoiceId: `${A}/inv_1`, createdAt: 5, businessId: A }), { owner: "o", invoiceId: `${A}/inv_1`, createdAt: 5, businessId: A });
assert.equal(parseRecord({ owner: "o", invoiceId: `${A}/inv_1`, createdAt: 5, businessId: B }), null, "businessId must agree with the key");
assert.equal(parseRecord({ owner: "o", invoiceId: "inv_1", createdAt: 5, businessId: A }), null);
assert.equal(parseRecord({ owner: "o", invoiceId: `${A}/inv_1`, createdAt: 5 }), null, "a qualified key needs its businessId");
assert.deepEqual(parseRecord({ owner: "o", invoiceId: "inv_1", createdAt: 5, businessId: PRIMARY_BOOK_ID }), { owner: "o", invoiceId: "inv_1", createdAt: 5 });

/* ---------- digest projection: still written as v1, v2 readable ---------- */
assert.equal(PROJECTION_VERSION, 1);
const proj = digestProjection(primaryWs, "2026-10-18");
assert.equal(proj.v, 1);
assert.equal("name" in proj, false, "nothing writes the v2 shape yet");
assert.deepEqual(parseProjection(JSON.stringify(proj)), { ...proj, name: "" });
assert.deepEqual(parseProjection({ v: 2, name: "Riya Designs", open: [], plans: [] }), { v: 2, name: "Riya Designs", open: [], plans: [] });
assert.equal(parseProjection({ v: 2, open: [], plans: [] }), null, "v2 needs a name");
assert.equal(parseProjection({ v: 3, name: "", open: [], plans: [] }), null);

/* ---------- claim alerts: unchanged unless a business is named ---------- */
const claim = { invoiceNumber: "INV-0042", amountPaise: 150_050, utr: "123456789012", statement: false };
assert.deepEqual(claimNotification(claim, "tok"), {
  title: "A client says they've paid",
  body: "₹1,500.50 for INV-0042 · UTR …9012. Check your bank, then confirm it in the tracker.",
  url: "/app/",
  tag: "claim-tok",
});
assert.deepEqual(claimNotification({ ...claim, businessName: "  Riya   Designs ", businessId: A }, "tok"), {
  title: "A client says they've paid",
  body: "₹1,500.50 for INV-0042 (Riya Designs) · UTR …9012. Check your bank, then confirm it in the tracker.",
  url: `/app/?business=${A}`,
  tag: "claim-tok",
});
assert.equal(claimNotification({ ...claim, businessId: PRIMARY_BOOK_ID }, "tok").url, "/app/");
assert.equal(claimNotification({ ...claim, businessId: "javascript:alert(1)" }, "tok").url, "/app/", "only valid book ids reach the URL");
assert.equal(claimNotification({ ...claim, amountPaise: 50_000, utr: "WISE-TR-991234", currency: "USD", businessName: "Riya Designs", businessId: A }, "tok").body,
  "US$500.00 for INV-0042 (Riya Designs) · ref …1234. Check your bank, then confirm it in the tracker.", "a foreign claim: its currency and a transfer reference");

/* ---------- metrics ---------- */
assert.ok(METRICS.includes("business_added") && METRICS.includes("business_limit"));
assert.ok(METRIC_LABELS.business_added && METRIC_LABELS.business_limit);

console.log("[books] index add-once/delete-final, server merge, plan caps (Free 1 / Pro 20 / trial 3), pay-link keys, routing, projections and claim alerts passed");
