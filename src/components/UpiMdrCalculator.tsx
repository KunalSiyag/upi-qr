import { useEffect, useId, useMemo, useState } from "react";
import {
  formatInrPaise,
  gatewayFeePaise,
  gstOnMdr,
  mdrFormula,
  mdrOnTransaction,
  merchantNetPaise,
  monthlyMdrEstimate,
  UPI_MDR,
  type UpiMdrCategory,
} from "../lib/upiMdr";
import { rupeesToPaise } from "../lib/gstMath";
import type { DocLang } from "../data/documentLang";

const draftKey = "proupiqr-upi-mdr-draft-v2";

const CATEGORIES: { id: UpiMdrCategory; label: string; hint: string }[] = [
  { id: "standard", label: "Shop / freelancer", hint: "0.4%, max ₹300" },
  { id: "essential", label: "Fuel, rail, phone, school, power, insurance, agri", hint: "Flat ₹5" },
  { id: "capital", label: "Mutual funds / stocks", hint: "0.02%, max ₹300" },
  { id: "p2p", label: "Paying a person", hint: "Always ₹0" },
];

const AMOUNT_PRESETS = ["1500", "3000", "5000", "50000", "75000", "100000"];

const MONTHLY_PRESETS = [
  { label: "Kirana", monthly: "80000", ticket: "500", category: "standard" as const },
  { label: "Salon", monthly: "300000", ticket: "4500", category: "standard" as const },
  { label: "Electronics", monthly: "1500000", ticket: "18000", category: "standard" as const },
  { label: "Petrol pump", monthly: "8000000", ticket: "4000", category: "essential" as const },
];

const EXAMPLE_BILLS = [1500_00, 3000_00, 5000_00, 50000_00, 75000_00, 100000_00];

function fieldClass() {
  return "mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-mono text-lg font-bold text-forest outline-none focus-visible:border-leaf focus-visible:ring-2 focus-visible:ring-leaf";
}

