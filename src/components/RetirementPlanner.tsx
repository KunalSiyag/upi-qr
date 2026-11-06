import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { DocLang } from "../data/documentLang";
import { RETIREMENT_PHRASES } from "../data/retirementPhrases";
import { downloadDataUrl, notifyExportError } from "../lib/export-image";
import { renderPaperPng, savePaperPdf } from "../lib/exportPaper";
import { parsePercentBps } from "../lib/freelanceRate";
import { compact, fill, rupees } from "../lib/loanFormat";
import { parsePaise } from "../lib/loanMath";
import { localTranslator } from "../lib/localPhrases";
import { trackProductEvent } from "../lib/productEvents";
import { NPS_MIN_ANNUITY_PCT, NPS_SOURCES, RETIREMENT_REVIEWED_ON, npsExit, retirement, retirementProblem, type NpsSubscriber, type RetirementResult } from "../lib/retirement";

const TOOL = "retirement-calculator";
const draftKey = "proupiqr-retirement-draft";

const fieldClass = "mt-2 w-full rounded-[10px] border border-pebble bg-white px-3.5 py-2.5 font-medium text-forest outline-none focus:border-leaf";
const labelClass = "text-sm font-semibold text-forest";
const hintClass = "mt-1.5 text-xs font-medium text-muted";
const DEFAULTS = { age: "30", retireAge: "60", endAge: "85", spend: "50000", inflation: "6", savings: "500000", monthly: "20000", stepUp: "5", ret: "10", retRet: "7", nps: false, subscriber: "nonGovernment", annuityPct: "20", annuityRate: "6" };
type Fields = typeof DEFAULTS;

const wholeYears = (s: string, min: number, max: number): number | null => (/^\d{1,3}$/.test(s.trim()) && Number(s) >= min && Number(s) <= max ? Number(s) : null);

