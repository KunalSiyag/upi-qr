// Browser storage for several businesses (src/lib/workspace/localStore.ts) against a fake Storage:
// the primary stays byte-compatible at proupiqr-workspace-v1, extra books never touch it, removal only
// through tombstones (unsynced changes set aside), the verified account-switch stash, backups V1/V2
// routed by identity, and the generator bridges.
import assert from "node:assert/strict";
import { installBrowser, storageEvent } from "./fake-storage.mjs";
import {
  ACTIVE_BOOK_KEY, BOOK_INDEX_KEY, BOOK_SYNC_KEY, BOOKS_UI, backupJson, bookKey, discardAside, discardStash, listAside, loadActiveBook, loadBook,
  loadIndex, loadShelf, loadStash, loadWorkspace, onShelfChange, OWNER_KEY, ownerChangedElsewhere, setAsideOtherAccountBooks, readSyncMeta, recordReceipt, removeBookStorage, restoreBackup,
  retireBook, saveBook, saveIndex, saveWorkspace, setAside, STASH_KEY, STASH_V2_KEY, sweepStrayBooks, switchAccountStorage, takePendingDocument,
  trackDocument, workspaceReturnUrl, WORKSPACE_KEY, writeSyncMeta, PENDING_DOCUMENT_KEY,
  cachedPlanLimit, keepAside, PLAN_LIMIT_KEY, readOnlyBookIds, savePlanLimit,
} from "../src/lib/workspace/localStore.ts";
import { addBook, bookHash, deleteBook, emptyIndex, liveBookIds, PRIMARY_BOOK_ID } from "../src/lib/workspace/books.ts";
import {
  canonicalJson, emptyWorkspace, liveInvoices, localToday, pruneTombstones, recordReceiptPayment, restoreFrom, sanitizeWorkspace, updateBusiness,
  upsertClient, upsertInvoice,
} from "../src/lib/workspace/model.ts";

const T = Date.UTC(2026, 9, 1);
const NOW = Date.UTC(2026, 9, 18, 6);
const B = "biz_bbbbbbbb";
const C = "biz_cccccccc";
const OWNER_A = "a".repeat(32);
const OWNER_B = "b".repeat(32);
const OWNER_C = "c".repeat(32);
const client = (id, name) => ({ id, name, phone: "", email: "", gstin: "", createdAt: T, updatedAt: T });
const inv = (id, number, clientId, amountPaise) => ({ id, number, clientId, issueDate: "2026-10-01", dueDate: "2026-10-15", amountPaise, description: "", payments: [], reminders: [], voided: false, createdAt: T, updatedAt: T });
const book = (name, upiId, amount = 300000) =>
  upsertInvoice(upsertClient(updateBusiness(emptyWorkspace(), { name, upiId }, T), client("cli_aaaaaaaa", "Rohan"), T), inv("inv_00000001", "INV-0001", "cli_aaaaaaaa", amount), T);
const json = (ws) => canonicalJson(pruneTombstones(ws, Date.now()));
/** A copy with one invoice the server never saw. */
const withUnsynced = (ws) => upsertInvoice(ws, inv("inv_0000000u", "INV-0099", "cli_aaaaaaaa", 12300), T + 50);
const indexWith = (...ids) => ids.reduce((index, id, i) => addBook(index, id, T + i), emptyIndex());

// PR 3/4 shipped with the business UI off, PR 5 turns it on: the flag-dependent checks below cover both.
assert.equal(typeof BOOKS_UI, "boolean");
assert.equal(bookKey(PRIMARY_BOOK_ID), "proupiqr-workspace-v1");
assert.equal(bookKey(B), "proupiqr-book-v1:biz_bbbbbbbb");

/* ---------- an existing single workspace loads exactly as before ---------- */
let store = installBrowser();
const primary = book("Sharma Tuition", "sharma@okaxis");
store.setItem(WORKSPACE_KEY, JSON.stringify(primary));
let { shelf, cloudOnly } = loadShelf();
assert.deepEqual(Object.keys(shelf.books), [PRIMARY_BOOK_ID]);
assert.deepEqual(shelf.index, emptyIndex());
assert.deepEqual(cloudOnly, []);
assert.equal(canonicalJson(shelf.books[PRIMARY_BOOK_ID]), canonicalJson(sanitizeWorkspace(primary)));
assert.equal(canonicalJson(loadWorkspace()), canonicalJson(sanitizeWorkspace(primary)));
assert.equal(saveWorkspace(shelf.books[PRIMARY_BOOK_ID]), true);
assert.equal(store.getItem(WORKSPACE_KEY), json(primary), "the primary stays canonical v1 JSON at the same key");
assert.deepEqual(Object.keys(store.snapshot()), [WORKSPACE_KEY], "loading and saving one book writes no new keys");
assert.equal(loadActiveBook(shelf.index), PRIMARY_BOOK_ID);

// First run: the primary borrows the invoice generator draft (unchanged), other books never seed.
store = installBrowser();
store.setItem("proupiqr-invoice-draft", JSON.stringify({ merchant: "Draft Shop", upiId: "draft@okaxis" }));
assert.equal(loadBook(PRIMARY_BOOK_ID).business.name, "Draft Shop");
assert.equal(loadBook(PRIMARY_BOOK_ID).business.upiId, "draft@okaxis");
assert.equal(loadBook(B), null);
// An unreadable primary is empty (today's behaviour); an unreadable extra book is missing, never empty.
store.setItem(WORKSPACE_KEY, "{oops");
assert.equal(canonicalJson(loadBook(PRIMARY_BOOK_ID)), canonicalJson(emptyWorkspace()));
store.setItem(bookKey(B), "{oops");
assert.equal(loadBook(B), null);

/* ---------- extra books: own keys, never the primary key ---------- */
store = installBrowser();
store.setItem(WORKSPACE_KEY, JSON.stringify(primary));
const two = book("Book Two", "two@okaxis", 450000);
let index = indexWith(B);
assert.equal(saveIndex({ ...index, owner: OWNER_A }), true);
const primaryBefore = store.getItem(WORKSPACE_KEY);
assert.equal(saveBook(index, B, two), true);
assert.equal(store.getItem(bookKey(B)), json(two));
assert.equal(store.getItem(WORKSPACE_KEY), primaryBefore, "saving Book Two never touches the primary key");
({ shelf } = loadShelf());
assert.deepEqual(Object.keys(shelf.books).sort(), [B, PRIMARY_BOOK_ID]);
assert.equal(shelf.index.owner, OWNER_A);
// Refusals: an id that isn't live, or one another tab tombstoned in the stored index.
assert.equal(saveBook(index, C, two), false);
assert.equal(store.getItem(bookKey(C)), null);
assert.equal(saveIndex({ ...deleteBook(index, B, NOW), owner: OWNER_A }), true);
assert.equal(saveBook(index, B, book("Stale tab", "two@okaxis")), false, "an open tab can't write a deleted book back");
assert.equal(store.getItem(bookKey(B)), json(two));
// saveIndex merges with the stored copy (same owner), so a tombstone from another tab is never lost.
assert.equal(saveIndex({ ...indexWith(B, C), owner: OWNER_A }), true);
const merged = JSON.parse(store.getItem(BOOK_INDEX_KEY));
assert.equal(merged.books[B].deletedAt, NOW);
assert.equal(merged.books[C].deletedAt, undefined);
assert.equal(merged.deleted, undefined, "the server-only deleted list is never stored");
// Removing storage never removes the primary.
removeBookStorage(PRIMARY_BOOK_ID);
assert.equal(store.getItem(WORKSPACE_KEY), primaryBefore);

