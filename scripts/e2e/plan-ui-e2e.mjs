import { checker, helpers, sleep, startBrowser } from "./cdp-lib.mjs";

const BASE = process.env.BASE || "http://localhost:4400";
const b = await startBrowser(9340);
const check = checker();
const t = async (js) => { await b.eval(helpers); return b.eval(js); };
const text = () => b.eval("document.body.innerText");

// Block the real Clerk SDK; install a controllable Clerk stub and an emulated
// /api/v1/workspace/ that merges per record (newest updatedAt wins, tombstones win ties).
await b.send("Network.setBlockedURLs", { urls: ["*clerk.accounts.dev*", "*clerk.browser.js*", "*@clerk/clerk-js*", "*dodopayments.com*"] });
await b.send("Page.addScriptToEvaluateOnNewDocument", { source: `
(() => {
  const cfg = () => JSON.parse(localStorage.getItem('__srvcfg') || '{"signedIn":false,"owner":"owner-a"}');
  const stub = {
    get loaded() { return true; },
    get user() { return cfg().signedIn ? { id: 'u', primaryEmailAddress: { emailAddress: 'owner@example.com' } } : null; },
    session: { getToken: async () => cfg().signedIn ? 'test-token' : null },
    signOut: async () => { const c = cfg(); c.signedIn = false; localStorage.setItem('__srvcfg', JSON.stringify(c)); window.__signedOut = true; },
  };
  Object.defineProperty(window, 'Clerk', { get: () => stub, set: () => {}, configurable: false });
  const pick = (a, b) => !a ? b : !b ? a : a.updatedAt !== b.updatedAt ? (a.updatedAt > b.updatedAt ? a : b) : (b.deletedAt && !a.deletedAt ? b : a);
  const merge = (a, b) => {
    const out = { version: 1, business: b.business.updatedAt > a.business.updatedAt ? b.business : a.business, clients: {}, invoices: {} };
    for (const k of ['clients', 'invoices']) for (const id of new Set([...Object.keys(a[k]), ...Object.keys(b[k])])) out[k][id] = pick(a[k][id], b[k][id]);
    return out;
  };
  const empty = () => ({ version: 1, business: { name: '', upiId: '', phone: '', gstin: '', invoicePrefix: 'INV-', updatedAt: 0 }, clients: {}, invoices: {} });
  const realFetch = window.fetch.bind(window);
  window.__calls = [];
  window.fetch = async (url, init = {}) => {
    if (String(url).includes('/api/v1/billing')) {
      const method = init.method || 'GET';
      window.__calls.push({ method, url: String(url), auth: init.headers?.Authorization || '', body: init.body || '' });
      if (!cfg().signedIn) return new Response('{"error":"Sign in"}', { status: 401 });
      const st = JSON.parse(localStorage.getItem('__billing') || '{"plan":{"id":"free","activePaylinks":10},"subscription":null,"billingAvailable":false}');
      if (method === 'GET') return new Response(JSON.stringify(st), { status: 200 });
      const action = JSON.parse(init.body).action;
      if (action === 'checkout') { localStorage.setItem('__lastCheckout', init.body); return new Response(JSON.stringify({ url: location.origin + '/pricing/?fake-razorpay-checkout=' + JSON.parse(init.body).interval }), { status: 200 }); }
      if (action === 'cancel') { st.subscription.cancelAtCycleEnd = true; localStorage.setItem('__billing', JSON.stringify(st)); return new Response('{"ok":true}', { status: 200 }); }
      if (action === 'manage') return new Response(JSON.stringify({ url: localStorage.getItem('__manageUrl') || 'https://customer.dodopayments.com/session/e2e' }), { status: 200 });
    }
    if (String(url).includes('/api/waitlist')) {
      window.__calls.push({ method: 'POST', url: String(url), body: init.body });
      return new Response('{"ok":true}', { status: 200 });
    }
    if (String(url).includes('/api/v1/paylinks')) {
      const method = init.method || 'GET';
      window.__calls.push({ method, url: String(url), auth: init.headers?.Authorization || '' });
      if (!cfg().signedIn) return new Response('{"error":"Sign in"}', { status: 401 });
      const links = JSON.parse(localStorage.getItem('__links') || '{}');
      const save = () => localStorage.setItem('__links', JSON.stringify(links));
      if (method === 'GET') return new Response(JSON.stringify({ links: Object.entries(links).map(([invoiceId, l]) => ({ invoiceId, token: l.token, claims: l.claims })), plan: { id: localStorage.getItem('__plan') || 'free', activePaylinks: 10, used: Object.keys(links).length } }), { status: 200 });
      if (method === 'POST') {
        const { invoiceId } = JSON.parse(init.body);
        const doc = JSON.parse(localStorage.getItem('__srvdoc') || 'null');
        if (!doc?.invoices?.[invoiceId]) return new Response('{"error":"This invoice has not synced yet."}', { status: 409 });
        links[invoiceId] = links[invoiceId] || { token: 'T' + String(Object.keys(links).length).padStart(21, '0'), claims: [] };
        save();
        return new Response(JSON.stringify({ token: links[invoiceId].token, created: true }), { status: 201 });
      }
      if (method === 'DELETE') {
        const token = String(url).split('?')[0].split('/').filter(Boolean).pop();
        const scope = JSON.parse(init.body).scope;
        for (const [id, l] of Object.entries(links)) if (l.token === token) { if (scope === 'claims') l.claims = []; else delete links[id]; }
        save();
        return new Response('{"ok":true}', { status: 200 });
      }
    }
    if (!String(url).includes('/api/v1/workspace')) return realFetch(url, init);
    const method = init.method || 'GET';
    const c = cfg();
    window.__calls.push({ method, url: String(url), auth: init.headers?.Authorization || '' });
    if (c.offline) throw new TypeError('Failed to fetch');
    if (!c.signedIn) return new Response('{"error":"Sign in"}', { status: 401 });
    let doc = JSON.parse(localStorage.getItem('__srvdoc') || 'null') || empty();
    if (method === 'DELETE') { localStorage.removeItem('__srvdoc'); return new Response('{"ok":true}', { status: 200 }); }
    if (method === 'PUT') { doc = merge(doc, JSON.parse(init.body).workspace); localStorage.setItem('__srvdoc', JSON.stringify(doc)); }
    return new Response(JSON.stringify({ workspace: doc, rev: 1, owner: c.owner }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
})();
` });

