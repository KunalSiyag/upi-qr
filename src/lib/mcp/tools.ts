/**
 * The Pro UPI QR tools served at /mcp/ (see protocol.ts). Each one computes an
 * answer from its arguments only: nothing is stored, logged or fetched. Money is
 * integer paise throughout, parsed from the rupee text without floating point.
 *
 * Imported by src/pages/mcp/index.ts and by scripts/mcp.test.mjs, so keep runtime
 * imports to `.ts` modules that Node can load, plus `qrcode`.
 */
import QRCode from "qrcode";
import { buildUpiUri, isValidVpa } from "../upi-uri.ts";
import { formatPaise } from "../apiSecurity.ts";
import { gstLine } from "../gstMath.ts";
import { mdrFormula, mdrOnTransaction, merchantNetPaise, UPI_MDR, type UpiMdrCategory } from "../upiMdr.ts";
import { amountInWordsInr } from "../inr-words.ts";
import { addDays, daysBetween, msmeInterestPaise, MSME_MAX_CREDIT_DAYS } from "../workspace/model.ts";
import { MSMED_INTEREST_PCT, RBI_BANK_RATE } from "../../data/rbiRates.ts";
import { CATEGORY_LABEL, DEBIT_LABEL, ORIGIN_LABEL, UPI_ERROR_CODES, type UpiErrorCode } from "../../data/upiErrorCodes.ts";
import type { JsonObject, McpServer, McpTool, ToolResult } from "./protocol.ts";

export const SITE = "https://www.proupiqr.in";
export const MCP_SERVER_VERSION = "1.1.0";

/**
 * Pages find_merchant_tools may return: free tools and hubs only. The /products/ hardware
 * guides carry Amazon Associate links, and directory policies exclude sponsored placements.
 */
export function isCatalogEligible(href: string): boolean {
  return href.startsWith("/") && !href.startsWith("//") && !/^\/products(\/|$)/.test(href);
}

/** A free tool or hub on the site, for find_merchant_tools. */
export interface CatalogEntry {
  name: string;
  href: string;
  description: string;
  topic: string;
}

/** ₹1 crore: the most a single amount may carry here (as in the rest of the API). */
const MAX_UPI_PAISE = 1_000_000_000;
/** ₹99,99,99,999.99: the words helper spells crores up to 99. */
const MAX_WORDS_PAISE = 99_999_999_999;
/** ₹1,000 crore: plenty for GST, MSMED and MDR arithmetic. */
const MAX_CALC_PAISE = 1_000_000_000_000;
const ONE_LAKH_PAISE = 1_00_000_00;

const done = (text: string, structuredContent?: JsonObject): ToolResult => ({ content: [{ type: "text", text }], ...(structuredContent ? { structuredContent } : {}) });
const problem = (text: string): ToolResult => ({ content: [{ type: "text", text }], isError: true });

const str = (value: unknown): string => (typeof value === "string" ? value.trim() : typeof value === "number" && Number.isFinite(value) ? String(value) : "");
const clip = (value: string, max = 60) => (value.length > max ? `${value.slice(0, max)}…` : value);
const hasControl = (value: string) => /[\u0000-\u001f\u007f]/.test(value);

/** "₹1,25,000.50", "1250.5", 1250.5 → paise. Null unless rupees with at most two decimals. */
export function rupeesToPaise(value: unknown, maxPaise: number): number | null {
  let text: string;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return null;
    text = String(value);
  } else if (typeof value === "string") {
    text = value.trim().replace(/^(₹|rs\.?|inr)\s*/i, "").replace(/\s*(₹|rs\.?|inr|rupees?)$/i, "").replace(/[,\s]/g, "");
  } else {
    return null;
  }
  const match = /^(\d{1,13})(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  const paise = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(paise) && paise <= maxPaise ? paise : null;
}

/** Indian grouping, exact: 12500050 → "₹1,25,000.50". */
export function formatInr(paise: number): string {
  const rupees = Math.floor(paise / 100).toString();
  const head = rupees.slice(0, -3);
  const grouped = head ? `${head.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${rupees.slice(-3)}` : rupees;
  return `₹${grouped}.${String(paise % 100).padStart(2, "0")}`;
}

function isoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value;
}
/** Today in India. */
export const indiaToday = (now = Date.now()) => new Date(now + 330 * 60_000).toISOString().slice(0, 10);
const percentLabel = (bps: number) => `${(bps / 100).toFixed(3).replace(/\.?0+$/, "")}%`;

