// Browser storage for several businesses (src/lib/workspace/localStore.ts) against a fake Storage:
// the primary stays byte-compatible at proupiqr-workspace-v1, extra books never touch it, removal only
// through tombstones (unsynced changes set aside), the verified account-switch stash, backups V1/V2
// routed by identity, and the generator bridges.
import assert from "node:assert/strict";
import { installBrowser, storageEvent } from "./fake-storage.mjs";
import {
  ACTIVE_BOOK_KEY, BOOK_INDEX_KEY, BOOK_SYNC_KEY, BOOKS_UI, backupJson, bookKey, discardAside, discardStash, listAside, loadActiveBook, loadBook,
  loadIndex, loadShelf, loadStash, loadWorkspace, onShelfChange, OWNER_KEY, ownerChangedElsewhere, setAsideOtherAccountBooks, readSyncMeta, recordReceipt, removeBookStorage, restoreBackup,
  retireBook, saveBook, saveIndex, saveWorkspace, setAside, STASH_KEY, STASH_V2_KEY, sweepStrayBooks, sweepStrayIntl, switchAccountStorage, takePendingDocument,
  trackDocument, workspaceReturnUrl, WORKSPACE_KEY, writeSyncMeta, PENDING_DOCUMENT_KEY,
  cachedPlanLimit, keepAside, markBookReset, PLAN_LIMIT_KEY, readOnlyBookIds, savePlanLimit, BOOK_RESET_KEY,
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

{
  // Another tab replaced a read-only business with the server's copy (its device-only changes set aside):
  // this tab replaces its copy too instead of merging the set-aside changes back. Ordinary writes still merge.
  const s = installBrowser();
  s.setItem(OWNER_KEY, OWNER_A);
  const i = { ...indexWith(B), owner: OWNER_A };
  saveIndex(i);
  const local = upsertInvoice(two, inv("inv_00000777", "TS-0777", "cli_aaaaaaaa", 77700), T + 7);
  saveBook(i, B, local);
  const events = [];
  const off = onShelfChange(() => OWNER_A, () => ({ index: i, books: { [PRIMARY_BOOK_ID]: primary, [B]: local } }), {
    book: (id, ws, replace) => events.push([id, ws, replace === true]), index: () => {}, ownerChanged: () => {},
  });
  storageEvent(bookKey(B), JSON.stringify(updateBusiness(two, { name: "Merged" }, T + 9)));
  assert.equal(events[0][2], false, "an ordinary write merges");
  assert.ok(events[0][1].invoices.inv_00000777, "…keeping this tab's changes");
  markBookReset(B);
  assert.equal(JSON.parse(s.getItem(BOOK_RESET_KEY))[B], 1);
  storageEvent(bookKey(B), JSON.stringify(two));
  assert.equal(events[1][2], true, "after a reset the stored copy replaces this tab's copy");
  assert.equal(events[1][1].invoices.inv_00000777, undefined, "the set-aside invoice doesn't come back");
  storageEvent(bookKey(B), JSON.stringify(two));
  assert.equal(events[2][2], false, "one reset replaces once; later writes merge again");
  markBookReset(PRIMARY_BOOK_ID);
  assert.equal(JSON.parse(s.getItem(BOOK_RESET_KEY))[PRIMARY_BOOK_ID], undefined, "the first business is never reset this way");
  off();
}

/* =====================================================================================================
 * Clients abroad, PR 1 (docs/spec-foreign-clients.md §2): the owner-tagged sidecar, writeBookKeys, joined
 * loads, cross-tab, the switch paths, old-code switches, backups and the generator bridge.
 * ===================================================================================================== */
{
  const L = await import("../src/lib/workspace/localStore.ts");
  const M = await import("../src/lib/workspace/model.ts");
  const legacyModel = await import("./fixtures/legacy-model.ts");
  const legacyStore = await import("./fixtures/legacy-localStore.ts");
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const settings = { on: true, accountName: "Sharma Tuition LLP", bankName: "HDFC Bank", swift: "HDFCINBB", account: "GB82WEST12345698765432", bankDetails: "", payUrl: "", exportUnderLut: false, lutArn: "", lutFy: "", updatedAt: T };
  const foreign = (name, upiId, invoiceId = "inv_usd00001") => {
    const w = M.upsertInvoice(book(name, upiId), { ...inv(invoiceId, "INV-0002", "cli_aaaaaaaa", 120050), currency: "USD" }, T);
    return M.sanitizeWorkspace(clone({ ...w, intl: { ...w.intl, settings, clients: { cli_aaaaaaaa: { currency: "USD", updatedAt: T } } } }));
  };
  const intlKeys = (st) => Object.keys(st.snapshot()).filter((k) => k.startsWith("proupiqr-intl-v1:"));
  const oldBytes = (ws) => legacyModel.canonicalJson(legacyModel.pruneTombstones(legacyModel.sanitizeWorkspace(clone(ws)), Date.now()));
  assert.equal(L.intlKey(PRIMARY_BOOK_ID), "proupiqr-intl-v1:biz_primary");

  /* An INR-only book writes exactly today's bytes and no sidecar. */
  let st = installBrowser();
  st.setItem(OWNER_KEY, OWNER_A);
  assert.equal(saveWorkspace(primary), true);
  assert.equal(st.getItem(WORKSPACE_KEY), oldBytes(primary));
  assert.deepEqual(intlKeys(st), []);

  /* A foreign book splits into book key + sidecar; loadBook joins them. */
  st = installBrowser();
  st.setItem(OWNER_KEY, OWNER_A);
  const fp = foreign("Sharma Tuition", "sharma@okaxis");
  assert.equal(saveWorkspace(fp), true);
  assert.equal(st.getItem(WORKSPACE_KEY), oldBytes(fp), "the book key holds exactly what old code writes for the same data");
  assert.doesNotMatch(st.getItem(WORKSPACE_KEY), /"intl"|USD|HDFCINBB/);
  const side = JSON.parse(st.getItem(L.intlKey(PRIMARY_BOOK_ID)));
  assert.deepEqual([side.owner, side.intl.invoices.inv_usd00001.currency, side.intl.settings.swift], [OWNER_A, "USD", "HDFCINBB"]);
  assert.equal(canonicalJson(loadWorkspace()), canonicalJson(pruneTombstones(fp, Date.now())));
  assert.equal(canonicalJson(loadShelf().shelf.books[PRIMARY_BOOK_ID]), canonicalJson(pruneTombstones(fp, Date.now())));
  const writes = st.writes.length;
  assert.equal(saveWorkspace(loadWorkspace()), true);
  assert.equal(st.writes.length, writes, "saving the same book again writes nothing");
  // Removing the last foreign record drops the sidecar.
  saveWorkspace(M.withoutIntl(fp));
  assert.deepEqual(intlKeys(st), []);

  /* An old tab's write of the stripped book key: the sidecar stays, and no write loop. */
  st = installBrowser();
  st.setItem(OWNER_KEY, OWNER_A);
  saveWorkspace(fp);
  let mine = loadWorkspace();
  const sideBefore = st.getItem(L.intlKey(PRIMARY_BOOK_ID));
  const off = onShelfChange(() => OWNER_A, () => ({ index: emptyIndex(), books: { [PRIMARY_BOOK_ID]: mine } }), {
    // What PaymentsWorkspace.applyBook does: merge into this tab's copy, then save.
    book: (id, ws) => { mine = M.repairIntl(M.mergeWorkspaces(mine, ws), Date.now()); saveBook(emptyIndex(), id, mine); },
    index: () => undefined,
    ownerChanged: () => assert.fail("no owner change"),
  });
  let oldTab = legacyModel.sanitizeWorkspace(JSON.parse(st.getItem(WORKSPACE_KEY)));
  oldTab = legacyModel.addPayment(oldTab, "inv_00000001", { amountPaise: 1000, date: "2026-10-02", mode: "upi", reference: "" }, T + 5);
  const before = st.writes.length;
  legacyStore.saveWorkspace(oldTab);
  storageEvent(WORKSPACE_KEY, st.getItem(WORKSPACE_KEY));
  storageEvent(WORKSPACE_KEY, st.getItem(WORKSPACE_KEY));
  assert.equal(st.writes.length, before + 1, "only the old tab's own write: the new tab writes identical bytes");
  assert.equal(st.getItem(L.intlKey(PRIMARY_BOOK_ID)), sideBefore, "the sidecar is untouched");
  assert.equal(mine.intl.invoices.inv_usd00001.currency, "USD");
  assert.equal(mine.invoices.inv_00000001.payments.length, 1);
  // A sidecar event from another new tab joins the stored book key.
  const other = M.upsertInvoice(mine, { ...inv("inv_eur00001", "INV-0003", "cli_aaaaaaaa", 500), currency: "EUR" }, T + 6);
  st.setItem(L.intlKey(PRIMARY_BOOK_ID), canonicalJson({ owner: OWNER_A, intl: other.intl }));
  storageEvent(L.intlKey(PRIMARY_BOOK_ID), st.getItem(L.intlKey(PRIMARY_BOOK_ID)));
  assert.equal(mine.intl.invoices.inv_eur00001.currency, "EUR");
  off();

  /* Owner rules (§2.1). */
  const withSide = (owner, current, stash = false) => {
    const s2 = installBrowser();
    if (current) s2.setItem(OWNER_KEY, current);
    if (stash === "v1") s2.setItem(STASH_KEY, JSON.stringify(book("Other", "o@okaxis")));
    // Review round 4: a stash held under STASH_V2_KEY alone (e.g. a failed switch that recorded stuck extra books).
    if (stash === "v2") {
      s2.setItem(STASH_V2_KEY, JSON.stringify({ owner: OWNER_B, at: 1, ids: [B] }));
      s2.setItem(`proupiqr-stash-v2:${B}`, JSON.stringify(book("Other two", "o2@okaxis")));
    }
    s2.setItem(WORKSPACE_KEY, oldBytes(fp));
    s2.setItem(L.intlKey(PRIMARY_BOOK_ID), canonicalJson({ owner, intl: fp.intl }));
    return { s2, ws: loadWorkspace() };
  };
  for (const [owner, current, stash, joins] of [
    [OWNER_A, OWNER_A, false, true], [null, null, false, true], [null, OWNER_A, false, true], [null, OWNER_A, "v1", false], [null, OWNER_A, "v2", false],
    [OWNER_A, null, false, false], [OWNER_A, OWNER_B, false, false],
  ]) {
    const { s2, ws: got } = withSide(owner, current, stash);
    const label = `sidecar owner ${owner} on a device of ${current}${stash ? ` with a ${stash} stash` : ""}`;
    if (joins) {
      assert.equal(got.intl?.invoices.inv_usd00001.currency, "USD", label);
      assert.ok(s2.getItem(L.intlKey(PRIMARY_BOOK_ID)), label);
    } else {
      assert.equal(got.intl, undefined, `${label}: never joined`);
      assert.equal(s2.getItem(L.intlKey(PRIMARY_BOOK_ID)), null, `${label}: set aside, then removed`);
      const aside = listAside().find((a) => a.name === L.OTHER_ACCOUNT_INTL);
      assert.deepEqual([aside.reason, aside.workspace.intl], ["other_account", fp.intl], label);
    }
  }

  /* loadBook merges intl found in a book key (a raw copy) with the sidecar; it never overrides it. */
  st = installBrowser();
  st.setItem(OWNER_KEY, OWNER_A);
  const rawWithIntl = M.upsertInvoice(book("Sharma Tuition", "sharma@okaxis"), { ...inv("inv_gbp00001", "INV-0007", "cli_aaaaaaaa", 700), currency: "GBP" }, T);
  st.setItem(WORKSPACE_KEY, JSON.stringify(rawWithIntl));
  st.setItem(L.intlKey(PRIMARY_BOOK_ID), canonicalJson({ owner: OWNER_A, intl: fp.intl }));
  assert.deepEqual(Object.keys(loadWorkspace().intl.invoices).sort(), ["inv_gbp00001", "inv_usd00001"]);
  st.removeItem(L.intlKey(PRIMARY_BOOK_ID));
  assert.deepEqual(Object.keys(loadWorkspace().intl.invoices), ["inv_gbp00001"], "an absent sidecar never removes it");
  saveWorkspace(loadWorkspace());
  assert.doesNotMatch(st.getItem(WORKSPACE_KEY), /"intl"/, "the next save moves it to the sidecar");

  /* Extra books: their own sidecars; setAside, retireBook and sweeps clear them. */
  st = installBrowser();
  st.setItem(OWNER_KEY, OWNER_A);
  let ix = { ...indexWith(B, C), owner: OWNER_A };
  saveIndex(ix);
  saveBook(ix, B, foreign("Book Two", "two@okaxis"));
  saveBook(ix, C, foreign("Book Three", "three@okaxis"));
  assert.deepEqual(intlKeys(st).sort(), [L.intlKey(B), L.intlKey(C)]);
  assert.equal(loadBook(B).intl.invoices.inv_usd00001.currency, "USD");
  assert.deepEqual(sweepStrayBooks(ix), [], "sidecars are never mistaken for books");
  assert.deepEqual(intlKeys(st).sort(), [L.intlKey(B), L.intlKey(C)]);
  assert.equal(setAside(B, "deleted_elsewhere", loadBook(B)), true);
  assert.equal(st.getItem(L.intlKey(B)), null);
  assert.equal(listAside().find((a) => a.id === B).workspace.intl.invoices.inv_usd00001.currency, "USD", "the set-aside copy keeps intl");
  assert.equal(retireBook(C, null, OWNER_A, true), "removed");
  assert.equal(st.getItem(L.intlKey(C)), null);
  // A sidecar left without its book (a stray): set aside when the server can't have it, then removed.
  st.setItem(L.intlKey("biz_strayy01"), canonicalJson({ owner: OWNER_A, intl: fp.intl }));
  st.setItem(L.intlKey("biz_strayy02"), canonicalJson({ owner: OWNER_A, intl: { invoices: {}, recurring: {}, clients: {} } }));
  sweepStrayBooks({ ...indexWith(), owner: OWNER_A });
  assert.deepEqual(intlKeys(st), []);
  assert.equal(listAside().find((a) => a.id === "biz_strayy01").workspace.intl.invoices.inv_usd00001.currency, "USD");

  /* New-code account switch: sidecars move into the stash; the new primary never keeps A's. */
  st = installBrowser();
  st.setItem(OWNER_KEY, OWNER_A);
  ix = { ...indexWith(B), owner: OWNER_A };
  saveIndex(ix);
  saveBook(ix, PRIMARY_BOOK_ID, fp);
  saveBook(ix, B, foreign("Book Two", "two@okaxis"));
  assert.deepEqual(switchAccountStorage(OWNER_A, OWNER_B, ix, book("Account B", "b@okaxis"), NOW), { ok: true });
  assert.deepEqual(intlKeys(st), [], "A's sidecars left with A's books");
  assert.equal(loadWorkspace().intl, undefined);
  assert.doesNotMatch(st.getItem(WORKSPACE_KEY), /"intl"/);
  const stash = loadStash();
  assert.deepEqual(stash.shelf.books[PRIMARY_BOOK_ID].intl, fp.intl, "the primary's foreign section rides inside the stash");
  assert.equal(stash.shelf.books[B].intl.invoices.inv_usd00001.currency, "USD");
  // Switching back gives A its books, foreign sections included, with A's owner on the sidecars.
  assert.deepEqual(switchAccountStorage(OWNER_B, OWNER_A, { ...emptyIndex(), owner: OWNER_B }, book("Sharma Tuition", "sharma@okaxis"), NOW + 1), { ok: true });
  assert.equal(loadWorkspace().intl.invoices.inv_usd00001.currency, "USD");
  assert.equal(JSON.parse(st.getItem(L.intlKey(PRIMARY_BOOK_ID))).owner, OWNER_A);
  assert.equal(loadBook(B).intl.invoices.inv_usd00001.currency, "USD");
  for (const key of Object.keys(st.snapshot())) if (key === WORKSPACE_KEY || key.startsWith("proupiqr-book-v1:")) assert.doesNotMatch(st.getItem(key), /"intl"/, key);
  // A new primary that has intl gets a sidecar tagged with the new account.
  st = installBrowser();
  st.setItem(OWNER_KEY, OWNER_A);
  saveWorkspace(primary);
  assert.deepEqual(switchAccountStorage(OWNER_A, OWNER_B, emptyIndex(), foreign("Account B", "b@okaxis"), NOW), { ok: true });
  assert.equal(JSON.parse(st.getItem(L.intlKey(PRIMARY_BOOK_ID))).owner, OWNER_B);
  // A failed switch (the new primary doesn't fit) restores A's primary and its sidecar.
  st = installBrowser({ fail: (key) => key === WORKSPACE_KEY && !!st && st.getItem(OWNER_KEY) === OWNER_B });
  st.setItem(OWNER_KEY, OWNER_A);
  saveWorkspace(fp);
  const sideA = st.getItem(L.intlKey(PRIMARY_BOOK_ID));
  assert.deepEqual(switchAccountStorage(OWNER_A, OWNER_B, emptyIndex(), book("Account B", "b@okaxis"), NOW), { ok: false, reason: "storage" });
  assert.deepEqual([st.getItem(OWNER_KEY), st.getItem(L.intlKey(PRIMARY_BOOK_ID))], [OWNER_A, sideA]);
  assert.equal(loadWorkspace().intl.invoices.inv_usd00001.currency, "USD");

  /* The stash keys hold only what older code writes; each foreign section waits under its own stash key. */
  {
    const stashIntlKeys = (s3) => Object.keys(s3.snapshot()).filter((k) => k.startsWith("proupiqr-stash-intl-v1:")).sort();
    const shelfOfA = () => {
      const s3 = installBrowser();
      s3.setItem(OWNER_KEY, OWNER_A);
      const i3 = { ...indexWith(B), owner: OWNER_A };
      saveIndex(i3);
      saveBook(i3, PRIMARY_BOOK_ID, fp);
      saveBook(i3, B, foreign("Book Two", "two@okaxis", "inv_usd00002"));
      return { s3, i3 };
    };
    const holding = (s3, needle) => Object.keys(s3.snapshot()).filter((k) => s3.getItem(k).includes(needle)).sort();
    let { s3, i3 } = shelfOfA();
    assert.deepEqual(switchAccountStorage(OWNER_A, OWNER_B, i3, book("Account B", "b@okaxis"), NOW), { ok: true });
    assert.doesNotMatch(s3.getItem(STASH_KEY), /"intl"|USD|HDFCINBB/, "STASH_KEY holds what older code would write");
    assert.doesNotMatch(s3.getItem("proupiqr-stash-v2:" + B), /"intl"|USD/);
    assert.deepEqual(stashIntlKeys(s3), ["proupiqr-stash-intl-v1:" + B, "proupiqr-stash-intl-v1:biz_primary"]);
    assert.equal(JSON.parse(s3.getItem("proupiqr-stash-intl-v1:biz_primary")).owner, OWNER_A);
    // Old code (a tab or offline PWA) switches back to A: it gives the stash back without the foreign sections,
    // which wait under keys it never reads. New code then puts them back into A's books.
    assert.deepEqual(legacyStore.switchAccountStorage(OWNER_B, OWNER_A, legacyStore.loadShelf().shelf.index, legacyModel.sanitizeWorkspace(clone(book("Sharma Tuition", "sharma@okaxis"))), NOW + 1), { ok: true });
    assert.deepEqual(holding(s3, "inv_usd00001"), ["proupiqr-stash-intl-v1:biz_primary"], "(old code left the primary's foreign section where it was)");
    assert.deepEqual(holding(s3, "inv_usd00002"), ["proupiqr-stash-intl-v1:" + B]);
    const home = loadShelf();
    assert.equal(home.shelf.books[PRIMARY_BOOK_ID].intl.invoices.inv_usd00001.currency, "USD", "A's primary has its US$ invoice again");
    assert.equal(home.shelf.books[PRIMARY_BOOK_ID].intl.settings.account, "GB82WEST12345698765432");
    assert.equal(home.shelf.books[B].intl.invoices.inv_usd00002.currency, "USD", "A's second business too");
    assert.deepEqual(stashIntlKeys(s3), [], "the stashed sections went home");
    assert.equal(JSON.parse(s3.getItem(L.intlKey(B))).owner, OWNER_A);
    // B's stash (written by old code) is untouched, and B's data never reaches A's books.
    assert.match(s3.getItem(STASH_KEY), /Account B/);
    assert.doesNotMatch(JSON.stringify(home.shelf.books), /Account B/);

    // New code switching back gives everything back in one step (stash and its foreign sections).
    ({ s3, i3 } = shelfOfA());
    switchAccountStorage(OWNER_A, OWNER_B, i3, book("Account B", "b@okaxis"), NOW);
    assert.deepEqual(switchAccountStorage(OWNER_B, OWNER_A, { ...emptyIndex(), owner: OWNER_B }, book("Sharma Tuition", "sharma@okaxis"), NOW + 1), { ok: true });
    assert.equal(loadBook(B).intl.invoices.inv_usd00002.currency, "USD");
    assert.equal(loadWorkspace().intl.invoices.inv_usd00001.currency, "USD");
    assert.deepEqual(stashIntlKeys(s3).filter((k) => JSON.parse(s3.getItem(k)).owner === OWNER_A), [], "A's stashed sections went back");

    // Merging into an existing stash of the same account keeps both foreign sections.
    ({ s3, i3 } = shelfOfA());
    switchAccountStorage(OWNER_A, OWNER_B, i3, book("Account B", "b@okaxis"), NOW);
    s3.setItem(OWNER_KEY, OWNER_A);
    const again = M.upsertInvoice(book("Sharma Tuition", "sharma@okaxis"), { ...inv("inv_eur00009", "INV-0009", "cli_aaaaaaaa", 900), currency: "EUR" }, T + 2);
    s3.setItem(STASH_V2_KEY, JSON.stringify({ owner: OWNER_A, at: 1, ids: [B] }));
    saveIndex({ ...emptyIndex(), owner: OWNER_A }, true);
    saveWorkspace(again);
    assert.deepEqual(switchAccountStorage(OWNER_A, OWNER_B, { ...emptyIndex(), owner: OWNER_A }, book("Account B", "b@okaxis"), NOW + 2), { ok: true });
    assert.deepEqual(Object.keys(loadStash().shelf.books[PRIMARY_BOOK_ID].intl.invoices).sort(), ["inv_eur00009", "inv_usd00001"]);

    // Discarding the stash removes its foreign sections; another account's waiting one is set aside, never dropped.
    s3.setItem("proupiqr-stash-intl-v1:biz_orphan01", canonicalJson({ owner: "c".repeat(32), intl: fp.intl }));
    discardStash();
    assert.deepEqual(stashIntlKeys(s3), ["proupiqr-stash-intl-v1:biz_orphan01"]);
    loadShelf();
    assert.deepEqual(stashIntlKeys(s3), []);
    assert.ok(listAside().some((a) => a.reason === "other_account" && a.name === L.OTHER_ACCOUNT_INTL && a.workspace.intl?.invoices.inv_usd00001));
  }

  /* Old-code switch (legacy-localStore.ts = localStore.ts at 3ce60ef): A's sidecars stay behind, never join B. */
  st = installBrowser();
  st.setItem(OWNER_KEY, OWNER_A);
  ix = { ...indexWith(B), owner: OWNER_A };
  saveIndex(ix);
  saveBook(ix, PRIMARY_BOOK_ID, fp);
  saveBook(ix, B, foreign("Book Two", "two@okaxis", "inv_usd00002"));
  assert.deepEqual(legacyStore.switchAccountStorage(OWNER_A, OWNER_B, ix, legacyModel.sanitizeWorkspace(clone(book("Account B", "b@okaxis"))), NOW), { ok: true });
  assert.deepEqual(intlKeys(st).sort(), [L.intlKey(B), L.intlKey(PRIMARY_BOOK_ID)], "(old code leaves A's sidecars in place)");
  const afterOld = loadShelf();
  assert.equal(afterOld.shelf.books[PRIMARY_BOOK_ID].intl, undefined, "B's primary never gains A's foreign section");
  assert.equal(afterOld.shelf.books[PRIMARY_BOOK_ID].business.name, "Account B");
  sweepStrayBooks(afterOld.shelf.index);
  assert.deepEqual(intlKeys(st), [], "both of A's sidecars are set aside, then removed");
  const asides = listAside();
  assert.ok(asides.some((a) => a.reason === "other_account" && canonicalJson({ intl: a.workspace.intl }) === canonicalJson({ intl: fp.intl })), "A's primary foreign section is kept intact");
  assert.ok(asides.some((a) => a.reason === "other_account" && a.workspace.intl?.invoices.inv_usd00002), "A's Book Two foreign section is kept intact");

  /* Review round 3: those set-aside sections record where they came from (owner, book; the primary's is marked
     primary), so A gets them back: automatically when A is on this device again through new code, and by hand
     from the downloaded file, which restores into the first business (on Free too), never as a new business. */
  {
    const primaryAside = asides.find((a) => a.workspace.intl?.invoices.inv_usd00001);
    const twoAside = asides.find((a) => a.workspace.intl?.invoices.inv_usd00002);
    assert.equal(primaryAside.fromPrimary, true, "the primary's section downloads as a plain workspace backup");
    assert.equal(twoAside.fromPrimary, false);
    assert.deepEqual([JSON.parse(st.getItem(`proupiqr-aside-intl-v1:${primaryAside.id}`)).owner, JSON.parse(st.getItem(`proupiqr-aside-intl-v1:${primaryAside.id}`)).book], [OWNER_A, PRIMARY_BOOK_ID]);
    assert.equal(JSON.parse(st.getItem(`proupiqr-aside-intl-v1:${twoAside.id}`)).book, B);
    // While B is signed in nothing moves: B's books never gain A's sections.
    const asB = loadShelf();
    assert.equal(asB.shelf.books[PRIMARY_BOOK_ID].intl, undefined);
    assert.equal(listAside().length, 2);
    // The download (PaymentsWorkspace's "Download it" for a fromPrimary copy) restores into A's first business on Free.
    const file = JSON.stringify({ app: "proupiqr-workspace", exportedAt: AT, workspace: primaryAside.workspace });
    const free = restoreBackup({ index: { ...emptyIndex(), owner: OWNER_A }, books: { [PRIMARY_BOOK_ID]: fp } }, file, PRIMARY_BOOK_ID, 1, NOW);
    assert.equal(free.kind, "done");
    assert.deepEqual([free.restored, free.skipped, free.into], [1, 0, [PRIMARY_BOOK_ID]], "restored into the first business, not skipped");
    assert.equal(canonicalJson({ intl: free.shelf.books[PRIMARY_BOOK_ID].intl }), canonicalJson({ intl: fp.intl }));
    // A signs in again through new code: the server holds A's primary without the section (never synced).
    const aServer = M.sanitizeWorkspace(JSON.parse(st.getItem(STASH_KEY)));
    assert.equal(aServer.intl, undefined);
    assert.deepEqual(switchAccountStorage(OWNER_B, OWNER_A, loadIndex(), aServer, NOW + 10), { ok: true });
    const back = loadShelf().shelf;
    assert.equal(canonicalJson({ intl: back.books[PRIMARY_BOOK_ID].intl }), canonicalJson({ intl: fp.intl }), "A's primary has its foreign section again, settings included");
    assert.equal(back.books[PRIMARY_BOOK_ID].business.name, fp.business.name);
    assert.equal(back.books[B]?.intl?.invoices.inv_usd00002.currency, "USD", "Book Two came back from the stash with its section");
    assert.equal(JSON.parse(st.getItem(L.intlKey(PRIMARY_BOOK_ID))).owner, OWNER_A);
    assert.deepEqual(listAside().filter((a) => a.workspace.intl), [], "nothing left to download");
    assert.doesNotMatch(st.getItem(WORKSPACE_KEY), /"intl"|USD/, "the book key still holds only what old code writes");
  }
  {
    // The same when an old tab switches back to A (no new-code switch): the next new-code load as A reclaims it.
    const s6 = installBrowser();
    s6.setItem(OWNER_KEY, OWNER_A);
    saveWorkspace(fp);
    legacyStore.switchAccountStorage(OWNER_A, OWNER_B, emptyIndex(), legacyModel.sanitizeWorkspace(clone(book("Account B", "b@okaxis"))), NOW);
    loadShelf();
    assert.equal(listAside().filter((a) => a.reason === "other_account").length, 1);
    assert.deepEqual(legacyStore.switchAccountStorage(OWNER_B, OWNER_A, legacyStore.loadIndex(), legacyModel.sanitizeWorkspace(clone(book("Sharma Tuition", "sharma@okaxis"))), NOW + 5), { ok: true });
    const a = loadShelf().shelf.books[PRIMARY_BOOK_ID];
    assert.equal(a.intl?.invoices.inv_usd00001.currency, "USD", "reclaimed on the next load as A");
    assert.deepEqual(listAside().filter((x) => x.workspace.intl), []);
    // A third account's section, or one without a recorded owner, is never reclaimed.
    s6.setItem("proupiqr-aside-intl-v1:biz_cccccccc", JSON.stringify({ at: 1, reason: "other_account", name: L.OTHER_ACCOUNT_INTL, primary: true, owner: "c".repeat(32), book: PRIMARY_BOOK_ID, intl: { invoices: { inv_eur00001: { ...fp.intl.invoices.inv_usd00001, id: "inv_eur00001", currency: "EUR" } }, recurring: {}, clients: {} } }));
    s6.setItem("proupiqr-aside-intl-v1:biz_dddddddd", JSON.stringify({ at: 1, reason: "other_account", name: L.OTHER_ACCOUNT_INTL, primary: true, book: PRIMARY_BOOK_ID, intl: { invoices: { inv_gbp00001: { ...fp.intl.invoices.inv_usd00001, id: "inv_gbp00001", currency: "GBP" } }, recurring: {}, clients: {} } }));
    const again = loadShelf().shelf.books[PRIMARY_BOOK_ID];
    assert.deepEqual(Object.keys(again.intl.invoices), ["inv_usd00001"], "another account's or an ownerless section stays aside");
    assert.equal(listAside().length, 2);
  }

  /* Review round 2: a guest's sidecar is tagged with the account that adopts the device before any save, so an
     old tab's later switch to another account (and its "Discard" of the stash) can't hand it to that account. */
  {
    const guestThenOldSwitch = (label, claim) => {
      const s4 = installBrowser();
      saveWorkspace(fp);
      assert.equal(JSON.parse(s4.getItem(L.intlKey(PRIMARY_BOOK_ID))).owner, null, `${label}: a signed-out device's sidecar`);
      // First sign-in as A: sync writes OWNER_KEY only, and the server's copy equals this one, so nothing is saved.
      s4.setItem(OWNER_KEY, OWNER_A);
      claim();
      assert.equal(JSON.parse(s4.getItem(L.intlKey(PRIMARY_BOOK_ID))).owner, OWNER_A, `${label}: tagged with A at once`);
      assert.equal(loadWorkspace().intl.invoices.inv_usd00001.currency, "USD", `${label}: A keeps its foreign section`);
      // An old tab signs in as B (it leaves the sidecar), and B discards "data from another account" there.
      assert.deepEqual(legacyStore.switchAccountStorage(OWNER_A, OWNER_B, emptyIndex(), legacyModel.sanitizeWorkspace(clone(book("Account B", "b@okaxis"))), NOW), { ok: true });
      legacyStore.discardStash();
      assert.equal(s4.getItem(STASH_KEY), null);
      const b = loadShelf().shelf.books[PRIMARY_BOOK_ID];
      assert.equal(b.business.name, "Account B");
      assert.equal(b.intl, undefined, `${label}: A's IBAN and foreign invoices never join B's primary`);
      assert.deepEqual(intlKeys(s4), []);
      const kept = listAside().find((a) => a.name === L.OTHER_ACCOUNT_INTL);
      assert.equal(kept?.reason, "other_account", `${label}: A's foreign section is set aside`);
      assert.equal(kept.workspace.intl.settings.account, "GB82WEST12345698765432");
    };
    guestThenOldSwitch("sync's first sign-in", () => L.claimGuestSidecars());
    guestThenOldSwitch("the next new-code load", () => loadShelf());
    // Another account's stash on the device: the guest sidecar can't be proven to be the signed-in account's.
    const s4 = installBrowser();
    saveWorkspace(fp);
    s4.setItem(OWNER_KEY, OWNER_A);
    s4.setItem(STASH_KEY, JSON.stringify(book("Other", "o@okaxis")));
    L.claimGuestSidecars();
    assert.equal(JSON.parse(s4.getItem(L.intlKey(PRIMARY_BOOK_ID))).owner, null, "never claimed while another account's stash is here");
  }

  /* Review round 2: a set-aside copy's foreign section lives under its own key, which older code never lists,
     so an old tab's list, "Download it" and "Discard" can't show it empty, drop it from a download or delete it. */
  {
    const asideKeys = (s5, prefix) => Object.keys(s5.snapshot()).filter((k) => k.startsWith(prefix)).sort();
    const s5 = installBrowser();
    s5.setItem(OWNER_KEY, OWNER_A);
    saveWorkspace(fp);
    legacyStore.switchAccountStorage(OWNER_A, OWNER_B, emptyIndex(), legacyModel.sanitizeWorkspace(clone(book("Account B", "b@okaxis"))), NOW);
    loadShelf();
    const only = listAside().find((a) => a.name === L.OTHER_ACCOUNT_INTL);
    assert.equal(only.workspace.intl.invoices.inv_usd00001.currency, "USD");
    assert.equal(only.reason, "other_account");
    assert.deepEqual(asideKeys(s5, "proupiqr-aside-v1:"), [], "a copy that is only a foreign section has no key older code lists");
    assert.deepEqual(legacyStore.listAside(), []);
    assert.match(backupJson({ index: indexWith(only.id), books: { [only.id]: only.workspace } }, { book: only.id }, AT), /inv_usd00001/, "the new download keeps it");
    // A copy with both parts: older code sees, downloads and discards only the INR part.
    assert.equal(keepAside(C, "deleted_elsewhere", foreign("Book Two", "two@okaxis", "inv_usd00002")), true);
    assert.doesNotMatch(s5.getItem("proupiqr-aside-v1:" + C), /"intl"|USD|GB82WEST/, "the key older code reads holds the INR part only");
    const oldView = legacyStore.listAside().find((a) => a.id === C);
    assert.equal(oldView.workspace.invoices.inv_00000001.amountPaise, 300000);
    const both = listAside().find((a) => a.id === C);
    assert.deepEqual([both.name, both.reason, both.workspace.invoices.inv_00000001.amountPaise, both.workspace.intl.invoices.inv_usd00002.currency], ["Book Two", "deleted_elsewhere", 300000, "USD"]);
    legacyStore.discardAside(C);
    const left = listAside().find((a) => a.id === C);
    assert.equal(left?.workspace.intl.invoices.inv_usd00002.currency, "USD", "an old tab's Discard never deletes the foreign section");
    assert.equal(left.name, "Book Two");
    assert.match(backupJson({ index: indexWith(C), books: { [C]: left.workspace } }, { book: C }, AT), /inv_usd00002/);
    // Merged, never replaced: a second copy under the same id keeps both foreign sections.
    assert.equal(keepAside(C, "deleted_elsewhere", foreign("Book Two", "two@okaxis", "inv_usd00003")), true);
    assert.deepEqual(Object.keys(listAside().find((a) => a.id === C).workspace.intl.invoices).sort(), ["inv_usd00002", "inv_usd00003"]);
    // The new Discard removes both parts.
    discardAside(C);
    discardAside(only.id);
    assert.deepEqual([...asideKeys(s5, "proupiqr-aside-v1:"), ...asideKeys(s5, "proupiqr-aside-intl-v1:")], []);
    assert.deepEqual(listAside(), []);
    // A failed write of either part writes nothing (the caller keeps its own copy).
    for (const prefix of ["proupiqr-aside-v1:", "proupiqr-aside-intl-v1:"]) {
      const s6 = installBrowser({ fail: (key) => key.startsWith(prefix) });
      assert.equal(keepAside(C, "deleted_elsewhere", foreign("Book Two", "two@okaxis")), false, prefix);
      assert.deepEqual(Object.keys(s6.snapshot()).filter((k) => k.includes("aside")), [], `${prefix}: nothing half-written`);
    }
    // The switch's give-back reads both parts: A's stash with a foreign section comes home in one piece.
    const s7 = installBrowser();
    s7.setItem(OWNER_KEY, OWNER_A);
    saveWorkspace(fp);
    switchAccountStorage(OWNER_A, OWNER_B, emptyIndex(), book("Account B", "b@okaxis"), NOW);
    assert.deepEqual(switchAccountStorage(OWNER_B, OWNER_A, { ...emptyIndex(), owner: OWNER_B }, book("Sharma Tuition", "sharma@okaxis"), NOW + 1), { ok: true });
    assert.equal(loadWorkspace().intl.invoices.inv_usd00001.currency, "USD");
    assert.deepEqual(Object.keys(s7.snapshot()).filter((k) => k.includes("aside")), []);
  }

  /* Review round 2: another account's sidecar that can't be set aside yet (storage full) never blocks this
     account's saves; the book key never holds intl, so writing it can't attach A's data to B. */
  {
    const big = (() => {
      let w = foreign("Sharma Tuition", "sharma@okaxis");
      for (let i = 2; i < 22; i++) w = M.upsertInvoice(w, { ...inv(`inv_usd${String(i).padStart(5, "0")}`, `INV-${i}`, "cli_aaaaaaaa", 100 * i), description: "x".repeat(200), currency: "USD" }, T);
      return w;
    })();
    const leftBehind = (quota) => {
      const s8 = installBrowser({ quota });
      s8.setItem(OWNER_KEY, OWNER_A);
      saveWorkspace(big);
      legacyStore.switchAccountStorage(OWNER_A, OWNER_B, emptyIndex(), legacyModel.sanitizeWorkspace(clone(book("Account B", "b@okaxis"))), NOW);
      return s8;
    };
    const roomy = leftBehind(Infinity);
    const used = Object.entries(roomy.snapshot()).reduce((n, [k, v]) => n + k.length + v.length, 0);
    const s8 = leftBehind(used + 600);
    const sideA = s8.getItem(L.intlKey(PRIMARY_BOOK_ID));
    const edited = M.upsertInvoice(book("Account B", "b@okaxis"), inv("inv_inrb0001", "INV-0005", "cli_aaaaaaaa", 4200), T + 5);
    assert.equal(saveWorkspace(edited), true, "B's INR save succeeds");
    assert.match(s8.getItem(WORKSPACE_KEY), /inv_inrb0001/);
    assert.equal(s8.getItem(L.intlKey(PRIMARY_BOOK_ID)), sideA, "A's sidecar is left for a later try, never removed or written over");
    assert.equal(loadWorkspace().intl, undefined, "and never joined");
    // B's own foreign section can't be written while A's sits there: that save reports failure, the book key is written.
    const bForeign = M.upsertInvoice(edited, { ...inv("inv_eurb0001", "INV-0006", "cli_aaaaaaaa", 500), currency: "EUR" }, T + 6);
    assert.equal(saveWorkspace(bForeign), false);
    assert.match(s8.getItem(WORKSPACE_KEY), /inv_inrb0001/);
    assert.doesNotMatch(s8.getItem(WORKSPACE_KEY), /"intl"|inv_eurb0001/);
    assert.equal(s8.getItem(L.intlKey(PRIMARY_BOOK_ID)), sideA);
  }

  /* Review round 2: a revived client gets the same bytes on every load, so an unsaved non-primary book is
     never pushed again (no new server revision per app load). */
  {
    const { memoryCloudStore, syncWorkspace } = await import("../src/lib/workspace/cloud.ts");
    const s9 = installBrowser();
    s9.setItem(OWNER_KEY, OWNER_A);
    const i9 = { ...indexWith(B), owner: OWNER_A };
    saveIndex(i9);
    saveBook(i9, B, foreign("Book Two", "two@okaxis"));
    // An old tab (it can't see the USD invoice) deletes the INR invoice, then the client: only the book key changes.
    const raw = JSON.parse(s9.getItem(bookKey(B)));
    raw.invoices.inv_00000001 = { ...raw.invoices.inv_00000001, deletedAt: T + 9, updatedAt: T + 9 };
    raw.clients.cli_aaaaaaaa = { ...raw.clients.cli_aaaaaaaa, deletedAt: T + 10, updatedAt: T + 10 };
    s9.setItem(bookKey(B), JSON.stringify(raw));
    const realNow = Date.now;
    const cloud = memoryCloudStore();
    const hashes = new Set();
    const revs = [];
    try {
      for (const t of [NOW, NOW + 60_000, NOW + 86_400_000]) {
        Date.now = () => t;
        const loaded = loadShelf().shelf.books[B];
        assert.equal(loaded.clients.cli_aaaaaaaa.deletedAt, undefined, "revived");
        hashes.add(bookHash(loaded));
        revs.push((await syncWorkspace(cloud, "ws:doc:o:" + B, loaded, t)).rev);
      }
    } finally {
      Date.now = realNow;
    }
    assert.equal(hashes.size, 1, "three loads, one copy");
    assert.deepEqual(revs, [1, 1, 1], "one server revision");
  }

  /* Backups carry intl inside each workspace; an old reader restores the INR part only. */
  const fshelf = { index: { ...indexWith(B), owner: OWNER_A }, books: { [PRIMARY_BOOK_ID]: fp, [B]: foreign("Book Two", "two@okaxis") } };
  for (const text of [backupJson(fshelf, { book: PRIMARY_BOOK_ID }, AT), backupJson(fshelf, "all", AT)]) {
    const parsed = JSON.parse(text);
    assert.equal(parsed.workspace.intl.invoices.inv_usd00001.currency, "USD");
    assert.equal(parsed.formatVersion === undefined || parsed.formatVersion === 2, true, "the wire formats don't change");
    const restoredOld = legacyModel.sanitizeWorkspace(parsed.workspace);
    assert.equal(restoredOld.intl, undefined);
    assert.equal(restoredOld.invoices.inv_usd00001, undefined, "no foreign invoice ever comes back as ₹");
    assert.equal(restoredOld.invoices.inv_00000001.amountPaise, 300000);
  }
  assert.equal(JSON.parse(backupJson(fshelf, { book: B }, AT)).businesses[0].workspace.intl.invoices.inv_usd00001.currency, "USD");
  const erasedShelf = { index: emptyIndex(), books: { [PRIMARY_BOOK_ID]: M.eraseWorkspace(fp, NOW) } };
  const back = restoreBackup(erasedShelf, backupJson(fshelf, { book: PRIMARY_BOOK_ID }, AT), PRIMARY_BOOK_ID, 1, NOW + 1);
  assert.equal(back.kind, "done");
  assert.equal(back.shelf.books[PRIMARY_BOOK_ID].intl.invoices.inv_usd00001.currency, "USD", "a new client restores the foreign section");
  assert.equal(back.shelf.books[PRIMARY_BOOK_ID].intl.invoices.inv_usd00001.deletedAt, undefined);

  /* The generator bridge matches INR invoices only: a foreign invoice with the same number is never overwritten. */
  st = installBrowser();
  saveWorkspace(fp);
  const doc = { merchant: "Sharma Tuition", upiId: "sharma@okaxis", customer: "Rohan", invoiceNo: "INV-0002", invoiceDate: "2026-10-05", dueDate: "2026-10-20", totalPaise: 99900, description: "" };
  const tracked = trackDocument(doc);
  assert.equal(tracked.created, true);
  const after = loadWorkspace();
  assert.equal(after.intl.invoices.inv_usd00001.amountPaise, 120050, "the US$ invoice is untouched");
  assert.equal(after.invoices[tracked.invoiceId].amountPaise, 99900);
  assert.equal(after.invoices[tracked.invoiceId].currency, undefined);
  // Same number again: the INR invoice is updated in place with the fields older code writes, so its bytes are
  // what older code stores for the same "Track payment" (a monthly plan's recurringId isn't kept, as today; review round 5).
  let withPlanId = loadWorkspace();
  withPlanId = M.upsertInvoice(withPlanId, { ...withPlanId.invoices[tracked.invoiceId], recurringId: "rec_abcdefgh01" }, T + 9);
  saveWorkspace(withPlanId);
  const realNowTrack = Date.now;
  Date.now = () => NOW;
  try {
    const again = trackDocument({ ...doc, totalPaise: 100000 });
    assert.deepEqual([again.invoiceId, again.created], [tracked.invoiceId, false]);
    assert.deepEqual([loadWorkspace().invoices[tracked.invoiceId].amountPaise, loadWorkspace().invoices[tracked.invoiceId].recurringId], [100000, undefined]);
    const oldDevice = installBrowser();
    legacyStore.saveWorkspace(legacyModel.sanitizeWorkspace(clone(M.withoutIntl(withPlanId))));
    legacyStore.trackDocument({ ...doc, totalPaise: 100000 });
    const oldInvoice = legacyModel.sanitizeWorkspace(JSON.parse(oldDevice.getItem(WORKSPACE_KEY))).invoices[tracked.invoiceId];
    globalThis.localStorage = st;
    assert.equal(canonicalJson(loadWorkspace().invoices[tracked.invoiceId]), canonicalJson(oldInvoice), "the same invoice as older code");
  } finally {
    Date.now = realNowTrack;
  }

  /* A business deleted on another device while an old tab and a new tab are both open here: whichever tab
     retires it first, the foreign invoices the server never got are set aside, never dropped with the sidecar
     (older code removes only the book key, so the new tab finds the book key gone but the sidecar still there). */
  for (const order of ["old tab first", "new tab first"]) {
    const sr = installBrowser();
    sr.setItem(OWNER_KEY, OWNER_A);
    let ir = { ...indexWith(B), owner: OWNER_A };
    saveIndex(ir, true);
    saveBook(ir, B, foreign("Book Two", "two@okaxis"));
    writeSyncMeta(OWNER_A, B, 3, bookHash(loadBook(B)), true);
    // The new tab, offline: a second US$ invoice the server never saw.
    const held = M.upsertInvoice(loadBook(B), { ...inv("inv_usd00002", "INV-0003", "cli_aaaaaaaa", 99900), currency: "USD", createdAt: T + 5, updatedAt: T + 5 }, T + 5);
    saveBook(ir, B, held);
    const oldHeld = legacyModel.sanitizeWorkspace(clone(held));
    ir = deleteBook(ir, B, T + 9);
    saveIndex(ir, true);
    // Each tab's retire(), as PaymentsWorkspace calls it in both builds: retireBook(id, held ?? stored, owner, stored === null).
    const newTab = () => { const stored = loadBook(B); return retireBook(B, held ?? stored, OWNER_A, stored === null); };
    const oldTab = () => { const stored = legacyStore.loadBook(B); return legacyStore.retireBook(B, oldHeld ?? stored, OWNER_A, stored === null); };
    const results = order === "old tab first" ? [oldTab(), newTab()] : [newTab(), oldTab()];
    assert.equal(results[0], "aside", order);
    assert.deepEqual([sr.getItem(bookKey(B)), sr.getItem(L.intlKey(B))], [null, null], `${order}: both keys are gone`);
    const kept = listAside();
    assert.equal(kept.length, 1, `${order}: one set-aside copy`);
    assert.deepEqual(Object.keys(kept[0].workspace.intl.invoices).sort(), ["inv_usd00001", "inv_usd00002"], `${order}: the unsynced US$ invoice is kept`);
    assert.equal(kept[0].workspace.invoices.inv_00000001.amountPaise, 300000);
  }
  {
    // Synced, old tab first: older code can't match the server's hash without the sidecar, so it keeps a copy of
    // the INR part and drops the sync meta. The new tab completes that same copy with the foreign section (one
    // copy, never a second one), so the download is whole.
    const sr = installBrowser();
    sr.setItem(OWNER_KEY, OWNER_A);
    let ir = { ...indexWith(B), owner: OWNER_A };
    saveIndex(ir, true);
    saveBook(ir, B, foreign("Book Two", "two@okaxis"));
    const held = loadBook(B);
    writeSyncMeta(OWNER_A, B, 3, bookHash(held), true);
    ir = deleteBook(ir, B, T + 9);
    saveIndex(ir, true);
    legacyStore.retireBook(B, legacyModel.sanitizeWorkspace(clone(held)), OWNER_A, false);
    assert.equal(listAside().length, 1);
    assert.equal(listAside()[0].workspace.intl, undefined, "(older code's copy)");
    assert.equal(retireBook(B, held, OWNER_A, loadBook(B) === null), "aside");
    assert.equal(sr.getItem(L.intlKey(B)), null);
    assert.equal(listAside().length, 1, "still one copy");
    assert.equal(canonicalJson(listAside()[0].workspace), canonicalJson(held), "now with its foreign section");
    // The same book deleted on this device by new code: both keys go, nothing is kept.
    const sd = installBrowser();
    sd.setItem(OWNER_KEY, OWNER_A);
    const id2 = { ...indexWith(B), owner: OWNER_A };
    saveIndex(id2, true);
    saveBook(id2, B, foreign("Book Two", "two@okaxis"));
    assert.equal(retireBook(B, null, OWNER_A, true), "removed");
    assert.deepEqual([sd.getItem(bookKey(B)), sd.getItem(L.intlKey(B)), listAside().length], [null, null, 0]);
  }

  /* A failed switch on a device that never stored its primary (A signed in to an empty account and changed
     nothing): the next account's foreign section doesn't fit, so its book key is never written, and the
     device is left exactly as it was (no primary of B's under A's owner). */
  {
    const bForeign = foreign("B Exports", "b@okaxis");
    const sf = installBrowser({ fail: (key, value) => key === L.intlKey(PRIMARY_BOOK_ID) && value.includes(OWNER_B) });
    sf.setItem(OWNER_KEY, OWNER_A);
    saveIndex({ ...emptyIndex(), owner: OWNER_A }, true);
    assert.equal(sf.getItem(WORKSPACE_KEY), null);
    assert.deepEqual(switchAccountStorage(OWNER_A, OWNER_B, { ...emptyIndex(), owner: OWNER_A }, bForeign, NOW), { ok: false, reason: "storage" });
    assert.ok(!sf.writes.includes(WORKSPACE_KEY), "B's book key is never written without its sidecar");
    assert.deepEqual([sf.getItem(OWNER_KEY), sf.getItem(WORKSPACE_KEY), sf.getItem(L.intlKey(PRIMARY_BOOK_ID))], [OWNER_A, null, null]);
    assert.notEqual(loadWorkspace().business.name, "B Exports");
    // With room, the retry stashes A's (empty) primary as A's, never B's data.
    sf.fail = () => false;
    assert.deepEqual(switchAccountStorage(OWNER_A, OWNER_B, loadIndex(), bForeign, NOW + 1), { ok: true });
    assert.doesNotMatch(sf.getItem(STASH_KEY), /B Exports/);
    assert.equal(loadWorkspace().intl.invoices.inv_usd00001.currency, "USD");
  }

  /* Cross-tab: another account's sidecar in a book's slot (left by a quota failure or an old switch) never
     reaches this tab, through an event on the book key or on the sidecar key. */
  {
    const sx = installBrowser();
    sx.setItem(OWNER_KEY, OWNER_A);
    saveWorkspace(book("Sharma Tuition", "sharma@okaxis"));
    const theirs = canonicalJson({ owner: OWNER_B, intl: fp.intl });
    sx.setItem(L.intlKey(PRIMARY_BOOK_ID), theirs);
    let current = loadWorkspace();
    assert.equal(current.intl, undefined);
    const received = [];
    const stop = onShelfChange(() => OWNER_A, () => ({ index: emptyIndex(), books: { [PRIMARY_BOOK_ID]: current } }), {
      book: (id, ws) => { received.push(ws); },
      index: () => undefined,
      ownerChanged: () => assert.fail("no owner change"),
    });
    const edited = updateBusiness(current, { name: "Sharma Tuition Classes" }, T + 3);
    sx.setItem(WORKSPACE_KEY, canonicalJson(edited));
    storageEvent(WORKSPACE_KEY, canonicalJson(edited));
    storageEvent(L.intlKey(PRIMARY_BOOK_ID), theirs);
    stop();
    assert.equal(received.length, 2);
    for (const ws of received) {
      assert.equal(ws.intl, undefined, "B's foreign section never joins A's book");
      assert.equal(ws.business.name, "Sharma Tuition Classes");
    }
  }

  /* Storage guards of the stash and set-aside reconcilers (spec §2.1, §2.4). */
  {
    // A foreign-only copy of a read-only business stays listed (it isn't merged into a book that can't sync).
    const sy = installBrowser();
    sy.setItem(OWNER_KEY, OWNER_A);
    const iy = { ...indexWith(B), owner: OWNER_A };
    saveIndex(iy);
    saveBook(iy, B, book("Book Two", "two@okaxis"));
    savePlanLimit(OWNER_A, 1);
    assert.ok(readOnlyBookIds(iy, 1).has(B));
    sy.setItem("proupiqr-aside-intl-v1:biz_aside001", JSON.stringify({ at: 1, reason: "other_account", name: L.OTHER_ACCOUNT_INTL, owner: OWNER_A, book: B, intl: fp.intl }));
    const loaded = loadShelf().shelf;
    assert.equal(loaded.books[B].intl, undefined, "not reclaimed into a read-only business");
    assert.equal(sy.getItem(L.intlKey(B)), null);
    assert.ok(listAside().some((a) => a.id === "biz_aside001"), "still listed to download");
    savePlanLimit(OWNER_A, 20);
    assert.equal(loadShelf().shelf.books[B].intl?.invoices.inv_usd00001.currency, "USD", "reclaimed once the business is writable again");
  }
  {
    // A stashed foreign section waits while the stash still holds its book (the give-back joins it), even for
    // another account: reconcile never sets it aside or moves it then.
    const sz = installBrowser();
    sz.setItem(OWNER_KEY, OWNER_A);
    saveWorkspace(book("Sharma Tuition", "sharma@okaxis"));
    sz.setItem(STASH_KEY, canonicalJson(book("Account B", "b@okaxis")));
    sz.setItem(STASH_V2_KEY, JSON.stringify({ owner: OWNER_B, at: 1, ids: [] }));
    const waiting = canonicalJson({ owner: OWNER_B, intl: fp.intl });
    sz.setItem("proupiqr-stash-intl-v1:biz_primary", waiting);
    loadShelf();
    assert.equal(sz.getItem("proupiqr-stash-intl-v1:biz_primary"), waiting, "left in place");
    assert.deepEqual(listAside(), []);
    assert.equal(loadStash().shelf.books[PRIMARY_BOOK_ID].intl.invoices.inv_usd00001.currency, "USD", "the stash's give-back joins it");
  }
  {
    // A switch finds a stashed section of another account left in the slot (no stash holds it any more): it is
    // set aside first, so the switch succeeds and the slot gets this account's section.
    const sw = installBrowser();
    sw.setItem(OWNER_KEY, OWNER_A);
    saveWorkspace(fp);
    const leftover = M.sanitizeWorkspace(clone({ ...emptyWorkspace(), intl: { invoices: { inv_eur00007: { ...fp.intl.invoices.inv_usd00001, id: "inv_eur00007", currency: "EUR" } }, recurring: {}, clients: {} } })).intl;
    sw.setItem("proupiqr-stash-intl-v1:biz_primary", canonicalJson({ owner: OWNER_C, intl: leftover }));
    assert.deepEqual(switchAccountStorage(OWNER_A, OWNER_B, { ...emptyIndex(), owner: OWNER_A }, book("Account B", "b@okaxis"), NOW), { ok: true });
    assert.equal(JSON.parse(sw.getItem("proupiqr-stash-intl-v1:biz_primary")).owner, OWNER_A);
    assert.ok(JSON.parse(sw.getItem("proupiqr-stash-intl-v1:biz_primary")).intl.invoices.inv_usd00001);
    assert.ok(listAside().some((a) => a.reason === "other_account" && a.workspace.intl?.invoices.inv_eur00007), "C's section is kept to download");
  }
  {
    // A new-code switch back to A reclaims A's set-aside foreign sections as its last step (no load in between).
    const sv = installBrowser();
    sv.setItem(OWNER_KEY, OWNER_A);
    saveWorkspace(fp);
    legacyStore.switchAccountStorage(OWNER_A, OWNER_B, emptyIndex(), legacyModel.sanitizeWorkspace(clone(book("Account B", "b@okaxis"))), NOW);
    loadShelf();
    assert.equal(listAside().filter((a) => a.workspace.intl).length, 1, "(A's section was set aside while B used the device)");
    const aServer = M.sanitizeWorkspace(JSON.parse(sv.getItem(STASH_KEY)));
    assert.deepEqual(switchAccountStorage(OWNER_B, OWNER_A, loadIndex(), aServer, NOW + 10), { ok: true });
    assert.equal(JSON.parse(sv.getItem(L.intlKey(PRIMARY_BOOK_ID)) ?? "null")?.owner, OWNER_A, "A's sidecar is back right after the switch");
    assert.equal(loadBook(PRIMARY_BOOK_ID).intl?.invoices.inv_usd00001.currency, "USD");
    assert.deepEqual(listAside().filter((a) => a.workspace.intl), []);
  }

  /* A restore that adds a business starts it from emptyWorkspace() (business time 0): a backup with bank details
     and no name or records is not mistaken for an old tab's erase at restore time. */
  {
    installBrowser();
    const bankOnly = M.sanitizeWorkspace(clone({ ...emptyWorkspace(), intl: { invoices: {}, recurring: {}, clients: {}, settings } }));
    const file = JSON.stringify({ app: "proupiqr-workspace", formatVersion: 2, exportedAt: AT, workspace: primary, businesses: [{ id: PRIMARY_BOOK_ID, workspace: primary }, { id: "biz_banks001", workspace: bankOnly }] });
    const res = restoreBackup({ index: { ...emptyIndex(), owner: OWNER_A }, books: { [PRIMARY_BOOK_ID]: primary } }, file, PRIMARY_BOOK_ID, 20, NOW, true);
    assert.equal(res.kind, "done");
    const added = res.into.find((id) => id !== PRIMARY_BOOK_ID);
    assert.ok(added);
    assert.equal(res.shelf.books[added].business.updatedAt, 0);
    assert.equal(M.repairIntl(res.shelf.books[added], NOW + 1).intl.settings.swift, "HDFCINBB", "the restored bank details survive the repair");
  }

  /*
   * Review round 2: a stashed foreign section joins the stash only when written for the stash's owner (§2.4).
   * New code switched A -> B (A's section stashed), then older code switched back and forth, leaving it while the
   * stash now holds B's data: B's stash never shows A's bank details, and a switch to B never installs them.
   */
  {
    const s = installBrowser();
    s.setItem(OWNER_KEY, OWNER_A);
    L.saveWorkspace(M.sanitizeWorkspace(clone(book("Sharma Tuition", "sharma@okaxis"))));
    s.setItem(STASH_KEY, canonicalJson(book("Account B", "b@okaxis")));
    s.setItem(STASH_V2_KEY, JSON.stringify({ owner: OWNER_B, at: NOW, ids: [] }));
    const aIntl = foreign("Sharma Tuition", "sharma@okaxis").intl;
    s.setItem("proupiqr-stash-intl-v1:" + PRIMARY_BOOK_ID, canonicalJson({ owner: OWNER_A, intl: aIntl }));
    const stashed = L.loadStash();
    assert.equal(stashed.owner, OWNER_B);
    assert.equal(stashed.shelf.books[PRIMARY_BOOK_ID].intl, undefined, "B's stash never joins A's foreign section");
    assert.deepEqual(L.switchAccountStorage(OWNER_A, OWNER_B, L.loadIndex(), M.sanitizeWorkspace(clone(book("Account B", "b@okaxis"))), NOW + 1), { ok: true });
    assert.equal(L.loadBook(PRIMARY_BOOK_ID).intl, undefined, "B's first business gets none of A's foreign section");
    const homes = Object.entries(s.snapshot()).filter(([, v]) => v.includes(aIntl.settings.account)).map(([k, v]) => [k, JSON.parse(v).owner]);
    assert.deepEqual(homes, [["proupiqr-stash-intl-v1:" + PRIMARY_BOOK_ID, OWNER_A]], "A's section is stashed with A's books");
  }

  /*
   * Review round 2: older code switches B -> A (stashing B's extra book, leaving its sidecar), then new code
   * switches back to B and gives the book back (step 5). The copy from the stash has no foreign section; the
   * sidecar left in place is B's own again and joins it instead of being dropped. Also when a page load as A
   * couldn't set that sidecar aside first (storage full).
   */
  for (const variant of ["switch back right away", "sweep failed first"]) {
    let failAside = false;
    const s = installBrowser({ fail: (key) => failAside && key.startsWith("proupiqr-aside") });
    s.setItem(OWNER_KEY, OWNER_B);
    const ix = { ...indexWith(C), owner: OWNER_B };
    saveIndex(ix, true);
    L.saveBook(ix, PRIMARY_BOOK_ID, M.sanitizeWorkspace(clone(book("Account B", "b@okaxis"))));
    L.saveBook(ix, C, foreign("B extra", "bextra@okaxis"));
    assert.ok(s.getItem(L.intlKey(C)).includes("inv_usd00001"));
    assert.deepEqual(legacyStore.switchAccountStorage(OWNER_B, OWNER_A, legacyStore.loadShelf().shelf.index, legacyModel.sanitizeWorkspace(clone(book("Sharma Tuition", "sharma@okaxis"))), NOW), { ok: true });
    if (variant === "sweep failed first") {
      failAside = true;
      L.sweepStrayBooks(L.loadShelf().shelf.index);
      failAside = false;
      assert.ok(s.getItem(L.intlKey(C)), "the sidecar stayed (its set-aside copy failed)");
    }
    assert.deepEqual(L.switchAccountStorage(OWNER_A, OWNER_B, L.loadShelf().shelf.index, M.sanitizeWorkspace(clone(book("Account B", "b@okaxis"))), NOW + 9), { ok: true });
    const back = L.loadBook(C);
    assert.ok(back, `${variant}: the book is given back`);
    assert.equal(back.intl?.invoices.inv_usd00001?.currency, "USD", `${variant}: with its foreign invoice`);
    assert.equal(back.intl.settings.swift, "HDFCINBB", `${variant}: and its bank details`);
  }

  /*
   * Review round 2: another tab replaces a read-only business that has a foreign section with the server's copy.
   * Its writes (marker, sidecar, book key) reach this tab one at a time; the sidecar event comes while the book
   * key still holds the copy from before the reset and must not consume the reset. Three shapes: the book key
   * changes; only the sidecar changes; every write is visible before the first event arrives.
   */
  for (const shape of ["book key changes", "sidecar only", "all visible"]) {
    const s = installBrowser();
    s.setItem(OWNER_KEY, OWNER_A);
    const i = { ...indexWith(B), owner: OWNER_A };
    saveIndex(i);
    const server = foreign("Book Two", "two@okaxis");
    const serverNewer = M.upsertInvoice(server, { ...M.getInvoice(server, "inv_usd00001"), description: "edited elsewhere" }, T + 10);
    const device = shape === "sidecar only"
      ? M.sanitizeWorkspace(clone({ ...server, intl: { ...server.intl, settings: { ...settings, bankName: "Set aside bank", updatedAt: T + 5 } } }))
      : M.upsertInvoice(server, inv("inv_0000000x", "INV-0099", "cli_aaaaaaaa", 777700), T + 5);
    const resetTo = shape === "sidecar only" ? M.sanitizeWorkspace(clone({ ...server, intl: { ...server.intl, settings: { ...settings, updatedAt: T + 9 } } })) : serverNewer;
    assert.equal(L.saveBook(i, B, device), true);
    let tab2 = { index: i, books: { [B]: L.loadBook(B) } };
    const replaced = [];
    const off = L.onShelfChange(() => OWNER_A, () => tab2, {
      book(id, ws, replace) {
        if (replace) { replaced.push(id); tab2 = { ...tab2, books: { ...tab2.books, [id]: ws } }; return; }
        const value = M.repairIntl(M.mergeWorkspaces(tab2.books[id], ws), Date.now());
        L.saveBook(tab2.index, id, value);
        tab2 = { ...tab2, books: { ...tab2.books, [id]: value } };
      },
      index() {}, ownerChanged() {},
    });
    const before = new Map(s.map);
    const from = s.writes.length;
    assert.equal(L.resetBook(i, B, resetTo), true);
    const writes = s.writes.slice(from);
    const after = new Map(s.map);
    assert.deepEqual(writes, shape === "sidecar only" ? [BOOK_RESET_KEY, L.intlKey(B)] : [BOOK_RESET_KEY, L.intlKey(B), bookKey(B)], shape);
    if (shape !== "all visible") s.map = before;
    for (const key of writes) {
      if (shape !== "all visible") s.map.set(key, after.get(key));
      storageEvent(key, after.get(key));
    }
    off();
    assert.deepEqual(replaced, [B], `${shape}: replaced once`);
    const want = canonicalJson(M.pruneTombstones(L.loadBook(B), Date.now()));
    assert.equal(canonicalJson(M.pruneTombstones(tab2.books[B], Date.now())), want, `${shape}: this tab holds the stored copy`);
    assert.equal(want, canonicalJson(M.pruneTombstones(resetTo, Date.now())), `${shape}: storage holds the server's copy`);
    assert.equal(L.loadBook(B).invoices.inv_0000000x, undefined, `${shape}: the set-aside invoice doesn't come back`);
    assert.equal(L.loadBook(B).intl.settings.bankName, "HDFC Bank", `${shape}: the set-aside bank details don't come back`);
  }

  /*
   * Review round 3: tombstones older than 90 days are pruned before the split, so the book key holds exactly what
   * older code writes (else old and new tabs rewrite each other's key on every storage event), and the sidecar
   * keeps no pruned foreign tombstone either.
   */
  {
    const old = Date.now() - 200 * 86_400_000;
    let w = foreign("Book Two", "two@okaxis");
    w = M.deleteClient(M.upsertClient(w, client("cli_gone0001", "Gone"), old - 1000), "cli_gone0001", old);
    w = M.deleteInvoice(M.upsertInvoice(w, { ...inv("inv_eurgone1", "INV-0007", "cli_aaaaaaaa", 500), currency: "EUR" }, old - 1000), "inv_eurgone1", old);
    assert.ok(w.clients.cli_gone0001.deletedAt && w.intl.invoices.inv_eurgone1.deletedAt, "(both tombstones are in the copy being saved)");
    for (const id of [PRIMARY_BOOK_ID, B]) {
      const ix = id === PRIMARY_BOOK_ID ? emptyIndex() : indexWith(B);
      const s1 = installBrowser();
      s1.setItem(OWNER_KEY, OWNER_A);
      assert.equal(L.saveBook(ix, id, w), true);
      const ours = s1.getItem(bookKey(id));
      const side = s1.getItem(L.intlKey(id));
      const s2 = installBrowser();
      s2.setItem(OWNER_KEY, OWNER_A);
      assert.equal(legacyStore.saveBook(ix, id, legacyModel.sanitizeWorkspace(clone(w))), true);
      assert.equal(ours, s2.getItem(legacyStore.bookKey(id)), `${id}: the book key is byte for byte what older code writes`);
      assert.doesNotMatch(ours, /cli_gone0001/, `${id}: the 200-day tombstone is pruned`);
      assert.doesNotMatch(side, /inv_eurgone1/, `${id}: the sidecar holds no pruned foreign tombstone`);
      assert.match(side, /inv_usd00001/);
    }
  }

  /*
   * Review round 3: another account's sidecar (left by an older switch) that can't be set aside yet (that write
   * fails) is never removed: not by a switch (step 2 for an extra book, step 4 for the primary), nor by
   * setAsideOtherAccountBooks, retireBook or sweepStrayBooks. Once there is room it becomes a set-aside copy.
   */
  {
    const cSide = canonicalJson({ owner: OWNER_C, intl: M.sanitizeWorkspace({ intl: { invoices: { inv_usdcccc1: { ...inv("inv_usdcccc1", "C-1", "cli_aaaaaaaa", 4200), currency: "USD" } } } }).intl });
    const holders = (s) => Object.entries(s.snapshot()).filter(([, v]) => v.includes("inv_usdcccc1")).map(([k]) => k);
    const blockAside = (s) => { s.fail = (key) => key.startsWith("proupiqr-aside-intl-v1:"); };
    const thenRoom = (s, label) => {
      s.fail = () => false;
      const home = loadShelf();
      L.sweepStrayIntl(home.shelf.index);
      assert.ok(holders(s).some((k) => k.startsWith("proupiqr-aside-intl-v1:")), `${label}: set aside once there is room`);
      const copy = listAside().find((a) => a.workspace.intl?.invoices.inv_usdcccc1);
      assert.equal(copy?.reason, "other_account", label);
      for (const books of [JSON.stringify(home.shelf.books), JSON.stringify(loadShelf().shelf.books)]) assert.doesNotMatch(books, /inv_usdcccc1/, `${label}: never joined to a book`);
    };
    const device = (where) => {
      const s = installBrowser();
      s.setItem(OWNER_KEY, OWNER_A);
      const ix = { ...(where === PRIMARY_BOOK_ID ? emptyIndex() : indexWith(B)), owner: OWNER_A };
      saveIndex(ix, true);
      L.saveBook(ix, PRIMARY_BOOK_ID, book("A shop", "a@okaxis"));
      if (where !== PRIMARY_BOOK_ID) L.saveBook(ix, B, book("A second", "a2@okaxis"));
      s.setItem(L.intlKey(where), cSide);
      blockAside(s);
      return { s, ix };
    };
    for (const where of [PRIMARY_BOOK_ID, B]) {
      const { s, ix } = device(where);
      assert.deepEqual(switchAccountStorage(OWNER_A, OWNER_B, ix, M.sanitizeWorkspace(clone(book("B shop", "b@okaxis"))), NOW), { ok: true });
      assert.deepEqual(holders(s), [L.intlKey(where)], `switch, sidecar on ${where}: left where it was`);
      assert.equal(loadWorkspace().intl, undefined, "never joined to the new account's primary");
      thenRoom(s, `switch, sidecar on ${where}`);
    }
    {
      // The new primary has a foreign section of its own: the occupied slot fails the switch, nothing is lost.
      const { s, ix } = device(PRIMARY_BOOK_ID);
      const before = s.snapshot();
      assert.deepEqual(switchAccountStorage(OWNER_A, OWNER_B, ix, foreign("B shop", "b@okaxis", "inv_usdbbbb1"), NOW), { ok: false, reason: "storage" });
      assert.deepEqual(s.snapshot(), before, "a failed switch leaves storage as it was");
    }
    {
      // A sidecar the account signing in left behind (older code switched it away) joins its primary.
      const s = installBrowser();
      s.setItem(OWNER_KEY, OWNER_A);
      L.saveBook(emptyIndex(), PRIMARY_BOOK_ID, book("A shop", "a@okaxis"));
      s.setItem(L.intlKey(PRIMARY_BOOK_ID), cSide);
      blockAside(s);
      assert.deepEqual(switchAccountStorage(OWNER_A, OWNER_C, emptyIndex(), M.sanitizeWorkspace(clone(book("C shop", "c@okaxis"))), NOW), { ok: true });
      assert.equal(loadWorkspace().intl?.invoices.inv_usdcccc1?.currency, "USD", "C's own foreign invoice is in C's primary");
      assert.equal(JSON.parse(s.getItem(L.intlKey(PRIMARY_BOOK_ID))).owner, OWNER_C);
    }
    for (const how of ["setAsideOtherAccountBooks", "retireBook", "sweepStrayBooks"]) {
      const { s, ix } = device(B);
      L.saveBook(ix, B, withUnsynced(book("A second", "a2@okaxis")));
      if (how === "setAsideOtherAccountBooks") assert.equal(setAsideOtherAccountBooks(ix, OWNER_B), true);
      if (how === "retireBook") {
        saveIndex(deleteBook(ix, B, NOW));
        assert.equal(retireBook(B, null, OWNER_A, true), "removed");
      }
      if (how === "sweepStrayBooks") {
        saveIndex({ ...emptyIndex(), owner: OWNER_A }, true);
        assert.deepEqual(sweepStrayBooks(emptyIndex()), [B]);
      }
      assert.equal(s.getItem(bookKey(B)), null, `${how}: the book key goes`);
      assert.deepEqual(holders(s), [L.intlKey(B)], `${how}: another account's sidecar stays`);
      thenRoom(s, how);
    }
  }

  /*
   * Review round 3: putAside writes the foreign section first; when the INR key's write then fails, that section
   * goes back to what it was (removed, or the earlier copy), so a failed set-aside leaves no extra listed copy.
   */
  {
    const s = installBrowser();
    s.setItem(OWNER_KEY, OWNER_A);
    const ix = { ...indexWith(B), owner: OWNER_A };
    saveIndex(ix, true);
    const mixed = foreign("Book Two", "two@okaxis");
    L.saveBook(ix, B, mixed);
    const failInr = () => { s.fail = (key) => key === `proupiqr-aside-v1:${B}`; };
    failInr();
    assert.equal(setAside(B, "stray", mixed), false);
    assert.equal(s.getItem(`proupiqr-aside-intl-v1:${B}`), null, "no orphan foreign section");
    assert.deepEqual(listAside(), []);
    assert.ok(s.getItem(bookKey(B)) && s.getItem(L.intlKey(B)), "the book stays");
    s.fail = () => false;
    assert.equal(keepAside(B, "read_only", mixed), true);
    const sideBefore = s.getItem(`proupiqr-aside-intl-v1:${B}`);
    const listed = listAside();
    failInr();
    assert.equal(keepAside(B, "read_only", withUnsynced(foreign("Book Two", "two@okaxis", "inv_usd00009"))), false);
    assert.equal(s.getItem(`proupiqr-aside-intl-v1:${B}`), sideBefore, "the earlier foreign section is back");
    assert.deepEqual(listAside(), listed);
    s.fail = () => false;
  }

  /*
   * Review round 3: a reset to a server copy with no foreign section, whose INR part is unchanged, only removes the
   * sidecar (no book key write). Another tab still replaces its copy, so its next save doesn't bring the set-aside
   * foreign invoice back. Events arrive one at a time, as each write lands.
   */
  {
    const s = installBrowser();
    s.setItem(OWNER_KEY, OWNER_A);
    const i = { ...indexWith(B), owner: OWNER_A };
    saveIndex(i);
    const server = M.sanitizeWorkspace(clone(book("Book Two", "two@okaxis")));
    const device = M.upsertInvoice(server, { ...inv("inv_usd00001", "INV-0002", "cli_aaaaaaaa", 120050), currency: "USD" }, T + 5);
    assert.equal(L.saveBook(i, B, device), true);
    let tab2 = { index: i, books: { [B]: L.loadBook(B) } };
    const replaced = [];
    const off = L.onShelfChange(() => OWNER_A, () => tab2, {
      book(id, ws, replace) {
        if (replace) { replaced.push(id); tab2 = { ...tab2, books: { ...tab2.books, [id]: ws } }; return; }
        const value = M.repairIntl(M.mergeWorkspaces(tab2.books[id], ws), Date.now());
        L.saveBook(tab2.index, id, value);
        tab2 = { ...tab2, books: { ...tab2.books, [id]: value } };
      },
      index() {}, ownerChanged() {},
    });
    assert.equal(L.keepAside(B, "read_only", device), true);
    const bookBefore = s.getItem(bookKey(B));
    const before = new Map(s.map);
    assert.equal(L.resetBook(i, B, server), true);
    const after = new Map(s.map);
    assert.equal(after.get(bookKey(B)), bookBefore, "(the INR part didn't change)");
    assert.equal(after.has(L.intlKey(B)), false, "(the sidecar was removed)");
    s.map = before;
    s.map.set(BOOK_RESET_KEY, after.get(BOOK_RESET_KEY));
    storageEvent(BOOK_RESET_KEY, after.get(BOOK_RESET_KEY));
    s.map.delete(L.intlKey(B));
    storageEvent(L.intlKey(B), null);
    assert.deepEqual(replaced, [B], "the other tab replaced its copy");
    assert.equal(tab2.books[B].intl, undefined, "without the set-aside foreign invoice");
    L.saveBook(tab2.index, B, M.logReminder(tab2.books[B], "inv_00000001", "whatsapp", Date.now()));
    assert.equal(L.loadBook(B).intl, undefined, "its next save doesn't bring it back");
    assert.equal(listAside().find((a) => a.id === B)?.workspace.intl?.invoices.inv_usd00001?.currency, "USD", "it stays set aside");
    off();
  }

  /* Review round 4: a set-aside copy that is only a foreign section downloads tagged with the book it came from,
     and with an empty business (its "Clients abroad (…)" label is list metadata, never data). */
  {
    const s7 = installBrowser();
    s7.setItem(OWNER_KEY, OWNER_A);
    saveWorkspace(fp);
    saveIndex({ ...indexWith(B), owner: OWNER_A });
    saveBook({ ...indexWith(B), owner: OWNER_A }, B, foreign("Book Two", "two@okaxis", "inv_usd00002"));
    // An older tab switches to B: both of A's sidecars stay behind and are set aside by the next new-code load.
    legacyStore.switchAccountStorage(OWNER_A, OWNER_B, { ...indexWith(B), owner: OWNER_A }, legacyModel.sanitizeWorkspace(clone(book("Account B", "b@okaxis"))), NOW);
    sweepStrayBooks(loadShelf().shelf.index);
    const copies = listAside();
    const first = copies.find((a) => a.workspace.intl?.invoices.inv_usd00001);
    const second = copies.find((a) => a.workspace.intl?.invoices.inv_usd00002);
    assert.deepEqual([first.name, first.fromPrimary, first.origin, first.workspace.business.name], [L.OTHER_ACCOUNT_INTL, true, PRIMARY_BOOK_ID, ""], "the label is metadata; the copy's business is empty");
    assert.equal(second.origin, B);
    const file = L.asideBackupJson(first, AT);
    assert.doesNotMatch(file, /Clients abroad/, "the label never leaves the device as a business name");
    assert.equal(JSON.parse(file).businessId, PRIMARY_BOOK_ID, "tagged: it restores into the first business");
    // On A's device with two businesses and the second active: never merged into the active business silently.
    const Y = "biz_yyyyyyyy";
    const two = { index: { ...indexWith(Y), owner: OWNER_A }, books: { [PRIMARY_BOOK_ID]: M.withoutIntl(fp), [Y]: book("Acme Retail", "retail@okaxis") } };
    const asked = restoreBackup(two, file, Y, 20, NOW, true);
    assert.deepEqual([asked.kind, asked.target], ["confirm", PRIMARY_BOOK_ID], "it asks before merging into the first business");
    const applied = asked.apply();
    assert.deepEqual(applied.into, [PRIMARY_BOOK_ID]);
    assert.equal(applied.shelf.books[PRIMARY_BOOK_ID].intl.invoices.inv_usd00001.currency, "USD");
    assert.equal(applied.shelf.books[Y].intl, undefined, "the active business gets nothing");
    assert.equal(applied.shelf.books[PRIMARY_BOOK_ID].business.name, "Sharma Tuition");
    // Into a nameless first business: the name stays empty, and the business record never beats a real one.
    const nameless = restoreBackup({ index: emptyIndex(), books: { [PRIMARY_BOOK_ID]: emptyWorkspace() } }, file, PRIMARY_BOOK_ID, 1, NOW, true);
    assert.equal(nameless.kind, "done");
    assert.equal(nameless.shelf.books[PRIMARY_BOOK_ID].business.name, "");
    assert.equal(nameless.shelf.books[PRIMARY_BOOK_ID].intl.invoices.inv_usd00001.currency, "USD");
    const server = updateBusiness(emptyWorkspace(), { name: "B Ltd", upiId: "b@okaxis" }, T);
    for (const merged of [M.mergeWorkspaces(nameless.shelf.books[PRIMARY_BOOK_ID], server), M.mergeWorkspaces(server, nameless.shelf.books[PRIMARY_BOOK_ID])]) {
      assert.deepEqual([merged.business.name, merged.business.upiId], ["B Ltd", "b@okaxis"]);
    }
    // A non-primary book's section downloads as a single-business file under that book's id.
    const secondFile = JSON.parse(L.asideBackupJson(second, AT));
    assert.deepEqual([secondFile.app, secondFile.businesses[0].id, secondFile.businesses[0].workspace.business.name], ["proupiqr-business", B, ""]);
    const back = restoreBackup({ index: { ...indexWith(B), owner: OWNER_A }, books: { [PRIMARY_BOOK_ID]: M.withoutIntl(fp), [B]: M.withoutIntl(foreign("Book Two", "two@okaxis", "inv_usd00002")) } }, JSON.stringify(secondFile), B, 20, NOW, true);
    assert.equal(back.kind, "done");
    assert.deepEqual(back.into, [B], "back into the book it came from");
    assert.equal(back.shelf.books[B].business.name, "Book Two");
    // A copy with an INR part keeps today's files: a first business's stays a plain (untagged) workspace backup.
    const plain = { id: "biz_plain001", at: 1, reason: "other_account", name: "Kirana", fromPrimary: true, workspace: book("Kirana", "k@okaxis") };
    assert.equal(L.asideBackupJson(plain, AT), JSON.stringify({ app: "proupiqr-workspace", exportedAt: AT, workspace: plain.workspace }, null, 2));
    const other = { ...plain, fromPrimary: false };
    assert.equal(L.asideBackupJson(other, AT), backupJson({ index: indexWith(plain.id), books: { [plain.id]: plain.workspace } }, { book: plain.id }, AT));
  }

  /* Review round 4: an older tab retires a deleted business first (it sets aside the INR part under the book id and
     leaves the sidecar); the next new-code load joins the sidecar to that same copy, as retireBook does (§2.4). */
  {
    const s8 = installBrowser();
    s8.setItem(OWNER_KEY, OWNER_A);
    let ix8 = { ...indexWith(B), owner: OWNER_A };
    saveIndex(ix8);
    assert.equal(saveBook(ix8, B, foreign("Book Two", "two@okaxis", "inv_usd00002")), true);
    ix8 = deleteBook(ix8, B, T + 10);
    legacyStore.saveIndex(ix8);
    assert.equal(legacyStore.retireBook(B, legacyStore.loadBook(B), OWNER_A, false), "aside");
    assert.ok(s8.getItem(L.intlKey(B)), "(older code leaves the sidecar)");
    sweepStrayBooks(loadShelf().shelf.index);
    const one = listAside();
    assert.equal(one.length, 1, "one copy, not two");
    assert.deepEqual(
      [one[0].id, one[0].name, one[0].reason, Object.keys(one[0].workspace.clients), Object.keys(one[0].workspace.invoices), Object.keys(one[0].workspace.intl.invoices)],
      [B, "Book Two", "deleted_elsewhere", ["cli_aaaaaaaa"], ["inv_00000001"], ["inv_usd00002"]],
    );
    assert.deepEqual(intlKeys(s8), []);
    // Another account's sidecar next to that copy still gets a copy of its own.
    const s9 = installBrowser();
    s9.setItem(OWNER_KEY, OWNER_A);
    assert.equal(keepAside(B, "deleted_elsewhere", book("Book Two", "two@okaxis")), true);
    s9.setItem(L.intlKey(B), canonicalJson({ owner: OWNER_C, intl: fp.intl }));
    sweepStrayIntl(emptyIndex(), OWNER_A);
    const split = listAside();
    assert.equal(split.length, 2);
    assert.equal(split.find((a) => a.id === B).workspace.intl, undefined, "never joined to this account's copy");
    assert.equal(split.find((a) => a.id !== B).reason, "other_account");
  }

  /* §2.2: a first business whose book key is missing (a write that failed after its sidecar) keeps its sidecar. */
  {
    const s10 = installBrowser();
    s10.setItem(OWNER_KEY, OWNER_A);
    s10.setItem(L.intlKey(PRIMARY_BOOK_ID), canonicalJson({ owner: OWNER_A, intl: fp.intl }));
    const seeded = loadBook(PRIMARY_BOOK_ID);
    assert.equal(seeded.intl?.invoices.inv_usd00001.currency, "USD", "the seeded primary joins its sidecar");
    assert.equal(saveBook(emptyIndex(), PRIMARY_BOOK_ID, seeded), true);
    assert.ok(s10.getItem(WORKSPACE_KEY));
    assert.equal(JSON.parse(s10.getItem(L.intlKey(PRIMARY_BOOK_ID))).intl.invoices.inv_usd00001.currency, "USD", "the next save keeps the sidecar");
  }

  /* A set-aside first business with INR data only is written byte for byte as older code writes it. */
  {
    const realNow = Date.now;
    Date.now = () => NOW;
    try {
      const run = (S, M0) => {
        const sa = installBrowser();
        sa.setItem(OWNER_KEY, OWNER_A);
        S.saveWorkspace(M0.sanitizeWorkspace(clone(book("Sharma Tuition", "sharma@okaxis"))));
        // An ownerless stash that matches neither account: set aside as a first business (primary: true).
        sa.setItem(STASH_KEY, canonicalJson(book("Z shop", "z@okaxis")));
        assert.deepEqual(S.switchAccountStorage(OWNER_A, OWNER_B, emptyIndex(), M0.sanitizeWorkspace(clone(book("Account B", "b@okaxis"))), NOW), { ok: true });
        return Object.entries(sa.snapshot()).filter(([k]) => k.startsWith("proupiqr-aside")).map(([, v]) => v);
      };
      const ours = run(L, M);
      const theirs = run(legacyStore, legacyModel);
      assert.equal(ours.length, 1);
      assert.deepEqual(ours, theirs, "the same bytes as older code");
      assert.match(ours[0], /,"primary":true\}$/);
    } finally {
      Date.now = realNow;
    }
  }

  /* Review round 5: an INR-only copy merged with a nameless (erased) one stores what older code stores: name "",
     not the earlier copy's name (the label fallback is only for copies that are only a foreign section). */
  {
    const realNow = Date.now;
    Date.now = () => NOW;
    try {
      const run = (S, M0) => {
        const sa = installBrowser();
        sa.setItem(OWNER_KEY, OWNER_A);
        const named = M0.sanitizeWorkspace(clone(book("Sharma Tuition", "sharma@okaxis")));
        assert.equal(S.keepAside(B, "read_only", named), true);
        assert.equal(S.keepAside(B, "read_only", M0.eraseWorkspace(named, T + 99)), true);
        return [sa.getItem(`proupiqr-aside-v1:${B}`), S.listAside().map((a) => a.name)];
      };
      const [ours, oursNames] = run(L, M);
      const [theirs, theirNames] = run(legacyStore, legacyModel);
      assert.equal(ours, theirs, "the same bytes as older code");
      assert.deepEqual(oursNames, [""]);
      assert.deepEqual(theirNames, [""]);
    } finally {
      Date.now = realNow;
    }
  }

  /* Review round 5: an INR-only backup restored as a new business starts as older code starts it (business at
     `now`), named or nameless; only a backup with a foreign section starts from business time 0. */
  {
    const Z = "biz_zzzzzzzz";
    const restoredBusiness = (S, file) => {
      const shelfNow = { index: { ...indexWith(B), owner: OWNER_A }, books: { [PRIMARY_BOOK_ID]: book("Sharma Tuition", "sharma@okaxis"), [B]: book("Book Two", "two@okaxis") } };
      const asked = S.restoreBackup(shelfNow, file, PRIMARY_BOOK_ID, 20, NOW, true);
      assert.equal(asked.kind, "confirm");
      const done = asked.apply();
      assert.equal(done.into.length, 1);
      assert.notEqual(done.into[0], Z, "a new business with a fresh id");
      return done.shelf.books[done.into[0]];
    };
    const named = updateBusiness(book("Gupta Stores", "gupta@okaxis"), { phone: "9876543210" }, T);
    const nameless = updateBusiness(named, { name: "" }, T);
    for (const [what, ws] of [["named", named], ["nameless", nameless]]) {
      const file = backupJson({ index: indexWith(Z), books: { [Z]: ws } }, { book: Z }, AT);
      const ours = restoredBusiness(L, file);
      const theirs = restoredBusiness(legacyStore, file);
      assert.equal(canonicalJson(ours.business), canonicalJson(theirs.business), `${what}: the same business record as older code`);
      assert.equal(ours.business.updatedAt, NOW, what);
      assert.equal(canonicalJson(M.withoutIntl(ours)), canonicalJson(theirs), `${what}: the same book`);
    }
    // With a foreign section, a nameless backup's business comes along (time 0 start), so it never reads as an erase.
    const foreignNameless = M.sanitizeWorkspace(clone({ ...foreign("", "gupta@okaxis", "inv_usd00007"), business: { ...nameless.business } }));
    const withIntl = restoredBusiness(L, backupJson({ index: indexWith(Z), books: { [Z]: foreignNameless } }, { book: Z }, AT));
    assert.deepEqual([withIntl.business.upiId, withIntl.business.updatedAt], ["gupta@okaxis", T]);
    assert.equal(withIntl.intl.invoices.inv_usd00007.currency, "USD");
    assert.equal(M.repairIntl(withIntl, NOW + 1).intl.invoices.inv_usd00007.deletedAt, undefined, "not mistaken for an erase");
  }

  /* Review round 5: another account's stashed foreign section, left in the stash slot by an older tab's "Discard"
     and not yet set aside (storage full), is never merged into the stash of the account switching out. */
  {
    let blockAside = false;
    const s11 = installBrowser({ fail: (k) => blockAside && k.startsWith("proupiqr-aside-intl-v1:") });
    const stashIntl = "proupiqr-stash-intl-v1:biz_primary";
    s11.setItem(OWNER_KEY, OWNER_C);
    assert.equal(saveWorkspace(foreign("C shop", "c@okaxis", "inv_usdC0001")), true);
    assert.deepEqual(switchAccountStorage(OWNER_C, OWNER_A, emptyIndex(), M.sanitizeWorkspace(clone(book("Account A", "a@okaxis"))), NOW), { ok: true });
    assert.equal(JSON.parse(s11.getItem(stashIntl)).owner, OWNER_C);
    legacyStore.discardStash();
    assert.ok(s11.getItem(stashIntl), "(older code leaves the stashed foreign section)");
    assert.equal(saveWorkspace(foreign("Account A", "a@okaxis", "inv_usdA0001")), true);
    blockAside = true;
    loadShelf();
    const slot = s11.getItem(stashIntl);
    assert.equal(JSON.parse(slot).owner, OWNER_C, "(it couldn't be set aside: it stays in the slot)");
    const result = switchAccountStorage(OWNER_A, OWNER_B, loadShelf().shelf.index, M.sanitizeWorkspace(clone(book("Account B", "b@okaxis"))), NOW + 1);
    assert.deepEqual(result, { ok: false, reason: "storage" }, "the switch fails rather than mixing two accounts");
    assert.equal(s11.getItem(stashIntl), slot, "C's section is untouched and still tagged C");
    assert.equal(s11.getItem(OWNER_KEY), OWNER_A);
    assert.deepEqual(Object.keys(loadWorkspace().intl.invoices), ["inv_usdA0001"], "A keeps its own foreign invoice, and only that");
    // With room again: C's section is set aside as another account's, then A's own goes to the stash alone.
    blockAside = false;
    assert.deepEqual(switchAccountStorage(OWNER_A, OWNER_B, loadShelf().shelf.index, M.sanitizeWorkspace(clone(book("Account B", "b@okaxis"))), NOW + 2), { ok: true });
    const stashed = JSON.parse(s11.getItem(stashIntl));
    assert.deepEqual([stashed.owner, Object.keys(stashed.intl.invoices)], [OWNER_A, ["inv_usdA0001"]]);
    const theirs = listAside().find((a) => a.workspace.intl?.invoices.inv_usdC0001);
    assert.deepEqual([theirs.reason, theirs.origin, Object.keys(theirs.workspace.intl.invoices)], ["other_account", PRIMARY_BOOK_ID, ["inv_usdC0001"]]);
  }

  /* Review round 5: a copy that is only a foreign section and whose own id is a fresh one (not its book's id)
     downloads under the book it came from, and restores into that book. */
  {
    const X = "biz_xxxxxxxx";
    const proShelf = (books) => ({ index: { ...indexWith(X), owner: OWNER_A }, books: { [PRIMARY_BOOK_ID]: book("Sharma Tuition", "sharma@okaxis"), ...books } });
    const checkRoutes = (copy, label) => {
      assert.notEqual(copy.id, X, `${label}: (the copy's own id is a fresh one)`);
      assert.equal(copy.origin, X, label);
      const file = JSON.parse(L.asideBackupJson(copy, AT));
      assert.deepEqual([file.app, file.businesses[0].id], ["proupiqr-business", X], `${label}: the download names the book it came from`);
      const back = restoreBackup(proShelf({ [X]: book("Book X", "x@okaxis") }), JSON.stringify(file), X, 20, NOW, true);
      assert.equal(back.kind, "done", label);
      assert.deepEqual(back.into, [X], `${label}: restored into that book, never a new business`);
      assert.equal(Object.keys(back.shelf.books).length, 2, label);
      assert.equal(back.shelf.books[X].intl.invoices.inv_usd00002.currency, "USD", label);
    };
    // 1. A new-code switch A→B stashes book X's foreign section; an older tab's "Discard" leaves it, and the next
    //    new-code load (as B) sets it aside (reconcileStashIntl) under a fresh id.
    const s12 = installBrowser();
    s12.setItem(OWNER_KEY, OWNER_A);
    const ix = { ...indexWith(X), owner: OWNER_A };
    saveIndex(ix);
    assert.equal(saveBook(ix, X, foreign("Book X", "x@okaxis", "inv_usd00002")), true);
    assert.deepEqual(switchAccountStorage(OWNER_A, OWNER_B, ix, M.sanitizeWorkspace(clone(book("Account B", "b@okaxis"))), NOW), { ok: true });
    legacyStore.discardStash();
    assert.ok(s12.getItem(`proupiqr-stash-intl-v1:${X}`));
    loadShelf();
    const fromStash = listAside().find((a) => a.workspace.intl?.invoices.inv_usd00002);
    assert.equal(fromStash.reason, "other_account");
    assert.equal(L.intlOnly(fromStash.workspace), true);
    checkRoutes(fromStash, "stashed section");
    // 2. Another account's sidecar on a non-primary book, set aside when the book loads (sidecarIntl).
    const s13 = installBrowser();
    s13.setItem(OWNER_KEY, OWNER_B);
    const ixB = { ...indexWith(X), owner: OWNER_B };
    saveIndex(ixB);
    assert.equal(saveBook(ixB, X, book("Book X", "x@okaxis")), true);
    s13.setItem(L.intlKey(X), canonicalJson({ owner: OWNER_A, intl: foreign("Book X", "x@okaxis", "inv_usd00002").intl }));
    assert.equal(loadBook(X).intl, undefined, "never joined to B's book");
    const fromSidecar = listAside().find((a) => a.workspace.intl?.invoices.inv_usd00002);
    assert.equal(fromSidecar.reason, "other_account");
    checkRoutes(fromSidecar, "another account's sidecar");
    // 3. A first business's copy with no recorded origin (set aside by switch step 1 before a later step failed):
    //    a V1 file tagged biz_primary.
    const noOrigin = { id: "biz_n0origin", at: 1, reason: "stray", name: L.SET_ASIDE_INTL, fromPrimary: true, workspace: { ...emptyWorkspace(), intl: fp.intl } };
    const v1 = JSON.parse(L.asideBackupJson(noOrigin, AT));
    assert.deepEqual([v1.app, v1.businessId, v1.workspace.intl.invoices.inv_usd00001.currency], ["proupiqr-workspace", PRIMARY_BOOK_ID, "USD"]);
  }

  /* Review round 6: another account's sidecar in the slot when this account's set-aside or stashed foreign section
     goes home (an older tab switched back to A while B's section was in the slot) is set aside, never merged; with
     storage full, nothing is lost and it all goes home on a later load. */
  {
    const bForeign = M.sanitizeWorkspace(clone({ ...foreign("Account B", "b@okaxis", "inv_usdB0001"), intl: { ...foreign("Account B", "b@okaxis", "inv_usdB0001").intl, settings: { ...settings, accountName: "B Traders", account: "DE89370400440532013000" } } }));
    const holding = (st, invoiceId) => Object.entries(st.snapshot()).filter(([, v]) => v.includes(invoiceId)).map(([k]) => k);
    const setUp = (path, failing) => {
      let fail = null;
      const st = installBrowser({ fail: (k) => fail !== null && fail.test(k) });
      st.setItem(OWNER_KEY, OWNER_A);
      assert.equal(saveWorkspace(fp), true);
      if (path === "reclaim") {
        // An old tab signs in as B (A's sidecar stays); a new tab as B sets it aside and saves B's foreign section.
        assert.deepEqual(legacyStore.switchAccountStorage(OWNER_A, OWNER_B, emptyIndex(), legacyModel.sanitizeWorkspace(clone(M.withoutIntl(bForeign))), NOW), { ok: true });
        assert.equal(saveWorkspace(M.mergeWorkspaces(loadShelf().shelf.books[PRIMARY_BOOK_ID], bForeign)), true);
      } else {
        // A new-code switch stashes A's section under its own key (owner A); B's foreign section is saved.
        assert.deepEqual(switchAccountStorage(OWNER_A, OWNER_B, loadIndex(), M.withoutIntl(bForeign), NOW), { ok: true });
        assert.equal(saveWorkspace(M.mergeWorkspaces(loadWorkspace(), bForeign)), true);
      }
      assert.equal(JSON.parse(st.getItem(L.intlKey(PRIMARY_BOOK_ID))).owner, OWNER_B, `${path}: (B's section is in the slot)`);
      // An old tab switches back to A: it moves no sidecars, so B's stays in the slot.
      assert.deepEqual(legacyStore.switchAccountStorage(OWNER_B, OWNER_A, legacyStore.loadIndex(), legacyModel.sanitizeWorkspace(clone(M.withoutIntl(fp))), NOW + 5), { ok: true });
      fail = failing;
      return { st, unblock: () => { fail = null; } };
    };
    const homeAgain = (st, label) => {
      const a = loadShelf().shelf.books[PRIMARY_BOOK_ID];
      assert.deepEqual(Object.keys(a.intl?.invoices ?? {}), ["inv_usd00001"], `${label}: A's primary has A's foreign invoice and only that`);
      assert.equal(a.intl.settings.account, "GB82WEST12345698765432", `${label}: A's bank details`);
      const side = JSON.parse(st.getItem(L.intlKey(PRIMARY_BOOK_ID)));
      assert.deepEqual([side.owner, Object.keys(side.intl.invoices)], [OWNER_A, ["inv_usd00001"]], label);
      const theirs = listAside().filter((x) => x.workspace.intl?.invoices.inv_usdB0001);
      assert.equal(theirs.length, 1, label);
      assert.deepEqual([theirs[0].reason, Object.keys(theirs[0].workspace.intl.invoices), theirs[0].workspace.intl.settings.account], ["other_account", ["inv_usdB0001"], "DE89370400440532013000"], `${label}: B's section is set aside as another account's`);
      assert.equal(JSON.parse(st.getItem(`proupiqr-aside-intl-v1:${theirs[0].id}`)).owner, OWNER_B, label);
      assert.deepEqual(listAside().filter((x) => x.workspace.intl?.invoices.inv_usd00001), [], `${label}: nothing of A's left to download`);
    };
    for (const path of ["reclaim", "reconcile"]) {
      const source = path === "reclaim" ? "proupiqr-aside-intl-v1:" : "proupiqr-stash-intl-v1:biz_primary";
      // Plenty of room.
      let { st } = setUp(path, null);
      homeAgain(st, path);
      // The merged sidecar write fails: A's section stays where it was (its set-aside copy or its stash key).
      let un;
      ({ st, unblock: un } = setUp(path, /^proupiqr-intl-v1:biz_primary$/));
      let a = loadShelf().shelf.books[PRIMARY_BOOK_ID];
      assert.equal(a.intl?.invoices.inv_usdB0001, undefined, `${path}, sidecar write fails: B's section never joins A`);
      assert.ok(holding(st, "inv_usd00001").some((k) => k.startsWith(source)), `${path}, sidecar write fails: A's section is kept in ${source}`);
      assert.ok(holding(st, "inv_usdB0001").length > 0, `${path}, sidecar write fails: B's section is kept`);
      un();
      homeAgain(st, `${path}, later load`);
      // B's sidecar can't be set aside: it stays in the slot byte for byte, and A's section isn't merged over it.
      ({ st, unblock: un } = setUp(path, /^proupiqr-aside/));
      const bSide = st.getItem(L.intlKey(PRIMARY_BOOK_ID));
      a = loadShelf().shelf.books[PRIMARY_BOOK_ID];
      assert.equal(st.getItem(L.intlKey(PRIMARY_BOOK_ID)), bSide, `${path}, set-aside fails: B's sidecar is untouched`);
      assert.equal(a.intl, undefined, `${path}, set-aside fails: nothing joins A's primary yet`);
      assert.ok(holding(st, "inv_usd00001").some((k) => k.startsWith(source)), `${path}, set-aside fails: A's section is kept in ${source}`);
      un();
      homeAgain(st, `${path}, set-aside fails, later load`);
    }
  }

  /* Review round 6: a cloud-only business (live, synced, no book key on this device) never gets a sidecar from a
     set-aside or stashed foreign section: the pull's write would drop it. The copy waits until the book is here. */
  {
    const X = "biz_xxxxxxxx";
    for (const via of ["aside", "stash"]) {
      const st = installBrowser();
      st.setItem(OWNER_KEY, OWNER_A);
      savePlanLimit(OWNER_A, 20);
      const ix = { ...indexWith(X), owner: OWNER_A };
      saveIndex(ix);
      writeSyncMeta(OWNER_A, X, 3, "server-hash");
      const section = foreign("Book X", "x@okaxis", "inv_usd00002").intl;
      if (via === "aside") st.setItem(`proupiqr-aside-intl-v1:${X}`, JSON.stringify({ at: 1, reason: "stray", name: L.SET_ASIDE_INTL, owner: OWNER_A, book: X, intl: section }));
      else st.setItem(`proupiqr-stash-intl-v1:${X}`, canonicalJson({ owner: OWNER_A, intl: section }));
      const first = loadShelf();
      assert.deepEqual(first.cloudOnly, [X], `${via}: (the business is cloud-only here)`);
      assert.equal(st.getItem(L.intlKey(X)), null, `${via}: no sidecar for a business without a book key`);
      const waiting = listAside().filter((x) => x.workspace.intl?.invoices.inv_usd00002);
      assert.equal(waiting.length, 1, `${via}: the section stays listed`);
      // This account's own stashed section that can't go home is set aside as its own ("stray"), never as another account's.
      assert.equal(waiting[0].reason, "stray", `${via}: labelled as this account's`);
      assert.equal(waiting[0].origin, X, via);
      // The pull writes the server's copy, which has no foreign section yet: the invoice survives, and goes home.
      assert.equal(saveBook(ix, X, book("Book X", "x@okaxis")), true);
      const back = loadShelf().shelf.books[X];
      assert.equal(back.intl?.invoices.inv_usd00002.currency, "USD", `${via}: reclaimed once the book is on this device`);
      assert.deepEqual(listAside().filter((x) => x.workspace.intl), [], via);
    }
  }

  /* Review round 6: this account's leftover sidecar next to another account's copy under the same id gets a copy of
     its own, so it is never labelled (or reclaimable) as the other account's, nor theirs as this one's. */
  {
    const X = "biz_xxxxxxxx";
    const st = installBrowser();
    st.setItem(OWNER_KEY, OWNER_A);
    const theirKey = `proupiqr-aside-intl-v1:${X}`;
    st.setItem(theirKey, JSON.stringify({ at: 1, reason: "other_account", name: L.OTHER_ACCOUNT_INTL, owner: OWNER_C, book: X, intl: foreign("C shop", "c@okaxis", "inv_usdC0001").intl }));
    const theirs = st.getItem(theirKey);
    st.setItem(L.intlKey(X), canonicalJson({ owner: OWNER_A, intl: foreign("Book X", "x@okaxis", "inv_usd00002").intl }));
    assert.deepEqual(sweepStrayIntl(emptyIndex(), OWNER_A), [X]);
    assert.equal(st.getItem(L.intlKey(X)), null);
    assert.equal(st.getItem(theirKey), theirs, "the other account's copy is unchanged");
    const copies = listAside();
    assert.equal(copies.length, 2);
    const mine = copies.find((x) => x.id !== X);
    assert.deepEqual([mine.reason, mine.origin, Object.keys(mine.workspace.intl.invoices)], ["stray", X, ["inv_usd00002"]]);
    assert.equal(JSON.parse(st.getItem(`proupiqr-aside-intl-v1:${mine.id}`)).owner, OWNER_A);
  }

  /* Review round 6: a business given back at sign-in is written byte for byte as older code writes it (old
     tombstones are kept until the next save prunes them, as before). */
  {
    const old = NOW - 200 * 86_400_000;
    const D = "biz_dddddddd";
    const withOldTombstone = M.sanitizeWorkspace({ ...book("Rao Tuition", "rao@okaxis"), clients: { ...book("Rao Tuition", "rao@okaxis").clients, cli_00000009: { ...client("cli_00000009", "Old client"), createdAt: old - 1000, updatedAt: old, deletedAt: old } } });
    assert.ok(withOldTombstone.clients.cli_00000009.deletedAt, "(an old tombstone)");
    const giveBack = (S, model) => {
      const s = installBrowser();
      s.setItem(OWNER_KEY, OWNER_B);
      s.setItem(WORKSPACE_KEY, JSON.stringify(book("B shop", "b@okaxis")));
      s.setItem(STASH_KEY, JSON.stringify(book("A shop", "a@okaxis")));
      s.setItem(`proupiqr-stash-v2:${D}`, JSON.stringify(withOldTombstone));
      s.setItem(STASH_V2_KEY, JSON.stringify({ owner: OWNER_A, at: old, ids: [D] }));
      assert.deepEqual(S.switchAccountStorage(OWNER_B, OWNER_A, { ...emptyIndex(), owner: OWNER_B }, model.sanitizeWorkspace(clone(S.loadStash().shelf.books[PRIMARY_BOOK_ID])), NOW), { ok: true });
      return s.snapshot();
    };
    const ours = giveBack(L, M);
    const theirs = giveBack(legacyStore, legacyModel);
    assert.match(ours[bookKey(D)], /cli_00000009/);
    assert.equal(ours[bookKey(D)], theirs[bookKey(D)], "the given-back book key is what older code writes");
  }
}

console.log("[shelf] local storage, removal, account-switch stash, backups and bridges: all checks passed");
