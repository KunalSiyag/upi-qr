import { razorpayConfig, type RazorpayConfig } from "./razorpay.ts";

const KEYS = ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET", "RAZORPAY_PLAN_MONTHLY", "RAZORPAY_PLAN_YEARLY"] as const;

/** Razorpay settings from server env; null (billing unavailable) unless all are set. */
export function billingConfig(): RazorpayConfig | null {
  const env: Record<string, string | undefined> = {};
  for (const key of KEYS) env[key] = (import.meta.env as Record<string, string | undefined>)[key] ?? process.env[key];
  return razorpayConfig(env);
}

/** Only Razorpay-hosted pages may be handed to the browser as a checkout URL. */
export function safeCheckoutUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const allowed = host === "rzp.io" || host === "razorpay.com" || host.endsWith(".razorpay.com");
    return url.protocol === "https:" && allowed ? url.toString() : null;
  } catch {
    return null;
  }
}
