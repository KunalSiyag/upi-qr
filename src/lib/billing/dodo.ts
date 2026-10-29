import { createHmac, timingSafeEqual } from "node:crypto";
import type { BillingInterval, ParsedSubscription, SubscriptionStatus } from "./subscription.ts";

/**
 * Dodo Payments client — our merchant of record for Pro (it is the legal seller
 * and handles GST). Shapes checked 2026-10 against the official SDK
 * (dodopayments 2.51, generated from Dodo's API spec):
 *   POST  /customers                               { email, name, metadata }        → { customer_id }
 *   POST  /checkouts                               { product_cart, customer, … }    → { session_id, checkout_url }
 *   GET   /checkouts/{id} → payment_id;   GET /payments/{id} → subscription_id
 *   GET   /subscriptions/{id};            PATCH /subscriptions/{id} { cancel_at_next_billing_date }
 *   GET   /subscriptions?customer_id&created_at_gte → { items }   (a free trial may start without a payment)
 *   POST  /customers/{id}/customer-portal/session?return_url=…                     → { link }
 * Webhooks follow Standard Webhooks: headers webhook-id, webhook-timestamp,
 * webhook-signature = "v1,<base64 HMAC-SHA256(key, `${id}.${timestamp}.${body}`)>",
 * key = base64 after the "whsec_" prefix.
 */

export interface DodoConfig {
  apiKey: string;
  webhookKey: string;
  environment: "test_mode" | "live_mode";
  products: Record<BillingInterval, string>;
  /** Test mode only: a loopback fake of the Dodo API (scripts/e2e/fake-dodo.mjs). */
  apiBase?: string;
}

type Env = Record<string, string | undefined>;

/** Billing through Dodo is "available" only when every value is configured. Test mode unless explicitly live. */
export function dodoConfig(env: Env): DodoConfig | null {
  const apiKey = env.DODO_PAYMENTS_API_KEY?.trim();
  const webhookKey = env.DODO_PAYMENTS_WEBHOOK_KEY?.trim();
  const monthly = env.DODO_PRODUCT_MONTHLY?.trim();
  const yearly = env.DODO_PRODUCT_YEARLY?.trim();
  if (!apiKey || !webhookKey || !monthly || !yearly) return null;
  const environment = env.DODO_PAYMENTS_ENVIRONMENT?.trim() === "live_mode" ? "live_mode" : "test_mode";
  const apiBase = env.DODO_API_BASE?.trim();
  const fake = environment === "test_mode" && apiBase && /^http:\/\/(127\.0\.0\.1|localhost):\d{2,5}$/.test(apiBase) ? apiBase : undefined;
  return { apiKey, webhookKey, environment, products: { monthly, yearly }, ...(fake ? { apiBase: fake } : {}) };
}

export const dodoBaseUrl = (config: Pick<DodoConfig, "environment" | "apiBase">): string =>
  config.apiBase ?? (config.environment === "live_mode" ? "https://live.dodopayments.com" : "https://test.dodopayments.com");

const ID = {
  sub: /^sub_[A-Za-z0-9]{8,40}$/,
  cus: /^cus_[A-Za-z0-9]{8,40}$/,
  cks: /^cks_[A-Za-z0-9]{8,40}$/,
  pay: /^pay_[A-Za-z0-9]{8,40}$/,
};
export const isDodoCheckoutId = (id: string): boolean => ID.cks.test(id);

/* ---------- Webhooks ---------- */

/** Standard Webhooks signature check, with a 5-minute window against replays. */
export function verifyStandardWebhook(
  rawBody: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  key: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature || !/^\d{1,12}$/.test(timestamp)) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > 300) return false;
  const secret = Buffer.from(key.startsWith("whsec_") ? key.slice(6) : key, "base64");
  if (secret.length === 0) return false;
  const expected = createHmac("sha256", secret).update(`${id}.${timestamp}.${rawBody}`).digest();
  for (const part of signature.split(" ")) {
    const [version, value] = part.split(",", 2);
    if (version !== "v1" || !value) continue;
    const given = Buffer.from(value, "base64");
    if (given.length === expected.length && timingSafeEqual(given, expected)) return true;
  }
  return false;
}

/** Dodo statuses onto ours (see subscription.ts for what grants access). */
const STATUS: Record<string, SubscriptionStatus> = {
  pending: "created",
  active: "active",
  on_hold: "pending",
  past_due: "pending",
  paused: "paused",
  cancelled: "cancelled",
  failed: "expired",
  expired: "expired",
};

const OWNER = /^[a-f0-9]{32}$/;
const ownerFrom = (metadata: unknown): string | null => {
  const value = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? (metadata as Record<string, unknown>).owner : null;
  return typeof value === "string" && OWNER.test(value) ? value : null;
};

