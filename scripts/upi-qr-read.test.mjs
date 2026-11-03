// UPI QR reader (src/lib/upi-qr-read.ts): fields, notes and checks for upi:// links, web addresses and EMV payment
// codes. Vectors come from the NPCI UPI Linking Specifications v1.6 (draft, November 2017), the Banco Central do Brasil
// BR Code manual (a published EMV payload with its CRC) and EMV payloads whose CRCs were computed outside this code
// base (Python's binascii.crc_hqx, init 0xFFFF). Runs under Node:
//   node --experimental-strip-types scripts/upi-qr-read.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  crc16ccitt, FIELD_LABELS, FLAG_TEMPLATES, formatPaise, KIND_LABELS, MAX_QR_TEXT, readPayload, rupeesToPaise, sameUpiId, UPI_QR_REVIEWED_ON,
  UPI_QR_SOURCES,
} from "../src/lib/upi-qr-read.ts";
import { SCANNER_PHRASES } from "../src/data/scannerPhrases.ts";

const seen = new Set(); // every note code any vector produced; each template must be exercised
const read = (text) => {
  const out = readPayload(text);
  for (const flag of out.flags) seen.add(flag.code);
  return out;
};
const codes = (out) => out.flags.map((flag) => flag.code);
const levelOf = (out, code) => out.flags.find((flag) => flag.code === code)?.level;
const field = (out, key, index = 0) => out.fields.filter((f) => f.key === key)[index];
const value = (out, key) => field(out, key)?.value;

/* ---------- money as text: no floats ---------- */
assert.equal(rupeesToPaise("10"), "1000");
assert.equal(rupeesToPaise("10.5"), "1050");
assert.equal(rupeesToPaise("10.50"), "1050");
assert.equal(rupeesToPaise("0.05"), "5");
assert.equal(rupeesToPaise("0"), "0");
assert.equal(rupeesToPaise("007.5"), "750");
assert.equal(rupeesToPaise("123456789012.99"), "12345678901299");
for (const bad of ["1.005", "1,000", "-5", "", ".5", "5.", "1e3", "NaN", "12345678901234", "1 000", "₹10"]) assert.equal(rupeesToPaise(bad), null, `not a normal amount: ${JSON.stringify(bad)}`);
assert.equal(formatPaise("1000"), "₹10.00");
assert.equal(formatPaise("5"), "₹0.05");
assert.equal(formatPaise("99"), "₹0.99");
assert.equal(formatPaise("100"), "₹1.00");
assert.equal(formatPaise("123456"), "₹1,234.56");
assert.equal(formatPaise("10000000"), "₹1,00,000.00");
assert.equal(formatPaise("123456789"), "₹12,34,567.89");
assert.equal(formatPaise("10000000000"), "₹10,00,00,000.00");
assert.equal(formatPaise("00012"), "₹0.12");

/* ---------- the ID I expected ---------- */
assert.equal(sameUpiId(" Shop@YBL ", "shop@ybl"), true);
assert.equal(sameUpiId("shop@ybl", "SHOP@ybl"), true);
assert.equal(sameUpiId("shop@ybl", "shop@okaxis"), false);
assert.equal(sameUpiId("", ""), false, "an empty ID never matches");
assert.equal(sameUpiId("   ", "   "), false);
assert.equal(sameUpiId("shop@ybl", "sh0p@ybl"), false);
assert.equal(sameUpiId("shор@ybl", "shop@ybl"), false, "a Cyrillic look-alike letter does not match");
assert.equal(sameUpiId(undefined, "a@b"), false);
assert.equal(sameUpiId("a@b", null), false);
assert.equal(sameUpiId("\u212Airan@ybl", "kiran@ybl"), false, "the Kelvin sign U+212A is not folded to k");
assert.equal(sameUpiId("kiran@ybl", "KIRAN@YBL"), true, "ASCII case is still ignored");
assert.equal(sameUpiId("not an id", "not an id"), false, "text that is not written like name@handle never matches");

/* ---------- CRC-16/CCITT-FALSE ---------- */
const ascii = (text) => new TextEncoder().encode(text);
assert.equal(crc16ccitt(ascii("123456789")), 0x29b1, "CRC RevEng check value for CRC-16/IBM-3740 (CCITT-FALSE)");
assert.equal(crc16ccitt(ascii("")), 0xffff, "start value");
assert.notEqual(crc16ccitt(ascii("123456789")), 0x31c3, "not the XMODEM variant (start value 0)");

