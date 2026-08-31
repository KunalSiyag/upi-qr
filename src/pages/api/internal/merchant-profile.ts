import type { APIRoute } from "astro";
import { randomBytes } from "node:crypto";
import { getMerchantByUserId, createMerchant, createMerchantIfAbsent } from "../../../lib/kv";
import { authenticatedUserId, isTrustedMutation, jsonResponse, readJsonObject, RequestBodyError, validMerchantName, validVpa } from "../../../lib/apiSecurity";
import { consumeRateLimit, rateLimitHeaders } from "../../../lib/rateLimit";

export const prerender = false;

function publicMerchant(merchant: Awaited<ReturnType<typeof getMerchantByUserId>>) {
  if (!merchant) return null;
  return { id: merchant.id, name: merchant.name, apiKey: merchant.apiKey, vpa: merchant.vpa };
}

export const GET: APIRoute = async ({ locals }) => {
  const userId = authenticatedUserId(locals);
  if (!userId) return jsonResponse({ error: "Authentication required." }, 401);

  try {
    const rateLimit = await consumeRateLimit("merchant-profile-read", userId, 120, 3600);
    if (!rateLimit.allowed) return jsonResponse({ error: "Too many requests." }, 429, rateLimitHeaders(rateLimit));

    let merchant = await getMerchantByUserId(userId);
    if (!merchant) {
      merchant = {
        id: `m_${randomBytes(12).toString("hex")}`,
        name: "Merchant",
        apiKey: `puqi_live_${randomBytes(24).toString("hex")}`,
        clerkUserId: userId,
      };
      merchant = await createMerchantIfAbsent(merchant);
    }

    return jsonResponse({ merchant: publicMerchant(merchant) });
  } catch {
    return jsonResponse({ error: "Merchant profile service is unavailable." }, 503);
  }
};

export const PATCH: APIRoute = async ({ request, locals }) => {
  const userId = authenticatedUserId(locals);
  if (!userId) return jsonResponse({ error: "Authentication required." }, 401);
  if (!isTrustedMutation(request)) return jsonResponse({ error: "Cross-site request rejected." }, 403);
  let body: Record<string, unknown>;
  try {
    body = await readJsonObject(request, 4096);
  } catch (error) {
    if (error instanceof RequestBodyError) return jsonResponse({ error: error.message }, error.status);
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  const name = typeof body.name === "string" ? body.name.trim() : undefined;
  const vpa = typeof body.vpa === "string" ? body.vpa.trim() : undefined;
  if (name === undefined && vpa === undefined) return jsonResponse({ error: "Provide a merchant name or UPI ID to update." }, 400);
  if (name !== undefined && !validMerchantName(name)) return jsonResponse({ error: "Merchant name must be 2-80 characters." }, 400);
  if (vpa !== undefined && !validVpa(vpa)) return jsonResponse({ error: "Provide a valid UPI ID." }, 400);

  try {
    const rateLimit = await consumeRateLimit("merchant-profile-write", userId, 30, 3600);
    if (!rateLimit.allowed) return jsonResponse({ error: "Too many updates." }, 429, rateLimitHeaders(rateLimit));

    const merchant = await getMerchantByUserId(userId);
    if (!merchant) return jsonResponse({ error: "Merchant not found." }, 404);

    if (name !== undefined) merchant.name = name;
    if (vpa !== undefined) merchant.vpa = vpa;
    await createMerchant(merchant);
    return jsonResponse({ merchant: publicMerchant(merchant) });
  } catch {
    return jsonResponse({ error: "Merchant profile service is unavailable." }, 503);
  }
};
