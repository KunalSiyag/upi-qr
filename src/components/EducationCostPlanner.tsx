import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { DocLang } from "../data/documentLang";
import { EDUCATION_COST_PHRASES } from "../data/educationCostPhrases";
import {
  CURRENCIES, MAX_COST_MINOR, MAX_COURSE_YEARS, MAX_RATE_BPS, MAX_YEARS_UNTIL_START, formatMinor, planCost,
  type CostPlan, type CurrencyCode,
} from "../lib/educationCost";
import { downloadDataUrl, notifyExportError } from "../lib/export-image";
import { renderPaperPng, savePaperPdf } from "../lib/exportPaper";
import { duration, fill } from "../lib/loanFormat";
import { parseOptionalPaise, parsePaise, parseRateBps } from "../lib/loanMath";
import { localTranslator } from "../lib/localPhrases";
import { trackProductEvent } from "../lib/productEvents";

const TOOL = "education-cost-calculator";
const draftKey = "proupiqr-education-cost-draft";

const fieldClass = "mt-2 w-full rounded-[10px] border border-pebble bg-white px-3.5 py-2.5 font-medium text-forest outline-none focus:border-leaf";
const labelClass = "text-sm font-semibold text-forest";
const hintClass = "mt-1.5 text-xs font-medium text-muted";

const isCurrency = (v: unknown): v is CurrencyCode => CURRENCIES.some((c) => c.code === v);

