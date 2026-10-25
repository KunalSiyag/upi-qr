import { useMemo, useRef, useState, type FormEvent } from "react";
import {
  addDays, addPayment, allLiveInvoices, clientCurrency, currencyOf, findClient, getInvoice, internationalDigits, intlPayable, isIsoDate, liveClients, logReminder, newId,
  monthAfter, nextInvoiceNumber, otherCurrencyBilling, parseRupeesToPaise, PAYMENT_MODES, recurringInvoiceId, reminderMessage, reviveClient, setClientCurrency,
  suggestedTone, upsertClient, upsertInvoice, upsertPlan, viewInvoice, whatsappLink, withoutTombstone, isUdyam, type Invoice, type PaymentMode, type ReminderLang,
  type OtherCurrencyBilling, type ReminderTone, type Workspace,
} from "../../lib/workspace/model";
import { CURRENCIES, formatMoney, fyOf, isForeignCurrency, minorToDecimal, parseMoneyToMinor, type CurrencyCode } from "../../lib/workspace/currency";
import { INTL_UI } from "../../lib/workspace/localStore";
import { dangerText, Field, inputClass, labelClass, primaryButton, secondaryButton, Sheet } from "./ui";
import { useWs, type Tr } from "./i18n";

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

/** Native <option> texts: raw codes and symbols, never tr() keys (docs/spec-foreign-clients.md §5.10). */
export const CURRENCY_OPTION: Record<CurrencyCode, string> = {
  INR: "INR (₹)", USD: "USD (US$)", EUR: "EUR (€)", GBP: "GBP (£)", AED: "AED", AUD: "AUD (A$)", CAD: "CAD (CA$)", SGD: "SGD",
};

/**
 * Whether the currency pickers show (§5.1): only with the clients-abroad UI on, and only once the business turned
 * "Invoice clients in other currencies" on or already holds a foreign-currency invoice. Otherwise every sheet is
 * exactly the INR-only one.
 */
export function intlPickers(ws: Workspace): boolean {
  return INTL_UI && (ws.intl?.settings?.on === true || allLiveInvoices(ws).some((invoice) => currencyOf(invoice) !== "INR"));
}

/** A WhatsApp number: 10+ digits, or 8+ when typed with "+" for a client billed in a foreign currency (§5.4). */
export function phoneOk(phone: string, international: boolean): boolean {
  const digits = phone.replace(/\D/g, "").length;
  return digits >= 10 || (international && phone.trim().startsWith("+") && digits >= 8);
}

/** "Dec 2026" in the workspace language, with a no-break space so a month never wraps mid-name at 390px. */
function monthName(month: string, locale: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(locale, { month: "short", year: "numeric", timeZone: "UTC" }).replace(/ /g, "\u00a0");
}

