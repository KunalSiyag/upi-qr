// Amount in words engine (src/lib/words.ts): exact vectors, the text parser, parity with the invoice generator's
// English, an independent Hindi cross-check against the Unicode CLDR rules, and the Google Sheets function
// (src/lib/words.ts SHEETS_SNIPPET) evaluated in a Node VM against the same amounts.
//
//   npm run test:words
//
// Hindi source: Unicode CLDR common/rbnf/hi.xml, ruleset %spellout-cardinal, copied verbatim below
// (https://raw.githubusercontent.com/unicode-org/cldr/main/common/rbnf/hi.xml, read 2026-11-01).
// Unicode data files and software, Copyright © 1991-2026 Unicode, Inc. SPDX-License-Identifier: Unicode-DFS-2016.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { amountInWords } from "../src/lib/invoice/core.ts";
import { rupeesInWords } from "../src/lib/mcp/tools.ts";
import {
  MAX_RUPEE_DIGITS, MAX_RUPEE_TEXT, SHEETS_FUNCTION_NAME, SHEETS_SNIPPET, WORDS_REVIEWED_ON, amountInWordsText, englishWords,
  formatIndian, hindiNumberWords, hindiWords, parseRupees,
} from "../src/lib/words.ts";

let checks = 0;
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks++; };
const ok = (value, message) => { assert.ok(value, message); checks++; };

/* Deterministic pseudo-random numbers (no Math.random: the same amounts on every run). */
function lcg(seed) {
  let state = BigInt(seed);
  return () => { state = (state * 6364136223846793005n + 1442695040888963407n) & 0xffffffffffffffffn; return state >> 11n; };
}

/** Plain decimal text of a paise amount: 12505050n → "125050.50". */
const decimal = (paise) => `${paise / 100n}.${String(paise % 100n).padStart(2, "0")}`;

/* ---------- amounts used for the parity, round-trip and Sheets checks (> 600, with boundaries) ---------- */
const amounts = new Set();
for (let p = 0n; p <= 250n; p++) amounts.add(p); // 0 paise to ₹2.50: every paise value, ₹1 and ₹2
for (let k = 2; k <= 14; k++) for (const delta of [-1n, 0n, 1n]) amounts.add(10n ** BigInt(k) + delta); // each power of ten
amounts.add(10n ** 15n - 1n);
for (const rupees of [99n, 100n, 999n, 1000n, 9999n, 10000n, 99999n, 100000n, 9999999n, 10000000n, 99999999n, 100000000n, 999999999n, 1000000000n, 99999999999n, 100000000000n, 9999999999999n]) {
  for (const extra of [0n, 1n, 50n, 99n]) amounts.add(rupees * 100n + extra);
}
const next = lcg(20261101);
for (let i = 0; i < 400; i++) amounts.add(next() % 10n ** BigInt(3 + (i % 13))); // 3 to 15 digits of paise
amounts.add(999999999999999n); // the largest accepted amount
ok(amounts.size >= 600, `at least 600 distinct amounts (${amounts.size})`);
ok([...amounts].every((p) => p >= 0n && p < 10n ** 15n), "every amount fits the 13-digit cap");

