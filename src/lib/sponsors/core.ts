import { createHash, randomBytes } from "node:crypto";
import { normalizeEmail, safePublicHttpsUrl } from "../apiSecurity.ts";
import { FEATURED_BOOK_AHEAD_DAYS, SPONSOR_PERIOD_DAYS, SPONSOR_TIERS, type SponsorTier } from "../../data/sponsors.ts";

/**
 * Self-serve sponsorships: a booking is created with its copy and logo, paid through Dodo Payments, approved by the
 * owner (first bookings) and shown on the homepages while it runs. Pure functions here; storage in store.ts, Dodo
 * calls in dodo.ts. Keep this module free of runtime imports other than apiSecurity and data (Node tests run it).
 */

export const SPONSOR_PRODUCT = "proupiqr-sponsor";

export type BookingStatus =
  | "checkout" // created, not paid (expires after a day)
  | "review" // paid, waiting for the owner
  | "approved" // paid and approved: shows while its dates (featured) or paid period (tile) run
  | "rejected" // the owner said no; refunded
  | "removed" // taken down by the owner after going live
  | "refunded" // refunded or disputed outside our flow
  | "soldout"; // paid for a tile after the last one went; refunded

export interface Booking {
  id: string;
  tier: SponsorTier;
  /** Featured: 30-day periods bought (1–3). Tiles: 1. */
  months: number;
  name: string;
  /** Featured card only. */
  tagline: string;
  href: string;
  email: string;
  logoType: LogoType;
  /** sha256 of the logo bytes: a returning sponsor with unchanged copy skips review. */
  logoHash: string;
  status: BookingStatus;
  createdAt: number;
  paidAt: number | null;
  approvedAt: number | null;
  sessionId: string | null;
  paymentId: string | null;
  subscriptionId: string | null;
  /** Featured: first and last IST day shown (inclusive), set on approval. */
  start: string | null;
  end: string | null;
  /** Tile: shown until this instant (the subscription's next billing date). */
  paidUntil: number | null;
  renews: boolean;
  /** Newest subscription event applied (webhooks can arrive out of order). */
  eventAt: number;
  /**
   * Dodo work still owed: payments to refund and a subscription to cancel. Saved with the decision before Dodo is
   * called, cleared one by one as Dodo confirms, so a failure halfway is finished on the next try, never repeated.
   */
  refundsOwed: string[];
  cancelOwed: string | null;
  /** When the booking was rejected, sold out, refunded or taken down: charges made before then were for real time. */
  closedAt: number | null;
  note: string;
  updatedAt: number;
}

export type LogoType = "image/png" | "image/jpeg" | "image/webp";

export const BOOKING_ID = /^spb_[a-f0-9]{32}$/;
/** Unpaid bookings outlive Dodo's checkout session (a day) by a margin, so a late payment still finds its booking. */
export const UNPAID_TTL_SECONDS = 7 * 24 * 60 * 60;
/** Renewal webhooks can be late; a renewing tile stays up this long past its billing date. */
export const TILE_GRACE_MS = 2 * 86_400_000;
export const MAX_LOGO_BYTES = 64 * 1024;

export const newBookingId = (): string => `spb_${randomBytes(16).toString("hex")}`;

/* ---------- Dates (IST calendar days) ---------- */

export const istDay = (now: number): string => new Date(now + 330 * 60_000).toISOString().slice(0, 10);

export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/* ---------- Input ---------- */

export interface BookingInput {
  tier: SponsorTier;
  months: number;
  name: string;
  tagline: string;
  href: string;
  email: string;
  logo: { type: LogoType; bytes: Buffer };
}

export type InputResult = { ok: true; value: BookingInput } | { ok: false; field: string; error: string };

const clean = (value: unknown): string => typeof value === "string" ? value.normalize("NFC").replace(/\s+/g, " ").trim() : "";
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/;

