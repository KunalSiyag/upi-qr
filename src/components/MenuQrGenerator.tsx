import React, { useState, useEffect, useRef, useId } from "react";
import QRCode from "qrcode";
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";

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

  const [qrUrl, setQrUrl] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const storeNameId = useId();
  const taglineId = useId();
  const vpaId = useId();
  const footerNoteId = useId();

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

  const downloadMenuPng = async () => {
    if (!menuRef.current) return;
    setIsExporting(true);
    try {
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
      {/* Input Controls */}
      <div className="lg:col-span-6 space-y-6">
        <div className="rounded-3xl border border-forest/10 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-xl font-black text-forest">Customize Menu Catalog</h2>

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
