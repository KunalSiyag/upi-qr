// Salary engine (src/lib/salary.ts): CTC to in-hand, PF, gratuity, both tax regimes, and invariants.
//
//   npm run test:tax   (runs this after hra.test.mjs)
//
// Vectors were produced by an independent implementation (Python `fractions`, reusing the independent tax reference) on 2026-11-07.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SALARY_PHRASES } from "../src/data/salaryPhrases.ts";
import { salaryBreakdown } from "../src/lib/salary.ts";

let checks = 0;
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const ok = (value, message) => { assert.ok(value, message); checks++; };
const R = 100;
const mk = (patch) => ({ ctc: 0, basicBps: 4000, hraBps: 5000, pfOnCeiling: false, gratuity: false, professionalTax: 0, regime: "new", rentMonth: 0, listedCity: true, other80c: 0, health: 0, homeLoanInterest: 0, nps1b: 0, ...patch });

const vectors = [
  ["₹12L CTC, 40% basic, HRA 50% of basic, full-basic PF, new regime, PT ₹2,400", mk({ ctc: 12_00_000 * R, professionalTax: 2400 * R }),
    { basic: 48_000_000, hra: 24_000_000, special: 42_240_000, gross: 114_240_000, employerPf: 5_760_000, gratuity: 0, taxableIncome: 106_740_000, tax: 0, takeHome: 108_240_000, takeHomeMonth: 9_020_000 }],
  ["₹30L CTC, 50% basic, HRA 40%, PF on the ₹25,000 ceiling, gratuity, new regime", mk({ ctc: 30_00_000 * R, basicBps: 5000, hraBps: 4000, pfOnCeiling: true, gratuity: true, professionalTax: 2400 * R }),
    { basic: 150_000_000, hra: 60_000_000, special: 79_188_462, gross: 289_188_462, employerPf: 3_600_000, gratuity: 7_211_538, taxableIncome: 281_688_462, tax: 44_206_801, takeHome: 241_141_661, takeHomeMonth: 20_095_138 }],
  ["₹15L CTC, old regime, rent ₹25,000, listed city, ₹50k other 80C, ₹25k health, ₹1L home loan", mk({ ctc: 15_00_000 * R, basicBps: 5000, regime: "old", professionalTax: 2400 * R, rentMonth: 25_000 * R, other80c: 50_000 * R, health: 25_000 * R, homeLoanInterest: 100_000 * R }),
    { basic: 75_000_000, hra: 37_500_000, special: 28_500_000, gross: 141_000_000, employerPf: 9_000_000, taxableIncome: 86_760_000, tax: 8_946_080, takeHome: 122_813_920, takeHomeMonth: 10_234_493 }],
  ["₹8L CTC, PF on the ceiling, new regime", mk({ ctc: 8_00_000 * R, hraBps: 4000, pfOnCeiling: true }),
    { basic: 32_000_000, hra: 12_800_000, special: 31_600_000, gross: 76_400_000, employerPf: 3_600_000, taxableIncome: 68_900_000, tax: 0, takeHome: 72_800_000, takeHomeMonth: 6_066_667 }],
  ["₹40L CTC, old regime with no extras, PF on the ceiling, gratuity", mk({ ctc: 40_00_000 * R, regime: "old", pfOnCeiling: true, gratuity: true, professionalTax: 2500 * R }),
    { basic: 160_000_000, hra: 80_000_000, special: 148_707_692, gross: 388_707_692, employerPf: 3_600_000, gratuity: 7_692_308, taxableIncome: 379_857_692, tax: 99_015_600, takeHome: 285_842_092, takeHomeMonth: 23_820_174 }],
  ["₹60L CTC, new regime", mk({ ctc: 60_00_000 * R, pfOnCeiling: true, professionalTax: 2500 * R }),
    { basic: 240_000_000, hra: 120_000_000, special: 236_400_000, gross: 596_400_000, employerPf: 3_600_000, taxableIncome: 588_900_000, tax: 154_062_480, takeHome: 438_487_520, takeHomeMonth: 36_540_627 }],
];
for (const [name, input, expected] of vectors) {
  const r = salaryBreakdown(input);
  for (const [key, value] of Object.entries(expected)) eq(r[key], value, `${name}: ${key}`);
  eq(r.basic + r.hra + r.special + r.employerPf + r.gratuity, input.ctc, `${name}: the parts add up to the CTC`);
  eq(r.gross, r.basic + r.hra + r.special, `${name}: gross`);
  eq(r.takeHome, r.gross - r.employeePf - r.professionalTax - r.tax, `${name}: take-home`);
  eq(r.employeePf, r.employerPf, `${name}: the employee's PF equals the employer's`);
}

