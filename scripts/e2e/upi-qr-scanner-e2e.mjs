// UPI QR scanner (/upi-qr-scanner/ and its hi/ta/te/mr pages), in a real browser with a fake camera feed.
// Static suite: it serves .vercel/output/static itself and applies the headers of the real vercel.json (through
// Vercel's own routing utils), because the plain python server sends none, and a Permissions-Policy, CSP or CORP
// mistake would otherwise pass. Chrome flags: --use-fake-device-for-media-stream with a QR (or blank) Y4M clip made
// here from the repo's `qrcode` package, so no video file is committed. Every browser here gets the fake device:
// a machine with a webcam would otherwise open the real one, so there is no "no camera at all" run; that branch
// (NotFoundError) is covered by making getUserMedia throw it.
import http from "node:http";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import { checker, OUT, sleep, startBrowser } from "./cdp-lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const STATIC = join(ROOT, ".vercel", "output", "static");
const check = checker();
const require = createRequire(import.meta.url);

/* ---------- a static server that sends the real vercel.json headers ---------- */
const { getTransformedRoutes } = require("@vercel/routing-utils");
const vercel = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8"));
const transformed = getTransformedRoutes({ headers: vercel.headers });
if (transformed.error) throw new Error(`vercel.json headers: ${transformed.error.message}`);
const headersFor = (pathname) => {
  const headers = {};
  for (const route of transformed.routes) if (new RegExp(route.src).test(pathname)) Object.assign(headers, route.headers);
  return headers;
};
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".avif": "image/avif", ".woff2": "font/woff2", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml", ".webmanifest": "application/manifest+json" };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let file = join(STATIC, pathname);
  if (!file.startsWith(STATIC)) { res.writeHead(403); return res.end(); }
  if (existsSync(file) && statSync(file).isDirectory()) {
    if (!pathname.endsWith("/")) { res.writeHead(308, { Location: `${pathname}/` }); return res.end(); }
    file = join(file, "index.html");
  }
  if (!existsSync(file)) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("not found"); }
  res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream", ...headersFor(pathname) });
  res.end(readFileSync(file));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const BASE = `http://127.0.0.1:${server.address().port}`;
const ORIGIN = new URL(BASE).origin;

/* ---------- fake camera clips and photos (all under E2E_OUT) ---------- */
const DIR = join(OUT, "scanner");
mkdirSync(DIR, { recursive: true });
const PAYLOAD = "upi://pay?pa=counter.shop@okaxis&pn=Counter%20Shop&am=25.00&cu=INR&tn=Order%2042";
function writeClip(file, text) {
  const W = 640, H = 480;
  const Y = Buffer.alloc(W * H, 255), U = Buffer.alloc((W * H) / 4, 128), V = Buffer.alloc((W * H) / 4, 128);
  if (text !== null) {
    const modules = QRCode.create(text, { errorCorrectionLevel: "M" }).modules;
    const total = modules.size + 8;
    const scale = Math.floor(400 / total);
    const side = total * scale;
    const ox = (W - side) >> 1, oy = (H - side) >> 1;
    for (let row = 0; row < modules.size; row++) for (let col = 0; col < modules.size; col++) {
      if (!modules.get(row, col)) continue;
      for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) Y[(oy + (row + 4) * scale + dy) * W + ox + (col + 4) * scale + dx] = 0;
    }
  }
  const frame = Buffer.concat([Buffer.from("FRAME\n"), Y, U, V]);
  writeFileSync(file, Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`), frame, frame, frame]));
}
const QR_CLIP = join(DIR, "qr.y4m");
const BLANK_CLIP = join(DIR, "blank.y4m");
writeClip(QR_CLIP, PAYLOAD);
writeClip(BLANK_CLIP, null);
const photo = join(DIR, "qr-photo.png");
writeFileSync(photo, await QRCode.toBuffer("upi://pay?pa=photo.shop@ybl&pn=Photo%20Shop&am=99", { width: 480, margin: 4, errorCorrectionLevel: "M" }));
const notImage = join(DIR, "not-an-image.png");
writeFileSync(notImage, "this is text, not a picture");
const cameraFlags = (clip) => ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-video-capture=${clip}`];

/* ---------- page-side instrumentation ---------- */
const INIT = `(() => {
  window.__streams = [];
  window.__net = [];
  const md = navigator.mediaDevices;
  if (md && md.getUserMedia) {
    const real = md.getUserMedia.bind(md);
    md.getUserMedia = async (constraints) => {
      window.__gum = (window.__gum || 0) + 1;
      window.__constraints = JSON.stringify(constraints);
      if (window.__gumFail) throw new DOMException("simulated", window.__gumFail);
      const stream = await real(constraints);
      window.__streams.push(stream);
      return stream;
    };
  }
  const log = (kind, url, body) => window.__net.push({ kind, url: String(url), body: body == null ? "" : String(body).slice(0, 300) });
  const realFetch = window.fetch;
  window.fetch = function (input, init) { log("fetch", input && input.url ? input.url : input, init && init.body); return realFetch.apply(this, arguments); };
  const realOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) { log("xhr", url); return realOpen.apply(this, arguments); };
  if (navigator.sendBeacon) { const realBeacon = navigator.sendBeacon.bind(navigator); navigator.sendBeacon = (url, data) => { log("beacon", url, data); return realBeacon(url, data); }; }
  window.WebSocket = new Proxy(window.WebSocket, { construct(target, args) { log("websocket", args[0]); return new target(...args); } });
})();`;

// WCAG 2 contrast of every visible text on the page against what is behind it (4.5:1, or 3:1 for large text).
const CONTRAST_PROBE = `(() => {
  const parse = (c) => { const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const backdrop = (el) => { const layers = []; for (let n = el; n; n = n.parentElement) { const bg = parse(getComputedStyle(n).backgroundColor); if (bg && bg.a > 0) { layers.push(bg); if (bg.a === 1) break; } } let base = { r: 255, g: 255, b: 255, a: 1 }; for (const l of layers.reverse()) base = over(l, base); return base; };
  const details = [...document.querySelectorAll('main details')];
  const wasOpen = details.map((d) => d.open);
  details.forEach((d) => { d.open = true; });
  const bad = [];
  const walker = document.createTreeWalker(document.querySelector('main'), NodeFilter.SHOW_TEXT);
  const seen = new Set();
  let measured = 0;
  for (let node; (node = walker.nextNode()); ) {
    const text = node.textContent.trim();
    const el = node.parentElement;
    if (!text || seen.has(el) || el.closest('script,style') || !el.getClientRects().length) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    seen.add(el);
    const fg0 = parse(cs.color);
    if (!fg0) continue;
    const bg = backdrop(el);
    const size = parseFloat(cs.fontSize);
    const large = size >= 24 || (size >= 18.66 && parseInt(cs.fontWeight, 10) >= 700);
    const r = ratio(over(fg0, bg), bg);
    measured += 1;
    if (r < (large ? 3 : 4.5)) bad.push(Math.round(r * 100) / 100 + ' ' + text.slice(0, 40));
  }
  details.forEach((d, i) => { d.open = wasOpen[i]; });
  return { measured, bad };
})()`;

