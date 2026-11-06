// PPF engine (src/lib/ppf.ts): the lowest-balance-between-the-5th-and-month-end rule, deposit limits and invariants.
//
//   npm run test:savings
//
// Vectors were produced by an independent implementation (Python `fractions`) on 2026-11-07. Sanity anchor: Rs 1,50,000 a year at
// 7.1% for 15 years, deposited by 5 April, matures at about Rs 40.68 lakh.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PPF_CURRENT_RATE_BPS, PPF_MAX_YEAR, PPF_MIN_YEAR, PPF_REVIEWED_ON, ppf, ppfDepositProblem, yearlyDeposit } from "../src/lib/ppf.ts";
import { PPF_PHRASES } from "../src/data/ppfPhrases.ts";

let checks = 0;
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const ok = (value, message) => { assert.ok(value, message); checks++; };
const R = 100;

eq(PPF_CURRENT_RATE_BPS, 710, "the rate checked for Oct-Dec 2026");
ok(/^\d{4}-\d{2}-\d{2}$/.test(PPF_REVIEWED_ON), "a review date");

const vectors = [
  ["₹12,500 a month by the 5th, 7.1%, 15 years", { deposit: 12_500 * R, pattern: "monthlyEarly", rateBps: 710, years: 15 }, { maturity: 394_459_925, deposited: 225_000_000, interest: 169_459_925 }, [[1, 15_000_000, 576_875, 15_576_875], [2, 15_000_000, 1_682_833, 32_259_708], [3, 15_000_000, 2_867_314, 50_127_022]], [15, 15_000_000, 25_694_239, 394_459_925]],
  ["₹12,500 a month after the 5th (the first month's deposit earns nothing that month)", { deposit: 12_500 * R, pattern: "monthlyLate", rateBps: 710, years: 15 }, { maturity: 392_212_469, deposited: 225_000_000, interest: 167_212_469 }, [[1, 15_000_000, 488_125, 15_488_125]], [15, 15_000_000, 25_462_381, 392_212_469]],
  ["₹1,50,000 once a year by 5 April, 7.1%, 15 years", { deposit: 150_000 * R, pattern: "yearlyEarly", rateBps: 710, years: 15 }, { maturity: 406_820_923, deposited: 225_000_000, interest: 181_820_923 }, [[1, 15_000_000, 1_065_000, 16_065_000]], [15, 15_000_000, 26_969_454, 406_820_923]],
  ["₹5,000 a month by the 5th, 7.1%, extended to 20 years", { deposit: 5_000 * R, pattern: "monthlyEarly", rateBps: 710, years: 20 }, { maturity: 258_239_209, deposited: 120_000_000, interest: 138_239_209 }, [[1, 6_000_000, 230_750, 6_230_750]], [20, 6_000_000, 16_937_193, 258_239_209]],
  ["the ₹500 minimum, once a year", { deposit: 500 * R, pattern: "yearlyEarly", rateBps: 710, years: 15 }, { maturity: 1_356_070, deposited: 750_000, interest: 606_070 }, [[1, 50_000, 3_550, 53_550]], [15, 50_000, 89_898, 1_356_070]],
  ["₹10,000 a month at 0%", { deposit: 10_000 * R, pattern: "monthlyEarly", rateBps: 0, years: 15 }, { maturity: 180_000_000, deposited: 180_000_000, interest: 0 }, [[1, 12_000_000, 0, 12_000_000]], [15, 12_000_000, 0, 180_000_000]],
  ["₹1,00,000 a year at 8%, extended to 25 years", { deposit: 100_000 * R, pattern: "yearlyEarly", rateBps: 800, years: 25 }, { maturity: 789_544_148, deposited: 250_000_000, interest: 539_544_148 }, [[1, 10_000_000, 800_000, 10_800_000]], [25, 10_000_000, 58_484_752, 789_544_148]],
];
for (const [name, input, expected, firstRows, last] of vectors) {
  const r = ppf(input);
  for (const [key, value] of Object.entries(expected)) eq(r[key], value, `${name}: ${key}`);
  eq(r.yearly.length, input.years, `${name}: one row per year`);
  firstRows.forEach((row, i) => eq([r.yearly[i].year, r.yearly[i].deposited, r.yearly[i].interest, r.yearly[i].closing], row, `${name}: year ${row[0]}`));
  eq([r.yearly.at(-1).year, r.yearly.at(-1).deposited, r.yearly.at(-1).interest, r.yearly.at(-1).closing], last, `${name}: the last year`);
  eq(r.yearly.reduce((a, y) => a + y.deposited, 0), r.deposited, `${name}: deposits add up`);
  eq(r.yearly.reduce((a, y) => a + y.interest, 0), r.interest, `${name}: interest adds up`);
  ok(r.yearly.every((y, i) => y.closing === (i === 0 ? 0 : r.yearly[i - 1].closing) + y.deposited + y.interest), `${name}: each year closes at opening + deposits + interest`);
}
ok(ppf(vectors[2][1]).maturity > 406_000_000 && ppf(vectors[2][1]).maturity < 407_000_000, "the ₹40.68 lakh anchor for ₹1.5L a year at 7.1%");

