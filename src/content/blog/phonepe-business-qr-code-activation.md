---
title: "How to Activate and Get a PhonePe Business QR Code"
description: "Activate PhonePe Business QR: KYC, virtual vs physical standee, free ordering, and how an official merchant QR differs from a compatible UPI QR."
pubDate: 2026-06-09
updatedDate: 2026-08-27
author: "Kunal Siyag"
reviewedOn: 2026-08-27
reviewIntervalDays: 180
testedApplications: ["PhonePe", "PhonePe Business", "Google Pay"]
sourceUrls:
  - label: "PhonePe Business on Google Play"
    url: "https://play.google.com/store/apps/details?id=com.phonepe.app.business"
  - label: "PhonePe merchant profiling guidelines (PDF)"
    url: "https://www.phonepe.com/apollo/pdf/Merchant_Profiling_Guidelines.pdf"
  - label: "PhonePe: set up UPI for business"
    url: "https://business.phonepe.com/articles/upi-for-business-how-to-set-up-accept-payments-and-grow-collections"
image: "/images/blog/phonepe-business-qr-activation.jpg"
tags: ["PhonePe", "Merchant Setup", "Business"]
---

Download the **PhonePe Business** app, verify the shop mobile number, enter business and bank details, and complete PAN KYC. A virtual merchant QR appears in the app once KYC clears. PhonePe Support states QR activation is free; stickers can be ordered in-app. A QR printed on Pro UPI QR uses the same VPA and works in PhonePe, but it is not PhonePe’s official merchant kit.

*Last reviewed 27 August 2026. Confirm current labels and schemes inside the app — PhonePe changes menus without a public changelog.*


<h2 id="official-vs-compatible">Official PhonePe QR vs a compatible UPI QR</h2>

These two things are easy to mix up, and they should not compete in search results as if they were the same product.

