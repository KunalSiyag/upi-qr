// Multi-business server logic (src/lib/workspace/booksApi.ts) against memory stores:
// limits on additions only, downgrade = read-only, owner checks, deletes that undo
// concurrent writes, and pay links that never resolve to another business.
import assert from "node:assert/strict";
import { getBook, getBookIndex, putBook, putBookIndex, createBookLink, deleteCloudCopy, badBookId, ownerMismatch } from "../src/lib/workspace/booksApi.ts";
import { memoryCloudStore, readBookIndex, readWorkspace, slotFor, syncWorkspace } from "../src/lib/workspace/cloud.ts";
import { memoryProjectionStore } from "../src/lib/workspace/digest.ts";
import { memoryPaylinkStore, snapshotFor } from "../src/lib/workspace/paylinks.ts";
import { emptyWorkspace, updateBusiness, upsertClient, upsertInvoice } from "../src/lib/workspace/model.ts";
import { planFromSubscription } from "../src/lib/workspace/entitlements.ts";

const T = 1_790_000_000_000;
const OWNER = "a".repeat(32);
const vpa = (v) => /^[\w.-]{2,}@[\w]{2,}$/.test(v);
let n = 0;
const token = () => `tok${String(n++).padStart(19, "0")}`;
const client = { id: "cli_aaaaaaaa", name: "Rohan", phone: "", email: "", gstin: "", createdAt: T, updatedAt: T };
const inv = (id, number, amountPaise) => ({ id, number, clientId: client.id, issueDate: "2026-10-01", dueDate: "2026-10-15", amountPaise, description: "", payments: [], reminders: [], voided: false, createdAt: T, updatedAt: T });
const book = (name, upiId, number = "INV-0001", amount = 100000) => upsertInvoice(updateBusiness(upsertClient(emptyWorkspace(), client, T), { name, upiId }, T), inv("inv_00000001", number, amount), T);
const meta = (id, createdAt = 1, extra = {}) => ({ id, createdAt, ...extra });
const index = (...entries) => ({ v: 1, books: Object.fromEntries([meta("biz_primary", 0), ...entries].map((m) => [m.id, m])) });

const sub = (extra = {}) => ({ provider: "dodo", subscriptionId: "sub_x", interval: "monthly", status: "active", currentEnd: T + 30 * 86_400_000, cancelAtCycleEnd: false, shortUrl: null, eventAt: 1, updatedAt: T, ...extra });
const PLAN = {
  free: planFromSubscription(null, T),
  pro: planFromSubscription(sub(), T),
  trial: planFromSubscription(sub({ trialEndsAt: T + 7 * 86_400_000 }), T),
};
assert.deepEqual([PLAN.free.businesses, PLAN.pro.businesses, PLAN.trial.businesses, PLAN.trial.id], [1, 20, 3, "pro"]);

function deps(planId = "free") {
  const metrics = [];
  let billing = planId;
  const d = {
    docs: memoryCloudStore(),
    books: memoryCloudStore(),
    projections: memoryProjectionStore(),
    paylinks: memoryPaylinkStore(),
    plan: async () => {
      if (billing === "down") throw new Error("billing store unreachable");
      return PLAN[billing];
    },
    now: () => T,
    metric: async (name, by = 1) => { metrics.push([name, by]); },
  };
  return { d, metrics, setPlan: (p) => { billing = p; } };
}
const allow = async () => true;
/** A 60-unit daily budget, charged all or nothing like consumeRateLimitUnits. */
const budget = (left = 60) => { const fn = async (units) => { if (units > fn.left) return false; fn.left -= units; return true; }; fn.left = left; return fn; };
const putIndex = (d, books, extra = {}) => putBookIndex(d, OWNER, { index: books, expectedOwner: OWNER, ...extra }, allow);

// Id and owner guards.
assert.equal(badBookId("biz_primary").status, 400);
assert.equal(badBookId("biz_../../x").status, 400);
assert.equal(badBookId(undefined).status, 400);
assert.equal(badBookId("biz_abcdef01"), null);
assert.equal(ownerMismatch({}, OWNER), null, "old clients don't send expectedOwner");
assert.equal(ownerMismatch({ expectedOwner: OWNER }, OWNER), null);
assert.deepEqual(ownerMismatch({ expectedOwner: "b".repeat(32) }, OWNER).body.code, "owner_mismatch");
assert.equal(ownerMismatch({ expectedOwner: null }, OWNER).status, 409);

