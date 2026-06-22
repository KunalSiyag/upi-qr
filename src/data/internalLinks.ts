export type GeneratorSlug =
  | "phonepe-qr-generator"
  | "google-pay-qr-generator"
  | "paytm-qr-generator"
  | "donation-qr-generator";

export type PresetType = "phonepe" | "gpay" | "paytm" | "donation";

export interface GeneratorLink {
  slug: GeneratorSlug;
  presetType: PresetType;
  label: string;
  shortLabel: string;
  description: string;
  accent: string;
}

export interface GuideLink {
  slug: string;
  title: string;
  description: string;
  presetTypes: PresetType[];
  tags: string[];
  featured?: boolean;
}

export const generators: GeneratorLink[] = [
  {
    slug: "phonepe-qr-generator",
    presetType: "phonepe",
    label: "PhonePe QR Generator",
    shortLabel: "PhonePe QR",
    description: "Create a PhonePe-compatible UPI QR with optional amount and note.",
    accent: "#5f259f",
  },
  {
    slug: "google-pay-qr-generator",
    presetType: "gpay",
    label: "Google Pay QR Generator",
    shortLabel: "Google Pay QR",
    description: "Build a GPay-friendly standee customers can scan from any UPI app.",
    accent: "#4285f4",
  },
  {
    slug: "paytm-qr-generator",
    presetType: "paytm",
    label: "Paytm QR Generator",
    shortLabel: "Paytm QR",
    description: "Generate a Paytm-compatible payment QR for shops and local businesses.",
    accent: "#00baf2",
  },
  {
    slug: "donation-qr-generator",
    presetType: "donation",
    label: "Donation QR Generator",
    shortLabel: "Donation QR",
    description: "Set up a commission-free donation poster for temples, NGOs, and causes.",
    accent: "#287a57",
  },
];

