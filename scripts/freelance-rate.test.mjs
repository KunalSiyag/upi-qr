// Freelance rate engine (src/lib/freelanceRate.ts): exact vectors, the breakdown, sensitivity and invariants.
//
//   npm run test:loan   (runs this after deposits.test.mjs)
//
// Vectors were produced by an independent implementation (Python `fractions`, exact arithmetic) on 2026-11-07, following
// the model documented at the top of src/lib/freelanceRate.ts: every figure rounded UP to the minor unit.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FREELANCE_PHRASES } from "../src/data/freelancePhrases.ts";
import { hourlyAtBillable, parseHoursTenths, parsePercentBps, rateFor, workingDaysFor } from "../src/lib/freelanceRate.ts";

let checks = 0;
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const ok = (value, message) => { assert.ok(value, message); checks++; };

const mk = (takeHome, ownCosts, businessCosts, taxBps, marginBps, daysPerWeek, vacationWeeks, holidays, sickDays, hoursTenths, billableBps) =>
  ({ takeHome, ownCosts, businessCosts, taxBps, marginBps, daysPerWeek, vacationWeeks, holidays, sickDays, hoursTenths, billableBps });

/* [name, input, expected] */
const vectors = [
  ["INR default: ₹12L take-home, ₹1L own costs, ₹1L business costs, 20% tax, 10% margin", mk(120_000_000, 10_000_000, 10_000_000, 2000, 1000, 5, 4, 10, 5, 80, 6500),
    { workingDays: 225, billableHours100: 117_000, billableDays100: 14_625, taxAmount: 32_500_000, profit: 162_500_000, revenue: 189_750_000, margin: 17_250_000, hourly: 162_180, day: 1_297_436, monthly: 15_812_500 }],
  ["GBP £50k, four-day week", mk(5_000_000, 500_000, 400_000, 2500, 1000, 4, 5, 8, 5, 75, 7000),
    { workingDays: 175, billableHours100: 91_875, billableDays100: 12_250, taxAmount: 1_833_334, profit: 7_333_334, revenue: 8_506_668, margin: 773_334, hourly: 9_259, day: 69_443, monthly: 708_889 }],
  ["USD $80k, no margin", mk(8_000_000, 1_200_000, 600_000, 2800, 0, 5, 3, 8, 5, 80, 6000),
    { workingDays: 232, billableHours100: 111_360, billableDays100: 13_920, taxAmount: 3_577_778, profit: 12_777_778, revenue: 13_377_778, margin: 0, hourly: 12_014, day: 96_105, monthly: 1_114_815 }],
  ["no tax, no margin, every hour billable", mk(6_000_000, 0, 0, 0, 0, 5, 4, 0, 0, 80, 10000),
    { workingDays: 240, billableHours100: 192_000, billableDays100: 24_000, taxAmount: 0, profit: 6_000_000, revenue: 6_000_000, margin: 0, hourly: 3_125, day: 25_000, monthly: 500_000 }],
  ["EUR €60k, 7.5-hour days", mk(6_000_000, 800_000, 300_000, 3000, 1500, 5, 6, 12, 8, 75, 6500),
    { workingDays: 210, billableHours100: 102_375, billableDays100: 13_650, taxAmount: 2_914_286, profit: 9_714_286, revenue: 11_516_429, margin: 1_502_143, hourly: 11_250, day: 84_370, monthly: 959_703 }],
];
for (const [name, input, e] of vectors) {
  const r = rateFor(input);
  for (const [key, value] of Object.entries(e)) eq(r[key], value, `${name}: ${key}`);
  eq(r.afterTaxNeed, input.takeHome + input.ownCosts, `${name}: after-tax need`);
  eq(r.businessCosts, input.businessCosts, `${name}: business costs carried`);
  eq(input.takeHome + input.ownCosts + r.taxAmount + input.businessCosts + r.margin, r.revenue, `${name}: the breakdown adds up to the revenue`);
}

/* ---- Sensitivity to how much of the time you can bill ----------------------------------------------------------- */
{
  const input = vectors[0][1];
  eq([5000, 6000, 7000, 8000, 9000].map((b) => hourlyAtBillable(input, b)), [210_834, 175_695, 150_596, 131_771, 117_130], "hourly rate at 50, 60, 70, 80 and 90% billable");
  eq(hourlyAtBillable(input, 6500), rateFor(input).hourly, "the user's own share gives the headline rate");
}

/* ---- Working days and refusals ---------------------------------------------------------------------------------- */
eq(workingDaysFor({ daysPerWeek: 5, vacationWeeks: 4, holidays: 10, sickDays: 5 }), 225, "48 weeks × 5 − 10 − 5");
eq(workingDaysFor({ daysPerWeek: 4, vacationWeeks: 5, holidays: 8, sickDays: 5 }), 175, "a four-day week");
eq(rateFor({ ...vectors[0][1], vacationWeeks: 52, daysPerWeek: 5, holidays: 0, sickDays: 0 }), null, "no working days: no rate");
eq(rateFor({ ...vectors[0][1], taxBps: 10000 }), null, "a 100% tax rate: no rate");
eq(rateFor({ ...vectors[0][1], billableBps: 0 }), null, "nothing billable: no rate");

