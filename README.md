# Pro UPI QR Code Generator

A professional, local-first, SEO-optimized UPI QR Code Generator designed for Indian merchants, retail shops, freelancers, restaurants, and nonprofit organizations.

## Dynamic QR metrics

Dynamic QR destinations and scan counts use the first-party `/api/dynamic/[id]` Vercel Function. In Vercel, create and connect a **Vercel KV** database to this project; it supplies `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically. Each scan atomically increments total and mobile/desktop counters before redirecting to the current destination.

For local development, copy `.env.example` to `.env` and add the KV REST credentials. Without KV credentials, the QR follows its embedded destination fallback but no authoritative metrics are recorded.

## Verified UPI payment responses

Opening a native `upi://pay` link does **not** return a verified payment result to a browser. To record a payment status, use a UPI payment gateway's webhook (or a server-side relay that has already verified that gateway's signature) and call `POST /api/payment-response` from your backend. The endpoint saves only a normalized order response and supports signed `GET /api/payment-response?orderId=...` lookups.

Set these Vercel environment variables before using it:

* `KV_REST_API_URL` and `KV_REST_API_TOKEN` — supplied by a connected Vercel KV database.
* `PAYMENT_WEBHOOK_SECRET` — a long, unique secret shared only by the backend that calls the endpoint.

Each request needs `x-pro-upi-timestamp` (current Unix milliseconds) and `x-pro-upi-signature`: an HMAC-SHA256 hex digest of `METHOD.timestamp.rawBody`. Requests older than five minutes are rejected; records expire after 90 days. Never put this secret in a browser or a public QR/embed URL.

**Live Application:** [https://www.proupiqr.in](https://www.proupiqr.in)

---

## Key Features

* **100% Privacy & Local Generation:** No payment data or UPI IDs are transmitted or saved on external servers. All QR code vectors are rendered entirely client-side in the browser.
* **Payment-Ready Intent Matching:** Generates standard-compliant `upi://pay` deep links compatible with all major Indian banking applications (GPay, PhonePe, Paytm, BHIM, Cred).
* **High-Resolution Poster Prints:** Downloads custom, counter-ready payment templates designed to print directly onto A4 or standee cardboards.
* **Affiliate Product Widgets:** Integrated with Amazon affiliate product suggestions to help users discover high-quality acrylic table stands, card holders, and thermal receipt rolls.

---

## Page Index & Target Tools

* **Main Application:** [Free UPI QR Code Generator](https://www.proupiqr.in)
* **PhonePe Intent:** [PhonePe QR Generator](https://www.proupiqr.in/phonepe-qr-generator/)
* **Google Pay Intent:** [Google Pay QR Generator](https://www.proupiqr.in/google-pay-qr-generator/)
* **Paytm Intent:** [Paytm QR Generator](https://www.proupiqr.in/paytm-qr-generator/)
* **Charity & Fundraising:** [Donation QR Code Generator](https://www.proupiqr.in/donation-qr-generator/)
* **Universal / General QR:** [Universal QR Code Generator](https://www.proupiqr.in/universal-qr-generator/) (URL, Text, WiFi)
* **Merchant & Travel Guides:** [Pro UPI QR Blog & Guides](https://www.proupiqr.in/blog/)

---

## Tech Stack

* **Framework:** [Astro v4](https://astro.build/) (Static Site Generation for sub-millisecond page loads and perfect Core Web Vitals).
* **Styling:** Tailwind CSS (responsive layouts, touch-swipe gestures, and card-deck carousels).
* **UI Components:** React (stateful interactive generator forms).
* **Deployment:** Pre-configured with secure HTTP response headers and Content Security Policies (CSP) via Vercel.

---

## Getting Started

1. Clone the repository:
   ```bash
   git clone https://github.com/KunalSiyag/upi-qr.git
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the local development server:
   ```bash
   npm run dev
   ```
4. Compile static build:
   ```bash
   npm run build
   ```

---

## License

Copyright (c) 2026 Kunal Siyag. All rights reserved. This source code is proprietary. Refer to the [LICENSE](LICENSE) file for usage boundaries.
