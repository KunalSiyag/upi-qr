/**
 * Launch-news list for features still in development (automatic WhatsApp
 * reminders), offered by WaitlistCard next to the free payment tracker and by
 * the Pro panel. Shared with /api/waitlist. Tool slugs match the
 * trackProductEvent slugs ("upi-qr" is the QR generator).
 */

export const WAITLIST_TOOLS = ["invoice", "receipt", "proforma", "quotation", "payment-reminder", "upi-qr", "pro"] as const;
export type WaitlistTool = (typeof WAITLIST_TOOLS)[number];

export const WAITLIST_LANGS = ["en", "hi", "ta", "te", "mr"] as const;
export type WaitlistLang = (typeof WAITLIST_LANGS)[number];

/** Entries expire automatically; also stated in the privacy policy. */
export const WAITLIST_RETENTION_DAYS = 365;

export function isWaitlistTool(value: unknown): value is WaitlistTool {
  return typeof value === "string" && (WAITLIST_TOOLS as readonly string[]).includes(value);
}

export function isWaitlistLang(value: unknown): value is WaitlistLang {
  return typeof value === "string" && (WAITLIST_LANGS as readonly string[]).includes(value);
}

/** LocalizedToolPage component keys that show the early-access card. */
export const WAITLIST_COMPONENTS: Record<string, WaitlistTool> = {
  invoice: "invoice",
  receipt: "receipt",
  proforma: "proforma",
  quotation: "quotation",
  paymentReminder: "payment-reminder",
};
