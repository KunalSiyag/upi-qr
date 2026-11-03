/**
 * UPI ID (VPA) format check and name ideas.
 *
 * Pure and import-free so `npm run test:upi-id` runs it under Node. It only
 * checks the written shape of an ID. It cannot know whether an ID exists or
 * who owns it: that lookup belongs to the UPI apps and banks.
 *
 * What counts as a problem is deliberately small. NPCI's public guidelines
 * define only a prefix the user can customise and a suffix (the handle) the
 * app sets, and apps add their own rules on top, so no length or symbol limit
 * is asserted here. The one stricter rule, `GENERATOR_VPA_RE`, belongs to this
 * site's QR generator and is reported separately.
 */

/** When the handle table, app steps and sources below were last read against the pages (YYYY-MM-DD). */
export const UPI_ID_REVIEWED_ON = "2026-11-01";

export type VpaIssue =
  | "empty"
  | "space"
  | "no-at"
  | "many-at"
  | "local-missing"
  | "handle-missing"
  | "local-chars"
  | "handle-chars";

export type SourceId =
  | "npci"
  | "gpay"
  | "paytm-support"
  | "paytm-change"
  | "paytm-terms"
  | "paytm-blog"
  | "phonepe-icici"
  | "phonepe-axis"
  | "phonepe-guide"
  | "sebi";

export interface UpiIdSource {
  id: SourceId;
  /** Full name for the sources list. */
  label: string;
  /** Short link text for tables and notes. */
  short: string;
  href: string;
  /** What this page is used for here. */
  used: string;
}

/** First-party pages read on `UPI_ID_REVIEWED_ON`. A claim that none of them states stays off the page. */
export const UPI_ID_SOURCES: UpiIdSource[] = [
  {
    id: "npci",
    label: "NPCI, BHIM UPI guidelines (PDF, updated 4 June 2026)",
    short: "NPCI guidelines",
    href: "https://www.npci.org.in/uploads/BHIM_UPI_Guidelines_2026_012a0b1bce.pdf",
    used: "What a UPI ID is (a prefix you can customise, a suffix the app sets), where apps show it, and its PIN and OTP warnings.",
  },
  {
    id: "gpay",
    label: "Google Pay Help: Create or find your UPI ID",
    short: "Google Pay Help",
    href: "https://support.google.com/pay/india/answer/7386842",
    used: "Steps to add, find and delete a UPI ID, the limit of 4 IDs per bank account, and that IDs from other apps cannot be used in Google Pay.",
  },
  {
    id: "paytm-support",
    label: "Paytm Support: How to Create and Manage UPI ID? (updated 26 June 2026)",
    short: "Paytm Support",
    href: "https://paytm.com/support/upi/how-to-create-and-manage-your-upi-id-on-paytm",
    used: "Paytm does not let you type an ID, you choose from the options it generates, and the menu path to your IDs.",
  },
  {
    id: "paytm-change",
    label: "Paytm Support: How to Change UPI ID on Paytm (updated 26 June 2026)",
    short: "Paytm Support: change",
    href: "https://paytm.com/support/upi/how-to-change-upi-id-on-paytm",
    used: "An existing Paytm ID cannot be edited; you switch your primary ID instead.",
  },
  {
    id: "paytm-terms",
    label: "Paytm UPI terms and conditions",
    short: "Paytm UPI terms",
    href: "https://paytm.com/company/upi-terms-and-conditions",
    used: "Handles for new IDs (section 6), several handles on one bank account (section 14), and @paytm assigned to Yes Bank from 15 March 2024 (section 17).",
  },
  {
    id: "paytm-blog",
    label: "Paytm Blog: Important Update: Enhancing Your UPI Payment Experience with New UPI IDs (updated 16 September 2025)",
    short: "Paytm blog",
    href: "https://paytm.com/blog/payments/upi/enhancing-your-upi-payment-experience-with-new-upi-ids/",
    used: "Paytm IDs updated from @paytm to @pthdfc, @ptaxis, @ptsbi or @ptyes.",
  },
  {
    id: "phonepe-icici",
    label: "PhonePe press release, 26 June 2020: PhonePe partners with ICICI Bank on UPI Multi-Bank",
    short: "PhonePe release, 2020",
    href: "https://www.phonepe.com/press/phonepe-partners-with-icici-bank-on-upi-multi-bank/",
    used: "@ybl (Yes Bank) and @ibl (ICICI Bank) as PhonePe handles, and several IDs per user.",
  },
  {
    id: "phonepe-axis",
    label: "PhonePe press release, 8 February 2021: PhonePe partners with Axis Bank on UPI Multi-Bank",
    short: "PhonePe release, 2021",
    href: "https://www.phonepe.com/press/phonepe-partners-with-axis-bank-on-upi-multi-bank/",
    used: "@axl (Axis Bank) as a PhonePe handle.",
  },
  {
    id: "phonepe-guide",
    label: "PhonePe for Business: UPI ID Meaning: Format, Examples & How It Works (June 2026)",
    short: "PhonePe guide",
    href: "https://business.phonepe.com/articles/upi-id-meaning-what-it-is-format-and-examples-explained",
    used: "Where PhonePe keeps your UPI IDs (your profile picture), and several UPI IDs for one bank account across apps, with a different handle in each app.",
  },
  {
    id: "sebi",
    label: "SEBI: list of mobile applications for using UPI in public issues (as on 7 March 2025)",
    short: "SEBI list, 7 Mar 2025",
    href: "https://www.sebi.gov.in/sebiweb/other/OtherAction.do?doRecognisedFpi=yes&intmId=43",
    used: "The handles of Google Pay (@okhdfcbank, @okaxis, @oksbi, @okicici), BHIM (@upi) and BHIM SBI Pay (@sbi).",
  },
];