/* ---------- upi://pay: the NPCI draft's sample links ---------- */
const SAMPLE_1 = "upi://pay?pa=bivek@npci&pn=bivek%20rath&mc=9999&tid=cxnkjcnkjdfdvjndkjfvn&tr=4894398cndhcd23&tn=Pay%20to%20mystar%20store&am=10&mam=null&cu=INR&url=https://mystar.com&mode=05&orgid=000000&mid=1234&msid=3432&mtid=1212";
{
  const out = read(SAMPLE_1);
  assert.equal(out.kind, "upi-pay");
  assert.equal(out.kindLabel, KIND_LABELS["upi-pay"]);
  assert.deepEqual(out.fields.map((f) => f.key), ["pa", "pn", "am", "cu", "tn", "tr", "tid", "mc", "mid", "msid", "mtid", "url", "mode", "orgid"]);
  assert.equal(value(out, "pa"), "bivek@npci");
  assert.equal(value(out, "pn"), "bivek rath");
  assert.equal(value(out, "am"), "₹10.00");
  assert.equal(out.amountPaise, "1000", "am=10 is 1000 paise");
  assert.equal(out.payeeId, "bivek@npci");
  assert.equal(value(out, "tn"), "Pay to mystar store", "tn is the note; tr stays the transaction reference");
  assert.equal(value(out, "tr"), "4894398cndhcd23");
  assert.equal(value(out, "tid"), "cxnkjcnkjdfdvjndkjfvn");
  assert.equal(value(out, "mc"), "9999");
  assert.equal(value(out, "url"), "https://mystar.com");
  assert.equal(value(out, "mode"), "05");
  assert.equal(value(out, "orgid"), "000000");
  assert.deepEqual([value(out, "mid"), value(out, "msid"), value(out, "mtid")], ["1234", "3432", "1212"]);
  assert.equal(field(out, "mam"), undefined, "mam=null means no minimum, so there is nothing to show");
  assert.deepEqual(codes(out).sort(), ["amount-fixed", "name-unverified", "unsigned", "url-param"], "mode 05 without sign is a note; nothing is an error");
  assert.ok(out.flags.every((flag) => flag.level === "info"), "a plain sample link raises no check");
  assert.equal(out.flags.find((flag) => flag.code === "amount-fixed").args.amount, "₹10.00");
  assert.ok(out.raw.startsWith("upi://pay?pa=bivek@npci"));
}
const SAMPLE_2 = "upi://pay?pa=nadeem@npci&pn=nadeem%20chinna&mc=0000&tid=cxnkjcnkjdfdvjndkjfvn&tr=4894398cndhcd23&tn=Pay%20to%20mystar%20store&am=10&mam=null&cu=INR&url=https://mystar.com/orderid=9298yw89e8973e87389e78923ue892&mode=00&sign=aagshd4542bdhhvdshsbvqfqttsvsvsbsjn&orgid=00000&mid=1234&msid=3432&mtid=1212";
{
  const out = read(SAMPLE_2);
  assert.equal(out.kind, "upi-pay");
  assert.equal(value(out, "pa"), "nadeem@npci");
  assert.equal(value(out, "pn"), "nadeem chinna");
  assert.equal(value(out, "mode"), "00");
  assert.equal(value(out, "orgid"), "00000", "a 5-digit orgid is shown, not rejected");
  assert.equal(value(out, "url"), "https://mystar.com/orderid=9298yw89e8973e87389e78923ue892", "an = inside a value stays in the value");
  assert.equal(value(out, "sign"), "aagshd4542bdhhvdshsbvqfq…", "a long signature is clipped");
  assert.deepEqual(codes(out).sort(), ["amount-fixed", "name-unverified", "signed", "url-param"]);
  assert.ok(!codes(out).includes("unsigned"));
  assert.ok(out.flags.every((flag) => flag.level === "info"));
}

/* ---------- who is paid ---------- */
{
  const out = read("upi://pay?am=10");
  assert.equal(levelOf(out, "pa-missing"), "warn");
  assert.equal(levelOf(out, "pn-missing"), "warn");
  assert.equal(out.payeeId, null);
  assert.deepEqual(out.fields.slice(0, 3).map((f) => [f.key, f.value]), [["pa", ""], ["pn", ""], ["am", "₹10.00"]], "the three key fields are always listed");
}
for (const id of ["notanid", "a@b@c", "@ybl", "name@", "na%20me@ybl", "na+me@ybl", "a/b@ybl", "name@y bl".replace(" ", "%20"), "sh%E2%80%8Bop@ybl"]) {
  const out = read(`upi://pay?pa=${id}&pn=X`);
  assert.equal(levelOf(out, "pa-format"), "warn", `pa=${id} is not written like name@handle`);
}
for (const id of ["name@ybl", "Name.Shop-1_x@okaxis", "9876543210@paytm", "a@b", "shop%40okicici"]) {
  const out = read(`upi://pay?pa=${id}&pn=X`);
  assert.ok(!codes(out).includes("pa-format"), `pa=${id} is written like name@handle`);
  assert.ok(!codes(out).includes("pa-missing"));
}
assert.equal(read("upi://pay?pa=shop%40okicici&pn=X").payeeId, "shop@okicici", "an encoded @ is decoded");
{
  const out = read("upi://pay?pa=a@ybl&pn=");
  assert.equal(levelOf(out, "pn-missing"), "warn", "an empty pn counts as missing");
}
for (const text of [SAMPLE_1, SAMPLE_2, "upi://pay?pa=a@ybl&pn=A"]) assert.ok(codes(read(text)).includes("name-unverified"), "a name inside a QR is always called unchecked");

/* ---------- how much ---------- */
{
  const none = read("upi://pay?pa=a@ybl&pn=A");
  assert.equal(none.amountPaise, null);
  assert.equal(levelOf(none, "amount-none"), "info");
  const lakh = read("upi://pay?pa=a@ybl&pn=A&am=100000");
  assert.equal(value(lakh, "am"), "₹1,00,000.00");
  assert.equal(lakh.amountPaise, "10000000");
  const decimals = read("upi://pay?pa=a@ybl&pn=A&am=1250.5");
  assert.equal(decimals.amountPaise, "125050");
  assert.equal(value(decimals, "am"), "₹1,250.50");
  const min = read("upi://pay?pa=a@ybl&pn=A&am=500&mam=100");
  assert.equal(levelOf(min, "amount-minimum"), "info");
  assert.deepEqual(min.flags.find((flag) => flag.code === "amount-minimum").args, { amount: "₹500.00", minimum: "₹100.00" });
  assert.equal(value(min, "mam"), "₹100.00");
  assert.ok(!codes(min).includes("amount-fixed"));
  for (const mam of ["null", "NULL", ""]) assert.ok(codes(read(`upi://pay?pa=a@ybl&pn=A&am=500&mam=${mam}`)).includes("amount-fixed"), `mam=${mam} means no minimum`);
  for (const bad of ["10.555", "abc", "0", "0.00", "1,000", "-5", "10.", "1e3", "NaN", "99999999999999"]) {
    const out = read(`upi://pay?pa=a@ybl&pn=A&am=${bad}`);
    assert.equal(levelOf(out, "amount-bad"), "warn", `am=${bad} is not a normal rupee amount`);
    assert.equal(out.amountPaise, null);
    assert.equal(value(out, "am"), bad.replace("%2C", ","), "an unreadable amount is shown as written");
  }
  assert.equal(levelOf(read("upi://pay?pa=a@ybl&pn=A&am=5&cu=USD"), "currency"), "warn");
  assert.equal(read("upi://pay?pa=a@ybl&pn=A&am=5&cu=USD").flags.find((flag) => flag.code === "currency").args.currency, "USD");
  assert.ok(!codes(read("upi://pay?pa=a@ybl&pn=A&cu=inr")).includes("currency"), "cu is case-insensitive");
  assert.ok(!codes(read("upi://pay?pa=a@ybl&pn=A&cu=INR")).includes("currency"));
}