// Free: a second business is rejected (200 with rejected + business_limit); its PUT is 404 unknown_business.
{
  const { d, metrics } = deps("free");
  const r = await putIndex(d, index(meta("biz_second01")));
  assert.equal(r.status, 200);
  assert.deepEqual([r.body.rejected, r.body.code, r.body.plan, r.body.index], [["biz_second01"], "business_limit", { id: "free", businesses: 1 }, index()]);
  assert.deepEqual(r.body.revs, { biz_primary: 0 });
  assert.deepEqual(metrics, [["business_limit", 1]]);
  assert.equal(d.books.docs.size, 0, "a rejected add writes no index");
  const put = await putBook(d, OWNER, "biz_second01", { workspace: book("Two", "two@okaxis"), expectedOwner: OWNER });
  assert.deepEqual([put.status, put.body.code], [404, "unknown_business"]);
  assert.equal(d.docs.docs.size, 0);
  // GET shows only the primary.
  const g = await getBookIndex(d, OWNER);
  assert.deepEqual([g.status, g.body.index, g.body.owner], [200, index(), OWNER]);
}

// A trial keeps up to 3 businesses (the 4th is rejected); a billing error is 503, never "limit reached".
{
  const { d, setPlan } = deps("trial");
  // Additions in one request share the server's timestamp, so they rank by id.
  const r = await putIndex(d, index(meta("biz_trial00002"), meta("biz_trial00003"), meta("biz_trial00004")));
  assert.deepEqual([r.body.rejected, r.body.plan], [["biz_trial00004"], { id: "pro", businesses: 3 }]);
  setPlan("down");
  const down = await putIndex(d, index(meta("biz_second01")));
  assert.equal(down.status, 503);
  // Plan unknown on GET → null (the client shows "Checking your plan…"), never a Free fallback.
  assert.equal((await getBookIndex(d, OWNER)).body.plan, null);
  // Edits that add nothing never read billing.
  assert.equal((await putIndex(d, index())).status, 200);
}

// Paid Pro: up to 20 businesses; the 21st is rejected; a rate-limited add is 429 and writes nothing.
{
  const { d, metrics } = deps("pro");
  const ids = Array.from({ length: 19 }, (_, i) => `biz_pro${String(i).padStart(5, "0")}`);
  const r = await putIndex(d, index(...ids.map((id) => meta(id))));
  assert.deepEqual([r.status, r.body.rejected, r.body.code, Object.keys(r.body.revs).length], [200, [], undefined, 20]);
  assert.deepEqual(metrics, [["business_added", 19]]);
  const over = await putIndex(d, index(meta("biz_twentyone")));
  assert.deepEqual(over.body.rejected, ["biz_twentyone"]);
  const charged = [];
  await putBookIndex(d, OWNER, { index: index(...ids.map((id) => meta(id)), meta("biz_twentyone"), meta("biz_twentytwo")), expectedOwner: OWNER }, async (units) => { charged.push(units); return true; });
  assert.deepEqual(charged, [2], "charged one unit per new business (known ids are free)");
  const limited = await putBookIndex(d, OWNER, { index: index(meta("biz_ratelimit1")), expectedOwner: OWNER }, async () => false);
  assert.equal(limited.status, 429);
  assert.equal((await putBookIndex(d, OWNER, { index: index(), expectedOwner: OWNER }, async () => false)).status, 200, "no add, no add limit");
  // Owner mismatch writes nothing.
  const before = d.books.docs.get(OWNER).json;
  const bad = await putBookIndex(d, OWNER, { index: index(meta("biz_ownerbad1", 1)), expectedOwner: "b".repeat(32) }, allow);
  assert.deepEqual([bad.status, d.books.docs.get(OWNER).json], [409, before]);
  assert.equal((await putBookIndex(d, OWNER, { index: "nope" }, allow)).status, 400);
}

