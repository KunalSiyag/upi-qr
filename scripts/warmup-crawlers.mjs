#!/usr/bin/env node
/**
 * Automated Social Crawler Warmup Script
 * Fetches all pages from the site's sitemap and performs HTTP requests
 * mimicking major search and social crawler bots to warm up cache and index.
 * 
 * Usage:
 *   node scripts/warmup-crawlers.mjs
 *   SITE_URL=https://www.proupiqr.in node scripts/warmup-crawlers.mjs
 */

const SITE_URL = (process.env.SITE_URL ?? "https://www.proupiqr.in").replace(/\/$/, "");
const SITEMAP_URL = `${SITE_URL}/sitemap.xml`;
const CONCURRENCY_LIMIT = 8; // Number of parallel requests

const CRAWLERS = [
  { name: "Googlebot", userAgent: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" },
  { name: "Twitterbot", userAgent: "Twitterbot/1.0" },
  { name: "FacebookExternalHit", userAgent: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_aged_via_webcrawlers.html)" },
  { name: "TelegramBot", userAgent: "TelegramBot (like TwitterBot)" },
  { name: "WhatsApp", userAgent: "WhatsApp/2.20.108 A" }
];

async function fetchSitemapUrls() {
  const response = await fetch(SITEMAP_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch sitemap (${response.status}): ${SITEMAP_URL}`);
  }

  const xml = await response.text();
  const matches = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)];
  const urls = matches.map((match) => match[1].trim());

  if (urls.length === 0) {
    throw new Error("Sitemap contains no URLs.");
  }

  return urls;
}

// Concurrency helper
async function runWithLimit(tasks, limit, fn) {
  const results = [];
  const executing = new Set();
  
  for (const task of tasks) {
    const p = Promise.resolve().then(() => fn(task));
    results.push(p);
    executing.add(p);
    
    const clean = () => executing.delete(p);
    p.then(clean, clean);
    
    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }
  
  return Promise.all(results);
}

async function warmupUrlForCrawler(task) {
  const { url, crawler } = task;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout
    
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": crawler.userAgent,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    return {
      url,
      crawler: crawler.name,
      status: response.status,
      ok: response.ok
    };
  } catch (error) {
    return {
      url,
      crawler: crawler.name,
      status: 0,
      ok: false,
      error: error.message
    };
  }
}

async function main() {
  console.log(`⚡ Initializing Crawler Warmup for: ${SITE_URL}`);
  console.log(`   Fetching sitemap from: ${SITEMAP_URL}`);
  
  let urls = [];
  try {
    urls = await fetchSitemapUrls();
  } catch (error) {
    console.error(`❌ Error fetching sitemap:`, error.message);
    process.exit(1);
  }
  
  console.log(`   Found ${urls.length} URLs in sitemap.`);
  console.log(`   Warmup will execute ${urls.length} pages x ${CRAWLERS.length} crawlers = ${urls.length * CRAWLERS.length} HTTP requests.\n`);

  // Build task list
  const tasks = [];
  for (const url of urls) {
    for (const crawler of CRAWLERS) {
      tasks.push({ url, crawler });
    }
  }

  let completed = 0;
  const total = tasks.length;
  let successCount = 0;
  let failCount = 0;

  const results = await runWithLimit(tasks, CONCURRENCY_LIMIT, async (task) => {
    const res = await warmupUrlForCrawler(task);
    completed++;
    
    if (res.ok) {
      successCount++;
    } else {
      failCount++;
    }

    // Progress log in chunks to not clutter the console too much, or simple status
    if (completed % 25 === 0 || completed === total) {
      const percentage = Math.round((completed / total) * 100);
      console.log(`   Progress: ${completed}/${total} requests sent (${percentage}%) | Success: ${successCount} | Failed: ${failCount}`);
    }
    
    return res;
  });

  const failedRequests = results.filter(r => !r.ok);
  if (failedRequests.length > 0) {
    console.log(`\n⚠️  Failed requests preview (showing up to 10 failures):`);
    failedRequests.slice(0, 10).forEach(f => {
      console.log(`   - [${f.crawler}] ${f.url} → Status: ${f.status} | Error: ${f.error ?? "HTTP Failure"}`);
    });
  }

  console.log(`\n⚡ Warmup completed!`);
  console.log(`   Total requests: ${total}`);
  console.log(`   Successes (200 OK): ${successCount}`);
  console.log(`   Failures: ${failCount}`);
  if (failCount === 0) {
    console.log(`   🎉 100% of pages returned Status 200 OK! Crawler caches updated successfully.`);
  } else {
    console.log(`   ⚠️  Some requests failed. Check connection or verify if local server is running/accessible.`);
  }
}

main().catch((err) => {
  console.error("Warmup script error:", err);
  process.exit(1);
});
