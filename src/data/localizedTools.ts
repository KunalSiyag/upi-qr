export type SupportedToolLanguage = "hi" | "ta" | "te" | "mr";

export type LocalizedTool = {
  slug: string;
  name: string;
  component:
    | "digitalCard" | "dynamicQr" | "stickers" | "gst" | "whatsapp"
    | "bulk" | "invoice" | "upiCalculator" | "offerPoster" | "menuQr"
    | "margin" | "limits" | "decoder" | "upiLink" | "survey" | "default";
};

// Every interactive tool gets a real, indexable page in each supported Indian
// language. The interface itself stays consistent while the page context,
// metadata, navigation and instructions use the visitor's language.
export const LOCALIZED_TOOLS: LocalizedTool[] = [
  { slug: "digital-visiting-card", name: "Digital Visiting Card", component: "digitalCard" },
  { slug: "dynamic-qr-generator", name: "Dynamic QR Generator", component: "dynamicQr" },
  { slug: "qr-sticker-generator", name: "A4 QR Sticker Generator", component: "stickers" },
  { slug: "gst-calculator", name: "GST Calculator", component: "gst" },
  { slug: "whatsapp-order-generator", name: "WhatsApp Order Generator", component: "whatsapp" },
  { slug: "bulk-qr", name: "Bulk CSV QR Generator", component: "bulk" },
  { slug: "invoice-generator", name: "Invoice Generator", component: "invoice" },
  { slug: "upi-calculator", name: "UPI Savings Calculator", component: "upiCalculator" },
  { slug: "offer-poster-generator", name: "Offer Poster Generator", component: "offerPoster" },
  { slug: "menu-qr-generator", name: "Menu QR Generator", component: "menuQr" },
  { slug: "margin-calculator", name: "Margin Calculator", component: "margin" },
  { slug: "upi-limits", name: "UPI Limits Checker", component: "limits" },
  { slug: "upi-qr-decoder", name: "UPI QR Decoder", component: "decoder" },
  { slug: "upi-link-generator", name: "UPI Payment Link Generator", component: "upiLink" },
  { slug: "survey-qr-generator", name: "Survey QR Generator", component: "survey" },
  { slug: "generator", name: "UPI QR Generator", component: "default" },
  { slug: "free-qr-generator-without-watermark", name: "Watermark-Free QR Generator", component: "default" },
  { slug: "upi-qr-code-generator-no-signup", name: "No-Signup UPI QR Generator", component: "default" },
];

export function getLocalizedTool(slug: string) {
  return LOCALIZED_TOOLS.find((tool) => tool.slug === slug);
}

export const localizedToolSlugs = LOCALIZED_TOOLS.map((tool) => tool.slug);
