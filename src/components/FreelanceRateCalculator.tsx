import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { DocLang } from "../data/documentLang";
import { FREELANCE_PHRASES } from "../data/freelancePhrases";
import { CURRENCIES, formatMinor, type CurrencyCode } from "../lib/educationCost";
import { downloadDataUrl, notifyExportError } from "../lib/export-image";
import { renderPaperPng, savePaperPdf } from "../lib/exportPaper";
import { MAX_MINOR, hourlyAtBillable, parseHoursTenths, parsePercentBps, rateFor, type RateInput, type RateResult } from "../lib/freelanceRate";
import { fill } from "../lib/loanFormat";
import { parseOptionalPaise, parsePaise } from "../lib/loanMath";
import { localTranslator } from "../lib/localPhrases";
import { trackProductEvent } from "../lib/productEvents";

const TOOL = "freelance-rate-calculator";
const draftKey = "proupiqr-freelance-rate-draft";

const fieldClass = "mt-2 w-full rounded-[10px] border border-pebble bg-white px-3.5 py-2.5 font-medium text-forest outline-none focus:border-leaf";
const labelClass = "text-sm font-semibold text-forest";
const hintClass = "mt-1.5 text-xs font-medium text-muted";

const isCurrency = (v: unknown): v is CurrencyCode => CURRENCIES.some((c) => c.code === v);

type Fields = {
  currency: CurrencyCode; takeHome: string; ownCosts: string; businessCosts: string; tax: string; margin: string;
  days: string; vacation: string; holidays: string; sick: string; hours: string; billable: string;
};

const DEFAULTS: Fields = {
  currency: "INR", takeHome: "1200000", ownCosts: "100000", businessCosts: "100000", tax: "20", margin: "10",
  days: "5", vacation: "4", holidays: "10", sick: "5", hours: "8", billable: "65",
};