export function sourceById(id: SourceId): UpiIdSource {
  const found = UPI_ID_SOURCES.find((item) => item.id === id);
  if (found === undefined) throw new Error(`unknown source ${id}`);
  return found;
}

export interface KnownHandle {
  handle: string;
  /** App and partner bank as the source names them. Where a source names only the app, the bank is the one in the handle. */
  issuer: string;
  /** An older handle: new IDs from the same app now use other handles, so it is never suggested for a new ID. */
  legacy?: boolean;
  source: SourceId;
}

/** Handles with a first-party source. Not exhaustive: apps and banks add and retire handles. */
export const KNOWN_HANDLES: KnownHandle[] = [
  { handle: "ybl", issuer: "PhonePe (Yes Bank)", source: "phonepe-icici" },
  { handle: "ibl", issuer: "PhonePe (ICICI Bank)", source: "phonepe-icici" },
  { handle: "axl", issuer: "PhonePe (Axis Bank)", source: "phonepe-axis" },
  { handle: "okhdfcbank", issuer: "Google Pay (HDFC Bank)", source: "sebi" },
  { handle: "okicici", issuer: "Google Pay (ICICI Bank)", source: "sebi" },
  { handle: "oksbi", issuer: "Google Pay (SBI)", source: "sebi" },
  { handle: "okaxis", issuer: "Google Pay (Axis Bank)", source: "sebi" },
  { handle: "ptyes", issuer: "Paytm (Yes Bank)", source: "paytm-terms" },
  { handle: "pthdfc", issuer: "Paytm (HDFC Bank)", source: "paytm-terms" },
  { handle: "ptsbi", issuer: "Paytm (SBI)", source: "paytm-terms" },
  { handle: "ptaxis", issuer: "Paytm (Axis Bank)", source: "paytm-terms" },
  { handle: "paytm", issuer: "Paytm, older IDs (via Yes Bank)", legacy: true, source: "paytm-terms" },
  { handle: "upi", issuer: "BHIM", source: "sebi" },
  { handle: "sbi", issuer: "BHIM SBI Pay (SBI)", source: "sebi" },
];

/** Handles to offer for a new ID: everything except older handles. */
export const NEW_ID_HANDLES: KnownHandle[] = KNOWN_HANDLES.filter((item) => item.legacy !== true);

/**
 * What this site's QR generator accepts (`isValidUpiId` in src/components/GeneratorForm.tsx). It is this site's
 * rule, not a UPI rule, so it is reported as `qrReady` and never as a format problem. The unit test fails if the
 * two drift apart.
 */
export const GENERATOR_VPA_RE = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;

const LOCAL_CHARS_RE = /^[a-zA-Z0-9.\-_]+$/;
const HANDLE_CHARS_RE = /^[a-zA-Z0-9]+$/;

export interface VpaCheck {
  /** No format problems found. This says nothing about whether the ID exists or who owns it. */
  ok: boolean;
  issues: VpaIssue[];
  /** Well-formed, but typed with capitals: UPI IDs are usually written in lowercase. */
  hasUppercase: boolean;
  /** This site's QR generator can take the ID (stricter than `ok`, see GENERATOR_VPA_RE). */
  qrReady: boolean;
  local: string;
  handle: string;
  issuer: string | null;
  /** The handle is an older one that apps no longer give to new IDs. */
  legacy: boolean;
  /** Lower-cased, trimmed form to copy into a QR generator. */
  normalized: string;
}

