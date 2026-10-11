import type { APIRoute } from "astro";
import { authenticatedUserId, isTrustedMutation, jsonResponse, readJsonObject, RequestBodyError } from "../../../../lib/apiSecurity";
import { consumeRateLimit, rateLimitHeaders } from "../../../../lib/rateLimit";
import { billingProviders, safeCheckoutUrl } from "../../../../lib/billing/config";
import { billingStore } from "../../../../lib/billing/kvBillingStore";
import { CheckoutNeedsEmail, checkoutProvider, providerFor } from "../../../../lib/billing/provider";
import { recheckInterval, reconcileSubscription } from "../../../../lib/billing/reconcile";
import { hasProAccess, inTrial, trialEligible, type BillingInterval, type SubscriptionRecord } from "../../../../lib/billing/subscription";
import { recordMetric } from "../../../../lib/metrics";
import { planFromSubscription } from "../../../../lib/workspace/entitlements";
import { rateLimitsAvailable, workspaceOwner } from "../../../../lib/workspace/kvCloudStore";
import { PRO_PRICES, PRO_TRIAL_DAYS } from "../../../../data/pricing";

export const prerender = false;

const PENDING_CHECKOUT_REUSE_MS = 24 * 60 * 60 * 1000;

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

/** Free trial days a new checkout gets: Dodo only (it takes the payment method now and charges at the end), once per account. */
const trialDaysFor = (providerId: string | undefined, record: SubscriptionRecord | null): number =>
  providerId === "dodo" && PRO_TRIAL_DAYS > 0 && trialEligible(record) ? PRO_TRIAL_DAYS : 0;

/** The signed-in account's email and name from Clerk (for the provider's customer record and receipt). */
async function accountContact(locals: unknown, fallbackEmail: unknown): Promise<{ email: string | null; name: string | null }> {
  try {
    const user = await (locals as { currentUser?: () => Promise<{ primaryEmailAddress?: { emailAddress?: string } | null; fullName?: string | null; firstName?: string | null } | null> }).currentUser?.();
    const email = user?.primaryEmailAddress?.emailAddress ?? null;
    if (email) return { email, name: user?.fullName || user?.firstName || null };
  } catch {
    // Clerk unreachable: fall back to the address the signed-in page sent.
  }
  return { email: typeof fallbackEmail === "string" && EMAIL.test(fallbackEmail.trim()) ? fallbackEmail.trim() : null, name: null };
}