/* ---------- signature, unknown and repeated parameters ---------- */
{
  assert.equal(levelOf(read("upi://pay?pa=a@ybl&pn=A&mode=02"), "unsigned"), "info");
  assert.equal(levelOf(read("upi://pay?pa=a@ybl&pn=A&mode=02&sign=abc"), "signed"), "info");
  const plain = read("upi://pay?pa=a@ybl&pn=A&cu=INR");
  assert.ok(!codes(plain).includes("unsigned") && !codes(plain).includes("signed"), "a plain link claims no mode, so no signature note");
  const unknown = read("upi://pay?pa=a@ybl&pn=A&foo=bar&QRts=2026&ver=01");
  assert.equal(levelOf(unknown, "unknown-params"), "info", "unknown parameters are never an error");
  assert.equal(unknown.flags.find((flag) => flag.code === "unknown-params").args.names, "foo, QRts, ver");
  assert.deepEqual(unknown.fields.filter((f) => f.label === FIELD_LABELS.other).map((f) => [f.key, f.value]), [["foo", "bar"], ["QRts", "2026"], ["ver", "01"]]);
  assert.equal(unknown.kind, "upi-pay");
  assert.ok(!codes(read("upi://pay?pa=a@ybl&pn=A&PA=b@ybl")).includes("duplicate-params"), "names are case-sensitive: PA is another parameter, flagged as unknown");
  assert.ok(codes(read("upi://pay?pa=a@ybl&pn=A&PA=b@ybl")).includes("unknown-params"));

  const dup = read("upi://pay?pa=good@ybl&pa=evil@ybl&pn=A&pn=B&am=1&am=500");
  assert.equal(levelOf(dup, "duplicate-params"), "warn");
  assert.equal(dup.flags.find((flag) => flag.code === "duplicate-params").args.names, "pa, pn, am");
  assert.equal(dup.payeeId, "good@ybl", "the first copy is the one compared");
  assert.deepEqual(dup.fields.filter((f) => f.label === FIELD_LABELS.repeated).map((f) => [f.key, f.value]), [["pa", "evil@ybl"], ["pn", "B"], ["am", "500"]], "every extra copy is listed");
  assert.equal(dup.amountPaise, "100", "the first copy of am is the one parsed");
  assert.deepEqual(dup.payeeIds, ["good@ybl", "evil@ybl"], "every pa travels with the result so the page can refuse to say Matches");
  assert.deepEqual(read("upi://pay?pa=a@ybl&pn=A").payeeIds, ["a@ybl"]);
  assert.deepEqual(read("https://example.com/").payeeIds, []);
  // Text after an unencoded # is not silently dropped
  const frag = read("upi://pay?pa=a@ybl&pn=A#am=500");
  assert.equal(levelOf(frag, "fragment-ignored"), "warn");
  assert.equal(frag.flags.find((flag) => flag.code === "fragment-ignored").args.text, "am=500");
  assert.equal(frag.amountPaise, null, "the amount after # is not read");
  assert.ok(!codes(frag).includes("amount-none"), "and the page does not claim the QR has no amount");
  assert.ok(!codes(read("upi://pay?pa=a@ybl#x")).includes("pn-missing"), "no missing-name claim when a fragment hides the rest");
  assert.equal(read("upi://pay?pa=a@ybl&pn=A#line1\nline2").kind, "upi-pay", "a newline inside the fragment does not turn the link into other text");
  assert.ok(!codes(read("upi://pay?pa=a@ybl&pn=A")).includes("fragment-ignored"));
  // Parameter names get the same hidden-character treatment as values
  const hiddenName = read("upi://pay?pa=a@ybl&pn=X&%E2%80%AEkey=1&k%E2%80%8Bz=2");
  const unknownNames = hiddenName.flags.find((flag) => flag.code === "unknown-params").args.names;
  assert.ok(!/[\u202E\u200B]/.test(unknownNames), "no raw direction or zero-width characters in the unknown-parameter note");
  assert.ok(codes(hiddenName).includes("hidden-chars"), "a hidden character in a parameter name is flagged");
  assert.equal(dup.amountPaise, "100", "the first copy of am is the one parsed");
}

/* ---------- long text and hidden characters ---------- */
{
  const long = read(`upi://pay?pa=a@ybl&pn=${"N".repeat(150)}&tn=${"t".repeat(30)}&url=https://x.example/${"p".repeat(300)}&sign=${"s".repeat(200)}`);
  assert.equal(levelOf(long, "long-values"), "info");
  assert.equal(long.flags.find((flag) => flag.code === "long-values").args.names, "pn", "url and sign are expected to be long");
  const exact = read(`upi://pay?pa=a@ybl&pn=${"N".repeat(100)}`);
  assert.ok(!codes(exact).includes("long-values"), "100 characters is the limit");

  const rtl = read("upi://pay?pa=a@ybl&pn=Shop%E2%80%AEevil");
  assert.equal(levelOf(rtl, "hidden-chars"), "warn");
  assert.equal(value(rtl, "pn"), "Shop<U+202E>evil", "a direction override is made visible");
  const zero = read("upi://pay?pa=sh%E2%80%8Bop@ybl&pn=X");
  assert.equal(value(zero, "pa"), "sh<U+200B>op@ybl");
  assert.ok(codes(zero).includes("pa-format") && codes(zero).includes("hidden-chars"));
  const control = read("upi://pay?pa=a@ybl&pn=X&tn=line1%0Aline2");
  assert.equal(value(control, "tn"), "line1<U+000A>line2");
  assert.ok(!/[\u0000-\u001f\u202e]/.test(JSON.stringify(control.fields.map((f) => f.value))), "no hidden character reaches a field value");
}

