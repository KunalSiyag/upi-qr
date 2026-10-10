import { checker, helpers, sleep, startBrowser } from "./cdp-lib.mjs";

const BASE = process.env.BASE || "http://localhost:4400";
const b = await startBrowser(9336);
const check = checker();
const t = async (js) => { await b.eval(helpers); return b.eval(js); };
const text = () => b.eval("document.body.innerText");

// Block the real Clerk SDK; install a controllable Clerk stub and an emulated
// /api/v1/workspace/ that merges per record (newest updatedAt wins, tombstones win ties).
await b.send("Network.setBlockedURLs", { urls: ["*clerk.accounts.dev*", "*clerk.browser.js*", "*@clerk/clerk-js*"] });
await b.send("Page.addScriptToEvaluateOnNewDocument", { source: `
(() => {
  const cfg = () => JSON.parse(localStorage.getItem('__srvcfg') || '{"signedIn":false,"owner":"owner-a"}');
  const stub = {
    get loaded() { return true; },
    get user() { return cfg().signedIn ? { id: 'u' } : null; },
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
  // 1. Signed out: no API writes, offer account.
  await b.go(BASE + "/app/", 300);
  await setup({ signedIn: false, owner: "owner-a" }, guest);
  await b.go(BASE + "/app/?tab=settings", 2500);
  check("signed out pill", (await pill()) === "This device only");
  check("signed out makes no API calls (Clerk says no user)", (await b.eval("window.__calls.length")) === 0);
  check("settings offers free account with return URL", await b.eval("[...document.querySelectorAll('a')].some(a => a.textContent === 'Create free account' && a.getAttribute('href') === '/sign-up/?redirect_url=' + encodeURIComponent('/app/?tab=settings'))"));

  // 2. First sign-in: guest data merges into the account.
  await setup({ signedIn: true, owner: "owner-a" }, guest);
  await b.go(BASE + "/app/", 2500);
  await b.waitFor("[...document.querySelectorAll('button')].some(b => b.textContent === 'Synced ✓')");
  check("signed in pill shows Synced", (await pill()) === "Synced ✓");
  const s1 = await server();
  check("guest invoice uploaded on first sign-in", !!s1?.invoices?.inv_00000001 && s1.business.name === "Sharma Tuition");
  check("owner tag recorded", (await b.eval("localStorage.getItem('proupiqr-workspace-owner')")) === "owner-a");
  check("requests carry Clerk bearer token", await b.eval("window.__calls.every(c => c.auth === 'Bearer test-token')"));
  check("synced banner shown", /Synced to your account/.test(await text()));

  // 3. Local edit pushes after debounce.
  await t("__t.click(/^Got paid$/) || true").catch(() => {});
  await t("__t.click(/^Invoices/)");
  await t("[...document.querySelectorAll('li [aria-expanded]')][0].click(), true");
  await t("__t.click(/^Record payment$/)");
  await b.waitFor("!!document.getElementById('ws-pay-amount')");
  await t("__t.set('ws-pay-amount', '1000'), __t.click(/^Save payment$/, __t.dialog())");
  await b.waitFor("!document.querySelector('[role=dialog]')");
  const putsBefore = await b.eval("window.__calls.filter(c => c.method === 'PUT').length");
  await sleep(2500);
  const s2 = await server();
  check("local payment reaches server after debounce", s2.invoices.inv_00000001.payments.length === 1);
  check("one debounced PUT per edit (no loop)", (await b.eval("window.__calls.filter(c => c.method === 'PUT').length")) - putsBefore === 1);
  await sleep(2000);
  check("no further PUTs when idle", (await b.eval("window.__calls.filter(c => c.method === 'PUT').length")) - putsBefore === 1);

  // 4. Another device adds an invoice; Sync now pulls it in.
  await b.eval(`(() => { const d = JSON.parse(localStorage.getItem('__srvdoc')); const now = Date.now();
    d.clients.cli_bbbbbbbb = { id: 'cli_bbbbbbbb', name: 'Laptop Client', phone: '', email: '', gstin: '', createdAt: now, updatedAt: now };
    d.invoices.inv_00000002 = { id: 'inv_00000002', number: 'INV-0002', clientId: 'cli_bbbbbbbb', issueDate: '2026-10-02', dueDate: '2026-10-25', amountPaise: 450000, description: '', payments: [], reminders: [], voided: false, createdAt: now, updatedAt: now };
    localStorage.setItem('__srvdoc', JSON.stringify(d)); return true; })()`);
  await t("__t.click(/^Settings$/)");
  await t("__t.click(/^Sync now$/)");
  await b.waitFor("document.body.innerText.includes('Laptop Client') || JSON.parse(localStorage.getItem('proupiqr-workspace-v1')).invoices.inv_00000002");
  check("changes from another device arrive", !!(await b.eval("JSON.parse(localStorage.getItem('proupiqr-workspace-v1')).invoices.inv_00000002")));

  // 5. Offline → online.
  await b.eval("(() => { const c = JSON.parse(localStorage.getItem('__srvcfg')); c.offline = true; localStorage.setItem('__srvcfg', JSON.stringify(c)); true })()");
  await t("__t.click(/^Sync now$/)");
  await b.waitFor("[...document.querySelectorAll('button')].some(b => /Offline/.test(b.textContent))");
  check("offline state shown", /Offline/.test(await pill()));
  await b.eval("(() => { const c = JSON.parse(localStorage.getItem('__srvcfg')); c.offline = false; localStorage.setItem('__srvcfg', JSON.stringify(c)); window.dispatchEvent(new Event('online')); true })()");
  check("reconnect syncs again", await b.waitFor("[...document.querySelectorAll('button')].some(b => b.textContent === 'Synced ✓')"));

  // 6. Account switch: data tagged for another account is set aside, never uploaded.
  const otherServer = { ...guest, business: { ...guest.business, name: "Account B Shop", updatedAt: T }, clients: {}, invoices: {} };
  await setup({ signedIn: true, owner: "owner-b" }, guest, otherServer, "owner-a");
  await b.go(BASE + "/app/?tab=settings", 3000);
  await b.waitFor("[...document.querySelectorAll('button')].some(b => b.textContent === 'Synced ✓')");
  const sB = await server();
  check("other account's data NOT uploaded", Object.keys(sB.invoices).length === 0 && sB.business.name === "Account B Shop");
  check("local now shows account B", (await text()).includes("Account B Shop") && !(await text()).includes("INV-0001"));
  check("previous data stashed", !!(await b.eval("localStorage.getItem('proupiqr-workspace-v1-other-account')")) && /set aside, not uploaded/.test(await text()));

  // 7. Delete cloud copy signs out and keeps local data.
  await t("__t.click(/^Delete cloud copy…$/)");
  await t("__t.click(/^Delete cloud copy$/)");
  await b.waitFor("[...document.querySelectorAll('button')].some(b => b.textContent === 'This device only')");
  check("delete cloud copy calls DELETE and signs out", (await b.eval("window.__calls.some(c => c.method === 'DELETE') && window.__signedOut === true")) && (await server()) === null);
  check("local data kept after cloud delete", (await b.eval("JSON.parse(localStorage.getItem('proupiqr-workspace-v1')).business.name")) === "Account B Shop");
  check("no console errors (excluding blocked Clerk CDN)", b.errors.filter((e) => !/clerk|ERR_BLOCKED|Failed to load/i.test(e)).length === 0, b.errors.join(" | "));
} catch (error) {
  check("test script ran to completion", false, String(error).slice(0, 500));
} finally {
  b.close();
}
process.exit(check.report());
