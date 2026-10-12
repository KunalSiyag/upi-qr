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

const syndicate = readFileSync(join(projectRoot, "scripts/syndicate-satellites.mjs"), "utf8");
assert.match(syndicate, /NEVER_SYNDICATE_SLUGS/);
assert.match(syndicate, /a4-bulk-upi-qr-sticker-sheet/);
assert.match(syndicate, /zero-mdr-merchant-upi-qr-2026/);
assert.match(syndicate, /Medium banned/);
assert.doesNotMatch(syndicate, /publishToMedium|MEDIUM_CONFIG/);

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
assert.match(mcpRoute, /recordMetric\("mcp_tool_call"\)/, "only an aggregate counter");
assert.doesNotMatch(mcpRoute, /locals|auth\(|clerk/i, "the connector never reads a signed-in session");
assert.match(mcpProtocol, /options\.allowedOrigins\.includes\(origin\)/, "browser origins are allow-listed (DNS rebinding guard)");
assert.match(mcpProtocol, /readLimitedText\(request, options\.maxBodyBytes \?\? 64 \* 1024\)/, "request bodies are capped");
assert.doesNotMatch(mcpProtocol, /["']Mcp-Session-Id["']\s*:/i, "no session id is ever sent");
assert.match(mcpProtocol, /readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false/);
assert.match(mcpTools, /`\$\{SITE\}\/#pay\?/, "poster links carry the payment after #, never in the query string");
assert.match(middleware, /PRIVATE_ROUTE_PREFIXES = \[[^\]]*"\/mcp"\]/, "the endpoint is noindex");
assert.doesNotMatch(middleware.match(/CLERK_ROUTE_PREFIXES = \[[^\]]*\]/)[0], /\/mcp/, "Clerk stays off /mcp/");

console.log("[security] URL validation, money parsing, route ownership guards, and removed demo paths, early-access, workspace-sync, pay-link, billing, push, admin, and MCP guards passed");
