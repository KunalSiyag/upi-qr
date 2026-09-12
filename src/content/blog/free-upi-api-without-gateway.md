---
title: "Free UPI API Without a Payment Gateway"
description: "Build UPI payments with the free upi://pay URI — no Razorpay KYC. What NPCI APIs actually require, and how to embed a QR or payment link on a website."
pubDate: 2026-09-13
author: "Kunal Siyag"
reviewedOn: 2026-09-13
reviewIntervalDays: 180
testedApplications: ["PhonePe", "Google Pay", "Paytm", "BHIM"]
sourceUrls:
  - label: "NPCI — About UPI"
    url: "https://www.npci.org.in/product/upi/about-upi"
image: "/images/blog/free-upi-api-developer-desk.jpg"
tags: ["Developers", "Tutorial", "Universal QR"]
---

**UPI API free** usually means a developer who wants collect-and-callback like Razorpay, without KYC or MDR. That API is not public. NPCI’s switch APIs are for banks and PSPs. What *is* free is the **intent URI** every UPI app already understands:

```text
upi://pay?pa=shop@oksbi&pn=ShopName&am=450&cu=INR&tn=INV-405
```

Put that in a link, a QR, or an embed. The payer’s app opens, they enter the PIN, money hits the VPA. You do not get a signed webhook unless you add your own checkout layer.

*Last reviewed 13 September 2026.*

## Three layers people confuse

| Layer | Who can use it | Settlement / callback |
| --- | --- | --- |
| `upi://pay` URI + QR | Anyone with a VPA | Bank SMS / UTR — you reconcile |
| This site’s [developer embed](/developer/) | Websites that want a widget or hosted checkout | Optional signed payment-response for checkout sessions |
| NPCI / PSP UPI APIs | Banks, TPAPs, licensed aggregators | Full collect, refund, complaint APIs |
| Gateway UPI (Razorpay, Cashfree, …) | Merchants after KYC | Webhooks, refunds, dashboard — paid |

A GitHub gist titled “free UPI API” that returns `success: true` without talking to a bank is a toy. Do not trust it with a customer’s money.

## Use the free URI on a site or invoice

1. Build the query string. `pa` and `pn` are mandatory. `am` locks the amount. `cu=INR`.
2. Render it as a QR (homepage [generator](/), [bulk CSV](/bulk-qr/), or your own `qrcode` library).
3. On mobile, a tap can open `upi://pay?…` directly. On desktop, show the QR.
4. Never paste the raw URI into WhatsApp as the only payload — share the PNG. See [WhatsApp payment links](/blog/how-to-create-whatsapp-payment-link-upi/).
5. HTML walkthrough: [integrate UPI QR in a website](/blog/integrate-upi-qr-code-html-website/).

For amount-locked invoices, read [UPI QR with amount](/blog/how-to-generate-upi-qr-with-amount/).

## When you actually need a gateway

Use a licensed aggregator when you need auto-refunds, subscription Autopay at scale, or a server-side “paid / failed” flag without asking the customer for a UTR. Compare cost on the [UPI vs gateway](/blog/upi-qr-code-vs-payment-gateway/) guide and the [MDR calculator](/upi-calculator/).

Pro UPI QR’s [developer portal](/developer/) exposes embeds, native payment links, and optional authenticated checkout sessions — still not NPCI’s switch API.

<h2 id="faq">Frequently asked questions</h2>

### Q1. Is there a free official UPI API?

Not for random websites. NPCI APIs sit behind banks and PSPs. The free surface is the published `upi://pay` intent.

### Q2. Can I verify a payment without a gateway?

Match amount + 12-digit UTR from the payer against bank SMS, or use a labelled checkout session if you enable that product. There is no public NPCI “lookup this UTR” API for apps.

### Q3. Does embedding a UPI QR require KYC?

Encoding your own VPA does not. Official merchant dashboards, soundboxes, and gateway collects do.

### Q4. Is a payment link the same as a QR?

Same URI. QR is the matrix; the link is the string. Generate either with the [UPI link generator](/upi-link-generator/).

**[Open the developer portal →](/developer/)**

Related: [Static vs dynamic UPI QR](/blog/static-vs-dynamic-upi-qr-code-difference/) · [HTML website QR](/blog/integrate-upi-qr-code-html-website/) · [UPI payment link](/upi-link-generator/)