/* ---------- percent-encoding and + ---------- */
{
  const out = read("upi://pay?pa=a@ybl&pn=My+Shop%20Name&tn=50%25+off");
  assert.equal(value(out, "pn"), "My Shop Name", "+ and %20 both read as a space");
  assert.equal(value(out, "tn"), "50% off");
  assert.equal(levelOf(out, "plus-spaces"), "info");
  assert.ok(!codes(read("upi://pay?pa=a@ybl&pn=My%20Shop")).includes("plus-spaces"));
  assert.equal(value(read("upi://pay?pa=a@ybl&pn=%E0%A4%A"), "pn"), "%E0%A4%A", "broken UTF-8 is shown as written, not thrown");
  assert.equal(value(read("upi://pay?pa=a@ybl&pn=%ZZ"), "pn"), "%ZZ");
  assert.equal(value(read("upi://pay?pa=a@ybl&pn=100%"), "pn"), "100%");
  assert.equal(value(read("upi://pay?pa=a@ybl&pn=%E0%A4%B8%E0%A5%82%E0%A4%B0%E0%A4%9C"), "pn"), "सूरज", "UTF-8 is decoded");
  assert.equal(value(read("UPI://PAY?PA=a@ybl&pa=a@ybl&pn=A"), "pa"), "a@ybl", "the scheme and action are case-insensitive; names are not");
  assert.equal(read("upi://pay/?pa=a@ybl&pn=A").kind, "upi-pay", "a slash after the action is tolerated");
  assert.equal(value(read("upi://pay?pa=a@ybl&pn=My Shop"), "pn"), "My Shop", "a raw space is kept");
  assert.equal(value(read("upi://pay?pa=a@ybl&pn=A#frag"), "pn"), "A", "a fragment is ignored");
  assert.equal(read("  \n upi://pay?pa=a@ybl&pn=A \t").kind, "upi-pay", "surrounding whitespace is ignored");
}

/* ---------- AutoPay and other upi:// actions ---------- */
{
  const out = read("upi://mandate?pa=shop@icici&pn=Shop&am=649.00&cu=INR&tn=Plan");
  assert.equal(out.kind, "upi-mandate");
  assert.equal(out.kindLabel, KIND_LABELS["upi-mandate"]);
  assert.equal(levelOf(out, "mandate"), "warn");
  assert.equal(value(out, "am"), "₹649.00");
  assert.equal(out.amountPaise, "64900");
  assert.equal(out.payeeId, "shop@icici");
  assert.ok(!codes(out).includes("amount-fixed") && !codes(out).includes("amount-none"), "an AutoPay amount is not a one-time fixed amount");
  assert.ok(/take money from your account again/.test(out.flags.find((flag) => flag.code === "mandate").text));
  const withTerms = read("upi://mandate?pa=shop@icici&pn=Shop&am=1&recur=MONTHLY&rev=Y&block=N");
  assert.ok(!codes(withTerms).includes("unknown-params"), "AutoPay terms are not in the pay draft; they are listed as parameters, not flagged");
  assert.deepEqual(withTerms.fields.filter((f) => f.label === FIELD_LABELS.other).map((f) => f.key), ["recur", "rev", "block"]);

  const collect = read("upi://collect?pa=a@ybl&pn=X&am=5");
  assert.equal(collect.kind, "other");
  assert.equal(levelOf(collect, "other-action"), "warn");
  assert.equal(collect.flags[0].args.action, "collect");
  assert.equal(collect.payeeId, null, "an unknown action is never compared as a payee");
  assert.equal(read("upi://").flags[0].args.action, "(none)");
  assert.equal(read("upi://mandate").kind, "upi-mandate");
}

/* ---------- web addresses: never a UPI ID, never reassuring ---------- */
{
  const out = read("https://paypal.com@evil.example/login");
  assert.equal(out.kind, "url");
  assert.equal(out.kindLabel, "Web address");
  assert.equal(value(out, "site"), "evil.example");
  assert.equal(value(out, "address"), "https://paypal.com@evil.example/login");
  assert.equal(levelOf(out, "url-userinfo"), "warn");
  assert.deepEqual(out.flags.find((flag) => flag.code === "url-userinfo").args, { user: "paypal.com", host: "evil.example" });
  assert.ok(/before the @/.test(out.flags.find((flag) => flag.code === "url-userinfo").text) && /username, not the site/.test(out.flags.find((flag) => flag.code === "url-userinfo").text));
  assert.equal(out.payeeId, null);
  assert.equal(field(out, "pa"), undefined, "the whole string is never taken as a UPI ID");
  assert.equal(out.amountPaise, null);
  assert.equal(levelOf(out, "url-not-payment"), "info");
  const withPassword = read("https://user:pw@host.example/");
  assert.equal(withPassword.flags.find((flag) => flag.code === "url-userinfo").args.user, "user:pw");
  const http = read("http://example.com:8080/pay");
  assert.equal(levelOf(http, "url-http"), "info");
  assert.equal(value(http, "site"), "example.com:8080");
  const plain = read("https://www.proupiqr.in/");
  assert.ok(!codes(plain).includes("url-userinfo") && !codes(plain).includes("url-http"));
  assert.equal(value(plain, "site"), "www.proupiqr.in");
  const idn = read("https://xn--80ak6aa92e.example/");
  assert.equal(value(idn, "site"), "xn--80ak6aa92e.example");
  const broken = read("https://");
  assert.equal(broken.kind, "url");
  assert.equal(field(broken, "site"), undefined, "an address the URL parser rejects has no site name");
  assert.equal(value(broken, "address"), "https://");
  assert.equal(read("HTTPS://Example.COM/x").kind, "url");
  assert.equal(value(read("https://example.com/upi://pay?pa=a@ybl"), "site"), "example.com", "a upi:// link inside a web address is still a web address");
  assert.equal(read("https://example.com/?pa=a@ybl&pn=X").payeeId, null);
}

