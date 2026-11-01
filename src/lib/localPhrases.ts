export type RegionalLang = "hi" | "ta" | "te" | "mr";
export type PhraseTable = Record<string, Record<RegionalLang, string>>;

/**
 * English text in, the page language out, from one tool's own table. A tool keeps its copy in its own data file rather
 * than in phrases.ts, because phrases.ts is one chunk that every tool page loads. Other languages show the English text.
 */
export function localTranslator(lang: string, table: PhraseTable): (english: string) => string {
  const regional: RegionalLang | null = lang === "hi" || lang === "ta" || lang === "te" || lang === "mr" ? lang : null;
  return (english) => (regional !== null && Object.prototype.hasOwnProperty.call(table, english) ? table[english][regional] : english);
}
