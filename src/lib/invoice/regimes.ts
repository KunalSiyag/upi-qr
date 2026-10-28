/**
 * Country rules for the free invoice generator: which tax the seller charges, what the document is called,
 * which IDs it shows, and the legal notes a cross-border or small-business invoice needs.
 * Data and pure functions only, with no imports, so scripts/invoice.test.mjs runs it under Node.
 *
 * Rates are the standard ones as of October 2026 and are only defaults: every rate stays editable per line.
 */

export type SellerStatus = "registered" | "composition" | "unregistered";
export type ClientWhere = "domestic" | "eu" | "abroad";
export type SupplyKind = "services" | "goods";
export type DocTitle = "taxInvoice" | "vatInvoice" | "invoice" | "billOfSupply" | "qualifiedInvoice";

export type Region = { code: string; name: string; rate?: string; label?: string; extra?: { label: string; rate: string } };

export type Country = {
  code: string;
  name: string;
  currency: string;
  /** Number and date formatting on the paper. */
  locale: string;
  tax: string;
  taxId: string;
  clientTaxId: string;
  /** Suggested rates, the first is the default. */
  rates: string[];
  eu?: boolean;
  statuses: SellerStatus[];
  /** Title when registered for tax. */
  title: DocTitle;
  /** Printed when the seller is not registered (a small-business exemption the law asks to mention). */
  smallBusinessNote?: string;
  /** Printed for a zero-rated or out-of-scope supply to a client abroad. */
  exportNote?: Record<SupplyKind, string>;
  /** Local wording of "reverse charge" for intra-EU B2B (Art. 226(11a) VAT Directive asks for the mention). */
  reverseCharge?: string;
  /** Builder hint: domestic invoices here are issued through a government e-invoicing system. */
  eInvoice?: string;
  /** Client regions that change the rate (India: place of supply, Canada: province). */
  regions?: Region[];
  /** Builder hint for the rate. */
  rateHint?: string;
  /** The tax's own name, printed when the invoice is in that language (DocLang code). */
  localTax?: { lang: string; name: string };
};

/** GST state codes (first two digits of a GSTIN). */
export const INDIA_STATES: Region[] = [
  ["01", "Jammu and Kashmir"], ["02", "Himachal Pradesh"], ["03", "Punjab"], ["04", "Chandigarh"], ["05", "Uttarakhand"],
  ["06", "Haryana"], ["07", "Delhi"], ["08", "Rajasthan"], ["09", "Uttar Pradesh"], ["10", "Bihar"], ["11", "Sikkim"],
  ["12", "Arunachal Pradesh"], ["13", "Nagaland"], ["14", "Manipur"], ["15", "Mizoram"], ["16", "Tripura"], ["17", "Meghalaya"],
  ["18", "Assam"], ["19", "West Bengal"], ["20", "Jharkhand"], ["21", "Odisha"], ["22", "Chhattisgarh"], ["23", "Madhya Pradesh"],
  ["24", "Gujarat"], ["26", "Dadra and Nagar Haveli and Daman and Diu"], ["27", "Maharashtra"], ["29", "Karnataka"], ["30", "Goa"],
  ["31", "Lakshadweep"], ["32", "Kerala"], ["33", "Tamil Nadu"], ["34", "Puducherry"], ["35", "Andaman and Nicobar Islands"],
  ["36", "Telangana"], ["37", "Andhra Pradesh"], ["38", "Ladakh"], ["97", "Other Territory"],
].map(([code, name]) => ({ code, name }));

/** Canada: the rate follows the province of the place of supply (usually the client's). */
export const CANADA_PROVINCES: Region[] = [
  { code: "AB", name: "Alberta", rate: "5", label: "GST" },
  { code: "BC", name: "British Columbia", rate: "5", label: "GST", extra: { label: "PST", rate: "7" } },
  { code: "MB", name: "Manitoba", rate: "5", label: "GST", extra: { label: "RST", rate: "7" } },
  { code: "NB", name: "New Brunswick", rate: "15", label: "HST" },
  { code: "NL", name: "Newfoundland and Labrador", rate: "15", label: "HST" },
  { code: "NS", name: "Nova Scotia", rate: "14", label: "HST" },
  { code: "NT", name: "Northwest Territories", rate: "5", label: "GST" },
  { code: "NU", name: "Nunavut", rate: "5", label: "GST" },
  { code: "ON", name: "Ontario", rate: "13", label: "HST" },
  { code: "PE", name: "Prince Edward Island", rate: "15", label: "HST" },
  { code: "QC", name: "Quebec", rate: "5", label: "GST", extra: { label: "QST", rate: "9.975" } },
  { code: "SK", name: "Saskatchewan", rate: "5", label: "GST", extra: { label: "PST", rate: "6" } },
  { code: "YT", name: "Yukon", rate: "5", label: "GST" },
];

