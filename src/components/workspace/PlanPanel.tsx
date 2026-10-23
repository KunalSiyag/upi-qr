import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { authedFetch } from "../../lib/workspace/sync";
import { trackProductEvent } from "../../lib/productEvents";
import { PRO_PRICES, PRO_TRIAL_DAYS, YEARLY_SAVING_RUPEES } from "../../data/pricing";
import { PLANS, TRIAL_BUSINESSES } from "../../lib/workspace/entitlements";
import { inputClass, primaryButton, secondaryButton } from "./ui";
import { useWs } from "./i18n";

interface BillingState {
  plan: { id: "free" | "pro"; activePaylinks: number; businesses?: number };
  subscription: { status: string; interval: "monthly" | "yearly"; currentEnd: number | null; cancelAtCycleEnd: boolean; trialEndsAt?: number | null } | null;
  /** A checkout the customer started that the payment provider hasn't confirmed yet. */
  checkout?: { interval: "monthly" | "yearly"; url: string } | null;
  billingAvailable: boolean;
  /** Where new checkouts go: Dodo Payments (merchant of record) or Razorpay. */
  provider?: "dodo" | "razorpay" | null;
  /** Dodo's customer portal (payment method, invoices) is available for this subscription. */
  manageAvailable?: boolean;
  /** Free days before the first charge if this account checks out now (0: charged at checkout). */
  trialDays?: number;
}

// After returning from checkout, re-check every 5 s for two minutes (the server
// re-reads the subscription from the provider, so this works even if a webhook is lost).
const CHECKOUT_POLL_MS = 5000;
const CHECKOUT_POLL_LIMIT = 24;
const PAYMENT_PAGE = /^https:\/\/([a-z0-9-]+\.)*(rzp\.io|razorpay\.com|dodopayments\.com)\//i;

const PRO_FEATURES = [
  "Unlimited active pay links (Free: 10)",
  "Client statement links: all of a client's dues with one UPI button",
  "Pay pages without the “send your own pay links” line",
  "MSME mode: 45-day MSMED deadlines, Section 16 interest, and your rights in reminders",
  "Early access to automatic WhatsApp reminders, now in development",
];

function longDate(ms: number | null, locale = "en-IN") {
  return ms ? new Date(ms).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" }) : "";
}

