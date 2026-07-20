import React, { useState, useEffect, useId } from "react";
import QRCode from "qrcode";

interface MenuItem {
  category: string;
  name: string;
  price: number;
}

export function MenuQrGenerator() {
  const [placeName, setPlaceName] = useState("THE GREEN CAFE");
  const [subtitle, setSubtitle] = useState("Fresh Coffee, Shakes & Sandwiches");
  const [vpa, setVpa] = useState("greencafe@upi");
  const [items, setItems] = useState<MenuItem[]>([
    { category: "Beverages", name: "Cappuccino", price: 140 },
    { category: "Beverages", name: "Cold Coffee with Ice Cream", price: 180 },
    { category: "Snacks", name: "Paneer Tikka Sandwich", price: 160 },
    { category: "Snacks", name: "Cheese Garlic Bread", price: 150 }
  ]);
  const [qrDataUrl, setQrDataUrl] = useState("");

  const placeNameId = useId();
  const subtitleId = useId();
  const vpaId = useId();

  useEffect(() => {
    if (!vpa.trim()) return;
    const uri = `upi://pay?pa=${encodeURIComponent(vpa.trim())}&pn=${encodeURIComponent(placeName)}&cu=INR`;
    QRCode.toDataURL(uri, {
      width: 360,
      margin: 1,
      color: { dark: "#113b2c", light: "#ffffff" }
    }).then(setQrDataUrl).catch(console.error);
  }, [vpa, placeName]);

  const addItem = () => {
    setItems([...items, { category: "General", name: "", price: 0 }]);
  };

  const updateItem = (index: number, field: keyof MenuItem, val: string | number) => {
    const updated = [...items];
    (updated[index] as any)[field] = val;
    setItems(updated);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const printMenu = () => {
    window.print();
  };

  return (
    <div className="grid gap-8 lg:grid-cols-12">
      {/* Input Panel */}
      <div className="lg:col-span-6 space-y-6">
        <div className="rounded-3xl border border-forest/10 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-xl font-black text-forest">Menu & Price List Setup</h2>

          <div className="space-y-3">
            <div>
              <label htmlFor={placeNameId} className="block text-xs font-bold text-forest/75 mb-1">Restaurant / Salon / Store Name</label>
              <input
                id={placeNameId}
                type="text"
                value={placeName}
                onChange={(e) => setPlaceName(e.target.value)}
                className="w-full rounded-xl border border-forest/15 p-2.5 text-xs font-bold text-forest outline-none focus:border-leaf"
              />
            </div>
            <div>
              <label htmlFor={subtitleId} className="block text-xs font-bold text-forest/75 mb-1">Subtitle / Cuisine Type</label>
              <input
                id={subtitleId}
                type="text"
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                className="w-full rounded-xl border border-forest/15 p-2.5 text-xs font-semibold text-forest outline-none focus:border-leaf"
              />
            </div>
            <div>
              <label htmlFor={vpaId} className="block text-xs font-bold text-forest/75 mb-1">UPI ID (VPA) for Table Payments</label>
              <input
                id={vpaId}
                type="text"
                value={vpa}
                onChange={(e) => setVpa(e.target.value)}
                className="w-full rounded-xl border border-forest/15 p-2.5 text-xs font-bold text-forest outline-none focus:border-leaf"
              />
            </div>
          </div>

          <div className="space-y-3 border-t border-forest/10 pt-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black uppercase tracking-wider text-forest">Menu Items List</label>
              <button type="button" onClick={addItem} className="text-xs font-bold text-leaf hover:underline">+ Add Item</button>
            </div>

            {items.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Category"
                  value={item.category}
                  onChange={(e) => updateItem(idx, "category", e.target.value)}
                  className="w-24 rounded-xl border border-forest/15 p-2 text-xs font-semibold text-forest outline-none"
                />
                <input
                  type="text"
                  placeholder="Item Name"
                  value={item.name}
                  onChange={(e) => updateItem(idx, "name", e.target.value)}
                  className="flex-1 rounded-xl border border-forest/15 p-2 text-xs font-semibold text-forest outline-none"
                />
                <input
                  type="number"
                  placeholder="Price (₹)"
                  value={item.price}
                  onChange={(e) => updateItem(idx, "price", parseFloat(e.target.value) || 0)}
                  className="w-20 rounded-xl border border-forest/15 p-2 text-xs font-semibold text-forest outline-none"
                />
                <button type="button" onClick={() => removeItem(idx)} className="text-red-500 font-bold p-1 text-xs hover:text-red-700">✕</button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={printMenu}
            className="w-full rounded-xl bg-forest py-3 text-xs font-bold text-mint hover:bg-forest/90 transition-all shadow-md"
          >
            Print A4 Menu Card
          </button>
        </div>
      </div>

      {/* Live A4 Menu Preview */}
      <div className="lg:col-span-6">
        <div className="rounded-3xl border border-forest/10 bg-white p-6 shadow-lg space-y-4">
          <div className="text-xs font-bold uppercase tracking-wider text-forest/75 text-center">Printable Menu Card Preview</div>

          <div className="mx-auto max-w-md rounded-3xl border-2 border-forest/20 bg-[#fdfbf7] p-6 space-y-6 shadow-xl text-forest">
            <div className="text-center space-y-1 border-b border-forest/15 pb-4">
              <h3 className="text-2xl font-black uppercase tracking-tight text-forest">{placeName}</h3>
              <p className="text-xs italic text-forest/70 font-serif">{subtitle}</p>
            </div>

            <div className="space-y-4">
              {items.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between border-b border-dashed border-forest/10 pb-2 text-xs">
                  <div>
                    <span className="font-bold text-forest">{item.name || "Menu Item"}</span>
                    <span className="ml-2 text-[10px] uppercase font-semibold text-leaf bg-mint px-1.5 py-0.5 rounded">{item.category}</span>
                  </div>
                  <span className="font-mono font-bold text-forest">₹{item.price}</span>
                </div>
              ))}
            </div>

            {qrDataUrl && (
              <div className="border-t border-forest/15 pt-4 text-center space-y-2">
                <div className="mx-auto w-32 h-32 p-1.5 bg-white border border-forest/15 rounded-xl shadow-sm flex items-center justify-center">
                  <img src={qrDataUrl} alt="Table Payment QR" className="w-full h-full object-contain" />
                </div>
                <div className="text-[11px] font-black uppercase text-forest">Scan to Pay via UPI</div>
                <div className="text-[10px] font-mono text-forest/60">{vpa}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
