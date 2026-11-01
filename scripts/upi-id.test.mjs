import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  GENERATOR_VPA_RE,
  KNOWN_HANDLES,
  NEW_ID_HANDLES,
  UPI_ID_REVIEWED_ON,
  UPI_ID_SOURCES,
  checkVpa,
  knownHandle,
  reviewedLabel,
  sourceById,
  suggestLocalParts,
  suggestVpas,
} from "../src/lib/upi-id.ts";

let checks = 0;
const ok = (fn) => { fn(); checks += 1; };

// IDs with no format problem. Length and underscore rules are not asserted: NPCI's public guidelines
// define only a prefix and a handle, and apps add their own limits.
for (const id of ["sharmastores@okicici", "9876543210@ybl", "a.b-c_d@oksbi", "shop@upi", " shop@upi ", "ab@ybl", "a_b@ybl", "a@ybl", "shop@somebank", "shop@ybl1"]) {
  ok(() => assert.equal(checkVpa(id).ok, true, id));
  ok(() => assert.deepEqual(checkVpa(id).issues, [], id));
}
ok(() => assert.equal(checkVpa("Shop@UPI").hasUppercase, true));
ok(() => assert.equal(checkVpa("Shop@UPI").normalized, "shop@upi"));
ok(() => assert.equal(checkVpa("shop@upi").hasUppercase, false));
ok(() => assert.equal(checkVpa("shop@ybl").issuer, "PhonePe (Yes Bank)"));
ok(() => assert.equal(checkVpa("shop@somebank").issuer, null));
ok(() => assert.equal(checkVpa(`${"a".repeat(300)}@ybl`).ok, true, "no length cap is asserted"));

// Hard problems, and the issue each one reports. Length is not one of them.
const bad = [
  ["", ["empty"]],
  ["   ", ["empty"]],
  ["shop", ["no-at"]],
  ["shop@", ["handle-missing"]],
  ["@ybl", ["local-missing"]],
  ["@", ["local-missing", "handle-missing"]],
  ["sh op@ybl", ["space"]],
  ["shop@y bl", ["space"]],
  ["sh@op@ybl", ["many-at"]],
  ["sh$op@ybl", ["local-chars"]],
  ["sh/op@ybl", ["local-chars"]],
  ["shop@y.bl", ["handle-chars"]],
  ["shop@y-bl", ["handle-chars"]],
  ["shop@y_bl", ["handle-chars"]],
  ["shop@yb$", ["handle-chars"]],
  ["shop@@ybl", ["many-at"]],
];
for (const [id, expected] of bad) {
  const result = checkVpa(id);
  ok(() => assert.equal(result.ok, false, id));
  ok(() => assert.deepEqual(result.issues, expected, `${JSON.stringify(id)} should report ${expected}, got ${result.issues}`));
  ok(() => assert.equal(result.qrReady, false, `${id} is not for the QR generator either`));
}

// This site's QR generator is stricter than the format check, and says so separately (qrReady, not an issue).
for (const id of ["a@ybl", "shop@y", "shop@ybl1", `${"a".repeat(257)}@ybl`]) {
  ok(() => assert.equal(checkVpa(id).ok, true, id));
  ok(() => assert.equal(checkVpa(id).qrReady, false, id));
}
for (const id of ["ab@ybl", "Shop@UPI", "a_b@ybl", "9876543210@okicici"]) {
  ok(() => assert.equal(checkVpa(id).qrReady, true, id));
}
// qrReady always implies ok.
for (const id of ["", "a", "a@b", "ab@cd", "a b@cd", "ab@c.d", "@@", "ab@cd@ef", "ab@cd1", "a$b@cd"]) {
  const result = checkVpa(id);
  ok(() => assert.ok(!result.qrReady || result.ok, id));
}

// The rule above is the one GeneratorForm.tsx enforces: keep the two in step.
ok(() => {
  const form = readFileSync(new URL("../src/components/GeneratorForm.tsx", import.meta.url), "utf8");
  assert.ok(form.includes(`/${GENERATOR_VPA_RE.source}/.test(upiId.trim())`), "GeneratorForm isValidUpiId changed: update GENERATOR_VPA_RE");
});