/** A Dodo subscription object (API response or webhook `data`) as an event; null if it isn't one. */
export function parseDodoSubscription(raw: unknown, event: string, createdAt: number, config: Pick<DodoConfig, "products">): ParsedSubscription | null {
  if (!raw || typeof raw !== "object") return null;
  const sub = raw as Record<string, unknown>;
  const status = typeof sub.status === "string" ? STATUS[sub.status] : undefined;
  if (typeof sub.subscription_id !== "string" || !ID.sub.test(sub.subscription_id) || !status) return null;
  const customer = sub.customer && typeof sub.customer === "object" ? sub.customer as Record<string, unknown> : {};
  const end = typeof sub.next_billing_date === "string" ? Date.parse(sub.next_billing_date) : NaN;
  const started = typeof sub.created_at === "string" ? Date.parse(sub.created_at) : NaN;
  const trialDays = typeof sub.trial_period_days === "number" && sub.trial_period_days > 0 ? sub.trial_period_days : 0;
  const yearly = sub.product_id === config.products.yearly || (sub.product_id !== config.products.monthly && sub.payment_frequency_interval === "Year");
  return {
    owner: ownerFrom(customer.metadata) ?? ownerFrom(sub.metadata),
    customerId: typeof customer.customer_id === "string" && ID.cus.test(customer.customer_id) ? customer.customer_id : null,
    event: {
      event,
      createdAt,
      subscriptionId: sub.subscription_id,
      status,
      currentEnd: Number.isFinite(end) ? end : null,
      interval: yearly ? "yearly" : "monthly",
      provider: "dodo",
      cancelAtPeriodEnd: sub.cancel_at_next_billing_date === true,
      trialEndsAt: trialDays && Number.isFinite(started) ? started + trialDays * 86_400_000 : null,
    },
  };
}

/** A subscription.* webhook delivery; null for other event types (payments, refunds…) or junk. */
export function parseDodoWebhook(rawBody: string, config: Pick<DodoConfig, "products">): ParsedSubscription | null {
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return null;
  }
  const type = typeof body.type === "string" ? body.type : "";
  if (!type.startsWith("subscription.")) return null;
  const at = typeof body.timestamp === "string" ? Date.parse(body.timestamp) : NaN;
  return parseDodoSubscription(body.data, type, Number.isFinite(at) ? at : Date.now(), config);
}

/* ---------- API ---------- */

