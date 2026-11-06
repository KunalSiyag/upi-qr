// Education-loan engine (src/lib/educationLoan.ts): moratorium interest, tranches, capitalisation, repayment.
//
//   npm run test:loan   (runs this after loan.test.mjs)
//
// Vectors were produced by an independent implementation (Python `decimal`, 60 digits, half-up rounding of each month's
// interest and of the EMI, the last scheduled instalment clears the balance), not by this code, on 2026-11-06.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EDUCATION_LOAN_PHRASES } from "../src/data/educationLoanPhrases.ts";
import { educationLoan, splitTranches } from "../src/lib/educationLoan.ts";

let checks = 0;
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks++; };
const ok = (value, message) => { assert.ok(value, message); checks++; };
const L = (rupees) => rupees * 100;

const base = { principal: L(2_000_000), rateBps: 950, courseMonths: 48, graceMonths: 6, repayMonths: 120, disbursement: "upfront", unpaidInterest: "simple", payDuring: false };

/* [name, input, expected] */
const vectors = [
  ["A ₹20L 9.5% 4y+6m 10y, upfront, unpaid simple", base,
    { disbursed: 200_000_000, accrued: 85_499_982, preEmiTotal: 0, preEmiFirst: 0, preEmiLast: 0, repayPrincipal: 285_499_982, emi: 3_694_300, repayMonths: 120, repayInterest: 157_816_019, totalInterest: 243_316_001 }],
  ["B same, interest paid during", { ...base, payDuring: true },
    { disbursed: 200_000_000, accrued: 0, preEmiTotal: 85_499_982, preEmiFirst: 1_583_333, preEmiLast: 1_583_333, repayPrincipal: 200_000_000, emi: 2_587_951, repayMonths: 120, repayInterest: 110_554_149, totalInterest: 196_054_131 }],
  ["C ₹20L paid out yearly, unpaid simple", { ...base, disbursement: "yearly" },
    { disbursed: 200_000_000, accrued: 56_999_994, preEmiTotal: 0, preEmiFirst: 0, preEmiLast: 0, repayPrincipal: 256_999_994, emi: 3_325_517, repayMonths: 120, repayInterest: 142_062_070, totalInterest: 199_062_064 }],
  ["D ₹20L upfront, unpaid compound", { ...base, unpaidInterest: "compound" },
    { disbursed: 200_000_000, accrued: 106_168_028, preEmiTotal: 0, preEmiFirst: 0, preEmiLast: 0, repayPrincipal: 306_168_028, emi: 3_961_740, repayMonths: 120, repayInterest: 169_240_661, totalInterest: 275_408_689 }],
  ["E ₹7.5L 8.85% 2y+12m 7y, yearly, interest paid", { principal: L(750_000), rateBps: 885, courseMonths: 24, graceMonths: 12, repayMonths: 84, disbursement: "yearly", unpaidInterest: "simple", payDuring: true },
    { disbursed: 75_000_000, accrued: 0, preEmiTotal: 16_593_756, preEmiFirst: 276_563, preEmiLast: 553_125, repayPrincipal: 75_000_000, emi: 1_200_979, repayMonths: 84, repayInterest: 25_882_265, totalInterest: 42_476_021 }],
  ["F ₹10L at 0%", { principal: L(1_000_000), rateBps: 0, courseMonths: 36, graceMonths: 6, repayMonths: 60, disbursement: "yearly", unpaidInterest: "simple", payDuring: false },
    { disbursed: 100_000_000, accrued: 0, preEmiTotal: 0, preEmiFirst: 0, preEmiLast: 0, repayPrincipal: 100_000_000, emi: 1_666_667, repayMonths: 60, repayInterest: 0, totalInterest: 0 }],
  ["G ₹15L 10.25% 3y+0m 12y, yearly, unpaid compound", { principal: L(1_500_000), rateBps: 1025, courseMonths: 36, graceMonths: 0, repayMonths: 144, disbursement: "yearly", unpaidInterest: "compound", payDuring: false },
    { disbursed: 150_000_000, accrued: 34_607_898, preEmiTotal: 0, preEmiFirst: 0, preEmiLast: 0, repayPrincipal: 184_607_898, emi: 2_232_953, repayMonths: 144, repayInterest: 136_937_260, totalInterest: 171_545_158 }],
];
for (const [name, input, expected] of vectors) {
  const r = educationLoan(input);
  for (const [key, value] of Object.entries(expected)) eq(r[key], value, `${name}: ${key}`);
}

