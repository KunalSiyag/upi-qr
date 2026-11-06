import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { DocLang } from "../data/documentLang";
import { DEPOSIT_PHRASES } from "../data/depositPhrases";
import {
  MAX_MONTHS, MAX_RATE_BPS, afterTax, fdCumulative, fdCumulativeYearly, fdPayout, rdMaturity, rdYearly, yearlyReturnPercent,
  type PeriodsPerYear,
} from "../lib/deposits";
import { downloadDataUrl, notifyExportError } from "../lib/export-image";
import { renderPaperPng, savePaperPdf } from "../lib/exportPaper";
import { compact, duration, fill, rupees } from "../lib/loanFormat";
import { monthLabel, parsePaise, parseRateBps } from "../lib/loanMath";
import { localTranslator } from "../lib/localPhrases";
import { trackProductEvent } from "../lib/productEvents";

const fieldClass = "mt-2 w-full rounded-[10px] border border-pebble bg-white px-3.5 py-2.5 font-medium text-forest outline-none focus:border-leaf";
const labelClass = "text-sm font-semibold text-forest";
const hintClass = "mt-1.5 text-xs font-medium text-muted";
const segClass = (on: boolean) => `rounded-[8px] px-3 py-1.5 text-xs font-bold transition ${on ? "bg-white text-forest shadow-card" : "text-muted hover:text-forest"}`;

type Payout = "cumulative" | "monthly" | "quarterly" | "half" | "yearly";
const PAYOUT_FREQ: Record<Exclude<Payout, "cumulative">, PeriodsPerYear> = { monthly: 12, quarterly: 4, half: 2, yearly: 1 };
const COMPOUND: [PeriodsPerYear, string][] = [[4, "Every quarter"], [12, "Every month"], [2, "Every 6 months"], [1, "Every year"]];

