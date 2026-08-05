export const PAYMENT_RESPONSE_TTL_SECONDS = 60 * 60 * 24 * 90;

export type PaymentStatus = "PENDING" | "SUCCESS" | "FAILED" | "CANCELLED";

export interface PaymentResponseRecord {
  orderId: string;
  status: PaymentStatus;
  transactionId?: string;
  amount?: string;
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

  if (!orderId || !status) return null;

  return {
    orderId,
    status,
    transactionId: text(payload.transactionId ?? payload.transaction_id ?? payload.utr, 128),
    amount: text(payload.amount, 32),
    currency: "INR",
    provider: text(payload.provider, 64),
    receivedAt: new Date().toISOString(),
  };
}

export function paymentResponseKey(orderId: string): string {
  return `pro-upi-qr:payment-response:${orderId}`;
}
