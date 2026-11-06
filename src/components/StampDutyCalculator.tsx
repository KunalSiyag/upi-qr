import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { DocLang } from "../data/documentLang";
import { STAMP_DUTY_PHRASES } from "../data/stampDutyPhrases";
import { downloadDataUrl, notifyExportError } from "../lib/export-image";
import { renderPaperPng, savePaperPdf } from "../lib/exportPaper";
import { parsePercentBps } from "../lib/freelanceRate";
import { compact, fill, rupees } from "../lib/loanFormat";
import { parsePaise } from "../lib/loanMath";
import { localTranslator } from "../lib/localPhrases";
import { trackProductEvent } from "../lib/productEvents";
import { stampDuty, type StampDutyResult } from "../lib/stampDuty";

const TOOL = "stamp-duty-calculator";
const draftKey = "proupiqr-stamp-duty-draft";

const fieldClass = "mt-2 w-full rounded-[10px] border border-pebble bg-white px-3.5 py-2.5 font-medium text-forest outline-none focus:border-leaf";
const labelClass = "text-sm font-semibold text-forest";
const hintClass = "mt-1.5 text-xs font-medium text-muted";
const DEFAULTS = { value: "5000000", circle: "", higher: true, stamp: "5", surcharge: "1", reg: "1", cap: "", other: "0" };
type Fields = typeof DEFAULTS;

