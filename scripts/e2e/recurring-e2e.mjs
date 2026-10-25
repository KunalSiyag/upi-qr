import { checker, helpers, sleep, startBrowser } from "./cdp-lib.mjs";

const BASE = process.env.BASE || "http://localhost:4400";
const b = await startBrowser(9346);
const check = checker();
const t = async (js) => { await b.eval(helpers); return b.eval(js); };
const text = () => b.eval("document.body.innerText");
const local = () => b.eval("JSON.parse(localStorage.getItem('proupiqr-workspace-v1'))");
const localIso = (monthsBack, day) => b.eval(`(() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - ${monthsBack}); d.setDate(${day}); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })()`);

try {
  await b.send("Network.setBlockedURLs", { urls: ["*clerk.accounts.dev*", "*clerk.browser.js*"] });
  await b.go(BASE + "/terms/", 300);
  await b.eval(`localStorage.clear(); localStorage.setItem('proupiqr-workspace-v1', JSON.stringify({ version: 1, business: { name: 'Sharma Tuition', upiId: 'sharma@okaxis', phone: '', gstin: '', invoicePrefix: 'TU-', updatedAt: 1 }, clients: {}, invoices: {} })); true`);
  await b.go(BASE + "/app/?new=1", 2500);
  await b.waitFor("!!document.getElementById('ws-amount')");
  const issue = await localIso(2, 1); // the 1st, two months ago → this month's day 1 has already passed
  await t(`__t.set('ws-client', 'Riya Kapoor'), __t.set('ws-amount', '3000'), __t.set('ws-desc', 'Monthly tuition'), __t.set('ws-issue', '${issue}'), __t.click(/^7 days$/, __t.dialog())`);
  await t("[...document.querySelectorAll('[role=dialog] input[type=checkbox]')][0].click(), true");
  check("repeat option explains the monthly day", /A new invoice is created on day 1 of each month/.test(await b.eval("document.querySelector('[role=dialog]').innerText")));
  await t("__t.click(/^Add invoice$/, __t.dialog())");
  await b.waitFor("!document.querySelector('[role=dialog]')", 5000);
  await sleep(500);
  let data = await local();
  const plans = Object.values(data.recurring || {});
  const invoices = Object.values(data.invoices).filter((i) => !i.deletedAt);
  check("plan saved", plans.length === 1 && plans[0].dayOfMonth === 1 && plans[0].dueAfterDays === 7 && plans[0].amountPaise === 300000 && plans[0].startMonth === issue.slice(0, 7), JSON.stringify(plans));
  check("back-filled 3 monthly invoices (start month + 2)", invoices.length === 3 && invoices.every((i) => i.recurringId === plans[0].id), JSON.stringify(invoices.map((i) => [i.number, i.issueDate])));
  check("numbers continue the sequence", JSON.stringify(invoices.map((i) => i.number).sort()) === JSON.stringify(["TU-0001", "TU-0002", "TU-0003"]));
  check("user is told invoices were created", /Created 2 invoices from your monthly billing/.test(await text()));

  // Reload: nothing new is created (idempotent).
  await b.go(BASE + "/app/?tab=invoices", 2500);
  data = await local();
  check("reload creates nothing new", Object.values(data.invoices).filter((i) => !i.deletedAt).length === 3);
  await t("__t.click(/^all$/)");
  await sleep(200);
  check("generated invoices are labelled Monthly", ((await text()).match(/· Monthly/g) || []).length === 3);

  // Deleting a month keeps it deleted.
  await t("[...document.querySelectorAll('li [aria-expanded]')][1].click(), true");
  await t("__t.click(/^Delete$/)");
  await t("[...document.querySelectorAll('button')].find(b => b.textContent === 'Delete' && b.className.includes('bg-[#a8321d]')).click(), true");
  await sleep(300);
  await b.go(BASE + "/app/?tab=invoices", 2500);
  data = await local();
  check("a deleted month is not recreated", Object.values(data.invoices).filter((i) => !i.deletedAt).length === 2);

  // Clients tab: pause and stop.
  await t("__t.click(/^Clients$/)");
  await sleep(200);
  let page = await text();
  check("monthly billing listed under Clients", /Monthly billing[\s\S]*Riya Kapoor · ₹3,000[\s\S]*Day 1 of each month · Monthly tuition/.test(page));
  // An INR-only book (pickers off) never shows the currency-switch note (spec §5.1, Q9; review round 1, PR 5).
  check("INR-only: no Monthly billing currency note", !(await b.eval("!!document.querySelector('[data-monthly-note]')")) && !/another currency/.test(page));
  await t("__t.click(/^Pause$/)");
  await sleep(200);
  check("pause shown", /paused/.test(await text()) && Object.values((await local()).recurring)[0].paused === true);
  await t("__t.click(/^Resume$/)");
  await t("__t.click(/^Stop after this month$/)");
  await sleep(200);
  const stopped = Object.values((await local()).recurring)[0];
  check("stop sets the last month to this month", stopped.endMonth === (await b.eval("(() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); })()")) && stopped.paused === false);
  check("no console errors (excluding blocked Clerk)", b.errors.filter((e) => !/clerk|ERR_BLOCKED|Failed to load/i.test(e)).length === 0, b.errors.join(" | "));
} catch (error) {
  check("test script ran to completion", false, String(error).slice(0, 500));
} finally {
  b.close();
}
process.exit(check.report());
