export interface CorrectionEntry {
  date: string;
  title: string;
  summary: string;
  hrefs: { href: string; label: string }[];
}

/** Public log of material corrections. Oldest last. */
export const CORRECTIONS: CorrectionEntry[] = [
  {
    date: "2026-08-27",
    title: "PNB and Bank of Baroda daily UPI limits",
    summary:
      "The limits table and the matching article said ₹50,000 per day for Punjab National Bank and Bank of Baroda. Both were corrected to ₹1,00,000 to match the bank pages and NPCI-facing sources used by the limits checker. HDFC and Axis transaction-per-day counts were aligned to 20.",
    hrefs: [
      { href: "/upi-limits/", label: "UPI limits checker" },
      { href: "/blog/upi-transaction-limits-sbi-hdfc-icici/", label: "Bank limits article" },
    ],
  },
  {
    date: "2026-08-27",
    title: "MSMED delayed-payment interest is not a frozen 15%",
    summary:
      "The MSMED calculator and related copy used a hardcoded 15% p.a. The statutory rate is three times the RBI Bank Rate (6.5% × 3 = 19.5% at the last review). The 45-day wording was also corrected so it is not described as a hard cap on every contract.",
    hrefs: [{ href: "/msmed-interest-calculator/", label: "MSMED interest calculator" }],
  },
  {
    date: "2026-08-27",
    title: "Removed unsupported SVG export and “WebAssembly APIs” claims",
    summary:
      "Several pages claimed SVG download and “WebAssembly APIs.” The generators export PNG or PDF through JavaScript. Those sentences were deleted or rewritten.",
    hrefs: [{ href: "/developer/", label: "Developer portal" }],
  },
  {
    date: "2026-08-27",
    title: "Zero MDR qualified; RuPay credit card on UPI separated",
    summary:
      "“0% MDR” was stated without the RuPay credit-card-on-UPI exception. Copy now says bank-to-bank UPI has 0% MDR, and RuPay CC UPI above ₹2,000 may carry interchange per NPCI. Inflated “0.90–1.50%” MDR ranges for that product were replaced with NPCI-facing figures.",
    hrefs: [
      { href: "/upi-calculator/", label: "MDR calculator" },
      { href: "/blog/rupay-credit-card-upi-mdr-charges/", label: "RuPay CC UPI MDR article" },
    ],
  },
  {
    date: "2026-08-27",
    title: "UPI error codes U16, U30, and PIN mapping",
    summary:
      "The resolver’s seven-code list mapped U16 to “bank down,” U30 to a daily limit, and PIN errors to U14. PhonePe, Zerodha’s NPCI list, and Decentro document U16 as NPCI TXNRISK, U30 as remitter debit failed, insufficient funds as Z9, and PIN as ZM. Unsourced U14/Z5 rows were dropped.",
    hrefs: [{ href: "/upi-error-codes/", label: "UPI error code resolver" }],
  },
  {
    date: "2026-08-27",
    title: "Public seed and instant-paid UTR endpoints removed",
    summary:
      "Unauthenticated demo-seed and submit-UTR routes could imply a payment was settled. Customer references now stay pending until the merchant confirms settlement in their own bank records.",
    hrefs: [
      { href: "/privacy/", label: "Privacy policy" },
      { href: "/disclaimer/", label: "Disclaimer" },
    ],
  },
];
