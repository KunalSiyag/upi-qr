import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { DocLang } from "../data/documentLang";
import { HRA_PHRASES } from "../data/hraPhrases";
import { downloadDataUrl, notifyExportError } from "../lib/export-image";
import { renderPaperPng, savePaperPdf } from "../lib/exportPaper";
import { HRA_FIFTY_PERCENT_CITIES, hraExemption } from "../lib/hra";
import { TAX_RULES_REVIEWED_ON } from "../lib/incomeTax";
import { fill, rupees } from "../lib/loanFormat";
import { parseOptionalPaise } from "../lib/loanMath";
import { localTranslator } from "../lib/localPhrases";
import { trackProductEvent } from "../lib/productEvents";

const TOOL = "hra-calculator";
const draftKey = "proupiqr-hra-draft";

const fieldClass = "mt-2 w-full rounded-[10px] border border-pebble bg-white px-3.5 py-2.5 font-medium text-forest outline-none focus:border-leaf";
const labelClass = "text-sm font-semibold text-forest";
const hintClass = "mt-1.5 text-xs font-medium text-muted";

type Fields = { basic: string; da: string; hra: string; rent: string; months: string; city: "listed" | "other" };
const DEFAULTS: Fields = { basic: "50000", da: "", hra: "20000", rent: "22000", months: "12", city: "listed" };

