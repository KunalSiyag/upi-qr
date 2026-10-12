// MCP server (Claude connector at /mcp/): both protocol eras, header validation,
// errors, and every tool's arithmetic. Runs under Node:
//   node --experimental-strip-types scripts/mcp.test.mjs
import assert from "node:assert/strict";
import jsQR from "jsqr";
import { PNG } from "pngjs"; // qrcode's own PNG encoder dependency
import { decodeHeaderValue, handleMcpHttp, LEGACY_VERSIONS, SUPPORTED_VERSIONS } from "../src/lib/mcp/protocol.ts";
import { findErrorCode, formatInr, posterUrl, proUpiQrServer, rupeesInWords, rupeesToPaise, searchCatalog } from "../src/lib/mcp/tools.ts";
import { parseUpiUri } from "../src/lib/upi-uri.ts";
import { UPI_ERROR_CODES } from "../src/data/upiErrorCodes.ts";

const CATALOG = [
  { name: "Rent Receipt Generator", href: "/rent-receipt-generator/", description: "HRA-ready monthly rent receipts with a revenue stamp box.", topic: "Documents" },
  { name: "Restaurant Menu QR", href: "/menu-qr-generator/", description: "Table QR codes that open your menu.", topic: "UPI QR generators" },
  { name: "Salary Slip Generator", href: "/salary-slip-generator/", description: "Monthly payslips with earnings and deductions.", topic: "Documents" },
];
let today = "2026-10-12";
const server = proUpiQrServer({ catalog: CATALOG, today: () => today });
const SITE = "https://www.proupiqr.in";
const MODERN = "2026-07-28";

let refusal = null;
let gateCalls = 0;
const options = {
  allowedOrigins: [SITE, "https://claude.ai"],
  maxBodyBytes: 4096,
  beforeToolCall: async () => { gateCalls += 1; return refusal; },
};

async function send(body, { headers = {}, method = "POST", raw = false } = {}) {
  const init = { method, headers: { "content-type": "application/json", ...headers } };
  if (method === "POST") init.body = raw ? body : JSON.stringify(body);
  const res = await handleMcpHttp(new Request(`${SITE}/mcp/`, init), server, options);
  const text = await res.text();
  return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : null };
}
const legacy = (method, params, extra = {}) => send({ jsonrpc: "2.0", id: 7, method, ...(params ? { params } : {}) }, { headers: { "mcp-protocol-version": "2025-11-25", ...extra } });
const meta = (version = MODERN) => ({ "io.modelcontextprotocol/protocolVersion": version, "io.modelcontextprotocol/clientInfo": { name: "test", version: "1" }, "io.modelcontextprotocol/clientCapabilities": {} });
function modern(method, params = {}, { headers = {}, version = MODERN } = {}) {
  const name = params.name ?? params.uri;
  return send(
    { jsonrpc: "2.0", id: "m-1", method, params: { ...params, _meta: meta(version) } },
    { headers: { "mcp-protocol-version": version, "mcp-method": method, ...(name ? { "mcp-name": name } : {}), ...headers } },
  );
}
const call = async (name, args) => (await legacy("tools/call", { name, arguments: args })).body.result;
const text = (result) => result.content.map((c) => c.text ?? "").join("\n");

/* ---------- Legacy era (initialize handshake) ---------- */