export function StampDutyCalculator({ lang = "en" }: { lang?: DocLang } = {}) {
  const tr = useMemo(() => localTranslator(lang, STAMP_DUTY_PHRASES), [lang]);
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
    const optional = (text: string) => (text.trim() === "" ? 0 : parsePaise(text));
    const value = parsePaise(f.value);
    const circle = optional(f.circle);
    const cap = optional(f.cap);
    const other = optional(f.other);
    const stamp = parsePercentBps(f.stamp, 0, 2500);
    const surcharge = parsePercentBps(f.surcharge, 0, 2500);
    const reg = parsePercentBps(f.reg, 0, 2500);
    if (value === null || value <= 0) errors.value = tr("Enter the price in the agreement.");
    if (circle === null) errors.circle = tr("Enter an amount, or leave it empty.");
    if (cap === null) errors.cap = tr("Enter an amount, or leave it empty.");
    if (other === null) errors.other = tr("Enter an amount, or 0.");
    if (stamp === null) errors.stamp = tr("Enter a rate from 0 to 25, for example 5.");
    if (surcharge === null) errors.surcharge = tr("Enter a rate from 0 to 25, for example 1.");
    if (reg === null) errors.reg = tr("Enter a rate from 0 to 25, for example 1.");
    if (Object.keys(errors).length > 0 || value === null || circle === null || cap === null || other === null || stamp === null || surcharge === null || reg === null) {
      return { errors, result: null as StampDutyResult | null };
    }
    return { errors, result: stampDuty({ agreementValue: value, circleValue: circle, useHigher: f.higher, stampBps: stamp, surchargeBps: surcharge, registrationBps: reg, registrationCap: cap, otherCharges: other }) };
  }, [f, tr]);

  const { result } = calc;
  const fileName = "stamp-duty-estimate";

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
  const field = (key: "value" | "circle" | "stamp" | "surcharge" | "reg" | "cap" | "other", label: string, mode: "numeric" | "decimal", hint?: string) => {
    const money = key === "value" || key === "circle" || key === "cap" || key === "other";
    const p = money && f[key].trim() !== "" ? parsePaise(f[key]) : null;
    const shown = hint ?? (p !== null && p > 0 && !calc.errors[key] ? compact(p, tr) ?? undefined : undefined);
    return (
      <div>
        <label htmlFor={id(key)} className={labelClass}>{label}</label>
        <input id={id(key)} inputMode={mode} autoComplete="off" value={f[key]} onChange={(e) => set(key, e.target.value)} aria-invalid={Boolean(calc.errors[key])} aria-describedby={id(`${key}-err`)} className={fieldClass} />
        {shown ? <p className={hintClass}>{shown}</p> : null}
        {err(key)}
      </div>
    );
  };

  const rows = result
    ? [
        { label: tr("Stamp duty"), amount: result.stampDuty, basis: `${f.stamp}%` },
        ...(result.surcharge > 0 ? [{ label: tr("Surcharge or cess"), amount: result.surcharge, basis: `${f.surcharge}%` }] : []),
        { label: tr("Registration fee"), amount: result.registration, basis: result.registrationCapped ? tr("capped") : `${f.reg}%` },
        ...(result.other > 0 ? [{ label: tr("Other charges"), amount: result.other, basis: "" }] : []),
      ]
    : [];

  return (
    <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
      <div className="no-print rounded-[14px] border border-hairline bg-white p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-leaf">{tr("Stamp duty calculator")}</p>
            <h2 className="mt-1 text-2xl font-black text-forest">{tr("Work out stamp duty and registration")}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={downloadPdf} disabled={pdfState === "busy" || !result} className="rounded-[10px] bg-forest px-4 py-2 text-xs font-bold text-white hover:bg-graphite disabled:opacity-50">{pdfState === "busy" ? tr("Generating...") : tr("Estimate PDF")}</button>
            <button type="button" onClick={downloadPng} disabled={pngState === "busy" || !result} className="rounded-[10px] bg-white px-4 py-2 text-xs font-bold text-forest ring-1 ring-pebble hover:bg-fog disabled:opacity-50">{pngState === "busy" ? tr("Generating...") : "PNG"}</button>
          </div>
        </div>

        <p className="mt-4 rounded-[10px] bg-fog p-3 text-xs font-medium text-charcoal">{tr("Rates differ by state, buyer and property, and they change. The rates below are only examples: replace them with the ones from your state's registration department.")}</p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {field("value", tr("Price in the agreement (₹)"), "numeric")}
          {field("circle", tr("Circle rate or ready-reckoner value (₹, optional)"), "numeric")}
        </div>
        <label className="mt-4 flex items-start gap-2 text-sm font-semibold text-forest">
          <input type="checkbox" checked={f.higher} onChange={(e) => set("higher", e.target.checked)} className="mt-0.5 h-4 w-4" />
          <span>{tr("Charge on the higher of the price and the circle rate")}</span>
        </label>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {field("stamp", tr("Stamp duty (%)"), "decimal")}
          {field("surcharge", tr("Surcharge or cess (%)"), "decimal", tr("Local body tax, metro or other add-on. 0 if none."))}
          {field("reg", tr("Registration fee (%)"), "decimal")}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {field("cap", tr("Registration fee cap (₹, optional)"), "numeric")}
          {field("other", tr("Other fixed charges (₹)"), "numeric", tr("Document writer, e-stamp fee and the like."))}
        </div>

        <div aria-live="polite" className="mt-6">
          {result ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-[12px] bg-forest p-4 text-white"><p className="text-xs font-semibold text-white/65">{tr("Total charges")}</p><p className="mt-1 text-2xl font-black tabular-nums">{rupees(result.totalCharges)}</p></div>
                <div className="rounded-[12px] bg-fog p-4"><p className="text-xs font-semibold text-muted">{tr("Price plus charges")}</p><p className="mt-1 text-xl font-black text-forest tabular-nums">{rupees(result.allIn)}</p></div>
                <div className="rounded-[12px] bg-fog p-4"><p className="text-xs font-semibold text-muted">{tr("Charges as a share of the price")}</p><p className="mt-1 text-xl font-black text-forest tabular-nums">{(result.chargesBps / 100).toFixed(2)}%</p></div>
              </div>
              <p className="mt-4 text-sm font-medium text-charcoal">
                {result.baseIsCircle ? fill(tr("Charged on the circle rate, {amount}, because it is higher than the price."), { amount: rupees(result.base) }) : fill(tr("Charged on the price, {amount}."), { amount: rupees(result.base) })}
              </p>
            </>
          ) : (
            <p className="rounded-[12px] bg-fog p-4 text-sm font-semibold text-muted">{tr("Fix the highlighted fields to see the charges.")}</p>
          )}
          <p className={hintClass}>{tr("Some offices round duty up to the next ₹10 or ₹100, and some states charge extra for certain buyers or properties. This does not.")}</p>
        </div>
      </div>

      <article ref={paperRef} className="invoice-paper mx-auto h-fit w-full max-w-[780px] rounded-[14px] border border-hairline bg-white p-6 shadow-card md:p-8">
        <header className="flex items-start justify-between gap-4 border-b-2 border-forest pb-4">
          <div>
            <p className="text-sm font-semibold text-leaf">{tr("Property purchase")}</p>
            <h2 className="mt-1 text-2xl font-black text-forest">{tr("Stamp duty estimate")}</h2>
            <p className="text-xs font-medium text-muted">{tr("Price in the agreement (₹)")}: {result ? rupees(parsePaise(f.value) ?? 0) : "—"}</p>
          </div>
          <div className="rounded-[10px] bg-fog p-3 text-right">
            <p className="text-xs font-semibold text-muted">{tr("Total charges")}</p>
            <p className="text-lg font-black text-forest tabular-nums">{result ? rupees(result.totalCharges) : "—"}</p>
          </div>
        </header>
        {result ? (
          <>
            <table className="mt-4 w-full text-left text-sm">
              <thead>
                <tr className="border-b border-pebble text-xs text-muted">
                  <th className="py-2 font-semibold">{tr("Charge")}</th>
                  <th className="py-2 font-semibold">{tr("Rate")}</th>
                  <th className="py-2 text-right font-semibold">{tr("Amount")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.label} className="border-b border-hairline">
                    <td className="py-2 font-semibold text-forest">{row.label}</td>
                    <td className="py-2 text-muted">{row.basis}</td>
                    <td className="py-2 text-right tabular-nums">{rupees(row.amount)}</td>
                  </tr>
                ))}
                <tr>
                  <td className="py-2 font-black text-forest">{tr("Total charges")}</td>
                  <td />
                  <td className="py-2 text-right font-black tabular-nums text-forest">{rupees(result.totalCharges)}</td>
                </tr>
              </tbody>
            </table>
            <section className="mt-4 grid grid-cols-3 gap-3 text-center text-sm">
              <div className="rounded-[10px] bg-fog p-3"><p className="text-xs font-semibold text-muted">{tr("Charged on")}</p><p className="font-black text-forest tabular-nums">{rupees(result.base)}</p></div>
              <div className="rounded-[10px] bg-fog p-3"><p className="text-xs font-semibold text-muted">{tr("Charges as a share of the price")}</p><p className="font-black text-forest tabular-nums">{(result.chargesBps / 100).toFixed(2)}%</p></div>
              <div className="rounded-[10px] bg-forest p-3 text-white"><p className="text-xs font-semibold text-white/65">{tr("Price plus charges")}</p><p className="font-black tabular-nums">{rupees(result.allIn)}</p></div>
            </section>
          </>
        ) : (
          <p className="mt-6 text-sm font-semibold text-muted">{tr("Fix the highlighted fields to see the charges.")}</p>
        )}
        <footer className="mt-4 text-center text-xs font-medium text-muted">{tr("Indicative only. Rates are the ones you entered; confirm them with your state's registration department.")} · Pro UPI QR</footer>
      </article>
    </div>
  );
}
