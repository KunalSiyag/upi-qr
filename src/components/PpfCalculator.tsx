import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { DocLang } from "../data/documentLang";
import { PPF_PHRASES } from "../data/ppfPhrases";
import { downloadDataUrl, notifyExportError } from "../lib/export-image";
import { renderPaperPng, savePaperPdf } from "../lib/exportPaper";
import { parsePercentBps } from "../lib/freelanceRate";
import { compact, fill, rupees } from "../lib/loanFormat";
import { parsePaise } from "../lib/loanMath";
import { localTranslator } from "../lib/localPhrases";
import { PPF_CURRENT_RATE_BPS, PPF_REVIEWED_ON, PPF_TENURES, ppf, ppfDepositProblem, type PpfPattern, type PpfResult } from "../lib/ppf";
import { trackProductEvent } from "../lib/productEvents";

const TOOL = "ppf-calculator";
const draftKey = "proupiqr-ppf-draft";

const fieldClass = "mt-2 w-full rounded-[10px] border border-pebble bg-white px-3.5 py-2.5 font-medium text-forest outline-none focus:border-leaf";
const labelClass = "text-sm font-semibold text-forest";
const hintClass = "mt-1.5 text-xs font-medium text-muted";
const PATTERNS: PpfPattern[] = ["monthlyEarly", "monthlyLate", "yearlyEarly"];

