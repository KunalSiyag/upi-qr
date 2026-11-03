import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import type { DocLang } from "../data/documentLang";
import { localTranslator } from "../lib/localPhrases";
import { WORDS_PHRASES } from "../data/wordsPhrases";
import { trackProductEvent } from "../lib/productEvents";
import {
  SHEETS_FUNCTION_NAME,
  SHEETS_SNIPPET,
  amountInWordsText,
  formatIndian,
  parseRupees,
  type EnglishStyle,
  type LetterCase,
  type ParseErrorCode,
  type WordsLanguage,
} from "../lib/words";

/** Pages in these languages translate the screen; every other language page shows it in English. */
const TRANSLATED_UI: readonly DocLang[] = ["hi", "ta", "te", "mr"];

const MESSAGE: Record<ParseErrorCode, string> = {
  empty: "Type an amount to see it in words.",
  negative: "Enter an amount of zero or more.",
  "not-a-number": "Use digits only, with an optional ₹ or Rs. in front, for example 1,25,050.50.",
  "decimal-comma": "Use a dot for paise, not a comma, for example 1250.50.",
  "bad-commas": "Check the commas. Group digits like 1,23,456 or 1,234,567.",
  decimals: "Use at most 2 decimals: paise are hundredths of a rupee.",
  "too-large": "That is too large. This converter reads up to ₹99,99,99,99,99,999.99 (13 digits before the decimal point).",
};

const EXAMPLES = ["0.50", "1,234.50", "1,25,050.50", "10,00,000", "12,34,56,789.50", "1,00,00,00,000"];

type CopyState = "idle" | "done" | "failed";

/** Writes to the clipboard; the older execCommand route covers browsers that block the async API. */
async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const copied = document.execCommand("copy");
      document.body.removeChild(area);
      previous?.focus();
      return copied;
    } catch {
      return false;
    }
  }
}

/** Clears a "copied" or "failed" note after a moment, and when the component goes away. */
function useCopyState() {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const show = (next: CopyState) => {
    setState(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), next === "failed" ? 5000 : 2200);
  };
  return { state, show, reset: () => setState("idle") };
}

const card = "rounded-[12px] border border-forest/10 bg-white p-5 sm:p-6";
const fieldLabel = "block text-sm font-semibold text-forest";
const select = "mt-2 w-full rounded-[10px] border border-forest/15 bg-white px-3 py-2.5 text-base text-forest focus:border-leaf";

