import { toPng } from "html-to-image";
import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";

const presetLogos = {
  phonepe: `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="24" fill="#5f259f" /><path d="M50 18 C32.3 18 18 32.3 18 50 C18 67.7 32.3 82 50 82 C67.7 82 82 67.7 82 50 C82 32.3 67.7 18 50 18 Z" fill="#ffffff" opacity="0.1" /><path d="M36 32 C36 30 38 28 40 28 H56 C64.8 28 72 35.2 72 44 C72 52.8 64.8 60 56 60 H48 V72 C48 74.2 46.2 76 44 76 H40 C38 76 36 74 36 72 V32 Z M48 40 V48 H56 C58.2 48 60 46.2 60 44 C60 41.8 58.2 40 56 40 H48 Z" fill="#ffffff" /></svg>`)}`,
  paytm: `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="30" fill="#ffffff" stroke="#00baf2" stroke-width="4" /><text x="50%" y="54%" font-family="sans-serif" font-weight="900" font-size="40" fill="#002e6e" text-anchor="middle">pay</text><text x="50%" y="84%" font-family="sans-serif" font-weight="900" font-size="36" fill="#00baf2" text-anchor="middle">tm</text></svg>`)}`,
  gpay: `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="24" fill="#ffffff" stroke="#f3f4f6" stroke-width="4" /><path d="M50 45 V55 H68 C67 61 62 67 50 67 C39 67 31 59 31 49 C31 39 39 31 50 31 C56 31 60 33 63 36 L70 29 C65 24 58 21 50 21 C33 21 20 34 20 50 C20 66 33 79 50 79 C67 79 79 67 79 50 C79 48 78 46 78 45 H50 Z" fill="#4285f4" /><path d="M31 49 C31 44 32 40 35 36 L27 30 C22 36 20 42 20 50 C20 58 22 64 27 70 L35 64 C32 60 31 56 31 49 Z" fill="#fbcb05" /><path d="M50 21 C58 21 65 24 70 29 L77 22 C69 15 60 11 50 11 C38 11 28 17 22 26 L30 32 C34 26 41 21 50 21 Z" fill="#ea4335" /><path d="M50 79 C41 79 34 74 30 68 L22 74 C28 83 38 89 50 89 C60 89 69 85 75 78 L68 72 C64 76 58 79 50 79 Z" fill="#34a853" /></svg>`)}`,
  bhim: `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="30" fill="#ffffff" stroke="#e5e7eb" stroke-width="2" /><path d="M25 25 L60 85 L25 85 Z" fill="#f05a28" /><path d="M95 95 L60 35 L95 35 Z" fill="#00a651" /><text x="60" y="112" font-family="sans-serif" font-weight="900" font-size="22" fill="#002e6e" text-anchor="middle">BHIM</text></svg>`)}`
};

const presetCovers = {
  saffron: `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#ff7e5f"/><stop offset="100%" stop-color="#feb47b"/></linearGradient></defs><rect width="400" height="200" fill="url(#g)"/><circle cx="200" cy="100" r="85" fill="#ffffff" opacity="0.08"/><circle cx="200" cy="100" r="115" fill="#ffffff" opacity="0.04"/></svg>`)}`,
  grid: `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200"><defs><pattern id="p" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="#287a57" stroke-width="0.75" stroke-opacity="0.12"/></pattern></defs><rect width="400" height="200" fill="#fafafa"/><rect width="400" height="200" fill="url(#p)"/></svg>`)}`,
  cafe: `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#6f4e37"/><stop offset="100%" stop-color="#a67b5b"/></linearGradient></defs><rect width="400" height="200" fill="url(#g)"/><path d="M20 20h20v20H20zm100 80h20v20h-20zm120-60h20v20h-20z" fill="#ffffff" opacity="0.05"/></svg>`)}`,
  waves: `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#4f46e5"/><stop offset="100%" stop-color="#ec4899"/></linearGradient></defs><rect width="400" height="200" fill="url(#g)"/><path d="M 0 100 Q 100 50 200 100 T 400 100 L 400 200 L 0 200 Z" fill="#ffffff" opacity="0.1"/></svg>`)}`,
  ruled: `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200"><defs><pattern id="p" width="10" height="20" patternUnits="userSpaceOnUse"><line x1="0" y1="20" x2="10" y2="20" stroke="#bae6fd" stroke-width="1"/></pattern></defs><rect width="400" height="200" fill="#f8fafc"/><rect width="400" height="200" fill="url(#p)"/><line x1="40" y1="0" x2="40" y2="200" stroke="#f87171" stroke-width="1" opacity="0.4"/></svg>`)}`
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = src;
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
  });
}

function getContrastColor(hexColor: string) {
  if (!hexColor || hexColor.length < 7) return "#ffffff";
  const hex = hexColor.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? "#000000" : "#ffffff";
}

type FormState = {
  payee: string;
  upiId: string;
  amount: string;
  note: string;
  customField: string;
  logoType: "none" | "custom" | "phonepe" | "paytm" | "gpay" | "bhim";
  logoUrl: string;
  logoSize: string;
  logoPosition: "qr-center" | "header";
  coverType: "none" | "custom" | "saffron" | "grid" | "cafe" | "waves" | "ruled";
  coverUrl: string;
  coverPosition: "top-banner" | "full-bg";
  coverOpacity: string;
  themeType: "default" | "custom";
  customBgColor: string;
  customTextColor: string;
  customAccentColor: string;
};

type TemplateId =
  | "shop-standee"
  | "temple-donation"
  | "restaurant-table"
  | "freelancer-card"
  | "event-ticket"
  | "tuition-fees"
  | "taxi-cab"
  | "custom-minimal";

type TemplateDefinition = {
  id: TemplateId;
  name: string;
  kicker: string;
  headline: string;
  helper: string;
  accentClass: string;
  shellClass: string;
  badgeClass: string;
  layout: "shop" | "donation" | "restaurant" | "freelancer" | "event" | "education" | "taxi" | "minimal";
  customFieldLabel?: string;
  customFieldPlaceholder?: string;
};

const examples = [
  "Kirana & retail counters",
  "Freelancer & consultant invoices",
  "Donation & charity events",
  "Restaurant & cafe tables",
  "Cab & auto taxi drivers",
  "School & coaching fees"
];
const draftKey = "upi-qr-draft";
const templateDefinitions: TemplateDefinition[] = [
  {
    id: "shop-standee",
    name: "Shop Standee",
    kicker: "Counter display",
    headline: "Scan to pay at checkout",
    helper: "Perfect for retail counters and quick collections.",
    accentClass: "from-[#fff7d7] via-[#fffaf1] to-[#dff6e7]",
    shellClass: "bg-[#fffdf5] text-[#113b2c] border border-[#dff6e7]",
    badgeClass: "bg-[#113b2c] text-white",
    layout: "shop",
    customFieldLabel: "Counter/GST No. (Optional)",
    customFieldPlaceholder: "Counter 1"
  },
  {
    id: "temple-donation",
    name: "Temple Donation",
    kicker: "Donation poster",
    headline: "Offer your support with one scan",
    helper: "Built for temples, community drives, and charity desks.",
    accentClass: "from-[#143c2b] via-[#21543f] to-[#2a7a57]",
    shellClass: "bg-[#113b2c] text-white border border-[#2a7a57]/30",
    badgeClass: "bg-[#f8b84e] text-[#113b2c]",
    layout: "donation",
    customFieldLabel: "Campaign/Trust Name (Optional)",
    customFieldPlaceholder: "Ganesh Utsav Committee"
  },
  {
    id: "restaurant-table",
    name: "Restaurant Table",
    kicker: "Table tent",
    headline: "Pay your bill in seconds",
    helper: "Great for cafes, food courts, and dine-in tables.",
    accentClass: "from-[#fff1e4] via-[#fffaf1] to-[#f6d6b8]",
    shellClass: "bg-[#fffaf1] text-[#113b2c] border border-[#f6d6b8]",
    badgeClass: "bg-[#ef6f58] text-white",
    layout: "restaurant",
    customFieldLabel: "Table/Cabin Number",
    customFieldPlaceholder: "Table 4"
  },
  {
    id: "freelancer-card",
    name: "Freelancer Card",
    kicker: "Client payment card",
    headline: "Instant payment for your work",
    helper: "Useful for invoices, WhatsApp shares, and service delivery.",
    accentClass: "from-[#eef5ff] via-white to-[#dff6e7]",
    shellClass: "bg-white text-[#113b2c] border border-[#287a57]/10",
    badgeClass: "bg-[#287a57] text-white",
    layout: "freelancer",
    customFieldLabel: "Service/Project Title (Optional)",
    customFieldPlaceholder: "UI Design Services"
  },
  {
    id: "event-ticket",
    name: "Event Pass",
    kicker: "Vibrant ticket style",
    headline: "Scan to register & pay",
    helper: "Show this pass at the entrance after payment.",
    accentClass: "from-[#312e81] via-[#4c1d95] to-[#701a75]",
    shellClass: "bg-white text-[#312e81] border border-purple-100",
    badgeClass: "bg-[#7c3aed] text-white",
    layout: "event",
    customFieldLabel: "Event Date/Venue",
    customFieldPlaceholder: "June 15 • Community Hall"
  },
  {
    id: "tuition-fees",
    name: "Tuition Fees",
    kicker: "Classroom poster style",
    headline: "Pay Class Fees Online",
    helper: "Scan to pay your monthly coaching/class fee.",
    accentClass: "from-[#e0f2fe] via-white to-[#bae6fd]",
    shellClass: "bg-white text-[#0369a1] border border-sky-100",
    badgeClass: "bg-[#0284c7] text-white",
    layout: "education",
    customFieldLabel: "Subject/Batch (Optional)",
    customFieldPlaceholder: "Class X - Physics"
  },
  {
    id: "taxi-cab",
    name: "Cab / Taxi Card",
    kicker: "Driver dashboard card",
    headline: "Scan to Pay Driver",
    helper: "Thank you for riding with us!",
    accentClass: "from-[#fef08a] via-neutral-900 to-black",
    shellClass: "bg-neutral-950 text-[#fef08a] border border-[#fef08a]/20",
    badgeClass: "bg-[#eab308] text-black font-black",
    layout: "taxi",
    customFieldLabel: "Cab/Vehicle No.",
    customFieldPlaceholder: "DL 1CA 1234"
  },
  {
    id: "custom-minimal",
    name: "Custom Minimal",
    kicker: "Clean executive card",
    headline: "Scan to Pay",
    helper: "Instant UPI Transfer",
    accentClass: "from-[#f3f4f6] via-[#fafafa] to-[#e5e7eb]",
    shellClass: "bg-white text-neutral-800 border border-neutral-200",
    badgeClass: "bg-neutral-800 text-white",
    layout: "minimal",
    customFieldLabel: "Reference ID (Optional)",
    customFieldPlaceholder: "REF-98765"
  }
];

function buildUpiUrl(values: FormState) {
  const params = new URLSearchParams({
    pa: values.upiId.trim(),
    pn: values.payee.trim()
  });

  if (values.amount.trim()) {
    params.set("am", values.amount.trim());
  }

  if (values.note.trim()) {
    params.set("tn", values.note.trim());
  }

  params.set("cu", "INR");

  return `upi://pay?${params.toString()}`;
}