/* ---- Tranches --------------------------------------------------------------------------------------------------- */
{
  eq(JSON.stringify(splitTranches(L(2_000_000), 48, "yearly")), JSON.stringify([1, 13, 25, 37].map((month) => ({ month, amount: L(500_000) }))), "₹20L over 4 years: four equal parts at months 1, 13, 25, 37");
  const odd = splitTranches(1_000_001, 36, "yearly");
  eq(odd.map((t) => t.amount).join(","), "333335,333333,333333", "odd paise go to the first part");
  eq(odd.reduce((a, t) => a + t.amount, 0), 1_000_001, "parts add up to the loan");
  eq(splitTranches(5000, 18, "yearly").length, 2, "an 18-month course has two years' parts");
  eq(JSON.stringify(splitTranches(5000, 48, "upfront")), JSON.stringify([{ month: 1, amount: 5000 }]), "upfront is one part");
}

/* ---- Invariants over a deterministic fuzz ----------------------------------------------------------------------- */
let seed = 20261106;
const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
for (let i = 0; i < 400; i++) {
  const input = {
    principal: L(Math.floor(10_000 + next() * 8_000_000)),
    rateBps: Math.floor(next() * 2000),
    courseMonths: 1 + Math.floor(next() * 96),
    graceMonths: Math.floor(next() * 37),
    repayMonths: 1 + Math.floor(next() * 240),
    disbursement: next() < 0.5 ? "upfront" : "yearly",
    unpaidInterest: next() < 0.5 ? "simple" : "compound",
    payDuring: next() < 0.5,
  };
  const r = educationLoan(input);
  eq(r.disbursed, input.principal, `fuzz ${i}: all of the loan is paid out`);
  eq(r.tranches.reduce((a, t) => a + t.amount, 0), input.principal, `fuzz ${i}: parts add up`);
  eq(r.repayPrincipal, r.disbursed + r.accrued, `fuzz ${i}: EMIs are worked out on principal + built-up interest`);
  eq(r.totalInterest, r.preEmiTotal + r.accrued + r.repayInterest, `fuzz ${i}: interest adds up`);
  eq(r.totalCost, r.disbursed + r.totalInterest, `fuzz ${i}: cost = paid out + interest`);
  eq(r.schedule.yearly.at(-1).closing, 0, `fuzz ${i}: the loan is cleared`);
  ok(input.payDuring ? r.accrued === 0 : r.preEmiTotal === 0, `fuzz ${i}: exactly one of paid-during or built-up`);
  // The same loan with the interest paid during the moratorium never costs more in total, and never has a larger EMI.
  const paid = educationLoan({ ...input, payDuring: true });
  const unpaid = educationLoan({ ...input, payDuring: false });
  ok(paid.totalInterest <= unpaid.totalInterest, `fuzz ${i}: paying during never costs more interest`);
  ok(paid.emi <= unpaid.emi, `fuzz ${i}: paying during never raises the EMI`);
  // Compound never builds up less than simple.
  ok(educationLoan({ ...input, payDuring: false, unpaidInterest: "compound" }).accrued >= educationLoan({ ...input, payDuring: false, unpaidInterest: "simple" }).accrued, `fuzz ${i}: compound ≥ simple`);
}

/* ---- Translations: every string the island passes to tr() exists in hi/ta/te/mr with the same {slots} ----------- */
{
  const source = ["../src/components/EducationLoanCalculator.tsx", "../src/lib/loanFormat.ts"].map((f) => readFileSync(new URL(f, import.meta.url), "utf8")).join("\n");
  const used = new Set([...source.matchAll(/\btr\("((?:[^"\\]|\\.)*)"\)/g)].map((m) => m[1]));
  ok(used.size > 40, "the island's tr() strings were found");
  const slots = (text) => (text.match(/\{\w+\}/g) ?? []).sort().join(",");
  for (const key of used) {
    const row = EDUCATION_LOAN_PHRASES[key];
    ok(row, `missing translation for: ${key}`);
    for (const lang of ["hi", "ta", "te", "mr"]) {
      ok(typeof row[lang] === "string" && row[lang].trim() !== "", `${lang} missing for: ${key}`);
      eq(slots(row[lang]), slots(key), `${lang} {slots} differ for: ${key}`);
      ok(row[lang] !== key || /^[\d\s+—(₹)%.,:-]*$/.test(key), `${lang} left in English: ${key}`);
    }
  }
  for (const key of Object.keys(EDUCATION_LOAN_PHRASES)) ok(used.has(key), `unused translation key: ${key}`);
}

console.log(`education loan engine: ${checks} checks passed`);
