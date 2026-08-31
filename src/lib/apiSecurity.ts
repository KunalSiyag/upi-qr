import { createHash } from "node:crypto";
import { isIP } from "node:net";

const MAX_URL_LENGTH = 2048;
const MAX_AMOUNT_PAISE = 1_000_000_000;

export class RequestBodyError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function jsonResponse(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

export function authenticatedUserId(locals: unknown): string | null {
  const auth = (locals as { auth?: () => { userId?: string | null } })?.auth?.();
  return auth?.userId || null;
}

export function isTrustedMutation(request: Request): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") return false;

  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function requestBodyWithinLimit(request: Request, maxBytes: number): boolean {
  const value = request.headers.get("content-length");
  if (!value) return true;
  const bytes = Number(value);
  return Number.isFinite(bytes) && bytes >= 0 && bytes <= maxBytes;
}

export async function readLimitedText(request: Request, maxBytes: number): Promise<string> {
  if (!requestBodyWithinLimit(request, maxBytes)) throw new RequestBodyError("Request body is too large.", 413);
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new RequestBodyError("Request body is too large.", 413);
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

export async function readJsonObject(request: Request, maxBytes: number): Promise<Record<string, unknown>> {
  const raw = await readLimitedText(request, maxBytes);
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid object");
    return value as Record<string, unknown>;
  } catch {
    throw new RequestBodyError("Request body must be a JSON object.", 400);
  }
}

export function validVpa(value: unknown): value is string {
  return typeof value === "string"
    && value.length <= 320
    && /^[A-Za-z0-9][A-Za-z0-9._-]{1,255}@[A-Za-z0-9][A-Za-z0-9.-]{1,63}$/.test(value);
}

export function validMerchantName(value: unknown): value is string {
  return typeof value === "string"
    && value.trim().length >= 2
    && value.trim().length <= 80
    && !/[\u0000-\u001f\u007f]/.test(value);
}

export function validOrderId(value: unknown): value is string {
  return typeof value === "string"
    && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
}

export function validMerchantApiKey(value: unknown): value is string {
  return typeof value === "string" && /^puqi_live_[A-Za-z0-9]{32,96}$/.test(value);
}

export function validCheckoutSessionId(value: unknown): value is string {
  return typeof value === "string" && /^cs_live_[a-f0-9]{32,64}$/.test(value);
}

export function validUtr(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9]{10,35}$/.test(value);
}

export function parseInrToPaise(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const input = String(value).trim();
  const match = input.match(/^(0|[1-9]\d{0,7})(?:\.(\d{1,2}))?$/);
  if (!match) return null;

  const paise = Number(match[1]) * 100 + Number((match[2] || "").padEnd(2, "0"));
  return Number.isSafeInteger(paise) && paise > 0 && paise <= MAX_AMOUNT_PAISE ? paise : null;
}

export function validAmountPaise(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= MAX_AMOUNT_PAISE;
}

export function formatPaise(paise: number): string {
  return `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, "0")}`;
}

function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return true;
  }

  const version = isIP(host);
  if (version === 4) {
    const [a, b] = host.split(".").map(Number);
    return a === 0
      || a === 10
      || a === 127
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 0)
      || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19))
      || (a === 198 && b === 51 && host.split(".")[2] === "100")
      || (a === 203 && b === 0 && host.split(".")[2] === "113")
      || a >= 224;
  }
  if (version === 6) {
    return host === "::"
      || host === "::1"
      || host.startsWith("fc")
      || host.startsWith("fd")
      || /^fe[89ab]/.test(host)
      || host.startsWith("::ffff:");
  }
  return !host.includes(".") || host.endsWith(".example") || host.endsWith(".invalid") || host.endsWith(".test");
}

export function safePublicHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const input = value.trim();
  if (!input || input.length > MAX_URL_LENGTH || /[\u0000-\u001f\u007f]/.test(input)) return null;

  try {
    const url = new URL(input);
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return null;
    if (isPrivateHostname(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function safeDynamicDestination(value: unknown): string | null {
  const httpsUrl = safePublicHttpsUrl(value);
  if (httpsUrl) return httpsUrl;
  if (typeof value !== "string" || value.length > MAX_URL_LENGTH) return null;

  try {
    const url = new URL(value.trim());
    if (url.protocol !== "upi:" || url.hostname.toLowerCase() !== "pay" || url.username || url.password) return null;
    if (!validVpa(url.searchParams.get("pa") || "")) return null;
    const currency = url.searchParams.get("cu");
    if (currency && currency.toUpperCase() !== "INR") return null;
    const amount = url.searchParams.get("am");
    if (amount && parseInrToPaise(amount) === null) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function validExpiryDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(`${value}T23:59:59.999Z`);
  return !Number.isNaN(date.valueOf())
    && date.getUTCFullYear() === year
    && date.getUTCMonth() + 1 === month
    && date.getUTCDate() === day
    && date.valueOf() > Date.now()
    && date.valueOf() <= Date.now() + 5 * 365 * 24 * 60 * 60 * 1000;
}

export function requestFingerprint(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = request.headers.get("x-real-ip") || forwarded || "unknown";
  return createHash("sha256").update(address).digest("hex").slice(0, 24);
}
