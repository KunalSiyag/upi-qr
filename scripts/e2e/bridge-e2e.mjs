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

  // A device with a payment book prefetches the tracker's storage code on idle, without an edit.
  await b.go(BASE + "/invoice-generator/", 1500);
  check("with a payment book: tracker code is prefetched on idle", await b.waitFor("performance.getEntriesByType('resource').some(e => /\\/_astro\\/localStore\\.[^/]+\\.js$/.test(e.name))", 12000));

  // Review round 2: the tracker's storage code is prefetched once the page is idle, so the click needs no network
  // (connection lost, or a deploy replaced the chunk while the page was open). Review round 4: on a device without a
  // payment book, only after the visitor edits the document; a visitor who only reads the page never downloads it.
  const fetchedTracker = "performance.getEntriesByType('resource').some(e => /\\/_astro\\/localStore\\.[^/]+\\.js$/.test(e.name))";
  for (const [path, tool] of [["/receipt-generator/", "receipt"], ["/invoice-generator/", "invoice"]]) {
    await b.eval("const d = JSON.parse(localStorage.getItem('proupiqr-invoice-draft')); localStorage.clear(); d.invoiceNo = 'KDS-105'; localStorage.setItem('proupiqr-invoice-draft', JSON.stringify(d)); true");
    await b.go(BASE + path, 1500);
    await b.eval("document.querySelector('#invoice-tool, #receipt-tool, #tool')?.scrollIntoView(); true");
    await b.waitFor("[...document.querySelectorAll('button')].some(b => /Track payment|Save to payment book/.test(b.textContent))", 10000);
    await sleep(6000);
    check(`${tool} generator, no payment book, no edit: tracker code never downloaded`, !(await b.eval(fetchedTracker)));
  }
  // An edit (the notes field), then idle: prefetched.
  await b.eval("const el = [...document.querySelectorAll('textarea')].pop(); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, 'Thanks for your business'); el.dispatchEvent(new Event('input', { bubbles: true })); true");
  check("after an edit: tracker code is prefetched on idle", await b.waitFor(fetchedTracker, 12000));
  await b.send("Network.setBlockedURLs", { urls: ["*/_astro/localStore*"] });
  try {
    await b.eval("document.getElementById('invoice-tool').scrollIntoView(); true");
    await b.waitFor("[...document.querySelectorAll('button')].some(b => /Track payment/.test(b.textContent))", 10000);
    await t("__t.click(/Track payment/)");
    await b.waitFor("location.pathname === '/app/'", 8000);
    data = await ws();
    check("Track payment records the invoice with the chunk unreachable", Object.values(data?.invoices ?? {}).some((i) => i.number === "KDS-105"), JSON.stringify(data && Object.keys(data.invoices)));
  } finally {
    await b.send("Network.setBlockedURLs", { urls: [] });
  }

  // Non-INR templates hide the button.
  await b.eval("const d = JSON.parse(localStorage.getItem('proupiqr-invoice-draft')); d.templateId = 'us-sales'; localStorage.setItem('proupiqr-invoice-draft', JSON.stringify(d)); true");
  await b.go(BASE + "/invoice-generator/", 1500);
  await b.eval("document.getElementById('invoice-tool').scrollIntoView(); true");
  await b.waitFor("[...document.querySelectorAll('button')].some(b => /Download PDF/.test(b.textContent))", 10000);
  await t("__t.click(/USA/)");
  await sleep(300);
  check("Track payment hidden for non-INR templates", !(await b.eval("[...document.querySelectorAll('button')].some(b => /Track payment/.test(b.textContent))")));
  // Review round 3: pages where the button can't render never download the tracker code.
  const trackerFetched = "performance.getEntriesByType('resource').some(e => /\\/_astro\\/localStore\\.[^/]+\\.js$/.test(e.name))";
  for (const [path, label] of [["/de/invoice-generator/", "non-INR invoice template (€)"], ["/es/receipt-generator/", "non-INR receipt page (€)"]]) {
    await b.go(BASE + path, 1500);
    await b.eval("document.getElementById('tool').scrollIntoView(); true");
    const hydrated = await b.waitFor("!!document.querySelector('#tool astro-island') && !document.querySelector('#tool astro-island[ssr]')", 10000);
    await sleep(6000);
    check(`${label}: hydrated, tracker code never prefetched`, hydrated && !(await b.eval(trackerFetched)));
  }

  // Bridge from the receipt generator: settles the client's open invoice first, keeps the rest as a paid entry, never twice.
  const T0 = Date.now();
  const seeded = {
    version: 1,
    business: { name: "Sharma Tuition", upiId: "sharma@okaxis", phone: "", gstin: "", invoicePrefix: "TU-", updatedAt: T0 },
    clients: { cli_riya0001: { id: "cli_riya0001", name: "Riya Sharma", phone: "", email: "", gstin: "", createdAt: T0, updatedAt: T0 } },
    invoices: { inv_open0001: { id: "inv_open0001", number: "TU-0008", clientId: "cli_riya0001", issueDate: "2026-09-01", dueDate: "2026-09-10", amountPaise: 150000, description: "September fees", payments: [], reminders: [], voided: false, createdAt: T0, updatedAt: T0 } },
  };
  const receiptDraft = { merchant: "Sharma Tuition", upiId: "sharma@okaxis", customer: "Riya Sharma", customerPhone: "", receiptNo: "RCPT-0007", receiptDate: "2026-10-05", paymentMode: "UPI", referenceNo: "412345678901", receivedBy: "", notes: "", items: [{ id: 1, name: "Tuition fees", qty: "1", price: "3000" }] };
  const saveReceipt = async () => {
    await b.go(BASE + "/receipt-generator/", 1500);
    await b.eval("document.getElementById('receipt-tool').scrollIntoView(); true");
    await b.waitFor("[...document.querySelectorAll('button')].some(b => /Save to payment book/.test(b.textContent))", 10000);
    await t("__t.click(/Save to payment book/)");
  };
  await b.eval(`localStorage.clear(); localStorage.setItem('proupiqr-workspace-v1', ${JSON.stringify(JSON.stringify(seeded))}); localStorage.setItem('proupiqr-receipt-draft', ${JSON.stringify(JSON.stringify(receiptDraft))}); true`);
  await saveReceipt();
  await b.waitFor("location.pathname === '/app/'", 8000);
  await sleep(1500);
  check("receipt opens all invoices in the tracker (saved flag removed)", (await b.eval("location.pathname + location.search")) === "/app/?tab=invoices&filter=all");
  check("receipt save is confirmed", /Receipt saved to your payment book/.test(await text()));
  data = await ws();
  const settled = data.invoices.inv_open0001;
  const entry = Object.values(data.invoices).find((i) => i.number === "RCPT-0007");
  check("receipt settles the open invoice first, with the UTR as reference", settled.payments.length === 1 && settled.payments[0].amountPaise === 150000 && settled.payments[0].reference === "412345678901", JSON.stringify(settled.payments));
  check("rest of the receipt is a paid entry", !!entry && entry.amountPaise === 150000 && entry.payments.length === 1 && entry.payments[0].amountPaise === 150000 && entry.payments[0].mode === "upi");
  check("both show in the invoice list", /TU-0008/.test(await text()) && /RCPT-0007/.test(await text()));
  await saveReceipt();
  await b.waitFor("location.pathname === '/app/'", 8000);
  await sleep(800);
  data = await ws();
  check("saving the same receipt again records nothing", Object.values(data.invoices).reduce((n, i) => n + i.payments.length, 0) === 2, JSON.stringify(Object.values(data.invoices).map((i) => [i.number, i.payments.length])));
  await b.eval("localStorage.removeItem('proupiqr-receipt-draft'); true");
  await saveReceipt();
  await sleep(800);
  check("the untouched sample receipt is refused", (await b.eval("location.pathname")) === "/receipt-generator/" && /Add who paid/.test(await b.eval("document.getElementById('proupiqr-export-toast')?.textContent || ''")));

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
