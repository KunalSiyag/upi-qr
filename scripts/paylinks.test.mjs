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
  // 32-bit LCG (Math.imul): a float product passes 2^53 and loses the low bits, so `% n` was 0 for any even n.
  let rnd = 7;
  const rand = (n) => { rnd = (Math.imul(rnd, 1103515245) + 12345) >>> 0; return (rnd >>> 16) % n; };
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

// Clients abroad (docs/spec-foreign-clients.md §4). PR 1/PR 2 builders (fixtures/pr2-paylinks.ts, what a rollback of
// PR 3 runs) refuse foreign records; PR 3 renders them as "foreign" / "statement2" snapshots, which no older
// page parses. INR snapshots, records and claims keep their exact bytes.
{
  const M = await import("../src/lib/workspace/model.ts");
  const P = await import("../src/lib/workspace/paylinks.ts");
  const PR2 = await import("./fixtures/pr2-paylinks.ts");
  const { paidLinkTokens, emptyIndex, linkKey } = await import("../src/lib/workspace/books.ts");
  const { LUT_ENDORSEMENT } = await import("../src/lib/workspace/currency.ts");
  const legacyModel = await import("./fixtures/legacy-model.ts");
  const legacyPaylinks = await import("./fixtures/legacy-paylinks.ts");
  const usd = (id, amountPaise, clientId = client.id, extra = {}) => ({ ...inv(id, amountPaise), clientId, currency: "USD", ...extra });
  const details = { accountName: "Sharma Tuition LLP", bankName: "HDFC", swift: "HDFCINBB", account: "GB82WEST12345698765432", bankDetails: "Fort\nMumbai", payUrl: "https://paypal.me/sharma" };
  const settings = { on: true, ...details, exportUnderLut: false, lutArn: "", lutFy: "", updatedAt: T };
  const withSettings = (w, s) => M.sanitizeWorkspace({ ...w, intl: { invoices: {}, recurring: {}, clients: {}, ...w.intl, settings: s } });
  let base = updateBusiness(upsertClient(emptyWorkspace(), client, T), { name: "Sharma Tuition", upiId: "sharma@okaxis" }, T);
  base = upsertInvoice(base, inv("inv_00000001", 300000), T);
  let mixed = M.upsertInvoice(base, usd("inv_usd00001", 300000), T);
  mixed = M.upsertClient(mixed, { ...client, id: "cli_globex01", name: "Globex" }, T);
  mixed = M.upsertInvoice(mixed, usd("inv_usd00002", 9900, "cli_globex01"), T);
  mixed = withSettings(mixed, settings);

  // --- Rollback: what PR 1/PR 2 code does with the same data (unchanged guarantees, §4.1) ---
  assert.equal(PR2.payPageView(mixed, "inv_usd00001", "2026-10-10"), null, "a foreign id has no ₹ view");
  assert.equal(PR2.snapshotFor(mixed, "inv_usd00001"), null, "a PR 1/PR 2 backfill answers 404 for a foreign link");
  assert.equal(PR2.statementView(mixed, "cli_globex01", "2026-10-10"), null, "never 'Paid' for a client who owes only US$");
  assert.equal(PR2.snapshotFor(mixed, "stmt:cli_globex01"), null);
  for (const subject of ["inv_usd00001", "stmt:cli_globex01", "stmt:" + client.id]) {
    const snap = P.snapshotFor(mixed, subject);
    assert.ok(snap && (snap.kind === "foreign" || snap.kind === "statement2"), subject);
    for (const old of [PR2, legacyPaylinks]) assert.equal(old.parseSnapshot(JSON.stringify(snap)), null, `an older page can't parse ${snap.kind}`);
  }

  // --- foreignPayView ---
  assert.equal(P.payPageView(mixed, "inv_usd00001", "2026-10-10"), null, "payPageView stays INR-only");
  const fv = P.foreignPayView(mixed, "inv_usd00001", "2026-10-10");
  assert.deepEqual(fv, {
    merchantName: "Sharma Tuition", currency: "USD", invoiceNumber: "INV-01", amountMinor: 300000, balanceMinor: 300000,
    dueDate: "2026-10-15", description: "Tuition", state: "due", pay: details,
  });
  assert.equal(P.foreignPayView(mixed, "inv_00000001", "2026-10-10"), null, "INR invoices have no foreign view");
  assert.equal(P.foreignPayView(M.deleteInvoice(mixed, "inv_usd00001", T + 1), "inv_usd00001", "2026-10-10"), null);
  {
    const paidPart = M.addPayment(mixed, "inv_usd00001", { amountPaise: 100050, date: "2026-10-05", mode: "bank", reference: "SECRETREF9", inrCreditedPaise: 8300000 }, T + 1);
    const v = P.foreignPayView(paidPart, "inv_usd00001", "2026-10-20");
    assert.deepEqual([v.balanceMinor, v.state], [199950, "overdue"]);
    const json = JSON.stringify(P.snapshotFor(paidPart, "inv_usd00001"));
    assert.doesNotMatch(json, /upiId|sharma@okaxis|Rohan|9876543210|r@example|SECRETREF9|inrCredited|8300000|payments/, "no UPI ID, client identity, payments, references or INR credited");
  }
  // Empty fields are left out; an unsafe URL never reaches a snapshot.
  assert.deepEqual(P.publicPayDetails({ ...settings, bankName: "", bankDetails: "  ", payUrl: "javascript:alert(1)" }, "USD"), { accountName: "Sharma Tuition LLP", swift: "HDFCINBB", account: "GB82WEST12345698765432" });
  assert.deepEqual(P.publicPayDetails(undefined, "USD"), {});
  // Settings cleared after the link was made: the page still renders (no details), it never falls back to UPI.
  assert.deepEqual(P.foreignPayView(M.sanitizeWorkspace({ ...mixed, intl: { ...mixed.intl, settings: undefined } }), "inv_usd00001", "2026-10-10").pay, {});

  // --- byCurrency: the currency's own set, else the default set (whole, never mixed) ---
  const wise = { accountName: "Sharma Tuition", bankName: "Wise US", swift: "", account: "8310123456", bankDetails: "ACH routing 026073150", payUrl: "" };
  let multi = M.upsertInvoice(mixed, { ...usd("inv_eur00001", 50000), currency: "EUR" }, T);
  multi = withSettings(multi, { ...settings, byCurrency: { USD: wise } });
  assert.deepEqual(P.foreignPayView(multi, "inv_usd00001", "2026-10-10").pay, { accountName: "Sharma Tuition", bankName: "Wise US", account: "8310123456", bankDetails: "ACH routing 026073150" });
  assert.deepEqual(P.foreignPayView(multi, "inv_eur00001", "2026-10-10").pay, details);

  // --- the INR side keeps today's bytes and never carries bank details ---
  const stripped = legacyModel.sanitizeWorkspace(JSON.parse(JSON.stringify(mixed)));
  const inrSnap = JSON.stringify(P.snapshotFor(mixed, "inv_00000001"));
  assert.equal(inrSnap, JSON.stringify(legacyPaylinks.snapshotFor(stripped, "inv_00000001")), "INR invoice snapshot = deployed bytes");
  assert.equal(inrSnap, JSON.stringify(P.snapshotFor(base, "inv_00000001")));
  assert.doesNotMatch(inrSnap, /"pay"|IBAN|SWIFT|HDFCINBB|GB82WEST|paypal|exportNote/);
  {
    let inrOnly = upsertClient(base, { ...client, id: "cli_second01", name: "Second" }, T);
    inrOnly = upsertInvoice(inrOnly, inv("inv_00000002", 125050), T);
    inrOnly = upsertInvoice(inrOnly, { ...inv("inv_00000003", 99), clientId: "cli_second01" }, T);
    inrOnly = upsertInvoice(inrOnly, { ...inv("inv_00000004", 5000), voided: true }, T);
    inrOnly = addPayment(inrOnly, "inv_00000002", { amountPaise: 50, date: "2026-10-02", mode: "upi", reference: "123456789012" }, T + 1);
    inrOnly = addPayment(inrOnly, "inv_00000003", { amountPaise: 99, date: "2026-10-02", mode: "cash", reference: "" }, T + 1);
    // Bank details set on the business change nothing on INR pages.
    const withBank = withSettings(inrOnly, settings);
    const subjects = ["inv_00000001", "inv_00000002", "inv_00000003", "inv_00000004", "inv_missing01", "stmt:" + client.id, "stmt:cli_second01", "stmt:cli_missing1"];
    for (const ws of [inrOnly, M.sanitizeWorkspace(JSON.parse(JSON.stringify(inrOnly))), withBank]) {
      for (const subject of subjects) {
        assert.equal(JSON.stringify(P.snapshotFor(ws, subject)), JSON.stringify(legacyPaylinks.snapshotFor(legacyModel.sanitizeWorkspace(JSON.parse(JSON.stringify(ws))), subject)), subject);
      }
      for (const day of ["2026-09-01", "2026-10-10", "2027-01-01"]) {
        assert.equal(JSON.stringify(P.payPageView(ws, "inv_00000002", day)), JSON.stringify(legacyPaylinks.payPageView(ws, "inv_00000002", day)), day);
        assert.equal(JSON.stringify(P.statementView(ws, client.id, day)), JSON.stringify(legacyPaylinks.statementView(ws, client.id, day)), day);
        const snap = P.snapshotFor(ws, "inv_00000002");
        assert.equal(JSON.stringify(P.snapshotView(snap, day)), JSON.stringify(legacyPaylinks.snapshotView(snap, day)), `snapshotView ${day}`);
        const st = P.snapshotFor(ws, "stmt:" + client.id);
        assert.equal(JSON.stringify(P.snapshotView(st, day)), JSON.stringify(legacyPaylinks.snapshotView(st, day)), `statement snapshotView ${day}`);
      }
    }
  }
  // A stored snapshot from before this feature (no currency anywhere) still parses as an INR invoice.
  {
    const old = JSON.stringify(legacyPaylinks.snapshotFor(base, "inv_00000001"));
    const parsed = P.parseSnapshot(old);
    assert.equal(parsed.kind, "invoice");
    assert.equal(JSON.stringify(P.snapshotView(parsed, "2026-10-10")), JSON.stringify(legacyPaylinks.snapshotView(legacyPaylinks.parseSnapshot(old), "2026-10-10")));
  }

  // --- statements ---
  {
    const day = "2026-10-20";
    // Riya-like client: INR lines and total exactly the INR-only client's; US$ in its own section.
    const sv = P.statementView(mixed, client.id, day);
    const inrSv = P.statementView(base, client.id, day);
    assert.deepEqual([sv.lines, sv.totalPaise, sv.overduePaise], [inrSv.lines, inrSv.totalPaise, inrSv.overduePaise]);
    assert.deepEqual(sv.foreign, [{ currency: "USD", lines: [{ number: "INV-01", issueDate: "2026-10-01", dueDate: "2026-10-15", balancePaise: 300000, overdue: true }], totalMinor: 300000, overdueMinor: 300000 }]);
    assert.deepEqual(sv.pay, details);
    assert.equal("payByCurrency" in sv, false);
    assert.equal(sv.totalPaise, 300000, "the ₹ total never includes US$ (equal minor amounts)");
    assert.equal(P.snapshotFor(mixed, "stmt:" + client.id).kind, "statement2");
    // A client who owes only US$: no ₹ lines, a US$ section, never an empty "paid" statement.
    const only = P.statementView(mixed, "cli_globex01", day);
    assert.deepEqual([only.lines, only.totalPaise, only.foreign.map((s) => [s.currency, s.totalMinor])], [[], 0, [["USD", 9900]]]);
    // INR-only clients: no foreign key, kind "statement", byte for byte.
    assert.equal(JSON.stringify(P.snapshotFor(base, "stmt:" + client.id)), JSON.stringify(legacyPaylinks.snapshotFor(base, "stmt:" + client.id)));
    // A paid or void foreign invoice adds no section.
    const settled = M.addPayment(mixed, "inv_usd00001", { amountPaise: 300000, date: "2026-10-05", mode: "bank", reference: "W1" }, T + 1);
    assert.equal(JSON.stringify(P.statementView(settled, client.id, day)), JSON.stringify(P.statementView(base, client.id, day)));
    assert.equal(P.snapshotFor(settled, "stmt:" + client.id).kind, "statement");
    // Sections come in CURRENCIES order, each with its own lines (oldest due first) and totals.
    let three = M.upsertInvoice(mixed, { ...usd("inv_gbp00001", 700), currency: "GBP", dueDate: "2026-10-30" }, T);
    three = M.upsertInvoice(three, { ...usd("inv_eur00001", 1234), currency: "EUR" }, T);
    three = M.upsertInvoice(three, { ...usd("inv_usd00003", 100), number: "INV-U3", dueDate: "2026-10-02", issueDate: "2026-09-20" }, T);
    const s3 = P.statementView(three, client.id, day);
    assert.deepEqual(s3.foreign.map((s) => [s.currency, s.lines.map((l) => l.number), s.totalMinor, s.overdueMinor]), [["USD", ["INV-U3", "INV-01"], 300100, 300100], ["EUR", ["INV-01"], 1234, 1234], ["GBP", ["INV-01"], 700, 0]]);
    // Three currencies sharing one set of details: one pay block, no payByCurrency.
    assert.deepEqual(s3.pay, details);
    assert.equal("payByCurrency" in s3, false);
    // Different details per currency → payByCurrency, no shared pay.
    const per = P.statementView(withSettings(three, { ...settings, byCurrency: { USD: wise } }), client.id, day);
    assert.equal("pay" in per, false);
    assert.deepEqual(Object.keys(per.payByCurrency), ["USD", "EUR", "GBP"]);
    assert.equal(per.payByCurrency.USD.bankName, "Wise US");
    assert.equal(per.payByCurrency.EUR.bankName, "HDFC");
  }

  // --- export line (owner decision Q3: also on pay pages and statements) ---
  {
    const gst = M.updateBusiness(mixed, { gstin: "27ABCDE1234F1Z5" }, T + 1);
    const lut = withSettings(M.upsertInvoice(gst, usd("inv_usd00001", 300000, client.id, { exportLut: true }), T + 1), { ...settings, exportUnderLut: true, lutArn: "AD2701260012345", lutFy: "2026-27" });
    const note = `${LUT_ENDORSEMENT} (LUT ARN AD2701260012345)`;
    assert.equal(P.foreignPayView(lut, "inv_usd00001", "2026-10-10").exportNote, note);
    assert.equal("exportNote" in P.foreignPayView(lut, "inv_usd00002", "2026-10-10"), false, "not marked as an export: no line");
    const st = P.statementView(lut, client.id, "2026-10-10");
    assert.equal(st.exportNote, note);
    assert.equal(st.foreign[0].lines[0].export, true);
    assert.equal("export" in P.statementView(lut, "cli_globex01", "2026-10-10").foreign[0].lines[0], false);
    assert.equal("exportNote" in P.statementView(lut, "cli_globex01", "2026-10-10"), false);
    // An issue date outside the LUT's financial year prints nothing.
    const expired = M.upsertInvoice(lut, { ...lut.intl.invoices.inv_usd00001, issueDate: "2027-04-01", dueDate: "2027-04-15" }, T + 2);
    assert.equal("exportNote" in P.foreignPayView(expired, "inv_usd00001", "2027-04-02"), false);
    // A client with a GSTIN never gets it.
    const gstClient = M.upsertClient(lut, { ...client, gstin: "29ABCDE1234F1Z5" }, T + 3);
    assert.equal("exportNote" in P.foreignPayView(gstClient, "inv_usd00001", "2026-10-10"), false);
  }

  // --- snapshot equivalence fuzz with currencies, settings, overrides and mixed clients ---
  {
    let rnd = 11;
    const rand = (n) => { rnd = (Math.imul(rnd, 1103515245) + 12345) >>> 0; return (rnd >>> 16) % n; };
    // Coverage: the fuzz fails if it stops producing the cases it exists for (it once produced only void invoices).
    const seen = { foreignDue: 0, foreignOverdue: 0, foreignPartial: 0, foreignPaid: 0, foreignVoid: 0, inrDue: 0, inrOverdue: 0, inrPartial: 0, statement2: 0, overdueSection: 0, payShared: 0, payByCurrency: 0, exportLine: 0, exportNote: 0, multiCurrencySection: 0 };
    const d = (o) => new Date(Date.UTC(2026, 9, 10) + o * 86_400_000).toISOString().slice(0, 10);
    const codes = ["INR", "INR", "USD", "EUR", "GBP", "AED", "AUD", "CAD", "SGD"];
    const clients = ["cli_aaaaaaaa", "cli_bbbbbbbb", "cli_cccccccc"];
    for (let trial = 0; trial < 40; trial++) {
      let w = updateBusiness(emptyWorkspace(), { name: "Shop", upiId: "shop@okaxis", gstin: rand(2) ? "27ABCDE1234F1Z5" : "" }, T);
      for (const id of clients) w = upsertClient(w, { ...client, id, gstin: rand(4) ? "" : "29ABCDE1234F1Z5" }, T);
      const ids = [];
      for (let i = 0; i < 6 + rand(12); i++) {
        const id = `inv_f${trial}x${i}00000`;
        ids.push(id);
        const currency = codes[rand(codes.length)];
        const issue = d(-rand(60));
        const due = d(-rand(40) + rand(40));
        const record = { ...inv(id, 1000 * (1 + rand(300))), clientId: clients[rand(3)], issueDate: issue, dueDate: due < issue ? issue : due, ...(currency === "INR" ? {} : { currency, ...(rand(2) ? { exportLut: true } : {}) }) };
        w = M.upsertInvoice(w, record, T);
        if (rand(3) === 0) w = M.addPayment(w, id, { amountPaise: 500, date: d(-1), mode: "bank", reference: "" }, T);
        if (rand(4) === 0) w = M.addPayment(w, id, { amountPaise: M.getInvoice(w, id).amountPaise, date: d(-1), mode: "bank", reference: "" }, T);
        if (rand(8) === 0) w = M.upsertInvoice(w, { ...M.getInvoice(w, id), voided: true }, T);
      }
      if (rand(3)) w = withSettings(w, { ...settings, exportUnderLut: Boolean(rand(2)), lutArn: "AD2701260012345", lutFy: rand(2) ? "2026-27" : "2025-26", ...(rand(2) ? { byCurrency: { EUR: wise, GBP: { ...wise, bankName: "Wise UK" } } } : {}) });
      for (const offset of [-30, -1, 0, 1, 45]) {
        const today = d(offset);
        for (const id of ids) {
          const snap = P.parseSnapshot(JSON.stringify(P.snapshotFor(w, id)));
          const inr = P.payPageView(w, id, today);
          const expected = inr ?? P.foreignPayView(w, id, today);
          assert.deepEqual(snap ? P.snapshotView(snap, today).view : null, expected, `invoice ${id} @${today}`);
          const key = (inr ? "inr" : "foreign") + expected.state[0].toUpperCase() + expected.state.slice(1);
          if (key in seen) seen[key]++;
        }
        for (const id of clients) {
          const st = P.parseSnapshot(JSON.stringify(P.snapshotFor(w, `stmt:${id}`)));
          const live = P.statementView(w, id, today);
          assert.deepEqual(P.snapshotView(st, today).view, live, `statement ${id} @${today}`);
          assert.equal(st.kind, live.foreign ? "statement2" : "statement");
          if (!live.foreign) continue;
          seen.statement2++;
          if (live.foreign.some((s) => s.overdueMinor > 0)) seen.overdueSection++;
          if (live.foreign.length > 1) seen.multiCurrencySection++;
          if (live.pay) seen.payShared++;
          if (live.payByCurrency) seen.payByCurrency++;
          if (live.foreign.some((s) => s.lines.some((l) => l.export))) seen.exportLine++;
          if (live.exportNote) seen.exportNote++;
        }
      }
    }
    for (const [name, count] of Object.entries(seen)) assert.ok(count >= 5, `fuzz coverage: ${name} seen ${count} times`);
  }
  // parseSnapshot checks the foreign parts a page renders.
  {
    const good = P.snapshotFor(mixed, "inv_usd00001");
    assert.ok(P.parseSnapshot(JSON.stringify(good)));
    for (const bad of [
      { ...good, view: { ...good.view, currency: "INR" } }, { ...good, view: { ...good.view, currency: "XYZ" } },
      { ...good, view: { ...good.view, balanceMinor: -1 } }, { ...good, view: { ...good.view, amountMinor: 1.5 } }, { ...good, view: { ...good.view, pay: null } },
      { kind: "statement2", view: { ...P.statementView(mixed, client.id, "2026-10-10"), foreign: [] } },
      { kind: "statement2", view: { ...P.statementView(mixed, client.id, "2026-10-10"), foreign: [{ currency: "INR", lines: [], totalMinor: 0 }] } },
      // Shapes the page reads outside its try block (section.lines.map, statement.lines.length) and the totals it prints.
      { kind: "statement2", view: { ...P.statementView(mixed, client.id, "2026-10-10"), lines: null } },
      { kind: "statement2", view: { ...P.statementView(mixed, client.id, "2026-10-10"), lines: "x" } },
      { kind: "statement2", view: { ...P.statementView(mixed, client.id, "2026-10-10"), foreign: [{ currency: "USD", lines: null, totalMinor: 0, overdueMinor: 0 }] } },
      { kind: "statement2", view: { ...P.statementView(mixed, client.id, "2026-10-10"), foreign: [{ currency: "USD", lines: [], totalMinor: -1, overdueMinor: 0 }] } },
      { kind: "statement2", view: { ...P.statementView(mixed, client.id, "2026-10-10"), foreign: [{ currency: "USD", lines: [], totalMinor: 1.5, overdueMinor: 0 }] } },
      // A section that isn't an object is a bad shape (null), never a TypeError (review round 3).
      { kind: "statement2", view: { ...P.statementView(mixed, client.id, "2026-10-10"), foreign: [null] } },
      { kind: "statement2", view: { ...P.statementView(mixed, client.id, "2026-10-10"), foreign: ["USD"] } },
      { kind: "statement2", view: { ...P.statementView(mixed, client.id, "2026-10-10"), foreign: [[]] } },
      { kind: "receipt", view: {} },
    ]) assert.equal(P.parseSnapshot(JSON.stringify(bad)), null, JSON.stringify(bad).slice(0, 80));
  }

  // --- link creation (§4.2) ---
  {
    const noUpi = updateBusiness(mixed, { upiId: "" }, T + 1);
    const store = memoryPaylinkStore();
    // Foreign + payable details: no UPI ID needed; the record carries intl: 1.
    const made = await P.createPaylink(store, "o9", noUpi, "inv_usd00001", token, T, 10, vpa);
    assert.deepEqual([made.status, made.created], ["ok", true]);
    assert.deepEqual(await store.get(made.token), { owner: "o9", invoiceId: "inv_usd00001", createdAt: T, intl: 1 });
    assert.equal((await P.createPaylink(store, "o9", noUpi, "inv_usd00001", token, T, 10, vpa)).token, made.token, "idempotent");
    // INR without a UPI ID: no_upi, unchanged; the INR record has no intl key.
    const inrNoUpi = await P.createPaylink(store, "o9", noUpi, "inv_00000001", token, T, 10, vpa);
    assert.deepEqual([inrNoUpi.status, inrNoUpi.message, P.createStatusCode(inrNoUpi.status)], ["no_upi", "Add your UPI ID in Settings before sharing pay links.", 409]);
    const inrLink = await P.createPaylink(store, "o9", mixed, "inv_00000001", token, T, 10, vpa);
    assert.equal(JSON.stringify(await store.get(inrLink.token)), JSON.stringify({ owner: "o9", invoiceId: "inv_00000001", createdAt: T }));
    // Foreign without details → no_intl (409), with the exact messages (primary, then a named business).
    for (const s of [undefined, { ...settings, accountName: "", payUrl: "" }, { ...settings, swift: "", bankDetails: "", payUrl: "" }, { ...settings, account: "", payUrl: "" }]) {
      const w = s ? withSettings(mixed, s) : M.sanitizeWorkspace({ ...mixed, intl: { ...mixed.intl, settings: undefined } });
      const r = await P.createPaylink(memoryPaylinkStore(), "o9", w, "inv_usd00001", token, T, 10, vpa);
      assert.deepEqual([r.status, r.message, P.createStatusCode(r.status)], ["no_intl", "Add international payment details in Settings before sharing pay links for foreign-currency invoices.", 409]);
      const b = await P.createPaylink(memoryPaylinkStore(), "o9", w, "inv_usd00001", token, T, 10, vpa, linkKey("biz_bbbbbb01", "inv_usd00001"));
      assert.deepEqual([b.status, b.message], ["no_intl", "Add international payment details for Sharma Tuition in Settings before sharing pay links."]);
    }
    // Any one of: a bank account with SWIFT, a bank account with routing text, or a payment link.
    for (const s of [{ ...settings, payUrl: "" }, { ...settings, swift: "", payUrl: "" }, { ...settings, accountName: "", account: "", swift: "", bankDetails: "" }]) {
      assert.equal((await P.createPaylink(memoryPaylinkStore(), "o9", withSettings(mixed, s), "inv_usd00001", token, T, 10, vpa)).status, "ok");
    }
    // The currency's own details decide: a USD override without a way to pay blocks USD, not EUR.
    const odd = withSettings(M.upsertInvoice(mixed, { ...usd("inv_eur00001", 50000), currency: "EUR" }, T), { ...settings, byCurrency: { USD: { ...wise, account: "" } } });
    assert.equal((await P.createPaylink(memoryPaylinkStore(), "o9", odd, "inv_usd00001", token, T, 10, vpa)).status, "no_intl");
    assert.equal((await P.createPaylink(memoryPaylinkStore(), "o9", odd, "inv_eur00001", token, T, 10, vpa)).status, "ok");
    assert.equal(M.intlPayable(odd.intl.settings, "USD"), false);
    assert.equal(M.intlPayable(odd.intl.settings, "EUR"), true);
    assert.equal(M.intlPayable(undefined, "USD"), false);
    // Paid, void and deleted foreign invoices.
    const paidW = M.addPayment(mixed, "inv_usd00001", { amountPaise: 300000, date: "2026-10-05", mode: "bank", reference: "" }, T + 1);
    assert.equal((await P.createPaylink(memoryPaylinkStore(), "o9", paidW, "inv_usd00001", token, T, 10, vpa)).status, "no_balance");
    assert.equal((await P.createPaylink(memoryPaylinkStore(), "o9", M.upsertInvoice(mixed, { ...mixed.intl.invoices.inv_usd00001, voided: true }, T + 1), "inv_usd00001", token, T, 10, vpa)).status, "no_balance");
    assert.equal((await P.createPaylink(memoryPaylinkStore(), "o9", M.deleteInvoice(mixed, "inv_usd00001", T + 1), "inv_usd00001", token, T, 10, vpa)).status, "missing_invoice");
    // Foreign links count toward the active-link limit like any other.
    const lim = memoryPaylinkStore();
    assert.equal((await P.createPaylink(lim, "o9", mixed, "inv_usd00001", token, T, 1, vpa)).status, "ok");
    assert.equal((await P.createPaylink(lim, "o9", mixed, "inv_00000001", token, T, 1, vpa)).status, "limit");
    assert.deepEqual(["limit", "not_pro", "no_upi", "no_intl", "missing_invoice", "missing_client", "no_balance"].map(P.createStatusCode), [402, 402, 409, 409, 409, 409, 409]);
  }
  // Statement links (§4.2): INR part payable by UPI, or every foreign currency payable with the saved details.
  {
    const pro = { statementLinks: true, activePaylinks: 100 };
    const noIntl = M.sanitizeWorkspace({ ...mixed, intl: { ...mixed.intl, settings: undefined } });
    const noUpi = updateBusiness(mixed, { upiId: "" }, T + 1);
    const stmt = (w, id, key) => P.createStatementLink(memoryPaylinkStore(), "o9", w, id, token, T, pro, vpa, key);
    // INR-only client: unchanged rules.
    assert.equal((await stmt(base, client.id)).status, "ok");
    assert.equal((await stmt(updateBusiness(base, { upiId: "" }, T + 1), client.id)).status, "no_upi");
    // Foreign-only client: details required, UPI not.
    assert.equal((await stmt(noUpi, "cli_globex01")).status, "ok");
    const fo = await stmt(noIntl, "cli_globex01");
    assert.deepEqual([fo.status, fo.message], ["no_intl", P.NO_INTL]);
    assert.equal((await stmt(noIntl, "cli_globex01", linkKey("biz_bbbbbb01", "stmt:cli_globex01"))).message, "Add international payment details for Sharma Tuition in Settings before sharing pay links.");
    // Mixed client: either part payable is enough; neither → no_upi (the client has ₹ invoices).
    assert.equal((await stmt(mixed, client.id)).status, "ok");
    assert.equal((await stmt(noIntl, client.id)).status, "ok");
    assert.equal((await stmt(noUpi, client.id)).status, "ok");
    assert.equal((await stmt(updateBusiness(noIntl, { upiId: "" }, T + 1), client.id)).status, "no_upi");
    // Every foreign currency the client owes in must be payable: USD and EUR owed, EUR's own details unpayable → no_intl.
    let two = M.upsertInvoice(noUpi, { ...usd("inv_eur00009", 4000, "cli_globex01"), currency: "EUR" }, T);
    const eurUnpayable = withSettings(two, { ...settings, byCurrency: { EUR: { ...wise, account: "", payUrl: "" } } });
    assert.equal(M.intlPayable(eurUnpayable.intl.settings, "USD"), true);
    assert.deepEqual([(await stmt(eurUnpayable, "cli_globex01")).status], ["no_intl"]);
    assert.equal((await stmt(withSettings(two, { ...settings, byCurrency: { EUR: wise } }), "cli_globex01")).status, "ok");
    // A statement link record never carries intl (statement subjects aren't counted as paid by older tabs).
    const s = memoryPaylinkStore();
    const sm = await P.createStatementLink(s, "o9", mixed, "cli_globex01", token, T, pro, vpa);
    assert.equal(JSON.stringify(await s.get(sm.token)), JSON.stringify({ owner: "o9", invoiceId: "stmt:cli_globex01", createdAt: T }));
    // Nothing due anywhere → no_balance; Free → not_pro first.
    const allPaid = M.addPayment(mixed, "inv_usd00002", { amountPaise: 9900, date: "2026-10-05", mode: "bank", reference: "" }, T + 1);
    assert.equal((await stmt(allPaid, "cli_globex01")).status, "no_balance");
    assert.equal((await P.createStatementLink(memoryPaylinkStore(), "o9", mixed, "cli_globex01", token, T, { statementLinks: false, activePaylinks: 10 }, vpa)).status, "not_pro");
  }
  // Records and claims: intl and currency survive a parse only when valid; INR shapes are unchanged.
  {
    assert.deepEqual(parseRecord({ owner: "o", invoiceId: "inv_usd00001", createdAt: 1, intl: 1 }), { owner: "o", invoiceId: "inv_usd00001", createdAt: 1, intl: 1 });
    assert.deepEqual(parseRecord({ owner: "o", invoiceId: "biz_bbbbbb01/inv_usd00001", createdAt: 1, businessId: "biz_bbbbbb01", intl: 1 }), { owner: "o", invoiceId: "biz_bbbbbb01/inv_usd00001", createdAt: 1, businessId: "biz_bbbbbb01", intl: 1 });
    for (const v of [true, "1", 2]) assert.deepEqual(parseRecord({ owner: "o", invoiceId: "inv_00000001", createdAt: 1, intl: v }), { owner: "o", invoiceId: "inv_00000001", createdAt: 1 });
    const uetr = "eb6305c9-1f7f-49de-aed0-16487c27b42d";
    assert.deepEqual(parseClaims([JSON.stringify({ utr: uetr, amountPaise: 120050, at: 5, currency: "USD" })]), [{ utr: uetr, amountPaise: 120050, at: 5, currency: "USD" }]);
    assert.deepEqual(parseClaims([{ utr: "412345678901", amountPaise: 5, at: 5, currency: "INR" }, { utr: "512345678901", amountPaise: null, at: 6, currency: "XYZ" }]), [{ utr: "412345678901", amountPaise: 5, at: 5 }, { utr: "512345678901", amountPaise: null, at: 6 }]);
    assert.equal(parseClaims([{ utr: "A".repeat(50), amountPaise: null, at: 1 }])[0].utr.length, 40);
    assert.equal(JSON.stringify(parseClaims([{ utr: "412345678901", amountPaise: 200000, at: 7 }])[0]), JSON.stringify({ utr: "412345678901", amountPaise: 200000, at: 7 }));
    const s = memoryPaylinkStore();
    assert.equal(await addClaim(s, "TOKf", { utr: uetr, amountPaise: 120050, at: 1, currency: "USD" }), "ok");
    assert.equal(await addClaim(s, "TOKf", { utr: uetr, amountPaise: 999, at: 2, currency: "USD" }), "ok");
    assert.deepEqual(await s.claims("TOKf"), [{ utr: uetr, amountPaise: 120050, at: 1, currency: "USD" }], "deduped on the reference");
  }
  // Cross-book: book B's bank details never appear in A's snapshots; single-business putViews is still one write.
  {
    const wa = withSettings(M.upsertInvoice(base, usd("inv_usd00001", 5000), T), { ...settings, accountName: "Stores LLP", account: "GB33BUKB20201555555555" });
    const wb = withSettings(M.upsertInvoice(updateBusiness(base, { name: "Sharma Tutors" }, T), usd("inv_usd00001", 7000), T), settings);
    const store = memoryPaylinkStore();
    const la = await P.createPaylink(store, "o1", wa, "inv_usd00001", token, T, 10, vpa);
    const lb = await P.createPaylink(store, "o1", wb, "inv_usd00001", token, T, 10, vpa, linkKey("biz_bbbbbb01", "inv_usd00001"));
    await P.refreshViews(store, "o1", "biz_primary", wa);
    await P.refreshViews(store, "o1", "biz_bbbbbb01", wb);
    const va = JSON.stringify(await store.getView("o1", la.token));
    const vb = JSON.stringify(await store.getView("o1", lb.token));
    assert.match(va, /Stores LLP/);
    assert.doesNotMatch(va, /Sharma Tuition LLP|GB82WEST|Sharma Tutors/);
    assert.match(vb, /Sharma Tuition LLP/);
    assert.doesNotMatch(vb, /Stores LLP|GB33BUKB/);
    const calls = [];
    const solo = memoryPaylinkStore();
    const spy = { ...solo, putViews: (o, v) => { calls.push(["put", Object.keys(v).length]); return solo.putViews(o, v); }, patchViews: () => { calls.push(["patch"]); } };
    await P.createPaylink(solo, "o2", wa, "inv_usd00001", token, T, 10, vpa);
    await P.createPaylink(solo, "o2", wa, "inv_00000001", token, T, 10, vpa);
    await P.refreshViews(spy, "o2", "biz_primary", wa);
    assert.deepEqual(calls, [["put", 2]]);
  }
  // paidLinkTokens resolves both maps: a live foreign invoice with a balance is never "paid".
  {
    const shelf = { index: emptyIndex(), books: { biz_primary: mixed } };
    const links = { inv_usd00001: { token: "t-usd" }, inv_00000001: { token: "t-inr" }, inv_gone0001: { token: "t-gone" } };
    assert.deepEqual(paidLinkTokens(links, shelf, new Set(["biz_primary"]), "2026-10-10"), ["t-gone"]);
    const strippedShelf = { index: emptyIndex(), books: { biz_primary: legacyModel.sanitizeWorkspace(JSON.parse(JSON.stringify(mixed))) } };
    assert.deepEqual(paidLinkTokens(links, strippedShelf, new Set(["biz_primary"]), "2026-10-10"), ["t-usd", "t-gone"], "(an old tab's stripped copy counts it as paid: the §1.7 server guard hides intl links from it)");
    const paid = { index: emptyIndex(), books: { biz_primary: M.addPayment(mixed, "inv_usd00001", { amountPaise: 300000, date: "2026-10-05", mode: "bank", reference: "" }, T + 1) } };
    assert.deepEqual(paidLinkTokens(links, paid, new Set(["biz_primary"]), "2026-10-10"), ["t-usd", "t-gone"]);
  }
  // The switcher badge counts every claim the screen shows: since PR 4 foreign claims have claim cards too (review
  // round 1 of PR 3 left them out until then); INR invoice and statement claims count as before.
  {
    const { pendingClaimCounts } = await import("../src/lib/workspace/paylinks.ts");
    const inrClaim = { utr: "412345678901", amountPaise: 100, at: 1 };
    const usdClaim = { utr: "WISE123456", amountPaise: 50000, at: 2, currency: "USD" };
    assert.deepEqual(pendingClaimCounts({
      inv_00000001: { claims: [inrClaim] },
      inv_usd00001: { claims: [usdClaim, { ...usdClaim, utr: "WISE123457" }] },
      "stmt:cli_aaaaaaaa": { claims: [inrClaim, { ...inrClaim, utr: "512345678901" }] },
      "biz_bbbbbb01/inv_usd00001": { claims: [usdClaim] },
      "biz_bbbbbb01/inv_00000002": { claims: [] },
      "biz_cccccc01/inv_00000003": { claims: [inrClaim] },
    }), { biz_primary: 5, biz_bbbbbb01: 1, biz_cccccc01: 1 });
  }
}