export function EducationCostPlanner({ lang = "en" }: { lang?: DocLang } = {}) {
  const tr = useMemo(() => localTranslator(lang, EDUCATION_COST_PHRASES), [lang]);
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;

  const [currency, setCurrency] = useState<CurrencyCode>("INR");
  const [cost, setCost] = useState("1000000");
  const [until, setUntil] = useState("10");
  const [course, setCourse] = useState("4");
  const [rise, setRise] = useState("6");
  const [saved, setSaved] = useState("0");
  const [ret, setRet] = useState("7");
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
    const str = (v: unknown, fallback: string) => (typeof v === "string" ? v : fallback);
    if (isCurrency(draft.currency)) setCurrency(draft.currency);
    setCost(str(draft.cost, "1000000"));
    setUntil(str(draft.until, "10"));
    setCourse(str(draft.course, "4"));
    setRise(str(draft.rise, "6"));
    setSaved(str(draft.saved, "0"));
    setRet(str(draft.ret, "7"));
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify({ currency, cost, until, course, rise, saved, ret }));
    } catch {
      // Private mode or full storage: the tool still works.
    }
  }, [loaded, currency, cost, until, course, rise, saved, ret]);

  const money = (minor: number) => formatMinor(minor, currency);

  const result = useMemo(() => {
    const errors: Record<string, string> = {};
    const costMinor = parsePaise(cost);
    const whole = (text: string) => (/^\d{1,3}$/.test(text.trim()) ? Number(text.trim()) : null);
    const u = whole(until);
    const c = whole(course);
    const riseBps = parseRateBps(rise);
    const retBps = parseRateBps(ret);
    const savedMinor = parseOptionalPaise(saved);
    if (costMinor === null || costMinor === 0 || costMinor > MAX_COST_MINOR) errors.cost = tr("Enter a yearly cost greater than zero.");
    if (u === null || u > MAX_YEARS_UNTIL_START) errors.until = tr("Enter 0 to 25 years.");
    if (c === null || c < 1 || c > MAX_COURSE_YEARS) errors.course = tr("Enter a course length from 1 to 8 years.");
    if (riseBps === null || riseBps > MAX_RATE_BPS) errors.rise = tr("Enter a rate from 0 to 25 with at most 2 decimals, for example 6.5.");
    if (retBps === null || retBps > MAX_RATE_BPS) errors.ret = tr("Enter a rate from 0 to 25 with at most 2 decimals, for example 6.5.");
    if (savedMinor === null || savedMinor > MAX_COST_MINOR) errors.saved = tr("Enter an amount in numbers, or leave it empty.");
    if (Object.keys(errors).length > 0 || costMinor === null || u === null || c === null || riseBps === null || retBps === null || savedMinor === null) {
      return { errors, plan: null as CostPlan | null, untilN: 0, courseN: 0 };
    }
    return {
      errors,
      plan: planCost({ annualCostToday: costMinor, yearsUntilStart: u, courseYears: c, inflationBps: riseBps, returnBps: retBps, saved: savedMinor }),
      untilN: u,
      courseN: c,
    };
  }, [cost, until, course, rise, ret, saved, tr]);

  const { plan } = result;
  const fileName = "education-cost-plan";

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

  const presets: [CurrencyCode, number, number, number, number, string][] = [
    ["INR", 1000000, 10, 4, 6, tr("₹10 lakh a year · degree in India")],
    ["INR", 2500000, 8, 2, 8, tr("₹25 lakh a year · master's abroad")],
    ["USD", 30000, 12, 4, 5, tr("$30,000 a year · US college")],
  ];

  const err = (key: string, message?: string) =>
    message ? <p id={id(`${key}-err`)} role="alert" className="mt-1.5 text-xs font-semibold text-coral">{message}</p> : null;

  return (
    <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
      <div className="no-print rounded-[14px] border border-hairline bg-white p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-leaf">{tr("Education cost planner")}</p>
            <h2 className="mt-1 text-2xl font-black text-forest">{tr("Plan the cost of an education")}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={downloadPdf} disabled={pdfState === "busy" || !plan} className="rounded-[10px] bg-forest px-4 py-2 text-xs font-bold text-white hover:bg-graphite disabled:opacity-50">{pdfState === "busy" ? tr("Generating...") : tr("Plan PDF")}</button>
            <button type="button" onClick={downloadPng} disabled={pngState === "busy" || !plan} className="rounded-[10px] bg-white px-4 py-2 text-xs font-bold text-forest ring-1 ring-pebble hover:bg-fog disabled:opacity-50">{pngState === "busy" ? tr("Generating...") : "PNG"}</button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={id("currency")} className={labelClass}>{tr("Currency")}</label>
            <select id={id("currency")} value={currency} onChange={(e) => setCurrency(e.target.value as CurrencyCode)} className={fieldClass}>
              {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} {c.symbol}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={id("cost")} className={labelClass}>{tr("Cost per year today (tuition and living)")}</label>
            <input id={id("cost")} inputMode="numeric" autoComplete="off" value={cost} onChange={(e) => setCost(e.target.value)} aria-invalid={Boolean(result.errors.cost)} aria-describedby={id("cost-err")} className={fieldClass} />
            {err("cost", result.errors.cost)}
          </div>
          <div>
            <label htmlFor={id("until")} className={labelClass}>{tr("Years until the course starts")}</label>
            <input id={id("until")} inputMode="numeric" autoComplete="off" value={until} onChange={(e) => setUntil(e.target.value)} aria-invalid={Boolean(result.errors.until)} aria-describedby={id("until-err")} className={fieldClass} />
            {err("until", result.errors.until)}
          </div>
          <div>
            <label htmlFor={id("course")} className={labelClass}>{tr("Course length (years)")}</label>
            <input id={id("course")} inputMode="numeric" autoComplete="off" value={course} onChange={(e) => setCourse(e.target.value)} aria-invalid={Boolean(result.errors.course)} aria-describedby={id("course-err")} className={fieldClass} />
            {err("course", result.errors.course)}
          </div>
          <p className={`${hintClass} sm:col-span-2 -mt-2`}>{tr("For example a child aged 8 who starts college at 18 is 10 years away. Use 0 if it starts now.")}</p>
          <div>
            <label htmlFor={id("rise")} className={labelClass}>{tr("Education cost rises each year by (%)")}</label>
            <input id={id("rise")} inputMode="decimal" autoComplete="off" value={rise} onChange={(e) => setRise(e.target.value)} aria-invalid={Boolean(result.errors.rise)} aria-describedby={id("rise-err")} className={fieldClass} />
            {err("rise", result.errors.rise)}
          </div>
          <div>
            <label htmlFor={id("ret")} className={labelClass}>{tr("Expected yearly return on savings (%)")}</label>
            <input id={id("ret")} inputMode="decimal" autoComplete="off" value={ret} onChange={(e) => setRet(e.target.value)} aria-invalid={Boolean(result.errors.ret)} aria-describedby={id("ret-err")} className={fieldClass} />
            {err("ret", result.errors.ret)}
          </div>
          <p className={`${hintClass} sm:col-span-2 -mt-2`}>{tr("These are your assumptions, not forecasts. Check how much the fees for your course have risen in recent years. Returns are not guaranteed, so a lower return is the safer plan.")}</p>
          <div className="sm:col-span-2">
            <label htmlFor={id("saved")} className={labelClass}>{tr("Savings you already have for this")}</label>
            <input id={id("saved")} inputMode="numeric" autoComplete="off" placeholder="0" value={saved} onChange={(e) => setSaved(e.target.value)} aria-invalid={Boolean(result.errors.saved)} aria-describedby={id("saved-err")} className={fieldClass} />
            {err("saved", result.errors.saved)}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {presets.map(([cur, c, u, n, r, label]) => (
            <button key={label} type="button" onClick={() => { setCurrency(cur); setCost(String(c)); setUntil(String(u)); setCourse(String(n)); setRise(String(r)); }} className="rounded-[7px] border border-pebble bg-white px-3 py-1.5 text-xs font-bold text-forest hover:border-leaf">{label}</button>
          ))}
        </div>

        <div aria-live="polite" className="mt-6">
          {plan ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[12px] bg-forest p-4 text-white">
                  <p className="text-xs font-semibold text-white/65">{plan.monthly === null ? tr("Put in today") : tr("Save each month")}</p>
                  <p className="mt-1 text-2xl font-black tabular-nums">{plan.monthly === null ? money(plan.lumpNow ?? 0) : money(plan.monthly)}</p>
                </div>
                <div className="rounded-[12px] bg-fog p-4">
                  <p className="text-xs font-semibold text-muted">{tr("Total cost when each year falls due")}</p>
                  <p className="mt-1 text-xl font-black text-forest tabular-nums">{money(plan.totalFuture)}</p>
                </div>
                <div className="rounded-[12px] bg-fog p-4">
                  <p className="text-xs font-semibold text-muted">{tr("You need saved by the start")}</p>
                  <p className="mt-1 text-xl font-black text-forest tabular-nums">{money(plan.targetAtStart)}</p>
                </div>
                <div className="rounded-[12px] bg-fog p-4">
                  <p className="text-xs font-semibold text-muted">{tr("Your savings will grow to")}</p>
                  <p className="mt-1 text-xl font-black text-forest tabular-nums">{money(plan.savedGrowsTo)}</p>
                </div>
              </div>
              <p className="mt-4 rounded-[12px] bg-fog p-4 text-sm font-semibold text-forest">
                {plan.monthly === null
                  ? fill(tr("The course starts now, so there is no time to save month by month. You would need {amount} today."), { amount: money(plan.lumpNow ?? 0) })
                  : plan.monthly === 0
                    ? tr("Your savings already cover it, if they earn the return you entered.")
                    : fill(tr("Over {time} you put in {total} in all."), { time: duration(plan.months, tr), total: money(plan.totalSaved) })}
              </p>
              {plan.monthlyIfLater !== null ? (
                <p className="mt-3 text-sm font-medium text-charcoal">{fill(tr("Waiting a year to start saving raises the monthly amount to {amount}."), { amount: money(plan.monthlyIfLater) })}</p>
              ) : null}
            </>
          ) : (
            <p className="rounded-[12px] bg-fog p-4 text-sm font-semibold text-muted">{tr("Fix the highlighted fields to see your plan.")}</p>
          )}
        </div>
      </div>

      <article ref={paperRef} className="invoice-paper mx-auto h-fit w-full max-w-[780px] rounded-[14px] border border-hairline bg-white p-6 shadow-card md:p-8">
        <header className="flex items-start justify-between gap-4 border-b-2 border-forest pb-4">
          <div>
            <p className="text-sm font-semibold text-leaf">{tr("Education cost plan")}</p>
            <h2 className="mt-1 text-2xl font-black text-forest">{plan ? fill(tr("{time} of study"), { time: duration(result.courseN * 12, tr) }) : tr("Education cost plan")}</h2>
            <p className="text-xs font-medium text-muted">{plan ? fill(tr("Cost rises {rise}% a year · savings earn {ret}% a year"), { rise, ret }) : ""}</p>
          </div>
          <div className="rounded-[10px] bg-fog p-3 text-right">
            <p className="text-xs font-semibold text-muted">{plan && plan.monthly === null ? tr("Put in today") : tr("Save each month")}</p>
            <p className="text-lg font-black text-forest tabular-nums">{plan ? money(plan.monthly === null ? plan.lumpNow ?? 0 : plan.monthly) : "—"}</p>
          </div>
        </header>

        {plan ? (
          <>
            <section className="mt-4 grid grid-cols-3 gap-3 text-center text-sm">
              <div className="rounded-[10px] bg-fog p-3"><p className="text-xs font-semibold text-muted">{tr("Total cost when due")}</p><p className="font-black text-forest tabular-nums">{money(plan.totalFuture)}</p></div>
              <div className="rounded-[10px] bg-fog p-3"><p className="text-xs font-semibold text-muted">{tr("Needed by the start")}</p><p className="font-black text-forest tabular-nums">{money(plan.targetAtStart)}</p></div>
              <div className="rounded-[10px] bg-forest p-3 text-white"><p className="text-xs font-semibold text-white/65">{tr("Already saved, grown")}</p><p className="font-black tabular-nums">{money(plan.savedGrowsTo)}</p></div>
            </section>
            <p className="mt-3 text-xs font-medium text-muted">{fill(tr("The course starts in {time}."), { time: duration(plan.months, tr) })}</p>
            <table className="mt-4 w-full text-left text-sm">
              <thead>
                <tr className="border-b border-pebble text-xs text-muted">
                  <th className="py-2 font-semibold">{tr("Course year")}</th>
                  <th className="py-2 text-right font-semibold">{tr("In today's money")}</th>
                  <th className="py-2 text-right font-semibold">{tr("When it falls due")}</th>
                </tr>
              </thead>
              <tbody>
                {plan.years.map((row) => (
                  <tr key={row.year} className="border-b border-hairline">
                    <td className="py-1.5 font-semibold text-forest">{row.year}</td>
                    <td className="py-1.5 text-right tabular-nums">{money(row.today)}</td>
                    <td className="py-1.5 text-right font-bold tabular-nums">{money(row.due)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <p className="mt-6 text-sm font-semibold text-muted">{tr("Fix the highlighted fields to see your plan.")}</p>
        )}
        <footer className="mt-4 text-center text-xs font-medium text-muted">{tr("Indicative only. Fee rises and returns are your assumptions, not guarantees; amounts are rounded up so the plan is never short.")} · Pro UPI QR</footer>
      </article>
    </div>
  );
}
