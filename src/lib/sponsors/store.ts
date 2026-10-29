import { UNPAID_TTL_SECONDS, type Booking, type LogoType } from "./core.ts";

/** Sponsor bookings, their logos, Dodo id → booking lookups, and webhook de-duplication. */
export interface SponsorStore {
  get(id: string): Promise<Booking | null>;
  /** Unpaid bookings (status "checkout") expire after a day, with their logo. */
  put(booking: Booking): Promise<void>;
  all(): Promise<Booking[]>;
  putLogo(id: string, type: LogoType, bytes: Buffer, expires: boolean): Promise<void>;
  getLogo(id: string): Promise<{ type: LogoType; bytes: Buffer } | null>;
  /** Dodo checkout session, payment or subscription id → booking id. */
  bookingFor(dodoId: string): Promise<string | null>;
  link(dodoId: string, bookingId: string): Promise<void>;
  seen(eventId: string): Promise<boolean>;
  markSeen(eventId: string): Promise<void>;
  /** True at most once per `seconds` per booking: throttles re-reading a checkout from Dodo. */
  claimRefresh(id: string, seconds: number, now: number): Promise<boolean>;
  /** A short-lived lock (expires by itself after `seconds`): every booking change runs under one. */
  lock(token: string, seconds: number, now: number): Promise<boolean>;
  unlock(token: string): Promise<void>;
}

export const LOGO_TYPES: LogoType[] = ["image/png", "image/jpeg", "image/webp"];

export function parseBooking(raw: unknown): Booking | null {
  const value = typeof raw === "string" ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw;
  if (!value || typeof value !== "object" || typeof (value as Booking).id !== "string") return null;
  const b = value as Booking;
  return { ...b, refundsOwed: Array.isArray(b.refundsOwed) ? b.refundsOwed : [], cancelOwed: b.cancelOwed ?? null, closedAt: b.closedAt ?? null };
}

export function memorySponsorStore(): SponsorStore {
  const bookings = new Map<string, string>();
  const logos = new Map<string, { type: LogoType; bytes: Buffer }>();
  const links = new Map<string, string>();
  const events = new Set<string>();
  const refreshUntil = new Map<string, number>();
  const locks = new Map<string, number>();
  return {
    async get(id) { return parseBooking(bookings.get(id) ?? null); },
    async put(booking) { bookings.set(booking.id, JSON.stringify(booking)); },
    async all() { return [...bookings.values()].map(parseBooking).filter((b): b is Booking => b !== null); },
    async putLogo(id, type, bytes) { logos.set(id, { type, bytes }); },
    async getLogo(id) { return logos.get(id) ?? null; },
    async bookingFor(dodoId) { return links.get(dodoId) ?? null; },
    async link(dodoId, bookingId) { links.set(dodoId, bookingId); },
    async seen(eventId) { return events.has(eventId); },
    async markSeen(eventId) { events.add(eventId); },
    async claimRefresh(id, seconds, now) {
      if ((refreshUntil.get(id) ?? 0) > now) return false;
      refreshUntil.set(id, now + seconds * 1000);
      return true;
    },
    async lock(token, seconds, now) {
      if ((locks.get("lock") ?? 0) > now) return false;
      locks.set("lock", now + seconds * 1000);
      locks.set(`token:${token}`, 1);
      return true;
    },
    async unlock(token) {
      if (locks.has(`token:${token}`)) { locks.delete("lock"); locks.delete(`token:${token}`); }
    },
  };
}

export { UNPAID_TTL_SECONDS };
