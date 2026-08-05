import type { APIRoute } from "astro";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  normalizePaymentResponse,
  paymentResponseKey,
  PAYMENT_RESPONSE_TTL_SECONDS,
  type PaymentResponseRecord,
} from "../../../lib/paymentResponse";

export const prerender = false;

function validSignature(req: Request, body: string, secret: string): boolean {
  const timestamp = req.headers.get("x-pro-upi-timestamp") || req.headers.get("X-Pro-Upi-Timestamp");
  const receivedSignature = req.headers.get("x-pro-upi-signature") || req.headers.get("X-Pro-Upi-Signature");
  if (!timestamp || !receivedSignature || !/^\d{13}$/.test(timestamp)) return false;
  if (Math.abs(Date.now() - Number(timestamp)) > 5 * 60 * 1000) return false;

  const expected = createHmac("sha256", secret)
    .update(`${req.method}.${timestamp}.${body}`)
    .digest("hex");
  const actual = receivedSignature.replace(/^sha256=/i, "");
  if (!/^[a-f0-9]{64}$/i.test(actual) || actual.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

async function kv(command: string[]): Promise<unknown> {
  const baseUrl = import.meta.env.KV_REST_API_URL || process.env.KV_REST_API_URL;
  const token = import.meta.env.KV_REST_API_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!baseUrl || !token) throw new Error("KV is not configured");

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify([command]),
  });
  if (!response.ok) throw new Error("KV request failed");
  const data = (await response.json()) as Array<{ result?: unknown }>;
  return data[0]?.result;
}

export const POST: APIRoute = async ({ request }) => {
  const secret = import.meta.env.PAYMENT_WEBHOOK_SECRET || process.env.PAYMENT_WEBHOOK_SECRET;
  if (!secret) return new Response(JSON.stringify({ error: "Payment response service is not configured." }), { status: 503 });

  const body = await request.text();
  if (!validSignature(request, body, secret)) {
    return new Response(JSON.stringify({ error: "Invalid or expired request signature." }), { status: 401 });
  }

  try {
    const payload = JSON.parse(body) as Record<string, unknown>;
    const payment = normalizePaymentResponse(payload);
    if (!payment) {
      return new Response(JSON.stringify({ error: "Provide a valid orderId and status." }), { status: 400 });
    }

    await kv(["SET", paymentResponseKey(payment.orderId), JSON.stringify(payment), "EX", String(PAYMENT_RESPONSE_TTL_SECONDS)]);
    return new Response(JSON.stringify({ recorded: true, payment }), { status: 201 });
  } catch {
    return new Response(JSON.stringify({ error: "Request body must be JSON or KV failed." }), { status: 400 });
  }
};

export const GET: APIRoute = async ({ request, url }) => {
  const secret = import.meta.env.PAYMENT_WEBHOOK_SECRET || process.env.PAYMENT_WEBHOOK_SECRET;
  if (!secret) return new Response(JSON.stringify({ error: "Payment response service is not configured." }), { status: 503 });

  if (!validSignature(request, "", secret)) {
    return new Response(JSON.stringify({ error: "Invalid or expired request signature." }), { status: 401 });
  }

  const orderId = url.searchParams.get("orderId")?.trim();
  if (!orderId || orderId.length > 128) {
    return new Response(JSON.stringify({ error: "Provide a valid orderId." }), { status: 400 });
  }

  try {
    const saved = await kv(["GET", paymentResponseKey(orderId)]);
    if (!saved) {
      return new Response(JSON.stringify({ error: "No payment response has been recorded for this order." }), { status: 404 });
    }
    return new Response(JSON.stringify({ payment: JSON.parse(String(saved)) as PaymentResponseRecord }), { status: 200 });
  } catch {
    return new Response(JSON.stringify({ error: "Unable to retrieve the payment response." }), { status: 502 });
  }
};
