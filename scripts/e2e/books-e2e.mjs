// Several businesses in /app/ (docs/spec-multi-business.md §9.3): the business switcher, add / switch /
// rename / delete, plan prompts (signed out, Free, phone width), read-only businesses after a downgrade,
// invoices and pay links that never mix between businesses, reminders quoting the active business's UPI ID,
// ?business= deep links, the generator bridge and its "Which business is this for?" picker, and the
// selectors older suites rely on. Static build + an emulated server in the page (no real KV or Clerk).
import { readFileSync } from "node:fs";
import { checker, helpers, sleep, startBrowser } from "./cdp-lib.mjs";

// The business UI ships behind BOOKS_UI (PR 4 merges with it off). Nothing to test while it is off.
const store = readFileSync(new URL("../../src/lib/workspace/localStore.ts", import.meta.url), "utf8");
if (!/export const BOOKS_UI = true;/.test(store)) {
  console.log("books-e2e: BOOKS_UI is off in this build, so there is no business UI to test (skipped).");
  process.exit(0);
}

const BASE = process.env.BASE || "http://localhost:4400";
const b = await startBrowser();
const check = checker();
const t = async (js) => { await b.eval(helpers); return b.eval(js); };
const text = () => b.eval("document.body.innerText");

// Clerk stub plus an emulated server kept in localStorage['__srv']: the primary route, the books routes
// (add-once index with the plan's business limit, tombstones win, 402 plan_read_only for books ranked past
// the limit), pay links with book-qualified keys, billing and push. Per-record merge like the real server.
await b.send("Network.setBlockedURLs", { urls: ["*clerk.accounts.dev*", "*clerk.browser.js*", "*@clerk/clerk-js*"] });
await b.send("Page.addScriptToEvaluateOnNewDocument", { source: `
(() => {
  const srv = () => JSON.parse(localStorage.getItem('__srv') || '{"signedIn":false,"owner":"${"a".repeat(32)}","plan":{"id":"free","businesses":1},"docs":{},"index":null,"links":[]}');
  const save = (s) => localStorage.setItem('__srv', JSON.stringify(s));
  const stub = {
    get loaded() { return true; },
    get user() { return srv().signedIn ? { id: 'u' } : null; },
    session: { getToken: async () => srv().signedIn ? 'tok' : null },
    signOut: async () => {},
  };
  Object.defineProperty(window, 'Clerk', { get: () => stub, set: () => {}, configurable: false });
  const pick = (a, b) => !a ? b : !b ? a : a.updatedAt !== b.updatedAt ? (a.updatedAt > b.updatedAt ? a : b) : (b.deletedAt && !a.deletedAt ? b : a);
  const merge = (a, b) => {
    const out = { version: 1, business: b.business.updatedAt > a.business.updatedAt ? b.business : a.business, clients: {}, invoices: {}, recurring: {} };
    for (const k of ['clients', 'invoices', 'recurring']) for (const id of new Set([...Object.keys(a[k] || {}), ...Object.keys(b[k] || {})])) out[k][id] = pick((a[k] || {})[id], (b[k] || {})[id]);
    return out;
  };
  const empty = () => ({ version: 1, business: { name: '', upiId: '', phone: '', gstin: '', invoicePrefix: 'INV-', udyam: '', updatedAt: 0 }, clients: {}, invoices: {}, recurring: {} });
  const json = (v, s = 200) => new Response(JSON.stringify(v), { status: s, headers: { 'Content-Type': 'application/json' } });
  const idx = (s) => s.index || { v: 1, books: { biz_primary: { id: 'biz_primary', createdAt: 0 } } };
  const live = (i) => Object.values(i.books).filter((m) => m.deletedAt === undefined).sort((a, b) => (a.id === 'biz_primary' ? -1 : b.id === 'biz_primary' ? 1 : a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1))).map((m) => m.id);
  const revs = (s) => Object.fromEntries(live(idx(s)).map((id) => [id, (s.docs[id] || {}).rev || 0]));
  const readOnly = (s, id) => id !== 'biz_primary' && live(idx(s)).indexOf(id) >= s.plan.businesses;
  const real = window.fetch.bind(window);
  window.__calls = [];
  window.fetch = async (url, init = {}) => {
    const u = String(url), method = init.method || 'GET';
    if (!u.includes('/api/v1/')) return real(url, init);
    const s = srv();
    const body = init.body ? JSON.parse(init.body) : null;
    window.__calls.push({ method, url: u, body });
    if (u.includes('/api/v1/push')) return json({ available: false, publicKey: null });
    if (!s.signedIn) return json({ error: 'Sign in' }, 401);
    if (u.includes('/api/v1/billing')) return json({ plan: { id: s.plan.id, activePaylinks: s.plan.id === 'pro' ? 10000 : 10, businesses: s.plan.businesses }, subscription: null, billingAvailable: false });
    if (u.includes('/api/v1/paylinks')) {
      if (method === 'GET') return json({ links: s.links.map((l) => ({ invoiceId: l.key, token: l.token, claims: l.claims || [] })), plan: { id: s.plan.id, activePaylinks: s.plan.id === 'pro' ? 10000 : 10, used: s.links.length, businesses: s.plan.businesses } });
      if (method === 'DELETE') {
        const token = u.split('?')[0].split('/').filter(Boolean).pop();
        if (body && body.scope === 'claims') s.links.forEach((l) => { if (l.token === token) l.claims = []; });
        else s.links = s.links.filter((l) => l.token !== token);
        save(s);
        return json({ ok: true });
      }
      const book = u.includes('/books/') ? u.split('/').filter(Boolean).pop() : 'biz_primary';
      if (readOnly(s, book)) return json({ error: 'read-only', code: 'plan_read_only' }, 402);
      const subject = body.clientId ? 'stmt:' + body.clientId : body.invoiceId;
      const key = book === 'biz_primary' ? subject : book + '/' + subject;
      let link = s.links.find((l) => l.key === key);
      if (!link) { link = { key, token: 'tok' + Math.random().toString(36).slice(2, 10), claims: [] }; s.links.push(link); save(s); }
      return json({ token: link.token, created: true }, 201);
    }
    if (!u.includes('/api/v1/workspace')) return json({ error: 'not found' }, 404);
    const put = (id, incoming) => {
      const cur = s.docs[id] || { ws: empty(), rev: 0 };
      const next = merge(cur.ws, incoming);
      s.docs[id] = JSON.stringify(next) === JSON.stringify(cur.ws) && cur.rev ? cur : { ws: next, rev: cur.rev + 1 };
      save(s);
      return s.docs[id];
    };
    if (u === '/api/v1/workspace/') {
      if (method === 'PUT') { const d = put('biz_primary', body.workspace); return json({ workspace: d.ws, rev: d.rev, owner: s.owner }); }
      const d = s.docs.biz_primary || { ws: empty(), rev: 0 };
      return json({ workspace: d.ws, rev: d.rev, owner: s.owner });
    }
    const plan = { id: s.plan.id, businesses: s.plan.businesses };
    if (u === '/api/v1/workspace/books/') {
      const rejected = [];
      if (method === 'PUT') {
        if (s.failIndexPut) return json({ error: 'unavailable' }, 503);
        const i = idx(s);
        for (const [id, m] of Object.entries(body.index.books)) {
          if (!i.books[id] && m.deletedAt === undefined) {
            if (live(i).length >= s.plan.businesses) { rejected.push(id); continue; }
            i.books[id] = { id, createdAt: Date.now() };
          } else if (i.books[id] && m.deletedAt !== undefined && i.books[id].deletedAt === undefined && id !== 'biz_primary') {
            i.books[id].deletedAt = Date.now();
            delete s.docs[id];
            s.links = s.links.filter((l) => !l.key.startsWith(id + '/'));
          }
        }
        s.index = i; save(s);
      }
      return json({ index: idx(s), revs: revs(s), owner: s.owner, plan, ...(method === 'PUT' ? { rejected, ...(rejected.length ? { code: 'business_limit' } : {}) } : {}) });
    }
    const id = u.split('/').filter(Boolean).pop();
    if (!idx(s).books[id]) return json({ code: 'unknown_business' }, 404);
    if (idx(s).books[id].deletedAt !== undefined) return json({ code: 'business_deleted' }, 410);
    if (method === 'PUT') {
      if (readOnly(s, id)) return json({ error: 'read-only', code: 'plan_read_only' }, 402);
      const d = put(id, body.workspace); return json({ workspace: d.ws, rev: d.rev, owner: s.owner, businessId: id });
    }
    const d = s.docs[id] || { ws: empty(), rev: 0 };
    return json({ workspace: d.ws, rev: d.rev, owner: s.owner, businessId: id });
  };
})();
` });

