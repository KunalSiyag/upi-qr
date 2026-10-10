import type { VapidKeys } from "./webpush.ts";

const env = (key: string): string | undefined => ((import.meta.env as Record<string, string | undefined>)[key] ?? process.env[key])?.trim() || undefined;

/** Push is available only when VAPID keys are configured (generate: node scripts/generate-vapid-keys.mjs). */
export function vapidConfig(): VapidKeys | null {
  const publicKey = env("VAPID_PUBLIC_KEY");
  const privateKey = env("VAPID_PRIVATE_KEY");
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: env("VAPID_SUBJECT") || "mailto:support@proupiqr.in" };
}

export function cronSecret(): string | null {
  return env("CRON_SECRET") ?? null;
}

/** Local push endpoints (http://127.0.0.1) are accepted only in development, for tests. */
export const allowLocalPushEndpoints = (): boolean => Boolean(import.meta.env.DEV);
