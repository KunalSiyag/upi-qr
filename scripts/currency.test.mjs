// Currencies for clients abroad (src/lib/workspace/currency.ts, docs/spec-foreign-clients.md §1.1, §3, §6):
// exact display strings, integer-only parsing with the grouping check, payment-detail validators,
// financial-year helpers and the verbatim Rule 46 endorsement.
import assert from "node:assert/strict";
import {
  addMoney, CURRENCIES, CURRENCY_PREFIX, exportNote, FOREIGN_CURRENCIES, formatIban, formatMoney, fyOf, isCurrency, isForeignCurrency,
  looksLikeIban, LUT_ENDORSEMENT, MAX_MINOR, MINOR_DIGITS, minorToDecimal, moneyList, normalizeAccount, normalizeFy, normalizeLutArn,
  normalizeSwift, parseMoneyToMinor, PAY_URL_HOSTS, safePayUrl, validIban,
} from "../src/lib/workspace/currency.ts";
import { emptyWorkspace, formatPaise, paiseToDecimal, parseRupeesToPaise, sanitizeWorkspace } from "../src/lib/workspace/model.ts";

const NBSP = " ";

/* ---------- codes ---------- */
assert.deepEqual([...CURRENCIES], ["INR", "USD", "EUR", "GBP", "AED", "AUD", "CAD", "SGD"]);
assert.deepEqual([...FOREIGN_CURRENCIES], ["USD", "EUR", "GBP", "AED", "AUD", "CAD", "SGD"]);
assert.ok(isCurrency("INR") && isCurrency("USD") && !isCurrency("XYZ") && !isCurrency("usd") && !isCurrency(undefined));
assert.ok(isForeignCurrency("EUR") && !isForeignCurrency("INR") && !isForeignCurrency("XYZ") && !isForeignCurrency(1));
for (const c of CURRENCIES) assert.equal(MINOR_DIGITS[c], 2, c);
assert.equal(MAX_MINOR, 100_000_000_000);

/* ---------- formatMoney: the §3.1 table, exact strings ---------- */
assert.equal(formatMoney(12345678, "INR"), "₹1,23,456.78");
assert.equal(formatMoney(1000000, "INR"), "₹10,000");
assert.equal(formatMoney(120050, "USD"), "US$1,200.50");
assert.equal(formatMoney(100000, "EUR"), "€1,000.00");
assert.equal(formatMoney(5, "GBP"), "£0.05");
assert.equal(formatMoney(1234567800, "AED"), `AED${NBSP}12,345,678.00`);
assert.equal(formatMoney(99, "AUD"), "A$0.99");
assert.equal(formatMoney(99, "CAD"), "CA$0.99");
assert.equal(formatMoney(100, "SGD"), `SGD${NBSP}1.00`);
assert.equal(formatMoney(-120050, "USD"), "−US$1,200.50");
assert.equal(formatMoney(0, "USD"), "US$0.00");
// INR is exactly today's formatPaise (the algorithm moved, unchanged).
{
  let seed = 7;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648);
  for (let i = 0; i < 1000; i++) {
    const x = (rand() % 2_000_000_000) - (i % 7 === 0 ? 1_000_000_000 : 0);
    assert.equal(formatMoney(x, "INR"), formatPaise(x), String(x));
  }
}
// Drift detector: the fixed prefix table equals what this ICU prints for en-GB currency formatting.
for (const c of FOREIGN_CURRENCIES) {
  for (const [minor, major] of [[120050, 1200.5], [5, 0.05], [1234567800, 12345678], [100, 1]]) {
    assert.equal(formatMoney(minor, c), new Intl.NumberFormat("en-GB", { style: "currency", currency: c }).format(major), `${c} ${minor}`);
  }
  assert.equal(CURRENCY_PREFIX[c].length > 0, true);
}

