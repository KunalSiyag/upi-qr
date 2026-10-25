import { checker, helpers, sleep, startBrowser } from "./cdp-lib.mjs";

const BASE = process.env.BASE || "http://localhost:4400";
const b = await startBrowser();
const check = checker();
const t = async (js) => { await b.eval(helpers); return b.eval(js); };
const text = () => b.eval("document.body.innerText");
const T = Date.now();
// Local calendar day (the app's "today" is local time, not UTC; they differ 00:00–05:30 IST).
const iso = (n) => { const d = new Date(Date.now() + n * 86_400_000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const ws = {
  version: 1,
  business: { name: "शर्मा ट्यूशन", upiId: "sharma@okaxis", phone: "", gstin: "", invoicePrefix: "TU-", updatedAt: T },
  clients: { cli_riya0001: { id: "cli_riya0001", name: "Riya", phone: "9876543210", email: "", gstin: "", createdAt: T, updatedAt: T } },
  invoices: { inv_00000001: { id: "inv_00000001", number: "TU-0001", clientId: "cli_riya0001", issueDate: iso(-20), dueDate: iso(-6), amountPaise: 300000, description: "", payments: [], reminders: [], voided: false, createdAt: T, updatedAt: T } },
  recurring: {},
};

try {
  await b.send("Network.setBlockedURLs", { urls: ["*clerk.accounts.dev*", "*clerk.browser.js*"] });
  await b.go(BASE + "/terms/", 300);
  await b.eval(`localStorage.clear(); localStorage.setItem('proupiqr-workspace-v1', ${JSON.stringify(JSON.stringify(ws))}); true`);
  await b.go(BASE + "/app/", 2500);
  check("English by default", (await b.eval("document.querySelector('[aria-current=page]')?.textContent")).startsWith("Overview"));
  await t("[...document.querySelectorAll('[role=group] button')].find(b => b.textContent === 'हिं').click(), true");
  await sleep(300);
  let page = await text();
  check("toggle switches the app to Hindi", page.includes("सारांश") && page.includes("+ नया इनवॉइस") && page.includes("लेना बाकी") && page.includes("आज किससे माँगें"), page.slice(0, 300));
  check("due text and aging buckets in Hindi", page.includes("6 दिन देर") && page.includes("1–15 दिन देर"));
  check("html lang follows", (await b.eval("document.documentElement.lang")) === "hi");
  await b.go(BASE + "/app/", 2500);
  check("choice remembered across reloads", (await text()).includes("सारांश"));

  // Reminders default to Hindi when the app is in Hindi (no saved reminder language).
  await t("__t.click(/^याद दिलाएँ$/)");
  await b.waitFor("!!document.getElementById('ws-reminder')");
  check("reminder sheet title in Hindi", /Riya को याद दिलाएँ/.test(await b.eval("document.querySelector('[role=dialog]').innerText")));
  check("reminder message defaults to Hindi", /^नमस्ते Riya/.test(await b.eval("document.getElementById('ws-reminder').value")));
  await b.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });

  // Invoices and settings screens.
  await t("__t.click(/^इनवॉइस/)");
  await sleep(200);
  page = await text();
  check("invoice filters and actions in Hindi", page.includes("बाकी") && page.includes("बैंक स्टेटमेंट इम्पोर्ट करें") && page.includes("CSV एक्सपोर्ट करें"));
  await t("__t.click(/^सेटिंग्स$/)");
  await sleep(300);
  page = await text();
  check("settings in Hindi", page.includes("व्यवसाय की जानकारी") && page.includes("बैकअप डाउनलोड करें") && page.includes("सभी डिवाइस पर सिंक"));

  // Back to English.
  await t("[...document.querySelectorAll('[role=group] button')].find(b => b.textContent === 'EN').click(), true");
  await sleep(300);
  check("switch back to English", (await text()).includes("Business details") && (await b.eval("document.documentElement.lang")) === "en");

  // ?lang=hi wins (links from Hindi pages).
  await b.go(BASE + "/app/?lang=hi", 2500);
  check("?lang=hi opens the Hindi app", (await text()).includes("सारांश"));
  // Clients abroad in Hindi (docs/spec-foreign-clients.md §5.10): labels translated, currency codes and symbols stay Latin.
  const abroad = { ...ws, clients: { ...ws.clients, cli_globex01: { id: "cli_globex01", name: "Globex LLC", phone: "+1 415 555 0100", email: "", gstin: "", createdAt: T, updatedAt: T } } };
  const intl = { settings: { on: true, accountName: "Sharma Tuition LLP", bankName: "HDFC Bank", swift: "HDFCINBB", account: "50100123456789", bankDetails: "", payUrl: "", exportUnderLut: false, lutArn: "", lutFy: "", updatedAt: T },
    invoices: { inv_usd00001: { ...ws.invoices.inv_00000001, id: "inv_usd00001", number: "TU-0002", clientId: "cli_globex01", amountPaise: 120000, currency: "USD" } },
    // Paused, so no month is generated: it only puts a USD plan under Monthly billing.
    recurring: { rec_usd00001: { id: "rec_usd00001", clientId: "cli_globex01", amountPaise: 50000, description: "", dayOfMonth: 5, dueAfterDays: 15, startMonth: iso(0).slice(0, 7), endMonth: "", paused: true, currency: "USD", createdAt: T, updatedAt: T } },
    // Globex is billed in US$: the client sheet's "liveCurrency !== INR" arm must stay behind the flag too.
    clients: { cli_globex01: { currency: "USD", updatedAt: T } } };
  /**
   * The creation entry points of §5.1 in the current page: the invoice sheet's picker and the client sheet's. `plan` is
   * a plan "Change currency" button, which no build has (a currency is fixed at creation, owner decision 2026-10-25).
   */
  const entryPoints = async (base) => {
    await b.go(base + "/app/", 2500);
    await t("[...document.querySelectorAll('button')].find(b => b.textContent === '+ नया इनवॉइस').click(), true");
    await b.waitFor("!!document.querySelector('[role=dialog]')");
    await sleep(150);
    const invoice = await b.eval("!!document.getElementById('ws-currency')");
    await b.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await b.waitFor("!document.querySelector('[role=dialog]')");
    await t("__t.click(/^ग्राहक/)");
    await sleep(250);
    const plan = await b.eval("[...document.querySelectorAll('button')].some(b => b.textContent === 'मुद्रा बदलें')");
    const planShown = await b.eval("document.body.innerText.includes('मासिक बिलिंग') && document.body.innerText.includes('US$500.00')");
    const planNote = await b.eval("document.querySelector('[data-monthly-note]')?.textContent ?? null");
    await t("[...document.querySelectorAll('li')].find(li => li.innerText.includes('Globex LLC') && !li.innerText.includes('US$500.00') && [...li.querySelectorAll('button')].some(x => x.textContent === 'बदलें')).querySelectorAll('button').forEach(x => { if (x.textContent === 'बदलें') x.click(); }), true");
    await b.waitFor("!!document.querySelector('[role=dialog]')");
    await sleep(150);
    const client = await b.eval("!!document.getElementById('ws-client-currency')");
    const clientSheet = await b.eval("document.querySelector('[role=dialog]').innerText.includes('Globex LLC') || document.getElementById('ws-c-name')?.value === 'Globex LLC'");
    await b.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await b.waitFor("!document.querySelector('[role=dialog]')");
    return { invoice, client, plan, planShown, clientSheet, planNote };
  };
  const seedAbroad = async (base) => {
    await b.go(base + "/terms/", 300);
    await b.eval(`localStorage.clear(); localStorage.setItem('proupiqr-workspace-v1', ${JSON.stringify(JSON.stringify(abroad))});
      localStorage.setItem('proupiqr-intl-v1:biz_primary', ${JSON.stringify(JSON.stringify({ owner: null, intl }))}); localStorage.setItem('proupiqr-workspace-lang', 'hi'); true`);
  };
  // Foreign data shown in Hindi: amounts in their own currency.
  await seedAbroad(BASE);
  await b.go(BASE + "/app/", 2500);
  page = await text();
  check("Hindi overview: the foreign row in US$ (Western grouping)", /US\$1,200\.00 वसूलना है/.test(page) && page.includes("लेना बाकी"), page.slice(0, 600));
  // INTL_UI is on (PR 5) and the book has settings.on: both creation entry points show, no plan currency change, and
  // Monthly billing says how to bill in another currency.
  {
    const on = await entryPoints(BASE);
    check("flag on: both entry points show (the probe above can find them), and no plan currency change", on.planShown && on.clientSheet && on.invoice && on.client && !on.plan, JSON.stringify(on));
    check("Hindi Monthly billing: how to bill in another currency", on.planNote === "दूसरी मुद्रा में बिल करने के लिए मासिक बिलिंग रोकें और उस मुद्रा में नई शुरू करें।", JSON.stringify(on.planNote));
    await b.go(BASE + "/app/?tab=settings", 2500);
    await t("(() => { const d = [...document.querySelectorAll('details')].find(x => x.querySelector('summary')?.textContent.includes('विदेशी ग्राहक')); if (!d.open) d.querySelector('summary').click(); return true; })()");
    await sleep(200);
    page = await text();
    check("Hindi Settings card: title, labels and button", page.includes("विदेशी ग्राहक") && page.includes("खाताधारक का नाम") && page.includes("IBAN या खाता नंबर") && page.includes("भुगतान की जानकारी सेव करें"));
    check("Hindi Settings card: SWIFT / BIC and LUT ARN stay Latin", page.includes("SWIFT / BIC") && page.includes("LUT ARN"));
    await t("[...document.querySelectorAll('button')].find(b => b.textContent === '+ नया इनवॉइस').click(), true");
    await b.waitFor("!!document.getElementById('ws-currency')");
    const sheet = await b.eval("document.querySelector('[role=dialog]').innerText");
    check("Hindi invoice sheet: currency label translated, codes Latin", sheet.includes("मुद्रा") && (await b.eval("[...document.getElementById('ws-currency').options].map(o => o.textContent).join('|')")) === "INR (₹)|USD (US$)|EUR (€)|GBP (£)|AED|AUD (A$)|CAD (CA$)|SGD");
    await t("document.getElementById('ws-currency').value = 'USD', document.getElementById('ws-currency').dispatchEvent(new Event('change', { bubbles: true })), true");
    await sleep(100);
    check("Hindi invoice sheet: राशि (USD)", (await b.eval("document.querySelector('[role=dialog]').innerText")).includes("राशि (USD)"));
    await b.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await b.waitFor("!document.querySelector('[role=dialog]')");
    // An existing invoice: its currency as text, with the note in Hindi, and no select.
    await b.go(BASE + "/app/?tab=invoices", 2500);
    await t("(() => { const r = [...document.querySelectorAll('li [aria-expanded]')].find(x => x.textContent.includes('TU-0002')); if (r.getAttribute('aria-expanded') !== 'true') r.click(); return true; })()");
    await sleep(150);
    await t("[...document.querySelectorAll('li button')].find(x => x.textContent === 'बदलें' && x.closest('li').textContent.includes('TU-0002')).click(), true");
    await b.waitFor("!!document.querySelector('[role=dialog]')");
    await sleep(150);
    const fixed = await b.eval("({ select: !!document.getElementById('ws-currency'), text: document.getElementById('ws-currency-fixed')?.textContent, note: document.getElementById('ws-currency-note')?.textContent.trim() })");
    check("Hindi edit sheet: the currency as text with the Hindi note, no select", !fixed.select && fixed.text === "USD (US$)"
      && fixed.note === "मुद्रा बदली नहीं जा सकती। दूसरी मुद्रा में बिल करने के लिए यह इनवॉइस डिलीट करें और नया बनाएँ।", JSON.stringify(fixed));
    await b.shot("hi-invoice-fixed-currency.png");
    await b.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  }
  check("no console errors (excluding blocked Clerk)", b.errors.filter((e) => !/clerk|ERR_BLOCKED|Failed to load/i.test(e)).length === 0, b.errors.join(" | "));
} catch (error) {
  check("test script ran to completion", false, String(error).slice(0, 500));
} finally {
  b.close();
}
process.exit(check.report());
