// Self-serve sponsorships (src/lib/sponsors/): input checks, availability, scheduling, Dodo webhooks, refunds.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  addDays, applySponsorEvent, BOOKING_ID, bookingPrice, decide, featuredNextStart, isShowing, istDay, needsReview, newBooking,
  parseSponsorWebhook, publicSponsors, sniffLogo, sponsorHref, tilesPaid, validateBookingInput,
} from "../src/lib/sponsors/core.ts";
import { memorySponsorStore } from "../src/lib/sponsors/store.ts";
import { refundSponsorPayment, sponsorDodoConfig } from "../src/lib/sponsors/dodo.ts";
import { bookingStatus, decideBooking, handleSponsorWebhook, isSponsorDelivery, startBooking } from "../src/lib/sponsors/service.ts";
import { dodoConfig } from "../src/lib/billing/dodo.ts";
import { SPONSOR_REACH, SPONSOR_TIERS } from "../src/data/sponsors.ts";
import { findOrCreateSponsorProducts, matchesSponsorPrice } from "./dodo-sponsor-products.mjs";

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 1)]);
const products = { featured: "pdt_SponsorFeatured0001", tile: "pdt_SponsorTile00000001" };
const NOW = Date.parse("2026-11-01T06:00:00Z"); // 1 Nov, 11:30 IST
const raw = (over = {}) => ({ tier: "featured", months: 2, name: "Acme Soundbox", tagline: "Payment alerts for every counter.", href: "https://acme.example.com/soundbox?ref=x", email: "Ads@Acme.example.com", logo: PNG.toString("base64"), agree: true, ...over });

