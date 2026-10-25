// Clients abroad in /app/ (docs/spec-foreign-clients.md §5, §9.3), against the runner's flag-on build (INTL_UI on,
// served at INTL_BASE). Static: no server, sync stays signed out.
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checker, helpers, OUT, sleep, startBrowser } from "./cdp-lib.mjs";

const BASE = process.env.INTL_BASE || process.env.BASE || "http://localhost:4401";
const b = await startBrowser();
const check = checker();
const t = async (js) => { await b.eval(helpers); return b.eval(js); };
const text = () => b.eval("document.body.innerText");
const dialogText = () => b.eval("document.querySelector('[role=dialog]')?.innerText || ''");
const value = (id) => b.eval(`document.getElementById('${id}')?.value ?? null`);
const exists = (id) => b.eval(`!!document.getElementById('${id}')`);
const iso = (offset) => b.eval(`(() => { const d = new Date(); d.setDate(d.getDate() + (${offset})); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })()`);
const esc = () => b.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
const closed = () => b.waitFor("!document.querySelector('[role=dialog]')");
const opened = () => b.waitFor("!!document.querySelector('[role=dialog]')");
const book = () => b.eval("localStorage.getItem('proupiqr-workspace-v1') || ''");
const sidecar = () => b.eval("localStorage.getItem('proupiqr-intl-v1:biz_primary') || ''");
const kpis = () => b.eval("document.querySelector('[aria-label=Summary]')?.innerText || ''");
const noScroll = () => b.eval("document.documentElement.scrollWidth <= window.innerWidth + 1");
/** Opens the invoice row whose text includes `needle` (rows are `li [aria-expanded]`), closing the others so row actions are its own. */
const openRow = (needle) => t(`(() => { const rows = [...document.querySelectorAll('li [aria-expanded]')]; const r = rows.find(b => b.textContent.includes(${JSON.stringify(needle)})); if (!r) throw new Error('no row ${needle}');
  for (const o of rows) if (o !== r && o.getAttribute('aria-expanded') === 'true') o.click();
  if (r.getAttribute('aria-expanded') !== 'true') r.click(); return true; })()`);
/** Captures what downloadText() hands to URL.createObjectURL while `js` runs. */
const download = (js) => t(`(async () => { const blobs = []; const orig = URL.createObjectURL; URL.createObjectURL = (x) => { blobs.push(x); return orig(x); };
  try { ${js}; } finally { URL.createObjectURL = orig; } return blobs[0] ? blobs[0].text() : ''; })()`);
const tab = async (name) => { await t(`__t.click(/^${name}/)`); await sleep(250); };
/** Writes `key` from another same-origin document, so this tab gets a storage event (as from another tab). */
const otherTabWrite = (key, js) => b.eval(`new Promise((resolve) => { const f = document.createElement('iframe'); f.src = '/terms/'; f.style.display = 'none'; f.onload = () => {
  const v = (${js})(localStorage.getItem(${JSON.stringify(key)})); f.contentWindow.localStorage.setItem(${JSON.stringify(key)}, v); f.remove(); resolve(true); }; document.body.appendChild(f); })`);
