import assert from "node:assert/strict";
import { displayCurrency, formatMoney, moneySymbol, withCurrency, defaultInvoiceTemplateId } from "../src/data/documentLang.ts";

assert.equal(moneySymbol("en"), "₹");
assert.equal(moneySymbol("hi"), "₹");
assert.equal(moneySymbol("es"), "€");
assert.equal(moneySymbol("pt"), "R$");
assert.equal(moneySymbol("ja"), "¥");
assert.equal(moneySymbol("ar"), "د.إ");
assert.equal(displayCurrency("fr").code, "EUR");
assert.equal(displayCurrency("id").code, "IDR");
assert.equal(displayCurrency("zh").code, "CNY");

assert.equal(withCurrency("Monthly rent ₹", "es"), "Monthly rent €");
assert.equal(withCurrency("Monthly rent ₹", "hi"), "Monthly rent ₹");

assert.ok(formatMoney(1500, "es", 0).includes("1") && formatMoney(1500, "es", 0).includes("€") || formatMoney(1500, "es", 0).includes("EUR"));
assert.ok(formatMoney(1500, "en", 0).includes("₹") || formatMoney(1500, "en", 0).includes("INR"));

assert.equal(defaultInvoiceTemplateId("en"), "in-gst");
assert.equal(defaultInvoiceTemplateId("hi"), "in-gst");
assert.equal(defaultInvoiceTemplateId("es"), "eu-vat");
assert.equal(defaultInvoiceTemplateId("pt"), "br-nf");
assert.equal(defaultInvoiceTemplateId("ar"), "ae-vat");
assert.equal(defaultInvoiceTemplateId("ja"), "jp-tax");

console.log("currency-locale.test.mjs ok");
