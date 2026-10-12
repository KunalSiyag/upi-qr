import { createDecipheriv, createECDH, createPublicKey, hkdfSync, verify } from "node:crypto";
import { createServer } from "node:http";
import { checker } from "./cdp-lib.mjs";

const DEV = process.env.DEV_BASE || "http://localhost:4321";
const KV = "http://127.0.0.1:8799";
const check = checker();
// In the production build, local endpoints are refused (SSRF guard); in dev they're allowed for this test.
const PROD = process.env.E2E_MODE === "prod";
const admin = (path, body) => fetch(`${KV}/__admin/${path}`, { method: "POST", body: JSON.stringify(body) }).then((r) => r.json());
const SECRET = process.env.E2E_CRON_SECRET;
const VAPID_PUBLIC = process.env.E2E_VAPID_PUBLIC_KEY;
const b64u = (b) => Buffer.from(b).toString("base64url");

// A local stand-in for a browser push service.
const received = [];
let respondWith = 201;
const pushServer = createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  received.push({ url: req.url, headers: req.headers, body: Buffer.concat(chunks) });
  res.writeHead(respondWith); res.end();
});
// An ephemeral port, so a dev server elsewhere on this machine can't collide with it.
await new Promise((resolve) => pushServer.listen(0, "127.0.0.1", resolve));
const PUSH_ORIGIN = `http://127.0.0.1:${pushServer.address().port}`;

const ua = createECDH("prime256v1"); ua.generateKeys();
const auth = Buffer.alloc(16, 9);
function decrypt(body) {
  const salt = body.subarray(0, 16);
  const asPub = body.subarray(21, 86);
  const ikm = Buffer.from(hkdfSync("sha256", ua.computeSecret(asPub), auth, Buffer.concat([Buffer.from("WebPush: info\0", "latin1"), ua.getPublicKey(), asPub]), 32));
  const d = createDecipheriv("aes-128-gcm", Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0", "latin1"), 16)), Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0", "latin1"), 12)));
  const ct = body.subarray(86);
  d.setAuthTag(ct.subarray(ct.length - 16));
  const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  return JSON.parse(plain.subarray(0, plain.length - 1).toString());
}

const OWNER = "d".repeat(32);
const T = Date.now();
const istToday = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const ws = {
  version: 1,
  business: { name: "Push Test Shop", upiId: "shop@okaxis", phone: "", gstin: "", invoicePrefix: "INV-", updatedAt: T },
  clients: { cli_acme0001: { id: "cli_acme0001", name: "Acme Traders", phone: "", email: "", gstin: "", createdAt: T, updatedAt: T } },
  invoices: { inv_00000001: { id: "inv_00000001", number: "A-1", clientId: "cli_acme0001", issueDate: addDays(istToday, -40), dueDate: addDays(istToday, -12), amountPaise: 2500000, description: "", payments: [], reminders: [], voided: false, createdAt: T, updatedAt: T } },
};
const cron = (headers = {}) => fetch(`${DEV}/api/cron/digest/`, { headers });