function isValidUpiId(upiId: string) {
  return /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(upiId.trim());
}

const translations = {
  en: {
    simpleQr: "Simple QR",
    advancedPoster: "Advanced Poster",
    payeeName: "Payee name",
    payeePlaceholder: "Shree Ganesh Store",
    upiId: "UPI ID",
    upiIdPlaceholder: "ganeshstore@oksbi",
    qrLogoBadge: "QR Logo Badge",
    none: "None",
    gpay: "GPay",
    phonepe: "PhonePe",
    bhim: "BHIM",
    paytm: "Paytm",
    custom: "Custom",
    uploadCustomLogo: "Upload Custom Logo",
    posterTemplateStyle: "Poster template style",
    addAmountNote: "💰 Add Amount & Note (Optional)",
    hide: "Hide ▲",
    configure: "Configure ▼",
    amount: "Amount",
    amountPlaceholder: "250",
    amountHelper: "{t.amountHelper}",
    note: "Note / Message",
    notePlaceholder: "June tuition fee",
    customizeDesign: "🎨 Customize Design (Logos & Covers)",
    themePreset: "Theme Color Preset",
    default: "Default Green",
    mintyFresh: "Minty Fresh",
    goldenSun: "Golden Sun",
    midnightRed: "Midnight Red",
    customColors: "Custom Colors",
    bgColor: "Background Color",
    accentColor: "Accent Color",
    textColor: "Text Color",
    generateUpiQr: "Generate UPI QR",
    exploreTemplates: "Explore templates",
    enterDetailsClick: "Enter details & click Generate",
    instantScanToPay: "Your instant scan-to-pay QR code will appear here.",
    downloadQrCode: "Download QR Code",
    copyUpiLink: "Copy UPI link",
    copied: "Copied",
    copyFailed: "Copy failed",
    preparingPoster: "Preparing poster...",
    downloadPoster: "Download poster",
    draftAutoSaves: "Draft auto-saves in this browser so you can come back and keep editing.",
    enterNameError: "Enter the name that should appear on the payment QR.",
    enterUpiIdError: "Enter a valid UPI ID (e.g. name@bank).",
    invalidUpiIdError: "Please enter a valid UPI ID (e.g. name@bank).",
    qrPreview: "QR Preview",
    simpleScanQr: "Simple Scan QR",
    standardFormat: "Standard format",
    templatePreview: "Template preview",
    yourBusinessName: "Your business name",
    yourNameBank: "yourname@bank"
  },
  hi: {
    simpleQr: "साधारण QR",
    advancedPoster: "एडवांस्ड पोस्टर",
    payeeName: "प्राप्तकर्ता का नाम",
    payeePlaceholder: "श्री गणेश स्टोर",
    upiId: "UPI आईडी",
    upiIdPlaceholder: "ganeshstore@oksbi",
    qrLogoBadge: "QR लोगो बैज",
    none: "कोई नहीं",
    gpay: "GPay",
    phonepe: "PhonePe",
    bhim: "BHIM",
    paytm: "Paytm",
    custom: "कस्टम",
    uploadCustomLogo: "कस्टम लोगो अपलोड करें",
    posterTemplateStyle: "पोस्टर टेम्पलेट स्टाइल",
    addAmountNote: "💰 राशि और संदेश जोड़ें (वैकल्पिक)",
    hide: "छिपाएं ▲",
    configure: "सेट करें ▼",
    amount: "राशि (रुपये)",
    amountPlaceholder: "250",
    amountHelper: "निश्चित राशि तभी दर्ज करें जब आप फीस, इवेंट या तय कीमत के लिए बिलिंग करना चाहते हैं।",
    note: "संदेश / नोट",
    notePlaceholder: "जून की ट्यूशन फीस",
    customizeDesign: "🎨 डिज़ाइन बदलें (लोगो और कवर्स)",
    themePreset: "थीम कलर प्रीसेट",
    default: "डिफ़ॉल्ट हरा",
    mintyFresh: "ताज़ा पुदीना",
    goldenSun: "सुनहरा सूरज",
    midnightRed: "आधी रात का लाल",
    customColors: "कस्टम रंग",
    bgColor: "पृष्ठभूमि (Background) रंग",
    accentColor: "मुख्य (Accent) रंग",
    textColor: "टेक्स्ट का रंग",
    generateUpiQr: "UPI QR जनरेट करें",
    exploreTemplates: "टेम्पलेट्स देखें",
    enterDetailsClick: "विवरण दर्ज करें और जनरेट पर क्लिक करें",
    instantScanToPay: "आपका तुरंत स्कैन-टू-पे QR कोड यहाँ दिखाई देगा।",
    downloadQrCode: "QR कोड डाउनलोड करें",
    copyUpiLink: "UPI लिंक कॉपी करें",
    copied: "कॉपी हो गया",
    copyFailed: "कॉपी करने में विफल",
    preparingPoster: "पोस्टर तैयार हो रहा है...",
    downloadPoster: "पोस्टर डाउनलोड करें",
    draftAutoSaves: "ड्राफ्ट इस ब्राउज़र में ऑटो-सेव होता है ताकि आप वापस आकर बदलाव कर सकें।",
    enterNameError: "वह नाम दर्ज करें जो भुगतान QR पर दिखाई देना चाहिए।",
    enterUpiIdError: "एक वैध UPI आईडी दर्ज करें (जैसे name@bank)।",
    invalidUpiIdError: "कृपया एक वैध UPI आईडी दर्ज करें (जैसे name@bank)।",
    qrPreview: "QR पूर्वावलोकन",
    simpleScanQr: "साधारण स्कैन QR",
    standardFormat: "मानक प्रारूप",
    templatePreview: "टेम्पलेट पूर्वावलोकन",
    yourBusinessName: "आपके व्यवसाय का नाम",
    yourNameBank: "yourname@bank"
  }
};

export interface GeneratorFormProps {
  presetType?: "phonepe" | "gpay" | "paytm" | "donation";
  lang?: "en" | "hi";
  fullScreen?: boolean;
}