/* ---------- English: exact vectors ---------- */
// Vectors from scripts/invoice.test.mjs (17,700; 12,34,56,789.50; 1,000 crore) and the research evidence file.
eq(englishWords(50n), "Rupees Zero and Fifty Paise Only", "0.50");
eq(englishWords(5n), "Rupees Zero and Five Paise Only", "0.05");
eq(englishWords(100n), "Rupees One Only", "1");
eq(englishWords(123450n), "Rupees One Thousand Two Hundred Thirty Four and Fifty Paise Only", "1,234.50");
eq(englishWords(1770000n), "Rupees Seventeen Thousand Seven Hundred Only", "17,700");
eq(englishWords(12345678950n), "Rupees Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine and Fifty Paise Only", "12,34,56,789.50");
eq(englishWords(1000000000000n), "Rupees One Thousand Crore Only", "1,000 crore");
eq(englishWords(100000000000n), "Rupees One Hundred Crore Only", "100 crore");
eq(englishWords(0n), "Rupees Zero Only", "zero");
eq(englishWords(101n), "Rupees One and One Paise Only", "1.01 reads like the invoice generator");
eq(englishWords(10000000n), "Rupees One Lakh Only", "1,00,000");
eq(englishWords(1000000000n), "Rupees One Crore Only", "1,00,00,000");
eq(englishWords(12505050n), "Rupees One Lakh Twenty Five Thousand Fifty and Fifty Paise Only", "125050.50 cheque style");
eq(englishWords(12505050n, "suffix"), "One Lakh Twenty Five Thousand Fifty Rupees and Fifty Paise Only", "125050.50 suffix style");
eq(englishWords(12505050n, "cheque", "upper"), "RUPEES ONE LAKH TWENTY FIVE THOUSAND FIFTY AND FIFTY PAISE ONLY", "upper case");
eq(englishWords(12505050n, "suffix", "upper"), "ONE LAKH TWENTY FIVE THOUSAND FIFTY RUPEES AND FIFTY PAISE ONLY", "upper case, suffix");
eq(englishWords(12505050n, undefined, undefined), englishWords(12505050n, "cheque", "title"), "defaults are cheque style, Title Case");
eq(englishWords(999999999999999n), "Rupees Nine Lakh Ninety Nine Thousand Nine Hundred Ninety Nine Crore Ninety Nine Lakh Ninety Nine Thousand Nine Hundred Ninety Nine and Ninety Nine Paise Only", "the largest amount");

// Suffix style: singular rupee and paisa, paise-only amounts without "Zero Rupees".
eq(englishWords(100n, "suffix"), "One Rupee Only");
eq(englishWords(200n, "suffix"), "Two Rupees Only");
eq(englishWords(101n, "suffix"), "One Rupee and One Paisa Only");
eq(englishWords(102n, "suffix"), "One Rupee and Two Paise Only");
eq(englishWords(201n, "suffix"), "Two Rupees and One Paisa Only");
eq(englishWords(1n, "suffix"), "One Paisa Only");
eq(englishWords(5n, "suffix"), "Five Paise Only");
eq(englishWords(50n, "suffix"), "Fifty Paise Only");
eq(englishWords(0n, "suffix"), "Zero Rupees Only");
eq(englishWords(100000n, "suffix"), "One Thousand Rupees Only");
eq(englishWords(100000000000n, "suffix"), "One Hundred Crore Rupees Only");
eq(englishWords(1000000000000000n - 1n, "suffix"), "Nine Lakh Ninety Nine Thousand Nine Hundred Ninety Nine Crore Ninety Nine Lakh Ninety Nine Thousand Nine Hundred Ninety Nine Rupees and Ninety Nine Paise Only");

/* ---------- English: parity with the invoice generator (src/lib/invoice/core.ts) ---------- */
for (const paise of amounts) {
  eq(englishWords(paise, "cheque"), amountInWords(Number(paise), "INR"), `cheque style equals amountInWords for ${paise} paise`);
}
// The suffix style equals the MCP amount_in_words text wherever that text is right (below 100 crore, no singular unit).
let mcpCompared = 0;
for (const paise of amounts) {
  if (paise >= 100000000000n || paise / 100n === 1n || paise % 100n === 1n) continue;
  eq(englishWords(paise, "suffix"), rupeesInWords(Number(paise)), `suffix style equals rupeesInWords for ${paise} paise`);
  mcpCompared++;
}
ok(mcpCompared > 400, `compared ${mcpCompared} amounts with the MCP text`);

