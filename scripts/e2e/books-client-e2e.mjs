// Client storage and sync for several businesses (PR 3, business UI still off): an old single workspace
// loads and syncs unchanged, extra-book keys planted in localStorage are never touched by the primary path,
// a 404 from /api/v1/workspace/books/ falls back to primary-only sync without deleting anything, and with
// the books routes present an unchanged workspace costs one request.
import { checker, helpers, sleep, startBrowser } from "./cdp-lib.mjs";

const BASE = process.env.BASE || "http://localhost:4400";
const b = await startBrowser();
const check = checker();
const t = async (js) => { await b.eval(helpers); return b.eval(js); };
const text = () => b.eval("document.body.innerText");

// Clerk stub plus an emulated server: the primary route always; the books routes only in mode "books"
// (mode "legacy" answers 404 like a server from before several businesses). Per-record merge as the real
// server does; revisions per slot; the index is add-once (server createdAt) and tombstones win.
await b.send("Network.setBlockedURLs", { urls: ["*clerk.accounts.dev*", "*clerk.browser.js*", "*@clerk/clerk-js*"] });
await b.send("Page.addScriptToEvaluateOnNewDocument", { source: `
(() => {
  const srv = () => JSON.parse(localStorage.getItem('__srv') || '{"mode":"legacy","owner":"${"a".repeat(32)}","docs":{},"index":null}');
  const save = (s) => localStorage.setItem('__srv', JSON.stringify(s));
  const stub = { loaded: true, user: { id: 'u' }, session: { getToken: async () => 'tok' }, signOut: async () => {} };
  Object.defineProperty(window, 'Clerk', { get: () => stub, set: () => {}, configurable: false });
  const pick = (a, b) => !a ? b : !b ? a : a.updatedAt !== b.updatedAt ? (a.updatedAt > b.updatedAt ? a : b) : (b.deletedAt && !a.deletedAt ? b : a);
  const merge = (a, b) => {
    const out = { version: 1, business: b.business.updatedAt > a.business.updatedAt ? b.business : a.business, clients: {}, invoices: {}, recurring: {} };
    for (const k of ['clients', 'invoices', 'recurring']) for (const id of new Set([...Object.keys(a[k] || {}), ...Object.keys(b[k] || {})])) out[k][id] = pick((a[k] || {})[id], (b[k] || {})[id]);
    return out;
  };
  const empty = () => ({ version: 1, business: { name: '', upiId: '', phone: '', gstin: '', invoicePrefix: 'INV-', updatedAt: 0 }, clients: {}, invoices: {}, recurring: {} });
  const json = (v, s = 200) => new Response(JSON.stringify(v), { status: s, headers: { 'Content-Type': 'application/json' } });
  const idx = (s) => s.index || { v: 1, books: { biz_primary: { id: 'biz_primary', createdAt: 0 } } };
  const live = (i) => Object.values(i.books).filter((m) => m.deletedAt === undefined).map((m) => m.id);
  const revs = (s) => Object.fromEntries(live(idx(s)).map((id) => [id, (s.docs[id] || {}).rev || 0]));
  const real = window.fetch.bind(window);
  window.__calls = [];
  window.fetch = async (url, init = {}) => {
    const u = String(url), method = init.method || 'GET';
    if (u.includes('/api/v1/paylinks')) return json({ links: [], plan: { id: 'free', activePaylinks: 10, used: 0 } });
    if (u.includes('/api/v1/billing')) return json({ plan: { id: 'free', activePaylinks: 10 }, subscription: null, billingAvailable: false });
    if (u.includes('/api/v1/push')) return json({ available: false, publicKey: null });
    if (!u.includes('/api/v1/workspace')) return real(url, init);
    const body = init.body ? JSON.parse(init.body) : null;
    window.__calls.push({ method, url: u, body });
    const s = srv();
    const put = (id, incoming) => {
      const cur = s.docs[id] || { ws: empty(), rev: 0 };
      const next = merge(cur.ws, incoming);
      s.docs[id] = JSON.stringify(next) === JSON.stringify(cur.ws) && cur.rev ? cur : { ws: next, rev: cur.rev + 1 };
      save(s);
      return s.docs[id];
    };
    if (u === '/api/v1/workspace/') {
      // A server with the books routes is PR 1 or later: its replies carry intl: 1 (docs/spec-foreign-clients.md §2.6).
      const fx = s.mode === 'books' ? { intl: 1 } : {};
      if (method === 'PUT') { const d = put('biz_primary', body.workspace); return json({ workspace: d.ws, rev: d.rev, owner: s.owner, ...fx }); }
      const d = s.docs.biz_primary || { ws: empty(), rev: 0 };
      return json({ workspace: d.ws, rev: d.rev, owner: s.owner, ...fx });
    }
    if (s.mode !== 'books') return new Response('<!doctype html><title>404</title>', { status: 404, headers: { 'Content-Type': 'text/html' } });
    if (u === '/api/v1/workspace/books/') {
      if (method === 'PUT') {
        const i = idx(s);
        for (const [id, m] of Object.entries(body.index.books)) {
          if (!i.books[id] && m.deletedAt === undefined) i.books[id] = { id, createdAt: Date.now() };
          else if (i.books[id] && m.deletedAt !== undefined && i.books[id].deletedAt === undefined && id !== 'biz_primary') i.books[id].deletedAt = Date.now();
        }
        s.index = i; save(s);
      }
      return json({ index: idx(s), revs: revs(s), owner: s.owner, plan: { id: 'pro', businesses: 20 }, ...(method === 'PUT' ? { rejected: [] } : {}) });
    }
    const id = u.split('/').filter(Boolean).pop();
    if (!idx(s).books[id]) return json({ code: 'unknown_business' }, 404);
    if (idx(s).books[id].deletedAt !== undefined) return json({ code: 'business_deleted' }, 410);
    if (method === 'PUT') { const d = put(id, body.workspace); return json({ workspace: d.ws, rev: d.rev, owner: s.owner, businessId: id, intl: 1 }); }
    const d = s.docs[id] || { ws: empty(), rev: 0 };
    return json({ workspace: d.ws, rev: d.rev, owner: s.owner, businessId: id, intl: 1 });
  };
})();
` });

