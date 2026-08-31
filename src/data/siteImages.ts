export type ImageMime = "image/jpeg" | "image/png" | "image/webp";

export interface SiteImage {
  id: string;
  src: string;
  width: number;
  height: number;
  mime: ImageMime;
  alt: string;
  caption: string;
  title: string;
}

function jpeg(
  id: string,
  file: string,
  alt: string,
  caption: string,
  title: string
): SiteImage {
  return {
    id,
    src: `/images/blog/${file}.jpg`,
    width: 1200,
    height: 630,
    mime: "image/jpeg",
    alt,
    caption,
    title,
  };
}

function png(
  id: string,
  src: string,
  alt: string,
  caption: string,
  title: string
): SiteImage {
  return {
    id,
    src,
    width: 1200,
    height: 630,
    mime: "image/png",
    alt,
    caption,
    title,
  };
}

export const SITE_IMAGES: SiteImage[] = [
  {
    id: "og-image",
    src: "/images/og-image.jpg",
    width: 1200,
    height: 630,
    mime: "image/jpeg",
    alt: "Kirana billing counter with a SCAN TO PAY UPI QR standee",
    caption:
      "A printed UPI standee on an Indian shop counter. Generate one in the browser and print at 300 DPI on matte stock.",
    title: "Pro UPI QR — free UPI QR code generator",
  },
  jpeg(
    "kirana-upi-standee",
    "kirana-upi-standee",
    "Acrylic SCAN TO PAY QR standee on a kirana grocery counter with spice jars and a cash drawer",
    "Counter scans fail from glare and tiny modules, not from the UPI app. Print a matte standee large enough to read from arm’s length.",
    "UPI QR standee on a kirana counter"
  ),
  jpeg(
    "phonepe-business-qr-activation",
    "phonepe-business-qr-activation",
    "Acrylic UPI scan-to-pay standee on an Indian kirana billing counter",
    "A printed standee at the billing desk. Customers can scan it from PhonePe or any other UPI app if the VPA is valid.",
    "PhonePe-compatible UPI QR standee"
  ),
  jpeg(
    "phonepe-virtual-qr-on-phone",
    "phonepe-virtual-qr-on-phone",
    "Shopkeeper holding a phone that displays a generic collect QR at a kirana counter",
    "Show the in-app QR on day one; print a matte standee so customers are not waiting on your screen.",
    "Virtual UPI collect QR on a phone"
  ),
  jpeg(
    "google-pay-merchant-phone",
    "google-pay-merchant-phone",
    "Shopkeeper showing a collect QR on a phone next to a printed SCAN AND PAY card",
    "Google Pay for Business gives an official merchant QR after KYC. A compatible print from this site encodes the same VPA and is not an official Google kit.",
    "Merchant collect QR on a phone"
  ),
  jpeg(
    "bhim-navy-upi-poster",
    "bhim-navy-upi-poster",
    "Navy SCAN TO PAY UPI poster taped to a neighbourhood shop wall beside a steel shutter",
    "BHIM’s QR is a standard upi://pay code. A compatible print from the same VPA works in BHIM, PhonePe, GPay, and other member apps.",
    "BHIM-compatible UPI poster on a shop wall"
  ),
  jpeg(
    "bank-account-upi-qr-desk",
    "bank-account-upi-qr-desk",
    "Savings passbook, cheque leaf, and a SCAN TO PAY UPI QR card on a wooden desk",
    "A universal UPI QR encodes your VPA, not the 11-digit IFSC. Any member app can credit the linked bank account.",
    "UPI QR next to a bank passbook"
  ),
  jpeg(
    "universal-qr-wifi-vcard",
    "universal-qr-wifi-vcard",
    "Three printed cards labelled URL, WIFI, and VCARD on a cafe table beside a laptop",
    "The universal generator is for non-payment codes: links, Wi-Fi, vCard, text. Payment posters belong on the homepage UPI tool.",
    "URL, Wi-Fi, and vCard QR cards"
  ),
  jpeg(
    "upi-payment-failed-phone",
    "upi-payment-failed-phone",
    "Hands holding a phone that shows Payment failed and reason code U16 over an open cash drawer",
    "“NPCI returned error” is a wrapper. Open the transaction, copy the exact code such as U16, and look it up before you retry.",
    "UPI payment failed with code U16"
  ),
  jpeg(
    "whatsapp-upi-payment-share",
    "whatsapp-upi-payment-share",
    "Phone showing a chat with a Scan to pay QR beside a printed payment card on a wooden table",
    "Share the PNG, not the raw upi://pay string, so the customer can scan from the chat image.",
    "WhatsApp payment QR on a phone"
  ),
  jpeg(
    "temple-donation-upi-box",
    "temple-donation-upi-box",
    "Wooden donation box with a taped UPI QR card on a temple desk next to brass lamps",
    "Bank-to-bank UPI donations settle to the trust VPA with 0% MDR. RuPay credit-card UPI above ₹2,000 may carry interchange.",
    "Temple donation box with UPI QR"
  ),
  jpeg(
    "freelancer-invoice-laptop-qr",
    "freelancer-invoice-laptop-qr",
    "Laptop on a desk showing an invoice layout with a UPI QR beside a notebook and chai",
    "Embed a static or amount-locked UPI QR on the invoice PDF so clients can pay without copying account numbers.",
    "Freelance invoice with UPI QR"
  ),
  jpeg(
    "restaurant-table-tent-qr",
    "restaurant-table-tent-qr",
    "Folded SCAN TO PAY table tent on a marble cafe table with a steel tumbler of chai",
    "Table tents can use a smaller QR (about 1.5–2 in) because the customer sits close. Use matte card stock to cut glare.",
    "Restaurant table tent UPI QR"
  ),
  jpeg(
    "html-website-upi-qr",
    "html-website-upi-qr",
    "Laptop showing a simple Pay by UPI webpage with a QR beside a code editor",
    "A static HTML page can render an upi://pay QR in the browser. That is not a payment gateway and does not store PANs or PINs.",
    "HTML page with a UPI QR"
  ),
  jpeg(
    "international-upi-travel",
    "international-upi-travel",
    "Traveller at an airport cafe scanning a printed UPI QR standee with a phone",
    "UPI International is bank- and corridor-specific. Confirm the current NPCI country list inside your app before you promise inbound scans.",
    "Traveller scanning a UPI QR"
  ),
  jpeg(
    "pending-upi-sms-phone",
    "pending-upi-sms-phone",
    "Two phones on a shop counter, one showing a debit SMS and a pending overlay",
    "If the bank SMS says debited and the app says Pending, do not pay again. Copy the 12-digit UTR and wait for T+1 / T+5 TAT.",
    "Pending UPI debit on a shop counter"
  ),
  jpeg(
    "qr-tampering-overlay-sticker",
    "qr-tampering-overlay-sticker",
    "Acrylic SCAN TO PAY standee with a smaller overlay sticker covering the original QR",
    "Run a finger over the QR each morning. Overlay stickers are the common physical-tampering fraud at busy counters.",
    "UPI QR overlay tampering on a standee"
  ),
  jpeg(
    "print-upi-qr-sizes",
    "print-upi-qr-sizes",
    "Print-shop counter with QR table tents, posters, and an A4 sticker sheet",
    "Match physical size to scan distance. A 5-foot counter needs about a 5 cm QR, printed at 300 DPI.",
    "Printed UPI QR sizes on a counter"
  ),
  jpeg(
    "upi-qr-sticker-sheet",
    "upi-qr-sticker-sheet",
    "Shopkeeper peeling a matte SCAN TO PAY QR sticker from an A4 sheet",
    "A4 sheets print 4, 6, or 12 stickers. Matte vinyl beats gloss on glass counters.",
    "A4 UPI QR sticker sheet"
  ),
  jpeg(
    "upi-soundbox-tea-stall",
    "upi-soundbox-tea-stall",
    "Tea stall counter with a QR card and a small speaker",
    "A rented soundbox is optional. PhonePe and GPay Business apps can speak alerts on the phone.",
    "UPI QR and speaker at a tea stall"
  ),
  png(
    "print-size-chart",
    "/images/diagrams/print-size-chart.png",
    "Table of UPI QR minimum and recommended print sizes from handheld to A4",
    "NPCI does not mandate one global print size. Use scan distance ÷ 10 as the minimum QR width in inches.",
    "UPI QR print size chart"
  ),
  png(
    "upi-pay-uri-anatomy",
    "/images/diagrams/upi-pay-uri-anatomy.png",
    "Diagram of upi://pay fields pa, pn, am, cu, and tn next to a demo QR",
    "Demo payload only. pa is the VPA, pn the display name, am an optional amount, cu is INR, tn an optional note.",
    "upi://pay URI field diagram"
  ),
  png(
    "scan-distance-chart",
    "/images/diagrams/scan-distance-chart.png",
    "Three panels showing QR size needed at 1 ft, 3 ft, and 5 ft scan distance",
    "Proof-scan from 1 ft, 3 ft, and 5 ft with PhonePe and Google Pay before you laminate.",
    "UPI QR scan-distance test"
  ),
  png(
    "png-vs-pdf-print",
    "/images/diagrams/png-vs-pdf-print.png",
    "Side-by-side comparison of PNG for inkjet and PDF as a print-shop master",
    "PDF keeps page size. PNG is fine for WhatsApp and home printers. Neither is SVG or WebAssembly.",
    "PNG vs PDF for UPI QR printing"
  ),
  png(
    "phonepe-gpay-paytm-compare",
    "/images/diagrams/phonepe-gpay-paytm-compare.png",
    "Comparison table of PhonePe, Google Pay, Paytm, and a compatible print for shop QR extras",
    "UPI is interoperable. Apps compete on merchant extras. Bank-to-bank UPI is 0% MDR; RuPay CC UPI above ₹2,000 may carry interchange.",
    "PhonePe vs GPay vs Paytm shop QR extras"
  ),
  png(
    "static-vs-dynamic-qr",
    "/images/diagrams/static-vs-dynamic-qr.png",
    "Two cards explaining static reusable UPI QR versus dynamic per-bill payloads",
    "Static prints encode a VPA. Dynamic codes change amount or destination per bill and need a live mapping.",
    "Static vs dynamic UPI QR"
  ),
  png(
    "sticker-sheet-layouts",
    "/images/diagrams/sticker-sheet-layouts.png",
    "A4 sticker sheet layouts for 4-up, 6-up, and 12-up UPI QR stickers",
    "Generate 4, 6, or 12 stickers per A4 sheet. Leave a quiet zone inside each sticker.",
    "A4 UPI QR sticker layouts"
  ),
  png(
    "print-formats-overview",
    "/images/diagrams/print-formats-overview.png",
    "Grid of printable UPI QR formats: A4, A5, 5×7, table tent, counter card, sticker sheet",
    "Pick a paper size before you send the file to a print shop. All formats use the same upi://pay payload.",
    "Printable UPI QR format overview"
  ),
  png(
    "format-a4-standee",
    "/images/print-formats/a4-standee.png",
    "A4 UPI standee mockup labelled 210 × 297 mm with a 3–4 inch QR",
    "A4 is the default acrylic T-stand insert and donation poster. Print at 300 DPI, matte laminate.",
    "A4 UPI QR standee"
  ),
  png(
    "format-a5-counter-card",
    "/images/print-formats/a5-counter-card.png",
    "A5 UPI counter card mockup labelled 148 × 210 mm with a 2–2.5 inch QR",
    "A5 fits many billing-desk acrylic holders.",
    "A5 UPI QR counter card"
  ),
  png(
    "format-five-by-seven",
    "/images/print-formats/five-by-seven.png",
    "5 × 7 inch UPI insert mockup with a 2–2.5 inch QR",
    "Common photo-frame and acrylic-standee insert size. Add a 3 mm bleed if the shop trims.",
    "5×7 inch UPI QR insert"
  ),
  png(
    "format-table-tent",
    "/images/print-formats/table-tent.png",
    "Folded table-tent mockup for cafe UPI payments with a 1.5–2 inch QR",
    "Two-sided tent, roughly A6 / 4×6 in. Matte card stock so ceiling lights do not glare.",
    "UPI QR table tent"
  ),
  png(
    "format-counter-card",
    "/images/print-formats/counter-card.png",
    "Compact UPI counter card mockup for freelancer and cab dashboards",
    "Keep contrast high and the payee name short so it stays readable at 90 mm wide.",
    "UPI QR counter card"
  ),
  png(
    "format-sticker-sheet",
    "/images/print-formats/sticker-sheet.png",
    "A4 sticker-sheet mockup for 4, 6, or 12 UPI QR stickers",
    "Cut or kiss-cut on matte vinyl. Generate the sheet at /qr-sticker-generator/.",
    "A4 UPI QR sticker sheet layout"
  ),
];