/** Links back to the site carry these so visits from AI assistants show up in analytics. */
export const MCP_UTM = "utm_source=mcp&utm_medium=tool";

/** `${SITE}${path}` with the MCP campaign tags before any #fragment. */
export function siteLink(path: string): string {
  const hash = path.indexOf("#");
  const [base, fragment] = hash === -1 ? [path, ""] : [path.slice(0, hash), path.slice(hash)];
  return `${SITE}${base}${base.includes("?") ? "&" : "?"}${MCP_UTM}${fragment}`;
}

/**
 * The generator with this payment filled in: the upi:// query rides in the #fragment
 * (`/?utm…#pay?pa=…&pn=…`), which browsers never send to a server. GeneratorForm reads it.
 */
export const posterUrl = (uri: string) => siteLink(`/#pay?${uri.slice(uri.indexOf("?") + 1)}`);

/** Said to the model and in the payment tools: the directories' policies exclude tools that move money. */
const NO_MONEY_MOVES = "These tools never send, receive or hold money: they only build upi:// links, QR codes and calculations, and the payer approves any payment in their own UPI app.";

/* ---------- UPI link and QR ---------- */

const UPI_ARGS = {
  upi_id: { type: "string", description: "Payee UPI ID (VPA), e.g. ramesh@okaxis or 9876543210@ybl." },
  payee_name: { type: "string", description: "Name the payer's UPI app shows: the shop, business or person." },
  amount: { type: ["number", "string"], description: "Optional amount in rupees, e.g. 499 or \"1250.50\". Leave it out and the payer types the amount." },
  note: { type: "string", description: "Optional note shown to the payer and on statements, e.g. \"Invoice 42\". Up to 80 characters." },
};

interface UpiPayment {
  uri: string;
  upiId: string;
  payee: string;
  amountPaise: number | null;
  note: string;
  warnings: string[];
}

function upiPayment(args: JsonObject): UpiPayment | string {
  const upiId = str(args.upi_id ?? args.vpa);
  if (!upiId) return "upi_id is required, e.g. ramesh@okaxis.";
  if (!isValidVpa(upiId)) return `"${clip(upiId)}" is not a UPI ID. A UPI ID looks like name@bank, e.g. ramesh@okaxis or 9876543210@ybl.`;
  const payee = str(args.payee_name ?? args.name);
  if (!payee) return "payee_name is required: the name the payer's UPI app should show.";
  if (payee.length > 99 || hasControl(payee)) return "payee_name must be plain text under 100 characters.";
  let amountPaise: number | null = null;
  if (args.amount !== undefined && args.amount !== null && str(args.amount) !== "") {
    amountPaise = rupeesToPaise(args.amount, MAX_UPI_PAISE);
    if (amountPaise === null) return `amount must be rupees with at most two decimals, e.g. 499 or 1250.50 (got "${clip(str(args.amount))}").`;
    if (amountPaise === 0) return "amount must be more than zero. Leave it out to let the payer type the amount.";
  }
  const note = str(args.note);
  if (note.length > 80 || hasControl(note)) return "note must be plain text of at most 80 characters.";

  const warnings: string[] = [];
  if (payee.length > 33) warnings.push("Some UPI apps cut payee names after about 33 characters; a shorter name displays in full.");
  if (amountPaise !== null && amountPaise > ONE_LAKH_PAISE) {
    warnings.push("Above ₹1,00,000 many payers can't pay in one UPI transaction (most banks cap a payment at ₹1 lakh; a few merchant categories allow more). Consider splitting the amount.");
  }
  const uri = buildUpiUri({ pa: upiId, pn: payee, cu: "INR", am: amountPaise === null ? undefined : formatPaise(amountPaise), tn: note || undefined });
  return { uri, upiId, payee, amountPaise, note, warnings };
}

function paymentSummary(p: UpiPayment): string {
  return [`${p.payee} (${p.upiId})`, p.amountPaise === null ? "amount entered by the payer" : formatInr(p.amountPaise), p.note ? `note "${p.note}"` : ""].filter(Boolean).join(", ");
}

const paymentData = (p: UpiPayment): JsonObject => ({
  upi_uri: p.uri,
  upi_id: p.upiId,
  payee_name: p.payee,
  amount_paise: p.amountPaise,
  amount_inr: p.amountPaise === null ? null : formatPaise(p.amountPaise),
  note: p.note || null,
  qr_and_poster_url: posterUrl(p.uri),
});

