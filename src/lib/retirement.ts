// Retirement corpus planner in integer paise at the edges. No imports, so `scripts/retirement.test.mjs` runs it under Node.
//
// Model (all assumptions are shown on the page):
// - Monthly steps. A yearly return of r% earns r/12 % a month (nominal, compounded monthly).
// - Savings: contributions are made at the START of each month, so each one earns that month. The monthly amount steps up by the
//   chosen % once a year (rounded half-up to the paisa); existing savings grow at the same return.
// - Spending: today's monthly spending grows with inflation once a year; the first retirement year's figure is today's x (1+i)^years.
//   Spending is withdrawn at the START of each month of retirement and the rest earns the retirement return, which is usually lower.
// - Corpus needed: the money that must be there on the day you retire for withdrawals to just run out at the end age. Worked backwards
//   month by month, so there is no closed-form formula to get wrong.
// - Floating point is used for the compounding, and every figure is rounded to the paisa only when it is returned. The tests compare
//   against independent Python Decimal results to within a few paise.
// NPS exit: normal exit rules (lump sum / annuity split) are the ones reported after PFRDA's December 2025 change; see NPS_SOURCES.

export const RETIREMENT_REVIEWED_ON = "2026-11-07";
export const NPS_SOURCES: { label: string; url: string }[] = [
  { label: "PFRDA eases NPS exit rules for non-government subscribers: mandatory annuity cut to 20% (Business Today, 17 Dec 2025)", url: "https://www.businesstoday.in/personal-finance/retirement-planning/story/pfrda-eases-nps-exit-rules-for-non-government-subscribers-lowers-mandatory-annuity-to-20-507010-2025-12-17" },
  { label: "Exits and withdrawals under the National Pension System (reproduced PFRDA text)", url: "https://www.staffnews.in/2025/12/exists-and-withdrawals-under-the-national-pension-system.html" },
  { label: "NPS exit and withdrawal regulations, December 2025 (TaxGuru)", url: "https://taxguru.in/?p=1012127" },
];

export type RetirementInput = {
  age: number; // current age, whole years
  retireAge: number;
  endAge: number; // age the money must last until
  monthlySpend: number; // today's monthly spending, paise
  inflationBps: number;
  savings: number; // paise already saved
  monthlySave: number; // paise a month from now
  stepUpBps: number; // yearly increase of the monthly saving
  returnBps: number; // yearly return before retirement
  retiredReturnBps: number; // yearly return during retirement
};

export type RetirementYear = { age: number; phase: "save" | "spend"; flow: number; closing: number };
export type RetirementResult = {
  yearsToRetire: number;
  yearsInRetirement: number;
  spendAtRetirement: number; // first-year monthly spending, in the money of the day you retire
  corpus: number; // projected savings on the day you retire
  needed: number; // corpus needed on the day you retire
  gap: number; // needed - corpus when positive, else 0
  surplus: number; // corpus - needed when positive, else 0
  extraMonthly: number; // flat extra monthly saving that would close the gap, 0 when none
  corpusToday: number; // the projected corpus in today's money
  lastsUntilAge: number | null; // null = beyond endAge; otherwise age (with a decimal) when the money runs out
  yearly: RetirementYear[];
};

const roundHalfUp = (n: number): number => Math.floor(n + 0.5);

export function retirementProblem(i: RetirementInput): string | null {
  if (!(i.age >= 18 && i.age <= 70)) return "age";
  if (!(i.retireAge > i.age && i.retireAge <= 80)) return "retireAge";
  if (!(i.endAge > i.retireAge && i.endAge <= 110)) return "endAge";
  if (!(i.monthlySpend > 0)) return "monthlySpend";
  return null;
}

/** Spending per month in each retirement year (index 0 = first year), paise, rounded to the paisa once a year. */
function spendByYear(i: RetirementInput, years: number): number[] {
  const out: number[] = [];
  const f = 1 + i.inflationBps / 10000;
  let v = i.monthlySpend * Math.pow(f, i.retireAge - i.age);
  for (let y = 0; y < years; y++) {
    out.push(roundHalfUp(v));
    v *= f;
  }
  return out;
}

