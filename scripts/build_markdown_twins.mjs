// Agent-readable site output: a Markdown twin of every indexable page, an alternate link to it, and generated llms.txt files.
//
//   node scripts/build_markdown_twins.mjs [staticDir]        (runs from `postbuild`; default .vercel/output/static)
//
// For each built page `<path>/index.html` that is indexable (robots allows it, it has a canonical that matches its own URL) this writes
// `<path>/index.md` beside it and adds `<link rel="alternate" type="text/markdown">` to the HTML head. The Markdown is the page's <main> content
// (headings, text, lists, tables, FAQ) with a short front matter, a summary from its JSON-LD (features, steps), and absolute links. The
// interactive tool island is replaced with a one-line note: the explanation, assumptions, examples and FAQ around it are what an agent can use.
// The Markdown twins are NOT in the sitemap and are advertised only as alternates of their HTML page, so search engines keep indexing the HTML.
// It also fills `llms.txt` (from public/llms.txt, replacing the AUTO:INDEX marker with a list of every tool and guide) and writes `llms-full.txt`.
// No dependencies: the HTML parser below is small on purpose and only has to read this site's own build output.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const SITE = "https://www.proupiqr.in";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/* ---------------------------------------------------------------- HTML parsing */

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const RAW = new Set(["script", "style"]);
const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–", hellip: "…", rarr: "→", larr: "←", copy: "©", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", middot: "·", times: "×", minus: "−", bull: "•" };

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, e) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole;
    }
    return NAMED[e.toLowerCase()] ?? whole;
  });
}

