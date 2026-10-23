// The MCP server (Claude connector) through the real Astro route: both protocol
// eras, the daily count and per-network limit in KV with no tool input stored,
// and the #pay? poster link opening the generator with the payment filled in.
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { checker, startBrowser } from "./cdp-lib.mjs";

const DEV = process.env.DEV_BASE || "http://localhost:4321";
const STATIC = process.env.BASE || "http://localhost:4400";
const KV = "http://127.0.0.1:8799";
const PROD = process.env.E2E_MODE === "prod";
const check = checker();
const admin = (path, body = {}) => fetch(`${KV}/__admin/${path}`, { method: "POST", body: JSON.stringify(body) }).then((r) => r.json());
const day = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const VPA = "mcp-e2e-shop@okaxis";

const rpc = (body, headers = {}) => fetch(`${DEV}/mcp/`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "X-Real-IP": "198.51.100.90", ...headers },
  body: JSON.stringify(body),
});
const LEGACY = { "MCP-Protocol-Version": "2025-06-18" };
const meta = { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": { name: "e2e", version: "1" }, "io.modelcontextprotocol/clientCapabilities": {} };
const modern = (method, name) => ({ "MCP-Protocol-Version": "2026-07-28", "Mcp-Method": method, ...(name ? { "Mcp-Name": name } : {}) });

try {
  await admin("reset");

  // A legacy client (Claude today): initialize, then stateless requests.
  const init = await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e", version: "1" } } });
  const initBody = await init.json();
  check("legacy initialize negotiates 2025-06-18", init.status === 200 && initBody.result?.protocolVersion === "2025-06-18", JSON.stringify(initBody).slice(0, 200));
  check("no session id is minted", !init.headers.get("mcp-session-id"));
  check("the endpoint is noindex", (init.headers.get("x-robots-tag") || "").includes("noindex"));
  check("notifications/initialized → 202", (await rpc({ jsonrpc: "2.0", method: "notifications/initialized" }, LEGACY)).status === 202);
  const list = await (await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }, LEGACY)).json();
  check("nine read-only tools listed", list.result?.tools?.length === 9 && list.result.tools.every((t) => t.annotations?.readOnlyHint === true), JSON.stringify(list).slice(0, 200));
  const found = await (await rpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "find_merchant_tools", arguments: { query: "rent receipt for HRA" } } }, LEGACY)).json();
  check("find_merchant_tools searches the site's topic hubs", found.result?.structuredContent?.tools?.[0]?.url === "https://www.proupiqr.in/rent-receipt-generator/?utm_source=mcp&utm_medium=tool", JSON.stringify(found).slice(0, 300));

  // A modern (2026-07-28) client: per-request metadata, mirrored headers.
  const discover = await rpc({ jsonrpc: "2.0", id: "d", method: "server/discover", params: { _meta: meta } }, modern("server/discover"));
  const discovered = await discover.json();
  check("modern server/discover", discover.status === 200 && discovered.result?.resultType === "complete" && discovered.result.supportedVersions?.includes("2026-07-28"));
  const qr = await (await rpc({ jsonrpc: "2.0", id: "q", method: "tools/call", params: { name: "generate_upi_qr_code", arguments: { upi_id: VPA, payee_name: "MCP Shop", amount: "250", note: "Order 7" }, _meta: meta } }, modern("tools/call", "generate_upi_qr_code"))).json();
  const image = qr.result?.content?.find((c) => c.type === "image");
  const png = image ? PNG.sync.read(Buffer.from(image.data, "base64")) : null;
  const scanned = png ? jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data : null;
  check("modern tools/call returns a QR that scans to the payment", qr.result?.resultType === "complete" && scanned === qr.result.structuredContent.upi_uri && scanned.includes("am=250.00"), String(scanned));
  const mismatch = await rpc({ jsonrpc: "2.0", id: "x", method: "tools/list", params: { _meta: meta } }, modern("tools/call"));
  check("header mismatch → 400 HeaderMismatch", mismatch.status === 400 && (await mismatch.json()).error?.code === -32020);

  if (PROD) {
    // The build output routes these ahead of Vercel's trailing-slash 308 (astro.config.mjs).
    const slashless = await fetch(`${DEV}/mcp`, { method: "POST", redirect: "manual", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...LEGACY }, body: JSON.stringify({ jsonrpc: "2.0", id: 5, method: "tools/list" }) });
    check("POST /mcp (no slash) answers without a redirect", slashless.status === 200 && (await slashless.json()).result?.tools?.length === 9, String(slashless.status));
    const oauth = await fetch(`${DEV}/mcp/.well-known/oauth-protected-resource`, { redirect: "manual" });
    check("OAuth discovery under /mcp/ → 404, not a redirect (the server has no sign-in)", oauth.status === 404, String(oauth.status));
  }

  // People and browsers.
  const page = await fetch(`${DEV}/mcp/`, { headers: { Accept: "text/html" } });
  check("a browser gets a short explainer", page.status === 200 && (await page.text()).includes("This is the Pro UPI QR MCP server"));
  check("the explainer is never cached (an edge cache would replay it to MCP clients)", page.headers.get("cache-control") === "no-store" && /accept/i.test(page.headers.get("vary") || ""), `${page.headers.get("cache-control")} / ${page.headers.get("vary")}`);
  check("GET for an event stream → 405", (await fetch(`${DEV}/mcp/`, { headers: { Accept: "text/event-stream" } })).status === 405);
  check("unknown browser origin → 403", (await rpc({ jsonrpc: "2.0", id: 4, method: "tools/list" }, { Origin: "https://evil.example", ...LEGACY })).status === 403);

  // Counted per day, nothing else kept.
  const count = Number((await admin("get", { key: `metrics:mcp_tool_call:${day}` })).value || 0);
  check("tool calls are counted per day", count === 2, String(count));
  const keys = (await admin("keys")).keys;
  const values = JSON.stringify(await Promise.all(keys.map((key) => admin("get", { key }))));
  check("no tool input is stored", !values.includes("mcp-e2e-shop") && !keys.some((k) => k.includes("mcp-e2e")), keys.join(", "));

  // A runaway loop from one network gets a readable refusal after 300 calls a minute.
  let refusedAt = null;
  for (let i = 0; i < 305 && refusedAt === null; i++) {
    const r = await (await rpc({ jsonrpc: "2.0", id: 100 + i, method: "tools/call", params: { name: "amount_in_words", arguments: { amount: i + 1 } } }, { ...LEGACY, "X-Real-IP": "198.51.100.91" })).json();
    if (r.result?.isError) refusedAt = { i, text: r.result.content[0].text };
  }
  check("300 tool calls a minute per network, then a refusal the model can read", refusedAt?.i === 300 && /Too many requests/.test(refusedAt.text), JSON.stringify(refusedAt));
  const other = await (await rpc({ jsonrpc: "2.0", id: 999, method: "tools/call", params: { name: "amount_in_words", arguments: { amount: 1 } } }, { ...LEGACY, "X-Real-IP": "198.51.100.92" })).json();
  check("other networks are unaffected", other.result && !other.result.isError);

  // The poster link opens the generator with the payment filled in, and the QR renders.
  if (!PROD) {
    const b = await startBrowser();
    const link = qr.result.structuredContent.qr_and_poster_url.replace("https://www.proupiqr.in", STATIC);
    await b.go(link, 1500);
    const QR_IMG = "img[alt=\"Generated UPI QR code\"]";
    const rendered = await b.waitFor(`!!document.querySelector('${QR_IMG}')`, 15000);
    check("poster link opens the poster with the QR rendered", rendered);
    check("the amount and note are visible and editable", await b.eval("['250.00', 'Order 7'].every((v) => [...document.querySelectorAll('input')].some((i) => i.value === v))"));
    const src = rendered ? await b.eval(`document.querySelector('${QR_IMG}').src`) : "";
    const pagePng = src.startsWith("data:image/png;base64,") ? PNG.sync.read(Buffer.from(src.split(",")[1], "base64")) : null;
    const pageScan = pagePng ? jsQR(new Uint8ClampedArray(pagePng.data), pagePng.width, pagePng.height)?.data : null;
    check("the site's QR pays the same UPI ID and amount", pageScan?.includes("pa=mcp-e2e-shop%40okaxis") && pageScan.includes("am=250.00") && pageScan.includes("pn=MCP+Shop"), String(pageScan));
    check("the fragment leaves the address bar", (await b.eval("location.hash")) === "");
    check("the payment never travels to a server", !b.requests.some((u) => u.includes("mcp-e2e-shop")), b.requests.filter((u) => u.includes("mcp-e2e")).join(" "));
    b.close();
  }
} catch (error) {
  check("suite ran", false, String(error?.stack ?? error).slice(0, 400));
}
process.exit(check.report());
