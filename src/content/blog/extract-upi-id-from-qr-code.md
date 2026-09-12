---
title: "Extract UPI ID From a QR Code Online"
description: "Upload a UPI QR to extract the VPA, payee name, and amount in your browser. Decode PhonePe, GPay, Paytm, or BHIM codes without sending the image to a server."
pubDate: 2026-09-13
author: "Kunal Siyag"
reviewedOn: 2026-09-13
reviewIntervalDays: 180
testedApplications: ["PhonePe", "Google Pay", "Paytm", "BHIM"]
image: "/images/blog/extract-upi-id-qr-decode.jpg"
tags: ["Security", "Tutorial", "Merchant Tips"]
---

A UPI QR is not a mystery bitmap. It is a `upi://pay` string printed as a matrix. **Extract UPI ID from QR code** means reading the `pa=` field — your Virtual Payment Address — plus the payee name and any locked amount.

Do this before you print a standee, after you find a sticker on the counter, and whenever a customer says the name on screen looks wrong.

*Last reviewed 13 September 2026.*

## Fastest way: decode in the browser

1. Open the [UPI QR decoder](/upi-qr-decoder/).
2. Upload a photo or screenshot of the QR — PhonePe, GPay, Paytm, BHIM, or a bank print. The image stays in this tab; it is not uploaded.
3. Read **VPA (`pa`)**, **payee name (`pn`)**, **amount (`am`)**, and **note (`tn`)**.
4. Match `pa` to the UPI ID in your bank app. If they differ, do not display that print.

A second phone’s camera app also works: scan, copy the `upi://pay…` link, and read the text after `pa=`. The decoder is safer because it flags missing VPA, odd handles, and non-UPI URLs.

## What you can and cannot learn from a QR

| You can extract | You cannot extract |
| --- | --- |
| UPI ID / VPA | The 16-digit account number |
| Payee name shown to the payer | PAN, Aadhaar, or IFSC |
| Locked amount and note | A public “who owns this VPA” directory |
| MCC if the merchant QR included `mc=` | Whether the last payment succeeded |

There is no official **QR to UPI ID finder** that reverse-looks-up a stranger’s bank account. If a tool promises “find whose UPI this is” beyond the VPA printed in the code, it is guessing or phishing.

## When merchants should decode

- **Before print.** Confirm you did not typo `shop@okaxis` as `shop@okaxi`.
- **Sticker swap check.** Run a finger over the acrylic, photograph the QR, decode. Overlay frauds change `pa` while the poster still looks like yours. See [prevent QR tampering](/blog/prevent-upi-qr-code-tampering-frauds/).
- **Customer dispute.** If they paid the wrong name, the decoded `pn`/`pa` is the evidence, not the colour of the standee.

## Phone scan vs decoder vs UPI app

Scanning inside PhonePe or GPay starts a payment. That is the wrong tool when you only want to **get UPI ID from QR code**. Use a generic QR reader or the decoder so you never enter a PIN just to inspect a sticker.

<h2 id="faq">Frequently asked questions</h2>

### Q1. How do I extract a UPI ID from a PhonePe or GPay QR?

Upload the image to the [decoder](/upi-qr-decoder/). Standard Indian UPI QRs share the same `upi://pay` payload. App artwork around the matrix does not change `pa`.

### Q2. Can I find someone’s UPI ID by scanning their shop QR?

You can read the VPA encoded in that QR. You cannot look up a private directory of all UPI IDs, and you should not pay a random sticker to “test” it with a large amount. A ₹1 test to a VPA you already own is the merchant check.

### Q3. The decoder shows a website instead of upi://pay. Is that safe?

No. Do not print or scan it at the counter. Genuine UPI QRs open a member app, not a login page. Replace the standee.

### Q4. Does decoding upload my QR to a server?

Not on this site. Decoding runs in the browser. Prefer that over random “QR to UPI ID” APKs that ask for camera and contacts.

**[Decode a UPI QR now →](/upi-qr-decoder/)**

Related: [Verify a QR before displaying](/blog/how-to-verify-upi-qr-code-before-displaying/) · [Is it safe to scan a UPI QR?](/blog/is-it-safe-to-scan-upi-qr-code/) · [QR not scanning fixes](/blog/upi-qr-code-not-scanning-troubleshooting/)
