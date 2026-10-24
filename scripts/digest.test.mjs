import assert from "node:assert/strict";
import { createECDH, createDecipheriv, hkdfSync } from "node:crypto";
import { morningDigest } from "../src/lib/workspace/digest.ts";
import { addPayment, emptyWorkspace, upsertClient, upsertInvoice } from "../src/lib/workspace/model.ts";
import { memoryCloudStore, syncWorkspace } from "../src/lib/workspace/cloud.ts";
import { memoryPushStore, MAX_DEVICES_PER_ACCOUNT } from "../src/lib/push/store.ts";
import { runMorningDigest } from "../src/lib/push/digestRunner.ts";
import { b64u, fromB64u } from "../src/lib/push/webpush.ts";

const T = 1_790_000_000_000;
const today = "2026-10-10";
const client = (id, name) => ({ id, name, phone: "", email: "", gstin: "", createdAt: T, updatedAt: T });
const inv = (id, number, clientId, dueDate, amountPaise) => ({ id, number, clientId, issueDate: "2026-09-01", dueDate, amountPaise, description: "", payments: [], reminders: [], voided: false, createdAt: T, updatedAt: T });
let ws = upsertClient(upsertClient(emptyWorkspace(), client("cli_acme0001", "Acme Traders"), T), client("cli_rohan001", "Rohan"), T);
ws = upsertInvoice(ws, inv("inv_00000001", "A-1", "cli_acme0001", "2026-09-22", 2500000), T); // 18 days late
ws = upsertInvoice(ws, inv("inv_00000002", "A-2", "cli_rohan001", "2026-10-10", 300000), T); // due today
ws = upsertInvoice(ws, inv("inv_00000003", "A-3", "cli_rohan001", "2026-10-20", 100000), T); // not yet due

const d = morningDigest(ws, today);
assert.equal(d.title, "2 invoices to chase today");
assert.equal(d.body, "₹25,000 overdue, 1 due today. Start with Acme Traders — ₹25,000, 18 days late.");
assert.equal(d.url, "/app/");
assert.equal(d.tag, "digest-2026-10-10");
let quiet = addPayment(ws, "inv_00000001", { amountPaise: 2500000, date: today, mode: "upi", reference: "" }, T + 1);
quiet = addPayment(quiet, "inv_00000002", { amountPaise: 300000, date: today, mode: "upi", reference: "" }, T + 1);
assert.equal(morningDigest(quiet, today), null, "nothing to chase → no notification");
assert.equal(morningDigest(emptyWorkspace(), today), null);

// Recurring plans count in the digest even before the app generates them.
{
  const { upsertPlan } = await import("../src/lib/workspace/model.ts");
  let only = upsertClient(emptyWorkspace(), client("cli_riya0001", "Riya"), T);
  only = upsertPlan(only, { id: "rec_abcdefghij0123456789", clientId: "cli_riya0001", amountPaise: 300000, description: "", dayOfMonth: 10, dueAfterDays: 0, startMonth: "2026-10", endMonth: "", paused: false, createdAt: T, updatedAt: T }, T);
  const dd = morningDigest(only, today);
  assert.equal(dd?.title, "1 invoice to chase today");
  assert.match(dd.body, /Start with Riya — ₹3,000, due today\./);
}

