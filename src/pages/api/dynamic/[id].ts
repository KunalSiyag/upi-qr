import type { APIRoute } from "astro";
import { metrics, readRecord, recordScan, safeDestination, updateRecord, validId } from "../../../../src/lib/dynamicQrStore";

export const prerender = false;

export const GET: APIRoute = async ({ request, url, params }) => {
  const id = params.id;
  if (!validId(id)) return new Response(JSON.stringify({ error: "Invalid campaign ID." }), { status: 400 });
  
  try {
    const campaign = await readRecord(id);
    if (!campaign) return new Response(JSON.stringify({ error: "Campaign not found." }), { status: 404 });
    
    const mode = url.searchParams.get("mode");
    if (mode === "stats") return new Response(JSON.stringify(await metrics(id)), { status: 200 });
    if (mode === "details") return new Response(JSON.stringify({ campaign: { ...campaign, manageToken: undefined }, ...(await metrics(id)) }), { status: 200 });
    
    if (campaign.isPaused) return new Response(JSON.stringify({ error: "Campaign is paused." }), { status: 410 });
    
    const userAgent = request.headers.get("user-agent") || "";
    const device = /Android|iPhone|iPad|iPod|IEMobile/i.test(userAgent) ? "mobile" : "desktop";
    const counts = await recordScan(id, device);
    
    return new Response(JSON.stringify({ destinationUrl: campaign.destinationUrl, title: campaign.title, ...counts }), { status: 200 });
  } catch {
    return new Response(JSON.stringify({ error: "Dynamic QR service is unavailable." }), { status: 503 });
  }
};

export const PATCH: APIRoute = async ({ request, params }) => {
  const id = params.id;
  if (!validId(id)) return new Response(JSON.stringify({ error: "Invalid campaign ID." }), { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "JSON body required." }), { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return new Response(JSON.stringify({ error: "JSON body required." }), { status: 400 });
  }

  if (typeof body.manageToken !== "string") {
    return new Response(JSON.stringify({ error: "Campaign management token required." }), { status: 401 });
  }

  if (body.destinationUrl !== undefined && !safeDestination(body.destinationUrl as string)) {
    return new Response(JSON.stringify({ error: "Invalid destination URL." }), { status: 400 });
  }

  try {
    const campaign = await updateRecord(id, body.manageToken, body);
    if (!campaign) return new Response(JSON.stringify({ error: "Invalid campaign management token." }), { status: 401 });
    return new Response(JSON.stringify({ campaign }), { status: 200 });
  } catch {
    return new Response(JSON.stringify({ error: "Dynamic QR service is unavailable." }), { status: 503 });
  }
};