{
  const init = await send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "Claude", version: "1" } } });
  assert.equal(init.status, 200);
  assert.equal(init.body.result.protocolVersion, "2025-06-18", "echoes a legacy version it speaks");
  assert.deepEqual(init.body.result.capabilities, { tools: { listChanged: false } });
  assert.equal(init.body.result.serverInfo.name, "proupiqr");
  assert.match(init.body.result.instructions, /nothing sent to them is stored/);
  assert.equal(init.headers.get("mcp-session-id"), null, "stateless: no session is minted");
  assert.equal(init.headers.get("content-type"), "application/json; charset=utf-8");
  assert.equal(init.headers.get("cache-control"), "no-store");

  const old = await send({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {} } });
  assert.equal(old.body.result.protocolVersion, LEGACY_VERSIONS[0], "unknown request → newest legacy version");

  const note = await send({ jsonrpc: "2.0", method: "notifications/initialized" });
  assert.equal(note.status, 202);
  assert.equal(note.body, null, "notifications get an empty 202");
  assert.equal((await send({ jsonrpc: "2.0", id: 9, result: {} })).status, 202, "a stray response is accepted");

  const list = await legacy("tools/list");
  assert.equal(list.status, 200);
  const names = list.body.result.tools.map((t) => t.name);
  assert.deepEqual(names, ["create_upi_payment_link", "generate_upi_qr_code", "read_upi_link", "explain_upi_error", "calculate_gst", "calculate_msmed_interest", "calculate_upi_mdr", "amount_in_words", "find_merchant_tools"]);
  for (const tool of list.body.result.tools) {
    assert.equal(tool.inputSchema.type, "object", tool.name);
    assert.ok(tool.description.length > 60 && tool.title, tool.name);
    assert.deepEqual(tool.annotations, { title: tool.title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
    assert.ok(/^[a-z_]{1,64}$/.test(tool.name));
  }
  assert.equal(list.body.result.resultType, undefined, "legacy results carry no modern fields");
  assert.equal((await send({ jsonrpc: "2.0", id: 3, method: "tools/list" })).status, 200, "no version header = 2025-03-26 client");

  const bad = await legacy("tools/list", undefined, { "mcp-protocol-version": "1999-01-01" });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.code, -32022);
  assert.deepEqual(bad.body.error.data.supported, SUPPORTED_VERSIONS);

  assert.deepEqual((await legacy("ping")).body.result, {});
  assert.deepEqual((await legacy("resources/list")).body.result, { resources: [] });
  assert.deepEqual((await legacy("prompts/list")).body.result, { prompts: [] });
  const missing = await legacy("completion/complete", {});
  assert.equal(missing.status, 200);
  assert.equal(missing.body.error.code, -32601);
}

/* ---------- Modern era (2026-07-28, per-request metadata) ---------- */

