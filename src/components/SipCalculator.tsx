import { useEffect, useMemo, useRef, useState } from "react";
import { safeToPng, downloadDataUrl, notifyExportError } from "../lib/export-image";

const draftKey = "proupiqr-sip-draft";
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

export function SipCalculator() {
  const [monthly, setMonthly] = useState("5000");
  const [rate, setRate] = useState("12");
  const [years, setYears] = useState("10");
  const [inflation, setInflation] = useState("");
  const paperRef = useRef<HTMLDivElement | null>(null);
  const [pdfState, setPdfState] = useState<"idle" | "busy" | "error">("idle");
  const [pngState, setPngState] = useState<"idle" | "busy" | "error">("idle");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (!saved) return;
      const d = JSON.parse(saved);
      setMonthly(String(d.monthly ?? "5000"));
      setRate(String(d.rate ?? "12"));
      setYears(String(d.years ?? "10"));
      setInflation(String(d.inflation ?? ""));
    } catch {
      // Ignore broken local drafts.
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(draftKey, JSON.stringify({ monthly, rate, years, inflation }));
  }, [monthly, rate, years, inflation]);

  const calc = useMemo(() => {
    const P = Math.max(0, Number(monthly) || 0);
    const annual = Math.max(0, Number(rate) || 0);
    const y = Math.max(1, Math.min(50, Math.round(Number(years) || 0)));
    const n = y * 12;
    const i = annual / 1200;

    let futureValue: number;
    if (i === 0) {
      futureValue = P * n;
    } else {
      const growth = Math.pow(1 + i, n);
      futureValue = P * ((growth - 1) / i) * (1 + i);
    }

    const invested = P * n;
    const gains = futureValue - invested;
    const inflationNum = Math.max(0, Number(inflation) || 0);
    const realValue = inflationNum > 0 ? futureValue / Math.pow(1 + inflationNum / 100, y) : null;

    const yearly: { year: number; invested: number; value: number }[] = [];
    for (let yr = 1; yr <= y; yr++) {
      const months = yr * 12;
      const val = i === 0 ? P * months : P * ((Math.pow(1 + i, months) - 1) / i) * (1 + i);
      yearly.push({ year: yr, invested: P * months, value: val });
    }

    return { futureValue, invested, gains, n, yearly, realValue, gainPct: futureValue > 0 ? (invested / futureValue) * 100 : 0 };
  }, [monthly, rate, years, inflation]);

  function fileName() {
    return `sip-growth-${calc.n}-months`;
  }

  async function renderPaper() {
    const el = paperRef.current;
    if (!el) throw new Error("Projection not ready");
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
            <p className="text-xs font-black uppercase tracking-[0.2em] text-leaf">Wealth planner</p>
            <h2 className="mt-1 text-2xl font-black text-forest">Project Your SIP Growth</h2>
          </div>
          <div className="flex flex-wrap gap-2 pb-1">
            <button onClick={downloadPdf} disabled={pdfState === "busy"} className="rounded-full bg-forest px-4 py-2 text-xs font-bold text-white hover:bg-leaf disabled:opacity-50 transition">{pdfState === "busy" ? "Generating..." : "📄 Projection PDF"}</button>
            <button onClick={downloadPng} disabled={pngState === "busy"} className="rounded-full bg-mint px-4 py-2 text-xs font-bold text-forest hover:bg-leaf hover:text-white disabled:opacity-50 transition">{pngState === "busy" ? "Generating..." : "🖼️ PNG"}</button>
          </div>
        </div>

        <div className="mt-6 grid gap-4">
          <label className="text-sm font-bold text-forest">Monthly investment ₹<input type="number" value={monthly} onChange={(e) => setMonthly(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Expected annual return %<input type="number" step="0.5" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="Equity ~12, Debt ~7" className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Investment period — years<input type="number" min={1} max={50} value={years} onChange={(e) => setYears(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Assume inflation % (optional)<input type="number" step="0.5" value={inflation} onChange={(e) => setInflation(e.target.value)} placeholder="~6 shows today's-money value" className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {[["5000", 12, 10, "₹5k · 12% · 10y"], ["10000", 12, 15, "₹10k · 12% · 15y"], ["25000", 11, 20, "₹25k · 11% · 20y"]].map(([p, r, y, label]) => (
            <button key={String(label)} type="button" onClick={() => { setMonthly(String(p)); setRate(String(r)); setYears(String(y)); }} className="rounded-full border border-forest/15 bg-cream px-3.5 py-1.5 text-xs font-bold text-forest hover:border-leaf transition">{label}</button>
          ))}
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-cream p-4"><p className="text-[10px] font-black uppercase tracking-widest text-forest/50">You invest</p><p className="mt-1 text-xl font-black text-forest">{money(calc.invested)}</p></div>
          <div className="rounded-2xl bg-amber-100 p-4"><p className="text-[10px] font-black uppercase tracking-widest text-forest/55">Wealth gained</p><p className="mt-1 text-xl font-black text-forest">{money(calc.gains)}</p></div>
          <div className="rounded-2xl bg-forest p-4 text-white"><p className="text-[10px] font-black uppercase tracking-widest text-white/60">Maturity value</p><p className="mt-1 text-2xl font-black">{money(calc.futureValue)}</p></div>
        </div>

        {calc.realValue !== null && (
          <p className="mt-3 rounded-2xl bg-mint px-4 py-3 text-sm font-semibold text-forest/80">
            After {Number(years) || 0} years at {inflation}% inflation, {money(calc.futureValue)} feels like <strong className="text-forest">{money(calc.realValue)}</strong> in today's money.
          </p>
        )}

        <div className="mt-4">
          <div className="flex h-3 overflow-hidden rounded-full">
            <div className="bg-forest" style={{ width: `${calc.gainPct}%` }} />
            <div className="bg-sun" style={{ width: `${100 - calc.gainPct}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-xs font-bold text-forest/70">
            <span>● Your investment</span>
            <span>Compounding gains ●</span>
          </div>
        </div>
      </div>

      <article ref={paperRef} className="invoice-paper mx-auto h-fit w-full max-w-[780px] rounded-[2rem] border border-forest/10 bg-white p-6 shadow-[0_24px_80px_rgba(17,59,44,0.12)] md:p-8">
        <header className="flex items-start justify-between border-b-2 border-forest pb-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-leaf">SIP growth projection</p>
            <h2 className="mt-2 text-2xl font-black text-forest">{money(Number(monthly) || 0)} monthly for {Math.max(1, Math.round(calc.n / 12))} year(s)</h2>
            <p className="text-xs font-semibold text-forest/60">Expected return {Number(rate) || 0}% per annum</p>
          </div>
          <div className="rounded-xl bg-mint p-3 text-right">
            <p className="text-[10px] font-bold text-forest/60">Maturity value</p>
            <p className="text-lg font-black text-forest">{money(calc.futureValue)}</p>
          </div>
        </header>

        {calc.realValue !== null && (
          <section className="mt-4 rounded-xl bg-cream p-3 text-sm font-semibold text-forest/75">
            Inflation-adjusted ({inflation}%): {money(calc.realValue)} in today's money.
          </section>
        )}

        <table className="mt-5 w-full text-left text-sm">
          <thead><tr className="border-b border-forest/20 text-[10px] uppercase tracking-widest text-forest/55"><th className="py-2">Year</th><th className="py-2 text-right">Total invested</th><th className="py-2 text-right">Portfolio value</th><th className="py-2 text-right">Gains</th></tr></thead>
          <tbody>
            {calc.yearly.map((row) => (
              <tr key={row.year} className="border-b border-forest/5">
                <td className="py-1.5 font-semibold text-forest">Y{row.year}</td>
                <td className="py-1.5 text-right tabular-nums">{money(row.invested)}</td>
                <td className="py-1.5 text-right font-bold tabular-nums">{money(row.value)}</td>
                <td className="py-1.5 text-right tabular-nums text-green-700">{money(row.value - row.invested)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <footer className="mt-4 text-center text-[10px] font-semibold uppercase tracking-widest text-forest/35">Illustrative projection — market returns vary · Pro UPI QR</footer>
      </article>
    </div>
  );
}