const OWNER = "a".repeat(32);
const B = "biz_bbbbbbbb";
const C = "biz_cccccccc";
const T = Date.now() - 86_400_000;
const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
const inv = (id, number, amountPaise, clientId = "cli_aaaaaaaa") => ({ id, number, clientId, issueDate: "2026-10-01", dueDate: "2026-10-05", amountPaise, description: "", payments: [], reminders: [], voided: false, createdAt: T, updatedAt: T });
const client = (id, name) => ({ id, name, phone: "9876543210", email: "", gstin: "", createdAt: T, updatedAt: T });
const book = (name, upiId, prefix, invoices, clients) => ({
  version: 1,
  business: { name, upiId, phone: "", gstin: "", invoicePrefix: prefix, udyam: "", updatedAt: T },
  clients, invoices, recurring: {},
});
const primary = book("Sharma Tuition", "sharma@okaxis", "INV-", { inv_00000001: inv("inv_00000001", "INV-0001", 300000) }, { cli_aaaaaaaa: client("cli_aaaaaaaa", "Rohan Mehta") });
const bookTwo = book("Book Two Traders", "two@okaxis", "BT-", { inv_00000001: inv("inv_00000001", "BT-0001", 777700, "cli_bbbbbbbb") }, { cli_bbbbbbbb: client("cli_bbbbbbbb", "Priya Kapoor") });
const bookThree = book("Third Shop", "three@okaxis", "TS-", { inv_00000002: inv("inv_00000002", "TS-0001", 120000, "cli_cccccccc") }, { cli_cccccccc: client("cli_cccccccc", "Anil Rao") });

/** Seed from a page without the workspace island, so no running sync engine races the new data. */
async function setup({ signedIn = false, plan = { id: "free", businesses: 1 }, books = {}, links = [], registered = false, local = true, failIndexPut = false } = {}) {
  await b.go(BASE + "/terms/", 400);
  const index = { v: 1, books: { biz_primary: { id: "biz_primary", createdAt: 0 } } };
  for (const [i, id] of Object.keys(books).entries()) index.books[id] = { id, createdAt: T + i };
  const docs = registered ? Object.fromEntries([["biz_primary", { ws: primary, rev: 1 }], ...Object.entries(books).map(([id, ws]) => [id, { ws, rev: 1 }])]) : {};
  const srv = { signedIn, owner: OWNER, plan, docs, index: registered ? index : null, links, failIndexPut };
  await b.eval(`localStorage.clear(); sessionStorage.clear();
    localStorage.setItem('__srv', ${JSON.stringify(JSON.stringify(srv))});
    localStorage.setItem('proupiqr-checklist-dismissed', '1');
    localStorage.setItem('proupiqr-sync-nudge-dismissed', String(Date.now()));
    ${signedIn ? `localStorage.setItem('proupiqr-workspace-owner', '${OWNER}');` : ""}
    ${local ? `localStorage.setItem('proupiqr-workspace-v1', ${JSON.stringify(JSON.stringify(primary))});` : ""}
    ${Object.keys(books).length ? `localStorage.setItem('proupiqr-books-v1', ${JSON.stringify(JSON.stringify({ ...index, ...(signedIn ? { owner: OWNER } : {}) }))});` : ""}
    ${Object.entries(books).map(([id, ws]) => `localStorage.setItem('proupiqr-book-v1:${id}', ${JSON.stringify(JSON.stringify(ws))});`).join("\n")}
    true`);
}
const storage = (key) => b.eval(`localStorage.getItem(${JSON.stringify(key)})`);
const srvState = () => b.eval("JSON.parse(localStorage.getItem('__srv'))");
const calls = () => b.eval("window.__calls.map(c => c.method + ' ' + c.url)");
const synced = "[...document.querySelectorAll('button')].some(b => b.textContent === 'Synced ✓')";
const visible = (sel) => `[...document.querySelectorAll(${JSON.stringify(sel)})].filter(e => e.offsetParent !== null)`;
const openSwitcher = () => t(`${visible("[data-book-switcher]")}[0].click(), true`);
const options = () => b.eval("[...document.querySelectorAll('[data-book-option]')].map(o => o.dataset.bookOption + ':' + o.getAttribute('aria-selected') + ':' + o.textContent)");
const pickOption = (id) => t(`document.querySelector('[data-book-option="${id}"]').click(), true`);
const h1 = () => b.eval("document.querySelector('h1').textContent");
const rows = () => b.eval("[...document.querySelectorAll('li [aria-expanded]')].map(r => r.textContent)");
/** Opens the first invoice row (unless one is open) and returns nothing; row actions are then searched inside it. */
const expandFirst = () => t("(() => { if (!document.querySelector('li [aria-expanded=true]')) document.querySelector('li [aria-expanded]').click(); return true; })()");
const inRow = "document.querySelector('li [aria-expanded=true]').parentElement";