/* ---------- helpers bound to one browser ---------- */
async function launch(flags) {
  const b = await startBrowser(0, flags);
  const requests = [];
  const violations = [];
  const failed = []; // requests that errored or came back 4xx/5xx
  b.on("Network.requestWillBeSent", (p) => requests.push(p.request.url));
  b.on("Network.responseReceived", (p) => { if (p.response.status >= 400) failed.push(`${p.response.status} ${p.response.url}`); });
  b.on("Network.loadingFailed", (p) => { if (p.canceled !== true) failed.push(`${p.errorText} ${p.requestId}`); });
  b.on("Log.entryAdded", (p) => { if (/Content Security Policy|Refused to|Permissions policy|Permissions-Policy/i.test(p.entry.text ?? "")) violations.push(p.entry.text.slice(0, 200)); });
  await b.send("Log.enable");
  await b.send("Page.addScriptToEvaluateOnNewDocument", { source: INIT });
  const q = (selector) => JSON.stringify(selector);
  const t = {
    b, requests, violations, failed,
    text: (selector) => b.eval(`document.querySelector(${q(selector)})?.innerText ?? ""`),
    has: (selector) => b.eval(`!!document.querySelector(${q(selector)})`),
    click: (selector) => b.eval(`document.querySelector(${q(selector)}).click(), true`),
    set: (selector, value) => b.eval(`(() => { const el = document.querySelector(${q(selector)}); const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`),
    hydrated: () => b.waitFor("[...document.querySelectorAll('astro-island')].some((i) => i.querySelector('[data-scanner-start]')) && ![...document.querySelectorAll('astro-island')].some((i) => i.hasAttribute('ssr'))", 10000),
    open: async (path, settle = 1200) => {
      await b.go(`${BASE}${path}`, settle);
      await b.eval("document.querySelector('astro-island')?.scrollIntoView({ block: 'center' }), true");
      return t.hydrated();
    },
    fields: () => b.eval(`[...document.querySelectorAll('[data-scanner-result] dt')].map((dt) => ({ label: dt.firstChild.textContent.trim(), key: dt.querySelector('span')?.textContent ?? '', value: dt.nextElementSibling.innerText }))`),
    flags: () => b.eval("[...document.querySelectorAll('[data-scanner-flags] [data-flag]')].map((li) => li.dataset.flag)"),
    flagLevels: () => b.eval("[...document.querySelectorAll('[data-scanner-flags] [data-flag]')].map((li) => li.innerText.split(':')[0])"),
    reset: async () => {
      if (await t.has("[data-scanner-result]")) { await t.click("[data-scanner-again]"); await b.waitFor("!document.querySelector('[data-scanner-result]')", 3000); }
    },
    seen: [], // the words of every result read through t.read, for the wording check at the end
    read: async (text) => {
      await t.reset();
      await t.set("[data-scanner-paste]", text);
      await t.click("[data-scanner-read]");
      const shown = await b.waitFor("!!document.querySelector('[data-scanner-result]')", 4000);
      if (shown) t.seen.push(await t.text("[data-scanner-result]"));
      return shown;
    },
    files: async (selector, paths) => {
      const doc = (await b.send("DOM.getDocument", { depth: 0 })).result.root.nodeId;
      const node = (await b.send("DOM.querySelector", { nodeId: doc, selector })).result.nodeId;
      await b.send("DOM.setFileInputFiles", { files: paths, nodeId: node });
    },
    streamsEnded: () => b.eval("window.__streams.length > 0 && window.__streams.every((s) => s.getTracks().every((tr) => tr.readyState === 'ended'))"),
    streamsLive: () => b.eval("window.__streams.length > 0 && window.__streams.at(-1).getTracks().every((tr) => tr.readyState === 'live')"),
  };
  return t;
}
// A read scrolls its heading into view (smoothly, unless the visitor asked for less motion): wait until it stops.
async function settled(b) {
  let last = -1;
  for (let i = 0; i < 40; i++) {
    const y = await b.eval("Math.round(scrollY)");
    if (y === last) return;
    last = y;
    await sleep(150);
  }
}
const headingInView = (b) => b.eval(`(() => { const bar = document.querySelector('.fixed.inset-x-0.top-0'); const top = bar ? bar.getBoundingClientRect().bottom : 64; const r = document.getElementById('scanner-result-heading').getBoundingClientRect(); return r.top >= top - 1 && r.bottom <= innerHeight; })()`);
const BANNED = /\b(valid|verified|genuine|safe|registered|authentic|trusted|real|fake|suspicious)\b/i;
const tolerant = (list) => list.filter((e) => !/ERR_BLOCKED|Failed to load resource|_vercel|favicon/i.test(e));

