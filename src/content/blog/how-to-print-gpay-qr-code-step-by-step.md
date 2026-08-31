---
title: "How to Print a GPay QR Code: Step-by-Step Guide"
description: "Export a high-resolution Google Pay QR, pick A6/A5/A4 sizes, use matte stock, and test-scan before the standee goes on the counter."
pubDate: 2026-07-15
updatedDate: 2026-08-27
author: "Kunal Siyag"
reviewedOn: 2026-08-27
reviewIntervalDays: 180
testedApplications: ["Google Pay", "PhonePe"]
image: "/images/blog/print-upi-qr-sizes.jpg"
tags: ["Google Pay", "Printing Guide", "Retail"]
---

A GPay Business QR is just a UPI QR with Google’s download button around it. Print quality — not the logo — decides whether customers can scan from three feet away. Export a high-resolution file, print on **matte** 300 GSM (or vinyl), keep a white quiet zone, and test-scan from PhonePe *and* GPay before the card hits the desk.

*Last reviewed 27 August 2026.*


<h2 id="export">1. Export a real file, not a screenshot</h2>

**Google Pay for Business**

1. Open the Business app → **QR Code**.
2. Use **Save** or **Share**, not a volume-down screenshot.
3. Prefer the PNG or PDF the app offers.

**Compatible print from a VPA**

If you want a branded poster, larger type, or an A4 sticker sheet:

1. Open the [Google Pay QR generator](/google-pay-qr-generator/).
2. Enter payee name and the GPay UPI ID (`name@oksbi`, `name@okhdfcbank`, …).
3. Download **PNG** or **PDF** (print-ready raster/PDF — not a phone screenshot).

The official GPay download and a compatible print can share the same VPA. The compatible file is not an official Google merchant kit.

<h2 id="sizes">2. Sizes that actually scan</h2>

| Display | Size | Holder |
| --- | --- | --- |
| Cashier desk | 4×6 in (A6) or 5×7 in | Acrylic L-stand / T-stand |
| Dining table | ~6–8 cm QR square | Table tent |
| Wall / entrance | A5 or A4 | Laminated board, **matte** |
| Rider / badge | CR80 (2.1×3.3 in) | ID holder |

QR module size matters more than paper size: keep the **QR square at least 2.5 cm** for close range and **8 cm** if people scan from a queue. Leave a **quiet zone** of at least 4 modules (about 0.25 in) of plain light margin around the code.

Full standee walkthrough: [create and print a UPI QR standee](/blog/how-to-create-print-upi-qr-code-standee/).

<h2 id="materials">3. Materials</h2>

- **Matte 300 GSM art card** in acrylic — default for indoor counters. Glossy lamination mirrors tube lights and fails scans.
- **Matte vinyl sticker** — glass counters, metal cash boxes, outdoor tea stalls. See [waterproof QR stickers](/blog/how-to-print-durable-waterproof-qr-stickers/).
- **Sunboard 3–5 mm** — wall hooks and auto dashboards.
- **A4 sticker sheets** — parcels and extra tills. [Sticker sheet generator](/qr-sticker-generator/).

Tell the print shop **300 DPI**, no extra contrast filters, no stretching.

<h2 id="test">4. Test protocol (do this before display)</h2>

1. Scan with GPay and one other app (PhonePe or BHIM).
2. Confirm payee name and VPA.
3. Send ₹1 if you have a second account.
4. Repeat under the actual counter lights — a code that works at home can fail under a glossy menu lamp.

If it will not scan: [QR not scanning](/blog/upi-qr-code-not-scanning-troubleshooting/).

<h2 id="faq">Frequently asked questions</h2>

### Q1. Why is my printed Google Pay QR not scanning?

Usually glare (glossy lamination), a screenshot upscaled for A4, or a stretched QR. Reprint from PNG/PDF on matte stock and keep the quiet zone.

### Q2. Can PhonePe and Paytm users pay a GPay QR?

Yes. It is a standard UPI payload. Branding on the poster does not lock the rail.

### Q3. How do I verify the printed code is safe?

Decode it with the [UPI QR decoder](/upi-qr-decoder/) and match `pa=` to your VPA. Then do the two-app test above. Never display a code you have not scanned yourself.

**[Open the Google Pay QR generator →](/google-pay-qr-generator/)**