// Handles: the Paytm handle is an older one, kept recognisable but never offered for a new ID.
ok(() => assert.equal(knownHandle("YBL").issuer, "PhonePe (Yes Bank)"));
ok(() => assert.equal(knownHandle("nope"), null));
ok(() => assert.equal(new Set(KNOWN_HANDLES.map((h) => h.handle)).size, KNOWN_HANDLES.length));
ok(() => assert.ok(KNOWN_HANDLES.every((h) => /^[a-z]+$/.test(h.handle))));
ok(() => assert.deepEqual(KNOWN_HANDLES.filter((h) => h.legacy).map((h) => h.handle), ["paytm"]));
ok(() => assert.equal(knownHandle("paytm").legacy, true));
ok(() => assert.equal(knownHandle("paytm").issuer, "Paytm, older IDs (via Yes Bank)"));
ok(() => assert.ok(KNOWN_HANDLES.every((h) => !/payments bank/i.test(h.issuer)), "no handle is labelled with Paytm Payments Bank"));
ok(() => assert.equal(checkVpa("9876543210@paytm").ok, true));
ok(() => assert.equal(checkVpa("9876543210@paytm").legacy, true));
ok(() => assert.equal(checkVpa("9876543210@paytm").issuer, "Paytm, older IDs (via Yes Bank)"));
ok(() => assert.equal(checkVpa("9876543210@ptyes").legacy, false));
ok(() => assert.equal(checkVpa("9876543210@somebank").legacy, false));
ok(() => assert.ok(!NEW_ID_HANDLES.some((h) => h.handle === "paytm"), "the new-ID list leaves out @paytm"));
ok(() => assert.deepEqual(NEW_ID_HANDLES.map((h) => h.handle).filter((h) => h.startsWith("pt")), ["ptyes", "pthdfc", "ptsbi", "ptaxis"]));
ok(() => assert.equal(NEW_ID_HANDLES.length, KNOWN_HANDLES.length - 1));
// Handles dropped because no first-party page could be opened for them.
ok(() => assert.equal(knownHandle("apl"), null));
ok(() => assert.equal(knownHandle("yapl"), null));

