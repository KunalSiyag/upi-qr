import type { APIRoute } from "astro";
import { createRecord, safeDestination, validId } from "../../../lib/dynamicQrStore";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "JSON body required." }), { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return new Response(JSON.stringify({ error: "JSON body required." }), { status: 400 });
  }

  if (!validId(body.id as string)) {
    return new Response(JSON.stringify({ error: "Invalid campaign ID." }), { status: 400 });
  }

  const destinationUrl = safeDestination(body.destinationUrl as string);
  if (!destinationUrl) {
    return new Response(JSON.stringify({ error: "Use an https:// URL or a upi://pay link." }), { status: 400 });
  }

  try {
    const record = await createRecord({
      id: body.id as string,
      title: typeof body.title === "string" ? body.title.slice(0, 120) : "Dynamic QR Campaign",
      destinationUrl,
      category: typeof body.category === "string" ? body.category.slice(0, 32) : undefined,
      expiryDate: typeof body.expiryDate === "string" ? body.expiryDate.slice(0, 32) : undefined,
      isPaused: false,
    });
    return new Response(JSON.stringify({ campaign: record }), { status: 201 });
  } catch (error) {
    const isConflict = String(error).includes("already exists");
    return new Response(JSON.stringify({ error: "Could not create dynamic QR campaign." }), { status: isConflict ? 409 : 503 });
  }
};
