// Income tax engine (src/lib/incomeTax.ts), India, tax year 2026-27: exact vectors, rebate edges, surcharge with marginal relief
// and invariants.
//
//   npm run test:tax
//
// Vectors were produced by an independent implementation (Python `fractions`, exact arithmetic) on 2026-11-07 from the rules in
// TAX_SOURCES (Finance Bill 2026 memorandum, Income-tax Act 2025 as enacted, Finance Act 2026). Rule changes: update RULES, the
// reviewed date and these vectors together.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BLANK_INPUT, DEDUCTION_LABELS, RULES, TAX_RULES_REVIEWED_ON, compareRegimes, newRegime, oldRegime, slabTax } from "../src/lib/incomeTax.ts";
import { INCOME_TAX_PHRASES } from "../src/data/incomeTaxPhrases.ts";

let checks = 0;
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const ok = (value, message) => { assert.ok(value, message); checks++; };
const R = 100;
const inp = (patch) => ({ ...BLANK_INPUT, ...Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, typeof v === "number" ? v * R : v])) });

ok(/^\d{4}-\d{2}-\d{2}$/.test(TAX_RULES_REVIEWED_ON), "the rules carry a review date");

/* ---- New regime ------------------------------------------------------------------------------------------------- */
const newVectors = [
  ["salary ₹12.75L → taxable ₹12L: the rebate wipes the tax", { salary: 1_275_000 }, { taxableIncome: 120_000_000, slabTax: 6_000_000, rebate: 6_000_000, marginalRelief: 0, taxAfterRelief: 0, surcharge: 0, cess: 0, totalTax: 0 }],
  ["salary ₹15L", { salary: 1_500_000 }, { taxableIncome: 142_500_000, slabTax: 9_375_000, rebate: 0, marginalRelief: 0, cess: 375_000, totalTax: 9_750_000 }],
  ["salary ₹12.85L → taxable ₹12.10L: marginal relief caps the tax at ₹10,000", { salary: 1_285_000 }, { taxableIncome: 121_000_000, slabTax: 6_150_000, rebate: 0, marginalRelief: 5_150_000, taxAfterRelief: 1_000_000, cess: 40_000, totalTax: 1_040_000 }],
  ["salary ₹20L, other income ₹1L, employer NPS ₹1L on basic ₹8L (cap 14% = ₹1,12,000)", { salary: 2_000_000, otherIncome: 100_000, basicDa: 800_000, employerNps: 100_000 }, { taxableIncome: 192_500_000, slabTax: 18_500_000, cess: 740_000, totalTax: 19_240_000 }],
  ["salary ₹50.75L → taxable exactly ₹50L: no surcharge", { salary: 5_075_000 }, { taxableIncome: 500_000_000, slabTax: 108_000_000, surcharge: 0, surchargeRelief: 0, cess: 4_320_000, totalTax: 112_320_000 }],
  ["salary ₹50.80L → just over ₹50L: surcharge marginal relief", { salary: 5_080_000 }, { taxableIncome: 500_500_000, slabTax: 108_150_000, surcharge: 350_000, surchargeRelief: 10_465_000, cess: 4_340_000, totalTax: 112_840_000 }],
  ["salary ₹60L: 10% surcharge", { salary: 6_000_000 }, { taxableIncome: 592_500_000, slabTax: 135_750_000, surcharge: 13_575_000, surchargeRelief: 0, cess: 5_973_000, totalTax: 155_298_000 }],
  ["salary ₹2.5Cr: surcharge 25%", { salary: 25_000_000 }, { slabTax: 705_750_000, surcharge: 176_437_500, cess: 35_287_500, totalTax: 917_475_000 }],
  ["salary ₹6Cr: the new regime stops at 25%", { salary: 60_000_000 }, { slabTax: 1_755_750_000, surcharge: 438_937_500, cess: 87_787_500, totalTax: 2_282_475_000 }],
  ["salary ₹3L: below the exemption", { salary: 300_000 }, { taxableIncome: 22_500_000, slabTax: 0, totalTax: 0 }],
];
for (const [name, patch, expected] of newVectors) {
  const r = newRegime(inp(patch));
  for (const [key, value] of Object.entries(expected)) eq(r[key], value, `${name}: ${key}`);
  eq(r.totalTax, r.taxAfterRelief + r.surcharge + r.cess, `${name}: total = tax + surcharge + cess`);
  eq(r.taxAfterRelief, r.slabTax - r.rebate - r.marginalRelief, `${name}: tax after relief`);
}