// A damaged index is rebuilt from the book keys, so extra books never look like strays.
store.setItem(BOOK_INDEX_KEY, "not json");
assert.deepEqual(Object.keys(loadIndex().books).sort(), [B, PRIMARY_BOOK_ID]);

/* ---------- cloud-only books (§2.5) ---------- */
store = installBrowser();
store.setItem(BOOK_INDEX_KEY, JSON.stringify({ v: 1, owner: OWNER_A, books: { biz_primary: { id: "biz_primary", createdAt: 0 }, [B]: { id: B, createdAt: 5 }, [C]: { id: C, createdAt: 6 } } }));
writeSyncMeta(OWNER_A, B, 4, "deadbeef");
({ shelf, cloudOnly } = loadShelf());
assert.deepEqual(cloudOnly, [B], "a live id with sync meta and no key is cloud-only, never an empty book");
assert.equal(shelf.books[B], undefined);
assert.equal(shelf.books[C], undefined);
assert.deepEqual(readSyncMeta(), { owner: OWNER_A, books: { [B]: { rev: 4, hash: "deadbeef" } } });
writeSyncMeta(OWNER_B, PRIMARY_BOOK_ID, 1, "00000000");
assert.deepEqual(readSyncMeta(), { owner: OWNER_B, books: { biz_primary: { rev: 1, hash: "00000000" } } }, "another owner's meta is reset, never mixed");

/* ---------- set aside, retire (§2.4), strays ---------- */
store = installBrowser();
index = { ...indexWith(B, C), owner: OWNER_A };
saveIndex(index);
saveBook(index, B, two);
saveBook(index, C, book("Book Three", "three@okaxis"));
writeSyncMeta(OWNER_A, B, 3, bookHash(two));
// Synced (hash matches): removed.
assert.equal(retireBook(B, two, OWNER_A, false), "removed");
assert.equal(store.getItem(bookKey(B)), null);
assert.equal(readSyncMeta().books[B], undefined);
// Unsynced changes (no meta): set aside, then the key removed.
const three = loadBook(C);
assert.equal(retireBook(C, three, OWNER_A, false), "aside");
assert.equal(store.getItem(bookKey(C)), null);
let aside = listAside();
assert.equal(aside.length, 1);
assert.equal(aside[0].id, C);
assert.equal(aside[0].reason, "deleted_elsewhere");
assert.equal(aside[0].name, "Book Three");
assert.equal(canonicalJson(aside[0].workspace), canonicalJson(three));
discardAside(C);
assert.deepEqual(listAside(), []);
// Deleted on this device: removed even with unsynced changes.
saveIndex(index);
saveBook(index, C, three);
assert.equal(retireBook(C, three, OWNER_A, true), "removed");
assert.equal(store.getItem(bookKey(C)), null);
// The primary is never retired.
assert.equal(retireBook(PRIMARY_BOOK_ID, primary, OWNER_A, true), "kept");
// Quota: setting aside fails → the book key stays ("kept").
store = installBrowser({ fail: (key) => key.startsWith("proupiqr-aside-v1:") });
saveIndex(index);
saveBook(index, C, three);
assert.equal(setAside(C, "deleted_elsewhere", three), false);
assert.equal(retireBook(C, three, OWNER_A, false), "kept");
assert.equal(store.getItem(bookKey(C)), json(three));
assert.equal(store.getItem("proupiqr-aside-v1:" + C), null);
// Strays: keys whose id isn't live in the index; synced ones removed, unsynced ones set aside.
store = installBrowser();
store.setItem(OWNER_KEY, OWNER_A);
store.setItem(bookKey(B), json(two));
store.setItem(bookKey(C), json(three));
writeSyncMeta(OWNER_A, B, 2, bookHash(sanitizeWorkspace(JSON.parse(json(two)))));
assert.deepEqual(sweepStrayBooks(emptyIndex()).sort(), [B, C]);
assert.equal(store.getItem(bookKey(B)), null);
assert.deepEqual(listAside().map((a) => [a.id, a.reason]), [[C, "stray"]]);
assert.deepEqual(sweepStrayBooks(indexWith(B)), [], "live ids are never strays");

/* ---------- active book: the last-used live book while the business UI is on, else always the primary ---------- */
store = installBrowser();
store.setItem(ACTIVE_BOOK_KEY, B);
assert.equal(loadActiveBook(indexWith(B)), BOOKS_UI ? B : PRIMARY_BOOK_ID);
assert.equal(loadActiveBook(emptyIndex()), PRIMARY_BOOK_ID, "a stored id that isn't live falls back to the primary");
store.setItem(ACTIVE_BOOK_KEY, "biz_../x");
assert.equal(loadActiveBook(indexWith(B)), PRIMARY_BOOK_ID, "an invalid stored id falls back to the primary");

