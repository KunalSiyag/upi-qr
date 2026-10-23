import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  formatPaise,
  isTrustedMutation,
  normalizeEmail,
  parseInrToPaise,
  requestFingerprint,
  safeDynamicDestination,
  safePublicHttpsUrl,
  validExpiryDate,
  validCheckoutSessionId,
  validAmountPaise,
  validMerchantApiKey,
  validMerchantName,
  validOrderId,
  validUtr,
  validVpa,
} from "../src/lib/apiSecurity.ts";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

assert.equal(parseInrToPaise("10"), 1000);
assert.equal(parseInrToPaise("10.05"), 1005);
assert.equal(parseInrToPaise("10.5"), 1050);
assert.equal(formatPaise(1005), "10.05");
assert.equal(parseInrToPaise("1.005"), null);
assert.equal(parseInrToPaise("-1"), null);
assert.equal(parseInrToPaise("Infinity"), null);
assert.equal(validAmountPaise(25000), true);
assert.equal(validAmountPaise(true), false);

assert.equal(validVpa("merchant@okaxis"), true);
assert.equal(validVpa("not a vpa"), false);
assert.equal(validOrderId("order_2026-08:27"), true);
assert.equal(validOrderId("order/unsafe"), false);
assert.equal(validMerchantApiKey(`puqi_live_${"a".repeat(48)}`), true);
assert.equal(validMerchantApiKey("puqi_test_12345"), false);
assert.equal(validMerchantName("Sharma General Store"), true);
assert.equal(validMerchantName("x"), false);
assert.equal(validCheckoutSessionId(`cs_live_${"a".repeat(36)}`), true);
assert.equal(validCheckoutSessionId("../../checkout"), false);
assert.equal(validUtr("123456789012"), true);
assert.equal(validUtr("short"), false);
const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
assert.equal(validExpiryDate(nextYear), true);
assert.equal(validExpiryDate("2099-01-01"), false);
assert.equal(validExpiryDate("2026-02-31"), false);

assert.equal(safePublicHttpsUrl("https://merchant.example.com/paid")?.startsWith("https://merchant.example.com/paid"), true);
assert.equal(safePublicHttpsUrl("http://merchant.example.com"), null);
assert.equal(safePublicHttpsUrl("javascript:alert(1)"), null);
assert.equal(safePublicHttpsUrl("https://localhost/admin"), null);
assert.equal(safePublicHttpsUrl("https://127.0.0.1/admin"), null);
assert.equal(safePublicHttpsUrl("https://10.0.0.1/admin"), null);
assert.equal(safePublicHttpsUrl("https://upi/path"), null);
assert.equal(safePublicHttpsUrl("https://192.0.2.1/path"), null);
assert.equal(safePublicHttpsUrl("https://user:pass@example.com/"), null);

assert.ok(safeDynamicDestination("upi://pay?pa=merchant%40okaxis&pn=Merchant&am=10.00&cu=INR"));
assert.equal(safeDynamicDestination("upi://pay?pn=MissingVpa"), null);
assert.equal(safeDynamicDestination("upi://collect?pa=merchant%40okaxis"), null);
assert.equal(safeDynamicDestination("file:///etc/passwd"), null);

assert.equal(isTrustedMutation(new Request("https://www.proupiqr.in/api/dynamic", {
  method: "POST",
  headers: { origin: "https://www.proupiqr.in", "sec-fetch-site": "same-origin" },
})), true);
assert.equal(isTrustedMutation(new Request("https://www.proupiqr.in/api/dynamic", {
  method: "POST",
  headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
})), false);
assert.equal(
  requestFingerprint(new Request("https://www.proupiqr.in/", { headers: { "x-real-ip": "203.0.113.10", "user-agent": "one" } })),
  requestFingerprint(new Request("https://www.proupiqr.in/", { headers: { "x-real-ip": "203.0.113.10", "user-agent": "two" } })),
);

assert.equal(existsSync(join(projectRoot, "src/pages/api/internal/seed.ts")), false);
assert.equal(existsSync(join(projectRoot, "src/pages/api/internal/submit-utr.ts")), false);

