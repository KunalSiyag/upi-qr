---
title: "UPI MDR from 15 Oct 2026: What Merchants Actually Pay"
description: "Headlines said UPI tax. From 15 Oct 2026 merchants pay 0.4% MDR on some P2M payments above ₹2,000. P2P and small QR shops stay free. Rates, GST, and a calculator."
pubDate: 2026-09-16
author: "Kunal Siyag"
reviewedOn: 2026-09-16
reviewIntervalDays: 14
sourceUrls:
  - label: "PIB — UPI remains free for P2P and 96% of merchant transactions"
    url: "https://www.pib.gov.in/PressReleasePage.aspx?PRID=2310586"
  - label: "BBC — UPI fee on some merchant payments"
    url: "https://www.bbc.co.uk/news/articles/ckpd0y9gdp5lo"
  - label: "Economic Times — 18% GST on UPI MDR, ITC available"
    url: "https://economictimes.indiatimes.com/news/economy/finance/upi-mdr-above-rs-2000-to-attract-18-gst-merchants-can-claim-input-tax-credit/articleshow/134285437.cms"
image: "/images/blog/p2m-merchant-shop-counter.jpg"
tags: ["MDR", "UPI", "Merchant Tips", "Reference"]
---

On 15 September 2026 the Finance Ministry published the UPI merchant-fee framework that takes effect on **15 October 2026**. Social posts called it a UPI tax. The ministry’s own line is the opposite: **MDR is not a tax and is not collected by the government or NPCI**. It is a merchant discount rate paid to banks and app providers so the rails stay funded.

This page is the merchant version of that FAQ: who still pays nothing, who pays 0.4%, when the ₹300 cap hits, how GST sits on top, and a [free calculator](/upi-mdr-calculator/) that runs the arithmetic in paise.

*Last reviewed 16 September 2026. Re-check closer to 15 October — acquiring banks still have to wire this into settlement.*

## The one-screen version

| Flow | From 15 Oct 2026 |
| --- | --- |
| Person-to-person, any amount | Free |
| P2M of **₹2,000 or less** | Free |
| Small QR merchant, **up to ₹1 lakh/month** (P2PM) | Free |
| Other P2M above ₹2,000 | **0.4%**, capped at **₹300** once the bill is ₹75,000 or more |
| Rail, telecom, insurance, fuel, agri inputs, above ₹2,000 | **Flat ₹5** |
| Mutual funds / securities / stockbrokers | **0.02%**, cap ₹300 |
| Customer | Cannot be charged. Apps cannot add a platform fee |

The ministry’s figure: **about 96% of P2M transactions stay outside MDR**, because they are under ₹2,000 or sit in the small-merchant zero-MDR net.

## It is MDR, not a UPI tax

MDR is the slice a payment network takes from the merchant. Cards have always had it. Bank-to-bank UPI has been at 0% for P2M since January 2020, which is why a printed QR beat a POS machine for kirana margins.

That zero-MDR regime is what changes on 15 October — **only for specified merchant payments above ₹2,000**. The money is meant to be shared among banks, payment service providers and UPI apps. A reported fifth of the pool is earmarked for small-merchant expansion. None of that is a Union tax head.

GST is a separate layer. Tax experts quoted after the announcement said **18% GST applies on the MDR**, and a GST-registered merchant can usually **claim ITC** on that GST. Unregistered shops bear MDR + GST as a cost.

Run the numbers: [UPI MDR calculator](/upi-mdr-calculator/).

## Worked examples (standard P2M, not small-merchant exempt)

These match the figures used in the ministry briefing and national coverage:

| Customer pays | MDR @ 0.4% | GST @ 18% on MDR | Net cost if you can claim ITC |
| --- | --- | --- | --- |
| ₹1,500 | ₹0 | ₹0 | ₹0 |
| ₹3,000 | ₹12 | ₹2.16 | ₹12 |
| ₹5,000 | ₹20 | ₹3.60 | ₹20 |
| ₹50,000 | ₹200 | ₹36 | ₹200 |
| ₹75,000 | ₹300 (cap) | ₹54 | ₹300 |
| ₹1,00,000 | ₹300 (not ₹400) | ₹54 | ₹300 |

Essential-sector example: a ₹4,000 fuel payment is **₹5**, not ₹16.

## Who is actually exempt

