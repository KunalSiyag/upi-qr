// Browser sync engine for several businesses (src/lib/workspace/sync.ts) against the real server logic
// (booksApi.ts on memory stores) behind a fake fetch: the legacy fallback, the rev/hash skip, 404/410/409/402
// handling (a 404 or 410 never deletes local data), the verified account-switch stash and set-aside.
import assert from "node:assert/strict";
import { installBrowser } from "./fake-storage.mjs";
import { getBook, getBookIndex, putBook, putBookIndex, ownerMismatch, deleteCloudCopy } from "../src/lib/workspace/booksApi.ts";
import { memoryCloudStore, readBookIndex, readWorkspace, slotFor, syncWorkspace } from "../src/lib/workspace/cloud.ts";
import { memoryProjectionStore } from "../src/lib/workspace/digest.ts";
import { memoryPaylinkStore } from "../src/lib/workspace/paylinks.ts";
import { planFromSubscription } from "../src/lib/workspace/entitlements.ts";
import { addBook, bookHash, deleteBook, emptyIndex, liveBookIds, PRIMARY_BOOK_ID } from "../src/lib/workspace/books.ts";
import { canonicalJson, emptyWorkspace, mergeWorkspaces, sanitizeWorkspace, updateBusiness, upsertClient, upsertInvoice } from "../src/lib/workspace/model.ts";
import {
  BOOK_INDEX_KEY, BOOK_SYNC_KEY, bookKey, listAside, loadBook, loadShelf, OWNER_KEY, readSyncMeta, retireBook, saveBook, saveIndex, STASH_KEY,
  STASH_V2_KEY, saveWorkspace, switchAccountStorage, WORKSPACE_KEY, writeSyncMeta,
} from "../src/lib/workspace/localStore.ts";
import { BOOKS_URL, createBookSync, createShelfSync, OWNER_MISMATCH, READ_ONLY, STASH_NO_ROOM, STASH_OCCUPIED, SYNC_URL } from "../src/lib/workspace/sync.ts";

const T = Date.UTC(2026, 9, 1);
const OWNER_A = "a".repeat(32);
const OWNER_B = "b".repeat(32);
const OWNER_C = "c".repeat(32);
const B = "biz_bbbbbbbb";
const C = "biz_cccccccc";
const sub = { provider: "dodo", subscriptionId: "sub_x", interval: "monthly", status: "active", currentEnd: Date.now() + 30 * 86_400_000, cancelAtCycleEnd: false, shortUrl: null, eventAt: 1, updatedAt: T };
const PLAN = { free: planFromSubscription(null), pro: planFromSubscription(sub) };
assert.deepEqual([PLAN.free.businesses, PLAN.pro.businesses], [1, 20]);
const client = { id: "cli_aaaaaaaa", name: "Rohan", phone: "", email: "", gstin: "", createdAt: T, updatedAt: T };
const inv = (id, number, amountPaise, at = T) => ({ id, number, clientId: client.id, issueDate: "2026-10-01", dueDate: "2026-10-15", amountPaise, description: "", payments: [], reminders: [], voided: false, createdAt: at, updatedAt: at });
const book = (name, upiId, amount = 300000) => upsertInvoice(upsertClient(updateBusiness(emptyWorkspace(), { name, upiId }, T), client, T), inv("inv_00000001", "INV-0001", amount), T);
const withInvoice = (ws, id, number, amount, at = T + 1000) => upsertInvoice(ws, inv(id, number, amount, at), at);
const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
globalThis.Clerk = { loaded: true, user: { id: "u" }, session: { getToken: async () => "tok" }, signOut: async () => {} };

/** The real request logic of /api/v1/workspace/ and the books routes, on memory stores, behind fetch. */
function fakeServer({ owner = OWNER_A, plan = "pro" } = {}) {
  const d = {
    docs: memoryCloudStore(), books: memoryCloudStore(), projections: memoryProjectionStore(), paylinks: memoryPaylinkStore(),
    plan: async () => PLAN[srv.plan], now: () => Date.now(), metric: async () => {},
  };
  // noIntl: a server from before ws.intl (a rollback): it drops the section and its replies carry no intl: 1.
  const srv = { d, owner, plan, legacy: false, offline: false, noIntl: false, calls: [], override: null };
  const strip = (b) => (b && b.workspace && typeof b.workspace === "object" ? { ...b, workspace: { ...b.workspace, intl: undefined } } : b);
  const out = (status, b) => {
    if (!srv.noIntl || !b || typeof b !== "object") return reply(status, b);
    const { intl: _flag, ...rest } = strip(b);
    return reply(status, rest);
  };
  globalThis.fetch = async (url, init = {}) => {
    const method = init.method || "GET";
    const sent = init.body ? JSON.parse(init.body) : undefined;
    const body = srv.noIntl ? strip(sent) : sent;
    srv.calls.push({ method, url, body: sent });
    if (srv.offline) throw new TypeError("Failed to fetch");
    const custom = srv.override?.(method, url, body);
    if (custom) return custom;
    if (url === SYNC_URL) {
      // As src/pages/api/v1/workspace/index.ts: replies carry intl: 1.
      if (method === "GET") return out(200, { ...(await readWorkspace(d.docs, srv.owner)), owner: srv.owner, intl: 1 });
      if (method === "DELETE") return reply(200, (await deleteCloudCopy(d, srv.owner)).body);
      const mismatch = ownerMismatch(body, srv.owner);
      if (mismatch) return reply(mismatch.status, mismatch.body);
      const result = await syncWorkspace(d.docs, srv.owner, body.workspace, Date.now());
      return out(200, { workspace: result.workspace, rev: result.rev, owner: srv.owner, intl: 1 });
    }
    if (srv.legacy && url.startsWith(BOOKS_URL)) return new Response("<html>404</html>", { status: 404 });
    let result;
    if (url === BOOKS_URL) result = method === "GET" ? await getBookIndex(d, srv.owner) : await putBookIndex(d, srv.owner, body, async () => true);
    else {
      const id = url.slice(BOOKS_URL.length, -1);
      result = method === "GET" ? await getBook(d, srv.owner, id) : await putBook(d, srv.owner, id, body);
    }
    return out(result.status, result.body);
  };
  srv.count = (pred) => srv.calls.filter(pred).length;
  srv.bookCalls = () => srv.calls.filter((c) => c.url.startsWith(BOOKS_URL) && c.url !== BOOKS_URL);
  /** Another device writes directly (the server's own merge). */
  srv.write = async (id, ws) => syncWorkspace(d.docs, slotFor(srv.owner, id), ws, Date.now());
  srv.doc = async (id) => (await readWorkspace(d.docs, slotFor(srv.owner, id)));
  srv.index = async () => (await readBookIndex(d.books, srv.owner)).index;
  return srv;
}

