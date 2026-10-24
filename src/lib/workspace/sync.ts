import { canonicalJson, mergeWorkspaces, sanitizeWorkspace, withoutIntl, type Workspace } from "./model.ts";
import {
  bookHash, emptyIndex, isBookId, liveBookIds, mergeBookIndex, parseBookIndex, PRIMARY_BOOK_ID, type BookIndex, type Shelf,
} from "./books.ts";
import type { PlanId } from "./entitlements.ts";
import {
  claimGuestSidecars, keepAside, loadShelf, OWNER_KEY, STASH_KEY, resetSyncMeta, setAsideOtherAccountBooks, switchAccountStorage, syncMetaFor, writeSyncMeta,
} from "./localStore.ts";

/**
 * Browser side of optional cloud sync, one engine per book (business) under a
 * small coordinator (docs/spec-multi-business.md §3.6). The local copy stays the
 * source of truth; when the user is signed in, changes are pushed (debounced,
 * one request in flight per book) and the server's merged copy is merged back
 * in, so edits made while a request is in flight are never lost.
 *
 * - The primary book syncs through /api/v1/workspace/ (as before); other books
 *   through /api/v1/workspace/books/<id>/. Every write carries expectedOwner.
 * - A server without the books routes (404/405, or an answer without an index)
 *   is a legacy server: only the primary syncs, exactly as before, and other
 *   books are paused (no pull, no push, no pay links).
 * - Books whose revision and hash didn't change since the last sync cost no request.
 * - A 404 or 410 never deletes local data; only a tombstone in the index does,
 *   and unsynced changes are set aside first (the caller's retire()).
 *
 * Account switching: local data is tagged with the account it last synced to.
 * Guest data (no tag) merges into the first account that signs in. Data tagged
 * with a different account is moved aside (verified), never uploaded to the new account.
 */

export const SYNC_URL = "/api/v1/workspace/";
export const BOOKS_URL = "/api/v1/workspace/books/";
export { OWNER_KEY, STASH_KEY };
const DEBOUNCE_MS = 1500;
const RETRY_MS = 30_000;
const INDEX_RETRY_MS = [30_000, 120_000];

const UNAVAILABLE = "Sync is unavailable right now. Your data is safe on this device.";
const SWITCHED = "Loaded this account's data. The previous account's data on this device was set aside (Settings).";
export const STASH_OCCUPIED = "Data from another account is still set aside on this device. Download or discard it in Settings first.";
export const STASH_NO_ROOM = "This browser is out of storage, so the previous account's data couldn't be set aside. Download a backup, then try again.";
export const OWNER_MISMATCH = "This tab is signed in to a different account now. Reload the page.";
export const READ_ONLY = "This business is read-only on the Free plan. Upgrade to edit it again.";

export type SyncStatus = "checking" | "signed_out" | "syncing" | "synced" | "offline" | "error" | "too_large";
export interface SyncState {
  status: SyncStatus;
  lastSyncedAt: number | null;
  message: string;
}
export type BookSyncStatus =
  | "synced" | "syncing" | "offline" | "error" | "too_large" | "limit" | "unregistered" | "deleted" | "cloud_only" | "paused"
  | "read_only" | "signed_out";
export interface ShelfSyncState extends SyncState {
  books: Record<string, BookSyncStatus>;
  legacy: boolean;
  plan: { id: PlanId; businesses: number } | null;
}

interface ClerkLike {
  loaded?: boolean;
  user?: unknown;
  session?: { getToken: () => Promise<string | null> } | null;
  signOut?: () => Promise<unknown>;
}

function clerk(): ClerkLike | undefined {
  return (globalThis as unknown as { Clerk?: ClerkLike }).Clerk;
}

/** Waits for the Clerk SDK (loaded by <ClerkClient />); undefined if it never arrives. */
async function clerkReady(timeoutMs: number): Promise<ClerkLike | undefined> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const c = clerk();
    if (c?.loaded) return c;
    await new Promise((r) => setTimeout(r, 100));
  }
  return undefined;
}

function storageGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function storageSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* blocked storage: sync still works in-memory */ }
}

/** Same-origin JSON request carrying a fresh Clerk session token when available. */
export async function authedFetch(url: string, method: "GET" | "POST" | "PUT" | "DELETE", body?: unknown): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  try {
    const token = await clerk()?.session?.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    // Fall back to the session cookie.
  }
  return fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: "same-origin" });
}

