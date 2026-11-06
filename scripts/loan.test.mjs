// Home-loan engine (src/lib/loanMath.ts): exact vectors, prepayment savings, affordability and invariants.
//
//   npm run test:loan
//
// The vectors were produced by an independent implementation (Python `decimal`, 60 digits, half-up rounding of the
// EMI and of each month's interest, last scheduled instalment clears the balance), not by this code, on 2026-11-06.
// Sanity anchor from the site's own docs: ₹10L at 9% over 20 years is an EMI of about ₹8,997.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { HOME_LOAN_PHRASES } from "../src/data/homeLoanPhrases.ts";
import {
  MAX_PRINCIPAL_PAISE, affordability, buildSchedule, emiPaise, monthLabel, monthlyInterest, parsePaise, parseRateBps, savings,
} from "../src/lib/loanMath.ts";

let checks = 0;
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks++; };
const ok = (value, message) => { assert.ok(value, message); checks++; };
const L = (rupees) => rupees * 100; // lakh/rupee helper: rupees → paise

/* ---- Exact vectors: [name, input, emi, months, totalInterest] -------------------------------------------------- */
const vectors = [
  ["₹10L @ 9% / 20y", { principal: L(1_000_000), rateBps: 900, months: 240 }, 899_726, 240, 115_934_212],
  ["₹50L @ 8.5% / 20y", { principal: L(5_000_000), rateBps: 850, months: 240 }, 4_339_116, 240, 541_387_944],
  ["₹30L @ 8.75% / 25y", { principal: L(3_000_000), rateBps: 875, months: 300 }, 2_466_431, 300, 439_929_190],
  ["₹20L @ 0% / 10y", { principal: L(2_000_000), rateBps: 0, months: 120 }, 1_666_667, 120, 0],
  ["₹10L @ 9% / 20y + ₹5,000 a month", { principal: L(1_000_000), rateBps: 900, months: 240, extraMonthly: L(5_000) }, 899_726, 103, 43_772_624],
  ["₹50L @ 8.5% / 20y + ₹5L in month 12", { principal: L(5_000_000), rateBps: 850, months: 240, lumpSum: L(500_000), lumpMonth: 12 }, 4_339_116, 192, 381_018_854],
  ["₹30L @ 8.75% / 25y + ₹2,000 a month + ₹3L in month 24", { principal: L(3_000_000), rateBps: 875, months: 300, extraMonthly: L(2_000), lumpSum: L(300_000), lumpMonth: 24 }, 2_466_431, 192, 240_960_631],
];
for (const [name, input, emi, months, interest] of vectors) {
  const s = buildSchedule(input);
  eq(s.emi, emi, `${name}: EMI`);
  eq(s.months, months, `${name}: instalments`);
  eq(s.totalInterest, interest, `${name}: total interest`);
}
eq(Math.round(emiPaise(L(1_000_000), 900, 240) / 100), 8997, "the documented ₹8,997 anchor");

/* ---- Invariants hold for every schedule ------------------------------------------------------------------------ */
function checkInvariants(input, label) {
  const s = buildSchedule(input);
  const principalPaid = s.yearly.reduce((a, y) => a + y.principalPaid + y.prepaid, 0);
  eq(principalPaid, input.principal, `${label}: principal repaid in full`);
  eq(s.totalPaid, input.principal + s.totalInterest, `${label}: paid = principal + interest`);
  eq(s.yearly.at(-1).closing, 0, `${label}: closes at zero`);
  let prev = input.principal;
  for (const y of s.yearly) {
    eq(y.opening, prev, `${label}: year ${y.year} opens where the last closed`);
    ok(y.closing >= 0, `${label}: year ${y.year} never negative`);
    eq(y.opening - y.principalPaid - y.prepaid, y.closing, `${label}: year ${y.year} balance arithmetic`);
    ok(y.months >= 1 && y.months <= 12, `${label}: year ${y.year} has 1–12 instalments`);
    prev = y.closing;
  }
  eq(s.yearly.reduce((a, y) => a + y.months, 0), s.months, `${label}: yearly months add up`);
  ok(s.months <= s.scheduledMonths, `${label}: never longer than scheduled`);
  return s;
}
for (const [name, input] of vectors) checkInvariants(input, name);

/* Deterministic pseudo-random loans (no Math.random: same cases every run). */
let seed = 20261106;
const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
for (let i = 0; i < 300; i++) {
  const principal = L(Math.floor(10_000 + next() * 50_000_000));
  const rateBps = Math.floor(next() * 2500);
  const months = 1 + Math.floor(next() * 480);
  const input = { principal, rateBps, months };
  if (next() < 0.5) input.extraMonthly = L(Math.floor(next() * 200_000));
  if (next() < 0.5) { input.lumpSum = L(Math.floor(next() * 20_000_000)); input.lumpMonth = 1 + Math.floor(next() * 500); }
  const base = checkInvariants({ principal, rateBps, months }, `fuzz ${i} base`);
  const pre = checkInvariants(input, `fuzz ${i}`);
  ok(pre.totalInterest <= base.totalInterest, `fuzz ${i}: prepaying never raises interest`);
  ok(pre.months <= base.months, `fuzz ${i}: prepaying never lengthens the loan`);
}