/** PaymentsWorkspace's side of the engine, in memory (same callbacks, same storage helpers). */
function host({ withReset = false, ...extra } = {}) {
  let shelf = loadShelf().shelf;
  const h = { states: [], retired: [], ownerChanged: 0, asides: 0 };
  const engine = createShelfSync({
    getIndex: () => shelf.index,
    applyIndex: (index) => { saveIndex(index); shelf = { index, books: shelf.books }; },
    getBook: (id) => shelf.books[id] ?? null,
    applyBook: (id, ws) => {
      if (!liveBookIds(shelf.index).includes(id)) return false;
      const value = shelf.books[id] ? mergeWorkspaces(shelf.books[id], ws) : ws;
      shelf = { index: shelf.index, books: { ...shelf.books, [id]: value } };
      return saveBook(shelf.index, id, value);
    },
    replaceShelf: (next) => { shelf = next; },
    retire: (id) => {
      const stored = loadBook(id);
      if (!shelf.books[id] && !stored) return;
      const result = retireBook(id, shelf.books[id] ?? stored, engine.owner(), stored === null);
      h.retired.push([id, result]);
      if (result !== "kept") { const { [id]: _gone, ...rest } = shelf.books; shelf = { index: shelf.index, books: rest }; }
    },
    onState: (s) => h.states.push(s),
    onOwnerChanged: () => { h.ownerChanged++; },
    clerkTimeoutMs: 50,
    ...(withReset ? {
      resetBook: (id, ws) => { shelf = { index: shelf.index, books: { ...shelf.books, [id]: ws } }; return saveBook(shelf.index, id, ws); },
      onAside: () => { h.asides++; },
    } : {}),
    ...extra,
  });
  h.engine = engine;
  h.shelf = () => shelf;
  h.state = () => h.states.at(-1);
  h.edit = (id, ws) => {
    shelf = { index: shelf.index, books: { ...shelf.books, [id]: ws } };
    saveBook(shelf.index, id, ws);
    engine.changed(id);
  };
  return h;
}

/** Tab 1's account switch A → B on the same device storage. */
function tabOneSwitches() {
  return switchAccountStorage(OWNER_A, OWNER_B, loadShelf().shelf.index, book("B shop", "bshop@okaxis"), Date.now());
}

/** A browser holding the old single workspace, as every device does today. */
function oldDevice(ws, owner = null) {
  const store = installBrowser();
  store.setItem(WORKSPACE_KEY, JSON.stringify(ws));
  if (owner) store.setItem(OWNER_KEY, owner);
  return store;
}
/** A browser with the primary and extra books (planted keys + index). */
function shelfDevice(books, owner = OWNER_A) {
  const store = installBrowser();
  store.setItem(OWNER_KEY, owner);
  let index = { ...emptyIndex(), owner };
  for (const id of Object.keys(books)) if (id !== PRIMARY_BOOK_ID) index = addBook(index, id, T);
  saveIndex(index);
  for (const [id, ws] of Object.entries(books)) saveBook(index, id, ws);
  return store;
}
const primary = book("Sharma Tuition", "sharma@okaxis");
const two = book("Book Two", "two@okaxis", 450000);
const three = book("Book Three", "three@okaxis", 120000);

/* ---------- legacy server: /books/ answers 404 → the primary syncs exactly as before ---------- */
{
  const store = shelfDevice({ [PRIMARY_BOOK_ID]: primary, [B]: two });
  const srv = fakeServer();
  srv.legacy = true;
  const plantedBook = store.getItem(bookKey(B));
  const plantedIndex = store.getItem(BOOK_INDEX_KEY);
  const h = host();
  await h.engine.start();
  assert.deepEqual(srv.calls.slice(0, 2).map((c) => `${c.method} ${c.url}`), [`GET ${BOOKS_URL}`, `GET ${SYNC_URL}`]);
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(srv.calls.slice(2).map((c) => `${c.method} ${c.url}`), [`PUT ${SYNC_URL}`], "local data uploaded through the primary route");
  assert.equal(srv.calls[2].body.expectedOwner, OWNER_A);
  assert.equal(h.state().status, "synced");
  assert.equal(h.state().legacy, true);
  assert.equal(h.state().books[B], "paused");
  assert.equal(srv.bookCalls().length, 0, "no book route is ever called on a legacy server");
  assert.equal(await h.engine.flush(B), false, "paused books never push");
  h.edit(PRIMARY_BOOK_ID, withInvoice(h.shelf().books[PRIMARY_BOOK_ID], "inv_00000002", "INV-0002", 50000));
  assert.equal(await h.engine.flush(PRIMARY_BOOK_ID), true);
  assert.equal(srv.bookCalls().length, 0);
  assert.equal(store.getItem(bookKey(B)), plantedBook, "the extra book's key is never touched");
  assert.equal(JSON.parse(store.getItem(BOOK_INDEX_KEY)).books[B].deletedAt, undefined);
  assert.deepEqual(Object.keys(JSON.parse(store.getItem(BOOK_INDEX_KEY)).books), Object.keys(JSON.parse(plantedIndex).books));
  const server = await srv.doc(PRIMARY_BOOK_ID);
  assert.deepEqual(Object.keys(server.workspace.invoices).sort(), ["inv_00000001", "inv_00000002"]);
  assert.equal(server.workspace.business.name, "Sharma Tuition", "Book Two never reaches the primary slot");
  // syncNow on a legacy server pushes the primary (as before).
  const before = srv.calls.length;
  h.engine.syncNow();
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(srv.calls.slice(before).map((c) => `${c.method} ${c.url}`), [`PUT ${SYNC_URL}`]);
  h.engine.stop();
}

