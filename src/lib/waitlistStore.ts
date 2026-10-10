import { createHash } from "node:crypto";
import { kv } from "@vercel/kv";
import { WAITLIST_RETENTION_DAYS, type WaitlistLang, type WaitlistTool } from "../data/waitlist";

export interface WaitlistEntry {
  email: string;
  tool: WaitlistTool;
  lang: WaitlistLang;
  /** Opted in to a few follow-up questions by email. */
  interview: boolean;
  createdAt: string;
}

function entryKey(email: string): string {
  return `waitlist:entry:${createHash("sha256").update(email).digest("hex")}`;
}

/**
 * Stores the entry once per email (later sign-ups are ignored, not merged) and
 * bumps an aggregate per-tool counter only for new addresses. Returns whether
 * the address was new; callers must not reveal this to the client.
 */
export async function addWaitlistEntry(entry: WaitlistEntry): Promise<boolean> {
  const script = `
    local created = redis.call('SET', KEYS[1], ARGV[1], 'NX', 'EX', ARGV[2])
    if created then
      redis.call('INCR', KEYS[2])
      return 1
    end
    return 0
  `;
  const created = await kv.eval<string[], number>(
    script,
    [entryKey(entry.email), `waitlist:count:${entry.tool}`],
    [JSON.stringify(entry), String(WAITLIST_RETENTION_DAYS * 24 * 60 * 60)],
  );
  return Number(created) === 1;
}
