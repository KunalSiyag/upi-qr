import assert from "node:assert/strict";
import { istDay, lastDays, metricKey, metricRows, METRICS, parseAdminIds } from "../src/lib/metricsCore.ts";

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

assert.deepEqual([...parseAdminIds(" user_2abcDEF123 , bad id, user_zz9988776655 ,")], ["user_2abcDEF123", "user_zz9988776655"]);
assert.equal(parseAdminIds(undefined).size, 0);
assert.equal(parseAdminIds("*").size, 0, "no wildcard admins");

console.log("[metrics] India-day keys, trailing windows, week-over-week change, and admin allowlist parsing passed");
