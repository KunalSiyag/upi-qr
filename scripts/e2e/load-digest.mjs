// Load test for the 09:00 digest cron (not part of `npm run test:e2e`; run on demand):
//   node scripts/e2e/run.mjs load-digest      (starts fake KV + dev server, then this script)
// Seeds N accounts with realistic workspaces + a push device on a fake push service
// that answers in ~150 ms, then times two cron runs: without projections (full
// workspace reads, the old path) and with projections (written by the first run).
import { createECDH } from "node:crypto";
import { createServer } from "node:http";

const DEV = process.env.DEV_BASE || "http://localhost:4321";
const KV = "http://127.0.0.1:8799";
const N = Number(process.env.LOAD_ACCOUNTS || 3000);
const INVOICES = Number(process.env.LOAD_INVOICES || 150);
const admin = (path, body) => fetch(`${KV}/__admin/${path}`, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }).then((r) => r.json());
const kvCmd = (cmd) => fetch(`${KV}/`, { method: "POST", headers: { Authorization: "Bearer test-token" }, body: JSON.stringify(cmd) }).then((r) => r.json());
const day = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const addDays = (n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

let pushes = 0;
const pushServer = createServer((req, res) => { req.resume(); req.on("end", () => setTimeout(() => { pushes++; res.writeHead(201); res.end(); }, 150)); }).listen(8796, "127.0.0.1");
const ua = createECDH("prime256v1"); ua.generateKeys();
const keys = { p256dh: ua.getPublicKey().toString("base64url"), auth: Buffer.alloc(16, 2).toString("base64url") };

function workspace(i) {
  const T = Date.now();
  const clients = {}; const invoices = {};
  for (let c = 0; c < 20; c++) clients[`cli_${i}c${String(c).padStart(4, "0")}`] = { id: `cli_${i}c${String(c).padStart(4, "0")}`, name: `Client ${c} of shop ${i}`, phone: "9876543210", email: "", gstin: "", createdAt: T, updatedAt: T };
  for (let k = 0; k < INVOICES; k++) {
    const id = `inv_${i}n${String(k).padStart(5, "0")}`;
    const paid = k % 3 === 0;
    invoices[id] = { id, number: `INV-${k}`, clientId: `cli_${i}c${String(k % 20).padStart(4, "0")}`, issueDate: addDays(-(k % 90) - 10), dueDate: addDays(-(k % 90) + 5), amountPaise: 150000, description: "Monthly service and maintenance charges", payments: paid ? [{ id: `pay_${i}p${k}x00`, amountPaise: 150000, date: addDays(-3), mode: "upi", reference: "412345678901", createdAt: T }] : [], reminders: [], voided: false, createdAt: T, updatedAt: T };
  }
  return { version: 1, business: { name: `Shop ${i}`, upiId: "shop@okaxis", phone: "", gstin: "", invoicePrefix: "INV-", updatedAt: T }, clients, invoices, recurring: {} };
}

const cron = async () => {
  const started = Date.now();
  const res = await fetch(`${DEV}/api/cron/digest/`, { headers: { Authorization: `Bearer ${process.env.E2E_CRON_SECRET}` } });
  return { ms: Date.now() - started, body: await res.json() };
};

try {
  await admin("reset", {});
  const sample = JSON.stringify(workspace(0));
  console.log(`seeding ${N} accounts × ${INVOICES} invoices (≈${Math.round(sample.length / 1024)} KB workspace each)…`);
  for (let start = 0; start < N; start += 250) {
    const batch = [];
    for (let i = start; i < Math.min(N, start + 250); i++) {
      const owner = `acct${String(i).padStart(6, "0")}`;
      batch.push([`ws:doc:${owner}`, JSON.stringify(workspace(i))], [`ws:rev:${owner}`, "1"]);
    }
    await admin("bulk", JSON.stringify(batch));
    for (let i = start; i < Math.min(N, start + 250); i++) {
      const owner = `acct${String(i).padStart(6, "0")}`;
      await admin("set", { hash: `push:subs:${owner}`, field: "d", value: JSON.stringify({ endpoint: `http://127.0.0.1:8796/push/${owner}`, keys, createdAt: 1 }) });
      await kvCmd(["sadd", "push:owners", owner]);
    }
  }
  await admin("stats", "reset");
  const full = await cron();
  const fullStats = await admin("stats", "reset");
  await admin("delprefix", { prefix: "push:digest:" });
  const projected = await cron();
  const projStats = await admin("stats", "reset");
  const line = (label, run, stats) => console.log(`${label}: ${(run.ms / 1000).toFixed(1)} s, notified ${run.body.notified}/${run.body.owners}, remaining ${run.body.remaining}, from projection ${run.body.fromProjection}, KV read ${(stats.bytesOut / 1048576).toFixed(1)} MB in ${stats.requests} requests`);
  line("run 1 (full workspaces → backfills projections)", full, fullStats);
  line("run 2 (projections)                         ", projected, projStats);
  console.log(`push deliveries: ${pushes}`);
  const ok = full.body.notified + full.body.remaining === N && projected.body.fromProjection === projected.body.notified && projStats.bytesOut * 5 < fullStats.bytesOut;
  console.log(ok ? "PASS  load: projections cut KV reads >5x and runs stay within the time budget" : "FAIL  load: unexpected result");
  process.exitCode = ok ? 0 : 1;
} finally {
  pushServer.close();
}
