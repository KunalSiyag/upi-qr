/**
 * Founder metrics — pure helpers. Counters are aggregates per India day
 * (metrics:<name>:<YYYY-MM-DD>); no user data is ever stored with them.
 */
export const METRICS = [
  "tool_output",
  "tracker_opened",
  "waitlist_join",
  "pro_interest",
  "workspace_created",
  "sync",
  "paylink_created",
  "claim_submitted",
  "checkout_started",
  "pro_activated",
  "pro_cancelled",
  "push_enabled",
  "digest_sent",
  "webhook_rejected",
  "billing_reconciled",
  "mcp_tool_call",
  "business_added",
  "business_limit",
] as const;
export type MetricName = (typeof METRICS)[number];

export const METRIC_LABELS: Record<MetricName, string> = {
  tool_output: "Visits that downloaded, shared or copied from a free tool",
  tracker_opened: "Visits that opened the payment tracker from a free tool",
  waitlist_join: "Early-access sign-ups",
  pro_interest: "Pro early-access sign-ups (wanted Pro before checkout opened)",
  workspace_created: "New synced accounts",
  sync: "Sync pushes",
  paylink_created: "Pay links created",
  claim_submitted: "Payer “I've paid” claims",
  checkout_started: "Pro checkouts started",
  pro_activated: "Pro activations",
  pro_cancelled: "Pro cancellations",
  push_enabled: "Devices with morning reminders",
  digest_sent: "Morning digests delivered",
  webhook_rejected: "Billing webhooks rejected (bad signature — check DODO_PAYMENTS_WEBHOOK_KEY / RAZORPAY_WEBHOOK_SECRET)",
  billing_reconciled: "Billing records fixed by re-reading the payment provider (lost webhooks)",
  mcp_tool_call: "Tool calls from AI assistants (Claude connector at /mcp/)",
  business_added: "Businesses added beyond the first",
  business_limit: "Add-business attempts blocked by the plan",
};

export const metricKey = (name: MetricName, day: string) => `metrics:${name}:${day}`;

export function istDay(now: number): string {
  return new Date(now + 330 * 60_000).toISOString().slice(0, 10);
}

/** Oldest first, ending today (India time). */
export function lastDays(count: number, now: number): string[] {
  const today = Date.parse(`${istDay(now)}T00:00:00Z`);
  return Array.from({ length: count }, (_, i) => new Date(today - (count - 1 - i) * 86_400_000).toISOString().slice(0, 10));
}

export interface MetricRow {
  name: MetricName;
  label: string;
  series: number[];
  last7: number;
  previous7: number;
  total: number;
  /** Percent change of last 7 days vs the 7 before; null when there is no baseline. */
  change: number | null;
}

export function metricRows(days: string[], values: Record<string, number>): MetricRow[] {
  return METRICS.map((name) => {
    const series = days.map((day) => values[metricKey(name, day)] ?? 0);
    const last7 = series.slice(-7).reduce((a, b) => a + b, 0);
    const previous7 = series.slice(-14, -7).reduce((a, b) => a + b, 0);
    return {
      name,
      label: METRIC_LABELS[name],
      series,
      last7,
      previous7,
      total: series.reduce((a, b) => a + b, 0),
      change: previous7 > 0 ? Math.round(((last7 - previous7) / previous7) * 100) : null,
    };
  });
}

export interface FunnelStep {
  label: string;
  /** Total over the rows' window. */
  value: number;
  /** Percent of the previous step (one decimal); null for the first step or an empty previous step. */
  rate: number | null;
}

/** Free tool → tracker → account → wants Pro → Pro, as totals over the rows' window. */
export const FUNNEL: { label: string; metrics: MetricName[] }[] = [
  { label: "Used a free tool (download, share or copy)", metrics: ["tool_output"] },
  { label: "Opened the payment tracker from a tool", metrics: ["tracker_opened"] },
  { label: "Created a free account (first sync)", metrics: ["workspace_created"] },
  { label: "Asked for Pro (checkout started or early access)", metrics: ["checkout_started", "pro_interest"] },
  { label: "Became Pro", metrics: ["pro_activated"] },
];

export function funnelSteps(rows: MetricRow[]): FunnelStep[] {
  const total = (name: MetricName) => rows.find((r) => r.name === name)?.total ?? 0;
  let previous: number | null = null;
  return FUNNEL.map((step) => {
    const value = step.metrics.reduce((sum, name) => sum + total(name), 0);
    const rate = previous === null || previous === 0 ? null : Math.round((value / previous) * 1000) / 10;
    previous = value;
    return { label: step.label, value, rate };
  });
}

/** ADMIN_USER_IDS="user_abc,user_def" → set of Clerk user ids allowed to see /admin/. */
export function parseAdminIds(value: string | undefined): Set<string> {
  return new Set((value ?? "").split(",").map((v) => v.trim()).filter((v) => /^user_[A-Za-z0-9]{6,64}$/.test(v)));
}
