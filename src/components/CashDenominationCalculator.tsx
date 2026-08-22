import { useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";

const draftKey = "proupiqr-cash-denomination-draft";
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

const DENOMINATIONS = [
  { value: 2000, type: "note" },
  { value: 500, type: "note" },
  { value: 200, type: "note" },
  { value: 100, type: "note" },
  { value: 50, type: "note" },
  { value: 20, type: "note" },
  { value: 10, type: "note" },
  { value: 10, type: "coin" },
  { value: 5, type: "coin" },
  { value: 2, type: "coin" },
  { value: 1, type: "coin" }
];

function money(rupees: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(rupees);
}

export function CashDenominationCalculator() {
  const today = new Date().toISOString().slice(0, 10);
  const [counts, setCounts] = useState<string[]>(() => DENOMINATIONS.map(() => ""));
  const [expected, setExpected] = useState("");
  const [counterName, setCounterName] = useState("Counter 1");
  const [staffName, setStaffName] = useState("");
  const [shiftDate, setShiftDate] = useState(today);
  const [notes, setNotes] = useState("");
  const paperRef = useRef<HTMLDivElement | null>(null);
  const [pdfState, setPdfState] = useState<"idle" | "busy" | "error">("idle");
  const [pngState, setPngState] = useState<"idle" | "busy" | "error">("idle");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (!saved) return;
      const d = JSON.parse(saved);
      if (Array.isArray(d.counts)) setCounts(DENOMINATIONS.map((_, i) => String(d.counts[i] ?? "")));
      setExpected(String(d.expected ?? ""));
      setCounterName(d.counterName ?? "Counter 1");
      setStaffName(d.staffName ?? "");
      setShiftDate(d.shiftDate ?? today);
      setNotes(d.notes ?? "");
    } catch {
      // Ignore broken local drafts.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localStorage.setItem(draftKey, JSON.stringify({ counts, expected, counterName, staffName, shiftDate, notes }));
  }, [counts, expected, counterName, staffName, shiftDate, notes]);

  const rows = useMemo(() => DENOMINATIONS.map((d, i) => {
    const count = Math.max(0, Math.floor(Number(counts[i]) || 0));
    return { ...d, index: i, count, lineTotal: count * d.value };
  }), [counts]);

  const total = useMemo(() => rows.reduce((sum, r) => sum + r.lineTotal, 0), [rows]);
  const pieces = useMemo(() => rows.reduce((sum, r) => sum + r.count, 0), [rows]);
  const expectedNum = Math.max(0, Number(expected) || 0);
  const variance = expected ? total - expectedNum : null;

  function setCount(index: number, value: number) {
    const clamped = Math.max(0, Math.min(99999, Math.floor(value)));
    setCounts((cur) => cur.map((v, i) => i === index ? String(clamped || "") : v));
  }

  function clearAll() {
    setCounts(DENOMINATIONS.map(() => ""));
  }

  async function renderPaper() {
    const el = paperRef.current;
    if (!el) throw new Error("Summary not ready");
    const clone = el.cloneNode(true) as HTMLDivElement;
    Object.assign(clone.style, {
      position: "fixed", left: "0", top: "0", zIndex: "-9999", opacity: "0", pointerEvents: "none",
      width: "800px", minWidth: "800px", maxWidth: "800px", padding: "36px", boxSizing: "border-box",
      height: "auto", boxShadow: "none", border: "none", borderRadius: "0"
    });
    document.body.appendChild(clone);
    await new Promise((r) => setTimeout(r, 250));
    const targetHeight = clone.offsetHeight || 900;
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
      }), "Summary render");
    } finally {
      document.body.removeChild(clone);
    }
  }

  function fileName() {
    return `cash-summary-${(counterName || "counter").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${shiftDate}`;
  }

  async function downloadPdf() {
    try {
      setPdfState("busy");
      const [{ jsPDF }, dataUrl] = await Promise.all([withTimeout(import("jspdf"), "PDF engine"), renderPaper()]);
      const pxToMm = 0.2646;
      const widthMm = 800 * pxToMm;
      const heightMm = (paperRef.current?.offsetHeight || 900) * pxToMm;
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

  const varianceLabel = variance === null
    ? null
    : variance === 0
      ? { text: "Balanced — cash matches records exactly.", cls: "bg-mint text-forest" }
      : variance > 0
        ? { text: `Excess of ${money(variance)} over recorded sales.`, cls: "bg-blue-50 text-blue-800" }
        : { text: `Short by ${money(-variance)} versus recorded sales.`, cls: "bg-red-50 text-red-700" };

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_0.95fr]">
      <div className="no-print rounded-[2rem] border border-white/75 bg-white/90 p-5 shadow-[0_18px_48px_rgba(17,59,44,0.08)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-forest/5 pb-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-leaf">Cash counter</p>
            <h2 className="mt-1 text-2xl font-black text-forest">Count The Drawer</h2>
          </div>
          <button onClick={clearAll} className="rounded-full border border-forest/15 px-4 py-2 text-xs font-bold text-forest hover:border-red-400 hover:text-red-600 transition">Clear all</button>
        </div>

        <div className="mt-5 space-y-2">
          {rows.map((row, idx) => (
            <div key={`${row.type}-${row.value}-${idx}`} className="flex items-center gap-3 rounded-2xl bg-cream px-3 py-2">
              <span className={`flex h-11 w-14 shrink-0 items-center justify-center rounded-lg text-xs font-black ${row.type === "note" ? "bg-forest text-white" : "border border-forest/20 bg-white text-forest"}`}>
                ₹{row.value}
              </span>
              <span className="w-10 text-[10px] font-bold uppercase tracking-wide text-forest/50">{row.type}</span>
              <div className="ml-auto flex items-center gap-1.5">
                <button onClick={() => setCount(row.index, (Number(counts[row.index]) || 0) - 1)} aria-label={`Remove one ₹${row.value} ${row.type}`} className="h-8 w-8 rounded-lg bg-white font-black text-forest hover:bg-leaf hover:text-white transition">−</button>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  aria-label={`Count of ₹${row.value} ${row.type}`}
                  value={counts[row.index] ?? ""}
                  onChange={(e) => setCount(row.index, Number(e.target.value))}
                  className="h-9 w-16 rounded-lg border border-forest/15 bg-white text-center text-sm font-black outline-none focus:border-leaf"
                />
                <button onClick={() => setCount(row.index, (Number(counts[row.index]) || 0) + 1)} aria-label={`Add one ₹${row.value} ${row.type}`} className="h-8 w-8 rounded-lg bg-white font-black text-forest hover:bg-leaf hover:text-white transition">+</button>
              </div>
              <span className="w-24 shrink-0 text-right text-sm font-black text-forest tabular-nums">{money(row.lineTotal)}</span>
            </div>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between rounded-2xl bg-forest px-5 py-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/60">Counted cash ({pieces} pieces)</p>
            <p className="text-3xl font-black text-white">{money(total)}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-bold text-forest">Expected / as per records ₹<input type="number" value={expected} onChange={(e) => setExpected(e.target.value)} placeholder="From billing system" className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Counter / till name<input value={counterName} onChange={(e) => setCounterName(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Staff name<input value={staffName} onChange={(e) => setStaffName(e.target.value)} placeholder="Who closed the shift" className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Shift date<input type="date" value={shiftDate} onChange={(e) => setShiftDate(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest sm:col-span-2">Notes (optional)<textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Reason for variance, pending dues…" className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
        </div>

        {varianceLabel && <p className={`mt-4 rounded-2xl px-4 py-3 text-sm font-bold ${varianceLabel.cls}`}>{varianceLabel.text}</p>}

        <div className="mt-5 flex flex-wrap gap-2">
          <button onClick={downloadPdf} disabled={pdfState === "busy"} className="rounded-full bg-forest px-5 py-2.5 text-xs font-bold text-white hover:bg-leaf disabled:opacity-50 transition">{pdfState === "busy" ? "Generating..." : "📄 Download summary PDF"}</button>
          <button onClick={downloadPng} disabled={pngState === "busy"} className="rounded-full bg-mint px-5 py-2.5 text-xs font-bold text-forest hover:bg-leaf hover:text-white disabled:opacity-50 transition">{pngState === "busy" ? "Generating..." : "🖼️ Download PNG"}</button>
        </div>
      </div>

      <article ref={paperRef} className="invoice-paper mx-auto h-fit w-full max-w-[680px] rounded-[2rem] border border-forest/10 bg-white p-6 shadow-[0_24px_80px_rgba(17,59,44,0.12)] md:p-8">
        <header className="flex items-start justify-between border-b-2 border-forest pb-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-leaf">Cash denomination summary</p>
            <h2 className="mt-2 text-2xl font-black text-forest">{counterName || "Counter"}</h2>
            {staffName && <p className="text-xs font-semibold text-forest/60">Counted by {staffName}</p>}
          </div>
          <div className="rounded-xl bg-mint p-3 text-right">
            <p className="text-[10px] font-bold text-forest/60">Shift date</p>
            <p className="text-sm font-black text-forest">{shiftDate}</p>
          </div>
        </header>

        <table className="mt-4 w-full text-left text-sm">
          <thead><tr className="border-b border-forest/20 text-[10px] uppercase tracking-widest text-forest/55"><th className="py-2">Denomination</th><th className="py-2 text-center">×</th><th className="py-2 text-right">Amount</th></tr></thead>
          <tbody>
            {rows.map((row, idx) => row.count > 0 && (
              <tr key={`${row.value}-${idx}`} className="border-b border-forest/5">
                <td className="py-1.5 font-semibold text-forest">₹{row.value} <span className="text-[10px] uppercase text-forest/45">{row.type}</span></td>
                <td className="py-1.5 text-center font-bold">{row.count}</td>
                <td className="py-1.5 text-right font-black tabular-nums">{money(row.lineTotal)}</td>
              </tr>
            ))}
            {pieces === 0 && <tr><td colSpan={3} className="py-4 text-center text-sm font-semibold text-forest/40">No denominations counted yet.</td></tr>}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-forest"><td className="pt-2 font-black text-forest" colSpan={2}>Total counted</td><td className="pt-2 text-right text-base font-black text-forest tabular-nums">{money(total)}</td></tr>
            {expected && <tr><td colSpan={2} className="font-semibold text-forest/70">As per records</td><td className="text-right font-bold text-forest/70 tabular-nums">{money(expectedNum)}</td></tr>}
            {variance !== null && (
              <tr><td colSpan={2} className={`font-black ${variance >= 0 ? "text-green-700" : "text-red-600"}`}>{variance === 0 ? "Variance" : variance > 0 ? "Excess" : "Short"}</td>
              <td className={`text-right font-black tabular-nums ${variance >= 0 ? "text-green-700" : "text-red-600"}`}>{money(Math.abs(variance))}</td></tr>
            )}
          </tfoot>
        </table>

        {notes && <footer className="mt-4 rounded-xl bg-cream p-3 text-xs leading-5 text-forest/70"><strong className="text-forest">Notes:</strong> {notes}</footer>}
        {!notes && <footer className="mt-4 text-center text-[10px] font-semibold uppercase tracking-widest text-forest/35">Generated free via Pro UPI QR</footer>}
      </article>
    </div>
  );
}
