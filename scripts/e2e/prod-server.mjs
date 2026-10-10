// Serves the *production* build locally: static files from .vercel/output/static
// and everything else through the real Vercel function bundle
// (.vercel/output/functions/_render.func/…/entry.mjs), with Vercel's trailing-slash
// redirect. Lets the e2e suites run against exactly what will be deployed.
//
//   PORT=4500 node scripts/e2e/prod-server.mjs   (env: KV_REST_API_URL, RAZORPAY_*, VAPID_*, …)
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = new URL("../../", import.meta.url).pathname;
const STATIC = join(ROOT, ".vercel/output/static");
const ENTRY = join(ROOT, ".vercel/output/functions/_render.func/.vercel/output/server/entry.mjs");
const PORT = Number(process.env.PORT || 4500);

// Clerk keys come from .env.local like on a developer machine; values are never printed.
if (existsSync(join(ROOT, ".env.local"))) {
  for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}

const { default: app } = await import(pathToFileURL(ENTRY).href);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp", ".avif": "image/avif", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".xml": "application/xml", ".txt": "text/plain" };

function staticFile(pathname) {
  const safe = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  const candidates = pathname.endsWith("/") ? [join(STATIC, safe, "index.html")] : [join(STATIC, safe)];
  for (const file of candidates) {
    if (file.startsWith(STATIC) && existsSync(file) && statSync(file).isFile()) return file;
  }
  return null;
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    // Vercel route: /path (no extension) → 308 /path/
    if (!url.pathname.endsWith("/") && !/\.\w+$/.test(url.pathname)) {
      res.writeHead(308, { Location: `${url.pathname}/${url.search}` });
      return res.end();
    }
    if (req.method === "GET" || req.method === "HEAD") {
      const file = staticFile(url.pathname);
      if (file) {
        res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" });
        return res.end(req.method === "HEAD" ? undefined : readFileSync(file));
      }
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
    const body = chunks.length && req.method !== "GET" && req.method !== "HEAD" ? Buffer.concat(chunks) : undefined;
    const response = await app.fetch(new Request(url, { method: req.method, headers, body }));
    const out = {};
    response.headers.forEach((value, key) => { if (key !== "set-cookie") out[key] = value; });
    const cookies = response.headers.getSetCookie?.() ?? [];
    if (cookies.length) out["set-cookie"] = cookies;
    res.writeHead(response.status, out);
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end(`prod-server error: ${error?.message ?? error}`);
  }
}).listen(PORT, "127.0.0.1", () => console.log(`prod build on http://localhost:${PORT}`));
