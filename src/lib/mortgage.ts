// Mortgage maths in integer minor units (cents, pence, paise). Imports only ./loanMath.ts, so `scripts/mortgage.test.mjs`
// runs it under Node. Works in any currency.
//
// The model (state it on the page; lenders differ, so the user is told to check theirs):
// - Principal and interest follow loanMath: each month's interest is the balance × rate ÷ 12 rounded half-up, the payment is the
//   standard annuity figure, the last payment clears the balance, and extra monthly or lump-sum payments go to principal.
// - Property tax and home insurance are yearly amounts, charged 1/12 each month (rounded half-up) for as long as the loan runs.
//   Fees (HOA, maintenance) are a flat monthly amount. None of them grow over time.
// - Mortgage insurance is a yearly rate on the ORIGINAL loan, charged 1/12 each month while the balance at the start of the
//   month is above `miStopBps` of the home price, then it stops. A rate of 0 means none.
// - "How much can I afford" finds the largest whole-unit price whose first-month cost (payment + tax + insurance + mortgage
//   insurance + fees) fits the smaller of two limits: a share of gross monthly income, and a larger share less existing
//   debt payments. Lenders often use about 28% and 36%; both are the user's inputs.
import { emiPaise, monthlyInterest } from "./loanMath.ts";

export const MAX_PRICE = 100_000_000_000; // minor units
export const MAX_YEARS = 40;

export type MortgageInput = {
  price: number;
  down: number;
  rateBps: number;
  years: number;
  taxYear: number;
  insuranceYear: number;
  hoaMonth: number;
  miBps: number; // yearly, on the original loan; 60 = 0.60%
  miStopBps: number; // mortgage insurance stops once the balance is at or below this share of the price; 8000 = 80%
  extraMonthly: number;
  lumpSum: number;
  lumpMonth: number;
};

export type MortgageYear = { year: number; principal: number; interest: number; taxInsFees: number; mortgageInsurance: number; balance: number };

export type MortgageResult = {
  loan: number;
  emi: number; // principal and interest each month
  taxMonth: number;
  insuranceMonth: number;
  hoaMonth: number;
  miMonth: number; // the monthly mortgage insurance while it applies
  firstTotal: number; // the first month's whole payment
  months: number; // months until the loan is paid off
  totalInterest: number;
  totalMi: number;
  miMonths: number;
  totalTax: number;
  totalInsurance: number;
  totalHoa: number;
  totalPaid: number; // everything paid over the life of the loan, the down payment excluded
  yearly: MortgageYear[];
};

const roundHalfUp = (n: number, d: number): number => Math.floor((n * 2 + d) / (d * 2));
const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, Math.trunc(n)));

export function mortgage(input: MortgageInput): MortgageResult {
  const price = clamp(input.price, 0, MAX_PRICE);
  const down = clamp(input.down, 0, price);
  const bps = clamp(input.rateBps, 0, 5000);
  const years = clamp(input.years, 1, MAX_YEARS);
  const loan = price - down;
  const n = years * 12;
  const taxMonth = roundHalfUp(clamp(input.taxYear, 0, MAX_PRICE), 12);
  const insuranceMonth = roundHalfUp(clamp(input.insuranceYear, 0, MAX_PRICE), 12);
  const hoaMonth = clamp(input.hoaMonth, 0, MAX_PRICE);
  const miBps = clamp(input.miBps, 0, 5000);
  const miStopBps = clamp(input.miStopBps, 0, 10000);
  const extra = clamp(input.extraMonthly, 0, MAX_PRICE);
  const lump = clamp(input.lumpSum, 0, MAX_PRICE);
  const lumpMonth = clamp(input.lumpMonth, 0, 1000);
  const emi = emiPaise(loan, bps, n);
  const miMonth = roundHalfUp(loan * miBps, 120000);
  const miApplies = (balance: number) => miMonth > 0 && balance * 10000 > price * miStopBps;

  const yearly: MortgageYear[] = [];
  let balance = loan;
  let months = 0;
  let totalInterest = 0;
  let totalMi = 0;
  let miMonths = 0;
  let row: (MortgageYear & { months: number }) | null = null;
  for (let m = 1; m <= n && balance > 0; m++) {
    if (!row || row.months === 12) {
      row = { year: yearly.length + 1, principal: 0, interest: 0, taxInsFees: 0, mortgageInsurance: 0, balance, months: 0 };
      yearly.push(row);
    }
    const mi = miApplies(balance) ? miMonth : 0;
    const interest = monthlyInterest(balance, bps);
    const due = balance + interest;
    const regular = m === n ? due : Math.min(emi, due);
    const extraPaid = m === n ? 0 : Math.min(extra, due - regular);
    balance -= regular - interest + extraPaid;
    let principal = regular - interest + extraPaid;
    if (lump > 0 && m === lumpMonth && balance > 0) {
      const l = Math.min(lump, balance);
      balance -= l;
      principal += l;
    }
    months = m;
    totalInterest += interest;
    if (mi > 0) { totalMi += mi; miMonths += 1; }
    row.months += 1;
    row.principal += principal;
    row.interest += interest;
    row.taxInsFees += taxMonth + insuranceMonth + hoaMonth;
    row.mortgageInsurance += mi;
    row.balance = balance;
  }

  const totalTax = taxMonth * months;
  const totalInsurance = insuranceMonth * months;
  const totalHoa = hoaMonth * months;
  return {
    loan,
    emi: loan > 0 ? emi : 0,
    taxMonth,
    insuranceMonth,
    hoaMonth,
    miMonth,
    firstTotal: loan > 0 ? emi + taxMonth + insuranceMonth + hoaMonth + (miApplies(loan) ? miMonth : 0) : taxMonth + insuranceMonth + hoaMonth,
    months,
    totalInterest,
    totalMi,
    miMonths,
    totalTax,
    totalInsurance,
    totalHoa,
    totalPaid: loan + totalInterest + totalTax + totalInsurance + totalHoa + totalMi,
    yearly: yearly.map(({ months: _m, ...rest }) => rest),
  };
}

