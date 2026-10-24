import { createHash, createSign } from "node:crypto";
import { checker, sleep, startBrowser } from "./cdp-lib.mjs";

const DEV = process.env.DEV_BASE || "http://localhost:4321";
const KV = "http://127.0.0.1:8799";
const check = checker();
const admin = (path, body) => fetch(`${KV}/__admin/${path}`, { method: "POST", body: JSON.stringify(body) }).then((r) => r.json());

const T = Date.now();
const TOKEN = "Tk7pQ2xYz9AbCdEfGhIjKl";
const workspace = (overrides = {}) => ({
  version: 1,
  business: { name: "Sharma Tuition", upiId: "sharma@okaxis", phone: "", gstin: "", invoicePrefix: "INV-", updatedAt: T },
  clients: { cli_aaaaaaaa: { id: "cli_aaaaaaaa", name: "Rohan Mehta", phone: "9876543210", email: "rohan@example.com", gstin: "", createdAt: T, updatedAt: T } },
  invoices: {
    inv_00000001: {
      id: "inv_00000001", number: "INV-0007", clientId: "cli_aaaaaaaa", issueDate: "2026-10-01", dueDate: "2026-10-15",
      amountPaise: 300000, description: "October tuition", payments: [{ id: "pay_aaaaaaaa", amountPaise: 100000, date: "2026-10-03", mode: "upi", reference: "", createdAt: T }],
      reminders: [], voided: false, createdAt: T, updatedAt: T, ...overrides,
    },
  },
});
async function seed(overrides) {
  await admin("reset", {});
  await admin("set", { key: "ws:doc:ownerA", value: JSON.stringify(workspace(overrides)) });
  await admin("set", { key: "ws:rev:ownerA", value: "1" });
  await admin("set", { key: `pl:tok:${TOKEN}`, value: JSON.stringify({ owner: "ownerA", invoiceId: "inv_00000001", createdAt: T }) });
  await admin("set", { hash: "pl:own:ownerA", field: "inv_00000001", value: TOKEN });
}
const page = (path, init) => fetch(DEV + path, { redirect: "manual", ...init });
const post = (body, headers = {}) => page(`/i/${TOKEN}/`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: DEV, "X-Real-IP": headers.ip ?? "203.0.113.5", ...headers }, body: new URLSearchParams(body).toString() });
const claims = async () => (await admin("get", { list: `pl:claims:${TOKEN}` })).value;

