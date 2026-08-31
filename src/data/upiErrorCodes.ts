/**
 * Consumer-facing UPI reason codes.
 *
 * Meanings are aligned to PhonePe Payment Gateway error codes, Zerodha's
 * published NPCI code list, and Decentro's NPCI collections table. Where
 * PSP docs paraphrase a code, `cause` states the official label first and
 * the practical symptom second.
 *
 * Last reviewed: 27 August 2026.
 */

export type ErrorOrigin =
  | "npci"
  | "issuing_bank"
  | "beneficiary_bank"
  | "customer"
  | "psp"
  | "merchant";

export type ErrorCategory =
  | "auth"
  | "funds"
  | "limit"
  | "bank_tech"
  | "network"
  | "account"
  | "security"
  | "request";

export type DebitStatus = "none" | "possible" | "pending_reversal";

export interface UpiErrorCode {
  code: string;
  title: string;
  cause: string;
  origin: ErrorOrigin;
  category: ErrorCategory;
  debitStatus: DebitStatus;
  refundTime: string;
  actionStep: string;
  merchantNote: string;
  aliases: string[];
  sources: string[];
}

export const ERROR_CODE_REVIEWED_ON = "2026-08-27";

export const ERROR_CODE_SOURCES = [
  {
    label: "PhonePe Payment Gateway error codes",
    href: "https://developer.phonepe.com/payment-gateway/error-codes",
  },
  {
    label: "Zerodha NPCI UPI reason codes",
    href: "https://support.zerodha.com/category/funds/adding-funds/articles/failed-upi-transaction",
  },
  {
    label: "RBI TAT for failed UPI (DPSS.CO.PD No.629/02.01.014/2019-20)",
    href: "https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=11693&Mode=0",
  },
] as const;

export const ORIGIN_LABEL: Record<ErrorOrigin, string> = {
  npci: "NPCI switch",
  issuing_bank: "Payer's bank",
  beneficiary_bank: "Payee's bank",
  customer: "Customer / PIN",
  psp: "UPI app / PSP",
  merchant: "Merchant / request",
};

export const CATEGORY_LABEL: Record<ErrorCategory, string> = {
  auth: "PIN & auth",
  funds: "Balance",
  limit: "Limits",
  bank_tech: "Bank down",
  network: "Timeout / network",
  account: "Account status",
  security: "Risk / security",
  request: "VPA / request",
};

export const DEBIT_LABEL: Record<DebitStatus, string> = {
  none: "Usually no debit",
  possible: "Debit possible — check UTR",
  pending_reversal: "If debited, auto-reversal applies",
};

