import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { safeToPng, downloadDataUrl, notifyExportError } from "../lib/export-image";

type ReceiptItem = { id: number; name: string; qty: string; price: string };

const draftKey = "proupiqr-receipt-draft";
const paymentModes = ["UPI", "Cash", "Card", "Bank Transfer", "Cheque"] as const;

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

function buildUpiUrl(upiId: string, payee: string, amount: number, note: string) {
  const params = new URLSearchParams({ pa: upiId.trim(), pn: payee.trim() || "Merchant", cu: "INR" });
  if (amount > 0) params.set("am", amount.toFixed(2));
  if (note.trim()) params.set("tn", note.trim());
  return `upi://pay?${params.toString()}`;
}

const today = new Date().toISOString().slice(0, 10);

const initialItems: ReceiptItem[] = [
  { id: 1, name: "Advance payment received", qty: "1", price: "2500" }
];

export function ReceiptGenerator() {
  const [merchant, setMerchant] = useState("ABC Solutions");
  const [upiId, setUpiId] = useState("merchant@upi");
  const [customer, setCustomer] = useState("Client Name");
  const [customerPhone, setCustomerPhone] = useState("");
  const [receiptNo, setReceiptNo] = useState("RCPT-0001");
  const [receiptDate, setReceiptDate] = useState(today);
  const [paymentMode, setPaymentMode] = useState<(typeof paymentModes)[number]>("UPI");
  const [referenceNo, setReferenceNo] = useState("");
  const [receivedBy, setReceivedBy] = useState("Authorized Signatory");
  const [notes, setNotes] = useState("Received with thanks. This receipt acknowledges full settlement of the amount mentioned above.");
  const [items, setItems] = useState<ReceiptItem[]>(initialItems);
  const [qrDataUrl, setQrDataUrl] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (!saved) return;
      const draft = JSON.parse(saved);
      setMerchant(draft.merchant ?? "ABC Solutions");
      setUpiId(draft.upiId ?? "merchant@upi");
      setCustomer(draft.customer ?? "Client Name");
      setCustomerPhone(draft.customerPhone ?? "");
      setReceiptNo(draft.receiptNo ?? "RCPT-0001");
      setReceiptDate(draft.receiptDate ?? today);
      setPaymentMode(paymentModes.includes(draft.paymentMode) ? draft.paymentMode : "UPI");
      setReferenceNo(draft.referenceNo ?? "");
      setReceivedBy(draft.receivedBy ?? "Authorized Signatory");
      setNotes(draft.notes ?? "");
      setItems(Array.isArray(draft.items) && draft.items.length ? draft.items : initialItems);
    } catch {
      // Ignore broken local drafts and keep the built-in sample receipt.
    }
  }, []);

  const totals = useMemo(() => {
    const subtotal = items.reduce((sum, item) => sum + (Number(item.qty) || 0) * (Number(item.price) || 0), 0);
    return { subtotal };
  }, [items]);

  const paymentNote = `${receiptNo} - ${customer}`.slice(0, 80);
  const upiUrl = useMemo(() => buildUpiUrl(upiId, merchant, totals.subtotal, paymentNote), [upiId, merchant, totals.subtotal, paymentNote]);

  useEffect(() => {
    QRCode.toDataURL(upiUrl, { margin: 2, width: 360, errorCorrectionLevel: "H", color: { dark: "#113b2c", light: "#ffffff" } })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [upiUrl]);

  useEffect(() => {
    localStorage.setItem(draftKey, JSON.stringify({ merchant, upiId, customer, customerPhone, receiptNo, receiptDate, paymentMode, referenceNo, receivedBy, notes, items }));
  }, [merchant, upiId, customer, customerPhone, receiptNo, receiptDate, paymentMode, referenceNo, receivedBy, notes, items]);

  const receiptRef = useRef<HTMLDivElement | null>(null);
  const [downloadPdfState, setDownloadPdfState] = useState<"idle" | "busy" | "error">("idle");
  const [downloadPngState, setDownloadPngState] = useState<"idle" | "busy" | "error">("idle");
  const [shareState, setShareState] = useState<"idle" | "busy">("idle");

  const updateItem = (id: number, field: keyof ReceiptItem, value: string) => {
    setItems((current) => current.map((item) => item.id === id ? { ...item, [field]: value } : item));
  };

  const addItem = () => setItems((current) => [...current, { id: Date.now(), name: "Payment for", qty: "1", price: "0" }]);
  const removeItem = (id: number) => setItems((current) => current.length > 1 ? current.filter((item) => item.id !== id) : current);

  async function renderPaperToPng(width = 800, padding = "36px") {
    const el = receiptRef.current;
    if (!el) throw new Error("Receipt preview not ready");

    const clone = el.cloneNode(true) as HTMLDivElement;
    clone.style.position = "fixed";
    clone.style.left = "0";
    clone.style.top = "0";
    clone.style.zIndex = "-9999";
    clone.style.opacity = "0";
    clone.style.pointerEvents = "none";
    clone.style.width = `${width}px`;
    clone.style.minWidth = `${width}px`;
    clone.style.maxWidth = `${width}px`;
    clone.style.padding = padding;
    clone.style.boxSizing = "border-box";
    clone.style.height = "auto";
    clone.style.boxShadow = "none";
    clone.style.border = "none";
    clone.style.borderRadius = "0";

    document.body.appendChild(clone);
    await new Promise((resolve) => setTimeout(resolve, 250));

    const measuredHeight = clone.offsetHeight;
    const targetHeight = measuredHeight || 1000;

    const dataUrl = await safeToPng(clone, {
      cacheBust: true,
      pixelRatio: 2,
      width,
      height: targetHeight,
      style: {
        opacity: "1",
        transform: "none",
        transformOrigin: "top left",
        width: `${width}px`,
        height: `${targetHeight}px`,
        maxWidth: `${width}px`,
        maxHeight: `${targetHeight}px`,
        minWidth: `${width}px`,
        minHeight: `${targetHeight}px`,
        margin: "0",
        padding,
        boxSizing: "border-box",
        backgroundColor: "#ffffff",
        boxShadow: "none",
        border: "none",
        borderRadius: "0"
      }
    });

    document.body.removeChild(clone);
    return { dataUrl, targetHeight };
  }

  function safeFileName(prefix: string) {
    return (receiptNo || prefix)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  async function downloadReceiptPdf() {
    try {
      setDownloadPdfState("busy");
      const { jsPDF } = await withTimeout(import("jspdf"), "PDF engine");
      const { dataUrl, targetHeight } = await renderPaperToPng();

      const pxToMm = 0.2646;
      const widthMm = 800 * pxToMm;
      const heightMm = targetHeight * pxToMm;

      const pdf = new jsPDF({
        orientation: widthMm < heightMm ? "portrait" : "landscape",
        unit: "mm",
        format: [widthMm, heightMm]
      });

      pdf.addImage(dataUrl, "PNG", 0, 0, widthMm, heightMm);
      pdf.save(`${safeFileName("receipt")}.pdf`);
      setDownloadPdfState("idle");
    } catch (err) {
      console.error("PDF download failed:", err); notifyExportError("PDF export failed — please retry.");
      setDownloadPdfState("error");
    }
  }

  async function downloadReceiptPng() {
    try {
      setDownloadPngState("busy");
      const { dataUrl } = await renderPaperToPng();

      downloadDataUrl(dataUrl, `${safeFileName("receipt")}.png`);
      setDownloadPngState("idle");
    } catch (err) {
      console.error("PNG download failed:", err); notifyExportError("PNG export failed — try the PDF instead.");
      setDownloadPngState("error");
    }
  }

  function buildShareMessage() {
    return `*Payment Receipt from ${merchant || "Merchant"}*\n` +
      `----------------------------\n` +
      `*Receipt No:* ${receiptNo}\n` +
      `*Received From:* ${customer}\n` +
      `*Amount Received:* ${money(totals.subtotal)}\n` +
      `*Mode:* ${paymentMode}${referenceNo ? `\n*Reference:* ${referenceNo}` : ""}\n` +
      `*Date:* ${receiptDate}\n\n` +
      `Thank you for your payment!\n\n` +
      `Generated free via Pro UPI QR (https://www.proupiqr.in)`;
  }

  async function dataUrlToPngFile(dataUrl: string, fileName: string) {
    const blob = await (await fetch(dataUrl)).blob();
    return new File([blob], fileName, { type: "image/png" });
  }

  async function shareOnWhatsapp() {
    if (shareState === "busy") return;
    try {
      setShareState("busy");

      let sharedVisually = false;
      if (navigator.share && navigator.canShare) {
        try {
          const { dataUrl } = await renderPaperToPng();
          const file = await dataUrlToPngFile(dataUrl, `${safeFileName("receipt")}.png`);
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: `Receipt ${receiptNo}`,
              text: buildShareMessage()
            });
            sharedVisually = true;
          }
        } catch (err) {
          if ((err as DOMException)?.name === "AbortError") {
            setShareState("idle");
            return;
          }
          console.warn("Native share unavailable, falling back to download + WhatsApp.", err);
        }
      }

      if (!sharedVisually) {
        try {
          const { dataUrl } = await renderPaperToPng();
          downloadDataUrl(dataUrl, `${safeFileName("receipt")}.png`);
        } catch (err) {
          console.error("Receipt image export failed:", err);
        }
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(buildShareMessage())}`, "_blank");
      }

      setShareState("idle");
    } catch (err) {
      console.error("WhatsApp share failed:", err);
      setShareState("idle");
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[0.92fr_1.08fr]">
      <div className="no-print rounded-[2rem] border border-white/75 bg-white/90 p-5 shadow-[0_18px_48px_rgba(17,59,44,0.08)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-forest/5 pb-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-leaf">Receipt builder</p>
            <h2 className="mt-1 text-2xl font-black text-forest">Create Payment Receipt</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={shareOnWhatsapp}
              disabled={shareState === "busy"}
              title="Share the receipt image via WhatsApp"
              className="rounded-full bg-[#25D366] px-4 py-2 text-xs font-bold text-white hover:bg-[#1da851] disabled:opacity-50 transition inline-flex items-center gap-1.5 shadow-sm"
            >
              {shareState === "busy" ? "Preparing…" : "💬 WhatsApp Share"}
            </button>
            <button
              onClick={downloadReceiptPdf}
              disabled={downloadPdfState === "busy"}
              className="rounded-full bg-forest px-4 py-2 text-xs font-bold text-white hover:bg-leaf disabled:opacity-50 transition"
            >
              {downloadPdfState === "busy" ? "Generating..." : "📄 Download PDF"}
            </button>
            <button
              onClick={downloadReceiptPng}
              disabled={downloadPngState === "busy"}
              className="rounded-full bg-mint px-4 py-2 text-xs font-bold text-forest hover:bg-leaf hover:text-white disabled:opacity-50 transition"
            >
              {downloadPngState === "busy" ? "Generating..." : "🖼️ Download PNG"}
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-bold text-forest">Business name<input value={merchant} onChange={(e) => setMerchant(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">UPI ID<input value={upiId} onChange={(e) => setUpiId(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Received from<input value={customer} onChange={(e) => setCustomer(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Customer phone (optional)<input type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="98765 43210" className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Receipt number<input value={receiptNo} onChange={(e) => setReceiptNo(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Receipt date<input type="date" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Payment mode<select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as (typeof paymentModes)[number])} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf">{paymentModes.map((mode) => <option key={mode} value={mode}>{mode}</option>)}</select></label>
          <label className="text-sm font-bold text-forest">Reference / UTR number<input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} placeholder="UPI transaction ID or cheque no." className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Received by<input value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
        </div>

        <div className="mt-6 space-y-3">
          <div className="flex items-center justify-between"><h3 className="font-black text-forest">Amount breakdown</h3><button onClick={addItem} className="text-sm font-bold text-leaf">+ Add entry</button></div>
          {items.map((item) => (
            <div key={item.id} className="grid gap-2 rounded-2xl bg-cream p-3 sm:grid-cols-[1fr_72px_100px_28px]">
              <input aria-label="Entry description" value={item.name} onChange={(e) => updateItem(item.id, "name", e.target.value)} className="rounded-xl border border-forest/10 px-3 py-2" />
              <input aria-label="Quantity" type="number" value={item.qty} onChange={(e) => updateItem(item.id, "qty", e.target.value)} className="rounded-xl border border-forest/10 px-3 py-2" />
              <input aria-label="Price" type="number" value={item.price} onChange={(e) => updateItem(item.id, "price", e.target.value)} className="rounded-xl border border-forest/10 px-3 py-2" />
              <button onClick={() => removeItem(item.id)} className="rounded-xl bg-white text-forest/60 hover:text-red-600" aria-label="Remove entry">×</button>
            </div>
          ))}
        </div>

        <label className="mt-5 block text-sm font-bold text-forest">Receipt notes<textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
        {!isValidUpiId(upiId) && <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">Enter a real UPI ID so future customers can scan and pay against this receipt.</p>}
      </div>

      <article ref={receiptRef} className="invoice-paper mx-auto w-full max-w-[820px] rounded-[2rem] border border-forest/10 bg-white p-6 shadow-[0_24px_80px_rgba(17,59,44,0.12)] md:p-9">
        <header className="flex flex-col gap-5 border-b-2 border-forest pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-leaf">Payment receipt</p>
            <h2 className="mt-2 text-3xl font-black text-forest">{merchant || "Your Business"}</h2>
            <p className="mt-2 text-sm font-semibold text-forest/65">UPI: {upiId || "yourname@upi"}</p>
          </div>
          <div className="relative rounded-2xl bg-mint p-4 text-right">
            <span className="absolute -right-2 -top-3 rotate-12 rounded-lg border-2 border-leaf bg-white px-3 py-1 text-sm font-black uppercase tracking-widest text-leaf shadow-sm">Paid</span>
            <p className="text-sm font-black text-forest">{receiptNo}</p>
            <p className="mt-1 text-xs font-semibold text-forest/65">Date: {receiptDate}</p>
            <p className="text-xs font-semibold text-forest/65">Mode: {paymentMode}</p>
          </div>
        </header>

        <section className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl bg-cream p-4">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-forest/50">Received from</p>
            <p className="mt-2 text-lg font-black text-forest">{customer || "Customer"}</p>
            {customerPhone && <p className="text-sm font-semibold text-forest/65">{customerPhone}</p>}
          </div>
          <div className="rounded-2xl bg-forest p-4 text-white"><p className="text-xs font-black uppercase tracking-[0.18em] text-white/60">Amount received</p><p className="mt-2 text-3xl font-black">{money(totals.subtotal)}</p></div>
        </section>

        <div className="mt-6 overflow-hidden rounded-2xl border border-forest/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-mint text-xs uppercase tracking-[0.14em] text-forest/70"><tr><th className="p-3">Description</th><th className="p-3 text-right">Qty</th><th className="p-3 text-right">Rate</th><th className="p-3 text-right">Amount</th></tr></thead>
            <tbody>{items.map((item) => { const amount = (Number(item.qty) || 0) * (Number(item.price) || 0); return <tr key={item.id} className="border-t border-forest/10"><td className="p-3 font-semibold text-forest">{item.name}</td><td className="p-3 text-right">{item.qty}</td><td className="p-3 text-right">{money(Number(item.price) || 0)}</td><td className="p-3 text-right font-bold">{money(amount)}</td></tr>; })}</tbody>
          </table>
        </div>

        <section className="mt-6 grid gap-6 sm:grid-cols-[1fr_260px]">
          <div className="space-y-3 text-sm">
            <div className="flex justify-between rounded-2xl bg-cream p-3"><span className="font-bold text-forest">Total received</span><strong>{money(totals.subtotal)}</strong></div>
            <div className="flex justify-between rounded-2xl bg-cream p-3"><span className="font-bold text-forest">Payment mode</span><strong>{paymentMode}</strong></div>
            {referenceNo && <div className="flex justify-between rounded-2xl bg-cream p-3"><span className="font-bold text-forest">Reference / UTR</span><strong className="break-all text-right">{referenceNo}</strong></div>}
            <div className="flex justify-between rounded-2xl border-2 border-dashed border-leaf/40 bg-mint/40 p-3"><span className="font-black uppercase tracking-wide text-leaf">Status</span><strong className="font-black uppercase tracking-wide text-leaf">Fully Paid ✓</strong></div>
          </div>
          <div className="rounded-2xl border border-dashed border-forest/20 p-4">
            <p className="text-sm font-black text-forest">Pay next time via UPI</p>
            <div className="mt-3 flex flex-col items-center gap-3">{qrDataUrl && <img src={qrDataUrl} alt="UPI QR for future payments" className="h-32 w-32 rounded-xl border border-forest/10" />}<p className="text-center text-sm leading-6 text-forest/70">Scan with any UPI app to pay {merchant || "us"} instantly next time.</p></div>
          </div>
        </section>

        <footer className="mt-6 flex flex-col justify-between gap-4 rounded-2xl bg-cream p-4 text-sm leading-6 text-forest/70 sm:flex-row sm:items-end">
          <div className="max-w-md"><strong className="text-forest">Notes:</strong> {notes}</div>
          <div className="text-center">
            <p className="border-t border-forest/30 pt-2 font-bold text-forest">{receivedBy}</p>
            <p className="text-xs text-forest/55">Authorised signatory</p>
          </div>
        </footer>
      </article>
    </div>
  );
}
