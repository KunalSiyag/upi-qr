# Pro UPI QR Code Generator

A professional, local-first, SEO-optimized UPI QR Code Generator designed for Indian merchants, retail shops, freelancers, restaurants, and nonprofit organizations.

## Dynamic QR metrics

Dynamic QR destinations and scan counts use first-party Vercel Functions and Vercel KV. Campaign creation, listing, editing, and deletion require a Clerk account. IDs are generated on the server, public redirect URLs contain no fallback destination, and each scan atomically increments aggregate mobile/desktop counters before redirecting.

For local development, copy `.env.example` to `.env.local` and add Clerk and KV credentials. Without KV credentials, cloud-backed dynamic redirects and checkout sessions fail closed; static browser-generated QR tools continue to work.

## Verified UPI payment responses

Opening a native `upi://pay` link does **not** return a verified payment result to a browser. The customer-facing part of the flow is your checkout screen or QR link. The verified payment result belongs on your backend, where a gateway webhook or secure relay can call `POST /api/payment-response` after it has already checked the provider signature. The endpoint saves a normalized order response and supports signed `GET /api/payment-response?orderId=...` lookups.

Set these Vercel environment variables before using it:

* `PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` - Clerk account authentication.
* `KV_REST_API_URL` and `KV_REST_API_TOKEN` - supplied by a connected Vercel KV database.
* `PAYMENT_WEBHOOK_SECRET` - a long, unique secret shared only by the backend that calls the endpoint.

Each request needs `x-pro-upi-timestamp` (current Unix milliseconds) and `x-pro-upi-signature`. For POST, sign `POST.timestamp.rawBody`. For GET, sign `GET.timestamp.orderId=...` with query parameters sorted by name. Use globally unique order IDs within a deployment. Requests older than five minutes are rejected; records expire after 90 days and cannot be downgraded from a final successful state. This separate response store does not automatically update hosted checkout sessions.

**Live Application:** [https://www.proupiqr.in](https://www.proupiqr.in)

---

## Key Features

* **Local-First Generation:** Static QR, document, and calculator inputs stay in the browser. Account, dynamic redirect, checkout, and signed payment-response features use the server-backed storage described in the privacy policy.
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

* **Framework:** [Astro v7](https://astro.build/) with static pages and Vercel server routes.
* **Styling:** Tailwind CSS (responsive layouts, touch-swipe gestures, and card-deck carousels).
* **UI Components:** React (stateful interactive generator forms).
* **Deployment:** Vercel adapter with HSTS, noindex controls for private routes, and server-side API validation.

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