/* ---------- English: independent reverse reader (words back to paise) ---------- */
const SMALL = new Map([["Zero", 0n], ["One", 1n], ["Two", 2n], ["Three", 3n], ["Four", 4n], ["Five", 5n], ["Six", 6n], ["Seven", 7n], ["Eight", 8n], ["Nine", 9n], ["Ten", 10n], ["Eleven", 11n], ["Twelve", 12n], ["Thirteen", 13n], ["Fourteen", 14n], ["Fifteen", 15n], ["Sixteen", 16n], ["Seventeen", 17n], ["Eighteen", 18n], ["Nineteen", 19n], ["Twenty", 20n], ["Thirty", 30n], ["Forty", 40n], ["Fifty", 50n], ["Sixty", 60n], ["Seventy", 70n], ["Eighty", 80n], ["Ninety", 90n]]);
function readNumber(tokens) {
  let total = 0n;
  let current = 0n;
  for (const word of tokens) {
    if (SMALL.has(word)) current += SMALL.get(word);
    else if (word === "Hundred") current *= 100n;
    else if (word === "Thousand") { total += current * 1000n; current = 0n; }
    else if (word === "Lakh") { total += current * 100000n; current = 0n; }
    else if (word === "Crore") { total = (total + current) * 10000000n; current = 0n; }
    else throw new Error(`unexpected word ${word}`);
  }
  return total + current;
}
function readEnglish(text) {
  const tokens = text.split(" ");
  assert.equal(tokens.at(-1), "Only");
  const body = tokens.slice(0, -1);
  const andAt = body.indexOf("and");
  const left = andAt < 0 ? body : body.slice(0, andAt);
  const right = andAt < 0 ? [] : body.slice(andAt + 1);
  const rupeeUnit = left.findIndex((word) => word === "Rupees" || word === "Rupee");
  let rupees = 0n;
  let paise = 0n;
  if (left[0] === "Rupees") rupees = readNumber(left.slice(1));
  else if (rupeeUnit >= 0) rupees = readNumber(left.slice(0, rupeeUnit));
  else paise = readNumber(left.slice(0, -1)); // "Fifty Paise"
  if (right.length) paise = readNumber(right.slice(0, -1)); // drops the trailing "Paise" or "Paisa"
  if (left[0] === "Rupees" && right.length === 0 && andAt < 0) return rupees * 100n;
  return rupees * 100n + paise;
}
for (const paise of amounts) {
  eq(readEnglish(englishWords(paise, "cheque")), paise, `cheque words read back to ${paise}`);
  eq(readEnglish(englishWords(paise, "suffix")), paise, `suffix words read back to ${paise}`);
  const upper = englishWords(paise, "cheque", "upper");
  eq(upper, upper.toUpperCase(), "upper case is all capitals");
  eq(upper.toLowerCase(), englishWords(paise, "cheque").toLowerCase(), "casing never changes the words");
}

