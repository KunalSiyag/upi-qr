import { billingStore } from "./kvBillingStore.ts";
import type { BillingStore } from "./store.ts";
import { planFromSubscription, type Plan } from "../workspace/entitlements.ts";

/**
 * Server-side plan lookup that rethrows billing-store errors. Use it where a
 * KV blip must not read as Free (business limits): callers answer 503 instead.
 */
export async function planForStrict(owner: string, store: Pick<BillingStore, "get"> = billingStore(), now: number = Date.now()): Promise<Plan> {
  return planFromSubscription(await store.get(owner), now);
}

/** Server-side plan lookup for an account owner. Falls back to Free if billing storage is unreachable. */
export async function planFor(owner: string, store?: Pick<BillingStore, "get">, now: number = Date.now()): Promise<Plan> {
  try {
    return await planForStrict(owner, store, now);
  } catch {
    return planFromSubscription(null, now);
  }
}
