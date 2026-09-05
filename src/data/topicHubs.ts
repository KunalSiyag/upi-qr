import {
  generators,
  generatorFamily,
  getRelatedGenerators,
  type GeneratorLink,
  type GeneratorSlug,
  type PresetType,
} from "./internalLinks";

export type TopicHubId =
  | "upi-qr-generators"
  | "merchant-setup"
  | "print-upi-qr"
  | "upi-errors-and-limits"
  | "merchant-documents"
  | "business-calculators";

export interface TopicTool {
  href: string;
  name: string;
  description: string;
}

export interface TopicGroup {
  heading: string;
  tools: TopicTool[];
}

export interface TopicFaq {
  question: string;
  answer: string;
}

export interface TopicHub {
  id: TopicHubId;
  path: string;
  title: string;
  description: string;
  h1: string;
  intro: string;
  eyebrow: string;
  shortName: string;
  blurb: string;
  hiName: string;
  hiBlurb: string;
  groups: TopicGroup[];
  articleSlugs: string[];
  relatedHubIds: TopicHubId[];
  faqs: TopicFaq[];
}

export interface NavHub {
  id: string;
  path: string;
  shortName: string;
  blurb: string;
  hiName: string;
  hiBlurb: string;
}

export const FEATURED_GUIDE_SLUGS = [
  "phonepe-business-qr-code-activation",
  "how-to-print-gpay-qr-code-step-by-step",
  "how-to-create-print-upi-qr-code-standee",
  "how-to-resolve-upi-pending-transaction-issues",
  "create-upi-qr-code-for-bank-account",
  "printable-upi-qr-sticker-sheet-guide",
] as const;

const WEAK_TAGS = new Set([
  "Tutorial",
  "Merchant Tips",
  "Reference",
  "Guide",
  "Payments",
  "Business",
  "Retail",
]);

const APP_PRESETS = new Set<PresetType>(["phonepe", "gpay", "paytm", "bhim", "whatsapp", "amazon"]);
const BANK_PRESETS = new Set<PresetType>([
  "sbi",
  "hdfc",
  "icici",
  "axis",
  "kotak",
  "pnb",
  "canara",
  "bob",
  "indusind",
  "union",
  "idfc",
  "idbi",
  "yes",
  "rbl",
  "central",
]);
const BUSINESS_SLUGS = new Set<GeneratorSlug>([
  "sbi-business-qr-code-generator",
  "hdfc-business-qr-code-generator",
  "icici-business-qr-code-generator",
]);

function genTool(generator: GeneratorLink): TopicTool {
  return {
    href: `/${generator.slug}/`,
    name: generator.label,
    description: generator.description,
  };
}

const paymentAppTools = generators
  .filter((generator) => APP_PRESETS.has(generator.presetType))
  .map(genTool);

const personalBankTools = generators
  .filter(
    (generator) =>
      BANK_PRESETS.has(generator.presetType) && !BUSINESS_SLUGS.has(generator.slug)
  )
  .map(genTool);

const businessBankTools = generators.filter((generator) => BUSINESS_SLUGS.has(generator.slug)).map(genTool);

const shopTools = generators
  .filter(
    (generator) =>
      !APP_PRESETS.has(generator.presetType) && !BANK_PRESETS.has(generator.presetType)
  )
  .map(genTool);

