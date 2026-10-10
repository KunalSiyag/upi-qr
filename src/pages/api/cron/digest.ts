import type { APIRoute } from "astro";
import { timingSafeEqual } from "node:crypto";
import { jsonResponse } from "../../../lib/apiSecurity";
import { allowLocalPushEndpoints, cronSecret, vapidConfig } from "../../../lib/push/config";
import { runMorningDigest } from "../../../lib/push/digestRunner";
import { pushStore } from "../../../lib/push/kvPushStore";
import { cloudStore, projectionStore } from "../../../lib/workspace/kvCloudStore";
import { recordMetric } from "../../../lib/metrics";

export const prerender = false;

function authorized(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header ?? "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Vercel Cron (09:00 IST daily, see vercel.json). Vercel sends Authorization: Bearer $CRON_SECRET. */
export const GET: APIRoute = async ({ request }) => {
  const secret = cronSecret();
  if (!secret) return jsonResponse({ error: "CRON_SECRET is not configured." }, 503);
  if (!authorized(request.headers.get("authorization"), secret)) return jsonResponse({ error: "Unauthorized." }, 401);
  const vapid = vapidConfig();
  if (!vapid) return jsonResponse({ skipped: "VAPID keys are not configured." });
  const now = Date.now();
  const today = new Date(now + 330 * 60_000).toISOString().slice(0, 10); // India date
  try {
    // 50 s budget keeps us inside a 60 s function limit; leftovers are reported in `remaining`.
    const result = await runMorningDigest({
      push: pushStore(), cloud: cloudStore(), projections: projectionStore(), vapid, today, now,
      allowLocalEndpoints: allowLocalPushEndpoints(), deadline: now + 50_000,
      // Push services answer in ~100–300 ms; 40 in flight ≈ 250 accounts/s, ~12k accounts per run.
      concurrency: 40,
    });
    await recordMetric("digest_sent", result.sent, now);
    return jsonResponse({ today, ...result });
  } catch {
    return jsonResponse({ error: "Digest run failed." }, 500);
  }
};
