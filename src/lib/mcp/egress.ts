/**
 * Claude's connectors call from Anthropic's documented egress range, 160.79.104.0/21
 * (https://claude.com/docs/connectors/building/authentication). Every Claude user shares
 * those addresses, so per-address limits must treat the range as one shared caller.
 */
export function isAnthropicEgress(address: string): boolean {
  const parts = address.trim().split(".");
  if (parts.length !== 4 || !parts.every((part) => /^\d{1,3}$/.test(part))) return false;
  const [a, b, c, d] = parts.map(Number);
  if ([a, b, c, d].some((n) => n > 255)) return false;
  return a === 160 && b === 79 && c >= 104 && c <= 111;
}

/** The client address Vercel reports for a request. */
export function clientAddress(request: Request): string {
  return (request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0] || "").trim();
}
