// scripts/e2e/loans-e2e.mjs: the home loan, education loan and education cost calculators in a real browser. Static suite: serve the build and run
//   BASE=http://localhost:4400 node scripts/e2e/loans-e2e.mjs
// Expected figures come from the independent Python Decimal vectors used by `npm run test:loan` (2026-11-06), with the
// course/first-EMI month pinned to Nov 2026 so the month labels do not depend on today's date. It covers the built pages in
// all five languages, hydration, both modes, validation, exports (downloads are denied and the blobs are inspected instead),
// draft persistence, a 390px phone width, and that nothing typed is requested or leaves the page.
import { checker, sleep, startBrowser } from "./cdp-lib.mjs";

const BASE = process.env.BASE || "http://localhost:4400";
const b = await startBrowser();
const check = checker();
const text = (root) => b.eval(`document.querySelector(${JSON.stringify(root)}).innerText`);
const hydrated = (root, ms = 10000) =>
  b.waitFor(`(() => { const r = document.querySelector(${JSON.stringify(root)}); return !!r && !!r.querySelector('input[id$="-amount"]') && ![...document.querySelectorAll('astro-island')].some((i) => i.hasAttribute('ssr')); })()`, ms);
const open = async (path, root) => { await b.go(`${BASE}${path}`, 1200); await b.eval(`(document.querySelector('input[id$="-amount"]') || document.querySelector(${JSON.stringify(root)})).scrollIntoView(), true`); await hydrated(root); };
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
  const buttons = ["Schedule PDF", "Plan PDF"];
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
  for (const slug of ["home-loan-calculator", "education-loan-calculator", "education-cost-calculator"]) {
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
  for (const [lang, marker] of [["ta", "கல்விக் கடன் திட்டமிடல்"], ["te", "విద్యా రుణ ప్లానర్"], ["mr", "शैक्षणिक कर्ज प्लॅनर"]]) {
    await open(`/${lang}/education-loan-calculator/`, M);
    check(`education loan (${lang}): translated UI`, (await text(M)).includes(marker) && (await b.eval("document.documentElement.lang")) === lang);
  }

  /* ---------------- phone width ---------------- */
  await b.mobile(true);
  for (const [path, root] of [["/home-loan-calculator/", H], ["/education-loan-calculator/", E], ["/education-cost-calculator/", P]]) {
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
  check("test script ran to completion", false, String(error).slice(0, 600));
} finally {
  b.close();
}
process.exit(check.report());