**1. Every P2P transfer.** Splitting rent with a roommate, sending money home, paying a friend back — free at ₹200 or ₹2 lakh, same as today. Use the [split bill calculator](/split-bill-calculator/) if you want per-person QR links; those are P2P.

**2. Merchant bills of ₹2,000 or less.** Tea, groceries, medicines, a salon trim. This is most QR scans by *count*.

**3. Small QR merchants up to ₹1 lakh a month.** Street vendors and neighbourhood shops collecting through UPI QR into their account, classified under the P2PM / small-merchant framework, stay at zero MDR. If your monthly UPI is ₹80,000, the calculator should show ₹0 even when a few bills cross ₹2,000.

BBC, citing the government, also reported that **QR collections in rural and semi-urban areas stay outside MDR**. Treat that as a location carve-out to confirm with your acquiring bank — it is not something this site can see from a VPA.

## What you must not do

- **Do not add 0.4% on the customer’s bill.** The framework says merchants bear MDR and must not pass it through as a UPI surcharge.
- **Do not switch a ₹2,100 sale to cash just to dodge ₹8.40.** The fee is smaller than a typical gateway, and cash still has counting, theft, and deposit cost. If you do still count a drawer, the [day-close till](/cash-denomination-calculator/) now tracks cash vs UPI vs card.
- **Do not confuse this with RuPay credit-card-on-UPI.** That product already had interchange on some tickets above ₹2,000. See [RuPay CC UPI MDR](/blog/rupay-credit-card-upi-mdr-charges/). The October 2026 0.4% is for ordinary bank-funded P2M.

## Still cheaper than a payment gateway

A domestic gateway is still roughly **2% + 18% GST = 2.36%** on cards. On a ₹50,000 ticket that is ₹1,180 versus **₹200** UPI MDR (₹236 including GST if you cannot claim ITC). Direct UPI remains the cheap rail. What died on 15 October is the claim that *every* merchant UPI scan is ₹0.

The older [UPI vs gateway savings calculator](/upi-calculator/) now points here for the October schedule. Use both: one for “what does UPI cost now”, one for “what would Razorpay have taken”.

## What to do this week

1. Sketch last month’s UPI: total value, and how much of that value sat on bills above ₹2,000. Paste it into the [MDR calculator](/upi-mdr-calculator/).
2. If you are under ₹1 lakh/month on QR, keep the small-merchant box ticked and stop worrying.
3. If you are a salon, clinic, electronics counter or wholesaler with fat tickets, price 0.4% into *your* margin — not as a line item on the customer bill.
4. GST-registered? Ask your CA to map ITC on MDR invoices from the acquiring bank. The fee will show up in settlement reports, not in the UPI app chat.
5. Reprint nothing. MDR is a settlement rule. Your [printed QR](/) does not change.

P2M vs P2P background: [P2M meaning in banking](/blog/p2m-meaning-in-banking-upi/). Glossary: [MDR](/glossary/mdr/).

<h2 id="faq">Frequently asked questions</h2>

### Q1. Is UPI still free for customers?

Yes. The payer does not pay MDR, and apps are barred from adding a UPI platform fee. Person-to-person stays free at any amount.

### Q2. Does a ₹2,000 payment attract 0.4%?

No. The threshold is **above** ₹2,000. ₹2,000 even is free. ₹2,001 on a regular merchant QR is where 0.4% starts, unless a small-merchant or sector carve-out applies.

### Q3. I collect ₹90,000 a month on a kirana QR. Do I pay?

Under the small-merchant QR exemption (up to ₹1 lakh a month) you should stay at zero MDR. Confirm with the app or bank that tagged your VPA as P2PM / small merchant. The calculator’s exemption toggle models this.

### Q4. Will PhonePe or GPay deduct this from each scan?

Acquiring banks and PSPs settle MDR. You will see it as a deduction or invoice in merchant settlement, not as a second PIN on the customer’s phone. Exact posting (per transaction vs monthly) is up to the bank — check the October circular they send you.

### Q5. Can I refuse UPI above ₹2,000 and take cash?

Some retailers will try. It is legal to prefer cash. It is also how you lose the customer who has no notes, and you still have to count the drawer. The fee on a ₹3,000 scan is ₹12.

**[Estimate your MDR →](/upi-mdr-calculator/)** · **[Print a shop QR →](/)**
