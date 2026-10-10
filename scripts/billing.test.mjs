import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { applySubscriptionEvent, hasProAccess, parseSubscriptionRecord, PENDING_GRACE_MS } from "../src/lib/billing/subscription.ts";
import { cancelAtCycleEnd, createSubscription, fetchSubscription, parseSubscriptionWebhook, razorpayConfig, verifyWebhookSignature } from "../src/lib/billing/razorpay.ts";
import { CHECKOUT_RECHECK_WINDOW_MS, dueForDailyCheck, PERIOD_END_GRACE_MS, RECHECK_SECONDS, recheckInterval, reconcileDueSubscriptions, reconcileSubscription } from "../src/lib/billing/reconcile.ts";
import { handleSubscriptionWebhook } from "../src/lib/billing/webhook.ts";
import { memoryBillingStore } from "../src/lib/billing/store.ts";
import { planFromSubscription, PLANS } from "../src/lib/workspace/entitlements.ts";
import { PRO_PRICES, YEARLY_SAVING_RUPEES } from "../src/data/pricing.ts";
import { readFileSync } from "node:fs";
import { findOrCreatePlans, readPrices } from "./razorpay-plans.mjs";

const DAY = 86_400_000;
const now = 1_790_000_000_000;
const owner = "a".repeat(32);
const env = { RAZORPAY_KEY_ID: "rzp_test_key", RAZORPAY_KEY_SECRET: "secret", RAZORPAY_WEBHOOK_SECRET: "whsec", RAZORPAY_PLAN_MONTHLY: "plan_month", RAZORPAY_PLAN_YEARLY: "plan_year" };
const config = razorpayConfig(env);

// Config is all-or-nothing.
assert.ok(config);
assert.equal(razorpayConfig({ ...env, RAZORPAY_WEBHOOK_SECRET: "" }), null);
assert.equal(razorpayConfig({}), null);

// Prices are integer paise and the yearly saving is exact.
assert.equal(PRO_PRICES.monthly.paise, 14900);
assert.equal(YEARLY_SAVING_RUPEES, 289);

// Access rules.
const rec = (status, currentEnd = now + 10 * DAY) => ({ provider: "razorpay", subscriptionId: "sub_AAAAAAAA", interval: "monthly", status, currentEnd, cancelAtCycleEnd: false, shortUrl: null, eventAt: 0, updatedAt: 0 });
assert.equal(hasProAccess(null, now), false);
assert.equal(hasProAccess(rec("created"), now), false);
assert.equal(hasProAccess(rec("active"), now), true);
assert.equal(hasProAccess(rec("authenticated", null), now), true);
assert.equal(hasProAccess(rec("pending", now - DAY), now), true, "failed renewal keeps a grace window");
assert.equal(hasProAccess(rec("pending", now - PENDING_GRACE_MS - 1), now), false);
assert.equal(hasProAccess(rec("cancelled", now + DAY), now), true, "paid period is honoured after cancel");
assert.equal(hasProAccess(rec("cancelled", now - 1), now), false);
assert.equal(hasProAccess(rec("halted", now - 1), now), false);
assert.equal(hasProAccess(rec("expired"), now), false);
assert.equal(planFromSubscription(rec("active"), now), PLANS.pro);
assert.equal(planFromSubscription(null, now), PLANS.free);

// Event application: ordering, idempotency, and old subscriptions cannot downgrade a new one.
const ev = (event, status, createdAt, currentEnd = now + 30 * DAY, subscriptionId = "sub_AAAAAAAA") => ({ event, status, createdAt, currentEnd, subscriptionId, interval: "monthly" });
let r = applySubscriptionEvent(null, ev("subscription.activated", "active", now), now);
assert.equal(r.status, "active");
assert.equal(applySubscriptionEvent(r, ev("subscription.pending", "pending", now - 1000), now), null, "older event ignored");
const again = applySubscriptionEvent(r, ev("subscription.activated", "active", now), now);
assert.deepEqual({ ...again, updatedAt: 0 }, { ...r, updatedAt: 0 }, "re-delivery is idempotent");
r = applySubscriptionEvent(r, ev("subscription.charged", "active", now + 1000, now + 60 * DAY), now);
assert.equal(r.currentEnd, now + 60 * DAY);
const resub = applySubscriptionEvent(rec("cancelled", now - DAY), ev("subscription.activated", "active", now, now + 30 * DAY, "sub_BBBBBBBB"), now);
assert.equal(resub.subscriptionId, "sub_BBBBBBBB");
assert.equal(applySubscriptionEvent(resub, ev("subscription.cancelled", "cancelled", now + 5, now - DAY, "sub_AAAAAAAA"), now), null, "late cancel of old subscription ignored");
assert.equal(applySubscriptionEvent(r, { ...ev("payment.captured", "active", now + 2), event: "payment.captured" }, now), null);
assert.equal(parseSubscriptionRecord("{bad"), null);
assert.equal(parseSubscriptionRecord({ subscriptionId: "sub_x", status: "weird" }), null);

