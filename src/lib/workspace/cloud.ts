import { canonicalJson, emptyWorkspace, mergeWorkspaces, pruneTombstones, sanitizeWorkspace, type Workspace } from "./model.ts";
import {
  applyIncomingIndex, capAdditions, capBookIndex, emptyIndex, liveBookIds, MAX_DELETED_IDS, parseBookIndex, parseLinkKey,
  PRIMARY_BOOK_ID, sanitizeBookIndex, type BookIndex,
} from "./books.ts";

/**
 * Server-side workspace sync. The client always sends its whole workspace; the
 * server merges it into the stored copy (per-record last-writer-wins, see
 * mergeWorkspaces) and writes with a compare-and-set on a revision counter, so
 * concurrent devices never overwrite each other. Merge is commutative, so a
 * lost race is simply retried against the newer copy.
 *
 * Storage is behind CloudStore so it can move from KV to Postgres without
 * touching the API, and so tests can use an in-memory store.
 */

/** Upstash's free tier caps requests at 1 MB; stay safely below it. */
export const MAX_WORKSPACE_BYTES = 900_000;
const MAX_ATTEMPTS = 5;

/**
 * Storage slot of one book: the primary book keeps the account's original slot
 * (byte-identical keys), other books get "<owner>:<bookId>". Build slots only on
 * the server, from workspaceOwner(userId) and an id that passed BOOK_ID_RE.
 */
export const slotFor = (owner: string, bookId: string): string => (bookId === PRIMARY_BOOK_ID ? owner : `${owner}:${bookId}`);

export interface CloudStore {
  /** Stored document (string or already-parsed JSON) and its revision; rev 0 when absent. */
  read(slot: string): Promise<{ doc: unknown; rev: number }>;
  /** Writes only if the stored revision still equals expectedRev; returns the new revision or null. */
  write(slot: string, json: string, expectedRev: number): Promise<number | null>;
  /**
   * Deletes the documents and advances their revisions (never resets them): a removed
   * document reads as rev N+1 with no data, so a device holding rev N sees a change and
   * re-uploads, and a document written again continues at N+2 (no ABA).
   */
  removeDocs(slots: string[]): Promise<void>;
  /** Current revisions (0 when absent), in the order given. */
  revs(slots: string[]): Promise<number[]>;
}

export type SyncResult =
  | { status: "ok"; workspace: Workspace; rev: number }
  | { status: "too_large"; bytes: number }
  | { status: "conflict" };

function parseStored(doc: unknown): Workspace {
  if (doc === null || doc === undefined) return emptyWorkspace();
  if (typeof doc === "string") {
    try {
      return sanitizeWorkspace(JSON.parse(doc));
    } catch {
      return emptyWorkspace();
    }
  }
  return sanitizeWorkspace(doc);
}

export async function readWorkspace(store: CloudStore, slot: string): Promise<{ workspace: Workspace; rev: number }> {
  const { doc, rev } = await store.read(slot);
  return { workspace: parseStored(doc), rev };
}

export async function syncWorkspace(store: CloudStore, slot: string, incoming: unknown, now: number): Promise<SyncResult> {
  const clientCopy = sanitizeWorkspace(incoming);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { doc, rev } = await store.read(slot);
    const serverCopy = parseStored(doc);
    const merged = pruneTombstones(mergeWorkspaces(serverCopy, clientCopy), now);
    const json = canonicalJson(merged);
    if (rev > 0 && json === canonicalJson(serverCopy)) return { status: "ok", workspace: merged, rev };
    const bytes = new TextEncoder().encode(json).length;
    if (bytes > MAX_WORKSPACE_BYTES) return { status: "too_large", bytes };
    const nextRev = await store.write(slot, json, rev);
    if (nextRev !== null) return { status: "ok", workspace: merged, rev: nextRev };
  }
  return { status: "conflict" };
}

/** In-memory CloudStore for tests and local development without KV credentials. */
export function memoryCloudStore(): CloudStore & { docs: Map<string, { json: string; rev: number }> } {
  const docs = new Map<string, { json: string; rev: number }>();
  /** Revisions survive removeDocs, as the KV rev keys do. */
  const revisions = new Map<string, number>();
  return {
    docs,
    async read(slot) {
      const entry = docs.get(slot);
      return entry ? { doc: entry.json, rev: entry.rev } : { doc: null, rev: revisions.get(slot) ?? 0 };
    },
    async write(slot, json, expectedRev) {
      const current = revisions.get(slot) ?? 0;
      if (current !== expectedRev) return null;
      docs.set(slot, { json, rev: current + 1 });
      revisions.set(slot, current + 1);
      return current + 1;
    },
    async removeDocs(slots) {
      for (const slot of slots) {
        docs.delete(slot);
        revisions.set(slot, (revisions.get(slot) ?? 0) + 1);
      }
    },
    async revs(slots) {
      return slots.map((slot) => revisions.get(slot) ?? 0);
    },
  };
}

