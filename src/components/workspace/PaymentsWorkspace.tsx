import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
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
import { gatewayFeePaise, UPI_MDR } from "../../lib/upiMdr";
import { card, cardNote, cardTitle, dangerText, downloadText, Field, ghostButton, Icon, inputClass, primaryButton, rowButton, rowPrimary, secondaryButton, Sheet, StatusBadge } from "./ui";
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
  const SECTION_NOTE: Record<Tab, string> = {
    overview: tr("Who owes you, and who to chase today."),
    invoices: tr("Every invoice you're waiting on, and what's been paid."),
    clients: tr("Balances by client."),
    settings: tr("Business details, sync, reminders and your plan."),
  };

  return (
    <div className="mx-auto flex max-w-[1240px] flex-col lg:flex-row lg:items-start lg:gap-8">
      {/* Sidebar on desktop, a sticky tab strip on phones and tablets. */}
      <nav
        aria-label={tr("Workspace sections")}
        className="sticky z-30 -mx-4 border-b border-hairline bg-fog/95 px-4 backdrop-blur-sm md:-mx-6 md:px-6 lg:mx-0 lg:w-56 lg:shrink-0 lg:border-0 lg:bg-transparent lg:px-0 lg:backdrop-blur-none"
        style={{ top: "calc(4rem + env(safe-area-inset-top, 0px))" }}
      >
        <div className="hidden items-center gap-2.5 px-2 pb-5 pt-1 lg:flex">
          <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-graphite text-sm font-semibold text-white">{(ws.business.name || "P").trim().charAt(0).toUpperCase()}</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{ws.business.name || tr("Your business")}</p>
            <p className="text-xs text-muted">{isPro ? "Pro" : tr("Free plan")}</p>
          </div>
        </div>
        <div className="flex gap-1 overflow-x-auto py-2 [scrollbar-width:none] lg:flex-col lg:gap-0.5 lg:overflow-visible lg:py-0">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => { setTab(t.id); if (t.id !== "invoices") setClientFilter(null); }}
              aria-current={tab === t.id ? "page" : undefined}
              className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-[8px] px-3 py-2 text-sm font-medium transition-colors duration-150 lg:px-2.5 ${tab === t.id ? "bg-white text-ink shadow-[0_1px_2px_rgba(28,40,64,0.06)] ring-1 ring-hairline" : "text-charcoal hover:bg-white/70 hover:text-ink"}`}
            >
              <span className={tab === t.id ? "text-ink" : "text-muted"}><Icon name={t.id} /></span>
              {tr(t.label)}
              {t.id === "invoices" && summary.overdueCount > 0 && <span className="ml-auto rounded-[6px] bg-[#fdeeec] px-1.5 text-[11px] font-semibold tabular-nums text-[#a8321d]">{summary.overdueCount}</span>}
            </button>
          ))}
        </div>
        <div className="mt-6 hidden space-y-3 border-t border-hairline px-2 pt-4 lg:block">
          <LangToggle />
        </div>
      </nav>

      <div className="min-w-0 flex-1 pt-5 lg:pt-0">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-[22px] font-semibold leading-tight text-ink md:text-2xl">{ws.business.name || tr("Who owes you money?")}</h1>
            <p className="mt-1 text-[13px] text-muted">{SECTION_NOTE[tab]}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="lg:hidden"><LangToggle /></span>
            {installer.canInstall && <button type="button" onClick={() => void installer.install()} className={secondaryButton}>{tr("Install app")}</button>}
            <SyncPill state={sync} onClick={() => setTab("settings")} />
            <button type="button" onClick={() => setSheet({ kind: "invoice" })} className={primaryButton}>{tr("+ New invoice")}</button>
          </div>
        </header>

        <p className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-muted">
          {sync.status === "synced" || sync.status === "syncing" ? (
            <><Icon name="cloud" className="h-3.5 w-3.5 text-leaf" />{tr("Synced to your account — open proupiqr.in/app on any device and sign in to see the same invoices.")}</>
          ) : (
            <><Icon name="lock" className="h-3.5 w-3.5" />{tr("Saved only in this browser — no account needed.")} <button type="button" className="font-medium text-leaf hover:underline" onClick={() => setTab("settings")}>{tr("Back up or sync across devices")}</button></>
          )}
        </p>
        {saveFailed && <p role="alert" className={`mt-3 rounded-[10px] bg-[#fdeeec] px-4 py-2.5 text-[13px] font-medium ${dangerText}`}>{tr("This browser blocked saving. Your changes will be lost when you close the tab — download a backup from Settings.")}</p>}

        {flash && (
          <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[70] flex justify-center px-4" style={{ bottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}>
            <p role="status" className="ws-toast pointer-events-auto flex items-center gap-2 rounded-[10px] bg-graphite px-4 py-2.5 text-sm font-medium text-white shadow-[0_8px_24px_rgba(16,17,19,0.24)]">
              <Icon name="check" className="h-4 w-4 text-[#7fd1a8]" />{flash}
            </p>
          </div>
        )}
        {upsell && (
          <section role="status" className={`${card} mt-4 flex flex-wrap items-center justify-between gap-3 px-4 py-3`}>
            <div className="min-w-0 text-sm">
              <p className="font-semibold text-ink">{tr("You've used all {n} free pay links.", { n: paylinks?.plan?.activePaylinks ?? 10 })}</p>
              <p className={cardNote}>{tr("Pro gives unlimited pay links and client statement links for {price}/month. Or turn off links for paid invoices in Settings.", { price: PRO_PRICES.monthly.label })}</p>
            </div>
            <div className="flex gap-2">
              <a href="/app/?tab=settings&upgrade=monthly" className={primaryButton}>{tr("See Pro")}</a>
              <button type="button" onClick={() => setUpsell(false)} className={ghostButton}>{tr("Not now")}</button>
            </div>
          </section>
        )}

        <div className="mt-5">
          {tab === "overview" && (
            <div className="space-y-4">
              {statementClaims.length > 0 && (
                <ClaimsCard id="stmt-claims-title" title={tr("Statement payments to confirm")} note={tr("Check your bank or UPI app first. Confirmed amounts are applied to the oldest unpaid invoices.")}>
                  {statementClaims.map(({ clientId, token, claim }) => (
                    <li key={`${token}-${claim.utr}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0 text-sm">
                        <p className="font-medium text-ink">{tr("{name} says they paid {amount} on their statement", { name: ws.clients[clientId]?.name ?? tr("Client"), amount: claim.amountPaise ? formatPaise(claim.amountPaise) : tr("an amount") })}</p>
                        <p className="text-[13px] text-muted">UTR <span className="font-mono">{claim.utr}</span> · {new Date(claim.at).toLocaleString(dateLocale, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</p>
                      </div>
                      <div className="flex gap-2">
                        {claim.amountPaise && (balances.get(clientId)?.balancePaise ?? 0) > 0 && (
                          <button type="button" className={rowPrimary} onClick={() => applyStatementClaim(clientId, token, claim)}>{tr("Confirm & apply")}</button>
                        )}
                        <button type="button" className={rowButton} onClick={async () => { await deletePaylink(token, "claims"); await refreshLinks(); }}>{tr("Not received")}</button>
                      </div>
                    </li>
                  ))}
                </ClaimsCard>
              )}

              {pendingClaims.length > 0 && (
                <ClaimsCard id="claims-title" title={tr("Payments to confirm")} note={tr("Clients sent these from your pay links. Check your bank or UPI app before confirming.")}>
                  {pendingClaims.map(({ invoiceId, token, claim, view }) => (
                    <li key={`${token}-${claim.utr}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0 text-sm">
                        <p className="font-medium text-ink">{tr("{name} says they paid {amount}", { name: view.client?.name ?? tr("Client"), amount: formatPaise(claim.amountPaise ?? view.balancePaise) })}</p>
                        <p className="text-[13px] text-muted">{view.invoice.number} · UTR <span className="font-mono">{claim.utr}</span> · {new Date(claim.at).toLocaleString(dateLocale, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</p>
                      </div>
                      <div className="flex gap-2">
                        {view.balancePaise > 0 && (
                          <button type="button" className={rowPrimary}
                            onClick={() => setSheet({ kind: "payment", id: invoiceId, amountPaise: claim.amountPaise ?? view.balancePaise, reference: claim.utr, claimToken: token })}>
                            {tr("Confirm & record")}
                          </button>
                        )}
                        <button type="button" className={rowButton}
                          onClick={async () => { await deletePaylink(token, "claims"); await refreshLinks(); }}>
                          {view.balancePaise > 0 ? tr("Not received") : tr("Dismiss")}
                        </button>
                      </div>
                    </li>
                  ))}
                </ClaimsCard>
              )}

              {ready && !signedIn && <SyncNudge ws={ws} today={today} />}
              {hasSampleData(ws) && (
                <p className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] bg-white px-4 py-2.5 text-[13px] text-charcoal ring-1 ring-hairline">
                  {tr("You're looking at sample data.")}
                  <button type="button" className="font-medium text-leaf hover:underline" onClick={() => { setWs(removeSampleData(ws, Date.now())); setFlash(tr("Sample data cleared.")); }}>{tr("Clear sample data")}</button>
                </p>
              )}
              {views.length === 0 && !signedIn && (
                <div className={`${card} flex flex-col items-center gap-5 p-6 text-center sm:flex-row sm:text-left`}>
                  <EmptyIllustration />
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold text-ink">{tr("New here? See how it works with a few sample invoices, or add your own.")}</p>
                    <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
                      <button type="button" className={secondaryButton} onClick={() => { setWs(addSampleData(ws, today, Date.now())); setFlash(tr("Sample invoices added — try Remind or Got paid.")); }}>{tr("Try with sample data")}</button>
                      <button type="button" className={primaryButton} onClick={() => setSheet({ kind: "invoice" })}>{tr("Add your first invoice")}</button>
                    </div>
                  </div>
                </div>
              )}
              {needsSetup && <SetupCard ws={ws} onSave={(next) => { setWs(next); setFlash(tr("Business details saved.")); }} />}

              <section aria-label={tr("Summary")} className={`${card} grid grid-cols-2 md:grid-cols-4`}>
                <Stat label={tr("To collect")} value={formatPaise(summary.outstandingPaise)} note={tr(summary.openCount === 1 ? "{n} open invoice" : "{n} open invoices", { n: summary.openCount })} className="border-b border-r border-hairline md:border-b-0" />
                <Stat label={tr("Overdue")} value={formatPaise(summary.overduePaise)} note={tr(summary.overdueCount === 1 ? "{n} invoice" : "{n} invoices", { n: summary.overdueCount })} dot={summary.overduePaise ? "bg-[#d84a3a]" : undefined} tone={summary.overduePaise ? "bad" : undefined} className="border-b border-hairline md:border-b-0 md:border-r" />
                <Stat label={tr("Due in 7 days")} value={formatPaise(summary.dueSoonPaise)} note={tr(summary.dueSoonCount === 1 ? "{n} invoice" : "{n} invoices", { n: summary.dueSoonCount })} dot={summary.dueSoonPaise ? "bg-[#e8a33d]" : undefined} className="border-r border-hairline" />
                <Stat label={tr("Collected this month")} value={formatPaise(summary.collectedThisMonthPaise)} dot={summary.collectedThisMonthPaise ? "bg-[#1f7a52]" : undefined} />
              </section>

              <GatewaySavings ws={ws} today={today} isPro={isPro} />
              <GettingStarted ws={ws} signedIn={signedIn} onAction={(step) => {
                if (step === "invoice") setSheet({ kind: "invoice" });
                else if (step === "remind" || step === "payment") setTab("invoices");
                else if (step === "account") location.href = SIGN_UP_HREF;
              }} />

              <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
                <section className={card} aria-labelledby="chase-title">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-hairline px-4 py-3.5">
                    <h2 id="chase-title" className={cardTitle}>{tr("Chase today")}</h2>
                    {summary.openCount > 0 && <button type="button" onClick={() => setSheet({ kind: "statement" })} className="text-[13px] font-medium text-leaf hover:underline">{tr("Got paid? Import bank statement")}</button>}
                  </div>
                  {chase.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-muted">{views.length ? tr("Nothing overdue.") : tr("Add your first invoice to see who to follow up with.")}</p>
                  ) : (
                    <ul className="divide-y divide-hairline">
                      {chase.map((v) => (
                        <li key={v.invoice.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_7rem_auto]">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-ink">{v.client?.name ?? tr("Unknown client")} <span className="font-normal text-muted">· {v.invoice.number}</span></p>
                            <p className="text-[13px] text-muted"><span className={v.daysPastDue > 0 ? "text-[#a8321d]" : ""}>{dueText(v, tr, dateLocale)}</span>{v.invoice.reminders.length ? tr(" · reminded {n}×", { n: v.invoice.reminders.length }) : ""}</p>
                          </div>
                          <p className="text-right text-sm font-semibold tabular-nums text-ink">{formatPaise(v.balancePaise)}</p>
                          <div className="col-span-2 flex gap-2 sm:col-span-1 sm:justify-end">
                            <button type="button" onClick={() => setSheet({ kind: "remind", id: v.invoice.id })} className={rowButton}><Icon name="whatsapp" className="h-3.5 w-3.5 text-[#1da851]" />{tr("Remind")}</button>
                            <button type="button" onClick={() => setSheet({ kind: "payment", id: v.invoice.id })} className={rowButton}>{tr("Got paid")}</button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className={`${card} p-4`} aria-labelledby="aging-title">
                  <h2 id="aging-title" className={cardTitle}>{tr("Unpaid by age")}</h2>
                  <div className="mt-4 space-y-3">
                    {buckets.map((b) => (
                      <div key={b.key} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-3 text-sm">
                        <span className="text-[13px] text-charcoal">{tr(b.label)}</span>
                        <div className="h-1.5 overflow-hidden rounded-full bg-fog">
                          <div className={`h-full rounded-full ${b.key === "current" ? "bg-[#1f7a52]" : b.key === "d45_plus" ? "bg-[#d84a3a]" : "bg-graphite"}`} style={{ width: `${(b.balancePaise / maxBucket) * 100}%` }} />
                        </div>
                        <span className="text-right text-[13px] font-medium tabular-nums text-ink">{formatPaise(b.balancePaise)}</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 border-t border-hairline pt-3 text-xs leading-5 text-muted">{tr("If you are a Udyam-registered micro or small enterprise, business buyers owe you interest on dues unpaid after 45 days (MSMED Act, 2006 §15–16).")}</p>
                  {buckets[4].balancePaise > 0 && (
                    <a href="/msmed-interest-calculator/" className="mt-2 inline-block text-[13px] font-medium text-leaf hover:underline">{tr("Calculate MSMED interest on 45+ day dues →")}</a>
                  )}
                </section>
              </div>
            </div>
          )}

          {tab === "invoices" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div role="group" aria-label={tr("Filter invoices")} className="inline-flex rounded-[10px] bg-white p-0.5 ring-1 ring-hairline">
                  {(["unpaid", "overdue", "paid", "all"] as Filter[]).map((f) => (
                    <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f}
                      className={`rounded-[8px] px-3 py-1.5 text-[13px] font-medium capitalize transition-colors duration-150 ${filter === f ? "bg-graphite text-white" : "text-charcoal hover:text-ink"}`}>
                      {tr(f)}
                    </button>
                  ))}
                </div>
                {clientFilter && (
                  <button type="button" onClick={() => setClientFilter(null)} className={rowButton}>
                    {ws.clients[clientFilter]?.name ?? tr("Client")} ×
                  </button>
                )}
                <div className="ml-auto flex w-full items-center gap-2 sm:w-auto">
                  <label htmlFor="ws-search" className="sr-only">{tr("Search invoices")}</label>
                  <div className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
                    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"><Icon name="search" /></span>
                    <input id="ws-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr("Search client or number")} className={`${inputClass} py-1.5 pl-8`} />
                  </div>
                  <button type="button" onClick={() => setSheet({ kind: "statement" })} className={rowButton}>{tr("Import bank statement")}</button>
                </div>
              </div>

              {filtered.length === 0 ? (
                <div className={`${card} p-10 text-center`}>
                  <p className="text-sm text-muted">{views.length ? tr("No invoices match.") : tr("No invoices yet.")}</p>
                  {!views.length && <button type="button" onClick={() => setSheet({ kind: "invoice" })} className={`${primaryButton} mt-3`}>{tr("Add your first invoice")}</button>}
                </div>
              ) : (
                <div className={`${card} overflow-hidden`}>
                  <div aria-hidden="true" className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_8rem_6.5rem] gap-4 border-b border-hairline bg-[#fafbfc] px-4 py-2 text-xs font-medium text-muted md:grid">
                    <span>{tr("Client")}</span><span>{tr("Invoice")}</span><span className="text-right">{tr("Amount")}</span><span>{tr("Status")}</span>
                  </div>
                  <ul className="divide-y divide-hairline">
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
                </div>
              )}
              <p className="text-right text-[13px] text-muted">
                {tr("{n} shown", { n: filtered.length })} · <button type="button" className="font-medium text-leaf hover:underline" onClick={() => downloadText(`invoices-${today}.csv`, invoicesCsv(filtered), "text/csv;charset=utf-8")}>{tr("Export CSV")}</button>
              </p>
            </div>
          )}

          {tab === "clients" && (
            <div className="space-y-4">
              {liveRecurring(ws).length > 0 && (
                <section className={card} aria-labelledby="monthly-title">
                  <h2 id="monthly-title" className={`${cardTitle} border-b border-hairline px-4 py-3.5`}>{tr("Monthly billing")}</h2>
                  <ul className="divide-y divide-hairline">
                    {liveRecurring(ws).map((plan) => {
                      const ended = plan.endMonth !== "" && plan.endMonth < today.slice(0, 7);
                      return (
                        <li key={plan.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                          <div className="min-w-0">
                            <p className="font-medium text-ink">{ws.clients[plan.clientId]?.name ?? tr("Client")} · <span className="tabular-nums">{formatPaise(plan.amountPaise)}</span></p>
                            <p className="text-[13px] text-muted">
                              {tr("Day {d} of each month", { d: plan.dayOfMonth })}{plan.description ? ` · ${plan.description}` : ""}
                              {plan.paused ? tr(" · paused") : ended ? tr(" · ended") : plan.endMonth ? tr(" · until {month}", { month: plan.endMonth }) : ""}
                            </p>
                          </div>
                          {!ended && (
                            <div className="flex gap-2">
                              <button type="button" className={rowButton}
                                onClick={() => { setWs(upsertPlan(ws, { ...plan, paused: !plan.paused }, Date.now())); setFlash(plan.paused ? tr("Monthly billing resumed.") : tr("Monthly billing paused.")); }}>
                                {plan.paused ? tr("Resume") : tr("Pause")}
                              </button>
                              <button type="button" className={`${ghostButton} hover:text-[#a8321d]`}
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
              <div className="flex items-center justify-between gap-3">
                <p className="text-[13px] text-muted">{tr(clients.length === 1 ? "{n} client" : "{n} clients", { n: clients.length })}</p>
                <button type="button" onClick={() => setSheet({ kind: "client" })} className={secondaryButton}>{tr("+ Add client")}</button>
              </div>
              {clients.length === 0 ? (
                <p className={`${card} p-10 text-center text-sm text-muted`}>{tr("Clients are added automatically when you create an invoice.")}</p>
              ) : (
                <div className={`${card} overflow-hidden`}>
                  <div aria-hidden="true" className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_8rem_4rem] gap-4 border-b border-hairline bg-[#fafbfc] px-4 py-2 text-xs font-medium text-muted md:grid">
                    <span>{tr("Client")}</span><span>{tr("WhatsApp number")}</span><span className="text-right">{tr("Balance")}</span><span />
                  </div>
                  <ul className="divide-y divide-hairline">
                    {clients.map((c) => {
                      const bal = balances.get(c.id);
                      return (
                        <li key={c.id} className="px-4 py-3">
                          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-4 gap-y-1 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_8rem_4rem]">
                            <div className="flex min-w-0 items-center gap-2.5">
                              <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-fog text-xs font-semibold text-charcoal">{c.name.trim().charAt(0).toUpperCase()}</span>
                              <button type="button" onClick={() => openClientInvoices(c.id)} className="min-w-0 text-left">
                                <span className="block truncate text-sm font-medium text-ink hover:underline">{c.name}</span>
                                <span className="block text-[13px] text-muted md:hidden">{c.phone || tr("No number")}{bal ? tr(" · {n} open", { n: bal.open }) : ""}</span>
                                <span className="hidden text-[13px] text-muted md:block">{bal ? tr("{n} open", { n: bal.open }).trim() : "—"}</span>
                              </button>
                            </div>
                            <span className="hidden truncate text-[13px] tabular-nums text-charcoal md:block">{c.phone || tr("No number")}</span>
                            <div className="text-right">
                              <p className="text-sm font-semibold tabular-nums text-ink">{formatPaise(bal?.balancePaise ?? 0)}</p>
                              {bal?.overduePaise ? <p className="text-xs font-medium text-[#a8321d]">{tr("{amount} overdue", { amount: formatPaise(bal.overduePaise) })}</p> : null}
                            </div>
                            <button type="button" onClick={() => setSheet({ kind: "client", id: c.id })} className={`${ghostButton} justify-self-end`} aria-label={tr("Edit {name}", { name: c.name })}>{tr("Edit")}</button>
                          </div>
                          {(bal?.balancePaise ?? 0) > 0 || statementLinks.has(c.id) ? (
                            <div className="mt-2 text-[13px] md:pl-[2.375rem]">
                              {statementLinks.has(c.id) ? (
                                <div className="flex flex-wrap items-center gap-2 rounded-[10px] bg-fog p-2">
                                  <label className="sr-only" htmlFor={`stmt-${c.id}`}>{tr("Statement link for {name}", { name: c.name })}</label>
                                  <input id={`stmt-${c.id}`} readOnly value={paylinkUrl(statementLinks.get(c.id)!.token)} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 rounded-[8px] border border-hairline bg-white px-2 py-1 font-mono text-[11px] text-ink" />
                                  <button type="button" className={rowPrimary} onClick={async () => { try { await navigator.clipboard.writeText(paylinkUrl(statementLinks.get(c.id)!.token)); setFlash(tr("Statement link copied.")); } catch { /* select manually */ } }}>{tr("Copy")}</button>
                                  <button type="button" className={`${ghostButton} hover:text-[#a8321d]`} onClick={() => void revokeLink(statementLinks.get(c.id)!.token)}>{tr("Turn off")}</button>
                                </div>
                              ) : !signedIn ? (
                                <span className="text-muted">{tr("Statement links need a free account + Pro.")}</span>
                              ) : isPro ? (
                                <button type="button" disabled={linkBusy === c.id} onClick={() => void makeStatementLink(c.id)} className="inline-flex items-center gap-1.5 font-medium text-leaf hover:underline disabled:opacity-50"><Icon name="link" className="h-3.5 w-3.5" />{linkBusy === c.id ? tr("Creating…") : tr("Share statement link — all dues + one UPI button")}</button>
                              ) : (
                                <a href="/app/?tab=settings&upgrade=monthly" className="inline-flex items-center gap-1.5 text-charcoal hover:text-ink"><Icon name="link" className="h-3.5 w-3.5" />{tr("Statement link for all dues")} · <span className="font-medium text-leaf">Pro</span></a>
                              )}
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          )}

          {tab === "settings" && (
            <div className="max-w-3xl space-y-4">
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

function ClaimsCard({ id, title, note, children }: { id: string; title: string; note: string; children: ReactNode }) {
  return (
    <section className={`${card} border-l-[3px] border-l-[#e8a33d]`} aria-labelledby={id}>
      <div className="border-b border-hairline px-4 py-3.5">
        <h2 id={id} className={cardTitle}>{title}</h2>
        <p className={`mt-0.5 ${cardNote}`}>{note}</p>
      </div>
      <ul className="divide-y divide-hairline">{children}</ul>
    </section>
  );
}

const NUDGE_KEY = "proupiqr-sync-nudge-dismissed";
const NUDGE_SNOOZE_MS = 14 * 86_400_000;
/** Apps whose built-in browser keeps its own storage, which people lose easily. */
const IN_APP_BROWSER = /Instagram|FBAN|FBAV|FB_IAB|Line\/|Snapchat/i;

/**
 * Local-only workspaces vanish with browser data. Once someone has real invoices to
 * lose (two, or one with a payment), ask them to keep a free cloud copy; sign-up
 * uploads what's here. "Not now" hides it for 14 days.
 */
function SyncNudge({ ws, today }: { ws: Workspace; today: string }) {
  const { tr } = useWs();
  const [hidden, setHidden] = useState(true);
  const [inApp, setInApp] = useState(false);
  useEffect(() => {
    let dismissedAt = 0;
    try { dismissedAt = Number(localStorage.getItem(NUDGE_KEY)) || 0; } catch { /* storage blocked */ }
    setHidden(Date.now() - dismissedAt < NUDGE_SNOOZE_MS);
    setInApp(IN_APP_BROWSER.test(navigator.userAgent));
  }, []);
  const real = Object.values(ws.invoices).filter((i) => !i.deletedAt && !isSampleId(i.id));
  const atRisk = real.length >= 2 || real.some((i) => i.payments.length > 0) || (inApp && real.length > 0);
  if (hidden || !atRisk) return null;
  const dismiss = () => {
    try { localStorage.setItem(NUDGE_KEY, String(Date.now())); } catch { /* storage blocked */ }
    setHidden(true);
  };
  return (
    <section className={`${card} flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between`} aria-labelledby="sync-nudge-title">
      <div className="flex gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-fog text-ink" aria-hidden="true"><Icon name="cloud" className="h-[18px] w-[18px]" /></span>
        <div className="min-w-0">
          <h2 id="sync-nudge-title" className={cardTitle}>{real.length === 1 ? tr("Keep this invoice safe") : tr("Keep these {n} invoices safe", { n: real.length })}</h2>
          <p className={`mt-0.5 ${cardNote}`}>{tr("They're saved only in this browser. Clearing it or switching phones loses them. A free account backs them up and syncs your phone and laptop.")}</p>
          {inApp && <p className="mt-2 text-[13px] font-medium text-[#8a5a00]">{tr("You're in an app's built-in browser, which forgets data easily. Open this page in Chrome or Safari.")}</p>}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <a href={SIGN_UP_HREF} className={primaryButton}>{tr("Save with a free account")}</a>
        <button type="button" onClick={() => downloadText(`proupiqr-backup-${today}.json`, backupJson(ws), "application/json")} className={secondaryButton}>{tr("Download backup")}</button>
        <button type="button" onClick={dismiss} className={ghostButton}>{tr("Not now")}</button>
      </div>
    </section>
  );
}

/** UPI payments recorded this month on real (non-sample) invoices, in paise. */
export function upiCollectedInMonth(ws: Workspace, today: string): number {
  const month = today.slice(0, 7);
  let total = 0;
  for (const invoice of Object.values(ws.invoices)) {
    if (invoice.deletedAt || isSampleId(invoice.id)) continue;
    for (const payment of invoice.payments) if (payment.mode === "upi" && payment.date.startsWith(month)) total += payment.amountPaise;
  }
  return total;
}

/** ₹10,000: below this the gateway comparison is too small to matter. */
const SAVINGS_FROM_PAISE = 10_000_00;

/** What a 2.36% card/gateway checkout would have taken from this month's direct UPI collections. */
function GatewaySavings({ ws, today, isPro }: { ws: Workspace; today: string; isPro: boolean }) {
  const { tr } = useWs();
  const collected = upiCollectedInMonth(ws, today);
  if (collected < SAVINGS_FROM_PAISE) return null;
  // Monthly sales whose gateway fee would equal the Pro price, rounded up to the rupee.
  const breakEven = Math.ceil((PRO_PRICES.monthly.paise * 10_000) / UPI_MDR.gatewayRateBps / 100) * 100;
  return (
    <section className={`${card} flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between`}>
      <div className="min-w-0 text-sm leading-6">
        <p className="font-medium text-ink">{tr("You collected {amount} by UPI this month, straight to your bank. A card or payment gateway at 2.36% would have kept about {fee}.", { amount: formatPaise(collected), fee: formatPaise(gatewayFeePaise(collected)) })}</p>
        {!isPro && <p className={cardNote}>{tr("Pro costs {price}/month, less than the gateway fee on {amount} of sales.", { price: PRO_PRICES.monthly.label, amount: formatPaise(breakEven) })}</p>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {!isPro && <a href="/app/?tab=settings&upgrade=monthly" className={secondaryButton}>{tr("See Pro")}</a>}
        <a href="/upi-mdr-calculator/" className="text-[13px] font-medium text-leaf hover:underline">{tr("Compare UPI and gateway fees")}</a>
      </div>
    </section>
  );
}

/** An invoice, a reminder and a paid tick, drawn in the Ledger palette. */
function EmptyIllustration() {
  return (
    <svg className="h-24 w-36 shrink-0" viewBox="0 0 160 112" fill="none" aria-hidden="true">
      <rect x="22" y="12" width="70" height="88" rx="8" fill="#fff" stroke="#e4e7ec" />
      <rect x="32" y="24" width="28" height="5" rx="2.5" fill="#1c1d1f" />
      <rect x="32" y="36" width="44" height="4" rx="2" fill="#cad0d9" />
      <rect x="32" y="45" width="36" height="4" rx="2" fill="#cad0d9" />
      <rect x="32" y="64" width="18" height="4" rx="2" fill="#cad0d9" />
      <text x="82" y="70" textAnchor="end" fontSize="11" fontWeight="600" fill="#1c1d1f" fontFamily="Inter Variable, system-ui, sans-serif">₹4,500</text>
      <rect x="32" y="80" width="50" height="8" rx="4" fill="#f4f5f6" />
      <rect x="98" y="30" width="48" height="30" rx="8" fill="#fff" stroke="#e4e7ec" />
      <rect x="106" y="39" width="32" height="4" rx="2" fill="#cad0d9" />
      <rect x="106" y="47" width="20" height="4" rx="2" fill="#e4e7ec" />
      <circle cx="124" cy="84" r="14" fill="#1f7a52" />
      <path d="M118 84l4.5 4.5 8-9" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Stat({ label, value, note, tone, dot, className = "" }: { label: string; value: string; note?: string; tone?: "good" | "bad"; dot?: string; className?: string }) {
  return (
    <div className={`min-w-0 px-4 py-4 ${className}`}>
      <p className="flex items-center gap-1.5 text-[13px] text-muted">{dot && <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dot}`} />}{label}</p>
      <p className={`mt-1 truncate text-xl font-semibold tabular-nums tracking-[-0.01em] md:text-[22px] ${tone === "bad" ? "text-[#a8321d]" : "text-ink"}`}>{value}</p>
      {note && <p className="mt-0.5 text-xs text-muted">{note}</p>}
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
    <li className={open ? "bg-[#fafbfc]" : undefined}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 text-left transition-colors duration-150 hover:bg-[#fafbfc] md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_8rem_6.5rem]">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{view.client?.name ?? tr("Unknown client")}</p>
          <p className="truncate text-[13px] text-muted md:hidden">{invoice.number} · {dueText(view, tr, dateLocale)}{invoice.recurringId ? tr(" · Monthly") : ""}</p>
        </div>
        <p className="hidden min-w-0 truncate text-[13px] text-charcoal md:block"><span className="font-mono text-[12px] text-ink">{invoice.number}</span> · {dueText(view, tr, dateLocale)}{invoice.recurringId ? tr(" · Monthly") : ""}</p>
        <div className="text-right md:contents">
          <p className="text-sm font-semibold tabular-nums text-ink md:text-right">{formatPaise(view.state === "paid" || view.state === "void" ? invoice.amountPaise : view.balancePaise)}</p>
          <div className="md:justify-self-start"><StatusBadge state={view.state} /></div>
        </div>
      </button>
      {open && (
        <div className="ws-row-detail border-t border-hairline px-4 pb-4 pt-3 text-sm">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] sm:grid-cols-4">
            <div><dt className="text-muted">{tr("Invoice date")}</dt><dd className="text-ink">{shortDate(invoice.issueDate, dateLocale)}</dd></div>
            <div><dt className="text-muted">{tr("Due")}</dt><dd className="text-ink">{shortDate(invoice.dueDate, dateLocale)}</dd></div>
            <div><dt className="text-muted">{tr("Amount")}</dt><dd className="tabular-nums text-ink">{formatPaise(invoice.amountPaise)}</dd></div>
            <div><dt className="text-muted">{tr("Received")}</dt><dd className="tabular-nums text-ink">{formatPaise(view.paidPaise)}</dd></div>
          </dl>
          {invoice.description && <p className="mt-3 text-[13px] text-charcoal">{invoice.description}</p>}
          {invoice.payments.length > 0 && (
            <ul className="mt-3 divide-y divide-hairline rounded-[10px] bg-white text-[13px] ring-1 ring-hairline">
              {invoice.payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                  <span className="text-charcoal"><span className="font-medium tabular-nums text-ink">{formatPaise(p.amountPaise)}</span> · {p.mode.toUpperCase()} · {shortDate(p.date, dateLocale)}{p.reference ? ` · ${p.reference}` : ""}</span>
                  <button type="button" onClick={() => onUndoPayment(p.id)} className="font-medium text-muted hover:text-[#a8321d]" aria-label={tr("Remove this payment")}>{tr("Undo")}</button>
                </li>
              ))}
            </ul>
          )}
          {msme && (
            <p className="mt-3 rounded-[10px] bg-[#fdf4e6] px-3 py-2 text-[13px] leading-5 text-[#6b4600]">
              <strong className="font-semibold">{tr(msme.daysLate === 1 ? "MSME deadline passed {n} day ago ({date})." : "MSME deadline passed {n} days ago ({date}).", { n: msme.daysLate, date: shortDate(msme.deadline, dateLocale) })}</strong>{" "}
              {msme.interestPaise !== null
                ? tr("Section 16 interest so far: about {amount} at {rate}% a year.", { amount: formatPaise(msme.interestPaise), rate: MSMED_INTEREST_PCT })
                : tr("Pro shows the Section 16 interest due and adds your MSME rights to reminders.")}
            </p>
          )}
          {view.balancePaise > 0 && (
            <div className="mt-3">
              {payLink ? (
                <div className="flex flex-wrap items-center gap-2 rounded-[10px] bg-white p-2 ring-1 ring-hairline">
                  <label className="sr-only" htmlFor={`link-${invoice.id}`}>{tr("Pay link")}</label>
                  <input id={`link-${invoice.id}`} readOnly value={payLink} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 rounded-[8px] bg-fog px-2 py-1.5 font-mono text-[11px] text-ink outline-none" />
                  <button type="button" className={rowPrimary} onClick={async () => { try { await navigator.clipboard.writeText(payLink); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* select manually */ } }}>{copied ? tr("Copied ✓") : tr("Copy link")}</button>
                  <button type="button" className={`${ghostButton} hover:text-[#a8321d]`} onClick={onRevokeLink}>{tr("Turn off")}</button>
                </div>
              ) : signedIn ? (
                <button type="button" disabled={linkBusy} onClick={onCreateLink} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-leaf hover:underline disabled:opacity-50"><Icon name="link" className="h-3.5 w-3.5" />{linkBusy ? tr("Creating pay link…") : tr("Create pay link — client sees amount + UPI button")}</button>
              ) : (
                <p className="text-[13px] text-muted">{tr("Pay links need a free account.")} <a className="font-medium text-leaf hover:underline" href={"/sign-up/?redirect_url=" + encodeURIComponent("/app/?tab=invoices")}>{tr("Create one")}</a></p>
              )}
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {view.balancePaise > 0 && <button type="button" onClick={onPay} className={rowPrimary}>{tr("Record payment")}</button>}
            {view.balancePaise > 0 && <button type="button" onClick={onRemind} className={rowButton}><Icon name="whatsapp" className="h-3.5 w-3.5 text-[#1da851]" />{tr("Remind")}</button>}
            <button type="button" onClick={onEdit} className={rowButton}>{tr("Edit")}</button>
            <button type="button" onClick={onVoid} className={rowButton}>{invoice.voided ? tr("Restore") : tr("Cancel invoice")}</button>
            {confirmDelete ? (
              <span className={`flex items-center gap-2 text-[13px] font-medium ${dangerText}`}>
                {tr("Delete for good?")}
                <button type="button" onClick={onDelete} className="inline-flex h-8 items-center rounded-[8px] bg-[#a8321d] px-2.5 text-white">{tr("Delete")}</button>
                <button type="button" onClick={() => setConfirmDelete(false)} className={ghostButton}>{tr("Keep")}</button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} className={`${ghostButton} ml-auto hover:text-[#a8321d]`}>{tr("Delete")}</button>
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
    <section className={`${card} p-5`}>
      <h2 className={cardTitle}>{tr("Set up in 20 seconds")}</h2>
      <p className={`mt-0.5 ${cardNote}`}>{tr("Your business name and UPI ID go on payment reminders. Stored only on this device.")}</p>
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
      {error && <p role="alert" className={`mt-2 text-[13px] font-medium ${dangerText}`}>{error}</p>}
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
        {error && <p role="alert" className={`text-[13px] font-medium ${dangerText}`}>{error}</p>}
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="submit" className={`${primaryButton} flex-1`}>{tr("Save")}</button>
          {existing && !hasInvoices && (
            <button type="button" onClick={() => onSave(deleteClient(ws, existing.id, Date.now()), tr("{name} removed.", { name: existing.name }))} className={`${ghostButton} ${dangerText}`}>{tr("Remove client")}</button>
          )}
        </div>
        {existing && hasInvoices && <p className="text-xs text-muted">{tr("Clients with invoices can't be removed — delete their invoices first.")}</p>}
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
    <div className="space-y-4">
      <section className={`${card} p-5`}>
        <h2 className={cardTitle}>{tr("Business details")}</h2>
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
          <p className="text-xs leading-5 text-muted sm:col-span-2">{tr("Registered on Udyam as a micro or small manufacturer or service provider? Add your number to see the MSMED deadline on overdue invoices. We treat your invoice due date as the agreed date, capped at 45 days; without a written agreement the law allows only 15.")}</p>
          <div className="flex items-end sm:col-span-2"><button type="submit" className={primaryButton}>{tr("Save settings")}</button></div>
        </form>
        {error && <p role="alert" className={`mt-2 text-[13px] font-medium ${dangerText}`}>{error}</p>}
      </section>

      <section className={`${card} p-5`}>
        <h2 className={cardTitle}>{tr("Your data")}</h2>
        <p className={`mt-0.5 ${cardNote}`}>{tr("Everything lives in this browser. Clearing site data or switching phones loses it unless you keep a backup.")}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={secondaryButton} onClick={() => downloadText(`proupiqr-backup-${today}.json`, backupJson(ws), "application/json")}>{tr("Download backup")}</button>
          <label className={`${secondaryButton} cursor-pointer`}>
            {tr("Restore backup")}
            <input type="file" accept="application/json,.json" className="sr-only" onChange={restore} />
          </label>
          <button type="button" className={secondaryButton} onClick={() => downloadText(`invoices-${today}.csv`, invoicesCsv(invoiceViews(ws, today)), "text/csv;charset=utf-8")}>{tr("Export all as CSV")}</button>
        </div>
        <div className="mt-5 border-t border-hairline pt-4">
          {confirmErase ? (
            <p className={`flex flex-wrap items-center gap-2 text-sm font-medium ${dangerText}`}>
              {tr("Erase every invoice and client from this browser?")}
              <button type="button" className="inline-flex h-8 items-center rounded-[8px] bg-[#a8321d] px-3 text-[13px] text-white" onClick={() => { onChange(eraseWorkspace(ws, Date.now()), tr("Workspace erased.")); setConfirmErase(false); }}>{tr("Erase")}</button>
              <button type="button" className={ghostButton} onClick={() => setConfirmErase(false)}>{tr("Cancel")}</button>
            </p>
          ) : (
            <button type="button" className="text-[13px] font-medium text-muted hover:text-[#a8321d]" onClick={() => setConfirmErase(true)}>{tr("Erase workspace on this device…")}</button>
          )}
        </div>
      </section>

      <section className="rounded-[12px] border border-dashed border-pebble px-5 py-4">
        <h2 className="text-[13px] font-medium text-charcoal">{tr("Coming next")}</h2>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-[13px] text-muted">
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
  const tone = state.status === "synced" ? "text-[#17603f]" : state.status === "error" || state.status === "too_large" ? "text-[#a8321d]" : "text-charcoal";
  return (
    <button type="button" onClick={onClick} aria-live="polite" className={`hidden h-9 items-center rounded-[10px] bg-white px-3 text-[13px] font-medium ring-1 ring-inset ring-hairline hover:bg-fog sm:inline-flex ${tone}`}>
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
    <section className={`${card} p-5`}>
      <h2 className={cardTitle}>{tr("Sync across devices")}</h2>
      {state.status === "checking" && <p className={`mt-1 ${cardNote}`}>{tr("Checking your account…")}</p>}
      {state.status === "signed_out" && (
        <>
          <p className={`mt-1 ${cardNote}`}>
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
          <p className={`mt-1 ${cardNote}`}>
            {state.status === "synced" && (state.lastSyncedAt
              ? tr("Synced at {time}. Changes upload automatically.", { time: new Date(state.lastSyncedAt).toLocaleTimeString(dateLocale, { hour: "numeric", minute: "2-digit" }) })
              : tr("Synced. Changes upload automatically."))}
            {state.status === "syncing" && tr("Syncing…")}
            {state.status === "offline" && tr("You're offline. Changes are saved here and will sync when you reconnect.")}
            {(state.status === "error" || state.status === "too_large") && tr(state.message)}
          </p>
          {paylinks?.plan && (
            <p className="mt-3 text-[13px] text-charcoal">
              {tr("Pay links: {used} of {limit} active on the {plan} plan.", { used: paylinks.plan.used, limit: paylinks.plan.activePaylinks, plan: paylinks.plan.id === "pro" ? "Pro" : tr("Free") })}
              {paidLinkTokens.length > 0 && <> <button type="button" className="font-medium text-leaf hover:underline" onClick={() => onRevokePaid(paidLinkTokens)}>{tr("Turn off {n} for paid invoices", { n: paidLinkTokens.length })}</button></>}
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" onClick={onSyncNow} className={secondaryButton} disabled={state.status === "syncing"}>{tr("Sync now")}</button>
            <button type="button" onClick={onSignOut} className={secondaryButton}>{tr("Sign out")}</button>
            {confirmDelete ? (
              <span className={`flex flex-wrap items-center gap-2 text-[13px] font-medium ${dangerText}`}>
                {tr("Delete the cloud copy and sign out? This device keeps its data.")}
                <button type="button" onClick={() => { setConfirmDelete(false); onDeleteCloud(); }} className="inline-flex h-8 items-center rounded-[8px] bg-[#a8321d] px-2.5 text-white">{tr("Delete cloud copy")}</button>
                <button type="button" onClick={() => setConfirmDelete(false)} className={ghostButton}>{tr("Keep")}</button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} className={`${ghostButton} hover:text-[#a8321d]`}>{tr("Delete cloud copy…")}</button>
            )}
          </div>
        </>
      )}
      {stash && (
        <div className="mt-4 rounded-[10px] bg-fog p-3 text-[13px] text-charcoal">
          {tr("Data from a different account that was on this device was set aside, not uploaded.")}
          <div className="mt-2 flex gap-3">
            <button type="button" className="font-medium text-leaf hover:underline" onClick={() => downloadText("proupiqr-other-account-backup.json", JSON.stringify({ app: "proupiqr-workspace", workspace: JSON.parse(stash) }, null, 2), "application/json")}>{tr("Download it")}</button>
            <button type="button" className="font-medium text-leaf hover:underline" onClick={() => { try { localStorage.removeItem(STASH_KEY); } catch { /* ignore */ } setStash(null); }}>{tr("Discard")}</button>
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
    <section className={`${card} p-4`} aria-labelledby="getting-started-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="getting-started-title" className={cardTitle}>{tr("Get paid faster in 5 steps")}</h2>
        <div className="flex items-center gap-3">
          <span className="text-[13px] tabular-nums text-muted">{tr("{done} of {total} done", { done: doneCount, total: steps.length })}</span>
          <button type="button" className="text-[13px] font-medium text-muted hover:text-ink" onClick={() => { setDismissed(true); try { localStorage.setItem(CHECKLIST_KEY, "1"); } catch { /* not remembered */ } }}>{tr("Hide this")}</button>
        </div>
      </div>
      <div className="mt-3 flex gap-1" aria-hidden="true">
        {steps.map((step) => <span key={step.id} className={`h-1 flex-1 rounded-full ${step.done ? "bg-[#1f7a52]" : "bg-fog"}`} />)}
      </div>
      <ol className="mt-3 grid gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-2">
        {steps.map((step) => (
          <li key={step.id} className="flex items-center gap-2">
            <span aria-hidden="true" className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${step.done ? "bg-[#1f7a52] text-white" : "ring-1 ring-inset ring-pebble"}`}>{step.done && <Icon name="check" className="h-3 w-3" />}</span>
            {step.done || step.id === "business"
              ? <span className={step.done ? "text-muted line-through decoration-pebble" : "text-ink"}>{step.label}</span>
              : <button type="button" className="text-left font-medium text-leaf hover:underline" onClick={() => onAction(step.id as "invoice" | "remind" | "payment" | "account")}>{step.label}</button>}
          </li>
        ))}
      </ol>
    </section>
  );
}
