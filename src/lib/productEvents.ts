import { track } from "@vercel/analytics";

/**
 * Privacy-preserving product events.
 *
 * Allowed names and a short tool slug only. Never send VPA, payee names,
 * amounts, invoice contents, uploaded files, or free-text payloads.
 */

export const PRODUCT_EVENTS = [
  "qr_generated",
  "export_png",
  "export_pdf",
  "share",
  "copy",
  "tool_error",
] as const;

export type ProductEventName = (typeof PRODUCT_EVENTS)[number];

const ALLOWED = new Set<string>(PRODUCT_EVENTS);
const TOOL_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/i;

export function trackProductEvent(name: ProductEventName, tool?: string): void {
  if (typeof window === "undefined") return;
  if (!ALLOWED.has(name)) return;

  const payload: Record<string, string> = {};
  if (tool && TOOL_RE.test(tool)) payload.tool = tool.toLowerCase();

  try {
    track(name, payload);
  } catch {
    // Analytics must never break a generator.
  }
}
