import { useEffect, useMemo, useState } from "react";
import {
  merchantNetPaise,
  mdrOnTransaction,
  monthlyMdrEstimate,
  UPI_MDR,
  type UpiMdrCategory,
} from "../lib/upiMdr";
import { rupeesToPaise } from "../lib/gstMath";
import type { DocLang } from "../data/documentLang";
import { DocumentLanguagePicker } from "./DocumentLanguagePicker";
import { useToolLang } from "../lib/useToolLang";

const draftKey = "proupiqr-upi-mdr-draft";

function money(paise: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);
}

const CATEGORIES: { id: UpiMdrCategory; label: string; hint: string }[] = [
  { id: "standard", label: "Regular shop / freelancer", hint: "0.4% above ₹2,000, cap ₹300" },
  { id: "essential", label: "Fuel, rail, telecom, insurance, agri", hint: "Flat ₹5 above ₹2,000" },
  { id: "capital", label: "Mutual funds / securities", hint: "0.02%, cap ₹300" },
  { id: "p2p", label: "Person-to-person", hint: "Always free" },
];

const PRESETS = [
  { label: "Kirana ₹80k", monthly: "80000", share: "15", ticket: "3500", category: "standard" as const },
  { label: "Salon ₹3L", monthly: "300000", share: "45", ticket: "4500", category: "standard" as const },
  { label: "Electronics ₹15L", monthly: "1500000", share: "70", ticket: "18000", category: "standard" as const },
  { label: "Petrol pump", monthly: "8000000", share: "80", ticket: "4000", category: "essential" as const },
];