{
  const discover = await modern("server/discover");
  assert.equal(discover.status, 200);
  const r = discover.body.result;
  assert.equal(r.resultType, "complete");
  assert.deepEqual(r.supportedVersions, SUPPORTED_VERSIONS);
  assert.ok(r.supportedVersions.includes(MODERN) && r.supportedVersions.includes("2025-06-18"));
  assert.deepEqual(r.capabilities, { tools: {} });
  assert.ok(r.ttlMs >= 0 && r.cacheScope === "public");
  assert.equal(r._meta["io.modelcontextprotocol/serverInfo"].name, "proupiqr");

  const list = await modern("tools/list");
  assert.equal(list.body.result.resultType, "complete");
  assert.equal(list.body.result.tools.length, 9);
  assert.ok(Number.isInteger(list.body.result.ttlMs) && list.body.result.cacheScope === "public");

  const called = await modern("tools/call", { name: "amount_in_words", arguments: { amount: 1500 } });
  assert.equal(called.status, 200);
  assert.equal(called.body.id, "m-1");
  assert.equal(called.body.result.resultType, "complete");
  assert.match(text(called.body.result), /One Thousand Five Hundred Rupees Only/);
  assert.ok(called.body.result._meta["io.modelcontextprotocol/serverInfo"]);

  const encoded = await modern("tools/call", { name: "amount_in_words", arguments: { amount: 1 } }, { headers: { "mcp-name": `=?base64?${Buffer.from("amount_in_words").toString("base64")}?=` } });
  assert.equal(encoded.status, 200, "Mcp-Name may be base64-sentinel encoded");

  const expectHeaderError = async (result, label) => {
    assert.equal(result.status, 400, label);
    assert.equal(result.body.error.code, -32020, label);
  };
  await expectHeaderError(await send({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: meta() } }, { headers: { "mcp-method": "tools/list" } }), "missing MCP-Protocol-Version");
  await expectHeaderError(await send({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: meta() } }, { headers: { "mcp-protocol-version": "2025-11-25", "mcp-method": "tools/list" } }), "header ≠ body version");
  await expectHeaderError(await send({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: meta() } }, { headers: { "mcp-protocol-version": MODERN } }), "missing Mcp-Method");
  await expectHeaderError(await modern("tools/list", {}, { headers: { "mcp-method": "tools/call" } }), "Mcp-Method ≠ body method");
  await expectHeaderError(await modern("tools/call", { name: "amount_in_words", arguments: {} }, { headers: { "mcp-name": "calculate_gst" } }), "Mcp-Name ≠ body name");
  await expectHeaderError(await send({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "amount_in_words", arguments: {}, _meta: meta() } }, { headers: { "mcp-protocol-version": MODERN, "mcp-method": "tools/call" } }), "missing Mcp-Name");

  const future = await modern("tools/list", {}, { version: "2099-01-01" });
  assert.equal(future.status, 400);
  assert.equal(future.body.error.code, -32022);
  assert.equal(future.body.error.data.requested, "2099-01-01");
  assert.deepEqual(future.body.error.data.supported, SUPPORTED_VERSIONS);

  const noCaps = await send({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: { "io.modelcontextprotocol/protocolVersion": MODERN } } }, { headers: { "mcp-protocol-version": MODERN, "mcp-method": "tools/list" } });
  assert.equal(noCaps.status, 400);
  assert.equal(noCaps.body.error.code, -32602, "clientCapabilities is required");

  const headerOnly = await send({ jsonrpc: "2.0", id: 1, method: "tools/list" }, { headers: { "mcp-protocol-version": MODERN, "mcp-method": "tools/list" } });
  assert.equal(headerOnly.status, 400);
  assert.equal(headerOnly.body.error.code, -32602, "a modern header without _meta is malformed");

  const ping = await modern("ping");
  assert.equal(ping.status, 404, "ping was removed in 2026-07-28");
  assert.equal(ping.body.error.code, -32601);
}

assert.equal(decodeHeaderValue("=?base64?SGVsbG8sIOS4lueVjA==?="), "Hello, 世界");
assert.equal(decodeHeaderValue("plain_name"), "plain_name");
assert.equal(decodeHeaderValue("=?base64?/w==?="), null, "invalid UTF-8 is refused");

/* ---------- Transport edges ---------- */

{
  for (const method of ["GET", "DELETE", "PUT"]) {
    const res = await send(null, { method });
    assert.equal(res.status, 405, method);
    assert.equal(res.headers.get("allow"), "POST, OPTIONS");
  }
  const preflight = await send(null, { method: "OPTIONS", headers: { origin: "https://claude.ai" } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), "https://claude.ai");
  assert.match(preflight.headers.get("access-control-allow-headers"), /Mcp-Method/);
  assert.equal((await send(null, { method: "OPTIONS", headers: { origin: "https://evil.example" } })).status, 403);
  const evil = await legacy("tools/list", undefined, { origin: "https://evil.example" });
  assert.equal(evil.status, 403, "unknown browser origins are refused (DNS rebinding guard)");
  const ours = await legacy("tools/list", undefined, { origin: SITE });
  assert.equal(ours.status, 200);
  assert.equal(ours.headers.get("access-control-allow-origin"), SITE);

  assert.equal((await send({ jsonrpc: "2.0", id: 1, method: "ping" }, { headers: { "content-type": "text/plain" } })).status, 415);
  const parse = await send("{nope", { raw: true });
  assert.equal(parse.status, 400);
  assert.equal(parse.body.error.code, -32700);
  assert.equal((await send([{ jsonrpc: "2.0", id: 1, method: "ping" }])).status, 400, "no batches");
  assert.equal((await send({ id: 1, method: "ping" })).status, 400, "jsonrpc 2.0 required");
  assert.equal((await send({ jsonrpc: "2.0", id: null, method: "ping" })).status, 400, "null ids are not allowed");
  assert.equal((await send({ jsonrpc: "2.0", id: 1, method: "ping", params: [] })).status, 400);
  assert.equal((await send({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "read_upi_link", arguments: { link: "x".repeat(5000) } } })).status, 413, "body size cap");

  const unknown = await legacy("tools/call", { name: "transfer_money", arguments: {} });
  assert.equal(unknown.body.error.code, -32602);
  const badArgs = await legacy("tools/call", { name: "amount_in_words", arguments: "1500" });
  assert.equal(badArgs.body.error.code, -32602);

  gateCalls = 0;
  await legacy("tools/list");
  assert.equal(gateCalls, 0, "only tool calls pass the gate");
  refusal = "Too many requests from this network. Try again in 30 seconds.";
  const limited = await call("amount_in_words", { amount: 5 });
  assert.equal(limited.isError, true);
  assert.match(text(limited), /Too many requests/);
  refusal = null;
  assert.equal(gateCalls, 1);

  const crashing = proUpiQrServer({ catalog: [] });
  crashing.tools = [{ name: "boom", title: "Boom", description: "x", inputSchema: { type: "object" }, run() { throw new Error("secret detail"); } }];
  const res = await handleMcpHttp(new Request(`${SITE}/mcp/`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "boom" } }) }), crashing, options);
  const crashed = (await res.json()).result;
  assert.equal(crashed.isError, true);
  assert.doesNotMatch(text(crashed), /secret detail/, "internal errors are not echoed");
}

