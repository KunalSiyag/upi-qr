import { useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";

type CreditItem = { id: number; name: string; qty: string; rate: string; gst: string };

const draftKey = "proupiqr-credit-note-draft";
const EXPORT_TIMEOUT_MS = 20000;

const reasons = [
  "Sales return",
  "Post-sale discount",
  "Wrong billing corrected",
  "Rate difference adjusted",
  "Short supply / deficiency",
  "Other (specify in notes)"
] as const;

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

const today = new Date().toISOString().slice(0, 10);

const initialItems: CreditItem[] = [
  { id: 1, name: "Wooden dining chair", qty: "2", rate: "4500", gst: "18" }
];

export function CreditNoteGenerator() {
  const [supplierName, setSupplierName] = useState("ABC Furniture Works");
  const [supplierGstin, setSupplierGstin] = useState("29ABCDE1234F1Z5");
  const [supplierAddress, setSupplierAddress] = useState("12 Industrial Area, Bengaluru 560001");
  const [recipientName, setRecipientName] = useState("Client Name");
  const [recipientGstin, setRecipientGstin] = useState("");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [noteNo, setNoteNo] = useState("CN-0001");
  const [noteDate, setNoteDate] = useState(today);
  const [origInvoiceNo, setOrigInvoiceNo] = useState("");
  const [origInvoiceDate, setOrigInvoiceDate] = useState("");
  const [reason, setReason] = useState<(typeof reasons)[number]>("Sales return");
  const [supplyType, setSupplyType] = useState<"intra" | "inter">("intra");
  const [items, setItems] = useState<CreditItem[]>(initialItems);
  const [notes, setNotes] = useState("");
  const [signatory, setSignatory] = useState("Authorised Signatory");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (!saved) return;
      const d = JSON.parse(saved);
      setSupplierName(d.supplierName ?? "ABC Furniture Works");
      setSupplierGstin(d.supplierGstin ?? "");
      setSupplierAddress(d.supplierAddress ?? "");
      setRecipientName(d.recipientName ?? "Client Name");
      setRecipientGstin(d.recipientGstin ?? "");
      setRecipientAddress(d.recipientAddress ?? "");
      setNoteNo(d.noteNo ?? "CN-0001");
      setNoteDate(d.noteDate ?? today);
      setReason(reasons.includes(d.reason) ? d.reason : "Sales return");
      setSupplyType(d.supplyType === "inter" ? "inter" : "intra");
      if (Array.isArray(d.items) && d.items.length) setItems(d.items);
      setNotes(d.notes ?? "");
      setSignatory(d.signatory ?? "Authorised Signatory");
    } catch {
      // Ignore broken local drafts.
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(draftKey, JSON.stringify({ supplierName, supplierGstin, supplierAddress, recipientName, recipientGstin, recipientAddress, noteNo, noteDate, reason, supplyType, items, notes, signatory }));
  }, [supplierName, supplierGstin, supplierAddress, recipientName, recipientGstin, recipientAddress, noteNo, noteDate, reason, supplyType, items, notes, signatory]);

  const totals = useMemo(() => {
    let taxableTotal = 0;
    let taxTotal = 0;
    for (const item of items) {
      const taxable = (Number(item.qty) || 0) * (Number(item.rate) || 0);
      const tax = taxable * (Number(item.gst) || 0) / 100;
      taxableTotal += taxable;
      taxTotal += tax;
    }
    return { taxableTotal, taxTotal, grandTotal: taxableTotal + taxTotal };
  }, [items]);

  const paperRef = useRef<HTMLDivElement | null>(null);
  const [pdfState, setPdfState] = useState<"idle" | "busy" | "error">("idle");
  const [pngState, setPngState] = useState<"idle" | "busy" | "error">("idle");

  const updateItem = (id: number, field: keyof CreditItem, value: string) => {
    setItems((cur) => cur.map((item) => item.id === id ? { ...item, [field]: value } : item));
  };

  const addItem = () => setItems((cur) => [...cur, { id: Date.now(), name: "Returned / adjusted item", qty: "1", rate: "0", gst: "18" }]);
  const removeItem = (id: number) => setItems((cur) => cur.length > 1 ? cur.filter((item) => item.id !== id) : cur);

  function fileName() {
    return (noteNo || "credit-note").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  async function renderPaper() {
    const el = paperRef.current;
    if (!el) throw new Error("Preview not ready");
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
      return await withTimeout(toPng(clone, {
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
      }), "Credit note render");
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
      pdf.save(`${fileName()}.pdf`);
      setPdfState("idle");
    } catch (err) {
      console.error("PDF failed:", err);
      setPdfState("error");
    }
  }

  async function downloadPng() {
    try {
      setPngState("busy");
      const link = document.createElement("a");
      link.href = await renderPaper();
      link.download = `${fileName()}.png`;
      link.click();
      setPngState("idle");
    } catch (err) {
      console.error("PNG failed:", err);
      setPngState("error");
    }
  }

  async function shareOnWhatsapp() {
    try {
      const message = `*Credit Note ${noteNo} from ${supplierName || "Supplier"}*\n` +
        `----------------------------\n` +
        `*Against Invoice:* ${origInvoiceNo || "—"} dated ${origInvoiceDate || "—"}\n` +
        `*Reason:* ${reason}\n` +
        `*Credit Value:* ${money(totals.grandTotal)}\n\n` +
        `Generated free via Pro UPI QR (https://www.proupiqr.in)`;
      let shared = false;
      if (navigator.share && navigator.canShare) {
        try {
          const dataUrl = await renderPaper();
          const blob = await (await fetch(dataUrl)).blob();
          const file = new File([blob], `${fileName()}.png`, { type: "image/png" });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: `Credit Note ${noteNo}`, text: message });
            shared = true;
          }
        } catch (err) {
          if ((err as DOMException)?.name === "AbortError") return;
          console.warn("Native share unavailable.", err);
        }
      }
      if (!shared) {
        const link = document.createElement("a");
        link.href = await renderPaper();
        link.download = `${fileName()}.png`;
        link.click();
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`, "_blank");
      }
    } catch (err) {
      console.error("Share failed:", err);
    }
  }

  const missingInvoiceRef = !origInvoiceNo.trim();

  return (
    <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
      <div className="no-print rounded-[2rem] border border-white/75 bg-white/90 p-5 shadow-[0_18px_48px_rgba(17,59,44,0.08)]">
        <div className="flex flex-wrap gap-3 sm:justify-between">
          <div className="border-b border-forest/5 pb-4 sm:w-auto sm:flex-1">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-leaf">GST credit note</p>
            <h2 className="mt-1 text-2xl font-black text-forest">Adjust A Taxed Sale</h2>
          </div>
          <div className="flex flex-wrap gap-2 pb-4">
            <button onClick={shareOnWhatsapp} className="rounded-full bg-[#25D366] px-4 py-2 text-xs font-bold text-white hover:bg-[#1da851] transition">💬 Share</button>
            <button onClick={downloadPdf} disabled={pdfState === "busy"} className="rounded-full bg-forest px-4 py-2 text-xs font-bold text-white hover:bg-leaf disabled:opacity-50 transition">{pdfState === "busy" ? "Generating..." : "📄 PDF"}</button>
            <button onClick={downloadPng} disabled={pngState === "busy"} className="rounded-full bg-mint px-4 py-2 text-xs font-bold text-forest hover:bg-leaf hover:text-white disabled:opacity-50 transition">{pngState === "busy" ? "Generating..." : "🖼️ PNG"}</button>
          </div>
        </div>

        <p className="mt-3 rounded-2xl bg-mint px-4 py-2.5 text-xs leading-5 font-semibold text-forest/75">Under Section 34 of the CGST Act, a credit note must reference the original tax invoice and be reported in GSTR-1. Confirm filing timelines with your CA.</p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-bold text-forest">Your business<input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Your GSTIN<input value={supplierGstin} onChange={(e) => setSupplierGstin(e.target.value.toUpperCase())} maxLength={15} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium uppercase outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest sm:col-span-2">Your address<input value={supplierAddress} onChange={(e) => setSupplierAddress(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Customer<input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Customer GSTIN (B2B)<input value={recipientGstin} onChange={(e) => setRecipientGstin(e.target.value.toUpperCase())} maxLength={15} placeholder="Leave blank for B2C" className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium uppercase outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Credit note number<input value={noteNo} onChange={(e) => setNoteNo(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Credit note date<input type="date" value={noteDate} onChange={(e) => setNoteDate(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className={`text-sm font-bold ${missingInvoiceRef ? "text-red-600" : "text-forest"}`}>Original invoice number{missingInvoiceRef && " — required"}<input value={origInvoiceNo} onChange={(e) => setOrigInvoiceNo(e.target.value)} placeholder="INV-0042" className={`mt-2 w-full rounded-2xl border bg-cream px-4 py-3 font-medium outline-none ${missingInvoiceRef ? "border-red-300 focus:border-red-500" : "border-forest/10 focus:border-leaf"}`} /></label>
          <label className="text-sm font-bold text-forest">Original invoice date<input type="date" value={origInvoiceDate} onChange={(e) => setOrigInvoiceDate(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Reason for credit<select value={reason} onChange={(e) => setReason(e.target.value as (typeof reasons)[number])} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf">{reasons.map((r) => <option key={r}>{r}</option>)}</select></label>
          <div className="text-sm font-bold text-forest">
            Supply type
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => setSupplyType("intra")} aria-pressed={supplyType === "intra"} className={`flex-1 rounded-xl border px-3 py-2.5 text-xs font-bold transition ${supplyType === "intra" ? "border-leaf bg-leaf text-white" : "border-forest/15 bg-cream text-forest"}`}>Intra-state<br /><span className="font-normal opacity-80">CGST + SGST</span></button>
              <button type="button" onClick={() => setSupplyType("inter")} aria-pressed={supplyType === "inter"} className={`flex-1 rounded-xl border px-3 py-2.5 text-xs font-bold transition ${supplyType === "inter" ? "border-leaf bg-leaf text-white" : "border-forest/15 bg-cream text-forest"}`}>Inter-state<br /><span className="font-normal opacity-80">IGST</span></button>
            </div>
          </div>
          <label className="text-sm font-bold text-forest sm:col-span-2">Signed off as<input value={signatory} onChange={(e) => setSignatory(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
        </div>

        <div className="mt-6 space-y-3">
          <div className="flex items-center justify-between"><h3 className="font-black text-forest">Items being credited</h3><button onClick={addItem} className="text-sm font-bold text-leaf">+ Add item</button></div>
          {items.map((item) => (
            <div key={item.id} className="grid gap-2 rounded-2xl bg-cream p-3 sm:grid-cols-[1fr_64px_88px_64px_28px]">
              <input aria-label="Item description" value={item.name} onChange={(e) => updateItem(item.id, "name", e.target.value)} className="rounded-xl border border-forest/10 px-3 py-2" />
              <input aria-label="Quantity" type="number" value={item.qty} onChange={(e) => updateItem(item.id, "qty", e.target.value)} className="rounded-xl border border-forest/10 px-3 py-2" />
              <input aria-label="Rate" type="number" value={item.rate} onChange={(e) => updateItem(item.id, "rate", e.target.value)} className="rounded-xl border border-forest/10 px-3 py-2" />
              <input aria-label="GST percent" type="number" value={item.gst} onChange={(e) => updateItem(item.id, "gst", e.target.value)} className="rounded-xl border border-forest/10 px-3 py-2" />
              <button onClick={() => removeItem(item.id)} className="rounded-xl bg-white text-forest/60 hover:text-red-600" aria-label="Remove item">×</button>
            </div>
          ))}
          <p className="text-[11px] font-semibold text-forest/50">Columns: description · qty · rate ₹ · GST %</p>
        </div>

        <label className="mt-4 block text-sm font-bold text-forest">Notes<textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Extra details for the reason above…" className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
      </div>

      <article ref={paperRef} className="invoice-paper mx-auto h-fit w-full max-w-[820px] rounded-[2rem] border border-forest/10 bg-white p-6 shadow-[0_24px_80px_rgba(17,59,44,0.12)] md:p-9">
        <header className="flex flex-col gap-5 border-b-2 border-forest pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-leaf">Credit note (GST)</p>
            <h2 className="mt-2 text-3xl font-black text-forest">{supplierName || "Your Business"}</h2>
            {supplierGstin && <p className="mt-1 text-sm font-semibold text-forest/65">GSTIN: {supplierGstin}</p>}
            <p className="text-sm font-semibold text-forest/65">{supplierAddress}</p>
          </div>
          <div className="rounded-2xl bg-sun/40 p-4 text-right">
            <p className="text-sm font-black text-forest">{noteNo}</p>
            <p className="mt-1 text-xs font-semibold text-forest/65">Date: {noteDate}</p>
            <p className="text-xs font-semibold text-forest/65">Reason: {reason}</p>
          </div>
        </header>

        <section className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl bg-cream p-4">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-forest/50">Credited to</p>
            <p className="mt-1 text-lg font-black text-forest">{recipientName || "Customer"}</p>
            {recipientGstin && <p className="text-xs font-semibold text-forest/65">GSTIN: {recipientGstin}</p>}
            {recipientAddress && <p className="text-xs font-semibold text-forest/65">{recipientAddress}</p>}
          </div>
          <div className={`rounded-2xl p-4 ${missingInvoiceRef ? "border-2 border-dashed border-red-300 bg-red-50" : "bg-cream"}`}>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-forest/50">Original invoice</p>
            <p className={`mt-1 text-lg font-black ${missingInvoiceRef ? "text-red-600" : "text-forest"}`}>{missingInvoiceRef ? "Reference required" : origInvoiceNo}</p>
            {origInvoiceDate && <p className="text-xs font-semibold text-forest/65">Dated: {origInvoiceDate}</p>}
            {missingInvoiceRef && <p className="mt-1 text-[11px] font-semibold leading-4 text-red-600">A credit note must reference the original tax invoice number under Section 34(1).</p>}
          </div>
        </section>

        <div className="mt-5 overflow-hidden rounded-2xl border border-forest/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-mint text-xs uppercase tracking-[0.14em] text-forest/70"><tr><th className="p-3">Description</th><th className="p-3 text-right">Qty</th><th className="p-3 text-right">Rate</th><th className="p-3 text-right">GST %</th><th className="p-3 text-right">Taxable</th></tr></thead>
            <tbody>{items.map((item) => { const taxable = (Number(item.qty) || 0) * (Number(item.rate) || 0); return <tr key={item.id} className="border-t border-forest/10"><td className="p-3 font-semibold text-forest">{item.name}</td><td className="p-3 text-right">{item.qty}</td><td className="p-3 text-right">{money(Number(item.rate) || 0)}</td><td className="p-3 text-right">{Number(item.gst) || 0}%</td><td className="p-3 text-right font-bold tabular-nums">{money(taxable)}</td></tr>; })}</tbody>
          </table>
        </div>

        <section className="mt-5 space-y-2 text-sm">
          <div className="flex justify-between"><span>Total taxable value reduced</span><strong>{money(totals.taxableTotal)}</strong></div>
          {supplyType === "intra" ? (
            <>
              <div className="flex justify-between"><span>CGST reduced</span><strong>{money(totals.taxTotal / 2)}</strong></div>
              <div className="flex justify-between"><span>SGST reduced</span><strong>{money(totals.taxTotal / 2)}</strong></div>
            </>
          ) : (
            <div className="flex justify-between"><span>IGST reduced</span><strong>{money(totals.taxTotal)}</strong></div>
          )}
          <div className="mt-2 flex justify-between border-t-2 border-forest pt-3 text-lg text-forest"><span className="font-black">Total credit value</span><strong>{money(totals.grandTotal)}</strong></div>
        </section>

        <footer className="mt-6 flex flex-col justify-between gap-4 rounded-2xl bg-cream p-4 text-xs leading-5 text-forest/70 sm:flex-row sm:items-end">
          <div className="max-w-md">
            {notes ? <><strong className="text-forest">Notes:</strong> {notes}<br /></> : null}
            This credit note is issued under Section 34 of the CGST Act, 2017 against the invoice referenced above.
          </div>
          <div className="shrink-0 text-center">
            <p className="border-t border-forest/30 pt-2 font-bold text-forest">{signatory}</p>
            <p className="text-[10px] uppercase tracking-wide text-forest/50">for {supplierName || "Your Business"}</p>
          </div>
        </footer>
      </article>
    </div>
  );
}
