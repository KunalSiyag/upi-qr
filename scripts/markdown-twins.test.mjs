// Markdown twins and llms.txt (scripts/build_markdown_twins.mjs): the converter on crafted HTML, the page rules, the build step on a
// temporary site, and (when a build exists) an audit of the real output.
//
//   npm run test:markdown
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SITE, buildLlms, buildTwins, decodeEntities, htmlToMarkdown, pageToTwin, parseHtml } from "./build_markdown_twins.mjs";

let checks = 0;
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks++; };
const ok = (value, message) => { assert.ok(value, message); checks++; };
const md = (html, url = `${SITE}/x/`) => htmlToMarkdown(parseHtml(`<main>${html}</main>`).children[0], url);

/* ---- Entities and parsing ---- */
eq(decodeEntities("a &amp; b &lt;c&gt; &#8377;5 &#x20B9;6 &nbsp;x &unknown;"), "a & b <c> ₹5 ₹6  x &unknown;", "entities");
eq(md("<p>Tom &amp; Jerry</p>"), "Tom & Jerry", "an entity in text");
eq(md("<p>One<br>two</p>"), "One\ntwo", "a line break");
eq(md("<p>a < b</p>"), "a < b", "a bare less-than is text");

/* ---- Blocks ---- */
eq(md("<h1>Title</h1><p>Intro text.</p><h2>Part</h2><p>More.</p>"), "# Title\n\nIntro text.\n\n## Part\n\nMore.", "headings and paragraphs");
eq(md("<h1>One</h1><h1>Two</h1>"), "# One\n\n## Two", "a second h1 becomes h2");
eq(md("<ul><li>a</li><li>b<ul><li>c</li></ul></li></ul>"), "- a\n- b\n  - c", "nested lists");
eq(md("<ol><li>first</li><li>second</li></ol>"), "1. first\n2. second", "ordered lists");
eq(md("<ul><li>a<li>b</ul>"), "- a\n- b", "list items without closing tags");
eq(md("<table><thead><tr><th>Rule</th><th>Section</th></tr></thead><tbody><tr><td>HRA</td><td>a | b</td></tr></tbody></table>"), "| Rule | Section |\n| --- | --- |\n| HRA | a \\| b |", "tables, with pipes escaped");
eq(md("<details><summary>Why?</summary><p>Because.</p></details>"), "**Why?**\n\nBecause.", "details become a bold question and its answer");
eq(md("<blockquote><p>Quoted</p></blockquote>"), "> Quoted", "blockquote");
eq(md("<hr>"), "---", "rule");
eq(md("<pre>line 1\nline 2</pre>"), "```\nline 1\nline 2\n```", "preformatted text");

/* ---- Inline ---- */
eq(md('<p>See <a href="/tools/">the tools</a> and <a href="https://example.com/a?b=1">x</a>.</p>'), "See [the tools](https://www.proupiqr.in/tools/) and [x](https://example.com/a?b=1).", "links become absolute");
eq(md('<p><a href="#tool">Jump</a>Text</p>'), "Text", "same-page jump links are dropped");
eq(md('<p><a href="javascript:void(0)">x</a>y</p>'), "xy", "javascript links keep only the text");
eq(md("<p><strong>bold</strong> and <em>it</em> and <code>c</code></p>"), "**bold** and *it* and `c`", "emphasis and code");
eq(md('<p><img src="/a.png" alt="A chart"><img src="/b.png"></p>'), "![A chart](https://www.proupiqr.in/a.png)", "images keep alt text and decorative ones vanish");
eq(md('<a href="/x/"><span>Title</span><span>Description here</span></a>'), "[Title Description here](https://www.proupiqr.in/x/)", "card spans stay apart");
eq(md("<p>caf&eacute; &mdash; ok</p>").includes("—"), true, "named dashes");

/* ---- What is left out ---- */
eq(md("<p>Keep</p><script>alert(1)</script><style>.a{}</style><noscript>n</noscript><button>Click</button>"), "Keep", "scripts, styles and buttons");
eq(md('<p aria-hidden="true">no</p><p hidden>no</p><p class="hidden">no</p><p class="hidden lg:block">yes</p><p>shown</p>'), "yes\n\nshown", "hidden content, but not responsive-visible content");
eq(md('<p class="text-sm font-semibold text-leaf">Money tools</p><h1>Real</h1>'), "# Real", "decorative eyebrow labels");
eq(md('<h1>T</h1><astro-island uid="1"><div><input><label>Amount</label><p>UI text</p></div></astro-island><p>After</p>'), "# T\n\n> Interactive tool: use it at https://www.proupiqr.in/x/ . It runs in your browser and the inputs never leave your device.\n\nAfter", "the interactive island becomes one note");
eq(md('<nav aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><a href="/tools/">All Tools</a><span>/</span><span aria-current="page">Tool</span></nav>'), "Breadcrumb: Home > All Tools > Tool", "breadcrumbs");
eq(md('<nav aria-label="Main"><a href="/a/">A</a></nav><p>x</p>'), "x", "other navigation");

