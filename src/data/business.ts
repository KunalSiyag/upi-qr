/**
 * Who runs Pro UPI QR and how to reach us — /contact/ and the policy pages read this.
 *
 * Payment providers (Dodo Payments, Razorpay) review the site's contact and policy
 * pages before turning on live payments, and often ask for a phone number and an
 * operational address too. Fill those in as you
 * want them published; `npm run launch:check` warns while they are empty.
 */
export const BUSINESS = {
  name: "Pro UPI QR",
  owner: "Kunal Siyag",
  emails: {
    support: "support@proupiqr.in",
    privacy: "privacy@proupiqr.in",
    feedback: "feedback@proupiqr.in",
    abuse: "abuse@proupiqr.in",
  },
  phone: null as string | null,
  address: null as string | null,
  replyWithin: "two working days",
};