export type AffordInput = {
  incomeYear: number;
  debtsMonth: number;
  frontBps: number; // share of gross monthly income for housing; 2800 = 28%
  backBps: number; // share of gross monthly income for housing plus other debts; 3600 = 36%
  downBps: number; // down payment as a share of the price
  rateBps: number;
  years: number;
  taxBps: number; // property tax as a yearly share of the price; 110 = 1.10%
  insuranceBps: number; // home insurance as a yearly share of the price
  hoaMonth: number;
  miBps: number;
  miStopBps: number;
};

export type AffordResult = {
  monthlyIncome: number;
  maxHousing: number;
  price: number;
  down: number;
  loan: number;
  emi: number;
  taxMonth: number;
  insuranceMonth: number;
  miMonth: number;
  hoaMonth: number;
  total: number;
};

function costAt(price: number, i: AffordInput) {
  const bps = clamp(i.rateBps, 0, 5000);
  const years = clamp(i.years, 1, MAX_YEARS);
  const down = roundHalfUp(price * clamp(i.downBps, 0, 10000), 10000);
  const loan = price - down;
  const emi = emiPaise(loan, bps, years * 12);
  const taxMonth = roundHalfUp(price * clamp(i.taxBps, 0, 5000), 120000);
  const insuranceMonth = roundHalfUp(price * clamp(i.insuranceBps, 0, 5000), 120000);
  const miRate = clamp(i.miBps, 0, 5000);
  const miMonth = miRate > 0 && loan * 10000 > price * clamp(i.miStopBps, 0, 10000) ? roundHalfUp(loan * miRate, 120000) : 0;
  const hoaMonth = clamp(i.hoaMonth, 0, MAX_PRICE);
  return { down, loan, emi, taxMonth, insuranceMonth, miMonth, hoaMonth, total: emi + taxMonth + insuranceMonth + miMonth + hoaMonth };
}

/** The largest whole-unit price whose first-month cost fits the budget; price 0 when nothing fits. */
export function affordableHome(i: AffordInput): AffordResult {
  const monthlyIncome = roundHalfUp(clamp(i.incomeYear, 0, MAX_PRICE), 12);
  const front = roundHalfUp(monthlyIncome * clamp(i.frontBps, 0, 10000), 10000);
  const back = roundHalfUp(monthlyIncome * clamp(i.backBps, 0, 10000), 10000) - clamp(i.debtsMonth, 0, MAX_PRICE);
  const maxHousing = Math.max(0, Math.min(front, back));
  let lo = 0;
  let hi = MAX_PRICE / 100;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    if (costAt(mid * 100, i).total <= maxHousing) lo = mid;
    else hi = mid - 1;
  }
  const price = lo * 100;
  const c = costAt(price, i);
  return { monthlyIncome, maxHousing, price, down: c.down, loan: c.loan, emi: c.emi, taxMonth: c.taxMonth, insuranceMonth: c.insuranceMonth, miMonth: c.miMonth, hoaMonth: c.hoaMonth, total: price > 0 ? c.total : 0 };
}
