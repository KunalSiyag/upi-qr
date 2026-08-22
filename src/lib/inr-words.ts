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
