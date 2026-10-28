import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import QRCode from "qrcode";
import { safeToPng, downloadDataUrl, notifyExportError } from "../lib/export-image";
import { trackProductEvent } from "../lib/productEvents";
import { loadBridge, prefetchBridge, prefetchBridgeWhenIdle } from "../lib/workspace/bridgeLoader";
import { DOC_DATE_LOCALE, DOC_LANG_OPTIONS, collectStrings, isDocLang, type DocLang } from "../data/documentLang";
import { INVOICE_COPY, fill, invoiceDocTitle, type InvoiceCopy } from "../data/invoiceI18n";
import {
  FX_DIGITS, addDays, amountInWords, computeInvoice, minorDigits, nextInvoiceNumber, parseAmount, parsePlain, parseQty, parseRate, toInrPaise,
  type Minor,
} from "../lib/invoice/core";
import {
  COUNTRIES, INDIA_STATES, INVOICE_CURRENCIES, countryByCode, countryFromTimeZone, defaultRate, gstinState, regionByCode, taxPlan, validGstin,
  type ClientWhere, type Country, type SellerStatus, type SupplyKind,
} from "../lib/invoice/regimes";

type Item = { id: number; name: string; hsn: string; qty: string; unit: string; price: string; rate: string };
type Client = { name: string; address: string; email: string; taxId: string; where: ClientWhere; region: string; country: string };
type Draft = {
  v: 2;
  country: string;
  status: SellerStatus;
  kind: SupplyKind;
  currency: string;
  /** "" follows the page language; set only when the user picks one. */
  paperLang: DocLang | "";
  name: string;
  address: string;
  email: string;
  phone: string;
  taxId: string;
  pan: string;
  sellerRegion: string;
  upiId: string;
  client: Client;
  invoiceNo: string;
  invoiceDate: string;
  supplyDate: string;
  terms: string;
  dueDate: string;
  po: string;
  items: Item[];
  discountKind: "amount" | "percent";
  discount: string;
  extraLabel: string;
  extraRate: string;
  paid: string;
  roundOff: boolean;
  lutArn: string;
  reverseCharge: boolean;
  fxRate: string;
  bank: string;
  payUrl: string;
  notes: string;
  termsText: string;
};
type Assets = { logo: string; signature: string };

const draftKey = "proupiqr-invoice-draft";
const assetsKey = "proupiqr-invoice-assets";
const clientsKey = "proupiqr-invoice-clients";
const TRACK_LABEL: Partial<Record<DocLang, string>> = {
  en: "Track payment",
  hi: "पेमेंट ट्रैक करें",
  ta: "பணத்தைக் கண்காணி",
  te: "చెల్లింపు ట్రాక్ చేయండి",
  mr: "पेमेंट ट्रॅक करा",
};
const DECIMAL_COMMA = new Set<DocLang>(["es", "pt", "fr", "de", "id", "it"]);
const TERMS = ["0", "7", "15", "30", "45", "60", "custom"];
/** The language's own default country, before any draft or time-zone guess. */
const LANG_COUNTRY: Partial<Record<DocLang, string>> = { es: "ES", fr: "FR", de: "DE", it: "IT", pt: "BR", id: "ID", ar: "AE", ja: "JP", zh: "CN" };
/** v1 drafts (country templates) → country codes. */
const V1_TEMPLATE: Record<string, string> = {
  "in-gst": "IN", "us-sales": "US", "uk-vat": "GB", "eu-vat": "DE", "ae-vat": "AE", "au-gst": "AU", "br-nf": "BR", "id-ppn": "ID", "jp-tax": "JP", "cn-vat": "CN", global: "XX",
};
const BANK_HINT: Record<string, string> = {
  IN: "Account name, A/c no., IFSC, bank and branch",
  US: "Account name, routing (ABA) no., account no., bank",
  GB: "Account name, sort code, account no.",
  AU: "Account name, BSB, account no.",
  CA: "Account name, institution, transit and account no.",
  NZ: "Account name, account no.",
};
const EXPORT_TIMEOUT_MS = 20000;
const UPI_NOTES = collectStrings(INVOICE_COPY, "defaultNotes").map((n) => n.trim());

const field = "mt-1.5 w-full min-w-0 rounded-[10px] border border-hairline bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-leaf focus:ring-2 focus:ring-leaf/15";
const bad = "border-coral focus:border-coral focus:ring-coral/15";
const labelCls = "block text-sm font-medium text-charcoal";
const secondaryButton = "rounded-[10px] bg-white px-4 py-2 text-sm font-semibold text-ink ring-1 ring-hairline transition hover:bg-fog disabled:opacity-50";

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), EXPORT_TIMEOUT_MS);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

function todayIso() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function isValidUpiId(upiId: string) {
  return /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(upiId.trim());
}

function minorToDecimal(minor: Minor, digits: number) {
  if (digits === 0) return String(minor);
  const scale = 10 ** digits;
  return `${Math.floor(minor / scale)}.${String(minor % scale).padStart(digits, "0")}`;
}

/** https only, no credentials, at most 300 characters; "" otherwise. */
function safeHttpsUrl(value: string) {
  const text = value.trim();
  if (!text || text.length > 300) return "";
  try {
    const url = new URL(text);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
  } catch {
    return "";
  }
}

function buildUpiUrl(upiId: string, payee: string, paise: Minor, note: string) {
  const params = new URLSearchParams({ pa: upiId.trim(), pn: payee.trim() || "Merchant", cu: "INR" });
  if (paise > 0) params.set("am", minorToDecimal(paise, 2));
  if (note.trim()) params.set("tn", note.trim());
  return `upi://pay?${params.toString()}`;
}

function paperLocale(paperLang: DocLang, country: Country) {
  if (paperLang !== "en") return DOC_DATE_LOCALE[paperLang];
  return country.locale.startsWith("en") ? country.locale : "en-GB";
}

function makeMoney(locale: string, currency: string) {
  const digits = minorDigits(currency);
  let nf: Intl.NumberFormat;
  try {
    nf = new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits });
  } catch {
    nf = new Intl.NumberFormat("en", { style: "currency", currency: "USD" });
  }
  // A decimal string keeps the exact minor units (Intl formats numeric strings without a float round trip).
  return (minor: Minor) => nf.format(minorToDecimal(Math.max(0, minor), digits) as unknown as number);
}

function formatDate(iso: string, locale: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  try {
    return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
  } catch {
    return iso;
  }
}

function sampleItems(copy: InvoiceCopy, rate: string): Item[] {
  return [
    { id: 1, name: copy.defaultItem1, hsn: "", qty: "1", unit: "", price: "4999", rate },
    { id: 2, name: copy.defaultItem2, hsn: "", qty: "1", unit: "", price: "999", rate },
  ];
}

function freshDraft(lang: DocLang, code: string): Draft {
  const country = countryByCode(code);
  const copy = INVOICE_COPY[lang] ?? INVOICE_COPY.en;
  const today = todayIso();
  return {
    v: 2, country: country.code, status: country.statuses[0], kind: "services", currency: country.currency, paperLang: "",
    name: "ABC Solutions", address: "", email: "", phone: "", taxId: "", pan: "", sellerRegion: "", upiId: "merchant@upi",
    client: { name: "Client Name", address: "", email: "", taxId: "", where: "domestic", region: "", country: "" },
    invoiceNo: "INV-0001", invoiceDate: today, supplyDate: "", terms: "15", dueDate: addDays(today, 15), po: "",
    items: sampleItems(copy, defaultRate(country)),
    discountKind: "amount", discount: "0", extraLabel: "", extraRate: "", paid: "", roundOff: false, lutArn: "", reverseCharge: false, fxRate: "",
    bank: "", payUrl: "", notes: country.currency === "INR" ? copy.defaultNotes : "", termsText: "",
  };
}

const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);

