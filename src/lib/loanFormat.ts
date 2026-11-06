// Display helpers shared by the loan calculators. No imports, so they stay Node-importable.

const nf = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** Paise → "₹1,23,456" (whole rupees, Indian grouping). */
export const rupees = (paise: number): string => `₹${nf.format(Math.round(paise / 100))}`;

/** "₹46.09 lakh" for large amounts, so a long run of digits is easy to read back. Null below ₹1 lakh. */
export function compact(paise: number, tr: (s: string) => string): string | null {
  const r = paise / 100;
  const trim = (n: number) => n.toFixed(2).replace(/\.?0+$/, "");
  if (r >= 1e7) return `₹${trim(r / 1e7)} ${tr("crore")}`;
  if (r >= 1e5) return `₹${trim(r / 1e5)} ${tr("lakh")}`;
  return null;
}

/** Fills {name} slots in a translated sentence, so each language keeps its own word order. */
export function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in values ? values[key] : whole));
}

/** "11 years 5 months", through the island's translator for the unit words. */
export function duration(months: number, tr: (s: string) => string): string {
  const y = Math.floor(months / 12);
  const m = months % 12;
  const parts: string[] = [];
  if (y > 0) parts.push(`${y} ${y === 1 ? tr("year") : tr("years")}`);
  if (m > 0) parts.push(`${m} ${m === 1 ? tr("month") : tr("months")}`);
  return parts.join(" ") || `0 ${tr("months")}`;
}
