import { createHmac, timingSafeEqual } from "node:crypto";
import { isSubscriptionStatus, type BillingInterval, type SubscriptionEvent } from "./subscription.ts";

/**
 * Minimal Razorpay Subscriptions client (docs checked 2026-10):
 *   POST /v1/subscriptions            { plan_id, total_count, customer_notify, notes }
 *   GET  /v1/subscriptions/{id}        → the subscription entity
 *   POST /v1/subscriptions/{id}/cancel { cancel_at_cycle_end }
 * Webhooks: X-Razorpay-Signature = hex HMAC-SHA256(raw body, webhook secret);
 * x-razorpay-event-id is unique per event; data at payload.subscription.entity.
 */

const API = "https://api.razorpay.com/v1";

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  plans: Record<BillingInterval, string>;
}

type Env = Record<string, string | undefined>;

/** Billing is "available" only when every value is configured. */
export function razorpayConfig(env: Env): RazorpayConfig | null {
  const keyId = env.RAZORPAY_KEY_ID?.trim();
  const keySecret = env.RAZORPAY_KEY_SECRET?.trim();
  const webhookSecret = env.RAZORPAY_WEBHOOK_SECRET?.trim();
  const monthly = env.RAZORPAY_PLAN_MONTHLY?.trim();
  const yearly = env.RAZORPAY_PLAN_YEARLY?.trim();
  if (!keyId || !keySecret || !webhookSecret || !monthly || !yearly) return null;
  return { keyId, keySecret, webhookSecret, plans: { monthly, yearly } };
}

export function verifyWebhookSignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature.toLowerCase(), "hex"));
}

type ParsedSubscription = { event: SubscriptionEvent; owner: string | null };

/** A subscription entity (webhook payload or API response) as an event; null if it isn't one. */
function subscriptionFromEntity(entity: Record<string, unknown> | undefined, event: string, createdAt: number, config: RazorpayConfig): ParsedSubscription | null {
  if (!entity || typeof entity.id !== "string" || !isSubscriptionStatus(entity.status)) return null;
  const notes = entity.notes && typeof entity.notes === "object" && !Array.isArray(entity.notes) ? entity.notes as Record<string, unknown> : {};
  const owner = typeof notes.owner === "string" && /^[a-f0-9]{32}$/.test(notes.owner) ? notes.owner : null;
  return {
    owner,
    event: {
      event,
      createdAt,
      subscriptionId: entity.id,
      status: entity.status,
      currentEnd: typeof entity.current_end === "number" ? entity.current_end * 1000 : null,
      interval: entity.plan_id === config.plans.yearly ? "yearly" : "monthly",
    },
  };
}

/** Extracts a subscription event and the owner from our notes; null for anything else. */
export function parseSubscriptionWebhook(rawBody: string, config: RazorpayConfig): ParsedSubscription | null {
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return null;
  }
  const event = typeof body.event === "string" ? body.event : "";
  if (!event.startsWith("subscription.")) return null;
  const entity = (body.payload as { subscription?: { entity?: Record<string, unknown> } } | undefined)?.subscription?.entity;
  const createdAt = typeof body.created_at === "number" ? body.created_at * 1000 : Date.now();
  return subscriptionFromEntity(entity, event, createdAt, config);
}

function authHeader(config: RazorpayConfig): string {
  return `Basic ${Buffer.from(`${config.keyId}:${config.keySecret}`).toString("base64")}`;
}

export interface CreatedSubscription {
  id: string;
  shortUrl: string;
  status: string;
}

export async function createSubscription(
  config: RazorpayConfig,
  interval: BillingInterval,
  owner: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CreatedSubscription> {
  const response = await fetchImpl(`${API}/subscriptions`, {
    method: "POST",
    headers: { Authorization: authHeader(config), "Content-Type": "application/json" },
    body: JSON.stringify({
      plan_id: config.plans[interval],
      // Razorpay needs a finite cycle count: 10 years either way.
      total_count: interval === "yearly" ? 10 : 120,
      customer_notify: true,
      notes: { owner, product: "proupiqr-pro" },
    }),
  });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || typeof body.id !== "string" || typeof body.short_url !== "string") {
    throw new Error(`Razorpay subscription create failed (${response.status})`);
  }
  return { id: body.id, shortUrl: body.short_url, status: String(body.status ?? "created") };
}

const SUBSCRIPTION_ID = /^sub_[A-Za-z0-9]{6,40}$/;

/**
 * The subscription as Razorpay sees it right now, shaped like a webhook event so
 * it goes through the same applySubscriptionEvent rules. Its createdAt is the
 * start of the previous whole second: webhook created_at only has whole seconds,
 * so an event from the same second as this read still applies afterwards.
 */
export async function fetchSubscription(
  config: RazorpayConfig,
  subscriptionId: string,
  now: number,
  fetchImpl: typeof fetch = fetch,
): Promise<ParsedSubscription> {
  if (!SUBSCRIPTION_ID.test(subscriptionId)) throw new Error("Invalid subscription id");
  const response = await fetchImpl(`${API}/subscriptions/${subscriptionId}`, {
    headers: { Authorization: authHeader(config) },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Razorpay subscription fetch failed (${response.status})`);
  const entity = await response.json().catch(() => null) as Record<string, unknown> | null;
  const parsed = subscriptionFromEntity(entity ?? undefined, "subscription.fetched", Math.floor(now / 1000) * 1000 - 1000, config);
  if (!parsed || parsed.event.subscriptionId !== subscriptionId) throw new Error("Unexpected subscription from Razorpay");
  return parsed;
}

export async function cancelAtCycleEnd(config: RazorpayConfig, subscriptionId: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  if (!SUBSCRIPTION_ID.test(subscriptionId)) throw new Error("Invalid subscription id");
  const response = await fetchImpl(`${API}/subscriptions/${subscriptionId}/cancel`, {
    method: "POST",
    headers: { Authorization: authHeader(config), "Content-Type": "application/json" },
    body: JSON.stringify({ cancel_at_cycle_end: true }),
  });
  if (!response.ok) throw new Error(`Razorpay cancel failed (${response.status})`);
}