export function UpiMdrCalculator({ lang = "en" }: { lang?: DocLang } = {}) {
  const { lang: docLang, setLang, tr } = useToolLang(lang);
  const [tab, setTab] = useState<"single" | "monthly">("monthly");
  const [amount, setAmount] = useState("5000");
  const [monthly, setMonthly] = useState("300000");
  const [shareAbove, setShareAbove] = useState("40");
  const [ticket, setTicket] = useState("5000");
  const [category, setCategory] = useState<UpiMdrCategory>("standard");
  const [forceSmallExempt, setForceSmallExempt] = useState(false);
  const [gstRegistered, setGstRegistered] = useState(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (!saved) return;
      const d = JSON.parse(saved);
      if (d.tab === "single" || d.tab === "monthly") setTab(d.tab);
      setAmount(String(d.amount ?? "5000"));
      setMonthly(String(d.monthly ?? "300000"));
      setShareAbove(String(d.shareAbove ?? "40"));
      setTicket(String(d.ticket ?? "5000"));
      if (["standard", "essential", "capital", "p2p"].includes(d.category)) setCategory(d.category);
      if (typeof d.forceSmallExempt === "boolean") setForceSmallExempt(d.forceSmallExempt);
      if (typeof d.gstRegistered === "boolean") setGstRegistered(d.gstRegistered);
    } catch {
      // Ignore broken drafts.
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(draftKey, JSON.stringify({
      tab, amount, monthly, shareAbove, ticket, category, forceSmallExempt, gstRegistered,
    }));
  }, [tab, amount, monthly, shareAbove, ticket, category, forceSmallExempt, gstRegistered]);

  const monthlyPaise = rupeesToPaise(monthly);
  const autoSmall = category === "standard" && monthlyPaise > 0 && monthlyPaise <= UPI_MDR.smallMerchantMonthlyPaise;
  const smallExempt = forceSmallExempt || autoSmall;

  const single = useMemo(() => {
    const amountPaise = rupeesToPaise(amount);
    const mdrPaise = mdrOnTransaction(amountPaise, category, { smallMerchantExempt: smallExempt });
    const net = merchantNetPaise(amountPaise, mdrPaise, { gstRegistered });
    const pgPaise = Math.round(amountPaise * 236 / 10000);
    return { amountPaise, mdrPaise, ...net, pgPaise };
  }, [amount, category, smallExempt, gstRegistered]);

  const month = useMemo(() => {
    const est = monthlyMdrEstimate({
      monthlyUpiPaise: monthlyPaise,
      valueShareAboveThreshold: Math.min(100, Math.max(0, Number(shareAbove) || 0)) / 100,
      typicalLargeTicketPaise: rupeesToPaise(ticket) || 5000_00,
      category: smallExempt ? "p2p" : category,
    });
    const gstPaise = Math.round((est.mdrPaise * UPI_MDR.gstOnMdrBps) / 10000);
    const deducted = gstRegistered ? est.mdrPaise : est.mdrPaise + gstPaise;
    const pgPaise = Math.round(monthlyPaise * 236 / 10000);
    return { ...est, gstPaise, deducted, yearlyPaise: deducted * 12, pgPaise, vsPg: pgPaise - deducted };
  }, [monthlyPaise, shareAbove, ticket, category, smallExempt, gstRegistered]);

  return (
    <div className="grid gap-8 lg:grid-cols-12">
      <div className="lg:col-span-12">
        <DocumentLanguagePicker value={docLang} onChange={setLang} label={tr("Document language")} />
      </div>

      <div className="lg:col-span-6 space-y-5">
        <div className="rounded-3xl border border-forest/10 bg-white p-6 shadow-sm">
          <p className="rounded-2xl bg-amber-50 px-4 py-3 text-xs leading-5 font-semibold text-amber-950">
            This is <strong>not a government tax</strong>. From 15 October 2026, banks may levy a Merchant Discount Rate on some person-to-merchant UPI payments above ₹2,000. P2P stays free. Customers cannot be charged.
          </p>

          <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-mint/50 p-1.5">
            <button type="button" onClick={() => setTab("monthly")} className={`rounded-xl py-2.5 text-sm font-bold ${tab === "monthly" ? "bg-forest text-white shadow" : "text-forest/70"}`}>Monthly shop</button>
            <button type="button" onClick={() => setTab("single")} className={`rounded-xl py-2.5 text-sm font-bold ${tab === "single" ? "bg-forest text-white shadow" : "text-forest/70"}`}>One payment</button>
          </div>

          {tab === "monthly" ? (
            <div className="mt-5 space-y-4">
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => {
                      setMonthly(p.monthly);
                      setShareAbove(p.share);
                      setTicket(p.ticket);
                      setCategory(p.category);
                      setForceSmallExempt(false);
                    }}
                    className="rounded-full border border-forest/15 bg-cream px-3 py-1.5 text-[11px] font-bold text-forest hover:border-leaf"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <label className="block text-sm font-bold text-forest">
                Monthly UPI collections ₹
                <input type="number" value={monthly} onChange={(e) => setMonthly(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-mono font-bold outline-none focus:border-leaf" />
              </label>
              <label className="block text-sm font-bold text-forest">
                Share of value from bills above ₹2,000 ({shareAbove}%)
                <input type="range" min="0" max="100" step="5" value={shareAbove} onChange={(e) => setShareAbove(e.target.value)} className="mt-2 w-full accent-[#287a57]" />
              </label>
              <label className="block text-sm font-bold text-forest">
                Typical bill above ₹2,000
                <input type="number" value={ticket} onChange={(e) => setTicket(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-mono font-bold outline-none focus:border-leaf" />
              </label>
            </div>
          ) : (
            <label className="mt-5 block text-sm font-bold text-forest">
              Payment amount ₹
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-mono text-lg font-bold outline-none focus:border-leaf" />
            </label>
          )}

          <p className="mt-5 text-xs font-black uppercase tracking-wider text-forest/50">Merchant type</p>
          <div className="mt-2 grid gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.id)}
                aria-pressed={category === c.id}
                className={`rounded-2xl border px-4 py-3 text-left ${category === c.id ? "border-leaf bg-mint/50" : "border-forest/10 bg-cream/40"}`}
              >
                <div className="text-sm font-black text-forest">{c.label}</div>
                <div className="text-[11px] text-forest/60">{c.hint}</div>
              </button>
            ))}
          </div>

          <label className="mt-4 flex items-start gap-2 text-xs font-bold text-forest">
            <input type="checkbox" checked={smallExempt} onChange={(e) => setForceSmallExempt(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#15803d]" />
            Small QR merchant — under ₹1 lakh/month via UPI QR (zero MDR)
          </label>
          <label className="mt-2 flex items-start gap-2 text-xs font-bold text-forest">
            <input type="checkbox" checked={gstRegistered} onChange={(e) => setGstRegistered(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#15803d]" />
            GST-registered — claim ITC on 18% GST charged on the MDR
          </label>
        </div>
      </div>

      <div className="lg:col-span-6 space-y-5">
        <div className="rounded-3xl border border-forest/10 bg-forest p-6 text-white shadow-xl">
          {tab === "single" ? (
            <>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-mint">MDR on this payment</p>
              <p className="mt-2 text-4xl font-black text-mint">{money(single.mdrPaise)}</p>
              <p className="mt-1 text-xs text-white/70">
                {single.mdrPaise === 0
                  ? single.amountPaise <= UPI_MDR.thresholdPaise
                    ? "At or under ₹2,000 — stays free."
                    : smallExempt
                      ? "Small-merchant QR exemption."
                      : category === "p2p"
                        ? "Person-to-person transfers stay free."
                        : "No MDR on this payment."
                  : "Deducted from the merchant, not the customer."}
              </p>
              <div className="mt-6 space-y-3 border-t border-white/10 pt-5 text-sm">
                <div className="flex justify-between"><span className="text-white/70">GST @ 18% on MDR</span><span>{money(single.gstPaise)}</span></div>
                <div className="flex justify-between"><span className="text-white/70">{gstRegistered ? "Net cost after ITC" : "MDR + GST (no ITC)"}</span><span className="font-black">{money(single.deductedPaise)}</span></div>
                <div className="flex justify-between"><span className="text-white/70">You receive</span><span className="font-black text-mint">{money(single.netPaise)}</span></div>
                <div className="flex justify-between border-t border-white/10 pt-3"><span className="text-white/70">Same amount on a 2.36% gateway</span><span className="text-red-300">{money(single.pgPaise)}</span></div>
              </div>
            </>
          ) : (
            <>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-mint">Estimated monthly MDR</p>
              <p className="mt-2 text-4xl font-black text-mint">{money(month.deducted)}</p>
              <p className="mt-1 text-xs text-white/70">
                {month.exempt
                  ? "This profile stays inside the zero-MDR net."
                  : `${month.txCount} bill${month.txCount === 1 ? "" : "s"} above ₹2,000 · yearly ${money(month.yearlyPaise)}`}
              </p>
              <div className="mt-6 space-y-3 border-t border-white/10 pt-5 text-sm">
                <div className="flex justify-between"><span className="text-white/70">MDR before GST</span><span>{money(month.mdrPaise)}</span></div>
                <div className="flex justify-between"><span className="text-white/70">GST on MDR</span><span>{money(month.gstPaise)}</span></div>
                <div className="flex justify-between"><span className="text-white/70">{gstRegistered ? "Net after ITC" : "You pay MDR + GST"}</span><span className="font-black">{money(month.deducted)}</span></div>
                <div className="flex justify-between border-t border-white/10 pt-3"><span className="text-white/70">Same mix on a 2.36% PG</span><span className="text-red-300">{money(month.pgPaise)}</span></div>
                <div className="flex justify-between"><span className="text-white/70">Still cheaper than a gateway by</span><span className="font-black text-mint">{money(Math.max(0, month.vsPg))}</span></div>
              </div>
            </>
          )}
        </div>

        <div className="rounded-3xl border border-forest/10 bg-white p-5 text-sm leading-6 text-forest/75">
          <h3 className="text-base font-black text-forest">Worked numbers (standard P2M)</h3>
          <ul className="mt-3 list-disc space-y-1 pl-5">
            <li>₹1,500 kirana scan — ₹0</li>
            <li>₹3,000 — ₹12 MDR (press example)</li>
            <li>₹50,000 — ₹200</li>
            <li>₹75,000 and above — ₹300 cap (so ₹1,00,000 is still ₹300, not ₹400)</li>
            <li>Petrol / rail / telecom / insurance / agri above ₹2,000 — flat ₹5</li>
          </ul>
          <p className="mt-3 text-xs">
            Source: Finance Ministry / PIB 15 Sep 2026. Banks must not pass MDR to the customer. App providers cannot add a platform fee on UPI.
          </p>
          <a href="/blog/upi-mdr-charges-october-2026/" className="mt-3 inline-block text-xs font-black text-leaf underline">Read the full explainer →</a>
        </div>
      </div>
    </div>
  );
}
