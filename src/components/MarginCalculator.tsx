import React, { useState, useId } from "react";
import QRCode from "qrcode";
import type { DocLang } from "../data/documentLang";
import { useToolLang } from "../lib/useToolLang";
import { rupeesToPaise } from "../lib/gstMath";
import { formatInrPaise, mdrOnTransaction } from "../lib/upiMdr";

export function MarginCalculator({ lang = "en" }: { lang?: DocLang } = {}) {
  const { tr, money } = useToolLang(lang);
  const [costPrice, setCostPrice] = useState<string>("500");
  const [sellingPrice, setSellingPrice] = useState<string>("750");
  const [gstRate, setGstRate] = useState<number>(18);
  const [upiPaid, setUpiPaid] = useState(true);
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
  const mdrPaise = upiPaid ? mdrOnTransaction(rupeesToPaise(sell), "standard") : 0;
  const mdrRupees = mdrPaise / 100;
  const netProfit = grossProfit - gstAmount - mdrRupees;

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
          <h2 className="text-xl font-black text-forest">{tr("Pricing Inputs")}</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={costId} className="block text-xs font-bold text-forest/75 mb-1">{tr("Cost Price (CP) ₹")}</label>
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
              <label htmlFor={sellId} className="block text-xs font-bold text-forest/75 mb-1">{tr("Selling Price (SP) ₹")}</label>
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
            <label className="block text-xs font-bold text-forest/75 mb-1">{tr("GST Tax Slab (%)")}</label>
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

          <label className="flex items-start gap-2 text-xs font-bold text-forest">
            <input
              type="checkbox"
              checked={upiPaid}
              onChange={(e) => setUpiPaid(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[#15803d]"
            />
            <span>
              Selling price is paid by UPI
              <span className="mt-1 block font-semibold text-forest/55">
                Bills of ₹2,000 or less stay ₹0 MDR. Above that, 0.4% comes out of your margin — not the customer’s bill.
              </span>
            </span>
          </label>

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
              <span className="font-mono font-bold text-leaf">{money(grossProfit, 2)}</span>
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
              <span className="font-mono font-bold text-amber-700">{money(gstAmount, 2)}</span>
            </div>
            {upiPaid && (
              <div className="flex justify-between text-sm">
                <span className="text-forest/70 font-semibold">UPI MDR (you pay)</span>
                <span className="font-mono font-bold text-amber-700">{formatInrPaise(mdrPaise)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm border-t border-forest/10 pt-2">
              <span className="font-black text-forest">{upiPaid ? "Net profit after GST + UPI MDR" : "Net Profit (Post-GST)"}</span>
              <span className="font-mono font-black text-leaf">{money(netProfit, 2)}</span>
            </div>
            {upiPaid && mdrPaise > 0 && (
              <p className="text-[11px] leading-5 text-forest/55">
                Do not add {formatInrPaise(mdrPaise)} as a UPI surcharge on the bill.{" "}
                <a href="/upi-mdr-calculator/" className="font-bold text-leaf underline">MDR calculator</a>
              </p>
            )}
          </div>

          {qrDataUrl && (
            <div className="border-t border-forest/10 pt-4 text-center space-y-2">
              <div className="text-xs font-bold uppercase text-forest">Scan to Pay {money(sell, 2)}</div>
              <img src={qrDataUrl} alt="Selling price QR" className="mx-auto w-36 h-36 border border-forest/15 p-2 bg-white rounded-xl" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
