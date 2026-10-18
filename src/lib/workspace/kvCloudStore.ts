import { createHash } from "node:crypto";
import { kv } from "@vercel/kv";
import { memoryCloudStore, type CloudStore } from "./cloud.ts";
import { memoryProjectionStore, parseProjection, projectionsFrom, type ProjectionStore } from "./digest.ts";
import { PRIMARY_BOOK_ID } from "./books.ts";

export type { ProjectionStore } from "./digest.ts";

/**
 * Vercel KV (Upstash Redis) implementation of CloudStore. One JSON document
 * per account plus a revision counter; writes are compare-and-set in Lua.
 * Keys use a hash of the Clerk user ID, never the raw ID.
 */

export function workspaceOwner(clerkUserId: string): string {
  return createHash("sha256").update(`workspace:${clerkUserId}`).digest("hex").slice(0, 32);
}

/**
 * One CAS document store per key family. The Lua is today's text byte for
 * byte, so scripts/e2e/fake-upstash.mjs (which matches scripts by text) needs no change.
 */
function kvDocStore(docPrefix: string, revPrefix: string): CloudStore {
  const docKey = (slot: string) => `${docPrefix}${slot}`;
  const revKey = (slot: string) => `${revPrefix}${slot}`;
  return {
    async read(slot) {
      const [doc, rev] = await kv.eval<string[], [unknown, unknown]>(
        "return { redis.call('GET', KEYS[1]), redis.call('GET', KEYS[2]) }",
        [docKey(slot), revKey(slot)],
        [],
      );
      return { doc: doc ?? null, rev: Number(rev) || 0 };
    },
    async write(slot, json, expectedRev) {
      const script = `
      local rev = tonumber(redis.call('GET', KEYS[2]) or '0')
      if rev ~= tonumber(ARGV[2]) then return -1 end
      redis.call('SET', KEYS[1], ARGV[1])
      redis.call('SET', KEYS[2], rev + 1)
      return rev + 1
    `;
      const next = Number(await kv.eval<string[], number>(script, [docKey(slot), revKey(slot)], [json, String(expectedRev)]));
      return next > 0 ? next : null;
    },
    async removeDocs(slots) {
      if (!slots.length) return;
      const pipe = kv.pipeline();
      pipe.del(...slots.map(docKey));
      for (const slot of slots) pipe.incr(revKey(slot));
      await pipe.exec();
    },
    async revs(slots) {
      if (!slots.length) return [];
      const values = await kv.mget<unknown[]>(...slots.map(revKey));
      return slots.map((_, i) => Number(values?.[i]) || 0);
    },
  };
}

/** Books: ws:doc:<owner> (primary, unchanged) and ws:doc:<owner>:<bizId>, with ws:rev:… counters. */
export const kvCloudStore: CloudStore = kvDocStore("ws:doc:", "ws:rev:");
/** Book index per account: ws:books:<owner> + ws:booksrev:<owner>. */
export const kvBookIndexStore: CloudStore = kvDocStore("ws:books:", "ws:booksrev:");

const devStore = memoryCloudStore();
const devBookIndex = memoryCloudStore();

/** KV in production; an in-memory store only for local development without KV credentials. */
export function cloudStore(): CloudStore {
  const hasKv = Boolean(import.meta.env.KV_REST_API_URL || process.env.KV_REST_API_URL);
  return !hasKv && import.meta.env.DEV ? devStore : kvCloudStore;
}

/** The book index store; in-memory only for local development without KV credentials. */
export function bookIndexStore(): CloudStore {
  const hasKv = Boolean(import.meta.env.KV_REST_API_URL || process.env.KV_REST_API_URL);
  return !hasKv && import.meta.env.DEV ? devBookIndex : kvBookIndexStore;
}

/** Rate limits need KV; skip them only in local development without it. */
export function rateLimitsAvailable(): boolean {
  return Boolean(import.meta.env.KV_REST_API_URL || process.env.KV_REST_API_URL) || !import.meta.env.DEV;
}

const projectionKey = (owner: string) => `ws:proj:${owner}`;
const bookProjectionKey = (owner: string) => `ws:projb:${owner}`;
const indexKey = (owner: string) => `ws:books:${owner}`;

/**
 * Digest projections. The primary book keeps its v1 projection at ws:proj:<owner>
 * (unchanged, so single-business accounts and a rolled-back server see the same
 * key); other books live as v2 fields of the hash ws:projb:<owner>.
 */
export const kvProjectionStore: ProjectionStore = {
  async get(owner) { return parseProjection(await kv.get(projectionKey(owner))); },
  async put(owner, bookId, projection) {
    if (bookId === PRIMARY_BOOK_ID) await kv.set(projectionKey(owner), JSON.stringify(projection));
    else await kv.hset(bookProjectionKey(owner), { [bookId]: JSON.stringify(projection) });
  },
  async drop(owner, bookId) {
    // The primary's projection stays until PR 6 changes "Delete cloud copy" for everyone.
    if (bookId !== PRIMARY_BOOK_ID) await kv.hdel(bookProjectionKey(owner), bookId);
  },
  async bookIds(owner) {
    return Object.keys((await kv.hgetall<Record<string, unknown>>(bookProjectionKey(owner))) ?? {});
  },
  async getAll(owner) {
    // One request per account, as before: legacy primary key + book hash + index.
    const pipe = kv.pipeline();
    pipe.get(projectionKey(owner));
    pipe.hgetall(bookProjectionKey(owner));
    pipe.get(indexKey(owner));
    const [primary, hash, index] = await pipe.exec<[unknown, Record<string, unknown> | null, unknown]>();
    return projectionsFrom(primary, hash, index);
  },
};

const devProjections = memoryProjectionStore();

export function projectionStore(): ProjectionStore {
  const hasKv = Boolean(import.meta.env.KV_REST_API_URL || process.env.KV_REST_API_URL);
  return !hasKv && import.meta.env.DEV ? devProjections : kvProjectionStore;
}
