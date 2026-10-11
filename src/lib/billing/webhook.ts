import { parseSubscriptionWebhook, verifyWebhookSignature, type RazorpayConfig } from "./razorpay.ts";
import { parseDodoWebhook, verifyStandardWebhook, type DodoConfig } from "./dodo.ts";
import { applySubscriptionEvent, hasProAccess, type ParsedSubscription } from "./subscription.ts";
import type { BillingStore } from "./store.ts";

export interface WebhookResult {
  status: number;
  body: Record<string, unknown>;
}

/**
 * Applies one Razorpay webhook delivery. Unknown or irrelevant events get 200
 * so Razorpay stops retrying; only a bad signature or a storage failure (thrown)
 * makes Razorpay retry. Re-delivered events are idempotent.
 */
export async function handleSubscriptionWebhook(
  store: BillingStore,
  config: RazorpayConfig,
  rawBody: string,
  signature: string | null,
  eventId: string | null,
  now: number,
): Promise<WebhookResult> {
  if (!verifyWebhookSignature(rawBody, signature, config.webhookSecret)) return { status: 401, body: { error: "Invalid signature." } };
  const parsed = parseSubscriptionWebhook(rawBody, config);
  if (!parsed) return { status: 200, body: { ignored: "not a subscription event" } };
  return applyVerifiedEvent(store, parsed, eventId, now);
}

/**
 * Applies one Dodo Payments webhook delivery (Standard Webhooks signature,
 * webhook-id for de-duplication). Same rules as Razorpay: only a bad signature
 * or a storage failure makes Dodo retry.
 */
export async function handleDodoWebhook(
  store: BillingStore,
  config: DodoConfig,
  rawBody: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  now: number,
): Promise<WebhookResult> {
  if (!verifyStandardWebhook(rawBody, headers, config.webhookKey, Math.floor(now / 1000))) return { status: 401, body: { error: "Invalid signature." } };
  const parsed = parseDodoWebhook(rawBody, config);
  if (!parsed) return { status: 200, body: { ignored: "not a subscription event" } };
  return applyVerifiedEvent(store, parsed, headers.id, now);
}

/** Records a verified subscription event against its account, once per event id. */
export async function applyVerifiedEvent(store: BillingStore, parsed: ParsedSubscription, eventId: string | null, now: number): Promise<WebhookResult> {
  const id = eventId && /^[A-Za-z0-9_-]{6,64}$/.test(eventId) ? eventId : null;
  if (id && (await store.seen(id))) return { status: 200, body: { duplicate: true } };

  const mapped = await store.ownerFor(parsed.event.subscriptionId);
  if (mapped && parsed.owner && mapped !== parsed.owner) return { status: 200, body: { ignored: "owner mismatch" } };
  const viaCustomer = !mapped && !parsed.owner && parsed.customerId ? await store.ownerForCustomer(parsed.customerId) : null;
  const owner = mapped ?? parsed.owner ?? viaCustomer;
  if (!owner) return { status: 200, body: { ignored: "unknown subscription" } };

  const existing = await store.get(owner);
  const next = applySubscriptionEvent(existing, parsed.event, now);
  if (next) await store.put(owner, next);
  if (!mapped) await store.link(parsed.event.subscriptionId, owner);
  if (id) await store.markSeen(id);
  const transition = !next ? null
    : !hasProAccess(existing, now) && hasProAccess(next, now) ? "pro_activated"
    : parsed.event.event === "subscription.cancelled" ? "pro_cancelled"
    : null;
  return { status: 200, body: { ok: true, applied: Boolean(next), transition } };
}
