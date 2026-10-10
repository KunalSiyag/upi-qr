import type { PushSubscriptionKeys } from "./webpush.ts";

export const MAX_DEVICES_PER_ACCOUNT = 5;

export interface StoredSubscription extends PushSubscriptionKeys {
  createdAt: number;
}

export interface PushStore {
  add(owner: string, subscription: StoredSubscription): Promise<void>;
  remove(owner: string, endpoint: string): Promise<void>;
  list(owner: string): Promise<StoredSubscription[]>;
  owners(): Promise<string[]>;
  forget(owner: string): Promise<void>;
  /** True the first time it is called for an owner on a given day (cron retries can't double-send). */
  markDigest(owner: string, day: string): Promise<boolean>;
}

export function parseStoredSubscription(raw: unknown): StoredSubscription | null {
  const value = typeof raw === "string" ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw;
  if (!value || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  const keys = r.keys as Record<string, unknown> | undefined;
  if (typeof r.endpoint !== "string" || !keys || typeof keys.p256dh !== "string" || typeof keys.auth !== "string") return null;
  return { endpoint: r.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth }, createdAt: typeof r.createdAt === "number" ? r.createdAt : 0 };
}

export function memoryPushStore(): PushStore {
  const subs = new Map<string, StoredSubscription[]>();
  const sent = new Set<string>();
  return {
    async add(owner, subscription) {
      const list = (subs.get(owner) ?? []).filter((s) => s.endpoint !== subscription.endpoint);
      list.push(subscription);
      subs.set(owner, list.slice(-MAX_DEVICES_PER_ACCOUNT));
    },
    async remove(owner, endpoint) {
      const list = (subs.get(owner) ?? []).filter((s) => s.endpoint !== endpoint);
      if (list.length) subs.set(owner, list); else subs.delete(owner);
    },
    async list(owner) { return [...(subs.get(owner) ?? [])]; },
    async owners() { return [...subs.keys()]; },
    async forget(owner) { subs.delete(owner); },
    async markDigest(owner, day) {
      const key = `${owner}:${day}`;
      if (sent.has(key)) return false;
      sent.add(key);
      return true;
    },
  };
}
