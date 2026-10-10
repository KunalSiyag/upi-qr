import { randomBytes } from "node:crypto";
import { kv } from "@vercel/kv";
import { MAX_PENDING_CLAIMS, memoryPaylinkStore, parseClaims, parseRecord, parseSnapshot, type PaylinkStore } from "./paylinks.ts";

/** Vercel KV implementation of PaylinkStore. */

const tokenKey = (token: string) => `pl:tok:${token}`;
const ownerKey = (owner: string) => `pl:own:${owner}`;
const claimsKey = (token: string) => `pl:claims:${token}`;
const viewsKey = (owner: string) => `pl:views:${owner}`;

export function newPaylinkToken(): string {
  return randomBytes(16).toString("base64url");
}

export const kvPaylinkStore: PaylinkStore = {
  async getView(owner, token) {
    return parseSnapshot(await kv.hget(viewsKey(owner), token));
  },
  async putViews(owner, views) {
    const pipe = kv.pipeline();
    pipe.del(viewsKey(owner));
    const entries = Object.entries(views);
    if (entries.length) pipe.hset(viewsKey(owner), Object.fromEntries(entries.map(([token, view]) => [token, JSON.stringify(view)])));
    await pipe.exec();
  },
  async get(token) {
    return parseRecord(await kv.get(tokenKey(token)));
  },
  async tokenFor(owner, invoiceId) {
    const token = await kv.hget<string>(ownerKey(owner), invoiceId);
    return typeof token === "string" ? token : null;
  },
  async list(owner) {
    const all = (await kv.hgetall<Record<string, string>>(ownerKey(owner))) ?? {};
    return Object.fromEntries(Object.entries(all).filter(([, token]) => typeof token === "string"));
  },
  async put(token, record) {
    const pipe = kv.pipeline();
    pipe.set(tokenKey(token), JSON.stringify(record));
    pipe.hset(ownerKey(record.owner), { [record.invoiceId]: token });
    await pipe.exec();
  },
  async remove(owner, token, invoiceId) {
    const pipe = kv.pipeline();
    pipe.del(tokenKey(token), claimsKey(token));
    pipe.hdel(ownerKey(owner), invoiceId);
    await pipe.exec();
  },
  async claims(token) {
    return parseClaims(await kv.lrange(claimsKey(token), 0, MAX_PENDING_CLAIMS - 1));
  },
  async addClaim(token, claim) {
    const pipe = kv.pipeline();
    pipe.lpush(claimsKey(token), JSON.stringify(claim));
    pipe.ltrim(claimsKey(token), 0, MAX_PENDING_CLAIMS - 1);
    await pipe.exec();
  },
  async clearClaims(token) {
    await kv.del(claimsKey(token));
  },
};

const devPaylinks = memoryPaylinkStore();

/** In-memory store only for local development without KV credentials. */
export function paylinkStore(): PaylinkStore {
  const hasKv = Boolean(import.meta.env.KV_REST_API_URL || process.env.KV_REST_API_URL);
  return !hasKv && import.meta.env.DEV ? devPaylinks : kvPaylinkStore;
}
