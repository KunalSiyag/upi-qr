import { createECDH, createHmac } from "node:crypto";
import { createServer } from "node:http";
import { checker } from "./cdp-lib.mjs";

const DEV = process.env.DEV_BASE || "http://localhost:4321";
const KV = "http://127.0.0.1:8799";
const check = checker();
const admin = (path, body) => fetch(`${KV}/__admin/${path}`, { method: "POST", body: JSON.stringify(body) }).then((r) => r.json());
const kvCmd = (cmd) => fetch(`${KV}/`, { method: "POST", headers: { Authorization: "Bearer test-token" }, body: JSON.stringify(cmd) }).then((r) => r.json());
const day = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const metric = async (name) => Number((await admin("get", { key: `metrics:${name}:${day}` })).value || 0);
const pushServer = createServer((req, res) => { req.resume(); req.on("end", () => { res.writeHead(201); res.end(); }); }).listen(8797, "127.0.0.1");

const OWNER = "e".repeat(32);
const TOKEN = "Mt7pQ2xYz9AbCdEfGhIjKl";
const T = Date.now();
const addDays = (n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const ws = {
  version: 1,
  business: { name: "Metrics Shop", upiId: "shop@okaxis", phone: "", gstin: "", invoicePrefix: "INV-", updatedAt: T },
  clients: { cli_aaaaaaaa: { id: "cli_aaaaaaaa", name: "Client", phone: "", email: "", gstin: "", createdAt: T, updatedAt: T } },
  invoices: { inv_00000001: { id: "inv_00000001", number: "M-1", clientId: "cli_aaaaaaaa", issueDate: addDays(-30), dueDate: addDays(-5), amountPaise: 100000, description: "", payments: [], reminders: [], voided: false, createdAt: T, updatedAt: T } },
};

try {
  await admin("reset", {});
  await admin("set", { key: `ws:doc:${OWNER}`, value: JSON.stringify(ws) });
  await admin("set", { key: `ws:rev:${OWNER}`, value: "1" });
  await admin("set", { key: `pl:tok:${TOKEN}`, value: JSON.stringify({ owner: OWNER, invoiceId: "inv_00000001", createdAt: T }) });

  const join = (email, tool = "pro") => fetch(`${DEV}/api/waitlist/`, { method: "POST", headers: { "Content-Type": "application/json", Origin: DEV, "X-Real-IP": "198.51.100.77" }, body: JSON.stringify({ email, tool, lang: "en" }) });
  await join("first@example.com");
  await join("first@example.com");
  await join("second@example.com");
  check("pro_interest counts new Pro early-access addresses only", (await metric("pro_interest")) === 2);
  await join("third@example.com", "invoice");
  check("waitlist_join counts the tools' early-access list separately", (await metric("waitlist_join")) === 1);

  // Funnel steps reported by the browser: aggregate counts only, capped per visitor.
  const step = (body, headers = {}) => fetch(`${DEV}/api/v1/events/`, { method: "POST", headers: { "Content-Type": "application/json", Origin: DEV, "X-Real-IP": "198.51.100.79", ...headers }, body: JSON.stringify(body) });
  check("tool_output step accepted (204)", (await step({ step: "tool_output" })).status === 204);
  await step({ step: "tracker_opened" });
  check("funnel steps counted", (await metric("tool_output")) === 1 && (await metric("tracker_opened")) === 1);
  check("unknown funnel step refused", (await step({ step: "pro_activated" })).status === 400 && (await metric("pro_activated")) === 0);
  check("cross-site funnel step refused", (await step({ step: "tool_output" }, { Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site" })).status === 403);
  for (let i = 0; i < 40; i++) await step({ step: "tool_output" }, { "X-Real-IP": "198.51.100.80" });
  check("one visitor can add at most 30 per hour", (await metric("tool_output")) === 31, String(await metric("tool_output")));

  const claim = await fetch(`${DEV}/i/${TOKEN}/`, { method: "POST", redirect: "manual", headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: DEV, "X-Real-IP": "198.51.100.78" }, body: "utr=412345678901&amount=1000" });
  check("claim accepted", claim.status === 303);
  check("claim_submitted counted", (await metric("claim_submitted")) === 1);

  const now = Math.floor(Date.now() / 1000);
  const event = (name, status, at, end) => JSON.stringify({ event: name, created_at: at, payload: { subscription: { entity: { id: "sub_METRIC01", plan_id: "plan_month", status, current_end: end, notes: { owner: OWNER } } } } });
  const send = (body) => fetch(`${DEV}/api/billing/razorpay-webhook/`, { method: "POST", headers: { "Content-Type": "application/json", "X-Razorpay-Signature": createHmac("sha256", "whsec_test").update(body).digest("hex") }, body });
  await send(event("subscription.activated", "active", now, now + 30 * 86400));
  await send(event("subscription.charged", "active", now + 5, now + 60 * 86400));
  check("pro_activated counts the transition once (renewal charge doesn't)", (await metric("pro_activated")) === 1);
  await send(event("subscription.cancelled", "cancelled", now + 10, now + 60 * 86400));
  check("pro_cancelled counted", (await metric("pro_cancelled")) === 1);

  const ua = createECDH("prime256v1"); ua.generateKeys();
  await admin("set", { hash: `push:subs:${OWNER}`, field: "phone", value: JSON.stringify({ endpoint: "http://127.0.0.1:8797/push/phone", keys: { p256dh: ua.getPublicKey().toString("base64url"), auth: Buffer.alloc(16, 1).toString("base64url") }, createdAt: T }) });
  await kvCmd(["sadd", "push:owners", OWNER]);
  const cron = await fetch(`${DEV}/api/cron/digest/`, { headers: { Authorization: `Bearer ${process.env.E2E_CRON_SECRET}` } });
  if (process.env.E2E_MODE === "prod") {
    // Production refuses the local test endpoint, so nothing is delivered or counted.
    check("cron runs in production build", cron.status === 200 && (await cron.json()).sent === 0);
    check("digest_sent only counts real deliveries", (await metric("digest_sent")) === 0);
  } else {
    check("cron delivered", cron.status === 200 && (await cron.json()).sent === 1);
    check("digest_sent counted", (await metric("digest_sent")) === 1);
  }

  const adminPage = await fetch(`${DEV}/admin/metrics/`, { redirect: "manual" });
  check("/admin/metrics/ is 404 for anyone not in ADMIN_USER_IDS", adminPage.status === 404 && !(await adminPage.text()).includes("Founder metrics"));
  const allKeys = (await (await fetch(`${KV}/__admin/keys`, { method: "POST" })).json()).keys;
  const metricKeys = allKeys.filter((k) => k.startsWith("metrics:"));
  check("every metric key is name + day only (no account ids, emails, or tokens)",
    metricKeys.length >= 4 && metricKeys.every((k) => /^metrics:[a-z_]+:\d{4}-\d{2}-\d{2}$/.test(k)), JSON.stringify(metricKeys));
} catch (error) {
  check("test script ran to completion", false, String(error).slice(0, 500));
} finally {
  pushServer.close();
}
process.exit(check.report());