/* ---- Parsing ---------------------------------------------------------------------------------------------------- */
eq(parsePercentBps("20", 0, 6000), 2000, "whole percent");
eq(parsePercentBps("7.25", 0, 6000), 725, "two decimals");
eq(parsePercentBps("60", 0, 6000), 6000, "the cap is allowed");
eq(parsePercentBps("60.01", 0, 6000), null, "above the cap");
eq(parsePercentBps("0", 100, 10000), null, "below the floor");
eq(parsePercentBps("100", 100, 10000), 10000, "100% where allowed");
eq(parsePercentBps("abc", 0, 100), null, "text");
eq(parsePercentBps("1.234", 0, 10000), null, "three decimals");
eq(parseHoursTenths("8"), 80, "whole hours");
eq(parseHoursTenths("7.5"), 75, "half hours");
eq(parseHoursTenths("0.1"), 1, "the smallest day");
eq(parseHoursTenths("16"), 160, "the longest day");
eq(parseHoursTenths("16.5"), null, "above 16 hours");
eq(parseHoursTenths("7.55"), null, "two decimals");
eq(parseHoursTenths("0"), null, "zero hours");

/* ---- Properties over a deterministic fuzz ----------------------------------------------------------------------- */
let seed = 20261107;
const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
const rnd = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
for (let i = 0; i < 500; i++) {
  const input = mk(rnd(0, 50_000_000_00), rnd(0, 10_000_000_00), rnd(0, 10_000_000_00), rnd(0, 5000), rnd(0, 5000), rnd(1, 7), rnd(0, 12), rnd(0, 20), rnd(0, 20), rnd(30, 120), rnd(1000, 10000));
  const r = rateFor(input);
  if (r === null) { ok(workingDaysFor(input) < 1, `fuzz ${i}: only refused when there are no working days`); continue; }
  eq(input.takeHome + input.ownCosts + r.taxAmount + input.businessCosts + r.margin, r.revenue, `fuzz ${i}: the breakdown adds up`);
  ok(r.taxAmount >= 0 && r.margin >= 0, `fuzz ${i}: tax and margin are never negative`);
  // Rounded up, exactly: the rate times the billable time never leaves the revenue short, and one minor unit less would.
  const D = BigInt(r.workingDays), H = BigInt(input.hoursTenths), B = BigInt(input.billableBps), R = BigInt(r.revenue);
  ok(BigInt(r.hourly) * D * H * B >= R * 10n * 10000n, `fuzz ${i}: the hourly rate covers the revenue`);
  ok(r.hourly === 0 || BigInt(r.hourly - 1) * D * H * B < R * 10n * 10000n, `fuzz ${i}: …and is the smallest rate that does`);
  ok(BigInt(r.day) * D * B >= R * 10000n, `fuzz ${i}: the day rate covers the revenue`);
  ok(r.day === 0 || BigInt(r.day - 1) * D * B < R * 10000n, `fuzz ${i}: …and is the smallest rate that does`);
  ok(r.monthly * 12 >= r.revenue, `fuzz ${i}: twelve months cover the revenue`);
  const more = (patch) => rateFor({ ...input, ...patch });
  ok(more({ takeHome: input.takeHome + 100_000 }).hourly >= r.hourly, `fuzz ${i}: wanting more never lowers the rate`);
  ok(more({ businessCosts: input.businessCosts + 100_000 }).hourly >= r.hourly, `fuzz ${i}: higher costs never lower the rate`);
  ok(more({ taxBps: Math.min(9000, input.taxBps + 100) }).hourly >= r.hourly, `fuzz ${i}: a higher tax rate never lowers the rate`);
  ok(more({ marginBps: input.marginBps + 100 }).hourly >= r.hourly, `fuzz ${i}: a bigger margin never lowers the rate`);
  ok(more({ billableBps: Math.min(10000, input.billableBps + 100) }).hourly <= r.hourly, `fuzz ${i}: billing more of your time never raises the rate`);
  ok(more({ hoursTenths: input.hoursTenths + 5 }).hourly <= r.hourly, `fuzz ${i}: longer days never raise the rate`);
  if (input.sickDays + 1 + input.holidays + 52 * 0 < workingDaysFor(input)) ok(more({ sickDays: input.sickDays + 1 }).hourly >= r.hourly, `fuzz ${i}: more days off never lower the rate`);
}

/* ---- Translations ----------------------------------------------------------------------------------------------- */
{
  const source = ["../src/components/FreelanceRateCalculator.tsx", "../src/lib/loanFormat.ts"].map((f) => readFileSync(new URL(f, import.meta.url), "utf8")).join("\n");
  const used = new Set([...source.matchAll(/\btr\("((?:[^"\\]|\\.)*)"\)/g)].map((m) => m[1]));
  ok(used.size > 40, "the island's tr() strings were found");
  const slots = (text) => (text.match(/\{\w+\}/g) ?? []).sort().join(",");
  for (const key of used) {
    const row = FREELANCE_PHRASES[key];
    ok(row, `missing translation for: ${key}`);
    for (const lang of ["hi", "ta", "te", "mr"]) {
      ok(typeof row[lang] === "string" && row[lang].trim() !== "", `${lang} missing for: ${key}`);
      assert.equal(slots(row[lang]), slots(key), `${lang} {slots} differ for: ${key}`); checks++;
      ok(row[lang] !== key || /^[\d\s+—(₹)%.,:-]*$/.test(key), `${lang} left in English: ${key}`);
    }
  }
  for (const key of Object.keys(FREELANCE_PHRASES)) ok(used.has(key), `unused translation key: ${key}`);
}

console.log(`freelance rate engine: ${checks} checks passed`);
