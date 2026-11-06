// Education-loan maths in integer paise. Imports only ./loanMath.ts so `scripts/education-loan.test.mjs` runs under Node.
//
// The model (state it on the page; lenders differ, so the user is told to check with theirs):
// - The moratorium runs for the course months plus a grace period after it. No EMI is due in it.
// - The loan is paid out either all at once in month 1, or in equal parts at the start of each course year
//   (any odd paise go to the first part). Interest is charged only on what has been paid out.
// - Each month's interest is the amount outstanding × annual rate ÷ 12, rounded half-up to the paisa.
// - If the borrower does NOT pay during the moratorium, the interest builds up. "Simple" charges it on the amount
//   paid out only; "compound" also charges it on the interest already built up. Either way, the total is added to the
//   loan when the moratorium ends and EMIs are worked out on that larger amount.
// - If the borrower DOES pay the interest each month, nothing builds up and the EMI is worked out on the amount paid out.
import { MAX_MONTHS, MAX_PRINCIPAL_PAISE, buildSchedule, monthlyInterest, type Schedule } from "./loanMath.ts";

export const MAX_COURSE_MONTHS = 96; // 8 years
export const MAX_GRACE_MONTHS = 36;
export const MAX_REPAY_MONTHS = 240; // 20 years

export type Disbursement = "upfront" | "yearly";
export type UnpaidInterest = "simple" | "compound";

export type EducationInput = {
  principal: number; // paise, the total sanctioned and paid out
  rateBps: number;
  courseMonths: number;
  graceMonths: number;
  repayMonths: number;
  disbursement: Disbursement;
  unpaidInterest: UnpaidInterest; // only matters when payDuring is false
  payDuring: boolean; // pay the interest every month during the moratorium
};

export type Tranche = { month: number; amount: number };

export type EducationResult = {
  disbursed: number;
  tranches: Tranche[];
  moratoriumMonths: number;
  accrued: number; // interest built up and added to the loan (0 when paid during)
  preEmiTotal: number; // interest paid during the moratorium (0 when not paid)
  preEmiFirst: number; // the first month's interest payment (0 when not paid)
  preEmiLast: number; // the last month's interest payment (0 when not paid)
  repayPrincipal: number; // what the EMIs are worked out on
  emi: number;
  repayMonths: number; // instalments actually paid
  repayInterest: number;
  totalInterest: number; // everything above the amount paid out
  totalCost: number; // disbursed + totalInterest
  schedule: Schedule; // the repayment phase, year by year
};

export function splitTranches(principal: number, courseMonths: number, mode: Disbursement): Tranche[] {
  if (mode === "upfront") return [{ month: 1, amount: principal }];
  const parts = Math.max(1, Math.ceil(courseMonths / 12));
  const base = Math.floor(principal / parts);
  const out: Tranche[] = [];
  for (let i = 0; i < parts; i++) out.push({ month: 1 + 12 * i, amount: base + (i === 0 ? principal - base * parts : 0) });
  return out;
}

export function educationLoan(input: EducationInput): EducationResult {
  const principal = Math.max(0, Math.min(MAX_PRINCIPAL_PAISE, Math.trunc(input.principal)));
  const rateBps = Math.max(0, Math.trunc(input.rateBps));
  const courseMonths = Math.max(1, Math.min(MAX_COURSE_MONTHS, Math.trunc(input.courseMonths)));
  const graceMonths = Math.max(0, Math.min(MAX_GRACE_MONTHS, Math.trunc(input.graceMonths)));
  const repayMonths = Math.max(1, Math.min(MAX_MONTHS, MAX_REPAY_MONTHS, Math.trunc(input.repayMonths)));
  const tranches = splitTranches(principal, courseMonths, input.disbursement);
  const moratoriumMonths = courseMonths + graceMonths;

  let outstanding = 0;
  let accrued = 0;
  let preEmiTotal = 0;
  let preEmiFirst = 0;
  let preEmiLast = 0;
  for (let m = 1; m <= moratoriumMonths; m++) {
    for (const t of tranches) if (t.month === m) outstanding += t.amount;
    const chargedOn = input.payDuring || input.unpaidInterest === "simple" ? outstanding : outstanding + accrued;
    const interest = monthlyInterest(chargedOn, rateBps);
    if (input.payDuring) {
      preEmiTotal += interest;
      if (m === 1) preEmiFirst = interest;
      preEmiLast = interest;
    } else {
      accrued += interest;
    }
  }

  const repayPrincipal = outstanding + accrued;
  const schedule = buildSchedule({ principal: repayPrincipal, rateBps, months: repayMonths });
  const totalInterest = preEmiTotal + accrued + schedule.totalInterest;
  return {
    disbursed: outstanding,
    tranches,
    moratoriumMonths,
    accrued,
    preEmiTotal,
    preEmiFirst,
    preEmiLast,
    repayPrincipal,
    emi: schedule.emi,
    repayMonths: schedule.months,
    repayInterest: schedule.totalInterest,
    totalInterest,
    totalCost: outstanding + totalInterest,
    schedule,
  };
}
