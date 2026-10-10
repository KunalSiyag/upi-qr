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
  } finally {
    b.close();
  }
} catch (error) {
  check("test script ran to completion", false, String(error).slice(0, 500));
}
process.exit(check.report());