// A registered book syncs in its own slot; the primary's document is untouched; GET returns businessId.
{
  const { d } = deps("pro");
  await syncWorkspace(d.docs, OWNER, book("Primary Shop", "shop@okaxis", "P-1"), T);
  const primaryJson = d.docs.docs.get(OWNER).json;
  await putIndex(d, index(meta("biz_bbbbbb01")));
  const put = await putBook(d, OWNER, "biz_bbbbbb01", { workspace: book("Book Two", "two@okhdfc", "B-1"), expectedOwner: OWNER });
  assert.deepEqual([put.status, put.body.rev, put.body.businessId, put.body.workspace.business.name], [200, 1, "biz_bbbbbb01", "Book Two"]);
  assert.equal(d.docs.docs.get(OWNER).json, primaryJson, "the primary's document is byte-identical");
  assert.equal((await d.projections.getAll(OWNER)).projections.biz_bbbbbb01.name, "Book Two");
  const get = await getBook(d, OWNER, "biz_bbbbbb01");
  assert.deepEqual([get.status, get.body.workspace.invoices.inv_00000001.number, get.body.businessId], [200, "B-1", "biz_bbbbbb01"]);
  const g = await getBookIndex(d, OWNER);
  assert.deepEqual(g.body.revs, { biz_primary: 1, biz_bbbbbb01: 1 });
  assert.equal("deleted" in g.body.index, false);
  // Another account's expectedOwner → 409, nothing written.
  const mismatch = await putBook(d, OWNER, "biz_bbbbbb01", { workspace: book("Hijack", "x@okaxis"), expectedOwner: "b".repeat(32) });
  assert.equal(mismatch.status, 409);
  assert.equal((await readWorkspace(d.docs, slotFor(OWNER, "biz_bbbbbb01"))).rev, 1);
}

// Downgrade = read-only: books ranked past the Free limit take no writes and no new links (402 plan_read_only),
// existing links keep their snapshots; the first business is never read-only; a billing error is 503.
{
  const { d, setPlan } = deps("pro");
  await syncWorkspace(d.docs, OWNER, book("Primary Shop", "shop@okaxis", "P-1"), T);
  await putIndex(d, index(meta("biz_bbbbbb01"), meta("biz_cccccc01")));
  await putBook(d, OWNER, "biz_bbbbbb01", { workspace: book("Book Two", "two@okhdfc", "B-1"), expectedOwner: OWNER });
  const link = await createBookLink(d, OWNER, "biz_bbbbbb01", { invoiceId: "inv_00000001", expectedOwner: OWNER }, token, vpa);
  assert.equal(link.status, 201);
  const record = await d.paylinks.get(link.body.token);
  assert.deepEqual(record, { owner: OWNER, invoiceId: "biz_bbbbbb01/inv_00000001", createdAt: T, businessId: "biz_bbbbbb01" });
  assert.deepEqual([(await d.paylinks.getView(OWNER, link.body.token)).view.upiId, (await d.paylinks.getView(OWNER, link.body.token)).view.merchantName], ["two@okhdfc", "Book Two"]);
  setPlan("free");
  const ro = await putBook(d, OWNER, "biz_bbbbbb01", { workspace: book("Book Two edited", "two@okhdfc"), expectedOwner: OWNER });
  assert.deepEqual([ro.status, ro.body.code], [402, "plan_read_only"]);
  assert.equal((await readWorkspace(d.docs, slotFor(OWNER, "biz_bbbbbb01"))).workspace.business.name, "Book Two", "nothing written");
  const roLink = await createBookLink(d, OWNER, "biz_bbbbbb01", { clientId: "cli_aaaaaaaa", expectedOwner: OWNER }, token, vpa);
  assert.deepEqual([roLink.status, roLink.body.code], [402, "plan_read_only"]);
  assert.ok(await d.paylinks.get(link.body.token), "the existing link keeps serving");
  assert.equal((await d.paylinks.getView(OWNER, link.body.token)).view.upiId, "two@okhdfc");
  // Readable and listed while read-only.
  assert.equal((await getBook(d, OWNER, "biz_bbbbbb01")).status, 200);
  assert.deepEqual(Object.keys((await getBookIndex(d, OWNER)).body.revs), ["biz_primary", "biz_bbbbbb01", "biz_cccccc01"]);
  // Deletes still work on Free.
  setPlan("trial");
  assert.equal((await putBook(d, OWNER, "biz_cccccc01", { workspace: book("Three", "three@okaxis"), expectedOwner: OWNER })).status, 200, "a trial can edit its third business");
  setPlan("down");
  assert.equal((await putBook(d, OWNER, "biz_cccccc01", { workspace: book("Three", "three@okaxis"), expectedOwner: OWNER })).status, 503);
  assert.equal((await createBookLink(d, OWNER, "biz_cccccc01", { invoiceId: "inv_00000001" }, token, vpa)).status, 503);
  setPlan("pro");
  assert.equal((await putBook(d, OWNER, "biz_cccccc01", { workspace: book("Three", "three@okaxis"), expectedOwner: OWNER })).status, 200, "upgrading again unlocks it");
}

