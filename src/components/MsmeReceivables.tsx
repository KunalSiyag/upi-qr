import { useEffect, useMemo, useRef, useState } from "react";
import { safeToPng, notifyExportError } from "../lib/export-image";
import { trackProductEvent } from "../lib/productEvents";

const draftKey = "proupiqr-msme-receivables-draft";
const EXPORT_TIMEOUT_MS = 20000;
const RBI_BANK_RATE_PCT = 6.5;
const RATE_PCT = Math.round(RBI_BANK_RATE_PCT * 3 * 10) / 10;
const LAST_REVIEWED = "2026-08-29";
const REVIEWER = "Kunal Siyag";
const STATUTORY_CREDIT_DAYS = 45;

interface InvoiceEntry {
  id: string;
  buyer: string;
  invoiceNo: string;
  billDate: string;
  amount: number;
  creditDays: number;
  paidAmount: number | null;
  paidDate: string;
  notes: string;
}

let uid = 1;
function nextId() {
  return `r${uid++}_${Date.now().toString(36)}`;
}

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), EXPORT_TIMEOUT_MS);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

function fmtMoney(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value || 0);
}

function fmtRs(value: number) {
  return new Intl.NumberFormat("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value || 0);
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function isoToDate(iso: string): Date {
  return new Date(iso);
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function computeInterest(principal: number, overdueDays: number): { simple: number; compound: number } {
  if (overdueDays <= 0 || principal <= 0) return { simple: 0, compound: 0 };
  const simple = principal * (RATE_PCT / 100) * (overdueDays / 365);
  const months = overdueDays / 30;
  const compound = principal * (Math.pow(1 + RATE_PCT / 1200, months) - 1);
  return { simple, compound };
}

interface AgingBucket {
  label: string;
  range: [number, number];
  count: number;
  total: number;
}

interface EntryStats {
  entry: InvoiceEntry;
  dueDate: string;
  agingDays: number;
  statutoryDueDate: string;
  over45: boolean;
  isOverdue: boolean;
  overdueDays: number;
  interest: { simple: number; compound: number };
  effectiveCreditDays: number;
}

export function MsmeReceivables() {
  const today = new Date().toISOString().slice(0, 10);
  const [supplierName, setSupplierName] = useState("");
  const [supplierUdyam, setSupplierUdyam] = useState("");
  const [supplierAddress, setSupplierAddress] = useState("");
  const [tab, setTab] = useState<"tracker" | "letter">("tracker");
  const [entries, setEntries] = useState<InvoiceEntry[]>([]);
  const paperRef = useRef<HTMLDivElement | null>(null);
  const [pdfState, setPdfState] = useState<"idle" | "busy" | "error">("idle");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (!saved) return;
      const d = JSON.parse(saved);
      setSupplierName(d.supplierName ?? "");
      setSupplierUdyam(d.supplierUdyam ?? "");
      setSupplierAddress(d.supplierAddress ?? "");
      setEntries((d.entries ?? []).map((e: any) => ({ ...e, id: e.id || nextId() })));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    localStorage.setItem(draftKey, JSON.stringify({ supplierName, supplierUdyam, supplierAddress, entries }));
  }, [supplierName, supplierUdyam, supplierAddress, entries]);

  const entryStats: EntryStats[] = useMemo(() => {
    return entries.map((e) => {
      const effectiveCreditDays = Math.min(e.creditDays, STATUTORY_CREDIT_DAYS);
      const dueDate = addDays(e.billDate, effectiveCreditDays);
      const statutoryDueDate = addDays(e.billDate, STATUTORY_CREDIT_DAYS);
      const endDate = e.paidDate && e.paidAmount != null ? e.paidDate : today;
      const overdueDays = Math.max(0, daysBetween(isoToDate(dueDate), isoToDate(endDate)));
      const agingDays = daysBetween(isoToDate(e.billDate), isoToDate(endDate));
      return {
        entry: e,
        dueDate,
        agingDays,
        statutoryDueDate,
        over45: e.creditDays > STATUTORY_CREDIT_DAYS,
        isOverdue: overdueDays > 0,
        overdueDays,
        interest: computeInterest(e.amount, overdueDays),
        effectiveCreditDays,
      };
    });
  }, [entries, today]);

  const agingBuckets: AgingBucket[] = useMemo(() => {
    const now = isoToDate(today);
    const buckets: { label: string; range: [number, number]; entries: EntryStats[] }[] = [
      { label: "Not yet due", range: [-Infinity, -1], entries: [] },
      { label: "1–30 days", range: [0, 30], entries: [] },
      { label: "31–45 days", range: [31, 45], entries: [] },
      { label: "46–60 days", range: [46, 60], entries: [] },
      { label: "61–90 days", range: [61, 90], entries: [] },
      { label: "91+ days", range: [91, Infinity], entries: [] },
    ];
    for (const es of entryStats) {
      if (!es.entry.paidAmount || es.entry.paidDate !== "") {
        for (const b of buckets) {
          if (es.overdueDays >= b.range[0] && es.overdueDays <= b.range[1]) {
            b.entries.push(es);
            break;
          }
        }
      }
    }
    return buckets.filter(b => b.entries.length > 0).map(b => ({
      label: b.label,
      range: b.range,
      count: b.entries.length,
      total: b.entries.reduce((s, es) => s + es.entry.amount, 0),
    }));
  }, [entryStats]);

  const totals = useMemo(() => ({
    principal: entries.reduce((s, e) => s + e.amount, 0),
    pending: entries.filter(e => !e.paidAmount).length,
    paid: entries.filter(e => e.paidAmount != null).length,
    total: entries.length,
    compoundInterest: entryStats.reduce((s, es) => s + es.interest.compound, 0),
    simpleInterest: entryStats.reduce((s, es) => s + es.interest.simple, 0),
    overdue: entryStats.filter(es => es.isOverdue && !es.entry.paidAmount).length,
  }), [entries, entryStats]);

  function addEntry() {
    const e: InvoiceEntry = {
      id: nextId(),
      buyer: "",
      invoiceNo: "",
      billDate: today,
      amount: 0,
      creditDays: 45,
      paidAmount: null,
      paidDate: "",
      notes: "",
    };
    setEntries([...entries, e]);
    trackProductEvent("qr_generated", "msme-receivables");
  }

  function removeEntry(id: string) {
    setEntries(entries.filter(e => e.id !== id));
  }

  function updateEntry(id: string, patch: Partial<InvoiceEntry>) {
    setEntries(entries.map(e => e.id === id ? { ...e, ...patch } : e));
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (!text) return;
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      const header = lines[0].toLowerCase();
      if (!header.includes("invoice") || !header.includes("amount")) {
        notifyExportError("CSV needs at least Invoice and Amount columns.");
        return;
      }
      const newEntries: InvoiceEntry[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",");
        if (cols.length < 2) continue;
        const amountIdx = header.indexOf("amount") >= 0 ? header.split(",").findIndex(h => h.trim() === "amount") : 1;
        const invoiceIdx = header.indexOf("invoice") >= 0 ? header.split(",").findIndex(h => h.trim().includes("invoice")) : 0;
        const buyerIdx = header.indexOf("buyer") >= 0 ? header.split(",").findIndex(h => h.trim() === "buyer") : -1;
        const dateIdx = header.indexOf("date") >= 0 ? header.split(",").findIndex(h => h.trim() === "date") : -1;
        const amt = parseInt(cols[amountIdx]?.trim().replace(/[₹,"'\s]/g, "") || "0", 10);
        if (isNaN(amt)) continue;
        newEntries.push({
          id: nextId(),
          buyer: buyerIdx >= 0 ? (cols[buyerIdx]?.trim() ?? "") : "",
          invoiceNo: cols[invoiceIdx]?.trim() ?? `INV-${i}`,
          billDate: dateIdx >= 0 ? (cols[dateIdx]?.trim() ?? today) : today,
          amount: amt,
          creditDays: 45,
          paidAmount: null,
          paidDate: "",
          notes: "",
        });
      }
      if (newEntries.length > 0) setEntries([...entries, ...newEntries]);
    };
    reader.readAsText(file);
  }

  async function renderPaper(includeLetter: boolean) {
    const el = paperRef.current;
    if (!el) throw new Error("Output not ready");
    const clone = el.cloneNode(true) as HTMLDivElement;
    const hiddenSections = clone.querySelectorAll(`[data-render="${includeLetter ? "tracker" : "letter"}"]`);
    hiddenSections.forEach(s => s.remove());
    Object.assign(clone.style, {
      position: "fixed", left: "0", top: "0", zIndex: "-9999", opacity: "0", pointerEvents: "none",
      width: "800px", minWidth: "800px", maxWidth: "800px", padding: "36px", boxSizing: "border-box",
      height: "auto", boxShadow: "none", border: "none", borderRadius: "0", display: "block",
    });
    document.body.appendChild(clone);
    await new Promise((r) => setTimeout(r, 250));
    const targetHeight = clone.offsetHeight || 900;
    try {
      return await safeToPng(clone, {
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
      });
    } finally {
      document.body.removeChild(clone);
    }
  }

  async function downloadPdf() {
    try {
      setPdfState("busy");
      const [{ jsPDF }, dataUrl] = await Promise.all([withTimeout(import("jspdf"), "PDF engine"), renderPaper(tab === "letter")]);
      const pxToMm = 0.2646;
      const widthMm = 800 * pxToMm;
      const heightMm = (paperRef.current?.offsetHeight || 900) * pxToMm;
      const pdf = new jsPDF({ orientation: widthMm < heightMm ? "portrait" : "landscape", unit: "mm", format: [widthMm, heightMm] });
      pdf.addImage(dataUrl, "PNG", 0, 0, widthMm, heightMm);
      pdf.save(`msme-receivables-${tab === "letter" ? "demand-letter" : "aging-report"}.pdf`);
      trackProductEvent("export_pdf", "msme-receivables");
      setPdfState("idle");
    } catch (err) {
      console.error("PDF failed:", err);
      notifyExportError("PDF export failed — please retry.");
      setPdfState("error");
    }
  }

  function exportCsv() {
    const header = "Buyer,Invoice,Bill Date,Amount,Credit Days,Due Date,Overdue Days,Interest (compound),Status\n";
    const rows = entryStats.map(es => {
      const status = es.entry.paidAmount != null ? "Paid" : es.isOverdue ? "Overdue" : "Not due";
      return `"${es.entry.buyer}","${es.entry.invoiceNo}",${es.entry.billDate},${es.entry.amount},${es.entry.creditDays},${es.dueDate},${es.overdueDays},${Math.round(es.interest.compound)},${status}`;
    }).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "msme-receivables.csv";
    a.click();
    URL.revokeObjectURL(url);
    trackProductEvent("export_png", "msme-receivables");
  }

  function clearAll() {
    setEntries([]);
  }

  function generateDemandLetter(): string {
    const overdueStats = entryStats.filter(es => es.isOverdue && !es.entry.paidAmount);
    if (overdueStats.length === 0) return "No overdue invoices to include in the demand letter.";

    const totalPrincipal = overdueStats.reduce((s, es) => s + es.entry.amount, 0);
    const totalInterest = overdueStats.reduce((s, es) => s + es.interest.compound, 0);

    return `REGISTERED POST WITH ACKNOWLEDGMENT DUE

Date: ${new Date(today).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}

To,
${entries[0]?.buyer ? `The Accounts Payable\n${entries[0].buyer}\n` : "The Buyer,\n"}

Subject: Demand for payment of outstanding invoices with MSMED interest — Section 16, MSMED Act, 2006

Dear Sir/Madam,

This is a formal demand under Section 16 of the Micro, Small and Medium Enterprises Development Act, 2006, for payment of the following overdue invoices along with delayed-payment interest.

SUPPLIER DETAILS
Name: ${supplierName || "(insert your business name)"}${supplierUdyam ? `\nUdyam Registration: ${supplierUdyam}` : ""}${supplierAddress ? `\nAddress: ${supplierAddress}` : ""}

OUTSTANDING INVOICES
${overdueStats.map(es => {
  const d = isoToDate(es.entry.billDate);
  return `• Invoice ${es.entry.invoiceNo || "—"} dated ${d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} — ₹${fmtRs(es.entry.amount)} (due ${es.dueDate}, overdue ${es.overdueDays} days; interest ₹${fmtRs(Math.round(es.interest.compound))})`;
}).join("\n")}

Total principal outstanding: ₹${fmtRs(totalPrincipal)}
Total interest @ ${RATE_PCT}% p.a. (3 × RBI Bank Rate of ${RBI_BANK_RATE_PCT}%): ₹${fmtRs(Math.round(totalInterest))}
Total claimable: ₹${fmtRs(totalPrincipal + Math.round(totalInterest))}

LEGAL BASIS
Section 16 of the MSMED Act, 2006 mandates that buyers of goods or services from registered micro and small enterprises pay within the agreed credit period, and in any case not later than 45 days from the date of acceptance or deemed acceptance. Delayed payment attracts compound interest at three times the RBI Bank Rate notified from time to time.

You are hereby called upon to remit the principal sum together with interest within 15 calendar days from receipt of this notice. Should payment not be received by that date, the undersigned will initiate proceedings before the Micro & Small Enterprises Facilitation Council under Sections 17 and 18 of the Act, without further notice.

The Council is empowered to award interest with monthly rests from the due dates until actual payment and to enforce the award as a decree of a civil court.

Sincerely,
${supplierName || "(your name/business)"}
${supplierUdyam ? `Udyam: ${supplierUdyam}` : ""}

Enclosures: Invoice copies | Aging schedule

NOTE: This demand letter is drafted using the Pro UPI QR MSME receivables tool. It is intended as a starting point for negotiation and Council filing. It is not a substitute for legal advice. Please review with counsel, verify your Udyam registration, and file via samadhaan.msme.gov.in. Last reviewed ${LAST_REVIEWED} by ${REVIEWER}.`;
  }

  function copyDemandLetter() {
    const letter = generateDemandLetter();
    navigator.clipboard?.writeText(letter).catch(() => undefined);
    trackProductEvent("copy", "msme-receivables");
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr]">
      <div className="no-print rounded-[2rem] border border-white/75 bg-white/90 p-5 shadow-[0_18px_48px_rgba(17,59,44,0.08)]">
        <div className="flex flex-wrap gap-3 sm:justify-between items-start">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-leaf">MSMED receivables suite</p>
            <h2 className="mt-1 text-2xl font-black text-forest">Invoice aging & demand letters</h2>
          </div>
          <div className="flex items-center gap-1 rounded-xl bg-cream p-1">
            <button onClick={() => setTab("tracker")} className={`rounded-lg px-4 py-2 text-xs font-bold transition ${tab === "tracker" ? "bg-forest text-white" : "text-forest hover:bg-white"}`}>Aging tracker</button>
            <button onClick={() => setTab("letter")} className={`rounded-lg px-4 py-2 text-xs font-bold transition ${tab === "letter" ? "bg-forest text-white" : "text-forest hover:bg-white"}`}>Demand letter</button>
          </div>
        </div>

        <p className="mt-3 rounded-2xl bg-mint px-4 py-2.5 text-xs leading-5 font-semibold text-forest/75">
          Track outstanding invoices across your buyers, bucket them by age, and create a Section 16 demand letter with statutory interest calculated at <strong>{RATE_PCT}% p.a.</strong> (3 × RBI bank rate {RBI_BANK_RATE_PCT}%). The maximum enforceable credit period is <strong>45 days</strong> regardless of longer contract terms.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="text-xs font-bold text-forest">
            Your business name
            <input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="Supplier name" className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-sm font-medium outline-none focus:border-leaf transition" />
          </label>
          <label className="text-xs font-bold text-forest">
            Udyam registration
            <input value={supplierUdyam} onChange={(e) => setSupplierUdyam(e.target.value)} placeholder="UDYAM-XX-00-0000000" className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-sm font-medium outline-none focus:border-leaf transition" />
          </label>
          <label className="text-xs font-bold text-forest">
            Address (optional)
            <input value={supplierAddress} onChange={(e) => setSupplierAddress(e.target.value)} placeholder="City, State" className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-sm font-medium outline-none focus:border-leaf transition" />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button onClick={addEntry} className="rounded-full bg-leaf px-4 py-2 text-xs font-bold text-white hover:bg-forest transition">+ Add invoice</button>
          <label className="cursor-pointer rounded-full border border-forest/20 px-4 py-2 text-xs font-bold text-forest hover:bg-mint transition">
            Upload CSV
            <input type="file" accept=".csv" onChange={handleFileInput} className="hidden" />
          </label>
          <button onClick={exportCsv} className="rounded-full border border-forest/20 px-4 py-2 text-xs font-bold text-forest hover:bg-mint transition">Export CSV</button>
          <button onClick={downloadPdf} disabled={pdfState === "busy"} className="rounded-full bg-forest px-4 py-2 text-xs font-bold text-white hover:bg-leaf disabled:opacity-50 transition">
            {pdfState === "busy" ? "PDF..." : "Export PDF"}
          </button>
          {entries.length > 0 && (
            <button onClick={clearAll} className="rounded-full border border-red-200 px-4 py-2 text-xs font-bold text-red-700 hover:bg-red-100 transition">Clear all</button>
          )}
        </div>

        {entries.length === 0 && (
          <div className="mt-6 rounded-2xl border-2 border-dashed border-forest/15 p-8 text-center">
            <p className="text-sm font-semibold text-forest/50">No invoices yet. Add one manually or upload a CSV with Invoice and Amount columns.</p>
            <p className="mt-1 text-[11px] text-forest/40">CSV header example: Buyer, Invoice, Date, Amount</p>
          </div>
        )}

        {entries.length > 0 && (
          <div className="mt-4 space-y-3 max-h-[50vh] overflow-y-auto">
            {entries.map((entry, idx) => {
              const es = entryStats[idx];
              return (
                <div key={entry.id} className="rounded-xl border border-forest/10 bg-cream/60 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-black text-forest uppercase">Invoice {idx + 1}</span>
                    <button onClick={() => removeEntry(entry.id)} className="text-[11px] font-bold text-red-500 hover:text-red-700">Remove</button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <label className="text-[10px] font-bold text-forest/60">
                      Buyer
                      <input value={entry.buyer} onChange={(ev) => updateEntry(entry.id, { buyer: ev.target.value })} placeholder="Company name" className="mt-1 w-full rounded-lg border border-forest/10 bg-white px-2 py-1.5 text-xs font-medium outline-none focus:border-leaf" />
                    </label>
                    <label className="text-[10px] font-bold text-forest/60">
                      Invoice #
                      <input value={entry.invoiceNo} onChange={(ev) => updateEntry(entry.id, { invoiceNo: ev.target.value })} placeholder="INV-001" className="mt-1 w-full rounded-lg border border-forest/10 bg-white px-2 py-1.5 text-xs font-medium outline-none focus:border-leaf" />
                    </label>
                    <label className="text-[10px] font-bold text-forest/60">
                      Amount ₹
                      <input type="number" value={entry.amount || ""} onChange={(ev) => updateEntry(entry.id, { amount: Math.max(0, parseInt(ev.target.value, 10) || 0) })} className="mt-1 w-full rounded-lg border border-forest/10 bg-white px-2 py-1.5 text-xs font-medium outline-none focus:border-leaf" />
                    </label>
                    <label className="text-[10px] font-bold text-forest/60">
                      Bill date
                      <input type="date" value={entry.billDate} onChange={(ev) => updateEntry(entry.id, { billDate: ev.target.value })} className="mt-1 w-full rounded-lg border border-forest/10 bg-white px-2 py-1.5 text-xs font-medium outline-none focus:border-leaf" />
                    </label>
                    <label className="text-[10px] font-bold text-forest/60">
                      Credit days
                      <input type="number" min={0} max={180} value={entry.creditDays} onChange={(ev) => updateEntry(entry.id, { creditDays: parseInt(ev.target.value, 10) || 0 })} className="mt-1 w-full rounded-lg border border-forest/10 bg-white px-2 py-1.5 text-xs font-medium outline-none focus:border-leaf" />
                      {es.over45 && <span className="text-[10px] text-red-600 font-semibold">Capped at 45d</span>}
                    </label>
                    <label className="text-[10px] font-bold text-forest/60">
                      Paid ₹ (optional)
                      <input type="number" value={entry.paidAmount ?? ""} onChange={(ev) => { const v = ev.target.value; updateEntry(entry.id, { paidAmount: v ? Math.max(0, parseInt(v, 10) || 0) : null }); }} placeholder="" className="mt-1 w-full rounded-lg border border-forest/10 bg-white px-2 py-1.5 text-xs font-medium outline-none focus:border-leaf" />
                    </label>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px]">
                    <span className="rounded-md bg-white px-2 py-0.5 font-semibold text-forest/70">Due: {es.dueDate}</span>
                    {es.isOverdue && (
                      <span className="rounded-md bg-red-50 px-2 py-0.5 font-bold text-red-600">Overdue {es.overdueDays}d</span>
                    )}
                    {!es.isOverdue && (
                      <span className="rounded-md bg-mint px-2 py-0.5 font-bold text-emerald-700">Not due</span>
                    )}
                    {es.overdueDays > 0 && (
                      <span className="rounded-md bg-amber-50 px-2 py-0.5 font-semibold text-amber-700">Interest: {fmtRs(Math.round(es.interest.compound))}</span>
                    )}
                    {entry.paidAmount != null && entry.paidAmount >= entry.amount && (
                      <span className="rounded-md bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700">Settled</span>
                    )}
                    {entry.paidAmount != null && entry.paidAmount < entry.amount && (
                      <span className="rounded-md bg-red-50 px-2 py-0.5 font-bold text-red-700">Short ₹{fmtRs(entry.amount - entry.paidAmount)}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-4">
        {entries.length > 0 && (
          <div className="grid grid-cols-4 gap-2">
            <div className="rounded-xl bg-cream/80 p-2.5 text-center">
              <p className="text-[10px] font-bold text-forest/55">Invoices</p>
              <p className="text-xl font-black text-forest">{totals.total}</p>
            </div>
            <div className="rounded-xl bg-cream/80 p-2.5 text-center">
              <p className="text-[10px] font-bold text-forest/55">Total</p>
              <p className="text-lg font-black text-forest">{fmtMoney(totals.principal)}</p>
            </div>
            <div className={`rounded-xl p-2.5 text-center ${totals.overdue > 0 ? "bg-red-50" : "bg-mint"}`}>
              <p className="text-[10px] font-bold text-forest/55">Overdue</p>
              <p className={`text-xl font-black ${totals.overdue > 0 ? "text-red-600" : "text-emerald-700"}`}>{totals.overdue}</p>
            </div>
            <div className="rounded-xl bg-amber-50 p-2.5 text-center">
              <p className="text-[10px] font-bold text-forest/55">Interest</p>
              <p className="text-lg font-black text-amber-700">{fmtRs(Math.round(totals.compoundInterest))}</p>
            </div>
          </div>
        )}

        {agingBuckets.length > 0 && (
          <div className="rounded-2xl border border-forest/10 bg-white p-4">
            <h3 className="text-xs font-black uppercase tracking-[0.15em] text-forest/50 mb-3">Aging buckets</h3>
            <div className="space-y-1.5">
              {agingBuckets.map(b => (
                <div key={b.label} className="flex items-center justify-between rounded-lg bg-cream/50 px-3 py-2">
                  <span className="text-xs font-semibold text-forest">{b.label}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold text-forest/50">{b.count} invoice{b.count > 1 ? "s" : ""}</span>
                    <span className="text-xs font-black tabular-nums text-forest">{fmtMoney(b.total)}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-lg bg-red-50 p-2 text-center">
              <p className="text-[10px] font-bold text-red-700">
                {totals.overdue} overdue · ₹{fmtRs(Math.round(totals.compoundInterest))} accrued interest @ {RATE_PCT}% p.a.
              </p>
            </div>
          </div>
        )}

        {tab === "letter" && entries.length > 0 && (
          <div className="rounded-2xl border border-forest/10 bg-white p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-black uppercase tracking-[0.15em] text-forest/50">Demand letter draft</h3>
              <button onClick={copyDemandLetter} className="rounded-full border border-forest/20 px-3 py-1.5 text-[11px] font-bold text-forest hover:bg-mint transition">Copy letter</button>
            </div>
            <pre className="text-[11px] leading-relaxed text-forest/80 font-mono whitespace-pre-wrap max-h-[40vh] overflow-y-auto bg-cream/50 rounded-xl p-3">{generateDemandLetter()}</pre>
            <p className="mt-2 text-[9px] text-forest/40">This is a starting point. Review with legal counsel, verify Udyam registration, and file via samadhaan.msme.gov.in.</p>
          </div>
        )}

        {entries.length > 0 && (
          <div className="flex items-center gap-2 text-[10px] text-forest/50 font-medium">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
            100% private — all data stays in this browser. Nothing is uploaded to any server.
          </div>
        )}

        <article ref={paperRef} className="hidden">
          <div data-render="tracker" className="bg-white text-black font-sans w-[800px] p-8 box-border" style={{ fontFamily: "system-ui, sans-serif" }}>
            <div className="border-b-2 border-gray-800 pb-4 mb-4">
              <h2 className="text-2xl font-bold">MSME Receivables Aging Report</h2>
              <p className="text-sm text-gray-500 mt-1">{supplierName && `${supplierName} — `}Generated {new Date().toLocaleDateString("en-IN")}</p>
            </div>
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div><p className="text-[10px] uppercase text-gray-500">Total invoices</p><p className="text-lg font-bold">{entries.length}</p></div>
              <div><p className="text-[10px] uppercase text-gray-500">Principal</p><p className="text-lg font-bold">₹{fmtRs(totals.principal)}</p></div>
              <div><p className="text-[10px] uppercase text-gray-500">Overdue</p><p className="text-lg font-bold" style={{ color: totals.overdue > 0 ? "#dc2626" : "#059669" }}>{totals.overdue}</p></div>
              <div><p className="text-[10px] uppercase text-gray-500">Accrued interest</p><p className="text-lg font-bold">₹{fmtRs(Math.round(totals.compoundInterest))}</p></div>
            </div>
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr className="border-b-2 border-gray-300">
                  <th className="text-left py-1.5">Buyer</th>
                  <th className="text-left py-1.5">Invoice</th>
                  <th className="text-left py-1.5">Bill Date</th>
                  <th className="text-right py-1.5">Amount</th>
                  <th className="text-left py-1.5">Due</th>
                  <th className="text-right py-1.5">Overdue Days</th>
                  <th className="text-right py-1.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {entryStats.sort((a, b) => b.overdueDays - a.overdueDays).map(es => (
                  <tr key={es.entry.id} className="border-b border-gray-200">
                    <td className="py-1.5">{es.entry.buyer || "—"}</td>
                    <td className="py-1.5">{es.entry.invoiceNo}</td>
                    <td className="py-1.5">{es.entry.billDate}</td>
                    <td className="text-right py-1.5">₹{fmtRs(es.entry.amount)}</td>
                    <td className="py-1.5">{es.dueDate}</td>
                    <td className="text-right py-1.5">{es.overdueDays}</td>
                    <td className="text-right py-1.5">{es.entry.paidAmount != null ? "Paid" : es.isOverdue ? "Overdue" : "Not due"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[9px] text-gray-400 mt-4">Interest computed at {RATE_PCT}% p.a. (3× RBI Bank Rate). Section 16, MSMED Act, 2006. Prepared using Pro UPI QR. Last reviewed {LAST_REVIEWED} by {REVIEWER}.</p>
          </div>
          <div data-render="letter" className="bg-white text-black font-sans w-[800px] p-8 box-border" style={{ fontFamily: "system-ui, sans-serif" }}>
            <pre className="text-[11px] leading-relaxed whitespace-pre-wrap">{generateDemandLetter()}</pre>
          </div>
        </article>
      </div>
    </div>
  );
}