// Mortgage engine (src/lib/mortgage.ts): exact vectors, agreement with the home-loan engine, affordability and invariants.
//
//   npm run test:loan   (runs this after freelance-rate.test.mjs)
//
// Vectors were produced by an independent implementation (Python `decimal`, 60 digits) on 2026-11-07, following the model
// documented at the top of src/lib/mortgage.ts. Sanity anchor: a $320,000 loan at 6.5% over 30 years is $2,022.62 a month.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MORTGAGE_PHRASES } from "../src/data/mortgagePhrases.ts";
import { buildSchedule } from "../src/lib/loanMath.ts";
import { affordableHome, mortgage } from "../src/lib/mortgage.ts";

let checks = 0;
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const ok = (value, message) => { assert.ok(value, message); checks++; };
const M = 100;

const mk = (price, down, rateBps, years, taxYear, insuranceYear, hoaMonth, miBps, miStopBps, extraMonthly = 0, lumpSum = 0, lumpMonth = 0) =>
  ({ price: price * M, down: down * M, rateBps, years, taxYear: taxYear * M, insuranceYear: insuranceYear * M, hoaMonth: hoaMonth * M, miBps, miStopBps, extraMonthly: extraMonthly * M, lumpSum: lumpSum * M, lumpMonth });

/* [name, input, expected] */
const vectors = [
  ["$400k, 20% down, 6.5%, 30 years, tax $4,400, insurance $1,200", mk(400_000, 80_000, 650, 30, 4_400, 1_200, 0, 0, 8000),
    { loan: 32_000_000, emi: 202_262, taxMonth: 36_667, insuranceMonth: 10_000, miMonth: 0, firstTotal: 248_929, months: 360, totalInterest: 40_814_064, totalMi: 0, miMonths: 0, totalTax: 13_200_120, totalInsurance: 3_600_000, totalHoa: 0, totalPaid: 89_614_184 }],
  ["10% down, mortgage insurance 0.6% until the balance is 80% of the price, $150 HOA", mk(400_000, 40_000, 650, 30, 4_400, 1_200, 150, 60, 8000),
    { loan: 36_000_000, emi: 227_544, taxMonth: 36_667, insuranceMonth: 10_000, miMonth: 18_000, firstTotal: 307_211, months: 360, totalInterest: 45_916_400, totalMi: 1_710_000, miMonths: 95, totalTax: 13_200_120, totalInsurance: 3_600_000, totalHoa: 5_400_000, totalPaid: 105_826_520 }],
  ["same with $300 extra a month", mk(400_000, 40_000, 650, 30, 4_400, 1_200, 150, 60, 8000, 300),
    { loan: 36_000_000, emi: 227_544, firstTotal: 307_211, months: 262, totalInterest: 31_475_733, totalMi: 1_008_000, miMonths: 56, totalTax: 9_606_754, totalInsurance: 2_620_000, totalHoa: 3_930_000, totalPaid: 84_640_487 }],
  ["15 years, 3% down, insurance 0.9% until 78%, $20k lump after month 24", mk(300_000, 9_000, 590, 15, 3_000, 900, 0, 90, 7800, 0, 20_000, 24),
    { loan: 29_100_000, emi: 243_993, taxMonth: 25_000, insuranceMonth: 7_500, miMonth: 21_825, firstTotal: 298_318, months: 164, totalInterest: 12_686_207, totalMi: 742_050, miMonths: 34, totalTax: 4_100_000, totalInsurance: 1_230_000, totalPaid: 47_858_257 }],
  ["₹80 lakh, 25% down, 8.5%, 20 years (rupees)", mk(8_000_000, 2_000_000, 850, 20, 0, 0, 0, 0, 8000),
    { loan: 600_000_000, emi: 5_206_939, firstTotal: 5_206_939, months: 240, totalInterest: 649_665_603, totalPaid: 1_249_665_603 }],
  ["zero rate: 200k, 10% down, 10 years", mk(200_000, 20_000, 0, 10, 2_000, 600, 0, 0, 8000),
    { loan: 18_000_000, emi: 150_000, taxMonth: 16_667, insuranceMonth: 5_000, firstTotal: 171_667, months: 120, totalInterest: 0, totalTax: 2_000_040, totalInsurance: 600_000, totalPaid: 20_600_040 }],
];
for (const [name, input, expected] of vectors) {
  const r = mortgage(input);
  for (const [key, value] of Object.entries(expected)) eq(r[key], value, `${name}: ${key}`);
  eq(r.yearly.reduce((a, y) => a + y.principal, 0), r.loan, `${name}: yearly principal adds up to the loan`);
  eq(r.yearly.reduce((a, y) => a + y.interest, 0), r.totalInterest, `${name}: yearly interest adds up`);
  eq(r.yearly.reduce((a, y) => a + y.mortgageInsurance, 0), r.totalMi, `${name}: yearly mortgage insurance adds up`);
  eq(r.yearly.reduce((a, y) => a + y.taxInsFees, 0), r.totalTax + r.totalInsurance + r.totalHoa, `${name}: yearly tax, insurance and fees add up`);
  eq(r.yearly.at(-1).balance, 0, `${name}: the loan ends at zero`);
  eq(r.yearly.length, Math.ceil(r.months / 12), `${name}: one row per started year`);
}
eq(mortgage(vectors[0][1]).emi, 202_262, "the $2,022.62 anchor");

