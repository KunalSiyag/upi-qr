import assert from "node:assert/strict";
import { MAX_WORKSPACE_BYTES, memoryCloudStore, readWorkspace, syncWorkspace } from "../src/lib/workspace/cloud.ts";
import { addPayment, deleteInvoice, emptyWorkspace, invoiceViews, updateBusiness, upsertClient, upsertInvoice } from "../src/lib/workspace/model.ts";

const T = 1_790_000_000_000;
const today = "2026-10-10";
const client = { id: "cli_aaaaaaaa", name: "Rohan", phone: "", email: "", gstin: "", createdAt: T, updatedAt: T };
const inv = (id, number, amountPaise, at = T) => ({
  id, number, clientId: client.id, issueDate: "2026-10-01", dueDate: "2026-10-15", amountPaise,
  description: "", payments: [], reminders: [], voided: false, createdAt: at, updatedAt: at,
});

// First sync uploads; empty account reads as empty.
{
  const store = memoryCloudStore();
  assert.equal((await readWorkspace(store, "o1")).rev, 0);
  let phone = upsertInvoice(upsertClient(emptyWorkspace(), client, T), inv("inv_00000001", "A-1", 10000), T);
  const first = await syncWorkspace(store, "o1", phone, T);
  assert.equal(first.status, "ok");
  assert.equal(first.rev, 1);

  // Laptop (empty) syncs: receives phone's invoice without wiping it.
  const laptop = await syncWorkspace(store, "o1", emptyWorkspace(), T);
  assert.equal(laptop.status, "ok");
  assert.equal(laptop.rev, 1, "no-op merge does not write");
  assert.equal(invoiceViews(laptop.workspace, today).length, 1);

  // Both devices edit offline; both edits survive.
  const laptopEdit = upsertInvoice(laptop.workspace, inv("inv_00000002", "A-2", 20000, T + 5), T + 5);
  phone = addPayment(first.workspace, "inv_00000001", { amountPaise: 10000, date: today, mode: "upi", reference: "" }, T + 6);
  await syncWorkspace(store, "o1", laptopEdit, T + 7);
  const after = await syncWorkspace(store, "o1", phone, T + 8);
  assert.equal(invoiceViews(after.workspace, today).length, 2);
  assert.equal(after.workspace.invoices.inv_00000001.payments.length, 1);
  assert.equal(after.rev, 3);

  // A delete on one device propagates even when another device sends the stale record.
  const deleted = deleteInvoice(after.workspace, "inv_00000002", T + 9);
  await syncWorkspace(store, "o1", deleted, T + 9);
  const stale = await syncWorkspace(store, "o1", laptopEdit, T + 10);
  assert.equal(invoiceViews(stale.workspace, today).length, 1, "stale device cannot resurrect a deleted invoice");

  // Accounts are isolated.
  assert.equal(invoiceViews((await readWorkspace(store, "o2")).workspace, today).length, 0);
}

// Lost compare-and-set race is retried against the newer copy; nothing is lost.
{
  const store = memoryCloudStore();
  await syncWorkspace(store, "o1", upsertInvoice(upsertClient(emptyWorkspace(), client, T), inv("inv_00000001", "A-1", 10000), T), T);
  let raced = false;
  const racing = {
    ...store,
    async write(owner, json, expectedRev) {
      if (!raced) {
        raced = true; // another device sneaks in a write between our read and write
        const other = upsertInvoice(upsertClient(emptyWorkspace(), client, T), inv("inv_00000009", "OTHER", 99900, T + 1), T + 1);
        await syncWorkspace(store, owner, other, T + 1);
      }
      return store.write(owner, json, expectedRev);
    },
  };
  const mine = upsertInvoice(upsertClient(emptyWorkspace(), client, T), inv("inv_00000003", "MINE", 5000, T + 2), T + 2);
  const result = await syncWorkspace(racing, "o1", mine, T + 2);
  assert.equal(result.status, "ok");
  const numbers = invoiceViews(result.workspace, today).map((v) => v.invoice.number).sort();
  assert.deepEqual(numbers, ["A-1", "MINE", "OTHER"]);
}