// ---------------------------------------------------------------------------
// Book index (docs/spec-multi-business.md §3): add-once, delete-final, stamped
// with the server's clock, written with the same compare-and-set as workspaces.

export type IndexSyncResult =
  | { status: "ok"; index: BookIndex; rev: number; added: string[]; removed: string[]; rejected: string[]; deleted: string[]; unpurged: string[] }
  | { status: "conflict" }
  | { status: "corrupt" };

/** The stored form: no owner, books sorted, `deleted` only when non-empty. Equal indexes give equal JSON. */
export function storedIndexJson(index: BookIndex): string {
  const books = Object.fromEntries(Object.keys(index.books).sort().map((id) => [id, index.books[id]]));
  return JSON.stringify(index.deleted?.length ? { v: 1, books, deleted: index.deleted } : { v: 1, books });
}

/** What clients see: never the server-only `deleted` list or an owner tag. */
export function publicIndex(index: BookIndex): BookIndex {
  return { v: 1, books: { ...index.books } };
}

/** Tombstones whose cleanup isn't confirmed yet. */
export function unpurgedIds(index: BookIndex): string[] {
  return Object.values(index.books).filter((meta) => meta.deletedAt !== undefined && meta.purgedAt === undefined).map((meta) => meta.id).sort();
}

/** rev 0 or no document → emptyIndex(). A stored value that can't be read → "corrupt": answer 503 and never write over it. */
export async function readBookIndex(store: CloudStore, owner: string): Promise<{ index: BookIndex; rev: number } | "corrupt"> {
  const { doc, rev } = await store.read(owner);
  if (doc === null || doc === undefined) return { index: emptyIndex(), rev };
  const parsed = parseBookIndex(doc);
  if (!parsed) return "corrupt";
  delete parsed.owner;
  return { index: parsed, rev };
}

function withEvicted(index: BookIndex): BookIndex {
  const { index: capped, evicted } = capBookIndex(index);
  if (!evicted.length) return capped;
  return { ...capped, deleted: [...(index.deleted ?? []), ...evicted].slice(-MAX_DELETED_IDS) };
}

/**
 * Server merge of a client's index inside a CAS loop (§3.2). The plan limit is
 * read lazily (only when something is added) and applied to additions only, on
 * the merged index, so concurrent adds from two devices are re-checked against
 * the newer copy. Existing books are never rejected (downgrade keeps them).
 */
export async function syncBookIndex(
  store: CloudStore,
  owner: string,
  incoming: unknown,
  now: number,
  limitFor: () => Promise<number>,
): Promise<IndexSyncResult> {
  const clientIndex = sanitizeBookIndex(incoming);
  delete clientIndex.owner;
  delete clientIndex.deleted; // server-only
  let limit: number | undefined;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const current = await readBookIndex(store, owner);
    if (current === "corrupt") return { status: "corrupt" };
    const { index: server, rev } = current;
    const applied = applyIncomingIndex(server, clientIndex, now);
    let merged = applied.merged;
    let rejected: string[] = [];
    if (applied.added.length) {
      limit ??= await limitFor();
      ({ index: merged, rejected } = capAdditions(merged, applied.added, limit));
    }
    merged = withEvicted(merged);
    const added = applied.added.filter((id) => !rejected.includes(id));
    const result = { added, removed: applied.removed, rejected, deleted: applied.deleted, unpurged: unpurgedIds(merged) };
    const json = storedIndexJson(merged);
    if (json === storedIndexJson(server)) return { status: "ok", index: merged, rev, ...result };
    const nextRev = await store.write(owner, json, rev);
    if (nextRev !== null) return { status: "ok", index: merged, rev: nextRev, ...result };
  }
  return { status: "conflict" };
}

/** Index edits by the server itself (purge marks, "Delete cloud copy"), with the same CAS loop. null = nothing to change. */
async function updateIndex(store: CloudStore, owner: string, edit: (index: BookIndex) => BookIndex | null): Promise<BookIndex | null> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const current = await readBookIndex(store, owner);
    if (current === "corrupt") throw new Error("Book index is unreadable.");
    const next = edit(current.index);
    if (!next) return null;
    const merged = withEvicted(next);
    if (storedIndexJson(merged) === storedIndexJson(current.index)) return current.index;
    if ((await store.write(owner, storedIndexJson(merged), current.rev)) !== null) return merged;
  }
  throw new Error("Book index is busy.");
}

