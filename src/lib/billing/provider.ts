import type { BillingStore } from "./store.ts";
import type { BillingInterval, BillingProviderId, ParsedSubscription, SubscriptionRecord } from "./subscription.ts";
import { cancelAtCycleEnd, createSubscription, fetchSubscription, type RazorpayConfig } from "./razorpay.ts";
import { cancelDodoAtPeriodEnd, createDodoCheckout, createDodoCustomer, dodoPortalLink, fetchDodoSubscription, type DodoConfig, type DodoLookupHint } from "./dodo.ts";

/**
 * One interface over the payment providers. New checkouts go to Dodo Payments
 * (merchant of record) when it is configured, else Razorpay; a subscription
 * always stays with the provider that created it (record.provider).
 */
export interface BillingProvider {
  id: BillingProviderId;
  /** Starts a hosted checkout. `subscriptionId` is what to store while unconfirmed (Dodo: the checkout session id). */
  startCheckout(input: CheckoutInput, store: BillingStore): Promise<{ subscriptionId: string; url: string }>;
  /** The subscription as the provider sees it now (accepts what startCheckout returned). */
  fetch(subscriptionId: string, now: number, hint?: DodoLookupHint): Promise<ParsedSubscription>;
  cancelAtPeriodEnd(subscriptionId: string): Promise<void>;
  /** Hosted page for payment method and invoices, when the provider has one. */
  manageUrl(owner: string, origin: string, store: BillingStore): Promise<string | null>;
}

export interface CheckoutInput {
  interval: BillingInterval;
  owner: string;
  email: string | null;
  name: string | null;
  /** Origin of the request, so a preview deployment returns to itself. */
  origin: string;
  /** Free trial length for this checkout (0 or absent: charge now). Only Dodo supports trials here. */
  trialDays?: number;
}

/** Thrown when a provider needs the account's email (for the customer record and receipt) and we don't have it. */
export class CheckoutNeedsEmail extends Error {}

export function razorpayProvider(config: RazorpayConfig, fetchImpl: typeof fetch = fetch): BillingProvider {
  return {
    id: "razorpay",
    async startCheckout({ interval, owner }) {
      const created = await createSubscription(config, interval, owner, fetchImpl);
      return { subscriptionId: created.id, url: created.shortUrl };
    },
    fetch: (id, now) => fetchSubscription(config, id, now, fetchImpl),
    cancelAtPeriodEnd: (id) => cancelAtCycleEnd(config, id, fetchImpl),
    async manageUrl() { return null; },
  };
}

export function dodoProvider(config: DodoConfig, fetchImpl: typeof fetch = fetch): BillingProvider {
  return {
    id: "dodo",
    async startCheckout({ interval, owner, email, name, origin, trialDays }, store) {
      let customerId = await store.customerFor(owner);
      if (!customerId) {
        if (!email) throw new CheckoutNeedsEmail("An email address is needed for your receipt.");
        customerId = await createDodoCustomer(config, { owner, email, name: name ?? "" }, fetchImpl);
        await store.linkCustomer(owner, customerId);
      }
      const session = await createDodoCheckout(config, {
        interval, owner, customerId, trialDays,
        returnUrl: `${origin}/app/?tab=settings&checkout=done`,
        cancelUrl: `${origin}/app/?tab=settings`,
      }, fetchImpl);
      return { subscriptionId: session.id, url: session.url };
    },
    fetch: (id, now, hint) => fetchDodoSubscription(config, id, now, fetchImpl, hint),
    cancelAtPeriodEnd: (id) => cancelDodoAtPeriodEnd(config, id, fetchImpl),
    async manageUrl(owner, origin, store) {
      const customerId = await store.customerFor(owner);
      return customerId ? dodoPortalLink(config, customerId, `${origin}/app/?tab=settings`, fetchImpl) : null;
    },
  };
}

export interface BillingProviders {
  dodo: BillingProvider | null;
  razorpay: BillingProvider | null;
}

/** Where new checkouts go. */
export const checkoutProvider = (providers: BillingProviders): BillingProvider | null => providers.dodo ?? providers.razorpay;

/** The provider that owns an existing subscription. */
export const providerFor = (record: Pick<SubscriptionRecord, "provider"> | null, providers: BillingProviders): BillingProvider | null =>
  record ? (record.provider === "dodo" ? providers.dodo : providers.razorpay) : null;
