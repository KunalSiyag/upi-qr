// HRA exemption engine (src/lib/hra.ts): the least-of-three rule, the eight 50% cities and invariants.
//
//   npm run test:tax   (runs this after income-tax.test.mjs)
//
// Vectors are worked by hand from the rule in the file's header and cross-checked with an independent Python script on 2026-11-07.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { HRA_FIFTY_PERCENT_CITIES, hraExemption } from "../src/lib/hra.ts";
import { HRA_PHRASES } from "../src/data/hraPhrases.ts";

let checks = 0;
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const ok = (value, message) => { assert.ok(value, message); checks++; };
const R = 100;
const mk = (salaryMonth, hraMonth, rentMonth, fiftyPercentCity, months = 12) => ({ salaryMonth: salaryMonth * R, hraMonth: hraMonth * R, rentMonth: rentMonth * R, fiftyPercentCity, months });

eq(HRA_FIFTY_PERCENT_CITIES.length, 8, "eight cities");
eq([...HRA_FIFTY_PERCENT_CITIES].sort(), ["Ahmedabad", "Bengaluru", "Chennai", "Delhi", "Hyderabad", "Kolkata", "Mumbai", "Pune"], "the list: the four older metros plus Bengaluru, Hyderabad, Pune, Ahmedabad");

const vectors = [
  ["salary ₹50,000, HRA ₹20,000, rent ₹25,000, listed city: HRA received is the least", mk(50_000, 20_000, 25_000, true),
    { salary: 60_000_000, actual: 24_000_000, rentLessTenth: 24_000_000, percentOfSalary: 30_000_000, exempt: 24_000_000, taxable: 0 }],
  ["rent ₹22,000: rent less 10% is the least", mk(50_000, 20_000, 22_000, true),
    { actual: 24_000_000, rentLessTenth: 20_400_000, percentOfSalary: 30_000_000, exempt: 20_400_000, taxable: 3_600_000, limiting: "rent" }],
  ["salary ₹60,000, HRA ₹30,000, rent ₹40,000, listed city: HRA received is the least (₹30,000 a month)", mk(60_000, 30_000, 40_000, true),
    { exempt: 36_000_000, taxable: 0, limiting: "actual", exemptMonth: 3_000_000 }],
  ["…the same in any other city: 40% of salary is the least (₹24,000 a month)", mk(60_000, 30_000, 40_000, false),
    { percentOfSalary: 28_800_000, exempt: 28_800_000, taxable: 7_200_000, limiting: "salary", exemptMonth: 2_400_000 }],
  ["rent below one tenth of salary: nothing is exempt", mk(50_000, 15_000, 4_000, true), { rentLessTenth: 0, exempt: 0, taxable: 18_000_000, limiting: "rent" }],
  ["only 6 months rented", mk(50_000, 20_000, 25_000, true, 6), { salary: 30_000_000, hraReceived: 12_000_000, exempt: 12_000_000 }],
  ["no HRA received: nothing to exempt", mk(50_000, 0, 25_000, true), { exempt: 0, taxable: 0 }],
];
for (const [name, input, expected] of vectors) {
  const r = hraExemption(input);
  for (const [key, value] of Object.entries(expected)) eq(r[key], value, `${name}: ${key}`);
  eq(r.exempt, Math.min(r.actual, r.rentLessTenth, r.percentOfSalary), `${name}: the least of the three`);
  eq(r.taxable, r.hraReceived - r.exempt, `${name}: taxable = received − exempt`);
}

let seed = 20261107;
const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
const rnd = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
for (let i = 0; i < 400; i++) {
  const input = mk(rnd(0, 500_000), rnd(0, 250_000), rnd(0, 400_000), next() < 0.5, rnd(1, 12));
  const r = hraExemption(input);
  ok(r.exempt >= 0 && r.exempt <= r.hraReceived, `fuzz ${i}: never negative and never more than the HRA received`);
  ok(r.taxable >= 0, `fuzz ${i}: taxable HRA is never negative`);
  ok(hraExemption({ ...input, fiftyPercentCity: true }).exempt >= hraExemption({ ...input, fiftyPercentCity: false }).exempt, `fuzz ${i}: a listed city never lowers the exemption`);
  ok(hraExemption({ ...input, rentMonth: input.rentMonth + 100_00 }).exempt >= r.exempt, `fuzz ${i}: more rent never lowers the exemption`);
  ok(hraExemption({ ...input, salaryMonth: input.salaryMonth + 100_00 }).exempt >= 0, `fuzz ${i}: still valid with more salary`);
}

{
  const source = ["../src/components/HraCalculator.tsx", "../src/lib/loanFormat.ts"].map((f) => readFileSync(new URL(f, import.meta.url), "utf8")).join("\n");
  const used = new Set([...source.matchAll(/\btr\("((?:[^"\\]|\\.)*)"\)/g)].map((m) => m[1]));
  ok(used.size > 20, "the island's tr() strings were found");
  const slots = (text) => (text.match(/\{\w+\}/g) ?? []).sort().join(",");
  for (const key of used) {
    const row = HRA_PHRASES[key];
    ok(row, `missing translation for: ${key}`);
    for (const lang of ["hi", "ta", "te", "mr"]) {
      ok(typeof row[lang] === "string" && row[lang].trim() !== "", `${lang} missing for: ${key}`);
      assert.equal(slots(row[lang]), slots(key), `${lang} {slots} differ for: ${key}`); checks++;
      ok(row[lang] !== key || /^[\d\s+—(₹)%.,:-]*$/.test(key), `${lang} left in English: ${key}`);
    }
  }
  for (const key of Object.keys(HRA_PHRASES)) ok(used.has(key), `unused translation key: ${key}`);
}

console.log(`HRA engine: ${checks} checks passed`);