/* ---------- parser ---------- */
const parsed = (text) => parseRupees(text);
const accepted = [
  ["125050.50", 12505050n], ["1,23,456.78", 12345678n], ["1,234,567.8", 123456780n], ["12345.5", 1234550n], ["1 23 456", 12345600n],
  ["  1,25,000  ", 12500000n], ["₹ 1,25,000", 12500000n], ["₹1,25,000", 12500000n], ["Rs. 1,25,000/-", 12500000n], ["Rs 5", 500n], ["rs.5.50", 550n],
  ["RS.1,000", 100000n], ["INR 99", 9900n], ["₹0.05", 5n], ["₹0.50", 50n], [".5", 50n], ["5.", 500n], ["0", 0n], ["0.00", 0n], ["007", 700n], ["12.500", 1250n],
  ["12.50", 1250n], ["1,000", 100000n], ["12,345", 1234500n], ["1,00,000", 10000000n], ["99,99,999", 999999900n], ["10,00,00,000", 10000000000n], ["1,00,00,00,000", 100000000000n],
  ["१२३", 12300n], ["१,२५,०५०.५०", 12505050n], ["₹१००/-", 10000n], ["9999999999999.99", 999999999999999n], ["99,99,99,99,99,999.99", 999999999999999n],
  ["00000000000000", 0n], ["0,000", 0n],
];
for (const [text, paise] of accepted) {
  const result = parsed(text);
  ok(result.ok, `${JSON.stringify(text)} is accepted`);
  eq(result.paise, paise, `${JSON.stringify(text)} is ${paise} paise`);
}
const refused = [
  ["", "empty"], ["   ", "empty"], ["₹", "empty"], ["Rs.", "empty"], ["/-", "empty"],
  ["-5", "negative"], ["₹-5", "negative"], ["−5", "negative"], ["-0.50", "negative"],
  ["abc", "not-a-number"], ["12abc", "not-a-number"], ["1e5", "not-a-number"], ["1.2.3", "not-a-number"], ["1.250.000", "not-a-number"], [".", "not-a-number"], [",", "not-a-number"], ["+5", "not-a-number"], ["5 rupees", "not-a-number"],
  ["1,50", "decimal-comma"], ["12,5", "decimal-comma"], ["0,5", "decimal-comma"], ["1.250,50", "decimal-comma"],
  ["1,2,3", "bad-commas"], ["1,23,45", "bad-commas"], ["1234,567", "bad-commas"], [",123", "bad-commas"], ["123,", "bad-commas"], ["1,,234", "bad-commas"], ["1,234,56,789", "bad-commas"],
  ["12.345", "decimals"], ["0.001", "decimals"], ["1.2345", "decimals"], ["5.505", "decimals"],
  ["10000000000000", "too-large"], ["99999999999999", "too-large"], ["1,00,00,00,00,00,000", "too-large"], ["1,00,00,00,00,00,000.50", "too-large"],
];
for (const [text, error] of refused) {
  const result = parsed(text);
  eq(result.ok, false, `${JSON.stringify(text)} is refused`);
  eq(result.error, error, `${JSON.stringify(text)} is refused as ${error}`);
}
eq(MAX_RUPEE_DIGITS, 13, "cap is 13 digits");
eq(MAX_RUPEE_TEXT, "99,99,99,99,99,999.99");
eq(parsed(MAX_RUPEE_TEXT).paise, 10n ** 15n - 1n, "the documented maximum is accepted and is the largest paise value");
eq(parsed("1,00,00,00,00,00,000").error, "too-large", "one more digit is refused");

/* ---------- Indian grouping of the figures ---------- */
const formatted = [
  [0n, "0.00"], [5n, "0.05"], [100n, "1.00"], [999n, "9.99"], [99999n, "999.99"], [100000n, "1,000.00"], [1000000n, "10,000.00"],
  [10000000n, "1,00,000.00"], [12505050n, "1,25,050.50"], [123456789n, "12,34,567.89"], [12345678950n, "12,34,56,789.50"],
  [100000000000n, "1,00,00,00,000.00"], [999999999999999n, "99,99,99,99,99,999.99"],
];
for (const [paise, text] of formatted) eq(formatIndian(paise), text, `formatIndian(${paise})`);
for (const paise of amounts) {
  const back = parsed(formatIndian(paise));
  ok(back.ok && back.paise === paise, `parse(formatIndian(${paise})) round-trips`);
  const plain = parsed(decimal(paise));
  ok(plain.ok && plain.paise === paise, `parse(${decimal(paise)}) round-trips`);
}

