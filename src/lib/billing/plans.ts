import { billingStore } from "./kvBillingStore.ts";
import { planFromSubscription, type Plan } from "../workspace/entitlements.ts";

/** Server-side plan lookup for an account owner. Falls back to Free if billing storage is unreachable. */
export async function planFor(owner: string): Promise<Plan> {
  try {
    return planFromSubscription(await billingStore().get(owner), Date.now());
  } catch {
    return planFromSubscription(null, Date.now());
  }
}
