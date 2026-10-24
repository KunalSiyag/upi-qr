import type { APIRoute } from "astro";
import { authenticatedUserId, isTrustedMutation, jsonResponse, readJsonObject, RequestBodyError, validVpa } from "../../../../lib/apiSecurity";
import { consumeRateLimit, rateLimitHeaders } from "../../../../lib/rateLimit";
import { readWorkspace } from "../../../../lib/workspace/cloud";
import { cloudStore, rateLimitsAvailable, workspaceOwner } from "../../../../lib/workspace/kvCloudStore";
import { newPaylinkToken, paylinkStore } from "../../../../lib/workspace/kvPaylinkStore";
import { createPaylink, createStatementLink, createStatusCode, refreshViews } from "../../../../lib/workspace/paylinks";
import { parseLinkKey, PRIMARY_BOOK_ID } from "../../../../lib/workspace/books";
import { ownerMismatch } from "../../../../lib/workspace/booksApi";
import { planFor } from "../../../../lib/billing/plans";
import { recordMetric } from "../../../../lib/metrics";

export const prerender = false;

const ID_RE = /^inv_[A-Za-z0-9]{6,40}$/;
const CLIENT_RE = /^cli_[A-Za-z0-9]{6,40}$/;

async function limited(scope: string, userId: string, limit: number) {
  if (!rateLimitsAvailable()) return null;
  const result = await consumeRateLimit(scope, userId, limit, 3600);
  return result.allowed ? null : jsonResponse({ error: "Too many requests. Try again shortly." }, 429, rateLimitHeaders(result));
}

/**
 * Active links with any pending "I've paid" claims, plus plan usage. Without
 * ?books=1 (old clients) only the primary book's links (bare keys) are listed,
 * exactly as before; with it, every link carries its businessId and the plan its business limit.
 * Without ?intl=1, links for foreign-currency invoices (record.intl) are left out: older tabs can't see
 * those invoices and would revoke the links as "paid" (docs/spec-foreign-clients.md §1.7).
 */
export const GET: APIRoute = async ({ locals, url }) => {
  const userId = authenticatedUserId(locals);
  if (!userId) return jsonResponse({ error: "Sign in to use pay links." }, 401);
  try {
    const blocked = await limited("paylinks-read", userId, 600);
    if (blocked) return blocked;
    const owner = workspaceOwner(userId);
    const store = paylinkStore();
    const allBooks = url.searchParams.get("books") === "1";
    const intlClient = url.searchParams.get("intl") === "1";
    const byInvoice = await store.list(owner);
    const used = Object.keys(byInvoice).length;
    const entries = Object.entries(byInvoice).filter(([key]) => allBooks || !key.includes("/"));
    // Only an older client's request reads the records (one per link) to find the foreign-currency ones. Each
    // record is read at the same time as its claims, never before them, so it adds no round trip in sequence.
    const rows = await Promise.all(entries.map(async ([invoiceId, token]) => {
      const [record, claims] = await Promise.all([intlClient ? null : store.get(token), store.claims(token)]);
      if (record?.intl === 1) return null;
      return { invoiceId, token, claims, ...(allBooks ? { businessId: parseLinkKey(invoiceId).bookId } : {}) };
    }));
    const links = rows.filter((row) => row !== null);
    const plan = await planFor(owner);
    // `used` is account-wide (the active-link limit is per account), even when only primary links are listed.
    return jsonResponse({ links, plan: { id: plan.id, activePaylinks: plan.activePaylinks, used, statementLinks: plan.statementLinks, ...(allBooks ? { businesses: plan.businesses } : {}) } });
  } catch {
    return jsonResponse({ error: "Pay links are unavailable right now." }, 503);
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const userId = authenticatedUserId(locals);
  if (!userId) return jsonResponse({ error: "Sign in to create pay links." }, 401);
  if (!isTrustedMutation(request)) return jsonResponse({ error: "Cross-site request rejected." }, 403);
  let body: Record<string, unknown>;
  try {
    body = await readJsonObject(request, 1024);
  } catch (error) {
    if (error instanceof RequestBodyError) return jsonResponse({ error: error.message }, error.status);
    return jsonResponse({ error: "JSON body required." }, 400);
  }
  const isStatement = typeof body.clientId === "string";
  if (isStatement ? !CLIENT_RE.test(body.clientId as string) : (typeof body.invoiceId !== "string" || !ID_RE.test(body.invoiceId))) {
    return jsonResponse({ error: isStatement ? "Unknown client." : "Unknown invoice." }, 400);
  }

  try {
    const blocked = await limited("paylinks-create", userId, 120);
    if (blocked) return blocked;
    const owner = workspaceOwner(userId);
    const mismatch = ownerMismatch(body, owner);
    if (mismatch) return jsonResponse(mismatch.body, mismatch.status);
    const { workspace } = await readWorkspace(cloudStore(), owner);
    const plan = await planFor(owner);
    const result = isStatement
      ? await createStatementLink(paylinkStore(), owner, workspace, body.clientId as string, newPaylinkToken, Date.now(), plan, validVpa)
      : await createPaylink(paylinkStore(), owner, workspace, body.invoiceId as string, newPaylinkToken, Date.now(), plan.activePaylinks, validVpa);
    if (result.status !== "ok") return jsonResponse({ error: result.message, code: result.status }, createStatusCode(result.status));
    if (result.created) {
      await recordMetric("paylink_created");
      await refreshViews(paylinkStore(), owner, PRIMARY_BOOK_ID, workspace).catch(() => undefined);
    }
    return jsonResponse({ token: result.token, created: result.created }, result.created ? 201 : 200);
  } catch {
    return jsonResponse({ error: "Pay links are unavailable right now." }, 503);
  }
};
