import { metrics, readRecord, recordScan, safeDestination, updateRecord, validId } from "../../src/lib/dynamicQrStore";

type Req = { method?: string; query: { id?: string | string[]; mode?: string | string[] }; body?: unknown; headers: Record<string, string | string[] | undefined> };
type Res = { status: (code: number) => Res; json: (value: unknown) => void };
const value = (input: string | string[] | undefined) => Array.isArray(input) ? input[0] : input;

export default async function handler(req: Req, res: Res): Promise<void> {
  const id = value(req.query.id);
  if (!validId(id)) return res.status(400).json({ error: "Invalid campaign ID." });
  try {
    if (req.method === "GET") {
      const campaign = await readRecord(id);
      if (!campaign) return res.status(404).json({ error: "Campaign not found." });
      const mode = value(req.query.mode);
      if (mode === "stats") return res.status(200).json(await metrics(id));
      if (mode === "details") return res.status(200).json({ campaign: { ...campaign, manageToken: undefined }, ...(await metrics(id)) });
      if (campaign.isPaused) return res.status(410).json({ error: "Campaign is paused." });
      const device = /Android|iPhone|iPad|iPod|IEMobile/i.test(value(req.headers["user-agent"]) || "") ? "mobile" : "desktop";
      const counts = await recordScan(id, device);
      return res.status(200).json({ destinationUrl: campaign.destinationUrl, title: campaign.title, ...counts });
    }
    if (req.method === "PATCH") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      if (!body || typeof body !== "object") return res.status(400).json({ error: "JSON body required." });
      const input = body as Record<string, unknown>;
      if (typeof input.manageToken !== "string") return res.status(401).json({ error: "Campaign management token required." });
      if (input.destinationUrl !== undefined && !safeDestination(input.destinationUrl)) return res.status(400).json({ error: "Invalid destination URL." });
      const campaign = await updateRecord(id, input.manageToken, input);
      if (!campaign) return res.status(401).json({ error: "Invalid campaign management token." });
      return res.status(200).json({ campaign });
    }
    return res.status(405).json({ error: "Method not allowed." });
  } catch {
    return res.status(503).json({ error: "Dynamic QR service is unavailable." });
  }
}
