import React, { Fragment, useId, useMemo, useState } from "react";
import type { DocLang } from "../data/documentLang";
import { localTranslator } from "../lib/localPhrases";
import { UPI_ID_PHRASES } from "../data/upiIdPhrases";
import { trackProductEvent } from "../lib/productEvents";
import {
  NEW_ID_HANDLES,
  UPI_ID_REVIEWED_ON,
  checkVpa,
  reviewedLabel,
  sourceById,
  suggestVpas,
  type SourceId,
  type VpaIssue,
} from "../lib/upi-id";

const ISSUE_TEXT: Record<VpaIssue, string> = {
  empty: "Type a UPI ID such as name@okicici.",
  space: "Remove the spaces. A UPI ID has none.",
  "no-at": "Add an @ and the handle after it, for example @ybl or @oksbi.",
  "many-at": "Use exactly one @ sign.",
  "local-missing": "Add something before the @, such as your name or shop name.",
  "handle-missing": "Add the handle after the @, for example ybl or oksbi.",
  "local-chars": "Before the @, use only letters, digits, dot, hyphen and underscore.",
  "handle-chars": "After the @, use letters and digits only, with no dots, hyphens or symbols.",
};

/** Each line restates a first-party page listed in STEP_SOURCES; a menu the sources do not name is not given. */
const APP_STEPS: { app: string; steps: string }[] = [
  {
    app: "Google Pay",
    steps: "Tap your photo, then Bank account, pick the account and open Manage UPI IDs. Next to the ID you want, tap Add. You can have up to 4 IDs per bank account and delete one from its three-dot menu.",
  },
  {
    app: "Paytm",
    steps: "Tap your profile icon, then UPI & Payment Settings and the UPI ID section. Paytm does not let you type an ID: you pick one of the options it generates for your account and can set it as primary.",
  },
  {
    app: "PhonePe",
    steps: "Tap your profile picture and look for your UPI IDs. PhonePe says users can use more than one ID, on its @ybl, @ibl and @axl handles.",
  },
  {
    app: "Any UPI app",
    steps: "Look for the line that starts with UPI ID on the home screen or on your profile page below your QR code. NPCI's guidelines ask apps to show it there.",
  },
];

const STEP_SOURCES: SourceId[] = ["gpay", "paytm-support", "paytm-change", "phonepe-guide", "phonepe-icici", "phonepe-axis", "npci"];

