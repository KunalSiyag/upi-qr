import { checker, helpers, sleep, startBrowser } from "./cdp-lib.mjs";

const BASE = process.env.BASE || "http://localhost:4400";
const b = await startBrowser(9335);
const check = checker();
const t = async (js) => { await b.eval(helpers); return b.eval(js); };
const text = () => b.eval("document.body.innerText");
const ws = () => b.eval("JSON.parse(localStorage.getItem('proupiqr-workspace-v1') || 'null')");

try {
  // Landing page.
  await b.go(BASE + "/payment-tracker/", 2000);
  check("landing page is indexable", (await b.eval("document.querySelector('meta[name=robots]').content")).startsWith("index"));
  check("landing CTA links to /app/", await b.eval("[...document.querySelectorAll('a')].some(a => a.getAttribute('href') === '/app/' && /Open payment tracker/.test(a.textContent))"));
  check("landing has FAQ + HowTo schema", await b.eval("[...document.querySelectorAll('script[type=\"application/ld+json\"]')].some(s => s.textContent.includes('FAQPage') && s.textContent.includes('HowTo'))"));
  check("billing nav lists payment tracker", await b.eval("[...document.querySelectorAll('header a, nav a')].some(a => a.getAttribute('href') === '/payment-tracker/')"));
  check("no errors on landing", b.errors.length === 0, b.errors.join(" | "));

  // ?new=1 opens the new-invoice sheet.
  await b.eval("localStorage.clear(); true");
  await b.go(BASE + "/app/?new=1", 2500);
  check("?new=1 opens new invoice sheet", await b.waitFor("!!document.getElementById('ws-amount')"));

  // Bridge from the invoice generator.
  await b.eval("localStorage.clear(); localStorage.setItem('proupiqr-invoice-draft', JSON.stringify({ templateId: 'in-gst', merchant: 'Kunal Design Studio', upiId: 'kunal@okicici', customer: 'Bright Kids School', invoiceNo: 'KDS-104', invoiceDate: '2026-09-01', dueDate: '2026-09-16', gstPercent: '18', discount: '0', notes: '', items: [{ id: 1, name: 'Logo design', qty: '1', price: '10000' }, { id: 2, name: 'Brochure', qty: '2', price: '2500' }] })); true");
  await b.go(BASE + "/invoice-generator/", 1500);
  await b.eval("document.getElementById('invoice-tool').scrollIntoView(); true");
  await b.waitFor("[...document.querySelectorAll('button')].some(b => /Track payment/.test(b.textContent))", 10000);
  await t("__t.click(/Track payment/)");
  await b.waitFor("location.pathname === '/app/'", 8000);
  await sleep(1500);
  const page = await text();
  check("Track payment navigates to /app/ invoices", (await b.eval("location.pathname + location.search")) === "/app/?tab=invoices");
  check("tracked invoice shows with GST total", /Bright Kids School/.test(page) && /KDS-104/.test(page) && page.includes("₹17,700"), page.slice(0, 800));
  let data = await ws();
  check("business seeded from invoice draft", data.business.name === "Kunal Design Studio" && data.business.upiId === "kunal@okicici");
  const inv = Object.values(data.invoices)[0];
  check("tracked invoice fields", inv.dueDate === "2026-09-16" && inv.amountPaise === 1770000 && inv.description === "Logo design, Brochure");

  // Record a part payment, then re-track the same invoice after editing amount: no duplicate, payment kept.
  await t("[...document.querySelectorAll('li [aria-expanded]')][0].click(), true");
  await t("__t.click(/^Record payment$/)");
  await b.waitFor("!!document.getElementById('ws-pay-amount')");
  await t("__t.set('ws-pay-amount', '5000'), __t.click(/^Save payment$/, __t.dialog())");
  await b.waitFor("!document.querySelector('[role=dialog]')");
  await b.eval("const d = JSON.parse(localStorage.getItem('proupiqr-invoice-draft')); d.items[1].qty = '3'; localStorage.setItem('proupiqr-invoice-draft', JSON.stringify(d)); true");
  await b.go(BASE + "/invoice-generator/", 1500);
  await b.eval("document.getElementById('invoice-tool').scrollIntoView(); true");
  await b.waitFor("[...document.querySelectorAll('button')].some(b => /Track payment/.test(b.textContent))", 10000);
  await t("__t.click(/Track payment/)");
  await b.waitFor("location.pathname === '/app/'", 8000);
  await sleep(1200);
  data = await ws();
  const invoices = Object.values(data.invoices);
  check("re-tracking updates instead of duplicating", invoices.length === 1 && invoices[0].amountPaise === 2065000 && invoices[0].payments.length === 1, JSON.stringify(invoices.map((i) => [i.number, i.amountPaise, i.payments.length])));

  // Non-INR templates hide the button.
  await b.eval("const d = JSON.parse(localStorage.getItem('proupiqr-invoice-draft')); d.templateId = 'us-sales'; localStorage.setItem('proupiqr-invoice-draft', JSON.stringify(d)); true");
  await b.go(BASE + "/invoice-generator/", 1500);
  await b.eval("document.getElementById('invoice-tool').scrollIntoView(); true");
  await b.waitFor("[...document.querySelectorAll('button')].some(b => /Download PDF/.test(b.textContent))", 10000);
  await t("__t.click(/USA/)");
  await sleep(300);
  check("Track payment hidden for non-INR templates", !(await b.eval("[...document.querySelectorAll('button')].some(b => /Track payment/.test(b.textContent))")));

  // Waitlist card now links to the tracker.
  await b.eval("localStorage.removeItem('proupiqr-waitlist'); sessionStorage.clear(); true");
  await b.go(BASE + "/receipt-generator/", 1500);
  await b.eval("document.querySelector('#receipt-tool, main section:nth-of-type(2)')?.scrollIntoView(); true");
  await b.waitFor("[...document.querySelectorAll('button')].some(b => /PDF/.test(b.textContent) && b.offsetParent)", 10000);
  await t("__t.click(/PDF/)");
  await b.waitFor("!!document.querySelector('aside[aria-labelledby=\"waitlist-title\"]')", 15000);
  check("waitlist card links to free tracker", await b.eval("!!document.querySelector('aside a[href=\"/app/\"]')"));
  check("no console errors", b.errors.length === 0, b.errors.join(" | "));
} catch (error) {
  check("test script ran to completion", false, String(error).slice(0, 500));
} finally {
  b.close();
}
process.exit(check.report());
