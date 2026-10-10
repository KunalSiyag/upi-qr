import { checker, helpers, sleep, startBrowser } from "./cdp-lib.mjs";

const BASE = process.env.BASE || "http://localhost:4400";
const b = await startBrowser();
const check = checker();
const t = async (js) => { await b.eval(helpers); return b.eval(js); };
const text = () => b.eval("document.body.innerText");
try {
  await b.send("Network.setBlockedURLs", { urls: ["*clerk.accounts.dev*", "*clerk.browser.js*"] });
  await b.send("Page.addScriptToEvaluateOnNewDocument", { source: `
(() => {
  const signedIn = localStorage.getItem('__signedIn') === '1';
  const stub = { loaded: true, user: signedIn ? { id: 'u' } : null, session: { getToken: async () => signedIn ? 'tok' : null }, signOut: async () => {} };
  Object.defineProperty(window, 'Clerk', { get: () => stub, set: () => {}, configurable: false });
  const json = (v, s = 200) => new Response(JSON.stringify(v), { status: s, headers: { 'Content-Type': 'application/json' } });
  const real = window.fetch.bind(window);
  window.fetch = async (url, init = {}) => {
    const u = String(url), m = init.method || 'GET';
    if (!signedIn && u.includes('/api/v1/')) return json({ error: 'Sign in' }, 401);
    if (u.includes('/api/v1/workspace')) return json({ workspace: init.body ? JSON.parse(init.body).workspace : JSON.parse(localStorage.getItem('proupiqr-workspace-v1')), rev: 1, owner: 'o' });
    if (u.includes('/api/v1/paylinks')) {
      if (m === 'GET') return json({ links: [], plan: { id: 'free', activePaylinks: 10, used: 10, statementLinks: false } });
      return json({ error: 'Free accounts can keep 10 pay links active. Revoke links for paid invoices to make room.', code: 'limit' }, 402);
    }
    if (u.includes('/api/v1/billing')) return json({ plan: { id: 'free', activePaylinks: 10 }, subscription: null, billingAvailable: false });
    if (u.includes('/api/v1/push')) return json({ available: false, publicKey: null });
    return real(url, init);
  };
})();` });

  // Checklist for a brand-new user.
  await b.go(BASE + "/terms/", 300);
  await b.eval("localStorage.clear(); true");
  await b.go(BASE + "/app/", 12000);
  await b.waitFor("/Get paid faster in 5 steps/.test(document.body.innerText)", 8000);
  check("checklist shows for new users", /0 of 5 done/.test(await text()));
  await t("__t.click(/^Add an invoice you're waiting on$/)");
  check("checklist step opens the invoice sheet", await b.waitFor("!!document.getElementById('ws-amount')", 5000));
  await t("__t.set('ws-client', 'Rohan'), __t.set('ws-amount', '1200'), __t.click(/^Add invoice$/, __t.dialog())");
  await b.waitFor("!document.querySelector('[role=dialog]')", 5000);
  check("progress updates", /1 of 5 done/.test(await text()));
  await t("__t.click(/^Hide this$/)");
  await sleep(200);
  check("hide works", !/Get paid faster in 5 steps/.test(await text()));
  await b.go(BASE + "/app/", 12000);
  check("hidden checklist stays hidden", !/Get paid faster in 5 steps/.test(await text()));

  // Pay link limit → Pro upsell instead of a bare error.
  await b.eval("localStorage.setItem('__signedIn', '1'); localStorage.setItem('proupiqr-workspace-owner', 'o'); true");
  await b.go(BASE + "/app/?tab=invoices", 3000);
  await t("[...document.querySelectorAll('li [aria-expanded]')][0].click(), true");
  await b.waitFor("[...document.querySelectorAll('button')].some(b => /Create pay link/.test(b.textContent))", 8000);
  await t("__t.click(/Create pay link/)");
  check("limit shows the Pro upsell", await b.waitFor("/You've used all 10 free pay links/.test(document.body.innerText)", 8000));
  check("upsell links to the plan", await b.eval("[...document.querySelectorAll('a')].some(a => a.textContent === 'See Pro' && a.getAttribute('href') === '/app/?tab=settings&upgrade=monthly')"));
  await t("__t.click(/^Not now$/)");
  check("upsell can be dismissed", !/You've used all 10 free pay links/.test(await text()));
  check("no console errors (excluding blocked Clerk)", b.errors.filter((e) => !/clerk|ERR_BLOCKED|Failed to load/i.test(e)).length === 0, b.errors.join(" | "));
} catch (error) {
  check("test script ran to completion", false, String(error).slice(0, 500));
} finally {
  b.close();
}
process.exit(check.report());
