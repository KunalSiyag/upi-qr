import type { APIRoute } from "astro";
import { authenticatedUserId, isTrustedMutation, jsonResponse, readJsonObject, RequestBodyError, validVpa } from "../../../../../lib/apiSecurity";
import { consumeRateLimit, rateLimitHeaders } from "../../../../../lib/rateLimit";
import { rateLimitsAvailable, workspaceOwner } from "../../../../../lib/workspace/kvCloudStore";
import { newPaylinkToken } from "../../../../../lib/workspace/kvPaylinkStore";
import { badBookId, createBookLink } from "../../../../../lib/workspace/booksApi";
import { serverBooks } from "../../../../../lib/workspace/serverBooks";

export const prerender = false;

/**
 * A pay or statement link in a non-primary business. The link's key is
 * book-qualified ("<bookId>/<subject>") and its page shows that business's
 * name and UPI ID only. A server without this route answers 404.
 */
export const POST: APIRoute = async ({ request, locals, params }) => {
  const userId = authenticatedUserId(locals);
  if (!userId) return jsonResponse({ error: "Sign in to create pay links." }, 401);
  if (!isTrustedMutation(request)) return jsonResponse({ error: "Cross-site request rejected." }, 403);
  const bad = badBookId(params.id);
  if (bad) return jsonResponse(bad.body, bad.status);
  let body: Record<string, unknown>;
  try {
    body = await readJsonObject(request, 1024);
  } catch (error) {
    if (error instanceof RequestBodyError) return jsonResponse({ error: error.message }, error.status);
    return jsonResponse({ error: "JSON body required." }, 400);
  }
  try {
    if (rateLimitsAvailable()) {
      const rate = await consumeRateLimit("paylinks-create", userId, 120, 3600);
      if (!rate.allowed) return jsonResponse({ error: "Too many requests. Try again shortly." }, 429, rateLimitHeaders(rate));
    }
    const result = await createBookLink(serverBooks(), workspaceOwner(userId), params.id as string, body, newPaylinkToken, validVpa);
    return jsonResponse(result.body, result.status);
  } catch {
    return jsonResponse({ error: "Pay links are unavailable right now." }, 503);
  }
};
