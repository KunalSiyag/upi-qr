import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { applySubscriptionEvent, hasProAccess, inTrial, parseSubscriptionRecord, PENDING_GRACE_MS, trialEligible } from "../src/lib/billing/subscription.ts";
import { cancelAtCycleEnd, createSubscription, fetchSubscription, parseSubscriptionWebhook, razorpayConfig, verifyWebhookSignature } from "../src/lib/billing/razorpay.ts";
import { CHECKOUT_RECHECK_WINDOW_MS, dueForDailyCheck, PERIOD_END_GRACE_MS, RECHECK_SECONDS, recheckInterval, reconcileDueSubscriptions, reconcileSubscription } from "../src/lib/billing/reconcile.ts";
import { handleSubscriptionWebhook } from "../src/lib/billing/webhook.ts";
import { memoryBillingStore } from "../src/lib/billing/store.ts";
import { CheckoutNeedsEmail, dodoProvider, razorpayProvider } from "../src/lib/billing/provider.ts";
import { cancelDodoAtPeriodEnd, createDodoCheckout, dodoConfig, dodoPortalLink, fetchDodoSubscription, parseDodoSubscription, parseDodoWebhook, verifyStandardWebhook } from "../src/lib/billing/dodo.ts";
import { handleDodoWebhook } from "../src/lib/billing/webhook.ts";
import { planFromSubscription, PLANS } from "../src/lib/workspace/entitlements.ts";
import { PRO_PRICES, YEARLY_SAVING_RUPEES } from "../src/data/pricing.ts";
import { readFileSync } from "node:fs";
import { findOrCreatePlans, readPrices } from "./razorpay-plans.mjs";
import { findOrCreateProducts, matchesPrice } from "./dodo-products.mjs";

const DAY = 86_400_000;
const now = 1_790_000_000_000;
const owner = "a".repeat(32);
const env = { RAZORPAY_KEY_ID: "rzp_test_key", RAZORPAY_KEY_SECRET: "secret", RAZORPAY_WEBHOOK_SECRET: "whsec", RAZORPAY_PLAN_MONTHLY: "plan_month", RAZORPAY_PLAN_YEARLY: "plan_year" };
const config = razorpayConfig(env);
/** Providers with only Razorpay configured, calling a fake API. */
const rz = (fetchImpl) => ({ razorpay: razorpayProvider(config, fetchImpl), dodo: null });

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
  let result = await reconcileSubscription(store, rz(razorpay), owner, T0 + 60_000);
  assert.deepEqual([result.activated, result.record.status, (await store.get(owner)).status, calls], [true, "active", "active", 1]);
  result = await reconcileSubscription(store, rz(razorpay), owner, T0 + 120_000);
  assert.deepEqual([result.activated, calls], [false, 1]);
  const afterRead = await store.get(owner);
  assert.equal(applySubscriptionEvent(afterRead, ev("subscription.cancelled", "cancelled", T0 + 60_000, T0 + 30 * DAY, "sub_PAID1234"), T0 + 61_000)?.status, "cancelled", "webhook from the read's second applies");
  assert.equal(applySubscriptionEvent(afterRead, ev("subscription.authenticated", "authenticated", T0 + 55_000, null, "sub_PAID1234"), T0 + 61_000), null, "older webhook ignored");

  // Not paid yet: throttled reads, and no write while nothing changes (the abandon window keeps counting from checkout).
  reply = entity("created", { current_end: null });
  store = await seeded(checkout);
  calls = 0;
  await reconcileSubscription(store, rz(razorpay), owner, T0 + 1000);
  await reconcileSubscription(store, rz(razorpay), owner, T0 + 2000);
  assert.equal(calls, 1, "one Razorpay read per throttle window");
  await reconcileSubscription(store, rz(razorpay), owner, T0 + 1000 + RECHECK_SECONDS.checkout * 1000);
  assert.equal(calls, 2);
  assert.deepEqual(await store.get(owner), checkout);

  // Razorpay unreachable: stored state, no throw.
  store = await seeded(checkout);
  result = await reconcileSubscription(store, rz(async () => { throw new Error("network"); }), owner, T0 + 1000);
  assert.deepEqual([result.record.status, result.activated], ["created", false]);

  // A subscription whose notes name another account is never applied.
  reply = entity("active", { notes: { owner: "b".repeat(32) } });
  store = await seeded(checkout);
  await reconcileSubscription(store, rz(razorpay), owner, T0 + 1000);
  assert.equal((await store.get(owner)).status, "created");

  // A failed renewal the customer fixed comes back without waiting for a webhook.
  reply = entity("active");
  store = await seeded({ ...checkout, status: "halted", currentEnd: T0 - DAY, shortUrl: null });
  result = await reconcileSubscription(store, rz(razorpay), owner, T0 + 1000);
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
  const out = await reconcileDueSubscriptions(store, rz(razorpay), N, { deadline: Infinity });
  assert.deepEqual(asked.sort(), ["sub_AAAA1111", "sub_CCCC1111", "sub_DDDD1111", "sub_FFFF1111"], "only due subscriptions are read");
  assert.deepEqual(out, { owners: 6, checked: 4, updated: 3, activated: 2, failed: 1, remaining: 0 });
  assert.equal(hasProAccess(await store.get(owners.a), N), false, "a missed cancellation turns Pro off after the paid period");
  assert.equal((await store.get(owners.c)).status, "active", "a fixed renewal comes back");
  assert.equal((await store.get(owners.d)).status, "active", "a paid checkout whose webhook was lost is activated");
  assert.equal((await store.get(owners.f)).status, "pending", "Razorpay unreachable: record untouched");

  // Out of time before starting: nothing is read, everything is left for the next run.
  const late = await reconcileDueSubscriptions(store, rz(razorpay), N, { deadline: 0, clock: () => 1 });
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

