// Free invoice generator engine (src/lib/invoice/core.ts, regimes.ts): exact integer money, per-rate tax,
// discount allocation, words, numbering, and the country rules that decide titles, tax split and legal notes.
import assert from "node:assert/strict";
import {
  addDays, allocate, amountInWords, computeInvoice, FX_DIGITS, minorDigits, mulDivRound, nextInvoiceNumber, parseAmount, parsePlain, parseQty,
  parseRate, toInrPaise,
} from "../src/lib/invoice/core.ts";
import {
  CANADA_PROVINCES, COUNTRIES, countryByCode, countryFromTimeZone, defaultRate, gstinState, INDIA_EXPORT_IGST, INDIA_EXPORT_LUT, INDIA_STATES, INVOICE_CURRENCIES,
  taxPlan, validGstin,
} from "../src/lib/invoice/regimes.ts";
import { LUT_ENDORSEMENT } from "../src/lib/workspace/currency.ts";

/* ---------- parsing ---------- */
assert.equal(parseAmount("4999", "INR"), 499900);
assert.equal(parseAmount("1,25,000.50", "INR"), 12500050);
assert.equal(parseAmount("1,250.5", "USD"), 125050);
assert.equal(parseAmount("12,50", "EUR", true), 1250);
assert.equal(parseAmount("1.250,50", "EUR", true), 125050);
assert.equal(parseAmount("1.500", "EUR", true), 150000);
assert.equal(parseAmount("1.5", "EUR", true), 150);
assert.equal(parseAmount("1 250,50", "EUR", true), 125050);
assert.equal(parseAmount("1.250.000", "EUR", true), 125000000);
assert.equal(parseAmount("1500", "JPY"), 1500);
assert.equal(parseAmount("1500.5", "JPY"), null, "yen has no minor unit");
assert.equal(parseAmount("12.345", "KWD"), 12345);
assert.equal(parseAmount("0.001", "INR"), null);
assert.equal(parseAmount("-5", "INR"), null);
assert.equal(parseAmount("abc", "INR"), null);
assert.equal(parseAmount("", "INR"), null);
assert.equal(parseAmount("100000000000", "INR"), 10_000_000_000_000);
assert.equal(parseAmount("100000000000.01", "INR"), null, "above the ceiling");
assert.equal(parseQty("2.5"), 2500);
assert.equal(parseQty("2,5", true), 2500);
assert.equal(parseQty("0.333"), 333);
assert.equal(parseQty("0.3333"), null);
assert.equal(parseRate("18"), 18000);
assert.equal(parseRate("9.975"), 9975, "a rate never has thousands grouping, on any page");
assert.equal(parseRate("9,975"), 9975);
assert.equal(parseRate("5,5"), 5500);
assert.equal(parseRate(" 25.5 "), 25500);
assert.equal(parseRate(".5"), 500);
assert.equal(parseRate("100"), 100000);
assert.equal(parseRate("100.001"), null);
assert.equal(parseRate("1.000,5"), null);
assert.equal(parseRate("9.9755"), null);
assert.equal(parseRate("-5"), null);
assert.equal(parseRate(""), null);
assert.equal(parseRate("."), null);
assert.equal(parsePlain("0.0053", FX_DIGITS), 5300);
assert.equal(parsePlain("84,10", FX_DIGITS), 84_100_000);
assert.equal(minorDigits("INR"), 2);
assert.equal(minorDigits("JPY"), 0);
assert.equal(minorDigits("BHD"), 3);
for (const c of INVOICE_CURRENCIES) assert.doesNotThrow(() => new Intl.NumberFormat("en", { style: "currency", currency: c }), c);

/* ---------- integer helpers ---------- */
assert.equal(mulDivRound(5, 1, 2), 3, "half rounds up");
assert.equal(mulDivRound(4, 1, 3), 1);
assert.equal(mulDivRound(1_000_000_000, 10_000_000, 1000), 10_000_000_000_000, "product above 2^53 stays exact");
assert.deepEqual(allocate([100, 100, 100], 100), [34, 33, 33]);
assert.deepEqual(allocate([1000, 3000], 400), [100, 300]);
assert.deepEqual(allocate([0, 0], 50), [0, 0]);
assert.deepEqual(allocate([700, 300], 0), [0, 0]);

