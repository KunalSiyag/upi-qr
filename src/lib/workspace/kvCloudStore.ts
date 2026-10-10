import { createHash } from "node:crypto";
import { kv } from "@vercel/kv";
import { memoryCloudStore, type CloudStore } from "./cloud.ts";
import { parseProjection, type DigestProjection } from "./digest.ts";

/**
 * Vercel KV (Upstash Redis) implementation of CloudStore. One JSON document
 * per account plus a revision counter; writes are compare-and-set in Lua.
 * Keys use a hash of the Clerk user ID, never the raw ID.
 */

export function workspaceOwner(clerkUserId: string): string {
  return createHash("sha256").update(`workspace:${clerkUserId}`).digest("hex").slice(0, 32);
}

const docKey = (owner: string) => `ws:doc:${owner}`;
const revKey = (owner: string) => `ws:rev:${owner}`;

export const kvCloudStore: CloudStore = {
  async read(owner) {
    const [doc, rev] = await kv.eval<string[], [unknown, unknown]>(
      "return { redis.call('GET', KEYS[1]), redis.call('GET', KEYS[2]) }",
      [docKey(owner), revKey(owner)],
      [],
    );
    return { doc: doc ?? null, rev: Number(rev) || 0 };
  },
  async write(owner, json, expectedRev) {
    const script = `
      local rev = tonumber(redis.call('GET', KEYS[2]) or '0')
      if rev ~= tonumber(ARGV[2]) then return -1 end
      redis.call('SET', KEYS[1], ARGV[1])
      redis.call('SET', KEYS[2], rev + 1)
      return rev + 1
    `;
    const next = Number(await kv.eval<string[], number>(script, [docKey(owner), revKey(owner)], [json, String(expectedRev)]));
    return next > 0 ? next : null;
  },
  async remove(owner) {
    await kv.del(docKey(owner), revKey(owner));
  },
};

const devStore = memoryCloudStore();

/** KV in production; an in-memory store only for local development without KV credentials. */
export function cloudStore(): CloudStore {
  const hasKv = Boolean(import.meta.env.KV_REST_API_URL || process.env.KV_REST_API_URL);
  return !hasKv && import.meta.env.DEV ? devStore : kvCloudStore;
}

/** Rate limits need KV; skip them only in local development without it. */
export function rateLimitsAvailable(): boolean {
  return Boolean(import.meta.env.KV_REST_API_URL || process.env.KV_REST_API_URL) || !import.meta.env.DEV;
}

/** Compact per-account digest input, written at each sync (see digestProjection). */
export interface ProjectionStore {
  get(owner: string): Promise<DigestProjection | null>;
  put(owner: string, projection: DigestProjection): Promise<void>;
}

const projectionKey = (owner: string) => `ws:proj:${owner}`;

export const kvProjectionStore: ProjectionStore = {
  async get(owner) { return parseProjection(await kv.get(projectionKey(owner))); },
  async put(owner, projection) { await kv.set(projectionKey(owner), JSON.stringify(projection)); },
};

export function memoryProjectionStore(): ProjectionStore {
  const map = new Map<string, string>();
  return {
    async get(owner) { return parseProjection(map.get(owner) ?? null); },
    async put(owner, projection) { map.set(owner, JSON.stringify(projection)); },
  };
}

const devProjections = memoryProjectionStore();

export function projectionStore(): ProjectionStore {
  const hasKv = Boolean(import.meta.env.KV_REST_API_URL || process.env.KV_REST_API_URL);
  return !hasKv && import.meta.env.DEV ? devProjections : kvProjectionStore;
}
