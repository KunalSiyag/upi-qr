---
title: "How to Generate UPI QR Codes for Multiple Staff Counters"
description: "Run two or more billing counters with separate UPI QRs, transaction notes, or VPAs for easier daily reconciliation."
pubDate: 2026-06-26
author: "Pro UPI QR Team"
tags: ["Shops", "Billing", "Tutorial"]
---

A busy store with three counters but **one QR** cannot tell which cashier collected which payment. Multi-counter setups use **separate VPAs, note tags, or both** to simplify end-of-day matching.

---

## Three Approaches

### Approach 1: One VPA, Different Note Tags (Simplest)
Same UPI ID on all counters; train staff to tell customers: "Enter `Counter2` in payment note."

**Pros:** One bank account, one settlement. **Cons:** Customers forget notes.

### Approach 2: One VPA, Separate Printed QR per Counter
Generate identical VPA but different **template labels** (`Counter 1`, `Counter 2`) on [Pro UPI QR](/) for visual staff discipline. Still same VPA — reconciliation via staff shift logs.

### Approach 3: Separate VPAs per Counter (Best Reconciliation)
Bank provides sub-merchant VPAs or use staff-linked UPI under policy:
* `store-c1@okaxis`
* `store-c2@okaxis`

Each counter gets its own QR standee. Bank statement shows VPA-wise credits.

Check with your bank if multiple VPAs on one current account are supported.

---

## Step-by-Step (Approach 3)

1. Request multiple VPAs or staff payment IDs from bank per your policy.
2. Generate QR per counter — [PhonePe](/phonepe-qr-generator/), [GPay](/google-pay-qr-generator/), or universal [generator](/).
3. Label acrylic stands physically: `COUNTER 1 ONLY`.
4. Daily: export bank statement, sum per VPA.

For many VPAs at once, see [bulk UPI QR generation](/blog/how-to-generate-bulk-upi-qr-codes/).

---

## Retail Chain Tips

| Tip | Detail |
| :--- | :--- |
| Colour-code stands | Red tent = Counter 1, Blue = Counter 2 |
| Manager spot-check | ₹1 verification weekly per counter |
| Central account | All VPAs settle to one current account ideally |
| Avoid personal VPAs | Staff attrition should not drain payments |

---

## When One QR Is Enough

Single-counter kirana, solo freelancer, one donation desk — use one static QR and skip complexity.

**[Generate counter-specific UPI QR &rarr;](/)**

Related: [Change UPI ID on standee](/blog/how-to-change-upi-id-on-printed-qr-standee/) · [Verify before display](/blog/how-to-verify-upi-qr-code-before-displaying/)