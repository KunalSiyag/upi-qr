import { applySubscriptionEvent, hasProAccess, type SubscriptionRecord } from "./subscription.ts";
import { providerFor, type BillingProvider, type BillingProviders } from "./provider.ts";
import type { BillingStore } from "./store.ts";

/**
 * Webhooks drive billing state, but a delivery can be lost for good: a webhook
 * URL without the trailing slash (redirects count as failures), a test/live
 * secret mix-up, a protected preview deployment, or an outage that outlasts
 * the provider's retries. While an account is waiting on the provider, re-read
 * its subscription so a customer who paid is never left on Free, and a fixed
 * renewal comes back without waiting for the next webhook.
 */

const DAY = 86_400_000;
/** Unconfirmed checkouts are re-checked for a week, then treated as abandoned. */
export const CHECKOUT_RECHECK_WINDOW_MS = 7 * DAY;
/** Minimum seconds between provider reads per account. */
export const RECHECK_SECONDS = { checkout: 5, renewal: 600 } as const;

/** Seconds between re-reads for this record, or null when the provider has nothing we're waiting for. */
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
  /** The provider couldn't be read (or answered for another account); nothing was written. */
  failed?: boolean;
}

/** Re-reads one subscription from its provider and stores it if it moved. */
async function applyLatest(store: BillingStore, provider: BillingProvider, owner: string, existing: SubscriptionRecord, now: number): Promise<ReconcileResult> {
  let fetched: Awaited<ReturnType<BillingProvider["fetch"]>>;
  try {
    // An unconfirmed checkout may be a free trial with no payment: let the provider look it up by customer.
    const hint = existing.status === "created" ? { customerId: await store.customerFor(owner), since: existing.updatedAt } : undefined;
    fetched = await provider.fetch(existing.subscriptionId, now, hint);
  } catch {
    return { record: existing, activated: false, failed: true };
  }
  // The subscription must belong to this account: our owner tag, or else the customer we created for it.
  const foreign = fetched.owner !== null
    ? fetched.owner !== owner
    : Boolean(fetched.customerId) && (await store.customerFor(owner)) !== fetched.customerId;
  if (foreign) return { record: existing, activated: false, failed: true };
  const next = applySubscriptionEvent(existing, fetched.event, now);
  if (!next || (next.subscriptionId === existing.subscriptionId && next.status === existing.status && next.currentEnd === existing.currentEnd && next.cancelAtCycleEnd === existing.cancelAtCycleEnd && (next.trialEndsAt ?? null) === (existing.trialEndsAt ?? null))) {
    return { record: existing, activated: false };
  }
  await store.put(owner, next);
  // A checkout id (Dodo cks_…) resolved to the real subscription: let its webhooks find this account.
  if (next.subscriptionId !== existing.subscriptionId) await store.link(next.subscriptionId, owner);
  return { record: next, activated: !hasProAccess(existing, now) && hasProAccess(next, now), changed: true };
}

export async function reconcileSubscription(store: BillingStore, providers: BillingProviders, owner: string, now: number): Promise<ReconcileResult> {
  const existing = await store.get(owner);
  const seconds = recheckInterval(existing, now);
  const provider = providerFor(existing, providers);
  if (!existing || !provider || seconds === null || !(await store.claimRefresh(owner, seconds, now))) return { record: existing, activated: false };
  return applyLatest(store, provider, owner, existing, now);
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
  providers: BillingProviders,
  now: number,
  { deadline = now + 10_000, concurrency = 5, clock = Date.now }: { deadline?: number; concurrency?: number; clock?: () => number } = {},
): Promise<DailyReconcileResult> {
  const owners = await store.owners();
  const result: DailyReconcileResult = { owners: owners.length, checked: 0, updated: 0, activated: 0, failed: 0, remaining: 0 };
  let next = 0;
  async function worker() {
    while (next < owners.length && clock() < deadline) {
      const owner = owners[next++];
      const record = await store.get(owner);
      const provider = providerFor(record, providers);
      if (!record || !provider || !dueForDailyCheck(record, now)) continue;
      result.checked++;
      const outcome = await applyLatest(store, provider, owner, record, now);
      if (outcome.failed) result.failed++;
      if (outcome.changed) result.updated++;
      if (outcome.activated) result.activated++;
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  result.remaining = owners.length - next;
  return result;
}
