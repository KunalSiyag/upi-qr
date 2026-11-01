// GSTIN format check and decoder (src/lib/gstin.ts): vectors with their sources, normalisation, length and character
// problems, list parsing and CSV escaping, parity with the invoice tool's GSTIN code, error-detection properties, and the
// promises the page makes (no check digit leaks out, nothing is sent or stored, no "valid" wording).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as lib from "../src/lib/gstin.ts";
import { INDIA_STATES, gstinState, validGstin } from "../src/lib/invoice/regimes.ts";

const {
  BULK_MAX, GSTIN_CODE_NOTES, GSTIN_SOURCES, GSTIN_STATES, PAN_HOLDER_TYPES, SAMPLE_GSTIN, SAMPLE_LIST, TYPED_MAX,
  checkGstin, checkList, normalizeGstin, safeCell, stateLabel, stateNoteKey, toDelimited,
} = lib;

let checks = 0;
const ok = (fn) => { fn(); checks += 1; };
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

// Test-only references. The library never computes the check digit: it only asks whether the whole number fits.
const ALPHA = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
/** Left to right, the way regimes.ts writes it. */
function refCheckChar(base14) {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = ALPHA.indexOf(base14[i]) * (i % 2 ? 2 : 1);
    sum += Math.floor(v / 36) + (v % 36);
  }
  return ALPHA[(36 - (sum % 36)) % 36];
}
/** Right to left, the way python-stdnum's luhn.checksum() writes it. */
function stdnumChecksum(number) {
  const values = [...number].reverse().map((c) => ALPHA.indexOf(c));
  let sum = 0;
  values.forEach((v, i) => { sum += i % 2 === 1 ? Math.floor((v * 2) / 36) + ((v * 2) % 36) : v; });
  return sum % 36;
}
const refFits = (g) => g.length === 15 && refCheckChar(g.slice(0, 14)) === g[14];
// Seeded, so a failure reproduces.
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = prng(20261101);
const pick = (set) => set[Math.floor(rand() * set.length)];
const LETTERS = ALPHA.slice(10);
const DIGITS = ALPHA.slice(0, 10);
/** A GSTIN with a correct layout and a Z, made with the reference. */
function synthetic(entity) {
  const state = pick(["01", "07", "19", "24", "27", "29", "33", "36", "37", "38", "97", "25", "28", "99", "50"]);
  let pan = "";
  for (let i = 0; i < 5; i++) pan += pick(LETTERS);
  for (let i = 0; i < 4; i++) pan += pick(DIGITS);
  pan += pick(LETTERS);
  const base = `${state}${pan}${entity ?? pick(ALPHA.slice(1))}Z`;
  return base + refCheckChar(base);
}

/* ---------- the reference itself ---------- */
// The reference is checked against python-stdnum's published sample (docstring of stdnum/in_/gstin.py): 27AAPFU0939F1ZV.
ok(() => assert.equal(refCheckChar("27AAPFU0939F1Z"), "V"));
ok(() => assert.equal(stdnumChecksum("27AAPFU0939F1ZV"), 0));
ok(() => assert.notEqual(stdnumChecksum("27AAPFU0939F1ZO"), 0));

/* ---------- published and synthetic vectors ---------- */
// [gstin, state code, state name, holder letter, holder name, entity number, 14th character, source]
const FULL = [
  ["27AAACR5055K1Z7", "27", "Maharashtra", "C", "company", 1, "Z", "credlix.com listing, hand trace: products sum 173, 173 % 36 = 29"],
  ["36AAACR4849R1ZM", "36", "Telangana", "C", "company", 1, "Z", "calculator.taxadda.com listing"],
  ["37AAACA4651L1ZL", "37", "Andhra Pradesh", "C", "company", 1, "Z", "knowyourgst.com listing"],
  ["38AAACN0255D1ZV", "38", "Ladakh", "C", "company", 1, "Z", "knowyourgst.com listing"],
  ["07AAACT3991J1Z0", "07", "Delhi", "C", "company", 1, "Z", "knowyourgst.com listing: the check digit is the character 0"],
  ["26AABCG0675P1Z9", "26", "Dadra and Nagar Haveli and Daman and Diu", "C", "company", 1, "Z", "knowyourgst.com listing"],
  ["29AAICA3918J1ZE", "29", "Karnataka", "C", "company", 1, "Z", "public company listing"],
  ["27AAPFU0939F1ZV", "27", "Maharashtra", "F", "firm or LLP", 1, "Z", "python-stdnum docstring sample"],
  ["29AAGCB7383J1Z4", "29", "Karnataka", "C", "company", 1, "Z", "scripts/invoice.test.mjs"],
  ["27AAAAA0000A1Z2", "27", "Maharashtra", "A", "association of persons (AOP)", 1, "Z", "synthetic sample used on the page"],
];
for (const [gstin, code, name, letter, holder, entity, fourteenth] of FULL) {
  const r = checkGstin(gstin);
  ok(() => assert.equal(r.status, "ok", gstin));
  ok(() => assert.deepEqual(r.issues, [], gstin));
  ok(() => assert.deepEqual(r.notes, [], gstin));
  ok(() => assert.deepEqual(r.state, { code, name }, gstin));
  ok(() => assert.equal(stateLabel(r), `${code} ${name}`, gstin));
  ok(() => assert.deepEqual(r.holder, { letter, name: holder }, gstin));
  ok(() => assert.equal(r.entityNumber, entity, gstin));
  ok(() => assert.deepEqual(r.parts, { state: code, pan: gstin.slice(2, 12), entity: gstin[12], fourteenth, check: gstin[14] }, gstin));
  ok(() => assert.equal(r.checkDigit, "match", gstin));
  ok(() => assert.equal(r.normalized, gstin));
  ok(() => assert.equal(r.length, 15));
}
ok(() => assert.equal(SAMPLE_GSTIN, "27AAAAA0000A1Z2"));
ok(() => assert.equal(checkGstin(SAMPLE_GSTIN).status, "ok"));
ok(() => assert.deepEqual(SAMPLE_LIST.map((g) => checkGstin(g).status), ["ok", "checksum", "format"]));
// The vector whose check digit is the character 0 is where a "36 - 0 = 36" slip would show.
ok(() => assert.equal(refCheckChar("07AAACT3991J1Z"), "0"));

