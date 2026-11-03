// scripts/e2e/gstin-e2e.mjs: the GSTIN validator and decoder in a real browser. Static suite: serve the build and run
//   BASE=http://localhost:4411 node scripts/e2e/gstin-e2e.mjs
// It covers the built HTML (head, schema, links, locales), hydration, every status and note against published and
// synthetic GSTINs, the list mode (counts, cap, copy, CSV and its formula guard), the Hindi, Tamil, Telugu and Marathi
// pages, a 390px phone width, and that nothing is requested, stored or put in the address.
import { readFileSync } from "node:fs";
import { checker, sleep, startBrowser } from "./cdp-lib.mjs";

const BASE = process.env.BASE || "http://localhost:4400";
const SAMPLE = "27AAAAA0000A1Z2";
const b = await startBrowser();
const check = checker();
const html = (path) => readFileSync(new URL(`../../.vercel/output/static/${path}`, import.meta.url), "utf8");
const text = () => b.eval("document.body.innerText");
const hydrated = (ms = 10000) =>
  b.waitFor("!!document.querySelector('[data-gstin-input]') && ![...document.querySelectorAll('astro-island')].some((i) => i.hasAttribute('ssr'))", ms);
const typeInto = (selector, value) => b.eval(`(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);
const setGstin = async (value) => { await typeInto("[data-gstin-input]", value); await b.eval("document.querySelector('[data-gstin-input]').dispatchEvent(new FocusEvent('focusout', { bubbles: true })); true"); await sleep(80); };
const clickSel = (selector) => b.eval(`document.querySelector(${JSON.stringify(selector)}).click(), true`);
const status = () => b.eval("document.querySelector('[data-gstin-status]')?.getAttribute('data-gstin-status') ?? ''");
const headline = () => b.eval("document.querySelector('[data-gstin-status]')?.textContent ?? ''");
const issues = () => b.eval("[...document.querySelectorAll('[data-gstin-issues] li')].map((li) => li.textContent)");
const notes = () => b.eval("document.querySelector('[data-gstin-notes]')?.textContent ?? ''");
const parts = () => b.eval("Object.fromEntries([...document.querySelectorAll('[data-gstin-parts] > div')].map((d) => [d.querySelector('dt').textContent, d.querySelector('dd').textContent]))");
const rows = () => b.eval("[...document.querySelectorAll('[data-gstin-row]')].map((tr) => ({ status: tr.getAttribute('data-gstin-row'), cells: [...tr.children].map((td) => td.textContent) }))");
const scrollTo = (selector) => b.eval(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 84, behavior: 'instant' }); return true; })()`);
const overflow = () => b.eval("document.documentElement.scrollWidth - window.innerWidth");
const consoleErrors = () => b.errors.filter((e) => !/clerk|ERR_BLOCKED|Failed to load/i.test(e));
const outsiders = () => b.requests.filter((u) => !/^(http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/|blob:|data:)/.test(u));