const REG: SellerStatus[] = ["registered", "unregistered"];
const EU_EXPORT: Record<SupplyKind, string> = {
  services: "VAT not applicable: place of supply outside the EU (Art. 44 Directive 2006/112/EC).",
  goods: "VAT-exempt export of goods outside the EU (Art. 146 Directive 2006/112/EC).",
};
const zeroRated = (tax: string): Record<SupplyKind, string> => ({
  services: `Zero-rated ${tax}: services supplied to a client outside the country.`,
  goods: `Zero-rated ${tax}: export of goods.`,
});

function eu(code: string, name: string, rates: string[], currency: string, locale: string, extra: Partial<Country> = {}): Country {
  return {
    code, name, currency, locale, tax: "VAT", taxId: "VAT ID", clientTaxId: "Client VAT ID", rates, eu: true,
    statuses: REG, title: "invoice", exportNote: EU_EXPORT, ...extra,
  };
}

export const COUNTRIES: Country[] = [
  {
    code: "IN", name: "India", currency: "INR", locale: "en-IN", tax: "GST", taxId: "GSTIN", clientTaxId: "Client GSTIN",
    rates: ["18", "5", "40", "3", "0.25", "0"], statuses: ["registered", "composition", "unregistered"], title: "taxInvoice",
    regions: INDIA_STATES,
  },
  {
    code: "US", name: "United States", currency: "USD", locale: "en-US", tax: "Sales tax", taxId: "EIN / Tax ID", clientTaxId: "Client tax ID",
    rates: ["0"], statuses: ["registered"], title: "invoice",
    rateHint: "Most services carry no sales tax. For taxable goods, enter your combined state and local rate.",
  },
  {
    code: "GB", name: "United Kingdom", currency: "GBP", locale: "en-GB", tax: "VAT", taxId: "VAT reg. no.", clientTaxId: "Client VAT no.",
    rates: ["20", "5", "0"], statuses: REG, title: "vatInvoice",
    exportNote: {
      services: "Outside the scope of UK VAT: place of supply is the customer's country.",
      goods: "Zero-rated export of goods.",
    },
  },
  eu("DE", "Germany", ["19", "7", "0"], "EUR", "de-DE", {
    smallBusinessNote: "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.",
    reverseCharge: "Steuerschuldnerschaft des Leistungsempfängers",
    taxId: "USt-IdNr. / Steuernummer",
    localTax: { lang: "de", name: "USt." },
  }),
  eu("FR", "France", ["20", "10", "5.5", "2.1", "0"], "EUR", "fr-FR", {
    smallBusinessNote: "TVA non applicable, art. 293 B du CGI.",
    reverseCharge: "Autoliquidation",
    taxId: "N° TVA / SIRET",
    localTax: { lang: "fr", name: "TVA" },
  }),
  eu("ES", "Spain", ["21", "10", "4", "0"], "EUR", "es-ES", { reverseCharge: "Inversión del sujeto pasivo", taxId: "NIF / NIF-IVA", localTax: { lang: "es", name: "IVA" } }),
  eu("IT", "Italy", ["22", "10", "5", "4", "0"], "EUR", "it-IT", {
    smallBusinessNote: "Operazione effettuata ai sensi dell'art. 1, commi 54-89, Legge n. 190/2014 (regime forfettario).",
    reverseCharge: "Inversione contabile",
    taxId: "Partita IVA",
    localTax: { lang: "it", name: "IVA" },
    eInvoice: "Domestic invoices in Italy must be sent as XML through SdI. This PDF works as a courtesy copy or for clients abroad.",
  }),
  eu("NL", "Netherlands", ["21", "9", "0"], "EUR", "nl-NL", { smallBusinessNote: "Vrijgesteld van btw (KOR).", reverseCharge: "Btw verlegd", taxId: "Btw-id" }),
  eu("IE", "Ireland", ["23", "13.5", "9", "0"], "EUR", "en-IE"),
  eu("PT", "Portugal", ["23", "13", "6", "0"], "EUR", "pt-PT", {
    smallBusinessNote: "IVA - regime de isenção (art. 53.º do CIVA).",
    reverseCharge: "Autoliquidação",
    taxId: "NIF",
    localTax: { lang: "pt", name: "IVA" },
  }),
  eu("BE", "Belgium", ["21", "12", "6", "0"], "EUR", "nl-BE", {
    smallBusinessNote: "Bijzondere vrijstellingsregeling kleine ondernemingen / Régime particulier de franchise des petites entreprises.",
    reverseCharge: "Btw verlegd / Autoliquidation",
    taxId: "Btw / TVA",
    eInvoice: "Belgian B2B invoices go through Peppol from 1 January 2026. Use this PDF for clients abroad or as a copy.",
  }),
  eu("AT", "Austria", ["20", "13", "10", "0"], "EUR", "de-AT", {
    smallBusinessNote: "Umsatzsteuerbefreit – Kleinunternehmer gem. § 6 Abs. 1 Z 27 UStG.",
    reverseCharge: "Übergang der Steuerschuld",
    taxId: "UID-Nummer",
    localTax: { lang: "de", name: "USt." },
  }),
  eu("PL", "Poland", ["23", "8", "5", "0"], "PLN", "pl-PL", {
    reverseCharge: "Odwrotne obciążenie",
    taxId: "NIP",
    eInvoice: "Polish B2B invoices go through KSeF. Use this PDF for clients abroad or as a copy.",
  }),
  eu("SE", "Sweden", ["25", "12", "6", "0"], "SEK", "sv-SE", { reverseCharge: "Omvänd betalningsskyldighet", taxId: "Momsreg.nr" }),
  eu("DK", "Denmark", ["25", "0"], "DKK", "da-DK", { reverseCharge: "Omvendt betalingspligt", taxId: "CVR / SE-nr." }),
  eu("FI", "Finland", ["25.5", "13.5", "10", "0"], "EUR", "fi-FI", { reverseCharge: "Käännetty verovelvollisuus", taxId: "ALV-tunniste" }),
  eu("GR", "Greece", ["24", "13", "6", "0"], "EUR", "el-GR", { taxId: "ΑΦΜ / VAT" }),
  eu("CZ", "Czechia", ["21", "12", "0"], "CZK", "cs-CZ", { reverseCharge: "Daň odvede zákazník", taxId: "DIČ" }),
  eu("RO", "Romania", ["21", "11", "0"], "RON", "ro-RO", { reverseCharge: "Taxare inversă", taxId: "CUI / CIF" }),
  eu("HU", "Hungary", ["27", "18", "5", "0"], "HUF", "hu-HU", { reverseCharge: "Fordított adózás", taxId: "Adószám" }),
  eu("LU", "Luxembourg", ["17", "14", "8", "3", "0"], "EUR", "fr-LU", { reverseCharge: "Autoliquidation", localTax: { lang: "fr", name: "TVA" } }),
  eu("HR", "Croatia", ["25", "13", "5", "0"], "EUR", "hr-HR", { reverseCharge: "Prijenos porezne obveze", taxId: "OIB" }),
  eu("SK", "Slovakia", ["23", "19", "5", "0"], "EUR", "sk-SK", { reverseCharge: "Prenesenie daňovej povinnosti", taxId: "IČ DPH" }),
  eu("SI", "Slovenia", ["22", "9.5", "5", "0"], "EUR", "sl-SI", { taxId: "ID za DDV" }),
  eu("BG", "Bulgaria", ["20", "9", "0"], "EUR", "bg-BG", { taxId: "ДДС №" }),
  eu("LT", "Lithuania", ["21", "9", "5", "0"], "EUR", "lt-LT", { taxId: "PVM kodas" }),
  eu("LV", "Latvia", ["21", "12", "5", "0"], "EUR", "lv-LV", { taxId: "PVN reģ. Nr." }),
  eu("EE", "Estonia", ["24", "9", "0"], "EUR", "et-EE", { taxId: "KMKR nr" }),
  eu("CY", "Cyprus", ["19", "9", "5", "0"], "EUR", "en-CY"),
  eu("MT", "Malta", ["18", "7", "5", "0"], "EUR", "en-MT"),
  {
    code: "CH", name: "Switzerland", currency: "CHF", locale: "de-CH", tax: "VAT (MWST)", taxId: "UID / MWST-Nr.", clientTaxId: "Client VAT no.",
    rates: ["8.1", "3.8", "2.6", "0"], statuses: REG, title: "invoice",
    exportNote: { services: "Not subject to Swiss VAT: place of supply abroad.", goods: "VAT-exempt export of goods." },
    localTax: { lang: "de", name: "MWST" },
  },
  {
    code: "AE", name: "United Arab Emirates", currency: "AED", locale: "en-AE", tax: "VAT", taxId: "TRN", clientTaxId: "Client TRN",
    rates: ["5", "0"], statuses: REG, title: "taxInvoice", exportNote: zeroRated("VAT"),
    localTax: { lang: "ar", name: "ضريبة القيمة المضافة" },
  },
  {
    code: "AU", name: "Australia", currency: "AUD", locale: "en-AU", tax: "GST", taxId: "ABN", clientTaxId: "Client ABN",
    rates: ["10", "0"], statuses: REG, title: "taxInvoice", smallBusinessNote: "No GST has been charged.",
    exportNote: { services: "GST-free export of services.", goods: "GST-free export of goods." },
    rateHint: "Only charge GST if you are registered. Tax invoices of A$1,000 or more must show the client's ABN or identity.",
  },
  {
    code: "NZ", name: "New Zealand", currency: "NZD", locale: "en-NZ", tax: "GST", taxId: "GST number", clientTaxId: "Client GST number",
    rates: ["15", "0"], statuses: REG, title: "taxInvoice", exportNote: zeroRated("GST"),
  },
  {
    code: "CA", name: "Canada", currency: "CAD", locale: "en-CA", tax: "GST/HST", taxId: "Business number (BN)", clientTaxId: "Client BN",
    rates: ["5", "13", "14", "15", "0"], statuses: REG, title: "invoice", regions: CANADA_PROVINCES,
    exportNote: { services: "Zero-rated: services exported to a non-resident.", goods: "Zero-rated export of goods." },
    rateHint: "The rate follows the province where the service is supplied, usually the client's.",
  },
  {
    code: "SG", name: "Singapore", currency: "SGD", locale: "en-SG", tax: "GST", taxId: "GST reg. no.", clientTaxId: "Client UEN",
    rates: ["9", "0"], statuses: REG, title: "taxInvoice", exportNote: zeroRated("GST"),
  },
  {
    code: "MY", name: "Malaysia", currency: "MYR", locale: "en-MY", tax: "Service tax", taxId: "SST no.", clientTaxId: "Client TIN",
    rates: ["8", "6", "0"], statuses: REG, title: "invoice",
    exportNote: { services: "Service tax not charged: services exported outside Malaysia.", goods: "Export of goods: no sales tax." },
    eInvoice: "Malaysia is phasing in e-invoicing through LHDN MyInvois. Check whether your turnover band is already covered.",
  },
  {
    code: "JP", name: "Japan", currency: "JPY", locale: "ja-JP", tax: "Consumption tax", taxId: "Registration no. (T)", clientTaxId: "Client reg. no.",
    rates: ["10", "8", "0"], statuses: REG, title: "qualifiedInvoice", exportNote: { services: "Export transaction: consumption tax exempt (輸出免税).", goods: "Export transaction: consumption tax exempt (輸出免税)." },
    rateHint: "A qualified invoice needs your T-number and the tax for each rate (10% standard, 8% reduced).",
    localTax: { lang: "ja", name: "消費税" },
  },
  {
    code: "ID", name: "Indonesia", currency: "IDR", locale: "id-ID", tax: "PPN", taxId: "NPWP", clientTaxId: "Client NPWP",
    rates: ["11", "12", "0"], statuses: REG, title: "invoice",
    eInvoice: "Registered businesses (PKP) issue the VAT invoice itself through Coretax e-Faktur. This PDF is the commercial invoice.",
    rateHint: "PPN is 12% on a 11/12 tax base for most goods and services, an effective 11%.",
  },
  {
    code: "PH", name: "Philippines", currency: "PHP", locale: "en-PH", tax: "VAT", taxId: "TIN", clientTaxId: "Client TIN",
    rates: ["12", "0"], statuses: ["registered", "unregistered"], title: "invoice", exportNote: zeroRated("VAT"),
  },
  {
    code: "ZA", name: "South Africa", currency: "ZAR", locale: "en-ZA", tax: "VAT", taxId: "VAT no.", clientTaxId: "Client VAT no.",
    rates: ["15", "0"], statuses: REG, title: "taxInvoice", exportNote: zeroRated("VAT"),
  },
  {
    code: "NG", name: "Nigeria", currency: "NGN", locale: "en-NG", tax: "VAT", taxId: "TIN", clientTaxId: "Client TIN",
    rates: ["7.5", "0"], statuses: REG, title: "taxInvoice", exportNote: zeroRated("VAT"),
  },
  {
    code: "KE", name: "Kenya", currency: "KES", locale: "en-KE", tax: "VAT", taxId: "KRA PIN", clientTaxId: "Client KRA PIN",
    rates: ["16", "0"], statuses: REG, title: "taxInvoice", exportNote: zeroRated("VAT"),
    eInvoice: "Kenyan tax invoices must be issued through KRA eTIMS. Use this PDF as a commercial invoice or for clients abroad.",
  },
  {
    code: "BR", name: "Brazil", currency: "BRL", locale: "pt-BR", tax: "ISS", taxId: "CNPJ / CPF", clientTaxId: "CNPJ / CPF do cliente",
    rates: ["0", "2", "5"], statuses: REG, title: "invoice",
    eInvoice: "The fiscal document in Brazil is the NFS-e / NF-e from your city or state. This PDF is a commercial invoice (fatura).",
  },
  {
    code: "MX", name: "Mexico", currency: "MXN", locale: "es-MX", tax: "IVA", taxId: "RFC", clientTaxId: "RFC del cliente",
    rates: ["16", "8", "0"], statuses: REG, title: "invoice", exportNote: zeroRated("IVA"),
    eInvoice: "Domestic invoices in Mexico must be CFDI stamped by a PAC. This PDF is a commercial invoice or for clients abroad.",
    localTax: { lang: "es", name: "IVA" },
  },
  {
    code: "CN", name: "China", currency: "CNY", locale: "zh-CN", tax: "VAT", taxId: "Taxpayer ID", clientTaxId: "Client taxpayer ID",
    rates: ["6", "13", "9", "0"], statuses: REG, title: "invoice",
    eInvoice: "The tax invoice in China is the fapiao issued through the tax system. This PDF is a commercial invoice.",
    localTax: { lang: "zh", name: "增值税" },
  },
  {
    code: "SA", name: "Saudi Arabia", currency: "SAR", locale: "en-SA", tax: "VAT", taxId: "VAT no.", clientTaxId: "Client VAT no.",
    rates: ["15", "0"], statuses: REG, title: "invoice", exportNote: zeroRated("VAT"),
    eInvoice: "Saudi tax invoices must come from a ZATCA-compliant e-invoicing system. Use this PDF as a commercial invoice or for clients abroad.",
    localTax: { lang: "ar", name: "ضريبة القيمة المضافة" },
  },
  {
    code: "BD", name: "Bangladesh", currency: "BDT", locale: "en-BD", tax: "VAT", taxId: "BIN", clientTaxId: "Client BIN",
    rates: ["15", "0"], statuses: REG, title: "invoice", exportNote: zeroRated("VAT"),
  },
  {
    code: "LK", name: "Sri Lanka", currency: "LKR", locale: "en-LK", tax: "VAT", taxId: "VAT reg. no.", clientTaxId: "Client TIN",
    rates: ["18", "0"], statuses: REG, title: "taxInvoice", exportNote: zeroRated("VAT"),
  },
  {
    code: "NP", name: "Nepal", currency: "NPR", locale: "en-NP", tax: "VAT", taxId: "PAN / VAT no.", clientTaxId: "Client PAN",
    rates: ["13", "0"], statuses: REG, title: "taxInvoice", exportNote: zeroRated("VAT"),
  },
  {
    code: "XX", name: "Other country", currency: "USD", locale: "en-US", tax: "Tax", taxId: "Tax ID", clientTaxId: "Client tax ID",
    rates: ["0"], statuses: ["registered"], title: "invoice",
  },
];

