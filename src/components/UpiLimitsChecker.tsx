import React, { useState, useId } from "react";

interface BankLimit {
  name: string;
  type: "bank" | "app";
  dailyLimit: string;
  perTxnLimit: string;
  maxTxnsPerDay: string;
  notes: string;
  slug?: string;
}

const LIMITS_DATA: BankLimit[] = [
  {
    name: "State Bank of India (SBI)",
    type: "bank",
    dailyLimit: "₹1,00,000",
    perTxnLimit: "₹1,00,000",
    maxTxnsPerDay: "10 transactions",
    notes: "No fee on standard P2P / P2M transfers.",
    slug: "sbi-qr-generator"
  },
  {
    name: "HDFC Bank",
    type: "bank",
    dailyLimit: "₹1,00,000",
    perTxnLimit: "₹1,00,000 (New users ₹5,000 first 24h)",
    maxTxnsPerDay: "20 transactions",
    notes: "₹5,00,000 limit allowed for approved hospital & educational merchant VPAs.",
    slug: "hdfc-qr-generator"
  },
  {
    name: "ICICI Bank",
    type: "bank",
    dailyLimit: "₹1,00,000",
    perTxnLimit: "₹1,00,000 (GPay limit ₹25,000)",
    maxTxnsPerDay: "10 transactions",
    notes: "Higher limits available for ICICI Instant Merchant QR accounts.",
    slug: "icici-qr-generator"
  },
  {
    name: "Axis Bank",
    type: "bank",
    dailyLimit: "₹1,00,000",
    perTxnLimit: "₹1,00,000",
    maxTxnsPerDay: "20 transactions",
    notes: "Supports custom UPI handle @axisbank, @okaxis.",
    slug: "axis-qr-generator"
  },
  {
    name: "Punjab National Bank (PNB)",
    type: "bank",
    dailyLimit: "₹1,00,000",
    perTxnLimit: "₹1,00,000",
    maxTxnsPerDay: "10 transactions",
    notes: "Default limit for PNB ONE UPI app.",
    slug: "pnb-qr-generator"
  },
  {
    name: "Bank of Baroda (BOB)",
    type: "bank",
    dailyLimit: "₹1,00,000",
    perTxnLimit: "₹1,00,000",
    maxTxnsPerDay: "10 transactions",
    notes: "Supports BOB World UPI handle @barodampay.",
    slug: "bob-qr-generator"
  },
  {
    name: "Kotak Mahindra Bank",
    type: "bank",
    dailyLimit: "₹1,00,000",
    perTxnLimit: "₹1,00,000",
    maxTxnsPerDay: "10 transactions",
    notes: "Supports @kotak handle.",
    slug: "kotak-qr-generator"
  },
  {
    name: "Canara Bank",
    type: "bank",
    dailyLimit: "₹1,00,000",
    perTxnLimit: "₹1,00,000",
    maxTxnsPerDay: "10 transactions",
    notes: "Supports @cnrb handle.",
    slug: "canara-qr-generator"
  },
  {
    name: "Union Bank of India",
    type: "bank",
    dailyLimit: "₹1,00,000",
    perTxnLimit: "₹1,00,000",
    maxTxnsPerDay: "10 transactions",
    notes: "Supports @unionbank handle.",
    slug: "union-qr-generator"
  },
  {
    name: "IndusInd Bank",
    type: "bank",
    dailyLimit: "₹1,00,000",
    perTxnLimit: "₹1,00,000",
    maxTxnsPerDay: "10 transactions",
    notes: "Supports @indus handle.",
    slug: "indusind-qr-generator"
  },
  {
    name: "Google Pay (GPay)",
    type: "app",
    dailyLimit: "₹1,00,000",
    perTxnLimit: "₹1,00,000",
    maxTxnsPerDay: "10 transactions",
    notes: "Limits apply across all linked bank accounts in GPay per 24 hours.",
    slug: "google-pay-qr-generator"
  },
  {
    name: "PhonePe",
    type: "app",
    dailyLimit: "₹1,00,000",
    perTxnLimit: "₹1,00,000",
    maxTxnsPerDay: "10-20 transactions",
    notes: "Subject to individual issuing bank daily cap.",
    slug: "phonepe-qr-generator"
  },
  {
    name: "Paytm",
    type: "app",
    dailyLimit: "₹1,00,000",
    perTxnLimit: "₹1,00,000 (Max ₹20,000/hour)",
    maxTxnsPerDay: "20 transactions",
    notes: "Hourly limit cap enforced by Paytm Security System.",
    slug: "paytm-qr-generator"
  },
  {
    name: "BHIM UPI",
    type: "app",
    dailyLimit: "₹1,00,000",
    perTxnLimit: "₹1,00,000 (P2P default ₹40,000)",
    maxTxnsPerDay: "10 transactions",
    notes: "Official NPCI reference app.",
    slug: "bhim-qr-generator"
  },
  {
    name: "Amazon Pay UPI",
    type: "app",
    dailyLimit: "₹1,00,000",
    perTxnLimit: "₹1,00,000 (First 24h cap ₹5,000)",
    maxTxnsPerDay: "20 transactions",
    notes: "Cashback rewards apply on merchant scans.",
    slug: "amazon-pay-qr-generator"
  },
  {
    name: "WhatsApp Pay",
    type: "app",
    dailyLimit: "₹1,00,000",
    perTxnLimit: "₹1,00,000",
    maxTxnsPerDay: "20 transactions",
    notes: "Requires mobile number linked to bank account.",
    slug: "whatsapp-pay-qr-generator"
  }
];

