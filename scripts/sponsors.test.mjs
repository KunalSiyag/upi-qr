// Sponsor slots (src/data/sponsors.ts): booking dates in IST, language targeting, UTM tagging, and data hygiene.
import assert from "node:assert/strict";
import { activeSponsor, PLACEMENTS, SPONSOR_REACH, SPONSORS, sponsorHref } from "../src/data/sponsors.ts";

const sample = {
  id: "acme", name: "Acme Soundbox", tagline: "Payment alerts for every counter.", href: "https://acme.example/soundbox?ref=x",
  placements: ["home-hero"], start: "2026-11-01", end: "2026-11-07", langs: ["en", "hi"],
};
SPONSORS.push(sample);
// 31 Oct 18:29 UTC is still 31 Oct in India; 18:30 UTC is 1 Nov 00:00 IST.
assert.equal(activeSponsor("home-hero", "en", new Date("2026-10-31T18:29:00Z")), undefined);
assert.equal(activeSponsor("home-hero", "en", new Date("2026-10-31T18:30:00Z"))?.id, "acme");
assert.equal(activeSponsor("home-hero", "hi", new Date("2026-11-07T18:29:00Z"))?.id, "acme", "the end day is included");
assert.equal(activeSponsor("home-hero", "en", new Date("2026-11-07T18:30:00Z")), undefined);
assert.equal(activeSponsor("home-hero", "ta", new Date("2026-11-03T06:00:00Z")), undefined, "not booked for Tamil");
assert.equal(sponsorHref(sample, "home-hero"), "https://acme.example/soundbox?ref=x&utm_source=proupiqr&utm_medium=sponsor&utm_campaign=home-hero");
assert.throws(() => sponsorHref({ ...sample, href: "http://acme.example/" }, "home-hero"));
SPONSORS.pop();

// Real bookings: valid, https, dated, short copy, no overlap within a placement and language.
const iso = /^\d{4}-\d{2}-\d{2}$/;
for (const s of SPONSORS) {
  assert.ok(/^[a-z0-9-]+$/.test(s.id), `${s.id}: id`);
  assert.ok(iso.test(s.start) && iso.test(s.end) && s.start <= s.end, `${s.id}: dates`);
  assert.ok(s.tagline.length <= 90, `${s.id}: tagline under 90 characters`);
  assert.ok(s.placements.every((p) => p in PLACEMENTS), `${s.id}: placement`);
  assert.doesNotThrow(() => sponsorHref(s, s.placements[0]), `${s.id}: https link`);
  if (s.logo) assert.ok(s.logo.startsWith("/images/sponsors/"), `${s.id}: logo hosted by us`);
  for (const o of SPONSORS) {
    if (o === s || !o.placements.some((p) => s.placements.includes(p))) continue;
    const langsOverlap = !s.langs || !o.langs || s.langs.some((l) => o.langs.includes(l));
    assert.ok(!(langsOverlap && s.start <= o.end && o.start <= s.end), `${s.id} overlaps ${o.id}`);
  }
}
assert.ok(SPONSOR_REACH.weeklyClicks > 0 && SPONSOR_REACH.weeklyImpressions > SPONSOR_REACH.weeklyClicks && SPONSOR_REACH.period);
console.log("sponsors: all checks passed");
