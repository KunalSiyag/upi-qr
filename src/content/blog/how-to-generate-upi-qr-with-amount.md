---
title: "How to Generate a UPI QR Code with a Pre-Filled Amount"
description: "Learn how to build dynamic UPI QR codes containing preset payment amounts and notes, ideal for digital billing, tickets, and checkout counters."
pubDate: 2026-06-03
author: "Pro UPI QR Team"
tags: ["Dynamic QR", "Billing", "Tutorial"]
---

A standard static UPI QR code allows the customer to scan and manually enter any amount they wish. While useful, it leaves room for human error—such as entering a wrong digit or forgetting to pay the full invoice value.

Generating a **dynamic UPI QR code with a pre-filled amount** locks the payment screen, ensuring the customer scans and pays the exact specified amount instantly.

---

## How it Works: The UPI URL Scheme

The technology behind pre-filled amounts is based on URL query parameters. By appending the `am` (amount) and `tn` (transaction note) variables to your base payment schema, the scanner automatically sets the fields.

For example:
`upi://pay?pa=shop@bank&pn=ShopName&am=450&cu=INR&tn=Invoice405`

When scanned, this code automatically opens GPay or PhonePe, locks the payee to "ShopName", locks the amount to "₹450", and adds the note "Invoice405". The customer only needs to enter their PIN.

---

## Step-by-Step Generator Guide

1. Go to [Pro UPI QR Generator](https://www.proupiqr.in).
2. Enter your **Payee Name** and **UPI ID / VPA**.
3. Under the **Amount** field, enter the exact price you wish to collect (e.g., `250`).
4. In the **Note** field, enter a brief description (e.g., `Event Ticket`).
5. Click **Generate UPI QR**.
6. Download the card or copy the shareable link.

---

## When to Use Pre-Filled QR Codes

* **Event Tickets:** Place a specific QR poster next to registration desks (e.g., "Registration Fee: ₹500").
* **Product Invoicing:** Print custom invoice receipts displaying a dynamic QR code for that specific bill.
* **Fixed-Price Services:** Excellent for cafes, parking lots, and transport drivers who charge flat rates.
