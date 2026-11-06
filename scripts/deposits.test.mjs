// Fixed and recurring deposit engine (src/lib/deposits.ts): exact vectors, payouts, tax and invariants.
//
//   npm run test:loan   (runs this after education-cost.test.mjs)
//
// Vectors were produced by an independent implementation (Python `decimal`, 60 digits) on 2026-11-06, following the
// conventions documented at the top of src/lib/deposits.ts. Sanity anchor: ₹5,00,000 at 7% for 3 years compounded
// quarterly is 5,00,000 × 1.0175^12 ≈ ₹6,15,720.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEPOSIT_PHRASES } from "../src/data/depositPhrases.ts";
import { afterTax, fdCumulative, fdCumulativeYearly, fdPayout, rdMaturity, rdYearly, yearlyReturnPercent } from "../src/lib/deposits.ts";

let checks = 0;
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const ok = (value, message) => { assert.ok(value, message); checks++; };
const L = (rupees) => rupees * 100;

/* ---- FD cumulative ---------------------------------------------------------------------------------------------- */
const cumulative = [
  ["₹5L, 7%, 36 months, quarterly", L(500_000), 700, 36, 4, 61_571_968],
  ["₹10L, 6.75%, 30 months, quarterly", L(1_000_000), 675, 30, 4, 118_215_849],
  ["₹5L, 7%, 14 months, quarterly (4 full quarters + 2 months simple)", L(500_000), 700, 14, 4, 54_218_203],
  ["₹10L, 7.25%, 24 months, monthly", L(1_000_000), 725, 24, 12, 115_553_533],
  ["₹2L, 6.5%, 18 months, yearly (1 year + 6 months simple)", L(200_000), 650, 18, 1, 21_992_250],
  ["₹3L, 7.1%, 40 months, half-yearly", L(300_000), 710, 40, 2, 37_859_985],
  ["₹1L at 0%", L(100_000), 0, 12, 4, 10_000_000],
];
for (const [name, p, bps, months, freq, maturity] of cumulative) {
  const r = fdCumulative(p, bps, months, freq);
  eq(r.maturity, maturity, `${name}: maturity`);
  eq(r.interest, maturity - p, `${name}: interest`);
  const rows = fdCumulativeYearly(p, bps, months, freq);
  eq(rows.at(-1).closing, maturity, `${name}: the last yearly row is the maturity`);
  eq(rows.reduce((a, y) => a + y.interest, 0), maturity - p, `${name}: yearly interest adds up`);
  eq(rows.length, Math.ceil(months / 12), `${name}: one row per started year`);
  ok(rows.every((y, i) => y.opening === (i === 0 ? p : rows[i - 1].closing)), `${name}: each year opens where the last closed`);
}

/* ---- FD payout -------------------------------------------------------------------------------------------------- */
const payouts = [
  ["₹10L, 7%, 12 months, monthly", L(1_000_000), 700, 12, 12, { amount: 583_333, payouts: 12, partial: 0, totalInterest: 6_999_996 }],
  ["₹10L, 7%, 14 months, quarterly", L(1_000_000), 700, 14, 4, { amount: 1_750_000, payouts: 4, partial: 1_166_667, totalInterest: 8_166_667 }],
  ["₹6L, 6.9%, 30 months, half-yearly", L(600_000), 690, 30, 2, { amount: 2_070_000, payouts: 5, partial: 0, totalInterest: 10_350_000 }],
  ["₹2L, 6.5%, 18 months, yearly", L(200_000), 650, 18, 1, { amount: 1_300_000, payouts: 1, partial: 650_000, totalInterest: 1_950_000 }],
  ["₹5L, 7.25%, 7 months, quarterly", L(500_000), 725, 7, 4, { amount: 906_250, payouts: 2, partial: 302_083, totalInterest: 2_114_583 }],
];
for (const [name, p, bps, months, freq, expected] of payouts) {
  const r = fdPayout(p, bps, months, freq);
  for (const [key, value] of Object.entries(expected)) eq(r[key], value, `${name}: ${key}`);
  eq(r.yearly.reduce((a, y) => a + y.interest, 0), expected.totalInterest, `${name}: yearly interest adds up`);
  eq(r.yearly.length, Math.ceil(months / 12), `${name}: one row per started year`);
}
eq(fdPayout(L(1_000_000), 700, 12, 12).yearly[0].interest, 6_999_996, "twelve monthly payouts all land in year one");
eq(fdPayout(L(1_000_000), 700, 14, 4).yearly.map((y) => y.interest), [7_000_000, 1_166_667], "quarterly payouts and the leftover partial fall in the right years");