/* ---------- cross-tab (onShelfChange) ---------- */
store = installBrowser();
store.setItem(OWNER_KEY, OWNER_A);
index = { ...indexWith(B), owner: OWNER_A };
saveIndex(index);
saveBook(index, PRIMARY_BOOK_ID, primary);
saveBook(index, B, two);
let current = { index, books: { [PRIMARY_BOOK_ID]: primary, [B]: two } };
const seen = [];
let unsubscribe = onShelfChange(() => OWNER_A, () => current, {
  book: (id, ws) => seen.push(["book", id, ws]),
  index: (i) => seen.push(["index", i]),
  ownerChanged: () => seen.push(["owner"]),
});
// An old tab writes the primary: merged into this tab's primary; Book Two untouched.
const oldTab = upsertInvoice(primary, inv("inv_00000009", "INV-0009", "cli_aaaaaaaa", 99900), T + 5);
storageEvent(WORKSPACE_KEY, JSON.stringify(oldTab));
assert.equal(seen.length, 1);
assert.equal(seen[0][1], PRIMARY_BOOK_ID);
assert.ok(seen[0][2].invoices.inv_00000009 && seen[0][2].invoices.inv_00000001);
// Another tab edits Book Two.
storageEvent(bookKey(B), JSON.stringify(updateBusiness(two, { name: "Book Two Ltd" }, T + 9)));
assert.deepEqual([seen[1][0], seen[1][1], seen[1][2].business.name], ["book", B, "Book Two Ltd"]);
// Writes to an unknown id, or one tombstoned in the stored index, are ignored.
storageEvent(bookKey(C), JSON.stringify(two));
saveIndex({ ...deleteBook(index, B, NOW), owner: OWNER_A });
storageEvent(bookKey(B), JSON.stringify(two));
assert.equal(seen.length, 2);
// The index from another tab (same owner) is merged.
storageEvent(BOOK_INDEX_KEY, JSON.stringify({ ...indexWith(B, C), owner: OWNER_A }));
assert.equal(seen[2][0], "index");
assert.deepEqual(Object.keys(seen[2][1].books).sort(), [B, C, PRIMARY_BOOK_ID]);
// Another account takes over in another tab: owner change first, and later book writes are never merged.
store.setItem(OWNER_KEY, OWNER_B);
storageEvent(OWNER_KEY, OWNER_B);
storageEvent(WORKSPACE_KEY, JSON.stringify(book("Account B", "b@okaxis")));
assert.deepEqual(seen.slice(3).map((e) => e[0]), ["owner"]);
unsubscribe();
// Even when the primary's write arrives before the owner key's event, it is never merged.
store.setItem(OWNER_KEY, OWNER_A);
seen.length = 0;
unsubscribe = onShelfChange(() => OWNER_A, () => current, { book: (id) => seen.push(["book", id]), index: () => seen.push(["index"]), ownerChanged: () => seen.push(["owner"]) });
store.setItem(OWNER_KEY, OWNER_B);
storageEvent(WORKSPACE_KEY, JSON.stringify(book("Account B", "b@okaxis")));
assert.deepEqual(seen, [["owner"]]);
unsubscribe();
// An index tagged with another owner is an account switch, not a merge; guest tabs ignore owner changes.
seen.length = 0;
store.setItem(OWNER_KEY, OWNER_A);
unsubscribe = onShelfChange(() => OWNER_A, () => current, { book: () => seen.push(["book"]), index: () => seen.push(["index"]), ownerChanged: () => seen.push(["owner"]) });
storageEvent(BOOK_INDEX_KEY, JSON.stringify({ ...emptyIndex(), owner: OWNER_B }));
assert.deepEqual(seen, [["owner"]]);
unsubscribe();
seen.length = 0;
unsubscribe = onShelfChange(() => null, () => current, { book: () => seen.push(["book"]), index: () => seen.push(["index"]), ownerChanged: () => seen.push(["owner"]) });
store.setItem(OWNER_KEY, OWNER_B);
storageEvent(OWNER_KEY, OWNER_B);
assert.deepEqual(seen, []);
unsubscribe();

/* ---------- account switch: move and verify (§3.6) ---------- */
function shelfOfA(opts) {
  const s = installBrowser(opts);
  s.setItem(OWNER_KEY, OWNER_A);
  const i = { ...indexWith(B, C), owner: OWNER_A };
  saveIndex(i);
  saveBook(i, PRIMARY_BOOK_ID, primary);
  saveBook(i, B, two);
  saveBook(i, C, three);
  return { s, i };
}
let { s: st, i: idxA } = shelfOfA();
const accountB = book("Account B Shop", "bshop@okaxis");
const rawB = st.getItem(bookKey(B));
const rawC = st.getItem(bookKey(C));
const rawPrimary = st.getItem(WORKSPACE_KEY);
assert.deepEqual(switchAccountStorage(OWNER_A, OWNER_B, idxA, accountB, NOW), { ok: true });
assert.equal(st.getItem("proupiqr-stash-v2:" + B), rawB);
assert.equal(st.getItem("proupiqr-stash-v2:" + C), rawC);
assert.equal(st.getItem(STASH_KEY), rawPrimary, "the primary is stashed as v1 JSON (old tabs can download it)");
assert.equal(st.getItem(bookKey(B)), null);
assert.equal(st.getItem(bookKey(C)), null);
assert.equal(st.getItem(WORKSPACE_KEY), json(accountB));
assert.equal(st.getItem(OWNER_KEY), OWNER_B);
assert.deepEqual(JSON.parse(st.getItem(STASH_V2_KEY)), { owner: OWNER_A, at: NOW, ids: [B, C] });
assert.deepEqual(JSON.parse(st.getItem(BOOK_INDEX_KEY)), { v: 1, owner: OWNER_B, books: { biz_primary: { id: "biz_primary", createdAt: 0 } } });
assert.deepEqual(JSON.parse(st.getItem(BOOK_SYNC_KEY)), { owner: OWNER_B, books: {} });
const stash = loadStash();
assert.equal(stash.owner, OWNER_A);
assert.deepEqual(Object.keys(stash.shelf.books).sort(), [B, C, PRIMARY_BOOK_ID]);
assert.equal(canonicalJson(stash.shelf.books[B]), canonicalJson(sanitizeWorkspace(two)));
// The stash download is the V2 writer: every business, the primary also as `workspace`.
const stashFile = JSON.parse(backupJson(stash.shelf, "all", "2026-10-18T00:00:00.000Z"));
assert.equal(stashFile.formatVersion, 2);
assert.deepEqual(stashFile.businesses.map((b) => b.id), [PRIMARY_BOOK_ID, B, C]);
assert.equal(stashFile.workspace.business.name, "Sharma Tuition");
// A third account can't overwrite it: nothing moves, nothing is adopted.
const before = st.snapshot();
assert.deepEqual(switchAccountStorage(OWNER_B, OWNER_C, { ...emptyIndex(), owner: OWNER_B }, book("C", "c@okaxis"), NOW), { ok: false, reason: "occupied" });
assert.deepEqual(st.snapshot(), before);
discardStash();
assert.equal(loadStash(), null);
assert.equal(st.getItem(STASH_V2_KEY), null);
assert.equal(st.getItem("proupiqr-stash-v2:" + B), null);
// A stash from older code (no owner) that belongs to neither account is never overwritten or dropped, and never
// blocks: it is kept as a set-aside business to download or discard, and the switch goes ahead.
const unknownStash = book("Unknown account", "x@okaxis");
st.setItem(STASH_KEY, json(unknownStash));
assert.deepEqual(switchAccountStorage(OWNER_B, OWNER_C, { ...emptyIndex(), owner: OWNER_B }, book("C", "c@okaxis"), NOW), { ok: true });
let kept = listAside();
assert.equal(kept.length, 1);
assert.deepEqual([kept[0].reason, kept[0].name, canonicalJson(kept[0].workspace)], ["other_account", "Unknown account", canonicalJson(sanitizeWorkspace(unknownStash))]);
assert.equal(sanitizeWorkspace(JSON.parse(st.getItem(STASH_KEY))).business.name, "Account B Shop", "the slot now holds the previous account (B)");
assert.equal(JSON.parse(st.getItem(STASH_V2_KEY)).owner, OWNER_B);
assert.equal(st.getItem(OWNER_KEY), OWNER_C);

