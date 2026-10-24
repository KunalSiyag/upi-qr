import assert from "node:assert/strict";
import { extractUtr, matchCredits, parseDelimited, parseStatement, parseStatementAmount, parseStatementDate } from "../src/lib/workspace/statement.ts";
import { addPayment, emptyWorkspace, invoiceViews, updateBusiness, upsertClient, upsertInvoice } from "../src/lib/workspace/model.ts";

// Values.
assert.equal(parseStatementDate("03/10/2026"), "2026-10-03");
assert.equal(parseStatementDate("03/10/26"), "2026-10-03");
assert.equal(parseStatementDate("03-Oct-2026"), "2026-10-03");
assert.equal(parseStatementDate("3 October 2026"), "2026-10-03");
assert.equal(parseStatementDate("03 Sept 2026"), "2026-09-03");
assert.equal(parseStatementDate("2026-10-03 10:15:00"), "2026-10-03");
assert.equal(parseStatementDate("31/02/2026"), "");
assert.equal(parseStatementDate("Opening Balance"), "");
assert.equal(parseStatementAmount("1,23,456.78"), 12345678);
assert.equal(parseStatementAmount("₹ 500"), 50000);
assert.equal(parseStatementAmount("4500.5 Cr"), 450050);
assert.equal(parseStatementAmount("0.00"), null);
// Digit strings joined, never "* 100": the same paise as the old arithmetic for every 1-12 digit amount.
{
  let seed = 11;
  const rand = (n) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
  for (let i = 0; i < 2000; i++) {
    const major = String(rand(10 ** 6) * 10 ** rand(7)).slice(0, 1 + rand(12));
    const fraction = ["", String(rand(10)), String(rand(100)).padStart(2, "0")][rand(3)];
    const text = fraction ? `${major}.${fraction}` : major;
    const expected = /^0+(\.0+)?$/.test(text) ? null : Number(major) * 100 + Number(fraction.padEnd(2, "0"));
    assert.equal(parseStatementAmount(text), expected, text);
  }
  assert.equal(parseStatementAmount("999999999999.99"), 99999999999999);
  assert.equal(parseStatementAmount("0001.5"), 150);
}
assert.equal(parseStatementAmount(""), null);
assert.equal(parseStatementAmount("abc"), null);
assert.equal(extractUtr("UPI/412345678901/Rohan"), "412345678901");
assert.equal(extractUtr("ACCT 1234567890123 NEFT"), "");
assert.deepEqual(parseDelimited('a,"b, c","say ""hi"""\n1,2,3', ","), [["a", "b, c", 'say "hi"'], ["1", "2", "3"]]);

// HDFC-style: preamble lines, Withdrawal/Deposit columns, dd/mm/yy.
const hdfc = `HDFC BANK Ltd.,,,,,,
Statement of account,,,,,,
Account No :,XXXXXXXX1234,,,,,
Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance
01/10/26,UPI-ROHAN MEHTA-ROHAN@OKAXIS-HDFC0000001-412345678901-INVOICE INV-0007,0000412345678901,01/10/26,,"4,500.00","54,500.00"
02/10/26,UPI-SWIGGY-PAYTM-PAYM0001-512345678901-ORDER,0000512345678901,02/10/26,349.00,,"54,151.00"
03/10/26,UPI-ACME TRADERS-ACME@OKICICI-ICIC0000001-612345678901-PAYMENT,0000612345678901,03/10/26,,"25,000.00","79,151.00"
04/10/26,NEFT CR-SBIN0001234-BRIGHT KIDS SCHOOL-PHOTO SHOOT,SBINN52026100412345,04/10/26,,"12,000.00","91,151.00"
05/10/26,UPI-UNKNOWN PERSON-X@YBL-YESB0000001-712345678901-UPI,0000712345678901,05/10/26,,"1,234.00","92,385.00"
,,,,,,
STATEMENT SUMMARY,,,,,,`;
const parsed = parseStatement(hdfc);
assert.equal(parsed.error, "");
assert.equal(parsed.credits.length, 4, "debits ignored");
assert.deepEqual(parsed.credits.map((c) => [c.date, c.amountPaise, c.utr]), [
  ["2026-10-01", 450000, "412345678901"],
  ["2026-10-03", 2500000, "612345678901"],
  ["2026-10-04", 1200000, ""],
  ["2026-10-05", 123400, "712345678901"],
]);
assert.equal(parsed.credits[2].reference, "SBINN52026100412345");