/* ---- Pages ---- */
const page = (head, body, url = `${SITE}/calc/`) => `<!doctype html><html lang="en"><head><title>Calc | Pro UPI QR</title><meta name="description" content="A calc."><link rel="canonical" href="${url}">${head}</head><body><header>NAV</header><main>${body}</main><footer>FOOT</footer></body></html>`;
const ld = (data) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
{
  const twin = pageToTwin(page(ld({ "@graph": [{ "@type": "WebApplication", name: "Calc", applicationCategory: "FinanceApplication", featureList: ["One", "Two"], offers: { price: "0" } }, { "@type": "HowTo", name: "How to use it", step: [{ name: "Enter" }, { name: "Read" }] }] }), "<h1>Calc</h1><p>Body</p>"), `${SITE}/calc/`);
  ok(twin, "an indexable page gets a twin");
  ok(twin.markdown.startsWith('---\ntitle: "Calc | Pro UPI QR"\ndescription: "A calc."\nurl: "https://www.proupiqr.in/calc/"\nlanguage: "en"\ntype: "tool"\ncategory: "FinanceApplication"\nprice: "free"\n---\n\n# Calc\n\nBody'), "front matter and body");
  ok(twin.markdown.includes("## Features\n\n- One\n- Two") && twin.markdown.includes("## How to use it\n\n1. Enter\n2. Read"), "features and steps from the JSON-LD");
  ok(!twin.markdown.includes("NAV") && !twin.markdown.includes("FOOT"), "the site header and footer are not included");
  ok(twin.markdown.trimEnd().endsWith(`Source: ${SITE}/calc/ (HTML). This Markdown version is generated from that page. Site: ${SITE}/`), "a source line");
  eq(twin.type, "tool", "type");
}
eq(pageToTwin(page('<meta name="robots" content="noindex, follow">', "<h1>x</h1>"), `${SITE}/calc/`), null, "noindex pages get no twin");
eq(pageToTwin(page("", "<h1>x</h1>", `${SITE}/other/`), `${SITE}/calc/`), null, "a page whose canonical is elsewhere gets no twin");
eq(pageToTwin(page('<meta http-equiv="refresh" content="0;url=/x/">', "<h1>x</h1>"), `${SITE}/calc/`), null, "redirect stubs get no twin");
eq(pageToTwin("<html><head><title>x</title></head><body>no canonical</body></html>", `${SITE}/calc/`), null, "no canonical: no twin");
ok(pageToTwin(page(ld({ "@type": "BlogPosting", dateModified: "2026-11-01" }), "<p>No heading</p>"), `${SITE}/calc/`).markdown.includes('type: "article"') , "article type");
ok(pageToTwin(page("", "<p>No heading</p>"), `${SITE}/calc/`).markdown.includes("# Calc\n\nNo heading"), "a missing h1 falls back to the title");

