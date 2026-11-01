// Browser checks for the two intent landing pages, /upi-id-to-qr-code-generator/ and
// /payment-qr-code-generator/, and their hi/ta/te/mr versions: markup and structured data, the
// generator (typed values, #pay? prefill, exact link decoded from the QR), layout at 390px and network.
// Static build only (no astro dev): the python static server sends no vercel.json headers.
import { readFileSync } from "node:fs";
import { checker, sleep, startBrowser } from "./cdp-lib.mjs";

const BASE = process.env.BASE || "http://localhost:4400";
const ORIGIN = new URL(BASE).origin;
const SITE = "https://www.proupiqr.in";
const b = await startBrowser();
const check = checker();
const jsqr = readFileSync(new URL("../../node_modules/jsqr/dist/jsQR.js", import.meta.url), "utf8");

const PAGES = [
  { slug: "upi-id-to-qr-code-generator", h1: "UPI ID to QR code generator", crumb: "UPI ID to QR Code Generator", example: true },
  { slug: "payment-qr-code-generator", h1: "Payment QR code generator for shops and freelancers", crumb: "Payment QR Code Generator", example: false },
];
/** The link the page example shows; the generator must write exactly this for these values. */
const EXAMPLE = "upi://pay?pa=yourshop%40bank&pn=YourShop&am=250&tn=Invoice-17&cu=INR";
const UI = {
  en: { name: "Payee name", id: "UPI ID", gen: "Generate UPI QR", dl: "Download QR Code", advanced: "Advanced Poster" },
  hi: { name: "प्राप्तकर्ता का नाम", id: "UPI आईडी", gen: "UPI QR जनरेट करें", dl: "QR कोड डाउनलोड करें" },
  ta: { name: "பெறுநர் பெயர்", id: "UPI ஐடி", gen: "UPI QR உருவாக்கு", dl: "QR பதிவிறக்கு" },
  te: { name: "స్వీకర్త పేరు", id: "UPI ఐడి", gen: "UPI QR సృష్టించండి", dl: "QR డౌన్‌లోడ్" },
  mr: { name: "प्राप्तकर्त्याचे नाव", id: "UPI आयडी", gen: "UPI QR तयार करा", dl: "QR डाउनलोड" },
};
const LOCAL_H1 = {
  "upi-id-to-qr-code-generator": { hi: "UPI ID से QR कोड जनरेटर", ta: "UPI ID-யிலிருந்து QR ஜெனரேட்டர்", te: "UPI ID నుండి QR కోడ్ జనరేటర్", mr: "UPI ID वरून QR कोड जनरेटर" },
  "payment-qr-code-generator": { hi: "पेमेंट QR कोड जनरेटर", ta: "பேமெண்ட் QR குறியீடு ஜெனரேட்டர்", te: "పేమెంట్ QR కోడ్ జనరేటర్", mr: "पेमेंट QR कोड जनरेटर" },
};
/** Words that must not appear in the copy we wrote (the generator's own text is excluded). */
const BANNED = /\b(fake|prank|dummy|verify|verified|genuine|authentic|trusted|registered|100% secure|looks safe)\b/i;

