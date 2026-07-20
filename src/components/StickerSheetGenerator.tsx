import { useState, useMemo, useRef, useEffect } from "react";
import QRCode from "qrcode";
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";

const presetLogos = {
  phonepe: `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="24" fill="#5f259f" /><path d="M50 18 C32.3 18 18 32.3 18 50 C18 67.7 32.3 82 50 82 C67.7 82 82 67.7 82 50 C82 32.3 67.7 18 50 18 Z" fill="#ffffff" opacity="0.1" /><path d="M36 32 C36 30 38 28 40 28 H56 C64.8 28 72 35.2 72 44 C72 52.8 64.8 60 56 60 H48 V72 C48 74.2 46.2 76 44 76 H40 C38 76 36 74 36 72 V32 Z M48 40 V48 H56 C58.2 48 60 46.2 60 44 C60 41.8 58.2 40 56 40 H48 Z" fill="#ffffff" /></svg>`)}`,
  paytm: `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="30" fill="#ffffff" stroke="#00baf2" stroke-width="4" /><text x="50%" y="54%" font-family="sans-serif" font-weight="900" font-size="40" fill="#002e6e" text-anchor="middle">pay</text><text x="50%" y="84%" font-family="sans-serif" font-weight="900" font-size="36" fill="#00baf2" text-anchor="middle">tm</text></svg>`)}`,
  gpay: `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="24" fill="#ffffff" stroke="#f3f4f6" stroke-width="4" /><path d="M50 45 V55 H68 C67 61 62 67 50 67 C39 67 31 59 31 49 C31 39 39 31 50 31 C56 31 60 33 63 36 L70 29 C65 24 58 21 50 21 C33 21 20 34 20 50 C20 66 33 79 50 79 C67 79 79 67 79 50 C79 48 78 46 78 45 H50 Z" fill="#4285f4" /><path d="M31 49 C31 44 32 40 35 36 L27 30 C22 36 20 42 20 50 C20 58 22 64 27 70 L35 64 C32 60 31 56 31 49 Z" fill="#fbcb05" /><path d="M50 21 C58 21 65 24 70 29 L77 22 C69 15 60 11 50 11 C38 11 28 17 22 26 L30 32 C34 26 41 21 50 21 Z" fill="#ea4335" /><path d="M50 79 C41 79 34 74 30 68 L22 74 C28 83 38 89 50 89 C60 89 69 85 75 78 L68 72 C64 76 58 79 50 79 Z" fill="#34a853" /></svg>`)}`,
  bhim: `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="30" fill="#ffffff" stroke="#e5e7eb" stroke-width="2" /><path d="M25 25 L60 85 L25 85 Z" fill="#f05a28" /><path d="M95 95 L60 35 L95 35 Z" fill="#00a651" /><text x="60" y="112" font-family="sans-serif" font-weight="900" font-size="22" fill="#002e6e" text-anchor="middle">BHIM</text></svg>`)}`
};

export type LayoutGrid = "6-grid" | "4-grid" | "12-grid";