const OWNER = "a".repeat(32);
const B = "biz_bbbbbbbb";
const T = Date.now() - 86_400_000;
const inv = (id, number, amountPaise) => ({ id, number, clientId: "cli_aaaaaaaa", issueDate: "2026-10-01", dueDate: "2026-10-20", amountPaise, description: "", payments: [], reminders: [], voided: false, createdAt: T, updatedAt: T });
const primary = {
  version: 1,
  business: { name: "Sharma Tuition", upiId: "sharma@okaxis", phone: "", gstin: "", invoicePrefix: "INV-", updatedAt: T },
  clients: { cli_aaaaaaaa: { id: "cli_aaaaaaaa", name: "Rohan", phone: "", email: "", gstin: "", createdAt: T, updatedAt: T } },
  invoices: { inv_00000001: inv("inv_00000001", "INV-0001", 300000) },
};
const bookTwo = {
  version: 1,
  business: { name: "Book Two Traders", upiId: "two@okaxis", phone: "", gstin: "", invoicePrefix: "BT-", updatedAt: T },
  clients: { cli_aaaaaaaa: { id: "cli_aaaaaaaa", name: "Rohan", phone: "", email: "", gstin: "", createdAt: T, updatedAt: T } },
  invoices: { inv_00000001: inv("inv_00000001", "BT-0001", 777700) },
  recurring: {},
};
const plantedIndex = { v: 1, owner: OWNER, books: { biz_primary: { id: "biz_primary", createdAt: 0 }, [B]: { id: B, createdAt: T } } };
const synced = "[...document.querySelectorAll('button')].some(b => b.textContent === 'Synced ✓')";

/** Seed from a page without the workspace island, so no running sync engine races the new data. */
async function setup(mode, { extra = false, docs = {} } = {}) {
  await b.go(BASE + "/terms/", 500);
  await b.eval(`localStorage.clear();
    localStorage.setItem('__srv', ${JSON.stringify(JSON.stringify({ mode, owner: OWNER, docs, index: null }))});
    localStorage.setItem('proupiqr-workspace-owner', '${OWNER}');
    localStorage.setItem('proupiqr-workspace-v1', ${JSON.stringify(JSON.stringify(primary))});
    ${extra ? `localStorage.setItem('proupiqr-book-v1:${B}', ${JSON.stringify(JSON.stringify(bookTwo))});
    localStorage.setItem('proupiqr-books-v1', ${JSON.stringify(JSON.stringify(plantedIndex))});` : ""}
    true`);
}
const calls = () => b.eval("window.__calls.map(c => c.method + ' ' + c.url)");
const storage = (key) => b.eval(`localStorage.getItem(${JSON.stringify(key)})`);
const serverDoc = (id) => b.eval(`(JSON.parse(localStorage.getItem('__srv')).docs[${JSON.stringify(id)}] || {}).ws || null`);