/** The sync URL of one book; only ids that passed BOOK_ID_RE ever reach a URL. */
export function bookUrl(bookId: string): string {
  if (!isBookId(bookId)) throw new RangeError("Invalid business id.");
  return bookId === PRIMARY_BOOK_ID ? SYNC_URL : `${BOOKS_URL}${bookId}/`;
}

/** Statuses that stop pushes and retries until the coordinator releases the book. */
const HOLD: ReadonlySet<BookSyncStatus> = new Set(["too_large", "limit", "deleted", "paused", "read_only", "unregistered", "cloud_only", "signed_out"]);

export interface BookSyncOptions {
  /** expectedOwner for every write (the owner this engine started with). */
  owner: () => string | null;
  get: () => Workspace | null;
  /** Writes into this book whatever book is active; returns whether it was saved to storage. */
  apply: (ws: Workspace) => boolean;
  onStatus: (status: BookSyncStatus, message: string) => void;
  /** A server copy was accepted (rev, bookHash of the server copy, saved locally, the server keeps ws.intl). */
  onSynced?: (rev: number, hash: string, saved: boolean, keepsIntl: boolean) => void;
  /** 404 unknown_business / 410 business_deleted: never a local delete. */
  onGone?: (code: "unknown_business" | "business_deleted") => void;
  onOwnerMismatch?: () => void;
  onSignedOut?: () => void;
}

