import { createCipheriv, createECDH, createPrivateKey, hkdfSync, randomBytes, sign } from "node:crypto";

/**
 * Web Push without dependencies: RFC 8291 (message encryption, aes128gcm per
 * RFC 8188) and RFC 8292 (VAPID). Verified against the RFC 8291 Appendix A
 * test vector in scripts/webpush.test.mjs.
 */

export const b64u = (data: Buffer | Uint8Array | string): string =>
  Buffer.from(typeof data === "string" ? Buffer.from(data, "utf8") : data).toString("base64url");
export const fromB64u = (value: string): Buffer => Buffer.from(value, "base64url");

export interface PushSubscriptionKeys {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export function encryptPayload(
  plaintext: Buffer,
  uaPublicB64: string,
  authB64: string,
  options: { asPrivate?: Buffer; salt?: Buffer; recordSize?: number } = {},
): Buffer {
  const ecdh = createECDH("prime256v1");
  if (options.asPrivate) ecdh.setPrivateKey(options.asPrivate);
  else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const uaPublic = fromB64u(uaPublicB64);
  const auth = fromB64u(authB64);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4 || auth.length !== 16) throw new Error("Invalid subscription keys");

  const ecdhSecret = ecdh.computeSecret(uaPublic);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0", "latin1"), uaPublic, asPublic]);
  const ikm = Buffer.from(hkdfSync("sha256", ecdhSecret, auth, keyInfo, 32));
  const salt = options.salt ?? randomBytes(16);
  const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0", "latin1"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0", "latin1"), 12));

  const recordSize = options.recordSize ?? 4096;
  const padded = Buffer.concat([plaintext, Buffer.from([2])]); // 0x02 = last record, no extra padding
  if (padded.length + 16 > recordSize) throw new Error("Payload too large for one record");
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const ciphertext = Buffer.concat([cipher.update(padded), cipher.final(), cipher.getAuthTag()]);

  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(recordSize, 16);
  header[20] = asPublic.length;
  return Buffer.concat([header, asPublic, ciphertext]);
}

export function vapidAuthorization(endpoint: string, vapid: VapidKeys, now: number): string {
  const audience = new URL(endpoint).origin;
  const header = b64u(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const claims = b64u(JSON.stringify({ aud: audience, exp: Math.floor(now / 1000) + 12 * 3600, sub: vapid.subject }));
  const pub = fromB64u(vapid.publicKey);
  const key = createPrivateKey({
    key: { kty: "EC", crv: "P-256", d: vapid.privateKey, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) },
    format: "jwk",
  });
  const signature = sign("sha256", Buffer.from(`${header}.${claims}`), { key, dsaEncoding: "ieee-p1363" });
  return `vapid t=${header}.${claims}.${b64u(signature)}, k=${vapid.publicKey}`;
}

const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /\.notify\.windows\.com$/];

/**
 * The server POSTs to whatever endpoint a browser hands us, so only real push
 * services are allowed (no SSRF into private networks). Local endpoints are
 * accepted only when explicitly allowed (development tests).
 */
export function safePushEndpoint(value: unknown, allowLocal = false): string | null {
  if (typeof value !== "string" || value.length > 1024) return null;
  try {
    const url = new URL(value);
    if (allowLocal && url.protocol === "http:" && url.hostname === "127.0.0.1") return url.toString();
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    return PUSH_HOSTS.some((re) => re.test(url.hostname.toLowerCase())) ? url.toString() : null;
  } catch {
    return null;
  }
}

export function validSubscriptionKeys(keys: unknown): keys is PushSubscriptionKeys["keys"] {
  if (!keys || typeof keys !== "object") return false;
  const k = keys as Record<string, unknown>;
  if (typeof k.p256dh !== "string" || typeof k.auth !== "string") return false;
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(k.p256dh) || !/^[A-Za-z0-9_-]+={0,2}$/.test(k.auth)) return false;
  const p = fromB64u(k.p256dh.replace(/=+$/, ""));
  const a = fromB64u(k.auth.replace(/=+$/, ""));
  return p.length === 65 && p[0] === 4 && a.length === 16;
}

export type PushOutcome = "sent" | "expired" | "failed";

export async function sendPush(
  subscription: PushSubscriptionKeys,
  payload: unknown,
  vapid: VapidKeys,
  fetchImpl: typeof fetch = fetch,
  now = Date.now(),
): Promise<PushOutcome> {
  const body = encryptPayload(Buffer.from(JSON.stringify(payload)), subscription.keys.p256dh.replace(/=+$/, ""), subscription.keys.auth.replace(/=+$/, ""));
  try {
    const response = await fetchImpl(subscription.endpoint, {
      method: "POST",
      headers: {
        TTL: String(12 * 3600),
        Urgency: "normal",
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        Authorization: vapidAuthorization(subscription.endpoint, vapid, now),
      },
      body: new Uint8Array(body),
    });
    if (response.status === 404 || response.status === 410) return "expired";
    return response.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}
