import type { APIRoute } from "astro";
import { authenticatedUserId, isTrustedMutation, jsonResponse, readJsonObject, RequestBodyError } from "../../../../lib/apiSecurity";
import { consumeRateLimit, rateLimitHeaders } from "../../../../lib/rateLimit";
import { allowLocalPushEndpoints, vapidConfig } from "../../../../lib/push/config";
import { pushStore } from "../../../../lib/push/kvPushStore";
import { safePushEndpoint, sendPush, validSubscriptionKeys } from "../../../../lib/push/webpush";
import { rateLimitsAvailable, workspaceOwner } from "../../../../lib/workspace/kvCloudStore";
import { recordMetric } from "../../../../lib/metrics";

export const prerender = false;

/** Public VAPID key (or unavailable) — needed before the browser can subscribe. */
export const GET: APIRoute = async () => {
  const vapid = vapidConfig();
  return jsonResponse({ available: vapid !== null, publicKey: vapid?.publicKey ?? null });
};

/** { subscription } turns the morning digest on for this device; { action: "test" } sends a test notification. */
export const POST: APIRoute = async ({ request, locals }) => {
  const userId = authenticatedUserId(locals);
  if (!userId) return jsonResponse({ error: "Sign in to turn on notifications." }, 401);
  if (!isTrustedMutation(request)) return jsonResponse({ error: "Cross-site request rejected." }, 403);
  const vapid = vapidConfig();
  if (!vapid) return jsonResponse({ error: "Notifications aren't available yet." }, 503);
  let body: Record<string, unknown>;
  try {
    body = await readJsonObject(request, 4096);
  } catch (error) {
    if (error instanceof RequestBodyError) return jsonResponse({ error: error.message }, error.status);
    return jsonResponse({ error: "JSON body required." }, 400);
  }
  try {
    if (rateLimitsAvailable()) {
      const rate = await consumeRateLimit("push-write", userId, 30, 3600);
      if (!rate.allowed) return jsonResponse({ error: "Too many requests." }, 429, rateLimitHeaders(rate));
    }
    const owner = workspaceOwner(userId);
    const store = pushStore();
    if (body.action === "test") {
      const subscriptions = await store.list(owner);
      if (!subscriptions.length) return jsonResponse({ error: "Turn on notifications first." }, 409);
      let sent = 0;
      for (const subscription of subscriptions) {
        const outcome = await sendPush(subscription, { title: "Notifications are on", body: "Each morning you'll get the invoices to chase that day.", url: "/app/", tag: "test" }, vapid);
        if (outcome === "sent") sent++;
        if (outcome === "expired") await store.remove(owner, subscription.endpoint);
      }
      return jsonResponse({ sent });
    }
    const sub = body.subscription as { endpoint?: unknown; keys?: unknown } | undefined;
    const endpoint = safePushEndpoint(sub?.endpoint, allowLocalPushEndpoints());
    if (!endpoint || !validSubscriptionKeys(sub?.keys)) return jsonResponse({ error: "This browser's push subscription isn't supported." }, 400);
    await store.add(owner, { endpoint, keys: { p256dh: sub!.keys!.p256dh, auth: sub!.keys!.auth } as { p256dh: string; auth: string }, createdAt: Date.now() });
    await recordMetric("push_enabled");
    return jsonResponse({ ok: true });
  } catch {
    return jsonResponse({ error: "Notifications are unavailable right now." }, 503);
  }
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  const userId = authenticatedUserId(locals);
  if (!userId) return jsonResponse({ error: "Sign in first." }, 401);
  if (!isTrustedMutation(request)) return jsonResponse({ error: "Cross-site request rejected." }, 403);
  let body: Record<string, unknown>;
  try {
    body = await readJsonObject(request, 2048);
  } catch (error) {
    if (error instanceof RequestBodyError) return jsonResponse({ error: error.message }, error.status);
    return jsonResponse({ error: "JSON body required." }, 400);
  }
  if (typeof body.endpoint !== "string") return jsonResponse({ error: "endpoint required." }, 400);
  try {
    await pushStore().remove(workspaceOwner(userId), body.endpoint);
    return jsonResponse({ ok: true });
  } catch {
    return jsonResponse({ error: "Notifications are unavailable right now." }, 503);
  }
};
