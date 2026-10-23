/**
 * Currencies for invoicing clients abroad (docs/spec-foreign-clients.md §1.1, §3).
 * Pure functions with no imports at all, so model.ts can import it and still run under Node.
 *
 * Money is integer minor units of a currency (paise for INR, cents for USD). Nothing here
 * converts through floats: amounts are split and joined with integer operations and strings.
 */

export const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "AUD", "CAD", "SGD"] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];
export type ForeignCurrency = Exclude<CurrencyCode, "INR">;
export const FOREIGN_CURRENCIES: readonly ForeignCurrency[] = CURRENCIES.filter((c): c is ForeignCurrency => c !== "INR");
/** Integer minor units of a currency (paise for INR, cents for USD). Every amount in the workspace is one. */
export type Minor = number;
/** Minor digits per currency. All 2 today; parse/format read this, so a 0- or 3-digit currency can't slip in silently. */
export const MINOR_DIGITS: Record<CurrencyCode, 2> = { INR: 2, USD: 2, EUR: 2, GBP: 2, AED: 2, AUD: 2, CAD: 2, SGD: 2 };
export type MoneyByCurrency = Partial<Record<CurrencyCode, Minor>>;
/**
 * The one money ceiling (₹100 crore in paise; 1,000,000,000.00 in any currency). Parsers return null above it,
 * and the sanitizer's `paise` guard uses this constant, so an amount the sheet accepts is never dropped later.
 */
export const MAX_MINOR = 100_000_000_000;

export function isCurrency(v: unknown): v is CurrencyCode {
  return typeof v === "string" && (CURRENCIES as readonly string[]).includes(v);
}

export function isForeignCurrency(v: unknown): v is ForeignCurrency {
  return v !== "INR" && isCurrency(v);
}

/**
 * Display prefix per foreign currency: what Intl.NumberFormat("en-GB", { style: "currency" }) prints today
 * (the NBSP after AED and SGD included). A fixed table, because Node and browsers can ship different CLDR
 * versions; scripts/currency.test.mjs fails if the table and ICU drift apart.
 */
export const CURRENCY_PREFIX: Record<ForeignCurrency, string> = {
  USD: "US$", EUR: "€", GBP: "£", AED: "AED ", AUD: "A$", CAD: "CA$", SGD: "SGD ",
};

/**
 * INR: "₹1,23,456.78" with Indian grouping, paise only when non-zero, U+2212 minus (today's formatPaise).
 * Foreign: sign + prefix + Western-grouped major units + "." + always two minor digits ("US$1,200.50").
 */
export function formatMoney(minor: Minor, currency: CurrencyCode): string {
  const negative = minor < 0;
  const abs = Math.abs(Math.trunc(minor));
  const major = Math.floor(abs / 100);
  const rem = abs % 100;
  const sign = negative ? "−" : "";
  if (currency === "INR") {
    const grouped = new Intl.NumberFormat("en-IN").format(major);
    return `${sign}₹${grouped}${rem ? `.${String(rem).padStart(2, "0")}` : ""}`;
  }
  const grouped = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(major);
  return `${sign}${CURRENCY_PREFIX[currency]}${grouped}.${String(rem).padStart(MINOR_DIGITS[currency], "0")}`;
}

/** Plain decimal for form fields and CSV, "1250.50" (same as paiseToDecimal). */
export function minorToDecimal(minor: Minor): string {
  return `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, "0")}`;
}

/** "12" + "5" → 1250 for two minor digits: integer minor units from decimal strings, without multiplying. */
function joinMinor(major: string, fraction: string, digits: number): Minor | null {
  const minor = Number(`${major}${fraction.padEnd(digits, "0")}`);
  return Number.isSafeInteger(minor) && minor <= MAX_MINOR ? minor : null;
}