/* ---- Old regime ------------------------------------------------------------------------------------------------- */
const oldVectors = [
  ["salary ₹12L, under 60: 80C ₹1.5L, NPS ₹50k, 80D ₹25k + ₹50k (senior parents), HRA ₹1.2L, PT ₹2,400, home loan ₹2L",
    { salary: 1_200_000, c80: 150_000, nps1b: 50_000, selfHealth: 25_000, parentsHealth: 50_000, parentsSenior: true, hraExempt: 120_000, professionalTax: 2_400, homeLoanInterest: 200_000 },
    { taxableIncome: 55_260_000, totalDeductions: 64_740_000, slabTax: 2_302_000, cess: 92_080, totalTax: 2_394_080 }],
  ["salary ₹5.5L → taxable exactly ₹5L: the rebate clears it", { salary: 550_000 }, { taxableIncome: 50_000_000, slabTax: 1_250_000, rebate: 1_250_000, totalTax: 0 }],
  ["one rupee more: the rebate is a cliff", { salary: 550_001 }, { taxableIncome: 50_000_100, slabTax: 1_250_020, rebate: 0, cess: 50_001, totalTax: 1_300_021 }],
  ["salary ₹9L, senior: ₹60k savings interest, ₹60k self health premium", { salary: 900_000, age: "senior", savingsInterest: 60_000, selfHealth: 60_000 }, { taxableIncome: 75_000_000, slabTax: 6_000_000, cess: 240_000, totalTax: 6_240_000 }],
  ["salary ₹9L, super senior", { salary: 900_000, age: "super" }, { taxableIncome: 85_000_000, slabTax: 7_000_000, cess: 280_000, totalTax: 7_280_000 }],
  ["salary ₹60L: 10% surcharge", { salary: 6_000_000 }, { taxableIncome: 595_000_000, slabTax: 159_750_000, surcharge: 15_975_000, cess: 7_029_000, totalTax: 182_754_000 }],
  ["salary ₹50.60L: surcharge marginal relief", { salary: 5_060_000 }, { taxableIncome: 501_000_000, slabTax: 131_550_000, surcharge: 700_000, surchargeRelief: 12_455_000, cess: 5_290_000, totalTax: 137_540_000 }],
  ["salary ₹1.2Cr: 15% surcharge", { salary: 12_000_000 }, { slabTax: 339_750_000, surcharge: 50_962_500, cess: 15_628_500, totalTax: 406_341_000 }],
  ["salary ₹6Cr: 37% surcharge (old regime only)", { salary: 60_000_000 }, { slabTax: 1_779_750_000, surcharge: 658_507_500, cess: 97_530_300, totalTax: 2_535_787_800 }],
  ["government employer NPS: cap 14% of basic ₹10L", { salary: 1_800_000, basicDa: 1_000_000, employerNps: 200_000, government: true }, { taxableIncome: 161_000_000, totalDeductions: 19_000_000, totalTax: 30_732_000 }],
  ["private employer NPS: cap 10% of basic ₹10L", { salary: 1_800_000, basicDa: 1_000_000, employerNps: 200_000, government: false }, { taxableIncome: 165_000_000, totalDeductions: 15_000_000, totalTax: 31_980_000 }],
  ["home loan interest that does not qualify: capped at ₹30,000", { salary: 1_500_000, homeLoanInterest: 200_000, homeLoanQualifies: false }, { taxableIncome: 142_000_000, totalDeductions: 8_000_000, totalTax: 24_804_000 }],
];
for (const [name, patch, expected] of oldVectors) {
  const r = oldRegime(inp(patch));
  for (const [key, value] of Object.entries(expected)) eq(r[key], value, `${name}: ${key}`);
  eq(r.totalTax, r.taxAfterRelief + r.surcharge + r.cess, `${name}: total = tax + surcharge + cess`);
  eq(r.deductions.reduce((a, d) => a + d.amount, 0), r.totalDeductions, `${name}: the deduction lines add up`);
}

/* ---- Comparison ------------------------------------------------------------------------------------------------- */
{
  const low = compareRegimes(inp({ salary: 1_000_000 }));
  eq([low.new.totalTax, low.lower], [0, "new"], "₹10L salary: the new regime's rebate leaves no tax, so it is lower");
  const heavy = compareRegimes(inp({ salary: 1_500_000, c80: 150_000, nps1b: 50_000, selfHealth: 25_000, hraExempt: 300_000, homeLoanInterest: 200_000 }));
  eq(heavy.lower, "old", "large old-regime deductions can make the old regime lower");
  eq(heavy.difference, heavy.new.totalTax - heavy.old.totalTax, "the difference is the gap");
  eq(compareRegimes(inp({ salary: 0 })).lower, null, "no income: equal");
}