export const TOPIC_HUBS: TopicHub[] = [
  {
    id: "upi-qr-generators",
    path: "/upi-qr-generators/",
    title: "UPI QR Generators for Every App and Bank | Pro UPI QR",
    description:
      "Browse PhonePe, GPay, Paytm, BHIM, bank, and shop UPI QR generators plus bulk, sticker, and universal tools. Print a standee that works on every UPI app.",
    h1: "UPI QR generators for every app, bank, and shop",
    intro:
      "One NPCI upi://pay QR works on PhonePe, Google Pay, Paytm, BHIM, and bank apps. Pick a preset for the poster layout you want, then print. These are compatible standees — not a replacement for an official merchant QR if you need that app's dashboard or soundbox.",
    eyebrow: "QR generators",
    shortName: "UPI QR generators",
    blurb: "App, bank, and shop presets plus bulk, universal, and decoder tools.",
    hiName: "UPI QR जनरेटर",
    hiBlurb: "ऐप, बैंक और दुकान प्रीसेट, थोक और यूनिवर्सल टूल।",
    groups: [
      { heading: "Payment apps", tools: paymentAppTools },
      { heading: "Bank UPI QR", tools: personalBankTools },
      { heading: "Business bank QR", tools: businessBankTools },
      { heading: "Shops and professions", tools: shopTools },
      {
        heading: "Other QR tools",
        tools: [
          { href: "/", name: "UPI standee generator", description: "Classic scan-to-pay poster with printable templates." },
          { href: "/universal-qr-generator/", name: "Universal QR generator", description: "URL, WiFi, vCard, PDF, SMS, and other static QR types." },
          { href: "/free-qr-generator-without-watermark/", name: "Watermark-free QR generator", description: "Download PNG or PDF posters with no signup and no watermark." },
          { href: "/bulk-qr/", name: "Bulk CSV QR generator", description: "Hundreds of labelled QRs from a spreadsheet as ZIP or PDF." },
          { href: "/dynamic-qr-generator/", name: "Dynamic QR & link shortener", description: "Editable destinations with optional scan analytics." },
          { href: "/upi-qr-decoder/", name: "UPI QR validator & decoder", description: "Safety-check hidden fields — VPA, amount, tamper clues — before you print." },
          { href: "/upi-link-generator/", name: "UPI payment link generator", description: "Create upi://pay links for WhatsApp, SMS, and invoices." },
          { href: "/survey-qr-generator/", name: "Survey QR generator", description: "Feedback collection QRs with prefilled responses." },
        ],
      },
    ],
    articleSlugs: [
      "universal-upi-qr-code-generator-guide",
      "universal-upi-qr-code-generator-app-guide",
      "how-to-generate-universal-qr-code-free",
      "create-upi-qr-code-for-bank-account",
      "how-to-generate-upi-qr-with-amount",
      "static-vs-dynamic-upi-qr-code-difference",
      "how-to-generate-bulk-upi-qr-codes-from-csv",
      "how-to-generate-bulk-upi-qr-codes",
      "how-to-generate-bhim-upi-qr-code",
      "how-to-get-free-upi-qr-code-from-bank",
      "how-to-create-upi-qr-without-business-account",
      "how-to-generate-upi-qr-for-multiple-staff-counters",
      "how-to-change-upi-id-on-printed-qr-standee",
      "how-to-create-whatsapp-payment-link-upi",
      "how-to-link-credit-card-to-upi-qr",
    ],
    relatedHubIds: ["merchant-setup", "print-upi-qr", "upi-errors-and-limits"],
    faqs: [
      {
        question: "Do I need a different QR for PhonePe, GPay, and Paytm?",
        answer:
          "No. A standard upi://pay QR is interoperable. Customers can pay from any UPI app into the VPA encoded in the QR. App-branded presets here only change the poster layout.",
      },
      {
        question: "Is this the official PhonePe or Google Pay Business QR?",
        answer:
          "No. These generators print a compatible UPI QR for your VPA. Official merchant QRs, KYC, dashboards, and soundboxes still come from PhonePe Business, Google Pay for Business, or your bank.",
      },
      {
        question: "Can I collect a fixed amount?",
        answer:
          "Yes. Add the amount field so the payer's app locks that rupee value. Leave it blank for an open-amount counter QR. Static amount QRs are still VPA-based; they are not hosted checkout sessions.",
      },
      {
        question: "Is UPI MDR zero on these QRs?",
        answer:
          "Standard bank-to-bank UPI has 0% MDR. RuPay credit card on UPI above ₹2,000 may carry interchange as published by NPCI. The QR itself does not add a Pro UPI QR fee.",
      },
    ],
  },
  {
    id: "merchant-setup",
    path: "/merchant-setup/",
    title: "Merchant Setup Guides for PhonePe & GPay | Pro UPI QR",
    description:
      "Activate PhonePe, Google Pay, or BHIM business QR, compare soundboxes, and set up a shop counter without a POS machine or payment gateway.",
    h1: "Merchant setup: official app QR versus a printable UPI standee",
    intro:
      "Use the official PhonePe, Google Pay, or bank merchant app when you need KYC, settlement reports, or a soundbox. Print a compatible UPI standee when you only need customers to pay your VPA. These guides keep that distinction explicit.",
    eyebrow: "Merchant setup",
    shortName: "Merchant setup",
    blurb: "PhonePe, GPay, BHIM, soundboxes, and counter setup without a POS.",
    hiName: "मर्चेंट सेटअप",
    hiBlurb: "PhonePe, GPay, BHIM, साउंडबॉक्स और बिना POS काउंटर सेटअप।",
    groups: [
      {
        heading: "Compare and activate",
        tools: [
          { href: "/phonepe-vs-paytm-vs-gpay/", name: "PhonePe vs Paytm vs GPay", description: "Interoperability, soundboxes, dashboards, and what actually differs." },
          { href: "/phonepe-qr-generator/", name: "PhonePe-compatible QR", description: "Print a PhonePe-styled standee for any VPA." },
          { href: "/google-pay-qr-generator/", name: "Google Pay-compatible QR", description: "GPay-friendly poster customers can scan from any UPI app." },
          { href: "/paytm-qr-generator/", name: "Paytm-compatible QR", description: "Paytm-styled counter QR for shops and local businesses." },
          { href: "/bhim-qr-generator/", name: "BHIM UPI QR", description: "Standard BHIM-compatible QR for direct bank collection." },
        ],
      },
      {
        heading: "Counter extras",
        tools: [
          { href: "/whatsapp-order-generator/", name: "WhatsApp order creator", description: "Pre-filled order messages with pay links for chat selling." },
          { href: "/dynamic-qr-generator/", name: "Dynamic QR", description: "Change the destination later without reprinting every sticker." },
          { href: "/upi-limits/", name: "Bank UPI limits", description: "Per-bank daily caps before you promise a large collection." },
          { href: "/digital-visiting-card/", name: "Digital visiting card", description: "vCard plus UPI you can share by link or NFC." },
        ],
      },
    ],
    articleSlugs: [
      "phonepe-business-qr-code-activation",
      "google-pay-business-qr-code-activation",
      "paytm-vs-phonepe-vs-gpay-which-qr-best-for-shop",
      "how-to-generate-bhim-upi-qr-code",
      "how-upi-soundboxes-work-and-their-safety",
      "setup-soundbox-announcements-for-shop-free",
      "paytm-business-qr-soundbox-charges",
      "how-to-accept-upi-payments-without-pos-machine",
      "how-to-create-upi-qr-without-business-account",
      "how-to-get-free-upi-qr-code-from-bank",
      "understanding-upi-vpa-merchant-accounts",
      "rbi-merchant-upi-qr-display-guidelines-india",
      "how-to-add-upi-qr-to-instagram-whatsapp-status",
      "upi-qr-code-vs-payment-gateway",
      "how-to-create-whatsapp-payment-link-upi",
    ],
    relatedHubIds: ["upi-qr-generators", "print-upi-qr", "upi-errors-and-limits"],
    faqs: [
      {
        question: "When should I use PhonePe Business instead of a printable QR?",
        answer:
          "Use PhonePe Business (or GPay for Business, or a bank merchant QR) when you want official KYC, in-app settlements, loans, or a rented soundbox. A printable compatible QR is enough when you only need customers to pay a VPA you already own.",
      },
      {
        question: "Can a personal UPI ID run a shop?",
        answer:
          "Yes, within that bank's personal UPI limits. Many small counters start there. Switch to a merchant/current-account VPA when volume, tax invoicing, or bank limits require it.",
      },
      {
        question: "Do I need a soundbox?",
        answer:
          "No. PhonePe and Google Pay Business apps can speak payment alerts on the phone. A rented box is useful in noisy shops where you cannot watch the phone.",
      },
      {
        question: "Is a POS machine required for UPI?",
        answer:
          "No. A printed UPI QR is enough for account-to-account collections. Card POS is a separate product with its own MDR.",
      },
    ],
  },
  {
    id: "print-upi-qr",
    path: "/print-upi-qr/",
    title: "Print UPI QR Standees, Stickers & Posters | Pro UPI QR",
    description:
      "Print UPI QR standees, A4 sticker sheets, waterproof outdoor labels, and sale posters. Size charts, PNG vs PDF, and GPay print steps included.",
    h1: "Print UPI QR standees, stickers, and posters",
    intro:
      "Counter scans fail from glare, tiny modules, and glossy lamination — not from the UPI app. These tools and guides cover size, matte stock, sticker sheets, and when to reprint after a VPA change.",
    eyebrow: "Print & display",
    shortName: "Print, stickers, standees",
    blurb: "Standee sizes, A4 sticker sheets, waterproof labels, and sale posters.",
    hiName: "प्रिंट, स्टीकर, स्टैंडी",
    hiBlurb: "स्टैंडी आकार, A4 स्टीकर शीट, वाटरप्रूफ लेबल और सेल पोस्टर।",
    groups: [
      {
        heading: "Print tools",
        tools: [
          { href: "/", name: "UPI standee generator", description: "Full-page payment posters for acrylic T-stands." },
          { href: "/print-templates/", name: "Printable template gallery", description: "A4, A5, 5×7, table tents, counter cards, and sticker sheets." },
          { href: "/qr-sticker-generator/", name: "A4 QR sticker sheets", description: "Print 4, 6, or 12 counter stickers per sheet." },
          { href: "/offer-poster-generator/", name: "Shop sale poster builder", description: "Discount banners with your UPI QR baked in." },
          { href: "/menu-qr-generator/", name: "Menu QR generator", description: "Printable price-list cards for restaurants and salons." },
          { href: "/bulk-qr/", name: "Bulk CSV QR", description: "Batch-print labelled QRs for staff counters or packing." },
          { href: "/digital-visiting-card/", name: "Digital visiting card", description: "Shareable vCard plus UPI when print is not the medium." },
        ],
      },
      {
        heading: "Display hardware",
        tools: [
          { href: "/products/", name: "UPI QR hardware shop", description: "Standees, stickers, printers, speakers, and outdoor boards with buying guides." },
          { href: "/products/acrylic-qr-standee/", name: "A6 acrylic standee", description: "Default checkout T-stand. Print a matte A6 insert and test-scan." },
          { href: "/products/waterproof-qr-stickers/", name: "Waterproof QR stickers", description: "Matte vinyl for glass, tiffins, and parcels." },
          { href: "/products/table-tent-qr-holder/", name: "Restaurant table tent", description: "Two-sided cafe tents with a 1.5–2 inch QR." },
          { href: "/products/bluetooth-thermal-printer/", name: "80 mm thermal printer", description: "Bluetooth receipts for riders and kirana slips — not a standee." },
          { href: "/products/a5-acrylic-t-stand/", name: "A5 T-stand", description: "Larger acrylic for donation desks and 5-foot scan distance." },
        ],
      },
    ],
    articleSlugs: [
      "how-to-create-print-upi-qr-code-standee",
      "printable-upi-qr-sticker-sheet-guide",
      "how-to-print-durable-waterproof-qr-stickers",
      "how-to-print-gpay-qr-code-step-by-step",
      "upi-qr-code-size-dimensions-printing-guide",
      "custom-design-templates-gpay-phonepe-qr",
      "upi-qr-png-vs-pdf-print-quality-guide",
      "how-to-change-upi-id-on-printed-qr-standee",
    ],
    relatedHubIds: ["upi-qr-generators", "merchant-setup", "upi-errors-and-limits"],
    faqs: [
      {
        question: "What size should a counter UPI QR be?",
        answer:
          "For a typical checkout distance, keep the QR module itself at least 2.5–3 cm on the short side. Table tents can be smaller; outdoor boards need to be larger. See the print-size guide for standee dimensions.",
      },
      {
        question: "PNG or PDF for printing?",
        answer:
          "PDF is the safer print master (vector-scale pages). PNG is fine for home inkjet and WhatsApp sharing. Export at the physical size you will print; do not stretch a small screenshot.",
      },
      {
        question: "Why does my printed QR not scan?",
        answer:
          "Usual causes: glossy lamination glare, under-sized code, low-contrast design, or a cropped quiet zone. Matte laminate and a test-scan from PhonePe and GPay before you stick it down.",
      },
      {
        question: "Can I change the UPI ID on a printed standee?",
        answer:
          "Not on a static print. Reprint, or use a dynamic QR whose destination you can edit without changing the sticker. Always test-scan after a VPA change.",
      },
    ],
  },
  {
    id: "upi-errors-and-limits",
    path: "/upi-errors-and-limits/",
    title: "UPI Errors, Limits, Refunds & Safety | Pro UPI QR",
    description:
      "Look up NPCI returned errors, bank UPI limits, refund TAT, QR fraud checks, and pending-debit steps. Decoder and MDR calculator included.",
    h1: "UPI errors, bank limits, refunds, and QR safety",
    intro:
      "Apps often wrap a two-character NPCI reason as “NPCI returned error.” Limits differ by bank and by personal vs merchant account. These pages separate bank, NPCI, and app failures, and they cite RBI T+1 / T+5 reversal windows rather than guessing.",
    eyebrow: "Errors, limits, safety",
    shortName: "Errors, limits, safety",
    blurb: "NPCI codes, bank limits, refund TAT, decoder, and QR fraud checks.",
    hiName: "एरर, लिमिट, सुरक्षा",
    hiBlurb: "NPCI कोड, बैंक लिमिट, रिफंड TAT और QR धोखाधड़ी जाँच।",
    groups: [
      {
        heading: "Lookup and check",
        tools: [
          { href: "/upi-error-codes/", name: "UPI error code resolver", description: "NPCI returned error? Look up U16, Z9, ZM and 40+ sourced codes." },
          { href: "/upi-limits/", name: "Indian bank UPI limits", description: "Daily caps for 30+ banks, last-reviewed with NPCI-facing sources." },
          { href: "/upi-qr-decoder/", name: "UPI QR validator & decoder", description: "Safety-check the VPA, amount, and tamper clues before you trust or reprint." },
          { href: "/upi-calculator/", name: "UPI MDR savings calculator", description: "Compare gateway MDR with direct UPI. RuPay CC UPI is called out separately." },
        ],
      },
    ],
    articleSlugs: [
      "how-to-resolve-upi-pending-transaction-issues",
      "upi-transaction-limits-sbi-hdfc-icici",
      "is-it-safe-to-scan-upi-qr-code",
      "prevent-upi-qr-code-tampering-frauds",
      "how-to-verify-upi-qr-code-before-displaying",
      "upi-qr-code-not-scanning-troubleshooting",
      "how-upi-soundboxes-work-and-their-safety",
      "rupay-credit-card-upi-mdr-charges",
      "how-to-link-credit-card-to-upi-qr",
      "receive-international-upi-payments",
      "upi-international-countries-list-guide",
      "upi-lite-vs-upi-pay-small-transactions",
      "upi-autopay-mandate-qr-recurring-payments",
    ],
    relatedHubIds: ["merchant-setup", "upi-qr-generators", "business-calculators"],
    faqs: [
      {
        question: "What does “NPCI returned error” mean?",
        answer:
          "It is an app wrapper, not a single failure. Open the transaction details and read the two-character reason (U16, Z9, ZM, and so on). The resolver maps those codes to origin — bank, NPCI, or the app — and the next step.",
      },
      {
        question: "How long do UPI refunds take?",
        answer:
          "RBI's TAT circular (DPSS.CO.PD No.629/02.01.014/2019-20) expects P2P reversals by T+1 working day and P2M by T+5, with ₹100/day compensation after that. Copy the UTR before you escalate.",
      },
      {
        question: "Why was I debited if the payment failed?",
        answer:
          "The remitter bank may have debited you before the beneficiary credit confirmed. Do not retry the same amount blindly. Wait for the TAT window, then raise a ticket with the UTR via your app or UDIR.",
      },
      {
        question: "How do I stop QR sticker swaps?",
        answer:
          "Laminate, sign the payee line, test-scan weekly, and prefer a standee over a loose sticker. The decoder shows if pa still matches your VPA.",
      },
    ],
  },
  {
    id: "merchant-documents",
    path: "/merchant-documents/",
    title: "Invoices, Receipts & Merchant Documents | Pro UPI QR",
    description:
      "Create GST invoices, receipts, rent receipts, quotations, credit notes, salary slips, and paid stamps with a UPI QR. Know which document to send when.",
    h1: "Invoices, receipts, and merchant documents",
    intro:
      "An invoice asks for money. A receipt proves it arrived. Quotations, credit notes, rent receipts, and salary slips are different legal objects. These generators stay in the browser; they do not file GST for you.",
    eyebrow: "Documents",
    shortName: "Invoices & documents",
    blurb: "GST invoices, receipts, quotations, credit notes, rent receipts, paid stamps.",
    hiName: "इनवॉइस और दस्तावेज़",
    hiBlurb: "GST इनवॉइस, रसीद, कोटेशन, क्रेडिट नोट, किराया रसीद, PAID स्टैम्प।",
    groups: [
      {
        heading: "The billing loop",
        tools: [
          { href: "/quotation-generator/", name: "Quotation / estimate generator", description: "Price quotes with validity dates, terms, and optional advance QR." },
          { href: "/proforma-invoice-generator/", name: "Proforma invoice generator", description: "Advance-payment documents with buyer PO reference." },
          { href: "/invoice-generator/", name: "Invoice PDF generator", description: "GST-ready invoices with country templates and an embedded UPI QR." },
          { href: "/payment-reminder-generator/", name: "Payment reminder generator", description: "Friendly, professional, or firm overdue copy for WhatsApp, SMS, email." },
          { href: "/receipt-generator/", name: "Payment receipt generator", description: "PAID-stamped receipts with mode, UTR, and UPI QR." },
          { href: "/paid-stamp-generator/", name: "Paid stamp generator", description: "Stamp PAID with date and signature on a bill photo, offline." },
        ],
      },
      {
        heading: "Corrections, rent, payroll",
        tools: [
          { href: "/credit-note-generator/", name: "GST credit note generator", description: "Section 34 credit notes for returns, discounts, and billing corrections." },
          { href: "/debit-note-generator/", name: "GST debit note generator", description: "Section 34 debit notes to increase tax on understated invoices." },
          { href: "/rent-receipt-generator/", name: "Rent receipt generator", description: "HRA-ready monthly receipts with amount in words and a stamp box." },
          { href: "/salary-slip-generator/", name: "Salary slip generator", description: "Monthly payslips with PF/PT/TDS breakdowns." },
          { href: "/bill-of-supply-generator/", name: "Bill of supply generator", description: "Zero-GST bills for composition dealers and exempt supply." },
        ],
      },
      {
        heading: "Purchasing, dispatch, retail",
        tools: [
          { href: "/purchase-order-generator/", name: "Purchase order generator", description: "Formal POs with buyer/supplier GSTINs, delivery terms, and line items." },
          { href: "/delivery-challan-generator/", name: "Delivery challan generator", description: "Goods dispatch document with vehicle, e-way bill, and receiver sign-off." },
          { href: "/cash-memo-generator/", name: "Cash memo generator", description: "Simple retail billing slips for kirana shops, counters, and walk-in sales." },
          { href: "/invoice-vs-receipt/", name: "Invoice vs receipt vs credit note", description: "Which document when, with a worked example." },
          { href: "/whatsapp-order-generator/", name: "WhatsApp order creator", description: "Chat-based orders with a pay link attached." },
        ],
      },
    ],
    articleSlugs: [
      "how-to-stamp-paid-on-invoice-bill-photo",
      "how-to-write-payment-reminder-message-overdue-invoice",
      "quotation-vs-estimate-vs-invoice-vs-receipt",
      "rent-receipt-format-hra-exemption-india",
      "upi-qr-for-freelancers-invoice-payments",
      "treds-invoice-discounting-msme-guide",
      "best-billing-apps-with-inbuilt-upi-qr",
    ],
    relatedHubIds: ["business-calculators", "upi-qr-generators", "merchant-setup"],
    faqs: [
      {
        question: "Can an invoice prove payment?",
        answer:
          "No. An invoice is a demand. Proof of settlement is a receipt, UTR, or bank statement. Stamp PAID or issue a receipt after the credit lands.",
      },
      {
        question: "Do these generators file GST?",
        answer:
          "No. They produce documents you can send or print. GSTIN, HSN, and tax totals are your responsibility, and returns are still filed on the GST portal.",
      },
      {
        question: "When is a credit note required?",
        answer:
          "When you reduce a tax invoice already issued — returns, post-supply discounts, or corrections under GST Section 34. It is not the same thing as a refund of cash.",
      },
      {
        question: "Are rent receipts enough for HRA?",
        answer:
          "They are the usual evidence, with landlord PAN above the notified rent threshold. Keep monthly copies. Rules can change; confirm against the current Income-tax form instructions.",
      },
    ],
  },
  {
    id: "business-calculators",
    path: "/business-calculators/",
    title: "Free Business Calculators for Indian Shops | Pro UPI QR",
    description:
      "GST, EMI, SIP, gratuity, MSMED interest, TReDS, break-even, margin, and cash-drawer calculators for Indian shops. Math is exact; sources are cited.",
    h1: "Business calculators for Indian shops",
    intro:
      "Work in integer paise. MSMED delayed-payment interest tracks the RBI-linked statutory formula, not a frozen 15%. UPI MDR savings treat RuPay credit card on UPI as a separate case from bank-to-bank UPI.",
    eyebrow: "Calculators",
    shortName: "Business calculators",
    blurb: "GST, EMI, SIP, MSMED, TReDS, margin, gratuity, and cash-drawer maths.",
    hiName: "बिज़नेस कैलकुलेटर",
    hiBlurb: "GST, EMI, SIP, MSMED, TReDS, मार्जिन, ग्रैच्युटी और कैश ड्रॉअर।",
    groups: [
      {
        heading: "Tax and pricing",
        tools: [
          { href: "/gst-calculator/", name: "GST calculator", description: "Inclusive and exclusive tax breakdowns with an optional payable QR." },
          { href: "/margin-calculator/", name: "Profit margin calculator", description: "Cost, margin, and markup for retailers." },
          { href: "/break-even-calculator/", name: "Break-even calculator", description: "Survival units, target-profit units, and margin of safety." },
          { href: "/upi-calculator/", name: "UPI MDR savings calculator", description: "Direct UPI versus gateway fees, with RuPay CC UPI called out." },
        ],
      },
      {
        heading: "Loans, savings, statutory",
        tools: [
          { href: "/emi-calculator/", name: "EMI calculator", description: "Loan EMI with a year-by-year amortization PDF." },
          { href: "/sip-calculator/", name: "SIP calculator", description: "Monthly SIP projection with inflation-adjusted value." },
          { href: "/gratuity-calculator/", name: "Gratuity calculator", description: "Payment of Gratuity Act 15/26 formula, eligibility, and cap." },
          { href: "/msmed-interest-calculator/", name: "MSMED interest calculator", description: "RBI-linked delayed-payment interest for MSME suppliers." },
          { href: "/treds-calculator/", name: "TReDS discounting calculator", description: "Net proceeds when you discount a large-buyer invoice." },
        ],
      },
      {
        heading: "Shop floor",
        tools: [
          { href: "/split-bill-calculator/", name: "Split bill calculator", description: "Fair group splits with per-person UPI pay links." },
          { href: "/cash-denomination-calculator/", name: "Cash denomination calculator", description: "Count the drawer by note and coin; download a shift summary." },
          { href: "/upi-limits/", name: "Bank UPI limits", description: "Daily transfer caps before you accept a large payment." },
          { href: "/merchant-reconciliation/", name: "UPI reconciliation tool", description: "Match invoices to UTRs, spot short payments, export monthly reports." },
          { href: "/msme-receivables/", name: "MSME receivables tracker", description: "Invoice aging, 45-day due tracker, and Section 16 demand letters." },
        ],
      },
      {
        heading: "MSME receivables",
        tools: [
          { href: "/msmed-interest-calculator/", name: "MSMED interest calculator", description: "RBI-linked delayed-payment interest for MSME suppliers." },
          { href: "/treds-calculator/", name: "TReDS discounting calculator", description: "Net proceeds when you discount a large-buyer invoice." },
          { href: "/msme-receivables/", name: "MSME receivables tracker", description: "Invoice aging, 45-day due tracker, and Section 16 demand letters." },
        ],
      },
    ],
    articleSlugs: [
      "udyam-registration-guide-msme-benefits",
      "government-schemes-small-businesses-india-2026",
      "treds-invoice-discounting-msme-guide",
      "rupay-credit-card-upi-mdr-charges",
      "upi-qr-code-vs-payment-gateway",
    ],
    relatedHubIds: ["merchant-documents", "upi-errors-and-limits", "merchant-setup"],
    faqs: [
      {
        question: "Is MSMED delayed-payment interest still 15%?",
        answer:
          "No. The calculator uses three times the RBI Bank Rate (currently 6.5% × 3 = 19.5% p.a.) as notified for MSMED claims. Confirm the live Bank Rate on rbi.org.in before you send a legal notice.",
      },
      {
        question: "Does the EMI figure include processing fees?",
        answer:
          "The schedule is principal and interest only. Processing fees, GST on charges, and prepayment penalties are extra — add them separately if your lender quotes them.",
      },
      {
        question: "Is UPI always cheaper than a payment gateway?",
        answer:
          "Bank-to-bank UPI has 0% MDR. Gateways still charge for cards, EMI, and often for convenience. RuPay credit card on UPI above ₹2,000 may carry interchange. Run the MDR calculator with your mix.",
      },
      {
        question: "Do these calculators store my numbers?",
        answer:
          "Drafts stay in localStorage on this device. Nothing is uploaded unless you use a clearly labelled account-backed feature such as dynamic QR or checkout.",
      },
    ],
  },
];

