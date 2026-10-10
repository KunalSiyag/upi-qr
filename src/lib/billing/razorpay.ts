import { createHmac, timingSafeEqual } from "node:crypto";
import { isSubscriptionStatus, type BillingInterval, type SubscriptionEvent } from "./subscription.ts";

/**
 * Minimal Razorpay Subscriptions client (docs checked 2026-10):
 *   POST /v1/subscriptions            { plan_id, total_count, customer_notify, notes }
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

/** Extracts a subscription event and the owner from our notes; null for anything else. */
export function parseSubscriptionWebhook(rawBody: string, config: RazorpayConfig): { event: SubscriptionEvent; owner: string | null } | null {
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return null;
  }
  const event = typeof body.event === "string" ? body.event : "";
  const entity = (body.payload as { subscription?: { entity?: Record<string, unknown> } } | undefined)?.subscription?.entity;
  if (!event.startsWith("subscription.") || !entity || typeof entity.id !== "string" || !isSubscriptionStatus(entity.status)) return null;
  const notes = entity.notes && typeof entity.notes === "object" && !Array.isArray(entity.notes) ? entity.notes as Record<string, unknown> : {};
  const owner = typeof notes.owner === "string" && /^[a-f0-9]{32}$/.test(notes.owner) ? notes.owner : null;
  const createdAt = typeof body.created_at === "number" ? body.created_at * 1000 : Date.now();
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

export async function cancelAtCycleEnd(config: RazorpayConfig, subscriptionId: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  if (!/^sub_[A-Za-z0-9]{6,40}$/.test(subscriptionId)) throw new Error("Invalid subscription id");
  const response = await fetchImpl(`${API}/subscriptions/${subscriptionId}/cancel`, {
    method: "POST",
    headers: { Authorization: authHeader(config), "Content-Type": "application/json" },
    body: JSON.stringify({ cancel_at_cycle_end: true }),
  });
  if (!response.ok) throw new Error(`Razorpay cancel failed (${response.status})`);
}