// Pay links in a book: validation, unknown/deleted books, and the payer only ever sees that book's UPI ID.
{
  const { d } = deps("pro");
  await syncWorkspace(d.docs, OWNER, book("Primary Shop", "shop@okaxis", "P-1", 500000), T);
  await putIndex(d, index(meta("biz_bbbbbb01")));
  await putBook(d, OWNER, "biz_bbbbbb01", { workspace: book("Book Two", "two@okhdfc", "B-1", 120000), expectedOwner: OWNER });
  assert.equal((await createBookLink(d, OWNER, "biz_bbbbbb01", { invoiceId: "../x" }, token, vpa)).status, 400);
  assert.equal((await createBookLink(d, OWNER, "biz_unknown01", { invoiceId: "inv_00000001" }, token, vpa)).body.code, "unknown_business");
  const made = await createBookLink(d, OWNER, "biz_bbbbbb01", { invoiceId: "inv_00000001" }, token, vpa);
  const again = await createBookLink(d, OWNER, "biz_bbbbbb01", { invoiceId: "inv_00000001" }, token, vpa);
  assert.deepEqual([made.status, again.status, again.body.token], [201, 200, made.body.token]);
  const snap = await d.paylinks.getView(OWNER, made.body.token);
  assert.deepEqual([snap.view.merchantName, snap.view.upiId, snap.view.balancePaise], ["Book Two", "two@okhdfc", 120000]);
  assert.doesNotMatch(JSON.stringify(snap), /Primary Shop|shop@okaxis/);
  // The primary's same invoice id has no link and its doc can't answer B's key.
  assert.equal(snapshotFor((await readWorkspace(d.docs, OWNER)).workspace, "biz_bbbbbb01/inv_00000001"), null);

  // Delete B: the index PUT runs the cleanup sweep; links 404 (records gone), the doc and projection go, revs stay.
  const del = await putIndex(d, index(meta("biz_bbbbbb01", 1, { deletedAt: 0 })));
  assert.equal(del.body.index.books.biz_bbbbbb01.deletedAt, T);
  assert.equal(del.body.index.books.biz_bbbbbb01.purgedAt, T);
  assert.equal(await d.paylinks.get(made.body.token), null);
  assert.equal(d.docs.docs.has(slotFor(OWNER, "biz_bbbbbb01")), false);
  assert.deepEqual(await d.projections.bookIds(OWNER), []);
  assert.deepEqual(await d.docs.revs([slotFor(OWNER, "biz_bbbbbb01")]), [2], "revision advanced on delete");
  // It can't be revived: GET/PUT/POST answer 410, a live re-send stays a tombstone.
  assert.equal((await getBook(d, OWNER, "biz_bbbbbb01")).status, 410);
  assert.equal((await putBook(d, OWNER, "biz_bbbbbb01", { workspace: book("Back", "two@okhdfc") })).body.code, "business_deleted");
  assert.equal((await createBookLink(d, OWNER, "biz_bbbbbb01", { invoiceId: "inv_00000001" }, token, vpa)).status, 410);
  const revive = await putIndex(d, index(meta("biz_bbbbbb01")));
  assert.equal(revive.body.index.books.biz_bbbbbb01.deletedAt, T);
  assert.equal(d.docs.docs.has(slotFor(OWNER, "biz_bbbbbb01")), false);
}

