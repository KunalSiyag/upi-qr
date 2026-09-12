---
title: "QR Code From Bank Account Number"
description: "You cannot encode IFSC and account number into a UPI QR. Find your VPA from SBI, HDFC, or ICICI, then generate a free QR that credits the linked bank account."
pubDate: 2026-09-13
author: "Kunal Siyag"
reviewedOn: 2026-09-13
reviewIntervalDays: 180
testedApplications: ["YONO SBI", "HDFC Bank", "iMobile", "PhonePe", "Google Pay"]
sourceUrls:
  - label: "NPCI — About UPI"
    url: "https://www.npci.org.in/product/upi/about-upi"
image: "/images/blog/bank-account-number-qr.jpg"
tags: ["Bank Account", "Universal QR", "Tutorial", "SBI"]
---

**Generate QR code for bank account number** is the search when someone wants to skip UPI IDs and print IFSC + account as a barcode. A UPI QR cannot do that. NPCI maps the account to a **VPA**. The matrix carries `pa=name@bank`, not the 16-digit number.

If a generator asks only for account number and IFSC and promises a PhonePe-scannable code, it is either creating a non-UPI payload or inventing a VPA it does not control. Do not put that on a counter.

*Last reviewed 13 September 2026.*

## What to do instead (five minutes)

1. Open the bank or UPI app linked to that account (YONO SBI, HDFC, iMobile, PhonePe, GPay).
2. Copy the **UPI ID / VPA** — `name@sbi`, `mobile@okhdfcbank`, `name@okicici`, `mobile@ybl`, and so on.
3. Confirm the **payee name** the app shows. That string is what customers will see.
4. Paste both into the [UPI QR generator](/) or the bank preset ([SBI](/sbi-qr-generator/), [HDFC](/hdfc-qr-generator/), [ICICI](/icici-qr-generator/)).
5. Test-scan. Money credits the **linked** account through UPI, not by typing IFSC.

Longer walkthrough: [UPI QR for a bank account](/blog/create-upi-qr-code-for-bank-account/).

## Account number vs VPA vs IMPS QR

| Input | What you get | Who can pay |
| --- | --- | --- |
| VPA in a UPI QR | Instant UPI credit | PhonePe, GPay, Paytm, BHIM, bank apps |
| Account + IFSC typed by the payer | IMPS / NEFT / RTGS | Netbanking or “to bank account” in an app — slow, typo-prone |
| Random “account-number QR” | Often a text QR, not `upi://pay` | Usually nothing useful at a till |

UPI exists so you never print the account number on a standee.

## Where each bank hides the VPA

| Bank / app | Typical handle | Menu hint |
| --- | --- | --- |
| SBI / YONO | `@sbi` | Profile → UPI IDs |
| HDFC | `@hdfcbank` / `@okhdfcbank` | BHIM UPI → VPA |
| ICICI iMobile | `@icici` / `@okicici` | BHIM UPI → manage VPAs |
| PhonePe | `@ybl` `@axl` `@ibl` | Profile → UPI IDs |
| Google Pay | `@oksbi` `@okaxis` `@okhdfcbank` | Bank account → manage UPI IDs |

If UPI is not enabled on the account, enable it in the bank app first. A QR cannot invent a VPA for an account that has never been linked.

<h2 id="faq">Frequently asked questions</h2>

### Q1. Can I generate a UPI QR from account number and IFSC only?

No. You need the VPA that already maps to that account. Find it in the bank or UPI app, then generate.

### Q2. Will the QR credit my SBI / HDFC savings account?

Yes, if the VPA is linked to that account. The QR does not contain the account digits; the PSP routes via NPCI.

### Q3. Is this safer than printing the account number?

Yes. A VPA is meant to be public. An account number plus IFSC is enough for IMPS. Still inspect the standee for overlay stickers.

### Q4. I do not have a debit card. Can I still make a QR?

UPI needs a linked bank account and a registered mobile, not necessarily a debit card on the counter. Complete UPI registration in the bank app, then print.

**[Create a bank-account UPI QR →](/)**

Related: [SBI QR generator guide](/blog/sbi-upi-qr-code-generator-guide/) · [Free bank QR vs custom standee](/blog/how-to-get-free-upi-qr-code-from-bank/) · [Universal QR for bank account](/blog/universal-upi-qr-code-generator-guide/)
