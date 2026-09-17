import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import type { DocLang } from "../data/documentLang";
import { useToolLang } from "../lib/useToolLang";

const draftKey = "proupiqr-split-bill-draft-v2";

type SplitMode = "equal" | "custom" | "items";
type TipMode = "none" | "percent" | "flat";
type BillItem = { id: number; name: string; amount: string; assigned: boolean[] };

function toPaise(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

function isValidUpiId(upiId: string) {
  return /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(upiId.trim());
}

function padAssigned(assigned: boolean[] | undefined, n: number): boolean[] {
  return Array.from({ length: n }, (_, i) => assigned?.[i] ?? true);
}

export function SplitBillCalculator({ lang = "en" }: { lang?: DocLang } = {}) {
  const { tr, symbol, money: formatMajor } = useToolLang(lang);
  const money = (paise: number) => formatMajor(paise / 100, 2);
  const [eventName, setEventName] = useState("Team dinner");
  const [payerName, setPayerName] = useState("");
  const [upiId, setUpiId] = useState("yourname@upi");
  const [totalBill, setTotalBill] = useState("4200");
  const [tipMode, setTipMode] = useState<TipMode>("percent");
  const [tipPercent, setTipPercent] = useState("5");
  const [tipFlat, setTipFlat] = useState("200");
  const [servicePercent, setServicePercent] = useState("0");
  const [peopleCount, setPeopleCount] = useState(4);
  const [mode, setMode] = useState<SplitMode>("items");
  const [roundToRupee, setRoundToRupee] = useState(true);
  const [names, setNames] = useState<string[]>(["Amit", "Priya", "Rahul", "Neha"]);
  const [customAmounts, setCustomAmounts] = useState<string[]>(["", "", "", ""]);
  const [items, setItems] = useState<BillItem[]>([
    { id: 1, name: "Butter chicken", amount: "640", assigned: [true, true, false, false] },
    { id: 2, name: "Paneer tikka", amount: "420", assigned: [false, true, true, true] },
    { id: 3, name: "Shared naan & drinks", amount: "3140", assigned: [true, true, true, true] },
  ]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [qrIndex, setQrIndex] = useState<number | null>(null);
  const [qrUrl, setQrUrl] = useState("");

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
      setServicePercent(d.servicePercent ?? "0");
      const n = Number(d.peopleCount) > 0 ? Math.min(30, Number(d.peopleCount)) : 4;
      setPeopleCount(n);
      setMode(d.mode === "custom" || d.mode === "equal" || d.mode === "items" ? d.mode : "items");
      setRoundToRupee(typeof d.roundToRupee === "boolean" ? d.roundToRupee : true);
      if (Array.isArray(d.names)) setNames(d.names.map(String));
      if (Array.isArray(d.customAmounts)) setCustomAmounts(d.customAmounts.map(String));
      if (Array.isArray(d.items)) {
        setItems(d.items.map((item: BillItem, i: number) => ({
          id: Number(item.id) || i + 1,
          name: String(item.name ?? ""),
          amount: String(item.amount ?? ""),
          assigned: padAssigned(item.assigned, n),
        })));
      }
    } catch {
      // Ignore broken local drafts.
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(draftKey, JSON.stringify({
      eventName, payerName, upiId, totalBill, tipMode, tipPercent, tipFlat, servicePercent,
      peopleCount, mode, roundToRupee, names, customAmounts, items,
    }));
  }, [eventName, payerName, upiId, totalBill, tipMode, tipPercent, tipFlat, servicePercent, peopleCount, mode, roundToRupee, names, customAmounts, items]);

  const calc = useMemo(() => {
    const n = Math.max(1, Math.min(30, peopleCount));
    const itemPaise = items.reduce((sum, item) => sum + toPaise(item.amount), 0);
    const billPaise = mode === "items" ? itemPaise : toPaise(totalBill);
    const servicePaise = Math.round((billPaise * (Number(servicePercent) || 0)) / 100);
    const tippedBase = billPaise + servicePaise;
    const tipPaise = tipMode === "percent"
      ? Math.round((tippedBase * (Number(tipPercent) || 0)) / 100)
      : tipMode === "flat" ? toPaise(tipFlat) : 0;
    const extrasPaise = servicePaise + tipPaise;
    const grandPaise = billPaise + extrasPaise;

    let raw: number[] = Array(n).fill(0);
    if (mode === "items") {
      items.forEach((item) => {
        const paise = toPaise(item.amount);
        const flags = padAssigned(item.assigned, n);
        const eaterIdx = flags.some(Boolean)
          ? flags.map((on, i) => (on ? i : -1)).filter((i) => i >= 0)
          : Array.from({ length: n }, (_, i) => i);
        const each = Math.floor(paise / eaterIdx.length);
        let leftover = paise - each * eaterIdx.length;
        eaterIdx.forEach((i) => {
          raw[i] += each + (leftover > 0 ? 1 : 0);
          if (leftover > 0) leftover -= 1;
        });
      });
      const extraEach = Math.floor(extrasPaise / n);
      let extraLeft = extrasPaise - extraEach * n;
      for (let i = 0; i < n; i++) {
        raw[i] += extraEach + (extraLeft > 0 ? 1 : 0);
        if (extraLeft > 0) extraLeft -= 1;
      }
    } else if (mode === "equal") {
      if (roundToRupee) {
        const base = Math.round(grandPaise / n / 100) * 100;
        raw = Array.from({ length: n - 1 }, () => base);
        raw.push(Math.max(0, grandPaise - base * (n - 1)));
      } else {
        const base = Math.floor(grandPaise / n);
        raw = Array.from({ length: n - 1 }, () => base);
        raw.push(grandPaise - base * (n - 1));
      }
    } else {
      raw = Array.from({ length: n }, (_, i) => toPaise(customAmounts[i] ?? ""));
    }

    const assignedPaise = raw.reduce((sum, s) => sum + s, 0);
    return { billPaise, servicePaise, tipPaise, extrasPaise, grandPaise, n, shares: raw, assignedPaise, diffPaise: grandPaise - assignedPaise };
  }, [totalBill, tipMode, tipPercent, tipFlat, servicePercent, peopleCount, mode, roundToRupee, customAmounts, items]);

  function personMessage(index: number): string {
    const name = names[index]?.trim() || `Person ${index + 1}`;
    return `Hi ${name}! 👋\n\nYour share for *${eventName || "our outing"}* is *${money(calc.shares[index])}*.\n\nPay me instantly via UPI: ${upiId.trim()}\n\nThanks!`;
  }

  async function showQr(index: number) {
    if (!isValidUpiId(upiId)) return;
    const params = new URLSearchParams({
      pa: upiId.trim(),
      pn: (payerName || "Payment").slice(0, 40),
      am: (calc.shares[index] / 100).toFixed(2),
      cu: "INR",
      tn: `${eventName || "Split"}${names[index]?.trim() ? ` - ${names[index].trim()}` : ""}`.slice(0, 50),
    });
    try {
      const url = await QRCode.toDataURL(`upi://pay?${params.toString()}`, {
        width: 280,
        margin: 2,
        color: { dark: "#113b2c", light: "#ffffff" },
      });
      setQrIndex(index);
      setQrUrl(url);
    } catch (err) {
      console.error("QR failed", err);
    }
  }

  async function copyText(text: string, index: number) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 1800);
    } catch {
      // Clipboard unavailable.
    }
  }

  function shareOnWhatsapp(index: number | null) {
    const text = index === null
      ? `*${eventName || "Bill"} — Split*\n` +
        `----------------------------\n` +
        `*Bill:* ${money(calc.billPaise)}${calc.servicePaise > 0 ? `\n*Service:* ${money(calc.servicePaise)}` : ""}${calc.tipPaise > 0 ? `\n*Tip:* ${money(calc.tipPaise)}` : ""}\n*Grand Total:* ${money(calc.grandPaise)}\n\n` +
        calc.shares.map((s, i) => `• ${names[i]?.trim() || `Person ${i + 1}`}: ${money(s)}`).join("\n") +
        `\n\n*Pay via UPI:* ${upiId.trim()}\n\nSplit free via Pro UPI QR (https://www.proupiqr.in/split-bill-calculator/)`
      : personMessage(index);
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
  }

  const setCount = (next: number) => {
    const clamped = Math.max(1, Math.min(30, next));
    setPeopleCount(clamped);
    setNames((cur) => Array.from({ length: clamped }, (_, i) => cur[i] ?? ""));
    setCustomAmounts((cur) => Array.from({ length: clamped }, (_, i) => cur[i] ?? ""));
    setItems((cur) => cur.map((item) => ({ ...item, assigned: padAssigned(item.assigned, clamped) })));
  };

  const customImbalance = mode === "custom" ? calc.diffPaise : 0;

  return (
    <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
      <div className="no-print rounded-[2rem] border border-white/75 bg-white/90 p-5 shadow-[0_18px_48px_rgba(17,59,44,0.08)]">

        <div className="border-b border-forest/5 pb-4">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-leaf">{tr("Split calculator")}</p>
          <h2 className="mt-1 text-2xl font-black text-forest">{tr("Who ordered what")}</h2>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-bold text-forest">{tr("Occasion")}<input value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="Team dinner" className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">{tr("Your name (payer)")}<input value={payerName} onChange={(e) => setPayerName(e.target.value)} placeholder="Shown on payment requests" className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          {mode !== "items" && (
            <label className="text-sm font-bold text-forest">{tr("Bill amount ₹")}<input type="number" value={totalBill} onChange={(e) => setTotalBill(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          )}
          <label className="text-sm font-bold text-forest">{tr("Your UPI ID (to receive)")}<input value={upiId} onChange={(e) => setUpiId(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <p className="sm:col-span-2 text-[11px] leading-5 text-forest/55">Friends paying you back is person-to-person UPI — always ₹0 MDR, any amount. Shop QR is different. <a href="/upi-mdr-calculator/" className="font-bold text-leaf underline">Merchant MDR calculator</a></p>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {([["items", "By items"], ["equal", "Equal split"], ["custom", `Custom ${symbol}`]] as const).map(([value, label]) => (
            <button key={value} type="button" onClick={() => setMode(value)} aria-pressed={mode === value}
              className={`rounded-full border px-4 py-2 text-xs font-bold ${mode === value ? "border-leaf bg-leaf text-white" : "border-forest/15 bg-white text-forest"}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="mt-5 rounded-2xl bg-cream p-4">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-forest/50">{tr("Service + tip")}</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="text-xs font-bold text-forest">Service charge %
              <input type="number" value={servicePercent} onChange={(e) => setServicePercent(e.target.value)} className="mt-1 w-full rounded-xl border border-forest/10 px-3 py-2 text-sm font-bold" />
            </label>
            <div>
              <p className="text-xs font-bold text-forest">{tr("Tip")}</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {([["none", "None"], ["percent", "%"], ["flat", symbol]] as const).map(([value, label]) => (
                  <button key={value} type="button" onClick={() => setTipMode(value)} aria-pressed={tipMode === value}
                    className={`rounded-full border px-3 py-1.5 text-[11px] font-bold ${tipMode === value ? "border-leaf bg-leaf text-white" : "border-forest/15 bg-white text-forest"}`}>
                    {label}
                  </button>
                ))}
              </div>
              {tipMode === "percent" && <input type="number" value={tipPercent} onChange={(e) => setTipPercent(e.target.value)} className="mt-2 w-24 rounded-xl border border-forest/10 px-3 py-2 text-sm font-bold" aria-label="Tip percent" />}
              {tipMode === "flat" && <input type="number" value={tipFlat} onChange={(e) => setTipFlat(e.target.value)} className="mt-2 w-24 rounded-xl border border-forest/10 px-3 py-2 text-sm font-bold" aria-label="Flat tip" />}
            </div>
          </div>
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
          {mode === "equal" && (
            <label className="flex items-center gap-2 pb-1 text-xs font-bold text-forest">
              <input type="checkbox" checked={roundToRupee} onChange={(e) => setRoundToRupee(e.target.checked)} className="h-4 w-4 accent-[#15803d]" />
              Round shares to {symbol}1
            </label>
          )}
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {Array.from({ length: calc.n }, (_, i) => (
            <input key={i} value={names[i] ?? ""} onChange={(e) => setNames((cur) => cur.map((v, j) => j === i ? e.target.value : v))} placeholder={`Person ${i + 1}`} className="w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-sm font-semibold" />
          ))}
        </div>

        {mode === "items" && (
          <div className="mt-5 space-y-3">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-forest/50">Dishes — tap who ate each</p>
            {items.map((item) => (
              <div key={item.id} className="rounded-2xl border border-forest/10 bg-cream p-3 space-y-2">
                <div className="grid grid-cols-[1fr_110px_auto] gap-2">
                  <input value={item.name} onChange={(e) => setItems((cur) => cur.map((row) => row.id === item.id ? { ...row, name: e.target.value } : row))} placeholder="Dish" className="rounded-xl border border-forest/10 bg-white px-3 py-2 text-sm font-semibold" />
                  <input type="number" value={item.amount} onChange={(e) => setItems((cur) => cur.map((row) => row.id === item.id ? { ...row, amount: e.target.value } : row))} placeholder={symbol} className="rounded-xl border border-forest/10 bg-white px-3 py-2 text-sm font-semibold" />
                  <button type="button" onClick={() => setItems((cur) => cur.filter((row) => row.id !== item.id))} className="text-[11px] font-bold text-red-600" aria-label="Remove dish">✕</button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from({ length: calc.n }, (_, i) => {
                    const on = item.assigned[i] ?? true;
                    return (
                      <button
                        key={i}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setItems((cur) => cur.map((row) => row.id === item.id ? { ...row, assigned: row.assigned.map((v, j) => j === i ? !v : v) } : row))}
                        className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${on ? "bg-leaf text-white" : "bg-white text-forest/50 border border-forest/10"}`}
                      >
                        {names[i]?.trim() || `P${i + 1}`}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setItems((cur) => [...cur, { id: Date.now(), name: "", amount: "", assigned: Array.from({ length: calc.n }, () => true) }])}
              className="rounded-full border border-forest/15 px-4 py-2 text-xs font-bold text-forest"
            >
              + Add dish
            </button>
          </div>
        )}

        {mode === "custom" && (
          <div className="mt-5 space-y-2">
            {Array.from({ length: calc.n }, (_, i) => (
              <div key={i} className="grid grid-cols-[1fr_130px] gap-2">
                <span className="rounded-xl bg-cream px-3 py-2 text-sm font-semibold text-forest">{names[i]?.trim() || `Person ${i + 1}`}</span>
                <input type="number" value={customAmounts[i] ?? ""} onChange={(e) => setCustomAmounts((cur) => cur.map((v, j) => j === i ? e.target.value : v))} placeholder={`${symbol} share`} className="w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-sm font-semibold" />
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
            <p className="text-xs font-black uppercase tracking-[0.2em] text-leaf">{tr("Who owes what")}</p>
            <h2 className="mt-1 text-xl font-black text-forest">{money(calc.grandPaise)} across {calc.n}</h2>
          </div>
          <button onClick={() => shareOnWhatsapp(null)} className="rounded-full bg-[#25D366] px-4 py-2 text-xs font-bold text-white hover:bg-[#1da851] transition inline-flex items-center gap-1.5 shadow-sm">
            Share full split
          </button>
        </div>

        <div className="mt-4 flex flex-wrap justify-between gap-2 rounded-2xl bg-forest px-4 py-3 text-sm font-bold text-white">
          <span>Bill {money(calc.billPaise)}</span>
          {calc.servicePaise > 0 && <span>Svc {money(calc.servicePaise)}</span>}
          {calc.tipPaise > 0 && <span>Tip {money(calc.tipPaise)}</span>}
        </div>

        <div className="mt-4 flex-1 space-y-2 overflow-y-auto pr-1">
          {calc.shares.map((paise, i) => (
            <div key={i} className="rounded-2xl border border-forest/10 bg-cream px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-forest text-xs font-black text-white">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black text-forest">{names[i]?.trim() || `Person ${i + 1}`}</p>
                  <p className="text-sm font-bold text-leaf">{money(paise)}</p>
                </div>
                <button onClick={() => copyText(personMessage(i), i)} className="shrink-0 rounded-full border border-forest/15 bg-white px-3 py-1.5 text-[11px] font-bold text-forest hover:border-leaf transition">
                  {copiedIndex === i ? tr("Copied") : "Copy"}
                </button>
                <button onClick={() => shareOnWhatsapp(i)} className="shrink-0 rounded-full bg-[#25D366] px-3 py-1.5 text-[11px] font-bold text-white">WA</button>
                <button onClick={() => showQr(i)} className="shrink-0 rounded-full bg-forest px-3 py-1.5 text-[11px] font-bold text-white">QR</button>
              </div>
              {qrIndex === i && qrUrl && (
                <div className="mt-3 flex flex-col items-center gap-2">
                  <img src={qrUrl} alt={`UPI QR for ${names[i] || `person ${i + 1}`}`} className="h-36 w-36 rounded-xl border border-forest/10 bg-white p-1" />
                  <p className="text-[11px] font-semibold text-forest/60">Scan with GPay, PhonePe, Paytm or BHIM</p>
                </div>
              )}
            </div>
          ))}
        </div>

        <p className="mt-4 rounded-2xl bg-mint px-4 py-3 text-xs leading-5 font-semibold text-forest/80">
          Itemised split charges each dish only to the people who ate it, then splits service and tip equally. Amounts add back to {money(calc.grandPaise)}.
        </p>
      </div>
    </div>
  );
}