| | Official PhonePe Business QR | Compatible UPI QR from this site |
| --- | --- | --- |
| How you get it | After KYC inside [PhonePe Business](https://play.google.com/store/apps/details?id=com.phonepe.app.business) | Paste your existing VPA into the [PhonePe QR generator](/phonepe-qr-generator/) |
| What it encodes | Your PhonePe merchant VPA (often `@ybl`, `@ibl`, or `@axl`) | The same `upi://pay` VPA you type |
| Who can pay | Any UPI app — UPI is interoperable | Any UPI app |
| Dashboard, staff logins, settlements | Yes, in PhonePe Business | No — look at your bank SMS / passbook |
| Soundbox pairing | PhonePe SmartSpeaker programmes | Not paired; use [in-app voice alerts](/blog/setup-soundbox-announcements-for-shop-free/) or a provider box |
| Design control | PhonePe-branded kit if you order from them | You choose size, template, and reprint |

If you want PhonePe’s settlement dashboard and official standee, complete Business KYC. If you already have a working VPA and only need a clean counter print today, generate a compatible poster and test-scan it.

**[Create a PhonePe-compatible QR standee →](/phonepe-qr-generator/)**

<h2 id="virtual-vs-physical">Virtual QR vs physical standee</h2>

<figure>
  <img src="/images/blog/phonepe-virtual-qr-on-phone.jpg" alt="Shopkeeper holding a phone that displays a generic collect QR code at a kirana counter" width="1200" height="630" loading="lazy" />
  <figcaption>Virtual QR: show the phone. Physical QR: print a standee so the phone can stay in a drawer.</figcaption>
</figure>

**Virtual QR** is the code PhonePe shows in the Business app as soon as the merchant profile is live. Use it to collect while you wait for print, on a delivery run, or as a backup when the standee is damaged.

**Physical QR** is a sticker or acrylic standee that stays on the counter. PhonePe’s Play Store listing says you can order free QR stickers for delivery. You can also print the same VPA yourself in minutes.

| | Virtual (in-app) | Physical (sticker / standee) |
| --- | --- | --- |
| Available | After KYC | After you order or print |
| Best for | Testing, temporary counters, riders | Fixed billing desk |
| Failure mode | Dead phone, stolen phone, dim screen | Sticker swap, glare, faded ink |

Keep one of each. If someone pastes a fake sticker over your standee, the virtual QR on *your* phone is the check.

<h2 id="register-phonepe-business">Register and activate PhonePe Business</h2>

Menu names move between app versions. The sequence does not.

1. Install **PhonePe Business** from Google Play or the App Store — not the consumer PhonePe app, and not an APK from a sales agent.
2. Enter the **mobile number** that should own the merchant profile. Verify the OTP. Prefer the number already linked to the settlement bank account.
3. Enter **business name**, category, and address as they should appear to customers.
4. Link the **savings or current account** that should receive settlements. Keep the account number and IFSC ready. A cancelled cheque or bank app screenshot helps if the app asks for proof.
5. Complete **KYC** (PAN is the usual first gate; Aadhaar is commonly used for identity and address). PhonePe will try the Central KYC registry (CKYCR) before asking for extra papers.
6. When the profile is active, open the QR section and **test-scan with a second phone**. Confirm the payee name. Send ₹1 to yourself if you have a second VPA, or ask a colleague.

Shop-front agents who demand cash to “activate the QR” are not following PhonePe’s published position. In July 2026 PhonePe Support stated there are **no charges or fees for activating the PhonePe Business QR code**.

<h2 id="kyc-documents">KYC documents by entity type</h2>

What the in-app flow asks a kirana owner is shorter than what PhonePe’s merchant-profiling PDF requires for companies. Use the table as a packing list, then follow whatever the app actually requests.

| Entity | Typical documents | Notes |
| --- | --- | --- |
| **Sole proprietor / shop** | PAN (or Form 60), Aadhaar or other officially valid address proof, bank account | GST or Udyam is **not** mandatory below the GST threshold. Two business proofs (Udyam, Shop Act licence, GSTIN, utility bill) may be asked if CKYCR is empty. |
| **Partnership / LLP / company** | Entity PAN, certificate of incorporation / partnership deed, GST if registered, bank proof in the entity name, PAN/Aadhaar of authorised signatories, beneficial-owner details | PhonePe’s profiling guidelines follow RBI beneficial-owner thresholds (over 10% for companies/LLPs). Video KYC (V-CIP) or face-to-face CDD may apply. |
| **Trust / society** | Registration certificate, PAN, bank proof, authorised signatory KYC | Donation desks should print the trust’s legal name as payee. |

GST registration is a tax question, not a UPI question. You can accept UPI below the GST threshold; crossing it is a separate compliance job.

Source: [PhonePe Merchant Profiling Guidelines (PDF)](https://www.phonepe.com/apollo/pdf/Merchant_Profiling_Guidelines.pdf).

<h2 id="order-physical-standee">Order, track, replace a physical PhonePe QR</h2>

Once the digital profile is live:

1. Open PhonePe Business and look for **QR codes / Manage QR** (wording varies).
2. Choose **request standee** or **order stickers**. The Play Store listing for PhonePe Business (reviewed July 2026) says merchants can order free QR stickers for delivery across India.
3. Enter a **shipping address that matches KYC**. Merchants who type a different address often see “address is not valid”.
4. Watch in-app status and SMS. Delivery is commonly a week or more; treat that as typical, not a service-level agreement.
5. On arrival, **scan before you display**. Check payee name and VPA. Put the old code in a bin the same day.

**Replacement.** If the board fades, cracks, or you suspect a sticker swap, order or print a new copy and retire the old one immediately. Do not tape a new VPA over an old QR — cameras still read the code underneath.

**If you need a counter print today**, copy the merchant VPA from the app and use the [PhonePe QR generator](/phonepe-qr-generator/) or an [A4 sticker sheet](/qr-sticker-generator/). Printing it yourself does not cancel the official PhonePe QR; both can encode the same VPA.

Step-by-step sizing and paper: [create and print a UPI QR standee](/blog/how-to-create-print-upi-qr-code-standee/).

<h2 id="charges-and-mdr">Charges, MDR, and what is actually free</h2>

- **QR activation:** PhonePe Support (July 2026) — no fee to activate the Business QR.
- **Official stickers:** Play Store listing describes free QR sticker orders. Confirm in-app before you assume a particular standee size is free.
- **Bank-to-bank UPI** into your account: **0% MDR**.
- **RuPay credit card on UPI:** not the same as bank UPI. Transactions above ₹2,000 may carry interchange under NPCI rules. Under ₹2,000 is typically treated as zero-MDR for this rail. See [RuPay CC on UPI MDR](/blog/rupay-credit-card-upi-mdr-charges/).
- **Soundbox / SmartSpeaker:** a separate hardware programme. Price and rental change by city and scheme — read the in-app offer, do not rely on a blog number. How the speaker works: [UPI soundbox safety](/blog/how-upi-soundboxes-work-and-their-safety/). Free phone alerts: [voice announcements without a box](/blog/setup-soundbox-announcements-for-shop-free/).

If a visiting agent wants cash, a “security deposit”, or your UPI PIN to activate a QR, stop. PIN and OTP stay on your device.

<h2 id="print-your-own">Print a compatible standee in 30 seconds</h2>

You do not need to wait for courier stickers to start collecting.

1. Copy the UPI ID from PhonePe Business (or from consumer PhonePe if you are not using a merchant account).
2. Open the [PhonePe QR generator](/phonepe-qr-generator/).
3. Enter **payee name** exactly as the bank registered it.
4. Leave amount blank for a shop counter; lock an amount only for a fixed SKU or ticket.
5. Download PNG or PDF, print on 300 GSM **matte** stock, insert in an acrylic T-stand.

Need many copies for parcels or tables? Use the [sticker sheet generator](/qr-sticker-generator/).

<h2 id="after-activation">After the QR is live</h2>

1. Test-scan from **PhonePe and one other app** (GPay or BHIM). Interoperability is the point of UPI; if only one app reads it, the print is bad.
2. Enable **voice alerts** in PhonePe Business if you will keep the phone at the desk.
3. Read [prevent QR tampering](/blog/prevent-upi-qr-code-tampering-frauds/) before you leave a standee unattended.
4. Bookmark the [UPI error code resolver](/upi-error-codes/) for “NPCI returned error” at the counter.
5. If you are still choosing an app ecosystem, see [PhonePe vs Paytm vs GPay](/phonepe-vs-paytm-vs-gpay/).

<h2 id="faq">Frequently asked questions</h2>

### Q1. Do I need GST to get a PhonePe Business QR?

No. GST is required when your turnover crosses the GST threshold, not to print a UPI QR. PhonePe’s in-app KYC for a small sole proprietor is usually PAN, address proof, and a bank account. GSTIN or Udyam can be added later if the app asks or if you need them for other reasons.

### Q2. Can a Google Pay customer pay a PhonePe Business QR?

Yes. A standard UPI QR is interoperable. The customer’s app talks to NPCI, not to a PhonePe-only rail. The same is true in reverse for a GPay merchant QR.

### Q3. Is the QR I print here an official PhonePe merchant QR?

No. It is a compatible `upi://pay` QR that credits the VPA you enter. You do not get PhonePe Business analytics, staff roles, or official soundbox pairing from that print. Use it when you already have a VPA and need a counter poster.

### Q4. How long does the physical PhonePe standee take?

Treat “about a week, sometimes longer” as typical, not guaranteed. Order from the QR section of PhonePe Business with the KYC address. If you need a desk code today, print one yourself from the same VPA.

### Q5. Is PhonePe Business QR activation free?

PhonePe Support has stated that activating the Business QR is free. Do not pay a field agent a cash “activation fee”. Soundbox hardware, if you choose it, is a separate paid add-on — confirm the current offer in the app.

### Q6. Virtual QR or physical standee — which should I use?

Use virtual QR the day KYC clears, and whenever the phone is the counter. Use a physical standee for a fixed desk so customers are not waiting on your screen brightness. Keep both; they can share one VPA.

### Q7. What if KYC is stuck?

Check that PAN, name, and bank account belong to the same person or entity. Mismatched spellings and an address that is not on the KYC papers are the usual blocks. For companies, expect entity documents and beneficial-owner details per PhonePe’s profiling PDF. Use in-app help; do not share OTPs with anyone who calls you.

<h2 id="sources">Sources</h2>

- [PhonePe Business on Google Play](https://play.google.com/store/apps/details?id=com.phonepe.app.business) — QR sticker ordering, merchant app scope (listing reviewed July 2026).
- PhonePe Support, July 2026 — QR activation has no fee.
- [PhonePe Merchant Profiling Guidelines (PDF)](https://www.phonepe.com/apollo/pdf/Merchant_Profiling_Guidelines.pdf) — KYC / KYM by entity type, CKYCR, V-CIP.
- [PhonePe: set up UPI for business](https://business.phonepe.com/articles/upi-for-business-how-to-set-up-accept-payments-and-grow-collections).
- NPCI UPI interoperability: a Bharat QR / UPI merchant code is payable from any member app.

App menus, delivery times, and soundbox rents change. Re-check the Business app before you print a thousand stickers.