/* ---- Savings ---------------------------------------------------------------------------------------------------- */
{
  const base = buildSchedule(vectors[0][1]);
  const pre = buildSchedule(vectors[4][1]);
  const sv = savings(base, pre);
  eq(sv.monthsSaved, 240 - 103, "extra ₹5,000 a month saves 137 months");
  eq(sv.interestSaved, 115_934_212 - 43_772_624, "and the interest difference");
}

/* ---- Edges ------------------------------------------------------------------------------------------------------ */
{
  eq(buildSchedule({ principal: 0, rateBps: 900, months: 12 }).months, 0, "zero principal: no instalments");
  eq(buildSchedule({ principal: L(100_000), rateBps: 900, months: 1 }).months, 1, "one-month loan");
  const s = buildSchedule({ principal: L(100_000), rateBps: 900, months: 12, lumpSum: L(99_999_999), lumpMonth: 3 });
  eq(s.months, 3, "an oversized lump sum clears the loan and stops");
  eq(s.yearly.at(-1).closing, 0, "…at zero");
  const late = buildSchedule({ principal: L(100_000), rateBps: 900, months: 12, lumpSum: L(50_000), lumpMonth: 40 });
  eq(late.months, 12, "a lump sum after the loan ended is ignored");
  eq(monthlyInterest(L(1_000_000), 900), 750_000, "₹10L at 9% costs ₹7,500 in month one");
  eq(monthlyInterest(1, 1), 0, "sub-paisa interest rounds to zero");
  eq(monthlyInterest(60_000, 1), 1, "…and half a paisa rounds up");
}

/* ---- Affordability ---------------------------------------------------------------------------------------------- */
{
  const a = affordability(L(100_000), L(10_000), 50, 850, 240);
  eq(a.maxEmi, L(40_000), "₹1L income, 50% FOIR, ₹10k existing EMIs → ₹40,000 EMI");
  eq(a.maxLoan, 460_923_300, "…supports a ₹46.09 lakh loan at 8.5% for 20 years (independent value 460,923,359 paise, floored to the rupee)");
  ok(emiPaise(a.maxLoan, 850, 240) <= a.maxEmi, "the EMI on that loan fits the budget");
  ok(emiPaise(a.maxLoan + L(1000), 850, 240) > a.maxEmi - 1_000, "a ₹1,000 bigger loan is close to the limit");
  eq(affordability(L(30_000), L(20_000), 50, 850, 240).maxLoan, 0, "existing EMIs above the budget → nothing");
  eq(affordability(L(100_000), 0, 50, 0, 120).maxLoan, L(50_000) * 120, "zero rate: EMI × months");
}

/* ---- Parsing ---------------------------------------------------------------------------------------------------- */
{
  eq(parsePaise("12,50,000"), 125_000_000, "Indian grouping");
  eq(parsePaise("1250000.5"), 125_000_050, "one decimal");
  eq(parsePaise("0.07"), 7, "paise");
  eq(parsePaise(""), null, "empty");
  eq(parsePaise("-5"), null, "negative");
  eq(parsePaise("1e6"), null, "exponent");
  eq(parsePaise("1.234"), null, "three decimals");
  eq(parsePaise("1000000001"), null, "above ₹100 crore");
  eq(parsePaise("1000000000"), MAX_PRINCIPAL_PAISE, "exactly ₹100 crore");
  eq(parseRateBps("8.75"), 875, "rate");
  eq(parseRateBps("9"), 900, "whole rate");
  eq(parseRateBps("50"), 5000, "50% cap allowed");
  eq(parseRateBps("50.01"), null, "above the cap");
  eq(parseRateBps("abc"), null, "text");
  eq(monthLabel("2026-11-06", 0), "Nov 2026", "month label");
  eq(monthLabel("2026-11-06", 14), "Jan 2028", "month label across years");
  eq(monthLabel("nonsense", 1), null, "bad date");
}

/* ---- Translations: every string the island passes to tr() exists in hi/ta/te/mr with the same {slots} -------------- */
{
  const source = ["../src/components/HomeLoanCalculator.tsx", "../src/lib/loanFormat.ts"].map((f) => readFileSync(new URL(f, import.meta.url), "utf8")).join("\n");
  const used = new Set([...source.matchAll(/\btr\("((?:[^"\\]|\\.)*)"\)/g)].map((m) => m[1]));
  ok(used.size > 50, "the island's tr() strings were found");
  const slots = (text) => (text.match(/\{\w+\}/g) ?? []).sort().join(",");
  for (const key of used) {
    const row = HOME_LOAN_PHRASES[key];
    ok(row, `missing translation for: ${key}`);
    for (const lang of ["hi", "ta", "te", "mr"]) {
      ok(typeof row[lang] === "string" && row[lang].trim() !== "", `${lang} missing for: ${key}`);
      eq(slots(row[lang]), slots(key), `${lang} {slots} differ for: ${key}`);
      ok(row[lang] !== key || /^[\d\s+—(₹)%.,:-]*$/.test(key), `${lang} left in English: ${key}`);
    }
  }
  for (const key of Object.keys(HOME_LOAN_PHRASES)) ok(used.has(key), `unused translation key: ${key}`);
}

console.log(`loan engine: ${checks} checks passed`);
