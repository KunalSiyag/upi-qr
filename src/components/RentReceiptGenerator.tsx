import { useEffect, useMemo, useRef, useState } from "react";
import { safeToPng, downloadDataUrl, notifyExportError } from "../lib/export-image";
import { amountInWordsInr } from "../lib/inr-words";

export { amountInWordsInr };

const draftKey = "proupiqr-rent-receipt-draft";
const paymentModes = ["Bank Transfer / UPI", "Cash", "Cheque"] as const;

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

function monthLabel(monthValue: string) {
  if (!monthValue) return "";
  const [y, m] = monthValue.split("-").map(Number);
  if (!y || !m) return monthValue;
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(new Date(y, m - 1, 1));
}

export function RentReceiptGenerator() {
  const [landlord, setLandlord] = useState("Ramesh Kumar");
  const [landlordPan, setLandlordPan] = useState("");
  const [tenant, setTenant] = useState("Suresh Sharma");
  const [address, setAddress] = useState("Flat 402, Green Residency, Bengaluru 560001");
  const [rentAmount, setRentAmount] = useState("25000");
  const [periodMonth, setPeriodMonth] = useState(new Date().toISOString().slice(0, 7));
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMode, setPaymentMode] = useState<(typeof paymentModes)[number]>("Bank Transfer / UPI");
  const [receiptNo, setReceiptNo] = useState("RR-0001");
  const [referenceNo, setReferenceNo] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (!saved) return;
      const d = JSON.parse(saved);
      setLandlord(d.landlord ?? "Ramesh Kumar");
      setLandlordPan(d.landlordPan ?? "");
      setTenant(d.tenant ?? "Suresh Sharma");
      setAddress(d.address ?? "");
      setRentAmount(d.rentAmount ?? "25000");
      setPeriodMonth(d.periodMonth ?? new Date().toISOString().slice(0, 7));
      setPaidOn(d.paidOn ?? new Date().toISOString().slice(0, 10));
      setPaymentMode(paymentModes.includes(d.paymentMode) ? d.paymentMode : "Bank Transfer / UPI");
      setReceiptNo(d.receiptNo ?? "RR-0001");
      setReferenceNo(d.referenceNo ?? "");
    } catch {
      // Ignore broken local drafts and keep the built-in sample.
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(draftKey, JSON.stringify({ landlord, landlordPan, tenant, address, rentAmount, periodMonth, paidOn, paymentMode, receiptNo, referenceNo }));
  }, [landlord, landlordPan, tenant, address, rentAmount, periodMonth, paidOn, paymentMode, receiptNo, referenceNo]);

  const amount = useMemo(() => Math.max(0, Number(rentAmount) || 0), [rentAmount]);

  const upiUrl = useMemo(() => {
    const params = new URLSearchParams({ pa: "merchant@upi", pn: landlord || "Landlord", cu: "INR" });
    if (amount > 0) params.set("am", amount.toFixed(2));
    params.set("tn", `Rent ${periodMonth}`.slice(0, 50));
    return `upi://pay?${params.toString()}`;
  }, [amount, landlord, periodMonth]);

  useEffect(() => {
    import("qrcode").then(({ default: QR }) => QR.toDataURL(upiUrl, { margin: 2, width: 320, errorCorrectionLevel: "H", color: { dark: "#113b2c", light: "#ffffff" } }))
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [upiUrl]);

  const paperRef = useRef<HTMLDivElement | null>(null);
  const [pdfState, setPdfState] = useState<"idle" | "busy" | "error">("idle");
  const [pngState, setPngState] = useState<"idle" | "busy" | "error">("idle");
  const [shareState, setShareState] = useState<"idle" | "busy">("idle");

  async function renderPaper() {
    const el = paperRef.current;
    if (!el) throw new Error("Receipt preview not ready");
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
      const dataUrl = await safeToPng(clone, {
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
      return dataUrl;
    } finally {
      document.body.removeChild(clone);
    }
  }

  function fileName() {
    return (receiptNo || "rent-receipt").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  function triggerDownload(href: string, ext: string) {
    downloadDataUrl(href, `${fileName()}.${ext}`);
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
      console.error("PDF download failed:", err); notifyExportError("PDF export failed — please retry.");
      setPdfState("error");
    }
  }

  async function downloadPng() {
    try {
      setPngState("busy");
      triggerDownload(await renderPaper(), "png");
      setPngState("idle");
    } catch (err) {
      console.error("PNG download failed:", err); notifyExportError("PNG export failed — try the PDF instead.");
      setPngState("error");
    }
  }

  async function shareOnWhatsapp() {
    if (shareState === "busy") return;
    try {
      setShareState("busy");
      const message = `*Rent Receipt ${receiptNo}*\n` +
        `*Tenant:* ${tenant}\n*Period:* ${monthLabel(periodMonth)}\n*Rent Paid:* ${money(amount)}\n*Mode:* ${paymentMode}\n\n` +
        `Generated free via Pro UPI QR (https://www.proupiqr.in)`;
      let shared = false;
      if (navigator.share && navigator.canShare) {
        try {
          const dataUrl = await renderPaper();
          const blob = await (await fetch(dataUrl)).blob();
          const file = new File([blob], `${fileName()}.png`, { type: "image/png" });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: `Rent Receipt ${receiptNo}`, text: message });
            shared = true;
          }
        } catch (err) {
          if ((err as DOMException)?.name === "AbortError") { setShareState("idle"); return; }
          console.warn("Native share unavailable, falling back.", err);
        }
      }
      if (!shared) {
        triggerDownload(await renderPaper(), "png");
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`, "_blank");
      }
      setShareState("idle");
    } catch (err) {
      console.error("Share failed:", err);
      setShareState("idle");
    }
  }

  function nextMonth() {
    const [y, m] = periodMonth.split("-").map(Number);
    const d = new Date(y, m, 1);
    setPeriodMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    setReceiptNo((current) => current.replace(/(\d+)$/, (n) => String(Number(n) + 1).padStart(n.length, "0")));
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[0.92fr_1.08fr]">
      <div className="no-print rounded-[2rem] border border-white/75 bg-white/90 p-5 shadow-[0_18px_48px_rgba(17,59,44,0.08)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-forest/5 pb-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-leaf">Rent receipt builder</p>
            <h2 className="mt-1 text-2xl font-black text-forest">Create Rent Receipt</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={shareOnWhatsapp} disabled={shareState === "busy"} className="rounded-full bg-[#25D366] px-4 py-2 text-xs font-bold text-white hover:bg-[#1da851] disabled:opacity-50 transition">{shareState === "busy" ? "Preparing…" : "💬 WhatsApp Share"}</button>
            <button onClick={downloadPdf} disabled={pdfState === "busy"} className="rounded-full bg-forest px-4 py-2 text-xs font-bold text-white hover:bg-leaf disabled:opacity-50 transition">{pdfState === "busy" ? "Generating..." : "📄 Download PDF"}</button>
            <button onClick={downloadPng} disabled={pngState === "busy"} className="rounded-full bg-mint px-4 py-2 text-xs font-bold text-forest hover:bg-leaf hover:text-white disabled:opacity-50 transition">{pngState === "busy" ? "Generating..." : "🖼️ Download PNG"}</button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-bold text-forest">Landlord name<input value={landlord} onChange={(e) => setLandlord(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Landlord PAN (optional)<input value={landlordPan} onChange={(e) => setLandlordPan(e.target.value.toUpperCase())} placeholder="ABCDE1234F" maxLength={10} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium uppercase outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Tenant name<input value={tenant} onChange={(e) => setTenant(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Monthly rent ₹<input type="number" value={rentAmount} onChange={(e) => setRentAmount(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest sm:col-span-2">Property address<input value={address} onChange={(e) => setAddress(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Rent period<input type="month" value={periodMonth} onChange={(e) => setPeriodMonth(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Paid on<input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Payment mode<select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as (typeof paymentModes)[number])} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf">{paymentModes.map((mode) => <option key={mode}>{mode}</option>)}</select></label>
          <label className="text-sm font-bold text-forest">Receipt number<input value={receiptNo} onChange={(e) => setReceiptNo(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Reference / UTR (optional)<input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button onClick={nextMonth} className="rounded-full border border-forest/15 bg-mint px-4 py-2 text-xs font-bold text-forest hover:bg-leaf hover:text-white transition">📅 Next month + new number</button>
          <p className="text-xs font-semibold text-forest/60">Tenants claiming HRA usually need one signed receipt per month.</p>
        </div>
      </div>

      <article ref={paperRef} className="invoice-paper mx-auto w-full max-w-[820px] rounded-[2rem] border border-forest/10 bg-white p-6 shadow-[0_24px_80px_rgba(17,59,44,0.12)] md:p-9">
        <header className="flex flex-col gap-4 border-b-2 border-forest pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-leaf">Rent receipt</p>
            <h2 className="mt-2 text-3xl font-black text-forest">Receipt No. {receiptNo}</h2>
          </div>
          <div className="rounded-2xl bg-mint p-4 text-right">
            <p className="text-xs font-semibold text-forest/65">Date of payment</p>
            <p className="text-sm font-black text-forest">{paidOn}</p>
            <p className="mt-1 text-xs font-semibold text-forest/65">Period</p>
            <p className="text-sm font-black text-forest">{monthLabel(periodMonth)}</p>
          </div>
        </header>

        <section className="mt-6 grid gap-4 sm:grid-cols-[1fr_auto]">
          <div className="rounded-2xl bg-forest p-4 text-white">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-white/60">Rent received</p>
            <p className="mt-2 text-3xl font-black">{money(amount)}</p>
            <p className="mt-1 text-sm font-semibold text-sun">{amountInWordsInr(amount)}</p>
          </div>
          {qrDataUrl && <div className="rounded-2xl border border-dashed border-forest/20 p-3 text-center"><img src={qrDataUrl} alt="UPI QR for this rent amount" className="mx-auto h-24 w-24 rounded-lg border border-forest/10" /><p className="mt-1 text-[10px] font-bold text-forest/60">Scan to pay next rent</p></div>}
        </section>

        <section className="mt-6 space-y-3 rounded-2xl bg-cream p-5 text-base leading-8 text-forest/85">
          <p>Received with thanks from <strong className="font-black text-forest">{tenant || "Tenant Name"}</strong> a sum of <strong className="font-black text-forest">{money(amount)}</strong> ({amountInWordsInr(amount)}) by way of <strong className="font-black text-forest">{paymentMode}</strong>{referenceNo ? <> (Ref: {referenceNo})</> : null} towards rent of the premises at <strong className="font-black text-forest">{address || "property address"}</strong> for the period of <strong className="font-black text-forest">{monthLabel(periodMonth)}</strong>.</p>
        </section>

        <footer className="mt-8 flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex h-28 w-32 flex-col items-center justify-center rounded-xl border-2 border-dashed border-forest/30 text-center text-[10px] font-bold uppercase tracking-widest text-forest/45">
            <span>Affix</span><span>Revenue</span><span>Stamp</span><span className="mt-1 normal-case">(if paid in cash)</span>
          </div>
          <div className="text-right">
            <p className="border-t border-forest/40 pt-2 text-lg font-black text-forest">{landlord || "Landlord Name"}</p>
            <p className="text-xs font-semibold text-forest/60">Landlord{landlordPan ? ` · PAN: ${landlordPan}` : ""}</p>
          </div>
        </footer>
      </article>
    </div>
  );
}