// Permanent contention gives up with "conflict" instead of looping forever.
{
  const store = memoryCloudStore();
  const always = { ...store, write: async () => null };
  assert.equal((await syncWorkspace(always, "o1", emptyWorkspace(), T)).status, "conflict");
}

// Oversized workspaces are refused before writing.
{
  const store = memoryCloudStore();
  let big = updateBusiness(upsertClient(emptyWorkspace(), client, T), { name: "Big" }, T);
  for (let i = 0; i < 4000; i++) {
    big = upsertInvoice(big, { ...inv(`inv_${String(i).padStart(8, "0")}`, `N-${i}`, 100), description: "x".repeat(250) }, T);
  }
  const result = await syncWorkspace(store, "o1", big, T);
  assert.equal(result.status, "too_large");
  assert.ok(result.bytes > MAX_WORKSPACE_BYTES);
  assert.equal(store.docs.size, 0);
}

// Hostile input is sanitized, and parsed-object storage (Upstash auto-deserialization) is accepted.
{
  const store = memoryCloudStore();
  const result = await syncWorkspace(store, "o1", { business: { name: 5 }, invoices: { "../x": {} }, clients: "nope" }, T);
  assert.equal(result.status, "ok");
  assert.deepEqual(Object.keys(result.workspace.invoices), []);
  const objectStore = { ...store, read: async () => ({ doc: JSON.parse(store.docs.get("o1").json), rev: 1 }) };
  assert.equal((await readWorkspace(objectStore, "o1")).rev, 1);
  const garbage = { ...store, read: async () => ({ doc: "{not json", rev: 4 }) };
  assert.deepEqual((await readWorkspace(garbage, "o1")).workspace, emptyWorkspace());
}

