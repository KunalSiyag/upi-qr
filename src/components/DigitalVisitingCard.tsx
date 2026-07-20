import React, { useState, useEffect, useId } from "react";
import QRCode from "qrcode";

export function DigitalVisitingCard() {
  const [name, setName] = useState("Vikram Sharma");
  const [title, setTitle] = useState("Founder & Lead Designer");
  const [company, setCompany] = useState("Sharma Designs Studio");
  const [phone, setPhone] = useState("+91 9876543210");
  const [email, setEmail] = useState("vikram@sharmadesigns.in");
  const [vpa, setVpa] = useState("vikram@upi");

  const [vcardQrUrl, setVcardQrUrl] = useState("");
  const [upiQrUrl, setUpiQrUrl] = useState("");

  const nameId = useId();
  const titleId = useId();
  const companyId = useId();
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

  const printCard = () => {
    window.print();
  };

  return (
    <div className="grid gap-8 lg:grid-cols-12">
      {/* Input Form */}
      <div className="lg:col-span-6 space-y-6">
        <div className="rounded-3xl border border-forest/10 bg-white p-6 shadow-sm space-y-3">
          <h2 className="text-xl font-black text-forest">Business Card Details</h2>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={nameId} className="block text-xs font-bold text-forest/75 mb-1">Full Name</label>
              <input id={nameId} type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-xl border border-forest/15 p-2 text-xs font-bold text-forest outline-none" />
            </div>
            <div>
              <label htmlFor={titleId} className="block text-xs font-bold text-forest/75 mb-1">Job Title / Role</label>
              <input id={titleId} type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-xl border border-forest/15 p-2 text-xs font-semibold text-forest outline-none" />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={companyId} className="block text-xs font-bold text-forest/75 mb-1">Company / Store Name</label>
              <input id={companyId} type="text" value={company} onChange={(e) => setCompany(e.target.value)} className="w-full rounded-xl border border-forest/15 p-2 text-xs font-semibold text-forest outline-none" />
            </div>
            <div>
              <label htmlFor={phoneId} className="block text-xs font-bold text-forest/75 mb-1">Phone Number</label>
              <input id={phoneId} type="text" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-xl border border-forest/15 p-2 text-xs font-semibold text-forest outline-none" />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={emailId} className="block text-xs font-bold text-forest/75 mb-1">Email Address</label>
              <input id={emailId} type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-forest/15 p-2 text-xs font-semibold text-forest outline-none" />
            </div>
            <div>
              <label htmlFor={vpaId} className="block text-xs font-bold text-forest/75 mb-1">UPI ID (VPA) for Payments</label>
              <input id={vpaId} type="text" value={vpa} onChange={(e) => setVpa(e.target.value)} className="w-full rounded-xl border border-forest/15 p-2 text-xs font-bold text-forest outline-none" />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={downloadVcf} className="flex-1 rounded-xl bg-forest py-3 text-xs font-bold text-mint hover:bg-forest/90 transition-all shadow-md">
              Download .vcf Contact Card
            </button>
            <button type="button" onClick={printCard} className="rounded-xl bg-mint border border-leaf/20 px-4 py-3 text-xs font-bold text-forest hover:bg-mint/80 transition-colors">
              Print Card
            </button>
          </div>
        </div>
      </div>

      {/* Live Business Card Preview */}
      <div className="lg:col-span-6">
        <div className="rounded-3xl border border-forest/10 bg-white p-6 shadow-lg space-y-4">
          <div className="text-xs font-bold uppercase tracking-wider text-forest/75 text-center">Printable 3.5" x 2" Visiting Card Preview</div>

          <div className="mx-auto max-w-sm rounded-3xl bg-forest p-6 text-mint space-y-4 shadow-2xl relative overflow-hidden">
            <div className="absolute right-0 top-0 w-32 h-32 bg-leaf/10 rounded-full blur-2xl pointer-events-none" />
            
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-xl font-black text-white">{name}</h3>
                <p className="text-xs text-mint/80 font-semibold">{title}</p>
                <p className="text-[11px] font-bold text-gold mt-1 uppercase tracking-wider">{company}</p>
              </div>
              {upiQrUrl && (
                <div className="p-1.5 bg-white rounded-xl shadow-md w-20 h-20 flex flex-col items-center justify-center">
                  <img src={upiQrUrl} alt="UPI QR" className="w-full h-full object-contain" />
                  <span className="text-[8px] font-bold text-forest uppercase tracking-tighter">Pay UPI</span>
                </div>
              )}
            </div>

            <div className="border-t border-white/10 pt-3 flex justify-between items-end text-[10px] text-mint/90 font-mono">
              <div className="space-y-0.5">
                <div>📞 {phone}</div>
                <div>✉️ {email}</div>
                <div>💳 {vpa}</div>
              </div>
              {vcardQrUrl && (
                <div className="p-1 bg-white rounded-lg w-12 h-12 flex flex-col items-center justify-center">
                  <img src={vcardQrUrl} alt="vCard QR" className="w-full h-full object-contain" />
                  <span className="text-[6px] font-bold text-slate-800 uppercase">Save Contact</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
