import { useEffect, useMemo, useRef, useState } from "react";
import { safeToPng, downloadDataUrl, notifyExportError } from "../lib/export-image";
import { trackProductEvent } from "../lib/productEvents";

const draftKey = "proupiqr-debitnote-draft";
const EXPORT_TIMEOUT_MS = 20000;

function withTimeout<T>(promise: Promise<T>, label: string) { return new Promise<T>((resolve, reject) => { const t = setTimeout(() => reject(new Error(`${label} timed out`)), EXPORT_TIMEOUT_MS); promise.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); }); }); }
function money(v: number) { return `₹${new Intl.NumberFormat("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v || 0)}`; }

interface DnItem { id: number; name: string; qty: string; rate: string; gst: string }
let _id = 1; function nid() { return _id++; }

export function DebitNoteGenerator() {
  const today = new Date().toISOString().slice(0, 10);
  const [supplierName, setSupplierName] = useState(""); const [supplierGstin, setSupplierGstin] = useState("");
  const [supplierAddress, setSupplierAddress] = useState("");
  const [buyerName, setBuyerName] = useState(""); const [buyerGstin, setBuyerGstin] = useState("");
  const [buyerAddress, setBuyerAddress] = useState("");
  const [dnNo, setDnNo] = useState("DN-001"); const [dnDate, setDnDate] = useState(today);
  const [origInvoice, setOrigInvoice] = useState("INV-0042"); const [origDate, setOrigDate] = useState("");
  const [reason, setReason] = useState("Original invoice understated the value of supply");
  const [note, setNote] = useState("");
  const [items, setItems] = useState<DnItem[]>([{ id: nid(), name: "Additional charge: delivery", qty: "1", rate: "1200", gst: "18" }]);
  const paperRef = useRef<HTMLDivElement | null>(null);
  const [pdfState, setPdfState] = useState<"idle" | "busy" | "error">("idle");
  const [pngState, setPngState] = useState<"idle" | "busy" | "error">("idle");

  useEffect(() => { try { const d = JSON.parse(localStorage.getItem(draftKey) || "{}"); setSupplierName(d.supplierName ?? ""); setSupplierGstin(d.supplierGstin ?? ""); setSupplierAddress(d.supplierAddress ?? ""); setBuyerName(d.buyerName ?? ""); setBuyerGstin(d.buyerGstin ?? ""); setBuyerAddress(d.buyerAddress ?? ""); setDnNo(d.dnNo ?? "DN-001"); setDnDate(d.dnDate ?? today); setOrigInvoice(d.origInvoice ?? "INV-0042"); setOrigDate(d.origDate ?? ""); setReason(d.reason ?? "Original invoice understated the value of supply"); setNote(d.note ?? ""); if (d.items) setItems(d.items); } catch {} }, []);
  useEffect(() => { localStorage.setItem(draftKey, JSON.stringify({ supplierName, supplierGstin, supplierAddress, buyerName, buyerGstin, buyerAddress, dnNo, dnDate, origInvoice, origDate, reason, note, items })); }, [supplierName, supplierGstin, supplierAddress, buyerName, buyerGstin, buyerAddress, dnNo, dnDate, origInvoice, origDate, reason, note, items]);

  const missingRef = !origInvoice.trim();

  const calc = useMemo(() => { let s = 0, t = 0; items.forEach(i => { const q = Math.max(0, Number(i.qty) || 0); const r = Math.max(0, Number(i.rate) || 0); const g = Math.max(0, Number(i.gst) || 0); const ln = q * r; s += ln; t += ln * g / 100; }); return { subtotal: s, tax: t, total: s + t }; }, [items]);

  function addItem() { setItems([...items, { id: nid(), name: "", qty: "1", rate: "", gst: "18" }]); }
  function removeItem(id: number) { if (items.length < 2) return; setItems(items.filter(i => i.id !== id)); }
  function upd(id: number, f: keyof DnItem, v: string) { setItems(items.map(i => i.id === id ? { ...i, [f]: v } : i)); }

  async function renderPaper() {
    const el = paperRef.current; if (!el) throw new Error("Not ready");
    const clone = el.cloneNode(true) as HTMLDivElement;
    Object.assign(clone.style, { position: "fixed", left: "0", top: "0", zIndex: "-9999", opacity: "0", pointerEvents: "none", width: "800px", minWidth: "800px", maxWidth: "800px", padding: "36px", boxSizing: "border-box", height: "auto" });
    document.body.appendChild(clone); await new Promise(r => setTimeout(r, 250)); const h = clone.offsetHeight || 900;
    try { return await safeToPng(clone, { cacheBust: true, pixelRatio: 2, width: 800, height: h, style: { opacity: "1", width: "800px", height: `${h}px`, maxWidth: "800px", maxHeight: `${h}px`, minWidth: "800px", minHeight: `${h}px`, padding: "36px", boxSizing: "border-box", backgroundColor: "#fff" } }); }
    finally { document.body.removeChild(clone); }
  }

  async function downloadPdf() { try { setPdfState("busy"); const [{ jsPDF }, du] = await Promise.all([withTimeout(import("jspdf"), "PDF"), renderPaper()]); const px = 0.2646; const w = 800 * px; const h = (paperRef.current?.offsetHeight || 900) * px; const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: [w, h] }); pdf.addImage(du, "PNG", 0, 0, w, h); pdf.save("debit-note.pdf"); trackProductEvent("export_pdf", "debit-note"); setPdfState("idle"); } catch (e) { console.error(e); notifyExportError("PDF failed"); setPdfState("error"); } }
  async function downloadPng() { try { setPngState("busy"); const du = await renderPaper(); downloadDataUrl(du, "debit-note.png"); trackProductEvent("export_png", "debit-note"); setPngState("idle"); } catch (e) { console.error(e); notifyExportError("PNG failed"); setPngState("error"); } }

  return (<div className="grid gap-8 lg:grid-cols-[0.92fr_1.08fr]">
    <div className="no-print rounded-[2rem] border border-white/75 bg-white/90 p-5 shadow-[0_18px_48px_rgba(17,59,44,0.08)]">
      <div className="flex flex-wrap gap-3 sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-leaf">GST debit note</p><h2 className="mt-1 text-2xl font-black text-forest">Debit Note (Section 34)</h2></div><div className="flex flex-wrap gap-2"><button onClick={downloadPng} disabled={pngState === "busy"} className="rounded-full border border-forest/15 px-4 py-2 text-xs font-bold text-forest hover:border-leaf transition">{pngState === "busy" ? "..." : "Export PNG"}</button><button onClick={downloadPdf} disabled={pdfState === "busy"} className="rounded-full bg-forest px-4 py-2 text-xs font-bold text-white hover:bg-leaf disabled:opacity-50 transition">{pdfState === "busy" ? "..." : "Export PDF"}</button></div></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-bold text-forest">Supplier (your business)<input value={supplierName} onChange={e => setSupplierName(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
        <label className="text-sm font-bold text-forest">Your GSTIN<input value={supplierGstin} onChange={e => setSupplierGstin(e.target.value)} placeholder="22AAAAA0000A1Z5" className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
        <label className="text-sm font-bold text-forest sm:col-span-2">Your address<input value={supplierAddress} onChange={e => setSupplierAddress(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
        <label className="text-sm font-bold text-forest">Buyer name<input value={buyerName} onChange={e => setBuyerName(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
        <label className="text-sm font-bold text-forest">Buyer GSTIN<input value={buyerGstin} onChange={e => setBuyerGstin(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
        <label className="text-sm font-bold text-forest sm:col-span-2">Buyer address<input value={buyerAddress} onChange={e => setBuyerAddress(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
        <label className="text-sm font-bold text-forest">Debit note number<input value={dnNo} onChange={e => setDnNo(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
        <label className="text-sm font-bold text-forest">Date<input type="date" value={dnDate} onChange={e => setDnDate(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
        <label className={`text-sm font-bold ${missingRef ? "text-red-600" : "text-forest"}`}>Original invoice ref<input value={origInvoice} onChange={e => setOrigInvoice(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
        <label className="text-sm font-bold text-forest">Original invoice date<input type="date" value={origDate} onChange={e => setOrigDate(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
        <label className="text-sm font-bold text-forest sm:col-span-2">Reason for debit note<textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
        <label className="text-sm font-bold text-forest sm:col-span-2">Additional note<textarea value={note} onChange={e => setNote(e.target.value)} rows={2} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
      </div>
      {missingRef && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-700">A debit note must reference the original tax invoice number as required by Section 34 of the CGST Act.</p>}
      <div className="mt-5"><div className="flex items-center justify-between mb-2"><h3 className="text-xs font-black text-forest uppercase">Additional charges</h3><button onClick={addItem} className="text-[11px] font-bold text-leaf hover:text-forest">+ Add row</button></div>
        {items.map((it, idx) => (<div key={it.id} className="mb-2 grid grid-cols-5 gap-1.5 rounded-xl bg-cream/60 p-2">
          <input value={it.name} onChange={e => upd(it.id, "name", e.target.value)} placeholder="Item" className="col-span-2 rounded-lg border border-forest/10 bg-white px-2 py-1.5 text-xs font-medium outline-none focus:border-leaf" />
          <input value={it.qty} onChange={e => upd(it.id, "qty", e.target.value)} placeholder="Qty" className="rounded-lg border border-forest/10 bg-white px-2 py-1.5 text-xs font-medium outline-none focus:border-leaf" />
          <input value={it.rate} onChange={e => upd(it.id, "rate", e.target.value)} placeholder="Rate" className="rounded-lg border border-forest/10 bg-white px-2 py-1.5 text-xs font-medium outline-none focus:border-leaf" />
          <div className="flex items-center gap-1"><input value={it.gst} onChange={e => upd(it.id, "gst", e.target.value)} placeholder="GST%" className="w-full rounded-lg border border-forest/10 bg-white px-2 py-1.5 text-xs font-medium outline-none focus:border-leaf" />{items.length > 1 && <button onClick={() => removeItem(it.id)} className="text-red-500 text-xs font-bold">×</button>}</div>
        </div>))}
      </div>
    </div>
    <article ref={paperRef} className="invoice-paper mx-auto h-fit w-full max-w-[780px] rounded-[2rem] border border-forest/10 bg-white p-6 shadow-[0_24px_80px_rgba(17,59,44,0.12)] md:p-8">
      <header className="flex items-start justify-between border-b-2 border-forest pb-4">
        <div><p className="text-xs font-black uppercase tracking-[0.24em] text-leaf">Debit Note</p><h2 className="mt-2 text-2xl font-black text-forest">{dnNo}</h2><p className="text-xs font-semibold text-forest/60">Date: {dnDate}</p></div>
        <div className="text-right"><span className="rounded-lg border-2 border-amber-500 bg-white px-3 py-1 text-xs font-black uppercase tracking-widest text-amber-600">Section 34</span></div>
      </header>
      <section className="mt-4 grid grid-cols-2 gap-4 text-xs leading-6">
        <div><p className="font-black text-forest">Supplier</p><p className="font-semibold">{supplierName || "—"}</p>{supplierGstin && <p className="text-forest/60">GSTIN: {supplierGstin}</p>}<p className="text-forest/60">{supplierAddress}</p></div>
        <div className="text-right"><p className="font-black text-forest">Buyer</p><p className="font-semibold">{buyerName || "—"}</p>{buyerGstin && <p className="text-forest/60">GSTIN: {buyerGstin}</p>}<p className="text-forest/60">{buyerAddress}</p></div>
      </section>
      <div className="mt-4 rounded-xl bg-amber-50 p-3 text-xs space-y-1">
        <p><span className="font-black">Original invoice:</span> {origInvoice || "—"}{origDate ? ` (${origDate})` : ""}</p>
        {reason && <p className="text-forest/70">{reason}</p>}
      </div>
      <div className="mt-5 overflow-x-auto"><table className="w-full text-xs">
        <thead><tr className="border-b-2 border-forest text-left"><th className="py-2 font-black">#</th><th className="py-2 font-black">Description</th><th className="py-2 text-right font-black">Qty</th><th className="py-2 text-right font-black">Rate</th><th className="py-2 text-right font-black">GST%</th><th className="py-2 text-right font-black">Amount</th></tr></thead>
        <tbody>{items.map((it, idx) => { const ln = (Math.max(0, Number(it.qty) || 0)) * (Math.max(0, Number(it.rate) || 0)); return (<tr key={it.id} className="border-b border-forest/10"><td className="py-1.5">{idx + 1}</td><td className="py-1.5 font-semibold">{it.name || "—"}</td><td className="py-1.5 text-right">{it.qty}</td><td className="py-1.5 text-right">{money(Number(it.rate) || 0)}</td><td className="py-1.5 text-right">{it.gst}%</td><td className="py-1.5 text-right font-bold text-amber-700">{money(ln)}</td></tr>); })}</tbody>
      </table></div>
      <div className="mt-3 ml-auto w-60 space-y-1 text-xs">
        <div className="flex justify-between"><span className="font-semibold">Additional taxable</span><strong>{money(calc.subtotal)}</strong></div>
        <div className="flex justify-between"><span className="font-semibold">Additional GST</span><strong className="text-amber-700">{money(calc.tax)}</strong></div>
        <div className="flex justify-between border-t-2 border-forest pt-1 text-sm"><span className="font-black">Total increase</span><strong className="font-black text-amber-700">{money(calc.total)}</strong></div>
      </div>
      {note && <p className="mt-3 text-[10px] leading-relaxed text-forest/60 border-t border-forest/10 pt-3">{note}</p>}
      <footer className="mt-4 pt-3 border-t border-forest/10 text-[10px] text-forest/60 space-y-1">
        <p><strong>Section 34, CGST Act:</strong> Where a tax invoice has been issued and the taxable value or tax charged is less than what should have been charged, the supplier shall issue a debit note. Both parties must adjust their returns accordingly.</p>
        <p>Prepared using Pro UPI QR. Not a substitute for professional tax advice.</p>
      </footer>
    </article>
  </div>);
}