/* ---------- parseMoneyToMinor ---------- */
assert.equal(parseMoneyToMinor("$1,200.50", "USD"), 120050);
assert.equal(parseMoneyToMinor("US$ 1200.5", "USD"), 120050);
assert.equal(parseMoneyToMinor("1200.50 USD", "USD"), 120050);
assert.equal(parseMoneyToMinor("€5", "EUR"), 500);
assert.equal(parseMoneyToMinor("5 EUR", "EUR"), 500);
assert.equal(parseMoneyToMinor("£0.05", "GBP"), 5);
assert.equal(parseMoneyToMinor(`AED${NBSP}1,200`, "AED"), 120000);
assert.equal(parseMoneyToMinor("1.005", "USD"), null, "three decimals");
assert.equal(parseMoneyToMinor("1.200,50", "EUR"), null, "a decimal comma is never guessed");
assert.equal(parseMoneyToMinor("12,50", "EUR"), null);
assert.equal(parseMoneyToMinor("1,5", "USD"), null);
assert.equal(parseMoneyToMinor("12,3456", "USD"), null);
assert.equal(parseMoneyToMinor("1,200", "USD"), 120000);
assert.equal(parseMoneyToMinor("1,234,567.5", "USD"), 123456750);
assert.equal(parseMoneyToMinor("-5", "USD"), null);
assert.equal(parseMoneyToMinor("€5", "USD"), null, "another currency's symbol");
assert.equal(parseMoneyToMinor("£5", "EUR"), null);
assert.equal(parseMoneyToMinor("", "USD"), null);
assert.equal(parseMoneyToMinor("$", "USD"), null);
assert.equal(parseMoneyToMinor("1e3", "USD"), null);
assert.equal(parseMoneyToMinor("0x10", "USD"), null);
// INR is parseRupeesToPaise exactly, "$5" still refused and "12,50" still 125000 (lakh grouping is typed freely).
for (const text of ["0.1", "1,250.5", "₹ 99.99", "1.005", "-5", "abc", "$5", "12,50", "1,25,000", "5.", "₹1,00,00,000", "  42  ", "1000000000", "1000000000.01", "99999999999"]) {
  assert.equal(parseMoneyToMinor(text, "INR"), parseRupeesToPaise(text), text);
}
assert.equal(parseMoneyToMinor("$5", "INR"), null);
assert.equal(parseMoneyToMinor("12,50", "INR"), 125000);
// One ceiling for both parsers and the sanitizer.
assert.equal(parseRupeesToPaise("1000000000"), 100_000_000_000);
assert.equal(parseRupeesToPaise("1000000000.01"), null);
assert.equal(parseMoneyToMinor("1,000,000,000", "USD"), MAX_MINOR);
assert.equal(parseMoneyToMinor("1000000000.01", "USD"), null);
{
  const at = (amountPaise) => ({ invoices: { inv_ceiling01: { id: "inv_ceiling01", number: "X-1", clientId: "cli_aaaaaaaa", issueDate: "2026-10-01", dueDate: "2026-10-10", amountPaise, description: "", payments: [], reminders: [], voided: false, createdAt: 1, updatedAt: 1 } } });
  assert.equal(sanitizeWorkspace(at(MAX_MINOR)).invoices.inv_ceiling01.amountPaise, MAX_MINOR, "an accepted amount is never dropped later");
  assert.equal(sanitizeWorkspace(at(MAX_MINOR + 1)).invoices.inv_ceiling01, undefined);
  assert.deepEqual(sanitizeWorkspace({}), emptyWorkspace());
}

/* ---------- decimals and maps ---------- */
assert.equal(minorToDecimal(125050), "1250.50");
assert.equal(minorToDecimal(5), "0.05");
assert.equal(minorToDecimal(125050), paiseToDecimal(125050));
let map = addMoney({}, "USD", 500);
map = addMoney(map, "INR", 100);
map = addMoney(map, "USD", 250);
map = addMoney(map, "EUR", 0);
assert.deepEqual(map, { USD: 750, INR: 100, EUR: 0 });
assert.deepEqual(moneyList(map), [{ currency: "INR", minor: 100 }, { currency: "USD", minor: 750 }], "CURRENCIES order, non-zero only");