/* R1: A → B → A on one device. A's own stash is given back (merged into A's copy), B's data takes the slot. */
{
  const s = installBrowser();
  s.setItem(OWNER_KEY, OWNER_A);
  let i = { ...indexWith(B), owner: OWNER_A };
  saveIndex(i);
  const aLocal = withUnsynced(primary);
  saveBook(i, PRIMARY_BOOK_ID, aLocal);
  saveBook(i, B, two);
  const bServer = book("Account B Shop", "bshop@okaxis");
  assert.deepEqual(switchAccountStorage(OWNER_A, OWNER_B, i, bServer, NOW), { ok: true });
  // Back to A: A's server copy doesn't have the unsynced invoice; the stash does.
  const aServer = sanitizeWorkspace(primary);
  assert.deepEqual(switchAccountStorage(OWNER_B, OWNER_A, { ...emptyIndex(), owner: OWNER_B }, aServer, NOW + 1), { ok: true });
  const installed = sanitizeWorkspace(JSON.parse(s.getItem(WORKSPACE_KEY)));
  assert.deepEqual(Object.keys(installed.invoices).sort(), ["inv_00000001", "inv_0000000u"], "A's unsynced invoice is back in A's primary");
  assert.equal(installed.business.name, "Sharma Tuition");
  assert.equal(s.getItem(bookKey(B)), json(two), "A's second business is back in its own key");
  assert.equal(s.getItem("proupiqr-stash-v2:" + B), null);
  assert.deepEqual(liveBookIds(JSON.parse(s.getItem(BOOK_INDEX_KEY))), [PRIMARY_BOOK_ID, B]);
  assert.equal(JSON.parse(s.getItem(BOOK_INDEX_KEY)).owner, OWNER_A);
  assert.equal(s.getItem(OWNER_KEY), OWNER_A);
  assert.deepEqual(JSON.parse(s.getItem(STASH_V2_KEY)), { owner: OWNER_B, at: NOW + 1, ids: [] });
  assert.equal(sanitizeWorkspace(JSON.parse(s.getItem(STASH_KEY))).business.name, "Account B Shop", "B's data is now the one set aside");
  assert.deepEqual(listAside(), []);
}

/* R2: a stash written by today's client (no owner) is matched by business: back to its own account it is merged in. */
{
  const s = installBrowser();
  s.setItem(OWNER_KEY, OWNER_B);
  s.setItem(WORKSPACE_KEY, json(book("Account B Shop", "bshop@okaxis")));
  s.setItem(STASH_KEY, json(withUnsynced(primary)));
  assert.deepEqual(switchAccountStorage(OWNER_B, OWNER_A, emptyIndex(), sanitizeWorkspace(primary), NOW), { ok: true });
  assert.deepEqual(Object.keys(sanitizeWorkspace(JSON.parse(s.getItem(WORKSPACE_KEY))).invoices).sort(), ["inv_00000001", "inv_0000000u"]);
  assert.equal(sanitizeWorkspace(JSON.parse(s.getItem(STASH_KEY))).business.name, "Account B Shop");
  assert.deepEqual(JSON.parse(s.getItem(STASH_V2_KEY)), { owner: OWNER_B, at: NOW, ids: [] });
  assert.deepEqual(listAside(), []);
  // An ownerless stash that matches the previous account is merged with what is set aside now.
  const s2 = installBrowser();
  s2.setItem(OWNER_KEY, OWNER_B);
  s2.setItem(WORKSPACE_KEY, json(book("Account B Shop", "bshop@okaxis")));
  s2.setItem(STASH_KEY, json(withUnsynced(book("Account B Shop", "bshop@okaxis"))));
  assert.deepEqual(switchAccountStorage(OWNER_B, OWNER_C, emptyIndex(), book("C", "c@okaxis"), NOW), { ok: true });
  assert.deepEqual(Object.keys(sanitizeWorkspace(JSON.parse(s2.getItem(STASH_KEY))).invoices).sort(), ["inv_00000001", "inv_0000000u"]);
  assert.deepEqual(listAside(), []);
}

/* R3: rollback under exact quota (room for one stash copy, not the primary's stash): the book is back, no duplicate. */
{
  const s = installBrowser();
  s.setItem(OWNER_KEY, OWNER_A);
  const i = { ...indexWith(B), owner: OWNER_A };
  saveIndex(i);
  saveBook(i, PRIMARY_BOOK_ID, book("Primary " + "x".repeat(4000), "p@okaxis"));
  const small = book("Book Two", "two@okaxis");
  saveBook(i, B, small);
  const rawB = s.getItem(bookKey(B));
  const before = s.snapshot();
  let used = 0;
  for (const [k, v] of s.map) used += k.length + v.length;
  s.quota = used + ("proupiqr-stash-v2:" + B).length + rawB.length;
  assert.deepEqual(switchAccountStorage(OWNER_A, OWNER_B, i, book("B Shop", "bshop@okaxis"), NOW), { ok: false, reason: "storage" });
  assert.deepEqual(s.snapshot(), before, "storage byte-identical after the rollback");
}

/* R3b: the new primary doesn't fit; the stash copies fill the room the book needs to come back. */
{
  const s = installBrowser();
  s.setItem(OWNER_KEY, OWNER_A);
  const i = { ...indexWith(B), owner: OWNER_A };
  saveIndex(i);
  saveBook(i, PRIMARY_BOOK_ID, book("Primary A", "p@okaxis"));
  saveBook(i, B, book("Book Two " + "y".repeat(3000), "two@okaxis"));
  const rawB = s.getItem(bookKey(B));
  const rawP = s.getItem(WORKSPACE_KEY);
  const before = s.snapshot();
  let used = 0;
  for (const [k, v] of s.map) used += k.length + v.length;
  s.quota = used + rawB.length + rawP.length + 150;
  assert.deepEqual(switchAccountStorage(OWNER_A, OWNER_B, i, book("B Shop " + "z".repeat(6000), "bshop@okaxis"), NOW), { ok: false, reason: "storage" });
  assert.equal(s.getItem(bookKey(B)), rawB, "Book Two is back in its key");
  assert.equal(s.getItem("proupiqr-stash-v2:" + B), null);
  assert.equal(s.getItem(OWNER_KEY), OWNER_A);
  assert.deepEqual(s.snapshot(), before);
  // Even tighter: no room at all to write the book key back while its stash copy exists → the copy is freed first.
  const s3 = installBrowser();
  s3.setItem(OWNER_KEY, OWNER_A);
  saveIndex(i);
  saveBook(i, PRIMARY_BOOK_ID, book("Primary A", "p@okaxis"));
  saveBook(i, B, book("Book Two " + "y".repeat(3000), "two@okaxis"));
  const before3 = s3.snapshot();
  used = 0;
  for (const [k, v] of s3.map) used += k.length + v.length;
  s3.quota = used + 1 + s3.getItem(WORKSPACE_KEY).length + STASH_KEY.length + 80;
  assert.deepEqual(switchAccountStorage(OWNER_A, OWNER_B, i, book("B Shop " + "z".repeat(6000), "bshop@okaxis"), NOW), { ok: false, reason: "storage" });
  assert.deepEqual(s3.snapshot(), before3);
}
// Storage full while stashing the second book: everything moved is restored and the old owner kept.
({ s: st, i: idxA } = shelfOfA({ fail: (key) => key === "proupiqr-stash-v2:" + C }));
const full = st.snapshot();
assert.deepEqual(switchAccountStorage(OWNER_A, OWNER_B, idxA, accountB, NOW), { ok: false, reason: "storage" });
assert.deepEqual(st.snapshot(), full, "a failed switch leaves storage byte-identical");
// Storage full when the new primary is written: same.
({ s: st, i: idxA } = shelfOfA());
const full2 = st.snapshot();
st.fail = (key, value) => key === WORKSPACE_KEY && value.includes("Account B Shop");
assert.deepEqual(switchAccountStorage(OWNER_A, OWNER_B, idxA, accountB, NOW), { ok: false, reason: "storage" });
assert.deepEqual(st.snapshot(), full2);
// Switching again with a stash of the same previous account merges into it.
({ s: st, i: idxA } = shelfOfA());
assert.equal(switchAccountStorage(OWNER_A, OWNER_B, idxA, accountB, NOW).ok, true);
st.setItem(OWNER_KEY, OWNER_A);
st.setItem(WORKSPACE_KEY, json(upsertInvoice(primary, inv("inv_00000007", "INV-0007", "cli_aaaaaaaa", 70000), T + 7)));
assert.equal(switchAccountStorage(OWNER_A, OWNER_B, { ...emptyIndex(), owner: OWNER_A }, accountB, NOW).ok, true);
const mergedStash = sanitizeWorkspace(JSON.parse(st.getItem(STASH_KEY)));
assert.deepEqual(Object.keys(mergedStash.invoices).sort(), ["inv_00000001", "inv_00000007"]);
assert.deepEqual(JSON.parse(st.getItem(STASH_V2_KEY)).ids, [B, C], "earlier stashed books stay listed");

