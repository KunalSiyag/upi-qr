/**
 * Pro plan prices shown on /pricing/ and in the workspace (GST included). The
 * Dodo Payments products (DODO_PRODUCT_MONTHLY / DODO_PRODUCT_YEARLY, created
 * tax-inclusive by `npm run dodo:products`) must charge these same amounts; so
 * must the Razorpay plans if that fallback is used. launch:check --online verifies.
 */
export const PRO_PRICES = {
  monthly: { paise: 14_900, label: "₹149", per: "month" },
  yearly: { paise: 1_49_900, label: "₹1,499", per: "year" },
} as const;

/** Whole-rupee saving of yearly vs 12 × monthly, for "save ₹X" copy. */
export const YEARLY_SAVING_RUPEES = (PRO_PRICES.monthly.paise * 12 - PRO_PRICES.yearly.paise) / 100;

/**
 * Days after a customer's first Pro payment (and after a yearly renewal) in which they can
 * ask for a full refund — shown on /pricing/ and /refund-policy/. Set to 0 to drop the
 * guarantee from both pages.
 */
export const REFUND_WINDOW_DAYS = 7;
