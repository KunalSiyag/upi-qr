import { useEffect, useMemo, useRef, useState } from "react";
import { safeToPng, downloadDataUrl, notifyExportError } from "../lib/export-image";
import { trackProductEvent } from "../lib/productEvents";

const draftKey = "proupiqr-po-draft";
const EXPORT_TIMEOUT_MS = 20000;

function withTimeout<T>(promise: Promise<T>, label: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), EXPORT_TIMEOUT_MS);
    promise.then(v => { clearTimeout(timer); resolve(v); }, e => { clearTimeout(timer); reject(e); });
  });
}

function money(value: number) { return `₹${new Intl.NumberFormat("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value || 0)}`; }
function fRs(value: number) { return new Intl.NumberFormat("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value || 0); }

interface PoItem { id: number; name: string; qty: string; rate: string; gst: string }
let _id = 1; function nid() { return _id++; }

export function PurchaseOrderGenerator() {
  const today = new Date().toISOString().slice(0, 10);
  const [buyerName, setBuyerName] = useState(""); const [buyerGstin, setBuyerGstin] = useState("");
  const [buyerAddress, setBuyerAddress] = useState(""); const [supplierName, setSupplierName] = useState("");
  const [supplierGstin, setSupplierGstin] = useState("");
  const [poNo, setPoNo] = useState("PO-001"); const [poDate, setPoDate] = useState(today);
  const [deliveryBy, setDeliveryBy] = useState(""); const [terms, setTerms] = useState("");
  const [items, setItems] = useState<PoItem[]>([{ id: nid(), name: "4mm MS sheet bundle", qty: "20", rate: "450", gst: "18" }]);
  const paperRef = useRef<HTMLDivElement | null>(null);
  const [pdfState, setPdfState] = useState<"idle" | "busy" | "error">("idle");
  const [pngState, setPngState] = useState<"idle" | "busy" | "error">("idle");

  useEffect(() => {
    try { const d = JSON.parse(localStorage.getItem(draftKey) || "{}"); setBuyerName(d.buyerName ?? ""); setBuyerGstin(d.buyerGstin ?? ""); setBuyerAddress(d.buyerAddress ?? ""); setSupplierName(d.supplierName ?? ""); setSupplierGstin(d.supplierGstin ?? ""); setPoNo(d.poNo ?? "PO-001"); setPoDate(d.poDate ?? today); setDeliveryBy(d.deliveryBy ?? ""); setTerms(d.terms ?? ""); if (d.items) setItems(d.items); } catch {}
  }, []);
  useEffect(() => { localStorage.setItem(draftKey, JSON.stringify({ buyerName, buyerGstin, buyerAddress, supplierName, supplierGstin, poNo, poDate, deliveryBy, terms, items })); }, [buyerName, buyerGstin, buyerAddress, supplierName, supplierGstin, poNo, poDate, deliveryBy, terms, items]);

  const calc = useMemo(() => {
    let subtotal = 0, tax = 0;
    items.forEach(i => { const q = Math.max(0, Number(i.qty) || 0); const r = Math.max(0, Number(i.rate) || 0); const g = Math.max(0, Number(i.gst) || 0); const line = q * r; subtotal += line; tax += line * g / 100; });
    return { subtotal, tax, total: subtotal + tax };
  }, [items]);

  function addItem() { setItems([...items, { id: nid(), name: "", qty: "1", rate: "", gst: "18" }]); }
  function removeItem(id: number) { if (items.length < 2) return; setItems(items.filter(i => i.id !== id)); }
  function updateItem(id: number, field: keyof PoItem, value: string) { setItems(items.map(i => i.id === id ? { ...i, [field]: value } : i)); }

  async function renderPaper() {
    const el = paperRef.current; if (!el) throw new Error("Not ready");
    const clone = el.cloneNode(true) as HTMLDivElement;
    Object.assign(clone.style, { position: "fixed", left: "0", top: "0", zIndex: "-9999", opacity: "0", pointerEvents: "none", width: "800px", minWidth: "800px", maxWidth: "800px", padding: "36px", boxSizing: "border-box", height: "auto" });
    document.body.appendChild(clone); await new Promise(r => setTimeout(r, 250));
    const h = clone.offsetHeight || 900;
    try { return await safeToPng(clone, { cacheBust: true, pixelRatio: 2, width: 800, height: h, style: { opacity: "1", width: "800px", height: `${h}px`, maxWidth: "800px", maxHeight: `${h}px`, minWidth: "800px", minHeight: `${h}px`, padding: "36px", boxSizing: "border-box", backgroundColor: "#fff" } }); }
    finally { document.body.removeChild(clone); }
  }

  async function downloadPdf() {
    try { setPdfState("busy"); const [{ jsPDF }, du] = await Promise.all([withTimeout(import("jspdf"), "PDF"), renderPaper()]); const px = 0.2646; const w = 800 * px; const h = (paperRef.current?.offsetHeight || 900) * px; const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: [w, h] }); pdf.addImage(du, "PNG", 0, 0, w, h); pdf.save("purchase-order.pdf"); trackProductEvent("export_pdf", "purchase-order"); setPdfState("idle"); }
    catch (e) { console.error(e); notifyExportError("PDF failed"); setPdfState("error"); }
  }

  async function downloadPng() {
    try { setPngState("busy"); const du = await renderPaper(); downloadDataUrl(du, "purchase-order.png"); trackProductEvent("export_png", "purchase-order"); setPngState("idle"); }
    catch (e) { console.error(e); notifyExportError("PNG failed"); setPngState("error"); }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[0.92fr_1.08fr]">
      <div className="no-print rounded-[2rem] border border-white/75 bg-white/90 p-5 shadow-[0_18px_48px_rgba(17,59,44,0.08)]">
        <div className="flex flex-wrap gap-3 sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-leaf">Purchase order</p><h2 className="mt-1 text-2xl font-black text-forest">Create PO</h2></div><div className="flex flex-wrap gap-2"><button onClick={downloadPng} disabled={pngState === "busy"} className="rounded-full border border-forest/15 px-4 py-2 text-xs font-bold text-forest hover:border-leaf transition">{pngState === "busy" ? "..." : "Export PNG"}</button><button onClick={downloadPdf} disabled={pdfState === "busy"} className="rounded-full bg-forest px-4 py-2 text-xs font-bold text-white hover:bg-leaf disabled:opacity-50 transition">{pdfState === "busy" ? "..." : "Export PDF"}</button></div></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-bold text-forest">Buyer name<input value={buyerName} onChange={e => setBuyerName(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Buyer GSTIN<input value={buyerGstin} onChange={e => setBuyerGstin(e.target.value)} placeholder="22AAAAA0000A1Z5" className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest sm:col-span-2">Buyer address<input value={buyerAddress} onChange={e => setBuyerAddress(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Supplier (your business)<input value={supplierName} onChange={e => setSupplierName(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Your GSTIN<input value={supplierGstin} onChange={e => setSupplierGstin(e.target.value)} placeholder="22AAAAA0000A1Z5" className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">PO number<input value={poNo} onChange={e => setPoNo(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">PO date<input type="date" value={poDate} onChange={e => setPoDate(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Delivery expected by<input type="date" value={deliveryBy} onChange={e => setDeliveryBy(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Terms & conditions<textarea value={terms} onChange={e => setTerms(e.target.value)} rows={2} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
        </div>
        <div className="mt-5"><div className="flex items-center justify-between mb-2"><h3 className="text-xs font-black text-forest uppercase">Items</h3><button onClick={addItem} className="text-[11px] font-bold text-leaf hover:text-forest">+ Add row</button></div>
          {items.map((it, idx) => (<div key={it.id} className="mb-2 grid grid-cols-5 gap-1.5 rounded-xl bg-cream/60 p-2">
            <input value={it.name} onChange={e => updateItem(it.id, "name", e.target.value)} placeholder="Item" className="col-span-2 rounded-lg border border-forest/10 bg-white px-2 py-1.5 text-xs font-medium outline-none focus:border-leaf" />
            <input value={it.qty} onChange={e => updateItem(it.id, "qty", e.target.value)} placeholder="Qty" className="rounded-lg border border-forest/10 bg-white px-2 py-1.5 text-xs font-medium outline-none focus:border-leaf" />
            <input value={it.rate} onChange={e => updateItem(it.id, "rate", e.target.value)} placeholder="Rate" className="rounded-lg border border-forest/10 bg-white px-2 py-1.5 text-xs font-medium outline-none focus:border-leaf" />
            <div className="flex items-center gap-1"><input value={it.gst} onChange={e => updateItem(it.id, "gst", e.target.value)} placeholder="GST%" className="w-full rounded-lg border border-forest/10 bg-white px-2 py-1.5 text-xs font-medium outline-none focus:border-leaf" />{items.length > 1 && <button onClick={() => removeItem(it.id)} className="text-red-500 text-xs font-bold">×</button>}</div>
          </div>))}
        </div>
      </div>
      <article ref={paperRef} className="invoice-paper mx-auto h-fit w-full max-w-[780px] rounded-[2rem] border border-forest/10 bg-white p-6 shadow-[0_24px_80px_rgba(17,59,44,0.12)] md:p-8">
        <header className="flex items-start justify-between border-b-2 border-forest pb-4">
          <div><p className="text-xs font-black uppercase tracking-[0.24em] text-leaf">Purchase Order</p><h2 className="mt-2 text-2xl font-black text-forest">{poNo}</h2><p className="text-xs font-semibold text-forest/60">Date: {poDate}</p></div>
          <div className="text-right text-xs font-bold text-forest/70">PO</div>
        </header>
        <section className="mt-4 grid grid-cols-2 gap-4 text-xs leading-6">
          <div><p className="font-black text-forest">From (Buyer)</p><p className="font-semibold">{buyerName || "—"}</p>{buyerGstin && <p className="text-forest/60">GSTIN: {buyerGstin}</p>}<p className="text-forest/60 whitespace-pre-wrap">{buyerAddress}</p></div>
          <div className="text-right"><p className="font-black text-forest">To (Supplier)</p><p className="font-semibold">{supplierName || "—"}</p>{supplierGstin && <p className="text-forest/60">GSTIN: {supplierGstin}</p>}</div>
        </section>
        <div className="mt-5 overflow-x-auto"><table className="w-full text-xs">
          <thead><tr className="border-b-2 border-forest text-left"><th className="py-2 font-black">#</th><th className="py-2 font-black">Item</th><th className="py-2 text-right font-black">Qty</th><th className="py-2 text-right font-black">Rate</th><th className="py-2 text-right font-black">GST%</th><th className="py-2 text-right font-black">Amount</th></tr></thead>
          <tbody>{items.map((it, idx) => { const ln = (Math.max(0, Number(it.qty) || 0)) * (Math.max(0, Number(it.rate) || 0)); return (<tr key={it.id} className="border-b border-forest/10"><td className="py-1.5">{idx + 1}</td><td className="py-1.5 font-semibold">{it.name || "—"}</td><td className="py-1.5 text-right">{it.qty}</td><td className="py-1.5 text-right">{money(Number(it.rate) || 0)}</td><td className="py-1.5 text-right">{it.gst}%</td><td className="py-1.5 text-right font-bold">{money(ln)}</td></tr>); })}</tbody>
        </table></div>
        <div className="mt-3 ml-auto w-60 space-y-1 text-xs">
          <div className="flex justify-between"><span className="font-semibold">Subtotal</span><strong>{money(calc.subtotal)}</strong></div>
          <div className="flex justify-between"><span className="font-semibold">GST</span><strong>{money(calc.tax)}</strong></div>
          <div className="flex justify-between border-t-2 border-forest pt-1 text-sm"><span className="font-black">Total</span><strong className="font-black">{money(calc.total)}</strong></div>
        </div>
        {deliveryBy && <div className="mt-4 rounded-xl bg-mint p-3 text-xs"><span className="font-black">Delivery expected by:</span> {deliveryBy}</div>}
        {terms && <p className="mt-3 text-[10px] leading-relaxed text-forest/60 border-t border-forest/10 pt-3">{terms}</p>}
        <footer className="mt-4 pt-3 border-t border-forest/10 text-[10px] text-forest/60"><p>This is a purchase order — not a tax invoice or contract. Prepared using Pro UPI QR.</p></footer>
      </article>
    </div>
  );
}