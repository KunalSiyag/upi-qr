/**
 * Sponsored placements on the homepages, sold self-serve (src/lib/sponsors/, /sponsor/). First-party only: a
 * sponsor is a name, a logo we host, an https link and (featured card) one line. No sponsor script, pixel or
 * cookie ever loads (privacy policy §10).
 *
 * Prices must match the Dodo Payments products (`npm run dodo:sponsor-products`, INR, GST included).
 */

export type SponsorTier = "featured" | "tile";

export const SPONSOR_TIERS: Record<SponsorTier, {
  name: string;
  paise: number;
  label: string;
  spots: number;
  /** Featured bookings run in blocks of 30 days, paid upfront; tiles renew monthly until cancelled. */
  billing: "upfront" | "monthly";
  maxMonths: number;
  where: string;
}> = {
  featured: {
    name: "Featured card",
    paise: 300_000,
    label: "₹3,000",
    spots: 1,
    billing: "upfront",
    maxMonths: 3,
    where: "Beside the headline on the homepage (English, Hindi, Tamil, Telugu and Marathi), above the fold on desktop and right under the QR generator on phones. Your logo, name and one line.",
  },
  tile: {
    name: "Logo tile",
    paise: 99_900,
    label: "₹999",
    spots: 8,
    billing: "monthly",
    maxMonths: 1,
    where: "In the \"Supported by\" strip directly under the QR generator on the same homepages. Your logo and name.",
  },
};

/** One booking period of the featured card ("a month"). */
export const SPONSOR_PERIOD_DAYS = 30;

/** How far ahead the featured card can be booked. */
export const FEATURED_BOOK_AHEAD_DAYS = 180;

/**
 * Reach shown on /sponsor/: Google Search Console only (the weekly digest, GitHub issue "seo-digest"), so every
 * number has a source. Update it from the latest digest; never round up.
 */
export const SPONSOR_REACH = {
  period: "17–23 October 2026",
  source: "Google Search Console",
  weeklyClicks: 1080,
  weeklyImpressions: 31838,
  clicksChange: "+22%",
};

/** Categories we never sell a placement to (shown on /sponsor/ and in the booking form). */
export const SPONSOR_EXCLUSIONS = [
  "Betting, gambling, fantasy sports or lotteries",
  "Crypto trading, forex or \"guaranteed return\" schemes",
  "Instant-loan or buy-now-pay-later apps",
  "Anything that asks for a UPI PIN, OTP, card details or screen-sharing access",
  "Adult content, MLM, or tobacco and alcohol",
];