export function UpiIdHelper({ lang = "en" }: { lang?: DocLang } = {}) {
  const tr = useMemo(() => localTranslator(lang, UPI_ID_PHRASES), [lang]);
  // English copy on the other locales is not Arabic, Japanese and so on: mark it as English and keep it left to right.
  const regionalLang = lang === "hi" || lang === "ta" || lang === "te" || lang === "mr" ? lang : "en";
  const id = useId();
  const [vpa, setVpa] = useState("");
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [handle, setHandle] = useState("ybl");
  const [copied, setCopied] = useState<string | null>(null);
  const [copyFailed, setCopyFailed] = useState<string | null>(null);
  // Any edit to the name, number or handle changes the ideas, so an old "could not copy" no longer applies.
  const edit = (setter: (value: string) => void) => (event: { target: { value: string } }) => {
    setCopyFailed(null);
    setter(event.target.value);
  };

  const check = checkVpa(vpa);
  const typed = !check.issues.includes("empty");
  const ideas = suggestVpas(name, mobile, handle);
  const home = lang === "en" ? "/" : `/${lang}/`;
  const decoder = lang === "en" ? "/upi-qr-decoder/" : `/${lang}/upi-qr-decoder/`;
  // Nothing typed here goes into a link: the QR page asks for the ID again, so no ID or name reaches a URL or analytics.
  const qrPage = lang === "en" ? "/upi-id-to-qr-code-generator/" : `/${lang}/upi-id-to-qr-code-generator/`;
  const copyFailedNow = copyFailed !== null;

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyFailed(null);
      setCopied(text);
      trackProductEvent("copy", "upi-id-generator");
      setTimeout(() => setCopied((current) => (current === text ? null : current)), 1800);
    } catch {
      setCopied(null);
      setCopyFailed(text);
    }
  };

  const card = "rounded-[12px] border border-forest/10 bg-white p-5 sm:p-6";
  const input =
    "mt-2 w-full rounded-[10px] border border-forest/15 bg-white px-4 py-3 text-base placeholder:text-forest/65 focus:border-leaf";
  const label = "block text-sm font-semibold text-forest";
  const secondary =
    "rounded-[10px] bg-white px-4 py-2.5 text-sm font-semibold text-forest ring-1 ring-forest/15 transition hover:ring-forest/30";
  const sourceLink = "font-semibold text-leaf underline-offset-2 hover:underline";

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5" lang={regionalLang} dir="ltr">
      <section className={card} aria-labelledby={`${id}-check`}>
        <h2 id={`${id}-check`} className="text-xl font-semibold text-forest">{tr("Check how a UPI ID is written")}</h2>
        <label className={`${label} mt-4`} htmlFor={`${id}-vpa`}>{tr("UPI ID (VPA)")}</label>
        <input
          id={`${id}-vpa`}
          data-upi-id-input
          type="text"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={vpa}
          onChange={(event) => setVpa(event.target.value)}
          placeholder="name@okicici"
          aria-invalid={typed && !check.ok}
          aria-describedby={`${id}-result ${id}-note`}
          className={`${input} font-mono`}
        />
        <div id={`${id}-result`} className="mt-4 rounded-[10px] bg-fog px-4 py-3 text-sm" role="status" aria-live="polite" data-upi-id-result>
          {!typed ? (
            <p className="text-charcoal">{tr(ISSUE_TEXT.empty)}</p>
          ) : check.ok ? (
            <div>
              <p className="font-semibold text-forest">{tr("Looks well-formed. No format problems found.")}</p>
              <dl className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-[auto_1fr]">
                <dt className="text-charcoal">{tr("Before the @")}</dt>
                <dd className="break-all font-mono text-forest">{check.local}</dd>
                <dt className="text-charcoal">{tr("Handle")}</dt>
                <dd className="break-all font-mono text-forest">@{check.handle}</dd>
                <dt className="text-charcoal">{tr("Issued through")}</dt>
                <dd className="text-forest">{check.issuer !== null ? tr(check.issuer) : tr("Not in our list. That is fine: apps add new handles.")}</dd>
              </dl>
              {check.legacy && (
                <p className="mt-2 text-charcoal">{tr("This is an older handle. Apps now issue new IDs on other handles, so check which ID your app shows.")}</p>
              )}
              {check.hasUppercase && (
                <p className="mt-2 text-charcoal">
                  {tr("UPI IDs are usually written in lowercase. Use this form:")} <span className="break-all font-mono text-forest">{check.normalized}</span>
                </p>
              )}
              {!check.qrReady && (
                <p className="mt-2 text-charcoal">{tr("This site's QR generator needs at least 2 characters before the @ and letters only after it, so it cannot use this ID yet. That is this site's rule, not a UPI rule.")}</p>
              )}
            </div>
          ) : (
            <div>
              <p className="font-semibold text-forest">{tr("This ID has a format problem.")}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-charcoal">
                {check.issues.map((issue) => <li key={issue}>{tr(ISSUE_TEXT[issue])}</li>)}
              </ul>
            </div>
          )}
        </div>
        <p id={`${id}-note`} className="mt-3 text-xs leading-relaxed text-charcoal">
          {tr("This checks the written format only. It cannot tell whether an ID exists or who owns it, and nothing you type leaves your browser.")}{" "}
          {tr("Apps can be stricter about length and symbols. If your app rejects a name, try plain letters and digits.")}
        </p>
      </section>

      <section className={card} aria-labelledby={`${id}-ideas`}>
        <h2 id={`${id}-ideas`} className="text-xl font-semibold text-forest">{tr("Ideas for a new UPI ID")}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-1">
            <label className={label} htmlFor={`${id}-name`}>{tr("Your or your shop's name")}</label>
            <input
              id={`${id}-name`}
              data-upi-id-name
              type="text"
              autoComplete="off"
              value={name}
              onChange={edit(setName)}
              placeholder="Sharma Kirana Store"
              className={input}
            />
          </div>
          <div>
            <label className={label} htmlFor={`${id}-mobile`}>{tr("Mobile number (optional)")}</label>
            <input
              id={`${id}-mobile`}
              data-upi-id-mobile
              type="tel"
              autoComplete="off"
              value={mobile}
              onChange={edit(setMobile)}
              placeholder="98765 43210"
              className={input}
            />
          </div>
          <div>
            <label className={label} htmlFor={`${id}-handle`}>{tr("Handle")}</label>
            <select id={`${id}-handle`} data-upi-id-handle value={handle} onChange={edit(setHandle)} className={input}>
              {NEW_ID_HANDLES.map((item) => (
                <option key={item.handle} value={item.handle}>@{item.handle} · {item.issuer}</option>
              ))}
            </select>
          </div>
        </div>
        {ideas.length === 0 ? (
          <p className="mt-4 text-sm text-charcoal">{tr("Add your name in English letters to see ideas.")}</p>
        ) : (
          <ul className="mt-4 divide-y divide-forest/10 rounded-[10px] border border-forest/10" data-upi-id-ideas>
            {ideas.map((idea) => {
              const buttonText = copied === idea ? tr("ID copied") : tr("Copy ID");
              return (
                <li key={idea} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="select-all break-all font-mono text-sm text-forest">{idea}</span>
                  <button type="button" onClick={() => copy(idea)} aria-label={`${buttonText}: ${idea}`} className={secondary}>
                    {buttonText}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <p className="sr-only" role="status" aria-live="polite" data-upi-id-copied>
          {copied !== null ? `${tr("ID copied")}: ${copied}` : ""}
        </p>
        <p className={copyFailedNow ? "mt-3 text-sm font-semibold text-forest" : "sr-only"} role="status" aria-live="polite" data-upi-id-copy-failed>
          {copyFailedNow ? tr("Could not copy. Select the text and copy it.") : ""}
        </p>
        <p className="mt-3 text-xs leading-relaxed text-charcoal">
          {tr("These are examples only. Your UPI app decides whether an ID is free when you register it, so try another if it is taken.")}{" "}
          {tr("Paytm and Google Pay show a list of IDs to pick from, so a typed name only helps in apps that ask for one.")}{" "}
          {tr("An ID built from your mobile number shows that number to everyone you give the ID to.")}
        </p>
      </section>

      <section className={card} aria-labelledby={`${id}-find`}>
        <h2 id={`${id}-find`} className="text-xl font-semibold text-forest">{tr("Where to find or add your UPI ID")}</h2>
        <p className="mt-3 text-sm leading-relaxed text-charcoal">
          {tr("A website cannot create a UPI ID. Your UPI app does, after you link your bank account in it. NPCI describes an ID as a part you choose before the @ and a handle after it that the app sets.")}
        </p>
        <p className="mt-3 text-sm leading-relaxed text-charcoal">
          {tr("Do not count on editing an existing ID: Paytm says it cannot be edited, and Google Pay lets you delete an ID and add another. To change your ID, add the one you want and use that.")}
        </p>
        <ul className="mt-4 divide-y divide-forest/10 rounded-[10px] border border-forest/10">
          {APP_STEPS.map((item) => (
            <li key={item.app} className="px-4 py-3 text-sm">
              <span className="font-semibold text-forest">{tr(item.app)}</span>
              <span className="ml-2 text-charcoal">{tr(item.steps)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-charcoal" data-upi-id-checked>
          {tr("Steps checked against the sources below on {date}. Menus change between app versions. If yours looks different, search the app's help for UPI ID.").replace("{date}", reviewedLabel(UPI_ID_REVIEWED_ON, lang))}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-charcoal">
          {tr("Sources")}:{" "}
          {STEP_SOURCES.map((sourceId, index) => {
            const source = sourceById(sourceId);
            return (
              <Fragment key={sourceId}>
                {index > 0 && " · "}
                <a href={source.href} target="_blank" rel="noopener noreferrer nofollow" className={sourceLink}>{source.short}</a>
              </Fragment>
            );
          })}
        </p>
      </section>

      <section className="flex flex-col gap-3 rounded-[12px] bg-fog p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <p className="text-sm text-charcoal">{tr("Happy with the ID? Turn it into a printable QR on the next page. You will type the ID there again; nothing from this page is passed on.")}</p>
        <div className="flex flex-wrap gap-2">
          <a href={qrPage} className="rounded-[10px] bg-forest px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-graphite" data-upi-id-qr-link>
            {tr("Open the UPI ID to QR generator")}
          </a>
          <a href={decoder} className={secondary}>{tr("Check what a QR contains")}</a>
        </div>
      </section>
    </div>
  );
}