// 14th character other than Z: real tax-deductor and tax-collector GSTINs. A note, never a failure.
for (const [gstin, code, name, char] of [
  ["97AAACO1598A1DP", "97", "Other Territory", "D"],
  ["27AAACR4849R1CW", "27", "Maharashtra", "C"],
]) {
  const r = checkGstin(gstin);
  ok(() => assert.equal(r.status, "ok", gstin));
  ok(() => assert.deepEqual(r.notes, [{ code: "fourteenth", value: char }], gstin));
  ok(() => assert.deepEqual(r.state, { code, name }, gstin));
}

// The check digit does not match.
{
  const r = checkGstin("27AAACR5055K1Z8");
  ok(() => assert.equal(r.status, "checksum"));
  ok(() => assert.equal(r.checkDigit, "mismatch"));
  ok(() => assert.deepEqual(r.issues, []));
  ok(() => assert.equal(r.parts.check, "8"));
  ok(() => assert.ok(!JSON.stringify(r).includes("27AAACR5055K1Z7"), "the corrected number never appears"));
}
// The glossary sample on /glossary/gstin/: right shape, wrong check digit, and a PAN letter that is not a holder type.
{
  const r = checkGstin("29ABCDE1234F1Z5");
  ok(() => assert.equal(r.status, "checksum"));
  ok(() => assert.deepEqual(r.notes, [{ code: "holder", value: "D" }]));
  ok(() => assert.equal(r.holder, null));
  ok(() => assert.equal(r.state.name, "Karnataka"));
}
// A letter in the PAN's fourth place that is not in the list: a note, so the check digit decides.
{
  const base = "27ABCDE1234F1Z";
  const g = base + refCheckChar(base);
  const r = checkGstin(g);
  ok(() => assert.equal(r.status, "ok"));
  ok(() => assert.deepEqual(r.notes, [{ code: "holder", value: "D" }]));
}
// State codes outside the list: checksum fits, so the status is OK and a note says why the code is odd.
for (const [gstin, code, key] of [
  ["28AAACR5055K1Z5", "28", "28"],
  ["99AAACR5055K1ZW", "99", "special"],
]) {
  const r = checkGstin(gstin);
  ok(() => assert.equal(r.status, "ok", gstin));
  ok(() => assert.deepEqual(r.notes, [{ code: "state", value: code }], gstin));
  ok(() => assert.deepEqual(r.state, { code, name: null }, gstin));
  ok(() => assert.equal(stateLabel(r), code, gstin));
  ok(() => assert.equal(stateNoteKey(code), key));
}
for (const code of ["25", "28", "96", "99", "00", "39", "50", "98"]) {
  const base = `${code}AAACR5055K1Z`;
  const r = checkGstin(base + refCheckChar(base));
  ok(() => assert.equal(r.status, "ok", code));
  ok(() => assert.equal(r.state.name, null, code));
  ok(() => assert.deepEqual(r.notes, [{ code: "state", value: code }], code));
}
ok(() => assert.equal(stateNoteKey("25"), "25"));
ok(() => assert.equal(stateNoteKey("96"), "special"));
ok(() => assert.equal(stateNoteKey("00"), "unknown"));
ok(() => assert.match(GSTIN_CODE_NOTES.unknown, /\{code\}/));
// 13th character: a 0 is unusual (public explainers count from 1) but python-stdnum accepts any digit or letter there, so it is a note, not a format error.
{
  const base0 = "27AAACR5055K0Z";
  const zero = checkGstin(base0 + refCheckChar(base0));
  ok(() => assert.equal(zero.status, "ok"));
  ok(() => assert.deepEqual(zero.issues, []));
  ok(() => assert.deepEqual(zero.notes, [{ code: "entity", value: "0" }]));
  ok(() => assert.equal(zero.checkDigit, "match"));
  ok(() => assert.equal(zero.entityNumber, null));
  const baseA = "27AAACR5055KAZ";
  const letter = checkGstin(baseA + refCheckChar(baseA));
  ok(() => assert.equal(letter.status, "ok"));
  ok(() => assert.equal(letter.entityNumber, null));
  ok(() => assert.equal(letter.parts.entity, "A"));
}