// Dodo product setup script: products must charge exactly what /pricing/ shows, GST included.
{
  const prices = readPrices(readFileSync(new URL("../src/data/pricing.ts", import.meta.url), "utf8"));
  const price = (amount, interval, extra = {}) => ({ type: "recurring_price", price: amount, currency: "INR", tax_inclusive: true, payment_frequency_count: 1, payment_frequency_interval: interval, subscription_period_count: 10, subscription_period_interval: "Year", ...extra });
  const product = (id, detail, metadata = {}) => ({ product_id: id, is_recurring: true, price: detail.price, currency: detail.currency, tax_inclusive: detail.tax_inclusive, price_detail: detail, metadata });
  assert.ok(matchesPrice(product("pdt_a", price(14900, "Month")), "monthly", 14900));
  for (const wrong of [price(14900, "Year"), price(14900, "Month", { tax_inclusive: false }), price(14900, "Month", { currency: "USD" }), price(14900, "Month", { payment_frequency_count: 3 }), price(14900, "Month", { discount_bps: 1000 }), price(14900, "Month", { trial_period_days: 7 }), price(14900, "Month", { purchasing_power_parity: true }), { ...price(14900, "Month"), type: "one_time_price" }]) {
    assert.equal(matchesPrice(product("pdt_x", wrong), "monthly", 14900), false, JSON.stringify(wrong));
  }
  const filler = Array.from({ length: 100 }, (_, i) => product(`pdt_fill${i}`, price(100, "Week")));
  const pages = [filler, [product("pdt_other", price(14900, "Month")), product("pdt_ours", price(14900, "Month"), { product: "proupiqr-pro", interval: "monthly" }), product("pdt_disc", price(149900, "Year", { discount_bps: 500 }))]];
  const calls = [];
  const fake = async (url, init = {}) => {
    const u = new URL(url);
    calls.push({ url: u, method: init.method ?? "GET", body: init.body ? JSON.parse(init.body) : null, auth: init.headers?.Authorization });
    if ((init.method ?? "GET") === "GET") return new Response(JSON.stringify({ items: pages[Number(u.searchParams.get("page_number"))] ?? [] }));
    return new Response(JSON.stringify({ product_id: "pdt_newyear", ...JSON.parse(init.body) }));
  };
  const look = await findOrCreateProducts({ apiKey: "dodo_test_key", environment: "test_mode", prices, fetchImpl: fake });
  assert.deepEqual(look, { monthly: { id: "pdt_ours", created: false }, yearly: null }, "pages through, prefers our tagged product, ignores discounted prices");
  assert.deepEqual([calls[0].url.host, calls[0].url.pathname, calls[0].url.searchParams.get("recurring"), calls[0].auth], ["test.dodopayments.com", "/products", "true", "Bearer dodo_test_key"]);
  assert.ok(calls.every((c) => c.method === "GET"), "looking never creates");
  calls.length = 0;
  const made = await findOrCreateProducts({ apiKey: "dodo_live_key", environment: "live_mode", prices, create: true, fetchImpl: fake });
  assert.deepEqual(made, { monthly: { id: "pdt_ours", created: false }, yearly: { id: "pdt_newyear", created: true } });
  const post = calls.find((c) => c.method === "POST");
  assert.equal(post.url.href, "https://live.dodopayments.com/products");
  assert.deepEqual([post.body.tax_category, post.body.price.type, post.body.price.price, post.body.price.currency, post.body.price.tax_inclusive, post.body.price.payment_frequency_interval, post.body.price.payment_frequency_count, post.body.metadata], ["saas", "recurring_price", 149900, "INR", true, "Year", 1, { product: "proupiqr-pro", interval: "yearly" }]);
  assert.ok(matchesPrice({ price_detail: post.body.price }, "yearly", 149900), "what we create is what we look for");
  await assert.rejects(findOrCreateProducts({ apiKey: "x", environment: "test_mode", prices, fetchImpl: async () => new Response("{}", { status: 401 }) }), /HTTP 401/);
}

