import { formatPaise } from "../workspace/model.ts";
import { formatMoney, isForeignCurrency, type ForeignCurrency } from "../workspace/currency.ts";
import { isBookId, PRIMARY_BOOK_ID } from "../workspace/books.ts";
import { safePushEndpoint, sendPush, type VapidKeys } from "./webpush.ts";
import type { PushStore } from "./store.ts";

/** What a client submitted on a pay link. */
export interface ClaimAlert {
  invoiceNumber: string;
  amountPaise: number | null;
  utr: string;
  statement: boolean;
  /** Owning business, only for accounts with several businesses (from the server-side snapshot, never the payer). */
  businessName?: string;
  /** Owning book; a non-primary id makes the notification open that business. */
  businessId?: string;
  /**
   * A claim on a foreign-currency link (from the server-side snapshot, never the payer): the amount is in this
   * currency's minor units and `utr` holds a transfer reference. Absent = INR, today's text byte for byte.
   */
  currency?: ForeignCurrency;
}

const MAX_ALERT_NAME = 60;

/**
 * The notification a merchant gets when a client submits a UTR (or, on a foreign-currency link, a transfer
 * reference) on a pay link. Same shape as the morning digest (public/sw.js shows title/body, opens url).
 * Only the last four characters of the reference are shown on the lock screen.
 */
export function claimNotification(claim: ClaimAlert, token: string) {
  const name = (claim.businessName ?? "").replace(/\s+/g, " ").trim();
  const shown = name.length > MAX_ALERT_NAME ? `${name.slice(0, MAX_ALERT_NAME - 1)}…` : name;
  const what = `${claim.statement ? "their statement" : claim.invoiceNumber}${shown ? ` (${shown})` : ""}`;
  const foreign = isForeignCurrency(claim.currency) ? claim.currency : null;
  const amount = claim.amountPaise ? (foreign ? formatMoney(claim.amountPaise, foreign) : formatPaise(claim.amountPaise)) : "";
  const lead = amount ? `${amount} for ${what}` : `For ${what}`;
  const book = isBookId(claim.businessId) && claim.businessId !== PRIMARY_BOOK_ID ? claim.businessId : null;
  return {
    title: "A client says they've paid",
    body: `${lead} · ${foreign ? "ref" : "UTR"} …${claim.utr.slice(-4)}. Check your bank, then confirm it in the tracker.`,
    url: book ? `/app/?business=${book}` : "/app/",
    tag: `claim-${token}`,
  };
}

/**
 * Pushes the claim to the owner's devices right away. Best effort: waits at
 * most `timeoutMs` so the payer's form never hangs, re-checks every endpoint
 * against the push-service allowlist, and prunes expired subscriptions.
 */
export async function sendClaimAlert(
  deps: { push: PushStore; vapid: VapidKeys; allowLocalEndpoints: boolean; fetchImpl?: typeof fetch; now?: number; timeoutMs?: number },
  owner: string,
  token: string,
  claim: ClaimAlert,
): Promise<{ sent: number; expired: number; failed: number }> {
  const result = { sent: 0, expired: 0, failed: 0 };
  const subscriptions = await deps.push.list(owner);
  if (!subscriptions.length) return result;
  const payload = claimNotification(claim, token);
  const sends = subscriptions.map(async (subscription) => {
    if (!safePushEndpoint(subscription.endpoint, deps.allowLocalEndpoints)) {
      await deps.push.remove(owner, subscription.endpoint);
      return;
    }
    const outcome = await sendPush(subscription, payload, deps.vapid, deps.fetchImpl, deps.now);
    result[outcome === "sent" ? "sent" : outcome === "expired" ? "expired" : "failed"]++;
    if (outcome === "expired") await deps.push.remove(owner, subscription.endpoint);
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    Promise.allSettled(sends),
    new Promise((resolve) => { timer = setTimeout(resolve, deps.timeoutMs ?? 2500); }),
  ]);
  clearTimeout(timer);
  return result;
}