/* ---------- normalisation ---------- */
for (const typed of ["27aaacr5055k1z7", "  27AAACR5055K1Z7  ", "27 AAACR 5055 K1Z7", "27-AAACR5055K-1Z7", "27\tAAACR5055K1Z7\n", "27 aaacr-5055 k1z7", "27AAACR5055K1Z7"]) {
  ok(() => assert.equal(normalizeGstin(typed), "27AAACR5055K1Z7", JSON.stringify(typed)));
  ok(() => assert.equal(checkGstin(typed).status, "ok", JSON.stringify(typed)));
}
ok(() => assert.equal(normalizeGstin("27AAACR5055K1Z7"), "27AAACR5055K1Z7"));
ok(() => assert.equal(normalizeGstin("27 AAACR5055K1Z7 "), "27AAACR5055K1Z7"), "no-break space is whitespace");
ok(() => assert.equal(normalizeGstin("27\r\nAAACR5055K1Z7"), "27AAACR5055K1Z7"));
// Characters with no visible shape travel with copied text (zero-width space, direction marks, soft hyphen): dropped, so
// a number that looks right is read as typed. Look-alike letters are not dropped (see "Characters that are not letters" below).
for (const invisible of ["\u200b", "\u200c", "\u200d", "\u200e", "\u200f", "\u202a", "\u202c", "\u2060", "\u2066", "\u2069", "\u00ad", "\ufeff"]) {
  ok(() => assert.equal(normalizeGstin(`${invisible}27AAACR5055K${invisible}1Z7${invisible}`), "27AAACR5055K1Z7", JSON.stringify(invisible)));
  ok(() => assert.equal(checkGstin(`27AAACR5055K1Z7${invisible}`).status, "ok", JSON.stringify(invisible)));
}
ok(() => assert.equal(normalizeGstin(undefined), ""));
ok(() => assert.equal(normalizeGstin(null), ""));
ok(() => assert.equal(checkGstin("").status, "empty"));
ok(() => assert.equal(checkGstin("   - -  ").status, "empty"));
ok(() => assert.deepEqual(checkGstin("").issues, []));

/* ---------- length ---------- */
{
  const short = checkGstin("27AAACR5055K1Z");
  ok(() => assert.equal(short.status, "format"));
  ok(() => assert.deepEqual(short.issues, [{ code: "length", count: 14 }]));
  ok(() => assert.equal(short.parts, null));
  ok(() => assert.equal(short.checkDigit, "unknown"));
  const long = checkGstin("27AAACR5055K1Z77");
  ok(() => assert.equal(long.status, "format"));
  ok(() => assert.deepEqual(long.issues, [{ code: "length", count: 16 }]));
  ok(() => assert.deepEqual(checkGstin("27").issues, [{ code: "length", count: 2 }]));
  ok(() => assert.deepEqual(checkGstin("A").issues, [{ code: "length", count: 1 }]));
  // A 14-character number is a format problem even when the 14 fit the layout.
  ok(() => assert.equal(checkGstin("27AAACR5055K1Z").status, "format"));
}

/* ---------- characters that are not letters or digits ---------- */
{
  const bang = checkGstin("27AAACR5055K1Z!");
  ok(() => assert.equal(bang.status, "format"));
  ok(() => assert.deepEqual(bang.issues, [{ code: "chars", position: 15 }]));
  ok(() => assert.equal(bang.parts, null));
  ok(() => assert.equal(bang.checkDigit, "unknown"));
  const two = checkGstin("27AAA/R5055K1Z#");
  ok(() => assert.deepEqual(two.issues, [{ code: "chars", position: 6 }, { code: "chars", position: 15 }]));
  // Positions count the text after spaces and hyphens are dropped.
  ok(() => assert.deepEqual(checkGstin("27 AAACR5055K1Z.").issues, [{ code: "chars", position: 15 }]));
  // A longer text reports both the length and the offending positions, length first.
  ok(() => assert.deepEqual(checkGstin("27AAACR5055K1Z7!").issues, [{ code: "length", count: 16 }, { code: "chars", position: 16 }]));
  // Look-alike and case-mapping characters are never quietly turned into ASCII.
  ok(() => assert.deepEqual(checkGstin("27\u0410\u0410ACR5055K1Z7").issues, [{ code: "chars", position: 3 }, { code: "chars", position: 4 }]), "Cyrillic A");
  ok(() => assert.deepEqual(checkGstin("27AAACR5055K1Z\u0131").issues, [{ code: "chars", position: 15 }]), "dotless i");
  ok(() => assert.deepEqual(checkGstin("27AAACR5055K1Z\u00df").issues, [{ code: "chars", position: 15 }]), "sharp s");
  ok(() => assert.deepEqual(checkGstin("27AAACR5055K1Z\u{1F600}").issues, [{ code: "chars", position: 15 }]), "one emoji is one position");
  ok(() => assert.deepEqual(checkGstin("27AAACR5055K1Z\u0667").issues, [{ code: "chars", position: 15 }]), "Arabic-Indic digit");
  ok(() => assert.deepEqual(checkGstin("27AAACR5055K1Z\u2013").issues, [{ code: "chars", position: 15 }]), "en dash is not a hyphen");
}