// ICICI-style headers.
const icici = `S No.,Value Date,Transaction Date,Cheque Number,Transaction Remarks,Withdrawal Amount (INR ),Deposit Amount (INR ),Balance (INR )
1,01/10/2026,01/10/2026,-,UPI/412345678901/Rohan Mehta/rohan@okaxis/Invoice INV-0007,0.00,4500.00,54500.00
2,02/10/2026,02/10/2026,-,UPI/512345678901/Swiggy/paytm@ptys/Order,349.00,0.00,54151.00`;
assert.deepEqual(parseStatement(icici).credits.map((c) => [c.date, c.amountPaise, c.utr]), [["2026-10-01", 450000, "412345678901"]]);

// SBI-style (Txn Date / Description / Debit / Credit) with "1 Oct 2026" dates and tab delimiter.
const sbi = "Txn Date\tValue Date\tDescription\tRef No./Cheque No.\tDebit\tCredit\tBalance\n1 Oct 2026\t1 Oct 2026\tBY TRANSFER-UPI/CR/412345678901/ROHAN MEHTA/SBIN/rohan@okaxis/INV-0007\tTRANSFER FROM 3199\t\t4,500.00\t54,500.00\n";
assert.deepEqual(parseStatement(sbi).credits.map((c) => [c.date, c.amountPaise, c.utr]), [["2026-10-01", 450000, "412345678901"]]);

// Axis-style DR / CR columns.
const axis = `Tran Date,CHQNO,PARTICULARS,DR,CR,BAL,SOL
01-10-2026,,UPI/P2A/412345678901/ROHAN MEHTA/Axis Bank,,4500.00,54500.00,123
02-10-2026,,UPI/P2M/512345678901/SWIGGY,349.00,,54151.00,123`;
assert.deepEqual(parseStatement(axis).credits.map((c) => c.amountPaise), [450000]);

// Single Amount column with Dr/Cr type column, and with Cr suffix.
const typed = `Date,Description,Amount,Dr/Cr
01/10/2026,UPI 412345678901 ROHAN,4500.00,CR
02/10/2026,UPI 512345678901 SWIGGY,349.00,DR
03/10/2026,UPI 612345678901 ACME,25000.00,C
04/10/2026,ATM 712345678901,500.00,D`;
assert.deepEqual(parseStatement(typed).credits.map((c) => c.amountPaise), [450000, 2500000]);
const suffixed = `Date,Narration,Amount\n01/10/2026,UPI 412345678901 ROHAN,4500.00 Cr\n02/10/2026,UPI SWIGGY,349.00 Dr`;
assert.deepEqual(parseStatement(suffixed).credits.map((c) => c.amountPaise), [450000]);
const signed = `Date,Narration,Amount\n01/10/2026,UPI 412345678901 ROHAN,4500.00\n02/10/2026,UPI SWIGGY,-349.00`;
assert.deepEqual(parseStatement(signed).credits.map((c) => c.amountPaise), [450000]);

