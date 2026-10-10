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
  /** The stored record changed. */
  changed?: boolean;
  /** Razorpay couldn't be read (or answered for another account); nothing was written. */
  failed?: boolean;
}

/** Re-reads one subscription from Razorpay and stores it if it moved. */
async function applyLatest(
  store: BillingStore,
  config: RazorpayConfig,
  owner: string,
  existing: SubscriptionRecord,
  now: number,
  fetchImpl: typeof fetch,
): Promise<ReconcileResult> {
  let fetched: Awaited<ReturnType<typeof fetchSubscription>>;
  try {
    fetched = await fetchSubscription(config, existing.subscriptionId, now, fetchImpl);
  } catch {
    return { record: existing, activated: false, failed: true };
  }
  if (fetched.owner !== null && fetched.owner !== owner) return { record: existing, activated: false, failed: true };
  const next = applySubscriptionEvent(existing, fetched.event, now);
  if (!next || (next.status === existing.status && next.currentEnd === existing.currentEnd)) return { record: existing, activated: false };
  await store.put(owner, next);
  return { record: next, activated: !hasProAccess(existing, now) && hasProAccess(next, now), changed: true };
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
  return applyLatest(store, config, owner, existing, now, fetchImpl);
}

/* ---------- Daily reconcile (cron) ---------- */

const HOUR = 3_600_000;
/** Razorpay charges renewals around the period end; give its webhook this long before re-reading. */
export const PERIOD_END_GRACE_MS = 6 * HOUR;

/**
 * Subscriptions where Razorpay should have moved on but we may have missed the
 * webhook: a paid period that ended without a renewal (a lost charged,
 * cancelled, or halted event would otherwise keep Pro on forever), failing or
 * paused renewals, and recent unconfirmed checkouts. Final states are skipped.
 */
export function dueForDailyCheck(record: SubscriptionRecord | null, now: number): boolean {
  if (!record) return false;
  switch (record.status) {
    case "created":
      return now - record.updatedAt < CHECKOUT_RECHECK_WINDOW_MS;
    case "pending":
    case "halted":
    case "paused":
      return true;
    case "authenticated":
    case "active":
      return record.currentEnd === null ? now - record.updatedAt > 24 * HOUR : now > record.currentEnd + PERIOD_END_GRACE_MS;
    default:
      return false;
  }
}

export interface DailyReconcileResult {
  owners: number;
  checked: number;
  updated: number;
  activated: number;
  failed: number;
  /** Owners not reached before the deadline (picked up by the next run). */
  remaining: number;
}

export async function reconcileDueSubscriptions(
  store: BillingStore,
  config: RazorpayConfig,
  now: number,
  { deadline = now + 10_000, concurrency = 5, fetchImpl = fetch, clock = Date.now }: { deadline?: number; concurrency?: number; fetchImpl?: typeof fetch; clock?: () => number } = {},
): Promise<DailyReconcileResult> {
  const owners = await store.owners();
  const result: DailyReconcileResult = { owners: owners.length, checked: 0, updated: 0, activated: 0, failed: 0, remaining: 0 };
  let next = 0;
  async function worker() {
    while (next < owners.length && clock() < deadline) {
      const owner = owners[next++];
      const record = await store.get(owner);
      if (!record || !dueForDailyCheck(record, now)) continue;
      result.checked++;
      const outcome = await applyLatest(store, config, owner, record, now, fetchImpl);
      if (outcome.failed) result.failed++;
      if (outcome.changed) result.updated++;
      if (outcome.activated) result.activated++;
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  result.remaining = owners.length - next;
  return result;
}
