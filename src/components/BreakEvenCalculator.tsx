import { useEffect, useMemo, useRef, useState } from "react";
import { safeToPng, downloadDataUrl, notifyExportError } from "../lib/export-image";

const draftKey = "proupiqr-break-even-draft";
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

export function BreakEvenCalculator() {
  const [fixedCosts, setFixedCosts] = useState("50000");
  const [price, setPrice] = useState("200");
  const [variableCost, setVariableCost] = useState("120");
  const [targetProfit, setTargetProfit] = useState("");
  const [currentUnits, setCurrentUnits] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (!saved) return;
      const d = JSON.parse(saved);
      setFixedCosts(String(d.fixedCosts ?? "50000"));
      setPrice(String(d.price ?? "200"));
      setVariableCost(String(d.variableCost ?? "120"));
      setTargetProfit(String(d.targetProfit ?? ""));
      setCurrentUnits(String(d.currentUnits ?? ""));
    } catch {
      // Ignore broken local drafts.
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(draftKey, JSON.stringify({ fixedCosts, price, variableCost, targetProfit, currentUnits }));
  }, [fixedCosts, price, variableCost, targetProfit, currentUnits]);

  const calc = useMemo(() => {
    const fc = Math.max(0, Number(fixedCosts) || 0);
    const p = Math.max(0, Number(price) || 0);
    const v = Math.max(0, Number(variableCost) || 0);
    const contribution = p - v;

    if (contribution <= 0 || fc === 0) {
      return { valid: false, contribution, beUnits: 0, beRevenue: 0 };
    }

    const beUnits = Math.ceil(fc / contribution);
    const exactUnits = fc / contribution;
    const beRevenue = beUnits * p;
    const targetNum = Math.max(0, Number(targetProfit) || 0);
    const targetUnits = targetNum > 0 ? Math.ceil((fc + targetNum) / contribution) : null;

    const currentNum = Number(currentUnits) > 0 ? Number(currentUnits) : null;
    let currentProfit: number | null = null;
    let marginOfSafety: number | null = null;
    if (currentNum !== null) {
      currentProfit = currentNum * contribution - fc;
      marginOfSafety = ((currentNum - exactUnits) / currentNum) * 100;
    }

    return {
      valid: true, contribution, beUnits, exactUnits, beRevenue,
      targetUnits, currentProfit, marginOfSafety, currentUnitsSold: currentNum,
      monthlyRevenueAtBE: beUnits * p, monthlyVarAtBE: beUnits * v
    };
  }, [fixedCosts, price, variableCost, targetProfit, currentUnits]);

  const paperRef = useRef<HTMLDivElement | null>(null);
  const [pdfState, setPdfState] = useState<"idle" | "busy" | "error">("idle");
  const [pngState, setPngState] = useState<"idle" | "busy" | "error">("idle");

  async function renderPaper() {
    const el = paperRef.current;
    if (!el) throw new Error("Analysis not ready");
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
    return "break-even-analysis";
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
            <p className="text-xs font-black uppercase tracking-[0.2em] text-leaf">Unit economics</p>
            <h2 className="mt-1 text-2xl font-black text-forest">Find Your Survival Point</h2>
          </div>
          <div className="flex flex-wrap gap-2 pb-1">
            <button onClick={downloadPdf} disabled={pdfState === "busy"} className="rounded-full bg-forest px-4 py-2 text-xs font-bold text-white hover:bg-leaf disabled:opacity-50 transition">{pdfState === "busy" ? "Generating..." : "📄 Analysis PDF"}</button>
            <button onClick={downloadPng} disabled={pngState === "busy"} className="rounded-full bg-mint px-4 py-2 text-xs font-bold text-forest hover:bg-leaf hover:text-white disabled:opacity-50 transition">{pngState === "busy" ? "Generating..." : "🖼️ PNG"}</button>
          </div>
        </div>

        <div className="mt-6 grid gap-4">
          <label className="text-sm font-bold text-forest">Fixed costs per month ₹<input type="number" value={fixedCosts} onChange={(e) => setFixedCosts(e.target.value)} placeholder="Rent + salaries + EMIs…" className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Selling price per unit ₹<input type="number" value={price} onChange={(e) => setPrice(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Variable cost per unit ₹<input type="number" value={variableCost} onChange={(e) => setVariableCost(e.target.value)} placeholder="Materials + direct costs" className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
        </div>

        {calc.valid && (
          <p className="mt-4 rounded-2xl bg-mint px-4 py-3 text-sm font-semibold text-forest/80">
            Every unit sold contributes <strong className="text-forest">{money(calc.contribution)}</strong> toward fixed costs ({money(Number(variableCost) || 0)} of the {money(Number(price) || 0)} price goes to making it).
          </p>
        )}

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-bold text-forest">Target monthly profit ₹ (optional)<input type="number" value={targetProfit} onChange={(e) => setTargetProfit(e.target.value)} placeholder="e.g. 40000" className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Current monthly unit sales (optional)<input type="number" value={currentUnits} onChange={(e) => setCurrentUnits(e.target.value)} placeholder="To see profit & safety margin" className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
        </div>

        {!calc.valid && (Number(fixedCosts) || 0) > 0 && (
          <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
            Selling price must exceed variable cost per unit — otherwise no volume ever breaks even.
          </p>
        )}
      </div>

      <article ref={paperRef} className="invoice-paper mx-auto h-fit w-full max-w-[780px] rounded-[2rem] border border-forest/10 bg-white p-6 shadow-[0_24px_80px_rgba(17,59,44,0.12)] md:p-8">
        <header className="border-b-2 border-forest pb-4">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-leaf">Break-even analysis</p>
          <h2 className="mt-2 text-2xl font-black text-forest">Monthly survival point</h2>
        </header>

        {calc.valid ? (
          <>
            <section className="mt-5 grid grid-cols-3 gap-3 text-center text-sm">
              <div className="rounded-xl bg-cream p-3"><p className="text-[10px] font-bold uppercase text-forest/55">Contribution / unit</p><p className="font-black text-forest">{money(calc.contribution)}</p></div>
              <div className="rounded-xl bg-cream p-3"><p className="text-[10px] font-bold uppercase text-forest/55">Fixed costs</p><p className="font-black text-forest">{money(Number(fixedCosts) || 0)}</p></div>
              <div className="rounded-xl bg-cream p-3"><p className="text-[10px] font-bold uppercase text-forest/55">Margin % on price</p><p className="font-black text-forest">{Math.round((calc.contribution / (Number(price) || 1)) * 100)}%</p></div>
            </section>

            <section className="mt-4 rounded-2xl bg-forest p-5 text-white">
              <p className="text-[10px] font-black uppercase tracking-widest text-white/60">Break-even point</p>
              <p className="mt-1 text-3xl font-black">{calc.beUnits.toLocaleString("en-IN")} units / month</p>
              <p className="mt-1 text-sm font-bold text-sun">= {money(calc.beRevenue)} monthly revenue · {money(Number(fixedCosts) || 0)} covers fixed costs, rest is variable spend</p>
            </section>

            {calc.targetUnits && (
              <section className="mt-3 rounded-2xl bg-sun/40 p-4 text-sm font-bold text-forest">
                To earn {money(Number(targetProfit) || 0)} profit per month, sell <strong>{calc.targetUnits.toLocaleString("en-IN")} units</strong> ({money(calc.targetUnits * (Number(price) || 0))} revenue).
              </section>
            )}

            {calc.currentProfit !== null && calc.currentUnitsSold !== null && (
              <section className={`mt-3 rounded-2xl p-4 text-sm ${calc.currentProfit >= 0 ? "bg-green-50" : "bg-red-50"}`}>
                <p className={`font-black ${calc.currentProfit >= 0 ? "text-green-700" : "text-red-600"}`}>
                  At {calc.currentUnitsSold.toLocaleString("en-IN")} units/month: {calc.currentProfit >= 0 ? `profit of ${money(calc.currentProfit)}` : `loss of ${money(-calc.currentProfit)}`}
                </p>
                {calc.marginOfSafety !== null && (
                  <p className="mt-1 font-semibold text-forest/75">Margin of safety: {Math.round(calc.marginOfSafety)}% — sales can drop that far before you hit break-even.</p>
                )}
              </section>
            )}
          </>
        ) : (
          <p className="mt-6 text-center text-sm font-semibold text-forest/50">Enter your cost structure to see the break-even point.</p>
        )}

        <footer className="mt-5 text-center text-[10px] font-semibold uppercase tracking-widest text-forest/35">Assumes constant price and variable cost per unit · Pro UPI QR</footer>
      </article>
    </div>
  );
}