/* A server that answers /books/ with something that isn't an index (an old route or a mock) is legacy too. */
{
  oldDevice(primary, OWNER_A);
  const srv = fakeServer();
  srv.override = (method, url) => (url === BOOKS_URL ? reply(200, { workspace: primary, rev: 1, owner: OWNER_A }) : undefined);
  const h = host();
  await h.engine.start();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(h.state().legacy, true);
  assert.equal(h.state().status, "synced");
  h.engine.stop();
}

/* ---------- old single workspace on the new server: unchanged data, then the rev/hash skip ---------- */
{
  const store = oldDevice(primary);
  const srv = fakeServer();
  let h = host();
  await h.engine.start();
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(srv.calls.map((c) => `${c.method} ${c.url}`), [`GET ${BOOKS_URL}`, `GET ${SYNC_URL}`, `PUT ${SYNC_URL}`]);
  assert.equal(h.state().status, "synced");
  assert.equal(h.state().legacy, false);
  assert.deepEqual(h.state().plan, { id: "pro", businesses: 20 });
  assert.equal(store.getItem(OWNER_KEY), OWNER_A);
  const local = sanitizeWorkspace(JSON.parse(store.getItem(WORKSPACE_KEY)));
  assert.equal(canonicalJson(local), canonicalJson(sanitizeWorkspace(primary)), "the primary's content is unchanged");
  const meta = readSyncMeta();
  assert.deepEqual(meta, { owner: OWNER_A, books: { biz_primary: { rev: 1, hash: bookHash((await srv.doc(PRIMARY_BOOK_ID)).workspace), fx: 1 } } });
  assert.deepEqual(JSON.parse(store.getItem(BOOK_INDEX_KEY)), { v: 1, owner: OWNER_A, books: { biz_primary: { id: "biz_primary", createdAt: 0 } } });
  assert.equal(srv.bookCalls().length, 0);
  h.engine.stop();

  // Reload with nothing changed anywhere: one request.
  srv.calls.length = 0;
  h = host();
  await h.engine.start();
  assert.deepEqual(srv.calls.map((c) => `${c.method} ${c.url}`), [`GET ${BOOKS_URL}`]);
  assert.equal(h.state().status, "synced");
  assert.equal(h.state().books[PRIMARY_BOOK_ID], "synced");
  h.engine.stop();

  // Another device changed the server copy: one pull, no push.
  await srv.write(PRIMARY_BOOK_ID, withInvoice(primary, "inv_00000003", "INV-0003", 70000));
  srv.calls.length = 0;
  h = host();
  await h.engine.start();
  assert.deepEqual(srv.calls.map((c) => `${c.method} ${c.url}`), [`GET ${BOOKS_URL}`, `GET ${SYNC_URL}`]);
  assert.ok(h.shelf().books[PRIMARY_BOOK_ID].invoices.inv_00000003);
  assert.equal(readSyncMeta().books[PRIMARY_BOOK_ID].rev, 2);
  h.engine.stop();

  // Only this device changed (edited while the page was closed): one push, no pull.
  const edited = withInvoice(sanitizeWorkspace(JSON.parse(store.getItem(WORKSPACE_KEY))), "inv_00000004", "INV-0004", 80000);
  store.setItem(WORKSPACE_KEY, canonicalJson(edited));
  srv.calls.length = 0;
  h = host();
  await h.engine.start();
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(srv.calls.map((c) => `${c.method} ${c.url}`), [`GET ${BOOKS_URL}`, `PUT ${SYNC_URL}`]);
  assert.ok((await srv.doc(PRIMARY_BOOK_ID)).workspace.invoices.inv_00000004);
  h.engine.stop();
}

/* ---------- three unchanged books: one request; extra books through their own routes only ---------- */
{
  const store = shelfDevice({ [PRIMARY_BOOK_ID]: primary, [B]: two, [C]: three });
  const srv = fakeServer({ plan: "pro" });
  let h = host();
  const primaryRaw = store.getItem(WORKSPACE_KEY);
  await h.engine.start();
  await new Promise((r) => setTimeout(r, 30));
  const put = srv.calls.find((c) => c.method === "PUT" && c.url === BOOKS_URL);
  assert.ok(put, "the local books are registered with one index PUT");
  assert.equal(put.body.expectedOwner, OWNER_A);
  assert.equal(put.body.index.owner, undefined, "the local owner tag is never sent");
  assert.deepEqual(liveBookIds(await srv.index()), [PRIMARY_BOOK_ID, B, C].sort((a, b) => (a === PRIMARY_BOOK_ID ? -1 : b === PRIMARY_BOOK_ID ? 1 : a < b ? -1 : 1)));
  assert.equal((await srv.doc(B)).workspace.business.name, "Book Two");
  assert.equal((await srv.doc(C)).workspace.business.name, "Book Three");
  assert.equal((await srv.doc(PRIMARY_BOOK_ID)).workspace.business.name, "Sharma Tuition");
  assert.ok(srv.calls.some((c) => c.method === "PUT" && c.url === `${BOOKS_URL}${B}/` && c.body.expectedOwner === OWNER_A));
  assert.equal(srv.calls.filter((c) => c.url === SYNC_URL && c.method === "PUT").every((c) => c.body.workspace.business.name === "Sharma Tuition"), true);
  assert.equal(store.getItem(WORKSPACE_KEY), primaryRaw, "syncing other books never writes the primary key");
  assert.deepEqual(Object.keys(readSyncMeta().books).sort(), [B, C, PRIMARY_BOOK_ID]);
  assert.deepEqual(h.state().books, { biz_primary: "synced", [B]: "synced", [C]: "synced" });
  h.engine.stop();
  srv.calls.length = 0;
  h = host();
  await h.engine.start();
  assert.deepEqual(srv.calls.map((c) => `${c.method} ${c.url}`), [`GET ${BOOKS_URL}`], "a 3-book account that changed nothing costs one request");
  h.engine.stop();

  // A book created on another device is downloaded into its own key.
  const D = "biz_dddddddd";
  await putBookIndex(srv.d, OWNER_A, { index: addBook(await srv.index(), D, T), expectedOwner: OWNER_A }, async () => true);
  await srv.write(D, book("Book Four", "four@okaxis"));
  h = host();
  await h.engine.start();
  assert.equal(sanitizeWorkspace(JSON.parse(store.getItem(bookKey(D)))).business.name, "Book Four");
  assert.equal(store.getItem(WORKSPACE_KEY), primaryRaw);
  h.engine.stop();
}

