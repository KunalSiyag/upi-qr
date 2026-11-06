// Home-loan maths in integer paise. No imports, so `scripts/loan.test.mjs` runs it under Node.
//
// Rules the numbers follow (state them on the page):
// - Interest each month = balance × annual rate ÷ 12, rounded half-up to the paisa.
// - The EMI is the standard annuity figure rounded to the paisa.
// - The last scheduled instalment clears whatever is left (lenders do the same: a few paise of rounding).
// - A prepayment (monthly extra or one lump sum) goes straight to principal and the EMI stays the same,
//   so the loan ends sooner. Lenders differ; some let you cut the EMI instead.
// - Rates are integer basis points of a percent (8.75% = 875). With a rate ≤ 50% and a principal ≤ ₹100 crore the
//   largest product is 5e14, below 2^53, so every step below is exact.

export const MAX_PRINCIPAL_PAISE = 100_00_00_000 * 100; // ₹100 crore
export const MAX_RATE_BPS = 5000; // 50%
export const MAX_MONTHS = 480; // 40 years

export type LoanInput = {
  principal: number; // paise
  rateBps: number; // 875 = 8.75%
  months: number; // scheduled tenure
  extraMonthly?: number; // paise paid on top of every EMI
  lumpSum?: number; // paise paid once, after the EMI of `lumpMonth`
  lumpMonth?: number; // 1-based month number
};

export type YearRow = {
  year: number;
  opening: number;
  principalPaid: number; // from EMIs
  prepaid: number; // extra monthly + lump sum
  interestPaid: number;
  closing: number;
  months: number; // instalments paid in this year
};

export type Schedule = {
  emi: number;
  scheduledMonths: number;
  months: number; // instalments actually paid
  totalInterest: number;
  totalPaid: number;
  totalPrepaid: number;
  lastPayment: number;
  yearly: YearRow[];
};

/** "12,50,000" or "1250000.50" → paise. Null when empty, malformed, negative, or above the cap. */
export function parsePaise(text: string): number | null {
  const clean = text.trim().replace(/[,\s]/g, "");
  if (!/^\d{1,12}(\.\d{0,2})?$/.test(clean)) return null;
  const [whole, frac = ""] = clean.split(".");
  const paise = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  return paise <= MAX_PRINCIPAL_PAISE ? paise : null;
}

/** Like parsePaise, but an empty box means zero. */
export function parseOptionalPaise(text: string): number | null {
  return text.trim() === "" ? 0 : parsePaise(text);
}

/** "8.75" → 875. Null when malformed or above 50%. */
export function parseRateBps(text: string): number | null {
  const clean = text.trim();
  if (!/^\d{1,2}(\.\d{0,2})?$/.test(clean)) return null;
  const [whole, frac = ""] = clean.split(".");
  const bps = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  return bps <= MAX_RATE_BPS ? bps : null;
}

/** One month's interest on `balance` paise, rounded half-up. */
export function monthlyInterest(balance: number, rateBps: number): number {
  return Math.floor((balance * rateBps + 60000) / 120000);
}

export function emiPaise(principal: number, rateBps: number, months: number): number {
  if (principal <= 0 || months <= 0) return 0;
  if (rateBps === 0) return Math.round(principal / months);
  const r = rateBps / 120000;
  const f = Math.pow(1 + r, months);
  return Math.round((principal * r * f) / (f - 1));
}

