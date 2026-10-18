import type { APIRoute } from "astro";
import { authenticatedUserId, isTrustedMutation, jsonResponse, readJsonObject, RequestBodyError } from "../../../../../lib/apiSecurity";
import { consumeRateLimit, consumeRateLimitUnits, rateLimitHeaders } from "../../../../../lib/rateLimit";
import { rateLimitsAvailable, workspaceOwner } from "../../../../../lib/workspace/kvCloudStore";
import { getBookIndex, putBookIndex } from "../../../../../lib/workspace/booksApi";
import { serverBooks } from "../../../../../lib/workspace/serverBooks";

export const prerender = false;

/** The index route body: ~8 KB at 64 entries. */
const MAX_INDEX_BYTES = 16_000;

async function limited(scope: string, userId: string, limit: number, windowSeconds = 3600) {
  if (!rateLimitsAvailable()) return null;
  const result = await consumeRateLimit(scope, userId, limit, windowSeconds);
  return result.allowed ? null : jsonResponse({ error: "Too many sync requests. Try again shortly." }, 429, rateLimitHeaders(result));
}

/** The account's businesses (book index), revisions per live book, and the plan (null while billing can't be read). */
export const GET: APIRoute = async ({ locals }) => {
  const userId = authenticatedUserId(locals);
  if (!userId) return jsonResponse({ error: "Sign in to sync your workspace." }, 401);
  try {
    const blocked = await limited("workspace-read", userId, 600);
    if (blocked) return blocked;
    const result = await getBookIndex(serverBooks(), workspaceOwner(userId));
    return jsonResponse(result.body, result.status);
  } catch {
    return jsonResponse({ error: "Sync is unavailable right now. Your data is safe on this device." }, 503);
  }
};

/** Registers new businesses (plan limit on additions only) and deletes businesses (tombstones are final). */
export const PUT: APIRoute = async ({ request, locals }) => {
  const userId = authenticatedUserId(locals);
  if (!userId) return jsonResponse({ error: "Sign in to sync your workspace." }, 401);
  if (!isTrustedMutation(request)) return jsonResponse({ error: "Cross-site request rejected." }, 403);
  let body: Record<string, unknown>;
  try {
    body = await readJsonObject(request, MAX_INDEX_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyError) return jsonResponse({ error: error.message }, error.status);
    return jsonResponse({ error: "JSON body required." }, 400);
  }
  try {
    const blocked = await limited("workspace-write", userId, 360);
    if (blocked) return blocked;
    const owner = workspaceOwner(userId);
    // 60 business adds per account per day, charged per business added (all or nothing).
    const consumeAdd = async (units: number) => !rateLimitsAvailable() || (await consumeRateLimitUnits("workspace-book-add", userId, 60, 86_400, units)).allowed;
    const result = await putBookIndex(serverBooks(), owner, body, consumeAdd);
    return jsonResponse(result.body, result.status);
  } catch {
    return jsonResponse({ error: "Sync is unavailable right now. Your data is safe on this device." }, 503);
  }
};
