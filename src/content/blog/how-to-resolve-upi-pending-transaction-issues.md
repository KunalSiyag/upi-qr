---
title: "Money Deducted but Pending? How to Resolve UPI Transaction Issues"
description: "UPI pending after a debit: copy the 12-digit UTR, do not retry, use RBI T+1/T+5 auto-reversal, then escalate via app, bank, NPCI, and Ombudsman."
pubDate: 2026-05-30
updatedDate: 2026-08-27
author: "Kunal Siyag"
reviewedOn: 2026-08-27
reviewIntervalDays: 180
testedApplications: ["PhonePe", "Google Pay"]
sourceUrls:
  - label: "RBI TAT for failed / delayed credits"
    url: "https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=11693&Mode=0"
  - label: "RBI Integrated Ombudsman"
    url: "https://cms.rbi.org.in/"
image: "/images/blog/pending-upi-sms-phone.jpg"
tags: ["Troubleshooting", "Banking", "Safety"]
---

If the app says **Pending** or **Processing**, the bank SMS says **debited**, and the merchant has no credit, do **not** pay again. Copy the 12-digit UTR, wait for NPCI to finish the hop, and look up any reason code on the [UPI error resolver](/upi-error-codes/). Most failed debits reverse on their own; a second payment for the same bill is how people lose money twice.

*Last reviewed 27 August 2026.*

<h2 id="why-pending">Why UPI goes pending</h2>

One payment crosses the payer app, the payer’s bank, the **NPCI switch**, the payee’s PSP, and the payee’s bank. If any hop times out, the apps show Pending while the banks reconcile. That is a **technical pending**, not a successful payment.

“NPCI returned error” is a wrapper around a specific code (often U16). Search the exact letters.

<h2 id="decision">Decision tree</h2>

1. **No debit SMS** — the attempt failed. Fix the [error code](/upi-error-codes/) (PIN, balance, limit, VPA) and retry once.
2. **Debit SMS, merchant not paid** — freeze. Save UTR. Do not retry. Wait for credit or auto-reversal.
3. **Debit SMS, merchant paid** — success. The customer’s tile can lag. Match UTR to UTR.
4. **Green screenshot, no UTR, no merchant credit** — treat as unpaid. Screenshot spoofing is why [soundboxes](/blog/how-upi-soundboxes-work-and-their-safety/) exist.

<h2 id="utr">Step 1 — Get the UTR</h2>

The Unique Transaction Reference is 12 digits (some apps say UPI transaction ID or RRN).

- **Customer:** open history → the attempt → copy UTR.
- **Merchant:** search that UTR in PhonePe Business / GPay Business / bank statement. If it is absent, the money did not land.

No UTR means you do not have a complaint yet.

<h2 id="tat">Step 2 — RBI auto-reversal windows</h2>

From RBI circular DPSS.CO.PD No.629/02.01.014/2019-20 (20 September 2019):

| Case | Auto-reversal by | Compensation if late |
| --- | --- | --- |
| UPI transfer: debited, beneficiary not credited | **T+1** working day | ₹100 / day after T+1 |
| UPI merchant payment: debited, merchant never got confirmation | **T+5** working days | ₹100 / day after T+5 |
| Successful pay to the **wrong** VPA | **Not** auto-reversed | Dispute immediately; needs beneficiary-bank process |

Many reversals land in minutes to a few hours. The circular is the outer bound, not a reason to wait five days before you raise an in-app ticket.

Source: [RBI notification](https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=11693&Mode=0).

<h2 id="escalate">Step 3 — Escalate with the UTR</h2>

1. In-app **Raise issue / Check status** (UDIR through the TPAP).
2. Issuing-bank customer care with UTR, amount, time, both VPAs.
3. NPCI UPI helpdesk **1800-120-1740**.
4. After 30 days (or a rejected reply): [RBI Integrated Ombudsman](https://cms.rbi.org.in).

Wrong-VPA success is a different path from a technical failure — banks cannot silently pull back a completed authorised credit without the beneficiary side.

<h2 id="faq">Frequently asked questions</h2>

### Q1. The merchant says they did not get the money but my app is green.

Ask for their ledger, not their opinion. Share the UTR. If they still have no credit, you are in the pending/failed-debit case — do not send a second payment until this UTR is Failed or reversed.

### Q2. How long before I complain?

Raise in-app as soon as you have a UTR and a debit without credit. You do not have to wait for T+5 to file; T+5 is when compensation for delay starts on merchant payments.

### Q3. Where do I look up U16, U30, Z9?

The [NPCI UPI error code resolver](/upi-error-codes/) — including bank vs NPCI vs app, and permalinks such as `/upi-error-codes/#u16`.
