import { PLANS } from "../lib/workspace/entitlements";

/**
 * What's new on /changelog/, newest first. One entry per month of shipped,
 * user-facing work (taken from the git history); every link must point at a live page.
 */
export interface ChangelogItem {
  text: string;
  href: string;
}

export interface ChangelogEntry {
  month: string;
  /** ISO year-month, for <time datetime>. */
  date: string;
  title: string;
  items: ChangelogItem[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    month: "October 2026",
    date: "2026-10",
    title: "The payment tracker, free accounts and Pro",
    items: [
      { text: "Payment tracker: invoices and monthly fees with overdue ones first, and one-tap WhatsApp or SMS reminders in English or Hindi", href: "/payment-tracker/" },
      { text: "Match bank statement credits to invoices, and turn a recorded payment into a receipt", href: "/payment-tracker/" },
      { text: "Free accounts: sync between phone and laptop, plus pay links your clients can pay from", href: "/pricing/" },
      { text: "Pro: unlimited pay links, client statement links, and MSME mode with 45-day deadlines and Section 16 interest", href: "/pricing/" },
      { text: `Pro: up to ${PLANS.pro.businesses} businesses in one account after the first payment, each with its own UPI ID, invoice numbers and pay links, with a switcher in the tracker`, href: "/pricing/" },
      { text: "New guide: Section 43B(h) and the 45-day MSME payment rule", href: "/blog/section-43b-h-msme-45-day-payment-rule/" },
      { text: "Use Pro UPI QR inside Claude: an MCP server for UPI QR codes, payment links, error codes, GST and MSMED interest", href: "/mcp-server/" },
    ],
  },
  {
    month: "September 2026",
    date: "2026-09",
    title: "GST 2.0, contracts and your language",
    items: [
      { text: "GST calculator with GST 2.0 rates and an itemised split", href: "/gst-calculator/" },
      { text: "Influencer and freelance contract generators", href: "/freelance-contract-generator/" },
      { text: "Tool screens in Hindi, Tamil, Telugu and Marathi", href: "/hi/" },
      { text: "Buying guides for UPI standees, stickers and thermal printers", href: "/products/" },
      { text: "A reviews page with our Product Hunt ratings", href: "/reviews/" },
    ],
  },
  {
    month: "August 2026",
    date: "2026-08",
    title: "Tools for MSMEs",
    items: [
      { text: "MSMED Act interest calculator for late B2B payments", href: "/msmed-interest-calculator/" },
      { text: "TReDS invoice discounting calculator", href: "/treds-calculator/" },
      { text: "Proforma invoice and credit note generators", href: "/proforma-invoice-generator/" },
      { text: "Split bill, cash denomination, EMI, gratuity and SIP calculators, and salary slips", href: "/business-calculators/" },
      { text: "A UPI checkout API for developers", href: "/developer/" },
    ],
  },
  {
    month: "July 2026",
    date: "2026-07",
    title: "From one QR to a toolkit",
    items: [
      { text: "Dynamic QR codes you can point somewhere new, with scan counts", href: "/dynamic-qr-generator/" },
      { text: "Bulk QR codes from a CSV, and A4 sticker sheets", href: "/bulk-qr/" },
      { text: "Offer posters, WhatsApp order links, menu QR codes and digital visiting cards", href: "/offer-poster-generator/" },
      { text: "UPI limits checker, plus GST, margin and MDR calculators", href: "/upi-limits/" },
      { text: "Pages in Tamil, Telugu and Marathi", href: "/ta/" },
    ],
  },
  {
    month: "June 2026",
    date: "2026-06",
    title: "The UPI QR generator",
    items: [
      { text: "One standard UPI QR that works with every UPI app, with printable posters and standees", href: "/" },
    ],
  },
];