/** The Clients list row (li) whose text includes `name`. */
const clientRow = (name) => b.eval(`[...document.querySelectorAll('li')].find(li => li.querySelector('button')?.textContent.includes(${JSON.stringify(name)}) && !li.querySelector('[aria-expanded]'))?.innerText || ''`);
/** The balance cell (right column) of a Clients list row. */
const clientBalance = (name) => b.eval(`[...document.querySelectorAll('li')].find(li => li.querySelector('button')?.textContent.includes(${JSON.stringify(name)}) && !li.querySelector('[aria-expanded]'))?.querySelector('[data-client-balances], .text-right')?.innerText.trim() ?? null`);
const setIntlOn = async (on) => {
  await tab("Settings");
  await openSettingsCard();
  await sleep(150);
  if ((await b.eval("document.getElementById('ws-intl-on').checked")) !== on) await t("document.getElementById('ws-intl-on').click(), true");
  await t(`__t.click(/^Save payment details$/)`);
  await sleep(300);
};
/** Runs `body` in Node with the workspace model as `M` (ids and records derived exactly as the app derives them); it prints JSON. */
const MODEL = fileURLToPath(new URL("../../src/lib/workspace/model.ts", import.meta.url));
const model = (body) => {
  const r = spawnSync("node", ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", `import * as M from ${JSON.stringify(MODEL)}; ${body}`], { encoding: "utf8" });
  if (r.status) throw new Error(r.stderr.slice(0, 400));
  return JSON.parse(r.stdout);
};
const focused = () => b.eval("document.activeElement?.id || document.activeElement?.tagName || ''");
const openSettingsCard = () => t("(() => { const d = [...document.querySelectorAll('details')].find(x => x.querySelector('summary')?.textContent.includes('Clients abroad')); if (!d.open) d.querySelector('summary').click(); return true; })()");

try {
  await b.go(BASE + "/app/", 500);
  await b.eval("localStorage.clear(); true");
  await b.go(BASE + "/app/", 2500);
  await b.waitFor("!!document.getElementById('ws-setup-name')");
  await t(`__t.set('ws-setup-name', 'Sharma Tuition'), __t.set('ws-setup-upi', 'sharma@okaxis'), __t.click(/^Save$/)`);
  await b.waitFor("!document.getElementById('ws-setup-name')");

  // An INR invoice first: the ₹ strip must read the same before and after foreign invoices exist.
  await t(`__t.click(/^\\+ New invoice$/)`); await opened();
  check("no currency picker before clients abroad is turned on", !(await exists("ws-currency")) && /Amount \(₹\)/.test(await dialogText()));
  await t(`__t.set('ws-client', 'Rohan Mehta'), __t.set('ws-amount', '10000'), __t.click(/^7 days$/, __t.dialog()), __t.click(/^Add invoice$/, __t.dialog())`);
  await closed();
  const inrStrip = await kpis();
  check("INR strip before foreign invoices", /To collect\s*₹10,000/.test(inrStrip), inrStrip);
  check("no Clients abroad row for an INR-only book", !(await b.eval("!!document.querySelector('[aria-label=\"Clients abroad\"]')")));

  // Settings card: collapsed, validation, save.
  await tab("Settings");
  check("Clients abroad card shown, closed by default", await b.eval("(() => { const d = [...document.querySelectorAll('details')].find(x => x.querySelector('summary')?.textContent.includes('Clients abroad')); return !!d && !d.open && !d.closest('li'); })()"));
  await openSettingsCard();
  await sleep(150);
  check("LUT disabled without a GSTIN", await b.eval("document.getElementById('ws-intl-lut').disabled") && /Add your GSTIN above to use an LUT/.test(await text()));
  await t(`__t.set('ws-intl-account-name', 'Sharma Tuition LLP'), __t.set('ws-intl-swift', 'ABC'), __t.set('ws-intl-account', 'GB82WEST12345698765433'), __t.set('ws-intl-pay-url', 'http://evil.example/pay'), __t.click(/^Save payment details$/)`);
  await sleep(200);
  let page = await text();
  check("invalid SWIFT rejected", /Enter a valid SWIFT\/BIC code \(8 or 11 letters and digits\)\./.test(page));
  check("bad IBAN check digits rejected", /This IBAN doesn't look right/.test(page));
  check("non-https or unknown pay link rejected", /Enter an https link from PayPal, Wise or Stripe\./.test(page));
  check("a save with errors focuses the first invalid field", (await focused()) === "ws-intl-swift", await focused());
  check("nothing saved while invalid", !(await sidecar()));
  await t(`__t.set('ws-intl-bank', 'HDFC Bank'), __t.set('ws-intl-swift', 'hdfc in bb'), __t.set('ws-intl-account', 'GB82 WEST 1234 5698 7654 32'), __t.set('ws-intl-bank-details', 'Branch: Fort, Mumbai'), __t.set('ws-intl-pay-url', 'https://paypal.me/sharma')`);
  await t(`document.getElementById('ws-intl-on').click(), true`);
  await t(`__t.click(/^Save payment details$/)`);
  await b.waitFor("/Payment details saved\\./.test(document.body.innerText)", 4000);
  check("valid details saved", /Payment details saved\./.test(await text()) && (await sidecar()).includes("HDFCINBB") && (await sidecar()).includes('"on":true'));

  // LUT needs a GSTIN, an ARN and its financial year; the preview is the statutory line.
  await t(`__t.set('ws-s-gstin', '27AAAPL1234C1Z5'), __t.set('ws-s-udyam', 'UDYAM-MH-12-1234567'), __t.click(/^Save settings$/)`);
  await sleep(300);
  check("LUT enabled once the business has a GSTIN", !(await b.eval("document.getElementById('ws-intl-lut').disabled")));
  await t(`document.getElementById('ws-intl-lut').click(), __t.set('ws-intl-lut-arn', 'AD27'), __t.click(/^Save payment details$/)`);
  await sleep(200);
  page = await text();
  check("a short ARN is refused", /Enter the 15-character ARN\./.test(page));
  check("…and focuses it", (await focused()) === "ws-intl-lut-arn", await focused());
  check("the summary line points at the messages (nothing is highlighted)", /Some details need fixing\. See the messages above\./.test(page) && !/highlighted/.test(page));
  await t(`__t.set('ws-intl-lut-arn', 'ad2704260012345'), __t.click(/^Save payment details$/)`);
  await sleep(200);
  check("an ARN without its financial year is refused", /Choose the financial year of your LUT\./.test(await text()));
  const fy = await b.eval("document.getElementById('ws-intl-lut-fy').options[1].value");
  await t(`__t.set('ws-intl-lut-fy', '${fy}')`);
  const preview = await b.eval("document.querySelector('[data-lut-preview]')?.textContent");
  check("export line preview is the Rule 46 endorsement with the ARN", preview === "SUPPLY MEANT FOR EXPORT/SUPPLY TO SEZ UNIT OR SEZ DEVELOPER FOR AUTHORISED OPERATIONS UNDER BOND OR LETTER OF UNDERTAKING WITHOUT PAYMENT OF INTEGRATED TAX (LUT ARN AD2704260012345)", preview);
  // A USD override (a Wise-style multi-currency account).
  await t("(() => { const d = [...document.querySelectorAll('details details')][0]; if (!d.open) d.querySelector('summary').click(); return true; })()");
  await sleep(150);
  await t(`__t.set('ws-intl-override-currency', 'USD')`);
  await t(`__t.set('ws-intl-account-name-usd', 'Sharma Tuition LLP (Wise)'), __t.set('ws-intl-account-usd', 'GB82WEST12345698765433'), __t.set('ws-intl-bank-details-usd', 'ACH routing 026073150')`);
  // An error in the per-currency set while it is collapsed: Save opens it so the message can be seen.
  await t("(() => { document.querySelector('details details').open = false; return true; })()");
  await t(`__t.click(/^Save payment details$/)`);
  await sleep(200);
  check("an error in a collapsed per-currency set opens it", await b.eval(`(() => { const d = document.querySelector('details details');
    const e = [...d.querySelectorAll('*')].find((x) => !x.children.length && /This IBAN doesn't look right/.test(x.textContent)); return d.open && !!e && e.checkVisibility(); })()`));
  check("nothing saved with a bad per-currency IBAN", !(await sidecar()).includes("Wise"));
  check("…and focus goes to that field inside the opened set", (await focused()) === "ws-intl-account-usd", await focused());
  await t(`__t.set('ws-intl-account-usd', '8310123456')`);
  await t(`__t.click(/^Save payment details$/)`);
  await sleep(300);
  const side = JSON.parse(await sidecar());
  check("LUT and USD override saved", side.intl.settings.lutArn === "AD2704260012345" && side.intl.settings.lutFy === fy && side.intl.settings.byCurrency?.USD?.account === "8310123456" && !side.intl.settings.byCurrency.EUR, JSON.stringify(side.intl.settings));
  await b.shot("cur-01-settings.png");

  // A save never overwrites what another tab or device saved meanwhile (§5.2): only the fields edited here are applied.
  await t(`__t.set('ws-intl-bank', 'ICICI Bank')`);
  const addCad = `(raw) => { const v = JSON.parse(raw); const s = v.intl.settings; s.byCurrency.CAD = { accountName: 'Wise CAD', bankName: '', swift: 'TRWICAW1XXX', account: '200110754005', bankDetails: '', payUrl: '' }; s.updatedAt = Date.now(); return JSON.stringify(v); }`;
  await otherTabWrite("proupiqr-intl-v1:biz_primary", addCad);
  await sleep(500);
  await t(`__t.click(/^Save payment details$/)`);
  await sleep(300);
  let st = JSON.parse(await sidecar()).intl.settings;
  check("an edited form's save keeps a currency set another tab added", st.bankName === "ICICI Bank" && st.byCurrency?.CAD?.accountName === "Wise CAD" && st.byCurrency?.USD?.account === "8310123456" && st.lutArn === "AD2704260012345", JSON.stringify(st));
  // An untouched form shows newer settings when they arrive.
  await otherTabWrite("proupiqr-intl-v1:biz_primary", `(raw) => { const v = JSON.parse(raw); v.intl.settings.payUrl = 'https://wise.com/pay/me/sharma'; v.intl.settings.updatedAt = Date.now(); return JSON.stringify(v); }`);
  await sleep(500);
  check("an untouched form refreshes to settings saved elsewhere", (await value("ws-intl-pay-url")) === "https://wise.com/pay/me/sharma");
  await t(`__t.click(/^Save payment details$/)`);
  await sleep(300);
  st = JSON.parse(await sidecar()).intl.settings;
  check("an unedited save changes nothing", st.payUrl === "https://wise.com/pay/me/sharma" && st.byCurrency?.CAD?.accountName === "Wise CAD");
  check("the details card's save is not a second filled action", await b.eval("!__t.btn(/^Save payment details$/).className.includes('bg-graphite')"));

  // §5.1: with "Invoice clients in other currencies" off and no foreign invoice in the book, no sheet shows a picker.
  await setIntlOn(false);
  check("the switch is saved off", JSON.parse(await sidecar()).intl.settings.on === false);
  await t(`__t.click(/^\\+ New invoice$/)`); await opened();
  check("switch off, no foreign invoice: no currency picker", !(await exists("ws-currency")) && /Amount \(₹\)/.test(await dialogText()));
  await esc(); await closed();
  await tab("Clients");
  await t(`__t.click(/^\\+ Add client$/)`); await opened();
  check("switch off: no billing currency on the client sheet", !(await exists("ws-client-currency")));
  await esc(); await closed();
  await setIntlOn(true);

  // A client billed in USD: the phone hint, and their number kept as typed.
  await tab("Clients");
  await t(`__t.click(/^\\+ Add client$/)`); await opened();
  check("client sheet shows billing currency and the + hint", await exists("ws-client-currency") && /start the number with \+ and the country code/.test(await dialogText()));
  await t(`__t.set('ws-c-name', 'Globex LLC'), __t.set('ws-c-phone', '+1 415 555 0100'), __t.set('ws-client-currency', 'USD'), __t.click(/^Save$/, __t.dialog())`);
  await closed();
  // A short number abroad (8 digits with +) is accepted only for a client billed in a foreign currency (§5.4).
  await t(`__t.click(/^\\+ Add client$/)`); await opened();
  await t(`__t.set('ws-c-name', 'Kensington Ltd'), __t.set('ws-c-phone', '+44 20 7946'), __t.click(/^Save$/, __t.dialog())`);
  await sleep(150);
  check("an 8-digit + number is refused for an INR client", /Enter a 10-digit mobile number/.test(await dialogText()));
  await t(`__t.set('ws-client-currency', 'GBP'), __t.click(/^Save$/, __t.dialog())`);
  await closed();
  check("…and accepted for a GBP client", /Kensington Ltd/.test(await text()));
  check("client currency stored in the sidecar only", JSON.parse(await sidecar()).intl.clients && Object.values(JSON.parse(await sidecar()).intl.clients).some((c) => c.currency === "USD") && !(await book()).includes("USD"));

  // A client sheet left open while another tab changes the billing currency: a phone edit never writes over it.
  const globexId = Object.entries(JSON.parse(await sidecar()).intl.clients).find(([, c]) => c.currency === "USD")[0];
  await t(`document.querySelector('button[aria-label="Edit Globex LLC"]').click(), true`); await opened();
  await otherTabWrite("proupiqr-intl-v1:biz_primary", `(raw) => { const v = JSON.parse(raw); v.intl.clients['${globexId}'] = { currency: 'EUR', updatedAt: Date.now() }; return JSON.stringify(v); }`);
  await sleep(500);
  check("an open client sheet shows the currency set elsewhere", (await value("ws-client-currency")) === "EUR");
  await t(`__t.set('ws-c-phone', '+1 415 555 0199'), __t.click(/^Save$/, __t.dialog())`);
  await closed();
  let entry = JSON.parse(await sidecar()).intl.clients[globexId];
  check("saving a phone edit keeps the currency set elsewhere", entry.currency === "EUR" && !entry.deletedAt, JSON.stringify(entry));
  // Picking a currency is a write (back to USD, and the number back for the reminder checks below).
  await t(`document.querySelector('button[aria-label="Edit Globex LLC"]').click(), true`); await opened();
  await t(`__t.set('ws-client-currency', 'USD'), __t.set('ws-c-phone', '+1 415 555 0100'), __t.click(/^Save$/, __t.dialog())`);
  await closed();
  entry = JSON.parse(await sidecar()).intl.clients[globexId];
  check("a currency picked in the sheet is saved", entry.currency === "USD" && !entry.deletedAt, JSON.stringify(entry));

  // An INR invoice for the GBP client keeps their short + number (the client's billing currency counts, §5.4).
  await t(`__t.click(/^\\+ New invoice$/)`); await opened();
  await t(`__t.set('ws-client', 'Kensington Ltd')`);
  await sleep(100);
  check("the GBP client's number is prefilled", (await value("ws-phone")) === "+44 20 7946" && (await value("ws-currency")) === "GBP");
  await t(`__t.set('ws-currency', 'INR'), __t.click(/^Add invoice$/, __t.dialog())`);
  await sleep(100);
  check("an INR invoice for a client billed abroad accepts their + number", !/Enter a 10-digit mobile number/.test(await dialogText()) && /Enter an amount like 1500/.test(await dialogText()), await dialogText());
  await esc(); await closed();

  // A USD invoice: the picker follows the client; foreign amounts never take a decimal comma.
  await t(`__t.click(/^\\+ New invoice$/)`); await opened();
  await t(`__t.set('ws-client', 'Globex LLC')`);
  await sleep(100);
  check("new invoice pre-selects the client's currency", (await value("ws-currency")) === "USD" && /Amount \(USD\)/.test(await dialogText()));
  await t(`__t.set('ws-client', 'Globex LLC Europe')`);
  await sleep(100);
  check("typing past a client's name to a new client goes back to INR", (await value("ws-currency")) === "INR" && /Amount \(₹\)/.test(await dialogText()));
  await t(`__t.set('ws-client', 'Globex LLC')`);
  await sleep(100);
  check("…and back to the client's currency when it matches again", (await value("ws-currency")) === "USD");
  // Review round 5: an amount already typed is never re-denominated by the client name changing under it.
  await t(`__t.set('ws-amount', '1200'), __t.set('ws-client', 'Globex LLC Inc')`);
  await sleep(100);
  check("with an amount typed, finishing the name keeps its currency (US$, not ₹)", (await value("ws-currency")) === "USD" && /Amount \(USD\)/.test(await dialogText()));
  await t(`__t.set('ws-amount', ''), __t.set('ws-client', 'Glob'), __t.set('ws-amount', '50000'), __t.set('ws-client', 'Globex LLC')`);
  await sleep(100);
  check("…and a ₹ amount stays ₹ when the name then matches a US$ client", (await value("ws-currency")) === "INR" && /Amount \(₹\)/.test(await dialogText()));
  await t(`__t.set('ws-amount', ''), __t.set('ws-client', 'Globex'), __t.set('ws-client', 'Globex LLC')`);
  await sleep(100);
  check("an empty amount follows the client again", (await value("ws-currency")) === "USD");
  check("export choice shown and on by default", await b.eval("document.getElementById('ws-export-lut')?.checked === true"));
  await t(`__t.set('ws-amount', '12,50'), __t.click(/^Add invoice$/, __t.dialog())`);
  check("a decimal comma is refused for USD", /Enter the amount like 1,200\.50\./.test(await dialogText()));
  await t(`__t.set('ws-amount', '1,200.50'), __t.click(/^Add invoice$/, __t.dialog())`);
  await closed();
  await tab("Overview");
  check("₹ strip unchanged by a USD invoice", (await kpis()) === inrStrip, await kpis());
  page = await text();
  check("Clients abroad row shows the USD total", /US\$1,200\.50 to collect/.test(page) && await b.eval("!!document.querySelector('[aria-label=\"Clients abroad\"]')"));
  check("aging card says foreign invoices aren't in it", /Foreign-currency invoices aren't included\./.test(page));
  await tab("Invoices");
  check("row shows US$1,200.50", /Globex LLC[\s\S]*US\$1,200\.50/.test(await text()));
  // §5.1: a book that holds a foreign invoice keeps the pickers with the switch off.
  await setIntlOn(false);
  await t(`__t.click(/^\\+ New invoice$/)`); await opened();
  check("switch off, foreign invoice in the book: the picker shows", await exists("ws-currency"));
  await esc(); await closed();
  await setIntlOn(true);
  await tab("Invoices");
  await b.shot("cur-02-invoices.png");

  // Payment with INR credited.
  await openRow("Globex");
  await t(`__t.click(/^Record payment$/)`); await opened();
  check("payment sheet in USD, bank by default, no UPI mode", /Amount received \(USD\)/.test(await dialogText()) && (await value("ws-pay-mode")) === "bank"
    && !(await b.eval("[...document.getElementById('ws-pay-mode').options].some(o => o.value === 'upi')")) && /Transfer reference/.test(await dialogText()) && await exists("ws-pay-inr"));
  check("over-balance guard in USD", await (async () => { await t(`__t.set('ws-pay-amount', '1300'), __t.click(/^Save payment$/, __t.dialog())`); return /more than the US\$1,200\.50 still due/.test(await dialogText()); })());
  await t(`__t.set('ws-pay-amount', '1,200.50'), __t.set('ws-pay-ref', 'WISE-8811'), __t.set('ws-pay-inr', '99,840'), __t.click(/^Save payment$/, __t.dialog())`);
  await closed();
  await t(`__t.click(/^all$/)`);
  await openRow("Globex");
  check("payment line shows ₹ credited", /US\$1,200\.50 · BANK[\s\S]*WISE-8811 · ₹99,840 credited/.test(await text()), (await text()).slice(0, 1500));
  await tab("Overview");
  check("INR earned this month", /INR earned this month: ₹99,840/.test(await text()));

  // Reminder of an overdue USD invoice: bank block (USD override), export line, no UPI; the number as typed.
  await t(`__t.click(/^\\+ New invoice$/)`); await opened();
  await t(`__t.set('ws-client', 'Globex LLC'), __t.set('ws-amount', '500'), __t.set('ws-issue', '${await iso(-40)}'), __t.set('ws-due', '${await iso(-10)}'), __t.click(/^Add invoice$/, __t.dialog())`);
  await closed();
  await tab("Invoices");
  await t(`__t.click(/^unpaid$/)`);
  // A saved Hindi reminder preference and a Udyam number: neither applies to a foreign invoice.
  await b.eval("localStorage.setItem('proupiqr-reminder-lang', 'hi'), true");
  await openRow("Globex");
  await t(`__t.click(/^Remind$/)`); await b.waitFor("!!document.getElementById('ws-reminder')");
  let msg = await value("ws-reminder");
  check("foreign reminder: amount, USD bank block, export line", /US\$500\.00/.test(msg) && /Pay by bank transfer:/.test(msg) && /Sharma Tuition LLP \(Wise\)/.test(msg) && /ACH routing 026073150/.test(msg)
    && msg.includes("WITHOUT PAYMENT OF INTEGRATED TAX (LUT ARN AD2704260012345)"), msg);
  check("foreign reminder never mentions UPI or UTR", !/UPI|UTR|upi:\/\//.test(msg), msg);
  check("reminder sheet: no MSME box, English default", !/MSME/.test(await dialogText()) && await b.eval("[...document.querySelectorAll('[aria-pressed=true]')].some(x => x.textContent === 'English')"));
  await b.shot("cur-03-reminder.png");
  await t(`__t.click(/^WhatsApp$/, __t.dialog())`);
  const wa = await b.eval("window.__opened.at(-1)");
  check("WhatsApp goes to the number as typed", wa?.startsWith("https://wa.me/14155550100?text="), wa);
  await t(`__t.click(/^SMS$/, __t.dialog())`);
  const sms = await b.eval("window.__opened.at(-1)");
  check("SMS goes to the number as typed, not +91", sms?.startsWith("sms:+14155550100?body="), sms);
  await t(`__t.click(/^हिन्दी$/, __t.dialog())`);
  msg = await value("ws-reminder");
  check("Hindi reminder: bank block in Hindi, export line in English", /बैंक ट्रांसफ़र से भुगतान करें:/.test(msg) && msg.includes("SUPPLY MEANT FOR EXPORT") && /ट्रांसफ़र रेफ़रेंस/.test(msg), msg);
  await t(`__t.click(/^English$/, __t.dialog())`);
  await esc(); await closed();
  // The INR invoice's reminder does show the MSME line: the setup enables it, the foreign guard hides it.
  await openRow("Rohan Mehta");
  await t(`__t.click(/^Remind$/)`); await b.waitFor("!!document.getElementById('ws-reminder')");
  check("an INR reminder shows the MSME line (Udyam set)", /MSME/.test(await dialogText()));
  await esc(); await closed();

  // EUR for a client without a billing currency: the default set; export unticked → no line.
  await t(`__t.click(/^\\+ New invoice$/)`); await opened();
  await t(`__t.set('ws-client', 'Acme GmbH'), __t.set('ws-currency', 'EUR'), __t.set('ws-amount', '750'), __t.set('ws-issue', '${await iso(-20)}'), __t.set('ws-due', '${await iso(-5)}')`);
  await t(`document.getElementById('ws-export-lut').click(), __t.click(/^Add invoice$/, __t.dialog())`);
  await closed();
  await openRow("Acme GmbH");
  await t(`__t.click(/^Remind$/)`); await b.waitFor("!!document.getElementById('ws-reminder')");
  msg = await value("ws-reminder");
  check("EUR reminder uses the default set, without the export line", /€750\.00/.test(msg) && /Account name: Sharma Tuition LLP\n/.test(msg) && !/Wise\)/.test(msg) && !/SUPPLY MEANT/.test(msg), msg);
  await esc(); await closed();
  // Without receiving details for EUR (and no pay link), the reminder sheet says what to add (§5.8).
  const keptSettings = JSON.parse(await sidecar()).intl.settings;
  await otherTabWrite("proupiqr-intl-v1:biz_primary", `(raw) => { const v = JSON.parse(raw); Object.assign(v.intl.settings, { accountName: '', bankName: '', swift: '', account: '', bankDetails: '', payUrl: '', updatedAt: Date.now() }); return JSON.stringify(v); }`);
  await sleep(500);
  await openRow("Acme GmbH");
  await t(`__t.click(/^Remind$/)`); await b.waitFor("!!document.getElementById('ws-reminder')");
  check("no EUR details: the reminder sheet asks for them", /Add international payment details in Settings so the client knows how to pay\./.test(await dialogText()), await dialogText());
  await esc(); await closed();
  await otherTabWrite("proupiqr-intl-v1:biz_primary", `(raw) => { const v = JSON.parse(raw); v.intl.settings = { ...${JSON.stringify(keptSettings)}, updatedAt: Date.now() }; return JSON.stringify(v); }`);
  await sleep(500);
  check("details restored", JSON.parse(await sidecar()).intl.settings.payUrl === keptSettings.payUrl);

  // A client with a GSTIN is never an export recipient.
  await tab("Clients");
  await t(`__t.click(/^\\+ Add client$/)`); await opened();
  await t(`__t.set('ws-c-name', 'Desi Exports'), __t.set('ws-c-gstin', '29ABCDE1234F1Z5'), __t.click(/^Save$/, __t.dialog())`);
  await closed();
  await t(`__t.click(/^\\+ New invoice$/)`); await opened();
  await t(`__t.set('ws-client', 'Desi Exports'), __t.set('ws-currency', 'USD')`);
  await sleep(100);
  check("no export choice for a client with a GSTIN", !(await exists("ws-export-lut")));
  await esc(); await closed();

  // Client rows per currency; a monthly plan in USD and its currency change.
  const globexRow = await clientRow("Globex LLC");
  check("client row shows USD balance, not ₹0", /US\$500\.00[\s\S]*US\$500\.00 overdue/.test(globexRow) && !/₹0(?!\d)/.test(globexRow), globexRow);
  check("the open count adds foreign invoices", /\b1 open\b/.test(globexRow), globexRow);
  const kenRow = await clientRow("Kensington Ltd");
  check("a client billed abroad with nothing open reads —, not ₹0", (await clientBalance("Kensington Ltd")) === "—" && !/₹/.test(kenRow), `${await clientBalance("Kensington Ltd")} | ${kenRow}`);
  check("an INR client with nothing open still reads ₹0", /₹0(?!\d)/.test(await clientRow("Desi Exports")), await clientRow("Desi Exports"));
  await t(`__t.click(/^\\+ New invoice$/)`); await opened();
  await t(`__t.set('ws-client', 'Globex LLC'), __t.set('ws-amount', '300'), __t.set('ws-number', 'MON-1')`);
  await t(`[...document.querySelectorAll('[role=dialog] label')].find(l => l.textContent.startsWith('Repeat every month')).querySelector('input').click(), true`);
  await t(`__t.click(/^Add invoice$/, __t.dialog())`);
  await closed();
  await tab("Clients");
  check("monthly plan shown in its currency", /Monthly billing[\s\S]*Globex LLC · US\$300\.00/.test(await text()));
  await t(`__t.click(/^Change currency$/)`); await opened();
  check("plan currency sheet warns that months keep their currency", /Months already created keep their currency\./.test(await dialogText()));
  await t(`__t.set('ws-plan-currency', 'GBP')`);
  check("the amount in the new currency starts empty", (await value("ws-plan-amount")) === "" && /Amount \(GBP\)/.test(await dialogText()));
  await t(`__t.click(/^Change currency$/, __t.dialog())`);
  await sleep(150);
  check("a currency change needs the amount in the new currency", /Enter the amount like 1,200\.50\./.test(await dialogText()) && await b.eval("!!document.querySelector('[role=dialog]')"));
  await t(`__t.set('ws-plan-amount', '240'), __t.click(/^Change currency$/, __t.dialog())`);
  await closed();
  page = await text();
  check("plan replaced in GBP at the new amount; the created month stays USD", /Globex LLC · £240\.00/.test(page) && /Globex LLC · US\$300\.00/.test(page) && !/£300\.00/.test(page), page.slice(0, 1200));
  check("after the change, focus is on the new plan's Change currency, not the page", await b.eval("document.activeElement?.hasAttribute('data-plan-currency') && /£240\\.00/.test(document.activeElement.closest('[data-plan-row]')?.textContent || '')"), await focused());
  const planActions = await b.eval(`Object.fromEntries([...document.querySelectorAll('[aria-labelledby=monthly-title] li')].map((li) => [li.querySelector('p').textContent.includes('£') ? 'gbp' : 'usd', [...li.querySelectorAll('button')].some((x) => x.textContent === 'Change currency')]))`);
  check("only the new plan offers Change currency (the old one has no month left)", planActions.gbp === true && planActions.usd === false, JSON.stringify(planActions));

  // A plan month's currency is locked in the invoice sheet.
  await tab("Invoices");
  await t(`__t.click(/^all$/)`);
  await openRow("MON-1");
  await t(`__t.click(/^Edit$/)`); await opened();
  check("a plan month's currency is locked, with the plan message", await b.eval("document.getElementById('ws-currency').disabled") && /This invoice comes from a monthly plan\. Change the plan's currency instead\./.test(await dialogText()));
  await esc(); await closed();

  // Editing an unpaid invoice's currency keeps its number (new id).
  await tab("Invoices");
  await openRow("Acme GmbH");
  await t(`__t.click(/^Edit$/)`); await opened();
  check("the edit sheet shows the amount in euros", (await value("ws-amount")) === "750.00");
  await t(`__t.set('ws-currency', 'GBP')`);
  check("changing the currency clears the prefilled amount (€750 is not £750)", (await value("ws-amount")) === "" && /Amount \(GBP\)/.test(await dialogText()));
  await t(`__t.set('ws-amount', '750'), __t.click(/^Save changes$/, __t.dialog())`);
  await closed();
  check("currency change keeps the number", /Acme GmbH[\s\S]*£750\.00/.test(await text()) && JSON.parse(await sidecar()).intl.invoices && Object.values(JSON.parse(await sidecar()).intl.invoices).filter((i) => i.number === "INV-0004" && !i.deletedAt).map((i) => i.currency).join() === "GBP");
  await t(`__t.click(/^all$/)`);
  await openRow("US$1,200.50");
  await t(`__t.click(/^Edit$/)`); await opened();
  check("a paid invoice's currency is locked", await b.eval("document.getElementById('ws-currency').disabled") && /Currency can't be changed after a payment is recorded\./.test(await dialogText()));
  await esc(); await closed();

  // CSV: per-currency columns appended.
  const csv = await download("__t.click(/^Export CSV$/)");
  check("CSV header gains Currency and INR credited", csv.split("\n")[0].endsWith(",Description,Currency,Amount,Paid,Balance,INR credited") && /,USD,1200\.50,1200\.50,0\.00,99840\.00/.test(csv), csv.slice(0, 400));

  // A foreign payment recorded without INR credited: the rupees are added later from the payment line (§3.5).
  await openRow("Acme GmbH");
  await t(`__t.click(/^Record payment$/)`); await opened();
  await t(`__t.set('ws-pay-amount', '750'), __t.set('ws-pay-ref', 'WISE-9001'), __t.click(/^Save payment$/, __t.dialog())`);
  await closed();
  await tab("Overview");
  check("the overview counts the payment without INR credited", /INR earned this month: ₹99,840 \(1 payment without INR credited\)/.test(await text()), (await text()).slice(0, 800));
  await tab("Invoices");
  await t(`__t.click(/^all$/)`);
  await openRow("Acme GmbH");
  await t(`__t.click(/^Add INR credited$/)`);
  await sleep(100);
  check("the INR credited input takes focus", await b.eval("document.activeElement?.id?.startsWith('ws-credit-')"));
  await esc();
  await sleep(100);
  check("Escape closes the form and returns focus to its button", await b.eval("!document.querySelector('[id^=ws-credit-]') && document.activeElement?.hasAttribute('data-credit-open')"));
  await t(`__t.click(/^Add INR credited$/)`);
  await sleep(100);
  await t(`__t.click(/^Cancel$/)`);
  await sleep(100);
  check("Cancel returns focus to the button", await b.eval("!document.querySelector('[id^=ws-credit-]') && document.activeElement?.hasAttribute('data-credit-open')"));
  await t(`__t.click(/^Add INR credited$/)`);
  await sleep(100);
  const creditForm = await b.eval(`(() => { const i = document.querySelector('[id^=ws-credit-]'); const btn = [...i.form.querySelectorAll('button')].find((x) => x.textContent === 'Add INR credited');
    return { inputW: i.getBoundingClientRect().width, formW: i.form.getBoundingClientRect().width, filled: btn.className.includes('bg-graphite') }; })()`);
  check("the INR credited input is narrow and its button secondary", creditForm.inputW < 200 && !creditForm.filled, JSON.stringify(creditForm));
  await t(`__t.set(document.querySelector('[id^=ws-credit-]').id, '80,000'), __t.click(/^Add INR credited$/)`);
  await sleep(200);
  check("payment line shows the ₹ added later", /£750\.00 · BANK[\s\S]*WISE-9001 · ₹80,000 credited/.test(await text()));
  check("after the save, focus is on that payment's Undo, not the page", await b.eval("document.activeElement?.hasAttribute('data-credit-undo')"));
  check("INR credited stored on the foreign payment in the sidecar", Object.values(JSON.parse(await sidecar()).intl.invoices).some((i) => !i.deletedAt && i.payments.some((p) => p.reference === "WISE-9001" && p.inrCreditedPaise === 8_000_000)));
  await tab("Overview");
  check("INR earned this month adds it", /INR earned this month: ₹1,79,840/.test(await text()), (await text()).slice(0, 800));
  await tab("Invoices");

  // Storage: the book key is exactly what older code writes; foreign data only in the sidecar.
  const bookKey = await book();
  check("book key holds no foreign data", !bookKey.includes("USD") && !bookKey.includes("HDFCINBB") && !bookKey.includes('"intl"') && (await sidecar()).includes("HDFCINBB"));

  // An old tab writes the stripped copy (as pre-PR 1 code would): nothing foreign is lost, and no write loop starts.
  await b.eval(`(() => { window.__writes = 0; const orig = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (String(k).startsWith('proupiqr-')) window.__writes++; return orig.call(this, k, v); }; return true; })()`);
  await b.eval(`new Promise((resolve) => { const f = document.createElement('iframe'); f.src = '/terms/'; f.style.display = 'none'; f.onload = () => {
    const w = JSON.parse(localStorage.getItem('proupiqr-workspace-v1')); w.business.updatedAt += 1; w.business.phone = '98200 00000';
    const rohan = Object.values(w.clients).find((c) => c.name === 'Rohan Mehta'); const at = Date.now();
    w.invoices.inv_oldtab001 = { id: 'inv_oldtab001', number: 'INV-0003', clientId: rohan.id, issueDate: '2026-10-01', dueDate: '2026-10-08', amountPaise: 150000, description: 'old tab', payments: [], reminders: [], voided: false, createdAt: at, updatedAt: at };
    f.contentWindow.localStorage.setItem('proupiqr-workspace-v1', JSON.stringify(w)); resolve(true); }; document.body.appendChild(f); })`);
  await sleep(2000);
  const writes = await b.eval("window.__writes");
  page = await text();
  check("old-tab write keeps foreign invoices and settings", page.includes("US$") && (await sidecar()).includes("HDFCINBB") && (await sidecar()).includes('"USD"'));
  check("old-tab write causes no write loop", writes <= 4, `writes=${writes}`);
  // The old tab couldn't see INV-0003 (a USD invoice) and issued it again for ₹: both rows say so.
  await tab("Invoices");
  await t(`__t.click(/^all$/)`);
  await openRow("₹1,500");
  check("an INR invoice sharing a foreign invoice's number shows the note", /Another invoice has this number\./.test(await text()));

  // Backup → erase → restore brings the foreign invoices back with their currency.
  await tab("Settings");
  const backup = await download("__t.click(/^Download backup$/)");
  check("backup carries the foreign section", backup.includes('"intl"') && backup.includes('"USD"'));
  const backupPath = join(OUT, "cur-backup.json");
  writeFileSync(backupPath, backup);
  await t(`__t.click(/^Erase workspace on this device/)`);
  await t(`__t.click(/^Erase$/)`);
  await sleep(300);
  check("erase tombstones the foreign invoices", !Object.values(JSON.parse((await sidecar()) || '{"intl":{"invoices":{}}}').intl.invoices).some((i) => !i.deletedAt));
  const { root } = (await b.send("DOM.getDocument", {})).result;
  const { nodeId } = (await b.send("DOM.querySelector", { nodeId: root.nodeId, selector: "input[type=file]" })).result;
  await b.send("DOM.setFileInputFiles", { nodeId, files: [backupPath] });
  await b.waitFor("/Backup merged/.test(document.body.innerText)", 6000);
  await tab("Invoices");
  await t(`__t.click(/^all$/)`);
  check("restore brings the USD invoice back in USD", /Globex LLC[\s\S]*US\$1,200\.50/.test(await text()) && Object.values(JSON.parse(await sidecar()).intl.invoices).some((i) => !i.deletedAt && i.currency === "USD"));

  // An LUT for last year's FY: the card and an export invoice's reminder say it has expired.
  await tab("Settings");
  await openSettingsCard();
  await sleep(150);
  const lastFy = await b.eval("document.getElementById('ws-intl-lut-fy').options[2].value");
  await t(`__t.set('ws-intl-lut-fy', '${lastFy}'), __t.click(/^Save payment details$/)`);
  await sleep(300);
  check("Settings card: the expired LUT notice", new RegExp(`Your LUT for FY ${lastFy} has expired\\. Add this year's ARN\\.`).test(await text()));
  await tab("Invoices");
  await t(`__t.click(/^unpaid$/)`);
  await openRow("US$500.00");
  await t(`__t.click(/^Remind$/)`); await b.waitFor("!!document.getElementById('ws-reminder')");
  check("reminder: the expired LUT notice, and no export line", /has expired/.test(await dialogText()) && !(await value("ws-reminder")).includes("SUPPLY MEANT"), await value("ws-reminder"));
  await esc(); await closed();

  // The Invoices badge counts every overdue invoice, foreign ones too (only the KPI cells stay ₹).
  await t(`__t.click(/^overdue$/)`); await sleep(200);
  const overdueCount = await b.eval("[...document.querySelectorAll('li [aria-expanded]')].filter((r) => /\\bOverdue\\b/.test(r.innerText)).length");
  const foreignOverdue = await b.eval("[...document.querySelectorAll('li [aria-expanded]')].some((r) => /\\bOverdue\\b/.test(r.innerText) && /US\\$/.test(r.innerText))");
  const badge = await b.eval("[...document.querySelectorAll('nav[aria-label=\"Workspace sections\"] button')].find((x) => /^Invoices/.test(x.textContent.trim()))?.querySelector('span.ml-auto')?.textContent ?? '0'");
  check("the Invoices badge equals the rows marked Overdue, a US$ one included", foreignOverdue && Number(badge) === overdueCount, `badge ${badge}, rows ${overdueCount}`);
  await t(`__t.click(/^unpaid$/)`); await sleep(150);

  // An edit saved after another tab deleted the record (sheet still open) brings it back with the edits: a foreign
  // invoice with a currency change, an INR invoice, and a client (review round 4; the sheets use withoutTombstone).
  {
    const live = async (number) => Object.values(JSON.parse(await sidecar()).intl.invoices).filter((i) => i.number === number);
    await t(`__t.click(/^\\+ New invoice$/)`); await opened();
    await t(`__t.set('ws-client', 'Tomb Traders'), __t.set('ws-currency', 'USD'), __t.set('ws-amount', '100'), __t.set('ws-number', 'TOMB-1'), __t.set('ws-due', '${await iso(20)}'), __t.click(/^Add invoice$/, __t.dialog())`);
    await closed();
    const tombId = (await live("TOMB-1")).find((i) => !i.deletedAt)?.id;
    await t(`__t.click(/^all$/)`);
    await openRow("TOMB-1");
    await t(`__t.click(/^Edit$/)`); await opened();
    await otherTabWrite("proupiqr-intl-v1:biz_primary", `(raw) => { const v = JSON.parse(raw); const i = v.intl.invoices['${tombId}']; const now = Date.now(); i.deletedAt = now; i.updatedAt = now; return JSON.stringify(v); }`);
    await sleep(400);
    check("deleted in another tab: the invoice sheet stays open", await b.eval("!!document.querySelector('[role=dialog]')") && !(await live("TOMB-1")).some((i) => !i.deletedAt));
    await t(`__t.set('ws-currency', 'CAD'), __t.set('ws-amount', '150'), __t.click(/^Save changes$/, __t.dialog())`);
    await closed();
    const tomb = await live("TOMB-1");
    check("a foreign invoice deleted in another tab comes back with the edits and its currency change", tomb.filter((i) => !i.deletedAt).map((i) => `${i.currency} ${i.amountPaise}`).join() === "CAD 15000"
      && Boolean(tomb.find((i) => i.id === tombId)?.deletedAt) && /TOMB-1[\s\S]*CA\$150\.00/.test(await text()), JSON.stringify(tomb.map((i) => [i.id, i.currency, i.amountPaise, i.deletedAt])));

    await t(`__t.click(/^\\+ New invoice$/)`); await opened();
    await t(`__t.set('ws-client', 'Tomb Rupee'), __t.set('ws-currency', 'INR'), __t.set('ws-amount', '2000'), __t.set('ws-number', 'TOMB-2'), __t.set('ws-due', '${await iso(20)}'), __t.click(/^Add invoice$/, __t.dialog())`);
    await closed();
    const inrId = Object.values(JSON.parse(await book()).invoices).find((i) => i.number === "TOMB-2")?.id;
    await openRow("TOMB-2");
    await t(`__t.click(/^Edit$/)`); await opened();
    await otherTabWrite("proupiqr-workspace-v1", `(raw) => { const v = JSON.parse(raw); const i = v.invoices['${inrId}']; const now = Date.now(); i.deletedAt = now; i.updatedAt = now; return JSON.stringify(v); }`);
    await sleep(400);
    await t(`__t.set('ws-amount', '2500'), __t.click(/^Save changes$/, __t.dialog())`);
    await closed();
    const inr = JSON.parse(await book()).invoices[inrId];
    check("an INR invoice deleted in another tab comes back with the edits", inr && !inr.deletedAt && inr.amountPaise === 250000 && /TOMB-2/.test(await text()), JSON.stringify(inr));

    await tab("Clients");
    const clientId = Object.values(JSON.parse(await book()).clients).find((c) => c.name === "Tomb Rupee")?.id;
    await t(`document.querySelector('button[aria-label="Edit Tomb Rupee"]').click(), true`); await opened();
    await otherTabWrite("proupiqr-workspace-v1", `(raw) => { const v = JSON.parse(raw); const c = v.clients['${clientId}']; const now = Date.now(); c.deletedAt = now; c.updatedAt = now; return JSON.stringify(v); }`);
    await sleep(400);
    await t(`__t.set('ws-c-name', 'Tomb Rupee Kumar'), __t.click(/^Save$/, __t.dialog())`); await closed();
    const cl = JSON.parse(await book()).clients[clientId];
    check("a client deleted in another tab comes back with the edits", cl && !cl.deletedAt && cl.name === "Tomb Rupee Kumar", JSON.stringify(cl));

    // Review round 5: an edit saved after another tab moved the invoice to another currency is refused with a
    // message (the old id would be deleted again next to its copy, and the amount on screen is in the old currency).
    await tab("Invoices");
    await t(`__t.click(/^\\+ New invoice$/)`); await opened();
    await t(`__t.set('ws-client', 'Tomb Traders'), __t.set('ws-currency', 'USD'), __t.set('ws-amount', '90'), __t.set('ws-number', 'TOMB-3'), __t.set('ws-due', '${await iso(20)}'), __t.click(/^Add invoice$/, __t.dialog())`);
    await closed();
    const movedId = (await live("TOMB-3")).find((i) => !i.deletedAt)?.id;
    const copyId = model(`console.log(JSON.stringify(M.replacementInvoiceId(${JSON.stringify(movedId)}, "EUR")))`);
    await t(`__t.click(/^all$/)`);
    await openRow("TOMB-3");
    await t(`__t.click(/^Edit$/)`); await opened();
    await otherTabWrite("proupiqr-intl-v1:biz_primary", `(raw) => { const v = JSON.parse(raw); const i = v.intl.invoices['${movedId}']; const now = Date.now();
      v.intl.invoices['${copyId}'] = { ...i, id: '${copyId}', currency: 'EUR', amountPaise: 8000, updatedAt: now }; i.deletedAt = now; i.updatedAt = now; return JSON.stringify(v); }`);
    await sleep(400);
    await t(`__t.set('ws-desc', 'edited here'), __t.click(/^Save changes$/, __t.dialog())`);
    await sleep(200);
    check("moved in another tab: the save is refused with a message, the sheet stays open", /This invoice was changed to EUR in another tab or device, so these changes weren't saved\./.test(await dialogText()));
    const tomb3 = await live("TOMB-3");
    check("…and nothing is revived or edited", tomb3.filter((i) => !i.deletedAt).map((i) => `${i.currency} ${i.amountPaise} ${i.description}`).join() === "EUR 8000 ", JSON.stringify(tomb3.map((i) => [i.currency, i.deletedAt, i.description])));
    await esc(); await closed();

    // Review round 6: a currency change clears the prefilled amount and says so (also to screen readers); switching
    // back to the invoice's own currency brings the amount back.
    await t(`__t.click(/^\\+ New invoice$/)`); await opened();
    await t(`__t.set('ws-client', 'Tomb Rupee Kumar'), __t.set('ws-currency', 'INR'), __t.set('ws-amount', '5000'), __t.set('ws-number', 'TOMB-4'), __t.set('ws-due', '${await iso(20)}'), __t.click(/^Add invoice$/, __t.dialog())`);
    await closed();
    const tomb4 = Object.values(JSON.parse(await book()).invoices).find((i) => i.number === "TOMB-4")?.id;
    await openRow("TOMB-4");
    await t(`__t.click(/^Edit$/)`); await opened();
    const hint = () => b.eval("document.getElementById('ws-amount-hint')?.innerText.trim() ?? null");
    check("no amount hint before a currency change", (await hint()) === "" && (await b.eval("document.getElementById('ws-amount').getAttribute('aria-describedby')")) === "ws-amount-hint"
      && (await b.eval("document.getElementById('ws-amount-hint').getAttribute('aria-live')")) === "polite");
    await t(`__t.set('ws-currency', 'USD')`);
    check("a new currency clears the amount, with a hint", (await value("ws-amount")) === "" && (await hint()) === "Enter the amount in USD.");
    await t(`__t.set('ws-currency', 'INR')`);
    check("switching back restores the amount, and the hint goes", (await value("ws-amount")) === "5000.00" && (await hint()) === "" && /Amount \(₹\)/.test(await dialogText()));
    // A payment recorded in another tab after a new currency was picked: the picker goes back to ₹ with the amount,
    // locked, and the other edits still save.
    await t(`__t.set('ws-currency', 'EUR')`);
    await otherTabWrite("proupiqr-workspace-v1", `(raw) => { const v = JSON.parse(raw); const i = v.invoices['${tomb4}']; const now = Date.now();
      i.payments.push({ id: 'pay_e2etab0001', amountPaise: 100000, date: '${await iso(0)}', mode: 'upi', reference: '', createdAt: now }); i.updatedAt = now; return JSON.stringify(v); }`);
    await sleep(400);
    check("a payment from another tab puts the currency back, locked", (await value("ws-currency")) === "INR" && (await b.eval("document.getElementById('ws-currency').disabled"))
      && (await value("ws-amount")) === "5000.00" && /Currency can't be changed after a payment is recorded\./.test(await dialogText()));
    await t(`__t.set('ws-desc', 'saved after the payment'), __t.click(/^Save changes$/, __t.dialog())`);
    await closed();
    const saved4 = JSON.parse(await book()).invoices[tomb4];
    check("…and the other edits save, with the payment", saved4 && !saved4.deletedAt && saved4.description === "saved after the payment" && saved4.payments.length === 1 && saved4.amountPaise === 500000, JSON.stringify(saved4));

    // The double-billing notes (review round 5): a ₹ invoice a stale tab paid next to its US$ copy (both show "also
    // exists in another currency", and not the number note), and a plan month a stale copy billed after a currency
    // change (only that month shows "billed twice"). Records built with the model, written as another tab would.
    const seed = model(`
      const today = new Date(); const iso = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 15); const month = iso(today).slice(0, 7);
      const T = Date.now() - 60000;
      let w = M.upsertClient(M.updateBusiness(M.emptyWorkspace(), { name: "Seed", upiId: "seed@okaxis" }, T), { id: "cli_e2eseed1", name: "Seeded Twice Co", phone: "", email: "", gstin: "", createdAt: T, updatedAt: T }, T);
      w = M.upsertInvoice(w, { id: "inv_e2emv001", number: "MV-1", clientId: "cli_e2eseed1", issueDate: iso(today), dueDate: iso(today), amountPaise: 900000, description: "", payments: [], reminders: [], voided: false, createdAt: T, updatedAt: T }, T);
      const moved = M.replaceInvoiceCurrency(w, "inv_e2emv001", "USD", T + 1, (c) => ({ ...c, amountPaise: 11000 }));
      w = M.addPayment(M.upsertInvoice(moved.ws, M.withoutTombstone(M.getInvoice(w, "inv_e2emv001")), T + 2), "inv_e2emv001", { amountPaise: 100000, date: iso(today), mode: "upi", reference: "" }, T + 3);
      w = M.upsertPlan(w, { id: "rec_e2eplan1", clientId: "cli_e2eseed1", amountPaise: 500000, description: "", dayOfMonth: 1, dueAfterDays: 15, startMonth: iso(lastMonth).slice(0, 7), endMonth: "", paused: false, createdAt: T, updatedAt: T }, T);
      w = M.generateRecurring(w, iso(lastMonth), T + 4).ws;
      const re = M.replacePlanCurrency(w, "rec_e2eplan1", "USD", T + 5, 6000);
      w = M.generateRecurring(re.ws, iso(today), T + 6).ws;
      const stray = M.recurringInvoiceId("rec_e2eplan1", month);
      w = M.upsertInvoice(w, { id: stray, number: "BT-STRAY", clientId: "cli_e2eseed1", issueDate: month + "-01", dueDate: month + "-16", amountPaise: 500000, description: "", payments: [], reminders: [], voided: false, recurringId: "rec_e2eplan1", createdAt: T + 7, updatedAt: T + 7 }, T + 7);
      w = M.repairIntl(w, T + 8);
      let n = 0;
      for (const map of [w.invoices, w.intl.invoices]) for (const i of Object.values(map)) if (!["MV-1", "BT-STRAY"].includes(i.number)) i.number = "BT-" + (++n);
      const usdMonth = M.recurringInvoiceId(re.id, month);
      console.log(JSON.stringify({ w, stray, copy: moved.id, usdMonth, usdNumber: M.getInvoice(w, usdMonth).number, flagged: [...M.monthsBilledTwice(w)], moved: [...M.invoicesMovedTwice(w)] }));
    `);
    check("(seed: the model flags the stray month and the moved pair)", seed.flagged.join() === seed.stray && seed.moved.length === 2, JSON.stringify([seed.flagged, seed.moved]));
    await otherTabWrite("proupiqr-workspace-v1", `(raw) => { const v = JSON.parse(raw); const s = ${JSON.stringify({ clients: seed.w.clients, invoices: seed.w.invoices, recurring: seed.w.recurring })};
      Object.assign(v.clients, s.clients); Object.assign(v.invoices, s.invoices); Object.assign(v.recurring, s.recurring); return JSON.stringify(v); }`);
    await otherTabWrite("proupiqr-intl-v1:biz_primary", `(raw) => { const v = JSON.parse(raw); const s = ${JSON.stringify(seed.w.intl)};
      Object.assign(v.intl.invoices, s.invoices); Object.assign(v.intl.recurring, s.recurring); return JSON.stringify(v); }`);
    await sleep(600);
    await t(`__t.click(/^all$/)`);
    /** Opens the one row whose text includes every needle and returns its li's text (the notes sit in the opened row). */
    const rowNote = async (...needles) => { await sleep(100); return b.eval(`(() => { const rows = [...document.querySelectorAll('li [aria-expanded]')]; const r = rows.find((x) => ${JSON.stringify(needles)}.every((n) => x.textContent.includes(n)));
      if (!r) return 'no row'; for (const o of rows) if (o !== r && o.getAttribute('aria-expanded') === 'true') o.click(); if (r.getAttribute('aria-expanded') !== 'true') r.click(); return new Promise((ok) => setTimeout(() => ok(r.closest('li').innerText), 150)); })()`); };
    const MOVED = /This invoice also exists in another currency after a currency change\. Keep one and delete the other\./;
    const TWICE = /This month is billed twice: a plan linked to this one by a currency change bills it too\. Delete one of the two\./;
    let note = await rowNote("MV-1", "US$");
    check("moved pair: the US$ copy shows the 'other currency' note and not the number note", MOVED.test(note) && !/Another invoice has this number\./.test(note), note);
    note = await rowNote("MV-1", "₹");
    check("moved pair: the paid ₹ invoice shows it too", MOVED.test(note) && !/Another invoice has this number\./.test(note), note);
    note = await rowNote("BT-STRAY");
    check("billed twice: the stray month shows the note", TWICE.test(note) && !MOVED.test(note), note);
    note = await rowNote(seed.usdNumber, "US$");
    check("billed twice: the plan's own month doesn't", !TWICE.test(note), note);
    await b.shot("cur-twice-notes.png");

    // A bad "INR credited" value is reported under that field, not as a sheet-level line.
    await tab("Invoices");
    await t(`__t.click(/^all$/)`);
    await openRow("TOMB-1");
    await t(`__t.click(/^Record payment$/)`); await opened();
    await t(`__t.set('ws-pay-ref', 'WISE-REF-123456'), __t.set('ws-pay-inr', 'abc'), __t.click(/^Save payment$/, __t.dialog())`);
    await sleep(150);
    const credErr = await b.eval("({ under: document.getElementById('ws-pay-inr')?.parentElement?.querySelector('[role=alert]')?.textContent || '', alerts: document.querySelectorAll('[role=dialog] [role=alert]').length, invalid: document.getElementById('ws-pay-inr')?.getAttribute('aria-invalid') })");
    check("a bad INR credited value shows its error under that field", credErr.under === "Enter an amount like 1500 or 1500.50." && credErr.alerts === 1 && credErr.invalid === "true", JSON.stringify(credErr));
    await b.shot("cur-credited-error.png");
    await t(`__t.set('ws-pay-inr', ''), __t.click(/^Save payment$/, __t.dialog())`);
    await closed();
    await openRow("TOMB-1");
    await sleep(150);
    const wideLine = await b.eval("(() => { const open = document.querySelector('[data-credit-open]'); const text = open?.closest('li')?.firstElementChild?.firstElementChild; return open && text ? Math.abs(open.getBoundingClientRect().top - text.getBoundingClientRect().top) < 4 : null; })()");
    check("desktop: the payment line keeps its actions on the same line", wideLine === true, String(wideLine));
    await b.shot("cur-payment-line.png");
  }

  // Phone width: rows, sheets and the Settings card never scroll sideways.
  await b.mobile(true);
  await sleep(300);
  for (const name of ["Overview", "Invoices", "Clients", "Settings"]) {
    await tab(name);
    if (name === "Settings") await openSettingsCard();
    if (name === "Invoices") await openRow("Globex");
    await sleep(200);
    check(`no horizontal scroll at 390px: ${name}`, await noScroll(), String(await b.eval("document.documentElement.scrollWidth")));
    await b.shot(`cur-m-${name.toLowerCase()}.png`);
  }
  // 390px: a foreign payment line with "Add INR credited" keeps the full row for its text; the actions wrap under it.
  await tab("Invoices");
  await t(`__t.click(/^all$/)`);
  await openRow("TOMB-1");
  await sleep(200);
  const payLine = await b.eval(`(() => { const open = document.querySelector('[data-credit-open]'); const line = open?.closest('li')?.firstElementChild; const text = line?.firstElementChild; if (!line || !text) return null;
    const a = line.getBoundingClientRect(), t = text.getBoundingClientRect(), o = open.getBoundingClientRect(); return { share: t.width / a.width, under: o.top >= t.bottom - 1, refWhole: text.textContent.includes('WISE-REF-123456') && text.getClientRects().length > 0 }; })()`);
  check("390px: a payment line without INR credited puts its actions under the text", payLine && payLine.share > 0.9 && payLine.under, JSON.stringify(payLine));
  await b.shot("cur-m-payment-line.png");
  // A client billed abroad keeps their name readable at 390px: the balances go on a row under it.
  await tab("Clients");
  await b.eval(`document.querySelector('button[aria-label="Edit Globex LLC"]').click()`); await opened();
  await t(`__t.set('ws-c-name', 'Globex Trading Company'), __t.click(/^Save$/, __t.dialog())`); await closed();
  await sleep(200);
  const nameFit = await b.eval(`(() => { const n = [...document.querySelectorAll('li button span.truncate')].find((x) => x.textContent === 'Globex Trading Company');
    const bal = n?.closest('li')?.querySelector('[data-client-balances]'); if (!n || !bal) return null; n.scrollIntoView({ block: 'center' });
    return { scroll: n.scrollWidth, client: n.clientWidth, under: bal.getBoundingClientRect().top >= n.getBoundingClientRect().bottom - 1 }; })()`);
  check("390px: a client billed abroad keeps a 22-character name whole", nameFit && nameFit.scroll <= nameFit.client, JSON.stringify(nameFit));
  check("390px: their balances sit on a row under the name", nameFit?.under === true, JSON.stringify(nameFit));
  await b.shot("cur-m-clients-long.png");
  // 390px (review round 5): a plan's currency change hands focus to the new plan's row; an invalid Clients abroad
  // save brings the first invalid field into view and focuses it.
  await b.eval(`[...document.querySelectorAll('[data-plan-currency]')].find((x) => /£240\\.00/.test(x.closest('[data-plan-row]').textContent)).click(), true`); await opened();
  await t(`__t.set('ws-plan-currency', 'EUR'), __t.set('ws-plan-amount', '220'), __t.click(/^Change currency$/, __t.dialog())`);
  await closed();
  await sleep(150);
  check("390px: after a plan's currency change, focus is on the new plan's row", await b.eval("document.activeElement?.hasAttribute('data-plan-currency') && /€220\\.00/.test(document.activeElement.closest('[data-plan-row]')?.textContent || '')"), await focused());
  await tab("Settings");
  await openSettingsCard();
  await sleep(150);
  await t(`__t.set('ws-intl-swift', 'AB')`);
  await b.eval("__t.btn(/^Save payment details$/).scrollIntoView({ block: 'center' }), __t.btn(/^Save payment details$/).click(), true");
  await sleep(250);
  const inView = await b.eval("(() => { const r = document.getElementById('ws-intl-swift').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; })()");
  check("390px: an invalid save focuses the first invalid field and brings it into view", (await focused()) === "ws-intl-swift" && inView, `${await focused()} ${inView}`);
  await t(`__t.set('ws-intl-swift', 'HDFCINBB')`);
  await tab("Invoices");
  await openRow("Globex");
  await t(`__t.click(/^Edit$/)`); await opened();
  check("no horizontal scroll at 390px: invoice sheet", await noScroll());
  await b.shot("cur-m-sheet.png");
  await esc(); await closed();
  await b.mobile(false);

  check("no console errors", b.errors.length === 0, b.errors.join(" | "));
} catch (error) {
  check("test script ran to completion", false, String(error).slice(0, 500));
} finally {
  b.close();
}
process.exit(check.report());
