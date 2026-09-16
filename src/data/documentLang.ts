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

export function formatMoneyInr(value: number, lang: DocLang) {
  return `₹${new Intl.NumberFormat(DOC_DATE_LOCALE[lang], { maximumFractionDigits: 0 }).format(value || 0)}`;
}