/** Billing currencies offered in the picker (any seller can bill in any of them). */
export const INVOICE_CURRENCIES = [
  "INR", "USD", "EUR", "GBP", "AED", "AUD", "CAD", "SGD", "NZD", "CHF", "JPY", "CNY", "HKD", "SAR", "QAR", "KWD", "BHD", "OMR",
  "MYR", "IDR", "PHP", "THB", "ZAR", "NGN", "KES", "BRL", "MXN", "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "RON",
  "BDT", "LKR", "NPR",
];

export function countryByCode(code: string): Country {
  return COUNTRIES.find((c) => c.code === code) ?? COUNTRIES[0];
}

export function regionByCode(country: Country, code: string): Region | undefined {
  return country.regions?.find((r) => r.code === code);
}

/** Rule 46 (CGST Rules) export endorsements. LUT text matches LUT_ENDORSEMENT in workspace/currency.ts. */
export const INDIA_EXPORT_LUT = "SUPPLY MEANT FOR EXPORT/SUPPLY TO SEZ UNIT OR SEZ DEVELOPER FOR AUTHORISED OPERATIONS UNDER BOND OR LETTER OF UNDERTAKING WITHOUT PAYMENT OF INTEGRATED TAX";
export const INDIA_EXPORT_IGST = "SUPPLY MEANT FOR EXPORT/SUPPLY TO SEZ UNIT OR SEZ DEVELOPER FOR AUTHORISED OPERATIONS ON PAYMENT OF INTEGRATED TAX";
export const INDIA_COMPOSITION = "Composition taxable person, not eligible to collect tax on supplies.";

