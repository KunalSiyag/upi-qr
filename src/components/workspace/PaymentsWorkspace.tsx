import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  agingBuckets, chaseList, clientBalances, deleteClient, deleteInvoice, eraseWorkspace, formatPaise, generateRecurring, invoiceViews,
  liveRecurring, upsertPlan, allocatePayment,
  invoicesCsv, liveClients, localToday, newId, removePayment, sanitizeWorkspace, summarize, updateBusiness, upsertClient, upsertInvoice,
  daysBetween, isUdyam, msmeDeadline, msmeInterestPaise, normalizeUdyam,
  type InvoiceView, type Workspace,
} from "../../lib/workspace/model";
import { PLANS } from "../../lib/workspace/entitlements";
import { MSMED_INTEREST_PCT } from "../../data/rbiRates";
import { backupJson, loadWorkspace, onExternalChange, restoreBackup, saveWorkspace } from "../../lib/workspace/localStore";
import { createSync, STASH_KEY, type SyncState } from "../../lib/workspace/sync";
import { createPaylinkFor, createStatementLinkFor, deletePaylink, fetchPaylinks, paylinkUrl, type PaylinkList } from "../../lib/workspace/paylinkClient";
import { trackProductEvent } from "../../lib/productEvents";
import { isValidVpa } from "../../lib/upi-uri";
import { InvoiceSheet, PaymentSheet, ReminderSheet } from "./Sheets";
import { PlanPanel } from "./PlanPanel";
import { StatementSheet } from "./StatementSheet";
import { NotificationsPanel } from "./NotificationsPanel";
import { InstallHint, useInstallPrompt } from "./InstallApp";
import { addSampleData, hasSampleData, isSampleId, removeSampleData } from "../../lib/workspace/sample";
import { PRO_PRICES } from "../../data/pricing";
import { downloadText, Field, inputClass, primaryButton, secondaryButton, Sheet, StatusBadge } from "./ui";
import { initialWsLang, LangToggle, makeTr, useWs, WS_LANG_KEY, WsLangProvider, type Tr, type WsLang } from "./i18n";

type Tab = "overview" | "invoices" | "clients" | "settings";
type Filter = "unpaid" | "overdue" | "paid" | "all";
type SheetState =
  | { kind: "invoice"; id?: string }
  | { kind: "payment"; id: string; amountPaise?: number; reference?: string; claimToken?: string }
  | { kind: "remind"; id: string }
  | { kind: "client"; id?: string }
  | { kind: "statement" }
  | null;

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "invoices", label: "Invoices" },
  { id: "clients", label: "Clients" },
  { id: "settings", label: "Settings" },
];

function shortDate(iso: string, locale = "en-IN") {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "UTC" });
}

function dueText(view: InvoiceView, tr: Tr, locale: string) {
  if (view.state === "paid") return view.invoice.payments.length ? tr("Paid {date}", { date: shortDate(view.invoice.payments.at(-1)!.date, locale) }) : tr("Paid");
  if (view.state === "void") return tr("Cancelled");
  if (view.daysPastDue > 0) return tr(view.daysPastDue === 1 ? "{n} day late" : "{n} days late", { n: view.daysPastDue });
  if (view.daysPastDue === 0) return tr("Due today");
  return tr("Due {date}", { date: shortDate(view.invoice.dueDate, locale) });
}

/** Provides the UI language (English / Hindi) to the whole workspace. */
export function PaymentsWorkspace() {
  const [lang, setLangState] = useState<WsLang>("en");
  useEffect(() => { setLangState(initialWsLang()); }, []);
  useEffect(() => { document.documentElement.lang = lang === "hi" ? "hi" : "en"; }, [lang]);
  const value = useMemo(() => ({
    lang,
    tr: makeTr(lang),
    dateLocale: lang === "hi" ? "hi-IN" : "en-IN",
    setLang: (next: WsLang) => {
      setLangState(next);
      try { localStorage.setItem(WS_LANG_KEY, next); } catch { /* not remembered */ }
    },
  }), [lang]);
  return <WsLangProvider value={value}><Workspace /></WsLangProvider>;
}

