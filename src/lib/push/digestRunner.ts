import { readWorkspace, type CloudStore } from "../workspace/cloud.ts";
import { digestProjection, morningDigest, workspaceFromProjection, type DigestProjection } from "../workspace/digest.ts";
import type { PushStore } from "./store.ts";
import { safePushEndpoint, sendPush, type VapidKeys } from "./webpush.ts";

export interface DigestRunResult {
  owners: number;
  notified: number;
  sent: number;
  expired: number;
  failed: number;
  /** Accounts not reached before the time budget ran out (a later run picks them up). */
  remaining: number;
  /** Accounts whose digest came from the compact projection rather than the full workspace. */
  fromProjection: number;
}

interface ProjectionReader {
  get(owner: string): Promise<DigestProjection | null>;
  put(owner: string, projection: DigestProjection): Promise<void>;
}

/**
 * Daily cron body: for every account with notifications on, read its synced
 * workspace, build the digest, and push it to each device. Expired or
 * no-longer-allowed endpoints are removed. At most one digest per account per day.
 */
export async function runMorningDigest(deps: {
  push: PushStore;
  cloud: CloudStore;
  vapid: VapidKeys;
  today: string;
  now: number;
  allowLocalEndpoints?: boolean;
  fetchImpl?: typeof fetch;
  concurrency?: number;
  /** Compact per-account input; when missing, the full workspace is read and the projection backfilled. */
  projections?: ProjectionReader;
  /** Stop starting new accounts after this time (epoch ms) so the function never times out mid-run. */
  deadline?: number;
}): Promise<DigestRunResult> {
  const result: DigestRunResult = { owners: 0, notified: 0, sent: 0, expired: 0, failed: 0, remaining: 0, fromProjection: 0 };
  const owners = await deps.push.owners();
  result.owners = owners.length;
  let next = 0;
  async function worker() {
    while (next < owners.length) {
      if (deps.deadline && Date.now() > deps.deadline) return;
      const owner = owners[next++];
      const subscriptions = await deps.push.list(owner);
      if (subscriptions.length === 0) { await deps.push.forget(owner); continue; }
      let workspace;
      const projection = await deps.projections?.get(owner).catch(() => null);
      if (projection) {
        workspace = workspaceFromProjection(projection);
        result.fromProjection++;
      } else {
        workspace = (await readWorkspace(deps.cloud, owner)).workspace;
        await deps.projections?.put(owner, digestProjection(workspace)).catch(() => undefined);
      }
      const digest = morningDigest(workspace, deps.today);
      if (!digest) continue;
      if (!(await deps.push.markDigest(owner, deps.today))) continue;
      result.notified++;
      for (const subscription of subscriptions) {
        if (!safePushEndpoint(subscription.endpoint, deps.allowLocalEndpoints)) {
          await deps.push.remove(owner, subscription.endpoint);
          continue;
        }
        const outcome = await sendPush(subscription, digest, deps.vapid, deps.fetchImpl, deps.now);
        result[outcome === "sent" ? "sent" : outcome === "expired" ? "expired" : "failed"]++;
        if (outcome === "expired") await deps.push.remove(owner, subscription.endpoint);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, deps.concurrency ?? 20) }, worker));
  result.remaining = Math.max(0, owners.length - next);
  return result;
}