/* ---------- plan limit: rejected books stay local ("limit"), no retry storm ---------- */
{
  const store = shelfDevice({ [PRIMARY_BOOK_ID]: primary, [B]: two });
  const srv = fakeServer({ plan: "free" });
  const h = host();
  await h.engine.start();
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(h.state().books[B], "limit");
  assert.equal(h.state().status, "synced", "a limited book doesn't make the whole state an error");
  assert.equal(srv.bookCalls().length, 0);
  assert.equal(store.getItem(bookKey(B)) !== null, true, "never removed");
  assert.equal(liveBookIds(h.shelf().index).includes(B), true);
  const puts = srv.count((c) => c.method === "PUT" && c.url === BOOKS_URL);
  await h.engine.refreshIndex();
  await h.engine.refreshIndex();
  assert.equal(srv.count((c) => c.method === "PUT" && c.url === BOOKS_URL), puts, "the rejected id isn't PUT again this session");
  h.engine.stop();
}

/* ---------- index PUT fails (503): unregistered, nothing deleted ---------- */
{
  const store = shelfDevice({ [PRIMARY_BOOK_ID]: primary, [B]: two });
  const srv = fakeServer();
  srv.override = (method, url) => (method === "PUT" && url === BOOKS_URL ? reply(503, { error: "down" }) : undefined);
  const h = host();
  await h.engine.start();
  assert.equal(h.state().books[B], "unregistered");
  assert.equal(srv.bookCalls().length, 0, "no pull, no push while unregistered");
  assert.equal(store.getItem(bookKey(B)), canonicalJson(sanitizeWorkspace(two)));
  // The retry registers it and uploads it.
  srv.override = null;
  await h.engine.refreshIndex();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(h.state().books[B], "synced");
  assert.equal((await srv.doc(B)).workspace.business.name, "Book Two");
  h.engine.stop();
}

/* ---------- 404 / 410 on a book never delete; only the index tombstone does ---------- */
{
  const store = shelfDevice({ [PRIMARY_BOOK_ID]: primary, [B]: two });
  const srv = fakeServer();
  let h = host();
  await h.engine.start();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(h.state().books[B], "synced");
  h.engine.stop();
  // 404 unknown_business on push: unregistered, the index PUT is retried, nothing removed.
  srv.override = (method, url) => (url === `${BOOKS_URL}${B}/` ? reply(404, { code: "unknown_business" }) : undefined);
  h = host();
  await h.engine.start();
  h.edit(B, withInvoice(h.shelf().books[B], "inv_00000005", "INV-0005", 1000));
  assert.equal(await h.engine.flush(B), false);
  assert.equal(h.state().books[B], "unregistered");
  assert.ok(store.getItem(bookKey(B)).includes("inv_00000005"));
  h.engine.stop();
  // 410 that the index doesn't confirm: the book stays.
  srv.override = (method, url) => (method === "PUT" && url === `${BOOKS_URL}${B}/` ? reply(410, { code: "business_deleted" }) : undefined);
  srv.calls.length = 0;
  h = host();
  await h.engine.start();
  await new Promise((r) => setTimeout(r, 30));
  assert.ok(store.getItem(bookKey(B)), "a 410 alone never removes local data");
  assert.deepEqual(h.retired, []);
  assert.equal(h.state().books[B], "deleted");
  assert.equal(srv.count((c) => c.method === "PUT" && c.url === `${BOOKS_URL}${B}/`), 1, "an unconfirmed 410 isn't retried in a loop");
  assert.equal(srv.count((c) => c.method === "GET" && c.url === BOOKS_URL), 2, "start, then one index check that doesn't confirm it");
  h.engine.stop();
  // Deleted on another device while this one holds unsynced edits: set aside for download, then removed.
  srv.override = null;
  await putBookIndex(srv.d, OWNER_A, { index: deleteBook(await srv.index(), B, Date.now()), expectedOwner: OWNER_A }, async () => true);
  h = host();
  await h.engine.start();
  assert.deepEqual(h.retired, [[B, "aside"]]);
  assert.equal(store.getItem(bookKey(B)), null);
  assert.equal(listAside()[0].id, B);
  assert.ok(listAside()[0].workspace.invoices.inv_00000005, "the unsynced receipt is kept in the set-aside copy");
  assert.equal(JSON.parse(store.getItem(BOOK_INDEX_KEY)).books[B].deletedAt !== undefined, true);
  assert.equal(h.shelf().books[B], undefined);
  h.engine.stop();
}
{
  // Deleted elsewhere, nothing unsynced here: removed without a set-aside copy.
  const store = shelfDevice({ [PRIMARY_BOOK_ID]: primary, [B]: two });
  const srv = fakeServer();
  let h = host();
  await h.engine.start();
  await new Promise((r) => setTimeout(r, 20));
  h.engine.stop();
  await putBookIndex(srv.d, OWNER_A, { index: deleteBook(await srv.index(), B, Date.now()), expectedOwner: OWNER_A }, async () => true);
  h = host();
  await h.engine.start();
  assert.deepEqual(h.retired, [[B, "removed"]]);
  assert.equal(store.getItem(bookKey(B)), null);
  assert.deepEqual(listAside(), []);
  h.engine.stop();
}

