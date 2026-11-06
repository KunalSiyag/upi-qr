// India income tax for a resident individual, tax year 2026-27 (the old "FY 2026-27 / AY 2027-28"), in integer paise.
// No imports, so `scripts/income-tax.test.mjs` runs it under Node.
//
// Every rule below was read from primary text on 2026-11-07 and is listed with its source in TAX_SOURCES. The Income-tax Act,
// 2025 replaced the 1961 Act from 1 April 2026 and the Finance Act 2026 left these individual provisions unchanged. Where the
// section number changed, both are shown in the comments. Rules are data: when a Finance Act changes one, edit RULES and
// TAX_RULES_REVIEWED_ON, add a row to src/data/corrections.ts for any material fix, and update the vectors in the test.
//
// Out of scope, and the page says so: capital gains and other special-rate income, business income, NRIs, AMT, relief under
// section 89, foreign income, and the tax-year rounding rules on the return.

export const TAX_RULES_REVIEWED_ON = "2026-11-07";
export const TAX_YEAR_LABEL = "tax year 2026-27 (FY 2026-27)";

export const TAX_SOURCES: { label: string; url: string }[] = [
  { label: "Finance Bill 2026 memorandum (rate tables, rebate, surcharge)", url: "https://www.indiabudget.gov.in/doc/memo.pdf" },
  { label: "Budget speech 2026-27", url: "https://www.indiabudget.gov.in/doc/budget_speech.pdf" },
  { label: "Income-tax Act, 2025 (replaced the 1961 Act from 1 April 2026)", url: "https://www.pib.gov.in/PressReleasePage.aspx?PRID=2248005&reg=3&lang=2" },
  { label: "Income-tax Rules, 2026 (Notification 22/2026, G.S.R. 198(E), HRA in rule 279)", url: "https://www.incometax.gov.in/iec/foportal/sites/default/files/2026-03/En-Notified-IT-Rules-2026-20-03-2026.pdf" },
];

/** The 1961 Act section and the Income-tax Act, 2025 section for each rule used here. */
export const SECTION_MAP: [string, string, string][] = [
  ["New regime (default)", "115BAC", "202"],
  ["Rebate", "87A", "156"],
  ["Standard deduction", "16(ia)", "19(1)"],
  ["Employee's own NPS and the 80C family", "80C, 80CCD(1)", "123, 124"],
  ["Extra NPS deduction and employer NPS", "80CCD(1B), 80CCD(2)", "124"],
  ["Health insurance", "80D", "126"],
  ["Savings and deposit interest", "80TTA, 80TTB", "153"],
  ["Home loan interest, self-occupied", "24(b)", "22(1)(b), 22(2)"],
  ["Education loan interest", "80E", "129"],
  ["House rent allowance", "10(13A), rule 2A", "Schedule III item 11, rule 279"],
];

const R = 100; // paise per rupee
export type Age = "under60" | "senior" | "super";
export type Slab = [number | null, number]; // [upper bound in rupees or null for no limit, rate in basis points]

export const RULES = {
  newSlabs: [[400_000, 0], [800_000, 500], [1_200_000, 1000], [1_600_000, 1500], [2_000_000, 2000], [2_400_000, 2500], [null, 3000]] as Slab[],
  oldSlabs: {
    under60: [[250_000, 0], [500_000, 500], [1_000_000, 2000], [null, 3000]] as Slab[],
    senior: [[300_000, 0], [500_000, 500], [1_000_000, 2000], [null, 3000]] as Slab[],
    super: [[500_000, 0], [1_000_000, 2000], [null, 3000]] as Slab[],
  },
  newRebateLimit: 1_200_000, // total income up to this: rebate up to newRebateMax; above it, marginal relief
  newRebateMax: 60_000,
  oldRebateLimit: 500_000, // a cliff: no relief just above
  oldRebateMax: 12_500,
  newStandardDeduction: 75_000,
  oldStandardDeduction: 50_000,
  cessBps: 400,
  // Surcharge tiers on total income: [threshold in rupees, rate in basis points]. The new regime stops at 25%.
  surchargeNew: [[5_000_000, 1000], [10_000_000, 1500], [20_000_000, 2500]] as [number, number][],
  surchargeOld: [[5_000_000, 1000], [10_000_000, 1500], [20_000_000, 2500], [50_000_000, 3700]] as [number, number][],
  employerNpsNewBps: 1400, // of basic + DA, any employer, new regime
  employerNpsOldGovernmentBps: 1400,
  employerNpsOldPrivateBps: 1000,
  cap80c: 150_000,
  cap80ccd1b: 50_000,
  cap80dUnder60: 25_000,
  cap80dSenior: 50_000,
  capTtaUnder60: 10_000, // savings-account interest only
  capTtbSenior: 50_000, // any deposit interest
  capHomeLoanQualifying: 200_000,
  capHomeLoanOther: 30_000,
};

