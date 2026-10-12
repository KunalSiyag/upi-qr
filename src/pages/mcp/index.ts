import type { APIRoute } from "astro";
import { handleMcpHttp } from "../../lib/mcp/protocol.ts";
import { proUpiQrServer, SITE, type CatalogEntry } from "../../lib/mcp/tools.ts";
import { TOPIC_HUBS } from "../../data/topicHubs";
import { requestFingerprint } from "../../lib/apiSecurity";
import { consumeRateLimit } from "../../lib/rateLimit";
import { recordMetric } from "../../lib/metrics";
import { rateLimitsAvailable } from "../../lib/workspace/kvCloudStore";

export const prerender = false;

/**
 * The Pro UPI QR MCP server (Claude connector): POST https://www.proupiqr.in/mcp/.
 * Read-only tools, no sign-in, nothing stored. Protocol handling lives in
 * src/lib/mcp/protocol.ts and the tools in src/lib/mcp/tools.ts.
 */

/** Every free tool from the topic hubs once, then the hubs themselves, for find_merchant_tools. */
function buildCatalog(): CatalogEntry[] {
  const seen = new Set<string>();
  const entries: CatalogEntry[] = [];
  for (const hub of TOPIC_HUBS) {
    for (const group of hub.groups) {
      for (const tool of group.tools) {
        if (!tool.href.startsWith("/") || seen.has(tool.href)) continue;
        seen.add(tool.href);
        entries.push({ name: tool.name, href: tool.href, description: tool.description, topic: hub.shortName });
      }
    }
  }
  for (const hub of TOPIC_HUBS) {
    if (seen.has(hub.path)) continue;
    seen.add(hub.path);
    entries.push({ name: hub.shortName, href: hub.path, description: hub.blurb, topic: hub.shortName });
  }
  return entries;
}

const server = proUpiQrServer({ catalog: buildCatalog() });

/** Server-side clients (Claude) send no Origin; browsers may call only from these. */
const ALLOWED_ORIGINS = [SITE, "https://claude.ai", "https://claude.com"];

/** Tool calls per minute from one network address. Claude calls from shared Anthropic addresses, so this only stops runaway loops. */
const CALLS_PER_MINUTE = 300;

async function beforeToolCall(request: Request): Promise<string | null> {
  try {
    if (rateLimitsAvailable()) {
      const rate = await consumeRateLimit("mcp-call", requestFingerprint(request), CALLS_PER_MINUTE, 60);
      if (!rate.allowed) return `Too many requests from this network. Try again in ${rate.retryAfter} seconds.`;
    }
    await recordMetric("mcp_tool_call");
  } catch {
    // Limits and counts are best-effort; a KV outage must not take the free tools down.
  }
  return null;
}

/** Shown when a person opens the endpoint in a browser. */
const BROWSER_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pro UPI QR MCP server</title><meta name="robots" content="noindex">
<style>body{margin:0;font:16px/1.6 system-ui,sans-serif;background:#fff;color:#3d4541}main{max-width:36rem;margin:12vh auto;padding:0 16px}h1{color:#0d1f17;font-size:1.6rem;line-height:1.2}code{background:#eef1ec;padding:2px 6px;border-radius:6px}a{color:#113b2c;font-weight:600}</style></head>
<body><main><h1>This is the Pro UPI QR MCP server</h1>
<p>It's working. AI apps call it to make UPI payment links and QR codes, explain UPI errors and calculate GST, so there's nothing to see in a browser.</p>
<p>To use it in Claude, add <code>${SITE}/mcp/</code> as a custom connector.</p>
<p><a href="/mcp-server/">Setup guide and tool list</a> · <a href="/">Free UPI QR generator</a></p></main></body></html>`;

export const ALL: APIRoute = async ({ request }) => {
  if (request.method === "GET" && (request.headers.get("accept") || "").includes("text/html")) {
    return new Response(BROWSER_PAGE, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
  }
  return handleMcpHttp(request, server, { allowedOrigins: ALLOWED_ORIGINS, beforeToolCall: () => beforeToolCall(request) });
};
