// Self-serve sponsorships end to end: book on /sponsor/ (browser), Dodo checkout (fake-dodo.mjs), signed webhooks,
// owner review on /admin/sponsors/, the homepage featured card and tile strip, lost-webhook recovery, refunds.
import { createHmac, createSign } from "node:crypto";
import { crc32, deflateSync } from "node:zlib";
import { checker, sleep, startBrowser } from "./cdp-lib.mjs";

const DEV = process.env.DEV_BASE || "http://localhost:4321";
const KV = "http://127.0.0.1:8799";
const DODO = process.env.E2E_DODO_BASE;
const KEY = process.env.E2E_DODO_WEBHOOK_KEY;
const PREFIX = "spontest:";
const FEATURED = "pdt_E2eSponsorFeatured01";
const TILE = "pdt_E2eSponsorTile000001";
const check = checker();
const kv = (path, body) => fetch(`${KV}/__admin/${path}`, { method: "POST", body: JSON.stringify(body) }).then((r) => r.json());
const dodo = (path, body) => fetch(`${DODO}/__admin/${path}`, { method: body ? "POST" : "GET", body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const booking = async (id) => { const v = (await kv("get", { key: `${PREFIX}b:${id}` })).value; return v ? JSON.parse(v) : null; };

const b64u = (v) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");
function sessionToken(userId) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64u({ alg: "RS256", typ: "JWT" });
  const body = b64u({ sub: userId, sid: `sess_${userId}`, iat: now - 5, nbf: now - 5, exp: now + 900, iss: "https://e2e.clerk.accounts.dev" });
  return `${head}.${body}.${createSign("RSA-SHA256").update(`${head}.${body}`).sign(process.env.E2E_JWT_PRIVATE_KEY).toString("base64url")}`;
}
const adminPage = (user, form) => fetch(`${DEV}/admin/sponsors/`, {
  method: form ? "POST" : "GET",
  redirect: "manual",
  headers: { Origin: DEV, ...(user ? { Authorization: `Bearer ${sessionToken(user)}` } : {}), ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
  body: form ? new URLSearchParams(form).toString() : undefined,
});

const webhook = (type, data, id = `msg_${Math.random().toString(36).slice(2, 14)}`) => {
  const body = JSON.stringify({ business_id: "bus_E2e", type, timestamp: new Date().toISOString(), data });
  const ts = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", Buffer.from(KEY.slice(6), "base64")).update(`${id}.${ts}.${body}`).digest("base64");
  return fetch(`${DEV}/api/billing/dodo-webhook/`, { method: "POST", headers: { "Content-Type": "application/json", "webhook-id": id, "webhook-timestamp": String(ts), "webhook-signature": `v1,${signature}` }, body });
};
const paid = (id, session, { payment, amount, product, quantity, subscription = null }) => webhook("payment.succeeded", {
  payment_id: payment, status: "succeeded", checkout_session_id: session, subscription_id: subscription, total_amount: amount, currency: "INR",
  product_cart: [{ product_id: product, quantity }], metadata: { product: "proupiqr-sponsor", booking: id, tier: product === FEATURED ? "featured" : "tile" },
});

// A real 32×32 PNG for API calls (the browser makes its own from a canvas).
function solidPng(size, [r, g, bl]) {
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => [r, g, bl]).flat())]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.concat(Array(size).fill(row)))), chunk("IEND", Buffer.alloc(0))]).toString("base64");
}
const PNG = solidPng(32, [40, 122, 87]);
const api = (body, origin = DEV) => fetch(`${DEV}/api/v1/sponsors/checkout/`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(body) });
const tileBody = (name) => ({ tier: "tile", name, href: `https://${name.toLowerCase().replace(/\W+/g, "")}.example.com/`, email: `ads@${name.toLowerCase().replace(/\W+/g, "")}.example.com`, logo: PNG, agree: true });

