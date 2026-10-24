import { useMemo, useState, type FormEvent } from "react";
import {
  addDays, addPayment, findClient, formatPaise, getInvoice, isIsoDate, liveClients, liveInvoices, logReminder, newId, nextInvoiceNumber,
  paiseToDecimal, parseRupeesToPaise, PAYMENT_MODES, recurringInvoiceId, reminderMessage, suggestedTone, upsertClient, upsertInvoice,
  upsertPlan, viewInvoice, whatsappLink, isUdyam, type Invoice, type PaymentMode, type ReminderLang, type ReminderTone, type Workspace,
} from "../../lib/workspace/model";
import { Field, inputClass, primaryButton, secondaryButton, Sheet } from "./ui";
import { useWs } from "./i18n";

const TERMS = [
  { label: "On receipt", days: 0 },
  { label: "7 days", days: 7 },
  { label: "15 days", days: 15 },
  { label: "30 days", days: 30 },
  { label: "45 days", days: 45 },
];

const MODE_LABEL: Record<PaymentMode, string> = {
  upi: "UPI", cash: "Cash", bank: "Bank transfer", card: "Card", cheque: "Cheque", other: "Other",
};

export function InvoiceSheet({ ws, today, invoiceId, onSave, onClose }: {
  ws: Workspace;
  today: string;
  invoiceId?: string;
  onSave: (next: Workspace, invoiceId: string) => void;
  onClose: () => void;
}) {
  const existing = invoiceId ? getInvoice(ws, invoiceId) : undefined;
  const { tr } = useWs();
  const existingClient = existing ? ws.clients[existing.clientId] : undefined;
  const clients = useMemo(() => liveClients(ws), [ws]);
  const [clientName, setClientName] = useState(existingClient?.name ?? "");
  const [phone, setPhone] = useState(existingClient?.phone ?? "");
  const [number, setNumber] = useState(existing?.number ?? nextInvoiceNumber(ws));
  const [amount, setAmount] = useState(existing ? paiseToDecimal(existing.amountPaise) : "");
  const [issueDate, setIssueDate] = useState(existing?.issueDate ?? today);
  const [dueDate, setDueDate] = useState(existing?.dueDate ?? addDays(today, 15));
  const [description, setDescription] = useState(existing?.description ?? "");
  const [repeat, setRepeat] = useState(false);
  const [untilMonth, setUntilMonth] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  function pickClient(name: string) {
    setClientName(name);
    const match = clients.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());
    if (match && !phone) setPhone(match.phone);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const amountPaise = parseRupeesToPaise(amount);
    const next: Record<string, string> = {};
    if (!clientName.trim()) next.client = tr("Who is this invoice for?");
    if (!amountPaise) next.amount = tr("Enter an amount like 1500 or 1500.50.");
    if (!number.trim()) next.number = tr("Invoice number is required.");
    if (!isIsoDate(issueDate)) next.issueDate = tr("Pick a valid date.");
    if (!isIsoDate(dueDate)) next.dueDate = tr("Pick a valid date.");
    else if (isIsoDate(issueDate) && dueDate < issueDate) next.dueDate = tr("Due date can't be before the invoice date.");
    const duplicate = liveInvoices(ws).find((i) => i.id !== invoiceId && i.number.trim().toLowerCase() === number.trim().toLowerCase());
    if (duplicate) next.number = tr("{number} already exists.", { number: duplicate.number });
    if (phone && phone.replace(/\D/g, "").length < 10) next.phone = tr("Enter a 10-digit mobile number, or leave it blank.");
    if (repeat && untilMonth && isIsoDate(issueDate) && untilMonth < issueDate.slice(0, 7)) next.until = tr("The last month can't be before the first invoice.");
    setErrors(next);
    if (Object.keys(next).length || !amountPaise) return;

    const now = Date.now();
    let ws2 = ws;
    let client = existingClient && existingClient.name.trim().toLowerCase() === clientName.trim().toLowerCase()
      ? existingClient
      : findClient(ws, clientName, phone);
    if (!client) {
      client = { id: newId("cli"), name: clientName.trim().slice(0, 80), phone: phone.trim(), email: "", gstin: "", createdAt: now, updatedAt: now };
      ws2 = upsertClient(ws2, client, now);
    } else if (phone.trim() && phone.trim() !== client.phone) {
      client = { ...client, phone: phone.trim() };
      ws2 = upsertClient(ws2, client, now);
    }
    // "Repeat every month": a plan bills this client on the same day each month; this invoice is its first month.
    let planId: string | undefined;
    if (!existing && repeat) {
      planId = newId("rec");
      ws2 = upsertPlan(ws2, {
        id: planId,
        clientId: client.id,
        amountPaise,
        description: description.trim().slice(0, 300),
        dayOfMonth: Math.min(28, Number(issueDate.slice(8, 10))),
        dueAfterDays: Math.max(0, Math.min(90, Math.round((Date.parse(dueDate) - Date.parse(issueDate)) / 86_400_000))),
        startMonth: issueDate.slice(0, 7),
        endMonth: untilMonth,
        paused: false,
        createdAt: now,
        updatedAt: now,
      }, now);
    }
    const invoice: Invoice = {
      id: existing?.id ?? (planId ? recurringInvoiceId(planId, issueDate.slice(0, 7)) : newId("inv")),
      number: number.trim().slice(0, 40),
      clientId: client.id,
      issueDate,
      dueDate,
      amountPaise,
      description: description.trim().slice(0, 300),
      payments: existing?.payments ?? [],
      reminders: existing?.reminders ?? [],
      voided: existing?.voided ?? false,
      ...(existing?.recurringId || planId ? { recurringId: existing?.recurringId ?? planId } : {}),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    onSave(upsertInvoice(ws2, invoice, now), invoice.id);
  }

  const termDays = isIsoDate(issueDate) && isIsoDate(dueDate) ? Math.round((Date.parse(dueDate) - Date.parse(issueDate)) / 86_400_000) : -1;

  return (
    <Sheet title={existing ? tr("Edit {name}", { name: existing.number }) : tr("New invoice to track")} onClose={onClose}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={tr("Client name")} htmlFor="ws-client" error={errors.client}>
            <input id="ws-client" list="ws-client-list" className={inputClass} value={clientName} onChange={(e) => pickClient(e.target.value)} autoComplete="off" maxLength={80} placeholder={tr("e.g. Rohan Mehta")} />
            <datalist id="ws-client-list">{clients.map((c) => <option key={c.id} value={c.name} />)}</datalist>
          </Field>
          <Field label={tr("WhatsApp number (optional)")} htmlFor="ws-phone" error={errors.phone}>
            <input id="ws-phone" className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="off" maxLength={20} placeholder="98765 43210" />
          </Field>
          <Field label={tr("Amount (₹)")} htmlFor="ws-amount" error={errors.amount}>
            <input id="ws-amount" className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="1500" />
          </Field>
          <Field label={tr("Invoice number")} htmlFor="ws-number" error={errors.number}>
            <input id="ws-number" className={inputClass} value={number} onChange={(e) => setNumber(e.target.value)} maxLength={40} />
          </Field>
          <Field label={tr("Invoice date")} htmlFor="ws-issue" error={errors.issueDate}>
            <input id="ws-issue" type="date" className={inputClass} value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </Field>
          <Field label={tr("Due date")} htmlFor="ws-due" error={errors.dueDate}>
            <input id="ws-due" type="date" className={inputClass} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label={tr("Payment terms")}>
          {TERMS.map((term) => (
            <button
              key={term.days}
              type="button"
              onClick={() => isIsoDate(issueDate) && setDueDate(addDays(issueDate, term.days))}
              aria-pressed={termDays === term.days}
              className={`rounded-[7px] px-3 py-1.5 text-xs font-bold transition ${termDays === term.days ? "bg-forest text-white" : "bg-fog text-ink hover:bg-graphite hover:text-white"}`}
            >
              {tr(term.label)}
            </button>
          ))}
        </div>
        <Field label={tr("What is it for? (optional)")} htmlFor="ws-desc">
          <input id="ws-desc" className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} placeholder={tr("October tuition fees")} />
        </Field>
        {!existing && (
          <div className="rounded-[10px] bg-cream p-3">
            <label className="flex cursor-pointer items-start gap-2 text-sm font-bold text-ink">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#287a57]" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
              <span>{tr("Repeat every month")}<span className="block text-xs font-normal text-muted">{tr("For tuition fees, rent, memberships, maintenance. A new invoice is created on day {d} of each month.", { d: isIsoDate(issueDate) ? Math.min(28, Number(issueDate.slice(8, 10))) : "—" })}</span></span>
            </label>
            {repeat && (
              <div className="mt-3">
                <Field label={tr("Last month to bill (optional)")} htmlFor="ws-until" error={errors.until}>
                  <input id="ws-until" type="month" className={inputClass} value={untilMonth} onChange={(e) => setUntilMonth(e.target.value)} />
                </Field>
              </div>
            )}
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <button type="submit" className={`${primaryButton} flex-1`}>{existing ? tr("Save changes") : tr("Add invoice")}</button>
          <button type="button" onClick={onClose} className={secondaryButton}>{tr("Cancel")}</button>
        </div>
      </form>
    </Sheet>
  );
}

export function PaymentSheet({ ws, today, invoiceId, initialAmountPaise, initialReference, onSave, onClose }: {
  ws: Workspace;
  today: string;
  invoiceId: string;
  initialAmountPaise?: number;
  initialReference?: string;
  onSave: (next: Workspace) => void;
  onClose: () => void;
}) {
  const view = viewInvoice(getInvoice(ws, invoiceId) as Invoice, ws.clients, today);
  const { tr } = useWs();
  const [amount, setAmount] = useState(paiseToDecimal(Math.min(initialAmountPaise ?? view.balancePaise, view.balancePaise)));
  const [date, setDate] = useState(today);
  const [mode, setMode] = useState<PaymentMode>("upi");
  const [reference, setReference] = useState(initialReference ?? "");
  const [error, setError] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    const amountPaise = parseRupeesToPaise(amount);
    if (!amountPaise) return setError(tr("Enter the amount received."));
    if (!isIsoDate(date)) return setError(tr("Pick the date you received it."));
    if (amountPaise > view.balancePaise) return setError(tr("That's more than the {amount} still due.", { amount: formatPaise(view.balancePaise) }));
    onSave(addPayment(ws, invoiceId, { amountPaise, date, mode, reference: reference.trim().slice(0, 60) }, Date.now()));
  }

  return (
    <Sheet title={tr("Payment for {number}", { number: view.invoice.number })} onClose={onClose}>
      <p className="mb-4 text-sm text-charcoal">
        {view.client?.name ?? tr("Client")} · {tr("{due} still due of {total}", { due: formatPaise(view.balancePaise), total: formatPaise(view.invoice.amountPaise) })}
      </p>
      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={tr("Amount received (₹)")} htmlFor="ws-pay-amount">
            <input id="ws-pay-amount" className={inputClass} value={amount} onChange={(e) => { setAmount(e.target.value); setError(""); }} inputMode="decimal" />
          </Field>
          <Field label={tr("Received on")} htmlFor="ws-pay-date">
            <input id="ws-pay-date" type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} max={today} />
          </Field>
          <Field label={tr("Mode")} htmlFor="ws-pay-mode">
            <select id="ws-pay-mode" className={inputClass} value={mode} onChange={(e) => setMode(e.target.value as PaymentMode)}>
              {PAYMENT_MODES.map((m) => <option key={m} value={m}>{tr(MODE_LABEL[m])}</option>)}
            </select>
          </Field>
          <Field label={mode === "upi" ? tr("UTR / reference (optional)") : tr("Reference (optional)")} htmlFor="ws-pay-ref">
            <input id="ws-pay-ref" className={inputClass} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={60} placeholder={mode === "upi" ? tr("12-digit UTR") : ""} />
          </Field>
        </div>
        {error && <p role="alert" className="text-xs font-bold text-[#a8321d]">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button type="submit" className={`${primaryButton} flex-1`}>{tr("Save payment")}</button>
          <button type="button" onClick={onClose} className={secondaryButton}>{tr("Cancel")}</button>
        </div>
      </form>
    </Sheet>
  );
}