/** The steps and FAQ questions registered in src/data/localizedTools.ts for one tool and language. */
const localizedSrc = readFileSync(new URL("../../src/data/localizedTools.ts", import.meta.url), "utf8");
function localCopy(slug, lang) {
  const start = localizedSrc.indexOf(`tool("${slug}"`);
  const next = localizedSrc.indexOf('\n  tool("', start + 1);
  const block = localizedSrc.slice(start, next === -1 ? undefined : next);
  const parts = block.split(/\n    (hi|ta|te|mr): \{/);
  const text = parts[parts.indexOf(lang) + 1] ?? "";
  const stepsBlock = (text.match(/steps: \[([\s\S]*?)\n      \]/) ?? [])[1] ?? "";
  return {
    steps: [...stepsBlock.matchAll(/^\s+"(.+?)",?$/gm)].map((m) => m[1]),
    questions: [...text.matchAll(/question: "([^"]+)"/g)].map((m) => m[1]),
  };
}

const seenRequests = [];
const seenErrors = [];
/** Navigate, keeping the requests and errors of the page we leave (b.go clears them). */
const go = async (url, settle = 1800) => {
  seenRequests.push(...b.requests);
  seenErrors.push(...b.errors);
  await b.go(url, settle);
};

const PAGE_HELPERS = `
window.__lp = {
  field(label, value) {
    const l = [...document.querySelectorAll('label')].find((x) => x.textContent.trim() === label && x.querySelector('input'));
    if (!l) throw new Error('no field ' + label);
    const el = l.querySelector('input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return el.value;
  },
  button(test) { return [...document.querySelectorAll('button')].find((x) => (test instanceof RegExp ? test.test(x.textContent.trim()) : x.textContent.trim() === test)); },
  click(test) { const x = this.button(test); if (!x) throw new Error('no button ' + test); x.click(); return true; },
  select(optionRe, value) {
    const el = [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => optionRe.test(o.textContent)));
    if (!el) throw new Error('no select ' + optionRe);
    const option = [...el.options].find((o) => optionRe.test(o.textContent));
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, option.value);
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return option.textContent;
  },
  hydrated() { const islands = [...document.querySelectorAll('astro-island')]; return islands.length > 0 && islands.every((i) => !i.hasAttribute('ssr')); },
};
true`;
await b.send("Page.addScriptToEvaluateOnNewDocument", { source: PAGE_HELPERS });

const hydrated = () => b.waitFor("window.__lp && window.__lp.hydrated()", 10000);
const bodyText = () => b.eval("document.body.innerText");
/** Decode the QR image matching `selector` in the page with jsQR (injected once per document). */
const decode = async (selector) => {
  if (!(await b.eval("typeof window.jsQR === 'function'"))) await b.eval(`${jsqr}\n;true`);
  return b.eval(`(async () => {
    const img = document.querySelector(${JSON.stringify(selector)});
    if (!img) return null;
    await img.decode();
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height);
    const r = window.jsQR(d.data, d.width, d.height);
    return r ? r.data : null;
  })()`);
};
/** Poll until the QR decodes to `expected` (the poster re-renders the QR after each change), or time out with the last value. */
const decodeUntil = async (selector, expected, ms = 4000) => {
  const end = Date.now() + ms;
  let last = null;
  while (Date.now() < end) {
    last = await decode(selector);
    if (last === expected) return last;
    await sleep(150);
  }
  return last;
};
const safeDecode = (u) => { try { return decodeURIComponent(u); } catch { return u; } };
const fields = (link) => Object.fromEntries(new URLSearchParams(link.split("?")[1] ?? "").entries());
const sameFields = (a, c) => JSON.stringify(Object.entries(fields(a)).sort()) === JSON.stringify(Object.entries(fields(c)).sort());
const overflow = `(() => {
  const w = document.documentElement.clientWidth;
  const bad = [];
  for (const el of document.querySelectorAll('main *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || (r.right <= w + 1 && r.left >= -1)) continue;
    let p = el.parentElement, scroller = false;
    while (p && p !== document.body) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll') { scroller = true; break; } p = p.parentElement; }
    if (!scroller) bad.push(el.tagName + '.' + String(el.className).slice(0, 40) + ' right=' + Math.round(r.right));
  }
  return { width: w, scrollWidth: document.documentElement.scrollWidth, bad: bad.slice(0, 5) };
})()`;

try {
  for (const page of PAGES) {
    const path = `/${page.slug}/`;
    const url = BASE + path;
    const canonical = `${SITE}${path}`;
    const tag = page.slug;

    // ---- Static markup and structured data (from the built HTML) ----
    const html = await (await fetch(url)).text();
    const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    const nodes = ld.flatMap((d) => d["@graph"] ?? [d]);
    const ofType = (t) => nodes.filter((n) => n["@type"] === t);
    const [app] = ofType("WebApplication");
    const [faqNode] = ofType("FAQPage");
    const [howTo] = ofType("HowTo");
    const crumbs = ofType("BreadcrumbList");
    const meta = (re) => (html.match(re) ?? [])[1] ?? "";
    const titleText = meta(/<title>([^<]*)<\/title>/).replaceAll("&amp;", "&");
    const description = meta(/<meta name="description" content="([^"]*)"/).replaceAll("&amp;", "&");
    check(`${tag}: title 20-70 chars`, titleText.length >= 20 && titleText.length <= 70, `${titleText.length} ${titleText}`);
    check(`${tag}: description 70-170 chars`, description.length >= 70 && description.length <= 170, String(description.length));
    check(`${tag}: self canonical and indexable`, meta(/<link rel="canonical" href="([^"]*)"/) === canonical && /<meta name="robots" content="index, follow/.test(html));
    check(`${tag}: hreflang for en, hi, ta, te, mr and x-default`, ["en", "hi", "ta", "te", "mr", "x-default"].every((l) => html.includes(`hreflang="${l}"`)));
    check(`${tag}: exactly one BreadcrumbList, Home > All Tools > page, last item is the canonical`,
      crumbs.length === 1 && crumbs[0].itemListElement.map((i) => i.position).join() === "1,2,3" && crumbs[0].itemListElement[1].item === `${SITE}/tools/` && crumbs[0].itemListElement[2].item === canonical && crumbs[0].itemListElement[2].name === page.crumb);
    check(`${tag}: WebApplication (finance, free, INR) with author, publisher, dateModified and no rating`,
      app?.applicationCategory === "FinanceApplication" && app.offers?.price === "0" && app.offers?.priceCurrency === "INR"
      && app.author?.name === "Kunal Siyag" && app.publisher?.["@id"] === `${SITE}/#organization` && app.dateModified === "2026-11-01" && !("aggregateRating" in app) && !("review" in app), JSON.stringify(app)?.slice(0, 200));

    await go(url, 1800);
    await b.eval("localStorage.clear(); true");
    await go(url, 1800);
    check(`${tag}: H1 reads "${page.h1}" and is the only H1`, (await b.eval("document.querySelector('h1').textContent.trim()")) === page.h1 && (await b.eval("document.querySelectorAll('h1').length")) === 1);
    check(`${tag}: generator island hydrates (client:load)`, await hydrated());
    check(`${tag}: visible breadcrumb Home / All Tools / page`, (await b.eval("[...document.querySelectorAll('nav[aria-label=Breadcrumb] a, nav[aria-label=Breadcrumb] [aria-current]')].map((n) => n.textContent.trim()).join('|')")) === `Home|All Tools|${page.crumb}`);
    check(`${tag}: the scope notice sits above the generator and is not collapsed`, await b.eval("(() => { const g = document.getElementById('generator'); const n = [...document.querySelectorAll('main > section:first-child p')].find((p) => /independent tool/.test(p.textContent)); return !!n && !n.closest('details') && n.getBoundingClientRect().bottom <= g.getBoundingClientRect().top + 1; })()"));

    // FAQ and steps in the markup mirror the visible text.
    const visibleFaq = await b.eval("[...document.querySelectorAll('#faq details')].map((d) => [d.querySelector('summary > span').textContent.trim(), d.querySelector('p').textContent.trim()])");
    check(`${tag}: at least 7 FAQ items, FAQPage markup equals the visible text`,
      visibleFaq.length >= 7 && JSON.stringify(visibleFaq) === JSON.stringify(faqNode.mainEntity.map((q) => [q.name, q.acceptedAnswer.text])), String(visibleFaq.length));
    const visibleSteps = await b.eval("[...document.querySelectorAll('#how-it-works ol > li')].map((li) => [li.querySelector('p:nth-child(1)').textContent.trim(), li.querySelector('p:nth-child(2)').textContent.trim()])");
    check(`${tag}: three visible steps, HowTo markup equals them`, visibleSteps.length === 3 && JSON.stringify(visibleSteps) === JSON.stringify(howTo.step.map((s) => [s.name, s.text])));
    const words = await b.eval("(() => { const m = document.querySelector('main').cloneNode(true); m.querySelector('#generator')?.remove(); return m.textContent.split(/\\s+/).filter(Boolean).length; })()");
    check(`${tag}: at least 800 words of visible copy outside the generator`, words >= 800, String(words));
    const copy = await b.eval("(() => { const m = document.querySelector('main').cloneNode(true); m.querySelector('#generator')?.remove(); return m.textContent; })()");
    check(`${tag}: no banned wording in our copy`, !BANNED.test(copy), (copy.match(BANNED) ?? [])[0]);
    check(`${tag}: no sponsor, pricing or upgrade text on the page`, !/Supported by|Advertise|Upgrade|\bPro\b|pricing/i.test(copy), (copy.match(/Supported by|Advertise|Upgrade|\bPro\b|pricing/i) ?? [])[0]);
    check(`${tag}: external links open in a new tab with noopener noreferrer nofollow`, await b.eval("[...document.querySelectorAll('main a[href^=http]')].length > 0 && [...document.querySelectorAll('main a[href^=http]')].every((a) => a.target === '_blank' && ['noopener', 'noreferrer', 'nofollow'].every((t) => a.rel.split(' ').includes(t)))"));
    check(`${tag}: headings outside the generator never skip a level`, await b.eval(`(() => {
      const hs = [...document.querySelectorAll('main h1, main h2, main h3')].filter((h) => !h.closest('#generator'));
      let last = 1; for (const h of hs) { const n = Number(h.tagName[1]); if (n - last > 1) return false; last = n; } return true; })()`));
    check(`${tag}: every image in the page has alt text`, await b.eval("[...document.querySelectorAll('main img')].every((i) => i.hasAttribute('alt'))"));

    // FAQ is operable from the keyboard.
    await b.eval("document.querySelector('#faq summary').focus(); true");
    await b.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
    await b.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await sleep(150);
    check(`${tag}: Enter on a FAQ question opens it`, await b.eval("document.querySelector('#faq details').open"));
    await b.eval("window.scrollTo(0, 0); true");
    await sleep(200);
    await b.shot(`${tag}-desktop.png`);

    // ---- Generator: Simple QR ----
    check(`${tag}: before generating, Download QR Code is disabled`, await b.eval(`__lp.button(${JSON.stringify(UI.en.dl)}).disabled === true`));
    // Error states the pages describe: the name is required, and a space inside the UPI ID is refused.
    await b.eval(`__lp.field(${JSON.stringify(UI.en.id)}, 'yourshop@bank'), __lp.click(${JSON.stringify(UI.en.gen)})`);
    check(`${tag}: a UPI ID without a name is refused with a message and no QR`, (await b.waitFor("document.body.innerText.includes('Enter the name that should appear on the payment QR.')", 3000)) && (await b.eval("!document.querySelector('img[alt=\"UPI QR Code\"]')")));
    await b.eval(`__lp.field(${JSON.stringify(UI.en.name)}, 'YourShop'), __lp.field(${JSON.stringify(UI.en.id)}, 'your shop@bank'), __lp.click(${JSON.stringify(UI.en.gen)})`);
    check(`${tag}: a space inside the UPI ID is refused with a message and no QR`, (await b.waitFor("document.body.innerText.includes('Enter a valid UPI ID like name@bank.')", 3000)) && (await b.eval("!document.querySelector('img[alt=\"UPI QR Code\"]')")));
    await b.eval(`__lp.field(${JSON.stringify(UI.en.name)}, 'YourShop'), __lp.field(${JSON.stringify(UI.en.id)}, 'yourshop@bank'), __lp.click(${JSON.stringify(UI.en.gen)})`);
    check(`${tag}: Generate shows the QR image and enables Download`, await b.waitFor("!!document.querySelector('img[alt=\"UPI QR Code\"]') && document.querySelector('img[alt=\"UPI QR Code\"]').src.startsWith('data:image/png') && [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Download QR Code')?.disabled === false", 8000));
    check(`${tag}: a (hidden) canvas backs the QR`, await b.eval("!!document.querySelector('canvas')"));
    const simple = await decode('img[alt="UPI QR Code"]');
    check(`${tag}: the QR decodes to the exact open-amount link`, simple === "upi://pay?pa=yourshop%40bank&pn=YourShop&cu=INR", String(simple));
    check(`${tag}: the link under the QR matches what it decodes to`, (await bodyText()).includes("upi://pay?pa=yourshop%40bank&pn=YourShop&cu=INR"));

    // ---- Generator: Advanced Poster with amount and note ----
    await b.eval(`__lp.click(${JSON.stringify(UI.en.advanced)})`);
    await b.waitFor("!![...document.querySelectorAll('button')].find((x) => /^Add amount & note/.test(x.textContent.trim()))", 4000);
    await b.eval("__lp.click(/^Add amount & note/)");
    await b.waitFor("[...document.querySelectorAll('label')].some((l) => l.textContent.trim() === 'Amount')", 4000);
    await b.eval("__lp.field('Amount', '250'), __lp.field('Note / Message', 'Invoice-17'), __lp.click('Generate UPI QR')");
    await b.waitFor("!!document.querySelector('img[alt=\"Generated UPI QR code\"]')", 8000);
    const advanced = await decodeUntil('img[alt="Generated UPI QR code"]', EXAMPLE);
    check(`${tag}: with amount and note the QR decodes to the page example link`, advanced === EXAMPLE, String(advanced));
    if (page.example) {
      const shown = await b.eval("document.getElementById('payload-example').textContent.trim()");
      check(`${tag}: the example link printed on the page is what the tool writes`, shown === EXAMPLE && advanced === shown, shown);
    }
    if (!page.example) {
      // The poster's table-number label is printed on the poster only; it is not part of the QR (the page says so).
      await b.eval("__lp.select(/Restaurant Table/)");
      await b.waitFor("[...document.querySelectorAll('label')].some((l) => l.textContent.trim() === 'Table/Cabin Number')", 4000);
      await b.eval("__lp.field('Table/Cabin Number', 'Table 4'), __lp.click('Generate UPI QR')");
      await sleep(600);
      const table = await decodeUntil('img[alt="Generated UPI QR code"]', EXAMPLE);
      check(`${tag}: a table number typed on the poster is not in the QR link`, table === EXAMPLE && !/table/i.test(table), String(table));
    }
    check(`${tag}: no console errors while generating`, [...seenErrors, ...b.errors].filter((e) => !/Failed to load resource/i.test(e)).length === 0, [...seenErrors, ...b.errors].join(" | "));

    // ---- Shared #pay? link prefills the form and generates ----
    await go("about:blank", 200);
    await go(`${url}#pay?pa=asha%40okaxis&pn=Asha%20Stores&am=250&tn=Fees`, 2500);
    check(`${tag}: #pay? fills the form and renders a QR`, await b.waitFor("!!document.querySelector('img[alt=\"Generated UPI QR code\"]')", 8000));
    check(`${tag}: #pay? leaves the address bar once read`, (await b.eval("location.hash")) === "");
    const prefilled = await b.eval("[...document.querySelectorAll('main input')].map((i) => i.value).filter(Boolean)");
    check(`${tag}: prefilled name, UPI ID, amount and note`, ["Asha Stores", "asha@okaxis", "250", "Fees"].every((v) => prefilled.includes(v)), JSON.stringify(prefilled));
    const shared = await decode('img[alt="Generated UPI QR code"]');
    check(`${tag}: the prefilled QR carries the shared values`, shared !== null && sameFields(shared, "upi://pay?pa=asha%40okaxis&pn=Asha+Stores&am=250&tn=Fees&cu=INR"), String(shared));
    check(`${tag}: Download QR Code is enabled after the prefill`, await b.eval("[...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Download QR Code')?.disabled === false"));

    // ---- 390px: nothing overflows, generator still works ----
    await b.mobile(true);
    await go(url, 2500);
    await b.eval("localStorage.clear(); true");
    await go(url, 2500);
    await hydrated();
    const narrow = await b.eval(overflow);
    check(`${tag}: no horizontal overflow at 390px`, narrow.scrollWidth <= narrow.width + 1 && narrow.bad.length === 0, JSON.stringify(narrow));
    await b.eval(`__lp.field(${JSON.stringify(UI.en.name)}, 'YourShop'), __lp.field(${JSON.stringify(UI.en.id)}, 'yourshop@bank'), __lp.click(${JSON.stringify(UI.en.gen)})`);
    check(`${tag}: the generator works at 390px`, await b.waitFor("!!document.querySelector('img[alt=\"UPI QR Code\"]')", 8000));
    await b.eval("document.getElementById('generator').scrollIntoView(); true");
    await sleep(300);
    await b.shot(`${tag}-mobile.png`);
    await b.eval("window.scrollTo(0, document.body.scrollHeight); true");
    await sleep(300);
    const narrowAfter = await b.eval(overflow);
    check(`${tag}: no horizontal overflow at 390px after generating`, narrowAfter.scrollWidth <= narrowAfter.width + 1 && narrowAfter.bad.length === 0, JSON.stringify(narrowAfter));
    await b.mobile(false);
  }

  // ---- hi/ta/te/mr: every page renders its own copy and the generator in that language ----
  for (const page of PAGES) {
    for (const lang of ["hi", "ta", "te", "mr"]) {
      const path = `/${lang}/${page.slug}/`;
      const tag = `${lang}/${page.slug}`;
      const html = await (await fetch(BASE + path)).text();
      const nodes = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => { const d = JSON.parse(m[1]); return d["@graph"] ?? [d]; });
      const title = (html.match(/<title>([^<]*)<\/title>/) ?? [])[1] ?? "";
      const description = (html.match(/<meta name="description" content="([^"]*)"/) ?? [])[1] ?? "";
      check(`${tag}: title 20-70 and description 70-170 characters`, [...title].length >= 20 && [...title].length <= 70 && [...description].length >= 70 && [...description].length <= 170, `${[...title].length}/${[...description].length}`);
      check(`${tag}: self canonical and indexable`, html.includes(`<link rel="canonical" href="${SITE}${path}"`) && /<meta name="robots" content="index, follow/.test(html));
      const copy = localCopy(page.slug, lang);
      check(`${tag}: the registered copy has 3 steps and at least 3 FAQs`, copy.steps.length === 3 && copy.questions.length >= 3, `${copy.steps.length}/${copy.questions.length}`);
      if (lang === "hi") {
        // Only the Hindi template emits HowTo and FAQPage markup; ta/te/mr show the same sections without it.
        check(`${tag}: HowTo and FAQPage markup match the copy`, nodes.find((n) => n["@type"] === "HowTo")?.step.length === 3 && nodes.find((n) => n["@type"] === "FAQPage")?.mainEntity.length === copy.questions.length);
      }
      await go(BASE + path, 1500);
      check(`${tag}: html lang and H1`, (await b.eval("document.documentElement.lang")) === lang && (await b.eval("document.querySelector('h1').textContent.trim()")) === LOCAL_H1[page.slug][lang]);
      await b.eval("document.getElementById('tool').scrollIntoView(); true");
      check(`${tag}: generator hydrates with ${lang} labels`, (await hydrated()) && (await b.eval(`!!__lp.button(${JSON.stringify(UI[lang].gen)}) && [...document.querySelectorAll('label')].some((l) => l.textContent.trim() === ${JSON.stringify(UI[lang].name)})`)));
      check(`${tag}: every step and FAQ question is visible on the page`, await b.eval(`${JSON.stringify([...copy.steps, ...copy.questions])}.every((s) => document.body.innerText.includes(s))`));
      if (lang === "hi") {
        await b.eval("localStorage.clear(); true");
        await go(BASE + path, 1500);
        await b.eval("document.getElementById('tool').scrollIntoView(); true");
        await hydrated();
        await b.eval(`__lp.field(${JSON.stringify(UI.hi.name)}, 'YourShop'), __lp.field(${JSON.stringify(UI.hi.id)}, 'yourshop@bank'), __lp.click(${JSON.stringify(UI.hi.gen)})`);
        check(`${tag}: the Hindi generator makes a QR and enables the Hindi download button`,
          await b.waitFor(`!!document.querySelector('img[alt="UPI QR Code"]') && [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === ${JSON.stringify(UI.hi.dl)})?.disabled === false`, 8000));
        check(`${tag}: the Hindi QR decodes to the same open-amount link`, (await decode('img[alt="UPI QR Code"]')) === "upi://pay?pa=yourshop%40bank&pn=YourShop&cu=INR");
        await b.shot(`${tag.replace("/", "-")}-desktop.png`);
      }
    }
  }
  await go(`${BASE}/es/upi-id-to-qr-code-generator/`, 800);
  check("es: the foreign-language copy is noindex and out of hreflang", await b.eval("/noindex/.test(document.querySelector('meta[name=robots]').content)"));

  // ---- Network: same-origin only, no identifiers in any URL, no Clerk ----
  const requests = [...seenRequests, ...b.requests].filter((u) => /^https?:/.test(u));
  const foreign = requests.filter((u) => new URL(u).origin !== ORIGIN);
  check("no request leaves the site's own origin", foreign.length === 0, foreign.slice(0, 3).join(" "));
  check("no UPI ID, name or note appears in any request URL", requests.every((u) => !/yourshop|asha|invoice-17/i.test(safeDecode(u))), requests.find((u) => /yourshop|asha|invoice-17/i.test(safeDecode(u))));
  check("no Clerk request on these pages", requests.every((u) => !/clerk/i.test(u)));
  check("no console errors on any page", [...seenErrors, ...b.errors].filter((e) => !/Failed to load resource/i.test(e)).length === 0, [...seenErrors, ...b.errors].slice(0, 3).join(" | "));
} catch (error) {
  check("test script ran to completion", false, String(error).slice(0, 600));
} finally {
  b.close();
}
process.exit(check.report());
