// End-to-end browser suites for the payments workspace, pay links, billing and PWA.
//
//   npx astro build && npm run test:e2e
//
// Starts: fake Upstash REST (127.0.0.1:8799), static server for the production
// build (:4400), and `astro dev` (first free port from :4321) pointed at the fake KV with fake
// Dodo Payments + Razorpay settings. Nothing here talks to production KV, Clerk,
// Dodo Payments or Razorpay.
// Needs google-chrome and python3 on PATH.
import { spawn, spawnSync } from "node:child_process";
import { createECDH, generateKeyPairSync } from "node:crypto";
import { connect } from "node:net";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const STATIC_DIR = join(ROOT, ".vercel", "output", "static");
const SUITES = [
  "waitlist-e2e", "workspace-e2e", "bridge-e2e", "sync-e2e", "paylink-ui-e2e",
  "plan-ui-e2e", "activation-e2e", "statement-e2e", "recurring-e2e", "hindi-e2e", "conversion-e2e", "pwa-e2e", "push-ui-e2e", "paylink-e2e", "billing-e2e", "push-e2e", "metrics-e2e", "statement-link-e2e", "mcp-e2e",
  "books-server-e2e", "books-client-e2e", "books-e2e", "currency-e2e",
];
const PROD = process.argv.includes("--prod");
const only = process.argv.slice(2).filter((a) => a !== "--prod");
// --prod runs the server-backed suites against the real production bundle (scripts/e2e/prod-server.mjs).
const SERVER_SUITES = ["waitlist-e2e", "paylink-e2e", "billing-e2e", "push-e2e", "metrics-e2e", "statement-link-e2e", "mcp-e2e", "books-server-e2e", "load-paypage", "load-digest"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Another project's dev server may hold :4321 (it happened); take the first port nothing answers on.
const portBusy = (port) => new Promise((resolve) => {
  const socket = connect({ port, host: "localhost" });
  socket.once("connect", () => { socket.destroy(); resolve(true); });
  socket.once("error", () => resolve(false));
});
async function freePort(start) {
  for (let port = start; port < start + 50; port++) if (!(await portBusy(port))) return port;
  throw new Error(`no free port from ${start}`);
}

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
process.env.E2E_DODO_WEBHOOK_KEY = `whsec_${Buffer.from("proupiqr-e2e-dodo-signing-key-32").toString("base64")}`;
// Throwaway session-signing key: the server verifies Clerk session tokens with its public half
// (Clerk's networkless CLERK_JWT_KEY), so server suites can sign in without Clerk's network.
const sessionKeys = generateKeyPairSync("rsa", { modulusLength: 2048 });
process.env.E2E_JWT_PRIVATE_KEY = sessionKeys.privateKey.export({ type: "pkcs8", format: "pem" });
const sessionPublicKey = sessionKeys.publicKey.export({ type: "spki", format: "pem" });

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
// SIGTERM too: a harness or `timeout` stops runs that way.
for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143]]) process.on(signal, () => { stopAll(); process.exit(code); });

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
    DODO_PAYMENTS_API_KEY: "dodo_test_fake",
    DODO_PAYMENTS_WEBHOOK_KEY: process.env.E2E_DODO_WEBHOOK_KEY,
    DODO_PRODUCT_MONTHLY: "pdt_E2eMonthly000000000",
    DODO_PRODUCT_YEARLY: "pdt_E2eYearly0000000000",
    VAPID_PUBLIC_KEY: process.env.E2E_VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY: process.env.E2E_VAPID_PRIVATE_KEY,
    CRON_SECRET: process.env.E2E_CRON_SECRET,
    CLERK_JWT_KEY: sessionPublicKey,
  };
  if (PROD) {
    if (!existsSync(join(ROOT, ".vercel/output/functions/_render.func"))) throw new Error("No production function bundle; run npx astro build");
    start("node", [join(HERE, "prod-server.mjs")], { ...serverEnv, PORT: "4500" });
    process.env.DEV_BASE = "http://localhost:4500";
    process.env.E2E_MODE = "prod";
  } else {
    const port = await freePort(4321);
    process.env.DEV_BASE = `http://localhost:${port}`;
    // Run astro directly (not via npx) so stopAll's kill reaches the dev server itself.
    start(join(ROOT, "node_modules", ".bin", "astro"), ["dev", "--port", String(port), "--ignore-lock"], serverEnv);
  }
  await waitFor("http://127.0.0.1:8799/__admin/health");
  await waitFor("http://localhost:4400/app/");
  await waitFor(`${process.env.DEV_BASE}/pricing/`);
  if (PROD) {
    // Vercel applies vercel.json "crons" at deploy time; a copy in the build output is a duplicate and fails the deploy.
    const vercelJson = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8"));
    const config = JSON.parse(readFileSync(join(ROOT, ".vercel/output/config.json"), "utf8"));
    const digest = (list) => (list ?? []).filter((c) => c.path === "/api/cron/digest/");
    const cronOk = digest(vercelJson.crons).length === 1 && digest(vercelJson.crons)[0].schedule === "30 3 * * *" && digest(config.crons).length === 0;
    console.log(`${cronOk ? "✓" : "✗"} vercel.json schedules /api/cron/digest/ once at 09:00 IST, not duplicated in the build output`);
    if (!cronOk) failed += 1;
    // MCP clients that drop the slash and directory OAuth probes must not hit the adapter's trailing-slash 308.
    const redirectAt = config.routes.findIndex((route) => route.status === 308);
    const routeAt = (src) => config.routes.findIndex((route) => route.src === src);
    const mcpOk = routeAt("^/mcp$") > -1 && routeAt("^/mcp$") < redirectAt
      && config.routes[routeAt("^/mcp$")].dest === "/mcp/"
      && routeAt("^/mcp/\\.well-known(?:/.*)?$") > -1 && routeAt("^/mcp/\\.well-known(?:/.*)?$") < redirectAt;
    console.log(`${mcpOk ? "✓" : "✗"} /mcp and /mcp/.well-known/* are routed before the trailing-slash redirect`);
    if (!mcpOk) failed += 1;
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
