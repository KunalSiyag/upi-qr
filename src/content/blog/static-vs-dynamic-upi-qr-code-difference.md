---
title: "Static vs Dynamic UPI QR Code: What's the Difference?"
description: "Understand static and dynamic UPI QR codes, when to use each for shops and billing, and how pre-filled amount QRs reduce payment errors."
pubDate: 2026-06-12
author: "Pro UPI QR Team"
tags: ["Tutorial", "Dynamic QR", "Merchant Tips"]
---

Shop owners often hear "static QR" and "dynamic QR" when setting up UPI payments. Both use the same NPCI `upi://pay` standard, but they behave differently at checkout.

This guide explains the difference in plain language and helps you pick the right format for your counter.

---

## What Is a Static UPI QR Code?

A **static UPI QR** contains your fixed Virtual Payment Address (VPA) and payee name. The customer scans it, then manually enters the payment amount and optional note.

Example payload:
`upi://pay?pa=shopname@okaxis&pn=Shop%20Name&cu=INR`

**Best for:** Kirana counters, donation boxes, salons, and any setup where the bill amount changes every time.

---

## What Is a Dynamic UPI QR Code?

A **dynamic UPI QR** embeds a preset amount (`am`) and often a transaction note (`tn`) in the same link. When scanned, the amount field is already filled — the customer only confirms and enters their UPI PIN.

Example payload:
`upi://pay?pa=shopname@okaxis&pn=Shop%20Name&am=499&cu=INR&tn=Order%20142`

**Best for:** Fixed-price items, event tickets, parking fees, tuition installments, and invoice-specific payments.

---

## Side-by-Side Comparison

| Factor | Static QR | Dynamic QR |
| :--- | :--- | :--- |
| Amount entry | Customer types amount | Amount pre-filled |
| Error risk | Wrong amount possible | Lower — amount is locked |
| Reusability | One QR for all bills | Usually one QR per bill/price |
| Print cost | Print once, use forever | May need new QR per invoice |
| Works on GPay, PhonePe, Paytm | Yes | Yes |

---

## Which Should Your Shop Use?

* **Use static** if every transaction has a different total (grocery, tailoring, repair work).
* **Use dynamic** if you sell items at fixed prices (₹50 parking, ₹500 workshop fee, ₹1,200 monthly tuition).
* **Use both:** A permanent static standee on the counter plus dynamic QRs on printed invoices.

Create either type free on the [Pro UPI QR Generator](/). For amount-locked codes, see our guide on [generating UPI QR with a fixed amount](/blog/how-to-generate-upi-qr-with-amount/).

---

## Common Misconceptions

1. **"Dynamic QR needs a payment gateway."** No — a standard `upi://pay` link with an `am` parameter is dynamic enough for most small businesses. Payment gateways add reconciliation dashboards, not basic scan-to-pay.
2. **"Static QR only works on one app."** Any NPCI-compliant UPI app can scan both static and dynamic codes.
3. **"Dynamic QR charges MDR."** Standard UPI P2M bank transfers remain commission-free for merchants in most cases. RuPay credit card on UPI is a separate topic — see our [MDR guide](/blog/rupay-credit-card-upi-mdr-charges/).

**[Generate your static or dynamic UPI QR now &rarr;](/)**

Related: [UPI QR vs payment gateway](/blog/upi-qr-code-vs-payment-gateway/) · [Print a shop standee](/blog/how-to-create-print-upi-qr-code-standee/)