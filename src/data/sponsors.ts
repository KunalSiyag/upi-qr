/**
 * Sponsored placements. First-party only: a sponsor is a name, one line, an optional logo we host in
 * public/images/sponsors/, and a link. No sponsor script, pixel or cookie ever loads (privacy policy §10).
 *
 * Pages are static, so a booking starts and ends with the deploy that falls on its dates: deploy on the start
 * and end day of each campaign. Until a slot is booked it shows the house card that links to /sponsor/.
 */
import type { SiteLang } from "../lib/locale";

export type SponsorPlacement = "home-hero";

export type Sponsor = {
  id: string;
  name: string;
  /** One line, under 90 characters, in the sponsor's own words (we edit for length and claims). */
  tagline: string;
  /** https only; utm_source/medium/campaign are added by sponsorHref(). */
  href: string;
  /** Optional path under /images/sponsors/ (PNG, SVG or WebP, at most 160×48 shown). */
  logo?: string;
  placements: SponsorPlacement[];
  /** Inclusive ISO dates (IST calendar days). */
  start: string;
  end: string;
  /** Homepages it runs on; omitted = every language. */
  langs?: SiteLang[];
};

export const SPONSORS: Sponsor[] = [];

export const PLACEMENTS: Record<SponsorPlacement, { name: string; where: string }> = {
  "home-hero": {
    name: "Homepage hero card",
    where: "Beside the headline on the homepage (English, Hindi, Tamil, Telugu and Marathi), above the fold on desktop and right under the QR generator on phones.",
  },
};

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

/** Categories we never sell a placement to (shown on /sponsor/). */
export const SPONSOR_EXCLUSIONS = [
  "Betting, gambling, fantasy sports or lotteries",
  "Crypto trading, forex or \"guaranteed return\" schemes",
  "Instant-loan or buy-now-pay-later apps",
  "Anything that asks for a UPI PIN, OTP, card details or screen-sharing access",
  "Adult content, MLM, or tobacco and alcohol",
];

function todayIst(now: Date): string {
  return new Date(now.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

/** The sponsor running in a placement on a language's homepage at build time, if any. */
export function activeSponsor(placement: SponsorPlacement, lang: SiteLang, now = new Date()): Sponsor | undefined {
  const day = todayIst(now);
  return SPONSORS.find((s) => s.placements.includes(placement) && s.start <= day && day <= s.end && (!s.langs || s.langs.includes(lang)));
}

/** The sponsor's link with our UTM tags, so the sponsor can count visits without any tracking on our side. */
export function sponsorHref(sponsor: Sponsor, placement: SponsorPlacement): string {
  const url = new URL(sponsor.href);
  if (url.protocol !== "https:") throw new Error(`Sponsor ${sponsor.id}: https links only`);
  url.searchParams.set("utm_source", "proupiqr");
  url.searchParams.set("utm_medium", "sponsor");
  url.searchParams.set("utm_campaign", placement);
  return url.href;
}
