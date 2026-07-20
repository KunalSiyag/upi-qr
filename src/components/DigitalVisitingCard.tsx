import React, { useState, useEffect, useRef, useId } from "react";
import QRCode from "qrcode";

export function DigitalVisitingCard() {
  const [name, setName] = useState("Vikram Sharma");
  const [title, setTitle] = useState("Founder & Lead Designer");
  const [company, setCompany] = useState("Sharma Designs Studio");
  const [tagline, setTagline] = useState("Digital & Brand Agency");
  const [phone, setPhone] = useState("+91 9876543210");
  const [email, setEmail] = useState("vikram@sharmadesigns.in");
  const [vpa, setVpa] = useState("vikram@upi");
  const [theme, setTheme] = useState<"forest" | "gold" | "navy" | "crimson" | "minimal">("forest");

  const [vcardQrUrl, setVcardQrUrl] = useState("");
  const [upiQrUrl, setUpiQrUrl] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const nameId = useId();
  const titleId = useId();
  const companyId = useId();
  const taglineId = useId();
  const phoneId = useId();
  const emailId = useId();
  const vpaId = useId();

  // Generate vCard string & QR code
  const vcardText = `BEGIN:VCARD
VERSION:3.0
FN:${name}
TITLE:${title}
ORG:${company}
TEL;TYPE=CELL:${phone}
EMAIL:${email}
END:VCARD`;

  useEffect(() => {
    QRCode.toDataURL(vcardText, { width: 300, margin: 1 }).then(setVcardQrUrl).catch(console.error);
    if (vpa.trim()) {
      const upiUri = `upi://pay?pa=${encodeURIComponent(vpa.trim())}&pn=${encodeURIComponent(name)}&cu=INR`;
      QRCode.toDataURL(upiUri, { width: 300, margin: 1, color: { dark: "#113b2c", light: "#ffffff" } }).then(setUpiQrUrl).catch(console.error);
    }
  }, [name, title, company, phone, email, vpa]);

  const downloadVcf = () => {
    const blob = new Blob([vcardText], { type: "text/vcard;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.toLowerCase().replace(/\s+/g, "-")}.vcf`;
    a.click();
  };

  const createClonedCardForExport = async () => {
    if (!cardRef.current) return null;
    const { toPng } = await import("html-to-image");

    const clone = cardRef.current.cloneNode(true) as HTMLDivElement;
    clone.style.position = "fixed";
    clone.style.left = "0";
    clone.style.top = "0";
    clone.style.zIndex = "-9999";
    clone.style.opacity = "0";
    clone.style.pointerEvents = "none";
    clone.style.width = "700px";
    clone.style.height = "400px";
    clone.style.maxWidth = "700px";
    clone.style.maxHeight = "400px";
    clone.style.borderRadius = "0";
    clone.style.boxShadow = "none";
    clone.style.margin = "0";

    document.body.appendChild(clone);
    await new Promise((res) => setTimeout(res, 200));

    const dataUrl = await toPng(clone, {
      pixelRatio: 3,
      cacheBust: true,
      width: 700,
      height: 400
    });

    document.body.removeChild(clone);
    return dataUrl;
  };

  const downloadCardPng = async () => {
    setIsExporting(true);
    try {
      const dataUrl = await createClonedCardForExport();
      if (!dataUrl) return;
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${name.toLowerCase().replace(/\s+/g, "-")}-business-card.png`;
      a.click();
    } catch (e) {
      console.error("Card PNG export error:", e);
    } finally {
      setIsExporting(false);
    }
  };

  const downloadCardPdf = async () => {
    setIsExporting(true);
    try {
      const dataUrl = await createClonedCardForExport();
      if (!dataUrl) return;
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ orientation: "l", unit: "mm", format: [89, 51] });
      pdf.addImage(dataUrl, "PNG", 0, 0, 89, 51);
      pdf.save(`${name.toLowerCase().replace(/\s+/g, "-")}-business-card.pdf`);
    } catch (e) {
      console.error("Card PDF export error:", e);
    } finally {
      setIsExporting(false);
    }
  };

  const themeStyles = {
    forest: "bg-forest text-mint border-leaf/30",
    gold: "bg-gradient-to-br from-amber-950 via-neutral-900 to-amber-900 text-amber-100 border-amber-500/30",
    navy: "bg-slate-950 text-sky-100 border-sky-500/30",
    crimson: "bg-rose-950 text-rose-100 border-rose-500/30",
    minimal: "bg-white text-slate-900 border-slate-300"
  };

  return (
    <div className="grid gap-8 lg:grid-cols-12">
      {/* Input & Customizer Form */}
      <div className="lg:col-span-6 space-y-6">
        <div className="rounded-3xl border border-forest/10 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-xl font-black text-forest">Customize Business Card</h2>

          {/* Theme Selector */}
          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-forest/75">Select Card Theme</label>
            <div className="grid grid-cols-5 gap-2">
              {[
                { id: "forest", label: "Forest" },
                { id: "gold", label: "Gold" },
                { id: "navy", label: "Navy" },
                { id: "crimson", label: "Crimson" },
                { id: "minimal", label: "Minimal" }
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={nameId} className="block text-xs font-bold text-forest/75 mb-1">Full Name</label>
              <input
                id={nameId}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-forest/15 p-2.5 text-xs font-bold text-forest outline-none focus:border-leaf"
              />
            </div>
            <div>
              <label htmlFor={titleId} className="block text-xs font-bold text-forest/75 mb-1">Job Title</label>
              <input
                id={titleId}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-xl border border-forest/15 p-2.5 text-xs font-semibold text-forest outline-none focus:border-leaf"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={companyId} className="block text-xs font-bold text-forest/75 mb-1">Company / Studio</label>
              <input
                id={companyId}
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="w-full rounded-xl border border-forest/15 p-2.5 text-xs font-semibold text-forest outline-none focus:border-leaf"
              />
            </div>
            <div>
              <label htmlFor={taglineId} className="block text-xs font-bold text-forest/75 mb-1">Tagline</label>
              <input
                id={taglineId}
                type="text"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                className="w-full rounded-xl border border-forest/15 p-2.5 text-xs font-semibold text-forest outline-none focus:border-leaf"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor={phoneId} className="block text-xs font-bold text-forest/75 mb-1">Phone</label>
              <input
                id={phoneId}
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-xl border border-forest/15 p-2.5 text-xs font-semibold text-forest outline-none focus:border-leaf"
              />
            </div>
            <div>
              <label htmlFor={emailId} className="block text-xs font-bold text-forest/75 mb-1">Email</label>
              <input
                id={emailId}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-forest/15 p-2.5 text-xs font-semibold text-forest outline-none focus:border-leaf"
              />
            </div>
            <div>
              <label htmlFor={vpaId} className="block text-xs font-bold text-forest/75 mb-1">UPI VPA</label>
              <input
                id={vpaId}
                type="text"
                value={vpa}
                onChange={(e) => setVpa(e.target.value)}
                className="w-full rounded-xl border border-forest/15 p-2.5 text-xs font-semibold text-forest outline-none focus:border-leaf"
              />
            </div>
          </div>

          {/* Action Export Triggers */}
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              onClick={downloadCardPng}
              disabled={isExporting}
              className="flex-1 rounded-xl bg-forest py-3 text-xs font-bold text-white hover:bg-forest/90 transition-all shadow-md disabled:opacity-50"
            >
              🖼️ Download Card PNG
            </button>
            <button
              type="button"
              onClick={downloadCardPdf}
              disabled={isExporting}
              className="flex-1 rounded-xl bg-mint border border-leaf/20 py-3 text-xs font-bold text-forest hover:bg-mint/80 transition-colors disabled:opacity-50"
            >
              📄 Download Card PDF
            </button>
            <button
              type="button"
              onClick={downloadVcf}
              className="rounded-xl border border-forest/20 bg-cream py-3 px-4 text-xs font-bold text-forest hover:bg-white transition-colors"
            >
              📇 Export .VCF
            </button>
          </div>
        </div>
      </div>

      {/* Card Live Preview */}
      <div className="lg:col-span-6">
        <div className="rounded-3xl border border-forest/10 bg-white p-6 shadow-lg space-y-4">
          <div className="text-xs font-bold uppercase tracking-wider text-forest/75 text-center">Standard 3.5" x 2" Live Preview</div>

          <div
            ref={cardRef}
            className={`mx-auto w-full max-w-md aspect-[1.75/1] rounded-3xl p-6 flex flex-col justify-between shadow-2xl border ${themeStyles[theme]} transition-all relative overflow-hidden`}
          >
            {/* Header Content */}
            <div className="flex justify-between items-start gap-4">
              <div className="space-y-1 min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-widest opacity-60 block truncate">{company}</span>
                <h3 className="text-xl font-black tracking-tight truncate">{name}</h3>
                <p className="text-xs font-medium opacity-80 truncate">{title}</p>
                <p className="text-[10px] opacity-60 truncate">{tagline}</p>
              </div>

              {/* vCard Save QR */}
              {vcardQrUrl && (
                <div className="bg-white p-1.5 rounded-xl shadow-md shrink-0 text-center">
                  <img src={vcardQrUrl} alt="Save Contact QR" className="w-16 h-16 object-contain" />
                  <span className="text-[8px] font-black text-slate-800 uppercase block tracking-tighter mt-0.5">Save Contact</span>
                </div>
              )}
            </div>

            {/* Footer Contact + UPI Pay QR */}
            <div className="flex justify-between items-end border-t border-current/15 pt-3 gap-4">
              <div className="space-y-0.5 text-xs font-medium opacity-90 truncate">
                <p className="truncate">📞 {phone}</p>
                <p className="truncate">✉️ {email}</p>
                <p className="truncate font-mono text-[10px]">💳 {vpa}</p>
              </div>

              {/* UPI Pay QR */}
              {upiQrUrl && (
                <div className="bg-white p-1.5 rounded-xl shadow-md shrink-0 text-center">
                  <img src={upiQrUrl} alt="UPI Pay QR" className="w-14 h-14 object-contain" />
                  <span className="text-[8px] font-black text-forest uppercase block tracking-tighter mt-0.5">Scan to Pay</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