try {
  await admin("reset", {});
  await admin("set", { key: `ws:doc:${OWNER}`, value: JSON.stringify(ws) });
  await admin("set", { key: `ws:rev:${OWNER}`, value: "1" });
  const sub = { endpoint: `${PUSH_ORIGIN}/push/phone`, keys: { p256dh: b64u(ua.getPublicKey()), auth: b64u(auth) }, createdAt: T };
  await admin("set", { hash: `push:subs:${OWNER}`, field: "phone", value: JSON.stringify(sub) });
  await fetch(`${KV}/`, { method: "POST", headers: { Authorization: "Bearer test-token" }, body: JSON.stringify(["sadd", "push:owners", OWNER]) });

  const info = await (await fetch(`${DEV}/api/v1/push/`)).json();
  check("GET /api/v1/push/ exposes the VAPID public key", info.available === true && info.publicKey === VAPID_PUBLIC);
  for (const method of ["POST", "DELETE"]) {
    const r = await fetch(`${DEV}/api/v1/push/`, { method, headers: { "Content-Type": "application/json", Origin: DEV }, body: "{}" });
    check(`${method} /api/v1/push/ → 401 signed out`, r.status === 401);
  }

  check("cron without secret → 401", (await cron()).status === 401);
  check("cron with wrong secret → 401", (await cron({ Authorization: "Bearer nope" })).status === 401);
  let res = await cron({ Authorization: `Bearer ${SECRET}` });
  let body = await res.json();
  if (PROD) {
    const left = (await admin("get", { hash: `push:subs:${OWNER}` })).value;
    check("production refuses a non-push-service endpoint and prunes it", res.status === 200 && body.sent === 0 && received.length === 0 && Object.keys(left).length === 0, JSON.stringify({ body, left }));
    check("owner leaves the push index", !((await admin("get", { set: "push:owners" })).value || []).includes(OWNER));
    throw new Error("__prod_done__");
  }
  check("cron run notifies the owner once", res.status === 200 && body.notified === 1 && body.sent === 1 && body.today === istToday, JSON.stringify(body));
  const delivery = received.at(-1);
  check("push service got aes128gcm + TTL + VAPID headers", delivery && delivery.headers["content-encoding"] === "aes128gcm" && Number(delivery.headers.ttl) > 0 && /^vapid t=/.test(delivery.headers.authorization));
  const [, token, k] = /^vapid t=([^,]+), k=(.+)$/.exec(delivery.headers.authorization);
  const [h, c, s] = token.split(".");
  const pub = Buffer.from(VAPID_PUBLIC, "base64url");
  const key = createPublicKey({ key: { kty: "EC", crv: "P-256", x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33)) }, format: "jwk" });
  check("VAPID JWT verifies with the server's public key", k === VAPID_PUBLIC && verify("sha256", Buffer.from(`${h}.${c}`), { key, dsaEncoding: "ieee-p1363" }, Buffer.from(s, "base64url")));
  check("JWT audience is the push service origin", JSON.parse(Buffer.from(c, "base64url")).aud === PUSH_ORIGIN);
  const payload = decrypt(delivery.body);
  check("decrypted payload is the digest", payload.title === "1 invoice to chase today" && /Start with Acme Traders — ₹25,000, 12 days late\./.test(payload.body) && payload.url === "/app/", JSON.stringify(payload));

  res = await cron({ Authorization: `Bearer ${SECRET}` });
  body = await res.json();
  check("second run the same day sends nothing", body.sent === 0 && body.notified === 0 && received.length === 1, JSON.stringify(body));

  // Expired subscription (410) is pruned on the next day's run.
  await fetch(`${KV}/`, { method: "POST", headers: { Authorization: "Bearer test-token" }, body: JSON.stringify(["del", `push:digest:${OWNER}:${istToday}`]) });
  respondWith = 410;
  res = await cron({ Authorization: `Bearer ${SECRET}` });
  body = await res.json();
  const left = (await admin("get", { hash: `push:subs:${OWNER}` })).value;
  check("410 Gone prunes the device", body.expired === 1 && Object.keys(left).length === 0, JSON.stringify({ body, left }));
  check("owner with no devices leaves the push index", !((await admin("get", { set: "push:owners" })).value || []).includes(OWNER));

  // A client's UTR claim on a pay link pushes to the owner's devices right away.
  respondWith = 201;
  await admin("set", { hash: `push:subs:${OWNER}`, field: "phone", value: JSON.stringify(sub) });
  const PAY_TOKEN = "Pa7pQ2xYz9AbCdEfGhIjKl";
  await admin("set", { key: `pl:tok:${PAY_TOKEN}`, value: JSON.stringify({ owner: OWNER, invoiceId: "inv_00000001", createdAt: T }) });
  await admin("set", { hash: `pl:own:${OWNER}`, field: "inv_00000001", value: PAY_TOKEN });
  const before = received.length;
  const claim = await fetch(`${DEV}/i/${PAY_TOKEN}/`, { method: "POST", redirect: "manual", headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: DEV }, body: "utr=412345678901&amount=25000" });
  check("claim accepted", claim.status === 303, String(claim.status));
  const alert = received.length > before ? decrypt(received.at(-1).body) : null;
  check("claim alert pushed at once, with only the last UTR digits", alert?.title === "A client says they've paid" && alert.body === "₹25,000 for A-1 · UTR …8901. Check your bank, then confirm it in the tracker." && alert.url === "/app/", JSON.stringify(alert));
} catch (error) {
  if (String(error).includes("__prod_done__")) { /* production branch finished */ }
  else check("test script ran to completion", false, String(error).slice(0, 500));
} finally {
  pushServer.close();
}
process.exit(check.report());
