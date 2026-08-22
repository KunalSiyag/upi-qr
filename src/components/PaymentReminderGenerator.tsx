import { useEffect, useMemo, useState } from "react";

const draftKey = "proupiqr-payment-reminder-draft";

const tones = [
  { id: "friendly", label: "🙂 Friendly nudge", name: "Friendly nudge" },
  { id: "professional", label: "💼 Professional reminder", name: "Professional reminder" },
  { id: "firm", label: "⚠️ Firm final notice", name: "Firm final notice" }
] as const;

type ToneId = (typeof tones)[number]["id"];

function money(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value || 0);
}

function daysOverdue(dueDate: string) {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.floor((today.getTime() - due.getTime()) / 86400000);
  return isNaN(due.getTime()) ? null : diff;
}

export function PaymentReminderGenerator() {
  const [business, setBusiness] = useState("ABC Solutions");
  const [customer, setCustomer] = useState("Client Name");
  const [invoiceNo, setInvoiceNo] = useState("INV-0001");
  const [amount, setAmount] = useState("7077.64");
  const [dueDate, setDueDate] = useState(new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10));
  const [upiId, setUpiId] = useState("merchant@upi");
  const [senderName, setSenderName] = useState("Accounts Team");
  const [tone, setTone] = useState<ToneId>("friendly");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (!saved) return;
      const d = JSON.parse(saved);
      setBusiness(d.business ?? "ABC Solutions");
      setCustomer(d.customer ?? "Client Name");
      setInvoiceNo(d.invoiceNo ?? "INV-0001");
      setAmount(d.amount ?? "");
      setDueDate(d.dueDate ?? "");
      setUpiId(d.upiId ?? "");
      setSenderName(d.senderName ?? "");
      setTone(tones.some((t) => t.id === d.tone) ? d.tone : "friendly");
    } catch {
      // Ignore broken local drafts.
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(draftKey, JSON.stringify({ business, customer, invoiceNo, amount, dueDate, upiId, senderName, tone }));
  }, [business, customer, invoiceNo, amount, dueDate, upiId, senderName, tone]);

  const overdue = useMemo(() => daysOverdue(dueDate), [dueDate]);

  const message = useMemo(() => {
    const amt = money(Number(amount) || 0);
    const payLine = upiId.trim() ? `\n\n*Pay instantly via UPI:* ${upiId.trim()}` : "";
    const signLine = senderName.trim() ? `\n\n— ${senderName.trim()}, ${business || "Team"}` : "";
    const friendlyDue = overdue === null ? "" : overdue > 1 ? `was due on ${dueDate}` : overdue === 1 ? `was due yesterday` : overdue === 0 ? `is due today` : `is due in ${Math.abs(overdue)} day${Math.abs(overdue) > 1 ? "s" : ""}`;
    const profOverdue = overdue !== null && overdue > 0 ? `, which is now ${overdue} day${overdue > 1 ? "s" : ""} overdue` : "";
    const firmOverdue = overdue !== null && overdue > 0 ? `${overdue} day${overdue > 1 ? "s" : ""} past its due date of ${dueDate}` : `pending since ${dueDate}`;

    if (tone === "friendly") {
      return `Hi ${customer || "there"}! 👋 Hope you are doing well.\n\nJust a gentle nudge — invoice *${invoiceNo}* for *${amt}* ${friendlyDue}.\nIf you have already paid, please ignore this message. 🙏${payLine}\n\nThanks a lot!${signLine}`;
    }
    if (tone === "professional") {
      return `Dear ${customer || "Sir/Madam"},\n\nThis is a kind reminder that payment for invoice *${invoiceNo}* amounting to *${amt}* was due on ${dueDate}${profOverdue}, and the same is pending in our records.\n\nWe request you to kindly arrange the payment at your earliest convenience.${payLine}\n\nPlease ignore if already settled. Thank you for your business.${signLine}`;
    }
    return `Dear ${customer || "Sir/Madam"},\n\nDespite earlier reminders, payment for invoice *${invoiceNo}* of *${amt}* remains unsettled — ${firmOverdue}.\n\nWe request you to clear this outstanding immediately to avoid interruption of services and further escalation as per our terms.${payLine}\n\nRegards${signLine}`;
  }, [tone, customer, invoiceNo, amount, dueDate, upiId, business, senderName, overdue]);

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked; user can select manually.
    }
  }

  function openWith(prefix: string) {
    window.open(`${prefix}${encodeURIComponent(message)}`, "_blank");
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
      <div className="no-print rounded-[2rem] border border-white/75 bg-white/90 p-5 shadow-[0_18px_48px_rgba(17,59,44,0.08)]">
        <div className="border-b border-forest/5 pb-4">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-leaf">Reminder builder</p>
          <h2 className="mt-1 text-2xl font-black text-forest">Chase Payments Politely</h2>
        </div>

        <p className="mt-5 text-xs font-black uppercase tracking-[0.18em] text-forest/50">Tone</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {tones.map((t) => (
            <button key={t.id} type="button" onClick={() => setTone(t.id)} aria-pressed={t.id === tone}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-bold transition ${t.id === tone ? "border-leaf bg-leaf text-white shadow-sm" : "border-forest/10 bg-cream text-forest hover:border-leaf/40"}`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-bold text-forest">Your business<input value={business} onChange={(e) => setBusiness(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Customer name<input value={customer} onChange={(e) => setCustomer(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Invoice number<input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Amount due ₹<input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Due date<input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">UPI ID (optional)<input value={upiId} onChange={(e) => setUpiId(e.target.value)} placeholder="yourname@upi" className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest sm:col-span-2">Signed off as (optional)<input value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="Accounts Team" className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
        </div>

        {overdue !== null && (
          <p className={`mt-4 rounded-2xl px-4 py-3 text-sm font-bold ${overdue > 0 ? "bg-red-50 text-red-700" : overdue === 0 ? "bg-amber-50 text-amber-800" : "bg-mint text-forest/80"}`}>
            {overdue > 0 ? `This invoice is ${overdue} day${overdue > 1 ? "s" : ""} overdue.` : overdue === 0 ? "This invoice is due today." : `This invoice is due in ${Math.abs(overdue)} day${Math.abs(overdue) > 1 ? "s" : ""}.`}
          </p>
        )}
      </div>

      <div className="no-print flex flex-col rounded-[2rem] border border-white/75 bg-white/90 p-5 shadow-[0_18px_48px_rgba(17,59,44,0.08)]">
        <div className="flex items-center justify-between border-b border-forest/5 pb-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-leaf">Message preview</p>
            <h2 className="mt-1 text-xl font-black text-forest">{tones.find((t) => t.id === tone)?.name}</h2>
          </div>
          <span className="rounded-full bg-mint px-3 py-1.5 text-[11px] font-black text-forest/70">{message.length} chars</span>
        </div>

        <div className="mt-5 flex-1 rounded-[1.5rem] rounded-tr-md bg-[#e7f6ec] p-5 text-base leading-7 whitespace-pre-line text-[#113b2c] shadow-inner">
          {message}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button onClick={copyMessage} className="rounded-full bg-forest px-5 py-2.5 text-xs font-bold text-white hover:bg-leaf transition">{copied ? "✓ Copied!" : "📋 Copy message"}</button>
          <button onClick={() => openWith("https://api.whatsapp.com/send?text=")} className="rounded-full bg-[#25D366] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#1da851] transition">💬 WhatsApp</button>
          <button onClick={() => openWith("sms:?&body=")} className="rounded-full bg-mint px-5 py-2.5 text-xs font-bold text-forest hover:bg-leaf hover:text-white transition">📱 SMS</button>
          <button onClick={() => openWith(`mailto:?subject=${encodeURIComponent(`Payment reminder - Invoice ${invoiceNo}`)}&body=`)} className="rounded-full border border-forest/15 px-5 py-2.5 text-xs font-bold text-forest hover:bg-mint transition">✉️ Email</button>
        </div>
        <p className="mt-4 text-xs leading-5 font-semibold text-forest/60">
          Tip: pair the reminder with a scan-and-pay QR so customers can clear dues in one tap — create one with the UPI QR generator or attach an invoice PDF.
        </p>
      </div>
    </div>
  );
}