/* ---------- a pasted blob of any size ---------- */
// The first MAX_CHAR_ISSUES bad positions are listed; the rest only fail the text. A 15-character text never reaches the cap.
{
  const blob = checkGstin("!".repeat(200000));
  ok(() => assert.equal(lib.MAX_CHAR_ISSUES, 50));
  ok(() => assert.equal(blob.status, "format"));
  ok(() => assert.equal(blob.issues.length, 1 + lib.MAX_CHAR_ISSUES));
  ok(() => assert.deepEqual(blob.issues[0], { code: "length", count: 200000 }));
  ok(() => assert.deepEqual(blob.issues[1], { code: "chars", position: 1 }));
  ok(() => assert.deepEqual(blob.issues.at(-1), { code: "chars", position: 50 }));
  ok(() => assert.equal(blob.parts, null));
  ok(() => assert.equal(checkGstin("!!!!!!!!!!!!!!!").issues.length, 15));
  const list = checkList(`${"#".repeat(150000)}\n${SAMPLE_GSTIN}`);
  ok(() => assert.deepEqual(list.entries.map((e) => e.result.status), ["format", "ok"]));
  ok(() => assert.equal(list.entries[0].typed.length, TYPED_MAX + 1));
}

/* ---------- layout of the parts ---------- */
{
  const layout = (text) => checkGstin(text).issues;
  ok(() => assert.deepEqual(layout("27AAAA10000A1Z2"), [{ code: "pan-letter", position: 7 }]));
  ok(() => assert.deepEqual(layout("27AAAAA000AA1Z2"), [{ code: "pan-digit", position: 11 }]));
  ok(() => assert.deepEqual(layout("27AAAAA00000" + "1Z2"), [{ code: "pan-letter", position: 12 }]));
  ok(() => assert.deepEqual(layout("A7AAAAA0000A1Z2"), [{ code: "state", position: 1 }]));
  ok(() => assert.deepEqual(layout("AAAAAAA0000A1Z2"), [{ code: "state", position: 1 }, { code: "state", position: 2 }]));
  // A fully scrambled 15-character text reports every misplaced position, in order, and still reads the check digit.
  const scrambled = checkGstin("AAAAAAAAAAAAAAA");
  ok(() => assert.equal(scrambled.status, "format"));
  ok(() => assert.deepEqual(scrambled.issues.map((i) => i.position), [1, 2, 8, 9, 10, 11]));
  ok(() => assert.equal(scrambled.parts.pan, "AAAAAAAAAA"));
  ok(() => assert.equal(scrambled.state, null));
  ok(() => assert.ok(["match", "mismatch"].includes(scrambled.checkDigit)));
  // Digits in the PAN letter places, digits where the state code goes, and so on, even when the check digit fits.
  const base = "27AAAA1" + "0000A1Z";
  const withDigit = checkGstin(base + refCheckChar(base));
  ok(() => assert.equal(withDigit.status, "format"));
  ok(() => assert.equal(withDigit.checkDigit, "match"));
  ok(() => assert.deepEqual(withDigit.issues, [{ code: "pan-letter", position: 7 }]));
}

