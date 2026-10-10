/**
 * Pro plan prices shown on /pricing/ and in the workspace. The Razorpay plans
 * (RAZORPAY_PLAN_MONTHLY / RAZORPAY_PLAN_YEARLY) must be created with these
 * same amounts — the page cannot read them from Razorpay.
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
