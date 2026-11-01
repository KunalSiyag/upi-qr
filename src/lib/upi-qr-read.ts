/**
 * UPI QR reader: turns the text inside a QR code into labelled fields, plain notes (info) and checks (warn).
 *
 * It only reads text. It never opens a link, never contacts a server and never says a payee is genuine,
 * because nothing written in a QR can show that. Parameter names and the signature, amount and "%20 for a
 * space" rules come from the NPCI UPI Linking Specifications v1.6, a DRAFT dated November 2017; apps in use
 * today may differ, so a missing or extra parameter is a note, never an error. EMV payment codes (they start
 * 000201) are read as tag-length-value text (a length counts characters, as in EMVCo's own worked example) and
 * checked with the CRC the EMV QR Code Specification defines: CRC-16/CCITT-FALSE, polynomial 0x1021, start value
 * 0xFFFF, run over the UTF-8 bytes of the text.
 *
 * Money is a digit string of paise taken from the text; nothing here multiplies an amount.
 * Imports nothing, so `node --experimental-strip-types scripts/upi-qr-read.test.mjs` can run it.
 */

/** Shown on the page as "Last reviewed"; change it with the sources below. */
export const UPI_QR_REVIEWED_ON = "2026-11-01";

export const UPI_QR_SOURCES: { label: string; href: string }[] = [
  {
    label: "NPCI, UPI Linking Specifications 1.6 (draft, November 2017): parameter names, amount, signature and %20 rules. A third-party copy of a 2017 draft, so apps in use today may differ.",
    href: "https://www.labnol.org/files/linking.pdf",
  },
  {
    label: "EMVCo, EMV QR Code Specification for Payment Systems, Merchant-Presented Mode, v1.1 (27 November 2020): the standard behind codes that start 000201.",
    href: "https://www.emvco.com/emv-technologies/qr-codes/",
  },
  {
    label: "Hong Kong Monetary Authority, Common QR Code Specification for Retail Payments in Hong Kong, version 1.0 (December 2017): restates the EMV data objects, the point-of-initiation values and the CRC rule.",
    href: "https://www.hkma.gov.hk/media/chi/doc/key-functions/financial-infrastructure/infrastructure/retail-payment-initiatives/Common_QR_Code_Specification.pdf",
  },
  {
    label: "Banco Central do Brasil, Manual do BR Code, version 2.0.1 (31 August 2020): the EMV tag layout and a full published payload with its CRC, which this reader's tests reproduce.",
    href: "https://www.bcb.gov.br/content/estabilidadefinanceira/spb_docs/ManualBRCode.pdf",
  },
  {
    label: "CRC RevEng catalogue, CRC-16/IBM-3740 (also called CRC-16/CCITT-FALSE): check value 0x29B1 over the text 123456789.",
    href: "https://reveng.sourceforge.io/crc-catalogue/16.htm",
  },
  {
    label: "Reserve Bank of India, press release 2021-2022/1630 (28 January 2022), Consumer Awareness - Cyber Threats and Frauds: transactions that receive money do not need a QR scan or an MPIN.",
    href: "https://rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx?prid=53185",
  },
  {
    label: "FBI Internet Crime Complaint Center, alert I-011822-PSA (18 January 2022), Cybercriminals Tampering with QR Codes to Steal Victim Funds: a physical QR code can be replaced, for example by a sticker placed on top of the original.",
    href: "https://www.ic3.gov/PSA/2022/PSA220118",
  },
  {
    label: "MDN, MediaDevices.getUserMedia(): the camera needs a secure (https) page, the visitor's permission, and a Permissions Policy that allows it.",
    href: "https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia",
  },
];

/** A guard, not a rule about QR codes: UPI and EMV payloads are a few hundred characters. */
export const MAX_QR_TEXT = 4000;
const MAX_RAW_SHOWN = 2000;
const LONG_VALUE = 100;

