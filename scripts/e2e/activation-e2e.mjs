import { checker, helpers, sleep, startBrowser } from "./cdp-lib.mjs";

const BASE = "http://localhost:4400";
const b = await startBrowser(9343);
const check = checker();
const t = async (js) => { await b.eval(helpers); return b.eval(js); };
const text = () => b.eval("document.body.innerText");
try {
  await b.send("Network.setBlockedURLs", { urls: ["*clerk.accounts.dev*", "*clerk.browser.js*"] });
  await b.go(BASE + "/app/", 300);
  await b.eval("localStorage.clear(); true");
  await b.go(BASE + "/app/", 12000); // Clerk blocked: sync waits out its 10 s check, then shows signed-out
  await b.waitFor("[...document.querySelectorAll('button')].some(b => b.textContent === 'Try with sample data')", 8000);
  await t("__t.click(/^Try with sample data$/)");
  await sleep(300);
  let page = await text();
  check("sample data fills chase list", /Sharma Traders \(sample\)[\s\S]*20 days late/.test(page) && /You're looking at sample data/.test(page));
  check("sample totals exact (₹18,500 + ₹4,500 + ₹12,000)", page.includes("₹35,000"));
  await t("__t.click(/^Remind$/)");
  await b.waitFor("!!document.getElementById('ws-reminder')");
  await t("__t.click(/^हिन्दी$/, __t.dialog())");
  const hi = await b.eval("document.getElementById('ws-reminder').value");
  check("Hindi reminder generated", /नमस्ते Sharma Traders \(sample\)/.test(hi) && /20 दिन से बकाया/.test(hi) && hi.includes("₹18,500"), hi);
  await t("__t.click(/^WhatsApp$/, __t.dialog())");
  check("WhatsApp gets the Hindi text", decodeURIComponent(await b.eval("window.__opened.at(-1)")).includes("नमस्ते"));
  await b.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await t("__t.click(/^Remind$/)");
  await b.waitFor("!!document.getElementById('ws-reminder')");
  check("language choice remembered", /नमस्ते/.test(await b.eval("document.getElementById('ws-reminder').value")));
  await t("__t.click(/^English$/, __t.dialog())");
  check("switch back to English", /^Hi Sharma Traders/.test(await b.eval("document.getElementById('ws-reminder').value")));
  await b.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await t("__t.click(/^Clear sample data$/)");
  await sleep(300);
  page = await text();
  check("clearing sample data empties the workspace", !page.includes("(sample)") && page.includes("Try with sample data"));
  check("no console errors (excluding blocked Clerk)", b.errors.filter((e) => !/clerk|ERR_BLOCKED|Failed to load/i.test(e)).length === 0, b.errors.join(" | "));
} catch (error) {
  check("test script ran to completion", false, String(error).slice(0, 500));
} finally {
  b.close();
}
process.exit(check.report());