export function RetirementPlanner({ lang = "en" }: { lang?: DocLang } = {}) {
  const tr = useMemo(() => localTranslator(lang, RETIREMENT_PHRASES), [lang]);
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;
  const [f, setF] = useState<Fields>(DEFAULTS);
  const set = <K extends keyof Fields>(k: K, v: Fields[K]) => setF((cur) => ({ ...cur, [k]: v }));
  const [loaded, setLoaded] = useState(false);

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
    for (const k of Object.keys(DEFAULTS) as (keyof Fields)[]) {
      if (typeof draft[k] === typeof DEFAULTS[k]) (next as Record<string, unknown>)[k] = draft[k];
    }
    if (next.subscriber !== "nonGovernment" && next.subscriber !== "government") next.subscriber = "nonGovernment";
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
    const age = wholeYears(f.age, 18, 70);
    const retireAge = wholeYears(f.retireAge, 19, 80);
    const endAge = wholeYears(f.endAge, 20, 110);
    const spend = parsePaise(f.spend);
    const savings = parsePaise(f.savings);
    const monthly = parsePaise(f.monthly);
    const inflation = parsePercentBps(f.inflation, 0, 2000);
    const stepUp = parsePercentBps(f.stepUp, 0, 5000);
    const ret = parsePercentBps(f.ret, 0, 3000);
    const retRet = parsePercentBps(f.retRet, 0, 3000);
    if (age === null) errors.age = tr("Enter an age from 18 to 70.");
    if (retireAge === null) errors.retireAge = tr("Enter a retirement age from 19 to 80.");
    else if (age !== null && retireAge <= age) errors.retireAge = tr("Retirement age must be above your age.");
    if (endAge === null) errors.endAge = tr("Enter an age from 20 to 110.");
    else if (retireAge !== null && endAge <= retireAge) errors.endAge = tr("This must be above your retirement age.");
    if (spend === null || spend <= 0) errors.spend = tr("Enter your monthly spending.");
    if (savings === null) errors.savings = tr("Enter your savings, or 0.");
    if (monthly === null) errors.monthly = tr("Enter a monthly saving, or 0.");
    if (inflation === null) errors.inflation = tr("Enter a rate from 0 to 20, for example 6.");
    if (stepUp === null) errors.stepUp = tr("Enter a rate from 0 to 50, for example 5.");
    if (ret === null) errors.ret = tr("Enter a rate from 0 to 30, for example 10.");
    if (retRet === null) errors.retRet = tr("Enter a rate from 0 to 30, for example 7.");
    const rate = parsePercentBps(f.annuityRate, 0, 2000);
    const pct = wholeYears(f.annuityPct, 0, 100);
    if (f.nps) {
      if (rate === null) errors.annuityRate = tr("Enter a rate from 0 to 20, for example 6.");
      if (pct === null) errors.annuityPct = tr("Enter a whole number from 0 to 100.");
    }
    if (Object.keys(errors).length > 0 || age === null || retireAge === null || endAge === null || spend === null || savings === null || monthly === null || inflation === null || stepUp === null || ret === null || retRet === null) {
      return { errors, result: null as RetirementResult | null, nps: null };
    }
    const input = { age, retireAge, endAge, monthlySpend: spend, inflationBps: inflation, savings, monthlySave: monthly, stepUpBps: stepUp, returnBps: ret, retiredReturnBps: retRet };
    if (retirementProblem(input)) return { errors, result: null as RetirementResult | null, nps: null };
    const result = retirement(input);
    const nps = f.nps && rate !== null && pct !== null ? npsExit(result.corpus, f.subscriber as NpsSubscriber, pct, rate) : null;
    return { errors, result, nps };
  }, [f, tr]);

  const { result, nps } = calc;
  const fileName = "retirement-plan";
  const minAnnuity = NPS_MIN_ANNUITY_PCT[f.subscriber as NpsSubscriber] ?? 20;

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
  const field = (key: keyof Fields, label: string, mode: "numeric" | "decimal", hint?: string) => (
    <div>
      <label htmlFor={id(key)} className={labelClass}>{label}</label>
      <input id={id(key)} inputMode={mode} autoComplete="off" value={String(f[key])} onChange={(e) => set(key, e.target.value as never)} aria-invalid={Boolean(calc.errors[key])} aria-describedby={id(`${key}-err`)} className={fieldClass} />
      {hint ? <p className={hintClass}>{hint}</p> : null}
      {err(key)}
    </div>
  );
  const money = (key: "spend" | "savings" | "monthly") => {
    const p = parsePaise(f[key]);
    return p !== null && !calc.errors[key] ? compact(p, tr) ?? undefined : undefined;
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
      <div className="no-print rounded-[14px] border border-hairline bg-white p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-leaf">{tr("Retirement calculator")}</p>
            <h2 className="mt-1 text-2xl font-black text-forest">{tr("Plan your retirement corpus")}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={downloadPdf} disabled={pdfState === "busy" || !result} className="rounded-[10px] bg-forest px-4 py-2 text-xs font-bold text-white hover:bg-graphite disabled:opacity-50">{pdfState === "busy" ? tr("Generating...") : tr("Plan PDF")}</button>
            <button type="button" onClick={downloadPng} disabled={pngState === "busy" || !result} className="rounded-[10px] bg-white px-4 py-2 text-xs font-bold text-forest ring-1 ring-pebble hover:bg-fog disabled:opacity-50">{pngState === "busy" ? tr("Generating...") : "PNG"}</button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {field("age", tr("Your age"), "numeric")}
          {field("retireAge", tr("Retire at age"), "numeric")}
          {field("endAge", tr("Money must last to age"), "numeric")}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {field("spend", tr("Monthly spending today (₹)"), "numeric", money("spend"))}
          {field("inflation", tr("Inflation (% per year)"), "decimal", tr("Spending grows by this every year, before and after you retire."))}
          {field("savings", tr("Savings so far (₹)"), "numeric", money("savings"))}
          {field("monthly", tr("Save each month (₹)"), "numeric", money("monthly"))}
          {field("stepUp", tr("Increase the saving each year by (%)"), "decimal", tr("0 keeps it flat."))}
          {field("ret", tr("Return before retirement (% per year)"), "decimal")}
          {field("retRet", tr("Return after retirement (% per year)"), "decimal", tr("Usually lower, because you hold safer assets."))}
        </div>

        <label className="mt-5 flex items-center gap-2 text-sm font-semibold text-forest">
          <input type="checkbox" checked={f.nps} onChange={(e) => set("nps", e.target.checked)} className="h-4 w-4" />
          {tr("Treat the corpus as NPS and show the exit split")}
        </label>
        {f.nps ? (
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor={id("subscriber")} className={labelClass}>{tr("Subscriber")}</label>
              <select id={id("subscriber")} value={f.subscriber} onChange={(e) => { set("subscriber", e.target.value); set("annuityPct", String(NPS_MIN_ANNUITY_PCT[e.target.value as NpsSubscriber])); }} className={fieldClass}>
                <option value="nonGovernment">{tr("Non-government")}</option>
                <option value="government">{tr("Government")}</option>
              </select>
            </div>
            {field("annuityPct", tr("Put into annuity (%)"), "numeric", fill(tr("At least {min}% at normal exit."), { min: String(minAnnuity) }))}
            {field("annuityRate", tr("Annuity rate (% per year)"), "decimal", tr("Quotes differ by plan and age; enter the one you are offered."))}
          </div>
        ) : null}

        <div aria-live="polite" className="mt-6">
          {result ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-[12px] bg-forest p-4 text-white"><p className="text-xs font-semibold text-white/65">{tr("Your corpus at retirement")}</p><p className="mt-1 text-2xl font-black tabular-nums">{rupees(result.corpus)}</p></div>
                <div className="rounded-[12px] bg-fog p-4"><p className="text-xs font-semibold text-muted">{tr("Corpus you need")}</p><p className="mt-1 text-xl font-black text-forest tabular-nums">{rupees(result.needed)}</p></div>
                <div className="rounded-[12px] bg-fog p-4"><p className="text-xs font-semibold text-muted">{result.gap > 0 ? tr("Shortfall") : tr("Surplus")}</p><p className={`mt-1 text-xl font-black tabular-nums ${result.gap > 0 ? "text-coral" : "text-forest"}`}>{rupees(result.gap > 0 ? result.gap : result.surplus)}</p></div>
              </div>
              <p className="mt-4 text-sm font-medium text-charcoal">
                {result.lastsUntilAge === null
                  ? fill(tr("Your savings last beyond age {age}."), { age: f.endAge })
                  : fill(tr("Your savings run out at about age {age}."), { age: String(result.lastsUntilAge) })}
              </p>
              {result.gap > 0 ? <p className="mt-2 text-sm font-medium text-charcoal">{fill(tr("To close the gap, save about {amount} more every month."), { amount: rupees(result.extraMonthly) })}</p> : null}
              <dl className="mt-4 grid gap-2 text-sm">
                <div className="flex justify-between gap-4 border-b border-hairline pb-2"><dt className="text-muted">{tr("Monthly spending in your first retirement year")}</dt><dd className="font-bold tabular-nums text-forest">{rupees(result.spendAtRetirement)}</dd></div>
                <div className="flex justify-between gap-4 border-b border-hairline pb-2"><dt className="text-muted">{tr("Your corpus in today's money")}</dt><dd className="font-bold tabular-nums text-forest">{rupees(result.corpusToday)}</dd></div>
              </dl>
              {nps ? (
                <div className="mt-4 rounded-[12px] bg-fog p-4 text-sm">
                  <p className="font-bold text-forest">{tr("NPS exit split")}</p>
                  <p className="mt-2 flex justify-between gap-4"><span className="text-muted">{tr("Lump sum you can take")}</span><span className="font-bold tabular-nums text-forest">{rupees(nps.lumpSum)}</span></p>
                  <p className="mt-1 flex justify-between gap-4"><span className="text-muted">{tr("Used to buy an annuity")}</span><span className="font-bold tabular-nums text-forest">{rupees(nps.annuityPurchase)}</span></p>
                  <p className="mt-1 flex justify-between gap-4"><span className="text-muted">{tr("Monthly pension from the annuity")}</span><span className="font-bold tabular-nums text-forest">{rupees(nps.monthlyPension)}</span></p>
                </div>
              ) : null}
            </>
          ) : (
            <p className="rounded-[12px] bg-fog p-4 text-sm font-semibold text-muted">{tr("Fix the highlighted fields to see your plan.")}</p>
          )}
          <p className={hintClass}>{tr("A projection from the rates you enter, not a promise. Real returns and inflation vary year to year.")}</p>
        </div>
      </div>

      <article ref={paperRef} className="invoice-paper mx-auto h-fit w-full max-w-[780px] rounded-[14px] border border-hairline bg-white p-6 shadow-card md:p-8">
        <header className="flex items-start justify-between gap-4 border-b-2 border-forest pb-4">
          <div>
            <p className="text-sm font-semibold text-leaf">{tr("Year-by-year")}</p>
            <h2 className="mt-1 text-2xl font-black text-forest">{tr("Retirement plan")}</h2>
            <p className="text-xs font-medium text-muted">{f.age} → {f.retireAge} → {f.endAge} · {f.ret}% / {f.retRet}% · {tr("inflation")} {f.inflation}%</p>
          </div>
          <div className="rounded-[10px] bg-fog p-3 text-right">
            <p className="text-xs font-semibold text-muted">{tr("Your corpus at retirement")}</p>
            <p className="text-lg font-black text-forest tabular-nums">{result ? rupees(result.corpus) : "—"}</p>
          </div>
        </header>
        {result ? (
          <>
            <section className="mt-4 grid grid-cols-3 gap-3 text-center text-sm">
              <div className="rounded-[10px] bg-fog p-3"><p className="text-xs font-semibold text-muted">{tr("Corpus you need")}</p><p className="font-black text-forest tabular-nums">{rupees(result.needed)}</p></div>
              <div className="rounded-[10px] bg-fog p-3"><p className="text-xs font-semibold text-muted">{result.gap > 0 ? tr("Shortfall") : tr("Surplus")}</p><p className="font-black text-forest tabular-nums">{rupees(result.gap > 0 ? result.gap : result.surplus)}</p></div>
              <div className="rounded-[10px] bg-forest p-3 text-white"><p className="text-xs font-semibold text-white/65">{tr("Monthly spending in your first retirement year")}</p><p className="font-black tabular-nums">{rupees(result.spendAtRetirement)}</p></div>
            </section>
            <table className="mt-4 w-full text-left text-sm">
              <thead>
                <tr className="border-b border-pebble text-xs text-muted">
                  <th className="py-2 font-semibold">{tr("Age")}</th>
                  <th className="py-2 font-semibold">{tr("Phase")}</th>
                  <th className="py-2 text-right font-semibold">{tr("Saved or spent")}</th>
                  <th className="py-2 text-right font-semibold">{tr("Balance")}</th>
                </tr>
              </thead>
              <tbody>
                {result.yearly.map((row) => (
                  <tr key={`${row.phase}-${row.age}`} className="border-b border-hairline">
                    <td className="py-1.5 font-semibold text-forest">{row.age}</td>
                    <td className="py-1.5">{row.phase === "save" ? tr("Saving") : tr("Spending")}</td>
                    <td className="py-1.5 text-right tabular-nums">{rupees(row.flow)}</td>
                    <td className="py-1.5 text-right font-bold tabular-nums">{rupees(row.closing)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <p className="mt-6 text-sm font-semibold text-muted">{tr("Fix the highlighted fields to see your plan.")}</p>
        )}
        <p className="mt-4 text-xs font-medium text-muted">{fill(tr("Rules checked on {date}."), { date: RETIREMENT_REVIEWED_ON })}</p>
        <footer className="mt-2 text-center text-xs font-medium text-muted">{tr("Indicative only. Savings are added at the start of each month, and spending is taken at the start of each month.")} · Pro UPI QR</footer>
      </article>
    </div>
  );
}