/* Review round 2: the give-back path never overwrites a stash before what replaces it verified. */
{
  // Storage already full; the signing-in account (B) has its own stash here with unsynced invoices.
  const s = installBrowser();
  s.setItem(OWNER_KEY, OWNER_A);
  saveIndex({ ...emptyIndex(), owner: OWNER_A });
  saveBook({ ...emptyIndex(), owner: OWNER_A }, PRIMARY_BOOK_ID, book("A shop", "a@okaxis"));
  const bStash = withUnsynced(book("B shop", "bshop@okaxis"));
  s.setItem(STASH_KEY, json(bStash));
  s.setItem(STASH_V2_KEY, JSON.stringify({ owner: OWNER_B, at: 1, ids: [] }));
  const before = s.snapshot();
  let used = 0;
  for (const [k, v] of s.map) used += k.length + v.length;
  s.quota = used;
  const bServer = upsertInvoice(book("B shop", "bshop@okaxis"), inv("inv_000000b9", "B-9", "cli_aaaaaaaa", 900), T + 9);
  assert.deepEqual(switchAccountStorage(OWNER_A, OWNER_B, { ...emptyIndex(), owner: OWNER_A }, bServer, NOW), { ok: false, reason: "storage" });
  assert.deepEqual(s.snapshot(), before, "nothing changed: B's stash payload and meta still agree");
  // With room again, the retry gives B its own invoices back and sets A's data aside under A.
  s.quota = Infinity;
  assert.deepEqual(switchAccountStorage(OWNER_A, OWNER_B, { ...emptyIndex(), owner: OWNER_A }, bServer, NOW + 1), { ok: true });
  assert.deepEqual(Object.keys(sanitizeWorkspace(JSON.parse(s.getItem(WORKSPACE_KEY))).invoices).sort(), ["inv_00000001", "inv_0000000u", "inv_000000b9"]);
  assert.equal(sanitizeWorkspace(JSON.parse(s.getItem(STASH_KEY))).business.name, "A shop");
  assert.equal(JSON.parse(s.getItem(STASH_V2_KEY)).owner, OWNER_A);
  assert.deepEqual(listAside(), []);
}
{
  // An ownerless stash is never attributed by name: "Kirana Store" (real UPI ID) is not merged into account C's
  // "Kirana Store" without a UPI ID; it is kept as a set-aside first business, downloadable as a plain backup.
  const s = installBrowser();
  s.setItem(OWNER_KEY, OWNER_B);
  s.setItem(WORKSPACE_KEY, json(book("Gupta Traders", "gupta@okhdfc")));
  const kirana = upsertInvoice(book("Kirana Store", "xperson@okicici"), inv("inv_0000000x", "X-1", "cli_aaaaaaaa", 100), T + 3);
  s.setItem(STASH_KEY, json(kirana));
  const cServer = updateBusiness(emptyWorkspace(), { name: "Kirana Store", upiId: "" }, T);
  assert.deepEqual(switchAccountStorage(OWNER_B, OWNER_C, { ...emptyIndex(), owner: OWNER_B }, cServer, NOW), { ok: true });
  assert.deepEqual(Object.keys(sanitizeWorkspace(JSON.parse(s.getItem(WORKSPACE_KEY))).invoices), [], "C gets only its own copy");
  const aside = listAside();
  assert.deepEqual(aside.map((a) => [a.reason, a.name, a.fromPrimary, Object.keys(a.workspace.invoices).sort().join(",")]), [["other_account", "Kirana Store", true, "inv_00000001,inv_0000000x"]]);
  assert.equal(sanitizeWorkspace(JSON.parse(s.getItem(STASH_KEY))).business.name, "Gupta Traders");
  assert.equal(JSON.parse(s.getItem(STASH_V2_KEY)).owner, OWNER_B);
  // Same for the previous account: a name match alone is no evidence.
  const s2 = installBrowser();
  s2.setItem(OWNER_KEY, OWNER_B);
  s2.setItem(WORKSPACE_KEY, json(book("Kirana Store", "")));
  s2.setItem(STASH_KEY, json(kirana));
  assert.deepEqual(switchAccountStorage(OWNER_B, OWNER_C, { ...emptyIndex(), owner: OWNER_B }, book("C", "c@okaxis"), NOW), { ok: true });
  assert.equal(listAside().length, 1);
  assert.ok(!s2.getItem(STASH_KEY).includes("inv_0000000x"), "never merged into B's stash");
}

/* R7 (storage side): books left behind by another account are set aside, the index reset for the signed-in account. */
{
  const s = installBrowser();
  s.setItem(OWNER_KEY, OWNER_B);
  const i = { ...indexWith(B), owner: OWNER_A };
  saveIndex(i);
  saveBook(i, B, two);
  assert.equal(setAsideOtherAccountBooks(i, OWNER_B), true);
  assert.equal(s.getItem(bookKey(B)), null);
  assert.deepEqual(listAside().map((a) => [a.id, a.reason, a.name]), [[B, "other_account", "Book Two"]]);
  assert.deepEqual(JSON.parse(s.getItem(BOOK_INDEX_KEY)), { v: 1, owner: OWNER_B, books: { biz_primary: { id: "biz_primary", createdAt: 0 } } });
  // Quota: nothing is removed when it can't be set aside.
  const s2 = installBrowser({ fail: (key) => key.startsWith("proupiqr-aside-v1:") });
  saveIndex(i);
  saveBook(i, B, two);
  assert.equal(setAsideOtherAccountBooks(i, OWNER_B), false);
  assert.equal(s2.getItem(bookKey(B)), json(two));
  // The tab guard: another tab moved the device to another account.
  s2.setItem(OWNER_KEY, OWNER_B);
  assert.deepEqual([ownerChangedElsewhere(OWNER_A), ownerChangedElsewhere(OWNER_B), ownerChangedElsewhere(null)], [true, false, false]);
}

