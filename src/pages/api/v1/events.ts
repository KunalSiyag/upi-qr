import type { APIRoute } from "astro";
import { isTrustedMutation, jsonResponse, readJsonObject, requestFingerprint, RequestBodyError } from "../../../lib/apiSecurity";
import { consumeRateLimit } from "../../../lib/rateLimit";
import { recordMetric } from "../../../lib/metrics";
import type { MetricName } from "../../../lib/metricsCore";
import { rateLimitsAvailable } from "../../../lib/workspace/kvCloudStore";

export const prerender = false;

/**
 * Funnel steps that happen in the browser (a free tool's download/share/copy, opening the
 * payment tracker from a tool). Each browser session reports a step once; the server only
 * adds 1 to that day's aggregate counter. No identifiers are stored.
 */
const CLIENT_STEPS: ReadonlySet<string> = new Set<MetricName>(["tool_output", "tracker_opened"]);

const done = () => new Response(null, { status: 204 });

export const POST: APIRoute = async ({ request }) => {
  if (!isTrustedMutation(request)) return jsonResponse({ error: "Cross-site request rejected." }, 403);
  let body: Record<string, unknown>;
  try {
    body = await readJsonObject(request, 256);
  } catch (error) {
    if (error instanceof RequestBodyError) return jsonResponse({ error: error.message }, error.status);
    return jsonResponse({ error: "JSON body required." }, 400);
  }
  if (typeof body.step !== "string" || !CLIENT_STEPS.has(body.step)) return jsonResponse({ error: "Unknown step." }, 400);
  try {
    if (rateLimitsAvailable()) {
      // Bounds what one visitor can add; over the limit the step is quietly dropped.
      const rate = await consumeRateLimit("funnel-step", requestFingerprint(request), 30, 3600);
      if (!rate.allowed) return done();
    }
    await recordMetric(body.step as MetricName);
  } catch {
    // Counting is best-effort and must never surface an error to a tool.
  }
  return done();
};
