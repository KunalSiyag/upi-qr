import { formatPaise } from "../workspace/model.ts";
import { safePushEndpoint, sendPush, type VapidKeys } from "./webpush.ts";
import type { PushStore } from "./store.ts";

/** What a client submitted on a pay link. */
export interface ClaimAlert {
  invoiceNumber: string;
  amountPaise: number | null;
  utr: string;
  statement: boolean;
}

/**
 * The notification a merchant gets when a client submits a UTR on a pay link.
 * Same shape as the morning digest (public/sw.js shows title/body, opens url).
 * Only the last four UTR digits are shown on the lock screen.
 */
export function claimNotification(claim: ClaimAlert, token: string) {
  const what = claim.statement ? "their statement" : claim.invoiceNumber;
  const lead = claim.amountPaise ? `${formatPaise(claim.amountPaise)} for ${what}` : `For ${what}`;
  return {
    title: "A client says they've paid",
    body: `${lead} · UTR …${claim.utr.slice(-4)}. Check your bank, then confirm it in the tracker.`,
    url: "/app/",
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