/* ---------- Hindi: CLDR rules, evaluated by an independent tiny RBNF evaluator ---------- */
const CLDR_HI_RULES = String.raw`%spellout-cardinal:
-x: ऋण >>;
x.x: << दशमलव >>;
0: शून्य;
1: एक;
2: दो;
3: तीन;
4: चार;
5: पाँच;
6: छह;
7: सात;
8: आठ;
9: नौ;
10: दस;
11: ग्यारह;
12: बारह;
13: तेरह;
14: चौदह;
15: पन्द्रह;
16: सोलह;
17: सत्रह;
18: अठारह;
19: उन्नीस;
20: बीस;
21: इक्कीस;
22: बाईस;
23: तेईस;
24: चौबीस;
25: पच्चीस;
26: छब्बीस;
27: सत्ताईस;
28: अट्ठाईस;
29: उनतीस;
30: तीस;
31: इकतीस;
32: बत्तीस;
33: तैंतीस;
34: चौंतीस;
35: पैंतीस;
36: छत्तीस;
37: सैंतीस;
38: अड़तीस;
39: उनतालीस;
40: चालीस;
41: इकतालीस;
42: बयालीस;
43: तैंतालीस;
44: चौवालीस;
45: पैंतालीस;
46: छियालीस;
47: सैंतालीस;
48: अड़तालीस;
49: उनचास;
50: पचास;
51: इक्यावन;
52: बावन;
53: तिरेपन;
54: चौवन;
55: पचपन;
56: छप्पन;
57: सत्तावन;
58: अट्ठावन;
59: उनसठ;
60: साठ;
61: इकसठ;
62: बासठ;
63: तिरेसठ;
64: चौंसठ;
65: पैंसठ;
66: छियासठ;
67: सड़सठ;
68: अड़सठ;
69: उनहत्तर;
70: सत्तर;
71: इकहत्तर;
72: बहत्तर;
73: तिहत्तर;
74: चौहत्तर;
75: पचहत्तर;
76: छिहत्तर;
77: सतहत्तर;
78: अठहत्तर;
79: उनासी;
80: अस्सी;
81: इक्यासी;
82: बयासी;
83: तिरासी;
84: चौरासी;
85: पचासी;
86: छियासी;
87: सत्तासी;
88: अट्ठासी;
89: नवासी;
90: नब्बे;
91: इक्यानबे;
92: बानबे;
93: तिरानबे;
94: चौरानबे;
95: पंचानबे;
96: छियानबे;
97: सत्तानबे;
98: अट्ठानबे;
99: निन्यानबे;
100: << सौ[ >>];
1000: << हज़ार[ >>];
100000: << लाख[ >>];
10000000: << करोड़[ >>];
1000000000: << अरब[ >>];
100000000000: << खरब[ >>];
1000000000000000000: =#,##,##0=;`;
const rules = CLDR_HI_RULES.split("\n")
  .map((line) => /^(\d+): (.*);$/.exec(line.trim()))
  .filter((match) => match !== null)
  .map((match) => ({ base: BigInt(match[1]), body: match[2] }))
  .sort((a, b) => (a.base < b.base ? -1 : 1));
const nfc = (text) => text.normalize("NFC");
/** CLDR RBNF: pick the rule with the largest base <= n; << is n / divisor, >> is n % divisor, [ ... ] is dropped on a round number. */
function cldrSpell(n) {
  let rule = rules[0];
  for (const candidate of rules) if (candidate.base <= n) rule = candidate;
  let divisor = 1n;
  while (divisor * 10n <= rule.base) divisor *= 10n;
  return nfc(rule.body
    .replace(/\[([^\]]*)\]/, (_, inner) => (n % divisor === 0n ? "" : inner))
    .replace(/<</g, () => cldrSpell(n / divisor))
    .replace(/>>/g, () => cldrSpell(n % divisor)));
}
eq(rules.length, 107, "0 to 99, then 100, 1000, 10^5, 10^7, 10^9, 10^11 and the 10^18 fallback");
eq(cldrSpell(1234567n), nfc("बारह लाख चौंतीस हज़ार पाँच सौ सड़सठ"), "the evaluator itself reproduces a research vector");

// The research vectors (scratchpad/words/hindi-cldr-vectors.json, evaluated from the same rules).
const VECTORS = [
  [0n, "शून्य"], [1n, "एक"], [21n, "इक्कीस"], [29n, "उनतीस"], [99n, "निन्यानबे"], [100n, "एक सौ"], [101n, "एक सौ एक"], [999n, "नौ सौ निन्यानबे"],
  [1000n, "एक हज़ार"], [100000n, "एक लाख"], [125050n, "एक लाख पच्चीस हज़ार पचास"], [1234567n, "बारह लाख चौंतीस हज़ार पाँच सौ सड़सठ"],
  [10000000n, "एक करोड़"], [12345678n, "एक करोड़ तेईस लाख पैंतालीस हज़ार छह सौ अठहत्तर"],
];
for (const [n, expected] of VECTORS) {
  eq(nfc(hindiNumberWords(n)), nfc(expected), `Hindi vector ${n}`);
  eq(nfc(hindiNumberWords(n)), cldrSpell(n), `Hindi vector ${n} equals the CLDR evaluator`);
}

