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
  check("no console errors (excluding blocked Clerk)", b.errors.filter((e) => !/clerk|ERR_BLOCKED|Failed to load/i.test(e)).length === 0, b.errors.join(" | "));
} catch (error) {
  check("test script ran to completion", false, String(error).slice(0, 500));
} finally {
  b.close();
}
process.exit(check.report());
