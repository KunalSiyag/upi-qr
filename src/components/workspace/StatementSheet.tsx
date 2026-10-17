import { useMemo, useState, type ChangeEvent } from "react";
import { addPayment, formatPaise, invoiceViews, type Workspace } from "../../lib/workspace/model";
import { matchCredits, parseStatement, type MatchSuggestion, type StatementCredit } from "../../lib/workspace/statement";
import { primaryButton, secondaryButton, Sheet } from "./ui";
import { useWs, type Tr } from "./i18n";

const MAX_BYTES = 5_000_000;

function shortDate(iso: string, locale = "en-IN") {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "UTC" });
}

/** Matcher reasons are English with embedded data ("mentions INV-7"); translate the frame, keep the data. */
function reasonText(reason: string, tr: Tr): string {
  const m = /^(mentions|from) (.+)$/.exec(reason) ?? /^(name contains) “(.+)”$/.exec(reason);
  if (!m) return tr(reason);
  return m[1] === "mentions" ? tr("mentions {x}", { x: m[2] }) : m[1] === "from" ? tr("from {x}", { x: m[2] }) : tr("name contains “{x}”", { x: m[2] });
}

/**
 * Bank statement import: the CSV is read in the browser (never uploaded) and
 * credits are matched to open invoices. Nothing is recorded until the user
 * confirms the ticked rows.
 */
