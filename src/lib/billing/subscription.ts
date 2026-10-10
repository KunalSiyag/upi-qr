/**
 * Subscription state for the Pro plan — pure functions, no I/O.
 *
 * Razorpay webhooks drive the state. Events can arrive late, twice, or out of
 * order, so applying an event is idempotent and older events never overwrite
 * newer ones. Access rules are deliberately customer-friendly: a paid period
 * is always honoured, and failed renewals keep Pro for a grace window while
 * Razorpay retries the charge.
 */

export type BillingInterval = "monthly" | "yearly";
export type SubscriptionStatus =
  | "created" | "authenticated" | "active" | "pending" | "halted" | "cancelled" | "completed" | "expired" | "paused";

const STATUSES: readonly SubscriptionStatus[] = ["created", "authenticated", "active", "pending", "halted", "cancelled", "completed", "expired", "paused"];
export const PENDING_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

export interface SubscriptionRecord {
  provider: "razorpay";
  subscriptionId: string;
  interval: BillingInterval;
  status: SubscriptionStatus;
  /** End of the paid (or current) billing cycle, epoch ms. */
  currentEnd: number | null;
  cancelAtCycleEnd: boolean;
  /** Hosted authorisation page while status is "created". */
  shortUrl: string | null;
  /** created_at of the last applied webhook event, epoch ms. */
  eventAt: number;
  updatedAt: number;
}

export function isSubscriptionStatus(value: unknown): value is SubscriptionStatus {
  return typeof value === "string" && (STATUSES as readonly string[]).includes(value);
}

export function hasProAccess(record: SubscriptionRecord | null, now: number): boolean {
  if (!record) return false;
  switch (record.status) {
    case "authenticated":
    case "active":
      return true;
    case "pending":
      return record.currentEnd === null || now < record.currentEnd + PENDING_GRACE_MS;
    case "cancelled":
    case "completed":
    case "halted":
    case "paused":
      return record.currentEnd !== null && now < record.currentEnd;
    default:
      return false;
  }
}

export interface SubscriptionEvent {
  /** e.g. "subscription.charged" */
  event: string;
  /** Event creation time, epoch ms. */
  createdAt: number;
  subscriptionId: string;
  status: SubscriptionStatus;
  /** Epoch ms, or null when Razorpay has not started a cycle yet. */
  currentEnd: number | null;
  interval: BillingInterval;
}

/**
 * Returns the record to store after an event, or null to ignore the event.
 * A different subscription only replaces the stored one if the stored one no
 * longer grants access or the new one is live (so a late "cancelled" event for
 * an old subscription cannot downgrade a customer who re-subscribed).
 */
export function applySubscriptionEvent(existing: SubscriptionRecord | null, event: SubscriptionEvent, now: number): SubscriptionRecord | null {
  if (!event.event.startsWith("subscription.")) return null;
  const live = event.status === "active" || event.status === "authenticated" || event.status === "pending";
  if (existing && existing.subscriptionId !== event.subscriptionId) {
    if (hasProAccess(existing, now) && !live) return null;
  } else if (existing && event.createdAt < existing.eventAt) {
    return null;
  }
  const same = existing?.subscriptionId === event.subscriptionId ? existing : null;
  return {
    provider: "razorpay",
    subscriptionId: event.subscriptionId,
    interval: event.interval,
    status: event.status,
    currentEnd: event.currentEnd ?? same?.currentEnd ?? null,
    cancelAtCycleEnd: event.status === "active" || event.status === "authenticated" ? (same?.cancelAtCycleEnd ?? false) : false,
    shortUrl: event.status === "created" ? (same?.shortUrl ?? null) : null,
    eventAt: event.createdAt,
    updatedAt: now,
  };
}

export function parseSubscriptionRecord(raw: unknown): SubscriptionRecord | null {
  const value = typeof raw === "string" ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw;
  if (!value || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  if (typeof r.subscriptionId !== "string" || !isSubscriptionStatus(r.status)) return null;
  return {
    provider: "razorpay",
    subscriptionId: r.subscriptionId,
    interval: r.interval === "yearly" ? "yearly" : "monthly",
    status: r.status,
    currentEnd: typeof r.currentEnd === "number" ? r.currentEnd : null,
    cancelAtCycleEnd: r.cancelAtCycleEnd === true,
    shortUrl: typeof r.shortUrl === "string" ? r.shortUrl : null,
    eventAt: typeof r.eventAt === "number" ? r.eventAt : 0,
    updatedAt: typeof r.updatedAt === "number" ? r.updatedAt : 0,
  };
}