// ---------------------------------------------------------------------------
// Several businesses: slots, revisions that survive deletes, and the book index.
{
  const { slotFor, readBookIndex, syncBookIndex, storedIndexJson, unpurgedIds } = await import("../src/lib/workspace/cloud.ts");
  const { emptyIndex, liveBookIds, PRIMARY_BOOK_ID } = await import("../src/lib/workspace/books.ts");
  const meta = (id, createdAt, extra = {}) => ({ id, createdAt, ...extra });
  const idx = (...entries) => ({ v: 1, books: Object.fromEntries([meta(PRIMARY_BOOK_ID, 0), ...entries].map((m) => [m.id, m])) });
  const ids = (n, prefix = "biz_book") => Array.from({ length: n }, (_, i) => `${prefix}${String(i).padStart(4, "0")}`);
  const never = async () => { throw new Error("limitFor must not be called"); };

  // slotFor: the primary keeps the account's slot; other books get their own; owners stay apart.
  assert.equal(slotFor("o1", PRIMARY_BOOK_ID), "o1");
  assert.equal(slotFor("o1", "biz_x0000001"), "o1:biz_x0000001");
  const store = memoryCloudStore();
  const ws1 = upsertInvoice(upsertClient(emptyWorkspace(), client, T), inv("inv_00000001", "P-1", 100), T);
  const ws2 = upsertInvoice(upsertClient(emptyWorkspace(), client, T), inv("inv_00000001", "B-1", 200), T);
  await syncWorkspace(store, slotFor("o1", PRIMARY_BOOK_ID), ws1, T);
  await syncWorkspace(store, slotFor("o1", "biz_x0000001"), ws2, T);
  assert.equal((await readWorkspace(store, "o1")).workspace.invoices.inv_00000001.number, "P-1");
  assert.equal((await readWorkspace(store, "o1:biz_x0000001")).workspace.invoices.inv_00000001.number, "B-1");
  assert.equal((await readWorkspace(store, "o2")).rev, 0);
  assert.deepEqual(await store.revs(["o1", "o1:biz_x0000001", "o2"]), [1, 1, 0]);

  // removeDocs advances the revision (never resets it): the removed doc reads as rev 2 with no data,
  // so a device holding rev 1 sees a change and re-uploads; written again, it continues at rev 3 (no ABA).
  await store.removeDocs(["o1:biz_x0000001"]);
  assert.deepEqual(await readWorkspace(store, "o1:biz_x0000001"), { workspace: emptyWorkspace(), rev: 2 });
  assert.deepEqual(await store.revs(["o1:biz_x0000001"]), [2]);
  assert.equal((await syncWorkspace(store, "o1:biz_x0000001", ws2, T + 1)).rev, 3);
  assert.equal((await readWorkspace(store, "o1")).rev, 1, "the primary is untouched");

  // Each book keeps the 900 KB cap on its own document.
  let big = upsertClient(emptyWorkspace(), client, T);
  for (let i = 0; i < 4000; i++) big = upsertInvoice(big, { ...inv(`inv_${String(i).padStart(8, "0")}`, `N-${i}`, 100), description: "x".repeat(250) }, T);
  assert.equal((await syncWorkspace(store, "o1:biz_big00001", big, T)).status, "too_large");
  assert.equal((await store.revs(["o1:biz_big00001"]))[0], 0);

  // readBookIndex: absent → emptyIndex at rev 0; string and object forms parse; garbage is "corrupt" and never overwritten.
  const books = memoryCloudStore();
  assert.deepEqual(await readBookIndex(books, "o1"), { index: emptyIndex(), rev: 0 });
  await books.write("o1", JSON.stringify(idx(meta("biz_aaaaaa01", 5))), 0);
  assert.deepEqual((await readBookIndex(books, "o1")).index, idx(meta("biz_aaaaaa01", 5)));
  const objectForm = { ...books, read: async () => ({ doc: idx(meta("biz_aaaaaa01", 5)), rev: 1 }) };
  assert.deepEqual((await readBookIndex(objectForm, "o1")).index, idx(meta("biz_aaaaaa01", 5)));
  await books.write("o9", "{not json", 0);
  assert.equal(await readBookIndex(books, "o9"), "corrupt");
  assert.deepEqual(await syncBookIndex(books, "o9", idx(meta("biz_aaaaaa01", 1)), T, async () => 20), { status: "corrupt" });
  assert.equal(books.docs.get("o9").json, "{not json", "a corrupt index is never written over");

  // A legacy owner (no index) counts 1: Free rejects a second book and nothing is written.
  const free = memoryCloudStore();
  const r1 = await syncBookIndex(free, "o1", idx(meta("biz_second01", 123)), T, async () => 1);
  assert.equal(r1.status, "ok");
  assert.deepEqual([r1.added, r1.rejected, r1.rev], [[], ["biz_second01"], 0]);
  assert.equal(free.docs.size, 0, "no index key for a rejected add");
  // A no-op index (only the primary) writes nothing either: single-business accounts keep their KV byte-identical.
  assert.deepEqual([(await syncBookIndex(free, "o1", emptyIndex(), T, never)).rev, free.docs.size], [0, 0]);

  // Pro allows 20 (primary + 19) and rejects the 21st; the server stamps createdAt with its own clock.
  const pro = memoryCloudStore();
  const nineteen = ids(19);
  const r2 = await syncBookIndex(pro, "o1", idx(...nineteen.map((id) => meta(id, 1))), T, async () => 20);
  assert.deepEqual([r2.added.length, r2.rejected, r2.rev], [19, [], 1]);
  assert.ok(nineteen.every((id) => r2.index.books[id].createdAt === T), "createdAt = server now");
  const r3 = await syncBookIndex(pro, "o1", idx(meta("biz_extra001", 1)), T + 1, async () => 20);
  assert.deepEqual([r3.added, r3.rejected, liveBookIds(r3.index).length], [[], ["biz_extra001"], 20]);
  // Pro 19 + 3 new → 1 accepted, 2 rejected in rank order (createdAt, then id).
  const pro2 = memoryCloudStore();
  await syncBookIndex(pro2, "o1", idx(...ids(18).map((id) => meta(id, 1))), T, async () => 20);
  const r4 = await syncBookIndex(pro2, "o1", idx(meta("biz_newc0001", 1), meta("biz_newa0001", 1), meta("biz_newb0001", 1)), T + 1, async () => 20);
  assert.deepEqual([r4.added, r4.rejected], [["biz_newa0001"], ["biz_newb0001", "biz_newc0001"]]);

  // Downgraded: 5 live books keep syncing (edits and deletes) and limitFor isn't called.
  const down = memoryCloudStore();
  await syncBookIndex(down, "o1", idx(...ids(4).map((id) => meta(id, 1))), T, async () => 20);
  const r5 = await syncBookIndex(down, "o1", idx(...ids(4).map((id) => meta(id, 1))), T + 1, never);
  assert.deepEqual([r5.status, r5.rev, liveBookIds(r5.index).length], ["ok", 1, 5]);
  const r6 = await syncBookIndex(down, "o1", idx(meta("biz_book0002", 1, { deletedAt: 0 })), T + 2, never);
  assert.deepEqual([r6.removed, r6.unpurged, r6.index.books.biz_book0002.deletedAt], [["biz_book0002"], ["biz_book0002"], T + 2], "deletedAt: 0 is stamped with server time");
  // A far-future deletedAt is ignored the same way; tombstones are final.
  const r7 = await syncBookIndex(down, "o1", idx(meta("biz_book0003", 1, { deletedAt: 9e15 }), meta("biz_book0002", 1)), T + 3, never);
  assert.deepEqual([r7.index.books.biz_book0003.deletedAt, r7.index.books.biz_book0002.deletedAt], [T + 3, T + 2]);
  // The primary can't be deleted, and absence never deletes.
  const r8 = await syncBookIndex(down, "o1", { v: 1, books: { biz_primary: meta(PRIMARY_BOOK_ID, 0, { deletedAt: 1 }) } }, T + 4, never);
  assert.deepEqual(liveBookIds(r8.index), ["biz_primary", "biz_book0000", "biz_book0001"]);
  assert.deepEqual(unpurgedIds(r8.index), ["biz_book0002", "biz_book0003"]);

  // limitFor throwing only matters when adding.
  await assert.rejects(syncBookIndex(down, "o1", idx(meta("biz_new00001", 1)), T + 5, async () => { throw new Error("billing down"); }));
  assert.equal((await syncBookIndex(down, "o1", idx(meta("biz_book0000", 1)), T + 5, async () => { throw new Error("billing down"); })).status, "ok");

  // Two concurrent adds on Free+1… on a Pro account with one slot left: the CAS loser is re-checked against the newer index.
  const race = memoryCloudStore();
  await syncBookIndex(race, "o1", idx(...ids(18).map((id) => meta(id, 1))), T, async () => 20);
  let raced = false;
  const racing = {
    ...race,
    async write(owner, json, expectedRev) {
      if (!raced) {
        raced = true;
        await syncBookIndex(race, owner, idx(meta("biz_phone001", 1)), T + 1, async () => 20); // another device wins the last slot
      }
      return race.write(owner, json, expectedRev);
    },
  };
  const r9 = await syncBookIndex(racing, "o1", idx(meta("biz_laptop01", 1)), T + 2, async () => 20);
  assert.deepEqual([r9.added, r9.rejected, liveBookIds(r9.index).length], [[], ["biz_laptop01"], 20]);
  assert.equal((await syncBookIndex({ ...race, write: async () => null }, "o1", idx(meta("biz_book0001", 1, { deletedAt: 1 })), T, never)).status, "conflict");

  // A purged, evicted id sent live by a year-old device comes back as a tombstone, never revived.
  const old = memoryCloudStore();
  const tomb = (id, at) => meta(id, 1, { deletedAt: at, purgedAt: at });
  const crowded = { ...idx(...ids(10, "biz_live").map((id) => meta(id, 1)), ...ids(60, "biz_dead").map((id, i) => tomb(id, 100 + i))) };
  await old.write("o1", storedIndexJson(crowded), 0);
  const r10 = await syncBookIndex(old, "o1", idx(meta("biz_live0000", 1, { deletedAt: 1 })), T, never);
  // 71 entries > 64: the oldest purged tombstones moved to `deleted`; live ones all stay.
  assert.equal(Object.keys(r10.index.books).length, 64);
  assert.deepEqual(r10.index.deleted, ["biz_dead0000", "biz_dead0001", "biz_dead0002", "biz_dead0003", "biz_dead0004", "biz_dead0005", "biz_dead0006"]);
  const r11 = await syncBookIndex(old, "o1", idx(meta("biz_dead0003", 1)), T + 1, never);
  assert.deepEqual([r11.added, r11.deleted, liveBookIds(r11.index).includes("biz_dead0003")], [[], ["biz_dead0003"], false]);
}

