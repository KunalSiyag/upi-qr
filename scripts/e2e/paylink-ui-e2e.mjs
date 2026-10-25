import { checker, helpers, sleep, startBrowser } from "./cdp-lib.mjs";

const BASE = process.env.BASE || "http://localhost:4400";
const b = await startBrowser(9339);
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
    // Like a PR 3+ server, the foreign section is carried: per entry, newest wins; an absent section never deletes.
    if (a.intl || b.intl) {
      const x = a.intl || { invoices: {}, recurring: {}, clients: {} }, y = b.intl || { invoices: {}, recurring: {}, clients: {} };
      out.intl = { invoices: {}, recurring: {}, clients: {} };
      for (const k of ['invoices', 'recurring', 'clients']) for (const id of new Set([...Object.keys(x[k] || {}), ...Object.keys(y[k] || {})])) out.intl[k][id] = pick((x[k] || {})[id], (y[k] || {})[id]);
      const s = pick(x.settings, y.settings);
      if (s) out.intl.settings = s;
    }
    return out;
  };
  const empty = () => ({ version: 1, business: { name: '', upiId: '', phone: '', gstin: '', invoicePrefix: 'INV-', updatedAt: 0 }, clients: {}, invoices: {} });
  const realFetch = window.fetch.bind(window);
  window.__calls = [];
  window.fetch = async (url, init = {}) => {
    if (String(url).includes('/api/v1/paylinks')) {
      const method = init.method || 'GET';
      window.__calls.push({ method, url: String(url), auth: init.headers?.Authorization || '' });
      if (!cfg().signedIn) return new Response('{"error":"Sign in"}', { status: 401 });
      const links = JSON.parse(localStorage.getItem('__links') || '{}');
      const save = () => localStorage.setItem('__links', JSON.stringify(links));
      if (method === 'GET') return new Response(JSON.stringify({ links: Object.entries(links).map(([invoiceId, l]) => ({ invoiceId, token: l.token, claims: l.claims })), plan: { id: 'free', activePaylinks: 10, used: Object.keys(links).length } }), { status: 200 });
      if (method === 'POST') {
        const { invoiceId } = JSON.parse(init.body);
        const doc = JSON.parse(localStorage.getItem('__srvdoc') || 'null');
        const foreign = doc?.intl?.invoices?.[invoiceId];
        if (!doc?.invoices?.[invoiceId] && !foreign) return new Response('{"error":"This invoice has not synced yet."}', { status: 409 });
        const st = doc?.intl?.settings;
        if (foreign && !(st && ((st.accountName && st.account && (st.swift || st.bankDetails)) || st.payUrl))) return new Response(JSON.stringify({ error: "Add international payment details in Settings before sharing pay links for foreign-currency invoices.", code: "no_intl" }), { status: 409 });
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
    // c.noIntl: a server that doesn't keep the foreign section (a rollback to before PR 1).
    return new Response(JSON.stringify({ workspace: doc, rev: 1, owner: c.owner, ...(c.noIntl ? {} : { intl: 1 }) }), { status: 200, headers: { 'Content-Type': 'application/json' } });
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
  // Signed out: pay link needs an account.
  await b.go(BASE + "/app/", 300);
  await setup({ signedIn: false, owner: "owner-a" }, guest);
  await b.go(BASE + "/app/?tab=invoices", 2500);
  await t("[...document.querySelectorAll('li [aria-expanded]')][0].click(), true");
  check("signed-out row offers free account for pay links", /Pay links need a free account/.test(await text()));

  // Signed in: create link (flushes sync first), copy box, reminder includes link.
  await setup({ signedIn: true, owner: "owner-a" }, guest);
  await b.go(BASE + "/app/?tab=invoices", 2500);
  await b.waitFor("[...document.querySelectorAll('button')].some(b => b.textContent === 'Synced ✓')");
  await t("[...document.querySelectorAll('li [aria-expanded]')][0].click(), true");
  await t("__t.click(/Create pay link/)");
  await b.waitFor("!!document.querySelector('input[id^=link-]')", 8000);
  const url = await b.eval("document.querySelector('input[id^=link-]')?.value");
  check("pay link created and shown", url === `${BASE}/i/T000000000000000000000/`, url);
  check("flush pushed invoice before creating link", await b.eval("(() => { const c = window.__calls; const post = c.findIndex(x => x.url.includes('paylinks') && x.method === 'POST'); return c.slice(0, post).some(x => x.method === 'PUT'); })()"));
  await t("__t.click(/^Remind$/)");
  await b.waitFor("!!document.getElementById('ws-reminder')");
  const msg = await b.eval("document.getElementById('ws-reminder').value");
  check("reminder uses the pay link instead of raw UPI ID", msg.includes(`Pay securely here: ${url}`) && !msg.includes("Pay by UPI to"), msg);
  await b.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });

  // A payer claim appears on the overview; confirming records the payment with the UTR and clears the claim.
  await b.eval("(() => { const l = JSON.parse(localStorage.getItem('__links')); l.inv_00000001.claims = [{ utr: '412345678901', amountPaise: 100000, at: Date.now() }]; localStorage.setItem('__links', JSON.stringify(l)); })(), true");
  await b.go(BASE + "/app/", 3000);
  await b.waitFor("/Payments to confirm/.test(document.body.innerText)", 8000);
  check("claim shown for confirmation", /Rohan says they paid ₹1,000[\s\S]*412345678901/.test(await text()));
  await t("__t.click(/^Confirm & record$/)");
  await b.waitFor("!!document.getElementById('ws-pay-amount')");
  check("payment sheet prefilled from claim", (await b.eval("document.getElementById('ws-pay-amount').value")) === "1000.00" && (await b.eval("document.getElementById('ws-pay-ref').value")) === "412345678901");
  await t("__t.click(/^Save payment$/, __t.dialog())");
  await b.waitFor("!/Payments to confirm/.test(document.body.innerText)", 8000);
  const local = await b.eval("JSON.parse(localStorage.getItem('proupiqr-workspace-v1'))");
  check("confirmed claim recorded as payment with UTR", local.invoices.inv_00000001.payments.some((p) => p.reference === "412345678901" && p.amountPaise === 100000));
  check("claim acknowledged on server", (await b.eval("JSON.parse(localStorage.getItem('__links')).inv_00000001.claims.length")) === 0);

  // Plan usage and turning a link off.
  await t("__t.click(/^Settings$/)");
  await sleep(300);
  check("plan usage shown", /Pay links: 1 of 10 active on the Free plan/.test(await text()));
  await t("__t.click(/^Invoices/)");
  await t("[...document.querySelectorAll('li [aria-expanded]')][0].click(), true");
  await t("__t.click(/^Turn off$/)");
  await b.waitFor("!document.querySelector('input[id^=link-]')", 8000);
  check("turn off removes the link", (await b.eval("Object.keys(JSON.parse(localStorage.getItem('__links'))).length")) === 0);
  // Clients abroad (PR 4; this build has INTL_UI off, and foreign data that arrives by sync is still handled fully).
  const usdInvoice = { id: "inv_usd00001", number: "INV-0002", clientId: "cli_globex01", issueDate: "2026-10-01", dueDate: "2026-10-20", amountPaise: 120000, description: "", payments: [], reminders: [], voided: false, currency: "USD", createdAt: T, updatedAt: T };
  const abroad = { ...guest, clients: { ...guest.clients, cli_globex01: { id: "cli_globex01", name: "Globex LLC", phone: "+1 415 555 0100", email: "", gstin: "", createdAt: T, updatedAt: T } } };
  const sidecarOf = (settings) => JSON.stringify({ owner: null, intl: { invoices: { inv_usd00001: usdInvoice }, recurring: {}, clients: { cli_globex01: { currency: "USD", updatedAt: T } }, ...(settings ? { settings } : {}) } });
  await setup({ signedIn: true, owner: "owner-a" }, abroad);
  await b.eval(`localStorage.setItem('proupiqr-intl-v1:biz_primary', ${JSON.stringify(sidecarOf(null))}); true`);
  await b.go(BASE + "/app/?tab=invoices", 2500);
  await b.waitFor("[...document.querySelectorAll('button')].some(b => b.textContent === 'Synced ✓')");
  check("server copy carries the foreign section", (await server())?.intl?.invoices?.inv_usd00001?.currency === "USD");
  check("no device-only line against a server that keeps intl", !/saved on this device only right now/.test(await text()));
  await b.eval(`localStorage.setItem('__srvcfg', ${JSON.stringify(JSON.stringify({ signedIn: true, owner: "owner-a", noIntl: true }))}); true`);
  await b.go(BASE + "/app/?tab=invoices", 2500);
  await b.waitFor("/saved on this device only right now/.test(document.body.innerText)", 8000).catch(() => {});
  check("device-only line against a server that drops intl", /Foreign-currency invoices are saved on this device only right now\. They sync again after the next update\./.test(await text()));
  await b.eval(`localStorage.setItem('__srvcfg', ${JSON.stringify(JSON.stringify({ signedIn: true, owner: "owner-a" }))}); true`);
  await b.go(BASE + "/app/?tab=invoices", 2500);
  await b.waitFor("[...document.querySelectorAll('button')].some(b => b.textContent === 'Synced ✓')");
  await t("[...document.querySelectorAll('li [aria-expanded]')].find(r => r.textContent.includes('Globex')).click(), true");
  check("foreign row offers a bank-details pay link", !!(await t("!!__t.btn(/Create pay link — client sees amount \\+ bank details/)")));
  await t("__t.click(/Create pay link/)");
  await b.waitFor("/Add international payment details in Settings before sharing pay links/.test(document.body.innerText)", 8000);
  check("no_intl message without payment details", /Add international payment details in Settings before sharing pay links for foreign-currency invoices\./.test(await text()));
  await b.eval("localStorage.setItem('proupiqr-workspace-lang', 'hi'); true");
  await b.go(BASE + "/app/?tab=invoices", 2500);
  await sleep(500);
  await t("[...document.querySelectorAll('li [aria-expanded]')].find(r => r.textContent.includes('Globex')).click(), true");
  await t("__t.click(/पेमेंट लिंक बनाएँ — ग्राहक को राशि और बैंक जानकारी दिखेगी/)");
  await b.waitFor("/अंतरराष्ट्रीय भुगतान की जानकारी जोड़ें/.test(document.body.innerText)", 8000);
  check("no_intl message in Hindi", /विदेशी मुद्रा वाले इनवॉइस के पेमेंट लिंक भेजने से पहले सेटिंग्स में अंतरराष्ट्रीय भुगतान की जानकारी जोड़ें।/.test(await text()));
  await b.eval("localStorage.setItem('proupiqr-workspace-lang', 'en'); true");
  // With details (synced from a device where they were saved): the link is created and the reminder carries it.
  const settings = { on: true, accountName: "Sharma Tuition LLP", bankName: "HDFC Bank", swift: "HDFCINBB", account: "GB82WEST12345698765432", bankDetails: "", payUrl: "", exportUnderLut: false, lutArn: "", lutFy: "", updatedAt: T + 5 };
  await b.go(BASE + "/terms/", 600);
  await b.eval(`(() => { const s = JSON.parse(localStorage.getItem('proupiqr-intl-v1:biz_primary')); s.intl.settings = ${JSON.stringify(settings)}; localStorage.setItem('proupiqr-intl-v1:biz_primary', JSON.stringify(s)); return true; })()`);
  await b.go(BASE + "/app/?tab=invoices", 2500);
  await b.waitFor("[...document.querySelectorAll('button')].some(b => b.textContent === 'Synced ✓')");
  await t("[...document.querySelectorAll('li [aria-expanded]')].find(r => r.textContent.includes('Globex')).click(), true");
  await t("__t.click(/Create pay link/)");
  await b.waitFor("!!document.querySelector('input[id^=link-inv_usd]')", 8000);
  const usdUrl = await b.eval("document.querySelector('input[id^=link-inv_usd]')?.value");
  check("foreign pay link created once details are set", /\/i\/T\d+\/$/.test(usdUrl ?? ""), usdUrl);
  await t("__t.click(/^Remind$/)");
  await b.waitFor("!!document.getElementById('ws-reminder')");
  const usdMsg = await b.eval("document.getElementById('ws-reminder').value");
  check("foreign reminder carries the pay link, never UPI", usdMsg.includes(`Pay securely here: ${usdUrl}`) && /US\$1,200\.00/.test(usdMsg) && !/UPI|UTR/.test(usdMsg), usdMsg);
  check("reminder sheet explains the bank-details pay link", /With a pay link, the client sees the live amount and your bank details\./.test(await b.eval("document.querySelector('[role=dialog]').innerText")));
  await b.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  // A transfer-reference claim on the foreign link: shown in US$, recorded as a bank payment.
  await b.eval("(() => { const l = JSON.parse(localStorage.getItem('__links')); l.inv_usd00001.claims = [{ utr: 'WISE-REF-123456', amountPaise: 50000, at: Date.now(), currency: 'USD' }]; localStorage.setItem('__links', JSON.stringify(l)); })(), true");
  await b.go(BASE + "/app/", 3000);
  await b.waitFor("/Payments to confirm/.test(document.body.innerText)", 8000);
  check("foreign claim shown in US$ with the reference's last four", /Globex LLC says they paid US\$500\.00[\s\S]*Reference …3456/.test(await text()), (await text()).slice(0, 800));
  await t("__t.click(/^Confirm & record$/)");
  await b.waitFor("!!document.getElementById('ws-pay-amount')");
  check("Confirm & record opens a USD bank payment", (await b.eval("document.getElementById('ws-pay-mode').value")) === "bank" && (await b.eval("document.getElementById('ws-pay-amount').value")) === "500.00"
    && (await b.eval("document.getElementById('ws-pay-ref').value")) === "WISE-REF-123456" && /Amount received \(USD\)/.test(await b.eval("document.querySelector('[role=dialog]').innerText")));
  await t("__t.click(/^Save payment$/, __t.dialog())");
  await b.waitFor("!/Payments to confirm/.test(document.body.innerText)", 8000);
  const side = await b.eval("JSON.parse(localStorage.getItem('proupiqr-intl-v1:biz_primary'))");
  check("foreign claim recorded on the USD invoice", side.intl.invoices.inv_usd00001.payments.some((p) => p.amountPaise === 50000 && p.mode === "bank" && p.reference === "WISE-REF-123456"));
  // A statement claim from a client who also owes in US$ is applied to ₹ invoices only (§3.4).
  await b.eval("(() => { const l = JSON.parse(localStorage.getItem('__links')); l['stmt:cli_globex01'] = { token: 'S000000000000000000001', claims: [{ utr: '412345678902', amountPaise: 100000, at: Date.now() }] }; localStorage.setItem('__links', JSON.stringify(l)); })(), true");
  await b.go(BASE + "/app/", 3000);
  await b.waitFor("/Statement payments to confirm/.test(document.body.innerText)", 8000).catch(() => {});
  check("a statement claim for a client owing in US$ says it applies to ₹ invoices only", /Globex LLC says they paid ₹1,000 on their statement[\s\S]*Applied to ₹ invoices only\./.test(await text()), (await text()).slice(0, 800));
  check("book key never holds the foreign invoice", !(await b.eval("localStorage.getItem('proupiqr-workspace-v1')")).includes("USD"));
  check("no console errors (excluding blocked Clerk CDN)", b.errors.filter((e) => !/clerk|ERR_BLOCKED|Failed to load/i.test(e)).length === 0, b.errors.join(" | "));
} catch (error) {
  check("test script ran to completion", false, String(error).slice(0, 500));
} finally {
  b.close();
}
process.exit(check.report());
