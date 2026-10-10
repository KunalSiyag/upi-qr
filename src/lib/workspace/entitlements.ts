import { FREE_ACTIVE_PAYLINKS } from "./paylinks.ts";
import { hasProAccess, type SubscriptionRecord } from "../billing/subscription.ts";

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
}

export const PLANS: Record<PlanId, Plan> = {
  free: { id: "free", activePaylinks: FREE_ACTIVE_PAYLINKS, brandedPayPage: true, statementLinks: false },
  pro: { id: "pro", activePaylinks: 10_000, brandedPayPage: false, statementLinks: true },
};

export function planFromSubscription(record: SubscriptionRecord | null, now: number): Plan {
  return hasProAccess(record, now) ? PLANS.pro : PLANS.free;
}