/* ---------- everything else ---------- */
{
  const mail = read("mailto:someone@example.com?subject=Hi");
  assert.equal(mail.kind, "other");
  assert.equal(mail.kindLabel, KIND_LABELS.other);
  assert.equal(mail.flags.find((flag) => flag.code === "other-scheme").args.scheme, "mailto");
  assert.equal(mail.payeeId, null);
  assert.equal(read("tel:+911234567890").flags[0].args.scheme, "tel");
  assert.equal(read("WIFI:T:WPA;S:Home;P:pw;;").flags[0].args.scheme, "wifi");
  assert.equal(levelOf(read("hello world"), "other-text"), "info");
  assert.equal(levelOf(read("shop@ybl"), "bare-id"), "info");
  assert.equal(levelOf(read("  shop@ybl \n"), "bare-id"), "info");
  assert.equal(levelOf(read("a@b c"), "other-text"), "info", "text with a space is not a bare ID");
  assert.equal(read("shop@ybl").payeeId, null, "a bare ID is not a payment link");
  assert.equal(value(read("hello world"), "text"), "hello world");
  assert.equal(levelOf(read("Pay me: upi://pay?pa=a@ybl&pn=X"), "other-text"), "info", "a link buried in text is not read as a link");
  assert.equal(read("Pay me: upi://pay?pa=a@ybl&pn=X").payeeId, null);

  for (const nothing of ["", "   ", "\n\t "]) {
    const out = read(nothing);
    assert.equal(out.kind, "other");
    assert.equal(levelOf(out, "empty"), "warn");
    assert.deepEqual(out.fields, []);
  }
  const huge = read(`upi://pay?pa=a@ybl&pn=${"N".repeat(MAX_QR_TEXT)}`);
  assert.equal(huge.kind, "other");
  assert.equal(levelOf(huge, "too-long"), "warn");
  assert.equal(huge.flags.find((flag) => flag.code === "too-long").args.limit, "4,000");
  assert.ok(/longer than the 4,000 characters this page reads/.test(huge.flags.find((flag) => flag.code === "too-long").text));
  assert.ok(huge.raw.length <= 2001, "the raw text is cut for display");
  assert.equal(huge.payeeId, null);
  assert.equal(read("x".repeat(MAX_QR_TEXT)).kind, "other", "exactly the limit is still read");
  assert.ok(!codes(read("x".repeat(MAX_QR_TEXT))).includes("too-long"));
  const binary = read("\u0000\u0001abc\u202e");
  assert.equal(binary.kind, "other");
  assert.equal(binary.raw, "<U+0000><U+0001>abc<U+202E>");
  for (const odd of [undefined, null, 42, {}, [], true]) assert.equal(readPayload(odd).kind, "other", "non-text input never throws");
}

