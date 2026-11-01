import React, { useId, useMemo, useState } from "react";
import type { DocLang } from "../data/documentLang";
import { localTranslator } from "../lib/localPhrases";
import { GSTIN_PHRASES } from "../data/gstinPhrases";
import {
  BULK_MAX,
  GSTIN_CODE_NOTES,
  GSTIN_LENGTH,
  SAMPLE_GSTIN,
  SAMPLE_LIST,
  checkGstin,
  checkList,
  stateLabel,
  stateNoteKey,
  toDelimited,
  type GstinIssue,
  type GstinNote,
  type GstinResult,
  type ListCheck,
} from "../lib/gstin";

const STATUS_TEXT = {
  ok: "Format and check digit OK",
  checksum: "Check digit does not match",
  format: "Format problems found",
};

const STATUS_HELP: Record<string, string> = {
  ok: "No format problems found, and the check digit matches the other 14 characters.",
  checksum: "The layout is fine, but the check digit does not fit the other 14 characters, so at least one character is not what it should be. Compare the number with your invoice or certificate.",
};

const ISSUE_TEXT = {
  length: "A GSTIN has 15 characters. This has {count}.",
  chars: "Position {position}: only letters A to Z and digits 0 to 9 are allowed.",
  state: "Position {position}: the state code is two digits, not a letter.",
  "pan-letter": "Position {position}: the PAN has a letter here, not a digit.",
  "pan-digit": "Position {position}: the PAN has a digit here, not a letter.",
};

const NOTE_TEXT = {
  holder: "The 4th letter of the PAN ({letter}) is not one of the usual holder types: A, B, C, F, G, H, J, L, P, T.",
  entity: "The 13th character is 0. Public explainers number the registrations under a PAN from 1, so a 0 is unusual. This is a note, not an error.",
  fourteenth: "The 14th character is {char}. Most GSTINs have Z here. This is a note, not an error.",
};

const SEARCH_URL = "https://services.gst.gov.in/services/searchtp";
const ISSUES_SHOWN = 8;
const DETAILS_SHOWN = 3;

function fill(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match));
}

