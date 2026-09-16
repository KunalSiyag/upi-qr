import type { SiteLang } from "../lib/locale";

export type DocLang = SiteLang;

export const DOC_LANG_OPTIONS: { id: DocLang; label: string }[] = [
  { id: "en", label: "English" },
  { id: "hi", label: "हिन्दी" },
  { id: "ta", label: "தமிழ்" },
  { id: "te", label: "తెలుగు" },
  { id: "mr", label: "मराठी" },
  { id: "es", label: "Español" },
  { id: "pt", label: "Português" },
  { id: "fr", label: "Français" },
  { id: "de", label: "Deutsch" },
  { id: "id", label: "Indonesia" },
  { id: "ar", label: "العربية" },
  { id: "it", label: "Italiano" },
  { id: "ja", label: "日本語" },
  { id: "zh", label: "中文" },
];

export const DOC_DATE_LOCALE: Record<DocLang, string> = {
  en: "en-IN",
  hi: "hi-IN",
  ta: "ta-IN",
  te: "te-IN",
  mr: "mr-IN",
  es: "es-ES",
  pt: "pt-BR",
  fr: "fr-FR",
  de: "de-DE",
  id: "id-ID",
  ar: "ar-AE",
  it: "it-IT",
  ja: "ja-JP",
  zh: "zh-CN",
};

export function isDocLang(value: string): value is DocLang {
  return DOC_LANG_OPTIONS.some((option) => option.id === value);
}

export function swapIfDefault(current: string, defaults: readonly string[], next: string): string {
  const trimmed = current.trim();
  if (!trimmed) return next;
  return defaults.some((item) => item.trim() === trimmed) ? next : current;
}

export function collectStrings<T extends Record<string, unknown>>(
  copies: Record<DocLang, T>,
  field: keyof T
): string[] {
  return (Object.values(copies) as T[]).map((copy) => String(copy[field] ?? ""));
}

export type DisplayCurrency = {
  code: string;
  symbol: string;
  locale: string;
  majorWord: string;
};

/** Display currency follows the page language. UPI payloads stay INR. */
export const LANG_CURRENCY: Record<DocLang, DisplayCurrency> = {
  en: { code: "INR", symbol: "₹", locale: "en-IN", majorWord: "Rupees" },
  hi: { code: "INR", symbol: "₹", locale: "hi-IN", majorWord: "Rupees" },
  ta: { code: "INR", symbol: "₹", locale: "ta-IN", majorWord: "Rupees" },
  te: { code: "INR", symbol: "₹", locale: "te-IN", majorWord: "Rupees" },
  mr: { code: "INR", symbol: "₹", locale: "mr-IN", majorWord: "Rupees" },
  es: { code: "EUR", symbol: "€", locale: "es-ES", majorWord: "Euros" },
  pt: { code: "BRL", symbol: "R$", locale: "pt-BR", majorWord: "Reais" },
  fr: { code: "EUR", symbol: "€", locale: "fr-FR", majorWord: "Euros" },
  de: { code: "EUR", symbol: "€", locale: "de-DE", majorWord: "Euros" },
  id: { code: "IDR", symbol: "Rp", locale: "id-ID", majorWord: "Rupiah" },
  ar: { code: "AED", symbol: "د.إ", locale: "ar-AE", majorWord: "Dirhams" },
  it: { code: "EUR", symbol: "€", locale: "it-IT", majorWord: "Euros" },
  ja: { code: "JPY", symbol: "¥", locale: "ja-JP", majorWord: "Yen" },
  zh: { code: "CNY", symbol: "¥", locale: "zh-CN", majorWord: "Yuan" },
};

export function displayCurrency(lang: DocLang): DisplayCurrency {
  return LANG_CURRENCY[lang] ?? LANG_CURRENCY.en;
}

export function moneySymbol(lang: DocLang): string {
  return displayCurrency(lang).symbol;
}

export function formatMoney(value: number, lang: DocLang, maximumFractionDigits = 0) {
  const { code, locale } = displayCurrency(lang);
  const digits = code === "JPY" ? 0 : maximumFractionDigits;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: code,
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  }).format(value || 0);
}

/** @deprecated Use formatMoney — display currency follows page language. */
export function formatMoneyInr(value: number, lang: DocLang) {
  return formatMoney(value, lang, 0);
}

export function withCurrency(text: string, lang: DocLang): string {
  const symbol = moneySymbol(lang);
  return symbol === "₹" ? text : text.replaceAll("₹", symbol);
}

export function withCurrencyDeep<T>(value: T, lang: DocLang): T {
  const symbol = moneySymbol(lang);
  if (symbol === "₹") return value;
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return v.replaceAll("₹", symbol);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = walk(val);
      return out;
    }
    return v;
  };
  return walk(value) as T;
}

export function defaultInvoiceTemplateId(lang: DocLang): string {
  switch (lang) {
    case "es":
    case "fr":
    case "de":
    case "it":
      return "eu-vat";
    case "pt":
      return "br-nf";
    case "ar":
      return "ae-vat";
    case "id":
      return "id-ppn";
    case "ja":
      return "jp-tax";
    case "zh":
      return "cn-vat";
    default:
      return "in-gst";
  }
}
