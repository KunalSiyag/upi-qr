// Launch readiness check. Never prints secret values.
//
//   npm run launch:check                       # reads process env + .env.local
//   npm run launch:check -- --env .env.production.local --online
//
// --online also pings Vercel KV and reads your Razorpay plans to confirm they
// charge exactly what /pricing/ shows. Get production env locally with:
//   vercel env pull .env.production.local --environment=production
import { createECDH } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

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

section("Pro billing (Razorpay)");
const rzp = ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET", "RAZORPAY_PLAN_MONTHLY", "RAZORPAY_PLAN_YEARLY"];
const present = rzp.filter((k) => val(k));
if (present.length === 0) warn("Billing is off — /pricing/ and Settings show a Pro early-access form instead of checkout");
else if (present.length < rzp.length) fail(`Billing half-configured: missing ${rzp.filter((k) => !val(k)).join(", ")}`);
else {
  ok("All Razorpay settings present");
  if (!val("RAZORPAY_KEY_ID").startsWith("rzp_live_")) warn("RAZORPAY_KEY_ID is a test key — live payments need rzp_live_ keys");
  if (val("RAZORPAY_WEBHOOK_SECRET").length < 16) warn("RAZORPAY_WEBHOOK_SECRET is short; use a long random secret");
  if (online) {
    const pricing = readFileSync(join(ROOT, "src/data/pricing.ts"), "utf8");
    const expected = {
      monthly: Number(/monthly: \{ paise: ([\d_]+)/.exec(pricing)?.[1].replace(/_/g, "")),
      yearly: Number(/yearly: \{ paise: ([\d_]+)/.exec(pricing)?.[1].replace(/_/g, "")),
    };
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
          : fail(`${key} is ₹${amount / 100} every ${plan?.interval} ${plan?.period} (${plan?.item?.currency}); /pricing/ shows ₹${expected[interval] / 100} ${interval}`);
      } catch { fail(`${key}: couldn't reach Razorpay`); }
    }
  }
  console.log("    Webhook URL: https://www.proupiqr.in/api/billing/razorpay-webhook/");
  console.log("      exactly this: www and the trailing slash (proupiqr.in and the no-slash path redirect, and a redirect is a failed delivery)");
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
if (!cron) (vpub ? fail : warn)("CRON_SECRET missing — the 09:00 digest endpoint refuses to run without it");
else cron.length >= 24 ? ok("CRON_SECRET set") : fail("CRON_SECRET is too short (use 32+ random characters)");

section("Founder metrics");
const admins = (val("ADMIN_USER_IDS")).split(",").map((s) => s.trim()).filter((s) => /^user_[A-Za-z0-9]{6,64}$/.test(s));
admins.length ? ok(`${admins.length} admin user id(s) for /admin/metrics/`) : warn("ADMIN_USER_IDS empty — /admin/metrics/ will 404 for everyone (find your id in Clerk → Users)");

section("Build output");
const config = join(ROOT, ".vercel/output/config.json");
if (!existsSync(config)) warn("No build output yet — run npx astro build first");
else {
  const c = JSON.parse(readFileSync(config, "utf8"));
  (c.crons ?? []).some((x) => x.path === "/api/cron/digest/") ? ok("Cron /api/cron/digest/ scheduled in build output (03:30 UTC = 09:00 IST)") : fail("Build output has no digest cron");
  const statics = join(ROOT, ".vercel/output/static");
  ["sw.js", "app.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "app/index.html", "pricing/index.html", "payment-tracker/index.html"]
    .every((f) => existsSync(join(statics, f))) ? ok("App shell, manifest, icons and pricing pages built") : fail("Missing built app assets — rebuild");
}

console.log(`\n${failures ? `✗ ${failures} blocker(s)` : "✓ No blockers"}${warnings ? `, ⚠ ${warnings} warning(s)` : ""}.`);
console.log("Still do by hand: one real sign-in on production; one full Pro upgrade in Razorpay test mode on a preview deployment (test keys + test plans); and confirm Vercel → Settings → Cron Jobs lists /api/cron/digest/ after deploying.");
process.exit(failures ? 1 : 0);
