import type { APIRoute } from "astro";
import { CampaignLimitError, deleteRecord, isExpired, metrics, publicRecord, readRecord, recordScan, safeDestination, updateRecord, validId, type DynamicQrCategory } from "../../../lib/dynamicQrStore";
import { authenticatedUserId, isTrustedMutation, jsonResponse, readJsonObject, RequestBodyError, requestFingerprint, validExpiryDate } from "../../../lib/apiSecurity";
import { consumeRateLimit, rateLimitHeaders } from "../../../lib/rateLimit";

export const prerender = false;

const CATEGORIES = new Set<DynamicQrCategory>(["payment", "menu", "social", "store", "event", "other"]);

export const GET: APIRoute = async ({ request, url, params, locals }) => {
  const id = params.id;
  if (!validId(id)) return jsonResponse({ error: "Invalid campaign ID." }, 400);
  
  try {
    const resolverLimit = await consumeRateLimit("dynamic-resolve", requestFingerprint(request), 600, 60);
    if (!resolverLimit.allowed) return jsonResponse({ error: "Resolver rate limit exceeded." }, 429, rateLimitHeaders(resolverLimit));

    const campaign = await readRecord(id);
    if (!campaign) return jsonResponse({ error: "Campaign not found." }, 404);
    
    const mode = url.searchParams.get("mode");
    if (mode === "stats" || mode === "details") {
      const userId = authenticatedUserId(locals);
      if (!userId) return jsonResponse({ error: "Sign in to view campaign details." }, 401);
      if (campaign.ownerId !== userId) return jsonResponse({ error: "Campaign not found." }, 404);

      const rateLimit = await consumeRateLimit("dynamic-read", userId, 240, 3600);
      if (!rateLimit.allowed) return jsonResponse({ error: "Too many requests." }, 429, rateLimitHeaders(rateLimit));
      const campaignMetrics = await metrics(id);
      return mode === "stats"
        ? jsonResponse(campaignMetrics)
        : jsonResponse({ campaign: publicRecord(campaign), ...campaignMetrics });
    }
    
    if (campaign.isPaused) return jsonResponse({ error: "Campaign is paused." }, 410);
    if (isExpired(campaign)) return jsonResponse({ error: "Campaign has expired." }, 410);
    const destinationUrl = safeDestination(campaign.destinationUrl);
    if (!destinationUrl) return jsonResponse({ error: "Campaign destination is invalid." }, 410);

    const rateLimit = await consumeRateLimit("dynamic-scan", `${id}:${requestFingerprint(request)}`, 300, 60);
    if (!rateLimit.allowed) return jsonResponse({ error: "Scan rate limit exceeded." }, 429, rateLimitHeaders(rateLimit));
    
    const userAgent = request.headers.get("user-agent") || "";
    const device = /Android|iPhone|iPad|iPod|IEMobile/i.test(userAgent) ? "mobile" : "desktop";
    const counts = await recordScan(id, device);
    
    return jsonResponse({ destinationUrl, title: campaign.title, ...counts });
  } catch {
    return jsonResponse({ error: "Dynamic QR service is unavailable." }, 503);
  }
};

export const PATCH: APIRoute = async ({ request, params, locals }) => {
  const userId = authenticatedUserId(locals);
  if (!userId) return jsonResponse({ error: "Sign in to update dynamic QR campaigns." }, 401);
  if (!isTrustedMutation(request)) return jsonResponse({ error: "Cross-site request rejected." }, 403);
  const id = params.id;
  if (!validId(id)) return jsonResponse({ error: "Invalid campaign ID." }, 400);

  let body: Record<string, unknown>;
  try {
    body = await readJsonObject(request, 8192);
  } catch (error) {
    if (error instanceof RequestBodyError) return jsonResponse({ error: error.message }, error.status);
    return jsonResponse({ error: "JSON body required." }, 400);
  }

  if (body.destinationUrl !== undefined && !safeDestination(body.destinationUrl as string)) {
    return jsonResponse({ error: "Use a public HTTPS URL or valid UPI payment link." }, 400);
  }
  if (body.category !== undefined && (typeof body.category !== "string" || !CATEGORIES.has(body.category as DynamicQrCategory))) {
    return jsonResponse({ error: "Invalid campaign category." }, 400);
  }
  if (body.expiryDate !== undefined && body.expiryDate !== "" && body.expiryDate !== null && !validExpiryDate(body.expiryDate)) {
    return jsonResponse({ error: "Expiry date must be a future YYYY-MM-DD date." }, 400);
  }

  try {
    const rateLimit = await consumeRateLimit("dynamic-update", userId, 120, 3600);
    if (!rateLimit.allowed) return jsonResponse({ error: "Too many updates." }, 429, rateLimitHeaders(rateLimit));

    const campaign = await updateRecord(
      id,
      userId,
      typeof body.manageToken === "string" ? body.manageToken : undefined,
      {
        destinationUrl: body.destinationUrl as string | undefined,
        title: typeof body.title === "string" ? body.title : undefined,
        category: body.category as DynamicQrCategory | undefined,
        expiryDate: body.expiryDate === "" || body.expiryDate === null
          ? null
          : typeof body.expiryDate === "string"
            ? body.expiryDate
            : undefined,
        isPaused: typeof body.isPaused === "boolean" ? body.isPaused : undefined,
      },
    );
    if (!campaign) return jsonResponse({ error: "Campaign not found." }, 404);
    return jsonResponse({ campaign: publicRecord(campaign) });
  } catch (error) {
    if (error instanceof CampaignLimitError) return jsonResponse({ error: error.message }, 409);
    return jsonResponse({ error: "Dynamic QR service is unavailable." }, 503);
  }
};

export const DELETE: APIRoute = async ({ request, params, locals }) => {
  const userId = authenticatedUserId(locals);
  if (!userId) return jsonResponse({ error: "Sign in to delete dynamic QR campaigns." }, 401);
  if (!isTrustedMutation(request)) return jsonResponse({ error: "Cross-site request rejected." }, 403);

  const id = params.id;
  if (!validId(id)) return jsonResponse({ error: "Invalid campaign ID." }, 400);

  try {
    const rateLimit = await consumeRateLimit("dynamic-delete", userId, 30, 3600);
    if (!rateLimit.allowed) return jsonResponse({ error: "Too many deletions." }, 429, rateLimitHeaders(rateLimit));
    const legacyManageToken = request.headers.get("x-campaign-manage-token") || undefined;
    if (!await deleteRecord(id, userId, legacyManageToken)) return jsonResponse({ error: "Campaign not found." }, 404);
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch {
    return jsonResponse({ error: "Dynamic QR service is unavailable." }, 503);
  }
};
