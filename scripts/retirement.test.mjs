// Retirement planner engine (src/lib/retirement.ts): corpus projection, corpus needed, shortfall, NPS exit split.
//
//   npm run test:savings
//
// Vectors come from an independent implementation (Python `decimal`, 60 digits) on 2026-11-07, using the same stated model: monthly
// compounding at r/12, savings and spending at the start of each month, yearly inflation and step-up. The engine uses floating point
// and rounds to the paisa at the end, so it may differ from the exact value by a few paise.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NPS_MIN_ANNUITY_PCT, RETIREMENT_REVIEWED_ON, corpusNeeded, npsExit, retirement, retirementProblem } from "../src/lib/retirement.ts";
import { RETIREMENT_PHRASES } from "../src/data/retirementPhrases.ts";

let checks = 0;
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const ok = (value, message) => { assert.ok(value, message); checks++; };
const near = (actual, expected, tol, message) => { assert.ok(Math.abs(actual - expected) <= tol, `${message}: ${actual} vs ${expected}`); checks++; };
const R = 100;
ok(/^\d{4}-\d{2}-\d{2}$/.test(RETIREMENT_REVIEWED_ON), "a review date");

const base = (o) => ({ age: 30, retireAge: 60, endAge: 85, monthlySpend: 50_000 * R, inflationBps: 600, savings: 0, monthlySave: 20_000 * R, stepUpBps: 0, returnBps: 1200, retiredReturnBps: 800, ...o });
// [name, input, corpus, needed, spendAtRetirement, extraMonthly]
const vectors = [
  ["age 30 to 60, ₹20,000 a month at 12%, spending ₹50,000 at 6% inflation, 8% afterwards", base({}), 7_059_827_548, 6_498_780_661, 28_717_456, 0],
  ["with savings, a step-up and a longer life", base({ age: 35, endAge: 90, monthlySpend: 100_000 * R, savings: 500_000 * R, monthlySave: 50_000 * R, stepUpBps: 1000, returnBps: 1000, retiredReturnBps: 700 }), 17_031_759_078, 12_726_531_760, 42_918_707, 0],
  ["retire at 55 with a small step-up", base({ age: 25, retireAge: 55, monthlySpend: 30_000 * R, inflationBps: 500, monthlySave: 5_000 * R, stepUpBps: 500, retiredReturnBps: 900 }), 2_636_704_049, 2_635_422_720, 12_965_827, 0],
  ["a shortfall: a big spender with a flat saving", base({ age: 40, monthlySpend: 80_000 * R, inflationBps: 700, savings: 2_000_000 * R, monthlySave: 100_000 * R, returnBps: 1000, retiredReturnBps: 0 }), 9_122_583_823, 23_496_366_564, 30_957_476, 18_772_157],
  ["no inflation and no returns is plain arithmetic", base({ inflationBps: 0, monthlySave: 10_000 * R, returnBps: 0, retiredReturnBps: 0 }), 3_600_000_00, 15_000_000_00, 5_000_000, 3_166_667],
  ["a short plan: retire in five years", base({ age: 45, retireAge: 50, endAge: 60, monthlySpend: 100_000 * R, savings: 1_000_000 * R, monthlySave: 0, returnBps: 800, retiredReturnBps: 600 }), 1_489_845_71, 15_515_834_81, 13_382_256, 18_962_572],
];
for (const [name, input, corpus, needed, spend0, extra] of vectors) {
  const r = retirement(input);
  near(r.corpus, corpus, Math.max(3, corpus * 1e-12), `${name}: corpus`);
  near(r.needed, needed, Math.max(3, needed * 1e-12), `${name}: needed`);
  near(corpusNeeded(input), needed, Math.max(3, needed * 1e-12), `${name}: corpusNeeded agrees`);
  near(r.spendAtRetirement, spend0, 1, `${name}: first-year spending`);
  near(r.extraMonthly, extra, 1, `${name}: extra monthly saving`);
  eq(r.gap > 0, extra > 0, `${name}: a gap exactly when extra saving is needed`);
  eq(r.gap, Math.max(0, r.needed - r.corpus), `${name}: gap`);
  eq(r.surplus, Math.max(0, r.corpus - r.needed), `${name}: surplus`);
  eq(r.lastsUntilAge === null, r.gap === 0, `${name}: lasts to the end age exactly when there is no gap`);
}