const createPaymentLink: McpTool = {
  name: "create_upi_payment_link",
  title: "Create UPI payment link",
  description:
    "Create a UPI payment link (upi://pay) for an Indian UPI ID. On a phone it opens PhonePe, Google Pay, Paytm, BHIM or any UPI app with the payee, amount and note filled in. Use it to collect a payment, split a bill or put on an invoice. Returns the link and a proupiqr.in page with its QR code and printable poster. Amounts are exact to the paisa; nothing is stored. It never moves money: the payer approves the payment in their own UPI app.",
  inputSchema: { type: "object", properties: UPI_ARGS, required: ["upi_id", "payee_name"] },
  run(args) {
    const p = upiPayment(args);
    if (typeof p === "string") return problem(p);
    return done(
      [
        `UPI payment link for ${paymentSummary(p)}:`,
        p.uri,
        "",
        "On a phone, opening it starts the payer's UPI app with these details (upi:// links don't open on a computer).",
        `QR code and printable poster: ${posterUrl(p.uri)}`,
        ...p.warnings.map((w) => `Note: ${w}`),
      ].join("\n"),
      paymentData(p),
    );
  },
};

const generateQr: McpTool = {
  name: "generate_upi_qr_code",
  title: "Generate UPI QR code",
  description:
    "Generate a UPI payment QR code (PNG image) for an Indian UPI ID that PhonePe, Google Pay, Paytm, BHIM and every UPI app can scan, optionally with a fixed amount and note. Also returns the upi:// link and a proupiqr.in page to download a printable counter poster or stickers. Nothing is stored. It never moves money: the payer approves the payment in their own UPI app.",
  inputSchema: {
    type: "object",
    properties: { ...UPI_ARGS, size: { type: "integer", minimum: 200, maximum: 1000, description: "Image width in pixels (default 512)." } },
    required: ["upi_id", "payee_name"],
  },
  async run(args) {
    const p = upiPayment(args);
    if (typeof p === "string") return problem(p);
    const requested = args.size === undefined ? 512 : Number(args.size);
    if (!Number.isInteger(requested) || requested < 200 || requested > 1000) return problem("size must be a whole number of pixels from 200 to 1000.");
    const png = await QRCode.toBuffer(p.uri, { type: "png", errorCorrectionLevel: "M", margin: 4, width: requested });
    return {
      content: [
        {
          type: "text",
          text: [
            `UPI QR code for ${paymentSummary(p)}. Any UPI app can scan it: PhonePe, Google Pay, Paytm, BHIM and bank apps.`,
            `Payment link: ${p.uri}`,
            `Printable poster, stickers and other sizes: ${posterUrl(p.uri)}`,
            ...p.warnings.map((w) => `Note: ${w}`),
          ].join("\n"),
        },
        { type: "image", data: Buffer.from(png).toString("base64"), mimeType: "image/png" },
      ],
      structuredContent: { ...paymentData(p), image_width: requested },
    };
  },
};

/* ---------- Read a UPI link ---------- */

const UPI_PARAMS: Record<string, string> = {
  pa: "Payee UPI ID",
  pn: "Payee name",
  am: "Amount",
  mam: "Minimum amount",
  cu: "Currency",
  tn: "Note",
  tr: "Transaction reference",
  tid: "Transaction ID",
  mc: "Merchant category code",
  mid: "Merchant ID",
  msid: "Store ID",
  mtid: "Terminal ID",
  url: "Reference URL",
  mode: "Initiation mode",
  purpose: "Purpose code",
  orgid: "Organisation ID",
  sign: "Signature",
};

