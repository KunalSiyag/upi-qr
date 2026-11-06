// scripts/e2e/loans-e2e.mjs: the home loan, education loan, education cost, FD, RD, freelance rate, mortgage, income tax, HRA, salary, PPF, retirement and stamp duty calculators in a real browser. Static suite: serve the build and run
//   BASE=http://localhost:4400 node scripts/e2e/loans-e2e.mjs
// Expected figures come from the independent Python Decimal vectors used by `npm run test:loan` (2026-11-06), with the
// course/first-EMI month pinned to Nov 2026 so the month labels do not depend on today's date. It covers the built pages in
// all five languages, hydration, both modes, validation, exports (downloads are denied and the blobs are inspected instead),
// draft persistence, a 390px phone width, and that nothing typed is requested or leaves the page.
import { checker, sleep, startBrowser } from "./cdp-lib.mjs";

const BASE = process.env.BASE || "http://localhost:4400";
const b = await startBrowser();
const check = checker();
// A JavaScript string literal that is also safe inside HTML and old line terminators.
const lit = (v) => JSON.stringify(v).replace(/[<>\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
const text = (root) => b.eval(`document.querySelector(${JSON.stringify(root)}).innerText`);
const hydrated = (root, ms = 10000) =>
  b.waitFor(`(() => { const r = document.querySelector(${lit(root)}); return !!r && !!r.querySelector('input[id$="-amount"], input[id$="-takeHome"], input[id$="-price"], input[id$="-salary"], input[id$="-basic"], input[id$="-ctc"], select[id$="-pattern"], input[id$="-age"], input[id$="-value"]') && ![...document.querySelectorAll('astro-island')].some((i) => i.hasAttribute('ssr')); })()`, ms);
const open = async (path, root) => { await b.go(`${BASE}${path}`, 1200); await b.eval(`(document.querySelector('input[id$="-amount"], input[id$="-takeHome"], input[id$="-price"], input[id$="-salary"], input[id$="-basic"], input[id$="-ctc"], select[id$="-pattern"], input[id$="-age"], input[id$="-value"]') || document.querySelector(${JSON.stringify(root)})).scrollIntoView(), true`); await hydrated(root); };
const setField = (root, suffix, value) => b.eval(`(() => {
  const el = document.querySelector(${JSON.stringify(root)}).querySelector('[id$="-${suffix}"]');
  if (!el) throw new Error('no field ${suffix}');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(value)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);
const setSelect = (root, suffix, value) => b.eval(`(() => {
  const el = document.querySelector(${JSON.stringify(root)}).querySelector('[id$="-${suffix}"]');
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, ${JSON.stringify(value)});
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()`);
const clickIn = (root, groupLabel, label) => b.eval(`(() => {
  const g = [...document.querySelector(${JSON.stringify(root)}).querySelectorAll('[role=group]')].find((x) => x.getAttribute('aria-label') === ${JSON.stringify(groupLabel)});
  if (!g) throw new Error('no group ${groupLabel}');
  const el = [...g.querySelectorAll('button')].find((x) => x.textContent.trim() === ${JSON.stringify(label)});
  if (!el) throw new Error('no button ${label}');
  el.click(); return true;
})()`);
const setCheck = (root, labelText, on) => b.eval(`(() => {
  const label = [...document.querySelector(${lit(root)}).querySelectorAll('label')].find((l) => l.textContent.includes(${lit(labelText)}));
  if (!label) throw new Error('no checkbox ' + ${lit(labelText)});
  const box = label.querySelector('input[type=checkbox]');
  if (box.checked !== ${on}) box.click();
  return box.checked === ${on};
})()`);
const clickText = (root, label) => b.eval(`(() => {
  const el = [...document.querySelector(${JSON.stringify(root)}).querySelectorAll('button')].find((x) => x.textContent.trim() === ${JSON.stringify(label)});
  if (!el) throw new Error('no button ${label}');
  el.click(); return true;
})()`);
const rx = (s, re, n = 0) => { const all = [...s.matchAll(new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`))]; return all[n]?.[1] ?? null; };
const consoleErrors = () => b.errors.filter((e) => !/clerk|ERR_BLOCKED|Failed to load/i.test(e));
const outsiders = () => b.requests.filter((u) => !/^(http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/|blob:|data:)/.test(u));
const overflow = () => b.eval("document.documentElement.scrollWidth - window.innerWidth");

/** Capture every blob the page makes and every download click, so exports are inspected instead of saved. */
const capture = `(() => {
  window.__blobs = []; window.__downloads = [];
  const make = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (blob) => { window.__blobs.push({ type: blob.type, size: blob.size }); return make(blob); };
  HTMLAnchorElement.prototype.click = function () { if (this.download) window.__downloads.push(this.download); };
  window.__events = 0; window.addEventListener('proupiqr:tool-output', () => window.__events++);
  return true;
})()`;
async function exportsWork(root, label, pngName) {
  await b.eval(capture);
  await clickText(root, "PNG");
  await b.waitFor("window.__downloads.length >= 1", 25000);
  const png = await b.eval("({ downloads: window.__downloads.slice(), blobs: window.__blobs.slice() })");
  check(`${label}: PNG export is a named image file`, png.downloads.includes(pngName) && png.blobs.some((x) => x.type === "image/png" && x.size > 50_000), JSON.stringify(png));
  const buttons = ["Schedule PDF", "Plan PDF", "Estimate PDF"];
  const pdfLabel = await b.eval(`(() => { const r = document.querySelector(${JSON.stringify(root)}); return ${JSON.stringify(buttons)}.find((l) => [...r.querySelectorAll('button')].some((x) => x.textContent.trim() === l)); })()`);
  await clickText(root, pdfLabel);
  await b.waitFor("window.__events >= 2", 25000);
  const pdf = await b.eval("({ blobs: window.__blobs.slice(), events: window.__events, toast: /export failed/i.test(document.body.innerText) })");
  check(`${label}: PDF export produces a PDF`, pdf.blobs.some((x) => x.type === "application/pdf" && x.size > 5_000) && !pdf.toast, JSON.stringify(pdf));
  check(`${label}: both exports fired the output event`, pdf.events === 2, String(pdf.events));
}

