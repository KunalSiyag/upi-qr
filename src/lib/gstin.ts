/**
 * GSTIN format check and decoder (India, 15 characters).
 *
 * Pure and import-free so `npm run test:gstin` runs it under Node. It checks the written shape of a GSTIN and its
 * check digit, and reads the parts. It cannot know whether a GSTIN is registered or whose it is: that lookup belongs
 * to the GST portal. Nothing here returns the check digit a GSTIN should have, and nothing suggests a corrected number.
 */

export const GSTIN_REVIEWED_ON = "2026-11-01";
export const GSTIN_LENGTH = 15;
/** The layout rules checkGstin() enforces, as one pattern for the upper-case number. The page shows it; a test keeps the two in step. */
export const GSTIN_LAYOUT_PATTERN = "^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]{3}$";
/** Most GSTINs a list check reads; the rest are counted and skipped. */
export const BULK_MAX = 500;
/** A pasted token longer than this is shortened on screen and in exports. */
export const TYPED_MAX = 64;
/** Most bad-character positions one text lists. */
export const MAX_CHAR_ISSUES = 50;

/** A made-up GSTIN for the page's sample buttons. Its check digit fits; no taxpayer holds it. */
export const SAMPLE_GSTIN = "27AAAAA0000A1Z2";
export const SAMPLE_LIST = [SAMPLE_GSTIN, "27AAAAA0000A1Z3", "27AAAAA0000A1Z"];

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export interface GstinState {
  code: string;
  name: string;
}

/** State and UT codes in the GST-era government lists (e-way bill and e-invoice portals). */
export const GSTIN_STATES: GstinState[] = [
  ["01", "Jammu and Kashmir"], ["02", "Himachal Pradesh"], ["03", "Punjab"], ["04", "Chandigarh"], ["05", "Uttarakhand"],
  ["06", "Haryana"], ["07", "Delhi"], ["08", "Rajasthan"], ["09", "Uttar Pradesh"], ["10", "Bihar"], ["11", "Sikkim"],
  ["12", "Arunachal Pradesh"], ["13", "Nagaland"], ["14", "Manipur"], ["15", "Mizoram"], ["16", "Tripura"], ["17", "Meghalaya"],
  ["18", "Assam"], ["19", "West Bengal"], ["20", "Jharkhand"], ["21", "Odisha"], ["22", "Chhattisgarh"], ["23", "Madhya Pradesh"],
  ["24", "Gujarat"], ["26", "Dadra and Nagar Haveli and Daman and Diu"], ["27", "Maharashtra"], ["29", "Karnataka"], ["30", "Goa"],
  ["31", "Lakshadweep"], ["32", "Kerala"], ["33", "Tamil Nadu"], ["34", "Puducherry"], ["35", "Andaman and Nicobar Islands"],
  ["36", "Telangana"], ["37", "Andhra Pradesh"], ["38", "Ladakh"], ["97", "Other Territory"],
].map(([code, name]) => ({ code, name }));

const STATE_NAMES = new Map(GSTIN_STATES.map((state) => [state.code, state.name]));

/** Notes for state codes outside the list. They never fail a GSTIN on their own: the check digit decides. */
export const GSTIN_CODE_NOTES = {
  "25": "Code 25 (Daman and Diu) is in the e-invoice portal's master list but not in the e-way bill list, which uses 26 for the merged Dadra and Nagar Haveli and Daman and Diu.",
  "28": "Code 28 is not in the GST-era state lists. The older VAT and TIN list used it for Andhra Pradesh, which the GST lists code as 37 (Telangana is 36).",
  special: "Codes 96 and 99 are not states: the e-invoice master list names both OTHER COUNTRIES, and the e-way bill list names 99 OTHER COUNTRY. This tool reads the standard state layout, so for these codes it can only say whether the format fits.",
  unknown: "State code {code} is not in the GST state and UT lists we checked (01-24, 26, 27, 29-38 and 97).",
};

/** Which GSTIN_CODE_NOTES entry explains a state code that is not in the list. */
export function stateNoteKey(code: string): keyof typeof GSTIN_CODE_NOTES {
  if (code === "25" || code === "28") return code;
  if (code === "96" || code === "99") return "special";
  return "unknown";
}

