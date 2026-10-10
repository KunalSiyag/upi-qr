// End-to-end browser suites for the payments workspace, pay links, billing and PWA.
//
//   npx astro build && npm run test:e2e
//
// Starts: fake Upstash REST (127.0.0.1:8799), static server for the production
// build (:4400), and `astro dev` (:4321) pointed at the fake KV with fake
// Razorpay settings. Nothing here talks to production KV, Clerk, or Razorpay.
// Needs google-chrome and python3 on PATH.
import { spawn, spawnSync } from "node:child_process";
import { createECDH } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const STATIC_DIR = join(ROOT, ".vercel", "output", "static");
const SUITES = [
  "waitlist-e2e", "workspace-e2e", "bridge-e2e", "sync-e2e", "paylink-ui-e2e",
  "plan-ui-e2e", "activation-e2e", "statement-e2e", "recurring-e2e", "hindi-e2e", "conversion-e2e", "pwa-e2e", "push-ui-e2e", "paylink-e2e", "billing-e2e", "push-e2e", "metrics-e2e", "statement-link-e2e",
];
const PROD = process.argv.includes("--prod");
const only = process.argv.slice(2).filter((a) => a !== "--prod");
// --prod runs the server-backed suites against the real production bundle (scripts/e2e/prod-server.mjs).
const SERVER_SUITES = ["waitlist-e2e", "paylink-e2e", "billing-e2e", "push-e2e", "metrics-e2e", "statement-link-e2e", "load-paypage", "load-digest"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!existsSync(join(STATIC_DIR, "app", "index.html"))) {
  console.error("Run `npx astro build` first (missing .vercel/output/static/app/index.html).");
  process.exit(1);
}

// Throwaway VAPID keys + cron secret for this run; suites read them from the environment.
const vapid = createECDH("prime256v1");
vapid.generateKeys();
process.env.E2E_VAPID_PUBLIC_KEY = vapid.getPublicKey().toString("base64url");
process.env.E2E_VAPID_PRIVATE_KEY = vapid.getPrivateKey().toString("base64url");
process.env.E2E_CRON_SECRET = "cron-secret-for-e2e";

const children = [];
function start(cmd, args, env = {}) {
  const child = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: "ignore" });
  children.push(child);
  return child;
}
async function waitFor(url, ms = 90_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { if ((await fetch(url)).status < 500) return true; } catch { /* not up yet */ }
    await sleep(500);
  }
  throw new Error(`timed out waiting for ${url}`);
}
function stopAll() {
  spawnSync("npx", ["astro", "dev", "stop"], { cwd: ROOT, stdio: "ignore" });
  for (const child of children) child.kill();
}
process.on("SIGINT", () => { stopAll(); process.exit(130); });

let failed = 0;
let passed = 0;
try {
  start("node", [join(HERE, "fake-upstash.mjs")]);
  start("python3", ["-m", "http.server", "4400", "--directory", STATIC_DIR]);
  const serverEnv = {
    KV_REST_API_URL: "http://127.0.0.1:8799",
    KV_REST_API_TOKEN: "test-token",
    RAZORPAY_KEY_ID: "rzp_test_fake",
    RAZORPAY_KEY_SECRET: "fake_secret",
    RAZORPAY_WEBHOOK_SECRET: "whsec_test",
    RAZORPAY_PLAN_MONTHLY: "plan_month",
    RAZORPAY_PLAN_YEARLY: "plan_year",
    VAPID_PUBLIC_KEY: process.env.E2E_VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY: process.env.E2E_VAPID_PRIVATE_KEY,
    CRON_SECRET: process.env.E2E_CRON_SECRET,
  };
  if (PROD) {
    if (!existsSync(join(ROOT, ".vercel/output/functions/_render.func"))) throw new Error("No production function bundle; run npx astro build");
    start("node", [join(HERE, "prod-server.mjs")], { ...serverEnv, PORT: "4500" });
    process.env.DEV_BASE = "http://localhost:4500";
    process.env.E2E_MODE = "prod";
  } else {
    start("npx", ["astro", "dev", "--port", "4321"], serverEnv);
  }
  await waitFor("http://127.0.0.1:8799/__admin/health");
  await waitFor("http://localhost:4400/app/");
  await waitFor(PROD ? "http://localhost:4500/pricing/" : "http://localhost:4321/pricing/");
  if (PROD) {
    const config = JSON.parse(readFileSync(join(ROOT, ".vercel/output/config.json"), "utf8"));
    const cronOk = (config.crons ?? []).some((c) => c.path === "/api/cron/digest/" && c.schedule === "30 3 * * *");
    console.log(`${cronOk ? "✓" : "✗"} build output schedules /api/cron/digest/ at 09:00 IST`);
    if (!cronOk) failed += 1;
  }

  // On-demand extras (not in the default run): node scripts/e2e/run.mjs load-digest
  const EXTRAS = ["load-digest", "load-paypage"];
  for (const suite of [...SUITES, ...EXTRAS].filter((s) => (only.length ? only.includes(s) : SUITES.includes(s)) && (!PROD || SERVER_SUITES.includes(s)))) {
    const result = spawnSync("node", [join(HERE, `${suite}.mjs`)], { cwd: HERE, encoding: "utf8", timeout: 600_000 });
    const lines = `${result.stdout}${result.stderr}`.split("\n");
    const p = lines.filter((l) => l.startsWith("PASS")).length;
    const f = lines.filter((l) => l.startsWith("FAIL"));
    passed += p;
    failed += f.length + (result.status !== 0 && f.length === 0 ? 1 : 0);
    console.log(`${f.length || result.status ? "✗" : "✓"} ${suite}: ${p} passed${f.length ? `, ${f.length} failed` : ""}`);
    for (const line of f) console.log(`    ${line}`);
    if (EXTRAS.includes(suite)) for (const line of lines.filter((l) => l.trim() && !l.startsWith("PASS") && !l.startsWith("FAIL"))) console.log(`    ${line}`);
  }
} catch (error) {
  console.error(String(error));
  failed += 1;
} finally {
  stopAll();
}
console.log(`\n[e2e] ${passed} checks passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
