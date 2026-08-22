import { useEffect, useMemo, useRef, useState } from "react";
import { safeToPng, downloadDataUrl, notifyExportError } from "../lib/export-image";
import { amountInWordsInr } from "../lib/inr-words";

const draftKey = "proupiqr-salary-slip-draft";
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

function num(v: string) {
  return Math.max(0, Number(v) || 0);
}

function monthLabel(monthValue: string) {
  if (!monthValue) return "";
  const [y, m] = monthValue.split("-").map(Number);
  if (!y || !m) return monthValue;
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(new Date(y, m - 1, 1));
}

type RowKey =
  | "basic" | "hra" | "conveyance" | "special" | "otherEarn"
  | "pf" | "pt" | "tds" | "otherDed";

export function SalarySlipGenerator() {
  const today = new Date();
  const thisMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

  const [company, setCompany] = useState("ABC Solutions");
  const [companyAddress, setCompanyAddress] = useState("12 MG Road, Bengaluru 560001");
  const [employeeName, setEmployeeName] = useState("Ravi Sharma");
  const [employeeId, setEmployeeId] = useState("EMP-014");
  const [designation, setDesignation] = useState("Sales Executive");
  const [department, setDepartment] = useState("Sales");
  const [pan, setPan] = useState("");
  const [doj, setDoj] = useState("");
  const [payMonth, setPayMonth] = useState(thisMonth);
  const [payDate, setPayDate] = useState(today.toISOString().slice(0, 10));
  const [paidDays, setPaidDays] = useState("30");
  const [lopDays, setLopDays] = useState("0");
  const [rows, setRows] = useState<Record<RowKey, string>>({
    basic: "30000", hra: "15000", conveyance: "1600", special: "8400", otherEarn: "",
    pf: "3600", pt: "200", tds: "", otherDed: ""
  });
  const paperRef = useRef<HTMLDivElement | null>(null);
  const [pdfState, setPdfState] = useState<"idle" | "busy" | "error">("idle");
  const [pngState, setPngState] = useState<"idle" | "busy" | "error">("idle");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (!saved) return;
      const d = JSON.parse(saved);
      setCompany(d.company ?? company); setCompanyAddress(d.companyAddress ?? "");
      setEmployeeName(d.employeeName ?? ""); setEmployeeId(d.employeeId ?? "");
      setDesignation(d.designation ?? ""); setDepartment(d.department ?? "");
      setPan(d.pan ?? ""); setDoj(d.doj ?? "");
      setPayMonth(d.payMonth ?? thisMonth); setPayDate(d.payDate ?? today.toISOString().slice(0, 10));
      setPaidDays(String(d.paidDays ?? "30")); setLopDays(String(d.lopDays ?? "0"));
      if (d.rows) setRows((cur) => ({ ...cur, ...d.rows }));
    } catch {
      // Ignore broken local drafts.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localStorage.setItem(draftKey, JSON.stringify({ company, companyAddress, employeeName, employeeId, designation, department, pan, doj, payMonth, payDate, paidDays, lopDays, rows }));
  }, [company, companyAddress, employeeName, employeeId, designation, department, pan, doj, payMonth, payDate, paidDays, lopDays, rows]);

  const totals = useMemo(() => {
    const gross = num(rows.basic) + num(rows.hra) + num(rows.conveyance) + num(rows.special) + num(rows.otherEarn);
    const deductions = num(rows.pf) + num(rows.pt) + num(rows.tds) + num(rows.otherDed);
    return { gross, deductions, net: Math.max(0, gross - deductions) };
  }, [rows]);

  function setRow(key: RowKey, value: string) {
    setRows((cur) => ({ ...cur, [key]: value }));
  }

  async function renderPaper() {
    const el = paperRef.current;
    if (!el) throw new Error("Slip not ready");
    const clone = el.cloneNode(true) as HTMLDivElement;
    Object.assign(clone.style, {
      position: "fixed", left: "0", top: "0", zIndex: "-9999", opacity: "0", pointerEvents: "none",
      width: "800px", minWidth: "800px", maxWidth: "800px", padding: "36px", boxSizing: "border-box",
      height: "auto", boxShadow: "none", border: "none", borderRadius: "0"
    });
    document.body.appendChild(clone);
    await new Promise((r) => setTimeout(r, 250));
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

  function fileName() {
    const emp = (employeeName || "employee").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return `salary-slip-${emp}-${payMonth}`;
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

  async function shareOnWhatsapp() {
    try {
      const message = `*Salary Slip ${monthLabel(payMonth)}*\n` +
        `----------------------------\n` +
        `*Employee:* ${employeeName} (${employeeId})\n` +
        `*Gross:* ${money(totals.gross)} · *Deductions:* ${money(totals.deductions)}\n` +
        `*Net Pay:* ${money(totals.net)}\n\n` +
        `Generated free via Pro UPI QR (https://www.proupiqr.in)`;
      let shared = false;
      if (navigator.share && navigator.canShare) {
        try {
          const dataUrl = await renderPaper();
          const blob = await (await fetch(dataUrl)).blob();
          const file = new File([blob], `${fileName()}.png`, { type: "image/png" });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: `Salary Slip ${monthLabel(payMonth)}`, text: message });
            shared = true;
          }
        } catch (err) {
          if ((err as DOMException)?.name === "AbortError") return;
          console.warn("Native share unavailable.", err);
        }
      }
      if (!shared) {
        downloadDataUrl(await renderPaper(), `${fileName()}.png`);
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`, "_blank");
      }
    } catch (err) {
      console.error("Share failed:", err);
    }
  }

  const earnRows: [string, number][] = [
    ["Basic salary", num(rows.basic)],
    ["House rent allowance", num(rows.hra)],
    ["Conveyance allowance", num(rows.conveyance)],
    ["Special allowance", num(rows.special)],
    ["Other / bonus", num(rows.otherEarn)]
  ];
  const dedRows: [string, number][] = [
    ["Provident fund (EPF)", num(rows.pf)],
    ["Professional tax", num(rows.pt)],
    ["TDS / income tax", num(rows.tds)],
    ["Other deductions", num(rows.otherDed)]
  ];

  return (
    <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
      <div className="no-print rounded-[2rem] border border-white/75 bg-white/90 p-5 shadow-[0_18px_48px_rgba(17,59,44,0.08)]">
        <div className="flex flex-wrap gap-3 sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-leaf">Payslip builder</p>
            <h2 className="mt-1 text-2xl font-black text-forest">Issue Salary Slips Free</h2>
          </div>
          <div className="flex flex-wrap gap-2 pb-1">
            <button onClick={shareOnWhatsapp} className="rounded-full bg-[#25D366] px-4 py-2 text-xs font-bold text-white hover:bg-[#1da851] transition">💬 Share</button>
            <button onClick={downloadPdf} disabled={pdfState === "busy"} className="rounded-full bg-forest px-4 py-2 text-xs font-bold text-white hover:bg-leaf disabled:opacity-50 transition">{pdfState === "busy" ? "Generating..." : "📄 PDF"}</button>
            <button onClick={downloadPng} disabled={pngState === "busy"} className="rounded-full bg-mint px-4 py-2 text-xs font-bold text-forest hover:bg-leaf hover:text-white disabled:opacity-50 transition">{pngState === "busy" ? "Generating..." : "🖼️ PNG"}</button>
          </div>
        </div>

        <p className="mt-3 text-xs font-black uppercase tracking-[0.18em] text-forest/50">Employer</p>
        <div className="mt-2 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-bold text-forest">Company name<input value={company} onChange={(e) => setCompany(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Company address<input value={companyAddress} onChange={(e) => setCompanyAddress(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
        </div>

        <p className="mt-5 text-xs font-black uppercase tracking-[0.18em] text-forest/50">Employee</p>
        <div className="mt-2 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-bold text-forest">Full name<input value={employeeName} onChange={(e) => setEmployeeName(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Employee ID<input value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Designation<input value={designation} onChange={(e) => setDesignation(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Department<input value={department} onChange={(e) => setDepartment(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">PAN (optional)<input value={pan} onChange={(e) => setPan(e.target.value.toUpperCase())} maxLength={10} placeholder="ABCDE1234F" className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium uppercase outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Date of joining<input type="date" value={doj} onChange={(e) => setDoj(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
        </div>

        <p className="mt-5 text-xs font-black uppercase tracking-[0.18em] text-forest/50">Pay period</p>
        <div className="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm font-bold text-forest">Salary month<input type="month" value={payMonth} onChange={(e) => setPayMonth(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Pay date<input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Paid days<input type="number" min={1} max={31} value={paidDays} onChange={(e) => setPaidDays(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">LOP days<input type="number" min={0} max={31} value={lopDays} onChange={(e) => setLopDays(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
        </div>

        <p className="mt-5 text-xs font-black uppercase tracking-[0.18em] text-forest/50">Earnings &amp; deductions (₹)</p>
        <div className="mt-2 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 rounded-2xl bg-mint/60 p-3">
            <p className="text-xs font-black uppercase tracking-wide text-forest/60">Earnings</p>
            {([["basic", "Basic salary"], ["hra", "HRA"], ["conveyance", "Conveyance"], ["special", "Special allowance"], ["otherEarn", "Other / bonus"]] as const).map(([key, label]) => (
              <label key={key} className="flex items-center justify-between gap-2 text-xs font-bold text-forest">
                <span>{label}</span>
                <input type="number" value={rows[key]} onChange={(e) => setRow(key, e.target.value)} className="w-28 rounded-lg border border-forest/15 px-2 py-1.5 text-right outline-none focus:border-leaf" />
              </label>
            ))}
            <p className="flex justify-between border-t border-forest/10 pt-2 text-xs font-black text-forest"><span>Gross earnings</span><span>{money(totals.gross)}</span></p>
          </div>
          <div className="space-y-2 rounded-2xl bg-red-50/70 p-3">
            <p className="text-xs font-black uppercase tracking-wide text-forest/60">Deductions</p>
            {([["pf", "Provident fund"], ["pt", "Professional tax"], ["tds", "TDS"], ["otherDed", "Other"]] as const).map(([key, label]) => (
              <label key={key} className="flex items-center justify-between gap-2 text-xs font-bold text-forest">
                <span>{label}</span>
                <input type="number" value={rows[key]} onChange={(e) => setRow(key, e.target.value)} className="w-28 rounded-lg border border-forest/15 px-2 py-1.5 text-right outline-none focus:border-leaf" />
              </label>
            ))}
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setRow("pf", String(Math.round(num(rows.basic) * 0.12)))} className="rounded-full border border-forest/15 bg-white px-3 py-1 text-[11px] font-bold hover:border-leaf transition">PF 12%</button>
              <button type="button" onClick={() => setRow("pt", "200")} className="rounded-full border border-forest/15 bg-white px-3 py-1 text-[11px] font-bold hover:border-leaf transition">PT ₹200</button>
            </div>
            <p className="flex justify-between border-t border-forest/10 pt-2 text-xs font-black text-forest"><span>Total deductions</span><span>{money(totals.deductions)}</span></p>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between rounded-2xl bg-forest px-5 py-4 text-white">
          <span className="text-sm font-black uppercase tracking-widest">Net payable</span>
          <span className="text-2xl font-black">{money(totals.net)}</span>
        </div>
      </div>

      <article ref={paperRef} className="invoice-paper mx-auto h-fit w-full max-w-[800px] rounded-[2rem] border border-forest/10 bg-white p-6 shadow-[0_24px_80px_rgba(17,59,44,0.12)] md:p-9">
        <header className="flex flex-col gap-3 border-b-2 border-forest pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-2xl font-black uppercase tracking-tight text-forest">{company || "Your Company"}</h2>
            <p className="text-xs font-semibold text-forest/60">{companyAddress}</p>
          </div>
          <div className="rounded-xl bg-mint p-3 text-right">
            <p className="text-[10px] font-bold uppercase tracking-widest text-forest/55">Payslip for</p>
            <p className="text-sm font-black text-forest">{monthLabel(payMonth)}</p>
          </div>
        </header>

        <section className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 rounded-xl bg-cream p-4 text-sm sm:grid-cols-3">
          <p><span className="block text-[10px] font-bold uppercase text-forest/50">Employee</span><strong className="text-forest">{employeeName || "—"}</strong></p>
          <p><span className="block text-[10px] font-bold uppercase text-forest/50">Employee ID</span><strong className="text-forest">{employeeId || "—"}</strong></p>
          <p><span className="block text-[10px] font-bold uppercase text-forest/50">Designation</span><strong className="text-forest">{designation || "—"}</strong></p>
          <p><span className="block text-[10px] font-bold uppercase text-forest/50">Department</span><strong className="text-forest">{department || "—"}</strong></p>
          <p><span className="block text-[10px] font-bold uppercase text-forest/50">PAN</span><strong className="text-forest">{pan || "—"}</strong></p>
          <p><span className="block text-[10px] font-bold uppercase text-forest/50">Date of joining</span><strong className="text-forest">{doj || "—"}</strong></p>
          <p><span className="block text-[10px] font-bold uppercase text-forest/50">Paid days</span><strong className="text-forest">{paidDays || "—"}</strong></p>
          <p><span className="block text-[10px] font-bold uppercase text-forest/50">LOP days</span><strong className="text-forest">{lopDays || "0"}</strong></p>
          <p><span className="block text-[10px] font-bold uppercase text-forest/50">Pay date</span><strong className="text-forest">{payDate}</strong></p>
        </section>

        <section className="mt-4 overflow-hidden rounded-xl border border-forest/10">
          <table className="w-full text-left text-sm">
            <thead><tr className="bg-mint text-[10px] uppercase tracking-widest text-forest/65"><th className="p-2.5">Earnings</th><th className="p-2.5 text-right">Amount</th></tr></thead>
            <tbody>
              {earnRows.map(([label, val]) => val > 0 && (
                <tr key={label} className="border-t border-forest/5"><td className="p-2.5 font-semibold text-forest">{label}</td><td className="p-2.5 text-right tabular-nums">{money(val)}</td></tr>
              ))}
              <tr className="border-t-2 border-forest/20 bg-cream/70"><td className="p-2.5 font-black text-forest">Gross earnings</td><td className="p-2.5 text-right font-black tabular-nums">{money(totals.gross)}</td></tr>
              {dedRows.map(([label, val]) => val > 0 && (
                <tr key={label} className="border-t border-forest/5"><td className="p-2.5 font-semibold text-forest/85">{label}</td><td className="p-2.5 text-right tabular-nums">− {money(val)}</td></tr>
              ))}
              <tr className="border-t-2 border-forest/20 bg-cream/70"><td className="p-2.5 font-black text-forest">Total deductions</td><td className="p-2.5 text-right font-black tabular-nums">{money(totals.deductions)}</td></tr>
            </tbody>
          </table>
        </section>

        <section className="mt-4 rounded-xl bg-forest p-4 text-white">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-white/60">Net salary payable</p>
              <p className="text-3xl font-black">{money(totals.net)}</p>
            </div>
            <p className="max-w-[55%] text-right text-xs font-semibold leading-5 text-sun">{amountInWordsInr(totals.net)}</p>
          </div>
        </section>

        <footer className="mt-5 flex items-end justify-between text-xs text-forest/60">
          <p>This is a computer-generated payslip and does not require a physical signature.</p>
          <p className="shrink-0 pl-4 text-[10px] font-semibold uppercase tracking-widest text-forest/40">Pro UPI QR</p>
        </footer>
      </article>
    </div>
  );
}
