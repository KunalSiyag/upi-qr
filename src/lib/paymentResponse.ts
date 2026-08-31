import { parseInrToPaise, validAmountPaise, validOrderId } from "./apiSecurity";

export const PAYMENT_RESPONSE_TTL_SECONDS = 60 * 60 * 24 * 90;

export type PaymentStatus = "PENDING" | "SUCCESS" | "FAILED" | "CANCELLED";

export interface PaymentResponseRecord {
  orderId: string;
  status: PaymentStatus;
  transactionId?: string;
  amountPaise?: number;
  amount?: string; // Legacy records may contain a decimal amount string.
  currency: "INR";
  provider?: string;
  receivedAt: string;
}

const STATUS_MAP: Record<string, PaymentStatus> = {
  PENDING: "PENDING",
  CREATED: "PENDING",
  PROCESSING: "PENDING",
  SUCCESS: "SUCCESS",
  CAPTURED: "SUCCESS",
  PAID: "SUCCESS",
  FAILED: "FAILED",
  FAILURE: "FAILED",
  CANCELLED: "CANCELLED",
  CANCELED: "CANCELLED",
};

function text(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const clean = String(value).trim();
  return clean && clean.length <= maxLength ? clean : undefined;
}

/**
 * Converts a gateway/relay payload to the small, provider-neutral record we retain.
 * Send `orderId`, `status`, and optionally `transactionId`, `amount`, and `provider`.
 */
export function normalizePaymentResponse(payload: Record<string, unknown>): PaymentResponseRecord | null {
  const orderId = text(payload.orderId ?? payload.order_id ?? payload.merchantTransactionId, 128);
  const incomingStatus = text(payload.status ?? payload.paymentStatus, 32)?.toUpperCase();
  const status = incomingStatus ? STATUS_MAP[incomingStatus] : undefined;
  const suppliedCurrency = text(payload.currency, 8)?.toUpperCase();

  if (!orderId || !validOrderId(orderId) || !status || (suppliedCurrency && suppliedCurrency !== "INR")) return null;
  const amountValue = payload.amountPaise !== undefined
    ? payload.amountPaise
    : payload.amount !== undefined
      ? parseInrToPaise(payload.amount)
      : undefined;
  if (amountValue !== undefined && !validAmountPaise(amountValue)) return null;

  return {
    orderId,
    status,
    transactionId: text(payload.transactionId ?? payload.transaction_id ?? payload.utr, 128),
    amountPaise: amountValue as number | undefined,
    currency: "INR",
    provider: text(payload.provider, 64),
    receivedAt: new Date().toISOString(),
  };
}

export function paymentResponseKey(orderId: string): string {
  return `pro-upi-qr:payment-response:${orderId}`;
}
