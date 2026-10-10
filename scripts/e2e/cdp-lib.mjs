// Minimal headless-Chrome driver over the DevTools protocol (no dependencies).
import { spawn } from "node:child_process";
import { writeFileSync, mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Screenshots, backups and Chrome profiles go here — never into the repo. */
export const OUT = process.env.E2E_OUT || join(tmpdir(), "proupiqr-e2e");
mkdirSync(OUT, { recursive: true });
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Port Chrome actually bound (it picks a free one when asked for port 0). */
export async function devToolsPort(profile) {
  for (let i = 0; i < 100; i++) {
    try {
      const port = Number(readFileSync(join(profile, "DevToolsActivePort"), "utf8").split("\n")[0]);
      if (port > 0) return port;
    } catch { /* not written yet */ }
    await sleep(100);
  }
  throw new Error("chrome did not report a DevTools port");
}

// The argument is ignored: every browser gets an OS-assigned port so a leftover
// Chrome from a crashed run can never be reused by mistake.
export async function startBrowser(_unusedPort) {
  const profile = mkdtempSync(join(OUT, "profile-"));
  const chrome = spawn("google-chrome", [
    "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--window-size=1280,900",
  ], { stdio: "ignore" });
  process.on("exit", () => chrome.kill());
  const port = await devToolsPort(profile);
  let ws;
  for (let i = 0; i < 60 && !ws; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" });
      const { webSocketDebuggerUrl } = await res.json();
      ws = new WebSocket(webSocketDebuggerUrl);
      await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    } catch { ws = undefined; await sleep(200); }
  }
  if (!ws) throw new Error("chrome did not start");
  let id = 0;
  const pending = new Map();
  const b = { requests: [], errors: [], opened: [], listeners: [] };
  /** Subscribe to any DevTools event, e.g. b.on("ServiceWorker.workerRegistrationUpdated", fn). */
  b.on = (method, handler) => b.listeners.push({ method, handler });
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
    for (const l of b.listeners) if (l.method === msg.method) l.handler(msg.params);
    if (msg.method === "Network.requestWillBeSent") b.requests.push(msg.params.request.url);
    if (msg.method === "Runtime.exceptionThrown") b.errors.push(msg.params.exceptionDetails?.exception?.description?.slice(0, 300) ?? "exception");
    if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") b.errors.push(msg.params.args.map((a) => a.value ?? a.description).join(" ").slice(0, 300));
  };
  b.send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  b.eval = async (expression) => {
    const res = await b.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (res.result?.exceptionDetails) throw new Error(`${expression.slice(0, 80)} → ${JSON.stringify(res.result.exceptionDetails).slice(0, 400)}`);
    return res.result?.result?.value;
  };
  b.go = async (url, settle = 2500) => { b.requests = []; b.errors = []; await b.send("Page.navigate", { url }); await sleep(settle); };
  b.waitFor = async (expr, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await b.eval(expr)) return true; await sleep(120); } return false; };
  b.shot = async (name) => { const { result } = await b.send("Page.captureScreenshot", { format: "png" }); writeFileSync(join(OUT, name), Buffer.from(result.data, "base64")); };
  b.mobile = (on) => on
    ? b.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
    : b.send("Emulation.clearDeviceMetricsOverride");
  b.close = () => chrome.kill();
  await b.send("Page.enable"); await b.send("Runtime.enable"); await b.send("Network.enable");
  await b.send("Page.setDownloadBehavior", { behavior: "deny" });
  // Capture window.open targets instead of opening tabs.
  await b.send("Page.addScriptToEvaluateOnNewDocument", { source: "window.__opened = []; window.open = (u) => { window.__opened.push(String(u)); return null; };" });
  return b;
}

/** Results collector with PASS/FAIL lines. */
export function checker() {
  const results = [];
  const check = (name, ok, detail = "") => results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail && !ok ? ` — ${detail}` : ""}`);
  check.report = () => { console.log(results.join("\n")); return results.some((r) => r.startsWith("FAIL")) ? 1 : 0; };
  return check;
}

/** Page-side helpers injected via eval. */
export const helpers = `
window.__t = {
  btn(re, root = document) { return [...root.querySelectorAll('button, label')].find((b) => re.test(b.textContent.trim()) && b.offsetParent !== null); },
  click(re, root) { const b = this.btn(re, root); if (!b) throw new Error('no button ' + re); b.click(); return true; },
  set(id, value) { const el = document.getElementById(id); if (!el) throw new Error('no input ' + id);
    const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); return true; },
  text() { return document.body.innerText; },
  dialog() { return document.querySelector('[role=dialog]'); },
};
true`;
