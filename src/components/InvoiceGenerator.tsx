import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";

type InvoiceItem = { id: number; name: string; qty: string; price: string };
type CustomField = { id: number; label: string; value: string };

const draftKey = "proupiqr-invoice-draft";

function money(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value || 0);
}

function isValidUpiId(upiId: string) {
  return /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(upiId.trim());
}

function buildUpiUrl(upiId: string, payee: string, amount: number, note: string) {
  const params = new URLSearchParams({ pa: upiId.trim(), pn: payee.trim() || "Merchant", cu: "INR" });
  if (amount > 0) params.set("am", amount.toFixed(2));
  if (note.trim()) params.set("tn", note.trim());
  return `upi://pay?${params.toString()}`;
}

const today = new Date().toISOString().slice(0, 10);

const initialItems: InvoiceItem[] = [
  { id: 1, name: "Website design service", qty: "1", price: "4999" },
  { id: 2, name: "Maintenance", qty: "1", price: "999" }
];

const initialCustomFields: CustomField[] = [
  { id: 1, label: "GSTIN", value: "" },
  { id: 2, label: "Project", value: "" }
];

export function InvoiceGenerator() {
  const [merchant, setMerchant] = useState("ABC Solutions");
  const [upiId, setUpiId] = useState("merchant@upi");
  const [customer, setCustomer] = useState("Client Name");
  const [invoiceNo, setInvoiceNo] = useState("INV-0001");
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [dueDate, setDueDate] = useState(today);
  const [gstPercent, setGstPercent] = useState("18");
  const [discount, setDiscount] = useState("0");
  const [notes, setNotes] = useState("Thank you for your business. Scan the QR to pay instantly via any UPI app.");
  const [items, setItems] = useState<InvoiceItem[]>(initialItems);
  const [customFields, setCustomFields] = useState<CustomField[]>(initialCustomFields);
  const [logoData, setLogoData] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (!saved) return;
      const draft = JSON.parse(saved);
      setMerchant(draft.merchant ?? "ABC Solutions");
      setUpiId(draft.upiId ?? "merchant@upi");
      setCustomer(draft.customer ?? "Client Name");
      setInvoiceNo(draft.invoiceNo ?? "INV-0001");
      setInvoiceDate(draft.invoiceDate ?? today);
      setDueDate(draft.dueDate ?? today);
      setGstPercent(draft.gstPercent ?? "18");
      setDiscount(draft.discount ?? "0");
      setNotes(draft.notes ?? "");
      setItems(Array.isArray(draft.items) && draft.items.length ? draft.items : initialItems);
      setCustomFields(Array.isArray(draft.customFields) ? draft.customFields : initialCustomFields);
      setLogoData(draft.logoData ?? null);
    } catch {
      // Ignore broken local drafts and keep the built-in sample invoice.
    }
  }, []);

  const totals = useMemo(() => {
    const subtotal = items.reduce((sum, item) => sum + (Number(item.qty) || 0) * (Number(item.price) || 0), 0);
    const discountValue = Math.max(0, Number(discount) || 0);
    const taxable = Math.max(0, subtotal - discountValue);
    const gst = taxable * Math.max(0, Number(gstPercent) || 0) / 100;
    const total = taxable + gst;
    return { subtotal, discountValue, taxable, gst, total };
  }, [items, gstPercent, discount]);

  const visibleCustomFields = customFields.filter((field) => field.label.trim() || field.value.trim());
  const paymentNote = `${invoiceNo} - ${customer}`.slice(0, 80);
  const upiUrl = useMemo(() => buildUpiUrl(upiId, merchant, totals.total, paymentNote), [upiId, merchant, totals.total, paymentNote]);

  useEffect(() => {
    QRCode.toDataURL(upiUrl, { margin: 2, width: 360, errorCorrectionLevel: "H", color: { dark: "#113b2c", light: "#ffffff" } })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [upiUrl]);

  useEffect(() => {
    localStorage.setItem(draftKey, JSON.stringify({ merchant, upiId, customer, invoiceNo, invoiceDate, dueDate, gstPercent, discount, notes, items, customFields, logoData }));
  }, [merchant, upiId, customer, invoiceNo, invoiceDate, dueDate, gstPercent, discount, notes, items, customFields, logoData]);

  const updateItem = (id: number, field: keyof InvoiceItem, value: string) => {
    setItems((current) => current.map((item) => item.id === id ? { ...item, [field]: value } : item));
  };

  const updateCustomField = (id: number, field: keyof CustomField, value: string) => {
    setCustomFields((current) => current.map((item) => item.id === id ? { ...item, [field]: value } : item));
  };

  const addItem = () => setItems((current) => [...current, { id: Date.now(), name: "New item", qty: "1", price: "0" }]);
  const removeItem = (id: number) => setItems((current) => current.length > 1 ? current.filter((item) => item.id !== id) : current);
  const addCustomField = () => setCustomFields((current) => [...current, { id: Date.now(), label: "PO Number", value: "" }]);
  const removeCustomField = (id: number) => setCustomFields((current) => current.filter((field) => field.id !== id));

  const handleLogoUpload = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setLogoData(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  };

  const printInvoice = () => {
    document.body.classList.add("printing-invoice-only");
    window.print();
    window.setTimeout(() => document.body.classList.remove("printing-invoice-only"), 250);
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[0.92fr_1.08fr]">
      <div className="no-print rounded-[2rem] border border-white/75 bg-white/90 p-5 shadow-[0_18px_48px_rgba(17,59,44,0.08)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-leaf">Invoice builder</p>
            <h2 className="mt-2 text-2xl font-black text-forest">Create invoice + embedded UPI QR</h2>
          </div>
          <button onClick={printInvoice} className="rounded-full bg-forest px-4 py-2 text-sm font-bold text-white hover:bg-leaf">Download invoice PDF</button>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-bold text-forest">Business name<input value={merchant} onChange={(e) => setMerchant(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">UPI ID<input value={upiId} onChange={(e) => setUpiId(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Customer<input value={customer} onChange={(e) => setCustomer(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Invoice number<input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Invoice date<input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Due date<input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">GST %<input type="number" value={gstPercent} onChange={(e) => setGstPercent(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Discount ₹<input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
        </div>

        <div className="mt-6 rounded-2xl bg-cream p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-black text-forest">Brand logo</h3>
            {logoData && <button onClick={() => setLogoData(null)} className="text-sm font-bold text-red-600">Remove logo</button>}
          </div>
          <input type="file" accept="image/*" onChange={(event) => handleLogoUpload(event.target.files?.[0])} className="mt-3 w-full rounded-xl border border-forest/10 bg-white px-3 py-2 text-sm" />
          <p className="mt-2 text-xs leading-5 text-forest/60">Logo is stored only in your browser draft and appears on the invoice PDF.</p>
        </div>

        <div className="mt-6 space-y-3">
          <div className="flex items-center justify-between"><h3 className="font-black text-forest">Line items</h3><button onClick={addItem} className="text-sm font-bold text-leaf">+ Add item</button></div>
          {items.map((item) => (
            <div key={item.id} className="grid gap-2 rounded-2xl bg-cream p-3 sm:grid-cols-[1fr_72px_100px_28px]">
              <input aria-label="Item name" value={item.name} onChange={(e) => updateItem(item.id, "name", e.target.value)} className="rounded-xl border border-forest/10 px-3 py-2" />
              <input aria-label="Quantity" type="number" value={item.qty} onChange={(e) => updateItem(item.id, "qty", e.target.value)} className="rounded-xl border border-forest/10 px-3 py-2" />
              <input aria-label="Price" type="number" value={item.price} onChange={(e) => updateItem(item.id, "price", e.target.value)} className="rounded-xl border border-forest/10 px-3 py-2" />
              <button onClick={() => removeItem(item.id)} className="rounded-xl bg-white text-forest/60 hover:text-red-600" aria-label="Remove item">×</button>
            </div>
          ))}
        </div>

        <div className="mt-6 space-y-3">
          <div className="flex items-center justify-between"><h3 className="font-black text-forest">Custom invoice fields</h3><button onClick={addCustomField} className="text-sm font-bold text-leaf">+ Add field</button></div>
          {customFields.map((field) => (
            <div key={field.id} className="grid gap-2 rounded-2xl bg-cream p-3 sm:grid-cols-[150px_1fr_28px]">
              <input aria-label="Field label" value={field.label} onChange={(e) => updateCustomField(field.id, "label", e.target.value)} placeholder="Label" className="rounded-xl border border-forest/10 px-3 py-2" />
              <input aria-label="Field value" value={field.value} onChange={(e) => updateCustomField(field.id, "value", e.target.value)} placeholder="Value" className="rounded-xl border border-forest/10 px-3 py-2" />
              <button onClick={() => removeCustomField(field.id)} className="rounded-xl bg-white text-forest/60 hover:text-red-600" aria-label="Remove custom field">×</button>
            </div>
          ))}
        </div>

        <label className="mt-5 block text-sm font-bold text-forest">Invoice notes<textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
        {!isValidUpiId(upiId) && <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">Enter a real UPI ID before sending this invoice. The current value is only a sample.</p>}
      </div>

      <article className="invoice-paper mx-auto w-full max-w-[820px] rounded-[2rem] border border-forest/10 bg-white p-6 shadow-[0_24px_80px_rgba(17,59,44,0.12)] md:p-9">
        <header className="flex flex-col gap-5 border-b-2 border-forest pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            {logoData && <img src={logoData} alt={`${merchant || "Business"} logo`} className="h-16 w-16 rounded-2xl border border-forest/10 object-contain p-1" />}
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-leaf">Tax invoice</p>
              <h2 className="mt-2 text-3xl font-black text-forest">{merchant || "Your Business"}</h2>
              <p className="mt-2 text-sm font-semibold text-forest/65">UPI: {upiId || "yourname@upi"}</p>
            </div>
          </div>
          <div className="rounded-2xl bg-mint p-4 text-right">
            <p className="text-sm font-black text-forest">{invoiceNo}</p>
            <p className="mt-1 text-xs font-semibold text-forest/65">Issued: {invoiceDate}</p>
            <p className="text-xs font-semibold text-forest/65">Due: {dueDate}</p>
          </div>
        </header>

        <section className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl bg-cream p-4"><p className="text-xs font-black uppercase tracking-[0.18em] text-forest/50">Bill to</p><p className="mt-2 text-lg font-black text-forest">{customer || "Customer"}</p></div>
          <div className="rounded-2xl bg-forest p-4 text-white"><p className="text-xs font-black uppercase tracking-[0.18em] text-white/60">Amount payable</p><p className="mt-2 text-3xl font-black">{money(totals.total)}</p></div>
        </section>

        {visibleCustomFields.length > 0 && (
          <section className="mt-4 grid gap-3 rounded-2xl border border-forest/10 p-4 sm:grid-cols-2">
            {visibleCustomFields.map((field) => (
              <div key={field.id}>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-forest/45">{field.label || "Custom field"}</p>
                <p className="mt-1 text-sm font-bold text-forest">{field.value || "—"}</p>
              </div>
            ))}
          </section>
        )}

        <div className="mt-6 overflow-hidden rounded-2xl border border-forest/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-mint text-xs uppercase tracking-[0.14em] text-forest/70"><tr><th className="p-3">Item</th><th className="p-3 text-right">Qty</th><th className="p-3 text-right">Rate</th><th className="p-3 text-right">Amount</th></tr></thead>
            <tbody>{items.map((item) => { const amount = (Number(item.qty) || 0) * (Number(item.price) || 0); return <tr key={item.id} className="border-t border-forest/10"><td className="p-3 font-semibold text-forest">{item.name}</td><td className="p-3 text-right">{item.qty}</td><td className="p-3 text-right">{money(Number(item.price) || 0)}</td><td className="p-3 text-right font-bold">{money(amount)}</td></tr>; })}</tbody>
          </table>
        </div>

        <section className="mt-6 grid gap-6 sm:grid-cols-[1fr_260px]">
          <div className="rounded-2xl border border-dashed border-forest/20 p-4">
            <p className="text-sm font-black text-forest">Payment QR</p>
            <div className="mt-3 flex items-center gap-4">{qrDataUrl && <img src={qrDataUrl} alt="UPI payment QR for this invoice" className="h-32 w-32 rounded-xl border border-forest/10" />}<p className="text-sm leading-6 text-forest/70">Scan with PhonePe, Google Pay, Paytm, BHIM, or any UPI app. The QR includes invoice number and payable amount.</p></div>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><strong>{money(totals.subtotal)}</strong></div>
            <div className="flex justify-between"><span>Discount</span><strong>- {money(totals.discountValue)}</strong></div>
            <div className="flex justify-between"><span>GST ({Number(gstPercent) || 0}%)</span><strong>{money(totals.gst)}</strong></div>
            <div className="mt-3 flex justify-between border-t-2 border-forest pt-3 text-lg text-forest"><span className="font-black">Total</span><strong>{money(totals.total)}</strong></div>
          </div>
        </section>

        <footer className="mt-6 rounded-2xl bg-cream p-4 text-sm leading-6 text-forest/70"><strong className="text-forest">Notes:</strong> {notes}</footer>
      </article>
    </div>
  );
}