export function DepositCalculator({ mode = "fd", lang = "en" }: { mode?: "fd" | "rd"; lang?: DocLang } = {}) {
  const tr = useMemo(() => localTranslator(lang, DEPOSIT_PHRASES), [lang]);
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;
  const TOOL = mode === "fd" ? "fd-calculator" : "rd-calculator";
  const draftKey = `proupiqr-${mode}-calculator-draft`;

  const [amount, setAmount] = useState(mode === "fd" ? "500000" : "5000");
  const [rate, setRate] = useState("7");
  const [years, setYears] = useState("3");
  const [monthsPart, setMonthsPart] = useState("0");
  const [startMonth, setStartMonth] = useState("");
  const [payout, setPayout] = useState<Payout>("cumulative");
  const [compound, setCompound] = useState<PeriodsPerYear>(4);
  const [tax, setTax] = useState("0");

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
    setAmount(str(draft.amount, mode === "fd" ? "500000" : "5000"));
    setRate(str(draft.rate, "7"));
    setYears(str(draft.years, "3"));
    setMonthsPart(str(draft.monthsPart, "0"));
    setTax(str(draft.tax, "0"));
    if (draft.payout === "cumulative" || draft.payout === "monthly" || draft.payout === "quarterly" || draft.payout === "half" || draft.payout === "yearly") setPayout(draft.payout);
    if (draft.compound === 1 || draft.compound === 2 || draft.compound === 4 || draft.compound === 12) setCompound(draft.compound);
    setStartMonth(str(draft.startMonth, "") || new Date().toISOString().slice(0, 7));
  }, [draftKey, mode]);

  useEffect(() => {
    if (!startMonth) return; // draft not loaded yet
    try {
      localStorage.setItem(draftKey, JSON.stringify({ amount, rate, years, monthsPart, startMonth, payout, compound, tax }));
    } catch {
      // Private mode or full storage: the tool still works.
    }
  }, [draftKey, amount, rate, years, monthsPart, startMonth, payout, compound, tax]);

  const calc = useMemo(() => {
    const errors: Record<string, string> = {};
    const amountPaise = parsePaise(amount);
    const rateBps = parseRateBps(rate);
    const taxBps = parseRateBps(tax);
    const whole = (text: string) => (/^\d{1,3}$/.test(text.trim()) ? Number(text.trim()) : null);
    const y = whole(years);
    const m = whole(monthsPart);
    const months = y === null || m === null ? 0 : y * 12 + m;
    if (amountPaise === null || amountPaise === 0) errors.amount = tr("Enter an amount between ₹1 and ₹100 crore.");
    if (rateBps === null || rateBps > MAX_RATE_BPS) errors.rate = tr("Enter a rate from 0 to 25 with at most 2 decimals, for example 7.25.");
    if (y === null || m === null || months < 1 || months > MAX_MONTHS || m > 11) errors.tenure = tr("Enter a tenure from 1 month to 10 years, with 0 to 11 extra months.");
    if (taxBps === null || taxBps > 5000) errors.tax = tr("Enter a tax rate from 0 to 50.");
    if (Object.keys(errors).length > 0 || amountPaise === null || rateBps === null || taxBps === null) return { errors, months: 0 };
    if (mode === "rd") {
      const r = rdMaturity(amountPaise, rateBps, months);
      return { errors, months, kind: "rd" as const, amountPaise, rateBps, taxBps, rd: r, rows: rdYearly(amountPaise, rateBps, months), net: afterTax(r.interest, taxBps) };
    }
    if (payout === "cumulative") {
      const r = fdCumulative(amountPaise, rateBps, months, compound);
      return { errors, months, kind: "fdc" as const, amountPaise, rateBps, taxBps, fd: r, rows: fdCumulativeYearly(amountPaise, rateBps, months, compound), net: afterTax(r.interest, taxBps), yieldPct: yearlyReturnPercent(amountPaise, r.maturity, months) };
    }
    const freq = PAYOUT_FREQ[payout];
    const r = fdPayout(amountPaise, rateBps, months, freq);
    return { errors, months, kind: "fdp" as const, amountPaise, rateBps, taxBps, pay: r, freq, net: afterTax(r.totalInterest, taxBps) };
  }, [amount, rate, years, monthsPart, tax, payout, compound, mode, tr]);

  const ok = calc.errors && Object.keys(calc.errors).length === 0 && "kind" in calc;
  const startIso = startMonth ? `${startMonth}-01` : "";
  const maturesOn = ok && startMonth ? monthLabel(startIso, calc.months) : null;
  const amountHint = parsePaise(amount) !== null ? compact(parsePaise(amount) ?? 0, tr) : null;
  const fileName = mode === "fd" ? "fixed-deposit-schedule" : "recurring-deposit-schedule";

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

  const presets: [number, number, number, string][] =
    mode === "fd"
      ? [[100000, 1, 0, tr("₹1 lakh · 1 year")], [500000, 3, 0, tr("₹5 lakh · 3 years")], [1000000, 5, 0, tr("₹10 lakh · 5 years")]]
      : [[2000, 2, 0, tr("₹2,000 a month · 2 years")], [5000, 5, 0, tr("₹5,000 a month · 5 years")], [10000, 3, 0, tr("₹10,000 a month · 3 years")]];

  const err = (key: string, message?: string) =>
    message ? <p id={id(`${key}-err`)} role="alert" className="mt-1.5 text-xs font-semibold text-coral">{message}</p> : null;

  const payoutLabels: [Payout, string][] = [["cumulative", tr("At maturity")], ["monthly", tr("Every month")], ["quarterly", tr("Every quarter")], ["half", tr("Every 6 months")], ["yearly", tr("Every year")]];
  const everyText = (freq: PeriodsPerYear, amountText: string) =>
    freq === 12 ? fill(tr("You receive {amount} every month."), { amount: amountText })
      : freq === 4 ? fill(tr("You receive {amount} every quarter."), { amount: amountText })
        : freq === 2 ? fill(tr("You receive {amount} every 6 months."), { amount: amountText })
          : fill(tr("You receive {amount} every year."), { amount: amountText });

  const headline = !ok ? null
    : calc.kind === "rd" ? { label: tr("Maturity value"), value: rupees(calc.rd.maturity) }
      : calc.kind === "fdc" ? { label: tr("Maturity value"), value: rupees(calc.fd.maturity) }
        : { label: tr("Interest you receive in all"), value: rupees(calc.pay.totalInterest) };
  const invested = ok ? calc.amountPaise * (calc.kind === "rd" ? calc.months : 1) : 0;
  const interestTotal = !ok ? 0 : calc.kind === "rd" ? calc.rd.interest : calc.kind === "fdc" ? calc.fd.interest : calc.pay.totalInterest;

  return (
    <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
      <div className="no-print rounded-[14px] border border-hairline bg-white p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-leaf">{mode === "fd" ? tr("Fixed deposit planner") : tr("Recurring deposit planner")}</p>
            <h2 className="mt-1 text-2xl font-black text-forest">{mode === "fd" ? tr("Plan your fixed deposit") : tr("Plan your recurring deposit")}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={downloadPdf} disabled={pdfState === "busy" || !ok} className="rounded-[10px] bg-forest px-4 py-2 text-xs font-bold text-white hover:bg-graphite disabled:opacity-50">{pdfState === "busy" ? tr("Generating...") : tr("Schedule PDF")}</button>
            <button type="button" onClick={downloadPng} disabled={pngState === "busy" || !ok} className="rounded-[10px] bg-white px-4 py-2 text-xs font-bold text-forest ring-1 ring-pebble hover:bg-fog disabled:opacity-50">{pngState === "busy" ? tr("Generating...") : "PNG"}</button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor={id("amount")} className={labelClass}>{mode === "fd" ? tr("Deposit amount (₹)") : tr("Monthly deposit (₹)")}</label>
            <input id={id("amount")} inputMode="numeric" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={Boolean(calc.errors.amount)} aria-describedby={id("amount-err")} className={fieldClass} />
            {amountHint && !calc.errors.amount ? <p className={hintClass}>{amountHint}</p> : null}
            {err("amount", calc.errors.amount)}
          </div>
          <div>
            <label htmlFor={id("rate")} className={labelClass}>{tr("Interest rate (% per year)")}</label>
            <input id={id("rate")} inputMode="decimal" autoComplete="off" value={rate} onChange={(e) => setRate(e.target.value)} aria-invalid={Boolean(calc.errors.rate)} aria-describedby={id("rate-err")} className={fieldClass} />
            {err("rate", calc.errors.rate)}
          </div>
          <div>
            <label htmlFor={id("start")} className={labelClass}>{tr("Deposit starts")}</label>
            <input id={id("start")} type="month" value={startMonth} onChange={(e) => setStartMonth(e.target.value)} className={fieldClass} />
          </div>
          <div>
            <label htmlFor={id("years")} className={labelClass}>{tr("Tenure — years")}</label>
            <input id={id("years")} inputMode="numeric" autoComplete="off" value={years} onChange={(e) => setYears(e.target.value)} aria-invalid={Boolean(calc.errors.tenure)} aria-describedby={id("tenure-err")} className={fieldClass} />
          </div>
          <div>
            <label htmlFor={id("months")} className={labelClass}>{tr("+ months")}</label>
            <input id={id("months")} inputMode="numeric" autoComplete="off" value={monthsPart} onChange={(e) => setMonthsPart(e.target.value)} aria-invalid={Boolean(calc.errors.tenure)} aria-describedby={id("tenure-err")} className={fieldClass} />
          </div>
          <div className="sm:col-span-2">{err("tenure", calc.errors.tenure)}</div>
        </div>
        <p className={hintClass}>{tr("Use the rate your bank offers for this tenure.")}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          {presets.map(([a, y, m, label]) => (
            <button key={label} type="button" onClick={() => { setAmount(String(a)); setYears(String(y)); setMonthsPart(String(m)); }} className="rounded-[7px] border border-pebble bg-white px-3 py-1.5 text-xs font-bold text-forest hover:border-leaf">{label}</button>
          ))}
        </div>

        {mode === "fd" ? (
          <fieldset className="mt-6 rounded-[12px] border border-hairline p-4">
            <legend className="px-1 text-sm font-semibold text-leaf">{tr("How you get the interest")}</legend>
            <div role="group" aria-label={tr("How you get the interest")} className="inline-flex flex-wrap rounded-[10px] bg-fog p-1">
              {payoutLabels.map(([value, label]) => (
                <button key={value} type="button" aria-pressed={payout === value} onClick={() => setPayout(value)} className={segClass(payout === value)}>{label}</button>
              ))}
            </div>
            {payout === "cumulative" ? (
              <>
                <p className={`${labelClass} mt-4`}>{tr("Interest is added to the deposit")}</p>
                <div role="group" aria-label={tr("Interest is added to the deposit")} className="mt-2 inline-flex flex-wrap rounded-[10px] bg-fog p-1">
                  {COMPOUND.map(([value, label]) => (
                    <button key={value} type="button" aria-pressed={compound === value} onClick={() => setCompound(value)} className={segClass(compound === value)}>{tr(label)}</button>
                  ))}
                </div>
                <p className={hintClass}>{tr("Many banks add it every quarter. Check yours.")}</p>
              </>
            ) : (
              <p className={hintClass}>{tr("Some banks pay slightly less on monthly and quarterly payouts than this simple split; ask yours.")}</p>
            )}
          </fieldset>
        ) : null}

        <div className="mt-5">
          <label htmlFor={id("tax")} className={labelClass}>{tr("Tax on the interest (%)")}</label>
          <input id={id("tax")} inputMode="decimal" autoComplete="off" value={tax} onChange={(e) => setTax(e.target.value)} aria-invalid={Boolean(calc.errors.tax)} aria-describedby={id("tax-err")} className={fieldClass} />
          <p className={hintClass}>{tr("Your own tax rate on interest, as a rough guide. Cess, surcharge and when tax is deducted are not included.")}</p>
          {err("tax", calc.errors.tax)}
        </div>

        <div aria-live="polite" className="mt-6">
          {ok && headline ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-[12px] bg-forest p-4 text-white"><p className="text-xs font-semibold text-white/65">{headline.label}</p><p className="mt-1 text-2xl font-black tabular-nums">{headline.value}</p></div>
                <div className="rounded-[12px] bg-fog p-4"><p className="text-xs font-semibold text-muted">{mode === "rd" ? tr("You deposit") : tr("You invest")}</p><p className="mt-1 text-xl font-black text-forest tabular-nums">{rupees(invested)}</p></div>
                <div className="rounded-[12px] bg-fog p-4"><p className="text-xs font-semibold text-muted">{tr("Interest earned")}</p><p className="mt-1 text-xl font-black text-forest tabular-nums">{rupees(interestTotal)}</p></div>
              </div>
              {calc.kind === "fdp" ? (
                <div className="mt-4 rounded-[12px] border border-hairline bg-white p-4 text-sm font-medium text-charcoal">
                  <p className="font-black text-forest">{everyText(calc.freq, rupees(calc.pay.amount))}</p>
                  <p className="mt-1">{fill(tr("Your {principal} comes back at maturity."), { principal: rupees(calc.amountPaise) })}</p>
                  {calc.pay.partial > 0 ? <p className="mt-1">{fill(tr("Interest for the last {time} is {amount}, paid at maturity."), { time: duration(calc.months - calc.pay.payouts * (12 / calc.freq), tr), amount: rupees(calc.pay.partial) })}</p> : null}
                </div>
              ) : null}
              {calc.kind === "fdc" && calc.yieldPct !== null ? (
                <p className="mt-3 text-sm font-medium text-charcoal">{fill(tr("That is a yearly return of {percent}% once the interest compounds."), { percent: calc.yieldPct.toFixed(2) })}</p>
              ) : null}
              {calc.kind === "rd" ? <p className="mt-3 text-sm font-medium text-charcoal">{fill(tr("Over {time} you deposit {total} in all."), { time: duration(calc.months, tr), total: rupees(invested) })}</p> : null}
              {maturesOn ? <p className="mt-1 text-sm font-medium text-charcoal">{fill(tr("Matures {month}."), { month: maturesOn })}</p> : null}
              {calc.taxBps > 0 ? (
                <p className="mt-3 rounded-[12px] bg-fog p-4 text-sm font-semibold text-forest">
                  {fill(tr("After tax at {rate}% the interest is {net}, so you keep {total} in all."), {
                    rate: tax.trim(),
                    net: rupees(calc.net.net),
                    total: rupees(invested + calc.net.net),
                  })}
                </p>
              ) : null}
            </>
          ) : (
            <p className="rounded-[12px] bg-fog p-4 text-sm font-semibold text-muted">{tr("Fix the highlighted fields to see your result.")}</p>
          )}
        </div>
      </div>

      <article ref={paperRef} className="invoice-paper mx-auto h-fit w-full max-w-[780px] rounded-[14px] border border-hairline bg-white p-6 shadow-card md:p-8">
        <header className="flex items-start justify-between gap-4 border-b-2 border-forest pb-4">
          <div>
            <p className="text-sm font-semibold text-leaf">{tr("Year-by-year")}</p>
            <h2 className="mt-1 text-2xl font-black text-forest">{mode === "fd" ? tr("Fixed deposit") : tr("Recurring deposit")}</h2>
            <p className="text-xs font-medium text-muted">{rate}% · {duration(calc.months, tr)}{maturesOn ? ` · ${fill(tr("Matures {month}."), { month: maturesOn })}` : ""}</p>
          </div>
          <div className="rounded-[10px] bg-fog p-3 text-right">
            <p className="text-xs font-semibold text-muted">{headline ? headline.label : tr("Maturity value")}</p>
            <p className="text-lg font-black text-forest tabular-nums">{headline ? headline.value : "—"}</p>
          </div>
        </header>

        {ok ? (
          <>
            <section className="mt-4 grid grid-cols-3 gap-3 text-center text-sm">
              <div className="rounded-[10px] bg-fog p-3"><p className="text-xs font-semibold text-muted">{mode === "rd" ? tr("You deposit") : tr("You invest")}</p><p className="font-black text-forest tabular-nums">{rupees(invested)}</p></div>
              <div className="rounded-[10px] bg-fog p-3"><p className="text-xs font-semibold text-muted">{tr("Interest earned")}</p><p className="font-black text-forest tabular-nums">{rupees(interestTotal)}</p></div>
              <div className="rounded-[10px] bg-forest p-3 text-white"><p className="text-xs font-semibold text-white/65">{calc.kind === "fdp" ? tr("Principal back") : tr("Maturity value")}</p><p className="font-black tabular-nums">{calc.kind === "fdp" ? rupees(calc.amountPaise) : rupees(calc.kind === "rd" ? calc.rd.maturity : calc.fd.maturity)}</p></div>
            </section>
            {calc.kind === "fdp" ? (
              <p className="mt-3 rounded-[10px] bg-fog p-3 text-sm font-medium text-forest">{everyText(calc.freq, rupees(calc.pay.amount))}</p>
            ) : null}
            <table className="mt-5 w-full text-left text-sm">
              <thead>
                <tr className="border-b border-pebble text-xs text-muted">
                  <th className="py-2 font-semibold">{tr("Year")}</th>
                  {calc.kind === "rd" ? (
                    <>
                      <th className="py-2 text-right font-semibold">{tr("Deposited so far")}</th>
                      <th className="py-2 text-right font-semibold">{tr("Interest so far")}</th>
                      <th className="py-2 text-right font-semibold">{tr("Balance")}</th>
                    </>
                  ) : calc.kind === "fdc" ? (
                    <>
                      <th className="py-2 text-right font-semibold">{tr("Opening")}</th>
                      <th className="py-2 text-right font-semibold">{tr("Interest")}</th>
                      <th className="py-2 text-right font-semibold">{tr("Closing")}</th>
                    </>
                  ) : (
                    <th className="py-2 text-right font-semibold">{tr("Interest paid out")}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {calc.kind === "rd" ? calc.rows.map((row) => (
                  <tr key={row.year} className="border-b border-hairline">
                    <td className="py-1.5 font-semibold text-forest">{row.year}</td>
                    <td className="py-1.5 text-right tabular-nums">{rupees(row.deposited)}</td>
                    <td className="py-1.5 text-right tabular-nums">{rupees(row.interest)}</td>
                    <td className="py-1.5 text-right font-bold tabular-nums">{rupees(row.balance)}</td>
                  </tr>
                )) : calc.kind === "fdc" ? calc.rows.map((row) => (
                  <tr key={row.year} className="border-b border-hairline">
                    <td className="py-1.5 font-semibold text-forest">{row.year}</td>
                    <td className="py-1.5 text-right tabular-nums">{rupees(row.opening)}</td>
                    <td className="py-1.5 text-right tabular-nums">{rupees(row.interest)}</td>
                    <td className="py-1.5 text-right font-bold tabular-nums">{rupees(row.closing)}</td>
                  </tr>
                )) : calc.pay.yearly.map((row) => (
                  <tr key={row.year} className="border-b border-hairline">
                    <td className="py-1.5 font-semibold text-forest">{row.year}</td>
                    <td className="py-1.5 text-right font-bold tabular-nums">{rupees(row.interest)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {calc.taxBps > 0 ? (
              <p className="mt-3 text-xs font-medium text-muted">{fill(tr("After tax at {rate}% the interest is {net}, so you keep {total} in all."), { rate: tax.trim(), net: rupees(calc.net.net), total: rupees(invested + calc.net.net) })}</p>
            ) : null}
          </>
        ) : (
          <p className="mt-6 text-sm font-semibold text-muted">{tr("Fix the highlighted fields to see your result.")}</p>
        )}
        <footer className="mt-4 text-center text-xs font-medium text-muted">{tr("Indicative only. Banks differ in how they compound and round, so their figure can differ by a few rupees; check with yours.")} · Pro UPI QR</footer>
      </article>
    </div>
  );
}