/** GSTIN checksum (mod 36, as the GST portal validates it). */
export function validGstin(value: string): boolean {
  const s = value.trim().toUpperCase();
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(s)) return false;
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = chars.indexOf(s[i]) * (i % 2 ? 2 : 1);
    sum += Math.floor(v / 36) + (v % 36);
  }
  return chars[(36 - (sum % 36)) % 36] === s[14];
}

/** "27" from a GSTIN that starts with a known state code, else "". */
export function gstinState(value: string): string {
  const code = value.trim().slice(0, 2);
  return INDIA_STATES.some((s) => s.code === code) ? code : "";
}

export type TaxContext = {
  status: SellerStatus;
  where: ClientWhere;
  kind: SupplyKind;
  /** India: seller's state code; Canada: unused. */
  sellerRegion: string;
  /** India: place of supply (client's state); Canada: province. */
  clientRegion: string;
  /** India export: LUT ARN ("" = export on payment of IGST). */
  lutArn: string;
  /** India: tax payable by the recipient under reverse charge. */
  reverseCharge: boolean;
};

export type TaxPlan = {
  title: DocTitle;
  /** How tax lines print; "none" = no tax column at all. */
  split: "none" | "single" | "cgst_sgst" | "igst";
  /** Every line is taxed at 0 (export, reverse charge) while the tax column still shows. */
  zero: boolean;
  taxLabel: string;
  /** Legal notes printed on the invoice. */
  notes: string[];
  /** Show HSN/SAC, place of supply and the reverse-charge line (India, registered). */
  india: boolean;
};

