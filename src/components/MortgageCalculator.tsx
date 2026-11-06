import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { DocLang } from "../data/documentLang";
import { MORTGAGE_PHRASES } from "../data/mortgagePhrases";
import { CURRENCIES, formatMinor, type CurrencyCode } from "../lib/educationCost";
import { downloadDataUrl, notifyExportError } from "../lib/export-image";
import { renderPaperPng, savePaperPdf } from "../lib/exportPaper";
import { parsePercentBps } from "../lib/freelanceRate";
import { duration, fill } from "../lib/loanFormat";
import { monthLabel, parseOptionalPaise, parsePaise } from "../lib/loanMath";
import { localTranslator } from "../lib/localPhrases";
import { MAX_PRICE, MAX_YEARS, affordableHome, mortgage, type AffordResult, type MortgageResult } from "../lib/mortgage";
import { trackProductEvent } from "../lib/productEvents";

const TOOL = "mortgage-calculator";
const draftKey = "proupiqr-mortgage-draft";

const fieldClass = "mt-2 w-full rounded-[10px] border border-pebble bg-white px-3.5 py-2.5 font-medium text-forest outline-none focus:border-leaf";
const labelClass = "text-sm font-semibold text-forest";
const hintClass = "mt-1.5 text-xs font-medium text-muted";
const segClass = (on: boolean) => `rounded-[8px] px-3 py-1.5 text-xs font-bold transition ${on ? "bg-white text-forest shadow-card" : "text-muted hover:text-forest"}`;

type Mode = "payment" | "afford";
type Fields = {
  currency: CurrencyCode; price: string; down: string; rate: string; years: string; start: string;
  tax: string; insurance: string; hoa: string; mi: string; miStop: string; extra: string; lump: string; lumpMonth: string;
  income: string; debts: string; front: string; back: string; downPct: string; taxPct: string; insPct: string;
};
const DEFAULTS: Fields = {
  currency: "USD", price: "400000", down: "80000", rate: "6.5", years: "30", start: "",
  tax: "4400", insurance: "1200", hoa: "0", mi: "0", miStop: "80", extra: "", lump: "", lumpMonth: "12",
  income: "120000", debts: "500", front: "28", back: "36", downPct: "20", taxPct: "1.1", insPct: "0.3",
};
const isCurrency = (v: unknown): v is CurrencyCode => CURRENCIES.some((c) => c.code === v);

