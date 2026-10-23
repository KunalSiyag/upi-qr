import type { APIRoute } from "astro";
import { authenticatedUserId, isTrustedMutation, jsonResponse, readJsonObject, RequestBodyError } from "../../../../lib/apiSecurity";
import { consumeRateLimit, rateLimitHeaders } from "../../../../lib/rateLimit";
import { rateLimitsAvailable, workspaceOwner } from "../../../../lib/workspace/kvCloudStore";
import { paylinkStore } from "../../../../lib/workspace/kvPaylinkStore";
import { validPaylinkToken } from "../../../../lib/workspace/paylinks";
import { ownerMismatch } from "../../../../lib/workspace/booksApi";

export const prerender = false;

/** { scope: "claims" } acknowledges pending claims; { scope: "link" } revokes the link. Owner only. */
export const DELETE: APIRoute = async ({ request, locals, params }) => {
  const userId = authenticatedUserId(locals);
  if (!userId) return jsonResponse({ error: "Sign in first." }, 401);
  if (!isTrustedMutation(request)) return jsonResponse({ error: "Cross-site request rejected." }, 403);
  if (!validPaylinkToken(params.token)) return jsonResponse({ error: "Not found." }, 404);
  let body: Record<string, unknown>;
  try {
    body = await readJsonObject(request, 256);
  } catch (error) {
    if (error instanceof RequestBodyError) return jsonResponse({ error: error.message }, error.status);
    return jsonResponse({ error: "JSON body required." }, 400);
  }
  if (body.scope !== "claims" && body.scope !== "link") return jsonResponse({ error: "scope must be claims or link." }, 400);

  try {
    if (rateLimitsAvailable()) {
      const rate = await consumeRateLimit("paylinks-delete", userId, 240, 3600);
      if (!rate.allowed) return jsonResponse({ error: "Too many requests." }, 429, rateLimitHeaders(rate));
    }
    const store = paylinkStore();
    const record = await store.get(params.token);
    // Same response for "not yours" and "missing" so tokens cannot be probed.
    if (!record || record.owner !== workspaceOwner(userId)) return jsonResponse({ error: "Not found." }, 404);
    const mismatch = ownerMismatch(body, record.owner);
    if (mismatch) return jsonResponse(mismatch.body, mismatch.status);
    if (body.scope === "claims") await store.clearClaims(params.token);
    else await store.remove(record.owner, params.token, record.invoiceId);
    return jsonResponse({ ok: true });
  } catch {
    return jsonResponse({ error: "Pay links are unavailable right now." }, 503);
  }
};