export async function dodoRequest<T>(config: DodoConfig, fetchImpl: typeof fetch, method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetchImpl(`${dodoBaseUrl(config)}${path}`, {
    method,
    headers: { Authorization: `Bearer ${config.apiKey}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  const json = await response.json().catch(() => null) as T | null;
  if (!response.ok || json === null) throw new Error(`Dodo ${method} ${path.split("?")[0].replace(/[a-z]{3}_[A-Za-z0-9]+/g, ":id")} failed (${response.status})`);
  return json;
}

/** One Dodo customer per account, tagged with our hashed owner id so every subscription event names its account. */
export async function createDodoCustomer(config: DodoConfig, input: { owner: string; email: string; name: string }, fetchImpl: typeof fetch = fetch): Promise<string> {
  const customer = await dodoRequest<{ customer_id?: unknown }>(config, fetchImpl, "POST", "/customers", {
    email: input.email,
    name: input.name || input.email,
    metadata: { owner: input.owner, product: "proupiqr-pro" },
  });
  if (typeof customer.customer_id !== "string" || !ID.cus.test(customer.customer_id)) throw new Error("Unexpected customer from Dodo");
  return customer.customer_id;
}

/** Hosted checkout for a Pro subscription. Returns the session id (cks_…) until the subscription exists. */
export async function createDodoCheckout(
  config: DodoConfig,
  input: { interval: BillingInterval; owner: string; customerId: string; returnUrl: string; cancelUrl: string; trialDays?: number },
  fetchImpl: typeof fetch = fetch,
): Promise<{ id: string; url: string }> {
  const session = await dodoRequest<{ session_id?: unknown; checkout_url?: unknown }>(config, fetchImpl, "POST", "/checkouts", {
    product_cart: [{ product_id: config.products[input.interval], quantity: 1 }],
    customer: { customer_id: input.customerId },
    metadata: { owner: input.owner, product: "proupiqr-pro", interval: input.interval },
    billing_currency: "INR",
    billing_address: { country: "IN" },
    // Charge exactly the INR price on /pricing/: no currency switch, no coupon box (we have no codes).
    // GST-registered buyers can still add their GSTIN for the invoice. Return straight to Settings.
    feature_flags: { allow_currency_selection: false, allow_discount_code: false, allow_tax_id: true, redirect_immediately: true },
    // Free trial: the payment method is taken now and the first charge happens when the trial ends.
    ...(input.trialDays && input.trialDays > 0 ? { subscription_data: { trial_period_days: Math.floor(input.trialDays) } } : {}),
    return_url: input.returnUrl,
    cancel_url: input.cancelUrl,
  });
  if (typeof session.session_id !== "string" || !ID.cks.test(session.session_id) || typeof session.checkout_url !== "string") {
    throw new Error("Unexpected checkout session from Dodo");
  }
  return { id: session.session_id, url: session.checkout_url };
}

/** Where to look for a checkout's subscription when the session has no payment yet (a free trial). */
export interface DodoLookupHint {
  /** The account's Dodo customer. */
  customerId?: string | null;
  /** When the checkout started, epoch ms. */
  since?: number;
}

/**
 * The subscription as Dodo sees it now, shaped like a webhook event. Accepts a
 * subscription id or, while a checkout is unconfirmed, its checkout session id
 * (session → payment → subscription; for a free trial with no payment, the
 * customer's newest Pro subscription created since the checkout started). Its
 * createdAt is the previous whole second, like the Razorpay re-read, so a
 * webhook from the same second still applies.
 */
export async function fetchDodoSubscription(config: DodoConfig, id: string, now: number, fetchImpl: typeof fetch = fetch, hint: DodoLookupHint = {}): Promise<ParsedSubscription> {
  const createdAt = Math.floor(now / 1000) * 1000 - 1000;
  let subscriptionId = id;
  if (ID.cks.test(id)) {
    const session = await dodoRequest<{ payment_id?: unknown }>(config, fetchImpl, "GET", `/checkouts/${id}`);
    let found: string | null = null;
    if (typeof session.payment_id === "string" && ID.pay.test(session.payment_id)) {
      const payment = await dodoRequest<{ subscription_id?: unknown }>(config, fetchImpl, "GET", `/payments/${session.payment_id}`);
      if (typeof payment.subscription_id === "string") found = payment.subscription_id;
    }
    if (!found) {
      const listed = await newestProSubscription(config, hint, createdAt, fetchImpl);
      if (listed) return listed;
      throw new Error("Checkout not completed yet");
    }
    subscriptionId = found;
  }
  if (!ID.sub.test(subscriptionId)) throw new Error("Invalid subscription id");
  const sub = await dodoRequest<unknown>(config, fetchImpl, "GET", `/subscriptions/${subscriptionId}`);
  const parsed = parseDodoSubscription(sub, "subscription.fetched", createdAt, config);
  if (!parsed || parsed.event.subscriptionId !== subscriptionId) throw new Error("Unexpected subscription from Dodo");
  return parsed;
}

/** The customer's newest subscription to one of our products, created since the checkout started. */
async function newestProSubscription(config: DodoConfig, hint: DodoLookupHint, createdAt: number, fetchImpl: typeof fetch): Promise<ParsedSubscription | null> {
  if (!hint.customerId || !ID.cus.test(hint.customerId) || !hint.since) return null;
  // A few minutes of slack for clock differences between us and Dodo.
  const since = new Date(hint.since - 10 * 60_000).toISOString();
  const page = await dodoRequest<{ items?: unknown }>(config, fetchImpl, "GET", `/subscriptions?customer_id=${hint.customerId}&created_at_gte=${encodeURIComponent(since)}&page_size=20`);
  const products = new Set(Object.values(config.products));
  const ours = (Array.isArray(page.items) ? page.items : [])
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && products.has((item as Record<string, unknown>).product_id as string))
    .sort((a, b) => Date.parse(String(b.created_at)) - Date.parse(String(a.created_at)));
  for (const item of ours) {
    const parsed = parseDodoSubscription(item, "subscription.fetched", createdAt, config);
    if (parsed) return { ...parsed, customerId: parsed.customerId ?? hint.customerId };
  }
  return null;
}

export async function cancelDodoAtPeriodEnd(config: DodoConfig, subscriptionId: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  if (!ID.sub.test(subscriptionId)) throw new Error("Invalid subscription id");
  await dodoRequest(config, fetchImpl, "PATCH", `/subscriptions/${subscriptionId}`, { cancel_at_next_billing_date: true });
}

/** Dodo's hosted portal: payment method, invoices, cancellation. */
export async function dodoPortalLink(config: DodoConfig, customerId: string, returnUrl: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  if (!ID.cus.test(customerId)) throw new Error("Invalid customer id");
  // The SDK sends return_url as a query parameter, not in the body.
  const session = await dodoRequest<{ link?: unknown }>(config, fetchImpl, "POST", `/customers/${customerId}/customer-portal/session?return_url=${encodeURIComponent(returnUrl)}`);
  if (typeof session.link !== "string") throw new Error("Unexpected portal session from Dodo");
  return session.link;
}