/** Fourth character of a PAN, which GSTIN characters 3-12 carry. Names start in lower case: they read after the letter. */
export const PAN_HOLDER_TYPES: { letter: string; name: string }[] = [
  { letter: "A", name: "association of persons (AOP)" },
  { letter: "B", name: "body of individuals (BOI)" },
  { letter: "C", name: "company" },
  { letter: "F", name: "firm or LLP" },
  { letter: "G", name: "government" },
  { letter: "H", name: "Hindu undivided family (HUF)" },
  { letter: "J", name: "artificial juridical person" },
  { letter: "L", name: "local authority" },
  { letter: "P", name: "individual" },
  { letter: "T", name: "trust" },
];

const HOLDER_NAMES = new Map(PAN_HOLDER_TYPES.map((holder) => [holder.letter, holder.name]));

export interface GstinSource {
  label: string;
  href: string;
  /** What this page takes from the source. */
  used: string;
  /** A government page; the rest are public references we cross-checked. */
  official: boolean;
}

export const GSTIN_SOURCES: GstinSource[] = [
  {
    label: "GST Council: Registration under GST law (flyer)",
    href: "https://gstcouncil.gov.in/sites/default/files/e-version-gst-flyers/Registration_under_GST_Law_new.pdf",
    used: "A 15-digit GSTIN: two digits of state code, ten of PAN, two of entity code and a check sum. No centralised registration across states.",
    official: true,
  },
  {
    label: "E-way bill system: state code list",
    href: "https://docs.ewaybillgst.gov.in/apidocs/state-code.html",
    used: "State and UT codes 01-24, 26, 27, 29-38 and 97, and 99 as OTHER COUNTRY.",
    official: true,
  },
  {
    label: "E-invoice portal: master codes",
    href: "https://einvoice1.gst.gov.in/Others/MasterCodes",
    used: "The same codes, plus 25 (Daman and Diu) and 96 and 99 as OTHER COUNTRIES.",
    official: true,
  },
  {
    label: "State codes used for TIN validation before GST (ddvat.gov.in, PDF)",
    href: "https://ddvat.gov.in/docs/List%20of%20State%20Code.pdf",
    used: "The older list, where 28 was Andhra Pradesh and 37 was Andhra Pradesh (New).",
    official: true,
  },
  {
    label: "GST portal user guide: Search Taxpayer",
    href: "https://tutorial.gst.gov.in/userguide/taxpayersdashboard/Search_Taxpayer_manual.htm",
    used: "What the official search shows for a GSTIN, and that it asks for a captcha before you are logged in.",
    official: true,
  },
  {
    label: "Income Tax Department: how a PAN is formed (FAQ)",
    href: "https://wm.incometaxindia.gov.in/web/guest/w/how-pan-is-formed-and-how-it-gets-its-unique-identity-",
    used: "The ten letters a PAN's fourth place can hold, and that its four digits run from 0001 to 9999.",
    official: true,
  },
  {
    label: "GST portal user guide: Apply for registration (normal taxpayer)",
    href: "https://tutorial.gst.gov.in/userguide/registration/Apply_for_Registration_Normal_Taxpayer.htm",
    used: "The PAN field takes the PAN of the business, or of the proprietor for a sole proprietorship.",
    official: true,
  },
  {
    label: "E-invoice API schema: generate IRN (NIC sandbox)",
    href: "https://einv-apisandbox.nic.in/version1.03/generate-irn.html",
    used: "The API's GSTIN fields take two digits and then 13 letters or digits, with no rule for a Z in the 14th place.",
    official: true,
  },
  {
    label: "python-stdnum: Indian GSTIN module",
    href: "https://github.com/arthurdejong/python-stdnum/blob/master/stdnum/in_/gstin.py",
    used: "The 13th character (registrations under one PAN in a state), the 14th character Z, and the Luhn mod 36 check digit.",
    official: false,
  },
  {
    label: "python-stdnum: Luhn and Luhn mod N",
    href: "https://github.com/arthurdejong/python-stdnum/blob/master/stdnum/luhn.py",
    used: "The check-digit method we compare our own code against.",
    official: false,
  },
  {
    label: "Protean eGov Technologies: what the 10 characters of a PAN mean",
    href: "https://www.proteantech.in/articles/pan-card-number-10-characters-meaning",
    used: "The holder-type letters in a PAN's fourth place.",
    official: false,
  },
  {
    label: "Wikipedia: Permanent account number",
    href: "https://en.wikipedia.org/wiki/Permanent_account_number",
    used: "The same holder-type letters, and what the other PAN characters stand for.",
    official: false,
  },
  {
    label: "TaxAdda: GST number format and structure",
    href: "https://taxadda.com/gst-number-format-structure-of-gstin/",
    used: "A public explainer for C and D (tax collectors and deductors) in the 14th place.",
    official: false,
  },
  {
    label: "Canada Revenue Agency: program accounts",
    href: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/business-registration/business-number-program-account/need-program-accounts.html",
    used: "The GST/HST account number: a 9-digit business number, RT and a 4-digit reference.",
    official: true,
  },
  {
    label: "New Zealand Inland Revenue: register for GST",
    href: "https://www.ird.govt.nz/gst/registering-for-gst/register-for-gst",
    used: "A New Zealand GST number is the same as the IRD number.",
    official: true,
  },
  {
    label: "Australian Business Register: ABN Lookup FAQs",
    href: "https://abr.business.gov.au/FAQ/ABNLookup",
    used: "ABN Lookup lists a business's GST registration.",
    official: true,
  },
];