export type PayloadKind = "upi-pay" | "upi-mandate" | "url" | "emv" | "other";
export type FlagLevel = "info" | "warn";

export const KIND_LABELS: Record<PayloadKind, string> = {
  "upi-pay": "UPI payment link (upi://pay)",
  "upi-mandate": "UPI AutoPay mandate (upi://mandate)",
  url: "Web address",
  emv: "Bharat QR / EMV payment code, not a upi:// link",
  other: "Other QR text",
};

export const FIELD_LABELS = {
  pa: "UPI ID",
  pn: "Payee name in the QR",
  am: "Amount in the QR",
  mam: "Minimum amount",
  cu: "Currency in the QR",
  tn: "Payment note",
  tr: "Transaction reference",
  tid: "Transaction ID",
  mc: "Merchant category code",
  mid: "Merchant ID",
  msid: "Store ID",
  mtid: "Terminal ID",
  url: "Web address (url)",
  mode: "Initiation mode",
  sign: "Signature",
  orgid: "Organisation ID",
  purpose: "Purpose code",
  other: "Other parameter",
  repeated: "Repeated parameter",
  site: "Site name",
  address: "Full web address",
  text: "Text",
  merchantName: "Merchant name",
  merchantCity: "Merchant city",
  currencyCode: "Currency code",
  country: "Country code",
  merchantAccount: "Merchant account",
  additional: "Additional data",
  checksum: "Checksum (CRC)",
  otherTag: "Other tag",
} as const;

/**
 * Every note and check, as an English sentence with {placeholders}. The page translates the template and
 * fills the arguments, so the arguments are always data (names, values, amounts), never words.
 */
export const FLAG_TEMPLATES = {
  // UPI payment links and AutoPay links
  "name-unverified": "A name written inside a QR is not checked by anyone, so it can say anything. Compare it with the payee name your UPI app shows before you pay.",
  "pa-missing": "No UPI ID (pa) in the link. The NPCI draft lists it as required, so a UPI app may refuse this QR.",
  "pa-format": "The UPI ID in the QR is not written like name@handle: exactly one @, something on both sides of it, no spaces, and only letters, digits, dot, hyphen and underscore. Check the ID your UPI app shows.",
  "pn-missing": "No payee name (pn) in the link. The NPCI draft lists it as required. Check the name your UPI app shows before you pay.",
  "amount-fixed": "The QR sets the amount to {amount}. Per the NPCI draft, your app should not let you change it.",
  "amount-minimum": "The QR sets the amount to {amount} with a minimum of {minimum}. Your app may let you change the amount, but not below the minimum.",
  "amount-none": "No amount in the QR, so you type the amount in your UPI app. Check it before you enter your PIN.",
  "amount-bad": "The amount \"{value}\" is not a normal rupee amount (digits with at most two decimals, above zero). A UPI app may refuse it.",
  "currency": "The currency is {currency}. The NPCI draft says UPI supports only INR.",
  "unsigned": "The link names a mode but has no digital signature (sign). Per the NPCI draft, a UPI app should warn that the source of an unsigned link could not be confirmed.",
  "signed": "The link carries a digital signature (sign). This page cannot check it; per the NPCI draft, the payer's UPI app does.",
  "unknown-params": "Other parameters in the link: {names}. They are not in the NPCI draft, so apps may ignore them.",
  "duplicate-params": "These appear more than once: {names}. An app may use a different copy from the first one shown here, so pay only if your UPI app shows the payee and amount you expect.",
  "long-values": "Very long text in: {names}. Long text can push the start of a name or note out of sight.",
  "hidden-chars": "Some text has hidden or direction-changing characters, shown here as <U+…>. Pay only if your UPI app shows the payee you expect.",
  "url-param": "The link carries a web address (url). This page shows it as text and does not open it. Do not open links from a QR you do not know.",
  "plus-spaces": "This link writes spaces as +. Many apps read that as a space, but the NPCI draft asks for %20, so a few may show the names differently. This page shows + as a space.",
  "fragment-ignored": "The text after # in this link (\"{text}\") is not one of its parameters, so this page did not read it. An app may treat it differently, so pay only if your UPI app shows the payee and amount you expect.",
  "mandate": "This is a UPI AutoPay mandate, not a one-time payment. If you approve it, the payee can take money from your account again later. Approve only a subscription you set up yourself.",
  "other-action": "This is a UPI link of type \"{action}\", which this page does not read. It may not be a one-time payment. Do not approve it in your UPI app unless you know exactly what it does.",
  // Web addresses
  "url-userinfo": "The text before the @ (\"{user}\") is a username, not the site. The site is {host}.",
  "url-http": "This address starts with http, not https, so the connection is not encrypted.",
  "url-not-payment": "This QR holds a web address, not a UPI payment. This page shows it as text and does not open it. Never share your UPI PIN, OTP or card details on a website you opened from a QR.",
  // EMV payment codes
  "emv-not-upi": "This is an EMV payment code (it starts with 000201), not a upi:// link. This page only reads its text. Pay such a code only in a payment app or bank app you use.",
  "crc-ok": "The built-in checksum (CRC) matches the text. That only shows the text was not damaged; it does not show who owns the merchant account.",
  "crc-bad": "The built-in checksum (CRC) does not match the text. The code may be damaged or its text may have been changed.",
  "crc-missing": "The checksum (tag 63) is missing or not at the end, so the code cannot be checked for damage.",
  "emv-truncated": "The code's structure could not be read to the end, or there is extra text after the checksum. The fields below are only what could be read.",
  // Anything else
  "other-scheme": "This QR holds a link of type {scheme}, not a UPI payment. This page does not open it.",
  "other-text": "This text is not a UPI payment link. A UPI payment QR starts with upi://pay.",
  "bare-id": "This looks like a UPI ID on its own, not a payment link. Paste the whole text of the QR (it starts with upi://pay) to see the payee name and amount.",
  "too-long": "This text is longer than the {limit} characters this page reads, so it was not read.",
  "empty": "Nothing to read: the text is empty.",
  "read-error": "This text could not be read.",
} as const;

