---
title: "UPI QR स्कैन नहीं हो रहा? दुकानदारों के लिए 10 आसान उपाय"
description: "धुंधली print, glare, गलत VPA, app errors और counter placement की समस्याएँ — जब ग्राहक आपका UPI QR scan नहीं कर पाएं तो यह checklist follow करें।"
pubDate: 2026-06-16
author: "Kunal Siyag"
tags: ["Troubleshooting", "मर्चेंट टिप्स", "गाइड"]
---

जब customer कहता है "QR काम नहीं कर रहा", problem अक्सर physical print quality या lighting की होती है — UPI की नहीं। इस list को सबसे तेज़ fix से full reprint तक follow करें।

---

## Quick fixes (पहले ये try करें)

1. **Standee पोंछें** — grease और fingerprints camera block करते हैं।
2. **Ceiling LED से tilt करें** — glossy laminate की glare #1 scan killer है। Matte laminate use करें।
3. **Phone brightness बढ़वाएं** — customer से screen brightness बढ़ा कहें (उनका camera help होता है)।
4. **दूसरा app try करें** — [Google Pay](/google-pay-qr-generator/), [PhonePe](/phonepe-qr-generator/) और [Paytm](/paytm-qr-generator/) तीनों से test करें।
5. **Standee पास लाएं** — QR 2 cm से छोटा है तो counter के पार से scan नहीं होगा।

---

## Print और size problems

| Symptom | Likely cause | Fix |
| :--- | :--- | :--- |
| Screen पर चलता है, paper पर नहीं | Low DPI print | [Pro UPI QR](/hi/) से PNG को 300 DPI पर reprint करें |
| पास में चलता है, दूर से नहीं | QR too small | [Size dimensions guide](/blog/upi-qr-code-size-dimensions-printing-guide/) देखें |
| Partial spin, open नहीं होता | Damaged/creased QR | Card replace करें |
| सुबह चलता है, दोपहर में नहीं | Gloss laminate glare | Matte laminate या acrylic tent |

---

## Data और app problems

* **Invalid VPA:** QR में गलत UPI ID encode है — bank-confirmed VPA से फिर से generate करें। Display से पहले [QR verify](/blog/how-to-verify-upi-qr-code-before-displaying/) करने की आदत डालें — [UPI QR decoder](/upi-qr-decoder/) से पांच सेकंड में payee VPA पढ़ सकते हैं।
* **Amount too long:** बहुत बड़े `am` values या `tn` में special characters कुछ पुराने apps break करते हैं — note field simple रखें।
* **Pending payments:** Scan के बाद payment hang हो तो [UPI pending transactions resolve करने की गाइड](/blog/how-to-resolve-upi-pending-transaction-issues/) देखें।
* **Customer का पुराना app:** GPay/PhonePe update करने को कहें।

---

## Counter placement tips

* QR **chest height** पर रखें, customer की ओर face करता हुआ।
* QR के ठीक पीछे glass reflections से बचें।
* Outdoor stalls के लिए [waterproof sticker guidance](/blog/how-to-print-durable-waterproof-qr-stickers/) follow करें।
* Night market में standee पर छोटा LED लगाएं — QR surface पर नहीं।

---

## Reprint कब जरूरी है?

अगर:
1. Print धुंधला/pixelated है (zoom करके modules check करें),
2. QR creased, torn या faded है,
3. VPA change हुआ है,

तो patch-up मत करें — fresh high-resolution PNG से reprint करें। [Pro UPI QR generator](/hi/) से download की गई file standard print sizes पर crisp आती है।

## Related reading

- [स्टैटिक बनाम डायनामिक UPI QR](/hi/blog/static-vs-dynamic-upi-qr-code-difference/)
- [QR sticker sheets print करें](/blog/printable-upi-qr-sticker-sheet-guide/)
- [UPI QR tampering frauds से बचाव](/blog/prevent-upi-qr-code-tampering-frauds/)