// ---------------------------------------------------------------------------
// Cleanup sweep, deleteBookCloud and "Delete cloud copy" across books.
{
  const { slotFor, syncBookIndex, readBookIndex, deleteBookCloud, sweepDeletedBooks, deleteAllCloud, unpurgedIds } = await import("../src/lib/workspace/cloud.ts");
  const { memoryProjectionStore, bookProjection, digestProjection } = await import("../src/lib/workspace/digest.ts");
  const { memoryPaylinkStore } = await import("../src/lib/workspace/paylinks.ts");
  const { PRIMARY_BOOK_ID } = await import("../src/lib/workspace/books.ts");
  const meta = (id, createdAt, extra = {}) => ({ id, createdAt, ...extra });
  const setup = async () => {
    const s = { docs: memoryCloudStore(), books: memoryCloudStore(), projections: memoryProjectionStore(), paylinks: memoryPaylinkStore() };
    await syncBookIndex(s.books, "o1", { v: 1, books: { biz_bbbbbb01: meta("biz_bbbbbb01", 1), biz_cccccc01: meta("biz_cccccc01", 2) } }, T, async () => 20);
    const w = upsertInvoice(upsertClient(emptyWorkspace(), client, T), inv("inv_00000001", "X-1", 100), T);
    for (const id of [PRIMARY_BOOK_ID, "biz_bbbbbb01", "biz_cccccc01"]) {
      await syncWorkspace(s.docs, slotFor("o1", id), w, T);
      await s.projections.put("o1", id, id === PRIMARY_BOOK_ID ? digestProjection(w) : bookProjection(w));
    }
    await s.paylinks.put("tokP", { owner: "o1", invoiceId: "inv_00000001", createdAt: T });
    await s.paylinks.put("tokB", { owner: "o1", invoiceId: "biz_bbbbbb01/inv_00000001", createdAt: T, businessId: "biz_bbbbbb01" });
    await s.paylinks.put("tokC", { owner: "o1", invoiceId: "biz_cccccc01/inv_00000001", createdAt: T, businessId: "biz_cccccc01" });
    return s;
  };

  // deleteBookCloud refuses a live book (and the primary), removes a tombstoned one.
  let s = await setup();
  assert.equal(await deleteBookCloud(s, "o1", "biz_bbbbbb01"), false);
  assert.equal(await deleteBookCloud(s, "o1", PRIMARY_BOOK_ID), false);
  assert.ok(await s.paylinks.get("tokB"));
  await syncBookIndex(s.books, "o1", { v: 1, books: { biz_bbbbbb01: meta("biz_bbbbbb01", 1, { deletedAt: 1 }) } }, T + 1, async () => 20);
  // A failing cleanup leaves purgedAt unset; the next sweep retries and stamps it.
  const flaky = { ...s, paylinks: { ...s.paylinks, removeBook: async () => { throw new Error("KV blip"); } } };
  assert.equal(await sweepDeletedBooks(flaky, "o1", ["biz_bbbbbb01"], T + 2), null);
  assert.deepEqual(unpurgedIds((await readBookIndex(s.books, "o1")).index), ["biz_bbbbbb01"]);
  const swept = await sweepDeletedBooks(s, "o1", ["biz_bbbbbb01"], T + 3);
  assert.equal(swept.books.biz_bbbbbb01.purgedAt, T + 3);
  assert.equal(s.docs.docs.has("o1:biz_bbbbbb01"), false);
  assert.deepEqual((await s.docs.revs(["o1:biz_bbbbbb01"]))[0], 3, "revision advanced by the failed attempt and the retry, never reset");
  assert.deepEqual(await s.projections.bookIds("o1"), ["biz_cccccc01"]);
  assert.equal(await s.paylinks.get("tokB"), null);
  assert.ok(await s.paylinks.get("tokP"), "the primary's link is untouched");
  assert.ok(await s.paylinks.get("tokC"), "another book's link is untouched");

  // Delete cloud copy: every doc goes, non-primary projections and links go, revisions and the primary's link/projection stay (PR 6),
  // live extra books are unregistered (not tombstoned), tombstones stay so a deleted book never comes back.
  s = await setup();
  await syncBookIndex(s.books, "o1", { v: 1, books: { biz_cccccc01: meta("biz_cccccc01", 2, { deletedAt: 1 }) } }, T + 1, async () => 20);
  await s.projections.put("o1", "biz_orphan01", bookProjection(emptyWorkspace()));
  await s.paylinks.put("tokO", { owner: "o1", invoiceId: "biz_orphan01/inv_00000001", createdAt: T, businessId: "biz_orphan01" });
  await deleteAllCloud(s, "o1", T + 2);
  const after = (await readBookIndex(s.books, "o1")).index;
  assert.deepEqual(Object.keys(after.books).sort(), ["biz_cccccc01", "biz_primary"]);
  assert.equal(after.books.biz_cccccc01.purgedAt, T + 2);
  assert.equal(s.docs.docs.size, 0, "no documents remain");
  assert.deepEqual(await s.docs.revs(["o1", "o1:biz_bbbbbb01", "o1:biz_cccccc01"]), [2, 2, 2], "every removed doc reads as a newer revision");
  assert.deepEqual(await s.projections.bookIds("o1"), []);
  assert.ok(await s.projections.get("o1"), "the primary's projection stays until PR 6");
  assert.deepEqual(Object.keys(await s.paylinks.list("o1")), ["inv_00000001"]);
  // A single-business account: no index write, only the primary doc goes; its revision continues (1 → 2).
  const single = { docs: memoryCloudStore(), books: memoryCloudStore(), projections: memoryProjectionStore(), paylinks: memoryPaylinkStore() };
  await syncWorkspace(single.docs, "o2", emptyWorkspace(T), T);
  await deleteAllCloud(single, "o2", T + 1);
  assert.deepEqual([single.books.docs.size, single.docs.docs.size], [0, 0]);
  assert.deepEqual(await single.docs.revs(["o2"]), [2]);
  assert.equal((await syncWorkspace(single.docs, "o2", upsertClient(emptyWorkspace(), client, T + 2), T + 2)).rev, 3);
  // Orphaned snapshots (no pl:own entry: a sync that raced a delete, or a revoke by older code) are dropped.
  const orphanStore = memoryPaylinkStore();
  const o = { ...single, paylinks: orphanStore };
  await orphanStore.put("tokLive", { owner: "o2", invoiceId: "inv_00000001", createdAt: T });
  await orphanStore.patchViews("o2", { tokLive: { kind: "invoice", view: {} }, tokOrphan: { kind: "invoice", view: { upiId: "gone@okaxis" } } }, []);
  await deleteAllCloud(o, "o2", T + 3);
  assert.deepEqual(await orphanStore.viewTokens("o2"), ["tokLive"]);
}

