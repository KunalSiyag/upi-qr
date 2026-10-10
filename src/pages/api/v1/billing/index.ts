import type { APIRoute } from "astro";
import { authenticatedUserId, isTrustedMutation, jsonResponse, readJsonObject, RequestBodyError } from "../../../../lib/apiSecurity";
import { consumeRateLimit, rateLimitHeaders } from "../../../../lib/rateLimit";
import { billingConfig, safeCheckoutUrl } from "../../../../lib/billing/config";
import { billingStore } from "../../../../lib/billing/kvBillingStore";
import { cancelAtCycleEnd, createSubscription } from "../../../../lib/billing/razorpay";
import { recheckInterval, reconcileSubscription } from "../../../../lib/billing/reconcile";
import { hasProAccess, type BillingInterval } from "../../../../lib/billing/subscription";
import { recordMetric } from "../../../../lib/metrics";
import { planFromSubscription } from "../../../../lib/workspace/entitlements";
import { rateLimitsAvailable, workspaceOwner } from "../../../../lib/workspace/kvCloudStore";
import { PRO_PRICES } from "../../../../data/pricing";

export const prerender = false;

const PENDING_CHECKOUT_REUSE_MS = 24 * 60 * 60 * 1000;

export const GET: APIRoute = async ({ locals }) => {
  const userId = authenticatedUserId(locals);
  if (!userId) return jsonResponse({ error: "Sign in to see your plan." }, 401);
  try {
    const owner = workspaceOwner(userId);
    const store = billingStore();
    const config = billingConfig();
    const now = Date.now();
    let record = await store.get(owner);
    // Waiting on Razorpay (unconfirmed checkout, failing renewal)? Re-read it in case a webhook was lost.
    if (config && recheckInterval(record, now) !== null) {
      const result = await reconcileSubscription(store, config, owner, now);
      record = result.record;
      if (result.activated) await recordMetric("pro_activated");
    }
    const plan = planFromSubscription(record, now);
    const checkoutUrl = record?.status === "created" && record.shortUrl && now - record.updatedAt < PENDING_CHECKOUT_REUSE_MS
      ? safeCheckoutUrl(record.shortUrl)
      : null;
    return jsonResponse({
      plan: { id: plan.id, activePaylinks: plan.activePaylinks },
      subscription: record && record.status !== "created"
        ? { status: record.status, interval: record.interval, currentEnd: record.currentEnd, cancelAtCycleEnd: record.cancelAtCycleEnd }
        : null,
      // A checkout the customer started but Razorpay hasn't confirmed yet.
      checkout: checkoutUrl && plan.id === "free" && record ? { interval: record.interval, url: checkoutUrl } : null,
      billingAvailable: config !== null,
      prices: PRO_PRICES,
    });
  } catch {
    return jsonResponse({ error: "Billing is unavailable right now." }, 503);
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const userId = authenticatedUserId(locals);
  if (!userId) return jsonResponse({ error: "Sign in first." }, 401);
  if (!isTrustedMutation(request)) return jsonResponse({ error: "Cross-site request rejected." }, 403);
  let body: Record<string, unknown>;
  try {
    body = await readJsonObject(request, 512);
  } catch (error) {
    if (error instanceof RequestBodyError) return jsonResponse({ error: error.message }, error.status);
    return jsonResponse({ error: "JSON body required." }, 400);
  }
  const config = billingConfig();
  if (!config) return jsonResponse({ error: "Pro is not available for purchase yet.", code: "billing_unavailable" }, 503);

  try {
    if (rateLimitsAvailable()) {
      const rate = await consumeRateLimit("billing-action", userId, 20, 3600);
      if (!rate.allowed) return jsonResponse({ error: "Too many attempts. Try again later." }, 429, rateLimitHeaders(rate));
    }
    const owner = workspaceOwner(userId);
    const store = billingStore();
    const existing = await store.get(owner);
    const now = Date.now();

    if (body.action === "checkout") {
      const interval: BillingInterval = body.interval === "yearly" ? "yearly" : "monthly";
      if (hasProAccess(existing, now) && !(existing?.status === "cancelled" || existing?.status === "completed")) {
        return jsonResponse({ error: "You're already on Pro.", code: "already_pro" }, 409);
      }
      // Reuse a fresh, unpaid checkout so double clicks don't create duplicate subscriptions.
      if (existing?.status === "created" && existing.shortUrl && existing.interval === interval && now - existing.updatedAt < PENDING_CHECKOUT_REUSE_MS) {
        const url = safeCheckoutUrl(existing.shortUrl);
        if (url) return jsonResponse({ url });
      }
      const created = await createSubscription(config, interval, owner);
      const url = safeCheckoutUrl(created.shortUrl);
      if (!url) return jsonResponse({ error: "Unexpected checkout address from the payment provider." }, 502);
      await store.link(created.id, owner);
      if (!hasProAccess(existing, now)) {
        await store.put(owner, {
          provider: "razorpay", subscriptionId: created.id, interval, status: "created", currentEnd: null,
          cancelAtCycleEnd: false, shortUrl: url, eventAt: 0, updatedAt: now,
        });
      }
      return jsonResponse({ url });
    }

    if (body.action === "cancel") {
      if (!existing || !(existing.status === "active" || existing.status === "authenticated")) {
        return jsonResponse({ error: "There's no active subscription to cancel." }, 409);
      }
      await cancelAtCycleEnd(config, existing.subscriptionId);
      await store.put(owner, { ...existing, cancelAtCycleEnd: true, updatedAt: now });
      return jsonResponse({ ok: true, currentEnd: existing.currentEnd });
    }

    return jsonResponse({ error: "Unknown action." }, 400);
  } catch {
    return jsonResponse({ error: "Couldn't reach the payment provider. Try again in a minute." }, 502);
  }
};
