import React, { useState, useId } from "react";
import QRCode from "qrcode";

export function GstCalculator() {
  const [calculationType, setCalculationType] = useState<"exclusive" | "inclusive">("exclusive");
  const [amount, setAmount] = useState<string>("1000");
  const [gstRate, setGstRate] = useState<number>(18);
  const [customRate, setCustomRate] = useState<string>("");

  // QR preset state
  const [vpa, setVpa] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [copied, setCopied] = useState<boolean>(false);

  const amountId = useId();
  const customRateId = useId();
  const vpaId = useId();
  const nameId = useId();

  const activeRate = gstRate === -1 ? (parseFloat(customRate) || 0) : gstRate;
  const numAmount = parseFloat(amount) || 0;

  let baseAmount = 0;
  let gstAmount = 0;
  let totalAmount = 0;

  if (calculationType === "exclusive") {
    // Add GST to price
    baseAmount = numAmount;
    gstAmount = (numAmount * activeRate) / 100;
    totalAmount = numAmount + gstAmount;
  } else {
    // Remove GST from price
    totalAmount = numAmount;
    baseAmount = numAmount / (1 + activeRate / 100);
    gstAmount = totalAmount - baseAmount;
  }

  const cgst = gstAmount / 2;
  const sgst = gstAmount / 2;

  // Generate UPI QR Code for final total
  const generateQr = async () => {
    if (!vpa.trim()) return;
    const cleanVpa = vpa.trim();
    const cleanName = name.trim() || "Merchant";
    const upiUri = `upi://pay?pa=${encodeURIComponent(cleanVpa)}&pn=${encodeURIComponent(cleanName)}&am=${totalAmount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(`GST Invoice Payment (${activeRate}%)`)}`;
    
    try {
      const url = await QRCode.toDataURL(upiUri, {
        width: 360,
        margin: 2,
        color: { dark: "#113b2c", light: "#ffffff" }
      });
      setQrDataUrl(url);
    } catch (e) {
      console.error("Failed to generate QR code", e);
    }
  };

  const copyBreakdown = () => {
    const text = `GST Invoice Calculation Breakdown:
Calculation: ${calculationType === "exclusive" ? "Add GST (Exclusive)" : "Remove GST (Inclusive)"}
Tax Slab: ${activeRate}%
Base Amount: ₹${baseAmount.toFixed(2)}
CGST ( ${(activeRate / 2).toFixed(1)}% ): ₹${cgst.toFixed(2)}
SGST ( ${(activeRate / 2).toFixed(1)}% ): ₹${sgst.toFixed(2)}
Total GST: ₹${gstAmount.toFixed(2)}
Total Amount Payable: ₹${totalAmount.toFixed(2)}

Generated via Pro UPI QR (https://www.proupiqr.in/gst-calculator/)`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="grid gap-8 lg:grid-cols-12">
      {/* Left Input Panel */}
      <div className="lg:col-span-7 space-y-6">
        <div className="rounded-3xl border border-forest/10 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black text-forest">1. GST Calculation Mode</h2>
          
          {/* Toggle Type */}
          <div className="mt-4 grid grid-cols-2 gap-3 p-1.5 rounded-2xl bg-mint/50">
            <button
              type="button"
              onClick={() => setCalculationType("exclusive")}
              className={`py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                calculationType === "exclusive"
                  ? "bg-forest text-white shadow-md"
                  : "text-forest/70 hover:text-forest"
              }`}
            >
              Add GST (Price + Tax)
            </button>
            <button
              type="button"
              onClick={() => setCalculationType("inclusive")}
              className={`py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                calculationType === "inclusive"
                  ? "bg-forest text-white shadow-md"
                  : "text-forest/70 hover:text-forest"
              }`}
            >
              Remove GST (Inclusive Tax)
            </button>
          </div>

          {/* Amount Input */}
          <div className="mt-5 space-y-2">
            <label htmlFor={amountId} className="block text-xs font-bold uppercase tracking-wider text-forest/75">
              {calculationType === "exclusive" ? "Net Amount (₹)" : "Total Amount Inclusive of GST (₹)"}
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-forest/40">₹</span>
              <input
                id={amountId}
                type="number"
                min="0"
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="1000"
                className="w-full rounded-2xl border border-forest/15 bg-white py-3.5 pl-9 pr-4 font-mono text-lg font-bold text-forest shadow-inner outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/20"
              />
            </div>
          </div>

          {/* GST Slabs */}
          <div className="mt-6 space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-forest/75">
              Select GST Rate (%)
            </label>
            <div className="grid grid-cols-5 gap-2">
              {[5, 12, 18, 28].map((rate) => (
                <button
                  key={rate}
                  type="button"
                  onClick={() => setGstRate(rate)}
                  className={`py-2.5 rounded-xl font-bold text-sm transition-all border ${
                    gstRate === rate
                      ? "bg-leaf text-white border-leaf shadow-sm"
                      : "bg-cream/40 border-forest/10 text-forest hover:bg-mint"
                  }`}
                >
                  {rate}%
                </button>
              ))}
              <button
                type="button"
                onClick={() => setGstRate(-1)}
                className={`py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all border ${
                  gstRate === -1
                    ? "bg-leaf text-white border-leaf shadow-sm"
                    : "bg-cream/40 border-forest/10 text-forest hover:bg-mint"
                }`}
              >
                Custom
              </button>
            </div>

            {gstRate === -1 && (
              <div className="mt-3">
                <input
                  id={customRateId}
                  type="number"
                  placeholder="Enter custom GST % (e.g. 3)"
                  value={customRate}
                  onChange={(e) => setCustomRate(e.target.value)}
                  className="w-full rounded-xl border border-forest/15 p-3 text-sm font-semibold text-forest outline-none focus:border-leaf"
                />
              </div>
            )}
          </div>
        </div>

        {/* Generate Payment QR Box */}
        <div className="rounded-3xl border border-leaf/20 bg-mint/30 p-6 space-y-4">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-leaf text-white text-xs font-bold">2</span>
            <h3 className="text-base font-black text-forest">Generate Instant UPI QR for calculated total</h3>
          </div>
          <p className="text-xs text-forest/70 leading-relaxed">
            Generate a custom QR code pre-loaded with ₹{totalAmount.toFixed(2)} so your customer can scan and pay post-tax total instantly.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={vpaId} className="block text-[11px] font-bold text-forest/75 mb-1">Your UPI ID (VPA)</label>
              <input
                id={vpaId}
                type="text"
                placeholder="shop@upi"
                value={vpa}
                onChange={(e) => setVpa(e.target.value)}
                className="w-full rounded-xl border border-forest/15 bg-white p-2.5 text-xs font-semibold text-forest outline-none focus:border-leaf"
              />
            </div>
            <div>
              <label htmlFor={nameId} className="block text-[11px] font-bold text-forest/75 mb-1">Payee / Merchant Name</label>
              <input
                id={nameId}
                type="text"
                placeholder="Store Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-forest/15 bg-white p-2.5 text-xs font-semibold text-forest outline-none focus:border-leaf"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={generateQr}
            className="w-full rounded-xl bg-forest py-3 text-xs font-bold uppercase tracking-wider text-mint hover:bg-forest/90 transition-all shadow-md"
          >
            Create Payment QR Code
          </button>
        </div>
      </div>

      {/* Right Output Panel */}
      <div className="lg:col-span-5 space-y-6">
        <div className="rounded-3xl border border-forest/10 bg-white p-6 shadow-lg space-y-6">
          <div className="flex items-center justify-between border-b border-forest/10 pb-4">
            <h3 className="text-lg font-black text-forest">GST Tax Breakdown</h3>
            <span className="rounded-full bg-mint px-3 py-1 text-xs font-bold text-leaf">{activeRate}% GST</span>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-forest/70 font-semibold">Net / Base Amount</span>
              <span className="font-mono font-bold text-forest">₹{baseAmount.toFixed(2)}</span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-forest/70 font-semibold">CGST ({(activeRate / 2).toFixed(1)}%)</span>
              <span className="font-mono font-bold text-leaf">+ ₹{cgst.toFixed(2)}</span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-forest/70 font-semibold">SGST ({(activeRate / 2).toFixed(1)}%)</span>
              <span className="font-mono font-bold text-leaf">+ ₹{sgst.toFixed(2)}</span>
            </div>

            <div className="flex items-center justify-between text-sm border-t border-forest/10 pt-3">
              <span className="text-forest/80 font-bold">Total GST Amount</span>
              <span className="font-mono font-bold text-leaf">₹{gstAmount.toFixed(2)}</span>
            </div>

            <div className="rounded-2xl bg-forest p-4 text-mint flex items-center justify-between shadow-md">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest opacity-80">Total Amount Payable</div>
                <div className="text-2xl font-black font-mono">₹{totalAmount.toFixed(2)}</div>
              </div>
              <button
                type="button"
                onClick={copyBreakdown}
                className="rounded-xl bg-mint/20 px-3 py-2 text-xs font-bold text-mint hover:bg-mint/30 transition-colors"
              >
                {copied ? "Copied!" : "Copy Receipt"}
              </button>
            </div>
          </div>

          {/* QR Display if generated */}
          {qrDataUrl && (
            <div className="border-t border-forest/10 pt-6 text-center space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-forest/75">Post-Tax Payment QR</div>
              <div className="mx-auto w-48 h-48 p-2 rounded-2xl bg-white border border-forest/15 shadow-md flex items-center justify-center">
                <img src={qrDataUrl} alt="Post-tax UPI Payment QR Code" className="w-full h-full object-contain" />
              </div>
              <div className="text-[11px] font-semibold text-forest/70">Scan with GPay, PhonePe, Paytm or BHIM</div>
              <a
                href={qrDataUrl}
                download={`gst-payment-qr-${totalAmount.toFixed(0)}.png`}
                className="inline-block rounded-xl bg-leaf px-4 py-2 text-xs font-bold text-white hover:bg-leaf/90 transition-colors"
              >
                Download QR Code Image
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