/* ---------- Money parsing: integer paise, no floating point ---------- */

assert.equal(rupeesToPaise("1,250.50", 1e12), 125050);
assert.equal(rupeesToPaise("₹ 1,25,000", 1e12), 12500000);
assert.equal(rupeesToPaise("Rs. 499", 1e12), 49900);
assert.equal(rupeesToPaise("500 rupees", 1e12), 50000);
assert.equal(rupeesToPaise(0.07, 1e12), 7, "0.07 × 100 is 7.000000000000001 in floating point");
assert.equal(rupeesToPaise(1250.5, 1e12), 125050);
assert.equal(rupeesToPaise("12.345", 1e12), null);
assert.equal(rupeesToPaise(-5, 1e12), null);
assert.equal(rupeesToPaise("1e5", 1e12), null);
assert.equal(rupeesToPaise("100.01", 10000), null, "over the cap");
assert.equal(formatInr(12500050), "₹1,25,000.50");
assert.equal(formatInr(123456789012), "₹1,23,45,67,890.12");
assert.equal(formatInr(5), "₹0.05");

/* ---------- create_upi_payment_link ---------- */

{
  const r = await call("create_upi_payment_link", { upi_id: "ramesh@okaxis", payee_name: "Ramesh Stores", amount: "1,250.50", note: "Invoice 42" });
  assert.equal(r.isError, undefined);
  assert.equal(r.structuredContent.upi_uri, "upi://pay?pa=ramesh%40okaxis&pn=Ramesh+Stores&cu=INR&am=1250.50&tn=Invoice+42");
  assert.equal(r.structuredContent.amount_paise, 125050);
  const back = parseUpiUri(r.structuredContent.upi_uri);
  assert.equal(back.pa, "ramesh@okaxis");
  assert.equal(back.pn, "Ramesh Stores");
  assert.equal(back.amountPaise, 125050);
  assert.equal(back.tn, "Invoice 42");
  assert.match(text(r), /₹1,250\.50/);

  // The poster link carries the payment in the #fragment, which GeneratorForm reads back.
  const poster = r.structuredContent.qr_and_poster_url;
  assert.ok(poster.startsWith(`${SITE}/#pay?`));
  assert.equal(new URL(poster).search, "", "nothing in the query string (servers would log it)");
  const fromFragment = parseUpiUri(`upi://pay?${new URL(poster).hash.slice(5)}`);
  assert.deepEqual([fromFragment.pa, fromFragment.pn, fromFragment.am, fromFragment.tn], ["ramesh@okaxis", "Ramesh Stores", "1250.50", "Invoice 42"]);

  const open = await call("create_upi_payment_link", { upi_id: "9876543210@ybl", payee_name: "Asha" });
  assert.equal(open.structuredContent.amount_paise, null);
  assert.ok(!open.structuredContent.upi_uri.includes("am="), "no amount: the payer types it");
  assert.equal((await call("create_upi_payment_link", { upi_id: "ramesh", payee_name: "R" })).isError, true);
  assert.equal((await call("create_upi_payment_link", { upi_id: "ramesh@okaxis" })).isError, true);
  assert.equal((await call("create_upi_payment_link", { upi_id: "ramesh@okaxis", payee_name: "R", amount: "0" })).isError, true);
  assert.equal((await call("create_upi_payment_link", { upi_id: "ramesh@okaxis", payee_name: "R", amount: "10.999" })).isError, true);
  assert.equal((await call("create_upi_payment_link", { upi_id: "ramesh@okaxis", payee_name: "R", note: "n".repeat(81) })).isError, true);
  assert.equal((await call("create_upi_payment_link", { upi_id: "ramesh@okaxis", payee_name: "R\u0000x" })).isError, true);
  const big = await call("create_upi_payment_link", { upi_id: "ramesh@okaxis", payee_name: "R", amount: 150000 });
  assert.match(text(big), /₹1,00,000/, "warns above the usual ₹1 lakh UPI limit");
  assert.equal(big.structuredContent.amount_inr, "150000.00");
}

