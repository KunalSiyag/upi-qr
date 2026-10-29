import { razorpayConfig, type RazorpayConfig } from "./razorpay.ts";
import { dodoConfig, type DodoConfig } from "./dodo.ts";
import { dodoProvider, razorpayProvider, type BillingProviders } from "./provider.ts";
import { sponsorDodoConfig, type SponsorDodoConfig } from "../sponsors/dodo.ts";

const RAZORPAY_KEYS = ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET", "RAZORPAY_PLAN_MONTHLY", "RAZORPAY_PLAN_YEARLY"] as const;
const DODO_KEYS = ["DODO_PAYMENTS_API_KEY", "DODO_PAYMENTS_WEBHOOK_KEY", "DODO_PAYMENTS_ENVIRONMENT", "DODO_PRODUCT_MONTHLY", "DODO_PRODUCT_YEARLY", "DODO_API_BASE"] as const;

function serverEnv(keys: readonly string[]): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {};
  for (const key of keys) env[key] = (import.meta.env as Record<string, string | undefined>)[key] ?? process.env[key];
  return env;
}

/** Razorpay settings from server env; null unless all are set. */
export function billingConfig(): RazorpayConfig | null {
  return razorpayConfig(serverEnv(RAZORPAY_KEYS));
}

/** Dodo Payments settings from server env; null unless all are set. */
export function dodoBillingConfig(): DodoConfig | null {
  return dodoConfig(serverEnv(DODO_KEYS));
}

/** Self-serve sponsor booking: Dodo plus the two sponsor products; null keeps /sponsor/ on "email us". */
export function sponsorBillingConfig(): SponsorDodoConfig | null {
  return sponsorDodoConfig(dodoBillingConfig(), serverEnv(["DODO_PRODUCT_SPONSOR_FEATURED", "DODO_PRODUCT_SPONSOR_TILE"]));
}

/**
 * Live or test billing, following the provider that takes checkouts (Dodo when configured).
 * Test-mode billing data is kept apart from live data (see billingStore()).
 */
export function billingMode(): "live" | "test" {
  const dodo = dodoBillingConfig();
  if (dodo) return dodo.environment === "live_mode" ? "live" : "test";
  const razorpay = billingConfig();
  if (razorpay) return razorpay.keyId.startsWith("rzp_live_") ? "live" : "test";
  return "live";
}

/** Configured providers. Billing is available when at least one is. */
export function billingProviders(): BillingProviders {
  const dodo = dodoBillingConfig();
  const razorpay = billingConfig();
  return { dodo: dodo ? dodoProvider(dodo) : null, razorpay: razorpay ? razorpayProvider(razorpay) : null };
}

/** Only provider-hosted pages (Dodo Payments, Razorpay) may be handed to the browser as checkout or billing URLs. */
export function safeCheckoutUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const allowed = host === "rzp.io" || host === "razorpay.com" || host.endsWith(".razorpay.com")
      || host === "dodopayments.com" || host.endsWith(".dodopayments.com");
    return url.protocol === "https:" && allowed ? url.toString() : null;
  } catch {
    return null;
  }
}