const T = Date.now();
const guest = {
  version: 1,
  business: { name: "Sharma Tuition", upiId: "sharma@okaxis", phone: "", gstin: "", invoicePrefix: "INV-", updatedAt: T },
  clients: { cli_aaaaaaaa: { id: "cli_aaaaaaaa", name: "Rohan", phone: "", email: "", gstin: "", createdAt: T, updatedAt: T } },
  invoices: {
    inv_00000001: { id: "inv_00000001", number: "INV-0001", clientId: "cli_aaaaaaaa", issueDate: "2026-10-01", dueDate: "2026-10-20", amountPaise: 300000, description: "", payments: [], reminders: [], voided: false, createdAt: T, updatedAt: T },
  },
};
// Seed from a page without the workspace island, so no running sync engine can race the new data.
const setup = async (cfg, local, server, owner) => { await b.go(BASE + "/terms/", 600); return b.eval(`localStorage.clear();
  localStorage.setItem('__srvcfg', ${JSON.stringify(JSON.stringify(cfg))});
  ${local ? `localStorage.setItem('proupiqr-workspace-v1', ${JSON.stringify(JSON.stringify(local))});` : ""}
  ${server ? `localStorage.setItem('__srvdoc', ${JSON.stringify(JSON.stringify(server))});` : ""}
  ${owner ? `localStorage.setItem('proupiqr-workspace-owner', '${owner}');` : ""}
  true`); };
const server = () => b.eval("JSON.parse(localStorage.getItem('__srvdoc') || 'null')");
const pill = () => b.eval("[...document.querySelectorAll('button')].find(b => /This device only|Synced|Syncing|Offline|Sync paused/.test(b.textContent))?.textContent || ''");


