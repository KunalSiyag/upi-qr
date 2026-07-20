import React, { useState, useEffect, useRef, useId } from "react";
import QRCode from "qrcode";

export function OfferPosterGenerator() {
  const [theme, setTheme] = useState<"festive" | "clearance" | "cashback" | "minimal">("festive");
  const [shopName, setShopName] = useState("SHARMA GENERAL STORE");
  const [tagline, setTagline] = useState("Festival Mega Sale - Scan & Pay");
  const [offerHeadline, setOfferHeadline] = useState("FLAT 20% OFF");
  const [offerSubtext, setOfferSubtext] = useState("On all items above ₹500");
  const [vpa, setVpa] = useState("sharmastore@upi");
  const [payeeName, setPayeeName] = useState("Sharma General Store");

  const [qrUrl, setQrUrl] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const posterRef = useRef<HTMLDivElement>(null);

  const shopNameId = useId();
  const taglineId = useId();
  const offerHeadlineId = useId();
  const offerSubtextId = useId();
  const vpaId = useId();
  const payeeNameId = useId();

  // Generate QR Code data URL when VPA or payee changes
  useEffect(() => {
    if (!vpa.trim()) return;
    const uri = `upi://pay?pa=${encodeURIComponent(vpa.trim())}&pn=${encodeURIComponent(payeeName.trim() || shopName)}&cu=INR`;
    QRCode.toDataURL(uri, {
      width: 400,
      margin: 1,
      color: { dark: "#113b2c", light: "#ffffff" }
    }).then(setQrUrl).catch(console.error);
  }, [vpa, payeeName, shopName]);

  const downloadPosterPng = async () => {
    if (!posterRef.current) return;
    setIsExporting(true);
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(posterRef.current, { pixelRatio: 3, cacheBust: true });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${shopName.toLowerCase().replace(/\s+/g, "-")}-offer-poster.png`;
      a.click();
    } catch (e) {
      console.error("Poster PNG export error:", e);
    } finally {
      setIsExporting(false);
    }
  };

  const downloadPosterPdf = async () => {
    if (!posterRef.current) return;
    setIsExporting(true);
    try {
      const { toPng } = await import("html-to-image");
      const { jsPDF } = await import("jspdf");
      const dataUrl = await toPng(posterRef.current, { pixelRatio: 3, cacheBust: true });
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      pdf.addImage(dataUrl, "PNG", 0, 0, pdfWidth, pdfHeight);
      pdf.save(`${shopName.toLowerCase().replace(/\s+/g, "-")}-offer-poster.pdf`);
    } catch (e) {
      console.error("Poster PDF export error:", e);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="grid gap-8 lg:grid-cols-12">
      {/* Input Panel */}
      <div className="lg:col-span-6 space-y-6">
        <div className="rounded-3xl border border-forest/10 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-xl font-black text-forest">Poster Customizer</h2>

          {/* Theme Selector */}
          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-forest/75">Select Banner Theme</label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { id: "festive", label: "Festive Gold" },
                { id: "clearance", label: "Clearance Red" },
                { id: "cashback", label: "Cashback Green" },
                { id: "minimal", label: "Minimal Dark" }
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTheme(t.id as any)}
                  className={`py-2 rounded-xl text-xs font-bold transition-all border ${
                    theme === t.id ? "bg-forest text-white border-forest" : "bg-mint/40 text-forest border-forest/10"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label htmlFor={shopNameId} className="block text-xs font-bold text-forest/75 mb-1">Shop / Business Name</label>
              <input
                id={shopNameId}
                type="text"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                className="w-full rounded-xl border border-forest/15 p-2.5 text-xs font-semibold text-forest outline-none focus:border-leaf"
              />
            </div>

            <div>
              <label htmlFor={taglineId} className="block text-xs font-bold text-forest/75 mb-1">Promo Tagline</label>
              <input
                id={taglineId}
                type="text"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                className="w-full rounded-xl border border-forest/15 p-2.5 text-xs font-semibold text-forest outline-none focus:border-leaf"
              />
            </div>

            <div>
              <label htmlFor={offerHeadlineId} className="block text-xs font-bold text-forest/75 mb-1">Offer Headline (Big Banner Text)</label>
              <input
                id={offerHeadlineId}
                type="text"
                value={offerHeadline}
                onChange={(e) => setOfferHeadline(e.target.value)}
                className="w-full rounded-xl border border-forest/15 p-2.5 text-xs font-bold text-forest outline-none focus:border-leaf"
              />
            </div>

            <div>
              <label htmlFor={offerSubtextId} className="block text-xs font-bold text-forest/75 mb-1">Offer Terms / Subtext</label>
              <input
                id={offerSubtextId}
                type="text"
                value={offerSubtext}
                onChange={(e) => setOfferSubtext(e.target.value)}
                className="w-full rounded-xl border border-forest/15 p-2.5 text-xs font-semibold text-forest outline-none focus:border-leaf"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-forest/10">
              <div>
                <label htmlFor={vpaId} className="block text-xs font-bold text-forest/75 mb-1">UPI ID (VPA)</label>
                <input
                  id={vpaId}
                  type="text"
                  value={vpa}
                  onChange={(e) => setVpa(e.target.value)}
                  className="w-full rounded-xl border border-forest/15 p-2.5 text-xs font-semibold text-forest outline-none focus:border-leaf"
                />
              </div>
              <div>
                <label htmlFor={payeeNameId} className="block text-xs font-bold text-forest/75 mb-1">Payee Name</label>
                <input
                  id={payeeNameId}
                  type="text"
                  value={payeeName}
                  onChange={(e) => setPayeeName(e.target.value)}
                  className="w-full rounded-xl border border-forest/15 p-2.5 text-xs font-semibold text-forest outline-none focus:border-leaf"
                />
              </div>
            </div>
          </div>

          {/* Action Buttons: PNG & PDF Exports ONLY */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={downloadPosterPng}
              disabled={isExporting}
              className="flex-1 rounded-xl bg-forest py-3 text-xs font-bold text-white hover:bg-forest/90 transition-all shadow-md disabled:opacity-50"
            >
              🖼️ Download Poster PNG
            </button>
            <button
              type="button"
              onClick={downloadPosterPdf}
              disabled={isExporting}
              className="flex-1 rounded-xl bg-mint border border-leaf/20 py-3 text-xs font-bold text-forest hover:bg-mint/80 transition-colors disabled:opacity-50"
            >
              📄 Download Poster PDF
            </button>
          </div>
        </div>
      </div>

      {/* Live Preview Canvas */}
      <div className="lg:col-span-6">
        <div className="rounded-3xl border border-forest/10 bg-white p-6 shadow-lg space-y-4">
          <div className="text-xs font-bold uppercase tracking-wider text-forest/75 text-center">Live Printable A4 Banner Preview</div>
          
          <div
            ref={posterRef}
            className={`mx-auto max-w-sm rounded-3xl border-4 p-6 text-center space-y-5 shadow-2xl transition-all ${
              theme === "festive" ? "border-amber-700 bg-amber-50" :
              theme === "clearance" ? "border-red-700 bg-red-50" :
              theme === "cashback" ? "border-emerald-700 bg-emerald-50" : "border-slate-800 bg-white"
            }`}
          >
            <div>
              <h3 className="text-xl font-black tracking-tight text-forest uppercase">{shopName}</h3>
              <p className="text-xs font-semibold text-forest/70 mt-0.5">{tagline}</p>
            </div>

            <div className={`rounded-2xl p-4 text-white font-black shadow-lg ${
              theme === "festive" ? "bg-amber-700" :
              theme === "clearance" ? "bg-red-700" :
              theme === "cashback" ? "bg-emerald-700" : "bg-slate-900"
            }`}>
              <div className="text-2xl tracking-tight uppercase">{offerHeadline}</div>
            </div>

            <p className="text-xs font-bold text-forest/80">{offerSubtext}</p>

            {qrUrl && (
              <div className="mx-auto w-40 h-40 p-2 rounded-2xl bg-white border border-forest/15 shadow-md flex items-center justify-center">
                <img src={qrUrl} alt="Offer QR Code" className="w-full h-full object-contain" />
              </div>
            )}

            <div>
              <div className="text-xs font-black text-forest uppercase">Scan to Pay via UPI</div>
              <div className="text-[10px] text-forest/60 mt-0.5 font-mono">{vpa}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
