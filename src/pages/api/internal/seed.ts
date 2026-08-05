import type { APIRoute } from "astro";
import { kv } from "@vercel/kv";

export const prerender = false;

export const GET: APIRoute = async () => {
  const testMerchant = {
    id: "m_test_123",
    name: "Test Merchant",
    apiKey: "puqi_test_12345",
    vpa: "testmerchant@ybl",
  };
  
  await kv.set(`merchant_key:${testMerchant.apiKey}`, testMerchant);
  
  return new Response(JSON.stringify({ success: true, message: "Test merchant seeded!" }), { status: 200 });
};