/* ---------- generate_upi_qr_code: the PNG scans back to the exact link ---------- */

{
  const r = await call("generate_upi_qr_code", { upi_id: "shop@oksbi", payee_name: "Shree Kirana", amount: 99.5, size: 400 });
  const image = r.content.find((c) => c.type === "image");
  assert.equal(image.mimeType, "image/png");
  const png = PNG.sync.read(Buffer.from(image.data, "base64"));
  assert.equal(png.width, 400);
  const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  assert.ok(decoded, "QR decodes");
  assert.equal(decoded.data, r.structuredContent.upi_uri);
  assert.equal(parseUpiUri(decoded.data).amountPaise, 9950);
  const plain = PNG.sync.read(Buffer.from((await call("generate_upi_qr_code", { upi_id: "shop@oksbi", payee_name: "S" })).content[1].data, "base64"));
  assert.equal(plain.width, 512, "default size");
  assert.equal((await call("generate_upi_qr_code", { upi_id: "shop@oksbi", payee_name: "S", size: 199 })).isError, true);
  assert.equal((await call("generate_upi_qr_code", { upi_id: "shop@oksbi", payee_name: "S", size: 1001 })).isError, true);
}

/* ---------- read_upi_link ---------- */

{
  const ok = await call("read_upi_link", { link: "upi://pay?pa=ramesh%40okaxis&pn=Ramesh+Stores&cu=INR&am=1250.50&tn=Invoice+42" });
  assert.equal(ok.structuredContent.valid, true);
  assert.equal(ok.structuredContent.amount_paise, 125050);
  assert.deepEqual(ok.structuredContent.warnings, []);
  assert.match(text(ok), /pays Ramesh Stores at ramesh@okaxis/);
  assert.match(text(ok), /never need to enter your UPI PIN to receive money/);

  const mandate = await call("read_upi_link", { link: "upi://mandate?pa=sub@okicici&pn=Sub&am=99" });
  assert.match(mandate.structuredContent.warnings[0], /AutoPay mandate/);
  assert.doesNotMatch(text(mandate), /Open this payment/, "no poster for a mandate");
  assert.equal((await call("read_upi_link", { link: "upi://pay?pn=Nobody" })).structuredContent.valid, false);
  assert.equal((await call("read_upi_link", { link: "upi://pay?pa=a@okaxis&pn=A&am=12.345" })).structuredContent.valid, false);
  assert.equal((await call("read_upi_link", { link: "upi://pay?pa=a@okaxis&pn=A&cu=USD" })).structuredContent.valid, false);
  const urlParam = await call("read_upi_link", { link: "upi://pay?pa=a@okaxis&pn=A&url=https://evil.example" });
  assert.equal(urlParam.structuredContent.valid, true);
  assert.ok(urlParam.structuredContent.warnings.some((w) => /reference URL/.test(w)));
  assert.equal((await call("read_upi_link", { link: "https://pay.example/x" })).isError, true);
  assert.equal((await call("read_upi_link", { link: "hello" })).isError, true);
}