export const DEVELOPER_NAV_HUB: NavHub = {
  id: "developer",
  path: "/developer/",
  shortName: "Developer integrations",
  blurb: "Embed widgets, payment links, and authenticated checkout sessions.",
  hiName: "डेवलपर API",
  hiBlurb: "एम्बेड विजेट, पेमेंट लिंक और चेकआउट सेशन।",
};

export const NAV_HUBS: NavHub[] = [
  ...TOPIC_HUBS.map((hub) => ({
    id: hub.id,
    path: hub.path,
    shortName: hub.shortName,
    blurb: hub.blurb,
    hiName: hub.hiName,
    hiBlurb: hub.hiBlurb,
  })),
  DEVELOPER_NAV_HUB,
];

export const TOPIC_HUB_BY_ID: Record<TopicHubId, TopicHub> = Object.fromEntries(
  TOPIC_HUBS.map((hub) => [hub.id, hub])
) as Record<TopicHubId, TopicHub>;

export function normalizePath(path: string): string {
  const noHash = path.split("#")[0].split("?")[0];
  const noLocale = noHash.replace(/^\/(hi|ta|te|mr)(?=\/|$)/, "") || "/";
  const withSlash = noLocale.startsWith("/") ? noLocale : `/${noLocale}`;
  if (withSlash === "/") return "/";
  return withSlash.endsWith("/") ? withSlash : `${withSlash}/`;
}

