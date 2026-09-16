/**
 * UPI P2M MDR from 15 October 2026.
 * Source: Ministry of Finance / PIB PRID 2310586 (15 Sep 2026).
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
} as const;

export type UpiMdrCategory = "standard" | "essential" | "capital" | "p2p";

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

export function monthlyMdrEstimate(opts: {
  monthlyUpiPaise: number;
  valueShareAboveThreshold: number; // 0–1 of monthly value
  typicalLargeTicketPaise: number;
  category: UpiMdrCategory;
}): { txCount: number; mdrPaise: number; exempt: boolean } {
  const monthly = Math.max(0, Math.round(opts.monthlyUpiPaise));
  const share = Math.min(1, Math.max(0, opts.valueShareAboveThreshold));
  const ticket = Math.max(UPI_MDR.thresholdPaise + 1, Math.round(opts.typicalLargeTicketPaise) || 5000_00);
  const smallExempt = monthly > 0 && monthly <= UPI_MDR.smallMerchantMonthlyPaise && opts.category === "standard";
  if (opts.category === "p2p" || smallExempt || monthly === 0 || share === 0) {
    return { txCount: 0, mdrPaise: 0, exempt: smallExempt || opts.category === "p2p" };
  }
  const valueAbove = Math.round(monthly * share);
  const txCount = Math.max(0, Math.round(valueAbove / ticket));
  const perTx = mdrOnTransaction(ticket, opts.category, { smallMerchantExempt: false });
  return { txCount, mdrPaise: txCount * perTx, exempt: false };
}
