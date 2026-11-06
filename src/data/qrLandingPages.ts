/**
 * Review date and sources shared by the two intent landing pages
 * (/upi-id-to-qr-code-generator/ and /payment-qr-code-generator/). Bump
 * QR_LANDING_REVIEWED_ON whenever the facts on either page are re-read against the sources.
 */
export const QR_LANDING_REVIEWED_ON = "2026-11-01";

export interface LandingSource {
  label: string;
  href: string;
  /** What the page takes from it, in one line. */
  used: string;
}

/** Public NPCI documents the landing pages rely on. Both are read as documents; no NPCI web page is quoted. */
export const NPCI_LINKING_SPEC: LandingSource = {
  label: "NPCI, UPI Linking Specifications 1.6 (Draft), November 2017",
  href: "https://www.npci.org.in/sites/default/files/UPI%20Linking%20Specs_ver%201.6.pdf",
  used: "the upi://pay link fields (pa, pn, am, tn, cu), static and dynamic codes, and the rule that UPI apps listen for these links",
};

export const NPCI_BRAND_GUIDELINES: LandingSource = {
  label: "NPCI, BHIM UPI Guidelines (updated 4 June 2026)",
  href: "https://www.npci.org.in/uploads/BHIM_UPI_Guidelines_2026_012a0b1bce.pdf",
  used: "what a UPI ID is, how apps show it, and the layouts for partner-issued merchant and soundbox QR stickers",
};

export interface LandingRelated {
  href: string;
  name: string;
  note: string;
}

export interface LandingFaq {
  question: string;
  answer: string;
  /** An optional pointer shown under the answer. It is not part of the FAQPage markup. */
  more?: { href: string; label: string };
}

/** "1 November 2026", the way the rest of the site prints a review date. */
export function reviewedLabel(iso: string = QR_LANDING_REVIEWED_ON): string {
  return new Date(`${iso}T00:00:00+05:30`).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Kolkata" });
}
