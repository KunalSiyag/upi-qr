import assert from "node:assert/strict";
import { allocatePayment } from "../src/lib/workspace/model.ts";
import { createStatementLink, statementSubject, statementView, subjectOf } from "../src/lib/workspace/paylinks.ts";
import { addClaim, createPaylink, FREE_ACTIVE_PAYLINKS, memoryPaylinkStore, MAX_PENDING_CLAIMS, parseClaims, parseRecord, payPageView, validPaylinkToken } from "../src/lib/workspace/paylinks.ts";
import { addPayment, deleteInvoice, emptyWorkspace, updateBusiness, upsertClient, upsertInvoice } from "../src/lib/workspace/model.ts";

const T = 1_790_000_000_000;
const vpa = (v) => /^[\w.-]{2,}@[\w]{2,}$/.test(v);
let n = 0;
const token = () => `tok${String(n++).padStart(19, "0")}`;
const client = { id: "cli_aaaaaaaa", name: "Rohan Mehta", phone: "9876543210", email: "r@example.com", gstin: "", createdAt: T, updatedAt: T };
const inv = (id, amountPaise) => ({
  id, number: `INV-${id.slice(-2)}`, clientId: client.id, issueDate: "2026-10-01", dueDate: "2026-10-15", amountPaise,
  description: "Tuition", payments: [], reminders: [], voided: false, createdAt: T, updatedAt: T,
});
let ws = updateBusiness(upsertClient(emptyWorkspace(), client, T), { name: "Sharma Tuition", upiId: "sharma@okaxis" }, T);
ws = upsertInvoice(ws, inv("inv_00000001", 300000), T);

assert.equal(validPaylinkToken("AbCdEfGhIjKlMnOpQrStUv"), true);
assert.equal(validPaylinkToken("../../etc/passwd______"), false);
assert.equal(validPaylinkToken("short"), false);

// Public view never exposes the client's identity.
const view = payPageView(ws, "inv_00000001", "2026-10-10");
assert.equal(view.merchantName, "Sharma Tuition");
assert.equal(view.balancePaise, 300000);
assert.equal(view.state, "due");
assert.doesNotMatch(JSON.stringify(view), /Rohan|9876543210|r@example\.com/);
// Live balance: a part payment reduces what the page asks for; full payment shows paid.
ws = addPayment(ws, "inv_00000001", { amountPaise: 100000, date: "2026-10-05", mode: "upi", reference: "" }, T + 1);
assert.equal(payPageView(ws, "inv_00000001", "2026-10-10").balancePaise, 200000);
assert.equal(payPageView(ws, "inv_00000001", "2026-10-20").state, "overdue");
assert.equal(payPageView(deleteInvoice(ws, "inv_00000001", T + 2), "inv_00000001", "2026-10-10"), null);

// Creating links: idempotent per invoice; guards for missing invoice, zero balance, missing UPI ID, and the free limit.
{
  const store = memoryPaylinkStore();
  const first = await createPaylink(store, "o1", ws, "inv_00000001", token, T, FREE_ACTIVE_PAYLINKS, vpa);
  assert.equal(first.status, "ok");
  assert.equal(first.created, true);
  const again = await createPaylink(store, "o1", ws, "inv_00000001", token, T, FREE_ACTIVE_PAYLINKS, vpa);
  assert.deepEqual([again.status, again.token, again.created], ["ok", first.token, false]);
  assert.deepEqual(await store.get(first.token), { owner: "o1", invoiceId: "inv_00000001", createdAt: T });

  assert.equal((await createPaylink(store, "o1", ws, "inv_missing00", token, T, 10, vpa)).status, "missing_invoice");
  const paid = addPayment(ws, "inv_00000001", { amountPaise: 200000, date: "2026-10-06", mode: "cash", reference: "" }, T + 3);
  assert.equal((await createPaylink(memoryPaylinkStore(), "o1", paid, "inv_00000001", token, T, 10, vpa)).status, "no_balance");
  const noUpi = updateBusiness(ws, { upiId: "" }, T + 4);
  assert.equal((await createPaylink(memoryPaylinkStore(), "o1", noUpi, "inv_00000001", token, T, 10, vpa)).status, "no_upi");

  let many = ws;
  for (let i = 2; i <= 4; i++) many = upsertInvoice(many, inv(`inv_0000000${i}`, 1000 * i), T);
  const limited = memoryPaylinkStore();
  for (let i = 1; i <= 3; i++) assert.equal((await createPaylink(limited, "o1", many, `inv_0000000${i}`, token, T, 3, vpa)).status, "ok");
  const over = await createPaylink(limited, "o1", many, "inv_00000004", token, T, 3, vpa);
  assert.equal(over.status, "limit");
  assert.match(over.message, /3 pay links/);
  // Revoking frees a slot.
  const t1 = await limited.tokenFor("o1", "inv_00000001");
  await limited.remove("o1", t1, "inv_00000001");
  assert.equal(await limited.get(t1), null);
  assert.equal((await createPaylink(limited, "o1", many, "inv_00000004", token, T, 3, vpa)).status, "ok");
  // Owners are isolated.
  assert.deepEqual(await limited.list("o2"), {});
}