/* ---- RD --------------------------------------------------------------------------------------------------------- */
const recurring = [
  ["₹5,000 a month, 7%, 60 months", L(5_000), 700, 60, 35_966_395],
  ["₹10,000 a month, 6.5%, 24 months", L(10_000), 650, 24, 25_685_060],
  ["₹2,500 a month, 7.25%, 17 months", L(2_500), 725, 17, 4_487_238],
  ["₹1,000 a month at 0%", L(1_000), 0, 12, 1_200_000],
  ["₹50,000 a month, 6.8%, 120 months", L(50_000), 680, 120, 858_986_407],
];
for (const [name, d, bps, months, maturity] of recurring) {
  const r = rdMaturity(d, bps, months);
  eq(r.maturity, maturity, `${name}: maturity`);
  eq(r.deposited, d * months, `${name}: deposited`);
  eq(r.interest, maturity - d * months, `${name}: interest`);
  const rows = rdYearly(d, bps, months);
  eq(rows.at(-1).balance, maturity, `${name}: the last yearly row is the maturity`);
  eq(rows.length, Math.ceil(months / 12), `${name}: one row per started year`);
  ok(rows.every((y) => y.balance === y.deposited + y.interest), `${name}: balance = deposited + interest`);
}

/* ---- Tax and yield ---------------------------------------------------------------------------------------------- */
eq(afterTax(1_000_000, 3000), { tax: 300_000, net: 700_000 }, "30% of ₹10,000 interest");
eq(afterTax(1, 5000), { tax: 1, net: 0 }, "half a paisa of tax rounds up");
eq(afterTax(1_000_000, 0), { tax: 0, net: 1_000_000 }, "no tax");
eq(afterTax(0, 3000), { tax: 0, net: 0 }, "no interest, no tax");
ok(Math.abs(yearlyReturnPercent(L(500_000), 61_571_968, 36) - 7.1859) < 0.001, "₹5L at 7% quarterly for 3 years is a 7.19% yearly return");
eq(yearlyReturnPercent(0, 100, 12), null, "no principal, no yield");

/* ---- Properties over a deterministic fuzz ----------------------------------------------------------------------- */
let seed = 20261106;
const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
const freqs = [1, 2, 4, 12];
for (let i = 0; i < 500; i++) {
  const p = L(Math.floor(1_000 + next() * 50_000_000));
  const bps = Math.floor(next() * 2501);
  const months = 1 + Math.floor(next() * 120);
  const freq = freqs[Math.floor(next() * 4)];
  const c = fdCumulative(p, bps, months, freq);
  const pay = fdPayout(p, bps, months, freq);
  ok(Number.isSafeInteger(c.maturity), `fuzz ${i}: the maturity stays a safe integer`);
  ok(c.maturity >= p, `fuzz ${i}: never below the principal`);
  ok(pay.totalInterest <= c.interest + freq, `fuzz ${i}: payouts never earn more than compounding (within rounding)`);
  ok(fdCumulative(p, bps, months + 1, freq).maturity >= c.maturity, `fuzz ${i}: a longer term never pays less`);
  ok(fdCumulative(p, Math.min(2500, bps + 25), months, freq).maturity >= c.maturity, `fuzz ${i}: a higher rate never pays less`);
  ok(fdCumulative(p, bps, months, 12).maturity >= fdCumulative(p, bps, months, 1).maturity - 1, `fuzz ${i}: monthly compounding is never below yearly (within rounding)`);
  const rows = fdCumulativeYearly(p, bps, months, freq);
  eq(rows.at(-1).closing, c.maturity, `fuzz ${i}: yearly table ends at the maturity`);
  const d = L(Math.floor(100 + next() * 5_000_000));
  const rd = rdMaturity(d, bps, months);
  ok(rd.maturity >= d * months && rd.interest >= 0, `fuzz ${i}: an RD never returns less than was put in`);
  ok(rdMaturity(d, bps, months + 1).maturity >= rd.maturity, `fuzz ${i}: a longer RD never pays less`);
  ok(rdMaturity(d, Math.min(2500, bps + 25), months).maturity >= rd.maturity, `fuzz ${i}: a higher RD rate never pays less`);
  eq(rdYearly(d, bps, months).at(-1).balance, rd.maturity, `fuzz ${i}: RD yearly table ends at the maturity`);
}

/* ---- Translations ----------------------------------------------------------------------------------------------- */
{
  const source = ["../src/components/DepositCalculator.tsx", "../src/lib/loanFormat.ts"].map((f) => readFileSync(new URL(f, import.meta.url), "utf8")).join("\n");
  const used = new Set([...source.matchAll(/\btr\("((?:[^"\\]|\\.)*)"\)/g)].map((m) => m[1]));
  ok(used.size > 45, "the island's tr() strings were found");
  const slots = (text) => (text.match(/\{\w+\}/g) ?? []).sort().join(",");
  for (const key of used) {
    const row = DEPOSIT_PHRASES[key];
    ok(row, `missing translation for: ${key}`);
    for (const lang of ["hi", "ta", "te", "mr"]) {
      ok(typeof row[lang] === "string" && row[lang].trim() !== "", `${lang} missing for: ${key}`);
      assert.equal(slots(row[lang]), slots(key), `${lang} {slots} differ for: ${key}`); checks++;
      ok(row[lang] !== key || /^[\d\s+—(₹)%.,:-]*$/.test(key), `${lang} left in English: ${key}`);
    }
  }
  for (const key of Object.keys(DEPOSIT_PHRASES)) ok(used.has(key), `unused translation key: ${key}`);
}

console.log(`deposit engine: ${checks} checks passed`);
