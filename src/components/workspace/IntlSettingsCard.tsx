import { useEffect, useRef, useState, type ReactNode } from "react";
import { editIntlSettings, type IntlSettings, type IntlSettingsForm, type PayDetailsFields, type Workspace } from "../../lib/workspace/model";
import {
  FOREIGN_CURRENCIES, fyOf, looksLikeIban, LUT_ENDORSEMENT, normalizeAccount, normalizeLutArn, normalizeSwift, safePayUrl, validIban,
  type ForeignCurrency,
} from "../../lib/workspace/currency";
import { expiredLutFy } from "./Sheets";
import { card, cardNote, cardTitle, dangerText, Field, inputClass, labelClass, secondaryButton } from "./ui";
import { useWs, type Tr } from "./i18n";

const EMPTY: PayDetailsFields = { accountName: "", bankName: "", swift: "", account: "", bankDetails: "", payUrl: "" };
const FIELDS = ["accountName", "bankName", "swift", "account", "bankDetails", "payUrl"] as const;
type Errors = Partial<Record<string, string>>;

/** The form's own state: what the inputs show. */
interface FormState {
  on: boolean;
  details: PayDetailsFields;
  overrides: Partial<Record<ForeignCurrency, PayDetailsFields>>;
  lut: boolean;
  arn: string;
  lutFy: string;
}

function formOf(saved: IntlSettings | undefined): FormState {
  const details = { ...EMPTY };
  if (saved) for (const field of FIELDS) details[field] = saved[field];
  return { on: saved?.on ?? false, details, overrides: { ...saved?.byCurrency }, lut: saved?.exportUnderLut ?? false, arn: saved?.lutArn ?? "", lutFy: saved?.lutFy ?? "" };
}

/** What a form state saves: the LUT fields only with the LUT on and a business GSTIN. */
function settingsOf(f: FormState, gstin: boolean): IntlSettingsForm {
  const lutOn = f.lut && gstin;
  return { on: f.on, ...f.details, byCurrency: f.overrides, exportUnderLut: lutOn, lutArn: lutOn ? f.arn : "", lutFy: lutOn ? f.lutFy : "" };
}

const sameForm = (a: FormState, b: FormState) => JSON.stringify(a) === JSON.stringify(b);