/* ---- Slab maths ------------------------------------------------------------------------------------------------- */
eq(slabTax(40_000_000, RULES.newSlabs), 0, "up to ₹4L: nil in the new regime");
eq(slabTax(80_000_000, RULES.newSlabs), 2_000_000, "₹8L: ₹20,000");
eq(slabTax(120_000_000, RULES.newSlabs), 6_000_000, "₹12L: ₹60,000, the figure the rebate matches");
eq(slabTax(50_000_000, RULES.oldSlabs.under60), 1_250_000, "₹5L old regime: ₹12,500, the figure the old rebate matches");
eq(slabTax(100_000_000, RULES.oldSlabs.under60), 11_250_000, "₹10L old regime: ₹1,12,500");

/* ---- Properties over a deterministic fuzz ----------------------------------------------------------------------- */
let seed = 20261107;
const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
const rnd = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
const ages = ["under60", "senior", "super"];
for (let i = 0; i < 400; i++) {
  const salary = rnd(0, 80_000_000);
  const base = inp({ salary, otherIncome: rnd(0, 2_000_000), age: ages[rnd(0, 2)], basicDa: rnd(0, salary), employerNps: rnd(0, 500_000), government: next() < 0.5,
    hraExempt: rnd(0, 400_000), professionalTax: rnd(0, 2500), c80: rnd(0, 250_000), nps1b: rnd(0, 80_000), selfHealth: rnd(0, 80_000), parentsHealth: rnd(0, 80_000),
    parentsSenior: next() < 0.5, savingsInterest: rnd(0, 80_000), homeLoanInterest: rnd(0, 300_000), homeLoanQualifies: next() < 0.5, eduLoanInterest: rnd(0, 100_000) });
  for (const [name, r] of [["new", newRegime(base)], ["old", oldRegime(base)]]) {
    ok(r.totalTax >= 0 && r.taxableIncome >= 0, `fuzz ${i} ${name}: never negative`);
    eq(r.totalTax, r.taxAfterRelief + r.surcharge + r.cess, `fuzz ${i} ${name}: the total adds up`);
    ok(r.taxAfterRelief >= 0 && r.surcharge >= 0, `fuzz ${i} ${name}: relief never drives tax or surcharge below zero`);
    ok(r.totalTax <= Math.round(r.taxableIncome * 0.5), `fuzz ${i} ${name}: tax never exceeds half the taxable income`);
    ok(r.taxableIncome <= r.grossIncome, `fuzz ${i} ${name}: deductions never raise the income`);
    ok(r.deductions.every((d) => DEDUCTION_LABELS.includes(d.label)), `fuzz ${i} ${name}: every deduction label is a known, translatable label`);
  }
  // More salary never lowers the tax (the same regime, same deductions). Marginal relief keeps the rise below the extra income.
  const richer = { ...base, salary: base.salary + 100_000 * R };
  const n0 = newRegime(base), n1 = newRegime(richer), o0 = oldRegime(base), o1 = oldRegime(richer);
  ok(n1.totalTax >= n0.totalTax && o1.totalTax >= o0.totalTax, `fuzz ${i}: more income never lowers the tax`);
  // Marginal relief caps tax plus surcharge at the extra income; the 4% cess is charged on top of that, so a rupee more can cost at most 1.04.
  const extraPaise = 100_000 * R, ceiling = Math.ceil(extraPaise * 1.04) + 1;
  ok(n1.totalTax - n0.totalTax <= ceiling && o1.totalTax - o0.totalTax <= ceiling, `fuzz ${i}: ₹1 more of income never costs more than ₹1.04 more tax (marginal relief, then cess)`);
}

/* ---- Translations ----------------------------------------------------------------------------------------------- */
{
  const source = ["../src/components/IncomeTaxCalculator.tsx", "../src/lib/loanFormat.ts"].map((f) => readFileSync(new URL(f, import.meta.url), "utf8")).join("\n");
  const used = new Set([...source.matchAll(/\btr\("((?:[^"\\]|\\.)*)"\)/g)].map((m) => m[1]).concat(DEDUCTION_LABELS));
  ok(used.size > 50, "the island's tr() strings were found");
  const slots = (text) => (text.match(/\{\w+\}/g) ?? []).sort().join(",");
  for (const key of used) {
    const row = INCOME_TAX_PHRASES[key];
    ok(row, `missing translation for: ${key}`);
    for (const lang of ["hi", "ta", "te", "mr"]) {
      ok(typeof row[lang] === "string" && row[lang].trim() !== "", `${lang} missing for: ${key}`);
      assert.equal(slots(row[lang]), slots(key), `${lang} {slots} differ for: ${key}`); checks++;
      ok(row[lang] !== key || /^[\d\s+—(₹)%.,:-]*$/.test(key), `${lang} left in English: ${key}`);
    }
  }
  for (const key of Object.keys(INCOME_TAX_PHRASES)) ok(used.has(key), `unused translation key: ${key}`);
}

console.log(`income tax engine: ${checks} checks passed`);
