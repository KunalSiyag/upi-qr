import { randomBytes } from "node:crypto";
import { verifyStandardWebhook } from "../billing/dodo.ts";
import {
  applySponsorEvent,
  BOOKING_ID,
  decide,
  featuredFree,
  newBooking,
  newBookingId,
  parseSponsorWebhook,
  tilesPaid,
  type Booking,
  type BookingInput,
  type SponsorEvent,
} from "./core.ts";
import { cancelSponsorSubscription, createSponsorCheckout, fetchSponsorPayment, refundSponsorPayment, type SponsorDodoConfig } from "./dodo.ts";
import type { SponsorStore } from "./store.ts";
import { SPONSOR_TIERS } from "../../data/sponsors.ts";

/**
 * Booking flows on top of the store and Dodo; every route calls these (Node-testable with a memory store).
 *
 * Every change to bookings runs under one short KV lock (bookings are few; the schedule and the tile count depend on
 * all of them), and money owed back is saved on the booking before Dodo is asked, then cleared step by step.
 */

export class SponsorBusyError extends Error {}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The lock outlives any work done under it: settle() stops before a Dodo step once less than SETTLE_MARGIN_MS is
 * left (one step is at most two 8 s Dodo calls), leaving the rest owed for the next try instead of running on after
 * the lock has expired and someone else holds it.
 */
const LOCK_SECONDS = 120;
const SETTLE_MARGIN_MS = 40_000;
let lockDeadline = 0;

async function withLock<T>(store: SponsorStore, now: () => number, work: () => Promise<T>): Promise<T> {
  const token = randomBytes(8).toString("hex");
  for (let attempt = 0; attempt < 25; attempt++) {
    if (await store.lock(token, LOCK_SECONDS, now())) {
      lockDeadline = Date.now() + LOCK_SECONDS * 1000;
      try {
        return await work();
      } finally {
        await store.unlock(token);
      }
    }
    await sleep(200);
  }
  throw new SponsorBusyError("Sponsor bookings are busy; try again.");
}

export type StartResult =
  | { ok: true; booking: Booking; url: string }
  | { ok: false; status: number; error: string };

export async function startBooking(
  store: SponsorStore,
  config: SponsorDodoConfig,
  input: BookingInput,
  origin: string,
  now: number,
  fetchImpl: typeof fetch = fetch,
): Promise<StartResult> {
  const all = await store.all();
  if (input.tier === "tile" && tilesPaid(all, now) >= SPONSOR_TIERS.tile.spots) {
    return { ok: false, status: 409, error: "All logo tiles are taken right now. Try again later or book the featured card." };
  }
  if (input.tier === "featured" && !featuredFree(all, now)) {
    return { ok: false, status: 409, error: "The featured card is taken right now. Try again when it frees up, or book a logo tile." };
  }
  const booking = newBooking(input, newBookingId(), now);
  const back = `${origin}/sponsor/?booking=${booking.id}`;
  const session = await createSponsorCheckout(config, booking, { returnUrl: `${back}#book`, cancelUrl: `${origin}/sponsor/#book` }, fetchImpl);
  const saved = { ...booking, sessionId: session.id };
  await store.putLogo(saved.id, input.logo.type, input.logo.bytes, true);
  await store.put(saved);
  await store.link(session.id, saved.id);
  return { ok: true, booking: saved, url: session.url };
}

async function save(store: SponsorStore, before: Booking, after: Booking, links: (string | null)[] = []): Promise<void> {
  await store.put(after);
  if (before.status === "checkout" && after.status !== "checkout") {
    // Paid: keep the logo for good (it was stored with the unpaid booking's expiry).
    const logo = await store.getLogo(after.id);
    if (logo) await store.putLogo(after.id, logo.type, logo.bytes, false);
  }
  // Every payment (renewals too) and the subscription point back here, so refunds and disputes find the booking.
  for (const id of new Set([after.paymentId, after.subscriptionId, ...links])) {
    if (id) await store.link(id, after.id);
  }
}

/** Finishes what a booking owes in Dodo: cancel the subscription first (stops further charges), then each refund. */
async function settle(store: SponsorStore, config: SponsorDodoConfig, booking: Booking, fetchImpl: typeof fetch): Promise<Booking> {
  let b = booking;
  const timeLeft = () => {
    if (Date.now() > lockDeadline - SETTLE_MARGIN_MS) throw new SponsorBusyError("Out of time under the lock; the rest stays owed.");
  };
  if (b.cancelOwed) {
    timeLeft();
    await cancelSponsorSubscription(config, b.cancelOwed, fetchImpl);
    b = { ...b, cancelOwed: null };
    await store.put(b);
  }
  for (const paymentId of b.refundsOwed) {
    timeLeft();
    await refundSponsorPayment(config, paymentId, "Sponsor booking not run", fetchImpl);
    b = { ...b, refundsOwed: b.refundsOwed.filter((id) => id !== paymentId) };
    await store.put(b);
  }
  return b;
}