export const guides: GuideLink[] = [
  {
    slug: "how-to-create-print-upi-qr-code-standee",
    title: "How to Create and Print a UPI QR Standee",
    description: "Step-by-step guide to design, generate, and print shop counter standees.",
    presetTypes: ["phonepe", "gpay", "paytm", "donation"],
    tags: ["Shops", "Printing Guide", "Tutorial"],
    featured: true,
  },
  {
    slug: "google-pay-business-qr-code-activation",
    title: "Google Pay for Business Setup Guide",
    description: "Register, complete KYC, and activate your GPay merchant QR.",
    presetTypes: ["gpay"],
    tags: ["Google Pay", "Merchant Setup", "GPay"],
    featured: true,
  },
  {
    slug: "how-to-collect-donations-temples-ngos-upi",
    title: "Collect Donations with UPI QR for Temples & NGOs",
    description: "Set up secure, commission-free donation QR codes for charities.",
    presetTypes: ["donation"],
    tags: ["Donations", "NGOs", "Fundraising"],
    featured: true,
  },
  {
    slug: "how-to-print-durable-waterproof-qr-stickers",
    title: "Print Durable Waterproof QR Stickers",
    description: "Material and lamination tips for long-lasting outdoor QR displays.",
    presetTypes: ["phonepe", "gpay", "paytm", "donation"],
    tags: ["Printing Guide", "Merchant Tips", "Stickers"],
    featured: true,
  },
  {
    slug: "custom-design-templates-gpay-phonepe-qr",
    title: "Custom Design Templates for GPay & PhonePe",
    description: "Branding tips for professional payment poster templates.",
    presetTypes: ["phonepe", "gpay", "paytm"],
    tags: ["Templates", "Branding", "Tutorial"],
    featured: true,
  },
  {
    slug: "how-to-generate-upi-qr-with-amount",
    title: "Generate UPI QR Code with Fixed Amount",
    description: "Create dynamic QR codes that request a preset payment amount.",
    presetTypes: ["phonepe", "gpay", "paytm"],
    tags: ["Dynamic QR", "Billing", "Tutorial"],
    featured: true,
  },
  {
    slug: "phonepe-business-qr-code-activation",
    title: "PhonePe Business QR Activation Guide",
    description: "Activate your PhonePe merchant account and download your QR.",
    presetTypes: ["phonepe"],
    tags: ["PhonePe", "Merchant Setup", "Business"],
  },
  {
    slug: "is-it-safe-to-scan-upi-qr-code",
    title: "Is It Safe to Scan a UPI QR Code?",
    description: "Security checklist for merchants and customers before scanning.",
    presetTypes: ["phonepe", "gpay", "paytm", "donation"],
    tags: ["Security", "Scam Prevention", "Safety"],
  },
  {
    slug: "prevent-upi-qr-code-tampering-frauds",
    title: "Prevent UPI QR Code Tampering & Frauds",
    description: "Protect your shop counter QR from sticker swaps and scams.",
    presetTypes: ["phonepe", "gpay", "paytm", "donation"],
    tags: ["Security", "Merchant Tips", "Safety"],
  },
  {
    slug: "collect-event-registration-fees-upi-qr",
    title: "Collect Event Registration Fees via UPI QR",
    description: "Use QR posters for workshops, seminars, and ticket booths.",
    presetTypes: ["phonepe", "gpay", "paytm"],
    tags: ["Events", "Fundraising", "Tutorial"],
  },
  {
    slug: "static-vs-dynamic-upi-qr-code-difference",
    title: "Static vs Dynamic UPI QR Code",
    description: "When to use fixed-VPA standees vs amount-locked payment QRs.",
    presetTypes: ["phonepe", "gpay", "paytm", "donation"],
    tags: ["Dynamic QR", "Tutorial", "Merchant Tips"],
    featured: true,
  },
  {
    slug: "how-to-create-upi-qr-without-business-account",
    title: "UPI QR Without a Business Account",
    description: "Create a payment QR using a personal UPI ID — limits and upgrade path.",
    presetTypes: ["phonepe", "gpay", "paytm", "donation"],
    tags: ["Tutorial", "Merchant Tips", "Banking"],
  },
  {
    slug: "upi-qr-code-size-dimensions-printing-guide",
    title: "UPI QR Size & Print Dimensions",
    description: "Minimum QR sizes and standee dimensions for reliable counter scanning.",
    presetTypes: ["phonepe", "gpay", "paytm", "donation"],
    tags: ["Printing Guide", "Merchant Tips", "Tutorial"],
    featured: true,
  },
  {
    slug: "how-to-verify-upi-qr-code-before-displaying",
    title: "Verify UPI QR Before Display",
    description: "Merchant checklist to confirm payee name and VPA before going live.",
    presetTypes: ["phonepe", "gpay", "paytm", "donation"],
    tags: ["Security", "Merchant Tips", "Tutorial"],
  },
  {
    slug: "upi-qr-code-not-scanning-troubleshooting",
    title: "UPI QR Not Scanning — Fixes",
    description: "Troubleshoot glare, blur, size, and VPA errors at shop counters.",
    presetTypes: ["phonepe", "gpay", "paytm", "donation"],
    tags: ["Troubleshooting", "Merchant Tips", "Tutorial"],
  },
  {
    slug: "how-to-accept-upi-payments-without-pos-machine",
    title: "Accept UPI Without a POS Machine",
    description: "Kirana and small shops can skip card terminals with a QR standee.",
    presetTypes: ["phonepe", "gpay", "paytm"],
    tags: ["Shops", "Merchant Tips", "Tutorial"],
    featured: true,
  },
  {
    slug: "paytm-vs-phonepe-vs-gpay-which-qr-best-for-shop",
    title: "Paytm vs PhonePe vs GPay for Shops",
    description: "Why one universal UPI QR works on all three apps.",
    presetTypes: ["phonepe", "gpay", "paytm"],
    tags: ["Comparison", "Merchant Tips", "Reference"],
  },
  {
    slug: "how-to-get-free-upi-qr-code-from-bank",
    title: "Free UPI QR from SBI, HDFC & ICICI",
    description: "Bank-issued QRs vs custom printable standees — when to use each.",
    presetTypes: ["phonepe", "gpay", "paytm", "donation"],
    tags: ["Banking", "Tutorial", "Reference"],
  },
  {
    slug: "upi-qr-for-freelancers-invoice-payments",
    title: "UPI QR for Freelancer Invoices",
    description: "Add scan-to-pay QR to invoices without payment gateway fees.",
    presetTypes: ["phonepe", "gpay", "paytm"],
    tags: ["Freelancer", "Billing", "Tutorial"],
  },
  {
    slug: "upi-qr-code-for-restaurant-cloud-kitchen",
    title: "UPI QR for Restaurants & Cloud Kitchens",
    description: "Table tents, menu QRs, and WhatsApp order payments.",
    presetTypes: ["phonepe", "gpay", "paytm"],
    tags: ["Restaurant", "Shops", "Tutorial"],
  },
  {
    slug: "how-to-add-upi-qr-to-instagram-whatsapp-status",
    title: "UPI QR on Instagram & WhatsApp",
    description: "Share payment QR on social media and WhatsApp Business.",
    presetTypes: ["phonepe", "gpay", "paytm"],
    tags: ["WhatsApp Business", "Social Media", "Tutorial"],
  },
];

