import { FREE_ACTIVE_PAYLINKS } from "./paylinks.ts";
import { hasProAccess, inTrial, type SubscriptionRecord } from "../billing/subscription.ts";

/**
 * Plan limits per account owner. Keep every plan check behind this module so
 * pricing changes touch one place.
 */
export type PlanId = "free" | "pro";

export interface Plan {
  id: PlanId;
  activePaylinks: number;
  /** Pro pay pages drop the "send your own pay links" line. */
  brandedPayPage: boolean;
  /** One link per client listing all their dues. */
  statementLinks: boolean;
  /** MSME mode: Section 16 interest on overdue invoices and the MSMED rights line in reminders. */
  msmeTools: boolean;
  /** Businesses (books) one account may keep. Read it through businessesFor() for a subscription. */
  businesses: number;
}

/** Businesses per account. The only place these numbers live: read them through PLANS or businessesFor(). */
export const FREE_BUSINESSES = 1;
export const PRO_BUSINESSES = 20;

export const PLANS: Record<PlanId, Plan> = {
  free: { id: "free", activePaylinks: FREE_ACTIVE_PAYLINKS, brandedPayPage: true, statementLinks: false, msmeTools: false, businesses: FREE_BUSINESSES },
  pro: { id: "pro", activePaylinks: 10_000, brandedPayPage: false, statementLinks: true, msmeTools: true, businesses: PRO_BUSINESSES },
};

/**
 * The business limit for a subscription. Only paid Pro unlocks more than one
 * business: an account in its free trial (no payment taken yet) keeps
 * PLANS.free.businesses, while every other Pro benefit applies during the trial.
 */
export function businessesFor(record: SubscriptionRecord | null, now: number = Date.now()): number {
  if (!hasProAccess(record, now) || inTrial(record, now) || firstChargeMissing(record)) return PLANS.free.businesses;
  return PLANS.pro.businesses;
}

const DAY_MS = 86_400_000;

/**
 * A trial whose first charge hasn't gone through: the provider reports it as pending
 * (Dodo on_hold/past_due) and billing keeps Pro for a grace period, but nothing was paid.
 * A successful first charge moves currentEnd a whole cycle past trialEndsAt, so failed
 * renewals of genuinely paid accounts don't match.
 */
function firstChargeMissing(record: SubscriptionRecord | null): boolean {
  if (!record?.trialEndsAt || record.status !== "pending") return false;
  return record.currentEnd === null || record.currentEnd <= record.trialEndsAt + DAY_MS;
}

export function planFromSubscription(record: SubscriptionRecord | null, now: number): Plan {
  if (!hasProAccess(record, now)) return PLANS.free;
  const businesses = businessesFor(record, now);
  return businesses === PLANS.pro.businesses ? PLANS.pro : { ...PLANS.pro, businesses };
}