try {
  await b.send("Network.setBlockedURLs", { urls: ["*clerk.accounts.dev*", "*clerk.browser.js*"] });
  // The page's copy and download buttons use these two browser APIs: capture what they are given.
  await b.send("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.__csv = null; window.__csvHead = null; window.__copied = null;
    const realCreate = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      blob.text().then((t) => { window.__csv = t; });
      blob.slice(0, 3).arrayBuffer().then((buf) => { window.__csvHead = [...new Uint8Array(buf)]; });
      return realCreate(blob);
    };
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t) => { window.__copied = t; } }, configurable: true });
  ` });

  /* ---------- built HTML (the python server sends no vercel.json headers, so only markup is asserted here) ---------- */
  const page = html("gstin-validator/index.html");
  const head = page.slice(0, page.indexOf("</head>"));
  check("one h1", (page.match(/<h1[\s>]/g) ?? []).length === 1);
  check("h1 is the validator and decoder", /<h1[^>]*>GSTIN validator and decoder<\/h1>/.test(page));
  check("title is 55 characters and leads with the tool", head.includes("<title>GSTIN Validator &amp; Decoder: Check GST Number, State, PAN</title>"));
  const description = head.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? "";
  check("description is 70-170 characters", description.length >= 70 && description.length <= 170, String(description.length));
  check("canonical is the page", head.includes('<link rel="canonical" href="https://www.proupiqr.in/gstin-validator/"'));
  check("indexable", /<meta name="robots" content="index, follow/.test(head));
  const ld = [...page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  check("exactly one BreadcrumbList on the page", ld.join("\n").split('"@type":"BreadcrumbList"').length - 1 === 1);
  const graph = JSON.parse(ld.find((s) => s.includes('"WebApplication"')) ?? "{}")["@graph"] ?? [];
  const app = graph.find((n) => n["@type"] === "WebApplication");
  check("WebApplication: free, no rating, author and publisher linked", app && app.offers.price === "0" && app.aggregateRating === undefined && app.review === undefined && app.author?.name === "Kunal Siyag" && app.publisher?.["@id"] === "https://www.proupiqr.in/#organization" && app.dateModified === "2026-11-01");
  const faqNode = graph.find((n) => n["@type"] === "FAQPage");
  check("FAQPage has 9 questions", faqNode?.mainEntity?.length === 9);
  const visibleFaq = (page.match(/<details[\s>]/g) ?? []).length;
  const decoded = page.replaceAll("&quot;", '"').replaceAll("&#39;", "'").replaceAll("&amp;", "&");
  check("every FAQ question and answer is visible on the page", visibleFaq === 9 && faqNode.mainEntity.every((q) => decoded.includes(`>${q.name}</summary>`) && decoded.includes(q.acceptedAnswer.text)));
  const crumbs = graph.find((n) => n["@type"] === "BreadcrumbList")?.itemListElement ?? [];
  check("breadcrumb: Home, All Tools, tool; last = canonical", crumbs.length === 3 && crumbs[2].item === "https://www.proupiqr.in/gstin-validator/" && crumbs[1].item === "https://www.proupiqr.in/tools/");
  check("HowTo steps are visible on the page", graph.find((n) => n["@type"] === "HowTo")?.step?.every((s) => page.includes(s.name.slice(0, 40))));
  const noticeText = "Format and check digit only. This does not show that a GSTIN is registered.";
  check("the one-line limit sits in the server-rendered HTML, above the input", page.includes(noticeText) && page.indexOf(noticeText) < page.indexOf("data-gstin-input"));
  const outbound = [...page.matchAll(/<a\s[^>]*target="_blank"[^>]*>/g)].map((m) => m[0]);
  check("every link that leaves the page is noopener noreferrer nofollow", outbound.length >= 10 && outbound.every((a) => /rel="noopener noreferrer nofollow"/.test(a)), String(outbound.length));
  check("the portal link has no identifier in it", outbound.some((a) => a.includes('href="https://services.gst.gov.in/services/searchtp"')));
  check("no form, no iframe, no script from another host", !/<form[\s>]|<iframe/.test(page) && ![...page.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].some((m) => /^https?:/.test(m[1])));
  const mainWords = page.slice(page.indexOf("<main"), page.indexOf("</main>")).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
  check("main content has 700+ words of visible text", mainWords >= 700, String(mainWords));
  for (const lang of ["hi", "ta", "te", "mr"]) {
    const localized = html(`${lang}/gstin-validator/index.html`);
    check(`${lang} page exists and is indexable`, /<meta name="robots" content="index, follow/.test(localized) && localized.includes(`<html lang="${lang}"`));
  }
  check("es page is noindex (India-only tool)", /<meta name="robots" content="noindex, follow"/.test(html("es/gstin-validator/index.html")));
  const sitemap = html("sitemap.xml");
  check("sitemap lists the page and its hi, ta, te, mr versions", ["", "hi/", "ta/", "te/", "mr/"].every((p) => sitemap.includes(`<loc>https://www.proupiqr.in/${p}gstin-validator/</loc>`)));
  check("sitemap has no es page", !sitemap.includes("/es/gstin-validator/"));

  /* ---------- the page, desktop ---------- */
  await b.go(`${BASE}/gstin-validator/`, 1500);
  check("island hydrated", await hydrated());
  check("H1 renders", (await b.eval("document.querySelector('h1').textContent")) === "GSTIN validator and decoder");
  // Astro drops the newline whitespace around an inline link, so a missing {" "} shows up as "thee-way bill list".
  const runTogether = await b.eval(`(() => {
    const bad = [];
    for (const a of document.querySelectorAll('main a')) {
      const prev = a.previousSibling, next = a.nextSibling;
      if (prev && prev.nodeType === 3 && /[A-Za-z0-9]$/.test(prev.textContent)) bad.push('before: ' + a.textContent);
      if (next && next.nodeType === 3 && /^[A-Za-z0-9]/.test(next.textContent)) bad.push('after: ' + a.textContent);
    }
    return bad.join(' | ');
  })()`);
  check("no inline link runs into the words around it", runTogether === "", runTogether);
  check("the state-code lists are introduced in one readable sentence", /the e-way bill state code list and the e-invoice master codes\./.test(await b.eval("document.querySelector('#state-codes p').innerText")));
  check("the limit is visible above the tool", await b.eval(`(() => { const n = document.querySelector('[data-gstin-notice]'); const i = document.querySelector('[data-gstin-input]'); const r = n.getBoundingClientRect(); return n.offsetParent !== null && r.height > 0 && r.bottom <= i.getBoundingClientRect().top; })()`));
  check("notice text matches", (await b.eval("document.querySelector('[data-gstin-notice]').textContent")) === noticeText);
  await sleep(500);
  const requestsAtStart = b.requests.length;
  check("starts empty: hint, no result", /Type or paste a GSTIN to see what its 15 characters say\./.test(await b.eval("document.querySelector('[data-gstin-result]').innerText")) && (await status()) === "");
  check("input is labelled and linked to the result", await b.eval(`(() => { const i = document.querySelector('[data-gstin-input]'); const l = document.querySelector('label[for="' + i.id + '"]'); return !!l && /GSTIN \\(15 characters\\)/.test(l.textContent) && document.getElementById(i.getAttribute('aria-describedby')) === document.querySelector('[data-gstin-result]'); })()`));
  check("result is a polite live region", await b.eval("(() => { const r = document.querySelector('[data-gstin-live]'); return r.getAttribute('role') === 'status' && r.getAttribute('aria-live') === 'polite'; })()"));
  check("the list summary is a polite live region too", await b.eval("(() => { const r = document.querySelector('[data-gstin-summary]'); return r.getAttribute('role') === 'status' && r.getAttribute('aria-live') === 'polite'; })()"));

  // Real keystrokes (not a value setter): the React handler sees them.
  await b.eval("document.querySelector('[data-gstin-input]').focus(), true");
  await b.send("Input.insertText", { text: "27AAACR5055K" });
  await sleep(120);
  check("while typing: a quiet progress count, no verdict", (await status()) === "" && /12 of 15 characters so far\./.test(await b.eval("document.querySelector('[data-gstin-result]').innerText")));
  await b.send("Input.insertText", { text: "1Z7" });
  await sleep(120);
  check("typing the 15th character shows the result", (await status()) === "ok" && (await headline()) === "Format and check digit OK");
  await b.eval("document.querySelector('[data-gstin-clear]').click(), true");
  await sleep(80);
  check("Clear empties the field and the result", (await b.eval("document.querySelector('[data-gstin-input]').value")) === "" && (await status()) === "");
  await typeInto("[data-gstin-input]", "27AAACR5055K1");
  await sleep(80);
  check("13 characters: still just the count", (await status()) === "" && /13 of 15 characters so far\./.test(await text()));
  await b.eval("document.querySelector('[data-gstin-input]').dispatchEvent(new FocusEvent('focusout', { bubbles: true })), true");
  await sleep(80);
  check("moving on settles it: length problem", (await status()) === "format" && (await issues()).includes("A GSTIN has 15 characters. This has 13."));
  await b.eval("document.querySelector('[data-gstin-clear]').click(), true");

  await clickSel("[data-gstin-sample]");
  await sleep(100);
  check("sample button fills the made-up GSTIN", (await b.eval("document.querySelector('[data-gstin-input]').value")) === SAMPLE);
  check("sample reads Format and check digit OK", (await status()) === "ok" && (await headline()) === "Format and check digit OK");
  const sampleParts = await parts();
  check("decoded: state", sampleParts["State or UT (characters 1-2)"] === "27 · Maharashtra", JSON.stringify(sampleParts));
  check("decoded: PAN", sampleParts["PAN (characters 3-12)"] === "AAAAA0000A");
  check("decoded: holder type", sampleParts["Holder type (PAN's 4th letter)"] === "A · association of persons (AOP)");
  check("decoded: entity, 14th and check digit", sampleParts["Entity number (13th character)"] === "1 · Registration number 1 under this PAN in this state" && sampleParts["14th character"] === "Z · the usual letter" && sampleParts["Check digit (15th character)"] === "2 · matches the other 14 characters");
  check("the limit and the portal link sit beside the result", await b.eval(`(() => { const r = document.querySelector('[data-gstin-result]'); const a = r.querySelector('a[href="https://services.gst.gov.in/services/searchtp"]'); return /Format and check digit only\\. This does not show that the GSTIN is registered or whose it is\\./.test(r.innerText) && !!a && a.target === '_blank' && a.rel === 'noopener noreferrer nofollow'; })()`));
  await b.shot("gstin-desktop.png");
  await scrollTo("[data-gstin-result]");
  await sleep(150);
  await b.shot("gstin-desktop-result.png");
  await scrollTo("[data-gstin-input]");

  const VECTORS = [
    ["27AAACR5055K1Z7", "ok", { "State or UT (characters 1-2)": "27 · Maharashtra", "PAN (characters 3-12)": "AAACR5055K", "Holder type (PAN's 4th letter)": "C · company" }],
    ["36AAACR4849R1ZM", "ok", { "State or UT (characters 1-2)": "36 · Telangana" }],
    ["37AAACA4651L1ZL", "ok", { "State or UT (characters 1-2)": "37 · Andhra Pradesh" }],
    ["38AAACN0255D1ZV", "ok", { "State or UT (characters 1-2)": "38 · Ladakh" }],
    ["07AAACT3991J1Z0", "ok", { "State or UT (characters 1-2)": "07 · Delhi", "Check digit (15th character)": "0 · matches the other 14 characters" }],
    ["26AABCG0675P1Z9", "ok", { "State or UT (characters 1-2)": "26 · Dadra and Nagar Haveli and Daman and Diu" }],
    ["27AAPFU0939F1ZV", "ok", { "Holder type (PAN's 4th letter)": "F · firm or LLP" }],
    ["97AAACO1598A1DP", "ok", { "State or UT (characters 1-2)": "97 · Other Territory", "14th character": "D · unusual here" }, "The 14th character is D. Most GSTINs have Z here."],
    ["27AAACR4849R1CW", "ok", { "14th character": "C · unusual here" }, "The 14th character is C."],
    ["28AAACR5055K1Z5", "ok", { "State or UT (characters 1-2)": "28 · Not in the state list" }, "Code 28 is not in the GST-era state lists."],
    ["99AAACR5055K1ZW", "ok", {}, "Codes 96 and 99 are not states: the e-invoice master list names both OTHER COUNTRIES"],
    ["27AAACR5055K1Z8", "checksum", { "Check digit (15th character)": "8 · does not match the other 14 characters" }],
    ["29ABCDE1234F1Z5", "checksum", { "State or UT (characters 1-2)": "29 · Karnataka", "Holder type (PAN's 4th letter)": "D · Not a usual holder type" }, "The 4th letter of the PAN (D) is not one of the usual holder types"],
    ["27AAACR5055K0Z8", "ok", {}, "The 13th character is 0."],
    ["  27-aaacr 5055k1z7 ", "ok", { "PAN (characters 3-12)": "AAACR5055K" }],
    ["27AAACR5055K1Z7\u200b", "ok", { "PAN (characters 3-12)": "AAACR5055K" }],
  ];
  for (const [typed, expected, expectedParts, expectedNote] of VECTORS) {
    await setGstin(typed);
    const shown = await parts();
    check(`${JSON.stringify(typed.trim())} reads ${expected}`, (await status()) === expected, await headline());
    for (const [term, value] of Object.entries(expectedParts)) check(`  ${typed.trim()}: ${term}`, shown[term] === value, String(shown[term]));
    if (expectedNote) {
      const all = `${await notes()} ${(await issues()).join(" ")}`;
      check(`  ${typed.trim()}: note "${expectedNote.slice(0, 40)}"`, all.includes(expectedNote), all.slice(0, 160));
    }
  }
  await setGstin("27AAACR5055K1Z8");
  check("a wrong check digit never shows the right one or a corrected number", !/27AAACR5055K1Z7/.test(await b.eval("document.querySelector('[data-gstin-result]').innerText")) && !(await b.eval("document.body.innerHTML")).includes("27AAACR5055K1Z7"));
  check("a mismatch says to compare the number with the source, not what to type", /Compare the number with your invoice or certificate\./.test(await b.eval("document.querySelector('[data-gstin-result]').innerText")));
  for (const [typed, expectedIssues] of [
    ["27AAACR5055K1Z", ["A GSTIN has 15 characters. This has 14."]],
    ["27AAACR5055K1Z77", ["A GSTIN has 15 characters. This has 16."]],
    ["27AAACR5055K1Z!", ["Position 15: only letters A to Z and digits 0 to 9 are allowed."]],
    ["A7AAAAA0000A1Z2", ["Position 1: the state code is two digits, not a letter."]],
    ["27AAAA10000A1Z2", ["Position 7: the PAN has a letter here, not a digit."]],
    ["27AAAAA000AA1Z2", ["Position 11: the PAN has a digit here, not a letter."]],
  ]) {
    await setGstin(typed);
    const got = await issues();
    check(`${typed} lists: ${expectedIssues[0]}`, (await status()) === "format" && expectedIssues.every((line) => got.includes(line)), JSON.stringify(got));
  }
  check("single mode did not request anything", b.requests.length === requestsAtStart, `${requestsAtStart} -> ${b.requests.length}`);
  check("no GSTIN in any request", !b.requests.some((u) => /AAACR5055K|AAAAA0000A/i.test(u)));

  /* ---------- list mode ---------- */
  await b.eval("document.querySelector('[data-gstin-clear]').click(), true");
  await clickSel("[data-gstin-run]");
  await sleep(80);
  check("empty list: asks for at least one GSTIN", /Paste at least one GSTIN, then choose Check list\./.test(await b.eval("document.querySelector('[data-gstin-summary]').innerText")) && (await b.eval("document.querySelectorAll('[data-gstin-table]').length")) === 0);
  await clickSel("[data-gstin-list-sample]");
  await typeInto("[data-gstin-list]", `${SAMPLE}\n27AAAAA0000A1Z3, 27AAAAA0000A1Z\t07AAACT3991J1Z0;97AAACO1598A1DP\n\n   \n`);
  await clickSel("[data-gstin-run]");
  await sleep(120);
  check("summary counts", (await b.eval("document.querySelector('[data-gstin-summary]').innerText")).startsWith("5 checked: 3 OK, 1 check digit mismatches, 1 with format problems."));
  const table = await rows();
  check("rows in order with their statuses", JSON.stringify(table.map((r) => r.status)) === JSON.stringify(["ok", "checksum", "format", "ok", "ok"]), JSON.stringify(table.map((r) => r.status)));
  check("row: line, as typed, state, status", JSON.stringify(table[0].cells.slice(0, 4)) === JSON.stringify(["1", SAMPLE, "27 Maharashtra", "Format and check digit OK"]) && table[3].cells[2] === "07 Delhi" && table[4].cells[2] === "97 Other Territory" && table[1].cells[0] === "2", JSON.stringify(table[0].cells));
  check("row details say why", table[2].cells[4] === "A GSTIN has 15 characters. This has 14." && table[4].cells[4].startsWith("The 14th character is D."));
  check("table is a labelled, keyboard-scrollable region with column headers", await b.eval("(() => { const w = document.querySelector('[data-gstin-table]').parentElement; return w.getAttribute('role') === 'region' && w.tabIndex === 0 && !!w.getAttribute('aria-label') && [...document.querySelectorAll('[data-gstin-table] th')].every((th) => th.getAttribute('scope') === 'col') && document.querySelectorAll('[data-gstin-table] th').length === 5; })()"));
  check("desktop shows the table, not the phone cards", await b.eval("(() => { const t = document.querySelector('[data-gstin-table]'); const c = document.querySelector('[data-gstin-cards]'); return t.offsetParent !== null && getComputedStyle(c).display === 'none'; })()"));
  await clickSel("[data-gstin-copy]");
  await sleep(120);
  const copied = await b.eval("window.__copied");
  check("copy gives tab-separated rows with a header", copied?.split("\n").length === 6 && copied.split("\n")[0] === "Line\tGSTIN as typed\tState or UT\tStatus\tDetails" && copied.split("\n")[1] === `1\t${SAMPLE}\t27 Maharashtra\tFormat and check digit OK\t`, JSON.stringify(copied)?.slice(0, 200));
  check("copy says so", /Results copied\./.test(await b.eval("document.querySelector('[data-gstin-summary]').innerText")));
  await clickSel("[data-gstin-csv]");
  await sleep(250);
  const csv = await b.eval("window.__csv");
  check("CSV: header, six lines, comma separated", typeof csv === "string" && csv.split("\r\n").length === 6 && csv.startsWith("Line,GSTIN as typed,State or UT,Status,Details\r\n1,27AAAAA0000A1Z2,27 Maharashtra,Format and check digit OK,\r\n"), JSON.stringify(csv)?.slice(0, 200));
  check("CSV: no byte-order mark in English", (await b.eval("window.__csvHead"))?.[0] === 76);

  await typeInto("[data-gstin-list]", `=HYPERLINK("http://evil.example")\n+91\n-5\n@SUM(A1)\n`);
  await clickSel("[data-gstin-run]");
  await sleep(120);
  await clickSel("[data-gstin-csv]");
  await sleep(250);
  const evil = await b.eval("window.__csv");
  check("CSV: cells that start = + - @ are led by an apostrophe", typeof evil === "string" && evil.includes(`1,"'=HYPERLINK(""http://evil.example"")"`) && evil.includes("\r\n2,'+91,") && evil.includes("\r\n3,'-5,") && evil.includes("\r\n4,'@SUM(A1),"), JSON.stringify(evil)?.slice(0, 300));
  await clickSel("[data-gstin-copy]");
  await sleep(100);
  check("TSV copy guards formulas too", (await b.eval("window.__copied")).includes("\n2\t'+91\t"));

  await typeInto("[data-gstin-list]", Array.from({ length: 501 }, () => SAMPLE).join("\n"));
  await clickSel("[data-gstin-run]");
  await sleep(300);
  const capped = await b.eval("document.querySelector('[data-gstin-summary]').innerText");
  check("501 lines: 500 checked and the cap is stated", capped.startsWith("500 checked: 500 OK, 0 check digit mismatches, 0 with format problems.") && /Only the first 500 were checked\. Skipped: 1\./.test(capped), capped);
  check("500 rows rendered", (await rows()).length === 500);
  await clickSel("[data-gstin-list-sample]");
  await clickSel("[data-gstin-run]");
  await sleep(150);
  await scrollTo("[data-gstin-list]");
  await sleep(150);
  await b.shot("gstin-desktop-list.png");
  await b.eval("document.querySelector('[data-gstin-list-clear]').click(), true");
  await sleep(80);
  check("Clear on the list removes results", (await b.eval("document.querySelectorAll('[data-gstin-table]').length")) === 0 && (await b.eval("document.querySelector('[data-gstin-list]').value")) === "");

  /* ---------- nothing sent, nothing kept ---------- */
  check("no request left this page for another host", outsiders().length === 0, outsiders().join(" | "));
  check("the address has no hash or query", (await b.eval("location.hash + location.search")) === "");
  check("nothing stored in the browser", await b.eval(`(() => { const all = [...Object.entries(localStorage), ...Object.entries(sessionStorage)].flat().join(' ') + ' ' + document.cookie; return !/AAAAA0000A|AAACR5055K|GSTIN|gstin/i.test(all); })()`));
  check("no window.open, no new tab", (await b.eval("window.__opened.length")) === 0);
  check("no console errors on the English page", consoleErrors().length === 0, consoleErrors().join(" | "));

  /* ---------- the four regional pages ---------- */
  const PAGES = {
    hi: { h1: "GSTIN चेकर और डिकोडर", notice: "सिर्फ फॉर्मेट और चेक डिजिट की जांच। इससे यह पता नहीं चलता कि GSTIN पंजीकृत है।", ok: "फॉर्मेट और चेक डिजिट ठीक", bad: "चेक डिजिट मेल नहीं खाता", run: "सूची जांचें", state: "27 · Maharashtra", portal: "आधिकारिक GST पोर्टल पर खोजें", disclaimer: "/hi/disclaimer/" },
    ta: { h1: "GSTIN வடிவச் சோதனை மற்றும் டிகோடர்", notice: "வடிவமும் சரிபார்ப்பு இலக்கமும் மட்டுமே. GSTIN பதிவு செய்யப்பட்டுள்ளது என்பதை இது காட்டாது.", ok: "வடிவமும் சரிபார்ப்பு இலக்கமும் சரி", bad: "சரிபார்ப்பு இலக்கம் பொருந்தவில்லை", run: "பட்டியலைச் சரிபார்க்கவும்", state: "27 · Maharashtra", portal: "அதிகாரப்பூர்வ GST போர்ட்டலில் தேடிப் பாருங்கள்", disclaimer: "/disclaimer/" },
    te: { h1: "GSTIN తనిఖీ మరియు డీకోడర్", notice: "ఫార్మాట్, చెక్ డిజిట్ మాత్రమే. GSTIN రిజిస్టర్ అయి ఉందని ఇది చూపదు.", ok: "ఫార్మాట్, చెక్ డిజిట్ సరిగ్గా ఉన్నాయి", bad: "చెక్ డిజిట్ సరిపోలలేదు", run: "జాబితాను తనిఖీ చేయండి", state: "27 · Maharashtra", portal: "అధికారిక GST పోర్టల్‌లో వెతకండి", disclaimer: "/disclaimer/" },
    mr: { h1: "GSTIN तपासक आणि डिकोडर", notice: "फक्त फॉरमॅट आणि चेक डिजिट. GSTIN नोंदणीकृत आहे हे यावरून कळत नाही.", ok: "फॉरमॅट आणि चेक डिजिट ठीक", bad: "चेक डिजिट जुळत नाही", run: "यादी तपासा", state: "27 · Maharashtra", portal: "अधिकृत GST पोर्टलवर शोधा", disclaimer: "/disclaimer/" },
  };
  for (const [lang, expected] of Object.entries(PAGES)) {
    await b.go(`${BASE}/${lang}/gstin-validator/`, 1200);
    await b.eval("document.querySelector('astro-island')?.scrollIntoView(), true");
    check(`${lang}: island hydrated`, await hydrated(), lang);
    check(`${lang}: H1 and html lang`, (await b.eval("document.querySelector('h1').textContent")).trim() === expected.h1 && (await b.eval("document.documentElement.lang")) === lang);
    check(`${lang}: the limit is visible above the tool, in the language`, (await b.eval("document.querySelector('[data-gstin-notice]').textContent")) === expected.notice);
    await clickSel("[data-gstin-sample]");
    await sleep(100);
    check(`${lang}: sample reads OK in the language`, (await headline()) === expected.ok, await headline());
    check(`${lang}: decoded state`, (await parts())[Object.keys(await parts())[0]] === expected.state, JSON.stringify(await parts()));
    check(`${lang}: portal link text and rel`, await b.eval(`(() => { const a = document.querySelector('[data-gstin-result] a[href="https://services.gst.gov.in/services/searchtp"]'); return !!a && a.textContent.includes(${JSON.stringify(expected.portal)}) && a.rel === 'noopener noreferrer nofollow'; })()`));
    check(`${lang}: disclaimer link`, await b.eval(`[...document.querySelectorAll('a')].some((a) => a.getAttribute('href') === ${JSON.stringify(expected.disclaimer)} && a.closest('[lang="${lang}"]'))`));
    await setGstin("27AAACR5055K1Z8");
    check(`${lang}: mismatch in the language`, (await headline()) === expected.bad, await headline());
    check(`${lang}: no English fallback inside the verdict or issues`, !/[A-Za-z]{4,} [a-z]{3,} [a-z]{3,}/.test(`${await headline()} ${(await issues()).join(" ")}`));
    await typeInto("[data-gstin-list]", `${SAMPLE}\n27AAAAA0000A1Z3\n27AAAAA0000A1Z`);
    await b.eval(`[...document.querySelectorAll('button')].find((x) => x.textContent.trim() === ${JSON.stringify(expected.run)}).click(), true`);
    await sleep(120);
    check(`${lang}: list statuses`, JSON.stringify((await rows()).map((r) => r.status)) === JSON.stringify(["ok", "checksum", "format"]));
    check(`${lang}: table status text in the language`, (await rows())[0].cells[3] === expected.ok, JSON.stringify((await rows())[0]));
    await clickSel("[data-gstin-csv]");
    await sleep(200);
    check(`${lang}: CSV carries a byte-order mark for Excel`, JSON.stringify(await b.eval("window.__csvHead")) === "[239,187,191]", JSON.stringify(await b.eval("window.__csvHead")));
    check(`${lang}: nothing outside localhost requested`, outsiders().length === 0, outsiders().join(" | "));
    check(`${lang}: no console errors`, consoleErrors().length === 0, consoleErrors().join(" | "));
  }

  /* ---------- languages without their own copy: noindex pages that still work, in English ---------- */
  for (const lang of ["es", "ar"]) {
    await b.go(`${BASE}/${lang}/gstin-validator/`, 1200);
    await b.eval("document.querySelector('astro-island')?.scrollIntoView({ behavior: 'instant' }), true");
    check(`${lang}: island hydrated`, await hydrated(), lang);
    await clickSel("[data-gstin-sample]");
    await sleep(100);
    check(`${lang}: sample reads OK, in English`, (await headline()) === "Format and check digit OK", await headline());
    check(`${lang}: identifiers stay left to right`, await b.eval("[...document.querySelectorAll('[data-gstin-input], [data-gstin-parts] .font-mono')].every((el) => getComputedStyle(el).direction === 'ltr')"));
    check(`${lang}: no console errors`, consoleErrors().length === 0, consoleErrors().join(" | "));
  }

  /* ---------- 390px phone ---------- */
  await b.mobile(true);
  for (const path of ["/gstin-validator/", "/hi/gstin-validator/"]) {
    await b.go(`${BASE}${path}`, 1200);
    await b.eval("document.querySelector('[data-gstin-input]')?.scrollIntoView() ?? document.querySelector('astro-island')?.scrollIntoView(), true");
    await hydrated();
    await clickSel("[data-gstin-sample]");
    await clickSel("[data-gstin-list-sample]");
    await clickSel("[data-gstin-run]");
    await b.eval(`[...document.querySelectorAll('button')].find((x) => /^(Check list|सूची जांचें)$/.test(x.textContent.trim())).click(), true`);
    await sleep(200);
    check(`${path} at 390px: nothing overflows the page horizontally`, (await overflow()) <= 0, String(await overflow()));
    check(`${path} at 390px: the phone cards show, the wide table does not`, await b.eval("(() => { const t = document.querySelector('[data-gstin-table]'); const c = document.querySelector('[data-gstin-cards]'); return getComputedStyle(t.parentElement).display === 'none' && c.offsetParent !== null && c.children.length === 3; })()"));
    check(`${path} at 390px: each card carries the GSTIN, the status and the line`, await b.eval("(() => { const first = document.querySelector('[data-gstin-card]'); const text = first.textContent; return /27AAAAA0000A1Z2/.test(text) && /27 Maharashtra/.test(text) && first.getAttribute('data-gstin-card') === 'ok'; })()"));
    check(`${path} at 390px: buttons are at least 24px tall`, await b.eval("[...document.querySelectorAll('[data-gstin-sample], [data-gstin-clear], [data-gstin-run], [data-gstin-copy], [data-gstin-csv]')].every((x) => x.getBoundingClientRect().height >= 24)"));
    check(`${path} at 390px: input text is 16px (no zoom on focus)`, (await b.eval("parseFloat(getComputedStyle(document.querySelector('[data-gstin-input]')).fontSize)")) >= 16);
  }
  await b.go(`${BASE}/gstin-validator/`, 1200);
  await hydrated();
  await clickSel("[data-gstin-sample]");
  await clickSel("[data-gstin-list-sample]");
  await clickSel("[data-gstin-run]");
  await sleep(200);
  await scrollTo("[data-gstin-input]");
  await sleep(150);
  await b.shot("gstin-mobile.png");
  await scrollTo("[data-gstin-result]");
  await sleep(150);
  await b.shot("gstin-mobile-result.png");
  await scrollTo("[data-gstin-list]");
  await sleep(150);
  await b.shot("gstin-mobile-list.png");
  await scrollTo("[data-gstin-cards]");
  await sleep(150);
  await b.shot("gstin-mobile-cards.png");
  await b.mobile(false);

  check("no console errors anywhere", consoleErrors().length === 0, consoleErrors().join(" | "));
} catch (error) {
  check("test script ran to completion", false, String(error).slice(0, 500));
} finally {
  b.close();
}
process.exit(check.report());