/* ---- The principal-and-interest side agrees with the home-loan engine ------------------------------------------- */
for (const [name, input] of vectors) {
  const s = buildSchedule({ principal: input.price - input.down, rateBps: input.rateBps, months: input.years * 12, extraMonthly: input.extraMonthly, lumpSum: input.lumpSum, lumpMonth: input.lumpMonth });
  const r = mortgage(input);
  eq([r.emi, r.months, r.totalInterest], [s.emi, s.months, s.totalInterest], `${name}: same payment, months and interest as loanMath`);
}

/* ---- Affordability ---------------------------------------------------------------------------------------------- */
const afford = (incomeYear, debtsMonth, frontBps, backBps, downBps, rateBps, years, taxBps, insuranceBps, hoaMonth, miBps, miStopBps) =>
  ({ incomeYear: incomeYear * M, debtsMonth: debtsMonth * M, frontBps, backBps, downBps, rateBps, years, taxBps, insuranceBps, hoaMonth: hoaMonth * M, miBps, miStopBps });
const affordVectors = [
  ["$120k income, $500 debts, 28/36, 20% down, 6.5%, 30 years, tax 1.1%, insurance 0.3%", afford(120_000, 500, 2800, 3600, 2000, 650, 30, 110, 30, 0, 0, 8000),
    { monthlyIncome: 1_000_000, maxHousing: 280_000, price: 44_992_900, loan: 35_994_320, emi: 227_509, taxMonth: 41_243, insuranceMonth: 11_248, miMonth: 0 }],
  ["same with 5% down and 0.6% mortgage insurance", afford(120_000, 500, 2800, 3600, 500, 650, 30, 110, 30, 0, 60, 8000),
    { monthlyIncome: 1_000_000, maxHousing: 280_000, price: 36_619_000, loan: 34_788_050, emi: 219_884, taxMonth: 33_567, insuranceMonth: 9_155, miMonth: 17_394 }],
  ["₹30L income, ₹20k debts, 40/50, 25% down, 8.5%, 20 years", afford(3_000_000, 20_000, 4000, 5000, 2500, 850, 20, 0, 0, 0, 0, 8000),
    { monthlyIncome: 25_000_000, maxHousing: 10_000_000, price: 1_536_411_200, loan: 1_152_308_400, emi: 10_000_000 }],
  ["debts leave no room", afford(60_000, 2_000, 2800, 3600, 2000, 650, 30, 110, 30, 0, 0, 8000), { monthlyIncome: 500_000, maxHousing: 0, price: 0 }],
];
for (const [name, input, expected] of affordVectors) {
  const r = affordableHome(input);
  for (const [key, value] of Object.entries(expected)) eq(r[key], value, `${name}: ${key}`);
  if (r.price > 0) {
    ok(r.total <= r.maxHousing, `${name}: the first-month cost fits the budget`);
    const bigger = affordableHome({ ...input, incomeYear: input.incomeYear }); // same call: determinism
    eq(bigger.price, r.price, `${name}: deterministic`);
  }
}