/* ---------- the layout pattern the page shows (FAQ "What is the regex...") ---------- */
// The page prints GSTIN_LAYOUT_PATTERN. It must say exactly what checkGstin() calls a layout problem, on the upper-case
// text (spaces, hyphens and lower case are tidied before the checker looks, so they are left out of these strings).
{
  const pattern = new RegExp(lib.GSTIN_LAYOUT_PATTERN);
  const layoutFine = (text) => checkGstin(text).issues.length === 0;
  ok(() => assert.equal(lib.GSTIN_LAYOUT_PATTERN, "^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]{3}$"));
  for (const g of [SAMPLE_GSTIN, "27AAACR5055K1Z7", "07AAACT3991J1Z0", "97AAACO1598A1DP", "27AAACR4849R1CW", "29ABCDE1234F1Z5", "28AAACR5055K1Z5", "27AAACR5055K1Z8", "27AAACR5055K0Z8"]) {
    ok(() => assert.equal(pattern.test(g), true, g));
    ok(() => assert.equal(layoutFine(g), true, g));
  }
  for (const g of ["", "27AAACR5055K1Z", "27AAACR5055K1Z77", "A7AAAAA0000A1Z2", "27AAAA10000A1Z2", "27AAAAA000AA1Z2", "27AAAAA00000" + "1Z2", "27AAACR5055K1Z!", "27AAACR5055K1ÉZ"]) {
    ok(() => assert.equal(pattern.test(g), false, g));
    if (g !== "") ok(() => assert.equal(layoutFine(g), false, g));
  }
  const illegal = ["!", "/", "#", "é", "А"];
  for (let n = 0; n < 6000; n++) {
    const chars = [...synthetic()];
    for (let k = 0, flips = 1 + Math.floor(rand() * 3); k < flips; k++) chars[Math.floor(rand() * 15)] = rand() < 0.1 ? pick(illegal) : pick([...ALPHA]);
    if (rand() < 0.1) chars.length = 10 + Math.floor(rand() * 5);
    if (rand() < 0.1) chars.push(pick([...ALPHA]));
    const text = chars.join("");
    ok(() => assert.equal(pattern.test(text), layoutFine(text), text));
  }
}

/* ---------- lists ---------- */
{
  const text = [SAMPLE_GSTIN, "27AAAAA0000A1Z3, 27AAAAA0000A1Z\t07AAACT3991J1Z0;97AAACO1598A1DP", "", "   ", ""].join("\r\n");
  const list = checkList(text);
  ok(() => assert.deepEqual(list.entries.map((e) => e.line), [1, 2, 2, 2, 2]));
  ok(() => assert.deepEqual(list.entries.map((e) => e.typed), [SAMPLE_GSTIN, "27AAAAA0000A1Z3", "27AAAAA0000A1Z", "07AAACT3991J1Z0", "97AAACO1598A1DP"]));
  ok(() => assert.deepEqual(list.entries.map((e) => e.result.status), ["ok", "checksum", "format", "ok", "ok"]));
  ok(() => assert.deepEqual(list.counts, { ok: 3, checksum: 1, format: 1 }));
  ok(() => assert.equal(list.skipped, 0));
  // Every line ending, lower case, hyphens, and no de-duplication: the same GSTIN twice is two rows.
  const dup = checkList("27aaaaa0000a1z2\n27-AAAAA0000A1Z2\r27AAAAA0000A1Z2");
  ok(() => assert.deepEqual(dup.entries.map((e) => [e.line, e.result.status]), [[1, "ok"], [2, "ok"], [3, "ok"]]));
  ok(() => assert.deepEqual(dup.entries.map((e) => e.typed), ["27aaaaa0000a1z2", "27-AAAAA0000A1Z2", "27AAAAA0000A1Z2"]), "typed text is kept as typed");
  ok(() => assert.deepEqual(checkList(""), { entries: [], skipped: 0, counts: { ok: 0, checksum: 0, format: 0 } }));
  ok(() => assert.deepEqual(checkList(" \n,\t;,\n").entries, []));
  ok(() => assert.deepEqual(checkList(undefined).entries, []));
  // The cap: BULK_MAX are checked, the rest are counted.
  ok(() => assert.equal(BULK_MAX, 500));
  const lines = (n) => Array.from({ length: n }, () => SAMPLE_GSTIN).join("\n");
  ok(() => assert.deepEqual([checkList(lines(500)).entries.length, checkList(lines(500)).skipped], [500, 0]));
  ok(() => assert.deepEqual([checkList(lines(501)).entries.length, checkList(lines(501)).skipped], [500, 1]));
  ok(() => assert.deepEqual([checkList(lines(1200)).entries.length, checkList(lines(1200)).skipped], [500, 700]));
  ok(() => assert.deepEqual(checkList(lines(501)).counts, { ok: 500, checksum: 0, format: 0 }), "skipped rows are not counted");
  ok(() => assert.equal(checkList(lines(501)).entries.at(-1).line, 500));
  // Several on one line count toward the same cap.
  ok(() => assert.equal(checkList(Array.from({ length: 600 }, () => SAMPLE_GSTIN).join(" ")).skipped, 100));
  // A very long token is shortened.
  const long = checkList("A".repeat(100)).entries[0];
  ok(() => assert.equal(long.typed, `${"A".repeat(TYPED_MAX)}…`));
  ok(() => assert.deepEqual(long.result.issues[0], { code: "length", count: 100 }));
}

