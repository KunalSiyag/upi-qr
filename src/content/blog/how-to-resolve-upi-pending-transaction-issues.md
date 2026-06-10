---
title: "Money Deducted but Pending? How to Resolve UPI Transaction Issues"
description: "A guide for users and merchants explaining why UPI payments get stuck in pending states and how to recover funds safely."
pubDate: 2026-05-30
author: "Pro UPI QR Team"
tags: ["Troubleshooting", "Banking", "Safety"]
---

We have all experienced it: you scan a QR code at a shop, enter your PIN, and the app display gets stuck on 'Processing' or 'Pending'. Your bank sends an SMS saying the money has been deducted, but the merchant receives no confirmation.

In this guide, we explain why this happens and what concrete steps you should take to resolve it.

---

## Why Do UPI Transactions Get Stuck?

UPI is a multi-tier network involving:
1. Your Payment App (e.g., GPay)
2. Your Bank's Server (PSP Bank)
3. The NPCI Switch
4. The Merchant's Bank Server

If any of these servers experience network latency, a timeout occurs. The transaction is flagged as **Pending** while the banks attempt to reconcile the status.

---

## Step 1: Check the UTR (Transaction ID)
The **Unique Transaction Reference (UTR)** is a 12-digit number generated for every UPI payment. 
* **Merchants:** If a customer claims they paid, ask them to show the UTR in their app history. 
* **Verification:** Log into your merchant dashboard and search for that UTR. If it is not present, the money has not reached your bank.

---

## Step 2: Understand the 48-Hour Settlement Rule
In 99% of cases, stuck funds are automatically resolved by the banking network:
* **Refund to Sender:** If the transaction failed, the sender's bank will credit the money back within **24 to 48 hours**.
* **Credit to Receiver:** If the network recovered and completed the transfer, the money will post to the merchant's account.

---

## Step 3: Raising a Dispute (NPCI Unified Dispute Redressal)
If the money is not returned or credited within 3 working days:
1. Open your payment app, locate the transaction in your history, and tap **Raise Dispute** or **Contact Support**.
2. If the app support doesn't respond, visit the **NPCI UPI Complaint Portal** online.
3. Enter the UTR number, transaction date, and bank details to lodge a formal complaint. The NPCI switch will force the bank to settle the dispute.