// Signatures: hex HMAC-SHA256 over the raw body.
const payload = (event, status, extra = {}) => JSON.stringify({
  entity: "event", event, created_at: Math.floor(now / 1000),
  payload: { subscription: { entity: { id: "sub_AAAAAAAA", plan_id: "plan_year", status, current_end: Math.floor((now + 365 * DAY) / 1000), notes: { owner }, ...extra } } },
});
const sign = (body, secret = "whsec") => createHmac("sha256", secret).update(body).digest("hex");
const body = payload("subscription.activated", "active");
assert.equal(verifyWebhookSignature(body, sign(body), "whsec"), true);
assert.equal(verifyWebhookSignature(body + " ", sign(body), "whsec"), false, "any byte change breaks the signature");
assert.equal(verifyWebhookSignature(body, sign(body, "other"), "whsec"), false);
assert.equal(verifyWebhookSignature(body, null, "whsec"), false);
assert.equal(verifyWebhookSignature(body, "zz", "whsec"), false);
const parsed = parseSubscriptionWebhook(body, config);
assert.equal(parsed.owner, owner);
assert.equal(parsed.event.interval, "yearly");
assert.equal(parsed.event.currentEnd, Math.floor((now + 365 * DAY) / 1000) * 1000);
assert.equal(parseSubscriptionWebhook(payload("subscription.activated", "active", { notes: [] }), config).owner, null, "notes may be []");
assert.equal(parseSubscriptionWebhook(payload("subscription.activated", "active", { notes: { owner: "../x" } }), config).owner, null);
assert.equal(parseSubscriptionWebhook('{"event":"payment.captured","payload":{}}', config), null);

// Full webhook handling.
{
  const store = memoryBillingStore();
  assert.equal((await handleSubscriptionWebhook(store, config, body, "0".repeat(64), "evt_1111111", now)).status, 401);
  assert.equal(await store.get(owner), null, "unsigned events change nothing");
  const ok = await handleSubscriptionWebhook(store, config, body, sign(body), "evt_1111111", now);
  assert.deepEqual([ok.status, ok.body.applied], [200, true]);
  assert.equal((await store.get(owner)).status, "active");
  assert.equal(await store.ownerFor("sub_AAAAAAAA"), owner);
  assert.equal((await handleSubscriptionWebhook(store, config, body, sign(body), "evt_1111111", now)).body.duplicate, true);
  // A forged owner in notes cannot hijack an existing subscription mapping.
  const hijack = payload("subscription.charged", "active", { notes: { owner: "b".repeat(32) } });
  assert.equal((await handleSubscriptionWebhook(store, config, hijack, sign(hijack), "evt_2222222", now)).body.ignored, "owner mismatch");
  assert.equal(await store.get("b".repeat(32)), null);
  // Unknown subscription without our notes is acknowledged but ignored.
  const foreign = JSON.stringify({ event: "subscription.activated", created_at: 1, payload: { subscription: { entity: { id: "sub_ZZZZZZZZ", status: "active", notes: [] } } } });
  assert.equal((await handleSubscriptionWebhook(store, config, foreign, sign(foreign), "evt_3333333", now)).body.ignored, "unknown subscription");
  // Non-subscription events are acknowledged.
  const other = '{"event":"payment.captured","payload":{}}';
  assert.equal((await handleSubscriptionWebhook(store, config, other, sign(other), null, now)).status, 200);
}

