import type { APIRoute } from "astro";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  normalizePaymentResponse,
  paymentResponseKey,
  PAYMENT_RESPONSE_TTL_SECONDS,
  type PaymentResponseRecord,
} from "../../lib/paymentResponse";
import { jsonResponse, readLimitedText, RequestBodyError } from "../../lib/apiSecurity";

export const prerender = false;

function signatureContent(req: Request, body: string): string {
  if (req.method !== "GET") return body;
  const url = new URL(req.url);
  url.searchParams.sort();
  return url.searchParams.toString();
}

function validSignature(req: Request, body: string, secret: string): boolean {
  const timestamp = req.headers.get("x-pro-upi-timestamp") || req.headers.get("X-Pro-Upi-Timestamp");
  const receivedSignature = req.headers.get("x-pro-upi-signature") || req.headers.get("X-Pro-Upi-Signature");
  if (!timestamp || !receivedSignature || !/^\d{13}$/.test(timestamp)) return false;
  if (Math.abs(Date.now() - Number(timestamp)) > 5 * 60 * 1000) return false;

  const expected = createHmac("sha256", secret)
    .update(`${req.method}.${timestamp}.${signatureContent(req, body)}`)
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
  const data = (await response.json()) as Array<{ result?: unknown; error?: string }>;
  if (data[0]?.error) throw new Error(data[0].error);
  return data[0]?.result;
}

export const POST: APIRoute = async ({ request }) => {
  const secret = import.meta.env.PAYMENT_WEBHOOK_SECRET || process.env.PAYMENT_WEBHOOK_SECRET;
  if (!secret) return jsonResponse({ error: "Payment response service is not configured." }, 503);
  let body: string;
  try {
    body = await readLimitedText(request, 16384);
  } catch (error) {
    if (error instanceof RequestBodyError) return jsonResponse({ error: error.message }, error.status);
    return jsonResponse({ error: "Unable to read request body." }, 400);
  }
  if (!validSignature(request, body, secret)) {
    return jsonResponse({ error: "Invalid or expired request signature." }, 401);
  }

  let payment: PaymentResponseRecord | null;
  try {
    const payload = JSON.parse(body) as Record<string, unknown>;
    payment = normalizePaymentResponse(payload);
  } catch {
    return jsonResponse({ error: "Request body must be valid JSON." }, 400);
  }
  if (!payment) return jsonResponse({ error: "Provide a valid orderId and status." }, 400);

  try {
    const script = `
      local incoming = cjson.decode(ARGV[1])
      local existing_raw = redis.call('GET', KEYS[1])
      if existing_raw then
        local existing = cjson.decode(existing_raw)
        local ranks = { PENDING = 0, FAILED = 1, CANCELLED = 1, SUCCESS = 2 }
        if existing.amountPaise and incoming.amountPaise and existing.amountPaise ~= incoming.amountPaise then
          return '__AMOUNT_CONFLICT__'
        end
        if existing.status == 'SUCCESS' then
          if existing.transactionId and incoming.transactionId and existing.transactionId ~= incoming.transactionId then
            return '__TRANSACTION_CONFLICT__'
          end
          return cjson.encode({ recorded = false, payment = existing })
        end
        if not incoming.amountPaise and existing.amountPaise then incoming.amountPaise = existing.amountPaise end
        if not incoming.transactionId and existing.transactionId then incoming.transactionId = existing.transactionId end
        if not incoming.provider and existing.provider then incoming.provider = existing.provider end
        if (ranks[existing.status] or 0) > (ranks[incoming.status] or 0) then
          return cjson.encode({ recorded = false, payment = existing })
        end
        if existing.status == incoming.status and existing.transactionId == incoming.transactionId then
          return cjson.encode({ recorded = false, payment = existing })
        end
      end
      local encoded = cjson.encode(incoming)
      redis.call('SET', KEYS[1], encoded, 'EX', ARGV[2])
      return cjson.encode({ recorded = true, payment = incoming })
    `;
    const result = await kv([
      "EVAL",
      script,
      "1",
      paymentResponseKey(payment.orderId),
      JSON.stringify(payment),
      String(PAYMENT_RESPONSE_TTL_SECONDS),
    ]);
    if (result === "__AMOUNT_CONFLICT__") {
      return jsonResponse({ error: "Payment amount conflicts with the existing order record." }, 409);
    }
    if (result === "__TRANSACTION_CONFLICT__") {
      return jsonResponse({ error: "Transaction reference conflicts with the finalized order record." }, 409);
    }
    const saved = typeof result === "string" ? JSON.parse(result) : result;
    return jsonResponse(saved, (saved as { recorded?: boolean })?.recorded ? 201 : 200);
  } catch {
    return jsonResponse({ error: "Unable to record the payment response." }, 502);
  }
};

export const GET: APIRoute = async ({ request, url }) => {
  const secret = import.meta.env.PAYMENT_WEBHOOK_SECRET || process.env.PAYMENT_WEBHOOK_SECRET;
  if (!secret) return jsonResponse({ error: "Payment response service is not configured." }, 503);

  if (!validSignature(request, "", secret)) {
    return jsonResponse({ error: "Invalid or expired request signature." }, 401);
  }

  const orderId = url.searchParams.get("orderId")?.trim();
  if (!orderId || orderId.length > 128) {
    return jsonResponse({ error: "Provide a valid orderId." }, 400);
  }

  try {
    const saved = await kv(["GET", paymentResponseKey(orderId)]);
    if (!saved) {
      return jsonResponse({ error: "No payment response has been recorded for this order." }, 404);
    }
    return jsonResponse({ payment: JSON.parse(String(saved)) as PaymentResponseRecord });
  } catch {
    return jsonResponse({ error: "Unable to retrieve the payment response." }, 502);
  }
};