export type FlagCode = keyof typeof FLAG_TEMPLATES;

export interface ReadField {
  /** Stable name: the UPI parameter (pa, pn, am...) or an EMV/URL field name. */
  key: string;
  /** English label; the page translates it. */
  label: string;
  /** The value as text. Empty means the QR does not carry it. Hidden characters are made visible. */
  value: string;
}

export interface ReadFlag {
  level: FlagLevel;
  code: FlagCode;
  /** The English sentence with its arguments filled in. */
  text: string;
  args: Record<string, string>;
}

export interface ReadResult {
  kind: PayloadKind;
  kindLabel: string;
  fields: ReadField[];
  flags: ReadFlag[];
  /** Integer paise as a digit string, read from the text; null when there is no amount or it is not a normal one. */
  amountPaise: string | null;
  /** The UPI ID (pa) of a upi:// link, for comparing with an ID the visitor expects; null otherwise. */
  payeeId: string | null;
  /** Every pa in the link, in order. More than one different value means the QR cannot be compared with a single ID. */
  payeeIds: string[];
  /** The text that was read, with control characters made visible, cut to 2,000 characters. */
  raw: string;
}

export function fillTemplate(template: string, args: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => args[name] ?? "");
}

/* ---------- small helpers ---------- */

// Controls, soft hyphen, zero-width and direction marks and overrides, BOM and the specials block.
const HIDDEN_CHARS = /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u200b-\u200f\u2028\u2029\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff\ufff9-\ufffb]/g;
const KEEP_WHITESPACE = /[\t\n\r]/;