// A book PUT or link POST that races a delete undoes its own writes (the post-write index re-check).
{
  const { d } = deps("pro");
  await putIndex(d, index(meta("biz_bbbbbb01")));
  await putBook(d, OWNER, "biz_bbbbbb01", { workspace: book("Book Two", "two@okhdfc"), expectedOwner: OWNER });
  // Tombstone lands between the link's write and its re-check.
  const racing = { ...d, paylinks: { ...d.paylinks, async put(tk, record) {
    await d.paylinks.put(tk, record);
    await putBookIndex(d, OWNER, { index: index(meta("biz_bbbbbb01", 1, { deletedAt: 1 })) }, allow);
  } } };
  const raced = await createBookLink(racing, OWNER, "biz_bbbbbb01", { invoiceId: "inv_00000001" }, token, vpa);
  assert.deepEqual([raced.status, raced.body.code], [410, "business_deleted"]);
  assert.deepEqual(await d.paylinks.list(OWNER), {}, "no link outlives the delete");
  // Same for a book PUT: "Delete cloud copy" unregisters the book mid-write → the write is undone, 404.
  const e = deps("pro").d;
  await putIndex(e, index(meta("biz_cccccc01")));
  const racingDocs = { ...e, docs: { ...e.docs, async write(slot, json, rev) {
    const out = await e.docs.write(slot, json, rev);
    await deleteCloudCopy(e, OWNER);
    return out;
  } } };
  const lost = await putBook(racingDocs, OWNER, "biz_cccccc01", { workspace: book("Three", "three@okaxis"), expectedOwner: OWNER });
  assert.deepEqual([lost.status, lost.body.code], [404, "unknown_business"]);
  assert.equal(e.docs.docs.has(slotFor(OWNER, "biz_cccccc01")), false);
  assert.deepEqual(await e.projections.bookIds(OWNER), []);
}

// Failed cleanup is retried by the next GET; a corrupt index answers 503 and is never overwritten.
{
  const { d } = deps("pro");
  await putIndex(d, index(meta("biz_bbbbbb01")));
  await putBook(d, OWNER, "biz_bbbbbb01", { workspace: book("Book Two", "two@okhdfc"), expectedOwner: OWNER });
  await createBookLink(d, OWNER, "biz_bbbbbb01", { invoiceId: "inv_00000001" }, token, vpa);
  const removeBook = d.paylinks.removeBook;
  d.paylinks.removeBook = async () => { throw new Error("KV blip"); };
  const del = await putIndex(d, index(meta("biz_bbbbbb01", 1, { deletedAt: 1 })));
  assert.equal(del.body.index.books.biz_bbbbbb01.purgedAt, undefined);
  assert.equal(Object.keys(await d.paylinks.list(OWNER)).length, 1);
  d.paylinks.removeBook = removeBook;
  const g = await getBookIndex(d, OWNER);
  assert.equal(g.body.index.books.biz_bbbbbb01.purgedAt, T);
  assert.deepEqual(await d.paylinks.list(OWNER), {});
  assert.equal((await readBookIndex(d.books, OWNER)).index.books.biz_bbbbbb01.purgedAt, T);

  const c = deps("pro").d;
  await c.books.write(OWNER, "{corrupt", 0);
  assert.equal((await getBookIndex(c, OWNER)).status, 503);
  assert.equal((await putIndex(c, index(meta("biz_new00001")))).status, 503);
  assert.equal((await getBook(c, OWNER, "biz_new00001")).status, 503);
  assert.equal(c.books.docs.get(OWNER).json, "{corrupt");
}

