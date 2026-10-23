// Several businesses per account, server side: the real /api/v1/workspace/books/ and
// /api/v1/paylinks/books/ routes, the pay page and the digest cron against fake-upstash.
// Signed in with session tokens the server verifies through CLERK_JWT_KEY (set by run.mjs).
import { createDecipheriv, createECDH, createHash, createSign, hkdfSync } from "node:crypto";
import { createServer } from "node:http";
import { checker, sleep } from "./cdp-lib.mjs";

const DEV = process.env.DEV_BASE || "http://localhost:4321";
const KV = "http://127.0.0.1:8799";
const PROD = process.env.E2E_MODE === "prod";
const check = checker();
const admin = (path, body) => fetch(`${KV}/__admin/${path}`, { method: "POST", body: JSON.stringify(body) }).then((r) => r.json());
const kvCmd = (cmd) => fetch(`${KV}/`, { method: "POST", headers: { Authorization: "Bearer test-token" }, body: JSON.stringify(cmd) }).then((r) => r.json());
const keys = async () => (await admin("keys", {})).keys;
const value = async (key) => (await admin("get", { key })).value;
const hash = async (key) => (await admin("get", { hash: key })).value;

const b64u = (v) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");
function sessionToken(userId) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64u({ alg: "RS256", typ: "JWT" });
  const body = b64u({ sub: userId, sid: `sess_${userId}`, iat: now - 5, nbf: now - 5, exp: now + 900, iss: "https://e2e.clerk.accounts.dev" });
  const sig = createSign("RSA-SHA256").update(`${head}.${body}`).sign(process.env.E2E_JWT_PRIVATE_KEY).toString("base64url");
  return `${head}.${body}.${sig}`;
}
const ownerOf = (userId) => createHash("sha256").update(`workspace:${userId}`).digest("hex").slice(0, 32);
async function api(method, path, { user, body, headers = {}, raw } = {}) {
  const init = { method, redirect: "manual", headers: { Accept: "application/json", Origin: DEV, ...(user ? { Authorization: `Bearer ${sessionToken(user)}` } : {}), ...headers } };
  if (body !== undefined || raw !== undefined) { init.headers["Content-Type"] = "application/json"; init.body = raw ?? JSON.stringify(body); }
  const res = await fetch(DEV + path, init);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text, headers: res.headers };
}