// Runner: one push per device, expired devices pruned, once per day, owners without subs forgotten.
const cloud = memoryCloudStore();
await syncWorkspace(cloud, "ownerA", ws, T);
await syncWorkspace(cloud, "ownerB", quiet, T);
const push = memoryPushStore();
const device = () => { const e = createECDH("prime256v1"); e.generateKeys(); return { pub: b64u(e.getPublicKey()), priv: b64u(e.getPrivateKey()), auth: b64u(Buffer.alloc(16, 3)) }; };
const phone = device();
const laptop = device();
await push.add("ownerA", { endpoint: "https://fcm.googleapis.com/fcm/send/phone", keys: { p256dh: phone.pub, auth: phone.auth }, createdAt: T });
await push.add("ownerA", { endpoint: "https://updates.push.services.mozilla.com/wpush/v2/laptop", keys: { p256dh: laptop.pub, auth: laptop.auth }, createdAt: T });
await push.add("ownerA", { endpoint: "https://evil.example/steal", keys: { p256dh: laptop.pub, auth: laptop.auth }, createdAt: T });
await push.add("ownerB", { endpoint: "https://fcm.googleapis.com/fcm/send/b", keys: { p256dh: phone.pub, auth: phone.auth }, createdAt: T });
const vk = createECDH("prime256v1"); vk.generateKeys();
const vapid = { publicKey: b64u(vk.getPublicKey()), privateKey: b64u(vk.getPrivateKey()), subject: "mailto:support@proupiqr.in" };
const deliveries = [];
const fetchImpl = async (url, init) => {
  deliveries.push({ url, body: Buffer.from(init.body) });
  return new Response(null, { status: url.includes("mozilla") ? 410 : 201 });
};
const r1 = await runMorningDigest({ push, cloud, vapid, today, now: T, fetchImpl });
assert.deepEqual(r1, { owners: 2, notified: 1, sent: 1, expired: 1, failed: 0, remaining: 0, fromProjection: 0 });
assert.equal(deliveries.length, 2, "evil endpoint never contacted; quiet owner not notified");
assert.ok(deliveries.every((x) => !x.url.includes("evil")));
assert.deepEqual((await push.list("ownerA")).map((s) => s.endpoint), ["https://fcm.googleapis.com/fcm/send/phone"], "expired + disallowed endpoints pruned");
// The phone can decrypt exactly the digest.
const body = deliveries.find((x) => x.url.includes("phone")).body;
const ecdh = createECDH("prime256v1"); ecdh.setPrivateKey(fromB64u(phone.priv));
const asPub = body.subarray(21, 86);
const ikm = Buffer.from(hkdfSync("sha256", ecdh.computeSecret(asPub), fromB64u(phone.auth), Buffer.concat([Buffer.from("WebPush: info\0", "latin1"), fromB64u(phone.pub), asPub]), 32));
const salt = body.subarray(0, 16);
const dec = createDecipheriv("aes-128-gcm", Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0", "latin1"), 16)), Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0", "latin1"), 12)));
const ct = body.subarray(86);
dec.setAuthTag(ct.subarray(ct.length - 16));
const plain = Buffer.concat([dec.update(ct.subarray(0, ct.length - 16)), dec.final()]);
assert.deepEqual(JSON.parse(plain.subarray(0, plain.length - 1).toString()), d);
// A retried cron the same day sends nothing.
const r2 = await runMorningDigest({ push, cloud, vapid, today, now: T, fetchImpl });
assert.equal(r2.sent + r2.notified, 0);
// Next day sends again.
assert.equal((await runMorningDigest({ push, cloud, vapid, today: "2026-10-11", now: T, fetchImpl })).sent, 1);
// Device cap.
for (let i = 0; i < 8; i++) await push.add("ownerC", { endpoint: `https://fcm.googleapis.com/fcm/send/c${i}`, keys: { p256dh: phone.pub, auth: phone.auth }, createdAt: T + i });
assert.equal((await push.list("ownerC")).length, MAX_DEVICES_PER_ACCOUNT);
// Owners whose last device was removed are forgotten.
await push.remove("ownerB", "https://fcm.googleapis.com/fcm/send/b");
assert.ok(!(await push.owners()).includes("ownerB"));

console.log("[digest] morning digest text, runner delivery/pruning/once-per-day, SSRF guard, and device cap passed");

