import { createHmac } from "node:crypto";
import { checker } from "./cdp-lib.mjs";

const DEV = process.env.DEV_BASE || "http://localhost:4321";
const KV = "http://127.0.0.1:8799";
const SECRET = "whsec_test";
const check = checker();
const admin = (path, body) => fetch(`${KV}/__admin/${path}`, { method: "POST", body: JSON.stringify(body) }).then((r) => r.json());
const OWNER = "c".repeat(32);
// The e2e server bills in test mode (fake Dodo test keys), so its records use the test-mode prefix.
const BILL = "billtest:";
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
const record = async () => { const v = (await admin("get", { key: `${BILL}own:${OWNER}` })).value; return v ? JSON.parse(v) : null; };
const payPage = async () => (await fetch(`${DEV}/i/${TOKEN}/`)).text();

try {
  await admin("reset", {});
  await admin("set", { key: `ws:doc:${OWNER}`, value: JSON.stringify(ws) });
  await admin("set", { key: `ws:rev:${OWNER}`, value: "1" });
  await admin("set", { key: `pl:tok:${TOKEN}`, value: JSON.stringify({ owner: OWNER, invoiceId: "inv_00000001", createdAt: T }) });
  await admin("set", { hash: `pl:own:${OWNER}`, field: "inv_00000001", value: TOKEN });

  check("free owner's pay page shows promo line", (await payPage()).includes("Send your own pay links free"));
  const liveRecord = { provider: "dodo", subscriptionId: "sub_LiveModeSub000000001", interval: "monthly", status: "active", currentEnd: Date.now() + 30 * 86_400_000, cancelAtCycleEnd: false, shortUrl: null, eventAt: 1, updatedAt: Date.now() };
  await admin("set", { key: `bill:own:${OWNER}`, value: JSON.stringify(liveRecord) });
  check("test-mode billing ignores live-mode records (shared database)", (await payPage()).includes("Send your own pay links free"));
  await admin("delprefix", { prefix: `bill:own:${OWNER}` });

  const now = Math.floor(Date.now() / 1000);
  const activated = event("subscription.activated", "active", now, now + 30 * 86400);
  let res = await send(activated, { sign: false });
  check("unsigned webhook → 401", res.status === 401);
  res = await send(activated, { secret: "wrong" });
  check("wrong-secret webhook → 401", res.status === 401);
  check("rejected webhooks change nothing", (await record()) === null);
  const istDay = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  check("rejected webhooks are counted for /admin/metrics/", Number((await admin("get", { key: `metrics:webhook_rejected:${istDay}` })).value) >= 2);

  res = await send(activated, { eventId: "evt_ACTIVATE01" });
  const body = await res.json();
  check("signed activation → 200 applied", res.status === 200 && body.applied === true, JSON.stringify(body));
  let rec = await record();
  check("subscription stored as active with period end", rec?.status === "active" && rec.currentEnd === (now + 30 * 86400) * 1000, JSON.stringify(rec));
  check("subscription → owner index stored", (await admin("get", { key: `${BILL}sub:sub_PROTEST1` })).value === OWNER);
  check("subscribed owner indexed for the daily reconcile", ((await admin("get", { set: `${BILL}owners` })).value ?? []).includes(OWNER));
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

  // ---------- Dodo Payments: Standard Webhooks signatures, checkout session → subscription ----------
  const DOWNER = "d".repeat(32);
  const DODO_KEY = process.env.E2E_DODO_WEBHOOK_KEY;
  const SUB = "sub_E2eDodoSub0000000001";
  const CUS = "cus_E2eCustomer00000001";
  const iso = (sec) => new Date(sec * 1000).toISOString();
  const dodoEvent = (type, status, { at = now, nextBilling = now + 30 * 86400, cancelAtNext = false, owner = DOWNER, id = SUB } = {}) => JSON.stringify({
    business_id: "bus_E2eBusiness0000000001", type, timestamp: iso(at),
    data: {
      payload_type: "Subscription", subscription_id: id, status, product_id: "pdt_E2eMonthly000000000", payment_frequency_interval: "Month",
      next_billing_date: iso(nextBilling), previous_billing_date: iso(at), cancel_at_next_billing_date: cancelAtNext, currency: "INR", tax_inclusive: true,
      customer: { customer_id: CUS, email: "riya@example.com", name: "Riya", metadata: owner ? { owner } : {} }, metadata: owner ? { owner } : {},
    },
  });
  const sendDodo = (body, { sign = true, id = `msg_${Math.random().toString(36).slice(2, 14)}`, ts = Math.floor(Date.now() / 1000), key = DODO_KEY } = {}) => {
    const signature = createHmac("sha256", Buffer.from(key.slice(6), "base64")).update(`${id}.${ts}.${body}`).digest("base64");
    return fetch(`${DEV}/api/billing/dodo-webhook/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "webhook-id": id, "webhook-timestamp": String(ts), ...(sign ? { "webhook-signature": `v1,${signature}` } : {}) },
      body,
    });
  };
  const dodoRecord = async () => { const v = (await admin("get", { key: `${BILL}own:${DOWNER}` })).value; return v ? JSON.parse(v) : null; };
  // What POST /api/v1/billing/ {action:"checkout"} leaves behind: a pending checkout session and the account's Dodo customer.
  await admin("set", { key: `${BILL}own:${DOWNER}`, value: JSON.stringify({ provider: "dodo", subscriptionId: "cks_E2eCheckout00000001", interval: "monthly", status: "created", currentEnd: null, cancelAtCycleEnd: false, shortUrl: "https://test.checkout.dodopayments.com/session/cks_E2eCheckout00000001", eventAt: 0, updatedAt: Date.now() }) });
  await admin("set", { key: `${BILL}cust:${DOWNER}`, value: CUS });
  await admin("set", { key: `${BILL}custown:${CUS}`, value: DOWNER });

  const rejectedBefore = Number((await admin("get", { key: `metrics:webhook_rejected:${istDay}` })).value);
  const dActive = dodoEvent("subscription.active", "active");
  check("Dodo: unsigned webhook → 401", (await sendDodo(dActive, { sign: false })).status === 401);
  check("Dodo: wrong signing key → 401", (await sendDodo(dActive, { key: `whsec_${Buffer.from("another-key-entirely-32-bytes!!!").toString("base64")}` })).status === 401);
  check("Dodo: replayed old delivery (10 min) → 401", (await sendDodo(dActive, { ts: Math.floor(Date.now() / 1000) - 600 })).status === 401);
  check("Dodo: rejected webhooks change nothing", (await dodoRecord()).status === "created");
  check("Dodo: rejected webhooks are counted", Number((await admin("get", { key: `metrics:webhook_rejected:${istDay}` })).value) >= rejectedBefore + 3);

  res = await sendDodo(dActive, { id: "msg_DodoActivate01" });
  const dBody = await res.json();
  check("Dodo: signed subscription.active → 200, Pro activated", res.status === 200 && dBody.applied === true && dBody.transition === "pro_activated", JSON.stringify(dBody));
  let drec = await dodoRecord();
  check("Dodo: checkout session replaced by the subscription, active until next billing date", drec?.provider === "dodo" && drec.subscriptionId === SUB && drec.status === "active" && drec.currentEnd === (now + 30 * 86400) * 1000, JSON.stringify(drec));
  check("Dodo: subscription → owner index stored", (await admin("get", { key: `${BILL}sub:${SUB}` })).value === DOWNER);
  check("Dodo: duplicate delivery (same webhook-id) acknowledged", (await (await sendDodo(dActive, { id: "msg_DodoActivate01" })).json()).duplicate === true);

  await sendDodo(dodoEvent("subscription.renewed", "active", { at: now + 30, nextBilling: now + 60 * 86400 }));
  check("Dodo: renewal moves the period end", (await dodoRecord()).currentEnd === (now + 60 * 86400) * 1000);
  await sendDodo(dodoEvent("subscription.updated", "active", { at: now + 40, nextBilling: now + 60 * 86400, cancelAtNext: true }));
  drec = await dodoRecord();
  check("Dodo: cancel at next billing date (from the customer portal) keeps Pro until then", drec.status === "active" && drec.cancelAtCycleEnd === true, JSON.stringify(drec));
  res = await sendDodo(dodoEvent("subscription.active", "active", { at: now + 50, owner: "e".repeat(32) }));
  check("Dodo: an event naming another account is ignored", (await res.json()).ignored === "owner mismatch" && (await dodoRecord()).eventAt === drec.eventAt);
  await sendDodo(dodoEvent("subscription.on_hold", "on_hold", { at: now + 60, nextBilling: now + 60 * 86400, owner: null }));
  check("Dodo: failed renewal (on_hold, no owner tag) found via the subscription index → grace period", (await dodoRecord()).status === "pending");
  res = await sendDodo(JSON.stringify({ business_id: "bus_E2eBusiness0000000001", type: "payment.succeeded", timestamp: iso(now), data: { payment_id: "pay_E2ePayment000000001" } }));
  check("Dodo: non-subscription events → 200 ignored", res.status === 200 && (await res.json()).ignored !== undefined);

  // Auth-only billing API.
  for (const method of ["GET", "POST"]) {
    const r = await fetch(`${DEV}/api/v1/billing/`, { method, headers: { "Content-Type": "application/json", Origin: DEV }, body: method === "POST" ? '{"action":"checkout"}' : undefined });
    check(`${method} /api/v1/billing/ → 401 signed out`, r.status === 401);
  }

  // Pricing page renders with the configured prices and is indexable.
  const pricing = await (await fetch(`${DEV}/pricing/`)).text();
  check("pricing page shows ₹149 and ₹1,499 and 0%", pricing.includes("₹149") && pricing.includes("₹1,499") && pricing.includes("0% of your payments"));
  check("pricing upgrade CTA deep-links into settings", pricing.includes('href="/app/?tab=settings&amp;upgrade=monthly"'));
  // Static pricing is built per deployment: the local build has no Dodo keys; the dev server does (fake, test mode).
  const cta = process.env.E2E_MODE === "prod" ? "Get early access" : "Start 14-day free trial";
  check(`pricing Pro CTA matches whether checkout is open (${cta})`, pricing.includes(`>${cta}</a>`));
  check("pricing FAQ explains the free trial", pricing.includes("Is there a free trial?") && pricing.includes("One trial per account."));
} catch (error) {
  check("test script ran to completion", false, String(error).slice(0, 500));
}
process.exit(check.report());