/** Symbols and codes a user may type around an amount of that currency (longest first). */
const MARKS: Record<ForeignCurrency, readonly string[]> = {
  USD: ["US$", "USD", "$"],
  EUR: ["EUR", "€"],
  GBP: ["GBP", "£"],
  AED: ["AED"],
  AUD: ["AUD", "AU$", "A$", "$"],
  CAD: ["CAD", "CA$", "C$", "$"],
  SGD: ["SGD", "S$", "$"],
};

const FOREIGN_AMOUNT_RE = /^(?:\d{1,3}(?:,\d{3})+|\d{1,10})(?:\.\d{1,2})?$/;

/**
 * User text → integer minor units; null when invalid or above MAX_MINOR.
 * INR: parseRupeesToPaise exactly ("12,50" stays 125000, because INR users type lakh grouping), plus the ceiling.
 * Foreign: whitespace and one leading or trailing symbol or code of that currency are removed, then the grouping
 * is checked BEFORE any comma is removed, so a decimal comma ("12,50", "1.200,50") is rejected, never guessed.
 */
export function parseMoneyToMinor(input: string, currency: CurrencyCode): Minor | null {
  if (typeof input !== "string") return null;
  if (currency === "INR") {
    const value = input.replace(/[,\s₹]/g, "");
    const match = /^(\d{1,10})(?:\.(\d{0,2}))?$/.exec(value);
    return match ? joinMinor(match[1], match[2] || "", MINOR_DIGITS.INR) : null;
  }
  if (!isForeignCurrency(currency)) return null;
  let value = input.replace(/\s/g, "");
  const upper = value.toUpperCase();
  const lead = MARKS[currency].find((m) => upper.startsWith(m));
  if (lead) value = value.slice(lead.length);
  else {
    const trail = MARKS[currency].find((m) => value.toUpperCase().endsWith(m));
    if (trail) value = value.slice(0, value.length - trail.length);
  }
  if (!FOREIGN_AMOUNT_RE.test(value)) return null;
  const [major, fraction = ""] = value.replace(/,/g, "").split(".");
  if (major.length > 10) return null;
  return joinMinor(major, fraction, MINOR_DIGITS[currency]);
}

export function addMoney(map: MoneyByCurrency, currency: CurrencyCode, minor: Minor): MoneyByCurrency {
  return { ...map, [currency]: (map[currency] ?? 0) + minor };
}

/** Non-zero entries in CURRENCIES order. */
export function moneyList(map: MoneyByCurrency): { currency: CurrencyCode; minor: Minor }[] {
  return CURRENCIES.filter((c) => (map[c] ?? 0) !== 0).map((c) => ({ currency: c, minor: map[c] as Minor }));
}

// ---------------------------------------------------------------------------
// Payment details: pure validators shared by the sanitizer, the settings form and the pay page.

/** Trim, upper-case, strip spaces; a SWIFT/BIC of 8 or 11 characters, else "". */
export function normalizeSwift(v: string): string {
  const s = String(v ?? "").trim().toUpperCase().replace(/\s+/g, "");
  return /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(s) ? s : "";
}

/** IBAN or account number: upper-case, spaces and "-" removed, 4–34 letters and digits, else "". */
export function normalizeAccount(v: string): string {
  const s = String(v ?? "").toUpperCase().replace(/[\s-]+/g, "");
  return /^[A-Z0-9]{4,34}$/.test(s) ? s : "";
}

export function looksLikeIban(v: string): boolean {
  return /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(v);
}

/** ISO 13616 check digits (mod 97), one digit at a time so no big integers are needed. */
export function validIban(v: string): boolean {
  const s = normalizeAccount(v);
  if (!looksLikeIban(s)) return false;
  const rearranged = `${s.slice(4)}${s.slice(0, 4)}`;
  let rem = 0;
  for (const ch of rearranged) {
    const digits = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of digits) rem = (rem * 10 + Number(d)) % 97;
  }
  return rem === 1;
}

/** Groups of four for display: "GB82 WEST 1234 5698 7654 32". */
export function formatIban(v: string): string {
  return v.replace(/\s+/g, "").replace(/(.{4})(?=.)/g, "$1 ");
}

