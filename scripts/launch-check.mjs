// Launch readiness check. Never prints secret values.
//
//   npm run launch:check                       # reads process env + .env.local
//   npm run launch:check -- --env .env.production.local --online
//
// --online also pings Vercel KV, reads your Dodo Payments products (or Razorpay
// plans) to confirm they charge exactly what /pricing/ shows, and probes the live
// webhook URLs. Get production env locally with:
//   vercel env pull .env.production.local --environment=production
import { createECDH } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { matchesPrice } from "./dodo-products.mjs";

const ROOT = new URL("../", import.meta.url).pathname;
const args = process.argv.slice(2);
const online = args.includes("--online");
const envFile = args.includes("--env") ? args[args.indexOf("--env") + 1] : ".env.local";

const envPath = isAbsolute(envFile) ? envFile : join(ROOT, envFile);
const env = { ...process.env };
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}
const val = (k) => (env[k] ?? "").trim();

let failures = 0;
let warnings = 0;
const ok = (msg) => console.log(`  ✓ ${msg}`);
const warn = (msg) => { warnings++; console.log(`  ⚠ ${msg}`); };
const fail = (msg) => { failures++; console.log(`  ✗ ${msg}`); };
const section = (title) => console.log(`\n${title}`);

console.log(`Launch check — env from ${existsSync(envPath) ? envFile : "process environment only"}${online ? " (online checks on)" : ""}`);

section("Accounts (Clerk)");
const pk = val("PUBLIC_CLERK_PUBLISHABLE_KEY");
const sk = val("CLERK_SECRET_KEY");
if (!pk || !sk) fail("PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY are required for sign-in, sync, pay links and billing");
else if (pk.startsWith("pk_live_") && sk.startsWith("sk_live_")) ok("Clerk production keys present");
else warn("Clerk keys are development/test keys (pk_test_/sk_test_) — use the production instance for launch");
// The publishable key encodes the Frontend API host (public: it ships in every page). The CSP must allow it.
const fapi = pk ? Buffer.from(pk.replace(/^pk_(test|live)_/, ""), "base64").toString().replace(/\$$/, "") : "";
if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(fapi)) {
  const csp = (JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8")).headers ?? [])
    .find((h) => h.source === "/((?!embed).*)")?.headers.find((x) => x.key === "Content-Security-Policy")?.value ?? "";
  const directive = (name) => csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(`${name} `)) ?? "";
  const allows = (name) => directive(name).split(/\s+/).some((source) => {
    const host = /^https:\/\/([^/:]+)(?::[\d*]+)?$/.exec(source)?.[1];
    return host !== undefined && (host.startsWith("*.") ? fapi.endsWith(host.slice(1)) : fapi === host);
  });
  allows("script-src") && allows("connect-src")
    ? ok(`CSP allows Clerk's frontend API (${fapi})`)
    : fail(`CSP doesn't allow https://${fapi} in script-src and connect-src — sign-in would break. Add it in vercel.json and src/middleware.ts`);
} else if (pk) fail("PUBLIC_CLERK_PUBLISHABLE_KEY doesn't decode to a Clerk frontend API host — check the value");

section("Database (Vercel KV)");
const kvUrl = val("KV_REST_API_URL");
const kvToken = val("KV_REST_API_TOKEN");
if (!kvUrl || !kvToken) fail("KV_REST_API_URL / KV_REST_API_TOKEN missing (connect a KV / Upstash database in Vercel → Storage)");
else {
  ok("KV credentials present");
  if (online) {
    try {
      const res = await fetch(kvUrl.replace(/\/$/, ""), { method: "POST", headers: { Authorization: `Bearer ${kvToken}` }, body: JSON.stringify(["PING"]) });
      const body = await res.json().catch(() => ({}));
      res.ok && body.result === "PONG" ? ok("KV reachable (PING → PONG)") : fail(`KV ping failed (HTTP ${res.status})`);
    } catch { fail("KV unreachable from this machine"); }
  }
}