/** Reads a saved draft (v2, or the v1 country-template shape) into a complete v2 draft. */
function readDraft(raw: unknown, lang: DocLang): Draft | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  if (d.v === 2) {
    const base = freshDraft(lang, str(d.country, "IN"));
    const country = countryByCode(base.country);
    const client = (d.client && typeof d.client === "object" ? d.client : {}) as Record<string, unknown>;
    const items = Array.isArray(d.items) ? d.items.filter((i) => i && typeof i === "object").map((i: Record<string, unknown>, n: number) => ({
      id: typeof i.id === "number" ? i.id : n + 1, name: str(i.name), hsn: str(i.hsn), qty: str(i.qty, "1"), unit: str(i.unit), price: str(i.price, "0"), rate: str(i.rate, defaultRate(country)),
    })) : [];
    const where = (["domestic", "eu", "abroad"] as const).find((w) => w === client.where) ?? "domestic";
    return {
      ...base,
      status: country.statuses.find((s) => s === d.status) ?? base.status,
      kind: d.kind === "goods" ? "goods" : "services",
      currency: INVOICE_CURRENCIES.includes(str(d.currency)) ? str(d.currency) : country.currency,
      paperLang: isDocLang(str(d.paperLang)) ? (d.paperLang as DocLang) : "",
      name: str(d.name), address: str(d.address), email: str(d.email), phone: str(d.phone), taxId: str(d.taxId), pan: str(d.pan), sellerRegion: str(d.sellerRegion), upiId: str(d.upiId),
      client: { name: str(client.name), address: str(client.address), email: str(client.email), taxId: str(client.taxId), where: where === "eu" && !country.eu ? "abroad" : where, region: str(client.region), country: str(client.country) },
      invoiceNo: str(d.invoiceNo), invoiceDate: str(d.invoiceDate, base.invoiceDate), supplyDate: str(d.supplyDate), terms: TERMS.includes(str(d.terms)) ? str(d.terms) : "custom",
      dueDate: str(d.dueDate, base.dueDate), po: str(d.po), items: items.length ? items : base.items,
      discountKind: d.discountKind === "percent" ? "percent" : "amount", discount: str(d.discount, "0"), extraLabel: str(d.extraLabel), extraRate: str(d.extraRate), paid: str(d.paid),
      roundOff: d.roundOff === true, lutArn: str(d.lutArn), reverseCharge: d.reverseCharge === true, fxRate: str(d.fxRate),
      bank: str(d.bank), payUrl: str(d.payUrl), notes: str(d.notes), termsText: str(d.termsText),
    };
  }
  // v1: { templateId, merchant, taxId, upiId, bankDetails, customer, invoiceNo, invoiceDate, dueDate, gstPercent, discount, notes, items[{name, qty, price}] }
  if (typeof d.templateId !== "string" && typeof d.merchant !== "string") return null;
  const base = freshDraft(lang, V1_TEMPLATE[str(d.templateId)] ?? "IN");
  const rate = str(d.gstPercent, defaultRate(countryByCode(base.country)));
  const items = Array.isArray(d.items) ? d.items.filter((i) => i && typeof i === "object").map((i: Record<string, unknown>, n: number) => ({
    id: typeof i.id === "number" ? i.id : n + 1, name: str(i.name), hsn: "", qty: str(i.qty, "1"), unit: "", price: str(i.price, "0"), rate,
  })) : [];
  return {
    ...base,
    name: str(d.merchant, base.name), taxId: str(d.taxId), upiId: str(d.upiId, base.upiId), bank: str(d.bankDetails),
    client: { ...base.client, name: str(d.customer, base.client.name) },
    invoiceNo: str(d.invoiceNo, base.invoiceNo), invoiceDate: str(d.invoiceDate, base.invoiceDate), terms: "custom", dueDate: str(d.dueDate, base.dueDate),
    discount: str(d.discount, "0"), notes: str(d.notes), items: items.length ? items : base.items,
  };
}

function readJson(key: string): unknown {
  try {
    const text = localStorage.getItem(key);
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

/** Downscales an uploaded image so drafts stay small in localStorage. */
function readImage(file: File, maxW: number, maxH: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Unreadable image"));
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width, maxH / img.height);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/png"));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function Section({ title, children, open = true }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group border-t border-hairline py-4 first:border-t-0">
      <summary className="flex cursor-pointer list-none items-center justify-between text-base font-semibold text-ink">
        {title}
        <span aria-hidden="true" className="text-muted transition group-open:rotate-180">⌄</span>
      </summary>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </details>
  );
}

