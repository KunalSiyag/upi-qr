import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { DocLang } from "../data/documentLang";
import { SALARY_PHRASES } from "../data/salaryPhrases";
import { downloadDataUrl, notifyExportError } from "../lib/export-image";
import { renderPaperPng, savePaperPdf } from "../lib/exportPaper";
import { TAX_RULES_REVIEWED_ON } from "../lib/incomeTax";
import { compact, fill, rupees } from "../lib/loanFormat";
import { parseOptionalPaise, parsePaise } from "../lib/loanMath";
import { localTranslator } from "../lib/localPhrases";
import { trackProductEvent } from "../lib/productEvents";
import { parsePercentBps } from "../lib/freelanceRate";
import { salaryBreakdown, type SalaryResult } from "../lib/salary";

const TOOL = "salary-calculator";
const draftKey = "proupiqr-salary-draft";

const fieldClass = "mt-2 w-full rounded-[10px] border border-pebble bg-white px-3.5 py-2.5 font-medium text-forest outline-none focus:border-leaf";
const labelClass = "text-sm font-semibold text-forest";
const hintClass = "mt-1.5 text-xs font-medium text-muted";

type Fields = {
  ctc: string; basicPct: string; hraPct: string; pf: "full" | "ceiling"; gratuity: boolean; pt: string; regime: "new" | "old";
  rent: string; listed: boolean; other80c: string; health: string; hl: string; nps1b: string;
};
const DEFAULTS: Fields = { ctc: "1200000", basicPct: "40", hraPct: "50", pf: "full", gratuity: false, pt: "2400", regime: "new", rent: "", listed: true, other80c: "", health: "", hl: "", nps1b: "" };