// Clients abroad, PR 1 (docs/spec-foreign-clients.md §1.3, §2.6): the server keeps ws.intl through pushes from
// code that can't see it, repairs what that code did, sanitizes hostile values, and counts intl in the size cap.
{
  const M = await import("../src/lib/workspace/model.ts");
  const legacy = await import("./fixtures/legacy-model.ts");
  const store = memoryCloudStore();
  const settings = { on: true, accountName: "Rohan Tutors", bankName: "HDFC", swift: "HDFCINBB", account: "50100123456789", bankDetails: "", payUrl: "", exportUnderLut: false, lutArn: "", lutFy: "", updatedAt: T };
  let w = M.upsertInvoice(upsertClient(emptyWorkspace(), client, T), inv("inv_00000001", "A-1", 10000), T);
  w = M.upsertInvoice(w, { ...inv("inv_usd00001", "A-2", 10000), currency: "USD" }, T);
  w = M.sanitizeWorkspace({ ...w, intl: { ...w.intl, settings } });
  const first = await syncWorkspace(store, "fx", w, T);
  assert.deepEqual(first.workspace.intl, w.intl);
  // An old client's PUT (its sanitizer drops intl) with an edited INR record and business keeps the stored intl.
  let old = legacy.sanitizeWorkspace(JSON.parse(JSON.stringify(first.workspace)));
  old = legacy.addPayment(old, "inv_00000001", { amountPaise: 5000, date: today, mode: "upi", reference: "" }, T + 1);
  old = legacy.updateBusiness(old, { name: "Renamed" }, T + 2);
  const afterOld = await syncWorkspace(store, "fx", JSON.parse(JSON.stringify(old)), T + 3);
  assert.equal(afterOld.rev, 2);
  assert.deepEqual(afterOld.workspace.intl, w.intl, "an old client's push never strips the stored section");
  assert.equal(afterOld.workspace.business.name, "Renamed");
  assert.match(store.docs.get("fx").json, /"currency":"USD"/);
  // A no-change INR-only PUT (an old client re-pushing the same data) doesn't write.
  assert.equal((await syncWorkspace(store, "fx", JSON.parse(JSON.stringify(old)), T + 4)).rev, 2);
  // An old tab deleted the client its old UI showed with no invoices: the server revives it.
  const oldDelete = legacy.deleteClient(legacy.upsertInvoice(old, { ...old.invoices.inv_00000001, deletedAt: T + 5 }, T + 5), client.id, T + 6);
  const revived = await syncWorkspace(store, "fx", JSON.parse(JSON.stringify(oldDelete)), T + 7);
  assert.equal(revived.workspace.clients[client.id].deletedAt, undefined, "a client with a live foreign invoice comes back");
  assert.equal(revived.workspace.intl.invoices.inv_usd00001.deletedAt, undefined);
  // Hostile intl values come out sanitized.
  const hostile = await syncWorkspace(memoryCloudStore(), "fy", {
    business: { name: "X" },
    intl: {
      settings: { accountName: "x".repeat(10_000), payUrl: "javascript:alert(1)", swift: "<img>", updatedAt: "now" },
      invoices: { inv_nan00001: { ...inv("inv_nan00001", "N", Number.NaN), currency: "USD" }, inv_str00001: { ...inv("inv_str00001", "N", "100"), currency: "USD" }, "__proto__": { currency: "USD" } },
      clients: { cli_aaaaaaaa: { currency: "javascript:", updatedAt: 1 } },
    },
  }, T);
  assert.deepEqual(hostile.workspace.intl.invoices, {});
  assert.deepEqual(hostile.workspace.intl.clients, {});
  assert.deepEqual([hostile.workspace.intl.settings.accountName.length, hostile.workspace.intl.settings.payUrl, hostile.workspace.intl.settings.swift, hostile.workspace.intl.settings.updatedAt], [80, "", "", 0]);
  // The size cap counts intl.
  const huge = { ...emptyWorkspace(), intl: { invoices: {}, recurring: {}, clients: {} } };
  for (let i = 0; i < 4000; i++) {
    const id = `inv_big${String(i).padStart(6, "0")}`;
    huge.intl.invoices[id] = { ...inv(id, `B-${i}`, 100), currency: "EUR", description: "y".repeat(250) };
  }
  const tooBig = await syncWorkspace(memoryCloudStore(), "fz", huge, T);
  assert.equal(tooBig.status, "too_large");
}

console.log("[workspace-cloud] multi-device merge, CAS retry, conflict cap, size limit, sanitizer, book slots, book index (limits, downgrade, races, tombstones) and cleanup checks passed");