export type GstinStatus = "empty" | "ok" | "checksum" | "format";

export type GstinIssueCode = "length" | "chars" | "state" | "pan-letter" | "pan-digit";

/** A hard problem. `position` counts from 1 in the text after spaces and hyphens are removed. */
export interface GstinIssue {
  code: GstinIssueCode;
  position?: number;
  /** Characters found, for a length problem. */
  count?: number;
}

export type GstinNoteCode = "state" | "holder" | "entity" | "fourteenth";

/** A remark that never changes the status. */
export interface GstinNote {
  code: GstinNoteCode;
  /** The state code, PAN letter or 14th character the note is about. */
  value: string;
}

export interface GstinParts {
  state: string;
  pan: string;
  entity: string;
  fourteenth: string;
  check: string;
}

export interface GstinResult {
  status: GstinStatus;
  /** Trimmed, upper-cased, without spaces and hyphens. */
  normalized: string;
  length: number;
  issues: GstinIssue[];
  notes: GstinNote[];
  /** Present once the text is 15 letters and digits. */
  parts: GstinParts | null;
  /** Present when characters 1-2 are digits; `name` is null for a code outside the list. */
  state: { code: string; name: string | null } | null;
  holder: { letter: string; name: string } | null;
  /** 1 to 9 for a digit in the 13th place; null for a letter. */
  entityNumber: number | null;
  /** Whether the 15th character fits the other 14. Says nothing about which character is wrong. */
  checkDigit: "match" | "mismatch" | "unknown";
}

const LEGAL_CHAR = /^[0-9A-Z]$/;
const DIGIT = /^[0-9]$/;
const LETTER = /^[A-Z]$/;

/** Spaces and hyphens, plus characters that have no visible shape (zero-width and direction marks, soft hyphen) and ride along when text is copied. */
const DROPPED = /[\s\-\u00ad\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069]/;

/** Trim, upper-case ASCII letters and drop what DROPPED matches. Any other character is kept so it can be reported. */
export function normalizeGstin(raw: string): string {
  let out = "";
  for (const ch of String(raw ?? "")) {
    if (DROPPED.test(ch)) continue;
    out += /[a-z]/.test(ch) ? ch.toUpperCase() : ch;
  }
  return out;
}

/**
 * Luhn mod 36 over all 15 characters, counted from the right (python-stdnum's luhn.checksum). True when the sum is a
 * multiple of 36. The sum is never returned: for a wrong check digit it would give the right one away.
 */
function checkDigitFits(chars: string[]): boolean {
  let sum = 0;
  for (let i = 0; i < chars.length; i++) {
    const value = ALPHABET.indexOf(chars[chars.length - 1 - i]);
    const weighted = i % 2 === 1 ? value * 2 : value;
    sum += Math.floor(weighted / 36) + (weighted % 36);
  }
  return sum % 36 === 0;
}