function Workspace() {
  const { tr, dateLocale } = useWs();
  const [ws, setWs] = useState<Workspace>(() => sanitizeWorkspace(null));
  const [ready, setReady] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [today, setToday] = useState(() => localToday());
  const [tab, setTab] = useState<Tab>("overview");
  const [filter, setFilter] = useState<Filter>("unpaid");
  const [clientFilter, setClientFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sheet, setSheet] = useState<SheetState>(null);
  const [flash, setFlash] = useState("");
  const [sync, setSync] = useState<SyncState>({ status: "checking", lastSyncedAt: null, message: "" });
  const wsRef = useRef(ws);
  wsRef.current = ws;
  const syncRef = useRef<ReturnType<typeof createSync> | null>(null);
  const [paylinks, setPaylinks] = useState<PaylinkList | null>(null);
  const [linkBusy, setLinkBusy] = useState<string | null>(null);
  const [upsell, setUpsell] = useState(false);
  const signedIn = sync.status !== "signed_out" && sync.status !== "checking";
  const installer = useInstallPrompt();

  useEffect(() => {
    setWs(loadWorkspace());
    setReady(true);
    setToday(localToday());
    const params = new URLSearchParams(location.search);
    const tabParam = params.get("tab");
    if (tabParam && TABS.some((t) => t.id === tabParam)) setTab(tabParam as Tab);
    const filterParam = params.get("filter");
    if (filterParam === "unpaid" || filterParam === "overdue" || filterParam === "paid" || filterParam === "all") setFilter(filterParam);
    if (params.get("new") === "1") setSheet({ kind: "invoice" });
    if (params.get("saved") === "receipt") {
      setFlash(tr("Receipt saved to your payment book."));
      params.delete("saved");
      const rest = params.toString();
      history.replaceState(null, "", `${location.pathname}${rest ? `?${rest}` : ""}${location.hash}`);
    }
    return onExternalChange(() => wsRef.current, setWs);
  }, []);

  useEffect(() => {
    if (!ready) return;
    setSaveFailed(!saveWorkspace(ws));
    syncRef.current?.changed();
  }, [ws, ready]);

  // Monthly plans: create any invoices that have come due (idempotent; deterministic ids).
  useEffect(() => {
    if (!ready) return;
    const { ws: next, created } = generateRecurring(ws, today, Date.now());
    if (created.length) {
      setWs(next);
      setFlash(tr(created.length === 1 ? "Created {n} invoice from your monthly billing." : "Created {n} invoices from your monthly billing.", { n: created.length }));
    }
  }, [ws, today, ready, tr]);

  // Start sync only after the stored workspace has rendered, so the first push
  // can never send an empty in-memory copy.
  useEffect(() => {
    if (!ready) return;
    const engine = createSync({ get: () => wsRef.current, apply: setWs, onState: setSync });
    syncRef.current = engine;
    void engine.start();
    return () => { engine.stop(); syncRef.current = null; };
  }, [ready]);

  useEffect(() => {
    if (sync.message && sync.status === "synced") setFlash(tr(sync.message));
  }, [sync.message, sync.status, tr]);

  const refreshLinks = useCallback(async () => {
    const list = await fetchPaylinks();
    if (list) setPaylinks(list);
  }, []);

  // Pull pay links and payer claims once signed in, then every minute while visible.
  useEffect(() => {
    if (!signedIn) { setPaylinks(null); return; }
    void refreshLinks();
    const timer = setInterval(() => { if (document.visibilityState === "visible") void refreshLinks(); }, 60_000);
    return () => clearInterval(timer);
  }, [signedIn, refreshLinks]);

  async function makeLink(invoiceId: string) {
    setLinkBusy(invoiceId);
    try {
      if (!(await syncRef.current?.flush())) {
        setFlash(tr("Couldn't sync this invoice yet. Check your connection and try again."));
        return;
      }
      const result = await createPaylinkFor(invoiceId);
      if ("error" in result) {
        if (result.code === "limit") {
          setUpsell(true);
          trackProductEvent("upgrade_prompt", "paylinks");
        } else setFlash(tr(result.error));
      }
      else {
        await refreshLinks();
        setFlash(tr("Pay link ready — copy it or send it with a reminder."));
      }
    } finally {
      setLinkBusy(null);
    }
  }

  async function revokeLink(token: string) {
    if (await deletePaylink(token, "link")) {
      await refreshLinks();
      setFlash(tr("Pay link turned off."));
    } else setFlash(tr("Couldn't turn off the link. Try again."));
  }


  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(""), 3500);
    return () => clearTimeout(timer);
  }, [flash]);

  const closeSheet = useCallback(() => setSheet(null), []);
  const views = useMemo(() => invoiceViews(ws, today), [ws, today]);
  const summary = useMemo(() => summarize(views, today), [views, today]);
  const buckets = useMemo(() => agingBuckets(views), [views]);
  const chase = useMemo(() => chaseList(views).slice(0, 6), [views]);
  const balances = useMemo(() => clientBalances(views), [views]);
  const clients = useMemo(() => liveClients(ws), [ws]);
  const claimedUtrs = useMemo(() => {
    const map = new Map<string, string>();
    if (paylinks) for (const [invoiceId, link] of Object.entries(paylinks.byInvoice)) for (const c of link.claims) map.set(c.utr, invoiceId);
    return map;
  }, [paylinks]);

  const pendingClaims = useMemo(() => {
    if (!paylinks) return [];
    return Object.entries(paylinks.byInvoice).flatMap(([invoiceId, link]) => {
      const view = views.find((v) => v.invoice.id === invoiceId);
      return view ? link.claims.map((claim) => ({ invoiceId, token: link.token, claim, view })) : [];
    });
  }, [paylinks, views]);

  // Statement links are keyed "stmt:<clientId>"; their claims are applied oldest invoice first.
  const statementLinks = useMemo(() => {
    const map = new Map<string, { token: string; claims: { utr: string; amountPaise: number | null; at: number }[] }>();
    if (paylinks) for (const [key, link] of Object.entries(paylinks.byInvoice)) if (key.startsWith("stmt:")) map.set(key.slice(5), link);
    return map;
  }, [paylinks]);
  const statementClaims = useMemo(
    () => [...statementLinks.entries()].flatMap(([clientId, link]) => link.claims.map((claim) => ({ clientId, token: link.token, claim }))),
    [statementLinks],
  );
  const isPro = paylinks?.plan?.id === "pro";
  const entitlement = PLANS[isPro ? "pro" : "free"];
  /** MSMED deadline status for an unpaid invoice of a Udyam-registered business; interest only on plans with MSME tools. */
  const msmeFor = (v: InvoiceView) => {
    if (!isUdyam(ws.business.udyam) || v.balancePaise <= 0 || v.state === "void") return undefined;
    const deadline = msmeDeadline(v.invoice);
    const daysLate = daysBetween(deadline, today);
    if (daysLate <= 0) return undefined;
    return { deadline, daysLate, interestPaise: entitlement.msmeTools ? msmeInterestPaise(v.balancePaise, deadline, today, MSMED_INTEREST_PCT) : null };
  };

  async function makeStatementLink(clientId: string) {
    setLinkBusy(clientId);
    try {
      if (!(await syncRef.current?.flush())) { setFlash(tr("Couldn't sync yet. Check your connection and try again.")); return; }
      const result = await createStatementLinkFor(clientId);
      if ("error" in result) setFlash(tr(result.error));
      else { await refreshLinks(); setFlash(tr("Statement link ready — it always shows this client's current dues.")); }
    } finally {
      setLinkBusy(null);
    }
  }

  function applyStatementClaim(clientId: string, token: string, claim: { utr: string; amountPaise: number | null }) {
    if (!claim.amountPaise) return;
    const result = allocatePayment(ws, clientId, claim.amountPaise, { date: today, mode: "upi", reference: claim.utr.slice(0, 60) }, today, Date.now());
    setWs(result.ws);
    const applied = claim.amountPaise - result.unallocatedPaise;
    setFlash(tr(result.allocations.length === 1 ? "Applied {amount} to {n} invoice" : "Applied {amount} to {n} invoices", { amount: formatPaise(applied), n: result.allocations.length })
      + (result.unallocatedPaise ? tr(" ({extra} more than was due wasn't recorded)", { extra: formatPaise(result.unallocatedPaise) }) : "") + ".");
    trackProductEvent("payment_recorded", "workspace");
    void deletePaylink(token, "claims").then(() => refreshLinks());
  }
  const needsSetup = ready && !ws.business.name;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return views.filter((v) => {
      if (clientFilter && v.invoice.clientId !== clientFilter) return false;
      if (filter === "unpaid" && v.balancePaise === 0) return false;
      if (filter === "overdue" && v.state !== "overdue") return false;
      if (filter === "paid" && v.state !== "paid") return false;
      if (!q) return true;
      return v.invoice.number.toLowerCase().includes(q) || (v.client?.name ?? "").toLowerCase().includes(q) || v.invoice.description.toLowerCase().includes(q);
    });
  }, [views, filter, clientFilter, query]);

  function openClientInvoices(clientId: string) {
    setClientFilter(clientId);
    setFilter("all");
    setTab("invoices");
  }

  const maxBucket = Math.max(1, ...buckets.map((b) => b.balancePaise));

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-black text-leaf">{tr("Payments workspace · free")}</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-forest md:text-4xl">{ws.business.name || tr("Who owes you money?")}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LangToggle />
          {installer.canInstall && <button type="button" onClick={() => void installer.install()} className={secondaryButton}>{tr("Install app")}</button>}
          <SyncPill state={sync} onClick={() => setTab("settings")} />
          <button type="button" onClick={() => setSheet({ kind: "invoice" })} className={primaryButton}>{tr("+ New invoice")}</button>
        </div>
      </div>

      {sync.status === "synced" || sync.status === "syncing" ? (
        <p className="mt-3 rounded-2xl border border-leaf/15 bg-mint/50 px-4 py-2.5 text-xs leading-5 text-forest/80">
          {tr("☁️ Synced to your account — open proupiqr.in/app on any device and sign in to see the same invoices.")}
        </p>
      ) : (
        <p className="mt-3 rounded-2xl border border-leaf/15 bg-mint/50 px-4 py-2.5 text-xs leading-5 text-forest/80">
          {tr("🔒 Saved only in this browser — no account needed.")} <button type="button" className="font-bold underline" onClick={() => setTab("settings")}>{tr("Back up or sync across devices")}</button>
        </p>
      )}
      {saveFailed && <p role="alert" className="mt-2 rounded-2xl bg-coral/15 px-4 py-2.5 text-xs font-bold text-[#a8321d]">{tr("This browser blocked saving. Your changes will be lost when you close the tab — download a backup from Settings.")}</p>}

      <nav aria-label={tr("Workspace sections")} className="sticky z-30 mt-5 -mx-1 flex gap-1 overflow-x-auto [scrollbar-width:none] rounded-2xl bg-white ring-1 ring-forest/[0.07] shadow-[0_1px_2px_rgba(13,31,23,0.04),0_12px_32px_-18px_rgba(13,31,23,0.18)] p-1" style={{ top: "calc(4.75rem + env(safe-area-inset-top, 0px))" }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => { setTab(t.id); if (t.id !== "invoices") setClientFilter(null); }}
            aria-current={tab === t.id ? "page" : undefined}
            className={`flex-1 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-bold transition ${tab === t.id ? "bg-forest text-white" : "text-forest/70 hover:bg-mint"}`}
          >
            {tr(t.label)}
            {t.id === "invoices" && summary.overdueCount > 0 && <span className="ml-1.5 rounded-full bg-coral px-1.5 text-[10px] text-white">{summary.overdueCount}</span>}
          </button>
        ))}
      </nav>

      {flash && <p role="status" className="mt-3 rounded-2xl bg-forest px-4 py-2.5 text-sm font-bold text-white">{flash}</p>}
      {upsell && (
        <section role="status" className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-sun bg-cream px-4 py-3">
          <div className="min-w-0 text-sm text-forest">
            <p className="font-black">{tr("You've used all {n} free pay links.", { n: paylinks?.plan?.activePaylinks ?? 10 })}</p>
            <p className="text-xs text-forest/70">{tr("Pro gives unlimited pay links and client statement links for {price}/month. Or turn off links for paid invoices in Settings.", { price: PRO_PRICES.monthly.label })}</p>
          </div>
          <div className="flex gap-2">
            <a href="/app/?tab=settings&upgrade=monthly" className={primaryButton}>{tr("See Pro")}</a>
            <button type="button" onClick={() => setUpsell(false)} className="rounded-xl px-3 py-2 text-xs font-bold text-forest/60 hover:text-forest">{tr("Not now")}</button>
          </div>
        </section>
      )}

      <div className="mt-5">
        {tab === "overview" && (
          <div className="space-y-5">
            {statementClaims.length > 0 && (
              <section className="rounded-[1.5rem] border-2 border-sun/70 bg-cream p-5" aria-labelledby="stmt-claims-title">
                <h2 id="stmt-claims-title" className="text-lg font-black text-forest">{tr("Statement payments to confirm")}</h2>
                <p className="mt-1 text-xs text-forest/60">{tr("Check your bank or UPI app first. Confirmed amounts are applied to the oldest unpaid invoices.")}</p>
                <ul className="mt-3 divide-y divide-forest/10">
                  {statementClaims.map(({ clientId, token, claim }) => (
                    <li key={`${token}-${claim.utr}`} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div className="min-w-0 text-sm">
                        <p className="font-bold text-forest">{tr("{name} says they paid {amount} on their statement", { name: ws.clients[clientId]?.name ?? tr("Client"), amount: claim.amountPaise ? formatPaise(claim.amountPaise) : tr("an amount") })}</p>
                        <p className="text-xs text-forest/60">UTR <span className="font-mono">{claim.utr}</span> · {new Date(claim.at).toLocaleString(dateLocale, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</p>
                      </div>
                      <div className="flex gap-2">
                        {claim.amountPaise && (balances.get(clientId)?.balancePaise ?? 0) > 0 && (
                          <button type="button" className="rounded-xl bg-forest px-3 py-2 text-xs font-black text-white hover:bg-leaf" onClick={() => applyStatementClaim(clientId, token, claim)}>{tr("Confirm & apply")}</button>
                        )}
                        <button type="button" className="rounded-xl border border-forest/15 px-3 py-2 text-xs font-bold text-forest hover:bg-mint" onClick={async () => { await deletePaylink(token, "claims"); await refreshLinks(); }}>{tr("Not received")}</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {pendingClaims.length > 0 && (
              <section className="rounded-[1.5rem] border-2 border-sun/70 bg-cream p-5" aria-labelledby="claims-title">
                <h2 id="claims-title" className="text-lg font-black text-forest">{tr("Payments to confirm")}</h2>
                <p className="mt-1 text-xs text-forest/60">{tr("Clients sent these from your pay links. Check your bank or UPI app before confirming.")}</p>
                <ul className="mt-3 divide-y divide-forest/10">
                  {pendingClaims.map(({ invoiceId, token, claim, view }) => (
                    <li key={`${token}-${claim.utr}`} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div className="min-w-0 text-sm">
                        <p className="font-bold text-forest">{tr("{name} says they paid {amount}", { name: view.client?.name ?? tr("Client"), amount: formatPaise(claim.amountPaise ?? view.balancePaise) })}</p>
                        <p className="text-xs text-forest/60">{view.invoice.number} · UTR <span className="font-mono">{claim.utr}</span> · {new Date(claim.at).toLocaleString(dateLocale, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</p>
                      </div>
                      <div className="flex gap-2">
                        {view.balancePaise > 0 && (
                          <button type="button" className="rounded-xl bg-forest px-3 py-2 text-xs font-black text-white hover:bg-leaf"
                            onClick={() => setSheet({ kind: "payment", id: invoiceId, amountPaise: claim.amountPaise ?? view.balancePaise, reference: claim.utr, claimToken: token })}>
                            {tr("Confirm & record")}
                          </button>
                        )}
                        <button type="button" className="rounded-xl border border-forest/15 px-3 py-2 text-xs font-bold text-forest hover:bg-mint"
                          onClick={async () => { await deletePaylink(token, "claims"); await refreshLinks(); }}>
                          {view.balancePaise > 0 ? tr("Not received") : tr("Dismiss")}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {hasSampleData(ws) && (
              <p className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-sun/25 px-4 py-2.5 text-xs font-bold text-forest">
                {tr("You're looking at sample data.")}
                <button type="button" className="underline" onClick={() => { setWs(removeSampleData(ws, Date.now())); setFlash(tr("Sample data cleared.")); }}>{tr("Clear sample data")}</button>
              </p>
            )}
            {views.length === 0 && !signedIn && (
              <div className="flex flex-col items-center gap-5 rounded-[1.5rem] bg-white p-6 text-center ring-1 ring-forest/[0.07] shadow-[0_1px_2px_rgba(13,31,23,0.04),0_12px_32px_-18px_rgba(13,31,23,0.18)] sm:flex-row sm:text-left">
                <EmptyIllustration />
                <div className="min-w-0">
                <p className="text-base font-bold text-forest">{tr("New here? See how it works with a few sample invoices, or add your own.")}</p>
                <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
                  <button type="button" className={secondaryButton} onClick={() => { setWs(addSampleData(ws, today, Date.now())); setFlash(tr("Sample invoices added — try Remind or Got paid.")); }}>{tr("Try with sample data")}</button>
                  <button type="button" className={primaryButton} onClick={() => setSheet({ kind: "invoice" })}>{tr("Add your first invoice")}</button>
                </div>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat accent="collect" label={tr("To collect")} value={formatPaise(summary.outstandingPaise)} note={tr(summary.openCount === 1 ? "{n} open invoice" : "{n} open invoices", { n: summary.openCount })} />
              <Stat accent="overdue" label={tr("Overdue")} value={formatPaise(summary.overduePaise)} note={tr(summary.overdueCount === 1 ? "{n} invoice" : "{n} invoices", { n: summary.overdueCount })} tone={summary.overduePaise ? "bad" : undefined} />
              <Stat accent="soon" label={tr("Due in 7 days")} value={formatPaise(summary.dueSoonPaise)} note={tr(summary.dueSoonCount === 1 ? "{n} invoice" : "{n} invoices", { n: summary.dueSoonCount })} />
              <Stat accent="collected" label={tr("Collected this month")} value={formatPaise(summary.collectedThisMonthPaise)} tone="good" />
            </div>
            <GettingStarted ws={ws} signedIn={signedIn} onAction={(step) => {
              if (step === "invoice") setSheet({ kind: "invoice" });
              else if (step === "remind" || step === "payment") setTab("invoices");
              else if (step === "account") location.href = SIGN_UP_HREF;
            }} />
            {needsSetup && <SetupCard ws={ws} onSave={(next) => { setWs(next); setFlash(tr("Business details saved.")); }} />}


            <section className="rounded-[1.5rem] bg-white ring-1 ring-forest/[0.07] shadow-[0_1px_2px_rgba(13,31,23,0.04),0_12px_32px_-18px_rgba(13,31,23,0.18)] p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-black text-forest">{tr("Chase today")}</h2>
                {summary.openCount > 0 && <button type="button" onClick={() => setSheet({ kind: "statement" })} className="text-xs font-bold text-leaf hover:underline">{tr("Got paid? Import bank statement")}</button>}
              </div>
              {chase.length === 0 ? (
                <p className="mt-2 text-sm text-forest/65">{views.length ? tr("Nothing overdue. 🎉") : tr("Add your first invoice to see who to follow up with.")}</p>
              ) : (
                <ul className="mt-3 divide-y divide-forest/5">
                  {chase.map((v) => (
                    <li key={v.invoice.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate font-bold text-forest">{v.client?.name ?? tr("Unknown client")} <span className="font-normal text-forest/50">· {v.invoice.number}</span></p>
                        <p className="text-xs text-forest/60">{formatPaise(v.balancePaise)} · {dueText(v, tr, dateLocale)}{v.invoice.reminders.length ? tr(" · reminded {n}×", { n: v.invoice.reminders.length }) : ""}</p>
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setSheet({ kind: "remind", id: v.invoice.id })} className="rounded-xl bg-[#25D366] px-3 py-2 text-xs font-black text-white hover:bg-[#1da851]">{tr("Remind")}</button>
                        <button type="button" onClick={() => setSheet({ kind: "payment", id: v.invoice.id })} className="rounded-xl border border-forest/15 px-3 py-2 text-xs font-bold text-forest hover:bg-mint">{tr("Got paid")}</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-[1.5rem] bg-white ring-1 ring-forest/[0.07] shadow-[0_1px_2px_rgba(13,31,23,0.04),0_12px_32px_-18px_rgba(13,31,23,0.18)] p-5">
              <h2 className="text-lg font-black text-forest">{tr("Unpaid by age")}</h2>
              <p className="mt-1 text-xs text-forest/60">{tr("If you are a Udyam-registered micro or small enterprise, business buyers owe you interest on dues unpaid after 45 days (MSMED Act, 2006 §15–16).")}</p>
              <div className="mt-4 space-y-2.5">
                {buckets.map((b) => (
                  <div key={b.key} className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-3 text-sm">
                    <span className="text-xs font-bold text-forest/70">{tr(b.label)}</span>
                    <div className="h-3 overflow-hidden rounded-full bg-fog">
                      <div className={`h-full rounded-full ${b.key === "current" ? "bg-leaf" : b.key === "d45_plus" ? "bg-coral" : "bg-sun"}`} style={{ width: `${(b.balancePaise / maxBucket) * 100}%` }} />
                    </div>
                    <span className="text-right text-xs font-bold tabular-nums text-forest">{formatPaise(b.balancePaise)}</span>
                  </div>
                ))}
              </div>
              {buckets[4].balancePaise > 0 && (
                <a href="/msmed-interest-calculator/" className="mt-4 inline-block text-xs font-black text-leaf hover:underline">{tr("Calculate MSMED interest on 45+ day dues →")}</a>
              )}
            </section>
          </div>
        )}

        {tab === "invoices" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {(["unpaid", "overdue", "paid", "all"] as Filter[]).map((f) => (
                <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold capitalize transition ${filter === f ? "bg-forest text-white" : "bg-white text-forest hover:bg-mint"}`}>
                  {tr(f)}
                </button>
              ))}
              {clientFilter && (
                <button type="button" onClick={() => setClientFilter(null)} className="rounded-full bg-sun/30 px-3 py-1.5 text-xs font-bold text-forest">
                  {ws.clients[clientFilter]?.name ?? tr("Client")} ×
                </button>
              )}
              <button type="button" onClick={() => setSheet({ kind: "statement" })} className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-leaf ring-1 ring-leaf/20 hover:bg-mint">{tr("Import bank statement")}</button>
              <label htmlFor="ws-search" className="sr-only">{tr("Search invoices")}</label>
              <input id="ws-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr("Search client or number")} className={`${inputClass} ml-auto max-w-xs py-2`} />
            </div>

            {filtered.length === 0 ? (
              <div className="rounded-[1.5rem] border border-dashed border-forest/20 bg-white/70 p-8 text-center">
                <p className="text-sm text-forest/70">{views.length ? tr("No invoices match.") : tr("No invoices yet.")}</p>
                {!views.length && <button type="button" onClick={() => setSheet({ kind: "invoice" })} className={`${primaryButton} mt-3`}>{tr("Add your first invoice")}</button>}
              </div>
            ) : (
              <ul className="space-y-2.5">
                {filtered.map((v) => (
                  <InvoiceRow
                    key={v.invoice.id}
                    view={v}
                    msme={msmeFor(v)}
                    signedIn={signedIn}
                    payLink={paylinks?.byInvoice[v.invoice.id] ? paylinkUrl(paylinks.byInvoice[v.invoice.id].token) : undefined}
                    linkBusy={linkBusy === v.invoice.id}
                    onCreateLink={() => void makeLink(v.invoice.id)}
                    onRevokeLink={() => { const link = paylinks?.byInvoice[v.invoice.id]; if (link) void revokeLink(link.token); }}
                    onPay={() => setSheet({ kind: "payment", id: v.invoice.id })}
                    onRemind={() => setSheet({ kind: "remind", id: v.invoice.id })}
                    onEdit={() => setSheet({ kind: "invoice", id: v.invoice.id })}
                    onVoid={() => { setWs(upsertInvoice(ws, { ...v.invoice, voided: !v.invoice.voided }, Date.now())); }}
                    onDelete={() => { setWs(deleteInvoice(ws, v.invoice.id, Date.now())); setFlash(tr("{number} deleted.", { number: v.invoice.number })); }}
                    onUndoPayment={(paymentId) => setWs(removePayment(ws, v.invoice.id, paymentId, Date.now()))}
                  />
                ))}
              </ul>
            )}
            <p className="text-right text-xs text-forest/55">
              {tr("{n} shown", { n: filtered.length })} · <button type="button" className="font-bold underline" onClick={() => downloadText(`invoices-${today}.csv`, invoicesCsv(filtered), "text/csv;charset=utf-8")}>{tr("Export CSV")}</button>
            </p>
          </div>
        )}

        {tab === "clients" && (
          <div className="space-y-3">
            {liveRecurring(ws).length > 0 && (
              <section className="rounded-[1.5rem] bg-white ring-1 ring-forest/[0.07] shadow-[0_1px_2px_rgba(13,31,23,0.04),0_12px_32px_-18px_rgba(13,31,23,0.18)] p-5" aria-labelledby="monthly-title">
                <h2 id="monthly-title" className="text-lg font-black text-forest">{tr("Monthly billing")}</h2>
                <ul className="mt-2 divide-y divide-forest/5">
                  {liveRecurring(ws).map((plan) => {
                    const ended = plan.endMonth !== "" && plan.endMonth < today.slice(0, 7);
                    return (
                      <li key={plan.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                        <div className="min-w-0">
                          <p className="font-bold text-forest">{ws.clients[plan.clientId]?.name ?? tr("Client")} · {formatPaise(plan.amountPaise)}</p>
                          <p className="text-xs text-forest/60">
                            {tr("Day {d} of each month", { d: plan.dayOfMonth })}{plan.description ? ` · ${plan.description}` : ""}
                            {plan.paused ? tr(" · paused") : ended ? tr(" · ended") : plan.endMonth ? tr(" · until {month}", { month: plan.endMonth }) : ""}
                          </p>
                        </div>
                        {!ended && (
                          <div className="flex gap-2">
                            <button type="button" className="rounded-lg border border-forest/15 px-2.5 py-1.5 text-xs font-bold text-forest hover:bg-mint"
                              onClick={() => { setWs(upsertPlan(ws, { ...plan, paused: !plan.paused }, Date.now())); setFlash(plan.paused ? tr("Monthly billing resumed.") : tr("Monthly billing paused.")); }}>
                              {plan.paused ? tr("Resume") : tr("Pause")}
                            </button>
                            <button type="button" className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-forest/50 hover:text-[#a8321d]"
                              onClick={() => { setWs(upsertPlan(ws, { ...plan, endMonth: today.slice(0, 7) }, Date.now())); setFlash(tr("Monthly billing stops after this month. Existing invoices stay.")); }}>
                              {tr("Stop after this month")}
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
            <div className="flex justify-end"><button type="button" onClick={() => setSheet({ kind: "client" })} className={secondaryButton}>{tr("+ Add client")}</button></div>
            {clients.length === 0 ? (
              <p className="rounded-[1.5rem] border border-dashed border-forest/20 bg-white/70 p-8 text-center text-sm text-forest/70">{tr("Clients are added automatically when you create an invoice.")}</p>
            ) : (
              <ul className="divide-y divide-forest/5 rounded-[1.5rem] bg-white ring-1 ring-forest/[0.07] shadow-[0_1px_2px_rgba(13,31,23,0.04),0_12px_32px_-18px_rgba(13,31,23,0.18)] px-5">
                {clients.map((c) => {
                  const bal = balances.get(c.id);
                  return (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <button type="button" onClick={() => openClientInvoices(c.id)} className="min-w-0 text-left">
                        <p className="truncate font-bold text-forest hover:underline">{c.name}</p>
                        <p className="text-xs text-forest/60">{c.phone || tr("No number")}{bal ? tr(" · {n} open", { n: bal.open }) : ""}</p>
                      </button>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-sm font-black tabular-nums text-forest">{formatPaise(bal?.balancePaise ?? 0)}</p>
                          {bal?.overduePaise ? <p className="text-[11px] font-bold text-[#a8321d]">{tr("{amount} overdue", { amount: formatPaise(bal.overduePaise) })}</p> : null}
                        </div>
                        <button type="button" onClick={() => setSheet({ kind: "client", id: c.id })} className="rounded-lg px-2 py-1 text-xs font-bold text-forest/60 hover:bg-mint" aria-label={tr("Edit {name}", { name: c.name })}>{tr("Edit")}</button>
                      </div>
                      {(bal?.balancePaise ?? 0) > 0 || statementLinks.has(c.id) ? (
                        <div className="w-full text-xs">
                          {statementLinks.has(c.id) ? (
                            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-cream p-2">
                              <label className="sr-only" htmlFor={`stmt-${c.id}`}>{tr("Statement link for {name}", { name: c.name })}</label>
                              <input id={`stmt-${c.id}`} readOnly value={paylinkUrl(statementLinks.get(c.id)!.token)} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 rounded-lg border border-forest/10 bg-white px-2 py-1 font-mono text-[11px]" />
                              <button type="button" className="rounded-lg bg-forest px-2.5 py-1 font-black text-white" onClick={async () => { try { await navigator.clipboard.writeText(paylinkUrl(statementLinks.get(c.id)!.token)); setFlash(tr("Statement link copied.")); } catch { /* select manually */ } }}>{tr("Copy")}</button>
                              <button type="button" className="rounded-lg px-2 py-1 font-bold text-forest/50 hover:text-[#a8321d]" onClick={() => void revokeLink(statementLinks.get(c.id)!.token)}>{tr("Turn off")}</button>
                            </div>
                          ) : !signedIn ? (
                            <span className="text-forest/60">{tr("📄 Statement links need a free account + Pro.")}</span>
                          ) : isPro ? (
                            <button type="button" disabled={linkBusy === c.id} onClick={() => void makeStatementLink(c.id)} className="font-black text-leaf hover:underline disabled:opacity-50">{linkBusy === c.id ? tr("Creating…") : tr("📄 Share statement link — all dues + one UPI button")}</button>
                          ) : (
                            <a href="/app/?tab=settings&upgrade=monthly" className="font-bold text-forest/70 hover:text-leaf">{tr("📄 Statement link for all dues")} · <span className="text-leaf underline">Pro</span></a>
                          )}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {tab === "settings" && (
          <div className="space-y-5">
            <SyncPanel
              state={sync}
              paylinks={paylinks}
              paidLinkTokens={paylinks ? Object.entries(paylinks.byInvoice).filter(([id]) => { if (id.startsWith("stmt:")) return false; const v = views.find((x) => x.invoice.id === id); return !v || v.balancePaise === 0; }).map(([, l]) => l.token) : []}
              onRevokePaid={async (tokens) => { await Promise.all(tokens.map((t) => deletePaylink(t, "link"))); await refreshLinks(); setFlash(tr(tokens.length === 1 ? "Turned off {n} pay link for paid invoices." : "Turned off {n} pay links for paid invoices.", { n: tokens.length })); }}
              invoiceCount={views.length}
              onSyncNow={() => syncRef.current?.syncNow()}
              onSignOut={async () => { await syncRef.current?.signOut(); setFlash(tr("Signed out. Your data stays on this device.")); }}
              onDeleteCloud={async () => {
                const ok = await syncRef.current?.deleteCloudCopy();
                setFlash(ok ? tr("Cloud copy deleted and signed out. This device keeps its data.") : tr("Couldn't delete the cloud copy. Try again."));
              }}
            />
            <NotificationsPanel signedIn={signedIn} standalone={installer.standalone} ios={installer.ios} onFlash={setFlash} />
            <PlanPanel signedIn={signedIn} onFlash={setFlash} />
            <InstallHint standalone={installer.standalone} ios={installer.ios} />
            <SettingsPanel
              ws={ws}
              today={today}
              onChange={(next, message) => { setWs(next); if (message) setFlash(message); }}
            />
          </div>
        )}
      </div>

      {sheet?.kind === "invoice" && (
        <InvoiceSheet ws={ws} today={today} invoiceId={sheet.id} onClose={closeSheet} onSave={(next, id) => {
          const isNew = !sheet.id;
          setWs(next);
          setSheet(null);
          setFlash(isNew ? tr("{number} added.", { number: next.invoices[id].number }) : tr("Invoice updated."));
          if (isNew) trackProductEvent("invoice_tracked", "workspace");
        }} />
      )}
      {sheet?.kind === "payment" && ws.invoices[sheet.id] && (
        <PaymentSheet ws={ws} today={today} invoiceId={sheet.id} initialAmountPaise={sheet.amountPaise} initialReference={sheet.reference} onClose={closeSheet} onSave={(next) => {
          const claimToken = sheet.claimToken;
          setWs(next);
          setSheet(null);
          setFlash(tr("Payment recorded."));
          trackProductEvent("payment_recorded", "workspace");
          if (claimToken) void deletePaylink(claimToken, "claims").then(() => refreshLinks());
        }} />
      )}
      {sheet?.kind === "remind" && ws.invoices[sheet.id] && (
        <ReminderSheet ws={ws} today={today} invoiceId={sheet.id} msmeTools={entitlement.msmeTools} payLink={paylinks?.byInvoice[sheet.id] ? paylinkUrl(paylinks.byInvoice[sheet.id].token) : undefined} onClose={closeSheet} onSent={(next) => {
          setWs(next);
          trackProductEvent("reminder_sent", "workspace");
        }} />
      )}
      {sheet?.kind === "statement" && (
        <StatementSheet ws={ws} today={today} claimedUtrs={claimedUtrs} onClose={closeSheet} onRecord={(next, recorded) => {
          setWs(next);
          setSheet(null);
          setFlash(tr(recorded.length === 1 ? "Recorded {n} payment from your statement." : "Recorded {n} payments from your statement.", { n: recorded.length }));
          trackProductEvent("statement_imported", "workspace");
          // A statement credit with a pay-link UTR settles that claim too.
          const tokens = new Set<string>();
          for (const r of recorded) {
            const link = paylinks?.byInvoice[r.invoiceId];
            if (link && r.credit.utr && link.claims.some((c) => c.utr === r.credit.utr)) tokens.add(link.token);
          }
          if (tokens.size) void Promise.all([...tokens].map((t) => deletePaylink(t, "claims"))).then(() => refreshLinks());
        }} />
      )}
      {sheet?.kind === "client" && (
        <ClientSheet ws={ws} clientId={sheet.id} onClose={closeSheet} onSave={(next, message) => { setWs(next); setSheet(null); setFlash(message); }} />
      )}
    </div>
  );
}

/** An invoice, a WhatsApp reminder and a paid tick: what the tracker does, at a glance. */
function EmptyIllustration() {
  return (
    <svg className="h-28 w-40 shrink-0" viewBox="0 0 160 112" fill="none" aria-hidden="true">
      <rect x="18" y="10" width="78" height="92" rx="10" fill="#eef1ec" />
      <rect x="26" y="20" width="62" height="74" rx="7" fill="#fff" stroke="#113b2c" strokeOpacity=".12" />
      <rect x="34" y="30" width="30" height="5" rx="2.5" fill="#113b2c" />
      <rect x="34" y="41" width="44" height="4" rx="2" fill="#113b2c" fillOpacity=".18" />
      <rect x="34" y="50" width="38" height="4" rx="2" fill="#113b2c" fillOpacity=".18" />
      <rect x="34" y="66" width="20" height="5" rx="2.5" fill="#113b2c" fillOpacity=".3" />
      <text x="80" y="72" textAnchor="end" fontSize="11" fontWeight="800" fill="#113b2c" fontFamily="system-ui, sans-serif">₹4,500</text>
      <rect x="34" y="80" width="46" height="7" rx="3.5" fill="#f6b73c" />
      <path d="M92 34h46a8 8 0 018 8v14a8 8 0 01-8 8h-30l-9 7v-7h-7a8 8 0 01-8-8V42a8 8 0 018-8z" fill="#25D366" />
      <rect x="100" y="43" width="34" height="4" rx="2" fill="#fff" />
      <rect x="100" y="51" width="22" height="4" rx="2" fill="#fff" fillOpacity=".75" />
      <circle cx="128" cy="86" r="15" fill="#287a57" />
      <path d="M121 86l5 5 9-10" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const STAT_ACCENT = {
  collect: { chip: "bg-sun/25 text-[#8a5a00]", bar: "bg-sun", icon: "M12 6v12m-4-9h6.5a2.5 2.5 0 010 5H8m0-5h8M8 9h5" },
  overdue: { chip: "bg-coral/15 text-[#a8321d]", bar: "bg-coral", icon: "M12 8v5m0 3h.01M10.3 3.9L2.6 17a2 2 0 001.7 3h15.4a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" },
  soon: { chip: "bg-[#e3eefb] text-[#1d5fa8]", bar: "bg-[#4a8fd8]", icon: "M8 7V3m8 4V3M4 11h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z" },
  collected: { chip: "bg-mint text-leaf", bar: "bg-leaf", icon: "M5 13l4 4L19 7" },
} as const;

function Stat({ label, value, note, tone, accent }: { label: string; value: string; note?: string; tone?: "good" | "bad"; accent: keyof typeof STAT_ACCENT }) {
  const a = STAT_ACCENT[accent];
  return (
    <div className="relative overflow-hidden rounded-[1.25rem] bg-white p-4 ring-1 ring-forest/[0.07] shadow-[0_1px_2px_rgba(13,31,23,0.04),0_12px_32px_-18px_rgba(13,31,23,0.18)]">
      <span className={`absolute inset-x-0 top-0 h-1 ${a.bar}`} aria-hidden="true" />
      <div className="flex items-center gap-2">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${a.chip}`} aria-hidden="true">
          {accent === "collect"
            ? <span className="text-sm font-black leading-none">₹</span>
            : <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d={a.icon} /></svg>}
        </span>
        <p className="text-xs font-bold text-forest/60">{label}</p>
      </div>
      <p className={`mt-2 text-xl font-black tabular-nums md:text-2xl ${tone === "bad" ? "text-[#a8321d]" : tone === "good" ? "text-leaf" : "text-forest"}`}>{value}</p>
      {note && <p className="mt-0.5 text-[11px] text-forest/55">{note}</p>}
    </div>
  );
}

function InvoiceRow({ view, msme, signedIn, payLink, linkBusy, onCreateLink, onRevokeLink, onPay, onRemind, onEdit, onVoid, onDelete, onUndoPayment }: {
  view: InvoiceView;
  /** Set when a Udyam-registered business's invoice is past its MSMED deadline; interest is null without MSME tools. */
  msme?: { deadline: string; daysLate: number; interestPaise: number | null };
  signedIn: boolean;
  payLink?: string;
  linkBusy: boolean;
  onCreateLink: () => void;
  onRevokeLink: () => void;
  onPay: () => void;
  onRemind: () => void;
  onEdit: () => void;
  onVoid: () => void;
  onDelete: () => void;
  onUndoPayment: (paymentId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);
  const { tr, dateLocale } = useWs();
  const { invoice } = view;
  return (
    <li className="rounded-[1.25rem] bg-white ring-1 ring-forest/[0.07] shadow-[0_1px_2px_rgba(13,31,23,0.04),0_12px_32px_-18px_rgba(13,31,23,0.18)]">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 p-4 text-left">
        <div className="min-w-0">
          <p className="truncate font-bold text-forest">{view.client?.name ?? tr("Unknown client")}</p>
          <p className="text-xs text-forest/60">{invoice.number} · {dueText(view, tr, dateLocale)}{invoice.recurringId ? tr(" · Monthly") : ""}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-black tabular-nums text-forest">{formatPaise(view.state === "paid" || view.state === "void" ? invoice.amountPaise : view.balancePaise)}</p>
          <StatusBadge state={view.state} />
        </div>
      </button>
      {open && (
        <div className="border-t border-forest/5 px-4 pb-4 pt-3 text-sm">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-forest/70 sm:grid-cols-4">
            <div><dt className="font-bold">{tr("Invoice date")}</dt><dd>{shortDate(invoice.issueDate, dateLocale)}</dd></div>
            <div><dt className="font-bold">{tr("Due")}</dt><dd>{shortDate(invoice.dueDate, dateLocale)}</dd></div>
            <div><dt className="font-bold">{tr("Amount")}</dt><dd>{formatPaise(invoice.amountPaise)}</dd></div>
            <div><dt className="font-bold">{tr("Received")}</dt><dd>{formatPaise(view.paidPaise)}</dd></div>
          </dl>
          {invoice.description && <p className="mt-2 text-xs text-forest/70">{invoice.description}</p>}
          {invoice.payments.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-forest/70">
              {invoice.payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 rounded-lg bg-mint/40 px-2 py-1">
                  <span>{formatPaise(p.amountPaise)} · {p.mode.toUpperCase()} · {shortDate(p.date, dateLocale)}{p.reference ? ` · ${p.reference}` : ""}</span>
                  <button type="button" onClick={() => onUndoPayment(p.id)} className="font-bold text-forest/50 hover:text-[#a8321d]" aria-label={tr("Remove this payment")}>{tr("Undo")}</button>
                </li>
              ))}
            </ul>
          )}
          {msme && (
            <p className="mt-3 rounded-xl bg-sun/20 px-3 py-2 text-xs leading-5 text-forest">
              <strong>{tr(msme.daysLate === 1 ? "MSME deadline passed {n} day ago ({date})." : "MSME deadline passed {n} days ago ({date}).", { n: msme.daysLate, date: shortDate(msme.deadline, dateLocale) })}</strong>{" "}
              {msme.interestPaise !== null
                ? tr("Section 16 interest so far: about {amount} at {rate}% a year.", { amount: formatPaise(msme.interestPaise), rate: MSMED_INTEREST_PCT })
                : tr("Pro shows the Section 16 interest due and adds your MSME rights to reminders.")}
            </p>
          )}
          {view.balancePaise > 0 && (
            <div className="mt-3 rounded-xl bg-cream p-3">
              {payLink ? (
                <div className="flex flex-wrap items-center gap-2">
                  <label className="sr-only" htmlFor={`link-${invoice.id}`}>{tr("Pay link")}</label>
                  <input id={`link-${invoice.id}`} readOnly value={payLink} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 rounded-lg border border-forest/10 bg-white px-2 py-1.5 font-mono text-[11px] text-forest" />
                  <button type="button" className="rounded-lg bg-forest px-3 py-1.5 text-xs font-black text-white" onClick={async () => { try { await navigator.clipboard.writeText(payLink); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* select manually */ } }}>{copied ? tr("Copied ✓") : tr("Copy link")}</button>
                  <button type="button" className="rounded-lg px-2 py-1.5 text-xs font-bold text-forest/50 hover:text-[#a8321d]" onClick={onRevokeLink}>{tr("Turn off")}</button>
                </div>
              ) : signedIn ? (
                <button type="button" disabled={linkBusy} onClick={onCreateLink} className="text-xs font-black text-leaf hover:underline disabled:opacity-50">{linkBusy ? tr("Creating pay link…") : tr("🔗 Create pay link — client sees amount + UPI button")}</button>
              ) : (
                <p className="text-xs text-forest/70">{tr("🔗 Pay links need a free account.")} <a className="font-bold text-leaf underline" href={"/sign-up/?redirect_url=" + encodeURIComponent("/app/?tab=invoices")}>{tr("Create one")}</a></p>
              )}
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {view.balancePaise > 0 && <button type="button" onClick={onPay} className="rounded-xl bg-forest px-3 py-2 text-xs font-black text-white hover:bg-leaf">{tr("Record payment")}</button>}
            {view.balancePaise > 0 && <button type="button" onClick={onRemind} className="rounded-xl bg-[#25D366] px-3 py-2 text-xs font-black text-white hover:bg-[#1da851]">{tr("Remind")}</button>}
            <button type="button" onClick={onEdit} className="rounded-xl border border-forest/15 px-3 py-2 text-xs font-bold text-forest hover:bg-mint">{tr("Edit")}</button>
            <button type="button" onClick={onVoid} className="rounded-xl border border-forest/15 px-3 py-2 text-xs font-bold text-forest hover:bg-mint">{invoice.voided ? tr("Restore") : tr("Cancel invoice")}</button>
            {confirmDelete ? (
              <span className="flex items-center gap-2 text-xs font-bold text-[#a8321d]">
                {tr("Delete for good?")}
                <button type="button" onClick={onDelete} className="rounded-lg bg-[#a8321d] px-2 py-1 text-white">{tr("Delete")}</button>
                <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-lg px-2 py-1 text-forest">{tr("Keep")}</button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} className="rounded-xl px-3 py-2 text-xs font-bold text-forest/50 hover:text-[#a8321d]">{tr("Delete")}</button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

function SetupCard({ ws, onSave }: { ws: Workspace; onSave: (next: Workspace) => void }) {
  const [name, setName] = useState(ws.business.name);
  const [upiId, setUpiId] = useState(ws.business.upiId);
  const [error, setError] = useState("");
  const { tr } = useWs();
  return (
    <section className="rounded-[1.5rem] border-2 border-sun/60 bg-cream p-5">
      <h2 className="text-lg font-black text-forest">{tr("Set up in 20 seconds")}</h2>
      <p className="mt-1 text-sm text-forest/70">{tr("Your business name and UPI ID go on payment reminders. Stored only on this device.")}</p>
      <form className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" noValidate onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return setError(tr("Enter your business or your own name."));
        if (upiId.trim() && !isValidVpa(upiId.trim())) return setError(tr("That UPI ID doesn't look right (example: name@okaxis)."));
        onSave(updateBusiness(ws, { name: name.trim().slice(0, 80), upiId: upiId.trim() }, Date.now()));
      }}>
        <Field label={tr("Business name")} htmlFor="ws-setup-name"><input id="ws-setup-name" className={inputClass} value={name} onChange={(e) => { setName(e.target.value); setError(""); }} maxLength={80} placeholder="Sharma Tuition Classes" /></Field>
        <Field label={tr("UPI ID")} htmlFor="ws-setup-upi"><input id="ws-setup-upi" className={inputClass} value={upiId} onChange={(e) => { setUpiId(e.target.value); setError(""); }} maxLength={100} placeholder="name@okaxis" autoCapitalize="none" /></Field>
        <button type="submit" className={primaryButton}>{tr("Save")}</button>
      </form>
      {error && <p role="alert" className="mt-2 text-xs font-bold text-[#a8321d]">{error}</p>}
    </section>
  );
}

function ClientSheet({ ws, clientId, onSave, onClose }: {
  ws: Workspace;
  clientId?: string;
  onSave: (next: Workspace, message: string) => void;
  onClose: () => void;
}) {
  const existing = clientId ? ws.clients[clientId] : undefined;
  const [name, setName] = useState(existing?.name ?? "");
  const [phone, setPhone] = useState(existing?.phone ?? "");
  const [email, setEmail] = useState(existing?.email ?? "");
  const [gstin, setGstin] = useState(existing?.gstin ?? "");
  const [error, setError] = useState("");
  const { tr } = useWs();
  const hasInvoices = !!clientId && Object.values(ws.invoices).some((i) => !i.deletedAt && i.clientId === clientId);

  return (
    <Sheet title={existing ? tr("Edit {name}", { name: existing.name }) : tr("Add client")} onClose={onClose}>
      <form noValidate className="space-y-3" onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return setError(tr("Name is required."));
        if (phone && phone.replace(/\D/g, "").length < 10) return setError(tr("Enter a 10-digit mobile number, or leave it blank."));
        if (gstin && !/^[0-9]{2}[A-Z0-9]{13}$/i.test(gstin.trim())) return setError(tr("GSTIN should be 15 characters, starting with a 2-digit state code."));
        const now = Date.now();
        onSave(upsertClient(ws, {
          id: existing?.id ?? newId("cli"), name: name.trim().slice(0, 80), phone: phone.trim(), email: email.trim().slice(0, 120),
          gstin: gstin.trim().toUpperCase(), createdAt: existing?.createdAt ?? now, updatedAt: now,
        }, now), existing ? tr("Client updated.") : tr("Client added."));
      }}>
        <Field label={tr("Name")} htmlFor="ws-c-name"><input id="ws-c-name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></Field>
        <Field label={tr("WhatsApp number")} htmlFor="ws-c-phone"><input id="ws-c-phone" className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" maxLength={20} /></Field>
        <Field label={tr("Email (optional)")} htmlFor="ws-c-email"><input id="ws-c-email" type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} /></Field>
        <Field label={tr("GSTIN (optional)")} htmlFor="ws-c-gstin"><input id="ws-c-gstin" className={inputClass} value={gstin} onChange={(e) => setGstin(e.target.value)} maxLength={15} autoCapitalize="characters" /></Field>
        {error && <p role="alert" className="text-xs font-bold text-[#a8321d]">{error}</p>}
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="submit" className={`${primaryButton} flex-1`}>{tr("Save")}</button>
          {existing && !hasInvoices && (
            <button type="button" onClick={() => onSave(deleteClient(ws, existing.id, Date.now()), tr("{name} removed.", { name: existing.name }))} className="rounded-xl px-3 py-2 text-xs font-bold text-[#a8321d] hover:bg-coral/10">{tr("Remove client")}</button>
          )}
        </div>
        {existing && hasInvoices && <p className="text-[11px] text-forest/55">{tr("Clients with invoices can't be removed — delete their invoices first.")}</p>}
      </form>
    </Sheet>
  );
}

function SettingsPanel({ ws, today, onChange }: { ws: Workspace; today: string; onChange: (next: Workspace, message?: string) => void }) {
  const [name, setName] = useState(ws.business.name);
  const [upiId, setUpiId] = useState(ws.business.upiId);
  const [phone, setPhone] = useState(ws.business.phone);
  const [gstin, setGstin] = useState(ws.business.gstin);
  const [prefix, setPrefix] = useState(ws.business.invoicePrefix);
  const [udyam, setUdyam] = useState(ws.business.udyam);
  const [error, setError] = useState("");
  const [confirmErase, setConfirmErase] = useState(false);
  const { tr } = useWs();

  async function restore(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 5_000_000) return setError(tr("That file is too large to be a workspace backup."));
    try {
      onChange(restoreBackup(ws, await file.text()), tr("Backup merged into this workspace."));
      setError("");
    } catch (err) {
      setError(err instanceof Error && err.message.startsWith("Not a") ? tr(err.message) : tr("Couldn't read that backup file."));
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[1.5rem] bg-white ring-1 ring-forest/[0.07] shadow-[0_1px_2px_rgba(13,31,23,0.04),0_12px_32px_-18px_rgba(13,31,23,0.18)] p-5">
        <h2 className="text-lg font-black text-forest">{tr("Business details")}</h2>
        <form noValidate className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return setError(tr("Business name is required."));
          if (upiId.trim() && !isValidVpa(upiId.trim())) return setError(tr("That UPI ID doesn't look right (example: name@okaxis)."));
          if (!/^[A-Za-z0-9/_-]{0,12}$/.test(prefix)) return setError(tr("Invoice prefix can use letters, numbers, / _ - (max 12)."));
          if (udyam.trim() && !normalizeUdyam(udyam)) return setError(tr("That Udyam number doesn't look right (example: UDYAM-MH-12-1234567)."));
          setError("");
          setUdyam(normalizeUdyam(udyam));
          onChange(updateBusiness(ws, { name: name.trim(), upiId: upiId.trim(), phone: phone.trim(), gstin: gstin.trim().toUpperCase(), invoicePrefix: prefix, udyam: normalizeUdyam(udyam) }, Date.now()), tr("Settings saved."));
        }}>
          <Field label={tr("Business name")} htmlFor="ws-s-name"><input id="ws-s-name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></Field>
          <Field label={tr("UPI ID for payments")} htmlFor="ws-s-upi"><input id="ws-s-upi" className={inputClass} value={upiId} onChange={(e) => setUpiId(e.target.value)} maxLength={100} autoCapitalize="none" /></Field>
          <Field label={tr("Your phone (optional)")} htmlFor="ws-s-phone"><input id="ws-s-phone" className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" maxLength={20} /></Field>
          <Field label={tr("GSTIN (optional)")} htmlFor="ws-s-gstin"><input id="ws-s-gstin" className={inputClass} value={gstin} onChange={(e) => setGstin(e.target.value)} maxLength={15} /></Field>
          <Field label={tr("Invoice number prefix")} htmlFor="ws-s-prefix"><input id="ws-s-prefix" className={inputClass} value={prefix} onChange={(e) => setPrefix(e.target.value)} maxLength={12} /></Field>
          <Field label={tr("Udyam number (micro/small enterprise, optional)")} htmlFor="ws-s-udyam"><input id="ws-s-udyam" className={inputClass} value={udyam} onChange={(e) => setUdyam(e.target.value)} maxLength={30} placeholder="UDYAM-MH-12-1234567" autoCapitalize="characters" /></Field>
          <p className="text-[11px] leading-4 text-forest/60 sm:col-span-2">{tr("Registered on Udyam as a micro or small manufacturer or service provider? Add your number to see the MSMED deadline on overdue invoices. We treat your invoice due date as the agreed date, capped at 45 days; without a written agreement the law allows only 15.")}</p>
          <div className="flex items-end"><button type="submit" className={`${primaryButton} w-full`}>{tr("Save settings")}</button></div>
        </form>
        {error && <p role="alert" className="mt-2 text-xs font-bold text-[#a8321d]">{error}</p>}
      </section>

      <section className="rounded-[1.5rem] bg-white ring-1 ring-forest/[0.07] shadow-[0_1px_2px_rgba(13,31,23,0.04),0_12px_32px_-18px_rgba(13,31,23,0.18)] p-5">
        <h2 className="text-lg font-black text-forest">{tr("Your data")}</h2>
        <p className="mt-1 text-sm text-forest/70">{tr("Everything lives in this browser. Clearing site data or switching phones loses it unless you keep a backup.")}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={secondaryButton} onClick={() => downloadText(`proupiqr-backup-${today}.json`, backupJson(ws), "application/json")}>{tr("Download backup")}</button>
          <label className={`${secondaryButton} cursor-pointer`}>
            {tr("Restore backup")}
            <input type="file" accept="application/json,.json" className="sr-only" onChange={restore} />
          </label>
          <button type="button" className={secondaryButton} onClick={() => downloadText(`invoices-${today}.csv`, invoicesCsv(invoiceViews(ws, today)), "text/csv;charset=utf-8")}>{tr("Export all as CSV")}</button>
        </div>
        <div className="mt-5 border-t border-forest/5 pt-4">
          {confirmErase ? (
            <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-[#a8321d]">
              {tr("Erase every invoice and client from this browser?")}
              <button type="button" className="rounded-lg bg-[#a8321d] px-3 py-1.5 text-xs text-white" onClick={() => { onChange(eraseWorkspace(ws, Date.now()), tr("Workspace erased.")); setConfirmErase(false); }}>{tr("Erase")}</button>
              <button type="button" className="rounded-lg px-3 py-1.5 text-xs text-forest" onClick={() => setConfirmErase(false)}>{tr("Cancel")}</button>
            </p>
          ) : (
            <button type="button" className="text-xs font-bold text-forest/50 hover:text-[#a8321d]" onClick={() => setConfirmErase(true)}>{tr("Erase workspace on this device…")}</button>
          )}
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-leaf/20 bg-mint/40 p-5">
        <h2 className="text-lg font-black text-forest">{tr("Coming next")}</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-forest/75">
          <li>{tr("Automatic WhatsApp reminders to clients on the due date")}</li>
        </ul>
      </section>
    </div>
  );
}

const SIGN_UP_HREF = "/sign-up/?redirect_url=" + encodeURIComponent("/app/?tab=settings");
const SIGN_IN_HREF = "/sign-in/?redirect_url=" + encodeURIComponent("/app/?tab=settings");

function SyncPill({ state, onClick }: { state: SyncState; onClick: () => void }) {
  const { tr } = useWs();
  const label: Record<SyncState["status"], string> = {
    checking: "…",
    signed_out: "This device only",
    syncing: "Syncing…",
    synced: "Synced ✓",
    offline: "Offline — will sync",
    error: "Sync paused",
    too_large: "Sync stopped",
  };
  const tone = state.status === "synced" ? "bg-mint text-leaf" : state.status === "error" || state.status === "too_large" ? "bg-coral/15 text-[#a8321d]" : "bg-white text-forest/70";
  return (
    <button type="button" onClick={onClick} aria-live="polite" className={`hidden rounded-full border border-forest/10 px-3 py-2 text-xs font-bold sm:inline-flex ${tone}`}>
      {tr(label[state.status])}
    </button>
  );
}

function SyncPanel({ state, paylinks, paidLinkTokens, onRevokePaid, invoiceCount, onSyncNow, onSignOut, onDeleteCloud }: {
  state: SyncState;
  paylinks: PaylinkList | null;
  paidLinkTokens: string[];
  onRevokePaid: (tokens: string[]) => void;
  invoiceCount: number;
  onSyncNow: () => void;
  onSignOut: () => void;
  onDeleteCloud: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [stash, setStash] = useState<string | null>(null);
  useEffect(() => {
    try { setStash(localStorage.getItem(STASH_KEY)); } catch { setStash(null); }
  }, [state.status]);
  const signedIn = state.status !== "signed_out" && state.status !== "checking";
  const { tr, dateLocale } = useWs();

  return (
    <section className="rounded-[1.5rem] bg-white ring-1 ring-forest/[0.07] shadow-[0_1px_2px_rgba(13,31,23,0.04),0_12px_32px_-18px_rgba(13,31,23,0.18)] p-5">
      <h2 className="text-lg font-black text-forest">{tr("Sync across devices")}</h2>
      {state.status === "checking" && <p className="mt-2 text-sm text-forest/60">{tr("Checking your account…")}</p>}
      {state.status === "signed_out" && (
        <>
          <p className="mt-1 text-sm text-forest/70">
            {tr(invoiceCount === 0
              ? "Free account. Your invoices are uploaded when you sign in, then stay in step on your phone and laptop. Without an account, nothing leaves this browser."
              : invoiceCount === 1
                ? "Free account. Your 1 invoice on this device is uploaded when you sign in, then stays in step on your phone and laptop. Without an account, nothing leaves this browser."
                : "Free account. Your {n} invoices on this device are uploaded when you sign in, then stay in step on your phone and laptop. Without an account, nothing leaves this browser.", { n: invoiceCount })}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a href={SIGN_UP_HREF} className={primaryButton}>{tr("Create free account")}</a>
            <a href={SIGN_IN_HREF} className={secondaryButton}>{tr("Sign in")}</a>
          </div>
        </>
      )}
      {signedIn && (
        <>
          <p className="mt-1 text-sm text-forest/70">
            {state.status === "synced" && (state.lastSyncedAt
              ? tr("Synced at {time}. Changes upload automatically.", { time: new Date(state.lastSyncedAt).toLocaleTimeString(dateLocale, { hour: "numeric", minute: "2-digit" }) })
              : tr("Synced. Changes upload automatically."))}
            {state.status === "syncing" && tr("Syncing…")}
            {state.status === "offline" && tr("You're offline. Changes are saved here and will sync when you reconnect.")}
            {(state.status === "error" || state.status === "too_large") && tr(state.message)}
          </p>
          {paylinks?.plan && (
            <p className="mt-3 text-xs text-forest/70">
              {tr("Pay links: {used} of {limit} active on the {plan} plan.", { used: paylinks.plan.used, limit: paylinks.plan.activePaylinks, plan: paylinks.plan.id === "pro" ? "Pro" : tr("Free") })}
              {paidLinkTokens.length > 0 && <> <button type="button" className="font-bold text-leaf underline" onClick={() => onRevokePaid(paidLinkTokens)}>{tr("Turn off {n} for paid invoices", { n: paidLinkTokens.length })}</button></>}
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" onClick={onSyncNow} className={secondaryButton} disabled={state.status === "syncing"}>{tr("Sync now")}</button>
            <button type="button" onClick={onSignOut} className={secondaryButton}>{tr("Sign out")}</button>
            {confirmDelete ? (
              <span className="flex flex-wrap items-center gap-2 text-xs font-bold text-[#a8321d]">
                {tr("Delete the cloud copy and sign out? This device keeps its data.")}
                <button type="button" onClick={() => { setConfirmDelete(false); onDeleteCloud(); }} className="rounded-lg bg-[#a8321d] px-2 py-1 text-white">{tr("Delete cloud copy")}</button>
                <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-lg px-2 py-1 text-forest">{tr("Keep")}</button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} className="rounded-xl px-3 py-2 text-xs font-bold text-forest/50 hover:text-[#a8321d]">{tr("Delete cloud copy…")}</button>
            )}
          </div>
        </>
      )}
      {stash && (
        <div className="mt-4 rounded-2xl bg-sun/20 p-3 text-xs text-forest/80">
          {tr("Data from a different account that was on this device was set aside, not uploaded.")}
          <div className="mt-2 flex gap-2">
            <button type="button" className="font-bold underline" onClick={() => downloadText("proupiqr-other-account-backup.json", JSON.stringify({ app: "proupiqr-workspace", workspace: JSON.parse(stash) }, null, 2), "application/json")}>{tr("Download it")}</button>
            <button type="button" className="font-bold underline" onClick={() => { try { localStorage.removeItem(STASH_KEY); } catch { /* ignore */ } setStash(null); }}>{tr("Discard")}</button>
          </div>
        </div>
      )}
    </section>
  );
}

const CHECKLIST_KEY = "proupiqr-checklist-dismissed";

/** First-week path: business details → invoice → reminder → payment → free account. */
function GettingStarted({ ws, signedIn, onAction }: { ws: Workspace; signedIn: boolean; onAction: (step: "invoice" | "remind" | "payment" | "account") => void }) {
  const { tr } = useWs();
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    try { setDismissed(localStorage.getItem(CHECKLIST_KEY) === "1"); } catch { setDismissed(false); }
  }, []);
  const real = Object.values(ws.invoices).filter((i) => !i.deletedAt && !isSampleId(i.id));
  const steps: { id: "business" | "invoice" | "remind" | "payment" | "account"; label: string; done: boolean }[] = [
    { id: "business", label: tr("Add your business name and UPI ID"), done: Boolean(ws.business.name && ws.business.upiId) },
    { id: "invoice", label: tr("Add an invoice you're waiting on"), done: real.length > 0 },
    { id: "remind", label: tr("Send a WhatsApp reminder"), done: real.some((i) => i.reminders.length > 0) },
    { id: "payment", label: tr("Record a payment you received"), done: real.some((i) => i.payments.length > 0) },
    { id: "account", label: tr("Create a free account for sync and pay links"), done: signedIn },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  if (dismissed || doneCount === steps.length) return null;
  return (
    <section className="rounded-[1.5rem] bg-white ring-1 ring-forest/[0.07] shadow-[0_1px_2px_rgba(13,31,23,0.04),0_12px_32px_-18px_rgba(13,31,23,0.18)] p-5" aria-labelledby="getting-started-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="getting-started-title" className="text-lg font-black text-forest">{tr("Get paid faster in 5 steps")}</h2>
        <span className="text-xs font-bold text-forest/60">{tr("{done} of {total} done", { done: doneCount, total: steps.length })}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-forest/5"><div className="h-full rounded-full bg-leaf" style={{ width: `${(doneCount / steps.length) * 100}%` }} /></div>
      <ol className="mt-3 space-y-1.5 text-sm">
        {steps.map((step) => (
          <li key={step.id} className="flex items-center gap-2">
            <span aria-hidden="true" className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-black ${step.done ? "bg-leaf text-white" : "border border-forest/20 text-forest/40"}`}>{step.done ? "✓" : ""}</span>
            {step.done || step.id === "business"
              ? <span className={step.done ? "text-forest/50 line-through" : "text-forest"}>{step.label}</span>
              : <button type="button" className="text-left font-bold text-leaf hover:underline" onClick={() => onAction(step.id as "invoice" | "remind" | "payment" | "account")}>{step.label}</button>}
          </li>
        ))}
      </ol>
      <button type="button" className="mt-3 text-xs font-bold text-forest/50 hover:text-forest" onClick={() => { setDismissed(true); try { localStorage.setItem(CHECKLIST_KEY, "1"); } catch { /* not remembered */ } }}>{tr("Hide this")}</button>
    </section>
  );
}
