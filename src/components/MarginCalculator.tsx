import React, { useState, useId } from "react";
import QRCode from "qrcode";

export function MarginCalculator() {
  const [costPrice, setCostPrice] = useState<string>("500");
  const [sellingPrice, setSellingPrice] = useState<string>("750");
  const [gstRate, setGstRate] = useState<number>(18);
  const [vpa, setVpa] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");

  const costId = useId();
  const sellId = useId();
  const vpaId = useId();

  const cost = parseFloat(costPrice) || 0;
  const sell = parseFloat(sellingPrice) || 0;

  const grossProfit = sell - cost;
  const marginPercent = sell > 0 ? (grossProfit / sell) * 100 : 0;
  const markupPercent = cost > 0 ? (grossProfit / cost) * 100 : 0;
  const gstAmount = (sell * gstRate) / (100 + gstRate);
  const netProfit = grossProfit - gstAmount;

  const generateQr = async () => {
    if (!vpa.trim() || sell <= 0) return;
    const uri = `upi://pay?pa=${encodeURIComponent(vpa.trim())}&am=${sell.toFixed(2)}&cu=INR`;
    try {
      const url = await QRCode.toDataURL(uri, {
        width: 360,
        margin: 2,
        color: { dark: "#113b2c", light: "#ffffff" }
      });
      setQrDataUrl(url);
    } catch (e) {
      console.error("QR Error", e);
    }
  };

  return (
    <div className="grid gap-8 lg:grid-cols-12">
      {/* Input Panel */}
      <div className="lg:col-span-7 space-y-6">
        <div className="rounded-3xl border border-forest/10 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-xl font-black text-forest">Pricing Inputs</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={costId} className="block text-xs font-bold text-forest/75 mb-1">Cost Price (CP) ₹</label>
              <input
                id={costId}
                type="number"
                min="0"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                className="w-full rounded-xl border border-forest/15 p-3 text-sm font-bold text-forest outline-none focus:border-leaf"
              />
            </div>
            <div>
              <label htmlFor={sellId} className="block text-xs font-bold text-forest/75 mb-1">Selling Price (SP) ₹</label>
              <input
                id={sellId}
                type="number"
                min="0"
                value={sellingPrice}
                onChange={(e) => setSellingPrice(e.target.value)}
                className="w-full rounded-xl border border-forest/15 p-3 text-sm font-bold text-forest outline-none focus:border-leaf"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-forest/75 mb-1">GST Tax Slab (%)</label>
            <div className="grid grid-cols-5 gap-2">
              {[0, 5, 12, 18, 28].map((rate) => (
                <button
                  key={rate}
                  type="button"
                  onClick={() => setGstRate(rate)}
                  className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                    gstRate === rate ? "bg-leaf text-white border-leaf" : "bg-mint/40 text-forest border-forest/10"
                  }`}
                >
                  {rate}%
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-forest/10 pt-4 space-y-3">
            <label htmlFor={vpaId} className="block text-xs font-bold text-forest/75">Generate Selling Price Payment QR</label>
            <div className="flex gap-2">
              <input
                id={vpaId}
                type="text"
                placeholder="Enter UPI ID (e.g. shop@upi)"
                value={vpa}
                onChange={(e) => setVpa(e.target.value)}
                className="flex-1 rounded-xl border border-forest/15 p-2.5 text-xs font-semibold text-forest outline-none"
              />
              <button
                type="button"
                onClick={generateQr}
                className="rounded-xl bg-forest px-4 py-2.5 text-xs font-bold text-mint hover:bg-forest/90 transition-colors"
              >
                Create QR
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Output Panel */}
      <div className="lg:col-span-5 space-y-6">
        <div className="rounded-3xl border border-forest/10 bg-white p-6 shadow-lg space-y-4">
          <h3 className="text-lg font-black text-forest border-b border-forest/10 pb-3">Profit & Margin Analysis</h3>

          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-forest/70 font-semibold">Gross Profit</span>
              <span className="font-mono font-bold text-leaf">₹{grossProfit.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-forest/70 font-semibold">Profit Margin</span>
              <span className="font-mono font-bold text-forest">{marginPercent.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-forest/70 font-semibold">Markup</span>
              <span className="font-mono font-bold text-forest">{markupPercent.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-forest/70 font-semibold">GST Liability</span>
              <span className="font-mono font-bold text-amber-700">₹{gstAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm border-t border-forest/10 pt-2">
              <span className="font-black text-forest">Net Profit (Post-GST)</span>
              <span className="font-mono font-black text-leaf">₹{netProfit.toFixed(2)}</span>
            </div>
          </div>

          {qrDataUrl && (
            <div className="border-t border-forest/10 pt-4 text-center space-y-2">
              <div className="text-xs font-bold uppercase text-forest">Scan to Pay ₹{sell.toFixed(2)}</div>
              <img src={qrDataUrl} alt="Selling price QR" className="mx-auto w-36 h-36 border border-forest/15 p-2 bg-white rounded-xl" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
