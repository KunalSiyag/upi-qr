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
    invoices: { inv_usd00001: { ...ws.invoices.inv_00000001, id: "inv_usd00001", number: "TU-0002", clientId: "cli_globex01", amountPaise: 120000, currency: "USD" } }, recurring: {}, clients: {} };
  const seedAbroad = async (base) => {
    await b.go(base + "/terms/", 300);
    await b.eval(`localStorage.clear(); localStorage.setItem('proupiqr-workspace-v1', ${JSON.stringify(JSON.stringify(abroad))});
      localStorage.setItem('proupiqr-intl-v1:biz_primary', ${JSON.stringify(JSON.stringify({ owner: null, intl }))}); localStorage.setItem('proupiqr-workspace-lang', 'hi'); true`);
  };
  // Foreign data shown in this (flag-off) build: amounts in their own currency, in the Hindi UI too.
  await seedAbroad(BASE);
  await b.go(BASE + "/app/", 2500);
  page = await text();
  check("Hindi overview: the foreign row in US$ (Western grouping)", /US\$1,200\.00 वसूलना है/.test(page) && page.includes("लेना बाकी"), page.slice(0, 600));
  const INTL = process.env.INTL_BASE;
  check("the flag-on build is available (INTL_BASE)", Boolean(INTL));
  if (INTL) {
    await seedAbroad(INTL);
    await b.go(INTL + "/app/?tab=settings", 2500);
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
  }
  check("no console errors (excluding blocked Clerk)", b.errors.filter((e) => !/clerk|ERR_BLOCKED|Failed to load/i.test(e)).length === 0, b.errors.join(" | "));
} catch (error) {
  check("test script ran to completion", false, String(error).slice(0, 500));
} finally {
  b.close();
}
process.exit(check.report());
