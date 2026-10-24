// Clients abroad in /app/ (docs/spec-foreign-clients.md §5, §9.3), against the runner's flag-on build (INTL_UI on,
// served at INTL_BASE). Static: no server, sync stays signed out.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
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
/** Opens the invoice row whose text includes `needle` (rows are `li [aria-expanded]`). */
const openRow = (needle) => t(`(() => { const r = [...document.querySelectorAll('li [aria-expanded]')].find(b => b.textContent.includes(${JSON.stringify(needle)})); if (!r) throw new Error('no row ${needle}'); if (r.getAttribute('aria-expanded') !== 'true') r.click(); return true; })()`);
/** Captures what downloadText() hands to URL.createObjectURL while `js` runs. */
const download = (js) => t(`(async () => { const blobs = []; const orig = URL.createObjectURL; URL.createObjectURL = (x) => { blobs.push(x); return orig(x); };
  try { ${js}; } finally { URL.createObjectURL = orig; } return blobs[0] ? blobs[0].text() : ''; })()`);
const tab = async (name) => { await t(`__t.click(/^${name}/)`); await sleep(250); };
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
  check("nothing saved while invalid", !(await sidecar()));
  await t(`__t.set('ws-intl-bank', 'HDFC Bank'), __t.set('ws-intl-swift', 'hdfc in bb'), __t.set('ws-intl-account', 'GB82 WEST 1234 5698 7654 32'), __t.set('ws-intl-bank-details', 'Branch: Fort, Mumbai'), __t.set('ws-intl-pay-url', 'https://paypal.me/sharma')`);
  await t(`document.getElementById('ws-intl-on').click(), true`);
  await t(`__t.click(/^Save payment details$/)`);
  await b.waitFor("/Payment details saved\\./.test(document.body.innerText)", 4000);
  check("valid details saved", /Payment details saved\./.test(await text()) && (await sidecar()).includes("HDFCINBB") && (await sidecar()).includes('"on":true'));

  // LUT needs a GSTIN, an ARN and its financial year; the preview is the statutory line.
  await t(`__t.set('ws-s-gstin', '27AAAPL1234C1Z5'), __t.click(/^Save settings$/)`);
  await sleep(300);
  check("LUT enabled once the business has a GSTIN", !(await b.eval("document.getElementById('ws-intl-lut').disabled")));
  await t(`document.getElementById('ws-intl-lut').click(), __t.set('ws-intl-lut-arn', 'ad2704260012345'), __t.click(/^Save payment details$/)`);
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
  await t(`__t.set('ws-intl-account-name-usd', 'Sharma Tuition LLP (Wise)'), __t.set('ws-intl-account-usd', '8310123456'), __t.set('ws-intl-bank-details-usd', 'ACH routing 026073150')`);
  await t(`__t.click(/^Save payment details$/)`);
  await sleep(300);
  const side = JSON.parse(await sidecar());
  check("LUT and USD override saved", side.intl.settings.lutArn === "AD2704260012345" && side.intl.settings.lutFy === fy && side.intl.settings.byCurrency?.USD?.account === "8310123456" && !side.intl.settings.byCurrency.EUR, JSON.stringify(side.intl.settings));
  await b.shot("cur-01-settings.png");

  // A client billed in USD: the phone hint, and their number kept as typed.
  await tab("Clients");
  await t(`__t.click(/^\\+ Add client$/)`); await opened();
  check("client sheet shows billing currency and the + hint", await exists("ws-client-currency") && /start the number with \+ and the country code/.test(await dialogText()));
  await t(`__t.set('ws-c-name', 'Globex LLC'), __t.set('ws-c-phone', '+1 415 555 0100'), __t.set('ws-client-currency', 'USD'), __t.click(/^Save$/, __t.dialog())`);
  await closed();
  check("client currency stored in the sidecar only", JSON.parse(await sidecar()).intl.clients && Object.values(JSON.parse(await sidecar()).intl.clients).some((c) => c.currency === "USD") && !(await book()).includes("USD"));

  // A USD invoice: the picker follows the client; foreign amounts never take a decimal comma.
  await t(`__t.click(/^\\+ New invoice$/)`); await opened();
  await t(`__t.set('ws-client', 'Globex LLC')`);
  await sleep(100);
  check("new invoice pre-selects the client's currency", (await value("ws-currency")) === "USD" && /Amount \(USD\)/.test(await dialogText()));
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
  await t(`__t.click(/^हिन्दी$/, __t.dialog())`);
  msg = await value("ws-reminder");
  check("Hindi reminder: bank block in Hindi, export line in English", /बैंक ट्रांसफ़र से भुगतान करें:/.test(msg) && msg.includes("SUPPLY MEANT FOR EXPORT") && /ट्रांसफ़र रेफ़रेंस/.test(msg), msg);
  await t(`__t.click(/^English$/, __t.dialog())`);
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
  page = await text();
  check("client row shows USD balance, not ₹0", /Globex LLC[\s\S]*US\$500\.00[\s\S]*US\$500\.00 overdue/.test(page) && !/Globex LLC[^\n]*\n[^\n]*₹0/.test(page));
  await t(`__t.click(/^\\+ New invoice$/)`); await opened();
  await t(`__t.set('ws-client', 'Globex LLC'), __t.set('ws-amount', '300'), __t.set('ws-number', 'MON-1')`);
  await t(`[...document.querySelectorAll('[role=dialog] label')].find(l => l.textContent.startsWith('Repeat every month')).querySelector('input').click(), true`);
  await t(`__t.click(/^Add invoice$/, __t.dialog())`);
  await closed();
  await tab("Clients");
  check("monthly plan shown in its currency", /Monthly billing[\s\S]*Globex LLC · US\$300\.00/.test(await text()));
  await t(`__t.click(/^Change currency$/)`); await opened();
  check("plan currency sheet warns that months keep their currency", /Months already created keep their currency\./.test(await dialogText()));
  await t(`__t.set('ws-plan-currency', 'GBP'), __t.click(/^Change currency$/, __t.dialog())`);
  await closed();
  page = await text();
  check("plan replaced in GBP; the created month stays USD", /Globex LLC · £300\.00/.test(page) && /Globex LLC · US\$300\.00/.test(page), page.slice(0, 1200));

  // Editing an unpaid invoice's currency keeps its number (new id).
  await tab("Invoices");
  await openRow("Acme GmbH");
  await t(`__t.click(/^Edit$/)`); await opened();
  await t(`__t.set('ws-currency', 'GBP'), __t.click(/^Save changes$/, __t.dialog())`);
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

  // Storage: the book key is exactly what older code writes; foreign data only in the sidecar.
  const bookKey = await book();
  check("book key holds no foreign data", !bookKey.includes("USD") && !bookKey.includes("HDFCINBB") && !bookKey.includes('"intl"') && (await sidecar()).includes("HDFCINBB"));

  // An old tab writes the stripped copy (as pre-PR 1 code would): nothing foreign is lost, and no write loop starts.
  await b.eval(`(() => { window.__writes = 0; const orig = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (String(k).startsWith('proupiqr-')) window.__writes++; return orig.call(this, k, v); }; return true; })()`);
  await b.eval(`new Promise((resolve) => { const f = document.createElement('iframe'); f.src = '/terms/'; f.style.display = 'none'; f.onload = () => {
    const w = JSON.parse(localStorage.getItem('proupiqr-workspace-v1')); w.business.updatedAt += 1; w.business.phone = '98200 00000';
    f.contentWindow.localStorage.setItem('proupiqr-workspace-v1', JSON.stringify(w)); resolve(true); }; document.body.appendChild(f); })`);
  await sleep(2000);
  const writes = await b.eval("window.__writes");
  page = await text();
  check("old-tab write keeps foreign invoices and settings", page.includes("US$") && (await sidecar()).includes("HDFCINBB") && (await sidecar()).includes('"USD"'));
  check("old-tab write causes no write loop", writes <= 4, `writes=${writes}`);

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
