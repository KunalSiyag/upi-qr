import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { checker, helpers, OUT, sleep, startBrowser } from "./cdp-lib.mjs";

const BASE = process.env.BASE || "http://localhost:4400";
const b = await startBrowser(9344);
const check = checker();
const t = async (js) => { await b.eval(helpers); return b.eval(js); };
const text = () => b.eval("document.body.innerText");
const local = () => b.eval("JSON.parse(localStorage.getItem('proupiqr-workspace-v1'))");

const T = Date.now();
// Local calendar day (the app's "today" is local time, not UTC; they differ 00:00–05:30 IST).
const iso = (n) => { const d = new Date(Date.now() + n * 86_400_000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const dmy = (offset) => { const [y, m, d] = iso(offset).split("-"); return `${d}/${m}/${y.slice(2)}`; };
const ws = {
  version: 1,
  business: { name: "Mehta Studio", upiId: "studio@okaxis", phone: "", gstin: "", invoicePrefix: "INV-", updatedAt: T },
  clients: {
    cli_rohan001: { id: "cli_rohan001", name: "Rohan Mehta", phone: "", email: "", gstin: "", createdAt: T, updatedAt: T },
    cli_acme0001: { id: "cli_acme0001", name: "Acme Traders", phone: "", email: "", gstin: "", createdAt: T, updatedAt: T },
    cli_strngr01: { id: "cli_strngr01", name: "Stranger", phone: "", email: "", gstin: "", createdAt: T, updatedAt: T },
  },
  invoices: {
    inv_rohan007: { id: "inv_rohan007", number: "INV-0007", clientId: "cli_rohan001", issueDate: iso(-20), dueDate: iso(-5), amountPaise: 450000, description: "", payments: [], reminders: [], voided: false, createdAt: T, updatedAt: T },
    inv_acme0012: { id: "inv_acme0012", number: "INV-0012", clientId: "cli_acme0001", issueDate: iso(-40), dueDate: iso(-25), amountPaise: 2500000, description: "", payments: [], reminders: [], voided: false, createdAt: T, updatedAt: T },
  },
};
// Clients abroad (docs/spec-foreign-clients.md §3.6): a US$12.34 invoice to "Stranger" is 1234 minor units, like the
// ₹1,234.00 credit from STRANGER below. It lives in the book's foreign section (sidecar) and is never suggested.
const sidecar = { owner: null, intl: { invoices: { inv_usd00050: { id: "inv_usd00050", number: "INV-0050", clientId: "cli_strngr01", issueDate: iso(-10), dueDate: iso(-1), amountPaise: 123400, currency: "USD", description: "", payments: [], reminders: [], voided: false, createdAt: T, updatedAt: T } }, recurring: {}, clients: {} } };
const csv = `HDFC BANK Ltd.,,,,,,
Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance
${dmy(-3)},UPI-ROHAN MEHTA-ROHAN@OKAXIS-HDFC0000001-412345678901-INVOICE INV-0007,0000412345678901,${dmy(-3)},,"4,500.00","54,500.00"
${dmy(-2)},UPI-SWIGGY-PAYTM-PAYM0001-512345678901-ORDER,0000512345678901,${dmy(-2)},349.00,,"54,151.00"
${dmy(-1)},UPI-ACME TRADERS-ACME@OKICICI-ICIC0000001-612345678901-PAYMENT,0000612345678901,${dmy(-1)},,"25,000.00","79,151.00"
${dmy(-1)},UPI-STRANGER-X@YBL-YESB0000001-712345678901-UPI,0000712345678901,${dmy(-1)},,"1,234.00","80,385.00"
`;
const csvPath = join(OUT, "hdfc-statement.csv");
const xlsPath = join(OUT, "statement.xlsx");
writeFileSync(csvPath, csv);
writeFileSync(xlsPath, "not really excel");

async function pickFile(path) {
  const { root } = (await b.send("DOM.getDocument", {})).result;
  const { nodeId } = (await b.send("DOM.querySelector", { nodeId: root.nodeId, selector: "[role=dialog] input[type=file]" })).result;
  await b.send("DOM.setFileInputFiles", { nodeId, files: [path] });
}

try {
  await b.send("Network.setBlockedURLs", { urls: ["*clerk.accounts.dev*", "*clerk.browser.js*"] });
  await b.go(BASE + "/app/", 300);
  await b.eval(`localStorage.clear(); localStorage.setItem('proupiqr-workspace-v1', ${JSON.stringify(JSON.stringify(ws))}); localStorage.setItem('proupiqr-intl-v1:biz_primary', ${JSON.stringify(JSON.stringify(sidecar))}); true`);
  await b.go(BASE + "/app/?tab=invoices", 2500);
  await t("__t.click(/^Import bank statement$/)");
  await b.waitFor("!!document.querySelector('[role=dialog] input[type=file]')");
  check("privacy promise shown", /never uploaded/.test(await b.eval("document.querySelector('[role=dialog]').innerText")));

  await pickFile(xlsPath);
  await b.waitFor("/download the statement as CSV/i.test(document.querySelector('[role=dialog]').innerText)", 5000);
  check("Excel file gets a CSV hint", true);

  await pickFile(csvPath);
  await b.waitFor("/Found 2 that look like payments/.test(document.querySelector('[role=dialog]').innerText)", 5000);
  const dialog = await b.eval("document.querySelector('[role=dialog]').innerText");
  check("reads 3 credits, ignores the debit", /Read 3 incoming payments/.test(dialog), dialog.slice(0, 400));
  check("both invoices matched with reasons", /₹4,500 on .* → INV-0007 · Rohan Mehta/.test(dialog) && /₹25,000 on .* → INV-0012 · Acme Traders/.test(dialog) && /mentions INV-0007/.test(dialog));
  const tickedNow = await b.eval("[...document.querySelectorAll('[role=dialog] input[type=checkbox]')].map(c => c.checked)");
  check("confident match pre-ticked, weaker one left for review", JSON.stringify(tickedNow.sort()) === JSON.stringify([false, true]), JSON.stringify(tickedNow));
  check("unmatched credit listed separately", /1 other credit not matched/.test(dialog));
  check("a ₹ credit equal in minor units to a US$ invoice isn't suggested for it", !/INV-0050/.test(dialog) && !/₹1,234 on .* →/.test(dialog), dialog.slice(0, 500));
  await b.eval("[...document.querySelectorAll('[role=dialog] input[type=checkbox]')].forEach(c => { if (!c.checked) c.click(); }); true");
  await t("__t.click(/^Record 2 payments$/, __t.dialog())");
  await b.waitFor("!document.querySelector('[role=dialog]')", 5000);
  check("flash confirms", /Recorded 2 payments from your statement/.test(await text()));
  const data = await local();
  const rohan = data.invoices.inv_rohan007.payments[0];
  check("payment recorded with date, UTR and UPI mode", rohan && rohan.amountPaise === 450000 && rohan.reference === "412345678901" && rohan.mode === "upi" && rohan.date === iso(-3), JSON.stringify(rohan));
  check("both invoices now paid", data.invoices.inv_acme0012.payments[0]?.amountPaise === 2500000);
  const side = await b.eval("JSON.parse(localStorage.getItem('proupiqr-intl-v1:biz_primary') || 'null')");
  check("the US$ invoice is untouched and stays in its sidecar", side?.intl?.invoices?.inv_usd00050?.payments?.length === 0 && !JSON.stringify(data).includes("inv_usd00050"), JSON.stringify(side).slice(0, 200));

  // Importing the same statement again changes nothing.
  await t("__t.click(/^Import bank statement$/)");
  await b.waitFor("!!document.querySelector('[role=dialog] input[type=file]')");
  await pickFile(csvPath);
  await b.waitFor("/already recorded/.test(document.querySelector('[role=dialog]').innerText)", 5000);
  const second = await b.eval("document.querySelector('[role=dialog]').innerText");
  check("re-import: 2 already recorded, nothing new to record", /2 already recorded/.test(second) && /None of them match/.test(second), second.slice(0, 300));
  check("no console errors (excluding blocked Clerk)", b.errors.filter((e) => !/clerk|ERR_BLOCKED|Failed to load/i.test(e)).length === 0, b.errors.join(" | "));
} catch (error) {
  check("test script ran to completion", false, String(error).slice(0, 500));
} finally {
  b.close();
}
process.exit(check.report());
