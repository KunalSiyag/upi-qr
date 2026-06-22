---
title: "UPI AutoPay Mandate QR: Recurring Rent, Subscriptions & EMIs Explained"
description: "How UPI AutoPay mandates differ from shop QR standees, and when gyms, landlords, and SaaS sellers should use recurring UPI instead."
pubDate: 2026-06-27
author: "Pro UPI QR Team"
tags: ["UPI AutoPay", "Billing", "Reference"]
---

Shop owners collecting **one-time payments** use static or dynamic UPI QR standees. **UPI AutoPay** is a different product — it lets customers authorize **recurring debits** (rent, gym fees, OTT, insurance) after a one-time mandate approval.

Do not confuse a printed counter QR with AutoPay setup.

---

## UPI QR Standee vs UPI AutoPay

| Feature | Counter UPI QR | UPI AutoPay Mandate |
| :--- | :--- | :--- |
| Payment type | One-time, customer-initiated | Recurring, pre-authorized |
| Customer action | Scan + PIN each time | Approve mandate once |
| Typical use | Shop bill, donation | Rent, SIP, subscriptions |
| Setup | Print QR poster | Bank/app mandate flow |
| Encoding | `upi://pay` | `upi://mandate` (issuer-dependent) |

---

## Who Needs AutoPay Instead of QR Posters?

* **Landlords** collecting monthly rent
* **Gyms / coaching** with fixed monthly membership
* **Housing societies** with maintenance autopay
* **SaaS** with Indian UPI recurring (via supported PSP)

For variable shop bills, stick with [static/dynamic QR](/blog/static-vs-dynamic-upi-qr-code-difference/).

---

## How Customers Set Up AutoPay (High Level)

1. Merchant or society sends mandate request via supported **bank app, PhonePe, GPay, or Paytm** business tools.
2. Customer approves max amount and frequency (monthly, etc.).
3. Subsequent debits happen automatically within approved cap.
4. Customer can pause/revoke in UPI app mandate section.

Exact UI varies by PSP — check your bank's merchant documentation.

---

## Can Pro UPI QR Generate AutoPay?

**No.** Pro UPI QR creates standard **one-time** `upi://pay` posters for counters, invoices, and donations.

For society maintenance without full AutoPay, many admins use **monthly dynamic QRs** (`am=3500`, `tn=Flat-402-June`) shared on WhatsApp — manual but simple. See [apartment maintenance guide](/blog/collect-apartment-maintenance-fees-upi-qr/).

---

## Compliance Notes

* AutoPay requires explicit customer consent per NPCI mandate rules.
* Merchants must support mandate revocation queries.
* Do not store customer UPI PINs — ever.

**[Generate one-time shop UPI QR &rarr;](/)**

Related: [Tuition fee collection](/blog/upi-qr-for-tuition-coaching-centers/) · [UPI vs payment gateway](/blog/upi-qr-code-vs-payment-gateway/)