// Every number up to 3 lakh, then boundaries and 1,500 pseudo-random numbers below 100 crore, equal CLDR exactly.
for (let n = 0n; n < 300000n; n++) {
  const mine = hindiNumberWords(n);
  if (mine !== cldrSpell(n)) assert.fail(`Hindi ${n}: ${mine} differs from CLDR ${cldrSpell(n)}`);
}
checks++;
const hindiNext = lcg(1881);
const hindiSamples = [];
for (let k = 5; k <= 9; k++) for (const delta of [-1n, 0n, 1n]) hindiSamples.push(10n ** BigInt(k) + delta);
for (let i = 0; i < 1500; i++) hindiSamples.push(hindiNext() % 1000000000n);
for (const n of hindiSamples) {
  if (n >= 1000000000n) continue; // 100 crore and up is the documented difference below
  eq(hindiNumberWords(n), cldrSpell(n), `Hindi ${n} equals CLDR`);
}
for (let n = 0n; n < 100n; n++) {
  eq(hindiNumberWords(n), nfc(hindiNumberWords(n)), `Hindi ${n} is NFC`);
  ok(hindiNumberWords(n).length > 0 && !/[a-z0-9]/i.test(hindiNumberWords(n)), `Hindi ${n} is Devanagari only`);
}
const hindiMany = new Set([...Array(100).keys()].map((n) => hindiNumberWords(BigInt(n))));
eq(hindiMany.size, 100, "the 0-99 table has 100 distinct words");

// From 100 crore the crore count is read in full: CLDR's अरब and खरब are not used (documented choice).
const CRORE = nfc("करोड़");
for (const [n, expected] of [
  [1000000000n, "एक सौ करोड़"], [10000000000n, "एक हज़ार करोड़"], [100000000000n, "दस हज़ार करोड़"], [1000000000000n, "एक लाख करोड़"],
  [1234567890123n, "एक लाख तेईस हज़ार चार सौ छप्पन करोड़ अठहत्तर लाख नब्बे हज़ार एक सौ तेईस"],
  [10n ** 13n - 1n, "नौ लाख निन्यानबे हज़ार नौ सौ निन्यानबे करोड़ निन्यानबे लाख निन्यानबे हज़ार नौ सौ निन्यानबे"],
]) {
  eq(nfc(hindiNumberWords(n)), nfc(expected), `Hindi ${n}`);
}
ok(!/अरब|खरब/.test(hindiNumberWords(1000000000n) + hindiNumberWords(100000000000n) + hindiNumberWords(10n ** 13n - 1n)), "never अरब or खरब");
// ... and it is CLDR's own count: spell(crore count) + करोड़ + spell(rest), for the crore count and the rest.
for (let i = 0; i < 400; i++) {
  const n = 1000000000n + (hindiNext() % (10n ** 13n - 1000000000n));
  const crore = n / 10000000n;
  const rest = n % 10000000n;
  const expected = `${cldrSpell(crore)} ${CRORE}${rest === 0n ? "" : ` ${cldrSpell(rest)}`}`;
  eq(nfc(hindiNumberWords(n)), expected, `Hindi ${n} reads the crore count in full`);
}
// The two research rows where CLDR says अरब and खरब, with what we print instead.
eq(cldrSpell(1000000000n), nfc("एक अरब"), "CLDR: 100 crore is एक अरब");
eq(cldrSpell(100000000000n), nfc("एक खरब"), "CLDR: 10,000 crore is एक खरब");

