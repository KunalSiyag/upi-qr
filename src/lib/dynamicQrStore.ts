import { createHash, randomBytes } from "node:crypto";
import { safeDynamicDestination } from "./apiSecurity";

export type DynamicQrCategory = "payment" | "menu" | "social" | "store" | "event" | "other";

export interface DynamicQrRecord {
  id: string;
  ownerId?: string;
  manageToken?: string; // Legacy anonymous campaigns can be claimed once.
  title: string;
  destinationUrl: string;
  createdAt: string;
  category?: DynamicQrCategory;
  expiryDate?: string;
  isPaused?: boolean;
  version?: number;
}

export interface CreateDynamicQrInput {
  title: string;
  destinationUrl: string;
  category?: DynamicQrCategory;
  expiryDate?: string;
}

export interface UpdateDynamicQrInput {
  destinationUrl?: string;
  title?: string;
  category?: DynamicQrCategory;
  expiryDate?: string | null;
  isPaused?: boolean;
}

const PREFIX = "pro-upi-qr:dynamic:";

export function safeDestination(value: unknown): string | null {
  return safeDynamicDestination(value);
}

export function validId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9]{6,32}$/i.test(value);
}

function metaKey(id: string) { return `${PREFIX}${id}:meta`; }
function countKey(id: string) { return `${PREFIX}${id}:count`; }
function mobileKey(id: string) { return `${PREFIX}${id}:mobile`; }
function desktopKey(id: string) { return `${PREFIX}${id}:desktop`; }
export function ownerCacheId(ownerId: string): string {
  const digest = createHash("sha256").update(ownerId).digest("hex").slice(0, 32);
  return digest;
}
function ownerKey(ownerId: string) {
  return `${PREFIX}owner:${ownerCacheId(ownerId)}`;
}

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
  const data = (await response.json()) as Array<{ result?: unknown; error?: string }>;
  const failed = data.find((item) => item.error);
  if (failed?.error) throw new Error(failed.error);
  return data.map((item) => item.result);
}

export async function readRecord(id: string): Promise<DynamicQrRecord | null> {
  const [result] = await command([["GET", metaKey(id)]]);
  if (typeof result !== "string") return null;
  try { return JSON.parse(result) as DynamicQrRecord; } catch { return null; }
}

export function publicRecord(record: DynamicQrRecord): Omit<DynamicQrRecord, "ownerId" | "manageToken"> {
  const { ownerId: _ownerId, manageToken: _manageToken, ...publicFields } = record;
  return publicFields;
}

export function isExpired(record: DynamicQrRecord): boolean {
  if (!record.expiryDate) return false;
  const expiry = new Date(`${record.expiryDate}T23:59:59.999Z`);
  return !Number.isNaN(expiry.valueOf()) && expiry.valueOf() < Date.now();
}

export class CampaignLimitError extends Error {}

export async function createRecord(ownerId: string, input: CreateDynamicQrInput, maxRecords = 100): Promise<DynamicQrRecord> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const record: DynamicQrRecord = {
      ...input,
      id: randomBytes(10).toString("hex"),
      ownerId,
      isPaused: false,
      version: 1,
      createdAt: new Date().toISOString(),
    };
    const script = `
      if redis.call('SCARD', KEYS[2]) >= tonumber(ARGV[3]) then return -1 end
      if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
      redis.call('SET', KEYS[1], ARGV[1])
      redis.call('SADD', KEYS[2], ARGV[2])
      return 1
    `;
    const [created] = await command([[
      "EVAL", script, "2", metaKey(record.id), ownerKey(ownerId), JSON.stringify(record), record.id, String(maxRecords),
    ]]);
    if (Number(created) === -1) throw new CampaignLimitError("Account campaign limit reached");
    if (Number(created) === 1) return record;
  }
  throw new Error("Unable to allocate campaign ID");
}

