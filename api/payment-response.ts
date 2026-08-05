import { createHmac, timingSafeEqual } from "node:crypto";
import {
  normalizePaymentResponse,
  paymentResponseKey,
  PAYMENT_RESPONSE_TTL_SECONDS,
  type PaymentResponseRecord,
} from "../src/lib/paymentResponse";

type RequestLike = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, string | string[] | undefined>;
  body?: unknown;
};

type ResponseLike = {
  status: (code: number) => ResponseLike;
  json: (body: unknown) => void;
};

function header(req: RequestLike, name: string): string | undefined {
  const value = req.headers[name] ?? req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function rawBody(req: RequestLike): string {
  if (typeof req.body === "string") return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
  return JSON.stringify(req.body ?? {});
}

function validSignature(req: RequestLike, body: string, secret: string): boolean {
  const timestamp = header(req, "x-pro-upi-timestamp");
  const receivedSignature = header(req, "x-pro-upi-signature");
  if (!timestamp || !receivedSignature || !/^\d{13}$/.test(timestamp)) return false;
  if (Math.abs(Date.now() - Number(timestamp)) > 5 * 60 * 1000) return false;

  const expected = createHmac("sha256", secret)
    .update(`${req.method ?? "GET"}.${timestamp}.${body}`)
    .digest("hex");
  const actual = receivedSignature.replace(/^sha256=/i, "");
  if (!/^[a-f0-9]{64}$/i.test(actual) || actual.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

async function kv(command: string[]): Promise<unknown> {
  const baseUrl = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
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

export default async function handler(req: RequestLike, res: ResponseLike): Promise<void> {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!secret) {
    res.status(503).json({ error: "Payment response service is not configured." });
    return;
  }

  const method = (req.method || "GET").toUpperCase();
  const body = method === "GET" ? "" : rawBody(req);
  if (!validSignature(req, body, secret)) {
    res.status(401).json({ error: "Invalid or expired request signature." });
    return;
  }

  try {
    if (method === "POST") {
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(body) as Record<string, unknown>;
      } catch {
        res.status(400).json({ error: "Request body must be JSON." });
        return;
      }

      const payment = normalizePaymentResponse(payload);
      if (!payment) {
        res.status(400).json({ error: "Provide a valid orderId and status." });
        return;
      }

      await kv(["SET", paymentResponseKey(payment.orderId), JSON.stringify(payment), "EX", String(PAYMENT_RESPONSE_TTL_SECONDS)]);
      res.status(201).json({ recorded: true, payment });
      return;
    }

    if (method === "GET") {
      const suppliedOrderId = Array.isArray(req.query.orderId) ? req.query.orderId[0] : req.query.orderId;
      const orderId = suppliedOrderId?.trim();
      if (!orderId || orderId.length > 128) {
        res.status(400).json({ error: "Provide a valid orderId." });
        return;
      }
      const saved = await kv(["GET", paymentResponseKey(orderId)]);
      if (!saved) {
        res.status(404).json({ error: "No payment response has been recorded for this order." });
        return;
      }
      res.status(200).json({ payment: JSON.parse(String(saved)) as PaymentResponseRecord });
      return;
    }

    res.status(405).json({ error: "Method not allowed." });
  } catch {
    res.status(502).json({ error: "Unable to record or retrieve the payment response." });
  }
}
