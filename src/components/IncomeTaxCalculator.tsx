import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { DocLang } from "../data/documentLang";
import { INCOME_TAX_PHRASES } from "../data/incomeTaxPhrases";
import { downloadDataUrl, notifyExportError } from "../lib/export-image";
import { renderPaperPng, savePaperPdf } from "../lib/exportPaper";
import { SECTION_MAP, TAX_RULES_REVIEWED_ON, TAX_SOURCES, compareRegimes, type Age, type RegimeResult, type TaxInput } from "../lib/incomeTax";
import { compact, fill, rupees } from "../lib/loanFormat";
import { parseOptionalPaise, parsePaise } from "../lib/loanMath";
import { localTranslator } from "../lib/localPhrases";
import { trackProductEvent } from "../lib/productEvents";

const TOOL = "income-tax-calculator";
const draftKey = "proupiqr-income-tax-draft";

const fieldClass = "mt-2 w-full rounded-[10px] border border-pebble bg-white px-3.5 py-2.5 font-medium text-forest outline-none focus:border-leaf";
const labelClass = "text-sm font-semibold text-forest";
const hintClass = "mt-1.5 text-xs font-medium text-muted";

type Fields = {
  age: Age; salary: string; other: string; basic: string; empNps: string; govt: boolean;
  hra: string; pt: string; c80: string; nps1b: string; selfHealth: string; parentsHealth: string; parentsSenior: boolean;
  savInt: string; hlInt: string; hlQual: boolean; edu: string;
};
const DEFAULTS: Fields = {
  age: "under60", salary: "1500000", other: "", basic: "", empNps: "", govt: false,
  hra: "", pt: "", c80: "", nps1b: "", selfHealth: "", parentsHealth: "", parentsSenior: false,
  savInt: "", hlInt: "", hlQual: true, edu: "",
};
const AGES: Age[] = ["under60", "senior", "super"];