/* ---- Properties over a deterministic fuzz ----------------------------------------------------------------------- */
let seed = 20261107;
const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
const rnd = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
for (let i = 0; i < 300; i++) {
  const price = rnd(50_000, 3_000_000);
  const input = mk(price, Math.floor(price * next() * 0.5), rnd(0, 1200), rnd(1, 40), rnd(0, 20_000), rnd(0, 6_000), rnd(0, 800), rnd(0, 150), rnd(5000, 9000));
  const r = mortgage(input);
  eq(r.totalPaid, r.loan + r.totalInterest + r.totalTax + r.totalInsurance + r.totalHoa + r.totalMi, `fuzz ${i}: the totals add up`);
  eq(r.yearly.reduce((a, y) => a + y.principal, 0), r.loan, `fuzz ${i}: the loan is repaid in full`);
  ok(r.months <= input.years * 12, `fuzz ${i}: never longer than the term`);
  ok(r.miMonths <= r.months, `fuzz ${i}: mortgage insurance never outlasts the loan`);
  const extra = mortgage({ ...input, extraMonthly: rnd(1, 2000) * M });
  ok(extra.totalInterest <= r.totalInterest && extra.months <= r.months, `fuzz ${i}: extra payments never cost more interest or time`);
  ok(extra.totalMi <= r.totalMi, `fuzz ${i}: …and never more mortgage insurance`);
  const bigger = mortgage({ ...input, down: Math.min(input.price, input.down + 1_000_00) });
  ok(bigger.totalInterest <= r.totalInterest, `fuzz ${i}: a bigger down payment never costs more interest`);
}
for (let i = 0; i < 150; i++) {
  const a = afford(rnd(20_000, 600_000), rnd(0, 3000), rnd(1500, 4500), rnd(2500, 5500), rnd(0, 5000), rnd(100, 1200), rnd(5, 40), rnd(0, 300), rnd(0, 100), rnd(0, 500), rnd(0, 120), rnd(6000, 9000));
  const r = affordableHome(a);
  ok(r.price % 100 === 0, `afford fuzz ${i}: a whole-unit price`);
  if (r.price > 0) ok(r.total <= r.maxHousing, `afford fuzz ${i}: fits the budget`);
  ok(affordableHome({ ...a, incomeYear: a.incomeYear + 1_000_00 }).price >= r.price, `afford fuzz ${i}: more income never lowers the price`);
  ok(affordableHome({ ...a, rateBps: a.rateBps + 50 }).price <= r.price, `afford fuzz ${i}: a higher rate never raises the price`);
  ok(affordableHome({ ...a, debtsMonth: a.debtsMonth + 100_00 }).price <= r.price, `afford fuzz ${i}: more debt never raises the price`);
}

/* ---- Translations ----------------------------------------------------------------------------------------------- */
{
  const source = ["../src/components/MortgageCalculator.tsx", "../src/lib/loanFormat.ts"].map((f) => readFileSync(new URL(f, import.meta.url), "utf8")).join("\n");
  const used = new Set([...source.matchAll(/\btr\("((?:[^"\\]|\\.)*)"\)/g)].map((m) => m[1]));
  ok(used.size > 50, "the island's tr() strings were found");
  const slots = (text) => (text.match(/\{\w+\}/g) ?? []).sort().join(",");
  for (const key of used) {
    const row = MORTGAGE_PHRASES[key];
    ok(row, `missing translation for: ${key}`);
    for (const lang of ["hi", "ta", "te", "mr"]) {
      ok(typeof row[lang] === "string" && row[lang].trim() !== "", `${lang} missing for: ${key}`);
      assert.equal(slots(row[lang]), slots(key), `${lang} {slots} differ for: ${key}`); checks++;
      ok(row[lang] !== key || /^[\d\s+—(₹)%.,:-]*$/.test(key), `${lang} left in English: ${key}`);
    }
  }
  for (const key of Object.keys(MORTGAGE_PHRASES)) ok(used.has(key), `unused translation key: ${key}`);
}

console.log(`mortgage engine: ${checks} checks passed`);