export function buildSchedule(input: LoanInput): Schedule {
  const principal = Math.max(0, Math.trunc(input.principal));
  const scheduledMonths = Math.max(1, Math.min(MAX_MONTHS, Math.trunc(input.months)));
  const rateBps = Math.max(0, Math.min(MAX_RATE_BPS, Math.trunc(input.rateBps)));
  const extra = Math.max(0, Math.trunc(input.extraMonthly ?? 0));
  const lump = Math.max(0, Math.trunc(input.lumpSum ?? 0));
  const lumpMonth = Math.max(0, Math.trunc(input.lumpMonth ?? 0));
  const emi = emiPaise(principal, rateBps, scheduledMonths);

  const yearly: YearRow[] = [];
  let balance = principal;
  let totalInterest = 0;
  let totalPrepaid = 0;
  let totalPaid = 0;
  let lastPayment = 0;
  let months = 0;
  let row: YearRow | null = null;

  for (let m = 1; m <= scheduledMonths && balance > 0; m++) {
    if (!row || row.months === 12) {
      row = { year: yearly.length + 1, opening: balance, principalPaid: 0, prepaid: 0, interestPaid: 0, closing: balance, months: 0 };
      yearly.push(row);
    }
    const interest = monthlyInterest(balance, rateBps);
    const due = balance + interest;
    // The scheduled last month always clears the loan; otherwise pay the EMI plus any extra, never more than is due.
    const regular = m === scheduledMonths ? due : Math.min(emi, due);
    const extraPaid = m === scheduledMonths ? 0 : Math.min(extra, due - regular);
    const principalFromEmi = regular - interest;
    balance -= principalFromEmi + extraPaid;
    let prepaid = extraPaid;
    if (lump > 0 && m === lumpMonth && balance > 0) {
      const l = Math.min(lump, balance);
      balance -= l;
      prepaid += l;
    }
    totalInterest += interest;
    totalPrepaid += prepaid;
    totalPaid += regular + prepaid;
    lastPayment = regular + prepaid;
    months = m;
    row.months += 1;
    row.interestPaid += interest;
    row.principalPaid += principalFromEmi;
    row.prepaid += prepaid;
    row.closing = balance;
  }

  return { emi, scheduledMonths, months, totalInterest, totalPaid, totalPrepaid, lastPayment, yearly };
}

export type Savings = { monthsSaved: number; interestSaved: number };

export function savings(base: Schedule, withPrepay: Schedule): Savings {
  return { monthsSaved: base.months - withPrepay.months, interestSaved: base.totalInterest - withPrepay.totalInterest };
}

export type Affordability = { maxEmi: number; maxLoan: number };

/**
 * How much a lender may offer: the EMI you can carry is `foirPercent`% of monthly income minus EMIs you already pay
 * (the lender's "fixed obligation to income ratio"; banks commonly use 40–60%). The loan is the principal whose EMI
 * equals that, rounded down to a whole rupee. An estimate, not an offer.
 */
export function affordability(incomeMonthly: number, existingEmis: number, foirPercent: number, rateBps: number, months: number): Affordability {
  const income = Math.max(0, Math.trunc(incomeMonthly));
  const foir = Math.max(0, Math.min(100, foirPercent));
  const maxEmi = Math.max(0, Math.floor((income * foir) / 100) - Math.max(0, Math.trunc(existingEmis)));
  const n = Math.max(1, Math.min(MAX_MONTHS, Math.trunc(months)));
  if (maxEmi === 0) return { maxEmi, maxLoan: 0 };
  let loan: number;
  if (rateBps === 0) {
    loan = maxEmi * n;
  } else {
    const r = rateBps / 120000;
    loan = (maxEmi * (1 - Math.pow(1 + r, -n))) / r;
  }
  const rupees = Math.floor(loan / 100) * 100;
  return { maxEmi, maxLoan: Math.min(rupees, MAX_PRINCIPAL_PAISE) };
}

/** Month `m` after a "YYYY-MM-DD" start, as "Mon YYYY" in English. Null when the date does not parse. */
export function monthLabel(startIso: string, monthsAfter: number): string | null {
  const match = /^(\d{4})-(\d{2})/.exec(startIso);
  if (!match) return null;
  const total = Number(match[1]) * 12 + (Number(match[2]) - 1) + monthsAfter;
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[total % 12]} ${Math.floor(total / 12)}`;
}
