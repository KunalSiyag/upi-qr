import React, { useState, useEffect, useRef, useId } from "react";
import QRCode from "qrcode";

interface MenuItem {
  name: string;
  price: string;
  category: string;
}

export function MenuQrGenerator() {
  const [storeName, setStoreName] = useState("CAFE MONSOON");
  const [tagline, setTagline] = useState("Artisanal Coffee & Bakes");
  const [vpa, setVpa] = useState("cafemonsoon@upi");
  const [footerNote, setFooterNote] = useState("All prices inclusive of taxes • Pure Vegetarian");
  const [theme, setTheme] = useState<"warm" | "green" | "luxury" | "minimal">("warm");
  const [items, setItems] = useState<MenuItem[]>([
    { name: "Espresso Single", price: "120", category: "Coffee" },
    { name: "Cappuccino Grand", price: "180", category: "Coffee" },
    { name: "Avocado Toast", price: "240", category: "Bites" },
    { name: "Blueberry Muffin", price: "150", category: "Bites" }
  ]);

  // Groq AI State
  const [groqApiKey, setGroqApiKey] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("groq_api_key") || "";
    }
    return "";
  });
  const [rawMenuPrompt, setRawMenuPrompt] = useState("");
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [aiError, setAiError] = useState("");

  const [qrUrl, setQrUrl] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const storeNameId = useId();
  const taglineId = useId();
  const vpaId = useId();
  const footerNoteId = useId();
  const groqKeyId = useId();

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("groq_api_key", groqApiKey);
    }
  }, [groqApiKey]);

  useEffect(() => {
    if (!vpa.trim()) return;
    const uri = `upi://pay?pa=${encodeURIComponent(vpa.trim())}&pn=${encodeURIComponent(storeName)}&cu=INR`;
    QRCode.toDataURL(uri, {
      width: 300,
      margin: 1,
      color: { dark: "#113b2c", light: "#ffffff" }
    }).then(setQrUrl).catch(console.error);
  }, [vpa, storeName]);

  const addItem = () => {
    setItems([...items, { name: "New Special Item", price: "100", category: "Specials" }]);
  };

  const removeItem = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx));
  };

  const updateItem = (idx: number, field: keyof MenuItem, val: string) => {
    const copy = [...items];
    copy[idx] = { ...copy[idx], [field]: val };
    setItems(copy);
  };

  // Groq AI Parser Handler
  const generateMenuWithGroq = async () => {
    if (!rawMenuPrompt.trim()) {
      setAiError("Please paste menu text or describe your restaurant/cafe items.");
      return;
    }

    setIsAiGenerating(true);
    setAiError("");

    try {
      const key = groqApiKey.trim();
      if (!key) {
        throw new Error("Please enter your Groq API Key to auto-extract menu items using Groq AI.");
      }

      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${key}`
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            {
              role: "system",
              content: `You are an AI restaurant menu parser. Given unstructured menu text, raw OCR text, or a restaurant prompt, extract or create a clean menu structure in valid JSON only.
Return ONLY a JSON object matching this schema:
{
  "storeName": "Store or Cafe Name",
  "tagline": "Short tagline or cuisine description",
  "items": [
    { "name": "Item Name", "price": "Price in digits", "category": "Category name" }
  ]
}
Do NOT wrap output in markdown codeblocks or extra text.`
            },
            {
              role: "user",
              content: rawMenuPrompt
            }
          ],
          temperature: 0.2
        })
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `Groq API request failed with status ${response.status}`);
      }

      const data = await response.json();
      const contentStr = data.choices?.[0]?.message?.content || "";
      const cleanedJsonStr = contentStr.replace(/```json/g, "").replace(/```/g, "").trim();

      const parsed = JSON.parse(cleanedJsonStr);
      if (parsed.storeName) setStoreName(parsed.storeName);
      if (parsed.tagline) setTagline(parsed.tagline);
      if (Array.isArray(parsed.items) && parsed.items.length > 0) {
        setItems(parsed.items.map((it: any) => ({
          name: String(it.name || "Item"),
          price: String(it.price || "0"),
          category: String(it.category || "General")
        })));
      }
    } catch (err: any) {
      console.error("Groq Menu Generation error:", err);
      setAiError(err.message || "Failed to parse menu with Groq AI.");
    } finally {
      setIsAiGenerating(false);
    }
  };

  const downloadMenuPng = async () => {
    if (!menuRef.current) return;
    setIsExporting(true);
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(menuRef.current, { pixelRatio: 3, cacheBust: true });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${storeName.toLowerCase().replace(/\s+/g, "-")}-qr-menu.png`;
      a.click();
    } catch (e) {
      console.error("Menu PNG export error:", e);
    } finally {
      setIsExporting(false);
    }
  };

  const downloadMenuPdf = async () => {
    if (!menuRef.current) return;
    setIsExporting(true);
    try {
      const { toPng } = await import("html-to-image");
      const { jsPDF } = await import("jspdf");
      const dataUrl = await toPng(menuRef.current, { pixelRatio: 3, cacheBust: true });
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      pdf.addImage(dataUrl, "PNG", 0, 0, pdfWidth, pdfHeight);
      pdf.save(`${storeName.toLowerCase().replace(/\s+/g, "-")}-qr-menu.pdf`);
    } catch (e) {
      console.error("Menu PDF export error:", e);
    } finally {
      setIsExporting(false);
    }
  };

  const themeStyles = {
    warm: "bg-amber-50 text-amber-950 border-amber-800/20",
    green: "bg-emerald-50 text-emerald-950 border-emerald-800/20",
    luxury: "bg-slate-950 text-amber-100 border-amber-500/30",
    minimal: "bg-white text-slate-900 border-slate-200"
  };

  return (
    <div className="grid gap-8 lg:grid-cols-12">
      {/* Input Controls & AI Menu Builder */}
      <div className="lg:col-span-6 space-y-6">
        {/* Groq AI Auto Menu Generator Box */}
        <div className="rounded-3xl border border-leaf/30 bg-mint/30 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-black text-forest flex items-center gap-2">
              ✨ Groq AI Auto-Menu Generator
            </h3>
            <span className="text-[10px] font-bold uppercase tracking-wider bg-leaf/10 text-leaf px-2.5 py-0.5 rounded-full">
              Llama 3.3 70B
            </span>
          </div>
          <p className="text-xs text-forest/70">
            Paste raw unformatted text, photo OCR output, or describe your menu (e.g. <i>"South Indian breakfast menu for Annapoorna Cafe"</i>) and let Groq AI build your structured catalog instantly!
          </p>

          <div className="space-y-3">
            <div>
              <label htmlFor={groqKeyId} className="block text-[11px] font-bold text-forest mb-1">
                Groq API Key (saved locally in browser)
              </label>
              <input
                id={groqKeyId}
                type="password"
                value={groqApiKey}
                onChange={(e) => setGroqApiKey(e.target.value)}
                placeholder="gsk_..."
                className="w-full rounded-xl border border-forest/15 bg-white p-2.5 text-xs font-mono outline-none focus:border-leaf"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-forest mb-1">
                Paste Menu Text or Describe Menu
              </label>
              <textarea
                value={rawMenuPrompt}
                onChange={(e) => setRawMenuPrompt(e.target.value)}
                rows={3}
                placeholder="e.g. Cold Coffee 150, Iced Latte 180, Cheese Garlic Bread 210, Margherita Pizza 340..."
                className="w-full rounded-xl border border-forest/15 bg-white p-2.5 text-xs font-semibold outline-none focus:border-leaf"
              />
            </div>

            {aiError && (
              <p className="text-xs font-bold text-red-600 bg-red-50 p-2.5 rounded-xl border border-red-200">
                ⚠️ {aiError}
              </p>
            )}

            <button
              type="button"
              onClick={generateMenuWithGroq}
              disabled={isAiGenerating}
              className="w-full rounded-xl bg-forest py-2.5 text-xs font-black text-white hover:bg-leaf transition-all shadow-sm disabled:opacity-50"
            >
              {isAiGenerating ? "⚡ Parsing Menu with Groq AI..." : "✨ Auto-Generate Menu with Groq AI"}
            </button>
          </div>
        </div>

        {/* Manual Customizer Form */}
        <div className="rounded-3xl border border-forest/10 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-xl font-black text-forest">Menu Customizer</h2>

          {/* Theme Selector */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-forest/75">Select Dining Theme</label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { id: "warm", label: "Warm Bistro" },
                { id: "green", label: "Organic Green" },
                { id: "luxury", label: "Luxury Dark" },
                { id: "minimal", label: "Minimal White" }
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
              <label htmlFor={storeNameId} className="block text-xs font-bold text-forest/75 mb-1">Restaurant / Cafe Name</label>
              <input
                id={storeNameId}
                type="text"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                className="w-full rounded-xl border border-forest/15 p-2 text-xs font-bold text-forest outline-none"
              />
            </div>
            <div>
              <label htmlFor={taglineId} className="block text-xs font-bold text-forest/75 mb-1">Tagline / Cuisine Type</label>
              <input
                id={taglineId}
                type="text"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                className="w-full rounded-xl border border-forest/15 p-2 text-xs font-semibold text-forest outline-none"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={vpaId} className="block text-xs font-bold text-forest/75 mb-1">UPI ID for Payment QR</label>
              <input
                id={vpaId}
                type="text"
                value={vpa}
                onChange={(e) => setVpa(e.target.value)}
                className="w-full rounded-xl border border-forest/15 p-2 text-xs font-semibold text-forest outline-none"
              />
            </div>
            <div>
              <label htmlFor={footerNoteId} className="block text-xs font-bold text-forest/75 mb-1">Footer Terms / Note</label>
              <input
                id={footerNoteId}
                type="text"
                value={footerNote}
                onChange={(e) => setFooterNote(e.target.value)}
                className="w-full rounded-xl border border-forest/15 p-2 text-xs font-semibold text-forest outline-none"
              />
            </div>
          </div>

          {/* Menu Item Builder */}
          <div className="space-y-2 pt-2 border-t border-forest/10">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-forest">Menu Items ({items.length})</span>
              <button type="button" onClick={addItem} className="text-xs font-bold text-leaf hover:underline">+ Add Item</button>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {items.map((item, i) => (
                <div key={i} className="flex items-center gap-2 p-2 bg-slate-50 rounded-xl border border-slate-200">
                  <input
                    type="text"
                    value={item.name}
                    onChange={(e) => updateItem(i, "name", e.target.value)}
                    placeholder="Item Name"
                    className="flex-1 bg-white border border-slate-300 rounded-lg p-1 text-xs font-semibold"
                  />
                  <input
                    type="text"
                    value={item.price}
                    onChange={(e) => updateItem(i, "price", e.target.value)}
                    placeholder="₹ Price"
                    className="w-16 bg-white border border-slate-300 rounded-lg p-1 text-xs font-bold text-center"
                  />
                  <button type="button" onClick={() => removeItem(i)} className="text-xs font-bold text-red-500 hover:text-red-700 px-1">
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons: PNG & PDF Exports ONLY */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={downloadMenuPng}
              disabled={isExporting}
              className="flex-1 rounded-xl bg-forest py-3 text-xs font-bold text-white hover:bg-forest/90 transition-all shadow-md disabled:opacity-50"
            >
              🖼️ Download Menu PNG
            </button>
            <button
              type="button"
              onClick={downloadMenuPdf}
              disabled={isExporting}
              className="flex-1 rounded-xl bg-mint border border-leaf/20 py-3 text-xs font-bold text-forest hover:bg-mint/80 transition-colors disabled:opacity-50"
            >
              📄 Download Menu PDF
            </button>
          </div>
        </div>
      </div>

      {/* Live Preview */}
      <div className="lg:col-span-6">
        <div className="rounded-3xl border border-forest/10 bg-white p-6 shadow-lg space-y-4">
          <div className="text-xs font-bold uppercase tracking-wider text-forest/75 text-center">Live Table Menu Preview</div>

          <div
            ref={menuRef}
            className={`mx-auto max-w-sm rounded-3xl p-6 space-y-4 shadow-2xl border ${themeStyles[theme]}`}
          >
            <div className="text-center space-y-1">
              <h3 className="text-2xl font-black uppercase tracking-tight">{storeName}</h3>
              <p className="text-xs font-semibold opacity-75">{tagline}</p>
            </div>

            <div className="border-t border-b border-current/20 py-3 space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center text-xs font-bold">
                  <span>{item.name}</span>
                  <span className="font-mono">₹{item.price}</span>
                </div>
              ))}
            </div>

            {qrUrl && (
              <div className="text-center space-y-2 pt-1">
                <div className="mx-auto w-24 h-24 p-2 bg-white rounded-2xl shadow-md flex items-center justify-center">
                  <img src={qrUrl} alt="Menu Payment QR" className="w-full h-full object-contain" />
                </div>
                <div className="text-[10px] font-black uppercase tracking-wider">Scan QR to Pay via UPI</div>
                <div className="text-[9px] font-mono opacity-70">{vpa}</div>
              </div>
            )}

            <div className="text-[9px] text-center opacity-60 italic pt-1 border-t border-current/10">
              {footerNote}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
