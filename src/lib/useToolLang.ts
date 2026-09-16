import { useCallback } from "react";
import { formatMoney, moneySymbol, type DocLang } from "../data/documentLang";
import { t } from "../data/phrases";

export function useToolLang(lang: DocLang = "en") {
  const tr = useCallback((english: string) => t(lang, english), [lang]);
  const symbol = moneySymbol(lang);
  const money = useCallback(
    (value: number, digits = 0) => formatMoney(value, lang, digits),
    [lang]
  );
  return { lang, tr, symbol, money };
}