export function taxPlan(country: Country, ctx: TaxContext): TaxPlan {
  const abroad = ctx.where !== "domestic";
  if (country.code === "IN") {
    if (ctx.status === "unregistered") return { title: "invoice", split: "none", zero: false, taxLabel: "GST", notes: [], india: false };
    if (ctx.status === "composition") return { title: "billOfSupply", split: "none", zero: false, taxLabel: "GST", notes: [INDIA_COMPOSITION], india: true };
    if (abroad) {
      const lut = ctx.lutArn.trim();
      return {
        title: "taxInvoice", split: "igst", zero: Boolean(lut), taxLabel: "IGST", india: true,
        notes: [lut ? `${INDIA_EXPORT_LUT} (LUT ARN ${lut.toUpperCase()})` : INDIA_EXPORT_IGST],
      };
    }
    const inter = Boolean(ctx.sellerRegion && ctx.clientRegion && ctx.sellerRegion !== ctx.clientRegion);
    return {
      title: "taxInvoice", split: inter ? "igst" : "cgst_sgst", zero: ctx.reverseCharge, taxLabel: inter ? "IGST" : "GST", india: true,
      notes: ctx.reverseCharge ? ["Tax payable on reverse charge basis: Yes. GST is payable by the recipient."] : [],
    };
  }

  if (ctx.status === "unregistered") {
    return { title: "invoice", split: "none", zero: false, taxLabel: country.tax, notes: country.smallBusinessNote ? [country.smallBusinessNote] : [], india: false };
  }
  const region = regionByCode(country, ctx.clientRegion);
  const taxLabel = region?.label ?? country.tax;
  if (country.eu && ctx.where === "eu") {
    const art = ctx.kind === "goods"
      ? "VAT-exempt intra-Community supply (Art. 138 Directive 2006/112/EC)."
      : "Reverse charge: VAT to be accounted for by the recipient (Art. 196 Directive 2006/112/EC).";
    const local = country.reverseCharge && ctx.kind === "services" ? `${country.reverseCharge}. ` : "";
    return { title: country.title, split: "single", zero: true, taxLabel, notes: [`${local}${art}`], india: false };
  }
  if (abroad && country.exportNote) {
    return { title: country.title, split: "single", zero: true, taxLabel, notes: [country.exportNote[ctx.kind]], india: false };
  }
  return { title: country.title, split: "single", zero: false, taxLabel, notes: [], india: false };
}