export function InvoiceGenerator({ lang = "en" }: { lang?: DocLang } = {}) {
  const t = INVOICE_COPY[lang] ?? INVOICE_COPY.en;
  const decimalComma = DECIMAL_COMMA.has(lang);
  const [draft, setDraft] = useState<Draft>(() => freshDraft(lang, LANG_COUNTRY[lang] ?? "IN"));
  const [assets, setAssets] = useState<Assets>({ logo: "", signature: "" });
  const [savedClients, setSavedClients] = useState<Client[]>([]);
  const [clientSavedFlash, setClientSavedFlash] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [linkQrDataUrl, setLinkQrDataUrl] = useState("");

  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  /** The sample note mentions UPI: it follows the currency, while a note the user wrote is kept. */
  const noteFor = (notes: string, currency: string) => {
    const sample = UPI_NOTES.includes(notes.trim());
    if (currency === "INR") return notes.trim() ? notes : t.defaultNotes;
    return sample ? "" : notes;
  };
  const updateClient = (patch: Partial<Client>) => setDraft((d) => ({ ...d, client: { ...d.client, ...patch } }));

  useEffect(() => {
    const saved = readDraft(readJson(draftKey), lang);
    if (saved) setDraft(saved);
    else if (lang === "en") {
      // First visit: start from the seller's own country when the time zone tells us.
      let zone = "";
      try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? ""; } catch { /* no Intl time zone */ }
      const guess = countryFromTimeZone(zone);
      if (guess && guess !== "IN") setDraft(freshDraft(lang, guess));
    }
    const a = readJson(assetsKey) as Partial<Assets> | null;
    if (a) setAssets({ logo: str(a.logo), signature: str(a.signature) });
    const c = readJson(clientsKey);
    if (Array.isArray(c)) setSavedClients(c.filter((x) => x && typeof x === "object" && typeof x.name === "string").slice(0, 50));
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(draftKey, JSON.stringify(draft)); } catch { /* storage full or blocked */ }
  }, [draft, loaded]);

  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(assetsKey, JSON.stringify(assets)); } catch { /* storage full or blocked */ }
  }, [assets, loaded]);

  const country = countryByCode(draft.country);
  const paperLang: DocLang = draft.paperLang || lang;
  const p = INVOICE_COPY[paperLang] ?? INVOICE_COPY.en;
  const locale = paperLocale(paperLang, country);
  const money = useMemo(() => makeMoney(locale, draft.currency), [locale, draft.currency]);
  const percent = useMemo(() => {
    const nf = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 5 });
    return (rateK: number) => nf.format(rateK / 100000);
  }, [locale]);
  const isIndia = country.code === "IN";
  const sellerRegion = isIndia ? (gstinState(draft.taxId) || draft.sellerRegion) : "";
  const plan = taxPlan(country, {
    status: draft.status, where: draft.client.where, kind: draft.kind, sellerRegion, clientRegion: draft.client.region,
    lutArn: draft.lutArn, reverseCharge: draft.reverseCharge,
  });
  const taxed = plan.split !== "none";
  // "USt." on a German invoice, "TVA" on a French one; IGST and Canada's HST keep their own names.
  const taxName = plan.split === "single" && plan.taxLabel === country.tax && country.localTax?.lang === paperLang ? country.localTax.name : plan.taxLabel;
  const docTitle = invoiceDocTitle(plan.title, p);
  const dueDate = draft.terms === "custom" ? draft.dueDate : addDays(draft.invoiceDate, Number(draft.terms)) || draft.invoiceDate;
  const inr = draft.currency === "INR";

  const parsed = useMemo(() => {
    const amount = (text: string) => parseAmount(text, draft.currency, decimalComma);
    const lines = draft.items.map((item) => ({
      qty: parseQty(item.qty.trim() || "0", decimalComma),
      price: amount(item.price.trim() || "0"),
      rate: parseRate(item.rate.trim() || "0"),
    }));
    const discount = draft.discountKind === "percent" ? parseRate(draft.discount.trim() || "0") : amount(draft.discount.trim() || "0");
    const paid = amount(draft.paid.trim() || "0");
    const extraRate = parseRate(draft.extraRate.trim() || "0");
    const fx = draft.fxRate.trim() ? parsePlain(draft.fxRate, FX_DIGITS) : 0;
    const invalid = lines.some((l) => l.qty === null || l.price === null || l.rate === null) || discount === null || paid === null || extraRate === null || fx === null;
    return { lines, discount: discount ?? 0, paid: paid ?? 0, extraRate: extraRate ?? 0, fx: fx ?? 0, invalid };
  }, [draft.items, draft.discount, draft.discountKind, draft.paid, draft.extraRate, draft.fxRate, draft.currency, decimalComma]);

  const totals = useMemo(() => computeInvoice({
    lines: parsed.lines.map((l) => ({ qtyMilli: l.qty ?? 0, priceMinor: l.price ?? 0, rateK: plan.zero ? 0 : (l.rate ?? 0) })),
    discount: draft.discountKind === "percent" ? { kind: "percent", rateK: parsed.discount } : { kind: "amount", minor: parsed.discount },
    split: plan.split,
    extraRateK: plan.zero || !draft.extraLabel.trim() ? 0 : parsed.extraRate,
    paidMinor: parsed.paid,
    roundTo: inr && draft.roundOff ? 100 : 0,
  }), [parsed, plan.split, plan.zero, draft.discountKind, draft.extraLabel, inr, draft.roundOff]);

  const payUrl = safeHttpsUrl(draft.payUrl);
  const paymentNote = `${draft.invoiceNo} - ${draft.client.name}`.slice(0, 80);
  const upiUrl = useMemo(() => buildUpiUrl(draft.upiId, draft.name, totals.balance, paymentNote), [draft.upiId, draft.name, totals.balance, paymentNote]);
  const showUpi = inr && draft.upiId.trim() !== "";

  useEffect(() => {
    if (!showUpi) { setQrDataUrl(""); return; }
    QRCode.toDataURL(upiUrl, { margin: 1, width: 360, errorCorrectionLevel: "M", color: { dark: "#1c1d1f", light: "#ffffff" } })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [upiUrl, showUpi]);

  useEffect(() => {
    if (!payUrl) { setLinkQrDataUrl(""); return; }
    QRCode.toDataURL(payUrl, { margin: 1, width: 300, errorCorrectionLevel: "M", color: { dark: "#1c1d1f", light: "#ffffff" } })
      .then(setLinkQrDataUrl)
      .catch(() => setLinkQrDataUrl(""));
  }, [payUrl]);

  const invoiceRef = useRef<HTMLDivElement | null>(null);
  const [downloadPdfState, setDownloadPdfState] = useState<"idle" | "busy" | "error">("idle");
  const [downloadPngState, setDownloadPngState] = useState<"idle" | "busy" | "error">("idle");
  const [shareState, setShareState] = useState<"idle" | "busy">("idle");
  const [bridgeBusy, setBridgeBusy] = useState(false);
  // The tracker's storage code is fetched when the page is idle (after the first edit unless this device has a
  // payment book), so "Track payment" needs no network later.
  // Only while that button renders (rupee invoices): other currencies never download it.
  useEffect(() => (inr ? prefetchBridgeWhenIdle() : undefined), [inr]);

  /* ---------- builder actions ---------- */

  const selectCountry = (code: string) => {
    const next = countryByCode(code);
    setDraft((d) => ({
      ...d,
      country: next.code,
      status: next.statuses.includes(d.status) ? d.status : next.statuses[0],
      currency: next.currency,
      taxId: next.code === d.country ? d.taxId : "",
      sellerRegion: "",
      client: { ...d.client, where: d.client.where === "eu" && !next.eu ? "abroad" : d.client.where, region: "" },
      notes: noteFor(d.notes, next.currency),
      items: d.items.map((item) => ({ ...item, rate: defaultRate(next) })),
      extraLabel: "",
      extraRate: "",
      roundOff: next.currency === "INR" ? d.roundOff : false,
    }));
  };

  const selectClientRegion = (code: string) => {
    const region = regionByCode(country, code);
    setDraft((d) => ({
      ...d,
      client: { ...d.client, region: code },
      ...(region?.rate ? { items: d.items.map((item) => ({ ...item, rate: region.rate ?? item.rate })), extraLabel: region.extra?.label ?? "", extraRate: region.extra?.rate ?? "" } : {}),
    }));
  };

  const updateItem = (id: number, patch: Partial<Item>) =>
    setDraft((d) => ({ ...d, items: d.items.map((item) => (item.id === id ? { ...item, ...patch } : item)) }));
  const addItem = () => setDraft((d) => ({
    ...d,
    items: [...d.items, { id: Date.now(), name: t.newItem, hsn: "", qty: "1", unit: "", price: "0", rate: d.items[d.items.length - 1]?.rate ?? defaultRate(country) }],
  }));
  const removeItem = (id: number) => setDraft((d) => (d.items.length > 1 ? { ...d, items: d.items.filter((item) => item.id !== id) } : d));

  const nextInvoice = () => {
    const today = todayIso();
    setDraft((d) => ({ ...d, invoiceNo: nextInvoiceNumber(d.invoiceNo), invoiceDate: today, supplyDate: "", dueDate: d.terms === "custom" ? today : d.dueDate, paid: "", po: "" }));
  };

  const saveClient = () => {
    if (!draft.client.name.trim()) return;
    const next = [draft.client, ...savedClients.filter((c) => c.name.trim().toLowerCase() !== draft.client.name.trim().toLowerCase())].slice(0, 50);
    setSavedClients(next);
    try { localStorage.setItem(clientsKey, JSON.stringify(next)); } catch { /* storage full or blocked */ }
    setClientSavedFlash(true);
    setTimeout(() => setClientSavedFlash(false), 1500);
  };

  const pickClient = (index: string) => {
    const c = savedClients[Number(index)];
    if (!c) return;
    setDraft((d) => ({ ...d, client: { ...c, where: c.where === "eu" && !country.eu ? "abroad" : c.where } }));
    if (c.region && country.regions) selectClientRegion(c.region);
  };

  const uploadImage = async (kind: keyof Assets, file: File | undefined) => {
    if (!file) return;
    try {
      const dataUrl = await readImage(file, kind === "logo" ? 360 : 420, kind === "logo" ? 180 : 140);
      setAssets((a) => ({ ...a, [kind]: dataUrl }));
    } catch (err) {
      console.error("Image upload failed:", err);
      notifyExportError("Couldn't read that image. Try a PNG or JPG.");
    }
  };

  /* ---------- warnings ---------- */

  const warnings: string[] = [];
  if (parsed.invalid) warnings.push(t.warnBadNumber);
  if (draft.status === "registered" && country.statuses.includes("unregistered") && !draft.taxId.trim()) warnings.push(fill(t.warnTaxId, { taxId: country.taxId, tax: country.localTax?.lang === lang ? country.localTax.name : country.tax }));
  if (isIndia && draft.taxId.trim() && !validGstin(draft.taxId)) warnings.push(t.warnGstin);
  if (plan.india && !/^[A-Za-z0-9/-]{1,16}$/.test(draft.invoiceNo.trim())) warnings.push(t.warnInvoiceNo);
  if (isIndia && plan.india && draft.taxId.trim() && draft.client.where === "domestic" && !draft.client.region) warnings.push(t.warnPlaceOfSupply);
  if (country.eu && draft.client.where === "eu" && draft.status === "registered" && !draft.client.taxId.trim()) warnings.push(t.warnClientVat);
  if (draft.payUrl.trim() && !payUrl) warnings.push(t.warnBadLink);
  if (inr && draft.upiId.trim() && (!isValidUpiId(draft.upiId) || draft.upiId.trim() === "merchant@upi")) warnings.push(t.sampleWarning);
  if (!draft.bank.trim() && !payUrl && !(inr && draft.upiId.trim())) warnings.push(t.warnNoPayment);

  /* ---------- exports ---------- */

  function safeInvoiceNo() {
    return (draft.invoiceNo || "invoice").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "invoice";
  }

  /** A4 at 800px wide is 1131px tall: blocks that would straddle a page edge move to the next page. */
  function keepBlocksWhole(clone: HTMLElement, pageHeight: number) {
    const blocks = [...clone.querySelectorAll<HTMLElement>("[data-keep]")];
    for (const block of blocks) {
      const top = block.getBoundingClientRect().top - clone.getBoundingClientRect().top;
      const bottom = top + block.offsetHeight;
      const page = Math.floor(top / pageHeight);
      if (block.offsetHeight >= pageHeight - 72 || Math.floor((bottom - 1) / pageHeight) === page) continue;
      const push = (page + 1) * pageHeight - top + 36;
      if (block.tagName === "TR") {
        const spacer = document.createElement("tr");
        spacer.innerHTML = `<td colspan="8" style="height:${push}px;padding:0;border:0"></td>`;
        block.parentElement?.insertBefore(spacer, block);
      } else {
        block.style.marginTop = `${(parseFloat(getComputedStyle(block).marginTop) || 0) + push}px`;
      }
    }
  }

  async function renderPaperToPng(paged = false) {
    if (!invoiceRef.current) throw new Error("Invoice preview not ready");
    const clone = invoiceRef.current.cloneNode(true) as HTMLDivElement;
    Object.assign(clone.style, {
      position: "fixed", left: "0", top: "0", zIndex: "-9999", opacity: "0", pointerEvents: "none",
      width: "800px", minWidth: "800px", maxWidth: "800px", padding: "36px", boxSizing: "border-box", height: "auto",
      boxShadow: "none", border: "none", borderRadius: "0",
    });
    document.body.appendChild(clone);
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (paged) keepBlocksWhole(clone, Math.round((800 * 297) / 210));
    const targetHeight = clone.offsetHeight || 1100;
    try {
      const dataUrl = await safeToPng(clone, {
        cacheBust: true,
        pixelRatio: 2,
        width: 800,
        height: targetHeight,
        style: {
          opacity: "1", transform: "none", transformOrigin: "top left", width: "800px", height: `${targetHeight}px`, maxWidth: "800px",
          maxHeight: `${targetHeight}px`, minWidth: "800px", minHeight: `${targetHeight}px`, margin: "0", padding: "36px",
          boxSizing: "border-box", backgroundColor: "#ffffff", boxShadow: "none", border: "none", borderRadius: "0",
        },
      });
      return { dataUrl, targetHeight };
    } finally {
      document.body.removeChild(clone);
    }
  }

  async function downloadInvoicePdf() {
    if (!invoiceRef.current) return;
    try {
      setDownloadPdfState("busy");
      const { jsPDF } = await withTimeout(import("jspdf"), "PDF engine");
      const { dataUrl, targetHeight } = await renderPaperToPng(true);
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const heightMm = (targetHeight * 210) / 800;
      const pages = Math.max(1, Math.ceil(heightMm / 297 - 0.002));
      for (let i = 0; i < pages; i++) {
        if (i) pdf.addPage();
        pdf.addImage(dataUrl, "PNG", 0, -i * 297, 210, heightMm, "invoice", "FAST");
      }
      pdf.setProperties({ title: `${docTitle} ${draft.invoiceNo}`, author: draft.name, creator: "Pro UPI QR (proupiqr.in)" });
      pdf.save(`${safeInvoiceNo()}.pdf`);
      setDownloadPdfState("idle");
      trackProductEvent("export_pdf", "invoice");
    } catch (err) {
      console.error("PDF download failed:", err); notifyExportError("PDF export failed — please retry.");
      setDownloadPdfState("error");
      trackProductEvent("tool_error", "invoice");
    }
  }

  async function dataUrlToPngFile(dataUrl: string, fileName: string) {
    const blob = await (await fetch(dataUrl)).blob();
    return new File([blob], fileName, { type: "image/png" });
  }

  async function downloadInvoicePng() {
    if (!invoiceRef.current) return;
    try {
      setDownloadPngState("busy");
      const { dataUrl } = await renderPaperToPng();
      downloadDataUrl(dataUrl, `${safeInvoiceNo()}.png`);
      setDownloadPngState("idle");
      trackProductEvent("export_png", "invoice");
    } catch (err) {
      console.error("PNG download failed:", err); notifyExportError("PNG export failed — try the PDF instead.");
      setDownloadPngState("error");
    }
  }

  async function trackPayment() {
    // The payment tracker's storage code stays off this page's first load; it was prefetched on idle or intent.
    if (bridgeBusy) return;
    let bridge: Awaited<ReturnType<typeof loadBridge>>;
    setBridgeBusy(true);
    try {
      bridge = await withTimeout(loadBridge(), "Payment tracker");
    } catch (err) {
      console.error("Payment tracker failed to load:", err); notifyExportError("Couldn't open the payment tracker. Check your connection and try again.");
      return;
    } finally {
      setBridgeBusy(false);
    }
    const { trackDocument, workspaceReturnUrl } = bridge;
    const description = draft.items.map((item) => item.name).filter(Boolean).join(", ");
    const result = trackDocument({
      merchant: draft.name, upiId: draft.upiId, customer: draft.client.name, invoiceNo: draft.invoiceNo, invoiceDate: draft.invoiceDate, dueDate,
      totalPaise: totals.total, description,
    });
    if (!result) {
      notifyExportError("Add a customer name, invoice number, date, and amount before tracking.");
      return;
    }
    if ("pick" in result) { window.location.href = workspaceReturnUrl("/app/", result); return; }
    trackProductEvent("invoice_tracked", "invoice");
    window.location.href = workspaceReturnUrl(lang === "hi" ? "/app/?tab=invoices&lang=hi" : "/app/?tab=invoices", result);
  }

  function buildShareMessage() {
    return `*${docTitle} — ${draft.name || p.yourBusiness}*\n` +
      `----------------------------\n` +
      `*${p.shareInvoiceNo}:* ${draft.invoiceNo}\n` +
      `*${p.shareCustomer}:* ${draft.client.name}\n` +
      `*${p.shareTotal}:* ${money(totals.balance)}\n` +
      `*${p.shareDue}:* ${formatDate(dueDate, locale)}\n\n` +
      (showUpi ? `*${p.sharePayUpi}:* ${draft.upiId}\n${p.shareQr}\n\n` : "") +
      (payUrl ? `*${p.payOnline}:* ${payUrl}\n\n` : "") +
      p.shareVia;
  }

  async function shareOnWhatsapp() {
    if (shareState === "busy") return;
    try {
      setShareState("busy");
      let sharedVisually = false;
      if (navigator.share && navigator.canShare) {
        try {
          const { dataUrl } = await renderPaperToPng();
          const file = await dataUrlToPngFile(dataUrl, `${safeInvoiceNo()}.png`);
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: `${docTitle} ${draft.invoiceNo}`, text: buildShareMessage() });
            sharedVisually = true;
            trackProductEvent("share", "invoice");
          }
        } catch (err) {
          if ((err as DOMException)?.name === "AbortError") {
            setShareState("idle");
            return;
          }
          console.warn("Native share unavailable, falling back to download + WhatsApp.", err);
        }
      }
      if (!sharedVisually) {
        try {
          const { dataUrl } = await renderPaperToPng();
          downloadDataUrl(dataUrl, `${safeInvoiceNo()}.png`);
        } catch (err) {
          console.error("Invoice image export failed:", err);
        }
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(buildShareMessage())}`, "_blank");
        trackProductEvent("share", "invoice");
      }
      setShareState("idle");
    } catch (err) {
      console.error("WhatsApp share failed:", err);
      setShareState("idle");
    }
  }

  /* ---------- render ---------- */

  // The builder names the tax the way the page's language does ("TVA" on /fr/ for France), like the paper.
  const builderTax = country.localTax?.lang === lang ? country.localTax.name : country.tax;
  // India's hint is translated (its pages are indexed in hi/ta/te/mr); other countries' hints are English.
  const rateHint = isIndia ? t.hintIndiaRates : country.rateHint;
  const statusLabel = (s: SellerStatus) => s === "registered" ? fill(t.statusRegistered, { tax: builderTax }) : s === "composition" ? t.statusComposition : t.statusUnregistered;
  const termsLabel = (term: string) => term === "0" ? t.termsReceipt : term === "custom" ? t.termsCustom : fill(t.termsNet, { n: term });
  const stateName = (code: string) => INDIA_STATES.find((s) => s.code === code)?.name ?? "";
  const placeOfSupply = isIndia && plan.india
    ? draft.client.where === "domestic"
      ? (draft.client.region ? `${stateName(draft.client.region)} (${draft.client.region})` : "")
      : (draft.client.country.trim() || "Outside India") + " (96)"
    : "";
  const showHsn = isIndia && (plan.india || draft.items.some((i) => i.hsn.trim()));
  const amountPlaceholder = decimalComma ? "0,00" : "0.00";
  const curInput = (text: string) => parseAmount(text.trim() || "0", draft.currency, decimalComma) === null;
  const fxPaise = isIndia && !inr && parsed.fx > 0 ? toInrPaise(totals.total, draft.currency, parsed.fx) : 0;
  const inrMoney = useMemo(() => makeMoney("en-IN", "INR"), []);
  const extraShown = taxed && !plan.zero && draft.extraLabel.trim() !== "" && totals.extraTax > 0;
  const clientTaxLabel = draft.client.where === "abroad" ? "Client tax ID / VAT no." : country.clientTaxId;
  const bare = (label: string) => label.replace(/[:：]\s*$/, "");

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
      <div className="no-print min-w-0 rounded-[14px] bg-white p-5 shadow-card">
        <div className="flex flex-col gap-3 border-b border-hairline pb-4">
          <div>
            <p className="text-sm font-semibold text-leaf">{t.eyebrow}</p>
            <h2 className="mt-1 text-2xl font-semibold text-ink">{t.heading}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={downloadInvoicePdf} disabled={downloadPdfState === "busy"} className="rounded-[10px] bg-forest px-4 py-2 text-sm font-semibold text-white transition hover:bg-graphite disabled:opacity-50">
              {downloadPdfState === "busy" ? t.generating : t.downloadPdf}
            </button>
            <button onClick={shareOnWhatsapp} disabled={shareState === "busy"} title={t.whatsapp} className="rounded-[10px] bg-[#25D366] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1da851] disabled:opacity-50">
              {shareState === "busy" ? t.preparing : t.whatsapp}
            </button>
            <button onClick={downloadInvoicePng} disabled={downloadPngState === "busy"} className={secondaryButton}>
              {downloadPngState === "busy" ? t.generating : t.downloadPng}
            </button>
            {inr && (
              <button
                onClick={() => void trackPayment()}
                onPointerEnter={prefetchBridge}
                onFocus={prefetchBridge}
                onTouchStart={prefetchBridge}
                disabled={bridgeBusy}
                aria-busy={bridgeBusy}
                title={TRACK_LABEL[lang] ?? TRACK_LABEL.en}
                className={secondaryButton}
              >
                {TRACK_LABEL[lang] ?? TRACK_LABEL.en}
              </button>
            )}
          </div>
        </div>

        {warnings.length > 0 && (
          <ul className="mt-4 space-y-1.5 rounded-[12px] bg-amber-50 px-4 py-3 text-sm text-amber-900" aria-live="polite">
            {[...new Set(warnings)].map((w) => <li key={w}>{w}</li>)}
          </ul>
        )}

        <Section title={t.sectionCountry}>
          <label className={labelCls}>{t.country}
            <select value={country.code} onChange={(e) => selectCountry(e.target.value)} className={field} data-invoice-country>
              {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </label>
          <label className={labelCls}>{t.taxStatus}
            <select value={draft.status} onChange={(e) => update({ status: e.target.value as SellerStatus })} className={field} disabled={country.statuses.length < 2}>
              {country.statuses.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
            </select>
          </label>
          <label className={labelCls}>{t.currency}
            <select value={draft.currency} onChange={(e) => update({ currency: e.target.value, roundOff: e.target.value === "INR" ? draft.roundOff : false, notes: noteFor(draft.notes, e.target.value) })} className={field} data-invoice-currency>
              {INVOICE_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className={labelCls}>{t.paperLanguage}
            <select value={paperLang} onChange={(e) => update({ paperLang: e.target.value as DocLang })} className={field}>
              {DOC_LANG_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </label>
          <fieldset className="sm:col-span-2">
            <legend className={labelCls}>{t.supplyKind}</legend>
            <div className="mt-1.5 flex gap-2">
              {(["services", "goods"] as const).map((k) => (
                <button key={k} type="button" aria-pressed={draft.kind === k} onClick={() => update({ kind: k })}
                  className={`rounded-[7px] px-3 py-1.5 text-sm font-medium ring-1 transition ${draft.kind === k ? "bg-ink text-white ring-ink" : "bg-white text-ink ring-hairline hover:bg-fog"}`}>
                  {k === "services" ? t.kindServices : t.kindGoods}
                </button>
              ))}
            </div>
          </fieldset>
          {(rateHint || country.eInvoice) && (
            <p className="text-sm leading-6 text-muted sm:col-span-2">{[rateHint, country.eInvoice].filter(Boolean).join(" ")}</p>
          )}
        </Section>

        <Section title={t.sectionBusiness}>
          <label className={labelCls}>{t.businessName}<input value={draft.name} onChange={(e) => update({ name: e.target.value })} className={field} /></label>
          {(draft.status !== "unregistered" || !country.statuses.includes("unregistered")) && (
            <label className={labelCls}>{country.taxId}
              <input value={draft.taxId} onChange={(e) => update({ taxId: isIndia ? e.target.value.toUpperCase() : e.target.value })} className={`${field} ${isIndia && draft.taxId.trim() && !validGstin(draft.taxId) ? bad : ""}`} />
            </label>
          )}
          <label className={`${labelCls} sm:col-span-2`}>{t.address}<textarea value={draft.address} onChange={(e) => update({ address: e.target.value })} rows={2} className={field} /></label>
          <label className={labelCls}>{t.email}<input type="email" value={draft.email} onChange={(e) => update({ email: e.target.value })} className={field} /></label>
          <label className={labelCls}>{t.phone}<input type="tel" value={draft.phone} onChange={(e) => update({ phone: e.target.value })} className={field} /></label>
          {isIndia && (
            <label className={labelCls}>PAN
              <input value={draft.pan} maxLength={10} onChange={(e) => update({ pan: e.target.value.toUpperCase().replace(/\s/g, "") })} className={`${field} font-mono ${draft.pan && !/^[A-Z]{5}\d{4}[A-Z]$/.test(draft.pan) ? bad : ""}`} />
            </label>
          )}
          {isIndia && plan.india && !gstinState(draft.taxId) && (
            <label className={labelCls}>{t.yourState}
              <select value={draft.sellerRegion} onChange={(e) => update({ sellerRegion: e.target.value })} className={field}>
                <option value="">—</option>
                {INDIA_STATES.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
              </select>
            </label>
          )}
          {inr && <label className={labelCls}>{t.upiId}<input value={draft.upiId} onChange={(e) => update({ upiId: e.target.value })} className={field} /></label>}
          <div className={labelCls}>{t.logo}
            <div className="mt-1.5 flex items-center gap-3">
              {assets.logo && <img src={assets.logo} alt="" className="h-10 max-w-[120px] object-contain" />}
              <label className={`${secondaryButton} cursor-pointer`}>
                {t.addLogo}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" onChange={(e) => { void uploadImage("logo", e.target.files?.[0]); e.target.value = ""; }} />
              </label>
              {assets.logo && <button type="button" onClick={() => setAssets((a) => ({ ...a, logo: "" }))} className="text-sm font-medium text-muted hover:text-ink">{t.removeImage}</button>}
            </div>
          </div>
        </Section>

        <Section title={t.sectionClient}>
          {savedClients.length > 0 && (
            <label className={`${labelCls} sm:col-span-2`}>{t.savedClients}
              <select value="" onChange={(e) => pickClient(e.target.value)} className={field}>
                <option value="">{t.chooseClient}</option>
                {savedClients.map((c, i) => <option key={`${c.name}-${i}`} value={i}>{c.name}</option>)}
              </select>
            </label>
          )}
          <label className={labelCls}>{t.customer}<input value={draft.client.name} onChange={(e) => updateClient({ name: e.target.value })} className={field} /></label>
          <label className={labelCls}>{t.clientWhere}
            <select value={draft.client.where} onChange={(e) => updateClient({ where: e.target.value as ClientWhere })} className={field} data-invoice-where>
              <option value="domestic">{t.whereDomestic} ({country.code === "XX" ? "—" : country.name})</option>
              {country.eu && <option value="eu">{t.whereEu}</option>}
              <option value="abroad">{t.whereAbroad}</option>
            </select>
          </label>
          {isIndia && plan.india && draft.client.where === "domestic" && (
            <label className={labelCls}>{t.placeOfSupply}
              <select value={draft.client.region} onChange={(e) => updateClient({ region: e.target.value })} className={field} data-invoice-pos>
                <option value="">—</option>
                {INDIA_STATES.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
              </select>
            </label>
          )}
          {country.code === "CA" && draft.client.where === "domestic" && (
            <label className={labelCls}>{t.province}
              <select value={draft.client.region} onChange={(e) => selectClientRegion(e.target.value)} className={field}>
                <option value="">—</option>
                {country.regions?.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
              </select>
            </label>
          )}
          {draft.client.where !== "domestic" && (
            <label className={labelCls}>{t.clientCountry}<input value={draft.client.country} onChange={(e) => updateClient({ country: e.target.value })} className={field} /></label>
          )}
          <label className={labelCls}>{clientTaxLabel}
            <input value={draft.client.taxId} onChange={(e) => updateClient({ taxId: e.target.value })} className={field} />
          </label>
          <label className={labelCls}>{t.email}<input type="email" value={draft.client.email} onChange={(e) => updateClient({ email: e.target.value })} className={field} /></label>
          <label className={`${labelCls} sm:col-span-2`}>{t.address}<textarea value={draft.client.address} onChange={(e) => updateClient({ address: e.target.value })} rows={2} className={field} /></label>
          <div className="sm:col-span-2">
            <button type="button" onClick={saveClient} disabled={!draft.client.name.trim()} className={secondaryButton}>{clientSavedFlash ? t.clientSaved : t.saveClient}</button>
          </div>
        </Section>

        <Section title={t.sectionDetails}>
          <label className={labelCls}>{t.invoiceNumber}
            <div className="flex gap-2">
              <input value={draft.invoiceNo} onChange={(e) => update({ invoiceNo: e.target.value })} className={`${field} font-mono`} />
              <button type="button" onClick={nextInvoice} className={`${secondaryButton} mt-1.5 whitespace-nowrap`}>{t.nextInvoice}</button>
            </div>
          </label>
          <label className={labelCls}>{t.invoiceDate}<input type="date" value={draft.invoiceDate} onChange={(e) => update({ invoiceDate: e.target.value })} className={field} /></label>
          <label className={labelCls}>{t.paymentTerms}
            <select value={draft.terms} onChange={(e) => update({ terms: e.target.value, dueDate: e.target.value === "custom" ? dueDate : draft.dueDate })} className={field}>
              {TERMS.map((term) => <option key={term} value={term}>{termsLabel(term)}</option>)}
            </select>
          </label>
          <label className={labelCls}>{t.dueDate}
            <input type="date" value={dueDate} disabled={draft.terms !== "custom"} onChange={(e) => update({ dueDate: e.target.value })} className={`${field} disabled:bg-fog disabled:text-muted`} />
          </label>
          <label className={labelCls}>{t.supplyDate}<input type="date" value={draft.supplyDate} onChange={(e) => update({ supplyDate: e.target.value })} className={field} /></label>
          <label className={labelCls}>{t.poNumber}<input value={draft.po} onChange={(e) => update({ po: e.target.value })} className={field} /></label>
          {isIndia && plan.india && draft.client.where !== "domestic" && (
            <label className={`${labelCls} sm:col-span-2`}>{t.lutArn}
              <input value={draft.lutArn} onChange={(e) => update({ lutArn: e.target.value.toUpperCase() })} className={`${field} font-mono`} placeholder="AD270425001234X" />
              <span className="mt-1 block text-xs font-normal text-muted">{t.lutHelp}</span>
            </label>
          )}
          {isIndia && !inr && (
            <label className={`${labelCls} sm:col-span-2`}>{fill(t.fxRate, { cur: draft.currency })}
              <input inputMode="decimal" value={draft.fxRate} onChange={(e) => update({ fxRate: e.target.value })} className={`${field} ${draft.fxRate.trim() && parsePlain(draft.fxRate, FX_DIGITS) === null ? bad : ""}`} placeholder={decimalComma ? "84,10" : "84.10"} />
              <span className="mt-1 block text-xs font-normal text-muted">{t.fxHelp}</span>
            </label>
          )}
          {isIndia && plan.india && draft.client.where === "domestic" && draft.status === "registered" && (
            <label className="flex items-center gap-2 text-sm text-charcoal sm:col-span-2">
              <input type="checkbox" checked={draft.reverseCharge} onChange={(e) => update({ reverseCharge: e.target.checked })} className="h-4 w-4 accent-leaf" />
              {t.reverseChargeInput}
            </label>
          )}
        </Section>

        <div className="border-t border-hairline py-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-ink">{t.lineItems}</h3>
            <button type="button" onClick={addItem} className="text-sm font-semibold text-leaf">{t.addItem}</button>
          </div>
          <div className="mt-3 space-y-2">
            {draft.items.map((item, index) => {
              const line = parsed.lines[index];
              const small = "block text-xs font-medium text-muted";
              const priceSpan = showHsn ? (taxed ? "sm:col-span-3" : "sm:col-span-6") : (taxed ? "sm:col-span-4" : "sm:col-span-8");
              return (
                <div key={item.id} className="grid grid-cols-2 gap-2 rounded-[12px] bg-fog p-2.5 sm:grid-cols-12" data-invoice-item>
                  <div className="col-span-2 flex gap-2 sm:col-span-12">
                    <input aria-label={t.description} placeholder={t.description} value={item.name} onChange={(e) => updateItem(item.id, { name: e.target.value })} className={`${field} mt-0 flex-1`} />
                    <button type="button" onClick={() => removeItem(item.id)} aria-label={t.removeItem} className="w-9 shrink-0 rounded-[10px] text-lg text-muted transition hover:bg-white hover:text-coral">×</button>
                  </div>
                  {showHsn && <label className={`${small} sm:col-span-2`}>{t.hsn}<input value={item.hsn} onChange={(e) => updateItem(item.id, { hsn: e.target.value })} className={`${field} mt-1 font-mono`} /></label>}
                  <label className={`${small} sm:col-span-2`}>{t.qty}<input inputMode="decimal" value={item.qty} onChange={(e) => updateItem(item.id, { qty: e.target.value })} className={`${field} mt-1 ${line?.qty === null ? bad : ""}`} /></label>
                  <label className={`${small} sm:col-span-2`}>{t.unit}<input value={item.unit} placeholder={draft.kind === "services" ? "hrs" : "pcs"} onChange={(e) => updateItem(item.id, { unit: e.target.value })} className={`${field} mt-1`} /></label>
                  <label className={`${small} ${priceSpan}`}>{t.price} ({draft.currency})<input inputMode="decimal" placeholder={amountPlaceholder} value={item.price} onChange={(e) => updateItem(item.id, { price: e.target.value })} className={`${field} mt-1 ${line?.price === null ? bad : ""}`} /></label>
                  {taxed && (
                    <label className={`${small} ${showHsn ? "sm:col-span-3" : "sm:col-span-4"}`}>{plan.taxLabel} %
                      <input list={`rates-${country.code}`} inputMode="decimal" value={plan.zero ? "0" : item.rate} disabled={plan.zero} onChange={(e) => updateItem(item.id, { rate: e.target.value })} className={`${field} mt-1 disabled:bg-white/60 disabled:text-muted ${line?.rate === null ? bad : ""}`} />
                    </label>
                  )}
                </div>
              );
            })}
          </div>
          <datalist id={`rates-${country.code}`}>{country.rates.map((r) => <option key={r} value={r} />)}</datalist>
        </div>

        <Section title={t.sectionAdjust} open={false}>
          <label className={labelCls}>{t.discountType}
            <select value={draft.discountKind} onChange={(e) => update({ discountKind: e.target.value as Draft["discountKind"] })} className={field}>
              <option value="amount">{t.discountFixed} ({draft.currency})</option>
              <option value="percent">{t.discountPercent} (%)</option>
            </select>
          </label>
          <label className={labelCls}>{t.discount}
            <input inputMode="decimal" value={draft.discount} onChange={(e) => update({ discount: e.target.value })} className={`${field} ${(draft.discountKind === "percent" ? parseRate(draft.discount.trim() || "0") === null : curInput(draft.discount)) ? bad : ""}`} />
          </label>
          <label className={labelCls}>{t.amountPaidInput}
            <input inputMode="decimal" value={draft.paid} placeholder={amountPlaceholder} onChange={(e) => update({ paid: e.target.value })} className={`${field} ${curInput(draft.paid) ? bad : ""}`} />
          </label>
          {inr && (
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-charcoal">
              <input type="checkbox" checked={draft.roundOff} onChange={(e) => update({ roundOff: e.target.checked })} className="h-4 w-4 accent-leaf" />
              {t.roundOffInput}
            </label>
          )}
          {taxed && !isIndia && (
            <>
              <label className={labelCls}>{t.extraTax}: {t.extraTaxName}<input value={draft.extraLabel} placeholder="QST" onChange={(e) => update({ extraLabel: e.target.value })} className={field} /></label>
              <label className={labelCls}>{t.extraTax} %<input inputMode="decimal" value={draft.extraRate} placeholder="9.975" onChange={(e) => update({ extraRate: e.target.value })} className={`${field} ${parseRate(draft.extraRate.trim() || "0") === null ? bad : ""}`} /></label>
              <p className="text-xs leading-5 text-muted sm:col-span-2">{t.extraTaxHelp}</p>
            </>
          )}
        </Section>

        <Section title={t.sectionPayment}>
          <label className={`${labelCls} sm:col-span-2`}>{t.payLink}
            <input type="url" inputMode="url" value={draft.payUrl} placeholder="https://paypal.me/yourname" onChange={(e) => update({ payUrl: e.target.value })} className={`${field} ${draft.payUrl.trim() && !payUrl ? bad : ""}`} />
            <span className="mt-1 block text-xs font-normal text-muted">{t.payLinkHelp}</span>
          </label>
          <label className={`${labelCls} sm:col-span-2`}>{inr ? t.bankOptional : t.bankRequired}
            <textarea value={draft.bank} onChange={(e) => update({ bank: e.target.value })} rows={3} placeholder={BANK_HINT[country.code] ?? (country.eu ? "Account name, IBAN, BIC" : t.bankPlaceholderIntl)} className={field} />
          </label>
        </Section>

        <Section title={t.sectionNotes} open={false}>
          <label className={`${labelCls} sm:col-span-2`}>{t.invoiceNotes}<textarea value={draft.notes} onChange={(e) => update({ notes: e.target.value })} rows={2} className={field} /></label>
          <label className={`${labelCls} sm:col-span-2`}>{t.termsInput}<textarea value={draft.termsText} placeholder={t.termsPlaceholder} onChange={(e) => update({ termsText: e.target.value })} rows={2} className={field} /></label>
          <div className={`${labelCls} sm:col-span-2`}>{t.signature}
            <div className="mt-1.5 flex items-center gap-3">
              {assets.signature && <img src={assets.signature} alt="" className="h-10 max-w-[160px] object-contain" />}
              <label className={`${secondaryButton} cursor-pointer`}>
                {t.addSignature}
                <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => { void uploadImage("signature", e.target.files?.[0]); e.target.value = ""; }} />
              </label>
              {assets.signature && <button type="button" onClick={() => setAssets((a) => ({ ...a, signature: "" }))} className="text-sm font-medium text-muted hover:text-ink">{t.removeImage}</button>}
            </div>
          </div>
        </Section>
      </div>

      <article ref={invoiceRef} className="invoice-paper mx-auto w-full max-w-[820px] self-start rounded-[14px] bg-white p-6 text-[13px] leading-5 text-ink shadow-card md:p-9" lang={paperLang} dir={paperLang === "ar" ? "rtl" : undefined} data-invoice-paper>
        <header data-keep className="flex flex-col gap-6 border-b border-ink pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            {assets.logo && <img src={assets.logo} alt="" className="mb-3 max-h-14 max-w-[200px] object-contain" />}
            <p className="text-lg font-semibold">{draft.name || p.yourBusiness}</p>
            {draft.address && <p className="mt-1 whitespace-pre-line text-charcoal">{draft.address}</p>}
            {(draft.email || draft.phone) && <p className="mt-1 text-charcoal">{[draft.email, draft.phone].filter(Boolean).join(" · ")}</p>}
            {draft.taxId && draft.status !== "unregistered" && <p className="mt-1 text-charcoal">{country.taxId}: <span className="font-mono">{draft.taxId}</span></p>}
            {isIndia && draft.pan && <p className="text-charcoal">PAN: <span className="font-mono">{draft.pan}</span></p>}
            {plan.india && sellerRegion && <p className="text-charcoal">{p.stateCodeLabel}: {stateName(sellerRegion)} ({sellerRegion})</p>}
          </div>
          <div className="shrink-0 sm:text-right">
            <p className="text-2xl font-semibold tracking-tight" data-invoice-title>{docTitle}</p>
            <dl className="mt-2 grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-charcoal sm:justify-end">
              <dt>{p.invoiceNoLabel}</dt><dd className="font-mono text-ink">{draft.invoiceNo}</dd>
              <dt>{bare(p.issued)}</dt><dd className="text-ink">{formatDate(draft.invoiceDate, locale)}</dd>
              {draft.supplyDate && <><dt>{p.supplyDateLabel}</dt><dd className="text-ink">{formatDate(draft.supplyDate, locale)}</dd></>}
              <dt>{bare(p.due)}</dt><dd className="text-ink">{formatDate(dueDate, locale)}</dd>
              {draft.po && <><dt>{p.poLabel}</dt><dd className="text-ink">{draft.po}</dd></>}
            </dl>
          </div>
        </header>

        <section data-keep className="mt-5 grid gap-5 sm:grid-cols-[1fr_auto]">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted">{p.billTo}</p>
            <p className="mt-1 text-base font-semibold">{draft.client.name || p.customerFallback}</p>
            {draft.client.address && <p className="mt-0.5 whitespace-pre-line text-charcoal">{draft.client.address}</p>}
            {draft.client.where !== "domestic" && draft.client.country && <p className="text-charcoal">{draft.client.country}</p>}
            {draft.client.email && <p className="text-charcoal">{draft.client.email}</p>}
            {draft.client.taxId && <p className="text-charcoal">{clientTaxLabel.replace(/^Client /, "")}: <span className="font-mono">{draft.client.taxId}</span></p>}
            {placeOfSupply && <p className="mt-1 text-charcoal">{p.placeOfSupplyLabel}: {placeOfSupply}</p>}
          </div>
          <div className="rounded-[12px] bg-fog px-5 py-4 sm:min-w-[220px] sm:text-right">
            <p className="text-xs font-medium text-muted">{totals.paid > 0 ? p.balanceDue : p.amountPayable}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight" data-invoice-total>{money(totals.balance)}</p>
            <p className="mt-0.5 text-xs text-muted">{bare(p.due)} {formatDate(dueDate, locale)}</p>
          </div>
        </section>

        <div className="mt-6 overflow-x-auto">
        <table className="w-full border-collapse text-start">
          <thead>
            <tr className="border-b border-ink text-xs font-medium text-muted">
              <th className="py-2 pe-2 text-start font-medium">{p.item}</th>
              {showHsn && <th className="px-2 py-2 text-start font-medium">{p.hsn}</th>}
              <th className="px-2 py-2 text-end font-medium">{p.qty}</th>
              <th className="px-2 py-2 text-end font-medium">{p.rate}</th>
              {taxed && <th className="px-2 py-2 text-end font-medium">{p.taxCol}</th>}
              <th className="py-2 ps-2 text-end font-medium">{p.amount}</th>
            </tr>
          </thead>
          <tbody>
            {draft.items.map((item, index) => {
              const line = parsed.lines[index];
              const rateK = plan.zero ? 0 : (line?.rate ?? 0);
              return (
                <tr key={item.id} data-keep className="border-b border-hairline align-top">
                  <td className="py-2.5 pe-2 font-medium">{item.name}</td>
                  {showHsn && <td className="px-2 py-2.5 font-mono text-charcoal">{item.hsn}</td>}
                  <td className="whitespace-nowrap px-2 py-2.5 text-end tabular-nums">{item.qty}{item.unit ? ` ${item.unit}` : ""}</td>
                  <td className="whitespace-nowrap px-2 py-2.5 text-end tabular-nums">{money(line?.price ?? 0)}</td>
                  {taxed && <td className="whitespace-nowrap px-2 py-2.5 text-end tabular-nums">{percent(rateK)}</td>}
                  <td className="whitespace-nowrap py-2.5 ps-2 text-end font-medium tabular-nums">{money(totals.lineAmounts[index] ?? 0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>

        <section data-keep className="mt-5 grid gap-6 sm:grid-cols-[1fr_280px]">
          <div className="order-2 space-y-4 sm:order-1">
            {(showUpi || payUrl || draft.bank) && (
              <div className="rounded-[12px] ring-1 ring-hairline p-4">
                <p className="font-semibold">{p.paymentDetails}</p>
                <div className="mt-3 flex flex-wrap gap-5">
                  {showUpi && qrDataUrl && (
                    <div className="flex items-start gap-3">
                      <img src={qrDataUrl} alt={p.paymentQr} className="h-28 w-28" data-invoice-upi-qr />
                      <div className="max-w-[180px] text-xs leading-5 text-charcoal">
                        <p className="font-semibold text-ink">{p.paymentQr}</p>
                        <p className="font-mono">{draft.upiId}</p>
                        <p className="mt-1">{p.scanHelp}</p>
                      </div>
                    </div>
                  )}
                  {payUrl && linkQrDataUrl && (
                    <div className="flex items-start gap-3">
                      <img src={linkQrDataUrl} alt={p.payOnline} className="h-24 w-24" />
                      <div className="max-w-[200px] text-xs leading-5 text-charcoal">
                        <p className="font-semibold text-ink">{p.payOnline}</p>
                        <p className="break-all text-leaf">{payUrl}</p>
                        <p className="mt-1">{p.scanToPayLink}</p>
                      </div>
                    </div>
                  )}
                </div>
                {draft.bank && <p className="mt-3 whitespace-pre-line border-t border-hairline pt-3 text-xs leading-5 text-charcoal"><span className="font-semibold text-ink">{bare(p.bankDetails)}</span>{"\n"}{draft.bank}</p>}
              </div>
            )}
            {(isIndia || inr) && (
              <p className="text-xs text-charcoal" data-invoice-words><span className="font-medium text-ink">{p.amountInWordsLabel}:</span> {amountInWords(totals.total, draft.currency)}</p>
            )}
          </div>

          <dl className="order-1 space-y-1.5 tabular-nums sm:order-2">
            <div className="flex justify-between gap-4"><dt className="text-charcoal">{p.subtotal}</dt><dd>{money(totals.subtotal)}</dd></div>
            {totals.discount > 0 && (
              <div className="flex justify-between gap-4"><dt className="text-charcoal">{p.discountLabel}{draft.discountKind === "percent" ? ` (${percent(parsed.discount)})` : ""}</dt><dd>−{money(totals.discount)}</dd></div>
            )}
            {taxed && totals.discount > 0 && <div className="flex justify-between gap-4"><dt className="text-charcoal">{p.taxableValue}</dt><dd>{money(totals.taxable)}</dd></div>}
            {taxed && totals.groups.flatMap((g) => g.parts.map((part) => (
              <div key={`${g.rateK}-${part.kind}`} className="flex justify-between gap-4" data-invoice-tax={part.kind}>
                <dt className="text-charcoal">{part.kind === "cgst" ? "CGST" : part.kind === "sgst" ? "SGST" : part.kind === "igst" ? "IGST" : taxName} {percent(part.rateK)}{totals.groups.length > 1 ? <span className="text-muted"> · {money(g.baseMinor)}</span> : null}</dt>
                <dd>{money(part.minor)}</dd>
              </div>
            )))}
            {extraShown && <div className="flex justify-between gap-4"><dt className="text-charcoal">{draft.extraLabel} {percent(parsed.extraRate)}</dt><dd>{money(totals.extraTax)}</dd></div>}
            {totals.roundOff !== 0 && <div className="flex justify-between gap-4"><dt className="text-charcoal">{p.roundOffLabel}</dt><dd>{totals.roundOff < 0 ? "−" : "+"}{money(Math.abs(totals.roundOff))}</dd></div>}
            <div className="flex justify-between gap-4 border-t border-ink pt-2 text-base font-semibold"><dt>{p.total}</dt><dd>{money(totals.total)}</dd></div>
            {totals.paid > 0 && (
              <>
                <div className="flex justify-between gap-4"><dt className="text-charcoal">{p.amountPaidLabel}</dt><dd>−{money(totals.paid)}</dd></div>
                <div className="flex justify-between gap-4 font-semibold"><dt>{p.balanceDue}</dt><dd>{money(totals.balance)}</dd></div>
              </>
            )}
            {fxPaise > 0 && (
              <p className="pt-1 text-xs text-muted">{fill(p.inrValue, { rate: draft.fxRate.trim(), cur: draft.currency })}: <span className="text-ink">{inrMoney(fxPaise)}</span></p>
            )}
          </dl>
        </section>

        {(plan.notes.length > 0 || (plan.india && !plan.zero && draft.status === "registered" && draft.client.where === "domestic")) && (
          <section data-keep className="mt-5 space-y-1 text-xs leading-5 text-charcoal" data-invoice-legal>
            {plan.notes.map((note) => <p key={note}>{note}</p>)}
            {plan.india && draft.status === "registered" && draft.client.where === "domestic" && !draft.reverseCharge && (
              <p>{fill(p.reverseChargeLine, { answer: p.no })}</p>
            )}
          </section>
        )}

        {(draft.notes || draft.termsText) && (
          <section data-keep className="mt-5 space-y-2 border-t border-hairline pt-4 text-xs leading-5 text-charcoal">
            {draft.notes && <p className="whitespace-pre-line"><span className="font-medium text-ink">{bare(p.notes)}:</span> {draft.notes}</p>}
            {draft.termsText && <p className="whitespace-pre-line"><span className="font-medium text-ink">{p.termsLabel}:</span> {draft.termsText}</p>}
          </section>
        )}

        {(assets.signature || (plan.india && draft.status !== "unregistered")) && (
          <section data-keep className="mt-6 flex justify-end">
            <div className="min-w-[200px] text-center text-xs text-charcoal">
              <p>{fill(p.forBusiness, { name: draft.name || p.yourBusiness })}</p>
              {assets.signature ? <img src={assets.signature} alt="" className="mx-auto my-2 max-h-14 max-w-[200px] object-contain" /> : <div className="h-12" />}
              <p className="border-t border-hairline pt-1">{p.authorisedSignatory}</p>
            </div>
          </section>
        )}
      </article>
    </div>
  );
}
