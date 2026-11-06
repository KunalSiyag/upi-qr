// Stamp duty and registration arithmetic (src/lib/stampDuty.ts). The rates are the buyer's input; this checks the maths and the
// "higher of agreement value and circle rate" rule.
//
//   npm run test:savings
//
// Vectors come from an independent implementation (Python `fractions`, round half up) on 2026-11-07.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stampDuty } from "../src/lib/stampDuty.ts";
import { STAMP_DUTY_PHRASES } from "../src/data/stampDutyPhrases.ts";

let checks = 0;
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const ok = (value, message) => { assert.ok(value, message); checks++; };
const R = 100;
const input = (o) => ({ agreementValue: 5_000_000 * R, circleValue: 0, useHigher: true, stampBps: 500, surchargeBps: 100, registrationBps: 100, registrationCap: 0, otherCharges: 0, ...o });

const vectors = [
  ["circle rate above the price, registration capped, other charges", input({ agreementValue: 8_000_000 * R, circleValue: 9_000_000 * R, registrationCap: 30_000 * R, otherCharges: 15_000 * R }), { base: 900_000_000, baseIsCircle: true, stampDuty: 45_000_000, surcharge: 9_000_000, registration: 3_000_000, registrationCapped: true, other: 1_500_000, totalCharges: 58_500_000, allIn: 858_500_000, chargesBps: 731 }],
  ["no circle rate", input({ stampBps: 600, surchargeBps: 0 }), { base: 500_000_000, baseIsCircle: false, stampDuty: 30_000_000, surcharge: 0, registration: 5_000_000, registrationCapped: false, other: 0, totalCharges: 35_000_000, allIn: 535_000_000, chargesBps: 700 }],
  ["price above the circle rate: the price is the base", input({ agreementValue: 12_500_000 * R, circleValue: 10_000_000 * R, stampBps: 700 }), { base: 1_250_000_000, baseIsCircle: false, stampDuty: 87_500_000, surcharge: 12_500_000, registration: 12_500_000, registrationCapped: false, other: 0, totalCharges: 112_500_000, allIn: 1_362_500_000, chargesBps: 900 }],
  ["odd paise and fractional rates round half up", input({ agreementValue: 333_333_333, stampBps: 525, surchargeBps: 50, registrationBps: 75, otherCharges: 1_000 * R }), { base: 333_333_333, baseIsCircle: false, stampDuty: 17_500_000, surcharge: 1_666_667, registration: 2_500_000, registrationCapped: false, other: 100_000, totalCharges: 21_766_667, allIn: 355_100_000, chargesBps: 653 }],
];
for (const [name, i, want] of vectors) eq(stampDuty(i), want, name);

// Turning the rule off charges on the agreement value even when the circle rate is higher.
{
  const a = stampDuty(input({ agreementValue: 8_000_000 * R, circleValue: 9_000_000 * R, useHigher: false }));
  eq([a.base, a.baseIsCircle], [800_000_000, false], "higher-of off: the agreement value is the base");
  const b = stampDuty(input({ agreementValue: 8_000_000 * R, circleValue: 9_000_000 * R, useHigher: true }));
  ok(b.totalCharges > a.totalCharges, "higher-of on charges more when the circle rate is higher");
  eq(stampDuty(input({ agreementValue: 8_000_000 * R, circleValue: 8_000_000 * R })).baseIsCircle, false, "equal values: not flagged as the circle rate");
}
// A cap only bites when the fee is above it, and never raises it.
{
  eq(stampDuty(input({ registrationCap: 1_000_000 * R })).registrationCapped, false, "a cap above the fee changes nothing");
  eq(stampDuty(input({ registrationCap: 1_000_000 * R })).registration, 5_000_000, "…the fee stays at 1%");
  eq(stampDuty(input({ registrationCap: 10_000 * R })).registration, 1_000_000, "a cap of ₹10,000 limits the ₹50,000 fee");
  eq(stampDuty(input({ registrationCap: 0 })).registrationCapped, false, "0 means no cap");
}
// A zero price has zero charges and no division by zero.
eq(stampDuty(input({ agreementValue: 0 })).chargesBps, 0, "no price, no percentage");
eq(stampDuty(input({ agreementValue: 0 })).totalCharges, 0, "no price, no charges");

// Fuzz: invariants.
let seed = 7;
const rnd = (lo, hi) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return lo + (seed % (hi - lo + 1)); };
for (let n = 0; n < 500; n++) {
  const i = input({ agreementValue: rnd(100_000, 2_000_000_000) * 100 + rnd(0, 99), circleValue: rnd(0, 2) === 0 ? 0 : rnd(100_000, 2_000_000_000) * 100, useHigher: rnd(0, 1) === 1, stampBps: rnd(0, 1500), surchargeBps: rnd(0, 500), registrationBps: rnd(0, 300), registrationCap: rnd(0, 1) ? rnd(1000, 500_000) * 100 : 0, otherCharges: rnd(0, 100_000) * 100 });
  const r = stampDuty(i);
  ok(Number.isSafeInteger(r.allIn), `fuzz ${n}: a safe integer`);
  eq(r.totalCharges, r.stampDuty + r.surcharge + r.registration + r.other, `fuzz ${n}: the charges add up`);
  eq(r.allIn, i.agreementValue + r.totalCharges, `fuzz ${n}: all-in is the price plus the charges`);
  ok(r.base >= i.agreementValue || !i.useHigher || r.base === i.agreementValue, `fuzz ${n}: the base is never below the price when the rule is on`);
  if (i.registrationCap > 0) ok(r.registration <= i.registrationCap, `fuzz ${n}: registration respects the cap`);
  ok(stampDuty({ ...i, stampBps: i.stampBps + 100 }).stampDuty >= r.stampDuty, `fuzz ${n}: a higher rate never charges less`);
  ok(Math.abs(r.stampDuty - (r.base * i.stampBps) / 10000) <= 0.5 + 1e-6, `fuzz ${n}: duty is within half a paisa of the exact value`);
}

{
  const source = ["../src/components/StampDutyCalculator.tsx", "../src/lib/loanFormat.ts"].map((f) => readFileSync(new URL(f, import.meta.url), "utf8")).join("\n");
  const used = new Set([...source.matchAll(/\btr\("((?:[^"\\]|\\.)*)"\)/g)].map((m) => m[1]));
  ok(used.size > 25, "the island's tr() strings were found");
  const slots = (text) => (text.match(/\{\w+\}/g) ?? []).sort().join(",");
  for (const key of used) {
    const row = STAMP_DUTY_PHRASES[key];
    ok(row, `missing translation for: ${key}`);
    for (const lang of ["hi", "ta", "te", "mr"]) {
      ok(typeof row[lang] === "string" && row[lang].trim() !== "", `${lang} missing for: ${key}`);
      assert.equal(slots(row[lang]), slots(key), `${lang} {slots} differ for: ${key}`); checks++;
      ok(row[lang] !== key || /^[\d\s+—(₹)%.,:-]*$/.test(key), `${lang} left in English: ${key}`);
    }
  }
  for (const key of Object.keys(STAMP_DUTY_PHRASES)) ok(used.has(key), `unused translation key: ${key}`);
}

console.log(`Stamp duty engine: ${checks} checks passed`);
