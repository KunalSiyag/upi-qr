import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { toPng } from "html-to-image";

type QuoteItem = { id: number; name: string; qty: string; price: string };

const draftKey = "proupiqr-proforma-draft";
const EXPORT_TIMEOUT_MS = 20000;

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), EXPORT_TIMEOUT_MS);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

function money(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value || 0);
}

function isValidUpiId(upiId: string) {
  return /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(upiId.trim());
}

const today = new Date().toISOString().slice(0, 10);
const defaultValidUntil = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10);

const initialItems: QuoteItem[] = [
  { id: 1, name: "Website design service", qty: "1", price: "4999" },
  { id: 2, name: "Maintenance (per month)", qty: "1", price: "999" }
];

export function ProformaInvoiceGenerator() {
  const [merchant, setMerchant] = useState("ABC Solutions");
  const [customer, setCustomer] = useState("Client Name");
  const [quoteNo, setQuoteNo] = useState("PI-0001");
  const [quoteDate, setQuoteDate] = useState(today);
  const [validUntil, setValidUntil] = useState(defaultValidUntil);
  const [gstPercent, setGstPercent] = useState("18");
  const [discount, setDiscount] = useState("0");
  const [upiId, setUpiId] = useState("merchant@upi");
  const [terms, setTerms] = useState("50% advance required to start work. Prices valid till the validity date. Taxes extra as applicable.");
  const [preparedBy, setPreparedBy] = useState("Authorized Signatory");
  const [buyerOrderRef, setBuyerOrderRef] = useState("");
  const [items, setItems] = useState<QuoteItem[]>(initialItems);
  const [qrDataUrl, setQrDataUrl] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (!saved) return;
      const d = JSON.parse(saved);
      setMerchant(d.merchant ?? "ABC Solutions");
      setCustomer(d.customer ?? "Client Name");
      setQuoteNo(d.quoteNo ?? "QTN-0001");
      setQuoteDate(d.quoteDate ?? today);
      setValidUntil(d.validUntil ?? defaultValidUntil);
      setGstPercent(d.gstPercent ?? "18");
      setDiscount(d.discount ?? "0");
      setUpiId(d.upiId ?? "");
      setTerms(d.terms ?? "");
      setPreparedBy(d.preparedBy ?? "Authorized Signatory");
      setItems(Array.isArray(d.items) && d.items.length ? d.items : initialItems);
    } catch {
      // Ignore broken local drafts and keep the built-in sample.
    }
  }, []);

  const totals = useMemo(() => {
    const subtotal = items.reduce((sum, item) => sum + (Number(item.qty) || 0) * (Number(item.price) || 0), 0);
    const discountValue = Math.max(0, Number(discount) || 0);
    const taxable = Math.max(0, subtotal - discountValue);
    const gst = taxable * Math.max(0, Number(gstPercent) || 0) / 100;
    return { subtotal, discountValue, taxable, gst, total: taxable + gst };
  }, [items, gstPercent, discount]);

  useEffect(() => {
    if (!isValidUpiId(upiId)) { setQrDataUrl(""); return; }
    const params = new URLSearchParams({ pa: upiId.trim(), pn: merchant.trim() || "Merchant", cu: "INR" });
    QRCode.toDataURL(`upi://pay?${params.toString()}`, { margin: 2, width: 320, errorCorrectionLevel: "H", color: { dark: "#113b2c", light: "#ffffff" } })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [upiId, merchant]);

  useEffect(() => {
    localStorage.setItem(draftKey, JSON.stringify({ merchant, customer, buyerOrderRef, quoteNo, quoteDate, validUntil, gstPercent, discount, upiId, terms, preparedBy, items }));
  }, [merchant, customer, buyerOrderRef, quoteNo, quoteDate, validUntil, gstPercent, discount, upiId, terms, preparedBy, items]);

  const paperRef = useRef<HTMLDivElement | null>(null);
  const [pdfState, setPdfState] = useState<"idle" | "busy" | "error">("idle");
  const [pngState, setPngState] = useState<"idle" | "busy" | "error">("idle");
  const [shareState, setShareState] = useState<"idle" | "busy">("idle");

  const updateItem = (id: number, field: keyof QuoteItem, value: string) => {
    setItems((current) => current.map((item) => item.id === id ? { ...item, [field]: value } : item));
  };

  const addItem = () => setItems((current) => [...current, { id: Date.now(), name: "New line item", qty: "1", price: "0" }]);
  const removeItem = (id: number) => setItems((current) => current.length > 1 ? current.filter((item) => item.id !== id) : current);

  function safeFileName() {
    return (quoteNo || "proforma").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  async function renderPaper() {
    const el = paperRef.current;
    if (!el) throw new Error("Proforma preview not ready");
    const clone = el.cloneNode(true) as HTMLDivElement;
    Object.assign(clone.style, {
      position: "fixed", left: "0", top: "0", zIndex: "-9999", opacity: "0", pointerEvents: "none",
      width: "800px", minWidth: "800px", maxWidth: "800px", padding: "36px", boxSizing: "border-box",
      height: "auto", boxShadow: "none", border: "none", borderRadius: "0"
    });
    document.body.appendChild(clone);
    await new Promise((r) => setTimeout(r, 250));
    const targetHeight = clone.offsetHeight || 1100;
    try {
      const dataUrl = await withTimeout(toPng(clone, {
        cacheBust: true,
        pixelRatio: 2,
        width: 800,
        height: targetHeight,
        style: {
          opacity: "1", transform: "none", transformOrigin: "top left",
          width: "800px", height: `${targetHeight}px`, maxWidth: "800px", maxHeight: `${targetHeight}px`,
          minWidth: "800px", minHeight: `${targetHeight}px`, margin: "0", padding: "36px",
          boxSizing: "border-box", backgroundColor: "#ffffff", boxShadow: "none", border: "none", borderRadius: "0"
        }
      }), "Proforma render");
      return dataUrl;
    } finally {
      document.body.removeChild(clone);
    }
  }

  async function downloadPdf() {
    try {
      setPdfState("busy");
      const [{ jsPDF }, dataUrl] = await Promise.all([withTimeout(import("jspdf"), "PDF engine"), renderPaper()]);
      const pxToMm = 0.2646;
      const widthMm = 800 * pxToMm;
      const heightMm = (paperRef.current?.offsetHeight || 1100) * pxToMm;
      const pdf = new jsPDF({ orientation: widthMm < heightMm ? "portrait" : "landscape", unit: "mm", format: [widthMm, heightMm] });
      pdf.addImage(dataUrl, "PNG", 0, 0, widthMm, heightMm);
      pdf.save(`${safeFileName()}.pdf`);
      setPdfState("idle");
    } catch (err) {
      console.error("PDF download failed:", err);
      setPdfState("error");
    }
  }

  async function downloadPng() {
    try {
      setPngState("busy");
      const link = document.createElement("a");
      link.href = await renderPaper();
      link.download = `${safeFileName()}.png`;
      link.click();
      setPngState("idle");
    } catch (err) {
      console.error("PNG download failed:", err);
      setPngState("error");
    }
  }

  async function shareOnWhatsapp() {
    if (shareState === "busy") return;
    try {
      setShareState("busy");
      const message = `*Proforma Invoice ${quoteNo} from ${merchant || "Merchant"}*\n` +
        `----------------------------\n` +
        `*For:* ${customer}\n` +
        `*Estimated Total:* ${money(totals.total)} (incl. tax)\n` +
        `*Valid Until:* ${validUntil}\n\n` +
        (isValidUpiId(upiId) ? `Reserve your slot with an advance via UPI: ${upiId.trim()}\n\n` : "") +
        `Generated free via Pro UPI QR (https://www.proupiqr.in)`;
      let shared = false;
      if (navigator.share && navigator.canShare) {
        try {
          const dataUrl = await renderPaper();
          const blob = await (await fetch(dataUrl)).blob();
          const file = new File([blob], `${safeFileName()}.png`, { type: "image/png" });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: `Proforma Invoice ${quoteNo}`, text: message });
            shared = true;
          }
        } catch (err) {
          if ((err as DOMException)?.name === "AbortError") { setShareState("idle"); return; }
          console.warn("Native share unavailable, falling back.", err);
        }
      }
      if (!shared) {
        const link = document.createElement("a");
        link.href = await renderPaper();
        link.download = `${safeFileName()}.png`;
        link.click();
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`, "_blank");
      }
      setShareState("idle");
    } catch (err) {
      console.error("Share failed:", err);
      setShareState("idle");
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[0.92fr_1.08fr]">
      <div className="no-print rounded-[2rem] border border-white/75 bg-white/90 p-5 shadow-[0_18px_48px_rgba(17,59,44,0.08)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-forest/5 pb-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-leaf">Proforma builder</p>
            <h2 className="mt-1 text-2xl font-black text-forest">Formal Advance Requests</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={shareOnWhatsapp} disabled={shareState === "busy"} className="rounded-full bg-[#25D366] px-4 py-2 text-xs font-bold text-white hover:bg-[#1da851] disabled:opacity-50 transition">{shareState === "busy" ? "Preparing…" : "💬 WhatsApp Share"}</button>
            <button onClick={downloadPdf} disabled={pdfState === "busy"} className="rounded-full bg-forest px-4 py-2 text-xs font-bold text-white hover:bg-leaf disabled:opacity-50 transition">{pdfState === "busy" ? "Generating..." : "📄 Download PDF"}</button>
            <button onClick={downloadPng} disabled={pngState === "busy"} className="rounded-full bg-mint px-4 py-2 text-xs font-bold text-forest hover:bg-leaf hover:text-white disabled:opacity-50 transition">{pngState === "busy" ? "Generating..." : "🖼️ Download PNG"}</button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-bold text-forest">Your business<input value={merchant} onChange={(e) => setMerchant(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Customer (bill to)<input value={customer} onChange={(e) => setCustomer(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Buyer order reference (optional)<input value={buyerOrderRef} onChange={(e) => setBuyerOrderRef(e.target.value)} placeholder="PO / ref no." className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Proforma number<input value={quoteNo} onChange={(e) => setQuoteNo(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Valid until<input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Tax % (GST / VAT)<input type="number" value={gstPercent} onChange={(e) => setGstPercent(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Discount ₹<input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">UPI ID for advance (optional)<input value={upiId} onChange={(e) => setUpiId(e.target.value)} placeholder="yourname@upi" className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Prepared by<input value={preparedBy} onChange={(e) => setPreparedBy(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
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

        <label className="mt-5 block text-sm font-bold text-forest">Terms &amp; conditions<textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={3} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
      </div>

      <article ref={paperRef} className="invoice-paper mx-auto w-full max-w-[820px] rounded-[2rem] border border-forest/10 bg-white p-6 shadow-[0_24px_80px_rgba(17,59,44,0.12)] md:p-9">
        <header className="flex flex-col gap-5 border-b-2 border-forest pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-leaf">Proforma invoice</p>
            <h2 className="mt-2 text-3xl font-black text-forest">{merchant || "Your Business"}</h2>
          </div>
          <div className="rounded-2xl bg-sun/40 p-4 text-right">
            <p className="text-sm font-black text-forest">{quoteNo}</p>
            <p className="mt-1 text-xs font-semibold text-forest/65">Date: {quoteDate}</p>
            <p className="text-xs font-black text-forest">Valid until: {validUntil}</p>
          </div>
        </header>

        <section className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl bg-cream p-4"><p className="text-xs font-black uppercase tracking-[0.18em] text-forest/50">Prepared for</p><p className="mt-2 text-lg font-black text-forest">{customer || "Customer"}</p>{buyerOrderRef && <p className="text-xs font-semibold text-forest/65">Your order ref: {buyerOrderRef}</p>}</div>
          <div className="rounded-2xl bg-forest p-4 text-white"><p className="text-xs font-black uppercase tracking-[0.18em] text-white/60">Total payable on order</p><p className="mt-2 text-3xl font-black">{money(totals.total)}</p></div>
        </section>

        <div className="mt-6 overflow-hidden rounded-2xl border border-forest/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-mint text-xs uppercase tracking-[0.14em] text-forest/70"><tr><th className="p-3">Item</th><th className="p-3 text-right">Qty</th><th className="p-3 text-right">Rate</th><th className="p-3 text-right">Amount</th></tr></thead>
            <tbody>{items.map((item) => { const amount = (Number(item.qty) || 0) * (Number(item.price) || 0); return <tr key={item.id} className="border-t border-forest/10"><td className="p-3 font-semibold text-forest">{item.name}</td><td className="p-3 text-right">{item.qty}</td><td className="p-3 text-right">{money(Number(item.price) || 0)}</td><td className="p-3 text-right font-bold">{money(amount)}</td></tr>; })}</tbody>
          </table>
        </div>

        <section className="mt-6 grid gap-6 sm:grid-cols-[1fr_260px]">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><strong>{money(totals.subtotal)}</strong></div>
            <div className="flex justify-between"><span>Discount</span><strong>- {money(totals.discountValue)}</strong></div>
            <div className="flex justify-between"><span>Tax ({Number(gstPercent) || 0}%)</span><strong>{money(totals.gst)}</strong></div>
            <div className="mt-3 flex justify-between border-t-2 border-forest pt-3 text-lg text-forest"><span className="font-black">Total as per proforma</span><strong>{money(totals.total)}</strong></div>
            {qrDataUrl && <div className="mt-3 flex items-center gap-3 rounded-2xl border border-dashed border-forest/20 p-3">{qrDataUrl && <img src={qrDataUrl} alt="UPI QR for advance payment" className="h-20 w-20 rounded-lg border border-forest/10" />}<p className="text-xs leading-5 text-forest/70"><strong className="text-forest">Advance payment:</strong> scan this QR to confirm the booking with a token advance.</p></div>}
          </div>
          <div className="rounded-2xl bg-cream p-4 text-xs leading-6 text-forest/75">
            <p className="font-black uppercase tracking-wide text-forest/60">Terms</p>
            <p className="mt-2 whitespace-pre-line">{terms || "—"}</p>
          </div>
        </section>

        <footer className="mt-6 flex items-end justify-between rounded-2xl bg-cream p-4 text-sm leading-6 text-forest/70">
          <p>This is a proforma invoice issued for advance payment and order confirmation. It is not a tax invoice; a formal GST tax invoice will accompany the supply.</p>
          <div className="shrink-0 pl-4 text-center">
            <p className="border-t border-forest/30 pt-2 font-bold text-forest">{preparedBy}</p>
          </div>
        </footer>
      </article>
    </div>
  );
}