const TAG = /<([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/y;
const ATTR = /([^\s=\/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

function parseAttrs(text) {
  const attrs = {};
  ATTR.lastIndex = 0;
  let m;
  while ((m = ATTR.exec(text))) attrs[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
  return attrs;
}

export function parseHtml(html) {
  const root = { type: "el", tag: "#root", attrs: {}, children: [] };
  const stack = [root];
  const top = () => stack[stack.length - 1];
  const closeTo = (tag) => {
    for (let k = stack.length - 1; k > 0; k--) if (stack[k].tag === tag) { stack.length = k; return; }
  };
  const closeIfOpen = (tags, stopAt) => {
    for (let k = stack.length - 1; k > 0; k--) {
      if (stopAt.includes(stack[k].tag)) return;
      if (tags.includes(stack[k].tag)) { stack.length = k; return; }
    }
  };
  let i = 0;
  const n = html.length;
  while (i < n) {
    if (html[i] === "<") {
      if (html.startsWith("<!--", i)) { const j = html.indexOf("-->", i + 4); i = j < 0 ? n : j + 3; continue; }
      if (html[i + 1] === "!" || html[i + 1] === "?") { const j = html.indexOf(">", i); i = j < 0 ? n : j + 1; continue; }
      if (html[i + 1] === "/") { const j = html.indexOf(">", i); const tag = html.slice(i + 2, j < 0 ? n : j).trim().toLowerCase(); closeTo(tag); i = j < 0 ? n : j + 1; continue; }
      TAG.lastIndex = i;
      const m = TAG.exec(html);
      if (m) {
        const tag = m[1].toLowerCase();
        const attrText = m[2];
        if (tag === "li") closeIfOpen(["li"], ["ul", "ol"]);
        else if (tag === "tr") closeIfOpen(["tr", "td", "th"], ["table", "thead", "tbody"]);
        else if (tag === "td" || tag === "th") closeIfOpen(["td", "th"], ["tr", "table"]);
        const el = { type: "el", tag, attrs: parseAttrs(attrText), children: [] };
        top().children.push(el);
        i += m[0].length;
        if (RAW.has(tag)) {
          const end = html.toLowerCase().indexOf(`</${tag}`, i);
          const stop = end < 0 ? n : end;
          el.children.push({ type: "raw", text: html.slice(i, stop) });
          const close = html.indexOf(">", stop);
          i = close < 0 ? n : close + 1;
        } else if (!VOID.has(tag) && !attrText.trimEnd().endsWith("/")) {
          stack.push(el);
        }
        continue;
      }
    }
    const next = html.indexOf("<", i + 1);
    const stop = next < 0 ? n : next;
    top().children.push({ type: "text", text: decodeEntities(html.slice(i, stop)) });
    i = stop;
  }
  return root;
}

const find = (node, pred, out = []) => {
  if (node.type === "el" && pred(node)) out.push(node);
  for (const c of node.children ?? []) find(c, pred, out);
  return out;
};
const textOf = (node) => (node.type === "text" ? node.text : node.type === "el" ? node.children.map(textOf).join(" ") : "");
const clean = (s) => s.replace(/\s+/g, " ").trim();

/* ------------------------------------------------------------ HTML to Markdown */

const SKIP = new Set(["script", "style", "noscript", "svg", "template", "iframe", "canvas", "button", "input", "select", "option", "textarea", "label", "form", "audio", "video", "head", "meta", "link"]);
const BLOCK = new Set(["p", "div", "section", "article", "aside", "header", "footer", "main", "ul", "ol", "li", "table", "h1", "h2", "h3", "h4", "h5", "h6", "details", "summary", "blockquote", "pre", "hr", "figure", "figcaption", "dl", "dt", "dd", "address", "fieldset", "legend", "nav"]);

/** Hidden from everyone: aria-hidden, the hidden attribute, or Tailwind's `hidden` with no responsive display class that shows it again. */
function hidden(el) {
  if (el.attrs["aria-hidden"] === "true" || "hidden" in el.attrs) return true;
  const tokens = (el.attrs.class ?? "").split(/\s+/);
  return tokens.includes("hidden") && !tokens.some((t) => /^(sm|md|lg|xl|2xl):(block|flex|grid|inline|inline-block|inline-flex|table)/.test(t));
}

function absolute(href, base) {
  if (!href || href.startsWith("#") || /^(javascript|data):/i.test(href)) return null;
  try { return new URL(href, base).href; } catch { return null; }
}

function inline(node, ctx) {
  if (node.type === "text") return node.text.replace(/\s+/g, " ");
  if (node.type !== "el" || SKIP.has(node.tag) || hidden(node)) return "";
  // Blocks, spans and cards sit side by side in the HTML; keep their text apart in the Markdown.
  const spaced = (c) => c.type === "el" && (BLOCK.has(c.tag) || c.tag === "span");
  const inner = () => {
    let out = "";
    for (const c of node.children) {
      const piece = inline(c, ctx);
      if (!piece) continue;
      if (spaced(c) && out && !/\s$/.test(out)) out += " ";
      out += piece;
      if (spaced(c)) out += " ";
    }
    return out;
  };
  switch (node.tag) {
    case "br": return "  \n";
    case "a": {
      const text = clean(inner());
      if ((node.attrs.href ?? "").startsWith("#")) return "";
      const href = absolute(node.attrs.href, ctx.url);
      return href && text ? `[${text.replace(/([\[\]])/g, "\\$1")}](${href})` : text;
    }
    case "strong": case "b": { const t = clean(inner()); return t ? `**${t}**` : ""; }
    case "em": case "i": { const t = clean(inner()); return t ? `*${t}*` : ""; }
    case "code": { const t = clean(inner()); return t ? `\`${t}\`` : ""; }
    case "img": { const alt = clean(node.attrs.alt ?? ""); const src = absolute(node.attrs.src, ctx.url); return alt && src ? `![${alt}](${src})` : ""; }
    default: return inner();
  }
}

const tidy = (s) => s.replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/ +\n/g, "\n").trim();

function listMd(el, ctx, depth) {
  const ordered = el.tag === "ol";
  const lines = [];
  let index = 1;
  for (const li of el.children.filter((c) => c.type === "el" && c.tag === "li")) {
    const parts = [];
    const nested = [];
    let buf = "";
    for (const c of li.children) {
      if (c.type === "el" && (c.tag === "ul" || c.tag === "ol")) nested.push(listMd(c, ctx, depth + 1));
      else buf += inline(c, ctx);
    }
    const text = clean(buf);
    parts.push(text);
    const bullet = ordered ? `${index++}.` : "-";
    if (text || nested.length) lines.push(`${"  ".repeat(depth)}${bullet} ${text}`.trimEnd());
    for (const n of nested) lines.push(n);
  }
  return lines.join("\n");
}

function tableMd(el, ctx) {
  const rows = find(el, (n) => n.tag === "tr").map((tr) => tr.children.filter((c) => c.type === "el" && (c.tag === "td" || c.tag === "th")).map((c) => clean(inline(c, ctx)).replace(/\|/g, "\\|")));
  const filled = rows.filter((r) => r.length > 0);
  if (filled.length === 0) return "";
  const width = Math.max(...filled.map((r) => r.length));
  const pad = (r) => [...r, ...Array(width - r.length).fill("")];
  const header = pad(filled[0]);
  const lines = [`| ${header.join(" | ")} |`, `| ${header.map(() => "---").join(" | ")} |`];
  for (const r of filled.slice(1)) lines.push(`| ${pad(r).join(" | ")} |`);
  return lines.join("\n");
}

export function blocks(children, ctx) {
  const out = [];
  let buf = "";
  const flush = () => { const t = tidy(buf); if (t) out.push(t); buf = ""; };
  for (const c of children) {
    if (c.type === "text") { buf += c.text.replace(/\s+/g, " "); continue; }
    if (c.type !== "el" || SKIP.has(c.tag) || hidden(c)) continue;
    const tag = c.tag;
    if (tag === "astro-island") {
      flush();
      if (!ctx.islandNoted) { out.push(`> Interactive tool: use it at ${ctx.url} . It runs in your browser and the inputs never leave your device.`); ctx.islandNoted = true; }
      continue;
    }
    if (!BLOCK.has(tag)) { const piece = inline(c, ctx); if (piece && tag === "a" && buf && !/\s$/.test(buf)) buf += " "; buf += piece; continue; }
    flush();
    if (/^h[1-6]$/.test(tag)) {
      let level = Number(tag[1]);
      if (level === 1) { if (ctx.h1Seen) level = 2; ctx.h1Seen = true; }
      const t = clean(inline(c, ctx));
      if (t) out.push(`${"#".repeat(level)} ${t}`);
    } else if (tag === "p") {
      const t = tidy(inline(c, ctx));
      const eyebrow = /(^|\s)text-leaf(\s|$)/.test(c.attrs.class ?? "") && /font-semibold/.test(c.attrs.class ?? "") && t.length < 40 && !t.includes("[");
      if (t && !eyebrow) out.push(t);
    } else if (tag === "ul" || tag === "ol") {
      const t = listMd(c, ctx, 0);
      if (t) out.push(t);
    } else if (tag === "table") {
      const t = tableMd(c, ctx);
      if (t) out.push(t);
    } else if (tag === "details") {
      const summary = c.children.find((x) => x.type === "el" && x.tag === "summary");
      const q = summary ? clean(inline(summary, ctx)) : "";
      if (q) out.push(`**${q}**`);
      out.push(...blocks(c.children.filter((x) => x !== summary), ctx));
    } else if (tag === "blockquote") {
      const inner = blocks(c.children, ctx).join("\n\n");
      if (inner) out.push(inner.split("\n").map((l) => `> ${l}`).join("\n"));
    } else if (tag === "pre") {
      const t = textOf(c).replace(/\s+$/g, "");
      if (t.trim()) out.push("```\n" + t + "\n```");
    } else if (tag === "hr") {
      out.push("---");
    } else if (tag === "nav") {
      if (/breadcrumb/i.test(c.attrs["aria-label"] ?? "")) {
        const links = find(c, (n) => n.tag === "a").map((a) => clean(inline(a, ctx)).replace(/^\[|\]\([^)]*\)$/g, "")).filter(Boolean);
        const last = clean(find(c, (n) => n.attrs["aria-current"] === "page").map((n) => textOf(n)).join(" "));
        const crumbs = [...links.map((l) => l.replace(/\]\(.*$/, "").replace(/^\[/, "")), last].filter(Boolean);
        if (crumbs.length) out.push(`Breadcrumb: ${crumbs.join(" > ")}`);
      }
    } else if (tag === "summary") {
      // only meaningful inside details
    } else {
      out.push(...blocks(c.children, ctx));
    }
  }
  flush();
  return out;
}

export function htmlToMarkdown(mainNode, url) {
  const ctx = { url, islandNoted: false, h1Seen: false };
  return blocks(mainNode.children, ctx).join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

/* ------------------------------------------------------------------- Page twins */

const attr = (el, name) => el?.attrs?.[name] ?? "";
function jsonLd(root) {
  const out = [];
  for (const s of find(root, (n) => n.tag === "script" && n.attrs.type === "application/ld+json")) {
    try {
      const data = JSON.parse(s.children.map((c) => c.text ?? "").join(""));
      const items = Array.isArray(data) ? data : data["@graph"] ?? [data];
      for (const it of items) out.push(it);
    } catch { /* ignore broken JSON-LD */ }
  }
  return out;
}
const yamlString = (s) => JSON.stringify(String(s ?? ""));

export function pageToTwin(html, fileUrl) {
  const root = parseHtml(html);
  const head = find(root, (n) => n.tag === "head")[0];
  if (!head) return null;
  const metas = find(head, (n) => n.tag === "meta");
  const robots = metas.find((m) => attr(m, "name").toLowerCase() === "robots");
  if (robots && /noindex/i.test(attr(robots, "content"))) return null;
  if (metas.some((m) => attr(m, "http-equiv").toLowerCase() === "refresh")) return null;
  const canonical = find(head, (n) => n.tag === "link" && attr(n, "rel") === "canonical")[0];
  const canonicalUrl = attr(canonical, "href");
  if (!canonicalUrl.startsWith(SITE) || canonicalUrl !== fileUrl) return null;
  const main = find(root, (n) => n.tag === "main")[0];
  if (!main) return null;
  const title = clean(textOf(find(head, (n) => n.tag === "title")[0] ?? { type: "text", text: "" }));
  const description = attr(metas.find((m) => attr(m, "name").toLowerCase() === "description"), "content");
  const htmlEl = find(root, (n) => n.tag === "html")[0];
  const language = attr(htmlEl, "lang") || "en";
  const ld = jsonLd(root);
  const app = ld.find((x) => [].concat(x["@type"]).includes("WebApplication"));
  const how = ld.find((x) => [].concat(x["@type"]).includes("HowTo"));
  const article = ld.find((x) => [].concat(x["@type"]).some((t) => /Article|BlogPosting/.test(t)));
  const type = app ? "tool" : article ? "article" : "page";
  const alternates = find(head, (n) => n.tag === "link" && attr(n, "rel") === "alternate" && attr(n, "hreflang") && attr(n, "hreflang") !== "x-default").map((n) => [attr(n, "hreflang"), attr(n, "href")]);

  let body = htmlToMarkdown(main, canonicalUrl);
  if (!/^# /m.test(body)) body = `# ${title.replace(/\s*\|\s*Pro UPI QR$/, "")}\n\n${body}`;
  const extra = [];
  if (app?.featureList?.length) extra.push("## Features\n\n" + app.featureList.map((f) => `- ${f}`).join("\n"));
  if (how?.step?.length) extra.push(`## ${how.name || "Steps"}\n\n` + how.step.map((s, i) => `${i + 1}. ${s.name ?? s.text ?? ""}`).join("\n"));
  const front = [
    "---",
    `title: ${yamlString(title)}`,
    `description: ${yamlString(description)}`,
    `url: ${yamlString(canonicalUrl)}`,
    `language: ${yamlString(language)}`,
    `type: ${yamlString(type)}`,
    ...(app?.applicationCategory ? [`category: ${yamlString(app.applicationCategory)}`] : []),
    ...(app?.offers?.price === "0" ? [`price: "free"`] : []),
    ...(article?.dateModified || article?.datePublished ? [`modified: ${yamlString(article.dateModified || article.datePublished)}`] : []),
    ...(alternates.length ? ["alternates:", ...alternates.map(([l, h]) => `  ${l}: ${yamlString(h)}`)] : []),
    "---",
  ].join("\n");
  const footer = `Source: ${canonicalUrl} (HTML). This Markdown version is generated from that page. Site: ${SITE}/`;
  const markdown = [front, body, ...extra, footer].join("\n\n") + "\n";
  return { markdown, title, description, url: canonicalUrl, language, type, category: app?.applicationCategory ?? "", name: app?.name ?? "", body };
}

/* ------------------------------------------------------------- Build step (CLI) */

function* htmlFiles(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) { if (name === "_astro" || name === "_vercel") continue; yield* htmlFiles(p); }
    else if (name === "index.html") yield p;
  }
}

const MD_LINK = '<link rel="alternate" type="text/markdown" href="__HREF__" title="Markdown version of this page">';

export function buildTwins(staticDir) {
  const twins = [];
  for (const file of htmlFiles(staticDir)) {
    const rel = relative(staticDir, file).split(sep).slice(0, -1).join("/");
    const fileUrl = `${SITE}/${rel ? rel + "/" : ""}`;
    const html = readFileSync(file, "utf8");
    let twin = null;
    try {
      twin = pageToTwin(html, fileUrl);
    } catch (error) {
      // One odd page must never fail a deploy: skip it (it keeps its HTML) and say so.
      console.warn(`[markdown] skipped ${fileUrl}: ${String(error).slice(0, 120)}`);
      continue;
    }
    if (!twin) continue;
    const mdPath = join(dirname(file), "index.md");
    writeFileSync(mdPath, twin.markdown);
    const href = `${fileUrl}index.md`;
    if (!html.includes('type="text/markdown"')) writeFileSync(file, html.replace("</head>", `${MD_LINK.replace("__HREF__", href)}</head>`));
    twins.push({ ...twin, mdUrl: href });
  }
  return twins;
}

const CATEGORY_TITLES = { FinanceApplication: "Calculators and money tools", BusinessApplication: "Business, billing and documents", UtilitiesApplication: "Utilities and QR tools" };

export function buildLlms(twins, staticDir, templatePath) {
  const english = twins.filter((t) => t.language === "en" || t.language.startsWith("en"));
  const tools = english.filter((t) => t.type === "tool").sort((a, b) => a.title.localeCompare(b.title));
  const articles = english.filter((t) => t.type === "article");
  const groups = new Map();
  for (const t of tools) {
    const key = CATEGORY_TITLES[t.category] ?? "Other tools";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  const line = (t) => `- [${t.title.replace(/\s*\|\s*Pro UPI QR$/, "")}](${t.mdUrl}): ${t.description}`;
  const index = [
    `Generated at build time from the built pages: ${tools.length} tools and ${articles.length} guides in English. Every HTML page also has a Markdown version at the same path plus \`index.md\` (for example ${SITE}/ becomes ${SITE}/index.md). The links below point to the Markdown versions.`,
    ...[...groups.entries()].map(([name, list]) => `### ${name}\n\n${list.map(line).join("\n")}`),
    ...(articles.length ? [`### Guides and articles\n\n${articles.slice(0, 200).map(line).join("\n")}`] : []),
  ].join("\n\n");
  const template = readFileSync(templatePath, "utf8");
  const llms = template.includes("<!-- AUTO:INDEX -->") ? template.replace("<!-- AUTO:INDEX -->", index) : `${template.trimEnd()}\n\n## Tool and guide index\n\n${index}\n`;
  writeFileSync(join(staticDir, "llms.txt"), llms);
  const full = [
    `# Pro UPI QR: full text of every English tool page\n\n> ${SITE}/ . Generated at build time. Each section is one tool page: what it does, the assumptions behind its numbers, worked examples and FAQ. The calculators themselves run in the browser.`,
    ...tools.map((t) => `## ${t.title.replace(/\s*\|\s*Pro UPI QR$/, "")}\n\nURL: ${t.url}\nMarkdown: ${t.mdUrl}\n\n${t.body.replace(/^# .*\n+/, "")}`),
  ].join("\n\n---\n\n") + "\n";
  writeFileSync(join(staticDir, "llms-full.txt"), full);
  return { tools: tools.length, articles: articles.length, fullBytes: Buffer.byteLength(full) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const staticDir = process.argv[2] ?? join(ROOT, ".vercel", "output", "static");
  if (!existsSync(staticDir)) { console.error(`[markdown] ${staticDir} does not exist: build first`); process.exit(1); }
  const started = Date.now();
  const twins = buildTwins(staticDir);
  const llms = buildLlms(twins, staticDir, join(ROOT, "public", "llms.txt"));
  console.log(`[markdown] ${twins.length} Markdown twins; llms.txt lists ${llms.tools} tools and ${llms.articles} guides; llms-full.txt ${Math.round(llms.fullBytes / 1024)} KB (${Date.now() - started} ms)`);
}
