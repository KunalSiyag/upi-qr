---
title: "P2M Meaning in Banking and UPI Payments"
description: "P2M is person-to-merchant UPI. P2P is person-to-person. Learn the difference, refund TAT, MDR, and when a shop should use a merchant VPA instead of a personal UPI ID."
pubDate: 2026-09-13
author: "Kunal Siyag"
reviewedOn: 2026-09-13
reviewIntervalDays: 180
testedApplications: ["PhonePe", "Google Pay", "BHIM"]
sourceUrls:
  - label: "NPCI — About UPI"
    url: "https://www.npci.org.in/product/upi/about-upi"
  - label: "RBI TAT circular DPSS.CO.PD No.629/02.01.014/2019-20"
    url: "https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=11693&Mode=0"
image: "/images/blog/p2m-merchant-shop-counter.jpg"
tags: ["Banking", "Merchant Setup", "Reference"]
---

**P2M meaning in banking** is Person-to-Merchant: a customer paying a shop, clinic, or freelancer who is collecting as a business. **P2P** is Person-to-Person: splitting a bill with a friend. Same UPI rail, different metadata, limits, and dispute clocks.

NPCI’s UPI product page lists both P2P and merchant payments. Apps sometimes show “P2M” on a failed or pending tile. That label tells you which TAT and which bank queue apply — not that the QR is broken.

*Last reviewed 13 September 2026.*

## P2P vs P2M in one table

| | P2P | P2M |
| --- | --- | --- |
| Who is paid | Another person | A merchant VPA / MCC-tagged collect |
| Everyday example | Sending ₹500 to a roommate | Scanning a kirana standee |
| MDR on bank-to-bank UPI | 0% | 0% on tickets ≤ ₹2,000 and small QR shops; 0.4% on some P2M above ₹2,000 from 15 Oct 2026 (not a tax). RuPay CC UPI above ₹2,000 may carry interchange |
| Typical daily cap | Personal UPI limits (bank-wise) | Often higher on merchant / current accounts |
| Failed-credit TAT (RBI) | Reversal by **T+1** working day | Reversal by **T+5** working days |
| What the QR needs | Any live VPA | Live VPA; official merchant QR if you want KYC dashboards |

Limits differ by bank. Check [UPI limits](/upi-limits/) before you promise a large collection on a personal ID.

## Does a shop QR have to be P2M?

No. Customers can pay any VPA. A [printable UPI QR](/) on a personal ID is P2P from the switch’s point of view even if you sell groceries. That is legal for micro sales; it mixes personal and shop inflows and hits personal caps faster.

Upgrade to a merchant / current-account VPA (PhonePe Business, GPay for Business, or your bank) when you need settlement reports, a soundbox, or headroom above personal limits. You can still print a compatible standee from the new VPA. See [UPI QR without a business account](/blog/how-to-create-upi-qr-without-business-account/) and [VPA vs merchant accounts](/blog/understanding-upi-vpa-merchant-accounts/).

Glossary: [P2P vs P2M](/glossary/p2p-payment/).

## Why the label shows up on errors

If the app says P2M and “NPCI returned error”, open the two-character code. The [error resolver](/upi-error-codes/) maps U16 / Z9 / ZM to bank vs NPCI vs app. Do not reprint the QR until you know which hop failed. Pending debit steps: [resolve pending UPI](/blog/how-to-resolve-upi-pending-transaction-issues/).

<h2 id="faq">Frequently asked questions</h2>

### Q1. What is P2M in UPI?

Person-to-merchant: a payment to a merchant collect, usually with merchant metadata. It is the shop-counter flow, as opposed to sending money to a friend (P2P).

### Q2. Is P2M slower or costlier than P2P?

Same instant rail. P2P stays 0%. Some P2M above ₹2,000 take 0.4% MDR from 15 October 2026 unless you are a small QR merchant. Failed P2M reversals get a longer RBI TAT (T+5 vs T+1). See the [UPI MDR explainer](/blog/upi-mdr-charges-october-2026/).

### Q3. Can I accept shop payments on a personal UPI ID?

Yes, within that bank’s personal limits. Switch to a merchant VPA when volume, tax invoicing, or a soundbox requires it.

### Q4. Does printing a QR on this site make me a P2M merchant?

No. The file encodes your VPA. Merchant registration still happens at the bank or TPAP. The print is compatible, not an official merchant kit.

**[Print a shop UPI QR →](/)**

Related: [PhonePe Business activation](/blog/phonepe-business-qr-code-activation/) · [RuPay CC UPI MDR](/blog/rupay-credit-card-upi-mdr-charges/) · [UPI vs payment gateway](/blog/upi-qr-code-vs-payment-gateway/)