/* ---------- EMV payment codes ---------- */
// Published by Banco Central do Brasil (Manual do BR Code, p. 13); 270 characters, CRC AD38. It is a Brazilian code:
// the currency is 986, so the amount is shown as written and never as rupees.
const BCB_PAYLOAD = [
  "00020104141234567890123426580014BR.GOV.BCB.PIX0136123e4567-e12b-12d1-a456-",
  "42665544000027300012BR.COM.OUTRO011001234567895204000053039865406123.45",
  "5802BR5917NOME DO RECEBEDOR6008BRASILIA61087007490062190515RP12345678-",
  "201980390012BR.COM.OUTRO01190123.ABCD.3456.WXYZ6304AD38",
].join("");
// India-shaped, synthetic. CRCs computed with Python's binascii.crc_hqx(data, 0xFFFF) over the UTF-8 text.
const INDIA = "00020101021126420014in.example.pay0120shop.test@exampleupi52045411530335654071250.755802IN5910TEST STORE6006MUMBAI62130509INV-123456304A80B";
// Hindi in the root merchant name, lengths counted in UTF-8 bytes (28 for 10 characters): the way some encoders count.
const HINDI = "00020101021226380014in.example.pay0116suraj@exampleupi5204549953033565802IN5928सूरज स्टोर6006JAIPUR63040DDF";
// The same India-shaped code with the Hindi name in the alternate-language template (tag 64), as the standard allows,
// once with lengths counted in characters (EMVCo's way) and once in UTF-8 bytes. Generated by a Python script that
// computes the CRC with binascii.crc_hqx, so the CRC code under test never produced them.
const CHAR_LENGTHS = "00020101021226380014in.example.pay0116suraj@exampleupi520454995303356540599.505802IN5911SURAJ STORE6006JAIPUR64290002hi0110सूरज स्टोर0205जयपुर6304EFED";
const BYTE_LENGTHS = "00020101021226380014in.example.pay0116suraj@exampleupi520454995303356540599.505802IN5911SURAJ STORE6006JAIPUR64570002hi0128सूरज स्टोर0215जयपुर6304CDC3";
// The worked example of the EMVCo specification as reproduced, with its checksum A13A, by the open-source cemacqr
// library (pypi.org/project/cemacqr). Its alternate-language template (tag 64) has length 20 for 14 ASCII characters
// and 6 Chinese ones (32 UTF-8 bytes), so lengths count characters; the checksum A13A was recomputed here over the
// UTF-8 bytes of the text with Python's binascii.crc_hqx.
const EMVCO_EXAMPLE = "00020101021229300012D156000000000510A93FO3230Q31280012D15600000001030812345678520441115802CN5914BEST TRANSPORT6007BEIJING64200002ZH0104最佳运输0202北京540523.7253031565502016233030412340603***0708A60086670902ME91320016A0112233449988770708123456786304A13A";
{
  assert.equal(BCB_PAYLOAD.length, 270);
  const out = read(BCB_PAYLOAD);
  assert.equal(out.kind, "emv");
  assert.equal(out.kindLabel, "Bharat QR / EMV payment code, not a upi:// link");
  assert.equal(levelOf(out, "crc-ok"), "info", "the published CRC AD38 matches");
  assert.ok(!codes(out).includes("crc-bad") && !codes(out).includes("emv-truncated"));
  assert.equal(levelOf(out, "emv-not-upi"), "info");
  assert.equal(out.payeeId, null, "an EMV code has no upi:// ID to compare");
  assert.equal(value(out, "59"), "NOME DO RECEBEDOR");
  assert.equal(value(out, "60"), "BRASILIA");
  assert.equal(value(out, "54"), "123.45", "a non-INR amount is shown as written");
  assert.equal(out.amountPaise, null);
  assert.equal(value(out, "53"), "986");
  assert.equal(value(out, "58"), "BR");
  assert.equal(value(out, "26"), "00=BR.GOV.BCB.PIX; 01=123e4567-e12b-12d1-a456-426655440000", "merchant account templates are listed generically");
  assert.equal(value(out, "27"), "00=BR.COM.OUTRO; 01=0123456789");
  assert.equal(value(out, "04"), "12345678901234", "a template-less merchant account is shown as text");
  assert.equal(value(out, "62"), "05=RP12345678-2019");
  assert.equal(value(out, "80"), "00=BR.COM.OUTRO; 01=0123.ABCD.3456.WXYZ", "tags outside the standard range are listed too");
  assert.equal(value(out, "63"), "AD38");
  assert.deepEqual(out.fields.slice(0, 3).map((f) => f.key), ["59", "60", "54"], "name, city and amount come first");
  assert.equal(field(out, "26").label, FIELD_LABELS.merchantAccount);

  const damaged = read(BCB_PAYLOAD.replace("123.45", "123.46"));
  assert.equal(levelOf(damaged, "crc-bad"), "warn", "one changed digit breaks the checksum");
  assert.ok(!codes(damaged).includes("crc-ok"));
  assert.equal(levelOf(read(BCB_PAYLOAD.replace("6304AD38", "6304AD39")), "crc-bad"), "warn", "a wrong CRC value");
  assert.equal(levelOf(read(BCB_PAYLOAD.replace("6304AD38", "6304ad38")), "crc-ok"), "info", "CRC letters are compared without case");
}
{
  const out = read(INDIA);
  assert.equal(out.kind, "emv");
  assert.equal(levelOf(out, "crc-ok"), "info");
  assert.equal(value(out, "59"), "TEST STORE");
  assert.equal(value(out, "60"), "MUMBAI");
  assert.equal(value(out, "54"), "₹1,250.75");
  assert.equal(out.amountPaise, "125075");
  assert.equal(value(out, "53"), "356 (INR)");
  assert.equal(value(out, "58"), "IN");
  assert.equal(value(out, "52"), "5411");
  assert.equal(value(out, "26"), "00=in.example.pay; 01=shop.test@exampleupi");
  assert.equal(out.payeeId, null);
  assert.equal(field(out, "01"), undefined, "the format and initiation tags are not listed");
  assert.equal(levelOf(read(INDIA.replace("1250.75", "1250.76")), "crc-bad"), "warn");
  assert.equal(levelOf(read(INDIA.replace("6304A80B", "6304a80b")), "crc-ok"), "info");
  assert.equal(levelOf(read(INDIA.slice(0, -8)), "crc-missing"), "warn", "no tag 63");
  assert.equal(levelOf(read(INDIA.slice(0, -2)), "crc-missing"), "warn", "a CRC cut short");
  assert.equal(levelOf(read(INDIA.slice(0, 60)), "emv-truncated"), "warn", "text that stops in the middle of a tag");
  assert.equal(levelOf(read(`${INDIA}XX`), "emv-truncated"), "warn", "text after the checksum");
  assert.equal(levelOf(read(`${INDIA}XX`), "crc-ok"), "info");
  assert.equal(levelOf(read("0002010102116304FFFF"), "crc-bad"), "warn");
  assert.equal(read("0002010").kind, "emv");
  assert.equal(levelOf(read("0002010"), "emv-truncated"), "warn");
  assert.equal(levelOf(read("000201ABCD"), "emv-truncated"), "warn");
  const reordered = read(INDIA.replace("6304A80B", "") + "5802IN6304A80B");
  assert.equal(levelOf(reordered, "crc-bad"), "warn", "tags moved before the checksum change it");
}
{
  // Lengths that count UTF-8 bytes: read that way only because the whole code then adds up (structure and checksum).
  const out = read(HINDI);
  assert.equal(levelOf(out, "crc-ok"), "info", "an encoder that counts UTF-8 bytes is still read");
  assert.ok(!codes(out).includes("emv-truncated"));
  assert.equal(value(out, "59"), "सूरज स्टोर");
  assert.equal(value(out, "60"), "JAIPUR");
  assert.equal(out.amountPaise, null);
  assert.equal(value(out, "54"), undefined, "no amount tag means none is shown");
  const damaged = read(HINDI.replace("JAIPUR", "JAIPUS"));
  assert.equal(levelOf(damaged, "crc-bad"), "warn", "a byte-counted code with a changed letter fails its checksum");
  assert.ok(!codes(damaged).includes("crc-ok") && !codes(damaged).includes("emv-truncated"), "and its structure still reads to the end");
}
{
  // EMVCo's worked example: lengths count characters (Chinese merchant name in tag 64), the CRC runs over UTF-8 bytes.
  const out = read(EMVCO_EXAMPLE);
  assert.equal(out.kind, "emv");
  assert.equal(levelOf(out, "crc-ok"), "info", "the checksum A13A matches");
  assert.ok(!codes(out).includes("crc-bad") && !codes(out).includes("emv-truncated") && !codes(out).includes("crc-missing"));
  assert.equal(value(out, "59"), "BEST TRANSPORT");
  assert.equal(value(out, "60"), "BEIJING");
  assert.equal(value(out, "54"), "23.72", "a CNY amount is shown as written");
  assert.equal(out.amountPaise, null);
  assert.equal(value(out, "53"), "156");
  assert.equal(value(out, "58"), "CN");
  assert.equal(value(out, "64"), "00=ZH; 01=最佳运输; 02=北京", "the alternate-language name and city");
  assert.equal(value(out, "29"), "00=D15600000000; 05=A93FO3230Q");
  assert.equal(value(out, "31"), "00=D15600000001; 03=12345678");
  assert.equal(value(out, "62"), "03=1234; 06=***; 07=A6008667; 09=ME");
  assert.equal(value(out, "91"), "00=A011223344998877; 07=12345678");
  assert.equal(value(out, "63"), "A13A");
  assert.deepEqual(out.fields.slice(0, 3).map((f) => f.key), ["59", "60", "54"]);
  assert.equal(levelOf(read(EMVCO_EXAMPLE.replace("23.72", "23.73")), "crc-bad"), "warn", "one changed digit breaks it");
  assert.equal(levelOf(read(EMVCO_EXAMPLE.replace("最佳运输", "最佳运车")), "crc-bad"), "warn", "so does one changed Chinese character");
}
{
  // The same India-shaped code counted both ways, and a few edges of the amount and of "characters".
  for (const [name, code] of [["characters", CHAR_LENGTHS], ["UTF-8 bytes", BYTE_LENGTHS]]) {
    const out = read(code);
    assert.equal(levelOf(out, "crc-ok"), "info", `lengths in ${name}`);
    assert.ok(!codes(out).includes("emv-truncated") && !codes(out).includes("crc-bad"), name);
    assert.equal(value(out, "59"), "SURAJ STORE", name);
    assert.equal(value(out, "54"), "₹99.50", name);
    assert.equal(out.amountPaise, "9950", name);
    assert.equal(value(out, "64"), "00=hi; 01=सूरज स्टोर; 02=जयपुर", `${name}: the Hindi name inside the template`);
    assert.equal(value(out, "26"), "00=in.example.pay; 01=suraj@exampleupi", name);
  }
  assert.equal(levelOf(read(CHAR_LENGTHS.replace("6304EFED", "6304EFEE")), "crc-bad"), "warn", "a wrong CRC is not rescued by the byte reading");
  assert.equal(levelOf(read(BYTE_LENGTHS.replace("6304CDC3", "6304CDC4")), "crc-bad"), "warn");
  const dot = read("00020153033565404100.5802IN5909DOT STORE6004PUNE6304E00E");
  assert.equal(levelOf(dot, "crc-ok"), "info");
  assert.equal(dot.amountPaise, "10000", "EMVCo allows a dot with no decimals after it");
  assert.equal(value(dot, "54"), "₹100.00");
  const zero = read("000201530335654040.005802IN5910ZERO STORE6004PUNE630472D0");
  assert.equal(levelOf(zero, "crc-ok"), "info");
  assert.equal(zero.amountPaise, null, "an amount of zero is not an amount");
  assert.equal(value(zero, "54"), "0.00");
  const astral = read("0002015802IN5904CAFE6004PUNE64130002ja0103寿司😀63049F01");
  assert.equal(levelOf(astral, "crc-ok"), "info", "a character outside the Basic Multilingual Plane counts as one");
  assert.equal(value(astral, "64"), "00=ja; 01=寿司😀");
}
{
  // A failure inside the reader becomes a note, never an exception.
  const original = globalThis.TextEncoder;
  globalThis.TextEncoder = class { encode() { throw new Error("boom"); } };
  try {
    const out = read(INDIA);
    assert.equal(out.kind, "other");
    assert.equal(levelOf(out, "read-error"), "warn");
  } finally {
    globalThis.TextEncoder = original;
  }
}

