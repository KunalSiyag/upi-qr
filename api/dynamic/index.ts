import { createRecord, safeDestination, validId } from "../../src/lib/dynamicQrStore";

type Req = { method?: string; body?: unknown };
type Res = { status: (code: number) => Res; json: (value: unknown) => void };

export default async function handler(req: Req, res: Res): Promise<void> {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  if (!body || typeof body !== "object") return res.status(400).json({ error: "JSON body required." });
  const input = body as Record<string, unknown>;
  if (!validId(input.id)) return res.status(400).json({ error: "Invalid campaign ID." });
  const destinationUrl = safeDestination(input.destinationUrl);
  if (!destinationUrl) return res.status(400).json({ error: "Use an https:// URL or a upi://pay link." });
  try {
    const record = await createRecord({
      id: input.id,
      title: typeof input.title === "string" ? input.title.slice(0, 120) : "Dynamic QR Campaign",
      destinationUrl,
      category: typeof input.category === "string" ? input.category.slice(0, 32) : undefined,
      expiryDate: typeof input.expiryDate === "string" ? input.expiryDate.slice(0, 32) : undefined,
      isPaused: false,
    });
    res.status(201).json({ campaign: record });
  } catch (error) {
    res.status(String(error).includes("already exists") ? 409 : 503).json({ error: "Could not create dynamic QR campaign." });
  }
}