/* ---------- explain_upi_error ---------- */

{
  assert.equal(findErrorCode("U30").code, "U30");
  assert.equal(findErrorCode("error code zm").code, "ZM");
  assert.equal(findErrorCode("Transaction failed (U16)").code, "U16");
  assert.equal(findErrorCode("debit has been failed").code, "U30");
  assert.equal(findErrorCode("I am stuck"), undefined, "a lowercase word is not the AM code");
  assert.equal(findErrorCode("Q99"), undefined);
  for (const item of UPI_ERROR_CODES) assert.equal(findErrorCode(item.code)?.code, item.code, item.code);
  const r = await call("explain_upi_error", { code: "U30" });
  assert.match(text(r), /^U30: /);
  assert.equal(r.structuredContent.url, `${SITE}/upi-error-codes/#u30`);
  assert.equal((await call("explain_upi_error", { code: "Q99" })).isError, true);
}

/* ---------- calculate_gst ---------- */

{
  const add = (await call("calculate_gst", { amount: 1000, rate_percent: 18 })).structuredContent;
  assert.deepEqual([add.taxable_paise, add.cgst_paise, add.sgst_paise, add.igst_paise, add.gst_paise, add.total_paise], [100000, 9000, 9000, 0, 18000, 118000]);
  const out = (await call("calculate_gst", { amount: "1180", rate_percent: "18%", price_includes_gst: true, supply: "inter_state" })).structuredContent;
  assert.deepEqual([out.taxable_paise, out.igst_paise, out.total_paise], [100000, 18000, 118000]);
  const odd = (await call("calculate_gst", { amount: "999.99", rate_percent: 5 })).structuredContent;
  assert.equal(odd.gst_paise, 5000, "round(99999 × 5%) = round(4999.95)");
  assert.equal(odd.cgst_paise + odd.sgst_paise, odd.gst_paise, "halves add up to the paisa");
  const half = await call("calculate_gst", { amount: 100, rate_percent: 5 });
  assert.match(text(half), /CGST 2\.5%/);
  assert.equal((await call("calculate_gst", { amount: 100, rate_percent: 101 })).isError, true);
  assert.equal((await call("calculate_gst", { amount: 100, rate_percent: 18, supply: "abroad" })).isError, true);
}

/* ---------- calculate_msmed_interest (reference values from Python Decimal) ---------- */

{
  const r = (await call("calculate_msmed_interest", { amount: 100000, invoice_date: "2026-03-01" })).structuredContent;
  assert.equal(r.deadline, "2026-04-15");
  assert.equal(r.days_late, 180);
  assert.equal(r.interest_paise, 894097, "₹1,00,000 × ((1 + 17.25/1200)^6 − 1) = 894096.63 paise");
  assert.equal(r.total_paise, 10894097);
  const r2 = (await call("calculate_msmed_interest", { amount: 100000, invoice_date: "2026-03-01", paid_on: "2026-10-13" })).structuredContent;
  assert.equal(r2.interest_paise, 899281, "181 days → 6.0333 months → 899280.78 paise");
  const capped = await call("calculate_msmed_interest", { amount: 100000, invoice_date: "2026-03-01", credit_days: 90 });
  assert.equal(capped.structuredContent.deadline, "2026-04-15", "credit beyond 45 days is capped");
  assert.match(text(capped), /caps the agreed 90 days at 45/);
  const early = (await call("calculate_msmed_interest", { amount: 5000, invoice_date: "2026-10-01", credit_days: 30 })).structuredContent;
  assert.equal(early.interest_paise, 0);
  assert.equal(early.days_late, 0);
  assert.equal((await call("calculate_msmed_interest", { amount: 5000, invoice_date: "2026-02-30" })).isError, true);
  assert.equal((await call("calculate_msmed_interest", { amount: 5000, invoice_date: "2026-05-01", paid_on: "2026-04-01" })).isError, true);
}