try {
  // Signed out: upgrade deep link explains the free account step and keeps the intent.
  await b.go(BASE + "/app/", 300);
  await setup({ signedIn: false, owner: "owner-a" }, guest);
  await b.go(BASE + "/app/?tab=settings&upgrade=yearly", 3000);
  check("signed-out plan panel shows prices + free account step", /Pro is ₹149\/month or ₹1,499\/year/.test(await text()));
  check("sign-up link preserves upgrade intent", await b.eval("[...document.querySelectorAll('#plan a')].some(a => a.getAttribute('href') === '/sign-up/?redirect_url=' + encodeURIComponent('/app/?tab=settings&upgrade=yearly'))"));
  check("plan panel highlighted for upgrade intent", await b.eval("document.getElementById('plan').className.includes('ring-sun')"));

  // Signed in, billing not configured yet: early-access form prefilled from Clerk.
  await setup({ signedIn: true, owner: "owner-a" }, guest);
  await b.eval("localStorage.setItem('__billing', JSON.stringify({ plan: { id: 'free', activePaylinks: 10 }, subscription: null, billingAvailable: false })); true");
  await b.go(BASE + "/app/?tab=settings", 3000);
  await b.waitFor("!!document.getElementById('pro-email')", 8000);
  check("billing-unavailable shows Pro early access form", /Pro opens soon at ₹149\/month, with a 14-day free trial/.test(await text()));
  check("email prefilled from the signed-in account", (await b.eval("document.getElementById('pro-email').value")) === "owner@example.com");
  await t("__t.click(/^Notify me$/)");
  await b.waitFor("/Pro early-access list/.test(document.body.innerText)");
  const wl = await b.eval("JSON.parse(window.__calls.find(c => c.url.includes('/api/waitlist')).body)");
  check("Pro waitlist posts tool=pro", wl.tool === "pro" && wl.email === "owner@example.com", JSON.stringify(wl));

  // Billing configured (Razorpay): its checkout note.
  await b.eval("localStorage.setItem('__billing', JSON.stringify({ plan: { id: 'free', activePaylinks: 10 }, subscription: null, billingAvailable: true, provider: 'razorpay' })); true");
  await b.go(BASE + "/app/?tab=settings", 3000);
  check("Razorpay checkout explains UPI AutoPay", await b.waitFor("/UPI AutoPay or card on Razorpay's secure page/.test(document.body.innerText)", 8000));

  // Billing configured (Dodo): checkout goes to the provider URL.
  await b.eval("localStorage.setItem('__billing', JSON.stringify({ plan: { id: 'free', activePaylinks: 10 }, subscription: null, billingAvailable: true, provider: 'dodo' })); true");
  await b.go(BASE + "/app/?tab=settings", 3000);
  const shown = await b.waitFor("[...document.querySelectorAll('button')].some(b => b.textContent.includes('₹1,499 / year · save ₹289')) && [...document.querySelectorAll('button')].some(b => b.textContent.includes('₹149 / month'))", 8000);
  check("upgrade buttons show both intervals with saving", shown);
  check("Dodo checkout names the merchant of record and GST", /Secure checkout by Dodo Payments, our merchant of record: UPI or card, GST included/.test(await text()));
  await b.eval("[...document.querySelectorAll('button')].find(b => b.textContent.includes('₹1,499 / year')).click(), true");
  await b.waitFor("location.search.includes('fake-razorpay-checkout=yearly')", 8000);
  check("yearly checkout redirects to provider URL", (await b.eval("location.search")) === "?fake-razorpay-checkout=yearly");
  const sent = await b.eval("JSON.parse(localStorage.getItem('__lastCheckout') || '{}')");
  // First subscription with Dodo: a free trial — ₹0 today, first payment when it ends.
  await b.eval("localStorage.setItem('__billing', JSON.stringify({ plan: { id: 'free', activePaylinks: 10 }, subscription: null, billingAvailable: true, provider: 'dodo', trialDays: 14 })); true");
  await b.go(BASE + "/app/?tab=settings", 3000);
  const trialShown = await b.waitFor("[...document.querySelectorAll('button')].some(b => b.textContent === 'Start free trial · then ₹149 / month') && [...document.querySelectorAll('button')].some(b => b.textContent === 'Start free trial · then ₹1,499 / year (save ₹289)')", 8000);
  check("trial: both buttons start a free trial and name the price after it", trialShown);
  const firstPayment = new Date(Date.now() + 14 * 86_400_000).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  check("trial: ₹0 today, first payment date, cancel before then", (await text()).includes(`Try Pro free for 14 days: ₹0 today, first payment on ${firstPayment}. Cancel before then and you pay nothing.`));
  check("checkout sends the interval and the account email for the receipt", sent.action === "checkout" && sent.interval === "yearly" && sent.email === "owner@example.com", JSON.stringify(sent));

  // Back from Razorpay before the webhook: a waiting state (not the upgrade buttons again), auto-recheck, then Pro.
  const pending = (url = "https://test.checkout.dodopayments.com/session/cks_e2etest") => `localStorage.setItem('__billing', JSON.stringify({ plan: { id: 'free', activePaylinks: 10 }, subscription: null, checkout: { interval: 'monthly', url: '${url}' }, billingAvailable: true, provider: 'dodo' })); true`;
  await b.eval(pending());
  await b.go(BASE + "/app/?tab=settings&checkout=done", 3000);
  const waitingShown = await b.waitFor("/Waiting for your payment to be confirmed/.test(document.body.innerText)", 8000);
  check("back from checkout: a waiting state instead of the upgrade buttons", waitingShown && !(await b.eval("[...document.querySelectorAll('button')].some(b => b.textContent.includes('₹149 / month'))")));
  check("continue-to-payment links to the Dodo checkout page", (await b.eval("[...document.querySelectorAll('#plan a')].find(a => a.textContent === 'Continue to payment')?.href")) === "https://test.checkout.dodopayments.com/session/cks_e2etest");
  await b.eval(pending("https://rzp.io/i/e2etest"));
  await b.go(BASE + "/app/?tab=settings", 3000);
  await b.waitFor("/Waiting for your payment to be confirmed/.test(document.body.innerText)", 8000);
  check("a Razorpay checkout page is linked too", (await b.eval("[...document.querySelectorAll('#plan a')].find(a => a.textContent === 'Continue to payment')?.href")) === "https://rzp.io/i/e2etest");
  await t("__t.click(/^Check again$/)");
  await b.waitFor("/Not confirmed yet/.test(document.body.innerText)", 8000);
  check("check again while unpaid says so", /Not confirmed yet/.test(await text()));
  const getsBefore = await b.eval("window.__calls.filter(c => c.url.includes('/api/v1/billing') && c.method === 'GET').length");
  await b.eval(`localStorage.setItem('__billing', JSON.stringify({ plan: { id: 'pro', activePaylinks: 10000 }, subscription: { status: 'active', interval: 'monthly', currentEnd: ${Date.UTC(2026, 10, 10)}, cancelAtCycleEnd: false }, checkout: null, billingAvailable: true })); true`);
  const flipped = await b.waitFor("/Welcome to Pro!/.test(document.body.innerText)", 9000);
  check("auto-recheck flips to Pro with a welcome", flipped && /Pro monthly · renews on 10 Nov 2026/.test(await text()));
  check("recheck polled the billing API", (await b.eval("window.__calls.filter(c => c.url.includes('/api/v1/billing') && c.method === 'GET').length")) > getsBefore);
  await b.eval(pending());
  await b.go(BASE + "/app/?tab=settings", 3000);
  await b.waitFor("/Choose a different plan/.test(document.body.innerText)", 8000);
  await t("__t.click(/^Choose a different plan$/)");
  check("choose a different plan brings back both upgrade buttons", await b.waitFor("[...document.querySelectorAll('button')].some(b => b.textContent.includes('₹149 / month'))", 4000));
  await b.eval(pending("https://evil.example/pay"));
  await b.go(BASE + "/app/?tab=settings", 3000);
  await b.waitFor("/Waiting for your payment to be confirmed/.test(document.body.innerText)", 8000);
  check("a checkout URL off the payment providers is never linked", !(await b.eval("[...document.querySelectorAll('#plan a')].some(a => a.textContent === 'Continue to payment')")));

  // Pro: renewal date, cancel at period end.
  const end = Date.UTC(2026, 10, 10);
  await b.eval(`localStorage.setItem('__billing', JSON.stringify({ plan: { id: 'pro', activePaylinks: 10000 }, subscription: { status: 'active', interval: 'monthly', currentEnd: ${end}, cancelAtCycleEnd: false }, billingAvailable: true, provider: 'dodo', manageAvailable: false })); true`);
  await b.go(BASE + "/app/?tab=settings", 3000);
  await b.waitFor("/renews on/.test(document.body.innerText)", 8000);
  check("Pro shows renewal date", /Pro monthly · renews on 10 Nov 2026/.test(await text()));
  check("no Manage billing without a provider portal (Razorpay subscriptions)", !/Manage billing/.test(await text()));
  await b.eval(`localStorage.setItem('__billing', JSON.stringify({ plan: { id: 'pro', activePaylinks: 10000 }, subscription: { status: 'active', interval: 'monthly', currentEnd: ${end}, cancelAtCycleEnd: false, trialEndsAt: ${end} }, billingAvailable: true, provider: 'dodo', manageAvailable: true })); true`);
  await b.go(BASE + "/app/?tab=settings", 3000);
  check("in trial: first payment amount and date, and how to avoid it", await b.waitFor("/Free trial · first payment of ₹149 on 10 Nov 2026\\. Cancel before then and you won't be charged\\./.test(document.body.innerText)", 8000), (await text()).match(/Free trial[^\n]*/)?.[0] ?? "");
  const proDodo = (status = "active") => `localStorage.setItem('__billing', JSON.stringify({ plan: { id: 'pro', activePaylinks: 10000 }, subscription: { status: '${status}', interval: 'yearly', currentEnd: ${end}, cancelAtCycleEnd: false }, billingAvailable: true, provider: 'dodo', manageAvailable: true })); true`;
  await b.eval(proDodo("pending") + "; localStorage.setItem('__manageUrl', 'https://evil.example/portal'); true");
  await b.go(BASE + "/app/?tab=settings", 3000);
  await b.waitFor("/Manage billing/.test(document.body.innerText)", 8000);
  check("failed renewal asks for a new payment method, with Manage billing", /Your last renewal payment failed\. Update your payment method to keep Pro\./.test(await text()));
  await t("__t.click(/^Manage billing$/)");
  check("a portal URL off the payment providers is refused", await b.waitFor("/Couldn't open billing/.test(document.body.innerText)", 4000) && (await b.eval("location.pathname")) === "/app/");
  await b.eval(proDodo() + "; localStorage.removeItem('__manageUrl'); true");
  await b.go(BASE + "/app/?tab=settings", 3000);
  await b.waitFor("/Manage billing/.test(document.body.innerText)", 8000);
  await t("__t.click(/^Manage billing$/)");
  await sleep(1500);
  check("Manage billing opens the Dodo customer portal", b.requests.includes("https://customer.dodopayments.com/session/e2e"), b.requests.filter((u) => !u.startsWith(BASE)).join(" "));
  await b.eval(`localStorage.setItem('__billing', JSON.stringify({ plan: { id: 'pro', activePaylinks: 10000 }, subscription: { status: 'active', interval: 'monthly', currentEnd: ${end}, cancelAtCycleEnd: false }, billingAvailable: true, provider: 'dodo', manageAvailable: false })); true`);
  await b.go(BASE + "/app/?tab=settings", 3000);
  await b.waitFor("/renews on/.test(document.body.innerText)", 8000);
  await t("__t.click(/^Cancel subscription…$/)");
  await t("__t.click(/^Yes, cancel$/)");
  await b.waitFor("/Pro stays on until/.test(document.body.innerText)", 8000);
  check("cancel shows paid-through date", /Cancelled — Pro stays on until 10 Nov 2026/.test(await text()));
  check("cancel sent to API", await b.eval("window.__calls.some(c => c.url.includes('/api/v1/billing') && c.method === 'POST' && c.body.includes('cancel'))"));
  // MSME mode: a Udyam number shows the MSMED deadline on overdue invoices; Pro adds Section 16 interest and the rights line.
  const day = (n) => { const d = new Date(Date.now() + n * 86_400_000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const msmeWs = { ...guest, invoices: { inv_msme0001: { id: "inv_msme0001", number: "MF-21", clientId: "cli_aaaaaaaa", issueDate: day(-75), dueDate: day(-45), amountPaise: 10000000, description: "", payments: [], reminders: [], voided: false, createdAt: T, updatedAt: T } } };
  await setup({ signedIn: false, owner: "owner-a" }, msmeWs);
  await b.go(BASE + "/app/?tab=settings", 3000);
  await b.waitFor("!!document.getElementById('ws-s-udyam')", 8000);
  await t("__t.set('ws-s-udyam', 'UDYAM-12'), __t.click(/^Save settings$/), true");
  check("MSME: an invalid Udyam number is refused", await b.waitFor("/doesn't look right \\(example: UDYAM/.test(document.body.innerText)", 4000));
  await t("__t.set('ws-s-udyam', 'udyam-mh-12-1234567'), __t.click(/^Save settings$/), true");
  await b.waitFor("/Settings saved/.test(document.body.innerText)", 4000);
  check("MSME: Udyam number saved normalized", (await b.eval("JSON.parse(localStorage.getItem('proupiqr-workspace-v1')).business.udyam")) === "UDYAM-MH-12-1234567");
  await b.go(BASE + "/app/?tab=invoices", 3000);
  await t("[...document.querySelectorAll('li [aria-expanded]')][0].click(), true");
  check("MSME free: overdue invoice shows the MSMED deadline and a Pro hint", await b.waitFor("/MSME deadline passed 45 days ago/.test(document.body.innerText) && /Pro shows the Section 16 interest due/.test(document.body.innerText)", 4000));
  await t("__t.click(/^Remind$/)");
  check("MSME free: reminder sheet points to Pro for the rights line", await b.waitFor("/Pro can add your MSME payment rights/.test(document.body.innerText)", 4000));
  await b.eval("localStorage.setItem('__plan', 'pro'); const c = JSON.parse(localStorage.getItem('__srvcfg')); c.signedIn = true; localStorage.setItem('__srvcfg', JSON.stringify(c)); true");
  await b.go(BASE + "/app/?tab=invoices", 3500);
  await b.waitFor("[...document.querySelectorAll('li [aria-expanded]')].length > 0", 6000);
  await t("[...document.querySelectorAll('li [aria-expanded]')][0].click(), true");
  check("MSME Pro: Section 16 interest shown to the paisa", await b.waitFor("/Section 16 interest so far: about ₹2,163\\.98 at 17\\.25% a year/.test(document.body.innerText)", 8000), (await text()).match(/MSME[^\n]*/)?.[0] ?? "");
  await t("__t.click(/^Remind$/)");
  await b.waitFor("[...document.querySelectorAll('label')].some(l => /Add my MSME payment rights/.test(l.textContent))", 4000);
  await b.eval("[...document.querySelectorAll('label')].find(l => /Add my MSME payment rights/.test(l.textContent)).querySelector('input').click(); true");
  const msmeMsg = await b.eval("document.getElementById('ws-reminder').value");
  check("MSME Pro: reminder gains the MSMED rights line", msmeMsg.includes("Udyam UDYAM-MH-12-1234567") && msmeMsg.includes("43B(h)"), msmeMsg.slice(0, 300));
  await b.eval("localStorage.removeItem('__plan'); true");

  check("no console errors (excluding blocked Clerk CDN)", b.errors.filter((e) => !/clerk|ERR_BLOCKED|Failed to load/i.test(e)).length === 0, b.errors.join(" | "));
} catch (error) {
  check("test script ran to completion", false, String(error).slice(0, 500));
} finally {
  b.close();
}
process.exit(check.report());
