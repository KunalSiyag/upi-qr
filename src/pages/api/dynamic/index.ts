import type { APIRoute } from "astro";
import { CampaignLimitError, createRecord, listRecords, metricsForRecords, ownerCacheId, publicRecord, safeDestination, type DynamicQrCategory } from "../../../lib/dynamicQrStore";
import { authenticatedUserId, isTrustedMutation, jsonResponse, readJsonObject, RequestBodyError, validExpiryDate } from "../../../lib/apiSecurity";
import { consumeRateLimit, rateLimitHeaders } from "../../../lib/rateLimit";

export const prerender = false;

const CATEGORIES = new Set<DynamicQrCategory>(["payment", "menu", "social", "store", "event", "other"]);

export const GET: APIRoute = async ({ locals }) => {
  const userId = authenticatedUserId(locals);
  if (!userId) return jsonResponse({ error: "Sign in to manage dynamic QR campaigns." }, 401);

  try {
    const rateLimit = await consumeRateLimit("dynamic-list", userId, 120, 3600);
    if (!rateLimit.allowed) return jsonResponse({ error: "Too many requests." }, 429, rateLimitHeaders(rateLimit));

    const records = await listRecords(userId);
    const recordMetrics = await metricsForRecords(records.map((record) => record.id));
    const campaigns = records.map((record, index) => ({ ...publicRecord(record), ...recordMetrics[index] }));
    campaigns.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return jsonResponse({ campaigns, cacheKey: ownerCacheId(userId) });
  } catch {
    return jsonResponse({ error: "Dynamic QR service is unavailable." }, 503);
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const userId = authenticatedUserId(locals);
  if (!userId) return jsonResponse({ error: "Sign in to create dynamic QR campaigns." }, 401);
  if (!isTrustedMutation(request)) return jsonResponse({ error: "Cross-site request rejected." }, 403);
  let body: Record<string, unknown>;
  try {
    body = await readJsonObject(request, 8192);
  } catch (error) {
    if (error instanceof RequestBodyError) return jsonResponse({ error: error.message }, error.status);
    return jsonResponse({ error: "JSON body required." }, 400);
  }

  const destinationUrl = safeDestination(body.destinationUrl as string);
  if (!destinationUrl) {
    return jsonResponse({ error: "Use a public https:// URL or a valid upi://pay link." }, 400);
  }

  const category = typeof body.category === "string" && CATEGORIES.has(body.category as DynamicQrCategory)
    ? body.category as DynamicQrCategory
    : undefined;
  if (body.category !== undefined && category === undefined) {
    return jsonResponse({ error: "Invalid campaign category." }, 400);
  }
  const expiryDate = body.expiryDate === undefined || body.expiryDate === "" ? undefined : body.expiryDate;
  if (expiryDate !== undefined && !validExpiryDate(expiryDate)) {
    return jsonResponse({ error: "Expiry date must be a future YYYY-MM-DD date." }, 400);
  }

  try {
    const rateLimit = await consumeRateLimit("dynamic-create", userId, 20, 3600);
    if (!rateLimit.allowed) return jsonResponse({ error: "Campaign creation rate limit exceeded." }, 429, rateLimitHeaders(rateLimit));
    const record = await createRecord(userId, {
      title: typeof body.title === "string" ? body.title.slice(0, 120) : "Dynamic QR Campaign",
      destinationUrl,
      category,
      expiryDate: expiryDate as string | undefined,
    });
    return jsonResponse({ campaign: publicRecord(record) }, 201);
  } catch (error) {
    if (error instanceof CampaignLimitError) return jsonResponse({ error: error.message }, 409);
    return jsonResponse({ error: "Could not create dynamic QR campaign." }, 503);
  }
};