const readUpiLink: McpTool = {
  name: "read_upi_link",
  title: "Read and check a UPI link",
  description:
    "Read a UPI payment link (the upi://pay… text inside a payment QR code) and check it: who gets paid, the amount, the note and any merchant fields, with warnings about anything malformed or risky, such as an AutoPay mandate posing as a payment. Use it before paying from a QR someone sent, or to find out why apps reject a QR.",
  inputSchema: {
    type: "object",
    properties: { link: { type: "string", description: "The upi://pay?… link, e.g. the text decoded from a QR code." } },
    required: ["link"],
  },
  run(args) {
    const link = str(args.link);
    if (!link) return problem("link is required: the upi://pay?… text from the QR code.");
    if (link.length > 2048) return problem("That link is longer than 2,048 characters; UPI links are much shorter.");
    const match = /^upi:\/\/(pay|mandate)\?([^#\s]*)$/i.exec(link);
    if (!match) {
      return problem(/^https?:\/\//i.test(link)
        ? "That is a web link, not a UPI payment link. UPI QR codes contain text that starts with upi://pay?."
        : "Not a UPI link: UPI payment QR codes contain text that starts with upi://pay?, followed by pa= (the payee's UPI ID).");
    }
    const kind = match[1].toLowerCase();
    let params: URLSearchParams;
    try {
      params = new URLSearchParams(match[2]);
    } catch {
      return problem("The link's parameters could not be decoded.");
    }

    const fields: Record<string, string> = {};
    for (const [key, value] of params) if (!(key in fields)) fields[key] = value.trim();
    const pa = fields.pa ?? "";
    const pn = fields.pn ?? "";
    const warnings: string[] = [];
    let valid = true;
    if (kind === "mandate") warnings.push("This is a UPI AutoPay mandate, not a one-time payment: approving it lets the payee debit the account again later. Approve only a subscription you set up yourself.");
    if (!pa) {
      valid = false;
      warnings.push("No payee UPI ID (pa=): no UPI app can pay this.");
    } else if (!isValidVpa(pa)) {
      valid = false;
      warnings.push(`"${clip(pa)}" is not a well-formed UPI ID (name@bank).`);
    }
    if (!pn) warnings.push("No payee name (pn=): the payer's app will show only the UPI ID.");
    let amountPaise: number | null = null;
    if (fields.am !== undefined && fields.am !== "") {
      amountPaise = /^\d{1,10}(\.\d{1,2})?$/.test(fields.am) ? rupeesToPaise(fields.am, Number.MAX_SAFE_INTEGER) : null;
      if (amountPaise === null || amountPaise === 0) {
        valid = false;
        warnings.push(`Amount "${clip(fields.am)}" is not a valid rupee amount (digits with at most two decimals, above zero); apps will reject it.`);
      }
    }
    if (fields.cu && fields.cu.toUpperCase() !== "INR") {
      valid = false;
      warnings.push(`Currency is ${clip(fields.cu, 8)}; UPI pays only in INR.`);
    }
    if (fields.url) warnings.push("Carries a reference URL (url=). Don't open links from a payment QR you don't trust.");
    for (const key of Object.keys(fields)) {
      if (!(key in UPI_PARAMS)) {
        warnings.push(`Unrecognised parameter "${clip(key, 20)}"; UPI apps ignore or reject unknown parameters.`);
        break;
      }
    }

    const lines = [
      kind === "mandate" ? `UPI AutoPay mandate for ${pn || "an unnamed payee"}${pa ? ` (${pa})` : ""}.` : `This link pays ${pn || "an unnamed payee"}${pa ? ` at ${pa}` : ""}.`,
      ...Object.entries(fields).map(([key, value]) => {
        const label = UPI_PARAMS[key] ?? `Other (${clip(key, 20)})`;
        const shown = key === "am" && amountPaise ? `${formatInr(amountPaise)} (fixed)` : key === "sign" ? `${clip(value, 16)} (signed by a bank or gateway)` : clip(value, 120);
        return `- ${label}: ${shown}`;
      }),
      ...(fields.am === undefined ? ["- Amount: not set, so the payer types it"] : []),
      "",
      valid && warnings.length === 0 ? "Checks: well-formed; any UPI app can read it." : `Checks: ${valid ? "readable, with notes" : "has problems"}:`,
      ...warnings.map((w) => `- ${w}`),
      "",
      "Before paying: check that the name your UPI app shows is who you mean to pay. You never need to enter your UPI PIN to receive money.",
      ...(valid && kind === "pay" ? [`Open this payment in the Pro UPI QR generator: ${posterUrl(link)}`] : []),
    ];
    return done(lines.join("\n"), { kind, valid, fields, amount_paise: amountPaise, warnings });
  },
};

/* ---------- UPI error codes ---------- */

export function findErrorCode(query: string): UpiErrorCode | undefined {
  const q = query.trim();
  const lower = q.toLowerCase().replace(/^(upi\s*)?(error|code|reason)\s*(code)?\s*[:#-]?\s*/, "");
  const exact = UPI_ERROR_CODES.find((item) => item.code.toLowerCase() === lower);
  if (exact) return exact;
  const token = (item: UpiErrorCode) => new RegExp(`(^|[^A-Za-z0-9])${item.code}([^A-Za-z0-9]|$)`).test(q);
  return UPI_ERROR_CODES.find((item) => /\d/.test(item.code) && token(item))
    ?? UPI_ERROR_CODES.find((item) => item.aliases.some((alias) => alias.length > 3 && q.toLowerCase().includes(alias.toLowerCase())))
    ?? UPI_ERROR_CODES.find((item) => !/\d/.test(item.code) && token(item));
}

const explainError: McpTool = {
  name: "explain_upi_error",
  title: "Explain a UPI error code",
  description:
    `Explain a failed UPI payment from its error code or message (e.g. U30, ZM, XH, Z9, U16, or "debit has been failed"): what it means, which side caused it, whether money was debited and when it comes back, and what the payer or merchant should do next. Covers ${UPI_ERROR_CODES.length} common NPCI and bank codes.`,
  inputSchema: {
    type: "object",
    properties: { code: { type: "string", description: "The code the UPI app or bank shows (e.g. U30), or words from the error message." } },
    required: ["code"],
  },
  run(args) {
    const query = str(args.code);
    if (!query) return problem("code is required, e.g. U30.");
    const item = findErrorCode(query.slice(0, 200));
    if (!item) {
      return problem(`No UPI error code matches "${clip(query)}". Common ones: U30, U16, U28, ZM, Z9, XH, U09, U90. Ask for the exact code the app shows, or browse all of them at ${siteLink(`/upi-error-codes/`)}.`);
    }
    return done(
      [
        `${item.code}: ${item.title}`,
        `What it means: ${item.cause}`,
        `Where it failed: ${ORIGIN_LABEL[item.origin]} (${CATEGORY_LABEL[item.category]})`,
        `Money: ${DEBIT_LABEL[item.debitStatus]}. ${item.refundTime}`,
        `What to do: ${item.actionStep}`,
        `For merchants: ${item.merchantNote}`,
        `Details: ${siteLink(`/upi-error-codes/#${item.code.toLowerCase()}`)}`,
      ].join("\n"),
      { code: item.code, title: item.title, origin: item.origin, category: item.category, debit_status: item.debitStatus, refund_time: item.refundTime, url: `${siteLink(`/upi-error-codes/#${item.code.toLowerCase()}`)}` },
    );
  },
};

/* ---------- GST ---------- */

const calculateGst: McpTool = {
  name: "calculate_gst",
  title: "Calculate GST",
  description:
    "Calculate Indian GST on an amount, exact to the paisa: add GST to a price before tax, or take it out of a GST-inclusive price, split into CGST + SGST (sale within a state) or IGST (between states).",
  inputSchema: {
    type: "object",
    properties: {
      amount: { type: ["number", "string"], description: "Amount in rupees, e.g. 1000 or \"2499.50\"." },
      rate_percent: { type: ["number", "string"], description: "GST rate in percent, e.g. 5, 18 or 40." },
      price_includes_gst: { type: "boolean", description: "true if the amount already includes GST (default false: GST is added on top)." },
      supply: { type: "string", enum: ["intra_state", "inter_state"], description: "intra_state (CGST + SGST, the default) or inter_state (IGST)." },
    },
    required: ["amount", "rate_percent"],
  },
  run(args) {
    const amount = rupeesToPaise(args.amount, MAX_CALC_PAISE);
    if (amount === null || amount === 0) return problem("amount must be rupees above zero with at most two decimals, e.g. 1000 or 2499.50.");
    const rateText = str(args.rate_percent).replace(/%$/, "").trim();
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(rateText) || Number(rateText) > 100) return problem("rate_percent must be a GST rate such as 5, 18 or 40 (at most two decimals).");
    const bps = Math.round(Number(rateText) * 100);
    const inclusive = args.price_includes_gst === true || args.price_includes_gst === "true";
    const supply = args.supply === undefined || args.supply === "intra_state" || args.supply === "intra" ? "intra" : args.supply === "inter_state" || args.supply === "inter" ? "inter" : null;
    if (!supply) return problem('supply must be "intra_state" (CGST + SGST) or "inter_state" (IGST).');
    const line = gstLine(amount, bps, inclusive ? "inclusive" : "exclusive", supply);
    const rate = percentLabel(bps);
    const half = percentLabel(bps / 2);
    return done(
      [
        `${formatInr(amount)} ${inclusive ? "including" : "plus"} ${rate} GST, ${supply === "intra" ? "within a state" : "between states"}:`,
        `- Taxable value: ${formatInr(line.basePaise)}`,
        ...(supply === "intra"
          ? [`- CGST ${half}: ${formatInr(line.cgstPaise)}`, `- SGST ${half}: ${formatInr(line.sgstPaise)}`]
          : [`- IGST ${rate}: ${formatInr(line.igstPaise)}`]),
        `- Total GST: ${formatInr(line.gstPaise)}`,
        `- Total: ${formatInr(line.totalPaise)}`,
        `GST invoice with a UPI QR: ${siteLink(`/invoice-generator/`)} · Calculator: ${siteLink(`/gst-calculator/`)}`,
      ].join("\n"),
      { taxable_paise: line.basePaise, cgst_paise: line.cgstPaise, sgst_paise: line.sgstPaise, igst_paise: line.igstPaise, gst_paise: line.gstPaise, total_paise: line.totalPaise, rate_percent: Number(rateText) },
    );
  },
};

/* ---------- MSMED Act interest ---------- */

function msmedTool(today: () => string): McpTool {
  return {
    name: "calculate_msmed_interest",
    title: "Calculate MSMED late-payment interest",
    description:
      `Calculate the interest a buyer owes a micro or small enterprise (Udyam-registered supplier) for paying late, under Section 16 of India's MSMED Act: three times the RBI Bank Rate (${MSMED_INTEREST_PCT}% a year as of ${RBI_BANK_RATE.label}), compounded monthly, from the day after the payment deadline (the agreed credit period, at most 45 days). Exact to the paisa.`,
    inputSchema: {
      type: "object",
      properties: {
        amount: { type: ["number", "string"], description: "Unpaid invoice amount in rupees." },
        invoice_date: { type: "string", description: "Date the goods or services were accepted, YYYY-MM-DD (use the invoice date if unsure)." },
        credit_days: { type: "integer", minimum: 0, description: "Agreed credit period in days (default 45; the Act caps it at 45)." },
        paid_on: { type: "string", description: "Payment date, YYYY-MM-DD. Leave out to count up to today." },
      },
      required: ["amount", "invoice_date"],
    },
    run(args) {
      const amount = rupeesToPaise(args.amount, MAX_CALC_PAISE);
      if (amount === null || amount === 0) return problem("amount must be rupees above zero with at most two decimals.");
      const invoiceDate = str(args.invoice_date);
      if (!isoDate(invoiceDate)) return problem("invoice_date must be a date written YYYY-MM-DD, e.g. 2026-04-01.");
      const creditDays = args.credit_days === undefined ? MSME_MAX_CREDIT_DAYS : Number(args.credit_days);
      if (!Number.isInteger(creditDays) || creditDays < 0 || creditDays > 3650) return problem("credit_days must be a whole number of days, e.g. 30.");
      const end = str(args.paid_on) || today();
      if (!isoDate(end)) return problem("paid_on must be a date written YYYY-MM-DD.");
      if (daysBetween(invoiceDate, end) < 0) return problem("paid_on is before invoice_date.");

      const allowed = Math.min(creditDays, MSME_MAX_CREDIT_DAYS);
      const deadline = addDays(invoiceDate, allowed);
      const lateDays = Math.max(0, daysBetween(deadline, end));
      const interest = msmeInterestPaise(amount, deadline, end, MSMED_INTEREST_PCT);
      const rateLine = `${MSMED_INTEREST_PCT}% a year (3 × the RBI Bank Rate of ${RBI_BANK_RATE.pct}% as of ${RBI_BANK_RATE.label}), compounded monthly`;
      const lines = [
        `Payment deadline: ${deadline} (${allowed} days after ${invoiceDate}${creditDays > MSME_MAX_CREDIT_DAYS ? `; the Act caps the agreed ${creditDays} days at 45` : ""}).`,
        lateDays === 0
          ? `${str(args.paid_on) ? `Paid ${end}` : `As of ${end}`}: not late, so no interest is due.`
          : `${str(args.paid_on) ? `Paid ${end}` : `As of ${end}`}: ${lateDays} days late.`,
        ...(lateDays > 0
          ? [`Interest: ${formatInr(interest)} at ${rateLine}.`, `Total due: ${formatInr(amount + interest)} (${formatInr(amount)} + interest).`]
          : []),
        `Applies when the supplier is a micro or small enterprise registered on Udyam. Without a written agreement, the deadline is 15 days after acceptance. ${args.credit_days === undefined ? "No credit period was given, so 45 days was assumed." : ""}`.trim(),
        `Calculator and claim letter: ${siteLink(`/msmed-interest-calculator/`)} · Track MSME dues: ${siteLink(`/msme-receivables/`)}`,
      ];
      return done(lines.join("\n"), { deadline, days_late: lateDays, rate_percent: MSMED_INTEREST_PCT, interest_paise: interest, total_paise: amount + interest, rbi_bank_rate_as_of: RBI_BANK_RATE.asOf });
    },
  };
}

/* ---------- UPI MDR ---------- */

function mdrTool(today: () => string): McpTool {
  return {
    name: "calculate_upi_mdr",
    title: "Calculate UPI MDR",
    description:
      "Work out the UPI merchant discount rate (MDR) on a payment under the rules from 15 October 2026: 0.4% on person-to-merchant UPI payments above ₹2,000 (capped at ₹300), a flat ₹5 for essential-sector merchants and 0.02% for capital markets. Person-to-person payments, payments of ₹2,000 or less and small P2PM merchants (up to ₹1 lakh a month) pay nothing. Shows the 18% GST on the MDR and what the merchant keeps.",
    inputSchema: {
      type: "object",
      properties: {
        amount: { type: ["number", "string"], description: "One UPI payment, in rupees." },
        category: { type: "string", enum: ["standard", "essential", "capital", "p2p"], description: "standard merchant (default), essential sector, capital markets, or p2p (person to person)." },
        small_merchant: { type: "boolean", description: "true if the UPI ID is a small P2PM merchant (up to ₹1 lakh a month on UPI QR)." },
        gst_registered: { type: "boolean", description: "true if the merchant is GST-registered and can claim the GST on MDR as input tax credit." },
      },
      required: ["amount"],
    },
    run(args) {
      const amount = rupeesToPaise(args.amount, MAX_CALC_PAISE);
      if (amount === null || amount === 0) return problem("amount must be rupees above zero with at most two decimals.");
      const category = (args.category === undefined ? "standard" : String(args.category)) as UpiMdrCategory;
      if (!["standard", "essential", "capital", "p2p"].includes(category)) return problem('category must be "standard", "essential", "capital" or "p2p".');
      const small = args.small_merchant === true;
      const registered = args.gst_registered === true;
      const mdr = mdrOnTransaction(amount, category, { smallMerchantExempt: small });
      const { gstPaise, netPaise } = merchantNetPaise(amount, mdr, { gstRegistered: registered });
      const before = today() < UPI_MDR.effectiveOn;
      const why = category === "p2p" ? "person-to-person payments are free"
        : small ? "small P2PM merchants stay on zero MDR"
          : amount <= UPI_MDR.thresholdPaise ? "payments of ₹2,000 or less are free" : "";
      const lines = [
        `${formatInr(amount)} UPI payment${before ? " (rules start 15 October 2026; until then UPI payments to merchants carry no MDR)" : ""}:`,
        mdr === 0
          ? `- MDR: ₹0.00 (${why})`
          : `- MDR: ${formatInr(mdr)} (${mdrFormula(amount, category, mdr)})`,
        ...(mdr > 0
          ? [
              `- GST on MDR (18%): ${formatInr(gstPaise)}${registered ? ", usually claimable as input tax credit" : ""}`,
              `- Merchant keeps: ${formatInr(netPaise)}${registered ? " after the credit" : ""}`,
            ]
          : []),
        "MDR is not a tax, and merchants may not add it to the customer's bill.",
        `Calculator: ${siteLink(`/upi-mdr-calculator/`)} · Am I a P2PM small merchant? ${siteLink(`/blog/p2pm-small-merchant-upi-mdr/`)}`,
      ];
      return done(lines.join("\n"), { mdr_paise: mdr, gst_on_mdr_paise: mdr > 0 ? gstPaise : 0, merchant_keeps_paise: mdr > 0 ? netPaise : amount, effective_on: UPI_MDR.effectiveOn });
    },
  };
}

/* ---------- Amount in words ---------- */

export function rupeesInWords(paise: number): string {
  const rupees = Math.floor(paise / 100);
  const rest = paise % 100;
  if (rest === 0) return amountInWordsInr(rupees);
  const paiseWords = `${amountInWordsInr(rest).replace(/ Rupees Only$/, "")} Paise Only`;
  return rupees === 0 ? paiseWords : `${amountInWordsInr(rupees).replace(/ Only$/, "")} and ${paiseWords}`;
}

const amountInWords: McpTool = {
  name: "amount_in_words",
  title: "Rupee amount in words",
  description:
    "Write a rupee amount in words the Indian way (lakh and crore), as on invoices, receipts and cheques. For example 125050.50 → \"One Lakh Twenty Five Thousand Fifty Rupees and Fifty Paise Only\".",
  inputSchema: {
    type: "object",
    properties: { amount: { type: ["number", "string"], description: "Amount in rupees, up to ₹99,99,99,999.99." } },
    required: ["amount"],
  },
  run(args) {
    const paise = rupeesToPaise(args.amount, MAX_WORDS_PAISE);
    if (paise === null) return problem("amount must be rupees with at most two decimals, up to 99,99,99,999.99.");
    const words = rupeesInWords(paise);
    return done(`${formatInr(paise)}: ${words}`, { amount_paise: paise, words });
  },
};

/* ---------- Find a free tool ---------- */

const STOP = new Set(["a", "an", "the", "for", "of", "to", "in", "on", "and", "or", "my", "me", "i", "with", "how", "make", "create", "generate", "free", "online", "tool", "need", "want", "do", "can", "is", "it"]);
const words = (text: string) => text.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 1 && !STOP.has(word));

export function searchCatalog(catalog: CatalogEntry[], query: string, limit: number): CatalogEntry[] {
  const terms = words(query);
  if (!terms.length) return [];
  const scored = catalog.map((entry, index) => {
    const name = words(entry.name);
    const rest = words(`${entry.description} ${entry.topic}`);
    let score = 0;
    for (const term of terms) {
      const stem = term.replace(/s$/, "");
      if (name.some((w) => w === term || w.replace(/s$/, "") === stem)) score += 3;
      else if (name.some((w) => w.startsWith(stem))) score += 2;
      if (rest.some((w) => w === term || w.replace(/s$/, "") === stem)) score += 1;
    }
    return { entry, score, index };
  });
  return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, limit).map((s) => s.entry);
}

function findToolsTool(catalog: CatalogEntry[]): McpTool {
  return {
    name: "find_merchant_tools",
    title: "Find a free Pro UPI QR tool",
    description:
      "Find the free Pro UPI QR tool for a task: invoices, receipts, rent receipts, salary slips, quotations, GST and MSME tools, UPI QR posters and stickers, calculators and guides. Returns matching tools with links; they run in the browser with no signup.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What the user wants to make or do, e.g. \"rent receipt for HRA\" or \"restaurant table QR\"." },
        limit: { type: "integer", minimum: 1, maximum: 10, description: "How many tools to return (default 5)." },
      },
      required: ["query"],
    },
    run(args) {
      const query = str(args.query).slice(0, 200);
      if (!query) return problem("query is required, e.g. \"rent receipt\".");
      const limit = args.limit === undefined ? 5 : Math.min(10, Math.max(1, Math.floor(Number(args.limit)) || 5));
      const found = searchCatalog(catalog, query, limit);
      if (!found.length) return done(`No tool matched "${clip(query)}". All free tools: ${siteLink(`/tools/`)}`, { tools: [] });
      return done(
        [`Free tools for "${clip(query)}":`, ...found.map((t) => `- ${t.name}: ${t.description} ${siteLink(t.href)}`), `Everything else: ${siteLink(`/tools/`)}`].join("\n"),
        { tools: found.map((t) => ({ name: t.name, url: `${siteLink(t.href)}`, description: t.description })) },
      );
    },
  };
}

export const SERVER_INSTRUCTIONS =
  "Pro UPI QR (proupiqr.in) tools for payments in India. Build UPI payment links and QR codes, read and check upi:// links, explain UPI error codes, calculate GST, MSMED Act late-payment interest and UPI MDR, write rupee amounts in words, and find the free browser tool for a task (invoices, receipts, posters). Amounts are Indian rupees and exact to the paisa. All tools are read-only and free; nothing sent to them is stored. Links to proupiqr.in open the matching free tool, where people can download printable posters, invoices and receipts. " + NO_MONEY_MOVES;

export function proUpiQrServer(options: { catalog: CatalogEntry[]; today?: () => string }): McpServer {
  const today = options.today ?? (() => indiaToday());
  return {
    name: "proupiqr",
    title: "Pro UPI QR",
    version: MCP_SERVER_VERSION,
    websiteUrl: `${SITE}/`,
    iconUrl: `${SITE}/icons/icon-192.png`,
    instructions: SERVER_INSTRUCTIONS,
    tools: [createPaymentLink, generateQr, readUpiLink, explainError, calculateGst, msmedTool(today), mdrTool(today), amountInWords, findToolsTool(options.catalog)],
  };
}