// ---------- Dodo Payments ----------
{
  // Standard Webhooks: the published spec vector, replay window, multiple signatures.
  const vector = { id: "msg_p5jXN8AQM9LWM0D4loKWxJek", timestamp: "1614265330", signature: "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=" };
  const vkey = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
  assert.equal(verifyStandardWebhook('{"test": 2432232314}', vector, vkey, 1614265330), true, "spec test vector");
  assert.equal(verifyStandardWebhook('{"test": 2432232315}', vector, vkey, 1614265330), false, "any byte change breaks it");
  assert.equal(verifyStandardWebhook('{"test": 2432232314}', vector, "whsec_" + Buffer.from("other key").toString("base64"), 1614265330), false);
  assert.equal(verifyStandardWebhook('{"test": 2432232314}', vector, vkey, 1614265330 + 301), false, "older than 5 minutes is a replay");
  assert.equal(verifyStandardWebhook('{"test": 2432232314}', { ...vector, signature: "v1,AAAA v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=" }, vkey, 1614265330), true, "any listed signature may match");
  assert.equal(verifyStandardWebhook('{"test": 2432232314}', { ...vector, signature: null }, vkey, 1614265330), false);

  // Config is all-or-nothing and test mode unless explicitly live.
  const denv = { DODO_PAYMENTS_API_KEY: "dodo_test_key", DODO_PAYMENTS_WEBHOOK_KEY: "whsec_" + Buffer.from("dodo-webhook-secret").toString("base64"), DODO_PRODUCT_MONTHLY: "pdt_MonthlyAAAAAAAAAAAAA", DODO_PRODUCT_YEARLY: "pdt_YearlyBBBBBBBBBBBBBB" };
  const dcfg = dodoConfig(denv);
  assert.equal(dcfg.environment, "test_mode");
  assert.equal(dodoConfig({ ...denv, DODO_PAYMENTS_ENVIRONMENT: "live_mode" }).environment, "live_mode");
  assert.equal(dodoConfig({ ...denv, DODO_PRODUCT_YEARLY: "" }), null);

  // Status mapping, period end, interval, owner from the customer's metadata.
  const sub = (status, extra = {}) => ({ subscription_id: "sub_Iuaq622bbmmfOGrVTqdXv", status, product_id: "pdt_MonthlyAAAAAAAAAAAAA", next_billing_date: "2026-11-11T00:00:00Z", payment_frequency_interval: "Month", cancel_at_next_billing_date: false, customer: { customer_id: "cus_TV52uJWWXt2yIoBBxpjaa", email: "a@b.in", name: "A", metadata: { owner } }, metadata: {}, ...extra });
  const mapped = (status) => parseDodoSubscription(sub(status), "subscription.updated", now, dcfg).event.status;
  assert.deepEqual(["pending", "active", "on_hold", "past_due", "paused", "cancelled", "failed", "expired"].map(mapped), ["created", "active", "pending", "pending", "paused", "cancelled", "expired", "expired"]);
  const ps = parseDodoSubscription(sub("active", { product_id: "pdt_YearlyBBBBBBBBBBBBBB", cancel_at_next_billing_date: true }), "subscription.active", now, dcfg);
  assert.deepEqual([ps.owner, ps.customerId, ps.event.interval, ps.event.currentEnd, ps.event.provider, ps.event.cancelAtPeriodEnd], [owner, "cus_TV52uJWWXt2yIoBBxpjaa", "yearly", Date.parse("2026-11-11T00:00:00Z"), "dodo", true]);
  assert.equal(parseDodoSubscription(sub("weird"), "x", now, dcfg), null);
  assert.equal(parseDodoSubscription({ ...sub("active"), subscription_id: "../x" }, "x", now, dcfg), null);
  assert.equal(parseDodoWebhook(JSON.stringify({ type: "payment.succeeded", data: {} }), dcfg), null, "only subscription events change Pro");

  // Webhook flow: an unconfirmed checkout record (cks_…) becomes the live subscription.
  const secretKey = denv.DODO_PAYMENTS_WEBHOOK_KEY;
  const signed = (body, id = `msg_${Math.random().toString(36).slice(2, 12)}`, ts = Math.floor(now / 1000)) => ({
    id, timestamp: String(ts),
    signature: "v1," + createHmac("sha256", Buffer.from(secretKey.slice(6), "base64")).update(`${id}.${ts}.${body}`).digest("base64"),
  });
  const delivery = (type, data, at = now) => JSON.stringify({ business_id: "bus_x", type, timestamp: new Date(at).toISOString(), data });
  const store = memoryBillingStore();
  await store.put(owner, { provider: "dodo", subscriptionId: "cks_n010SZaY4NXc7F1ck3Tq1", interval: "monthly", status: "created", currentEnd: null, cancelAtCycleEnd: false, shortUrl: "https://test.checkout.dodopayments.com/x", eventAt: 0, updatedAt: now });
  const active = delivery("subscription.active", sub("active"));
  assert.equal((await handleDodoWebhook(store, dcfg, active, { ...signed(active), signature: "v1,AAAA" }, now)).status, 401, "bad signature");
  const h = signed(active, "msg_ActivateAAAA");
  const ok = await handleDodoWebhook(store, dcfg, active, h, now);
  assert.deepEqual([ok.status, ok.body.transition], [200, "pro_activated"]);
  let rec = await store.get(owner);
  assert.deepEqual([rec.provider, rec.subscriptionId, rec.status, hasProAccess(rec, now)], ["dodo", "sub_Iuaq622bbmmfOGrVTqdXv", "active", true]);
  assert.equal(await store.ownerFor("sub_Iuaq622bbmmfOGrVTqdXv"), owner);
  assert.equal((await handleDodoWebhook(store, dcfg, active, h, now)).body.duplicate, true, "webhook-id de-duplicates retries");
  const forged = delivery("subscription.renewed", sub("active", { customer: { customer_id: "cus_OtherCCCCCCCCCCCCCCCC", email: "x@y.in", name: "X", metadata: { owner: "b".repeat(32) } } }), now + 1000);
  assert.equal((await handleDodoWebhook(store, dcfg, forged, signed(forged), now)).body.ignored, "owner mismatch");
  const onHold = delivery("subscription.on_hold", sub("on_hold"), now + 2000);
  await handleDodoWebhook(store, dcfg, onHold, signed(onHold), now);
  rec = await store.get(owner);
  assert.equal(rec.status, "pending");
  assert.equal(hasProAccess(rec, Date.parse("2026-11-11T00:00:00Z") + 6 * DAY), true, "failed renewal keeps the grace window");
  const cancelled = delivery("subscription.cancelled", sub("cancelled"), now + 3000);
  assert.equal((await handleDodoWebhook(store, dcfg, cancelled, signed(cancelled), now)).body.transition, "pro_cancelled");
  rec = await store.get(owner);
  assert.equal(hasProAccess(rec, Date.parse("2026-11-10T00:00:00Z")), true, "Pro until the paid period ends");
  // No owner tag on the customer: fall back to the customer we created for the account.
  const store2 = memoryBillingStore();
  await store2.linkCustomer("c".repeat(32), "cus_TV52uJWWXt2yIoBBxpjaa");
  const untagged = delivery("subscription.active", sub("active", { customer: { customer_id: "cus_TV52uJWWXt2yIoBBxpjaa", email: "a@b.in", name: "A", metadata: {} } }));
  await handleDodoWebhook(store2, dcfg, untagged, signed(untagged), now);
  assert.equal((await store2.get("c".repeat(32)))?.status, "active");

  // API calls: customer once per account, checkout body, chain lookup, cancel, portal.
  const calls = [];
  const api = async (url, init = {}) => {
    const u = new URL(url);
    calls.push({ method: init.method ?? "GET", path: u.pathname + u.search, body: init.body ? JSON.parse(init.body) : null, auth: init.headers?.Authorization, host: u.host });
    const r = (j) => new Response(JSON.stringify(j));
    if (u.pathname === "/customers") return r({ customer_id: "cus_NewCustomerAAAAAAAAA" });
    if (u.pathname === "/checkouts") return r({ session_id: "cks_SessionAAAAAAAAAAAAA", checkout_url: "https://test.checkout.dodopayments.com/buy/cks_SessionAAAAAAAAAAAAA" });
    if (u.pathname === "/checkouts/cks_SessionAAAAAAAAAAAAA") return r({ id: "cks_SessionAAAAAAAAAAAAA", payment_id: "pay_gr4RizvMOXFJ6xca3y2tU", payment_status: "succeeded" });
    if (u.pathname === "/payments/pay_gr4RizvMOXFJ6xca3y2tU") return r({ payment_id: "pay_gr4RizvMOXFJ6xca3y2tU", subscription_id: "sub_Iuaq622bbmmfOGrVTqdXv", customer: {} });
    if (u.pathname === "/subscriptions/sub_Iuaq622bbmmfOGrVTqdXv" && (init.method ?? "GET") === "GET") return r(sub("active"));
    if (u.pathname === "/subscriptions/sub_Iuaq622bbmmfOGrVTqdXv") return r(sub("active", { cancel_at_next_billing_date: true }));
    if (u.pathname.endsWith("/customer-portal/session")) return r({ link: "https://customer.dodopayments.com/portal/xyz" });
    return new Response("{}", { status: 404 });
  };
  const dodo = dodoProvider(dcfg, api);
  const s3 = memoryBillingStore();
  await assert.rejects(dodo.startCheckout({ interval: "monthly", owner, email: null, name: null, origin: "https://www.proupiqr.in" }, s3), CheckoutNeedsEmail);
  const started = await dodo.startCheckout({ interval: "yearly", owner, email: "riya@example.com", name: "Riya", origin: "https://preview.example.app" }, s3);
  assert.deepEqual(started, { subscriptionId: "cks_SessionAAAAAAAAAAAAA", url: "https://test.checkout.dodopayments.com/buy/cks_SessionAAAAAAAAAAAAA" });
  const [cust, checkout] = calls;
  assert.deepEqual([cust.method, cust.path, cust.host, cust.auth, cust.body.metadata.owner], ["POST", "/customers", "test.dodopayments.com", "Bearer dodo_test_key", owner]);
  assert.deepEqual(checkout.body.product_cart, [{ product_id: "pdt_YearlyBBBBBBBBBBBBBB", quantity: 1 }]);
  assert.deepEqual([checkout.body.customer, checkout.body.billing_currency, checkout.body.billing_address, checkout.body.metadata.owner], [{ customer_id: "cus_NewCustomerAAAAAAAAA" }, "INR", { country: "IN" }, owner]);
  assert.deepEqual(checkout.body.feature_flags, { allow_currency_selection: false, allow_discount_code: false, allow_tax_id: true, redirect_immediately: true }, "INR only, no coupon box, GSTIN allowed");
  assert.equal(checkout.body.return_url, "https://preview.example.app/app/?tab=settings&checkout=done", "a preview returns to itself");
  calls.length = 0;
  await dodo.startCheckout({ interval: "monthly", owner, email: "riya@example.com", name: "Riya", origin: "https://www.proupiqr.in" }, s3);
  assert.deepEqual(calls.map((c) => c.path), ["/checkouts"], "the customer is created once per account");
  calls.length = 0;
  const viaChain = await fetchDodoSubscription(dcfg, "cks_SessionAAAAAAAAAAAAA", now, api);
  assert.deepEqual(calls.map((c) => c.path), ["/checkouts/cks_SessionAAAAAAAAAAAAA", "/payments/pay_gr4RizvMOXFJ6xca3y2tU", "/subscriptions/sub_Iuaq622bbmmfOGrVTqdXv"]);
  assert.deepEqual([viaChain.event.subscriptionId, viaChain.event.status, viaChain.owner], ["sub_Iuaq622bbmmfOGrVTqdXv", "active", owner]);
  calls.length = 0;
  await cancelDodoAtPeriodEnd(dcfg, "sub_Iuaq622bbmmfOGrVTqdXv", api);
  assert.deepEqual([calls[0].method, calls[0].body], ["PATCH", { cancel_at_next_billing_date: true }]);
  await assert.rejects(cancelDodoAtPeriodEnd(dcfg, "../../payments", api));
  calls.length = 0;
  assert.equal(await dodoPortalLink(dcfg, "cus_NewCustomerAAAAAAAAA", "https://www.proupiqr.in/app/?tab=settings", api), "https://customer.dodopayments.com/portal/xyz");
  assert.equal(calls[0].path, "/customers/cus_NewCustomerAAAAAAAAA/customer-portal/session?return_url=" + encodeURIComponent("https://www.proupiqr.in/app/?tab=settings"));
  assert.equal((await fetchDodoSubscription(dodoConfig({ ...denv, DODO_PAYMENTS_ENVIRONMENT: "live_mode" }), "sub_Iuaq622bbmmfOGrVTqdXv", now, async (url) => { assert.equal(new URL(url).host, "live.dodopayments.com"); return new Response(JSON.stringify(sub("active"))); })).event.status, "active");

  // Lost webhook: the on-demand re-check resolves the checkout chain and activates Pro.
  const s4 = memoryBillingStore();
  await s4.put(owner, { provider: "dodo", subscriptionId: "cks_SessionAAAAAAAAAAAAA", interval: "monthly", status: "created", currentEnd: null, cancelAtCycleEnd: false, shortUrl: "https://test.checkout.dodopayments.com/x", eventAt: 0, updatedAt: now });
  const rec4 = await reconcileSubscription(s4, { dodo: dodoProvider(dcfg, api), razorpay: null }, owner, now + 60_000);
  assert.deepEqual([rec4.activated, rec4.record.subscriptionId, rec4.record.provider], [true, "sub_Iuaq622bbmmfOGrVTqdXv", "dodo"]);
  assert.equal(await s4.ownerFor("sub_Iuaq622bbmmfOGrVTqdXv"), owner, "later webhooks find the account");
  // A Razorpay subscription is still re-read through Razorpay even when Dodo takes new checkouts.
  const s5 = memoryBillingStore();
  await s5.put(owner, { provider: "razorpay", subscriptionId: "sub_PAID1234", interval: "monthly", status: "created", currentEnd: null, cancelAtCycleEnd: false, shortUrl: null, eventAt: 0, updatedAt: now });
  let rzCalls = 0;
  await reconcileSubscription(s5, { dodo: dodoProvider(dcfg, async () => { throw new Error("Dodo must not be asked"); }), razorpay: razorpayProvider(config, async () => { rzCalls++; return new Response(JSON.stringify({ id: "sub_PAID1234", status: "created", plan_id: "plan_month", notes: { owner } })); }) }, owner, now + 60_000);
  assert.equal(rzCalls, 1);
}