/* ---------- the bridge-e2e invoice: ₹10,000 + 2 × ₹2,500 at 18% = ₹17,700 ---------- */
{
  const t = computeInvoice({
    lines: [{ qtyMilli: 1000, priceMinor: 1_000_000, rateK: 18000 }, { qtyMilli: 2000, priceMinor: 250_000, rateK: 18000 }],
    discount: { kind: "amount", minor: 0 }, split: "cgst_sgst", extraRateK: 0, paidMinor: 0, roundTo: 0,
  });
  assert.equal(t.subtotal, 1_500_000);
  assert.equal(t.tax, 270_000);
  assert.equal(t.total, 1_770_000);
  assert.deepEqual(t.groups[0].parts.map((p) => [p.kind, p.rateK, p.minor]), [["cgst", 9000, 135_000], ["sgst", 9000, 135_000]]);
}

/* ---------- mixed rates, percent discount, IGST, round-off, part payment ---------- */
{
  const t = computeInvoice({
    lines: [
      { qtyMilli: 2500, priceMinor: 199_999, rateK: 18000 }, // 2.5 × ₹1,999.99 = ₹4,999.975 → 499998 (half up)
      { qtyMilli: 1000, priceMinor: 100_001, rateK: 5000 },
      { qtyMilli: 3000, priceMinor: 3333, rateK: 0 },
    ],
    discount: { kind: "percent", rateK: 10000 }, split: "igst", extraRateK: 0, paidMinor: 100_000, roundTo: 100,
  });
  assert.deepEqual(t.lineAmounts, [499_998, 100_001, 9999]);
  assert.equal(t.subtotal, 609_998);
  assert.equal(t.discount, 61_000);
  assert.equal(t.lineBases.reduce((s, x) => s + x, 0), t.taxable);
  assert.equal(t.taxable, 548_998);
  assert.deepEqual(t.lineBases, [449_998, 90_001, 8999]);
  assert.deepEqual(t.groups.map((g) => [g.rateK, g.baseMinor, g.taxMinor]), [[18000, 449_998, 81_000], [5000, 90_001, 4500], [0, 8999, 0]]);
  assert.equal(t.tax, 85_500);
  assert.equal(t.roundOff, 2);
  assert.equal(t.total, 634_500);
  assert.equal(t.paid, 100_000);
  assert.equal(t.balance, 534_500);
}

/* ---------- Québec: GST 5% + QST 9.975% on taxable lines only ---------- */
{
  const t = computeInvoice({
    lines: [{ qtyMilli: 1000, priceMinor: 100_000, rateK: 5000 }, { qtyMilli: 1000, priceMinor: 50_000, rateK: 0 }],
    discount: { kind: "amount", minor: 0 }, split: "single", extraRateK: 9975, paidMinor: 0, roundTo: 0,
  });
  assert.equal(t.tax, 5000);
  assert.equal(t.extraBase, 100_000);
  assert.equal(t.extraTax, 9975);
  assert.equal(t.total, 164_975);
}

/* ---------- no tax at all, amount discount above the subtotal, overpayment ---------- */
{
  const t = computeInvoice({
    lines: [{ qtyMilli: 1000, priceMinor: 5000, rateK: 18000 }],
    discount: { kind: "amount", minor: 9999 }, split: "none", extraRateK: 5000, paidMinor: 999, roundTo: 0,
  });
  assert.equal(t.discount, 5000);
  assert.equal(t.tax, 0);
  assert.equal(t.extraTax, 0);
  assert.equal(t.total, 0);
  assert.equal(t.paid, 0);
  assert.equal(t.balance, 0);
}

/* ---------- EMI-style sanity: ₹10L at 18% GST = ₹1.8L ---------- */
assert.equal(computeInvoice({ lines: [{ qtyMilli: 1000, priceMinor: 100_000_000, rateK: 18000 }], discount: { kind: "amount", minor: 0 }, split: "cgst_sgst", extraRateK: 0, paidMinor: 0, roundTo: 0 }).tax, 18_000_000);