/* ---------- Hindi: rupees and paise (cheque and invoice custom) ---------- */
const hindiAmounts = [
  [0n, "शून्य रुपये मात्र"], [1n, "एक पैसा मात्र"], [2n, "दो पैसे मात्र"], [50n, "पचास पैसे मात्र"], [100n, "एक रुपया मात्र"], [101n, "एक रुपया और एक पैसा मात्र"],
  [200n, "दो रुपये मात्र"], [250n, "दो रुपये और पचास पैसे मात्र"], [10000n, "एक सौ रुपये मात्र"], [123450n, "एक हज़ार दो सौ चौंतीस रुपये और पचास पैसे मात्र"],
  [12505050n, "एक लाख पच्चीस हज़ार पचास रुपये और पचास पैसे मात्र"], [1770000n, "सत्रह हज़ार सात सौ रुपये मात्र"], [100000000000n, "एक सौ करोड़ रुपये मात्र"],
  [12345678950n, "बारह करोड़ चौंतीस लाख छप्पन हज़ार सात सौ नवासी रुपये और पचास पैसे मात्र"],
];
for (const [paise, expected] of hindiAmounts) eq(nfc(hindiWords(paise)), nfc(expected), `Hindi words for ${paise} paise`);
for (const paise of amounts) {
  const words = hindiWords(paise);
  ok(words.endsWith("मात्र"), "Hindi words end with मात्र");
  ok(!/\s{2,}|^\s|\s$/.test(words), `no stray spaces in ${paise}`);
  eq(words, nfc(words), "Hindi words are NFC");
  eq(amountInWordsText(paise, { language: "hi" }), words, "amountInWordsText dispatches Hindi");
}
eq(amountInWordsText(12505050n), englishWords(12505050n), "amountInWordsText defaults to English cheque style");
eq(amountInWordsText(12505050n, { language: "en", style: "suffix", letters: "upper" }), englishWords(12505050n, "suffix", "upper"));

