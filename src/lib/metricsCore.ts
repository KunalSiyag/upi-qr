/**
 * Founder metrics — pure helpers. Counters are aggregates per India day
 * (metrics:<name>:<YYYY-MM-DD>); no user data is ever stored with them.
 */
export const METRICS = [
  "waitlist_join",
  "workspace_created",
  "sync",
  "paylink_created",
  "claim_submitted",
  "pro_activated",
  "pro_cancelled",
  "push_enabled",
  "digest_sent",
] as const;
export type MetricName = (typeof METRICS)[number];

export const METRIC_LABELS: Record<MetricName, string> = {
  waitlist_join: "Early-access sign-ups",
  workspace_created: "New synced accounts",
  sync: "Sync pushes",
  paylink_created: "Pay links created",
  claim_submitted: "Payer “I've paid” claims",
  pro_activated: "Pro activations",
  pro_cancelled: "Pro cancellations",
  push_enabled: "Devices with morning reminders",
  digest_sent: "Morning digests delivered",
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

/** ADMIN_USER_IDS="user_abc,user_def" → set of Clerk user ids allowed to see /admin/. */
export function parseAdminIds(value: string | undefined): Set<string> {
  return new Set((value ?? "").split(",").map((v) => v.trim()).filter((v) => /^user_[A-Za-z0-9]{6,64}$/.test(v)));
}