// ---------- Free trial (Dodo takes the payment method now and charges when the trial ends) ----------
{
  const DAY_MS = 86_400_000;
  const dcfg = dodoConfig({ DODO_PAYMENTS_API_KEY: "dodo_test_key", DODO_PAYMENTS_WEBHOOK_KEY: "whsec_" + Buffer.from("dodo-webhook-secret").toString("base64"), DODO_PRODUCT_MONTHLY: "pdt_MonthlyAAAAAAAAAAAAA", DODO_PRODUCT_YEARLY: "pdt_YearlyBBBBBBBBBBBBBB" });
  // One trial per account.
  const created = { provider: "dodo", subscriptionId: "cks_TrialSessionAAAAAAAA", interval: "monthly", status: "created", currentEnd: null, cancelAtCycleEnd: false, shortUrl: null, eventAt: 0, updatedAt: now };
  assert.equal(trialEligible(null), true, "new account");
  assert.equal(trialEligible(created), true, "abandoned first checkout");
  assert.equal(trialEligible({ ...created, hadSubscription: true }), false, "a past subscriber starting a new checkout");
  const activeEvt = { event: "subscription.active", createdAt: now, subscriptionId: "sub_TrialSubAAAAAAAAAAAAA", status: "active", currentEnd: now + 14 * DAY_MS, interval: "monthly", provider: "dodo", trialEndsAt: now + 14 * DAY_MS };
  const activeRec = applySubscriptionEvent(created, activeEvt, now);
  assert.deepEqual([activeRec.hadSubscription, activeRec.trialEndsAt, trialEligible(activeRec)], [true, now + 14 * DAY_MS, false]);
  assert.equal(inTrial(activeRec, now + DAY_MS), true);
  assert.equal(inTrial(activeRec, now + 15 * DAY_MS), false, "trial over");
  const cancelled = applySubscriptionEvent(activeRec, { ...activeEvt, event: "subscription.cancelled", status: "cancelled", createdAt: now + 1000, trialEndsAt: undefined }, now + 1000);
  assert.deepEqual([cancelled.hadSubscription, cancelled.trialEndsAt, trialEligible(cancelled), hasProAccess(cancelled, now + 13 * DAY_MS), hasProAccess(cancelled, now + 15 * DAY_MS)], [true, now + 14 * DAY_MS, false, true, false], "cancelled during the trial: Pro until it ends, then Free, and no second trial");
  assert.equal(parseSubscriptionRecord(JSON.stringify(activeRec)).trialEndsAt, now + 14 * DAY_MS, "stored and read back");
  assert.equal("trialEndsAt" in applySubscriptionEvent(null, { ...activeEvt, trialEndsAt: null }, now), false, "no trial field when there is none");

  // A Dodo subscription with a trial ends it at created_at + trial days.
  const trialSub = { subscription_id: "sub_TrialSubAAAAAAAAAAAAA", status: "active", product_id: "pdt_MonthlyAAAAAAAAAAAAA", next_billing_date: new Date(now + 14 * DAY_MS).toISOString(), created_at: new Date(now).toISOString(), trial_period_days: 14, payment_frequency_interval: "Month", cancel_at_next_billing_date: false, customer: { customer_id: "cus_TrialCustomerAAAAAA", email: "t@x.in", name: "T" }, metadata: { owner } };
  assert.equal(parseDodoSubscription(trialSub, "subscription.active", now, dcfg).event.trialEndsAt, now + 14 * DAY_MS);
  assert.equal(parseDodoSubscription({ ...trialSub, trial_period_days: 0 }, "subscription.active", now, dcfg).event.trialEndsAt, null);

  // Checkout asks Dodo for a trial only when there is one.
  const bodies = [];
  const checkoutApi = async (url, init = {}) => { bodies.push(JSON.parse(init.body)); return new Response(JSON.stringify({ session_id: "cks_TrialSessionAAAAAAAA", checkout_url: "https://test.checkout.dodopayments.com/buy/cks_TrialSessionAAAAAAAA" })); };
  const input = { interval: "monthly", owner, customerId: "cus_TrialCustomerAAAAAA", returnUrl: "https://www.proupiqr.in/app/", cancelUrl: "https://www.proupiqr.in/app/" };
  await createDodoCheckout(dcfg, { ...input, trialDays: 14 }, checkoutApi);
  await createDodoCheckout(dcfg, { ...input, trialDays: 0 }, checkoutApi);
  await createDodoCheckout(dcfg, input, checkoutApi);
  assert.deepEqual(bodies.map((b) => b.subscription_data ?? null), [{ trial_period_days: 14 }, null, null]);

  // Lost webhook during a free trial: the session has no payment, so the re-check finds
  // the customer's newest Pro subscription created since the checkout started.
  const calls = [];
  const listApi = async (url) => {
    const u = new URL(url);
    calls.push(u.pathname + u.search);
    if (u.pathname === "/checkouts/cks_TrialSessionAAAAAAAA") return new Response(JSON.stringify({ id: "cks_TrialSessionAAAAAAAA", payment_id: null, payment_status: null }));
    if (u.pathname === "/subscriptions") return new Response(JSON.stringify({ items: [
      { ...trialSub, subscription_id: "sub_OtherProductAAAAAAAAA", product_id: "pdt_SomethingElseAAAAAA", created_at: new Date(now + 5000).toISOString() },
      { ...trialSub, subscription_id: "sub_OlderAAAAAAAAAAAAAAA", created_at: new Date(now - 2000).toISOString() },
      trialSub,
    ] }));
    return new Response("{}", { status: 404 });
  };
  await assert.rejects(fetchDodoSubscription(dcfg, "cks_TrialSessionAAAAAAAA", now, listApi), /not completed/, "nothing to look up without the customer");
  const trialStore = memoryBillingStore();
  await trialStore.put(owner, created);
  await trialStore.linkCustomer(owner, "cus_TrialCustomerAAAAAA");
  calls.length = 0;
  const rec = await reconcileSubscription(trialStore, { dodo: dodoProvider(dcfg, listApi), razorpay: null }, owner, now + 60_000);
  assert.deepEqual([rec.activated, rec.record.subscriptionId, rec.record.trialEndsAt, rec.record.hadSubscription], [true, "sub_TrialSubAAAAAAAAAAAAA", now + 14 * DAY_MS, true], "newest of our products, not another product's");
  const listCall = calls.find((c) => c.startsWith("/subscriptions?")) ?? "";
  assert.ok(listCall.includes("customer_id=cus_TrialCustomerAAAAAA") && listCall.includes("created_at_gte="), listCall);
  assert.equal(await trialStore.ownerFor("sub_TrialSubAAAAAAAAAAAAA"), owner, "the trial subscription's webhooks find the account");
}

console.log("[billing] access rules, ordering, signatures (Razorpay + Standard Webhooks), webhooks, Razorpay + Dodo requests, lost-webhook and daily reconcile, plan + product setup, and free trials passed");