export function UpiMdrCalculator({ lang = "en" }: { lang?: DocLang } = {}) {
  const [tab, setTab] = useState<"single" | "monthly">("single");
  const [amount, setAmount] = useState("3000");
  const [monthly, setMonthly] = useState("300000");
  const [ticket, setTicket] = useState("5000");
  const [category, setCategory] = useState<UpiMdrCategory>("standard");
  const [smallMerchant, setSmallMerchant] = useState(false);
  const [gstRegistered, setGstRegistered] = useState(false);

  const amountId = useId();
  const monthlyId = useId();
  const ticketId = useId();
  const resultId = useId();

  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (!saved) return;
      const d = JSON.parse(saved);
      if (d.tab === "single" || d.tab === "monthly") setTab(d.tab);
      setAmount(String(d.amount ?? "3000"));
      setMonthly(String(d.monthly ?? "300000"));
      setTicket(String(d.ticket ?? "5000"));
      if (["standard", "essential", "capital", "p2p"].includes(d.category)) setCategory(d.category);
      if (typeof d.smallMerchant === "boolean") setSmallMerchant(d.smallMerchant);
      if (typeof d.gstRegistered === "boolean") setGstRegistered(d.gstRegistered);
    } catch {
      // Ignore broken drafts.
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(draftKey, JSON.stringify({
      tab, amount, monthly, ticket, category, smallMerchant, gstRegistered,
    }));
  }, [tab, amount, monthly, ticket, category, smallMerchant, gstRegistered]);

  const monthlyPaise = rupeesToPaise(monthly);
  const underLakh = monthlyPaise > 0 && monthlyPaise <= UPI_MDR.smallMerchantMonthlyPaise;
  const monthlyExempt = smallMerchant && underLakh;
  const singleExempt = smallMerchant;

  const single = useMemo(() => {
    const amountPaise = rupeesToPaise(amount);
    const mdrPaise = mdrOnTransaction(amountPaise, category, { smallMerchantExempt: singleExempt });
    const net = merchantNetPaise(amountPaise, mdrPaise, { gstRegistered });
    return {
      amountPaise,
      mdrPaise,
      formula: mdrFormula(amountPaise, category, mdrPaise),
      pgPaise: gatewayFeePaise(amountPaise),
      ...net,
    };
  }, [amount, category, singleExempt, gstRegistered]);

  const month = useMemo(() => {
    const typicalPaise = rupeesToPaise(ticket);
    const est = monthlyMdrEstimate({
      monthlyUpiPaise: monthlyPaise,
      typicalTicketPaise: typicalPaise,
      category,
      smallMerchantExempt: monthlyExempt,
    });
    const gstPaise = gstOnMdr(est.mdrPaise);
    const deducted = gstRegistered ? est.mdrPaise : est.mdrPaise + gstPaise;
    return {
      ...est,
      typicalPaise,
      gstPaise,
      deducted,
      yearlyPaise: deducted * 12,
      pgPaise: gatewayFeePaise(monthlyPaise),
      formula: mdrFormula(typicalPaise, category, mdrOnTransaction(typicalPaise, category)),
    };
  }, [monthlyPaise, ticket, category, monthlyExempt, gstRegistered]);

  const examples = useMemo(
    () => EXAMPLE_BILLS.map((paise) => ({
      paise,
      mdr: mdrOnTransaction(paise, category, { smallMerchantExempt: tab === "single" ? singleExempt : monthlyExempt }),
    })),
    [category, tab, singleExempt, monthlyExempt]
  );

  const headlineMdr = tab === "single" ? single.mdrPaise : month.mdrPaise;

  function whyFreeSingle(): string {
    if (single.amountPaise <= 0) return "Enter a bill amount.";
    if (category === "p2p") return "Person-to-person transfers stay free at any amount.";
    if (singleExempt) return "Small QR merchants (P2PM, up to ₹1 lakh/month) stay at zero MDR.";
    if (single.amountPaise <= UPI_MDR.thresholdPaise) return "₹2,000 or less stays free.";
    return "No MDR on this payment.";
  }

  function whyMonthly(): string {
    if (month.exempt) {
      if (category === "p2p") return "Person-to-person stays free.";
      return "Small QR merchant exemption — MDR stays ₹0 if your bank tagged this VPA as P2PM.";
    }
    if (month.allUnderThreshold) {
      return `Typical bills of ${formatInrPaise(month.typicalPaise)} are at or under ₹2,000, so this mix stays free.`;
    }
    if (month.chargedTxCount === 0) return "Nothing in this mix sits above ₹2,000.";
    const bills = `${month.chargedTxCount} bill${month.chargedTxCount === 1 ? "" : "s"} above ₹2,000`;
    return month.formula ? `${bills}. Each typical bill: ${month.formula}.` : bills;
  }

  return (
    <div className="grid gap-8 lg:grid-cols-12" lang={lang}>
      <div className="lg:col-span-6 space-y-5">
        <div className="rounded-3xl border border-forest/10 bg-white p-6 shadow-sm">
          <p className="rounded-2xl bg-amber-50 px-4 py-3 text-xs leading-5 font-semibold text-amber-950">
            From 15 October 2026. This is <strong>not a tax</strong>. The merchant pays MDR; the customer always pays ₹0.
          </p>

          <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-mint/50 p-1.5" role="tablist" aria-label="Calculator mode">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "single"}
              onClick={() => setTab("single")}
              className={`rounded-xl py-2.5 text-sm font-bold transition-colors ${tab === "single" ? "bg-forest text-white shadow" : "text-forest/70 hover:text-forest"}`}
            >
              One bill
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "monthly"}
              onClick={() => setTab("monthly")}
              className={`rounded-xl py-2.5 text-sm font-bold transition-colors ${tab === "monthly" ? "bg-forest text-white shadow" : "text-forest/70 hover:text-forest"}`}
            >
              This month
            </button>
          </div>

          {tab === "single" ? (
            <div className="mt-5">
              <label htmlFor={amountId} className="block text-sm font-bold text-forest">
                Customer paid ₹
              </label>
              <input
                id={amountId}
                name="mdr-amount"
                type="number"
                inputMode="decimal"
                min="0"
                step="1"
                autoComplete="off"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="3000"
                className={fieldClass()}
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {AMOUNT_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setAmount(preset)}
                    aria-pressed={amount === preset}
                    className={`rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors hover:border-leaf ${amount === preset ? "border-leaf bg-mint/60 text-forest" : "border-forest/15 bg-cream text-forest"}`}
                  >
                    {formatInrPaise(rupeesToPaise(preset), 0)}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              <div className="flex flex-wrap gap-2">
                {MONTHLY_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => {
                      setMonthly(p.monthly);
                      setTicket(p.ticket);
                      setCategory(p.category);
                      setSmallMerchant(false);
                    }}
                    className="rounded-full border border-forest/15 bg-cream px-3 py-1.5 text-[11px] font-bold text-forest transition-colors hover:border-leaf"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div>
                <label htmlFor={monthlyId} className="block text-sm font-bold text-forest">
                  Monthly UPI collections ₹
                </label>
                <input
                  id={monthlyId}
                  name="mdr-monthly"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="1"
                  autoComplete="off"
                  value={monthly}
                  onChange={(e) => setMonthly(e.target.value)}
                  placeholder="300000"
                  className={fieldClass()}
                />
              </div>
              <div>
                <label htmlFor={ticketId} className="block text-sm font-bold text-forest">
                  Typical bill ₹
                </label>
                <input
                  id={ticketId}
                  name="mdr-ticket"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="1"
                  autoComplete="off"
                  value={ticket}
                  onChange={(e) => setTicket(e.target.value)}
                  placeholder="5000"
                  className={fieldClass()}
                />
                <p className="mt-1.5 text-[11px] leading-5 text-forest/60">
                  What a usual UPI scan is. We count how many of those fit in the month. For one large payment, use One bill.
                </p>
              </div>
            </div>
          )}

          <p className="mt-5 text-xs font-black uppercase tracking-wider text-forest/50">What kind of payment?</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.id)}
                aria-pressed={category === c.id}
                className={`rounded-2xl border px-3 py-2.5 text-left transition-colors ${category === c.id ? "border-leaf bg-mint/50" : "border-forest/10 bg-cream/40 hover:border-forest/25"}`}
              >
                <div className="text-sm font-black text-forest">{c.label}</div>
                <div className="text-[11px] text-forest/60">{c.hint}</div>
              </button>
            ))}
          </div>

          <div className="mt-4 space-y-2">
            <label className="flex items-start gap-2 text-xs font-bold text-forest">
              <input
                type="checkbox"
                checked={smallMerchant}
                onChange={(e) => setSmallMerchant(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#15803d]"
              />
              <span>
                Small QR merchant — bank tagged this VPA as P2PM, under ₹1 lakh/month
                {tab === "monthly" && smallMerchant && !underLakh ? (
                  <span className="mt-1 block font-semibold text-amber-800">
                    Exemption only holds up to ₹1 lakh/month. This month is over that, so MDR is still applied.
                  </span>
                ) : tab === "monthly" && underLakh && !smallMerchant ? (
                  <span className="mt-1 block font-semibold text-forest/55">
                    Monthly UPI is under ₹1 lakh. Tick this only if the app/bank listed you as a small QR merchant.
                  </span>
                ) : tab === "monthly" && !underLakh && monthlyPaise > 0 ? (
                  <span className="mt-1 block font-semibold text-amber-800">
                    Three consecutive months over ₹1 lakh typically moves a P2PM account into chargeable P2M.
                  </span>
                ) : null}
              </span>
            </label>
            <a href="/blog/p2pm-small-merchant-upi-mdr/" className="block text-[11px] font-bold text-leaf underline underline-offset-2">
              How to check if the bank tagged this VPA as P2PM →
            </a>
            <label className="flex items-start gap-2 text-xs font-bold text-forest">
              <input
                type="checkbox"
                checked={gstRegistered}
                onChange={(e) => setGstRegistered(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#15803d]"
              />
              GST-registered — recover 18% GST charged on the MDR
            </label>
          </div>
        </div>
      </div>

      <div className="lg:col-span-6 space-y-5">
        <div className="rounded-3xl border border-forest/10 bg-forest p-6 text-white shadow-xl" aria-live="polite" id={resultId}>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-mint">
            {tab === "single" ? "MDR on this bill" : "MDR this month"}
          </p>
          <p className="mt-2 font-black tabular-nums tracking-tight text-mint text-4xl sm:text-5xl">
            {formatInrPaise(headlineMdr)}
          </p>
          <p className="mt-1 text-xs text-white/70">
            Customer pays ₹0. GST on the MDR is extra — see the lines below.
          </p>
          <p className="mt-3 text-sm leading-6 text-white/85">
            {tab === "single"
              ? (headlineMdr === 0 ? whyFreeSingle() : single.formula)
              : whyMonthly()}
          </p>

          {tab === "single" ? (
            <div className="mt-6 space-y-3 border-t border-white/10 pt-5 text-sm tabular-nums">
              <div className="flex justify-between gap-4"><span className="text-white/70">MDR</span><span>{formatInrPaise(single.mdrPaise)}</span></div>
              <div className="flex justify-between gap-4"><span className="text-white/70">GST @ 18% on MDR</span><span>{formatInrPaise(single.gstPaise)}</span></div>
              <div className="flex justify-between gap-4"><span className="text-white/70">{gstRegistered ? "Net cost after ITC" : "MDR + GST"}</span><span className="font-black">{formatInrPaise(single.deductedPaise)}</span></div>
              <div className="flex justify-between gap-4"><span className="text-white/70">You receive</span><span className="font-black text-mint">{formatInrPaise(single.netPaise)}</span></div>
              <div className="flex justify-between gap-4 border-t border-white/10 pt-3"><span className="text-white/70">Same bill on a 2.36% gateway</span><span className="text-red-300">{formatInrPaise(single.pgPaise)}</span></div>
            </div>
          ) : (
            <div className="mt-6 space-y-3 border-t border-white/10 pt-5 text-sm tabular-nums">
              <div className="flex justify-between gap-4"><span className="text-white/70">About this many scans</span><span>{month.txCount.toLocaleString("en-IN")}</span></div>
              <div className="flex justify-between gap-4"><span className="text-white/70">MDR before GST</span><span>{formatInrPaise(month.mdrPaise)}</span></div>
              <div className="flex justify-between gap-4"><span className="text-white/70">GST on MDR</span><span>{formatInrPaise(month.gstPaise)}</span></div>
              <div className="flex justify-between gap-4"><span className="text-white/70">{gstRegistered ? "Net after ITC" : "You pay MDR + GST"}</span><span className="font-black">{formatInrPaise(month.deducted)}</span></div>
              <div className="flex justify-between gap-4"><span className="text-white/70">Yearly at this mix</span><span>{formatInrPaise(month.yearlyPaise)}</span></div>
              <div className="flex justify-between gap-4 border-t border-white/10 pt-3"><span className="text-white/70">Same month on a 2.36% PG</span><span className="text-red-300">{formatInrPaise(month.pgPaise)}</span></div>
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-forest/10 bg-white p-5 text-sm leading-6 text-forest/75">
          <h3 className="text-base font-black text-forest">Official examples — tap to try</h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs tabular-nums">
              <thead>
                <tr className="text-forest/50">
                  <th className="pb-2 font-bold">Bill</th>
                  <th className="pb-2 font-bold">MDR</th>
                </tr>
              </thead>
              <tbody>
                {examples.map((row) => (
                  <tr key={row.paise}>
                    <td className="py-1">
                      <button
                        type="button"
                        onClick={() => {
                          setTab("single");
                          setAmount(String(row.paise / 100));
                        }}
                        className="font-bold text-leaf underline-offset-2 hover:underline"
                      >
                        {formatInrPaise(row.paise, 0)}
                      </button>
                    </td>
                    <td className="py-1 font-black text-forest">{formatInrPaise(row.mdr, row.mdr % 100 === 0 ? 0 : 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs">
            Source: Finance Ministry / PIB 15 Sep 2026. Banks must not pass MDR to the customer. App providers cannot add a platform fee on UPI.
          </p>
          <a href="/blog/upi-mdr-charges-october-2026/" className="mt-3 inline-block text-xs font-black text-leaf underline">Read the full explainer →</a>
        </div>
      </div>
    </div>
  );
}
