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
// Clients abroad (docs/spec-foreign-clients.md §4.4): Riya also owes US$1,200.00, and Globex owes only US$.
const TOKEN2 = "Sg7pQ2xYz9AbCdEfGhIjKl";
const usdInv = (id, number, clientId, amount, due) => ({ ...inv(id, number, addDays(-20), due, amount), clientId, currency: "USD" });
const intl = {
  settings: { on: true, accountName: "Sharma Tuition LLP", bankName: "HDFC Bank", swift: "HDFCINBB", account: "GB82WEST12345698765432", bankDetails: "", payUrl: "https://wise.com/pay/me/sharmat", exportUnderLut: false, lutArn: "", lutFy: "", updatedAt: T },
  invoices: { inv_usd00031: usdInv("inv_usd00031", "TU-31", "cli_riya0001", 120000, addDays(-3)), inv_usd00032: usdInv("inv_usd00032", "TU-32", "cli_globex01", 75050, addDays(10)) },
  recurring: {},
  clients: {},
};
const mixedWs = { ...ws, clients: { ...ws.clients, cli_globex01: { id: "cli_globex01", name: "Globex LLC", phone: "", email: "", gstin: "", createdAt: T, updatedAt: T } }, intl };

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
  check("INR footer is static text, byte for byte as before (apostrophe unescaped)", html.includes("Money goes straight to Sharma Tuition's UPI account. Pro UPI QR never holds or processes payments, and only Sharma Tuition can mark these invoices paid."));
  let res = await fetch(`${DEV}/i/${TOKEN}/`, { method: "POST", redirect: "manual", headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: DEV, "X-Real-IP": "198.51.100.81" }, body: "utr=412345678901&amount=" });
  check("statement claim requires the amount", (await res.text()).includes("so it can be applied to your oldest dues first"));
  res = await fetch(`${DEV}/i/${TOKEN}/`, { method: "POST", redirect: "manual", headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: DEV, "X-Real-IP": "198.51.100.81" }, body: "utr=412345678901&amount=4500" });
  check("statement claim accepted", res.status === 303);
  const claims = (await admin("get", { list: `pl:claims:${TOKEN}` })).value;
  check("claim stored with amount", claims.length === 1 && JSON.parse(claims[0]).amountPaise === 450000);

  // Free owners can't create statement links (API returns 401 signed-out in tests; plan rule covered by unit tests).

  // --- The same client with a US$ invoice too, and a client who owes only US$ ---
  await admin("reset", {});
  await admin("set", { key: `ws:doc:${OWNER}`, value: JSON.stringify(mixedWs) });
  await admin("set", { key: `ws:rev:${OWNER}`, value: "1" });
  await admin("set", { key: `pl:tok:${TOKEN}`, value: JSON.stringify({ owner: OWNER, invoiceId: "stmt:cli_riya0001", createdAt: T }) });
  await admin("set", { key: `pl:tok:${TOKEN2}`, value: JSON.stringify({ owner: OWNER, invoiceId: "stmt:cli_globex01", createdAt: T }) });
  html = await (await fetch(`${DEV}/i/${TOKEN}/`)).text();
  check("mixed: ₹ section with its QR and total exactly as before", /am=6000\.00/.test(html) && /<img src="data:image\/png;base64,/.test(html) && html.includes("₹6,000 due") && html.indexOf("TU-21") < html.indexOf("TU-22"));
  check("mixed: a separate US$ section with the bank block", html.includes("USD invoices") && html.includes("TU-31") && html.includes("US$1,200.00 due") && html.includes("HDFCINBB") && html.includes("GB82 WEST 1234 5698 7654 32") && html.includes("Pay on wise.com"));
  check("mixed: no combined total, no 'Total due' headline", !/Total due/.test(html) && !html.includes("₹7,200") && !html.includes("₹18,000"));
  check("mixed: the header counts every currency's lines", /Statement · 3 unpaid invoices/.test(html));
  check("mixed: the ₹ form reads 'Amount paid (₹)', for the UPI part only", html.includes("Amount paid (₹)") && html.includes("For the UPI / ₹ part only."));
  check("mixed: overdue per currency", html.includes("₹6,000 overdue") && html.includes("US$1,200.00 overdue"));
  check("mixed: no client identity or descriptions", !/Riya|Globex|9876543210|Sept fees|Oct fees/.test(html), (html.match(/.{40}(?:Riya|Globex|9876543210|Sept fees|Oct fees).{40}/g) || []).join(" | "));
  res = await fetch(`${DEV}/i/${TOKEN}/`, { method: "POST", redirect: "manual", headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: DEV, "X-Real-IP": "198.51.100.82" }, body: "utr=512345678901&amount=4500" });
  const mixedClaims = (await admin("get", { list: `pl:claims:${TOKEN}` })).value.map((c) => JSON.parse(c));
  check("mixed: a statement claim is a ₹ claim (no currency)", res.status === 303 && mixedClaims.length === 1 && mixedClaims[0].amountPaise === 450000 && !("currency" in mixedClaims[0]), JSON.stringify(mixedClaims));
  html = await (await fetch(`${DEV}/i/${TOKEN2}/`)).text();
  check("US$ only: never 'Paid ✓' or 'Nothing is due right now'", !html.includes("Paid ✓") && !html.includes("Nothing is due right now") && html.includes("US$750.50 due"));
  check("US$ only: the header counts the US$ line", /Statement · 1 unpaid invoice</.test(html));
  check("US$ only: no QR, no UPI form, a bank-transfer note instead", !html.includes("upi://") && !/<img src="data:/.test(html) && !html.includes("<form") && html.includes("After a bank transfer, send the transfer reference to Sharma Tuition."));
  check("US$ only: the footer names the UPI, bank or payment account", html.includes("Money goes straight to Sharma Tuition's UPI, bank or payment account. Pro UPI QR never holds or processes payments, and only Sharma Tuition can mark these invoices paid."));
  res = await fetch(`${DEV}/i/${TOKEN2}/`, { method: "POST", redirect: "manual", headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: DEV, "X-Real-IP": "198.51.100.83" }, body: "utr=612345678901&amount=750" });
  const refused = await res.text();
  check("US$ only: a ₹ claim is refused, nothing stored", res.status === 200 && (await admin("get", { list: `pl:claims:${TOKEN2}` })).value.length === 0);
  check("US$ only: the refusal says why", /<p role="alert"[^>]*>After a bank transfer, send the transfer reference to Sharma Tuition\.<\/p>/.test(refused), (refused.match(/.{20}role="alert".{120}/) || [""])[0]);

  // A freelancer who bills only abroad (§4.2): no UPI ID at all, foreign details only. Nothing on the page is about UPI.
  await admin("reset", {});
  await admin("set", { key: `ws:doc:${OWNER}`, value: JSON.stringify({ ...mixedWs, business: { ...mixedWs.business, upiId: "" } }) });
  await admin("set", { key: `ws:rev:${OWNER}`, value: "1" });
  await admin("set", { key: `pl:tok:${TOKEN2}`, value: JSON.stringify({ owner: OWNER, invoiceId: "stmt:cli_globex01", createdAt: T }) });
  html = await (await fetch(`${DEV}/i/${TOKEN2}/`)).text();
  check("no UPI ID, US$ only: the US$ section and bank details", html.includes("US$750.50 due") && html.includes("TU-32") && html.includes("HDFCINBB"), html.slice(0, 200));
  check("no UPI ID, US$ only: no 'hasn't added a UPI ID', no Rupee heading, no UPI intent", !html.includes("hasn't added a UPI ID") && !html.includes("hasn&#39;t added a UPI ID") && !html.includes("Rupee invoices") && !html.includes("upi://") && !html.includes("<form"));
  check("no UPI ID, US$ only: the footer names the UPI, bank or payment account", html.includes("Sharma Tuition's UPI, bank or payment account."));

  // --- US$ and € invoices, with the business's own US$ account (byCurrency), and export lines (owner decision Q3) ---
  const TOKEN3 = "Sh7pQ2xYz9AbCdEfGhIjKl";
  const issued = addDays(-20);
  const fyStart = Number(issued.slice(5, 7)) >= 4 ? Number(issued.slice(0, 4)) : Number(issued.slice(0, 4)) - 1;
  const lutFy = `${fyStart}-${String((fyStart + 1) % 100).padStart(2, "0")}`;
  const usAccount = { accountName: "Sharma Tuition LLP", bankName: "Community Federal Savings Bank", swift: "CMFGUS33", account: "8312345678", bankDetails: "ACH routing 026073150", payUrl: "" };
  const multiWs = (exportLut = {}) => ({
    ...ws,
    business: { ...ws.business, gstin: "27ABCDE1234F1Z5" },
    clients: { ...ws.clients, cli_multi001: { id: "cli_multi001", name: "Initech GmbH", phone: "", email: "", gstin: "", createdAt: T, updatedAt: T } },
    intl: {
      settings: { ...intl.settings, byCurrency: { USD: usAccount }, exportUnderLut: true, lutArn: "AD2701260012345", lutFy },
      invoices: {
        inv_usd00041: { ...usdInv("inv_usd00041", "TU-41", "cli_multi001", 120000, addDays(5)), ...(exportLut.usd ? { exportLut: true } : {}) },
        inv_eur00042: { ...usdInv("inv_eur00042", "TU-42", "cli_multi001", 90000, addDays(7)), currency: "EUR", ...(exportLut.eur ? { exportLut: true } : {}) },
      },
      recurring: {},
      clients: {},
    },
  });
  const seedMulti = async (exportLut) => {
    await admin("reset", {});
    await admin("set", { key: `ws:doc:${OWNER}`, value: JSON.stringify(multiWs(exportLut)) });
    await admin("set", { key: `ws:rev:${OWNER}`, value: "1" });
    await admin("set", { key: `pl:tok:${TOKEN3}`, value: JSON.stringify({ owner: OWNER, invoiceId: "stmt:cli_multi001", createdAt: T }) });
    return (await fetch(`${DEV}/i/${TOKEN3}/`)).text();
  };
  html = await seedMulti();
  const sectionOf = (page, currency) => { const at = page.indexOf(`aria-label="${currency} invoices"`); return at < 0 ? "" : page.slice(at, page.indexOf("</section>", at)); };
  const usd = sectionOf(html, "USD");
  const eur = sectionOf(html, "EUR");
  check("per-currency details: the US$ section shows the US$ account only", usd.includes("TU-41") && usd.includes("CMFGUS33") && usd.includes("8312345678") && usd.includes("ACH routing 026073150") && !usd.includes("HDFCINBB") && !usd.includes("Pay on"), usd.slice(0, 300));
  check("per-currency details: the € section shows the default details and link", eur.includes("TU-42") && eur.includes("€900.00") && eur.includes("HDFCINBB") && eur.includes("GB82 WEST 1234 5698 7654 32") && eur.includes("Pay on wise.com") && !eur.includes("CMFGUS33"), eur.slice(0, 300));
  const afterSections = html.slice(html.lastIndexOf("</section>"), html.indexOf("After a bank transfer"));
  check("per-currency details: no shared block below the sections", afterSections.length > 0 && !/HDFCINBB|CMFGUS33|Pay on/.test(afterSections), afterSections.slice(0, 300));
  check("no export line when no invoice is marked as an export", !html.includes("LETTER OF UNDERTAKING"));
  html = await seedMulti({ usd: true });
  check("one of two foreign invoices is an export: the line names it", html.includes("TU-41: SUPPLY MEANT FOR EXPORT/SUPPLY TO SEZ UNIT OR SEZ DEVELOPER FOR AUTHORISED OPERATIONS UNDER BOND OR LETTER OF UNDERTAKING WITHOUT PAYMENT OF INTEGRATED TAX (LUT ARN AD2701260012345)") && !html.includes("TU-42: SUPPLY"), (html.match(/.{30}SUPPLY MEANT.{20}/) || [""])[0]);
  html = await seedMulti({ usd: true, eur: true });
  check("every foreign invoice is an export: the endorsement without invoice numbers", html.includes(">SUPPLY MEANT FOR EXPORT/SUPPLY TO SEZ UNIT OR SEZ DEVELOPER FOR AUTHORISED OPERATIONS UNDER BOND OR LETTER OF UNDERTAKING WITHOUT PAYMENT OF INTEGRATED TAX (LUT ARN AD2701260012345)<") && !/TU-4\d(, TU-4\d)?: SUPPLY/.test(html), (html.match(/.{30}SUPPLY MEANT.{20}/) || [""])[0]);

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
    // intl: 1 like a PR 1+ server, which keeps (and echoes) the book's foreign section.
    if (u.includes('/api/v1/workspace')) return json({ workspace: init.body ? JSON.parse(init.body).workspace : JSON.parse(localStorage.getItem('proupiqr-workspace-v1')), rev: 1, owner: 'o', intl: 1 });
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
    // The book also holds Riya's US$ invoice (in its sidecar, as PR 1+ code stores it): this build doesn't show it, and a
    // statement claim never touches it.
    // Globex owes only US$ (review round 1: its statement link offers bank details, not a UPI button).
    const sidecar = JSON.stringify({ intl: { ...intl, invoices: { inv_usd00031: intl.invoices.inv_usd00031, inv_usd00032: intl.invoices.inv_usd00032 } }, owner: "o" });
    const { intl: _uiIntl, ...uiBook } = mixedWs;
    await b.eval(`localStorage.clear(); localStorage.setItem('proupiqr-workspace-owner', 'o'); localStorage.setItem('proupiqr-workspace-v1', ${JSON.stringify(JSON.stringify(uiBook))}); localStorage.setItem('proupiqr-intl-v1:biz_primary', ${JSON.stringify(sidecar)}); localStorage.setItem('__plan', 'free'); true`);
    await b.go(`${STATIC}/app/?tab=clients`, 3500);
    await b.waitFor("/Statement link for all dues/.test(document.body.innerText)", 8000);
    check("free plan sees the Pro upsell on clients", await b.eval("[...document.querySelectorAll('a')].some(a => a.textContent.includes('Statement link for all dues') && a.getAttribute('href') === '/app/?tab=settings&upgrade=monthly')"));
    await b.eval("localStorage.setItem('__plan', 'pro'); true");
    await b.go(`${STATIC}/app/?tab=clients`, 3500);
    await b.waitFor("[...document.querySelectorAll('button')].some(b => b.textContent.includes('Share statement link'))", 8000);
    const linkButton = (name) => b.eval(`[...document.querySelectorAll('li')].find((li) => li.querySelector('button')?.textContent.includes(${JSON.stringify(name)}))?.querySelector('button.text-leaf')?.textContent ?? null`);
    check("a client owing ₹ is offered the UPI statement link", (await linkButton("Riya Kapoor")) === "Share statement link — all dues + one UPI button", await linkButton("Riya Kapoor"));
    check("a client owing only US$ is offered bank details, not a UPI button", (await linkButton("Globex LLC")) === "Share statement link — all dues + bank details", await linkButton("Globex LLC"));
    await t("__t.click(/one UPI button/)");
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
    const side = await b.eval("JSON.parse(localStorage.getItem('proupiqr-intl-v1:biz_primary') || 'null')");
    check("the claim is applied to ₹ invoices only: the US$ invoice is untouched", side?.intl?.invoices?.inv_usd00031?.payments?.length === 0 && side.intl.invoices.inv_usd00031.currency === "USD", JSON.stringify(side).slice(0, 300));
    check("claim acknowledged", (await b.eval("JSON.parse(localStorage.getItem('__links'))['stmt:cli_riya0001'].claims.length")) === 0);
    check("no console errors (excluding blocked Clerk)", b.errors.filter((e) => !/clerk|ERR_BLOCKED|Failed to load/i.test(e)).length === 0, b.errors.join(" | "));
  } finally {
    b.close();
  }
} catch (error) {
  check("test script ran to completion", false, String(error).slice(0, 500));
}
process.exit(check.report());
