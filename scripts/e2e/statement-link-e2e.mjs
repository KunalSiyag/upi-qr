import { checker, helpers, sleep, startBrowser } from "./cdp-lib.mjs";

const DEV = process.env.DEV_BASE || "http://localhost:4321";
const STATIC = process.env.BASE || "http://localhost:4400";
const KV = "http://127.0.0.1:8799";
const check = checker();
const admin = (path, body) => fetch(`${KV}/__admin/${path}`, { method: "POST", body: JSON.stringify(body) }).then((r) => r.json());
const OWNER = "f".repeat(32);
const TOKEN = "St7pQ2xYz9AbCdEfGhIjKl";
const T = Date.now();
const day = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const addDays = (n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const inv = (id, number, issue, due, amount, description = "") => ({ id, number, clientId: "cli_riya0001", issueDate: issue, dueDate: due, amountPaise: amount, description, payments: [], reminders: [], voided: false, createdAt: T, updatedAt: T });
const ws = {
  version: 1,
  business: { name: "Sharma Tuition", upiId: "sharma@okaxis", phone: "", gstin: "", invoicePrefix: "TU-", updatedAt: T },
  clients: { cli_riya0001: { id: "cli_riya0001", name: "Riya Kapoor", phone: "9876543210", email: "", gstin: "", createdAt: T, updatedAt: T } },
  invoices: {
    inv_00000021: inv("inv_00000021", "TU-21", addDays(-40), addDays(-35), 300000, "Riya Sept fees"),
    inv_00000022: inv("inv_00000022", "TU-22", addDays(-10), addDays(-5), 300000, "Riya Oct fees"),
    inv_00000023: inv("inv_00000023", "TU-23", addDays(-60), addDays(-55), 300000),
  },
  recurring: {},
};
ws.invoices.inv_00000023.payments = [{ id: "pay_aaaaaaaa", amountPaise: 300000, date: addDays(-50), mode: "upi", reference: "", createdAt: T }];

try {
  // --- Public statement page (dev server + fake KV) ---
  await admin("reset", {});
  await admin("set", { key: `ws:doc:${OWNER}`, value: JSON.stringify(ws) });
  await admin("set", { key: `ws:rev:${OWNER}`, value: "1" });
  await admin("set", { key: `pl:tok:${TOKEN}`, value: JSON.stringify({ owner: OWNER, invoiceId: "stmt:cli_riya0001", createdAt: T }) });
  let html = await (await fetch(`${DEV}/i/${TOKEN}/`)).text();
  check("statement lists only unpaid invoices, oldest first", /Statement · 2 unpaid invoices/.test(html) && html.indexOf("TU-21") < html.indexOf("TU-22") && !html.includes("TU-23"));
  check("statement total and overdue", html.includes("₹6,000") && /Total due/.test(html) && /overdue/.test(html));
  check("no client identity or descriptions", !/Riya|9876543210|fees/.test(html), (html.match(/Riya|fees/g) || []).join(","));
  check("UPI intent pays the total with a dues note", /am=6000\.00/.test(html) && /tn=Dues\+to\+Sharma\+Tuition/.test(html));
  let res = await fetch(`${DEV}/i/${TOKEN}/`, { method: "POST", redirect: "manual", headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: DEV, "X-Real-IP": "198.51.100.81" }, body: "utr=412345678901&amount=" });
  check("statement claim requires the amount", (await res.text()).includes("so it can be applied to your oldest dues first"));
  res = await fetch(`${DEV}/i/${TOKEN}/`, { method: "POST", redirect: "manual", headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: DEV, "X-Real-IP": "198.51.100.81" }, body: "utr=412345678901&amount=4500" });
  check("statement claim accepted", res.status === 303);
  const claims = (await admin("get", { list: `pl:claims:${TOKEN}` })).value;
  check("claim stored with amount", claims.length === 1 && JSON.parse(claims[0]).amountPaise === 450000);

  // Free owners can't create statement links (API returns 401 signed-out in tests; plan rule covered by unit tests).

  // --- Workspace UI (static build + stubs) ---
  const b = await startBrowser();
  const t = async (js) => { await b.eval(helpers); return b.eval(js); };
  try {
    await b.send("Network.setBlockedURLs", { urls: ["*clerk.accounts.dev*", "*clerk.browser.js*"] });
    await b.send("Page.addScriptToEvaluateOnNewDocument", { source: `
(() => {
  const stub = { loaded: true, user: { id: 'u' }, session: { getToken: async () => 'tok' }, signOut: async () => {} };
  Object.defineProperty(window, 'Clerk', { get: () => stub, set: () => {}, configurable: false });
  const json = (v, s = 200) => new Response(JSON.stringify(v), { status: s, headers: { 'Content-Type': 'application/json' } });
  const real = window.fetch.bind(window);
  window.__posts = [];
  window.fetch = async (url, init = {}) => {
    const u = String(url), m = init.method || 'GET';
    const plan = localStorage.getItem('__plan') || 'free';
    const links = JSON.parse(localStorage.getItem('__links') || '{}');
    if (u.includes('/api/v1/workspace')) return json({ workspace: init.body ? JSON.parse(init.body).workspace : JSON.parse(localStorage.getItem('proupiqr-workspace-v1')), rev: 1, owner: 'o' });
    if (u.includes('/api/v1/billing')) return json({ plan: { id: plan, activePaylinks: 10 }, subscription: null, billingAvailable: false });
    if (u.includes('/api/v1/paylinks')) {
      if (m === 'GET') return json({ links: Object.entries(links).map(([invoiceId, l]) => ({ invoiceId, token: l.token, claims: l.claims })), plan: { id: plan, activePaylinks: 10, used: Object.keys(links).length, statementLinks: plan === 'pro' } });
      if (m === 'POST') { const body = JSON.parse(init.body); window.__posts.push(body); if (body.clientId) { links['stmt:' + body.clientId] = { token: 'S00000000000000000000T', claims: [] }; localStorage.setItem('__links', JSON.stringify(links)); return json({ token: 'S00000000000000000000T', created: true }, 201); } }
      if (m === 'DELETE') { const scope = JSON.parse(init.body).scope; for (const k of Object.keys(links)) { if (scope === 'claims') links[k].claims = []; else delete links[k]; } localStorage.setItem('__links', JSON.stringify(links)); return json({ ok: true }); }
    }
    if (u.includes('/api/v1/push')) return json({ available: false, publicKey: null });
    return real(url, init);
  };
})();` });
    await b.go(`${STATIC}/terms/`, 400);
    await b.eval(`localStorage.clear(); localStorage.setItem('proupiqr-workspace-owner', 'o'); localStorage.setItem('proupiqr-workspace-v1', ${JSON.stringify(JSON.stringify(ws))}); localStorage.setItem('__plan', 'free'); true`);
    await b.go(`${STATIC}/app/?tab=clients`, 3500);
    await b.waitFor("/Statement link for all dues/.test(document.body.innerText)", 8000);
    check("free plan sees the Pro upsell on clients", await b.eval("[...document.querySelectorAll('a')].some(a => a.textContent.includes('Statement link for all dues') && a.getAttribute('href') === '/app/?tab=settings&upgrade=monthly')"));
    await b.eval("localStorage.setItem('__plan', 'pro'); true");
    await b.go(`${STATIC}/app/?tab=clients`, 3500);
    await b.waitFor("[...document.querySelectorAll('button')].some(b => b.textContent.includes('Share statement link'))", 8000);
    await t("__t.click(/Share statement link/)");
    await b.waitFor("!!document.getElementById('stmt-cli_riya0001')", 8000);
    check("Pro creates a statement link for the client", (await b.eval("document.getElementById('stmt-cli_riya0001').value")) === `${STATIC}/i/S00000000000000000000T/` && (await b.eval("window.__posts.some(p => p.clientId === 'cli_riya0001')")));
    // A statement claim arrives; confirming applies it oldest first.
    await b.eval("(() => { const l = JSON.parse(localStorage.getItem('__links')); l['stmt:cli_riya0001'].claims = [{ utr: '412345678901', amountPaise: 450000, at: Date.now() }]; localStorage.setItem('__links', JSON.stringify(l)); })(), true");
    await b.go(`${STATIC}/app/`, 3500);
    await b.waitFor("/Statement payments to confirm/.test(document.body.innerText)", 8000);
    check("statement claim shown", /Riya Kapoor says they paid ₹4,500 on their statement/.test(await b.eval("document.body.innerText")));
    await t("__t.click(/^Confirm & apply$/)");
    await sleep(500);
    const data = await b.eval("JSON.parse(localStorage.getItem('proupiqr-workspace-v1'))");
    const p21 = data.invoices.inv_00000021.payments; const p22 = data.invoices.inv_00000022.payments;
    check("₹4,500 applied FIFO: ₹3,000 to TU-21, ₹1,500 to TU-22", p21.length === 1 && p21[0].amountPaise === 300000 && p22.length === 1 && p22[0].amountPaise === 150000 && p21[0].reference === "412345678901", JSON.stringify({ p21, p22 }));
    check("flash explains the allocation", /Applied ₹4,500 to 2 invoices/.test(await b.eval("document.body.innerText")));
    check("claim acknowledged", (await b.eval("JSON.parse(localStorage.getItem('__links'))['stmt:cli_riya0001'].claims.length")) === 0);
    check("no console errors (excluding blocked Clerk)", b.errors.filter((e) => !/clerk|ERR_BLOCKED|Failed to load/i.test(e)).length === 0, b.errors.join(" | "));
  } finally {
    b.close();
  }
} catch (error) {
  check("test script ran to completion", false, String(error).slice(0, 500));
}
process.exit(check.report());
