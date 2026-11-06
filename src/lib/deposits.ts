// Fixed and recurring deposit maths in integer paise. No imports, so `scripts/deposits.test.mjs` runs it under Node.
//
// The conventions (state them on the page; banks differ by a few rupees, so the user is told to check theirs):
// - Fixed deposit, cumulative: interest is worked out each compounding period (monthly, quarterly, half-yearly or
//   yearly) on the balance, rounded half-up to the paisa and added to it. A tenure that is not a whole number of periods
//   ends with simple interest for the leftover months on the then balance.
// - Fixed deposit, payout: each period pays principal × rate ÷ periods per year, rounded half-up to the paisa, and the
//   principal comes back at maturity. Leftover months at the end earn simple interest, paid at maturity. Some banks
//   discount a monthly or quarterly payout slightly; this model does not.
// - Recurring deposit: a deposit at the start of each month, interest compounded quarterly, the usual formula
//   M = R × Σ (1 + r/4)^(k/3) for k = 1…N, rounded half-up once at the end. This one needs fractional powers, so it uses
//   floating point inside and rounds to the paisa at the end.
// - Tax is the user's own rate applied to the interest, a rough guide: it ignores cess, surcharge and when TDS is cut.
// Rates are integer basis points of a percent (7.25% = 725).

export const MAX_RATE_BPS = 2500; // 25%
export const MAX_MONTHS = 120; // 10 years

export type PeriodsPerYear = 1 | 2 | 4 | 12;

const roundHalfUp = (numerator: number, denominator: number): number => Math.floor((numerator * 2 + denominator) / (denominator * 2));

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.trunc(n)));
}

export type FdResult = { maturity: number; interest: number };

/** Cumulative FD value after `months`, compounding `freq` times a year. */
export function fdCumulative(principal: number, rateBps: number, months: number, freq: PeriodsPerYear): FdResult {
  const P = clamp(principal, 0, 100_00_00_000 * 100);
  const bps = clamp(rateBps, 0, MAX_RATE_BPS);
  const m = clamp(months, 0, MAX_MONTHS);
  const periodMonths = 12 / freq;
  const full = Math.floor(m / periodMonths);
  const rest = m - full * periodMonths;
  let balance = P;
  for (let i = 0; i < full; i++) balance += roundHalfUp(balance * bps, 10000 * freq);
  if (rest > 0) balance += roundHalfUp(balance * bps * rest, 10000 * 12);
  return { maturity: balance, interest: balance - P };
}

export type FdYear = { year: number; opening: number; interest: number; closing: number };

/** The value at the end of each year, and at maturity if that falls inside a year. */
export function fdCumulativeYearly(principal: number, rateBps: number, months: number, freq: PeriodsPerYear): FdYear[] {
  const m = clamp(months, 0, MAX_MONTHS);
  const rows: FdYear[] = [];
  let opening = clamp(principal, 0, 100_00_00_000 * 100);
  for (let end = 12; end < m + 12; end += 12) {
    const at = Math.min(end, m);
    const closing = fdCumulative(principal, rateBps, at, freq).maturity;
    rows.push({ year: rows.length + 1, opening, interest: closing - opening, closing });
    opening = closing;
    if (at === m) break;
  }
  return rows;
}

export type PayoutResult = {
  amount: number; // each regular payout
  payouts: number; // how many regular payouts
  partial: number; // interest for leftover months, paid at maturity (0 when none)
  totalInterest: number;
  yearly: { year: number; interest: number }[];
};

/** Non-cumulative FD: interest paid out every period, principal back at maturity. */
export function fdPayout(principal: number, rateBps: number, months: number, freq: PeriodsPerYear): PayoutResult {
  const P = clamp(principal, 0, 100_00_00_000 * 100);
  const bps = clamp(rateBps, 0, MAX_RATE_BPS);
  const m = clamp(months, 0, MAX_MONTHS);
  const periodMonths = 12 / freq;
  const payouts = Math.floor(m / periodMonths);
  const rest = m - payouts * periodMonths;
  const amount = roundHalfUp(P * bps, 10000 * freq);
  const partial = rest > 0 ? roundHalfUp(P * bps * rest, 10000 * 12) : 0;
  const yearly: { year: number; interest: number }[] = [];
  const years = Math.ceil(m / 12);
  for (let y = 1; y <= years; y++) yearly.push({ year: y, interest: 0 });
  for (let k = 1; k <= payouts; k++) yearly[Math.ceil((k * periodMonths) / 12) - 1].interest += amount;
  if (partial > 0) yearly[years - 1].interest += partial;
  return { amount, payouts, partial, totalInterest: amount * payouts + partial, yearly };
}

export type RdResult = { maturity: number; deposited: number; interest: number };

/** Recurring deposit maturity: `deposit` paise at the start of each of `months` months, quarterly compounding. */
export function rdMaturity(deposit: number, rateBps: number, months: number): RdResult {
  const R = clamp(deposit, 0, 100_00_00_000 * 100);
  const bps = clamp(rateBps, 0, MAX_RATE_BPS);
  const n = clamp(months, 0, MAX_MONTHS);
  const deposited = R * n;
  if (bps === 0 || n === 0) return { maturity: deposited, deposited, interest: 0 };
  const logStep = Math.log1p(bps / 40000) / 3; // ln of the monthly growth factor q = (1 + r/4)^(1/3)
  const q = Math.exp(logStep);
  const sum = (q * Math.expm1(n * logStep)) / Math.expm1(logStep); // q + q² + … + qⁿ
  const maturity = Math.round(R * sum);
  return { maturity, deposited, interest: maturity - deposited };
}

export type RdYear = { year: number; deposited: number; interest: number; balance: number };

export function rdYearly(deposit: number, rateBps: number, months: number): RdYear[] {
  const n = clamp(months, 0, MAX_MONTHS);
  const rows: RdYear[] = [];
  for (let end = 12; end < n + 12; end += 12) {
    const at = Math.min(end, n);
    const r = rdMaturity(deposit, rateBps, at);
    rows.push({ year: rows.length + 1, deposited: r.deposited, interest: r.interest, balance: r.maturity });
    if (at === n) break;
  }
  return rows;
}

/** The user's own tax rate (basis points) on interest. A rough guide only. */
export function afterTax(interest: number, taxBps: number): { tax: number; net: number } {
  const tax = roundHalfUp(Math.max(0, interest) * clamp(taxBps, 0, 5000), 10000);
  return { tax, net: interest - tax };
}

/** Compound yearly return of a cumulative deposit, in percent; null when it cannot be worked out. */
export function yearlyReturnPercent(principal: number, maturity: number, months: number): number | null {
  if (principal <= 0 || months <= 0 || maturity <= 0) return null;
  return (Math.pow(maturity / principal, 12 / months) - 1) * 100;
}
