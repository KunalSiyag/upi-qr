import type { APIRoute } from "astro";
import { authenticatedUserId, isTrustedMutation, jsonResponse, readJsonObject, RequestBodyError, validVpa } from "../../../../lib/apiSecurity";
import { consumeRateLimit, rateLimitHeaders } from "../../../../lib/rateLimit";
import { readWorkspace } from "../../../../lib/workspace/cloud";
import { cloudStore, rateLimitsAvailable, workspaceOwner } from "../../../../lib/workspace/kvCloudStore";
import { newPaylinkToken, paylinkStore } from "../../../../lib/workspace/kvPaylinkStore";
import { createPaylink, createStatementLink, snapshotsForLinks } from "../../../../lib/workspace/paylinks";
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

/** Active links with any pending "I've paid" claims, plus plan usage. */
export const GET: APIRoute = async ({ locals }) => {
  const userId = authenticatedUserId(locals);
  if (!userId) return jsonResponse({ error: "Sign in to use pay links." }, 401);
  try {
    const blocked = await limited("paylinks-read", userId, 600);
    if (blocked) return blocked;
    const owner = workspaceOwner(userId);
    const store = paylinkStore();
    const byInvoice = await store.list(owner);
    const links = await Promise.all(Object.entries(byInvoice).map(async ([invoiceId, token]) => ({
      invoiceId,
      token,
      claims: await store.claims(token),
    })));
    const plan = await planFor(owner);
    return jsonResponse({ links, plan: { id: plan.id, activePaylinks: plan.activePaylinks, used: links.length, statementLinks: plan.statementLinks } });
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
    const { workspace } = await readWorkspace(cloudStore(), owner);
    const plan = await planFor(owner);
    const result = isStatement
      ? await createStatementLink(paylinkStore(), owner, workspace, body.clientId as string, newPaylinkToken, Date.now(), plan, validVpa)
      : await createPaylink(paylinkStore(), owner, workspace, body.invoiceId as string, newPaylinkToken, Date.now(), plan.activePaylinks, validVpa);
    if (result.status !== "ok") return jsonResponse({ error: result.message, code: result.status }, result.status === "limit" || result.status === "not_pro" ? 402 : 409);
    if (result.created) {
      await recordMetric("paylink_created");
      const store = paylinkStore();
      await store.putViews(owner, snapshotsForLinks(workspace, await store.list(owner))).catch(() => undefined);
    }
    return jsonResponse({ token: result.token, created: result.created }, result.created ? 201 : 200);
  } catch {
    return jsonResponse({ error: "Pay links are unavailable right now." }, 503);
  }
};
