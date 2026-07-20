import { useState, useMemo } from "react";

function money(amount: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount || 0);
}

export function UpiCalculator() {
  const [monthlySales, setMonthlySales] = useState("100000"); // 1 Lakh
  const [avgTicketSize, setAvgTicketSize] = useState("500");
  const [cardPercentage, setCardPercentage] = useState("40"); // 40% Card/PG vs 60% UPI

  const calculations = useMemo(() => {
    const sales = Math.max(0, Number(monthlySales) || 0);
    const cardPct = Math.min(100, Math.max(0, Number(cardPercentage) || 0));
    
    // Traditional Payment Gateway / POS Card MDR = 2.0% + 18% GST = 2.36%
    const pgMdrRate = 0.0236; 
    
    // Monthly PG Fees
    const cardSalesMonthly = sales * (cardPct / 100);
    const monthlyPgFees = cardSalesMonthly * pgMdrRate;
    const yearlyPgFees = monthlyPgFees * 12;

    // Paytm / PhonePe Soundbox Rental (~₹150/mo)
    const yearlySoundboxFees = 150 * 12; // ₹1,800/yr

    // Total Potential Annual Savings with Free Direct UPI QR
    const totalYearlySavings = yearlyPgFees + yearlySoundboxFees;

    return {
      sales,
      cardSalesMonthly,
      monthlyPgFees,
      yearlyPgFees,
      yearlySoundboxFees,
      totalYearlySavings,
    };
  }, [monthlySales, cardPercentage]);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1fr] w-full min-w-0">
      {/* Calculator Inputs */}
      <div className="rounded-3xl border border-forest/10 bg-white p-5 sm:p-8 shadow-sm w-full min-w-0">
        <h3 className="text-xl font-black text-forest">Merchant Savings Calculator</h3>
        <p className="mt-1 text-xs text-forest/60">Calculate how much money your business saves annually by switching from 2% Payment Gateways to Free UPI QR.</p>

        <form className="mt-6 space-y-4" onSubmit={(e) => e.preventDefault()}>
          <div>
            <label className="block text-xs font-bold text-forest mb-1">
              Total Monthly Sales (₹)
            </label>
            <input
              type="number"
              value={monthlySales}
              onChange={(e) => setMonthlySales(e.target.value)}
              placeholder="e.g. 100000"
              className="w-full rounded-2xl border border-forest/10 bg-cream/30 px-4 py-3 text-sm font-bold text-forest outline-none focus:border-leaf"
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
            <label className="block text-xs font-bold text-forest mb-1">
              Average Bill Amount per Customer (₹)
            </label>
            <input
              type="number"
              value={avgTicketSize}
              onChange={(e) => setAvgTicketSize(e.target.value)}
              placeholder="e.g. 500"
              className="w-full rounded-2xl border border-forest/10 bg-cream/30 px-4 py-3 text-sm font-bold text-forest outline-none focus:border-leaf"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-forest mb-1">
              Est. % of Sales on Cards / Payment Gateways ({cardPercentage}%)
            </label>
            <input
              type="range"
              min="10"
              max="100"
              step="5"
              value={cardPercentage}
              onChange={(e) => setCardPercentage(e.target.value)}
              className="w-full accent-leaf cursor-pointer"
            />
            <div className="flex justify-between text-[10px] font-bold text-forest/50 mt-1">
              <span>10% PG</span>
              <span>50% PG</span>
              <span>100% PG</span>
            </div>
          </div>
        </form>

        <div className="mt-6 rounded-2xl border border-leaf/10 bg-mint/20 p-4 text-xs text-forest/80">
          💡 <strong>Did you know?</strong> Direct UPI payments have <strong>0% MDR</strong> charges for standard consumer-to-merchant (P2M) transactions under RBI guidelines.
        </div>
      </div>

      {/* Calculator Results Breakdown */}
      <div className="rounded-3xl border border-forest/10 bg-forest p-6 sm:p-8 text-white flex flex-col justify-between shadow-xl">
        <div>
          <span className="inline-block rounded-full bg-mint px-3.5 py-1 text-[10px] font-black uppercase text-leaf">
            Annual Cost Savings
          </span>
          
          <h4 className="mt-4 text-xs uppercase tracking-widest text-white/60 font-bold">Estimated Yearly Savings with Pro UPI QR</h4>
          <p className="mt-2 text-4xl sm:text-5xl font-black text-mint tracking-tight">
            {money(calculations.totalYearlySavings)}
          </p>
          <p className="mt-1 text-xs text-white/70">
            Total money kept in your business account every year instead of paying bank MDR fees.
          </p>

          {/* Breakdown List */}
          <div className="mt-8 space-y-4 border-t border-white/10 pt-6 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-white/80">Monthly Gateway / Card MDR (2.36% with GST)</span>
              <strong className="text-red-300 font-bold">{money(calculations.monthlyPgFees)}/mo</strong>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-white/80">Yearly Gateway MDR Fees Wasted</span>
              <strong className="text-red-300 font-bold">{money(calculations.yearlyPgFees)}/yr</strong>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-white/80">Yearly Soundbox Hardware Rentals (₹150/mo)</span>
              <strong className="text-red-300 font-bold">{money(calculations.yearlySoundboxFees)}/yr</strong>
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-white/10 font-bold text-sm text-mint">
              <span>Net Pro UPI QR Fee</span>
              <span>₹0 (100% FREE)</span>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-white/10 flex flex-col sm:flex-row gap-3">
          <a
            href="/"
            className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-mint px-6 py-3.5 text-xs font-black text-forest shadow-lg transition hover:bg-white text-center"
          >
            🚀 Create Free UPI QR Poster
          </a>
          <a
            href="/qr-sticker-generator/"
            className="w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-6 py-3.5 text-xs font-black text-white hover:bg-white/20 text-center transition"
          >
            🖨️ Print A4 Sticker Sheet
          </a>
        </div>
      </div>
    </div>
  );
}