export function HraCalculator({ lang = "en" }: { lang?: DocLang } = {}) {
  const tr = useMemo(() => localTranslator(lang, HRA_PHRASES), [lang]);
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;
  const [f, setF] = useState<Fields>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const set = (key: keyof Fields) => (value: string) => setF((prev) => ({ ...prev, [key]: value }));

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
      if (key === "city") { if (v === "listed" || v === "other") next.city = v; } else if (typeof v === "string") (next[key] as string) = v;
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
    const basic = parseOptionalPaise(f.basic);
    const da = parseOptionalPaise(f.da);
    const hra = parseOptionalPaise(f.hra);
    const rent = parseOptionalPaise(f.rent);
    const months = /^\d{1,2}$/.test(f.months.trim()) && Number(f.months) >= 1 && Number(f.months) <= 12 ? Number(f.months) : null;
    if (basic === null || basic === 0) errors.basic = tr("Enter your monthly basic salary.");
    if (da === null) errors.da = tr("Enter an amount, or leave it empty.");
    if (hra === null) errors.hra = tr("Enter an amount, or leave it empty.");
    if (rent === null) errors.rent = tr("Enter an amount, or leave it empty.");
    if (months === null) errors.months = tr("Enter 1 to 12 months.");
    if (Object.keys(errors).length > 0 || basic === null || da === null || hra === null || rent === null || months === null) return { errors, result: null as ReturnType<typeof hraExemption> | null };
    return { errors, result: hraExemption({ salaryMonth: basic + da, hraMonth: hra, rentMonth: rent, fiftyPercentCity: f.city === "listed", months }) };
  }, [f, tr]);

  const { result } = calc;
  const fileName = "hra-exemption";

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
  const field = (key: keyof Fields, label: string, hint?: string) => (
    <div>
      <label htmlFor={id(key)} className={labelClass}>{label}</label>
      <input id={id(key)} inputMode="numeric" autoComplete="off" value={f[key]} onChange={(e) => set(key)(e.target.value)} aria-invalid={Boolean(calc.errors[key])} aria-describedby={id(`${key}-err`)} className={fieldClass} />
      {hint ? <p className={hintClass}>{hint}</p> : null}
      {err(key)}
    </div>
  );

  const tests: [string, number, string][] = result
    ? [
        [tr("HRA you actually receive"), result.actual, "actual"],
        [tr("Rent you pay, less 10% of your salary"), result.rentLessTenth, "rent"],
        [f.city === "listed" ? tr("50% of your salary") : tr("40% of your salary"), result.percentOfSalary, "salary"],
      ]
    : [];
  const cityList = HRA_FIFTY_PERCENT_CITIES.join(", ");

  return (
    <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
      <div className="no-print rounded-[14px] border border-hairline bg-white p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-leaf">{tr("HRA exemption calculator")}</p>
            <h2 className="mt-1 text-2xl font-black text-forest">{tr("How much of your HRA is tax-free?")}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={downloadPdf} disabled={pdfState === "busy" || !result} className="rounded-[10px] bg-forest px-4 py-2 text-xs font-bold text-white hover:bg-graphite disabled:opacity-50">{pdfState === "busy" ? tr("Generating...") : tr("Plan PDF")}</button>
            <button type="button" onClick={downloadPng} disabled={pngState === "busy" || !result} className="rounded-[10px] bg-white px-4 py-2 text-xs font-bold text-forest ring-1 ring-pebble hover:bg-fog disabled:opacity-50">{pngState === "busy" ? tr("Generating...") : "PNG"}</button>
          </div>
        </div>
        <p className={hintClass}>{fill(tr("Under the Income-tax Rules, 2026. Rules checked on {date}."), { date: TAX_RULES_REVIEWED_ON })}</p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {field("basic", tr("Basic salary per month"))}
          {field("da", tr("Dearness allowance per month that counts as salary"), tr("Only if it is part of your terms of employment."))}
          {field("hra", tr("HRA you receive per month"))}
          {field("rent", tr("Rent you pay per month"))}
          {field("months", tr("Months you paid rent this tax year"))}
          <div>
            <label htmlFor={id("city")} className={labelClass}>{tr("Where you live")}</label>
            <select id={id("city")} value={f.city} onChange={(e) => set("city")(e.target.value)} className={fieldClass}>
              <option value="listed">{tr("One of the 8 listed cities (50%)")}</option>
              <option value="other">{tr("Anywhere else (40%)")}</option>
            </select>
          </div>
        </div>
        <p className={hintClass}>{fill(tr("The 50% cities are {cities}."), { cities: cityList })}</p>

        <div aria-live="polite" className="mt-6">
          {result ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[12px] bg-forest p-4 text-white"><p className="text-xs font-semibold text-white/65">{tr("Tax-free HRA this year")}</p><p className="mt-1 text-3xl font-black tabular-nums">{rupees(result.exempt)}</p></div>
                <div className="rounded-[12px] bg-fog p-4"><p className="text-xs font-semibold text-muted">{tr("HRA that is taxable")}</p><p className="mt-1 text-2xl font-black text-forest tabular-nums">{rupees(result.taxable)}</p></div>
              </div>
              <p className="mt-4 text-sm font-medium text-charcoal">{fill(tr("That is {amount} a month tax-free."), { amount: rupees(result.exemptMonth) })}</p>
              <ul className="mt-3 grid gap-2 text-sm">
                {tests.map(([label, value, key]) => (
                  <li key={key} className={`flex justify-between gap-3 rounded-[10px] px-4 py-2.5 ${result.limiting === key ? "bg-fog font-black text-forest" : "text-charcoal"}`}>
                    <span>{label}</span>
                    <span className="tabular-nums">{rupees(value)}</span>
                  </li>
                ))}
              </ul>
              <p className={hintClass}>{tr("The exemption is the smallest of these three. HRA is not available in the new tax regime.")}</p>
            </>
          ) : (
            <p className="rounded-[12px] bg-fog p-4 text-sm font-semibold text-muted">{tr("Fix the highlighted fields to see your exemption.")}</p>
          )}
        </div>
      </div>

      <article ref={paperRef} className="invoice-paper mx-auto h-fit w-full max-w-[780px] rounded-[14px] border border-hairline bg-white p-6 shadow-card md:p-8">
        <header className="flex items-start justify-between gap-4 border-b-2 border-forest pb-4">
          <div>
            <p className="text-sm font-semibold text-leaf">{tr("HRA exemption")}</p>
            <h2 className="mt-1 text-2xl font-black text-forest">{tr("Tax-free HRA")}</h2>
            <p className="text-xs font-medium text-muted">{fill(tr("Rules checked on {date}."), { date: TAX_RULES_REVIEWED_ON })}</p>
          </div>
          <div className="rounded-[10px] bg-fog p-3 text-right">
            <p className="text-xs font-semibold text-muted">{tr("Tax-free HRA this year")}</p>
            <p className="text-lg font-black text-forest tabular-nums">{result ? rupees(result.exempt) : "—"}</p>
          </div>
        </header>
        {result ? (
          <>
            <section className="mt-4 grid grid-cols-3 gap-3 text-center text-sm">
              <div className="rounded-[10px] bg-fog p-3"><p className="text-xs font-semibold text-muted">{tr("Salary for the period")}</p><p className="font-black text-forest tabular-nums">{rupees(result.salary)}</p></div>
              <div className="rounded-[10px] bg-fog p-3"><p className="text-xs font-semibold text-muted">{tr("HRA received")}</p><p className="font-black text-forest tabular-nums">{rupees(result.hraReceived)}</p></div>
              <div className="rounded-[10px] bg-fog p-3"><p className="text-xs font-semibold text-muted">{tr("Rent paid")}</p><p className="font-black text-forest tabular-nums">{rupees(result.rentPaid)}</p></div>
            </section>
            <table className="mt-4 w-full text-left text-sm">
              <tbody>
                {tests.map(([label, value, key]) => (
                  <tr key={key} className={`border-b border-hairline ${result.limiting === key ? "font-black" : ""}`}>
                    <td className="py-1.5 text-forest">{label}</td>
                    <td className="py-1.5 text-right tabular-nums">{rupees(value)}</td>
                  </tr>
                ))}
                <tr><td className="py-2 font-black text-forest">{tr("Tax-free HRA (the smallest)")}</td><td className="py-2 text-right font-black text-forest tabular-nums">{rupees(result.exempt)}</td></tr>
                <tr><td className="py-1.5 text-forest">{tr("HRA that is taxable")}</td><td className="py-1.5 text-right tabular-nums">{rupees(result.taxable)}</td></tr>
              </tbody>
            </table>
          </>
        ) : (
          <p className="mt-6 text-sm font-semibold text-muted">{tr("Fix the highlighted fields to see your exemption.")}</p>
        )}
        <footer className="mt-4 text-center text-xs font-medium text-muted">{tr("Indicative only. You must pay the rent and not own the home you rent. Keep rent receipts and check the current rules.")} · Pro UPI QR</footer>
      </article>
    </div>
  );
}