// Claims: de-duplicated by UTR, capped, cleared on acknowledgement.
{
  const store = memoryPaylinkStore();
  const tk = token();
  assert.equal(await addClaim(store, tk, { utr: "412345678901", amountPaise: 200000, at: T }), "ok");
  assert.equal(await addClaim(store, tk, { utr: "412345678901", amountPaise: 200000, at: T + 1 }), "ok");
  assert.equal((await store.claims(tk)).length, 1);
  for (let i = 0; i < MAX_PENDING_CLAIMS - 1; i++) await addClaim(store, tk, { utr: `5000000000${i}`, amountPaise: null, at: T + i });
  assert.equal(await addClaim(store, tk, { utr: "999999999999", amountPaise: null, at: T }), "full");
  await store.clearClaims(tk);
  assert.deepEqual(await store.claims(tk), []);
}

// Parsers accept KV's string or auto-deserialized forms and drop junk.
assert.deepEqual(parseRecord('{"owner":"o","invoiceId":"i","createdAt":1}'), { owner: "o", invoiceId: "i", createdAt: 1 });
assert.equal(parseRecord("{bad"), null);
assert.equal(parseRecord({ owner: 1 }), null);
assert.deepEqual(parseClaims(['{"utr":"412345678901","amountPaise":100,"at":1}', { utr: "x", at: 2, amountPaise: -5 }, 42, "nope"]), [
  { utr: "412345678901", amountPaise: 100, at: 1 },
  { utr: "x", amountPaise: null, at: 2 },
]);

// Statement links (Pro).
{
  let sw = updateBusiness(upsertClient(emptyWorkspace(), client, T), { name: "Sharma Tuition", upiId: "sharma@okaxis" }, T);
  sw = upsertInvoice(sw, { ...inv("inv_00000011", 300000), dueDate: "2026-09-05", issueDate: "2026-09-01", description: "Rohan Sept fees" }, T);
  sw = upsertInvoice(sw, { ...inv("inv_00000012", 300000), dueDate: "2026-10-05", issueDate: "2026-10-01", description: "Rohan Oct fees" }, T);
  sw = upsertInvoice(sw, { ...inv("inv_00000013", 300000), dueDate: "2026-11-05", issueDate: "2026-11-01" }, T);
  sw = addPayment(sw, "inv_00000011", { amountPaise: 100000, date: "2026-09-03", mode: "upi", reference: "" }, T);
  const sv = statementView(sw, client.id, "2026-10-10");
  assert.deepEqual(sv.lines.map((l) => [l.number, l.balancePaise, l.overdue]), [["INV-11", 200000, true], ["INV-12", 300000, true], ["INV-13", 300000, false]]);
  assert.equal(sv.totalPaise, 800000);
  assert.equal(sv.overduePaise, 500000);
  assert.doesNotMatch(JSON.stringify(sv), /Rohan|9876543210|fees/, "no identity or descriptions on statements");
  assert.equal(statementView(sw, "cli_missing0", "2026-10-10"), null);
  assert.deepEqual(subjectOf(statementSubject("cli_aaaaaaaa")), { kind: "statement", clientId: "cli_aaaaaaaa" });
  assert.deepEqual(subjectOf("inv_00000011"), { kind: "invoice", invoiceId: "inv_00000011" });

  const store = memoryPaylinkStore();
  const free = { statementLinks: false, activePaylinks: 10 };
  const pro = { statementLinks: true, activePaylinks: 10_000 };
  assert.equal((await createStatementLink(store, "o1", sw, client.id, token, T, free, vpa)).status, "not_pro");
  const made = await createStatementLink(store, "o1", sw, client.id, token, T, pro, vpa);
  assert.equal(made.status, "ok");
  assert.equal((await createStatementLink(store, "o1", sw, client.id, token, T, pro, vpa)).token, made.token, "one link per client");
  assert.deepEqual(await store.get(made.token), { owner: "o1", invoiceId: "stmt:cli_aaaaaaaa", createdAt: T });

  // FIFO allocation of a statement payment; excess is reported, never recorded.
  const paid = allocatePayment(sw, client.id, 600000, { date: "2026-10-10", mode: "upi", reference: "412345678901" }, "2026-10-10", T + 1);
  assert.deepEqual(paid.allocations, [{ invoiceId: "inv_00000011", amountPaise: 200000 }, { invoiceId: "inv_00000012", amountPaise: 300000 }, { invoiceId: "inv_00000013", amountPaise: 100000 }]);
  assert.equal(paid.unallocatedPaise, 0);
  assert.equal(statementView(paid.ws, client.id, "2026-10-10").totalPaise, 200000);
  const over = allocatePayment(sw, client.id, 900000, { date: "2026-10-10", mode: "upi", reference: "" }, "2026-10-10", T + 1);
  assert.equal(over.unallocatedPaise, 100000);
  assert.equal(allocatePayment(sw, client.id, 0, { date: "2026-10-10", mode: "upi", reference: "" }, "2026-10-10", T).allocations.length, 0);
}