// Delete cloud copy across books: docs, projections and links of extra books go; the primary link stays (PR 6).
{
  const { d } = deps("pro");
  await syncWorkspace(d.docs, OWNER, book("Primary Shop", "shop@okaxis"), T);
  await putIndex(d, index(meta("biz_bbbbbb01")));
  await putBook(d, OWNER, "biz_bbbbbb01", { workspace: book("Book Two", "two@okhdfc"), expectedOwner: OWNER });
  const bl = await createBookLink(d, OWNER, "biz_bbbbbb01", { invoiceId: "inv_00000001" }, token, vpa);
  await d.paylinks.put("tokPrimary000000000000", { owner: OWNER, invoiceId: "inv_00000001", createdAt: T });
  const r = await deleteCloudCopy(d, OWNER);
  assert.deepEqual([r.status, r.body], [200, { ok: true }]);
  assert.equal(d.docs.docs.size, 0);
  assert.deepEqual(await d.docs.revs([OWNER, slotFor(OWNER, "biz_bbbbbb01")]), [2, 2], "removed docs read as a newer revision");
  assert.equal(await d.paylinks.get(bl.body.token), null);
  assert.ok(await d.paylinks.get("tokPrimary000000000000"));
  assert.deepEqual(Object.keys((await readBookIndex(d.books, OWNER)).index.books), ["biz_primary"], "unregistered, not tombstoned");
  // A device holding rev 1 sees revs 2 (changed) on GET books, GET book and the primary GET: it re-uploads.
  await putIndex(d, index(meta("biz_bbbbbb01")));
  assert.deepEqual((await getBookIndex(d, OWNER)).body.revs, { biz_primary: 2, biz_bbbbbb01: 2 });
  const emptyGet = await getBook(d, OWNER, "biz_bbbbbb01");
  assert.deepEqual([emptyGet.body.rev, emptyGet.body.workspace.business.name], [2, ""]);
  assert.equal((await readWorkspace(d.docs, OWNER)).rev, 2);
  assert.equal((await putBook(d, OWNER, "biz_bbbbbb01", { workspace: book("Book Two", "two@okhdfc"), expectedOwner: OWNER })).body.rev, 3);
}

// Reviewer repro (revs-after-delete): revisions before vs after "Delete cloud copy" + re-register differ.
{
  const { d } = deps("pro");
  const named = (name) => updateBusiness(emptyWorkspace(), { name, upiId: "x@okaxis" }, T);
  await syncWorkspace(d.docs, OWNER, named("Primary"), T);
  await putIndex(d, index(meta("biz_bbbbbb01")));
  await putBook(d, OWNER, "biz_bbbbbb01", { workspace: named("Two"), expectedOwner: OWNER });
  assert.deepEqual((await getBookIndex(d, OWNER)).body.revs, { biz_primary: 1, biz_bbbbbb01: 1 });
  await deleteCloudCopy(d, OWNER);
  await putIndex(d, index(meta("biz_bbbbbb01")));
  assert.deepEqual((await getBookIndex(d, OWNER)).body.revs, { biz_primary: 2, biz_bbbbbb01: 2 });
  assert.deepEqual([...d.docs.docs.keys()], []);
}

