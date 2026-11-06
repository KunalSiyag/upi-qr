// Freelance rate maths in integer minor units (paise, cents, pence). No imports, so `scripts/freelance-rate.test.mjs` runs
// it under Node. Exact BigInt arithmetic, and every rate is rounded UP to the minor unit so a quote is never short.
//
// The model (state it on the page):
// - You want `takeHome` a year to spend, and you also fund `ownCosts` yourself (health cover, pension, anything personal),
//   both after tax. That is the amount you need after tax.
// - Profit before tax = that amount ÷ (1 − tax rate). Business costs are added on top of profit, then a safety margin.
//   Revenue needed = (profit + business costs) × (1 + margin).
// - Working days = (52 − weeks of holiday) × days a week − public holidays − sick days. Billable hours = working days ×
//   hours a day × the share of that time you can bill. Billable days = working days × that share.
// - Hourly rate = revenue ÷ billable hours. Day rate = revenue ÷ billable days. Monthly = revenue ÷ 12.
// Every input is yours: tax, billable share and margin are assumptions, not forecasts.

export const MAX_MINOR = 100_000_000_000; // 1,000 crore rupees, or 1 billion units of another currency
export const MAX_TAX_BPS = 6000; // 60%
export const MAX_MARGIN_BPS = 10000; // 100%

export type RateInput = {
  takeHome: number; // minor units a year, after tax
  ownCosts: number; // minor units a year you fund yourself, after tax
  businessCosts: number; // minor units a year, before tax
  taxBps: number; // tax on profit, 2000 = 20%
  marginBps: number; // safety margin on top, 1000 = 10%
  daysPerWeek: number; // 1 to 7
  vacationWeeks: number; // 0 to 30
  holidays: number; // public holidays that fall on working days, 0 to 60
  sickDays: number; // 0 to 60
  hoursTenths: number; // hours a day × 10, so 8 hours is 80
  billableBps: number; // share of working time you can bill, 6500 = 65%
};

export type RateResult = {
  workingDays: number;
  billableHours100: number; // hundredths of an hour
  billableDays100: number; // hundredths of a day
  afterTaxNeed: number; // takeHome + ownCosts
  profit: number; // before tax
  taxAmount: number;
  businessCosts: number;
  margin: number;
  revenue: number;
  hourly: number;
  day: number;
  monthly: number;
};

const big = (n: number) => BigInt(Math.trunc(n));
const ceilDiv = (n: bigint, d: bigint): bigint => (n <= 0n ? 0n : (n + d - 1n) / d);
const roundHalfUp = (n: bigint, d: bigint): bigint => (2n * n + d) / (2n * d);

export function workingDaysFor(i: Pick<RateInput, "daysPerWeek" | "vacationWeeks" | "holidays" | "sickDays">): number {
  return (52 - Math.trunc(i.vacationWeeks)) * Math.trunc(i.daysPerWeek) - Math.trunc(i.holidays) - Math.trunc(i.sickDays);
}

/** The rate you need, or null when the inputs leave no working days or a 100% tax rate. */
export function rateFor(input: RateInput): RateResult | null {
  const taxBps = Math.trunc(input.taxBps);
  const billableBps = Math.trunc(input.billableBps);
  const hoursTenths = Math.trunc(input.hoursTenths);
  const D = workingDaysFor(input);
  if (D < 1 || taxBps < 0 || taxBps >= 10000 || billableBps < 1 || hoursTenths < 1) return null;

  const need = big(input.takeHome) + big(input.ownCosts);
  const profit = ceilDiv(need * 10000n, 10000n - big(taxBps));
  const before = profit + big(input.businessCosts);
  const revenue = ceilDiv(before * (10000n + big(input.marginBps)), 10000n);
  const days = big(D);
  const hourly = ceilDiv(revenue * 10n * 10000n, days * big(hoursTenths) * big(billableBps));
  const day = ceilDiv(revenue * 10000n, days * big(billableBps));
  return {
    workingDays: D,
    billableHours100: Number(roundHalfUp(days * big(hoursTenths) * big(billableBps) * 100n, 10n * 10000n)),
    billableDays100: Number(roundHalfUp(days * big(billableBps) * 100n, 10000n)),
    afterTaxNeed: Number(need),
    profit: Number(profit),
    taxAmount: Number(profit - need),
    businessCosts: Number(big(input.businessCosts)),
    margin: Number(revenue - before),
    revenue: Number(revenue),
    hourly: Number(hourly),
    day: Number(day),
    monthly: Number(ceilDiv(revenue, 12n)),
  };
}

/** The hourly rate you would need at a different billable share (basis points), everything else unchanged. */
export function hourlyAtBillable(input: RateInput, billableBps: number): number | null {
  const r = rateFor({ ...input, billableBps });
  return r === null ? null : r.hourly;
}

/** "7.5" → 750 basis points; null when malformed (up to 2 decimals) or outside [minBps, maxBps]. */
export function parsePercentBps(text: string, minBps: number, maxBps: number): number | null {
  const clean = text.trim();
  if (!/^\d{1,3}(\.\d{0,2})?$/.test(clean)) return null;
  const [whole, frac = ""] = clean.split(".");
  const bps = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  return bps >= minBps && bps <= maxBps ? bps : null;
}

/** "7.5" → 75 (tenths of an hour); null unless it is 0.1 to 16 hours with at most one decimal. */
export function parseHoursTenths(text: string): number | null {
  const clean = text.trim();
  if (!/^\d{1,2}(\.\d)?$/.test(clean)) return null;
  const [whole, frac = "0"] = clean.split(".");
  const tenths = Number(whole) * 10 + Number(frac);
  return tenths >= 1 && tenths <= 160 ? tenths : null;
}