const BY_SRC = new Map(SITE_IMAGES.map((image) => [image.src, image]));
const BY_ID = new Map(SITE_IMAGES.map((image) => [image.id, image]));

export function siteImage(id: string): SiteImage {
  const image = BY_ID.get(id);
  if (!image) throw new Error(`Unknown site image id: ${id}`);
  return image;
}

export function resolveSiteImage(src: string | undefined | null): SiteImage | undefined {
  if (!src) return undefined;
  const path = src.startsWith("http") ? new URL(src).pathname : src;
  return BY_SRC.get(path);
}

export function stemFromSrc(src: string): string {
  return src.replace(/\.(jpg|jpeg|png|webp|avif)$/i, "");
}

export function ogMimeFromSrc(src: string): ImageMime {
  const lower = src.split("?")[0].toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/png";
}

export const DEFAULT_OG_IMAGE = siteImage("og-image");

const PATH_IMAGE_IDS: Record<string, string[]> = {
  "/": ["og-image", "kirana-upi-standee", "print-formats-overview"],
  "/hi/": ["og-image", "kirana-upi-standee"],
  "/print-templates/": [
    "print-formats-overview",
    "format-a4-standee",
    "format-a5-counter-card",
    "format-five-by-seven",
    "format-table-tent",
    "format-counter-card",
    "format-sticker-sheet",
    "print-size-chart",
    "sticker-sheet-layouts",
  ],
  "/print-upi-qr/": ["print-formats-overview", "print-size-chart", "kirana-upi-standee"],
  "/upi-error-codes/": ["upi-payment-failed-phone"],
  "/upi-errors-and-limits/": ["upi-payment-failed-phone"],
  "/universal-qr-generator/": ["universal-qr-wifi-vcard"],
  "/google-pay-qr-generator/": ["google-pay-merchant-phone"],
  "/phonepe-qr-generator/": ["phonepe-business-qr-activation"],
  "/bhim-qr-generator/": ["bhim-navy-upi-poster"],
  "/sbi-qr-generator/": ["bank-account-upi-qr-desk"],
  "/donation-qr-generator/": ["temple-donation-upi-box"],
  "/whatsapp-pay-qr-generator/": ["whatsapp-upi-payment-share"],
  "/qr-sticker-generator/": ["upi-qr-sticker-sheet", "sticker-sheet-layouts"],
  "/phonepe-vs-paytm-vs-gpay/": ["phonepe-gpay-paytm-compare"],
  "/dynamic-qr-generator/": ["static-vs-dynamic-qr"],
};