export function MortgageCalculator({ lang = "en" }: { lang?: DocLang } = {}) {
  const tr = useMemo(() => localTranslator(lang, MORTGAGE_PHRASES), [lang]);
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;
  const [mode, setMode] = useState<Mode>("payment");
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
    if (!next.start) next.start = new Date().toISOString().slice(0, 7);
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

  const cur = CURRENCIES.find((c) => c.code === f.currency) ?? CURRENCIES[0];
  const money = (minor: number) => formatMinor(minor, f.currency);
  const money2 = (minor: number) => `${cur.symbol}${new Intl.NumberFormat(cur.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(minor / 100)}`;

  const pay = useMemo(() => {
    const errors: Record<string, string> = {};
    const price = parsePaise(f.price);
    const down = parseOptionalPaise(f.down);
    const rateBps = parsePercentBps(f.rate, 0, 5000);
    const years = /^\d{1,2}$/.test(f.years.trim()) && Number(f.years) >= 1 && Number(f.years) <= MAX_YEARS ? Number(f.years) : null;
    const tax = parseOptionalPaise(f.tax);
    const insurance = parseOptionalPaise(f.insurance);
    const hoa = parseOptionalPaise(f.hoa);
    const miBps = parsePercentBps(f.mi || "0", 0, 500);
    const miStop = parsePercentBps(f.miStop, 0, 10000);
    const extra = parseOptionalPaise(f.extra);
    const lump = parseOptionalPaise(f.lump);
    const lumpMonth = f.lumpMonth.trim() === "" ? 0 : /^\d{1,4}$/.test(f.lumpMonth.trim()) ? Number(f.lumpMonth.trim()) : null;
    if (price === null || price === 0 || price > MAX_PRICE) errors.price = tr("Enter a home price greater than zero.");
    if (down === null) errors.down = tr("Enter an amount, or leave it empty.");
    else if (price !== null && down > price) errors.down = tr("The down payment cannot be more than the price.");
    if (rateBps === null) errors.rate = tr("Enter a rate from 0 to 50 with at most 2 decimals, for example 6.5.");
    if (years === null) errors.years = tr("Enter a term from 1 to 40 years.");
    if (tax === null) errors.tax = tr("Enter an amount, or leave it empty.");
    if (insurance === null) errors.insurance = tr("Enter an amount, or leave it empty.");
    if (hoa === null) errors.hoa = tr("Enter an amount, or leave it empty.");
    if (miBps === null) errors.mi = tr("Enter a rate from 0 to 5.");
    if (miStop === null) errors.miStop = tr("Enter a percentage from 0 to 100.");
    if (extra === null) errors.extra = tr("Enter an amount, or leave it empty.");
    if (lump === null) errors.lump = tr("Enter an amount, or leave it empty.");
    if (lumpMonth === null) errors.lumpMonth = tr("Enter a payment number within the term.");
    if (Object.keys(errors).length > 0 || price === null || down === null || rateBps === null || years === null || tax === null || insurance === null || hoa === null || miBps === null || miStop === null || extra === null || lump === null || lumpMonth === null) {
      return { errors, base: null as MortgageResult | null, plan: null as MortgageResult | null, prepaying: false, price: 0 };
    }
    const common = { price, down, rateBps, years, taxYear: tax, insuranceYear: insurance, hoaMonth: hoa, miBps, miStopBps: miStop };
    const base = mortgage({ ...common, extraMonthly: 0, lumpSum: 0, lumpMonth: 0 });
    const prepaying = extra > 0 || lump > 0;
    const plan = prepaying ? mortgage({ ...common, extraMonthly: extra, lumpSum: lump, lumpMonth }) : base;
    return { errors, base, plan, prepaying, price };
  }, [f, tr]);

  const afford = useMemo(() => {
    const errors: Record<string, string> = {};
    const income = parsePaise(f.income);
    const debts = parseOptionalPaise(f.debts);
    const front = parsePercentBps(f.front, 0, 10000);
    const back = parsePercentBps(f.back, 0, 10000);
    const downPct = parsePercentBps(f.downPct, 0, 10000);
    const rateBps = parsePercentBps(f.rate, 0, 5000);
    const years = /^\d{1,2}$/.test(f.years.trim()) && Number(f.years) >= 1 && Number(f.years) <= MAX_YEARS ? Number(f.years) : null;
    const taxPct = parsePercentBps(f.taxPct, 0, 1000);
    const insPct = parsePercentBps(f.insPct, 0, 1000);
    const hoa = parseOptionalPaise(f.hoa);
    const miBps = parsePercentBps(f.mi || "0", 0, 500);
    const miStop = parsePercentBps(f.miStop, 0, 10000);
    if (income === null || income === 0) errors.income = tr("Enter your yearly income before tax.");
    if (debts === null) errors.debts = tr("Enter an amount, or leave it empty.");
    if (front === null) errors.front = tr("Enter a percentage from 0 to 100.");
    if (back === null) errors.back = tr("Enter a percentage from 0 to 100.");
    if (downPct === null) errors.downPct = tr("Enter a percentage from 0 to 100.");
    if (rateBps === null) errors.rate = tr("Enter a rate from 0 to 50 with at most 2 decimals, for example 6.5.");
    if (years === null) errors.years = tr("Enter a term from 1 to 40 years.");
    if (taxPct === null) errors.taxPct = tr("Enter a percentage from 0 to 10.");
    if (insPct === null) errors.insPct = tr("Enter a percentage from 0 to 10.");
    if (hoa === null) errors.hoa = tr("Enter an amount, or leave it empty.");
    if (miBps === null) errors.mi = tr("Enter a rate from 0 to 5.");
    if (miStop === null) errors.miStop = tr("Enter a percentage from 0 to 100.");
    if (Object.keys(errors).length > 0 || income === null || debts === null || front === null || back === null || downPct === null || rateBps === null || years === null || taxPct === null || insPct === null || hoa === null || miBps === null || miStop === null) {
      return { errors, result: null as AffordResult | null };
    }
    return { errors, result: affordableHome({ incomeYear: income, debtsMonth: debts, frontBps: front, backBps: back, downBps: downPct, rateBps, years, taxBps: taxPct, insuranceBps: insPct, hoaMonth: hoa, miBps, miStopBps: miStop }) };
  }, [f, tr]);

  const { base, plan, prepaying } = pay;
  const startIso = f.start ? `${f.start}-01` : "";
  const lastMonth = plan && f.start ? monthLabel(startIso, plan.months - 1) : null;
  const baseLast = base && f.start ? monthLabel(startIso, base.months - 1) : null;
  const interestSaved = base && plan && prepaying ? base.totalInterest - plan.totalInterest : 0;
  const monthsSaved = base && plan && prepaying ? base.months - plan.months : 0;
  const downPercent = pay.price > 0 ? ((parseOptionalPaise(f.down) ?? 0) / pay.price) * 100 : 0;
  const fileName = "mortgage-schedule";

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
    [{ currency: "USD", price: "400000", down: "80000", rate: "6.5", years: "30", tax: "4400", insurance: "1200" }, tr("US home · $400,000")],
    [{ currency: "GBP", price: "300000", down: "60000", rate: "5", years: "25", tax: "0", insurance: "300" }, tr("UK home · £300,000")],
    [{ currency: "CAD", price: "700000", down: "140000", rate: "5", years: "25", tax: "4200", insurance: "1000" }, tr("Canada home · C$700,000")],
    [{ currency: "INR", price: "8000000", down: "2000000", rate: "8.5", years: "20", tax: "0", insurance: "0" }, tr("India home · ₹80 lakh")],
  ];
  const setDownPct = (pct: number) => {
    const price = parsePaise(f.price);
    if (price === null) return;
    set("down")(String(Math.round(((price / 100) * pct) / 100)));
  };

  const err = (key: string, message?: string) =>
    message ? <p id={id(`${key}-err`)} role="alert" className="mt-1.5 text-xs font-semibold text-coral">{message}</p> : null;
  const field = (key: keyof Fields, label: string, errors: Record<string, string>, opts: { hint?: string; decimal?: boolean; placeholder?: string } = {}) => (
    <div>
      <label htmlFor={id(key)} className={labelClass}>{label}</label>
      <input id={id(key)} inputMode={opts.decimal ? "decimal" : "numeric"} autoComplete="off" placeholder={opts.placeholder} value={f[key]} onChange={(e) => set(key)(e.target.value)} aria-invalid={Boolean(errors[key])} aria-describedby={id(`${key}-err`)} className={fieldClass} />
      {opts.hint ? <p className={hintClass}>{opts.hint}</p> : null}
      {err(key, errors[key])}
    </div>
  );
  const currencyField = (
    <div>
      <label htmlFor={id("currency")} className={labelClass}>{tr("Currency")}</label>
      <select id={id("currency")} value={f.currency} onChange={(e) => set("currency")(e.target.value)} className={fieldClass}>
        {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} {c.symbol}</option>)}
      </select>
    </div>
  );

  const parts: [string, number][] = plan
    ? [[tr("Principal and interest"), plan.emi], [tr("Property tax"), plan.taxMonth], [tr("Home insurance"), plan.insuranceMonth], [tr("Mortgage insurance"), plan.miMonth > 0 && plan.miMonths > 0 ? plan.miMonth : 0], [tr("HOA and other fees"), plan.hoaMonth]]
    : [];
  const shades = ["bg-forest", "bg-leaf", "bg-graphite", "bg-pebble", "bg-fog"];
  const totalFirst = plan ? Math.max(1, plan.firstTotal) : 1;
  const okPay = Boolean(plan);

  return (
    <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
      <div className="no-print rounded-[14px] border border-hairline bg-white p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-leaf">{tr("Mortgage calculator")}</p>
            <h2 className="mt-1 text-2xl font-black text-forest">{tr("Plan your mortgage")}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={downloadPdf} disabled={pdfState === "busy" || !okPay} className="rounded-[10px] bg-forest px-4 py-2 text-xs font-bold text-white hover:bg-graphite disabled:opacity-50">{pdfState === "busy" ? tr("Generating...") : tr("Schedule PDF")}</button>
            <button type="button" onClick={downloadPng} disabled={pngState === "busy" || !okPay} className="rounded-[10px] bg-white px-4 py-2 text-xs font-bold text-forest ring-1 ring-pebble hover:bg-fog disabled:opacity-50">{pngState === "busy" ? tr("Generating...") : "PNG"}</button>
          </div>
        </div>

        <div role="group" aria-label={tr("Calculator mode")} className="mt-5 inline-flex rounded-[10px] bg-fog p-1">
          <button type="button" aria-pressed={mode === "payment"} onClick={() => setMode("payment")} className={segClass(mode === "payment")}>{tr("Monthly payment")}</button>
          <button type="button" aria-pressed={mode === "afford"} onClick={() => setMode("afford")} className={segClass(mode === "afford")}>{tr("How much can I afford")}</button>
        </div>

        {mode === "payment" ? (
          <>
            <div className="mt-4 flex flex-wrap gap-2">
              {presets.map(([patch, label]) => (
                <button key={label} type="button" onClick={() => setF((prev) => ({ ...prev, ...patch }))} className="rounded-[7px] border border-pebble bg-white px-3 py-1.5 text-xs font-bold text-forest hover:border-leaf">{label}</button>
              ))}
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {currencyField}
              {field("price", tr("Home price"), pay.errors)}
              <div>
                {field("down", tr("Down payment"), pay.errors)}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {[5, 10, 20].map((p) => (
                    <button key={p} type="button" onClick={() => setDownPct(p)} className="rounded-[7px] border border-pebble bg-white px-2.5 py-1 text-xs font-bold text-forest hover:border-leaf">{p}%</button>
                  ))}
                  {pay.price > 0 && !pay.errors.down ? <span className="text-xs font-medium text-muted">{fill(tr("{percent}% of the price"), { percent: downPercent.toFixed(1).replace(/\.0$/, "") })}</span> : null}
                </div>
              </div>
              {field("rate", tr("Interest rate (% per year)"), pay.errors, { decimal: true })}
              {field("years", tr("Loan term (years)"), pay.errors)}
              <div>
                <label htmlFor={id("start")} className={labelClass}>{tr("First payment month")}</label>
                <input id={id("start")} type="month" value={f.start} onChange={(e) => set("start")(e.target.value)} className={fieldClass} />
              </div>
            </div>

            <fieldset className="mt-5 rounded-[12px] border border-hairline p-4">
              <legend className="px-1 text-sm font-semibold text-leaf">{tr("Yearly costs and fees")}</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                {field("tax", tr("Property tax per year"), pay.errors)}
                {field("insurance", tr("Home insurance per year"), pay.errors)}
                {field("hoa", tr("HOA and other fees per month"), pay.errors)}
              </div>
              <p className={hintClass}>{tr("These stay the same for the whole loan in this calculator.")}</p>
            </fieldset>

            <fieldset className="mt-4 rounded-[12px] border border-hairline p-4">
              <legend className="px-1 text-sm font-semibold text-leaf">{tr("Mortgage insurance")}</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                {field("mi", tr("Mortgage insurance rate (% per year of the loan)"), pay.errors, { decimal: true })}
                {field("miStop", tr("It stops when you owe this share of the price (%)"), pay.errors, { decimal: true })}
              </div>
              <p className={hintClass}>{tr("Lenders often charge it when the down payment is small. Leave the rate at 0 if yours does not.")}</p>
            </fieldset>

            <fieldset className="mt-4 rounded-[12px] border border-hairline p-4">
              <legend className="px-1 text-sm font-semibold text-leaf">{tr("Pay it off sooner")}</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                {field("extra", tr("Extra every month"), pay.errors, { placeholder: "0" })}
                {field("lump", tr("One-time extra payment"), pay.errors, { placeholder: "0" })}
                {field("lumpMonth", tr("After payment number"), pay.errors)}
              </div>
              <p className={hintClass}>{tr("Extra payments go to principal and the regular payment stays the same, so the loan ends sooner.")}</p>
            </fieldset>

            <div aria-live="polite" className="mt-6">
              {plan && base ? (
                <>
                  <div className="rounded-[12px] bg-forest p-4 text-white">
                    <p className="text-xs font-semibold text-white/65">{tr("Your monthly payment")}</p>
                    <p className="mt-1 text-3xl font-black tabular-nums">{money2(plan.firstTotal)}</p>
                  </div>
                  <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-fog" aria-hidden="true">
                    {parts.map(([label, value], i) => value > 0 ? <div key={label} className={shades[i]} style={{ width: `${(value / totalFirst) * 100}%` }} /> : null)}
                  </div>
                  <dl className="mt-3 grid gap-1.5 text-sm">
                    {parts.map(([label, value]) => value > 0 ? (
                      <div key={label} className="flex justify-between gap-3"><dt className="font-medium text-muted">{label}</dt><dd className="font-black text-forest tabular-nums">{money2(value)}</dd></div>
                    ) : null)}
                  </dl>
                  {plan.miMonths > 0 ? <p className={hintClass}>{fill(tr("Mortgage insurance is charged for about {time}, until the balance falls to the share you set."), { time: duration(plan.miMonths, tr) })}</p> : null}
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-[12px] bg-fog p-4"><p className="text-xs font-semibold text-muted">{tr("Loan amount")}</p><p className="mt-1 text-xl font-black text-forest tabular-nums">{money(plan.loan)}</p></div>
                    <div className="rounded-[12px] bg-fog p-4"><p className="text-xs font-semibold text-muted">{tr("Total interest")}</p><p className="mt-1 text-xl font-black text-forest tabular-nums">{money(plan.totalInterest)}</p></div>
                    <div className="rounded-[12px] bg-fog p-4"><p className="text-xs font-semibold text-muted">{tr("Total you pay")}</p><p className="mt-1 text-xl font-black text-forest tabular-nums">{money(plan.totalPaid)}</p></div>
                  </div>
                  {prepaying ? (
                    <p className="mt-4 rounded-[12px] bg-fog p-4 text-sm font-semibold text-forest">
                      {lastMonth && baseLast
                        ? fill(tr("You save {amount} in interest and finish {time} sooner: {new} instead of {old}."), { amount: money(interestSaved), time: duration(monthsSaved, tr), new: lastMonth, old: baseLast })
                        : fill(tr("You save {amount} in interest and finish {time} sooner."), { amount: money(interestSaved), time: duration(monthsSaved, tr) })}
                    </p>
                  ) : lastMonth ? <p className={hintClass}>{fill(tr("Last payment: {month}."), { month: lastMonth })}</p> : null}
                </>
              ) : (
                <p className="rounded-[12px] bg-fog p-4 text-sm font-semibold text-muted">{tr("Fix the highlighted fields to see your payment.")}</p>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {currencyField}
              {field("income", tr("Income per year, before tax"), afford.errors)}
              {field("debts", tr("Other debt payments per month"), afford.errors, { hint: tr("Car loans, student loans, cards.") })}
              {field("downPct", tr("Down payment (% of the price)"), afford.errors, { decimal: true })}
              {field("front", tr("Most of your income for housing (%)"), afford.errors, { decimal: true })}
              {field("back", tr("Most of your income for housing plus debts (%)"), afford.errors, { decimal: true })}
            </div>
            <p className={hintClass}>{tr("Lenders often use about 28% and 36%, but they differ. Check yours.")}</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {field("rate", tr("Interest rate (% per year)"), afford.errors, { decimal: true })}
              {field("years", tr("Loan term (years)"), afford.errors)}
              {field("taxPct", tr("Property tax (% of the price per year)"), afford.errors, { decimal: true })}
              {field("insPct", tr("Home insurance (% of the price per year)"), afford.errors, { decimal: true })}
              {field("hoa", tr("HOA and other fees per month"), afford.errors)}
              {field("mi", tr("Mortgage insurance rate (% per year of the loan)"), afford.errors, { decimal: true })}
              {field("miStop", tr("It stops when you owe this share of the price (%)"), afford.errors, { decimal: true })}
            </div>
            <div aria-live="polite" className="mt-6">
              {afford.result ? (
                afford.result.price > 0 ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-[12px] bg-forest p-4 text-white"><p className="text-xs font-semibold text-white/65">{tr("You could afford a home up to")}</p><p className="mt-1 text-3xl font-black tabular-nums">{money(afford.result.price)}</p></div>
                      <div className="rounded-[12px] bg-fog p-4"><p className="text-xs font-semibold text-muted">{tr("Monthly budget for housing")}</p><p className="mt-1 text-xl font-black text-forest tabular-nums">{money2(afford.result.maxHousing)}</p></div>
                      <div className="rounded-[12px] bg-fog p-4"><p className="text-xs font-semibold text-muted">{tr("Loan amount")}</p><p className="mt-1 text-xl font-black text-forest tabular-nums">{money(afford.result.loan)}</p></div>
                      <div className="rounded-[12px] bg-fog p-4"><p className="text-xs font-semibold text-muted">{tr("Down payment")}</p><p className="mt-1 text-xl font-black text-forest tabular-nums">{money(afford.result.down)}</p></div>
                    </div>
                    <button type="button" onClick={() => { const r = afford.result!; setF((prev) => ({ ...prev, price: String(Math.round(r.price / 100)), down: String(Math.round(r.down / 100)), tax: String(Math.round((r.taxMonth * 12) / 100)), insurance: String(Math.round((r.insuranceMonth * 12) / 100)) })); setMode("payment"); }} className="mt-3 rounded-[10px] bg-white px-4 py-2 text-xs font-bold text-forest ring-1 ring-pebble hover:bg-fog">{tr("Use this price")}</button>
                  </>
                ) : (
                  <p className="rounded-[12px] bg-fog p-4 text-sm font-semibold text-muted">{tr("Your debts already use up the budget at these limits, so there is no room for a mortgage.")}</p>
                )
              ) : (
                <p className="rounded-[12px] bg-fog p-4 text-sm font-semibold text-muted">{tr("Fix the highlighted fields to see what you could afford.")}</p>
              )}
              <p className={hintClass}>{tr("An estimate only. Lenders also look at your credit history, savings and the property.")}</p>
            </div>
          </>
        )}
      </div>

      <article ref={paperRef} className="invoice-paper mx-auto h-fit w-full max-w-[780px] rounded-[14px] border border-hairline bg-white p-6 shadow-card md:p-8">
        <header className="flex items-start justify-between gap-4 border-b-2 border-forest pb-4">
          <div>
            <p className="text-sm font-semibold text-leaf">{tr("Mortgage schedule")}</p>
            <h2 className="mt-1 text-2xl font-black text-forest">{plan ? fill(tr("{price} home, {years} years"), { price: money(pay.price), years: f.years }) : tr("Mortgage schedule")}</h2>
            <p className="text-xs font-medium text-muted">{f.rate}%{lastMonth ? ` · ${fill(tr("Last payment: {month}."), { month: lastMonth })}` : ""}</p>
          </div>
          <div className="rounded-[10px] bg-fog p-3 text-right">
            <p className="text-xs font-semibold text-muted">{tr("Your monthly payment")}</p>
            <p className="text-lg font-black text-forest tabular-nums">{plan ? money2(plan.firstTotal) : "—"}</p>
          </div>
        </header>

        {plan ? (
          <>
            <section className="mt-4 grid grid-cols-3 gap-3 text-center text-sm">
              <div className="rounded-[10px] bg-fog p-3"><p className="text-xs font-semibold text-muted">{tr("Loan amount")}</p><p className="font-black text-forest tabular-nums">{money(plan.loan)}</p></div>
              <div className="rounded-[10px] bg-fog p-3"><p className="text-xs font-semibold text-muted">{tr("Total interest")}</p><p className="font-black text-forest tabular-nums">{money(plan.totalInterest)}</p></div>
              <div className="rounded-[10px] bg-forest p-3 text-white"><p className="text-xs font-semibold text-white/65">{tr("Total you pay")}</p><p className="font-black tabular-nums">{money(plan.totalPaid)}</p></div>
            </section>
            <table className="mt-4 w-full text-left text-xs">
              <tbody>
                {parts.map(([label, value]) => value > 0 ? (
                  <tr key={label} className="border-b border-hairline"><td className="py-1.5 font-semibold text-forest">{label}</td><td className="py-1.5 text-right tabular-nums">{money2(value)}</td></tr>
                ) : null)}
              </tbody>
            </table>
            {prepaying ? (
              <p className="mt-3 rounded-[10px] bg-fog p-3 text-sm font-medium text-forest">{fill(tr("You save {amount} in interest and finish {time} sooner."), { amount: money(interestSaved), time: duration(monthsSaved, tr) })}</p>
            ) : null}
            <table className="mt-4 w-full text-left text-sm">
              <thead>
                <tr className="border-b border-pebble text-xs text-muted">
                  <th className="py-2 font-semibold">{tr("Year")}</th>
                  <th className="py-2 text-right font-semibold">{tr("Principal paid")}</th>
                  <th className="py-2 text-right font-semibold">{tr("Interest paid")}</th>
                  <th className="py-2 text-right font-semibold">{tr("Tax, insurance, fees")}</th>
                  {plan.totalMi > 0 ? <th className="py-2 text-right font-semibold">{tr("Mortgage insurance")}</th> : null}
                  <th className="py-2 text-right font-semibold">{tr("Balance")}</th>
                </tr>
              </thead>
              <tbody>
                {plan.yearly.map((row) => (
                  <tr key={row.year} className="border-b border-hairline">
                    <td className="py-1.5 font-semibold text-forest">{row.year}</td>
                    <td className="py-1.5 text-right tabular-nums">{money(row.principal)}</td>
                    <td className="py-1.5 text-right tabular-nums">{money(row.interest)}</td>
                    <td className="py-1.5 text-right tabular-nums">{money(row.taxInsFees)}</td>
                    {plan.totalMi > 0 ? <td className="py-1.5 text-right tabular-nums">{money(row.mortgageInsurance)}</td> : null}
                    <td className="py-1.5 text-right font-bold tabular-nums">{money(row.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <p className="mt-6 text-sm font-semibold text-muted">{tr("Fix the highlighted fields to see your payment.")}</p>
        )}
        <footer className="mt-4 text-center text-xs font-medium text-muted">{tr("Indicative only. Your lender's figures may differ by a few units, and taxes, insurance and fees change over time.")} · Pro UPI QR</footer>
      </article>
    </div>
  );
}
