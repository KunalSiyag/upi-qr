/**
 * Satellite syndication for unique, unpublished articles only.
 *
 * Never republishes a post that already exists on Blogger or WordPress.
 * Checks: local ledger, paginated Blogger list, Blogger search, WordPress search.
 * Sources: curated satellite articles + unpublished posts from src/content/blog.
 *
 * Usage:
 *   node scripts/syndicate-satellites.mjs
 *   node scripts/syndicate-satellites.mjs --dry-run
 *   node scripts/syndicate-satellites.mjs --limit=1
 *   SYNDICATE_LIMIT=1 node scripts/syndicate-satellites.mjs
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STATE_PATH = join(ROOT, ".syndication-state.json");
const BLOG_DIR = join(ROOT, "src", "content", "blog");
const SITE_URL = "https://www.proupiqr.in";

// ============================================================================
// CONFIGURATION (Set via Environment Variables or direct values)
// ============================================================================
const WORDPRESS_CONFIG = {
  enabled: String(process.env.WP_ENABLED || "").toLowerCase() === "true",
  siteUrl: (process.env.WP_SITE_URL || "").trim(), // e.g. https://mytechblog.com
  username: (process.env.WP_USERNAME || "").trim(),
  applicationPassword: (process.env.WP_APP_PASSWORD || "").trim()
};

const BLOGGER_CONFIG = {
  enabled: String(process.env.BLOGGER_ENABLED || "").toLowerCase() === "true",
  blogId: (process.env.BLOGGER_BLOG_ID || "").trim(),
  apiKey: (process.env.BLOGGER_API_KEY || "").trim(),
  clientId: (process.env.BLOGGER_CLIENT_ID || "").trim(),
  clientSecret: (process.env.BLOGGER_CLIENT_SECRET || "").trim(),
  refreshToken: (process.env.BLOGGER_REFRESH_TOKEN || "").trim(),
  accessToken: (process.env.BLOGGER_ACCESS_TOKEN || "").trim()
};

async function getBloggerAccessToken() {
  if (BLOGGER_CONFIG.clientId && BLOGGER_CONFIG.clientSecret && BLOGGER_CONFIG.refreshToken) {
    try {
      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: BLOGGER_CONFIG.clientId,
          client_secret: BLOGGER_CONFIG.clientSecret,
          refresh_token: BLOGGER_CONFIG.refreshToken,
          grant_type: "refresh_token"
        })
      });

      if (res.ok) {
        const data = await res.json();
        return data.access_token;
      } else {
        const errText = await res.text();
        console.error(`[Blogger] Dynamic token refresh failed: ${errText}`);
      }
    } catch (e) {
      console.error("[Blogger] Dynamic token refresh error:", e);
    }
  }
  return BLOGGER_CONFIG.accessToken;
}

// Already live on Blogger — never queue these again. Medium is banned; do not
// add a Medium publisher. New unique posts come from unpublished src/content/blog.
const NEVER_SYNDICATE_SLUGS = new Set([
  "zero-mdr-merchant-upi-qr-2026",
  "a4-bulk-upi-qr-sticker-sheet"
]);

const NEVER_SYNDICATE_TITLES = [
  "the definitive 2026 manual for zero mdr merchant upi qr code implementation in india",
  "a4 bulk upi qr code sticker sheet printing manual for multi counter retail restaurants"
];

const SATELLITE_ARTICLES = [];

function isBlockedArticle(article) {
  const slug = articleSlug(article);
  if (NEVER_SYNDICATE_SLUGS.has(slug)) return true;
  const title = normalizeTitle(article.title);
  return NEVER_SYNDICATE_TITLES.some((blocked) => title === blocked || title.includes(blocked) || blocked.includes(title));
}

function parseArgs(argv) {

  const args = { dryRun: false, limit: Number(process.env.SYNDICATE_LIMIT || 1) };
  for (const arg of argv.slice(2)) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg.startsWith("--limit=")) args.limit = Math.max(0, Number(arg.slice(8)) || 0);
  }
  if (!Number.isFinite(args.limit) || args.limit < 1) args.limit = 1;
  return args;
}

function normalizeTitle(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function articleSlug(article) {
  if (article.slug) return String(article.slug).trim();
  return normalizeTitle(article.title).replace(/\s+/g, "-").slice(0, 80) || "untitled";
}

function loadState() {
  if (!existsSync(STATE_PATH)) return { posts: {} };
  try {
    const parsed = JSON.parse(readFileSync(STATE_PATH, "utf8"));
    return parsed && typeof parsed === "object" ? { posts: parsed.posts || {} } : { posts: {} };
  } catch {
    return { posts: {} };
  }
}

function saveState(state) {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { data: {}, body: raw };
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    data[key] = value;
  }
  return { data, body: match[2] };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function markdownToHtml(markdown) {
  const lines = String(markdown).replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let inList = false;
  let inCode = false;
  let codeBuffer = [];

  const flushList = () => {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  };

  const inline = (text) =>
    escapeHtml(text)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\[([^\]]+)\]\((https?:[^)]+|\/[^)]+)\)/g, (_, label, href) => {
        const abs = href.startsWith("http") ? href : `${SITE_URL}${href}`;
        return `<a href="${abs}" target="_blank" rel="noopener">${label}</a>`;
      });

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (inCode) {
        html.push(`<pre><code>${escapeHtml(codeBuffer.join("\n"))}</code></pre>`);
        codeBuffer = [];
        inCode = false;
      } else {
        flushList();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuffer.push(line);
      continue;
    }

    if (!line.trim()) {
      flushList();
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushList();
      const level = heading[1].length + 1;
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${inline(line.replace(/^[-*]\s+/, ""))}</li>`);
      continue;
    }

    flushList();
    html.push(`<p>${inline(line)}</p>`);
  }

  flushList();
  if (inCode) html.push(`<pre><code>${escapeHtml(codeBuffer.join("\n"))}</code></pre>`);
  return html.join("\n");
}

function loadBlogArticles() {
  if (!existsSync(BLOG_DIR)) return [];
  return readdirSync(BLOG_DIR)
    .filter((file) => file.endsWith(".md"))
    .map((file) => {
      const slug = file.replace(/\.mdx?$/, "");
      const raw = readFileSync(join(BLOG_DIR, file), "utf8");
      const { data, body } = parseFrontmatter(raw);
      const title = data.title || slug;
      const summary = data.description || title;
      const canonical = `${SITE_URL}/blog/${slug}/`;
      const html = markdownToHtml(body);
      return {
        slug,
        title,
        summary,
        sourceUrl: canonical,
        content: `
      <article style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.8; color: #0f172a; max-width: 860px; margin: 0 auto; padding: 12px;">
        <p><em>Originally published on <a href="${canonical}" target="_blank" rel="noopener">Pro UPI QR</a>.</em></p>
        ${html}
      </article>`
      };
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

function collectArticles() {
  const seen = new Set();
  const articles = [];
  for (const article of [...SATELLITE_ARTICLES, ...loadBlogArticles()]) {
    const slug = articleSlug(article);
    if (seen.has(slug) || NEVER_SYNDICATE_SLUGS.has(slug) || isBlockedArticle({ ...article, slug })) continue;
    seen.add(slug);
    articles.push({ ...article, slug });
  }
  return articles;
}

function buildPublishableContent(article) {
  const canonical = article.sourceUrl || `${SITE_URL}/`;
  return `${article.content}
    <section style="margin-top: 36px; padding: 24px; border: 1px solid #d1fae5; border-radius: 16px; background: #f0fdf4;">
      <h2 style="margin-top: 0;">Practical checklist before you share or print a payment QR</h2>
      <p>${article.summary}</p>
      <ol>
        <li><strong>Verify the beneficiary:</strong> scan the finished QR with a separate UPI app and confirm the displayed payee name and UPI ID before placing it in front of customers.</li>
        <li><strong>Choose the right amount setting:</strong> use an open-amount QR for variable bills; use a fixed amount only for a genuinely fixed price such as an entry fee or a menu item.</li>
        <li><strong>Design for the actual scan distance:</strong> retain a clear white border around the code, avoid placing it on reflective material, and test it under the lighting used at the counter.</li>
        <li><strong>Keep a replacement process:</strong> staff should know where the source file is stored and who can verify a replacement QR, so a damaged or tampered sticker is not left in use.</li>
      </ol>
      <p>Read the original guide and use the live browser-based tool at <a href="${canonical}" rel="noopener">${canonical}</a>. This guide is educational; banks and UPI apps remain responsible for payment authorization and transaction status.</p>
    </section>`;
}

// ============================================================================
// 🟢 WORDPRESS REST API PUBLISHING AUTOMATION
// ============================================================================
function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function publishToWordPressXmlRpc(article) {
  const baseUrl = WORDPRESS_CONFIG.siteUrl.replace(/\/$/, "");
  const xmlrpcEndpoint = `${baseUrl}/xmlrpc.php`;

  const xmlPayload = `<?xml version="1.0"?>
<methodCall>
  <methodName>wp.newPost</methodName>
  <params>
    <param><value><int>1</int></value></param>
    <param><value><string>${escapeXml(WORDPRESS_CONFIG.username)}</string></value></param>
    <param><value><string>${escapeXml(WORDPRESS_CONFIG.applicationPassword)}</string></value></param>
    <param>
      <value>
        <struct>
          <member><name>post_type</name><value><string>post</string></value></member>
          <member><name>post_status</name><value><string>publish</string></value></member>
          <member><name>post_title</name><value><string>${escapeXml(article.title)}</string></value></member>
          <member><name>post_content</name><value><string>${escapeXml(buildPublishableContent(article))}</string></value></member>
          <member><name>post_excerpt</name><value><string>${escapeXml(article.summary)}</string></value></member>
        </struct>
      </value>
    </param>
  </params>
</methodCall>`;

  const res = await fetch(xmlrpcEndpoint, {
    method: "POST",
    headers: { "Content-Type": "text/xml" },
    body: xmlPayload
  });

  if (res.ok) {
    const text = await res.text();
    if (text.includes("<fault>") || text.includes("<error>")) {
      throw new Error(`XML-RPC fault: ${text.slice(0, 150)}`);
    }
    console.log(`[WordPress XML-RPC] ✅ Post Published Successfully!`);
    return true;
  }
  throw new Error(`HTTP ${res.status}`);
}

function wordpressAuthHeader() {
  return "Basic " + Buffer.from(`${WORDPRESS_CONFIG.username}:${WORDPRESS_CONFIG.applicationPassword}`).toString("base64");
}

async function wordpressPostAlreadyExists(article) {
  const baseUrl = WORDPRESS_CONFIG.siteUrl.replace(/\/$/, "");
  const endpoint = new URL(`${baseUrl}/wp-json/wp/v2/posts`);
  endpoint.searchParams.set("search", article.title);
  endpoint.searchParams.set("per_page", "20");
  endpoint.searchParams.set("status", "publish");

  const res = await fetch(endpoint, { headers: { Authorization: wordpressAuthHeader() } });
  if (!res.ok) {
    throw new Error(`Could not check existing WordPress posts (HTTP ${res.status})`);
  }

  const items = await res.json();
  const wanted = normalizeTitle(article.title);
  return (Array.isArray(items) ? items : []).some((post) => {
    const existing = typeof post.title === "string" ? post.title : post.title?.rendered;
    return normalizeTitle(existing) === wanted;
  });
}

async function publishToWordPress(article, options) {
  const wpUrl = WORDPRESS_CONFIG.siteUrl;
  if (isBlockedArticle(article)) {
    recordPublish(options.state, article.slug, "wordpress", { id: "blocked-live", url: "", publishedAt: new Date().toISOString() });
    console.log(`[WordPress] Skipped live/blocked post: "${article.title}".`);
    return { duplicate: true };
  }
  if (!WORDPRESS_CONFIG.enabled || !wpUrl || !wpUrl.startsWith("http")) {
    console.log("[WordPress] Syndication skipped (WP_ENABLED is false or WP_SITE_URL is not a valid HTTP URL).");
    return { skipped: true };
  }

  if (options.state.posts[article.slug]?.wordpress?.id) {
    console.log(`[WordPress] Skipped duplicate: "${article.title}" already in local ledger.`);
    return { duplicate: true };
  }

  try {
    if (await wordpressPostAlreadyExists(article)) {
      recordPublish(options.state, article.slug, "wordpress", { id: "existing", url: "", publishedAt: new Date().toISOString() });
      console.log(`[WordPress] Skipped duplicate: "${article.title}" already exists.`);
      return { duplicate: true };
    }
  } catch (error) {
    console.error(`[WordPress] Duplicate check failed; refusing to publish. ${error.message}`);
    return { error: error.message };
  }

  if (options.dryRun) {
    console.log(`[WordPress] Dry run: would publish "${article.title}".`);
    return { dryRun: true };
  }

  console.log(`[WordPress] Publishing unpublished article: "${article.title}" to ${WORDPRESS_CONFIG.siteUrl}...`);

  try {
    const xmlrpcSuccess = await publishToWordPressXmlRpc(article);
    if (xmlrpcSuccess) {
      recordPublish(options.state, article.slug, "wordpress", { id: "xmlrpc", url: "", publishedAt: new Date().toISOString() });
      return { published: true };
    }
  } catch (xmlrpcErr) {
    console.log(`[WordPress XML-RPC] XML-RPC skipped/failed (${xmlrpcErr.message}). Trying REST API fallback...`);
  }

  const endpoint = `${WORDPRESS_CONFIG.siteUrl.replace(/\/$/, "")}/wp-json/wp/v2/posts`;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: wordpressAuthHeader()
      },
      body: JSON.stringify({
        title: article.title,
        content: buildPublishableContent(article),
        status: "publish",
        excerpt: article.summary,
        slug: `proupiqr-${article.slug}`
      })
    });

    if (res.ok) {
      const data = await res.json();
      recordPublish(options.state, article.slug, "wordpress", {
        id: String(data.id || ""),
        url: data.link || "",
        publishedAt: new Date().toISOString()
      });
      console.log(`[WordPress REST API] ✅ Post Published Successfully! URL: ${data.link}`);
      return { published: true, url: data.link };
    }

    const err = await res.text();
    console.error(`[WordPress REST API] ❌ Failed to publish. Status: ${res.status}. Error: ${err}`);
    return { error: err };
  } catch (error) {
    console.error(`[WordPress REST API] ❌ Request error:`, error);
    return { error: String(error) };
  }
}

// ============================================================================
// 🟠 BLOGGER REST API PUBLISHING AUTOMATION
// ============================================================================
function bloggerHeaders(accessToken) {
  const headers = { "Content-Type": "application/json" };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return headers;
}

function bloggerPostsUrl(path = "") {
  const url = `https://www.googleapis.com/blogger/v3/blogs/${BLOGGER_CONFIG.blogId}/posts${path}`;
  return BLOGGER_CONFIG.apiKey ? `${url}${url.includes("?") ? "&" : "?"}key=${BLOGGER_CONFIG.apiKey}` : url;
}

function titlesMatch(left, right) {
  return normalizeTitle(left) === normalizeTitle(right);
}

async function listAllBloggerPosts(headers) {
  const posts = [];
  let pageToken = "";
  let includeStatus = true;

  do {
    const listUrl = new URL(bloggerPostsUrl("/"));
    listUrl.searchParams.set("fetchBodies", "false");
    listUrl.searchParams.set("maxResults", "50");
    if (includeStatus) listUrl.searchParams.set("status", "live");
    if (pageToken) listUrl.searchParams.set("pageToken", pageToken);

    const res = await fetch(listUrl, { headers });
    if (!res.ok && includeStatus && !pageToken) {
      includeStatus = false;
      continue;
    }
    if (!res.ok) {
      throw new Error(`Could not list existing Blogger posts (HTTP ${res.status})`);
    }

    const data = await res.json();
    posts.push(...(data.items || []));
    pageToken = data.nextPageToken || "";
  } while (pageToken);

  return posts;
}

async function bloggerPostAlreadyExists(article, headers) {
  const existing = await listAllBloggerPosts(headers);
  if (existing.some((post) => titlesMatch(post.title, article.title))) return true;
  if (existing.some((post) => (post.labels || []).includes(article.slug))) return true;

  const searchUrl = new URL(bloggerPostsUrl("/search"));
  searchUrl.searchParams.set("q", `"${article.title}"`);
  const searchRes = await fetch(searchUrl, { headers });
  if (searchRes.ok) {
    const searchData = await searchRes.json();
    if ((searchData.items || []).some((post) => titlesMatch(post.title, article.title))) return true;
  }

  return false;
}

async function publishToBlogger(article, options) {
  if (!BLOGGER_CONFIG.enabled || !BLOGGER_CONFIG.blogId) {
    console.log("[Blogger] Syndication skipped (BLOGGER_ENABLED is false or not configured).");
    return { skipped: true };
  }

  if (isBlockedArticle(article)) {
    recordPublish(options.state, article.slug, "blogger", { id: "blocked-live", url: "", publishedAt: new Date().toISOString() });
    console.log(`[Blogger] Skipped live/blocked post: "${article.title}".`);
    return { duplicate: true };
  }

  if (options.state.posts[article.slug]?.blogger?.id) {
    console.log(`[Blogger] Skipped duplicate: "${article.title}" already in local ledger.`);
    return { duplicate: true };
  }

  const accessToken = await getBloggerAccessToken();
  const headers = bloggerHeaders(accessToken);

  try {
    if (await bloggerPostAlreadyExists(article, headers)) {
      recordPublish(options.state, article.slug, "blogger", { id: "existing", url: "", publishedAt: new Date().toISOString() });
      console.log(`[Blogger] Skipped duplicate: "${article.title}" already exists.`);
      return { duplicate: true };
    }
  } catch (error) {
    console.error(`[Blogger] Duplicate check failed; refusing to publish. ${error.message}`);
    return { error: error.message };
  }

  if (options.dryRun) {
    console.log(`[Blogger] Dry run: would publish "${article.title}".`);
    return { dryRun: true };
  }

  console.log(`[Blogger] Publishing unpublished post: "${article.title}" to Blog ID: ${BLOGGER_CONFIG.blogId}...`);

  try {
    const res = await fetch(bloggerPostsUrl("/"), {
      method: "POST",
      headers,
      body: JSON.stringify({
        kind: "blogger#post",
        title: article.title,
        content: buildPublishableContent(article),
        labels: ["proupiqr", article.slug]
      })
    });

    if (res.ok) {
      const data = await res.json();
      recordPublish(options.state, article.slug, "blogger", {
        id: String(data.id || ""),
        url: data.url || "",
        publishedAt: new Date().toISOString()
      });
      console.log(`[Blogger] ✅ Post Published Successfully! URL: ${data.url}`);
      return { published: true, url: data.url };
    }

    const err = await res.text();
    console.error(`[Blogger] ❌ Failed to publish. Status: ${res.status}. Error: ${err}`);
    return { error: err };
  } catch (error) {
    console.error(`[Blogger] ❌ Request error:`, error);
    return { error: String(error) };
  }
}

function recordPublish(state, slug, platform, payload) {
  if (!state.posts[slug]) state.posts[slug] = {};
  state.posts[slug][platform] = payload;
  saveState(state);
}

function isFullyPublished(article, state) {
  if (isBlockedArticle(article)) return true;
  const entry = state.posts[article.slug] || {};
  const wpNeeded = WORDPRESS_CONFIG.enabled;
  const bloggerNeeded = BLOGGER_CONFIG.enabled;
  const wpDone = Boolean(entry.wordpress?.id);
  const bloggerDone = Boolean(entry.blogger?.id);
  if (wpNeeded && bloggerNeeded) return wpDone && bloggerDone;
  if (bloggerNeeded) return bloggerDone;
  if (wpNeeded) return wpDone;
  return wpDone || bloggerDone;
}

// ============================================================================
// MAIN EXECUTION ROUTINE
// ============================================================================
async function main() {
  if (String(process.env.MEDIUM_ENABLED || "").toLowerCase() === "true") {
    console.error("[Medium] Disabled. Medium banned this project — do not syndicate there.");
  }

  const args = parseArgs(process.argv);
  if (process.env.CI && String(process.env.SYNDICATE_ON_CI || "").toLowerCase() !== "true") {
    console.log("[syndicate] CI run: publishing is off. Set SYNDICATE_ON_CI=true to override.");
    args.dryRun = true;
  }

  const state = loadState();
  const articles = collectArticles();
  const pending = articles.filter((article) => !isFullyPublished(article, state));

  console.log("==========================================================");
  console.log("🌐 Satellite syndication (unique unpublished posts only)");
  console.log("==========================================================");
  console.log(`Catalog: ${articles.length} unique articles`);
  console.log(`Already recorded: ${articles.length - pending.length}`);
  console.log(`Pending: ${pending.length}`);
  console.log(`Publishing at most ${args.limit} new article(s)${args.dryRun ? " (dry run)" : ""}`);

  const queue = pending.slice(0, args.limit);
  if (queue.length === 0) {
    console.log("\nNothing new to publish. Existing titles will not be uploaded again.");
    return;
  }

  for (const article of queue) {
    console.log(`\n--- ${article.slug} ---`);
    await publishToWordPress(article, { state, dryRun: args.dryRun });
    await publishToBlogger(article, { state, dryRun: args.dryRun });
  }

  console.log("\n✨ Satellite syndication run complete. Ledger: .syndication-state.json");
}

main().catch((err) => {
  console.error("Fatal error during syndication:", err);
  process.exit(1);
});
