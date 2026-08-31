import type { APIRoute } from "astro";
import { getCheckoutSession } from "../../../lib/kv";
import { jsonResponse, requestFingerprint, validCheckoutSessionId } from "../../../lib/apiSecurity";
import { consumeRateLimit, rateLimitHeaders } from "../../../lib/rateLimit";

export const prerender = false;

export const GET: APIRoute = async ({ request, params }) => {
  const id = params.id;
  if (!validCheckoutSessionId(id)) return jsonResponse({ error: "Session not found." }, 404);

  try {
    const rateLimit = await consumeRateLimit("checkout-public-status", `${id}:${requestFingerprint(request)}`, 120, 900);
    if (!rateLimit.allowed) return jsonResponse({ error: "Too many status requests." }, 429, rateLimitHeaders(rateLimit));
    const session = await getCheckoutSession(id);
    if (!session) return jsonResponse({ error: "Session not found." }, 404);
    return jsonResponse({ status: session.status });
  } catch {
    return jsonResponse({ error: "Checkout service is unavailable." }, 503);
  }
};
