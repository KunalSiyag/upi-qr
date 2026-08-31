import { createHash } from "node:crypto";
import { kv } from "@vercel/kv";

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfter: number;
}

export async function consumeRateLimit(
  scope: string,
  identifier: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const digest = createHash("sha256").update(identifier).digest("hex").slice(0, 32);
  const key = `pro-upi-qr:rate:${scope}:${digest}`;
  const script = `
    local count = redis.call('INCR', KEYS[1])
    if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
    local ttl = redis.call('TTL', KEYS[1])
    return { count, ttl }
  `;
  const [rawCount, rawTtl] = await kv.eval<string[], [number, number]>(script, [key], [String(windowSeconds)]);
  const count = Number(rawCount);
  const ttl = Math.max(1, Number(rawTtl) || windowSeconds);

  return {
    allowed: count <= limit,
    limit,
    remaining: Math.max(0, limit - count),
    retryAfter: ttl,
  };
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "Retry-After": String(result.retryAfter),
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
  };
}