// Projection: the cron's compact read must produce exactly the same digest as the full workspace.
{
  const { digestProjection, workspaceFromProjection, parseProjection } = await import("../src/lib/workspace/digest.ts");
  const { upsertPlan, deleteInvoice: del, generateRecurring } = await import("../src/lib/workspace/model.ts");
  let rnd = 42;
  const rand = (n) => { rnd = (rnd * 1103515245 + 12345) % 2147483648; return rnd % n; };
  const day = (offset) => new Date(Date.UTC(2026, 9, 10) + offset * 86_400_000).toISOString().slice(0, 10);
  for (let trial = 0; trial < 40; trial++) {
    let w = emptyWorkspace();
    const names = ["Acme Traders", "Rohan", "Riya Kapoor", "Bright Kids School", "Sharma & Sons"];
    names.forEach((name, i) => { w = upsertClient(w, client(`cli_c${i}00000`, name), T); });
    const count = 5 + rand(40);
    for (let i = 0; i < count; i++) {
      const issue = day(-rand(90));
      const due = day(Number(issue.slice(8)) % 2 ? -rand(60) : rand(30));
      w = upsertInvoice(w, { ...inv(`inv_t${trial}x${i}0000`, `N-${i}`, `cli_c${rand(5)}00000`, due < issue ? issue : due, 1000 * (1 + rand(500))), issueDate: issue }, T);
      if (rand(3) === 0) w = addPayment(w, `inv_t${trial}x${i}0000`, { amountPaise: 500 * (1 + rand(10)), date: day(-1), mode: "upi", reference: "" }, T);
      if (rand(10) === 0) w = upsertInvoice(w, { ...w.invoices[`inv_t${trial}x${i}0000`], voided: true }, T);
    }
    if (rand(2)) {
      const plan = { id: `rec_t${trial}abcdefghijklmn`, clientId: "cli_c100000", amountPaise: 300000, description: "", dayOfMonth: 1 + rand(28), dueAfterDays: rand(10), startMonth: "2026-0" + (5 + rand(4)), endMonth: rand(3) === 0 ? "2026-09" : "", paused: false, createdAt: T, updatedAt: T };
      w = upsertPlan(w, plan, T);
      w = generateRecurring(w, day(-rand(40)), T).ws; // some months already generated
      const anyRec = Object.keys(w.invoices).find((id) => w.invoices[id].recurringId);
      if (anyRec && rand(2)) w = del(w, anyRec, T); // a deleted month stays deleted
    }
    const p = parseProjection(JSON.stringify(digestProjection(w)));
    for (const offset of [-5, 0, 3, 25]) {
      assert.deepEqual(morningDigest(workspaceFromProjection(p), day(offset)), morningDigest(w, day(offset)), `trial ${trial} offset ${offset}`);
    }
  }
  const big = (() => { let w = upsertClient(emptyWorkspace(), client("cli_c000000", "Acme"), T); for (let i = 0; i < 2000; i++) w = upsertInvoice(w, { ...inv(`inv_b${String(i).padStart(7, "0")}`, `B-${i}`, "cli_c000000", day(-i % 60), 100000), description: "x".repeat(200) }, T); return w; })();
  const fullBytes = JSON.stringify(big).length;
  const projBytes = JSON.stringify(digestProjection(big)).length;
  assert.ok(projBytes * 10 < fullBytes, `projection should be >10x smaller (${projBytes} vs ${fullBytes})`);
  assert.equal(parseProjection("{bad"), null);
  assert.equal(parseProjection({ v: 99, open: [], plans: [] }), null);
  console.log(`[digest] projection ≡ full digest across 160 random cases; 2,000-invoice workspace ${Math.round(fullBytes / 1024)} KB → ${Math.round(projBytes / 1024)} KB`);
}

