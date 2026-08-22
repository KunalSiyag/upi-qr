import { useEffect, useMemo, useState } from "react";

const draftKey = "proupiqr-split-bill-draft";

function toPaise(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

function money(paise: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);
}

function isValidUpiId(upiId: string) {
  return /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(upiId.trim());
}

export function SplitBillCalculator() {
  const [eventName, setEventName] = useState("Team dinner");
  const [payerName, setPayerName] = useState("");
  const [upiId, setUpiId] = useState("yourname@upi");
  const [totalBill, setTotalBill] = useState("4200");
  const [tipMode, setTipMode] = useState<"none" | "percent" | "flat">("percent");
  const [tipPercent, setTipPercent] = useState("5");
  const [tipFlat, setTipFlat] = useState("200");
  const [peopleCount, setPeopleCount] = useState(4);
  const [mode, setMode] = useState<"equal" | "custom">("equal");
  const [roundToRupee, setRoundToRupee] = useState(true);
  const [names, setNames] = useState<string[]>(["Amit", "Priya", "Rahul"]);
  const [customAmounts, setCustomAmounts] = useState<string[]>(["", "", "", ""]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (!saved) return;
      const d = JSON.parse(saved);
      setEventName(d.eventName ?? "Team dinner");
      setPayerName(d.payerName ?? "");
      setUpiId(d.upiId ?? "yourname@upi");
      setTotalBill(d.totalBill ?? "");
      setTipMode(["none", "percent", "flat"].includes(d.tipMode) ? d.tipMode : "percent");
      setTipPercent(d.tipPercent ?? "5");
      setTipFlat(d.tipFlat ?? "");
      setPeopleCount(Number(d.peopleCount) > 0 ? Math.min(30, Number(d.peopleCount)) : 4);
      setMode(d.mode === "custom" ? "custom" : "equal");
      setRoundToRupee(typeof d.roundToRupee === "boolean" ? d.roundToRupee : true);
      if (Array.isArray(d.names)) setNames(d.names.map(String));
      if (Array.isArray(d.customAmounts)) setCustomAmounts(d.customAmounts.map(String));
    } catch {
      // Ignore broken local drafts.
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(draftKey, JSON.stringify({ eventName, payerName, upiId, totalBill, tipMode, tipPercent, tipFlat, peopleCount, mode, roundToRupee, names, customAmounts }));
  }, [eventName, payerName, upiId, totalBill, tipMode, tipPercent, tipFlat, peopleCount, mode, roundToRupee, names, customAmounts]);

  const calc = useMemo(() => {
    const billPaise = toPaise(totalBill);
    const tipPaise = tipMode === "percent"
      ? Math.round((billPaise * (Number(tipPercent) || 0)) / 100)
      : tipMode === "flat" ? toPaise(tipFlat) : 0;
    const grandPaise = billPaise + tipPaise;
    const n = Math.max(1, Math.min(30, peopleCount));

    let shares: number[] = [];
    if (mode === "equal") {
      if (roundToRupee) {
        const base = Math.round(grandPaise / n / 100) * 100;
        for (let i = 0; i < n - 1; i++) shares.push(base);
        shares.push(Math.max(0, grandPaise - base * (n - 1)));
      } else {
        const base = Math.floor(grandPaise / n);
        for (let i = 0; i < n - 1; i++) shares.push(base);
        shares.push(grandPaise - base * (n - 1));
      }
    } else {
      shares = Array.from({ length: n }, (_, i) => toPaise(customAmounts[i] ?? ""));
    }

    const assignedPaise = shares.reduce((sum, s) => sum + s, 0);
    return { billPaise, tipPaise, grandPaise, n, shares, assignedPaise, diffPaise: grandPaise - assignedPaise };
  }, [totalBill, tipMode, tipPercent, tipFlat, peopleCount, mode, roundToRupee, customAmounts]);

  function personMessage(index: number): string {
    const name = names[index]?.trim() || `Person ${index + 1}`;
    return `Hi ${name}! 👋\n\nYour share for *${eventName || "our outing"}* is *${money(calc.shares[index])}*.\n\nPay me instantly via UPI: ${upiId.trim()}\n\nThanks!`;
  }

  function personLink(index: number): string {
    const params = new URLSearchParams({
      pa: upiId.trim() || "yourname@upi",
      pn: (payerName || "Payment").slice(0, 40),
      am: (calc.shares[index] / 100).toFixed(2),
      cu: "INR",
      tn: `${eventName || "Split"}${names[index]?.trim() ? ` - ${names[index].trim()}` : ""}`.slice(0, 50)
    });
    return `upi://pay?${params.toString()}`;
  }

  async function copyText(text: string, index: number) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 1800);
    } catch {
      // Clipboard unavailable; user can select manually.
    }
  }

  function shareOnWhatsapp(index: number | null) {
    const text = index === null
      ? `*${eventName || "Bill"} — Split*\n` +
        `----------------------------\n` +
        `*Bill:* ${money(calc.billPaise)}${calc.tipPaise > 0 ? `\n*Tip:* ${money(calc.tipPaise)}` : ""}\n*Grand Total:* ${money(calc.grandPaise)}\n\n` +
        calc.shares.map((s, i) => `• ${names[i]?.trim() || `Person ${i + 1}`}: ${money(s)}`).join("\n") +
        `\n\n*Pay via UPI:* ${upiId.trim()}\n\nSplit free via Pro UPI QR (https://www.proupiqr.in)`
      : personMessage(index);
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
  }

  const setCount = (next: number) => {
    const clamped = Math.max(1, Math.min(30, next));
    setPeopleCount(clamped);
    setNames((cur) => Array.from({ length: clamped }, (_, i) => cur[i] ?? ""));
    setCustomAmounts((cur) => Array.from({ length: clamped }, (_, i) => cur[i] ?? ""));
  };

  const customImbalance = mode === "custom" ? calc.diffPaise : 0;

  return (
    <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
      <div className="no-print rounded-[2rem] border border-white/75 bg-white/90 p-5 shadow-[0_18px_48px_rgba(17,59,44,0.08)]">
        <div className="border-b border-forest/5 pb-4">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-leaf">Split calculator</p>
          <h2 className="mt-1 text-2xl font-black text-forest">Share The Bill Fairly</h2>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-bold text-forest">Occasion<input value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="Team dinner" className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Your name (payer)<input value={payerName} onChange={(e) => setPayerName(e.target.value)} placeholder="Shown on payment requests" className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Bill amount ₹<input type="number" value={totalBill} onChange={(e) => setTotalBill(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Your UPI ID (to receive)<input value={upiId} onChange={(e) => setUpiId(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
        </div>

        <div className="mt-5 rounded-2xl bg-cream p-4">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-forest/50">Tip</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {([["none", "No tip"], ["percent", "% of bill"], ["flat", "Flat ₹"]] as const).map(([value, label]) => (
              <button key={value} type="button" onClick={() => setTipMode(value)} aria-pressed={tipMode === value}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-bold transition ${tipMode === value ? "border-leaf bg-leaf text-white shadow-sm" : "border-forest/15 bg-white text-forest hover:border-leaf/40"}`}>
                {label}
              </button>
            ))}
          </div>
          {tipMode === "percent" && <input type="number" value={tipPercent} onChange={(e) => setTipPercent(e.target.value)} className="mt-3 w-32 rounded-xl border border-forest/10 px-3 py-2 text-sm font-bold" aria-label="Tip percent" />}
          {tipMode === "flat" && <input type="number" value={tipFlat} onChange={(e) => setTipFlat(e.target.value)} className="mt-3 w-32 rounded-xl border border-forest/10 px-3 py-2 text-sm font-bold" aria-label="Flat tip" />}
        </div>

        <div className="mt-5 flex flex-wrap items-end gap-4">
          <label className="text-sm font-bold text-forest">
            People
            <div className="mt-2 flex items-center gap-2">
              <button type="button" onClick={() => setCount(peopleCount - 1)} className="h-10 w-10 rounded-xl bg-mint text-lg font-black text-forest hover:bg-leaf hover:text-white transition" aria-label="Remove person">−</button>
              <span className="w-10 text-center text-xl font-black text-forest">{peopleCount}</span>
              <button type="button" onClick={() => setCount(peopleCount + 1)} className="h-10 w-10 rounded-xl bg-mint text-lg font-black text-forest hover:bg-leaf hover:text-white transition" aria-label="Add person">+</button>
            </div>
          </label>
          <div className="flex gap-2 pb-1">
            <button type="button" onClick={() => setMode("equal")} aria-pressed={mode === "equal"} className={`rounded-full border px-4 py-2 text-xs font-bold transition ${mode === "equal" ? "border-leaf bg-leaf text-white" : "border-forest/15 bg-white text-forest"}`}>Equal split</button>
            <button type="button" onClick={() => setMode("custom")} aria-pressed={mode === "custom"} className={`rounded-full border px-4 py-2 text-xs font-bold transition ${mode === "custom" ? "border-leaf bg-leaf text-white" : "border-forest/15 bg-white text-forest"}`}>Custom amounts</button>
          </div>
          {mode === "equal" && (
            <label className="flex items-center gap-2 pb-1 text-xs font-bold text-forest">
              <input type="checkbox" checked={roundToRupee} onChange={(e) => setRoundToRupee(e.target.checked)} className="h-4 w-4 accent-[#15803d]" />
              Round shares to ₹1
            </label>
          )}
        </div>

        {mode === "custom" && (
          <div className="mt-5 space-y-2">
            {Array.from({ length: calc.n }, (_, i) => (
              <div key={i} className="grid grid-cols-[1fr_130px] gap-2">
                <input value={names[i] ?? ""} onChange={(e) => setNames((cur) => cur.map((v, j) => j === i ? e.target.value : v))} placeholder={`Person ${i + 1}`} className="w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-sm font-semibold" />
                <input type="number" value={customAmounts[i] ?? ""} onChange={(e) => setCustomAmounts((cur) => cur.map((v, j) => j === i ? e.target.value : v))} placeholder="₹ share" className="w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-sm font-semibold" />
              </div>
            ))}
            {Math.abs(customImbalance) > 0 && (
              <p className={`rounded-xl px-4 py-2.5 text-sm font-bold ${customImbalance > 0 ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-700"}`}>
                {customImbalance > 0
                  ? `${money(customImbalance)} still unassigned — add it to someone's share.`
                  : `${money(-customImbalance)} over the bill — reduce someone's share.`}
              </p>
            )}
          </div>
        )}

        {!isValidUpiId(upiId) && <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">Enter your real UPI ID so friends can pay you back directly.</p>}
      </div>

      <div className="no-print flex flex-col rounded-[2rem] border border-white/75 bg-white/90 p-5 shadow-[0_18px_48px_rgba(17,59,44,0.08)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-forest/5 pb-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-leaf">Who owes what</p>
            <h2 className="mt-1 text-xl font-black text-forest">
              {money(calc.grandPaise)} ÷ {calc.n}{mode === "equal" ? " ways" : " custom"}
            </h2>
          </div>
          <button onClick={() => shareOnWhatsapp(null)} className="rounded-full bg-[#25D366] px-4 py-2 text-xs font-bold text-white hover:bg-[#1da851] transition inline-flex items-center gap-1.5 shadow-sm">
            💬 Share full split
          </button>
        </div>

        <div className="mt-4 flex justify-between rounded-2xl bg-forest px-4 py-3 text-sm font-bold text-white">
          <span>Bill {money(calc.billPaise)}</span>
          {calc.tipPaise > 0 && <span>+ Tip {money(calc.tipPaise)}</span>}
        </div>

        <div className="mt-4 flex-1 space-y-2 overflow-y-auto pr-1">
          {calc.shares.map((paise, i) => (
            <div key={i} className="flex items-center gap-3 rounded-2xl border border-forest/10 bg-cream px-4 py-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-forest text-xs font-black text-white">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black text-forest">{names[i]?.trim() || `Person ${i + 1}`}</p>
                <p className="text-sm font-bold text-leaf">{money(paise)}{mode === "equal" && !roundToRupee && i === calc.n - 1 && <span className="ml-1 text-[10px] font-semibold text-forest/50">(adjusted)</span>}</p>
              </div>
              <button onClick={() => copyText(personMessage(i), i)} title="Copy reminder message" className="shrink-0 rounded-full border border-forest/15 bg-white px-3 py-1.5 text-[11px] font-bold text-forest hover:border-leaf transition">
                {copiedIndex === i ? "✓ Copied" : "📋 Copy"}
              </button>
              <button onClick={() => shareOnWhatsapp(i)} title="Send on WhatsApp" className="shrink-0 rounded-full bg-[#25D366] px-3 py-1.5 text-[11px] font-bold text-white hover:bg-[#1da851] transition">💬</button>
            </div>
          ))}
        </div>

        <p className="mt-4 rounded-2xl bg-mint px-4 py-3 text-xs leading-5 font-semibold text-forest/80">
          Each WhatsApp message includes your UPI ID as plain text — friends can copy it straight into GPay, PhonePe, or Paytm and settle in seconds. Amounts always add back up to exactly {money(calc.grandPaise)}.
        </p>
      </div>
    </div>
  );
}
