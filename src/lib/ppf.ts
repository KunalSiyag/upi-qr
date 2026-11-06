// Public Provident Fund maths in integer paise. No imports, so `scripts/ppf.test.mjs` runs it under Node.
//
// Rules, from the Public Provident Fund Scheme, 2019 as reproduced on staffnews.in and taxguru.in, and the Finance Ministry office
// memorandum of 30 Sep 2026 (see PPF_SOURCES; the official India Post and NSI pages could not be read when this was checked):
// - Interest is worked out for each calendar month on the LOWEST balance between the close of the 5th day and the end of the
//   month, and credited once, at the end of the financial year. It does not compound inside the year.
// - A deposit made by the 5th counts for that month's interest; one made after the 5th only starts earning the next month.
// - Between Rs 500 and Rs 1,50,000 can be deposited in a financial year, in multiples of Rs 50.
// - The account matures 15 years after the end of the financial year it was opened in; it can be extended in blocks of 5 years.
// This model opens the account in April, so year 1 is a full financial year. A mid-year opening has a later maturity date than the
// model shows; ask your bank or post office. The interest rate is set every quarter; the rate here is the one you enter.
// The total interest of a year is rounded half-up to the paisa; post offices and banks round to the rupee, so they can differ by up to Re 1.

export const PPF_REVIEWED_ON = "2026-11-07";
export const PPF_CURRENT_RATE_BPS = 710; // 7.1%, Oct-Dec 2026, unchanged from the Jul-Sep 2026 quarter
export const PPF_SOURCES: { label: string; url: string }[] = [
  { label: "Finance Ministry and Department of Posts orders of 30 Sep 2026: small savings rates unchanged for Oct-Dec 2026 (reproduced)", url: "https://www.staffnews.in/2026/10/revision-of-interest-rates-for-small-savings-schemes-w-e-f-01-10-2026.html" },
  { label: "PPF rate of 7.1% for Oct-Dec 2026 (news report)", url: "https://www.freepressjournal.in/business/small-savings-interest-rates-unchanged-for-oct-dec-ppf-at-71-per-cent-nsc-at-77-pc" },
  { label: "Public Provident Fund Scheme, 2019 (Gazette text, reproduced)", url: "https://www.staffnews.in/2019/12/public-provident-fund-scheme-2019-gazette-notification.html" },
];

export const PPF_MIN_YEAR = 500 * 100;
export const PPF_MAX_YEAR = 150_000 * 100;
export const PPF_STEP = 50 * 100;
export const PPF_TENURES = [15, 20, 25, 30, 35, 40, 45, 50] as const;

export type PpfPattern = "monthlyEarly" | "monthlyLate" | "yearlyEarly";

export type PpfInput = { deposit: number; pattern: PpfPattern; rateBps: number; years: number };
export type PpfYear = { year: number; deposited: number; interest: number; closing: number };
export type PpfResult = { maturity: number; deposited: number; interest: number; yearly: PpfYear[] };

const roundHalfUp = (n: number, d: number): number => Math.floor((n * 2 + d) / (d * 2));

/** The deposited amount in a financial year for a pattern. */
export function yearlyDeposit(deposit: number, pattern: PpfPattern): number {
  return pattern === "yearlyEarly" ? deposit : deposit * 12;
}

/** Why a deposit is not allowed, or null. */
export function ppfDepositProblem(deposit: number, pattern: PpfPattern): "step" | "min" | "max" | null {
  if (deposit <= 0 || deposit % PPF_STEP !== 0) return "step";
  const year = yearlyDeposit(deposit, pattern);
  if (year < PPF_MIN_YEAR) return "min";
  if (year > PPF_MAX_YEAR) return "max";
  return null;
}

export function ppf(input: PpfInput): PpfResult {
  const deposit = Math.max(0, Math.trunc(input.deposit));
  const bps = Math.max(0, Math.min(1500, Math.trunc(input.rateBps)));
  const years = Math.max(1, Math.min(50, Math.trunc(input.years)));
  let balance = 0;
  let deposited = 0;
  const yearly: PpfYear[] = [];
  for (let y = 1; y <= years; y++) {
    let current = balance;
    let weighted = 0; // sum of (lowest balance in the month x rate in basis points)
    let depositedYear = 0;
    for (let m = 1; m <= 12; m++) {
      let lowest: number;
      if (input.pattern === "monthlyEarly") {
        current += deposit;
        depositedYear += deposit;
        lowest = current;
      } else if (input.pattern === "monthlyLate") {
        lowest = current; // the deposit comes after the 5th, so it does not count this month
        current += deposit;
        depositedYear += deposit;
      } else {
        if (m === 1) { current += deposit; depositedYear += deposit; }
        lowest = current;
      }
      weighted += lowest * bps;
    }
    const interest = roundHalfUp(weighted, 120000);
    balance = current + interest;
    deposited += depositedYear;
    yearly.push({ year: y, deposited: depositedYear, interest, closing: balance });
  }
  return { maturity: balance, deposited, interest: balance - deposited, yearly };
}
