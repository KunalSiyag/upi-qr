import type { APIRoute } from "astro";
import { jsonResponse, readLimitedText, RequestBodyError } from "../../../lib/apiSecurity";
import { billingConfig } from "../../../lib/billing/config";
import { billingStore } from "../../../lib/billing/kvBillingStore";
import { handleSubscriptionWebhook } from "../../../lib/billing/webhook";
import { recordMetric } from "../../../lib/metrics";

export const prerender = false;

/** Razorpay → Pro plan state. Public, but every delivery must carry a valid HMAC signature. */
export const POST: APIRoute = async ({ request }) => {
  const config = billingConfig();
  if (!config) return jsonResponse({ error: "Billing is not configured." }, 503);
  let raw: string;
  try {
    raw = await readLimitedText(request, 65_536);
  } catch (error) {
    if (error instanceof RequestBodyError) return jsonResponse({ error: error.message }, error.status);
    return jsonResponse({ error: "Unreadable body." }, 400);
  }
  try {
    const result = await handleSubscriptionWebhook(
      billingStore(),
      config,
      raw,
      request.headers.get("x-razorpay-signature"),
      request.headers.get("x-razorpay-event-id"),
      Date.now(),
    );
    const transition = result.body.transition;
    if (transition === "pro_activated" || transition === "pro_cancelled") await recordMetric(transition);
    return jsonResponse(result.body, result.status);
  } catch {
    // Storage failed: a 5xx makes Razorpay retry the delivery later.
    return jsonResponse({ error: "Temporarily unavailable." }, 500);
  }
};