// API calls: correct endpoints, Basic auth, body; failures throw.
{
  const calls = [];
  const fake = async (url, init) => { calls.push({ url, init }); return new Response(JSON.stringify({ id: "sub_NEW12345", short_url: "https://rzp.io/i/abc", status: "created" }), { status: 200 }); };
  const created = await createSubscription(config, "yearly", owner, fake);
  assert.deepEqual(created, { id: "sub_NEW12345", shortUrl: "https://rzp.io/i/abc", status: "created" });
  assert.equal(calls[0].url, "https://api.razorpay.com/v1/subscriptions");
  assert.equal(calls[0].init.headers.Authorization, `Basic ${Buffer.from("rzp_test_key:secret").toString("base64")}`);
  assert.deepEqual(JSON.parse(calls[0].init.body), { plan_id: "plan_year", total_count: 10, customer_notify: true, notes: { owner, product: "proupiqr-pro" } });
  await cancelAtCycleEnd(config, "sub_NEW12345", fake);
  assert.equal(calls[1].url, "https://api.razorpay.com/v1/subscriptions/sub_NEW12345/cancel");
  assert.deepEqual(JSON.parse(calls[1].init.body), { cancel_at_cycle_end: true });
  await assert.rejects(cancelAtCycleEnd(config, "../../payments", fake));
  const failing = async () => new Response('{"error":{"description":"bad"}}', { status: 400 });
  await assert.rejects(createSubscription(config, "monthly", owner, failing));
}

// Reconcile: a lost webhook can't leave a paying customer on Free.
{
  const T0 = now;
  const auth = `Basic ${Buffer.from("rzp_test_key:secret").toString("base64")}`;
  const checkout = { provider: "razorpay", subscriptionId: "sub_PAID1234", interval: "monthly", status: "created", currentEnd: null, cancelAtCycleEnd: false, shortUrl: "https://rzp.io/i/abc", eventAt: 0, updatedAt: T0 };
  const entity = (status, extra = {}) => ({ id: "sub_PAID1234", entity: "subscription", plan_id: "plan_month", status, current_end: Math.floor((T0 + 30 * DAY) / 1000), notes: { owner, product: "proupiqr-pro" }, ...extra });
  let calls = 0;
  let reply = entity("active");
  const razorpay = async (url, init) => {
    calls++;
    assert.equal(url, "https://api.razorpay.com/v1/subscriptions/sub_PAID1234");
    assert.equal(init.headers.Authorization, auth);
    return new Response(JSON.stringify(reply), { status: 200 });
  };
  const seeded = async (record) => { const store = memoryBillingStore(); await store.put(owner, record); return store; };

  const read = await fetchSubscription(config, "sub_PAID1234", T0 + 1500, razorpay);
  assert.deepEqual(read, { owner, event: { event: "subscription.fetched", createdAt: T0, subscriptionId: "sub_PAID1234", status: "active", currentEnd: Math.floor((T0 + 30 * DAY) / 1000) * 1000, interval: "monthly" } },
    "a read counts from the previous whole second, so same-second webhooks still apply");
  await assert.rejects(fetchSubscription(config, "../payments", T0, razorpay));
  await assert.rejects(fetchSubscription(config, "sub_PAID1234", T0, async () => new Response("{}", { status: 404 })));
  await assert.rejects(fetchSubscription(config, "sub_PAID1234", T0, async () => new Response(JSON.stringify({ ...entity("active"), id: "sub_OTHER123" }))), "must be the subscription we asked for");
  await assert.rejects(fetchSubscription(config, "sub_PAID1234", T0, async () => new Response(JSON.stringify(entity("weird")))));

  assert.equal(recheckInterval(null, T0), null);
  assert.equal(recheckInterval(checkout, T0 + DAY), RECHECK_SECONDS.checkout);
  assert.equal(recheckInterval(checkout, T0 + CHECKOUT_RECHECK_WINDOW_MS), null, "abandoned checkouts stop being re-read");
  assert.equal(recheckInterval({ ...checkout, status: "active" }, T0), null, "active subscriptions rely on webhooks");
  assert.equal(recheckInterval({ ...checkout, status: "cancelled" }, T0), null);
  assert.equal(recheckInterval({ ...checkout, status: "halted" }, T0), RECHECK_SECONDS.renewal);

  // Paid, webhook lost: the read activates Pro once, then active subscriptions aren't re-read.
  calls = 0;
  let store = await seeded(checkout);
  let result = await reconcileSubscription(store, config, owner, T0 + 60_000, razorpay);
  assert.deepEqual([result.activated, result.record.status, (await store.get(owner)).status, calls], [true, "active", "active", 1]);
  result = await reconcileSubscription(store, config, owner, T0 + 120_000, razorpay);
  assert.deepEqual([result.activated, calls], [false, 1]);
  const afterRead = await store.get(owner);
  assert.equal(applySubscriptionEvent(afterRead, ev("subscription.cancelled", "cancelled", T0 + 60_000, T0 + 30 * DAY, "sub_PAID1234"), T0 + 61_000)?.status, "cancelled", "webhook from the read's second applies");
  assert.equal(applySubscriptionEvent(afterRead, ev("subscription.authenticated", "authenticated", T0 + 55_000, null, "sub_PAID1234"), T0 + 61_000), null, "older webhook ignored");

  // Not paid yet: throttled reads, and no write while nothing changes (the abandon window keeps counting from checkout).
  reply = entity("created", { current_end: null });
  store = await seeded(checkout);
  calls = 0;
  await reconcileSubscription(store, config, owner, T0 + 1000, razorpay);
  await reconcileSubscription(store, config, owner, T0 + 2000, razorpay);
  assert.equal(calls, 1, "one Razorpay read per throttle window");
  await reconcileSubscription(store, config, owner, T0 + 1000 + RECHECK_SECONDS.checkout * 1000, razorpay);
  assert.equal(calls, 2);
  assert.deepEqual(await store.get(owner), checkout);

  // Razorpay unreachable: stored state, no throw.
  store = await seeded(checkout);
  result = await reconcileSubscription(store, config, owner, T0 + 1000, async () => { throw new Error("network"); });
  assert.deepEqual([result.record.status, result.activated], ["created", false]);

  // A subscription whose notes name another account is never applied.
  reply = entity("active", { notes: { owner: "b".repeat(32) } });
  store = await seeded(checkout);
  await reconcileSubscription(store, config, owner, T0 + 1000, razorpay);
  assert.equal((await store.get(owner)).status, "created");

  // A failed renewal the customer fixed comes back without waiting for a webhook.
  reply = entity("active");
  store = await seeded({ ...checkout, status: "halted", currentEnd: T0 - DAY, shortUrl: null });
  result = await reconcileSubscription(store, config, owner, T0 + 1000, razorpay);
  assert.deepEqual([result.record.status, result.activated], ["active", true]);
}

