import { createContext, useContext } from "react";
import { WS_HI } from "../../data/workspacePhrases";

/**
 * Workspace UI language. Strings are written in English inside components and
 * wrapped in tr("…"); WS_HI maps the exact English text to Hindi. Unknown
 * strings fall back to English, so a missing translation never breaks the UI.
 * Placeholders use {name} and are filled from the vars object.
 */
export type WsLang = "en" | "hi";
export type Tr = (english: string, vars?: Record<string, string | number>) => string;

export const WS_LANG_KEY = "proupiqr-workspace-lang";

export function makeTr(lang: WsLang): Tr {
  return (english, vars) => {
    const raw = lang === "hi" ? WS_HI[english] ?? english : english;
    return vars ? raw.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match)) : raw;
  };
}

interface WsLangValue {
  lang: WsLang;
  tr: Tr;
  /** For toLocaleDateString / toLocaleString. */
  dateLocale: string;
  setLang: (lang: WsLang) => void;
}

const WsLangContext = createContext<WsLangValue>({ lang: "en", tr: makeTr("en"), dateLocale: "en-IN", setLang: () => {} });
export const WsLangProvider = WsLangContext.Provider;
export const useWs = () => useContext(WsLangContext);

/** ?lang= wins (links from Hindi pages), then the saved choice, then the browser language. */
export function initialWsLang(): WsLang {
  try {
    const param = new URLSearchParams(location.search).get("lang");
    if (param === "hi" || param === "en") {
      localStorage.setItem(WS_LANG_KEY, param);
      return param;
    }
    const saved = localStorage.getItem(WS_LANG_KEY);
    if (saved === "hi" || saved === "en") return saved;
  } catch {
    // Storage blocked: fall through to the browser language.
  }
  return typeof navigator !== "undefined" && /^hi\b/i.test(navigator.language) ? "hi" : "en";
}

export function LangToggle() {
  const { lang, setLang } = useWs();
  return (
    <div className="inline-flex rounded-[10px] bg-white p-0.5 text-xs font-medium ring-1 ring-inset ring-hairline" role="group" aria-label="App language / ऐप की भाषा">
      {(["en", "hi"] as WsLang[]).map((l) => (
        <button key={l} type="button" lang={l} onClick={() => setLang(l)} aria-pressed={lang === l}
          className={`rounded-[8px] px-2.5 py-1.5 transition-colors duration-150 ${lang === l ? "bg-graphite text-white" : "text-charcoal hover:text-ink"}`}>
          {l === "en" ? "EN" : "हिं"}
        </button>
      ))}
    </div>
  );
}
