// Education cost planner (src/lib/educationCost.ts): yearly costs with inflation, the amount needed by the start, the
// monthly saving, and the effect of waiting.
//
//   npm run test:loan   (runs this after education-loan.test.mjs)
//
// Vectors were produced by an independent implementation (Python `fractions`, exact arithmetic) on 2026-11-06, following the
// model documented at the top of src/lib/educationCost.ts: costs rounded half-up, "needed by the start" and the monthly
// amount rounded up, savings and the monthly amount compounded at rate ÷ 12.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EDUCATION_COST_PHRASES } from "../src/data/educationCostPhrases.ts";
import { CURRENCIES, formatMinor, planCost } from "../src/lib/educationCost.ts";

let checks = 0;
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const ok = (value, message) => { assert.ok(value, message); checks++; };

/* [name, input, expected] */
const vectors = [
  ["₹10L/yr, 10 years away, 4-year course, 8% rise, 10% return, ₹5L saved",
    { annualCostToday: 100_000_000, yearsUntilStart: 10, courseYears: 4, inflationBps: 800, returnBps: 1000, saved: 50_000_000 },
    { costs: [215_892_500, 233_163_900, 251_817_012, 271_962_373], totalFuture: 972_835_785, targetAtStart: 835_021_914, months: 120, savedGrowsTo: 135_352_075, gap: 699_669_839, monthly: 3_415_607, lumpNow: null, monthlyIfLater: 4_019_851 }],
  ["$30,000/yr, 12 years away, 4-year course, 5% rise, 7% return, nothing saved",
    { annualCostToday: 3_000_000, yearsUntilStart: 12, courseYears: 4, inflationBps: 500, returnBps: 700, saved: 0 },
    { costs: [5_387_569, 5_656_947, 5_939_795, 6_236_785], totalFuture: 23_221_096, targetAtStart: 20_887_580, months: 144, savedGrowsTo: 0, gap: 20_887_580, monthly: 92_960, lumpNow: null, monthlyIfLater: 105_499 }],
  ["₹5L/yr, course starting now, 3 years, 6% rise, 8% return, ₹1L saved",
    { annualCostToday: 50_000_000, yearsUntilStart: 0, courseYears: 3, inflationBps: 600, returnBps: 800, saved: 10_000_000 },
    { costs: [50_000_000, 53_000_000, 56_180_000], totalFuture: 159_180_000, targetAtStart: 146_837_022, months: 0, savedGrowsTo: 10_000_000, gap: 136_837_022, monthly: null, lumpNow: 136_837_022, monthlyIfLater: null }],
  ["zero inflation and zero return: ₹10L/yr, 5 years away, 2-year course",
    { annualCostToday: 100_000_000, yearsUntilStart: 5, courseYears: 2, inflationBps: 0, returnBps: 0, saved: 0 },
    { costs: [100_000_000, 100_000_000], totalFuture: 200_000_000, targetAtStart: 200_000_000, months: 60, savedGrowsTo: 0, gap: 200_000_000, monthly: 3_333_334, lumpNow: null, monthlyIfLater: 4_166_667 }],
  ["savings already cover it",
    { annualCostToday: 100_000_000, yearsUntilStart: 3, courseYears: 2, inflationBps: 600, returnBps: 800, saved: 1_000_000_000 },
    { costs: [119_101_600, 126_247_696], totalFuture: 245_349_296, targetAtStart: 235_673_857, months: 36, savedGrowsTo: 1_270_237_052, gap: 0, monthly: 0, lumpNow: null, monthlyIfLater: null }],
  ["₹25L/yr abroad, 8 years away, 2-year course, 8% rise, 9% return, ₹2L saved",
    { annualCostToday: 250_000_000, yearsUntilStart: 8, courseYears: 2, inflationBps: 800, returnBps: 900, saved: 20_000_000 },
    { costs: [462_732_553, 499_751_157], totalFuture: 962_483_710, targetAtStart: 919_624_129, months: 96, savedGrowsTo: 40_978_425, gap: 878_645_705, monthly: 6_282_496, lumpNow: null, monthlyIfLater: 7_546_757 }],
  ["one year away, one-year course (waiting a year is not an option)",
    { annualCostToday: 100_000_000, yearsUntilStart: 1, courseYears: 1, inflationBps: 600, returnBps: 800, saved: 0 },
    { costs: [106_000_000], totalFuture: 106_000_000, targetAtStart: 106_000_000, months: 12, savedGrowsTo: 0, gap: 106_000_000, monthly: 8_514_107, lumpNow: null, monthlyIfLater: null }],
];
for (const [name, input, e] of vectors) {
  const p = planCost(input);
  eq(p.years.map((y) => y.due), e.costs, `${name}: yearly costs`);
  for (const key of ["totalFuture", "targetAtStart", "months", "savedGrowsTo", "gap", "monthly", "lumpNow", "monthlyIfLater"]) eq(p[key], e[key], `${name}: ${key}`);
  eq(p.totalSaved, (e.monthly ?? 0) * e.months, `${name}: total saved`);
  ok(p.years.every((y) => y.today === input.annualCostToday), `${name}: today's cost is carried on every row`);
}