/* ---- The build step, on a temporary site ---- */
{
  const dir = mkdtempSync(join(tmpdir(), "twins-"));
  const put = (path, html) => { const full = join(dir, path); mkdirSync(join(full, ".."), { recursive: true }); writeFileSync(full, html); };
  put("calc/index.html", page(ld({ "@type": "WebApplication", name: "Calc", applicationCategory: "FinanceApplication", offers: { price: "0" } }), "<h1>Calc</h1><p>Body text.</p>"));
  put("hi/calc/index.html", page("", "<h1>कैलक</h1>", `${SITE}/hi/calc/`).replace('lang="en"', 'lang="hi"'));
  put("app/index.html", page('<meta name="robots" content="noindex">', "<h1>App</h1>", `${SITE}/app/`));
  put("guide/index.html", page(ld({ "@type": "BlogPosting", headline: "G" }), "<h1>Guide</h1><p>Text.</p>", `${SITE}/guide/`));
  put("index.html", page("", "<h1>Home</h1>", `${SITE}/`));
  put("_astro/index.html", "<html>skip</html>");
  const twins = buildTwins(dir);
  eq(twins.length, 4, "four indexable pages, not the noindex app or the asset folder");
  ok(existsSync(join(dir, "calc", "index.md")) && existsSync(join(dir, "hi", "calc", "index.md")) && existsSync(join(dir, "index.md")), "the twins sit beside their pages");
  ok(!existsSync(join(dir, "app", "index.md")), "no twin for a noindex page");
  ok(readFileSync(join(dir, "calc", "index.html"), "utf8").includes('<link rel="alternate" type="text/markdown" href="https://www.proupiqr.in/calc/index.md"'), "the HTML links to its twin");
  ok(readFileSync(join(dir, "index.html"), "utf8").includes('href="https://www.proupiqr.in/index.md"'), "…including the home page");
  ok(!readFileSync(join(dir, "app", "index.html"), "utf8").includes("text/markdown"), "…but a noindex page does not");
  const once = readFileSync(join(dir, "calc", "index.html"), "utf8");
  buildTwins(dir);
  eq(readFileSync(join(dir, "calc", "index.html"), "utf8"), once, "running it twice does not add the link twice");

  const template = join(dir, "template.txt");
  writeFileSync(template, "# Site\n\nIntro.\n\n## Index\n\n<!-- AUTO:INDEX -->\n");
  const info = buildLlms(buildTwins(dir), dir, template);
  eq(`${info.tools},${info.articles}`, "1,1", "one tool and one guide in English");
  const llms = readFileSync(join(dir, "llms.txt"), "utf8");
  ok(llms.includes("### Calculators and money tools") && llms.includes("(https://www.proupiqr.in/calc/index.md)") && llms.includes("### Guides and articles"), "llms.txt lists the tools and guides with Markdown links");
  ok(!llms.includes("<!-- AUTO:INDEX -->") && !llms.includes("hi/calc"), "the marker is replaced and non-English pages are not listed");
  ok(readFileSync(join(dir, "llms-full.txt"), "utf8").includes("## Calc\n\nURL: https://www.proupiqr.in/calc/"), "llms-full.txt has each tool's text");
  writeFileSync(template, "# No marker\n");
  buildLlms(buildTwins(dir), dir, template);
  ok(readFileSync(join(dir, "llms.txt"), "utf8").includes("## Tool and guide index"), "a template without the marker gets the index appended");
}

/* ---- The real build output, when there is one ---- */
const STATIC = join(new URL("..", import.meta.url).pathname, ".vercel", "output", "static");
if (existsSync(join(STATIC, "index.md"))) {
  const mds = [];
  const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) { if (n !== "_astro") walk(p); } else if (n === "index.md") mds.push(p); } };
  walk(STATIC);
  ok(mds.length > 300, `a real build has hundreds of twins (${mds.length})`);
  let bad = [];
  for (const f of mds) {
    const text = readFileSync(f, "utf8");
    const prose = text.replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, ""); // code samples may contain anything
    const problems = [];
    if (!text.startsWith('---\ntitle: "')) problems.push("front matter");
    if ((prose.match(/^# /gm) ?? []).length !== 1) problems.push(`h1 count ${(prose.match(/^# /gm) ?? []).length}`);
    if (/<(div|span|script|style|svg|section|button)\b/i.test(prose)) problems.push("leftover tags");
    if (/\]\((?![a-z][a-z0-9+.-]*:)[^)]*\)/i.test(prose)) problems.push("a relative link (no URL scheme)");
    if (/\s(href|class)=/.test(text)) problems.push("attributes");
    if (problems.length) bad.push(`${f.replace(STATIC, "")}: ${problems.join(", ")}`);
    const html = readFileSync(f.replace(/index\.md$/, "index.html"), "utf8");
    if (!html.includes('type="text/markdown"')) bad.push(`${f.replace(STATIC, "")}: the HTML does not link to its twin`);
  }
  eq(bad.slice(0, 5).join("\n"), "", `every real twin is clean (${bad.length} problems)`);
  const llms = readFileSync(join(STATIC, "llms.txt"), "utf8");
  ok(llms.includes("### Calculators and money tools") && llms.includes("hra-calculator/index.md"), "the real llms.txt lists the calculators");
  ok(statSync(join(STATIC, "llms-full.txt")).size > 100_000, "the real llms-full.txt is substantial");
} else {
  console.log("(no build with twins found: skipping the real-output audit; run `npx astro build && npm run markdown:twins` first)");
}

console.log(`markdown twins: ${checks} checks passed`);
