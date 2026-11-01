/**
 * Rupees in words for /amount-in-words/ and its Google Sheets function.
 * Pure and import-free so it runs under Node (scripts/words.test.mjs).
 *
 * Money is BigInt paise parsed from text: no floats, and no decimal amount is ever multiplied into paise.
 *
 * English reads the way the invoice generator does (amountInWords in src/lib/invoice/core.ts): Indian grouping,
 * and from 100 crore up the crore count is read in full ("One Hundred Crore"), never arab or kharab. The cheque
 * style is that function's text for every amount; scripts/words.test.mjs compares 300+ amounts.
 *
 * Hindi number names 0-99 and the multipliers सौ, हज़ार, लाख, करोड़ are Unicode CLDR's
 * (common/rbnf/hi.xml, %spellout-cardinal; Copyright © 1991-2026 Unicode, Inc., Unicode-DFS-2016,
 * https://www.unicode.org/copyright.html), checked in the tests against an independent
 * evaluator of the CLDR rules. A second open word list (the num2words package) agrees on 85 of the 100 words; the other
 * 15 are spelling variants of the same word (पन्द्रह and पंद्रह, निन्यानबे and निन्यानवे), so CLDR's spelling stands.
 * Two choices are ours, not CLDR's:
 *  - The wording "रुपये ... पैसे मात्र", with the singular "एक रुपया" and "एक पैसा", is conventional wording we chose.
 *  - From 100 crore up the crore count is read in full (एक सौ करोड़, एक लाख करोड़) where CLDR says अरब and खरब.
 *    They are easy to misread (खरब is 10^11, not a trillion). Below 100 crore the numbers equal CLDR's exactly.
 */

/** Date the method, sources and wording were last checked; shown on the page. */
export const WORDS_REVIEWED_ON = "2026-11-01";

/** Most digits accepted before the decimal point, so the top amount is 99,99,99,99,99,999.99. */
export const MAX_RUPEE_DIGITS = 13;
export const MAX_RUPEE_TEXT = "99,99,99,99,99,999.99";

export type WordsLanguage = "en" | "hi";
export type EnglishStyle = "cheque" | "suffix";
export type LetterCase = "title" | "upper";
export type ParseErrorCode = "empty" | "negative" | "not-a-number" | "decimal-comma" | "bad-commas" | "decimals" | "too-large";
export type ParseResult = { ok: true; paise: bigint } | { ok: false; error: ParseErrorCode };

/* ---------------- text to paise ---------------- */

const DEVANAGARI_DIGITS = /[\u0966-\u096f]/g;
const SPACES = /[\s\u200b-\u200d\u2060\ufeff]/g;
/** 1,23,456 and 12,345. */
const INDIAN_GROUPS = /^\d{1,2}(,\d{2})*,\d{3}$/;
/** 1,234,567. */
const INTERNATIONAL_GROUPS = /^\d{1,3}(,\d{3})+$/;

/**
 * Rupees typed as text → integer paise, or the reason it cannot be read. Accepts Indian or international commas,
 * spaces, Devanagari digits, a leading ₹, Rs, Rs. or INR, and a trailing "/-". At most two decimals (extra zeros
 * are fine). A comma is never a decimal point: "1,50" is refused rather than read as 150.
 */
export function parseRupees(input: string): ParseResult {
  let text = input.replace(DEVANAGARI_DIGITS, (digit) => String(digit.charCodeAt(0) - 0x966)).replace(SPACES, "");
  text = text.replace(/^(₹|rs\.?|inr)/i, "").replace(/\/-$/, "");
  if (text === "") return { ok: false, error: "empty" };
  if (/^[-\u2212]/.test(text)) return { ok: false, error: "negative" };
  if (/^\d{1,3}(\.\d{3})*,\d{1,2}$/.test(text)) return { ok: false, error: "decimal-comma" };
  const parts = /^([\d,]*)(?:\.(\d*))?$/.exec(text);
  if (parts === null || !/\d/.test(text)) return { ok: false, error: "not-a-number" };
  const grouped = parts[1];
  const fraction = parts[2] ?? "";
  if (grouped.includes(",") && !INDIAN_GROUPS.test(grouped) && !INTERNATIONAL_GROUPS.test(grouped)) {
    return { ok: false, error: "bad-commas" };
  }
  if (/[1-9]/.test(fraction.slice(2))) return { ok: false, error: "decimals" };
  const rupees = grouped.replace(/,/g, "").replace(/^0+(?=\d)/, "");
  if (rupees.length > MAX_RUPEE_DIGITS) return { ok: false, error: "too-large" };
  return { ok: true, paise: BigInt(rupees === "" ? "0" : rupees) * 100n + BigInt((fraction + "00").slice(0, 2)) };
}

/** 12505050 paise → "1,25,050.50": Indian grouping, always two decimals. */
export function formatIndian(paise: bigint): string {
  const digits = paise.toString().padStart(3, "0");
  const whole = digits.slice(0, -2);
  const head = whole.length > 3 ? `${whole.slice(0, -3).replace(/\B(?=(\d{2})+$)/g, ",")},` : "";
  return `${head}${whole.slice(-3)}.${digits.slice(-2)}`;
}

