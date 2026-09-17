/**
 * UPI P2M MDR from 15 October 2026.
 * Source: Ministry of Finance / PIB PRID 2310586 (15 Sep 2026); NPCI FAQ.
 * MDR is not a tax. 18% GST may apply on the MDR itself.
 */

export const UPI_MDR = {
  effectiveOn: "2026-10-15",
  thresholdPaise: 2000_00,
  standardRateBps: 40, // 0.4%
  capPaise: 300_00,
  capFromPaise: 75000_00, // 0.4% of ₹75,000 = ₹300
  essentialFlatPaise: 5_00,
  capitalRateBps: 2, // 0.02%
  smallMerchantMonthlyPaise: 1_00_000_00,
  gstOnMdrBps: 1800,
  gatewayRateBps: 236, // 2% + 18% GST = 2.36%
} as const;

export type UpiMdrCategory = "standard" | "essential" | "capital" | "p2p";

export function formatInrPaise(paise: number, fractionDigits = 2): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format((Number.isFinite(paise) ? paise : 0) / 100);
}

export function mdrOnTransaction(
  amountPaise: number,
  category: UpiMdrCategory,
  opts: { smallMerchantExempt?: boolean } = {}
): number {
  const amount = Math.max(0, Math.round(amountPaise));
  if (amount <= 0) return 0;
  if (category === "p2p") return 0;
  if (opts.smallMerchantExempt) return 0;
  if (amount <= UPI_MDR.thresholdPaise) return 0;
  if (category === "essential") return UPI_MDR.essentialFlatPaise;
  const bps = category === "capital" ? UPI_MDR.capitalRateBps : UPI_MDR.standardRateBps;
  return Math.min(Math.round((amount * bps) / 10000), UPI_MDR.capPaise);
}

export function gstOnMdr(mdrPaise: number): number {
  return Math.round((Math.max(0, Math.round(mdrPaise)) * UPI_MDR.gstOnMdrBps) / 10000);
}

export function gatewayFeePaise(amountPaise: number): number {
  return Math.round((Math.max(0, Math.round(amountPaise)) * UPI_MDR.gatewayRateBps) / 10000);
}

export function merchantNetPaise(
  amountPaise: number,
  mdrPaise: number,
  opts: { gstRegistered?: boolean } = {}
): { gstPaise: number; deductedPaise: number; netPaise: number } {
  const gstPaise = gstOnMdr(mdrPaise);
  const deductedPaise = opts.gstRegistered ? mdrPaise : mdrPaise + gstPaise;
  return {
    gstPaise,
    deductedPaise,
    netPaise: Math.max(0, Math.round(amountPaise) - deductedPaise),
  };
}

function ratePercentLabel(bps: number): string {
  const pct = bps / 100;
  const digits = Number.isInteger(pct * 10) && !Number.isInteger(pct) ? 1 : 2;
  return `${pct.toFixed(digits)}%`;
}

export function mdrFormula(
  amountPaise: number,
  category: UpiMdrCategory,
  mdrPaise: number
): string {
  if (mdrPaise <= 0) return "";
  if (category === "essential") {
    return `Flat ${formatInrPaise(UPI_MDR.essentialFlatPaise)} on bills above ₹2,000`;
  }
  const bps = category === "capital" ? UPI_MDR.capitalRateBps : UPI_MDR.standardRateBps;
  const uncapped = Math.round((Math.max(0, amountPaise) * bps) / 10000);
  const base = `${formatInrPaise(amountPaise)} × ${ratePercentLabel(bps)} = ${formatInrPaise(uncapped)}`;
  if (uncapped > UPI_MDR.capPaise) {
    return `${base}, capped at ${formatInrPaise(UPI_MDR.capPaise)}`;
  }
  return base;
}

export function monthlyMdrEstimate(opts: {
  monthlyUpiPaise: number;
  typicalTicketPaise: number;
  category: UpiMdrCategory;
  smallMerchantExempt?: boolean;
}): {
  txCount: number;
  chargedTxCount: number;
  mdrPaise: number;
  exempt: boolean;
  allUnderThreshold: boolean;
} {
  const monthly = Math.max(0, Math.round(opts.monthlyUpiPaise));
  const ticket = Math.max(0, Math.round(opts.typicalTicketPaise));
  const zero = {
    txCount: 0,
    chargedTxCount: 0,
    mdrPaise: 0,
    exempt: false,
    allUnderThreshold: false,
  };

  if (opts.category === "p2p" || opts.smallMerchantExempt) {
    return { ...zero, exempt: true };
  }
  if (monthly === 0 || ticket === 0) return zero;

  const n = Math.floor(monthly / ticket);
  const rem = monthly - n * ticket;
  const perTx = mdrOnTransaction(ticket, opts.category);
  const remMdr = rem > 0 ? mdrOnTransaction(rem, opts.category) : 0;

  return {
    txCount: n + (rem > 0 ? 1 : 0),
    chargedTxCount: (perTx > 0 ? n : 0) + (remMdr > 0 ? 1 : 0),
    mdrPaise: n * perTx + remMdr,
    exempt: false,
    allUnderThreshold: ticket <= UPI_MDR.thresholdPaise && rem <= UPI_MDR.thresholdPaise,
  };
}