export function IncomeTaxCalculator({ lang = "en" }: { lang?: DocLang } = {}) {
  const tr = useMemo(() => localTranslator(lang, INCOME_TAX_PHRASES), [lang]);
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
      else if (key === "age") { if (AGES.includes(v as Age)) next.age = v as Age; }
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
    const salary = parsePaise(f.salary);
    const opt = (key: keyof Fields) => parseOptionalPaise(String(f[key]));
    const vals = { other: opt("other"), basic: opt("basic"), empNps: opt("empNps"), hra: opt("hra"), pt: opt("pt"), c80: opt("c80"), nps1b: opt("nps1b"), selfHealth: opt("selfHealth"), parentsHealth: opt("parentsHealth"), savInt: opt("savInt"), hlInt: opt("hlInt"), edu: opt("edu") };
    if (salary === null || salary === 0) errors.salary = tr("Enter your yearly salary before tax.");
    for (const [key, v] of Object.entries(vals)) if (v === null) errors[key] = tr("Enter an amount, or leave it empty.");
    if (Object.keys(errors).length > 0 || salary === null || Object.values(vals).some((v) => v === null)) return { errors, result: null as ReturnType<typeof compareRegimes> | null };
    const v = vals as Record<string, number>;
    const input: TaxInput = {
      salary, otherIncome: v.other, age: f.age, basicDa: v.basic, employerNps: v.empNps, government: f.govt, hraExempt: v.hra, professionalTax: v.pt, c80: v.c80,
      nps1b: v.nps1b, selfHealth: v.selfHealth, parentsHealth: v.parentsHealth, parentsSenior: f.parentsSenior, savingsInterest: v.savInt,
      homeLoanInterest: v.hlInt, homeLoanQualifies: f.hlQual, eduLoanInterest: v.edu,
    };
    return { errors, result: compareRegimes(input) };
  }, [f, tr]);

  const { result } = calc;
  const salaryHint = parsePaise(f.salary) !== null ? compact(parsePaise(f.salary) ?? 0, tr) : null;
  const fileName = "income-tax-comparison";

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
      <input id={id(key)} inputMode="numeric" autoComplete="off" placeholder={key === "salary" ? undefined : "0"} value={String(f[key])} onChange={(e) => set(key)(e.target.value as never)} aria-invalid={Boolean(calc.errors[key])} aria-describedby={id(`${key}-err`)} className={fieldClass} />
      {key === "salary" && salaryHint && !calc.errors.salary ? <p className={hintClass}>{salaryHint}</p> : null}
      {hint ? <p className={hintClass}>{hint}</p> : null}
      {err(key)}
    </div>
  );
  const check = (key: "govt" | "parentsSenior" | "hlQual", label: string) => (
    <label className="flex items-center gap-2 text-sm font-medium text-forest">
      <input type="checkbox" checked={f[key]} onChange={(e) => set(key)(e.target.checked)} className="h-4 w-4 accent-[#1c1d1f]" />
      {label}
    </label>
  );

  const ageLabels: Record<Age, string> = { under60: tr("Under 60"), senior: tr("60 to 79"), super: tr("80 or older") };
  const names = { new: tr("New regime"), old: tr("Old regime") };
  const col = (r: RegimeResult) => (
    <div className={`rounded-[12px] border p-4 ${result?.lower === r.regime ? "border-forest" : "border-hairline"} bg-white`}>
      <p className="text-sm font-semibold text-leaf">{names[r.regime]}</p>
      <p className="mt-1 text-2xl font-black text-forest tabular-nums">{rupees(r.totalTax)}</p>
      <p className="text-xs font-medium text-muted">{fill(tr("on taxable income of {income}"), { income: rupees(r.taxableIncome) })}</p>
    </div>
  );

  const rows = (r: RegimeResult): [string, number][] => [
    [tr("Gross income"), r.grossIncome],
    [tr("Deductions"), -r.totalDeductions],
    [tr("Taxable income"), r.taxableIncome],
    [tr("Tax on slabs"), r.slabTax],
    [tr("Rebate and relief"), -(r.rebate + r.marginalRelief)],
    [tr("Surcharge"), r.surcharge],
    [tr("Health and education cess (4%)"), r.cess],
    [tr("Total tax"), r.totalTax],
  ];
  const fmt = (n: number) => (n < 0 ? `−${rupees(-n)}` : rupees(n));

  return (
    <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
      <div className="no-print rounded-[14px] border border-hairline bg-white p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-leaf">{tr("Income tax calculator")}</p>
            <h2 className="mt-1 text-2xl font-black text-forest">{tr("New regime or old regime?")}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={downloadPdf} disabled={pdfState === "busy" || !result} className="rounded-[10px] bg-forest px-4 py-2 text-xs font-bold text-white hover:bg-graphite disabled:opacity-50">{pdfState === "busy" ? tr("Generating...") : tr("Plan PDF")}</button>
            <button type="button" onClick={downloadPng} disabled={pngState === "busy" || !result} className="rounded-[10px] bg-white px-4 py-2 text-xs font-bold text-forest ring-1 ring-pebble hover:bg-fog disabled:opacity-50">{pngState === "busy" ? tr("Generating...") : "PNG"}</button>
          </div>
        </div>
        <p className={hintClass}>{fill(tr("Tax year 2026-27 (FY 2026-27), resident individual. Rules checked on {date}."), { date: TAX_RULES_REVIEWED_ON })}</p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={id("age")} className={labelClass}>{tr("Your age")}</label>
            <select id={id("age")} value={f.age} onChange={(e) => set("age")(e.target.value as Age)} className={fieldClass}>
              {AGES.map((a) => <option key={a} value={a}>{ageLabels[a]}</option>)}
            </select>
          </div>
          {field("salary", tr("Salary per year, before tax"))}
          {field("other", tr("Other income per year"), tr("Interest, rent and other income taxed at your slab rates."))}
        </div>

        <fieldset className="mt-5 rounded-[12px] border border-hairline p-4">
          <legend className="px-1 text-sm font-semibold text-leaf">{tr("NPS from your employer")}</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {field("basic", tr("Basic salary plus DA per year"))}
            {field("empNps", tr("Employer NPS contribution per year"), tr("Counted as part of the salary above."))}
          </div>
          <div className="mt-3">{check("govt", tr("My employer is the Central or a State Government"))}</div>
        </fieldset>

        <fieldset className="mt-4 rounded-[12px] border border-hairline p-4">
          <legend className="px-1 text-sm font-semibold text-leaf">{tr("Old regime deductions (optional)")}</legend>
          <p className={hintClass}>{tr("The new regime allows none of these, so they only change the old-regime figure.")}</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {field("hra", tr("House rent allowance exempt"), tr("Work it out with the HRA calculator."))}
            {field("pt", tr("Professional tax paid"))}
            {field("c80", tr("80C items, including your own NPS"), tr("PPF, EPF, life insurance, tuition fees and so on. Capped at ₹1,50,000."))}
            {field("nps1b", tr("Extra NPS contribution"), tr("Capped at ₹50,000."))}
            {field("selfHealth", tr("Health insurance for you and family"))}
            {field("parentsHealth", tr("Health insurance for parents"))}
            {field("savInt", tr("Savings or deposit interest"), tr("Savings-account interest only if you are under 60; any deposit interest if you are 60 or older."))}
            {field("hlInt", tr("Home loan interest, self-occupied"))}
            {field("edu", tr("Education loan interest"))}
          </div>
          <div className="mt-3 grid gap-2">
            {check("parentsSenior", tr("My parent is 60 or older"))}
            {check("hlQual", tr("The home loan was taken to buy or build it, and it is complete or due within 5 years"))}
          </div>
        </fieldset>

        <div aria-live="polite" className="mt-6">
          {result ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">{col(result.new)}{col(result.old)}</div>
              <p className="mt-4 rounded-[12px] bg-fog p-4 text-sm font-semibold text-forest">
                {result.lower === null
                  ? tr("Both regimes leave the same tax.")
                  : fill(result.lower === "new" ? tr("The new regime leaves {amount} less tax on these numbers.") : tr("The old regime leaves {amount} less tax on these numbers."), { amount: rupees(result.difference) })}
              </p>
              <p className="mt-3 text-sm font-medium text-charcoal">{fill(tr("That is about {amount} a month under the lower figure."), { amount: rupees(Math.round(Math.min(result.new.totalTax, result.old.totalTax) / 12)) })}</p>
            </>
          ) : (
            <p className="rounded-[12px] bg-fog p-4 text-sm font-semibold text-muted">{tr("Fix the highlighted fields to see your tax.")}</p>
          )}
          <p className={hintClass}>{tr("An estimate for salary and other slab-rate income. Capital gains, business income, NRIs and special reliefs are not included, and it is not tax advice.")}</p>
        </div>
      </div>

      <article ref={paperRef} className="invoice-paper mx-auto h-fit w-full max-w-[780px] rounded-[14px] border border-hairline bg-white p-6 shadow-card md:p-8">
        <header className="flex items-start justify-between gap-4 border-b-2 border-forest pb-4">
          <div>
            <p className="text-sm font-semibold text-leaf">{tr("Income tax comparison")}</p>
            <h2 className="mt-1 text-2xl font-black text-forest">{tr("Tax year 2026-27")}</h2>
            <p className="text-xs font-medium text-muted">{fill(tr("Rules checked on {date}."), { date: TAX_RULES_REVIEWED_ON })} · {ageLabels[f.age]}</p>
          </div>
          <div className="rounded-[10px] bg-fog p-3 text-right">
            <p className="text-xs font-semibold text-muted">{result?.lower ? names[result.lower] : tr("Lower tax")}</p>
            <p className="text-lg font-black text-forest tabular-nums">{result ? rupees(Math.min(result.new.totalTax, result.old.totalTax)) : "—"}</p>
          </div>
        </header>

        {result ? (
          <>
            <table className="mt-4 w-full text-left text-sm">
              <thead>
                <tr className="border-b border-pebble text-xs text-muted">
                  <th className="py-2 font-semibold" />
                  <th className="py-2 text-right font-semibold">{names.new}</th>
                  <th className="py-2 text-right font-semibold">{names.old}</th>
                </tr>
              </thead>
              <tbody>
                {rows(result.new).map(([label, value], i) => (
                  <tr key={label} className={`border-b border-hairline ${i === 7 ? "font-black" : ""}`}>
                    <td className="py-1.5 font-semibold text-forest">{label}</td>
                    <td className="py-1.5 text-right tabular-nums">{fmt(value)}</td>
                    <td className="py-1.5 text-right tabular-nums">{fmt(rows(result.old)[i][1])}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="mt-5 text-sm font-semibold text-leaf">{tr("Deductions used")}</p>
            <table className="mt-2 w-full text-left text-xs">
              <tbody>
                {result.new.deductions.map((d) => <tr key={`n-${d.label}`} className="border-b border-hairline"><td className="py-1 font-semibold text-forest">{names.new} · {tr(d.label)}</td><td className="py-1 text-right tabular-nums">{rupees(d.amount)}</td></tr>)}
                {result.old.deductions.map((d) => <tr key={`o-${d.label}`} className="border-b border-hairline"><td className="py-1 font-semibold text-forest">{names.old} · {tr(d.label)}</td><td className="py-1 text-right tabular-nums">{rupees(d.amount)}</td></tr>)}
              </tbody>
            </table>
          </>
        ) : (
          <p className="mt-6 text-sm font-semibold text-muted">{tr("Fix the highlighted fields to see your tax.")}</p>
        )}

        <details className="mt-5 text-xs text-muted">
          <summary className="cursor-pointer font-semibold text-forest">{tr("Sources and section numbers")}</summary>
          <ul className="mt-2 grid gap-1">
            {TAX_SOURCES.map((s) => <li key={s.url}>{s.label}</li>)}
          </ul>
          <p className="mt-2">{tr("The Income-tax Act, 2025 renumbered the sections: for example 115BAC is now 202, 87A is 156, 80C is 123 and 80D is 126.")}</p>
        </details>
        <footer className="mt-4 text-center text-xs font-medium text-muted">{tr("Indicative only, for resident individuals. Check the current rules or a tax professional before you file.")} · Pro UPI QR</footer>
      </article>
    </div>
  );
}

export { SECTION_MAP };
