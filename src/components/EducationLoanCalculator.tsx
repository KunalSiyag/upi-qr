import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { DocLang } from "../data/documentLang";
import { EDUCATION_LOAN_PHRASES } from "../data/educationLoanPhrases";
import {
  MAX_COURSE_MONTHS, MAX_GRACE_MONTHS, MAX_REPAY_MONTHS, educationLoan,
  type Disbursement, type EducationResult, type UnpaidInterest,
} from "../lib/educationLoan";
import { downloadDataUrl, notifyExportError } from "../lib/export-image";
import { renderPaperPng, savePaperPdf } from "../lib/exportPaper";
import { compact, duration, fill, rupees } from "../lib/loanFormat";
import { monthLabel, parsePaise, parseRateBps } from "../lib/loanMath";
import { localTranslator } from "../lib/localPhrases";
import { trackProductEvent } from "../lib/productEvents";

const TOOL = "education-loan-calculator";
const draftKey = "proupiqr-education-loan-draft";

const fieldClass = "mt-2 w-full rounded-[10px] border border-pebble bg-white px-3.5 py-2.5 font-medium text-forest outline-none focus:border-leaf";
const labelClass = "text-sm font-semibold text-forest";
const hintClass = "mt-1.5 text-xs font-medium text-muted";
const segClass = (on: boolean) => `rounded-[8px] px-3 py-1.5 text-xs font-bold transition ${on ? "bg-white text-forest shadow-card" : "text-muted hover:text-forest"}`;