function downloadCsv(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** One term and its value (and an optional plain-language reading of it) in the decoded list. */
function Part({ term, shown, hint }: { term: string; shown: string; hint?: string }) {
  return (
    <div className="grid gap-0.5 py-2 sm:grid-cols-[15rem_1fr] sm:gap-4">
      <dt className="text-charcoal">{term}</dt>
      <dd className="text-forest">
        <span className="font-mono" dir="ltr" translate="no">{shown}</span>
        {hint && <span className="text-charcoal"> · {hint}</span>}
      </dd>
    </div>
  );
}

export function GstinChecker({ lang = "en" }: { lang?: DocLang } = {}) {
  const tr = useMemo(() => localTranslator(lang, GSTIN_PHRASES), [lang]);
  // English copy on the other locales is not Arabic, Japanese and so on: mark it as English and keep it left to right.
  const regionalLang = lang === "hi" || lang === "ta" || lang === "te" || lang === "mr" ? lang : "en";
  const id = useId();
  const [value, setValue] = useState("");
  const [touched, setTouched] = useState(false);
  const [list, setList] = useState("");
  const [checked, setChecked] = useState<ListCheck | null>(null);
  const [message, setMessage] = useState("");

  const result = checkGstin(value);
  // Text still being typed stays quiet until it is 15 characters, a bad character shows up, or the person moves on or pastes.
  const hasBadChar = result.issues.some((issue) => issue.code === "chars");
  const settled = result.status !== "empty" && (touched || result.length >= GSTIN_LENGTH || hasBadChar);
  const disclaimer = lang === "hi" ? "/hi/disclaimer/" : "/disclaimer/";

  const issueLine = (issue: GstinIssue) =>
    fill(tr(ISSUE_TEXT[issue.code]), { position: issue.position ?? "", count: issue.count ?? "" });
  const noteLine = (note: GstinNote) => {
    if (note.code === "state") return fill(tr(GSTIN_CODE_NOTES[stateNoteKey(note.value)]), { code: note.value });
    if (note.code === "holder") return fill(tr(NOTE_TEXT.holder), { letter: note.value });
    if (note.code === "entity") return tr(NOTE_TEXT.entity);
    return fill(tr(NOTE_TEXT.fourteenth), { char: note.value });
  };
  const detailLines = (r: GstinResult) => {
    const lines = [...r.issues.map(issueLine), ...r.notes.map(noteLine)];
    if (lines.length <= DETAILS_SHOWN) return lines;
    return [...lines.slice(0, DETAILS_SHOWN), fill(tr("…and {count} more"), { count: lines.length - DETAILS_SHOWN })];
  };

  const runList = () => {
    const next = checkList(list);
    setChecked(next);
    setMessage(next.entries.length === 0 ? tr("Paste at least one GSTIN, then choose Check list.") : "");
  };
  const tableRows = (check: ListCheck) => [
    [tr("Line"), tr("GSTIN as typed"), tr("State or UT"), tr("Status"), tr("Details")],
    ...check.entries.map((entry) => [
      String(entry.line),
      entry.typed,
      stateLabel(entry.result),
      tr(STATUS_TEXT[entry.result.status as keyof typeof STATUS_TEXT]),
      detailLines(entry.result).join(" "),
    ]),
  ];
  const copyResults = async () => {
    if (checked === null) return;
    try {
      await navigator.clipboard.writeText(toDelimited(tableRows(checked), "\t"));
      setMessage(tr("Results copied."));
    } catch {
      setMessage(tr("Could not copy. Use Download CSV instead."));
    }
  };
  const saveCsv = () => {
    if (checked === null) return;
    // A byte-order mark lets Excel read Hindi, Tamil, Telugu and Marathi text correctly.
    downloadCsv("gstin-check-results.csv", (lang === "en" ? "" : "\uFEFF") + toDelimited(tableRows(checked), ","));
  };

  const card = "rounded-[12px] border border-forest/10 bg-white p-5 sm:p-6";
  const label = "block text-sm font-semibold text-forest";
  const field = "mt-2 w-full rounded-[10px] border border-forest/15 bg-white px-4 py-3 font-mono text-base text-forest placeholder:text-forest/70 focus:border-leaf";
  const secondary = "min-h-[40px] rounded-[10px] bg-white px-4 py-2.5 text-sm font-semibold text-forest ring-1 ring-forest/15 transition hover:ring-forest/30";
  const primary = "min-h-[40px] rounded-[10px] bg-forest px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-graphite";
  const portalLink = (
    <a href={SEARCH_URL} target="_blank" rel="noopener noreferrer nofollow" className="font-semibold text-leaf underline">
      {tr("Look it up on the official GST portal")}
      <span className="sr-only"> {tr("(opens in a new tab)")}</span>
    </a>
  );

  const parts = result.parts;
  const holderChar = parts ? parts.pan[3] : "";
  const stateHint = result.state ? (result.state.name ?? tr("Not in the state list")) : undefined;
  const entityHint = parts
    ? /^[1-9]$/.test(parts.entity)
      ? fill(tr("Registration number {n} under this PAN in this state"), { n: parts.entity })
      : /^[A-Z]$/.test(parts.entity) ? tr("A letter, used after 9") : undefined
    : undefined;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5" lang={regionalLang} dir="ltr">
      <p className="rounded-[10px] bg-fog px-4 py-3 text-sm font-semibold text-forest" data-gstin-notice>
        {tr("Format and check digit only. This does not show that a GSTIN is registered.")}
      </p>

      <section className={card} aria-labelledby={`${id}-one`}>
        <h2 id={`${id}-one`} className="text-xl font-semibold text-forest">{tr("Check one GSTIN")}</h2>
        <label className={`${label} mt-4`} htmlFor={`${id}-gstin`}>{tr("GSTIN (15 characters)")}</label>
        <input
          id={`${id}-gstin`}
          data-gstin-input
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          maxLength={64}
          dir="ltr"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            if (event.target.value === "") setTouched(false);
          }}
          onBlur={() => setTouched(true)}
          onPaste={() => setTouched(true)}
          onKeyDown={(event) => { if (event.key === "Enter") setTouched(true); }}
          aria-describedby={`${id}-result`}
          aria-invalid={settled && result.status !== "ok"}
          placeholder={SAMPLE_GSTIN}
          className={field}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={secondary} data-gstin-sample onClick={() => { setValue(SAMPLE_GSTIN); setTouched(true); }}>
            {tr("Use a sample")}
          </button>
          <button type="button" className={secondary} data-gstin-clear onClick={() => { setValue(""); setTouched(false); }}>
            {tr("Clear")}
          </button>
        </div>

        <div id={`${id}-result`} className="mt-4 rounded-[10px] bg-fog px-4 py-4 text-sm" data-gstin-result>
          <div role="status" aria-live="polite" aria-atomic="true" data-gstin-live>
            {settled && (
              <div>
                <p className="font-semibold text-forest" data-gstin-status={result.status}>
                  {tr(STATUS_TEXT[result.status as keyof typeof STATUS_TEXT])}
                </p>
                {STATUS_HELP[result.status] && <p className="mt-1 text-charcoal">{tr(STATUS_HELP[result.status])}</p>}
                {result.issues.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-charcoal" data-gstin-issues>
                    {result.issues.slice(0, ISSUES_SHOWN).map((issue, index) => <li key={index}>{issueLine(issue)}</li>)}
                    {result.issues.length > ISSUES_SHOWN && (
                      <li>{fill(tr("…and {count} more"), { count: result.issues.length - ISSUES_SHOWN })}</li>
                    )}
                  </ul>
                )}
              </div>
            )}
          </div>
          {result.status === "empty" && <p className="text-charcoal">{tr("Type or paste a GSTIN to see what its 15 characters say.")}</p>}
          {result.status !== "empty" && settled === false && (
            <p className="text-charcoal" data-gstin-progress>{fill(tr("{count} of 15 characters so far."), { count: result.length })}</p>
          )}
          {settled && parts && (
            <dl className="mt-3 divide-y divide-forest/10 border-t border-forest/10" data-gstin-parts>
              <Part term={tr("State or UT (characters 1-2)")} shown={result.state ? result.state.code : parts.state} hint={stateHint} />
              <Part term={tr("PAN (characters 3-12)")} shown={parts.pan} />
              <Part
                term={tr("Holder type (PAN's 4th letter)")}
                shown={holderChar}
                hint={result.holder ? tr(result.holder.name) : /^[A-Z]$/.test(holderChar) ? tr("Not a usual holder type") : undefined}
              />
              <Part term={tr("Entity number (13th character)")} shown={parts.entity} hint={entityHint} />
              <Part term={tr("14th character")} shown={parts.fourteenth} hint={parts.fourteenth === "Z" ? tr("the usual letter") : tr("unusual here")} />
              <Part
                term={tr("Check digit (15th character)")}
                shown={parts.check}
                hint={result.checkDigit === "match" ? tr("matches the other 14 characters") : tr("does not match the other 14 characters")}
              />
            </dl>
          )}
          {settled && result.notes.length > 0 && (
            <div className="mt-3 border-t border-forest/10 pt-3" data-gstin-notes>
              <p className="font-semibold text-forest">{tr("Notes, not errors")}</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-charcoal">
                {result.notes.map((note, index) => <li key={index}>{noteLine(note)}</li>)}
              </ul>
            </div>
          )}
          <p className="mt-3 border-t border-forest/10 pt-3 text-charcoal">
            {tr("Format and check digit only. This does not show that the GSTIN is registered or whose it is.")} {portalLink}.
          </p>
        </div>
      </section>

      <section className={card} aria-labelledby={`${id}-many`}>
        <h2 id={`${id}-many`} className="text-xl font-semibold text-forest">{tr("Check a list")}</h2>
        <label className={`${label} mt-4`} htmlFor={`${id}-list`}>{tr("GSTINs, one per line")}</label>
        <p id={`${id}-list-help`} className="mt-1 text-sm text-charcoal">
          {fill(tr("A new line, comma, tab or space starts the next GSTIN. Up to {max} are checked at a time."), { max: BULK_MAX })}
        </p>
        <textarea
          id={`${id}-list`}
          data-gstin-list
          rows={6}
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          dir="ltr"
          value={list}
          onChange={(event) => setList(event.target.value)}
          aria-describedby={`${id}-list-help`}
          placeholder={SAMPLE_GSTIN}
          className={field}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={primary} data-gstin-run onClick={runList}>{tr("Check list")}</button>
          <button type="button" className={secondary} data-gstin-list-sample onClick={() => setList(SAMPLE_LIST.join("\n"))}>
            {tr("Use a sample list")}
          </button>
          <button type="button" className={secondary} data-gstin-list-clear onClick={() => { setList(""); setChecked(null); setMessage(""); }}>
            {tr("Clear")}
          </button>
        </div>
        <div role="status" aria-live="polite" className="mt-4 text-sm text-charcoal" data-gstin-summary>
          {checked !== null && checked.entries.length > 0 && (
            <p className="font-semibold text-forest">
              {fill(tr("{total} checked: {ok} OK, {checksum} check digit mismatches, {format} with format problems."), {
                total: checked.entries.length,
                ok: checked.counts.ok,
                checksum: checked.counts.checksum,
                format: checked.counts.format,
              })}
            </p>
          )}
          {checked !== null && checked.skipped > 0 && (
            <p className="mt-1">{fill(tr("Only the first {max} were checked. Skipped: {skipped}."), { max: BULK_MAX, skipped: checked.skipped })}</p>
          )}
          {message && <p className="mt-1">{message}</p>}
        </div>
        {checked !== null && checked.entries.length > 0 && (
          <>
            <div className="mt-3 hidden overflow-x-auto rounded-[10px] border border-forest/10 sm:block" role="region" aria-label={tr("Results")} tabIndex={0}>
              <table className="w-full min-w-[36rem] text-left text-sm" data-gstin-table>
                <caption className="sr-only">{tr("Results")}</caption>
                <thead className="bg-fog text-forest">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-semibold">{tr("Line")}</th>
                    <th scope="col" className="px-3 py-2 font-semibold">{tr("GSTIN as typed")}</th>
                    <th scope="col" className="px-3 py-2 font-semibold">{tr("State or UT")}</th>
                    <th scope="col" className="px-3 py-2 font-semibold">{tr("Status")}</th>
                    <th scope="col" className="px-3 py-2 font-semibold">{tr("Details")}</th>
                  </tr>
                </thead>
                <tbody>
                  {checked.entries.map((entry, index) => (
                    <tr key={index} className="border-t border-forest/10 align-top" data-gstin-row={entry.result.status}>
                      <td className="px-3 py-2 text-charcoal">{entry.line}</td>
                      <td className="break-all px-3 py-2 font-mono text-forest" dir="ltr" translate="no">{entry.typed}</td>
                      <td className="px-3 py-2 text-charcoal">{stateLabel(entry.result) || "—"}</td>
                      <td className="px-3 py-2 font-semibold text-forest">{tr(STATUS_TEXT[entry.result.status as keyof typeof STATUS_TEXT])}</td>
                      <td className="px-3 py-2 text-charcoal">{detailLines(entry.result).join(" ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* On a phone the same rows stack, so the status never sits behind a sideways scroll. */}
            <ul className="mt-3 divide-y divide-forest/10 rounded-[10px] border border-forest/10 sm:hidden" aria-label={tr("Results")} data-gstin-cards>
              {checked.entries.map((entry, index) => {
                const where = stateLabel(entry.result);
                const lines = detailLines(entry.result);
                return (
                  <li key={index} className="px-3 py-3" data-gstin-card={entry.result.status}>
                    <p className="flex items-baseline justify-between gap-3">
                      <span className="break-all font-mono text-forest" dir="ltr" translate="no">{entry.typed}</span>
                      <span className="shrink-0 text-sm text-charcoal">{tr("Line")} {entry.line}</span>
                    </p>
                    <p className="mt-1 font-semibold text-forest">{tr(STATUS_TEXT[entry.result.status as keyof typeof STATUS_TEXT])}</p>
                    {where && <p className="mt-0.5 text-sm text-charcoal">{where}</p>}
                    {lines.length > 0 && <p className="mt-1 text-sm text-charcoal">{lines.join(" ")}</p>}
                  </li>
                );
              })}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={secondary} data-gstin-copy onClick={copyResults}>{tr("Copy results")}</button>
              <button type="button" className={secondary} data-gstin-csv onClick={saveCsv}>{tr("Download CSV")}</button>
            </div>
          </>
        )}
        <p className="mt-4 text-sm text-charcoal">
          {tr("Nothing you paste is uploaded, saved or put in the web address. The list and results stay on this page until you close or reload it.")}
        </p>
      </section>

      <p className="text-sm leading-relaxed text-charcoal">
        {tr("Independent tool, not run or approved by GSTN or any tax department.")}{" "}
        <a href={disclaimer} className="font-semibold text-leaf underline">{tr("Read the disclaimer")}</a>
      </p>
    </div>
  );
}
