import { useCallback, useState } from "react";
import type { DocLang } from "../data/documentLang";
import { t } from "../data/phrases";

export function useToolLang(initial: DocLang = "en") {
  const [lang, setLang] = useState<DocLang>(initial);
  const tr = useCallback((english: string) => t(lang, english), [lang]);
  return { lang, setLang, tr };
}