/* ---------- CSV and TSV ---------- */
ok(() => assert.equal(safeCell("=1+1"), "'=1+1"));
ok(() => assert.equal(safeCell("+91"), "'+91"));
ok(() => assert.equal(safeCell("-5"), "'-5"));
ok(() => assert.equal(safeCell("@SUM(A1)"), "'@SUM(A1)"));
ok(() => assert.equal(safeCell("\tx"), "'\tx"));
ok(() => assert.equal(safeCell("\rx"), "'\rx"));
ok(() => assert.equal(safeCell("27AAAAA0000A1Z2"), "27AAAAA0000A1Z2"));
ok(() => assert.equal(safeCell("a=b"), "a=b"));
ok(() => assert.equal(safeCell(undefined), ""));
ok(() => assert.equal(
  toDelimited([["Line", "GSTIN"], ["1", '=HYPERLINK("http://x")'], ["2", "+1"], ["3", "-2"], ["4", "@SUM(A1)"], ["5", "a,b"], ["6", 'say "hi"'], ["7", " pad "]], ","),
  'Line,GSTIN\r\n1,"\'=HYPERLINK(""http://x"")"\r\n2,\'+1\r\n3,\'-2\r\n4,\'@SUM(A1)\r\n5,"a,b"\r\n6,"say ""hi"""\r\n7," pad "',
));
ok(() => assert.equal(toDelimited([["a", "b\tc"], ["=x", "d\ne"]], "\t"), "a\tb c\n'=x\td e"));
ok(() => assert.equal(toDelimited([], ","), ""));
{
  // A pasted token that tries a formula comes back inert in the CSV.
  const entry = checkList("=cmd|' /C calc'!A0").entries[0];
  const csv = toDelimited([[String(entry.line), entry.typed]], ",");
  ok(() => assert.ok(csv.startsWith("1,'=cmd")));
}

