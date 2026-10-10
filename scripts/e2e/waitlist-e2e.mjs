// Headless Chrome test for the early-access card and Clerk scoping.
import { spawn } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";

import { OUT, devToolsPort } from "./cdp-lib.mjs"; // temp dir, never the repo
const STATIC = "http://localhost:4400";
const DEV = process.env.DEV_BASE || "http://localhost:4321";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(OUT, "profile-"));
const chrome = spawn("google-chrome", [
  "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check", "--window-size=1280,900",
], { stdio: "ignore" });
process.on("exit", () => chrome.kill());

let ws, id = 0;
const pending = new Map();
const listeners = [];
async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${await devToolsPort(profile)}/json/new?about:blank`, { method: "PUT" });
      const { webSocketDebuggerUrl } = await res.json();
      ws = new WebSocket(webSocketDebuggerUrl);
      await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
      ws.onmessage = (m) => {
        const msg = JSON.parse(m.data);
        if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
        else listeners.forEach((l) => l(msg));
      };
      return;
    } catch { await sleep(200); }
  }
  throw new Error("chrome did not start");
}
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
async function evaluate(expression) {
  const res = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (res.result?.exceptionDetails) throw new Error(JSON.stringify(res.result.exceptionDetails).slice(0, 400));
  return res.result?.result?.value;
}
let requests = [];
let consoleErrors = [];
listeners.push((m) => {
  if (m.method === "Network.requestWillBeSent") requests.push(m.params.request.url);
  if (m.method === "Runtime.exceptionThrown") consoleErrors.push(m.params.exceptionDetails?.exception?.description?.slice(0, 200));
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") consoleErrors.push(m.params.args.map((a) => a.value ?? a.description).join(" ").slice(0, 200));
});
async function go(url, settle = 2500) {
  requests = []; consoleErrors = [];
  await send("Page.navigate", { url });
  await sleep(settle);
}
async function waitFor(expr, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await evaluate(expr)) return true; await sleep(150); }
  return false;
}
async function shot(name) {
  const { result } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(OUT, name), Buffer.from(result.data, "base64"));
}
const results = [];
const check = (name, ok, detail = "") => { results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`); };
const clickButton = (re) => evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(b => ${re}.test(b.textContent) && b.offsetParent); if (!b) return false; b.click(); return true; })()`);
const cardVisible = `!!document.querySelector('aside[aria-labelledby="waitlist-title"]')`;
const stubFetch = (status) => evaluate(`(() => { window.__posts = []; const real = window.fetch; window.fetch = (u, o) => { if (String(u).includes('/api/waitlist')) { window.__posts.push({ u: String(u), body: o && o.body }); return Promise.resolve(new Response('{"ok":${status === 200}}', { status: ${status} })); } return real(u, o); }; return true; })()`);
async function typeEmail(value) {
  await evaluate(`document.getElementById('waitlist-email').focus()`);
  await evaluate(`(() => { const i = document.getElementById('waitlist-email'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ''); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await send("Input.insertText", { text: value });
}

await connect();
await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
await send("Page.setDownloadBehavior", { behavior: "deny" });

// 1. Clerk scoping on the production build.
for (const path of ["/", "/invoice-generator/", "/hi/receipt-generator/", "/upi-qr-decoder/"]) {
  await go(STATIC + path, 3500);
  const clerk = requests.filter((u) => /clerk/i.test(u));
  check(`no Clerk requests on ${path}`, clerk.length === 0, clerk.slice(0, 2).join(", "));
}
await go(STATIC + "/dynamic-qr-generator/", 5000);
check("dynamic QR page still loads Clerk", requests.some((u) => /clerk/i.test(u)), requests.filter((u) => /clerk/i.test(u)).slice(0, 2).join(", "));

// 2. Card flow on the production build, English invoice.
await go(STATIC + "/invoice-generator/", 1000);
await evaluate(`localStorage.removeItem('proupiqr-waitlist'); sessionStorage.clear(); true`);
await go(STATIC + "/invoice-generator/", 1500);
await evaluate(`document.getElementById('invoice-tool').scrollIntoView(); true`);
await waitFor(`[...document.querySelectorAll('button')].some(b => /PDF/.test(b.textContent) && b.offsetParent)`);
check("card hidden before any export", !(await evaluate(cardVisible)));
await clickButton("/PDF/");
check("card appears after PDF export", await waitFor(cardVisible, 15000));
await shot("01-invoice-card-desktop.png");
await stubFetch(503);
await typeEmail("not-an-email");
await clickButton("/Get early access/");
check("invalid email shows inline error, no request", (await evaluate(`document.getElementById('waitlist-error')?.textContent`)) === "Enter a valid email address." && (await evaluate(`window.__posts.length`)) === 0);
await typeEmail("owner@example.com");
await clickButton("/Get early access/");
await waitFor(`!!document.getElementById('waitlist-error')`);
check("server failure shows retry message", (await evaluate(`document.getElementById('waitlist-error')?.textContent`)) === "Couldn't save right now. Please try again.");
await stubFetch(200);
await evaluate(`[...document.querySelectorAll('aside input[type=checkbox]')][0].click(); true`);
await clickButton("/Get early access/");
check("success state shown", await waitFor(`/You're on the list/.test(document.querySelector('aside')?.textContent || '')`));
const post = JSON.parse(await evaluate(`window.__posts[0].body`));
check("payload is email+tool+lang+interview only", JSON.stringify(Object.keys(post).sort()) === JSON.stringify(["company", "email", "interview", "lang", "tool"]) && post.tool === "invoice" && post.interview === true && post.company === "", JSON.stringify(post));
check("request goes to /api/waitlist/ (trailing slash)", (await evaluate(`window.__posts[0].u`)) === "/api/waitlist/");
await shot("02-invoice-card-success.png");
await go(STATIC + "/invoice-generator/", 1500);
await evaluate(`document.getElementById('invoice-tool').scrollIntoView(); true`);
await waitFor(`[...document.querySelectorAll('button')].some(b => /PDF/.test(b.textContent) && b.offsetParent)`);
await clickButton("/PDF/");
await sleep(4000);
check("joined users never see the card again", !(await evaluate(cardVisible)));
check("no console errors on invoice page", consoleErrors.length === 0, consoleErrors.join(" | "));

// 3. Hindi receipt, mobile width, dismiss persistence.
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await evaluate(`localStorage.removeItem('proupiqr-waitlist'); sessionStorage.clear(); true`);
await go(STATIC + "/hi/receipt-generator/", 1500);
await evaluate(`document.getElementById('tool').scrollIntoView(); true`);
await waitFor(`[...document.querySelectorAll('button')].some(b => /PDF/.test(b.textContent) && b.offsetParent)`);
await clickButton("/PDF/");
check("Hindi card appears after receipt PDF", await waitFor(cardVisible, 15000));
check("Hindi copy rendered", /जानिए पेमेंट कब आया/.test(await evaluate(`document.querySelector('aside')?.textContent || ''`)));
check("Hindi privacy link points to /hi/privacy/", (await evaluate(`document.querySelector('aside a')?.getAttribute('href')`)) === "/hi/privacy/#early-access");
const box = await evaluate(`(() => { const r = document.querySelector('aside').getBoundingClientRect(); return { left: r.left, right: r.right, bottom: r.bottom, vw: innerWidth, vh: innerHeight }; })()`);
check("card fits mobile viewport", box.left >= 8 && box.right <= box.vw - 8 && box.bottom <= box.vh, JSON.stringify(box));
await shot("03-hi-receipt-card-mobile.png");
await clickButton("/अभी नहीं/");
check("dismiss hides card", !(await evaluate(cardVisible)));
check("dismiss persisted", /dismissed/.test(await evaluate(`localStorage.getItem('proupiqr-waitlist')`)));
await go(STATIC + "/hi/receipt-generator/", 1500);
await evaluate(`document.getElementById('tool').scrollIntoView(); true`);
await waitFor(`[...document.querySelectorAll('button')].some(b => /PDF/.test(b.textContent) && b.offsetParent)`);
await clickButton("/PDF/");
await sleep(4000);
check("dismissed card stays hidden for 30 days", !(await evaluate(cardVisible)));

// 4. Other tools fire the signal; non-target tools never mount the card.
await send("Emulation.clearDeviceMetricsOverride");
for (const [path, btn] of [["/quotation-generator/", "/PDF/"], ["/proforma-invoice-generator/", "/PDF/"], ["/payment-reminder-generator/", "/WhatsApp/"], ["/ta/invoice-generator/", "/PDF/"]]) {
  await evaluate(`localStorage.removeItem('proupiqr-waitlist'); sessionStorage.clear(); true`);
  await go(STATIC + path, 2000);
  await evaluate(`(document.getElementById('tool') || document.querySelector('[id$="-tool"]') || document.querySelector('main section:nth-of-type(2)'))?.scrollIntoView(); true`);
  await waitFor(`[...document.querySelectorAll('button')].some(b => ${btn}.test(b.textContent) && b.offsetParent)`);
  await clickButton(btn);
  check(`card appears on ${path}`, await waitFor(cardVisible, 15000));
}
await go(STATIC + "/gst-calculator/", 2500);
check("card not mounted on unrelated tool (/gst-calculator/)", (await evaluate(`document.querySelectorAll('astro-island[component-url*="WaitlistCard"]').length`)) === 0);

// 5. Live API through the dev server (no KV locally -> 503 path).
const devUp = await fetch(DEV + '/').then(() => true, () => false);
if (devUp) {
await go(DEV + "/invoice-generator/", 6000);
const live = await evaluate(`fetch('/api/waitlist/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'owner@example.com', tool: 'invoice', lang: 'en' }) }).then(r => r.status)`);
const kvUp = await fetch("http://127.0.0.1:8799/__admin/get", { method: "POST", body: JSON.stringify({ key: "waitlist:count:invoice" }) }).then((r) => r.json(), () => null);
check("dev API saves to KV (or 503 without KV)", kvUp ? live === 200 && Number(kvUp.value) >= 1 : live === 503, `${live} ${JSON.stringify(kvUp)}`);
}

console.log(results.join("\n"));
chrome.kill();
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
