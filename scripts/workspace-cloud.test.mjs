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

console.log("[workspace-cloud] multi-device merge, CAS retry, conflict cap, size limit, and sanitizer checks passed");