/* ---------- calculate_upi_mdr ---------- */

{
  today = "2026-10-12";
  const r = await call("calculate_upi_mdr", { amount: 5000 });
  assert.deepEqual([r.structuredContent.mdr_paise, r.structuredContent.gst_on_mdr_paise, r.structuredContent.merchant_keeps_paise], [2000, 360, 497640]);
  assert.match(text(r), /rules start 15 October 2026/);
  today = "2026-10-15";
  assert.doesNotMatch(text(await call("calculate_upi_mdr", { amount: 5000 })), /rules start/);
  assert.equal((await call("calculate_upi_mdr", { amount: 2000 })).structuredContent.mdr_paise, 0, "₹2,000 or less is free");
  assert.equal((await call("calculate_upi_mdr", { amount: 100000 })).structuredContent.mdr_paise, 30000, "0.4% of ₹1 lakh is ₹400, capped at ₹300");
  assert.equal((await call("calculate_upi_mdr", { amount: 5000, category: "essential" })).structuredContent.mdr_paise, 500);
  assert.equal((await call("calculate_upi_mdr", { amount: 5000, category: "capital" })).structuredContent.mdr_paise, 100);
  assert.equal((await call("calculate_upi_mdr", { amount: 5000, category: "p2p" })).structuredContent.mdr_paise, 0);
  assert.equal((await call("calculate_upi_mdr", { amount: 5000, small_merchant: true })).structuredContent.mdr_paise, 0);
  assert.equal((await call("calculate_upi_mdr", { amount: 5000, gst_registered: true })).structuredContent.merchant_keeps_paise, 498000);
  assert.equal((await call("calculate_upi_mdr", { amount: 5000, category: "crypto" })).isError, true);
  today = "2026-10-12";
}

/* ---------- amount_in_words ---------- */

assert.equal(rupeesInWords(12505050), "One Lakh Twenty Five Thousand Fifty Rupees and Fifty Paise Only");
assert.equal(rupeesInWords(50), "Fifty Paise Only");
assert.equal(rupeesInWords(0), "Zero Rupees Only");
assert.equal(rupeesInWords(99_999_999_999), "Ninety Nine Crore Ninety Nine Lakh Ninety Nine Thousand Nine Hundred Ninety Nine Rupees and Ninety Nine Paise Only");
assert.equal((await call("amount_in_words", { amount: "999999999.99" })).structuredContent.amount_paise, 99_999_999_999);
assert.equal((await call("amount_in_words", { amount: "1000000000" })).isError, true, "100 crore and up is refused");

/* ---------- find_merchant_tools ---------- */

assert.equal(searchCatalog(CATALOG, "rent receipt for HRA", 5)[0].href, "/rent-receipt-generator/");
assert.equal(searchCatalog(CATALOG, "restaurant table QR", 5)[0].href, "/menu-qr-generator/");
assert.equal(searchCatalog(CATALOG, "payslips", 5)[0].href, "/salary-slip-generator/");
assert.deepEqual(searchCatalog(CATALOG, "xyzzy", 5), []);
assert.equal(searchCatalog(CATALOG, "generator", 2).length, 2, "limit respected");
const found = await call("find_merchant_tools", { query: "rent receipt" });
assert.equal(found.structuredContent.tools[0].url, `${SITE}/rent-receipt-generator/`);

assert.equal(posterUrl("upi://pay?pa=a%40b&pn=A"), `${SITE}/#pay?pa=a%40b&pn=A`);

console.log("[mcp] both protocol eras, header validation, transport edges, and all 9 tools (QR round-trip, paise-exact GST/MSMED/MDR) passed");
