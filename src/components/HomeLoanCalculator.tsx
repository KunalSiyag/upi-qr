import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { DocLang } from "../data/documentLang";
import { HOME_LOAN_PHRASES } from "../data/homeLoanPhrases";
import { downloadDataUrl, notifyExportError } from "../lib/export-image";
import { renderPaperPng, savePaperPdf } from "../lib/exportPaper";
import { affordability, buildSchedule, monthLabel, parseOptionalPaise, parsePaise, parseRateBps, savings, type Schedule } from "../lib/loanMath";
import { compact, duration, fill, rupees } from "../lib/loanFormat";
import { localTranslator } from "../lib/localPhrases";
import { trackProductEvent } from "../lib/productEvents";

const TOOL = "home-loan-calculator";
const draftKey = "proupiqr-home-loan-draft";
const optionalPaise = parseOptionalPaise;

type Mode = "emi" | "afford";

const fieldClass = "mt-2 w-full rounded-[10px] border border-pebble bg-white px-3.5 py-2.5 font-medium text-forest outline-none focus:border-leaf";
const labelClass = "text-sm font-semibold text-forest";
const hintClass = "mt-1.5 text-xs font-medium text-muted";

export function HomeLoanCalculator({ lang = "en" }: { lang?: DocLang } = {}) {
  const tr = useMemo(() => localTranslator(lang, HOME_LOAN_PHRASES), [lang]);
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;

  const [mode, setMode] = useState<Mode>("emi");
  const [amount, setAmount] = useState("5000000");
  const [rate, setRate] = useState("8.5");
  const [years, setYears] = useState(20);
  const [monthsPart, setMonthsPart] = useState(0);
  const [startMonth, setStartMonth] = useState("");
  const [extra, setExtra] = useState("");
  const [lump, setLump] = useState("");
  const [lumpMonth, setLumpMonth] = useState("12");
  const [income, setIncome] = useState("100000");
  const [existing, setExisting] = useState("0");
  const [foir, setFoir] = useState(50);

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
    const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
    setAmount(str(draft.amount, "5000000"));
    setRate(str(draft.rate, "8.5"));
    setYears(Math.max(0, Math.min(40, num(draft.years, 20))));
    setMonthsPart(Math.max(0, Math.min(11, num(draft.monthsPart, 0))));
    setExtra(str(draft.extra, ""));
    setLump(str(draft.lump, ""));
    setLumpMonth(str(draft.lumpMonth, "12"));
    setIncome(str(draft.income, "100000"));
    setExisting(str(draft.existing, "0"));
    setFoir(Math.max(10, Math.min(100, num(draft.foir, 50))));
    setStartMonth(str(draft.startMonth, "") || new Date().toISOString().slice(0, 7));
  }, []);

  useEffect(() => {
    if (!startMonth) return; // draft not loaded yet
    try {
      localStorage.setItem(draftKey, JSON.stringify({ amount, rate, years, monthsPart, startMonth, extra, lump, lumpMonth, income, existing, foir }));
    } catch {
      // Private mode or full storage: the tool still works.
    }
  }, [amount, rate, years, monthsPart, startMonth, extra, lump, lumpMonth, income, existing, foir]);

  const totalMonths = years * 12 + monthsPart;

  const result = useMemo(() => {
    const errors: Record<string, string> = {};
    const principal = parsePaise(amount);
    const rateBps = parseRateBps(rate);
    const extraPaise = optionalPaise(extra);
    const lumpPaise = optionalPaise(lump);
    const lumpAt = lumpMonth.trim() === "" ? 0 : /^\d{1,3}$/.test(lumpMonth.trim()) ? Number(lumpMonth.trim()) : null;
    if (principal === null || principal === 0) errors.amount = tr("Enter a loan amount between ₹1 and ₹100 crore.");
    if (rateBps === null) errors.rate = tr("Enter a rate from 0 to 50 with at most 2 decimals, for example 8.75.");
    if (totalMonths < 1) errors.tenure = tr("Enter a tenure of at least 1 month.");
    if (extraPaise === null) errors.extra = tr("Enter a rupee amount, for example 5,000.");
    if (lumpPaise === null) errors.lump = tr("Enter a rupee amount, for example 2,00,000.");
    if (lumpAt === null || (lumpPaise ?? 0) > 0 && (lumpAt < 1 || lumpAt > totalMonths)) errors.lumpMonth = tr("Enter an instalment number within the tenure.");
    if (Object.keys(errors).length > 0 || principal === null || rateBps === null || extraPaise === null || lumpPaise === null || lumpAt === null) {
      return { errors, base: null as Schedule | null, plan: null as Schedule | null, prepaying: false };
    }
    const base = buildSchedule({ principal, rateBps, months: totalMonths });
    const prepaying = extraPaise > 0 || lumpPaise > 0;
    const plan = prepaying ? buildSchedule({ principal, rateBps, months: totalMonths, extraMonthly: extraPaise, lumpSum: lumpPaise, lumpMonth: lumpAt }) : base;
    return { errors, base, plan, prepaying };
  }, [amount, rate, totalMonths, extra, lump, lumpMonth, tr]);

  const afford = useMemo(() => {
    const errors: Record<string, string> = {};
    const inc = parsePaise(income);
    const ex = optionalPaise(existing);
    const rateBps = parseRateBps(rate);
    if (inc === null || inc === 0) errors.income = tr("Enter your monthly income in rupees.");
    if (ex === null) errors.existing = tr("Enter a rupee amount, or leave it at 0.");
    if (rateBps === null || totalMonths < 1) errors.rate = tr("Set a valid rate and tenure in the loan section first.");
    if (Object.keys(errors).length > 0 || inc === null || ex === null || rateBps === null) return { errors, value: null };
    return { errors, value: affordability(inc, ex, foir, rateBps, totalMonths) };
  }, [income, existing, foir, rate, totalMonths, tr]);

  const principalPaise = parsePaise(amount) ?? 0;
  const { base, plan, prepaying } = result;
  const saved = base && plan && prepaying ? savings(base, plan) : null;
  const firstLabel = startMonth ? monthLabel(`${startMonth}-01`, 0) : null;
  const endBase = base && startMonth ? monthLabel(`${startMonth}-01`, base.months - 1) : null;
  const endPlan = plan && startMonth ? monthLabel(`${startMonth}-01`, plan.months - 1) : null;
  const interestShare = plan && plan.totalPaid > 0 ? (principalPaise / plan.totalPaid) * 100 : 0;
  const amountHint = compact(principalPaise, tr);
  const fileName = "home-loan-schedule";

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

  const presets: [number, number, number, string][] = [
    [3000000, 8.5, 20, tr("₹30 lakh · 20y")],
    [5000000, 8.5, 20, tr("₹50 lakh · 20y")],
    [10000000, 8.75, 25, tr("₹1 crore · 25y")],
  ];

  const err = (key: string, message?: string) =>
    message ? <p id={id(`${key}-err`)} role="alert" className="mt-1.5 text-xs font-semibold text-coral">{message}</p> : null;

  return (
    <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
      <div className="no-print rounded-[14px] border border-hairline bg-white p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-leaf">{tr("Home loan planner")}</p>
            <h2 className="mt-1 text-2xl font-black text-forest">{tr("Plan your home loan")}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={downloadPdf} disabled={pdfState === "busy" || !plan} className="rounded-[10px] bg-forest px-4 py-2 text-xs font-bold text-white hover:bg-graphite disabled:opacity-50">{pdfState === "busy" ? tr("Generating...") : tr("Schedule PDF")}</button>
            <button type="button" onClick={downloadPng} disabled={pngState === "busy" || !plan} className="rounded-[10px] bg-white px-4 py-2 text-xs font-bold text-forest ring-1 ring-pebble hover:bg-fog disabled:opacity-50">{pngState === "busy" ? tr("Generating...") : "PNG"}</button>
          </div>
        </div>

        <div role="group" aria-label={tr("Calculator mode")} className="mt-5 inline-flex rounded-[10px] bg-fog p-1">
          {([["emi", tr("EMI and prepayment")], ["afford", tr("How much can I borrow")]] as [Mode, string][]).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)} className={`rounded-[8px] px-3.5 py-1.5 text-xs font-bold transition ${mode === value ? "bg-white text-forest shadow-card" : "text-muted hover:text-forest"}`}>{label}</button>
          ))}
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor={id("amount")} className={labelClass}>{tr("Loan amount (₹)")}</label>
            <input id={id("amount")} inputMode="numeric" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={Boolean(result.errors.amount)} aria-describedby={id("amount-err")} className={fieldClass} />
            <input type="range" min={100000} max={50000000} step={50000} value={Math.min(50000000, Math.max(100000, Math.round(paiseOf(amount) / 100)))} onChange={(e) => setAmount(e.target.value)} aria-label={tr("Loan amount slider")} className="mt-3 w-full accent-[#1c1d1f]" />
            {amountHint && !result.errors.amount ? <p className={hintClass}>{amountHint}</p> : null}
            {err("amount", result.errors.amount)}
          </div>
          <div>
            <label htmlFor={id("rate")} className={labelClass}>{tr("Interest rate (% per year)")}</label>
            <input id={id("rate")} inputMode="decimal" autoComplete="off" value={rate} onChange={(e) => setRate(e.target.value)} aria-invalid={Boolean(result.errors.rate)} aria-describedby={id("rate-err")} className={fieldClass} />
            {err("rate", result.errors.rate)}
          </div>
          <div>
            <label htmlFor={id("start")} className={labelClass}>{tr("First EMI month")}</label>
            <input id={id("start")} type="month" value={startMonth} onChange={(e) => setStartMonth(e.target.value)} className={fieldClass} />
          </div>
          <div>
            <label htmlFor={id("years")} className={labelClass}>{tr("Tenure — years")}</label>
            <input id={id("years")} type="number" min={0} max={40} value={years} onChange={(e) => setYears(Math.max(0, Math.min(40, Math.trunc(Number(e.target.value)) || 0)))} className={fieldClass} />
          </div>
          <div>
            <label htmlFor={id("months")} className={labelClass}>{tr("+ months")}</label>
            <input id={id("months")} type="number" min={0} max={11} value={monthsPart} onChange={(e) => setMonthsPart(Math.max(0, Math.min(11, Math.trunc(Number(e.target.value)) || 0)))} className={fieldClass} />
          </div>
          <div className="sm:col-span-2">{err("tenure", result.errors.tenure)}</div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {presets.map(([p, r, y, label]) => (
            <button key={label} type="button" onClick={() => { setAmount(String(p)); setRate(String(r)); setYears(y); setMonthsPart(0); }} className="rounded-[7px] border border-pebble bg-white px-3 py-1.5 text-xs font-bold text-forest hover:border-leaf">{label}</button>
          ))}
        </div>

        {mode === "emi" ? (
          <>
            <fieldset className="mt-6 rounded-[12px] border border-hairline p-4">
              <legend className="px-1 text-sm font-semibold text-leaf">{tr("Prepay to save interest")}</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor={id("extra")} className={labelClass}>{tr("Extra every month (₹)")}</label>
                  <input id={id("extra")} inputMode="numeric" autoComplete="off" placeholder="0" value={extra} onChange={(e) => setExtra(e.target.value)} aria-invalid={Boolean(result.errors.extra)} aria-describedby={id("extra-err")} className={fieldClass} />
                  {err("extra", result.errors.extra)}
                </div>
                <div>
                  <label htmlFor={id("lump")} className={labelClass}>{tr("One-time prepayment (₹)")}</label>
                  <input id={id("lump")} inputMode="numeric" autoComplete="off" placeholder="0" value={lump} onChange={(e) => setLump(e.target.value)} aria-invalid={Boolean(result.errors.lump)} aria-describedby={id("lump-err")} className={fieldClass} />
                  {err("lump", result.errors.lump)}
                </div>
                <div>
                  <label htmlFor={id("lumpmonth")} className={labelClass}>{tr("After instalment number")}</label>
                  <input id={id("lumpmonth")} inputMode="numeric" autoComplete="off" value={lumpMonth} onChange={(e) => setLumpMonth(e.target.value)} aria-invalid={Boolean(result.errors.lumpMonth)} aria-describedby={id("lumpmonth-err")} className={fieldClass} />
                  {err("lumpmonth", result.errors.lumpMonth)}
                </div>
              </div>
              <p className={hintClass}>{tr("Prepayments go to principal and your EMI stays the same, so the loan ends sooner. Some lenders let you lower the EMI instead; ask yours.")}</p>
            </fieldset>

            <div aria-live="polite" className="mt-6">
              {plan && base ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-[12px] bg-forest p-4 text-white"><p className="text-xs font-semibold text-white/65">{tr("Monthly EMI")}</p><p className="mt-1 text-2xl font-black tabular-nums">{rupees(plan.emi)}</p></div>
                    <div className="rounded-[12px] bg-fog p-4"><p className="text-xs font-semibold text-muted">{tr("Total interest")}</p><p className="mt-1 text-xl font-black text-forest tabular-nums">{rupees(plan.totalInterest)}</p></div>
                    <div className="rounded-[12px] bg-fog p-4"><p className="text-xs font-semibold text-muted">{tr("Total payable")}</p><p className="mt-1 text-xl font-black text-forest tabular-nums">{rupees(plan.totalPaid)}</p></div>
                  </div>
                  <div className="mt-4">
                    <div className="flex h-2.5 overflow-hidden rounded-full bg-fog" aria-hidden="true">
                      <div className="bg-forest" style={{ width: `${interestShare}%` }} />
                      <div className="bg-leaf" style={{ width: `${100 - interestShare}%` }} />
                    </div>
                    <div className="mt-2 flex justify-between text-xs font-semibold text-muted">
                      <span>{tr("Principal")} {rupees(principalPaise)}</span>
                      <span>{tr("Interest")} {rupees(plan.totalInterest)}</span>
                    </div>
                  </div>
                  {saved ? (
                    <div className="mt-5 rounded-[12px] border border-hairline bg-white p-4">
                      <p className="text-sm font-semibold text-leaf">{tr("What prepaying changes")}</p>
                      <p className="mt-2 text-lg font-black text-forest">{fill(tr("You save {amount} in interest"), { amount: rupees(saved.interestSaved) })}</p>
                      <p className="mt-1 text-sm font-medium text-charcoal">
                        {endBase && endPlan
                          ? fill(tr("The loan ends {duration} sooner: {new} instead of {old}."), { duration: duration(saved.monthsSaved, tr), new: endPlan, old: endBase })
                          : fill(tr("The loan ends {duration} sooner."), { duration: duration(saved.monthsSaved, tr) })}
                      </p>
                    </div>
                  ) : (
                    <p className={hintClass}>{endBase ? `${fill(tr("Last EMI: {month}."), { month: endBase })} ` : ""}{tr("Add a monthly extra or a one-time prepayment above to see how much interest you save.")}</p>
                  )}
                </>
              ) : (
                <p className="rounded-[12px] bg-fog p-4 text-sm font-semibold text-muted">{tr("Fix the highlighted fields to see your EMI.")}</p>
              )}
            </div>
          </>
        ) : (
          <div className="mt-6 rounded-[12px] border border-hairline p-4">
            <p className="text-sm font-semibold text-leaf">{tr("What a lender may offer")}</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor={id("income")} className={labelClass}>{tr("Monthly income, take-home (₹)")}</label>
                <input id={id("income")} inputMode="numeric" autoComplete="off" value={income} onChange={(e) => setIncome(e.target.value)} aria-invalid={Boolean(afford.errors.income)} aria-describedby={id("income-err")} className={fieldClass} />
                {err("income", afford.errors.income)}
              </div>
              <div>
                <label htmlFor={id("existing")} className={labelClass}>{tr("EMIs you already pay each month (₹)")}</label>
                <input id={id("existing")} inputMode="numeric" autoComplete="off" value={existing} onChange={(e) => setExisting(e.target.value)} aria-invalid={Boolean(afford.errors.existing)} aria-describedby={id("existing-err")} className={fieldClass} />
                {err("existing", afford.errors.existing)}
              </div>
              <div className="sm:col-span-2">
                <label htmlFor={id("foir")} className={labelClass}>{tr("Share of income a lender lets you spend on EMIs")}: {foir}%</label>
                <input id={id("foir")} type="range" min={10} max={100} step={5} value={foir} onChange={(e) => setFoir(Number(e.target.value))} className="mt-3 w-full accent-[#1c1d1f]" />
                <p className={hintClass}>{tr("Many banks use 40 to 60 percent. Check your lender's figure.")}</p>
              </div>
            </div>
            <div aria-live="polite" className="mt-4">
              {err("rate", afford.errors.rate)}
              {afford.value ? (
                afford.value.maxLoan > 0 ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-[12px] bg-forest p-4 text-white"><p className="text-xs font-semibold text-white/65">{tr("Loan you may get")}</p><p className="mt-1 text-2xl font-black tabular-nums">{rupees(afford.value.maxLoan)}</p><p className="mt-0.5 text-xs font-medium text-white/65">{compact(afford.value.maxLoan, tr) ?? ""}</p></div>
                      <div className="rounded-[12px] bg-fog p-4"><p className="text-xs font-semibold text-muted">{tr("EMI you can carry")}</p><p className="mt-1 text-xl font-black text-forest tabular-nums">{rupees(afford.value.maxEmi)}</p></div>
                    </div>
                    <button type="button" onClick={() => { setAmount(String(Math.floor(afford.value!.maxLoan / 100))); setMode("emi"); }} className="mt-3 rounded-[10px] bg-white px-4 py-2 text-xs font-bold text-forest ring-1 ring-pebble hover:bg-fog">{tr("Use this loan amount")}</button>
                  </>
                ) : (
                  <p className="rounded-[12px] bg-fog p-4 text-sm font-semibold text-muted">{tr("Your existing EMIs already use up the budget at this share of income, so there is no room for a new loan.")}</p>
                )
              ) : null}
              <p className={hintClass}>{tr("An estimate only. Lenders also look at your credit score, age, job stability and the property's value.")}</p>
            </div>
          </div>
        )}
      </div>

      <article ref={paperRef} className="invoice-paper mx-auto h-fit w-full max-w-[780px] rounded-[14px] border border-hairline bg-white p-6 shadow-card md:p-8">
        <header className="flex items-start justify-between gap-4 border-b-2 border-forest pb-4">
          <div>
            <p className="text-sm font-semibold text-leaf">{tr("Repayment schedule")}</p>
            <h2 className="mt-1 text-2xl font-black text-forest">{tr("Home loan")}</h2>
            <p className="text-xs font-medium text-muted">{firstLabel ? `${fill(tr("First EMI {month}"), { month: firstLabel })} · ` : ""}{rate}% · {duration(totalMonths, tr)}</p>
          </div>
          <div className="rounded-[10px] bg-fog p-3 text-right">
            <p className="text-xs font-semibold text-muted">{tr("Monthly EMI")}</p>
            <p className="text-lg font-black text-forest tabular-nums">{plan ? rupees(plan.emi) : "—"}</p>
          </div>
        </header>

        {plan ? (
          <>
            <section className="mt-4 grid grid-cols-3 gap-3 text-center text-sm">
              <div className="rounded-[10px] bg-fog p-3"><p className="text-xs font-semibold text-muted">{tr("Loan")}</p><p className="font-black text-forest tabular-nums">{rupees(principalPaise)}</p></div>
              <div className="rounded-[10px] bg-fog p-3"><p className="text-xs font-semibold text-muted">{tr("Interest")}</p><p className="font-black text-forest tabular-nums">{rupees(plan.totalInterest)}</p></div>
              <div className="rounded-[10px] bg-forest p-3 text-white"><p className="text-xs font-semibold text-white/65">{tr("Total payable")}</p><p className="font-black tabular-nums">{rupees(plan.totalPaid)}</p></div>
            </section>
            {saved ? (
              <p className="mt-3 rounded-[10px] bg-fog p-3 text-sm font-semibold text-forest">{fill(tr("With prepayment you save {amount} in interest and finish {duration} sooner."), { amount: rupees(saved.interestSaved), duration: duration(saved.monthsSaved, tr) })}</p>
            ) : null}
            <table className="mt-5 w-full text-left text-sm">
              <thead>
                <tr className="border-b border-pebble text-xs text-muted">
                  <th className="py-2 font-semibold">{tr("Year")}</th>
                  <th className="py-2 text-right font-semibold">{tr("Principal paid")}</th>
                  {prepaying ? <th className="py-2 text-right font-semibold">{tr("Prepaid")}</th> : null}
                  <th className="py-2 text-right font-semibold">{tr("Interest paid")}</th>
                  <th className="py-2 text-right font-semibold">{tr("Balance")}</th>
                </tr>
              </thead>
              <tbody>
                {plan.yearly.map((row) => (
                  <tr key={row.year} className="border-b border-hairline">
                    <td className="py-1.5 font-semibold text-forest">{row.year}</td>
                    <td className="py-1.5 text-right tabular-nums">{rupees(row.principalPaid)}</td>
                    {prepaying ? <td className="py-1.5 text-right tabular-nums">{rupees(row.prepaid)}</td> : null}
                    <td className="py-1.5 text-right tabular-nums">{rupees(row.interestPaid)}</td>
                    <td className="py-1.5 text-right font-bold tabular-nums">{rupees(row.closing)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <p className="mt-6 text-sm font-semibold text-muted">{tr("Fix the highlighted fields to see your EMI.")}</p>
        )}
        <footer className="mt-4 text-center text-xs font-medium text-muted">{tr("Indicative only. Your lender's figures may differ by a few rupees and may add fees or insurance.")} · Pro UPI QR</footer>
      </article>
    </div>
  );
}

/** Rupees in the amount box as a whole number for the slider; 0 when the text is not a valid amount. */
function paiseOf(text: string): number {
  return parsePaise(text) ?? 0;
}
