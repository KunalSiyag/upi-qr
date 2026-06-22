---
title: "RBI & NPCI Merchant UPI QR Display Guidelines for Indian Shops"
description: "What Indian merchants should know about UPI QR display, soundbox usage, MDR rules, and customer transparency — in plain language."
pubDate: 2026-06-25
author: "Pro UPI QR Team"
tags: ["Compliance", "Merchant Tips", "Reference"]
---

Merchants hear "RBI rules" when installing UPI QR at billing counters. Most requirements are about **transparency, correct labeling, and choosing authorized payment rails** — not complex paperwork for a basic shop standee.

This is an educational summary, not legal advice. Verify specifics with your bank and accountant.

---

## What NPCI / RBI Framework Expects

1. **Correct payee identification** — Customer must see accurate merchant/trust name before confirming UPI PIN.
2. **No forced payment mode** — You may encourage UPI but cannot refuse legal tender cash (per RBI cash guidelines) unless policy is clearly disclosed for digital-only venues.
3. **Authorized UPI infrastructure** — Use bank-issued or legitimate `upi://pay` QRs, not fake payment pages.
4. **MDR transparency** — Standard UPI bank transfers to merchants are generally **zero MDR**. RuPay credit card on UPI carries charges — disclose if you promote credit-on-UPI. See [RuPay MDR guide](/blog/rupay-credit-card-upi-mdr-charges/).

---

## Display Best Practices (Operational Compliance)

| Practice | Why it matters |
| :--- | :--- |
| Show registered business/trust name | Matches bank KYC, reduces disputes |
| Verify QR before display | Prevents wrong-account credits |
| Inspect standee for tampering | NPCI fraud advisories for sticker swaps |
| Keep transaction records | GST and income tax documentation |
| Issue bill/receipt with UTR | Customer dispute resolution |

[Verify QR checklist](/blog/how-to-verify-upi-qr-code-before-displaying/) · [Tampering prevention](/blog/prevent-upi-qr-code-tampering-frauds/).

---

## Personal vs Business UPI for Collections

* **Personal VPA** for hobby-level sales — monitor [transaction limits](/blog/upi-transaction-limits-sbi-hdfc-icici/).
* **Registered business / trust VPA** for companies, hospitals, NGOs — cleaner audit trail.
* **Donations** should not use personal VPAs — [temple/NGO guide](/blog/how-to-collect-donations-temples-ngos-upi/).

---

## Soundboxes and Third-Party Devices

RBI has regulated payment device ecosystems. Buy soundboxes from **authorized bank or PSP programs** (PhonePe, Paytm, banks) — not unverified grey-market devices that access your notifications insecurely.

[How UPI soundboxes work](/blog/how-upi-soundboxes-work-and-their-safety/).

---

## What Pro UPI QR Is (and Is Not)

* **Is:** A browser-side QR poster generator using standard `upi://pay` format.
* **Is not:** A bank, PSP, or NPCI-licensed payment aggregator.
* **Does not:** Store, route, or intermediate funds — payments go bank-to-bank via customer's UPI app.

Official NPCI reference: [npci.org.in](https://www.npci.org.in)

**[Generate compliant UPI QR poster &rarr;](/)**

Related: [Merchant VPA guide](/blog/understanding-upi-vpa-merchant-accounts/) · [UPI vs payment gateway](/blog/upi-qr-code-vs-payment-gateway/)