export function StatementSheet({ ws, today, claimedUtrs, onRecord, onClose }: {
  ws: Workspace;
  today: string;
  /** UTR → invoiceId from pending pay-link claims. */
  claimedUtrs: ReadonlyMap<string, string>;
  onRecord: (next: Workspace, recorded: MatchSuggestion[]) => void;
  onClose: () => void;
}) {
  const [credits, setCredits] = useState<StatementCredit[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [skipped, setSkipped] = useState(0);
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const views = useMemo(() => invoiceViews(ws, today), [ws, today]);
  const { tr, dateLocale } = useWs();
  const result = useMemo(() => (credits ? matchCredits(credits, views, claimedUtrs) : null), [credits, views, claimedUtrs]);

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    if (file.size > MAX_BYTES) return setError(tr("That file is larger than 5 MB. Download a shorter date range."));
    if (/\.(xlsx?|pdf)$/i.test(file.name)) return setError(tr("Please download the statement as CSV (most net banking sites offer CSV next to Excel and PDF)."));
    const parsed = parseStatement(await file.text());
    setFileName(file.name);
    setSkipped(parsed.skippedRows);
    if (parsed.error) { setCredits(null); return setError(tr(parsed.error)); }
    setCredits(parsed.credits);
    const matches = matchCredits(parsed.credits, views, claimedUtrs);
    setTicked(Object.fromEntries(matches.suggestions.map((s) => [s.credit.key, s.confident])));
  }

  const chosen = result?.suggestions.filter((s) => ticked[s.credit.key]) ?? [];

  function record() {
    let next = ws;
    const now = Date.now();
    for (const s of chosen) {
      next = addPayment(next, s.invoiceId, {
        amountPaise: s.amountPaise,
        date: s.credit.date,
        mode: s.credit.utr ? "upi" : "bank",
        reference: (s.credit.utr || s.credit.reference).slice(0, 60),
      }, now);
    }
    onRecord(next, chosen);
  }

  const range = credits && credits.length
    ? `${shortDate(credits.reduce((a, c) => (c.date < a ? c.date : a), credits[0].date), dateLocale)} – ${shortDate(credits.reduce((a, c) => (c.date > a ? c.date : a), credits[0].date), dateLocale)}`
    : "";

  return (
    <Sheet title={tr("Import bank statement")} onClose={onClose}>
      <p className="text-sm text-charcoal">
        {tr("Download a CSV statement from your bank's net banking, then pick it here. It's read in this browser — the file is never uploaded.")}
      </p>
      <label className={`${secondaryButton} mt-4 inline-block cursor-pointer`}>
        {fileName ? tr("Choose another file") : tr("Choose CSV statement")}
        <input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" className="sr-only" onChange={choose} aria-label={tr("Bank statement CSV file")} />
      </label>
      {fileName && <span className="ml-2 text-xs text-muted">{fileName}</span>}
      {error && <p role="alert" className="mt-3 text-sm font-bold text-[#a8321d]">{error}</p>}

      {result && credits && (
        <div className="mt-4">
          <p className="text-sm text-charcoal" role="status">
            {tr(credits.length === 1 ? "Read {n} incoming payment ({range})." : "Read {n} incoming payments ({range}).", { n: credits.length, range })}{" "}
            {result.suggestions.length
              ? tr("Found {n} that look like payments for your invoices.", { n: result.suggestions.length })
              : tr("None of them match your open invoices.")}
            {result.alreadyRecorded > 0 && <> {tr("{n} already recorded.", { n: result.alreadyRecorded })}</>}
            {skipped > 0 && <> {tr(skipped === 1 ? "{n} row couldn't be read." : "{n} rows couldn't be read.", { n: skipped })}</>}
          </p>
          {result.suggestions.length > 0 && (
            <ul className="mt-3 space-y-2">
              {result.suggestions.map((s) => {
                const view = views.find((v) => v.invoice.id === s.invoiceId)!;
                const id = `match-${s.credit.key}`;
                return (
                  <li key={s.credit.key} className={`rounded-[10px] border p-3 ${ticked[s.credit.key] ? "border-leaf/40 bg-fog" : "border-hairline bg-white"}`}>
                    <label htmlFor={id} className="flex cursor-pointer gap-3">
                      <input id={id} type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-[#287a57]" checked={!!ticked[s.credit.key]}
                        onChange={(e) => setTicked((t) => ({ ...t, [s.credit.key]: e.target.checked }))} />
                      <span className="min-w-0 text-sm">
                        <span className="block font-bold text-ink">
                          {tr("{amount} on {date}", { amount: formatPaise(s.credit.amountPaise), date: shortDate(s.credit.date, dateLocale) })} → {view.invoice.number} · {view.client?.name ?? tr("Client")}
                        </span>
                        <span className="block truncate text-xs text-muted" title={s.credit.narration}>{s.credit.narration || s.credit.reference}</span>
                        <span className="mt-1 flex flex-wrap gap-1">
                          {s.reasons.map((r) => <span key={r} className="rounded-[7px] bg-white px-2 py-0.5 text-[10px] font-bold text-leaf ring-1 ring-leaf/20">{reasonText(r, tr)}</span>)}
                          {s.amountPaise < s.credit.amountPaise && <span className="rounded-[7px] bg-fog px-2 py-0.5 text-[10px] font-bold text-ink">{tr("records {amount} (balance)", { amount: formatPaise(s.amountPaise) })}</span>}
                          {!s.confident && <span className="rounded-[7px] bg-fog px-2 py-0.5 text-[10px] font-bold text-ink">{tr("check before ticking")}</span>}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {result.unmatched.length > 0 && (
            <details className="mt-3 text-xs text-charcoal">
              <summary className="cursor-pointer font-bold">{tr(result.unmatched.length === 1 ? "{n} other credit not matched" : "{n} other credits not matched", { n: result.unmatched.length })}</summary>
              <ul className="mt-2 space-y-1">
                {result.unmatched.slice(0, 50).map((c) => (
                  <li key={c.key} className="truncate">{shortDate(c.date, dateLocale)} · {formatPaise(c.amountPaise)} · {c.narration || c.reference}</li>
                ))}
              </ul>
              <p className="mt-2">{tr("Record these by hand with “Record payment” if they belong to an invoice.")}</p>
            </details>
          )}
          <div className="mt-4 flex gap-2">
            <button type="button" disabled={chosen.length === 0} onClick={record} className={`${primaryButton} flex-1`}>
              {chosen.length ? tr(chosen.length === 1 ? "Record {n} payment" : "Record {n} payments", { n: chosen.length }) : tr("Tick payments to record")}
            </button>
            <button type="button" onClick={onClose} className={secondaryButton}>{tr("Close")}</button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