/* Deposit rules */
eq(yearlyDeposit(12_500 * R, "monthlyEarly"), 150_000 * R, "twelve monthly deposits");
eq(yearlyDeposit(150_000 * R, "yearlyEarly"), 150_000 * R, "one yearly deposit");
eq(ppfDepositProblem(12_500 * R, "monthlyEarly"), null, "₹12,500 a month is the most allowed");
eq(ppfDepositProblem(12_550 * R, "monthlyEarly"), "max", "₹12,550 a month is over ₹1.5L a year");
eq(ppfDepositProblem(150_050 * R, "yearlyEarly"), "max", "over the yearly cap");
eq(ppfDepositProblem(450 * R, "yearlyEarly"), "min", "below ₹500 a year");
eq(ppfDepositProblem(30 * R, "monthlyEarly"), "step", "not a multiple of ₹50");
eq(ppfDepositProblem(525 * R, "yearlyEarly"), "step", "₹525 is not a multiple of ₹50");
eq(ppfDepositProblem(50 * R, "monthlyEarly"), null, "₹50 a month is ₹600 a year: allowed");
eq(ppfDepositProblem(0, "yearlyEarly"), "step", "zero");
eq([PPF_MIN_YEAR, PPF_MAX_YEAR], [50_000, 15_000_000], "the limits");

/* Properties */
let seed = 20261107;
const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
const rnd = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
const patterns = ["monthlyEarly", "monthlyLate", "yearlyEarly"];
for (let i = 0; i < 300; i++) {
  const pattern = patterns[rnd(0, 2)];
  const deposit = pattern === "yearlyEarly" ? rnd(10, 3000) * 50 * R : rnd(1, 250) * 50 * R;
  const input = { deposit, pattern, rateBps: rnd(0, 1200), years: [15, 20, 25, 30][rnd(0, 3)] };
  const r = ppf(input);
  ok(Number.isSafeInteger(r.maturity), `fuzz ${i}: a safe integer`);
  ok(r.maturity >= r.deposited, `fuzz ${i}: never below what was deposited`);
  const later = ppf({ ...input, pattern: pattern === "monthlyLate" ? "monthlyEarly" : pattern });
  if (pattern === "monthlyLate") ok(later.maturity >= r.maturity, `fuzz ${i}: depositing by the 5th never earns less than after it`);
  ok(ppf({ ...input, rateBps: input.rateBps + 10 }).maturity >= r.maturity, `fuzz ${i}: a higher rate never earns less`);
  ok(ppf({ ...input, years: input.years + 5 }).maturity >= r.maturity, `fuzz ${i}: a longer account never ends lower`);
}

{
  const source = ["../src/components/PpfCalculator.tsx", "../src/lib/loanFormat.ts"].map((f) => readFileSync(new URL(f, import.meta.url), "utf8")).join("\n");
  const used = new Set([...source.matchAll(/\btr\("((?:[^"\\]|\\.)*)"\)/g)].map((m) => m[1]));
  ok(used.size > 25, "the island's tr() strings were found");
  const slots = (text) => (text.match(/\{\w+\}/g) ?? []).sort().join(",");
  for (const key of used) {
    const row = PPF_PHRASES[key];
    ok(row, `missing translation for: ${key}`);
    for (const lang of ["hi", "ta", "te", "mr"]) {
      ok(typeof row[lang] === "string" && row[lang].trim() !== "", `${lang} missing for: ${key}`);
      assert.equal(slots(row[lang]), slots(key), `${lang} {slots} differ for: ${key}`); checks++;
      ok(row[lang] !== key || /^[\d\s+—(₹)%.,:-]*$/.test(key), `${lang} left in English: ${key}`);
    }
  }
  for (const key of Object.keys(PPF_PHRASES)) ok(used.has(key), `unused translation key: ${key}`);
}

console.log(`PPF engine: ${checks} checks passed`);
