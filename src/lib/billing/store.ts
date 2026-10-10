import { parseSubscriptionRecord, type SubscriptionRecord } from "./subscription.ts";

/** Billing persistence: per-owner subscription record, subscription → owner index, webhook de-duplication. */
export interface BillingStore {
  get(owner: string): Promise<SubscriptionRecord | null>;
  put(owner: string, record: SubscriptionRecord): Promise<void>;
  ownerFor(subscriptionId: string): Promise<string | null>;
  link(subscriptionId: string, owner: string): Promise<void>;
  seen(eventId: string): Promise<boolean>;
  markSeen(eventId: string): Promise<void>;
}

export function memoryBillingStore(): BillingStore {
  const records = new Map<string, string>();
  const owners = new Map<string, string>();
  const events = new Set<string>();
  return {
    async get(owner) { return parseSubscriptionRecord(records.get(owner) ?? null); },
    async put(owner, record) { records.set(owner, JSON.stringify(record)); },
    async ownerFor(subscriptionId) { return owners.get(subscriptionId) ?? null; },
    async link(subscriptionId, owner) { owners.set(subscriptionId, owner); },
    async seen(eventId) { return events.has(eventId); },
    async markSeen(eventId) { events.add(eventId); },
  };
}
