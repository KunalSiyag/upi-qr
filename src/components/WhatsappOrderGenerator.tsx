import React, { useState, useId } from "react";
import QRCode from "qrcode";

interface OrderItem {
  name: string;
  qty: number;
  price: number;
}

export function WhatsappOrderGenerator() {
  const [phone, setPhone] = useState("919876543210");
  const [storeName, setStoreName] = useState("Fresh Organic Store");
  const [items, setItems] = useState<OrderItem[]>([
    { name: "Almond Milk 1L", qty: 2, price: 250 },
    { name: "Organic Honey 500g", qty: 1, price: 450 }
  ]);
  const [vpa, setVpa] = useState("freshstore@upi");
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");

  const phoneId = useId();
  const storeNameId = useId();
  const vpaId = useId();

  const totalAmount = items.reduce((acc, item) => acc + item.qty * item.price, 0);

  const addItem = () => {
    setItems([...items, { name: "", qty: 1, price: 0 }]);
  };

  const updateItem = (index: number, field: keyof OrderItem, val: string | number) => {
    const updated = [...items];
    (updated[index] as any)[field] = val;
    setItems(updated);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  // Build WhatsApp text
  const itemText = items.map((i, idx) => `${idx + 1}. ${i.name} (x${i.qty}) - ₹${i.qty * i.price}`).join("\n");
  const upiPayUri = `upi://pay?pa=${encodeURIComponent(vpa)}&pn=${encodeURIComponent(storeName)}&am=${totalAmount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(`WhatsApp Order`)}`;
  
  const whatsappMsg = `*Order Confirmation from ${storeName}*\n\n*Items Ordered:*\n${itemText}\n\n*Total Payable:* ₹${totalAmount.toFixed(2)}\n\n*Pay via UPI ID:* ${vpa}\n*Instant Payment Link:* ${upiPayUri}\n\nPlease confirm order to proceed with dispatch!`;
  
  const whatsappUrl = `https://wa.me/${phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(whatsappMsg)}`;

  const generateQr = async () => {
    try {
      const url = await QRCode.toDataURL(upiPayUri, {
        width: 360,
        margin: 2,
        color: { dark: "#113b2c", light: "#ffffff" }
      });
      setQrDataUrl(url);
    } catch (e) {
      console.error("QR Generation Error", e);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(whatsappUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="grid gap-8 lg:grid-cols-12">
      {/* Left Input Panel */}
      <div className="lg:col-span-7 space-y-6">
        <div className="rounded-3xl border border-forest/10 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-xl font-black text-forest">Order & Seller Details</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={phoneId} className="block text-xs font-bold text-forest/75 mb-1">Seller WhatsApp Number (with 91)</label>
              <input
                id={phoneId}
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="919876543210"
                className="w-full rounded-xl border border-forest/15 p-2.5 text-xs font-bold font-mono text-forest outline-none focus:border-leaf"
              />
            </div>
            <div>
              <label htmlFor={storeNameId} className="block text-xs font-bold text-forest/75 mb-1">Store / Merchant Name</label>
              <input
                id={storeNameId}
                type="text"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                className="w-full rounded-xl border border-forest/15 p-2.5 text-xs font-bold text-forest outline-none focus:border-leaf"
              />
            </div>
          </div>

          <div>
            <label htmlFor={vpaId} className="block text-xs font-bold text-forest/75 mb-1">UPI ID (VPA) for Direct Payments</label>
            <input
              id={vpaId}
              type="text"
              value={vpa}
              onChange={(e) => setVpa(e.target.value)}
              className="w-full rounded-xl border border-forest/15 p-2.5 text-xs font-bold text-forest outline-none focus:border-leaf"
            />
          </div>

          {/* Item Builder */}
          <div className="space-y-3 border-t border-forest/10 pt-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black uppercase tracking-wider text-forest">Order Items</label>
              <button
                type="button"
                onClick={addItem}
                className="text-xs font-bold text-leaf hover:underline"
              >
                + Add Item
              </button>
            </div>

            {items.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Item Name"
                  value={item.name}
                  onChange={(e) => updateItem(idx, "name", e.target.value)}
                  className="flex-1 rounded-xl border border-forest/15 p-2 text-xs font-semibold text-forest outline-none"
                />
                <input
                  type="number"
                  placeholder="Qty"
                  min="1"
                  value={item.qty}
                  onChange={(e) => updateItem(idx, "qty", parseInt(e.target.value) || 1)}
                  className="w-16 rounded-xl border border-forest/15 p-2 text-xs font-semibold text-forest outline-none"
                />
                <input
                  type="number"
                  placeholder="Price (₹)"
                  min="0"
                  value={item.price}
                  onChange={(e) => updateItem(idx, "price", parseFloat(e.target.value) || 0)}
                  className="w-24 rounded-xl border border-forest/15 p-2 text-xs font-semibold text-forest outline-none"
                />
                <button
                  type="button"
                  onClick={() => removeItem(idx)}
                  className="text-red-500 font-bold p-1 text-xs hover:text-red-700"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={generateQr}
              className="flex-1 rounded-xl bg-forest py-3 text-xs font-bold text-mint hover:bg-forest/90 transition-all shadow-md"
            >
              Generate Payment QR & Link
            </button>
          </div>
        </div>
      </div>

      {/* Right Output Panel */}
      <div className="lg:col-span-5 space-y-6">
        <div className="rounded-3xl border border-forest/10 bg-white p-6 shadow-lg space-y-4">
          <div className="flex items-center justify-between border-b border-forest/10 pb-3">
            <h3 className="text-lg font-black text-forest">WhatsApp Chat Preview</h3>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">WhatsApp Business</span>
          </div>

          <div className="rounded-2xl bg-[#efeae2] p-4 text-xs space-y-3 font-sans shadow-inner">
            <div className="rounded-xl bg-white p-3 space-y-2 border border-slate-200">
              <div className="font-bold text-slate-900">*Order Confirmation from {storeName}*</div>
              <div className="space-y-1 text-slate-700 font-mono text-[11px]">
                {items.map((i, idx) => (
                  <div key={idx}>{idx + 1}. {i.name || "Item"} (x{i.qty}) - ₹{i.qty * i.price}</div>
                ))}
              </div>
              <div className="font-bold text-slate-900 border-t pt-1">*Total Payable:* ₹{totalAmount.toFixed(2)}</div>
              <div className="text-[10px] text-slate-500 font-mono">*Pay via UPI ID:* {vpa}</div>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center rounded-xl bg-emerald-600 py-3 text-xs font-bold text-white hover:bg-emerald-700 transition-colors shadow-md"
            >
              Send via WhatsApp &rarr;
            </a>
            <button
              type="button"
              onClick={copyLink}
              className="w-full rounded-xl bg-mint border border-leaf/20 py-2.5 text-xs font-bold text-forest hover:bg-mint/80 transition-colors"
            >
              {copied ? "Link Copied to Clipboard!" : "Copy WhatsApp Order Link"}
            </button>
          </div>

          {qrDataUrl && (
            <div className="border-t border-forest/10 pt-4 text-center space-y-2">
              <div className="text-xs font-bold text-forest/75 uppercase">Order Payment QR Code</div>
              <img src={qrDataUrl} alt="Order QR" className="mx-auto w-40 h-40 rounded-xl border border-forest/15 p-2 bg-white" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