let b;
try {
  await kv("reset", {});
  await dodo("reset", {});

  /* ---------- Input checks ---------- */
  let res = await api({ ...tileBody("Svg Brand"), logo: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>").toString("base64") });
  check("SVG logo refused", res.status === 400 && (await res.json()).field === "logo");
  res = await api({ ...tileBody("Plain Http"), href: "http://plain.example.com/" });
  check("non-https link refused", res.status === 400 && (await res.json()).field === "href");
  res = await api(tileBody("Cross Site"), "https://evil.example.com");
  check("cross-site booking request refused", res.status === 403);
  check("refused requests never reach Dodo", (await dodo("calls")).length === 0);

  /* ---------- Homepage before any sponsor ---------- */
  b = await startBrowser(0);
  await b.send("Network.setBlockedURLs", { urls: ["*dodopayments.com*", "*clerk.accounts.dev*", "*clerk.browser.js*"] });
  await b.go(`${DEV}/`, 4000);
  check("homepage: featured slot shows the house card", (await b.eval("document.querySelector('[data-sponsor-featured]')?.dataset.sponsor")) === "house");
  check("homepage: house card links to /sponsor/", (await b.eval("document.querySelector('[data-sponsor-featured] a').getAttribute('href')")) === "/sponsor/");
  check("homepage: tile strip offers a free tile", await b.eval("Boolean(document.querySelector('[data-sponsor-strip] [data-sponsor-open]'))"));
  check("homepage: sponsor list fetched from our own API", b.requests.some((u) => u === `${DEV}/api/v1/sponsors/`));

  /* ---------- Book the featured card in the browser ---------- */
  await b.go(`${DEV}/sponsor/#book`, 5000);
  await b.eval("document.getElementById('book').scrollIntoView(); true");
  check("/sponsor/: booking form is open", await b.waitFor("Boolean(document.querySelector('[data-sponsor-form]'))", 15000));
  check("/sponsor/: availability shown", await b.waitFor("/Free now/.test(document.querySelector('[data-availability=featured]')?.textContent ?? '')"));
  const setValue = (id, value) => b.eval(`(() => { const el = document.getElementById(${JSON.stringify(id)}); const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); return true; })()`);
  await setValue("sp-name", "Acme Soundbox");
  await setValue("sp-line", "Payment alerts that speak every UPI payment out loud.");
  await setValue("sp-href", "https://acme.example.com/soundbox");
  await setValue("sp-email", "ads@acme.example.com");
  await b.eval(`(async () => {
    const c = document.createElement('canvas'); c.width = 300; c.height = 200; const x = c.getContext('2d'); x.fillStyle = '#e4572e'; x.fillRect(0, 0, 300, 200);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    const input = document.getElementById('sp-logo'); const dt = new DataTransfer(); dt.items.add(new File([blob], 'acme.png', { type: 'image/png' }));
    input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  check("/sponsor/: preview shows the resized logo and copy", await b.waitFor("(() => { const p = document.querySelector('[data-preview=featured]'); const img = p?.querySelector('img'); return Boolean(img && img.src.startsWith('data:image/png') && /Acme Soundbox/.test(p.textContent) && /acme.example.com/.test(p.textContent)); })()"));
  await b.eval("document.querySelector('[data-sponsor-form]').scrollIntoView(); true");
  await sleep(300);
  await b.shot("sponsors-form.png");
  check("/sponsor/: button shows the monthly price (₹3,000/month)", /₹3,000\/month/.test(await b.eval("document.querySelector('[data-sponsor-form] button[type=submit]').textContent")));
  await b.eval("document.querySelector('[data-sponsor-form] button[type=submit]').click(); true");
  check("/sponsor/: rules must be accepted first", await b.waitFor("/Confirm the booking rules/.test(document.body.innerText)"));
  await b.eval("document.querySelector('[data-sponsor-form] input[type=checkbox]').click(); true");
  await b.eval("document.querySelector('[data-sponsor-form] button[type=submit]').click(); true");
  await b.waitFor("false", 2500);
  const checkoutUrl = b.requests.find((u) => u.startsWith("https://test.checkout.dodopayments.com/session/"));
  check("/sponsor/: submitting opens Dodo's hosted checkout", Boolean(checkoutUrl), b.requests.filter((u) => !u.startsWith(DEV)).join(" "));

  const created = (await dodo("calls")).filter((c) => c.path === "/checkouts");
  const featuredCheckout = created[0]?.body;
  const fid = featuredCheckout?.metadata?.booking;
  check("checkout: one featured month, prefilled email, our metadata", featuredCheckout?.product_cart?.[0]?.product_id === FEATURED && featuredCheckout.product_cart[0].quantity === 1
    && featuredCheckout.customer.email === "ads@acme.example.com" && featuredCheckout.metadata.product === "proupiqr-sponsor" && /^spb_[a-f0-9]{32}$/.test(fid ?? ""), JSON.stringify(featuredCheckout));
  check("checkout: no coupon box, INR only", featuredCheckout?.feature_flags?.allow_discount_code === false && featuredCheckout.billing_currency === "INR");
  check("checkout: returns to the booking's status page", featuredCheckout?.return_url === `${DEV}/sponsor/?booking=${fid}#book`);
  let fb = await booking(fid);
  check("booking stored unpaid with its logo", fb?.status === "checkout" && Boolean((await kv("get", { key: `${PREFIX}logo:${fid}` })).value));
  res = await fetch(`${DEV}/api/v1/sponsors/logo/${fid}/`);
  check("unpaid booking's logo isn't served", res.status === 404);

  /* ---------- Payment webhook → review ---------- */
  const unsigned = await fetch(`${DEV}/api/billing/dodo-webhook/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "payment.succeeded", data: { payment_id: "pay_X", metadata: { product: "proupiqr-sponsor", booking: fid } } }) });
  check("unsigned sponsor webhook → 401", unsigned.status === 401);
  res = await paid(fid, fb.sessionId, { payment: "pay_E2eFeatured000001", amount: 300_000, product: FEATURED, quantity: 1, subscription: "sub_E2eFeatured00001" });
  const body = await res.json();
  check("signed payment → booking waits for review", res.status === 200 && body.status === "review", JSON.stringify(body));
  fb = await booking(fid);
  check("payment recorded on the booking", fb.paymentId === "pay_E2eFeatured000001" && fb.paidAt > 0);
  check("paid booking's logo kept (no expiry) and served as PNG", (await fetch(`${DEV}/api/v1/sponsors/logo/${fid}/`)).headers.get("content-type") === "image/png");
  const logoRes = await fetch(`${DEV}/api/v1/sponsors/logo/${fid}/`);
  check("logo response is locked down (nosniff, sandbox CSP)", logoRes.headers.get("x-content-type-options") === "nosniff" && /sandbox/.test(logoRes.headers.get("content-security-policy") ?? ""));

  await b.go(`${DEV}/sponsor/?booking=${fid}#book`, 4000); // Dodo returns here with #book (the form hydrates when visible)
  check("return page: paid, waiting for review", await b.waitFor("document.querySelector('[data-booking-status]')?.dataset.bookingStatus === 'review'", 10000));
  check("return page explains the refund if declined", /full refund/.test(await b.eval("document.querySelector('[data-booking-status]').textContent")));
  await b.go(`${DEV}/`, 4000);
  check("homepage: unapproved sponsor not shown", (await b.eval("document.querySelector('[data-sponsor-featured]').dataset.sponsor")) === "house");

  /* ---------- Owner review ---------- */
  check("/admin/sponsors/ is 404 signed out", (await adminPage(null)).status === 404);
  check("/admin/sponsors/ is 404 for a non-admin", (await adminPage("user_someoneelse")).status === 404);
  const page = await (await adminPage("user_e2eadmin")).text();
  check("/admin/sponsors/ lists the paid booking with its email for review", page.includes("Acme Soundbox") && page.includes("ads@acme.example.com") && page.includes("Waiting for review (1)"));
  res = await adminPage("user_e2eadmin", { id: fid, action: "approve" });
  check("approve → redirect back", res.status === 303);
  fb = await booking(fid);
  const month = fb.paidUntil - fb.paidAt;
  check("approved: runs a month and renews", fb.status === "approved" && fb.renews === true && month > 29 * 86_400_000 && month <= 31 * 86_400_000, JSON.stringify({ s: fb.status, paidUntil: fb.paidUntil, renews: fb.renews }));

  const pub = await (await fetch(`${DEV}/api/v1/sponsors/`)).json();
  check("public API: featured sponsor with UTM-tagged link", pub.featured?.name === "Acme Soundbox" && pub.featured.href === "https://acme.example.com/soundbox?utm_source=proupiqr&utm_medium=sponsor&utm_campaign=home-featured");
  check("public API: featured card shown as taken", pub.featuredBookable === false && !("featuredNextStart" in pub));
  res = await api({ ...tileBody("Second Featured"), tier: "featured", tagline: "Another line for the card." });
  check("a second featured booking is refused while the card is taken", res.status === 409 && /taken/.test((await res.json()).error ?? ""));
  check("public API: no emails or payment ids", !/@|pay_|cks_/.test(JSON.stringify(pub)));

  await b.go(`${DEV}/`, 4000);
  check("homepage: featured card shows the sponsor", await b.waitFor(`document.querySelector('[data-sponsor-featured]')?.dataset.sponsor === ${JSON.stringify(fid)}`));
  const card = JSON.parse(await b.eval("JSON.stringify((() => { const r = document.querySelector('[data-sponsor-featured]'); const a = r.querySelector('a'); const img = r.querySelector('img'); return { text: r.innerText, rel: a.rel, target: a.target, href: a.href, logo: img.complete && img.naturalWidth > 0 && !img.hidden }; })())"));
  check("homepage: labelled Sponsored, with line and host", /Sponsored/.test(card.text) && /speak every UPI payment/.test(card.text) && /acme\.example\.com/.test(card.text), card.text);
  check("homepage: link is rel=sponsored, new tab, tagged", card.rel.includes("sponsored") && card.target === "_blank" && card.href.includes("utm_campaign=home-featured"));
  check("homepage: logo loads from our origin", card.logo);

  /* ---------- Tiles: API booking, subscription first, then payment ---------- */
  res = await api(tileBody("Ledgerly"));
  const tileStart = await res.json();
  check("tile checkout starts", res.status === 200 && tileStart.url?.startsWith("https://test.checkout.dodopayments.com/"), JSON.stringify(tileStart));
  const tid = tileStart.id;
  let tb = await booking(tid);
  const next = new Date(Date.now() + 30 * 86_400_000).toISOString();
  res = await webhook("subscription.active", { subscription_id: "sub_E2eTile0000000001", product_id: TILE, status: "active", next_billing_date: next, cancel_at_next_billing_date: false, metadata: { product: "proupiqr-sponsor", booking: tid } });
  check("subscription.active first → review", (await res.json()).status === "review");
  await paid(tid, tb.sessionId, { payment: "pay_E2eTile000000001", amount: 99_900, product: TILE, quantity: 1, subscription: "sub_E2eTile0000000001" });
  tb = await booking(tid);
  check("tile: subscription and payment both recorded", tb.subscriptionId === "sub_E2eTile0000000001" && tb.paymentId === "pay_E2eTile000000001" && tb.paidUntil === Date.parse(next));
  await adminPage("user_e2eadmin", { id: tid, action: "approve" });
  await b.go(`${DEV}/`, 4000);
  check("homepage: tile appears in the strip", await b.waitFor(`Boolean(document.querySelector('[data-sponsor-tile=${JSON.stringify(tid)}] a[rel~=sponsored][href*="utm_campaign=home-tile"]'))`));
  check("homepage: strip still offers a free tile", await b.eval("Boolean(document.querySelector('[data-sponsor-open]'))"));
  check("homepage: tile logo loads", await b.waitFor(`(() => { const img = document.querySelector('[data-sponsor-tile=${JSON.stringify(tid)}] img'); return Boolean(img && img.complete && img.naturalWidth === 32); })()`));
  check("homepage: no console errors", b.errors.length === 0, b.errors.join(" | "));
  await b.shot("sponsors-home-desktop.png");
  await b.eval("document.querySelector('[data-sponsor-strip]').scrollIntoView({ block: 'center' }); true");
  await sleep(300);
  await b.shot("sponsors-strip-desktop.png");
  // Phones: generator first, then the featured card, then the strip.
  await b.mobile(true);
  await b.go(`${DEV}/`, 4000);
  const order = JSON.parse(await b.eval("JSON.stringify(['#generator', '[data-sponsor-featured]', '[data-sponsor-strip]'].map((s) => Math.round(document.querySelector(s).getBoundingClientRect().top + scrollY)))"));
  check("phone: generator, then featured card, then strip", order[0] < order[1] && order[1] < order[2], JSON.stringify(order));
  check("phone: no horizontal overflow", (await b.eval("document.documentElement.scrollWidth - document.documentElement.clientWidth")) <= 0);
  await b.eval("document.querySelector('[data-sponsor-featured]').scrollIntoView({ block: 'start' }); true");
  await sleep(300);
  await b.shot("sponsors-home-phone.png");
  await b.mobile(false);

  /* ---------- Lost webhook: the return page asks Dodo ---------- */
  res = await api(tileBody("Lost Hook"));
  const lid = (await res.json()).id;
  const lb = await booking(lid);
  let status = await (await fetch(`${DEV}/api/v1/sponsors/${lid}/`)).json();
  check("status before payment: checkout", status.status === "checkout" && !("email" in status));
  await dodo("pay", { session: lb.sessionId, payment: "pay_E2eLostHook000001", amount: 99_900, product: TILE, quantity: 1 });
  await sleep(10_500); // the re-read is throttled to once per 10 s per booking
  status = await (await fetch(`${DEV}/api/v1/sponsors/${lid}/`)).json();
  check("status page recovers a lost payment webhook from Dodo", status.status === "review", JSON.stringify(status));

  /* ---------- Reject → refund; take down → cancel ---------- */
  res = await adminPage("user_e2eadmin", { id: lid, action: "reject" });
  check("reject → redirect", res.status === 303);
  const calls = await dodo("calls");
  check("reject refunds the payment in Dodo", calls.some((c) => c.path === "/refunds" && c.body.payment_id === "pay_E2eLostHook000001"));
  check("rejected booking recorded", (await booking(lid)).status === "rejected");
  check("Dodo calls carry the API key", calls.every((c) => c.auth === "Bearer dodo_test_fake"));
  await adminPage("user_e2eadmin", { id: tid, action: "remove" });
  check("take down cancels the tile subscription now", (await dodo("calls")).some((c) => c.method === "PATCH" && c.path === "/subscriptions/sub_E2eTile0000000001" && c.body.status === "cancelled"));
  check("taken-down tile leaves the public list", (await (await fetch(`${DEV}/api/v1/sponsors/`)).json()).tiles.length === 0);

  /* ---------- Sold out: unpaid checkouts hold nothing; eight paid tiles close the ninth ---------- */
  // Ten checkouts an hour per network address: this section needs more than are left.
  await kv("delprefix", { prefix: "pro-upi-qr:rate:sponsor-checkout:" });
  const unpaid = [];
  for (let i = 0; i < 8; i++) unpaid.push((await (await api(tileBody(`Tile Brand ${i}`))).json()).id);
  check("unpaid checkouts don't block tiles", (await (await fetch(`${DEV}/api/v1/sponsors/`)).json()).tilesFree === 8);
  for (const [i, id] of unpaid.entries()) {
    const tb8 = await booking(id);
    await paid(id, tb8.sessionId, { payment: `pay_E2eSoldOut0000${i}`, amount: 99_900, product: TILE, quantity: 1, subscription: `sub_E2eSoldOut00000${i}` });
  }
  check("eight paid tiles (in review) fill the strip", (await (await fetch(`${DEV}/api/v1/sponsors/`)).json()).tilesFree === 0);
  await kv("delprefix", { prefix: "pro-upi-qr:rate:sponsor-checkout:" });
  res = await api(tileBody("Ninth Brand"));
  check("ninth tile checkout refused", res.status === 409);
  await b.go(`${DEV}/`, 4000);
  check("strip hides while every tile is paid but none approved yet", await b.waitFor("document.querySelector('[data-sponsor-strip]').hidden === true"));
} catch (error) {
  check("test script ran to completion", false, String(error).slice(0, 500));
} finally {
  b?.close();
}
process.exit(check.report());
