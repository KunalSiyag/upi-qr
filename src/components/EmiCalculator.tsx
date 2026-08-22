import { useEffect, useMemo, useRef, useState } from "react";
import { safeToPng, downloadDataUrl, notifyExportError } from "../lib/export-image";

const draftKey = "proupiqr-emi-draft";
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
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value || 0);
}

export function EmiCalculator() {
  const today = new Date().toISOString().slice(0, 10);
  const [principal, setPrincipal] = useState("1000000");
  const [rate, setRate] = useState("9");
  const [years, setYears] = useState(20);
  const [monthsPart, setMonthsPart] = useState(0);
  const [loanName, setLoanName] = useState("Home Loan");
  const [startDate, setStartDate] = useState(today);
  const paperRef = useRef<HTMLDivElement | null>(null);
  const [pdfState, setPdfState] = useState<"idle" | "busy" | "error">("idle");
  const [pngState, setPngState] = useState<"idle" | "busy" | "error">("idle");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (!saved) return;
      const d = JSON.parse(saved);
      setPrincipal(String(d.principal ?? "1000000"));
      setRate(String(d.rate ?? "9"));
      setYears(Number(d.years) || 20);
      setMonthsPart(Number(d.monthsPart) || 0);
      setLoanName(d.loanName ?? "Home Loan");
      setStartDate(d.startDate ?? today);
    } catch {
      // Ignore broken local drafts.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localStorage.setItem(draftKey, JSON.stringify({ principal, rate, years, monthsPart, loanName, startDate }));
  }, [principal, rate, years, monthsPart, loanName, startDate]);

  const calc = useMemo(() => {
    const P = Math.max(0, Number(principal) || 0);
    const annual = Math.max(0, Number(rate) || 0);
    const n = Math.max(1, Math.min(480, Math.round(years * 12 + monthsPart)));
    const r = annual / 1200;

    let emi: number;
    if (r === 0) {
      emi = P / n;
    } else {
      const factor = Math.pow(1 + r, n);
      emi = (P * r * factor) / (factor - 1);
    }

    // Yearly amortization (rupee-level accumulation).
    const yearly: { year: number; principalPaid: number; interestPaid: number; balance: number }[] = [];
    let balance = P;
    let totalInterest = 0;
    for (let m = 1; m <= n; m++) {
      const interest = balance * r;
      let principalPart = emi - interest;
      if (m === n || principalPart > balance) principalPart = balance;
      balance -= principalPart;
      totalInterest += interest;
      if (m % 12 === 0 || m === n) {
        yearly.push({
          year: Math.ceil(m / 12),
          principalPaid: P - balance,
          interestPaid: totalInterest,
          balance: Math.max(0, balance)
        });
      }
    }

    return {
      emi,
      totalInterest,
      totalPayable: P + totalInterest,
      months: n,
      yearly,
      principalPct: P + totalInterest > 0 ? (P / (P + totalInterest)) * 100 : 0
    };
  }, [principal, rate, years, monthsPart]);

  function fileName() {
    return `emi-schedule-${(loanName || "loan").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  }

  async function renderPaper() {
    const el = paperRef.current;
    if (!el) throw new Error("Schedule not ready");
    const clone = el.cloneNode(true) as HTMLDivElement;
    Object.assign(clone.style, {
      position: "fixed", left: "0", top: "0", zIndex: "-9999", opacity: "0", pointerEvents: "none",
      width: "800px", minWidth: "800px", maxWidth: "800px", padding: "36px", boxSizing: "border-box",
      height: "auto", boxShadow: "none", border: "none", borderRadius: "0"
    });
    document.body.appendChild(clone);
    await new Promise((res) => setTimeout(res, 250));
    const targetHeight = clone.offsetHeight || 1100;
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
      const [{ jsPDF }, dataUrl] = await Promise.all([withTimeout(import("jspdf"), "PDF engine"), renderPaper()]);
      const pxToMm = 0.2646;
      const widthMm = 800 * pxToMm;
      const heightMm = (paperRef.current?.offsetHeight || 1100) * pxToMm;
      const pdf = new jsPDF({ orientation: widthMm < heightMm ? "portrait" : "landscape", unit: "mm", format: [widthMm, heightMm] });
      pdf.addImage(dataUrl, "PNG", 0, 0, widthMm, heightMm);
      pdf.save(`${fileName()}.pdf`);
      setPdfState("idle");
    } catch (err) {
      console.error("PDF failed:", err); notifyExportError("PDF export failed — please retry.");
      setPdfState("error");
    }
  }

  async function downloadPng() {
    try {
      setPngState("busy");
      downloadDataUrl(await renderPaper(), `${fileName()}.png`);
      setPngState("idle");
    } catch (err) {
      console.error("PNG failed:", err); notifyExportError("PNG export failed — try the PDF instead.");
      setPngState("error");
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
      <div className="no-print rounded-[2rem] border border-white/75 bg-white/90 p-5 shadow-[0_18px_48px_rgba(17,59,44,0.08)]">
        <div className="flex flex-wrap gap-3 sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-leaf">Loan planner</p>
            <h2 className="mt-1 text-2xl font-black text-forest">Know Your EMI First</h2>
          </div>
          <div className="flex flex-wrap gap-2 pb-1">
            <button onClick={downloadPdf} disabled={pdfState === "busy"} className="rounded-full bg-forest px-4 py-2 text-xs font-bold text-white hover:bg-leaf disabled:opacity-50 transition">{pdfState === "busy" ? "Generating..." : "📄 Schedule PDF"}</button>
            <button onClick={downloadPng} disabled={pngState === "busy"} className="rounded-full bg-mint px-4 py-2 text-xs font-bold text-forest hover:bg-leaf hover:text-white disabled:opacity-50 transition">{pngState === "busy" ? "Generating..." : "🖼️ PNG"}</button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-bold text-forest">Loan purpose<input value={loanName} onChange={(e) => setLoanName(e.target.value)} placeholder="Home / Car / Business" className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">First EMI date<input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest sm:col-span-2">Loan amount ₹<input type="number" value={principal} onChange={(e) => setPrincipal(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /><input type="range" min={50000} max={20000000} step={50000} value={Math.min(20000000, Math.max(50000, Number(principal) || 0))} onChange={(e) => setPrincipal(e.target.value)} className="mt-3 w-full accent-[#15803d]" aria-label="Loan amount slider" /></label>
          <label className="text-sm font-bold text-forest sm:col-span-2">Interest rate % per year<input type="number" step="0.05" value={rate} onChange={(e) => setRate(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Tenure — years<input type="number" min={0} max={40} value={years} onChange={(e) => setYears(Math.max(0, Math.min(40, Number(e.target.value) || 0)))} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">+ months<input type="number" min={0} max={11} value={monthsPart} onChange={(e) => setMonthsPart(Math.max(0, Math.min(11, Number(e.target.value) || 0)))} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {[[1000000, 8.5, 20, "Home ₹10L·20y"], [500000, 10.5, 5, "Car ₹5L·5y"], [200000, 14, 3, "Business ₹2L·3y"]].map(([p, r, y, label]) => (
            <button key={String(label)} type="button" onClick={() => { setPrincipal(String(p)); setRate(String(r)); setYears(Number(y)); setMonthsPart(0); }} className="rounded-full border border-forest/15 bg-cream px-3.5 py-1.5 text-xs font-bold text-forest hover:border-leaf transition">{label}</button>
          ))}
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-forest p-4 text-white"><p className="text-[10px] font-black uppercase tracking-widest text-white/60">Monthly EMI</p><p className="mt-1 text-2xl font-black">{money(calc.emi)}</p></div>
          <div className="rounded-2xl bg-cream p-4"><p className="text-[10px] font-black uppercase tracking-widest text-forest/50">Total interest</p><p className="mt-1 text-xl font-black text-forest">{money(calc.totalInterest)}</p></div>
          <div className="rounded-2xl bg-cream p-4"><p className="text-[10px] font-black uppercase tracking-widest text-forest/50">Total payable</p><p className="mt-1 text-xl font-black text-forest">{money(calc.totalPayable)}</p></div>
        </div>

        <div className="mt-4">
          <div className="flex h-3 overflow-hidden rounded-full">
            <div className="bg-forest" style={{ width: `${calc.principalPct}%` }} />
            <div className="bg-amber-400" style={{ width: `${100 - calc.principalPct}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-xs font-bold text-forest/70">
            <span>● Principal {money(Number(principal) || 0)}</span>
            <span>Interest {money(calc.totalInterest)} ●</span>
          </div>
        </div>
      </div>

      <article ref={paperRef} className="invoice-paper mx-auto h-fit w-full max-w-[780px] rounded-[2rem] border border-forest/10 bg-white p-6 shadow-[0_24px_80px_rgba(17,59,44,0.12)] md:p-8">
        <header className="flex items-start justify-between border-b-2 border-forest pb-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-leaf">Amortization schedule</p>
            <h2 className="mt-2 text-2xl font-black text-forest">{loanName || "Loan"} — EMI plan</h2>
            <p className="text-xs font-semibold text-forest/60">Starting {startDate}</p>
          </div>
          <div className="rounded-xl bg-mint p-3 text-right">
            <p className="text-[10px] font-bold text-forest/60">Monthly EMI</p>
            <p className="text-lg font-black text-forest">{money(calc.emi)}</p>
          </div>
        </header>

        <section className="mt-4 grid grid-cols-3 gap-3 text-center text-sm">
          <div className="rounded-xl bg-cream p-3"><p className="text-[10px] font-bold uppercase text-forest/55">Principal</p><p className="font-black text-forest">{money(Number(principal) || 0)}</p></div>
          <div className="rounded-xl bg-cream p-3"><p className="text-[10px] font-bold uppercase text-forest/55">Interest @ {Number(rate) || 0}%</p><p className="font-black text-forest">{money(calc.totalInterest)}</p></div>
          <div className="rounded-xl bg-forest p-3 text-white"><p className="text-[10px] font-bold uppercase text-white/60">Total payable</p><p className="font-black">{money(calc.totalPayable)}</p></div>
        </section>

        <table className="mt-5 w-full text-left text-sm">
          <thead><tr className="border-b border-forest/20 text-[10px] uppercase tracking-widest text-forest/55"><th className="py-2">Year</th><th className="py-2 text-right">Principal paid</th><th className="py-2 text-right">Interest paid</th><th className="py-2 text-right">Balance</th></tr></thead>
          <tbody>
            {calc.yearly.map((row) => (
              <tr key={row.year} className="border-b border-forest/5">
                <td className="py-1.5 font-semibold text-forest">Y{row.year}{row.year * 12 >= calc.months && row.balance === 0 ? " (end)" : ""}</td>
                <td className="py-1.5 text-right tabular-nums">{money(row.principalPaid)}</td>
                <td className="py-1.5 text-right tabular-nums">{money(row.interestPaid)}</td>
                <td className="py-1.5 text-right font-bold tabular-nums">{money(row.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <footer className="mt-4 text-center text-[10px] font-semibold uppercase tracking-widest text-forest/35">Indicative only — actual EMI may include insurance/handling per lender · Pro UPI QR</footer>
      </article>
    </div>
  );
}