// ---------------------------------------------------------------------------
// Removing a book's server data (§3.5)

/** Everything server-side that holds a book's data. Structural, so Node tests can pass memory stores. */
export interface BookStores {
  docs: CloudStore;
  books: CloudStore;
  projections: { drop(owner: string, bookId: string): Promise<void>; bookIds(owner: string): Promise<string[]> };
  paylinks: {
    list(owner: string): Promise<Record<string, string>>;
    removeBook(owner: string, bookId: string): Promise<void>;
    viewTokens(owner: string): Promise<string[]>;
    patchViews(owner: string, set: Record<string, never>, drop: string[]): Promise<void>;
  };
}

/**
 * Idempotent: removes a non-live book's document, projection and pay links
 * (payers then get 404, never another book's UPI ID). Re-reads the index first
 * and refuses a live id or an unreadable index. Returns true when done.
 */
export async function deleteBookCloud(s: BookStores, owner: string, bookId: string): Promise<boolean> {
  if (bookId === PRIMARY_BOOK_ID) return false;
  const current = await readBookIndex(s.books, owner);
  if (current === "corrupt" || liveBookIds(current.index).includes(bookId)) return false;
  await s.docs.removeDocs([slotFor(owner, bookId)]);
  await s.projections.drop(owner, bookId);
  await s.paylinks.removeBook(owner, bookId);
  return true;
}

/**
 * The cleanup sweep: deleteBookCloud for each tombstone without purgedAt, then
 * one CAS update stamps purgedAt on the ids whose cleanup fully succeeded. A
 * failure leaves purgedAt unset, so the next request from any device retries.
 * Returns the updated index, or null when nothing was purged.
 */
export async function sweepDeletedBooks(s: BookStores, owner: string, ids: string[], now: number): Promise<BookIndex | null> {
  const done: string[] = [];
  for (const id of ids) {
    try {
      if (await deleteBookCloud(s, owner, id)) done.push(id);
    } catch {
      // retried by the next request
    }
  }
  if (!done.length) return null;
  return updateIndex(s.books, owner, (index) => {
    const books = { ...index.books };
    let changed = false;
    for (const id of done) {
      const meta = books[id];
      if (meta && meta.deletedAt !== undefined && meta.purgedAt === undefined) {
        books[id] = { ...meta, purgedAt: now };
        changed = true;
      }
    }
    return changed ? { ...index, books } : null;
  });
}

/**
 * "Delete cloud copy" (DELETE /api/v1/workspace/). Live extra books are
 * unregistered (not tombstoned: other signed-in devices re-register and
 * re-upload them, as the single document is today); tombstones and `deleted`
 * stay, so deleted books never come back. Then every document goes, plus the
 * projections and pay links of books that aren't live any more (this also
 * catches orphans left by races). The primary's projection and pay links are
 * unchanged here (PR 6). Revision counters stay.
 */
export async function deleteAllCloud(s: BookStores, owner: string, now: number): Promise<void> {
  let previous: string[] = [];
  await updateIndex(s.books, owner, (index) => {
    previous = liveBookIds(index).filter((id) => id !== PRIMARY_BOOK_ID);
    if (!previous.length) return null;
    const drop = new Set(previous);
    return { ...index, books: Object.fromEntries(Object.entries(index.books).filter(([id]) => !drop.has(id))) };
  });
  await s.docs.removeDocs([owner, ...previous.map((id) => slotFor(owner, id))]);
  const after = await readBookIndex(s.books, owner);
  if (after === "corrupt") return;
  const live = new Set(liveBookIds(after.index));
  const stale = new Set(previous.filter((id) => !live.has(id)));
  for (const id of await s.projections.bookIds(owner)) if (id !== PRIMARY_BOOK_ID && !live.has(id)) stale.add(id);
  for (const id of stale) await s.projections.drop(owner, id);
  const linkBooks = new Set(Object.keys(await s.paylinks.list(owner)).map((key) => parseLinkKey(key).bookId));
  for (const id of linkBooks) if (id && id !== PRIMARY_BOOK_ID && !live.has(id)) await s.paylinks.removeBook(owner, id);
  // Snapshots whose link is gone (a sync that raced a delete, or a revoke by older code) are unreachable: drop them.
  const active = new Set(Object.values(await s.paylinks.list(owner)));
  const orphans = (await s.paylinks.viewTokens(owner)).filter((token) => !active.has(token));
  if (orphans.length) await s.paylinks.patchViews(owner, {}, orphans);
  const unpurged = unpurgedIds(after.index);
  if (unpurged.length) await sweepDeletedBooks(s, owner, unpurged, now);
}
