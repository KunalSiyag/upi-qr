import { kv } from "@vercel/kv";
import { memoryBillingStore, type BillingStore } from "./store.ts";
import { parseSubscriptionRecord } from "./subscription.ts";
import { billingMode } from "./config.ts";

/**
 * Billing records in KV under `prefix`. Test-mode payments use their own prefix, so a
 * test purchase on a preview can never grant Pro where live billing runs, even when
 * Preview and Production share one database.
 */
export function kvBillingStore(prefix: string): BillingStore {
  const recordKey = (owner: string) => `${prefix}own:${owner}`;
  const subKey = (subscriptionId: string) => `${prefix}sub:${subscriptionId}`;
  const eventKey = (eventId: string) => `${prefix}evt:${eventId}`;
  const refreshKey = (owner: string) => `${prefix}chk:${owner}`;
  const ownersKey = `${prefix}owners`;
  const customerKey = (owner: string) => `${prefix}cust:${owner}`;
  const customerOwnerKey = (customerId: string) => `${prefix}custown:${customerId}`;
  return {
    async get(owner) { return parseSubscriptionRecord(await kv.get(recordKey(owner))); },
    async put(owner, record) {
      const pipe = kv.pipeline();
      pipe.set(recordKey(owner), JSON.stringify(record));
      pipe.sadd(ownersKey, owner);
      await pipe.exec();
    },
    async owners() { return ((await kv.smembers(ownersKey)) ?? []).filter((o): o is string => typeof o === "string"); },
    async customerFor(owner) {
      const id = await kv.get(customerKey(owner));
      return typeof id === "string" ? id : null;
    },
    async ownerForCustomer(customerId) {
      const owner = await kv.get(customerOwnerKey(customerId));
      return typeof owner === "string" ? owner : null;
    },
    async linkCustomer(owner, customerId) {
      const pipe = kv.pipeline();
      pipe.set(customerKey(owner), customerId);
      pipe.set(customerOwnerKey(customerId), owner);
      await pipe.exec();
    },
    async ownerFor(subscriptionId) {
      const owner = await kv.get(subKey(subscriptionId));
      return typeof owner === "string" ? owner : null;
    },
    async link(subscriptionId, owner) { await kv.set(subKey(subscriptionId), owner); },
    async seen(eventId) { return (await kv.get(eventKey(eventId))) !== null; },
    // Providers retry for about a day; keep ids for a week.
    async markSeen(eventId) { await kv.set(eventKey(eventId), "1", { ex: 7 * 24 * 60 * 60 }); },
    async claimRefresh(owner, seconds) { return (await kv.set(refreshKey(owner), "1", { nx: true, ex: seconds })) === "OK"; },
  };
}

/** Key prefixes: live billing keeps the original "bill:" keys. */
export const BILLING_PREFIX = { live: "bill:", test: "billtest:" } as const;

const devStore = memoryBillingStore();

export function billingStore(): BillingStore {
  const hasKv = Boolean(import.meta.env.KV_REST_API_URL || process.env.KV_REST_API_URL);
  return !hasKv && import.meta.env.DEV ? devStore : kvBillingStore(BILLING_PREFIX[billingMode()]);
}