/* ---------- exchange rate ---------- */
assert.equal(toInrPaise(120_050, "USD", 84_102_500), 10_096_505); // $1,200.50 × ₹84.1025 = ₹1,00,965.05
assert.equal(toInrPaise(1500, "JPY", 560_000), 84_000); // ¥1,500 × ₹0.56 = ₹840
assert.equal(toInrPaise(1_000_000_000, "IDR", 5_300), 5_300_000); // Rp 10,000,000.00 × ₹0.0053 = ₹53,000

/* ---------- words ---------- */
assert.equal(amountInWords(1_770_000, "INR"), "Rupees Seventeen Thousand Seven Hundred Only");
assert.equal(amountInWords(12_345_678_950, "INR"), "Rupees Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine and Fifty Paise Only");
assert.equal(amountInWords(1_000_000_000_000, "INR"), "Rupees One Thousand Crore Only");
assert.equal(amountInWords(120_050, "USD"), "US Dollars One Thousand Two Hundred and Fifty Cents Only");
assert.equal(amountInWords(0, "EUR"), "Euros Zero Only");
assert.equal(amountInWords(1_000_001, "JPY"), "Yen One Million One Only");
assert.equal(amountInWords(12_345, "KWD"), "Kuwaiti Dinars Twelve and Three Hundred Forty Five Fils Only");
assert.equal(amountInWords(150, "XYZ"), "XYZ One and 50/100 Only");

/* ---------- numbering and dates ---------- */
assert.equal(nextInvoiceNumber("INV-0001"), "INV-0002");
assert.equal(nextInvoiceNumber("INV-0099"), "INV-0100");
assert.equal(nextInvoiceNumber("KDS/2026-27/9"), "KDS/2026-27/10");
assert.equal(nextInvoiceNumber("A12-B"), "A13-B");
assert.equal(nextInvoiceNumber("Draft"), "Draft-2");
assert.equal(nextInvoiceNumber("999"), "1000");
assert.equal(addDays("2026-10-28", 30), "2026-11-27");
assert.equal(addDays("2026-12-31", 1), "2027-01-01");
assert.equal(addDays("2026-02-30", 1), "");

/* ---------- GSTIN ---------- */
assert.ok(validGstin("27AAPFU0939F1ZV"), "a published sample GSTIN");
assert.ok(validGstin("29AAGCB7383J1Z4"));
assert.ok(!validGstin("27AAPFU0939F1ZW"), "bad check digit");
assert.ok(!validGstin("27AAPFU0939F1Z"), "short");
assert.equal(gstinState("27AAPFU0939F1ZV"), "27");
assert.equal(gstinState("99AAPFU0939F1ZV"), "");
assert.equal(INDIA_STATES.length, 37);
assert.equal(new Set(INDIA_STATES.map((s) => s.code)).size, 37);

/* ---------- country rules ---------- */
const ctx = { status: "registered", where: "domestic", kind: "services", sellerRegion: "", clientRegion: "", lutArn: "", reverseCharge: false };
const IN = countryByCode("IN");
assert.equal(INDIA_EXPORT_LUT, LUT_ENDORSEMENT, "same Rule 46 text as the tracker");
assert.deepEqual(taxPlan(IN, { ...ctx, sellerRegion: "27", clientRegion: "27" }), { title: "taxInvoice", split: "cgst_sgst", zero: false, taxLabel: "GST", notes: [], india: true });
assert.deepEqual(taxPlan(IN, { ...ctx, sellerRegion: "27", clientRegion: "29" }), { title: "taxInvoice", split: "igst", zero: false, taxLabel: "IGST", notes: [], india: true });
assert.equal(taxPlan(IN, { ...ctx, sellerRegion: "27", clientRegion: "" }).split, "cgst_sgst", "unknown place of supply stays intra-state");
assert.deepEqual(taxPlan(IN, { ...ctx, where: "abroad", lutArn: "ad2704250012345" }).notes, [`${INDIA_EXPORT_LUT} (LUT ARN AD2704250012345)`]);
assert.equal(taxPlan(IN, { ...ctx, where: "abroad", lutArn: "AD2704250012345" }).zero, true);
assert.deepEqual(taxPlan(IN, { ...ctx, where: "abroad" }), { title: "taxInvoice", split: "igst", zero: false, taxLabel: "IGST", notes: [INDIA_EXPORT_IGST], india: true });
assert.equal(taxPlan(IN, { ...ctx, status: "composition" }).title, "billOfSupply");
assert.equal(taxPlan(IN, { ...ctx, status: "composition" }).split, "none");
assert.deepEqual(taxPlan(IN, { ...ctx, status: "unregistered" }), { title: "invoice", split: "none", zero: false, taxLabel: "GST", notes: [], india: false });
assert.equal(taxPlan(IN, { ...ctx, reverseCharge: true }).zero, true);

