import { parseSubscriptionRecord, type SubscriptionRecord } from "./subscription.ts";

/** Billing persistence: per-owner subscription record, subscription → owner index, webhook de-duplication. */
export interface BillingStore {
  get(owner: string): Promise<SubscriptionRecord | null>;
  put(owner: string, record: SubscriptionRecord): Promise<void>;
  ownerFor(subscriptionId: string): Promise<string | null>;
  link(subscriptionId: string, owner: string): Promise<void>;
  seen(eventId: string): Promise<boolean>;
  markSeen(eventId: string): Promise<void>;
  /** True at most once per `seconds` per owner: throttles re-reading a subscription from Razorpay. */
  claimRefresh(owner: string, seconds: number, now: number): Promise<boolean>;
  /** Every owner that has ever had a subscription record (for the daily reconcile). */
  owners(): Promise<string[]>;
  /** The account's customer at the payment provider (Dodo: one per account), both ways. */
  customerFor(owner: string): Promise<string | null>;
  ownerForCustomer(customerId: string): Promise<string | null>;
  linkCustomer(owner: string, customerId: string): Promise<void>;
}

export function memoryBillingStore(): BillingStore {
  const records = new Map<string, string>();
  const owners = new Map<string, string>();
  const events = new Set<string>();
  const refreshUntil = new Map<string, number>();
  const customers = new Map<string, string>();
  const customerOwners = new Map<string, string>();
  return {
    async get(owner) { return parseSubscriptionRecord(records.get(owner) ?? null); },
    async put(owner, record) { records.set(owner, JSON.stringify(record)); },
    async owners() { return [...records.keys()]; },
    async customerFor(owner) { return customers.get(owner) ?? null; },
    async ownerForCustomer(customerId) { return customerOwners.get(customerId) ?? null; },
    async linkCustomer(owner, customerId) { customers.set(owner, customerId); customerOwners.set(customerId, owner); },
    async ownerFor(subscriptionId) { return owners.get(subscriptionId) ?? null; },
    async link(subscriptionId, owner) { owners.set(subscriptionId, owner); },
    async seen(eventId) { return events.has(eventId); },
    async markSeen(eventId) { events.add(eventId); },
    async claimRefresh(owner, seconds, now) {
      if ((refreshUntil.get(owner) ?? 0) > now) return false;
      refreshUntil.set(owner, now + seconds * 1000);
      return true;
    },
  };
}
