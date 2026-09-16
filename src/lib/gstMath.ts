/** GST arithmetic in integer paise. Rate is stored in basis points (18% = 1800). */

export function rupeesToPaise(value: string | number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100);
}

export function paiseToRupees(paise: number): number {
  return paise / 100;
}

export function ratePercentToBps(percent: number): number {
  if (!Number.isFinite(percent) || percent < 0) return 0;
  return Math.round(percent * 100);
}

export function gstExclusive(basePaise: number, rateBps: number): { gstPaise: number; totalPaise: number } {
  const base = Math.max(0, Math.round(basePaise));
  const bps = Math.max(0, Math.round(rateBps));
  const gstPaise = Math.round((base * bps) / 10000);
  return { gstPaise, totalPaise: base + gstPaise };
}

export function gstInclusive(totalPaise: number, rateBps: number): { basePaise: number; gstPaise: number } {
  const total = Math.max(0, Math.round(totalPaise));
  const bps = Math.max(0, Math.round(rateBps));
  if (bps === 0) return { basePaise: total, gstPaise: 0 };
  const basePaise = Math.round((total * 10000) / (10000 + bps));
  return { basePaise, gstPaise: total - basePaise };
}

export function splitCgstSgst(gstPaise: number): { cgstPaise: number; sgstPaise: number } {
  const gst = Math.max(0, Math.round(gstPaise));
  const cgstPaise = Math.floor(gst / 2);
  return { cgstPaise, sgstPaise: gst - cgstPaise };
}

export type GstSupply = "intra" | "inter";

export function gstLine(
  amountPaise: number,
  rateBps: number,
  mode: "exclusive" | "inclusive",
  supply: GstSupply
) {
  const { basePaise, gstPaise, totalPaise } =
    mode === "exclusive"
      ? (() => {
          const r = gstExclusive(amountPaise, rateBps);
          return { basePaise: Math.max(0, Math.round(amountPaise)), gstPaise: r.gstPaise, totalPaise: r.totalPaise };
        })()
      : (() => {
          const r = gstInclusive(amountPaise, rateBps);
          return { basePaise: r.basePaise, gstPaise: r.gstPaise, totalPaise: Math.max(0, Math.round(amountPaise)) };
        })();

  if (supply === "inter") {
    return { basePaise, gstPaise, totalPaise, cgstPaise: 0, sgstPaise: 0, igstPaise: gstPaise };
  }
  const { cgstPaise, sgstPaise } = splitCgstSgst(gstPaise);
  return { basePaise, gstPaise, totalPaise, cgstPaise, sgstPaise, igstPaise: 0 };
}
