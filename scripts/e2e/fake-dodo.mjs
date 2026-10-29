// A fake of the Dodo Payments API endpoints sponsorships call (src/lib/sponsors/dodo.ts), for e2e only. The dev
// server reaches it through DODO_API_BASE, which dodoConfig() accepts only in test mode and only on loopback.
// run.mjs starts it as its own process (`node fake-dodo.mjs <port>`): suites run under spawnSync, which would
// block an in-process server.
// Test hooks: GET /__admin/calls, POST /__admin/pay { session, payment, amount, product, quantity }, POST /__admin/reset.
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

export function startFakeDodo(port = 0) {
  let calls = [];
  let sessions = new Map();
  let payments = new Map();
  let refunded = new Set();
  let cancelled = new Set();
  let n = 0;
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const json = body ? JSON.parse(body) : null;
    const send = (status, value) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(value)); };
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === "/__admin/calls") return send(200, calls);
    if (url.pathname === "/__admin/reset") { calls = []; sessions = new Map(); payments = new Map(); refunded = new Set(); cancelled = new Set(); return send(200, { ok: true }); }
    if (url.pathname === "/__admin/pay") {
      sessions.get(json.session).payment = json.payment;
      payments.set(json.payment, { payment_id: json.payment, status: "succeeded", total_amount: json.amount, currency: "INR", product_cart: [{ product_id: json.product, quantity: json.quantity }], metadata: sessions.get(json.session).metadata, checkout_session_id: json.session, subscription_id: json.subscription ?? null });
      return send(200, { ok: true });
    }
    calls.push({ method: req.method, path: url.pathname, body: json, auth: req.headers.authorization ?? "" });
    if (req.method === "POST" && url.pathname === "/checkouts") {
      const id = `cks_E2eSponsor${String(++n).padStart(8, "0")}`;
      sessions.set(id, { metadata: json.metadata, payment: null });
      return send(200, { session_id: id, checkout_url: `https://test.checkout.dodopayments.com/session/${id}` });
    }
    const checkout = /^\/checkouts\/(cks_\w+)$/.exec(url.pathname);
    if (req.method === "GET" && checkout) return sessions.has(checkout[1]) ? send(200, { id: checkout[1], payment_id: sessions.get(checkout[1]).payment }) : send(404, {});
    const payment = /^\/payments\/(pay_\w+)$/.exec(url.pathname);
    // Payments we didn't create here (sent by suites as webhooks) still answer, so refunds can check refund_status.
    if (req.method === "GET" && payment) return send(200, { ...(payments.get(payment[1]) ?? { payment_id: payment[1], status: "succeeded" }), refund_status: refunded.has(payment[1]) ? "full" : null });
    if (req.method === "POST" && url.pathname === "/refunds") {
      if (refunded.has(json.payment_id)) return send(422, { error: "already refunded" });
      refunded.add(json.payment_id);
      return send(200, { refund_id: `ref_E2e${calls.length}`, payment_id: json.payment_id, status: "pending" });
    }
    const sub = /^\/subscriptions\/(sub_\w+)$/.exec(url.pathname);
    if (sub && req.method === "PATCH" && json.status === "cancelled") cancelled.add(sub[1]);
    if (sub) return send(200, { subscription_id: sub[1], status: cancelled.has(sub[1]) ? "cancelled" : "active" });
    return send(404, { error: "not faked" });
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({ port: server.address().port, close: () => server.close() })));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await startFakeDodo(Number(process.argv[2]) || 0);