/* The other regime is reported with the same maths. */
{
  const base = vectors[0][1];
  const newR = salaryBreakdown(base), oldR = salaryBreakdown({ ...base, regime: "old" });
  eq(newR.other.tax, oldR.tax, "the 'other regime' tax equals the old-regime result");
  eq(oldR.other.tax, newR.tax, "…and the reverse");
  eq(newR.other.takeHome, oldR.takeHome, "the other regime's take-home matches too");
}

/* Refusals */
eq(salaryBreakdown(mk({ ctc: 10_00_000 * R, basicBps: 9000, hraBps: 10000 })), null, "basic and HRA that exceed the CTC: no breakdown");

/* Properties over a deterministic fuzz */
let seed = 20261107;
const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
const rnd = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
for (let i = 0; i < 300; i++) {
  const input = mk({ ctc: rnd(2_00_000, 3_00_00_000) * R, basicBps: rnd(2500, 6000), hraBps: rnd(0, 6000), pfOnCeiling: next() < 0.5, gratuity: next() < 0.5, professionalTax: rnd(0, 2500) * R,
    regime: next() < 0.5 ? "new" : "old", rentMonth: rnd(0, 150_000) * R, listedCity: next() < 0.5, other80c: rnd(0, 150_000) * R, health: rnd(0, 50_000) * R, homeLoanInterest: rnd(0, 300_000) * R, nps1b: rnd(0, 50_000) * R });
  const r = salaryBreakdown(input);
  if (r === null) continue;
  eq(r.basic + r.hra + r.special + r.employerPf + r.gratuity, input.ctc, `fuzz ${i}: the parts add up to the CTC`);
  ok(r.takeHome <= r.gross && r.takeHome >= 0, `fuzz ${i}: take-home is between zero and the gross`);
  ok(r.special >= 0 && r.tax >= 0, `fuzz ${i}: no negative allowance or tax`);
  const capped = salaryBreakdown({ ...input, pfOnCeiling: true }), full = salaryBreakdown({ ...input, pfOnCeiling: false });
  if (capped && full) ok(capped.employerPf <= full.employerPf, `fuzz ${i}: capping the PF wage never raises the PF`);
}

{
  const source = ["../src/components/SalaryCalculator.tsx", "../src/lib/loanFormat.ts"].map((f) => readFileSync(new URL(f, import.meta.url), "utf8")).join("\n");
  const used = new Set([...source.matchAll(/\btr\("((?:[^"\\]|\\.)*)"\)/g)].map((m) => m[1]));
  ok(used.size > 30, "the island's tr() strings were found");
  const slots = (text) => (text.match(/\{\w+\}/g) ?? []).sort().join(",");
  for (const key of used) {
    const row = SALARY_PHRASES[key];
    ok(row, `missing translation for: ${key}`);
    for (const lang of ["hi", "ta", "te", "mr"]) {
      ok(typeof row[lang] === "string" && row[lang].trim() !== "", `${lang} missing for: ${key}`);
      assert.equal(slots(row[lang]), slots(key), `${lang} {slots} differ for: ${key}`); checks++;
      ok(row[lang] !== key || /^[\d\s+—(₹)%.,:-]*$/.test(key), `${lang} left in English: ${key}`);
    }
  }
  for (const key of Object.keys(SALARY_PHRASES)) ok(used.has(key), `unused translation key: ${key}`);
}

console.log(`salary engine: ${checks} checks passed`);
