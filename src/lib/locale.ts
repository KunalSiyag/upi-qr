import { routeExistsInLang } from "../data/validRoutes";

export type SiteLang = "en" | "hi" | "ta" | "te" | "mr" | "es" | "pt" | "fr" | "de" | "id";

export const SITE_LANGS: readonly SiteLang[] = [
  "en",
  "hi",
  "ta",
  "te",
  "mr",
  "es",
  "pt",
  "fr",
  "de",
  "id",
];

export function isSiteLang(value: string): value is SiteLang {
  return (SITE_LANGS as readonly string[]).includes(value);
}

export function detectLangFromPath(pathname: string): SiteLang {
  const match = pathname.match(/^\/(hi|ta|te|mr|es|pt|fr|de|id)(?:\/|$)/);
  return match ? (match[1] as SiteLang) : "en";
}

export function localePrefix(lang: SiteLang): string {
  return lang === "en" ? "" : `/${lang}`;
}

export function localeHome(lang: SiteLang): string {
  return lang === "en" ? "/" : `/${lang}/`;
}

/** Locale-prefixed path when the slug exists in that language, otherwise English. */
export function localeHref(lang: SiteLang, slug: string): string {
  const clean = slug.replace(/^\/+|\/+$/g, "");
  if (!clean) return localeHome(lang);
  if (lang !== "en" && routeExistsInLang(clean, lang)) {
    return `/${lang}/${clean}/`;
  }
  return `/${clean}/`;
}