function postSlug(id: string): string {
  return id.replace(/\.mdx?$/, "");
}

const pathToHubId = new Map<string, TopicHubId>();

for (const hub of TOPIC_HUBS) {
  pathToHubId.set(hub.path, hub.id);
  for (const group of hub.groups) {
    for (const tool of group.tools) {
      const toolPath = normalizePath(tool.href);
      if (!pathToHubId.has(toolPath)) pathToHubId.set(toolPath, hub.id);
    }
  }
  for (const slug of hub.articleSlugs) {
    const articlePath = `/blog/${slug}/`;
    if (!pathToHubId.has(articlePath)) pathToHubId.set(articlePath, hub.id);
  }
}

for (const generator of generators) {
  const generatorPath = `/${generator.slug}/`;
  if (!pathToHubId.has(generatorPath)) pathToHubId.set(generatorPath, "upi-qr-generators");
}

export function hubForPath(path: string): TopicHub | undefined {
  const id = pathToHubId.get(normalizePath(path));
  return id ? TOPIC_HUB_BY_ID[id] : undefined;
}

export function isTopicHubPath(path: string): boolean {
  const norm = normalizePath(path);
  return TOPIC_HUBS.some((hub) => hub.path === norm);
}

export function getRelatedTools(path: string, limit = 4): TopicTool[] {
  const norm = normalizePath(path);
  const generator = generators.find((item) => `/${item.slug}/` === norm);
  if (generator) {
    return getRelatedGenerators(generator.slug, limit).map(genTool);
  }

  const hub = hubForPath(norm);
  if (!hub) return [];

  const group = hub.groups.find((item) =>
    item.tools.some((tool) => normalizePath(tool.href) === norm)
  );
  const sameGroup = (group?.tools ?? []).filter((tool) => normalizePath(tool.href) !== norm);
  if (sameGroup.length >= limit) return sameGroup.slice(0, limit);
  const rest = hub.groups
    .flatMap((item) => item.tools)
    .filter(
      (tool) =>
        normalizePath(tool.href) !== norm &&
        !sameGroup.some((existing) => existing.href === tool.href)
    );
  return [...sameGroup, ...rest].slice(0, limit);
}