// Daily reconcile: catch lost cancel/halt/renewal webhooks without re-reading healthy subscriptions.
{
  const N = now;
  const HOUR = 3_600_000;
  const r = (subscriptionId, status, currentEnd, extra = {}) => ({ provider: "razorpay", subscriptionId, interval: "monthly", status, currentEnd, cancelAtCycleEnd: false, shortUrl: null, eventAt: N - 40 * DAY, updatedAt: N - 40 * DAY, ...extra });
  const owners = { a: "a".repeat(32), b: "b".repeat(32), c: "c".repeat(32), d: "d".repeat(32), e: "e".repeat(32), f: "f".repeat(32) };

  assert.equal(dueForDailyCheck(r("sub_X1111111", "active", N + 10 * DAY), N), false, "healthy active subscription is left alone");
  assert.equal(dueForDailyCheck(r("sub_X1111111", "active", N - PERIOD_END_GRACE_MS + HOUR), N), false, "renewal webhook gets 6 h");
  assert.equal(dueForDailyCheck(r("sub_X1111111", "active", N - PERIOD_END_GRACE_MS - HOUR), N), true, "period ended without a renewal");
  assert.equal(dueForDailyCheck(r("sub_X1111111", "authenticated", null, { updatedAt: N - 2 * DAY }), N), true, "authorized but never charged");
  for (const status of ["pending", "halted", "paused"]) assert.equal(dueForDailyCheck(r("sub_X1111111", status, N - DAY), N), true, status);
  for (const status of ["cancelled", "completed", "expired"]) assert.equal(dueForDailyCheck(r("sub_X1111111", status, N - DAY), N), false, status);
  assert.equal(dueForDailyCheck(r("sub_X1111111", "created", null, { updatedAt: N - 2 * DAY }), N), true);
  assert.equal(dueForDailyCheck(r("sub_X1111111", "created", null, { updatedAt: N - 8 * DAY }), N), false, "abandoned checkout");

  const store = memoryBillingStore();
  await store.put(owners.a, r("sub_AAAA1111", "active", N - 8 * HOUR, { cancelAtCycleEnd: true }));
  await store.put(owners.b, r("sub_BBBB1111", "active", N + 10 * DAY));
  await store.put(owners.c, r("sub_CCCC1111", "halted", N - 10 * DAY));
  await store.put(owners.d, r("sub_DDDD1111", "created", null, { updatedAt: N - 2 * DAY, shortUrl: "https://rzp.io/i/x" }));
  await store.put(owners.e, r("sub_EEEE1111", "cancelled", N - DAY));
  await store.put(owners.f, r("sub_FFFF1111", "pending", N - DAY));
  assert.deepEqual((await store.owners()).sort(), Object.values(owners).sort(), "every subscribed owner is indexed");

  const sec = (ms) => Math.floor(ms / 1000);
  const truth = {
    sub_AAAA1111: { status: "cancelled", current_end: sec(N - 8 * HOUR), notes: { owner: owners.a } },
    sub_CCCC1111: { status: "active", current_end: sec(N + 20 * DAY), notes: { owner: owners.c } },
    sub_DDDD1111: { status: "active", current_end: sec(N + 30 * DAY), notes: { owner: owners.d } },
  };
  const asked = [];
  const razorpay = async (url) => {
    const id = url.split("/").pop();
    asked.push(id);
    if (!truth[id]) return new Response('{"error":{"description":"down"}}', { status: 503 });
    return new Response(JSON.stringify({ id, entity: "subscription", plan_id: "plan_month", ...truth[id] }), { status: 200 });
  };
  const out = await reconcileDueSubscriptions(store, config, N, { fetchImpl: razorpay, deadline: Infinity });
  assert.deepEqual(asked.sort(), ["sub_AAAA1111", "sub_CCCC1111", "sub_DDDD1111", "sub_FFFF1111"], "only due subscriptions are read");
  assert.deepEqual(out, { owners: 6, checked: 4, updated: 3, activated: 2, failed: 1, remaining: 0 });
  assert.equal(hasProAccess(await store.get(owners.a), N), false, "a missed cancellation turns Pro off after the paid period");
  assert.equal((await store.get(owners.c)).status, "active", "a fixed renewal comes back");
  assert.equal((await store.get(owners.d)).status, "active", "a paid checkout whose webhook was lost is activated");
  assert.equal((await store.get(owners.f)).status, "pending", "Razorpay unreachable: record untouched");

  // Out of time before starting: nothing is read, everything is left for the next run.
  const late = await reconcileDueSubscriptions(store, config, N, { fetchImpl: razorpay, deadline: 0, clock: () => 1 });
  assert.deepEqual([late.checked, late.remaining], [0, 6]);
}

