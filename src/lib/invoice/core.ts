/**
 * Invoice arithmetic for the free invoice generator. Pure and import-free so it runs under Node
 * (scripts/invoice.test.mjs).
 *
 * Money is integer minor units of the invoice currency (paise, cents; whole yen for JPY, fils for KWD).
 * Quantities are thousandths (2.5 hours = 2500). Tax rates are thousandths of a percent (18% = 18000,
 * 9.975% = 9975). Products go through BigInt and round half up, so nothing passes through a float.
 */

export type Minor = number;

/** ISO 4217 minor digits for the currencies that are not 2. */
const ZERO_DIGIT = new Set(["JPY", "KRW", "VND", "CLP", "UGX", "XAF", "XOF", "ISK", "PYG", "RWF"]);
const THREE_DIGIT = new Set(["KWD", "BHD", "OMR", "JOD", "TND", "IQD", "LYD"]);

export function minorDigits(currency: string): number {
  if (ZERO_DIGIT.has(currency)) return 0;
  if (THREE_DIGIT.has(currency)) return 3;
  return 2;
}

/** Largest amount a field accepts: 10^13 minor units (100 billion with two digits). */
export const MAX_AMOUNT_MINOR = 10_000_000_000_000;
/** Largest quantity: 1,000,000 (in thousandths). */
export const MAX_QTY_MILLI = 1_000_000_000;
/** 100% in thousandths of a percent. */
export const RATE_SCALE = 100_000;

/** round(a × b / c), half up, for non-negative integers. */
export function mulDivRound(a: number, b: number, c: number): number {
  if (c <= 0) return 0;
  const n = BigInt(Math.trunc(a)) * BigInt(Math.trunc(b));
  const d = BigInt(Math.trunc(c));
  const q = n / d;
  const r = n % d;
  return Number(r * 2n >= d ? q + 1n : q);
}

/**
 * Decimal text → integer with `digits` decimals, or null. Accepts grouping and one decimal separator.
 * With `decimalComma` (es/pt/fr/de/id/it pages) a lone comma is the decimal separator ("12,5" = 12.5) and dots
 * group ("1.250,50"); otherwise commas group ("1,250.50", "1,25,000"). Both separators present: the last one is
 * the decimal point. Never more decimals than `digits`.
 */
