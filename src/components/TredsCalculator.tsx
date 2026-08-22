import { useEffect, useMemo, useRef, useState } from "react";
import { safeToPng, downloadDataUrl, notifyExportError } from "../lib/export-image";

const draftKey = "proupiqr-treds-draft";
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

export function TredsCalculator() {
  const [invoiceAmount, setInvoiceAmount] = useState("1000000");
  const [discountRate, setDiscountRate] = useState("11");
  const [daysToMaturity, setDaysToMaturity] = useState("90");
  const [platformCharges, setPlatformCharges] = useState("");
  const paperRef = useRef<HTMLDivElement | null>(null);
  const [pdfState, setPdfState] = useState<"idle" | "busy" | "error">("idle");
  const [pngState, setPngState] = useState<"idle" | "busy" | "error">("idle");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (!saved) return;
      const d = JSON.parse(saved);
      setInvoiceAmount(String(d.invoiceAmount ?? "1000000"));
      setDiscountRate(String(d.discountRate ?? "11"));
      setDaysToMaturity(String(d.daysToMaturity ?? "90"));
      setPlatformCharges(String(d.platformCharges ?? ""));
    } catch {
      // Ignore broken local drafts.
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(draftKey, JSON.stringify({ invoiceAmount, discountRate, daysToMaturity, platformCharges }));
  }, [invoiceAmount, discountRate, daysToMaturity, platformCharges]);

  const calc = useMemo(() => {
    const invoice = Math.max(0, Number(invoiceAmount) || 0);
    const rate = Math.max(0, Number(discountRate) || 0);
    const days = Math.max(1, Math.min(365, Number(daysToMaturity) || 1));
    const charges = Math.max(0, Number(platformCharges) || 0);

    const discount = invoice * (rate / 100) * (days / 365);
    const netProceeds = Math.max(0, invoice - discount - charges);
    const totalCost = discount + charges;
    const effectiveAnnual = netProceeds > 0 ? (totalCost / netProceeds) * (365 / days) * 100 : 0;

    return { invoice, discount, netProceeds, totalCost, effectiveAnnual, days, charges };
  }, [invoiceAmount, discountRate, daysToMaturity, platformCharges]);

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
    return `treds-net-proceeds-${calc.days}d`;
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
            <p className="text-xs font-black uppercase tracking-[0.2em] text-leaf">Invoice liquidity</p>
            <h2 className="mt-1 text-2xl font-black text-forest">Price Your TReDS Bid</h2>
          </div>
          <div className="flex flex-wrap gap-2 pb-1">
            <button onClick={downloadPdf} disabled={pdfState === "busy"} className="rounded-full bg-forest px-4 py-2 text-xs font-bold text-white hover:bg-leaf disabled:opacity-50 transition">{pdfState === "busy" ? "Generating..." : "📄 PDF"}</button>
            <button onClick={downloadPng} disabled={pngState === "busy"} className="rounded-full bg-mint px-4 py-2 text-xs font-bold text-forest hover:bg-leaf hover:text-white disabled:opacity-50 transition">{pngState === "busy" ? "Generating..." : "🖼️ PNG"}</button>
          </div>
        </div>

        <p className="mt-3 rounded-2xl bg-mint px-4 py-2.5 text-xs leading-5 font-semibold text-forest/75">
          TReDS lets registered MSMEs auction accepted invoices from large buyers for near-immediate cash. Financiers quote a discount rate — enter their bid here to see exactly what lands in your account.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-bold text-forest sm:col-span-2">Invoice value ₹<input type="number" value={invoiceAmount} onChange={(e) => setInvoiceAmount(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Financier discount rate % p.a.<input type="number" step="0.25" value={discountRate} onChange={(e) => setDiscountRate(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Days until buyer pays<input type="number" min={1} max={365} value={daysToMaturity} onChange={(e) => setDaysToMaturity(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest sm:col-span-2">Platform / transaction charges ₹ (optional)<input type="number" value={platformCharges} onChange={(e) => setPlatformCharges(e.target.value)} placeholder="If your platform quotes flat fees" className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
        </div>

        <p className="mt-4 text-xs leading-5 font-semibold text-forest/55">
          Compare bids side-by-side: a lower headline rate over fewer days is not always cheaper — the effective annualised figure is what matters.
        </p>
      </div>

      <article ref={paperRef} className="invoice-paper mx-auto h-fit w-full max-w-[780px] rounded-[2rem] border border-forest/10 bg-white p-6 shadow-[0_24px_80px_rgba(17,59,44,0.12)] md:p-8">
        <header className="flex items-start justify-between border-b-2 border-forest pb-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-leaf">TReDS discounting projection</p>
            <h2 className="mt-2 text-2xl font-black text-forest">{money(calc.invoice)} invoice · {calc.days}-day tenor</h2>
          </div>
          <div className="rounded-xl bg-mint p-3 text-right">
            <p className="text-[10px] font-bold text-forest/60">You receive today</p>
            <p className="text-lg font-black text-forest">{money(calc.netProceeds)}</p>
          </div>
        </header>

        <section className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between"><span className="font-semibold text-forest/75">Invoice value (receivable at maturity)</span><strong className="tabular-nums">{money(calc.invoice)}</strong></div>
          <div className="flex justify-between"><span className="font-semibold text-forest/75">Financier discount @ {Number(discountRate) || 0}% for {calc.days} days</span><strong className="tabular-nums text-red-600">− {money(calc.discount)}</strong></div>
          {calc.charges > 0 && <div className="flex justify-between"><span className="font-semibold text-forest/75">Platform charges</span><strong className="tabular-nums text-red-600">− {money(calc.charges)}</strong></div>}
          <div className="flex justify-between border-t-2 border-forest pt-2 text-base"><span className="font-black text-forest">Net proceeds now</span><strong className="font-black tabular-nums text-forest">{money(calc.netProceeds)}</strong></div>
          <div className="flex justify-between"><span className="font-semibold text-forest/60">Effective annualised cost of funds</span><strong className="tabular-nums text-forest">{calc.effectiveAnnual.toFixed(2)}%</strong></div>
        </section>

        <section className="mt-4 rounded-xl bg-cream p-4 text-xs leading-5 text-forest/70">
          <strong className="text-forest">Decision guide:</strong> compare the effective annualised figure against your overdraft rate and the cost of starving operations while waiting. For large creditworthy buyers, TReDS bids usually undercut emergency borrowing comfortably — and your buyer never knows you discounted.
        </section>

        <footer className="mt-3 text-center text-[10px] font-semibold uppercase tracking-widest text-forest/35">Illustrative computation · RXIL / Invoicemart / M1xchange terms may vary · Pro UPI QR</footer>
      </article>
    </div>
  );
}
