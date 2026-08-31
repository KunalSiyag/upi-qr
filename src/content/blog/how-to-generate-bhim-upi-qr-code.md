---
title: "How to Generate and Download a BHIM UPI QR Code"
description: "Get a BHIM UPI QR from the official app or print a compatible standee from your @upi VPA. Interoperable with PhonePe, GPay, and Paytm."
pubDate: 2026-06-10
updatedDate: 2026-08-27
author: "Kunal Siyag"
image: "/images/blog/bhim-navy-upi-poster.jpg"
tags: ["BHIM", "Setup Guide", "Payments"]
---

BHIM is NPCI’s own UPI app. Its QR is a standard `upi://pay` code, usually on an `@upi` handle. Download it from the BHIM app, or print a compatible poster from the same VPA. Customers can pay from BHIM, PhonePe, GPay, or any member app.

*Last reviewed 27 August 2026.*

<h2 id="official-vs-compatible">Official BHIM QR vs a compatible print</h2>

| | BHIM app QR | Compatible print here |
| --- | --- | --- |
| Source | Profile QR inside [BHIM](https://www.bhimupi.org.in/) | [BHIM QR generator](/bhim-qr-generator/) using your VPA |
| Who can pay | Any UPI app | Any UPI app |
| Look | BHIM download | Your template, size, and reprint |

**[Create a BHIM-compatible standee →](/bhim-qr-generator/)**

<h2 id="from-the-app">Download from the BHIM app</h2>

1. Install official **BHIM** from Play Store or App Store. Register the bank-linked mobile number and set the app passcode.
2. Link the bank account the app discovers on that SIM.
3. Open **profile / QR**. The default code is tied to your primary VPA (often `…@upi`).
4. Use **Download** or **Share** — not a screenshot — if you will print it.
5. Test-scan from a second app (PhonePe or GPay) before you laminate.

<h2 id="print">Print it so it scans</h2>

Matte 300 GSM, 300 DPI, quiet zone, two-app test. Full spec: [standee guide](/blog/how-to-create-print-upi-qr-code-standee/). Bank-to-bank UPI is 0% MDR; RuPay credit card on UPI above ₹2,000 may carry interchange.

<h2 id="faq">Frequently asked questions</h2>

### Q1. Is a BHIM QR safer than PhonePe or GPay?

All member apps follow the same NPCI rules. BHIM is simpler; it is not a different payment rail. Safety is PIN hygiene and not scanning a swapped sticker.

### Q2. Can I print a BHIM-looking poster without the BHIM app?

Yes, if you already have a VPA. Paste it into the [BHIM QR generator](/bhim-qr-generator/). That file is compatible, not an NPCI-issued merchant kit.

### Q3. My BHIM QR failed with NPCI returned error.

Open the transaction, copy the reason code and UTR, and use the [error resolver](/upi-error-codes/). Do not retry a pending debit.