// Runner reads projections when present, backfills them when missing, and honours a deadline.
{
  const { memoryProjectionStore } = await import("../src/lib/workspace/digest.ts");
  const projStore = memoryProjectionStore();
  const cloud2 = memoryCloudStore();
  const push2 = memoryPushStore();
  const devices = [];
  for (let i = 0; i < 30; i++) {
    const owner = `owner${String(i).padStart(3, "0")}`;
    await syncWorkspace(cloud2, owner, ws, T);
    const d = device(); devices.push(d);
    await push2.add(owner, { endpoint: `https://fcm.googleapis.com/fcm/send/${owner}`, keys: { p256dh: d.pub, auth: d.auth }, createdAt: T });
  }
  const ok = async () => new Response(null, { status: 201 });
  const first = await runMorningDigest({ push: push2, cloud: cloud2, projections: projStore, vapid, today, now: T, fetchImpl: ok });
  assert.deepEqual([first.notified, first.sent, first.fromProjection, first.remaining], [30, 30, 0, 0], "first run backfills projections");
  assert.equal(projStore.primary.size, 30);
  assert.equal(projStore.books.size, 0, "single-business accounts never get book projections");
  const second = await runMorningDigest({ push: push2, cloud: memoryCloudStore() /* full docs unavailable */, projections: projStore, vapid, today: "2026-10-11", now: T, fetchImpl: ok });
  assert.deepEqual([second.notified, second.fromProjection], [30, 30], "next day uses projections only");
  // Deadline already passed: nothing starts, everything is reported as remaining.
  const late = await runMorningDigest({ push: push2, cloud: cloud2, projections: projStore, vapid, today: "2026-10-12", now: T, fetchImpl: ok, deadline: Date.now() - 1 });
  assert.deepEqual([late.notified, late.remaining], [0, 30]);
  // A later run the same day finishes them (per-day marks make runs resumable).
  const resumed = await runMorningDigest({ push: push2, cloud: cloud2, projections: projStore, vapid, today: "2026-10-12", now: T, fetchImpl: ok });
  assert.deepEqual([resumed.notified, resumed.remaining], [30, 0]);
  console.log("[digest] runner uses projections, backfills them, honours deadlines, and resumes");
}

