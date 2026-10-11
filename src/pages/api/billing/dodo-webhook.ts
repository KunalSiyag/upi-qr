import type { APIRoute } from "astro";
import { jsonResponse, readLimitedText, RequestBodyError } from "../../../lib/apiSecurity";
import { dodoBillingConfig } from "../../../lib/billing/config";
import { billingStore } from "../../../lib/billing/kvBillingStore";
import { handleDodoWebhook } from "../../../lib/billing/webhook";
import { recordMetric } from "../../../lib/metrics";

export const prerender = false;

/** Dodo Payments → Pro plan state. Public, but every delivery must carry a valid Standard Webhooks signature. */
export const POST: APIRoute = async ({ request }) => {
  const config = dodoBillingConfig();
  if (!config) return jsonResponse({ error: "Billing is not configured." }, 503);
  let raw: string;
  try {
    raw = await readLimitedText(request, 262_144);
  } catch (error) {
    if (error instanceof RequestBodyError) return jsonResponse({ error: error.message }, error.status);
    return jsonResponse({ error: "Unreadable body." }, 400);
  }
  try {
    const result = await handleDodoWebhook(
      billingStore(),
      config,
      raw,
      { id: request.headers.get("webhook-id"), timestamp: request.headers.get("webhook-timestamp"), signature: request.headers.get("webhook-signature") },
      Date.now(),
    );
    const transition = result.body.transition;
    if (transition === "pro_activated" || transition === "pro_cancelled") await recordMetric(transition);
    if (result.status === 401) await recordMetric("webhook_rejected");
    return jsonResponse(result.body, result.status);
  } catch {
    // Storage failed: a 5xx makes Dodo retry the delivery later.
    return jsonResponse({ error: "Temporarily unavailable." }, 500);
  }
};