/* ---------- Google Sheets function ---------- */
ok(SHEETS_SNIPPET.includes(`function ${SHEETS_FUNCTION_NAME}(`) && SHEETS_SNIPPET.includes("@customfunction"), "the snippet declares the custom function");
// Plain ES5: no arrow functions, template literals, let/const, classes, spread or for-of.
for (const [pattern, name] of [[/=>/, "arrow"], [/`/, "template literal"], [/\b(let|const|class)\b/, "let/const/class"], [/\.\.\./, "spread"], [/\bfor\s*\([^)]*\sof\s/, "for-of"], [/\bBigInt\b|\d+n\b/, "BigInt"], [/\b(padStart|startsWith|endsWith|includes|Object\.assign|Number\.isInteger)\b/, "ES2015 builtin"]]) {
  ok(!pattern.test(SHEETS_SNIPPET), `the snippet has no ${name}`);
}
ok(SHEETS_SNIPPET.split("\n").every((line) => !/[^\x00-\x7f]/.test(line)), "the snippet is plain ASCII (the rupee sign is written as an escape)");
const context = vm.createContext({});
vm.runInContext(SHEETS_SNIPPET, context);
const sheet = vm.runInContext(SHEETS_FUNCTION_NAME, context);
eq(typeof sheet, "function");
for (const paise of amounts) {
  const expected = englishWords(paise, "cheque");
  eq(sheet(Number(decimal(paise))), expected, `Sheets number cell ${decimal(paise)}`);
  eq(sheet(decimal(paise)), expected, `Sheets text cell ${decimal(paise)}`);
  eq(sheet(formatIndian(paise)), expected, `Sheets Indian-grouped text ${formatIndian(paise)}`);
}
eq(sheet(125050.5), "Rupees One Lakh Twenty Five Thousand Fifty and Fifty Paise Only", "the documented example");
eq(sheet(0.5), "Rupees Zero and Fifty Paise Only");
eq(sheet(118.00000000000001), "Rupees One Hundred Eighteen Only", "float noise from a formula is accepted");
eq(sheet(1234.5), "Rupees One Thousand Two Hundred Thirty Four and Fifty Paise Only");
// The same text inputs the page accepts and refuses (ASCII ones: the snippet has no Devanagari digits).
for (const [text, paise] of accepted) {
  if (/[^\x00-\x7f]/.test(text.replace(/₹/g, ""))) continue;
  eq(sheet(text), englishWords(paise, "cheque"), `Sheets accepts ${JSON.stringify(text)} like the page`);
}
for (const [text] of refused) {
  if (/[^\x00-\x7f]/.test(text)) continue;
  assert.throws(() => sheet(text), /./, `Sheets refuses ${JSON.stringify(text)} like the page`);
  checks++;
}
for (const bad of [NaN, Infinity, -Infinity, -5, -0.01, 12.345, 0.001, 1.005, 1e13, 1e21, null, undefined, true, "1,2,3", [[1], [2]], [[5, 6]], {}, "Rs.", "₹"]) {
  assert.throws(() => sheet(bad), /./, `Sheets refuses ${String(bad)}`);
  checks++;
}
// A one-cell range is a one-element array of arrays in Sheets; a whole range is refused with its own message.
assert.throws(() => sheet([[1], [2]]), /one cell/);
assert.throws(() => sheet(12.345), /2 decimals/);
assert.throws(() => sheet("1,23,45"), /commas/);
assert.throws(() => sheet(-1), /zero or more/);
checks += 4;

/* ---------- screen translations ---------- */
// phrases.ts falls back to English without a word, and nothing else checks it: every text the island passes through
// tr() (and every error message it looks up by code) must have hi, ta, te and mr phrases.
const islandSource = readFileSync(new URL("../src/components/AmountWords.tsx", import.meta.url), "utf8");
const phrasesSource = readFileSync(new URL("../src/data/wordsPhrases.ts", import.meta.url), "utf8");
const unquote = (raw) => JSON.parse(`"${raw}"`);
const trKeys = new Set([...islandSource.matchAll(/\btr\("((?:[^"\\]|\\.)*)"\)/g)].map((match) => unquote(match[1])));
const messageBlock = /const MESSAGE: Record<ParseErrorCode, string> = \{([\s\S]*?)\n\};/.exec(islandSource);
ok(messageBlock !== null, "the island's error-message table was found");
const messageKeys = [...messageBlock[1].matchAll(/^\s*(?:"[\w-]+"|\w+): "((?:[^"\\]|\\.)*)",?$/gm)].map((match) => unquote(match[1]));
eq(messageKeys.length, 7, "one message per parse error code");
for (const key of messageKeys) trKeys.add(key);
ok(trKeys.size >= 20, `found ${trKeys.size} screen texts`);
for (const key of trKeys) {
  const entry = phrasesSource.split("\n").find((line) => line.trimStart().startsWith(`${JSON.stringify(key)}: {`));
  ok(entry !== undefined, `wordsPhrases.ts has an entry for ${JSON.stringify(key)}`);
  for (const language of ["hi", "ta", "te", "mr"]) {
    ok(new RegExp(`\\b${language}: "[^"]+"`).test(entry), `${JSON.stringify(key)} has a ${language} phrase`);
  }
}
for (const code of ["empty", "negative", "not-a-number", "decimal-comma", "bad-commas", "decimals", "too-large"]) {
  ok(new RegExp(`(?:"${code}"|\\b${code}):`).test(messageBlock[1]), `the island has a message for the ${code} error`);
}

/* ---------- source hygiene ---------- */
const source = readFileSync(new URL("../src/lib/words.ts", import.meta.url), "utf8");
ok(!/^\s*import\s/m.test(source), "src/lib/words.ts is import-free");
const engine = source.split("/* ---------------- Google Sheets (Apps Script) ---------------- */")[0];
ok(engine.length > 3000 && engine.includes("export function hindiWords"), "the engine part of the file was found");
ok(!/Math\.random|parseFloat|parseInt|toFixed\(/.test(engine), "no random numbers, float parsing or toFixed in the engine");
ok(!/\* 100\b(?!n)/.test(engine), "no `* 100` money maths in the engine");
ok(!source.includes('class="'), 'no class=" text (the JSX guard greps for it)');
ok(/^\d{4}-\d{2}-\d{2}$/.test(WORDS_REVIEWED_ON), "review date is an ISO date");
const page = readFileSync(new URL("../src/pages/amount-in-words.astro", import.meta.url), "utf8");
ok(page.includes("WORDS_REVIEWED_ON"), "the page shows the review date from the lib");
ok(!/inr-words/.test(source + page + readFileSync(new URL("../src/components/AmountWords.tsx", import.meta.url), "utf8")), "nothing imports src/lib/inr-words.ts");

console.log(`[words] ${checks} checks passed: English parity with the invoice generator over ${amounts.size} amounts, reverse reading, parser, Hindi against CLDR, and the Sheets function in a VM`);