export function PlanPanel({ signedIn, onFlash, businesses, onPlanChange }: {
  signedIn: boolean;
  onFlash: (message: string) => void;
  /** Present while the business UI is on: how many businesses this device holds, and the first one's name. */
  businesses?: { count: number; primary: string };
  /** Called whenever a load sees a different plan than before, so the business limit refreshes (§6.3). */
  onPlanChange?: (planId: "free" | "pro") => void;
}) {
  const [billing, setBilling] = useState<BillingState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [intent, setIntent] = useState<"monthly" | "yearly" | null>(null);
  const [email, setEmail] = useState("");
  const [joined, setJoined] = useState(false);
  const [checking, setChecking] = useState(false);
  const [startOver, setStartOver] = useState(false);
  const [pollRound, setPollRound] = useState(0);
  const panel = useRef<HTMLElement>(null);
  const billingRef = useRef<BillingState | null>(null);
  const generation = useRef(0);
  const { tr, dateLocale } = useWs();
  const latest = useRef({ onFlash, tr, onPlanChange });
  latest.current = { onFlash, tr, onPlanChange };

  const load = useCallback(async () => {
    const asked = generation.current;
    try {
      const response = await authedFetch("/api/v1/billing/", "GET");
      if (!response.ok) return;
      const next = await response.json() as BillingState;
      if (asked !== generation.current) return;
      const previous = billingRef.current;
      billingRef.current = next;
      setBilling(next);
      if (previous?.checkout && previous.plan.id !== "pro" && next.plan.id === "pro") {
        latest.current.onFlash(latest.current.tr("Welcome to Pro! Thanks for upgrading."));
      }
      if (previous && (previous.plan.id !== next.plan.id || previous.plan.businesses !== next.plan.businesses)) latest.current.onPlanChange?.(next.plan.id);
    } catch {
      // Offline: the panel keeps what it showed (prices, or the last known plan).
    }
  }, []);

  useEffect(() => {
    const upgrade = new URLSearchParams(location.search).get("upgrade");
    if (upgrade === "monthly" || upgrade === "yearly") {
      setIntent(upgrade);
      setTimeout(() => panel.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 300);
    }
  }, []);

  useEffect(() => {
    generation.current++;
    if (!signedIn) { billingRef.current = null; setBilling(null); return; }
    let cancelled = false;
    (async () => {
      await load();
      const clerkEmail = (window as unknown as { Clerk?: { user?: { primaryEmailAddress?: { emailAddress?: string } } } }).Clerk?.user?.primaryEmailAddress?.emailAddress;
      if (clerkEmail && !cancelled) setEmail((current) => current || clerkEmail);
    })();
    return () => { cancelled = true; };
  }, [signedIn, load]);

  const waiting = Boolean(signedIn && billing?.checkout && billing.plan.id !== "pro");
  useEffect(() => {
    if (!waiting) return;
    let polls = 0;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (++polls > CHECKOUT_POLL_LIMIT) return window.clearInterval(timer);
      void load();
    }, CHECKOUT_POLL_MS);
    return () => window.clearInterval(timer);
  }, [waiting, pollRound, load]);

  // Coming back from checkout: the tab becomes visible again, or the back button
  // restores this page from the back/forward cache with its old state.
  useEffect(() => {
    if (!signedIn) return;
    const recheck = () => { void load(); setPollRound((n) => n + 1); };
    const onVisible = () => { if (document.visibilityState === "visible" && billingRef.current?.checkout) recheck(); };
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) recheck(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [signedIn, load]);

  async function checkout(interval: "monthly" | "yearly") {
    setBusy(true);
    setError("");
    try {
      // The server reads the email from the account; this is only a fallback for the receipt.
      const email = (window as unknown as { Clerk?: { user?: { primaryEmailAddress?: { emailAddress?: string } } } }).Clerk?.user?.primaryEmailAddress?.emailAddress;
      const response = await authedFetch("/api/v1/billing/", "POST", { action: "checkout", interval, ...(email ? { email } : {}) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || typeof body.url !== "string") {
        setError(tr(body.error ?? "Couldn't start checkout. Try again."));
        return;
      }
      trackProductEvent("upgrade_started", interval);
      if (billingRef.current) {
        billingRef.current = { ...billingRef.current, checkout: { interval, url: body.url } };
        setBilling(billingRef.current);
      }
      setStartOver(false);
      window.location.href = body.url;
    } catch {
      setError(tr("You're offline. Connect to upgrade."));
    } finally {
      setBusy(false);
    }
  }

  async function manage() {
    setBusy(true);
    setError("");
    try {
      const response = await authedFetch("/api/v1/billing/", "POST", { action: "manage" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || typeof body.url !== "string" || !PAYMENT_PAGE.test(body.url)) return setError(tr(body.error ?? "Couldn't open billing. Try again."));
      window.location.href = body.url;
    } catch {
      setError(tr("You're offline. Connect to manage billing."));
    } finally {
      setBusy(false);
    }
  }

  async function checkAgain() {
    setChecking(true);
    await load();
    setChecking(false);
    setPollRound((n) => n + 1);
    if (billingRef.current?.plan.id !== "pro") onFlash(tr("Not confirmed yet. If you've paid, give it a minute; this page keeps checking."));
  }

  async function cancel() {
    setBusy(true);
    setError("");
    try {
      const response = await authedFetch("/api/v1/billing/", "POST", { action: "cancel" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return setError(tr(body.error ?? "Couldn't cancel. Try again."));
      const current = billingRef.current;
      if (current?.subscription) {
        billingRef.current = { ...current, subscription: { ...current.subscription, cancelAtCycleEnd: true } };
        setBilling(billingRef.current);
      }
      onFlash(tr("Subscription cancelled. Pro stays on until the end of the period you paid for."));
    } catch {
      setError(tr("You're offline. Connect to cancel."));
    } finally {
      setBusy(false);
      setConfirmCancel(false);
    }
  }

  async function joinWaitlist(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const response = await fetch("/api/waitlist/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), tool: "pro", lang: "en", interview: false, company: "" }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        return setError(tr(body.error ?? "Couldn't save. Try again."));
      }
      setJoined(true);
      trackProductEvent("waitlist_join", "pro");
    } catch {
      setError(tr("You're offline. Try again when connected."));
    }
  }

  const isPro = billing?.plan.id === "pro";
  const sub = billing?.subscription;
  const trialDays = billing?.trialDays ?? 0;

  return (
    <section ref={panel} id="plan" className={`rounded-[14px] border bg-white shadow-[0_1px_2px_rgba(13,31,23,0.04),0_12px_32px_-18px_rgba(13,31,23,0.18)] p-5 ${intent && !isPro ? "border-hairline ring-2 ring-sun/50" : "border-forest/[0.07]"}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-ink">{tr("Plan")}</h2>
        <span className={`rounded-[7px] px-3 py-1 text-xs font-semibold ${isPro ? "bg-forest text-white" : "bg-fog text-leaf"}`}>{isPro ? "Pro" : tr("Free")}</span>
      </div>

      {isPro && sub ? (
        <div className="mt-2 text-sm text-charcoal">
          {sub.cancelAtCycleEnd || sub.status === "cancelled"
            ? <p>{tr("Cancelled — Pro stays on until {date}, then you move to Free. Your data stays.", { date: longDate(sub.currentEnd, dateLocale) })}</p>
            : sub.status === "pending"
              ? <p>{tr("Your last renewal payment failed. Update your payment method to keep Pro.")}</p>
              : sub.trialEndsAt
                ? <p>{tr("Free trial · first payment of {price} on {date}.", { price: PRO_PRICES[sub.interval].label, date: longDate(sub.trialEndsAt, dateLocale) })} {tr("Cancel before then and you won't be charged.")}{businesses ? <> {tr("Up to {trial} businesses during the trial, {limit} after your first payment.", { trial: TRIAL_BUSINESSES, limit: PLANS.pro.businesses })}</> : null}</p>
                : <p>{tr(sub.interval === "yearly" ? "Pro yearly" : "Pro monthly")}{sub.currentEnd ? tr(" · renews on {date}", { date: longDate(sub.currentEnd, dateLocale) }) : null}.</p>}
          {businesses && businesses.count > 1 && (sub.cancelAtCycleEnd || sub.status === "cancelled") && (
            <p className="mt-2 text-[13px] text-charcoal">{tr("You have {n} businesses. On Free they all stay and their pay links keep working, but only {primary} can be edited and you can't add more.", { n: businesses.count, primary: businesses.primary })}</p>
          )}
          {!sub.cancelAtCycleEnd && (sub.status === "active" || sub.status === "authenticated") && (
            confirmCancel ? (
              <p className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold text-[#a8321d]">
                {tr("Cancel at the end of this period?")}
                {businesses && businesses.count > 1 && <span className="basis-full font-medium">{tr("You have {n} businesses. On Free they all stay and their pay links keep working, but only {primary} can be edited and you can't add more.", { n: businesses.count, primary: businesses.primary })}</span>}
                <button type="button" disabled={busy} onClick={cancel} className="rounded-[8px] bg-[#a8321d] px-2 py-1 text-white">{tr("Yes, cancel")}</button>
                <button type="button" onClick={() => setConfirmCancel(false)} className="rounded-[8px] px-2 py-1 text-ink">{tr("Keep Pro")}</button>
              </p>
            ) : (
              <button type="button" onClick={() => setConfirmCancel(true)} className="mt-3 text-xs font-bold text-muted hover:text-[#a8321d]">{tr("Cancel subscription…")}</button>
            )
          )}
          {billing?.manageAvailable && (
            <button type="button" disabled={busy} onClick={manage} className={`${secondaryButton} mt-3 block`}>{tr("Manage billing")}</button>
          )}
        </div>
      ) : (
        <>
          <ul className="mt-3 space-y-1.5 text-sm text-charcoal">
            {businesses && <li>✓ {tr("Up to {limit} businesses in one account after your first payment (Free: {free})", { limit: PLANS.pro.businesses, free: PLANS.free.businesses })}</li>}
            {PRO_FEATURES.map((feature) => <li key={feature}>✓ {tr(feature)}</li>)}
          </ul>
          {!signedIn ? (
            <p className="mt-4 text-sm text-charcoal">
              {tr("Pro is {monthly}/month or {yearly}/year. Create a free account first, then upgrade here.", { monthly: PRO_PRICES.monthly.label, yearly: PRO_PRICES.yearly.label })}
              <a href={"/sign-up/?redirect_url=" + encodeURIComponent(`/app/?tab=settings&upgrade=${intent ?? "monthly"}`)} className={`${primaryButton} mt-3 block w-fit`}>{tr("Create free account")}</a>
            </p>
          ) : billing?.billingAvailable && billing.checkout && !startOver ? (
            <div role="status" className="mt-4 rounded-[10px] border border-hairline bg-fog p-3">
              <p className="text-sm font-semibold text-ink">{tr("Waiting for your payment to be confirmed…")}</p>
              <p className="mt-1 text-xs text-charcoal">{tr("Paid already? Pro switches on here by itself, usually within a minute. Not paid yet? Continue to the payment page.")}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" disabled={checking} onClick={checkAgain} className={primaryButton}>{checking ? tr("Checking…") : tr("Check again")}</button>
                {PAYMENT_PAGE.test(billing.checkout.url) && <a href={billing.checkout.url} className={secondaryButton}>{tr("Continue to payment")}</a>}
              </div>
              <button type="button" onClick={() => setStartOver(true)} className="mt-2 text-xs font-bold text-muted hover:text-ink">{tr("Choose a different plan")}</button>
            </div>
          ) : billing?.billingAvailable ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {trialDays > 0 && (
                <p className="text-sm font-bold text-ink sm:col-span-2">
                  {tr("Try Pro free for {days} days: ₹0 today, first payment on {date}. Cancel before then and you pay nothing.", { days: trialDays, date: longDate(Date.now() + trialDays * 86_400_000, dateLocale) })}
                </p>
              )}
              <button type="button" disabled={busy} onClick={() => checkout("monthly")} className={intent === "yearly" ? secondaryButton : primaryButton}>
                {trialDays > 0
                  ? tr("Start free trial · then {price} / month", { price: PRO_PRICES.monthly.label })
                  : tr("{price} / month", { price: PRO_PRICES.monthly.label })}
              </button>
              <button type="button" disabled={busy} onClick={() => checkout("yearly")} className={intent === "yearly" ? primaryButton : secondaryButton}>
                {trialDays > 0
                  ? tr("Start free trial · then {price} / year (save ₹{saving})", { price: PRO_PRICES.yearly.label, saving: YEARLY_SAVING_RUPEES })
                  : tr("{price} / year · save ₹{saving}", { price: PRO_PRICES.yearly.label, saving: YEARLY_SAVING_RUPEES })}
              </button>
              <p className="text-[11px] text-muted sm:col-span-2">{billing.provider === "dodo"
                  ? tr("Secure checkout by Dodo Payments, our merchant of record: UPI or card, GST included. Cancel anytime; Pro runs to the end of the paid period.")
                  : tr("Pay with UPI AutoPay or card on Razorpay's secure page. Cancel anytime; Pro runs to the end of the paid period.")}</p>
            </div>
          ) : billing ? (
            joined ? (
              <p role="status" className="mt-4 rounded-[10px] bg-fog px-3 py-2 text-sm font-bold text-leaf">{tr("You're on the Pro early-access list. We'll email you when it opens.")}</p>
            ) : (
              <form onSubmit={joinWaitlist} noValidate className="mt-4">
                <p className="text-sm text-charcoal">{PRO_TRIAL_DAYS > 0
                  ? tr("Pro opens soon at {price}/month, with a {days}-day free trial. Get an email when it does:", { price: PRO_PRICES.monthly.label, days: PRO_TRIAL_DAYS })
                  : tr("Pro opens soon at {price}/month. Get an email when it does:", { price: PRO_PRICES.monthly.label })}</p>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <label htmlFor="pro-email" className="sr-only">{tr("Email address")}</label>
                  <input id="pro-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={`${inputClass} flex-1`} placeholder="you@example.com" />
                  <button type="submit" className={primaryButton}>{tr("Notify me")}</button>
                </div>
              </form>
            )
          ) : (
            <p className="mt-4 text-sm text-muted">{tr("Checking your plan…")}</p>
          )}
        </>
      )}
      {error && <p role="alert" className="mt-3 text-xs font-bold text-[#a8321d]">{error}</p>}
    </section>
  );
}