/** The logo's real type from its first bytes; SVG and everything else is refused. */
export function sniffLogo(bytes: Buffer): LogoType | null {
  if (bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length > 12 && bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}

export function validateBookingInput(raw: Record<string, unknown>): InputResult {
  const tier = raw.tier === "featured" || raw.tier === "tile" ? raw.tier : null;
  if (!tier) return { ok: false, field: "tier", error: "Choose the featured card or a logo tile." };
  const months = tier === "tile" ? 1 : Number(raw.months);
  if (!Number.isInteger(months) || months < 1 || months > SPONSOR_TIERS[tier].maxMonths) {
    return { ok: false, field: "months", error: `Book 1 to ${SPONSOR_TIERS[tier].maxMonths} months.` };
  }
  const name = clean(raw.name);
  if (name.length < 2 || name.length > 40 || CONTROL.test(name)) return { ok: false, field: "name", error: "Name: 2 to 40 characters." };
  const tagline = tier === "featured" ? clean(raw.tagline) : "";
  if (tier === "featured" && (tagline.length < 10 || tagline.length > 90 || CONTROL.test(tagline))) {
    return { ok: false, field: "tagline", error: "Your line: 10 to 90 characters." };
  }
  const href = safePublicHttpsUrl(typeof raw.href === "string" ? raw.href.trim() : "");
  if (!href || href.length > 300) return { ok: false, field: "href", error: "Link: a full https:// address." };
  const email = normalizeEmail(raw.email);
  if (!email) return { ok: false, field: "email", error: "Enter a valid email address." };
  const data = typeof raw.logo === "string" ? raw.logo.replace(/^data:image\/[a-z]+;base64,/, "") : "";
  if (!data || data.length > Math.ceil(MAX_LOGO_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
    return { ok: false, field: "logo", error: "Logo: a PNG, JPEG or WebP under 64 KB." };
  }
  const bytes = Buffer.from(data, "base64");
  const type = sniffLogo(bytes);
  if (!type || bytes.length > MAX_LOGO_BYTES) return { ok: false, field: "logo", error: "Logo: a PNG, JPEG or WebP under 64 KB." };
  if (raw.agree !== true) return { ok: false, field: "agree", error: "Confirm the booking rules first." };
  return { ok: true, value: { tier, months, name, tagline, href, email, logo: { type, bytes } } };
}

export const logoHash = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

export function newBooking(input: BookingInput, id: string, now: number): Booking {
  return {
    id,
    tier: input.tier,
    months: input.months,
    name: input.name,
    tagline: input.tagline,
    href: input.href,
    email: input.email,
    logoType: input.logo.type,
    logoHash: logoHash(input.logo.bytes),
    status: "checkout",
    createdAt: now,
    paidAt: null,
    approvedAt: null,
    sessionId: null,
    paymentId: null,
    subscriptionId: null,
    start: null,
    end: null,
    paidUntil: null,
    renews: input.tier === "tile",
    eventAt: 0,
    refundsOwed: [],
    cancelOwed: null,
    closedAt: null,
    note: "",
    updatedAt: now,
  };
}

/** What a booking costs, in paise (GST included). */
export const bookingPrice = (tier: SponsorTier, months: number): number => SPONSOR_TIERS[tier].paise * months;

/* ---------- Availability and scheduling ---------- */

/**
 * A booking skips review only when an approved booking (not taken down) had exactly the same link, name, line, logo
 * and email. The email is only typed, never verified, so the exact link is what makes this safe: whoever re-uses an
 * approved sponsor's details can only pay to show that same sponsor again.
 */
export function needsReview(booking: Booking, all: Booking[]): boolean {
  return !all.some((b) => b.id !== booking.id && b.approvedAt !== null && b.status !== "removed" && b.status !== "refunded"
    && b.href === booking.href && b.email === booking.email && b.name === booking.name && b.logoHash === booking.logoHash
    && b.tier === booking.tier && b.tagline === booking.tagline);
}

/**
 * Tiles that are paid for: waiting for review or running. Unpaid checkouts hold nothing (holding let a few unpaid
 * checkouts block every tile); two people paying for the last tile at once is settled when the payment lands.
 */
export function tilesPaid(all: Booking[], now: number, except?: string): number {
  return all.filter((b) => b.tier === "tile" && b.id !== except && (b.status === "review" || (b.status === "approved" && tileRunning(b, now)))).length;
}

const tileRunning = (b: Booking, now: number): boolean => b.paidUntil !== null && now < b.paidUntil + (b.renews ? TILE_GRACE_MS : 0);

export function featuredNextStart(all: Booking[], now: number, except?: string): string {
  const today = istDay(now);
  let next = today;
  for (const b of all) {
    if (b.tier !== "featured" || b.id === except || b.status !== "approved" || !b.end) continue;
    const after = addDays(b.end, 1);
    if (after > next) next = after;
  }
  const waiting = all.filter((b) => b.tier === "featured" && b.id !== except && b.status === "review");
  return addDays(next, waiting.reduce((days, b) => days + b.months * SPONSOR_PERIOD_DAYS, 0));
}

export function featuredBookable(all: Booking[], now: number): boolean {
  return featuredNextStart(all, now) <= addDays(istDay(now), FEATURED_BOOK_AHEAD_DAYS);
}

/** Approve: a featured booking takes the next free dates after the ones already scheduled. */
export function approve(booking: Booking, all: Booking[], now: number, note: string): Booking {
  const next: Booking = { ...booking, status: "approved", approvedAt: now, note, updatedAt: now };
  if (booking.tier === "featured") {
    const others = all.filter((b) => b.id !== booking.id && b.status === "approved");
    const start = featuredNextStart(others, now);
    next.start = start;
    next.end = addDays(start, booking.months * SPONSOR_PERIOD_DAYS - 1);
  }
  return next;
}

export function isShowing(b: Booking, now: number): boolean {
  if (b.status !== "approved") return false;
  if (b.tier === "featured") {
    const today = istDay(now);
    return b.start !== null && b.end !== null && b.start <= today && today <= b.end;
  }
  return tileRunning(b, now);
}

/* ---------- What the homepage and /sponsor/ read ---------- */

export interface PublicSponsor {
  id: string;
  name: string;
  tagline: string;
  href: string;
  logo: string;
}

export interface PublicSponsors {
  featured: PublicSponsor | null;
  tiles: PublicSponsor[];
  tilesFree: number;
  featuredNextStart: string;
  featuredBookable: boolean;
}

/** The sponsor's link with our UTM tags, so they can count visits without any tracking on our side. */
export function sponsorHref(href: string, placement: "home-featured" | "home-tile"): string {
  const url = new URL(href);
  if (url.protocol !== "https:") throw new Error("https links only");
  url.searchParams.set("utm_source", "proupiqr");
  url.searchParams.set("utm_medium", "sponsor");
  url.searchParams.set("utm_campaign", placement);
  return url.href;
}

export const logoPath = (id: string): string => `/api/v1/sponsors/logo/${id}/`;

export function publicSponsors(all: Booking[], now: number): PublicSponsors {
  const view = (b: Booking, placement: "home-featured" | "home-tile"): PublicSponsor => ({
    id: b.id, name: b.name, tagline: b.tagline, href: sponsorHref(b.href, placement), logo: logoPath(b.id),
  });
  const featured = all.find((b) => b.tier === "featured" && isShowing(b, now));
  const tiles = all.filter((b) => b.tier === "tile" && isShowing(b, now)).sort((a, b) => (a.approvedAt ?? 0) - (b.approvedAt ?? 0));
  return {
    featured: featured ? view(featured, "home-featured") : null,
    tiles: tiles.slice(0, SPONSOR_TIERS.tile.spots).map((b) => view(b, "home-tile")),
    tilesFree: Math.max(0, SPONSOR_TIERS.tile.spots - tilesPaid(all, now)),
    featuredNextStart: featuredNextStart(all, now),
    featuredBookable: featuredBookable(all, now),
  };
}

/** Logos are served only for bookings that are paid and not refused (the admin page shows the rest inline). */
export const logoPublic = (b: Booking): boolean => b.status === "approved" || b.status === "review";

/* ---------- Dodo webhooks ---------- */

export interface SponsorProducts {
  featured: string;
  tile: string;
}

export type SponsorEvent =
  | { type: "payment"; status: string; sponsor: boolean; bookingId: string | null; sessionId: string | null; paymentId: string; subscriptionId: string | null; productId: string | null; quantity: number; amount: number; currency: string; createdAt: number | null }
  | { type: "subscription"; event: string; at: number; bookingId: string | null; subscriptionId: string; productId: string | null; status: string; nextBilling: number | null; cancelAtEnd: boolean }
  /** `ends`: a full refund, or a dispute that is open or lost. Partial refunds and won disputes change nothing. */
  | { type: "refund"; ends: boolean; paymentId: string; reason: string };

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {});
const str = (v: unknown): string | null => (typeof v === "string" && v.length <= 200 ? v : null);

function bookingFrom(metadata: unknown): string | null {
  const m = obj(metadata);
  const id = str(m.booking);
  return m.product === SPONSOR_PRODUCT && id && BOOKING_ID.test(id) ? id : null;
}

const ours = (data: Record<string, unknown>, products: SponsorProducts, productId: string | null): boolean =>
  obj(data.metadata).product === SPONSOR_PRODUCT || (productId !== null && (productId === products.featured || productId === products.tile));

const ENDING_DISPUTES = new Set(["dispute.opened", "dispute.accepted", "dispute.lost"]);

/**
 * A Dodo delivery the sponsor handler takes, or null (Pro gets it). Subscriptions are ours by checkout metadata or a
 * sponsor product id. Every payment, refund and dispute comes here (Pro ignores those): a payment's metadata and
 * product list may be missing (a subscription's first payment has no cart), so the handler finds its booking by the
 * checkout session, payment or subscription id it stored, and ignores the rest.
 */
export function parseSponsorWebhook(rawBody: string, products: SponsorProducts): SponsorEvent | null {
  let body: Record<string, unknown>;
  try {
    body = obj(JSON.parse(rawBody));
  } catch {
    return null;
  }
  const type = str(body.type) ?? "";
  const data = obj(body.data);
  const at = Date.parse(str(body.timestamp) ?? "");
  if (type.startsWith("payment.")) {
    const cart = Array.isArray(data.product_cart) ? data.product_cart.map(obj) : [];
    const productId = str(cart[0]?.product_id);
    const paymentId = str(data.payment_id);
    if (!paymentId) return null;
    return {
      type: "payment",
      status: str(data.status) ?? type.slice("payment.".length),
      sponsor: ours(data, products, productId),
      bookingId: bookingFrom(data.metadata),
      sessionId: str(data.checkout_session_id),
      paymentId,
      subscriptionId: str(data.subscription_id),
      productId,
      quantity: Number(cart[0]?.quantity) || 0,
      amount: typeof data.total_amount === "number" ? data.total_amount : -1,
      currency: str(data.currency) ?? "",
      createdAt: Number.isFinite(Date.parse(str(data.created_at) ?? "")) ? Date.parse(str(data.created_at) ?? "") : null,
    };
  }
  if (type.startsWith("subscription.")) {
    const productId = str(data.product_id);
    const subscriptionId = str(data.subscription_id);
    if (!subscriptionId || !ours(data, products, productId)) return null;
    const next = Date.parse(str(data.next_billing_date) ?? "");
    return {
      type: "subscription",
      event: type,
      at: Number.isFinite(at) ? at : Date.now(),
      bookingId: bookingFrom(data.metadata),
      subscriptionId,
      productId,
      status: str(data.status) ?? "",
      nextBilling: Number.isFinite(next) ? next : null,
      cancelAtEnd: data.cancel_at_next_billing_date === true,
    };
  }
  if (type.startsWith("refund.") || type.startsWith("dispute.")) {
    const paymentId = str(data.payment_id);
    if (!paymentId) return null;
    const ends = type.startsWith("dispute.") ? ENDING_DISPUTES.has(type) : type === "refund.succeeded" && data.is_partial !== true;
    return { type: "refund", ends, paymentId, reason: type.startsWith("dispute.") ? "Payment disputed" : "Refunded in Dodo" };
  }
  return null;
}

export interface Applied {
  booking: Booking;
  /** True when the booking just became paid (for metrics). */
  paid: boolean;
}

/** Statuses that must never be charged again: any later charge is refunded and the subscription cancelled. */
const CLOSED: BookingStatus[] = ["rejected", "soldout", "refunded", "removed"];

const owe = (b: Booking, refund: string | null, cancel: string | null): Booking => ({
  ...b,
  refundsOwed: refund && !b.refundsOwed.includes(refund) ? [...b.refundsOwed, refund] : b.refundsOwed,
  cancelOwed: cancel ?? b.cancelOwed,
});

/**
 * One verified event applied to its booking. Payment checks: the product, quantity, currency and amount must be
 * exactly what the booking costs; anything else goes to review with a note instead of going live. Money owed back
 * is recorded on the booking (refundsOwed, cancelOwed) for service.ts to settle with Dodo.
 */
export function applySponsorEvent(booking: Booking, event: SponsorEvent, all: Booking[], products: SponsorProducts, now: number): Applied {
  const b: Booking = { ...booking, refundsOwed: booking.refundsOwed ?? [], cancelOwed: booking.cancelOwed ?? null, updatedAt: now };
  if (event.type === "refund") {
    if (!event.ends || CLOSED.includes(b.status)) return { booking, paid: false };
    // Hidden from now on, and a tile stops renewing (otherwise it would be charged every month while hidden).
    return { booking: owe({ ...b, status: "refunded", renews: false, closedAt: now, note: event.reason }, null, b.renews ? b.subscriptionId : null), paid: false };
  }

  if (event.type === "subscription") {
    if (event.at < b.eventAt) return { booking, paid: false };
    b.eventAt = event.at;
    b.subscriptionId = event.subscriptionId;
    if (event.status === "active") {
      if (event.nextBilling) b.paidUntil = event.nextBilling;
      b.renews = !event.cancelAtEnd;
      if (CLOSED.includes(b.status)) return { booking: owe({ ...b, renews: false }, null, event.subscriptionId), paid: false };
      if (b.status === "checkout") return markPaid(b, all, now, event.productId === products.tile ? null : "Subscription for an unexpected product");
      return { booking: b, paid: false };
    }
    b.renews = false;
    if (b.cancelOwed === event.subscriptionId && event.status === "cancelled") b.cancelOwed = null;
    if (event.status !== "cancelled" && b.paidUntil !== null) b.paidUntil = Math.min(b.paidUntil, now);
    return { booking: b, paid: false };
  }

  if (event.status !== "succeeded") return { booking, paid: false };
  const first = !b.paymentId;
  if (first) b.paymentId = event.paymentId;
  if (event.subscriptionId && !b.subscriptionId) b.subscriptionId = event.subscriptionId;
  if (b.status !== "checkout") {
    // A charge on a booking we've closed is owed back when it never ran (rejected, sold out) or the charge came after
    // closing (a renewal the cancel didn't stop). A charge from before a take-down or refund paid for time it ran.
    const charged = first || event.paymentId !== booking.paymentId;
    const neverRan = b.status === "rejected" || b.status === "soldout";
    const afterClose = event.createdAt === null || b.closedAt === null || event.createdAt >= b.closedAt;
    const owed = CLOSED.includes(b.status) && charged && (neverRan || afterClose);
    return { booking: owed ? owe(b, event.paymentId, b.tier === "tile" ? b.subscriptionId : null) : b, paid: false };
  }
  const expected = bookingPrice(b.tier, b.months);
  // A subscription's first payment may carry no product list; the subscription event checks its product instead.
  const cartless = b.tier === "tile" && event.productId === null && event.subscriptionId !== null;
  const product = b.tier === "featured" ? products.featured : products.tile;
  const problem = !cartless && event.productId !== product ? "Paid for an unexpected product"
    : !cartless && event.quantity !== (b.tier === "featured" ? b.months : 1) ? `Paid for ${event.quantity} months, booked ${b.months}`
    : event.currency !== "INR" || event.amount !== expected ? `Paid ${event.currency} ${event.amount / 100}, expected INR ${expected / 100}`
    : null;
  return markPaid(b, all, now, problem);
}

function markPaid(b: Booking, all: Booking[], now: number, problem: string | null): Applied {
  b.paidAt = now;
  if (b.tier === "tile" && b.paidUntil === null) b.paidUntil = now + SPONSOR_PERIOD_DAYS * 86_400_000;
  if (b.tier === "tile" && tilesPaid(all, now, b.id) >= SPONSOR_TIERS.tile.spots) {
    const soldout = { ...b, status: "soldout" as const, renews: false, closedAt: now, note: "All tiles were taken when the payment arrived; refunded" };
    return { booking: owe(soldout, b.paymentId, b.subscriptionId), paid: true };
  }
  if (problem) return { booking: { ...b, status: "review", note: problem }, paid: true };
  if (needsReview(b, all)) return { booking: { ...b, status: "review", note: "" }, paid: true };
  return { booking: approve(b, all, now, "Returning sponsor, same copy and link: approved automatically"), paid: true };
}

/** The owner's decision on a booking. Reject refunds; remove takes a running booking down (no automatic refund). */
export function decide(booking: Booking, action: "approve" | "reject" | "remove", all: Booking[], now: number): Booking | null {
  const b: Booking = { ...booking, refundsOwed: booking.refundsOwed ?? [], cancelOwed: booking.cancelOwed ?? null, updatedAt: now };
  if (action === "approve" && b.status === "review") return approve(b, all, now, "Approved");
  if (action === "reject" && b.status === "review") return owe({ ...b, status: "rejected", renews: false, closedAt: now, note: "Rejected and refunded" }, b.paymentId, b.subscriptionId);
  if (action === "remove" && b.status === "approved") return owe({ ...b, status: "removed", renews: false, closedAt: now, note: "Taken down" }, null, b.subscriptionId);
  return null;
}
