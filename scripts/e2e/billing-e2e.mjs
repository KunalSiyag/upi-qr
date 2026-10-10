import { createHmac } from "node:crypto";
import { checker } from "./cdp-lib.mjs";

const DEV = process.env.DEV_BASE || "http://localhost:4321";
const KV = "http://127.0.0.1:8799";
const SECRET = "whsec_test";
const check = checker();
const admin = (path, body) => fetch(`${KV}/__admin/${path}`, { method: "POST", body: JSON.stringify(body) }).then((r) => r.json());
const OWNER = "c".repeat(32);
const TOKEN = "Bz7pQ2xYz9AbCdEfGhIjKl";
const T = Date.now();

const ws = {
  version: 1,
  business: { name: "Mehta Designs", upiId: "mehta@okhdfc", phone: "", gstin: "", invoicePrefix: "INV-", updatedAt: T },
  clients: { cli_aaaaaaaa: { id: "cli_aaaaaaaa", name: "Client", phone: "", email: "", gstin: "", createdAt: T, updatedAt: T } },
  invoices: { inv_00000001: { id: "inv_00000001", number: "MD-12", clientId: "cli_aaaaaaaa", issueDate: "2026-10-01", dueDate: "2026-10-30", amountPaise: 1500000, description: "", payments: [], reminders: [], voided: false, createdAt: T, updatedAt: T } },
};
const event = (name, status, createdAtSec, currentEndSec, id = "sub_PROTEST1") => JSON.stringify({
  entity: "event", account_id: "acc_x", event: name, created_at: createdAtSec,
  payload: { subscription: { entity: { id, plan_id: "plan_month", status, current_end: currentEndSec, notes: { owner: OWNER, product: "proupiqr-pro" } } } },
});
const send = (body, { sign = true, eventId = `evt_${Math.random().toString(36).slice(2, 12)}`, secret = SECRET } = {}) => fetch(`${DEV}/api/billing/razorpay-webhook/`, {
  method: "POST",
  headers: { "Content-Type": "application/json", ...(sign ? { "X-Razorpay-Signature": createHmac("sha256", secret).update(body).digest("hex") } : {}), "x-razorpay-event-id": eventId },
  body,
});
const record = async () => { const v = (await admin("get", { key: `bill:own:${OWNER}` })).value; return v ? JSON.parse(v) : null; };
const payPage = async () => (await fetch(`${DEV}/i/${TOKEN}/`)).text();

try {
  await admin("reset", {});
  await admin("set", { key: `ws:doc:${OWNER}`, value: JSON.stringify(ws) });
  await admin("set", { key: `ws:rev:${OWNER}`, value: "1" });
  await admin("set", { key: `pl:tok:${TOKEN}`, value: JSON.stringify({ owner: OWNER, invoiceId: "inv_00000001", createdAt: T }) });
  await admin("set", { hash: `pl:own:${OWNER}`, field: "inv_00000001", value: TOKEN });

  check("free owner's pay page shows promo line", (await payPage()).includes("Send your own pay links free"));

  const now = Math.floor(Date.now() / 1000);
  const activated = event("subscription.activated", "active", now, now + 30 * 86400);
  let res = await send(activated, { sign: false });
  check("unsigned webhook → 401", res.status === 401);
  res = await send(activated, { secret: "wrong" });
  check("wrong-secret webhook → 401", res.status === 401);
  check("rejected webhooks change nothing", (await record()) === null);

  res = await send(activated, { eventId: "evt_ACTIVATE01" });
  const body = await res.json();
  check("signed activation → 200 applied", res.status === 200 && body.applied === true, JSON.stringify(body));
  let rec = await record();
  check("subscription stored as active with period end", rec?.status === "active" && rec.currentEnd === (now + 30 * 86400) * 1000, JSON.stringify(rec));
  check("subscription → owner index stored", (await admin("get", { key: "bill:sub:sub_PROTEST1" })).value === OWNER);
  check("Pro owner's pay page drops promo line", !(await payPage()).includes("Send your own pay links free"));

  res = await send(activated, { eventId: "evt_ACTIVATE01" });
  check("duplicate delivery acknowledged as duplicate", (await res.json()).duplicate === true);

  // Out-of-order: an older pending event must not overwrite the newer active state.
  await send(event("subscription.pending", "pending", now - 60, now + 30 * 86400), { eventId: "evt_OLDPEND01" });
  check("older event ignored", (await record()).status === "active");

  // Cancellation with time left keeps Pro; after the period ends it is Free.
  await send(event("subscription.cancelled", "cancelled", now + 10, now + 5 * 86400), { eventId: "evt_CANCEL001" });
  rec = await record();
  check("cancelled with paid time left stays Pro", rec.status === "cancelled" && !(await payPage()).includes("Send your own pay links free"));
  await send(event("subscription.completed", "completed", now + 20, now - 60), { eventId: "evt_COMPLETE1" });
  check("after the paid period the promo line returns (Free)", (await payPage()).includes("Send your own pay links free"));

  // Non-subscription events and junk are acknowledged without effect.
  const other = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_x" } } } });
  res = await send(other);
  check("non-subscription event → 200 ignored", res.status === 200 && (await res.json()).ignored !== undefined);
  res = await send("not json");
  check("signed junk → 200 ignored (no retry storm)", res.status === 200);

  // Auth-only billing API.
  for (const method of ["GET", "POST"]) {
    const r = await fetch(`${DEV}/api/v1/billing/`, { method, headers: { "Content-Type": "application/json", Origin: DEV }, body: method === "POST" ? '{"action":"checkout"}' : undefined });
    check(`${method} /api/v1/billing/ → 401 signed out`, r.status === 401);
  }

  // Pricing page renders with the configured prices and is indexable.
  const pricing = await (await fetch(`${DEV}/pricing/`)).text();
  check("pricing page shows ₹149 and ₹1,499 and 0%", pricing.includes("₹149") && pricing.includes("₹1,499") && pricing.includes("0% of your payments"));
  check("pricing upgrade CTA deep-links into settings", pricing.includes('href="/app/?tab=settings&amp;upgrade=monthly"'));
} catch (error) {
  check("test script ran to completion", false, String(error).slice(0, 500));
}
process.exit(check.report());