// Several businesses (books): one combined notification; one book is byte-identical to morningDigest.
{
  const { morningDigestBooks, digestProjection, bookProjection, parseProjection, workspaceFromProjection, memoryProjectionStore, NAME_BUSINESSES_ON_LOCK_SCREEN } = await import("../src/lib/workspace/digest.ts");
  const { updateBusiness } = await import("../src/lib/workspace/model.ts");
  assert.equal(NAME_BUSINESSES_ON_LOCK_SCREEN, false, "lock-screen business names ship off");
  // One book ≡ morningDigest over 160 random workspaces (and with nameBooks on, too).
  let rnd = 9;
  const rand = (n) => { rnd = (rnd * 1103515245 + 12345) % 2147483648; return rnd % n; };
  const day = (offset) => new Date(Date.UTC(2026, 9, 10) + offset * 86_400_000).toISOString().slice(0, 10);
  for (let trial = 0; trial < 160; trial++) {
    let w = upsertClient(upsertClient(emptyWorkspace(), client("cli_c000000", "Acme"), T), client("cli_c100000", "Rohan"), T);
    for (let i = 0; i < rand(12); i++) w = upsertInvoice(w, inv(`inv_r${trial}x${i}0000`, `R-${i}`, `cli_c${rand(2)}00000`, day(rand(30) - 20), 1000 * (1 + rand(900))), T);
    const today2 = day(rand(5));
    for (const nameBooks of [false, true]) {
      assert.deepEqual(morningDigestBooks([{ id: "biz_primary", name: "Shop", ws: w }], today2, nameBooks), morningDigest(w, today2), `trial ${trial}`);
    }
  }
  assert.equal(morningDigestBooks([], today, false), null);

  // Two books with the same client name: never collapsed, chased together.
  let a = updateBusiness(upsertClient(emptyWorkspace(), client("cli_acme0001", "Acme Traders"), T), { name: "Sharma Stores", upiId: "sharma@okaxis" }, T);
  a = upsertInvoice(a, inv("inv_00000001", "A-1", "cli_acme0001", "2026-10-01", 500000), T); // 9 days late
  let b = updateBusiness(upsertClient(emptyWorkspace(), client("cli_acme0001", "Acme Traders"), T), { name: "Sharma Tutors", upiId: "tutor@okhdfc" }, T);
  b = upsertInvoice(b, inv("inv_00000001", "T-1", "cli_acme0001", "2026-09-20", 250000), T); // 20 days late
  b = upsertInvoice(b, inv("inv_00000002", "T-2", "cli_acme0001", "2026-10-10", 100000), T); // due today
  const two = [{ id: "biz_primary", name: "Sharma Stores", ws: a }, { id: "biz_tutors000001", name: "Sharma Tutors", ws: b }];
  assert.deepEqual(morningDigestBooks(two, today, false), {
    title: "3 invoices to chase today",
    body: "₹7,500 overdue, 1 due today. Start with Acme Traders — ₹2,500, 20 days late.",
    url: "/app/?business=biz_tutors000001",
    tag: "digest-2026-10-10",
    count: 3,
  });
  assert.equal(morningDigestBooks(two, today, true).body, "₹7,500 overdue, 1 due today. Start with Acme Traders (Sharma Tutors) — ₹2,500, 20 days late.");
  // Top invoice in the primary → plain /app/; an empty name drops the parentheses.
  const primaryTop = [{ id: "biz_primary", name: "", ws: b }, { id: "biz_stores000001", name: "Sharma Stores", ws: a }];
  assert.equal(morningDigestBooks(primaryTop, today, true).url, "/app/");
  assert.equal(morningDigestBooks(primaryTop, today, true).body, "₹7,500 overdue, 1 due today. Start with Acme Traders — ₹2,500, 20 days late.");
  // From projections (what the cron reads) the result is the same.
  const fromProj = two.map((x) => ({ ...x, ws: workspaceFromProjection(parseProjection(JSON.stringify(x.id === "biz_primary" ? digestProjection(x.ws) : bookProjection(x.ws)))) }));
  assert.deepEqual(morningDigestBooks(fromProj, today, false), morningDigestBooks(two, today, false));

  // Projection versions: the primary keeps writing v1; other books write v2 with the name.
  assert.equal(digestProjection(a).v, 1);
  assert.equal("name" in digestProjection(a), false, "primary projections stay byte-identical (no name)");
  assert.deepEqual([bookProjection(b).v, bookProjection(b).name], [2, "Sharma Tutors"]);
  assert.deepEqual([parseProjection({ v: 1, open: [], plans: [] }).name, parseProjection({ v: 2, name: "X", open: [], plans: [] }).name], ["", "X"]);
  assert.equal(parseProjection({ v: 99, name: "X", open: [], plans: [] }), null);

  // Runner: the hash merges with the legacy key; only live books count; dead fields are dropped;
  // a missing book projection is read from that book's document and backfilled; one push per account.
  const owner = "ownerMB";
  const cloudMB = memoryCloudStore();
  const { slotFor, syncBookIndex } = await import("../src/lib/workspace/cloud.ts");
  const indexStore = memoryCloudStore();
  await syncWorkspace(cloudMB, slotFor(owner, "biz_primary"), a, T);
  await syncWorkspace(cloudMB, slotFor(owner, "biz_tutors000001"), b, T);
  await syncBookIndex(indexStore, owner, { v: 1, books: { biz_primary: { id: "biz_primary", createdAt: 0 }, biz_tutors000001: { id: "biz_tutors000001", createdAt: 1 }, biz_gone00000001: { id: "biz_gone00000001", createdAt: 2 } } }, T, async () => 20);
  await syncBookIndex(indexStore, owner, { v: 1, books: { biz_gone00000001: { id: "biz_gone00000001", createdAt: 2, deletedAt: 5 } } }, T + 1, async () => 20);
  const projMB = memoryProjectionStore(async (o) => (await indexStore.read(o)).doc);
  await projMB.put(owner, "biz_primary", digestProjection(a));
  // A deleted book's projection (with a huge overdue amount) must be ignored and removed.
  let ghost = upsertClient(emptyWorkspace(), client("cli_ghost001", "Ghost Client"), T);
  ghost = upsertInvoice(ghost, inv("inv_00000009", "G-1", "cli_ghost001", "2026-01-01", 99900000), T);
  await projMB.put(owner, "biz_gone00000001", bookProjection(ghost));
  const pushMB = memoryPushStore();
  const dev = device();
  await pushMB.add(owner, { endpoint: "https://fcm.googleapis.com/fcm/send/mb", keys: { p256dh: dev.pub, auth: dev.auth }, createdAt: T });
  const sent = [];
  const capture = async (url, init) => { sent.push(Buffer.from(init.body)); return new Response(null, { status: 201 }); };
  const run1 = await runMorningDigest({ push: pushMB, cloud: cloudMB, projections: projMB, books: indexStore, vapid, today, now: T, fetchImpl: capture });
  assert.deepEqual([run1.notified, run1.sent, run1.fromProjection], [1, 1, 0], "the tutors book had no projection: read from its document");
  assert.deepEqual(await projMB.bookIds(owner), ["biz_tutors000001"], "dead field dropped, missing live field backfilled");
  const decrypt = (bodyBuf) => {
    const e = createECDH("prime256v1"); e.setPrivateKey(fromB64u(dev.priv));
    const pub = bodyBuf.subarray(21, 86);
    const k = Buffer.from(hkdfSync("sha256", e.computeSecret(pub), fromB64u(dev.auth), Buffer.concat([Buffer.from("WebPush: info\0", "latin1"), fromB64u(dev.pub), pub]), 32));
    const sl = bodyBuf.subarray(0, 16);
    const dc = createDecipheriv("aes-128-gcm", Buffer.from(hkdfSync("sha256", k, sl, Buffer.from("Content-Encoding: aes128gcm\0", "latin1"), 16)), Buffer.from(hkdfSync("sha256", k, sl, Buffer.from("Content-Encoding: nonce\0", "latin1"), 12)));
    const c = bodyBuf.subarray(86);
    dc.setAuthTag(c.subarray(c.length - 16));
    const pl = Buffer.concat([dc.update(c.subarray(0, c.length - 16)), dc.final()]);
    return JSON.parse(pl.subarray(0, pl.length - 1).toString());
  };
  assert.deepEqual(decrypt(sent[0]), morningDigestBooks(two, today, false), "combined digest of the live books, nothing from the deleted one");
  const again = await runMorningDigest({ push: pushMB, cloud: cloudMB, projections: projMB, books: indexStore, vapid, today, now: T, fetchImpl: capture });
  assert.deepEqual([again.notified, again.sent, sent.length], [0, 0, 1], "markDigest: once per account per day");
  const next = await runMorningDigest({ push: pushMB, cloud: memoryCloudStore(), projections: projMB, books: indexStore, vapid, today: "2026-10-11", now: T, fetchImpl: capture });
  assert.deepEqual([next.notified, next.fromProjection], [1, 1], "next day: projections only");
  // An unreadable index skips the account (no push, no writes).
  const bad = memoryProjectionStore(async () => "{not json");
  await bad.put("ownerBad", "biz_primary", digestProjection(a));
  const pushBad = memoryPushStore();
  await pushBad.add("ownerBad", { endpoint: "https://fcm.googleapis.com/fcm/send/bad", keys: { p256dh: dev.pub, auth: dev.auth }, createdAt: T });
  const skipped = await runMorningDigest({ push: pushBad, cloud: cloudMB, projections: bad, vapid, today, now: T, fetchImpl: capture });
  assert.deepEqual([skipped.notified, skipped.sent], [0, 0]);
  // Without a projection store, the index store decides which books are live.
  const pushNo = memoryPushStore();
  await pushNo.add(owner, { endpoint: "https://fcm.googleapis.com/fcm/send/no", keys: { p256dh: dev.pub, auth: dev.auth }, createdAt: T });
  const before = sent.length;
  const noProj = await runMorningDigest({ push: pushNo, cloud: cloudMB, books: indexStore, vapid, today, now: T, fetchImpl: capture });
  assert.deepEqual([noProj.notified, noProj.sent], [1, 1]);
  assert.deepEqual(decrypt(sent[before]), morningDigestBooks(two, today, false));
  // Projections unavailable AND the index read fails: skip the account (no primary-only digest, not marked, retried later).
  const failing = { ...projMB, getAll: async () => { throw new Error("KV blip"); } };
  const brokenIndex = { ...indexStore, read: async () => { throw new Error("KV blip"); } };
  const pushErr = memoryPushStore();
  await pushErr.add(owner, { endpoint: "https://fcm.googleapis.com/fcm/send/err", keys: { p256dh: dev.pub, auth: dev.auth }, createdAt: T });
  const sentBefore = sent.length;
  const errRun = await runMorningDigest({ push: pushErr, cloud: cloudMB, projections: failing, books: brokenIndex, vapid, today, now: T, fetchImpl: capture });
  assert.deepEqual([errRun.notified, errRun.sent, sent.length - sentBefore], [0, 0, 0]);
  const retry = await runMorningDigest({ push: pushErr, cloud: cloudMB, projections: failing, books: indexStore, vapid, today, now: T, fetchImpl: capture });
  assert.deepEqual([retry.notified, retry.sent], [1, 1], "not marked: a later run the same day sends it");
  assert.deepEqual(decrypt(sent.at(-1)), morningDigestBooks(two, today, false), "…with every live business");
  // An absent index (single-business account) with projections unavailable still sends today's digest.
  const pushSolo = memoryPushStore();
  const soloCloud = memoryCloudStore();
  await syncWorkspace(soloCloud, "ownerSolo", ws, T);
  await pushSolo.add("ownerSolo", { endpoint: "https://fcm.googleapis.com/fcm/send/solo", keys: { p256dh: dev.pub, auth: dev.auth }, createdAt: T });
  const soloRun = await runMorningDigest({ push: pushSolo, cloud: soloCloud, projections: failing, books: memoryCloudStore(), vapid, today, now: T, fetchImpl: capture });
  assert.deepEqual([soloRun.notified, soloRun.sent], [1, 1]);
  assert.deepEqual(decrypt(sent.at(-1)), morningDigest(ws, today));
  console.log("[digest] several businesses: one book ≡ morningDigest (160 cases), exact combined text, live-only runner with backfill, once per day");
}

