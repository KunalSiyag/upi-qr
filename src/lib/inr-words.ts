import { displayCurrency, type DocLang } from "../data/documentLang";

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigitWords(n: number): string {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? " " + ONES[n % 10] : ""}`;
}

function threeDigitWords(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  return [hundreds ? `${ONES[hundreds]} Hundred` : "", rest ? twoDigitWords(rest) : ""].filter(Boolean).join(" ");
}

export function amountInWordsInr(value: number): string {
  let safe = Math.max(0, Math.floor(value));
  if (safe === 0) return "Zero Rupees Only";
  const crore = Math.floor(safe / 10000000); safe %= 10000000;
  const lakh = Math.floor(safe / 100000); safe %= 100000;
  const thousand = Math.floor(safe / 1000); safe %= 1000;
  const parts = [
    crore ? `${twoDigitWords(crore)} Crore` : "",
    lakh ? `${twoDigitWords(lakh)} Lakh` : "",
    thousand ? `${twoDigitWords(thousand)} Thousand` : "",
    safe ? threeDigitWords(safe) : ""
  ].filter(Boolean).join(" ");
  return `${parts} Rupees Only`;
}

function amountInWordsInternational(value: number, majorWord: string): string {
  let safe = Math.max(0, Math.floor(value));
  if (safe === 0) return `Zero ${majorWord} Only`;
  const billion = Math.floor(safe / 1_000_000_000); safe %= 1_000_000_000;
  const million = Math.floor(safe / 1_000_000); safe %= 1_000_000;
  const thousand = Math.floor(safe / 1000); safe %= 1000;
  const parts = [
    billion ? `${threeDigitWords(billion)} Billion` : "",
    million ? `${threeDigitWords(million)} Million` : "",
    thousand ? `${threeDigitWords(thousand)} Thousand` : "",
    safe ? threeDigitWords(safe) : ""
  ].filter(Boolean).join(" ");
  return `${parts} ${majorWord} Only`;
}

export function amountInWords(value: number, lang: DocLang = "en"): string {
  const { code, majorWord } = displayCurrency(lang);
  if (code === "INR") return amountInWordsInr(value);
  return amountInWordsInternational(value, majorWord);
}
