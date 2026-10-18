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

// ---------------------------------------------------------------------------
// Several businesses: book-qualified keys, owning-book snapshots, per-book views and revocation.
{
  const { refreshViews, snapshotFor, snapshotsForLinks, createStatementLink: stmt } = await import("../src/lib/workspace/paylinks.ts");
  const { linkKey } = await import("../src/lib/workspace/books.ts");
  const B = "biz_bbbbbb01";
  let wa = updateBusiness(upsertClient(emptyWorkspace(), client, T), { name: "Sharma Stores", upiId: "stores@okaxis" }, T);
  wa = upsertInvoice(wa, inv("inv_0000000X", 300000), T);
  let wb = updateBusiness(upsertClient(emptyWorkspace(), client, T), { name: "Sharma Tutors", upiId: "tutors@okhdfc" }, T);
  wb = upsertInvoice(wb, inv("inv_0000000X", 120000), T);

  // An invoice in book B renders B's business and nothing from A.
  const vb = payPageView(wb, "inv_0000000X", "2026-10-10");
  assert.deepEqual([vb.merchantName, vb.upiId, vb.balancePaise], ["Sharma Tutors", "tutors@okhdfc", 120000]);
  assert.doesNotMatch(JSON.stringify(snapshotFor(wb, "inv_0000000X")), /Sharma Stores|stores@okaxis/);

  // The same inv_X in the primary and in B: two fields, two tokens; the primary's record stays byte-identical.
  const store = memoryPaylinkStore();
  const pa = await createPaylink(store, "o1", wa, "inv_0000000X", token, T, 10, vpa);
  const pb = await createPaylink(store, "o1", wb, "inv_0000000X", token, T, 10, vpa, linkKey(B, "inv_0000000X"));
  assert.ok(pa.created && pb.created && pa.token !== pb.token);
  assert.deepEqual(await store.get(pa.token), { owner: "o1", invoiceId: "inv_0000000X", createdAt: T });
  assert.deepEqual(await store.get(pb.token), { owner: "o1", invoiceId: "biz_bbbbbb01/inv_0000000X", createdAt: T, businessId: B });
  assert.deepEqual(await store.list("o1"), { inv_0000000X: pa.token, "biz_bbbbbb01/inv_0000000X": pb.token });
  // Idempotent per book.
  assert.equal((await createPaylink(store, "o1", wb, "inv_0000000X", token, T, 10, vpa, linkKey(B, "inv_0000000X"))).token, pb.token);
  // Old-path resolution (the primary workspace + the record's invoiceId) finds nothing for B's record: 404, never A's payee.
  assert.equal(snapshotFor(wa, (await store.get(pb.token)).invoiceId), null);
  // A non-primary book without a UPI ID names that business.
  const noUpi = await createPaylink(memoryPaylinkStore(), "o1", updateBusiness(wb, { upiId: "" }, T + 1), "inv_0000000X", token, T, 10, vpa, linkKey(B, "inv_0000000X"));
  assert.deepEqual([noUpi.status, noUpi.message], ["no_upi", "Add a UPI ID for Sharma Tutors in Settings before sharing pay links."]);
  // Statement links are book-qualified the same way.
  const sb = await stmt(store, "o1", wb, client.id, token, T, { statementLinks: true, activePaylinks: 100 }, vpa, linkKey(B, "stmt:cli_aaaaaaaa"));
  assert.deepEqual(await store.get(sb.token), { owner: "o1", invoiceId: "biz_bbbbbb01/stmt:cli_aaaaaaaa", createdAt: T, businessId: B });
  // The account-wide active-link limit counts every book.
  assert.equal((await createPaylink(store, "o1", wb, "inv_0000000X", token, T, 3, vpa, linkKey("biz_cccccc01", "inv_0000000X"))).status, "limit");

  // parseRecord: a valid businessId is kept, an invalid one dropped, a mismatch rejected.
  assert.deepEqual(parseRecord({ owner: "o", invoiceId: "biz_bbbbbb01/inv_00000001", createdAt: 1, businessId: B }), { owner: "o", invoiceId: "biz_bbbbbb01/inv_00000001", createdAt: 1, businessId: B });
  assert.deepEqual(parseRecord({ owner: "o", invoiceId: "inv_00000001", createdAt: 1, businessId: "../x" }), { owner: "o", invoiceId: "inv_00000001", createdAt: 1 });
  assert.equal(parseRecord({ owner: "o", invoiceId: "biz_bbbbbb01/inv_00000001", createdAt: 1, businessId: "biz_cccccc01" }), null);
  assert.equal(parseRecord({ owner: "o", invoiceId: "biz_bbbbbb01/inv_00000001", createdAt: 1 }), null);

  // refreshViews for B sets only B's snapshots and leaves A's untouched (and never puts A's name on B's token).
  await refreshViews(store, "o1", "biz_primary", wa);
  const aView = await store.getView("o1", pa.token);
  assert.equal(aView.view.upiId, "stores@okaxis");
  assert.equal(await store.getView("o1", pb.token), null, "the primary refresh never renders B's links");
  await refreshViews(store, "o1", B, wb);
  assert.deepEqual(await store.getView("o1", pa.token), aView);
  assert.deepEqual([(await store.getView("o1", pb.token)).view.merchantName, (await store.getView("o1", pb.token)).view.upiId], ["Sharma Tutors", "tutors@okhdfc"]);
  // A paid-off (deleted) invoice in B drops only B's snapshot.
  await refreshViews(store, "o1", B, deleteInvoice(wb, "inv_0000000X", T + 5));
  assert.equal(await store.getView("o1", pb.token), null);
  assert.deepEqual(await store.getView("o1", pa.token), aView);

  // Single-business accounts keep today's exact write: one replace of the owner's snapshots.
  const calls = [];
  const solo = memoryPaylinkStore();
  const spy = { ...solo, putViews: (o, v) => { calls.push(["put", Object.keys(v)]); return solo.putViews(o, v); }, patchViews: (o, a, b) => { calls.push(["patch"]); return solo.patchViews(o, a, b); } };
  const sp = await createPaylink(solo, "o2", wa, "inv_0000000X", token, T, 10, vpa);
  await refreshViews(spy, "o2", "biz_primary", wa);
  await refreshViews(spy, "o2", "biz_primary", wa, { skipWhenNoLinks: true });
  await refreshViews(spy, "o3", "biz_primary", wa, { skipWhenNoLinks: true });
  assert.deepEqual(calls, [["put", [sp.token]], ["put", [sp.token]]]);
  assert.deepEqual(await solo.getView("o2", sp.token), snapshotsForLinks(wa, { inv_0000000X: sp.token })[sp.token]);

  // remove also drops the link's snapshot; removeBook revokes only that book's tokens.
  await refreshViews(store, "o1", B, wb);
  await store.remove("o1", pb.token, "biz_bbbbbb01/inv_0000000X");
  assert.deepEqual([await store.get(pb.token), await store.getView("o1", pb.token)], [null, null]);
  const pb2 = await createPaylink(store, "o1", wb, "inv_0000000X", token, T, 10, vpa, linkKey(B, "inv_0000000X"));
  await refreshViews(store, "o1", B, wb);
  await store.addClaim(pb2.token, { utr: "412345678901", amountPaise: null, at: T });
  await store.removeBook("o1", B);
  assert.deepEqual(Object.keys(await store.list("o1")), ["inv_0000000X"]);
  assert.deepEqual([await store.get(pb2.token), await store.get(sb.token), await store.getView("o1", pb2.token), (await store.claims(pb2.token)).length], [null, null, null, 0]);
  assert.ok(await store.get(pa.token));
  assert.deepEqual(await store.getView("o1", pa.token), aView);
  await store.removeBook("o1", "biz_primary");
  assert.ok(await store.get(pa.token), "removeBook never touches the primary");
}

console.log("[paylinks] public view privacy, live balance, create guards, free limit, revoke, and claims checks passed");