async function bookingForEvent(store: SponsorStore, event: SponsorEvent): Promise<Booking | null> {
  const ids = event.type === "payment" ? [event.bookingId, event.sessionId, event.paymentId, event.subscriptionId]
    : event.type === "subscription" ? [event.bookingId, event.subscriptionId]
    : [event.paymentId];
  for (const id of ids) {
    if (!id) continue;
    const bookingId = BOOKING_ID.test(id) ? id : await store.bookingFor(id);
    const booking = bookingId ? await store.get(bookingId) : null;
    if (booking) return booking;
  }
  return null;
}

export type EventOutcome =
  | { kind: "applied"; booking: Booking; paid: boolean }
  | { kind: "orphan" }
  | { kind: "ignored" };

/** Applies one event (caller holds the lock), saves it, then settles anything owed. */
async function applyLocked(store: SponsorStore, config: SponsorDodoConfig, event: SponsorEvent, now: number, fetchImpl: typeof fetch): Promise<EventOutcome> {
  const booking = await bookingForEvent(store, event);
  if (!booking) {
    // Paid for a sponsorship we have no booking for (it expired, or never saved): give the money back.
    if (event.type === "payment" && event.sponsor && event.status === "succeeded") {
      if (event.subscriptionId) await cancelSponsorSubscription(config, event.subscriptionId, fetchImpl);
      await refundSponsorPayment(config, event.paymentId, "No sponsor booking found for this payment", fetchImpl);
      return { kind: "orphan" };
    }
    return { kind: "ignored" };
  }
  const applied = applySponsorEvent(booking, event, await store.all(), config.products, now);
  await save(store, booking, applied.booking, event.type === "payment" ? [event.paymentId] : []);
  const settled = await settle(store, config, applied.booking, fetchImpl);
  return { kind: "applied", booking: settled, paid: applied.paid };
}

export async function applyEvent(store: SponsorStore, config: SponsorDodoConfig, event: SponsorEvent, now: number, fetchImpl: typeof fetch = fetch): Promise<EventOutcome> {
  return withLock(store, () => now, () => applyLocked(store, config, event, now, fetchImpl));
}

/** True when a delivery belongs to sponsorships (so the Pro handler should not see it). */
export const isSponsorDelivery = (rawBody: string, config: SponsorDodoConfig): boolean => parseSponsorWebhook(rawBody, config.products) !== null;

export async function handleSponsorWebhook(
  store: SponsorStore,
  config: SponsorDodoConfig,
  rawBody: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  now: number,
  fetchImpl: typeof fetch = fetch,
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!verifyStandardWebhook(rawBody, headers, config.dodo.webhookKey, Math.floor(now / 1000))) return { status: 401, body: { error: "Invalid signature." } };
  const event = parseSponsorWebhook(rawBody, config.products);
  if (!event) return { status: 200, body: { ignored: "not a sponsor event" } };
  const eventId = headers.id && /^[A-Za-z0-9_-]{6,64}$/.test(headers.id) ? headers.id : null;
  // The duplicate check and the mark both happen under the lock; a failure before the mark lets Dodo retry.
  return withLock(store, () => now, async () => {
    if (eventId && (await store.seen(eventId))) return { status: 200, body: { duplicate: true } };
    const outcome = await applyLocked(store, config, event, now, fetchImpl);
    if (eventId) await store.markSeen(eventId);
    if (outcome.kind === "orphan") return { status: 200, body: { orphan: true, refunded: true } };
    if (outcome.kind === "ignored") return { status: 200, body: { ignored: "unknown booking" } };
    return { status: 200, body: { ok: true, status: outcome.booking.status, paid: outcome.paid } };
  });
}

/** A booking for its return page; while unpaid, re-reads the checkout from Dodo (at most every 10 s) in case a webhook was lost. */
export async function bookingStatus(store: SponsorStore, config: SponsorDodoConfig | null, id: string, now: number, fetchImpl: typeof fetch = fetch): Promise<Booking | null> {
  const booking = await store.get(id);
  if (!booking || booking.status !== "checkout" || !booking.sessionId || !config) return booking;
  if (!(await store.claimRefresh(id, 10, now))) return booking;
  try {
    const event = await fetchSponsorPayment(config, booking.sessionId, fetchImpl);
    if (!event || event.status !== "succeeded") return booking;
    const outcome = await applyEvent(store, config, { ...event, bookingId: booking.id }, now, fetchImpl);
    return outcome.kind === "applied" ? outcome.booking : booking;
  } catch {
    return booking;
  }
}

/**
 * The owner's decision. The new state (and any refund or cancellation owed) is saved first; "settle" retries what
 * Dodo hasn't confirmed yet. Returns null when the booking can't take that action.
 */
export async function decideBooking(
  store: SponsorStore,
  config: SponsorDodoConfig,
  id: string,
  action: "approve" | "reject" | "remove" | "settle",
  now: number,
  fetchImpl: typeof fetch = fetch,
): Promise<Booking | null> {
  return withLock(store, () => now, async () => {
    const booking = await store.get(id);
    if (!booking) return null;
    if (action === "settle") return settle(store, config, booking, fetchImpl);
    const next = decide(booking, action, await store.all(), now);
    if (!next) return null;
    await save(store, booking, next);
    return settle(store, config, next, fetchImpl);
  });
}
