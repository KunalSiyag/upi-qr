import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { applySubscriptionEvent, hasProAccess, parseSubscriptionRecord, PENDING_GRACE_MS } from "../src/lib/billing/subscription.ts";
import { cancelAtCycleEnd, createSubscription, parseSubscriptionWebhook, razorpayConfig, verifyWebhookSignature } from "../src/lib/billing/razorpay.ts";
import { handleSubscriptionWebhook } from "../src/lib/billing/webhook.ts";
import { memoryBillingStore } from "../src/lib/billing/store.ts";
import { planFromSubscription, PLANS } from "../src/lib/workspace/entitlements.ts";
import { PRO_PRICES, YEARLY_SAVING_RUPEES } from "../src/data/pricing.ts";

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

console.log("[billing] access rules, event ordering, signatures, webhook handling, and Razorpay request checks passed");