// Snapshots render exactly what the live computation shows, for any day.
{
  const { snapshotFor, snapshotView, parseSnapshot, snapshotsForLinks } = await import("../src/lib/workspace/paylinks.ts");
  const { addPayment: pay } = await import("../src/lib/workspace/model.ts");
  let rnd = 7;
  const rand = (n) => { rnd = (rnd * 1103515245 + 12345) % 2147483648; return rnd % n; };
  const d = (o) => new Date(Date.UTC(2026, 9, 10) + o * 86_400_000).toISOString().slice(0, 10);
  for (let trial = 0; trial < 30; trial++) {
    let w = updateBusiness(upsertClient(emptyWorkspace(), client, T), { name: "Shop", upiId: "shop@okaxis" }, T);
    const ids = [];
    for (let i = 0; i < 6 + rand(10); i++) {
      const id = `inv_s${trial}x${i}00000`;
      ids.push(id);
      const issue = d(-rand(60));
      w = upsertInvoice(w, { ...inv(id, 1000 * (1 + rand(300))), issueDate: issue, dueDate: d(-rand(40) + rand(40)) < issue ? issue : d(-rand(40) + rand(40)) }, T);
      if (rand(3) === 0) w = pay(w, id, { amountPaise: 500, date: d(-1), mode: "upi", reference: "" }, T);
      if (rand(4) === 0) w = pay(w, id, { amountPaise: w.invoices[id].amountPaise, date: d(-1), mode: "upi", reference: "" }, T);
      if (rand(8) === 0) w = upsertInvoice(w, { ...w.invoices[id], voided: true }, T);
    }
    for (const offset of [-30, -1, 0, 1, 45]) {
      const today = d(offset);
      for (const id of ids) {
        const snap = parseSnapshot(JSON.stringify(snapshotFor(w, id)));
        assert.deepEqual(snapshotView(snap, today).view, payPageView(w, id, today), `invoice ${id} @${today}`);
      }
      const st = parseSnapshot(JSON.stringify(snapshotFor(w, statementSubject(client.id))));
      assert.deepEqual(snapshotView(st, today).view, statementView(w, client.id, today), `statement @${today}`);
    }
  }
  // Snapshots never include client identity, and deleted subjects produce none.
  const sw2 = upsertInvoice(upsertClient(emptyWorkspace(), client, T), inv("inv_00000077", 5000), T);
  const snaps = snapshotsForLinks(deleteInvoice(sw2, "inv_00000077", T + 1), { inv_00000077: "TOKa", [statementSubject(client.id)]: "TOKb" });
  assert.equal(snaps.TOKa, undefined);
  assert.doesNotMatch(JSON.stringify(snapshotsForLinks(sw2, { inv_00000077: "TOKa" })), /Rohan|9876543210|r@example/);
  assert.equal(parseSnapshot("{bad"), null);
}

console.log("[paylinks] public view privacy, live balance, create guards, free limit, revoke, and claims checks passed");