// Unusable files explain themselves.
assert.match(parseStatement("hello,world\n1,2").error, /Couldn't find the date/);
assert.match(parseStatement("Date,Narration,Withdrawal,Deposit\n01/10/2026,ATM,500,").error, /No incoming payments/);

// Matching against a workspace.
const T = 1_790_000_000_000;
const c = (id, name) => ({ id, name, phone: "", email: "", gstin: "", createdAt: T, updatedAt: T });
const inv = (id, number, clientId, issueDate, dueDate, amountPaise) => ({ id, number, clientId, issueDate, dueDate, amountPaise, description: "", payments: [], reminders: [], voided: false, createdAt: T, updatedAt: T });
let ws = updateBusiness(emptyWorkspace(), { name: "Studio", upiId: "studio@okaxis" }, T);
ws = upsertClient(ws, c("cli_rohan001", "Rohan Mehta"), T);
ws = upsertClient(ws, c("cli_acme0001", "Acme Traders Pvt Ltd"), T);
ws = upsertClient(ws, c("cli_bright01", "Bright Kids School"), T);
ws = upsertInvoice(ws, inv("inv_rohan007", "INV-0007", "cli_rohan001", "2026-09-25", "2026-10-05", 450000), T);
ws = upsertInvoice(ws, inv("inv_acme0012", "INV-0012", "cli_acme0001", "2026-09-01", "2026-09-15", 2500000), T);
ws = upsertInvoice(ws, inv("inv_bright20", "INV-0020", "cli_bright01", "2026-09-28", "2026-10-15", 1200000), T);
ws = upsertInvoice(ws, inv("inv_future99", "INV-0099", "cli_rohan001", "2026-10-20", "2026-10-30", 123400), T);
const today = "2026-10-06";
const result = matchCredits(parsed.credits, invoiceViews(ws, today));
const byInvoice = Object.fromEntries(result.suggestions.map((s) => [s.invoiceId, s]));
assert.equal(byInvoice.inv_rohan007.credit.utr, "412345678901");
assert.equal(byInvoice.inv_rohan007.confident, true, "amount + invoice number + name is confident");
assert.ok(byInvoice.inv_rohan007.reasons.includes("mentions INV-0007"));
assert.equal(byInvoice.inv_acme0012.credit.amountPaise, 2500000);
assert.equal(byInvoice.inv_acme0012.confident, false, "amount + name only is a suggestion, not pre-ticked");
assert.equal(byInvoice.inv_bright20.credit.reference, "SBINN52026100412345", "NEFT credit matched by amount + full name");
assert.equal(byInvoice.inv_future99, undefined, "money received before the invoice existed is not matched");
assert.deepEqual(result.unmatched.map((u) => u.utr), ["712345678901"]);

// Claimed UTR from a pay link is decisive even with a different amount (part payment).
const claimed = matchCredits(
  [{ key: "k1", date: "2026-10-02", amountPaise: 100000, narration: "UPI PAYMENT", utr: "812345678901", reference: "" }],
  invoiceViews(ws, today),
  new Map([["812345678901", "inv_bright20"]]),
);
assert.equal(claimed.suggestions[0].invoiceId, "inv_bright20");
assert.equal(claimed.suggestions[0].confident, true);
assert.equal(claimed.suggestions[0].amountPaise, 100000);

// Already-recorded UTRs are skipped, so re-importing the same file is harmless.
const after = addPayment(ws, "inv_rohan007", { amountPaise: 450000, date: "2026-10-01", mode: "upi", reference: "412345678901" }, T + 1);
const again = matchCredits(parsed.credits, invoiceViews(after, today));
assert.equal(again.alreadyRecorded, 1);
assert.equal(again.suggestions.some((s) => s.invoiceId === "inv_rohan007"), false);

// Two equal monthly invoices for one client: the older one is paid first (FIFO).
let tuition = upsertClient(emptyWorkspace(), c("cli_riya0001", "Riya Kapoor"), T);
tuition = upsertInvoice(tuition, inv("inv_sept0001", "TU-09", "cli_riya0001", "2026-09-01", "2026-09-05", 300000), T);
tuition = upsertInvoice(tuition, inv("inv_octo0001", "TU-10", "cli_riya0001", "2026-10-01", "2026-10-05", 300000), T);
const fifo = matchCredits([{ key: "k", date: "2026-10-06", amountPaise: 300000, narration: "UPI/912345678901/RIYA KAPOOR/riya@okhdfc", utr: "912345678901", reference: "" }], invoiceViews(tuition, today));
assert.equal(fifo.suggestions[0].invoiceId, "inv_sept0001");

// Never records more than the balance.
const over = matchCredits([{ key: "k", date: "2026-10-06", amountPaise: 999900, narration: "INV-0007 ROHAN MEHTA", utr: "", reference: "" }], invoiceViews(ws, today), new Map());
assert.ok(over.suggestions.every((s) => s.amountPaise <= 450000));

// Clients abroad (docs/spec-foreign-clients.md §3.6): a bank credit is rupees, so it is never offered for a foreign
// invoice, even one of the same minor amount (₹4,500 is 450000 paise; US$4,500.00 is 450000 cents).
{
  const { allInvoiceViews, withoutIntl } = await import("../src/lib/workspace/model.ts");
  let mixed = upsertInvoice(ws, { ...inv("inv_usd00007", "INV-0008", "cli_rohan001", "2026-09-25", "2026-10-05", 450000), currency: "USD" }, T);
  mixed = upsertInvoice(mixed, { ...inv("inv_usd00012", "INV-0013", "cli_acme0001", "2026-09-01", "2026-09-15", 2500000), currency: "USD" }, T);
  assert.ok(mixed.intl.invoices.inv_usd00007);
  const all = allInvoiceViews(mixed, today);
  assert.equal(all.filter((v) => v.currency === "USD").length, 2);
  const credits = [...parsed.credits, { key: "usd", date: "2026-10-02", amountPaise: 450000, narration: "INV-0008 ROHAN MEHTA", utr: "", reference: "" }];
  const withForeign = matchCredits(credits, all);
  assert.ok(withForeign.suggestions.every((m) => !m.invoiceId.startsWith("inv_usd")), "no foreign invoice is ever suggested");
  assert.deepEqual(withForeign, matchCredits(credits, invoiceViews(withoutIntl(mixed), today)), "INR matching is unchanged");
  assert.deepEqual(matchCredits(parsed.credits, all), result);
}

console.log("[statement] CSV parsing (HDFC/ICICI/SBI/Axis/typed/signed), matching, FIFO, claims, and de-duplication checks passed");