export function knownHandle(handle: string): KnownHandle | null {
  const key = handle.trim().toLowerCase();
  return KNOWN_HANDLES.find((item) => item.handle === key) ?? null;
}

export function checkVpa(input: string): VpaCheck {
  const raw = input.trim();
  const issues: VpaIssue[] = [];
  const result = (local: string, handle: string): VpaCheck => {
    const entry = knownHandle(handle);
    return {
      ok: issues.length === 0,
      issues,
      hasUppercase: issues.length === 0 && /[A-Z]/.test(raw),
      qrReady: GENERATOR_VPA_RE.test(raw),
      local,
      handle,
      issuer: entry?.issuer ?? null,
      legacy: entry?.legacy === true,
      normalized: raw.toLowerCase(),
    };
  };

  if (!raw) {
    issues.push("empty");
    return result("", "");
  }
  if (/\s/.test(raw)) issues.push("space");

  const parts = raw.split("@");
  if (parts.length === 1) {
    issues.push("no-at");
    return result(raw, "");
  }
  if (parts.length > 2) issues.push("many-at");

  const local = parts[0];
  const handle = parts.length === 2 ? parts[1] : parts.slice(1).join("@");

  if (!local) issues.push("local-missing");
  else if (!LOCAL_CHARS_RE.test(local.replace(/\s/g, ""))) issues.push("local-chars");

  if (!handle) issues.push("handle-missing");
  else if (parts.length === 2 && !HANDLE_CHARS_RE.test(handle.replace(/\s/g, ""))) issues.push("handle-chars");

  return result(local, handle);
}

/** Letters and digits only, from the Latin letters in a name. */
function asciiWords(name: string): string[] {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Our own limits for ideas, not UPI rules: this site's QR generator needs 2 characters before the @, and short IDs are easier to type and read out. */
const IDEA_MIN = 2;
const IDEA_MAX = 30;

/** Candidate local parts (before the @) built from a name and optional mobile number. */
export function suggestLocalParts(name: string, mobile = ""): string[] {
  const words = asciiWords(name);
  const digits = mobile.replace(/\D/g, "");
  const phone = digits.length === 10 ? digits : digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : "";
  const out: string[] = [];
  const add = (candidate: string) => {
    if (candidate.length >= IDEA_MIN && candidate.length <= IDEA_MAX && !out.includes(candidate)) out.push(candidate);
  };

  if (words.length > 0) {
    const joined = words.join("");
    add(joined);
    if (words.length > 1) add(`${words[0]}.${words[words.length - 1]}`);
    if (words.length > 1) add(`${words[0]}${words[words.length - 1][0]}`);
    add(`${joined}.pay`);
    if (phone) add(`${words[0]}${phone.slice(-4)}`);
  }
  if (phone) add(phone);
  return out.slice(0, 5);
}

/** Full ID examples, each already passing checkVpa. An older handle never gets ideas. */
export function suggestVpas(name: string, mobile: string, handle: string): string[] {
  const clean = handle.trim().toLowerCase();
  if (knownHandle(clean)?.legacy === true) return [];
  return suggestLocalParts(name, mobile)
    .map((local) => `${local}@${clean}`)
    .filter((id) => checkVpa(id).ok);
}

const MONTHS: Record<string, string[]> = {
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  hi: ["जनवरी", "फ़रवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर"],
  ta: ["ஜனவரி", "பிப்ரவரி", "மார்ச்", "ஏப்ரல்", "மே", "ஜூன்", "ஜூலை", "ஆகஸ்ட்", "செப்டம்பர்", "அக்டோபர்", "நவம்பர்", "டிசம்பர்"],
  te: ["జనవరి", "ఫిబ్రవరి", "మార్చి", "ఏప్రిల్", "మే", "జూన్", "జులై", "ఆగస్టు", "సెప్టెంబర్", "అక్టోబర్", "నవంబర్", "డిసెంబర్"],
  mr: ["जानेवारी", "फेब्रुवारी", "मार्च", "एप्रिल", "मे", "जून", "जुलै", "ऑगस्ट", "सप्टेंबर", "ऑक्टोबर", "नोव्हेंबर", "डिसेंबर"],
};

/**
 * "1 November 2026" from a YYYY-MM-DD date. Built from a month table, not Intl, so the server render and the
 * browser always print the same text. Languages without a table fall back to English.
 */
export function reviewedLabel(iso: string = UPI_ID_REVIEWED_ON, lang = "en"): string {
  const [year, month, day] = iso.split("-").map(Number);
  const names = MONTHS[lang] ?? MONTHS.en;
  return `${day} ${names[month - 1]} ${year}`;
}