/* ---------------- English ---------------- */

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function below100(n: number): string {
  return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`;
}

function below1000(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  return [hundreds ? `${ONES[hundreds]} Hundred` : "", rest ? below100(rest) : ""].filter(Boolean).join(" ");
}

/** Crore, lakh, thousand; the crore count is itself read in words ("One Hundred Crore", "Ten Lakh Crore"). */
function indianEnglish(n: bigint): string {
  if (n === 0n) return "Zero";
  const crore = n / 10_000_000n;
  const rest = n % 10_000_000n;
  const lakh = Number(rest / 100_000n);
  const thousand = Number((rest % 100_000n) / 1000n);
  const units = Number(rest % 1000n);
  return [
    crore > 0n ? `${indianEnglish(crore)} Crore` : "",
    lakh ? `${below100(lakh)} Lakh` : "",
    thousand ? `${below100(thousand)} Thousand` : "",
    units ? below1000(units) : "",
  ].filter(Boolean).join(" ");
}

/**
 * "cheque": Rupees One Lakh Twenty Five Thousand Fifty and Fifty Paise Only (the invoice generator's text).
 * "suffix": One Lakh Twenty Five Thousand Fifty Rupees and Fifty Paise Only, with One Rupee and One Paisa.
 */
export function englishWords(paise: bigint, style: EnglishStyle = "cheque", letters: LetterCase = "title"): string {
  const rupees = paise / 100n;
  const rest = Number(paise % 100n);
  let words: string;
  if (style === "cheque") {
    words = `Rupees ${indianEnglish(rupees)}${rest ? ` and ${below100(rest)} Paise` : ""} Only`;
  } else {
    const paiseName = rest === 1 ? "Paisa" : "Paise";
    words =
      rupees === 0n && rest > 0
        ? `${below100(rest)} ${paiseName} Only`
        : `${indianEnglish(rupees)} ${rupees === 1n ? "Rupee" : "Rupees"}${rest ? ` and ${below100(rest)} ${paiseName}` : ""} Only`;
  }
  return letters === "upper" ? words.toUpperCase() : words;
}

/* ---------------- Hindi ---------------- */

/** CLDR hi %spellout-cardinal, 0 to 99. */
const HINDI_BELOW_100 = [
  "शून्य", "एक", "दो", "तीन", "चार", "पाँच", "छह", "सात", "आठ", "नौ",
  "दस", "ग्यारह", "बारह", "तेरह", "चौदह", "पन्द्रह", "सोलह", "सत्रह", "अठारह", "उन्नीस",
  "बीस", "इक्कीस", "बाईस", "तेईस", "चौबीस", "पच्चीस", "छब्बीस", "सत्ताईस", "अट्ठाईस", "उनतीस",
  "तीस", "इकतीस", "बत्तीस", "तैंतीस", "चौंतीस", "पैंतीस", "छत्तीस", "सैंतीस", "अड़तीस", "उनतालीस",
  "चालीस", "इकतालीस", "बयालीस", "तैंतालीस", "चौवालीस", "पैंतालीस", "छियालीस", "सैंतालीस", "अड़तालीस", "उनचास",
  "पचास", "इक्यावन", "बावन", "तिरेपन", "चौवन", "पचपन", "छप्पन", "सत्तावन", "अट्ठावन", "उनसठ",
  "साठ", "इकसठ", "बासठ", "तिरेसठ", "चौंसठ", "पैंसठ", "छियासठ", "सड़सठ", "अड़सठ", "उनहत्तर",
  "सत्तर", "इकहत्तर", "बहत्तर", "तिहत्तर", "चौहत्तर", "पचहत्तर", "छिहत्तर", "सतहत्तर", "अठहत्तर", "उनासी",
  "अस्सी", "इक्यासी", "बयासी", "तिरासी", "चौरासी", "पचासी", "छियासी", "सत्तासी", "अट्ठासी", "नवासी",
  "नब्बे", "इक्यानबे", "बानबे", "तिरानबे", "चौरानबे", "पंचानबे", "छियानबे", "सत्तानबे", "अट्ठानबे", "निन्यानबे",
];

/** Escapes keep the nukta decomposed, as CLDR and NFC have it: हज़ार and करोड़. */
const HINDI_HUNDRED = "सौ";
const HINDI_THOUSAND = "\u0939\u091c\u093c\u093e\u0930";
const HINDI_LAKH = "लाख";
const HINDI_CRORE = "\u0915\u0930\u094b\u0921\u093c";

/** A whole number in Hindi: CLDR's rules below 100 crore, the crore count read in full above it. */
export function hindiNumberWords(n: bigint): string {
  if (n < 100n) return HINDI_BELOW_100[Number(n)];
  const crore = n / 10_000_000n;
  const rest = n % 10_000_000n;
  const lakh = Number(rest / 100_000n);
  const thousand = Number((rest % 100_000n) / 1000n);
  const hundred = Number((rest % 1000n) / 100n);
  const tens = Number(rest % 100n);
  return [
    crore > 0n ? `${hindiNumberWords(crore)} ${HINDI_CRORE}` : "",
    lakh ? `${HINDI_BELOW_100[lakh]} ${HINDI_LAKH}` : "",
    thousand ? `${HINDI_BELOW_100[thousand]} ${HINDI_THOUSAND}` : "",
    hundred ? `${HINDI_BELOW_100[hundred]} ${HINDI_HUNDRED}` : "",
    tens ? HINDI_BELOW_100[tens] : "",
  ].filter(Boolean).join(" ");
}

/** एक लाख पच्चीस हज़ार पचास रुपये और पचास पैसे मात्र; एक रुपया and एक पैसा in the singular. */
export function hindiWords(paise: bigint): string {
  const rupees = paise / 100n;
  const rest = Number(paise % 100n);
  const paiseText = rest === 1 ? "एक पैसा" : `${HINDI_BELOW_100[rest]} पैसे`;
  if (rupees === 0n && rest > 0) return `${paiseText} मात्र`;
  const rupeeText = rupees === 1n ? "एक रुपया" : `${hindiNumberWords(rupees)} रुपये`;
  return `${rupeeText}${rest ? ` और ${paiseText}` : ""} मात्र`;
}

export function amountInWordsText(
  paise: bigint,
  options: { language?: WordsLanguage; style?: EnglishStyle; letters?: LetterCase } = {},
): string {
  return options.language === "hi" ? hindiWords(paise) : englishWords(paise, options.style, options.letters);
}

/* ---------------- Google Sheets (Apps Script) ---------------- */

export const SHEETS_FUNCTION_NAME = "AMOUNT_IN_WORDS";

/**
 * The custom function shown on the page: plain ES5, self-contained, English cheque style. Tests run this exact text
 * in a Node VM against the same amounts. It throws instead of guessing (more than 2 decimals, a range, a bad comma),
 * since a cheque amount must never be silently rounded. Number cells are checked through toFixed(2).
 */
export const SHEETS_SNIPPET = String.raw`/**
 * Amount in words for Indian rupees, cheque style.
 * Use it as =AMOUNT_IN_WORDS(A2). Check the words against the figures before you use them.
 * @param {number|string} amount The amount in rupees, with at most 2 decimals.
 * @return {string} For example: Rupees One Lakh Twenty Five Thousand Fifty and Fifty Paise Only
 * @customfunction
 */
function AMOUNT_IN_WORDS(amount) {
  var ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  var TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  function below100(n) {
    return n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : "");
  }
  function below1000(n) {
    var hundreds = Math.floor(n / 100);
    var rest = n % 100;
    return (hundreds ? ONES[hundreds] + " Hundred" : "") + (hundreds && rest ? " " : "") + (rest ? below100(rest) : "");
  }
  // Whole rupees: crore, lakh, thousand. The crore count is read in words too (One Hundred Crore).
  function indian(n) {
    if (n === 0) return "Zero";
    var crore = (n - (n % 10000000)) / 10000000;
    var rest = n % 10000000;
    var lakh = Math.floor(rest / 100000);
    var thousand = Math.floor((rest % 100000) / 1000);
    var units = rest % 1000;
    var parts = [];
    if (crore) parts.push(indian(crore) + " Crore");
    if (lakh) parts.push(below100(lakh) + " Lakh");
    if (thousand) parts.push(below100(thousand) + " Thousand");
    if (units) parts.push(below1000(units));
    return parts.join(" ");
  }

  if (Object.prototype.toString.call(amount) === "[object Array]") throw new Error("Pass one cell, not a range.");
  var text;
  if (typeof amount === "number") {
    if (!isFinite(amount) || amount < 0) throw new Error("Enter an amount of zero or more.");
    if (amount >= 10000000000000) throw new Error("That is too large: up to 13 digits before the decimal point.");
    text = amount.toFixed(2);
    if (Math.abs(Number(text) - amount) > 0.000001) throw new Error("Use at most 2 decimals, for example ROUND(A2, 2).");
  } else {
    text = String(amount).replace(/\s/g, "").replace(/^(\u20B9|rs\.?|inr)/i, "").replace(/\/-$/, "");
  }
  var match = /^([\d,]*)(?:\.(\d*))?$/.exec(text);
  if (!match || !/\d/.test(text)) throw new Error("Enter an amount in rupees, for example 125050.50.");
  var whole = match[1];
  var fraction = match[2] || "";
  if (whole.indexOf(",") >= 0 && !/^\d{1,2}(,\d{2})*,\d{3}$/.test(whole) && !/^\d{1,3}(,\d{3})+$/.test(whole)) {
    throw new Error("Check the commas: group digits like 1,23,456 or 1,234,567.");
  }
  if (/[1-9]/.test(fraction.slice(2))) throw new Error("Use at most 2 decimals, for example ROUND(A2, 2).");
  whole = whole.replace(/,/g, "").replace(/^0+(?=\d)/, "");
  if (whole.length > 13) throw new Error("That is too large: up to 13 digits before the decimal point.");
  var paise = Number((fraction + "00").slice(0, 2));
  return "Rupees " + indian(Number(whole || "0")) + (paise ? " and " + below100(paise) + " Paise" : "") + " Only";
}
`;
