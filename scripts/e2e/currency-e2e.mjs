// Clients abroad in /app/ (docs/spec-foreign-clients.md §5, §9.3), against the normal static build (INTL_UI is on since
// PR 5). Static: no server, sync stays signed out.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { checker, helpers, OUT, sleep, startBrowser } from "./cdp-lib.mjs";

const BASE = process.env.BASE || "http://localhost:4400";
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
  check("non-https or unknown pay link rejected", /Enter an https link from PayPal, Wise, Stripe or Razorpay\./.test(page));
  check("a save with errors focuses the first invalid field", (await focused()) === "ws-intl-swift", await focused());
  check("nothing saved while invalid", !(await sidecar()));
  await t(`__t.set('ws-intl-bank', 'HDFC Bank'), __t.set('ws-intl-swift', 'hdfc in bb'), __t.set('ws-intl-account', 'GB82 WEST 1234 5698 7654 32'), __t.set('ws-intl-bank-details', 'Branch: Fort, Mumbai'), __t.set('ws-intl-pay-url', 'https://paypal.me/sharma')`);
  await t(`document.getElementById('ws-intl-on').click(), true`);
  await t(`__t.click(/^Save payment details$/)`);
  await b.waitFor("/Payment details saved\\./.test(document.body.innerText)", 4000);
  check("valid details saved", /Payment details saved\./.test(await text()) && (await sidecar()).includes("HDFCINBB") && (await sidecar()).includes('"on":true'));
  // §5.2 (review round 3): once settings exist the card opens by itself; the per-currency set stays closed without byCurrency.
  const detailsOpen = () => b.eval("(() => { const d = [...document.querySelectorAll('details')].find(x => x.querySelector('summary')?.textContent.includes('Clients abroad')); return { card: !!d?.open, perCurrency: !!d?.querySelector('details')?.open }; })()");
  await b.go(BASE + "/app/?tab=settings", 2500);
  let opens = await detailsOpen();
  check("after a reload, saved settings open the card; no per-currency details keep that set closed", opens.card && !opens.perCurrency, JSON.stringify(opens));

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
  // Review round 4: "(details saved)" reads what is stored, never the typed but unsaved set.
  const usdOption = () => b.eval("document.querySelector('#ws-intl-override-currency option[value=USD]').textContent");
  check("typed but unsaved USD details: the option still reads plain USD", (await usdOption()) === "USD", await usdOption());
  await t(`__t.set('ws-intl-account-usd', '8310123456')`);
  await t(`__t.click(/^Save payment details$/)`);
  await sleep(300);
  check("…and says saved once the save went through", (await usdOption()) === "USD (details saved)", await usdOption());
  const side = JSON.parse(await sidecar());
  check("LUT and USD override saved", side.intl.settings.lutArn === "AD2704260012345" && side.intl.settings.lutFy === fy && side.intl.settings.byCurrency?.USD?.account === "8310123456" && !side.intl.settings.byCurrency.EUR, JSON.stringify(side.intl.settings));
  await b.go(BASE + "/app/?tab=settings", 2500);
  opens = await detailsOpen();
  check("after a reload, a saved per-currency set opens by itself", opens.card && opens.perCurrency, JSON.stringify(opens));
  const optionTexts = await b.eval("[...document.getElementById('ws-intl-override-currency').options].map((o) => o.textContent).join('|')");
  check("a currency with saved details says so in words (no bare ✓)", optionTexts === "USD (details saved)|EUR|GBP|AED|AUD|CAD|SGD", optionTexts);
  // Review round 2: the per-currency set's fields carry the currency in their names, so a screen reader never hears
  // two fields called "Account name".
  const fieldNames = await b.eval("['ws-intl-account-name', 'ws-intl-account-name-usd', 'ws-intl-swift-usd', 'ws-intl-pay-url-usd'].map((id) => document.querySelector('label[for=' + id + ']')?.textContent)");
  check("per-currency fields are named with their currency", fieldNames[0] === "Account name" && fieldNames[1] === "Account name (USD)" && fieldNames[2] === "SWIFT / BIC (USD)"
    && fieldNames[3] === "PayPal, Wise, Stripe or Razorpay payment link (optional) (USD)", JSON.stringify(fieldNames));
  check("an LUT for this financial year is not reported as expired", fy === await b.eval("document.getElementById('ws-intl-lut-fy').options[1].value") && !/has expired/.test(await text()));
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
  // The short form needs the + (and so a country code) even for a client billed abroad.
  await t(`__t.set('ws-client-currency', 'GBP'), __t.set('ws-c-phone', '4420 7946'), __t.click(/^Save$/, __t.dialog())`);
  await sleep(150);
  check("8 digits without + are refused for a GBP client", await b.eval("!!document.querySelector('[role=dialog]')") && /Enter a 10-digit mobile number/.test(await dialogText()));
  await t(`__t.set('ws-c-phone', '+44 20 7946'), __t.click(/^Save$/, __t.dialog())`);
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
  // Once the user picks a currency in the select, the client name no longer changes it.
  await t(`__t.set('ws-currency', 'EUR'), __t.set('ws-client', 'Globex'), __t.set('ws-client', 'Globex LLC')`);
  await sleep(100);
  check("after the user picks a currency, the client name no longer changes it", (await value("ws-currency")) === "EUR" && /Amount \(EUR\)/.test(await dialogText()));
  await t(`__t.set('ws-currency', 'USD')`);
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
  // Review round 5 (§5.6): a fully paid currency leaves no "US$0.00 to collect" line behind.
  const abroadPaid = await b.eval(`document.querySelector('[aria-label="Clients abroad"]')?.innerText ?? null`);
  check("Clients abroad: a fully paid currency has no 'to collect' line", abroadPaid !== null && !/US\$|to collect/.test(abroadPaid), abroadPaid);

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
  check("reminder sheet: a current-FY LUT is not reported as expired", !/has expired/.test(await dialogText()));
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
  await t(`__t.set('ws-client', 'Acme GmbH'), __t.set('ws-currency', 'EUR'), __t.set('ws-amount', '12,345,678.00')`);
  // Review round 2: from sm up the amount + currency row spans the sheet, so a large amount is never cut off.
  const amountBox = await b.eval("(() => { const a = document.getElementById('ws-amount'), n = document.getElementById('ws-number'); return { w: a.clientWidth, scroll: a.scrollWidth, number: n.clientWidth }; })()");
  check("1280px: the amount field shows a large amount whole and is at least as wide as the other fields", amountBox.scroll <= amountBox.w && amountBox.w >= amountBox.number, JSON.stringify(amountBox));
  await t(`__t.set('ws-amount', '750'), __t.set('ws-issue', '${await iso(-20)}'), __t.set('ws-due', '${await iso(-5)}')`);
  await t(`document.getElementById('ws-export-lut').click(), __t.click(/^Add invoice$/, __t.dialog())`);
  await closed();
  // §5.3 (review round 3): a client created from a foreign invoice keeps its currency as their default.
  const acmeId = Object.values(JSON.parse(await book()).clients).find((c) => c.name === "Acme GmbH")?.id;
  const acmeEntry = JSON.parse(await sidecar()).intl.clients?.[acmeId];
  check("a client created from a EUR invoice gets EUR as their billing currency", acmeEntry?.currency === "EUR" && !acmeEntry.deletedAt, JSON.stringify({ acmeId, acmeEntry }));
  await t(`__t.click(/^\\+ New invoice$/)`); await opened();
  await t(`__t.set('ws-client', 'Acme GmbH')`);
  await sleep(100);
  check("…and their next invoice starts in EUR", (await value("ws-currency")) === "EUR", await value("ws-currency"));
  await esc(); await closed();
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
  check("no plan offers a currency change (a currency is fixed at creation)", !(await b.eval("[...document.querySelectorAll('button')].some((x) => /Change currency/.test(x.textContent))")));
  check("the Monthly billing note says how to switch without billing a month twice", await b.eval("document.querySelector('section[aria-labelledby=monthly-title] [data-monthly-note]')?.textContent === 'To bill in another currency, stop the monthly billing, then start a new one in that currency. If a month would be billed twice, the new invoice says which month to start in.'"));
  // Repeat in another currency for months Globex's US$ plan already bills: the sheet blocks it; in US$ it doesn't
  // (review rounds 1-2, PR 5). The US$ plan has no end month, so no date clears it: the message says to stop it first.
  const monthName = (offset) => b.eval(`(() => { const d = new Date(); const m = new Date(Date.UTC(d.getFullYear(), d.getMonth() + (${offset}), 1));
    return m.toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' }).replace(/ /g, ' '); })()`);
  const overlapText = () => b.eval("document.querySelector('[data-plan-overlap]')?.textContent || ''");
  /** The name of the month `delta` months after the one holding the ISO date `date`. */
  const monthOfIso = (date, delta) => b.eval(`(() => { const [y, m] = '${date}'.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + (${delta}), 1));
    return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' }).replace(/ /g, '\u00a0'); })()`);
  const sidecarCounts = async () => { const intl = JSON.parse(await sidecar()).intl; const bk = JSON.parse(await book());
    return { invoices: Object.keys(bk.invoices).length + Object.keys(intl.invoices).length, plans: Object.keys(bk.recurring).length + Object.keys(intl.recurring).length }; };
  const repeatBox = `[...document.querySelectorAll('[role=dialog] label')].find(l => l.textContent.startsWith('Repeat every month')).querySelector('input')`;
  await t(`__t.click(/^\\+ New invoice$/)`); await opened();
  await t(`__t.set('ws-client', 'Globex LLC'), __t.set('ws-amount', '25000'), __t.set('ws-number', 'MON-X')`);
  await t(`${repeatBox}.click(), true`);
  await sleep(100);
  check("a same-currency monthly billing shows no overlap warning", !(await b.eval("!!document.querySelector('[data-plan-overlap]')")));
  await t(`__t.set('ws-currency', 'INR')`);
  await sleep(100);
  const stopFirst = `Globex LLC already has monthly billing in USD with no end month. Stop it first (Clients → Monthly billing → Stop after this month), then date this invoice in ${await monthName(1)}.`;
  check("a monthly billing in ₹ alongside an open-ended US$ plan says to stop that plan first", (await overlapText()) === stopFirst, await overlapText());
  check("the message describes the invoice date field", await b.eval("document.getElementById('ws-issue').getAttribute('aria-describedby') === 'ws-plan-overlap' && document.getElementById('ws-issue').getAttribute('aria-invalid') === 'true'"));
  await t(`__t.set('ws-issue', '${await iso(400)}'), __t.set('ws-due', '${await iso(415)}')`);
  await sleep(100);
  // Review round 3: a start two or more months ahead. Stopping the US$ plan now would leave the months between billed in
  // neither currency, so the advice is to stop it in the month before, or to start next month.
  const later = `Globex LLC already has monthly billing in USD with no end month. To switch in ${await monthOfIso(await iso(400), 0)}, stop it during ${await monthOfIso(await iso(400), -1)} (Clients → Monthly billing → Stop after this month) and add this invoice then, or stop it now and date this invoice in ${await monthName(1)}.`;
  check("a later date doesn't clear an open-ended plan's overlap, and the advice leaves no month unbilled", (await overlapText()) === later, await overlapText());
  const before = await sidecarCounts();
  await t(`__t.click(/^Add invoice$/, __t.dialog())`);
  await sleep(200);
  check("Add invoice is refused while the overlap shows: nothing saved, focus on the invoice date", (await b.eval("!!document.querySelector('[role=dialog]')"))
    && JSON.stringify(await sidecarCounts()) === JSON.stringify(before) && (await b.eval("document.activeElement?.id")) === "ws-issue", JSON.stringify({ before, after: await sidecarCounts() }));
  // A backdated ₹ plan: the US$ plan starts later, so ending the new one before it is the fix (round 2, case A).
  await t(`__t.set('ws-issue', '${await iso(-62)}'), __t.set('ws-due', '${await iso(-55)}')`);
  await sleep(100);
  check("a backdated plan is told to end before the US$ plan starts", (await overlapText()) === `Globex LLC's monthly billing in USD starts in ${await monthName(0)}. Set the last month to bill before ${await monthName(0)} so no month is billed twice.`
    && await b.eval("document.getElementById('ws-until').getAttribute('aria-describedby') === 'ws-plan-overlap' && !document.getElementById('ws-issue').hasAttribute('aria-describedby')"), await overlapText());
  await t(`__t.set('ws-until', (() => { const d = new Date(); const m = new Date(d.getFullYear(), d.getMonth() - 1, 1); return m.getFullYear() + '-' + String(m.getMonth() + 1).padStart(2, '0'); })())`);
  await sleep(100);
  check("ending the backdated plan the month before clears it", !(await b.eval("!!document.querySelector('[data-plan-overlap]')")), await overlapText());
  await esc(); await closed();
  // The check uses the client the save would use: another spelling with Globex's number is still Globex (round 2).
  await t(`__t.click(/^\\+ New invoice$/)`); await opened();
  await t(`__t.set('ws-client', 'Globex Inc'), __t.set('ws-phone', '+1 415 555 0100'), __t.set('ws-amount', '25000'), __t.set('ws-number', 'MON-Y'), __t.set('ws-currency', 'INR')`);
  await t(`${repeatBox}.click(), true`);
  await sleep(100);
  check("a client matched by phone is checked too", (await overlapText()) === stopFirst, await overlapText());
  await esc(); await closed();

  // A client whose only record is a foreign monthly plan (its invoice deleted): removable once the plan is deleted
  // (review round 1; "Stop after this month" leaves the plan live).
  {
    const planRow = (name) => `[...document.querySelectorAll('section[aria-labelledby=monthly-title] li')].find((li) => li.textContent.includes(${JSON.stringify(name)}))`;
    await t(`__t.click(/^\\+ New invoice$/)`); await opened();
    await t(`__t.set('ws-client', 'Plan Only Co'), __t.set('ws-currency', 'USD'), __t.set('ws-amount', '80'), __t.set('ws-number', 'PLAN-1'), __t.set('ws-due', '${await iso(20)}')`);
    await t(`[...document.querySelectorAll('[role=dialog] label')].find(l => l.textContent.startsWith('Repeat every month')).querySelector('input').click(), true`);
    await t(`__t.click(/^Add invoice$/, __t.dialog())`);
    await closed();
    // Stopped after this month: a ₹ plan dated this month is told the first free month; dated then, it's allowed (round 2).
    await tab("Clients");
    await t(`__t.click(/^Stop after this month$/, ${planRow("Plan Only Co")})`);
    await sleep(100);
    await t(`__t.click(/^\\+ New invoice$/)`); await opened();
    await t(`__t.set('ws-client', 'Plan Only Co'), __t.set('ws-currency', 'INR'), __t.set('ws-amount', '5000'), __t.set('ws-number', 'PLAN-2')`);
    await t(`${repeatBox}.click(), true`);
    await sleep(100);
    check("a stopped plan's overlap names its last month and the first free one", (await overlapText()) === `Plan Only Co already has monthly billing in USD until ${await monthName(0)}. Date this invoice in ${await monthName(1)} or later so no month is billed twice.`, await overlapText());
    await t(`__t.set('ws-issue', (() => { const d = new Date(); const m = new Date(d.getFullYear(), d.getMonth() + 1, 5); return m.getFullYear() + '-' + String(m.getMonth() + 1).padStart(2, '0') + '-05'; })()), __t.set('ws-due', (() => { const d = new Date(); const m = new Date(d.getFullYear(), d.getMonth() + 1, 20); return m.getFullYear() + '-' + String(m.getMonth() + 1).padStart(2, '0') + '-20'; })())`);
    await sleep(100);
    check("dated in the first free month, the overlap clears", !(await b.eval("!!document.querySelector('[data-plan-overlap]')")), await overlapText());
    await esc(); await closed();
    await tab("Invoices");
    await t(`__t.click(/^all$/)`);
    await openRow("PLAN-1");
    await t(`__t.click(/^Delete$/)`);
    await t(`__t.click(/^Delete$/)`);
    await sleep(200);
    await tab("Clients");
    check("a foreign plan row offers Delete monthly billing", (await b.eval(`${planRow("Plan Only Co")}?.querySelector('[data-plan-delete]')?.textContent`)) === "Delete monthly billing");
    await t(`document.querySelector('button[aria-label="Edit Plan Only Co"]').click(), true`); await opened();
    check("a client with only a foreign plan can't be removed, and is told how", /delete the monthly billing first/.test(await dialogText()) && !(await b.eval("!!__t.btn(/^Remove client$/, __t.dialog())")), await dialogText());
    await esc(); await closed();
    await b.eval(`${planRow("Plan Only Co")}.querySelector('[data-plan-delete]').click(), true`);
    await sleep(100);
    check("deleting a plan asks first", /Delete for good\?/.test(await b.eval(`${planRow("Plan Only Co")}.innerText`)));
    // Review round 4 (spec §5.9): no button whose whole text is "Delete" (cdp-lib clicks the first such button).
    const planButtons = await b.eval(`({ open: ${planRow("Plan Only Co")}.querySelector('[data-plan-delete]')?.textContent ?? null, confirm: ${planRow("Plan Only Co")}.querySelector('[data-plan-delete-confirm]')?.textContent,
      bare: [...document.querySelectorAll('section[aria-labelledby=monthly-title] button')].some((x) => x.textContent.trim() === 'Delete') })`);
    check("the plan's delete buttons say what they delete", planButtons.confirm === "Delete billing" && !planButtons.bare, JSON.stringify(planButtons));
    // Review round 2: keyboard focus follows the confirm, and Keep hands it back to Delete (never <body>). Review round 3:
    // focus lands on Keep, the safe choice, so a held Enter can't delete the plan.
    check("the confirm takes focus on Keep", await b.eval("document.activeElement?.hasAttribute('data-plan-delete-keep')"));
    await t(`__t.click(/^Keep$/, ${planRow("Plan Only Co")})`);
    await sleep(100);
    check("Keep returns focus to that plan's Delete", await b.eval(`document.activeElement === ${planRow("Plan Only Co")}?.querySelector('[data-plan-delete]')`));
    // Holding Enter on Delete: the press opens the confirm, the auto-repeat lands on Keep. The plan stays.
    const enter = (type, autoRepeat = false) => b.send("Input.dispatchKeyEvent", { type, key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, autoRepeat, ...(type === "keyDown" ? { text: "\r" } : {}) });
    await enter("keyDown"); await sleep(80);
    const afterPress = await b.eval("document.activeElement?.hasAttribute('data-plan-delete-keep')");
    await enter("keyDown", true); await sleep(80); await enter("keyUp"); await sleep(200);
    const heldPlan = Object.values(JSON.parse(await sidecar()).intl.recurring).filter((p) => p.amountPaise === 8000);
    check("a held Enter on Delete never deletes the plan", afterPress && heldPlan.length === 1 && !heldPlan[0].deletedAt && !/Monthly billing deleted/.test(await text()), JSON.stringify({ afterPress, heldPlan }));
    if (await b.eval(`!!${planRow("Plan Only Co")}?.querySelector('[data-plan-delete-confirm]')`)) await t(`__t.click(/^Keep$/, ${planRow("Plan Only Co")})`);
    await sleep(100);
    await b.eval(`${planRow("Plan Only Co")}.querySelector('[data-plan-delete]').click(), true`);
    await sleep(100);
    await t(`__t.btn(/^Delete billing$/, ${planRow("Plan Only Co")}).focus(), true`);
    await enter("keyDown"); await enter("keyUp");
    await sleep(200);
    // Review round 5: the row unmounts, so focus moves to the next plan's first button (Globex's), never <body>.
    const afterConfirm = await b.eval("({ tag: document.activeElement?.tagName, row: document.activeElement?.closest('[data-plan-row]')?.textContent.includes('Globex LLC') ?? false })");
    check("the delete confirm moves focus to the next plan, not <body>", afterConfirm.tag === "BUTTON" && afterConfirm.row, JSON.stringify(afterConfirm));
    const planGone = Object.values(JSON.parse(await sidecar()).intl.recurring).filter((p) => p.amountPaise === 8000);
    check("the plan is deleted (a tombstone in the sidecar) and leaves the list", planGone.length === 1 && !!planGone[0].deletedAt && !(await b.eval(`!!${planRow("Plan Only Co")}`))
      && /Monthly billing deleted\. Existing invoices stay\./.test(await text()) && /Globex LLC · US\$300\.00/.test(await text()), JSON.stringify(planGone));
    await t(`document.querySelector('button[aria-label="Edit Plan Only Co"]').click(), true`); await opened();
    await t(`__t.click(/^Remove client$/, __t.dialog())`);
    await closed();
    const removed = Object.values(JSON.parse(await book()).clients).find((c) => c.name === "Plan Only Co");
    check("…and then the client can be removed", !!removed?.deletedAt && !(await clientRow("Plan Only Co")), JSON.stringify(removed));
  }

  // An existing invoice (a plan month, an unpaid one, a paid one): the currency is text with the note, never a select.
  const NOTE = "The currency can't be changed. To bill in another currency, delete this invoice and create a new one.";
  const fixedCurrency = () => b.eval("({ select: !!document.getElementById('ws-currency'), text: document.getElementById('ws-currency-fixed')?.textContent ?? null, note: document.getElementById('ws-currency-note')?.textContent.trim() ?? null, describedBy: document.getElementById('ws-amount')?.getAttribute('aria-describedby') })");
  await tab("Invoices");
  await t(`__t.click(/^all$/)`);
  for (const [needle, shown] of [["MON-1", "USD (US$)"], ["Acme GmbH", "EUR (€)"], ["US$1,200.50", "USD (US$)"]]) {
    await openRow(needle);
    await t(`__t.click(/^Edit$/)`); await opened();
    const f = await fixedCurrency();
    check(`${needle}: the currency is read-only text with the note`, !f.select && f.text === shown && f.note === NOTE && f.describedBy === "ws-currency-note", JSON.stringify(f));
    if (needle === "Acme GmbH") {
      check("the edit sheet shows the amount in euros", (await value("ws-amount")) === "750.00" && /Amount \(EUR\)/.test(await dialogText()));
      await b.shot("cur-04-fixed-currency.png");
      // Saving an edit keeps the invoice, its id and its currency.
      const before = Object.values(JSON.parse(await sidecar()).intl.invoices).filter((i) => i.number === "INV-0004" && !i.deletedAt);
      await t(`__t.set('ws-desc', 'Design sprint'), __t.click(/^Save changes$/, __t.dialog())`);
      await closed();
      const after = Object.values(JSON.parse(await sidecar()).intl.invoices).filter((i) => i.number === "INV-0004");
      check("an edit keeps the id and the currency", before.length === 1 && after.length === 1 && after[0].id === before[0].id && after[0].currency === "EUR" && after[0].amountPaise === 75000
        && after[0].description === "Design sprint" && !after[0].deletedAt, JSON.stringify(after));
      continue;
    }
    await esc(); await closed();
  }

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
  // Review round 3: a bad figure marks the input invalid and points it at the message, as the payment sheet does.
  await t(`__t.set(document.querySelector('[id^=ws-credit-]').id, 'abc'), __t.click(/^Add INR credited$/, document.querySelector('[id^=ws-credit-]').form)`);
  await sleep(100);
  const creditErr = await b.eval("(() => { const i = document.querySelector('[id^=ws-credit-]'); const d = i?.getAttribute('aria-describedby'); return { invalid: i?.getAttribute('aria-invalid'), message: d ? document.getElementById(d)?.textContent : null }; })()");
  check("the inline INR credited error is linked to its input", creditErr.invalid === "true" && creditErr.message === "Enter an amount like 1500 or 1500.50.", JSON.stringify(creditErr));
  await t(`__t.set(document.querySelector('[id^=ws-credit-]').id, '80,000'), __t.click(/^Add INR credited$/)`);
  await sleep(200);
  check("payment line shows the ₹ added later", /€750\.00 · BANK[\s\S]*WISE-9001 · ₹80,000 credited/.test(await text()));
  check("after the save, focus is on that payment's INR credited button, not the page", await b.eval("document.activeElement?.hasAttribute('data-credit-open') && document.activeElement.textContent === 'Change'"));
  const creditedOf = async () => Object.values(JSON.parse(await sidecar()).intl.invoices).flatMap((i) => i.deletedAt ? [] : i.payments).find((p) => p.reference === "WISE-9001");
  check("INR credited stored on the foreign payment in the sidecar", (await creditedOf())?.inrCreditedPaise === 8_000_000);
  // Review round 2 (spec §3.5, "editable later from the payment row"): a saved figure can be corrected or removed.
  await t(`__t.click(/^Change$/)`);
  await sleep(100);
  check("Change opens the form filled with the saved figure", (await b.eval("document.querySelector('[id^=ws-credit-]')?.value")) === "80000.00" && await b.eval("document.activeElement?.id?.startsWith('ws-credit-')"));
  await t(`__t.set(document.querySelector('[id^=ws-credit-]').id, '8,000'), __t.click(/^Save INR credited$/, document.querySelector('[id^=ws-credit-]').form)`);
  await sleep(200);
  check("a second save overwrites the figure", /WISE-9001 · ₹8,000 credited/.test(await text()) && (await creditedOf())?.inrCreditedPaise === 800_000);
  await t(`__t.click(/^Change$/)`);
  await sleep(100);
  await t(`__t.set(document.querySelector('[id^=ws-credit-]').id, ''), __t.click(/^Save INR credited$/, document.querySelector('[id^=ws-credit-]').form)`);
  await sleep(200);
  const removedCredit = await creditedOf();
  check("an emptied figure is removed (no key, never 0)", removedCredit && !("inrCreditedPaise" in removedCredit) && !!(await t("!!__t.btn(/^Add INR credited$/)")), JSON.stringify(removedCredit));
  await t(`__t.click(/^Add INR credited$/)`);
  await sleep(100);
  await t(`__t.set(document.querySelector('[id^=ws-credit-]').id, '80,000'), __t.click(/^Add INR credited$/, document.querySelector('[id^=ws-credit-]').form)`);
  await sleep(200);
  check("…and can be added again", (await creditedOf())?.inrCreditedPaise === 8_000_000);
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

  // The LUT stays stored when the business GSTIN is cleared, but nothing offers or reports it without one (§0, §6).
  await tab("Settings");
  await t(`__t.set('ws-s-gstin', ''), __t.click(/^Save settings$/)`);
  await sleep(300);
  await openSettingsCard();
  await sleep(150);
  check("no GSTIN: no expired-LUT notice in the card", JSON.parse(await sidecar()).intl.settings.exportUnderLut === true && !/has expired/.test(await text()));
  await t(`__t.click(/^\\+ New invoice$/)`); await opened();
  await t(`__t.set('ws-client', 'Globex LLC'), __t.set('ws-currency', 'USD')`);
  await sleep(100);
  check("no GSTIN: a USD invoice offers no export choice", !(await exists("ws-export-lut")));
  await esc(); await closed();
  await tab("Invoices");
  await t(`__t.click(/^unpaid$/)`);
  await openRow("US$500.00");
  await t(`__t.click(/^Remind$/)`); await b.waitFor("!!document.getElementById('ws-reminder')");
  check("no GSTIN: the reminder reports no expired LUT", !/has expired/.test(await dialogText()));
  await esc(); await closed();
  await tab("Settings");
  await t(`__t.set('ws-s-gstin', '27AAAPL1234C1Z5'), __t.click(/^Save settings$/)`);
  await sleep(300);

  // A foreign invoice saved with the LUT off is never marked, and an edit with the LUT off keeps an existing mark.
  await openSettingsCard();
  await sleep(150);
  await t(`document.getElementById('ws-intl-lut').click(), __t.click(/^Save payment details$/)`);
  await sleep(300);
  check("LUT turned off", JSON.parse(await sidecar()).intl.settings.exportUnderLut === false);
  await t(`__t.click(/^\\+ New invoice$/)`); await opened();
  await t(`__t.set('ws-client', 'Globex LLC'), __t.set('ws-amount', '40'), __t.set('ws-number', 'NOLUT-1'), __t.set('ws-due', '${await iso(20)}')`);
  await sleep(100);
  check("LUT off: no export choice on a USD invoice", (await value("ws-currency")) === "USD" && !(await exists("ws-export-lut")));
  await t(`__t.click(/^Add invoice$/, __t.dialog())`);
  await closed();
  const sideInvoices = async () => Object.values(JSON.parse(await sidecar()).intl.invoices).filter((i) => !i.deletedAt);
  const noLut = (await sideInvoices()).find((i) => i.number === "NOLUT-1");
  check("LUT off: the new USD invoice is stored without the export mark", noLut && noLut.currency === "USD" && !("exportLut" in noLut), JSON.stringify(noLut));
  // (The paid US$1,200.50 invoice: INV-0003, the US$500 one, shares its number with the old tab's ₹ invoice, so its
  // edit would stop at the duplicate-number check.)
  const markedBefore = (await sideInvoices()).find((i) => i.currency === "USD" && i.amountPaise === 120050);
  await tab("Invoices");
  await t(`__t.click(/^all$/)`);
  await openRow("US$1,200.50");
  await t(`__t.click(/^Edit$/)`); await opened();
  await t(`__t.set('ws-desc', 'Edited with the LUT off'), __t.click(/^Save changes$/, __t.dialog())`);
  await closed();
  const markedAfter = (await sideInvoices()).find((i) => i.id === markedBefore?.id);
  check("LUT off: an edit keeps the invoice's export mark", markedBefore?.exportLut === true && markedAfter?.exportLut === true && markedAfter.description === "Edited with the LUT off", JSON.stringify(markedAfter));
  // The LUT back on (this year's): the unmarked invoice still has no export line; the marked one has it.
  await tab("Settings");
  await openSettingsCard();
  await sleep(150);
  await t(`document.getElementById('ws-intl-lut').click(), true`);
  await sleep(100);
  await t(`__t.set('ws-intl-lut-arn', 'AD2704260012345'), __t.set('ws-intl-lut-fy', '${fy}'), __t.click(/^Save payment details$/)`);
  await sleep(300);
  check("LUT back on for this year", JSON.parse(await sidecar()).intl.settings.lutFy === fy && !/has expired/.test(await text()));
  await tab("Invoices");
  await t(`__t.click(/^all$/)`);
  await openRow("NOLUT-1");
  await t(`__t.click(/^Remind$/)`); await b.waitFor("!!document.getElementById('ws-reminder')");
  check("an invoice saved with the LUT off gets no export line later", /US\$40\.00/.test(await value("ws-reminder")) && !(await value("ws-reminder")).includes("SUPPLY MEANT"), await value("ws-reminder"));
  await esc(); await closed();
  await openRow("US$500.00");
  await t(`__t.click(/^Remind$/)`); await b.waitFor("!!document.getElementById('ws-reminder')");
  check("…while the marked one has it", (await value("ws-reminder")).includes("SUPPLY MEANT") && !/has expired/.test(await dialogText()), await value("ws-reminder"));
  await esc(); await closed();

  // The Invoices badge counts every overdue invoice, foreign ones too (only the KPI cells stay ₹).
  await t(`__t.click(/^overdue$/)`); await sleep(200);
  const overdueCount = await b.eval("[...document.querySelectorAll('li [aria-expanded]')].filter((r) => /\\bOverdue\\b/.test(r.innerText)).length");
  const foreignOverdue = await b.eval("[...document.querySelectorAll('li [aria-expanded]')].some((r) => /\\bOverdue\\b/.test(r.innerText) && /US\\$/.test(r.innerText))");
  const badge = await b.eval("[...document.querySelectorAll('nav[aria-label=\"Workspace sections\"] button')].find((x) => /^Invoices/.test(x.textContent.trim()))?.querySelector('span.ml-auto')?.textContent ?? '0'");
  check("the Invoices badge equals the rows marked Overdue, a US$ one included", foreignOverdue && Number(badge) === overdueCount, `badge ${badge}, rows ${overdueCount}`);
  await t(`__t.click(/^unpaid$/)`); await sleep(150);

  // An edit saved after another tab deleted the record (sheet still open) brings it back with the edits: a foreign
  // invoice (in its own currency), an INR invoice, and a client (review round 4; the sheets use withoutTombstone).
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
    await t(`__t.set('ws-amount', '150'), __t.click(/^Save changes$/, __t.dialog())`);
    await closed();
    const tomb = await live("TOMB-1");
    check("a foreign invoice deleted in another tab comes back with the edits, in its own currency", tomb.length === 1 && tomb[0].id === tombId && !tomb[0].deletedAt
      && `${tomb[0].currency} ${tomb[0].amountPaise}` === "USD 15000" && /TOMB-1[\s\S]*US\$150\.00/.test(await text()), JSON.stringify(tomb.map((i) => [i.id, i.currency, i.amountPaise, i.deletedAt])));

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

    // A bad "INR credited" value is reported under that field, not as a sheet-level line.
    await tab("Invoices");
    await t(`__t.click(/^all$/)`);
    await openRow("TOMB-1");
    await t(`__t.click(/^Record payment$/)`); await opened();
    await t(`__t.set('ws-pay-ref', 'WISE-REF-123456'), __t.set('ws-pay-inr', 'abc'), __t.click(/^Save payment$/, __t.dialog())`);
    await sleep(150);
    const credErr = await b.eval(`({ under: document.getElementById('ws-pay-inr')?.parentElement?.querySelector('[role=alert]')?.textContent || '', alerts: document.querySelectorAll('[role=dialog] [role=alert]').length, invalid: document.getElementById('ws-pay-inr')?.getAttribute('aria-invalid'),
      described: (document.getElementById('ws-pay-inr')?.getAttribute('aria-describedby') || '').split(' ').map((id) => document.getElementById(id)?.textContent ?? '?'), focus: document.activeElement?.id })`);
    check("a bad INR credited value shows its error under that field", credErr.under === "Enter an amount like 1500 or 1500.50." && credErr.alerts === 1 && credErr.invalid === "true", JSON.stringify(credErr));
    // Review round 4: the field points at its error and its hint, and takes focus.
    check("…the INR credited field is described by its error and hint, and focused", credErr.focus === "ws-pay-inr" && credErr.described.length === 2
      && credErr.described[0] === "Enter an amount like 1500 or 1500.50." && /^The rupees your bank credited/.test(credErr.described[1]), JSON.stringify(credErr));
    await b.shot("cur-credited-error.png");
    await t(`__t.set('ws-pay-inr', ''), __t.click(/^Save payment$/, __t.dialog())`);
    await closed();
    await openRow("TOMB-1");
    await sleep(150);
    const wideLine = await b.eval("(() => { const open = document.querySelector('[data-credit-open]'); const text = open?.closest('li')?.firstElementChild?.firstElementChild; return open && text ? Math.abs(open.getBoundingClientRect().top - text.getBoundingClientRect().top) < 4 : null; })()");
    check("desktop: the payment line keeps its actions on the same line", wideLine === true, String(wideLine));
    await b.shot("cur-payment-line.png");
  }

  // Review round 4 (§3.8, §5.4): an INR invoice to a client billed in GBP still sends to their + number as typed.
  await t(`__t.click(/^\\+ New invoice$/)`); await opened();
  await t(`__t.set('ws-client', 'Kensington Ltd')`);
  await sleep(100);
  await t(`__t.set('ws-currency', 'INR'), __t.set('ws-amount', '900'), __t.set('ws-number', 'KEN-1'), __t.set('ws-due', '${await iso(20)}'), __t.click(/^Add invoice$/, __t.dialog())`);
  await closed();
  await t(`__t.click(/^all$/)`);
  await openRow("KEN-1");
  await t(`__t.click(/^Remind$/)`); await b.waitFor("!!document.getElementById('ws-reminder')");
  check("an INR reminder to a GBP client is in rupees", /₹900/.test(await value("ws-reminder")), await value("ws-reminder"));
  await t(`__t.click(/^WhatsApp$/, __t.dialog())`);
  const kenWa = await b.eval("window.__opened.at(-1)");
  check("INR invoice, GBP client: WhatsApp goes to the + number as typed", kenWa?.startsWith("https://wa.me/44207946?text="), kenWa);
  await t(`__t.click(/^SMS$/, __t.dialog())`);
  const kenSms = await b.eval("window.__opened.at(-1)");
  check("INR invoice, GBP client: SMS goes to +44, never +91", kenSms?.startsWith("sms:+44207946?body="), kenSms);
  await esc(); await closed();

  // Review round 4 (§5.7): the Amount cell names the currency when the symbol doesn't (US$ → "· USD"; AED already does).
  const amountCell = () => b.eval(`(() => { const r = [...document.querySelectorAll('li [aria-expanded=true]')][0]?.closest('li'); const dt = [...(r?.querySelectorAll('dt') ?? [])].find((x) => x.textContent === 'Amount');
    return dt?.nextElementSibling?.textContent.replace(/\\u00a0/g, ' ') ?? null; })()`); // en-GB puts a no-break space after AED
  await openRow("US$1,200.50");
  check("USD invoice: the Amount cell reads US$1,200.50 · USD", (await amountCell()) === "US$1,200.50 · USD", await amountCell());
  await t(`__t.click(/^\\+ New invoice$/)`); await opened();
  await t(`__t.set('ws-client', 'Dubai Traders'), __t.set('ws-currency', 'AED'), __t.set('ws-amount', '1200'), __t.set('ws-number', 'AED-1'), __t.set('ws-due', '${await iso(20)}'), __t.click(/^Add invoice$/, __t.dialog())`);
  await closed();
  await openRow("AED-1");
  check("AED invoice: the Amount cell reads AED 1,200.00 with no repeated code", (await amountCell()) === "AED 1,200.00", await amountCell());
  await openRow("Rohan Mehta");
  check("INR invoice: the Amount cell has no currency code", (await amountCell()) === "₹10,000", await amountCell());

  // Review round 4: the client sheet's + hint is tied to the phone field.
  await tab("Clients");
  await t(`__t.click(/^\\+ Add client$/)`); await opened();
  const phoneHint = await b.eval("(() => { const d = document.getElementById('ws-c-phone').getAttribute('aria-describedby'); return d ? document.getElementById(d)?.textContent : null; })()");
  check("client sheet: the phone field is described by its + hint", phoneHint === "For clients abroad, start the number with + and the country code.", phoneHint);
  await esc(); await closed();
  await tab("Invoices");

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
  // 390px (review round 2): a chase row in a book with foreign invoices puts the invoice number on the due line (the
  // name line truncates), and the Clients abroad line puts the overdue amount on its own line with no separator.
  await tab("Overview");
  const chaseLayout = () => b.eval(`(() => { const li = [...document.querySelectorAll('section[aria-labelledby=chase-title] li')].find((x) => /US\\$/.test(x.textContent)); if (!li) return null;
    const [name, due] = li.querySelectorAll('p'); const num = due.querySelector('[data-chase-number]');
    return { nameHasNumber: name.textContent.includes('·'), numberShown: !!num && num.getClientRects().length > 0 && /^\\S+ · $/.test(num.textContent) }; })()`);
  const chase390 = await chaseLayout();
  check("390px: a foreign chase row shows its invoice number on the due line, not in the name line", chase390?.numberShown && !chase390.nameHasNumber, JSON.stringify(chase390));
  const abroadLine = await b.eval(`(() => { const p = [...document.querySelectorAll('[aria-label="Clients abroad"] p')].find((x) => /overdue/.test(x.textContent)); if (!p) return null;
    const [collect, overdue] = p.children; return { under: overdue.getBoundingClientRect().top >= collect.getBoundingClientRect().bottom - 1, lines: p.innerText.split('\\n').map((l) => l.trim()) }; })()`);
  check("390px: Clients abroad puts the overdue amount on its own line, no line starts with '·'", abroadLine?.under && abroadLine.lines.every((l) => !l.startsWith("·")), JSON.stringify(abroadLine));
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
  // 390px (review round 5): an invalid Clients abroad save brings the first invalid field into view and focuses it.
  await tab("Settings");
  await openSettingsCard();
  await sleep(150);
  await t(`__t.set('ws-intl-swift', 'AB')`);
  await b.eval("__t.btn(/^Save payment details$/).scrollIntoView({ block: 'center' }), __t.btn(/^Save payment details$/).click(), true");
  // The page scrolls smoothly (html { scroll-behavior: smooth }), so wait for the scroll to land rather than a fixed time.
  const inView = await b.waitFor("(() => { const r = document.getElementById('ws-intl-swift').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; })()", 3000);
  check("390px: an invalid save focuses the first invalid field and brings it into view", (await focused()) === "ws-intl-swift" && inView, `${await focused()} ${inView}`);
  await t(`__t.set('ws-intl-swift', 'HDFCINBB')`);
  await tab("Invoices");
  await openRow("Globex");
  await t(`__t.click(/^Edit$/)`); await opened();
  check("no horizontal scroll at 390px: invoice sheet", await noScroll());
  const fixedBox = await b.eval("(() => { const a = document.getElementById('ws-amount').getBoundingClientRect(), c = document.getElementById('ws-currency-fixed').getBoundingClientRect(); return { sameRow: Math.abs(a.top - c.top) < 2, sameHeight: Math.abs(a.height - c.height) < 2 }; })()");
  check("390px: the read-only currency sits next to the amount, at the input's height", fixedBox.sameRow && fixedBox.sameHeight, JSON.stringify(fixedBox));
  await b.shot("cur-m-sheet.png");
  await esc(); await closed();
  await t(`__t.click(/^\\+ New invoice$/)`); await opened();
  check("no horizontal scroll at 390px: new invoice sheet with the currency select", await noScroll() && await exists("ws-currency"));
  await b.shot("cur-m-new-sheet.png");
  await esc(); await closed();
  await b.mobile(false);
  await sleep(300);
  await tab("Overview");
  const chaseWide = await chaseLayout();
  check("1280px: the foreign chase row keeps the invoice number on the due line too", chaseWide?.numberShown && !chaseWide.nameHasNumber, JSON.stringify(chaseWide));

  // Review round 5: a book that holds only foreign invoices, both paid with no INR credited, and one paused US$ plan.
  // The invoice counts (sync panel, backup nudge, checklist) see its invoices; Clients abroad has nothing to show; and
  // deleting the only plan moves focus to "+ Add client" (the Monthly billing section unmounts).
  {
    const T = Date.now();
    const [issued, due, paidOn] = [await iso(-30), await iso(-15), await iso(-20)];
    const usd = (id, number) => ({ id, number, clientId: "cli_north001", issueDate: issued, dueDate: due, amountPaise: 50000, description: "", currency: "USD", reminders: [], voided: false, createdAt: T, updatedAt: T,
      payments: [{ id: `pay_${id.slice(4)}`, amountPaise: 50000, date: paidOn, mode: "bank", reference: "WISE-1", createdAt: T }] });
    const plan = { id: "rec_north001", clientId: "cli_north001", amountPaise: 50000, description: "", dayOfMonth: 1, dueAfterDays: 15, startMonth: issued.slice(0, 7), endMonth: "", paused: true, currency: "USD", createdAt: T, updatedAt: T };
    const bookJson = { version: 1, business: { name: "Northwind Studio", upiId: "north@okaxis", phone: "", gstin: "", invoicePrefix: "NW-", updatedAt: T },
      clients: { cli_north001: { id: "cli_north001", name: "Northwind Inc", phone: "", email: "", gstin: "", createdAt: T, updatedAt: T } }, invoices: {}, recurring: {} };
    const intl = { invoices: { inv_north001: usd("inv_north001", "NW-1"), inv_north002: usd("inv_north002", "NW-2") }, recurring: { rec_north001: plan }, clients: { cli_north001: { currency: "USD", updatedAt: T } } };
    await b.eval(`localStorage.clear(); localStorage.setItem('proupiqr-workspace-v1', ${JSON.stringify(JSON.stringify(bookJson))});
      localStorage.setItem('proupiqr-intl-v1:biz_primary', ${JSON.stringify(JSON.stringify({ owner: null, intl }))}); true`);
    await b.go(BASE + "/app/", 2500);
    await b.waitFor("/Northwind Studio/.test(document.body.innerText)", 8000);
    await tab("Overview");
    page = await text();
    check("foreign-only book: the backup nudge counts its invoices", /Keep these 2 invoices safe/.test(page), page.slice(0, 600));
    const steps = await b.eval(`(() => { const s = document.querySelector('section[aria-labelledby=getting-started-title]'); if (!s) return null;
      const done = (label) => [...s.querySelectorAll('li')].some((li) => li.textContent === label && !li.querySelector('button'));
      return { invoice: done("Add an invoice you're waiting on"), payment: done("Record a payment you received") }; })()`);
    check("foreign-only book: the checklist's invoice and payment steps are done", steps?.invoice && steps.payment, JSON.stringify(steps));
    check("all foreign invoices paid, no INR credited: no Clients abroad section", !(await b.eval("!!document.querySelector('[aria-label=\"Clients abroad\"]')")));
    await tab("Settings");
    check("foreign-only book: the sync panel counts its invoices", /Your 2 invoices on this device are uploaded when you sign in/.test(await text()));
    await tab("Clients");
    await b.eval("document.querySelector('[data-plan-delete]').click(), true");
    await sleep(100);
    await t(`__t.btn(/^Delete billing$/).focus(), true`);
    const enterKey = (type) => b.send("Input.dispatchKeyEvent", { type, key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, ...(type === "keyDown" ? { text: "\r" } : {}) });
    await enterKey("keyDown"); await enterKey("keyUp");
    await sleep(200);
    const lastPlan = await b.eval("({ section: !!document.querySelector('section[aria-labelledby=monthly-title]'), addClient: document.activeElement?.hasAttribute('data-add-client') ?? false })");
    check("deleting the last plan moves focus to + Add client, not <body>", !lastPlan.section && lastPlan.addClient, JSON.stringify(lastPlan));
  }

  // Review round 3 (PR 5): a US$ plan that starts in two months (its first invoice created with it, as the sheet does).
  // The advice for a ₹ plan never leaves a month billed twice or in neither currency, "Stop after this month" on it
  // reads "ended" at once, and the month it already billed still blocks a ₹ plan. At 390px and 1280px.
  for (const mobile of [true, false]) {
    await b.mobile(mobile);
    const T = Date.now();
    const ym = (delta) => b.eval(`(() => { const d = new Date(); const m = new Date(d.getFullYear(), d.getMonth() + (${delta}), 1); return m.getFullYear() + '-' + String(m.getMonth() + 1).padStart(2, '0'); })()`);
    const name = (delta) => monthName(delta);
    const start = await ym(2);
    const usdId = `inv_fut00001M${start.replace("-", "")}`;
    const intl = {
      settings: { on: true, updatedAt: T },
      invoices: { [usdId]: { id: usdId, number: "FUT-1", clientId: "cli_fut00001", issueDate: `${start}-01`, dueDate: `${start}-15`, amountPaise: 30000, description: "", currency: "USD", payments: [], reminders: [], voided: false, recurringId: "rec_fut00001", createdAt: T, updatedAt: T } },
      recurring: { rec_fut00001: { id: "rec_fut00001", clientId: "cli_fut00001", amountPaise: 30000, description: "", dayOfMonth: 1, dueAfterDays: 14, startMonth: start, endMonth: "", paused: false, currency: "USD", createdAt: T, updatedAt: T },
        // Review round 4: billing that starts later and has an end month ("from {month} to {last}").
        rec_lat00001: { id: "rec_lat00001", clientId: "cli_lat00001", amountPaise: 30000, description: "", dayOfMonth: 1, dueAfterDays: 14, startMonth: start, endMonth: await ym(3), paused: false, currency: "USD", createdAt: T, updatedAt: T } },
      clients: { cli_fut00001: { currency: "USD", updatedAt: T }, cli_lat00001: { currency: "USD", updatedAt: T } },
    };
    // Review round 5: invoices left by deleted US$ plans. Old Co has three (none paid), Paid Co two (one with a payment).
    const leftover = (plan, client, number, delta, paid) => ym(delta).then((m) => {
      const id = `inv_${plan}M${m.replace("-", "")}`;
      intl.invoices[id] = { id, number, clientId: client, issueDate: `${m}-01`, dueDate: `${m}-15`, amountPaise: 30000, description: "", currency: "USD",
        payments: paid ? [{ id: "pay_r5paid001", amountPaise: 10000, date: `${m}-10`, mode: "bank", reference: "WISE-1", createdAt: T }] : [], reminders: [], voided: false, recurringId: `rec_${plan}`, createdAt: T, updatedAt: T };
    });
    for (const [n, delta] of [[1, -3], [2, -2], [3, -1]]) await leftover("old00001", "cli_old00001", `OLD-${n}`, delta, false);
    for (const [n, delta] of [[1, -2], [2, -1]]) await leftover("pd000001", "cli_pd000001", `PD-${n}`, delta, n === 2);
    const bookJson = { version: 1, business: { name: "Future Studio", upiId: "future@okaxis", phone: "", gstin: "", invoicePrefix: "FS-", updatedAt: T },
      clients: { cli_fut00001: { id: "cli_fut00001", name: "Future Co", phone: "", email: "", gstin: "", createdAt: T, updatedAt: T },
        cli_lat00001: { id: "cli_lat00001", name: "Later Co", phone: "", email: "", gstin: "", createdAt: T, updatedAt: T },
        cli_old00001: { id: "cli_old00001", name: "Old Co", phone: "", email: "", gstin: "", createdAt: T, updatedAt: T },
        cli_pd000001: { id: "cli_pd000001", name: "Paid Co", phone: "", email: "", gstin: "", createdAt: T, updatedAt: T } }, invoices: {}, recurring: {} };
    await b.eval(`localStorage.clear(); localStorage.setItem('proupiqr-workspace-v1', ${JSON.stringify(JSON.stringify(bookJson))});
      localStorage.setItem('proupiqr-intl-v1:biz_primary', ${JSON.stringify(JSON.stringify({ owner: null, intl }))}); true`);
    await b.go(BASE + "/app/?tab=clients", 2500);
    await b.waitFor("/Future Studio/.test(document.body.innerText)", 8000);
    const w = mobile ? "390px" : "1280px";
    const newPlan = async (delta, day = "05", client = "Future Co") => {
      await t(`__t.click(/^\\+ New invoice$/)`); await opened();
      const month = await ym(delta);
      await t(`__t.set('ws-client', '${client}'), __t.set('ws-currency', 'INR'), __t.set('ws-amount', '25000'), __t.set('ws-number', 'FS-${delta}'), __t.set('ws-issue', '${month}-${day}'), __t.set('ws-due', '${month}-20')`);
      await t(`${repeatBox}.click(), true`);
      await sleep(150);
    };
    await newPlan(3);
    check(`${w}: a ₹ plan the month after the US$ plan's first month is told to stop it, then date it then`,
      (await overlapText()) === `Future Co already has monthly billing in USD with no end month. Stop it first (Clients → Monthly billing → Stop after this month), then date this invoice in ${await name(3)}.`, await overlapText());
    await t(`__t.set('ws-issue', '${await ym(4)}-05'), __t.set('ws-due', '${await ym(4)}-20')`);
    await sleep(150);
    check(`${w}: a later ₹ start names the month to stop it in`,
      (await overlapText()) === `Future Co already has monthly billing in USD with no end month. To switch in ${await name(4)}, stop it during ${await name(3)} (Clients → Monthly billing → Stop after this month) and add this invoice then, or stop it now and date this invoice in ${await name(3)}.`, await overlapText());
    check(`${w}: the overlap message fits (no sideways scroll) and is visible`, await noScroll() && await b.eval("document.getElementById('ws-plan-overlap').getClientRects().length > 0"));
    await b.eval("document.getElementById('ws-plan-overlap').scrollIntoView({ block: 'center' }), true");
    await sleep(400);
    await b.shot(`cur-${mobile ? "m" : "d"}-future-plan-overlap.png`);
    await esc(); await closed();
    // Review round 4: billing that starts later with an end month names both months and the month after the last.
    await newPlan(1, "05", "Later Co");
    check(`${w}: billing that starts later with an end month: "from … to …", on the last-month field`,
      (await overlapText()) === `Later Co already has monthly billing in USD from ${await name(2)} to ${await name(3)}. Set the last month to bill before ${await name(2)}, or date this invoice in ${await name(4)} or later.`
      && await b.eval("document.getElementById('ws-until').getAttribute('aria-describedby') === 'ws-plan-overlap' && !document.getElementById('ws-issue').hasAttribute('aria-describedby')"), await overlapText());
    await t(`__t.set('ws-until', '${await ym(1)}')`);
    await sleep(150);
    check(`${w}: …and ending the new billing the month before clears it`, !(await b.eval("!!document.querySelector('[data-plan-overlap]')")), await overlapText());
    // Review round 6: a last month to bill inside the US$ months. Dating the invoice after them can't be followed while
    // that last month is before the new date (the sheet refuses a last month before the first invoice), so only the
    // last month is offered here.
    await t(`__t.set('ws-until', '${await ym(3)}')`);
    await sleep(150);
    check(`${w}: a last month inside the US$ months only offers moving the last month`,
      (await overlapText()) === `Later Co already has monthly billing in USD from ${await name(2)} to ${await name(3)}. Set the last month to bill before ${await name(2)} so no month is billed twice.`
      && await b.eval("document.getElementById('ws-until').getAttribute('aria-invalid') === 'true' && !document.getElementById('ws-issue').hasAttribute('aria-invalid')"), await overlapText());
    await esc(); await closed();
    // Dated in the US$ plan's first month with the last month to bill inside its months: every month asked for is
    // already billed in US$, so the date advice also says to clear or move the last month, and both fields are marked.
    await newPlan(2, "05", "Later Co");
    await t(`__t.set('ws-until', '${await ym(3)}')`);
    await sleep(150);
    check(`${w}: "date it in …" with a last month before that date also says to clear or move the last month, on both fields`,
      (await overlapText()) === `Later Co already has monthly billing in USD until ${await name(3)}. Date this invoice in ${await name(4)} or later so no month is billed twice. To date it in ${await name(4)} or later, also clear the last month to bill or set it to ${await name(4)} or later.`
      && await b.eval("['ws-issue', 'ws-until'].every((id) => document.getElementById(id).getAttribute('aria-invalid') === 'true' && document.getElementById(id).getAttribute('aria-describedby') === 'ws-plan-overlap')"), await overlapText());
    check(`${w}: the longer message fits (no sideways scroll)`, await noScroll());
    await b.eval("document.getElementById('ws-plan-overlap').scrollIntoView({ block: 'center' }), true");
    await sleep(300);
    await b.shot(`cur-${mobile ? "m" : "d"}-overlap-until.png`);
    await t(`__t.set('ws-issue', '${await ym(4)}-05'), __t.set('ws-due', '${await ym(4)}-20'), __t.set('ws-until', '${await ym(4)}')`);
    await sleep(150);
    check(`${w}: …and following it (date and last month in the month after) clears it`, !(await b.eval("!!document.querySelector('[data-plan-overlap]')")), await overlapText());
    await esc(); await closed();
    // "Stop after this month" before the plan's first month: it bills nothing more, so the row reads "ended".
    const futRow = `[...document.querySelectorAll('section[aria-labelledby=monthly-title] li')].find((li) => li.textContent.includes('Future Co'))`;
    await t(`__t.click(/^Stop after this month$/, ${futRow})`);
    await sleep(200);
    const row = await b.eval(`(() => { const li = ${futRow}; return { text: li.innerText, buttons: [...li.querySelectorAll('button')].map((x) => x.textContent) }; })()`);
    check(`${w}: a plan stopped before its first month reads ended, with no Pause or Stop`, / · ended/.test(row.text) && !/until/.test(row.text) && !row.buttons.some((x) => /^(Pause|Resume|Stop after this month)$/.test(x)) && row.buttons.includes("Delete monthly billing"), JSON.stringify(row));
    await b.shot(`cur-${mobile ? "m" : "d"}-future-plan-stopped.png`);
    // Following the Monthly billing note (stop it, then start the new one): its first month is still billed in US$, and
    // the sheet names that invoice by its number, not "monthly billing" the client still has (review round 4). Dated
    // next month, the fix is still the invoice date (the month after it) or deleting it: ending the new billing before
    // it would leave every later month billed in neither currency (review round 5).
    await newPlan(1);
    const futOnly = `Future Co already has FUT-1, a USD invoice from monthly billing for ${await name(2)}. Date this invoice in ${await name(3)} or later, or delete FUT-1 first.`;
    check(`${w}: following the note, a ₹ plan from next month names the US$ invoice already made, and the gap-free date`,
      (await overlapText()) === futOnly
      && await b.eval("document.getElementById('ws-issue').getAttribute('aria-describedby') === 'ws-plan-overlap' && !document.getElementById('ws-until').hasAttribute('aria-describedby')"), await overlapText());
    await b.eval("document.getElementById('ws-plan-overlap').scrollIntoView({ block: 'center' }), true");
    await sleep(300);
    await b.shot(`cur-${mobile ? "m" : "d"}-future-plan-invoice-only.png`);
    await esc(); await closed();
    // A ₹ plan from that month is refused; from the month after, it is saved.
    await newPlan(2);
    check(`${w}: the US$ month already billed still blocks a ₹ plan for it`, (await overlapText()) === futOnly, await overlapText());
    await t(`__t.click(/^Add invoice$/, __t.dialog())`);
    await sleep(400);
    check(`${w}: …and Add invoice is refused`, await b.eval("!!document.querySelector('[role=dialog]')") && !(await book()).includes('"rec_'), (await book()).slice(0, 200));
    // The refused save focuses the invoice date and keeps the whole message on screen (on a phone it was cut off, round 5).
    const seen = await b.eval(`(() => { const el = document.getElementById('ws-plan-overlap'); const r = el.getBoundingClientRect();
      const clear = [r.top + 2, (r.top + r.bottom) / 2, r.bottom - 2].every((y) => el.contains(document.elementFromPoint(r.left + 8, y)));
      return { top: r.top, bottom: r.bottom, h: innerHeight, clear, focus: document.activeElement?.id }; })()`);
    check(`${w}: …the focus is on the invoice date and the message is fully visible, not under the toast`, seen.focus === "ws-issue" && seen.top >= 0 && seen.bottom <= seen.h && seen.clear, JSON.stringify(seen));
    await b.shot(`cur-${mobile ? "m" : "d"}-overlap-after-submit.png`);
    await t(`__t.set('ws-issue', '${await ym(3)}-05'), __t.set('ws-due', '${await ym(3)}-20')`);
    await sleep(150);
    check(`${w}: dated the month after, the overlap clears`, !(await b.eval("!!document.querySelector('[data-plan-overlap]')")), await overlapText());
    await t(`__t.click(/^Add invoice$/, __t.dialog())`);
    await closed();
    // Several invoices left by a deleted US$ plan: all are counted, so the advice is to delete all of them, or (one has a
    // payment) only to date the new billing after them (review round 5).
    await newPlan(-3, "05", "Old Co");
    check(`${w}: three US$ invoices left by a deleted plan are counted, and the advice deletes all of them`,
      (await overlapText()) === `Old Co already has 3 USD invoices from monthly billing, for ${await name(-3)} to ${await name(-1)}. Date this invoice in ${await name(0)} or later, or delete those invoices first.`, await overlapText());
    await esc(); await closed();
    await newPlan(-2, "05", "Paid Co");
    check(`${w}: …with a payment recorded on one, deleting isn't offered`,
      (await overlapText()) === `Paid Co already has 2 USD invoices from monthly billing, for ${await name(-2)} to ${await name(-1)}. Date this invoice in ${await name(0)} or later.`, await overlapText());
    check(`${w}: the longest overlap message fits (no sideways scroll)`, await noScroll());
    await esc(); await closed();
    const months = {};
    const stored = JSON.parse(await book());
    for (const inv of [...Object.values(stored.invoices), ...Object.values(JSON.parse(await sidecar()).intl.invoices)]) if (!inv.deletedAt && inv.clientId === "cli_fut00001") (months[inv.id.slice(-6)] ??= []).push(inv.currency ?? "INR");
    check(`${w}: each month is billed once, none skipped`, JSON.stringify(months) === JSON.stringify({ [start.replace("-", "")]: ["USD"], [(await ym(3)).replace("-", "")]: ["INR"] }) || JSON.stringify(months) === JSON.stringify({ [(await ym(3)).replace("-", "")]: ["INR"], [start.replace("-", "")]: ["USD"] }), JSON.stringify(months));
  }
  await b.mobile(false);

  // Review round 3 (PR 5): "Invoice clients in other currencies" off and no foreign invoice, so no picker, but the client
  // keeps a paused US$ plan. A ₹ "Repeat every month" for them is still refused, and Monthly billing keeps its note.
  {
    const T = Date.now();
    const lastMonth = (await iso(-40)).slice(0, 7);
    const intl = { invoices: {}, recurring: { rec_pause001: { id: "rec_pause001", clientId: "cli_pause001", amountPaise: 30000, description: "", dayOfMonth: 1, dueAfterDays: 14, startMonth: lastMonth, endMonth: "", paused: true, currency: "USD", createdAt: T, updatedAt: T } }, clients: {} };
    const bookJson = { version: 1, business: { name: "Paused Studio", upiId: "paused@okaxis", phone: "", gstin: "", invoicePrefix: "PS-", updatedAt: T },
      clients: { cli_pause001: { id: "cli_pause001", name: "Paused Co", phone: "", email: "", gstin: "", createdAt: T, updatedAt: T } }, invoices: {}, recurring: {} };
    await b.eval(`localStorage.clear(); localStorage.setItem('proupiqr-workspace-v1', ${JSON.stringify(JSON.stringify(bookJson))});
      localStorage.setItem('proupiqr-intl-v1:biz_primary', ${JSON.stringify(JSON.stringify({ owner: null, intl }))}); true`);
    await b.go(BASE + "/app/?tab=clients", 2500);
    await b.waitFor("/Paused Studio/.test(document.body.innerText)", 8000);
    check("switch off, a paused US$ plan: Monthly billing still says how to switch currency", await b.eval("!!document.querySelector('section[aria-labelledby=monthly-title] [data-monthly-note]')"));
    await t(`__t.click(/^\\+ New invoice$/)`); await opened();
    check("switch off and no foreign invoice: no currency picker", !(await exists("ws-currency")));
    await t(`__t.set('ws-client', 'Paused Co'), __t.set('ws-amount', '25000'), __t.set('ws-number', 'PS-1')`);
    await t(`${repeatBox}.click(), true`);
    await sleep(150);
    check("…but a ₹ Repeat for the client with the paused US$ plan is checked",
      (await overlapText()) === `Paused Co already has monthly billing in USD with no end month. Stop it first (Clients → Monthly billing → Stop after this month), then date this invoice in ${await monthName(1)}.`, await overlapText());
    await t(`__t.click(/^Add invoice$/, __t.dialog())`);
    await sleep(200);
    check("…and refused: nothing saved", await b.eval("!!document.querySelector('[role=dialog]')") && Object.keys(JSON.parse(await book()).invoices).length === 0 && Object.keys(JSON.parse(await book()).recurring).length === 0);
    await esc(); await closed();
  }

  check("no console errors", b.errors.length === 0, b.errors.join(" | "));
} catch (error) {
  check("test script ran to completion", false, String(error).slice(0, 500));
} finally {
  b.close();
}
process.exit(check.report());
