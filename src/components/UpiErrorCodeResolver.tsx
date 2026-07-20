import React, { useState, useId } from "react";

interface ErrorCode {
  code: string;
  title: string;
  cause: string;
  refundTime: string;
  actionStep: string;
  category: "bank" | "limit" | "network" | "user";
}

const ERROR_CODES_DATA: ErrorCode[] = [
  {
    code: "U16",
    title: "Bank Server Unavailable / Risk Check Failed",
    cause: "The remitting or beneficiary bank server is down or undergoing scheduled maintenance.",
    refundTime: "Auto-refunded in 24 hours if debited",
    actionStep: "Wait 15-30 minutes and retry. If money was deducted, it will be automatically credited back by your bank under RBI guidelines.",
    category: "bank"
  },
  {
    code: "U30",
    title: "Daily Transaction Limit Exceeded",
    cause: "You have crossed your bank's daily limit (usually ₹1,00,000) or maximum allowed daily transaction count (10-20 txns).",
    refundTime: "No money debited",
    actionStep: "Try using another linked bank account, or wait until 24 hours pass from your first transaction.",
    category: "limit"
  },
  {
    code: "U28",
    title: "Transaction Timed Out at Bank Gateway",
    cause: "Core banking system failed to respond within the 30-second NPCI timeout window.",
    refundTime: "Auto-refunded within 24-48 hours",
    actionStep: "Check account balance before retrying to avoid double deduction.",
    category: "network"
  },
  {
    code: "Z5",
    title: "Account Frozen / Restricted",
    cause: "Bank account is dormant, inactive, or restricted due to pending KYC verification.",
    refundTime: "No money debited",
    actionStep: "Contact your issuing bank branch or mobile banking app to update KYC details.",
    category: "user"
  },
  {
    code: "U14",
    title: "Incorrect UPI PIN Entered",
    cause: "Entered 4-digit or 6-digit MPIN did not match bank records.",
    refundTime: "No money debited",
    actionStep: "Re-enter correct PIN. 3 wrong attempts will block UPI for 24 hours.",
    category: "user"
  },
  {
    code: "U09",
    title: "Insufficient Funds in Account",
    cause: "Available account balance is lower than transaction amount requested.",
    refundTime: "No money debited",
    actionStep: "Check account balance in mobile app or pay a lower amount.",
    category: "user"
  },
  {
    code: "U66",
    title: "Beneficiary VPA / UPI ID Does Not Exist",
    cause: "The scanned QR code or typed UPI ID is inactive or invalid.",
    refundTime: "No money debited",
    actionStep: "Verify payee VPA handle spelling with merchant.",
    category: "user"
  }
];

export function UpiErrorCodeResolver() {
  const [query, setQuery] = useState("");
  const queryId = useId();

  const filtered = ERROR_CODES_DATA.filter((item) =>
    item.code.toLowerCase().includes(query.toLowerCase()) ||
    item.title.toLowerCase().includes(query.toLowerCase()) ||
    item.cause.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Search Input */}
      <div className="rounded-3xl border border-forest/10 bg-white p-4 shadow-sm">
        <div className="relative">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-forest/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            id={queryId}
            type="text"
            placeholder="Search error code or issue (e.g. U16, limit, server down, PIN)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-2xl border border-forest/15 bg-white py-3 pl-10 pr-4 text-sm font-semibold text-forest outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/20"
          />
        </div>
      </div>

      {/* Error List */}
      <div className="grid gap-4 md:grid-cols-2">
        {filtered.map((item) => (
          <div key={item.code} className="rounded-3xl border border-forest/10 bg-white p-6 shadow-md space-y-3">
            <div className="flex items-center justify-between">
              <span className="rounded-xl bg-forest px-3 py-1 text-xs font-black text-mint">{item.code}</span>
              <span className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5">{item.refundTime}</span>
            </div>
            <h3 className="text-base font-black text-forest">{item.title}</h3>
            <p className="text-xs text-forest/75 leading-relaxed"><strong>Cause:</strong> {item.cause}</p>
            <div className="rounded-2xl bg-mint/40 p-3 text-xs text-forest space-y-1 border border-leaf/10">
              <span className="font-bold block text-leaf">What you should do:</span>
              <span className="text-forest/80 leading-relaxed block">{item.actionStep}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
