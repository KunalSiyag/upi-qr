import type { APIRoute } from "astro";
import { jsonResponse } from "../../../../lib/apiSecurity";
import { sponsorBillingConfig } from "../../../../lib/billing/config";
import { BOOKING_ID } from "../../../../lib/sponsors/core";
import { sponsorStore } from "../../../../lib/sponsors/kvStore";
import { bookingStatus } from "../../../../lib/sponsors/service";

export const prerender = false;

/**
 * A booking's progress for the sponsor's return page. The id (128 random bits) is the only key; the reply carries
 * what the sponsor already knows plus status and dates, never the email or payment ids.
 */
export const GET: APIRoute = async ({ params }) => {
  const id = params.id ?? "";
  if (!BOOKING_ID.test(id)) return jsonResponse({ error: "Not found." }, 404);
  try {
    const b = await bookingStatus(sponsorStore(), sponsorBillingConfig(), id, Date.now());
    if (!b) return jsonResponse({ error: "Not found." }, 404);
    return jsonResponse({ id: b.id, tier: b.tier, name: b.name, status: b.status, paidUntil: b.paidUntil, renews: b.renews });
  } catch {
    return jsonResponse({ error: "Unavailable right now." }, 503);
  }
};