export const UPI_ERROR_CODES: UpiErrorCode[] = [
  {
    code: "U16",
    title: "NPCI risk threshold / security block",
    cause:
      "NPCI declined the payment as a transaction-risk (TXNRISK) event. Apps often surface this as “NPCI returned error”. It is a security or velocity check, not a bank outage.",
    origin: "npci",
    category: "security",
    debitStatus: "none",
    refundTime: "Usually no debit",
    actionStep:
      "Wait 30–60 minutes before retrying. Do not keep hammering the same payee. If it repeats on every merchant, call the issuing bank and ask whether UPI risk controls are blocking the account.",
    merchantNote:
      "If only some customers fail with U16, the block is on their side. If many fail, pause and verify the VPA has not been flagged.",
    aliases: [
      "npci returned error",
      "npci returned",
      "risk threshold",
      "txnrisk",
      "security block",
      "u16",
    ],
    sources: ["PhonePe PG (U16_NPCI_TXNRISK_*)", "Zerodha: Risk Threshold Exceeded"],
  },
  {
    code: "U30",
    title: "Debit failed at the remitter bank",
    cause:
      "The payer's bank could not complete the debit. This is a remitter-side failure, not a daily-limit code (see Z7, Z8, ZU, U03 for limits).",
    origin: "issuing_bank",
    category: "bank_tech",
    debitStatus: "possible",
    refundTime: "If debited: auto-reversal by T+1 (P2P) or T+5 (P2M)",
    actionStep:
      "Open the transaction and copy the 12-digit UTR. Check the bank SMS/ledger before retrying. If money left the account, wait for auto-reversal — do not pay again.",
    merchantNote:
      "Do not release goods on a U30 until the credit is visible in your ledger or soundbox.",
    aliases: ["debit failed", "remitter bank issue", "u30", "debit has been failed"],
    sources: ["Zerodha: Debit has failed — Remitter Bank Issue"],
  },
  {
    code: "U28",
    title: "Bank or PSP technical issue",
    cause:
      "PhonePe maps U28 to an issuing-bank technical error. Other NPCI tables list it as PSP not available. Either the payer's bank or the app's payment service provider timed out on the switch.",
    origin: "issuing_bank",
    category: "bank_tech",
    debitStatus: "possible",
    refundTime: "If debited: auto-reversal by T+1 / T+5",
    actionStep:
      "Retry after 10–15 minutes, ideally on mobile data instead of congested Wi-Fi. If it persists, try a second UPI app linked to the same account.",
    merchantNote: "A burst of U28s usually means one bank or PSP is degraded, not your QR.",
    aliases: ["psp not available", "bank technical", "u28", "server down"],
    sources: ["PhonePe PG: BANK_TECHNICAL_ISSUE", "Zerodha: PSP Not Available"],
  },
  {
    code: "U09",
    title: "Request-auth timeout",
    cause:
      "The payer's app did not receive an authorisation acknowledgement in time (Reqauth timeout). The payment may sit in pending while banks reconcile.",
    origin: "psp",
    category: "network",
    debitStatus: "pending_reversal",
    refundTime: "Pending → success or auto-reversal; RBI outer bound T+1 / T+5",
    actionStep:
      "Do not retry the same amount until the first UTR shows Failed or the money is back. Check bank SMS, not only the app tile.",
    merchantNote: "Treat as pending. Ask the customer for the UTR and search your settlement list.",
    aliases: ["timeout", "pending", "reqauth", "u09", "processing"],
    sources: ["Zerodha: Reqauth Time Out For Pay"],
  },
  {
    code: "U66",
    title: "Device fingerprint mismatch",
    cause:
      "The UPI app's device binding does not match NPCI records. Common after a phone change, app reinstall, or rooted/cloned device.",
    origin: "psp",
    category: "request",
    debitStatus: "none",
    refundTime: "Usually no debit",
    actionStep:
      "Re-register UPI on this device: verify the SIM, complete bank OTP, and set/confirm UPI PIN. Then retry.",
    merchantNote: "This is almost always on the customer's phone, not the standee.",
    aliases: ["device fingerprint", "new phone", "reinstall", "u66"],
    sources: ["PhonePe PG: DEVICE_FINGERPRINT_MISMATCH", "Zerodha"],
  },
  {
    code: "U69",
    title: "Collect / payment request expired",
    cause:
      "A collect request or intent timed out before the customer approved it. Nothing moved.",
    origin: "customer",
    category: "request",
    debitStatus: "none",
    refundTime: "No debit",
    actionStep:
      "Send a fresh collect request or ask the customer to scan the QR again. Collect requests are typically valid only for a short window.",
    merchantNote: "Generate a new request; do not reuse an expired collect QR or intent.",
    aliases: ["expired", "collect request", "request expired", "u69"],
    sources: ["PhonePe PG: Payment request expired", "Zerodha: Collect Request Expired"],
  },
  {
    code: "U90",
    title: "Issuing bank delayed the payment",
    cause:
      "The payer's bank took longer than the UPI timeout to authorise. The app reports a bank technical issue.",
    origin: "issuing_bank",
    category: "bank_tech",
    debitStatus: "possible",
    refundTime: "If debited: auto-reversal by T+1 / T+5",
    actionStep:
      "Wait and check the UTR. If the bank is on NPCI's downtime list, retry later or use another linked account.",
    merchantNote: "Peak hours (10–11 am, salary week) produce clusters of U90/UT on specific banks.",
    aliases: ["bank delayed", "taking longer", "u90"],
    sources: ["PhonePe PG: BANK_TECHNICAL_ISSUE"],
  },
  {
    code: "UT",
    title: "Remitter / issuer unavailable (timeout)",
    cause:
      "The issuing bank did not respond to NPCI within the timeout window.",
    origin: "issuing_bank",
    category: "network",
    debitStatus: "pending_reversal",
    refundTime: "If debited: auto-reversal by T+1 / T+5",
    actionStep:
      "Copy the UTR, check the bank ledger, and only retry after the first attempt is Failed or reversed.",
    merchantNote: "Same handling as other timeouts: no double charge, no goods until credit lands.",
    aliases: ["issuer timeout", "remitter unavailable", "ut"],
    sources: ["PhonePe PG", "Zerodha: Remitter/Issuer Unavailable (Timeout)"],
  },
  {
    code: "U54",
    title: "Transaction ID or amount mismatch",
    cause:
      "The amount or transaction identifier in the credential block did not match the payment request. Usually a stale intent or a corrupted QR payload.",
    origin: "merchant",
    category: "request",
    debitStatus: "none",
    refundTime: "Usually no debit",
    actionStep:
      "Generate a fresh QR or payment link. Do not reuse an old screenshot. If you typed the amount, confirm it matches the bill.",
    merchantNote: "Re-print or re-generate the QR if this repeats on your standee.",
    aliases: ["amount mismatch", "transaction id", "u54"],
    sources: ["PhonePe PG: TXN_NOT_ALLOWED", "Zerodha"],
  },
  {
    code: "U67",
    title: "Debit timeout",
    cause:
      "The remitter bank accepted the request but did not confirm the debit before NPCI timed out.",
    origin: "issuing_bank",
    category: "network",
    debitStatus: "pending_reversal",
    refundTime: "If debited: auto-reversal by T+1 / T+5",
    actionStep:
      "Treat as pending. Check UTR and bank SMS. Do not send a second payment for the same bill.",
    merchantNote: "Hold the order until the credit or the reversal is visible.",
    aliases: ["debit timeout", "u67"],
    sources: ["Zerodha: Debit Timeout"],
  },
  {
    code: "U03",
    title: "Per-transaction amount limit exceeded",
    cause:
      "The amount is higher than the per-transaction cap set by the customer's bank or UPI profile.",
    origin: "customer",
    category: "limit",
    debitStatus: "none",
    refundTime: "No debit",
    actionStep:
      "Split the payment, use another bank account, or raise the bank's UPI per-transaction limit in the bank app if the bank allows it.",
    merchantNote: "For hospital, education, and capital-market MCC codes, NPCI allows higher P2M caps — a consumer VPA will still fail.",
    aliases: ["per transaction limit", "amount too high", "u03"],
    sources: ["PhonePe PG: TXN_LIMIT_BREACHED"],
  },
  {
    code: "U80",
    title: "Payer PSP technical issue",
    cause:
      "The customer's UPI app (TPAP/PSP) could not complete the request.",
    origin: "psp",
    category: "network",
    debitStatus: "possible",
    refundTime: "If debited: auto-reversal by T+1 / T+5",
    actionStep:
      "Update the app, switch between Wi-Fi and mobile data, or retry from a bank's own UPI app.",
    merchantNote: "If only PhonePe users fail while GPay users succeed, the issue is the payer PSP, not your VPA.",
    aliases: ["payer psp", "app error", "u80"],
    sources: ["PhonePe PG: TECHNICAL_ISSUE / PAYER_PSP"],
  },
  {
    code: "U86",
    title: "Issuing bank technical issue",
    cause: "A technical decline at the customer's bank during authorisation.",
    origin: "issuing_bank",
    category: "bank_tech",
    debitStatus: "possible",
    refundTime: "If debited: auto-reversal by T+1 / T+5",
    actionStep: "Retry later or switch to another linked bank account.",
    merchantNote: "Same pattern as U28/U90 — wait, then retry once.",
    aliases: ["u86", "issuer technical"],
    sources: ["PhonePe PG"],
  },
  {
    code: "Z9",
    title: "Insufficient funds in the payer account",
    cause:
      "The remitter account does not have enough available balance, including uncleared holds.",
    origin: "customer",
    category: "funds",
    debitStatus: "none",
    refundTime: "No debit",
    actionStep:
      "Check available (not ledger) balance in the bank app, including UPI Lite if it was selected. Add funds and retry.",
    merchantNote: "Ask the customer to pay a lower amount or use another account. This is not a merchant-QR fault.",
    aliases: ["insufficient funds", "insufficient balance", "low balance", "z9", "no money"],
    sources: ["PhonePe PG: INSUFFICIENT_BALANCE", "Zerodha", "Decentro"],
  },
  {
    code: "IE",
    title: "Insufficient balance (issuer)",
    cause: "Issuer-side insufficient-funds decline. Functionally the same as Z9.",
    origin: "customer",
    category: "funds",
    debitStatus: "none",
    refundTime: "No debit",
    actionStep: "Add funds or pick another account, then retry once.",
    merchantNote: "Treat like Z9.",
    aliases: ["ie", "insufficient"],
    sources: ["PhonePe PG: INSUFFICIENT_BALANCE"],
  },
  {
    code: "ZM",
    title: "Incorrect UPI PIN (MPIN)",
    cause:
      "The 4- or 6-digit UPI PIN did not match bank records. This is the PIN error — not U14.",
    origin: "customer",
    category: "auth",
    debitStatus: "none",
    refundTime: "No debit",
    actionStep:
      "Re-enter the PIN carefully. After repeated failures the bank will lock UPI (see Z6). Reset PIN from the app using debit-card + OTP if needed.",
    merchantNote: "Never offer to “enter PIN for the customer”.",
    aliases: ["wrong pin", "incorrect pin", "mpin", "invalid mpin", "zm", "upi pin"],
    sources: ["PhonePe PG: INVALID_MPIN", "Zerodha", "Decentro"],
  },
  {
    code: "Z6",
    title: "UPI PIN tries exceeded",
    cause: "Too many incorrect PIN attempts. The bank has temporarily blocked UPI PIN on that account.",
    origin: "customer",
    category: "auth",
    debitStatus: "none",
    refundTime: "No debit",
    actionStep:
      "Wait for the bank's cool-off (often up to 24 hours) or reset UPI PIN from the official app. Do not keep retrying.",
    merchantNote: "The customer must unlock UPI on their own device.",
    aliases: ["pin blocked", "tries exceeded", "z6", "pin lock"],
    sources: ["PhonePe PG: MPIN_LIMIT_BREACHED", "Zerodha", "Decentro"],
  },
  {
    code: "Z7",
    title: "Transaction count limit exceeded",
    cause:
      "The remitting member's daily or periodic frequency cap was hit (number of UPI transactions, not rupees).",
    origin: "customer",
    category: "limit",
    debitStatus: "none",
    refundTime: "No debit",
    actionStep:
      "Wait for the bank's 24-hour window to reset, or pay from another linked account. See /upi-limits/ for bank-wise counts.",
    merchantNote: "High-frequency payers (salary day, tuition) hit Z7 even when the rupee cap is unused.",
    aliases: ["frequency limit", "too many transactions", "z7", "daily count"],
    sources: ["PhonePe PG: TXN_FREQ_LIMIT_BREACHED", "Zerodha", "Decentro"],
  },
  {
    code: "Z8",
    title: "Per-transaction limit set by remitting bank",
    cause: "The amount exceeds the per-transaction cap configured by the payer's bank.",
    origin: "customer",
    category: "limit",
    debitStatus: "none",
    refundTime: "No debit",
    actionStep:
      "Lower the amount, split the bill, or raise the limit in the bank's UPI settings if offered.",
    merchantNote: "Large invoices should use a merchant VPA or a non-UPI rail once customer caps are hit.",
    aliases: ["per txn limit", "z8", "amount limit"],
    sources: ["PhonePe PG: TXN_LIMIT_BREACHED", "Zerodha", "Decentro"],
  },
  {
    code: "ZU",
    title: "Daily UPI amount limit exceeded",
    cause:
      "The remitter has exhausted the daily UPI amount cap (bank and NPCI default is typically ₹1,00,000 for consumer VPAs).",
    origin: "issuing_bank",
    category: "limit",
    debitStatus: "none",
    refundTime: "No debit",
    actionStep:
      "Use another bank account, wait for the daily reset, or for eligible merchant categories use a verified merchant VPA with a higher P2M cap.",
    merchantNote: "Incoming P2M on a merchant VPA is not the same cap as a customer's outbound P2P limit.",
    aliases: ["daily limit", "zu", "1 lakh", "100000", "limit exceeded"],
    sources: ["PhonePe PG: TXN_LIMIT_BREACHED", "Decentro"],
  },
  {
    code: "ZA",
    title: "Customer declined or cancelled",
    cause: "The payer cancelled the payment on the PIN/confirm screen, or the collect was rejected.",
    origin: "customer",
    category: "request",
    debitStatus: "none",
    refundTime: "No debit",
    actionStep: "Ask the customer to scan again only if they still intend to pay.",
    merchantNote: "Not a QR defect. Confirm they meant to cancel before arguing about the bill.",
    aliases: ["cancelled", "declined by customer", "za", "user cancelled"],
    sources: ["PhonePe PG: TXN_CANCELLED", "Zerodha", "Decentro"],
  },
  {
    code: "ZH",
    title: "Invalid UPI ID (VPA)",
    cause: "The VPA does not exist, is mistyped, or is no longer registered.",
    origin: "customer",
    category: "request",
    debitStatus: "none",
    refundTime: "No debit",
    actionStep:
      "Re-type the UPI ID. If you scanned a printed QR, decode it and confirm the `pa=` value is still active.",
    merchantNote:
      "Reprint the standee if you changed VPA. Old stickers will fail with ZH.",
    aliases: ["invalid vpa", "invalid upi id", "wrong upi", "zh", "does not exist"],
    sources: ["PhonePe PG: INVALID_VPA", "Zerodha", "Decentro"],
  },
  {
    code: "ZG",
    title: "VPA restricted by the customer",
    cause: "The payer has blocked or restricted payments to this VPA, or the VPA is restricted for this credit type.",
    origin: "customer",
    category: "request",
    debitStatus: "none",
    refundTime: "No debit",
    actionStep:
      "Pay from another account/app, or remove the payee restriction in the UPI app if you set it.",
    merchantNote: "Rare on a shop QR unless a customer previously marked the VPA as spam.",
    aliases: ["restricted vpa", "zg"],
    sources: ["PhonePe PG: TXN_NOT_ALLOWED", "Zerodha"],
  },
  {
    code: "ZE",
    title: "Transaction not permitted to this VPA by the PSP",
    cause: "The payer's PSP will not allow this credit to the destination VPA (policy, product, or MCC restriction).",
    origin: "psp",
    category: "request",
    debitStatus: "none",
    refundTime: "No debit",
    actionStep: "Try another UPI app or another destination VPA on the same account.",
    merchantNote: "If every customer fails, the merchant VPA may be restricted — contact the PSP that issued it.",
    aliases: ["not permitted to vpa", "ze"],
    sources: ["Zerodha: Transaction Not Permitted To VPA by the PSP"],
  },
  {
    code: "ZD",
    title: "Validation error",
    cause: "NPCI or the PSP rejected the payload as a validation error (malformed request, bad fields).",
    origin: "merchant",
    category: "request",
    debitStatus: "none",
    refundTime: "Usually no debit",
    actionStep:
      "Generate a fresh payment request. If you built the URI yourself, validate `pa`, `pn`, `am`, and encoding.",
    merchantNote: "Use a tested generator. Hand-edited URIs are a common ZD source.",
    aliases: ["validation error", "zd"],
    sources: ["PhonePe PG: VALIDATION_ERROR", "Decentro"],
  },
  {
    code: "YE",
    title: "Payer account blocked or frozen",
    cause: "The remitting account is blocked or frozen by the bank (KYC, lien, deceased, court order, or fraud hold).",
    origin: "issuing_bank",
    category: "account",
    debitStatus: "none",
    refundTime: "No debit",
    actionStep: "The customer must visit the bank or complete pending KYC. UPI cannot override a freeze.",
    merchantNote: "Accept another account or a different rail. Do not retry.",
    aliases: ["frozen", "blocked account", "ye", "account blocked"],
    sources: ["PhonePe PG: ACCOUNT_BLOCKED", "Zerodha", "Decentro"],
  },
  {
    code: "YF",
    title: "Beneficiary account blocked or frozen",
    cause: "The merchant/payee account cannot receive credits.",
    origin: "beneficiary_bank",
    category: "account",
    debitStatus: "none",
    refundTime: "No debit on payer; credit never posted",
    actionStep:
      "Merchant: call the bank that holds the settlement account. Confirm KYC, freeze, and UPI credit flags.",
    merchantNote: "This is your problem, not the customer's. Take the QR down until the bank clears the freeze.",
    aliases: ["beneficiary frozen", "yf", "payee blocked"],
    sources: ["Decentro"],
  },
  {
    code: "ZX",
    title: "Payer account inactive or dormant",
    cause: "The remitting account is inactive or dormant.",
    origin: "customer",
    category: "account",
    debitStatus: "none",
    refundTime: "No debit",
    actionStep: "Reactivate the account at the bank, then re-link UPI.",
    merchantNote: "Customer-side only.",
    aliases: ["dormant", "inactive", "zx"],
    sources: ["PhonePe PG: ACCOUNT_INACTIVE", "Decentro"],
  },
  {
    code: "ZY",
    title: "Beneficiary account inactive or dormant",
    cause: "The payee settlement account is dormant, so credits are refused.",
    origin: "beneficiary_bank",
    category: "account",
    debitStatus: "none",
    refundTime: "No credit",
    actionStep: "Merchant must reactivate the current/savings account used for UPI settlement.",
    merchantNote: "Take the QR down. Incoming UPI will keep failing until the bank marks the account active.",
    aliases: ["payee dormant", "zy"],
    sources: ["Decentro"],
  },
  {
    code: "XH",
    title: "Payer account does not exist",
    cause: "The remitter account number mapped to UPI is invalid or closed.",
    origin: "customer",
    category: "account",
    debitStatus: "none",
    refundTime: "No debit",
    actionStep: "Re-link a live bank account in the UPI app and complete registration again.",
    merchantNote: "Customer must fix their UPI mapping.",
    aliases: ["account does not exist", "xh"],
    sources: ["PhonePe PG: ACCOUNT_DOES_NOT_EXIST", "Zerodha", "Decentro"],
  },
  {
    code: "XI",
    title: "Beneficiary account does not exist",
    cause: "The account behind the payee VPA is closed or was never valid.",
    origin: "beneficiary_bank",
    category: "account",
    debitStatus: "none",
    refundTime: "No credit",
    actionStep: "Merchant: verify the VPA still maps to an open account. Create a new VPA if the old account was closed.",
    merchantNote: "Reprint every standee after a VPA change.",
    aliases: ["payee account missing", "xi"],
    sources: ["Decentro"],
  },
  {
    code: "XY",
    title: "Remitter CBS offline",
    cause: "The payer bank's core banking system is offline or unreachable from NPCI.",
    origin: "issuing_bank",
    category: "bank_tech",
    debitStatus: "possible",
    refundTime: "If debited: auto-reversal by T+1 / T+5",
    actionStep: "Wait for the bank to recover. Check NPCI/bank status. Use another account if urgent.",
    merchantNote: "A wave of XY/Y1 on one bank is an outage, not a bad QR.",
    aliases: ["cbs offline", "xy", "bank down"],
    sources: ["PhonePe PG", "Decentro: REMITTER CBS OFFLINE"],
  },
  {
    code: "XB",
    title: "Remitter bank unavailable",
    cause: "The payer's bank is down or not accepting UPI at this moment.",
    origin: "issuing_bank",
    category: "bank_tech",
    debitStatus: "possible",
    refundTime: "If debited: auto-reversal by T+1 / T+5",
    actionStep: "Retry later or switch accounts. Keep the UTR if a debit SMS arrives.",
    merchantNote: "Offer to wait or accept another app/account.",
    aliases: ["bank unavailable", "xb"],
    sources: ["PhonePe PG", "Decentro"],
  },
  {
    code: "Y1",
    title: "Beneficiary CBS offline",
    cause: "The payee bank's core system is offline, so the credit cannot post.",
    origin: "beneficiary_bank",
    category: "bank_tech",
    debitStatus: "pending_reversal",
    refundTime: "If the payer was debited: auto-reversal by T+1 / T+5",
    actionStep:
      "Merchant: check with the settlement bank. Customer: keep the UTR and do not retry until reversal or credit.",
    merchantNote: "If your bank's CBS is down, all incoming UPI will fail. Announce cash/alternate VPA.",
    aliases: ["beneficiary cbs", "y1", "payee bank down"],
    sources: ["Decentro"],
  },
  {
    code: "BT",
    title: "Acquirer / beneficiary unavailable (timeout)",
    cause: "The beneficiary bank or acquirer did not answer NPCI in time.",
    origin: "beneficiary_bank",
    category: "network",
    debitStatus: "pending_reversal",
    refundTime: "If debited: auto-reversal by T+1 / T+5",
    actionStep: "Wait on the first UTR. Only retry after Failed/reversed.",
    merchantNote: "Timeouts on your bank look like “pending” to the customer. Confirm in your ledger, not their screenshot.",
    aliases: ["beneficiary timeout", "bt", "acquirer timeout"],
    sources: ["Zerodha", "Decentro"],
  },
  {
    code: "AM",
    title: "UPI PIN not set",
    cause: "The customer has not created a UPI PIN on this account/device.",
    origin: "customer",
    category: "auth",
    debitStatus: "none",
    refundTime: "No debit",
    actionStep: "Set UPI PIN in the app (debit card + OTP, or the bank's documented method), then retry.",
    merchantNote: "First-time UPI users hit this at the counter. Give them a minute.",
    aliases: ["pin not set", "mpin not set", "am"],
    sources: ["PhonePe PG: MPIN_NOT_SET", "Zerodha"],
  },
  {
    code: "B1",
    title: "Registered mobile number changed",
    cause:
      "The mobile number mapped to the bank account was changed or removed, so UPI device binding is invalid.",
    origin: "customer",
    category: "account",
    debitStatus: "none",
    refundTime: "No debit",
    actionStep:
      "Update the mobile number at the bank, then re-register UPI on the new SIM. Old device bindings will keep failing.",
    merchantNote: "Customer-side SIM/KYC issue.",
    aliases: ["mobile number changed", "sim changed", "b1"],
    sources: ["PhonePe PG: TXN_NOT_ALLOWED", "Zerodha"],
  },
  {
    code: "B3",
    title: "Transaction not permitted to this account",
    cause:
      "The account type or product does not allow this UPI debit (NRE, certain overdraft, or bank product restriction).",
    origin: "customer",
    category: "account",
    debitStatus: "none",
    refundTime: "No debit",
    actionStep: "Use a supported savings/current account. Confirm with the bank which accounts are UPI-enabled.",
    merchantNote: "Not a QR problem.",
    aliases: ["not permitted to account", "b3", "account type"],
    sources: ["PhonePe PG: ACCOUNT_NOT_ELIGIBLE", "Decentro"],
  },
  {
    code: "K1",
    title: "Suspected fraud — remitter bank declined",
    cause: "The payer's bank's fraud engine blocked the debit.",
    origin: "issuing_bank",
    category: "security",
    debitStatus: "none",
    refundTime: "Usually no debit",
    actionStep:
      "The customer should call the bank's fraud desk. Retrying can extend the block. Use another account only if the bank says it is safe.",
    merchantNote: "Do not coach the customer to bypass a fraud decline.",
    aliases: ["fraud", "k1", "suspected fraud", "risk detected"],
    sources: ["PhonePe PG: TXN_BLOCKED", "Decentro"],
  },
  {
    code: "FP",
    title: "Payer account frozen",
    cause: "Issuer reports the account as frozen.",
    origin: "issuing_bank",
    category: "account",
    debitStatus: "none",
    refundTime: "No debit",
    actionStep: "Customer must clear the freeze with the bank (KYC, lien, or investigation).",
    merchantNote: "Same handling as YE.",
    aliases: ["fp", "frozen account"],
    sources: ["PhonePe PG: TXN_BLOCKED / frozen"],
  },
  {
    code: "XP",
    title: "Remitter bank blocked the payment",
    cause: "Issuing-bank policy block (not necessarily a freeze) — product, geography, or rule-engine decline.",
    origin: "issuing_bank",
    category: "security",
    debitStatus: "none",
    refundTime: "Usually no debit",
    actionStep: "Customer contacts the issuing bank and asks why UPI was declined.",
    merchantNote: "If only one bank's customers fail, it is that bank's rule, not your MCC.",
    aliases: ["xp", "bank blocked"],
    sources: ["PhonePe PG: TXN_BLOCKED", "Decentro"],
  },
  {
    code: "XV",
    title: "Issuing bank blocked the payment",
    cause: "Another issuer-side block code used by some PSPs for the same class of decline as XP.",
    origin: "issuing_bank",
    category: "security",
    debitStatus: "none",
    refundTime: "Usually no debit",
    actionStep: "Call the issuing bank. Do not keep retrying.",
    merchantNote: "Treat like XP/K1.",
    aliases: ["xv"],
    sources: ["PhonePe PG: TXN_BLOCKED"],
  },
];

const CODE_INDEX = new Map(UPI_ERROR_CODES.map((item) => [item.code.toUpperCase(), item]));

export function getErrorByCode(code: string): UpiErrorCode | undefined {
  return CODE_INDEX.get(code.trim().toUpperCase());
}

export function searchErrorCodes(query: string, category: ErrorCategory | "all" = "all"): UpiErrorCode[] {
  const normalised = query.trim().toLowerCase();
  return UPI_ERROR_CODES.filter((item) => {
    if (category !== "all" && item.category !== category) return false;
    if (!normalised) return true;
    const haystack = [
      item.code,
      item.title,
      item.cause,
      item.actionStep,
      ORIGIN_LABEL[item.origin],
      CATEGORY_LABEL[item.category],
      ...item.aliases,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalised);
  });
}