/* ---------- validators ---------- */
assert.equal(normalizeSwift("deut de ff"), "DEUTDEFF");
assert.equal(normalizeSwift("DEUTDEFF500"), "DEUTDEFF500");
assert.equal(normalizeSwift("DEUTDEFF5"), "", "9 characters");
assert.equal(normalizeSwift("12UTDEFF"), "");
assert.equal(normalizeAccount("gb82 west-1234 5698 7654 32"), "GB82WEST12345698765432");
assert.equal(normalizeAccount("12"), "");
assert.equal(normalizeAccount("<script>"), "");
assert.equal(looksLikeIban("GB82WEST12345698765432"), true);
assert.equal(looksLikeIban("123456789"), false);
assert.equal(validIban("GB82WEST12345698765432"), true);
assert.equal(validIban("GB82 WEST 1234 5698 7654 32"), true);
assert.equal(validIban("GB82WEST12345698765433"), false, "one digit changed");
assert.equal(validIban("DE89370400440532013000"), true);
assert.equal(formatIban("GB82WEST12345698765432"), "GB82 WEST 1234 5698 7654 32");
assert.deepEqual([...PAY_URL_HOSTS], ["paypal.me", "www.paypal.me", "paypal.com", "www.paypal.com", "wise.com", "buy.stripe.com", "rzp.io"]);
assert.equal(safePayUrl("https://paypal.me/name"), "https://paypal.me/name");
assert.equal(safePayUrl("  https://www.paypal.com/paypalme/name  "), "https://www.paypal.com/paypalme/name");
assert.equal(safePayUrl("https://wise.com/pay/business/acme"), "https://wise.com/pay/business/acme");
assert.equal(safePayUrl("https://buy.stripe.com/test_eVa5nPg1j1wmfXq5kr"), "https://buy.stripe.com/test_eVa5nPg1j1wmfXq5kr");
assert.equal(safePayUrl("https://rzp.io/i/nxrHnLJ"), "https://rzp.io/i/nxrHnLJ");
assert.equal(safePayUrl("HTTPS://PAYPAL.ME/Name"), "https://paypal.me/Name");
for (const bad of [
  "http://paypal.me/name", "javascript:alert(1)", "https://user@paypal.me/name", "https://user:pw@paypal.me/name", "https://paypal.me.evil.com/x",
  "https://evil.com/?paypal.me", "https://paypal.me:8443/name", "https://evil.paypal.me/x", "https://paypal.me./name", "//paypal.me/name",
  "paypal.me/name", "https://paypal.me/a b", "https://paypal.me/a\nb", `https://paypal.me/${"a".repeat(300)}`, "data:text/html,x", "", null, 42,
]) assert.equal(safePayUrl(bad), "", String(bad));
assert.equal(normalizeLutArn(" ad270326000123x "), "AD270326000123X");
assert.equal(normalizeLutArn("AD27032600012"), "");
assert.equal(normalizeLutArn("AD270326000123X9"), "");

/* ---------- financial years and the export note ---------- */
assert.equal(fyOf("2027-03-31"), "2026-27");
assert.equal(fyOf("2027-04-01"), "2027-28");
assert.equal(fyOf("2099-12-31"), "2099-00");
assert.equal(fyOf("nope"), "");
assert.equal(normalizeFy("2026-27"), "2026-27");
assert.equal(normalizeFy("2099-00"), "2099-00");
assert.equal(normalizeFy("2026-28"), "");
assert.equal(normalizeFy("26-27"), "");
assert.equal(
  LUT_ENDORSEMENT,
  "SUPPLY MEANT FOR EXPORT/SUPPLY TO SEZ UNIT OR SEZ DEVELOPER FOR AUTHORISED OPERATIONS UNDER BOND OR LETTER OF UNDERTAKING WITHOUT PAYMENT OF INTEGRATED TAX",
  "the Rule 46 text, verbatim",
);
const ARN = "AD270326000123X";
assert.equal(exportNote(ARN, "2026-27", "2027-03-31"), `${LUT_ENDORSEMENT} (LUT ARN ${ARN})`);
assert.equal(exportNote(ARN, "2026-27", "2027-04-01"), "", "an expired LUT prints nothing");
assert.equal(exportNote("", "2026-27", "2026-10-01"), "");
assert.equal(exportNote(ARN, "", "2026-10-01"), "");

console.log("[currency] formatting (with ICU drift check), parsing with the grouping check, MAX_MINOR, validators, FY and the export note passed");