/* ---------- 402 plan_read_only (downgraded extra book) and 409 owner_mismatch ---------- */
{
  const store = shelfDevice({ [PRIMARY_BOOK_ID]: primary, [B]: two });
  const srv = fakeServer({ plan: "pro" });
  let h = host();
  await h.engine.start();
  await new Promise((r) => setTimeout(r, 20));
  h.engine.stop();
  srv.plan = "free";
  h = host();
  await h.engine.start();
  const edited = withInvoice(h.shelf().books[B], "inv_00000006", "INV-0006", 6000);
  h.edit(B, edited);
  assert.equal(await h.engine.flush(B), false);
  assert.equal(h.state().books[B], "read_only");
  assert.equal(h.states.some((s) => s.books[B] === "read_only"), true);
  assert.ok(store.getItem(bookKey(B)).includes("inv_00000006"), "edits made before the downgrade stay on this device");
  const puts = srv.count((c) => c.url === `${BOOKS_URL}${B}/` && c.method === "PUT");
  h.engine.changed(B);
  assert.equal(await h.engine.flush(B), false);
  assert.equal(srv.count((c) => c.url === `${BOOKS_URL}${B}/` && c.method === "PUT"), puts, "no retries while read-only");
  assert.equal(h.state().status, "synced", "read-only never shows as a sync error");
  assert.equal(READ_ONLY, "This business is read-only on the Free plan. Upgrade to edit it again.");
  h.engine.stop();

  // The session's account changed under this tab: every engine stops, the caller reloads, nothing is written.
  srv.plan = "pro";
  srv.override = (method, url, body) => (method === "PUT" && body?.expectedOwner === OWNER_A ? reply(409, { code: "owner_mismatch" }) : undefined);
  h = host();
  await h.engine.start();
  h.edit(PRIMARY_BOOK_ID, withInvoice(h.shelf().books[PRIMARY_BOOK_ID], "inv_00000008", "INV-0008", 800));
  assert.equal(await h.engine.flush(PRIMARY_BOOK_ID), false);
  assert.equal(h.ownerChanged, 1);
  assert.deepEqual([h.state().status, h.state().message], ["error", OWNER_MISMATCH]);
  const after = srv.calls.length;
  h.engine.changed(PRIMARY_BOOK_ID);
  h.engine.syncNow();
  assert.equal(await h.engine.flush(PRIMARY_BOOK_ID), false);
  assert.equal(srv.calls.length, after, "a stopped engine sends nothing");
  assert.ok(store.getItem(WORKSPACE_KEY).includes("inv_00000008"), "local edits kept");
  h.engine.stop();
}

/* ---------- a late answer for another book never merges ---------- */
{
  installBrowser();
  const srv = fakeServer();
  srv.override = (method, url) => (url === `${BOOKS_URL}${B}/` ? reply(200, { workspace: three, rev: 9, owner: OWNER_A, businessId: C }) : undefined);
  const applied = [];
  const statuses = [];
  const engine = createBookSync(B, { owner: () => OWNER_A, get: () => two, apply: (ws) => { applied.push(ws); return true; }, onStatus: (s) => statuses.push(s) });
  await engine.pull();
  assert.deepEqual(applied, []);
  assert.equal(statuses.at(-1), "error");
  engine.stop();
}