export async function updateRecord(
  id: string,
  ownerId: string,
  legacyManageToken: string | undefined,
  changes: UpdateDynamicQrInput,
  maxRecords = 100,
): Promise<DynamicQrRecord | null> {
  if (changes.destinationUrl !== undefined && !safeDestination(changes.destinationUrl)) {
    throw new Error("Invalid destination URL");
  }
  const script = `
    local raw = redis.call('GET', KEYS[1])
    if not raw then return nil end
    local record = cjson.decode(raw)
    if record.ownerId then
      if record.ownerId ~= ARGV[1] then return nil end
    else
      if not record.manageToken or record.manageToken ~= ARGV[2] then return nil end
      if redis.call('SCARD', KEYS[2]) >= tonumber(ARGV[5]) then return '__LIMIT__' end
    end
    local changes = cjson.decode(ARGV[3])
    record.ownerId = ARGV[1]
    record.manageToken = nil
    if changes.destinationUrl then record.destinationUrl = changes.destinationUrl end
    if changes.title then record.title = changes.title end
    if changes.category then record.category = changes.category end
    if changes.expiryDate == cjson.null then
      record.expiryDate = nil
    elseif changes.expiryDate then
      record.expiryDate = changes.expiryDate
    end
    if changes.isPaused ~= nil then record.isPaused = changes.isPaused end
    record.version = (record.version or 0) + 1
    local encoded = cjson.encode(record)
    redis.call('SET', KEYS[1], encoded)
    redis.call('SADD', KEYS[2], ARGV[4])
    return encoded
  `;
  const [updated] = await command([[
    "EVAL",
    script,
    "2",
    metaKey(id),
    ownerKey(ownerId),
    ownerId,
    legacyManageToken || "",
    JSON.stringify(changes),
    id,
    String(maxRecords),
  ]]);
  if (updated === "__LIMIT__") throw new CampaignLimitError("Account campaign limit reached");
  if (typeof updated !== "string") return null;
  try { return JSON.parse(updated) as DynamicQrRecord; } catch { return null; }
}

export async function listRecords(ownerId: string): Promise<DynamicQrRecord[]> {
  const [rawIds] = await command([["SMEMBERS", ownerKey(ownerId)]]);
  if (!Array.isArray(rawIds) || rawIds.length === 0) return [];
  const ids = rawIds.filter((id): id is string => typeof id === "string" && validId(id)).slice(0, 100);
  const records = await command(ids.map((id) => ["GET", metaKey(id)]));
  return records.flatMap((raw) => {
    if (typeof raw !== "string") return [];
    try {
      const record = JSON.parse(raw) as DynamicQrRecord;
      return record.ownerId === ownerId ? [record] : [];
    } catch {
      return [];
    }
  });
}

export async function deleteRecord(id: string, ownerId: string, legacyManageToken?: string): Promise<boolean> {
  const script = `
    local raw = redis.call('GET', KEYS[1])
    if not raw then return 0 end
    local record = cjson.decode(raw)
    if record.ownerId then
      if record.ownerId ~= ARGV[1] then return 0 end
    else
      if not record.manageToken or record.manageToken ~= ARGV[2] then return 0 end
    end
    redis.call('DEL', KEYS[1], KEYS[2], KEYS[3], KEYS[4])
    redis.call('SREM', KEYS[5], ARGV[3])
    return 1
  `;
  const [deleted] = await command([[
    "EVAL",
    script,
    "5",
    metaKey(id),
    countKey(id),
    mobileKey(id),
    desktopKey(id),
    ownerKey(ownerId),
    ownerId,
    legacyManageToken || "",
    id,
  ]]);
  return Number(deleted) === 1;
}

export async function metrics(id: string) {
  const [scans, mobileScans, desktopScans] = await command([["GET", countKey(id)], ["GET", mobileKey(id)], ["GET", desktopKey(id)]]);
  return { scans: Number(scans || 0), mobileScans: Number(mobileScans || 0), desktopScans: Number(desktopScans || 0) };
}

export async function metricsForRecords(ids: string[]) {
  if (ids.length === 0) return [];
  const values = await command(ids.flatMap((id) => [
    ["GET", countKey(id)],
    ["GET", mobileKey(id)],
    ["GET", desktopKey(id)],
  ]));
  return ids.map((_, index) => ({
    scans: Number(values[index * 3] || 0),
    mobileScans: Number(values[index * 3 + 1] || 0),
    desktopScans: Number(values[index * 3 + 2] || 0),
  }));
}

export async function recordScan(id: string, device: "mobile" | "desktop") {
  await command([["INCR", countKey(id)], ["INCR", device === "mobile" ? mobileKey(id) : desktopKey(id)]]);
  return metrics(id);
}
