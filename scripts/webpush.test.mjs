import assert from "node:assert/strict";
import { createDecipheriv, createECDH, createPublicKey, hkdfSync, verify } from "node:crypto";
import { b64u, encryptPayload, fromB64u, safePushEndpoint, sendPush, validSubscriptionKeys, vapidAuthorization } from "../src/lib/push/webpush.ts";

// RFC 8291 Appendix A test vector.
const V = {
  plaintext: "V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24",
  asPublic: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  uaPublic: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  uaPrivate: "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
  header: "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  ciphertext: "8pfeW0KbunFT06SuDKoJH9Ql87S1QUrdirN6GcG7sFz1y1sqLgVi1VhjVkHsUoEsbI_0LpXMuGvnzQ",
};
const out = encryptPayload(fromB64u(V.plaintext), V.uaPublic, V.auth, { asPrivate: fromB64u(V.asPrivate), salt: fromB64u(V.salt) });
assert.equal(b64u(out.subarray(0, 86)), V.header, "header (salt | rs | idlen | keyid) matches RFC 8291");
assert.equal(b64u(out.subarray(86)), V.ciphertext, "ciphertext matches RFC 8291");

// Round trip with a fresh "browser" key pair: the user agent can decrypt.
function decrypt(body, uaPrivateB64, uaPublicB64, authB64) {
  const salt = body.subarray(0, 16);
  const idlen = body[20];
  const asPublic = body.subarray(21, 21 + idlen);
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(fromB64u(uaPrivateB64));
  const secret = ecdh.computeSecret(asPublic);
  const ikm = Buffer.from(hkdfSync("sha256", secret, fromB64u(authB64), Buffer.concat([Buffer.from("WebPush: info\0", "latin1"), fromB64u(uaPublicB64), asPublic]), 32));
  const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0", "latin1"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0", "latin1"), 12));
  const ct = body.subarray(21 + idlen);
  const d = createDecipheriv("aes-128-gcm", cek, nonce);
  d.setAuthTag(ct.subarray(ct.length - 16));
  const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  assert.equal(plain[plain.length - 1], 2, "last-record delimiter");
  return plain.subarray(0, plain.length - 1).toString();
}
assert.equal(decrypt(out, V.uaPrivate, V.uaPublic, V.auth), Buffer.from(V.plaintext, "base64url").toString());
const ua = createECDH("prime256v1"); ua.generateKeys();
const uaPub = b64u(ua.getPublicKey()); const uaPriv = b64u(ua.getPrivateKey()); const auth = b64u(Buffer.alloc(16, 7));
assert.equal(decrypt(encryptPayload(Buffer.from('{"title":"3 to chase"}'), uaPub, auth), uaPriv, uaPub, auth), '{"title":"3 to chase"}');
assert.throws(() => encryptPayload(Buffer.from("x"), "AAAA", auth));

// VAPID: ES256 JWT that verifies with the public key and carries aud/exp/sub.
const vk = createECDH("prime256v1"); vk.generateKeys();
const vapid = { publicKey: b64u(vk.getPublicKey()), privateKey: b64u(vk.getPrivateKey()), subject: "mailto:support@proupiqr.in" };
const now = 1_790_000_000_000;
const authz = vapidAuthorization("https://fcm.googleapis.com/fcm/send/abc", vapid, now);
const [, token, k] = /^vapid t=([^,]+), k=(.+)$/.exec(authz);
assert.equal(k, vapid.publicKey);
const [h, c, s] = token.split(".");
const pub = fromB64u(vapid.publicKey);
const key = createPublicKey({ key: { kty: "EC", crv: "P-256", x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33)) }, format: "jwk" });
assert.ok(verify("sha256", Buffer.from(`${h}.${c}`), { key, dsaEncoding: "ieee-p1363" }, fromB64u(s)), "JWT signature verifies");
const claims = JSON.parse(fromB64u(c).toString());
assert.deepEqual(claims, { aud: "https://fcm.googleapis.com", exp: Math.floor(now / 1000) + 43200, sub: "mailto:support@proupiqr.in" });
assert.deepEqual(JSON.parse(fromB64u(h).toString()), { typ: "JWT", alg: "ES256" });

// Endpoint allowlist blocks SSRF.
assert.ok(safePushEndpoint("https://fcm.googleapis.com/fcm/send/abc"));
assert.ok(safePushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/abc"));
assert.ok(safePushEndpoint("https://web.push.apple.com/abc"));
assert.ok(safePushEndpoint("https://wns2-pn1p.notify.windows.com/w/?token=abc"));
assert.equal(safePushEndpoint("https://evil.example/fcm.googleapis.com"), null);
assert.equal(safePushEndpoint("https://fcm.googleapis.com.evil.example/x"), null);
assert.equal(safePushEndpoint("http://fcm.googleapis.com/x"), null);
assert.equal(safePushEndpoint("https://fcm.googleapis.com:8443/x"), null);
assert.equal(safePushEndpoint("https://user:pw@fcm.googleapis.com/x"), null);
assert.equal(safePushEndpoint("http://127.0.0.1:8798/push"), null, "local only when explicitly allowed");
assert.ok(safePushEndpoint("http://127.0.0.1:8798/push", true));
assert.equal(safePushEndpoint("http://169.254.169.254/latest", true), null);
assert.equal(validSubscriptionKeys({ p256dh: uaPub, auth }), true);
assert.equal(validSubscriptionKeys({ p256dh: "short", auth }), false);
assert.equal(validSubscriptionKeys({ p256dh: uaPub, auth: b64u(Buffer.alloc(8)) }), false);

// sendPush: headers, outcome mapping.
{
  const seen = [];
  const ok = async (url, init) => { seen.push({ url, init }); return new Response(null, { status: 201 }); };
  const gone = async () => new Response(null, { status: 410 });
  const boom = async () => { throw new Error("network"); };
  const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: uaPub, auth } };
  assert.equal(await sendPush(sub, { title: "t" }, vapid, ok, now), "sent");
  assert.equal(seen[0].init.headers["Content-Encoding"], "aes128gcm");
  assert.match(seen[0].init.headers.Authorization, /^vapid t=/);
  assert.equal(decrypt(Buffer.from(seen[0].init.body), uaPriv, uaPub, auth), '{"title":"t"}');
  assert.equal(await sendPush(sub, { title: "t" }, vapid, gone, now), "expired");
  assert.equal(await sendPush(sub, { title: "t" }, vapid, boom, now), "failed");
}

console.log("[webpush] RFC 8291 vector, round trip, VAPID JWT, endpoint allowlist, and send outcomes passed");
