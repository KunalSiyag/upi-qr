// Amount in words converter (/amount-in-words/ and its hi/ta/te/mr/es pages) in a real browser: hydration, every mode,
// exact outputs, error states, copy, the Google Sheets block, structured data, accessibility basics, no network beyond
// the site itself, and no horizontal overflow at 390px. Static suite: reads BASE (default http://localhost:4400).
import vm from "node:vm";
import { checker, sleep, startBrowser } from "./cdp-lib.mjs";

const BASE = process.env.BASE || "http://localhost:4400";
const b = await startBrowser();
const check = checker();
const nfc = (text) => text.normalize("NFC");

// The converter's own island (the Google Sheets block is client:visible and hydrates later, when scrolled to).
const hydrated = () => b.waitFor("(() => { const island = document.querySelector('[data-amount-words]')?.closest('astro-island'); return !!island && !island.hasAttribute('ssr'); })()", 12000);
const sheetsHydrated = async () => {
  await b.eval("document.querySelector('[data-sheets-code]').scrollIntoView(); true");
  return b.waitFor("(() => { const island = document.querySelector('[data-sheets-code]')?.closest('astro-island'); return !!island && !island.hasAttribute('ssr'); })()", 8000);
};
const type = async (value) => {
  await b.eval(`(() => { const el = document.querySelector('[data-words-input]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await sleep(80);
};
const choose = async (selector, value) => {
  await b.eval(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  await sleep(80);
};
const click = async (selector) => { await b.eval(`document.querySelector(${JSON.stringify(selector)}).click()`); await sleep(80); };
const text = (selector) => b.eval(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? ''`);
const words = () => text("[data-words-text]");
const stubClipboard = () => b.eval("window.__copied = null; Object.defineProperty(navigator, 'clipboard', { value: { writeText: (t) => { window.__copied = t; return Promise.resolve(); } }, configurable: true }); true");
const overflow = () => b.eval("document.documentElement.scrollWidth - window.innerWidth");
const key = (name, code) => b.send("Input.dispatchKeyEvent", { type: "keyDown", key: name, code, windowsVirtualKeyCode: code === "Tab" ? 9 : 0 }).then(() => b.send("Input.dispatchKeyEvent", { type: "keyUp", key: name, code, windowsVirtualKeyCode: code === "Tab" ? 9 : 0 }));

try {
  await b.send("Network.setBlockedURLs", { urls: ["*clerk.accounts.dev*", "*clerk.browser.js*"] });

  /* ---------------- English page ---------------- */
  await b.go(`${BASE}/amount-in-words/`, 1200);
  check("one H1 with the target wording", (await b.eval("document.querySelectorAll('h1').length")) === 1 && (await text("h1")) === "Amount in words converter for Indian rupees");
  check("island hydrated", await hydrated());
  check("html lang is en", (await b.eval("document.documentElement.lang")) === "en");
  check("visible cheque notice sits above the tool", (await b.eval("(() => { const n = document.querySelector('[data-words-notice]'); const t = document.querySelector('[data-amount-words]'); return !!n && n.offsetParent !== null && /match the figures before you use them on a cheque/.test(n.textContent) && !!(n.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING); })()")));
  check("empty state hint, copy disabled", (await text("[data-words-message]")) === "Type an amount to see it in words." && (await b.eval("document.querySelector('[data-words-copy]').disabled")));

  await type("125050.50");
  check("figures echoed in Indian grouping", (await text("[data-words-figures]")) === "₹1,25,050.50");
  check("cheque style words (125050.50)", (await words()) === "Rupees One Lakh Twenty Five Thousand Fifty and Fifty Paise Only", await words());
  check("result is a polite live region", await b.eval("(() => { const r = document.querySelector('[data-words-result]'); return r.getAttribute('role') === 'status' && r.getAttribute('aria-live') === 'polite' && r.getAttribute('aria-atomic') === 'true'; })()"));
  check("English words are marked lang=en", (await b.eval("document.querySelector('[data-words-text]').lang")) === "en");
  await choose("[data-words-style]", "suffix");
  check("plain style words", (await words()) === "One Lakh Twenty Five Thousand Fifty Rupees and Fifty Paise Only", await words());
  await choose("[data-words-case]", "upper");
  check("upper case words", (await words()) === "ONE LAKH TWENTY FIVE THOUSAND FIFTY RUPEES AND FIFTY PAISE ONLY", await words());
  await choose("[data-words-style]", "cheque");
  check("upper case cheque style", (await words()) === "RUPEES ONE LAKH TWENTY FIVE THOUSAND FIFTY AND FIFTY PAISE ONLY", await words());
  await choose("[data-words-case]", "title");

  // Exact outputs: vectors from scripts/invoice.test.mjs and the research evidence, plus the accepted input shapes.
  const vectors = [
    ["0.50", "Rupees Zero and Fifty Paise Only"],
    ["1", "Rupees One Only"],
    ["0.05", "Rupees Zero and Five Paise Only"],
    ["1,234.50", "Rupees One Thousand Two Hundred Thirty Four and Fifty Paise Only"],
    ["17,700", "Rupees Seventeen Thousand Seven Hundred Only"],
    ["12,34,56,789.50", "Rupees Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine and Fifty Paise Only"],
    ["10,00,00,00,000", "Rupees One Thousand Crore Only"],
    ["1,00,00,00,000", "Rupees One Hundred Crore Only"],
    ["1,00,00,00,00,000", "Rupees Ten Thousand Crore Only"],
    ["99,99,99,99,99,999.99", "Rupees Nine Lakh Ninety Nine Thousand Nine Hundred Ninety Nine Crore Ninety Nine Lakh Ninety Nine Thousand Nine Hundred Ninety Nine and Ninety Nine Paise Only"],
    ["1,234,567.8", "Rupees Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven and Eighty Paise Only"],
    ["₹ 4,999/-", "Rupees Four Thousand Nine Hundred Ninety Nine Only"],
    ["Rs. 1,25,000", "Rupees One Lakh Twenty Five Thousand Only"],
    ["१२३", "Rupees One Hundred Twenty Three Only"],
    ["0", "Rupees Zero Only"],
  ];
  for (const [input, expected] of vectors) {
    await type(input);
    check(`${input} reads ${expected.slice(0, 48)}...`, (await words()) === expected, await words());
  }

  // Hindi.
  await type("125050.50");
  await click("[data-words-language=hi]");
  check("Hindi toggle is pressed and English is not", await b.eval("document.querySelector('[data-words-language=hi]').getAttribute('aria-pressed') === 'true' && document.querySelector('[data-words-language=en]').getAttribute('aria-pressed') === 'false'"));
  check("Hindi words (125050.50)", nfc(await words()) === nfc("एक लाख पच्चीस हज़ार पचास रुपये और पचास पैसे मात्र"), await words());
  check("Hindi words are marked lang=hi", (await b.eval("document.querySelector('[data-words-text]').lang")) === "hi");
  check("English-only controls are hidden for Hindi", (await b.eval("!document.querySelector('[data-words-style]') && !document.querySelector('[data-words-case]')")));
  check("Hindi spelling note is shown", /Unicode CLDR/.test(await b.eval("document.querySelector('[data-amount-words]').innerText")));
  for (const [input, expected] of [
    ["1", "एक रुपया मात्र"], ["0.50", "पचास पैसे मात्र"], ["0.01", "एक पैसा मात्र"], ["2", "दो रुपये मात्र"],
    ["1,234.50", "एक हज़ार दो सौ चौंतीस रुपये और पचास पैसे मात्र"],
    ["12,34,56,789.50", "बारह करोड़ चौंतीस लाख छप्पन हज़ार सात सौ नवासी रुपये और पचास पैसे मात्र"],
    ["1,00,00,00,000", "एक सौ करोड़ रुपये मात्र"],
    ["१,२५,०५०.५०", "एक लाख पच्चीस हज़ार पचास रुपये और पचास पैसे मात्र"],
  ]) {
    await type(input);
    check(`Hindi ${input}`, nfc(await words()) === nfc(expected), await words());
  }
  await click("[data-words-language=en]");
  check("English controls come back with their earlier choices", await b.eval("document.querySelector('[data-words-style]').value === 'cheque' && document.querySelector('[data-words-case]').value === 'title'"));

  // Error states.
  const problems = [
    ["1,50", /Use a dot for paise/], ["-5", /zero or more/], ["12.345", /at most 2 decimals/], ["abc", /Use digits only/],
    ["1,2,3", /Check the commas/], ["10000000000000", /too large/], ["99999999999999", /13 digits/],
  ];
  for (const [input, pattern] of problems) {
    await type(input);
    const message = await text("[data-words-message]");
    check(`${input} gives a clear message`, pattern.test(message) && !(await words()), message);
    check(`${input} marks the field invalid and disables copy`, await b.eval("document.querySelector('[data-words-input]').getAttribute('aria-invalid') === 'true' && document.querySelector('[data-words-copy]').disabled"));
  }
  await type("");
  check("clearing the field returns to the neutral hint", (await text("[data-words-message]")) === "Type an amount to see it in words." && (await b.eval("document.querySelector('[data-words-input]').getAttribute('aria-invalid') === 'false'")));

  // One-tap examples.
  const examples = await b.eval("[...document.querySelectorAll('[data-words-example]')].map((e) => e.textContent)");
  check("six examples", examples.length === 6 && examples.includes("1,25,050.50"), JSON.stringify(examples));
  await b.eval("[...document.querySelectorAll('[data-words-example]')].find((e) => e.textContent === '1,25,050.50').click()");
  await sleep(80);
  check("an example fills the field and the words", (await b.eval("document.querySelector('[data-words-input]').value")) === "1,25,050.50" && (await words()) === "Rupees One Lakh Twenty Five Thousand Fifty and Fifty Paise Only");
  check("example buttons carry the example in their name", await b.eval("[...document.querySelectorAll('[data-words-example]')].every((e) => e.getAttribute('aria-label').includes(e.textContent))"));

  // Copy, and what it leaves behind.
  await stubClipboard();
  await click("[data-words-copy]");
  check("copy puts exactly the words on the clipboard", (await b.eval("window.__copied")) === "Rupees One Lakh Twenty Five Thousand Fifty and Fifty Paise Only");
  check("copy is confirmed in a live region", (await text("[data-words-copy-note]")) === "Words copied");
  check("the tool-output signal names the tool only", (await b.eval("sessionStorage.getItem('proupiqr-tool-output')")) === "amount-in-words");
  check("nothing about the amount is stored", await b.eval("localStorage.length === 0 && [...Array(sessionStorage.length).keys()].every((i) => !/125050|One Lakh/i.test(sessionStorage.key(i) + sessionStorage.getItem(sessionStorage.key(i))))"));
  await b.eval("Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('blocked')) }, configurable: true }); document.execCommand = () => false; true");
  await click("[data-words-copy]");
  check("a blocked clipboard says so", /Could not copy/.test(await text("[data-words-copy-note]")));

  // Google Sheets block.
  const code = await b.eval("document.querySelector('[data-sheets-code]').textContent");
  check("Sheets function is on the page", /function AMOUNT_IN_WORDS\(amount\)/.test(code) && /@customfunction/.test(code) && code.split("\n").length > 40);
  check("Sheets function is plain ASCII and ES5", !/[^\x00-\x7f]/.test(code) && !/=>|`|\blet\b|\bconst\b/.test(code));
  check("the Sheets block hydrates when it scrolls into view", await sheetsHydrated());
  await stubClipboard();
  await click("[data-sheets-copy]");
  check("copying the function copies the shown text exactly", (await b.eval("window.__copied")) === code);
  check("copying the function is confirmed in a live region", (await text("[data-sheets-copy-note]")) === "Function copied");
  check("the Sheets code block is a focusable, named region", await b.eval("(() => { const p = document.querySelector('[data-sheets-code]'); return p.tabIndex === 0 && p.getAttribute('role') === 'region' && /AMOUNT_IN_WORDS/.test(p.getAttribute('aria-label')); })()"));
  // Run the text the page displays (not the source constant) as Apps Script would; a Node VM, since the real page's CSP forbids eval.
  const sheet = vm.runInNewContext(`${code}\nAMOUNT_IN_WORDS`, {});
  check("the displayed function returns the converter's words", sheet(125050.5) === "Rupees One Lakh Twenty Five Thousand Fifty and Fifty Paise Only" && sheet("1,25,000/-") === "Rupees One Lakh Twenty Five Thousand Only" && sheet(100) === "Rupees One Hundred Only");
  check("the displayed function refuses what it cannot read", [-1, 12.345, "1,50", "abc", 1e13].every((bad) => { try { sheet(bad); return false; } catch { return true; } }));

  /* ---------------- page content, structured data, SEO ---------------- */
  const info = await b.eval(`(() => {
    const blocks = [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent));
    const nodes = blocks.flatMap((block) => block['@graph'] ?? [block]);
    const types = nodes.map((n) => n['@type']);
    const crumbs = nodes.filter((n) => n['@type'] === 'BreadcrumbList');
    const faq = nodes.find((n) => n['@type'] === 'FAQPage');
    const app = nodes.find((n) => n['@type'] === 'WebApplication');
    const how = nodes.find((n) => n['@type'] === 'HowTo');
    const main = document.querySelector('main');
    return {
      types, crumbs: crumbs.length, crumbItems: crumbs[0]?.itemListElement?.map((i) => i.position + ':' + i.name + ':' + i.item),
      faqSchema: faq?.mainEntity?.length, faqVisible: main.querySelectorAll('details').length,
      faqMatchesVisible: faq.mainEntity.every((q, i) => main.querySelectorAll('details summary')[i].textContent === q.name),
      app: { price: app.offers.price, modified: app.dateModified, author: app.author?.name, publisher: app.publisher?.['@id'], rating: 'aggregateRating' in app || 'review' in app },
      howSteps: how.step.length, howVisible: main.querySelectorAll('ol')[0].querySelectorAll('li').length,
      title: document.title, description: document.querySelector('meta[name=description]').content, canonical: document.querySelector('link[rel=canonical]').href,
      robots: document.querySelector('meta[name=robots]').content, hreflangs: [...document.querySelectorAll('link[rel=alternate][hreflang]')].map((l) => l.hreflang).filter((h) => h !== 'x-default').sort().join(','),
      words: main.innerText.split(/\\s+/).length, h2: [...main.querySelectorAll('h2')].map((h) => h.textContent),
      reviewed: document.querySelector('[data-words-reviewed]').innerText, reviewedLinks: [...document.querySelectorAll('[data-words-reviewed] a')].map((a) => a.getAttribute('href')),
      examplesRows: document.querySelectorAll('main table')[1].querySelectorAll('tbody tr').length,
    };
  })()`);
  check("one custom BreadcrumbList: Home, All Tools, tool (last = canonical)", info.crumbs === 1 && info.crumbItems.join(" ") === "1:Home:https://www.proupiqr.in/ 2:All Tools:https://www.proupiqr.in/tools/ 3:Amount in Words Converter:https://www.proupiqr.in/amount-in-words/", JSON.stringify(info.crumbItems));
  check("schema types are WebApplication, HowTo, FAQPage, BreadcrumbList", ["WebApplication", "HowTo", "FAQPage", "BreadcrumbList"].every((t) => info.types.includes(t)), info.types.join());
  check("no rating or review is invented", info.app.rating === false);
  check("app is free and dated, with author and publisher", info.app.price === "0" && /^\d{4}-\d{2}-\d{2}$/.test(info.app.modified) && info.app.author === "Kunal Siyag" && info.app.publisher === "https://www.proupiqr.in/#organization", JSON.stringify(info.app));
  check("FAQPage mirrors the visible FAQ (13 questions, same order)", info.faqSchema === 13 && info.faqVisible === 13 && info.faqMatchesVisible, `${info.faqSchema}/${info.faqVisible}`);
  check("HowTo steps are the visible steps", info.howSteps === 3 && info.howVisible === 3);
  check("title and description lengths", info.title.length >= 20 && info.title.length <= 70 && info.description.length >= 70 && info.description.length <= 170, `${info.title.length}/${info.description.length}`);
  check("canonical and robots", info.canonical === "https://www.proupiqr.in/amount-in-words/" && /^index, follow/.test(info.robots), `${info.canonical} ${info.robots}`);
  check("hreflang covers the five indexed locales and only them", info.hreflangs === "en,hi,mr,ta,te", info.hreflangs);
  check("more than 700 visible words", info.words > 700, String(info.words));
  check("page has the required sections", ["How it works", "What this does and does not do", "Indian numbering: thousand, lakh, crore", "Worked examples", "Writing the amount in words on a cheque", "Use it in Google Sheets", "Sources and method", "Amount in words questions", "More billing tools"].every((h) => info.h2.includes(h)), info.h2.join(" | "));
  check("reviewed line names the author and links the policies", /Last reviewed 1 November 2026 by Kunal Siyag/.test(info.reviewed) && info.reviewedLinks.includes("/authors/kunal-siyag/") && info.reviewedLinks.includes("/accuracy-policy/"), info.reviewed);
  check("worked-examples table has 8 rows", info.examplesRows === 8);
  const tableText = await b.eval("document.querySelectorAll('main table')[1].innerText");
  check("worked examples show the 100 crore row and Hindi", /Rupees One Hundred Crore Only/.test(tableText) && /एक सौ करोड़ रुपये मात्र/.test(nfc(tableText)));
  const linksOut = await b.eval("[...document.querySelectorAll('main a[href]')].map((a) => a.getAttribute('href'))");
  check("related list links the sibling tools and hub", ["/invoice-generator/", "/receipt-generator/", "/rent-receipt-generator/", "/salary-slip-generator/", "/cash-memo-generator/", "/gst-calculator/", "/merchant-documents/"].every((h) => linksOut.includes(h)));
  const copyOnPage = await b.eval("document.querySelector('main').innerText.toLowerCase()");
  check("no forbidden wording (fake, prank, dummy, verified, guaranteed, 100%)", !/\b(fake|prank|dummy|verified|guarantee[ds]?)\b|100%/.test(copyOnPage));
  check("no sponsor slot, early-access card or Clerk on the page", await b.eval("!/Sponsored|Supported by|Advertise|early access/i.test(document.querySelector('main').innerText) && !document.querySelector('script[src*=clerk]') && !document.querySelector('clerk-provider, [data-clerk-component]')"));

  /* ---------------- accessibility basics ---------------- */
  check("every control has an accessible name", await b.eval("[...document.querySelectorAll('[data-amount-words] button, [data-amount-words] input, [data-amount-words] select')].every((el) => (el.labels && el.labels.length) || el.getAttribute('aria-label') || el.textContent.trim())"));
  check("every field has a visible label tied by for/id", await b.eval("[...document.querySelectorAll('[data-amount-words] input, [data-amount-words] select')].every((el) => el.labels.length === 1 && el.labels[0].textContent.trim().length > 0)"));
  check("controls are at least 24px", await b.eval("[...document.querySelectorAll('[data-amount-words] button, [data-amount-words] input, [data-amount-words] select')].every((el) => { const r = el.getBoundingClientRect(); return r.width >= 24 && r.height >= 24; })"));
  await type("1,25,050.50");
  await b.eval("document.querySelector('[data-words-input]').focus(); true");
  const order = [];
  for (let i = 0; i < 4; i++) {
    await key("Tab", "Tab");
    order.push(await b.eval("(() => { const a = document.activeElement; return a.hasAttribute('data-words-copy') ? 'copy' : a.getAttribute('data-words-language') ?? a.tagName.toLowerCase() + ':' + (a.id ? 'id' : ''); })()"));
  }
  check("Tab goes from the field to Copy, the language buttons, then the layout select", order.join(" ") === "copy en hi select:id", order.join(" "));
  check("keyboard focus is visibly outlined", await b.eval("(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2; })()"));
  check("no heading level is skipped inside main (h1, then h2s)", await b.eval("[...document.querySelectorAll('main h1, main h2, main h3, main h4')].every((h, i, all) => i === 0 || Number(h.tagName[1]) <= Number(all[i - 1].tagName[1]) + 1)"));

  /* ---------------- network and console ---------------- */
  const foreign = b.requests.filter((url) => !url.startsWith(BASE) && !url.startsWith("data:") && !url.startsWith("blob:"));
  check("no request leaves the site (no third-party hosts)", foreign.length === 0, foreign.join(" "));
  check("no request carries the amount", b.requests.every((url) => !/125050|amount=|1%2C25/i.test(url)));
  check("no console errors (excluding the blocked Clerk host and static-server 404s)", b.errors.filter((e) => !/clerk|ERR_BLOCKED|Failed to load/i.test(e)).length === 0, b.errors.join(" | "));

  /* ---------------- screenshots and 390px ---------------- */
  await type("12,34,56,789.50");
  // The site scrolls smoothly; jump instantly so the screenshot shows the place we asked for.
  await b.eval("window.scrollTo({ top: 0, behavior: 'instant' }); true");
  await sleep(350);
  await b.shot("words-desktop.png");
  await b.eval("(() => { const t = [...document.querySelectorAll('main h2')].find((h) => h.textContent === 'Worked examples'); window.scrollTo({ top: t.getBoundingClientRect().top + window.scrollY - 80, behavior: 'instant' }); return true; })()");
  await sleep(350);
  await b.shot("words-desktop-examples.png");
  await b.eval("(() => { const t = [...document.querySelectorAll('main h2')].find((h) => h.textContent === 'Writing the amount in words on a cheque'); window.scrollTo({ top: t.getBoundingClientRect().top + window.scrollY - 80, behavior: 'instant' }); return true; })()");
  await sleep(350);
  await b.shot("words-desktop-cheque.png");
  await b.mobile(true);
  await b.go(`${BASE}/amount-in-words/`, 1200);
  await hydrated();
  await type("12,34,56,789.50");
  check("390px: no horizontal overflow (English page)", (await overflow()) <= 1, String(await overflow()));
  check("390px: the data tables scroll inside their own region", await b.eval("[...document.querySelectorAll('main [role=region][tabindex=\"0\"]')].filter((r) => r.querySelector('table')).every((r) => r.scrollWidth >= r.clientWidth) && document.querySelectorAll('main table').length === 2"));
  check("390px: the result wraps inside the card", await b.eval("(() => { const r = document.querySelector('[data-words-text]').getBoundingClientRect(); return r.right <= window.innerWidth && r.left >= 0; })()"));
  await b.eval("window.scrollTo({ top: document.querySelector('#converter').getBoundingClientRect().top + window.scrollY - 70, behavior: 'instant' }); true");
  await sleep(350);
  await b.shot("words-mobile.png");
  await click("[data-words-language=hi]");
  await b.shot("words-mobile-hindi.png");
  check("390px: Hindi result fits too", (await overflow()) <= 1);
  await b.mobile(false);

  /* ---------------- Hindi page ---------------- */
  await b.go(`${BASE}/hi/amount-in-words/`, 1200);
  check("hi: island hydrated", await hydrated());
  check("hi: H1 and html lang", (await text("h1")) === "राशि शब्दों में कन्वर्टर (भारतीय रुपये)" && (await b.eval("document.documentElement.lang")) === "hi", await text("h1"));
  check("hi: Hindi is the default words language", await b.eval("document.querySelector('[data-words-language=hi]').getAttribute('aria-pressed') === 'true'"));
  check("hi: the screen is in Hindi", (await b.eval("document.querySelector('[data-amount-words] label[for]').textContent")) === "राशि (रुपये में)" && (await text("[data-words-message]")) === "शब्द देखने के लिए राशि लिखें।");
  await type("125050.50");
  check("hi: default output is Hindi", nfc(await words()) === nfc("एक लाख पच्चीस हज़ार पचास रुपये और पचास पैसे मात्र"), await words());
  await type("1,50");
  check("hi: errors are in Hindi", /अल्पविराम नहीं/.test(await text("[data-words-message]")), await text("[data-words-message]"));
  await click("[data-words-language=en]");
  await type("125050.50");
  check("hi: English output is one tap away", (await words()) === "Rupees One Lakh Twenty Five Thousand Fifty and Fifty Paise Only");
  check("hi: the page tells the reader to check words against figures", /जाँच लें कि शब्द अंकों से मेल खाते हैं/.test(await b.eval("document.querySelector('h1').closest('section').innerText")));
  check("hi: three steps and the five Hindi FAQs are rendered", (await b.eval("document.querySelectorAll('#tool ~ section ol li').length")) === 3 && (await b.eval("[...document.querySelectorAll('#tool ~ section h3')].slice(0, 5).map((h) => h.textContent).join('|')")) === "क्या हिंदी में राशि शब्दों में लिखी जा सकती है?|अंकों और शब्दों की राशि अलग हो तो कौन-सी मानी जाती है?|100 करोड़ या उससे बड़ी राशि कैसे पढ़ी जाती है?|इसमें सबसे बड़ी कितनी राशि लिख सकते हैं?|क्या मेरी राशि किसी सर्वर पर जाती है?");
  check("hi: indexable, canonical to itself", /^index/.test(await b.eval("document.querySelector('meta[name=robots]').content")) && (await b.eval("document.querySelector('link[rel=canonical]').href")) === "https://www.proupiqr.in/hi/amount-in-words/");
  await b.mobile(true);
  await b.go(`${BASE}/hi/amount-in-words/`, 1200);
  await hydrated();
  await type("12,34,56,789.50");
  check("390px: no horizontal overflow (Hindi page)", (await overflow()) <= 1, String(await overflow()));
  await b.eval("window.scrollTo({ top: document.querySelector('#tool').getBoundingClientRect().top + window.scrollY - 70, behavior: 'instant' }); true");
  await sleep(350);
  await b.shot("words-hi-mobile.png");
  await b.mobile(false);

  /* ---------------- Tamil, Telugu, Marathi: translated screen, English default words, honest about languages ---------------- */
  for (const [lang, label, hint, intro] of [
    ["ta", "தொகை (ரூபாயில்)", "சொற்களைக் காண ஒரு தொகையை உள்ளிடுங்கள்.", /ஆங்கிலம் அல்லது இந்தியில்/],
    ["te", "మొత్తం (రూపాయల్లో)", "అక్షరాల్లో చూడటానికి మొత్తాన్ని నమోదు చేయండి.", /ఇంగ్లీష్ లేదా హిందీలో/],
    ["mr", "रक्कम (रुपयांत)", "अक्षरी रक्कम पाहण्यासाठी रक्कम लिहा.", /इंग्रजी किंवा हिंदी/],
  ]) {
    await b.go(`${BASE}/${lang}/amount-in-words/`, 1200);
    check(`${lang}: island hydrated`, await hydrated());
    check(`${lang}: label and hint are translated`, (await b.eval("document.querySelector('[data-amount-words] label[for]').textContent")) === label && (await text("[data-words-message]")) === hint, await text("[data-words-message]"));
    check(`${lang}: words default to English and the page says only English and Hindi exist`, (await b.eval("document.querySelector('[data-words-language=en]').getAttribute('aria-pressed') === 'true'")) && intro.test(await b.eval("document.querySelector('h1').closest('section').innerText")));
    await type("125050.50");
    check(`${lang}: English words by default`, (await words()) === "Rupees One Lakh Twenty Five Thousand Fifty and Fifty Paise Only");
    await type("abc");
    check(`${lang}: error text is translated`, /[^\x00-\x7f]/.test(await text("[data-words-message]")));
    check(`${lang}: html lang follows`, (await b.eval("document.documentElement.lang")) === lang);
  }

  /* ---------------- a language the converter does not translate keeps the English screen and rupees ---------------- */
  await b.go(`${BASE}/es/amount-in-words/`, 1200);
  check("es: island hydrated with the English screen", (await hydrated()) && (await b.eval("document.querySelector('[data-amount-words] label[for]').textContent")) === "Amount in rupees");
  await type("1,234.50");
  check("es: still rupees, never another currency", (await words()) === "Rupees One Thousand Two Hundred Thirty Four and Fifty Paise Only" && !/[€$£]/.test(await b.eval("document.querySelector('[data-amount-words]').innerText")));
  check("es: out of the index", /^noindex/.test(await b.eval("document.querySelector('meta[name=robots]').content")));
  check("es: the island is marked English inside a Spanish page", (await b.eval("document.querySelector('[data-amount-words]').lang")) === "en");
  await b.go(`${BASE}/ar/amount-in-words/`, 1200);
  check("ar: the English screen stays left to right inside a right-to-left page", (await hydrated()) && (await b.eval("document.documentElement.dir")) === "rtl" && (await b.eval("document.querySelector('[data-amount-words]').dir")) === "ltr");

  check("no console errors on the localized pages", b.errors.filter((e) => !/clerk|ERR_BLOCKED|Failed to load/i.test(e)).length === 0, b.errors.join(" | "));
} catch (error) {
  check("test script ran to completion", false, String(error).slice(0, 600));
} finally {
  b.close();
}
process.exit(check.report());
