---
title: "SBI QR Code Generator for Bank Account"
description: "Create an SBI UPI QR for a savings or current account. Personal YONO QR vs SBI business merchant QR, VPA formats, and a free printable standee for every UPI app."
pubDate: 2026-09-13
author: "Kunal Siyag"
reviewedOn: 2026-09-13
reviewIntervalDays: 180
testedApplications: ["YONO SBI", "BHIM", "PhonePe", "Google Pay"]
sourceUrls:
  - label: "YONO SBI on Google Play"
    url: "https://play.google.com/store/apps/details?id=com.sbi.lotusintouch"
image: "/images/blog/sbi-upi-qr-shop-counter.jpg"
tags: ["SBI", "Bank Account", "Tutorial"]
---

An **SBI QR code generator** search is usually a savings-account holder who wants PhonePe and GPay to credit SBI, or a current-account shop that heard about YONO / SBI merchant QR. Both start from an `@sbi` (or `@oksbi`) VPA. The printable file on this site is a **compatible** `upi://pay` standee — not SBI’s official merchant kit.

*Last reviewed 13 September 2026. Confirm VPA menus inside YONO; SBI changes labels without a public changelog.*

## Personal SBI QR in four steps

1. Open **YONO SBI** or BHIM and copy the UPI ID (`name@sbi` or `mobile@sbi`). Note the payee name.
2. Open the [SBI UPI QR generator](/sbi-qr-generator/).
3. Paste payee name and VPA. Leave amount blank for a counter QR, or lock it for invoices.
4. Download PNG/PDF, test-scan with PhonePe and GPay, then print matte.

Customers do not need the SBI app. Any member app credits the linked SBI account.

If you only have the account number, stop — you still need the VPA. [QR from bank account number](/blog/generate-qr-from-bank-account-number/) explains why.

## Personal vs SBI business QR

| | Personal / YONO QR | SBI business / merchant QR |
| --- | --- | --- |
| Account | Savings or personal UPI | Current / merchant |
| Daily receive cap | Personal SBI UPI limit | Higher, bank-configured |
| Official sticker from branch | Sometimes on request | Common with merchant onboarding |
| Compatible print here | [SBI QR generator](/sbi-qr-generator/) | [SBI business QR generator](/sbi-business-qr-code-generator/) |
| Soundbox / MIS | No | Bank or TPAP product |

For a tuition teacher or weekend stall, personal `@sbi` is enough. For a GST-registered counter, ask the branch for merchant UPI and print the business preset. Limits: [SBI vs HDFC vs ICICI](/blog/upi-transaction-limits-sbi-hdfc-icici/).

## Official SBI sticker vs a compatible print

SBI may issue a branch QR for current accounts. Use it if you want bank branding. Use a compatible print when you need a larger standee, a Hindi template, or a same-day reprint after a VPA change. Both are interoperable if `pa` is live.

**[Create an SBI-compatible standee →](/sbi-qr-generator/)**

<h2 id="faq">Frequently asked questions</h2>

### Q1. Can I generate an SBI QR without YONO merchant KYC?

Yes, with any active SBI UPI ID. KYC is required for official merchant kits and higher limits, not for a personal collect QR.

### Q2. Will PhonePe pay an SBI QR?

Yes. It is a standard UPI payload. The SBI-coloured poster is layout only.

### Q3. What is the difference between @sbi and @oksbi?

Different PSP handles pointing at SBI-linked accounts (`@oksbi` is common on Google Pay). Use the exact VPA the app shows. Do not guess the suffix.

### Q4. Is there an SBI business QR code generator?

Yes — [SBI business QR](/sbi-business-qr-code-generator/) for current-account VPAs, plus the personal generator above. Neither replaces SBI’s own merchant onboarding.

Related: [Create UPI QR for a bank account](/blog/create-upi-qr-code-for-bank-account/) · [Free QR from the bank](/blog/how-to-get-free-upi-qr-code-from-bank/) · [Universal QR guide](/blog/universal-upi-qr-code-generator-guide/)