/** "2026-27" → "2025-26". */
function previousFy(fy: string): string {
  const start = Number(fy.slice(0, 4)) - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** The form's own checks, in the words of §5.2; the model's normalizers decide what is valid. */
function checkDetails(d: PayDetailsFields, tr: Tr, suffix: string, errors: Errors) {
  if (d.swift.trim() && !normalizeSwift(d.swift)) errors[`swift${suffix}`] = tr("Enter a valid SWIFT/BIC code (8 or 11 letters and digits).");
  const account = normalizeAccount(d.account);
  if (d.account.trim() && looksLikeIban(account) && !validIban(account)) errors[`account${suffix}`] = tr("This IBAN doesn't look right. Check it against your bank's details.");
  else if (d.account.trim() && !account) errors[`account${suffix}`] = tr("Enter the IBAN or account number (4 to 34 letters and digits).");
  if (d.payUrl.trim() && !safePayUrl(d.payUrl.trim())) errors[`payUrl${suffix}`] = tr("Enter an https link from PayPal, Wise or Stripe.");
}

/** The six receiving fields, for the default set (suffix "") or one currency's own set (suffix "-usd"). */
function DetailFields({ value, onChange, suffix, errors }: { value: PayDetailsFields; onChange: (next: PayDetailsFields) => void; suffix: string; errors: Errors }) {
  const { tr } = useWs();
  const set = (field: (typeof FIELDS)[number]) => (e: { target: { value: string } }) => onChange({ ...value, [field]: e.target.value });
  return (
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      <Field label={tr("Account name")} htmlFor={`ws-intl-account-name${suffix}`} error={errors[`accountName${suffix}`]}>
        <input id={`ws-intl-account-name${suffix}`} className={inputClass} value={value.accountName} onChange={set("accountName")} maxLength={80} autoComplete="off" />
      </Field>
      <Field label={tr("Bank name")} htmlFor={`ws-intl-bank${suffix}`} error={errors[`bankName${suffix}`]}>
        <input id={`ws-intl-bank${suffix}`} className={inputClass} value={value.bankName} onChange={set("bankName")} maxLength={80} autoComplete="off" />
      </Field>
      <Field label="SWIFT / BIC" htmlFor={`ws-intl-swift${suffix}`} error={errors[`swift${suffix}`]}>
        <input id={`ws-intl-swift${suffix}`} className={`${inputClass} font-mono uppercase`} value={value.swift} onChange={set("swift")} maxLength={14} autoComplete="off" autoCapitalize="characters" spellCheck={false} />
      </Field>
      <Field label={tr("IBAN or account number")} htmlFor={`ws-intl-account${suffix}`} error={errors[`account${suffix}`]}>
        <input id={`ws-intl-account${suffix}`} className={`${inputClass} font-mono uppercase`} value={value.account} onChange={set("account")} maxLength={48} autoComplete="off" autoCapitalize="characters" spellCheck={false} />
      </Field>
      <div className="sm:col-span-2">
        <Field label={tr("Bank address, routing or sort code (optional)")} htmlFor={`ws-intl-bank-details${suffix}`}>
          <textarea id={`ws-intl-bank-details${suffix}`} className={`${inputClass} min-h-[4.5rem] leading-6`} value={value.bankDetails} onChange={set("bankDetails")} maxLength={300} rows={3} />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label={tr("PayPal, Wise or Stripe payment link (optional)")} htmlFor={`ws-intl-pay-url${suffix}`} error={errors[`payUrl${suffix}`]}>
          <input id={`ws-intl-pay-url${suffix}`} type="url" className={inputClass} value={value.payUrl} onChange={set("payUrl")} maxLength={300} autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="https://paypal.me/yourname" />
        </Field>
        <p className="mt-1 text-xs leading-5 text-muted">{tr("Use a link from paypal.me, paypal.com, wise.com or buy.stripe.com.")}</p>
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-t border-hairline pt-4">
      <h3 className="mb-3 text-[13px] font-semibold text-ink">{title}</h3>
      {children}
    </div>
  );
}

/**
 * Settings → "Clients abroad" (docs/spec-foreign-clients.md §5.2): the per-business receiving details that reminders
 * and pay links of foreign-currency invoices show instead of UPI, optional per-currency sets, and the GST export
 * (LUT) line. A collapsed details card, closed until the business has saved something here.
 */
export function IntlSettingsCard({ ws, today, readOnly, onChange }: {
  ws: Workspace;
  today: string;
  readOnly: boolean;
  onChange: (next: Workspace, message?: string) => void;
}) {
  const { tr } = useWs();
  const saved = ws.intl?.settings;
  // `base` is what the form was filled from. A save applies only the difference between it and the form onto the
  // settings as they are now (editIntlSettings), so newer settings that sync or another tab merged in after the form
  // was filled are never overwritten by fields the user didn't touch.
  const [base, setBase] = useState<FormState>(() => formOf(saved));
  const [form, setForm] = useState<FormState>(base);
  const { on, details, overrides, lut, arn, lutFy } = form;
  const update = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));
  const setDetails = (next: PayDetailsFields) => update({ details: next });
  const firstOverride = FOREIGN_CURRENCIES.find((c) => saved?.byCurrency?.[c]) ?? "USD";
  const [overrideCurrency, setOverrideCurrency] = useState<ForeignCurrency>(firstOverride);
  const overrideRef = useRef<HTMLDetailsElement>(null);
  const thisFy = fyOf(today);
  const [errors, setErrors] = useState<Errors>({});
  // Newer settings arrived (sync, another tab, the book loading after the card mounted): an untouched form shows them.
  const dirty = !sameForm(form, base);
  useEffect(() => {
    if (dirty) return;
    const fresh = formOf(saved);
    setBase(fresh);
    setForm(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved?.updatedAt]);
  const gstin = Boolean(ws.business.gstin.trim());
  const fyOptions = [...new Set([thisFy, previousFy(thisFy), ...(lutFy ? [lutFy] : [])].filter(Boolean))];
  const expired = expiredLutFy(ws, today);
  const arnPreview = normalizeLutArn(arn) || arn.trim().toUpperCase() || "…";
  const suffix = `-${overrideCurrency.toLowerCase()}`;

  function save() {
    const next: Errors = {};
    checkDetails(details, tr, "", next);
    for (const currency of FOREIGN_CURRENCIES) {
      const set = overrides[currency];
      if (set) checkDetails(set, tr, `-${currency.toLowerCase()}`, next);
    }
    const lutOn = lut && gstin;
    if (lutOn && !normalizeLutArn(arn)) next.lutArn = tr("Enter the 15-character ARN.");
    if (lutOn && !lutFy) next.lutFy = tr("Choose the financial year of your LUT.");
    setErrors(next);
    // An error in a per-currency set shows that set.
    const bad = FOREIGN_CURRENCIES.find((c) => Object.keys(next).some((k) => k.endsWith(`-${c.toLowerCase()}`)));
    if (bad) {
      setOverrideCurrency(bad);
      // The error sits inside the per-currency details: open them so it can be seen.
      if (overrideRef.current) overrideRef.current.open = true;
    }
    if (Object.keys(next).length) return;
    const after = settingsOf(form, gstin);
    const nextWs = editIntlSettings(ws, settingsOf(base, gstin), after, Date.now());
    // The form is now the base, so the settings this save wrote refresh it (normalized) without counting as an edit.
    setBase(form);
    onChange(nextWs, tr("Payment details saved."));
  }

  return (
    <details className={`group ${card}`} open={Boolean(saved)}>
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 rounded-[12px] p-5 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className={`block ${cardTitle}`}>{tr("Clients abroad")}</span>
          <span className={`mt-0.5 block ${cardNote}`}>{tr("Invoice clients outside India in their currency. Reminders and pay links show your bank details instead of UPI.")}</span>
        </span>
        <svg className="mt-1 h-4 w-4 shrink-0 text-muted transition-transform duration-200 group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
        </svg>
      </summary>
      <form noValidate className="px-5 pb-5" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <fieldset disabled={readOnly} className="m-0 min-w-0 space-y-4 border-0 p-0">
          {expired && <p role="status" className="rounded-[10px] bg-[#fdf4e6] px-3 py-2 text-[13px] text-[#6b4600]">{tr("Your LUT for FY {fy} has expired. Add this year's ARN.", { fy: expired })}</p>}
          <label className="flex cursor-pointer items-start gap-2 text-sm font-medium text-ink">
            <input id="ws-intl-on" type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[#287a57]" checked={on} onChange={(e) => update({ on: e.target.checked })} />
            {tr("Invoice clients in other currencies")}
          </label>

          <Group title={tr("Details for all foreign currencies")}>
            <DetailFields value={details} onChange={setDetails} suffix="" errors={errors} />
          </Group>

          <details ref={overrideRef} className="group/override border-t border-hairline pt-4" open={Boolean(saved?.byCurrency && Object.keys(saved.byCurrency).length)}>
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[13px] font-medium text-leaf hover:underline [&::-webkit-details-marker]:hidden">
              {tr("Use different details for USD, EUR, GBP…")}
              <svg className="h-3.5 w-3.5 transition-transform duration-200 group-open/override:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
              </svg>
            </summary>
            <div className="mt-3 space-y-3">
              <p className="text-xs leading-5 text-muted">{tr("A multi-currency account (for example Wise) has different details per currency. Clients billed in that currency see these instead.")}</p>
              <div className="max-w-[12rem]">
                <label htmlFor="ws-intl-override-currency" className={labelClass}>{tr("Currency")}</label>
                <select id="ws-intl-override-currency" className={inputClass} value={overrideCurrency} onChange={(e) => setOverrideCurrency(e.target.value as ForeignCurrency)}>
                  {FOREIGN_CURRENCIES.map((c) => <option key={c} value={c}>{c}{overrides[c] && FIELDS.some((f) => overrides[c]![f].trim()) ? " ✓" : ""}</option>)}
                </select>
              </div>
              <DetailFields
                key={overrideCurrency}
                value={overrides[overrideCurrency] ?? EMPTY}
                onChange={(next) => setForm((f) => ({ ...f, overrides: { ...f.overrides, [overrideCurrency]: next } }))}
                suffix={suffix}
                errors={errors}
              />
            </div>
          </details>

          <div className="border-t border-hairline pt-4">
            <label className={`flex items-start gap-2 text-sm font-medium ${gstin ? "cursor-pointer text-ink" : "text-muted"}`}>
              <input id="ws-intl-lut" type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[#287a57]" checked={lut && gstin} disabled={!gstin} onChange={(e) => update({ lut: e.target.checked })} />
              {tr("Export under LUT (no IGST charged)")}
            </label>
            {!gstin && <p className="mt-1 pl-6 text-xs leading-5 text-muted">{tr("Add your GSTIN above to use an LUT.")}</p>}
            <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
              <div>
                <Field label="LUT ARN" htmlFor="ws-intl-lut-arn" error={errors.lutArn}>
                  <input id="ws-intl-lut-arn" className={`${inputClass} font-mono uppercase`} value={arn} onChange={(e) => update({ arn: e.target.value })} disabled={!gstin || !lut} maxLength={20} autoComplete="off" autoCapitalize="characters" spellCheck={false} />
                </Field>
                <p className="mt-1 text-xs leading-5 text-muted">{tr("The 15-character ARN from your RFD-11 acknowledgement.")}</p>
              </div>
              <div>
                <Field label={tr("Financial year of this LUT")} htmlFor="ws-intl-lut-fy" error={errors.lutFy}>
                  <select id="ws-intl-lut-fy" className={inputClass} value={lutFy} onChange={(e) => update({ lutFy: e.target.value })} disabled={!gstin || !lut}>
                    <option value="">—</option>
                    {fyOptions.map((fy) => <option key={fy} value={fy}>{fy}</option>)}
                  </select>
                </Field>
                <p className="mt-1 text-xs leading-5 text-muted">{tr("An LUT is valid only for the financial year it was furnished for.")}</p>
              </div>
            </div>
            {lut && gstin && (
              <div className="mt-3 rounded-[10px] bg-fog p-3">
                <p className="break-words font-mono text-[11px] leading-5 text-ink" data-lut-preview>{`${LUT_ENDORSEMENT} (LUT ARN ${arnPreview})`}</p>
                <p className="mt-2 text-xs leading-5 text-muted">{tr("This line is added to reminders and pay pages of invoices you mark as an export of services. Export status depends on the conditions in section 2(6) of the IGST Act, not on the invoice currency. Also print it on your tax invoice.")}</p>
              </div>
            )}
          </div>

          {Object.keys(errors).length > 0 && <p role="alert" className={`text-[13px] font-medium ${dangerText}`}>{tr("Some details need fixing. See the messages above.")}</p>}
          {/* A per-card save is secondary: Business details' "Save settings" stays the view's one filled action (DESIGN.md). */}
          <div className="flex items-end pt-1"><button type="submit" className={secondaryButton}>{tr("Save payment details")}</button></div>
        </fieldset>
      </form>
    </details>
  );
}