export type TaxInput = {
  salary: number; // gross salary income for the year, before the standard deduction
  otherIncome: number; // interest, rent and other income taxed at slab rates
  age: Age;
  basicDa: number; // basic + DA for the year, used for the employer NPS cap
  employerNps: number; // employer's NPS contribution, assumed to be inside the salary figure
  government: boolean; // government employer: a higher employer NPS cap in the old regime
  // Old regime only
  hraExempt: number;
  professionalTax: number;
  c80: number; // 80C items plus the employee's own NPS (80CCD(1)), before the cap
  nps1b: number;
  selfHealth: number;
  parentsHealth: number;
  parentsSenior: boolean;
  savingsInterest: number; // interest that qualifies under 80TTA / 80TTB
  homeLoanInterest: number;
  homeLoanQualifies: boolean; // loan taken to buy or build and completed within 5 years
  eduLoanInterest: number;
};

/** Every deduction label the engine can emit, so the page can translate them and the tests can check each one. */
export const DEDUCTION_LABELS = [
  "Standard deduction", "Employer NPS", "House rent allowance exemption", "Professional tax", "80C family (incl. your own NPS)", "Extra NPS (80CCD(1B))",
  "Health insurance (80D)", "Savings interest (80TTA)", "Deposit interest (80TTB)", "Home loan interest (self-occupied)", "Education loan interest (80E)",
];

export type Line = { label: string; amount: number };

export type RegimeResult = {
  regime: "new" | "old";
  grossIncome: number; // salary + other income
  deductions: Line[]; // each line already capped
  totalDeductions: number;
  taxableIncome: number;
  slabTax: number;
  rebate: number;
  marginalRelief: number; // relief just above the new-regime rebate limit
  taxAfterRelief: number;
  surcharge: number; // after surcharge marginal relief
  surchargeRelief: number;
  cess: number;
  totalTax: number;
};

const roundHalfUp = (n: number, d: number): number => Math.floor((n * 2 + d) / (d * 2));
const nonNeg = (n: number): number => Math.max(0, Math.trunc(n));

export function slabTax(income: number, slabs: Slab[]): number {
  let numerator = 0;
  let lower = 0;
  for (const [up, bps] of slabs) {
    const upper = up === null ? income : Math.min(income, up * R);
    if (upper > lower) numerator += (upper - lower) * bps;
    if (up === null || income <= up * R) break;
    lower = up * R;
  }
  return roundHalfUp(numerator, 10000);
}

function surchargeFor(income: number, afterRelief: number, slabs: Slab[], tiers: [number, number][]) {
  let rate = 0;
  let start = 0;
  let prev = 0;
  for (const [limit, bps] of tiers) {
    if (income > limit * R) { prev = rate; rate = bps; start = limit * R; }
  }
  const raw = roundHalfUp(afterRelief * rate, 10000);
  if (rate === 0) return { surcharge: 0, relief: 0 };
  // Marginal relief: tax plus surcharge may not exceed the tax at the threshold (with the lower tier's surcharge) plus the income above it.
  const capTotal = roundHalfUp(slabTax(start, slabs) * (10000 + prev), 10000) + (income - start);
  const total = afterRelief + raw;
  return total > capTotal ? { surcharge: raw - (total - capTotal), relief: total - capTotal } : { surcharge: raw, relief: 0 };
}

