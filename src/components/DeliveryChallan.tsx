import { useEffect, useMemo, useRef, useState } from "react";
import { safeToPng, downloadDataUrl, notifyExportError } from "../lib/export-image";
import { trackProductEvent } from "../lib/productEvents";

const draftKey = "proupiqr-dc-draft";
const EXPORT_TIMEOUT_MS = 20000;

function withTimeout<T>(promise: Promise<T>, label: string) { return new Promise<T>((resolve, reject) => { const t = setTimeout(() => reject(new Error(`${label} timed out`)), EXPORT_TIMEOUT_MS); promise.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); }); }); }
function money(v: number) { return `₹${new Intl.NumberFormat("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v || 0)}`; }

interface DcItem { id: number; name: string; qty: string; unit: string }
let _id = 1; function nid() { return _id++; }

export function DeliveryChallan() {
  const today = new Date().toISOString().slice(0, 10);
  const [supplierName, setSupplierName] = useState(""); const [supplierGstin, setSupplierGstin] = useState("");
  const [supplierAddress, setSupplierAddress] = useState("");
  const [buyerName, setBuyerName] = useState(""); const [buyerAddress, setBuyerAddress] = useState("");
  const [dcNo, setDcNo] = useState("DC-001"); const [dcDate, setDcDate] = useState(today);
  const [poRef, setPoRef] = useState(""); const [vehicleNo, setVehicleNo] = useState("");
  const [transporter, setTransporter] = useState(""); const [ewayNo, setEwayNo] = useState("");
  const [items, setItems] = useState<DcItem[]>([{ id: nid(), name: "Steel sheets", qty: "20", unit: "pcs" }]);
  const paperRef = useRef<HTMLDivElement | null>(null);
  const [pdfState, setPdfState] = useState<"idle" | "busy" | "error">("idle");
  const [pngState, setPngState] = useState<"idle" | "busy" | "error">("idle");

  useEffect(() => { try { const d = JSON.parse(localStorage.getItem(draftKey) || "{}"); setSupplierName(d.supplierName ?? ""); setSupplierGstin(d.supplierGstin ?? ""); setSupplierAddress(d.supplierAddress ?? ""); setBuyerName(d.buyerName ?? ""); setBuyerAddress(d.buyerAddress ?? ""); setDcNo(d.dcNo ?? "DC-001"); setDcDate(d.dcDate ?? today); setPoRef(d.poRef ?? ""); setVehicleNo(d.vehicleNo ?? ""); setTransporter(d.transporter ?? ""); setEwayNo(d.ewayNo ?? ""); if (d.items) setItems(d.items); } catch {} }, []);
  useEffect(() => { localStorage.setItem(draftKey, JSON.stringify({ supplierName, supplierGstin, supplierAddress, buyerName, buyerAddress, dcNo, dcDate, poRef, vehicleNo, transporter, ewayNo, items })); }, [supplierName, supplierGstin, supplierAddress, buyerName, buyerAddress, dcNo, dcDate, poRef, vehicleNo, transporter, ewayNo, items]);

  function addItem() { setItems([...items, { id: nid(), name: "", qty: "1", unit: "pcs" }]); }
  function removeItem(id: number) { if (items.length < 2) return; setItems(items.filter(i => i.id !== id)); }
  function updateItem(id: number, field: keyof DcItem, val: string) { setItems(items.map(i => i.id === id ? { ...i, [field]: val } : i)); }

  async function renderPaper() {
    const el = paperRef.current; if (!el) throw new Error("Not ready");
    const clone = el.cloneNode(true) as HTMLDivElement;
    Object.assign(clone.style, { position: "fixed", left: "0", top: "0", zIndex: "-9999", opacity: "0", pointerEvents: "none", width: "800px", minWidth: "800px", maxWidth: "800px", padding: "36px", boxSizing: "border-box", height: "auto" });
    document.body.appendChild(clone); await new Promise(r => setTimeout(r, 250)); const h = clone.offsetHeight || 900;
    try { return await safeToPng(clone, { cacheBust: true, pixelRatio: 2, width: 800, height: h, style: { opacity: "1", width: "800px", height: `${h}px`, maxWidth: "800px", maxHeight: `${h}px`, minWidth: "800px", minHeight: `${h}px`, padding: "36px", boxSizing: "border-box", backgroundColor: "#fff" } }); }
    finally { document.body.removeChild(clone); }
  }

  async function downloadPdf() { try { setPdfState("busy"); const [{ jsPDF }, du] = await Promise.all([withTimeout(import("jspdf"), "PDF"), renderPaper()]); const px = 0.2646; const w = 800 * px; const h = (paperRef.current?.offsetHeight || 900) * px; const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: [w, h] }); pdf.addImage(du, "PNG", 0, 0, w, h); pdf.save("delivery-challan.pdf"); trackProductEvent("export_pdf", "delivery-challan"); setPdfState("idle"); } catch (e) { console.error(e); notifyExportError("PDF failed"); setPdfState("error"); } }
  async function downloadPng() { try { setPngState("busy"); const du = await renderPaper(); downloadDataUrl(du, "delivery-challan.png"); trackProductEvent("export_png", "delivery-challan"); setPngState("idle"); } catch (e) { console.error(e); notifyExportError("PNG failed"); setPngState("error"); } }

  return (<div className="grid gap-8 lg:grid-cols-[0.92fr_1.08fr]">
    <div className="no-print rounded-[2rem] border border-white/75 bg-white/90 p-5 shadow-[0_18px_48px_rgba(17,59,44,0.08)]">
      <div className="flex flex-wrap gap-3 sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-leaf">Delivery challan</p><h2 className="mt-1 text-2xl font-black text-forest">Dispatch goods</h2></div><div className="flex flex-wrap gap-2"><button onClick={downloadPng} disabled={pngState === "busy"} className="rounded-full border border-forest/15 px-4 py-2 text-xs font-bold text-forest hover:border-leaf transition">{pngState === "busy" ? "..." : "Export PNG"}</button><button onClick={downloadPdf} disabled={pdfState === "busy"} className="rounded-full bg-forest px-4 py-2 text-xs font-bold text-white hover:bg-leaf disabled:opacity-50 transition">{pdfState === "busy" ? "..." : "Export PDF"}</button></div></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-bold text-forest">Supplier (you)<input value={supplierName} onChange={e => setSupplierName(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
        <label className="text-sm font-bold text-forest">Supplier GSTIN<input value={supplierGstin} onChange={e => setSupplierGstin(e.target.value)} placeholder="22AAAAA0000A1Z5" className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
        <label className="text-sm font-bold text-forest sm:col-span-2">Supplier address<input value={supplierAddress} onChange={e => setSupplierAddress(e.target.value)} placeholder="Warehouse address" className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
        <label className="text-sm font-bold text-forest">Buyer name<input value={buyerName} onChange={e => setBuyerName(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
        <label className="text-sm font-bold text-forest">Buyer address<input value={buyerAddress} onChange={e => setBuyerAddress(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
        <label className="text-sm font-bold text-forest">DC number<input value={dcNo} onChange={e => setDcNo(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
        <label className="text-sm font-bold text-forest">DC date<input type="date" value={dcDate} onChange={e => setDcDate(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
        <label className="text-sm font-bold text-forest">PO reference<input value={poRef} onChange={e => setPoRef(e.target.value)} placeholder="PO-001" className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
        <label className="text-sm font-bold text-forest">Transporter<input value={transporter} onChange={e => setTransporter(e.target.value)} placeholder="Optional" className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
        <label className="text-sm font-bold text-forest">Vehicle number<input value={vehicleNo} onChange={e => setVehicleNo(e.target.value)} placeholder="KA01AB1234" className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
        <label className="text-sm font-bold text-forest">E-way bill number<input value={ewayNo} onChange={e => setEwayNo(e.target.value)} placeholder="Optional" className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
      </div>
      <div className="mt-5"><div className="flex items-center justify-between mb-2"><h3 className="text-xs font-black text-forest uppercase">Items</h3><button onClick={addItem} className="text-[11px] font-bold text-leaf hover:text-forest">+ Add row</button></div>
        {items.map((it, idx) => (<div key={it.id} className="mb-2 grid grid-cols-4 gap-1.5 rounded-xl bg-cream/60 p-2">
          <input value={it.name} onChange={e => updateItem(it.id, "name", e.target.value)} placeholder="Item" className="col-span-2 rounded-lg border border-forest/10 bg-white px-2 py-1.5 text-xs font-medium outline-none focus:border-leaf" />
          <input value={it.qty} onChange={e => updateItem(it.id, "qty", e.target.value)} placeholder="Qty" className="rounded-lg border border-forest/10 bg-white px-2 py-1.5 text-xs font-medium outline-none focus:border-leaf" />
          <div className="flex items-center gap-1"><input value={it.unit} onChange={e => updateItem(it.id, "unit", e.target.value)} placeholder="Unit" className="w-full rounded-lg border border-forest/10 bg-white px-2 py-1.5 text-xs font-medium outline-none focus:border-leaf" />{items.length > 1 && <button onClick={() => removeItem(it.id)} className="text-red-500 text-xs font-bold">×</button>}</div>
        </div>))}
      </div>
    </div>
    <article ref={paperRef} className="invoice-paper mx-auto h-fit w-full max-w-[780px] rounded-[2rem] border border-forest/10 bg-white p-6 shadow-[0_24px_80px_rgba(17,59,44,0.12)] md:p-8">
      <header className="flex items-start justify-between border-b-2 border-forest pb-4">
        <div><p className="text-xs font-black uppercase tracking-[0.24em] text-leaf">Delivery Challan</p><h2 className="mt-2 text-2xl font-black text-forest">{dcNo}</h2><p className="text-xs font-semibold text-forest/60">Date: {dcDate}</p></div>
        <div className="text-right text-xs font-bold text-forest/70">DC</div>
      </header>
      <section className="mt-4 grid grid-cols-2 gap-4 text-xs leading-6">
        <div><p className="font-black text-forest">From (Supplier)</p><p className="font-semibold">{supplierName || "—"}</p>{supplierGstin && <p className="text-forest/60">GSTIN: {supplierGstin}</p>}<p className="text-forest/60 whitespace-pre-wrap">{supplierAddress}</p></div>
        <div className="text-right"><p className="font-black text-forest">To (Buyer)</p><p className="font-semibold">{buyerName || "—"}</p><p className="text-forest/60 whitespace-pre-wrap">{buyerAddress}</p></div>
      </section>
      <div className="mt-5 overflow-x-auto"><table className="w-full text-xs">
        <thead><tr className="border-b-2 border-forest text-left"><th className="py-2 font-black">#</th><th className="py-2 font-black">Item</th><th className="py-2 text-right font-black">Qty</th><th className="py-2 text-right font-black">Unit</th></tr></thead>
        <tbody>{items.map((it, idx) => (<tr key={it.id} className="border-b border-forest/10"><td className="py-1.5">{idx + 1}</td><td className="py-1.5 font-semibold">{it.name || "—"}</td><td className="py-1.5 text-right">{it.qty}</td><td className="py-1.5 text-right">{it.unit}</td></tr>))}</tbody>
      </table></div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        {poRef && <div className="rounded-lg bg-cream/60 p-2"><span className="font-black">PO reference:</span> {poRef}</div>}
        {transporter && <div className="rounded-lg bg-cream/60 p-2"><span className="font-black">Transporter:</span> {transporter}</div>}
        {vehicleNo && <div className="rounded-lg bg-cream/60 p-2"><span className="font-black">Vehicle:</span> {vehicleNo}</div>}
        {ewayNo && <div className="rounded-lg bg-cream/60 p-2"><span className="font-black">E-way bill:</span> {ewayNo}</div>}
      </div>
      <footer className="mt-6 pt-3 border-t border-forest/10 text-xs space-y-2 text-forest/60">
        <div className="grid grid-cols-2 gap-4"><div><p className="font-black text-forest text-[11px] mb-1">Prepared by</p><p className="text-[10px]">{supplierName || "—"}</p></div><div><p className="font-black text-forest text-[11px] mb-1">Received by</p><div className="border-b border-dashed border-forest/30 h-5"></div><p className="text-[10px]">Signature / stamp</p></div></div>
        <p>This is a delivery challan — it records physical movement of goods. It is not a tax invoice. Prepared using Pro UPI QR.</p>
      </footer>
    </article>
  </div>);
}