export function FreelanceRateCalculator({ lang = "en" }: { lang?: DocLang } = {}) {
  const tr = useMemo(() => localTranslator(lang, FREELANCE_PHRASES), [lang]);
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
      if (key === "currency") { if (isCurrency(v)) next.currency = v; } else if (typeof v === "string") (next[key] as string) = v;
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

  const money = (minor: number) => formatMinor(minor, f.currency);
  const symbol = CURRENCIES.find((c) => c.code === f.currency)?.symbol ?? "";
  const locale = CURRENCIES.find((c) => c.code === f.currency)?.locale ?? "en-IN";
  const money2 = (minor: number) => `${symbol}${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(minor / 100)}`;

  const calc = useMemo(() => {
    const errors: Record<string, string> = {};
    const takeHome = parsePaise(f.takeHome);
    const ownCosts = parseOptionalPaise(f.ownCosts);
    const businessCosts = parseOptionalPaise(f.businessCosts);
    const taxBps = parsePercentBps(f.tax, 0, 6000);
    const marginBps = parsePercentBps(f.margin, 0, 10000);
    const billableBps = parsePercentBps(f.billable, 100, 10000);
    const hoursTenths = parseHoursTenths(f.hours);
    const whole = (text: string, lo: number, hi: number) => (/^\d{1,2}$/.test(text.trim()) && Number(text.trim()) >= lo && Number(text.trim()) <= hi ? Number(text.trim()) : null);
    const days = whole(f.days, 1, 7);
    const vacation = whole(f.vacation, 0, 30);
    const holidays = whole(f.holidays, 0, 60);
    const sick = whole(f.sick, 0, 60);
    if (takeHome === null || takeHome === 0 || takeHome > MAX_MINOR) errors.takeHome = tr("Enter an amount greater than zero.");
    if (ownCosts === null || ownCosts > MAX_MINOR) errors.ownCosts = tr("Enter an amount, or leave it empty.");
    if (businessCosts === null || businessCosts > MAX_MINOR) errors.businessCosts = tr("Enter an amount, or leave it empty.");
    if (taxBps === null) errors.tax = tr("Enter a percentage from 0 to 60.");
    if (marginBps === null) errors.margin = tr("Enter a percentage from 0 to 100.");
    if (billableBps === null) errors.billable = tr("Enter a percentage from 1 to 100.");
    if (hoursTenths === null) errors.hours = tr("Enter 0.1 to 16 hours, for example 7.5.");
    if (days === null) errors.days = tr("Enter 1 to 7 days a week.");
    if (vacation === null) errors.vacation = tr("Enter 0 to 30 weeks.");
    if (holidays === null) errors.holidays = tr("Enter 0 to 60 days.");
    if (sick === null) errors.sick = tr("Enter 0 to 60 days.");
    if (Object.keys(errors).length > 0 || takeHome === null || ownCosts === null || businessCosts === null || taxBps === null || marginBps === null || billableBps === null || hoursTenths === null || days === null || vacation === null || holidays === null || sick === null) {
      return { errors, input: null as RateInput | null, result: null as RateResult | null };
    }
    const input: RateInput = { takeHome, ownCosts, businessCosts, taxBps, marginBps, daysPerWeek: days, vacationWeeks: vacation, holidays, sickDays: sick, hoursTenths, billableBps };
    const result = rateFor(input);
    if (result === null) errors.time = tr("Your time leaves no working days. Reduce the holiday or sick days.");
    return { errors, input, result };
  }, [f, tr]);

  const { input, result } = calc;
  const hasErrors = Object.keys(calc.errors).length > 0;
  const fileName = "freelance-rate";

  const sensitivity = useMemo(() => {
    if (!input || !result) return [];
    const shares = [5000, 6000, 7000, 8000, 9000];
    if (!shares.includes(input.billableBps)) shares.push(input.billableBps);
    shares.sort((a, b) => a - b);
    return shares.map((bps) => ({ bps, hourly: hourlyAtBillable(input, bps) ?? 0, mine: bps === input.billableBps }));
  }, [input, result]);

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

  const presets: [Partial<Fields>, string][] = [
    [{ currency: "INR", takeHome: "1200000", ownCosts: "100000", businessCosts: "100000", tax: "20" }, tr("₹12 lakh take-home · India")],
    [{ currency: "GBP", takeHome: "50000", ownCosts: "5000", businessCosts: "4000", tax: "25" }, tr("£50,000 take-home · UK")],
    [{ currency: "USD", takeHome: "80000", ownCosts: "12000", businessCosts: "6000", tax: "28" }, tr("$80,000 take-home · US")],
  ];

  const err = (key: string, message?: string) =>
    message ? <p id={id(`${key}-err`)} role="alert" className="mt-1.5 text-xs font-semibold text-coral">{message}</p> : null;
  const field = (key: keyof Fields, label: string, opts: { hint?: string; decimal?: boolean } = {}) => (
    <div>
      <label htmlFor={id(key)} className={labelClass}>{label}</label>
      <input id={id(key)} inputMode={opts.decimal ? "decimal" : "numeric"} autoComplete="off" value={f[key]} onChange={(e) => set(key)(e.target.value)} aria-invalid={Boolean(calc.errors[key])} aria-describedby={id(`${key}-err`)} className={fieldClass} />
      {opts.hint ? <p className={hintClass}>{opts.hint}</p> : null}
      {err(key, calc.errors[key])}
    </div>
  );

  const breakdown: [string, number][] = result
    ? [[tr("Take-home you want"), input!.takeHome], [tr("Personal costs you fund"), input!.ownCosts], [tr("Tax on your profit"), result.taxAmount], [tr("Business costs"), result.businessCosts], [tr("Safety margin"), result.margin]]
    : [];
  const hoursText = result ? new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(result.billableHours100 / 100)) : "";
  const daysText = result ? new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(result.billableDays100 / 100)) : "";

  return (
    <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
      <div className="no-print rounded-[14px] border border-hairline bg-white p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-leaf">{tr("Freelance rate calculator")}</p>
            <h2 className="mt-1 text-2xl font-black text-forest">{tr("Work out the rate you need to charge")}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={downloadPdf} disabled={pdfState === "busy" || !result} className="rounded-[10px] bg-forest px-4 py-2 text-xs font-bold text-white hover:bg-graphite disabled:opacity-50">{pdfState === "busy" ? tr("Generating...") : tr("Plan PDF")}</button>
            <button type="button" onClick={downloadPng} disabled={pngState === "busy" || !result} className="rounded-[10px] bg-white px-4 py-2 text-xs font-bold text-forest ring-1 ring-pebble hover:bg-fog disabled:opacity-50">{pngState === "busy" ? tr("Generating...") : "PNG"}</button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {presets.map(([patch, label]) => (
            <button key={label} type="button" onClick={() => setF((prev) => ({ ...prev, ...patch }))} className="rounded-[7px] border border-pebble bg-white px-3 py-1.5 text-xs font-bold text-forest hover:border-leaf">{label}</button>
          ))}
        </div>

        <fieldset className="mt-5 rounded-[12px] border border-hairline p-4">
          <legend className="px-1 text-sm font-semibold text-leaf">{tr("What you want to earn")}</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={id("currency")} className={labelClass}>{tr("Currency")}</label>
              <select id={id("currency")} value={f.currency} onChange={(e) => set("currency")(e.target.value)} className={fieldClass}>
                {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} {c.symbol}</option>)}
              </select>
            </div>
            {field("takeHome", tr("Take-home you want per year"), { hint: tr("What you want to spend after tax.") })}
            {field("ownCosts", tr("Personal costs you fund per year"), { hint: tr("Health cover, pension or anything personal you pay out of what you earn.") })}
            {field("tax", tr("Tax on your profit (%)"), { decimal: true, hint: tr("Your own estimate of the share of profit that goes in tax and social charges.") })}
          </div>
        </fieldset>

        <fieldset className="mt-4 rounded-[12px] border border-hairline p-4">
          <legend className="px-1 text-sm font-semibold text-leaf">{tr("Your costs")}</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {field("businessCosts", tr("Business costs per year"), { hint: tr("Software, equipment, insurance, co-working, an accountant.") })}
            {field("margin", tr("Safety margin (%)"), { decimal: true, hint: tr("Extra on top for slow months and late payers.") })}
          </div>
        </fieldset>

        <fieldset className="mt-4 rounded-[12px] border border-hairline p-4">
          <legend className="px-1 text-sm font-semibold text-leaf">{tr("Your time")}</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {field("days", tr("Days you work per week"))}
            {field("hours", tr("Hours in a working day"), { decimal: true })}
            {field("vacation", tr("Weeks of holiday per year"))}
            {field("holidays", tr("Public holidays on working days"))}
            {field("sick", tr("Sick days per year"))}
            {field("billable", tr("Share of your time you can bill (%)"), { decimal: true, hint: tr("Admin, sales and unpaid time take part of every week.") })}
          </div>
          {err("time", calc.errors.time)}
        </fieldset>

        <div aria-live="polite" className="mt-6">
          {result ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[12px] bg-forest p-4 text-white"><p className="text-xs font-semibold text-white/65">{tr("Your hourly rate")}</p><p className="mt-1 text-3xl font-black tabular-nums">{money2(result.hourly)}</p></div>
                <div className="rounded-[12px] bg-fog p-4"><p className="text-xs font-semibold text-muted">{tr("Your day rate")}</p><p className="mt-1 text-2xl font-black text-forest tabular-nums">{money(result.day)}</p></div>
                <div className="rounded-[12px] bg-fog p-4"><p className="text-xs font-semibold text-muted">{tr("Revenue needed each month")}</p><p className="mt-1 text-xl font-black text-forest tabular-nums">{money(result.monthly)}</p></div>
                <div className="rounded-[12px] bg-fog p-4"><p className="text-xs font-semibold text-muted">{tr("Revenue needed per year")}</p><p className="mt-1 text-xl font-black text-forest tabular-nums">{money(result.revenue)}</p></div>
              </div>
              <p className="mt-4 text-sm font-medium text-charcoal">{fill(tr("You work {working} days a year and can bill about {hours} hours, or {days} days, of them."), { working: String(result.workingDays), hours: hoursText, days: daysText })}</p>
            </>
          ) : hasErrors ? (
            <p className="rounded-[12px] bg-fog p-4 text-sm font-semibold text-muted">{tr("Fix the highlighted fields to see your rate.")}</p>
          ) : null}
        </div>
      </div>

      <article ref={paperRef} className="invoice-paper mx-auto h-fit w-full max-w-[780px] rounded-[14px] border border-hairline bg-white p-6 shadow-card md:p-8">
        <header className="flex items-start justify-between gap-4 border-b-2 border-forest pb-4">
          <div>
            <p className="text-sm font-semibold text-leaf">{tr("Freelance rate")}</p>
            <h2 className="mt-1 text-2xl font-black text-forest">{result ? `${money2(result.hourly)} ${tr("an hour")}` : tr("Freelance rate")}</h2>
            <p className="text-xs font-medium text-muted">{result ? fill(tr("{working} working days · {hours} billable hours a year"), { working: String(result.workingDays), hours: hoursText }) : ""}</p>
          </div>
          <div className="rounded-[10px] bg-fog p-3 text-right">
            <p className="text-xs font-semibold text-muted">{tr("Your day rate")}</p>
            <p className="text-lg font-black text-forest tabular-nums">{result ? money(result.day) : "—"}</p>
          </div>
        </header>

        {result && input ? (
          <>
            <p className="mt-5 text-sm font-semibold text-leaf">{tr("Where the money goes")}</p>
            <table className="mt-2 w-full text-left text-sm">
              <tbody>
                {breakdown.map(([label, value]) => (
                  <tr key={label} className="border-b border-hairline">
                    <td className="py-1.5 font-semibold text-forest">{label}</td>
                    <td className="py-1.5 text-right tabular-nums">{money(value)}</td>
                  </tr>
                ))}
                <tr>
                  <td className="py-2 font-black text-forest">{tr("Revenue you need")}</td>
                  <td className="py-2 text-right font-black text-forest tabular-nums">{money(result.revenue)}</td>
                </tr>
              </tbody>
            </table>

            <p className="mt-5 text-sm font-semibold text-leaf">{tr("If you can bill more or less of your time")}</p>
            <table className="mt-2 w-full text-left text-sm">
              <thead>
                <tr className="border-b border-pebble text-xs text-muted">
                  <th className="py-2 font-semibold">{tr("Share billed")}</th>
                  <th className="py-2 text-right font-semibold">{tr("Hourly rate")}</th>
                </tr>
              </thead>
              <tbody>
                {sensitivity.map((row) => (
                  <tr key={row.bps} className={`border-b border-hairline ${row.mine ? "bg-fog" : ""}`}>
                    <td className="py-1.5 font-semibold text-forest">{(row.bps / 100).toFixed(row.bps % 100 === 0 ? 0 : 2)}%{row.mine ? ` (${tr("yours")})` : ""}</td>
                    <td className="py-1.5 text-right font-bold tabular-nums">{money2(row.hourly)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <p className="mt-6 text-sm font-semibold text-muted">{tr("Fix the highlighted fields to see your rate.")}</p>
        )}
        <footer className="mt-4 text-center text-xs font-medium text-muted">{tr("Indicative only. Tax, billable share and margin are your assumptions, not forecasts; rates are rounded up so a quote is never short.")} · Pro UPI QR</footer>
      </article>
    </div>
  );
}
