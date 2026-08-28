/**
 * UPI URI parser, builder, and validator.
 *
 * Parses upi://pay?pa=...&pn=...&am=...&cu=INR&tn=... into structured fields
 * and builds valid UPI URIs from structured fields. Used internally by
 * GeneratorForm, DeveloperConsole, UpiLinkGenerator, and the QR decoder.
 *
 * Based on NPCI UPI Linking Specification v1.6. Currency defaults to INR.
 * All string values are trimmed. The amount (am) parameter represents the
 * fixed amount in INR (two decimal places max).
 *
 * @module upi-uri
 */

export interface UpiUriFields {
  /** Payee VPA (pa) — Virtual Payment Address. Required for valid UPI URI. */
  pa: string;
  /** Payee name (pn) — Display name shown in the UPI app. Required. */
  pn: string;
  /** Transaction amount in INR as a string with up to two decimal places. */
  am?: string;
  /** Transaction note (tn) — Reference shown on payment statement. */
  tn?: string;
  /** Currency code — always INR. */
  cu: string;
  /** Merchant code (mc) — optional, used for merchant transactions. */
  mc?: string;
  /** Transaction reference ID (tr) — optional bank reference. */
  tr?: string;
  /** Transaction reference URL (ref) — optional invoice/receipt URL. */
  ref?: string;
}

export interface ParsedUpiUri extends UpiUriFields {
  /** Amount in paise (integer) — null if amount not specified. */
  amountPaise: number | null;
  /** Parsed numeric amount, NaN if not specified or malformed. */
  amountNumeric: number;
  /** Whether the URI passes minimal structural validation. */
  valid: boolean;
}

/** Matches upi://pay?... with at least pa and pn parameters. */
const UPI_URI_RE = /^upi:\/\/pay\?([^#\s]*)/i;

/**
 * Matches a VPA: 1-50 chars, alphanumeric, dots, dashes, underscores,
 * exactly one @ separating the local part from the handler.
 * Handler must be 2-30 chars, alphanumeric with optional dots.
 */
const VPA_RE = /^[\w.\-]{1,50}@[\w][\w.]{1,29}$/;

/** Amount: up to 10 digits + optional 2 decimal places. */
const AMOUNT_RE = /^(\d{1,10})(\.\d{0,2})?$/;

/** Validates that a string contains only characters safe for UPI URIs. */
const SAFE_CHAR_RE = /^[\x20-\x7E\xA0-\uFFFF]*$/;

/**
 * Parse a UPI URI string into structured fields.
 *
 * @param uri - Raw UPI URI string, e.g. "upi://pay?pa=foo@bar&pn=Shop"
 * @returns ParsedUpiUri with extracted fields, computed amountPaise, and validity flag.
 *
 * @example
 * const result = parseUpiUri("upi://pay?pa=shop@upi&pn=My%20Shop&am=250.50");
 * console.log(result.pa); // "shop@upi"
 * console.log(result.amountPaise); // 25050
 */
export function parseUpiUri(uri: string): ParsedUpiUri {
  const result: ParsedUpiUri = {
    pa: "", pn: "", cu: "INR",
    amountNumeric: NaN, amountPaise: null, valid: false,
  };

  if (!uri || typeof uri !== "string") return result;

  const match = uri.match(UPI_URI_RE);
  if (!match) return result;

  const params = new URLSearchParams(match[1]);
  const pa = params.get("pa")?.trim() ?? "";
  const pn = params.get("pn")?.trim() ?? "";
  const am = params.get("am")?.trim() ?? undefined;
  const tn = params.get("tn")?.trim() ?? undefined;
  const cu = params.get("cu")?.trim() || "INR";
  const mc = params.get("mc")?.trim() ?? undefined;
  const tr = params.get("tr")?.trim() ?? undefined;
  const ref = params.get("ref")?.trim() ?? undefined;

  Object.assign(result, { pa, pn, cu, mc, tr, ref });
  if (am) result.am = am;
  if (tn) result.tn = tn;

  if (am) {
    const numeric = parseFloat(am);
    if (!isNaN(numeric) && AMOUNT_RE.test(am)) {
      result.amountNumeric = numeric;
      result.amountPaise = Math.round(numeric * 100);
    }
  }

  result.valid = validateFields(result);
  return result;
}

/**
 * Build a UPI URI string from structured fields.
 * Parameters that are empty strings or undefined are omitted from the output.
 *
 * @param fields - UPI URI fields to encode. pa and pn are required.
 * @returns Encoded UPI URI string, e.g. "upi://pay?pa=shop@upi&pn=Shop&cu=INR"
 *
 * @example
 * const uri = buildUpiUri({ pa: "shop@upi", pn: "My Shop", am: "500" });
 * console.log(uri); // "upi://pay?pa=shop%40upi&pn=My%20Shop&am=500&cu=INR"
 */
export function buildUpiUri(fields: UpiUriFields): string {
  const params = new URLSearchParams();
  params.set("pa", fields.pa);
  params.set("pn", fields.pn);
  params.set("cu", fields.cu || "INR");
  if (fields.am) params.set("am", fields.am);
  if (fields.tn) params.set("tn", fields.tn);
  if (fields.mc) params.set("mc", fields.mc);
  if (fields.tr) params.set("tr", fields.tr);
  if (fields.ref) params.set("ref", fields.ref);
  return `upi://pay?${params.toString()}`;
}

/**
 * Validate UPI URI fields. Checks VPA format, payee name presence,
 * amount decimal places, and character safety.
 *
 * @param fields - Parsed or constructed UPI URI fields
 * @returns true if the URI is minimally valid for UPI app consumption
 */
function validateFields(fields: UpiUriFields): boolean {
  if (!fields.pa || !fields.pn) return false;
  if (!VPA_RE.test(fields.pa)) return false;
  if (fields.am && !AMOUNT_RE.test(fields.am)) return false;
  if (fields.pn.length > 33) return false; // NPCI recommends ≤33 chars

  for (const [k, v] of Object.entries(fields)) {
    if (v && !SAFE_CHAR_RE.test(v)) return false;
    if (v && v.length > 256) return false;
  }

  if (fields.cu && !/^[A-Z]{3}$/.test(fields.cu)) return false;

  return true;
}

/**
 * Convenience check: is a raw string a parseable UPI URI?
 * Returns true if the VPA is well-formed and the payee name is present.
 */
export function isValidUpiUri(uri: string): boolean {
  return parseUpiUri(uri).valid;
}

/**
 * Convenience check: is a string a valid VPA format?
 * e.g. "shop@upi", "user@oksbi", "merchant.pay@icici"
 */
export function isValidVpa(vpa: string): boolean {
  return VPA_RE.test(vpa.trim());
}