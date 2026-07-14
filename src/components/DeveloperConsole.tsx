import { useState, useMemo } from "react";

export function DeveloperConsole() {
  const [form, setForm] = useState({
    pa: "merchant@upi",
    pn: "Kunal Siyag",
    am: "500",
    tn: "Invoice #1024",
    theme: "287a57",
    logo: "none",
  });

  const [activeTab, setActiveTab] = useState<"iframe" | "link" | "js" | "react">("iframe");
  const [copied, setCopied] = useState(false);

  const embedUrl = useMemo(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://www.proupiqr.in";
    const searchParams = new URLSearchParams();
    searchParams.set("pa", form.pa);
    searchParams.set("pn", form.pn);
    if (form.am) searchParams.set("am", form.am);
    if (form.tn) searchParams.set("tn", form.tn);
    searchParams.set("theme", form.theme.replace("#", ""));
    if (form.logo !== "none") searchParams.set("logo", form.logo);
    return `${origin}/embed/?${searchParams.toString()}`;
  }, [form]);

  const rawUpiLink = useMemo(() => {
    return `upi://pay?pa=${encodeURIComponent(form.pa)}&pn=${encodeURIComponent(form.pn)}${form.am ? `&am=${encodeURIComponent(form.am)}` : ""}${form.tn ? `&tn=${encodeURIComponent(form.tn)}` : ""}&cu=INR`;
  }, [form]);

  const codeSnippets = {
    iframe: `<iframe 
  src="${embedUrl}" 
  width="340" 
  height="480" 
  style="border:none; background:transparent; overflow:hidden;" 
  title="UPI Payment QR Widget"
></iframe>`,
    link: `<a 
  href="${rawUpiLink}" 
  style="background-color:#${form.theme.replace("#", "")}; color:#ffffff; padding:12px 24px; border-radius:12px; font-weight:bold; text-decoration:none; display:inline-flex; items-center; gap:8px;"
>
  Pay ₹${form.am || ""} now
</a>`,
    js: `// Redirect your customer directly to their UPI app
function redirectToPay() {
  const upiLink = "${rawUpiLink}";
  window.location.href = upiLink;
}`,
    react: `import React from 'react';

export function UpiPayButton() {
  const upiUrl = "${rawUpiLink}";
  
  return (
    <a 
      href={upiUrl}
      className="inline-flex items-center justify-center px-6 py-3 font-bold text-white rounded-xl shadow transition hover:opacity-90"
      style={{ backgroundColor: '#${form.theme.replace("#", "")}' }}
    >
      Pay with UPI App
    </a>
  );
}`
  };

  const copyToClipboard = (text: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
      {/* Configurator Card */}
      <div className="rounded-3xl border border-forest/10 bg-white p-6 md:p-8 shadow-sm">
        <h3 className="text-xl font-black text-forest">Widget Configurator</h3>
        <p className="mt-1 text-xs text-forest/60">Customize your payment widget parameters and get instant embed code below.</p>

        <form className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1">
            <span className="text-xs font-bold text-forest">Merchant UPI ID *</span>
            <input
              type="text"
              value={form.pa}
              onChange={(e) => setForm({ ...form, pa: e.target.value })}
              placeholder="e.g. business@okaxis"
              className="rounded-xl border border-forest/10 bg-cream/30 px-3.5 py-2.5 text-xs outline-none focus:border-leaf"
              required
            />
          </label>

          <label className="grid gap-1">
            <span className="text-xs font-bold text-forest">Merchant / Business Name *</span>
            <input
              type="text"
              value={form.pn}
              onChange={(e) => setForm({ ...form, pn: e.target.value })}
              placeholder="e.g. Kunal Stores"
              className="rounded-xl border border-forest/10 bg-cream/30 px-3.5 py-2.5 text-xs outline-none focus:border-leaf"
              required
            />
          </label>

          <label className="grid gap-1">
            <span className="text-xs font-bold text-forest">Requested Amount (₹) <span className="text-forest/40">(Optional)</span></span>
            <input
              type="number"
              value={form.am}
              onChange={(e) => setForm({ ...form, am: e.target.value })}
              placeholder="e.g. 500"
              className="rounded-xl border border-forest/10 bg-cream/30 px-3.5 py-2.5 text-xs outline-none focus:border-leaf"
            />
          </label>

          <label className="grid gap-1">
            <span className="text-xs font-bold text-forest">Transaction Note / ID <span className="text-forest/40">(Optional)</span></span>
            <input
              type="text"
              value={form.tn}
              onChange={(e) => setForm({ ...form, tn: e.target.value })}
              placeholder="e.g. Inv-4028"
              className="rounded-xl border border-forest/10 bg-cream/30 px-3.5 py-2.5 text-xs outline-none focus:border-leaf"
            />
          </label>

          <div className="grid gap-1">
            <span className="text-xs font-bold text-forest">Overlay Logo Badge</span>
            <select
              value={form.logo}
              onChange={(e) => setForm({ ...form, logo: e.target.value })}
              className="rounded-xl border border-forest/10 bg-cream/30 px-3.5 py-2.5 text-xs outline-none focus:border-leaf"
            >
              <option value="none">None (Default)</option>
              <option value="gpay">Google Pay</option>
              <option value="phonepe">PhonePe</option>
              <option value="paytm">Paytm</option>
              <option value="bhim">BHIM UPI</option>
            </select>
          </div>

          <div className="grid gap-1">
            <span className="text-xs font-bold text-forest">Theme Accent Color</span>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={`#${form.theme.replace("#", "")}`}
                onChange={(e) => setForm({ ...form, theme: e.target.value })}
                className="h-9 w-12 cursor-pointer rounded-lg border border-forest/10 bg-transparent p-0.5"
              />
              <span className="text-xs font-bold font-mono text-forest/70 uppercase">#{form.theme.replace("#", "")}</span>
            </div>
          </div>
        </form>

        {/* Code Snippets Section */}
        <div className="mt-8 border-t border-forest/10 pt-6">
          <div className="flex border-b border-forest/10 pb-2">
            {(["iframe", "link", "js", "react"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`border-b-2 px-4 py-2 text-xs font-bold uppercase tracking-wider transition ${
                  activeTab === tab
                    ? "border-forest text-forest"
                    : "border-transparent text-forest/50 hover:text-forest/70"
                }`}
              >
                {tab === "iframe"
                  ? "Iframe Embed"
                  : tab === "link"
                    ? "HTML Link"
                    : tab === "js"
                      ? "JS Redirect"
                      : "React Code"}
              </button>
            ))}
          </div>

          <div className="relative mt-4 rounded-2xl bg-forest p-4 text-left font-mono text-xs text-[#a6e22e] overflow-hidden shadow-inner">
            <button
              onClick={() => copyToClipboard(codeSnippets[activeTab])}
              className="absolute right-3 top-3 rounded-lg bg-white/10 px-3 py-1.5 text-[10px] font-bold text-white transition hover:bg-white/20 active:scale-95"
            >
              {copied ? "Copied! ✓" : "Copy Code"}
            </button>
            <pre className="overflow-x-auto text-[#fff] pr-20 pt-2 leading-relaxed">
              <code>{codeSnippets[activeTab]}</code>
            </pre>
          </div>
        </div>
      </div>

      {/* Live Preview Container */}
      <div className="flex flex-col items-center justify-center rounded-3xl border border-forest/10 bg-cream/20 p-6 md:p-8 shadow-sm">
        <h4 className="mb-4 text-xs font-black uppercase tracking-widest text-forest/50">Live Sandbox Preview</h4>
        <div className="relative overflow-hidden rounded-3xl border border-black/5 bg-transparent shadow-xl transition-all duration-300 w-[340px] h-[480px]">
          <iframe
            src={embedUrl}
            width="340"
            height="480"
            style={{ border: "none", background: "transparent", overflow: "hidden" }}
            title="UPI Payment Embed Widget Preview"
          />
        </div>
        <p className="mt-4 text-[10px] text-center text-forest/50 max-w-xs leading-relaxed">
          Scanning this QR code from any standard UPI app (GPay, PhonePe, Paytm, BHIM) will request ₹{form.am || "any amount"} to {form.pn}.
        </p>
      </div>
    </div>
  );
}
