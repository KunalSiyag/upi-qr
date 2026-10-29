import { kv } from "@vercel/kv";
import { billingMode } from "../billing/config.ts";
import { UNPAID_TTL_SECONDS, type Booking } from "./core.ts";
import { LOGO_TYPES, memorySponsorStore, parseBooking, type SponsorStore } from "./store.ts";

/**
 * Sponsor bookings in KV under `prefix`. Test-mode payments use their own prefix (like billing), so a test booking
 * on a preview never shows on the live homepage, even though Preview and Production share one database.
 */
export function kvSponsorStore(prefix: string): SponsorStore {
  const bookingKey = (id: string) => `${prefix}b:${id}`;
  const logoKey = (id: string) => `${prefix}logo:${id}`;
  const linkKey = (dodoId: string) => `${prefix}id:${dodoId}`;
  const idsKey = `${prefix}ids`;
  return {
    async get(id) { return parseBooking(await kv.get(bookingKey(id))); },
    async put(booking) {
      const pipe = kv.pipeline();
      if (booking.status === "checkout") pipe.set(bookingKey(booking.id), JSON.stringify(booking), { ex: UNPAID_TTL_SECONDS });
      else pipe.set(bookingKey(booking.id), JSON.stringify(booking));
      pipe.sadd(idsKey, booking.id);
      await pipe.exec();
    },
    async all() {
      const ids = ((await kv.smembers(idsKey)) ?? []).filter((id): id is string => typeof id === "string");
      if (ids.length === 0) return [];
      const values = await kv.mget<unknown[]>(...ids.map(bookingKey));
      const gone = ids.filter((_, i) => values[i] === null || values[i] === undefined);
      // Unpaid bookings expire on their own; drop them from the index as we notice.
      if (gone.length) await kv.srem(idsKey, ...gone);
      return values.map(parseBooking).filter((b): b is Booking => b !== null);
    },
    async putLogo(id, type, bytes, expires) {
      const value = JSON.stringify({ type, data: bytes.toString("base64") });
      if (expires) await kv.set(logoKey(id), value, { ex: UNPAID_TTL_SECONDS });
      else await kv.set(logoKey(id), value);
    },
    async getLogo(id) {
      const raw = await kv.get(logoKey(id));
      const value = typeof raw === "string" ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw;
      if (!value || typeof value !== "object") return null;
      const { type, data } = value as { type?: unknown; data?: unknown };
      if (typeof type !== "string" || !LOGO_TYPES.includes(type as never) || typeof data !== "string") return null;
      return { type: type as (typeof LOGO_TYPES)[number], bytes: Buffer.from(data, "base64") };
    },
    async bookingFor(dodoId) {
      const id = await kv.get(linkKey(dodoId));
      return typeof id === "string" ? id : null;
    },
    async link(dodoId, bookingId) { await kv.set(linkKey(dodoId), bookingId); },
    async seen(eventId) { return (await kv.get(`${prefix}evt:${eventId}`)) !== null; },
    async markSeen(eventId) { await kv.set(`${prefix}evt:${eventId}`, "1", { ex: 7 * 24 * 60 * 60 }); },
    async claimRefresh(id, seconds) { return (await kv.set(`${prefix}chk:${id}`, "1", { nx: true, ex: seconds })) === "OK"; },
    async lock(token, seconds) { return (await kv.set(`${prefix}lock`, token, { nx: true, ex: seconds })) === "OK"; },
    async unlock(token) {
      // Only the holder releases it (a lock that expired and was taken by someone else stays theirs).
      await kv.eval("if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0", [`${prefix}lock`], [token]);
    },
  };
}

/** Live bookings use "spon:", test-mode ones "spontest:". */
export const SPONSOR_PREFIX = { live: "spon:", test: "spontest:" } as const;

const devStore = memorySponsorStore();

export function sponsorStore(): SponsorStore {
  const hasKv = Boolean(import.meta.env.KV_REST_API_URL || process.env.KV_REST_API_URL);
  return !hasKv && import.meta.env.DEV ? devStore : kvSponsorStore(SPONSOR_PREFIX[billingMode()]);
}
