import assert from "node:assert/strict";
import { funnelSteps, istDay, lastDays, metricKey, METRIC_LABELS, metricRows, METRICS, parseAdminIds } from "../src/lib/metricsCore.ts";

// 2026-10-10 20:00 UTC is already 11 Oct in India.
const now = Date.UTC(2026, 9, 10, 20, 0, 0);
assert.equal(istDay(now), "2026-10-11");
assert.deepEqual(lastDays(3, now), ["2026-10-09", "2026-10-10", "2026-10-11"]);
assert.equal(lastDays(30, now).length, 30);
assert.equal(lastDays(30, now).at(-1), "2026-10-11");

const days = lastDays(14, now);
const values = {};
days.forEach((day, i) => { values[metricKey("paylink_created", day)] = i < 7 ? 2 : 3; });
values[metricKey("pro_activated", days.at(-1))] = 1;
const rows = metricRows(days, values);
assert.equal(rows.length, METRICS.length);
const pay = rows.find((r) => r.name === "paylink_created");
assert.deepEqual([pay.previous7, pay.last7, pay.total, pay.change], [14, 21, 35, 50]);
const pro = rows.find((r) => r.name === "pro_activated");
assert.deepEqual([pro.last7, pro.change], [1, null], "no baseline → no percentage");
assert.ok(rows.every((r) => r.series.length === 14));

assert.ok(METRICS.every((name) => typeof METRIC_LABELS[name] === "string" && METRIC_LABELS[name].length > 0), "every metric has a label");

// Free → paid funnel: totals per step, the Pro-intent step sums checkout starts and early access.
const fvalues = {};
const put = (name, n) => { fvalues[metricKey(name, days.at(-1))] = n; };
put("tool_output", 2000); put("tracker_opened", 150); put("workspace_created", 30); put("checkout_started", 4); put("pro_interest", 2); put("pro_activated", 3);
const funnel = funnelSteps(metricRows(days, fvalues));
assert.deepEqual(funnel.map((s) => s.value), [2000, 150, 30, 6, 3]);
assert.deepEqual(funnel.map((s) => s.rate), [null, 7.5, 20, 20, 50]);
assert.deepEqual(funnelSteps(metricRows(days, {})).map((s) => s.rate), [null, null, null, null, null], "no division by zero on an empty funnel");

assert.deepEqual([...parseAdminIds(" user_2abcDEF123 , bad id, user_zz9988776655 ,")], ["user_2abcDEF123", "user_zz9988776655"]);
assert.equal(parseAdminIds(undefined).size, 0);
assert.equal(parseAdminIds("*").size, 0, "no wildcard admins");

console.log("[metrics] India-day keys, trailing windows, week-over-week change, funnel rates, and admin allowlist parsing passed");