/**
 * Hosts a "pay online" URL may point to (owner question 5; https only, exact host match).
 * Each was checked against the provider's own documentation on 2026-10-23:
 * - PayPal.Me links are paypal.me/<name> (PayPal Help Center HELP432, https://www.paypal.com/cshelp/article/HELP432);
 *   PayPal's own payment and invoice pages are on www.paypal.com.
 * - Wise Quick Pay links are wise.com/pay/... (Wise Help Centre, "Getting paid to your Wise Business by Quick Pay",
 *   https://wise.com/help/articles/5NI2GXjj7vxXgl5NZqcyFU).
 * - Stripe Payment Links are https://buy.stripe.com/... (https://docs.stripe.com/payment-links/url-parameters).
 * - Razorpay Payment Links (also used for international payments) are https://rzp.io/... (the `short_url` in
 *   https://razorpay.com/docs/api/payments/payment-links/create-standard/).
 * Payoneer and Skydo payment links are not listed: neither provider documents the hostname its links use
 * (checked https://www.payoneer.com/payment-links/, Payoneer's payment-link FAQ and https://www.skydo.com/faqs/instalinks),
 * so they can't be verified yet. Pending the owner's decision (spec owner question 14, §10 follow-ups).
 */
export const PAY_URL_HOSTS: readonly string[] = [
  "paypal.me", "www.paypal.me", "paypal.com", "www.paypal.com", "wise.com", "buy.stripe.com", "rzp.io",
];

/** https only, no credentials, no port, host in PAY_URL_HOSTS, ≤ 300 chars; the normalized href, else "". */
export function safePayUrl(v: string): string {
  if (typeof v !== "string") return "";
  const text = v.trim();
  if (!text || text.length > 300 || /[\u0000-\u001f\u007f\s\\]/.test(text)) return "";
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return "";
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return "";
  if (!PAY_URL_HOSTS.includes(url.hostname)) return "";
  return url.href.length <= 300 ? url.href : "";
}

/** GST LUT ARN: upper-case, spaces removed, 15 letters and digits, else "". */
export function normalizeLutArn(v: string): string {
  const s = String(v ?? "").toUpperCase().replace(/\s+/g, "");
  return /^[A-Z0-9]{15}$/.test(s) ? s : "";
}

const two = (n: number) => String(n % 100).padStart(2, "0");

/** Indian financial year label, "2026-27" (April to March); "" when malformed. */
export function normalizeFy(v: string): string {
  const s = String(v ?? "").trim();
  const match = /^(\d{4})-(\d{2})$/.exec(s);
  if (!match) return "";
  return match[2] === two(Number(match[1]) + 1) ? s : "";
}

/** "2027-03-31" → "2026-27"; "2027-04-01" → "2027-28"; "" for anything that isn't a date. */
export function fyOf(isoDate: string): string {
  const text = String(isoDate ?? "");
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(text);
  if (!match) return "";
  // A real calendar date only (model.ts isIsoDate's rule, inlined: this module has no imports).
  const date = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== text) return "";
  const year = Number(match[1]);
  const start = Number(match[2]) >= 4 ? year : year - 1;
  return `${start}-${two(start + 1)}`;
}

/** Rule 46 endorsement, verbatim (CGST Rules, rule 46, as substituted by Notification 17/2017-CT; spec §6). */
export const LUT_ENDORSEMENT = "SUPPLY MEANT FOR EXPORT/SUPPLY TO SEZ UNIT OR SEZ DEVELOPER FOR AUTHORISED OPERATIONS UNDER BOND OR LETTER OF UNDERTAKING WITHOUT PAYMENT OF INTEGRATED TAX";

/** The endorsement with the LUT ARN, or "" without an ARN or FY, or when the issue date is outside the LUT's FY. */
export function exportNote(arn: string, lutFy: string, issueDate: string): string {
  if (!arn || !lutFy || fyOf(issueDate) !== lutFy) return "";
  return `${LUT_ENDORSEMENT} (LUT ARN ${arn})`;
}