export const GET: APIRoute = async ({ locals }) => {
  const userId = authenticatedUserId(locals);
  if (!userId) return jsonResponse({ error: "Sign in to see your plan." }, 401);
  try {
    const owner = workspaceOwner(userId);
    const store = billingStore();
    const providers = billingProviders();
    const now = Date.now();
    let record = await store.get(owner);
    // Waiting on the provider (unconfirmed checkout, failing renewal)? Re-read it in case a webhook was lost.
    if (recheckInterval(record, now) !== null) {
      const result = await reconcileSubscription(store, providers, owner, now);
      record = result.record;
      if (result.activated) await recordMetric("pro_activated");
      if (result.changed) await recordMetric("billing_reconciled");
    }
    const plan = planFromSubscription(record, now);
    const checkoutUrl = record?.status === "created" && record.shortUrl && now - record.updatedAt < PENDING_CHECKOUT_REUSE_MS
      ? safeCheckoutUrl(record.shortUrl)
      : null;
    const provider = checkoutProvider(providers);
    return jsonResponse({
      plan: { id: plan.id, activePaylinks: plan.activePaylinks },
      subscription: record && record.status !== "created"
        ? { status: record.status, interval: record.interval, currentEnd: record.currentEnd, cancelAtCycleEnd: record.cancelAtCycleEnd, trialEndsAt: inTrial(record, now) ? record.trialEndsAt : null }
        : null,
      // A checkout the customer started but the provider hasn't confirmed yet.
      checkout: checkoutUrl && plan.id === "free" && record ? { interval: record.interval, url: checkoutUrl } : null,
      billingAvailable: provider !== null,
      provider: provider?.id ?? null,
      // Days free before the first charge if this account checks out now (0: charged at checkout).
      trialDays: trialDaysFor(provider?.id, record),
      // Dodo's customer portal (payment method, invoices) for subscriptions it manages.
      manageAvailable: Boolean(record && record.status !== "created" && record.provider === "dodo" && providers.dodo),
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
  const providers = billingProviders();
  if (!checkoutProvider(providers)) return jsonResponse({ error: "Pro is not available for purchase yet.", code: "billing_unavailable" }, 503);

  try {
    if (rateLimitsAvailable()) {
      const rate = await consumeRateLimit("billing-action", userId, 20, 3600);
      if (!rate.allowed) return jsonResponse({ error: "Too many attempts. Try again later." }, 429, rateLimitHeaders(rate));
    }
    const owner = workspaceOwner(userId);
    const store = billingStore();
    const existing = await store.get(owner);
    const now = Date.now();
    const origin = new URL(request.url).origin;

    if (body.action === "checkout") {
      const provider = checkoutProvider(providers)!;
      const interval: BillingInterval = body.interval === "yearly" ? "yearly" : "monthly";
      if (hasProAccess(existing, now) && !(existing?.status === "cancelled" || existing?.status === "completed")) {
        return jsonResponse({ error: "You're already on Pro.", code: "already_pro" }, 409);
      }
      // Reuse a fresh, unpaid checkout so double clicks don't create duplicate subscriptions.
      if (existing?.status === "created" && existing.provider === provider.id && existing.shortUrl && existing.interval === interval && now - existing.updatedAt < PENDING_CHECKOUT_REUSE_MS) {
        const url = safeCheckoutUrl(existing.shortUrl);
        if (url) return jsonResponse({ url });
      }
      const { email, name } = await accountContact(locals, body.email);
      const trialDays = trialDaysFor(provider.id, existing);
      const started = await provider.startCheckout({ interval, owner, email, name, origin, trialDays }, store);
      const url = safeCheckoutUrl(started.url);
      if (!url) return jsonResponse({ error: "Unexpected checkout address from the payment provider." }, 502);
      await store.link(started.subscriptionId, owner);
      if (!hasProAccess(existing, now)) {
        // Keep the account's subscription history so a past subscriber can't take the free trial again.
        const hadSubscription = Boolean(existing?.hadSubscription) || Boolean(existing && existing.status !== "created");
        await store.put(owner, {
          provider: provider.id, subscriptionId: started.subscriptionId, interval, status: "created", currentEnd: null,
          cancelAtCycleEnd: false, shortUrl: url, eventAt: 0, updatedAt: now, ...(hadSubscription ? { hadSubscription: true } : {}),
        });
      }
      await recordMetric("checkout_started");
      return jsonResponse({ url, trialDays });
    }

    if (body.action === "cancel") {
      const provider = providerFor(existing, providers);
      if (!existing || !provider || !(existing.status === "active" || existing.status === "authenticated")) {
        return jsonResponse({ error: "There's no active subscription to cancel." }, 409);
      }
      await provider.cancelAtPeriodEnd(existing.subscriptionId);
      await store.put(owner, { ...existing, cancelAtCycleEnd: true, updatedAt: now });
      return jsonResponse({ ok: true, currentEnd: existing.currentEnd });
    }

    if (body.action === "manage") {
      const provider = providerFor(existing, providers);
      const link = provider && existing && existing.status !== "created" ? await provider.manageUrl(owner, origin, store) : null;
      const url = link ? safeCheckoutUrl(link) : null;
      if (!url) return jsonResponse({ error: "Billing management isn't available for this subscription." }, 404);
      return jsonResponse({ url });
    }

    return jsonResponse({ error: "Unknown action." }, 400);
  } catch (error) {
    if (error instanceof CheckoutNeedsEmail) return jsonResponse({ error: error.message, code: "email_required" }, 400);
    return jsonResponse({ error: "Couldn't reach the payment provider. Try again in a minute." }, 502);
  }
};