export function PpfCalculator({ lang = "en" }: { lang?: DocLang } = {}) {
  const tr = useMemo(() => localTranslator(lang, PPF_PHRASES), [lang]);
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;
  const [pattern, setPattern] = useState<PpfPattern>("monthlyEarly");
  const [deposit, setDeposit] = useState("12500");
  const [rate, setRate] = useState(String(PPF_CURRENT_RATE_BPS / 100));
  const [years, setYears] = useState("15");
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
    if (PATTERNS.includes(draft.pattern as PpfPattern)) setPattern(draft.pattern as PpfPattern);
    if (typeof draft.deposit === "string") setDeposit(draft.deposit);
    if (typeof draft.rate === "string") setRate(draft.rate);
    if (typeof draft.years === "string" && PPF_TENURES.includes(Number(draft.years) as never)) setYears(draft.years);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify({ pattern, deposit, rate, years }));
    } catch {
      // Private mode or full storage: the tool still works.
    }
  }, [loaded, pattern, deposit, rate, years]);

  const calc = useMemo(() => {
    const errors: Record<string, string> = {};
    const amount = parsePaise(deposit);
    const rateBps = parsePercentBps(rate, 0, 1500);
    if (amount === null) errors.deposit = tr("Enter a deposit amount.");
    else {
      const problem = ppfDepositProblem(amount, pattern);
      if (problem === "step") errors.deposit = tr("Deposit in multiples of ₹50.");
      else if (problem === "min") errors.deposit = tr("The yearly total must be at least ₹500.");
      else if (problem === "max") errors.deposit = tr("The yearly total can be at most ₹1,50,000.");
    }
    if (rateBps === null) errors.rate = tr("Enter a rate from 0 to 15, for example 7.1.");
    if (Object.keys(errors).length > 0 || amount === null || rateBps === null) return { errors, result: null as PpfResult | null };
    return { errors, result: ppf({ deposit: amount, pattern, rateBps, years: Number(years) }) };
  }, [deposit, rate, years, pattern, tr]);

  const { result } = calc;
  const fileName = "ppf-schedule";
  const depositHint = parsePaise(deposit) !== null ? compact(parsePaise(deposit) ?? 0, tr) : null;

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
  const patternLabels: Record<PpfPattern, string> = {
    monthlyEarly: tr("Every month, by the 5th"),
    monthlyLate: tr("Every month, after the 5th"),
    yearlyEarly: tr("Once a year, by 5 April"),
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
      <div className="no-print rounded-[14px] border border-hairline bg-white p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-leaf">{tr("PPF calculator")}</p>
            <h2 className="mt-1 text-2xl font-black text-forest">{tr("Plan your PPF savings")}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={downloadPdf} disabled={pdfState === "busy" || !result} className="rounded-[10px] bg-forest px-4 py-2 text-xs font-bold text-white hover:bg-graphite disabled:opacity-50">{pdfState === "busy" ? tr("Generating...") : tr("Plan PDF")}</button>
            <button type="button" onClick={downloadPng} disabled={pngState === "busy" || !result} className="rounded-[10px] bg-white px-4 py-2 text-xs font-bold text-forest ring-1 ring-pebble hover:bg-fog disabled:opacity-50">{pngState === "busy" ? tr("Generating...") : "PNG"}</button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor={id("pattern")} className={labelClass}>{tr("How you deposit")}</label>
            <select id={id("pattern")} value={pattern} onChange={(e) => setPattern(e.target.value as PpfPattern)} className={fieldClass}>
              {PATTERNS.map((p) => <option key={p} value={p}>{patternLabels[p]}</option>)}
            </select>
            <p className={hintClass}>{tr("A deposit made by the 5th earns interest for that month. Interest is worked out monthly on the lowest balance between the 5th and the month end, and added once, at the end of the financial year.")}</p>
          </div>
          <div>
            <label htmlFor={id("deposit")} className={labelClass}>{pattern === "yearlyEarly" ? tr("Deposit each year (₹)") : tr("Deposit each month (₹)")}</label>
            <input id={id("deposit")} inputMode="numeric" autoComplete="off" value={deposit} onChange={(e) => setDeposit(e.target.value)} aria-invalid={Boolean(calc.errors.deposit)} aria-describedby={id("deposit-err")} className={fieldClass} />
            {depositHint && !calc.errors.deposit ? <p className={hintClass}>{depositHint}</p> : null}
            <p className={hintClass}>{tr("₹500 to ₹1,50,000 a year, in multiples of ₹50.")}</p>
            {err("deposit")}
          </div>
          <div>
            <label htmlFor={id("rate")} className={labelClass}>{tr("Interest rate (% per year)")}</label>
            <input id={id("rate")} inputMode="decimal" autoComplete="off" value={rate} onChange={(e) => setRate(e.target.value)} aria-invalid={Boolean(calc.errors.rate)} aria-describedby={id("rate-err")} className={fieldClass} />
            <p className={hintClass}>{fill(tr("{rate}% for Oct-Dec 2026. The rate is reset every quarter, so later years will differ."), { rate: String(PPF_CURRENT_RATE_BPS / 100) })}</p>
            {err("rate")}
          </div>
          <div className="sm:col-span-2">
            <label htmlFor={id("years")} className={labelClass}>{tr("Account length")}</label>
            <select id={id("years")} value={years} onChange={(e) => setYears(e.target.value)} className={fieldClass}>
              {PPF_TENURES.map((y) => <option key={y} value={String(y)}>{y} {tr("years")}{y > 15 ? ` · ${fill(tr("extended by {years} years"), { years: String(y - 15) })}` : ""}</option>)}
            </select>
          </div>
        </div>

        <div aria-live="polite" className="mt-6">
          {result ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-[12px] bg-forest p-4 text-white"><p className="text-xs font-semibold text-white/65">{tr("Maturity value")}</p><p className="mt-1 text-2xl font-black tabular-nums">{rupees(result.maturity)}</p></div>
                <div className="rounded-[12px] bg-fog p-4"><p className="text-xs font-semibold text-muted">{tr("You deposit")}</p><p className="mt-1 text-xl font-black text-forest tabular-nums">{rupees(result.deposited)}</p></div>
                <div className="rounded-[12px] bg-fog p-4"><p className="text-xs font-semibold text-muted">{tr("Interest earned")}</p><p className="mt-1 text-xl font-black text-forest tabular-nums">{rupees(result.interest)}</p></div>
              </div>
              <p className="mt-4 text-sm font-medium text-charcoal">{tr("PPF interest and the maturity amount are exempt from tax under current rules.")}</p>
            </>
          ) : (
            <p className="rounded-[12px] bg-fog p-4 text-sm font-semibold text-muted">{tr("Fix the highlighted fields to see your PPF.")}</p>
          )}
          <p className={hintClass}>{tr("Assumes the account is opened in April. Banks count 15 years from the end of the year you open in, so a mid-year opening matures later; ask your bank or post office.")}</p>
        </div>
      </div>

      <article ref={paperRef} className="invoice-paper mx-auto h-fit w-full max-w-[780px] rounded-[14px] border border-hairline bg-white p-6 shadow-card md:p-8">
        <header className="flex items-start justify-between gap-4 border-b-2 border-forest pb-4">
          <div>
            <p className="text-sm font-semibold text-leaf">{tr("Year-by-year")}</p>
            <h2 className="mt-1 text-2xl font-black text-forest">{tr("PPF account")}</h2>
            <p className="text-xs font-medium text-muted">{rate}% · {years} {tr("years")} · {patternLabels[pattern]}</p>
          </div>
          <div className="rounded-[10px] bg-fog p-3 text-right">
            <p className="text-xs font-semibold text-muted">{tr("Maturity value")}</p>
            <p className="text-lg font-black text-forest tabular-nums">{result ? rupees(result.maturity) : "—"}</p>
          </div>
        </header>
        {result ? (
          <>
            <section className="mt-4 grid grid-cols-3 gap-3 text-center text-sm">
              <div className="rounded-[10px] bg-fog p-3"><p className="text-xs font-semibold text-muted">{tr("You deposit")}</p><p className="font-black text-forest tabular-nums">{rupees(result.deposited)}</p></div>
              <div className="rounded-[10px] bg-fog p-3"><p className="text-xs font-semibold text-muted">{tr("Interest earned")}</p><p className="font-black text-forest tabular-nums">{rupees(result.interest)}</p></div>
              <div className="rounded-[10px] bg-forest p-3 text-white"><p className="text-xs font-semibold text-white/65">{tr("Maturity value")}</p><p className="font-black tabular-nums">{rupees(result.maturity)}</p></div>
            </section>
            <table className="mt-4 w-full text-left text-sm">
              <thead>
                <tr className="border-b border-pebble text-xs text-muted">
                  <th className="py-2 font-semibold">{tr("Year")}</th>
                  <th className="py-2 text-right font-semibold">{tr("Deposited")}</th>
                  <th className="py-2 text-right font-semibold">{tr("Interest")}</th>
                  <th className="py-2 text-right font-semibold">{tr("Balance")}</th>
                </tr>
              </thead>
              <tbody>
                {result.yearly.map((row) => (
                  <tr key={row.year} className="border-b border-hairline">
                    <td className="py-1.5 font-semibold text-forest">{row.year}</td>
                    <td className="py-1.5 text-right tabular-nums">{rupees(row.deposited)}</td>
                    <td className="py-1.5 text-right tabular-nums">{rupees(row.interest)}</td>
                    <td className="py-1.5 text-right font-bold tabular-nums">{rupees(row.closing)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <p className="mt-6 text-sm font-semibold text-muted">{tr("Fix the highlighted fields to see your PPF.")}</p>
        )}
        <p className="mt-4 text-xs font-medium text-muted">{fill(tr("Rate checked on {date}."), { date: PPF_REVIEWED_ON })}</p>
        <footer className="mt-2 text-center text-xs font-medium text-muted">{tr("Indicative only. Post offices and banks round interest to the rupee, so their figure can differ by a rupee or so a year.")} · Pro UPI QR</footer>
      </article>
    </div>
  );
}
