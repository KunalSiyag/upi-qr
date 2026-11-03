// /upi-id-generator/ (English) and its hi/ta/te/mr pages in a real browser: markup facts, the format check,
// ideas, copy, the QR hand-off, keyboard use, layout at 390px, no stored data and no third-party requests.
// Static suite: needs `npx astro build`, then
//   python3 -m http.server 4400 --bind 127.0.0.1 --directory .vercel/output/static & node scripts/e2e/upi-id-e2e.mjs
// (BASE overrides the origin). Not in run.mjs SUITES yet: add "upi-id-e2e" there to run it with the others.
import { checker, sleep, startBrowser } from "./cdp-lib.mjs";

const BASE = process.env.BASE || "http://localhost:4400";
const HOST = new URL(BASE).host;
const b = await startBrowser();
const check = checker();

const VPA = "sharmastores@okicici";
const NAME = "Sharma Kirana Store";
const ISLAND = `astro-island[component-export="UpiIdHelper"]`;

// ---- helpers -----------------------------------------------------------------------------------------------
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'");
const stripTags = (html) => decode(html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim();
const mainOf = (html) => html.slice(html.indexOf("<main"), html.indexOf("</main>") + 7);
const jsonLd = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
const nodes = (docs, type) => {
  const out = [];
  const walk = (o) => {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === "object") {
      if (o["@type"] === type) out.push(o);
      Object.values(o).forEach(walk);
    }
  };
  walk(docs);
  return out;
};
const page = async (path) => {
  const res = await fetch(BASE + path);
  return { status: res.status, html: await res.text() };
};
const ready = `(() => { const i = document.querySelector('${ISLAND}'); return !!i && !i.hasAttribute('ssr'); })()`;
const setValue = (selector, value) => b.eval(`(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) throw new Error('missing ' + ${JSON.stringify(selector)});
  const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)});
  el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  return true;
})()`);
const typeVpa = async (value) => { await setValue("[data-upi-id-input]", value); await sleep(120); };
const result = () => b.eval("document.querySelector('[data-upi-id-result]')?.innerText ?? ''");
const invalidFlag = () => b.eval("document.querySelector('[data-upi-id-input]').getAttribute('aria-invalid')");
const ctaHref = () => b.eval("document.querySelector('[data-upi-id-qr-link]').getAttribute('href')");
const key = (name, code, vk, text) => b.send("Input.dispatchKeyEvent", { type: "keyDown", key: name, code, windowsVirtualKeyCode: vk, ...(text ? { text } : {}) })
  .then(() => b.send("Input.dispatchKeyEvent", { type: "keyUp", key: name, code, windowsVirtualKeyCode: vk }));
// WCAG 1.4.3: every text node in <main> against its real background (alpha blended), 4.5:1 or 3:1 for large text.
const lowContrast = async () => JSON.parse(await b.eval(`(() => {
  document.querySelectorAll('details').forEach((d) => { d.open = true; });
  const parse = (c) => { const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(/[ ,\\/]+/).filter(Boolean).map(parseFloat); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const over = (f, g) => ({ r: f.r * f.a + g.r * (1 - f.a), g: f.g * f.a + g.g * (1 - f.a), b: f.b * f.a + g.b * (1 - f.a), a: 1 });
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const bgOf = (el) => { const stack = []; for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0) { stack.push(c); if (c.a === 1) break; } } let base = { r: 255, g: 255, b: 255, a: 1 }; for (const c of stack.reverse()) base = over(c, base); return base; };
  const out = []; const seen = new Set();
  const walker = document.createTreeWalker(document.querySelector('main'), NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!n.textContent.trim() || seen.has(el)) continue;
    seen.add(el);
    const cs = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    if (cs.visibility === 'hidden' || cs.display === 'none' || box.width === 0 || box.height === 0 || el.closest('.sr-only')) continue;
    const bg = bgOf(el); const fg = over(parse(cs.color), bg);
    const a = lum(fg), c = lum(bg); const ratio = (Math.max(a, c) + 0.05) / (Math.min(a, c) + 0.05);
    const size = parseFloat(cs.fontSize); const large = size >= 24 || (size >= 18.66 && parseInt(cs.fontWeight, 10) >= 700);
    if (ratio < (large ? 3 : 4.5)) out.push([el.tagName, n.textContent.trim().slice(0, 40), ratio.toFixed(2)]);
  }
  return JSON.stringify(out);
})()`));
// The site scrolls smoothly; jump so a screenshot is not taken mid-scroll.
const jumpTo = (selector, offset = 0) => b.eval(`(() => { document.documentElement.style.scrollBehavior = 'auto'; document.querySelector(${JSON.stringify(selector)}).scrollIntoView({ block: 'start' }); window.scrollBy(0, ${offset}); return true; })()`);
const openIsland = async (url) => {
  await b.go(url, 1200);
  await b.eval(`(() => { const i = document.querySelector('${ISLAND}'); (i?.firstElementChild ?? i)?.scrollIntoView({ block: 'center' }); return true; })()`);
  return b.waitFor(ready, 12000);
};