const T = Date.now();
const istToday = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const addDays = (n) => new Date(Date.parse(`${istToday}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const workspace = (name, upiId, number, amountPaise, dueIn = -10, clientName = "Acme Traders") => ({
  version: 1,
  business: { name, upiId, phone: "", gstin: "", invoicePrefix: "INV-", updatedAt: T },
  clients: { cli_acme0001: { id: "cli_acme0001", name: clientName, phone: "9876543210", email: "", gstin: "", createdAt: T, updatedAt: T } },
  invoices: { inv_00000001: { id: "inv_00000001", number, clientId: "cli_acme0001", issueDate: addDays(-40), dueDate: addDays(dueIn), amountPaise, description: "", payments: [], reminders: [], voided: false, createdAt: T, updatedAt: T } },
  recurring: {},
});
const index = (...entries) => ({ v: 1, books: Object.fromEntries([{ id: "biz_primary", createdAt: 0 }, ...entries].map((m) => [m.id, m])) });
const live = (id, createdAt = 1) => ({ id, createdAt });
const tomb = (id, deletedAt = 0) => ({ id, createdAt: 1, deletedAt });
const billing = (user, record) => record
  ? admin("set", { key: `billtest:own:${ownerOf(user)}`, value: JSON.stringify(record) })
  : kvCmd(["del", `billtest:own:${ownerOf(user)}`]);
const paid = { provider: "dodo", subscriptionId: "sub_E2eBooksPaid000001", interval: "monthly", status: "active", currentEnd: T + 30 * 86_400_000, cancelAtCycleEnd: false, shortUrl: null, eventAt: 1, updatedAt: T, hadSubscription: true };
const trial = { ...paid, subscriptionId: "sub_E2eBooksTrial00001", trialEndsAt: T + 7 * 86_400_000, currentEnd: T + 7 * 86_400_000 };

try {
  await admin("reset", {});

  // --- Sign-in, CSRF, body caps, ids, no-store ---
  const FREE = "user_e2eBooksFree";
  for (const [method, path] of [["GET", "/api/v1/workspace/books/"], ["PUT", "/api/v1/workspace/books/"], ["GET", "/api/v1/workspace/books/biz_abcdef01/"], ["PUT", "/api/v1/workspace/books/biz_abcdef01/"], ["POST", "/api/v1/paylinks/books/biz_abcdef01/"]]) {
    const r = await api(method, path, { body: method === "GET" ? undefined : {} });
    check(`${method} ${path} → 401 signed out`, r.status === 401, String(r.status));
  }
  let r = await api("GET", "/api/v1/workspace/books/", { user: FREE });
  check("signed-in GET books → only the first business, Free plan (1)", r.status === 200 && JSON.stringify(r.json.index) === JSON.stringify(index()) && r.json.plan?.id === "free" && r.json.plan.businesses === 1 && r.json.owner === ownerOf(FREE), `${r.status} ${r.text.slice(0, 300)}`);
  check("books responses are no-store", r.headers.get("cache-control") === "no-store");
  r = await api("PUT", "/api/v1/workspace/books/", { user: FREE, body: { index: index() }, headers: { Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site" } });
  check("cross-site index PUT → 403", r.status === 403, String(r.status));
  r = await api("PUT", "/api/v1/workspace/books/biz_abcdef01/", { user: FREE, body: { workspace: {} }, headers: { Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site" } });
  check("cross-site book PUT → 403", r.status === 403, String(r.status));
  r = await api("PUT", "/api/v1/workspace/books/", { user: FREE, raw: JSON.stringify({ index: index(), pad: "x".repeat(17_000) }) });
  check("index body over 16 KB → 413", r.status === 413, String(r.status));
  for (const id of ["biz_primary", "biz_x", "not-a-book"]) {
    r = await api("GET", `/api/v1/workspace/books/${id}/`, { user: FREE });
    check(`GET books/${id}/ → 400`, r.status === 400, String(r.status));
  }
  r = await api("POST", "/api/v1/paylinks/books/biz_primary/", { user: FREE, body: { invoiceId: "inv_00000001" } });
  check("POST paylinks/books/biz_primary/ → 400", r.status === 400, String(r.status));

  // --- Free: a second business is rejected; its PUT is 404 ---
  r = await api("PUT", "/api/v1/workspace/books/", { user: FREE, body: { index: index(live("biz_freesecond1")), expectedOwner: ownerOf(FREE) } });
  check("Free: second business rejected (200, business_limit)", r.status === 200 && r.json.code === "business_limit" && JSON.stringify(r.json.rejected) === '["biz_freesecond1"]', r.text.slice(0, 300));
  r = await api("PUT", "/api/v1/workspace/books/biz_freesecond1/", { user: FREE, body: { workspace: workspace("Two", "two@okaxis", "T-1", 1000), expectedOwner: ownerOf(FREE) } });
  check("Free: PUT for the rejected id → 404 unknown_business", r.status === 404 && r.json.code === "unknown_business", r.text.slice(0, 200));
  check("Free: nothing stored for the rejected business", !(await keys()).some((k) => k.includes(ownerOf(FREE))), (await keys()).filter((k) => k.includes(ownerOf(FREE))).join(","));

  // --- Trial: up to 3 businesses ---
  const TRIAL = "user_e2eBooksTrial";
  await billing(TRIAL, trial);
  r = await api("PUT", "/api/v1/workspace/books/", { user: TRIAL, body: { index: index(live("biz_trial00002"), live("biz_trial00003"), live("biz_trial00004")), expectedOwner: ownerOf(TRIAL) } });
  check("trial: three businesses register, the fourth is rejected (more after the first payment)", r.status === 200 && r.json.rejected?.length === 1 && r.json.rejected[0] === "biz_trial00004" && r.json.plan?.id === "pro" && r.json.plan.businesses === 3, r.text.slice(0, 300));

  // --- Paid Pro: up to 20 ---
  const PRO20 = "user_e2eBooksPro20";
  await billing(PRO20, paid);
  const nineteen = Array.from({ length: 19 }, (_, i) => live(`biz_twenty${String(i).padStart(4, "0")}`));
  r = await api("PUT", "/api/v1/workspace/books/", { user: PRO20, body: { index: index(...nineteen), expectedOwner: ownerOf(PRO20) } });
  check("paid Pro registers 20 businesses", r.status === 200 && r.json.rejected.length === 0 && Object.keys(r.json.revs).length === 20 && r.json.plan.businesses === 20, r.text.slice(0, 200));
  r = await api("PUT", "/api/v1/workspace/books/", { user: PRO20, body: { index: index(live("biz_twentyone1")), expectedOwner: ownerOf(PRO20) } });
  check("…and the 21st is rejected", r.json?.rejected?.[0] === "biz_twentyone1" && r.json.code === "business_limit", r.text.slice(0, 200));
  // The 60-adds-per-day budget is charged per business: 19 + 19 + 19 (deleted in between) leaves 3.
  const BUDGET = "user_e2eBooksBudget";
  await billing(BUDGET, paid);
  const batch = (round, n = 19) => Array.from({ length: n }, (_, i) => `biz_b${round}x${String(i).padStart(6, "0")}`);
  const statuses = [];
  for (let round = 0; round < 4; round++) {
    const ids = batch(round);
    const put = await api("PUT", "/api/v1/workspace/books/", { user: BUDGET, body: { index: index(...ids.map((id) => live(id))) } });
    statuses.push(put.status);
    if (put.status === 200) await api("PUT", "/api/v1/workspace/books/", { user: BUDGET, body: { index: index(...ids.map((id) => tomb(id))) } });
  }
  check("add budget: three batches of 19 pass, the fourth (19 > 3 left) → 429", statuses.join() === "200,200,200,429", statuses.join());
  r = await api("PUT", "/api/v1/workspace/books/", { user: BUDGET, body: { index: index(...batch(9, 3).map((id) => live(id))) } });
  const r429 = await api("PUT", "/api/v1/workspace/books/", { user: BUDGET, body: { index: index(...batch(9, 3).map((id) => live(id)), live("biz_onemoreadd1")) } });
  check("add budget: 3 more fit exactly, then a single add → 429", r.status === 200 && r.json.rejected.length === 0 && r429.status === 429, `${r.status} ${r429.status}`);
  const istDay = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  check("metrics: business_added and business_limit counted", Number(await value(`metrics:business_added:${istDay}`)) === 2 + 19 + 60 && Number(await value(`metrics:business_limit:${istDay}`)) >= 3);

  // --- Pro account with three businesses ---
  const PRO = "user_e2eBooksPro";
  const O = ownerOf(PRO);
  const B = "biz_tutorsbook1";
  const C = "biz_bakerybook1";
  await billing(PRO, paid);
  const primaryDoc = workspace("Sharma Stores", "stores@okaxis", "S-1", 500000, -5);
  await admin("set", { key: `ws:doc:${O}`, value: JSON.stringify(primaryDoc) });
  await admin("set", { key: `ws:rev:${O}`, value: "1" });
  r = await api("PUT", "/api/v1/workspace/books/", { user: PRO, body: { index: index(live(B), live(C, 2)), expectedOwner: O } });
  check("Pro adds two businesses (server-stamped createdAt)", r.status === 200 && r.json.index.books[B]?.createdAt > 1 && r.json.index.books[C] && r.json.rejected.length === 0, r.text.slice(0, 300));
  r = await api("PUT", `/api/v1/workspace/books/${B}/`, { user: PRO, body: { workspace: workspace("Sharma Tutors", "tutors@okhdfc", "T-1", 120000, -20), expectedOwner: O } });
  check("PUT business B → 200 with businessId", r.status === 200 && r.json.businessId === B && r.json.rev === 1, r.text.slice(0, 200));
  check("B lives at ws:doc:<owner>:<B>; the first business's document is byte-identical", JSON.parse(await value(`ws:doc:${O}:${B}`)).business.name === "Sharma Tutors" && (await value(`ws:doc:${O}`)) === JSON.stringify(primaryDoc));
  check("B's digest projection is a v2 field of ws:projb", JSON.parse((await hash(`ws:projb:${O}`))[B]).name === "Sharma Tutors");
  r = await api("PUT", `/api/v1/workspace/books/${C}/`, { user: PRO, body: { workspace: workspace("Sharma Bakery", "bakery@okicici", "K-1", 80000), expectedOwner: O } });
  check("PUT business C → 200", r.status === 200, r.text.slice(0, 200));
  r = await api("GET", `/api/v1/workspace/books/${B}/`, { user: PRO });
  check("GET business B returns its own data", r.status === 200 && r.json.workspace.invoices.inv_00000001.number === "T-1", r.text.slice(0, 200));

  // An old client PUT naming a business lands in the first business only.
  r = await api("PUT", "/api/v1/workspace/", { user: PRO, body: { workspace: { ...primaryDoc, business: { ...primaryDoc.business, phone: "9999999999", updatedAt: T + 1 } }, businessId: B } });
  check("old-client PUT with businessId → the first business only", r.status === 200 && JSON.parse(await value(`ws:doc:${O}`)).business.phone === "9999999999" && JSON.parse(await value(`ws:doc:${O}:${B}`)).business.phone === "", r.text.slice(0, 200));
  r = await api("GET", "/api/v1/workspace/", { user: PRO });
  // Same shape plus intl: 1 (docs/spec-foreign-clients.md §2.6: the server keeps ws.intl; old clients ignore the field).
  check("GET /api/v1/workspace/ is the first business, same response shape", r.status === 200 && r.json.workspace.business.name === "Sharma Stores" && JSON.stringify(Object.keys(r.json)) === '["workspace","rev","owner","intl"]' && r.json.intl === 1, r.text.slice(0, 200));

  // --- Pay links per business ---
  r = await api("POST", `/api/v1/paylinks/books/${B}/`, { user: PRO, body: { invoiceId: "inv_00000001", expectedOwner: O } });
  const tokenB = r.json?.token;
  check("pay link in B → 201", r.status === 201 && Boolean(tokenB), r.text.slice(0, 200));
  r = await api("POST", "/api/v1/paylinks/", { user: PRO, body: { invoiceId: "inv_00000001" } });
  const tokenA = r.json?.token;
  check("pay link for the same invoice id in the first business → a different token", r.status === 201 && tokenA && tokenA !== tokenB, r.text.slice(0, 200));
  check("first-business record is byte-identical ({owner, invoiceId, createdAt})", JSON.stringify(Object.keys(JSON.parse(await value(`pl:tok:${tokenA}`)))) === '["owner","invoiceId","createdAt"]' && JSON.parse(await value(`pl:tok:${tokenA}`)).invoiceId === "inv_00000001");
  const recB = JSON.parse(await value(`pl:tok:${tokenB}`));
  check("B's record: invoiceId biz_…/inv_…, businessId B", recB.invoiceId === `${B}/inv_00000001` && recB.businessId === B, JSON.stringify(recB));
  let html = await (await fetch(`${DEV}/i/${tokenB}/`)).text();
  check("B's pay page shows B's name and UPI ID only", html.includes("Sharma Tutors") && /pa=tutors%40okhdfc/.test(html) && !html.includes("stores@okaxis") && !html.includes("Sharma Stores") && html.includes("T-1"), (html.match(/upi:\/\/pay[^"]*/) || [""])[0]);
  html = await (await fetch(`${DEV}/i/${tokenA}/`)).text();
  check("the first business's pay page is unchanged", html.includes("Sharma Stores") && /pa=stores%40okaxis/.test(html) && !html.includes("tutors@okhdfc"));
  // Fallback path (no snapshots): a qualified key still reads only its own business.
  await kvCmd(["del", `pl:views:${O}`]);
  html = await (await fetch(`${DEV}/i/${tokenB}/`)).text();
  check("without snapshots, B's link reads B's book (never the first business)", /pa=tutors%40okhdfc/.test(html) && !html.includes("stores@okaxis"));
  check("…and backfills only B's snapshot", Object.keys(await hash(`pl:views:${O}`)).join() === tokenB);
  // A qualified link to an unknown business is 404 even though the first business has that invoice.
  const STRAY = "Sx7pQ2xYz9AbCdEfGhIjKl";
  await admin("set", { key: `pl:tok:${STRAY}`, value: JSON.stringify({ owner: O, invoiceId: "biz_unknownbiz1/inv_00000001", createdAt: T, businessId: "biz_unknownbiz1" }) });
  check("a link qualified with an unknown business → 404, never the first business", (await fetch(`${DEV}/i/${STRAY}/`)).status === 404);
  r = await api("GET", "/api/v1/paylinks/", { user: PRO });
  check("GET /api/v1/paylinks/ (old clients) lists only the first business's links", r.status === 200 && r.json.links.length === 1 && r.json.links[0].invoiceId === "inv_00000001" && !("businessId" in r.json.links[0]) && r.json.plan.used === 2 && !("businesses" in r.json.plan), r.text.slice(0, 300));
  r = await api("GET", "/api/v1/paylinks/?books=1", { user: PRO });
  check("?books=1 lists every link with its businessId and the plan's business limit", r.json.links.length === 2 && r.json.links.some((l) => l.invoiceId === `${B}/inv_00000001` && l.businessId === B) && r.json.links.some((l) => l.businessId === "biz_primary") && r.json.plan.businesses === 20, r.text.slice(0, 300));

  // --- Owner mismatch writes nothing ---
  const before = await value(`ws:doc:${O}:${B}`);
  r = await api("PUT", `/api/v1/workspace/books/${B}/`, { user: PRO, body: { workspace: workspace("Hijacked", "evil@okaxis", "X-1", 1), expectedOwner: ownerOf(FREE) } });
  const r2 = await api("PUT", "/api/v1/workspace/books/", { user: PRO, body: { index: index(live("biz_mismatch01")), expectedOwner: ownerOf(FREE) } });
  const r3 = await api("POST", `/api/v1/paylinks/books/${C}/`, { user: PRO, body: { invoiceId: "inv_00000001", expectedOwner: ownerOf(FREE) } });
  const r4 = await api("PUT", "/api/v1/workspace/", { user: PRO, body: { workspace: workspace("Hijacked", "evil@okaxis", "X-1", 1), expectedOwner: ownerOf(FREE) } });
  const r5 = await api("DELETE", "/api/v1/workspace/", { user: PRO, body: { expectedOwner: ownerOf(FREE) } });
  const r6 = await api("DELETE", `/api/v1/paylinks/${tokenB}/`, { user: PRO, body: { scope: "link", expectedOwner: ownerOf(FREE) } });
  check("expectedOwner of another account → 409 owner_mismatch on every mutation", [r, r2, r3, r4, r5, r6].every((x) => x.status === 409 && x.json.code === "owner_mismatch"), [r, r2, r3, r4, r5, r6].map((x) => x.status).join(","));
  check("…and nothing was written", (await value(`ws:doc:${O}:${B}`)) === before && !JSON.stringify(await value(`ws:books:${O}`)).includes("biz_mismatch01") && !Object.keys(await hash(`pl:own:${O}`)).some((k) => k.startsWith(C)) && !(await value(`ws:doc:${O}`)).includes("Hijacked") && Boolean(await value(`pl:tok:${tokenB}`)));

  // --- Downgrade: extra businesses are read-only; their links keep serving ---
  await billing(PRO, null);
  r = await api("PUT", `/api/v1/workspace/books/${B}/`, { user: PRO, body: { workspace: workspace("Sharma Tutors", "tutors@okhdfc", "T-1", 99, -20), expectedOwner: O } });
  check("downgraded: PUT to a business past the Free limit → 402 plan_read_only", r.status === 402 && r.json.code === "plan_read_only", r.text.slice(0, 200));
  check("…nothing written", (await value(`ws:doc:${O}:${B}`)) === before);
  r = await api("POST", `/api/v1/paylinks/books/${C}/`, { user: PRO, body: { invoiceId: "inv_00000001", expectedOwner: O } });
  check("downgraded: new pay link in a read-only business → 402 plan_read_only", r.status === 402 && r.json.code === "plan_read_only", r.text.slice(0, 200));
  html = await (await fetch(`${DEV}/i/${tokenB}/`)).text();
  check("downgraded: B's existing pay page still serves B's UPI ID", /pa=tutors%40okhdfc/.test(html) && !html.includes("stores@okaxis"));
  r = await api("GET", `/api/v1/workspace/books/${B}/`, { user: PRO });
  check("downgraded: B stays readable", r.status === 200);
  r = await api("PUT", "/api/v1/workspace/", { user: PRO, body: { workspace: primaryDoc } });
  check("downgraded: the first business is never read-only", r.status === 200);
  await billing(PRO, paid);

  // --- Delete C with a deletedAt: 0 tombstone ---
  r = await api("PUT", "/api/v1/workspace/books/", { user: PRO, body: { index: index(tomb(C, 0)), expectedOwner: O } });
  check("tombstone (deletedAt 0) → server time, cleanup confirmed", r.status === 200 && r.json.index.books[C].deletedAt > T - 60_000 && r.json.index.books[C].purgedAt > 0, r.text.slice(0, 300));
  check("C's document and projection are gone; its revision advances (1 → 2), never resets", (await value(`ws:doc:${O}:${C}`)) === null && !(C in (await hash(`ws:projb:${O}`))) && (await value(`ws:rev:${O}:${C}`)) === "2");

  // --- Delete B (with a live pay link): the link is revoked; B can't be revived ---
  r = await api("PUT", "/api/v1/workspace/books/", { user: PRO, body: { index: index(tomb(B, Date.now())), expectedOwner: O } });
  check("delete B → purged", r.json?.index?.books?.[B]?.purgedAt > 0, r.text.slice(0, 300));
  check("B's pay page → 404", (await fetch(`${DEV}/i/${tokenB}/`)).status === 404);
  const left = await keys();
  check("B's pl:* keys and fields are gone", !left.includes(`pl:tok:${tokenB}`) && !left.includes(`pl:claims:${tokenB}`) && !Object.keys(await hash(`pl:own:${O}`)).some((k) => k.startsWith(`${B}/`)) && !(tokenB in (await hash(`pl:views:${O}`))));
  check("the first business's link survives", (await fetch(`${DEV}/i/${tokenA}/`)).status === 200);
  r = await api("PUT", "/api/v1/workspace/books/", { user: PRO, body: { index: index(live(B)), expectedOwner: O } });
  check("re-sending B as live keeps the tombstone", r.json?.index?.books?.[B]?.deletedAt > 0, r.text.slice(0, 200));
  r = await api("PUT", `/api/v1/workspace/books/${B}/`, { user: PRO, body: { workspace: workspace("Back", "tutors@okhdfc", "T-1", 1), expectedOwner: O } });
  check("PUT to a deleted business → 410 business_deleted, nothing written", r.status === 410 && r.json.code === "business_deleted" && (await value(`ws:doc:${O}:${B}`)) === null, r.text.slice(0, 200));
  r = await api("POST", `/api/v1/paylinks/books/${B}/`, { user: PRO, body: { invoiceId: "inv_00000001", expectedOwner: O } });
  check("pay link in a deleted business → 410", r.status === 410, String(r.status));

  // --- A failed cleanup is retried by the next GET ---
  const D = "biz_dairybook01";
  await api("PUT", "/api/v1/workspace/books/", { user: PRO, body: { index: index(live(D, 3)), expectedOwner: O } });
  await api("PUT", `/api/v1/workspace/books/${D}/`, { user: PRO, body: { workspace: workspace("Sharma Dairy", "dairy@okaxis", "D-1", 7000), expectedOwner: O } });
  const tokenD = (await api("POST", `/api/v1/paylinks/books/${D}/`, { user: PRO, body: { invoiceId: "inv_00000001", expectedOwner: O } })).json?.token;
  await admin("fault", { match: `ws:projb:${O}`, count: 1 });
  r = await api("PUT", "/api/v1/workspace/books/", { user: PRO, body: { index: index(tomb(D, 1)), expectedOwner: O } });
  check("a failing cleanup leaves the tombstone unpurged", r.status === 200 && r.json.index.books[D].deletedAt > 0 && r.json.index.books[D].purgedAt === undefined, r.text.slice(0, 300));
  check("…so D's link still exists for now", Boolean(tokenD) && (await keys()).includes(`pl:tok:${tokenD}`));
  r = await api("GET", "/api/v1/workspace/books/", { user: PRO });
  check("GET books retries: purgedAt set", r.json?.index?.books?.[D]?.purgedAt > 0, r.text.slice(0, 300));
  check("…D's document, projection field and links are gone", (await value(`ws:doc:${O}:${D}`)) === null && !(D in (await hash(`ws:projb:${O}`))) && !(await keys()).includes(`pl:tok:${tokenD}`));

  // --- A pay-link POST interleaved with a delete leaves nothing behind ---
  const E = "biz_eventsbook1";
  await api("PUT", "/api/v1/workspace/books/", { user: PRO, body: { index: index(live(E, 4)), expectedOwner: O } });
  await api("PUT", `/api/v1/workspace/books/${E}/`, { user: PRO, body: { workspace: workspace("Sharma Events", "events@okaxis", "E-1", 9000), expectedOwner: O } });
  await admin("fault", { match: "pl:tok:", count: 1, delayMs: 1500 });
  const pending = api("POST", `/api/v1/paylinks/books/${E}/`, { user: PRO, body: { invoiceId: "inv_00000001", expectedOwner: O } });
  await sleep(400);
  r = await api("PUT", "/api/v1/workspace/books/", { user: PRO, body: { index: index(tomb(E, 1)), expectedOwner: O } });
  const raced = await pending;
  check("the interleaved pay-link POST answers 410", raced.status === 410 && raced.json.code === "business_deleted", `${raced.status} ${raced.text.slice(0, 200)} (delete: ${r.status})`);
  const ownFields = Object.keys(await hash(`pl:own:${O}`));
  check("…and no link of E remains", !ownFields.some((k) => k.startsWith(`${E}/`)) && !(raced.json?.token && (await keys()).includes(`pl:tok:${raced.json.token}`)), ownFields.join(","));

  // --- Delete cloud copy across businesses ---
  const F = "biz_flowersbk01";
  await api("PUT", "/api/v1/workspace/books/", { user: PRO, body: { index: index(live(F, 5)), expectedOwner: O } });
  await api("PUT", `/api/v1/workspace/books/${F}/`, { user: PRO, body: { workspace: workspace("Sharma Flowers", "flowers@okaxis", "F-1", 6000), expectedOwner: O } });
  const tokenF = (await api("POST", `/api/v1/paylinks/books/${F}/`, { user: PRO, body: { invoiceId: "inv_00000001", expectedOwner: O } })).json?.token;
  const revsBefore = (await api("GET", "/api/v1/workspace/books/", { user: PRO })).json.revs;
  // A stray snapshot whose link is gone (as left by a sync that raced a delete) must not survive.
  await admin("set", { hash: `pl:views:${O}`, field: "Zz7pQ2xYz9AbCdEfGhIjKl", value: JSON.stringify({ kind: "invoice", view: { merchantName: "Gone", upiId: "gone@okaxis" } }) });
  r = await api("DELETE", "/api/v1/workspace/", { user: PRO, body: {} });
  check("DELETE /api/v1/workspace/ → { ok: true }", r.status === 200 && r.text === '{"ok":true}', r.text);
  const after = await keys();
  check("no workspace documents remain (any business)", !after.some((k) => k.startsWith(`ws:doc:${O}`)), after.filter((k) => k.startsWith(`ws:doc:${O}`)).join(","));
  check("no non-primary projection fields or links remain", Object.keys(await hash(`ws:projb:${O}`)).length === 0 && !after.includes(`pl:tok:${tokenF}`) && !Object.keys(await hash(`pl:own:${O}`)).some((k) => k.includes("/")));
  check("revisions advance on delete (a device holding rev N re-uploads)", Number(await value(`ws:rev:${O}`)) === revsBefore.biz_primary + 1 && Number(await value(`ws:rev:${O}:${F}`)) === revsBefore[F] + 1, JSON.stringify(revsBefore));
  check("orphaned pay-page snapshots are dropped", !("Zz7pQ2xYz9AbCdEfGhIjKl" in (await hash(`pl:views:${O}`))));
  check("the first business's pay link is unchanged until PR 6", after.includes(`pl:tok:${tokenA}`));
  r = await api("GET", "/api/v1/workspace/books/", { user: PRO });
  check("extra businesses are unregistered (not deleted); deleted ones stay deleted", r.json.index.books[F] === undefined && r.json.index.books[B].deletedAt > 0, JSON.stringify(r.json.index).slice(0, 300));

  // --- A single-business account sees no new keys and the same response shapes ---
  const SOLO = "user_e2eBooksSolo";
  const S = ownerOf(SOLO);
  r = await api("PUT", "/api/v1/workspace/", { user: SOLO, body: { workspace: workspace("Solo Shop", "solo@okaxis", "Q-1", 4000) } });
  check("single business: PUT response shape unchanged (plus intl: 1)", r.status === 200 && JSON.stringify(Object.keys(r.json)) === '["workspace","rev","owner","intl"]' && r.json.intl === 1 && r.json.rev === 1 && !("intl" in r.json.workspace));
  r = await api("POST", "/api/v1/paylinks/", { user: SOLO, body: { invoiceId: "inv_00000001" } });
  const soloToken = r.json?.token;
  await api("PUT", "/api/v1/workspace/", { user: SOLO, body: { workspace: workspace("Solo Shop", "solo@okaxis", "Q-1", 4000) } });
  r = await api("GET", "/api/v1/paylinks/", { user: SOLO });
  check("single business: GET paylinks shape unchanged", JSON.stringify(Object.keys(r.json.links[0])) === '["invoiceId","token","claims"]' && JSON.stringify(Object.keys(r.json.plan)) === '["id","activePaylinks","used","statementLinks"]', r.text.slice(0, 300));
  await api("GET", "/api/v1/workspace/books/", { user: SOLO });
  const soloKeys = (await keys()).filter((k) => k.includes(S)).sort();
  check("single business: only today's keys (no index, no book projections)", JSON.stringify(soloKeys) === JSON.stringify([`pl:own:${S}`, `pl:views:${S}`, `ws:doc:${S}`, `ws:proj:${S}`, `ws:rev:${S}`].sort()), soloKeys.join(","));
  check("single business: projection stays v1 without a name", JSON.parse(await value(`ws:proj:${S}`)).v === 1 && !("name" in JSON.parse(await value(`ws:proj:${S}`))));
  check("single business: pay record and page unchanged", JSON.stringify(Object.keys(JSON.parse(await value(`pl:tok:${soloToken}`)))) === '["owner","invoiceId","createdAt"]' && /pa=solo%40okaxis/.test(await (await fetch(`${DEV}/i/${soloToken}/`)).text()));

  // --- Morning digest: one combined notification across live businesses ---
  if (!PROD) {
    const received = [];
    const pushServer = createServer(async (req, res) => {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      received.push(Buffer.concat(chunks));
      res.writeHead(201); res.end();
    });
    await new Promise((resolve) => pushServer.listen(0, "127.0.0.1", resolve));
    try {
      const ua = createECDH("prime256v1"); ua.generateKeys();
      const auth = Buffer.alloc(16, 7);
      const decrypt = (body) => {
        const salt = body.subarray(0, 16);
        const asPub = body.subarray(21, 86);
        const ikm = Buffer.from(hkdfSync("sha256", ua.computeSecret(asPub), auth, Buffer.concat([Buffer.from("WebPush: info\0", "latin1"), ua.getPublicKey(), asPub]), 32));
        const d = createDecipheriv("aes-128-gcm", Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0", "latin1"), 16)), Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0", "latin1"), 12)));
        const ct = body.subarray(86);
        d.setAuthTag(ct.subarray(ct.length - 16));
        const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
        return JSON.parse(plain.subarray(0, plain.length - 1).toString());
      };
      await admin("reset", {});
      const MB = "user_e2eBooksDigest";
      const M = ownerOf(MB);
      const G = "biz_gymbook0001";
      const H = "biz_hostelbook1";
      await billing(MB, paid);
      await api("PUT", "/api/v1/workspace/", { user: MB, body: { workspace: workspace("Sharma Stores", "stores@okaxis", "S-1", 500000, -9) } });
      await api("PUT", "/api/v1/workspace/books/", { user: MB, body: { index: index(live(G), live(H, 2)), expectedOwner: M } });
      await api("PUT", `/api/v1/workspace/books/${G}/`, { user: MB, body: { workspace: workspace("Sharma Gym", "gym@okaxis", "G-1", 250000, -20), expectedOwner: M } });
      await api("PUT", `/api/v1/workspace/books/${H}/`, { user: MB, body: { workspace: workspace("Sharma Hostel", "hostel@okaxis", "H-1", 9_900_000, -60, "Ghost"), expectedOwner: M } });
      await api("PUT", "/api/v1/workspace/books/", { user: MB, body: { index: index(tomb(H, 1)), expectedOwner: M } });
      // A stale projection field for the deleted business (as if its cleanup raced): it must be ignored and dropped.
      await admin("set", { hash: `ws:projb:${M}`, field: H, value: JSON.stringify({ v: 2, name: "Sharma Hostel", open: [["inv_00000001", "H-1", "Ghost", addDays(-90), addDays(-60), 9_900_000]], plans: [] }) });
      const sub = { endpoint: `http://127.0.0.1:${pushServer.address().port}/push/mb`, keys: { p256dh: Buffer.from(ua.getPublicKey()).toString("base64url"), auth: auth.toString("base64url") }, createdAt: T };
      await admin("set", { hash: `push:subs:${M}`, field: "phone", value: JSON.stringify(sub) });
      await kvCmd(["sadd", "push:owners", M]);
      const cron = () => fetch(`${DEV}/api/cron/digest/`, { headers: { Authorization: `Bearer ${process.env.E2E_CRON_SECRET}` } }).then((x) => x.json());
      const run1 = await cron();
      const payload = received.length ? decrypt(received[0]) : null;
      check("cron: one notification for the account", run1.notified === 1 && run1.sent === 1 && received.length === 1, JSON.stringify(run1));
      check("cron: combined digest of live businesses, deleted one ignored", payload?.title === "2 invoices to chase today" && payload.body === "₹7,500 overdue. Start with Acme Traders — ₹2,500, 20 days late." && payload.url === `/app/?business=${G}`, JSON.stringify(payload));
      check("cron: the deleted business's projection field is dropped", !(H in (await hash(`ws:projb:${M}`))));
      const run2 = await cron();
      check("cron: a rerun the same day sends nothing", run2.sent === 0 && run2.notified === 0 && received.length === 1, JSON.stringify(run2));
    } finally {
      pushServer.close();
    }
  }
} catch (error) {
  check("test script ran to completion", false, String(error?.stack ?? error).slice(0, 500));
}
process.exit(check.report());
