// Finds or creates the Razorpay plans that charge exactly what /pricing/ shows,
// and prints the env lines to paste into Vercel. Never prints secrets.
//
//   npm run razorpay:plans -- --env .env.preview.local            # look only
//   npm run razorpay:plans -- --env .env.preview.local --create   # create missing plans (test keys)
//   npm run razorpay:plans -- --env .env.production.local --create --live   # live keys need --live
//
// Mode follows RAZORPAY_KEY_ID: rzp_test_… plans live in test mode, rzp_live_… in live mode.
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = new URL("../", import.meta.url).pathname;
const API = "https://api.razorpay.com/v1";
const PRODUCT = "proupiqr-pro";

/** Monthly and yearly prices in paise, read from src/data/pricing.ts (the source of truth for /pricing/). */
export function readPrices(pricingSource) {
  const paise = (interval) => Number(new RegExp(`${interval}: \\{ paise: ([\\d_]+)`).exec(pricingSource)?.[1].replace(/_/g, ""));
  const prices = { monthly: paise("monthly"), yearly: paise("yearly") };
  if (!Number.isSafeInteger(prices.monthly) || !Number.isSafeInteger(prices.yearly)) throw new Error("Couldn't read PRO_PRICES from src/data/pricing.ts");
  return prices;
}

const matches = (plan, interval, amount) =>
  plan?.period === interval && Number(plan?.interval) === 1 && plan?.item?.amount === amount && plan?.item?.currency === "INR";

/**
 * Looks up existing plans (ours first: notes.product), and creates the missing
 * ones when `create` is set. Returns { monthly, yearly } with { id, created } or null.
 */
export async function findOrCreatePlans({ keyId, keySecret, prices, create = false, fetchImpl = fetch }) {
  const headers = { Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`, "Content-Type": "application/json" };
  const existing = [];
  for (let skip = 0; skip < 1000; skip += 100) {
    const res = await fetchImpl(`${API}/plans?count=100&skip=${skip}`, { headers });
    if (!res.ok) throw new Error(`Razorpay returned HTTP ${res.status} listing plans — check the key id/secret`);
    const page = (await res.json())?.items ?? [];
    existing.push(...page);
    if (page.length < 100) break;
  }
  const result = {};
  for (const interval of ["monthly", "yearly"]) {
    const amount = prices[interval];
    const candidates = existing.filter((plan) => matches(plan, interval, amount));
    const found = candidates.find((plan) => plan?.notes?.product === PRODUCT) ?? candidates[0];
    if (found) { result[interval] = { id: found.id, created: false }; continue; }
    if (!create) { result[interval] = null; continue; }
    const res = await fetchImpl(`${API}/plans`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        period: interval,
        interval: 1,
        item: { name: `Pro UPI QR Pro — ${interval}`, amount, currency: "INR", description: `Pro plan, billed ${interval}` },
        notes: { product: PRODUCT },
      }),
    });
    const plan = await res.json().catch(() => ({}));
    if (!res.ok || typeof plan?.id !== "string" || !matches(plan, interval, amount)) throw new Error(`Couldn't create the ${interval} plan (HTTP ${res.status})`);
    result[interval] = { id: plan.id, created: true };
  }
  return result;
}

function readEnv(file) {
  const env = { ...process.env };
  const path = isAbsolute(file) ? file : join(ROOT, file);
  if (existsSync(path)) {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^"|"$/g, "");
    }
  }
  return env;
}

async function main() {
  const args = process.argv.slice(2);
  const envFile = args.includes("--env") ? args[args.indexOf("--env") + 1] : ".env.local";
  const env = readEnv(envFile);
  const keyId = (env.RAZORPAY_KEY_ID ?? "").trim();
  const keySecret = (env.RAZORPAY_KEY_SECRET ?? "").trim();
  if (!keyId || !keySecret) {
    console.error(`Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in ${envFile} (Razorpay Dashboard → Account & Settings → API Keys).`);
    process.exit(1);
  }
  const live = keyId.startsWith("rzp_live_");
  const create = args.includes("--create");
  if (create && live && !args.includes("--live")) {
    console.error("These are LIVE keys. Re-run with --create --live to create live plans (creating a plan charges no one).");
    process.exit(1);
  }
  const prices = readPrices(readFileSync(join(ROOT, "src/data/pricing.ts"), "utf8"));
  console.log(`Razorpay ${live ? "LIVE" : "test"} mode · /pricing/: ₹${prices.monthly / 100}/month, ₹${prices.yearly / 100}/year`);
  const plans = await findOrCreatePlans({ keyId, keySecret, prices, create });
  let missing = 0;
  for (const [interval, plan] of Object.entries(plans)) {
    if (!plan) { missing++; console.log(`  ✗ no ${interval} plan at ₹${prices[interval] / 100} — re-run with --create`); continue; }
    console.log(`  ✓ ${interval}: ${plan.id}${plan.created ? " (created)" : " (existing)"}`);
  }
  if (missing) process.exit(1);
  console.log(`\nAdd to Vercel (${live ? "Production" : "Preview"} environment):`);
  console.log(`RAZORPAY_PLAN_MONTHLY=${plans.monthly.id}`);
  console.log(`RAZORPAY_PLAN_YEARLY=${plans.yearly.id}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exit(1); });
}