const tagToPreset: Record<string, PresetType> = {
  "Google Pay": "gpay",
  GPay: "gpay",
  PhonePe: "phonepe",
  Paytm: "paytm",
  Donations: "donation",
  NGOs: "donation",
};

export function generatorPath(slug: GeneratorSlug, isHindi = false): string {
  return isHindi ? `/hi/${slug}/` : `/${slug}/`;
}

export function guidePath(slug: string): string {
  return `/blog/${slug}/`;
}

export function getOtherGenerators(currentSlug?: GeneratorSlug): GeneratorLink[] {
  return generators.filter((g) => g.slug !== currentSlug);
}

export function getGuidesForPreset(
  presetType: PresetType,
  options: { excludeSlug?: string; limit?: number; featuredOnly?: boolean } = {}
): GuideLink[] {
  const { excludeSlug, limit = 4, featuredOnly = false } = options;

  return guides
    .filter((g) => g.presetTypes.includes(presetType))
    .filter((g) => !featuredOnly || g.featured)
    .filter((g) => g.slug !== excludeSlug)
    .slice(0, limit);
}

export function getFeaturedGuides(limit = 6): GuideLink[] {
  return guides.filter((g) => g.featured).slice(0, limit);
}

export function getGuidesForTags(
  tags: string[],
  options: { excludeSlug?: string; limit?: number } = {}
): GuideLink[] {
  const { excludeSlug, limit = 4 } = options;

  return guides
    .filter((g) => g.slug !== excludeSlug)
    .map((g) => {
      const commonTags = g.tags.filter((t) => tags.includes(t)).length;
      const presetMatch = tags.some((t) => tagToPreset[t] && g.presetTypes.includes(tagToPreset[t]));
      return { guide: g, score: commonTags * 2 + (presetMatch ? 1 : 0) };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.guide);
}

export function getGeneratorCtaForTags(
  tags: string[],
  isHindi = false
): { href: string; label: string; headline: string; description: string } {
  for (const tag of tags) {
    const preset = tagToPreset[tag];
    if (preset) {
      const gen = generators.find((g) => g.presetType === preset)!;
      return {
        href: generatorPath(gen.slug, isHindi),
        label: `Open ${gen.label}`,
        headline: `Ready to create your ${gen.shortLabel} standee?`,
        description: gen.description,
      };
    }
  }

  return {
    href: isHindi ? "/hi/" : "/",
    label: isHindi ? "मुफ्त QR कोड बनाएं" : "Generate Free QR Code Now",
    headline: isHindi
      ? "अपना कस्टम UPI QR कोड स्टैंडी बनाने की जरूरत है?"
      : "Need to create your own UPI QR Code standee?",
    description: isHindi
      ? "30 सेकंड में स्टैंडर्ड अनुपालन पोस्टर बनाएं, कस्टमाइज़ करें और प्रिंट करें।"
      : "Create, customize, and print standard compliant posters in 30 seconds.",
  };
}

export function getPresetFromSlug(slug: GeneratorSlug): PresetType {
  return generators.find((g) => g.slug === slug)!.presetType;
}