// Reviewer repro (orphan-view): a book PUT whose refreshViews races the delete sweep leaves no snapshot behind.
{
  const { d } = deps("pro");
  await syncWorkspace(d.docs, OWNER, book("Primary", "p@okaxis"), T);
  await putIndex(d, index(meta("biz_bbbbbb01")));
  await putBook(d, OWNER, "biz_bbbbbb01", { workspace: book("Book Two", "two@okhdfc"), expectedOwner: OWNER });
  const link = await createBookLink(d, OWNER, "biz_bbbbbb01", { invoiceId: "inv_00000001" }, token, vpa);
  const realList = d.paylinks.list.bind(d.paylinks);
  let armed = true;
  d.paylinks.list = async (owner) => {
    const out = await realList(owner);
    if (armed) {
      armed = false; // another device deletes B after this sync listed B's links, before it writes their snapshots
      const del = await putIndex(d, index(meta("biz_bbbbbb01", 1, { deletedAt: 0 })));
      assert.equal(del.body.index.books.biz_bbbbbb01.purgedAt, T);
    }
    return out;
  };
  const r = await putBook(d, OWNER, "biz_bbbbbb01", { workspace: book("Book Two", "two@okhdfc"), expectedOwner: OWNER });
  d.paylinks.list = realList;
  assert.deepEqual([r.status, r.body.code], [410, "business_deleted"]);
  assert.equal(await d.paylinks.get(link.body.token), null);
  assert.deepEqual(await realList(OWNER), {});
  assert.equal(await d.paylinks.getView(OWNER, link.body.token), null, "no orphan snapshot (name, UPI ID, amount) remains");
  assert.deepEqual(await d.paylinks.viewTokens(OWNER), []);

  // Same for a link POST: an older link's snapshot rewritten during the race is dropped too.
  const e = deps("pro").d;
  await putIndex(e, index(meta("biz_cccccc01")));
  let ws3 = book("Three", "three@okaxis");
  ws3 = upsertInvoice(ws3, inv("inv_00000002", "C-2", 5000), T);
  await putBook(e, OWNER, "biz_cccccc01", { workspace: ws3, expectedOwner: OWNER });
  const older = await createBookLink(e, OWNER, "biz_cccccc01", { invoiceId: "inv_00000001" }, token, vpa);
  const realList2 = e.paylinks.list.bind(e.paylinks);
  let calls = 0;
  e.paylinks.list = async (owner) => {
    const out = await realList2(owner);
    if (++calls === 2) await putIndex(e, index(meta("biz_cccccc01", 1, { deletedAt: 0 }))); // refreshViews' list, after the new link's put
    return out;
  };
  const raced = await createBookLink(e, OWNER, "biz_cccccc01", { invoiceId: "inv_00000002" }, token, vpa);
  e.paylinks.list = realList2;
  assert.deepEqual([raced.status, raced.body.code], [410, "business_deleted"]);
  assert.deepEqual([await e.paylinks.get(older.body.token), await e.paylinks.get(raced.body.token)], [null, null]);
  assert.deepEqual([await realList2(OWNER), await e.paylinks.viewTokens(OWNER)], [{}, []]);
}

// Reviewer repro (add-budget): 60 business adds per account per day, charged per business, not per request.
{
  const { d } = deps("pro");
  let t = T;
  d.now = () => ++t;
  const consumeAdd = budget(60);
  let added = 0;
  const statuses = [];
  for (let round = 0; round < 60; round++) {
    const ids = Array.from({ length: 19 }, (_, i) => `biz_r${String(round).padStart(3, "0")}x${String(i).padStart(3, "0")}`);
    const r = await putBookIndex(d, OWNER, { index: { v: 1, books: Object.fromEntries(ids.map((id) => [id, meta(id)])) } }, consumeAdd);
    statuses.push(r.status);
    if (r.status !== 200) break;
    added += ids.length - r.body.rejected.length;
    await putBookIndex(d, OWNER, { index: { v: 1, books: Object.fromEntries(ids.map((id) => [id, meta(id, 1, { deletedAt: 0 })])) } }, consumeAdd);
  }
  assert.deepEqual([added, consumeAdd.left, statuses], [57, 3, [200, 200, 200, 429]], "3 × 19 = 57 adds, the 4th batch of 19 doesn't fit the 3 left");
  // A batch that fits the remainder is accepted; re-sending known or deleted ids costs nothing.
  const small = await putBookIndex(d, OWNER, { index: index(meta("biz_small001"), meta("biz_small002"), meta("biz_small003")) }, consumeAdd);
  assert.deepEqual([small.status, consumeAdd.left], [200, 0]);
  const again = await putBookIndex(d, OWNER, { index: index(meta("biz_small001"), meta("biz_r000x000")) }, consumeAdd);
  assert.deepEqual([again.status, consumeAdd.left, again.body.index.books.biz_r000x000.deletedAt > 0], [200, 0, true]);
  assert.equal((await putBookIndex(d, OWNER, { index: index(meta("biz_onemore01")) }, consumeAdd)).status, 429);
}

console.log("[books-server] Free limit 1, trial 3, paid Pro 20, read-only downgrade (402) and 503 on billing errors, owner checks, per-book slots and links, delete + cleanup retry, race undo, delete cloud copy");