// Plan setup script: plans must charge exactly what /pricing/ shows.
{
  const prices = readPrices(readFileSync(new URL("../src/data/pricing.ts", import.meta.url), "utf8"));
  assert.deepEqual(prices, { monthly: PRO_PRICES.monthly.paise, yearly: PRO_PRICES.yearly.paise });
  const plan = (id, period, amount, notes = {}) => ({ id, entity: "plan", period, interval: 1, item: { amount, currency: "INR", name: id }, notes });
  const filler = Array.from({ length: 100 }, (_, i) => plan(`plan_fill${i}`, "weekly", 100));
  const pages = [filler, [plan("plan_other1", "monthly", 14900), plan("plan_ours01", "monthly", 14900, { product: "proupiqr-pro" }), plan("plan_yearX1", "yearly", 99900)]];
  const calls = [];
  const fake = async (url, init = {}) => {
    calls.push({ url, method: init.method ?? "GET", body: init.body ? JSON.parse(init.body) : null, auth: init.headers?.Authorization });
    if ((init.method ?? "GET") === "GET") return new Response(JSON.stringify({ items: pages[Number(new URL(url).searchParams.get("skip")) / 100] ?? [] }));
    const body = JSON.parse(init.body);
    return new Response(JSON.stringify({ id: "plan_newyear1", entity: "plan", ...body }));
  };
  const look = await findOrCreatePlans({ keyId: "rzp_test_k", keySecret: "s", prices, fetchImpl: fake });
  assert.deepEqual(look, { monthly: { id: "plan_ours01", created: false }, yearly: null }, "pages through, prefers our tagged plan, ignores wrong amounts");
  assert.equal(calls[0].auth, `Basic ${Buffer.from("rzp_test_k:s").toString("base64")}`);
  calls.length = 0;
  const made = await findOrCreatePlans({ keyId: "rzp_test_k", keySecret: "s", prices, create: true, fetchImpl: fake });
  assert.deepEqual(made.yearly, { id: "plan_newyear1", created: true });
  const post = calls.find((c) => c.method === "POST");
  assert.deepEqual([post.url, post.body.period, post.body.interval, post.body.item.amount, post.body.item.currency, post.body.notes.product], ["https://api.razorpay.com/v1/plans", "yearly", 1, 149900, "INR", "proupiqr-pro"]);
  await assert.rejects(findOrCreatePlans({ keyId: "x", keySecret: "y", prices, fetchImpl: async () => new Response("{}", { status: 401 }) }), /HTTP 401/);
}

console.log("[billing] access rules, event ordering, signatures, webhook handling, Razorpay requests, lost-webhook and daily reconcile, plan setup passed");