// no_intl reaches the user translated (review round 1): the server names a non-primary business in its text, which
// has no Hindi key, so the client sends the {business} template with the name the UI shows.
{
  const { createPaylinkFor, createStatementLinkFor } = await import("../src/lib/workspace/paylinkClient.ts");
  const { WS_HI } = await import("../src/data/workspacePhrases.ts");
  const P = await import("../src/lib/workspace/paylinks.ts");
  const hi = (english, vars) => (WS_HI[english] ?? english).replace(/\{(\w+)\}/g, (m, k) => (vars && k in vars ? String(vars[k]) : m));
  const realFetch = globalThis.fetch;
  let reply;
  globalThis.fetch = async () => new Response(JSON.stringify(reply), { status: 409, headers: { "Content-Type": "application/json" } });
  try {
    reply = { error: "Add international payment details for Book Two in Settings before sharing pay links.", code: "no_intl" };
    for (const make of [createPaylinkFor, createStatementLinkFor]) {
      const named = await make("inv_usd00001", "biz_bbbbbb01", { businessName: "Book Two" });
      assert.deepEqual(named, { error: P.NO_INTL_FOR, code: "no_intl", vars: { business: "Book Two" } });
      assert.equal(hi(named.error, named.vars), "पेमेंट लिंक भेजने से पहले सेटिंग्स में Book Two की अंतरराष्ट्रीय भुगतान की जानकारी जोड़ें।");
      // Without a name from the UI: the server's English text, as before.
      assert.deepEqual(await make("inv_usd00001", "biz_bbbbbb01", {}), { error: reply.error, code: "no_intl" });
    }
    reply = { error: P.NO_INTL, code: "no_intl" };
    const primary = await createPaylinkFor("inv_usd00001");
    assert.deepEqual(primary, { error: P.NO_INTL, code: "no_intl" });
    assert.notEqual(hi(primary.error), primary.error, "the primary's no_intl text has a Hindi key");
    // Other refusals keep the server's text.
    reply = { error: "Add your UPI ID in Settings before sharing pay links.", code: "no_upi" };
    assert.deepEqual(await createPaylinkFor("inv_00000001"), reply);
  } finally {
    globalThis.fetch = realFetch;
  }
  // The server's qualified text is the template with the name filled in (a "$&" in a name is kept literally).
  const usdOnly = upsertInvoice(updateBusiness(upsertClient(emptyWorkspace(), client, T), { name: "A$&B", upiId: "ab@okaxis" }, T), { ...inv("inv_usd00001", 5000), currency: "USD" }, T);
  const named = await P.createPaylink(memoryPaylinkStore(), "o9", usdOnly, "inv_usd00001", token, T, 10, vpa, "biz_bbbbbb01/inv_usd00001");
  assert.equal(named.status, "no_intl");
  assert.equal(named.message, P.NO_INTL_FOR.replace("{business}", "A$$&B"));
}

console.log("[paylinks] public view privacy, live balance, create guards, free limit, revoke, claims, and foreign-currency links/statements checks passed");
