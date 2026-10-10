import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { authedFetch } from "../../lib/workspace/sync";
import { trackProductEvent } from "../../lib/productEvents";
import { PRO_PRICES, YEARLY_SAVING_RUPEES } from "../../data/pricing";
import { inputClass, primaryButton, secondaryButton } from "./ui";
import { useWs } from "./i18n";

interface BillingState {
  plan: { id: "free" | "pro"; activePaylinks: number };
  subscription: { status: string; interval: "monthly" | "yearly"; currentEnd: number | null; cancelAtCycleEnd: boolean } | null;
  /** A checkout the customer started that Razorpay hasn't confirmed yet. */
  checkout?: { interval: "monthly" | "yearly"; url: string } | null;
  billingAvailable: boolean;
}

// After returning from Razorpay, re-check every 5 s for two minutes (the server
// re-reads the subscription from Razorpay, so this works even if a webhook is lost).
const CHECKOUT_POLL_MS = 5000;
const CHECKOUT_POLL_LIMIT = 24;
const RAZORPAY_PAGE = /^https:\/\/([a-z0-9-]+\.)*(rzp\.io|razorpay\.com)\//i;

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

export function PlanPanel({ signedIn, onFlash }: { signedIn: boolean; onFlash: (message: string) => void }) {
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
  const latest = useRef({ onFlash, tr });
  latest.current = { onFlash, tr };

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

  // Coming back from Razorpay: the tab becomes visible again, or the back button
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
      const response = await authedFetch("/api/v1/billing/", "POST", { action: "checkout", interval });
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

  return (
    <section ref={panel} id="plan" className={`rounded-[1.5rem] border bg-white/90 p-5 shadow-sm ${intent && !isPro ? "border-sun ring-2 ring-sun/50" : "border-white/75"}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-black text-forest">{tr("Plan")}</h2>
        <span className={`rounded-full px-3 py-1 text-xs font-black ${isPro ? "bg-forest text-white" : "bg-mint text-leaf"}`}>{isPro ? "Pro" : tr("Free")}</span>
      </div>

      {isPro && sub ? (
        <div className="mt-2 text-sm text-forest/75">
          {sub.cancelAtCycleEnd || sub.status === "cancelled"
            ? <p>{tr("Cancelled — Pro stays on until {date}, then you move to Free. Your data stays.", { date: longDate(sub.currentEnd, dateLocale) })}</p>
            : sub.status === "pending"
              ? <p>{tr("Your last renewal payment failed. Razorpay will retry; update your payment method from the Razorpay email to keep Pro.")}</p>
              : <p>{tr(sub.interval === "yearly" ? "Pro yearly" : "Pro monthly")}{sub.currentEnd ? tr(" · renews on {date}", { date: longDate(sub.currentEnd, dateLocale) }) : null}.</p>}
          {!sub.cancelAtCycleEnd && (sub.status === "active" || sub.status === "authenticated") && (
            confirmCancel ? (
              <p className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold text-[#a8321d]">
                {tr("Cancel at the end of this period?")}
                <button type="button" disabled={busy} onClick={cancel} className="rounded-lg bg-[#a8321d] px-2 py-1 text-white">{tr("Yes, cancel")}</button>
                <button type="button" onClick={() => setConfirmCancel(false)} className="rounded-lg px-2 py-1 text-forest">{tr("Keep Pro")}</button>
              </p>
            ) : (
              <button type="button" onClick={() => setConfirmCancel(true)} className="mt-3 text-xs font-bold text-forest/50 hover:text-[#a8321d]">{tr("Cancel subscription…")}</button>
            )
          )}
        </div>
      ) : (
        <>
          <ul className="mt-3 space-y-1.5 text-sm text-forest/80">
            {PRO_FEATURES.map((feature) => <li key={feature}>✓ {tr(feature)}</li>)}
          </ul>
          {!signedIn ? (
            <p className="mt-4 text-sm text-forest/70">
              {tr("Pro is {monthly}/month or {yearly}/year. Create a free account first, then upgrade here.", { monthly: PRO_PRICES.monthly.label, yearly: PRO_PRICES.yearly.label })}
              <a href={"/sign-up/?redirect_url=" + encodeURIComponent(`/app/?tab=settings&upgrade=${intent ?? "monthly"}`)} className={`${primaryButton} mt-3 block w-fit`}>{tr("Create free account")}</a>
            </p>
          ) : billing?.billingAvailable && billing.checkout && !startOver ? (
            <div role="status" className="mt-4 rounded-xl border border-sun/60 bg-sun/15 p-3">
              <p className="text-sm font-black text-forest">{tr("Waiting for Razorpay to confirm your payment…")}</p>
              <p className="mt-1 text-xs text-forest/70">{tr("Paid already? Pro switches on here by itself, usually within a minute. Not paid yet? Continue on Razorpay's page.")}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" disabled={checking} onClick={checkAgain} className={primaryButton}>{checking ? tr("Checking…") : tr("Check again")}</button>
                {RAZORPAY_PAGE.test(billing.checkout.url) && <a href={billing.checkout.url} className={secondaryButton}>{tr("Continue to payment")}</a>}
              </div>
              <button type="button" onClick={() => setStartOver(true)} className="mt-2 text-xs font-bold text-forest/50 hover:text-forest">{tr("Choose a different plan")}</button>
            </div>
          ) : billing?.billingAvailable ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button type="button" disabled={busy} onClick={() => checkout("monthly")} className={intent === "yearly" ? secondaryButton : primaryButton}>
                {tr("{price} / month", { price: PRO_PRICES.monthly.label })}
              </button>
              <button type="button" disabled={busy} onClick={() => checkout("yearly")} className={intent === "yearly" ? primaryButton : secondaryButton}>
                {tr("{price} / year · save ₹{saving}", { price: PRO_PRICES.yearly.label, saving: YEARLY_SAVING_RUPEES })}
              </button>
              <p className="text-[11px] text-forest/55 sm:col-span-2">{tr("Pay with UPI AutoPay or card on Razorpay's secure page. Cancel anytime; Pro runs to the end of the paid period.")}</p>
            </div>
          ) : billing ? (
            joined ? (
              <p role="status" className="mt-4 rounded-xl bg-mint px-3 py-2 text-sm font-bold text-leaf">{tr("You're on the Pro early-access list. We'll email you when it opens.")}</p>
            ) : (
              <form onSubmit={joinWaitlist} noValidate className="mt-4">
                <p className="text-sm text-forest/70">{tr("Pro opens soon at {price}/month. Get an email when it does:", { price: PRO_PRICES.monthly.label })}</p>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <label htmlFor="pro-email" className="sr-only">{tr("Email address")}</label>
                  <input id="pro-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={`${inputClass} flex-1`} placeholder="you@example.com" />
                  <button type="submit" className={primaryButton}>{tr("Notify me")}</button>
                </div>
              </form>
            )
          ) : (
            <p className="mt-4 text-sm text-forest/60">{tr("Checking your plan…")}</p>
          )}
        </>
      )}
      {error && <p role="alert" className="mt-3 text-xs font-bold text-[#a8321d]">{error}</p>}
    </section>
  );
}