// Plain arithmetic: no returns, no inflation. Save 10,000 x 360 = 36 lakh; need 50,000 x 300 = 1.5 crore.
{
  const r = retirement(base({ inflationBps: 0, monthlySave: 10_000 * R, returnBps: 0, retiredReturnBps: 0 }));
  eq(r.corpus, 360_000_000, "10,000 a month for 30 years with no growth");
  eq(r.needed, 1_500_000_000, "50,000 a month for 25 years with no growth");
  eq(r.lastsUntilAge, 66, "36 lakh covers 72 months of 50,000, so it runs out at 66");
  eq(r.corpusToday, 360_000_000, "no inflation: today's money is the same");
}
// The corpus that is exactly enough lasts exactly to the end age.
for (const input of [base({}), base({ retiredReturnBps: 0 }), base({ retireAge: 50, endAge: 95, inflationBps: 800, retiredReturnBps: 650 })]) {
  const need = corpusNeeded(input);
  const N = input.retireAge - input.age;
  const j = 1 + input.returnBps / 10000 / 12;
  const savings = Math.ceil(need / Math.pow(j, 12 * N)) + 100;
  const r = retirement({ ...input, savings, monthlySave: 0 });
  ok(r.lastsUntilAge === null, "a corpus just above the need lasts to the end age");
  const short = retirement({ ...input, savings: Math.floor((need * 0.99) / Math.pow(j, 12 * N)), monthlySave: 0 });
  ok(short.lastsUntilAge !== null && short.lastsUntilAge > input.retireAge && short.lastsUntilAge < input.endAge, "1% short runs out before the end age but after retiring");
  ok(short.gap > 0 && short.gap <= need * 0.0101, "1% short has a gap of about 1%");
}
// Saving the extra monthly amount closes the gap, to within a paisa of rounding.
{
  const input = base({ age: 40, monthlySpend: 80_000 * R, inflationBps: 700, savings: 2_000_000 * R, monthlySave: 100_000 * R, returnBps: 1000, retiredReturnBps: 0 });
  const r = retirement(input);
  const fixed = retirement({ ...input, monthlySave: input.monthlySave + r.extraMonthly });
  ok(fixed.gap === 0 || fixed.gap < 500, "adding the extra monthly saving leaves no gap (within a few rupees)");
  ok(fixed.lastsUntilAge === null || fixed.lastsUntilAge > input.endAge - 0.2, "…and the money lasts to the end age");
}
// Yearly rows: saving years then spending years, balances never negative.
{
  const r = retirement(base({}));
  eq(r.yearly.filter((y) => y.phase === "save").length, 30, "30 saving rows");
  eq(r.yearly.filter((y) => y.phase === "spend").length, 25, "25 spending rows");
  eq(r.yearly[0].age, 31, "the first row is the year you turn 31");
  eq(r.yearly[29].closing, r.corpus, "the last saving row closes at the corpus");
  ok(r.yearly.every((y) => y.closing >= 0), "no negative balance");
  eq(r.yearly[0].flow, 20_000 * R * 12, "year-one saving");
  const stepped = retirement(base({ stepUpBps: 1000 }));
  eq(stepped.yearly[1].flow, 22_000 * R * 12, "a 10% step-up raises the second year's saving");
}

// Validation.
eq(retirementProblem(base({})), null, "a normal plan is fine");
eq(retirementProblem(base({ age: 17 })), "age", "age below 18");
eq(retirementProblem(base({ retireAge: 30 })), "retireAge", "retiring at the current age");
eq(retirementProblem(base({ endAge: 60 })), "endAge", "the end age equals the retirement age");
eq(retirementProblem(base({ monthlySpend: 0 })), "monthlySpend", "no spending");