const REMINDER_LANG_KEY = "proupiqr-reminder-lang";

const TONES: { id: ReminderTone; label: string }[] = [
  { id: "friendly", label: "Friendly" },
  { id: "due_today", label: "Due today" },
  { id: "overdue", label: "Overdue" },
  { id: "final", label: "Firm" },
];

export function ReminderSheet({ ws, today, invoiceId, msmeTools, payLink, onSent, onClose }: {
  ws: Workspace;
  today: string;
  invoiceId: string;
  /** Plan includes MSME tools (the MSMED rights line). */
  msmeTools: boolean;
  payLink?: string;
  onSent: (next: Workspace, channel: "whatsapp" | "sms" | "copy") => void;
  onClose: () => void;
}) {
  const view = viewInvoice(getInvoice(ws, invoiceId) as Invoice, ws.clients, today);
  const { tr, dateLocale, lang: uiLang } = useWs();
  const [tone, setTone] = useState<ReminderTone>(suggestedTone(view));
  const [lang, setLang] = useState<ReminderLang>(() => {
    // A remembered choice wins; otherwise messages follow the app language.
    try {
      const saved = localStorage.getItem(REMINDER_LANG_KEY);
      return saved === "hi" || saved === "en" ? saved : uiLang;
    } catch { return uiLang; }
  });
  const [msmeRights, setMsmeRights] = useState(false);
  const [message, setMessage] = useState(() => reminderMessage(view, ws.business, suggestedTone(view), payLink, lang));
  const udyam = isUdyam(ws.business.udyam);
  const [copied, setCopied] = useState(false);
  const phone = view.client?.phone ?? "";
  const last = view.invoice.reminders.at(-1);

  function chooseTone(next: ReminderTone) {
    setTone(next);
    setMessage(reminderMessage(view, ws.business, next, payLink, lang, msmeRights));
  }

  function chooseLang(next: ReminderLang) {
    setLang(next);
    try { localStorage.setItem(REMINDER_LANG_KEY, next); } catch { /* not remembered */ }
    setMessage(reminderMessage(view, ws.business, tone, payLink, next, msmeRights));
  }

  function chooseRights(next: boolean) {
    setMsmeRights(next);
    setMessage(reminderMessage(view, ws.business, tone, payLink, lang, next));
  }

  function send(channel: "whatsapp" | "sms") {
    const digits = phone.replace(/\D/g, "").slice(-10);
    const url = channel === "whatsapp"
      ? whatsappLink(phone, message)
      : `sms:${digits ? `+91${digits}` : ""}?body=${encodeURIComponent(message)}`;
    window.open(url, "_blank", "noopener");
    onSent(logReminder(ws, invoiceId, channel, Date.now()), channel);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      onSent(logReminder(ws, invoiceId, "copy", Date.now()), "copy");
    } catch {
      setCopied(false);
    }
  }

  return (
    <Sheet title={tr("Remind {name}", { name: view.client?.name ?? tr("client") })} onClose={onClose}>
      <p className="mb-3 text-sm text-charcoal">
        {view.invoice.number} · {tr("{amount} due", { amount: formatPaise(view.balancePaise) })}
        {last && <> · {tr("last reminded {date}", { date: new Date(last.at).toLocaleDateString(dateLocale, { day: "numeric", month: "short" }) })}</>}
      </p>
      <div className="mb-2 flex gap-1 rounded-full bg-cream p-1 text-xs font-bold w-fit" role="group" aria-label={tr("Message language")}>
        {(["en", "hi"] as ReminderLang[]).map((l) => (
          <button key={l} type="button" onClick={() => chooseLang(l)} aria-pressed={lang === l}
            className={`rounded-[10px] px-3 py-1 transition ${lang === l ? "bg-forest text-white" : "text-charcoal hover:bg-fog"}`}>
            {l === "en" ? "English" : "हिन्दी"}
          </button>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label={tr("Tone")}>
        {TONES.map((t) => (
          <button key={t.id} type="button" onClick={() => chooseTone(t.id)} aria-pressed={tone === t.id}
            className={`rounded-[7px] px-3 py-1.5 text-xs font-bold transition ${tone === t.id ? "bg-forest text-white" : "bg-fog text-ink hover:bg-graphite hover:text-white"}`}>
            {tr(t.label)}
          </button>
        ))}
      </div>
      <label htmlFor="ws-reminder" className="sr-only">{tr("Message")}</label>
      <textarea id="ws-reminder" className={`${inputClass} min-h-[11rem] leading-6`} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} />
      {udyam && (msmeTools ? (
        <label className="mt-2 flex cursor-pointer items-start gap-2 text-xs leading-5 text-ink">
          <input type="checkbox" checked={msmeRights} onChange={(e) => chooseRights(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#287a57]" />
          {tr("Add my MSME payment rights (Section 16 and 43B(h))")}
        </label>
      ) : (
        <p className="mt-2 text-xs text-charcoal">
          {tr("Pro can add your MSME payment rights (Section 16 and 43B(h)) to this message.")}{" "}
          <a href="/app/?tab=settings&upgrade=monthly" className="font-bold text-leaf underline">{tr("See Pro")}</a>
        </p>
      ))}
      {payLink && <p className="mt-2 text-xs text-leaf">{tr("Includes your pay link — the client sees the live amount and a UPI button.")}</p>}
      {!ws.business.upiId && <p className="mt-2 text-xs font-bold text-[#7a4b00]">{tr("Add your UPI ID in Settings so reminders tell clients where to pay.")}</p>}
      {!phone && <p className="mt-2 text-xs text-muted">{tr("No number saved for this client — WhatsApp will ask you to pick a chat.")}</p>}
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <button type="button" onClick={() => send("whatsapp")} className="rounded-[10px] bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1da851]">WhatsApp</button>
        <button type="button" onClick={() => send("sms")} className={secondaryButton}>SMS</button>
        <button type="button" onClick={copy} className={secondaryButton}>{copied ? tr("Copied ✓") : tr("Copy text")}</button>
      </div>
    </Sheet>
  );
}