export function imagesForPath(path: string): SiteImage[] {
  const normalised = path.endsWith("/") ? path : `${path}/`;
  const ids = PATH_IMAGE_IDS[normalised] ?? [];
  return ids.map((id) => siteImage(id));
}

export function ogImageForPath(path: string): SiteImage {
  return imagesForPath(path)[0] ?? DEFAULT_OG_IMAGE;
}

export const PRINT_TEMPLATES = [
  {
    id: "a4",
    imageId: "format-a4-standee",
    name: "A4 standee",
    size: "210 × 297 mm",
    qr: "3–4 in QR",
    dpi: "300 DPI",
    bestFor: "Acrylic T-stands, donation posters, door signs.",
    href: "/",
    cta: "Open standee generator",
  },
  {
    id: "a5",
    imageId: "format-a5-counter-card",
    name: "A5 counter card",
    size: "148 × 210 mm",
    qr: "2–2.5 in QR",
    dpi: "300 DPI",
    bestFor: "Billing desks and smaller acrylic holders.",
    href: "/",
    cta: "Open standee generator",
  },
  {
    id: "five-seven",
    imageId: "format-five-by-seven",
    name: "5 × 7 inch insert",
    size: "127 × 178 mm",
    qr: "2–2.5 in QR",
    dpi: "300 DPI",
    bestFor: "Photo-frame and ready-made acrylic inserts.",
    href: "/",
    cta: "Open standee generator",
  },
  {
    id: "table-tent",
    imageId: "format-table-tent",
    name: "Table tent",
    size: "Folded ~A6 / 4 × 6 in",
    qr: "1.5–2 in QR",
    dpi: "300 DPI, matte card",
    bestFor: "Cafe and restaurant tables.",
    href: "/restaurant-qr-generator/",
    cta: "Open restaurant QR",
  },
  {
    id: "counter-card",
    imageId: "format-counter-card",
    name: "Counter / visiting card",
    size: "Compact card + QR panel",
    qr: "2 cm+",
    dpi: "300 DPI",
    bestFor: "Freelancers, cab dashboards, handheld cards.",
    href: "/freelance-qr-generator/",
    cta: "Open freelancer QR",
  },
  {
    id: "sticker-sheet",
    imageId: "format-sticker-sheet",
    name: "A4 sticker sheet",
    size: "210 × 297 mm · 4 / 6 / 12 up",
    qr: "2.5–3 cm each",
    dpi: "300 DPI, matte vinyl",
    bestFor: "Glass counters, packing, staff badges.",
    href: "/qr-sticker-generator/",
    cta: "Open sticker sheet tool",
  },
] as const;
