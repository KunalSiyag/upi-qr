import type { APIRoute } from "astro";
import { isTrustedMutation, jsonResponse, normalizeEmail, readJsonObject, requestFingerprint, RequestBodyError } from "../../lib/apiSecurity";
import { consumeRateLimit, rateLimitHeaders } from "../../lib/rateLimit";
import { isWaitlistLang, isWaitlistTool } from "../../data/waitlist";
import { addWaitlistEntry } from "../../lib/waitlistStore";
import { recordMetric } from "../../lib/metrics";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  if (!isTrustedMutation(request)) return jsonResponse({ error: "Cross-site request rejected." }, 403);

  let body: Record<string, unknown>;
  try {
    body = await readJsonObject(request, 2048);
  } catch (error) {
    if (error instanceof RequestBodyError) return jsonResponse({ error: error.message }, error.status);
    return jsonResponse({ error: "JSON body required." }, 400);
  }

  // Honeypot: real users never see or fill this field. Pretend success.
  if (typeof body.company === "string" && body.company.trim() !== "") return jsonResponse({ ok: true });

  const email = normalizeEmail(body.email);
  if (!email) return jsonResponse({ error: "Enter a valid email address." }, 400);
  if (!isWaitlistTool(body.tool)) return jsonResponse({ error: "Unknown tool." }, 400);
  const lang = isWaitlistLang(body.lang) ? body.lang : "en";

  try {
    const rateLimit = await consumeRateLimit("waitlist", requestFingerprint(request), 5, 3600);
    if (!rateLimit.allowed) return jsonResponse({ error: "Too many attempts. Try again later." }, 429, rateLimitHeaders(rateLimit));

    const created = await addWaitlistEntry({
      email,
      tool: body.tool,
      lang,
      interview: body.interview === true,
      createdAt: new Date().toISOString(),
    });
    if (created) await recordMetric(body.tool === "pro" ? "pro_interest" : "waitlist_join");
  } catch {
    return jsonResponse({ error: "Early-access list is unavailable right now." }, 503);
  }

  // Same response for new and existing addresses so the list cannot be probed.
  return jsonResponse({ ok: true });
};
