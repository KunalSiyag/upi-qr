import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { WS_HI } from "../src/data/workspacePhrases.ts";

// Every English string the workspace shows through tr() must have Hindi, with the same placeholders.
const dir = new URL("../src/components/workspace/", import.meta.url);
const files = ["PaymentsWorkspace", "Sheets", "StatementSheet", "PlanPanel", "NotificationsPanel", "InstallApp", "ui", "BusinessSwitcher", "IntlSettingsCard"];
const keys = new Set();
for (const f of files) {
  const s = readFileSync(new URL(`${f}.tsx`, dir), "utf8");
  for (let i = s.indexOf("tr("); i >= 0; i = s.indexOf("tr(", i + 3)) {
    if (/[\w$]/.test(s[i - 1] ?? "")) continue;
    let j = i + 3, depth = 1;
    while (j < s.length && depth > 0) {
      const ch = s[j];
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      else if (ch === '"') { j++; while (s[j] !== '"') { if (s[j] === "\\") j++; j++; } }
      j++;
    }
    const call = s.slice(i + 3, j - 1);
    // Only string literals before the vars object count as keys.
    const head = call.split(/,\s*\{/)[0];
    for (const m of head.matchAll(/"((?:[^"\\]|\\.)*)"/g)) keys.add(m[1]);
  }
  // Label tables translated via tr(variable).
  for (const m of s.matchAll(/label: "([^"]+)"/g)) keys.add(m[1]);
}
const sheets = readFileSync(new URL("Sheets.tsx", dir), "utf8");
for (const m of sheets.match(/MODE_LABEL[^{]*\{([^}]+)\}/)[1].matchAll(/"([^"]+)"/g)) keys.add(m[1]);
const plan = readFileSync(new URL("PlanPanel.tsx", dir), "utf8");
for (const m of plan.match(/PRO_FEATURES = \[([\s\S]*?)\];/)[1].matchAll(/"([^"]+)"/g)) keys.add(m[1]);
const main = readFileSync(new URL("PaymentsWorkspace.tsx", dir), "utf8");
for (const m of main.match(/const label: Record<SyncState\["status"\], string> = \{([\s\S]*?)\};/)[1].matchAll(/: "([^"]+)"/g)) keys.add(m[1]);
for (const f of ["unpaid", "overdue", "paid", "all"]) keys.add(f);
const model = readFileSync(new URL("../src/lib/workspace/model.ts", import.meta.url), "utf8");
for (const m of model.matchAll(/key: "[a-z0-9_]+", label: "([^"]+)"/g)) keys.add(m[1]);

// Brand names, and literals that are comparison operands inside tr(cond ? "A" : "B") rather than text.
// Clients abroad (docs/spec-foreign-clients.md §5.10): codes and names stay Latin in Hindi too.
const untranslated = new Set(["Pro", "UPI", "UPI ID", "…", "yearly", "SWIFT / BIC", "LUT ARN", "IBAN", "FIRA", "FIRC", "PayPal", "Wise", "Stripe",
  "INR", "USD", "EUR", "GBP", "AED", "AUD", "CAD", "SGD"]);
const missing = [...keys].filter((k) => /[A-Za-z]/.test(k) && !untranslated.has(k) && !(k in WS_HI));
assert.deepEqual(missing, [], `Hindi missing for: ${missing.join(" | ")}`);
const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
for (const [en, hi] of Object.entries(WS_HI)) {
  assert.equal(placeholders(hi), placeholders(en), `placeholder mismatch: ${en}`);
  assert.ok(hi.trim().length > 0, `empty Hindi for ${en}`);
}
// A message that tells the user to change a field names it by the field's Hindi label, letter for letter (review round 5,
// PR 5: "बिल करने का आखिरी महीना" for the "बिल का आख़िरी महीना (वैकल्पिक)" field). Likewise "stop" a plan is never the
// bare Pause label ("रोकें"): a Hindi user told to stop it pressed Pause.
const untilLabel = WS_HI["Last month to bill (optional)"].replace(/ \(.*\)$/, "");
for (const [en, hi] of Object.entries(WS_HI)) {
  if (/the last month to bill/i.test(en)) assert.ok(hi.includes(untilLabel), `Hindi names the last-month field by its label: ${en}`);
  if (/\bstop (it|the monthly billing)\b/i.test(en)) assert.ok(!/(उसे|मासिक बिलिंग)( अभी| \{prev\} में)? रोकें/.test(hi.replace(/इस महीने के बाद रोकें/g, "")), `Hindi "stop" isn't the Pause label: ${en}`);
}
assert.ok(keys.size > 300, `expected the extractor to find the UI strings (found ${keys.size})`);
console.log(`[workspace-i18n] ${keys.size} UI strings covered in Hindi with matching placeholders`);