export function EducationLoanCalculator({ lang = "en" }: { lang?: DocLang } = {}) {
  const tr = useMemo(() => localTranslator(lang, EDUCATION_LOAN_PHRASES), [lang]);
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;

  const [amount, setAmount] = useState("2000000");
  const [rate, setRate] = useState("9.5");
  const [startMonth, setStartMonth] = useState("");
  const [courseYears, setCourseYears] = useState("4");
  const [graceMonths, setGraceMonths] = useState("6");
  const [repayYears, setRepayYears] = useState("10");
  const [disbursement, setDisbursement] = useState<Disbursement>("yearly");
  const [unpaid, setUnpaid] = useState<UnpaidInterest>("simple");
  const [shown, setShown] = useState<"build" | "pay">("build");

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
    setAmount(str(draft.amount, "2000000"));
    setRate(str(draft.rate, "9.5"));
    setCourseYears(str(draft.courseYears, "4"));
    setGraceMonths(str(draft.graceMonths, "6"));
    setRepayYears(str(draft.repayYears, "10"));
    if (draft.disbursement === "upfront" || draft.disbursement === "yearly") setDisbursement(draft.disbursement);
    if (draft.unpaid === "simple" || draft.unpaid === "compound") setUnpaid(draft.unpaid);
    setStartMonth(str(draft.startMonth, "") || new Date().toISOString().slice(0, 7));
  }, []);

  useEffect(() => {
    if (!startMonth) return; // draft not loaded yet
    try {
      localStorage.setItem(draftKey, JSON.stringify({ amount, rate, courseYears, graceMonths, repayYears, disbursement, unpaid, startMonth }));
    } catch {
      // Private mode or full storage: the tool still works.
    }
  }, [amount, rate, courseYears, graceMonths, repayYears, disbursement, unpaid, startMonth]);

  const plan = useMemo(() => {
    const errors: Record<string, string> = {};
    const principal = parsePaise(amount);
    const rateBps = parseRateBps(rate);
    const whole = (text: string) => (/^\d{1,3}$/.test(text.trim()) ? Number(text.trim()) : null);
    const cy = whole(courseYears);
    const gm = whole(graceMonths);
    const ry = whole(repayYears);
    if (principal === null || principal === 0) errors.amount = tr("Enter a loan amount between ₹1 and ₹100 crore.");
    if (rateBps === null) errors.rate = tr("Enter a rate from 0 to 50 with at most 2 decimals, for example 8.75.");
    if (cy === null || cy < 1 || cy * 12 > MAX_COURSE_MONTHS) errors.course = tr("Enter a course length from 1 to 8 years.");
    if (gm === null || gm > MAX_GRACE_MONTHS) errors.grace = tr("Enter a grace period from 0 to 36 months.");
    if (ry === null || ry < 1 || ry * 12 > MAX_REPAY_MONTHS) errors.repay = tr("Enter a repayment time from 1 to 20 years.");
    if (Object.keys(errors).length > 0 || principal === null || rateBps === null || cy === null || gm === null || ry === null) {
      return { errors, build: null as EducationResult | null, pay: null as EducationResult | null, courseMonths: 0, graceMonthsN: 0, repayMonths: 0 };
    }
    const common = { principal, rateBps, courseMonths: cy * 12, graceMonths: gm, repayMonths: ry * 12, disbursement, unpaidInterest: unpaid };
    return {
      errors,
      build: educationLoan({ ...common, payDuring: false }),
      pay: educationLoan({ ...common, payDuring: true }),
      courseMonths: cy * 12,
      graceMonthsN: gm,
      repayMonths: ry * 12,
    };
  }, [amount, rate, courseYears, graceMonths, repayYears, disbursement, unpaid, tr]);

  const { build, pay } = plan;
  const chosen = shown === "build" ? build : pay;
  const principalPaise = parsePaise(amount) ?? 0;
  const at = (offsetMonths: number) => (startMonth ? monthLabel(`${startMonth}-01`, offsetMonths) : null);
  const courseEnd = plan.courseMonths > 0 ? at(plan.courseMonths - 1) : null;
  const graceEnd = plan.courseMonths > 0 ? at(plan.courseMonths + plan.graceMonthsN - 1) : null;
  const firstEmi = plan.courseMonths > 0 ? at(plan.courseMonths + plan.graceMonthsN) : null;
  const lastEmi = chosen && plan.courseMonths > 0 ? at(plan.courseMonths + plan.graceMonthsN + chosen.repayMonths - 1) : null;
  const interestSaved = build && pay ? build.totalInterest - pay.totalInterest : 0;
  const emiLower = build && pay ? build.emi - pay.emi : 0;
  const amountHint = compact(principalPaise, tr);
  const fileName = "education-loan-plan";

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

  const presets: [number, number, number, number, number, string][] = [
    [1000000, 9.5, 3, 6, 7, tr("₹10 lakh · India")],
    [2500000, 9.5, 2, 6, 10, tr("₹25 lakh · abroad")],
    [750000, 8.85, 4, 12, 7, tr("₹7.5 lakh · 4-year degree")],
  ];

  const err = (key: string, message?: string) =>
    message ? <p id={id(`${key}-err`)} role="alert" className="mt-1.5 text-xs font-semibold text-coral">{message}</p> : null;

  const optionCard = (key: "build" | "pay", r: EducationResult) => {
    const title = key === "build" ? tr("Let the interest build up") : tr("Pay the interest while studying");
    return (
      <div className={`rounded-[12px] border p-4 ${shown === key ? "border-forest" : "border-hairline"} bg-white`}>
        <p className="text-sm font-semibold text-leaf">{title}</p>
        <dl className="mt-3 grid gap-2 text-sm">
          {key === "build" ? (
            <div className="flex justify-between gap-3"><dt className="font-medium text-muted">{tr("Interest that builds up")}</dt><dd className="font-black text-forest tabular-nums">{rupees(r.accrued)}</dd></div>
          ) : (
            <div className="flex justify-between gap-3"><dt className="font-medium text-muted">{tr("You pay each month while studying")}</dt><dd className="font-black text-forest tabular-nums">{r.preEmiFirst === r.preEmiLast ? rupees(r.preEmiFirst) : `${rupees(r.preEmiFirst)} – ${rupees(r.preEmiLast)}`}</dd></div>
          )}
          <div className="flex justify-between gap-3"><dt className="font-medium text-muted">{tr("EMI after the moratorium")}</dt><dd className="font-black text-forest tabular-nums">{rupees(r.emi)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="font-medium text-muted">{tr("EMIs are worked out on")}</dt><dd className="font-black text-forest tabular-nums">{rupees(r.repayPrincipal)}</dd></div>
          <div className="flex justify-between gap-3 border-t border-hairline pt-2"><dt className="font-semibold text-forest">{tr("Total interest")}</dt><dd className="font-black text-forest tabular-nums">{rupees(r.totalInterest)}</dd></div>
        </dl>
        <button type="button" aria-pressed={shown === key} onClick={() => setShown(key)} className="mt-3 rounded-[10px] bg-white px-3.5 py-1.5 text-xs font-bold text-forest ring-1 ring-pebble hover:bg-fog aria-pressed:bg-forest aria-pressed:text-white aria-pressed:ring-forest">{shown === key ? tr("Showing this plan") : tr("Show this plan")}</button>
      </div>
    );
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
      <div className="no-print rounded-[14px] border border-hairline bg-white p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-leaf">{tr("Education loan planner")}</p>
            <h2 className="mt-1 text-2xl font-black text-forest">{tr("Plan your education loan")}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={downloadPdf} disabled={pdfState === "busy" || !chosen} className="rounded-[10px] bg-forest px-4 py-2 text-xs font-bold text-white hover:bg-graphite disabled:opacity-50">{pdfState === "busy" ? tr("Generating...") : tr("Plan PDF")}</button>
            <button type="button" onClick={downloadPng} disabled={pngState === "busy" || !chosen} className="rounded-[10px] bg-white px-4 py-2 text-xs font-bold text-forest ring-1 ring-pebble hover:bg-fog disabled:opacity-50">{pngState === "busy" ? tr("Generating...") : "PNG"}</button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor={id("amount")} className={labelClass}>{tr("Loan amount (₹)")}</label>
            <input id={id("amount")} inputMode="numeric" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={Boolean(plan.errors.amount)} aria-describedby={id("amount-err")} className={fieldClass} />
            <input type="range" min={100000} max={20000000} step={50000} value={Math.min(20000000, Math.max(100000, Math.round(principalPaise / 100)))} onChange={(e) => setAmount(e.target.value)} aria-label={tr("Loan amount slider")} className="mt-3 w-full accent-[#1c1d1f]" />
            {amountHint && !plan.errors.amount ? <p className={hintClass}>{amountHint}</p> : null}
            {err("amount", plan.errors.amount)}
          </div>
          <div>
            <label htmlFor={id("rate")} className={labelClass}>{tr("Interest rate (% per year)")}</label>
            <input id={id("rate")} inputMode="decimal" autoComplete="off" value={rate} onChange={(e) => setRate(e.target.value)} aria-invalid={Boolean(plan.errors.rate)} aria-describedby={id("rate-err")} className={fieldClass} />
            {err("rate", plan.errors.rate)}
          </div>
          <div>
            <label htmlFor={id("start")} className={labelClass}>{tr("Course starts")}</label>
            <input id={id("start")} type="month" value={startMonth} onChange={(e) => setStartMonth(e.target.value)} className={fieldClass} />
          </div>
          <div>
            <label htmlFor={id("course")} className={labelClass}>{tr("Course length (years)")}</label>
            <input id={id("course")} inputMode="numeric" autoComplete="off" value={courseYears} onChange={(e) => setCourseYears(e.target.value)} aria-invalid={Boolean(plan.errors.course)} aria-describedby={id("course-err")} className={fieldClass} />
            {err("course", plan.errors.course)}
          </div>
          <div>
            <label htmlFor={id("grace")} className={labelClass}>{tr("Grace period after the course (months)")}</label>
            <input id={id("grace")} inputMode="numeric" autoComplete="off" value={graceMonths} onChange={(e) => setGraceMonths(e.target.value)} aria-invalid={Boolean(plan.errors.grace)} aria-describedby={id("grace-err")} className={fieldClass} />
            {err("grace", plan.errors.grace)}
          </div>
          <div>
            <label htmlFor={id("repay")} className={labelClass}>{tr("Repayment time (years)")}</label>
            <input id={id("repay")} inputMode="numeric" autoComplete="off" value={repayYears} onChange={(e) => setRepayYears(e.target.value)} aria-invalid={Boolean(plan.errors.repay)} aria-describedby={id("repay-err")} className={fieldClass} />
            {err("repay", plan.errors.repay)}
          </div>
        </div>
        <p className={hintClass}>{tr("The moratorium is the course plus the grace period. No EMI is due in it, but interest is charged.")}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          {presets.map(([p, r, cy, gm, ry, label]) => (
            <button key={label} type="button" onClick={() => { setAmount(String(p)); setRate(String(r)); setCourseYears(String(cy)); setGraceMonths(String(gm)); setRepayYears(String(ry)); }} className="rounded-[7px] border border-pebble bg-white px-3 py-1.5 text-xs font-bold text-forest hover:border-leaf">{label}</button>
          ))}
        </div>

        <fieldset className="mt-6 rounded-[12px] border border-hairline p-4">
          <legend className="px-1 text-sm font-semibold text-leaf">{tr("How your lender charges interest")}</legend>
          <p className={labelClass}>{tr("How the loan is paid out")}</p>
          <div role="group" aria-label={tr("How the loan is paid out")} className="mt-2 inline-flex flex-wrap rounded-[10px] bg-fog p-1">
            <button type="button" aria-pressed={disbursement === "yearly"} onClick={() => setDisbursement("yearly")} className={segClass(disbursement === "yearly")}>{tr("Each year of the course")}</button>
            <button type="button" aria-pressed={disbursement === "upfront"} onClick={() => setDisbursement("upfront")} className={segClass(disbursement === "upfront")}>{tr("All at the start")}</button>
          </div>
          <p className={hintClass}>{tr("Interest is charged only on money already paid out, so paying out each year costs less interest than all at once.")}</p>
          <p className={`${labelClass} mt-4`}>{tr("Interest you do not pay builds up as")}</p>
          <div role="group" aria-label={tr("Interest you do not pay builds up as")} className="mt-2 inline-flex flex-wrap rounded-[10px] bg-fog p-1">
            <button type="button" aria-pressed={unpaid === "simple"} onClick={() => setUnpaid("simple")} className={segClass(unpaid === "simple")}>{tr("Simple interest")}</button>
            <button type="button" aria-pressed={unpaid === "compound"} onClick={() => setUnpaid("compound")} className={segClass(unpaid === "compound")}>{tr("Compound interest (monthly)")}</button>
          </div>
          <p className={hintClass}>{tr("Lenders differ on this. Check your sanction letter or ask your lender.")}</p>
        </fieldset>

        <div aria-live="polite" className="mt-6">
          {build && pay ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                {optionCard("build", build)}
                {optionCard("pay", pay)}
              </div>
              {interestSaved > 0 ? (
                <p className="mt-4 rounded-[12px] bg-fog p-4 text-sm font-semibold text-forest">
                  {fill(tr("Paying the interest while you study saves {amount} overall and lowers your EMI by {emi}."), { amount: rupees(interestSaved), emi: rupees(emiLower) })}
                </p>
              ) : null}
              {courseEnd && graceEnd && firstEmi && lastEmi ? (
                <ul className="mt-4 grid gap-1.5 text-sm font-medium text-charcoal">
                  <li>{fill(tr("Course: {start} to {end}"), { start: at(0) ?? "", end: courseEnd })}</li>
                  <li>{fill(tr("Grace period ends {month}"), { month: graceEnd })}</li>
                  <li>{fill(tr("First EMI {month}"), { month: firstEmi })}</li>
                  <li>{fill(tr("Last EMI {month}"), { month: lastEmi })}</li>
                </ul>
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
            <p className="text-sm font-semibold text-leaf">{shown === "build" ? tr("Let the interest build up") : tr("Pay the interest while studying")}</p>
            <h2 className="mt-1 text-2xl font-black text-forest">{tr("Education loan")}</h2>
            <p className="text-xs font-medium text-muted">{rate}% · {duration(plan.courseMonths + plan.graceMonthsN, tr)} {tr("moratorium")} · {duration(plan.repayMonths, tr)} {tr("repayment")}</p>
          </div>
          <div className="rounded-[10px] bg-fog p-3 text-right">
            <p className="text-xs font-semibold text-muted">{tr("EMI after the moratorium")}</p>
            <p className="text-lg font-black text-forest tabular-nums">{chosen ? rupees(chosen.emi) : "—"}</p>
          </div>
        </header>

        {chosen ? (
          <>
            <section className="mt-4 grid grid-cols-3 gap-3 text-center text-sm">
              <div className="rounded-[10px] bg-fog p-3"><p className="text-xs font-semibold text-muted">{tr("Loan paid out")}</p><p className="font-black text-forest tabular-nums">{rupees(chosen.disbursed)}</p></div>
              <div className="rounded-[10px] bg-fog p-3"><p className="text-xs font-semibold text-muted">{tr("Total interest")}</p><p className="font-black text-forest tabular-nums">{rupees(chosen.totalInterest)}</p></div>
              <div className="rounded-[10px] bg-forest p-3 text-white"><p className="text-xs font-semibold text-white/65">{tr("Total you repay")}</p><p className="font-black tabular-nums">{rupees(chosen.totalCost)}</p></div>
            </section>
            <p className="mt-3 rounded-[10px] bg-fog p-3 text-sm font-medium text-forest">
              {shown === "build"
                ? fill(tr("By the end of the moratorium {amount} of interest has built up, so your EMIs are worked out on {principal}."), { amount: rupees(chosen.accrued), principal: rupees(chosen.repayPrincipal) })
                : fill(tr("You pay {first} a month in interest while studying, so your EMIs are worked out on {principal}."), { first: chosen.preEmiFirst === chosen.preEmiLast ? rupees(chosen.preEmiFirst) : `${rupees(chosen.preEmiFirst)} – ${rupees(chosen.preEmiLast)}`, principal: rupees(chosen.repayPrincipal) })}
            </p>
            <p className="mt-5 text-sm font-semibold text-leaf">{tr("Repayment schedule")}</p>
            <table className="mt-2 w-full text-left text-sm">
              <thead>
                <tr className="border-b border-pebble text-xs text-muted">
                  <th className="py-2 font-semibold">{tr("Year")}</th>
                  <th className="py-2 text-right font-semibold">{tr("Principal paid")}</th>
                  <th className="py-2 text-right font-semibold">{tr("Interest paid")}</th>
                  <th className="py-2 text-right font-semibold">{tr("Balance")}</th>
                </tr>
              </thead>
              <tbody>
                {chosen.schedule.yearly.map((row) => (
                  <tr key={row.year} className="border-b border-hairline">
                    <td className="py-1.5 font-semibold text-forest">{row.year}</td>
                    <td className="py-1.5 text-right tabular-nums">{rupees(row.principalPaid)}</td>
                    <td className="py-1.5 text-right tabular-nums">{rupees(row.interestPaid)}</td>
                    <td className="py-1.5 text-right font-bold tabular-nums">{rupees(row.closing)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <p className="mt-6 text-sm font-semibold text-muted">{tr("Fix the highlighted fields to see your plan.")}</p>
        )}
        <footer className="mt-4 text-center text-xs font-medium text-muted">{tr("Indicative only. Lenders differ in when interest starts, how it is added and in fees; check your sanction letter.")} · Pro UPI QR</footer>
      </article>
    </div>
  );
}
