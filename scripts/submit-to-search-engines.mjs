#!/usr/bin/env node
/**
 * Bulk-notify search engines after deploy — no per-URL copy-paste in GSC.
 *
 * Google: no public bulk "Request indexing" API for normal websites.
 *         Submit/resubmit sitemap.xml once in Search Console (see below).
 * Bing:    IndexNow accepts all sitemap URLs in one POST.
 *
 * Usage:
 *   npm run submit:sitemap
 *   SITE_URL=https://www.proupiqr.in npm run submit:sitemap
 */

const SITE_URL = (process.env.SITE_URL ?? "https://www.proupiqr.in").replace(/\/$/, "");
const SITEMAP_URL = `${SITE_URL}/sitemap.xml`;
const INDEXNOW_KEY = process.env.INDEXNOW_KEY ?? "7e4c2b9a8f1d4c3ab5d6e7f80a1c2b3d";

function parseSitemapXml(xml) {
  const matches = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)];
  const urls = matches.map((match) => match[1].trim());
  if (urls.length === 0) {
    throw new Error("Sitemap contains no URLs.");
  }
  return urls;
}

async function fetchSitemapUrls() {
  try {
    const response = await fetch(SITEMAP_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch remote sitemap (${response.status}): ${SITEMAP_URL}`);
    }
    const xml = await response.text();
    return parseSitemapXml(xml);
  } catch (error) {
    try {
      const fs = await import("fs/promises");
      const path = await import("path");
      const localPath = path.join(process.cwd(), "dist", "sitemap.xml");
      console.log(`⚠️  Could not fetch remote sitemap. Trying local file: ${localPath}`);
      const xml = await fs.readFile(localPath, "utf-8");
      return parseSitemapXml(xml);
    } catch (localError) {
      throw new Error(`Failed to fetch sitemap: ${error.message}. Local fallback also failed: ${localError.message}`);
    }
  }
}

async function submitIndexNow(urls) {
  const keyLocation = `${SITE_URL}/${INDEXNOW_KEY}.txt`;
  const body = {
    host: new URL(SITE_URL).host,
    key: INDEXNOW_KEY,
    keyLocation,
    urlList: urls,
  };

  const endpoints = [
    "https://api.indexnow.org/indexnow",
    "https://www.bing.com/indexnow",
  ];

  const results = await Promise.allSettled(
    endpoints.map(async (endpoint) => {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(body),
      });

      return { endpoint, status: response.status, ok: response.ok };
    })
  );

  return results;
}

async function pingBingSitemap() {
  const endpoint = `https://www.bing.com/ping?sitemap=${encodeURIComponent(SITEMAP_URL)}`;
  const response = await fetch(endpoint);
  return { endpoint, status: response.status, ok: response.ok };
}

async function main() {
  console.log(`Fetching sitemap: ${SITEMAP_URL}`);
  const urls = await fetchSitemapUrls();
  console.log(`Found ${urls.length} URLs.`);

  console.log("\n[1/2] IndexNow bulk submit (Bing, Yandex, etc.)...");
  const indexNowResults = await submitIndexNow(urls);
  for (const result of indexNowResults) {
    if (result.status === "fulfilled") {
      const { endpoint, status, ok } = result.value;
      console.log(`  ${ok ? "OK" : "WARN"} ${endpoint} → HTTP ${status}`);
    } else {
      console.log(`  FAIL ${result.reason}`);
    }
  }

  console.log("\n[2/2] Bing sitemap ping...");
  const bing = await pingBingSitemap();
  console.log(`  ${bing.ok ? "OK" : "WARN"} ${bing.endpoint} → HTTP ${bing.status}`);

  console.log(`
Google (bulk, one-time setup — covers all ${urls.length} URLs):
  1. Open https://search.google.com/search-console
  2. Select property: ${SITE_URL}
  3. Go to Sitemaps → enter "sitemap.xml" → Submit
  4. After each deploy, click the same sitemap → Resubmit (one click, not per URL)

Optional automation for Google (Search Console API):
  Enable the API, create a service account, add it as owner in GSC,
  then call sitemaps.submit for site "${SITE_URL}/" and feedpath "sitemap.xml".

IndexNow key file required at:
  ${SITE_URL}/${INDEXNOW_KEY}.txt
  Content: ${INDEXNOW_KEY}
`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});