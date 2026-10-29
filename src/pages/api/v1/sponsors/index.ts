import type { APIRoute } from "astro";
import { jsonResponse } from "../../../../lib/apiSecurity";
import { sponsorBillingConfig } from "../../../../lib/billing/config";
import { publicSponsors } from "../../../../lib/sponsors/core";
import { sponsorStore } from "../../../../lib/sponsors/kvStore";

export const prerender = false;

/**
 * Who is sponsoring right now, for the homepages and /sponsor/: names, lines, tagged links and our logo URLs only
 * (never emails or payment ids). The same for every visitor, so the edge may cache it for a minute.
 */
export const GET: APIRoute = async () => {
  try {
    const view = publicSponsors(await sponsorStore().all(), Date.now());
    return jsonResponse({ ...view, open: sponsorBillingConfig() !== null }, 200, {
      // Browsers always ask again (stale-while-revalidate would let them show an old list); Vercel's edge keeps it a minute.
      "Cache-Control": "public, max-age=0, must-revalidate",
      "CDN-Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    });
  } catch {
    return jsonResponse({ error: "Sponsors are unavailable right now." }, 503);
  }
};