function finish(regime: "new" | "old", gross: number, deductions: Line[], slabs: Slab[], tiers: [number, number][]): RegimeResult {
  const totalDeductions = deductions.reduce((a, d) => a + d.amount, 0);
  const taxableIncome = nonNeg(gross - totalDeductions);
  const tax = slabTax(taxableIncome, slabs);
  let rebate = 0;
  let marginalRelief = 0;
  if (regime === "new") {
    if (taxableIncome <= RULES.newRebateLimit * R) rebate = Math.min(tax, RULES.newRebateMax * R);
    else marginalRelief = Math.max(0, tax - (taxableIncome - RULES.newRebateLimit * R));
  } else if (taxableIncome <= RULES.oldRebateLimit * R) {
    rebate = Math.min(tax, RULES.oldRebateMax * R);
  }
  const afterRelief = tax - rebate - marginalRelief;
  const { surcharge, relief } = surchargeFor(taxableIncome, afterRelief, slabs, tiers);
  const subtotal = afterRelief + surcharge;
  const cess = roundHalfUp(subtotal * RULES.cessBps, 10000);
  return { regime, grossIncome: gross, deductions, totalDeductions, taxableIncome, slabTax: tax, rebate, marginalRelief, taxAfterRelief: afterRelief, surcharge, surchargeRelief: relief, cess, totalTax: subtotal + cess };
}

export function newRegime(i: TaxInput): RegimeResult {
  const salary = nonNeg(i.salary);
  const gross = salary + nonNeg(i.otherIncome);
  const std = Math.min(salary, RULES.newStandardDeduction * R);
  const nps = Math.min(nonNeg(i.employerNps), roundHalfUp(nonNeg(i.basicDa) * RULES.employerNpsNewBps, 10000));
  return finish("new", gross, [{ label: "Standard deduction", amount: std }, { label: "Employer NPS", amount: nps }].filter((d) => d.amount > 0), RULES.newSlabs, RULES.surchargeNew);
}

export function oldRegime(i: TaxInput): RegimeResult {
  const salary = nonNeg(i.salary);
  const gross = salary + nonNeg(i.otherIncome);
  const senior = i.age !== "under60";
  const empCap = i.government ? RULES.employerNpsOldGovernmentBps : RULES.employerNpsOldPrivateBps;
  const lines: Line[] = [
    { label: "Standard deduction", amount: Math.min(salary, RULES.oldStandardDeduction * R) },
    { label: "House rent allowance exemption", amount: nonNeg(i.hraExempt) },
    { label: "Professional tax", amount: nonNeg(i.professionalTax) },
    { label: "80C family (incl. your own NPS)", amount: Math.min(nonNeg(i.c80), RULES.cap80c * R) },
    { label: "Extra NPS (80CCD(1B))", amount: Math.min(nonNeg(i.nps1b), RULES.cap80ccd1b * R) },
    { label: "Employer NPS", amount: Math.min(nonNeg(i.employerNps), roundHalfUp(nonNeg(i.basicDa) * empCap, 10000)) },
    { label: "Health insurance (80D)", amount: Math.min(nonNeg(i.selfHealth), (senior ? RULES.cap80dSenior : RULES.cap80dUnder60) * R) + Math.min(nonNeg(i.parentsHealth), (i.parentsSenior ? RULES.cap80dSenior : RULES.cap80dUnder60) * R) },
    { label: senior ? "Deposit interest (80TTB)" : "Savings interest (80TTA)", amount: Math.min(nonNeg(i.savingsInterest), (senior ? RULES.capTtbSenior : RULES.capTtaUnder60) * R) },
    { label: "Home loan interest (self-occupied)", amount: Math.min(nonNeg(i.homeLoanInterest), (i.homeLoanQualifies ? RULES.capHomeLoanQualifying : RULES.capHomeLoanOther) * R) },
    { label: "Education loan interest (80E)", amount: nonNeg(i.eduLoanInterest) },
  ].filter((d) => d.amount > 0);
  return finish("old", gross, lines, RULES.oldSlabs[i.age], RULES.surchargeOld);
}

export const BLANK_INPUT: TaxInput = {
  salary: 0, otherIncome: 0, age: "under60", basicDa: 0, employerNps: 0, government: false, hraExempt: 0, professionalTax: 0, c80: 0, nps1b: 0,
  selfHealth: 0, parentsHealth: 0, parentsSenior: false, savingsInterest: 0, homeLoanInterest: 0, homeLoanQualifies: true, eduLoanInterest: 0,
};

/** Both regimes and which one leaves less tax (null when they are equal). */
export function compareRegimes(i: TaxInput) {
  const n = newRegime(i);
  const o = oldRegime(i);
  const lower: "new" | "old" | null = n.totalTax === o.totalTax ? null : n.totalTax < o.totalTax ? "new" : "old";
  return { new: n, old: o, lower, difference: Math.abs(n.totalTax - o.totalTax) };
}