/* ---------- account switch: the previous account's books are moved aside, never uploaded ---------- */
{
  const store = shelfDevice({ [PRIMARY_BOOK_ID]: primary, [B]: two });
  const srv = fakeServer({ owner: OWNER_B });
  await srv.write(PRIMARY_BOOK_ID, book("Account B Shop", "bshop@okaxis"));
  const rawPrimary = store.getItem(WORKSPACE_KEY);
  const rawB = store.getItem(bookKey(B));
  const h = host();
  await h.engine.start();
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(srv.calls.slice(0, 2).map((c) => `${c.method} ${c.url}`), [`GET ${BOOKS_URL}`, `GET ${SYNC_URL}`]);
  assert.equal(srv.count((c) => c.method === "PUT"), 0, "account B receives no index or book writes from A's books");
  assert.equal(store.getItem(STASH_KEY), rawPrimary);
  assert.equal(store.getItem("proupiqr-stash-v2:" + B), rawB);
  assert.equal(store.getItem(bookKey(B)), null);
  assert.equal(store.getItem(OWNER_KEY), OWNER_B);
  assert.equal(JSON.parse(store.getItem(STASH_V2_KEY)).owner, OWNER_A);
  assert.equal(h.shelf().books[PRIMARY_BOOK_ID].business.name, "Account B Shop");
  assert.deepEqual(Object.keys(h.shelf().books), [PRIMARY_BOOK_ID]);
  assert.equal(h.state().status, "synced");
  assert.match(h.state().message, /previous account's data on this device was set aside/);
  assert.equal(readSyncMeta().owner, OWNER_B);
  h.engine.stop();
}
{
  // Legacy server, same rule.
  const store = oldDevice(primary, OWNER_A);
  const srv = fakeServer({ owner: OWNER_B });
  srv.legacy = true;
  const h = host();
  await h.engine.start();
  assert.equal(srv.count((c) => c.method === "PUT"), 0);
  assert.equal(sanitizeWorkspace(JSON.parse(store.getItem(STASH_KEY))).business.name, "Sharma Tuition");
  assert.equal(store.getItem(OWNER_KEY), OWNER_B);
  h.engine.stop();
}
{
  // A stash of a third account is still on this device: nothing is moved or adopted.
  const store = shelfDevice({ [PRIMARY_BOOK_ID]: primary, [B]: two });
  store.setItem(STASH_KEY, canonicalJson(book("Account C", "c@okaxis")));
  store.setItem(STASH_V2_KEY, JSON.stringify({ owner: OWNER_C, at: 1, ids: [] }));
  const before = store.snapshot();
  const srv = fakeServer({ owner: OWNER_B });
  const h = host();
  await h.engine.start();
  assert.deepEqual([h.state().status, h.state().message], ["error", STASH_OCCUPIED]);
  assert.deepEqual(store.snapshot(), before);
  assert.equal(srv.count((c) => c.method === "PUT"), 0);
  h.engine.stop();
}
{
  // Storage full while moving: the previous owner stays, everything is restored.
  const store = shelfDevice({ [PRIMARY_BOOK_ID]: primary, [B]: two });
  store.fail = (key) => key === "proupiqr-stash-v2:" + B;
  const before = store.snapshot();
  const srv = fakeServer({ owner: OWNER_B });
  const h = host();
  await h.engine.start();
  assert.deepEqual([h.state().status, h.state().message], ["error", STASH_NO_ROOM]);
  assert.deepEqual(store.snapshot(), before);
  assert.equal(srv.count((c) => c.method === "PUT"), 0);
  h.engine.stop();
}

/* ---------- review repros R1, R2, R6, R7 and legacy hardening ---------- */
{
  // R1: A → B → A with the engine: A's own data comes back, nothing of A reaches B, B's data is set aside.
  const store = installBrowser();
  const aLocal = withInvoice(book("Sharma Tuition (A)", "sharma@okaxis"), "inv_0000000a", "INV-000A", 5000);
  store.setItem(WORKSPACE_KEY, JSON.stringify(aLocal));
  store.setItem(OWNER_KEY, OWNER_A);
  const srv = fakeServer({ owner: OWNER_B });
  await srv.write(PRIMARY_BOOK_ID, book("B Shop", "bshop@okaxis"));
  let h = host();
  await h.engine.start();
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual([h.state().status, store.getItem(OWNER_KEY)], ["synced", OWNER_B]);
  h.engine.stop();
  srv.owner = OWNER_A;
  await srv.write(PRIMARY_BOOK_ID, book("Sharma Tuition (A)", "sharma@okaxis"));
  srv.calls.length = 0;
  h = host();
  await h.engine.start();
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual([h.state().status, store.getItem(OWNER_KEY), h.shelf().books[PRIMARY_BOOK_ID].business.name], ["synced", OWNER_A, "Sharma Tuition (A)"]);
  assert.match(h.state().message, /previous account's data on this device was set aside/);
  assert.equal(JSON.parse(store.getItem(STASH_V2_KEY)).owner, OWNER_B);
  assert.equal(sanitizeWorkspace(JSON.parse(store.getItem(STASH_KEY))).business.name, "B Shop");
  assert.ok((await srv.doc(PRIMARY_BOOK_ID)).workspace.invoices.inv_0000000a, "A's unsynced invoice is uploaded to A");
  assert.ok(srv.calls.every((c) => c.method !== "PUT" || !JSON.stringify(c.body).includes("B Shop")), "nothing of B reaches A");
  h.engine.stop();
}
{
  // R2: a stash from today's client (no owner) never blocks; unidentifiable, it is kept aside for download.
  const store = installBrowser();
  store.setItem(WORKSPACE_KEY, JSON.stringify(book("B Shop", "bshop@okaxis")));
  store.setItem(OWNER_KEY, OWNER_B);
  store.setItem(STASH_KEY, JSON.stringify(book("Sharma Tuition (A)", "sharma@okaxis")));
  fakeServer({ owner: OWNER_A });
  const h = host();
  await h.engine.start();
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual([h.state().status, store.getItem(OWNER_KEY)], ["synced", OWNER_A]);
  assert.deepEqual(listAside().map((a) => [a.reason, a.name]), [["other_account", "Sharma Tuition (A)"]]);
  assert.equal(sanitizeWorkspace(JSON.parse(store.getItem(STASH_KEY))).business.name, "B Shop");
  h.engine.stop();
}
{
  // R6: a network blip at load, then the tab comes back: start runs again and later edits are uploaded.
  const store = installBrowser();
  store.setItem(WORKSPACE_KEY, JSON.stringify(primary));
  store.setItem(OWNER_KEY, OWNER_A);
  const srv = fakeServer();
  srv.offline = true;
  const h = host();
  await h.engine.start();
  assert.equal(h.state().status, "offline");
  srv.offline = false;
  srv.calls.length = 0;
  globalThis.document.dispatchEvent(new Event("visibilitychange"));
  globalThis.window.dispatchEvent(new Event("online"));
  await new Promise((r) => setTimeout(r, 40));
  assert.deepEqual(srv.calls.map((c) => `${c.method} ${c.url}`), [`GET ${BOOKS_URL}`, `GET ${SYNC_URL}`, `PUT ${SYNC_URL}`], "one start (single flight), then the upload");
  assert.equal(h.state().status, "synced");
  h.edit(PRIMARY_BOOK_ID, withInvoice(h.shelf().books[PRIMARY_BOOK_ID], "inv_00000006", "INV-0006", 600));
  assert.equal(await h.engine.flush(PRIMARY_BOOK_ID), true);
  assert.ok((await srv.doc(PRIMARY_BOOK_ID)).workspace.invoices.inv_00000006);
  h.engine.stop();
}
{
  // R7: an old tab switched A → B (primary stashed, OWNER_KEY = B) and left A's extra business and index behind.
  const store = installBrowser();
  store.setItem(OWNER_KEY, OWNER_A);
  const index = addBook({ ...emptyIndex(), owner: OWNER_A }, B, T);
  saveIndex(index);
  saveBook(index, PRIMARY_BOOK_ID, primary);
  saveBook(index, B, book("A's second business", "a2@okaxis"));
  store.setItem(STASH_KEY, store.getItem(WORKSPACE_KEY));
  store.setItem(WORKSPACE_KEY, canonicalJson(book("B Shop", "bshop@okaxis")));
  store.setItem(OWNER_KEY, OWNER_B);
  const srv = fakeServer({ owner: OWNER_B });
  await srv.write(PRIMARY_BOOK_ID, book("B Shop", "bshop@okaxis"));
  const h = host();
  await h.engine.start();
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(liveBookIds(await srv.index()), [PRIMARY_BOOK_ID], "A's business is never registered in B");
  assert.equal((await srv.doc(B)).rev, 0, "and never uploaded into B");
  assert.equal(srv.count((c) => c.method === "PUT" && c.url === BOOKS_URL), 0);
  assert.deepEqual(listAside().map((a) => [a.id, a.reason, a.name]), [[B, "other_account", "A's second business"]]);
  assert.equal(store.getItem(bookKey(B)), null);
  assert.equal(JSON.parse(store.getItem(BOOK_INDEX_KEY)).owner, OWNER_B);
  assert.deepEqual(Object.keys(h.shelf().books), [PRIMARY_BOOK_ID]);
  assert.equal(h.state().status, "synced");
  h.engine.stop();
}
{
  // R8: a tab launched offline (no owner yet); another tab then moves the device A → B. When this tab's start is
  // retried under B's session it must stop (the caller reloads), never upload its copy of A's data into B.
  const store = oldDevice(withInvoice(primary, "inv_000000a1", "INV-A1", 100), OWNER_A);
  const srv = fakeServer({ owner: OWNER_A });
  srv.offline = true;
  const tab2 = host();
  await tab2.engine.start();
  assert.deepEqual([tab2.state().status, tab2.engine.owner(), tab2.engine.ownerKey()], ["offline", null, OWNER_A]);
  srv.owner = OWNER_B;
  await srv.write(PRIMARY_BOOK_ID, book("B shop", "bshop@okaxis"));
  const switched = tabOneSwitches();
  assert.equal(switched.ok, true);
  srv.offline = false;
  srv.calls.length = 0;
  globalThis.document.dispatchEvent(new Event("visibilitychange"));
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(tab2.ownerChanged, 1, "the tab reloads");
  assert.deepEqual([tab2.state().status, tab2.state().message], ["error", OWNER_MISMATCH]);
  assert.deepEqual(srv.calls, [], "nothing is sent under B's session");
  assert.deepEqual(Object.keys((await srv.doc(PRIMARY_BOOK_ID)).workspace.invoices).sort(), ["inv_00000001"]);
  tab2.engine.stop();
}
{
  // Legacy hardening: no sync meta is written while the server has no books routes, and entering legacy resets it.
  const store = oldDevice(primary, OWNER_A);
  writeSyncMeta(OWNER_A, PRIMARY_BOOK_ID, 7, "deadbeef");
  const srv = fakeServer();
  srv.legacy = true;
  const h = host();
  await h.engine.start();
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(h.state().status, "synced");
  assert.deepEqual(readSyncMeta(), { owner: OWNER_A, books: {} });
  assert.equal(store.getItem(BOOK_SYNC_KEY), JSON.stringify({ owner: OWNER_A, books: {} }));
  h.engine.stop();
}

/* ---------- signed out, offline, delete cloud copy ---------- */
{
  oldDevice(primary);
  const srv = fakeServer();
  globalThis.Clerk = { loaded: true, user: null, session: null };
  let h = host();
  await h.engine.start();
  assert.equal(h.state().status, "signed_out");
  assert.equal(srv.calls.length, 0, "signed out: no API calls");
  globalThis.Clerk = { loaded: true, user: { id: "u" }, session: { getToken: async () => "tok" }, signOut: async () => {} };
  srv.offline = true;
  h = host();
  await h.engine.start();
  assert.equal(h.state().status, "offline");
  srv.offline = false;
  globalThis.window.dispatchEvent(new Event("online"));
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(h.state().status, "synced", "reconnecting runs the full start (owner check first)");
  assert.equal(await h.engine.deleteCloudCopy(), true);
  assert.equal(h.state().status, "signed_out");
  assert.deepEqual(JSON.parse(globalThis.localStorage.getItem(BOOK_SYNC_KEY)), { owner: OWNER_A, books: {} });
  assert.ok(srv.calls.some((c) => c.method === "DELETE" && c.url === SYNC_URL && c.body.expectedOwner === OWNER_A));
  h.engine.stop();
}

/* ---------- 402 plan_read_only with changes the server doesn't have: set aside (verified), then the server copy ---------- */
{
  const store = shelfDevice({ [PRIMARY_BOOK_ID]: primary, [B]: two });
  const srv = fakeServer({ plan: "pro" });
  let h = host();
  await h.engine.start();
  await new Promise((r) => setTimeout(r, 20));
  h.engine.stop();
  const serverBefore = canonicalJson((await srv.doc(B)).workspace);
  srv.plan = "free";
  h = host({ withReset: true });
  await h.engine.start();
  h.edit(B, withInvoice(h.shelf().books[B], "inv_00000007", "INV-0007", 7000));
  assert.equal(await h.engine.flush(B), false);
  await new Promise((r) => setTimeout(r, 40));
  const kept = listAside().find((a) => a.id === B);
  assert.equal(kept?.reason, "read_only", "the device-only changes are kept to download");
  assert.ok(kept.workspace.invoices.inv_00000007);
  assert.ok(!store.getItem(bookKey(B)).includes("inv_00000007"), "the business shows the server's copy again");
  assert.equal(canonicalJson(sanitizeWorkspace(JSON.parse(store.getItem(bookKey(B))))), canonicalJson(sanitizeWorkspace(JSON.parse(serverBefore))));
  assert.equal(h.asides, 1);
  assert.equal(canonicalJson((await srv.doc(B)).workspace), serverBefore, "nothing reached the server");
  // Unchanged afterwards: no second copy, no loop.
  h.engine.changed(B);
  await h.engine.flush(B);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(h.asides, 1);
  h.engine.stop();
}

/* =====================================================================================================
 * Clients abroad, PR 1 (docs/spec-foreign-clients.md §2.5, §2.6): one pull after the upgrade, the fx marker,
 * the cloud-only hold, and no push loop against a server that strips ws.intl.
 * ===================================================================================================== */
{
  const M = await import("../src/lib/workspace/model.ts");
  const legacyModel = await import("./fixtures/legacy-model.ts");
  const { intlKey } = await import("../src/lib/workspace/localStore.ts");
  const settings = { on: true, accountName: "Sharma Tuition LLP", bankName: "HDFC", swift: "HDFCINBB", account: "50100123456789", bankDetails: "", payUrl: "", exportUnderLut: false, lutArn: "", lutFy: "", updatedAt: T };
  const withUsd = (ws, at = T) => {
    const w = M.upsertInvoice(ws, { ...inv("inv_usd00001", "INV-0002", 120050, at), currency: "USD" }, at);
    return M.sanitizeWorkspace(JSON.parse(JSON.stringify({ ...w, intl: { ...w.intl, settings } })));
  };
  const W = withUsd(primary);
  const stripped = legacyModel.sanitizeWorkspace(JSON.parse(JSON.stringify(W)));
  const calls = (srv) => srv.calls.map((c) => `${c.method} ${c.url}`);

  // A device that synced with old code: its meta (no fx) describes the stripped copy, so it pulls once.
  {
    const store = oldDevice(stripped, OWNER_A);
    const srv = fakeServer();
    await srv.write(PRIMARY_BOOK_ID, W);
    writeSyncMeta(OWNER_A, PRIMARY_BOOK_ID, 1, bookHash(stripped));
    let h = host();
    await h.engine.start();
    await new Promise((r) => setTimeout(r, 30));
    assert.deepEqual(calls(srv), [`GET ${BOOKS_URL}`, `GET ${SYNC_URL}`], "one pull, no push");
    assert.equal(h.shelf().books[PRIMARY_BOOK_ID].intl.invoices.inv_usd00001.currency, "USD", "the server's intl fills the empty local section");
    assert.equal(JSON.parse(store.getItem(intlKey(PRIMARY_BOOK_ID))).intl.settings.swift, "HDFCINBB");
    assert.equal(readSyncMeta().books[PRIMARY_BOOK_ID].fx, 1, "the marker is written after a reply with intl: 1");
    // A visibility change with in-session meta makes no request for the book, even after an old tab stripped fx.
    writeSyncMeta(OWNER_A, PRIMARY_BOOK_ID, 1, bookHash(W));
    assert.equal(readSyncMeta().books[PRIMARY_BOOK_ID].fx, undefined);
    srv.calls.length = 0;
    document.dispatchEvent(new Event("visibilitychange"));
    await new Promise((r) => setTimeout(r, 30));
    assert.deepEqual(calls(srv), [`GET ${BOOKS_URL}`]);
    h.engine.stop();
    // An unchanged reload is still exactly one request (once the marker is there).
    writeSyncMeta(OWNER_A, PRIMARY_BOOK_ID, 1, bookHash(W), true);
    srv.calls.length = 0;
    h = host();
    await h.engine.start();
    await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual(calls(srv), [`GET ${BOOKS_URL}`]);
    h.engine.stop();
  }

  // Review round 2: a first sign-in tags a guest's sidecar with the account at once, even when nothing is saved
  // (the server's copy equals this one), so an older tab's later switch can't leave it looking like a guest's.
  {
    const store = installBrowser();
    saveWorkspace(W);
    assert.equal(JSON.parse(store.getItem(intlKey(PRIMARY_BOOK_ID))).owner, null);
    const srv = fakeServer();
    await srv.write(PRIMARY_BOOK_ID, W);
    const before = store.getItem(WORKSPACE_KEY);
    const h = host();
    await h.engine.start();
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(store.getItem(OWNER_KEY), OWNER_A);
    assert.equal(store.getItem(WORKSPACE_KEY), before, "(nothing was saved)");
    assert.equal(JSON.parse(store.getItem(intlKey(PRIMARY_BOOK_ID))).owner, OWNER_A, "the guest's foreign section now belongs to A");
    h.engine.stop();
  }

  // A cloud-only book (no local copy) with pre-upgrade meta stays held: the upgrade never downloads it.
  {
    shelfDevice({ [PRIMARY_BOOK_ID]: primary, [B]: two });
    const srv = fakeServer({ plan: "pro" });
    let h = host();
    await h.engine.start();
    await new Promise((r) => setTimeout(r, 30));
    h.engine.stop();
    globalThis.localStorage.removeItem(bookKey(B));
    writeSyncMeta(OWNER_A, B, readSyncMeta().books[B].rev, readSyncMeta().books[B].hash);
    assert.equal(readSyncMeta().books[B].fx, undefined);
    srv.calls.length = 0;
    h = host();
    await h.engine.start();
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(h.state().books[B], "cloud_only");
    assert.equal(srv.count((c) => c.url === `${BOOKS_URL}${B}/`), 0, "no GET for a book kept in the cloud");
    h.engine.stop();
  }

  // A server that strips intl (no intl: 1): no push loop, flush() true, local intl kept, no fx marker.
  {
    const store = shelfDevice({ [PRIMARY_BOOK_ID]: W, [B]: withUsd(two) });
    const srv = fakeServer({ plan: "pro" });
    srv.noIntl = true;
    const h = host();
    await h.engine.start();
    await new Promise((r) => setTimeout(r, 600));
    const puts = srv.count((c) => c.method === "PUT" && c.url !== BOOKS_URL);
    assert.ok(puts <= 2, `one push per book at most (got ${puts})`);
    h.edit(PRIMARY_BOOK_ID, withInvoice(h.shelf().books[PRIMARY_BOOK_ID], "inv_00000005", "INV-0005", 5000));
    assert.equal(await h.engine.flush(PRIMARY_BOOK_ID), true, "flush succeeds: INR pay and statement links keep working");
    const afterFlush = srv.count((c) => c.method === "PUT");
    await new Promise((r) => setTimeout(r, 1000));
    assert.equal(srv.count((c) => c.method === "PUT"), afterFlush, "no repeated pushes");
    assert.equal(h.state().status, "synced");
    assert.equal(h.shelf().books[PRIMARY_BOOK_ID].intl.invoices.inv_usd00001.currency, "USD", "local intl is never removed because a reply lacks it");
    assert.equal(h.shelf().books[B].intl.invoices.inv_usd00001.currency, "USD");
    assert.ok(store.getItem(intlKey(PRIMARY_BOOK_ID)) && store.getItem(intlKey(B)));
    assert.equal((await srv.doc(PRIMARY_BOOK_ID)).workspace.invoices.inv_00000005.amountPaise, 5000, "the INR part keeps syncing");
    assert.equal(readSyncMeta().books[PRIMARY_BOOK_ID].fx, undefined, "no marker from a server without intl: 1");
    // Review round 3: visibility and online refreshes compare like with like (the stripped hash against the
    // stripped copy), so they GET the index and push nothing, for the primary and for an extra book.
    const quiet = srv.count((c) => c.method === "PUT");
    for (let i = 0; i < 4; i++) {
      globalThis.document.dispatchEvent(new Event("visibilitychange"));
      if (i === 2) globalThis.window.dispatchEvent(new Event("online"));
      await new Promise((r) => setTimeout(r, 250));
    }
    assert.ok(srv.count((c) => c.method === "GET" && c.url === BOOKS_URL) > 0, "the refreshes did run");
    assert.equal(srv.count((c) => c.method === "PUT"), quiet, "no PUT on visibility or online events against a stripping server");
    assert.equal(h.state().status, "synced");
    // A real INR change still syncs, once; a foreign-only change makes no request (that server can't keep it).
    h.edit(PRIMARY_BOOK_ID, withInvoice(h.shelf().books[PRIMARY_BOOK_ID], "inv_00000007", "INV-0007", 7000));
    assert.equal(await h.engine.flush(PRIMARY_BOOK_ID), true);
    assert.equal(srv.count((c) => c.method === "PUT"), quiet + 1);
    globalThis.document.dispatchEvent(new Event("visibilitychange"));
    await new Promise((r) => setTimeout(r, 250));
    assert.equal(srv.count((c) => c.method === "PUT"), quiet + 1, "still no PUT after the next refresh");
    h.engine.stop();
  }
  console.log("[shelf-sync] clients abroad: one pull after the upgrade, fx marker, cloud-only hold, no loop against a stripping server");
}

console.log("[shelf-sync] legacy fallback, rev/hash skip, 404/410/409/402, stash and set-aside: all checks passed");
