import { kv } from "@vercel/kv";
import { istDay, lastDays, metricKey, METRICS, type MetricName } from "./metricsCore.ts";

const RETENTION_SECONDS = 400 * 24 * 60 * 60;
const hasKv = () => Boolean(import.meta.env.KV_REST_API_URL || process.env.KV_REST_API_URL);

/** Fire-and-forget daily counter. Never throws and never blocks a user request on failure. */
export async function recordMetric(name: MetricName, by = 1, now = Date.now()): Promise<void> {
  if (!hasKv() || by <= 0) return;
  try {
    const key = metricKey(name, istDay(now));
    const pipe = kv.pipeline();
    pipe.incrby(key, by);
    pipe.expire(key, RETENTION_SECONDS);
    await pipe.exec();
  } catch {
    // Metrics are best-effort.
  }
}

export async function readMetricValues(days: string[]): Promise<Record<string, number>> {
  const keys = METRICS.flatMap((name) => days.map((day) => metricKey(name, day)));
  const values = await kv.mget<(string | number | null)[]>(...keys);
  return Object.fromEntries(keys.map((key, i) => [key, Number(values[i] ?? 0) || 0]));
}

export { lastDays };
