---
title: "स्टैटिक बनाम डायनामिक UPI QR — फर्क और कब कौन-सा"
description: "स्टैटिक और डायनामिक UPI QR code में फर्क समझें — amount lock, note field, reconciliation और error rate की पूरी तुलना। दुकान और billing के लिए सही QR चुनें।"
pubDate: 2026-06-12
author: "Kunal Siyag"
tags: ["गाइड", "डायनामिक QR", "मर्चेंट टिप्स"]
---

दुकानदार, freelancers और developers UPI payment setup करते समय "static QR" और "dynamic QR" शब्द सुनते हैं। दोनों एक ही NPCI `upi://pay` protocol use करते हैं, लेकिन checkout पर behavior में ज़मीन-आसमान का फर्क है, और दोनों के business use-case अलग हैं।

इस गाइड में plain language में फर्क, side-by-side comparison, और आपके workflow के लिए सही format चुनने का तरीका — तीनों समझेंगे।

---

## Static UPI QR Code क्या है?

**Static UPI QR** permanent, reusable QR है जिसमें सिर्फ आपकी basic payment address encode होती है — VPA (UPI ID) और display name.

Customer static QR scan करे तो:
1. Payment app recipient VPA और name पढ़ता है
2. Customer के सामने open input screen आता है
3. Customer **खुद amount type करता है** (जैसे ₹250) और pay tap करता है
4. चाहे तो note भी लिख सकता है

### Technical payload example:
`upi://pay?pa=shopname@okaxis&pn=Shop%20Name&cu=INR`

**कहां best:** retail counter standees, street vendors, donation boxes, tip jars, छोटी services (salon, tailor) — जहाँ हर transaction का bill अलग होता है।

[Static counter QR यहाँ बनाएं →](/hi/)

---

## Dynamic UPI QR Code क्या है?

**Dynamic UPI QR** static structure पर preset transaction amount और अक्सर unique reference note embed करता है।

Customer dynamic QR scan करे तो:
1. App VPA, name, **amount** और note पढ़ता है
2. Amount pre-filled और locked होता है (edit नहीं हो सकता)
3. Customer सिर्फ screen review करके UPI PIN डालता है

### Technical payload example:
`upi://pay?pa=shopname@okaxis&pn=Shop%20Name&am=499&cu=INR&tn=Order%20142`

**कहां best:** e-commerce checkout, event tickets, monthly subscriptions, PDF invoices, delivery riders — जहाँ हर payment का exact amount तय है।

[Amount वाला QR बनाना सीखें →](/blog/how-to-generate-upi-qr-with-amount/)

---

## Side-by-side तुलना

| Factor | Static QR | Dynamic QR |
|---|---|---|
| **Amount field** | खाली (customer भरता है) | Pre-defined और locked |
| **Transaction note** | Optional/open | Custom (Order ID वगैरह) |
| **Reconciliation** | मुश्किल (random amounts match करना) | आसान (amount + unique note = order) |
| **Print longevity** | एक बार print, हमेशा | अक्सर per-invoice print/screen |
| **Error rate** | ज़्यादा (typing mistakes) | **0% (exact amount)** |
| **Setup cost** | 100% free | 100% free (API छोड़कर) |

---

## कौन-सा कब चुनें?

**Static चुनें अगर:**
- Counter पर walk-in customers हैं और bill हर बार अलग है
- Donation box / tip jar है
- Print एक बार करके सालों चलाना है
- Reconciliation simple cash-book level पर चलता है

**Dynamic चुनें अगर:**
- Exact amount जरूरी है (invoices, bookings, subscriptions)
- Order ID से payment match करना है
- Typing mistakes से wrong payments रोकने हैं
- Rider/delivery collection exact चाहिए

---

## Common misconception सुधारें

**"Dynamic QR के लिए bank/agency चाहिए।"** गलत। NPCI standard `am` parameter किसी भी valid VPA के साथ काम करता है। [Free generator](/hi/invoice-generator/) से invoice में dynamic-style QR embed होता है, zero fees।

**"Static QR unsafe है।"** Format उतना ही safe है जितना dynamic — risk tampering का है (sticker swap), जिसका इलाज physical security है: [QR tampering frauds रोकें](/blog/prevent-upi-qr-code-tampering-frauds/) और [display से पहले verify](/blog/how-to-verify-upi-qr-code-before-displaying/) करें।

**"एक QR से दोनों काम।"** व्यवहार में merchants दोनों रखते हैं: counter पर permanent static standee + bills/receipts पर per-transaction dynamic QR।

---

## Quick decision checklist

1. Bill हर बार अलग? → **Static**
2. Exact amount lock चाहिए? → **Dynamic**
3. Payment को order से match करना? → **Dynamic (note field)**
4. एक print सालों चले? → **Static**
5. Invoice/PDF के अंदर QR? → **Dynamic**

## Related reading

- [UPI QR size & print dimensions guide](/blog/upi-qr-code-size-dimensions-printing-guide/)
- [Fixed amount वाला UPI QR generate करें](/blog/how-to-generate-upi-qr-with-amount/)
- [Bulk CSV से QR batch generation](/blog/how-to-generate-bulk-upi-qr-codes-from-csv/)