export function AmountWords({ lang = "en" }: { lang?: DocLang } = {}) {
  // The converter is for Indian rupees only, so pages in other languages use the English screen.
  const uiLang: DocLang = TRANSLATED_UI.includes(lang) ? lang : "en";
  const tr = useMemo(() => localTranslator(uiLang, WORDS_PHRASES), [uiLang]);
  const id = useId();
  const [text, setText] = useState("");
  const [language, setLanguage] = useState<WordsLanguage>(uiLang === "hi" ? "hi" : "en");
  const [style, setStyle] = useState<EnglishStyle>("cheque");
  const [letters, setLetters] = useState<LetterCase>("title");
  const copy = useCopyState();

  const parsed = useMemo(() => parseRupees(text), [text]);
  const words = parsed.ok ? amountInWordsText(parsed.paise, { language, style, letters }) : "";
  useEffect(copy.reset, [words]);

  const copyWords = async () => {
    if (words === "") return;
    if (await writeClipboard(words)) {
      copy.show("done");
      trackProductEvent("copy", "amount-in-words");
    } else {
      copy.show("failed");
    }
  };

  const showProblem = !parsed.ok && parsed.error !== "empty";

  return (
    <div className="mx-auto w-full max-w-4xl" lang={uiLang} dir="ltr" role="group" aria-label={tr("Convert an amount")} data-amount-words>
      <div className={card}>
        <label className={fieldLabel} htmlFor={`${id}-amount`}>{tr("Amount in rupees")}</label>
        <div className="relative mt-2">
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-lg font-semibold text-charcoal">₹</span>
          <input
            id={`${id}-amount`}
            data-words-input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            maxLength={48}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="1,25,050.50"
            aria-invalid={showProblem}
            aria-describedby={`${id}-hint`}
            className="w-full rounded-[10px] border border-forest/15 bg-white py-3 pl-10 pr-4 text-lg font-semibold text-forest placeholder:font-normal placeholder:text-forest/65 focus:border-leaf"
          />
        </div>
        <p id={`${id}-hint`} className="mt-2 text-sm text-charcoal">{tr("For example 1,25,050.50 or ₹4,999/-. Paise go after a dot.")}</p>

        <div role="status" aria-live="polite" aria-atomic="true" data-words-result className="mt-5 rounded-[12px] bg-fog p-5">
          {parsed.ok ? (
            <>
              <p className="text-sm text-charcoal">
                {tr("In figures")}: <span className="font-semibold text-forest" data-words-figures>₹{formatIndian(parsed.paise)}</span>
              </p>
              <p className="mt-3 text-sm text-charcoal">{tr("In words")}</p>
              <p lang={language} className="mt-1 break-words text-xl font-semibold leading-snug text-forest sm:text-2xl" data-words-text>{words}</p>
            </>
          ) : (
            <p className={showProblem ? "text-sm font-semibold text-[#a8321d]" : "text-sm text-charcoal"} data-words-message>{tr(MESSAGE[parsed.error])}</p>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            data-words-copy
            disabled={!parsed.ok}
            onClick={copyWords}
            className="rounded-[10px] bg-forest px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-graphite disabled:cursor-not-allowed disabled:opacity-40"
          >
            {tr("Copy the words")}
          </button>
          <span role="status" aria-live="polite" data-words-copy-note className="text-sm text-charcoal">
            {copy.state === "done" ? tr("Words copied") : copy.state === "failed" ? tr("Could not copy. Select the words and copy them yourself.") : ""}
          </span>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div>
            <span id={`${id}-language`} className={fieldLabel}>{tr("Words in")}</span>
            <div role="group" aria-labelledby={`${id}-language`} className="mt-2 inline-flex rounded-[10px] bg-fog p-1">
              {(["en", "hi"] as const).map((code) => (
                <button
                  key={code}
                  type="button"
                  lang={code}
                  data-words-language={code}
                  aria-pressed={language === code}
                  onClick={() => setLanguage(code)}
                  className={`rounded-[7px] px-4 py-2 text-sm font-semibold transition ${language === code ? "bg-white text-forest shadow-card" : "text-charcoal hover:text-forest"}`}
                >
                  {code === "en" ? "English" : "हिन्दी"}
                </button>
              ))}
            </div>
          </div>
          {language === "en" && (
            <>
              <div>
                <label className={fieldLabel} htmlFor={`${id}-style`}>{tr("English layout")}</label>
                <select id={`${id}-style`} data-words-style value={style} onChange={(event) => setStyle(event.target.value as EnglishStyle)} className={select}>
                  <option value="cheque">{tr("Cheque style: Rupees … Only")}</option>
                  <option value="suffix">{tr("Plain style: … Rupees Only")}</option>
                </select>
              </div>
              <div>
                <label className={fieldLabel} htmlFor={`${id}-case`}>{tr("Letter case")}</label>
                <select id={`${id}-case`} data-words-case value={letters} onChange={(event) => setLetters(event.target.value as LetterCase)} className={select}>
                  <option value="title">Title Case</option>
                  <option value="upper">UPPER CASE</option>
                </select>
              </div>
            </>
          )}
        </div>

        <div className="mt-6">
          <p id={`${id}-examples`} className={fieldLabel}>{tr("Try an example")}</p>
          <ul className="mt-2 flex flex-wrap gap-2" aria-labelledby={`${id}-examples`}>
            {EXAMPLES.map((example) => (
              <li key={example}>
                <button
                  type="button"
                  data-words-example
                  aria-label={`${tr("Use the example")} ${example}`}
                  onClick={() => setText(example)}
                  className="rounded-[7px] bg-white px-3 py-1.5 text-sm font-semibold text-forest ring-1 ring-forest/15 transition hover:ring-forest/30"
                >
                  {example}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-5 text-sm text-charcoal">{tr("Words are available in English and Hindi.")}</p>
        {language === "hi" && (
          <p className="mt-1 text-sm text-charcoal">{tr("Hindi number names follow Unicode CLDR. A few numbers have more than one accepted spelling.")}</p>
        )}
      </div>
    </div>
  );
}

/** The Google Sheets function from src/lib/words.ts, shown as text with a copy button. English only. */
export function SheetsFunction() {
  const copy = useCopyState();
  const copyCode = async () => {
    copy.show((await writeClipboard(SHEETS_SNIPPET)) ? "done" : "failed");
  };
  return (
    <div>
      <pre
        role="region"
        aria-label={`Apps Script function ${SHEETS_FUNCTION_NAME}`}
        tabIndex={0}
        data-sheets-code
        className="max-h-[28rem] overflow-auto rounded-[12px] bg-fog p-4 text-xs leading-6 text-forest"
      >
        <code>{SHEETS_SNIPPET}</code>
      </pre>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          data-sheets-copy
          onClick={copyCode}
          className="rounded-[10px] bg-white px-4 py-2.5 text-sm font-semibold text-forest ring-1 ring-forest/15 transition hover:ring-forest/30"
        >
          Copy the function
        </button>
        <span role="status" aria-live="polite" data-sheets-copy-note className="text-sm text-charcoal">
          {copy.state === "done" ? "Function copied" : copy.state === "failed" ? "Could not copy. Select the code and copy it yourself." : ""}
        </span>
      </div>
    </div>
  );
}