/** Money needed on the retirement day, worked backwards from the end age. */
export function corpusNeeded(i: RetirementInput): number {
  const years = i.endAge - i.retireAge;
  const spend = spendByYear(i, years);
  const q = 1 + i.retiredReturnBps / 10000 / 12;
  let need = 0;
  for (let y = years - 1; y >= 0; y--) for (let m = 0; m < 12; m++) need = need / q + spend[y];
  return roundHalfUp(need);
}

export function retirement(input: RetirementInput): RetirementResult {
  const i = { ...input };
  const N = i.retireAge - i.age;
  const L = i.endAge - i.retireAge;
  const j = 1 + i.returnBps / 10000 / 12;
  const q = 1 + i.retiredReturnBps / 10000 / 12;
  const yearly: RetirementYear[] = [];

  let balance = i.savings;
  let monthly = i.monthlySave;
  for (let y = 0; y < N; y++) {
    for (let m = 0; m < 12; m++) balance = (balance + monthly) * j;
    yearly.push({ age: i.age + y + 1, phase: "save", flow: monthly * 12, closing: roundHalfUp(balance) });
    monthly = roundHalfUp(monthly * (1 + i.stepUpBps / 10000));
  }
  const corpus = roundHalfUp(balance);
  const needed = corpusNeeded(i);

  // Spend the projected corpus year by year to see how long it lasts.
  const spend = spendByYear(i, L);
  let left = balance;
  let lastsUntilAge: number | null = null;
  for (let y = 0; y < L; y++) {
    let paid = 0;
    for (let m = 0; m < 12; m++) {
      const w = spend[y];
      if (left < w - 1e-6) {
        paid += Math.max(0, left);
        lastsUntilAge = lastsUntilAge ?? i.retireAge + y + m / 12 + (w > 0 ? Math.max(0, left) / w / 12 : 0);
        left = 0;
        continue;
      }
      left = (left - w) * q;
      paid += w;
    }
    yearly.push({ age: i.retireAge + y + 1, phase: "spend", flow: paid, closing: roundHalfUp(Math.max(0, left)) });
    if (lastsUntilAge !== null && left <= 0) {
      // Show the year the money ran out, then stop.
      break;
    }
  }

  let factor = 0; // value at retirement of 1 rupee saved at the start of every month
  for (let k = 1; k <= N * 12; k++) factor += Math.pow(j, k);
  const gap = Math.max(0, needed - corpus);
  const surplus = Math.max(0, corpus - needed);
  return {
    yearsToRetire: N,
    yearsInRetirement: L,
    spendAtRetirement: spend[0],
    corpus,
    needed,
    gap,
    surplus,
    extraMonthly: gap > 0 && factor > 0 ? Math.ceil(gap / factor - 1e-9) : 0,
    corpusToday: roundHalfUp(corpus / Math.pow(1 + i.inflationBps / 10000, N)),
    lastsUntilAge: lastsUntilAge === null ? null : Math.round(lastsUntilAge * 10) / 10,
    yearly,
  };
}

export type NpsSubscriber = "nonGovernment" | "government";
export const NPS_MIN_ANNUITY_PCT: Record<NpsSubscriber, number> = { nonGovernment: 20, government: 40 };

export type NpsExit = { lumpSum: number; annuityPurchase: number; monthlyPension: number };

/**
 * Splits an NPS corpus at normal exit. `annuityPct` is clamped to the minimum for the subscriber type (20% non-government,
 * 40% government). The monthly pension is the annuity purchase price times the annuity rate / 12 (a life annuity without return
 * of purchase price); real annuity quotes differ by plan, age and provider.
 */
export function npsExit(corpus: number, subscriber: NpsSubscriber, annuityPct: number, annuityRateBps: number): NpsExit {
  const pct = Math.max(NPS_MIN_ANNUITY_PCT[subscriber], Math.min(100, annuityPct));
  const annuityPurchase = roundHalfUp((corpus * pct) / 100);
  return { lumpSum: corpus - annuityPurchase, annuityPurchase, monthlyPension: roundHalfUp((annuityPurchase * annuityRateBps) / 10000 / 12) };
}
