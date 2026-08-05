import { randomBytes } from "node:crypto";

export interface DynamicQrRecord {
  id: string;
  manageToken: string;
  title: string;
  destinationUrl: string;
  createdAt: string;
  category?: string;
  expiryDate?: string;
  isPaused?: boolean;
}

const PREFIX = "pro-upi-qr:dynamic:";

export function safeDestination(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const destinationUrl = value.trim();
  return /^(https:\/\/|upi:\/\/pay\?)/i.test(destinationUrl) ? destinationUrl : null;
}

export function validId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9]{6,32}$/i.test(value);
}

function metaKey(id: string) { return `${PREFIX}${id}:meta`; }
function countKey(id: string) { return `${PREFIX}${id}:count`; }
function mobileKey(id: string) { return `${PREFIX}${id}:mobile`; }
function desktopKey(id: string) { return `${PREFIX}${id}:desktop`; }

async function command(commands: string[][]): Promise<unknown[]> {
  const baseUrl = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!baseUrl || !token) throw new Error("Vercel KV is not configured");
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
  });
  if (!response.ok) throw new Error("Vercel KV request failed");
  return ((await response.json()) as Array<{ result?: unknown }>).map((item) => item.result);
}

export async function readRecord(id: string): Promise<DynamicQrRecord | null> {
  const [result] = await command([["GET", metaKey(id)]]);
  if (typeof result !== "string") return null;
  try { return JSON.parse(result) as DynamicQrRecord; } catch { return null; }
}

export async function createRecord(input: Omit<DynamicQrRecord, "manageToken" | "createdAt">): Promise<DynamicQrRecord> {
  const record: DynamicQrRecord = {
    ...input,
    manageToken: randomBytes(24).toString("hex"),
    createdAt: new Date().toISOString(),
  };
  const existing = await readRecord(record.id);
  if (existing) throw new Error("Campaign ID already exists");
  await command([["SET", metaKey(record.id), JSON.stringify(record)]]);
  return record;
}

export async function updateRecord(id: string, manageToken: string, changes: Partial<DynamicQrRecord>): Promise<DynamicQrRecord | null> {
  const existing = await readRecord(id);
  if (!existing || existing.manageToken !== manageToken) return null;
  const destinationUrl = changes.destinationUrl === undefined ? existing.destinationUrl : safeDestination(changes.destinationUrl);
  if (!destinationUrl) throw new Error("Invalid destination URL");
  const record: DynamicQrRecord = {
    ...existing,
    destinationUrl,
    title: typeof changes.title === "string" ? changes.title.slice(0, 120) : existing.title,
    category: typeof changes.category === "string" ? changes.category.slice(0, 32) : existing.category,
    expiryDate: typeof changes.expiryDate === "string" ? changes.expiryDate.slice(0, 32) : existing.expiryDate,
    isPaused: typeof changes.isPaused === "boolean" ? changes.isPaused : existing.isPaused,
  };
  await command([["SET", metaKey(id), JSON.stringify(record)]]);
  return record;
}

export async function metrics(id: string) {
  const [scans, mobileScans, desktopScans] = await command([["GET", countKey(id)], ["GET", mobileKey(id)], ["GET", desktopKey(id)]]);
  return { scans: Number(scans || 0), mobileScans: Number(mobileScans || 0), desktopScans: Number(desktopScans || 0) };
}

export async function recordScan(id: string, device: "mobile" | "desktop") {
  await command([["INCR", countKey(id)], ["INCR", device === "mobile" ? mobileKey(id) : desktopKey(id)]]);
  return metrics(id);
}
