// Finds or creates the Dodo Payments products that charge exactly what /pricing/
// shows (INR, GST included), and prints the env lines to paste into Vercel.
// Never prints secrets.
//
//   npm run dodo:products -- --env .env.preview.local            # look only
//   npm run dodo:products -- --env .env.preview.local --create   # create missing products (test mode)
//   npm run dodo:products -- --env .env.production.local --create --live   # live mode needs --live
//
// Mode follows DODO_PAYMENTS_ENVIRONMENT (test_mode unless "live_mode").
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";
import { readPrices } from "./razorpay-plans.mjs";

const ROOT = new URL("../", import.meta.url).pathname;
const PRODUCT = "proupiqr-pro";
const INTERVAL = { monthly: "Month", yearly: "Year" };

const base = (environment) => (environment === "live_mode" ? "https://live.dodopayments.com" : "https://test.dodopayments.com");

/**
 * A tax-inclusive INR recurring price billed once per interval for exactly `amount` paise, with
 * nothing that would charge less (discount, trial, purchasing-power pricing).
 */
export function matchesPrice(product, interval, amount) {
  const p = product?.price_detail;
  return p?.type === "recurring_price" && p.price === amount && p.currency === "INR" && p.tax_inclusive === true
    && p.payment_frequency_interval === INTERVAL[interval] && Number(p.payment_frequency_count) === 1
    && !(Number(p.discount_bps) > 0) && !(Number(p.discount) > 0) && !(Number(p.trial_period_days) > 0)
    && p.purchasing_power_parity !== true;
}

/** Every unarchived recurring product (list items carry the full price as `price_detail`). */
async function listRecurringProducts(environment, headers, fetchImpl) {
  const byId = new Map();
  for (let page = 0; page < 20; page++) {
    const res = await fetchImpl(`${base(environment)}/products?recurring=true&page_size=100&page_number=${page}`, { headers });
    if (!res.ok) throw new Error(`Dodo returned HTTP ${res.status} listing products — check DODO_PAYMENTS_API_KEY and DODO_PAYMENTS_ENVIRONMENT`);
    const items = (await res.json())?.items ?? [];
    const before = byId.size;
    for (const item of items) if (typeof item?.product_id === "string") byId.set(item.product_id, item);
    if (items.length < 100 || byId.size === before) break;
  }
  return [...byId.values()];
}

/** Looks up matching products (ours first: metadata.product), creates missing ones when `create` is set. */
export async function findOrCreateProducts({ apiKey, environment, prices, create = false, fetchImpl = fetch }) {
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
  const existing = await listRecurringProducts(environment, headers, fetchImpl);
  const result = {};
  for (const interval of ["monthly", "yearly"]) {
    const amount = prices[interval];
    const candidates = existing.filter((p) => matchesPrice(p, interval, amount));
    const found = candidates.find((p) => p?.metadata?.product === PRODUCT && p?.metadata?.interval === interval) ?? candidates[0];
    if (found) { result[interval] = { id: found.product_id, created: false }; continue; }
    if (!create) { result[interval] = null; continue; }
    const created = await fetchImpl(`${base(environment)}/products`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: interval === "yearly" ? "Pro UPI QR Pro (yearly)" : "Pro UPI QR Pro (monthly)",
        description: `Pro plan for the Pro UPI QR payments workspace, billed ${interval}. Prices include GST.`,
        tax_category: "saas",
        price: {
          type: "recurring_price",
          price: amount,
          currency: "INR",
          tax_inclusive: true,
          payment_frequency_count: 1,
          payment_frequency_interval: INTERVAL[interval],
          // Dodo needs a finite term; 10 years renews like an open-ended subscription.
          subscription_period_count: 10,
          subscription_period_interval: "Year",
          purchasing_power_parity: false,
        },
        metadata: { product: PRODUCT, interval },
      }),
    });
    const product = await created.json().catch(() => ({}));
    if (!created.ok || typeof product?.product_id !== "string") throw new Error(`Couldn't create the ${interval} product (HTTP ${created.status})`);
    result[interval] = { id: product.product_id, created: true };
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
  const apiKey = (env.DODO_PAYMENTS_API_KEY ?? "").trim();
  if (!apiKey) {
    console.error(`Set DODO_PAYMENTS_API_KEY in ${envFile} (Dodo dashboard → Developer → API Keys).`);
    process.exit(1);
  }
  const environment = (env.DODO_PAYMENTS_ENVIRONMENT ?? "").trim() === "live_mode" ? "live_mode" : "test_mode";
  const create = args.includes("--create");
  if (create && environment === "live_mode" && !args.includes("--live")) {
    console.error("DODO_PAYMENTS_ENVIRONMENT is live_mode. Re-run with --create --live to create live products (creating a product charges no one).");
    process.exit(1);
  }
  const prices = readPrices(readFileSync(join(ROOT, "src/data/pricing.ts"), "utf8"));
  console.log(`Dodo Payments ${environment === "live_mode" ? "LIVE" : "test"} mode · /pricing/: ₹${prices.monthly / 100}/month, ₹${prices.yearly / 100}/year (GST included)`);
  const products = await findOrCreateProducts({ apiKey, environment, prices, create });
  let missing = 0;
  for (const [interval, product] of Object.entries(products)) {
    if (!product) { missing++; console.log(`  ✗ no ${interval} product at ₹${prices[interval] / 100} (INR, tax-inclusive) — re-run with --create`); continue; }
    console.log(`  ✓ ${interval}: ${product.id}${product.created ? " (created)" : " (existing)"}`);
  }
  if (missing) process.exit(1);
  console.log(`\nAdd to Vercel (${environment === "live_mode" ? "Production" : "Preview"} environment):`);
  console.log(`DODO_PAYMENTS_ENVIRONMENT=${environment}`);
  console.log(`DODO_PRODUCT_MONTHLY=${products.monthly.id}`);
  console.log(`DODO_PRODUCT_YEARLY=${products.yearly.id}`);
  console.log("Also set DODO_PAYMENTS_API_KEY and DODO_PAYMENTS_WEBHOOK_KEY (Developer → Webhooks → your endpoint's signing secret).");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exit(1); });
}