try {
  // 1. Signed out with one business: the sidebar switcher, and "+ Add business" asks for an account + Pro.
  await setup();
  await b.go(BASE + "/app/", 2500);
  check("switcher replaces the sidebar header", await b.eval(`${visible("[data-book-switcher]")}.length === 1`) && /Sharma Tuition/.test(await b.eval("document.querySelector('[data-book-switcher]').textContent")));
  check("switcher trigger is a listbox button outside any li", await b.eval("(() => { const t = document.querySelector('[data-book-switcher]'); return t.getAttribute('aria-haspopup') === 'listbox' && t.getAttribute('aria-expanded') === 'false' && !t.closest('li'); })()"));
  const rowsBefore = (await rows()).length;
  await openSwitcher();
  check("popover is a listbox with the one business selected", await b.eval("!!document.querySelector('[role=listbox][aria-label=Businesses]')") && (await options()).length === 1 && (await options())[0].startsWith("biz_primary:true"));
  check("signed-out usage line", /1 of 1 business/.test(await text()));
  check("switcher open: li [aria-expanded] count unchanged", (await rows()).length === rowsBefore);
  check("switcher open: first aria-current=page is still a section tab", await b.eval("document.querySelector('[aria-current=page]').textContent.trim() === 'Overview'"));
  check("switcher open: no dialog", await b.eval("!document.querySelector('[role=dialog]')"));
  await b.eval("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true");
  await sleep(150);
  check("Esc closes the switcher and returns focus", await b.eval("!document.querySelector('[role=listbox]') && document.activeElement?.hasAttribute('data-book-switcher')"));
  await openSwitcher();
  await t("document.querySelector('[role=listbox]').parentElement.querySelector('[data-add-business]').click(), true");
  await sleep(300);
  check("signed out: add asks for an account and Pro", /Create a free account and upgrade to Pro to add another business\./.test(await text()));
  check("signed out: Create free account → /sign-up/ with upgrade=monthly", await b.eval("[...document.querySelectorAll('[data-upsell=businesses] a')].some(a => a.textContent === 'Create free account' && a.getAttribute('href').startsWith('/sign-up/') && decodeURIComponent(a.getAttribute('href')).includes('upgrade=monthly'))"));
  check("signed out: Sign in link too", await b.eval("[...document.querySelectorAll('[data-upsell=businesses] a')].some(a => a.textContent === 'Sign in' && a.getAttribute('href').startsWith('/sign-in/'))"));
  check("signed out: no New business sheet", await b.eval("!document.getElementById('ws-book-name')"));
  await t("__t.click(/^Not now$/, document.querySelector('[data-upsell]'))");
  check("Not now closes the prompt", await b.eval("!document.querySelector('[data-upsell]')"));

  // 2. Signed in on Free: the Pro prompt; "Checking your plan…" never sticks once the plan is known.
  await setup({ signedIn: true });
  await b.go(BASE + "/app/", 2500);
  await b.waitFor(synced);
  await openSwitcher();
  await t("document.querySelector('[role=listbox]').parentElement.querySelector('[data-add-business]').click(), true");
  await sleep(300);
  check("Free: add opens the Pro prompt", /Pro gives up to 20 businesses in one account for ₹\d+\/month, from your first payment\./.test(await text()));
  check("Free: See Pro links to the plan with then=add-business", await b.eval("[...document.querySelectorAll('[data-upsell=businesses] a')].some(a => a.textContent === 'See Pro' && a.getAttribute('href') === '/app/?tab=settings&upgrade=monthly&then=add-business')"));

  // 3. Phone width on Free: no chip (nothing to choose), Settings → Business details has the add row.
  await b.mobile(true);
  await b.go(BASE + "/app/?tab=settings", 2500);
  await b.waitFor(synced);
  check("phone, Free, one business: no switcher chip", await b.eval(`${visible("[data-book-switcher]")}.length === 0`));
  check("phone: Business details shows the usage line", /1 of 1 business/.test(await text()));
  await t(`${visible("[data-add-business]")}[0].click(), true`);
  await sleep(400);
  check("phone: Settings add row opens the Pro prompt", /Pro gives up to 20 businesses/.test(await text()));
  await b.mobile(false);

  // 4. Pro: add a second business; the first business's key never changes because of it.
  await setup({ signedIn: true, plan: { id: "pro", businesses: 20 } });
  await b.go(BASE + "/app/", 2500);
  await b.waitFor(synced);
  await sleep(500);
  const primaryKeyBefore = await storage("proupiqr-workspace-v1");
  await openSwitcher();
  await t("document.querySelector('[role=listbox]').parentElement.querySelector('[data-add-business]').click(), true");
  await b.waitFor("!!document.getElementById('ws-book-name')");
  check("Pro: New business sheet", await b.eval("document.querySelector('[role=dialog]')?.getAttribute('aria-label') === 'New business'"));
  await t("__t.set('ws-book-name', 'Book Two'), __t.set('ws-book-upi', 'bad upi'), __t.click(/^Add business$/, __t.dialog())");
  await sleep(200);
  check("New business validates the UPI ID", /That UPI ID doesn't look right/.test(await text()) && await b.eval("!!document.getElementById('ws-book-name')"));
  await t("__t.set('ws-book-upi', 'two@okaxis'), __t.click(/^Add business$/, __t.dialog())");
  await b.waitFor("!document.querySelector('[role=dialog]')");
  await sleep(1500);
  const index = JSON.parse(await storage("proupiqr-books-v1"));
  const two = Object.keys(index.books).find((id) => id !== "biz_primary");
  check("Book Two is active and named in the H1", (await h1()) === "Book Two");
  check("Book Two saved under its own key", JSON.parse(await storage(`proupiqr-book-v1:${two}`) || "null")?.business?.upiId === "two@okaxis");
  check("Book Two registered with the account", !!(await srvState()).index?.books?.[two] && (await calls()).includes("PUT /api/v1/workspace/books/"));
  await openSwitcher();
  const opts = await options();
  check("switcher lists both, Book Two selected, primary first", opts.length === 2 && opts[0].startsWith("biz_primary:false") && opts[1].startsWith(`${two}:true`), opts.join(" | "));
  check("usage 2 of 20", /2 of 20 businesses/.test(await text()));
  await b.eval("document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true");

  // An invoice in Book Two: own numbering, never in the first business.
  await t("__t.click(/^\\+ New invoice$/)");
  await b.waitFor("!!document.getElementById('ws-amount')");
  await t("__t.set('ws-client', 'Meera Iyer'), __t.set('ws-phone', '9123456780'), __t.set('ws-amount', '2500')");
  await t("__t.click(/^Add invoice$/, __t.dialog())");
  await b.waitFor("!document.querySelector('[role=dialog]')");
  await sleep(2600);
  const twoWs = JSON.parse(await storage(`proupiqr-book-v1:${two}`));
  const twoInv = Object.values(twoWs.invoices)[0];
  check("Book Two numbers its own INV-0001", twoInv?.number === "INV-0001", JSON.stringify(twoInv?.number));
  check("first business's key byte-identical after editing Book Two", (await storage("proupiqr-workspace-v1")) === primaryKeyBefore);
  const s4 = await srvState();
  check("Book Two's invoice synced to its own slot only", Object.values(s4.docs[two]?.ws?.invoices ?? {}).some((i) => i.amountPaise === 250000) && !JSON.stringify(s4.docs.biz_primary?.ws ?? {}).includes("Meera"));
  await t("__t.click(/^Invoices$/)");
  await sleep(300);
  check("Book Two's screen shows only its invoices", JSON.stringify(await rows()).includes("Meera Iyer") && !JSON.stringify(await rows()).includes("Rohan Mehta"), JSON.stringify(await rows()));
  await expandFirst();
  await sleep(200);
  await t(`__t.click(/^Remind$/, ${inRow})`);
  await b.waitFor("!!document.getElementById('ws-reminder')");
  const reminderTwo = await b.eval("document.getElementById('ws-reminder').value");
  check("Book Two's reminder quotes Book Two's UPI ID only", reminderTwo.includes("two@okaxis") && !reminderTwo.includes("sharma@okaxis") && /— Book Two$/.test(reminderTwo.trim()), reminderTwo);
  await b.eval("document.querySelector('[data-close]').click(); true");
  await b.waitFor("!document.querySelector('[role=dialog]')");

  // Switch to the first business: its invoices only; then the reverse.
  await openSwitcher();
  await pickOption("biz_primary");
  await sleep(500);
  check("switch: first business on screen", (await h1()) === "Sharma Tuition" && /Rohan Mehta/.test(await text()) && !/Meera Iyer/.test(await text()));
  check("switch remembered for new tabs", (await storage("proupiqr-active-book")) === "biz_primary");
  // An invoice in the first business also numbers INV-0002 from its own sequence.
  await t("__t.click(/^\\+ New invoice$/)");
  await b.waitFor("!!document.getElementById('ws-amount')");
  await t("__t.set('ws-client', 'Kavita Singh'), __t.set('ws-amount', '900')");
  await t("__t.click(/^Add invoice$/, __t.dialog())");
  await b.waitFor("!document.querySelector('[role=dialog]')");
  await sleep(300);
  const p4 = JSON.parse(await storage("proupiqr-workspace-v1"));
  check("first business keeps its own sequence (INV-0002), no Book Two data", Object.values(p4.invoices).some((i) => i.number === "INV-0002") && !JSON.stringify(p4).includes("Meera"));
  check("Book Two untouched by the first business's invoice", !JSON.stringify(JSON.parse(await storage(`proupiqr-book-v1:${two}`))).includes("Kavita"));

  // Switching clears the client filter and search.
  await b.go(BASE + `/app/?tab=clients&business=${two}`, 2500);
  check("?business=<id> selects that business and is stripped", (await h1()) === "Book Two" && (await b.eval("location.search")) === "?tab=clients");
  await t("[...document.querySelectorAll('button')].find(b => b.textContent.includes('Meera Iyer')).click(), true");
  await sleep(300);
  check("client filter on in Book Two", /Meera Iyer ×/.test(await text()));
  await openSwitcher();
  await pickOption("biz_primary");
  await sleep(400);
  check("switching clears the client filter", !/Meera Iyer ×/.test(await text()) && !/Kavita Singh ×/.test(await text()));
  await b.go(BASE + "/app/?business=biz_bogus", 2500);
  check("?business=biz_bogus ignored and stripped", (await h1()) === "Sharma Tuition" && (await b.eval("location.search")) === "");
  await b.go(BASE + "/app/?business=../etc", 2000);
  check("?business= with an invalid id ignored", (await h1()) === "Sharma Tuition");

  // Rename Book Two in Settings.
  await b.go(BASE + `/app/?tab=settings&business=${two}`, 2500);
  await b.waitFor(synced);
  await t("__t.set('ws-s-name', 'Book Two Renamed'), __t.click(/^Save settings$/)");
  await sleep(400);
  check("rename: H1 and switcher show the new name", (await h1()) === "Book Two Renamed" && /Book Two Renamed/.test(await b.eval("document.querySelector('[data-book-switcher]').textContent")));
  check("rename stays in Book Two", JSON.parse(await storage(`proupiqr-book-v1:${two}`)).business.name === "Book Two Renamed" && JSON.parse(await storage("proupiqr-workspace-v1")).business.name === "Sharma Tuition");
  check("Download all businesses offered with two", /Download all businesses/.test(await text()));
  check("Erase all businesses offered with two", /Erase all businesses on this device…/.test(await text()));

  // Delete Book Two; the first business can't be deleted.
  await t("__t.click(/^Delete this business…$/)");
  await sleep(200);
  check("delete confirm explains what goes", /Its invoices, clients and pay links are deleted from your account and your other devices/.test(await text()));
  check("delete confirm button is the destructive colour", await b.eval("[...document.querySelectorAll('button')].some(b => b.textContent === 'Delete business' && b.className.includes('bg-[#a8321d]'))"));
  await t("__t.click(/^Delete business$/)");
  await b.waitFor("document.querySelector('h1').textContent === 'Sharma Tuition'");
  await sleep(1200);
  check("delete: switched to the first business", (await h1()) === "Sharma Tuition");
  check("delete: Book Two's key removed", (await storage(`proupiqr-book-v1:${two}`)) === null);
  check("delete: tombstone in the local and server index", JSON.parse(await storage("proupiqr-books-v1")).books[two]?.deletedAt !== undefined && (await srvState()).index.books[two]?.deletedAt !== undefined);
  check("delete: flash confirms", /Business deleted\./.test(await text()));
  check("first business has no delete control", !/Delete this business…/.test(await text()));
  await openSwitcher();
  check("delete: switcher lists only the first business", (await options()).length === 1);
  await b.eval("document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true");

  // 5. Same invoice id in two businesses with different pay links: never mixed.
  await setup({
    signedIn: true, plan: { id: "pro", businesses: 20 }, registered: true, books: { [B]: bookTwo },
    links: [{ key: "inv_00000001", token: "tokPrimary1", claims: [] }, { key: `${B}/inv_00000001`, token: "tokBookTwo1", claims: [{ utr: "123456789012", amountPaise: 100000, at: Date.now() }] }],
  });
  await b.go(BASE + `/app/?tab=invoices&business=${B}`, 3000);
  await b.waitFor(synced);
  await sleep(800);
  check("Book Two lists its own invoice only", JSON.stringify(await rows()).includes("Priya Kapoor") && !JSON.stringify(await rows()).includes("Rohan"));
  await expandFirst();
  await sleep(300);
  check("Book Two's row shows Book Two's link, never the first business's", await b.eval("[...document.querySelectorAll('input[readonly]')].some(i => i.value.includes('/i/tokBookTwo1/')) && ![...document.querySelectorAll('input')].some(i => i.value.includes('tokPrimary1'))"));
  await t(`__t.click(/^Remind$/, ${inRow})`);
  await b.waitFor("!!document.getElementById('ws-reminder')");
  const reminder = await b.eval("document.getElementById('ws-reminder').value");
  check("Book Two's reminder carries Book Two's link and name only", reminder.includes("/i/tokBookTwo1/") && !reminder.includes("tokPrimary1") && /— Book Two Traders$/.test(reminder.trim()) && !reminder.includes("Sharma"), reminder);
  await b.eval("document.querySelector('[data-close]').click(); true");
  await b.waitFor("!document.querySelector('[role=dialog]')");
  await expandFirst();
  await sleep(200);
  await t(`__t.click(/^Turn off$/, ${inRow})`);
  await sleep(800);
  const links5 = (await srvState()).links.map((l) => l.token);
  check("Turn off in Book Two revokes only Book Two's token", !links5.includes("tokBookTwo1") && links5.includes("tokPrimary1"), links5.join(","));
  await openSwitcher();
  await pickOption("biz_primary");
  await sleep(500);
  await expandFirst();
  await sleep(300);
  check("first business still shows its own link", await b.eval("[...document.querySelectorAll('input[readonly]')].some(i => i.value.includes('/i/tokPrimary1/'))"));
  check("Book Two's payer claim stays in Book Two", !/Payments to confirm/.test(await text()));
  await t(`__t.click(/^Remind$/, ${inRow})`);
  await b.waitFor("!!document.getElementById('ws-reminder')");
  const reminder1 = await b.eval("document.getElementById('ws-reminder').value");
  check("first business's reminder carries its own link and name", reminder1.includes("tokPrimary1") && !reminder1.includes("tokBookTwo1") && /— Sharma Tuition$/.test(reminder1.trim()), reminder1);
  await b.eval("document.querySelector('[data-close]')?.click(); true");
  // A new pay link in Book Two goes to its own route with a book-qualified key.
  await openSwitcher();
  await pickOption(B);
  await sleep(400);
  await expandFirst();
  await sleep(200);
  await t("__t.click(/Create pay link/)");
  await sleep(2500);
  check("Book Two's new link created through its own route", (await calls()).includes(`POST /api/v1/paylinks/books/${B}/`) && (await srvState()).links.some((l) => l.key === `${B}/inv_00000001`));

  // 6. Old tab writes the first business's key (storage event from another document): Book Two untouched.
  const bookTwoBefore = await storage(`proupiqr-book-v1:${B}`);
  await b.eval(`(async () => {
    const f = document.createElement('iframe'); f.src = '/terms/'; f.style.display = 'none'; document.body.appendChild(f);
    await new Promise((r) => { f.onload = r; });
    const ws = JSON.parse(localStorage.getItem('proupiqr-workspace-v1'));
    ws.invoices.inv_0ldtab01 = { ...ws.invoices.inv_00000001, id: 'inv_0ldtab01', number: 'INV-0099', amountPaise: 99900, updatedAt: Date.now(), createdAt: Date.now() };
    f.contentWindow.localStorage.setItem('proupiqr-workspace-v1', JSON.stringify(ws));
    window.__frame = f;
    return true;
  })()`);
  await sleep(800);
  check("old tab's write to the first business doesn't touch Book Two", (await storage(`proupiqr-book-v1:${B}`)) === bookTwoBefore && !(await text()).includes("INV-0099"));
  await openSwitcher();
  await pickOption("biz_primary");
  await sleep(400);
  check("old tab's write shows in the first business", (await text()).includes("INV-0099") || JSON.stringify(await rows()).includes("999"));
  // Another tab edits Book Two: this tab picks it up without switching.
  await b.eval(`(() => {
    const ws = JSON.parse(localStorage.getItem('proupiqr-book-v1:${B}'));
    ws.invoices.inv_0thertab = { ...ws.invoices.inv_00000001, id: 'inv_0thertab', number: 'BT-0042', amountPaise: 4200, updatedAt: Date.now(), createdAt: Date.now() };
    window.__frame.contentWindow.localStorage.setItem('proupiqr-book-v1:${B}', JSON.stringify(ws));
    return true;
  })()`);
  await sleep(600);
  await openSwitcher();
  await pickOption(B);
  await sleep(400);
  check("another tab's edit to Book Two arrives", (await text()).includes("BT-0042"));

  // 7. Downgrade: three registered businesses, the account is now on Free → read-only, nothing hidden or lost.
  await setup({ signedIn: true, plan: { id: "free", businesses: 1 }, registered: true, books: { [B]: bookTwo, [C]: bookThree } });
  await b.go(BASE + "/app/", 3000);
  await b.waitFor(synced);
  await sleep(600);
  check("downgrade notice shown once", /You're on Free now\. Your 3 businesses all stay, and their pay links keep working\. Sharma Tuition stays editable; the others are read-only until you upgrade\./.test(await text()));
  check("first business stays editable", await b.eval("!document.querySelector('[data-read-only]') && ![...document.querySelectorAll('button')].find(b => b.textContent === '+ New invoice').disabled"));
  await openSwitcher();
  check("downgrade: usage in red, 3 of 1", await b.eval("[...document.querySelectorAll('p')].some(p => /3 of 1 business/.test(p.textContent) && p.className.includes('text-[#a8321d]'))"));
  check("downgrade: other businesses marked Read-only", (await options()).filter((o) => /Read-only/.test(o)).length === 2);
  await pickOption(C);
  await sleep(500);
  check("read-only banner in Third Shop", /This business is read-only on the Free plan\. Upgrade to edit it again\./.test(await text()) && await b.eval("!!document.querySelector('[data-read-only]')"));
  check("read-only: data still visible", (await h1()) === "Third Shop" && /Anil Rao/.test(await text()));
  check("read-only: + New invoice disabled", await b.eval("[...document.querySelectorAll('button')].find(b => b.textContent === '+ New invoice').disabled"));
  await b.go(BASE + `/app/?tab=invoices&business=${C}`, 2500);
  await expandFirst();
  await sleep(200);
  check("read-only row: no Record payment, Edit or Delete; Remind stays", await b.eval("(() => { const d = document.querySelector('li [aria-expanded=true]').parentElement.innerText; return !/Record payment|Cancel invoice|Delete|Create pay link/.test(d) && /Remind/.test(d); })()"));
  await b.go(BASE + `/app/?tab=settings&business=${C}`, 2500);
  check("read-only: business details locked", await b.eval("document.getElementById('ws-s-name').matches(':disabled') && [...document.querySelectorAll('button')].find(b => b.textContent === 'Save settings').matches(':disabled')"));
  check("read-only: the business can still be deleted", /Delete this business…/.test(await text()));
  check("read-only: no write reached the server", !(await calls()).some((c) => c === `PUT /api/v1/workspace/books/${C}/`));
  await b.go(BASE + "/app/", 2500);
  await t("__t.click(/^Got it$/)");
  await sleep(200);
  await b.go(BASE + "/app/", 2500);
  check("downgrade notice stays dismissed", !/You're on Free now/.test(await text()));
  // A pay-link answer of plan_read_only (plan read stale) opens the business pay-link prompt instead of failing.
  await b.eval(`(() => { const s = JSON.parse(localStorage.getItem('__srv')); s.plan = { id: 'pro', businesses: 20 }; localStorage.setItem('__srv', JSON.stringify(s)); return true; })()`);
  await b.go(BASE + `/app/?tab=invoices&business=${B}`, 3000);
  await b.waitFor(synced);
  await b.eval(`(() => { const s = JSON.parse(localStorage.getItem('__srv')); s.plan = { id: 'free', businesses: 1 }; localStorage.setItem('__srv', JSON.stringify(s)); return true; })()`);
  await expandFirst();
  await sleep(200);
  await t("__t.click(/Create pay link/)");
  await sleep(2500);
  check("plan_read_only on a new link opens the business pay-link prompt", /On Free, new pay links work only in Sharma Tuition\. Book Two Traders and its existing links keep working\./.test(await text()));
  check("…and the business turns read-only, its data kept", /This business is read-only on the Free plan/.test(await text()) && /Priya Kapoor/.test(await text()));

  // 8. A business the server refused (plan raced): kept on this device, "Not syncing", no retry storm.
  await setup({ signedIn: true, plan: { id: "free", businesses: 1 }, books: { [B]: bookTwo } });
  await b.go(BASE + `/app/?business=${B}`, 3000);
  await b.waitFor(synced);
  await sleep(2500);
  const putCount = (await calls()).filter((c) => c === "PUT /api/v1/workspace/books/").length;
  check("refused business stays, Not syncing banner", (await h1()) === "Book Two Traders" && /This business isn't syncing: your plan includes 1 business\./.test(await text()));
  check("refused business: kept locally", !!(await storage(`proupiqr-book-v1:${B}`)));
  check("refused business: one index PUT, no book PUT", putCount === 1 && !(await calls()).includes(`PUT /api/v1/workspace/books/${B}/`), (await calls()).join(", "));

  // 9. Index PUT fails (503): the business waits, nothing is deleted; it uploads once the PUT works.
  await setup({ signedIn: true, plan: { id: "pro", businesses: 20 }, books: { [B]: bookTwo }, failIndexPut: true });
  await b.go(BASE + `/app/?business=${B}`, 3000);
  await sleep(1500);
  check("unregistered: waiting line, data kept", /Waiting to add Book Two Traders to your account\. Your changes are safe on this device\./.test(await text()) && !!(await storage(`proupiqr-book-v1:${B}`)));
  await b.go(BASE + "/app/", 2500);
  check("unregistered survives a reload", !!(await storage(`proupiqr-book-v1:${B}`)));
  await b.eval(`(() => { const s = JSON.parse(localStorage.getItem('__srv')); s.failIndexPut = false; localStorage.setItem('__srv', JSON.stringify(s)); return true; })()`);
  await b.go(BASE + "/app/", 3000);
  await b.waitFor(synced);
  await sleep(1500);
  check("once the PUT works the business uploads", (await srvState()).docs[B]?.ws?.business?.name === "Book Two Traders");

  // 10. Backups: "Download all businesses" restores both into a clean browser; a first-business backup
  //     restored while Book Two is active asks first, and Cancel leaves Book Two alone.
  await setup({ signedIn: false, books: { [B]: bookTwo } });
  await b.go(BASE + "/app/?tab=settings", 2500);
  const v2 = await b.eval(`(() => {
    const blobs = []; const orig = URL.createObjectURL; URL.createObjectURL = (b) => { blobs.push(b); return orig(b); };
    [...document.querySelectorAll('button')].find(b => b.textContent === 'Download all businesses').click();
    URL.createObjectURL = orig; return blobs[0].text();
  })()`);
  const parsed = JSON.parse(v2);
  check("Download all businesses: V2 with both", parsed.formatVersion === 2 && parsed.businesses.length === 2 && parsed.workspace.business.name === "Sharma Tuition");
  await setup({ signedIn: false, local: false });
  await b.go(BASE + "/app/?tab=settings", 2500);
  await b.eval(`(() => { const input = document.querySelector('input[type=file]'); const dt = new DataTransfer(); dt.items.add(new File([${JSON.stringify(v2)}], 'all.json', { type: 'application/json' })); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  await sleep(800);
  check("signed out: restore keeps the first business, asks to sign in for the rest", JSON.parse(await storage("proupiqr-workspace-v1")).business.name === "Sharma Tuition" && /Sign in to restore all 2 businesses\./.test(await text()));
  await setup({ signedIn: true, plan: { id: "pro", businesses: 20 }, local: false });
  await b.go(BASE + "/app/?tab=settings", 3000);
  await b.waitFor(synced);
  await b.eval(`(() => { const input = document.querySelector('input[type=file]'); const dt = new DataTransfer(); dt.items.add(new File([${JSON.stringify(v2)}], 'all.json', { type: 'application/json' })); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  await sleep(1500);
  await openSwitcher();
  check("Pro: restore of all businesses brings both back", (await options()).length === 2 && JSON.stringify(await options()).includes("Book Two Traders"));
  await b.eval("document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true");
  const v1 = JSON.stringify({ app: "proupiqr-workspace", exportedAt: new Date().toISOString(), workspace: primary });
  await setup({ signedIn: false, books: { [B]: bookTwo } });
  await b.go(BASE + `/app/?tab=settings&business=${B}`, 2500);
  const twoBefore = await storage(`proupiqr-book-v1:${B}`);
  await b.eval(`(() => { const input = document.querySelector('input[type=file]'); const dt = new DataTransfer(); dt.items.add(new File([${JSON.stringify(v1)}], 'one.json', { type: 'application/json' })); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  await sleep(600);
  const page10 = await text();
  check("first-business backup while Book Two is active: asks, naming both", /This backup is for Sharma Tuition \(sharma@okaxis\)\. Restore it into/.test(page10), page10.slice(0, 400));
  await t("__t.click(/^Cancel$/, document.querySelector('[role=alert]'))");
  await sleep(300);
  check("Cancel leaves Book Two unchanged", (await storage(`proupiqr-book-v1:${B}`)) === twoBefore);

  // 11. Generator bridge: Book Two's UPI ID goes to Book Two (redirect names it); an unknown UPI ID asks.
  await setup({ signedIn: false, books: { [B]: bookTwo } });
  const draft = (upiId, invoiceNo) => JSON.stringify({ templateId: "in-gst", merchant: "Whoever", upiId, customer: "Lakshmi Nair", invoiceNo, invoiceDate: "2026-10-02", dueDate: "2026-10-12", gstPercent: "0", discount: "0", notes: "", items: [{ id: 1, name: "Work", qty: "1", price: "4321" }] });
  await b.eval(`localStorage.setItem('proupiqr-invoice-draft', ${JSON.stringify(draft("two@okaxis", "BT-0500"))}); true`);
  await b.go(BASE + "/invoice-generator/", 1500);
  await b.eval("document.getElementById('invoice-tool').scrollIntoView(); true");
  await b.waitFor("[...document.querySelectorAll('button')].some(b => /Track payment/.test(b.textContent))", 10000);
  await t("__t.click(/Track payment/)");
  await b.waitFor("location.pathname === '/app/'", 8000);
  await sleep(1500);
  check("bridge: matching UPI ID lands in Book Two", (await h1()) === "Book Two Traders" && /Lakshmi Nair/.test(await text()) && JSON.stringify(JSON.parse(await storage(`proupiqr-book-v1:${B}`)).invoices).includes("BT-0500"));
  check("bridge: first business untouched", !(await storage("proupiqr-workspace-v1")).includes("Lakshmi"));
  check("bridge: the business id was stripped from the URL", !(await b.eval("location.search")).includes("business="));
  await b.eval(`localStorage.setItem('proupiqr-invoice-draft', ${JSON.stringify(draft("stranger@okhdfc", "X-77"))}); true`);
  await b.go(BASE + "/invoice-generator/", 1500);
  await b.eval("document.getElementById('invoice-tool').scrollIntoView(); true");
  await b.waitFor("[...document.querySelectorAll('button')].some(b => /Track payment/.test(b.textContent))", 10000);
  await t("__t.click(/Track payment/)");
  await b.waitFor("location.pathname === '/app/'", 8000);
  await sleep(1500);
  check("bridge: unknown UPI ID asks which business", await b.eval("document.querySelector('[role=dialog]')?.getAttribute('aria-label') === 'Which business is this for?'") && (await b.eval("document.querySelectorAll('[data-pick-business]').length")) === 2);
  check("bridge: nothing saved before the answer", !(await storage("proupiqr-workspace-v1")).includes("X-77") && !(await storage(`proupiqr-book-v1:${B}`)).includes("X-77"));
  await t(`document.querySelector('[data-pick-business="${B}"]').click(), true`);
  await sleep(800);
  check("bridge: picked business gets the invoice", JSON.stringify(JSON.parse(await storage(`proupiqr-book-v1:${B}`)).invoices).includes("X-77") && !(await storage("proupiqr-workspace-v1")).includes("X-77") && (await h1()) === "Book Two Traders");
  check("bridge: toast names the business", /Saved to Book Two Traders\./.test(await text()));

  // 12. Hindi: the business UI is translated (व्यवसाय).
  await setup({ signedIn: false });
  await b.go(BASE + "/app/?lang=hi", 2500);
  await openSwitcher();
  check("Hindi: + व्यवसाय जोड़ें", /\+ व्यवसाय जोड़ें/.test(await text()));

  // 13. Phone width with two businesses: the chip in the tab strip switches.
  await setup({ signedIn: false, books: { [B]: bookTwo } });
  await b.mobile(true);
  await b.go(BASE + "/app/", 2500);
  check("phone: chip shown with two businesses", await b.eval(`${visible("[data-book-switcher]")}.length === 1`));
  await openSwitcher();
  await pickOption(B);
  await sleep(400);
  check("phone: chip switches business", (await h1()) === "Book Two Traders");
  check("phone: page doesn't scroll sideways", await b.eval("document.documentElement.scrollWidth <= window.innerWidth"));
  await b.mobile(false);

  // 14. Deleted on another device while this one held unsynced changes: set aside with a download, never dropped.
  await setup({ signedIn: true, plan: { id: "pro", businesses: 20 }, registered: true, books: { [B]: bookTwo } });
  await b.eval(`(() => {
    const s = JSON.parse(localStorage.getItem('__srv')); s.index.books['${B}'].deletedAt = Date.now(); delete s.docs['${B}']; localStorage.setItem('__srv', JSON.stringify(s));
    localStorage.setItem('proupiqr-book-sync-v1', JSON.stringify({ owner: '${OWNER}', books: { '${B}': { rev: 1, hash: 'stale-hash' } } }));
    return true;
  })()`);
  await b.go(BASE + "/app/?tab=settings", 3000);
  await b.waitFor(synced);
  await sleep(800);
  check("deleted elsewhere with unsynced edits: set aside, said plainly", /Unsynced changes to Book Two Traders, kept safe on this device\./.test(await text()) && /These are this account's changes/.test(await text()));
  check("deleted elsewhere: download offered, book key gone, copy kept", /Download it/.test(await text()) && (await storage(`proupiqr-book-v1:${B}`)) === null && JSON.parse((await storage(`proupiqr-aside-v1:${B}`)) || "null")?.workspace?.business?.name === "Book Two Traders");
  await openSwitcher();
  check("deleted elsewhere: switcher lists the first business only", (await options()).length === 1);
  await b.eval("document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true");

  // ---- Review fixes (PR 4/5) ----
  const setFile = async (name, content) => b.eval(`(() => { const input = document.querySelector('input[type=file]'); const dt = new DataTransfer(); dt.items.add(new File([${JSON.stringify(content)}], ${JSON.stringify(name)}, { type: 'application/json' })); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  const cacheLimit = (limit) => b.eval(`localStorage.setItem('proupiqr-plan-limit-v1', JSON.stringify({ owner: '${OWNER}', limit: ${limit} })); true`);

  // R1. A sheet open in Book Two when Book Two is deleted in another tab closes; nothing lands in the first business.
  await setup({ signedIn: true, plan: { id: "pro", businesses: 20 }, registered: true, books: { [B]: bookTwo } });
  await b.go(BASE + `/app/?business=${B}`, 3000);
  await b.waitFor(synced);
  const firstBefore = await storage("proupiqr-workspace-v1");
  await t("__t.click(/^\\+ New invoice$/)");
  await b.waitFor("!!document.getElementById('ws-amount')");
  await t("__t.set('ws-client', 'Yusuf Two'), __t.set('ws-amount', '1234')");
  await b.eval(`(async () => { const f = document.createElement('iframe'); f.src = '/terms/'; f.style.display = 'none'; document.body.appendChild(f);
    await new Promise((r) => { f.onload = r; });
    const idx = JSON.parse(localStorage.getItem('proupiqr-books-v1')); idx.books['${B}'].deletedAt = Date.now();
    f.contentWindow.localStorage.setItem('proupiqr-books-v1', JSON.stringify(idx)); f.contentWindow.localStorage.removeItem('proupiqr-book-v1:${B}'); return true; })()`);
  await sleep(800);
  check("R1: deleted elsewhere → the sheet closes and the first business is on screen", (await h1()) === "Sharma Tuition" && await b.eval("!document.querySelector('[role=dialog]')"));
  check("R1: nothing typed in Book Two lands in the first business", !(await storage("proupiqr-workspace-v1")).includes("Yusuf") && (await storage("proupiqr-workspace-v1")) === firstBefore);

  // R2. ?new=1 (PWA shortcut) in a read-only business: no form (limit cached) …
  await setup({ signedIn: true, plan: { id: "free", businesses: 1 }, registered: true, books: { [B]: bookTwo, [C]: bookThree } });
  await b.eval(`localStorage.setItem('proupiqr-active-book', '${C}'); localStorage.setItem('proupiqr-downgrade-notice', '1'); true`);
  await cacheLimit(1);
  await b.go(BASE + "/app/?new=1", 3000);
  check("R2: ?new=1 never opens a form in a read-only business", (await h1()) === "Third Shop" && await b.eval("!document.querySelector('[role=dialog]')"));
  // … and without a cached limit, the form closes with the read-only message as soon as the plan is known; nothing is "added".
  await setup({ signedIn: true, plan: { id: "free", businesses: 1 }, registered: true, books: { [B]: bookTwo, [C]: bookThree } });
  await b.eval(`localStorage.setItem('proupiqr-active-book', '${C}'); localStorage.setItem('proupiqr-downgrade-notice', '1'); true`);
  const threeBefore = await storage(`proupiqr-book-v1:${C}`);
  await b.go(BASE + "/app/?new=1", 3000);
  await b.waitFor(synced);
  await sleep(400);
  check("R2: the form closes once the business is known to be read-only", await b.eval("!document.querySelector('[role=dialog]')") && /read-only on the Free plan/.test(await text()));
  check("R2: nothing saved, no false success", (await storage(`proupiqr-book-v1:${C}`)) === threeBefore && !/added\./.test(await text()));
  check("R2: the limit is remembered for this account", JSON.parse(await storage("proupiqr-plan-limit-v1"))?.limit === 1);
  // A form open when the business turns read-only mid-session closes, and its save is refused.
  await setup({ signedIn: true, plan: { id: "pro", businesses: 20 }, registered: true, books: { [B]: bookTwo, [C]: bookThree } });
  await b.go(BASE + `/app/?business=${C}`, 3000);
  await b.waitFor(synced);
  await t("__t.click(/^\\+ New invoice$/)");
  await b.waitFor("!!document.getElementById('ws-amount')");
  await t("__t.set('ws-client', 'Zed Cross'), __t.set('ws-amount', '4500')");
  await b.eval(`(() => { const s = JSON.parse(localStorage.getItem('__srv')); s.plan = { id: 'free', businesses: 1 }; localStorage.setItem('__srv', JSON.stringify(s)); return true; })()`);
  await b.eval("document.dispatchEvent(new Event('visibilitychange')); true");
  await sleep(1500);
  check("R2: mid-session downgrade closes the open form with the read-only message", await b.eval("!document.querySelector('[role=dialog]')") && /read-only on the Free plan/.test(await text()));
  check("R2: the typed invoice is stored nowhere and not reported as added", !(await b.eval("Object.keys(localStorage).some(k => !k.startsWith('__') && (localStorage.getItem(k) || '').includes('Zed Cross'))")) && !/TS-0002 added/.test(await text()));

  // R3. Restore into a read-only business: refused and named; the business is untouched.
  await setup({ signedIn: true, plan: { id: "free", businesses: 1 }, registered: true, books: { [B]: bookTwo, [C]: bookThree } });
  await b.eval(`localStorage.setItem('proupiqr-active-book', '${C}'); localStorage.setItem('proupiqr-downgrade-notice', '1'); true`);
  await cacheLimit(1);
  await b.go(BASE + "/app/?tab=settings", 3000);
  await b.waitFor(synced);
  const three3 = JSON.parse(JSON.stringify(bookThree));
  three3.invoices.inv_99999999 = { ...three3.invoices.inv_00000002, id: "inv_99999999", number: "TS-0999", amountPaise: 999900, createdAt: Date.now(), updatedAt: Date.now() };
  const threeBefore3 = await storage(`proupiqr-book-v1:${C}`);
  await setFile("c.json", JSON.stringify({ app: "proupiqr-business", formatVersion: 2, businesses: [{ id: C, workspace: three3 }] }));
  await sleep(800);
  check("R3: restore into a read-only business is refused and named", /Not restored into Third Shop: it's read-only on the Free plan\./.test(await text()) && (await storage(`proupiqr-book-v1:${C}`)) === threeBefore3);
  // An account limited to one business (Free signed in, or a trial whose first charge failed) restores at most one.
  await setup({ signedIn: true, plan: { id: "pro", businesses: 1 }, registered: true });
  await b.go(BASE + "/app/?tab=settings", 3000);
  await b.waitFor(synced);
  await setFile("all.json", JSON.stringify({ app: "proupiqr-workspace", formatVersion: 2, workspace: primary, businesses: [{ id: "biz_primary", workspace: primary }, { id: B, workspace: bookTwo }, { id: C, workspace: bookThree }] }));
  await sleep(1500);
  check("R3: trial restore keeps one business and says why", /2 businesses weren't restored: your plan includes 1\./.test(await text()) && /1 of 1 business/.test(await text()));
  // A single business that isn't one of this account's asks first.
  await setup({ signedIn: true, plan: { id: "pro", businesses: 20 }, registered: true });
  await b.go(BASE + "/app/?tab=settings", 3000);
  await b.waitFor(synced);
  await setFile("two.json", JSON.stringify({ app: "proupiqr-business", formatVersion: 2, businesses: [{ id: B, workspace: bookTwo }] }));
  await sleep(600);
  check("R3: a business that isn't yours asks before it is added", /This backup is for Book Two Traders \(two@okaxis\), which isn't one of your businesses here\. Add it as a new business\?/.test(await text()) && !(await storage("proupiqr-books-v1") || "").includes("Book"));
  await t("__t.click(/^Add as a new business$/)");
  await sleep(800);
  await openSwitcher();
  check("R3: confirmed → added as a new business", (await options()).length === 2 && JSON.stringify(await options()).includes("Book Two Traders"));
  await b.eval("document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true");

  // R4. Generator bridge and read-only: with the limit known, the picker asks (read-only disabled); without it, the
  //     document is kept as a set-aside copy instead of a device-only edit.
  const draft4 = (upiId, invoiceNo) => JSON.stringify({ templateId: "in-gst", merchant: "Whoever", upiId, customer: "Lakshmi Nair", invoiceNo, invoiceDate: "2026-10-02", dueDate: "2026-10-12", gstPercent: "0", discount: "0", notes: "", items: [{ id: 1, name: "Work", qty: "1", price: "4321" }] });
  const track4 = async () => {
    await b.go(BASE + "/invoice-generator/", 1500);
    await b.eval("document.getElementById('invoice-tool').scrollIntoView(); true");
    await b.waitFor("[...document.querySelectorAll('button')].some(b => /Track payment/.test(b.textContent))", 10000);
    await t("__t.click(/Track payment/)");
    await b.waitFor("location.pathname === '/app/'", 8000);
  };
  await setup({ signedIn: true, plan: { id: "free", businesses: 1 }, registered: true, books: { [B]: bookTwo, [C]: bookThree } });
  await b.eval(`localStorage.setItem('proupiqr-downgrade-notice', '1'); localStorage.setItem('proupiqr-invoice-draft', ${JSON.stringify(draft4("three@okaxis", "TS-0777"))}); true`);
  await cacheLimit(1);
  await track4();
  await b.waitFor(synced);
  await sleep(600);
  check("R4: a document for a read-only business asks which business", await b.eval("document.querySelector('[role=dialog]')?.getAttribute('aria-label') === 'Which business is this for?'"));
  check("R4: read-only businesses are disabled in the picker", await b.eval(`document.querySelector('[data-pick-business="${C}"]').disabled && document.querySelector('[data-pick-business="${B}"]').disabled && !document.querySelector('[data-pick-business="biz_primary"]').disabled`));
  check("R4: nothing written into the read-only business", !(await storage(`proupiqr-book-v1:${C}`)).includes("TS-0777"));
  await setup({ signedIn: true, plan: { id: "free", businesses: 1 }, registered: true, books: { [B]: bookTwo, [C]: bookThree } });
  await b.eval(`localStorage.setItem('proupiqr-downgrade-notice', '1'); localStorage.setItem('proupiqr-invoice-draft', ${JSON.stringify(draft4("three@okaxis", "TS-0778"))}); true`);
  await track4();
  await b.waitFor(synced);
  await sleep(2000);
  check("R4: unknown plan → the device-only document is set aside, the business shows the server copy", !(await storage(`proupiqr-book-v1:${C}`)).includes("TS-0778") && JSON.stringify(JSON.parse((await storage(`proupiqr-aside-v1:${C}`)) || "{}")).includes("TS-0778") && !JSON.stringify((await srvState()).docs[C]).includes("TS-0778"));
  await b.go(BASE + "/app/?tab=settings", 2500);
  check("R4: Settings offers it with the read-only wording", /They were made after this business became read-only on the Free plan/.test(await text()));

  // R5. A receipt saved into the first business while Book Two was last active: /app/ opens the first business and names it.
  await setup({ signedIn: false, books: { [B]: bookTwo } });
  await b.eval(`localStorage.setItem('proupiqr-active-book', '${B}');
    localStorage.setItem('proupiqr-receipt-draft', ${JSON.stringify(JSON.stringify({ merchant: "Sharma Tuition", upiId: "sharma@okaxis", customer: "Riya Sharma", customerPhone: "", receiptNo: "RCPT-0007", receiptDate: "2026-10-05", paymentMode: "UPI", referenceNo: "412345678901", receivedBy: "", notes: "", items: [{ id: 1, name: "Tuition fees", qty: "1", price: "3000" }] }))}); true`);
  await b.go(BASE + "/receipt-generator/", 1500);
  await b.eval("document.getElementById('receipt-tool').scrollIntoView(); true");
  await b.waitFor("[...document.querySelectorAll('button')].some(b => /Save to payment book/.test(b.textContent))", 10000);
  await t("__t.click(/Save to payment book/)");
  await b.waitFor("location.pathname === '/app/'", 8000);
  await sleep(1200);
  check("R5: the first business opens and the toast names it", (await h1()) === "Sharma Tuition" && /Saved to Sharma Tuition\./.test(await text()) && (await storage("proupiqr-workspace-v1")).includes("Riya"));

  // R6. Monthly billing never fills a read-only business with device-only invoices (plan still unknown on load).
  const three6 = JSON.parse(JSON.stringify(bookThree));
  three6.recurring = { rec_aaaaaaaa: { id: "rec_aaaaaaaa", clientId: "cli_cccccccc", amountPaise: 50000, description: "Monthly", dayOfMonth: 1, dueAfterDays: 7, startMonth: "2026-08", endMonth: "", paused: false, createdAt: T, updatedAt: T } };
  await setup({ signedIn: true, plan: { id: "free", businesses: 1 }, registered: true, books: { [B]: bookTwo, [C]: three6 } });
  await b.eval(`localStorage.setItem('proupiqr-downgrade-notice', '1'); true`);
  await b.go(BASE + "/app/", 3000);
  await b.waitFor(synced);
  await sleep(1000);
  check("R6: no monthly invoices generated into the read-only business", Object.keys(JSON.parse(await storage(`proupiqr-book-v1:${C}`)).invoices).length === 1);

  // R7. One banner for a read-only business after a downgrade; the phone chip is a 44px target.
  await setup({ signedIn: true, plan: { id: "free", businesses: 1 }, registered: true, books: { [B]: bookTwo } });
  await b.go(BASE + `/app/?business=${B}`, 3000);
  await b.waitFor(synced);
  await sleep(400);
  check("R7: read-only + downgrade explained in one banner", (await b.eval("[...document.querySelectorAll('[role=status]')].filter(e => /You're on Free now/.test(e.textContent)).length")) === 1 && await b.eval("/You're on Free now/.test(document.querySelector('[data-read-only]').textContent)"));
  await b.mobile(true);
  await b.go(BASE + "/app/", 2500);
  check("R7: the phone switcher chip is at least 44px tall", (await b.eval("[...document.querySelectorAll('[data-book-switcher]')].find(e => e.offsetParent).getBoundingClientRect().height")) >= 44);
  await b.mobile(false);

  // R8. Another account's data set aside here is labelled as such (never "your account").
  await setup({ signedIn: false });
  await b.eval(`localStorage.setItem('proupiqr-aside-v1:${C}', JSON.stringify({ at: 1, reason: 'other_account', name: 'Other Shop', workspace: ${JSON.stringify(bookThree)} })); true`);
  await b.go(BASE + "/app/?tab=settings", 2500);
  check("R8: other-account data says whose it is", /Other Shop: data from another account that used this device, kept safe here\./.test(await text()) && /it won't be added to this account/.test(await text()) && !/never reached your account/.test(await text()));

  // R9. A stale cached limit (20, from before a downgrade) never generates monthly invoices into a business that
  //     the server now says is read-only: other businesses wait for this session's plan answer.
  const two9 = JSON.parse(JSON.stringify(bookTwo));
  two9.recurring = { rec_aaaaaaaa: { id: "rec_aaaaaaaa", clientId: "cli_bbbbbbbb", amountPaise: 50000, description: "Monthly", dayOfMonth: 1, dueAfterDays: 7, startMonth: "2026-09", endMonth: "", paused: false, createdAt: T, updatedAt: T } };
  await setup({ signedIn: true, plan: { id: "free", businesses: 1 }, registered: true, books: { [B]: two9, [C]: bookThree } });
  await b.eval(`localStorage.setItem('proupiqr-downgrade-notice', '1'); localStorage.setItem('proupiqr-book-sync-v1', JSON.stringify({ owner: '${OWNER}', books: {} })); true`);
  await cacheLimit(20);
  await b.go(BASE + "/app/?tab=settings", 3000);
  await b.waitFor(synced);
  await sleep(2000);
  check("R9: stale cached limit → no monthly invoices in the now read-only business", Object.keys(JSON.parse(await storage(`proupiqr-book-v1:${B}`)).invoices).length === 1);
  check("R9: no invented 'unsynced changes' set aside", (await storage(`proupiqr-aside-v1:${B}`)) === null && !/Unsynced changes to Book Two/.test(await text()));
  check("R9: the cache is corrected from the server", JSON.parse(await storage("proupiqr-plan-limit-v1")).limit === 1);

  // R10. Another tab replaced a read-only business with the server copy (its device-only invoice set aside):
  //      this tab, which still holds the invoice in memory, takes the stored copy instead of merging it back.
  const three10 = JSON.parse(JSON.stringify(bookThree));
  three10.invoices.inv_77777777 = { ...three10.invoices.inv_00000002, id: "inv_77777777", number: "TS-0777", amountPaise: 777700, createdAt: Date.now(), updatedAt: Date.now() };
  await setup({ signedIn: false, books: { [B]: bookTwo, [C]: three10 } });
  await b.go(BASE + `/app/?tab=invoices&business=${C}`, 2500);
  check("R10: this tab shows the device-only invoice first", (await text()).includes("TS-0777"));
  await b.eval(`(async () => { const f = document.createElement('iframe'); f.src = '/terms/'; f.style.display = 'none'; document.body.appendChild(f);
    await new Promise((r) => { f.onload = r; });
    const ls = f.contentWindow.localStorage;
    ls.setItem('proupiqr-aside-v1:${C}', JSON.stringify({ at: Date.now(), reason: 'read_only', name: 'Third Shop', workspace: ${JSON.stringify(three10)} }));
    ls.setItem('proupiqr-book-reset-v1', JSON.stringify({ '${C}': 1 }));
    ls.setItem('proupiqr-book-v1:${C}', ${JSON.stringify(JSON.stringify(bookThree))});
    return true; })()`);
  await sleep(1200);
  check("R10: the other tab's reset is honoured (stored copy, not merged back)", !(await storage(`proupiqr-book-v1:${C}`)).includes("TS-0777") && !(await text()).includes("TS-0777"));
  check("R10: the set-aside copy still holds it", (await storage(`proupiqr-aside-v1:${C}`)).includes("TS-0777"));

  check("no console errors (excluding blocked Clerk CDN)", b.errors.filter((e) => !/clerk|ERR_BLOCKED|Failed to load|402|404|503/i.test(e)).length === 0, b.errors.join(" | "));
} catch (error) {
  check("test script ran to completion", false, String(error).slice(0, 500));
} finally {
  b.close();
}
process.exit(check.report());