export function GeneratorForm({ presetType, lang = "en", fullScreen = false }: GeneratorFormProps = {}) {
  const t = translations[lang];
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const posterRef = useRef<HTMLDivElement | null>(null);
  const [form, setForm] = useState<FormState>({
    payee: "",
    upiId: "",
    amount: "",
    note: "",
    customField: "",
    logoType: "none",
    logoUrl: "",
    logoSize: "45",
    logoPosition: "qr-center",
    coverType: "none",
    coverUrl: "",
    coverPosition: "top-banner",
    coverOpacity: "30",
    themeType: "default",
    customBgColor: "#ffffff",
    customTextColor: "#113b2c",
    customAccentColor: "#287a57"
  });
  const [error, setError] = useState("");
  const [generated, setGenerated] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [downloadState, setDownloadState] = useState<"idle" | "busy" | "error">("idle");
  const [posterState, setPosterState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId>("shop-standee");

  const [showOptionalFields, setShowOptionalFields] = useState(false);
  const [showBrandingFields, setShowBrandingFields] = useState(false);
  const [mode, setMode] = useState<"simple" | "advanced">("simple");

  const upiUrl = useMemo(() => buildUpiUrl(form), [form]);

  const isInitialized = useRef(false);

  useEffect(() => {
    let initialForm: FormState = {
      payee: "",
      upiId: "",
      amount: "",
      note: "",
      customField: "",
      logoType: "none",
      logoUrl: "",
      logoSize: "45",
      logoPosition: "qr-center",
      coverType: "none",
      coverUrl: "",
      coverPosition: "top-banner",
      coverOpacity: "30",
      themeType: "default",
      customBgColor: "#ffffff",
      customTextColor: "#113b2c",
      customAccentColor: "#287a57"
    };
    let initialTemplate: TemplateId = "shop-standee";
    let initialMode: "simple" | "advanced" = "simple";
    let initialShowOptional = false;
    let initialShowBranding = false;

    // 1. Try to load from draft
    const savedDraft = window.localStorage.getItem(draftKey);
    if (savedDraft) {
      try {
        const parsed = JSON.parse(savedDraft) as Partial<FormState>;
        initialForm = {
          ...initialForm,
          ...parsed,
          logoUrl: "",
          coverUrl: ""
        };
        if (parsed.amount || parsed.note) {
          initialShowOptional = true;
        }
        if ((parsed.logoType && parsed.logoType !== "none") || (parsed.coverType && parsed.coverType !== "none")) {
          initialShowBranding = true;
        }
      } catch {
        window.localStorage.removeItem(draftKey);
      }
    }

    // 2. If presetType is defined, override specific preset settings
    if (presetType) {
      initialMode = "advanced";
      if (presetType === "phonepe") {
        initialForm.logoType = "phonepe";
        initialForm.logoPosition = "qr-center";
        initialShowBranding = true;
      } else if (presetType === "gpay") {
        initialForm.logoType = "gpay";
        initialForm.logoPosition = "qr-center";
        initialShowBranding = true;
      } else if (presetType === "paytm") {
        initialForm.logoType = "paytm";
        initialForm.logoPosition = "qr-center";
        initialShowBranding = true;
      } else if (presetType === "donation") {
        initialTemplate = "temple-donation";
      }
    }

    // Apply all initial states
    setForm(initialForm);
    setSelectedTemplate(initialTemplate);
    setMode(initialMode);
    setShowOptionalFields(initialShowOptional);
    setShowBrandingFields(initialShowBranding);
    
    // Mark as initialized so saving effect can write updates
    isInitialized.current = true;
  }, [presetType]);

  useEffect(() => {
    if (!isInitialized.current) {
      return;
    }
    // Exclude large dataURLs from localStorage to prevent quota limit errors
    const { logoUrl, coverUrl, ...savableForm } = form;
    window.localStorage.setItem(draftKey, JSON.stringify(savableForm));
  }, [form]);

  const activeTemplate =
    templateDefinitions.find((template) => template.id === selectedTemplate) ?? templateDefinitions[0];

  const posterHeightClass = fullScreen ? 'min-h-[380px]' : 'min-h-[460px]';

  useEffect(() => {
    if (!generated) {
      return;
    }

    void renderQr(form);
  }, [form, generated]);

  async function renderQr(nextForm: FormState) {
    if (!canvasRef.current) {
      return;
    }

    const canvas = canvasRef.current;

    await QRCode.toCanvas(canvas, buildUpiUrl(nextForm), {
      width: 320,
      margin: 1,
      errorCorrectionLevel: "H",
      color: {
        dark: "#1c1917",
        light: "#ffffff"
      }
    });

    const showQrLogo = nextForm.logoPosition === "qr-center" && nextForm.logoType !== "none";
    if (showQrLogo) {
      let logoSrc = "";
      if (nextForm.logoType === "custom") {
        logoSrc = nextForm.logoUrl;
      } else {
        logoSrc = presetLogos[nextForm.logoType as keyof typeof presetLogos];
      }

      if (logoSrc) {
        try {
          const logoImg = await loadImage(logoSrc);
          const ctx = canvas.getContext("2d");
          if (ctx) {
            const size = Number(nextForm.logoSize) || 45;
            const x = (canvas.width - size) / 2;
            const y = (canvas.height - size) / 2;

            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            if (ctx.roundRect) {
              ctx.roundRect(x - 4, y - 4, size + 8, size + 8, 8);
            } else {
              ctx.rect(x - 4, y - 4, size + 8, size + 8);
            }
            ctx.fill();

            ctx.drawImage(logoImg, x, y, size, size);
          }
        } catch (err) {
          console.error("Error drawing logo on QR code:", err);
        }
      }
    }

    setQrDataUrl(canvas.toDataURL("image/png"));
    setPosterState("done");
  }

  async function handleGenerate() {
    if (!form.payee.trim()) {
      setError(t.enterNameError);
      return;
    }

    if (!isValidUpiId(form.upiId)) {
      setError("Enter a valid UPI ID like name@bank.");
      return;
    }

    if (form.amount && Number(form.amount) <= 0) {
      setError("Amount must be greater than zero.");
      return;
    }

    setError("");
    setPosterState("busy");

    try {
      await renderQr(form);
      setGenerated(true);
    } catch {
      setError("Something went wrong while generating the QR. Please try again.");
      setPosterState("error");
    }
  }

  function updateField(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function selectCoverType(type: FormState["coverType"]) {
    let url = "";
    if (type !== "none" && type !== "custom") {
      url = presetCovers[type as keyof typeof presetCovers];
    }
    setForm((current) => ({
      ...current,
      coverType: type,
      coverUrl: url
    }));
  }

  function handleLogoUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 1024 * 1024) {
      alert("Logo image size should be less than 1MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setForm((current) => ({
        ...current,
        logoType: "custom",
        logoUrl: dataUrl
      }));
    };
    reader.readAsDataURL(file);
  }

  function handleCoverUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 1.5 * 1024 * 1024) {
      alert("Cover image size should be less than 1.5MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setForm((current) => ({
        ...current,
        coverType: "custom",
        coverUrl: dataUrl
      }));
    };
    reader.readAsDataURL(file);
  }

  function downloadPng() {
    if (!canvasRef.current) {
      return;
    }

    const safeName = (form.payee || "upi-qr")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const link = document.createElement("a");
    link.href = canvasRef.current.toDataURL("image/png");
    link.download = `${safeName || "upi-qr"}.png`;
    link.click();
  }

  async function copyUpiLink() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(upiUrl);
      } else {
        const helper = document.createElement("textarea");
        helper.value = upiUrl;
        helper.setAttribute("readonly", "true");
        helper.style.position = "absolute";
        helper.style.left = "-9999px";
        document.body.appendChild(helper);
        helper.select();
        document.execCommand("copy");
        helper.remove();
      }

      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1800);
    } catch {
      setCopyState("error");
    }
  }

  async function downloadPoster() {
    if (!posterRef.current || !generated) {
      return;
    }

    try {
      setDownloadState("busy");
      const el = posterRef.current;
      
      // Create a temporary clone styled with standard positive coords, desktop layout width, and 0 opacity.
      // 0 opacity hides it from the viewport, but keeping it visible to the layout engine guarantees mobile browsers render it.
      const clone = el.cloneNode(true) as HTMLDivElement;
      clone.style.position = 'fixed';
      clone.style.left = '0';
      clone.style.top = '0';
      clone.style.zIndex = '-9999';
      clone.style.opacity = '0';
      clone.style.pointerEvents = 'none';
      clone.style.width = '360px';
      clone.style.minWidth = '360px';
      clone.style.maxWidth = '360px';
      clone.style.padding = '16px';
      clone.style.boxSizing = 'border-box';
      clone.style.height = 'auto';
      
      document.body.appendChild(clone);
      
      // Give a layout and image decoding settle time (200ms for mobile network/cache decoding)
      await new Promise((resolve) => setTimeout(resolve, 200));
      
      const measuredHeight = clone.offsetHeight;
      const targetHeight = measuredHeight || 520;

      // Render the clone. We explicitly set style opacity to '1' so the generated canvas/PNG has 100% visibility.
      const dataUrl = await toPng(clone, {
        cacheBust: true,
        pixelRatio: 3, // High-res export
        width: 360,
        height: targetHeight,
        style: {
          opacity: '1',
          transform: 'none',
          transformOrigin: 'top left',
          width: '360px',
          height: `${targetHeight}px`,
          maxWidth: '360px',
          maxHeight: `${targetHeight}px`,
          minWidth: '360px',
          minHeight: `${targetHeight}px`,
          margin: '0',
          padding: '16px',
          boxSizing: 'border-box'
        }
      });
      
      document.body.removeChild(clone);

      const safeName = (form.payee || activeTemplate.name)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `${safeName || "upi-template"}-${activeTemplate.id}.png`;
      link.click();
      setDownloadState("idle");
    } catch (err) {
      console.error("Download failed:", err);
      setDownloadState("error");
    }
  }

  const amountLabel = form.amount ? `₹${form.amount}` : "Any amount";
  const noteLabel = form.note.trim() || activeTemplate.helper;
  const payeeLabel = form.payee.trim() || "Your business name";
  const upiLabel = form.upiId.trim() || "yourname@bank";

  function renderTemplateContent() {
    const customLabel = form.customField.trim();
    const isCustomTheme = form.themeType === "custom";

    const containerStyle = isCustomTheme ? {
      backgroundColor: form.customBgColor,
      backgroundImage: "none",
      color: form.customTextColor,
      borderColor: `${form.customTextColor}20`,
    } : {};

    const textColorStyle = isCustomTheme ? { color: form.customTextColor } : {};
    const textSubColorStyle = isCustomTheme ? { color: `${form.customTextColor}80` } : {};
    const labelBgStyle = isCustomTheme ? { backgroundColor: `${form.customTextColor}0c` } : {};
    const badgeStyle = isCustomTheme ? {
      backgroundColor: form.customAccentColor,
      color: getContrastColor(form.customAccentColor)
    } : {};

    const headerLogoBlock =
      form.logoPosition === "header" && form.logoType !== "none" ? (
        <div className="w-10 h-10 rounded-xl bg-white p-1 shadow-sm overflow-hidden flex items-center justify-center shrink-0 border border-white/20">
          <img
            src={
              form.logoType === "custom"
                ? form.logoUrl || "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
                : presetLogos[form.logoType as keyof typeof presetLogos]
            }
            alt="Logo"
            className="max-w-full max-h-full object-contain rounded-lg"
          />
        </div>
      ) : null;

    const coverTopBlock =
      form.coverType !== "none" && form.coverUrl && form.coverPosition === "top-banner" ? (
        <div className="mb-4 overflow-hidden rounded-xl h-24 w-full relative shrink-0 shadow-inner z-10 border border-black/5">
          <img src={form.coverUrl} className="w-full h-full object-cover" alt="Banner" />
        </div>
      ) : null;

    const coverBgBlock =
      form.coverType !== "none" && form.coverUrl && form.coverPosition === "full-bg" ? (
        <div
          className="absolute inset-0 z-0 pointer-events-none rounded-[1.45rem]"
          style={{
            backgroundImage: `url("${form.coverUrl}")`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            opacity: Number(form.coverOpacity) / 100
          }}
        />
      ) : null;

    const qrBlock = (
      <div className="mt-5 rounded-[1.5rem] bg-white/95 p-4 text-center text-[#113b2c] shadow-sm relative overflow-hidden z-10">
        {qrDataUrl ? (
          <img src={qrDataUrl} alt="Generated UPI QR code" className="mx-auto w-full max-w-[210px] rounded-2xl bg-white" />
        ) : (
          <div className="mx-auto aspect-square w-full max-w-[210px] rounded-2xl border-2 border-dashed border-forest/20 bg-[#fffaf1] flex items-center justify-center">
            <span className="text-xs text-forest/40 font-semibold">QR Code Container</span>
          </div>
        )}
        {!generated && (
          <p className="mx-auto mt-3 max-w-[15rem] text-[11px] leading-relaxed text-forest/60">
            Fill details, click Generate to activate this QR code.
          </p>
        )}
      </div>
    );

    switch (activeTemplate.layout) {
      case "shop":
        return (
          <div 
            className={`rounded-[1.45rem] ${activeTemplate.shellClass} p-5 relative overflow-hidden ${posterHeightClass} flex flex-col justify-between`}
            style={containerStyle}
          >
            {coverBgBlock}
            {!isCustomTheme && <div className="absolute top-0 right-0 w-24 h-24 bg-leaf/5 rounded-full -mr-8 -mt-8 pointer-events-none" />}
            
            <div className="relative z-10 w-full">
              {coverTopBlock}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-leaf/80" style={textSubColorStyle}>
                    {activeTemplate.kicker}
                  </p>
                  <h4 className="mt-1 max-w-[12rem] text-2xl font-black leading-tight text-forest" style={textColorStyle}>
                    {activeTemplate.headline}
                  </h4>
                </div>
                <div className="flex items-center gap-2">
                  {headerLogoBlock}
                  <span 
                    className={`rounded-full px-3 py-1 text-[10px] font-black tracking-wider ${activeTemplate.badgeClass}`}
                    style={badgeStyle}
                  >
                    UPI PAY
                  </span>
                </div>
              </div>

              {qrBlock}

              <div className="mt-5 space-y-4">
                <div className="border-b border-forest/10 pb-3 text-center" style={isCustomTheme ? { borderColor: `${form.customTextColor}20` } : {}}>
                  <p className="text-xl font-black tracking-tight text-forest truncate" style={textColorStyle}>{payeeLabel}</p>
                  {customLabel ? (
                    <p 
                      className="mt-1 text-xs font-bold text-leaf bg-mint/50 inline-block px-3 py-0.5 rounded-full truncate max-w-full"
                      style={isCustomTheme ? { color: form.customTextColor, backgroundColor: `${form.customTextColor}12` } : {}}
                    >
                      {customLabel}
                    </p>
                  ) : activeTemplate.customFieldPlaceholder ? (
                    <p 
                      className="mt-1 text-xs font-bold text-leaf/50 bg-mint/30 inline-block px-3 py-0.5 rounded-full border border-dashed border-leaf/25"
                      style={isCustomTheme ? { color: `${form.customTextColor}60`, backgroundColor: `${form.customTextColor}06`, borderColor: `${form.customTextColor}25` } : {}}
                    >
                      {activeTemplate.customFieldPlaceholder} (Sample)
                    </p>
                  ) : null}
                </div>
                
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-xl bg-forest/5 p-2.5" style={labelBgStyle}>
                    <p className="font-bold uppercase tracking-[0.1em] text-forest/50 text-[9px]" style={textSubColorStyle}>Amount</p>
                    <p className="mt-0.5 font-extrabold text-forest text-sm" style={textColorStyle}>{amountLabel}</p>
                  </div>
                  <div className="rounded-xl bg-forest/5 p-2.5" style={labelBgStyle}>
                    <p className="font-bold uppercase tracking-[0.1em] text-forest/50 text-[9px]" style={textSubColorStyle}>UPI ID</p>
                    <p className="mt-0.5 font-extrabold text-forest truncate text-sm" style={textColorStyle}>{upiLabel}</p>
                  </div>
                </div>

                {form.note.trim() && (
                  <div className="rounded-xl bg-forest/5 p-2.5 text-xs" style={labelBgStyle}>
                    <p className="font-bold uppercase tracking-[0.1em] text-forest/50 text-[9px]" style={textSubColorStyle}>Message</p>
                    <p className="mt-0.5 font-semibold text-forest truncate" style={textColorStyle}>{noteLabel}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-5 flex items-center justify-center gap-2 opacity-60 relative z-10">
              <span className="w-1.5 h-1.5 rounded-full bg-forest" style={isCustomTheme ? { backgroundColor: form.customTextColor } : {}} />
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-forest" style={textColorStyle}>Scan with any UPI App</p>
              <span className="w-1.5 h-1.5 rounded-full bg-forest" style={isCustomTheme ? { backgroundColor: form.customTextColor } : {}} />
            </div>
          </div>
        );

      case "donation":
        return (
          <div 
            className={`rounded-[1.45rem] ${activeTemplate.shellClass} p-5 relative border-2 border-sun/30 ${posterHeightClass} flex flex-col justify-between`}
            style={containerStyle}
          >
            {coverBgBlock}
            {!isCustomTheme && <div className="absolute inset-2 border border-sun/20 pointer-events-none rounded-[1rem] z-0" />}
            
            <div className="relative z-10 w-full">
              {coverTopBlock}
              <div className="text-center pt-2">
                <div className="flex items-center justify-center gap-2.5">
                  {headerLogoBlock}
                  <span 
                    className={`inline-block rounded-full px-3 py-0.5 text-[9px] font-black uppercase tracking-widest ${activeTemplate.badgeClass}`}
                    style={badgeStyle}
                  >
                    DONATION
                  </span>
                </div>
                <h4 className="mt-2 text-2xl font-black leading-tight text-white drop-shadow-sm px-2" style={textColorStyle}>
                  {activeTemplate.headline}
                </h4>
                <p className="mt-1 text-xs text-white/80 italic font-medium truncate px-2" style={textSubColorStyle}>
                  "{activeTemplate.helper}"
                </p>
              </div>

              {qrBlock}

              <div className="mt-4 space-y-3 text-center text-white" style={textColorStyle}>
                <div 
                  className="bg-white/10 backdrop-blur-sm rounded-xl p-3 border border-white/10"
                  style={isCustomTheme ? { backgroundColor: `${form.customTextColor}08`, borderColor: `${form.customTextColor}15` } : {}}
                >
                  <p className="text-xs uppercase tracking-wider text-sun font-bold" style={textSubColorStyle}>Beneficiary</p>
                  <p className="text-lg font-black tracking-wide mt-0.5 truncate">{payeeLabel}</p>
                  {customLabel ? (
                    <p 
                      className="text-xs text-white font-semibold mt-1 bg-white/15 inline-block px-3 py-0.5 rounded-full truncate max-w-full"
                      style={isCustomTheme ? { color: form.customTextColor, backgroundColor: `${form.customTextColor}15` } : {}}
                    >
                      {customLabel}
                    </p>
                  ) : activeTemplate.customFieldPlaceholder ? (
                    <p 
                      className="text-xs text-white/50 font-semibold mt-1 bg-white/5 inline-block px-3 py-0.5 rounded-full border border-dashed border-white/20"
                      style={isCustomTheme ? { color: `${form.customTextColor}60`, backgroundColor: `${form.customTextColor}06`, borderColor: `${form.customTextColor}20` } : {}}
                    >
                      {activeTemplate.customFieldPlaceholder} (Sample)
                    </p>
                  ) : null}
                </div>

                <div className="grid grid-cols-2 gap-2.5 text-left">
                  <div 
                    className="bg-white/10 backdrop-blur-sm rounded-xl p-2.5 border border-white/10"
                    style={isCustomTheme ? { backgroundColor: `${form.customTextColor}08`, borderColor: `${form.customTextColor}15` } : {}}
                  >
                    <p className="text-[9px] uppercase tracking-wider text-sun font-bold" style={textSubColorStyle}>Suggested Amount</p>
                    <p className="text-sm font-bold mt-0.5">{amountLabel}</p>
                  </div>
                  <div 
                    className="bg-white/10 backdrop-blur-sm rounded-xl p-2.5 border border-white/10"
                    style={isCustomTheme ? { backgroundColor: `${form.customTextColor}08`, borderColor: `${form.customTextColor}15` } : {}}
                  >
                    <p className="text-[9px] uppercase tracking-wider text-sun font-bold" style={textSubColorStyle}>UPI ID</p>
                    <p className="text-sm font-bold truncate mt-0.5">{upiLabel}</p>
                  </div>
                </div>

                {form.note.trim() && (
                  <div 
                    className="bg-white/10 backdrop-blur-sm rounded-xl p-2.5 border border-white/10 text-left"
                    style={isCustomTheme ? { backgroundColor: `${form.customTextColor}08`, borderColor: `${form.customTextColor}15` } : {}}
                  >
                    <p className="text-[9px] uppercase tracking-wider text-sun font-bold" style={textSubColorStyle}>Campaign Code / Purpose</p>
                    <p className="text-xs font-semibold mt-0.5 truncate">{noteLabel}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 text-center relative z-10">
              <p className="text-[9px] font-bold uppercase tracking-widest text-sun" style={textSubColorStyle}>May the divine bless your support</p>
            </div>
          </div>
        );

      case "restaurant":
        return (
          <div 
            className={`rounded-[1.45rem] ${activeTemplate.shellClass} p-5 relative overflow-hidden ${posterHeightClass} flex flex-col justify-between`}
            style={containerStyle}
          >
            {coverBgBlock}
            {!isCustomTheme && <div className="absolute top-0 left-0 right-0 h-2 bg-coral pointer-events-none z-10" />}
            
            <div className="relative z-10 w-full">
              {coverTopBlock}
              <div className="flex items-start justify-between gap-3 pt-2">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-coral" style={textSubColorStyle}>
                    {activeTemplate.kicker}
                  </p>
                  <h4 className="mt-1 text-2xl font-black leading-tight text-forest" style={textColorStyle}>
                    {activeTemplate.headline}
                  </h4>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <div className="flex items-center gap-2">
                    {headerLogoBlock}
                    <span 
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-black ${activeTemplate.badgeClass}`}
                      style={badgeStyle}
                    >
                      TABLE PAY
                    </span>
                  </div>
                  {customLabel ? (
                    <span 
                      className="bg-forest text-white text-xs font-black px-2.5 py-1 rounded-md shadow-sm truncate max-w-[120px]"
                      style={isCustomTheme ? { backgroundColor: form.customAccentColor, color: getContrastColor(form.customAccentColor) } : {}}
                    >
                      {customLabel}
                    </span>
                  ) : activeTemplate.customFieldPlaceholder ? (
                    <span 
                      className="bg-forest/20 text-forest/40 text-xs font-black px-2.5 py-1 rounded-md border border-dashed border-forest/20"
                      style={isCustomTheme ? { color: `${form.customTextColor}50`, backgroundColor: `${form.customTextColor}10`, borderColor: `${form.customTextColor}25` } : {}}
                    >
                      {activeTemplate.customFieldPlaceholder} (Sample)
                    </span>
                  ) : null}
                </div>
              </div>

              {qrBlock}

              <div 
                className="mt-4 border-2 border-dashed border-coral/20 rounded-2xl p-4 bg-white/50 space-y-3"
                style={isCustomTheme ? { backgroundColor: `${form.customTextColor}08`, borderColor: `${form.customTextColor}15` } : {}}
              >
                <div className="text-center border-b border-coral/10 pb-2" style={isCustomTheme ? { borderColor: `${form.customTextColor}15` } : {}}>
                  <p className="text-[10px] uppercase tracking-wider text-forest/50 font-bold" style={textSubColorStyle}>Merchant Partner</p>
                  <p className="text-lg font-black text-forest truncate" style={textColorStyle}>{payeeLabel}</p>
                </div>

                <div className="space-y-1.5 text-xs text-forest/80" style={textColorStyle}>
                  <div className="flex justify-between">
                    <span className="font-semibold text-forest/60" style={textSubColorStyle}>Amount Payable:</span>
                    <span className="font-bold text-forest" style={textColorStyle}>{amountLabel}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-semibold text-forest/60" style={textSubColorStyle}>VPA Address:</span>
                    <span className="font-bold text-forest truncate max-w-[120px]" style={textColorStyle}>{upiLabel}</span>
                  </div>
                  {form.note.trim() && (
                    <div className="flex justify-between pt-1 border-t border-coral/10" style={isCustomTheme ? { borderColor: `${form.customTextColor}15` } : {}}>
                      <span className="font-semibold text-forest/60" style={textSubColorStyle}>Order Note:</span>
                      <span className="font-bold text-forest truncate max-w-[120px]" style={textColorStyle}>{noteLabel}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-4 text-center relative z-10">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-coral" style={textSubColorStyle}>Self Service • Secure Checkout</p>
            </div>
          </div>
        );

      case "freelancer":
        return (
          <div 
            className={`rounded-[1.45rem] ${activeTemplate.shellClass} p-5 relative ${posterHeightClass} flex flex-col justify-between`}
            style={containerStyle}
          >
            {coverBgBlock}
            {!isCustomTheme && <div className="absolute top-0 right-0 w-32 h-32 bg-mint/30 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none" />}
            
            <div className="relative z-10 w-full">
              {coverTopBlock}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-leaf animate-pulse" style={isCustomTheme ? { backgroundColor: form.customTextColor } : {}} />
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-leaf" style={textSubColorStyle}>
                    {activeTemplate.kicker}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {headerLogoBlock}
                  <span 
                    className={`rounded-full px-3 py-1 text-[9px] font-black tracking-wider ${activeTemplate.badgeClass}`}
                    style={badgeStyle}
                  >
                    DIRECT PAY
                  </span>
                </div>
              </div>

              <h4 className="mt-3 text-2xl font-black leading-tight text-forest" style={textColorStyle}>
                {activeTemplate.headline}
              </h4>

              {qrBlock}

              <div className="mt-4 space-y-3.5">
                <div 
                  className="rounded-xl border border-leaf/10 bg-mint/20 p-3"
                  style={isCustomTheme ? { backgroundColor: `${form.customTextColor}08`, borderColor: `${form.customTextColor}15` } : {}}
                >
                  <p className="text-[9px] uppercase tracking-wider text-forest/50 font-bold" style={textSubColorStyle}>Recipient</p>
                  <p className="text-base font-black text-forest truncate" style={textColorStyle}>{payeeLabel}</p>
                  {customLabel ? (
                    <p className="text-xs font-bold text-leaf mt-1 truncate" style={textColorStyle}>
                      💼 {customLabel}
                    </p>
                  ) : activeTemplate.customFieldPlaceholder ? (
                    <p className="text-xs font-bold text-leaf/50 mt-1 italic" style={textSubColorStyle}>
                      💼 {activeTemplate.customFieldPlaceholder} (Sample)
                    </p>
                  ) : null}
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div 
                    className="rounded-xl border border-forest/10 p-2.5 bg-white"
                    style={isCustomTheme ? { backgroundColor: `${form.customBgColor}`, borderColor: `${form.customTextColor}15` } : {}}
                  >
                    <p className="font-bold uppercase tracking-[0.1em] text-forest/50 text-[9px]" style={textSubColorStyle}>Requested Amount</p>
                    <p className="mt-0.5 font-bold text-forest text-sm" style={textColorStyle}>{amountLabel}</p>
                  </div>
                  <div 
                    className="rounded-xl border border-forest/10 p-2.5 bg-white"
                    style={isCustomTheme ? { backgroundColor: `${form.customBgColor}`, borderColor: `${form.customTextColor}15` } : {}}
                  >
                    <p className="font-bold uppercase tracking-[0.1em] text-forest/50 text-[9px]" style={textSubColorStyle}>UPI Address</p>
                    <p className="mt-0.5 font-bold text-forest truncate text-sm" style={textColorStyle}>{upiLabel}</p>
                  </div>
                </div>

                {form.note.trim() && (
                  <div 
                    className="rounded-xl border border-forest/10 p-2.5 text-xs bg-mint/5"
                    style={isCustomTheme ? { backgroundColor: `${form.customTextColor}05`, borderColor: `${form.customTextColor}15` } : {}}
                  >
                    <p className="font-bold uppercase tracking-[0.1em] text-forest/50 text-[9px]" style={textSubColorStyle}>Reference Note</p>
                    <p className="mt-0.5 font-medium text-forest truncate" style={textColorStyle}>{noteLabel}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      case "event":
        return (
          <div 
            className={`rounded-[1.45rem] ${activeTemplate.shellClass} p-5 relative overflow-hidden bg-gradient-to-br from-[#1e1b4b] to-[#311042] text-white ${posterHeightClass} flex flex-col justify-between`}
            style={containerStyle}
          >
            {coverBgBlock}
            {!isCustomTheme && <div className="absolute top-0 right-0 w-24 h-24 bg-pink-500/10 rounded-full blur-xl pointer-events-none" />}
            {!isCustomTheme && <div className="absolute bottom-0 left-0 w-24 h-24 bg-indigo-500/10 rounded-full blur-xl pointer-events-none" />}

            <div className="relative z-10 w-full">
              {coverTopBlock}
              <div className="flex items-center justify-between border-b border-white/10 pb-3" style={isCustomTheme ? { borderColor: `${form.customTextColor}20` } : {}}>
                <div>
                  <span 
                    className="text-[9px] font-black bg-pink-600 text-white px-2 py-0.5 rounded uppercase tracking-widest"
                    style={badgeStyle}
                  >
                    EVENT PASS
                  </span>
                  {customLabel ? (
                    <p className="text-xs font-bold text-pink-300 mt-1.5 truncate max-w-[150px]" style={textColorStyle}>
                      📅 {customLabel}
                    </p>
                  ) : activeTemplate.customFieldPlaceholder ? (
                    <p className="text-xs font-bold text-pink-300/50 mt-1.5 truncate max-w-[150px] italic" style={textSubColorStyle}>
                      📅 {activeTemplate.customFieldPlaceholder} (Sample)
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  {headerLogoBlock}
                  <span className="text-right text-[10px] font-bold text-white/60" style={textSubColorStyle}>
                    ADMIT ONE
                  </span>
                </div>
              </div>

              <div className="text-center pt-3">
                <h4 className="text-xl font-black leading-tight tracking-tight text-white" style={textColorStyle}>
                  {activeTemplate.headline}
                </h4>
                <p className="text-[10px] text-white/70 mt-1 truncate px-2" style={textSubColorStyle}>
                  {activeTemplate.helper}
                </p>
              </div>

              {qrBlock}

              <div className="my-4 flex items-center justify-between gap-1">
                <div 
                  className="w-3 h-6 bg-[#312e81] -ml-6 rounded-r-full border-r border-white/10" 
                  style={isCustomTheme ? { backgroundColor: form.customBgColor, borderColor: `${form.customTextColor}20` } : {}}
                />
                <div className="border-t border-dashed border-white/20 flex-1 h-0" style={isCustomTheme ? { borderColor: `${form.customTextColor}30` } : {}} />
                <div 
                  className="w-3 h-6 bg-[#701a75] -mr-6 rounded-l-full border-l border-white/10" 
                  style={isCustomTheme ? { backgroundColor: form.customBgColor, borderColor: `${form.customTextColor}20` } : {}}
                />
              </div>

              <div className="space-y-2.5 text-xs" style={textColorStyle}>
                <div>
                  <p className="text-[9px] uppercase tracking-wider text-white/50 font-bold" style={textSubColorStyle}>Organized By</p>
                  <p className="font-extrabold text-white text-sm truncate" style={textColorStyle}>{payeeLabel}</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-white/50 font-bold" style={textSubColorStyle}>Ticket Price</p>
                    <p className="font-bold text-pink-300" style={isCustomTheme ? { color: form.customAccentColor } : {}}>{amountLabel}</p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-white/50 font-bold" style={textSubColorStyle}>UPI ID</p>
                    <p className="font-bold text-white truncate" style={textColorStyle}>{upiLabel}</p>
                  </div>
                </div>

                {form.note.trim() && (
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-white/50 font-bold" style={textSubColorStyle}>Event Note</p>
                    <p className="font-medium text-white/80 truncate" style={textSubColorStyle}>{noteLabel}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      case "education":
        return (
          <div 
            className={`rounded-[1.45rem] ${activeTemplate.shellClass} p-5 relative overflow-hidden bg-white ${posterHeightClass} flex flex-col justify-between`}
            style={containerStyle}
          >
            {coverBgBlock}
            {!isCustomTheme && <div className="absolute top-0 bottom-0 left-4 w-[1px] bg-red-400 opacity-60 pointer-events-none" />}
            {!isCustomTheme && <div className="absolute top-0 bottom-0 left-[18px] w-[1px] bg-red-400 opacity-30 pointer-events-none" />}
            
            <div className="pl-5 relative z-10 w-full">
              {coverTopBlock}
              <div className="flex items-center justify-between gap-2 border-b-2 border-sky-100 pb-2" style={isCustomTheme ? { borderColor: `${form.customTextColor}15` } : {}}>
                <div>
                  <span 
                    className={`inline-block rounded px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${activeTemplate.badgeClass}`}
                    style={badgeStyle}
                  >
                    EDUCATION
                  </span>
                  {customLabel ? (
                    <p className="text-xs font-bold text-sky-600 mt-1 truncate max-w-[150px]" style={textColorStyle}>
                      📚 {customLabel}
                    </p>
                  ) : activeTemplate.customFieldPlaceholder ? (
                    <p className="text-xs font-bold text-sky-600/50 mt-1 italic" style={textSubColorStyle}>
                      📚 {activeTemplate.customFieldPlaceholder} (Sample)
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  {headerLogoBlock}
                  <p className="text-[10px] font-bold text-sky-400 uppercase tracking-widest" style={textSubColorStyle}>{activeTemplate.kicker}</p>
                </div>
              </div>

              <h4 className="mt-3 text-2xl font-black leading-tight text-sky-900" style={textColorStyle}>
                {activeTemplate.headline}
              </h4>

              {qrBlock}

              <div className="mt-4 space-y-3 text-sky-950" style={textColorStyle}>
                <div 
                  className="bg-sky-50 rounded-xl p-3 border border-sky-100/50"
                  style={isCustomTheme ? { backgroundColor: `${form.customTextColor}08`, borderColor: `${form.customTextColor}15` } : {}}
                >
                  <p className="text-[9px] uppercase tracking-wider text-sky-600/60 font-bold" style={textSubColorStyle}>Institution / Tutor</p>
                  <p className="text-base font-extrabold text-sky-950 truncate" style={textColorStyle}>{payeeLabel}</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div 
                    className="bg-sky-50 rounded-xl p-2.5 border border-sky-100/50"
                    style={isCustomTheme ? { backgroundColor: `${form.customTextColor}08`, borderColor: `${form.customTextColor}15` } : {}}
                  >
                    <p className="text-[9px] uppercase tracking-wider text-sky-600/60 font-bold" style={textSubColorStyle}>Fee Amount</p>
                    <p className="font-bold text-sky-900 text-sm" style={textColorStyle}>{amountLabel}</p>
                  </div>
                  <div 
                    className="bg-sky-50 rounded-xl p-2.5 border border-sky-100/50"
                    style={isCustomTheme ? { backgroundColor: `${form.customTextColor}08`, borderColor: `${form.customTextColor}15` } : {}}
                  >
                    <p className="text-[9px] uppercase tracking-wider text-sky-600/60 font-bold" style={textSubColorStyle}>UPI ID</p>
                    <p className="font-bold text-sky-900 truncate text-sm" style={textColorStyle}>{upiLabel}</p>
                  </div>
                </div>

                {form.note.trim() && (
                  <div 
                    className="bg-sky-50 rounded-xl p-2.5 border border-sky-100/50"
                    style={isCustomTheme ? { backgroundColor: `${form.customTextColor}08`, borderColor: `${form.customTextColor}15` } : {}}
                  >
                    <p className="text-[9px] uppercase tracking-wider text-sky-600/60 font-bold" style={textSubColorStyle}>Payment Description</p>
                    <p className="font-semibold text-sky-900 text-xs truncate" style={textColorStyle}>{noteLabel}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      case "taxi":
        return (
          <div 
            className={`rounded-[1.45rem] ${activeTemplate.shellClass} p-5 relative overflow-hidden bg-neutral-950 text-[#fef08a] ${posterHeightClass} flex flex-col justify-between`}
            style={containerStyle}
          >
            {coverBgBlock}
            {!isCustomTheme && (
              <div className="absolute top-0 left-0 right-0 h-3 flex overflow-hidden opacity-90 pointer-events-none z-10">
                {Array.from({ length: 18 }).map((_, i) => (
                  <div key={i} className={`flex-1 h-full ${i % 2 === 0 ? "bg-[#eab308]" : "bg-black"}`} />
                ))}
              </div>
            )}
            
            <div className="pt-3 relative z-10">
              {coverTopBlock}
              <div className="flex items-center justify-between gap-3">
                <span 
                  className="text-[10px] font-black bg-[#eab308] text-black px-2 py-0.5 rounded tracking-widest"
                  style={badgeStyle}
                >
                  CAB / AUTO
                </span>
                <div className="flex items-center gap-2">
                  {headerLogoBlock}
                  {customLabel ? (
                    <span 
                      className="border border-[#eab308] text-[#eab308] text-xs font-black px-2.5 py-0.5 rounded truncate max-w-[120px]"
                      style={isCustomTheme ? { borderColor: `${form.customTextColor}40`, color: form.customTextColor } : {}}
                    >
                      {customLabel}
                    </span>
                  ) : activeTemplate.customFieldPlaceholder ? (
                    <span 
                      className="border border-[#eab308]/30 text-[#eab308]/40 text-xs font-black px-2.5 py-0.5 rounded border-dashed"
                      style={isCustomTheme ? { borderColor: `${form.customTextColor}20`, color: `${form.customTextColor}50` } : {}}
                    >
                      {activeTemplate.customFieldPlaceholder} (Sample)
                    </span>
                  ) : null}
                </div>
              </div>

              <h4 className="mt-3 text-2xl font-black leading-none tracking-tight text-white uppercase text-left" style={textColorStyle}>
                {activeTemplate.headline}
              </h4>
            </div>

            {qrBlock}

            <div className="mt-4 space-y-3 text-white relative z-10" style={textColorStyle}>
              <div 
                className="border border-[#eab308]/20 bg-neutral-900 rounded-xl p-3"
                style={isCustomTheme ? { backgroundColor: `${form.customTextColor}08`, borderColor: `${form.customTextColor}15` } : {}}
              >
                <p className="text-[9px] uppercase tracking-wider text-[#eab308] font-bold" style={textSubColorStyle}>Driver / Owner</p>
                <p className="text-lg font-black tracking-wide text-white uppercase mt-0.5 truncate" style={textColorStyle}>{payeeLabel}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div 
                  className="border border-[#eab308]/20 bg-neutral-900 rounded-xl p-2.5"
                  style={isCustomTheme ? { backgroundColor: `${form.customTextColor}08`, borderColor: `${form.customTextColor}15` } : {}}
                >
                  <p className="text-[9px] uppercase tracking-wider text-[#eab308] font-bold" style={textSubColorStyle}>Fare Amount</p>
                  <p className="font-bold text-[#eab308] text-sm" style={isCustomTheme ? { color: form.customAccentColor } : {}}>{amountLabel}</p>
                </div>
                <div 
                  className="border border-[#eab308]/20 bg-neutral-900 rounded-xl p-2.5"
                  style={isCustomTheme ? { backgroundColor: `${form.customTextColor}08`, borderColor: `${form.customTextColor}15` } : {}}
                >
                  <p className="text-[9px] uppercase tracking-wider text-[#eab308] font-bold" style={textSubColorStyle}>UPI VPA</p>
                  <p className="font-bold text-white truncate text-sm" style={textColorStyle}>{upiLabel}</p>
                </div>
              </div>

              {form.note.trim() && (
                <div 
                  className="border border-[#eab308]/20 bg-neutral-900 rounded-xl p-2.5 text-xs"
                  style={isCustomTheme ? { backgroundColor: `${form.customTextColor}08`, borderColor: `${form.customTextColor}15` } : {}}
                >
                  <p className="text-[9px] uppercase tracking-wider text-[#eab308] font-bold" style={textSubColorStyle}>Ride Code / Message</p>
                  <p className="font-medium text-[#eab308]/80 mt-0.5 truncate" style={textColorStyle}>{noteLabel}</p>
                </div>
              )}
            </div>

            <div className="mt-4 text-center relative z-10">
              <p className="text-[9px] font-bold uppercase tracking-wider text-[#eab308]/60" style={textSubColorStyle}>Thank you for riding safe!</p>
            </div>
          </div>
        );

      case "minimal":
      default:
        return (
          <div 
            className={`rounded-[1.45rem] ${activeTemplate.shellClass} p-5 relative border border-neutral-200 shadow-sm bg-white ${posterHeightClass} flex flex-col justify-between`}
            style={containerStyle}
          >
            {coverBgBlock}
            <div className="relative z-10 w-full">
              {coverTopBlock}
              <div className="flex items-center justify-between border-b border-neutral-200 pb-3" style={isCustomTheme ? { borderColor: `${form.customTextColor}20` } : {}}>
                <span className="text-[10px] font-extrabold text-neutral-800 tracking-widest uppercase" style={textSubColorStyle}>
                  {activeTemplate.kicker}
                </span>
                <div className="flex items-center gap-2">
                  {headerLogoBlock}
                  <span className="w-2 h-2 rounded-full bg-neutral-800" style={isCustomTheme ? { backgroundColor: form.customTextColor } : {}} />
                </div>
              </div>

              <h4 className="mt-3 text-xl font-bold text-neutral-900 tracking-tight text-center" style={textColorStyle}>
                {activeTemplate.headline}
              </h4>

              {qrBlock}

              <div className="mt-4 space-y-2.5 text-xs text-neutral-800" style={textColorStyle}>
                <div className="flex justify-between border-b border-neutral-100 pb-1.5" style={isCustomTheme ? { borderColor: `${form.customTextColor}15` } : {}}>
                  <span className="font-semibold text-neutral-500" style={textSubColorStyle}>Payee Name:</span>
                  <span className="font-bold text-neutral-900 truncate max-w-[150px]" style={textColorStyle}>{payeeLabel}</span>
                </div>
                
                {customLabel ? (
                  <div className="flex justify-between border-b border-neutral-100 pb-1.5" style={isCustomTheme ? { borderColor: `${form.customTextColor}15` } : {}}>
                    <span className="font-semibold text-neutral-500" style={textSubColorStyle}>Reference:</span>
                    <span className="font-bold text-neutral-900 truncate max-w-[150px]" style={textColorStyle}>{customLabel}</span>
                  </div>
                ) : activeTemplate.customFieldPlaceholder ? (
                  <div className="flex justify-between border-b border-neutral-100 pb-1.5 opacity-50" style={isCustomTheme ? { borderColor: `${form.customTextColor}10` } : {}}>
                    <span className="font-semibold text-neutral-500" style={textSubColorStyle}>Reference:</span>
                    <span className="font-bold text-neutral-900 italic truncate max-w-[150px]" style={textSubColorStyle}>{activeTemplate.customFieldPlaceholder} (Sample)</span>
                  </div>
                ) : null}

                <div className="flex justify-between border-b border-neutral-100 pb-1.5" style={isCustomTheme ? { borderColor: `${form.customTextColor}15` } : {}}>
                  <span className="font-semibold text-neutral-500" style={textSubColorStyle}>Amount:</span>
                  <span className="font-bold text-neutral-900" style={textColorStyle}>{amountLabel}</span>
                </div>

                <div className="flex justify-between border-b border-neutral-100 pb-1.5" style={isCustomTheme ? { borderColor: `${form.customTextColor}15` } : {}}>
                  <span className="font-semibold text-neutral-500" style={textSubColorStyle}>UPI VPA:</span>
                  <span className="font-bold text-neutral-900 truncate max-w-[150px]" style={textColorStyle}>{upiLabel}</span>
                </div>

                {form.note.trim() && (
                  <div className="flex justify-between">
                    <span className="font-semibold text-neutral-500" style={textSubColorStyle}>Note:</span>
                    <span className="font-bold text-neutral-900 truncate max-w-[150px]" style={textColorStyle}>{noteLabel}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
    }
  }

  return (
    <div className={`w-full max-w-full ${fullScreen ? 'flex flex-col lg:flex-row gap-6 lg:gap-8 min-h-[70dvh] lg:min-h-[78dvh]' : 'grid gap-6 lg:grid-cols-[1.05fr_0.95fr] items-start'}`}>
      {/* Hidden canvas for QR Code generation */}
      <canvas ref={canvasRef} style={{ display: "none" }} />

      {/* Form Inputs */}
      <div className={`w-full min-w-0 ${fullScreen ? 'lg:w-5/12 rounded-3xl border border-forest/10 bg-white p-4 md:p-5 lg:overflow-auto lg:max-h-[78dvh]' : 'rounded-[2rem] border border-white/70 bg-white/85 p-4 sm:p-5 backdrop-blur md:p-7'}`}>
        {/* Simple vs Advanced Mode Tab Selector */}
        <div className={`mb-4 flex w-full max-w-[280px] rounded-2xl bg-cream p-1 border border-forest/10 ${fullScreen ? 'text-sm' : ''}`}>
          <button
            key="tab-simple"
            type="button"
            onClick={() => setMode("simple")}
            className={`flex-1 py-2 text-center text-xs font-bold rounded-xl transition ${
              mode === "simple"
                ? "bg-forest text-white shadow-sm"
                : "text-forest/70 hover:text-forest"
            }`}
          >
            {t.simpleQr}
          </button>
          <button
            key="tab-advanced"
            type="button"
            onClick={() => setMode("advanced")}
            className={`flex-1 py-2 text-center text-xs font-bold rounded-xl transition ${
              mode === "advanced"
                ? "bg-forest text-white shadow-sm"
                : "text-forest/70 hover:text-forest"
            }`}
          >
            {t.advancedPoster}
          </button>
        </div>

        {mode === "simple" ? (
          <div className="grid gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="grid gap-1">
                <span className="text-xs font-semibold text-forest">{t.payeeName}</span>
                <input
                  value={form.payee}
                  onChange={(event) => updateField("payee", event.target.value)}
                  placeholder={t.payeePlaceholder}
                  className="w-full min-w-0 rounded-xl border border-forest/10 bg-cream px-3 py-2 text-sm outline-none ring-0 transition focus:border-leaf"
                />
              </label>

              <label className="grid gap-1">
                <span className="text-xs font-semibold text-forest">{t.upiId}</span>
                <input
                  value={form.upiId}
                  onChange={(event) => updateField("upiId", event.target.value)}
                  placeholder={t.upiIdPlaceholder}
                  className="w-full min-w-0 rounded-xl border border-forest/10 bg-cream px-3 py-2 text-sm outline-none ring-0 transition focus:border-leaf"
                />
              </label>
            </div>

            <div className="grid gap-2">
              <span className="text-sm font-semibold text-forest">{t.qrLogoBadge}</span>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {(["none", "phonepe", "paytm", "gpay", "bhim", "custom"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      updateField("logoType", type);
                      if (type !== "none") {
                        updateField("logoPosition", "qr-center");
                      }
                    }}
                    className={`px-2 py-2 text-xs font-bold rounded-xl border text-center transition capitalize ${
                      form.logoType === type
                        ? "border-forest bg-forest text-white"
                        : "border-forest/10 bg-cream text-forest hover:border-leaf"
                    }`}
                  >
                    {type === "none"
                      ? t.none
                      : type === "gpay"
                        ? t.gpay
                        : type === "phonepe"
                          ? t.phonepe
                          : type === "bhim"
                            ? t.bhim
                            : type === "paytm"
                              ? t.paytm
                              : t.custom}
                  </button>
                ))}
              </div>
            </div>

            {form.logoType === "custom" && (
              <div className="space-y-2 bg-cream/40 p-3 rounded-2xl border border-forest/10 animate-fadeIn">
                <span className="text-xs font-semibold text-forest block">{t.uploadCustomLogo}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="text-xs text-forest/70 w-full file:mr-2 file:py-1.5 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-mint file:text-forest hover:file:bg-leaf hover:file:text-white"
                />
              </div>
            )}
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="grid gap-1">
                <span className="text-xs font-semibold text-forest">{t.payeeName}</span>
                <input
                  value={form.payee}
                  onChange={(event) => updateField("payee", event.target.value)}
                  placeholder={t.payeePlaceholder}
                  className="w-full min-w-0 rounded-xl border border-forest/10 bg-cream px-3 py-2 text-sm outline-none ring-0 transition focus:border-leaf"
                />
              </label>

              <label className="grid gap-1">
                <span className="text-xs font-semibold text-forest">{t.upiId}</span>
                <input
                  value={form.upiId}
                  onChange={(event) => updateField("upiId", event.target.value)}
                  placeholder={t.upiIdPlaceholder}
                  className="w-full min-w-0 rounded-xl border border-forest/10 bg-cream px-3 py-2 text-sm outline-none ring-0 transition focus:border-leaf"
                />
              </label>
            </div>

            <div>
              <span className="text-xs font-semibold text-forest block mb-1">{t.posterTemplateStyle}</span>
              <select
                value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value as TemplateId)}
                className="w-full min-w-0 rounded-xl border border-forest/10 bg-cream px-3 py-2 text-sm font-bold text-forest outline-none ring-0 transition focus:border-leaf"
              >
                {templateDefinitions.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} ({template.kicker})
                  </option>
                ))}
              </select>
            </div>

            {activeTemplate.customFieldLabel && (
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-forest">{activeTemplate.customFieldLabel}</span>
                <input
                  value={form.customField}
                  onChange={(event) => updateField("customField", event.target.value)}
                  placeholder={activeTemplate.customFieldPlaceholder}
                  className="w-full min-w-0 rounded-2xl border border-forest/10 bg-cream px-4 py-3 outline-none ring-0 transition focus:border-leaf"
                />
              </label>
            )}

            {/* Optional Fields Accordion */}
            <div className="border-t border-forest/10 pt-4 mt-2">
              <button
                type="button"
                onClick={() => setShowOptionalFields(!showOptionalFields)}
                className="flex items-center justify-between w-full py-3 px-4 rounded-xl border border-forest/10 bg-cream/50 text-xs font-bold text-forest hover:bg-cream transition text-left"
              >
                <span className="flex items-center gap-2">
                  {t.addAmountNote}
                </span>
                <span className="text-forest/60 text-[10px]">
                  {showOptionalFields ? t.hide : t.configure}
                </span>
              </button>

              {showOptionalFields && (
                <div className="grid gap-3 mt-3 p-3 rounded-2xl bg-cream/30 border border-forest/5 animate-fadeIn">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <label className="grid gap-1">
                      <span className="text-[10px] font-bold text-forest/75">{t.amount}</span>
                      <input
                        value={form.amount}
                        onChange={(event) => updateField("amount", event.target.value)}
                        inputMode="decimal"
                        placeholder={t.amountPlaceholder}
                        className="w-full min-w-0 rounded-xl border border-forest/10 bg-white px-3 py-2 text-sm outline-none ring-0 transition focus:border-leaf"
                      />
                    </label>

                    <label className="grid gap-1">
                      <span className="text-[10px] font-bold text-forest/75">{t.note}</span>
                      <input
                        value={form.note}
                        onChange={(event) => updateField("note", event.target.value)}
                        placeholder={t.notePlaceholder}
                        className="w-full min-w-0 rounded-xl border border-forest/10 bg-white px-3 py-2 text-sm outline-none ring-0 transition focus:border-leaf"
                      />
                    </label>
                  </div>
                  <div className="text-[10px] text-forest/60 leading-tight overflow-hidden">
                    {t.amountHelper}
                  </div>
                </div>
              )}
            </div>

            {/* Custom design via button on poster */}
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void handleGenerate()}
            className="rounded-full bg-forest px-5 py-3 text-sm font-semibold text-white transition hover:bg-leaf disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t.generateUpiQr}
          </button>
          {mode === "advanced" && (
            <a
              href="#templates"
              className="rounded-full border border-forest/12 px-5 py-3 text-sm font-semibold text-forest transition hover:bg-forest hover:text-white"
            >
              {t.exploreTemplates}
            </a>
          )}
        </div>

        {error && <p className="mt-4 text-sm font-medium text-coral">{error}</p>}
        {!error && !fullScreen && (
          <p className="mt-4 text-sm text-forest/62">
            {t.draftAutoSaves}
          </p>
        )}
      </div>

      {/* Preview Column */}
      {mode === "simple" ? (
        <div className={`w-full min-w-0 ${fullScreen ? 'lg:w-7/12 rounded-3xl border border-forest/10 bg-white p-5 lg:sticky lg:top-4 lg:self-start' : 'hero-card-shadow rounded-[2rem] border border-white/70 bg-[#fffdf6] p-3 sm:p-5 md:p-7 lg:sticky lg:top-28 lg:self-start'}`}>
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-leaf">
                {t.qrPreview}
              </p>
              <h3 className="mt-2 text-2xl font-black text-forest">{t.simpleScanQr}</h3>
            </div>
            <span className="rounded-full bg-sun/20 px-3 py-1 text-xs font-bold text-forest">
              {t.standardFormat}
            </span>
          </div>

          <div className="rounded-[1.75rem] border border-forest/10 bg-white p-3 sm:p-5 text-center">
            {generated && qrDataUrl ? (
              <div className="flex flex-col items-center justify-center">
                <div className="p-4 bg-white rounded-2xl border border-forest/5 shadow-sm inline-block w-full max-w-[272px]">
                  <img src={qrDataUrl} className="w-full max-w-[240px] h-auto aspect-square mx-auto" alt="UPI QR Code" />
                </div>
                <div className="mt-5 space-y-2 rounded-[1.25rem] bg-mint/55 p-4 text-left w-full">
                  <p className="text-sm font-semibold text-forest truncate">
                    {form.payee.trim() || t.yourBusinessName}
                  </p>
                  <p className="text-xs text-forest/70 font-semibold">
                    {form.upiId.trim() || t.yourNameBank}
                  </p>
                  <p className="truncate text-[10px] text-forest/50">{upiUrl}</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center p-8 min-h-[300px] space-y-4">
                <div className="w-[120px] h-[120px] rounded-2xl border-2 border-dashed border-forest/20 flex items-center justify-center bg-cream/10">
                  <span className="text-4xl text-forest/40">📱</span>
                </div>
                <p className="text-sm font-semibold text-forest/80">
                  {t.enterDetailsClick}
                </p>
                <p className="text-xs text-forest/60 max-w-[220px]">
                  {t.instantScanToPay}
                </p>
              </div>
            )}

            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={downloadPng}
                disabled={!generated}
                className="rounded-full bg-sun px-5 py-3 text-sm font-bold text-forest transition hover:bg-[#f2ad37] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t.downloadQrCode}
              </button>
              <button
                type="button"
                onClick={() => void copyUpiLink()}
                disabled={!generated}
                className="rounded-full border border-forest/12 px-5 py-3 text-sm font-semibold text-forest transition hover:bg-forest hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {copyState === "copied" ? t.copied : copyState === "error" ? t.copyFailed : t.copyUpiLink}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="w-full min-w-0 hero-card-shadow rounded-[2rem] border border-white/70 bg-[#fffdf6] p-3 sm:p-5 md:p-7 lg:sticky lg:top-28 lg:self-start">
          <div className="mb-3 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-leaf">
                {t.templatePreview}
              </p>
              <h3 className="mt-1 text-lg font-black text-forest">{activeTemplate.name}</h3>
            </div>
            <button
              type="button"
              onClick={() => setShowBrandingFields(!showBrandingFields)}
              className="h-6 w-6 rounded-full border border-forest/20 bg-white flex items-center justify-center text-[10px]"
              title="Custom Design"
            >
              🎨
            </button>
          </div>

          <div className="rounded-[1.75rem] border border-forest/10 bg-white p-3 sm:p-5 text-center">
            <div
              ref={posterRef}
              className={`mx-auto flex w-full max-w-[320px] flex-col overflow-hidden rounded-[1.5rem] bg-gradient-to-br ${activeTemplate.accentClass} p-3 text-left shadow-sm relative`}
            >
              {renderTemplateContent()}
            </div>

            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={downloadPng}
                disabled={!generated}
                className="rounded-full bg-sun px-4 py-2 text-xs font-bold text-forest transition hover:bg-[#f2ad37] disabled:opacity-50"
              >
                {t.downloadQrCode}
              </button>
              <button
                type="button"
                onClick={() => void downloadPoster()}
                disabled={!generated || downloadState === "busy"}
                className="rounded-full bg-forest px-4 py-2 text-xs font-bold text-white transition hover:bg-leaf disabled:opacity-50"
              >
                {downloadState === "busy" ? t.preparingPoster : t.downloadPoster}
              </button>
              <button
                type="button"
                onClick={() => void copyUpiLink()}
                disabled={!generated}
                className="rounded-full border border-forest/12 px-4 py-2 text-xs font-semibold text-forest transition hover:bg-forest hover:text-white disabled:opacity-50"
              >
                {copyState === "copied" ? t.copied : t.copyUpiLink}
              </button>
            </div>
          </div>

          {showBrandingFields && (
            <div className="mt-3 p-3 rounded-xl border bg-white text-xs text-left">
              <div>Logo & Cover options (compact)</div>
              <div className="flex gap-1 mt-1">
                {(["none", "phonepe", "paytm", "gpay", "custom"] as const).map((type) => (
                  <button key={type} onClick={() => updateField("logoType", type)} className={`px-2 py-0.5 text-[10px] rounded ${form.logoType === type ? "bg-forest text-white" : "bg-cream"}`}>{type}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
