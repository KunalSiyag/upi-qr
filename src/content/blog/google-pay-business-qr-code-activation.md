---
title: "How to Set Up and Activate Google Pay for Business"
description: "Register Google Pay for Business, complete PAN KYC, download the merchant QR, and learn how an official GPay QR differs from a compatible UPI print."
pubDate: 2026-06-07
updatedDate: 2026-08-27
author: "Kunal Siyag"
reviewedOn: 2026-08-27
reviewIntervalDays: 180
testedApplications: ["Google Pay", "Google Pay for Business", "PhonePe"]
sourceUrls:
  - label: "Google Pay for Business on Google Play"
    url: "https://play.google.com/store/apps/details?id=com.google.android.apps.nbu.paisa.merchant"
image: "/images/blog/google-pay-merchant-phone.jpg"
tags: ["Google Pay", "Merchant Setup", "GPay"]
---

Install **Google Pay for Business**, sign in with a Google account, enter shop name and map pin, then link the bank account and complete PAN KYC. GPay often posts a ₹1 validation credit. After that you can download the merchant QR from the app. A poster generated here encodes the same VPA and is **not** an official Google merchant kit.

*Last reviewed 27 August 2026. Confirm current GPay Business menus in the app.*


<h2 id="official-vs-compatible">Official GPay Business QR vs a compatible print</h2>

| | Google Pay for Business QR | Compatible UPI QR from this site |
| --- | --- | --- |
| Source | KYC inside GPay for Business | Your existing `@ok…` VPA in the [Google Pay QR generator](/google-pay-qr-generator/) |
| Who can pay | Any UPI app | Any UPI app |
| Maps / merchant profile | Can appear on Google Maps once the profile is live | No Maps listing from the print |
| Dashboard | GPay Business analytics | Bank SMS / passbook |
| Design | GPay download | You choose template, size, reprint |

Use the official app if you want Maps discovery and GPay’s merchant tools. Use a compatible print if you already have a VPA and need a counter card this afternoon.

**[Create a Google Pay compatible QR →](/google-pay-qr-generator/)**

<h2 id="activation-steps">Activation steps</h2>

1. Install **Google Pay for Business** (Play Store / App Store) — not only consumer GPay.
2. Sign in with the Google account that should own the merchant profile.
3. Choose **set up as a business**. Enter the legal / shop name, category, and the map pin for the storefront.
4. Link the **bank account** that should receive settlements.
5. Complete KYC: **PAN** is standard; the app may ask for a PAN photo. Aadhaar is commonly used as address proof.
6. GPay may send a **₹1 validation deposit**. Wait for it before you assume the account is live.
7. Open the **QR** tab, download the image, and test-scan from a second phone.

GST is not required below the GST threshold. Add GSTIN later if the app requests it or if your turnover requires registration.

<h2 id="fetch-and-print">Fetch the QR and print it properly</h2>

Do not screenshot a dim phone screen and send that JPEG to a printer. Download from the QR tab, or paste the VPA into the [Google Pay QR generator](/google-pay-qr-generator/) for a print-ready PNG/PDF.

Full print spec (sizes, matte vs glossy, test protocol): [How to print a GPay QR code](/blog/how-to-print-gpay-qr-code-step-by-step/).

<h2 id="charges">Charges</h2>

Bank-to-bank UPI is **0% MDR**. RuPay credit card on UPI above ₹2,000 may carry interchange — see [RuPay CC MDR](/blog/rupay-credit-card-upi-mdr-charges/). Voice alerts in GPay for Business are a software toggle; hardware soundboxes are a separate product if Google or a partner offers them in your city.

<h2 id="faq">Frequently asked questions</h2>

### Q1. Can PhonePe customers pay my GPay Business QR?

Yes. UPI QRs are interoperable. The customer’s app talks to NPCI, not to a Google-only rail.

### Q2. Is the generator on this site the official GPay merchant QR?

No. It encodes the VPA you type. You do not get Maps listing or GPay Business analytics from that file. It is the right tool when you need a branded standee or sticker sheet today.

### Q3. Do I need GST for GPay Business?

Not for a small shop below the GST threshold. PAN and a bank account are the usual gates. GSTIN can be added when you have it.

### Q4. The ₹1 validation never arrived. What now?

Check the account number and IFSC, wait a few hours, then use in-app help. Do not keep submitting new bank accounts in a loop — that retriggers KYC.

**Next:** [print a shop standee](/blog/how-to-create-print-upi-qr-code-standee/) · [GPay vs PhonePe vs Paytm](/phonepe-vs-paytm-vs-gpay/) · [UPI error codes](/upi-error-codes/)