try {
  // ---- 1. English page markup (static HTML as served) -------------------------------------------------------
  const en = await page("/upi-id-generator/");
  const main = mainOf(en.html);
  const mainText = stripTags(main);
  const docs = jsonLd(en.html);
  check("English page is served", en.status === 200 && en.html.includes("<h1"));
  const titleText = decode(en.html.match(/<title>([\s\S]*?)<\/title>/)[1]);
  check("title is the retitled name-ideas and format-check one", titleText === "UPI ID Generator: Name Ideas & Format Check (VPA)", titleText);
  const metaDesc = decode(en.html.match(/<meta name="description" content="([^"]*)"/)[1]);
  check("description is 70-170 chars and promises no creating or verifying", metaDesc.length >= 70 && metaDesc.length <= 170 && !/verif|create|real|valid/i.test(metaDesc), `${metaDesc.length}: ${metaDesc}`);
  check("exactly one H1", (en.html.match(/<h1[ >]/g) ?? []).length === 1);
  check("H1 does not promise to create or verify", !/creat|verif/i.test(stripTags(en.html.match(/<h1[\s\S]*?<\/h1>/)[0])));
  const crumbs = nodes(docs, "BreadcrumbList");
  check("exactly one BreadcrumbList in the page", crumbs.length === 1, String(crumbs.length));
  const crumbItems = crumbs[0]?.itemListElement ?? [];
  check("breadcrumb is Home, All Tools, UPI ID Generator with the canonical last",
    crumbItems.map((i) => i.name).join("|") === "Home|All Tools|UPI ID Generator" && crumbItems.map((i) => i.position).join() === "1,2,3"
    && crumbItems[2]?.item === "https://www.proupiqr.in/upi-id-generator/" && crumbItems[1]?.item === "https://www.proupiqr.in/tools/", JSON.stringify(crumbItems));
  const app = nodes(docs, "WebApplication")[0];
  check("WebApplication has dateModified, an author Person, the publisher id and a free offer",
    app?.dateModified === "2026-11-01" && app?.author?.["@type"] === "Person" && app?.author?.name === "Kunal Siyag"
    && app?.publisher?.["@id"] === "https://www.proupiqr.in/#organization" && app?.offers?.price === "0" && !("aggregateRating" in app) && !("review" in app), JSON.stringify(app)?.slice(0, 300));
  check("WebApplication copy does not promise to create or verify", !/creat|verif/i.test(`${app?.name} ${app?.description} ${(app?.featureList ?? []).join(" ")}`));
  const faqSchema = nodes(docs, "Question").map((q) => q.name);
  const faqVisible = [...main.matchAll(/<summary[^>]*>([\s\S]*?)<\/summary>/g)].map((m) => stripTags(m[1]));
  check("FAQ schema mirrors the visible FAQ (9 questions, same text)", faqSchema.length === 9 && JSON.stringify(faqSchema) === JSON.stringify(faqVisible), `${faqSchema.length} vs ${faqVisible.length}`);
  const faqAnswers = nodes(docs, "Answer").map((a) => a.text);
  check("every schema answer is on the page", faqAnswers.every((a) => mainText.includes(a)));
  const howto = nodes(docs, "HowTo")[0];
  check("HowTo steps are visible as a 3-step ordered list", howto?.step?.length === 3 && howto.step.every((s) => mainText.includes(s.text) && mainText.includes(s.name)) && /<ol[^>]*>[\s\S]*?<li>[\s\S]*?<li>[\s\S]*?<li>/.test(main));
  check("the one-line notice is visible above the tool and says format only",
    main.indexOf("data-upi-id-disclosure") > -1 && main.indexOf("data-upi-id-disclosure") < main.indexOf('id="upi-id-tool"')
    && /Format check only\. This does not show that a UPI ID exists or who owns it/.test(mainText) && !main.slice(0, main.indexOf("data-upi-id-disclosure")).includes("<details"));
  check("it says independent tool and links the disclaimer", /Independent tool, not affiliated with NPCI/.test(mainText) && /href="\/disclaimer\/"/.test(main));
  check("main content has 700+ words", mainText.split(" ").length >= 700, String(mainText.split(" ").length));
  const banned = mainText.match(/\b(verif\w*|valid\w*|genuine|authentic\w*|trusted|fake|prank|dummy|registered|safe)\b/gi);
  check("no verify, valid, genuine, safe, registered or fake wording in the main content", banned === null, JSON.stringify(banned));
  check("Paytm Payments Bank is gone and @paytm is marked older", !/Payments Bank/i.test(mainText) && /@paytm\s+Older IDs/.test(mainText) && /assigned to Yes Bank from 15 March 2024/.test(mainText));
  check("@ptyes is named in the FAQ", /Which handle will I get: @ybl, @oksbi or @ptyes\?/.test(mainText) && /@ptyes, @pthdfc, @ptsbi and @ptaxis/.test(mainText));
  check("no add-or-change promise anywhere", !/add or change|change it later|change one later/i.test(mainText));
  const rows = [...main.matchAll(/<tbody>([\s\S]*?)<\/tbody>/g)][0]?.[1].match(/<tr[ >]/g) ?? [];
  check("handle table has one row per handle (14), each with a source link", rows.length === 14 && (main.match(/<tbody>[\s\S]*?<\/tbody>/)[0].match(/<a href="https:/g) ?? []).length === 14, String(rows.length));
  check("handle table says where the bank comes from and shows the review date", /Where a source names only the app, the bank is the one in the handle's name/.test(mainText) && /Checked 1 November 2026/.test(mainText));
  check("Last reviewed line links the author and the accuracy policy", /Last reviewed 1 November 2026 by Kunal Siyag/.test(mainText) && /href="\/authors\/kunal-siyag\/"/.test(main) && /href="\/accuracy-policy\/"/.test(main));
  const external = [...main.matchAll(/<a [^>]*href="(https?:\/\/[^"]+)"[^>]*>/g)];
  check("sources list has every source, all links open safely", external.length >= 10 + 14 && external.every((m) => /target="_blank"/.test(m[0]) && /rel="noopener noreferrer nofollow"/.test(m[0])), String(external.length));
  check("no low-contrast text-muted in the page body", !/text-muted/.test(main));
  const relatedBlock = main.slice(main.lastIndexOf("More on UPI IDs"));
  const relatedLinks = [...relatedBlock.matchAll(/<li class="border-t border-forest\/10">\s*<a href="([^"]+)"/g)].map((m) => m[1]);
  check("related list is 10 links and has both hubs, the PSP glossary term and the sibling tools",
    relatedLinks.length === 10 && ["/upi-qr-generators/", "/upi-errors-and-limits/", "/glossary/psp/", "/glossary/vpa/", "/upi-qr-decoder/", "/upi-qr-scanner/", "/upi-id-to-qr-code-generator/"].every((h) => relatedLinks.includes(h)), relatedLinks.join(" "));
  check("page uses no emoji", !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(mainText));

  // ---- 2. English page in the browser -----------------------------------------------------------------------
  await b.send("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.__clip = []; window.__clipMode = 'ok';
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: (t) => window.__clipMode === 'ok' ? (window.__clip.push(String(t)), Promise.resolve()) : Promise.reject(new Error('blocked')),
    } });` });
  check("English island hydrates", await openIsland(`${BASE}/upi-id-generator/`));
  check("H1 renders", /UPI ID generator: name ideas and a format check/.test(await b.eval("document.querySelector('h1')?.textContent ?? ''")));
  check("empty box asks for an ID and is not marked invalid", /Type a UPI ID such as name@okicici\./.test(await result()) && (await invalidFlag()) === "false");
  check("the input is described by the status box and the note",
    await b.eval(`(() => { const el = document.querySelector('[data-upi-id-input]'); const ids = (el.getAttribute('aria-describedby') || '').split(' ').filter(Boolean);
      const found = ids.map((id) => document.getElementById(id)); return found.length === 2 && found.every(Boolean) && found[0].getAttribute('role') === 'status' && found[0].getAttribute('aria-live') === 'polite' && /written format only/.test(found[1].textContent); })()`));

  await typeVpa(VPA);
  let out = await result();
  check("a well-formed ID says no format problems were found", /Looks well-formed\. No format problems found\./.test(out), out);
  check("it shows the parts and the issuer", /sharmastores/.test(out) && /@okicici/.test(out) && /Google Pay \(ICICI Bank\)/.test(out), out);
  check("a well-formed ID is not marked invalid", (await invalidFlag()) === "false");
  check("the result never says valid or verified", !/valid|verif/i.test(out), out);

  const problems = [
    ["sh op@ybl", /Remove the spaces/],
    ["a@b@c", /Use exactly one @ sign/],
    ["@ybl", /Add something before the @/],
    ["shop@", /Add the handle after the @/],
    ["shop", /Add an @ and the handle after it/],
    ["sh$op@ybl", /Before the @, use only letters, digits, dot, hyphen and underscore/],
    ["shop@y.bl", /After the @, use letters and digits only/],
  ];
  for (const [value, expected] of problems) {
    await typeVpa(value);
    out = await result();
    check(`"${value}" reports its problem and is marked invalid`, /This ID has a format problem\./.test(out) && expected.test(out) && (await invalidFlag()) === "true", out);
  }
  for (const value of ["ab@ybl", "a_b@ybl", "shop@somebank"]) {
    await typeVpa(value);
    out = await result();
    check(`"${value}" is not called a problem and is not held to this site's rule`, /No format problems found/.test(out) && !/site's QR generator/.test(out), out);
  }
  await typeVpa("shop@somebank");
  check("an unknown handle is fine and says so", /Not in our list\. That is fine/.test(await result()));
  await typeVpa("a@ybl");
  out = await result();
  check("a 1-character name passes the format check but the note says it is this site's rule", /No format problems found/.test(out) && /at least 2 characters before the @/.test(out) && /this site's rule, not a UPI rule/.test(out), out);
  check("...and the QR button is still a plain link that carries nothing", (await ctaHref()) === "/upi-id-to-qr-code-generator/");
  await typeVpa("9876543210@paytm");
  out = await result();
  check("@paytm is recognised as an older handle via Yes Bank", /Paytm, older IDs \(via Yes Bank\)/.test(out) && /older handle/.test(out) && !/Payments Bank/.test(out), out);
  await typeVpa("Shop@UPI");
  out = await result();
  check("capitals get the lowercase form", /usually written in lowercase/.test(out) && /shop@upi/.test(out) && /BHIM/.test(out), out);
  await typeVpa("");
  check("clearing the box returns to the prompt", /Type a UPI ID such as name@okicici\./.test(await result()));

  // Ideas
  await typeVpa(VPA);
  await setValue("[data-upi-id-name]", NAME);
  await setValue("[data-upi-id-mobile]", "98765 43210");
  await sleep(150);
  const ideas = JSON.parse(await b.eval("JSON.stringify([...document.querySelectorAll('[data-upi-id-ideas] li span')].map((s) => s.textContent))"));
  check("five ideas from the name and number", JSON.stringify(ideas) === JSON.stringify(["sharmakiranastore@ybl", "sharma.store@ybl", "sharmas@ybl", "sharmakiranastore.pay@ybl", "sharma3210@ybl"]), JSON.stringify(ideas));
  const options = JSON.parse(await b.eval("JSON.stringify([...document.querySelectorAll('[data-upi-id-handle] option')].map((o) => o.value))"));
  check("the handle list offers @ptyes and no @paytm", options.includes("ptyes") && options.includes("pthdfc") && !options.includes("paytm") && options.length === 13, options.join(","));
  await setValue("[data-upi-id-handle]", "ptaxis");
  await sleep(100);
  check("ideas follow the chosen handle", (await b.eval("document.querySelector('[data-upi-id-ideas] li span').textContent")) === "sharmakiranastore@ptaxis");
  await setValue("[data-upi-id-handle]", "ybl");
  await sleep(100);
  const labels = JSON.parse(await b.eval("JSON.stringify([...document.querySelectorAll('[data-upi-id-ideas] button')].map((x) => [x.getAttribute('aria-label'), x.textContent]))"));
  check("each Copy button names its idea", labels.length === 5 && labels.every(([label, text], i) => label === `Copy ID: ${ideas[i]}` && text === "Copy ID"), JSON.stringify(labels));
  check("the idea text selects with one click", await b.eval("getComputedStyle(document.querySelector('[data-upi-id-ideas] li span')).userSelect === 'all'"));

  // Keyboard: Tab from the name field through mobile and handle to the first Copy button, then Enter.
  await b.eval("document.querySelector('[data-upi-id-name]').focus(); true");
  for (let i = 0; i < 3; i++) await key("Tab", "Tab", 9);
  const onCopy = await b.eval("document.activeElement.tagName === 'BUTTON' && /^Copy ID: /.test(document.activeElement.getAttribute('aria-label'))");
  check("Tab reaches the first Copy button", onCopy === true);
  check("the focused button shows a visible outline", await b.eval("(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2; })()"));
  await key("Enter", "Enter", 13, "\r");
  await sleep(250);
  check("Enter copies the idea", (await b.eval("JSON.stringify(window.__clip)")) === JSON.stringify([ideas[0]]), await b.eval("JSON.stringify(window.__clip)"));
  check("the button and the live region confirm it",
    await b.eval(`(() => { const first = document.querySelector('[data-upi-id-ideas] button'); const live = document.querySelector('[data-upi-id-copied]');
      return first.textContent === 'ID copied' && first.getAttribute('aria-label') === 'ID copied: ${ideas[0]}' && live.getAttribute('role') === 'status' && live.textContent === 'ID copied: ${ideas[0]}'; })()`));
  await sleep(2100);
  check("the confirmation resets", (await b.eval("document.querySelector('[data-upi-id-ideas] button').textContent")) === "Copy ID");
  await b.eval("window.__clipMode = 'fail'; document.querySelectorAll('[data-upi-id-ideas] button')[1].click(); true");
  await sleep(250);
  check("a blocked clipboard shows 'Select the text and copy it'",
    await b.eval("(() => { const m = document.querySelector('[data-upi-id-copy-failed]'); return /Select the text and copy it/.test(m.textContent) && m.className.indexOf('sr-only') === -1 && m.getAttribute('role') === 'status'; })()"));
  await setValue("[data-upi-id-name]", "Ravi Traders");
  await sleep(150);
  check("the failure message goes away when the ideas change", (await b.eval("document.querySelector('[data-upi-id-copy-failed]').textContent")) === "");
  await b.eval("window.__clipMode = 'ok'; true");
  await setValue("[data-upi-id-name]", NAME);
  await sleep(150);
  check("...and does not come back when the same ideas return", (await b.eval("document.querySelector('[data-upi-id-copy-failed]').textContent")) === "");

  // Targets and contrast helpers
  // WCAG 2.5.8: links inside a sentence are exempt, so the inline source links are left out of the 24px rule.
  const small = JSON.parse(await b.eval(`JSON.stringify([...document.querySelectorAll('${ISLAND} button, ${ISLAND} a, ${ISLAND} input, ${ISLAND} select')]
    .filter((el) => el.tagName !== 'A' || el.closest('p') === null)
    .map((el) => [el.tagName, (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30), Math.round(el.getBoundingClientRect().width), Math.round(el.getBoundingClientRect().height)])
    .filter(([, , w, h]) => w < 24 || h < 24))`));
  check("every button, input, select and stand-alone link in the tool is at least 24px high and wide", small.length === 0, JSON.stringify(small));
  check("the tool uses no text-muted", await b.eval(`document.querySelector('${ISLAND}').querySelector('.text-muted') === null`));
  check("the tool says what the check cannot do and that apps can be stricter",
    await b.eval(`/cannot tell whether an ID exists or who owns it/.test(document.querySelector('${ISLAND}').textContent) && /Apps can be stricter about length and symbols/.test(document.querySelector('${ISLAND}').textContent)`));
  const toolText = await b.eval(`document.querySelector('${ISLAND}').textContent`);
  check("the tool tells the truth about Paytm and Google Pay lists and about editing",
    /Paytm does not let you type an ID/.test(toolText) && /Next to the ID you want, tap Add/.test(toolText) && /up to 4 IDs per bank account/.test(toolText) && /Do not count on editing an existing ID/.test(toolText) && !/add or change|Payments Bank/i.test(toolText));
  check("the tool stamps the app steps with the review date and links its sources",
    /Steps checked against the sources below on 1 November 2026/.test(toolText) && await b.eval(`[...document.querySelectorAll('${ISLAND} a[target=_blank]')].length === 7`));

  // Contrast in every result state (older handle + capitals, this site's rule, a problem list, the plain ID).
  for (const state of ["Shop@PAYTM", "a@ybl", "sh op@ybl", VPA]) {
    await typeVpa(state);
    const low = await lowContrast();
    check(`text contrast is at least 4.5:1 (3:1 large) with "${state}" in the box`, low.length === 0, JSON.stringify(low));
  }

  // Negative control: the detector must flag the old text-muted grey (4.41:1 on white).
  await b.eval("(() => { const p = document.createElement('p'); p.id = '__neg'; p.className = 'text-sm'; p.style.color = '#6f7988'; p.textContent = 'negative control'; document.querySelector('main').appendChild(p); return true; })()");
  check("the contrast check does flag the old muted grey #6f7988 (negative control)", (await lowContrast()).some(([, text]) => text === "negative control"));
  await b.eval("document.getElementById('__neg').remove(); true");

  // The QR hand-off
  const href = await ctaHref();
  check("the QR button is a plain link to the UPI ID to QR page, with no ID or name in it", href === "/upi-id-to-qr-code-generator/", href);
  await b.shot("upi-id-desktop-tool.png");

  // Storage and network so far
  const stored = await b.eval(`JSON.stringify([...Object.entries(localStorage), ...Object.entries(sessionStorage)])`);
  check("nothing typed is stored in the browser", !/sharma|9876543210/i.test(stored), stored.slice(0, 300));
  const hosts = new Set(b.requests.map((u) => { try { return new URL(u).host; } catch { return ""; } }).filter(Boolean));
  check("no request leaves this origin and none goes to Clerk", [...hosts].every((h) => h === HOST) && !b.requests.some((u) => /clerk/i.test(u)), [...hosts].join(" "));
  check("no console errors", b.errors.length === 0, b.errors.join(" | "));

  // The link opens the QR page with nothing carried over
  await b.eval("document.querySelector('[data-upi-id-qr-link]').click(); true");
  await sleep(2800);
  check("the QR button opens the UPI ID to QR page", (await b.eval("location.pathname")) === "/upi-id-to-qr-code-generator/");
  check("no hash or query is added to the address", (await b.eval("location.hash + location.search")) === "");
  const carried = await b.eval(`[...document.querySelectorAll('input')].some((i) => i.value === ${JSON.stringify(VPA)} || i.value === ${JSON.stringify(NAME)})`);
  check("the generator on that page starts empty: the ID and name were not passed on", carried === false);
  check("the hand-off throws no console errors", b.errors.filter((e) => !/clerk|ERR_BLOCKED/i.test(e)).length === 0, b.errors.join(" | "));

  // ---- 3. Layout ---------------------------------------------------------------------------------------------
  await b.go(`${BASE}/upi-id-generator/`, 1500);
  await b.waitFor(ready, 10000);
  check("no horizontal overflow on desktop", await b.eval("document.documentElement.scrollWidth <= window.innerWidth"));
  await jumpTo("#handles", -80);
  await sleep(300);
  await b.shot("upi-id-desktop-table.png");
  await b.mobile(true);
  await b.go(`${BASE}/upi-id-generator/`, 1500);
  await b.waitFor(ready, 10000);
  await b.shot("upi-id-mobile-top.png");
  check("no horizontal overflow at 390px", await b.eval("document.documentElement.scrollWidth <= window.innerWidth"), await b.eval("document.documentElement.scrollWidth + ' > ' + window.innerWidth"));
  await typeVpa("9876543210@paytm");
  await setValue("[data-upi-id-name]", NAME);
  await jumpTo("[data-upi-id-input]", -120);
  await sleep(300);
  await b.shot("upi-id-mobile-tool.png");
  check("no overflow with a long result at 390px", await b.eval("document.documentElement.scrollWidth <= window.innerWidth"));
  await jumpTo("#handles", -80);
  await sleep(300);
  await b.shot("upi-id-mobile-table.png");
  check("the handle table fits inside the screen at 390px", await b.eval("(() => { const r = document.querySelector('[data-upi-id-handles]').getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth; })()"));
  await jumpTo("#sources", -80);
  await sleep(300);
  await b.shot("upi-id-mobile-sources.png");
  check("no overflow after scrolling the sources at 390px", await b.eval("document.documentElement.scrollWidth <= window.innerWidth"));
  await b.mobile(false);

  // ---- 4. hi, ta, te, mr -------------------------------------------------------------------------------------
  const locales = {
    hi: { h2: "UPI ID का फ़ॉर्मेट जांचें", ok: "फ़ॉर्मेट में कोई समस्या नहीं मिली", copy: "ID कॉपी करें", stamp: "1 नवंबर 2026", find: "अपनी UPI ID कहाँ मिलेगी और दूसरी कैसे जोड़ें", older: "पुरानी ID" },
    ta: { h2: "UPI ID எப்படி எழுதப்பட்டுள்ளது எனச் சரிபார்க்கவும்", ok: "வடிவத்தில் எந்தச் சிக்கலும் கண்டறியப்படவில்லை", copy: "ID-ஐ நகலெடு", stamp: "1 நவம்பர் 2026", find: "உங்கள் UPI ID எங்கே கிடைக்கும், இன்னொன்றை எப்படிச் சேர்ப்பது", older: "பழைய ID-கள்" },
    te: { h2: "UPI ID ఎలా రాశారో తనిఖీ చేయండి", ok: "ఫార్మాట్‌లో ఎలాంటి సమస్యలు కనబడలేదు", copy: "IDని కాపీ చేయండి", stamp: "1 నవంబర్ 2026", find: "మీ UPI ID ఎక్కడ దొరుకుతుంది, మరొకటి ఎలా జోడించాలి", older: "పాత IDలు" },
    mr: { h2: "UPI ID कसा लिहिला आहे ते तपासा", ok: "फॉरमॅटमध्ये कोणतीही अडचण आढळली नाही", copy: "ID कॉपी करा", stamp: "1 नोव्हेंबर 2026", find: "तुमचा UPI ID कुठे मिळेल आणि दुसरा कसा जोडायचा", older: "जुने ID" },
  };
  for (const [lang, want] of Object.entries(locales)) {
    const html = (await page(`/${lang}/upi-id-generator/`)).html;
    const t = decode(html.match(/<title>([\s\S]*?)<\/title>/)[1]);
    const d = decode(html.match(/<meta name="description" content="([^"]*)"/)[1]);
    const mainHtml = mainOf(html);
    const faqCount = (mainHtml.match(/<h3 class="text-sm font-black text-forest">/g) ?? []).length;
    const stepCount = (mainHtml.match(/<ol class="mt-4 list-decimal[^>]*>([\s\S]*?)<\/ol>/)?.[1].match(/<li>/g) ?? []).length;
    check(`${lang}: title 20-70, description 70-170, lang attribute, five FAQs, three steps`,
      [...t].length >= 20 && [...t].length <= 70 && [...d].length >= 70 && [...d].length <= 170 && new RegExp(`<html lang="${lang}"`).test(html) && faqCount === 5 && stepCount === 3,
      `${[...t].length}/${[...d].length}/${faqCount}/${stepCount}`);
    check(`${lang}: island hydrates when scrolled into view`, await openIsland(`${BASE}/${lang}/upi-id-generator/`));
    // Everything on the page except the shared related-links hub at the end (its tool names are not ours).
    const own = await b.eval("[...document.querySelector('main > div').children].slice(0, -1).map((e) => e.textContent).join(' ')");
    check(`${lang}: no valid, verify or create-a-real wording in the intro, tool and FAQ`, !/\b(verif\w*|valid\w*|create a real|genuine|authentic\w*)\b/i.test(own), (own.match(/\b(verif\w*|valid\w*|genuine|authentic\w*)\b/gi) ?? []).join());
    let body = await b.eval("document.body.textContent");
    check(`${lang}: tool headings are translated`, body.includes(want.h2) && body.includes(want.find) && body.includes(want.stamp), `${body.includes(want.h2)} ${body.includes(want.find)} ${body.includes(want.stamp)}`);
    await typeVpa(VPA);
    check(`${lang}: the format result is translated`, (await result()).includes(want.ok), await result());
    await typeVpa("9876543210@paytm");
    check(`${lang}: @paytm shows the translated older-handle label`, (await result()).includes(want.older), await result());
    await typeVpa(VPA);
    await setValue("[data-upi-id-name]", NAME);
    await sleep(150);
    const copyText = await b.eval("document.querySelector('[data-upi-id-ideas] button')?.textContent ?? ''");
    check(`${lang}: the Copy button has its own translation`, copyText === want.copy, copyText);
    const cta = await ctaHref();
    check(`${lang}: the QR button points into the same language, carrying nothing`, cta === `/${lang}/upi-id-to-qr-code-generator/`, cta);
    const hrefs = JSON.parse(await b.eval(`JSON.stringify([...document.querySelectorAll('${ISLAND} a[href^="/"]')].map((a) => a.getAttribute('href').split('#')[0]))`));
    const statuses = await Promise.all([...new Set(hrefs)].map(async (h) => [h, (await fetch(BASE + h)).status]));
    check(`${lang}: every link in the tool exists`, statuses.every(([, s]) => s === 200), JSON.stringify(statuses));
    check(`${lang}: no overflow at desktop width`, await b.eval("document.documentElement.scrollWidth <= window.innerWidth"));
    if (lang === "hi") {
      await b.shot("upi-id-hi-tool.png");
      await b.eval("document.querySelector('[data-upi-id-qr-link]').click(); true");
      await sleep(2800);
      check("hi: the QR button opens the Hindi UPI ID to QR page", (await b.eval("location.pathname")) === "/hi/upi-id-to-qr-code-generator/" && (await b.eval("location.hash + location.search")) === "");
    }
  }
  check("hi/ta/te/mr throw no console errors", b.errors.filter((e) => !/clerk|ERR_BLOCKED/i.test(e)).length === 0, b.errors.join(" | "));
} catch (error) {
  check("test script ran to completion", false, String(error?.stack ?? error).slice(0, 700));
} finally {
  b.close();
}
process.exit(check.report());