export function SalaryCalculator({ lang = "en" }: { lang?: DocLang } = {}) {
  const tr = useMemo(() => localTranslator(lang, SALARY_PHRASES), [lang]);
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;
  const [f, setF] = useState<Fields>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const set = <K extends keyof Fields>(key: K) => (value: Fields[K]) => setF((prev) => ({ ...prev, [key]: value }));

  const paperRef = useRef<HTMLDivElement | null>(null);
  const [pdfState, setPdfState] = useState<"idle" | "busy" | "error">("idle");
  const [pngState, setPngState] = useState<"idle" | "busy" | "error">("idle");

  useEffect(() => {
    let draft: Record<string, unknown> = {};
    try {
      draft = JSON.parse(localStorage.getItem(draftKey) || "{}") ?? {};
    } catch {
      // A broken draft is ignored.
    }
    const next: Fields = { ...DEFAULTS };
    for (const key of Object.keys(DEFAULTS) as (keyof Fields)[]) {
      const v = draft[key];
      if (typeof DEFAULTS[key] === "boolean") { if (typeof v === "boolean") (next[key] as boolean) = v; }
      else if (key === "pf") { if (v === "full" || v === "ceiling") next.pf = v; }
      else if (key === "regime") { if (v === "new" || v === "old") next.regime = v; }
      else if (typeof v === "string") (next[key] as string) = v;
    }
    setF(next);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify(f));
    } catch {
      // Private mode or full storage: the tool still works.
    }
  }, [loaded, f]);

  const calc = useMemo(() => {
    const errors: Record<string, string> = {};
    const ctc = parsePaise(f.ctc);
    const basicBps = parsePercentBps(f.basicPct, 100, 10000);
    const hraBps = parsePercentBps(f.hraPct, 0, 10000);
    const opt = (key: keyof Fields) => parseOptionalPaise(String(f[key]));
    const o = { pt: opt("pt"), rent: opt("rent"), other80c: opt("other80c"), health: opt("health"), hl: opt("hl"), nps1b: opt("nps1b") };
    if (ctc === null || ctc === 0) errors.ctc = tr("Enter your yearly CTC.");
    if (basicBps === null) errors.basicPct = tr("Enter a percentage from 1 to 100.");
    if (hraBps === null) errors.hraPct = tr("Enter a percentage from 0 to 100.");
    for (const [k, v] of Object.entries(o)) if (v === null) errors[k] = tr("Enter an amount, or leave it empty.");
    if (Object.keys(errors).length > 0 || ctc === null || basicBps === null || hraBps === null || Object.values(o).some((v) => v === null)) return { errors, result: null as SalaryResult | null };
    const v = o as Record<string, number>;
    const result = salaryBreakdown({ ctc, basicBps, hraBps, pfOnCeiling: f.pf === "ceiling", gratuity: f.gratuity, professionalTax: v.pt, regime: f.regime, rentMonth: v.rent, listedCity: f.listed, other80c: v.other80c, health: v.health, homeLoanInterest: v.hl, nps1b: v.nps1b });
    if (result === null) errors.structure = tr("Basic, HRA and PF take up more than your CTC. Lower the basic or HRA share.");
    return { errors, result };
  }, [f, tr]);

  const { result } = calc;
  const hasErrors = Object.keys(calc.errors).length > 0;
  const ctcHint = parsePaise(f.ctc) !== null ? compact(parsePaise(f.ctc) ?? 0, tr) : null;
  const fileName = "salary-breakdown";
  const regimeName = (r: "new" | "old") => (r === "new" ? tr("New regime") : tr("Old regime"));
  const m = (n: number) => rupees(Math.round(n / 12));

  async function downloadPdf() {
    try {
      setPdfState("busy");
      await savePaperPdf(paperRef.current, fileName);
      trackProductEvent("export_pdf", TOOL);
      setPdfState("idle");
    } catch (err) {
      console.error("PDF failed:", err);
      notifyExportError("PDF export failed — please retry.");
      setPdfState("error");
    }
  }

  async function downloadPng() {
    try {
      setPngState("busy");
      downloadDataUrl(await renderPaperPng(paperRef.current), `${fileName}.png`);
      trackProductEvent("export_png", TOOL);
      setPngState("idle");
    } catch (err) {
      console.error("PNG failed:", err);
      notifyExportError("PNG export failed — try the PDF instead.");
      setPngState("error");
    }
  }

  const err = (key: string) => (calc.errors[key] ? <p id={id(`${key}-err`)} role="alert" className="mt-1.5 text-xs font-semibold text-coral">{calc.errors[key]}</p> : null);
  const field = (key: keyof Fields, label: string, hint?: string, decimal = false) => (
    <div>
      <label htmlFor={id(key)} className={labelClass}>{label}</label>
      <input id={id(key)} inputMode={decimal ? "decimal" : "numeric"} autoComplete="off" value={String(f[key])} onChange={(e) => set(key)(e.target.value as never)} aria-invalid={Boolean(calc.errors[key])} aria-describedby={id(`${key}-err`)} className={fieldClass} />
      {key === "ctc" && ctcHint && !calc.errors.ctc ? <p className={hintClass}>{ctcHint}</p> : null}
      {hint ? <p className={hintClass}>{hint}</p> : null}
      {err(key)}
    </div>
  );
  const check = (key: "gratuity" | "listed", label: string) => (
    <label className="flex items-center gap-2 text-sm font-medium text-forest">
      <input type="checkbox" checked={f[key]} onChange={(e) => set(key)(e.target.checked)} className="h-4 w-4 accent-[#1c1d1f]" />
      {label}
    </label>
  );

  const lines: [string, number][] = result
    ? [[tr("Basic"), result.basic], [tr("House rent allowance"), result.hra], [tr("Special allowance"), result.special], [tr("Gross salary"), result.gross], [tr("Employee PF"), -result.employeePf], [tr("Professional tax"), -result.professionalTax], [tr("Income tax"), -result.tax], [tr("In-hand salary"), result.takeHome]]
    : [];
  const fmt = (n: number) => (n < 0 ? `−${rupees(-n)}` : rupees(n));

  return (
    <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
      <div className="no-print rounded-[14px] border border-hairline bg-white p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-leaf">{tr("Salary calculator")}</p>
            <h2 className="mt-1 text-2xl font-black text-forest">{tr("From CTC to in-hand salary")}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={downloadPdf} disabled={pdfState === "busy" || !result} className="rounded-[10px] bg-forest px-4 py-2 text-xs font-bold text-white hover:bg-graphite disabled:opacity-50">{pdfState === "busy" ? tr("Generating...") : tr("Plan PDF")}</button>
            <button type="button" onClick={downloadPng} disabled={pngState === "busy" || !result} className="rounded-[10px] bg-white px-4 py-2 text-xs font-bold text-forest ring-1 ring-pebble hover:bg-fog disabled:opacity-50">{pngState === "busy" ? tr("Generating...") : "PNG"}</button>
          </div>
        </div>
        <p className={hintClass}>{fill(tr("Tax year 2026-27. Tax rules checked on {date}."), { date: TAX_RULES_REVIEWED_ON })}</p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {field("ctc", tr("CTC per year"))}
          <div>
            <label htmlFor={id("regime")} className={labelClass}>{tr("Tax regime")}</label>
            <select id={id("regime")} value={f.regime} onChange={(e) => set("regime")(e.target.value as "new" | "old")} className={fieldClass}>
              <option value="new">{tr("New regime")}</option>
              <option value="old">{tr("Old regime")}</option>
            </select>
          </div>
          {field("basicPct", tr("Basic as a share of CTC (%)"), tr("See your offer letter."), true)}
          {field("hraPct", tr("HRA as a share of basic (%)"), undefined, true)}
          <div>
            <label htmlFor={id("pf")} className={labelClass}>{tr("PF is worked out on")}</label>
            <select id={id("pf")} value={f.pf} onChange={(e) => set("pf")(e.target.value as "full" | "ceiling")} className={fieldClass}>
              <option value="full">{tr("The full basic")}</option>
              <option value="ceiling">{tr("Basic up to ₹25,000 a month")}</option>
            </select>
            <p className={hintClass}>{tr("12% from you and 12% from your employer. Employers differ; check your offer letter.")}</p>
          </div>
          {field("pt", tr("Professional tax per year"), tr("Your state's amount. It is usually up to about ₹2,500 a year."))}
        </div>
        <div className="mt-3">{check("gratuity", tr("My CTC includes the employer's gratuity (15/26 of a month's basic per year)"))}</div>
        {err("structure")}

        {f.regime === "old" ? (
          <fieldset className="mt-5 rounded-[12px] border border-hairline p-4">
            <legend className="px-1 text-sm font-semibold text-leaf">{tr("Old regime deductions (optional)")}</legend>
            <p className={hintClass}>{tr("Your PF counts towards the ₹1,50,000 limit on 80C automatically.")}</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {field("rent", tr("Rent you pay per month"), tr("For the HRA exemption."))}
              {field("other80c", tr("Other 80C investments per year"))}
              {field("health", tr("Health insurance per year"))}
              {field("hl", tr("Home loan interest per year"))}
              {field("nps1b", tr("Extra NPS contribution per year"))}
            </div>
            <div className="mt-3">{check("listed", tr("I live in one of the 8 HRA cities (50%)"))}</div>
          </fieldset>
        ) : null}

        <div aria-live="polite" className="mt-6">
          {result ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[12px] bg-forest p-4 text-white"><p className="text-xs font-semibold text-white/65">{tr("In-hand salary per month")}</p><p className="mt-1 text-3xl font-black tabular-nums">{rupees(result.takeHomeMonth)}</p></div>
                <div className="rounded-[12px] bg-fog p-4"><p className="text-xs font-semibold text-muted">{tr("In-hand salary per year")}</p><p className="mt-1 text-2xl font-black text-forest tabular-nums">{rupees(result.takeHome)}</p></div>
              </div>
              <p className="mt-4 text-sm font-medium text-charcoal">{fill(tr("Income tax is {tax} a year under the {regime}."), { tax: rupees(result.tax), regime: regimeName(f.regime) })}</p>
              <p className="mt-1 text-sm font-medium text-charcoal">{fill(tr("Under the {regime} your in-hand salary would be {amount} a month."), { regime: regimeName(result.other.regime), amount: rupees(result.other.takeHomeMonth) })}</p>
            </>
          ) : hasErrors && !calc.errors.structure ? (
            <p className="rounded-[12px] bg-fog p-4 text-sm font-semibold text-muted">{tr("Fix the highlighted fields to see your salary.")}</p>
          ) : null}
          <p className={hintClass}>{tr("An estimate. Employer contributions above ₹7.5 lakh a year, ESIC, bonuses and arrears are not modelled, and this is not tax advice.")}</p>
        </div>
      </div>

      <article ref={paperRef} className="invoice-paper mx-auto h-fit w-full max-w-[780px] rounded-[14px] border border-hairline bg-white p-6 shadow-card md:p-8">
        <header className="flex items-start justify-between gap-4 border-b-2 border-forest pb-4">
          <div>
            <p className="text-sm font-semibold text-leaf">{tr("Salary breakdown")}</p>
            <h2 className="mt-1 text-2xl font-black text-forest">{result ? fill(tr("CTC {ctc}"), { ctc: rupees(parsePaise(f.ctc) ?? 0) }) : tr("Salary breakdown")}</h2>
            <p className="text-xs font-medium text-muted">{regimeName(f.regime)} · {fill(tr("Tax rules checked on {date}."), { date: TAX_RULES_REVIEWED_ON })}</p>
          </div>
          <div className="rounded-[10px] bg-fog p-3 text-right">
            <p className="text-xs font-semibold text-muted">{tr("In-hand salary per month")}</p>
            <p className="text-lg font-black text-forest tabular-nums">{result ? rupees(result.takeHomeMonth) : "—"}</p>
          </div>
        </header>
        {result ? (
          <>
            <table className="mt-4 w-full text-left text-sm">
              <thead>
                <tr className="border-b border-pebble text-xs text-muted">
                  <th className="py-2 font-semibold" />
                  <th className="py-2 text-right font-semibold">{tr("Per month")}</th>
                  <th className="py-2 text-right font-semibold">{tr("Per year")}</th>
                </tr>
              </thead>
              <tbody>
                {lines.map(([label, value], i) => (
                  <tr key={label} className={`border-b border-hairline ${i === 3 || i === 7 ? "font-black" : ""}`}>
                    <td className="py-1.5 text-forest">{label}</td>
                    <td className="py-1.5 text-right tabular-nums">{value < 0 ? `−${m(-value)}` : m(value)}</td>
                    <td className="py-1.5 text-right tabular-nums">{fmt(value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-4 text-sm font-semibold text-leaf">{tr("The rest of your CTC")}</p>
            <table className="mt-2 w-full text-left text-sm">
              <tbody>
                <tr className="border-b border-hairline"><td className="py-1.5 text-forest">{tr("Employer PF")}</td><td className="py-1.5 text-right tabular-nums">{rupees(result.employerPf)}</td></tr>
                {result.gratuity > 0 ? <tr className="border-b border-hairline"><td className="py-1.5 text-forest">{tr("Gratuity")}</td><td className="py-1.5 text-right tabular-nums">{rupees(result.gratuity)}</td></tr> : null}
                <tr><td className="py-1.5 font-black text-forest">{tr("Taxable income after deductions")}</td><td className="py-1.5 text-right font-black tabular-nums">{rupees(result.taxableIncome)}</td></tr>
              </tbody>
            </table>
          </>
        ) : (
          <p className="mt-6 text-sm font-semibold text-muted">{tr("Fix the highlighted fields to see your salary.")}</p>
        )}
        <footer className="mt-4 text-center text-xs font-medium text-muted">{tr("Indicative only. Check your offer letter and payslip, and the current tax rules.")} · Pro UPI QR</footer>
      </article>
    </div>
  );
}
