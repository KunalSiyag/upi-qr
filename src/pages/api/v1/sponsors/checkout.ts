import type { APIRoute } from "astro";
import { isTrustedMutation, jsonResponse, readJsonObject, requestFingerprint, RequestBodyError } from "../../../../lib/apiSecurity";
import { safeCheckoutUrl, sponsorBillingConfig } from "../../../../lib/billing/config";
import { recordMetric } from "../../../../lib/metrics";
import { consumeRateLimit, rateLimitHeaders } from "../../../../lib/rateLimit";
import { validateBookingInput } from "../../../../lib/sponsors/core";
import { sponsorStore } from "../../../../lib/sponsors/kvStore";
import { startBooking } from "../../../../lib/sponsors/service";

export const prerender = false;

/** Starts a sponsor booking: stores the copy and logo (expiring unless paid) and returns the Dodo checkout URL. */
export const POST: APIRoute = async ({ request }) => {
  if (!isTrustedMutation(request)) return jsonResponse({ error: "Cross-site request rejected." }, 403);
  const config = sponsorBillingConfig();
  if (!config) return jsonResponse({ error: "Online booking isn't open yet. Email us to book." }, 503);

  let body: Record<string, unknown>;
  try {
    body = await readJsonObject(request, 100_000);
  } catch (error) {
    if (error instanceof RequestBodyError) return jsonResponse({ error: error.message }, error.status);
    return jsonResponse({ error: "JSON body required." }, 400);
  }
  // Honeypot: real visitors never see or fill this field.
  if (typeof body.company === "string" && body.company.trim() !== "") return jsonResponse({ error: "Couldn't start the booking." }, 400);

  const input = validateBookingInput(body);
  if (!input.ok) return jsonResponse({ error: input.error, field: input.field }, 400);

  try {
    const limit = await consumeRateLimit("sponsor-checkout", requestFingerprint(request), 10, 3600);
    if (!limit.allowed) return jsonResponse({ error: "Too many attempts. Try again in an hour." }, 429, rateLimitHeaders(limit));
    const started = await startBooking(sponsorStore(), config, input.value, new URL(request.url).origin, Date.now());
    if (!started.ok) return jsonResponse({ error: started.error }, started.status);
    const url = safeCheckoutUrl(started.url);
    if (!url) return jsonResponse({ error: "Payment page unavailable. Try again shortly." }, 502);
    await recordMetric("sponsor_checkout");
    return jsonResponse({ id: started.booking.id, url });
  } catch {
    return jsonResponse({ error: "Payment page unavailable. Try again shortly." }, 502);
  }
};
