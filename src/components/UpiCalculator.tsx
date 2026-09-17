import { useMemo, useState } from "react";
import type { DocLang } from "../data/documentLang";
import { rupeesToPaise } from "../lib/gstMath";
import {
  formatInrPaise,
  gatewayFeePaise,
  gstOnMdr,
  mdrOnTransaction,
  monthlyMdrEstimate,
} from "../lib/upiMdr";

export function UpiCalculator({ lang = "en" }: { lang?: DocLang } = {}) {
  const [monthlySales, setMonthlySales] = useState("100000");
  const [avgTicketSize, setAvgTicketSize] = useState("500");
  const [cardPercentage, setCardPercentage] = useState("40");
  const [includeSoundbox, setIncludeSoundbox] = useState(false);
  const [gstRegistered, setGstRegistered] = useState(false);

  const calculations = useMemo(() => {
    const salesPaise = rupeesToPaise(monthlySales);
    const ticketPaise = rupeesToPaise(avgTicketSize);
    const cardPct = Math.min(100, Math.max(0, Number(cardPercentage) || 0));
    const cardSalesPaise = Math.round(salesPaise * (cardPct / 100));
    const upiSalesPaise = Math.max(0, salesPaise - cardSalesPaise);

    const monthlyPgFees = gatewayFeePaise(cardSalesPaise);

    const switched = monthlyMdrEstimate({
      monthlyUpiPaise: cardSalesPaise,
      typicalTicketPaise: ticketPaise,
      category: "standard",
    });
    const switchedCost = gstRegistered ? switched.mdrPaise : switched.mdrPaise + gstOnMdr(switched.mdrPaise);

    const existingUpi = monthlyMdrEstimate({
      monthlyUpiPaise: upiSalesPaise,
      typicalTicketPaise: ticketPaise,
      category: "standard",
    });

    const yearlySoundboxFees = includeSoundbox ? 150 * 12 * 100 : 0;
    const monthlySavings = Math.max(0, monthlyPgFees - switchedCost);
    const yearlySavings = monthlySavings * 12 + yearlySoundboxFees;

    return {
      cardSalesPaise,
      monthlyPgFees,
      switchedCost,
      existingUpiMdr: existingUpi.mdrPaise,
      perTxMdr: mdrOnTransaction(ticketPaise, "standard"),
      yearlySoundboxFees,
      yearlySavings,
      allUnderThreshold: switched.allUnderThreshold && existingUpi.allUnderThreshold,
    };
  }, [monthlySales, avgTicketSize, cardPercentage, includeSoundbox, gstRegistered]);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1fr] w-full min-w-0" lang={lang}>
      <div className="rounded-3xl border border-forest/10 bg-white p-5 sm:p-8 shadow-sm w-full min-w-0">
        <h3 className="text-xl font-black text-forest">Merchant savings calculator</h3>
        <p className="mt-1 text-xs text-forest/60">
          What you keep if that card/gateway mix moved to direct UPI after 15 Oct 2026 (0.4% MDR on P2M above ₹2,000).
        </p>
        <p className="mt-3 rounded-2xl bg-amber-50 px-3 py-2 text-[11px] leading-5 font-semibold text-amber-950">
          Need the fee on one bill? Use the{" "}
          <a className="underline font-black text-leaf" href="/upi-mdr-calculator/">UPI MDR calculator</a>.
        </p>

        <form className="mt-6 space-y-4" onSubmit={(e) => e.preventDefault()}>
          <div>
            <label htmlFor="upi-savings-sales" className="block text-xs font-bold text-forest mb-1">
              Total monthly sales (₹)
            </label>
            <input
              id="upi-savings-sales"
              name="monthly-sales"
              type="number"
              inputMode="decimal"
              min="0"
              autoComplete="off"
              value={monthlySales}
              onChange={(e) => setMonthlySales(e.target.value)}
              placeholder="100000"
              className="w-full rounded-2xl border border-forest/10 bg-cream/30 px-4 py-3 text-sm font-bold text-forest outline-none focus-visible:border-leaf focus-visible:ring-2 focus-visible:ring-leaf"
            />
            <div className="mt-1.5 flex gap-2">
              {["50000", "100000", "250000", "500000"].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setMonthlySales(preset)}
                  className="rounded-lg bg-mint/50 px-2 py-1 text-[10px] font-bold text-forest hover:bg-mint"
                >
                  ₹{(Number(preset) / 1000).toFixed(0)}k
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="upi-savings-ticket" className="block text-xs font-bold text-forest mb-1">
              Typical bill (₹)
            </label>
            <input
              id="upi-savings-ticket"
              name="avg-ticket"
              type="number"
              inputMode="decimal"
              min="0"
              autoComplete="off"
              value={avgTicketSize}
              onChange={(e) => setAvgTicketSize(e.target.value)}
              placeholder="500"
              className="w-full rounded-2xl border border-forest/10 bg-cream/30 px-4 py-3 text-sm font-bold text-forest outline-none focus-visible:border-leaf focus-visible:ring-2 focus-visible:ring-leaf"
            />
            <p className="mt-1 text-[11px] text-forest/55">
              Used for UPI MDR. Bills of ₹2,000 or less stay free. A ₹5,000 typical bill takes 0.4%.
            </p>
          </div>

          <div>
            <label htmlFor="upi-savings-card-pct" className="block text-xs font-bold text-forest mb-1">
              Share of sales on cards / gateways ({cardPercentage}%)
            </label>
            <input
              id="upi-savings-card-pct"
              name="card-percentage"
              type="range"
              min="0"
              max="100"
              step="5"
              value={cardPercentage}
              onChange={(e) => setCardPercentage(e.target.value)}
              className="w-full accent-leaf cursor-pointer"
            />
            <div className="flex justify-between text-[10px] font-bold text-forest/50 mt-1">
              <span>All UPI</span>
              <span>Half PG</span>
              <span>All PG</span>
            </div>
          </div>

          <label className="flex items-start gap-2 text-xs font-bold text-forest">
            <input
              type="checkbox"
              checked={gstRegistered}
              onChange={(e) => setGstRegistered(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[#15803d]"
            />
            GST-registered — recover GST on UPI MDR
          </label>
          <label className="flex items-start gap-2 text-xs font-bold text-forest">
            <input
              type="checkbox"
              checked={includeSoundbox}
              onChange={(e) => setIncludeSoundbox(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[#15803d]"
            />
            Add ₹150/month soundbox rental you would drop
          </label>
        </form>

        <div className="mt-6 rounded-2xl border border-leaf/10 bg-mint/20 p-4 text-xs text-forest/80">
          P2P stays free. P2M of ₹2,000 or less stays free. Small QR shops under ₹1 lakh/month stay free if tagged P2PM. Other P2M above ₹2,000 may take 0.4% MDR from 15 October 2026, capped at ₹300.
        </div>
      </div>

      <div className="rounded-3xl border border-forest/10 bg-forest p-6 sm:p-8 text-white flex flex-col justify-between shadow-xl" aria-live="polite">
        <div>
          <span className="inline-block rounded-full bg-mint px-3.5 py-1 text-[10px] font-black uppercase text-leaf">
            Yearly savings vs gateway
          </span>

          <h4 className="mt-4 text-xs uppercase tracking-widest text-white/60 font-bold">If that card mix moved to direct UPI</h4>
          <p className="mt-2 text-4xl sm:text-5xl font-black text-mint tracking-tight tabular-nums">
            {formatInrPaise(calculations.yearlySavings)}
          </p>
          <p className="mt-1 text-xs text-white/70">
            Gateway 2.36% minus UPI MDR on the same volume
            {calculations.allUnderThreshold ? " — typical bills are under ₹2,000, so UPI MDR is ₹0." : "."}
          </p>

          <div className="mt-8 space-y-4 border-t border-white/10 pt-6 text-xs tabular-nums">
            <div className="flex justify-between items-center gap-3">
              <span className="text-white/80">Card/PG volume</span>
              <strong>{formatInrPaise(calculations.cardSalesPaise)}/mo</strong>
            </div>
            <div className="flex justify-between items-center gap-3">
              <span className="text-white/80">Gateway MDR (2.36% with GST)</span>
              <strong className="text-red-300 font-bold">{formatInrPaise(calculations.monthlyPgFees)}/mo</strong>
            </div>
            <div className="flex justify-between items-center gap-3">
              <span className="text-white/80">
                UPI MDR if that volume moved
                {calculations.perTxMdr > 0 ? ` (${formatInrPaise(calculations.perTxMdr)} per typical bill)` : ""}
              </span>
              <strong className="text-mint font-bold">{formatInrPaise(calculations.switchedCost)}/mo</strong>
            </div>
            {calculations.existingUpiMdr > 0 && (
              <div className="flex justify-between items-center gap-3">
                <span className="text-white/80">UPI MDR already on your UPI mix</span>
                <strong>{formatInrPaise(calculations.existingUpiMdr)}/mo</strong>
              </div>
            )}
            {includeSoundbox && (
              <div className="flex justify-between items-center gap-3">
                <span className="text-white/80">Soundbox rental dropped</span>
                <strong className="text-mint">{formatInrPaise(calculations.yearlySoundboxFees)}/yr</strong>
              </div>
            )}
            <div className="flex justify-between items-center pt-3 border-t border-white/10 font-bold text-sm text-mint">
              <span>Still cheaper than a gateway</span>
              <span>{formatInrPaise(calculations.yearlySavings)}/yr</span>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-white/10 flex flex-col sm:flex-row gap-3">
          <a
            href="/"
            className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-mint px-6 py-3.5 text-xs font-black text-forest shadow-lg transition hover:bg-white text-center"
          >
            Create a free UPI QR poster
          </a>
          <a
            href="/upi-mdr-calculator/"
            className="w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-6 py-3.5 text-xs font-black text-white hover:bg-white/20 text-center transition"
          >
            Open MDR calculator
          </a>
        </div>
      </div>
    </div>
  );
}