try {
  await b.send("Network.setBlockedURLs", { urls: ["*clerk.accounts.dev*", "*clerk.browser.js*", "*_vercel/insights*", "*_vercel/speed-insights*"] });

  /* ---------------- built pages ---------------- */
  for (const slug of ["home-loan-calculator", "education-loan-calculator", "education-cost-calculator", "fd-calculator", "rd-calculator", "freelance-rate-calculator", "mortgage-calculator", "income-tax-calculator", "hra-calculator", "salary-calculator", "ppf-calculator", "retirement-calculator", "stamp-duty-calculator"]) {
    for (const lang of ["", "hi/", "ta/", "te/", "mr/"]) {
      const res = await fetch(`${BASE}/${lang}${slug}/`);
      check(`/${lang}${slug}/ is served`, res.status === 200);
    }
  }

  /* ---------------- home loan ---------------- */
  const H = "#home-loan-tool";
  await open("/home-loan-calculator/", H);
  check("home loan: hydrates", await hydrated(H));
  await setField(H, "start", "2026-11");
  await sleep(250);
  let t = await text(H);
  check("home loan: ₹50L @ 8.5% / 20y → EMI ₹43,391", rx(t, /Monthly EMI\s*₹([\d,]+)/) === "43,391", t.slice(0, 300));
  check("home loan: total interest ₹54,13,879", rx(t, /Total interest\s*₹([\d,]+)/) === "54,13,879");
  check("home loan: last EMI Oct 2046", /Last EMI: Oct 2046/.test(t));

  await setField(H, "amount", "1000000"); await setField(H, "rate", "9"); await setField(H, "years", "20"); await setField(H, "extra", "5000"); await sleep(300);
  t = await text(H);
  check("home loan: ₹10L @ 9% / 20y → EMI ₹8,997", rx(t, /Monthly EMI\s*₹([\d,]+)/) === "8,997");
  check("home loan: +₹5,000 a month saves ₹7,21,616", rx(t, /You save ₹([\d,]+) in interest/) === "7,21,616");
  check("home loan: ends 11 years 5 months sooner, May 2035 instead of Oct 2046", /11 years 5 months sooner: May 2035 instead of Oct 2046/.test(t));
  check("home loan: schedule shows a Prepaid column", /Prepaid/.test(t));

  await setField(H, "amount", "5000000"); await setField(H, "rate", "8.5"); await setField(H, "extra", ""); await setField(H, "lump", "500000"); await setField(H, "lumpmonth", "12"); await sleep(300);
  t = await text(H);
  check("home loan: ₹5L lump after instalment 12 → interest ₹38,10,189", rx(t, /Total interest\s*₹([\d,]+)/) === "38,10,189");
  check("home loan: …saves ₹16,03,691, 4 years sooner (Oct 2042)", rx(t, /You save ₹([\d,]+) in interest/) === "16,03,691" && /4 years sooner: Oct 2042 instead of Oct 2046/.test(t));

  await setField(H, "amount", "12abc"); await sleep(250);
  check("home loan: a bad amount shows an error and hides the result", /Enter a loan amount between/.test(await text(H)) && /Fix the highlighted fields/.test(await text(H)));
  await setField(H, "amount", "5000000"); await setField(H, "rate", "51"); await sleep(250);
  check("home loan: a rate above 50 is refused", /Enter a rate from 0 to 50/.test(await text(H)));
  await setField(H, "rate", "8.5"); await setField(H, "lump", ""); await sleep(250);
  check("home loan: fixing the inputs restores the result", rx(await text(H), /Monthly EMI\s*₹([\d,]+)/) === "43,391");

  await clickText(H, "How much can I borrow");
  await setField(H, "income", "100000"); await setField(H, "existing", "10000"); await sleep(300);
  t = await text(H);
  check("home loan: ₹1L income, 50% FOIR, ₹10k EMIs → EMI ₹40,000", rx(t, /EMI you can carry\s*₹([\d,]+)/) === "40,000");
  check("home loan: …supports a loan of ₹46,09,233", rx(t, /Loan you may get\s*₹([\d,]+)/) === "46,09,233");
  await setField(H, "existing", "60000"); await sleep(250);
  check("home loan: existing EMIs over budget → no room", /no room for a new loan/.test(await text(H)));
  await setField(H, "existing", "10000"); await sleep(200);
  await clickText(H, "Use this loan amount"); await sleep(300);
  check("home loan: 'Use this loan amount' fills the amount and returns to the EMI view",
    (await b.eval(`document.querySelector('${H} [id$="-amount"]').value`)) === "4609233" && (await b.eval(`[...document.querySelectorAll('${H} button[aria-pressed=true]')].map((x) => x.textContent).join('|')`)) === "EMI and prepayment");

  await exportsWork(H, "home loan", "home-loan-schedule.png");

  // Draft persistence
  await setField(H, "amount", "3300000"); await sleep(300);
  await b.go(`${BASE}/home-loan-calculator/`, 1200); await b.eval(`document.querySelector('${H}').scrollIntoView(), true`); await hydrated(H);
  await sleep(400);
  check("home loan: the draft survives a reload", (await b.eval(`document.querySelector('${H} [id$="-amount"]').value`)) === "3300000");

  /* ---------------- education loan ---------------- */
  const E = "#education-loan-tool";
  await open("/education-loan-calculator/", E);
  check("education loan: hydrates", await hydrated(E));
  await setField(E, "start", "2026-11"); await sleep(300);
  t = await text(E);
  check("education loan: yearly payout, simple → ₹5,70,000 builds up", rx(t, /Interest that builds up\s*₹([\d,]+)/) === "5,70,000", t.slice(0, 600));
  check("education loan: …EMI ₹33,255 and total interest ₹19,90,621", rx(t, /EMI after the moratorium\s*₹([\d,]+)/, 0) === "33,255" && rx(t, /Total interest\s*₹([\d,]+)/, 0) === "19,90,621");
  check("education loan: EMIs are worked out on ₹25,70,000", rx(t, /EMIs are worked out on\s*₹([\d,]+)/, 0) === "25,70,000");
  check("education loan: paying while studying costs ₹3,958 – ₹15,833 a month", /You pay each month while studying\s*₹3,958 – ₹15,833/.test(t));
  check("education loan: …EMI ₹25,880 and total interest ₹16,75,541", rx(t, /EMI after the moratorium\s*₹([\d,]+)/, 1) === "25,880" && rx(t, /Total interest\s*₹([\d,]+)/, 1) === "16,75,541");
  check("education loan: saves ₹3,15,079 overall and lowers the EMI by ₹7,376", /saves ₹3,15,079 overall and lowers your EMI by ₹7,376/.test(t));
  check("education loan: timeline Nov 2026 → Oct 2030, grace to Apr 2031, EMIs May 2031 → Apr 2041", /Course: Nov 2026 to Oct 2030/.test(t) && /Grace period ends Apr 2031/.test(t) && /First EMI May 2031/.test(t) && /Last EMI Apr 2041/.test(t));

  await clickText(E, "All at the start"); await sleep(300);
  t = await text(E);
  check("education loan: all at the start → ₹8,55,000 builds up, EMI ₹36,943, interest ₹24,33,160",
    rx(t, /Interest that builds up\s*₹([\d,]+)/) === "8,55,000" && rx(t, /EMI after the moratorium\s*₹([\d,]+)/, 0) === "36,943" && rx(t, /Total interest\s*₹([\d,]+)/, 0) === "24,33,160");
  check("education loan: …paying instead is a flat ₹15,833 a month, EMI ₹25,880, interest ₹19,60,541",
    /You pay each month while studying\s*₹15,833\n/.test(t) && rx(t, /EMI after the moratorium\s*₹([\d,]+)/, 1) === "25,880" && rx(t, /Total interest\s*₹([\d,]+)/, 1) === "19,60,541");
  await clickText(E, "Compound interest (monthly)"); await sleep(300);
  t = await text(E);
  check("education loan: compound → ₹10,61,680 builds up, EMI ₹39,617", rx(t, /Interest that builds up\s*₹([\d,]+)/) === "10,61,680" && rx(t, /EMI after the moratorium\s*₹([\d,]+)/, 0) === "39,617");
  await clickText(E, "Simple interest");

  await clickText(E, "Show this plan"); await sleep(300);
  t = await text(E);
  check("education loan: choosing the pay-while-studying plan updates the document", /You pay ₹15,833 a month in interest while studying, so your EMIs are worked out on ₹20,00,000/.test(t) && /Showing this plan/.test(t));

  await setField(E, "rate", "0"); await sleep(250);
  check("education loan: at 0% nothing builds up and no saving is claimed", !/saves .* overall/.test(await text(E)) && rx(await text(E), /Total interest\s*₹([\d,]+)/, 0) === "0");
  await setField(E, "rate", "9.5"); await setField(E, "course", "9"); await setField(E, "grace", "40"); await setField(E, "repay", "21"); await sleep(250);
  t = await text(E);
  check("education loan: out-of-range course, grace and repayment are refused", /Enter a course length from 1 to 8 years/.test(t) && /Enter a grace period from 0 to 36 months/.test(t) && /Enter a repayment time from 1 to 20 years/.test(t) && /Fix the highlighted fields/.test(t));
  await setField(E, "course", "4"); await setField(E, "grace", "6"); await setField(E, "repay", "10"); await sleep(250);
  check("education loan: fixing the inputs restores the result", rx(await text(E), /EMI after the moratorium\s*₹([\d,]+)/, 0) !== null && !/Fix the highlighted fields/.test(await text(E)));

  await exportsWork(E, "education loan", "education-loan-plan.png");

  /* ---------------- education cost planner ---------------- */
  const P = "#education-cost-tool";
  await open("/education-cost-calculator/", P);
  check("education cost: hydrates", await hydrated(P).catch(() => false) || (await b.eval(`!!document.querySelector('${P} input[id$="-cost"]')`)));
  await setSelect(P, "currency", "INR");
  await setField(P, "cost", "1000000"); await setField(P, "until", "10"); await setField(P, "course", "4"); await setField(P, "rise", "8"); await setField(P, "ret", "10"); await setField(P, "saved", "500000"); await sleep(350);
  t = await text(P);
  check("education cost: ₹10L/yr, 10 years away, 8% rise, 10% return, ₹5L saved → ₹34,156 a month", rx(t, /Save each month\s*₹([\d,]+)/) === "34,156", t.slice(0, 500));
  check("education cost: total when due ₹97,28,358, needed by the start ₹83,50,219, savings grow to ₹13,53,521",
    rx(t, /Total cost when each year falls due\s*₹([\d,]+)/) === "97,28,358" && rx(t, /You need saved by the start\s*₹([\d,]+)/) === "83,50,219" && rx(t, /Your savings will grow to\s*₹([\d,]+)/) === "13,53,521");
  check("education cost: the four yearly costs in the document", ["21,58,925", "23,31,639", "25,18,170", "27,19,624"].every((v) => t.includes(`₹${v}`)));
  check("education cost: waiting a year raises it to ₹40,199", /Waiting a year to start saving raises the monthly amount to ₹40,199\./.test(t));
  check("education cost: 120 months, ₹40,98,728 put in", /Over 10 years you put in ₹40,98,728 in all\./.test(t));

  await setSelect(P, "currency", "USD");
  await setField(P, "cost", "30000"); await setField(P, "until", "12"); await setField(P, "course", "4"); await setField(P, "rise", "5"); await setField(P, "ret", "7"); await setField(P, "saved", "0"); await sleep(350);
  t = await text(P);
  check("education cost: $30,000/yr in dollars → $930 a month, $232,211 in all, $208,876 needed", rx(t, /Save each month\s*\$([\d,]+)/) === "930" && rx(t, /Total cost when each year falls due\s*\$([\d,]+)/) === "232,211" && rx(t, /You need saved by the start\s*\$([\d,]+)/) === "208,876");
  check("education cost: dollars use US grouping and waiting costs $1,055", /\$1,055\./.test(t));

  await setSelect(P, "currency", "INR");
  await setField(P, "cost", "500000"); await setField(P, "until", "0"); await setField(P, "course", "3"); await setField(P, "rise", "6"); await setField(P, "ret", "8"); await setField(P, "saved", "100000"); await sleep(350);
  t = await text(P);
  check("education cost: a course starting now asks for a lump sum, not a monthly amount", /Put in today\s*₹13,68,370/.test(t) && /no time to save month by month/.test(t) && !/Waiting a year/.test(t));
  await setField(P, "cost", "1000000"); await setField(P, "until", "3"); await setField(P, "course", "2"); await setField(P, "saved", "10000000"); await sleep(350);
  t = await text(P);
  check("education cost: savings that already cover it say so and ask for ₹0 a month", /Your savings already cover it/.test(t) && /Save each month\s*₹0/.test(t));

  await setField(P, "cost", "0"); await setField(P, "until", "26"); await setField(P, "rise", "26"); await sleep(300);
  t = await text(P);
  check("education cost: a zero cost, 26 years away and a 26% rise are refused", /Enter a yearly cost greater than zero/.test(t) && /Enter 0 to 25 years/.test(t) && /Enter a rate from 0 to 25/.test(t) && /Fix the highlighted fields/.test(t));
  await setField(P, "cost", "1000000"); await setField(P, "until", "10"); await setField(P, "course", "4"); await setField(P, "rise", "8"); await setField(P, "ret", "10"); await setField(P, "saved", "500000"); await sleep(300);
  check("education cost: fixing the inputs restores the result", rx(await text(P), /Save each month\s*₹([\d,]+)/) === "34,156");

  await exportsWork(P, "education cost", "education-cost-plan.png");

  await setSelect(P, "currency", "GBP"); await sleep(200);
  await b.go(`${BASE}/education-cost-calculator/`, 1200); await b.eval(`document.querySelector('${P} input[id$="-cost"]').scrollIntoView(), true`); await hydrated(P); await sleep(400);
  check("education cost: the draft (currency and figures) survives a reload", (await b.eval(`document.querySelector('${P} [id$="-currency"]').value`)) === "GBP" && (await b.eval(`document.querySelector('${P} [id$="-cost"]').value`)) === "1000000");

  /* ---------------- fixed deposit ---------------- */
  const D = "#deposit-tool";
  await open("/fd-calculator/", D);
  check("FD: hydrates", await hydrated(D));
  await setField(D, "start", "2026-11");
  await clickIn(D, "How you get the interest", "At maturity"); await clickIn(D, "Interest is added to the deposit", "Every quarter");
  await setField(D, "amount", "500000"); await setField(D, "rate", "7"); await setField(D, "years", "3"); await setField(D, "months", "0"); await setField(D, "tax", "0"); await sleep(350);
  t = await text(D);
  check("FD: ₹5L @ 7% for 3 years, quarterly → maturity ₹6,15,720", rx(t, /Maturity value\s*₹([\d,]+)/) === "6,15,720", t.slice(0, 500));
  check("FD: …interest ₹1,15,720 on ₹5,00,000 invested", rx(t, /Interest earned\s*₹([\d,]+)/) === "1,15,720" && rx(t, /You invest\s*₹([\d,]+)/) === "5,00,000");
  check("FD: …a 7.19% yearly return and it matures Nov 2029", /yearly return of 7\.19%/.test(t) && /Matures Nov 2029\./.test(t));
  check("FD: three yearly rows, the last closing at ₹6,15,720", (await b.eval(`document.querySelectorAll('${D} tbody tr').length`)) === 3 && (await b.eval(`document.querySelector('${D} tbody tr:last-child').innerText`)).includes("₹6,15,720"));

  await setField(D, "amount", "1000000"); await setField(D, "rate", "7.25"); await setField(D, "years", "2"); await clickIn(D, "Interest is added to the deposit", "Every month"); await sleep(350);
  t = await text(D);
  check("FD: ₹10L @ 7.25% for 2 years, monthly compounding → ₹11,55,535, interest ₹1,55,535", rx(t, /Maturity value\s*₹([\d,]+)/) === "11,55,535" && rx(t, /Interest earned\s*₹([\d,]+)/) === "1,55,535");

  await setField(D, "rate", "7"); await setField(D, "years", "1"); await clickIn(D, "How you get the interest", "Every month"); await sleep(350);
  t = await text(D);
  check("FD: ₹10L @ 7% monthly payout → ₹5,833 a month, ₹70,000 in the year", /You receive ₹5,833 every month\./.test(t) && rx(t, /Interest you receive in all\s*₹([\d,]+)/) === "70,000");
  check("FD: …the deposit comes back at maturity and no compounding choice is shown", /Your ₹10,00,000 comes back at maturity\./.test(t) && !/Interest is added to the deposit/.test(t));

  await setField(D, "months", "2"); await clickIn(D, "How you get the interest", "Every quarter"); await sleep(350);
  t = await text(D);
  check("FD: 14 months, quarterly payout → ₹17,500 each, ₹11,667 for the last 2 months, ₹81,667 in all", /You receive ₹17,500 every quarter\./.test(t) && /Interest for the last 2 months is ₹11,667, paid at maturity\./.test(t) && rx(t, /Interest you receive in all\s*₹([\d,]+)/) === "81,667");

  await clickIn(D, "How you get the interest", "At maturity"); await clickIn(D, "Interest is added to the deposit", "Every quarter");
  await setField(D, "amount", "500000"); await setField(D, "years", "3"); await setField(D, "months", "0"); await setField(D, "tax", "30"); await sleep(350);
  t = await text(D);
  check("FD: a 30% tax rate leaves ₹81,004 of interest and ₹5,81,004 in all", /After tax at 30% the interest is ₹81,004, so you keep ₹5,81,004 in all\./.test(t));

  await setField(D, "amount", "abc"); await setField(D, "rate", "26"); await setField(D, "years", "11"); await setField(D, "tax", "51"); await sleep(300);
  t = await text(D);
  check("FD: a bad amount, a 26% rate, 11 years and a 51% tax rate are refused", /Enter an amount between/.test(t) && /Enter a rate from 0 to 25/.test(t) && /Enter a tenure from 1 month to 10 years/.test(t) && /Enter a tax rate from 0 to 50/.test(t) && /Fix the highlighted fields/.test(t));
  await setField(D, "amount", "500000"); await setField(D, "rate", "7"); await setField(D, "years", "3"); await setField(D, "tax", "0"); await sleep(300);
  check("FD: fixing the inputs restores the result", rx(await text(D), /Maturity value\s*₹([\d,]+)/) === "6,15,720");

  await exportsWork(D, "FD", "fixed-deposit-schedule.png");

  await setField(D, "amount", "750000"); await clickIn(D, "How you get the interest", "Every year"); await sleep(300);
  await b.go(`${BASE}/fd-calculator/`, 1200); await b.eval(`document.querySelector('${D} input[id$="-amount"]').scrollIntoView(), true`); await hydrated(D); await sleep(400);
  check("FD: the draft (amount and payout choice) survives a reload", (await b.eval(`document.querySelector('${D} [id$="-amount"]').value`)) === "750000" && /You receive ₹52,500 every year\./.test(await text(D)));

  /* ---------------- recurring deposit ---------------- */
  await open("/rd-calculator/", D);
  check("RD: hydrates", await hydrated(D));
  await setField(D, "start", "2026-11"); await setField(D, "amount", "5000"); await setField(D, "rate", "7"); await setField(D, "years", "5"); await setField(D, "months", "0"); await setField(D, "tax", "0"); await sleep(350);
  t = await text(D);
  check("RD: ₹5,000 a month @ 7% for 5 years → maturity ₹3,59,664", rx(t, /Maturity value\s*₹([\d,]+)/) === "3,59,664", t.slice(0, 500));
  check("RD: …₹3,00,000 deposited, ₹59,664 interest", rx(t, /You deposit\s*₹([\d,]+)/) === "3,00,000" && rx(t, /Interest earned\s*₹([\d,]+)/) === "59,664" && /Over 5 years you deposit ₹3,00,000 in all\./.test(t));
  check("RD: five yearly rows, matures Nov 2031, no payout or compounding choice", (await b.eval(`document.querySelectorAll('${D} tbody tr').length`)) === 5 && /Matures Nov 2031\./.test(t) && !/How you get the interest/.test(t));
  await setField(D, "amount", "10000"); await setField(D, "rate", "6.5"); await setField(D, "years", "2"); await sleep(350);
  t = await text(D);
  check("RD: ₹10,000 a month @ 6.5% for 2 years → ₹2,56,851, interest ₹16,851", rx(t, /Maturity value\s*₹([\d,]+)/) === "2,56,851" && rx(t, /Interest earned\s*₹([\d,]+)/) === "16,851");
  await setField(D, "months", "12"); await sleep(250);
  check("RD: more than 11 extra months is refused", /Enter a tenure from 1 month to 10 years/.test(await text(D)));
  await setField(D, "months", "0"); await sleep(250);
  await exportsWork(D, "RD", "recurring-deposit-schedule.png");

  /* ---------------- freelance rate ---------------- */
  const R = "#rate-tool";
  await open("/freelance-rate-calculator/", R);
  check("freelance: hydrates", await hydrated(R));
  const fillRate = async (v) => { for (const [k, val] of Object.entries(v)) { if (k === "currency") await setSelect(R, "currency", val); else await setField(R, k, val); } await sleep(350); };
  await fillRate({ currency: "INR", takeHome: "1200000", ownCosts: "100000", businessCosts: "100000", tax: "20", margin: "10", days: "5", hours: "8", vacation: "4", holidays: "10", sick: "5", billable: "65" });
  t = await text(R);
  check("freelance: ₹12L take-home, ₹1L + ₹1L costs, 20% tax, 10% margin → ₹1,621.80 an hour", rx(t, /Your hourly rate\s*₹([\d,.]+)/) === "1,621.80", t.slice(0, 600));
  check("freelance: …a day rate of ₹12,974, ₹1,58,125 a month, ₹18,97,500 a year", rx(t, /Your day rate\s*₹([\d,]+)/) === "12,974" && rx(t, /Revenue needed each month\s*₹([\d,]+)/) === "1,58,125" && rx(t, /Revenue needed per year\s*₹([\d,]+)/) === "18,97,500");
  check("freelance: 225 working days and about 1,170 billable hours, or 146 days", /You work 225 days a year and can bill about 1,170 hours, or 146 days, of them\./.test(t));
  check("freelance: the document breaks the revenue down", ["Take-home you want\\s*₹12,00,000", "Personal costs you fund\\s*₹1,00,000", "Tax on your profit\\s*₹3,25,000", "Business costs\\s*₹1,00,000", "Safety margin\\s*₹1,72,500", "Revenue you need\\s*₹18,97,500"].every((p) => new RegExp(p).test(t)));
  check("freelance: the sensitivity table shows 50% → ₹2,108.34, your 65%, and 80% → ₹1,317.71", /50%\s*₹2,108\.34/.test(t) && /65% \(yours\)\s*₹1,621\.80/.test(t) && /80%\s*₹1,317\.71/.test(t));

  await fillRate({ currency: "GBP", takeHome: "50000", ownCosts: "5000", businessCosts: "4000", tax: "25", margin: "10", days: "4", hours: "7.5", vacation: "5", holidays: "8", sick: "5", billable: "70" });
  t = await text(R);
  check("freelance: £50k, four-day week, 7.5-hour days → £92.59 an hour, £694 a day, £7,089 a month, £85,067 a year",
    rx(t, /Your hourly rate\s*£([\d,.]+)/) === "92.59" && rx(t, /Your day rate\s*£([\d,]+)/) === "694" && rx(t, /Revenue needed each month\s*£([\d,]+)/) === "7,089" && rx(t, /Revenue needed per year\s*£([\d,]+)/) === "85,067");
  check("freelance: …175 working days and about 919 billable hours", /You work 175 days a year and can bill about 919 hours/.test(t));
  await fillRate({ currency: "USD", takeHome: "80000", ownCosts: "12000", businessCosts: "6000", tax: "28", margin: "0", days: "5", hours: "8", vacation: "3", holidays: "8", sick: "5", billable: "60" });
  t = await text(R);
  check("freelance: $80k with no margin → $120.14 an hour, $961 a day", rx(t, /Your hourly rate\s*\$([\d,.]+)/) === "120.14" && rx(t, /Your day rate\s*\$([\d,]+)/) === "961" && /Safety margin\s*\$0/.test(t));

  await fillRate({ currency: "INR", takeHome: "1200000", ownCosts: "100000", businessCosts: "100000", tax: "20", margin: "10", days: "1", hours: "8", vacation: "30", holidays: "60", sick: "0", billable: "65" });
  check("freelance: more days off than working days is refused", /Your time leaves no working days/.test(await text(R)));
  await fillRate({ days: "8", hours: "17", vacation: "4", holidays: "10", takeHome: "0", tax: "61", billable: "0", margin: "101" });
  t = await text(R);
  check("freelance: a zero goal, 61% tax, 101% margin, 0% billable, 8 days and 17 hours are all refused",
    /Enter an amount greater than zero/.test(t) && /Enter a percentage from 0 to 60/.test(t) && /Enter a percentage from 0 to 100/.test(t) && /Enter a percentage from 1 to 100/.test(t) && /Enter 1 to 7 days a week/.test(t) && /Enter 0\.1 to 16 hours/.test(t) && /Fix the highlighted fields/.test(t));
  await fillRate({ takeHome: "1200000", tax: "20", margin: "10", days: "5", hours: "8", billable: "65", sick: "5" });
  check("freelance: fixing the inputs restores the result", rx(await text(R), /Your hourly rate\s*₹([\d,.]+)/) === "1,621.80");

  await clickText(R, "£50,000 take-home · UK"); await sleep(300);
  check("freelance: a preset sets the currency and the take-home goal", (await b.eval(`document.querySelector('${R} [id$="-currency"]').value`)) === "GBP" && (await b.eval(`document.querySelector('${R} [id$="-takeHome"]').value`)) === "50000");
  await fillRate({ currency: "INR", takeHome: "1200000", ownCosts: "100000", businessCosts: "100000", tax: "20" });

  await exportsWork(R, "freelance", "freelance-rate.png");

  await fillRate({ takeHome: "900000" });
  await b.go(`${BASE}/freelance-rate-calculator/`, 1200); await b.eval(`document.querySelector('${R} input[id$="-takeHome"]').scrollIntoView(), true`); await hydrated(R); await sleep(400);
  check("freelance: the draft survives a reload", (await b.eval(`document.querySelector('${R} [id$="-takeHome"]').value`)) === "900000");

  /* ---------------- mortgage ---------------- */
  const G = "#mortgage-tool";
  await open("/mortgage-calculator/", G);
  check("mortgage: hydrates", await hydrated(G));
  const fillMort = async (v) => { for (const [k, val] of Object.entries(v)) { if (k === "currency") await setSelect(G, "currency", val); else await setField(G, k, val); } await sleep(350); };
  await fillMort({ currency: "USD", start: "2026-11", price: "400000", down: "80000", rate: "6.5", years: "30", tax: "4400", insurance: "1200", hoa: "0", mi: "0", miStop: "80", extra: "", lump: "", lumpMonth: "12" });
  t = await text(G);
  check("mortgage: $400k, 20% down, 6.5%, 30 years, $4,400 tax, $1,200 insurance → $2,489.29 a month", rx(t, /Your monthly payment\s*\$([\d,.]+)/) === "2,489.29", t.slice(0, 600));
  check("mortgage: …principal and interest $2,022.62, tax $366.67, insurance $100.00", /Principal and interest\s*\$2,022\.62/.test(t) && /Property tax\s*\$366\.67/.test(t) && /Home insurance\s*\$100\.00/.test(t));
  check("mortgage: …loan $320,000, interest $408,141, total paid $896,142", rx(t, /Loan amount\s*\$([\d,]+)/) === "320,000" && rx(t, /Total interest\s*\$([\d,]+)/) === "408,141" && rx(t, /Total you pay\s*\$([\d,]+)/) === "896,142");
  check("mortgage: the last payment is Oct 2056", /Last payment: Oct 2056\./.test(t));
  check("mortgage: thirty yearly rows in the schedule", (await b.eval(`(() => { const ts = document.querySelectorAll('${G} article table'); return ts[ts.length - 1].querySelectorAll('tbody tr').length; })()`)) === 30);

  await clickText(G, "10%"); await sleep(300);
  check("mortgage: the 10% chip sets a $40,000 down payment and says so", (await b.eval(`document.querySelector('${G} [id$="-down"]').value`)) === "40000" && /10% of the price/.test(await text(G)));
  await fillMort({ hoa: "150", mi: "0.6", miStop: "80" });
  t = await text(G);
  check("mortgage: 10% down, 0.6% mortgage insurance to 80%, $150 HOA → $3,072.11 a month", rx(t, /Your monthly payment\s*\$([\d,.]+)/) === "3,072.11" && /Mortgage insurance\s*\$180\.00/.test(t));
  check("mortgage: …mortgage insurance is charged for about 7 years 11 months", /charged for about 7 years 11 months/.test(t));
  await fillMort({ extra: "300" });
  t = await text(G);
  check("mortgage: +$300 a month saves $144,407 in interest, 8 years 2 months sooner (Aug 2048 instead of Oct 2056)", /You save \$144,407 in interest and finish 8 years 2 months sooner: Aug 2048 instead of Oct 2056\./.test(t));
  await fillMort({ extra: "", lump: "20000", lumpMonth: "24", price: "300000", down: "9000", rate: "5.9", years: "15", tax: "3000", insurance: "900", hoa: "0", mi: "0.9", miStop: "78" });
  t = await text(G);
  check("mortgage: 15 years, 3% down, a $20k lump after month 24 → $2,983.18 a month, 164 payments", rx(t, /Your monthly payment\s*\$([\d,.]+)/) === "2,983.18" && /sooner/.test(t));

  await fillMort({ price: "0", down: "10", rate: "51", years: "41", mi: "6", lumpMonth: "12", lump: "" });
  t = await text(G);
  check("mortgage: a zero price, 51% rate, 41 years and 6% insurance are refused", /Enter a home price greater than zero/.test(t) && /Enter a rate from 0 to 50/.test(t) && /Enter a term from 1 to 40 years/.test(t) && /Enter a rate from 0 to 5/.test(t) && /Fix the highlighted fields/.test(t));
  await fillMort({ price: "100000", down: "200000", rate: "6.5", years: "30", mi: "0" });
  check("mortgage: a down payment above the price is refused", /The down payment cannot be more than the price/.test(await text(G)));
  await fillMort({ price: "400000", down: "80000", tax: "4400", insurance: "1200", hoa: "0", mi: "0", extra: "", lump: "" });
  check("mortgage: fixing the inputs restores the result", rx(await text(G), /Your monthly payment\s*\$([\d,.]+)/) === "2,489.29");

  await clickText(G, "India home · ₹80 lakh"); await sleep(400);
  t = await text(G);
  check("mortgage: the India preset switches to rupees: ₹52,069.39 principal and interest, ₹64,96,656 interest", (await b.eval(`document.querySelector('${G} [id$="-currency"]').value`)) === "INR" && /Principal and interest\s*₹52,069\.39/.test(t) && rx(t, /Total interest\s*₹([\d,]+)/) === "64,96,656");
  await clickText(G, "US home · $400,000"); await sleep(300);

  await clickText(G, "How much can I afford"); await sleep(300);
  await fillMort({ currency: "USD", income: "120000", debts: "500", front: "28", back: "36", downPct: "20", rate: "6.5", years: "30", taxPct: "1.1", insPct: "0.3", hoa: "0", mi: "0", miStop: "80" });
  t = await text(G);
  check("mortgage: $120k income, $500 debts, 28/36 → a home up to $449,929", rx(t, /You could afford a home up to\s*\$([\d,]+)/) === "449,929", t.slice(0, 500));
  check("mortgage: …a $2,800.00 housing budget, a $359,943 loan and an $89,986 down payment", /Monthly budget for housing\s*\$2,800\.00/.test(t) && rx(t, /Loan amount\s*\$([\d,]+)/) === "359,943" && rx(t, /Down payment\s*\$([\d,]+)/) === "89,986");
  await fillMort({ debts: "2000", income: "60000" });
  check("mortgage: debts that use up the budget leave no room", /no room for a mortgage/.test(await text(G)));
  await fillMort({ income: "120000", debts: "500", front: "101" });
  check("mortgage: an income share above 100% is refused", /Enter a percentage from 0 to 100/.test(await text(G)));
  await fillMort({ front: "28" });
  await clickText(G, "Use this price"); await sleep(400);
  check("mortgage: 'Use this price' fills the price and down payment and returns to the payment view",
    (await b.eval(`document.querySelector('${G} [id$="-price"]').value`)) === "449929" && (await b.eval(`document.querySelector('${G} [id$="-down"]').value`)) === "89986");

  await exportsWork(G, "mortgage", "mortgage-schedule.png");

  await fillMort({ price: "512345" });
  await b.go(`${BASE}/mortgage-calculator/`, 1200); await b.eval(`document.querySelector('${G} input[id$="-price"]').scrollIntoView(), true`); await hydrated(G); await sleep(400);
  check("mortgage: the draft survives a reload", (await b.eval(`document.querySelector('${G} [id$="-price"]').value`)) === "512345");

  /* ---------------- income tax ---------------- */
  const X = "#tax-tool";
  await open("/income-tax-calculator/", X);
  check("income tax: hydrates", await hydrated(X));
  const cleanTax = { salary: "1500000", other: "", basic: "", empNps: "", hra: "", pt: "", c80: "", nps1b: "", selfHealth: "", parentsHealth: "", savInt: "", hlInt: "", edu: "" };
  const fillTax = async (v) => { for (const [k, val] of Object.entries(v)) { if (k === "age") await setSelect(X, "age", val); else await setField(X, k, val); } await sleep(350); };
  await fillTax({ ...cleanTax, age: "under60" });
  await setCheck(X, "Central or a State Government", false); await setCheck(X, "My parent is 60", false); await setCheck(X, "The home loan was taken", true);
  t = await text(X);
  check("income tax: ₹15L salary → new regime ₹97,500 on ₹14,25,000", rx(t, /New regime\s*₹([\d,]+)/) === "97,500" && /on taxable income of ₹14,25,000/.test(t), t.slice(0, 700));
  check("income tax: …old regime ₹2,57,400 with no deductions, so the new regime leaves ₹1,59,900 less", rx(t, /Old regime\s*₹([\d,]+)/) === "2,57,400" && /The new regime leaves ₹1,59,900 less tax on these numbers\./.test(t));
  check("income tax: …about ₹8,125 a month under the lower figure", /about ₹8,125 a month/.test(t));
  check("income tax: the document lists both regimes row by row", ["Gross income\\s*₹15,00,000", "Taxable income\\s*₹14,25,000", "Total tax\\s*₹97,500"].every((p) => new RegExp(p).test(t)));

  await fillTax({ ...cleanTax, salary: "1200000", c80: "150000", nps1b: "50000", selfHealth: "25000", parentsHealth: "50000", hra: "120000", pt: "2400", hlInt: "200000" });
  await setCheck(X, "My parent is 60", true); await sleep(300);
  t = await text(X);
  check("income tax: ₹12L salary with full old-regime deductions → new ₹0, old ₹23,941", rx(t, /New regime\s*₹([\d,]+)/) === "0" && rx(t, /Old regime\s*₹([\d,]+)/) === "23,941" && /The new regime leaves ₹23,941 less tax/.test(t));
  check("income tax: …₹5,52,600 taxable in the old regime", /on taxable income of ₹5,52,600/.test(t));
  await setCheck(X, "My parent is 60", false);

  await fillTax({ ...cleanTax, salary: "1285000" });
  check("income tax: marginal relief: ₹12.85L salary → new regime ₹10,400, not ₹63,960", rx(await text(X), /New regime\s*₹([\d,]+)/) === "10,400");
  await fillTax({ ...cleanTax, salary: "550000" });
  check("income tax: old-regime rebate: ₹5.5L salary → old regime ₹0", rx(await text(X), /Old regime\s*₹([\d,]+)/) === "0");
  await fillTax({ ...cleanTax, salary: "550001" });
  check("income tax: …and one rupee more is a cliff: ₹13,000", rx(await text(X), /Old regime\s*₹([\d,]+)/) === "13,000");

  await fillTax({ ...cleanTax, salary: "900000", age: "senior", savInt: "60000", selfHealth: "60000" });
  check("income tax: a senior with ₹60k deposit interest and ₹60k health premium → old regime ₹62,400", rx(await text(X), /Old regime\s*₹([\d,]+)/) === "62,400");
  await fillTax({ ...cleanTax, salary: "900000", age: "super" });
  check("income tax: a super senior on ₹9L → old regime ₹72,800", rx(await text(X), /Old regime\s*₹([\d,]+)/) === "72,800");

  await fillTax({ ...cleanTax, salary: "1800000", basic: "1000000", empNps: "200000", age: "under60" });
  await setCheck(X, "Central or a State Government", true); await sleep(300);
  check("income tax: employer NPS, government employer: old regime ₹3,07,320 (14% cap)", rx(await text(X), /Old regime\s*₹([\d,]+)/) === "3,07,320");
  await setCheck(X, "Central or a State Government", false); await sleep(300);
  check("income tax: …private employer: ₹3,19,800 (10% cap)", rx(await text(X), /Old regime\s*₹([\d,]+)/) === "3,19,800");

  await fillTax({ ...cleanTax, salary: "5080000" });
  check("income tax: surcharge marginal relief: ₹50.80L salary → new regime ₹11,28,400", rx(await text(X), /New regime\s*₹([\d,]+)/) === "11,28,400");
  await fillTax({ ...cleanTax, salary: "60000000" });
  { const t6 = await text(X); check("income tax: ₹6Cr salary: the new regime's surcharge stops at 25% (₹2,28,24,750) while the old regime pays 37% (₹2,53,57,878)", rx(t6, /New regime\s*₹([\d,]+)/) === "2,28,24,750" && rx(t6, /Old regime\s*₹([\d,]+)/) === "2,53,57,878", t6.slice(0, 400)); }

  await fillTax({ ...cleanTax, salary: "0", c80: "abc" });
  t = await text(X);
  check("income tax: a zero salary and a text deduction are refused", /Enter your yearly salary before tax/.test(t) && /Enter an amount, or leave it empty/.test(t) && /Fix the highlighted fields/.test(t));
  await fillTax({ ...cleanTax });
  check("income tax: fixing the inputs restores the result", rx(await text(X), /New regime\s*₹([\d,]+)/) === "97,500");
  check("income tax: the sources are named and dated on the page", /Rules checked on 2026-11-07/.test(await text(X)));

  await exportsWork(X, "income tax", "income-tax-comparison.png");

  await fillTax({ salary: "2100000" });
  await b.go(`${BASE}/income-tax-calculator/`, 1200); await b.eval(`document.querySelector('${X} input[id$="-salary"]').scrollIntoView(), true`); await hydrated(X); await sleep(400);
  check("income tax: the draft survives a reload", (await b.eval(`document.querySelector('${X} [id$="-salary"]').value`)) === "2100000");

  /* ---------------- HRA ---------------- */
  const A = "#hra-tool";
  await open("/hra-calculator/", A);
  check("HRA: hydrates", await hydrated(A));
  const fillHra = async (v) => { for (const [k, val] of Object.entries(v)) { if (k === "city") await setSelect(A, "city", val); else await setField(A, k, val); } await sleep(350); };
  await fillHra({ basic: "50000", da: "", hra: "20000", rent: "22000", months: "12", city: "listed" });
  t = await text(A);
  check("HRA: ₹50k salary, ₹20k HRA, ₹22k rent, listed city → ₹2,04,000 tax-free, ₹36,000 taxable", rx(t, /Tax-free HRA this year\s*₹([\d,]+)/) === "2,04,000" && rx(t, /HRA that is taxable\s*₹([\d,]+)/) === "36,000", t.slice(0, 600));
  check("HRA: …₹17,000 a month and the three tests are shown", /That is ₹17,000 a month tax-free\./.test(t) && /HRA you actually receive\s*₹2,40,000/.test(t) && /Rent you pay, less 10% of your salary\s*₹2,04,000/.test(t) && /50% of your salary\s*₹3,00,000/.test(t));
  await fillHra({ basic: "60000", hra: "30000", rent: "40000", city: "listed" });
  check("HRA: ₹60k salary, ₹30k HRA, ₹40k rent in a listed city → ₹3,60,000", rx(await text(A), /Tax-free HRA this year\s*₹([\d,]+)/) === "3,60,000");
  await fillHra({ city: "other" });
  t = await text(A);
  check("HRA: …anywhere else 40% is the smallest → ₹2,88,000, ₹72,000 less", rx(t, /Tax-free HRA this year\s*₹([\d,]+)/) === "2,88,000" && /40% of your salary\s*₹2,88,000/.test(t));
  await fillHra({ basic: "40000", da: "10000", hra: "20000", rent: "22000", city: "listed" });
  check("HRA: dearness allowance that counts as salary is added to the basic (₹40k + ₹10k) → ₹2,04,000", rx(await text(A), /Tax-free HRA this year\s*₹([\d,]+)/) === "2,04,000");
  await fillHra({ basic: "50000", da: "", rent: "4000" });
  check("HRA: rent below a tenth of salary → nothing tax-free, all ₹2,40,000 taxable", rx(await text(A), /Tax-free HRA this year\s*₹([\d,]+)/) === "0" && rx(await text(A), /HRA that is taxable\s*₹([\d,]+)/) === "2,40,000");
  await fillHra({ rent: "25000", months: "6" });
  check("HRA: six months of rent → ₹1,20,000", rx(await text(A), /Tax-free HRA this year\s*₹([\d,]+)/) === "1,20,000");
  await fillHra({ basic: "0", months: "13", hra: "abc" });
  t = await text(A);
  check("HRA: a zero salary, 13 months and a text amount are refused", /Enter your monthly basic salary/.test(t) && /Enter 1 to 12 months/.test(t) && /Enter an amount, or leave it empty/.test(t) && /Fix the highlighted fields/.test(t));
  await fillHra({ basic: "50000", da: "", hra: "20000", rent: "22000", months: "12", city: "listed" });
  check("HRA: fixing the inputs restores the result", rx(await text(A), /Tax-free HRA this year\s*₹([\d,]+)/) === "2,04,000");
  check("HRA: the eight cities are named", /The 50% cities are Mumbai, Delhi, Kolkata, Chennai, Bengaluru, Hyderabad, Pune, Ahmedabad\./.test(await text(A)));

  await exportsWork(A, "HRA", "hra-exemption.png");

  await fillHra({ rent: "30000" });
  await b.go(`${BASE}/hra-calculator/`, 1200); await b.eval(`document.querySelector('${A} input[id$="-basic"]').scrollIntoView(), true`); await hydrated(A); await sleep(400);
  check("HRA: the draft survives a reload", (await b.eval(`document.querySelector('${A} [id$="-rent"]').value`)) === "30000");

  /* ---------------- salary ---------------- */
  const Y = "#salary-tool";
  await open("/salary-calculator/", Y);
  check("salary: hydrates", await hydrated(Y));
  const base = { ctc: "1200000", basicPct: "40", hraPct: "50", pt: "2400", rent: "", other80c: "", health: "", hl: "", nps1b: "" };
  const oldOnly = new Set(["rent", "other80c", "health", "hl", "nps1b"]); // only rendered in the old regime
  const fillSal = async (v) => {
    for (const [k, val] of Object.entries(v)) {
      if (oldOnly.has(k) && v.regime !== "old") continue;
      if (k === "regime" || k === "pf") { await setSelect(Y, k, val); if (k === "regime") await sleep(250); } else await setField(Y, k, val);
    }
    await sleep(350);
  };
  await fillSal({ ...base, regime: "new", pf: "full" });
  await setCheck(Y, "includes the employer's gratuity", false);
  t = await text(Y);
  check("salary: ₹12L CTC, 40% basic, HRA 50%, PF on the full basic, new regime → ₹90,200 a month", rx(t, /In-hand salary per month\s*₹([\d,]+)/) === "90,200" && rx(t, /In-hand salary per year\s*₹([\d,]+)/) === "10,82,400", t.slice(0, 600));
  check("salary: …no tax after the rebate, and the old regime would leave ₹79,608", /Income tax is ₹0 a year under the New regime\./.test(t) && /Under the Old regime your in-hand salary would be ₹79,608 a month\./.test(t));
  check("salary: the breakdown: basic ₹4,80,000, HRA ₹2,40,000, special ₹4,22,400, gross ₹11,42,400", ["Basic\\s*₹40,000\\s*₹4,80,000", "House rent allowance\\s*₹20,000\\s*₹2,40,000", "Special allowance\\s*₹35,200\\s*₹4,22,400", "Gross salary\\s*₹95,200\\s*₹11,42,400"].every((p) => new RegExp(p).test(t)));
  check("salary: …employee PF −₹57,600, professional tax −₹2,400, employer PF ₹57,600", /Employee PF\s*−₹4,800\s*−₹57,600/.test(t) && /Professional tax\s*−₹200\s*−₹2,400/.test(t) && /Employer PF\s*₹57,600/.test(t));

  await fillSal({ ...base, ctc: "3000000", basicPct: "50", hraPct: "40", regime: "new", pf: "ceiling" });
  await setCheck(Y, "includes the employer's gratuity", true); await sleep(350);
  t = await text(Y);
  check("salary: ₹30L CTC, PF on the ceiling, gratuity → ₹2,00,951 a month, tax ₹4,42,068", rx(t, /In-hand salary per month\s*₹([\d,]+)/) === "2,00,951" && /Income tax is ₹4,42,068 a year/.test(t));
  check("salary: …employer PF ₹36,000 and gratuity ₹72,115", /Employer PF\s*₹36,000/.test(t) && /Gratuity\s*₹72,115/.test(t));
  await setCheck(Y, "includes the employer's gratuity", false);

  await fillSal({ ctc: "1500000", basicPct: "50", hraPct: "50", pt: "2400", regime: "old", pf: "full", rent: "25000", other80c: "50000", health: "25000", hl: "100000", nps1b: "" });
  await setCheck(Y, "I live in one of the 8 HRA cities", true); await sleep(350);
  t = await text(Y);
  check("salary: ₹15L CTC, old regime with rent, 80C, health and home loan → ₹1,02,345 a month", rx(t, /In-hand salary per month\s*₹([\d,]+)/) === "1,02,345" && /Under the New regime your in-hand salary would be ₹1,02,845 a month\./.test(t));
  check("salary: …taxable income ₹8,67,600 and old-regime tax ₹89,461", /Taxable income after deductions\s*₹8,67,600/.test(t) && /Income tax is ₹89,461 a year under the Old regime\./.test(t));

  await fillSal({ ...base, ctc: "1000000", basicPct: "90", hraPct: "100", regime: "new", pf: "full" });
  check("salary: basic and HRA that exceed the CTC are explained", /Basic, HRA and PF take up more than your CTC/.test(await text(Y)));
  await fillSal({ ctc: "0", basicPct: "0", hraPct: "101", pt: "abc" });
  t = await text(Y);
  check("salary: a zero CTC, 0% basic, 101% HRA and a text amount are refused", /Enter your yearly CTC/.test(t) && /Enter a percentage from 1 to 100/.test(t) && /Enter a percentage from 0 to 100/.test(t) && /Enter an amount, or leave it empty/.test(t) && /Fix the highlighted fields/.test(t));
  await fillSal({ ...base, regime: "new", pf: "full" });
  check("salary: fixing the inputs restores the result", rx(await text(Y), /In-hand salary per month\s*₹([\d,]+)/) === "90,200");

  await exportsWork(Y, "salary", "salary-breakdown.png");

  await fillSal({ ctc: "1800000" });
  await b.go(`${BASE}/salary-calculator/`, 1200); await b.eval(`document.querySelector('${Y} input[id$="-ctc"]').scrollIntoView(), true`); await hydrated(Y); await sleep(400);
  check("salary: the draft survives a reload", (await b.eval(`document.querySelector('${Y} [id$="-ctc"]').value`)) === "1800000");

  /* ---------------- PPF ---------------- */
  const Q = "#ppf-tool";
  await open("/ppf-calculator/", Q);
  check("PPF: hydrates", await hydrated(Q));
  const fillPpf = async (v) => { for (const [k, val] of Object.entries(v)) { if (k === "pattern" || k === "years") await setSelect(Q, k, val); else await setField(Q, k, val); } await sleep(350); };
  await fillPpf({ pattern: "monthlyEarly", deposit: "12500", rate: "7.1", years: "15" });
  t = await text(Q);
  check("PPF: ₹12,500 a month by the 5th, 7.1%, 15 years → ₹39,44,599", rx(t, /Maturity value\s*₹([\d,]+)/) === "39,44,599", t.slice(0, 500));
  check("PPF: …₹22,50,000 deposited and ₹16,94,599 of interest", rx(t, /You deposit\s*₹([\d,]+)/) === "22,50,000" && rx(t, /Interest earned\s*₹([\d,]+)/) === "16,94,599");
  check("PPF: fifteen yearly rows, the first closing at ₹1,55,769 with ₹5,769 interest", (await b.eval(`document.querySelectorAll('${Q} article tbody tr').length`)) === 15 && /1\s*₹1,50,000\s*₹5,769\s*₹1,55,769/.test(t));
  await fillPpf({ pattern: "monthlyLate" });
  check("PPF: depositing after the 5th → ₹39,22,125", rx(await text(Q), /Maturity value\s*₹([\d,]+)/) === "39,22,125");
  await fillPpf({ pattern: "yearlyEarly", deposit: "150000" });
  t = await text(Q);
  check("PPF: ₹1,50,000 once a year by 5 April → ₹40,68,209, interest ₹18,18,209", rx(t, /Maturity value\s*₹([\d,]+)/) === "40,68,209" && rx(t, /Interest earned\s*₹([\d,]+)/) === "18,18,209");
  await fillPpf({ pattern: "monthlyEarly", deposit: "5000", years: "20" });
  t = await text(Q);
  check("PPF: ₹5,000 a month extended to 20 years → ₹25,82,392 over 20 rows", rx(t, /Maturity value\s*₹([\d,]+)/) === "25,82,392" && (await b.eval(`document.querySelectorAll('${Q} article tbody tr').length`)) === 20 && /20 years · extended by 5 years/.test(t));
  await fillPpf({ pattern: "yearlyEarly", deposit: "500", years: "15" });
  check("PPF: the ₹500 minimum → ₹13,561", rx(await text(Q), /Maturity value\s*₹([\d,]+)/) === "13,561");
  await fillPpf({ pattern: "monthlyEarly", deposit: "10000", rate: "0" });
  check("PPF: at 0% interest the maturity is just the deposits, ₹18,00,000", rx(await text(Q), /Maturity value\s*₹([\d,]+)/) === "18,00,000");
  await fillPpf({ deposit: "12550", rate: "7.1" });
  check("PPF: ₹12,550 a month is over the yearly limit", /The yearly total can be at most ₹1,50,000/.test(await text(Q)));
  await fillPpf({ pattern: "yearlyEarly", deposit: "450" });
  check("PPF: ₹450 a year is under the minimum", /The yearly total must be at least ₹500/.test(await text(Q)));
  await fillPpf({ deposit: "525" });
  check("PPF: ₹525 is not a multiple of ₹50", /Deposit in multiples of ₹50/.test(await text(Q)));
  await fillPpf({ deposit: "150000", rate: "16" });
  t = await text(Q);
  check("PPF: a 16% rate is refused and the result is hidden", /Enter a rate from 0 to 15/.test(t) && /Fix the highlighted fields/.test(t));
  await fillPpf({ pattern: "monthlyEarly", deposit: "12500", rate: "7.1", years: "15" });
  check("PPF: fixing the inputs restores the result", rx(await text(Q), /Maturity value\s*₹([\d,]+)/) === "39,44,599");
  check("PPF: the current rate and its date are on the page", /7\.1% for Oct-Dec 2026/.test(await text(Q)) && /Rate checked on 2026-11-07/.test(await text(Q)));

  await exportsWork(Q, "PPF", "ppf-schedule.png");

  await fillPpf({ deposit: "9000" });
  await b.go(`${BASE}/ppf-calculator/`, 1200); await b.eval(`document.querySelector('${Q} select[id$="-pattern"]').scrollIntoView(), true`); await hydrated(Q); await sleep(400);
  check("PPF: the draft survives a reload", (await b.eval(`document.querySelector('${Q} [id$="-deposit"]').value`)) === "9000");

  /* ---------------- retirement ---------------- */
  const W = "#retirement-tool";
  await open("/retirement-calculator/", W);
  check("retirement: hydrates", await hydrated(W));
  const fillRet = async (v) => { for (const [k, val] of Object.entries(v)) await setField(W, k, val); await sleep(350); };
  const retBase = { age: "30", retireAge: "60", endAge: "85", spend: "50000", inflation: "6", savings: "0", monthly: "20000", stepUp: "0", ret: "12", retRet: "8" };
  await fillRet(retBase);
  t = await text(W);
  check("retirement: ₹20,000 a month for 30 years at 12% → ₹7,05,98,275", rx(t, /Your corpus at retirement\s*₹([\d,]+)/) === "7,05,98,275", t.slice(0, 500));
  check("retirement: the corpus needed is ₹6,49,87,807 and the surplus ₹56,10,469", rx(t, /Corpus you need\s*₹([\d,]+)/) === "6,49,87,807" && rx(t, /Surplus\s*₹([\d,]+)/) === "56,10,469");
  check("retirement: ₹50,000 today is ₹2,87,175 a month in the first retirement year; the corpus is ₹1,22,91,875 in today's money", /first retirement year\s*₹2,87,175/.test(t) && /in today's money\s*₹1,22,91,875/.test(t));
  check("retirement: savings last beyond 85, with 30 saving and 25 spending rows", /Your savings last beyond age 85/.test(t) && (await b.eval(`document.querySelectorAll('${W} article tbody tr').length`)) === 55);
  await fillRet({ monthly: "5000" });
  t = await text(W);
  check("retirement: ₹5,000 a month → corpus ₹1,76,49,569, shortfall ₹4,73,38,238", rx(t, /Your corpus at retirement\s*₹([\d,]+)/) === "1,76,49,569" && rx(t, /Shortfall\s*₹([\d,]+)/) === "4,73,38,238");
  check("retirement: runs out at about 65.6 and asks for ₹13,411 more a month", /run out at about age 65\.6/.test(t) && /save about ₹13,411 more/.test(t));
  await fillRet({ stepUp: "10" });
  t = await text(W);
  check("retirement: a 10% yearly step-up → corpus ₹4,41,70,660, shortfall ₹2,08,17,147, runs out at 75.4", rx(t, /Your corpus at retirement\s*₹([\d,]+)/) === "4,41,70,660" && rx(t, /Shortfall\s*₹([\d,]+)/) === "2,08,17,147" && /about age 75\.4/.test(t));
  await fillRet({ monthly: "20000", stepUp: "0" });
  await setCheck(W, "Treat the corpus as NPS", true); await sleep(350);
  t = await text(W);
  check("retirement: NPS non-government, 20% annuity at 6% → lump sum ₹5,64,78,620, annuity ₹1,41,19,655, pension ₹70,598", /Lump sum you can take\s*₹5,64,78,620/.test(t) && /Used to buy an annuity\s*₹1,41,19,655/.test(t) && /Monthly pension from the annuity\s*₹70,598/.test(t));
  await setSelect(W, "subscriber", "government"); await sleep(350);
  t = await text(W);
  check("retirement: government subscribers move to 40% annuity → lump sum ₹4,23,58,965, pension ₹1,41,197", (await b.eval(`document.querySelector('${W} [id$="-annuityPct"]').value`)) === "40" && /Lump sum you can take\s*₹4,23,58,965/.test(t) && /Monthly pension from the annuity\s*₹1,41,197/.test(t));
  await setField(W, "annuityPct", "10"); await sleep(350);
  t = await text(W);
  check("retirement: an annuity share under the minimum is raised to 40%", /Used to buy an annuity\s*₹2,82,39,310/.test(t));
  await setCheck(W, "Treat the corpus as NPS", false); await sleep(250);
  check("retirement: unticking NPS hides the split", !/NPS exit split/.test(await text(W)));
  await fillRet({ age: "17" });
  check("retirement: age 17 is refused", /Enter an age from 18 to 70/.test(await text(W)) && /Fix the highlighted fields/.test(await text(W)));
  await fillRet({ age: "30", retireAge: "30" });
  check("retirement: retiring at your current age is refused", /Retirement age must be above your age/.test(await text(W)));
  await fillRet({ retireAge: "60", endAge: "60" });
  check("retirement: an end age equal to the retirement age is refused", /This must be above your retirement age/.test(await text(W)));
  await fillRet({ endAge: "85", inflation: "25" });
  check("retirement: 25% inflation is refused", /Enter a rate from 0 to 20/.test(await text(W)));
  await fillRet({ inflation: "6", spend: "0" });
  check("retirement: no spending is refused", /Enter your monthly spending/.test(await text(W)));
  await fillRet({ spend: "50000" });
  check("retirement: fixing the inputs restores the result", rx(await text(W), /Your corpus at retirement\s*₹([\d,]+)/) === "7,05,98,275");

  await exportsWork(W, "retirement", "retirement-plan.png");

  await fillRet({ spend: "77000" });
  await b.go(`${BASE}/retirement-calculator/`, 1200); await b.eval(`document.querySelector('${W} input[id$="-age"]').scrollIntoView(), true`); await hydrated(W); await sleep(400);
  check("retirement: the draft survives a reload", (await b.eval(`document.querySelector('${W} [id$="-spend"]').value`)) === "77000");

  /* ---------------- stamp duty ---------------- */
  const Z = "#stamp-tool";
  await open("/stamp-duty-calculator/", Z);
  check("stamp duty: hydrates", await hydrated(Z));
  const fillSd = async (v) => { for (const [k, val] of Object.entries(v)) await setField(Z, k, val); await sleep(350); };
  await fillSd({ value: "8000000", circle: "9000000", stamp: "5", surcharge: "1", reg: "1", cap: "30000", other: "15000" });
  await setCheck(Z, "Charge on the higher of", true); await sleep(250);
  t = await text(Z);
  check("stamp duty: ₹80 lakh price, ₹90 lakh circle rate → total charges ₹5,85,000, ₹85,85,000 with the price", rx(t, /Total charges\s*₹([\d,]+)/) === "5,85,000" && rx(t, /Price plus charges\s*₹([\d,]+)/) === "85,85,000", t.slice(0, 500));
  check("stamp duty: charged on the circle rate, ₹90,00,000, and the charges are 7.31% of the price", /Charged on the circle rate, ₹90,00,000/.test(t) && /7\.31%/.test(t));
  const art = await b.eval(`document.querySelector('${Z} article').innerText`);
  check("stamp duty: the sheet lists duty ₹4,50,000, cess ₹90,000, registration ₹30,000 (capped) and ₹15,000", /Stamp duty\s*5%\s*₹4,50,000/.test(art) && /Surcharge or cess\s*1%\s*₹90,000/.test(art) && /Registration fee\s*capped\s*₹30,000/.test(art) && /Other charges\s*₹15,000/.test(art), art.slice(0, 600));
  await setCheck(Z, "Charge on the higher of", false); await sleep(300);
  t = await text(Z);
  check("stamp duty: with the rule off it is charged on the price → ₹5,25,000, 6.56%", rx(t, /Total charges\s*₹([\d,]+)/) === "5,25,000" && /Charged on the price, ₹80,00,000/.test(t) && /6\.56%/.test(t));
  await fillSd({ value: "5000000", circle: "", stamp: "6", surcharge: "0", reg: "1", cap: "", other: "0" });
  t = await text(Z);
  check("stamp duty: ₹50 lakh, 6% and 1% → ₹3,50,000, 7.00%, ₹53,50,000", rx(t, /Total charges\s*₹([\d,]+)/) === "3,50,000" && /7\.00%/.test(t) && rx(t, /Price plus charges\s*₹([\d,]+)/) === "53,50,000");
  check("stamp duty: no surcharge row when there is none", !/Surcharge or cess\s*\d/.test(await b.eval(`document.querySelector('${Z} article').innerText`)));
  await fillSd({ value: "" });
  check("stamp duty: an empty price is refused", /Enter the price in the agreement/.test(await text(Z)));
  await fillSd({ value: "5000000", stamp: "30" });
  check("stamp duty: a 30% rate is refused", /Enter a rate from 0 to 25, for example 5/.test(await text(Z)));
  await fillSd({ stamp: "6", cap: "abc" });
  check("stamp duty: a non-number cap is refused", /Enter an amount, or leave it empty/.test(await text(Z)));
  await fillSd({ cap: "" });
  check("stamp duty: fixing the inputs restores the result", rx(await text(Z), /Total charges\s*₹([\d,]+)/) === "3,50,000");
  check("stamp duty: a note says the rates are examples", /only examples/.test(await text(Z)));

  await exportsWork(Z, "stamp duty", "stamp-duty-estimate.png");

  await fillSd({ other: "2500" });
  await b.go(`${BASE}/stamp-duty-calculator/`, 1200); await b.eval(`document.querySelector('${Z} input[id$="-value"]').scrollIntoView(), true`); await hydrated(Z); await sleep(400);
  check("stamp duty: the draft survives a reload", (await b.eval(`document.querySelector('${Z} [id$="-other"]').value`)) === "2500");

  /* ---------------- regional languages ---------------- */
  const M = "main";
  await open("/hi/home-loan-calculator/", M);
  await setField(M, "start", "2026-11"); await setField(M, "amount", "1000000"); await setField(M, "rate", "9"); await setField(M, "years", "20"); await setField(M, "extra", "5000"); await sleep(350);
  t = await text(M);
  check("home loan (hi): translated UI with the same numbers", /होम लोन प्लानर/.test(t) && /मासिक EMI\s*₹8,997/.test(t) && /₹7,21,616 का ब्याज बचाते हैं/.test(t) && /11 वर्ष 5 महीने पहले खत्म हो जाएगा/.test(t));
  check("home loan (hi): preset chips are translated", /₹30 लाख · 20 वर्ष/.test(t));
  await open("/hi/education-loan-calculator/", M);
  await setField(M, "start", "2026-11");
  await clickText(M, "कोर्स के हर साल"); // the draft from the English run is restored here, so choose the yearly payout explicitly
  await sleep(300);
  t = await text(M);
  check("education loan (hi): translated UI with the same numbers", /एजुकेशन लोन प्लानर/.test(t) && /मोरेटोरियम के बाद की EMI\s*₹33,255/.test(t) && /EMI ₹7,376 घट जाती है/.test(t));
  await open("/hi/education-cost-calculator/", M);
  await setSelect(M, "currency", "INR");
  await setField(M, "cost", "1000000"); await setField(M, "until", "10"); await setField(M, "course", "4"); await setField(M, "rise", "8"); await setField(M, "ret", "10"); await setField(M, "saved", "500000"); await sleep(350);
  t = await text(M);
  check("education cost (hi): translated UI with the same numbers", /पढ़ाई के खर्च का प्लानर/.test(t) && /हर महीने बचाएँ\s*₹34,156/.test(t) && /₹40,199 हो जाती है/.test(t));
  await open("/hi/fd-calculator/", M);
  await clickIn(M, "ब्याज कैसे मिलेगा", "परिपक्वता पर"); await clickIn(M, "ब्याज जमा राशि में जुड़ता है", "हर तिमाही");
  await setField(M, "start", "2026-11"); await setField(M, "amount", "500000"); await setField(M, "rate", "7"); await setField(M, "years", "3"); await setField(M, "months", "0"); await setField(M, "tax", "0"); await sleep(350);
  t = await text(M);
  check("FD (hi): translated UI with the same numbers", /FD प्लानर/.test(t) && /परिपक्वता राशि\s*₹6,15,720/.test(t) && /कमाया हुआ ब्याज\s*₹1,15,720/.test(t) && /Nov 2029 में परिपक्व होगा/.test(t));
  await open("/hi/rd-calculator/", M);
  await setField(M, "amount", "5000"); await setField(M, "rate", "7"); await setField(M, "years", "5"); await setField(M, "months", "0"); await sleep(350);
  t = await text(M);
  check("RD (hi): translated UI with the same numbers", /RD प्लानर/.test(t) && /परिपक्वता राशि\s*₹3,59,664/.test(t));
  await open("/hi/freelance-rate-calculator/", M);
  await setSelect(M, "currency", "INR");
  for (const [k, val] of Object.entries({ takeHome: "1200000", ownCosts: "100000", businessCosts: "100000", tax: "20", margin: "10", days: "5", hours: "8", vacation: "4", holidays: "10", sick: "5", billable: "65" })) await setField(M, k, val);
  await sleep(350);
  t = await text(M);
  check("freelance (hi): translated UI with the same numbers", /फ्रीलांस रेट कैलकुलेटर/.test(t) && /आपका प्रति घंटा रेट\s*₹1,621\.80/.test(t) && /सालाना चाहिए आमदनी\s*₹18,97,500/.test(t));
  await open("/hi/mortgage-calculator/", M);
  for (const [k, val] of Object.entries({ price: "400000", down: "80000", rate: "6.5", years: "30", tax: "4400", insurance: "1200", hoa: "0", mi: "0", miStop: "80", extra: "", lump: "" })) await setField(M, k, val);
  await setSelect(M, "currency", "USD"); await sleep(350);
  t = await text(M);
  check("mortgage (hi): translated UI with the same numbers", /मॉर्गेज कैलकुलेटर/.test(t) && /आपकी मासिक किस्त\s*\$2,489\.29/.test(t) && /मूलधन और ब्याज\s*\$2,022\.62/.test(t));
  await open("/hi/income-tax-calculator/", M);
  for (const [k, val] of Object.entries({ salary: "1500000", other: "", basic: "", empNps: "", hra: "", pt: "", c80: "", nps1b: "", selfHealth: "", parentsHealth: "", savInt: "", hlInt: "", edu: "" })) await setField(M, k, val);
  await sleep(350);
  t = await text(M);
  check("income tax (hi): translated UI with the same numbers", /इनकम टैक्स कैलकुलेटर/.test(t) && /नई व्यवस्था\s*₹97,500/.test(t) && /पुरानी व्यवस्था\s*₹2,57,400/.test(t));
  await open("/hi/hra-calculator/", M);
  await setSelect(M, "city", "listed");
  for (const [k, val] of Object.entries({ basic: "50000", da: "", hra: "20000", rent: "22000", months: "12" })) await setField(M, k, val);
  await sleep(350);
  t = await text(M);
  check("HRA (hi): translated UI with the same numbers", /HRA छूट कैलकुलेटर/.test(t) && /इस साल का टैक्स-फ़्री HRA\s*₹2,04,000/.test(t));
  await open("/hi/salary-calculator/", M);
  await setSelect(M, "regime", "new"); await setSelect(M, "pf", "full");
  for (const [k, val] of Object.entries({ ctc: "1200000", basicPct: "40", hraPct: "50", pt: "2400" })) await setField(M, k, val);
  await sleep(350);
  t = await text(M);
  check("salary (hi): translated UI with the same numbers", /सैलरी कैलकुलेटर/.test(t) && /हर महीने हाथ में आने वाला वेतन\s*₹90,200/.test(t));
  await open("/hi/ppf-calculator/", M);
  await setSelect(M, "pattern", "monthlyEarly"); await setSelect(M, "years", "15");
  await setField(M, "deposit", "12500"); await setField(M, "rate", "7.1"); await sleep(350);
  t = await text(M);
  check("PPF (hi): translated UI with the same numbers", /PPF कैलकुलेटर/.test(t) && /परिपक्वता राशि\s*₹39,44,599/.test(t));
  await open("/hi/retirement-calculator/", M);
  for (const [k, val] of Object.entries({ age: "30", retireAge: "60", endAge: "85", spend: "50000", inflation: "6", savings: "0", monthly: "20000", stepUp: "0", ret: "12", retRet: "8" })) await setField(M, k, val);
  await sleep(350);
  t = await text(M);
  check("retirement (hi): translated UI with the same numbers", /रिटायरमेंट कैलकुलेटर/.test(t) && /रिटायरमेंट पर आपका कोष\s*₹7,05,98,275/.test(t));
  await open("/hi/stamp-duty-calculator/", M);
  for (const [k, val] of Object.entries({ value: "5000000", circle: "", stamp: "6", surcharge: "0", reg: "1", cap: "", other: "0" })) await setField(M, k, val);
  await sleep(350);
  t = await text(M);
  check("stamp duty (hi): translated UI with the same numbers", /स्टांप ड्यूटी कैलकुलेटर/.test(t) && /कुल शुल्क\s*₹3,50,000/.test(t));
  for (const [lang, marker] of [["ta", "கல்விக் கடன் திட்டமிடல்"], ["te", "విద్యా రుణ ప్లానర్"], ["mr", "शैक्षणिक कर्ज प्लॅनर"]]) {
    await open(`/${lang}/education-loan-calculator/`, M);
    check(`education loan (${lang}): translated UI`, (await text(M)).includes(marker) && (await b.eval("document.documentElement.lang")) === lang);
  }

  /* ---------------- phone width ---------------- */
  await b.mobile(true);
  for (const [path, root] of [["/home-loan-calculator/", H], ["/education-loan-calculator/", E], ["/education-cost-calculator/", P], ["/fd-calculator/", D], ["/rd-calculator/", D], ["/freelance-rate-calculator/", R], ["/mortgage-calculator/", G], ["/income-tax-calculator/", X], ["/hra-calculator/", A], ["/salary-calculator/", Y], ["/ppf-calculator/", Q], ["/retirement-calculator/", "#retirement-tool"], ["/stamp-duty-calculator/", "#stamp-tool"]]) {
    await open(path, root);
    await sleep(300);
    check(`${path} at 390px: no horizontal overflow`, (await overflow()) <= 1, String(await overflow()));
    check(`${path} at 390px: field text is 16px (no zoom on focus)`, await b.eval(`[...document.querySelectorAll('${root} input[inputmode], ${root} input[type=month], ${root} select')].every((el) => parseFloat(getComputedStyle(el).fontSize) >= 16)`));
    check(`${path} at 390px: buttons are at least 24px tall`, await b.eval(`[...document.querySelectorAll('${root} button')].every((x) => x.getBoundingClientRect().height >= 24)`));
    await b.shot(`${path.replace(/\//g, "")}-mobile.png`);
  }
  await b.mobile(false);

  /* ---------------- privacy ---------------- */
  check("nothing typed or computed left the page (no outside requests)", outsiders().length === 0, outsiders().join(" | "));
  check("no console errors anywhere", consoleErrors().length === 0, consoleErrors().join(" | "));
} catch (error) {
  { const text = String(error); check("test script ran to completion", false, text.length > 700 ? `${text.slice(0, 300)} … ${text.slice(-400)}` : text); }
} finally {
  b.close();
}
process.exit(check.report());