export function checkGstin(input: string): GstinResult {
  const normalized = normalizeGstin(input);
  const chars = Array.from(normalized);
  const issues: GstinIssue[] = [];
  const notes: GstinNote[] = [];
  const result: GstinResult = {
    status: "empty",
    normalized,
    length: chars.length,
    issues,
    notes,
    parts: null,
    state: null,
    holder: null,
    entityNumber: null,
    checkDigit: "unknown",
  };
  if (chars.length === 0) return result;

  if (chars.length !== GSTIN_LENGTH) issues.push({ code: "length", count: chars.length });
  // A pasted blob can hold millions of bad characters: only the first MAX_CHAR_ISSUES are listed, and any of them fails the text.
  const illegal = new Set<number>();
  let illegalCount = 0;
  chars.forEach((ch, index) => {
    if (LEGAL_CHAR.test(ch)) return;
    illegalCount += 1;
    if (illegalCount <= MAX_CHAR_ISSUES) {
      illegal.add(index + 1);
      issues.push({ code: "chars", position: index + 1 });
    }
  });

  if (chars.length === GSTIN_LENGTH) {
    const at = (position: number) => chars[position - 1];
    const layout = (positions: number[], want: RegExp, code: GstinIssueCode) => {
      for (const position of positions) {
        if (illegal.has(position) === false && want.test(at(position)) === false) issues.push({ code, position });
      }
    };
    layout([1, 2], DIGIT, "state");
    layout([3, 4, 5, 6, 7, 12], LETTER, "pan-letter");
    layout([8, 9, 10, 11], DIGIT, "pan-digit");

    if (illegalCount === 0) {
      const parts: GstinParts = {
        state: chars.slice(0, 2).join(""),
        pan: chars.slice(2, 12).join(""),
        entity: at(13),
        fourteenth: at(14),
        check: at(15),
      };
      result.parts = parts;
      if (DIGIT.test(parts.state[0]) && DIGIT.test(parts.state[1])) {
        const name = STATE_NAMES.get(parts.state) ?? null;
        result.state = { code: parts.state, name };
        if (name === null) notes.push({ code: "state", value: parts.state });
      }
      const holderLetter = at(6);
      if (LETTER.test(holderLetter)) {
        const name = HOLDER_NAMES.get(holderLetter);
        if (name === undefined) notes.push({ code: "holder", value: holderLetter });
        else result.holder = { letter: holderLetter, name };
      }
      if (/^[1-9]$/.test(parts.entity)) result.entityNumber = Number(parts.entity);
      if (parts.entity === "0") notes.push({ code: "entity", value: "0" });
      if (parts.fourteenth !== "Z") notes.push({ code: "fourteenth", value: parts.fourteenth });
      result.checkDigit = checkDigitFits(chars) ? "match" : "mismatch";
    }
  }

  issues.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  if (issues.length > 0) result.status = "format";
  else result.status = result.checkDigit === "match" ? "ok" : "checksum";
  return result;
}

/** "27 Maharashtra", the bare code for a code outside the list, or "" when the state cannot be read. */
export function stateLabel(result: GstinResult): string {
  if (result.state === null) return "";
  return result.state.name === null ? result.state.code : `${result.state.code} ${result.state.name}`;
}

export interface ListEntry {
  /** Line of the pasted text, counted from 1. */
  line: number;
  /** The token as typed, shortened to TYPED_MAX characters. */
  typed: string;
  result: GstinResult;
}

export interface ListCheck {
  entries: ListEntry[];
  /** Tokens beyond BULK_MAX that were not checked. */
  skipped: number;
  counts: { ok: number; checksum: number; format: number };
}

/** One GSTIN per line; commas, semicolons, tabs and spaces separate more of them. Blank pieces are dropped. */
export function checkList(text: string): ListCheck {
  const entries: ListEntry[] = [];
  const counts = { ok: 0, checksum: 0, format: 0 };
  let skipped = 0;
  String(text ?? "").split(/\r\n|\r|\n/).forEach((lineText, index) => {
    for (const token of lineText.split(/[\s,;]+/)) {
      if (token === "") continue;
      if (entries.length >= BULK_MAX) {
        skipped += 1;
        continue;
      }
      const result = checkGstin(token);
      if (result.status === "ok") counts.ok += 1;
      else if (result.status === "checksum") counts.checksum += 1;
      else counts.format += 1;
      const symbols = Array.from(token);
      const typed = symbols.length > TYPED_MAX ? `${symbols.slice(0, TYPED_MAX).join("")}…` : token;
      entries.push({ line: index + 1, typed, result });
    }
  });
  return { entries, skipped, counts };
}

/** A cell that starts with = + - @ (or a tab or return) would run as a formula in a spreadsheet: lead it with an apostrophe. */
export function safeCell(value: string): string {
  const text = String(value ?? "");
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

/** Rows to CSV (comma) or TSV (tab) text. Every cell goes through safeCell. */
export function toDelimited(rows: string[][], delimiter: "," | "\t"): string {
  const quote = (cell: string) => {
    const text = safeCell(cell);
    if (delimiter === "\t") return text.replace(/[\t\r\n]+/g, " ");
    return /[",\r\n]|^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return rows.map((row) => row.map(quote).join(delimiter)).join(delimiter === "," ? "\r\n" : "\n");
}