/* ---- Properties over a deterministic fuzz ----------------------------------------------------------------------- */
let seed = 20261106;
const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
for (let i = 0; i < 400; i++) {
  const input = {
    annualCostToday: Math.floor(next() * 5_000_000_00),
    yearsUntilStart: Math.floor(next() * 26),
    courseYears: 1 + Math.floor(next() * 8),
    inflationBps: Math.floor(next() * 2501),
    returnBps: Math.floor(next() * 2501),
    saved: Math.floor(next() * 1_000_000_00),
  };
  const p = planCost(input);
  ok(Number.isSafeInteger(p.totalFuture) && Number.isSafeInteger(p.targetAtStart) && Number.isSafeInteger(p.totalSaved), `fuzz ${i}: every figure stays a safe integer`);
  ok(p.years.every((y, k) => k === 0 || y.due >= p.years[k - 1].due), `fuzz ${i}: costs never fall year to year`);
  ok(p.targetAtStart <= p.totalFuture, `fuzz ${i}: discounting never raises the total`);
  ok(p.gap >= 0, `fuzz ${i}: the gap is never negative`);
  // The monthly amount, paid for the whole run-up, must close the gap (rounded up, so never short).
  if (p.monthly !== null && p.months > 0) {
    const i12 = input.returnBps / 120000;
    const grown = p.monthly * (i12 === 0 ? p.months : (Math.pow(1 + i12, p.months) - 1) / i12);
    ok(grown >= p.gap * (1 - 1e-9) - 1, `fuzz ${i}: the monthly amount closes the gap`);
  }
  // Saving more already, or earning more, never raises what you must put aside each month.
  const richer = planCost({ ...input, saved: input.saved + 1_000_000 });
  ok(richer.monthly === null || (p.monthly !== null && richer.monthly <= p.monthly), `fuzz ${i}: more savings never raises the monthly amount`);
  const better = planCost({ ...input, returnBps: Math.min(2500, input.returnBps + 100) });
  ok(better.monthly === null || (p.monthly !== null && better.monthly <= p.monthly), `fuzz ${i}: a higher return never raises the monthly amount`);
  if (p.monthly !== null && p.monthlyIfLater !== null) ok(p.monthlyIfLater >= p.monthly, `fuzz ${i}: waiting a year never lowers the monthly amount`);
}

/* ---- Formatting ------------------------------------------------------------------------------------------------- */
eq(formatMinor(123_456_700, "INR"), "₹12,34,567", "Indian grouping");
eq(formatMinor(123_456_700, "USD"), "$1,234,567", "US grouping");
eq(formatMinor(99, "GBP"), "£1", "whole units, rounded");
ok(CURRENCIES.length === 6, "six currencies");

/* ---- Translations ----------------------------------------------------------------------------------------------- */
{
  const source = ["../src/components/EducationCostPlanner.tsx", "../src/lib/loanFormat.ts"].map((f) => readFileSync(new URL(f, import.meta.url), "utf8")).join("\n");
  const used = new Set([...source.matchAll(/\btr\("((?:[^"\\]|\\.)*)"\)/g)].map((m) => m[1]));
  ok(used.size > 35, "the island's tr() strings were found");
  const slots = (text) => (text.match(/\{\w+\}/g) ?? []).sort().join(",");
  for (const key of used) {
    const row = EDUCATION_COST_PHRASES[key];
    ok(row, `missing translation for: ${key}`);
    for (const lang of ["hi", "ta", "te", "mr"]) {
      ok(typeof row[lang] === "string" && row[lang].trim() !== "", `${lang} missing for: ${key}`);
      assert.equal(slots(row[lang]), slots(key), `${lang} {slots} differ for: ${key}`); checks++;
      ok(row[lang] !== key || /^[\d\s+—(₹)%.,:-]*$/.test(key), `${lang} left in English: ${key}`);
    }
  }
  for (const key of Object.keys(EDUCATION_COST_PHRASES)) ok(used.has(key), `unused translation key: ${key}`);
}

console.log(`education cost planner: ${checks} checks passed`);
