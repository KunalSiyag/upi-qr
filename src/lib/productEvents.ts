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
  "waitlist_view",
  "waitlist_join",
  "waitlist_dismiss",
  "invoice_tracked",
  "payment_recorded",
  "reminder_sent",
  "upgrade_started",
  "app_installed",
  "statement_imported",
  "push_enabled",
  "upgrade_prompt",
] as const;

export type ProductEventName = (typeof PRODUCT_EVENTS)[number];

const ALLOWED = new Set<string>(PRODUCT_EVENTS);
const TOOL_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/i;

/** Events that mean the user finished a document — the moment to offer early access. */
const OUTPUT_EVENTS = new Set<string>(["export_png", "export_pdf", "share", "copy"]);
export const TOOL_OUTPUT_EVENT = "proupiqr:tool-output";
export const TOOL_OUTPUT_SESSION_KEY = "proupiqr-tool-output";

function signalToolOutput(tool: string): void {
  try {
    sessionStorage.setItem(TOOL_OUTPUT_SESSION_KEY, tool);
  } catch {
    // Storage can be blocked; the live event below still fires.
  }
  window.dispatchEvent(new CustomEvent(TOOL_OUTPUT_EVENT, { detail: { tool } }));
}

export function trackProductEvent(name: ProductEventName, tool?: string): void {
  if (typeof window === "undefined") return;
  if (!ALLOWED.has(name)) return;
  if (OUTPUT_EVENTS.has(name) && tool && TOOL_RE.test(tool)) signalToolOutput(tool.toLowerCase());

  const payload: Record<string, string> = {};
  if (tool && TOOL_RE.test(tool)) payload.tool = tool.toLowerCase();

  try {
    track(name, payload);
  } catch {
    // Analytics must never break a generator.
  }
}