const pricingSource = readFileSync(join(ROOT, "src/data/pricing.ts"), "utf8");
const expected = {
  monthly: Number(/monthly: \{ paise: ([\d_]+)/.exec(pricingSource)?.[1].replace(/_/g, "")),
  yearly: Number(/yearly: \{ paise: ([\d_]+)/.exec(pricingSource)?.[1].replace(/_/g, "")),
};

/** One unsigned POST to the exact URL the provider will call (shows once as webhook_rejected in /admin/metrics/). */
async function probeWebhook(url) {
  try {
    const res = await fetch(url, { method: "POST", redirect: "manual", headers: { "Content-Type": "application/json" }, body: "{}" });
    if (res.status === 401) ok(`Live webhook URL is deployed and rejects unsigned calls (401)`);
    else if (res.status === 503) fail("Live webhook URL is deployed, but this provider isn't configured in the Production environment (503)");
    else if (res.status >= 300 && res.status < 400) fail(`Live webhook URL redirects (HTTP ${res.status}); a redirect counts as a failed delivery`);
    else fail(`Live webhook URL returned HTTP ${res.status}; deploy the billing code to production first`);
  } catch { fail(`Couldn't reach ${url}`); }
}

const dodoKeys = ["DODO_PAYMENTS_API_KEY", "DODO_PAYMENTS_WEBHOOK_KEY", "DODO_PRODUCT_MONTHLY", "DODO_PRODUCT_YEARLY"];
const dodoPresent = dodoKeys.filter((k) => val(k));
const dodoOn = dodoPresent.length === dodoKeys.length;
const rzp = ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET", "RAZORPAY_PLAN_MONTHLY", "RAZORPAY_PLAN_YEARLY"];
const present = rzp.filter((k) => val(k));
const billingOn = dodoOn || present.length === rzp.length;

section("Pro billing (Dodo Payments — merchant of record, takes new checkouts)");
if (dodoPresent.length === 0) {
  present.length === rzp.length
    ? ok("Dodo Payments not configured — new checkouts go through Razorpay")
    : warn("Billing is off — /pricing/ and Settings show a Pro early-access form instead of checkout. Set up Dodo: npm run dodo:products -- --env FILE --create");
} else if (!dodoOn) fail(`Dodo half-configured: missing ${dodoKeys.filter((k) => !val(k)).join(", ")}`);
else {
  const mode = val("DODO_PAYMENTS_ENVIRONMENT") === "live_mode" ? "live_mode" : "test_mode";
  ok(`All Dodo Payments settings present (${mode})`);
  if (val("DODO_PAYMENTS_ENVIRONMENT") && !["live_mode", "test_mode"].includes(val("DODO_PAYMENTS_ENVIRONMENT"))) fail("DODO_PAYMENTS_ENVIRONMENT must be live_mode or test_mode");
  if (mode !== "live_mode") warn("Dodo is in test mode — live payments need DODO_PAYMENTS_ENVIRONMENT=live_mode with a live API key, live products and the live webhook's secret");
  const whsec = val("DODO_PAYMENTS_WEBHOOK_KEY");
  /^whsec_[A-Za-z0-9+/]+={0,2}$/.test(whsec) && Buffer.from(whsec.slice(6), "base64").length >= 24
    ? ok("DODO_PAYMENTS_WEBHOOK_KEY looks like a signing secret (whsec_…)")
    : fail("DODO_PAYMENTS_WEBHOOK_KEY should be the endpoint's signing secret, starting whsec_ (Developer → Webhooks → your endpoint)");
  for (const key of ["DODO_PRODUCT_MONTHLY", "DODO_PRODUCT_YEARLY"]) {
    if (!/^pdt_[A-Za-z0-9]{6,64}$/.test(val(key))) fail(`${key} should be a Dodo product id (pdt_…) — get them with npm run dodo:products`);
  }
  if (online) {
    const host = mode === "live_mode" ? "https://live.dodopayments.com" : "https://test.dodopayments.com";
    for (const [interval, key] of [["monthly", "DODO_PRODUCT_MONTHLY"], ["yearly", "DODO_PRODUCT_YEARLY"]]) {
      try {
        const res = await fetch(`${host}/products/${encodeURIComponent(val(key))}`, { headers: { Authorization: `Bearer ${val("DODO_PAYMENTS_API_KEY")}` } });
        const product = await res.json().catch(() => ({}));
        if (res.status === 401) { fail(`${key}: Dodo rejected the API key (401) — is DODO_PAYMENTS_ENVIRONMENT=${mode} the key's mode?`); continue; }
        if (!res.ok) { fail(`${key}: Dodo returned HTTP ${res.status}`); continue; }
        const p = product?.price ?? {};
        matchesPrice({ price_detail: p }, interval, expected[interval])
          ? ok(`${key} charges ₹${p.price / 100} ${interval}, GST included — matches /pricing/`)
          : fail(`${key} is ${p.currency} ${p.price / 100} every ${p.payment_frequency_count} ${p.payment_frequency_interval} (tax_inclusive: ${p.tax_inclusive}${Number(p.discount_bps) > 0 ? `, ${p.discount_bps / 100}% off` : ""}); /pricing/ shows ₹${expected[interval] / 100} ${interval} GST included — get matching ids with npm run dodo:products`);
      } catch { fail(`${key}: couldn't reach Dodo Payments`); }
    }
    await probeWebhook("https://www.proupiqr.in/api/billing/dodo-webhook/");
  }
  console.log("    Webhook URL: https://www.proupiqr.in/api/billing/dodo-webhook/");
  console.log("      exactly this: www and the trailing slash (proupiqr.in and the no-slash path redirect, and a redirect is a failed delivery)");
  console.log("    Events: subscription.active, renewed, on_hold, failed, cancelled, expired, plan_changed, updated;");
  console.log("      for sponsor bookings also payment.succeeded, payment.failed, refund.succeeded, dispute.opened");
  console.log("    Test and live mode each have their own API key, products and webhook secret; all four must come from the same mode.");
}

section("Sponsor bookings (/sponsor/, same Dodo account and webhook)");
{
  const keys = ["DODO_PRODUCT_SPONSOR_FEATURED", "DODO_PRODUCT_SPONSOR_TILE"];
  const set = keys.filter((k) => val(k));
  if (!dodoOn) warn("Online sponsor booking is closed until Dodo Payments is configured; /sponsor/ asks sponsors to email instead");
  else if (set.length === 0) warn("Online sponsor booking is closed — create the products with npm run dodo:sponsor-products -- --env FILE --create, then set DODO_PRODUCT_SPONSOR_FEATURED and DODO_PRODUCT_SPONSOR_TILE");
  else if (set.length < keys.length) fail(`Sponsor products half-configured: missing ${keys.filter((k) => !val(k)).join(", ")}`);
  else {
    for (const key of keys) if (!/^pdt_[A-Za-z0-9]{8,40}$/.test(val(key))) fail(`${key} should be a Dodo product id (pdt_…)`);
    const ids = [...keys, "DODO_PRODUCT_MONTHLY", "DODO_PRODUCT_YEARLY"].map(val);
    if (new Set(ids).size !== ids.length) fail("The sponsor and Pro product ids must all differ: a shared id sends Pro's subscription events to sponsorships, where they're dropped (booking stays closed until fixed)");
    ok("Sponsor products set: /sponsor/ takes bookings; review paid ones at /admin/sponsors/ (needs ADMIN_USER_IDS)");
    if (!val("ADMIN_USER_IDS")) fail("ADMIN_USER_IDS is empty: nobody can approve sponsor bookings at /admin/sponsors/");
  }
}

section("Pro billing (Razorpay — optional fallback)");
if (present.length === 0) ok(dodoOn ? "Razorpay not configured (not needed while Dodo takes checkouts)" : "Razorpay not configured");
else if (present.length < rzp.length) fail(`Razorpay half-configured: missing ${rzp.filter((k) => !val(k)).join(", ")}`);
else {
  ok(dodoOn ? "All Razorpay settings present — renews existing Razorpay subscriptions; new checkouts use Dodo" : "All Razorpay settings present");
  if (!val("RAZORPAY_KEY_ID").startsWith("rzp_live_")) warn("RAZORPAY_KEY_ID is a test key — live payments need rzp_live_ keys");
  if (val("RAZORPAY_WEBHOOK_SECRET").length < 16) warn("RAZORPAY_WEBHOOK_SECRET is short; use a long random secret");
  if (online) {
    const auth = `Basic ${Buffer.from(`${val("RAZORPAY_KEY_ID")}:${val("RAZORPAY_KEY_SECRET")}`).toString("base64")}`;
    for (const [interval, key] of [["monthly", "RAZORPAY_PLAN_MONTHLY"], ["yearly", "RAZORPAY_PLAN_YEARLY"]]) {
      try {
        const res = await fetch(`https://api.razorpay.com/v1/plans/${encodeURIComponent(val(key))}`, { headers: { Authorization: auth } });
        const plan = await res.json().catch(() => ({}));
        if (!res.ok) { fail(`${key}: Razorpay returned HTTP ${res.status}`); continue; }
        const amount = plan?.item?.amount;
        const periodOk = plan?.period === interval && Number(plan?.interval) === 1;
        amount === expected[interval] && periodOk && plan?.item?.currency === "INR"
          ? ok(`${key} charges ₹${amount / 100} ${interval} — matches /pricing/`)
          : fail(`${key} is ₹${amount / 100} every ${plan?.interval} ${plan?.period} (${plan?.item?.currency}); /pricing/ shows ₹${expected[interval] / 100} ${interval} — get matching ids with npm run razorpay:plans`);
      } catch { fail(`${key}: couldn't reach Razorpay`); }
    }
    await probeWebhook("https://www.proupiqr.in/api/billing/razorpay-webhook/");
  }
  console.log("    Webhook URL: https://www.proupiqr.in/api/billing/razorpay-webhook/ (www and the trailing slash)");
  console.log("    Events: subscription.* (activated, charged, pending, halted, cancelled, completed, paused, resumed)");
  console.log("    Test and live mode each have their own webhook and secret; RAZORPAY_WEBHOOK_SECRET must match the mode of RAZORPAY_KEY_ID.");
}

section("Morning reminders (Web Push + cron)");
const vpub = val("VAPID_PUBLIC_KEY");
const vpriv = val("VAPID_PRIVATE_KEY");
if (!vpub && !vpriv) warn("Notifications are off — generate keys with: node scripts/generate-vapid-keys.mjs");
else if (!vpub || !vpriv) fail("Set both VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY");
else {
  try {
    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(Buffer.from(vpriv, "base64url"));
    ecdh.getPublicKey().toString("base64url") === vpub ? ok("VAPID key pair is valid and matches") : fail("VAPID_PUBLIC_KEY does not belong to VAPID_PRIVATE_KEY");
  } catch { fail("VAPID_PRIVATE_KEY is not a valid P-256 key"); }
  const subject = val("VAPID_SUBJECT") || "mailto:support@proupiqr.in";
  /^(mailto:|https:)/.test(subject) ? ok(`VAPID subject ${subject}`) : fail("VAPID_SUBJECT must start with mailto: or https:");
}
const cron = val("CRON_SECRET");
if (!cron) (vpub || billingOn ? fail : warn)("CRON_SECRET missing — the 09:00 cron (billing reconcile + morning digest) refuses to run without it");
else cron.length >= 24 ? ok("CRON_SECRET set") : fail("CRON_SECRET is too short (use 32+ random characters)");

section("Founder metrics");
const admins = (val("ADMIN_USER_IDS")).split(",").map((s) => s.trim()).filter((s) => /^user_[A-Za-z0-9]{6,64}$/.test(s));
admins.length ? ok(`${admins.length} admin user id(s) for /admin/metrics/`) : warn("ADMIN_USER_IDS empty — /admin/metrics/ will 404 for everyone (find your id in Clerk → Users)");

section("Payment provider website review (needed for live mode)");
{
  const statics = join(ROOT, ".vercel/output/static");
  const pages = ["about", "contact", "pricing", "terms", "privacy", "refund-policy", "shipping-policy"];
  const missing = pages.filter((p) => !existsSync(join(statics, p, "index.html")));
  if (!existsSync(statics)) warn("No build output yet — run npx astro build first");
  else if (missing.length) fail(`Policy pages missing from the build: ${missing.map((p) => `/${p}/`).join(", ")}`);
  else {
    const home = readFileSync(join(statics, "index.html"), "utf8");
    const unlinked = ["contact", "pricing", "terms", "privacy", "refund-policy"].filter((p) => !home.includes(`href="/${p}/"`));
    unlinked.length ? fail(`Footer doesn't link ${unlinked.map((p) => `/${p}/`).join(", ")}`) : ok("About, Contact, Pricing, Terms, Privacy, Refund and Shipping pages built and linked site-wide");
  }
  const business = readFileSync(join(ROOT, "src/data/business.ts"), "utf8");
  const blank = ["phone", "address"].filter((field) => new RegExp(`^\\s*${field}: null`, "m").test(business));
  if (blank.length) warn(`No ${blank.join(" or ")} in src/data/business.ts — payment providers' reviewers usually ask for a phone number and an operational address on the contact page`);
  else ok("Contact page shows a phone number and address");
  console.log("    Reviewers may also ask for test login details, because upgrading needs sign-in.");
}

section("Build output");
const config = join(ROOT, ".vercel/output/config.json");
if (!existsSync(config)) warn("No build output yet — run npx astro build first");
else {
  const c = JSON.parse(readFileSync(config, "utf8"));
  // Vercel reads vercel.json "crons" at deploy time; the same job in the build output fails the deploy as a duplicate.
  const digest = (list) => (list ?? []).filter((x) => x.path === "/api/cron/digest/");
  const scheduled = digest(JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8")).crons);
  if (scheduled.length !== 1) fail(`vercel.json must schedule /api/cron/digest/ exactly once (found ${scheduled.length})`);
  else if (digest(c.crons).length) fail("Build output also defines the digest cron — Vercel rejects the duplicate; keep it only in vercel.json");
  else ok(`Cron /api/cron/digest/ in vercel.json (${scheduled[0].schedule} UTC = 09:00 IST): billing reconcile, then morning digest`);
  const statics = join(ROOT, ".vercel/output/static");
  ["sw.js", "app.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "app/index.html", "pricing/index.html", "payment-tracker/index.html"]
    .every((f) => existsSync(join(statics, f))) ? ok("App shell, manifest, icons and pricing pages built") : fail("Missing built app assets — rebuild");
}

console.log(`\n${failures ? `✗ ${failures} blocker(s)` : "✓ No blockers"}${warnings ? `, ⚠ ${warnings} warning(s)` : ""}.`);
console.log("Still do by hand: one real sign-in on production; one full Pro upgrade in Dodo test mode on a preview deployment (test API key, test products, a test-mode webhook pointing at that preview); and confirm Vercel → Settings → Cron Jobs lists /api/cron/digest/ after deploying.");
process.exit(failures ? 1 : 0);
