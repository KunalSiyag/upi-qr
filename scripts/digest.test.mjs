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
  const projStore = (() => { const m = new Map(); return { get: async (o) => m.get(o) ?? null, put: async (o, p) => { m.set(o, p); }, m }; })();
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
  assert.equal(projStore.m.size, 30);
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