try {
  // 1. An old single workspace on a server without the books routes (404): legacy, primary only, as before.
  await setup("legacy");
  await b.go(BASE + "/app/", 3000);
  await b.waitFor(synced);
  let log = await calls();
  check("legacy: /books/ answers 404, then the primary syncs through /api/v1/workspace/", log[0] === "GET /api/v1/workspace/books/" && log[1] === "GET /api/v1/workspace/" && log.includes("PUT /api/v1/workspace/"), log.join(", "));
  check("legacy: no book route called", !log.some((c) => /\/books\/biz_/.test(c)));
  check("legacy: the workspace syncs unchanged", (await serverDoc("biz_primary"))?.invoices?.inv_00000001?.amountPaise === 300000 && (await serverDoc("biz_primary")).business.name === "Sharma Tuition");
  check("legacy: primary key still the v1 workspace", JSON.parse(await storage("proupiqr-workspace-v1")).invoices.inv_00000001.number === "INV-0001");
  check("legacy: UI unchanged", /Sharma Tuition/.test(await text()) && /₹3,000/.test(await text()));
  check("legacy: writes carry expectedOwner", await b.eval(`window.__calls.filter(c => c.method === 'PUT').every(c => c.body.expectedOwner === '${OWNER}')`));

  // 2. Extra-book keys planted in localStorage, legacy server: the primary path never touches them.
  await setup("legacy", { extra: true });
  const indexBefore = await storage("proupiqr-books-v1");
  const bookBefore = await storage(`proupiqr-book-v1:${B}`);
  await b.go(BASE + "/app/?tab=invoices", 3000);
  await b.waitFor(synced);
  check("planted: only the primary is shown", /Sharma Tuition/.test(await text()) && !/Book Two Traders|BT-0001|7,777/.test(await text()));
  await t("[...document.querySelectorAll('li [aria-expanded]')][0].click(), true");
  await t("__t.click(/^Record payment$/)");
  await b.waitFor("!!document.getElementById('ws-pay-amount')");
  await t("__t.set('ws-pay-amount', '1000'), __t.click(/^Save payment$/, __t.dialog())");
  await b.waitFor("!document.querySelector('[role=dialog]')");
  await sleep(2600);
  log = await calls();
  check("planted: the edit reaches the primary slot", (await serverDoc("biz_primary"))?.invoices?.inv_00000001?.payments?.length === 1);
  check("planted: Book Two never reaches the primary slot", !JSON.stringify(await serverDoc("biz_primary")).includes("Book Two") && !JSON.stringify(await serverDoc("biz_primary")).includes("BT-0001"));
  check("planted: extra-book key byte-identical", (await storage(`proupiqr-book-v1:${B}`)) === bookBefore);
  const indexAfter = JSON.parse(await storage("proupiqr-books-v1"));
  check("planted: index keeps Book Two live", indexAfter.books[B] && indexAfter.books[B].deletedAt === undefined && JSON.stringify(indexAfter.books) === JSON.stringify(JSON.parse(indexBefore).books));
  check("planted: primary key never holds Book Two", !(await storage("proupiqr-workspace-v1")).includes("Book Two"));
  check("404 fallback: no book route, nothing deleted", !log.some((c) => /\/books\/biz_/.test(c)) && (await b.eval("Object.keys(localStorage).filter(k => k.startsWith('proupiqr-')).sort().join(',')")).includes(`proupiqr-book-v1:${B}`));
  // Reload: still there, still untouched.
  await b.go(BASE + "/app/", 3000);
  await b.waitFor(synced);
  check("404 fallback survives a reload", (await storage(`proupiqr-book-v1:${B}`)) === bookBefore);

  // 3. With the books routes: an old single workspace syncs unchanged, then a reload with no changes costs one request.
  await setup("books");
  await b.go(BASE + "/app/", 3000);
  await b.waitFor(synced);
  await sleep(500);
  log = await calls();
  check("books: primary through /api/v1/workspace/ only", log.includes("PUT /api/v1/workspace/") && !log.some((c) => /\/books\/biz_/.test(c)), log.join(", "));
  check("books: sync meta recorded", JSON.parse((await storage("proupiqr-book-sync-v1")) || "{}").books?.biz_primary?.rev === 1);
  check("books: workspace content unchanged", JSON.parse(await storage("proupiqr-workspace-v1")).invoices.inv_00000001.amountPaise === 300000);
  await b.go(BASE + "/app/", 3000);
  await b.waitFor(synced);
  await sleep(500);
  log = await calls();
  check("books: unchanged reload is one request", log.length === 1 && log[0] === "GET /api/v1/workspace/books/", log.join(", "));

  // 4. With the books routes, a planted extra book is registered and synced through its own route; the primary key isn't touched by it.
  await setup("books", { extra: true });
  await b.go(BASE + "/app/", 3000);
  await b.waitFor(synced);
  await sleep(800);
  log = await calls();
  check("books: extra book registered then pushed to its own route", log.includes("PUT /api/v1/workspace/books/") && log.includes(`PUT /api/v1/workspace/books/${B}/`), log.join(", "));
  check("books: extra book on its own server slot", (await serverDoc(B))?.business?.name === "Book Two Traders" && !JSON.stringify(await serverDoc("biz_primary")).includes("Book Two"));
  check("books: UI still shows only the first business", /Sharma Tuition/.test(await text()) && !/Book Two Traders/.test(await text()));
  check("books: primary key never holds Book Two", !(await storage("proupiqr-workspace-v1")).includes("Book Two"));

  check("no console errors (excluding blocked Clerk CDN)", b.errors.filter((e) => !/clerk|ERR_BLOCKED|Failed to load/i.test(e)).length === 0, b.errors.join(" | "));
} catch (error) {
  check("test script ran to completion", false, String(error).slice(0, 500));
} finally {
  b.close();
}
process.exit(check.report());