const redirectRoute = readFileSync(join(projectRoot, "src/pages/r.astro"), "utf8");
assert.equal(/searchParams\.get\(["'](?:url|u)["']\)/.test(redirectRoute), false);
assert.match(redirectRoute, /readRecord\(id\)/);
assert.match(redirectRoute, /You Are Leaving Pro UPI QR/);

const checkoutPage = readFileSync(join(projectRoot, "src/pages/c/[id].astro"), "utf8");
assert.doesNotMatch(checkoutPage, /success=true|merchant@bank|Payment Verified/);
assert.match(checkoutPage, /verification_pending/);
assert.doesNotMatch(checkoutPage, /http-equiv="refresh"/);

const checkoutStatusClient = readFileSync(join(projectRoot, "public/checkout-status.js"), "utf8");
assert.match(checkoutStatusClient, /data\.status !== initialStatus/);

const dynamicClient = readFileSync(join(projectRoot, "src/components/DynamicQrGenerator.tsx"), "utf8");
assert.doesNotMatch(dynamicClient, /[?&]url=\$\{encodeURIComponent\(link\.destinationUrl\)\}/);

const dynamicApi = readFileSync(join(projectRoot, "src/pages/api/dynamic/index.ts"), "utf8");
assert.match(dynamicApi, /authenticatedUserId\(locals\)/);
assert.match(dynamicApi, /createRecord\(userId/);
assert.doesNotMatch(dynamicApi, /id:\s*body\.id/);

const surveyTool = readFileSync(join(projectRoot, "src/components/SurveyQrGenerator.tsx"), "utf8");
assert.doesNotMatch(surveyTool, /\/r\/\?[^\n]*url=/);

const vercelConfig = readFileSync(join(projectRoot, "vercel.json"), "utf8");
assert.match(vercelConfig, /X-Frame-Options/);
assert.match(vercelConfig, /Cross-Origin-Opener-Policy/);
assert.match(vercelConfig, /Content-Security-Policy/);
assert.match(vercelConfig, /frame-ancestors 'self'/);
assert.doesNotMatch(vercelConfig, /medium\.com/i);

// Link schemes and Indexing API misuse risk a manual action: satellite syndication (Medium banned it),
// bulk Indexing API submits (Google allows only job/livestream pages) and fake-Googlebot fetches stay deleted.
for (const removed of ["scripts/syndicate-satellites.mjs", "index_pages.py", "scripts/warmup-crawlers.mjs"]) {
  assert.equal(existsSync(join(projectRoot, removed)), false, `${removed} must stay deleted`);
}

assert.equal(normalizeEmail("  Owner@Example.COM "), "owner@example.com");
assert.equal(normalizeEmail("owner+tag@shop.co.in"), "owner+tag@shop.co.in");
assert.equal(normalizeEmail("not-an-email"), null);
assert.equal(normalizeEmail("a@b"), null);
assert.equal(normalizeEmail("a..b@example.com"), null);
assert.equal(normalizeEmail("<script>@example.com"), null);
assert.equal(normalizeEmail(`${"a".repeat(250)}@example.com`), null);
assert.equal(normalizeEmail(42), null);

const waitlistApi = readFileSync(join(projectRoot, "src/pages/api/waitlist.ts"), "utf8");
assert.match(waitlistApi, /isTrustedMutation\(request\)/);
assert.match(waitlistApi, /consumeRateLimit\("waitlist"/);
assert.match(waitlistApi, /readJsonObject\(request, 2048\)/);
// "created" may feed an aggregate counter, but never the HTTP response (no email enumeration).
assert.doesNotMatch(waitlistApi, /jsonResponse\([^)]*created/, "waitlist response must not depend on whether an email already exists");
assert.match(waitlistApi, /if \(created\) await recordMetric\(body\.tool === "pro" \? "pro_interest" : "waitlist_join"\);\n\s*\} catch/, "created is only used for the metric");

// Funnel steps from the browser: same-site only, allow-listed names, tiny bodies, a per-visitor
// cap, and nothing stored per visitor beyond the rate-limit window.
const eventsApi = readFileSync(join(projectRoot, "src/pages/api/v1/events.ts"), "utf8");
assert.match(eventsApi, /if \(!isTrustedMutation\(request\)\) return/, "funnel steps refuse cross-site posts");
assert.match(eventsApi, /CLIENT_STEPS\.has\(body\.step\)/, "only allow-listed funnel steps are counted");
assert.match(eventsApi, /readJsonObject\(request, 256\)/, "funnel step bodies are tiny");
assert.match(eventsApi, /consumeRateLimit\("funnel-step", requestFingerprint\(request\)/, "one visitor can only add so much");
assert.doesNotMatch(eventsApi, /kv\.|from "@vercel\/kv"/, "no direct KV writes: only the aggregate recordMetric counter");
const productEventsClient = readFileSync(join(projectRoot, "src/lib/productEvents.ts"), "utf8");
assert.match(productEventsClient, /JSON\.stringify\(\{ step \}\)/, "the browser sends only the step name");
assert.match(waitlistApi, /await addWaitlistEntry\(/);
const waitlistStore = readFileSync(join(projectRoot, "src/lib/waitlistStore.ts"), "utf8");
assert.match(waitlistStore, /'NX', 'EX'/);

function kvStore_src() { return readFileSync(join(projectRoot, "src/lib/workspace/kvCloudStore.ts"), "utf8"); }
const workspaceApi = readFileSync(join(projectRoot, "src/pages/api/v1/workspace/index.ts"), "utf8");
for (const method of ["GET", "PUT", "DELETE"]) {
  const handler = workspaceApi.split(`export const ${method}: APIRoute`)[1]?.split("export const")[0] ?? "";
  assert.match(handler, /authenticatedUserId\(locals\)/, `${method} /api/v1/workspace must require sign-in`);
  assert.match(handler, /workspaceOwner\(userId\)/, `${method} /api/v1/workspace must scope to the signed-in user`);
  if (method !== "GET") assert.match(handler, /isTrustedMutation\(request\)/, `${method} /api/v1/workspace must reject cross-site requests`);
}
assert.match(workspaceApi, /readJsonObject\(request, MAX_WORKSPACE_BYTES/);
assert.match(kvStore_src(), /!hasKv && import\.meta\.env\.DEV \? devStore : kvCloudStore/, "in-memory workspace store must be dev-only");
const kvStore = kvStore_src();
assert.match(kvStore, /createHash\("sha256"\)/, "workspace keys must hash the Clerk user id");
const syncClient = readFileSync(join(projectRoot, "src/lib/workspace/sync.ts"), "utf8");
assert.match(syncClient, /previousOwner && previousOwner !== body\.owner/, "another account's local data must never be uploaded");

const payPage = readFileSync(join(projectRoot, "src/pages/i/[token].astro"), "utf8");
assert.match(payPage, /script-src 'none'/, "pay page must forbid scripts");
assert.match(payPage, /isTrustedMutation\(Astro\.request\)/, "pay page claims must reject cross-site posts");
assert.match(payPage, /consumeRateLimit\("paylink-claim"/, "pay page claims must be rate limited");
assert.doesNotMatch(payPage, /client\??\.name|clients\[/, "pay page must not render the payer's identity");
for (const form of [payPage, readFileSync(join(projectRoot, "src/pages/c/[id].astro"), "utf8")]) {
  assert.match(form, /headers\.set\("Referrer-Policy", "same-origin"\)/, "pages with POST forms need same-origin referrer policy (no-referrer sends Origin: null)");
}
const middleware = readFileSync(join(projectRoot, "src/middleware.ts"), "utf8");
assert.match(middleware, /if \(!response\.headers\.has\(name\)\) response\.headers\.set\(name, value\)/, "middleware must not weaken page-level CSP");
// Static pages get the vercel.json CSP and SSR pages the middleware default: keep them identical, and
// complete for Clerk (clerk.com/docs/security/clerk-csp) or sign-in/sign-up breaks with a production instance.
const mainCsp = JSON.parse(vercelConfig).headers.find((h) => h.source === "/((?!embed).*)").headers.find((h) => h.key === "Content-Security-Policy").value;
assert.ok(middleware.includes(`"${mainCsp}"`), "middleware default CSP must match the vercel.json page CSP");
const cspDirective = (name) => mainCsp.split(";").map((d) => d.trim()).find((d) => d.startsWith(`${name} `)) ?? "";
for (const [name, sources] of Object.entries({
  "script-src": ["https://clerk.proupiqr.in", "https://*.clerk.accounts.dev", "https://challenges.cloudflare.com"],
  "connect-src": ["https://clerk.proupiqr.in", "https://*.clerk.accounts.dev", "https://*.protect.clerk.com:*"],
  "frame-src": ["https://challenges.cloudflare.com", "https://*.clerk.com"],
  "worker-src": ["'self'", "blob:"],
})) {
  for (const source of sources) assert.ok(cspDirective(name).split(/\s+/).includes(source), `CSP ${name} must allow ${source} for Clerk`);
}
assert.ok(!/(^|\s)(https:|\*)(\s|$)/.test(cspDirective("script-src")), "script-src must not allow any host");
const paylinkApi = readFileSync(join(projectRoot, "src/pages/api/v1/paylinks/[token].ts"), "utf8");
assert.match(paylinkApi, /record\.owner !== workspaceOwner\(userId\)/, "only the owner may revoke a pay link");

const webhookCore = readFileSync(join(projectRoot, "src/lib/billing/webhook.ts"), "utf8");
const firstStatement = webhookCore.split("now: number,\n): Promise<WebhookResult> {")[1]?.trim().split("\n")[0] ?? "";
assert.match(firstStatement, /verifyWebhookSignature/, "billing webhook must verify the signature before anything else");
const billingApi = readFileSync(join(projectRoot, "src/pages/api/v1/billing/index.ts"), "utf8");
for (const method of ["GET", "POST"]) {
  const handler = billingApi.split(`export const ${method}: APIRoute`)[1]?.split("export const")[0] ?? "";
  assert.match(handler, /authenticatedUserId\(locals\)/, `${method} /api/v1/billing must require sign-in`);
  if (method === "POST") assert.match(handler, /isTrustedMutation\(request\)/);
}
assert.match(billingApi, /safeCheckoutUrl\(/, "checkout URLs must be allow-listed before reaching the browser");
const { safeCheckoutUrl } = await import("../src/lib/billing/config.ts");
assert.equal(safeCheckoutUrl("https://rzp.io/i/abc"), "https://rzp.io/i/abc");
assert.equal(safeCheckoutUrl("https://checkout.razorpay.com/x"), "https://checkout.razorpay.com/x");
assert.equal(safeCheckoutUrl("https://razorpay.com.evil.example/x"), null);
assert.equal(safeCheckoutUrl("http://rzp.io/i/abc"), null);
assert.equal(safeCheckoutUrl("javascript:alert(1)"), null);
assert.equal(safeCheckoutUrl("https://test.checkout.dodopayments.com/buy/cks_x"), "https://test.checkout.dodopayments.com/buy/cks_x");
assert.equal(safeCheckoutUrl("https://dodopayments.com.evil.example/x"), null);
assert.equal(safeCheckoutUrl("https://evil-dodopayments.com/x"), null);
// Dodo webhooks: Standard Webhooks signature checked before anything else; checkout pinned to our customer.
const dodoFirst = webhookCore.split("headers: { id: string | null; timestamp: string | null; signature: string | null },\n  now: number,\n): Promise<WebhookResult> {")[1]?.trim().split("\n")[0] ?? "";
assert.match(dodoFirst, /verifyStandardWebhook/, "Dodo webhook must verify the signature before anything else");
const dodoLib = readFileSync(join(projectRoot, "src/lib/billing/dodo.ts"), "utf8");
assert.match(dodoLib, /Math\.abs\(nowSeconds - Number\(timestamp\)\) > 300/, "Dodo webhooks older than 5 minutes are replays");
assert.match(dodoLib, /timingSafeEqual\(given, expected\)/, "Dodo signatures compared in constant time");
const dodoRoute = readFileSync(join(projectRoot, "src/pages/api/billing/dodo-webhook.ts"), "utf8");
assert.match(dodoRoute, /request\.headers\.get\("webhook-signature"\)/);
// Re-reading subscriptions from Razorpay: only the signed-in owner's own record, throttled, and the
// pending-checkout URL handed to the browser goes through the same allow-list.
const reconcile = readFileSync(join(projectRoot, "src/lib/billing/reconcile.ts"), "utf8");
assert.match(reconcile, /store\.claimRefresh\(owner, seconds, now\)/, "Razorpay re-reads must be throttled per account");
assert.match(reconcile, /fetched\.owner !== owner/, "a re-read subscription naming another account must not be applied");
const getHandler = billingApi.split("export const GET: APIRoute")[1]?.split("export const")[0] ?? "";
assert.match(getHandler, /reconcileSubscription\(store, providers, owner, now\)/);
assert.match(getHandler, /safeCheckoutUrl\(record\.shortUrl\)/, "pending checkout URLs must be allow-listed");
const razorpayClient = readFileSync(join(projectRoot, "src/lib/billing/razorpay.ts"), "utf8");
assert.match(razorpayClient, /const API = "https:\/\/api\.razorpay\.com\/v1";/, "Razorpay API host must stay fixed");
assert.match(razorpayClient.split("export async function fetchSubscription")[1] ?? "", /SUBSCRIPTION_ID\.test\(subscriptionId\)/, "subscription ids are validated before building the API path");

const cronRoute = readFileSync(join(projectRoot, "src/pages/api/cron/digest.ts"), "utf8");
assert.match(cronRoute, /timingSafeEqual/, "cron must check CRON_SECRET in constant time");
assert.ok(cronRoute.indexOf("authorized(request.headers") < cronRoute.indexOf("reconcileDueSubscriptions("), "cron must authenticate before touching billing");
const claimAlert = readFileSync(join(projectRoot, "src/lib/push/claimAlert.ts"), "utf8");
assert.match(claimAlert, /safePushEndpoint\(subscription\.endpoint, deps\.allowLocalEndpoints\)/, "claim alerts must re-check push endpoints (SSRF)");
const payPageSource = readFileSync(join(projectRoot, "src/pages/i/[token].astro"), "utf8");
assert.match(payPageSource, /allowLocalEndpoints: allowLocalPushEndpoints\(\)/, "pay page may only allow local push endpoints in development");
assert.ok(payPageSource.indexOf("addClaim(") < payPageSource.indexOf("sendClaimAlert("), "a claim is stored before anyone is notified");
assert.match(cronRoute, /if \(!secret\) return jsonResponse/, "cron must refuse to run without CRON_SECRET");
const pushApi = readFileSync(join(projectRoot, "src/pages/api/v1/push/index.ts"), "utf8");
assert.match(pushApi, /safePushEndpoint\(/, "push subscriptions must be allow-listed (SSRF)");
for (const method of ["POST", "DELETE"]) {
  const handler = pushApi.split(`export const ${method}: APIRoute`)[1]?.split("export const")[0] ?? "";
  assert.match(handler, /authenticatedUserId\(locals\)/);
  assert.match(handler, /isTrustedMutation\(request\)/);
}
const pushConfig = readFileSync(join(projectRoot, "src/lib/push/config.ts"), "utf8");
assert.match(pushConfig, /allowLocalPushEndpoints = \(\): boolean => Boolean\(import\.meta\.env\.DEV\)/, "local push endpoints only in development");

const adminPage = readFileSync(join(projectRoot, "src/pages/admin/metrics.astro"), "utf8");
assert.match(adminPage, /parseAdminIds\(/, "admin page must check the ADMIN_USER_IDS allowlist");
assert.match(adminPage, /status: 404/, "non-admins get a 404, not a hint that the page exists");
const metricsLib = readFileSync(join(projectRoot, "src/lib/metricsCore.ts"), "utf8");
assert.doesNotMatch(metricsLib, /email|owner|userId|vpa/i, "metrics are aggregate counters only");

// MCP server (/mcp/, the Claude connector): stateless and read-only. Tool input is never logged or
// stored; KV sees only the rate-limit window and the aggregate daily counter. No Clerk, no outside calls,
// browser origins allow-listed, bodies capped, no sessions, and poster links keep the payment after #.
const mcpRoute = readFileSync(join(projectRoot, "src/pages/mcp/index.ts"), "utf8");
const mcpProtocol = readFileSync(join(projectRoot, "src/lib/mcp/protocol.ts"), "utf8");
const mcpTools = readFileSync(join(projectRoot, "src/lib/mcp/tools.ts"), "utf8");
for (const [name, src] of [["route", mcpRoute], ["protocol", mcpProtocol], ["tools", mcpTools]]) {
  assert.doesNotMatch(src, /console\.(log|info|warn|error|debug)/, `MCP ${name} must not log tool input`);
  assert.doesNotMatch(src, /from "@vercel\/kv"|\bkv\./, `MCP ${name} must not touch KV directly`);
  assert.doesNotMatch(src, /\bfetch\(/, `MCP ${name} makes no outside calls (openWorldHint: false)`);
}
assert.match(mcpRoute, /consumeRateLimit\("mcp-call", requestFingerprint\(request\)/, "tool calls are rate-limited per network");
assert.match(mcpRoute, /consumeRateLimit\("mcp-call-anthropic", "shared"/, "Claude's shared egress range has one shared allowance, not a per-address one");
assert.match(mcpRoute, /recordMetric\("mcp_tool_call"\)/, "only an aggregate counter");
assert.doesNotMatch(mcpRoute, /locals|auth\(|clerk/i, "the connector never reads a signed-in session");
assert.doesNotMatch(mcpRoute, /public, max-age|s-maxage/, "no /mcp/ response may be cached at the edge (it would be replayed to MCP clients)");
assert.match(mcpProtocol, /options\.allowedOrigins\.includes\(origin\)/, "browser origins are allow-listed (DNS rebinding guard)");
assert.match(mcpProtocol, /readLimitedText\(request, options\.maxBodyBytes \?\? 64 \* 1024\)/, "request bodies are capped");
assert.doesNotMatch(mcpProtocol, /["']Mcp-Session-Id["']\s*:/i, "no session id is ever sent");
assert.match(mcpProtocol, /readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false/);
assert.match(mcpTools, /siteLink\(`\/#pay\?\$\{/, "poster links carry the payment after #, never in the query string");
assert.match(mcpTools, /export const MCP_UTM = "utm_source=mcp&utm_medium=tool";/, "the only query string on links back to the site is the fixed campaign tag");
assert.match(mcpRoute, /isCatalogEligible\(tool\.href\)/, "the tool catalog skips sponsored /products/ pages (directory policy)");
assert.match(middleware, /PRIVATE_ROUTE_PREFIXES = \[[^\]]*"\/mcp"\]/, "the endpoint is noindex");
assert.doesNotMatch(middleware.match(/CLERK_ROUTE_PREFIXES = \[[^\]]*\]/)[0], /\/mcp/, "Clerk stays off /mcp/");

// Several businesses per account (docs/spec-multi-business.md §9.2): new routes are signed-in, owner-scoped,
// CSRF-guarded, body-capped and no-store; the plan limit is enforced on the server; non-primary data never
// reaches the primary slot, and a pay link never resolves to another business.
const handlerOf = (src, method) => src.split(`export const ${method}: APIRoute`)[1]?.split("export const")[0] ?? "";
const booksIndexRoute = readFileSync(join(projectRoot, "src/pages/api/v1/workspace/books/index.ts"), "utf8");
const bookRoute = readFileSync(join(projectRoot, "src/pages/api/v1/workspace/books/[id].ts"), "utf8");
const bookLinkRoute = readFileSync(join(projectRoot, "src/pages/api/v1/paylinks/books/[id].ts"), "utf8");
const booksApi = readFileSync(join(projectRoot, "src/lib/workspace/booksApi.ts"), "utf8");
for (const [name, src, methods] of [["books/", booksIndexRoute, ["GET", "PUT"]], ["books/[id]", bookRoute, ["GET", "PUT"]], ["paylinks/books/[id]", bookLinkRoute, ["POST"]]]) {
  for (const method of methods) {
    const handler = handlerOf(src, method);
    assert.match(handler, /const userId = authenticatedUserId\(locals\);\n\s*if \(!userId\) return jsonResponse\(\{[^}]*\}, 401\);/, `${method} ${name} must require sign-in first`);
    assert.match(handler, /workspaceOwner\(userId\)/, `${method} ${name} must scope to the signed-in user's owner key`);
    if (method !== "GET") {
      assert.match(handler, /if \(!isTrustedMutation\(request\)\) return jsonResponse/, `${method} ${name} must reject cross-site requests`);
      assert.match(handler, /readJsonObject\(request, (MAX_INDEX_BYTES|MAX_WORKSPACE_BYTES \+ 100_000|1024)\)/, `${method} ${name} must cap the body`);
    }
  }
  assert.doesNotMatch(src, /new Response\(/, `${name} answers through jsonResponse (Cache-Control: no-store)`);
  assert.doesNotMatch(src, /params\.owner|body\.owner|searchParams\.get\("owner"\)/, `${name} never takes the owner from the request`);
}
assert.match(booksIndexRoute, /const MAX_INDEX_BYTES = 16_000;/, "the index body is capped at 16 KB");
assert.match(booksIndexRoute, /consumeRateLimitUnits\("workspace-book-add", userId, 60, 86_400, units\)/, "60 business adds per account per day, charged per business");
assert.match(booksApi, /const adding = liveBookIds\(incoming\)\.filter\(\(id\) => !known\.has\(id\)\)\.length;\n\s*if \(adding > 0 && !\(await consumeAdd\(adding\)\)\)/, "the add budget is charged one unit per new business");
const rateLimitLib = readFileSync(join(projectRoot, "src/lib/rateLimit.ts"), "utf8");
assert.match(rateLimitLib, /if count \+ units > tonumber\(ARGV\[3\]\) then/, "a request the remaining budget can't cover is refused without being charged");
assert.match(kvStore_src(), /pipe\.del\(\.\.\.slots\.map\(docKey\)\);\n\s*for \(const slot of slots\) pipe\.incr\(revKey\(slot\)\);/, "removing a document advances its revision (a device holding rev N re-uploads)");
assert.match(booksApi, /if \(viewed\.length\) await d\.paylinks\.patchViews\(owner, \{\}, viewed\);/, "undo drops snapshots written during a delete race");
for (const fn of ["putBookIndex", "putBook", "createBookLink"]) {
  const body = booksApi.split(`export async function ${fn}(`)[1]?.split("\nexport ")[0] ?? "";
  assert.match(body, /ownerMismatch\(body, owner\)/, `${fn} must compare expectedOwner (409 on mismatch)`);
}
assert.match(booksApi, /code: "owner_mismatch"/);
assert.match(booksApi, /return res\(409, \{ error: "This tab belongs to another account/, "owner mismatch answers 409");
assert.match(booksApi, /syncBookIndex\(d\.books, owner, incoming, d\.now\(\), async \(\) => \(plan = await d\.plan\(owner\)\)\.businesses\)/, "the index PUT passes the strict plan's business limit");
assert.match(readFileSync(join(projectRoot, "src/lib/workspace/serverBooks.ts"), "utf8"), /plan: \(owner\) => planForStrict\(owner\)/, "business limits use planForStrict (a KV blip is 503, never Free)");
assert.match(booksApi, /id === PRIMARY_BOOK_ID\) return res\(400/, "the /books/<id>/ routes refuse biz_primary");
assert.match(booksApi, /!BOOK_ID_RE\.test\(id\)/, "book ids are validated before building a slot");
for (const [route, src] of [["books/[id]", bookRoute], ["paylinks/books/[id]", bookLinkRoute]]) {
  assert.ok(src.indexOf("badBookId(params.id)") > 0 && src.indexOf("badBookId(params.id)") < src.indexOf("serverBooks()"), `${route} validates the id before touching storage`);
}
const putBookBody = booksApi.split("export async function putBook(")[1].split("\nexport ")[0];
assert.ok(putBookBody.indexOf("readOnly(d, owner, live.index, id)") < putBookBody.indexOf("syncWorkspace("), "read-only (downgraded) books are refused before any write");
assert.ok(putBookBody.indexOf("syncWorkspace(") < putBookBody.indexOf("const after = await readBookIndex"), "book PUTs re-read the index after their writes");
assert.match(putBookBody, /removeDocs\(\[slot\]\)[\s\S]*projections\.drop\(owner, id\)[\s\S]*paylinks\.removeBook\(owner, id\)/, "a write that raced a delete is undone");
const linkBody = booksApi.split("export async function createBookLink(")[1].split("\nexport ")[0];
assert.ok(linkBody.indexOf("readOnly(d, owner, live.index, id)") < linkBody.indexOf("createPaylink("), "read-only books get no new links");
assert.ok(linkBody.indexOf("createPaylink(") < linkBody.indexOf("const after = await readBookIndex"), "link POSTs re-read the index after writing");
assert.match(linkBody, /if \(result\.created\) await d\.paylinks\.remove\(owner, result\.token, key\)/, "a link created during a delete is revoked");
assert.match(booksApi, /code: "plan_read_only"/);
assert.match(booksApi, /if \(rank < PLANS\.free\.businesses\) return \{ plan: null \};/, "the first business is never read-only and never reads billing");
assert.doesNotMatch(handlerOf(workspaceApi, "PUT"), /businessId/, "the primary route never reads a businessId");
assert.match(handlerOf(workspaceApi, "PUT"), /ownerMismatch\(body, owner\)/);
assert.match(handlerOf(workspaceApi, "DELETE"), /deleteCloudCopy\(serverBooks\(\), workspaceOwner\(userId\)\)/, "Delete cloud copy covers every business");
assert.match(handlerOf(workspaceApi, "DELETE"), /ownerMismatch\(body, workspaceOwner\(userId\)\)/, "Delete cloud copy checks expectedOwner");
assert.match(paylinkApi, /ownerMismatch\(body, record\.owner\)/, "revoking a link checks expectedOwner");
assert.match(readFileSync(join(projectRoot, "src/lib/workspace/booksApi.ts"), "utf8"), /await deleteAllCloud\(d, owner, d\.now\(\)\);/);
const paylinksApi = readFileSync(join(projectRoot, "src/pages/api/v1/paylinks/index.ts"), "utf8");
assert.match(handlerOf(paylinksApi, "GET"), /filter\(\(\[key\]\) => allBooks \|\| !key\.includes\("\/"\)\)/, "old clients only list the primary book's links");
assert.match(handlerOf(paylinksApi, "POST"), /ownerMismatch\(body, owner\)/);
assert.match(payPage, /readWorkspace\(cloudStore\(\), slotFor\(record\.owner, bookId\)\)/, "the pay-page fallback reads only the owning book");
assert.match(payPage, /const \{ bookId, subject \} = parseLinkKey\(record\.invoiceId\);/);
assert.match(payPage, /if \(!liveBookIds\(books\.index\)\.includes\(bookId\)\) return gone\(404/, "a deleted or unknown book's link is 404, never the primary");
assert.doesNotMatch(payPage, /putViews\(/, "the pay page never replaces every snapshot (that would drop other books' views)");
assert.match(kvStore_src(), /!hasKv && import\.meta\.env\.DEV \? devBookIndex : kvBookIndexStore/, "in-memory book index must be dev-only");
// The business limit lives only in PLANS (entitlements.ts).
{
  const { readdirSync, statSync } = await import("node:fs");
  const walk = (dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
  for (const file of walk(join(projectRoot, "src")).filter((f) => /\.(ts|tsx|astro|mjs)$/.test(f) && !f.endsWith("entitlements.ts"))) {
    const src = readFileSync(file, "utf8");
    assert.doesNotMatch(src, /businesses:\s*(1|20)\b|\b(PRO|FREE)_BUSINESSES\b/, `${file} must read business limits from PLANS`);
  }
}
// Clerk networkless verification: the key comes only from the environment.
assert.match(middleware, /jwtKey: process\.env\.CLERK_JWT_KEY \|\| undefined/);
assert.doesNotMatch(middleware, /BEGIN PUBLIC KEY/);
// Notification URLs stay on this site, in both service-worker handlers.
{
  const sw = readFileSync(join(projectRoot, "public/sw.js"), "utf8");
  const fnSrc = sw.match(/function sameOriginPath\(value\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(fnSrc, "sw.js defines sameOriginPath");
  const sameOriginPath = new Function("self", `${fnSrc}; return sameOriginPath;`)({ location: { origin: "https://www.proupiqr.in" } });
  assert.equal(sameOriginPath("/app/?business=biz_abcdef01"), "/app/?business=biz_abcdef01");
  assert.equal(sameOriginPath("https://www.proupiqr.in/app/"), "/app/");
  for (const evil of ["//evil.example/app/", "/\\evil.example/app/", "https://evil.example/", "javascript:alert(1)", 42]) {
    assert.equal(sameOriginPath(evil), null, `notification URL ${String(evil)} must be refused`);
  }
  assert.match(sw, /data: \{ url: sameOriginPath\(data\.url\) \|\| "\/app\/" \}/, "push keeps only same-origin URLs");
  assert.match(sw, /new URL\(sameOriginPath\(event\.notification\.data\?\.url\) \|\| "\/app\/", self\.location\.origin\)/, "notificationclick re-checks the origin");
}

// Client side of several businesses (spec §4.4, §3.6): one lookup helper for pay-link keys, owner-checked
// writes, a verified stash on account switches, and no book route on a legacy server.
{
  const { readdirSync, statSync } = await import("node:fs");
  const walk = (dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
  for (const file of walk(join(projectRoot, "src")).filter((f) => /\.(ts|tsx|astro|mjs)$/.test(f) && !f.endsWith(join("workspace", "books.ts")))) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /byInvoice\[/, `${file} must read pay links through linkFor() (byInvoice[ indexes another business's link for the same id)`);
  }
  assert.match(syncClient, /expectedOwner: o\.owner\(\)/, "book writes carry expectedOwner");
  assert.match(syncClient, /\{ index, expectedOwner: owner \}/, "index writes carry expectedOwner");
  assert.match(syncClient, /status === 404 \|\| response\.status === 405\) return startLegacy/, "a server without the books routes runs the primary only");
  assert.doesNotMatch(syncClient.split("async function startLegacy")[1].split("let starting")[0], /BOOKS_URL|bookUrl\(/, "the legacy start never calls a book route");
  assert.match(syncClient, /if \(!isBookId\(bookId\)\) throw/, "book URLs are built only from valid ids");
  const store = readFileSync(join(projectRoot, "src/lib/workspace/localStore.ts"), "utf8");
  assert.match(store, /function putVerified\(key: string, value: string\): boolean \{\s*return put\(key, value\) && get\(key\) === value;/, "stash writes are read back");
  const switchSrc = store.split("export function switchAccountStorage")[1].split("\n}\n")[0];
  assert.match(switchSrc, /putVerified\(stashKey, value\)[\s\S]*drop\(bookKey\(id\)\)/, "an extra book leaves the shelf only after its stash copy verified");
  assert.match(switchSrc, /putVerified\(STASH_KEY, primaryStash\)[\s\S]*writeBookKeys\(PRIMARY_BOOK_ID, newPrimary, true, now\)/, "the primary is stashed before it is replaced");
  assert.match(switchSrc, /stashOwner !== previousOwner && stashOwner !== newOwner\) return \{ ok: false, reason: "occupied" \}/, "a third account's stash is never overwritten");
  assert.match(switchSrc, /if \(putVerified\(bookKey\(m\.id\), m\.raw\)\) \{ restoreStash\(\); return true; \}/, "a rolled-back book's stash copy goes only after the book key verified");
  assert.match(syncClient, /if \(saved && owner && !legacy\) writeSyncMeta/, "no revision skip data from a legacy server");
  assert.match(syncClient, /if \(!starting\) starting = run\(\)/, "start is single flight");
  assert.match(syncClient, /if \(!started\) \{ coord = null; void start\(\); return; \}/, "a failed start is retried when the tab comes back");
  assert.match(syncClient, /if \(!index\.owner \|\| index\.owner === serverOwner\) return true;/, "another account's index is never merged into this account");
  const belongs = store.split("function stashBelongsTo")[1].split("\n}\n")[0];
  assert.doesNotMatch(belongs, /name/, "a stash without an owner is never attributed by business name");
  assert.match(syncClient, /async function run\(\): Promise<void> \{\s*if \(stopped\(\)\) return;\s*if \(ownerMovedUnderUs\(\)\) return ownerMismatch\(\);/, "a (re)start never runs after another tab moved the device to another account");
  assert.match(readFileSync(join(projectRoot, "src/components/workspace/PaymentsWorkspace.tsx"), "utf8"), /if \(ownerChangedElsewhere\(tabOwner\(\)\)\) \{ ownerChanged\(\); return/, "saves after another tab's account switch reload instead of vanishing");
  assert.match(store, /export const BOOKS_UI = true;/, "PR 5 turns the business UI on together with the pricing copy");
  const ui = readFileSync(join(projectRoot, "src/components/workspace/PaymentsWorkspace.tsx"), "utf8");
  assert.match(ui, /BOOKS_UI && requested !== null/, "?business= is read only while the business UI is on");
  assert.match(ui, /isBookId\(requested\) && loaded\.books\[requested\] && liveBookIds\(loaded\.index\)\.includes\(requested\)/, "?business= must be a valid, live, local id");
  // The business switcher (PR 4): a listbox that never looks like a dialog, a section tab or an invoice row to the e2e selectors.
  const switcherSrc = readFileSync(join(projectRoot, "src/components/workspace/BusinessSwitcher.tsx"), "utf8");
  assert.match(switcherSrc, /role="listbox"/);
  assert.doesNotMatch(switcherSrc, /role="dialog"|aria-current=|<li[\s>]|type="file"/, "the switcher has no dialog, aria-current, li or file input");
  // Edits never land in a read-only business or in one that isn't loaded here.
  assert.match(ui, /if \(from !== undefined && from !== id\) \{ setFlash\(trRef\.current\(BUSINESS_CHANGED\)\); return false; \}/, "a sheet's save never lands in another business");
  assert.match(ui, /if \(readOnlyRef\.current\) \{ setFlash\(trRef\.current\(READ_ONLY\)\); return false; \}/, "setWs refuses read-only businesses, and says so");
  assert.doesNotMatch(ui, /setActive\(PRIMARY_BOOK_ID\)/, "every change of business goes through goToBook (closes sheets, clears filters)");
  assert.match(ui, /if \(!BOOKS_UI \|\| id === PRIMARY_BOOK_ID\) return;/, "the first business can't be deleted");
  const linkClient = readFileSync(join(projectRoot, "src/lib/workspace/paylinkClient.ts"), "utf8");
  assert.match(linkClient, /\/api\/v1\/paylinks\/\?books=1/, "new clients list every business's links");
  assert.match(linkClient, /if \(!isBookId\(bookId\) \|\| ctx\.legacy\) return null;/, "no book link route on a legacy server");
}

// Clients abroad, PR 1 (docs/spec-foreign-clients.md §1.6, §2, §3.2, §9.2): one module for currencies with no
// imports; no direct reads of the invoice/plan maps outside the model (so no reader forgets ws.intl); integer
// money; only writeBookKeys writes book keys; server view builders stay INR-only until they handle foreign records.
{
  const { readdirSync, statSync } = await import("node:fs");
  const walk = (dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
  const rel = (f) => f.slice(projectRoot.length + 1);
  const read = (f) => readFileSync(join(projectRoot, f), "utf8");
  const currencySrc = read("src/lib/workspace/currency.ts");
  const modelSrc = read("src/lib/workspace/model.ts");
  assert.doesNotMatch(currencySrc, /^\s*import\b|\bimport\(|\brequire\(/m, "currency.ts has no imports");
  const modelImports = [...modelSrc.matchAll(/^import[\s\S]*?from\s+"([^"]+)";/gm)].map((m) => m[1]);
  assert.deepEqual(modelImports, ["./currency.ts"], "model.ts imports only ./currency.ts");
  assert.doesNotMatch(modelSrc, /\bimport\(|\brequire\(/);

  // Direct map access: only the model, the projection rebuild (workspaceFromProjection) and the INR sample data.
  const mapAccess = /\.(?:invoices|recurring)\[|Object\.(?:keys|values|entries)\([^)]*\.(?:invoices|recurring)\)/;
  for (const file of walk(join(projectRoot, "src")).filter((f) => /\.(ts|tsx|astro|mjs)$/.test(f))) {
    const name = rel(file);
    if (name === "src/lib/workspace/model.ts" || name === "src/lib/workspace/sample.ts") continue;
    let text = readFileSync(file, "utf8");
    if (name === "src/lib/workspace/digest.ts") {
      const start = text.indexOf("export function workspaceFromProjection");
      assert.ok(start >= 0);
      text = text.slice(0, start) + text.slice(text.indexOf("\n}\n", start));
    }
    assert.doesNotMatch(text, mapAccess, `${name} must read invoices and plans through the model helpers (getInvoice, liveInvoices, allLiveInvoices, planMonths)`);
  }
  const generate = modelSrc.split("export function generateRecurring")[1].split("\n}\n")[0];
  assert.doesNotMatch(generate, /next\.invoices\[/, "generateRecurring checks both maps (getInvoice), tombstones included");
  assert.match(generate, /if \(getInvoice\(next, id\)\) continue;/);

  // Integer money: no "* 100" on amounts and no "/ 100" except Math.floor/trunc(… / 100) in workspace code.
  // The one exception (spec §9.2) is a CSS percentage, which is no amount: the aging bar's width.
  const allowedHundred = new Map([
    ["src/components/workspace/PaymentsWorkspace.tsx", [/style=\{\{ width: `\$\{\(b\.balancePaise \/ maxBucket\) \* 100\}%` \}\}/]],
  ]);
  for (const file of [...walk(join(projectRoot, "src/lib/workspace")), ...walk(join(projectRoot, "src/components/workspace"))].filter((f) => /\.(ts|tsx)$/.test(f))) {
    const name = rel(file);
    readFileSync(file, "utf8").split("\n").forEach((line, n) => {
      const code = line.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, "");
      if (!/\*\s*100\b|\/\s*100\b/.test(code)) return;
      const cleaned = code.replace(/Math\.(?:floor|trunc)\(\s*[\w.]+\s*\/\s*100\s*\)/g, "");
      if (!/\*\s*100\b|\/\s*100\b/.test(cleaned)) return;
      assert.ok((allowedHundred.get(name) ?? []).some((re) => re.test(line)), `${name}:${n + 1} converts money through * 100 or / 100: ${line.trim()}`);
    });
  }
  assert.doesNotMatch(currencySrc, /\*\s*100\b/, "currency.ts builds minor units from strings, never by multiplying");

  // Storage: only writeBookKeys writes a book key; the sidecar is owner-tagged and joined only for its account.
  const store = read("src/lib/workspace/localStore.ts");
  // The only other writes put back bytes the failed switch read from those keys (old or new code wrote them).
  const writers = store.replace(/function writeBookKeys[\s\S]*?\n}\n/, "").replaceAll("putVerified(bookKey(m.id), m.raw)", "").replace("putVerified(WORKSPACE_KEY, primaryRaw)", "");
  assert.doesNotMatch(writers, /put(?:Verified)?\(\s*(?:bookKey\(|WORKSPACE_KEY)/, "book keys are written only through writeBookKeys");
  assert.match(store, /canonicalJson\(withoutIntl\(pruned\)\)/, "a book key never holds intl");
  assert.match(store, /\{ owner: get\(OWNER_KEY\), intl: pruned\.intl \}/, "sidecars record the account that wrote them");
  assert.match(store, /if \(sidecarJoins\(side\.owner\)\) return side\.intl;/, "another account's sidecar is never joined");
  assert.match(store, /JSON\.stringify\(\{ \.\.\.meta, workspace: withoutIntl\(workspace\) \}\)/, "the set-aside key older code lists never holds intl");
  assert.doesNotMatch(store, /put(?:Verified)?\(\s*`\$\{ASIDE_PREFIX\}/, "set-aside copies are written only through putAside");
  // Sync: every comparison with the server's copy goes through sameAsServer.
  assert.doesNotMatch(syncClient.replace(/const sameAsServer = [^\n]*\n/, ""), /[!=]==\s*lastJson|lastJson\s*[!=]==\s*canonicalJson/, "compare with the server's copy only through sameAsServer");
  assert.match(syncClient, /const sameAsServer = \(ws: Workspace\) => canonicalJson\(serverKeepsIntl \? ws : withoutIntl\(ws\)\) === lastJson;/);
  // Server view builders: INR-only until they render foreign records (pay page, statements, digest), and replies say intl: 1.
  const paylinksSrc = read("src/lib/workspace/paylinks.ts");
  assert.match(paylinksSrc, /if \(!invoice \|\| invoice\.deletedAt \|\| currencyOf\(invoice\) !== "INR"\) return null;/, "payPageView refuses foreign invoices");
  assert.match(paylinksSrc, /if \(!client \|\| client\.deletedAt \|\| hasOpenForeign\(ws, clientId\)\) return null;/, "statementView refuses clients with open foreign invoices");
  assert.match(read("src/lib/workspace/digest.ts"), /const open = liveInvoices\(ws\)[\s\S]*const plans = liveRecurring\(ws\)/, "the projection reads INR records only");
  assert.match(handlerOf(workspaceApi, "GET"), /intl: 1/);
  assert.match(handlerOf(workspaceApi, "PUT"), /intl: 1/);
  assert.equal((read("src/lib/workspace/booksApi.ts").match(/businessId: id, intl: 1/g) ?? []).length, 2, "book GET and PUT replies carry intl: 1");
  assert.match(read("src/lib/workspace/cloud.ts"), /pruneTombstones\(repairIntl\(mergeWorkspaces\(serverCopy, clientCopy\), now\), now\)/, "the server repairs old clients' erases and deletes");
}

console.log("[security] URL validation, money parsing, route ownership guards, and removed demo paths, early-access, workspace-sync, pay-link, billing, push, admin, MCP, and multi-business guards passed");
