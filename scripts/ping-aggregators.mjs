#!/usr/bin/env node
/**
 * Automated RSS Directory Pinger
 * Sends XML-RPC pings to Ping-O-Matic only.
 * Do not ping Medium — the Medium account is banned for duplicate syndication.
 * 
 * Usage:
 *   node scripts/ping-aggregators.mjs
 *   SITE_URL=https://www.proupiqr.in node scripts/ping-aggregators.mjs
 */

const SITE_URL = (process.env.SITE_URL ?? "https://www.proupiqr.in").replace(/\/$/, "");
const FEED_URL = `${SITE_URL}/rss.xml`;
const BLOG_URL = `${SITE_URL}/blog/`;
const SITE_TITLE = "Pro UPI QR — Guides & Tutorials";

const targets = [
  {
    name: "Ping-O-Matic (Central Aggregator)",
    endpoint: "http://rpc.pingomatic.com/",
    method: "weblogUpdates.ping",
  }
];

function buildXmlRpcPayload(methodName, title, url, feedUrl) {
  if (methodName === "weblogUpdates.extendedPing") {
    return `<?xml version="1.0" encoding="UTF-8"?>
<methodCall>
  <methodName>weblogUpdates.extendedPing</methodName>
  <params>
    <param><value>${escapeXml(title)}</value></param>
    <param><value>${escapeXml(url)}</value></param>
    <param><value>${escapeXml(feedUrl)}</value></param>
    <param><value>${escapeXml(feedUrl)}</value></param>
  </params>
</methodCall>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<methodCall>
  <methodName>${methodName}</methodName>
  <params>
    <param><value>${escapeXml(title)}</value></param>
    <param><value>${escapeXml(url)}</value></param>
  </params>
</methodCall>`;
}

function escapeXml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function pingAggregator(target) {
  const payload = buildXmlRpcPayload(target.method, SITE_TITLE, BLOG_URL, FEED_URL);
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
    
    const response = await fetch(target.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ProUPIQRPinger/1.0",
      },
      body: payload,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const responseText = await response.text();
    const hasFault = responseText.includes("<fault>") || responseText.includes("faultCode");

    if (response.ok && !hasFault) {
      return { name: target.name, ok: true, status: response.status, details: "Success" };
    } else {
      let explanation = "";
      if (target.name === "FeedBurner") {
        explanation = " (Note: Requires feed to be registered on FeedBurner)";
      } else if (target.name === "Blo.gs") {
        explanation = " (Note: Often rate-limits or returns 403 for non-production IPs)";
      } else if (target.name === "Weblogs") {
        explanation = " (Note: Legacy service, endpoint might be offline)";
      }
      return { 
        name: target.name, 
        ok: false, 
        status: response.status, 
        details: (hasFault ? "XML-RPC Fault returned by server" : `HTTP Error: ${response.statusText}`) + explanation 
      };
    }
  } catch (error) {
    let explanation = "";
    if (target.name === "Weblogs") {
      explanation = " (Note: Service is legacy and often offline)";
    }
    return { name: target.name, ok: false, status: 0, details: error.message + explanation };
  }
}

async function main() {
  console.log(`📡 Initializing RSS Directory Pings...`);
  console.log(`   Site Title: ${SITE_TITLE}`);
  console.log(`   Blog URL:   ${BLOG_URL}`);
  console.log(`   Feed URL:   ${FEED_URL}\n`);

  const results = await Promise.all(targets.map(pingAggregator));

  let successCount = 0;
  console.log("-----------------------------------------------------------------");
  for (const res of results) {
    if (res.ok) {
      console.log(`  ✅ ${res.name.padEnd(15)} | Status: OK (HTTP ${res.status}) | ${res.details}`);
      successCount++;
    } else {
      console.log(`  ❌ ${res.name.padEnd(15)} | Status: FAIL (HTTP ${res.status}) | ${res.details}`);
    }
  }
  console.log("-----------------------------------------------------------------");
  console.log(`📡 Broadcast completed: ${successCount}/${targets.length} targets succeeded.\n`);
}

main().catch((err) => {
  console.error("Pinger error:", err);
  process.exit(1);
});
