import { useEffect, useMemo, useRef, useState } from "react";
import { safeToPng, downloadDataUrl, notifyExportError } from "../lib/export-image";

const draftKey = "proupiqr-msmed-draft";
const EXPORT_TIMEOUT_MS = 20000;
const RBI_BANK_RATE_PCT = 6.5;
const RATE_PCT = Math.round(RBI_BANK_RATE_PCT * 3 * 10) / 10;
const LAST_REVIEWED = "2026-08-27";

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
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value || 0);
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function MsmedInterestCalculator() {
  const today = new Date().toISOString().slice(0, 10);
  const [supplierName, setSupplierName] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("INV-0042");
  const [amount, setAmount] = useState("100000");
  const [billDate, setBillDate] = useState(addDays(today, -210));
  const [creditDays, setCreditDays] = useState(45);
  const [paidDate, setPaidDate] = useState(""); // blank = still unpaid → count till today
  const [compoundMode, setCompoundMode] = useState(true);
  const paperRef = useRef<HTMLDivElement | null>(null);
  const [pdfState, setPdfState] = useState<"idle" | "busy" | "error">("idle");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (!saved) return;
      const d = JSON.parse(saved);
      setSupplierName(d.supplierName ?? "");
      setBuyerName(d.buyerName ?? "");
      setInvoiceNo(d.invoiceNo ?? "INV-0042");
      setAmount(String(d.amount ?? "100000"));
      setBillDate(d.billDate ?? billDate);
      setCreditDays(Number(d.creditDays) || 45);
      setPaidDate(d.paidDate ?? "");
      setCompoundMode(typeof d.compoundMode === "boolean" ? d.compoundMode : true);
    } catch {
      // Ignore broken drafts.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localStorage.setItem(draftKey, JSON.stringify({ supplierName, buyerName, invoiceNo, amount, billDate, creditDays, paidDate, compoundMode }));
  }, [supplierName, buyerName, invoiceNo, amount, billDate, creditDays, paidDate, compoundMode]);

  const calc = useMemo(() => {
    const P = Math.max(0, Number(amount) || 0);
    const dueDate = addDays(billDate, creditDays);
    const endDate = paidDate || today;
    const due = new Date(dueDate).getTime();
    const end = new Date(endDate).getTime();
    const overdueDays = isNaN(due) || isNaN(end) ? 0 : Math.max(0, Math.round((end - due) / 86400000));

    const simpleInterest = P * (RATE_PCT / 100) * (overdueDays / 365);

    // Monthly compounding is used as the default calculation approach.
    const months = overdueDays / 30;
    const compoundInterest = P * (Math.pow(1 + RATE_PCT / 1200, months) - 1);

    const interest = compoundMode ? compoundInterest : simpleInterest;
    return {
      P, dueDate, overdueDays, simpleInterest, compoundInterest, interest,
      total: P + interest,
      isOverdue: overdueDays > 0,
      statutoryNote: creditDays > 45
    };
  }, [amount, billDate, creditDays, paidDate, compoundMode]);

  async function renderPaper() {
    const el = paperRef.current;
    if (!el) throw new Error("Statement not ready");
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

  function fileName() {
    return `msmed-interest-${(invoiceNo || "statement").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
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
      console.error("PDF failed:", err); notifyExportError("PDF export failed — please retry.");
      setPdfState("error");
    }
  }

  function copyClaimText() {
    const text = `*MSMED Interest Claim — ${invoiceNo}*\n` +
      `Supplier: ${supplierName || "—"}\nBuyer: ${buyerName || "—"}\n` +
      `Principal: ${money(calc.P)} · Bill date: ${billDate}\n` +
      `Due date: ${calc.dueDate} (${creditDays} day terms)\n` +
      `Overdue: ${calc.overdueDays} days\n` +
      `Interest @${RATE_PCT}% p.a. (3× RBI bank rate): ${money(calc.interest)}\n` +
      `Total claimable: ${money(calc.total)}\n` +
      `(Section 16, MSMED Act — MSE Facilitation Council jurisdiction)`;
    navigator.clipboard?.writeText(text).catch(() => undefined);
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
      <div className="no-print rounded-[2rem] border border-white/75 bg-white/90 p-5 shadow-[0_18px_48px_rgba(17,59,44,0.08)]">
        <div className="flex flex-wrap gap-3 sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-leaf">MSMED Act toolkit</p>
            <h2 className="mt-1 text-2xl font-black text-forest">Charge Late-Payment Interest</h2>
          </div>
          <div className="flex flex-wrap gap-2 pb-1">
            <button onClick={copyClaimText} className="rounded-full border border-forest/15 px-4 py-2 text-xs font-bold text-forest hover:border-leaf transition">📋 Copy claim</button>
            <button onClick={downloadPdf} disabled={pdfState === "busy"} className="rounded-full bg-forest px-4 py-2 text-xs font-bold text-white hover:bg-leaf disabled:opacity-50 transition">{pdfState === "busy" ? "Generating..." : "📄 Statement PDF"}</button>
          </div>
        </div>

        <p className="mt-3 rounded-2xl bg-mint px-4 py-2.5 text-xs leading-5 font-semibold text-forest/75">
          Under Section 16 of the MSMED Act, 2006, registered micro/small suppliers are entitled to interest at <strong>three times the RBI bank rate</strong> ({RBI_BANK_RATE_PCT}% × 3 = {RATE_PCT}% p.a.) when buyers pay later than the agreed credit period. If no agreement exists or the period exceeds 45 days, the Act deems the maximum credit period as 45 days before interest begins accruing.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-bold text-forest">Your business (supplier)<input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="Optional" className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Buyer company<input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="Optional" className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Invoice number<input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Bill amount ₹<input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Bill date<input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Agreed credit days<input type="number" min={0} max={180} value={creditDays} onChange={(e) => setCreditDays(Math.max(0, Math.min(180, Number(e.target.value) || 0)))} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /><span className="mt-1 block text-[11px] font-semibold text-forest/55">{calc.statutoryNote ? "⚠ Above 45 days — the Act deems the maximum credit period as 45 days before interest starts." : "Within 45 days — interest begins after agreed credit days."}</span></label>
          <label className="text-sm font-bold text-forest sm:col-span-2">Payment received on (leave empty if still unpaid)<input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
        </div>

        <div className="mt-4 flex gap-2">
          {[["simple", "Simple interest"], ["compound", "Monthly compounding"]].map(([value, label]) => (
            <button key={value} type="button" onClick={() => setCompoundMode(value === "compound")} aria-pressed={(value === "compound") === compoundMode}
              className={`flex-1 rounded-xl border px-3 py-2.5 text-xs font-bold transition ${(value === "compound") === compoundMode ? "border-leaf bg-leaf text-white" : "border-forest/15 bg-cream text-forest"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <article ref={paperRef} className="invoice-paper mx-auto h-fit w-full max-w-[780px] rounded-[2rem] border border-forest/10 bg-white p-6 shadow-[0_24px_80px_rgba(17,59,44,0.12)] md:p-8">
        <header className="flex items-start justify-between border-b-2 border-forest pb-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-leaf">Delayed payment interest statement</p>
            <h2 className="mt-2 text-2xl font-black text-forest">{invoiceNo}</h2>
            {supplierName && <p className="text-xs font-semibold text-forest/60">Supplier: {supplierName}</p>}
            {buyerName && <p className="text-xs font-semibold text-forest/60">Buyer: {buyerName}</p>}
          </div>
          <span className="rounded-lg border-2 border-red-500 bg-white px-3 py-1 text-xs font-black uppercase tracking-widest text-red-600">{RATE_PCT}% p.a.</span>
        </header>

        <section className="mt-4 grid grid-cols-3 gap-3 text-center text-sm">
          <div className="rounded-xl bg-cream p-3"><p className="text-[10px] font-bold uppercase text-forest/55">Bill amount</p><p className="font-black text-forest">{money(calc.P)}</p></div>
          <div className="rounded-xl bg-cream p-3"><p className="text-[10px] font-bold uppercase text-forest/55">Due date</p><p className="font-black text-forest">{calc.dueDate}</p></div>
          <div className={`rounded-xl p-3 ${calc.isOverdue ? "bg-red-50" : "bg-mint"}`}><p className="text-[10px] font-bold uppercase text-forest/55">Overdue by</p><p className={`font-black ${calc.isOverdue ? "text-red-600" : "text-green-700"}`}>{calc.overdueDays > 0 ? `${calc.overdueDays} days` : "Not due"}</p></div>
        </section>

        <section className="mt-4 space-y-2 rounded-xl border border-dashed border-forest/20 p-4 text-sm">
          <div className="flex justify-between"><span className="font-semibold text-forest/75">Principal outstanding</span><strong className="tabular-nums">{money(calc.P)}</strong></div>
          <div className="flex justify-between"><span className="font-semibold text-forest/75">Interest @ {RATE_PCT}% p.a. ({compoundMode ? "monthly compounding" : "simple"}) for {calc.overdueDays} days</span><strong className="tabular-nums text-red-600">+ {money(calc.interest)}</strong></div>
          {!compoundMode && calc.overdueDays > 0 && (
            <div className="flex justify-between text-xs text-forest/60"><span>If compounded monthly (councils often award this)</span><strong className="tabular-nums">{money(calc.compoundInterest)}</strong></div>
          )}
          <div className="flex justify-between border-t-2 border-forest pt-2 text-base"><span className="font-black text-forest">Total claimable</span><strong className="font-black tabular-nums text-forest">{money(calc.total)}</strong></div>
        </section>

        <footer className="mt-4 space-y-2 text-[11px] leading-5 text-forest/60">
          <p><strong className="text-forest">Basis:</strong> Section 16, Micro, Small and Medium Enterprises Development Act, 2006 — interest at three times the RBI bank rate ({RBI_BANK_RATE_PCT}% × 3 = {RATE_PCT}% p.a. at current rates).</p>
          <p><strong className="text-forest">Sources:</strong> <a href="https://msme.gov.in" class="underline hover:text-leaf" target="_blank" rel="noopener">msme.gov.in</a> · <a href="https://samadhaan.msme.gov.in" class="underline hover:text-leaf" target="_blank" rel="noopener">SAMADHAAN portal</a> · <a href="https://rbi.org.in" class="underline hover:text-leaf" target="_blank" rel="noopener">rbi.org.in</a> for current bank rate.</p>
          <p>This statement supports negotiation and MSE FC filing. It is not a legal notice; consult the SAMADHAAN portal or your counsel for enforcement. Last reviewed {LAST_REVIEWED}.</p>
        </footer>
      </article>
    </div>
  );
}