export function parseDecimal(input: string, digits: number, decimalComma = false): number | null {
  if (typeof input !== "string") return null;
  let text = input.replace(/[\s  ']/g, "");
  if (!text) return null;
  const lastDot = text.lastIndexOf(".");
  const lastComma = text.lastIndexOf(",");
  let decimalSep = "";
  if (lastDot >= 0 && lastComma >= 0) decimalSep = lastDot > lastComma ? "." : ",";
  else if (lastComma >= 0) decimalSep = decimalComma && text.indexOf(",") === lastComma ? "," : "";
  else if (lastDot >= 0) decimalSep = decimalComma && text.indexOf(".") !== lastDot ? "" : ".";
  // A lone dot on a decimal-comma page with exactly three digits after it ("1.500") is grouping.
  if (decimalComma && decimalSep === "." && lastComma < 0 && /^\d{1,3}\.\d{3}$/.test(text)) decimalSep = "";
  const groupSep = decimalSep === "," ? "." : ",";
  let whole = text;
  let fraction = "";
  if (decimalSep) {
    const at = text.lastIndexOf(decimalSep);
    whole = text.slice(0, at);
    fraction = text.slice(at + 1);
  }
  whole = whole.split(groupSep).join("");
  if (decimalSep === "" && groupSep === ",") whole = whole.split(".").join("");
  if (!/^\d*$/.test(whole) || !/^\d*$/.test(fraction)) return null;
  if (!whole && !fraction) return null;
  if (fraction.length > digits) return null;
  if (whole.replace(/^0+/, "").length > 15) return null;
  const value = Number(`${whole || "0"}${fraction.padEnd(digits, "0")}`);
  return Number.isSafeInteger(value) ? value : null;
}

export function parseAmount(input: string, currency: string, decimalComma = false): Minor | null {
  const value = parseDecimal(input, minorDigits(currency), decimalComma);
  return value === null || value > MAX_AMOUNT_MINOR ? null : value;
}

export function parseQty(input: string, decimalComma = false): number | null {
  const value = parseDecimal(input, 3, decimalComma);
  return value === null || value > MAX_QTY_MILLI ? null : value;
}

/**
 * A number that never carries thousands grouping (a tax rate, an exchange rate): one "." or "," is the decimal
 * point on every page, so "9.975" and "9,975" are both 9.975 even where "1.500" means fifteen hundred.
 */
export function parsePlain(input: string, digits: number): number | null {
  if (typeof input !== "string") return null;
  const text = input.replace(/[\s\u00a0\u202f]/g, "");
  const match = /^(\d*)(?:[.,](\d*))?$/.exec(text);
  if (!match || (!match[1] && !match[2])) return null;
  const [, whole, fraction = ""] = match;
  if (fraction.length > digits || whole.replace(/^0+/, "").length > 9) return null;
  const value = Number(`${whole || "0"}${fraction.padEnd(digits, "0")}`);
  return Number.isSafeInteger(value) ? value : null;
}

/** "18" → 18000, "9.975" or "9,975" → 9975; null above 100% or with more than three decimals. */
export function parseRate(input: string): number | null {
  const value = parsePlain(input, 3);
  return value === null || value > RATE_SCALE ? null : value;
}

export type TaxSplit = "none" | "single" | "cgst_sgst" | "igst";

export type LineInput = { qtyMilli: number; priceMinor: Minor; rateK: number };
export type DiscountInput = { kind: "percent"; rateK: number } | { kind: "amount"; minor: Minor };

export type InvoiceInput = {
  lines: LineInput[];
  discount: DiscountInput;
  /** How the tax is shown. "none" charges no tax at all; zero-rated supplies pass rates of 0 instead. */
  split: TaxSplit;
  /** A second tax on the taxable value of lines that carry tax (Québec QST, BC PST); 0 for none. */
  extraRateK: number;
  paidMinor: Minor;
  /** Round the total to a multiple of this many minor units (100 = nearest ₹1); 0 for none. */
  roundTo: number;
};

export type TaxGroup = {
  rateK: number;
  baseMinor: Minor;
  /** One entry per printed tax line: CGST + SGST, IGST, or the single tax. */
  parts: { kind: "cgst" | "sgst" | "igst" | "tax"; rateK: number; minor: Minor }[];
  taxMinor: Minor;
};

export type InvoiceTotals = {
  lineAmounts: Minor[];
  /** Each line's amount after its share of the invoice discount (the taxable value). */
  lineBases: Minor[];
  subtotal: Minor;
  discount: Minor;
  taxable: Minor;
  groups: TaxGroup[];
  tax: Minor;
  extraBase: Minor;
  extraTax: Minor;
  roundOff: Minor;
  total: Minor;
  paid: Minor;
  balance: Minor;
};

export function lineAmount(line: LineInput): Minor {
  return mulDivRound(line.qtyMilli, line.priceMinor, 1000);
}

/** Splits `discount` across `amounts` in proportion, largest remainder first, so the shares sum exactly. */
export function allocate(amounts: Minor[], discount: Minor): Minor[] {
  const total = amounts.reduce((s, a) => s + a, 0);
  if (total <= 0 || discount <= 0) return amounts.map(() => 0);
  const d = BigInt(discount);
  const t = BigInt(total);
  const shares = amounts.map((a) => (BigInt(a) * d) / t);
  const rems = amounts.map((a, i) => ({ i, r: (BigInt(a) * d) % t }));
  let left = discount - shares.reduce((s, x) => s + Number(x), 0);
  rems.sort((x, y) => (x.r === y.r ? x.i - y.i : x.r > y.r ? -1 : 1));
  for (const { i } of rems) {
    if (left <= 0) break;
    shares[i] += 1n;
    left -= 1;
  }
  return shares.map(Number);
}

/**
 * The whole invoice. Tax is computed once per rate on the summed taxable value of that rate (CGST and SGST
 * each at half the rate), which is how GST, VAT and Japan's qualified invoices total it.
 */
export function computeInvoice(input: InvoiceInput): InvoiceTotals {
  const lineAmounts = input.lines.map(lineAmount);
  const subtotal = lineAmounts.reduce((s, a) => s + a, 0);
  const discount = Math.min(
    subtotal,
    input.discount.kind === "percent"
      ? mulDivRound(subtotal, Math.min(RATE_SCALE, Math.max(0, input.discount.rateK)), RATE_SCALE)
      : Math.max(0, input.discount.minor),
  );
  const shares = allocate(lineAmounts, discount);
  const lineBases = lineAmounts.map((a, i) => a - shares[i]);
  const taxable = subtotal - discount;

  const byRate = new Map<number, Minor>();
  input.lines.forEach((line, i) => {
    const rate = input.split === "none" ? 0 : line.rateK;
    byRate.set(rate, (byRate.get(rate) ?? 0) + lineBases[i]);
  });
  const groups: TaxGroup[] = [...byRate.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([rateK, baseMinor]) => {
      let parts: TaxGroup["parts"];
      if (input.split === "cgst_sgst") {
        const half = mulDivRound(baseMinor, rateK, RATE_SCALE * 2);
        parts = [
          { kind: "cgst", rateK: rateK / 2, minor: half },
          { kind: "sgst", rateK: rateK / 2, minor: half },
        ];
      } else {
        parts = [{ kind: input.split === "igst" ? "igst" : "tax", rateK, minor: mulDivRound(baseMinor, rateK, RATE_SCALE) }];
      }
      return { rateK, baseMinor, parts, taxMinor: parts.reduce((s, p) => s + p.minor, 0) };
    });
  const tax = groups.reduce((s, g) => s + g.taxMinor, 0);
  const extraBase = input.split === "none" ? 0 : groups.filter((g) => g.rateK > 0).reduce((s, g) => s + g.baseMinor, 0);
  const extraTax = input.extraRateK > 0 ? mulDivRound(extraBase, input.extraRateK, RATE_SCALE) : 0;
  const raw = taxable + tax + extraTax;
  const roundOff = input.roundTo > 0 ? mulDivRound(raw, 1, input.roundTo) * input.roundTo - raw : 0;
  const total = raw + roundOff;
  const paid = Math.min(total, Math.max(0, input.paidMinor));
  return { lineAmounts, lineBases, subtotal, discount, taxable, groups, tax, extraBase, extraTax, roundOff, total, paid, balance: total - paid };
}

/** Exchange rates keep six decimals (₹ per IDR is about 0.0053). */
export const FX_DIGITS = 6;

/** Converts an invoice total to INR paise at `rate6` rupees per unit (six decimals: 84.1025 → 84102500). */
export function toInrPaise(minor: Minor, currency: string, rate6: number): Minor {
  return mulDivRound(minor, rate6 * 100, 10 ** (FX_DIGITS + minorDigits(currency)));
}

/** Next invoice number: the last run of digits plus one, zero padding kept ("INV-0009" → "INV-0010"). */
export function nextInvoiceNumber(current: string): string {
  const match = /^(.*?)(\d+)(\D*)$/.exec(current.trim());
  if (!match) return `${current.trim() || "INV"}-2`;
  const [, head, digits, tail] = match;
  const next = String(BigInt(digits) + 1n).padStart(digits.length, "0");
  return `${head}${next}${tail}`;
}

/** ISO date + days, in UTC so time zones never shift it. "" for a malformed date. */
export function addDays(isoDate: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return "";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== isoDate) return "";
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/* ---------------- amount in words (English) ---------------- */

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function below100(n: number): string {
  return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`;
}

function below1000(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", rest ? below100(rest) : ""].filter(Boolean).join(" ");
}

/** Indian grouping: crore, lakh, thousand. Above 99 crore the crore count itself is read in words. */
function indianWords(n: number): string {
  if (n === 0) return "Zero";
  const crore = Math.floor(n / 10_000_000);
  const rest = n % 10_000_000;
  const lakh = Math.floor(rest / 100_000);
  const thousand = Math.floor((rest % 100_000) / 1000);
  const units = rest % 1000;
  return [
    crore ? `${indianWords(crore)} Crore` : "",
    lakh ? `${below100(lakh)} Lakh` : "",
    thousand ? `${below100(thousand)} Thousand` : "",
    units ? below1000(units) : "",
  ].filter(Boolean).join(" ");
}

function westernWords(n: number): string {
  if (n === 0) return "Zero";
  const scales = ["", "Thousand", "Million", "Billion", "Trillion"];
  const parts: string[] = [];
  let i = 0;
  while (n > 0 && i < scales.length) {
    const chunk = n % 1000;
    if (chunk) parts.unshift([below1000(chunk), scales[i]].filter(Boolean).join(" "));
    n = Math.floor(n / 1000);
    i += 1;
  }
  return parts.join(" ");
}

/** Major and minor unit names for the words line. Anything missing reads as its code. */
const UNIT_NAMES: Record<string, [string, string]> = {
  INR: ["Rupees", "Paise"], USD: ["US Dollars", "Cents"], EUR: ["Euros", "Cents"], GBP: ["Pounds Sterling", "Pence"],
  AED: ["UAE Dirhams", "Fils"], SAR: ["Saudi Riyals", "Halalas"], QAR: ["Qatari Riyals", "Dirhams"], KWD: ["Kuwaiti Dinars", "Fils"],
  BHD: ["Bahraini Dinars", "Fils"], OMR: ["Omani Rials", "Baisa"], AUD: ["Australian Dollars", "Cents"], NZD: ["New Zealand Dollars", "Cents"],
  CAD: ["Canadian Dollars", "Cents"], SGD: ["Singapore Dollars", "Cents"], HKD: ["Hong Kong Dollars", "Cents"], CHF: ["Swiss Francs", "Rappen"],
  JPY: ["Yen", ""], CNY: ["Yuan", "Fen"], MYR: ["Ringgit", "Sen"], IDR: ["Rupiah", "Sen"], PHP: ["Philippine Pesos", "Centavos"],
  THB: ["Baht", "Satang"], ZAR: ["Rand", "Cents"], NGN: ["Naira", "Kobo"], KES: ["Kenyan Shillings", "Cents"], BRL: ["Reais", "Centavos"],
  MXN: ["Mexican Pesos", "Centavos"], SEK: ["Swedish Kronor", "Öre"], NOK: ["Norwegian Kroner", "Øre"], DKK: ["Danish Kroner", "Øre"],
  PLN: ["Złoty", "Groszy"], BDT: ["Taka", "Poisha"], LKR: ["Sri Lankan Rupees", "Cents"], NPR: ["Nepalese Rupees", "Paisa"], PKR: ["Pakistani Rupees", "Paisa"],
};

/** "Rupees Seventeen Thousand Seven Hundred and Fifty Paise Only", "US Dollars One Thousand Two Hundred Only". */
export function amountInWords(minor: Minor, currency: string): string {
  const digits = minorDigits(currency);
  const scale = 10 ** digits;
  const major = Math.floor(Math.max(0, minor) / scale);
  const rest = Math.max(0, minor) % scale;
  const [majorName, minorName] = UNIT_NAMES[currency] ?? [currency, ""];
  const indian = currency === "INR" || currency === "NPR" || currency === "BDT" || currency === "PKR" || currency === "LKR";
  const words = indian ? indianWords(major) : westernWords(major);
  const restWords = rest ? (indian ? indianWords(rest) : westernWords(rest)) : "";
  const tail = rest ? (minorName ? ` and ${restWords} ${minorName}` : ` and ${rest}/${scale}`) : "";
  return `${majorName} ${words}${tail} Only`;
}
