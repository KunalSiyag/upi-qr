import { useEffect, useMemo, useRef, useState } from "react";
import { safeToPng, downloadDataUrl, notifyExportError } from "../lib/export-image";
import { trackProductEvent } from "../lib/productEvents";

const draftKey = "proupiqr-bos-draft";
const EXPORT_TIMEOUT_MS = 20000;

function withTimeout<T>(promise: Promise<T>, label: string) { return new Promise<T>((resolve, reject) => { const t = setTimeout(() => reject(new Error(`${label} timed out`)), EXPORT_TIMEOUT_MS); promise.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); }); }); }
function money(v: number) { return `₹${new Intl.NumberFormat("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v || 0)}`; }

interface BosItem { id: number; name: string; qty: string; rate: string }
let _id = 1; function nid() { return _id++; }

export function BillOfSupplyGenerator() {
  const today = new Date().toISOString().slice(0, 10);
  const [supplierName, setSupplierName] = useState(""); const [supplierAddress, setSupplierAddress] = useState("");
  const [buyerName, setBuyerName] = useState(""); const [buyerGstin, setBuyerGstin] = useState("");
  const [buyerAddress, setBuyerAddress] = useState("");
  const [bosNo, setBosNo] = useState("BOS-001"); const [bosDate, setBosDate] = useState(today);
  const [isComposition, setIsComposition] = useState(true);
  const [items, setItems] = useState<BosItem[]>([{ id: nid(), name: "Stationery set", qty: "5", rate: "250" }]);
  const paperRef = useRef<HTMLDivElement | null>(null);
  const [pdfState, setPdfState] = useState<"idle" | "busy" | "error">("idle");

  useEffect(() => { try { const d = JSON.parse(localStorage.getItem(draftKey) || "{}"); setSupplierName(d.supplierName ?? ""); setSupplierAddress(d.supplierAddress ?? ""); setBuyerName(d.buyerName ?? ""); setBuyerGstin(d.buyerGstin ?? ""); setBuyerAddress(d.buyerAddress ?? ""); setBosNo(d.bosNo ?? "BOS-001"); setBosDate(d.bosDate ?? today); if (d.isComposition !== undefined) setIsComposition(d.isComposition); if (d.items) setItems(d.items); } catch {} }, []);
  useEffect(() => { localStorage.setItem(draftKey, JSON.stringify({ supplierName, supplierAddress, buyerName, buyerGstin, buyerAddress, bosNo, bosDate, isComposition, items })); }, [supplierName, supplierAddress, buyerName, buyerGstin, buyerAddress, bosNo, bosDate, isComposition, items]);

  const calc = useMemo(() => { let s = 0; items.forEach(i => s += (Math.max(0, Number(i.qty) || 0)) * (Math.max(0, Number(i.rate) || 0))); return { subtotal: s, total: s }; }, [items]);

  function addItem() { setItems([...items, { id: nid(), name: "", qty: "1", rate: "" }]); }
  function removeItem(id: number) { if (items.length < 2) return; setItems(items.filter(i => i.id !== id)); }
  function upd(id: number, f: keyof BosItem, v: string) { setItems(items.map(i => i.id === id ? { ...i, [f]: v } : i)); }

  async function renderPaper() {
    const el = paperRef.current; if (!el) throw new Error("Not ready");
    const clone = el.cloneNode(true) as HTMLDivElement;
    Object.assign(clone.style, { position: "fixed", left: "0", top: "0", zIndex: "-9999", opacity: "0", pointerEvents: "none", width: "800px", minWidth: "800px", maxWidth: "800px", padding: "36px", boxSizing: "border-box", height: "auto" });
    document.body.appendChild(clone); await new Promise(r => setTimeout(r, 250)); const h = clone.offsetHeight || 900;
    try { return await safeToPng(clone, { cacheBust: true, pixelRatio: 2, width: 800, height: h, style: { opacity: "1", width: "800px", height: `${h}px`, maxWidth: "800px", maxHeight: `${h}px`, minWidth: "800px", minHeight: `${h}px`, padding: "36px", boxSizing: "border-box", backgroundColor: "#fff" } }); }
    finally { document.body.removeChild(clone); }
  }

  async function downloadPdf() { try { setPdfState("busy"); const [{ jsPDF }, du] = await Promise.all([withTimeout(import("jspdf"), "PDF"), renderPaper()]); const px = 0.2646; const w = 800 * px; const h = (paperRef.current?.offsetHeight || 900) * px; const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: [w, h] }); pdf.addImage(du, "PNG", 0, 0, w, h); pdf.save("bill-of-supply.pdf"); trackProductEvent("export_pdf", "bill-of-supply"); setPdfState("idle"); } catch (e) { console.error(e); notifyExportError("PDF failed"); setPdfState("error"); } }

  return (<div className="grid gap-8 lg:grid-cols-[0.92fr_1.08fr]">
    <div className="no-print rounded-[2rem] border border-white/75 bg-white/90 p-5 shadow-[0_18px_48px_rgba(17,59,44,0.08)]">
      <div className="flex flex-wrap gap-3 sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-leaf">Bill of supply</p><h2 className="mt-1 text-2xl font-black text-forest">GST-exempt billing</h2></div><button onClick={downloadPdf} disabled={pdfState === "busy"} className="rounded-full bg-forest px-4 py-2 text-xs font-bold text-white hover:bg-leaf disabled:opacity-50 transition">{pdfState === "busy" ? "..." : "Export PDF"}</button></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-bold text-forest">Supplier (your business)<input value={supplierName} onChange={e => setSupplierName(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
        <label className="text-sm font-bold text-forest">Supplier address<input value={supplierAddress} onChange={e => setSupplierAddress(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
        <label className="text-sm font-bold text-forest">Buyer name<input value={buyerName} onChange={e => setBuyerName(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
        <label className="text-sm font-bold text-forest">Buyer GSTIN (if registered)<input value={buyerGstin} onChange={e => setBuyerGstin(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
        <label className="text-sm font-bold text-forest sm:col-span-2">Buyer address<input value={buyerAddress} onChange={e => setBuyerAddress(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
        <label className="text-sm font-bold text-forest">Bill number<input value={bosNo} onChange={e => setBosNo(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
        <label className="text-sm font-bold text-forest">Date<input type="date" value={bosDate} onChange={e => setBosDate(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
        <div className="sm:col-span-2 flex gap-2">
          {[[true, "Composition dealer"], [false, "Exempt supply"]].map(([val, label]) => (<button key={String(val)} onClick={() => setIsComposition(val as boolean)} className={`flex-1 rounded-xl border px-3 py-2.5 text-xs font-bold transition ${isComposition === val ? "border-leaf bg-leaf text-white" : "border-forest/15 bg-cream text-forest"}`}>{label}</button>))}
        </div>
      </div>
      <div className="mt-5"><div className="flex items-center justify-between mb-2"><h3 className="text-xs font-black text-forest uppercase">Items</h3><button onClick={addItem} className="text-[11px] font-bold text-leaf hover:text-forest">+ Add row</button></div>
        {items.map((it, idx) => (<div key={it.id} className="mb-2 grid grid-cols-4 gap-1.5 rounded-xl bg-cream/60 p-2">
          <input value={it.name} onChange={e => upd(it.id, "name", e.target.value)} placeholder="Item" className="col-span-2 rounded-lg border border-forest/10 bg-white px-2 py-1.5 text-xs font-medium outline-none focus:border-leaf" />
          <input value={it.qty} onChange={e => upd(it.id, "qty", e.target.value)} placeholder="Qty" className="rounded-lg border border-forest/10 bg-white px-2 py-1.5 text-xs font-medium outline-none focus:border-leaf" />
          <div className="flex items-center gap-1"><input value={it.rate} onChange={e => upd(it.id, "rate", e.target.value)} placeholder="Rate" className="w-full rounded-lg border border-forest/10 bg-white px-2 py-1.5 text-xs font-medium outline-none focus:border-leaf" />{items.length > 1 && <button onClick={() => removeItem(it.id)} className="text-red-500 text-xs font-bold">×</button>}</div>
        </div>))}
      </div>
    </div>
    <article ref={paperRef} className="invoice-paper mx-auto h-fit w-full max-w-[780px] rounded-[2rem] border border-forest/10 bg-white p-6 shadow-[0_24px_80px_rgba(17,59,44,0.12)] md:p-8">
      <header className="flex items-start justify-between border-b-2 border-forest pb-4">
        <div><p className="text-xs font-black uppercase tracking-[0.24em] text-leaf">Bill of Supply</p><h2 className="mt-2 text-2xl font-black text-forest">{bosNo}</h2><p className="text-xs font-semibold text-forest/60">Date: {bosDate}</p></div>
      </header>
      <section className="mt-4 grid grid-cols-2 gap-4 text-xs leading-6">
        <div><p className="font-black text-forest">Supplier</p><p className="font-semibold">{supplierName || "—"}</p><p className="text-forest/60">{supplierAddress}</p></div>
        <div className="text-right"><p className="font-black text-forest">Buyer</p><p className="font-semibold">{buyerName || "—"}</p>{buyerGstin && <p className="text-forest/60">GSTIN: {buyerGstin}</p>}<p className="text-forest/60">{buyerAddress}</p></div>
      </section>
      {isComposition && <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 p-3 text-[10px] font-bold text-amber-800">Composition taxable person — not eligible to collect tax. Tax on supplies is paid by the supplier under composition levy.</div>}
      {!isComposition && <div className="mt-3 rounded-xl bg-mint border border-leaf/20 p-3 text-[10px] font-bold text-forest">Exempt supply — no GST chargeable under notification.</div>}
      <div className="mt-5 overflow-x-auto"><table className="w-full text-xs">
        <thead><tr className="border-b-2 border-forest text-left"><th className="py-2 font-black">#</th><th className="py-2 font-black">Description</th><th className="py-2 text-right font-black">Qty</th><th className="py-2 text-right font-black">Rate</th><th className="py-2 text-right font-black">Amount</th></tr></thead>
        <tbody>{items.map((it, idx) => { const ln = (Math.max(0, Number(it.qty) || 0)) * (Math.max(0, Number(it.rate) || 0)); return (<tr key={it.id} className="border-b border-forest/10"><td className="py-1.5">{idx + 1}</td><td className="py-1.5 font-semibold">{it.name || "—"}</td><td className="py-1.5 text-right">{it.qty}</td><td className="py-1.5 text-right">{money(Number(it.rate) || 0)}</td><td className="py-1.5 text-right font-bold">{money(ln)}</td></tr>); })}</tbody>
      </table></div>
      <div className="mt-3 ml-auto w-60 space-y-1 text-xs">
        <div className="flex justify-between border-t-2 border-forest pt-1 text-sm"><span className="font-black">Total</span><strong className="font-black">{money(calc.total)}</strong></div>
        <div className="flex justify-between text-[10px] text-forest/60"><span>No GST charged</span></div>
      </div>
      <footer className="mt-6 pt-3 border-t border-forest/10 text-[10px] text-forest/60 space-y-1">
        <p>This is a bill of supply issued under Section 31(3)(c) of the CGST Act, 2017 read with Rule 49 of the CGST Rules. No input tax credit is available to the recipient on this document.</p>
        <p>Prepared using Pro UPI QR.</p>
      </footer>
    </article>
  </div>);
}