export function StickerSheetGenerator() {
  const [payee, setPayee] = useState("Kirana Merchant Store");
  const [upiId, setUpiId] = useState("merchant@oksbi");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [logo, setLogo] = useState<"phonepe" | "gpay" | "paytm" | "bhim" | "none">("phonepe");
  const [layout, setLayout] = useState<LayoutGrid>("6-grid");
  const [accentColor, setAccentColor] = useState("#113b2c");
  
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  const rawUpiLink = useMemo(() => {
    const params = new URLSearchParams({ pa: upiId.trim(), pn: payee.trim() });
    if (amount.trim()) params.set("am", amount.trim());
    if (note.trim()) params.set("tn", note.trim());
    params.set("cu", "INR");
    return `upi://pay?${params.toString()}`;
  }, [payee, upiId, amount, note]);

  // Generate QR Code Data URL
  useEffect(() => {
    async function buildQr() {
      if (!upiId.includes("@") || !payee.trim()) return;
      try {
        const url = await QRCode.toDataURL(rawUpiLink, {
          width: 320,
          margin: 1,
          errorCorrectionLevel: "H",
          color: { dark: "#113b2c", light: "#ffffff" }
        });
        setQrDataUrl(url);
      } catch (e) {
        console.error(e);
      }
    }
    void buildQr();
  }, [rawUpiLink, payee, upiId]);

  const countMap = {
    "4-grid": 4,
    "6-grid": 6,
    "12-grid": 12,
  };

  const gridClassMap = {
    "4-grid": "grid-cols-2 grid-rows-2 gap-4",
    "6-grid": "grid-cols-2 grid-rows-3 gap-3",
    "12-grid": "grid-cols-3 grid-rows-4 gap-2",
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    if (!sheetRef.current) return;
    setIsGenerating(true);
    try {
      const el = sheetRef.current;
      const dataUrl = await toPng(el, { pixelRatio: 2.5, cacheBust: true });
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      pdf.addImage(dataUrl, "PNG", 0, 0, pdfWidth, pdfHeight);
      pdf.save(`upi-qr-stickers-${layout}.pdf`);
    } catch (e) {
      console.error("PDF generation failed:", e);
      alert("Failed to create PDF. You can use the Print button to Save as PDF instead.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] w-full min-w-0">
      {/* Form Controls */}
      <div className="rounded-3xl border border-forest/10 bg-white p-4 sm:p-6 md:p-8 shadow-sm w-full min-w-0">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-black text-forest">A4 Sticker Sheet Configurator</h3>
            <p className="mt-1 text-xs text-forest/60">Generate 4, 6, or 12 printable QR stickers on a single A4 page.</p>
          </div>
          <span className="rounded-full bg-mint px-3 py-1 text-[10px] font-black uppercase text-leaf">
            Print-Ready PDF
          </span>
        </div>

        <form className="mt-6 grid gap-4 sm:grid-cols-2 w-full min-w-0" onSubmit={(e) => e.preventDefault()}>
          <label className="grid gap-1 min-w-0">
            <span className="text-xs font-bold text-forest">Payee / Merchant Name *</span>
            <input
              type="text"
              value={payee}
              onChange={(e) => setPayee(e.target.value)}
              placeholder="e.g. Ganesh Retail Store"
              className="w-full min-w-0 rounded-xl border border-forest/10 bg-cream/30 px-3.5 py-2.5 text-xs outline-none focus:border-leaf"
              required
            />
          </label>

          <label className="grid gap-1 min-w-0">
            <span className="text-xs font-bold text-forest">UPI ID (VPA) *</span>
            <input
              type="text"
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
              placeholder="e.g. shop@oksbi"
              className="w-full min-w-0 rounded-xl border border-forest/10 bg-cream/30 px-3.5 py-2.5 text-xs outline-none focus:border-leaf"
              required
            />
          </label>

          <label className="grid gap-1 min-w-0">
            <span className="text-xs font-bold text-forest">Fixed Amount (₹) <span className="text-forest/40">(Optional)</span></span>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 150"
              className="w-full min-w-0 rounded-xl border border-forest/10 bg-cream/30 px-3.5 py-2.5 text-xs outline-none focus:border-leaf"
            />
          </label>

          <label className="grid gap-1 min-w-0">
            <span className="text-xs font-bold text-forest">Note / Reference <span className="text-forest/40">(Optional)</span></span>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Bill #104"
              className="w-full min-w-0 rounded-xl border border-forest/10 bg-cream/30 px-3.5 py-2.5 text-xs outline-none focus:border-leaf"
            />
          </label>

          <div className="grid gap-1 min-w-0">
            <span className="text-xs font-bold text-forest">Sticker Layout Grid</span>
            <select
              value={layout}
              onChange={(e) => setLayout(e.target.value as LayoutGrid)}
              className="w-full min-w-0 rounded-xl border border-forest/10 bg-cream/30 px-3.5 py-2.5 text-xs outline-none focus:border-leaf"
            >
              <option value="6-grid">6 Stickers per A4 (Standard Counter Size)</option>
              <option value="4-grid">4 Stickers per A4 (Large Desk Standees)</option>
              <option value="12-grid">12 Stickers per A4 (Compact Product Labels)</option>
            </select>
          </div>

          <div className="grid gap-1 min-w-0">
            <span className="text-xs font-bold text-forest">Brand Header Badge</span>
            <select
              value={logo}
              onChange={(e) => setLogo(e.target.value as any)}
              className="w-full min-w-0 rounded-xl border border-forest/10 bg-cream/30 px-3.5 py-2.5 text-xs outline-none focus:border-leaf"
            >
              <option value="phonepe">PhonePe Theme</option>
              <option value="gpay">Google Pay Theme</option>
              <option value="paytm">Paytm Theme</option>
              <option value="bhim">BHIM UPI Theme</option>
              <option value="none">Neutral Clean</option>
            </select>
          </div>
        </form>

        {/* Action Buttons */}
        <div className="mt-8 flex flex-col sm:flex-row items-center gap-3 pt-6 border-t border-forest/10">
          <button
            type="button"
            onClick={handlePrint}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl bg-forest px-6 py-3.5 text-xs font-black text-white shadow-lg transition hover:bg-leaf active:scale-95"
          >
            🖨️ Print A4 Sheet
          </button>
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={isGenerating}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl border border-forest/15 bg-mint/50 px-6 py-3.5 text-xs font-black text-forest transition hover:bg-mint active:scale-95 disabled:opacity-50"
          >
            {isGenerating ? "Generating PDF..." : "📥 Download A4 PDF"}
          </button>
        </div>
      </div>

      {/* Live A4 Preview Container */}
      <div className="flex flex-col items-center justify-center rounded-3xl border border-forest/10 bg-cream/20 p-4 sm:p-6 shadow-sm w-full min-w-0">
        <h4 className="mb-3 text-xs font-black uppercase tracking-widest text-forest/50">A4 Printable Page Preview</h4>
        
        {/* Scaled A4 Sheet Container */}
        <div className="w-full max-w-[420px] aspect-[1/1.414] bg-white border border-black/10 shadow-2xl rounded-xl p-4 overflow-hidden relative">
          <div
            ref={sheetRef}
            className={`w-full h-full bg-white grid ${gridClassMap[layout]} p-1 print:p-0`}
          >
            {Array.from({ length: countMap[layout] }).map((_, idx) => (
              <div
                key={idx}
                className="border-2 border-dashed border-neutral-300 rounded-xl p-2.5 flex flex-col items-center justify-between text-center bg-cream/10 relative overflow-hidden"
              >
                {/* Header Logo */}
                {logo !== "none" && presetLogos[logo] && (
                  <img
                    src={presetLogos[logo]}
                    alt={logo}
                    className="h-5 w-auto object-contain mb-1"
                  />
                )}
                
                {/* QR Code image */}
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="UPI QR Code"
                    className="w-full max-w-[110px] aspect-square object-contain mx-auto"
                  />
                ) : (
                  <div className="w-20 h-20 bg-neutral-100 rounded-lg flex items-center justify-center text-[10px] text-neutral-400">
                    Loading QR...
                  </div>
                )}

                {/* Merchant Text */}
                <div className="mt-1 w-full">
                  <p className="font-black text-forest text-[11px] truncate leading-tight">
                    {payee || "Merchant Name"}
                  </p>
                  <p className="text-[9px] font-mono font-semibold text-neutral-500 truncate">
                    {upiId || "payee@upi"}
                  </p>
                  {amount && (
                    <span className="mt-1 inline-block rounded bg-mint px-1.5 py-0.5 text-[9px] font-black text-leaf">
                      Pay ₹{amount}
                    </span>
                  )}
                </div>

                {/* Scan & Pay footer */}
                <div className="mt-1 w-full border-t border-dashed border-neutral-200 pt-1 flex items-center justify-between text-[8px] font-bold text-neutral-400 uppercase tracking-wider">
                  <span>ACCEPTED HERE</span>
                  <span>UPI</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-3 text-[10px] text-center text-forest/50 max-w-xs">
          Each sticker is separated by dashed cut-lines. Print on standard A4 sticker paper or photo gloss paper.
        </p>
      </div>
    </div>
  );
}