/** One book's engine: today's single-workspace engine, parameterized by book. */
export function createBookSync(bookId: string, o: BookSyncOptions) {
  const url = bookUrl(bookId);
  let status: BookSyncStatus = "synced";
  let lastJson: string | null = null;
  /**
   * The last reply carried intl: 1 (a server that keeps ws.intl). A server without it (a rollback) answers
   * with the foreign section stripped; local intl is never removed because of that, and every comparison with
   * its copy leaves intl out, so the engine neither loops nor fails flush() (docs/spec-foreign-clients.md §2.6).
   */
  let serverKeepsIntl = true;
  let inFlight = false;
  let again = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const set = (next: BookSyncStatus, message = "") => {
    status = next;
    o.onStatus(next, message);
  };
  const active = () => !stopped && !HOLD.has(status);
  const local = () => o.get();
  /** Every comparison with the server's last copy goes through here. */
  const sameAsServer = (ws: Workspace) => canonicalJson(serverKeepsIntl ? ws : withoutIntl(ws)) === lastJson;

  function schedule(delay: number) {
    clearTimeout(timer);
    timer = setTimeout(() => void push(), delay);
  }

  /** Merges a server answer into this book; answers for another book (a late reply) are dropped. */
  function accept(body: { workspace?: unknown; rev?: unknown; businessId?: unknown; intl?: unknown }): boolean {
    const answerFor = typeof body.businessId === "string" ? body.businessId : PRIMARY_BOOK_ID;
    if (answerFor !== bookId) return false;
    const server = sanitizeWorkspace(body.workspace);
    serverKeepsIntl = body.intl === 1;
    lastJson = canonicalJson(server);
    const mine = local();
    // The merge keeps local intl: a section missing from the reply never deletes anything.
    const next = mine ? mergeWorkspaces(mine, server) : server;
    const saved = mine && canonicalJson(next) === canonicalJson(mine) ? true : o.apply(next);
    if (typeof body.rev === "number" && Number.isSafeInteger(body.rev)) o.onSynced?.(body.rev, bookHash(server), saved, serverKeepsIntl);
    return true;
  }

  async function failed(response: Response): Promise<void> {
    const body = await response.json().catch(() => ({})) as { error?: string; code?: string };
    if (response.status === 401) { set("signed_out"); o.onSignedOut?.(); return; }
    if (response.status === 413) return set("too_large", body.error ?? "Workspace too large to sync.");
    if (response.status === 409 && body.code === "owner_mismatch") { set("error", OWNER_MISMATCH); o.onOwnerMismatch?.(); return; }
    if (response.status === 402 && body.code === "plan_read_only") return set("read_only", READ_ONLY);
    if (bookId !== PRIMARY_BOOK_ID && response.status === 404) { set("unregistered"); o.onGone?.("unknown_business"); return; }
    if (bookId !== PRIMARY_BOOK_ID && response.status === 410) { set("deleted"); o.onGone?.("business_deleted"); return; }
    set("error", body.error ?? "Sync failed. Retrying soon.");
    schedule(RETRY_MS);
  }

  async function push(): Promise<void> {
    if (!active()) return;
    if (inFlight) { again = true; return; }
    const mine = local();
    if (!mine) return; // cloud-only: never push an empty copy
    inFlight = true;
    again = false;
    set("syncing");
    try {
      const response = await authedFetch(url, "PUT", { workspace: mine, expectedOwner: o.owner() ?? undefined });
      if (!response.ok) return await failed(response);
      if (!accept(await response.json())) return set("error", "Sync failed. Retrying soon.");
      set("synced");
    } catch {
      set("offline");
      return;
    } finally {
      inFlight = false;
    }
    const after = local();
    if (again || (after && !sameAsServer(after))) schedule(200);
  }

  async function pull(): Promise<void> {
    if (!active()) return;
    set("syncing");
    let response: Response;
    try {
      response = await authedFetch(url, "GET");
    } catch {
      return set("offline");
    }
    if (!response.ok) return failed(response);
    if (!accept(await response.json().catch(() => ({})))) return set("error", "Sync failed. Retrying soon.");
    set("synced");
    const after = local();
    if (after && !sameAsServer(after)) void push();
  }

  return {
    id: bookId,
    status: () => status,
    push,
    pull,
    /** A server answer the coordinator already has (legacy start, account switch). */
    acceptStart(body: { workspace?: unknown; rev?: unknown; businessId?: unknown; intl?: unknown }) {
      if (!accept(body)) return;
      set("synced");
      const after = local();
      if (after && !sameAsServer(after)) void push();
    },
    /**
     * Revision and hash say this copy equals the server's: synced without a request. `keepsIntl` false: the hash
     * matched with the foreign section left out, because this session's last answer came from a server that strips it.
     */
    markClean(keepsIntl = true) {
      const mine = local();
      lastJson = mine ? canonicalJson(keepsIntl ? mine : withoutIntl(mine)) : null;
      serverKeepsIntl = keepsIntl;
      set("synced");
    },
    hold(next: BookSyncStatus, message = "") {
      clearTimeout(timer);
      set(next, message);
    },
    /** The index lists the book as live again. A 410 the index didn't confirm stays held until the next page load (no loop). */
    release() {
      if (HOLD.has(status) && status !== "deleted") set("synced");
    },
    /** Call after every local change; cheap when nothing new needs uploading. */
    changed() {
      if (!active()) return;
      const mine = local();
      if (mine && lastJson !== null && sameAsServer(mine)) return;
      schedule(DEBOUNCE_MS);
    },
    /** Pushes now and resolves once the server has this device's latest copy. */
    async flush(): Promise<boolean> {
      if (!active()) return false;
      clearTimeout(timer);
      for (let i = 0; i < 50 && inFlight; i++) await new Promise((r) => setTimeout(r, 100));
      await push();
      const mine = local();
      return status === "synced" && Boolean(mine) && sameAsServer(mine as Workspace);
    },
    forget() {
      lastJson = null;
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}

type BookEngine = ReturnType<typeof createBookSync>;

export interface ShelfSyncOptions {
  getIndex: () => BookIndex;
  /** Adopt an index (merged with the server's); the caller saves it. */
  applyIndex: (index: BookIndex) => void;
  getBook: (id: string) => Workspace | null;
  applyBook: (id: string, ws: Workspace) => boolean;
  /** Account switch: the shelf now holds only the new account's primary. */
  replaceShelf: (shelf: Shelf) => void;
  /** §2.4 removal of a book whose index entry is a tombstone (sets unsynced changes aside). */
  retire: (id: string) => void;
  /** Replaces a book with the server's copy as is (no merge); returns whether it was saved. Used for read-only books. */
  resetBook?: (id: string, ws: Workspace) => boolean;
  /** A set-aside copy was written (the Settings list should refresh). */
  onAside?: () => void;
  onState: (state: ShelfSyncState) => void;
  /** The tab's owner changed under it (409 owner_mismatch): the caller reloads. */
  onOwnerChanged?: () => void;
  activeId?: () => string;
  clerkTimeoutMs?: number;
}

/** Coordinator over one engine per book. */
export function createShelfSync(opts: ShelfSyncOptions) {
  let phase: "checking" | "signed_out" | "running" | "blocked" | "stopped" = "checking";
  let started = false;
  let legacy = false;
  let owner: string | null = null;
  let plan: ShelfSyncState["plan"] = null;
  let coord: { status: "offline" | "error"; message: string } | null = null;
  let notice = "";
  let lastSyncedAt: number | null = null;
  let startTimer: ReturnType<typeof setTimeout> | undefined;
  let indexTimer: ReturnType<typeof setTimeout> | undefined;
  let indexAttempt = 0;
  let refreshing: Promise<boolean> | null = null;
  const engines = new Map<string, BookEngine>();
  const statuses: Record<string, BookSyncStatus> = {};
  const messages: Record<string, string> = {};
  /** In-session revision and hash per book (also when the local save failed). */
  const session = new Map<string, { rev: number; hash: string; keepsIntl: boolean }>();
  /** Ids the server refused for the plan in this session: local-only, never PUT again until the plan changes. */
  const rejected = new Set<string>();

  function emit() {
    let status: SyncStatus;
    let message = "";
    if (phase === "checking") status = "checking";
    else if (phase === "signed_out") status = "signed_out";
    else if (coord) ({ status, message } = coord);
    else {
      const ids = Object.keys(statuses);
      const first = (s: BookSyncStatus) => ids.find((id) => statuses[id] === s);
      const err = first("error");
      if (first("offline")) status = "offline";
      else if (err) { status = "error"; message = messages[err] ?? ""; }
      else if (statuses[PRIMARY_BOOK_ID] === "too_large") { status = "too_large"; message = messages[PRIMARY_BOOK_ID] ?? ""; }
      else if (first("syncing")) status = "syncing";
      else if (statuses[PRIMARY_BOOK_ID] === "signed_out") status = "signed_out";
      else { status = "synced"; message = notice; }
    }
    opts.onState({ status, lastSyncedAt, message, books: { ...statuses }, legacy, plan });
  }

  function engineFor(id: string): BookEngine {
    let engine = engines.get(id);
    if (engine) return engine;
    engine = createBookSync(id, {
      owner: () => owner,
      get: () => opts.getBook(id),
      apply: (ws) => opts.applyBook(id, ws),
      onStatus: (s, message) => {
        statuses[id] = s;
        messages[id] = message;
        if (s === "read_only") void settleReadOnly(id);
        // The account-switch notice survives the uploads of the start itself; the next edit's push clears it.
        if (s === "syncing" && !starting) notice = "";
        emit();
      },
      onSynced: (rev, hash, saved, keepsIntl) => {
        session.set(id, { rev, hash, keepsIntl });
        // §2.5: the revision is recorded only once the book is safely in this browser's storage.
        // Never in legacy mode: a rolled-back server's revisions can't be trusted for the skip check.
        // fx: this reply came from a server that keeps ws.intl (foreign-clients spec §2.5).
        if (saved && owner && !legacy) writeSyncMeta(owner, id, rev, hash, keepsIntl);
        lastSyncedAt = Date.now();
      },
      onGone: (code) => {
        if (code === "unknown_business") scheduleIndexRetry();
        else void refreshIndex();
      },
      onOwnerMismatch: ownerMismatch,
      onSignedOut: () => { phase = "signed_out"; emit(); },
    });
    engines.set(id, engine);
    return engine;
  }

  const settling = new Set<string>();
  /**
   * A read-only business (402 plan_read_only) whose copy here holds changes the server doesn't have (made offline,
   * or before the downgrade was known): those changes are kept as a verified set-aside copy to download, then the
   * book shows the server's copy again. Nothing is dropped; if the copy can't be kept, the book stays as it is.
   */
  async function settleReadOnly(id: string): Promise<void> {
    if (id === PRIMARY_BOOK_ID || settling.has(id) || !owner || legacy || !opts.resetBook) return;
    const local = opts.getBook(id);
    const meta = syncMetaFor(owner, id) ?? session.get(id);
    if (!local || (meta && bookHash(local) === meta.hash)) return;
    settling.add(id);
    try {
      const response = await authedFetch(bookUrl(id), "GET");
      if (!response.ok) return;
      const body = await response.json().catch(() => null) as { workspace?: unknown; rev?: unknown; businessId?: unknown; intl?: unknown } | null;
      if (!body || body.businessId !== id) return;
      const server = sanitizeWorkspace(body.workspace);
      const now = opts.getBook(id);
      // A server without intl: 1 strips the foreign section; the local one is kept, never replaced by its absence.
      const replacement = body.intl === 1 || !now?.intl ? server : { ...server, intl: now.intl };
      if (!now || canonicalJson(now) === canonicalJson(replacement)) return;
      if (!keepAside(id, "read_only", now)) return;
      const saved = opts.resetBook(id, replacement);
      if (typeof body.rev === "number" && Number.isSafeInteger(body.rev)) {
        session.set(id, { rev: body.rev, hash: bookHash(server), keepsIntl: body.intl === 1 });
        if (saved) writeSyncMeta(owner, id, body.rev, bookHash(server), body.intl === 1);
      }
      opts.onAside?.();
    } catch {
      // Offline: tried again on the next read-only answer.
    } finally {
      settling.delete(id);
    }
  }

  function hold(id: string, status: BookSyncStatus) {
    if (engines.has(id)) engines.get(id)!.hold(status);
    else { statuses[id] = status; messages[id] = ""; }
  }

  function stopEngines() {
    for (const engine of engines.values()) engine.stop();
    engines.clear();
    clearTimeout(startTimer);
    clearTimeout(indexTimer);
  }

  function ownerMismatch() {
    stopEngines();
    phase = "blocked";
    coord = { status: "error", message: OWNER_MISMATCH };
    emit();
    opts.onOwnerChanged?.();
  }

  function retryStart(delay: number) {
    clearTimeout(startTimer);
    startTimer = setTimeout(() => void start(), delay);
  }

  function scheduleIndexRetry() {
    if (indexTimer || phase !== "running" || legacy) return;
    const delay = INDEX_RETRY_MS[Math.min(indexAttempt, INDEX_RETRY_MS.length - 1)];
    indexAttempt++;
    indexTimer = setTimeout(() => { indexTimer = undefined; void refreshIndex(); }, delay);
  }

  /**
   * The previous account's books move aside (verified) before the new account's
   * primary copy replaces this device's. Nothing is adopted when that fails.
   */
  function adoptAccount(newOwner: string, previousOwner: string, primary: { workspace?: unknown; rev?: unknown; businessId?: unknown }): boolean {
    const server = sanitizeWorkspace(primary.workspace);
    const result = switchAccountStorage(previousOwner, newOwner, opts.getIndex(), server);
    if (!result.ok) {
      stopEngines();
      phase = "blocked";
      coord = { status: "error", message: result.reason === "occupied" ? STASH_OCCUPIED : STASH_NO_ROOM };
      emit();
      return false;
    }
    owner = newOwner;
    ownerKeySeen = storageGet(OWNER_KEY);
    session.clear();
    // The shelf as stored now: the new account's primary (merged with its own stash when it was set aside
    // here earlier) and any of its books given back. Anything that differs from the server is pushed.
    opts.replaceShelf(loadShelf().shelf);
    lastSyncedAt = Date.now();
    notice = SWITCHED;
    engineFor(PRIMARY_BOOK_ID).acceptStart(primary);
    return true;
  }

  function signedOut() {
    phase = "signed_out";
    emit();
  }

  const stopped = () => phase === "stopped";

  /**
   * The account key this tab last saw: read at page load, updated only by this
   * coordinator's own writes. A tab that launched offline has no owner yet; if
   * another tab moved the device to another account meanwhile, its start must
   * never run under that account's session (it would upload this tab's copy).
   */
  let ownerKeySeen = storageGet(OWNER_KEY);
  const ownerMovedUnderUs = () => storageGet(OWNER_KEY) !== ownerKeySeen;
  function adoptOwnerKey(value: string) {
    const first = storageGet(OWNER_KEY) === null;
    storageSet(OWNER_KEY, value);
    ownerKeySeen = storageGet(OWNER_KEY);
    // A first sign-in adopts the guest's foreign sections now (owner-tagged at once, not at their next save),
    // so an older tab's later account switch can't leave them looking like the next account's.
    if (first && ownerKeySeen === value) claimGuestSidecars();
  }

  /**
   * An older tab switched this device to `serverOwner` but left the previous
   * account's extra books and index behind: set them aside, never merge or upload them.
   */
  function dropOtherAccountIndex(serverOwner: string): boolean {
    const index = opts.getIndex();
    if (!index.owner || index.owner === serverOwner) return true;
    if (!setAsideOtherAccountBooks(index, serverOwner)) {
      stopEngines();
      phase = "blocked";
      coord = { status: "error", message: STASH_NO_ROOM };
      emit();
      return false;
    }
    opts.replaceShelf(loadShelf().shelf);
    return true;
  }

  function offline(knownAccount: boolean) {
    if (!knownAccount) return signedOut();
    phase = "running";
    coord = { status: "offline", message: "" };
    emit();
    retryStart(RETRY_MS);
  }

  async function startLegacy(knownAccount: boolean): Promise<void> {
    if (!legacy) resetSyncMeta(storageGet(OWNER_KEY));
    legacy = true;
    let response: Response;
    try {
      response = await authedFetch(SYNC_URL, "GET");
    } catch {
      return offline(knownAccount);
    }
    if (response.status === 401) return signedOut();
    if (!response.ok) {
      if (!knownAccount) return signedOut();
      phase = "running";
      coord = { status: "error", message: UNAVAILABLE };
      emit();
      retryStart(RETRY_MS);
      return;
    }
    const body = await response.json() as { workspace: unknown; owner: string; rev?: number };
    if (ownerMovedUnderUs()) return ownerMismatch();
    const previousOwner = storageGet(OWNER_KEY);
    phase = "running";
    coord = null;
    started = true;
    for (const id of liveBookIds(opts.getIndex())) if (id !== PRIMARY_BOOK_ID) hold(id, "paused");
    if (previousOwner && previousOwner !== body.owner) {
      // Different account on this device: set local data aside, load this account's copy.
      adoptAccount(body.owner, previousOwner, body);
      return emit();
    }
    if (!dropOtherAccountIndex(body.owner)) return;
    adoptOwnerKey(body.owner);
    owner = body.owner;
    engineFor(PRIMARY_BOOK_ID).acceptStart(body);
    lastSyncedAt = Date.now();
    emit();
  }

  let starting: Promise<void> | null = null;
  /** Single flight: "online", visibility and the retry timer can all ask for a start at once. */
  function start(): Promise<void> {
    if (!starting) starting = run().finally(() => { starting = null; });
    return starting;
  }

  async function run(): Promise<void> {
    if (stopped()) return;
    if (ownerMovedUnderUs()) return ownerMismatch();
    clearTimeout(startTimer);
    const c = await clerkReady(opts.clerkTimeoutMs ?? 10_000);
    if (stopped()) return;
    if (c && !c.user) return signedOut();
    // Without the Clerk SDK (offline launch, blocked script) we can't tell who
    // is signed in: only a successful response, or an account that synced on
    // this device before, counts as signed in. Never show anonymous users a
    // sync error.
    const knownAccount = Boolean(c?.user) || Boolean(storageGet(OWNER_KEY));
    let response: Response;
    try {
      response = await authedFetch(BOOKS_URL, "GET");
    } catch {
      return offline(knownAccount);
    }
    if (response.status === 401) return signedOut();
    // No books routes: a server from before several businesses (or rolled back).
    if (response.status === 404 || response.status === 405) return startLegacy(knownAccount);
    if (!response.ok) {
      if (!knownAccount) return signedOut();
      phase = "running";
      coord = { status: "error", message: UNAVAILABLE };
      emit();
      retryStart(RETRY_MS);
      return;
    }
    const body = await response.json().catch(() => null) as { index?: unknown; revs?: Record<string, number>; owner?: unknown; plan?: ShelfSyncState["plan"] } | null;
    const serverIndex = body ? parseBookIndex(body.index) : null;
    if (!body || !serverIndex || typeof body.owner !== "string") return startLegacy(knownAccount);
    legacy = false;
    if (ownerMovedUnderUs()) return ownerMismatch();
    const previousOwner = storageGet(OWNER_KEY);
    if (previousOwner && previousOwner !== body.owner) {
      // Fetch the new account's primary first, so nothing is moved unless it can be replaced.
      let primary: Response;
      try {
        primary = await authedFetch(SYNC_URL, "GET");
      } catch {
        return offline(true);
      }
      if (!primary.ok) {
        phase = "running";
        coord = { status: "error", message: UNAVAILABLE };
        emit();
        retryStart(RETRY_MS);
        return;
      }
      if (ownerMovedUnderUs()) return ownerMismatch();
      phase = "running";
      coord = null;
      if (!adoptAccount(body.owner, previousOwner, await primary.json())) return;
    } else {
      if (!dropOtherAccountIndex(body.owner)) return;
      adoptOwnerKey(body.owner);
      owner = body.owner;
    }
    phase = "running";
    coord = null;
    started = true;
    plan = body.plan ?? null;
    await syncIndex(serverIndex, body.revs ?? {});
    emit();
  }

  /**
   * Index sync and the per-book decisions (§3.6 steps 4–6): register local books
   * the server doesn't list, adopt the server's tombstones (removal goes through
   * retire()), then push or pull only the books whose hash or revision changed.
   * Resolves true when the server's index already matched this device's, or took its changes.
   */
  async function syncIndex(serverIndex: BookIndex, revs: Record<string, number>): Promise<boolean> {
    if (!owner) return false;
    let confirmed = true;
    let server = serverIndex;
    let serverRevs = revs;
    const withOwner = (index: BookIndex): BookIndex => ({ ...index, owner: owner as string });
    let merged = withOwner(mergeBookIndex(opts.getIndex(), server));
    const serverLive = new Set(liveBookIds(server));
    const needsPut = liveBookIds(merged).some((id) => !server.books[id] && !rejected.has(id))
      || Object.values(merged.books).some((meta) => meta.deletedAt !== undefined && serverLive.has(meta.id));
    if (needsPut) {
      const { owner: _local, ...index } = merged;
      try {
        const response = await authedFetch(BOOKS_URL, "PUT", { index, expectedOwner: owner });
        const reply = await response.json().catch(() => ({})) as { index?: unknown; revs?: Record<string, number>; rejected?: unknown; plan?: ShelfSyncState["plan"]; code?: string };
        if (response.status === 409 && reply.code === "owner_mismatch") { ownerMismatch(); return false; }
        const replyIndex = response.ok ? parseBookIndex(reply.index) : null;
        if (replyIndex) {
          server = replyIndex;
          serverRevs = reply.revs ?? {};
          if (Array.isArray(reply.rejected)) for (const id of reply.rejected) if (isBookId(id)) rejected.add(id);
          if (reply.plan !== undefined) plan = reply.plan ?? null;
          merged = withOwner(mergeBookIndex(merged, replyIndex));
          indexAttempt = 0;
        } else { confirmed = false; scheduleIndexRetry(); }
      } catch {
        confirmed = false;
        scheduleIndexRetry();
      }
    }
    opts.applyIndex(merged);
    // Tombstones (local deletes, the server's, other devices') leave the shelf through §2.4.
    for (const meta of Object.values(merged.books)) {
      if (meta.deletedAt === undefined) continue;
      engines.get(meta.id)?.stop();
      engines.delete(meta.id);
      delete statuses[meta.id];
      opts.retire(meta.id);
    }
    const registered = new Set(liveBookIds(server));
    const active = opts.activeId?.() ?? PRIMARY_BOOK_ID;
    const order = liveBookIds(merged);
    const ordered = [...order.filter((id) => id === PRIMARY_BOOK_ID), ...order.filter((id) => id === active && id !== PRIMARY_BOOK_ID), ...order.filter((id) => id !== PRIMARY_BOOK_ID && id !== active)];
    for (const id of ordered) {
      if (phase !== "running") return confirmed;
      if (rejected.has(id) && !registered.has(id)) { hold(id, "limit"); continue; }
      if (!registered.has(id)) { hold(id, "unregistered"); scheduleIndexRetry(); continue; }
      const engine = engineFor(id);
      engine.release();
      await decide(engine, serverRevs[id] ?? 0);
    }
    emit();
    return confirmed;
  }

  async function decide(engine: BookEngine, rev: number): Promise<void> {
    const id = engine.id;
    const mine = opts.getBook(id);
    const stored = syncMetaFor(owner, id);
    const inSession = session.get(id);
    const meta = stored ?? inSession;
    if (!mine) {
      // Cloud-only (§2.5): kept in the account, loaded when opened; never replaced by an empty copy.
      if (meta && id !== PRIMARY_BOOK_ID) return engine.hold("cloud_only");
      return engine.pull();
    }
    // Stored meta without the fx marker may describe a copy older code stripped of ws.intl (an old tab on this
    // device synced it): pull once (foreign-clients spec §2.5). It counts as confirmed only when it is the meta
    // this session wrote (same rev and hash): an old tab that rewrote the map without fx, or a server that strips
    // intl, then costs no request. Meta that only this session holds is confirmed by definition.
    if (!meta) return engine.pull();
    const sessionWrote = inSession !== undefined && inSession.rev === meta.rev && inSession.hash === meta.hash;
    if (!sessionWrote && stored?.fx !== 1) return engine.pull();
    // This session last heard from a server that strips ws.intl (a rollback, §2.6): its hash is of the stripped
    // copy, so the foreign section is left out of the comparison too. Otherwise every visibility or online refresh
    // would PUT a book that holds intl (review round 3); a push can't give that server the section anyway.
    const keepsIntl = !sessionWrote || inSession?.keepsIntl !== false;
    if (bookHash(keepsIntl ? mine : withoutIntl(mine)) !== meta.hash) return engine.push();
    if (meta.rev !== rev) return engine.pull();
    engine.markClean(keepsIntl);
    lastSyncedAt = Date.now();
  }

  /** GET the index again and act on it (also the non-legacy "Sync now"). True once the server holds this device's index. */
  function refreshIndex(): Promise<boolean> {
    if (phase !== "running" || legacy || !started) return Promise.resolve(false);
    if (refreshing) return refreshing;
    refreshing = (async () => {
      try {
        const response = await authedFetch(BOOKS_URL, "GET");
        if (response.status === 401) { signedOut(); return false; }
        if (response.status === 404 || response.status === 405) {
          // Rolled back mid-session: the primary keeps syncing, other books pause, revisions are forgotten.
          resetSyncMeta(owner);
          legacy = true;
          for (const id of [...engines.keys()]) if (id !== PRIMARY_BOOK_ID) hold(id, "paused");
          emit();
          return false;
        }
        if (!response.ok) return false;
        const body = await response.json().catch(() => null) as { index?: unknown; revs?: Record<string, number>; owner?: unknown; plan?: ShelfSyncState["plan"] } | null;
        const serverIndex = body ? parseBookIndex(body.index) : null;
        if (!body || !serverIndex) return false;
        if (body.owner !== owner) { ownerMismatch(); return false; }
        if (body.plan !== undefined) {
          if (body.plan?.id !== plan?.id || body.plan?.businesses !== plan?.businesses) rejected.clear();
          plan = body.plan ?? null;
        }
        return await syncIndex(serverIndex, body.revs ?? {});
      } catch {
        // Offline: the next "online" event or visibility change retries.
        return false;
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  }

  function primary(): BookEngine | undefined {
    return engines.get(PRIMARY_BOOK_ID);
  }

  const onOnline = () => {
    if (phase === "stopped" || phase === "blocked" || phase === "signed_out") return;
    if (!started) { coord = null; void start(); return; }
    if (legacy) {
      const s = primary()?.status();
      if (s === "offline" || s === "error") void primary()?.push();
      return;
    }
    for (const engine of engines.values()) if (engine.status() === "offline" || engine.status() === "error") void engine.push();
    void refreshIndex();
  };
  const onVisible = () => {
    if (document.visibilityState !== "visible" || phase !== "running") return;
    // A start that failed (network blip at load) is retried when the tab comes back.
    if (!started) { coord = null; void start(); return; }
    if (legacy) void primary()?.push();
    else void refreshIndex();
  };
  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisible);

  async function signOut(): Promise<void> {
    for (const engine of engines.values()) engine.hold("signed_out");
    clearTimeout(startTimer);
    clearTimeout(indexTimer);
    try { await clerk()?.signOut?.(); } catch { /* ignore */ }
    signedOut();
  }

  return {
    start,
    /** The account this engine syncs as (null until known). */
    owner: () => owner,
    /** The account this tab belongs to: the synced owner, else the one recorded when the page loaded. */
    ownerKey: () => owner ?? ownerKeySeen,
    legacy: () => legacy,
    /** One book's sync status right now (undefined until the coordinator has decided about it). */
    bookStatus: (id: string): BookSyncStatus | undefined => statuses[id],
    /** Call after every local change to a book; cheap when nothing new needs uploading. */
    changed(id: string) {
      if (phase !== "running") return;
      engines.get(id)?.changed();
    },
    /** A book was added or deleted locally: register it now, then sync it. True once the server took the change. */
    indexChanged(): Promise<boolean> {
      return refreshIndex();
    },
    refreshIndex,
    /** A cloud-only book (§2.5) the user opened: pull it from the account now. */
    open(id: string): Promise<void> {
      if (phase !== "running" || legacy || !isBookId(id)) return Promise.resolve();
      const engine = engines.get(id);
      if (!engine || engine.status() !== "cloud_only") return Promise.resolve();
      engine.release();
      return engine.pull();
    },
    /** Pushes now and resolves once the server has this device's latest copy of the book. */
    async flush(id: string = PRIMARY_BOOK_ID): Promise<boolean> {
      if (phase !== "running") return false;
      const engine = engines.get(id);
      return engine ? engine.flush() : false;
    },
    syncNow() {
      if (phase !== "running") return;
      if (!started) { coord = null; void start(); return; }
      if (legacy) void primary()?.push();
      else {
        for (const engine of engines.values()) if (engine.status() === "offline" || engine.status() === "error") void engine.push();
        void refreshIndex();
      }
    },
    async deleteCloudCopy(): Promise<boolean> {
      try {
        const response = await authedFetch(SYNC_URL, "DELETE", owner ? { expectedOwner: owner } : undefined);
        if (!response.ok) return false;
        session.clear();
        resetSyncMeta(owner);
        for (const engine of engines.values()) engine.forget();
        await signOut();
        return true;
      } catch {
        return false;
      }
    },
    signOut,
    stop() {
      phase = "stopped";
      stopEngines();
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    },
  };
}