/* ---------- the state table ---------- */
ok(() => assert.equal(GSTIN_STATES.length, 37));
ok(() => assert.deepEqual(GSTIN_STATES.map((s) => s.code), INDIA_STATES.map((s) => s.code)), "same codes as the invoice tool");
ok(() => assert.deepEqual(GSTIN_STATES.map((s) => s.name), INDIA_STATES.map((s) => s.name)), "same names as the invoice tool");
ok(() => assert.deepEqual(GSTIN_STATES.map((s) => s.code), [
  ...Array.from({ length: 24 }, (_, i) => String(i + 1).padStart(2, "0")), "26", "27", ...Array.from({ length: 10 }, (_, i) => String(i + 29)), "97",
]), "01-24, 26, 27, 29-38 and 97");
ok(() => assert.equal(new Set(GSTIN_STATES.map((s) => s.code)).size, 37));
ok(() => assert.deepEqual(PAN_HOLDER_TYPES.map((h) => h.letter).join(""), "ABCFGHJLPT"));
for (const source of GSTIN_SOURCES) {
  ok(() => assert.match(source.href, /^https:\/\//));
  ok(() => assert.ok(source.label.length > 5 && source.used.length > 10));
}
ok(() => assert.equal(new Set(GSTIN_SOURCES.map((s) => s.href)).size, GSTIN_SOURCES.length));
ok(() => assert.match(lib.GSTIN_REVIEWED_ON, /^\d{4}-\d{2}-\d{2}$/));

/* ---------- parity with the invoice tool (src/lib/invoice/regimes.ts) ---------- */
// validGstin() requires the Z; where it is there, both agree on every string. gstinState() reads the same table.
{
  const stateCodes = new Set(INDIA_STATES.map((s) => s.code));
  for (const [gstin] of FULL) {
    ok(() => assert.equal(validGstin(gstin), checkGstin(gstin).status === "ok", gstin));
    ok(() => assert.equal(gstinState(gstin), checkGstin(gstin).state.name === null ? "" : checkGstin(gstin).state.code, gstin));
  }
  // 97AAACO1598A1DP and 27AAACR4849R1CW carry C or D: the invoice tool rejects them by design, this tool notes them.
  ok(() => assert.equal(validGstin("97AAACO1598A1DP"), false));
  ok(() => assert.equal(checkGstin("97AAACO1598A1DP").status, "ok"));
  for (let i = 0; i < 3000; i++) {
    const g = synthetic();
    const r = checkGstin(g);
    ok(() => assert.equal(r.status, "ok", g));
    ok(() => assert.equal(validGstin(g), true, g));
    ok(() => assert.equal(stdnumChecksum(g), 0, g));
    ok(() => assert.equal(gstinState(g) === "", r.state.name === null, g));
    ok(() => assert.equal(stateCodes.has(g.slice(0, 2)), r.state.name !== null, g));
    const wrong = g.slice(0, 14) + pick([...ALPHA].filter((c) => c !== g[14]));
    ok(() => assert.equal(validGstin(wrong), false, wrong));
    ok(() => assert.equal(checkGstin(wrong).status, "checksum", wrong));
  }
}

/* ---------- error detection ---------- */
{
  // Every single wrong character is caught, at every position, whatever it is replaced with.
  for (let n = 0; n < 150; n++) {
    const g = synthetic();
    for (let i = 0; i < 15; i++) {
      for (const c of ALPHA) {
        if (c === g[i]) continue;
        const changed = g.slice(0, i) + c + g.slice(i + 1);
        ok(() => assert.notEqual(checkGstin(changed).status, "ok", changed));
        ok(() => assert.equal(refFits(changed), false, changed));
      }
    }
  }
  // Two neighbours swapped: only 0 and Z can trade places unseen. Swapping values a and b changes the Luhn mod 36 sum by
  // (a - b), plus 1 if a is 18 or more, minus 1 if b is, and that is a multiple of 36 only for the pair 0 and 35 (Z).
  // Checked here for every ordered pair of characters at positions 1-2 up to 13-14, and for the 14th and 15th (the check
  // character made for each 14th character, over three prefixes).
  const undetected = new Set();
  const swapFits = (g, position) => {
    const swapped = [...g];
    [swapped[position], swapped[position + 1]] = [swapped[position + 1], swapped[position]];
    return refFits(swapped.join(""));
  };
  let swaps = 0;
  for (let position = 0; position < 13; position++) {
    for (const a of ALPHA) for (const b of ALPHA) {
      if (a === b) continue;
      const base = ["2", "7", "A", "A", "A", "A", "A", "0", "0", "0", "0", "A", "1", "Z"];
      base[position] = a;
      base[position + 1] = b;
      const g = base.join("") + refCheckChar(base.join(""));
      swaps += 1;
      if (swapFits(g, position)) undetected.add(`${a}${b}`);
    }
  }
  for (const a of ALPHA) for (const prefix of ["27AAAAA0000A1", "27AAACR5055K1", "07AAACT3991J1"]) {
    const g = prefix + a + refCheckChar(prefix + a);
    if (g[13] === g[14]) continue;
    swaps += 1;
    if (swapFits(g, 13)) undetected.add(`${g[13]}${g[14]}`);
  }
  ok(() => assert.ok(swaps > 16000, `${swaps} swaps tried`));
  ok(() => assert.deepEqual([...undetected].sort(), ["0Z", "Z0"]), "only 0 and Z");
  // Same at the level of the checker: a swap that still reads OK must be that pair.
  for (let n = 0; n < 100; n++) {
    const g = synthetic();
    for (let i = 0; i < 14; i++) {
      if (g[i] === g[i + 1]) continue;
      const swapped = [...g];
      [swapped[i], swapped[i + 1]] = [swapped[i + 1], swapped[i]];
      const text = swapped.join("");
      if (checkGstin(text).status === "ok") ok(() => assert.deepEqual([g[i], g[i + 1]].sort(), ["0", "Z"], text));
    }
  }
  // The 14th and 15th characters of 07AAACT3991J1Z0 are Z and 0: swapped, the check digit still fits and the 14th is only noted.
  const swappedReal = checkGstin("07AAACT3991J10Z");
  ok(() => assert.equal(swappedReal.status, "ok"));
  ok(() => assert.deepEqual(swappedReal.notes, [{ code: "fourteenth", value: "0" }]));

  // Two wrong characters cancel out about 1 time in 36, and so do random 15-character texts (the page says so).
  let doubles = 0;
  let doublePass = 0;
  let randoms = 0;
  let randomPass = 0;
  for (let n = 0; n < 60000; n++) {
    const g = synthetic();
    const i = Math.floor(rand() * 15);
    let j = Math.floor(rand() * 15);
    if (j === i) j = (j + 1) % 15;
    const chars = [...g];
    chars[i] = pick([...ALPHA]);
    chars[j] = pick([...ALPHA]);
    const changed = chars.join("");
    if (changed !== g) {
      doubles += 1;
      if (refFits(changed)) doublePass += 1;
    }
    let text = "";
    for (let k = 0; k < 15; k++) text += pick([...ALPHA]);
    randoms += 1;
    if (checkGstin(text).checkDigit === "match") randomPass += 1;
    assert.equal(checkGstin(text).checkDigit === "match", refFits(text), text);
  }
  checks += 1;
  ok(() => assert.ok(doublePass / doubles > 0.024 && doublePass / doubles < 0.032, `double errors passing: ${doublePass / doubles}`));
  ok(() => assert.ok(randomPass / randoms > 0.024 && randomPass / randoms < 0.032, `random texts passing: ${randomPass / randoms}`));
}

/* ---------- nothing gives the check digit away ---------- */
{
  const names = Object.keys(lib);
  ok(() => assert.deepEqual(names.filter((name) => /expect|correct|suggest|fix|generat|comput|calculat|checkchar|nextcheck|digitfor/i.test(name)), []));
  const keys = ["checkDigit", "entityNumber", "holder", "issues", "length", "normalized", "notes", "parts", "state", "status"];
  for (const text of ["", "27AAACR5055K1Z8", "27AAACR5055K1Z", "27AAACR5055K1Z7", "!!", SAMPLE_GSTIN]) {
    ok(() => assert.deepEqual(Object.keys(checkGstin(text)).sort(), keys, text));
  }
  // For a wrong last character, the right one (and so the corrected number) is nowhere in the result.
  for (let n = 0; n < 300; n++) {
    const g = synthetic();
    const wrong = g.slice(0, 14) + pick([...ALPHA].filter((c) => c !== g[14]));
    const json = JSON.stringify(checkGstin(wrong));
    ok(() => assert.ok(!json.includes(g), `${g} leaked for ${wrong}`));
    ok(() => assert.equal(checkGstin(wrong).parts.check, wrong[14]));
  }
}

/* ---------- what the page promises: nothing is sent or stored, no "valid" wording ---------- */
{
  const files = ["src/lib/gstin.ts", "src/components/GstinChecker.tsx", "src/pages/gstin-validator.astro"];
  for (const file of files) {
    const source = read(file);
    ok(() => assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|localStorage|sessionStorage|indexedDB|document\.cookie|trackProductEvent|productEvents|location\.(hash|search|href\s*=)|history\.(push|replace)State|Math\.random|ClerkClient|localStore|\bimport\s*\(/, `${file}: no network, storage, events or address changes`));
  }
  const component = read("src/components/GstinChecker.tsx");
  ok(() => assert.doesNotMatch(component, /class="/, "className only in islands"));
  // Links that leave the page carry no GSTIN and are noopener noreferrer nofollow.
  for (const file of ["src/components/GstinChecker.tsx", "src/pages/gstin-validator.astro"]) {
    const source = read(file);
    for (const anchor of source.match(/<a\s[^>]*target="_blank"[^>]*>|<a\s[^>]*target="_blank"[^>]*$/gm) ?? []) {
      ok(() => assert.match(anchor, /rel="noopener noreferrer nofollow"/, anchor));
    }
  }
  ok(() => assert.match(component, /https:\/\/services\.gst\.gov\.in\/services\/searchtp"/));
  // Wording rules for identifier tools: no "valid", "verified", "genuine", "safe", "trusted", "real", "fake".
  const banned = /\b(valid|verified|verify|verifies|verification|genuine|authentic|trusted|safe|safely|secure|fake|prank|dummy|real)\b/i;
  for (const file of ["src/components/GstinChecker.tsx", "src/pages/gstin-validator.astro"]) {
    const english = read(file)
      .split("\n")
      .filter((line) => !/^\s*(import |\/\/|\*|\/\*)/.test(line))
      .join("\n");
    const hit = english.match(banned);
    ok(() => assert.equal(hit, null, `${file} uses the word "${hit?.[0]}"`));
  }
  const phrases = read("src/lib/gstin.ts") + JSON.stringify(GSTIN_CODE_NOTES) + JSON.stringify(PAN_HOLDER_TYPES) + GSTIN_SOURCES.map((s) => s.used).join(" ");
  ok(() => assert.equal(phrases.replace(/^\s*(\/\/|\*|\/\*).*$/gm, "").match(banned), null));
}

/* ---------- every string the island shows through tr() has Hindi, Tamil, Telugu and Marathi ---------- */
{
  const component = read("src/components/GstinChecker.tsx");
  const keys = new Set();
  for (const match of component.matchAll(/\btr\(\s*"((?:[^"\\]|\\.)*)"/g)) keys.add(JSON.parse(`"${match[1]}"`));
  // Message tables translated through tr(variable).
  const tables = [...component.matchAll(/const (?:[A-Z_]+_TEXT|[A-Z_]+_HELP)\b[^=\n]*= \{([\s\S]*?)\n\};/g)];
  ok(() => assert.equal(tables.length, 4, "STATUS_TEXT, STATUS_HELP, ISSUE_TEXT and NOTE_TEXT"));
  for (const table of tables) {
    for (const match of table[1].matchAll(/:\s*"((?:[^"\\]|\\.)*)",?\s*$/gm)) keys.add(JSON.parse(`"${match[1]}"`));
  }
  for (const holder of PAN_HOLDER_TYPES) keys.add(holder.name);
  for (const key of Object.values(GSTIN_CODE_NOTES)) keys.add(key);
  ok(() => assert.ok(keys.size >= 40, `the extractor found ${keys.size} strings`));
  const phrasesSource = read("src/data/gstinPhrases.ts");
  const entries = new Map();
  for (const line of phrasesSource.split("\n")) {
    const m = line.match(/^\s{2}"((?:[^"\\]|\\.)*)":\s*\{(.*)\},?\s*$/);
    if (m) entries.set(JSON.parse(`"${m[1]}"`), m[2]);
  }
  const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
  for (const key of keys) {
    const entry = entries.get(key);
    ok(() => assert.ok(entry !== undefined, `gstinPhrases.ts has no entry for "${key}"`));
    for (const lang of ["hi", "ta", "te", "mr"]) {
      const m = entry.match(new RegExp(`\\b${lang}:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
      ok(() => assert.ok(m !== null && m[1].trim().length > 0, `${lang} missing for "${key}"`));
      ok(() => assert.equal(placeholders(JSON.parse(`"${m[1]}"`)), placeholders(key), `${lang} placeholders differ for "${key}"`));
    }
  }
}

console.log(`gstin: ${checks} checks passed`);