/* ---------- backups (§2.3) ---------- */
store = installBrowser();
const shelf2 = { index: indexWith(B), books: { [PRIMARY_BOOK_ID]: sanitizeWorkspace(primary), [B]: sanitizeWorkspace(two) } };
const AT = "2026-10-18T00:00:00.000Z";
const v1 = JSON.parse(backupJson(shelf2, { book: PRIMARY_BOOK_ID }, AT));
assert.deepEqual(Object.keys(v1), ["app", "exportedAt", "businessId", "workspace"]);
assert.deepEqual([v1.app, v1.businessId, v1.workspace.business.name], ["proupiqr-workspace", PRIMARY_BOOK_ID, "Sharma Tuition"]);
const bookFile = JSON.parse(backupJson(shelf2, { book: B }, AT));
assert.deepEqual([bookFile.app, bookFile.formatVersion, bookFile.businesses.length, bookFile.businesses[0].id], ["proupiqr-business", 2, 1, B]);
assert.equal(bookFile.workspace, undefined);
const v2 = JSON.parse(backupJson(shelf2, "all", AT));
assert.deepEqual([v2.app, v2.formatVersion, v2.businesses.map((b) => b.id)], ["proupiqr-workspace", 2, [PRIMARY_BOOK_ID, B]]);
assert.equal(v2.workspace.business.name, "Sharma Tuition");
const single = { index: emptyIndex(), books: { [PRIMARY_BOOK_ID]: sanitizeWorkspace(primary) } };
assert.equal(JSON.parse(backupJson(single, "all", AT)).formatVersion, undefined, "one book: 'all' is the plain V1 file");
// Old readers (today's restoreBackup: app check, then `workspace`): a per-book file is refused, a V2 file gives the primary.
const oldReader = (text) => {
  const parsed = JSON.parse(text);
  if (parsed?.app !== "proupiqr-workspace") throw new Error("Not a Pro UPI QR workspace backup.");
  return sanitizeWorkspace(parsed.workspace);
};
assert.throws(() => oldReader(backupJson(shelf2, { book: B })), /Not a Pro UPI QR workspace backup/);
assert.equal(oldReader(backupJson(shelf2, "all")).business.name, "Sharma Tuition");
assert.equal(canonicalJson(oldReader(backupJson(shelf2, { book: PRIMARY_BOOK_ID }))), canonicalJson(sanitizeWorkspace(primary)));
assert.throws(() => restoreBackup(single, JSON.stringify({ app: "other" }), PRIMARY_BOOK_ID, 1, NOW), /Not a Pro UPI QR workspace backup/);
assert.throws(() => restoreBackup(single, "{nope", PRIMARY_BOOK_ID, 1, NOW));

// One book, an untagged V1 file with the same (or no) UPI ID: merged exactly as before.
const erased = { index: emptyIndex(), books: { [PRIMARY_BOOK_ID]: emptyWorkspace() } };
const untagged = JSON.stringify({ app: "proupiqr-workspace", workspace: primary });
let result = restoreBackup(erased, untagged, PRIMARY_BOOK_ID, 1, NOW);
assert.equal(result.kind, "done");
assert.deepEqual([result.restored, result.skipped, result.into], [1, 0, [PRIMARY_BOOK_ID]]);
assert.equal(canonicalJson(result.shelf.books[PRIMARY_BOOK_ID]), canonicalJson(restoreFrom(emptyWorkspace(), sanitizeWorkspace(primary), NOW)));
assert.equal(result.shelf.index, erased.index, "no new books");
result = restoreBackup(single, untagged, PRIMARY_BOOK_ID, 1, NOW);
assert.equal(result.kind, "done");
// A backup of another UPI ID asks first (names both businesses), and Cancel leaves everything as it was.
const otherBiz = JSON.stringify({ app: "proupiqr-workspace", workspace: book("Gupta Stores", "gupta@okhdfc") });
result = restoreBackup(single, otherBiz, PRIMARY_BOOK_ID, 1, NOW);
assert.equal(result.kind, "confirm");
assert.deepEqual([result.target, result.active, result.backup], [PRIMARY_BOOK_ID, PRIMARY_BOOK_ID, { name: "Gupta Stores", upiId: "gupta@okhdfc" }]);
const applied = result.apply();
assert.deepEqual([applied.kind, applied.into], ["done", [PRIMARY_BOOK_ID]]);
// A tagged primary backup while another book is active: confirm.
result = restoreBackup(shelf2, backupJson(shelf2, { book: PRIMARY_BOOK_ID }), B, 20, NOW);
assert.deepEqual([result.kind, result.target, result.active], ["confirm", PRIMARY_BOOK_ID, B]);
// R4: a V2 file from another account (its first business is biz_primary too, with another UPI ID) asks first.
const otherAccount = { index: indexWith(B), books: { [PRIMARY_BOOK_ID]: book("Other Account Shop", "other@okaxis"), [B]: book("Other 2", "o2@okaxis") } };
result = restoreBackup(single, backupJson(otherAccount, "all"), PRIMARY_BOOK_ID, 1, NOW);
assert.deepEqual([result.kind, result.target, result.backup], ["confirm", PRIMARY_BOOK_ID, { name: "Other Account Shop", upiId: "other@okaxis" }]);
const forced = result.apply();
assert.deepEqual([forced.restored, forced.skipped, forced.into], [1, 1, [PRIMARY_BOOK_ID]]);
// R5: today's untagged V1 backup of the same business merges straight in.
result = restoreBackup(single, JSON.stringify({ app: "proupiqr-workspace", exportedAt: "x", workspace: withUnsynced(primary) }), PRIMARY_BOOK_ID, 1, NOW);
assert.equal(result.kind, "done");
assert.ok(result.shelf.books[PRIMARY_BOOK_ID].invoices.inv_0000000u);
// Untagged, UPI ID of Book Two while the primary is active: routed to Book Two, confirmed first.
result = restoreBackup(shelf2, JSON.stringify({ app: "proupiqr-workspace", workspace: two }), PRIMARY_BOOK_ID, 20, NOW);
assert.deepEqual([result.kind, result.target], ["confirm", B]);
assert.deepEqual(result.apply().into, [B]);
// V2 while the business UI is off: only books that exist locally; others skipped, never created.
const v2Text = JSON.stringify({ app: "proupiqr-workspace", formatVersion: 2, exportedAt: AT, workspace: primary,
  businesses: [{ id: PRIMARY_BOOK_ID, workspace: primary }, { id: B, workspace: two }, { id: C, workspace: three }] });