/* ---------- wording: a read never says valid, verified, genuine or safe ---------- */
const BANNED = /\b(valid|validated|verify|verified|verification|genuine|safe|safely|safety|registered|authentic|trusted|trust|real|fake|prank|dummy|suspicious|secure|100%)\b/i;
for (const [code, template] of Object.entries(FLAG_TEMPLATES)) assert.ok(!BANNED.test(template), `${code}: banned word in "${template}"`);
for (const [kind, label] of Object.entries(KIND_LABELS)) assert.ok(!BANNED.test(label), `${kind}: banned word in "${label}"`);
for (const [key, label] of Object.entries(FIELD_LABELS)) assert.ok(!BANNED.test(label), `${key}: banned word in "${label}"`);
for (const source of UPI_QR_SOURCES) assert.ok(!/\b(fake|prank|dummy)\b/i.test(source.label));

/* ---------- every note is reachable, every placeholder is filled ---------- */
assert.deepEqual([...seen].sort(), Object.keys(FLAG_TEMPLATES).sort(), "each template is exercised by a vector, and no vector produces a code without a template");
for (const [code, template] of Object.entries(FLAG_TEMPLATES)) {
  for (const [, name] of template.matchAll(/\{(\w+)\}/g)) assert.ok(name.length > 0, code);
}

/* ---------- properties over generated input (seeded, so a failure repeats) ---------- */
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
{
  const rand = prng(20261101);
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const pieces = ["upi://pay?", "upi://mandate?", "pa=", "pn=", "am=", "mam=", "cu=", "sign=", "mode=", "url=https://x.example/", "&", "=", "%", "%20", "%E2%80%AE", "%ZZ", "+", "@", "ybl", "a@ybl", "10", "10.50", "0", "null", "INR", "USD", " ", "\u202e", "\u0000", "000201", "6304", "5910", "26", "https://", "u@h.example/", "#", "?", "名前", "सूरज", "😀", "{x}", "<script>"];
  for (let n = 0; n < 4000; n++) {
    let text = "";
    for (let i = Math.floor(rand() * 14); i >= 0; i--) text += pick(pieces);
    const out = read(text);
    assert.ok(["upi-pay", "upi-mandate", "url", "emv", "other"].includes(out.kind), text);
    assert.equal(out.kindLabel, KIND_LABELS[out.kind]);
    assert.ok(out.amountPaise === null || /^\d+$/.test(out.amountPaise), `${text} -> ${out.amountPaise}`);
    assert.ok(out.payeeId === null || (typeof out.payeeId === "string" && out.payeeId !== ""), text);
    assert.ok(out.raw.length <= 2001, text);
    for (const flag of out.flags) {
      assert.ok(flag.code in FLAG_TEMPLATES && (flag.level === "info" || flag.level === "warn"), `${text}: ${flag.code}`);
      assert.ok(!/[{}]/.test(flag.text.replace(/<U\+[0-9A-F]{4}>/g, "")) || /\{x\}|[{}]/.test(text), `${text}: unfilled placeholder in ${flag.text}`);
      assert.equal(flag.text.includes("undefined"), false, `${text}: ${flag.text}`);
    }
    for (const f of out.fields) {
      assert.equal(typeof f.value, "string");
      assert.ok(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(f.value), `${text}: hidden character in a field value`);
    }
    assert.deepEqual(readPayload(text), out, "reading is pure");
    if (out.kind !== "upi-pay" && out.kind !== "upi-mandate") assert.equal(out.payeeId, null, `${text}: only upi:// links have a payee ID`);
  }
  // Round trip: any integer amount in paise survives text -> paise -> text -> paise.
  for (let n = 0; n < 4000; n++) {
    const paise = Math.floor(rand() * 10 ** (1 + Math.floor(rand() * 11)));
    const text = `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, "0")}`;
    assert.equal(rupeesToPaise(text), String(paise), text);
    const shown = formatPaise(String(paise));
    assert.equal(shown.replace(/[₹,]/g, ""), text, `${paise} -> ${shown}`);
    assert.ok(/^₹\d{1,3}(,\d{2})*(,\d{3})?\.\d{2}$/.test(shown) || /^₹\d{1,3}\.\d{2}$/.test(shown), `Indian grouping: ${shown}`);
  }
  // A well-formed EMV code passes its checksum, and changing any one character before the checksum breaks it.
  const tlv = (id, text) => `${id}${String(new TextEncoder().encode(text).length).padStart(2, "0")}${text}`;
  for (let n = 0; n < 300; n++) {
    const body = tlv("00", "01") + tlv("52", "5411") + tlv("53", "356") + tlv("54", String(1 + Math.floor(rand() * 99999))) + tlv("58", "IN") + tlv("59", `SHOP ${n}`) + tlv("60", "PUNE");
    const crc = crc16ccitt(new TextEncoder().encode(`${body}6304`)).toString(16).toUpperCase().padStart(4, "0");
    const code = `${body}6304${crc}`;
    assert.equal(levelOf(read(code), "crc-ok"), "info", code);
    const at = 6 + Math.floor(rand() * (code.length - 6)); // past the 000201 that makes it an EMV code
    const swap = code[at] === "7" ? "3" : "7";
    const changed = read(code.slice(0, at) + swap + code.slice(at + 1));
    assert.ok(!codes(changed).includes("crc-ok"), `a changed character at ${at} of ${code} must not pass the checksum`);
    assert.ok(changed.flags.some((flag) => flag.level === "warn"), `a changed character at ${at} of ${code} must raise a check`);
  }
  // A name in any script inside the alternate-language template, with lengths counted in characters and in UTF-8 bytes.
  const pool = ["A", "z", "0", " ", "-", "स", "ू", "र", "ज", "ा", "கே", "ల", "名", "前", "寿", "😀", "é"];
  const tlvChars = (id, text) => `${id}${String(Array.from(text).length).padStart(2, "0")}${text}`;
  for (let n = 0; n < 200; n++) {
    let name = "";
    for (let i = 1 + Math.floor(rand() * 8); i > 0; i--) name += pick(pool);
    for (const [label, make] of [["characters", tlvChars], ["bytes", tlv]]) {
      const body = make("00", "01") + make("58", "IN") + make("59", "SHOP") + make("60", "PUNE") + make("64", make("00", "xx") + make("01", name));
      const crc = crc16ccitt(new TextEncoder().encode(`${body}6304`)).toString(16).toUpperCase().padStart(4, "0");
      const out = read(`${body}6304${crc}`);
      assert.equal(levelOf(out, "crc-ok"), "info", `${label}: ${JSON.stringify(name)}`);
      assert.ok(!codes(out).includes("emv-truncated"), `${label}: ${JSON.stringify(name)}`);
      assert.equal(value(out, "64"), `00=xx; 01=${name}`, `${label}: the name comes back as written`);
    }
  }
}

