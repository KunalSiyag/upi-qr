// On-demand load test for public pay pages (node scripts/e2e/run.mjs --prod load-paypage):
// a 2,000-invoice (≈900 KB) workspace behind one pay link, hammered by concurrent visitors.
const DEV = process.env.DEV_BASE || "http://localhost:4321";
const KV = "http://127.0.0.1:8799";
const admin = (path, body) => fetch(`${KV}/__admin/${path}`, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }).then((r) => r.json());
const TOKEN = "Ld7pQ2xYz9AbCdEfGhIjKl";
const OWNER = "a1".repeat(16);
const T = Date.now();
const day = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const invoices = {};
for (let k = 0; k < 2000; k++) {
  const id = `inv_ld${String(k).padStart(6, "0")}`;
  invoices[id] = { id, number: `INV-${k}`, clientId: "cli_ld000001", issueDate: day, dueDate: day, amountPaise: 150000, description: "x".repeat(300), payments: [], reminders: [], voided: false, createdAt: T, updatedAt: T };
}
const ws = { version: 1, business: { name: "Load Test Shop", upiId: "shop@okaxis", phone: "", gstin: "", invoicePrefix: "INV-", updatedAt: T }, clients: { cli_ld000001: { id: "cli_ld000001", name: "Client", phone: "", email: "", gstin: "", createdAt: T, updatedAt: T } }, invoices, recurring: {} };
await admin("reset", {});
await admin("bulk", JSON.stringify([[`ws:doc:${OWNER}`, JSON.stringify(ws)], [`ws:rev:${OWNER}`, "1"], [`pl:tok:${TOKEN}`, JSON.stringify({ owner: OWNER, invoiceId: "inv_ld000007", createdAt: T })]]));
await admin("set", { hash: `pl:own:${OWNER}`, field: "inv_ld000007", value: TOKEN });
// First view takes the fallback path (full read) and writes the snapshot; the rest read the snapshot.
const firstView = await fetch(`${DEV}/i/${TOKEN}/`).then((r) => r.status);
const sizeKb = Math.round(JSON.stringify(ws).length / 1024);
const REQUESTS = Number(process.env.LOAD_REQUESTS || 400);
const CONCURRENCY = 20;
const times = [];
let errors = 0;
let next = 0;
const started = Date.now();
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (next < REQUESTS) {
    next++;
    const t0 = performance.now();
    const res = await fetch(`${DEV}/i/${TOKEN}/`);
    const html = await res.text();
    times.push(performance.now() - t0);
    if (res.status !== 200 || !html.includes("INV-7")) errors++;
  }
}));
const total = (Date.now() - started) / 1000;
times.sort((a, b) => a - b);
const pct = (p) => times[Math.min(times.length - 1, Math.floor((p / 100) * times.length))].toFixed(0);
console.log(`pay page with a ${sizeKb} KB workspace: ${REQUESTS} requests, ${CONCURRENCY} concurrent → ${(REQUESTS / total).toFixed(0)} req/s on one local process; p50 ${pct(50)} ms, p95 ${pct(95)} ms, p99 ${pct(99)} ms; errors ${errors}`);
const snap = (await admin("get", { hash: `pl:views:${OWNER}` })).value;
console.log(`first view ${firstView}; snapshot stored: ${Boolean(snap && snap[TOKEN])} (${snap && snap[TOKEN] ? snap[TOKEN].length : 0} bytes)`);
console.log(errors === 0 && Number(pct(95)) < 1500 ? "PASS  load: pay pages stay fast with the largest allowed workspace" : "FAIL  load: pay page errors or slow p95");
process.exitCode = errors === 0 ? 0 : 1;