result = restoreBackup(shelf2, v2Text, PRIMARY_BOOK_ID, 20, NOW, false);
assert.deepEqual([result.kind, result.restored, result.skipped, result.into], ["done", 2, 1, [PRIMARY_BOOK_ID, B]]);
assert.equal(result.shelf.index, shelf2.index);
result = restoreBackup(single, v2Text, PRIMARY_BOOK_ID, 20, NOW, false);
assert.deepEqual([result.restored, result.skipped, Object.keys(result.shelf.books)], [1, 2, [PRIMARY_BOOK_ID]]);
// With new books allowed (UI on): unknown and deleted ids become new ids, within the limit; a deleted id is never revived.
const withDeleted = { index: deleteBook(indexWith(B), B, NOW), books: { [PRIMARY_BOOK_ID]: sanitizeWorkspace(primary) } };
result = restoreBackup(withDeleted, v2Text, PRIMARY_BOOK_ID, 20, NOW, true);
assert.deepEqual([result.restored, result.skipped], [3, 0]);
const fresh = result.into.filter((id) => id !== PRIMARY_BOOK_ID);
assert.equal(fresh.length, 2);
assert.ok(!fresh.includes(B) && !fresh.includes(C), "restored into new ids");
assert.equal(result.shelf.index.books[B].deletedAt, NOW, "the deleted id stays deleted");
result = restoreBackup(withDeleted, v2Text, PRIMARY_BOOK_ID, 2, NOW, true);
assert.deepEqual([result.restored, result.skipped], [2, 1], "over the limit: skipped");
result = restoreBackup(withDeleted, v2Text, PRIMARY_BOOK_ID, 1, NOW, true);
assert.deepEqual([result.restored, result.skipped], [1, 2], "signed out (limit 1): only the primary");

/* ---------- generator bridges (§7.5) ---------- */
const receipt = { merchant: "Sharma Tuition", upiId: "sharma@okaxis", receiptNo: "R-1", date: "2026-10-12", customer: "Rohan", customerPhone: "", amountPaise: 100000, mode: "upi", reference: "", description: "" };
// One book: exactly today's result.
store = installBrowser();
store.setItem(WORKSPACE_KEY, json(primary));
const expected = recordReceiptPayment(sanitizeWorkspace(primary), receipt, localToday(), Date.now());
let saved = recordReceipt(receipt);
assert.deepEqual([saved.duplicate, saved.appliedPaise, saved.bookId], [false, expected.appliedPaise, PRIMARY_BOOK_ID]);
assert.equal(sanitizeWorkspace(JSON.parse(store.getItem(WORKSPACE_KEY))).invoices.inv_00000001.payments.length, 1);
assert.equal(workspaceReturnUrl("/app/?tab=invoices&filter=all&saved=receipt", saved), "/app/?tab=invoices&filter=all&saved=receipt");
// A fresh browser: the primary is seeded from the receipt, as before.
store = installBrowser();
saved = recordReceipt({ ...receipt, merchant: "New Shop", upiId: "new@okaxis" });
assert.equal(sanitizeWorkspace(JSON.parse(store.getItem(WORKSPACE_KEY))).business.name, "New Shop");
// Two books: a receipt with Book Two's UPI ID settles Book Two; the primary key stays byte-identical.
function twoBooks() {
  const s = installBrowser();
  const i = { ...indexWith(B), owner: OWNER_A };
  saveIndex(i);
  saveBook(i, PRIMARY_BOOK_ID, primary);
  saveBook(i, B, two);
  return s;
}
store = twoBooks();
let primaryRaw = store.getItem(WORKSPACE_KEY);
saved = recordReceipt({ ...receipt, merchant: "Book Two", upiId: " TWO@okaxis " });
assert.deepEqual([saved.bookId, saved.appliedPaise], [B, 100000]);
assert.equal(store.getItem(WORKSPACE_KEY), primaryRaw);
assert.equal(sanitizeWorkspace(JSON.parse(store.getItem(bookKey(B)))).invoices.inv_00000001.payments[0].amountPaise, 100000);
assert.equal(workspaceReturnUrl("/app/?tab=invoices", saved), BOOKS_UI ? `/app/?tab=invoices&business=${B}` : "/app/?tab=invoices", "?business= only once the business UI is on");
// With several businesses the URL names the first business too, so /app/ opens (and the toast names) the right one.
assert.equal(workspaceReturnUrl("/app/?tab=invoices", { bookId: PRIMARY_BOOK_ID }), BOOKS_UI ? `/app/?tab=invoices&business=${PRIMARY_BOOK_ID}` : "/app/?tab=invoices");
// An unmatched real UPI ID asks while the UI is on (the document waits in session storage); with the UI off it goes to
// the active book (the primary). Never a new book.
store = twoBooks();
saved = recordReceipt({ ...receipt, merchant: "Someone Else", upiId: "else@okicici" });
if (BOOKS_UI) {
  assert.deepEqual(saved, { pick: true });
  assert.equal(JSON.parse(globalThis.sessionStorage.getItem(PENDING_DOCUMENT_KEY)).receipt.upiId, "else@okicici");
  assert.equal(workspaceReturnUrl("/app/", saved), "/app/?pick=document");
  globalThis.sessionStorage.removeItem(PENDING_DOCUMENT_KEY);
} else {
  assert.equal(saved.bookId, PRIMARY_BOOK_ID);
  assert.equal(store.getItem(PENDING_DOCUMENT_KEY), null);
}
assert.deepEqual(Object.keys(JSON.parse(store.getItem(BOOK_INDEX_KEY)).books).sort(), [B, PRIMARY_BOOK_ID]);
// trackDocument with two books: a document named for Book Two but from another UPI ID never overwrites Book Two's INV-0001.
store = twoBooks();
primaryRaw = store.getItem(WORKSPACE_KEY);
const doc = { merchant: "Book Two", upiId: "other@okaxis", customer: "Rohan", invoiceNo: "INV-0001", invoiceDate: "2026-10-05", dueDate: "2026-10-20", totalPaise: 99900, description: "" };
const tracked = trackDocument(doc);
assert.deepEqual([tracked.bookId, tracked.created], [B, true]);
const twoAfter = sanitizeWorkspace(JSON.parse(store.getItem(bookKey(B))));
assert.equal(twoAfter.invoices.inv_00000001.amountPaise, 450000, "Book Two's INV-0001 untouched");
assert.equal(liveInvoices(twoAfter).length, 2);
assert.equal(store.getItem(WORKSPACE_KEY), primaryRaw);
// Same UPI ID: updated by number, as before.
const same = trackDocument({ ...doc, upiId: "two@okaxis" });
assert.deepEqual([same.bookId, same.created], [B, false]);
// One book: today's overwrite-by-number behaviour, whatever the UPI ID.
store = installBrowser();
store.setItem(WORKSPACE_KEY, json(primary));
const one = trackDocument({ ...doc, merchant: "Sharma Tuition", upiId: "other@okaxis" });
assert.deepEqual([one.bookId, one.invoiceId, one.created], [PRIMARY_BOOK_ID, "inv_00000001", false]);
assert.equal(trackDocument({ ...doc, totalPaise: 0 }), null);
// The picker's pending document (session storage) is read once.
globalThis.sessionStorage.setItem(PENDING_DOCUMENT_KEY, JSON.stringify({ kind: "receipt", receipt }));
assert.equal(takePendingDocument().receipt.receiptNo, "R-1");
assert.equal(takePendingDocument(), null);
assert.equal(workspaceReturnUrl("/app/", { pick: true }), "/app/?pick=document");

