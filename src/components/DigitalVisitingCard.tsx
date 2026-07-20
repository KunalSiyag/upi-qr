import React, { useState, useEffect, useRef, useId } from "react";
import QRCode from "qrcode";
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";

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

  const downloadCardPng = async () => {
    if (!cardRef.current) return;
    setIsExporting(true);
    try {
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 3, cacheBust: true });
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
    if (!cardRef.current) return;
    setIsExporting(true);
    try {
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 3, cacheBust: true });
      const pdf = new jsPDF("l", "mm", [89, 51]); // Standard 3.5" x 2" business card dimensions
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

          {/* Theme Picker */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-forest/75">Select Card Theme</label>
            <div className="grid grid-cols-5 gap-2">
              {[
                { id: "forest", label: "Forest" },
                { id: "gold", label: "Gold" },
                { id: "navy", label: "Navy" },
                { id: "crimson", label: "Crimson" },
                { id: "minimal", label: "Light" }
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

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={nameId} className="block text-xs font-bold text-forest/75 mb-1">Full Name</label>
              <input id={nameId} type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-xl border border-forest/15 p-2 text-xs font-bold text-forest outline-none" />
            </div>
            <div>
              <label htmlFor={titleId} className="block text-xs font-bold text-forest/75 mb-1">Job Title / Designation</label>
              <input id={titleId} type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-xl border border-forest/15 p-2 text-xs font-semibold text-forest outline-none" />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={companyId} className="block text-xs font-bold text-forest/75 mb-1">Company / Business Name</label>
              <input id={companyId} type="text" value={company} onChange={(e) => setCompany(e.target.value)} className="w-full rounded-xl border border-forest/15 p-2 text-xs font-semibold text-forest outline-none" />
            </div>
            <div>
              <label htmlFor={taglineId} className="block text-xs font-bold text-forest/75 mb-1">Business Tagline / Subtitle</label>
              <input id={taglineId} type="text" value={tagline} onChange={(e) => setTagline(e.target.value)} className="w-full rounded-xl border border-forest/15 p-2 text-xs font-semibold text-forest outline-none" />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={phoneId} className="block text-xs font-bold text-forest/75 mb-1">Phone Number</label>
              <input id={phoneId} type="text" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-xl border border-forest/15 p-2 text-xs font-semibold text-forest outline-none" />
            </div>
            <div>
              <label htmlFor={emailId} className="block text-xs font-bold text-forest/75 mb-1">Email Address</label>
              <input id={emailId} type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-forest/15 p-2 text-xs font-semibold text-forest outline-none" />
            </div>
          </div>

          <div>
            <label htmlFor={vpaId} className="block text-xs font-bold text-forest/75 mb-1">UPI ID (VPA) for Direct Payments</label>
            <input id={vpaId} type="text" value={vpa} onChange={(e) => setVpa(e.target.value)} className="w-full rounded-xl border border-forest/15 p-2 text-xs font-bold text-forest outline-none" />
          </div>

          {/* Action Buttons: PNG, PDF & VCF Downloads */}
          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-forest/10">
            <button type="button" onClick={downloadCardPng} disabled={isExporting} className="rounded-xl bg-forest py-2.5 text-xs font-bold text-white hover:bg-forest/90 transition-all shadow-sm">
              🖼️ Card PNG
            </button>
            <button type="button" onClick={downloadCardPdf} disabled={isExporting} className="rounded-xl bg-mint border border-leaf/20 py-2.5 text-xs font-bold text-forest hover:bg-mint/80 transition-colors">
              📄 Card PDF
            </button>
            <button type="button" onClick={downloadVcf} className="rounded-xl bg-slate-100 border border-slate-200 py-2.5 text-xs font-bold text-slate-800 hover:bg-slate-200 transition-colors">
              📇 .VCF Contact
            </button>
          </div>
        </div>
      </div>

      {/* Live Business Card Preview */}
      <div className="lg:col-span-6">
        <div className="rounded-3xl border border-forest/10 bg-white p-6 shadow-lg space-y-4">
          <div className="text-xs font-bold uppercase tracking-wider text-forest/75 text-center">Live 3.5" x 2" Card Preview</div>

          <div
            ref={cardRef}
            className={`mx-auto max-w-sm rounded-3xl p-6 space-y-4 shadow-2xl relative overflow-hidden border ${themeStyles[theme]}`}
          >
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-xl font-black">{name}</h3>
                <p className="text-xs font-semibold opacity-90">{title}</p>
                <p className="text-[11px] font-bold uppercase tracking-wider mt-1 opacity-80">{company}</p>
                <p className="text-[10px] italic opacity-70">{tagline}</p>
              </div>
              {upiQrUrl && (
                <div className="p-1.5 bg-white rounded-xl shadow-md w-20 h-20 flex flex-col items-center justify-center">
                  <img src={upiQrUrl} alt="UPI QR" className="w-full h-full object-contain" />
                  <span className="text-[7px] font-black text-slate-900 uppercase tracking-tighter">Scan & Pay</span>
                </div>
              )}
            </div>

            <div className="border-t border-current/20 pt-3 flex justify-between items-end text-[10px] font-mono opacity-90">
              <div className="space-y-0.5">
                <div>📞 {phone}</div>
                <div>✉️ {email}</div>
                <div>💳 {vpa}</div>
              </div>
              {vcardQrUrl && (
                <div className="p-1 bg-white rounded-lg w-12 h-12 flex flex-col items-center justify-center">
                  <img src={vcardQrUrl} alt="vCard QR" className="w-full h-full object-contain" />
                  <span className="text-[6px] font-bold text-slate-900 uppercase">Save Contact</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