// Every handle and source is backed by a first-party https page.
ok(() => assert.equal(new Set(UPI_ID_SOURCES.map((s) => s.id)).size, UPI_ID_SOURCES.length));
for (const source of UPI_ID_SOURCES) {
  ok(() => assert.match(source.href, /^https:\/\/[a-z0-9.-]+\//, source.id));
  ok(() => assert.ok(source.label.length > 10 && source.short.length > 3 && source.used.length > 20, source.id));
  ok(() => assert.doesNotMatch(source.href, /[?&](pa|vpa)=/, `${source.id} carries no identifier`));
}
for (const item of KNOWN_HANDLES) ok(() => assert.equal(sourceById(item.source).id, item.source, item.handle));
ok(() => assert.throws(() => sourceById("nope")));
ok(() => assert.match(sourceById("paytm-terms").used, /15 March 2024/));

// Suggestions
ok(() => assert.deepEqual(suggestLocalParts("Sharma Kirana Store"), ["sharmakiranastore", "sharma.store", "sharmas", "sharmakiranastore.pay"]));
ok(() => assert.deepEqual(suggestLocalParts("Ravi", "98765 43210"), ["ravi", "ravi.pay", "ravi3210", "9876543210"]));
ok(() => assert.deepEqual(suggestLocalParts("Ravi", "+91 98765 43210").slice(-1), ["9876543210"]));
ok(() => assert.deepEqual(suggestLocalParts("Ravi", "12345"), ["ravi", "ravi.pay"]));
ok(() => assert.deepEqual(suggestLocalParts("राहुल"), []));
ok(() => assert.deepEqual(suggestLocalParts("José Núñez"), ["josenunez", "jose.nunez", "josen", "josenunez.pay"]));
ok(() => assert.deepEqual(suggestLocalParts(""), []));
ok(() => assert.ok(suggestLocalParts("x".repeat(80)).every((s) => s.length <= 30)));
for (const id of suggestVpas("Sharma Kirana Store", "9876543210", "OKICICI")) {
  ok(() => assert.equal(checkVpa(id).ok, true, id));
  ok(() => assert.ok(id.endsWith("@okicici"), id));
}
ok(() => assert.deepEqual(suggestVpas("Ravi", "", "ybl"), ["ravi@ybl", "ravi.pay@ybl"]));
// Never suggest an ID on an older handle, in any letter case.
for (const handle of ["paytm", "PAYTM", " paytm "]) ok(() => assert.deepEqual(suggestVpas("Ravi", "9876543210", handle), [], handle));
// Every handle offered for a new ID produces ideas this site's QR generator accepts.
for (const { handle } of NEW_ID_HANDLES) {
  const ideas = suggestVpas("Sharma Kirana Store", "98765 43210", handle);
  ok(() => assert.equal(ideas.length, 5, handle));
  for (const id of ideas) ok(() => assert.equal(checkVpa(id).qrReady, true, id));
}
// Property: ideas from a spread of names are always well-formed, short and unique.
{
  const names = ["A", "Al", "Mo", "ली", "O'Brien & Sons", "  Sri   Lakshmi  Stores  ", "Ünal Çelik", "3M Traders", "Raj-Kumar", "x".repeat(200), "a b c d e f g", "९८७६", "Dr. A. P. J.", "K. Rao & Co."];
  for (const name of names) {
    for (const mobile of ["", "98765 43210", "919876543210", "123"]) {
      const parts = suggestLocalParts(name, mobile);
      ok(() => assert.equal(new Set(parts).size, parts.length, `${name}/${mobile} unique`));
      ok(() => assert.ok(parts.length <= 5, `${name}/${mobile} at most 5`));
      for (const part of parts) {
        ok(() => assert.ok(part.length >= 2 && part.length <= 30, `${name}/${mobile}: ${part}`));
        ok(() => assert.equal(checkVpa(`${part}@ybl`).qrReady, true, `${name}/${mobile}: ${part}`));
      }
    }
  }
}

// phrases.ts falls back to English without a word, so check that every English string the island shows has
// Hindi, Tamil, Telugu and Marathi text there (placeholders kept) and that none was left as English.
ok(() => {
  const tsx = readFileSync(new URL("../src/components/UpiIdHelper.tsx", import.meta.url), "utf8");
  const phrases = readFileSync(new URL("../src/data/upiIdPhrases.ts", import.meta.url), "utf8");
  const literal = '"((?:[^"\\\\]|\\\\.)*)"';
  const keys = new Set([...tsx.matchAll(new RegExp(`tr\\(${literal}\\)`, "g"))].map((m) => m[1]));
  const table = tsx.slice(tsx.indexOf("const ISSUE_TEXT"), tsx.indexOf("const STEP_SOURCES"));
  for (const m of table.matchAll(new RegExp(`(?:"[a-z-]+"|[a-z]+): ${literal}`, "g"))) if (m[1].length > 12) keys.add(m[1]);
  keys.add("Any UPI app");
  for (const item of KNOWN_HANDLES) if (item.legacy) keys.add(item.issuer);
  const SAME = new Set(["UPI ID (VPA)"]);
  assert.ok(keys.size >= 35, `expected the island's strings, found ${keys.size}`);
  for (const known of ["Copy ID", "ID copied", "Check how a UPI ID is written", "After the @, use letters and digits only, with no dots, hyphens or symbols.", "Paytm, older IDs (via Yes Bank)", "Any UPI app"]) {
    assert.ok(keys.has(known), `the scan should have found: ${known}`);
  }
  for (const key of keys) {
    const line = phrases.split("\n").find((l) => l.startsWith(`  "${key}": {`));
    assert.ok(line, `upiIdPhrases.ts has no entry for: ${key}`);
    for (const lang of ["hi", "ta", "te", "mr"]) {
      const value = line.match(new RegExp(` ${lang}: "((?:[^"\\\\]|\\\\.)*)"`))?.[1];
      assert.ok(value, `${lang} missing for: ${key}`);
      assert.ok(value !== key || SAME.has(key), `${lang} left in English for: ${key}`);
      for (const token of key.match(/\{[a-z]+\}/g) ?? []) assert.ok(value.includes(token), `${lang} drops ${token} in: ${key}`);
    }
  }
});

// Review date and its label (month table, not Intl, so server and browser agree).
ok(() => assert.match(UPI_ID_REVIEWED_ON, /^\d{4}-\d{2}-\d{2}$/));
ok(() => assert.equal(reviewedLabel("2026-11-01"), "1 November 2026"));
ok(() => assert.equal(reviewedLabel("2026-11-01", "en"), "1 November 2026"));
ok(() => assert.equal(reviewedLabel("2026-11-01", "hi"), "1 नवंबर 2026"));
ok(() => assert.equal(reviewedLabel("2026-11-01", "ta"), "1 நவம்பர் 2026"));
ok(() => assert.equal(reviewedLabel("2026-11-01", "te"), "1 నవంబర్ 2026"));
ok(() => assert.equal(reviewedLabel("2026-11-01", "mr"), "1 नोव्हेंबर 2026"));
ok(() => assert.equal(reviewedLabel("2027-03-15", "fr"), "15 March 2027"));
ok(() => assert.equal(reviewedLabel(), reviewedLabel(UPI_ID_REVIEWED_ON, "en")));

console.log(`upi-id: ${checks} checks passed`);
