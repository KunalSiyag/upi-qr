// Local stand-in for the Upstash REST API (only what Pro UPI QR uses), so the
// real kv* stores and rate limits can be exercised without touching production.
import { createServer } from "node:http";

const PORT = Number(process.env.PORT || 8799);
const TOKEN = process.env.TOKEN || "test-token";
const strings = new Map();
const hashes = new Map();
const lists = new Map();
const sets = new Map();
const expiry = new Map();
const log = [];
const stats = { bytesOut: 0, requests: 0 };

const now = () => Date.now();
function alive(key) {
  const at = expiry.get(key);
  if (at !== undefined && at <= now()) { strings.delete(key); hashes.delete(key); lists.delete(key); expiry.delete(key); }
}
const get = (k) => { alive(k); return strings.has(k) ? strings.get(k) : null; };
const set = (k, v) => { strings.set(k, String(v)); expiry.delete(k); };

function evalScript(script, keys, args) {
  if (script.includes("redis.call('INCR', KEYS[1])") && script.includes("TTL")) {
    const count = Number(get(keys[0]) || 0) + 1;
    strings.set(keys[0], String(count));
    if (count === 1) expiry.set(keys[0], now() + Number(args[0]) * 1000);
    return [count, Math.ceil(((expiry.get(keys[0]) ?? now()) - now()) / 1000)];
  }
  if (script.includes("return { redis.call('GET', KEYS[1]), redis.call('GET', KEYS[2]) }")) return [get(keys[0]), get(keys[1])];
  if (script.includes("if rev ~= tonumber(ARGV[2]) then return -1 end")) {
    const rev = Number(get(keys[1]) || 0);
    if (rev !== Number(args[1])) return -1;
    set(keys[0], args[0]);
    set(keys[1], rev + 1);
    return rev + 1;
  }
  if (script.includes("'NX', 'EX'")) {
    if (get(keys[0]) !== null) return 0;
    set(keys[0], args[0]);
    expiry.set(keys[0], now() + Number(args[1]) * 1000);
    set(keys[1], Number(get(keys[1]) || 0) + 1);
    return 1;
  }
  throw new Error("fake-upstash: unknown script");
}

function run(cmd) {
  const [name, ...a] = cmd;
  const op = String(name).toLowerCase();
  log.push(op);
  switch (op) {
    case "get": return get(a[0]);
    case "set": {
      const opts = a.slice(2).map((x) => String(x).toUpperCase());
      if (opts.includes("NX") && get(a[0]) !== null) return null;
      set(a[0], a[1]);
      const ex = opts.indexOf("EX");
      if (ex >= 0) expiry.set(a[0], now() + Number(a[2 + ex + 1]) * 1000);
      return "OK";
    }
    case "del": { let n = 0; for (const k of a) { if (strings.delete(k) | hashes.delete(k) | lists.delete(k) | sets.delete(k)) n++; expiry.delete(k); } return n; }
    case "sadd": { const st = sets.get(a[0]) ?? new Set(); let n = 0; for (const m of a.slice(1)) if (!st.has(String(m))) { st.add(String(m)); n++; } sets.set(a[0], st); return n; }
    case "srem": { const st = sets.get(a[0]); let n = 0; for (const m of a.slice(1)) if (st?.delete(String(m))) n++; return n; }
    case "smembers": return [...(sets.get(a[0]) ?? [])];
    case "scard": return (sets.get(a[0]) ?? new Set()).size;
    case "incrby": { const n = Number(get(a[0]) || 0) + Number(a[1]); strings.set(a[0], String(n)); return n; }
    case "incr": { const n = Number(get(a[0]) || 0) + 1; strings.set(a[0], String(n)); return n; }
    case "expire": { if (!strings.has(a[0]) && !hashes.has(a[0]) && !lists.has(a[0]) && !sets.has(a[0])) return 0; expiry.set(a[0], now() + Number(a[1]) * 1000); return 1; }
    case "mget": return a.map((k) => get(k));
    case "hget": { alive(a[0]); return hashes.get(a[0])?.get(a[1]) ?? null; }
    case "hgetall": { alive(a[0]); return [...(hashes.get(a[0]) ?? new Map())].flat(); }
    case "hset": { const h = hashes.get(a[0]) ?? new Map(); let n = 0; for (let i = 1; i < a.length; i += 2) { if (!h.has(a[i])) n++; h.set(a[i], String(a[i + 1])); } hashes.set(a[0], h); return n; }
    case "hdel": { const h = hashes.get(a[0]); let n = 0; for (const f of a.slice(1)) if (h?.delete(f)) n++; return n; }
    case "lpush": { const l = lists.get(a[0]) ?? []; for (const v of a.slice(1)) l.unshift(String(v)); lists.set(a[0], l); return l.length; }
    case "ltrim": { const l = lists.get(a[0]) ?? []; const end = Number(a[2]); lists.set(a[0], l.slice(Number(a[1]), end < 0 ? l.length + end + 1 : end + 1)); return "OK"; }
    case "lrange": { const l = lists.get(a[0]) ?? []; const end = Number(a[2]); return l.slice(Number(a[1]), end < 0 ? l.length + end + 1 : end + 1); }
    case "eval": { const n = Number(a[1]); return evalScript(a[0], a.slice(2, 2 + n), a.slice(2 + n)); }
    default: throw new Error(`fake-upstash: unsupported ${op}`);
  }
}