// NPS exit: 20% minimum annuity for non-government, 40% for government; lump sum = corpus - annuity.
eq(NPS_MIN_ANNUITY_PCT, { nonGovernment: 20, government: 40 }, "minimum annuity shares");
eq(npsExit(100_000_000, "nonGovernment", 20, 600), { lumpSum: 80_000_000, annuityPurchase: 20_000_000, monthlyPension: 100_000 }, "₹10 lakh: 80/20, 6% → ₹1,000 a month");
eq(npsExit(100_000_000, "nonGovernment", 5, 600), { lumpSum: 80_000_000, annuityPurchase: 20_000_000, monthlyPension: 100_000 }, "an annuity share below the minimum is raised to it");
eq(npsExit(100_000_000, "government", 20, 600), { lumpSum: 60_000_000, annuityPurchase: 40_000_000, monthlyPension: 200_000 }, "government subscribers keep at least 40% in annuity");
eq(npsExit(100_000_000, "nonGovernment", 100, 0), { lumpSum: 0, annuityPurchase: 100_000_000, monthlyPension: 0 }, "all in annuity at 0% pays nothing");
eq(npsExit(7_059_827_548, "nonGovernment", 20, 600).lumpSum + npsExit(7_059_827_548, "nonGovernment", 20, 600).annuityPurchase, 7_059_827_548, "the split always adds back to the corpus");

// Fuzz: invariants.
let seed = 99;
const rnd = (lo, hi) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return lo + (seed % (hi - lo + 1)); };
for (let i = 0; i < 300; i++) {
  const age = rnd(20, 50);
  const retireAge = age + rnd(1, 35);
  const input = { age, retireAge, endAge: retireAge + rnd(1, 40), monthlySpend: rnd(5, 400) * 1000 * R, inflationBps: rnd(0, 1200), savings: rnd(0, 500) * 100_000 * R / 100, monthlySave: rnd(0, 300) * 1000 * R, stepUpBps: rnd(0, 1500), returnBps: rnd(0, 1800), retiredReturnBps: rnd(0, 1200) };
  const r = retirement(input);
  ok(Number.isSafeInteger(r.corpus) && Number.isSafeInteger(r.needed), `fuzz ${i}: safe integers`);
  eq(r.gap === 0 || r.surplus === 0, true, `fuzz ${i}: a gap and a surplus never both`);
  ok(r.corpus >= input.savings, `fuzz ${i}: the corpus is never below what you already had`);
  ok(retirement({ ...input, monthlySave: input.monthlySave + 100_000 }).corpus >= r.corpus, `fuzz ${i}: saving more never lowers the corpus`);
  ok(retirement({ ...input, returnBps: input.returnBps + 50 }).corpus >= r.corpus, `fuzz ${i}: a higher return never lowers the corpus`);
  ok(retirement({ ...input, inflationBps: input.inflationBps + 50 }).needed >= r.needed, `fuzz ${i}: higher inflation never lowers the need`);
  ok(retirement({ ...input, endAge: input.endAge + 1 }).needed >= r.needed, `fuzz ${i}: living longer never lowers the need`);
  ok(retirement({ ...input, retiredReturnBps: input.retiredReturnBps + 50 }).needed <= r.needed, `fuzz ${i}: a higher return in retirement never raises the need`);
  ok(r.yearly.every((y) => y.closing >= 0), `fuzz ${i}: no negative balance`);
  if (r.gap > 0) ok(r.extraMonthly > 0 && r.lastsUntilAge !== null, `fuzz ${i}: a gap has an extra saving and a run-out age`);
}

{
  const source = ["../src/components/RetirementPlanner.tsx", "../src/lib/loanFormat.ts"].map((f) => readFileSync(new URL(f, import.meta.url), "utf8")).join("\n");
  const used = new Set([...source.matchAll(/\btr\("((?:[^"\\]|\\.)*)"\)/g)].map((m) => m[1]));
  ok(used.size > 40, "the island's tr() strings were found");
  const slots = (text) => (text.match(/\{\w+\}/g) ?? []).sort().join(",");
  for (const key of used) {
    const row = RETIREMENT_PHRASES[key];
    ok(row, `missing translation for: ${key}`);
    for (const lang of ["hi", "ta", "te", "mr"]) {
      ok(typeof row[lang] === "string" && row[lang].trim() !== "", `${lang} missing for: ${key}`);
      assert.equal(slots(row[lang]), slots(key), `${lang} {slots} differ for: ${key}`); checks++;
      ok(row[lang] !== key || /^[\d\s+—(₹)%.,:-]*$/.test(key), `${lang} left in English: ${key}`);
    }
  }
  for (const key of Object.keys(RETIREMENT_PHRASES)) ok(used.has(key), `unused translation key: ${key}`);
}

console.log(`Retirement engine: ${checks} checks passed`);