/* ---------- translations: everything the island can show has Hindi, Tamil, Telugu and Marathi ---------- */
const sourceOf = (file) => readFileSync(new URL(file, import.meta.url), "utf8");
const component = sourceOf("../src/components/UpiQrScanner.tsx");
const shown = new Set([...Object.values(FLAG_TEMPLATES), ...Object.values(KIND_LABELS), ...Object.values(FIELD_LABELS)]);
for (const [, literal] of component.matchAll(/\btr\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g)) shown.add(JSON.parse(`"${literal}"`));
const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
for (const english of shown) {
  const entry = SCANNER_PHRASES[english];
  assert.ok(entry !== undefined, `no translation for ${JSON.stringify(english)}`);
  for (const lang of ["hi", "ta", "te", "mr"]) {
    assert.ok(typeof entry[lang] === "string" && entry[lang].trim() !== "", `${lang}: ${english}`);
    assert.equal(placeholders(entry[lang]), placeholders(english), `${lang} keeps the placeholders of ${JSON.stringify(english)}`);
    assert.ok(!/[\u200b\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/.test(entry[lang]), `${lang}: a hidden character in ${JSON.stringify(english)} (only ZWNJ and ZWJ are allowed)`);
  }
}
for (const english of Object.keys(SCANNER_PHRASES)) assert.ok(shown.has(english), `translation for a string the island never shows: ${JSON.stringify(english)}`);

/* ---------- source guards: what the privacy page promises ---------- */
const reader = sourceOf("../src/lib/upi-qr-read.ts");
assert.doesNotMatch(reader, /^import |\bfetch\(|console\.|XMLHttpRequest|sendBeacon|localStorage|Math\.random/m, "the reader imports nothing, calls nothing and stores nothing");
for (const [name, source] of [["component", component], ["phrases", sourceOf("../src/data/scannerPhrases.ts")]]) {
  assert.doesNotMatch(source, /\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket|localStorage|sessionStorage|indexedDB|document\.cookie|trackProductEvent|productEvents|window\.open|location\.(href|assign|replace)|Math\.random/, `${name}: no network, storage, analytics or navigation`);
  assert.doesNotMatch(source, /innerHTML|insertAdjacentHTML|outerHTML|document\.write|dangerouslySetInnerHTML/, `${name}: results are text, never markup`);
}
assert.doesNotMatch(component, /class=/, "JSX uses className only");
assert.doesNotMatch(component, /ClerkClient|workspace\/localStore|WaitlistCard|SponsorSlot/, "no Clerk, workspace storage, early-access card or sponsor slot");
assert.equal((component.match(/<a\s/g) ?? []).length, 1, "the island links nowhere except its disclaimer line");
assert.match(component, /href=\{disclaimerHref\}/);
assert.match(component, /getUserMedia\(\{ video: \{ facingMode: \{ ideal: "environment" \}[\s\S]*?\}, audio: false \}\)/, "the rear camera, video only");
assert.match(component, /track\.stop\(\)/, "tracks are stopped");
assert.match(component, /addEventListener\("pagehide"/);
assert.match(component, /addEventListener\("visibilitychange"/);
assert.match(component, /capture="environment"/);

/* ---------- sources and review date ---------- */
assert.match(UPI_QR_REVIEWED_ON, /^\d{4}-\d{2}-\d{2}$/);
assert.ok(Number.isFinite(Date.parse(`${UPI_QR_REVIEWED_ON}T00:00:00+05:30`)));
assert.ok(UPI_QR_SOURCES.length >= 6);
assert.equal(new Set(UPI_QR_SOURCES.map((s) => s.href)).size, UPI_QR_SOURCES.length, "no source is listed twice");
for (const source of UPI_QR_SOURCES) assert.ok(/^https:\/\/[^\s"']+$/.test(source.href) && source.label.length > 20, source.href);

console.log("upi-qr-read: all checks passed");
