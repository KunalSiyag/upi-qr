import type { APIRoute } from "astro";
import { authenticatedUserId, isTrustedMutation, jsonResponse, readJsonObject, RequestBodyError } from "../../../../../lib/apiSecurity";
import { consumeRateLimit, rateLimitHeaders } from "../../../../../lib/rateLimit";
import { MAX_WORKSPACE_BYTES } from "../../../../../lib/workspace/cloud";
import { rateLimitsAvailable, workspaceOwner } from "../../../../../lib/workspace/kvCloudStore";
import { badBookId, getBook, putBook } from "../../../../../lib/workspace/booksApi";
import { serverBooks } from "../../../../../lib/workspace/serverBooks";

export const prerender = false;

// One non-primary business (book). biz_primary and malformed ids → 400; the
// primary stays on /api/v1/workspace/. A server without this route answers 404,
// so a rollback can never merge a business into the primary.

async function limited(scope: string, userId: string, limit: number) {
  if (!rateLimitsAvailable()) return null;
  const result = await consumeRateLimit(scope, userId, limit, 3600);
  return result.allowed ? null : jsonResponse({ error: "Too many sync requests. Try again shortly." }, 429, rateLimitHeaders(result));
}

export const GET: APIRoute = async ({ locals, params }) => {
  const userId = authenticatedUserId(locals);
  if (!userId) return jsonResponse({ error: "Sign in to sync your workspace." }, 401);
  const bad = badBookId(params.id);
  if (bad) return jsonResponse(bad.body, bad.status);
  try {
    const blocked = await limited("workspace-read", userId, 600);
    if (blocked) return blocked;
    const result = await getBook(serverBooks(), workspaceOwner(userId), params.id as string);
    return jsonResponse(result.body, result.status);
  } catch {
    return jsonResponse({ error: "Sync is unavailable right now. Your data is safe on this device." }, 503);
  }
};

export const PUT: APIRoute = async ({ request, locals, params }) => {
  const userId = authenticatedUserId(locals);
  if (!userId) return jsonResponse({ error: "Sign in to sync your workspace." }, 401);
  if (!isTrustedMutation(request)) return jsonResponse({ error: "Cross-site request rejected." }, 403);
  const bad = badBookId(params.id);
  if (bad) return jsonResponse(bad.body, bad.status);
  let body: Record<string, unknown>;
  try {
    body = await readJsonObject(request, MAX_WORKSPACE_BYTES + 100_000);
  } catch (error) {
    if (error instanceof RequestBodyError) return jsonResponse({ error: error.message }, error.status);
    return jsonResponse({ error: "JSON body required." }, 400);
  }
  try {
    const blocked = await limited("workspace-write", userId, 360);
    if (blocked) return blocked;
    const result = await putBook(serverBooks(), workspaceOwner(userId), params.id as string, body);
    return jsonResponse(result.body, result.status);
  } catch {
    return jsonResponse({ error: "Sync is unavailable right now. Your data is safe on this device." }, 503);
  }
};
