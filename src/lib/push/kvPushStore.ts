import { createHash } from "node:crypto";
import { kv } from "@vercel/kv";
import { MAX_DEVICES_PER_ACCOUNT, memoryPushStore, parseStoredSubscription, type PushStore } from "./store.ts";

const subsKey = (owner: string) => `push:subs:${owner}`;
const OWNERS = "push:owners";
const field = (endpoint: string) => createHash("sha256").update(endpoint).digest("hex").slice(0, 32);

export const kvPushStore: PushStore = {
  async add(owner, subscription) {
    const existing = await kvPushStore.list(owner);
    const pipe = kv.pipeline();
    // Keep the newest devices only.
    const keep = [...existing.filter((s) => s.endpoint !== subscription.endpoint), subscription].slice(-MAX_DEVICES_PER_ACCOUNT);
    for (const old of existing) if (!keep.some((k) => k.endpoint === old.endpoint)) pipe.hdel(subsKey(owner), field(old.endpoint));
    pipe.hset(subsKey(owner), { [field(subscription.endpoint)]: JSON.stringify(subscription) });
    pipe.sadd(OWNERS, owner);
    await pipe.exec();
  },
  async remove(owner, endpoint) {
    // Match on the stored endpoint, not a recomputed field name, so any entry can be pruned.
    const all = (await kv.hgetall<Record<string, unknown>>(subsKey(owner))) ?? {};
    const fields = Object.entries(all).filter(([, value]) => parseStoredSubscription(value)?.endpoint === endpoint).map(([name]) => name);
    if (fields.length) await kv.hdel(subsKey(owner), ...fields);
    if (Object.keys(all).length - fields.length <= 0) await kvPushStore.forget(owner);
  },
  async list(owner) {
    const all = (await kv.hgetall<Record<string, unknown>>(subsKey(owner))) ?? {};
    return Object.values(all).map(parseStoredSubscription).filter((s): s is NonNullable<typeof s> => s !== null).sort((a, b) => a.createdAt - b.createdAt);
  },
  async owners() {
    const members = await kv.smembers(OWNERS);
    return (members as unknown[]).filter((m): m is string => typeof m === "string");
  },
  async forget(owner) {
    const pipe = kv.pipeline();
    pipe.del(subsKey(owner));
    pipe.srem(OWNERS, owner);
    await pipe.exec();
  },
  async markDigest(owner, day) {
    return (await kv.set(`push:digest:${owner}:${day}`, "1", { nx: true, ex: 2 * 24 * 60 * 60 })) !== null;
  },
};

const devStore = memoryPushStore();

export function pushStore(): PushStore {
  const hasKv = Boolean(import.meta.env.KV_REST_API_URL || process.env.KV_REST_API_URL);
  return !hasKv && import.meta.env.DEV ? devStore : kvPushStore;
}
