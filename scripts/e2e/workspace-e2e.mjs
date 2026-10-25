import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { checker, helpers, OUT, sleep, startBrowser } from "./cdp-lib.mjs";

const BASE = process.env.BASE || "http://localhost:4400";
const b = await startBrowser();
const check = checker();
const t = async (js) => { await b.eval(helpers); return b.eval(js); };
const text = () => b.eval("document.body.innerText");
const dialogText = () => b.eval("document.querySelector('[role=dialog]')?.innerText || ''");
const iso = (offset) => b.eval(`(() => { const d = new Date(); d.setDate(d.getDate() + (${offset})); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })()`);

try {
  await b.go(BASE + "/app/", 500);
  await b.eval("localStorage.clear(); true");
  await b.go(BASE + "/app/", 2500);
  await b.waitFor("!!document.getElementById('ws-setup-name')");
  check("setup card shown on first visit", await b.eval("!!document.getElementById('ws-setup-name')"));
  check("Clerk loads on /app/ (needed for optional sync)", b.requests.some((u) => /clerk/i.test(u)));
  check("page is noindex", /noindex/.test(await b.eval("document.querySelector('meta[name=robots]').content")));

  // Setup with validation.
  await t(`__t.set('ws-setup-name', 'Sharma Tuition'), __t.set('ws-setup-upi', 'bad upi'), __t.click(/^Save$/)`);
  check("invalid UPI rejected", /doesn't look right/.test(await text()));
  await t(`__t.set('ws-setup-upi', 'sharma@okaxis'), __t.click(/^Save$/)`);
  await b.waitFor("!document.getElementById('ws-setup-name')");
  check("setup saved", (await text()).includes("Sharma Tuition") && !(await b.eval("!!document.getElementById('ws-setup-name')")));

  // New invoice: validation, then typing doesn't lose focus, then save.
  await t(`__t.click(/^\\+ New invoice$/)`);
  await b.waitFor("!!document.querySelector('[role=dialog]')");
  check("focus starts in client field", (await b.eval("document.activeElement?.id")) === "ws-client");
  await t(`__t.click(/^Add invoice$/, __t.dialog())`);
  const errs = await dialogText();
  check("empty invoice shows errors", /Who is this invoice for\?/.test(errs) && /Enter an amount/.test(errs));
  await b.eval("document.getElementById('ws-client').focus(); true");
  for (const chunk of ["Ro", "han ", "Mehta"]) { await b.send("Input.insertText", { text: chunk }); await sleep(60); }
  check("typing keeps focus (no re-focus on render)", (await b.eval("document.getElementById('ws-client').value")) === "Rohan Mehta");
  await t(`__t.set('ws-phone', '98765 43210'), __t.set('ws-amount', '1,500.50'), __t.click(/^7 days$/, __t.dialog())`);
  check("terms chip sets due date +7", (await b.eval("document.getElementById('ws-due').value")) === (await iso(7)));
  check("invoice number auto-filled", (await b.eval("document.getElementById('ws-number').value")) === "INV-0001");
  await t(`__t.click(/^Add invoice$/, __t.dialog())`);
  await b.waitFor("!document.querySelector('[role=dialog]')");
  check("invoice added", /INV-0001 added/.test(await text()));

  // Overdue invoice for a second client.
  await t(`__t.click(/^\\+ New invoice$/)`);
  await b.waitFor("!!document.querySelector('[role=dialog]')");
  await t(`__t.set('ws-client', 'Acme Traders'), __t.set('ws-amount', '25000'), __t.set('ws-issue', '${await iso(-60)}'), __t.set('ws-due', '${await iso(-15)}')`);
  check("second invoice number increments", (await b.eval("document.getElementById('ws-number').value")) === "INV-0002");
  await t(`__t.set('ws-number', 'INV-0001'), __t.click(/^Add invoice$/, __t.dialog())`);
  check("duplicate invoice number rejected", /INV-0001 already exists/.test(await dialogText()));
  await t(`__t.set('ws-number', 'INV-0002'), __t.click(/^Add invoice$/, __t.dialog())`);
  await b.waitFor("!document.querySelector('[role=dialog]')");

  let page = await text();
  check("to-collect total exact", page.includes("₹26,500.50"), page.slice(0, 600));
  check("overdue total", page.includes("₹25,000"));
  check("chase list shows overdue client", /Acme Traders[\s\S]*15 days late/.test(page));
  check("aging bucket 1–15 days", (await b.eval(`[...document.querySelectorAll('span')].find(s => s.textContent === '1–15 days late')?.parentElement.innerText`)).includes("₹25,000"));
  await b.mobile(true);
  await sleep(400);
  await b.shot("ws-01-overview-mobile.png");
  await b.mobile(false);

  // Reminder: suggested tone, content, WhatsApp link, logging.
  await t(`__t.click(/^Remind$/)`);
  await b.waitFor("!!document.getElementById('ws-reminder')");
  const msg = await b.eval("document.getElementById('ws-reminder').value");
  check("reminder auto-picks overdue tone", (await b.eval(`[...document.querySelectorAll('[aria-pressed=true]')].map(b => b.textContent).join()`)).includes("Overdue"));
  check("reminder text has amount, days, UPI ID; no upi:// link", /₹25,000/.test(msg) && /15 days overdue/.test(msg) && /sharma@okaxis/.test(msg) && !/upi:\/\//.test(msg), msg);
  await b.shot("ws-02-reminder.png");
  await t(`__t.click(/^WhatsApp$/, __t.dialog())`);
  const opened = await b.eval("window.__opened.at(-1)");
  check("WhatsApp opens wa.me with message (no number saved)", opened?.startsWith("https://wa.me/?text=") && decodeURIComponent(opened).includes("INV-0002"), opened);
  await b.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await b.waitFor("!document.querySelector('[role=dialog]')");
  check("Escape closes the sheet", !(await b.eval("!!document.querySelector('[role=dialog]')")));
  check("reminder count logged", /reminded 1×/.test(await text()));

  // Partial payment with over-payment guard.
  await t(`__t.click(/^Got paid$/)`);
  await b.waitFor("!!document.getElementById('ws-pay-amount')");
  check("payment defaults to balance", (await b.eval("document.getElementById('ws-pay-amount').value")) === "25000.00");
  await t(`__t.set('ws-pay-amount', '30000'), __t.click(/^Save payment$/, __t.dialog())`);
  check("over-payment rejected", /more than the ₹25,000 still due/.test(await dialogText()));
  await t(`__t.set('ws-pay-amount', '10000'), __t.set('ws-pay-ref', '412345678901'), __t.click(/^Save payment$/, __t.dialog())`);
  await b.waitFor("!document.querySelector('[role=dialog]')");
  page = await text();
  check("partial payment updates totals", page.includes("₹16,500.50") && page.includes("₹15,000") && page.includes("Payment recorded"));
  check("collected this month", /Collected this month\s*₹10,000/.test(page));
  // Two real invoices, signed out: keep a free cloud copy before browser data is lost.
  check("sync nudge once there are two invoices", /Keep these 2 invoices safe/.test(page) && /Save with a free account/.test(page));
  // ₹10,000 by UPI this month: what a 2.36% gateway would have taken, and Pro's break-even.
  check("gateway savings shown from ₹10,000 by UPI", /You collected ₹10,000 by UPI this month[\s\S]*would have kept about ₹236/.test(page), page.slice(0, 900));
  check("Pro break-even is exact", /less than the gateway fee on ₹6,314 of sales/.test(page));
  await t(`__t.click(/^Not now$/)`);
  check("sync nudge snoozes", !/Keep these 2 invoices safe/.test(await text()) && Number(await b.eval("localStorage.getItem('proupiqr-sync-nudge-dismissed')")) > 0);

  // Invoices tab: filters, full payment, undo, persistence.
  await t(`__t.click(/^Invoices/)`);
  await sleep(200);
  check("unpaid filter lists 2", (await b.eval("document.querySelectorAll('li [aria-expanded]').length")) === 2);
  await t(`[...document.querySelectorAll('li [aria-expanded]')].find(b => b.textContent.includes('Rohan')).click(), true`);
  await t(`__t.click(/^Record payment$/)`);
  await b.waitFor("!!document.getElementById('ws-pay-amount')");
  await t(`__t.click(/^Save payment$/, __t.dialog())`);
  await b.waitFor("!document.querySelector('[role=dialog]')");
  await t(`__t.click(/^paid$/)`);
  await sleep(200);
  page = await text();
  check("paid filter shows Rohan as Paid", /Rohan Mehta[\s\S]*Paid/.test(page) && (await b.eval("document.querySelectorAll('li [aria-expanded]').length")) === 1);
  await b.go(BASE + "/app/?tab=invoices", 2500);
  check("data persists across reload", (await text()).includes("Acme Traders") && (await b.eval("localStorage.getItem('proupiqr-workspace-v1')")).includes("Rohan Mehta"));
  check("unpaid filter hides paid invoice after reload", !(await text()).includes("Rohan Mehta"));
  check("?tab= deep link opens invoices", (await b.eval(`document.querySelector('[aria-current=page]')?.textContent`)).startsWith("Invoices"));

  // Clients tab drill-down.
  await t(`__t.click(/^Clients$/)`);
  await sleep(200);
  page = await text();
  check("clients list balances", /Acme Traders[\s\S]*₹15,000[\s\S]*₹15,000 overdue/.test(page) && /Rohan Mehta[\s\S]*98765 43210/.test(page));
  await t(`[...document.querySelectorAll('button')].find(b => b.textContent.startsWith('Acme Traders')).click(), true`);
  await sleep(200);
  check("client click filters invoices", (await b.eval("document.querySelectorAll('li [aria-expanded]').length")) === 1 && /Acme Traders ×/.test(await text()));

  // Backup → erase → restore round-trip.
  const snapshot = await b.eval("localStorage.getItem('proupiqr-workspace-v1')");
  const backupPath = join(OUT, "ws-backup.json");
  writeFileSync(backupPath, JSON.stringify({ app: "proupiqr-workspace", workspace: JSON.parse(snapshot) }));
  await t(`__t.click(/^Settings$/)`);
  await sleep(200);
  // INTL_UI is on (PR 5, docs/spec-foreign-clients.md §5.1): an INR-only book sees one new thing, the collapsed
  // "Clients abroad" card. No currency picker, no plan note, and nothing is written for it.
  check("INR-only: the Clients abroad card is there, collapsed", await b.eval("(() => { const d = [...document.querySelectorAll('details')].find(x => x.querySelector('summary')?.textContent.includes('Clients abroad')); return !!d && !d.open && !d.closest('li'); })()"));
  await t(`__t.click(/^\\+ New invoice$/)`);
  await b.waitFor("!!document.querySelector('[role=dialog]')");
  check("INR-only: no currency picker in the new-invoice sheet", !(await b.eval("!!document.getElementById('ws-currency') || !!document.getElementById('ws-currency-fixed')")) && /Amount \(₹\)/.test(await b.eval("document.querySelector('[role=dialog]').innerText")));
  await b.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await b.waitFor("!document.querySelector('[role=dialog]')");
  check("INR-only: no clients-abroad data stored", (await b.eval("Object.keys(localStorage).filter(k => k.startsWith('proupiqr-intl-v1')).length")) === 0 && !(await b.eval("localStorage.getItem('proupiqr-workspace-v1')")).includes('"intl"'));
  await t(`__t.click(/^Erase workspace on this device/)`);
  await t(`__t.click(/^Erase$/)`);
  await sleep(200);
  await t(`__t.click(/^Overview$/)`);
  await sleep(200);
  page = await text();
  check("erase clears workspace", page.includes("₹0") && !page.includes("Acme Traders") && (await b.eval("!!document.getElementById('ws-setup-name')")));
  await t(`__t.click(/^Settings$/)`);
  await sleep(200);
  const { root } = (await b.send("DOM.getDocument", {})).result;
  const { nodeId } = (await b.send("DOM.querySelector", { nodeId: root.nodeId, selector: "input[type=file]" })).result;
  await b.send("DOM.setFileInputFiles", { nodeId, files: [backupPath] });
  await b.waitFor(`/Backup merged/.test(document.body.innerText)`);
  await t(`__t.click(/^Overview$/)`);
  await sleep(200);
  page = await text();
  check("restore after erase brings data back", page.includes("Acme Traders") && page.includes("₹15,000") && page.includes("Sharma Tuition"));

  // Two offline devices can each issue the same INR number; an INR-only book shows no new note for it (Q9: the
  // duplicate-number note is only for an INR and a foreign invoice sharing a number, §1.7).
  await b.eval(`(() => { const w = JSON.parse(localStorage.getItem('proupiqr-workspace-v1')); const inv = Object.values(w.invoices).find((i) => !i.deletedAt);
    w.invoices.inv_twin0001 = { ...inv, id: 'inv_twin0001', payments: [], reminders: [], updatedAt: inv.updatedAt + 1 }; localStorage.setItem('proupiqr-workspace-v1', JSON.stringify(w)); return true; })()`);
  await b.go(BASE + "/app/?tab=invoices", 2500);
  await t(`__t.click(/^all$/)`);
  const rows = await b.eval("document.querySelectorAll('li [aria-expanded]').length");
  let noted = false;
  for (let i = 0; i < rows; i++) {
    await b.eval(`(() => { const r = document.querySelectorAll('li [aria-expanded]')[${i}]; if (r.getAttribute('aria-expanded') !== 'true') r.click(); return true; })()`);
    await sleep(150);
    noted ||= /Another invoice has this number/.test(await text());
  }
  check("INR-only book: two INR invoices with one number show no duplicate note", rows >= 2 && !noted, `rows=${rows}`);

  check("no console errors", b.errors.length === 0, b.errors.join(" | "));
} catch (error) {
  check("test script ran to completion", false, String(error).slice(0, 500));
} finally {
  b.close();
}
process.exit(check.report());
