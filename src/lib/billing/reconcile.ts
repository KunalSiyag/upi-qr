import { fetchSubscription, type RazorpayConfig } from "./razorpay.ts";
import { applySubscriptionEvent, hasProAccess, type SubscriptionRecord } from "./subscription.ts";
import type { BillingStore } from "./store.ts";

/**
 * Webhooks drive billing state, but a delivery can be lost for good: a webhook
 * URL without the trailing slash (redirects count as failures), a test/live
 * secret mix-up, a protected preview deployment, or an outage that outlasts
 * Razorpay's retries. While an account is waiting on Razorpay, re-read its
 * subscription so a customer who paid is never left on Free, and a fixed
 * renewal comes back without waiting for the next webhook.
 */

const DAY = 86_400_000;
/** Unconfirmed checkouts are re-checked for a week, then treated as abandoned. */
export const CHECKOUT_RECHECK_WINDOW_MS = 7 * DAY;
/** Minimum seconds between Razorpay reads per account. */
export const RECHECK_SECONDS = { checkout: 5, renewal: 600 } as const;

/** Seconds between re-reads for this record, or null when Razorpay has nothing we're waiting for. */
export function recheckInterval(record: SubscriptionRecord | null, now: number): number | null {
  if (!record) return null;
  if (record.status === "created") return now - record.updatedAt < CHECKOUT_RECHECK_WINDOW_MS ? RECHECK_SECONDS.checkout : null;
  if (record.status === "authenticated" || record.status === "pending" || record.status === "halted") return RECHECK_SECONDS.renewal;
  return null;
}

export interface ReconcileResult {
  record: SubscriptionRecord | null;
  /** True when this read moved the account from Free to Pro. */
  activated: boolean;
}

export async function reconcileSubscription(
  store: BillingStore,
  config: RazorpayConfig,
  owner: string,
  now: number,
  fetchImpl: typeof fetch = fetch,
): Promise<ReconcileResult> {
  const existing = await store.get(owner);
  const seconds = recheckInterval(existing, now);
  if (!existing || seconds === null || !(await store.claimRefresh(owner, seconds, now))) return { record: existing, activated: false };
  let fetched: Awaited<ReturnType<typeof fetchSubscription>>;
  try {
    fetched = await fetchSubscription(config, existing.subscriptionId, now, fetchImpl);
  } catch {
    return { record: existing, activated: false };
  }
  if (fetched.owner !== null && fetched.owner !== owner) return { record: existing, activated: false };
  const next = applySubscriptionEvent(existing, fetched.event, now);
  if (!next || (next.status === existing.status && next.currentEnd === existing.currentEnd)) return { record: existing, activated: false };
  await store.put(owner, next);
  return { record: next, activated: !hasProAccess(existing, now) && hasProAccess(next, now) };
}