export interface BlogLike {
  id: string;
  data: {
    title: string;
    description: string;
    tags: string[];
    pubDate: Date;
    updatedDate?: Date;
  };
}

const PRESET_TAG: Partial<Record<PresetType, string>> = {
  phonepe: "PhonePe",
  gpay: "Google Pay",
  paytm: "Paytm",
  bhim: "BHIM",
  whatsapp: "WhatsApp Business",
  amazon: "Amazon Pay",
  sbi: "SBI",
  hdfc: "HDFC",
  icici: "ICICI",
  donation: "Donations",
  kirana: "Shops",
  restaurant: "Restaurant",
  freelance: "Freelancer",
  gym: "Shops",
  salon: "Salon",
  temple: "Donations",
  tutor: "Tuition",
  pg: "Hostel",
  tiffin: "Tiffin",
  caterer: "Catering",
  photographer: "Photography",
  electrician: "Field Services",
};

function tagScore(tag: string): number {
  return WEAK_TAGS.has(tag) ? 1 : 3;
}

export function relatedArticlesFromCollection<T extends BlogLike>(
  posts: T[],
  options: {
    excludeSlug?: string;
    tags?: string[];
    hubArticleSlugs?: string[];
    limit?: number;
  } = {}
): T[] {
  const { excludeSlug, tags = [], hubArticleSlugs = [], limit = 4 } = options;
  const hubSet = new Set(hubArticleSlugs);

  return posts
    .map((post) => {
      const slug = postSlug(post.id);
      if (slug === excludeSlug) return null;
      const shared = post.data.tags.filter((tag) => tags.includes(tag));
      const score =
        shared.reduce((sum, tag) => sum + tagScore(tag), 0) + (hubSet.has(slug) ? 2 : 0);
      if (score <= 0) return null;
      const recency = (post.data.updatedDate ?? post.data.pubDate).valueOf();
      return { post, score, recency };
    })
    .filter((item): item is { post: T; score: number; recency: number } => item !== null)
    .sort((a, b) => b.score - a.score || b.recency - a.recency)
    .slice(0, limit)
    .map((item) => item.post);
}

