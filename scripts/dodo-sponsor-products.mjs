// Finds or creates the Dodo Payments products for sponsorships, charging exactly what src/data/sponsors.ts says
// (INR, GST included), and prints the env lines to paste into Vercel. Never prints secrets.
//
//   npm run dodo:sponsor-products -- --env .env.preview.local                     # look only
//   npm run dodo:sponsor-products -- --env .env.preview.local --create            # create missing (test mode)
//   npm run dodo:sponsor-products -- --env .env.production.local --create --live  # live mode needs --live
//
// Both tiers are monthly subscriptions: the featured card (one spot) and a logo tile (eight spots).
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";
import { SPONSOR_TIERS } from "../src/data/sponsors.ts";

const ROOT = new URL("../", import.meta.url).pathname;
const PRODUCT = "proupiqr-sponsor";
const base = (environment) => (environment === "live_mode" ? "https://live.dodopayments.com" : "https://test.dodopayments.com");

/** Exactly `amount` paise a month, INR, tax-inclusive, no trial and nothing that would charge less. */
export function matchesSponsorPrice(product, tier, amount) {
  const p = product?.price_detail ?? product?.price;
  if (!p || p.price !== amount || p.currency !== "INR" || p.tax_inclusive !== true) return false;
  if (Number(p.discount_bps) > 0 || Number(p.discount) > 0 || p.purchasing_power_parity === true || p.pay_what_you_want === true) return false;
  return p.type === "recurring_price" && p.payment_frequency_interval === "Month" && Number(p.payment_frequency_count) === 1 && !(Number(p.trial_period_days) > 0);
}

async function listProducts(environment, headers, fetchImpl) {
  const byId = new Map();
  for (let page = 0; page < 20; page++) {
    const res = await fetchImpl(`${base(environment)}/products?page_size=100&page_number=${page}`, { headers });
    if (!res.ok) throw new Error(`Dodo returned HTTP ${res.status} listing products — check DODO_PAYMENTS_API_KEY and DODO_PAYMENTS_ENVIRONMENT`);
    const items = (await res.json())?.items ?? [];
    const before = byId.size;
    for (const item of items) if (typeof item?.product_id === "string") byId.set(item.product_id, item);
    if (items.length < 100 || byId.size === before) break;
  }
  return [...byId.values()];
}

export async function findOrCreateSponsorProducts({ apiKey, environment, create = false, fetchImpl = fetch }) {
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
  const existing = await listProducts(environment, headers, fetchImpl);
  const result = {};
  for (const tier of ["featured", "tile"]) {
    const { paise, name } = SPONSOR_TIERS[tier];
    // Only our own sponsor products: a Pro product at the same price must never be reused.
    const found = existing.find((p) => p?.metadata?.product === PRODUCT && p?.metadata?.tier === tier && matchesSponsorPrice(p, tier, paise));
    if (found) { result[tier] = { id: found.product_id, created: false }; continue; }
    if (!create) { result[tier] = null; continue; }
    const price = { type: "recurring_price", price: paise, currency: "INR", tax_inclusive: true, payment_frequency_count: 1, payment_frequency_interval: "Month", subscription_period_count: 10, subscription_period_interval: "Year", purchasing_power_parity: false };
    const res = await fetchImpl(`${base(environment)}/products`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: `Pro UPI QR sponsor: ${name.toLowerCase()}`,
        description: tier === "featured"
          ? "The featured sponsor card on the proupiqr.in homepages, billed monthly. Prices include GST."
          : "A logo tile in the \"Supported by\" strip on the proupiqr.in homepages, billed monthly. Prices include GST.",
        tax_category: "digital_products",
        price,
        metadata: { product: PRODUCT, tier },
      }),
    });
    const product = await res.json().catch(() => ({}));
    if (!res.ok || typeof product?.product_id !== "string") throw new Error(`Couldn't create the ${tier} product (HTTP ${res.status})`);
    result[tier] = { id: product.product_id, created: true };
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
  console.log(`Dodo Payments ${environment === "live_mode" ? "LIVE" : "test"} mode · featured ${SPONSOR_TIERS.featured.label}/month, tile ${SPONSOR_TIERS.tile.label}/month (GST included)`);
  const products = await findOrCreateSponsorProducts({ apiKey, environment, create });
  let missing = 0;
  for (const [tier, product] of Object.entries(products)) {
    if (!product) { missing++; console.log(`  ✗ no ${tier} product at ${SPONSOR_TIERS[tier].label} — re-run with --create`); continue; }
    console.log(`  ✓ ${tier}: ${product.id}${product.created ? " (created)" : " (existing)"}`);
  }
  if (missing) process.exit(1);
  console.log(`\nAdd to Vercel (${environment === "live_mode" ? "Production" : "Preview"} environment), then redeploy:`);
  console.log(`DODO_PRODUCT_SPONSOR_FEATURED=${products.featured.id}`);
  console.log(`DODO_PRODUCT_SPONSOR_TILE=${products.tile.id}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exit(1); });
}
