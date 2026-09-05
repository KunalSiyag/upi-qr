import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  formatPaise,
  isTrustedMutation,
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

console.log("[security] URL validation, money parsing, route ownership guards, and removed demo paths passed");
