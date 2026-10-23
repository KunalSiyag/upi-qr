import type { APIRoute } from "astro";
import { authenticatedUserId, isTrustedMutation, jsonResponse, readJsonObject, readLimitedText, RequestBodyError } from "../../../../lib/apiSecurity";
import { consumeRateLimit, rateLimitHeaders } from "../../../../lib/rateLimit";
import { MAX_WORKSPACE_BYTES, readWorkspace, syncWorkspace } from "../../../../lib/workspace/cloud";
import { cloudStore as store, projectionStore, rateLimitsAvailable, workspaceOwner } from "../../../../lib/workspace/kvCloudStore";
import { digestProjection } from "../../../../lib/workspace/digest";
import { paylinkStore } from "../../../../lib/workspace/kvPaylinkStore";
import { refreshViews } from "../../../../lib/workspace/paylinks";
import { PRIMARY_BOOK_ID } from "../../../../lib/workspace/books";
import { deleteCloudCopy, ownerMismatch } from "../../../../lib/workspace/booksApi";
import { serverBooks } from "../../../../lib/workspace/serverBooks";
import { recordMetric } from "../../../../lib/metrics";

export const prerender = false;

// The primary book (biz_primary) only, for old and new clients: other books use
// /api/v1/workspace/books/<id>/. Fields such as businessId in a PUT are ignored.

async function limited(scope: string, userId: string, limit: number) {
  if (!rateLimitsAvailable()) return null;
  const result = await consumeRateLimit(scope, userId, limit, 3600);
  return result.allowed ? null : jsonResponse({ error: "Too many sync requests. Try again shortly." }, 429, rateLimitHeaders(result));
}

export const GET: APIRoute = async ({ locals }) => {
  const userId = authenticatedUserId(locals);
  if (!userId) return jsonResponse({ error: "Sign in to sync your workspace." }, 401);
  try {
    const blocked = await limited("workspace-read", userId, 600);
    if (blocked) return blocked;
    const owner = workspaceOwner(userId);
    const { workspace, rev } = await readWorkspace(store(), owner);
    return jsonResponse({ workspace, rev, owner });
  } catch {
    return jsonResponse({ error: "Sync is unavailable right now. Your data is safe on this device." }, 503);
  }
};

export const PUT: APIRoute = async ({ request, locals }) => {
  const userId = authenticatedUserId(locals);
  if (!userId) return jsonResponse({ error: "Sign in to sync your workspace." }, 401);
  if (!isTrustedMutation(request)) return jsonResponse({ error: "Cross-site request rejected." }, 403);

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
    const owner = workspaceOwner(userId);
    const mismatch = ownerMismatch(body, owner);
    if (mismatch) return jsonResponse(mismatch.body, mismatch.status);
    const result = await syncWorkspace(store(), owner, body.workspace, Date.now());
    if (result.status === "too_large") {
      return jsonResponse({ error: "Your workspace is too large to sync. Export old invoices to CSV and delete them, then try again." }, 413);
    }
    if (result.status === "conflict") return jsonResponse({ error: "Another device is syncing. Retrying shortly." }, 409);
    // Small digest input for the 09:00 cron, so it never re-reads full workspaces.
    await projectionStore().put(owner, PRIMARY_BOOK_ID, digestProjection(result.workspace)).catch(() => undefined);
    // Pre-render this book's active pay/statement links so public page views read ~300 bytes, not the workspace.
    await refreshViews(paylinkStore(), owner, PRIMARY_BOOK_ID, result.workspace, { skipWhenNoLinks: true }).catch(() => undefined);
    await recordMetric("sync");
    if (result.rev === 1) await recordMetric("workspace_created");
    return jsonResponse({ workspace: result.workspace, rev: result.rev, owner });
  } catch {
    return jsonResponse({ error: "Sync is unavailable right now. Your data is safe on this device." }, 503);
  }
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  const userId = authenticatedUserId(locals);
  if (!userId) return jsonResponse({ error: "Sign in first." }, 401);
  if (!isTrustedMutation(request)) return jsonResponse({ error: "Cross-site request rejected." }, 403);
  // Old clients send no body; new ones may send { expectedOwner }.
  let body: Record<string, unknown> = {};
  try {
    const text = await readLimitedText(request, 1024);
    if (text.trim()) {
      const parsed = JSON.parse(text) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
    }
  } catch (error) {
    if (error instanceof RequestBodyError) return jsonResponse({ error: error.message }, error.status);
    return jsonResponse({ error: "Request body must be a JSON object." }, 400);
  }
  try {
    const blocked = await limited("workspace-delete", userId, 20);
    if (blocked) return blocked;
    const mismatch = ownerMismatch(body, workspaceOwner(userId));
    if (mismatch) return jsonResponse(mismatch.body, mismatch.status);
    // Every book's cloud copy (the primary's projection and pay links are unchanged until PR 6).
    const result = await deleteCloudCopy(serverBooks(), workspaceOwner(userId));
    return jsonResponse(result.body, result.status);
  } catch {
    return jsonResponse({ error: "Couldn't delete the cloud copy right now. Try again later." }, 503);
  }
};
