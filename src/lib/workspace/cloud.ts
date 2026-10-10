import { canonicalJson, emptyWorkspace, mergeWorkspaces, pruneTombstones, sanitizeWorkspace, type Workspace } from "./model.ts";

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

export interface CloudStore {
  /** Stored document (string or already-parsed JSON) and its revision; rev 0 when absent. */
  read(owner: string): Promise<{ doc: unknown; rev: number }>;
  /** Writes only if the stored revision still equals expectedRev; returns the new revision or null. */
  write(owner: string, json: string, expectedRev: number): Promise<number | null>;
  remove(owner: string): Promise<void>;
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

export async function readWorkspace(store: CloudStore, owner: string): Promise<{ workspace: Workspace; rev: number }> {
  const { doc, rev } = await store.read(owner);
  return { workspace: parseStored(doc), rev };
}

export async function syncWorkspace(store: CloudStore, owner: string, incoming: unknown, now: number): Promise<SyncResult> {
  const clientCopy = sanitizeWorkspace(incoming);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { doc, rev } = await store.read(owner);
    const serverCopy = parseStored(doc);
    const merged = pruneTombstones(mergeWorkspaces(serverCopy, clientCopy), now);
    const json = canonicalJson(merged);
    if (rev > 0 && json === canonicalJson(serverCopy)) return { status: "ok", workspace: merged, rev };
    const bytes = new TextEncoder().encode(json).length;
    if (bytes > MAX_WORKSPACE_BYTES) return { status: "too_large", bytes };
    const nextRev = await store.write(owner, json, rev);
    if (nextRev !== null) return { status: "ok", workspace: merged, rev: nextRev };
  }
  return { status: "conflict" };
}

/** In-memory CloudStore for tests and local development without KV credentials. */
export function memoryCloudStore(): CloudStore & { docs: Map<string, { json: string; rev: number }> } {
  const docs = new Map<string, { json: string; rev: number }>();
  return {
    docs,
    async read(owner) {
      const entry = docs.get(owner);
      return entry ? { doc: entry.json, rev: entry.rev } : { doc: null, rev: 0 };
    },
    async write(owner, json, expectedRev) {
      const current = docs.get(owner)?.rev ?? 0;
      if (current !== expectedRev) return null;
      docs.set(owner, { json, rev: current + 1 });
      return current + 1;
    },
    async remove(owner) {
      docs.delete(owner);
    },
  };
}
