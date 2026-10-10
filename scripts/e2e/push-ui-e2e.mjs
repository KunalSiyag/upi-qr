import { createECDH } from "node:crypto";
import { checker, helpers, sleep, startBrowser } from "./cdp-lib.mjs";

const BASE = process.env.BASE || "http://localhost:4400";
const b = await startBrowser(9345);
const check = checker();
const t = async (js) => { await b.eval(helpers); return b.eval(js); };
const text = () => b.eval("document.body.innerText");
const VAPID = process.env.E2E_VAPID_PUBLIC_KEY || (() => { const e = createECDH("prime256v1"); e.generateKeys(); return e.getPublicKey().toString("base64url"); })();

await b.send("Network.setBlockedURLs", { urls: ["*clerk.accounts.dev*", "*clerk.browser.js*"] });
await b.send("Browser.grantPermissions", { permissions: ["notifications"], origin: BASE });
await b.send("Page.addScriptToEvaluateOnNewDocument", { source: `
(() => {
  const stub = { loaded: true, user: { id: 'u' }, session: { getToken: async () => 'tok' }, signOut: async () => {} };
  Object.defineProperty(window, 'Clerk', { get: () => stub, set: () => {}, configurable: false });
  window.__push = [];
  const real = window.fetch.bind(window);
  const json = (v, s = 200) => new Response(JSON.stringify(v), { status: s, headers: { 'Content-Type': 'application/json' } });
  window.fetch = async (url, init = {}) => {
    const u = String(url), m = init.method || 'GET';
    if (u.includes('/api/v1/workspace')) return json({ workspace: init.body ? JSON.parse(init.body).workspace : { version: 1, business: { name: 'Push UI Shop', upiId: '', phone: '', gstin: '', invoicePrefix: 'INV-', updatedAt: 1 }, clients: {}, invoices: {} }, rev: 1, owner: 'o' });
    if (u.includes('/api/v1/paylinks')) return json({ links: [], plan: { id: 'free', activePaylinks: 10, used: 0 } });
    if (u.includes('/api/v1/billing')) return json({ plan: { id: 'free', activePaylinks: 10 }, subscription: null, billingAvailable: false });
    if (u.includes('/api/v1/push')) {
      window.__push.push({ m, body: init.body ? JSON.parse(init.body) : null });
      if (m === 'GET') return json({ available: true, publicKey: ${JSON.stringify(VAPID)} });
      if (m === 'POST' && init.body && JSON.parse(init.body).action === 'test') return json({ sent: 1 });
      return json({ ok: true });
    }
    return real(url, init);
  };
  if (window.PushManager) {
    PushManager.prototype.subscribe = async function (opts) {
      window.__subOpts = opts;
      window.__sub = {
        endpoint: 'https://fcm.googleapis.com/fcm/send/fake-device',
        toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'BPKfake', auth: 'authfake' } }; },
        unsubscribe: async () => { window.__unsubscribed = true; window.__sub = null; return true; },
      };
      return window.__sub;
    };
    PushManager.prototype.getSubscription = async function () { return window.__sub || null; };
  }
})();
` });

try {
  await b.go(BASE + "/terms/", 500);
  await b.eval("localStorage.clear(); localStorage.setItem('proupiqr-workspace-owner', 'o'); true");
  await b.go(BASE + "/app/?tab=settings", 3000);
  check("toggle offered when push is available", await b.waitFor("[...document.querySelectorAll('button')].some(b => b.textContent === 'Turn on morning reminders')", 10000));
  await t("__t.click(/^Turn on morning reminders$/)");
  check("turns on", await b.waitFor("/On for this device/.test(document.body.innerText)", 8000));
  const posted = await b.eval("window.__push.find(p => p.m === 'POST' && p.body && p.body.subscription)");
  check("subscription sent to the server", posted?.body.subscription.endpoint === "https://fcm.googleapis.com/fcm/send/fake-device");
  check("browser subscribed with the server's VAPID key", await b.eval(`(() => { const k = window.__subOpts.applicationServerKey; const b64 = btoa(String.fromCharCode(...k)).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, ''); return k.length === 65 && b64 === ${JSON.stringify(VAPID)} && window.__subOpts.userVisibleOnly === true; })()`));
  await t("__t.click(/^Send a test$/)");
  check("test notification request", await b.waitFor("/Test notification sent/.test(document.body.innerText)", 5000));

  // Deliver a real push to the service worker and confirm it shows a notification.
  const registrations = [];
  b.on("ServiceWorker.workerRegistrationUpdated", (p) => registrations.push(...p.registrations));
  await b.send("ServiceWorker.enable");
  await sleep(1000);
  const reg = registrations.find((r) => r.scopeURL.startsWith(BASE) && !r.isDeleted);
  check("service worker registration found", !!reg);
  if (reg) {
    await b.send("ServiceWorker.deliverPushMessage", { origin: BASE, registrationId: reg.registrationId, data: JSON.stringify({ title: "2 invoices to chase today", body: "₹25,000 overdue. Start with Acme Traders.", url: "/app/?tab=invoices", tag: "digest-test" }) });
    const shown = await b.waitFor("navigator.serviceWorker.ready.then(r => r.getNotifications()).then(n => n.some(x => x.title === '2 invoices to chase today'))", 8000);
    check("service worker shows the digest notification", shown);
    const n = await b.eval("navigator.serviceWorker.ready.then(r => r.getNotifications()).then(n => { const x = n.find(x => x.tag === 'digest-test'); return x ? { body: x.body, url: x.data && x.data.url, icon: x.icon } : null; })");
    check("notification carries body, deep link and icon", n?.body === "₹25,000 overdue. Start with Acme Traders." && n.url === "/app/?tab=invoices" && /icon-192\.png$/.test(n.icon), JSON.stringify(n));
    await b.send("ServiceWorker.deliverPushMessage", { origin: BASE, registrationId: reg.registrationId, data: JSON.stringify({ title: "Evil", url: "https://evil.example/" }) });
    await sleep(800);
    const evil = await b.eval("navigator.serviceWorker.ready.then(r => r.getNotifications()).then(n => n.find(x => x.title === 'Evil')).then(x => x && x.data && x.data.url)");
    check("off-site URLs in a push are replaced with /app/", evil === "/app/", String(evil));
  }

  await t("__t.click(/^Turn off$/)");
  check("turns off: unsubscribes and tells the server", await b.waitFor("[...document.querySelectorAll('button')].some(b => b.textContent === 'Turn on morning reminders')", 5000) && (await b.eval("window.__unsubscribed === true && window.__push.some(p => p.m === 'DELETE')")));
  check("no console errors (excluding blocked Clerk)", b.errors.filter((e) => !/clerk|ERR_BLOCKED|Failed to load/i.test(e)).length === 0, b.errors.join(" | "));
} catch (error) {
  check("test script ran to completion", false, String(error).slice(0, 500));
} finally {
  b.close();
}
process.exit(check.report());