/** The month before `month` ("2027-01" → "2026-12"). */
function monthBefore(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/**
 * Why a new monthly billing can't start (review rounds 1-3, PR 5): `other`, in another currency, already bills a month
 * the new one would. Every piece of advice leaves no month billed twice and none billed in neither currency: end the new
 * plan before the other starts, date it after the other's last month, or (an open-ended plan) stop that one first and
 * date the new one the month after its last month, or stop it in the month before the new one starts.
 */
export function overlapMessage(tr: Tr, locale: string, name: string, other: OtherCurrencyBilling, fromMonth: string): string {
  const vars = { name, currency: other.currency };
  const month = (m: string) => monthName(m, locale);
  if (other.first > fromMonth) {
    return other.last
      ? tr("{name} already has monthly billing in {currency} from {month} to {last}. Set the last month to bill before {month}, or date this invoice in {next} or later.", { ...vars, month: month(other.first), last: month(other.last), next: month(monthAfter(other.last)) })
      : tr("{name}'s monthly billing in {currency} starts in {month}. Set the last month to bill before {month} so no month is billed twice.", { ...vars, month: month(other.first) });
  }
  if (other.last) {
    return tr("{name} already has monthly billing in {currency} until {month}. Date this invoice in {next} or later so no month is billed twice.", { ...vars, month: month(other.last), next: month(monthAfter(other.last)) });
  }
  // Open-ended: "Stop after this month" ends it in today's month (keeping what it already billed). The first month after
  // that is the one gap-free start; a later start means stopping it later, in the month before.
  const next = other.lastIfStopped ? monthAfter(other.lastIfStopped) : fromMonth;
  if (fromMonth > next) {
    return tr("{name} already has monthly billing in {currency} with no end month. To switch in {month}, stop it during {prev} (Clients → Monthly billing → Stop after this month) and add this invoice then, or stop it now and date this invoice in {next}.", { ...vars, month: month(fromMonth), prev: month(monthBefore(fromMonth)), next: month(next) });
  }
  return tr("{name} already has monthly billing in {currency} with no end month. Stop it first (Clients → Monthly billing → Stop after this month), then date this invoice in {next}.", { ...vars, next: month(next) });
}

export function InvoiceSheet({ ws, today, invoiceId, onSave, onClose }: {
  ws: Workspace;
  today: string;
  invoiceId?: string;
  onSave: (next: Workspace, invoiceId: string) => void;
  onClose: () => void;
}) {
  const existing = invoiceId ? getInvoice(ws, invoiceId) : undefined;
  const { tr, dateLocale } = useWs();
  const existingClient = existing ? ws.clients[existing.clientId] : undefined;
  const clients = useMemo(() => liveClients(ws), [ws]);
  const settings = ws.intl?.settings;
  const [clientName, setClientName] = useState(existingClient?.name ?? "");
  const [phone, setPhone] = useState(existingClient?.phone ?? "");
  const [number, setNumber] = useState(existing?.number ?? nextInvoiceNumber(ws));
  const [amount, setAmount] = useState(existing ? minorToDecimal(existing.amountPaise) : "");
  const [issueDate, setIssueDate] = useState(existing?.issueDate ?? today);
  const [dueDate, setDueDate] = useState(existing?.dueDate ?? addDays(today, 15));
  const [description, setDescription] = useState(existing?.description ?? "");
  const [repeat, setRepeat] = useState(false);
  const [untilMonth, setUntilMonth] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [exportLut, setExportLut] = useState(existing ? existing.exportLut === true : true);
  // INTL_UI at the use site (not only inside intlPickers) so a flag-off build drops the picker code.
  const showPicker = INTL_UI && intlPickers(ws);
  const matched = clients.find((c) => c.name.trim().toLowerCase() === clientName.trim().toLowerCase());
  // The currency is chosen once, when the invoice is created, and never changes afterwards (owner decision,
  // 2026-10-25): to bill in another currency the user deletes the invoice and creates a new one. A new invoice follows
  // the matched client's billing currency until the user picks one in the select.
  const [picked, setPicked] = useState<CurrencyCode | null>(null);
  const currency: CurrencyCode = existing
    ? currencyOf(existing)
    : picked ?? (showPicker && matched ? clientCurrency(ws, matched.id) : "INR");
  const foreign = isForeignCurrency(currency);
  // The export choice needs the LUT on and a business GSTIN (§0, §6): a LUT left stored after the GSTIN was cleared
  // offers nothing. A client with an Indian GSTIN is not an export recipient: no export choice for them (§5.3, §6).
  const lutOn = settings?.exportUnderLut === true && Boolean(ws.business.gstin.trim());
  const showExport = foreign && lutOn && !matched?.gstin.trim();
  // The client the invoice is saved to: the edited invoice's client while the name still matches, otherwise a live
  // client matched by phone or name (submit() and the overlap check must agree, review round 2).
  const resolveClient = () => existingClient && existingClient.name.trim().toLowerCase() === clientName.trim().toLowerCase()
    ? existingClient
    : findClient(ws, clientName, phone);
  // A new monthly billing in one currency that shares any month with the client's billing in another currency would
  // bill that month twice (review rounds 1-3, PR 5), so it can't be saved. Checked with the pickers hidden too (an INR
  // plan then): a client can keep a foreign plan after the switch is turned off and its invoices are deleted. A book
  // with no foreign plan or plan invoice finds nothing, so INR-only sheets never show it.
  const target = !existing && repeat && isIsoDate(issueDate) ? resolveClient() : undefined;
  const overlap = target && (!untilMonth || untilMonth >= issueDate.slice(0, 7))
    ? otherCurrencyBilling(ws, target.id, issueDate.slice(0, 7), untilMonth, currency, today.slice(0, 7))
    : undefined;
  const overlapText = overlap && target ? overlapMessage(tr, dateLocale, target.name, overlap, issueDate.slice(0, 7)) : "";
  // Billing that starts later is fixed by the last month; the rest by the invoice date.
  const overlapField = overlap && overlap.first > issueDate.slice(0, 7) ? "ws-until" : "ws-issue";

  function pickClient(name: string) {
    setClientName(name);
    const match = clients.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());
    if (match && !phone) setPhone(match.phone);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const amountPaise = parseMoneyToMinor(amount, currency);
    const next: Record<string, string> = {};
    if (!clientName.trim()) next.client = tr("Who is this invoice for?");
    if (!amountPaise) next.amount = foreign ? tr("Enter the amount like 1,200.50.") : tr("Enter an amount like 1500 or 1500.50.");
    if (!number.trim()) next.number = tr("Invoice number is required.");
    if (!isIsoDate(issueDate)) next.issueDate = tr("Pick a valid date.");
    if (!isIsoDate(dueDate)) next.dueDate = tr("Pick a valid date.");
    else if (isIsoDate(issueDate) && dueDate < issueDate) next.dueDate = tr("Due date can't be before the invoice date.");
    // One number series across INR and foreign invoices.
    const duplicate = allLiveInvoices(ws).find((i) => i.id !== invoiceId && i.number.trim().toLowerCase() === number.trim().toLowerCase());
    if (duplicate) next.number = tr("{number} already exists.", { number: duplicate.number });
    // A client billed abroad keeps their + number on an INR invoice too (the same rule as the reminder sheet).
    if (phone && !phoneOk(phone, foreign || (matched ? clientCurrency(ws, matched.id) !== "INR" : false))) next.phone = tr("Enter a 10-digit mobile number, or leave it blank.");
    if (repeat && untilMonth && isIsoDate(issueDate) && untilMonth < issueDate.slice(0, 7)) next.until = tr("The last month can't be before the first invoice.");
    setErrors(next);
    if (Object.keys(next).length || !amountPaise) return;
    if (overlap) {
      // Blocked, never only warned: the message under Repeat says what to change; focus the field it names.
      document.getElementById(overlapField)?.focus();
      return;
    }

    const now = Date.now();
    let ws2 = ws;
    let client = resolveClient();
    if (!client) {
      client = { id: newId("cli"), name: clientName.trim().slice(0, 80), phone: phone.trim(), email: "", gstin: "", createdAt: now, updatedAt: now };
      ws2 = upsertClient(ws2, client, now);
      // A client first billed in a foreign currency keeps it as their default.
      if (foreign) ws2 = setClientCurrency(ws2, client.id, currency, now);
    } else {
      // An edit to an invoice whose client was deleted elsewhere while this sheet was open brings the client back with
      // the invoice (and, for a foreign invoice, its billing currency), never a live invoice on a deleted client.
      if (client.deletedAt) {
        ws2 = reviveClient(ws2, client.id, currency, now);
        client = ws2.clients[client.id];
      }
      if (phone.trim() && phone.trim() !== client.phone) {
        client = { ...client, phone: phone.trim() };
        ws2 = upsertClient(ws2, client, now);
      }
    }
    // Not offered: a new invoice is unmarked, and an edit with the LUT off keeps the mark it has (a client with a GSTIN
    // under an active LUT loses it).
    const marked = foreign && (showExport ? exportLut : !lutOn && existing?.exportLut === true);
    const money = (record: Invoice): Invoice => {
      const { currency: _c, exportLut: _e, ...rest } = record;
      return { ...rest, ...(isForeignCurrency(currency) ? { currency } : {}), ...(marked ? { exportLut: true as const } : {}) };
    };
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
        ...(isForeignCurrency(currency) ? { currency } : {}),
        createdAt: now,
        updatedAt: now,
      }, now);
    }
    const edits = {
      number: number.trim().slice(0, 40),
      clientId: client.id,
      issueDate,
      dueDate,
      amountPaise,
      description: description.trim().slice(0, 300),
    };
    if (existing) {
      // Spread over the stored record, so fields this sheet doesn't edit are kept; one another tab or device deleted
      // while this sheet was open comes back with the edits. The currency stays the invoice's own.
      const base = withoutTombstone(getInvoice(ws2, existing.id) ?? existing);
      onSave(upsertInvoice(ws2, money({ ...base, ...edits }), now), existing.id);
      return;
    }
    const invoice: Invoice = money({
      id: planId ? recurringInvoiceId(planId, issueDate.slice(0, 7)) : newId("inv"),
      ...edits,
      payments: [],
      reminders: [],
      voided: false,
      ...(planId ? { recurringId: planId } : {}),
      createdAt: now,
      updatedAt: now,
    });
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
            <input id="ws-phone" className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="off" maxLength={20} placeholder={foreign ? "+1 415 555 0100" : "98765 43210"} />
          </Field>
          {showPicker ? (
            <div className="grid grid-cols-[minmax(0,1fr)_7.5rem] gap-2 sm:col-span-2">
              <Field label={foreign ? tr("Amount ({currency})", { currency }) : tr("Amount (₹)")} htmlFor="ws-amount" error={errors.amount}>
                <input id="ws-amount" className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder={foreign ? "1,200.50" : "1500"}
                  aria-describedby={existing ? "ws-currency-note" : undefined} />
              </Field>
              {existing ? (
                // Fixed at creation: shown as text, never a control (owner decision, 2026-10-25).
                <div>
                  <p className={labelClass}>{tr("Currency")}</p>
                  <p id="ws-currency-fixed" className="rounded-[10px] border border-transparent bg-fog px-3 py-2 text-sm text-ink">{CURRENCY_OPTION[currency]}</p>
                </div>
              ) : (
                <Field label={tr("Currency")} htmlFor="ws-currency">
                  <select id="ws-currency" className={inputClass} value={currency} onChange={(e) => setPicked(e.target.value as CurrencyCode)}>
                    {CURRENCIES.map((c) => <option key={c} value={c}>{CURRENCY_OPTION[c]}</option>)}
                  </select>
                </Field>
              )}
              {existing && (
                <p id="ws-currency-note" className="col-span-2 -mt-1 text-xs leading-5 text-muted">
                  {tr("The currency can't be changed. To bill in another currency, delete this invoice and create a new one.")}
                </p>
              )}
            </div>
          ) : (
            <Field label={foreign ? tr("Amount ({currency})", { currency }) : tr("Amount (₹)")} htmlFor="ws-amount" error={errors.amount}>
              <input id="ws-amount" className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder={foreign ? "1,200.50" : "1500"} />
            </Field>
          )}
          <Field label={tr("Invoice number")} htmlFor="ws-number" error={errors.number}>
            <input id="ws-number" className={inputClass} value={number} onChange={(e) => setNumber(e.target.value)} maxLength={40} />
          </Field>
          <Field label={tr("Invoice date")} htmlFor="ws-issue" error={errors.issueDate}>
            <input id="ws-issue" type="date" className={inputClass} value={issueDate} onChange={(e) => setIssueDate(e.target.value)}
              aria-describedby={overlapField === "ws-issue" && overlap ? "ws-plan-overlap" : undefined} aria-invalid={overlapField === "ws-issue" && overlap ? true : undefined} />
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
        {showExport && (
          <label className="flex cursor-pointer items-start gap-2 text-sm text-ink">
            <input id="ws-export-lut" type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[#287a57]" checked={exportLut} onChange={(e) => setExportLut(e.target.checked)} />
            <span>{tr("Export of services (zero-rated under LUT)")}</span>
          </label>
        )}
        {!existing && (
          <div className="rounded-[10px] bg-cream p-3">
            <label className="flex cursor-pointer items-start gap-2 text-sm font-bold text-ink">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#287a57]" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
              <span>{tr("Repeat every month")}<span className="block text-xs font-normal text-muted">{tr("For tuition fees, rent, memberships, maintenance. A new invoice is created on day {d} of each month.", { d: isIsoDate(issueDate) ? Math.min(28, Number(issueDate.slice(8, 10))) : "—" })}</span></span>
            </label>
            {repeat && (
              <div className="mt-3">
                <Field label={tr("Last month to bill (optional)")} htmlFor="ws-until" error={errors.until}>
                  <input id="ws-until" type="month" className={inputClass} value={untilMonth} onChange={(e) => setUntilMonth(e.target.value)}
                    aria-describedby={overlapField === "ws-until" && overlap ? "ws-plan-overlap" : undefined} aria-invalid={overlapField === "ws-until" && overlap ? true : undefined} />
                </Field>
              </div>
            )}
            {overlap && (
              <p id="ws-plan-overlap" data-plan-overlap="" role="status" className={`mt-2 text-xs font-medium ${dangerText}`}>{overlapText}</p>
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
  const currency = view.currency;
  // A payment from abroad: no UPI, bank transfer by default, and the rupees the bank credited (§5.5).
  const foreign = isForeignCurrency(currency);
  const modes = foreign ? PAYMENT_MODES.filter((m) => m !== "upi") : PAYMENT_MODES;
  const [amount, setAmount] = useState(minorToDecimal(Math.min(initialAmountPaise ?? view.balancePaise, view.balancePaise)));
  const [date, setDate] = useState(today);
  const [mode, setMode] = useState<PaymentMode>(foreign ? "bank" : "upi");
  const [reference, setReference] = useState(initialReference ?? "");
  const [credited, setCredited] = useState("");
  const [creditedError, setCreditedError] = useState("");
  const creditedRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    const amountPaise = parseMoneyToMinor(amount, currency);
    if (!amountPaise) return setError(foreign ? tr("Enter the amount like 1,200.50.") : tr("Enter the amount received."));
    if (!isIsoDate(date)) return setError(tr("Pick the date you received it."));
    if (amountPaise > view.balancePaise) return setError(tr("That's more than the {amount} still due.", { amount: formatMoney(view.balancePaise, currency) }));
    // INR credited is always rupees, whatever the invoice's currency.
    const creditedPaise = foreign && credited.trim() ? parseRupeesToPaise(credited) : null;
    // Under its own field: the sheet has two amounts, and this one is in rupees.
    if (foreign && credited.trim() && !creditedPaise) {
      setCreditedError(tr("Enter an amount like 1500 or 1500.50."));
      creditedRef.current?.focus();
      return;
    }
    onSave(addPayment(ws, invoiceId, { amountPaise, date, mode, reference: reference.trim().slice(0, 60), ...(creditedPaise ? { inrCreditedPaise: creditedPaise } : {}) }, Date.now()));
  }

  return (
    <Sheet title={tr("Payment for {number}", { number: view.invoice.number })} onClose={onClose}>
      <p className="mb-4 text-sm text-charcoal">
        {view.client?.name ?? tr("Client")} · {tr("{due} still due of {total}", { due: formatMoney(view.balancePaise, currency), total: formatMoney(view.invoice.amountPaise, currency) })}
      </p>
      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={foreign ? tr("Amount received ({currency})", { currency }) : tr("Amount received (₹)")} htmlFor="ws-pay-amount">
            <input id="ws-pay-amount" className={inputClass} value={amount} onChange={(e) => { setAmount(e.target.value); setError(""); }} inputMode="decimal" />
          </Field>
          <Field label={tr("Received on")} htmlFor="ws-pay-date">
            <input id="ws-pay-date" type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} max={today} />
          </Field>
          <Field label={tr("Mode")} htmlFor="ws-pay-mode">
            <select id="ws-pay-mode" className={inputClass} value={mode} onChange={(e) => setMode(e.target.value as PaymentMode)}>
              {modes.map((m) => <option key={m} value={m}>{tr(MODE_LABEL[m])}</option>)}
            </select>
          </Field>
          <Field label={foreign ? tr("Transfer reference (optional)") : mode === "upi" ? tr("UTR / reference (optional)") : tr("Reference (optional)")} htmlFor="ws-pay-ref">
            <input id="ws-pay-ref" className={inputClass} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={60} placeholder={mode === "upi" ? tr("12-digit UTR") : ""} />
          </Field>
          {foreign && (
            <div className="sm:col-span-2">
              <Field label={tr("INR credited (₹, optional)")} htmlFor="ws-pay-inr" error={creditedError}>
                <input ref={creditedRef} id="ws-pay-inr" className={inputClass} value={credited} onChange={(e) => { setCredited(e.target.value); setCreditedError(""); setError(""); }} inputMode="decimal" placeholder="99840"
                  aria-invalid={creditedError ? true : undefined} aria-describedby={creditedError ? "ws-pay-inr-error ws-pay-inr-hint" : "ws-pay-inr-hint"} />
              </Field>
              <p id="ws-pay-inr-hint" className="mt-1 text-xs leading-5 text-muted">{tr("The rupees your bank credited, as on the FIRA/FIRC. Keep it for your records.")}</p>
            </div>
          )}
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

/** The LUT's financial year when it has ended (today is in a later FY), else "" (§5.2, §6). Never without a business GSTIN. */
export function expiredLutFy(ws: Workspace, today: string): string {
  const s = ws.intl?.settings;
  if (!s?.exportUnderLut || !s.lutFy || !ws.business.gstin.trim()) return "";
  const now = fyOf(today);
  return now && now > s.lutFy ? s.lutFy : "";
}

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
  const currency = view.currency;
  const foreign = isForeignCurrency(currency);
  const intl = ws.intl?.settings;
  const [tone, setTone] = useState<ReminderTone>(suggestedTone(view));
  const [lang, setLang] = useState<ReminderLang>(() => {
    // A client abroad reads English first (the user can switch); otherwise a remembered choice wins, then the app language.
    if (foreign) return "en";
    try {
      const saved = localStorage.getItem(REMINDER_LANG_KEY);
      return saved === "hi" || saved === "en" ? saved : uiLang;
    } catch { return uiLang; }
  });
  const [msmeRights, setMsmeRights] = useState(false);
  const [message, setMessage] = useState(() => reminderMessage(view, ws.business, suggestedTone(view), payLink, lang, false, intl));
  // The MSMED Act protects suppliers against buyers in India: never offered on a foreign invoice.
  const udyam = isUdyam(ws.business.udyam) && !foreign;
  const [copied, setCopied] = useState(false);
  const phone = view.client?.phone ?? "";
  const last = view.invoice.reminders.at(-1);
  // A number typed with + is used as typed only for a foreign invoice or a client billed abroad (§3.8).
  const international = foreign || (view.client ? clientCurrency(ws, view.client.id) !== "INR" : false);
  const expiredFy = foreign && view.invoice.exportLut ? expiredLutFy(ws, today) : "";

  function chooseTone(next: ReminderTone) {
    setTone(next);
    setMessage(reminderMessage(view, ws.business, next, payLink, lang, msmeRights, intl));
  }

  function chooseLang(next: ReminderLang) {
    setLang(next);
    try { localStorage.setItem(REMINDER_LANG_KEY, next); } catch { /* not remembered */ }
    setMessage(reminderMessage(view, ws.business, tone, payLink, next, msmeRights, intl));
  }

  function chooseRights(next: boolean) {
    setMsmeRights(next);
    setMessage(reminderMessage(view, ws.business, tone, payLink, lang, next, intl));
  }

  function send(channel: "whatsapp" | "sms") {
    const typed = phone.trim();
    const asTyped = international && (typed.startsWith("+") || typed.startsWith("00"));
    const digits = asTyped ? internationalDigits(phone) : phone.replace(/\D/g, "").slice(-10);
    const url = channel === "whatsapp"
      ? whatsappLink(phone, message, { international })
      : `sms:${digits ? (asTyped ? `+${digits}` : `+91${digits}`) : ""}?body=${encodeURIComponent(message)}`;
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
        {view.invoice.number} · {tr("{amount} due", { amount: formatMoney(view.balancePaise, currency) })}
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
      {payLink && <p className="mt-2 text-xs text-leaf">{foreign ? tr("With a pay link, the client sees the live amount and your bank details.") : tr("Includes your pay link — the client sees the live amount and a UPI button.")}</p>}
      {foreign
        ? !payLink && isForeignCurrency(currency) && !intlPayable(intl, currency) && <p className="mt-2 text-xs font-bold text-[#7a4b00]">{tr("Add international payment details in Settings so the client knows how to pay.")}</p>
        : !ws.business.upiId && <p className="mt-2 text-xs font-bold text-[#7a4b00]">{tr("Add your UPI ID in Settings so reminders tell clients where to pay.")}</p>}
      {expiredFy && <p className="mt-2 text-xs font-bold text-[#7a4b00]">{tr("Your LUT for FY {fy} has expired. Add this year's ARN.", { fy: expiredFy })}</p>}
      {!phone && <p className="mt-2 text-xs text-muted">{tr("No number saved for this client — WhatsApp will ask you to pick a chat.")}</p>}
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <button type="button" onClick={() => send("whatsapp")} className="rounded-[10px] bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1da851]">WhatsApp</button>
        <button type="button" onClick={() => send("sms")} className={secondaryButton}>SMS</button>
        <button type="button" onClick={copy} className={secondaryButton}>{copied ? tr("Copied ✓") : tr("Copy text")}</button>
      </div>
    </Sheet>
  );
}