function codeLabel(char: string): string {
  const code = (char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0");
  return `<U+${code}>`;
}

/** Makes hidden characters visible as <U+XXXX>; `keepLines` leaves tabs and line breaks (for the raw text). */
function visibleText(text: string, keepLines: boolean): { text: string; changed: boolean } {
  let changed = false;
  const out = text.replace(HIDDEN_CHARS, (char) => {
    if (keepLines && KEEP_WHITESPACE.test(char)) return char;
    changed = true;
    return codeLabel(char);
  });
  return { text: out, changed };
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Rupees written as text ("10", "10.5", "0.05") to paise as a digit string ("1000", "1050", "5"). No arithmetic. */
export function rupeesToPaise(text: string): string | null {
  const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(text);
  if (match === null) return null;
  return `${match[1]}${(match[2] ?? "").padEnd(2, "0")}`.replace(/^0+(?=\d)/, "");
}

/** Paise as a digit string to "₹1,00,000.00" (Indian digit grouping). */
export function formatPaise(paise: string): string {
  const digits = paise.replace(/^0+(?=\d)/, "").padStart(3, "0");
  const rupees = digits.slice(0, -2);
  const last3 = rupees.slice(-3);
  const rest = rupees.slice(0, -3);
  const grouped = rest === "" ? last3 : `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}`;
  return `₹${grouped}.${digits.slice(-2)}`;
}

/** The "ID I expected" check: same text once trimmed, ignoring ASCII case (no Unicode case folding: U+212A would fold to k). Only IDs written like name@handle can match. */
export function sameUpiId(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const lower = (text: string): string => text.trim().replace(/[A-Z]/g, (letter) => String.fromCharCode(letter.charCodeAt(0) + 32));
  const left = lower(a);
  return left !== "" && left === lower(b) && upiIdWellFormed(left);
}

/** Whether a UPI ID is written like name@handle. The NPCI draft gives no character rules, so this stays plain. */
function upiIdWellFormed(id: string): boolean {
  return /^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+$/.test(id);
}

/** CRC-16/CCITT-FALSE over bytes: polynomial 0x1021, start value 0xFFFF, no reflection, no final XOR. */
export function crc16ccitt(bytes: ArrayLike<number>): number {
  let crc = 0xffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= (bytes[i] & 0xff) << 8;
    for (let bit = 0; bit < 8; bit++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

function hex4(value: number): string {
  return value.toString(16).toUpperCase().padStart(4, "0");
}

class Notes {
  flags: ReadFlag[] = [];
  add(level: FlagLevel, code: FlagCode, args: Record<string, string> = {}): void {
    this.flags.push({ level, code, text: fillTemplate(FLAG_TEMPLATES[code], args), args });
  }
}

function build(kind: PayloadKind, raw: string, fields: ReadField[], notes: Notes, extra: Partial<Pick<ReadResult, "amountPaise" | "payeeId" | "payeeIds">> = {}): ReadResult {
  return {
    kind,
    kindLabel: KIND_LABELS[kind],
    fields,
    flags: notes.flags,
    amountPaise: extra.amountPaise ?? null,
    payeeId: extra.payeeId ?? null,
    payeeIds: extra.payeeIds ?? [],
    raw,
  };
}

/* ---------- upi://pay and upi://mandate ---------- */

function decodeValue(raw: string): { text: string; plus: boolean } {
  const plus = raw.includes("+");
  const text = raw.replace(/\+/g, " ").replace(/(?:%[0-9A-Fa-f]{2})+/g, (run) => {
    try {
      return decodeURIComponent(run);
    } catch {
      return run; // not valid UTF-8: keep what was written
    }
  });
  return { text, plus };
}

const UPI_PARAM_ORDER = ["pa", "pn", "am", "mam", "cu", "tn", "tr", "tid", "mc", "mid", "msid", "mtid", "url", "mode", "sign", "orgid", "purpose"] as const;
type UpiParam = (typeof UPI_PARAM_ORDER)[number];
const KNOWN_PARAMS = new Set<string>(UPI_PARAM_ORDER);

function nameList(names: string[]): string {
  const shown = names.slice(0, 6).map((name) => clip(visibleText(name, false).text, 24));
  return names.length > 6 ? `${shown.join(", ")} …` : shown.join(", ");
}

function readUpiLink(raw: string, action: string, query: string, fragment: string): ReadResult {
  const mandate = action === "mandate";
  const notes = new Notes();
  const values = new Map<string, { shown: string; decoded: string }[]>();
  let plusSeen = false;
  let hiddenSeen = false;

  for (const part of query.split("&")) {
    if (part === "") continue;
    const eq = part.indexOf("=");
    const key = decodeValue(eq === -1 ? part : part.slice(0, eq)).text.trim();
    if (key === "") continue;
    hiddenSeen = hiddenSeen || visibleText(key, false).changed;
    const decoded = decodeValue(eq === -1 ? "" : part.slice(eq + 1));
    plusSeen = plusSeen || decoded.plus;
    const shown = visibleText(decoded.text.trim(), false);
    hiddenSeen = hiddenSeen || shown.changed;
    const list = values.get(key) ?? [];
    list.push({ shown: shown.text, decoded: decoded.text });
    values.set(key, list);
  }

  const first = (key: string): string => values.get(key)?.[0]?.shown ?? "";
  const has = (key: string): boolean => first(key) !== "";

  // Who is paid
  const pa = first("pa");
  if (pa === "") notes.add("warn", "pa-missing");
  else if (!upiIdWellFormed(values.get("pa")?.[0]?.decoded ?? pa)) notes.add("warn", "pa-format");
  if (first("pn") === "" && fragment === "") notes.add("warn", "pn-missing");
  notes.add("info", "name-unverified");

  // How much
  const am = first("am");
  let amountPaise: string | null = null;
  const mam = first("mam");
  const minimumGiven = mam !== "" && mam.toLowerCase() !== "null";
  let amountText = am;
  if (am !== "") {
    const paise = rupeesToPaise(am);
    if (paise === null || paise === "0") {
      notes.add("warn", "amount-bad", { value: clip(am, 40) });
    } else {
      amountPaise = paise;
      amountText = formatPaise(paise);
      if (!mandate) {
        const minimumPaise = minimumGiven ? rupeesToPaise(mam) : null;
        if (minimumPaise !== null) notes.add("info", "amount-minimum", { amount: amountText, minimum: formatPaise(minimumPaise) });
        else notes.add("info", "amount-fixed", { amount: amountText });
      }
    }
  } else if (!mandate && fragment === "") {
    notes.add("info", "amount-none");
  }
  if (fragment !== "") notes.add("warn", "fragment-ignored", { text: clip(visibleText(fragment, false).text, 40) });
  const currency = first("cu");
  if (currency !== "" && currency.toUpperCase() !== "INR") notes.add("warn", "currency", { currency: clip(currency, 12) });

  // Signature and other parameters
  if (has("sign")) notes.add("info", "signed");
  else if (has("mode")) notes.add("info", "unsigned");
  if (has("url")) notes.add("info", "url-param");

  const unknown = [...values.keys()].filter((key) => !KNOWN_PARAMS.has(key));
  if (unknown.length > 0 && !mandate) notes.add("info", "unknown-params", { names: nameList(unknown) });
  const repeated = [...values.entries()].filter(([, list]) => list.length > 1).map(([key]) => key);
  if (repeated.length > 0) notes.add("warn", "duplicate-params", { names: nameList(repeated) });
  const longNames = [...values.entries()]
    .filter(([key, list]) => key !== "url" && key !== "sign" && list.some((item) => item.shown.length > LONG_VALUE))
    .map(([key]) => key);
  if (longNames.length > 0) notes.add("info", "long-values", { names: nameList(longNames) });
  if (hiddenSeen) notes.add("warn", "hidden-chars");
  if (plusSeen) notes.add("info", "plus-spaces");

  if (mandate) notes.add("warn", "mandate");

  // Fields: the three that matter first (always listed), then whatever else the QR carries.
  const fields: ReadField[] = [];
  const display = (key: UpiParam): string => {
    if (key === "am") return amountText;
    if (key === "mam") {
      const minimumPaise = minimumGiven ? rupeesToPaise(mam) : null;
      return minimumPaise === null ? (minimumGiven ? mam : "") : formatPaise(minimumPaise);
    }
    if (key === "sign") return first(key) === "" ? "" : clip(first(key), 24);
    return first(key);
  };
  for (const key of UPI_PARAM_ORDER) {
    const value = display(key);
    if (value === "" && key !== "pa" && key !== "pn" && key !== "am") continue;
    if (key === "mam" && !minimumGiven) continue;
    fields.push({ key, label: FIELD_LABELS[key], value });
  }
  for (const [name, list] of values) {
    const key = clip(visibleText(name, false).text, 24);
    if (KNOWN_PARAMS.has(name)) {
      for (const item of list.slice(1)) fields.push({ key, label: FIELD_LABELS.repeated, value: clip(item.shown, 200) });
    } else {
      list.forEach((item, index) => fields.push({ key, label: index === 0 ? FIELD_LABELS.other : FIELD_LABELS.repeated, value: clip(item.shown, 200) }));
    }
  }

  return build(mandate ? "upi-mandate" : "upi-pay", raw, fields, notes, { amountPaise, payeeId: pa === "" ? null : pa, payeeIds: (values.get("pa") ?? []).map((item) => item.decoded.trim()).filter((id) => id !== "") });
}

/* ---------- web addresses ---------- */

function readWebAddress(text: string, raw: string): ReadResult {
  const notes = new Notes();
  const fields: ReadField[] = [];
  let parsed: URL | null = null;
  try {
    parsed = new URL(text);
  } catch {
    parsed = null;
  }
  if (parsed !== null) {
    const host = parsed.port === "" ? parsed.hostname : `${parsed.hostname}:${parsed.port}`;
    fields.push({ key: "site", label: FIELD_LABELS.site, value: visibleText(host, false).text });
    if (parsed.username !== "" || parsed.password !== "") {
      const user = parsed.password === "" ? parsed.username : `${parsed.username}:${parsed.password}`;
      notes.add("warn", "url-userinfo", { user: clip(user, 60), host: parsed.hostname });
    }
    if (parsed.protocol === "http:") notes.add("info", "url-http");
  }
  fields.push({ key: "address", label: FIELD_LABELS.address, value: clip(visibleText(text, false).text, 500) });
  notes.add("info", "url-not-payment");
  return build("url", raw, fields, notes);
}

/* ---------- EMV payment codes (Bharat QR and similar) ---------- */

interface Tlv {
  id: string;
  /** The value as text. */
  value: string;
  /** Index of the tag id among the units the code was cut into. */
  at: number;
}

/**
 * The code cut into the units a length counts. EMVCo's own worked example counts characters (its Chinese merchant
 * name has length 04 for four characters) while its CRC runs over the UTF-8 bytes of the text, so characters are the
 * first reading. Some encoders count UTF-8 bytes instead; that reading is the fallback. For plain ASCII both agree.
 */
interface Units {
  list: string[];
  text(from: number, to: number): string;
  /** The UTF-8 bytes of everything before unit `to`. */
  bytes(to: number): Uint8Array;
}

function characterUnits(text: string): Units {
  const list = Array.from(text);
  return {
    list,
    text: (from, to) => list.slice(from, to).join(""),
    bytes: (to) => new TextEncoder().encode(list.slice(0, to).join("")),
  };
}

function byteUnits(text: string): Units {
  const raw = new TextEncoder().encode(text);
  return {
    list: Array.from(raw, (byte) => String.fromCharCode(byte)),
    text: (from, to) => new TextDecoder().decode(raw.slice(from, to)),
    bytes: (to) => raw.slice(0, to),
  };
}

/** Walks id (2 digits), length (2 digits), value. `complete` is false when the text stops making sense. */
function walkTlv(units: Units): { items: Tlv[]; complete: boolean } {
  const items: Tlv[] = [];
  const { list } = units;
  let at = 0;
  while (at < list.length) {
    const id = list.slice(at, at + 2).join("");
    const lengthText = list.slice(at + 2, at + 4).join("");
    if (!/^\d{2}$/.test(id) || !/^\d{2}$/.test(lengthText)) return { items, complete: false };
    const length = Number(lengthText);
    if (at + 4 + length > list.length) return { items, complete: false };
    items.push({ id, value: units.text(at + 4, at + 4 + length), at });
    at += 4 + length;
  }
  return { items, complete: true };
}

/** Tag 63: four hex digits, last in the code, computed over everything before its value (its id and length included). */
function checkCrc(units: Units, items: Tlv[]): "ok" | "bad" | "missing" {
  const crc = items.find((item) => item.id === "63");
  if (crc === undefined || crc.value.length !== 4 || items[items.length - 1] !== crc) return "missing";
  return hex4(crc16ccitt(units.bytes(crc.at + 4))) === crc.value.toUpperCase() ? "ok" : "bad";
}

function dumpTemplate(value: string, byBytes: boolean): string {
  const inner = walkTlv(byBytes ? byteUnits(value) : characterUnits(value));
  if (inner.items.length === 0) return clip(visibleText(value, false).text, 200);
  return clip(inner.items.map((item) => `${item.id}=${visibleText(item.value, false).text}`).join("; "), 200);
}

interface Reading {
  byBytes: boolean;
  items: Tlv[];
  complete: boolean;
  crc: "ok" | "bad" | "missing";
}

function reading(units: Units, byBytes: boolean): Reading {
  const { items, complete } = walkTlv(units);
  return { byBytes, items, complete, crc: checkCrc(units, items) };
}

/** A checksum that matches counts most, then a structure that reads to the end, then a checksum found but wrong. */
function score(r: Reading): number {
  return (r.crc === "ok" ? 4 : 0) + (r.complete ? 2 : 0) + (r.crc === "bad" ? 1 : 0);
}

function readEmv(text: string, raw: string): ReadResult {
  const notes = new Notes();
  let best = reading(characterUnits(text), false);
  // Counting bytes only differs from counting characters when the text is not plain ASCII; a tie keeps the characters.
  if (score(best) < 6 && /[^\u0000-\u007f]/.test(text)) {
    const bytes = reading(byteUnits(text), true);
    if (score(bytes) > score(best)) best = bytes;
  }
  const { items, complete, crc, byBytes } = best;
  const find = (id: string): Tlv | undefined => items.find((item) => item.id === id);
  const shown = (item: Tlv | undefined): string => (item === undefined ? "" : visibleText(item.value, false).text);
  notes.add("info", "emv-not-upi");

  if (crc === "missing") notes.add("warn", "crc-missing");
  else notes.add(crc === "ok" ? "info" : "warn", crc === "ok" ? "crc-ok" : "crc-bad");
  if (!complete) notes.add("warn", "emv-truncated");
  if (find("59") !== undefined) notes.add("info", "name-unverified");

  const fields: ReadField[] = [];
  const currency = shown(find("53"));
  let amountPaise: string | null = null;
  for (const item of items) {
    const id = item.id;
    const value = shown(item);
    if (id === "00" || id === "01") continue;
    if (id === "59") fields.push({ key: "59", label: FIELD_LABELS.merchantName, value });
    else if (id === "60") fields.push({ key: "60", label: FIELD_LABELS.merchantCity, value });
    else if (id === "54") {
      // EMVCo allows a "." with no decimals after it ("100."); an amount of zero is not allowed.
      const paise = currency === "356" ? rupeesToPaise(value.replace(/\.$/, "")) : null;
      const usable = paise !== null && paise !== "0" ? paise : null;
      if (usable !== null) amountPaise = usable;
      fields.push({ key: "54", label: FIELD_LABELS.am, value: usable === null ? value : formatPaise(usable) });
    } else if (id === "53") fields.push({ key: "53", label: FIELD_LABELS.currencyCode, value: value === "356" ? "356 (INR)" : value });
    else if (id === "58") fields.push({ key: "58", label: FIELD_LABELS.country, value });
    else if (id === "52") fields.push({ key: "52", label: FIELD_LABELS.mc, value });
    else if (id === "63") fields.push({ key: "63", label: FIELD_LABELS.checksum, value });
    else if (id === "62") fields.push({ key: "62", label: FIELD_LABELS.additional, value: dumpTemplate(item.value, byBytes) });
    else if (Number(id) >= 2 && Number(id) <= 51) fields.push({ key: id, label: FIELD_LABELS.merchantAccount, value: dumpTemplate(item.value, byBytes) });
    else fields.push({ key: id, label: FIELD_LABELS.otherTag, value: Number(id) >= 64 ? dumpTemplate(item.value, byBytes) : clip(value, 200) });
  }
  // Name and city first, then the rest in the order the code carries them.
  const rank = (field: ReadField): number => (field.key === "59" ? 0 : field.key === "60" ? 1 : field.key === "54" ? 2 : 3);
  fields.sort((a, b) => rank(a) - rank(b));
  return build("emv", raw, fields, notes, { amountPaise });
}

/* ---------- everything else ---------- */

function readOther(text: string, raw: string): ReadResult {
  const notes = new Notes();
  const scheme = /^([A-Za-z][A-Za-z0-9+.-]{1,30}):/.exec(text);
  if (scheme !== null) notes.add("info", "other-scheme", { scheme: clip(scheme[1].toLowerCase(), 31) });
  else if (/^[^\s@/:?#]+@[^\s@/:?#]+$/.test(text)) notes.add("info", "bare-id");
  else notes.add("info", "other-text");
  return build("other", raw, [{ key: "text", label: FIELD_LABELS.text, value: clip(visibleText(text, true).text, 300) }], notes);
}

function readText(input: string): ReadResult {
  const text = input.trim();
  const raw = clip(visibleText(text, true).text, MAX_RAW_SHOWN);
  const notes = new Notes();
  if (text === "") {
    notes.add("warn", "empty");
    return build("other", raw, [], notes);
  }
  if (text.length > MAX_QR_TEXT) {
    notes.add("warn", "too-long", { limit: String(MAX_QR_TEXT).replace(/\B(?=(\d{3})+(?!\d))/g, ",") });
    return build("other", raw, [], notes);
  }
  const upi = /^upi:\/\/([^?#/\s]*)\/?(?:\?([^#]*))?(?:#([\s\S]*))?$/i.exec(text);
  if (upi !== null) {
    const action = upi[1].toLowerCase();
    if (action === "pay" || action === "mandate") return readUpiLink(raw, action, upi[2] ?? "", (upi[3] ?? "").trim());
    const other = new Notes();
    other.add("warn", "other-action", { action: clip(action === "" ? "(none)" : action, 24) });
    return build("other", raw, [{ key: "text", label: FIELD_LABELS.text, value: clip(visibleText(text, false).text, 300) }], other);
  }
  if (/^https?:\/\//i.test(text)) return readWebAddress(text, raw);
  if (text.startsWith("000201")) return readEmv(text, raw);
  return readOther(text, raw);
}

/** Reads the text of a QR code. Never throws and never has side effects. */
export function readPayload(input: string): ReadResult {
  try {
    return readText(typeof input === "string" ? input : "");
  } catch {
    const notes = new Notes();
    notes.add("warn", "read-error");
    return build("other", "", [], notes);
  }
}