/** The default line rate for a country (and Canadian province). */
export function defaultRate(country: Country, clientRegion = ""): string {
  return regionByCode(country, clientRegion)?.rate ?? country.rates[0] ?? "0";
}

const ZONE_COUNTRY: Record<string, string> = {
  "Asia/Kolkata": "IN", "Asia/Calcutta": "IN", "Europe/London": "GB", "Europe/Berlin": "DE", "Europe/Paris": "FR", "Europe/Madrid": "ES",
  "Atlantic/Canary": "ES", "Europe/Rome": "IT", "Europe/Amsterdam": "NL", "Europe/Dublin": "IE", "Europe/Lisbon": "PT", "Europe/Brussels": "BE",
  "Europe/Vienna": "AT", "Europe/Warsaw": "PL", "Europe/Stockholm": "SE", "Europe/Copenhagen": "DK", "Europe/Helsinki": "FI", "Europe/Athens": "GR",
  "Europe/Prague": "CZ", "Europe/Bucharest": "RO", "Europe/Budapest": "HU", "Europe/Luxembourg": "LU", "Europe/Zagreb": "HR", "Europe/Bratislava": "SK",
  "Europe/Ljubljana": "SI", "Europe/Sofia": "BG", "Europe/Vilnius": "LT", "Europe/Riga": "LV", "Europe/Tallinn": "EE", "Asia/Nicosia": "CY",
  "Europe/Malta": "MT", "Europe/Zurich": "CH", "Asia/Dubai": "AE", "Pacific/Auckland": "NZ", "Asia/Singapore": "SG", "Asia/Kuala_Lumpur": "MY",
  "Asia/Tokyo": "JP", "Asia/Jakarta": "ID", "Asia/Makassar": "ID", "Asia/Jayapura": "ID", "Asia/Manila": "PH", "Africa/Johannesburg": "ZA",
  "Africa/Lagos": "NG", "Africa/Nairobi": "KE", "America/Sao_Paulo": "BR", "America/Mexico_City": "MX", "Asia/Shanghai": "CN", "Asia/Riyadh": "SA",
  "Asia/Dhaka": "BD", "Asia/Colombo": "LK", "Asia/Kathmandu": "NP", "America/Toronto": "CA", "America/Vancouver": "CA", "America/Edmonton": "CA",
  "America/Winnipeg": "CA", "America/Halifax": "CA", "America/St_Johns": "CA", "America/Regina": "CA",
};

/** The seller's likely country from the browser time zone ("" when unknown), used only for a first visit. */
export function countryFromTimeZone(zone: string): string {
  if (ZONE_COUNTRY[zone]) return ZONE_COUNTRY[zone];
  if (zone.startsWith("Australia/")) return "AU";
  if (/^America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Detroit|Boise|Indiana\/|Kentucky\/)/.test(zone) || zone === "Pacific/Honolulu") return "US";
  return "";
}
