import { readWorkspace, slotFor, type CloudStore } from "../workspace/cloud.ts";
import { emptyIndex, liveBookIds, parseBookIndex, PRIMARY_BOOK_ID, type BookIndex } from "../workspace/books.ts";
import {
  bookProjection, digestProjection, morningDigestBooks, NAME_BUSINESSES_ON_LOCK_SCREEN, workspaceFromProjection,
  type AccountProjections, type DigestProjection,
} from "../workspace/digest.ts";
import type { Workspace } from "../workspace/model.ts";
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
  getAll(owner: string): Promise<AccountProjections>;
  put(owner: string, bookId: string, projection: DigestProjection): Promise<void>;
  drop(owner: string, bookId: string): Promise<void>;
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
  /** Compact per-account input (one request per account); a missing book projection is backfilled from the book's document. */
  projections?: ProjectionReader;
  /** Book index store, read only when projections are unavailable. Absent = only the primary book. */
  books?: CloudStore;
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
      // Which books are live: the index (deleted books are ignored), or only the primary when there is none.
      let all: AccountProjections | null = null;
      if (deps.projections) all = await deps.projections.getAll(owner).catch(() => null);
      let index: BookIndex = emptyIndex();
      let rawIndex: unknown = all ? all.index : null;
      if (!all && deps.books) {
        try {
          rawIndex = (await deps.books.read(owner)).doc;
        } catch {
          continue; // the index can't be read: skip this account today (not marked, so a later run retries)
        }
      }
      if (rawIndex !== null && rawIndex !== undefined) {
        const parsed = parseBookIndex(rawIndex);
        if (!parsed) continue; // unreadable index: skip this account today, write nothing
        index = parsed;
      }
      const live = liveBookIds(index);
      const projections = all?.projections ?? {};
      for (const id of Object.keys(projections)) {
        if (id !== PRIMARY_BOOK_ID && !live.includes(id)) await deps.projections?.drop(owner, id).catch(() => undefined);
      }
      const books: { id: string; name: string; ws: Workspace }[] = [];
      let projected = true;
      for (const id of live) {
        const projection = projections[id];
        if (projection) {
          books.push({ id, name: projection.name ?? "", ws: workspaceFromProjection(projection) });
          continue;
        }
        projected = false;
        const workspace = (await readWorkspace(deps.cloud, slotFor(owner, id))).workspace;
        await deps.projections?.put(owner, id, id === PRIMARY_BOOK_ID ? digestProjection(workspace) : bookProjection(workspace)).catch(() => undefined);
        books.push({ id, name: workspace.business.name, ws: workspace });
      }
      if (projected) result.fromProjection++;
      const digest = morningDigestBooks(books, deps.today, NAME_BUSINESSES_ON_LOCK_SCREEN);
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