const DE = countryByCode("DE");
assert.deepEqual(taxPlan(DE, ctx), { title: "invoice", split: "single", zero: false, taxLabel: "VAT", notes: [], india: false });
assert.deepEqual(taxPlan(DE, { ...ctx, status: "unregistered" }).notes, ["Gemäß § 19 UStG wird keine Umsatzsteuer berechnet."]);
assert.deepEqual(taxPlan(DE, { ...ctx, where: "eu" }).notes, ["Steuerschuldnerschaft des Leistungsempfängers. Reverse charge: VAT to be accounted for by the recipient (Art. 196 Directive 2006/112/EC)."]);
assert.deepEqual(taxPlan(DE, { ...ctx, where: "eu", kind: "goods" }).notes, ["VAT-exempt intra-Community supply (Art. 138 Directive 2006/112/EC)."]);
assert.equal(taxPlan(DE, { ...ctx, where: "abroad" }).zero, true);
assert.equal(taxPlan(countryByCode("GB"), { ...ctx, where: "abroad" }).notes[0], "Outside the scope of UK VAT: place of supply is the customer's country.");
assert.equal(taxPlan(countryByCode("GB"), ctx).title, "vatInvoice");
assert.equal(taxPlan(countryByCode("AU"), { ...ctx, status: "unregistered" }).notes[0], "No GST has been charged.");
assert.equal(taxPlan(countryByCode("JP"), ctx).title, "qualifiedInvoice");
assert.equal(taxPlan(countryByCode("US"), { ...ctx, where: "abroad" }).zero, false, "no export rule without a VAT system");
assert.equal(taxPlan(countryByCode("CA"), { ...ctx, clientRegion: "ON" }).taxLabel, "HST");
assert.equal(defaultRate(countryByCode("CA"), "ON"), "13");
assert.equal(defaultRate(countryByCode("CA"), "QC"), "5");
assert.equal(CANADA_PROVINCES.find((p) => p.code === "QC").extra.rate, "9.975");
assert.equal(defaultRate(IN), "18");
assert.equal(defaultRate(DE), "19");

for (const c of COUNTRIES) {
  assert.ok(c.rates.length > 0 && c.rates.every((r) => parseRate(r) !== null), `${c.code} rates parse`);
  assert.ok(INVOICE_CURRENCIES.includes(c.currency), `${c.code} currency offered`);
  assert.doesNotThrow(() => new Intl.DateTimeFormat(c.locale), c.code);
  for (const where of ["domestic", "eu", "abroad"]) for (const status of c.statuses) taxPlan(c, { ...ctx, where, status });
}
assert.equal(new Set(COUNTRIES.map((c) => c.code)).size, COUNTRIES.length);
assert.equal(countryByCode("DE").localTax.name, "USt.");
assert.equal(countryByCode("FR").localTax.lang, "fr");
const DOC_LANGS = ["en", "hi", "ta", "te", "mr", "es", "pt", "fr", "de", "id", "ar", "it", "ja", "zh"];
for (const c of COUNTRIES) if (c.localTax) assert.ok(DOC_LANGS.includes(c.localTax.lang), `${c.code} localTax language`);

assert.equal(countryFromTimeZone("Asia/Kolkata"), "IN");
assert.equal(countryFromTimeZone("America/Indiana/Indianapolis"), "US");
assert.equal(countryFromTimeZone("Australia/Sydney"), "AU");
assert.equal(countryFromTimeZone("America/Toronto"), "CA");
assert.equal(countryFromTimeZone("UTC"), "");
for (const code of ["IN", "GB", "DE", "US", "AU", "CA", "SG", "AE"]) assert.ok(COUNTRIES.some((c) => c.code === code));

console.log("invoice: all checks passed");
