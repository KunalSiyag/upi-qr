---
title: "पेमेंट रिमाइंडर मैसेज कैसे लिखें (टेम्पलेट + टाइमिंग)"
description: "ओवरड्यू इनवॉइस के लिए विनम्र पेमेंट रिमाइंडर टेम्पलेट — WhatsApp, SMS और email के लिए day-1 से day-30 तक की escalation ladder, UPI ID के साथ।"
pubDate: 2026-08-19
author: "Kunal Siyag"
tags: ["बिलिंग", "इनवॉइस", "मर्चेंट टिप्स", "गाइड"]
---

पैसा मांगना कोई को अच्छा नहीं लगता। फ्रीलांसर टालते हैं कहीं रिश्ता खराब न हो जाए, दुकानदार टालते हैं "आते-आते दे देगा" सोचकर। इस बीच इनवॉइस पुरानी होती जाती है और बात करना मुश्किल होता जाता है।

समाधान गुस्सा नहीं — **व्यवस्थित, विनम्र escalation** है। इस गाइड में exact मैसेज, भेजने के दिन, और WhatsApp/SMS/email का etiquette दिया है।

## रिमाइंडर काम क्यों करता है

1. **भुगतान आसान बनाएं।** अकाउंट डिटेल खोजना, ऐप खोलना, अमाउंट टाइप करना — हर रुकावट टालने का बहाना है। अपनी UPI ID साथ भेजें तो settlement पंद्रह सेकंड का काम।
2. **शुरुआत में सकारात्मक रहें।** ज़्यादातर late payment लापरवाही है, चोरी नहीं। पहला नरम रिमाइंडर रिश्ता *और* रकम दोनों बचाता है।
3. **अनुमानित बनें।** क्लाइंट तुरंत समझ जाता है कि कौन vendor day-1 पर follow-up करता है और कौन कभी नहीं।

## Escalation ladder

| दिन | Tone | मकसद |
|---|---|---|
| Due date | दोस्ताना nudge | ईमानदार चूक पकड़ें |
| +7 | प्रोफेशनल रिमाइंडर | लिखित रिकॉर्ड, हल्की urgency |
| +14 | सख्त follow-up | "overdue" साफ कहें; plan ऑफर करें |
| +30 | Final notice | परिणाम और अगले कदम बताएं |
| +45+ | Handover | Legal notice / service pause |

सीधे सख्त भाषा पर मत जाएं — ladder दोनों तरफ़ा सुरक्षा है।

## Template 1 — दोस्ताना nudge

> Hi {ग्राहक}! 👋 उम्मीद है ठीक हैं।
>
> बस एक छोटी-सी याद — invoice *INV-0042* की *₹18,500* आज due थी।
> अगर payment हो गई है तो इस मैसेज को ignore करें। 🙏
>
> *UPI से तुरंत भेजें:* yourname@upi
>
> धन्यवाद!
> — प्रिया, Studio Kaya

## Template 2 — प्रोफेशनल (+7 दिन)

> {ग्राहक} जी,
>
> विनम्र स्मरण है कि invoice *INV-0042* (₹18,500) जो 12 अगस्त को due थी, हमारे records में pending है।
>
> कृपया शीघ्र उपयुक्त payment arrange कर दें।
> *UPI:* yourname@upi
>
> यदि भुगतान हो चुका है तो इसे ignore करें। आपके सहयोग के लिए धन्यवाद।
> — Accounts Team, Studio Kaya

## Template 3 — सख्त (+14 दिन)

> {ग्राहक} जी,
>
> Invoice *INV-0042* (₹18,500), जो 12 अगस्त को due थी, अब 14 दिन overdue है — पिछले रिमाइंडर के बावजूद।
>
> हम association जारी रखना चाहते हैं। Cash flow की दिक्कत हो तो इसी हफ्ते part-payment schedule पर बात कर सकते हैं, वरना कृपया शुक्रवार तक बकाया clear कर दें।
> *UPI:* yourname@upi
>
> सादर,
> — Accounts Team

## Template 4 — Final notice (+30 दिन)

> {ग्राहक} जी,
>
> {तारीख} और {तारीख} के रिमाइंडर के बावजूद invoice INV-0042 (₹18,500) 30+ दिन से unpaid है।
>
> 7 दिन में राशि न मिलने पर हमें services/deliveries रोकनी पड़ सकती हैं और मामला agreed terms के अनुसार legal advisor को देना पड़ सकता है।
>
> उम्मीद है आज ही amicable settlement होगा।
> *UPI:* yourname@upi

यह message email पर भेजें — delivery trail काम आती है। पुराने रिमाइंडर की dates जरूर mention करें।

## Channel etiquette

- **WhatsApp:** freelancers/dukan ke liye default। ~120 शब्दों के अंदर; सिर्फ invoice number और amount bold करें।
- **SMS:** kirana-level trade के लिए। formatting नहीं बचती — invoice, amount, UPI ID सबसे पहले।
- **Email:** corporates और firm-stage के लिए। Invoice PDF attach करें।

[पेमेंट रिमाइंडर जनरेटर](/hi/payment-reminder-generator/) तीनों channels के लिए एक ही form से message बनाता है — overdue days अपने आप गिनते हैं और WhatsApp/SMS पर pre-filled भेजते हैं।

## "कैसे भुगतान करें" हमेशा साथ रखें

1. **Embedded QR वाली invoice** — [इनवॉइस जनरेटर](/hi/invoice-generator/) से बनी PDF खुद payable होती है।
2. **Plain UPI ID line** — `UPI: yourname@upi`
3. **Payment link** — बड़े clients के लिए।

भुगतान आते ही loop बंद करें: [PAID स्टैम्प वाली रसीद](/hi/receipt-generator/) भेजें जिसमें invoice number हो। ऐसे vendors से क्लाइंट अगली बार जल्दी pay करते हैं।

## गलतियाँ जो reminder को बेअसर करती हैं

- **अधूरी रकम।** "जल्दी clear कर दें" = अनंत delay। नंबर anchor बनाते हैं।
- **Reminder storm।** तीन दिन में पांच मैसेज desperation दिखाता है।
- **मांगने के लिए माफी।** आपने value deliver की है — request legitimate है।
- **Deadline कहीं नहीं।** ऊपर के हर template में तारीख है, यही वजह है।
- **पुरानी dues + नया काम साथ।** Firm stage पर नया काम settlement तक रोकें।

## Record keeping

हर भेजा reminder timestamp के साथ save करें। Legal situation में साफ sequence — invoice → dated nudges → final notice — ही आपका बचाव है।

## आगे पढ़ें

- [कोटेशन vs इनवॉइस vs रसीद](/blog/quotation-vs-estimate-vs-invoice-vs-receipt/)
- [फ्रीलांसर invoices के लिए UPI QR](/blog/upi-qr-for-freelancers-invoice-payments/)
- [Fixed amount वाला UPI QR](/blog/how-to-generate-upi-qr-with-amount/)
