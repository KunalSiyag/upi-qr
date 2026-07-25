import React, { useState } from "react";

export function UpiLinkGenerator() {
  const [vpa, setVpa] = useState("sharmastores@okicici");
  const [name, setName] = useState("Sharma Kirana Store");
  const [amount, setAmount] = useState("500");
  const [note, setNote] = useState("Grocery Payment");
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Construct raw upi://pay URI
  const rawVpa = vpa.trim();
  const rawName = name.trim();
  const rawAmount = amount.trim();
  const rawNote = note.trim();

  let upiUri = `upi://pay?pa=${encodeURIComponent(rawVpa)}`;
  if (rawName) upiUri += `&pn=${encodeURIComponent(rawName)}`;
  if (rawAmount) upiUri += `&am=${encodeURIComponent(rawAmount)}&cu=INR`;
  if (rawNote) upiUri += `&tn=${encodeURIComponent(rawNote)}`;

  // Web deep link / HTTPS redirect link
  const whatsappShareText = encodeURIComponent(
    `Pay ${rawName || "Merchant"} ${rawAmount ? `₹${rawAmount}` : ""} via UPI:\n${upiUri}`
  );
  const whatsappShareUrl = `https://api.whatsapp.com/send?text=${whatsappShareText}`;

  // HTML Button snippet
  const htmlSnippet = `<a href="${upiUri}" style="background-color:#10b981;color:#ffffff;padding:12px 24px;border-radius:12px;font-family:sans-serif;font-weight:bold;text-decoration:none;display:inline-block;">Pay ${rawAmount ? `₹${rawAmount}` : ""} via UPI</a>`;

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-8">
      {/* Input Form */}
      <div className="rounded-3xl border border-leaf/20 bg-white p-6 md:p-8 shadow-sm space-y-5">
        <h3 className="text-xl font-black text-forest border-b border-forest/10 pb-3 flex items-center gap-2">
          <span className="text-leaf">⚡</span> Enter UPI Payment Link Details
        </h3>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-black uppercase text-forest/70 mb-1.5">
              UPI ID (VPA) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={vpa}
              onChange={(e) => setVpa(e.target.value)}
              placeholder="e.g. name@okicici or 9876543210@ybl"
              className="w-full px-4 py-3 rounded-xl border border-forest/20 focus:border-leaf focus:ring-2 focus:ring-leaf/20 font-mono text-sm outline-none transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-black uppercase text-forest/70 mb-1.5">
              Payee Name (Optional)
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sharma Enterprises"
              className="w-full px-4 py-3 rounded-xl border border-forest/20 focus:border-leaf focus:ring-2 focus:ring-leaf/20 text-sm outline-none transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-black uppercase text-forest/70 mb-1.5">
              Amount (₹ INR) (Optional)
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 500"
              className="w-full px-4 py-3 rounded-xl border border-forest/20 focus:border-leaf focus:ring-2 focus:ring-leaf/20 text-sm outline-none transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-black uppercase text-forest/70 mb-1.5">
              Note / Reference (Optional)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Invoice #1042"
              className="w-full px-4 py-3 rounded-xl border border-forest/20 focus:border-leaf focus:ring-2 focus:ring-leaf/20 text-sm outline-none transition-all"
            />
          </div>
        </div>
      </div>

      {/* Output Link Formats */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Deep Link & WhatsApp */}
        <div className="rounded-3xl border border-leaf/20 bg-white p-6 shadow-sm space-y-5 flex flex-col justify-between">
          <div>
            <h4 className="text-base font-black text-forest flex items-center gap-2">
              🔗 Raw UPI Intent Link
            </h4>
            <p className="text-xs text-forest/60 mt-1">
              Works directly on mobile browsers to launch Google Pay, PhonePe, Paytm, or BHIM.
            </p>
            <div className="mt-3 p-3 bg-mint/50 border border-leaf/20 rounded-2xl">
              <p className="font-mono text-xs text-forest break-all select-all font-semibold">
                {upiUri}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => copyToClipboard(upiUri, "uri")}
              className="flex-1 py-2.5 px-4 rounded-xl bg-forest text-white hover:bg-leaf text-xs font-bold transition-all"
            >
              {copiedField === "uri" ? "✓ Copied Link!" : "Copy Intent URI"}
            </button>

            <a
              href={whatsappShareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="py-2.5 px-4 rounded-xl bg-[#25D366] text-white hover:opacity-90 text-xs font-bold transition-all flex items-center gap-1.5"
            >
              💬 Share via WhatsApp
            </a>
          </div>
        </div>

        {/* HTML Web Button Code */}
        <div className="rounded-3xl border border-leaf/20 bg-white p-6 shadow-sm space-y-5 flex flex-col justify-between">
          <div>
            <h4 className="text-base font-black text-forest flex items-center gap-2">
              💻 HTML Payment Button Code
            </h4>
            <p className="text-xs text-forest/60 mt-1">
              Paste this HTML snippet into your website, invoice email, or HTML landing page.
            </p>
            <div className="mt-3 p-3 bg-slate-900 text-slate-100 rounded-2xl font-mono text-[11px] overflow-x-auto select-all">
              {htmlSnippet}
            </div>
          </div>

          <button
            onClick={() => copyToClipboard(htmlSnippet, "html")}
            className="w-full py-2.5 px-4 rounded-xl bg-forest text-white hover:bg-leaf text-xs font-bold transition-all"
          >
            {copiedField === "html" ? "✓ Copied HTML Snippet!" : "Copy HTML Code"}
          </button>
        </div>
      </div>

      {/* QR Code Action Link */}
      <div className="rounded-3xl bg-mint border border-leaf/30 p-6 text-center shadow-sm">
        <h4 className="text-lg font-black text-forest">Need a Printable Counter Poster or QR Standee?</h4>
        <p className="text-xs text-forest/70 mt-1">
          Turn this exact payment link into a high-resolution print standee with your shop logo and custom layout.
        </p>
        <a
          href={`/?upiId=${encodeURIComponent(rawVpa)}&name=${encodeURIComponent(rawName)}&amount=${encodeURIComponent(rawAmount)}#generator`}
          className="mt-4 inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-leaf text-white font-black text-xs hover:bg-forest transition-all shadow-md"
        >
          🎨 Generate Free QR Standee Poster for {rawVpa || "this UPI ID"} →
        </a>
      </div>
    </div>
  );
}