// Clients abroad (docs/spec-foreign-clients.md §4.3, §4.5): seeded through fake-upstash, since no UI can create the data yet.
const FTOKEN = "Fx7pQ2xYz9AbCdEfGhIjKl";
const intlSettings = (extra = {}) => ({
  on: true, accountName: "Sharma Tuition LLP", bankName: "HDFC Bank", swift: "HDFCINBB", account: "GB82WEST12345698765432",
  bankDetails: "Fort, Mumbai\nIntermediary: Citibank NY", payUrl: "https://paypal.me/sharmatuition", exportUnderLut: false, lutArn: "", lutFy: "", updatedAt: T, ...extra,
});
const foreignWorkspace = (overrides = {}, settings = intlSettings(), business = {}) => ({
  ...workspace(),
  business: { ...workspace().business, ...business },
  intl: {
    settings,
    invoices: {
      inv_usd00001: {
        id: "inv_usd00001", number: "INV-0042", clientId: "cli_aaaaaaaa", issueDate: "2026-10-01", dueDate: "2099-10-15", currency: "USD",
        amountPaise: 150000, description: "Design retainer", payments: [{ id: "pay_bbbbbbbb", amountPaise: 30000, date: "2026-10-03", mode: "bank", reference: "SECRETREF77", inrCreditedPaise: 2490000, createdAt: T }],
        reminders: [], voided: false, createdAt: T, updatedAt: T, ...overrides,
      },
    },
    recurring: {},
    clients: {},
  },
});
async function seedForeign(owner = "ownerA", ...args) {
  await admin("reset", {});
  await admin("set", { key: `ws:doc:${owner}`, value: JSON.stringify(foreignWorkspace(...args)) });
  await admin("set", { key: `ws:rev:${owner}`, value: "1" });
  await admin("set", { key: `pl:tok:${FTOKEN}`, value: JSON.stringify({ owner, invoiceId: "inv_usd00001", createdAt: T, intl: 1 }) });
  await admin("set", { hash: `pl:own:${owner}`, field: "inv_usd00001", value: FTOKEN });
}
const fpost = (body, headers = {}) => page(`/i/${FTOKEN}/`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: DEV, "X-Real-IP": headers.ip ?? "203.0.113.7", ...headers }, body: new URLSearchParams(body).toString() });
const fclaims = async () => (await admin("get", { list: `pl:claims:${FTOKEN}` })).value;
const b64u = (v) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");
function sessionToken(userId) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64u({ alg: "RS256", typ: "JWT" });
  const body = b64u({ sub: userId, sid: `sess_${userId}`, iat: now - 5, nbf: now - 5, exp: now + 900, iss: "https://e2e.clerk.accounts.dev" });
  const sig = createSign("RSA-SHA256").update(`${head}.${body}`).sign(process.env.E2E_JWT_PRIVATE_KEY).toString("base64url");
  return `${head}.${body}.${sig}`;
}
const ownerOf = (userId) => createHash("sha256").update(`workspace:${userId}`).digest("hex").slice(0, 32);
async function api(method, path, user, body) {
  const res = await page(path, { method, headers: { Accept: "application/json", Origin: DEV, Authorization: `Bearer ${sessionToken(user)}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text };
}
const PAGE_HEADERS = ["cache-control", "content-security-policy", "referrer-policy", "x-frame-options", "x-robots-tag"];
const headerSet = (res) => PAGE_HEADERS.map((h) => `${h}: ${res.headers.get(h)}`).join("\n");

try {
  await seed();
  // Raw HTTP checks.
  let res = await page(`/i/${TOKEN}/`);
  let html = await res.text();
  check("pay page renders 200", res.status === 200, `${res.status} ${html.slice(0, 200)}`);
  check("shows merchant, invoice and live balance", html.includes("Sharma Tuition") && html.includes("INV-0007") && html.includes("₹2,000") && html.includes("part already paid"));
  check("UPI intent has payee, balance amount, note; no tr param", /upi:\/\/pay\?pa=sharma%40okaxis&amp;pn=Sharma\+Tuition&amp;am=2000\.00&amp;cu=INR&amp;tn=Invoice\+INV-0007/.test(html), html.match(/upi:\/\/pay[^"]*/)?.[0]);
  check("QR image embedded", /<img src="data:image\/png;base64,/.test(html));
  check("client identity never shown", !/Rohan|9876543210|rohan@example\.com/.test(html));
  check("noindex + no-store + CSP blocks scripts", (res.headers.get("x-robots-tag") || "").includes("noindex") && res.headers.get("cache-control") === "no-store" && (res.headers.get("content-security-policy") || "").includes("script-src 'none'"));
  check("no Clerk scripts on pay page", !/<script[^>]*clerk|clerk\.browser|ClerkClient/i.test(html));
  check("growth link to tracker", html.includes('href="/payment-tracker/"'));
  check("INR footer is static text, byte for byte as before (apostrophe unescaped)", html.includes("Money goes straight to Sharma Tuition's UPI account. Pro UPI QR never holds or processes payments, and only Sharma Tuition can mark this invoice paid."));
  res = await page("/i/not-a-token/");
  check("malformed token → 404", res.status === 404);
  res = await page("/i/ZZZZZZZZZZZZZZZZZZZZZZ/");
  check("unknown token → 404 'no longer active'", res.status === 404 && (await res.text()).includes("no longer active"));

  // Claims.
  res = await post({ utr: "abc", amount: "" });
  html = await res.text();
  check("invalid UTR rejected with message", res.status === 200 && html.includes("12-digit UTR") && (await claims()).length === 0);
  res = await post({ utr: "412345678901", amount: "20x" });
  check("invalid amount rejected", (await res.text()).includes("Enter the amount you paid") && (await claims()).length === 0);
  res = await post({ utr: "412345678901", amount: "" }, { Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site" });
  check("cross-site POST rejected", res.status === 403 || (await res.text()).includes("submit the form from this page"));
  check("…and stores nothing", (await claims()).length === 0);
  res = await post({ utr: "412345678901", amount: "2000" });
  check("valid claim → 303 to ?claimed=1", res.status === 303 && res.headers.get("location") === `/i/${TOKEN}/?claimed=1`, `${res.status} ${res.headers.get("location")}`);
  const stored = await claims();
  check("claim stored with UTR and paise", stored.length === 1 && JSON.parse(stored[0]).utr === "412345678901" && JSON.parse(stored[0]).amountPaise === 200000, JSON.stringify(stored));
  await post({ utr: "412345678901", amount: "2000" });
  check("duplicate UTR not stored twice", (await claims()).length === 1);
  let limitedHit = false;
  for (let i = 0; i < 6; i++) {
    const r = await post({ utr: `51234567890${i}`, amount: "" }, { ip: "198.51.100.9" });
    if ((await r.text()).includes("Too many submissions")) limitedHit = true;
  }
  check("per-visitor claim rate limit", limitedHit);

  // Paid and void states.
  await seed({ payments: [{ id: "pay_aaaaaaaa", amountPaise: 300000, date: "2026-10-03", mode: "upi", reference: "", createdAt: T }] });
  html = await (await page(`/i/${TOKEN}/`)).text();
  check("paid invoice shows Paid ✓ and no pay button/form", html.includes("Paid ✓") && !html.includes("upi://pay") && !html.includes("<form"));
  await seed({ voided: true });
  html = await (await page(`/i/${TOKEN}/`)).text();
  check("void invoice shows Cancelled", html.includes("Cancelled") && !html.includes("upi://pay"));
  await seed({ deletedAt: T + 5 });
  check("deleted invoice → 404", (await page(`/i/${TOKEN}/`)).status === 404);

  // --- A foreign-currency invoice's pay page ---
  await seed();
  const inrPage = await page(`/i/${TOKEN}/`);
  const inrHeaders = headerSet(inrPage);
  check("(INR reference page for the header comparison renders)", inrPage.status === 200);
  await seedForeign();
  res = await page(`/i/${FTOKEN}/`);
  html = await res.text();
  check("foreign pay page renders 200", res.status === 200, `${res.status} ${html.slice(0, 200)}`);
  check("shows the balance in its currency and what was paid", html.includes("US$1,200.00") && html.includes("US$1,500.00") && html.includes("US$300.00 already paid") && html.includes("INV-0042"), html.match(/US\$[^<]*/g)?.join(" | "));
  check("title names the amount and the business", html.includes("<title>Pay US$1,200.00 to Sharma Tuition</title>"));
  check("bank details: account name, bank, SWIFT, grouped IBAN, routing text", html.includes("Sharma Tuition LLP") && html.includes("HDFC Bank") && html.includes("HDFCINBB") && html.includes("GB82 WEST 1234 5698 7654 32") && html.includes("Intermediary: Citibank NY"));
  check("the payment link is the action, with rel attributes", /<a href="https:\/\/paypal\.me\/sharmatuition" target="_blank" rel="noopener noreferrer nofollow"[^>]*>Pay on paypal\.me<\/a>/.test(html), html.match(/<a [^>]*paypal[^>]*>[^<]*/)?.[0]);
  check("…and the bank block sits below it", html.includes("Or pay by bank transfer") && html.indexOf("Pay on paypal.me") < html.indexOf("Or pay by bank transfer") && html.includes("Use INV-0042 as the payment reference"));
  check("no UPI intent, no QR image, no UPI ID", !html.includes("upi://") && !/<img src="data:/.test(html) && !html.includes("sharma@okaxis") && !/UPI ID|UTR/.test(html));
  check("no client identity, payments, references or INR credited", !/Rohan|9876543210|rohan@example\.com|SECRETREF77|24,900|2490000/.test(html));
  check("no UPI promo line on a foreign page", !html.includes("0% gateway fee") && html.includes("Money goes straight to Sharma Tuition's bank or payment account. Pro UPI QR never handles it."));
  check("headers identical to the INR page", headerSet(res) === inrHeaders, `${headerSet(res)} ≠ ${inrHeaders}`.replaceAll("\n", " | "));
  check("transfer-reference form, never UTR wording", html.includes("Sent the payment?") && html.includes("Transfer reference (from your bank, PayPal or Wise)") && html.includes("Amount sent (USD, optional)") && /I(&#39;|')ve sent it/.test(html));

  // Claims: a transfer reference, the amount in cents, the currency from the snapshot.
  res = await fpost({ ref: "abc", amount: "" });
  html = await res.text();
  check("invalid transfer reference rejected", html.includes("Enter the transfer reference from your bank, PayPal or Wise (6–40 letters, digits or dashes).") && !html.includes("12-digit UTR") && (await fclaims()).length === 0);
  res = await fpost({ ref: "eb6305c9-1f7f-49de-aed0-16487c27b42d", amount: "12,50" });
  check("a decimal comma is refused, nothing stored", (await res.text()).includes("Enter the amount like 1,200.50, or leave it blank.") && (await fclaims()).length === 0);
  res = await fpost({ ref: "eb6305c9-1f7f-49de-aed0-16487c27b42d", amount: "1,200.00", currency: "EUR" });
  check("valid UETR claim → 303 to ?claimed=1", res.status === 303 && res.headers.get("location") === `/i/${FTOKEN}/?claimed=1`, `${res.status} ${res.headers.get("location")}`);
  const fstored = (await fclaims()).map((c) => JSON.parse(c));
  check("stored with currency USD (from the snapshot) and the amount in cents", fstored.length === 1 && fstored[0].utr === "eb6305c9-1f7f-49de-aed0-16487c27b42d" && fstored[0].amountPaise === 120000 && fstored[0].currency === "USD", JSON.stringify(fstored));
  await fpost({ ref: "eb6305c9-1f7f-49de-aed0-16487c27b42d", amount: "" });
  check("the same reference isn't stored twice", (await fclaims()).length === 1);
  res = await fpost({ ref: "412345678901", amount: "" }, { Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site" });
  check("cross-site foreign claim rejected", (res.status === 403 || (await res.text()).includes("submit the form from this page")) && (await fclaims()).length === 1);
  html = await (await page(`/i/${FTOKEN}/?claimed=1`)).text();
  check("thank-you after a foreign claim, no form", html.includes("reference sent to Sharma Tuition") && !html.includes("<form"));

  // Export line (owner decision Q3), states, and hostile or old snapshots.
  await seedForeign("ownerA", { exportLut: true }, intlSettings({ exportUnderLut: true, lutArn: "AD2701260012345", lutFy: "2026-27" }), { gstin: "27ABCDE1234F1Z5" });
  html = await (await page(`/i/${FTOKEN}/`)).text();
  check("export line with the LUT ARN", html.includes("UNDER BOND OR LETTER OF UNDERTAKING WITHOUT PAYMENT OF INTEGRATED TAX (LUT ARN AD2701260012345)"));
  await seedForeign("ownerA", { payments: [{ id: "pay_bbbbbbbb", amountPaise: 150000, date: "2026-10-03", mode: "bank", reference: "", createdAt: T }] });
  html = await (await page(`/i/${FTOKEN}/`)).text();
  check("paid foreign invoice: Paid ✓, no details, no form", html.includes("Paid ✓") && !html.includes("<form") && !html.includes("HDFCINBB") && !html.includes("paypal.me"));
  await seedForeign("ownerA", { voided: true });
  html = await (await page(`/i/${FTOKEN}/`)).text();
  check("void foreign invoice shows Cancelled", html.includes("Cancelled") && !html.includes("<form"));
  await seedForeign("ownerA", { deletedAt: T + 5 });
  check("deleted foreign invoice → 404", (await page(`/i/${FTOKEN}/`)).status === 404);
  await seedForeign("ownerA", {}, intlSettings({ accountName: "", bankName: "", swift: "", account: "", bankDetails: "", payUrl: "" }));
  html = await (await page(`/i/${FTOKEN}/`)).text();
  check("details cleared: a contact note, no UPI fallback", /The sender hasn(&#39;|')t added payment details yet\. Contact them to pay\./.test(html));
  check("…and no claim form without details", !html.includes("<form") && !html.includes("upi://"));
  await seedForeign();
  const hostile = { kind: "foreign", view: { merchantName: "Sharma Tuition", currency: "USD", invoiceNumber: "INV-0042", amountMinor: 1000, balanceMinor: 1000, dueDate: "2099-01-01", description: "", state: "due", pay: { accountName: "X", account: "12345678", swift: "HDFCINBB", payUrl: "javascript:alert(1)" } } };
  await admin("set", { hash: "pl:views:ownerA", field: FTOKEN, value: JSON.stringify(hostile) });
  html = await (await page(`/i/${FTOKEN}/`)).text();
  check("a hostile stored payUrl renders no link", html.includes("US$10.00") && !html.includes("javascript:") && !html.includes("Pay on") && html.includes("Pay by bank transfer"));
  await admin("set", { hash: "pl:views:ownerA", field: FTOKEN, value: JSON.stringify({ ...hostile, view: { ...hostile.view, pay: { payUrl: "https://paypal.me.evil.example/x" } } }) });
  html = await (await page(`/i/${FTOKEN}/`)).text();
  check("…nor one to a look-alike host", !html.includes("evil.example") && !html.includes("Pay on"));
  // A snapshot stored before this feature (kind "invoice", no currency) still renders ₹.
  await seed();
  await admin("set", { hash: "pl:views:ownerA", field: TOKEN, value: JSON.stringify({ kind: "invoice", view: { merchantName: "Sharma Tuition", upiId: "sharma@okaxis", invoiceNumber: "INV-0007", amountPaise: 300000, balancePaise: 200000, dueDate: "2026-10-15", description: "October tuition", state: "due" } }) });
  html = await (await page(`/i/${TOKEN}/`)).text();
  check("an old stored INR snapshot still renders ₹ with its UPI QR", html.includes("₹2,000") && html.includes("upi://pay") && /<img src="data:image\/png;base64,/.test(html) && !html.includes("US$"));

  // Older tabs never see or revoke foreign links (§1.7): GET hides and DELETE refuses them without ?intl=1.
  {
    const user = "user_e2eForeignLinks01";
    const owner = ownerOf(user);
    await admin("reset", {});
    await admin("set", { key: `ws:doc:${owner}`, value: JSON.stringify(foreignWorkspace()) });
    await admin("set", { key: `ws:rev:${owner}`, value: "1" });
    let r = await api("POST", "/api/v1/paylinks/", user, { invoiceId: "inv_usd00001" });
    const ftok = r.json?.token;
    check("POST creates a link for a foreign invoice (no UPI needed)", r.status === 201 && typeof ftok === "string", r.text.slice(0, 200));
    const rec = JSON.parse((await admin("get", { key: `pl:tok:${ftok}` })).value);
    check("its record carries intl: 1", rec.intl === 1 && rec.invoiceId === "inv_usd00001", JSON.stringify(rec));
    r = await api("POST", "/api/v1/paylinks/", user, { invoiceId: "inv_00000001" });
    const itok = r.json?.token;
    check("an INR link's record is unchanged", r.status === 201 && JSON.stringify(Object.keys(JSON.parse((await admin("get", { key: `pl:tok:${itok}` })).value))) === JSON.stringify(["owner", "invoiceId", "createdAt"]));
    r = await api("GET", "/api/v1/paylinks/", user);
    check("GET without ?intl=1 hides the foreign link (and still counts it)", r.status === 200 && r.json.links.length === 1 && r.json.links[0].token === itok && r.json.plan.used === 2, r.text.slice(0, 300));
    r = await api("GET", "/api/v1/paylinks/?books=1&intl=1", user);
    check("GET with ?intl=1 lists both", r.status === 200 && r.json.links.map((l) => l.token).sort().join() === [ftok, itok].sort().join(), r.text.slice(0, 300));
    r = await api("DELETE", `/api/v1/paylinks/${ftok}/`, user, { scope: "link" });
    check("DELETE without ?intl=1 → 409, link kept", r.status === 409 && r.json?.code === "intl_link" && Boolean((await admin("get", { key: `pl:tok:${ftok}` })).value), r.text.slice(0, 200));
    r = await api("DELETE", `/api/v1/paylinks/${itok}/`, user, { scope: "claims" });
    check("INR links still delete without the marker", r.status === 200);
    r = await api("DELETE", `/api/v1/paylinks/${ftok}/?intl=1`, user, { scope: "link" });
    check("DELETE with ?intl=1 revokes it", r.status === 200 && !(await admin("get", { key: `pl:tok:${ftok}` })).value);
    // No details → 409 no_intl.
    await admin("set", { key: `ws:doc:${owner}`, value: JSON.stringify(foreignWorkspace({}, intlSettings({ accountName: "", payUrl: "" }))) });
    r = await api("POST", "/api/v1/paylinks/", user, { invoiceId: "inv_usd00001" });
    check("no international details → 409 no_intl", r.status === 409 && r.json?.code === "no_intl" && r.json?.error === "Add international payment details in Settings before sharing pay links for foreign-currency invoices.", r.text.slice(0, 200));
  }

  // An INR-only account: an older tab's list (no ?intl=1) reads each link's record alongside its claims, not before
  // them, so it adds one pipelined KV request (whatever the number of links) and no round trip in sequence.
  {
    const user = "user_e2eInrOnlyLinks01";
    const owner = ownerOf(user);
    await admin("reset", {});
    await admin("set", { key: `ws:doc:${owner}`, value: JSON.stringify(workspace()) });
    await admin("set", { key: `ws:rev:${owner}`, value: "1" });
    for (let i = 1; i <= 6; i++) {
      const tok = `In${String(i).repeat(20)}`;
      await admin("set", { key: `pl:tok:${tok}`, value: JSON.stringify({ owner, invoiceId: `inv_0000000${i}`, createdAt: T }) });
      await admin("set", { hash: `pl:own:${owner}`, field: `inv_0000000${i}`, value: tok });
    }
    const stats = async () => (await fetch(`${KV}/__admin/stats`, { method: "POST", body: "reset" })).json();
    const counted = async (path) => { await stats(); const at = Date.now(); const r = await api("GET", path, user); return { ...r, ms: Date.now() - at, kv: (await stats()).requests }; };
    let older = await counted("/api/v1/paylinks/?books=1");
    let current = await counted("/api/v1/paylinks/?books=1&intl=1");
    check("INR-only: an older tab's list gets the same links as a current tab's", older.status === 200 && older.text === current.text && older.json.links.length === 6, `${older.text.slice(0, 120)} ≠ ${current.text.slice(0, 120)}`);
    check("INR-only: …with at most one extra KV request for 6 links", older.kv <= current.kv + 1, `older ${older.kv} vs current ${current.kv}`);
    // Every pay-link KV request now takes 400 ms: a record read in sequence would show as a third 400 ms step.
    await admin("fault", { match: "pl:", count: 1000, delayMs: 400 });
    older = await counted("/api/v1/paylinks/?books=1");
    current = await counted("/api/v1/paylinks/?books=1&intl=1");
    check("INR-only: …and no extra round trip in sequence", current.status === 200 && older.status === 200 && older.ms < current.ms + 200, `older ${older.ms} ms vs current ${current.ms} ms`);
    await admin("reset", {});
  }

  // Management API requires sign-in.
  for (const [method, path] of [["GET", "/api/v1/paylinks/"], ["POST", "/api/v1/paylinks/"], ["DELETE", `/api/v1/paylinks/${TOKEN}/`], ["GET", "/api/v1/workspace/"], ["PUT", "/api/v1/workspace/"], ["DELETE", "/api/v1/workspace/"]]) {
    const r = await page(path, { method, headers: { "Content-Type": "application/json", Origin: DEV }, body: method === "GET" ? undefined : "{}" });
    check(`${method} ${path} → 401 when signed out`, r.status === 401, String(r.status));
  }

  // Browser: real form flow on a phone-sized screen.
  await seed();
  const b = await startBrowser(9337);
  try {
    await b.mobile(true);
    await b.go(`${DEV}/i/${TOKEN}/`, 2500);
    await b.shot("pl-01-pay-page-mobile.png");
    await b.eval("document.getElementById('utr').value = '612345678901'; document.getElementById('amount').value = '2000'; document.querySelector('form').submit(); true");
    await b.waitFor("location.search === '?claimed=1'", 8000);
    check("browser form submit lands on thank-you", (await b.eval("document.body.innerText")).includes("reference sent to Sharma Tuition"));
    check("thank-you hides the form", !(await b.eval("!!document.querySelector('form')")));
    await b.shot("pl-02-claimed-mobile.png");
    check("no console errors on pay page", b.errors.length === 0, b.errors.join(" | "));
    // The foreign page on a phone: no horizontal scroll, the form's pattern is valid, the real form submits.
    await seedForeign();
    await b.go(`${DEV}/i/${FTOKEN}/`, 2500);
    await b.shot("pl-03-foreign-mobile.png");
    check("foreign page fits a phone (no horizontal scroll)", await b.eval("document.documentElement.scrollWidth <= window.innerWidth"));
    check("the reference pattern accepts a UETR in the browser", await b.eval("(() => { const i = document.getElementById('ref'); i.value = 'eb6305c9-1f7f-49de-aed0-16487c27b42d'; return i.checkValidity(); })()"));
    await b.eval("document.getElementById('amount').value = '1200'; document.querySelector('form').submit(); true");
    await b.waitFor("location.search === '?claimed=1'", 8000);
    check("browser foreign claim lands on thank-you", (await b.eval("document.body.innerText")).includes("reference sent to Sharma Tuition"));
    check("no console errors on the foreign page", b.errors.length === 0, b.errors.join(" | "));
  } finally {
    b.close();
  }
} catch (error) {
  check("test script ran to completion", false, String(error).slice(0, 500));
}
process.exit(check.report());
