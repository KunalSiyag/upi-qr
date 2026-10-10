import { checker, sleep, startBrowser } from "./cdp-lib.mjs";

const BASE = "http://localhost:4400";
const b = await startBrowser(9342);
const check = checker();
try {
  await b.send("Network.setBlockedURLs", { urls: ["*clerk.accounts.dev*", "*clerk.browser.js*"] });
  await b.go(BASE + "/app/", 500);
  await b.eval("localStorage.clear(); localStorage.setItem('proupiqr-workspace-v1', JSON.stringify({ version: 1, business: { name: 'Offline Test Shop', upiId: 'shop@okaxis', phone: '', gstin: '', invoicePrefix: 'INV-', updatedAt: 1 }, clients: {}, invoices: {} })); true");
  await b.go(BASE + "/app/", 3000);
  const manifest = await b.eval("document.querySelector('link[rel=manifest]').getAttribute('href')");
  check("/app/ links the app manifest", manifest === "/app.webmanifest");
  const m = await b.eval("fetch('/app.webmanifest').then(r => r.json())");
  check("manifest has start_url, standalone, PNG + maskable icons", m.start_url === "/app/" && m.display === "standalone" && m.icons.some((i) => i.purpose === "maskable" && i.type === "image/png") && m.icons.some((i) => i.sizes === "192x192"));
  const iconsOk = await b.eval("Promise.all(['/icons/icon-192.png','/icons/icon-512.png','/icons/icon-maskable-512.png','/icons/apple-touch-icon.png'].map(u => fetch(u).then(r => r.ok && r.headers.get('content-type').includes('png')))).then(a => a.every(Boolean))");
  check("all icons served as PNG", iconsOk);
  check("apple-touch-icon is PNG", (await b.eval("document.querySelector('link[rel=apple-touch-icon]').getAttribute('href')")) === "/icons/apple-touch-icon.png");
  check("service worker controls /app/", await b.waitFor("!!navigator.serviceWorker.controller", 10000) || (await b.go(BASE + "/app/", 3000), await b.waitFor("!!navigator.serviceWorker.controller", 10000)));
  await sleep(2500); // let the warm-cache message finish
  const cached = await b.eval("caches.open('proupiqr-v2').then(c => c.keys()).then(k => k.map(r => new URL(r.url).pathname))");
  check("app shell and its JS cached", cached.includes("/app/") && cached.some((p) => p.startsWith("/_astro/") && p.endsWith(".js")), JSON.stringify(cached.slice(0, 8)));

  // Go offline and open the app again (with a query string, as shortcuts do).
  await b.send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await b.go(BASE + "/app/?tab=invoices", 4000);
  const text = await b.eval("document.body?.innerText || ''");
  check("workspace opens offline with local data", text.includes("Offline Test Shop") && text.includes("Invoices"), text.slice(0, 200));
  await b.eval("[...document.querySelectorAll('button')].find(b => b.textContent.trim() === '+ New invoice').click(), true");
  check("app is interactive offline (new invoice sheet opens)", await b.waitFor("!!document.getElementById('ws-amount')", 5000));
  await b.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  const pill = await b.waitFor("[...document.querySelectorAll('button')].some(b => b.textContent === 'This device only')", 15000);
  check("anonymous offline user sees 'This device only', not a sync error", pill && !(await b.eval("document.body.innerText")).includes("Offline — will sync"));
  await b.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  check("no console errors (excluding blocked Clerk + offline fetches)", b.errors.filter((e) => !/clerk|ERR_BLOCKED|Failed to load|ERR_INTERNET_DISCONNECTED|Failed to fetch/i.test(e)).length === 0, b.errors.join(" | "));
} catch (error) {
  check("test script ran to completion", false, String(error).slice(0, 500));
} finally {
  b.close();
}
process.exit(check.report());