/* ---------- Input ---------- */
{
  const ok = validateBookingInput(raw());
  assert.ok(ok.ok);
  assert.equal(ok.value.email, "ads@acme.example.com");
  assert.equal(ok.value.logo.type, "image/png");
  assert.equal(validateBookingInput(raw({ logo: `data:image/png;base64,${PNG.toString("base64")}` })).ok, true, "data URL prefix accepted");
  const bad = (over, field) => { const r = validateBookingInput(raw(over)); assert.equal(r.ok, false, JSON.stringify(over)); assert.equal(r.field, field); };
  bad({ tier: "banner" }, "tier");
  bad({ months: 4 }, "months");
  bad({ months: 0 }, "months");
  bad({ months: "1.5" }, "months");
  bad({ name: "A" }, "name");
  bad({ name: "x".repeat(41) }, "name");
  bad({ name: "Acme‮evil" }, "name");
  bad({ tagline: "short" }, "tagline");
  bad({ tagline: "x".repeat(91) }, "tagline");
  bad({ href: "http://acme.example.com/" }, "href");
  bad({ href: "https://127.0.0.1/" }, "href");
  bad({ href: "javascript:alert(1)" }, "href");
  bad({ email: "nope" }, "email");
  bad({ logo: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>").toString("base64") }, "logo");
  bad({ logo: Buffer.concat([PNG, Buffer.alloc(70_000)]).toString("base64") }, "logo");
  bad({ agree: false }, "agree");
  const tile = validateBookingInput(raw({ tier: "tile", months: 3, tagline: "" }));
  assert.ok(tile.ok && tile.value.months === 1 && tile.value.tagline === "", "tiles: one month, no line");
  assert.equal(sniffLogo(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(sniffLogo(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBPVP8 ")])), "image/webp");
  assert.equal(bookingPrice("featured", 3), 900_000);
  assert.equal(bookingPrice("tile", 1), 99_900);
  assert.equal(SPONSOR_TIERS.featured.paise, 300_000, "featured card ₹3,000 (owner decision 2026-10-29)");
}

/* ---------- Dates, availability and scheduling ---------- */
const input = (over = {}) => { const r = validateBookingInput(raw(over)); assert.ok(r.ok); return r.value; };
const booking = (over = {}, id = `spb_${Math.random().toString(16).slice(2).padEnd(32, "0").slice(0, 32)}`) => ({ ...newBooking(input(over), id, NOW - 60_000) });
{
  assert.equal(istDay(Date.parse("2026-10-31T18:29:00Z")), "2026-10-31");
  assert.equal(istDay(Date.parse("2026-10-31T18:30:00Z")), "2026-11-01");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");

  const a = { ...booking(), status: "approved", approvedAt: NOW - 1, start: "2026-10-20", end: "2026-11-18" };
  assert.equal(featuredNextStart([a], NOW), "2026-11-19");
  const waiting = { ...booking({ months: 1 }), status: "review" };
  assert.equal(featuredNextStart([a, waiting], NOW), "2026-12-19", "paid bookings in review hold their 30 days");
  assert.ok(isShowing(a, NOW));
  assert.ok(!isShowing(a, Date.parse("2026-11-18T18:30:00Z")), "ends after its last IST day");

  const t = (status, over = {}) => ({ ...booking({ tier: "tile", tagline: "" }), status, paidUntil: NOW + 86_400_000, renews: true, approvedAt: NOW - 5, ...over });
  const tiles = [t("approved"), t("review"), t("checkout", { createdAt: NOW - 60_000 }), t("rejected"), t("approved", { paidUntil: NOW - 3 * 86_400_000 })];
  assert.equal(tilesPaid(tiles, NOW), 2, "running + review count; unpaid checkouts hold nothing (they could block every tile); rejected and ended don't");
  assert.ok(isShowing(t("approved", { paidUntil: NOW - 86_400_000 }), NOW), "a renewing tile gets two days' grace for a late webhook");
  assert.ok(!isShowing(t("approved", { paidUntil: NOW - 1, renews: false }), NOW), "a cancelled tile ends with its paid month");

  const view = publicSponsors([a, ...tiles], NOW);
  assert.equal(view.featured.name, "Acme Soundbox");
  assert.equal(view.featured.href, "https://acme.example.com/soundbox?ref=x&utm_source=proupiqr&utm_medium=sponsor&utm_campaign=home-featured");
  assert.match(view.featured.logo, /^\/api\/v1\/sponsors\/logo\/spb_[a-f0-9]{32}\/$/);
  assert.equal(view.tiles.length, 1);
  assert.equal(view.tilesFree, 6);
  assert.ok(!JSON.stringify(view).includes("@"), "no email in the public view");
  assert.throws(() => sponsorHref("http://acme.example.com/", "home-tile"));
}

/* ---------- Review rules ---------- */
{
  const first = { ...booking(), status: "approved", approvedAt: NOW - 1000 };
  const again = booking();
  assert.equal(needsReview(again, [first, again]), false, "same sponsor, same copy: no review");
  assert.equal(needsReview({ ...again, tagline: "Now with cashback on every payment!" }, [first]), true, "changed line → review");
  assert.equal(needsReview({ ...again, email: "other@example.com" }, [first]), true, "different email → review");
  assert.equal(needsReview({ ...again, href: "https://evil.example.org/" }, [first]), true, "different link host → review");
  assert.equal(needsReview({ ...again, href: "https://acme.example.com/soundbox?ref=scam" }, [first]), true, "same host, different link → review (a copied identity can't change where it points)");
  assert.equal(needsReview({ ...again, tier: "tile", tagline: "" }, [first]), true, "a different placement → review");
  assert.equal(needsReview(again, [{ ...first, status: "removed" }]), true, "a taken-down sponsor is reviewed again");
}

/* ---------- Dodo webhooks ---------- */
const payment = (b, over = {}) => JSON.stringify({
  type: "payment.succeeded", timestamp: new Date(NOW).toISOString(),
  data: { payment_id: "pay_TestPayment000001", status: "succeeded", checkout_session_id: b.sessionId, subscription_id: null, total_amount: bookingPrice(b.tier, b.months), currency: "INR", product_cart: [{ product_id: products[b.tier], quantity: b.tier === "featured" ? b.months : 1 }], metadata: { product: "proupiqr-sponsor", booking: b.id }, ...over },
});
{
  assert.equal(parseSponsorWebhook(JSON.stringify({ type: "subscription.active", data: { subscription_id: "sub_Pro0000000001", product_id: "pdt_ProMonthly", metadata: { owner: "a".repeat(32) } } }), products), null, "Pro events are not ours");
  assert.equal(parseSponsorWebhook("not json", products), null);
  const b = { ...booking(), sessionId: "cks_Session0000000001" };
  const ev = parseSponsorWebhook(payment(b), products);
  assert.equal(ev.type, "payment");
  assert.equal(ev.bookingId, b.id);

  let r = applySponsorEvent(b, ev, [b], products, NOW);
  assert.equal(r.booking.status, "review", "a first booking waits for review");
  assert.ok(r.paid);
  assert.equal(r.booking.paymentId, "pay_TestPayment000001");

  r = applySponsorEvent(b, parseSponsorWebhook(payment(b, { total_amount: 100 }), products), [b], products, NOW);
  assert.equal(r.booking.status, "review");
  assert.match(r.booking.note, /expected INR 6000/, "a wrong amount never goes live on its own");
  r = applySponsorEvent(b, parseSponsorWebhook(payment(b, { product_cart: [{ product_id: products.featured, quantity: 1 }] }), products), [b], products, NOW);
  assert.match(r.booking.note, /1 months, booked 2/);

  const prior = { ...booking(), status: "approved", approvedAt: NOW - 10, start: "2026-10-01", end: "2026-10-30" };
  r = applySponsorEvent(b, ev, [prior, b], products, NOW);
  assert.equal(r.booking.status, "approved", "returning sponsor with the same copy is approved automatically");
  assert.equal(r.booking.start, "2026-11-01");
  assert.equal(r.booking.end, "2026-12-30", "two periods of 30 days");

  const again = applySponsorEvent(r.booking, ev, [prior, r.booking], products, NOW + 1);
  assert.equal(again.booking.status, "approved");
  assert.equal(again.paid, false, "a re-delivered payment changes nothing");

  // Tiles: sold out when the payment lands → refund and cancel.
  const tile = { ...booking({ tier: "tile", tagline: "" }), sessionId: "cks_Session0000000002" };
  const full = Array.from({ length: 8 }, () => ({ ...booking({ tier: "tile", tagline: "" }), status: "approved", paidUntil: NOW + 86_400_000, approvedAt: NOW }));
  const sub = JSON.stringify({ type: "payment.succeeded", data: { ...JSON.parse(payment(tile)).data, subscription_id: "sub_TileSub0000000001" } });
  r = applySponsorEvent(tile, parseSponsorWebhook(sub, products), [...full, tile], products, NOW);
  assert.equal(r.booking.status, "soldout");
  assert.deepEqual([r.booking.refundsOwed, r.booking.cancelOwed], [["pay_TestPayment000001"], "sub_TileSub0000000001"]);
  const holds = Array.from({ length: 8 }, () => ({ ...booking({ tier: "tile", tagline: "" }), status: "checkout" }));
  assert.equal(applySponsorEvent(tile, parseSponsorWebhook(sub, products), [...holds, tile], products, NOW).booking.status, "review", "other people's unpaid checkouts never refund a real payment");

  // Subscription first (no payment id yet), then the payment: the refund still goes out.
  const active = (status, next, cancel = false, at = NOW) => JSON.stringify({ type: `subscription.${status}`, timestamp: new Date(at).toISOString(), data: { subscription_id: "sub_TileSub0000000001", product_id: products.tile, status, next_billing_date: new Date(next).toISOString(), cancel_at_next_billing_date: cancel, metadata: { product: "proupiqr-sponsor", booking: tile.id } } });
  r = applySponsorEvent(tile, parseSponsorWebhook(active("active", NOW + 30 * 86_400_000), products), [...full, tile], products, NOW);
  assert.equal(r.booking.status, "soldout");
  assert.deepEqual([r.booking.refundsOwed, r.booking.cancelOwed], [[], "sub_TileSub0000000001"]);
  const later = applySponsorEvent(r.booking, parseSponsorWebhook(payment(tile), products), [...full, r.booking], products, NOW);
  assert.deepEqual(later.booking.refundsOwed, ["pay_TestPayment000001"]);
  assert.deepEqual(applySponsorEvent(later.booking, parseSponsorWebhook(payment(tile), products), [], products, NOW).booking.refundsOwed, ["pay_TestPayment000001"], "owed once, however often it's delivered");

  // A subscription's first payment may have no product list: checked by amount, the subscription checks the product.
  const cartless = JSON.stringify({ type: "payment.succeeded", data: { payment_id: "pay_Cartless00000001", status: "succeeded", checkout_session_id: tile.sessionId, subscription_id: "sub_TileSub0000000001", total_amount: 99_900, currency: "INR" } });
  const ce = parseSponsorWebhook(cartless, products);
  assert.ok(ce && ce.sponsor === false, "payments come to the sponsor handler even without our metadata");
  r = applySponsorEvent(tile, ce, [tile], products, NOW);
  assert.ok(r.booking.status === "review" && r.booking.note === "", r.booking.note);
  const featuredNoCart = applySponsorEvent(b, parseSponsorWebhook(payment(b, { product_cart: null }), products), [b], products, NOW);
  assert.match(featuredNoCart.booking.note, /unexpected product/, "featured payments must name their product");

  // Renewal, cancel and failure on a running tile.
  let running = { ...tile, status: "approved", approvedAt: NOW, paidUntil: NOW + 86_400_000, subscriptionId: "sub_TileSub0000000001" };
  running = applySponsorEvent(running, parseSponsorWebhook(active("active", NOW + 31 * 86_400_000, false, NOW + 1000), products), [running], products, NOW).booking;
  assert.equal(running.paidUntil, NOW + 31 * 86_400_000);
  const stale = applySponsorEvent(running, parseSponsorWebhook(active("active", NOW + 2 * 86_400_000, false, NOW - 5000), products), [running], products, NOW).booking;
  assert.equal(stale.paidUntil, NOW + 31 * 86_400_000, "older events are ignored");
  const cancelled = applySponsorEvent(running, parseSponsorWebhook(active("cancelled", NOW + 31 * 86_400_000, false, NOW + 2000), products), [running], products, NOW).booking;
  assert.ok(isShowing(cancelled, NOW) && cancelled.renews === false, "cancelled: stays up for the paid month");
  const failed = applySponsorEvent(running, parseSponsorWebhook(active("on_hold", NOW + 31 * 86_400_000, false, NOW + 2000), products), [running], products, NOW + 10).booking;
  assert.ok(!isShowing(failed, NOW + 10), "payment failed: down now");

  const refundEvent = (type, data = {}) => parseSponsorWebhook(JSON.stringify({ type, data: { payment_id: "pay_TestPayment000001", status: "succeeded", ...data } }), products);
  const refunded = applySponsorEvent(running, refundEvent("refund.succeeded"), [running], products, NOW).booking;
  assert.equal(refunded.status, "refunded");
  assert.equal(refunded.cancelOwed, "sub_TileSub0000000001", "a refunded tile stops renewing (else it's charged while hidden)");
  assert.equal(applySponsorEvent(running, refundEvent("refund.succeeded", { is_partial: true }), [running], products, NOW).booking.status, "approved", "a partial refund keeps it running");
  assert.equal(applySponsorEvent(running, refundEvent("dispute.won"), [running], products, NOW).booking.status, "approved", "a won dispute changes nothing");
  assert.equal(applySponsorEvent(running, refundEvent("dispute.opened"), [running], products, NOW).booking.status, "refunded");
  const revived = applySponsorEvent({ ...refunded, cancelOwed: null }, parseSponsorWebhook(active("active", NOW + 60 * 86_400_000, false, NOW + 9000), products), [], products, NOW).booking;
  assert.equal(revived.cancelOwed, "sub_TileSub0000000001", "a closed booking's subscription renewing is cancelled again");
  assert.equal(isShowing(revived, NOW), false);
  const renewalCharge = applySponsorEvent({ ...refunded, cancelOwed: null }, parseSponsorWebhook(payment(tile, { payment_id: "pay_Renewal00000001", subscription_id: "sub_TileSub0000000001" }), products), [], products, NOW).booking;
  assert.deepEqual(renewalCharge.refundsOwed, ["pay_Renewal00000001"], "a charge that slipped through on a closed booking is refunded");

  // Take down: a renewal charged while it ran (its webhook late) is kept; one charged after take-down is refunded.
  const down = decide(running, "remove", [running], NOW + 5000);
  assert.equal(down.closedAt, NOW + 5000);
  const lateRenewal = (id, at) => parseSponsorWebhook(payment(tile, { payment_id: id, subscription_id: "sub_TileSub0000000001", created_at: new Date(at).toISOString() }), products);
  assert.deepEqual(applySponsorEvent(down, lateRenewal("pay_RenewalEarly0001", NOW + 1000), [], products, NOW + 9000).booking.refundsOwed, [], "take down never refunds time that ran");
  assert.deepEqual(applySponsorEvent(down, lateRenewal("pay_RenewalAfter0001", NOW + 6000), [], products, NOW + 9000).booking.refundsOwed, ["pay_RenewalAfter0001"]);
  const rejectedTile = { ...running, status: "rejected", closedAt: NOW + 5000 };
  assert.deepEqual(applySponsorEvent(rejectedTile, lateRenewal("pay_RejectEarly00001", NOW), [], products, NOW + 9000).booking.refundsOwed, ["pay_RejectEarly00001"], "a rejected booking never ran: every charge goes back");
}

/* ---------- Owner decisions ---------- */
{
  const b = { ...booking(), status: "review", paymentId: "pay_TestPayment000009", paidAt: NOW };
  assert.equal(decide(b, "approve", [b], NOW).status, "approved");
  const no = decide(b, "reject", [b], NOW);
  assert.deepEqual([no.status, no.refundsOwed, no.cancelOwed], ["rejected", ["pay_TestPayment000009"], null]);
  assert.equal(decide(b, "remove", [b], NOW), null, "can't take down what isn't running");
  assert.equal(decide({ ...b, status: "approved" }, "approve", [b], NOW), null);
}

/* ---------- Service: store + fake Dodo ---------- */
{
  const key = Buffer.from("sponsor-test-signing-key-32-byte").toString("base64");
  const base = dodoConfig({ DODO_PAYMENTS_API_KEY: "k", DODO_PAYMENTS_WEBHOOK_KEY: `whsec_${key}`, DODO_PRODUCT_MONTHLY: "pdt_M", DODO_PRODUCT_YEARLY: "pdt_Y" });
  assert.equal(sponsorDodoConfig(base, {}), null, "booking stays closed without sponsor products");
  assert.equal(sponsorDodoConfig(base, { DODO_PRODUCT_SPONSOR_FEATURED: "nope", DODO_PRODUCT_SPONSOR_TILE: products.tile }), null);
  const config = sponsorDodoConfig(base, { DODO_PRODUCT_SPONSOR_FEATURED: products.featured, DODO_PRODUCT_SPONSOR_TILE: products.tile });
  assert.ok(config);
  const proIds = dodoConfig({ DODO_PAYMENTS_API_KEY: "k", DODO_PAYMENTS_WEBHOOK_KEY: `whsec_${key}`, DODO_PRODUCT_MONTHLY: products.tile, DODO_PRODUCT_YEARLY: "pdt_Y" });
  assert.equal(sponsorDodoConfig(proIds, { DODO_PRODUCT_SPONSOR_FEATURED: products.featured, DODO_PRODUCT_SPONSOR_TILE: products.tile }), null, "a sponsor id equal to a Pro id keeps booking closed");
  assert.equal(sponsorDodoConfig(base, { DODO_PRODUCT_SPONSOR_FEATURED: products.tile, DODO_PRODUCT_SPONSOR_TILE: products.tile }), null);

  // Refund retries: a pending refund (refund_status still empty) counts; someone else's partial refund doesn't.
  const posts = [];
  const refundsFake = (refunds) => async (url, init = {}) => {
    if (init.method === "POST") { posts.push(JSON.parse(init.body)); return new Response("{}"); }
    return new Response(JSON.stringify({ payment_id: "pay_Check0000000001", refund_status: null, refunds }));
  };
  await refundSponsorPayment(config, "pay_Check0000000001", "x", refundsFake([{ status: "pending", is_partial: false }]));
  await refundSponsorPayment(config, "pay_Check0000000001", "x", refundsFake([{ status: "review", is_partial: true, metadata: { product: "proupiqr-sponsor" } }]));
  assert.equal(posts.length, 0, "a refund already under way is never repeated");
  await refundSponsorPayment(config, "pay_Check0000000001", "x", refundsFake([{ status: "failed", is_partial: false }, { status: "succeeded", is_partial: true, metadata: {} }]));
  assert.deepEqual(posts, [{ payment_id: "pay_Check0000000001", reason: "x", metadata: { product: "proupiqr-sponsor" } }], "failed refunds and the owner's own partial refunds don't count; ours are tagged");
  assert.equal(dodoConfig({ DODO_PAYMENTS_API_KEY: "k", DODO_PAYMENTS_WEBHOOK_KEY: "w", DODO_PRODUCT_MONTHLY: "m", DODO_PRODUCT_YEARLY: "y", DODO_API_BASE: "http://127.0.0.1:9999" }).apiBase, "http://127.0.0.1:9999");
  assert.equal(dodoConfig({ DODO_PAYMENTS_API_KEY: "k", DODO_PAYMENTS_WEBHOOK_KEY: "w", DODO_PRODUCT_MONTHLY: "m", DODO_PRODUCT_YEARLY: "y", DODO_API_BASE: "http://127.0.0.1:9999", DODO_PAYMENTS_ENVIRONMENT: "live_mode" }).apiBase, undefined, "no API override in live mode");
  assert.equal(dodoConfig({ DODO_PAYMENTS_API_KEY: "k", DODO_PAYMENTS_WEBHOOK_KEY: "w", DODO_PRODUCT_MONTHLY: "m", DODO_PRODUCT_YEARLY: "y", DODO_API_BASE: "https://evil.example.com" }).apiBase, undefined, "only a loopback fake");

  const calls = [];
  let refundFails = false;
  let cancelFails = false;
  const refundedPayments = new Set();
  const cancelledSubs = new Set();
  const fake = async (url, init = {}) => {
    const u = new URL(url);
    const body = init.body ? JSON.parse(init.body) : null;
    const method = init.method ?? "GET";
    calls.push({ method, path: u.pathname, body });
    if (u.pathname === "/checkouts" && method === "POST") return new Response(JSON.stringify({ session_id: `cks_Session${String(calls.length).padStart(10, "0")}`, checkout_url: "https://test.checkout.dodopayments.com/session/x" }));
    if (u.pathname.startsWith("/checkouts/")) return new Response(JSON.stringify({ payment_id: "pay_Reconciled00000001" }));
    if (u.pathname === "/payments/pay_Reconciled00000001") return new Response(JSON.stringify({ payment_id: "pay_Reconciled00000001", status: "succeeded", total_amount: 99_900, currency: "INR", product_cart: [{ product_id: products.tile, quantity: 1 }], metadata: {} }));
    // Like Dodo while a UPI refund is pending: refund_status stays empty, the refund shows in refunds[].
    if (u.pathname.startsWith("/payments/")) return new Response(JSON.stringify({ payment_id: u.pathname.split("/")[2], refund_status: null, refunds: refundedPayments.has(u.pathname.split("/")[2]) ? [{ status: "pending", is_partial: false }] : [] }));
    if (u.pathname === "/refunds") {
      if (refundFails) return new Response("{}", { status: 500 });
      if (refundedPayments.has(body.payment_id)) return new Response(JSON.stringify({ error: "already refunded" }), { status: 422 });
      refundedPayments.add(body.payment_id);
      return new Response(JSON.stringify({ refund_id: "ref_1", status: "pending" }));
    }
    if (u.pathname.startsWith("/subscriptions/")) {
      const id = u.pathname.split("/")[2];
      if (method === "PATCH") { if (cancelFails) return new Response("{}", { status: 500 }); cancelledSubs.add(id); }
      return new Response(JSON.stringify({ subscription_id: id, status: cancelledSubs.has(id) ? "cancelled" : "active" }));
    }
    return new Response("{}", { status: 404 });
  };
  const store = memorySponsorStore();
  const started = await startBooking(store, config, input(), "https://www.proupiqr.in", NOW, fake);
  assert.ok(started.ok);
  assert.ok(BOOKING_ID.test(started.booking.id));
  const checkout = calls.find((c) => c.path === "/checkouts").body;
  assert.deepEqual(checkout.product_cart, [{ product_id: products.featured, quantity: 2 }]);
  assert.deepEqual(checkout.metadata, { product: "proupiqr-sponsor", booking: started.booking.id, tier: "featured" });
  assert.equal(checkout.customer.email, "ads@acme.example.com");
  assert.equal(checkout.return_url, `https://www.proupiqr.in/sponsor/?booking=${started.booking.id}#book`);
  assert.equal(checkout.feature_flags.allow_discount_code, false);
  assert.ok(await store.getLogo(started.booking.id), "logo stored with the booking");

  const sign = (body, id = `msg_${Math.random().toString(36).slice(2, 12)}`) => {
    const ts = String(Math.floor(NOW / 1000));
    const sig = createHmac("sha256", Buffer.from(key, "base64")).update(`${id}.${ts}.${body}`).digest("base64");
    return { id, timestamp: ts, signature: `v1,${sig}` };
  };
  const delivery = payment(started.booking);
  assert.ok(isSponsorDelivery(delivery, config));
  assert.equal((await handleSponsorWebhook(store, config, delivery, { ...sign(delivery), signature: "v1,AAAA" }, NOW, fake)).status, 401);
  const headers = sign(delivery, "msg_payment0001");
  let res = await handleSponsorWebhook(store, config, delivery, headers, NOW, fake);
  assert.deepEqual(res.body, { ok: true, status: "review", paid: true });
  assert.equal((await handleSponsorWebhook(store, config, delivery, headers, NOW, fake)).body.duplicate, true);
  assert.equal(await store.bookingFor("pay_TestPayment000001"), started.booking.id, "payment → booking index");

  // Reject with Dodo failing: the decision is saved with the refund owed; retrying finishes it, once.
  refundFails = true;
  await assert.rejects(decideBooking(store, config, started.booking.id, "reject", NOW, fake));
  let stored = await store.get(started.booking.id);
  assert.deepEqual([stored.status, stored.refundsOwed], ["rejected", ["pay_TestPayment000001"]], "the decision survives a Dodo failure");
  assert.equal(await decideBooking(store, config, started.booking.id, "reject", NOW, fake), null, "a second Reject does nothing");
  refundFails = false;
  const settled = await decideBooking(store, config, started.booking.id, "settle", NOW, fake);
  assert.deepEqual(settled.refundsOwed, []);
  assert.deepEqual(calls.filter((c) => c.path === "/refunds").at(-1).body, { payment_id: "pay_TestPayment000001", reason: "Sponsor booking not run", metadata: { product: "proupiqr-sponsor" } });
  assert.equal(refundedPayments.size, 1, "refunded once (the failed attempt never reached Dodo)");
  await decideBooking(store, config, started.booking.id, "settle", NOW, fake);
  assert.equal(calls.filter((c) => c.path === "/refunds" && c.method === "POST").length, 2, "nothing owed: settling again calls nothing");

  // Lost webhook: the return page re-reads the checkout from Dodo (and only every 10 s).
  const tile = await startBooking(store, config, input({ tier: "tile", tagline: "" }), "https://www.proupiqr.in", NOW, fake);
  const seen = await bookingStatus(store, config, tile.booking.id, NOW, fake);
  assert.equal(seen.status, "review");
  assert.equal(seen.paymentId, "pay_Reconciled00000001");
  const before = calls.length;
  await bookingStatus(store, config, tile.booking.id, NOW + 1000, fake);
  assert.equal(calls.length, before, "no Dodo call for a booking that's already paid");

  // Reject a tile with the cancel failing after nothing was refunded: retry cancels, then refunds exactly once.
  await store.put({ ...(await store.get(tile.booking.id)), subscriptionId: "sub_TileReject0000001" });
  cancelFails = true;
  await assert.rejects(decideBooking(store, config, tile.booking.id, "reject", NOW, fake));
  stored = await store.get(tile.booking.id);
  assert.deepEqual([stored.cancelOwed, stored.refundsOwed], ["sub_TileReject0000001", ["pay_Reconciled00000001"]], "cancel comes first; the refund waits");
  assert.ok(!refundedPayments.has("pay_Reconciled00000001"));
  cancelFails = false;
  await decideBooking(store, config, tile.booking.id, "settle", NOW, fake);
  assert.ok(cancelledSubs.has("sub_TileReject0000001") && refundedPayments.has("pay_Reconciled00000001"));
  assert.equal((await store.get(tile.booking.id)).cancelOwed, null);

  // A paid sponsorship with no booking (expired, never saved) is refunded and its subscription cancelled.
  const orphan = JSON.stringify({ type: "payment.succeeded", data: { payment_id: "pay_Orphan00000001", status: "succeeded", subscription_id: "sub_Orphan000000001", total_amount: 99_900, currency: "INR", metadata: { product: "proupiqr-sponsor", booking: `spb_${"0".repeat(32)}` } } });
  res = await handleSponsorWebhook(store, config, orphan, sign(orphan), NOW, fake);
  assert.deepEqual(res.body, { orphan: true, refunded: true });
  assert.ok(refundedPayments.has("pay_Orphan00000001") && cancelledSubs.has("sub_Orphan000000001"));
  const stranger = JSON.stringify({ type: "payment.succeeded", data: { payment_id: "pay_ProPayment000001", status: "succeeded", total_amount: 14_900, currency: "INR", metadata: { product: "proupiqr-pro" } } });
  assert.deepEqual((await handleSponsorWebhook(store, config, stranger, sign(stranger), NOW, fake)).body, { ignored: "unknown booking" }, "a Pro payment is never refunded here");
  assert.ok(!refundedPayments.has("pay_ProPayment000001"));

  // Renewal payments are linked, so a refund on a renewal finds the booking.
  const renewal = JSON.stringify({ type: "payment.succeeded", data: { payment_id: "pay_TileRenewal00001", status: "succeeded", subscription_id: "sub_TileReject0000001", total_amount: 99_900, currency: "INR" } });
  await handleSponsorWebhook(store, config, renewal, sign(renewal), NOW, fake);
  assert.equal(await store.bookingFor("pay_TileRenewal00001"), tile.booking.id);

  // Two featured approvals at once: the lock gives them consecutive dates, never the same ones.
  const f1 = { ...booking({ months: 1 }), status: "review", paidAt: NOW };
  const f2 = { ...booking({ months: 1 }), status: "review", paidAt: NOW };
  const s2 = memorySponsorStore();
  await s2.put(f1);
  await s2.put(f2);
  const [a1, a2] = await Promise.all([decideBooking(s2, config, f1.id, "approve", NOW, fake), decideBooking(s2, config, f2.id, "approve", NOW, fake)]);
  assert.notEqual(a1.start, a2.start, JSON.stringify([a1.start, a2.start]));
  assert.ok(a1.end < a2.start || a2.end < a1.start, "no overlap");
}

/* ---------- Dodo product setup (npm run dodo:sponsor-products) ---------- */
{
  const one = { price_detail: { type: "one_time_price", price: 300_000, currency: "INR", tax_inclusive: true } };
  const monthly = { price_detail: { type: "recurring_price", price: 99_900, currency: "INR", tax_inclusive: true, payment_frequency_interval: "Month", payment_frequency_count: 1 } };
  assert.ok(matchesSponsorPrice(one, "featured", 300_000));
  assert.ok(!matchesSponsorPrice({ price_detail: { ...one.price_detail, tax_inclusive: false } }, "featured", 300_000), "GST must be included");
  assert.ok(!matchesSponsorPrice({ price_detail: { ...one.price_detail, pay_what_you_want: true } }, "featured", 300_000));
  assert.ok(matchesSponsorPrice(monthly, "tile", 99_900));
  assert.ok(!matchesSponsorPrice({ price_detail: { ...monthly.price_detail, payment_frequency_interval: "Year" } }, "tile", 99_900));
  assert.ok(!matchesSponsorPrice(monthly, "featured", 99_900), "a subscription is not the featured product");

  const created = [];
  const fakeDodo = async (url, init = {}) => {
    if (init.method === "POST") { const body = JSON.parse(init.body); created.push(body); return new Response(JSON.stringify({ product_id: `pdt_New${body.metadata.tier}` })); }
    // A Pro product at ₹999 must not be mistaken for the tile; an existing sponsor tile is reused.
    return new Response(JSON.stringify({ items: [
      { product_id: "pdt_ProLookalike", metadata: { product: "proupiqr-pro" }, ...monthly },
      { product_id: "pdt_TileExisting", metadata: { product: "proupiqr-sponsor", tier: "tile" }, ...monthly },
    ] }));
  };
  assert.deepEqual(await findOrCreateSponsorProducts({ apiKey: "k", environment: "test_mode", fetchImpl: fakeDodo }), { featured: null, tile: { id: "pdt_TileExisting", created: false } });
  const made = await findOrCreateSponsorProducts({ apiKey: "k", environment: "test_mode", create: true, fetchImpl: fakeDodo });
  assert.deepEqual(made.featured, { id: "pdt_Newfeatured", created: true });
  assert.equal(created.length, 1);
  assert.deepEqual(created[0].price, { type: "one_time_price", price: 300_000, currency: "INR", tax_inclusive: true, purchasing_power_parity: false });
  assert.deepEqual(created[0].metadata, { product: "proupiqr-sponsor", tier: "featured" });
}

assert.ok(SPONSOR_REACH.weeklyClicks > 0 && SPONSOR_REACH.weeklyImpressions > SPONSOR_REACH.weeklyClicks && SPONSOR_REACH.period);
console.log("sponsors: all checks passed");
