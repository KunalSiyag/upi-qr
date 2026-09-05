---
title: "कोटेशन vs इस्टिमेट vs इनवॉइस vs रसीद — कब कौन-सा?"
description: "चारों बिज़नेस डॉक्युमेंट्स का फर्क सीधी भाषा में — GST नियम, नंबरिंग convention, काम करता उदाहरण और हर एक के लिए मुफ्त जनरेटर।"
pubDate: 2026-08-20
author: "Kunal Siyag"
tags: ["बिलिंग", "इनवॉइस", "GST", "गाइड"]
---

पहली बार बिज़नेस शुरू करने वाले से पूछें "क्लाइंट को क्या भेजते हो?", जवाब होगा "invoice"। दोबारा पूछें तो पता चलेगा कि वे असल में WhatsApp पर price list, estimate का screenshot, या invoice के बाद *कुछ ही* भेज रहे हैं।

रिश्ते के हर stage का अपना सही दस्तावेज़ है। सही document सही जगह — यही professional दिखने, GST records साफ रखने और पैसा तेज़ आने का राज़ है।

## 30 सेकंड का जवाब

| डॉक्युमेंट | कब | Legal? | Payment मांगता है? | Proof देता है? |
|---|---|---|---|---|
| **कोटेशन** | सहमति से पहले | Offer (accept हुआ तो binding) | नहीं | नहीं |
| **इस्टिमेट** | सहमति से पहले | नहीं | नहीं | नहीं |
| **इनवॉइस** | delivery/सहमति के बाद | हाँ — payment obligation | हाँ | नहीं |
| **रसीद** | payment के बाद | Acknowledgement | नहीं | **हाँ** |

Flow हमेशा एक जैसा: **Quote → deliver → Invoice → Receipt**

## कोटेशन: formal offer

कोटेशन defined scope के लिए fixed-price offer है। ताकत उसकी specificity में है: exact items, quantity, rate, tax और validity date।

Professional कोटेशन में होना चाहिए:

- Unique नंबर (**QTN-0001**) जिससे आगे reference हो
- Lump sum नहीं — itemised lines
- साफ tax treatment ("GST @18% extra" या "inclusive")
- **Validity date** — 15–30 दिन common; material-heavy quotes छोटी
- Terms: advance %, timeline, क्या शामिल *नहीं* है

Validity date आपको raw-material उछाल और "9 महीने बाद पुराने rate" दोनों से बचाती है। [कोटेशन जनरेटर](/hi/quotation-generator/) validity prominently छापता है और UPI QR embed कर सकता है ताकि client token advance से तुरंत confirm करे।

## इस्टिमेट: ईमानदार भाई

इस्टिमेट कोटेशन जैसा दिखता है पर *"approximate"* कहता है। जब scope uncertain हो — repairs, bespoke काम — तब इस्तेमाल करें। दो नियम:

1. हर variable line के पीछे की assumption लिखें ("standard putty work मानकर ₹12/sq ft")।
2. Reality भटकते ही जल्दी बताएं। Estimate से 40% ऊपर final bill — disputes की जड़।

## इनवॉइस: debt बनाने वाला दस्तावेज़

Invoice official करता है। India में GST **tax invoice** के mandatory elements:

- आपका नाम, पता और **GSTIN**
- **Consecutive serial number** (वित्तीय वर्ष के लिए unique)
- Issue date
- Recipient details (registered हो तो उनका GSTIN)
- Description, quantity, value
- Tax amount + rate
- Place of supply और signature

Numbering discipline जान-लें: INV-2026-001 → 002, no gaps। बीच में reset/skip auditors के सवाल बुलाता है। Intra-state पर CGST+SGST split, inter-state पर IGST। GST-registered नहीं हैं तो **bill of supply** issue होगा, GST charge नहीं कर सकते।

[इनवॉइस PDF जनरेटर](/hi/invoice-generator/) compliant invoices बनाता है जिसमें scan-and-pay UPI QR embedded होता है — client का accountant और client का phone, दोनों एक PDF से खुश।

## रसीद: loop बंद करने वाला proof

Receipt अकेला दस्तावेज़ है जो साबित करता है कि पैसा *वाकई* आया। इसमें होता है: amount, date, mode (cash/UPI/bank), reference number, और किस invoice के खिलाफ।

ज़्यादातर ज़रूरतें तीन रसीदों से पूरी:

- **Payment receipt** — business use; advances/part-settlements के लिए [PAID-stamped receipt](/hi/receipt-generator/)
- **किराया रसीद** — HRA format; विस्तार [किराया रसीद फॉर्मेट गाइड](/hi/blog/rent-receipt-format-hra-exemption-india/) में
- **Acknowledgement slip** — deliveries/documents के लिए

Payment आते ही receipt दें, month-end पर नहीं — instant receipt भेजने वाले business पर dispute की जगह ही नहीं बचती।

## आम mixing mistakes

1. **काम शुरू होने के बाद कोटेशन भेजना** — तब invoice होना चाहिए।
2. **Estimate पर "quotation" लिखना** — client quoted price को promise मानता है।
3. **बिना invoice के सिर्फ UPI request** — collect request purchase का proof नहीं।
4. **Invoice के बाद कोई receipt नहीं** — "मैंने भर दिया था" possible बन जाता है।
5. **Years के बीच बिना prefix numbering** — filing में confusion।

## एक काम का उदाहरण

आप design studio हैं। Café owner branding मांगती है।

1. **QTN-0031** भेजी: logo, menu, signage — ₹45,000 + 18% GST, valid till 30 Sep, 50% advance।
2. Approve; ₹22,500 advance आया। **RCPT-0117** issue की।
3. तीन हफ्तों में काम पूरा। **INV-2026-058**: full ₹53,100, advance adjusted, balance 7 दिन में।
4. Embedded QR से balance आया; instant **RCPT-0118** ने settle mark किया।

चार documents, चार unambiguous moments, और बाद में WhatsApp archaeology zero।

## Related reading

- [पेमेंट रिमाइंडर मैसेज टेम्पलेट](/blog/how-to-write-payment-reminder-message-overdue-invoice/)
- [किराया रसीद फॉर्मेट (HRA)](/hi/blog/rent-receipt-format-hra-exemption-india/)
- [फ्रीलांसर invoices के लिए UPI QR](/blog/upi-qr-for-freelancers-invoice-payments/)