export function articlesForHub<T extends BlogLike>(hub: TopicHub, posts: T[]): T[] {
  const want = new Set(hub.articleSlugs);
  return posts
    .filter((post) => want.has(postSlug(post.id)))
    .sort(
      (a, b) =>
        (b.data.updatedDate ?? b.data.pubDate).valueOf() -
        (a.data.updatedDate ?? a.data.pubDate).valueOf()
    );
}

export function pickFeaturedPosts<T extends BlogLike>(posts: T[], limit = 6): T[] {
  const bySlug = new Map(posts.map((post) => [postSlug(post.id), post]));
  return FEATURED_GUIDE_SLUGS.map((slug) => bySlug.get(slug))
    .filter((post): post is T => Boolean(post))
    .slice(0, limit);
}

export function contextualArticleQuery(path: string): {
  excludeSlug?: string;
  tags: string[];
  hubArticleSlugs: string[];
} {
  const norm = normalizePath(path);
  const hub = hubForPath(norm);
  const hubArticleSlugs = hub?.articleSlugs ?? [];

  const blogMatch = norm.match(/^\/blog\/([^/]+)\/$/);
  if (blogMatch) {
    return { excludeSlug: blogMatch[1], tags: [], hubArticleSlugs };
  }

  const generator = generators.find((item) => `/${item.slug}/` === norm);
  if (generator) {
    const tag = PRESET_TAG[generator.presetType];
    return { tags: tag ? [tag] : [], hubArticleSlugs };
  }

  return { tags: [], hubArticleSlugs };
}

export function generatorSlugFromPath(path: string): GeneratorSlug | undefined {
  const norm = normalizePath(path);
  return generators.find((item) => `/${item.slug}/` === norm)?.slug;
}

export { generatorFamily, genTool };