/* ---------- review fixes (PR 4/5): read-only businesses, plan-limit cache, restores, bridges, aside reasons ---------- */
{
  // The last known limit is kept per account and read only for that account.
  const s = installBrowser();
  assert.equal(cachedPlanLimit(OWNER_A), null);
  savePlanLimit(OWNER_A, 1);
  assert.equal(cachedPlanLimit(OWNER_A), 1);
  assert.equal(cachedPlanLimit(OWNER_B), null, "another account never inherits the limit");
  assert.equal(cachedPlanLimit(null), null);
  s.setItem(PLAN_LIMIT_KEY, JSON.stringify({ owner: OWNER_A, limit: 0 }));
  assert.equal(cachedPlanLimit(OWNER_A), null, "a nonsense limit is ignored");
  // Read-only = ranked past the limit, never the first business.
  const i3 = indexWith(B, C);
  assert.deepEqual([...readOnlyBookIds(i3, 1)].sort(), [B, C]);
  assert.deepEqual([...readOnlyBookIds(i3, 2)], [C]);
  assert.deepEqual([...readOnlyBookIds(i3, 20)], []);
  assert.deepEqual([...readOnlyBookIds(i3, null)], []);
}
{
  // A backup is never merged into a read-only business; the result names it.
  const shelf2 = { index: indexWith(B), books: { [PRIMARY_BOOK_ID]: sanitizeWorkspace(primary), [B]: sanitizeWorkspace(two) } };
  const extra = upsertInvoice(two, { ...two.invoices.inv_00000001, id: "inv_0000ro01", number: "INV-0099", amountPaise: 9900, createdAt: T + 9, updatedAt: T + 9 }, T + 9);
  const bookFile = JSON.stringify({ app: "proupiqr-business", formatVersion: 2, exportedAt: AT, businesses: [{ id: B, workspace: extra }] });
  let r = restoreBackup(shelf2, bookFile, B, 20, NOW, true, new Set([B]));
  assert.deepEqual([r.kind, r.restored, r.blocked, r.into], ["done", 0, [B], []]);
  assert.equal(r.shelf.books[B], shelf2.books[B], "the read-only business is untouched");
  r = restoreBackup(shelf2, bookFile, PRIMARY_BOOK_ID, 20, NOW, true, new Set([B]));
  assert.deepEqual([r.kind, r.blocked], ["done", [B]], "no confirm offered into a read-only business");
  const all = JSON.stringify({ app: "proupiqr-workspace", formatVersion: 2, exportedAt: AT, workspace: primary, businesses: [{ id: PRIMARY_BOOK_ID, workspace: primary }, { id: B, workspace: extra }] });
  r = restoreBackup(shelf2, all, PRIMARY_BOOK_ID, 20, NOW, true, new Set([B]));
  assert.deepEqual([r.restored, r.blocked, r.into], [1, [B], [PRIMARY_BOOK_ID]]);
  // A single business that isn't one of this account's asks before it is added (never a silent add).
  const single = { index: emptyIndex(), books: { [PRIMARY_BOOK_ID]: sanitizeWorkspace(primary) } };
  r = restoreBackup(single, bookFile, PRIMARY_BOOK_ID, 20, NOW, true);
  assert.equal(r.kind, "confirm");
  assert.equal(r.newBusiness, true);
  assert.deepEqual([r.backup.name, r.backup.upiId], ["Book Two", "two@okaxis"]);
  const added = r.apply();
  assert.equal(added.restored, 1);
  assert.equal(liveBookIds(added.shelf.index).length, 2);
  assert.ok(!liveBookIds(added.shelf.index).includes(B), "added under a fresh id");
  // At the limit (Free, or a trial): nothing to ask, the business is skipped and counted.
  r = restoreBackup(single, bookFile, PRIMARY_BOOK_ID, 1, NOW, true);
  assert.deepEqual([r.kind, r.restored, r.skipped], ["done", 0, 1]);
  // A deleted id is never offered back.
  r = restoreBackup({ index: deleteBook(indexWith(B), B, NOW), books: single.books }, bookFile, PRIMARY_BOOK_ID, 20, NOW, true);
  assert.notEqual(r.newBusiness, true);
}
if (BOOKS_UI) {
  // Bridges never write into a read-only business (the cached limit says which): the user is asked instead.
  const s = twoBooks();
  s.setItem(OWNER_KEY, OWNER_A);
  savePlanLimit(OWNER_A, 1);
  const before = s.getItem(bookKey(B));
  const asked = trackDocument({ merchant: "Book Two", upiId: "two@okaxis", customer: "Rohan", invoiceNo: "BT-0777", invoiceDate: "2026-10-05", dueDate: "2026-10-20", totalPaise: 4321, description: "" });
  assert.deepEqual(asked, { pick: true });
  assert.equal(s.getItem(bookKey(B)), before, "nothing written into the read-only business");
  globalThis.sessionStorage.removeItem(PENDING_DOCUMENT_KEY);
  // The active business read-only + an empty UPI ID (normally "the active one"): asked too.
  s.setItem(ACTIVE_BOOK_KEY, B);
  assert.deepEqual(recordReceipt({ ...receipt, merchant: "", upiId: "" }), { pick: true });
  globalThis.sessionStorage.removeItem(PENDING_DOCUMENT_KEY);
  // The first business is never read-only: a document for it is saved, and the URL names it.
  const saved = recordReceipt(receipt);
  assert.equal(saved.bookId, PRIMARY_BOOK_ID);
  assert.equal(workspaceReturnUrl("/app/?saved=receipt", saved), `/app/?saved=receipt&business=${PRIMARY_BOOK_ID}`);
  // One business on this device: the URL stays as before.
  const one = installBrowser();
  one.setItem(WORKSPACE_KEY, json(primary));
  assert.equal(workspaceReturnUrl("/app/?saved=receipt", { bookId: PRIMARY_BOOK_ID }), "/app/?saved=receipt");
}
{
  // keepAside leaves the book in place; the read-only reason survives a round trip.
  const s = installBrowser();
  const i = indexWith(B);
  saveIndex(i);
  saveBook(i, B, two);
  assert.equal(keepAside(B, "read_only", two), true);
  assert.ok(s.getItem(bookKey(B)), "the book itself stays");
  assert.deepEqual(listAside().map((a) => [a.id, a.reason]), [[B, "read_only"]]);
  assert.equal(keepAside(PRIMARY_BOOK_ID, "read_only", primary), false, "the first business is never set aside this way");
}

console.log("[shelf] local storage, removal, account-switch stash, backups and bridges: all checks passed");
