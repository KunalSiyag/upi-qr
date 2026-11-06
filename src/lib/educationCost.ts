// Education cost planner in integer minor units (paise, cents, pence). No imports, so `scripts/education-cost.test.mjs`
// runs it under Node. Every step uses exact BigInt fractions, so there is no floating-point drift and rounding is explicit.
//
// The model (state it on the page):
// - The cost of course year k (k = 0 is the first) is today's yearly cost × (1 + inflation)^(years until the course starts + k),
//   rounded half-up to the minor unit. Each year's cost falls due at the start of that course year.
// - Savings earn the expected return, compounded monthly at rate ÷ 12, both before the course and during it.
// - "Needed by the start" is what those yearly costs are worth on the day the course starts, discounting each at the same
//   monthly rate. It is rounded UP to the minor unit, so the plan never under-funds by a rounding step.
// - Savings already put aside grow for every month until the start. The monthly amount is paid at the end of each month and
//   is the smallest whole minor-unit amount that closes the rest of the gap, rounded UP.
// - Returns are not guaranteed. The page says so.

export const MAX_COST_MINOR = 10_000_000_000; // 10 crore rupees (or 100 million units of another currency)
export const MAX_RATE_BPS = 2500; // 25%
export const MAX_YEARS_UNTIL_START = 25;
export const MAX_COURSE_YEARS = 8;

export type CostInput = {
  annualCostToday: number; // minor units, tuition and living together
  yearsUntilStart: number; // 0 to 25
  courseYears: number; // 1 to 8
  inflationBps: number; // yearly rise in the cost, 800 = 8%
  returnBps: number; // expected yearly return on savings
  saved: number; // minor units already put aside
};

export type CostYear = { year: number; today: number; due: number };

export type CostPlan = {
  years: CostYear[];
  totalFuture: number; // the yearly costs added up, each as it falls due
  targetAtStart: number; // what they are worth on the day the course starts
  months: number; // months of saving before the course (12 × years until it starts)
  savedGrowsTo: number; // existing savings at the start, rounded half-up
  gap: number; // targetAtStart − savedGrowsTo, never below zero
  monthly: number | null; // to save each month; null when the course starts now (months = 0)
  lumpNow: number | null; // when the course starts now: what to put in today
  monthlyIfLater: number | null; // the monthly amount if you begin saving 12 months later
  totalSaved: number; // monthly × months
};

const L = 120000n;

function pow(base: bigint, exp: number): bigint {
  let out = 1n;
  for (let i = 0; i < exp; i++) out *= base;
  return out;
}
const ceilDiv = (n: bigint, d: bigint): bigint => (n <= 0n ? 0n : (n + d - 1n) / d);
const roundHalfUp = (n: bigint, d: bigint): bigint => (2n * n + d) / (2n * d);

export function planCost(input: CostInput): CostPlan {
  const A = BigInt(Math.max(0, Math.min(MAX_COST_MINOR, Math.trunc(input.annualCostToday))));
  const y = Math.max(0, Math.min(MAX_YEARS_UNTIL_START, Math.trunc(input.yearsUntilStart)));
  const n = Math.max(1, Math.min(MAX_COURSE_YEARS, Math.trunc(input.courseYears)));
  const g = BigInt(Math.max(0, Math.min(MAX_RATE_BPS, Math.trunc(input.inflationBps))));
  const r = BigInt(Math.max(0, Math.min(MAX_RATE_BPS, Math.trunc(input.returnBps))));
  const S = BigInt(Math.max(0, Math.min(MAX_COST_MINOR, Math.trunc(input.saved))));
  const months = 12 * y;

  const costs: bigint[] = [];
  for (let k = 0; k < n; k++) costs.push(roundHalfUp(A * pow(10000n + g, y + k), pow(10000n, y + k)));

  // T = Σ cost_k × (L / (L + r))^(12k), as the fraction TN / TD with TD = (L + r)^(12 (n − 1)).
  const TD = pow(L + r, 12 * (n - 1));
  let TN = 0n;
  for (let k = 0; k < n; k++) TN += costs[k] * pow(L, 12 * k) * pow(L + r, 12 * (n - 1 - k));

  // Existing savings at the start: S × ((L + r) / L)^months, as SN / SD.
  const SN = S * pow(L + r, months);
  const SD = pow(L, months);

  // gap = T − S_grown = (TN × SD − SN × TD) / (TD × SD)
  const gapN = TN * SD - SN * TD;
  const gapD = TD * SD;

  const monthlyFor = (m: number): bigint | null => {
    if (m <= 0) return null;
    if (gapN <= 0n) return 0n;
    // Annuity factor ((1 + i)^m − 1) / i with i = r / L; at r = 0 it is m.
    const FN = r === 0n ? BigInt(m) : (pow(L + r, m) - pow(L, m)) * L;
    const FD = r === 0n ? 1n : pow(L, m) * r;
    return ceilDiv(gapN * FD, gapD * FN);
  };

  const monthly = monthlyFor(months);
  const later = months - 12 >= 1 ? monthlyFor(months - 12) : null;
  const total = costs.reduce((a, c) => a + c, 0n);
  const target = ceilDiv(TN, TD);
  const gapUnits = ceilDiv(gapN, gapD);
  return {
    years: costs.map((c, k) => ({ year: k + 1, today: Number(A), due: Number(c) })),
    totalFuture: Number(total),
    targetAtStart: Number(target),
    months,
    savedGrowsTo: Number(roundHalfUp(SN, SD)),
    gap: Number(gapUnits),
    monthly: monthly === null ? null : Number(monthly),
    lumpNow: months === 0 ? Number(gapUnits) : null,
    monthlyIfLater: later === null || gapN <= 0n ? null : Number(later),
    totalSaved: monthly === null ? 0 : Number(monthly * BigInt(months)),
  };
}

export const CURRENCIES = [
  { code: "INR", symbol: "₹", locale: "en-IN" },
  { code: "USD", symbol: "$", locale: "en-US" },
  { code: "GBP", symbol: "£", locale: "en-GB" },
  { code: "EUR", symbol: "€", locale: "en-IE" },
  { code: "AUD", symbol: "A$", locale: "en-AU" },
  { code: "CAD", symbol: "C$", locale: "en-CA" },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]["code"];

/** Minor units → "₹1,23,456" (whole units, grouping of that currency's usual locale). */
export function formatMinor(minor: number, code: CurrencyCode): string {
  const c = CURRENCIES.find((x) => x.code === code) ?? CURRENCIES[0];
  return `${c.symbol}${new Intl.NumberFormat(c.locale, { maximumFractionDigits: 0 }).format(Math.round(minor / 100))}`;
}