// Clients abroad, PR 1 (docs/spec-foreign-clients.md §1.6): the projection and the digest leave foreign
// invoices and plans out until the digest can show them per currency (PR 2), so a rollback never sums US$ as ₹.
{
  const M = await import("../src/lib/workspace/model.ts");
  const D = await import("../src/lib/workspace/digest.ts");
  const X = 1_791_000_000_000;
  const c = (id, name) => ({ id, name, phone: "", email: "", gstin: "", createdAt: X, updatedAt: X });
  const i = (id, clientId, amountPaise, extra = {}) => ({ id, number: id.slice(-4), clientId, issueDate: "2026-09-01", dueDate: "2026-09-20", amountPaise, description: "", payments: [], reminders: [], voided: false, createdAt: X, updatedAt: X, ...extra });
  let inr = M.upsertClient(M.upsertClient(M.emptyWorkspace(), c("cli_acme0001", "Acme"), X), c("cli_globex01", "Globex"), X);
  inr = M.upsertInvoice(inr, i("inv_inr00001", "cli_acme0001", 250000), X);
  inr = M.upsertPlan(inr, { id: "rec_inrplan001", clientId: "cli_acme0001", amountPaise: 100000, description: "", dayOfMonth: 2, dueAfterDays: 5, startMonth: "2026-09", endMonth: "", paused: false, createdAt: X, updatedAt: X }, X);
  inr = M.generateRecurring(inr, "2026-09-10", X).ws;
  let mixed = M.upsertInvoice(inr, i("inv_usd00001", "cli_globex01", 999999, { currency: "USD" }), X);
  mixed = M.upsertPlan(mixed, { id: "rec_usdplan001", clientId: "cli_globex01", amountPaise: 50000, description: "", dayOfMonth: 1, dueAfterDays: 5, startMonth: "2026-08", endMonth: "", paused: false, createdAt: X, updatedAt: X, currency: "USD" }, X);
  mixed = M.generateRecurring(mixed, "2026-09-10", X).ws;
  assert.ok(Object.keys(mixed.intl.invoices).length > 1);
  assert.equal(JSON.stringify(D.digestProjection(mixed)), JSON.stringify(D.digestProjection(inr)), "byte-identical projection: no foreign entries");
  assert.equal(JSON.stringify(D.bookProjection(mixed)), JSON.stringify(D.bookProjection(inr)));
  for (const day of ["2026-09-20", "2026-10-01", "2026-11-15"]) {
    assert.deepEqual(D.morningDigest(mixed, day), D.morningDigest(inr, day), "the ₹ digest never includes a US$ amount");
    assert.deepEqual(D.morningDigest(D.workspaceFromProjection(D.parseProjection(JSON.stringify(D.digestProjection(mixed)))), day), D.morningDigest(inr, day));
  }
  console.log("[digest] foreign invoices and plans stay out of the projection and the ₹ digest (PR 1)");
}
