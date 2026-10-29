import { dodoRequest, type DodoConfig } from "../billing/dodo.ts";
import { SPONSOR_PRODUCT, type Booking, type SponsorEvent, type SponsorProducts } from "./core.ts";

/**
 * Dodo Payments calls for sponsorships, on the same account and webhook as Pro. Both the featured card and a logo
 * tile are monthly subscriptions. Shapes checked 2026-10
 * against Dodo's API reference: POST /checkouts, GET /checkouts/{id}, GET /payments/{id} (refund_status, refunds[]),
 * POST /refunds, GET and PATCH /subscriptions/{id} { status: "cancelled" }.
 */

export interface SponsorDodoConfig {
  dodo: DodoConfig;
  products: SponsorProducts;
}

const PRODUCT_ID = /^pdt_[A-Za-z0-9]{8,40}$/;
const ID = { cks: /^cks_[A-Za-z0-9]{8,40}$/, pay: /^pay_[A-Za-z0-9]{8,40}$/, sub: /^sub_[A-Za-z0-9]{8,40}$/ };

/** Self-serve booking is open only when Dodo is configured and both sponsor products are set. */
export function sponsorDodoConfig(dodo: DodoConfig | null, env: Record<string, string | undefined>): SponsorDodoConfig | null {
  const featured = env.DODO_PRODUCT_SPONSOR_FEATURED?.trim();
  const tile = env.DODO_PRODUCT_SPONSOR_TILE?.trim();
  if (!dodo || !featured || !tile || !PRODUCT_ID.test(featured) || !PRODUCT_ID.test(tile)) return null;
  // A sponsor id equal to a Pro id would route Pro's subscription events here, where they'd be dropped.
  if (new Set([featured, tile, dodo.products.monthly, dodo.products.yearly]).size !== 4) return null;
  return { dodo, products: { featured, tile } };
}

/** Hosted checkout for one booking. The sponsor's email and name prefill it; Dodo issues the GST invoice. */
export async function createSponsorCheckout(
  config: SponsorDodoConfig,
  booking: Booking,
  urls: { returnUrl: string; cancelUrl: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ id: string; url: string }> {
  const session = await dodoRequest<{ session_id?: unknown; checkout_url?: unknown }>(config.dodo, fetchImpl, "POST", "/checkouts", {
    product_cart: [{ product_id: config.products[booking.tier], quantity: 1 }],
    customer: { email: booking.email, name: booking.name },
    metadata: { product: SPONSOR_PRODUCT, booking: booking.id, tier: booking.tier },
    billing_currency: "INR",
    feature_flags: { allow_currency_selection: false, allow_discount_code: false, allow_tax_id: true, redirect_immediately: true },
    return_url: urls.returnUrl,
    cancel_url: urls.cancelUrl,
  });
  if (typeof session.session_id !== "string" || !ID.cks.test(session.session_id) || typeof session.checkout_url !== "string") {
    throw new Error("Unexpected checkout session from Dodo");
  }
  return { id: session.session_id, url: session.checkout_url };
}

/** The checkout's payment as a webhook-shaped event, or null while it isn't paid (for a lost webhook). */
export async function fetchSponsorPayment(config: SponsorDodoConfig, sessionId: string, fetchImpl: typeof fetch = fetch): Promise<Extract<SponsorEvent, { type: "payment" }> | null> {
  if (!ID.cks.test(sessionId)) return null;
  const session = await dodoRequest<{ payment_id?: unknown }>(config.dodo, fetchImpl, "GET", `/checkouts/${sessionId}`);
  if (typeof session.payment_id !== "string" || !ID.pay.test(session.payment_id)) return null;
  const p = await dodoRequest<Record<string, unknown>>(config.dodo, fetchImpl, "GET", `/payments/${session.payment_id}`);
  const cart = Array.isArray(p.product_cart) ? p.product_cart as Record<string, unknown>[] : [];
  const metadata = p.metadata && typeof p.metadata === "object" ? p.metadata as Record<string, unknown> : {};
  return {
    type: "payment",
    status: typeof p.status === "string" ? p.status : "",
    sponsor: true,
    bookingId: typeof metadata.booking === "string" ? metadata.booking : null,
    sessionId,
    paymentId: session.payment_id,
    subscriptionId: typeof p.subscription_id === "string" ? p.subscription_id : null,
    productId: typeof cart[0]?.product_id === "string" ? cart[0].product_id as string : null,
    quantity: Number(cart[0]?.quantity) || 0,
    amount: typeof p.total_amount === "number" ? p.total_amount : -1,
    currency: typeof p.currency === "string" ? p.currency : "",
    createdAt: typeof p.created_at === "string" && Number.isFinite(Date.parse(p.created_at)) ? Date.parse(p.created_at) : null,
  };
}

/**
 * Refunds a payment unless Dodo already has one under way, so a retry after a half-finished attempt (a timeout
 * after Dodo accepted it, a lost save) never refunds twice. Dodo has no idempotency key and `refund_status` stays
 * empty until a refund succeeds (UPI refunds can be pending for hours), so pending and in-review refunds count too:
 * any full one, or any partial one we made (tagged in its metadata).
 */
export async function refundSponsorPayment(config: SponsorDodoConfig, paymentId: string, reason: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  if (!ID.pay.test(paymentId)) throw new Error("Invalid payment id");
  const payment = await dodoRequest<{ refund_status?: unknown; refunds?: unknown }>(config.dodo, fetchImpl, "GET", `/payments/${paymentId}`);
  if (payment.refund_status === "full") return;
  const refunds = Array.isArray(payment.refunds) ? payment.refunds as Record<string, unknown>[] : [];
  const underWay = refunds.some((r) => ["pending", "review", "succeeded"].includes(String(r?.status))
    && (r?.is_partial !== true || (r?.metadata as Record<string, unknown> | undefined)?.product === SPONSOR_PRODUCT));
  if (underWay) return;
  await dodoRequest(config.dodo, fetchImpl, "POST", "/refunds", { payment_id: paymentId, reason, metadata: { product: SPONSOR_PRODUCT } });
}

/** Ends a tile subscription now (no further charges), unless it has already ended. */
export async function cancelSponsorSubscription(config: SponsorDodoConfig, subscriptionId: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  if (!ID.sub.test(subscriptionId)) throw new Error("Invalid subscription id");
  const sub = await dodoRequest<{ status?: unknown }>(config.dodo, fetchImpl, "GET", `/subscriptions/${subscriptionId}`);
  if (sub.status === "cancelled" || sub.status === "expired" || sub.status === "failed") return;
  await dodoRequest(config.dodo, fetchImpl, "PATCH", `/subscriptions/${subscriptionId}`, { status: "cancelled" });
}
