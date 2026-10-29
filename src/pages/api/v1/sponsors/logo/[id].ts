import type { APIRoute } from "astro";
import { BOOKING_ID, logoPublic } from "../../../../../lib/sponsors/core";
import { sponsorStore } from "../../../../../lib/sponsors/kvStore";

export const prerender = false;

const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

/** A paid booking's logo, from our own origin (no sponsor host is ever contacted by a visitor's browser). */
export const GET: APIRoute = async ({ params }) => {
  const id = params.id ?? "";
  if (!BOOKING_ID.test(id)) return notFound();
  try {
    const store = sponsorStore();
    const booking = await store.get(id);
    if (!booking || !logoPublic(booking)) return notFound();
    const logo = await store.getLogo(id);
    if (!logo) return notFound();
    return new Response(new Uint8Array(logo.bytes), {
      headers: {
        "Content-Type": logo.type,
        // A booking's logo never changes (new copy means a new booking), so browsers may keep it.
        "Cache-Control": "public, max-age=86400, s-maxage=3600",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Content-Disposition": "inline",
      },
    });
  } catch {
    return new Response("Unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
};
