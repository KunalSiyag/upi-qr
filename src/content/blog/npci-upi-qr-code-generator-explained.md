---
title: "NPCI UPI QR Code Generator Explained"
description: "NPCI has no public shop QR generator. Create an NPCI-compliant upi://pay QR for PhonePe, GPay, Paytm, and BHIM — and how Bharat QR differs."
pubDate: 2026-09-13
author: "Kunal Siyag"
reviewedOn: 2026-09-13
reviewIntervalDays: 180
testedApplications: ["BHIM", "PhonePe", "Google Pay", "Paytm"]
sourceUrls:
  - label: "NPCI — About UPI"
    url: "https://www.npci.org.in/product/upi/about-upi"
  - label: "BHIM by NPCI"
    url: "https://www.bhimupi.org.in/"
image: "/images/blog/npci-upi-qr-counter.jpg"
tags: ["NPCI", "Universal QR", "BHIM", "Tutorial"]
---

People search **NPCI QR code generator** expecting a government website that prints a shop standee. That page does not exist. NPCI writes the `upi://pay` rulebook; BHIM is NPCI’s own app; banks and TPAPs issue VPAs. A printable QR is just that URI encoded as a matrix.

*Last reviewed 13 September 2026.*

## What “NPCI QR” actually means

Three different things get lumped under the same search:

| What people type | What it is | Who issues it |
| --- | --- | --- |
| NPCI QR / UPI QR | `upi://pay?pa=…&pn=…` barcode any member app can scan | You, your bank, or a compatible generator |
| BHIM QR | Same UPI payload, usually on an `@upi` handle | [BHIM](https://www.bhimupi.org.in/) |
| Bharat QR | EMVCo merchant QR that can carry UPI **and** card rails | Acquiring bank — not a DIY print |

NPCI’s own product page lists **QR code and intent-based payments** as a UPI feature. It does not host a public “generate my shop QR” form. If a site claims to be the official NPCI generator, treat it as marketing copy.

**[Create an NPCI-compliant UPI QR →](/)**

## How to generate an NPCI-compliant UPI QR

1. Open your bank or UPI app and copy the **primary VPA** (for example `shop@oksbi` or `mobile@ybl`) and the **payee name** the app shows.
2. Paste both into the [UPI QR generator](/). Optional: lock an amount with the `am` field.
3. Download PNG or PDF. Do not screenshot the preview.
4. Test-scan with BHIM and one other app (PhonePe or GPay) before you print.
5. Decode the file with the [UPI QR decoder](/upi-qr-decoder/) and confirm `pa=` still matches your VPA.

That QR is interoperable because every member app must parse the same NPCI intent scheme. Branding on the poster does not lock the rail.

## BHIM vs a compatible print vs Bharat QR

- **BHIM app QR** — download from profile inside BHIM. Official NPCI app, plain payload. See [how to generate a BHIM UPI QR](/blog/how-to-generate-bhim-upi-qr-code/).
- **Compatible print here** — same VPA, your size, template, and reprint cycle. Not an NPCI-issued merchant kit and not a BHIM dashboard.
- **Bharat QR** — bank-issued acceptance QR that can include card networks. RBI ATM & Card statistics still show Bharat QR as a tiny fraction of UPI QR stock. A kirana that only needs PhonePe / GPay / Paytm scans does not need Bharat QR.

## NPCI QR is not an “NPCI returned error” fix

Searching **npci qr code generator** after a failed payment is a common mix-up. “NPCI returned error” is an app wrapper around a two-character reason (U16, Z9, ZM). Reprinting the standee will not clear a risk decline. Look the code up on the [UPI error resolver](/upi-error-codes/) and copy the 12-digit UTR first.

<h2 id="faq">Frequently asked questions</h2>

### Q1. Is there an official NPCI QR code generator website?

No public shop generator. NPCI operates UPI and BHIM. Banks, TPAPs, and compatible tools encode the published `upi://pay` URI. BHIM is the official NPCI app if you want their download.

### Q2. Will an NPCI-compliant QR work on PhonePe, Google Pay, and Paytm?

Yes, if `pa` is a live VPA. App-branded posters only change colours. Test with two apps before the standee goes on the counter.

### Q3. Is a Bharat QR the same as a UPI QR?

No. UPI QR is the `upi://pay` matrix shops print every day. Bharat QR is a bank-issued EMVCo code that can also accept cards. Most counters only need UPI QR.

### Q4. Does generating this QR cost MDR?

P2P and P2M of ₹2,000 or less stay at 0% MDR; other P2M above ₹2,000 may take 0.4% from 15 Oct 2026. RuPay credit card on UPI above ₹2,000 may carry interchange. The QR file itself has no Pro UPI QR fee.

**[Generate a free NPCI-compliant UPI QR →](/)**

Related: [Universal UPI QR generator guide](/blog/universal-upi-qr-code-generator-guide/) · [Create UPI QR for a bank account](/blog/create-upi-qr-code-for-bank-account/) · [BHIM QR steps](/blog/how-to-generate-bhim-upi-qr-code/)