export function UpiLimitsChecker() {
  const [query, setQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | "bank" | "app">("all");
  const queryId = useId();

  const filteredData = LIMITS_DATA.filter((item) => {
    const matchesType = filterType === "all" || item.type === filterType;
    const matchesQuery = item.name.toLowerCase().includes(query.toLowerCase()) || item.notes.toLowerCase().includes(query.toLowerCase());
    return matchesType && matchesQuery;
  });

  return (
    <div className="space-y-6">
      {/* Controls Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-3xl border border-forest/10 bg-white p-4 shadow-sm">
        {/* Search input */}
        <div className="relative flex-1">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-forest/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            id={queryId}
            type="text"
            placeholder="Search bank or app (e.g. SBI, GPay, HDFC)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-2xl border border-forest/15 bg-white py-2.5 pl-10 pr-4 text-sm font-semibold text-forest outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/20"
          />
        </div>

        {/* Filter buttons */}
        <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-mint/50 shrink-0">
          <button
            type="button"
            onClick={() => setFilterType("all")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${filterType === "all" ? "bg-forest text-white shadow-sm" : "text-forest/70 hover:text-forest"}`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setFilterType("bank")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${filterType === "bank" ? "bg-forest text-white shadow-sm" : "text-forest/70 hover:text-forest"}`}
          >
            Banks
          </button>
          <button
            type="button"
            onClick={() => setFilterType("app")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${filterType === "app" ? "bg-forest text-white shadow-sm" : "text-forest/70 hover:text-forest"}`}
          >
            UPI Apps
          </button>
        </div>
      </div>

      {/* Table List */}
      <div className="overflow-hidden rounded-3xl border border-forest/10 bg-white shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-forest/10 bg-mint/40 text-[11px] font-black uppercase tracking-wider text-forest">
                <th className="p-4">Bank / App Name</th>
                <th className="p-4">Daily Limit</th>
                <th className="p-4">Per Transaction Cap</th>
                <th className="p-4">Daily Txn Count</th>
                <th className="p-4">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-forest/5 text-xs text-forest">
              {filteredData.length > 0 ? (
                filteredData.map((item) => (
                  <tr key={item.name} className="hover:bg-mint/20 transition-colors">
                    <td className="p-4 font-bold">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${item.type === "bank" ? "bg-leaf" : "bg-gold"}`} />
                        <span>{item.name}</span>
                      </div>
                      <div className="text-[10px] font-medium text-forest/60 mt-0.5">{item.notes}</div>
                    </td>
                    <td className="p-4 font-mono font-bold text-forest">{item.dailyLimit}</td>
                    <td className="p-4 font-mono font-semibold text-forest/80">{item.perTxnLimit}</td>
                    <td className="p-4 font-mono font-semibold text-forest/80">{item.maxTxnsPerDay}</td>
                    <td className="p-4">
                      {item.slug ? (
                        <a
                          href={`/${item.slug}/`}
                          className="inline-flex items-center gap-1 rounded-xl bg-forest/5 px-2.5 py-1.5 text-[11px] font-bold text-forest hover:bg-forest hover:text-white transition-colors"
                        >
                          Generate QR &rarr;
                        </a>
                      ) : (
                        <a
                          href="/"
                          className="inline-flex items-center gap-1 rounded-xl bg-forest/5 px-2.5 py-1.5 text-[11px] font-bold text-forest hover:bg-forest hover:text-white transition-colors"
                        >
                          Create QR &rarr;
                        </a>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-sm font-semibold text-forest/60">
                    No matching banks or apps found for "{query}".
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