try {
  /* ============ A: fake camera with a UPI QR in front of it ============ */
  const A = await launch(cameraFlags(QR_CLIP));
  const a = A.b;
  check("the page hydrates", await A.open("/upi-qr-scanner/"));
  const hasDetector = await a.eval("'BarcodeDetector' in window");
  console.log(`# decoder in this Chrome: ${hasDetector ? "BarcodeDetector" : "jsQR fallback"}`);

  // head, headings, copy
  check("one H1 with the product name", (await a.eval("[...document.querySelectorAll('h1')].map((h) => h.textContent.trim())")).join("|") === "UPI QR Code Scanner & Reader");
  const head = await a.eval("({ title: document.title, description: document.querySelector('meta[name=description]').content, robots: document.querySelector('meta[name=robots]').content, canonical: document.querySelector('link[rel=canonical]').href })");
  check("title is 20-70 characters", head.title.length >= 20 && head.title.length <= 70, head.title);
  check("description is 70-170 characters", head.description.length >= 70 && head.description.length <= 170, String(head.description.length));
  check("indexable and canonical", /^index/.test(head.robots) && head.canonical === "https://www.proupiqr.in/upi-qr-scanner/", `${head.robots} ${head.canonical}`);
  const notice = "Camera frames are processed on your device and never uploaded or saved. Check the payee name your UPI app shows before you pay.";
  check("the one-line notice is visible, above the controls and in the first screen", await a.eval(`(() => { const n = document.querySelector('[data-scanner-notice]'); const s = document.querySelector('[data-scanner-start]'); const r = n.getBoundingClientRect(); return n.innerText.trim() === ${JSON.stringify(notice)} && r.height > 0 && r.top < innerHeight && !!(n.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING); })()`));
  check("need a QR for your shop? links to the generators", await a.eval("(() => { const p = [...document.querySelectorAll('main p')].find((x) => /Need a QR for your shop/.test(x.textContent)); return !!p && [...p.querySelectorAll('a')].map((l) => l.getAttribute('href')).join() === '/,/universal-qr-generator/'; })()"));
  const main = await a.eval("({ words: document.querySelector('main').textContent.split(/\\s+/).filter(Boolean).length, faqs: document.querySelectorAll('main details').length, h2: document.querySelectorAll('main h2').length, text: document.querySelector('main').textContent })");
  check("at least 700 words of main content", main.words >= 700, String(main.words));
  check("at least 7 FAQ items, each closed until opened", main.faqs >= 7 && (await a.eval("[...document.querySelectorAll('main details')].every((d) => !d.open)")), String(main.faqs));
  check("no banned wording anywhere in the page copy", !/\b(fake|dummy|prank|verified|genuine|authentic|registered|trusted|100% secure|looks safe)\b/i.test(main.text), (main.text.match(/\b(fake|dummy|prank|verified|genuine|authentic|registered|trusted|100% secure|looks safe)\b/i) ?? [""])[0]);
  const safeSentences = main.text.split(/(?<=[.?!])\s+/).filter((s) => /\bsafe\b/i.test(s));
  check("'safe' appears only in the question people ask", safeSentences.every((s) => /Is it safe to scan/i.test(s)), safeSentences.join(" | ").slice(0, 200));
  check("external links open safely", await a.eval("[...document.querySelectorAll('main a[href^=http]')].every((l) => l.target === '_blank' && l.rel === 'noopener noreferrer nofollow')"));
  check("last reviewed line names the author and the accuracy policy", await a.eval("(() => { const p = [...document.querySelectorAll('main p')].find((x) => /Last reviewed/.test(x.textContent)); return !!p && /1 November 2026/.test(p.textContent) && !!p.querySelector('a[href=\"/authors/kunal-siyag/\"]') && !!p.querySelector('a[href=\"/accuracy-policy/\"]'); })()"));
  const schema = await a.eval("[...document.querySelectorAll('script[type=\"application/ld+json\"]')].map((s) => JSON.parse(s.textContent))");
  const types = JSON.stringify(schema);
  check("schema: WebApplication, FAQPage, HowTo and exactly one custom BreadcrumbList, no rating or review", (types.match(/"@type":"BreadcrumbList"/g) ?? []).length === 1 && /"@type":"WebApplication"/.test(types) && /"@type":"FAQPage"/.test(types) && /"@type":"HowTo"/.test(types) && !/aggregateRating|"review"/i.test(types));
  const nodes = schema.flatMap((s) => s["@graph"] ?? [s]);
  const howTo = nodes.find((n) => n["@type"] === "HowTo");
  const stepsShown = await a.eval("document.querySelector('main ol').innerText");
  check("HowTo steps are the three steps shown on the page, word for word", howTo?.step?.length === 3 && howTo.step.every((s) => stepsShown.includes(s.name) && stepsShown.includes(s.text)), JSON.stringify(howTo?.step?.map((s) => s.name)));
  const faqNode = nodes.find((n) => n["@type"] === "FAQPage");
  const faqShown = await a.eval("[...document.querySelectorAll('main details')].map((d) => d.querySelector('summary').textContent.trim() + '|' + d.querySelector('p').textContent.trim())");
  check("FAQPage markup mirrors the visible questions and answers", faqNode?.mainEntity?.length === faqShown.length && faqNode.mainEntity.every((q, i) => `${q.name}|${q.acceptedAnswer.text}` === faqShown[i]), `${faqNode?.mainEntity?.length} vs ${faqShown.length}`);
  const app = nodes.find((n) => n["@type"] === "WebApplication");
  check("WebApplication: free, with author, publisher, dateModified and no rating", app?.offers?.price === "0" && app.author?.["@type"] === "Person" && app.publisher?.["@id"] === "https://www.proupiqr.in/#organization" && app.dateModified === "2026-11-01" && app.applicationCategory === "FinanceApplication", JSON.stringify(app)?.slice(0, 200));
  const crumbs = JSON.stringify(schema.flatMap((s) => s["@graph"] ?? [s]).find((n) => n["@type"] === "BreadcrumbList")?.itemListElement.map((i) => [i.position, i.name, i.item]));
  check("breadcrumb: Home, All Tools, UPI QR Scanner (last = canonical)", crumbs === JSON.stringify([[1, "Home", "https://www.proupiqr.in/"], [2, "All Tools", "https://www.proupiqr.in/tools/"], [3, "UPI QR Scanner", "https://www.proupiqr.in/upi-qr-scanner/"]]), crumbs);

  // accessibility basics
  check("three polite status regions (camera, photo, paste) before any read", (await a.eval("[...document.querySelectorAll('[role=status][aria-live=polite]')].length")) === 3);
  check("the jsQR decoder is not downloaded until a camera or photo needs it", !A.requests.some((u) => /jsqr/i.test(u)), A.requests.filter((u) => /jsqr/i.test(u)).join(" "));
  check("every button, input and label has a name; inputs have labels", await a.eval(`(() => {
    const named = [...document.querySelectorAll('main button, main label')].every((el) => el.innerText.trim().length > 0);
    const inputs = [...document.querySelectorAll('[data-scanner-paste], [data-scanner-take], [data-scanner-pick]')];
    return named && inputs.length === 3 && inputs.every((el) => !!document.querySelector('label[for="' + el.id + '"]')) && !document.querySelector('[data-scanner-expected]');
  })()`));
  check("the preview has a text label and the photo input asks for the rear camera", await a.eval("document.querySelector('video').getAttribute('aria-label') === 'Camera preview' && document.querySelector('[data-scanner-take]').getAttribute('capture') === 'environment' && document.querySelector('[data-scanner-take]').accept === 'image/*' && document.querySelector('[data-scanner-pick]').accept === 'image/*' && !document.querySelector('[data-scanner-pick]').hasAttribute('capture')"));
  check("targets are at least 24px", await a.eval("[...document.querySelectorAll('main button, main label[for], main summary')].filter((e) => e.offsetParent !== null && !e.classList.contains('sr-only')).every((e) => { const r = e.getBoundingClientRect(); return r.width >= 24 && r.height >= 24; })"), await a.eval("[...document.querySelectorAll('main button, main label[for], main summary')].filter((e) => e.offsetParent !== null && !e.classList.contains('sr-only')).filter((e) => { const r = e.getBoundingClientRect(); return r.width < 24 || r.height < 24; }).map((e) => e.tagName + ':' + e.textContent.trim().slice(0, 20)).join(' | ')"));
  // keyboard: Tab reaches the camera button and the photo input; the focused photo input outlines its label
  await a.eval("document.querySelector('[data-scanner-start]').focus(), true");
  let reached = " start";
  for (let i = 0; i < 6 && !/take/.test(reached); i++) {
    await a.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    await a.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    reached += ` ${await a.eval("document.activeElement.hasAttribute('data-scanner-start') ? 'start' : document.activeElement.hasAttribute('data-scanner-take') ? 'take' : document.activeElement.tagName")}`;
  }
  check("keyboard order: camera button, then the photo buttons", /start.*take/.test(reached), reached);
  check("a focused photo input shows its label's focus ring", await a.eval("(() => { const l = document.querySelector('label[for=\"' + document.querySelector('[data-scanner-take]').id + '\"]'); const s = getComputedStyle(l); return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2; })()"));

  // headers the page is served with (real vercel.json): the camera is allowed here and nowhere else
  const policy = async (path) => (await fetch(`${BASE}${path}`, { redirect: "manual" })).headers.get("permissions-policy");
  const SCANNER_POLICY = "camera=(self), geolocation=(), microphone=()";
  const GLOBAL_POLICY = "camera=(), geolocation=(), microphone=()";
  for (const path of ["/upi-qr-scanner/", "/hi/upi-qr-scanner/", "/ta/upi-qr-scanner/", "/te/upi-qr-scanner/", "/mr/upi-qr-scanner/", "/es/upi-qr-scanner/"]) check(`${path} allows the camera for itself`, (await policy(path)) === SCANNER_POLICY, String(await policy(path)));
  for (const path of ["/", "/upi-qr-decoder/", "/hi/", "/hi/upi-qr-decoder/", "/tools/", "/embed/"]) check(`${path} keeps the camera blocked`, (await policy(path)) === GLOBAL_POLICY, String(await policy(path)));
  check("the page also carries the real CSP", /default-src 'self'/.test((await fetch(`${BASE}/upi-qr-scanner/`)).headers.get("content-security-policy") ?? ""));
  check("the browser agrees: this page may use the camera", await a.eval("(document.permissionsPolicy ?? document.featurePolicy).allowsFeature('camera')"));

  // nothing starts by itself
  check("the camera does not start on load", await a.eval("(window.__gum || 0) === 0 && document.querySelector('video').srcObject === null"));
  check("no storage and no cookies on load", await a.eval("localStorage.length === 0 && sessionStorage.length === 0 && document.cookie === ''"));

  // camera: tap, read the QR in the feed, stop by itself
  const before = await a.eval("(() => { const r = document.querySelector('video').parentElement.getBoundingClientRect(); return { h: Math.round(r.height), w: Math.round(r.width), startTop: Math.round(document.querySelector('[data-scanner-start]').getBoundingClientRect().top + scrollY) }; })()");
  check("the start button reads Start camera", (await A.text("[data-scanner-start]")).trim() === "Start camera");
  await A.click("[data-scanner-start]");
  check("a tap starts the camera and the button becomes Stop camera", await a.waitFor("window.__gum === 1 && document.querySelector('[data-scanner-start]').innerText.trim() !== 'Start camera'", 5000));
  check("the QR in the camera feed is read", await a.waitFor("!!document.querySelector('[data-scanner-result]')", 20000));
  await sleep(300);
  check("it asked for the rear camera, video only", await a.eval("(() => { const c = JSON.parse(window.__constraints); return c.audio === false && JSON.stringify(c.video.facingMode) === '{\"ideal\":\"environment\"}'; })()"));
  const camFields = await A.fields();
  const camValue = (key) => camFields.find((f) => f.key === key)?.value;
  check("camera read: UPI ID, name and amount", camValue("pa") === "counter.shop@okaxis" && camValue("pn") === "Counter Shop" && camValue("am") === "₹25.00" && camValue("tn") === "Order 42", JSON.stringify(camFields));
  check("camera read: one fixed-amount note, no checks", JSON.stringify((await A.flags()).sort()) === JSON.stringify(["amount-fixed", "name-unverified"]) && !(await A.flagLevels()).includes("Check"));
  check("the box for the ID you expect sits inside the result, with a label and a hint", await a.eval(`(() => { const i = document.querySelector('[data-scanner-result] [data-scanner-expected]'); if (!i) return false; const l = document.querySelector('label[for="' + i.id + '"]'); const d = document.getElementById(i.getAttribute('aria-describedby')); return !!l && /UPI ID you expect to pay/.test(l.innerText) && !!d && /Type the UPI ID you were given\\. This page then says whether the QR has the same ID\\./.test(d.innerText) && i.value === ''; })()`));
  check("a read adds a fourth polite region, for the comparison with the typed ID", (await a.eval("[...document.querySelectorAll('[role=status][aria-live=polite]')].length")) === 4);
  check("the jsQR decoder was fetched once, after the tap (this Chrome has no BarcodeDetector)", hasDetector || A.requests.filter((u) => /jsqr/i.test(u)).length === 1, A.requests.filter((u) => /jsqr/i.test(u)).join(" "));
  check("a read stops the camera: every track has ended", await A.streamsEnded());
  check("a read releases the preview and the button says Start camera again", await a.eval("document.querySelector('video').srcObject === null && document.querySelector('[data-scanner-start]').innerText.trim() === 'Start camera'"));
  check("the camera status says it stopped", /QR code read\. The camera has stopped\./.test(await A.text("[data-scanner-status=camera]")));
  check("focus moves to the result heading", await a.eval("document.activeElement.id === 'scanner-result-heading'"));
  await settled(a);
  check("the result heading is in view, below the fixed header", await headingInView(a), await a.eval("JSON.stringify(document.getElementById('scanner-result-heading').getBoundingClientRect())"));
  check("the result links nowhere and opens nothing", await a.eval("document.querySelectorAll('[data-scanner-result] a').length === 0 && !document.querySelector('a[href^=\"upi:\"]') && window.__opened.length === 0"));
  check("the result card does not animate", await a.eval("getComputedStyle(document.querySelector('[data-scanner-result]')).animationName === 'none'"));
  await a.shot("scanner-desktop-camera-result.png");
  check("the preview box kept its size (no layout shift)", await a.eval(`(() => { const r = document.querySelector('video').parentElement.getBoundingClientRect(); return Math.round(r.height) === ${before.h} && Math.round(r.width) === ${before.w}; })()`));

  // compare with the ID I expected
  await A.set("[data-scanner-expected]", "  Counter.Shop@OKAXIS ");
  check("same ID once trimmed and ignoring case: 'Matches the ID you typed'", /Matches the ID you typed\./.test(await A.text("[data-scanner-compare]")));
  await A.set("[data-scanner-expected]", "counter.shop@okicici");
  const differ = await A.text("[data-scanner-compare]");
  check("another ID: 'Does not match the ID you typed', in words", /Does not match the ID you typed\./.test(differ) && /Do not pay unless you can explain why/.test(differ));
  const contrast = await a.eval(CONTRAST_PROBE);
  check(`text contrast: all ${contrast.measured} visible texts reach 4.5:1 (3:1 when large), a mismatch and the FAQ open`, contrast.measured > 100 && contrast.bad.length === 0, contrast.bad.join(" | "));
  await A.set("[data-scanner-expected]", "");
  check("clearing the field clears the comparison", (await A.text("[data-scanner-compare]")).trim() === "");
  await A.set("[data-scanner-expected]", "counter.shop@okaxis");

  // paste: the NPCI draft's sample, then the wording on every kind of text
  check("paste: the NPCI sample link is read", await A.read("upi://pay?pa=bivek@npci&pn=bivek%20rath&mc=9999&tid=cxnkjcnkjdfdvjndkjfvn&tr=4894398cndhcd23&tn=Pay%20to%20mystar%20store&am=10&mam=null&cu=INR&url=https://mystar.com&mode=05&orgid=000000&mid=1234&msid=3432&mtid=1212"));
  const npci = await A.fields();
  const npciValue = (key) => npci.find((f) => f.key === key)?.value;
  check("sample: UPI ID, payee name, ₹10.00, note and reference", npciValue("pa") === "bivek@npci" && npciValue("pn") === "bivek rath" && npciValue("am") === "₹10.00" && npciValue("tn") === "Pay to mystar store" && npciValue("tr") === "4894398cndhcd23", JSON.stringify(npci.slice(0, 5)));
  check("sample: four notes, no checks", JSON.stringify((await A.flags()).sort()) === JSON.stringify(["amount-fixed", "name-unverified", "unsigned", "url-param"]) && !(await A.flagLevels()).includes("Check"), JSON.stringify(await A.flags()));
  check("sample: the typed ID (counter.shop) does not match bivek@npci", /Does not match/.test(await A.text("[data-scanner-compare]")));
  check("sample: the url is shown as text, not as a link", (npciValue("url") === "https://mystar.com") && (await a.eval("document.querySelectorAll('[data-scanner-result] a').length === 0")));
  check("sample: the paste status says it was read", (await A.text("[data-scanner-status=paste]")).trim() === "QR code read.");
  check("sample: three 'before you pay' bullets and the 'does not show' line", await a.eval("document.querySelectorAll('[data-scanner-result] h3 + ul li').length === 3 && /does not show that the UPI ID exists or who owns it/.test(document.querySelector('[data-scanner-result]').innerText)"));
  check("sample: the full text is available but collapsed", await a.eval("(() => { const d = document.querySelector('[data-scanner-result] details'); return !d.open && d.querySelector('pre').textContent.startsWith('upi://pay?pa=bivek@npci'); })()"));
  await A.set("[data-scanner-expected]", "BIVEK@npci");
  check("sample: and it matches once the expected ID is the sample's", /Matches the ID you typed/.test(await A.text("[data-scanner-compare]")));

  const resultWords = async () => (await A.text("[data-scanner-result]"));
  check("the web link trick: host is evil.example and the text before @ is a username", await A.read("https://paypal.com@evil.example/login"));
  const evil = await A.fields();
  check("web link: kind, site name, no UPI ID", (await A.text("[data-scanner-kind]")) === "Web address" && evil.find((f) => f.label === "Site name")?.value === "evil.example" && !evil.some((f) => f.key === "pa"), JSON.stringify(evil));
  check("web link: a check, in words; no UPI ID, no box to compare one, nothing reassuring", (await A.flagLevels()).includes("Check") && /username, not the site/.test(await resultWords()) && !BANNED.test(await resultWords()) && !(await A.has("[data-scanner-expected]")) && !(await A.has("[data-scanner-compare]")));
  check("mailto: other text, not opened", (await A.read("mailto:someone@example.com?subject=Hi")) && (await A.text("[data-scanner-kind]")) === "Other QR text" && (await A.flags()).includes("other-scheme"));
  check("AutoPay: a check that approving lets the payee debit again", (await A.read("upi://mandate?pa=shop@icici&pn=Shop&am=649.00&cu=INR&tn=Plan")) && /UPI AutoPay mandate/.test(await A.text("[data-scanner-kind]")) && (await A.flagLevels()).includes("Check") && /take money from your account again/.test(await resultWords()));
  await A.set("[data-scanner-expected]", "shop@icici");
  check("AutoPay: the payee ID can be compared too", /Matches the ID you typed/.test(await A.text("[data-scanner-compare]")));
  check("another upi:// action: warned, not read", (await A.read("upi://collect?pa=a@ybl&pn=X&am=5")) && (await A.flags()).includes("other-action") && (await A.flagLevels()).includes("Check"));
  check("repeated parameters are listed, both copies", (await A.read("upi://pay?pa=good@ybl&pa=evil@ybl&pn=A&am=1")) && (await A.flags()).includes("duplicate-params") && /evil@ybl/.test(await resultWords()) && /Repeated parameter/.test(await resultWords()));
  check("a missing UPI ID and name are checks", (await A.read("upi://pay?am=10")) && JSON.stringify((await A.flags()).filter((c) => c.endsWith("-missing")).sort()) === JSON.stringify(["pa-missing", "pn-missing"]) && /Not in the QR/.test(await resultWords()));
  check("no amount: told you type it in your app", (await A.read("upi://pay?pa=a@ybl&pn=A")) && /Not set in the QR: you type the amount in your UPI app/.test(await resultWords()));
  check("a hidden direction mark is made visible and flagged", (await A.read("upi://pay?pa=a@ybl&pn=Shop%E2%80%AEevil")) && /Shop<U\+202E>evil/.test(await resultWords()) && (await A.flags()).includes("hidden-chars"));
  check("plain text is not a payment", (await A.read("hello world")) && (await A.flags()).includes("other-text"));
  check("a bare UPI ID asks for the whole QR text", (await A.read("shop@ybl")) && (await A.flags()).includes("bare-id"));
  const BCB = ["00020104141234567890123426580014BR.GOV.BCB.PIX0136123e4567-e12b-12d1-a456-", "42665544000027300012BR.COM.OUTRO011001234567895204000053039865406123.45", "5802BR5917NOME DO RECEBEDOR6008BRASILIA61087007490062190515RP12345678-", "201980390012BR.COM.OUTRO01190123.ABCD.3456.WXYZ6304AD38"].join("");
  check("EMV code: published BCB payload, checksum matches", (await A.read(BCB)) && /Bharat QR \/ EMV payment code, not a upi:\/\/ link/.test(await A.text("[data-scanner-kind]")) && (await A.flags()).includes("crc-ok") && (await A.fields()).some((f) => f.key === "59" && f.value === "NOME DO RECEBEDOR"));
  check("EMV code: no UPI ID, so no box to compare one", !(await A.has("[data-scanner-expected]")));
  check("EMV code: one changed digit and the checksum no longer matches", (await A.read(BCB.replace("123.45", "123.46"))) && (await A.flags()).includes("crc-bad") && !(await A.flags()).includes("crc-ok"));
  check("EMV code: INR amount shown in rupees", (await A.read("00020101021126420014in.example.pay0120shop.test@exampleupi52045411530335654071250.755802IN5910TEST STORE6006MUMBAI62130509INV-123456304A80B")) && (await A.fields()).some((f) => f.key === "54" && f.value === "₹1,250.75"));
  const seenWords = A.seen.join("\n");
  check(`nothing in any of the ${A.seen.length} results says valid, verified, genuine, safe, real or trusted`, A.seen.length >= 14 && !BANNED.test(seenWords), (seenWords.match(BANNED) ?? [`only ${A.seen.length} results`])[0]);
  check("empty paste: told to paste something, no result", await (async () => { await A.reset(); await A.set("[data-scanner-paste]", "   "); await A.click("[data-scanner-read]"); await sleep(200); return /Paste some text first\./.test(await A.text("[data-scanner-status=paste]")) && !(await A.has("[data-scanner-result]")); })());
  const xssPayload = "upi://pay?pa=a@ybl&pn=%3Cimg%20src%3Dx%20onerror%3Dwindow.__xss%3D1%3E%3Cb%3Ebold%3C%2Fb%3E&am=1";
  check("markup in a payee name stays text", (await A.read(xssPayload)) && (await sleep(300), await a.eval("window.__xss === undefined && document.querySelectorAll('[data-scanner-result] img, [data-scanner-result] b').length === 0")) && /<img src=x onerror=window\.__xss=1><b>bold<\/b>/.test((await A.fields()).find((f) => f.key === "pn")?.value ?? ""));

  await A.click("[data-scanner-again]");
  await settled(a);
  check("Scan another clears the result and puts focus on Start camera, in view below the fixed header", await a.eval("(() => { const s = document.querySelector('[data-scanner-start]'); const bar = document.querySelector('.fixed.inset-x-0.top-0'); const r = s.getBoundingClientRect(); return !document.querySelector('[data-scanner-result]') && document.activeElement === s && r.top >= bar.getBoundingClientRect().bottom - 1 && r.bottom <= innerHeight && document.querySelector('[data-scanner-paste]').value === ''; })()"));

  // reduced motion: the page jumps to the result at once instead of scrolling there smoothly
  await a.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await a.eval("window.scrollTo(0, 0), true");
  await A.read("upi://pay?pa=motion@ybl&pn=Motion");
  await sleep(80);
  const jumpedTo = await a.eval("Math.round(scrollY)");
  await sleep(600);
  const endedAt = await a.eval("Math.round(scrollY)");
  check("reduced motion: the page jumps to the result at once, with no smooth scroll", jumpedTo > 0 && jumpedTo === endedAt, `${jumpedTo} then ${endedAt}`);
  await a.send("Emulation.setEmulatedMedia", { features: [] });

  // photo and paste-an-image
  await A.reset();
  await A.files("[data-scanner-pick]", [photo]);
  check("photo: a QR photo is read", await a.waitFor("!!document.querySelector('[data-scanner-result]')", 8000));
  check("photo: its UPI ID, name and amount", (await A.fields()).some((f) => f.key === "pa" && f.value === "photo.shop@ybl") && (await A.fields()).some((f) => f.key === "am" && f.value === "₹99.00"));
  check("photo: the status line says it was read", /QR code read\./.test(await A.text("[data-scanner-status=photo]")));
  await A.reset();
  const blank = await a.eval("(() => { const c = document.createElement('canvas'); c.width = c.height = 300; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 300, 300); return c.toDataURL('image/png').split(',')[1]; })()");
  const blankPath = join(DIR, "blank.png");
  writeFileSync(blankPath, Buffer.from(blank, "base64"));
  await A.files("[data-scanner-take]", [blankPath]);
  check("photo: a picture with no QR gives a helpful message", await a.waitFor("/No QR code was found in that photo/.test(document.querySelector('[data-scanner-status=photo]').innerText)", 8000) && !(await A.has("[data-scanner-result]")));
  await A.files("[data-scanner-pick]", [notImage]);
  check("photo: a file that is not an image gives a helpful message", await a.waitFor("/could not be read as an image/.test(document.querySelector('[data-scanner-status=photo]').innerText)", 8000));
  const photoB64 = readFileSync(photo).toString("base64");
  await a.eval(`(() => { const bytes = Uint8Array.from(atob(${JSON.stringify(photoB64)}), (c) => c.charCodeAt(0)); const dt = new DataTransfer(); dt.items.add(new File([bytes], 'dropped.png', { type: 'image/png' })); document.querySelector('[data-scanner-take]').closest('section').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); return true; })()`);
  check("photo: dropping an image on the card reads it", await a.waitFor("!!document.querySelector('[data-scanner-result]')", 8000));
  await A.reset();
  await a.eval(`(() => { const bytes = Uint8Array.from(atob(${JSON.stringify(photoB64)}), (c) => c.charCodeAt(0)); const dt = new DataTransfer(); dt.items.add(new File([bytes], 'pasted.png', { type: 'image/png' })); document.querySelector('[data-scanner-paste]').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); return true; })()`);
  check("paste: pasting an image into the text box reads it", await a.waitFor("!!document.querySelector('[data-scanner-result]')", 8000));

  // privacy: nothing about the scans left the page or was stored
  const net = await a.eval("window.__net");
  const secrets = ["counter.shop", "counter%2Eshop", "bivek", "photo.shop", "evil", "okaxis", "Counter%20Shop", "upi%3A", "pa=", "pn="];
  const leaks = (text) => secrets.filter((s) => decodeURIComponent(text).toLowerCase().includes(s.toLowerCase()));
  check("no fetch, XHR, beacon or WebSocket call carried any scanned text", net.every((n) => leaks(`${n.url} ${n.body}`).length === 0), JSON.stringify(net).slice(0, 300));
  check("scanning made no fetch, XHR, beacon or WebSocket call at all", net.length === 0, JSON.stringify(net).slice(0, 300));
  check("every request went to this origin (plus data: and blob:)", A.requests.every((u) => u.startsWith(ORIGIN) || /^(data|blob):/.test(u)), A.requests.filter((u) => !u.startsWith(ORIGIN) && !/^(data|blob):/.test(u)).join(" "));
  check("no request URL carried a scan", A.requests.every((u) => leaks(u).length === 0), A.requests.filter((u) => leaks(u).length).join(" "));
  check("nothing was stored: no storage, no cookies", await a.eval("localStorage.length === 0 && sessionStorage.length === 0 && document.cookie === ''"));
  check("the page URL carries no payload", await a.eval("location.href === " + JSON.stringify(`${BASE}/upi-qr-scanner/`) + " && location.hash === '' && location.search === ''"));
  check("no CSP or permissions-policy violation was logged", A.violations.length === 0, A.violations.join(" | "));
  // The static server has no Vercel analytics script, so that one 404 is expected; anything else failing is a missing asset.
  const unexpected = A.failed.filter((line) => !/_vercel\//.test(line));
  check("every asset the page asked for loaded", unexpected.length === 0, unexpected.join(" | ").slice(0, 300));
  check("no console errors on the English page", tolerant(a.errors).length === 0, a.errors.join(" | "));

  /* ---------- the page on a phone ---------- */
  await a.mobile(true);
  check("phone: the page hydrates", await A.open("/upi-qr-scanner/", 1500));
  await a.eval("window.scrollTo(0, 0), true");
  check("phone: Start camera is in the first screen", await a.eval("(() => { const r = document.querySelector('[data-scanner-start]').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; })()"), await a.eval("JSON.stringify(document.querySelector('[data-scanner-start]').getBoundingClientRect()) + ' of ' + innerHeight"));
  const longPayload =`upi://pay?pa=${"averyveryverylongshopname".repeat(4)}@okaxis&pn=${"VeryLongUnbrokenPayeeName".repeat(8)}&am=1250.50&tn=${"note".repeat(40)}&url=https://example.com/${"pathsegment".repeat(30)}&mode=05&orgid=000000`;
  await A.read(longPayload);
  await settled(a);
  check("phone: the result heading is in view, below the fixed header", await headingInView(a), await a.eval("JSON.stringify(document.getElementById('scanner-result-heading').getBoundingClientRect())"));
  check("phone: nothing scrolls sideways", await a.eval("document.documentElement.scrollWidth <= innerWidth + 1 && document.body.scrollWidth <= innerWidth + 1"), await a.eval("document.documentElement.scrollWidth + ' > ' + innerWidth"));
  check("phone: no element of the result pokes out of the screen", await a.eval("[...document.querySelectorAll('main *')].filter((e) => e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().right > innerWidth + 1).length === 0"), await a.eval("[...document.querySelectorAll('main *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1).slice(0, 3).map((e) => e.tagName + '.' + String(e.className).slice(0, 40)).join(' ')"));
  check("phone: the cards use the screen width", await a.eval("(() => { const r = document.querySelector('[data-scanner-result]').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })()"));
  await a.shot("scanner-phone-result.png");
  await A.click("[data-scanner-again]");
  await sleep(200);
  await a.eval("window.scrollTo(0, 0), true");
  await a.shot("scanner-phone-top.png");
  await a.mobile(false);

  /* ---------- Hindi, Tamil, Telugu, Marathi and an out-of-India locale ---------- */
  check("hi: the page hydrates", await A.open("/hi/upi-qr-scanner/"));
  check("hi: Hindi heading, notice and button", /UPI QR/.test(await A.text("h1")) && /कैमरा फ्रेम आपके डिवाइस पर ही प्रोसेस/.test(await A.text("[data-scanner-notice]")) && (await A.text("[data-scanner-start]")).trim() === "कैमरा चालू करें", await A.text("h1"));
  check("hi: the page language is Hindi", await a.eval("document.documentElement.lang === 'hi' && document.querySelector('[data-scanner-notice]').closest('[lang]').lang === 'hi'"));
  check("hi: the NPCI sample reads in Hindi", await A.read("upi://pay?pa=bivek@npci&pn=bivek%20rath&am=10&mode=05"));
  check("hi: the box for the expected ID is labelled in Hindi", /जिस UPI ID पर भुगतान करना है/.test(await a.eval("document.querySelector('label[for=\"' + document.querySelector('[data-scanner-expected]').id + '\"]').innerText")));
  await A.set("[data-scanner-expected]", "bivek@npci");
  check("hi: result heading, kind and flags are Hindi", (await A.text("#scanner-result-heading")).trim() === "इस QR में क्या है" && /UPI पेमेंट लिंक/.test(await A.text("[data-scanner-kind]")) && /QR के अंदर लिखा नाम कोई जांचता नहीं/.test(await A.text("[data-scanner-result]")) && /आपके लिखे ID से मेल खाता है/.test(await A.text("[data-scanner-compare]")), await A.text("[data-scanner-result]").then((s) => s.slice(0, 200)));
  check("hi: amounts and IDs are not translated or converted", (await A.fields()).some((f) => f.key === "am" && f.value === "₹10.00") && (await A.fields()).some((f) => f.key === "pa" && f.value === "bivek@npci"));
  check("hi: the disclaimer link goes to the Hindi disclaimer", await a.eval("!!document.querySelector('a[href=\"/hi/disclaimer/\"]')"));
  await A.click("[data-scanner-again]");
  await A.click("[data-scanner-start]");
  check("hi: the camera works on the Hindi page too", await a.waitFor("!!document.querySelector('[data-scanner-result]')", 20000) && (await A.text("[data-scanner-status=camera]")).includes("QR कोड पढ़ लिया गया"));
  check("hi: no console errors", tolerant(a.errors).length === 0, a.errors.join(" | "));
  for (const [lang, expected] of [["ta", "கேமராவைத் தொடங்கு"], ["te", "కెమెరా ప్రారంభించు"], ["mr", "कॅमेरा सुरू करा"]]) {
    check(`${lang}: hydrates and shows its own language`, (await A.open(`/${lang}/upi-qr-scanner/`)) && (await A.text("[data-scanner-start]")).trim() === expected, await A.text("[data-scanner-start]"));
    check(`${lang}: a read works in ${lang}`, (await A.read("upi://mandate?pa=shop@icici&pn=Shop&am=649")) && !/take money from your account/.test(await A.text("[data-scanner-result]")) && (await A.flags()).includes("mandate"));
  }
  check("es: the English text is used, the page is noindex", (await A.open("/es/upi-qr-scanner/")) && (await A.text("[data-scanner-start]")).trim() === "Start camera" && /noindex/.test(await a.eval("document.querySelector('meta[name=robots]').content")));
  check("es: the English text is marked as English, not Spanish", await a.eval("document.querySelector('[data-scanner-notice]').closest('[lang]').lang === 'en'"));
  check("es: no console errors", tolerant(a.errors).length === 0, a.errors.join(" | "));
  await a.shot("scanner-es.png");

  /* ---------- the stop paths (a camera that never finds a QR) ---------- */
  A.b.close();
  const C = await launch(cameraFlags(BLANK_CLIP));
  const c = C.b;
  check("C: the page hydrates", await C.open("/upi-qr-scanner/"));
  const startTop = await c.eval("Math.round(document.querySelector('[data-scanner-paste]').getBoundingClientRect().top + scrollY)");
  const live = async () => { await C.click("[data-scanner-start]"); return c.waitFor("window.__streams.length > 0 && document.querySelector('video').readyState >= 2 && document.querySelector('[data-scanner-status=camera]').innerText.includes('Camera is on')", 8000); };
  check("C: Start camera shows a live preview", await live() && (await C.streamsLive()));
  check("C: while it runs, the layout below does not move", (await c.eval("Math.round(document.querySelector('[data-scanner-paste]').getBoundingClientRect().top + scrollY)")) === startTop);
  await sleep(1200);
  check("C: with no QR in view it keeps looking and stays on", (await C.streamsLive()) && !(await C.has("[data-scanner-result]")));
  await C.click("[data-scanner-start]");
  await sleep(200);
  check("C: Stop camera ends every track", await C.streamsEnded());
  check("C: Stop camera clears the preview and says so", (await c.eval("document.querySelector('video').srcObject === null && document.querySelector('[data-scanner-start]').innerText.trim() === 'Start camera'")) && /Camera stopped\./.test(await C.text("[data-scanner-status=camera]")));
  check("C: a second start opens a new stream", await live() && (await c.eval("window.__streams.length === 2 && window.__streams[0].getTracks().every((t) => t.readyState === 'ended')")));
  await c.eval("window.dispatchEvent(new Event('pagehide')), true");
  await sleep(200);
  check("C: leaving the page (pagehide) stops the camera", await C.streamsEnded());
  check("C: and the page shows the camera as off", await c.eval("document.querySelector('[data-scanner-start]').innerText.trim() === 'Start camera'"));
  check("C: a third start works", await live());
  await c.eval("Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); true");
  await sleep(200);
  check("C: hiding the page stops the camera", await C.streamsEnded() && /page was hidden/.test(await C.text("[data-scanner-status=camera]")));
  await c.eval("delete document.visibilityState, true");
  check("C: starting, then stopping at once, leaves no live track", await (async () => { await C.click("[data-scanner-start]"); await C.click("[data-scanner-start]"); await sleep(1500); return c.eval("window.__streams.every((s) => s.getTracks().every((t) => t.readyState === 'ended')) && document.querySelector('[data-scanner-start]').innerText.trim() === 'Start camera'"); })());
  check("C: photo and paste still work while the camera is off", await C.read("upi://pay?pa=a@ybl&pn=A&am=1"));
  check("C: no console errors", tolerant(c.errors).length === 0, c.errors.join(" | "));

  /* ---------- the camera cannot start: every reason ends in a friendly message that points at the other options ---------- */
  await C.open("/upi-qr-scanner/");
  const reasons = [
    ["NotAllowedError", /blocked the camera/],
    ["SecurityError", /blocked the camera/],
    ["NotFoundError", /No camera was found/],
    ["OverconstrainedError", /No camera was found/],
    ["NotReadableError", /Another app may be using it/],
    ["AbortError", /Another app may be using it/],
    ["TypeError", /The camera could not start\. Use a photo or pasted text instead\./],
  ];
  for (const [name, message] of reasons) {
    await c.eval(`window.__gumFail = ${JSON.stringify(name)}, true`);
    await C.click("[data-scanner-start]");
    const shown = await c.waitFor(`/${message.source}/.test(document.querySelector('[data-scanner-status=camera]').innerText)`, 3000);
    check(`${name}: friendly message, camera left off`, shown && (await C.text("[data-scanner-start]")).trim() === "Start camera" && !(await c.eval("window.__streams.length")), await C.text("[data-scanner-status=camera]"));
    check(`${name}: the message points to a photo or pasted text`, /photo or pasted text/.test(await C.text("[data-scanner-status=camera]")));
  }
  await c.eval("window.__gumFail = null, true");
  await c.eval("Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true }), true");
  await C.click("[data-scanner-start]");
  check("no camera API (insecure page or old browser): friendly message", await c.waitFor("/cannot use the camera on this page/.test(document.querySelector('[data-scanner-status=camera]').innerText)", 3000));
  check("the problem message is marked as a problem, in words", await c.eval("document.querySelector('[data-scanner-status=camera]').className.includes('border-coral') && document.querySelector('[data-scanner-status=camera]').getAttribute('role') === 'status'"));
  await c.eval("document.querySelector('[data-scanner-status=camera]').scrollIntoView({ block: 'center' }), true");
  await sleep(500);
  await c.shot("scanner-camera-problem.png");
  check("the paste option still works after a camera problem", await C.read("upi://pay?pa=a@ybl&pn=A&am=2"));
  check("C: no console errors from the error branches", tolerant(c.errors).length === 0, c.errors.join(" | "));
  C.b.close();

  /* ---------- permission denied for real (not simulated) ---------- */
  // No --use-fake-ui-for-media-stream here: that flag accepts every prompt, so the denial below would be ignored.
  const D = await launch(["--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${BLANK_CLIP}`]);
  const d = D.b;
  check("D: the page hydrates", await D.open("/upi-qr-scanner/"));
  const denied = await d.send("Browser.setPermission", { permission: { name: "camera" }, setting: "denied", origin: ORIGIN });
  check("D: the browser accepted the denial", !denied.error, denied.error?.message);
  await D.click("[data-scanner-start]");
  check("D: a denied permission gives the 'browser blocked the camera' message", await d.waitFor("/blocked the camera/.test(document.querySelector('[data-scanner-status=camera]').innerText)", 5000));
  check("D: no stream was opened and the button is back to Start camera", (await d.eval("window.__streams.length === 0 && (window.__gum || 0) === 1")) && (await D.text("[data-scanner-start]")).trim() === "Start camera");
  check("D: photo and paste are still available", (await D.read("upi://pay?pa=a@ybl&pn=A")) && (await D.has("[data-scanner-pick]")));
  D.b.close();

  /* ---------- the browser's own QR reader (this Chrome has none, so a stand-in proves the wiring) ---------- */
  // The stand-in answers for a <video> only after two looks, and finds nothing in a still image, so the photo
  // path has to fall back to jsQR. window.name picks the variant because it survives the navigation.
  const NATIVE_INIT = `(() => {
    const mode = window.name || "full";
    window.__bd = { made: [], detects: 0, sources: [] };
    if (mode === "absent") return;
    window.BarcodeDetector = class {
      static async getSupportedFormats() { return mode === "no-qr" ? ["ean_13", "code_128"] : ["ean_13", "qr_code"]; }
      constructor(options) { window.__bd.made.push(JSON.stringify(options)); }
      async detect(source) {
        window.__bd.detects++;
        window.__bd.sources.push(Object.prototype.toString.call(source));
        if (mode === "throws") throw new Error("detector failed");
        return source instanceof HTMLVideoElement && window.__bd.detects >= 2 ? [{ rawValue: ${JSON.stringify(PAYLOAD)} }] : [];
      }
    };
  })();`;
  const F = await launch(cameraFlags(QR_CLIP));
  const f = F.b;
  await f.send("Page.addScriptToEvaluateOnNewDocument", { source: NATIVE_INIT });
  check("F: the page hydrates with a BarcodeDetector present", await F.open("/upi-qr-scanner/") && await f.eval("typeof BarcodeDetector === 'function'"));
  await F.click("[data-scanner-start]");
  check("F: the browser's reader reads the camera feed", await f.waitFor("!!document.querySelector('[data-scanner-result]')", 15000));
  const fFields = await F.fields();
  check("F: the same fields come out", fFields.some((x) => x.key === "pa" && x.value === "counter.shop@okaxis") && fFields.some((x) => x.key === "am" && x.value === "₹25.00"), JSON.stringify(fFields.slice(0, 3)));
  check("F: it asked for QR codes only, once, and looked at the <video>", (await f.eval("JSON.stringify(window.__bd.made)")) === '["{\\"formats\\":[\\"qr_code\\"]}"]' && (await f.eval("window.__bd.sources.every((s) => s === '[object HTMLVideoElement]') && window.__bd.detects >= 2")), await f.eval("JSON.stringify(window.__bd)"));
  check("F: jsQR was never downloaded for the camera", !F.requests.some((u) => /jsqr/i.test(u)), F.requests.filter((u) => /jsqr/i.test(u)).join(" "));
  check("F: the camera stopped by itself", await F.streamsEnded());
  await F.reset();
  await F.files("[data-scanner-pick]", [photo]);
  check("F: a photo the browser's reader misses falls back to jsQR", await f.waitFor("!!document.querySelector('[data-scanner-result]')", 10000) && (await F.fields()).some((x) => x.key === "pa" && x.value === "photo.shop@ybl") && F.requests.some((u) => /jsqr/i.test(u)));
  check("F: the photo was handed over as an image bitmap", await f.eval("window.__bd.sources.includes('[object ImageBitmap]')"));
  check("F: no console errors", tolerant(f.errors).length === 0, f.errors.join(" | "));
  for (const [variant, expectation] of [["throws", "a reader that throws"], ["no-qr", "a reader without QR support"]]) {
    await f.eval(`window.name = ${JSON.stringify(variant)}, true`);
    await F.open("/upi-qr-scanner/");
    await F.click("[data-scanner-start]");
    check(`F: ${expectation} falls back to jsQR for the camera`, await f.waitFor("!!document.querySelector('[data-scanner-result]')", 20000) && (await F.fields()).some((x) => x.key === "pa" && x.value === "counter.shop@okaxis"), await F.text("[data-scanner-status=camera]"));
    check(`F: ${expectation}: the camera stopped by itself`, await F.streamsEnded());
  }
  check("F: no console errors from the fallbacks", tolerant(f.errors).length === 0, f.errors.join(" | "));
  F.b.close();
} catch (error) {
  check("test script ran to completion", false, String(error?.stack ?? error).slice(0, 700));
} finally {
  server.close();
}
console.log(`# screenshots in ${DIR.replace(/scanner$/, "")}`);
process.exit(check.report());