const b64 = (v) => (typeof v === "string" ? (v === "OK" ? v : Buffer.from(v).toString("base64")) : Array.isArray(v) ? v.map(b64) : v);

createServer(async (req, res) => {
  const send = (status, data) => {
    const payload = JSON.stringify(data);
    if (!req.url?.startsWith("/__admin")) { stats.bytesOut += Buffer.byteLength(payload); stats.requests++; }
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(payload);
  };
  try {
    await handle(req, send);
  } catch (error) {
    send(400, { error: String(error?.message ?? error) });
  }
}).listen(PORT, "127.0.0.1", () => console.log(`fake-upstash on ${PORT}`));

async function handle(req, send) {
  let body = "";
  for await (const chunk of req) body += chunk;
  if (req.url === "/__admin/health") return send(200, { ok: true });
  if (req.url === "/__admin/stats") { const out = { ...stats }; if (body.includes("reset")) { stats.bytesOut = 0; stats.requests = 0; } return send(200, out); }
  if (req.url === "/__admin/delprefix") { const { prefix } = JSON.parse(body); let n = 0; for (const k of [...strings.keys()]) if (k.startsWith(prefix)) { strings.delete(k); n++; } return send(200, { deleted: n }); }
  if (req.url === "/__admin/bulk") { for (const [k, v] of JSON.parse(body)) strings.set(k, v); return send(200, { ok: true }); }
  if (req.url === "/__admin/keys") return send(200, { keys: [...strings.keys(), ...hashes.keys(), ...lists.keys(), ...sets.keys()] });
  if (req.url === "/__admin/set") { const { key, value, hash, field } = JSON.parse(body); if (hash) run(["hset", hash, field, value]); else set(key, value); return send(200, { ok: true }); }
  if (req.url === "/__admin/get") { const { key, list, hash, set: setKey } = JSON.parse(body); return send(200, { value: list ? lists.get(list) ?? [] : hash ? Object.fromEntries(hashes.get(hash) ?? []) : setKey ? [...(sets.get(setKey) ?? [])] : get(key) }); }
  if (req.url === "/__admin/reset") { strings.clear(); hashes.clear(); lists.clear(); sets.clear(); expiry.clear(); return send(200, { ok: true }); }
  if (req.headers.authorization !== `Bearer ${TOKEN}`) return send(401, { error: "Unauthorized" });
  const encode = req.headers["upstash-encoding"] === "base64" ? b64 : (v) => v;
  try {
    const parsed = JSON.parse(body || "[]");
    if (req.url?.startsWith("/pipeline") || req.url?.startsWith("/multi-exec")) {
      return send(200, parsed.map((cmd) => { try { return { result: encode(run(cmd)) }; } catch (e) { return { error: String(e.message) }; } }));
    }
    return send(200, { result: encode(run(parsed)) });
  } catch (error) {
    return send(400, { error: String(error.message) });
  }
}
