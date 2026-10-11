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
check("card leads with the free tracker", (await evaluate(`[...document.querySelectorAll('aside a')].find(a => /Track payments free/.test(a.textContent))?.getAttribute('href')`)) === "/app/"
  && /Know when this gets paid/.test(await evaluate(`document.querySelector('aside')?.textContent || ''`)));
await shot("01-invoice-card-desktop.png");
await stubFetch(503);
await typeEmail("not-an-email");
await clickButton("/Notify me/");
check("invalid email shows inline error, no request", (await evaluate(`document.getElementById('waitlist-error')?.textContent`)) === "Enter a valid email address." && (await evaluate(`window.__posts.length`)) === 0);
await typeEmail("owner@example.com");
await clickButton("/Notify me/");
await waitFor(`!!document.getElementById('waitlist-error')`);
check("server failure shows retry message", (await evaluate(`document.getElementById('waitlist-error')?.textContent`)) === "Couldn't save right now. Please try again.");
await stubFetch(200);
await evaluate(`[...document.querySelectorAll('aside input[type=checkbox]')][0].click(); true`);
await clickButton("/Notify me/");
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
check("Hindi receipt copy rendered", /और किसका पैसा बाकी है/.test(await evaluate(`document.querySelector('aside')?.textContent || ''`)));
check("Hindi privacy link points to /hi/privacy/", (await evaluate(`document.querySelector('aside a[href*="privacy"]')?.getAttribute('href')`)) === "/hi/privacy/#early-access");
check("Hindi tracker link opens the app in Hindi", (await evaluate(`document.querySelector('aside a[href^="/app/"]')?.getAttribute('href')`)) === "/app/?lang=hi");
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
// QR generator (home): a real QR download shows shop-owner copy, and joining sends tool=upi-qr.
await evaluate(`localStorage.removeItem('proupiqr-waitlist'); sessionStorage.clear(); true`);
await go(STATIC + "/", 3000);
const setInput = (expr, value) => evaluate(`(() => { const i = ${expr}; if (!i) return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(value)}); i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
const visibleInputs = `[...document.querySelectorAll('input')].filter(i => i.offsetParent && !['checkbox', 'color', 'radio', 'range', 'file'].includes(i.type))`;
await evaluate(`${visibleInputs}.find(i => /@/.test(i.placeholder))?.scrollIntoView({ block: 'center' }); true`);
// The generator is client:visible: fill it only after React has hydrated, or hydration resets the inputs.
await waitFor(`!!document.querySelector('astro-island[component-url*="GeneratorForm"]:not([ssr])')`, 10000);
const upiIndex = `${visibleInputs}.findIndex(i => /@/.test(i.placeholder))`;
const filled = (await setInput(`${visibleInputs}[${upiIndex} - 1]`, "Shree Ganesh Store")) && (await setInput(`${visibleInputs}[${upiIndex}]`, "ganeshstore@oksbi"));
await clickButton("/Generate UPI QR/");
await waitFor(`[...document.querySelectorAll('button')].some(b => /Download QR Code/.test(b.textContent) && !b.disabled)`, 10000);
check("QR generated on home page", filled && (await evaluate(`[...document.querySelectorAll('button')].some(b => /Download QR Code/.test(b.textContent) && !b.disabled)`)));
check("card hidden before the QR download", !(await evaluate(cardVisible)));
await clickButton("/Download QR Code/");
check("card appears after QR download", await waitFor(cardVisible, 10000));
check("QR card speaks to shops with credit customers", /Customers who pay later\?/.test(await evaluate(`document.querySelector('aside')?.textContent || ''`)));
await shot("04-home-qr-card-desktop.png");
await stubFetch(200);
await typeEmail("shop@example.com");
await clickButton("/Notify me/");
await waitFor(`/You're on the list/.test(document.querySelector('aside')?.textContent || '')`);
check("QR card joins with tool=upi-qr", JSON.parse((await evaluate(`window.__posts[0]?.body`)) || "{}").tool === "upi-qr");
check("tracker link stays after joining", await evaluate(`!!document.querySelector('aside a[href="/app/"]') && /You're on the list/.test(document.querySelector('aside').textContent)`));

// Hindi home: same card in Hindi. International home: the card isn't mounted at all.
await evaluate(`localStorage.removeItem('proupiqr-waitlist'); sessionStorage.clear(); true`);
await go(STATIC + "/hi/", 3500);
await evaluate(`document.querySelector('input[placeholder*="@"]')?.scrollIntoView({ block: 'center' }); true`);
await waitFor(`!!document.querySelector('astro-island[component-url*="GeneratorForm"]:not([ssr])')`, 10000);
await evaluate(`window.dispatchEvent(new CustomEvent('proupiqr:tool-output', { detail: { tool: 'upi-qr' } })); true`);
check("Hindi home shows the Hindi shop card", await waitFor(`/ग्राहक बाद में पैसे देते हैं/.test(document.querySelector('aside')?.textContent || '')`, 6000));
await evaluate(`localStorage.removeItem('proupiqr-waitlist'); sessionStorage.clear(); true`);
await go(STATIC + "/es/", 3500);
await evaluate(`document.querySelector('input[placeholder*="@"]')?.scrollIntoView({ block: 'center' }); true`);
await waitFor(`!!document.querySelector('astro-island[component-url*="GeneratorForm"]:not([ssr])')`, 10000);
await evaluate(`window.dispatchEvent(new CustomEvent('proupiqr:tool-output', { detail: { tool: 'upi-qr' } })); true`);
await sleep(1500);
check("no tracker card on international pages (/es/)", !(await evaluate(cardVisible)));

await go(STATIC + "/gst-calculator/", 2500);
check("card not mounted on unrelated tool (/gst-calculator/)", (await evaluate(`document.querySelectorAll('astro-island[component-url*="WaitlistCard"]').length`)) === 0);

// 6. Funnel steps: a browser session reports a free-tool output and a tracker open once each,
// with nothing but the step name (the static server can't take the POST; only the request is checked).
const beacons = [];
// Intercept the reports (the static server has no API) and read each body before answering 204.
listeners.push((m) => {
  if (m.method !== "Fetch.requestPaused") return;
  const { postData, postDataEntries } = m.params.request;
  beacons.push(postData ?? (postDataEntries ?? []).map((e) => Buffer.from(e.bytes ?? "", "base64").toString()).join(""));
  send("Fetch.fulfillRequest", { requestId: m.params.requestId, responseCode: 204 });
});
await send("Fetch.enable", { patterns: [{ urlPattern: "*/api/v1/events/*", requestStage: "Request" }] });
const beaconBodies = async () => beacons.slice();
await go(STATIC + "/invoice-generator/", 1000);
await evaluate(`localStorage.removeItem('proupiqr-waitlist'); sessionStorage.clear(); true`);
await go(STATIC + "/invoice-generator/", 1500);
beacons.length = 0;
await evaluate(`document.getElementById('invoice-tool').scrollIntoView(); true`);
await waitFor(`[...document.querySelectorAll('button')].some(b => /PDF/.test(b.textContent) && b.offsetParent)`);
await clickButton("/PDF/");
await waitFor(cardVisible, 15000);
await sleep(800);
await clickButton("/PDF/");
await sleep(1500);
const afterExports = await beaconBodies();
check("two exports in one visit report tool_output once", afterExports.filter((b) => b.includes("tool_output")).length === 1, JSON.stringify(afterExports));
await evaluate(`[...document.querySelectorAll('aside a')].find(a => /Track payments free/.test(a.textContent)).click(); true`);
await sleep(2500);
const afterTracker = await beaconBodies();
check("opening the tracker from the card reports tracker_opened", afterTracker.some((b) => b.includes("tracker_opened")), JSON.stringify(afterTracker));
check("funnel reports carry only the step name", afterTracker.length > 0 && afterTracker.every((b) => /^\{"step":"(tool_output|tracker_opened)"\}$/.test(b)), JSON.stringify(afterTracker));
await send("Fetch.disable");

// 5. Live API through the dev server (no KV locally -> 503 path).
const devUp = await fetch(DEV + '/').then(() => true, () => false);
if (devUp) {
await go(DEV + "/invoice-generator/", 6000);
const live = await evaluate(`fetch('/api/waitlist/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'owner@example.com', tool: 'invoice', lang: 'en' }) }).then(r => r.status)`);
const kvUp = await fetch("http://127.0.0.1:8799/__admin/get", { method: "POST", body: JSON.stringify({ key: "waitlist:count:invoice" }) }).then((r) => r.json(), () => null);
check("dev API saves to KV (or 503 without KV)", kvUp ? live === 200 && Number(kvUp.value) >= 1 : live === 503, `${live} ${JSON.stringify(kvUp)}`);
const liveQr = await evaluate(`fetch('/api/waitlist/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'shop@example.com', tool: 'upi-qr', lang: 'en' }) }).then(r => r.status)`);
check("dev API accepts tool=upi-qr", kvUp ? liveQr === 200 : liveQr === 503, String(liveQr));
}

console.log(results.join("\n"));
chrome.kill();
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
