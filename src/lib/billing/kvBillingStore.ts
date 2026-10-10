import { kv } from "@vercel/kv";
import { memoryBillingStore, type BillingStore } from "./store.ts";
import { parseSubscriptionRecord } from "./subscription.ts";

const recordKey = (owner: string) => `bill:own:${owner}`;
const subKey = (subscriptionId: string) => `bill:sub:${subscriptionId}`;
const eventKey = (eventId: string) => `bill:evt:${eventId}`;

export const kvBillingStore: BillingStore = {
  async get(owner) { return parseSubscriptionRecord(await kv.get(recordKey(owner))); },
  async put(owner, record) { await kv.set(recordKey(owner), JSON.stringify(record)); },
  async ownerFor(subscriptionId) {
    const owner = await kv.get(subKey(subscriptionId));
    return typeof owner === "string" ? owner : null;
  },
  async link(subscriptionId, owner) { await kv.set(subKey(subscriptionId), owner); },
  async seen(eventId) { return (await kv.get(eventKey(eventId))) !== null; },
  // Razorpay retries for about a day; keep ids for a week.
  async markSeen(eventId) { await kv.set(eventKey(eventId), "1", { ex: 7 * 24 * 60 * 60 }); },
};

const devStore = memoryBillingStore();

export function billingStore(): BillingStore {
  const hasKv = Boolean(import.meta.env.KV_REST_API_URL || process.env.KV_REST_API_URL);
  return !hasKv && import.meta.env.DEV ? devStore : kvBillingStore;
}
