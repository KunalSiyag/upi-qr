import type { APIRoute } from "astro";
import { getMerchantByUserId, createMerchant } from "../../../lib/kv";
import { v4 as uuidv4 } from "uuid";

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  // @ts-ignore - locals.auth() is added by clerk middleware
  const auth = locals.auth?.();
  if (!auth?.userId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  let merchant = await getMerchantByUserId(auth.userId);

  // If this is a new user, auto-generate a merchant profile and API key for them
  if (!merchant) {
    const newApiKey = `puqi_live_${uuidv4().replace(/-/g, "")}`;
    merchant = {
      id: `m_${uuidv4().split("-")[0]}`,
      name: "Merchant",
      apiKey: newApiKey,
      clerkUserId: auth.userId,
    };
    await createMerchant(merchant);
  }

  // Hide secret keys before sending to frontend
  const safeMerchant = {
    ...merchant,
    razorpayKeySecret: merchant.razorpayKeySecret ? "********" : undefined,
  };

  return new Response(JSON.stringify({ merchant: safeMerchant }), { status: 200 });
};

export const PATCH: APIRoute = async ({ request, locals }) => {
  // @ts-ignore
  const auth = locals.auth?.();
  if (!auth?.userId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const merchant = await getMerchantByUserId(auth.userId);
  if (!merchant) {
    return new Response(JSON.stringify({ error: "Merchant not found" }), { status: 404 });
  }

  let body: { vpa?: string; webhookUrl?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }

  // Update allowed fields
  if (body.vpa !== undefined) merchant.vpa = body.vpa;
  if (body.webhookUrl !== undefined) merchant.webhookUrl = body.webhookUrl;

  await createMerchant(merchant);

  const safeMerchant = {
    ...merchant,
    razorpayKeySecret: merchant.razorpayKeySecret ? "********" : undefined,
  };

  return new Response(JSON.stringify({ merchant: safeMerchant }), { status: 200 });
};
