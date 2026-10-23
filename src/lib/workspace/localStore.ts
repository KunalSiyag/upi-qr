import {
  canonicalJson, emptyBusiness, emptyWorkspace, findClient, isIsoDate, liveInvoices, localToday, mergeIntl, mergeWorkspaces, newId, pruneTombstones,
  recordReceiptPayment, repairIntl, restoreFrom, sanitizeWorkspace, updateBusiness, upsertClient, upsertInvoice, withoutIntl, type IntlData, type ReceiptPayment,
  type Workspace,
} from "./model.ts";
import {
  addBook, bookHash, bookRank, canAddBook, emptyIndex, isBookId, isTombstoned, liveBookIds, mergeBookIndex, newBookId, parseBookIndex,
  pickBookForDocument, PRIMARY_BOOK_ID, routeLegacyBackup, type BookIndex, type Shelf,
} from "./books.ts";
import { isValidVpa } from "../upi-uri.ts";

/**
 * Browser persistence for the payments workspace: a shelf of books, one per
 * business (docs/spec-multi-business.md §2). localStorage is the source of truth
 * for signed-out users; cloud sync (when enabled) merges on top of it.
 *
 * The first business (the primary book) stays at proupiqr-workspace-v1, byte
 * compatible with older code, so old tabs and an offline PWA keep working on it.
 * Other books live under keys old code never reads, so old code can never
 * delete or merge them. Never write a non-primary book to WORKSPACE_KEY.
 *
 * Clients abroad (docs/spec-foreign-clients.md §2): a book's foreign section
 * (`ws.intl`) lives in a sidecar key, proupiqr-intl-v1:<id>, tagged with the
 * account that wrote it. The book key holds exactly what older code writes for
 * the same data, so old and new tabs never rewrite each other. Only
 * writeBookKeys writes a book key.
 */

export const WORKSPACE_KEY = "proupiqr-workspace-v1";
export const BOOK_INDEX_KEY = "proupiqr-books-v1";
export const ACTIVE_BOOK_KEY = "proupiqr-active-book";
/** { owner, books: { [id]: { rev, hash } } }: written only after a book was saved locally and the server confirmed it. */
export const BOOK_SYNC_KEY = "proupiqr-book-sync-v1";
/** The account this device's data last synced with. */
export const OWNER_KEY = "proupiqr-workspace-owner";
/** Stashed primary book of the other account (v1 JSON, so an old tab's "Download" works). */
export const STASH_KEY = "proupiqr-workspace-v1-other-account";
/** { owner, at, ids }: which extra books of the other account are stashed (one other account). */
export const STASH_V2_KEY = "proupiqr-stash-v2";
/** Session storage: a generator document waiting for the user to pick a business. */
export const PENDING_DOCUMENT_KEY = "proupiqr-pending-document";
const BOOK_PREFIX = "proupiqr-book-v1:";
const ASIDE_PREFIX = "proupiqr-aside-v1:";
const STASH_BOOK_PREFIX = "proupiqr-stash-v2:";
const INTL_PREFIX = "proupiqr-intl-v1:";
const INVOICE_DRAFT_KEY = "proupiqr-invoice-draft";
/** The last business limit the server reported for an account: { owner, limit }. Read before the first request and offline. */
export const PLAN_LIMIT_KEY = "proupiqr-plan-limit-v1";
/**
 * { [bookId]: generation }: bumped when a book is replaced by the server's copy (a read-only business whose
 * device-only changes were set aside). Other tabs then replace their copy instead of merging it back.
 */
export const BOOK_RESET_KEY = "proupiqr-book-reset-v1";
const PLACEHOLDER_VPA = "merchant@upi";

/** PR 3: false. Flipped by the UI release (spec §10); until then only the first business is ever shown. */
export const BOOKS_UI = true;

export const bookKey = (id: string): string => (id === PRIMARY_BOOK_ID ? WORKSPACE_KEY : `${BOOK_PREFIX}${id}`);
/** The sidecar of a book's foreign section, the primary included ({ owner, intl }; absent when the book has none). */
export const intlKey = (id: string): string => `${INTL_PREFIX}${id}`;

// ---------------------------------------------------------------------------
// Storage access: every call is guarded (blocked storage, quota, private mode).

function storage(): Storage | null {
  try {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null;
  } catch {
    return null;
  }
}
function get(key: string): string | null {
  try { return storage()?.getItem(key) ?? null; } catch { return null; }
}
/** Writes only when the value changed; false when storage is full or blocked. */
function put(key: string, value: string): boolean {
  try {
    const s = storage();
    if (!s) return false;
    if (s.getItem(key) !== value) s.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
/** Writes, then reads back: true only when the stored value is exactly what was written. */
function putVerified(key: string, value: string): boolean {
  return put(key, value) && get(key) === value;
}
function drop(key: string): void {
  try { storage()?.removeItem(key); } catch { /* ignore */ }
}
function keys(): string[] {
  try {
    const s = storage();
    if (!s) return [];
    const out: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const key = s.key(i);
      if (key !== null) out.push(key);
    }
    return out;
  } catch {
    return [];
  }
}
function parseJson(raw: string | null): unknown {
  if (raw === null) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

// ---------------------------------------------------------------------------
// Sync metadata (last server revision and hash per book)

/**
 * fx: 1 marks meta taken from a server reply that keeps ws.intl. Meta without it may come from a copy older
 * code stripped, so that book is pulled once (docs/spec-foreign-clients.md §2.5).
 */
export interface BookMeta { rev: number; hash: string; fx?: 1 }
export interface BookSyncMeta {
  owner: string | null;
  books: Record<string, BookMeta>;
}

export function readSyncMeta(): BookSyncMeta {
  const raw = parseJson(get(BOOK_SYNC_KEY)) as { owner?: unknown; books?: unknown } | null;
  const books: BookSyncMeta["books"] = {};
  if (raw && raw.books && typeof raw.books === "object") {
    for (const [id, value] of Object.entries(raw.books as Record<string, unknown>)) {
      const v = value as { rev?: unknown; hash?: unknown; fx?: unknown } | null;
      if (isBookId(id) && v && Number.isSafeInteger(v.rev) && typeof v.hash === "string") {
        books[id] = v.fx === 1 ? { rev: v.rev as number, hash: v.hash, fx: 1 } : { rev: v.rev as number, hash: v.hash };
      }
    }
  }
  return { owner: raw && typeof raw.owner === "string" ? raw.owner : null, books };
}

/** The meta of one book, only when it was recorded for this owner. */
export function syncMetaFor(owner: string | null, id: string): BookMeta | undefined {
  const meta = readSyncMeta();
  return meta.owner === owner ? meta.books[id] : undefined;
}

/** fx: the server reply that produced this meta carried intl: 1. */
export function writeSyncMeta(owner: string, id: string, rev: number, hash: string, fx = false): boolean {
  const meta = readSyncMeta();
  const books = meta.owner === owner ? meta.books : {};
  books[id] = fx ? { rev, hash, fx: 1 } : { rev, hash };
  return put(BOOK_SYNC_KEY, JSON.stringify({ owner, books }));
}

export function dropSyncMeta(id: string): void {
  const meta = readSyncMeta();
  if (!meta.books[id]) return;
  delete meta.books[id];
  put(BOOK_SYNC_KEY, JSON.stringify(meta));
}

export function resetSyncMeta(owner: string | null): void {
  if (owner) put(BOOK_SYNC_KEY, JSON.stringify({ owner, books: {} }));
  else drop(BOOK_SYNC_KEY);
}

// ---------------------------------------------------------------------------
// Last known business limit (so read-only businesses are known before the first request, and offline)

export function savePlanLimit(owner: string, limit: number): void {
  if (!Number.isSafeInteger(limit) || limit < 1) return;
  const value = JSON.stringify({ owner, limit });
  if (get(PLAN_LIMIT_KEY) !== value) put(PLAN_LIMIT_KEY, value);
}

/** The cached limit, only for the account it was recorded for. */
export function cachedPlanLimit(owner: string | null): number | null {
  if (!owner) return null;
  const raw = parseJson(get(PLAN_LIMIT_KEY)) as { owner?: unknown; limit?: unknown } | null;
  return raw && raw.owner === owner && Number.isSafeInteger(raw.limit) && (raw.limit as number) >= 1 ? (raw.limit as number) : null;
}

function readResets(): Record<string, number> {
  const raw = parseJson(get(BOOK_RESET_KEY)) as Record<string, unknown> | null;
  const out: Record<string, number> = {};
  if (raw && typeof raw === "object") for (const [id, n] of Object.entries(raw)) if (isBookId(id) && Number.isSafeInteger(n)) out[id] = n as number;
  return out;
}

/** Records that this book was just replaced by the server's copy; call before writing the replacement. */
export function markBookReset(id: string): void {
  if (!isBookId(id) || id === PRIMARY_BOOK_ID) return;
  const resets = readResets();
  put(BOOK_RESET_KEY, JSON.stringify({ ...resets, [id]: (resets[id] ?? 0) + 1 }));
}

/** Businesses ranked past the limit (never the first): read-only after a downgrade, as the server enforces. */
export function readOnlyBookIds(index: BookIndex, limit: number | null): Set<string> {
  if (limit === null) return new Set();
  return new Set(liveBookIds(index).filter((id) => id !== PRIMARY_BOOK_ID && bookRank(index, id) >= limit));
}

// ---------------------------------------------------------------------------
// Index and books

/**
 * The stored index. No key = only the primary (every device before this change).
 * An unreadable index is rebuilt from the book keys on this device, so a damaged
 * index never makes extra books look like strays.
 */
export function loadIndex(): BookIndex {
  const raw = get(BOOK_INDEX_KEY);
  if (raw === null) return emptyIndex();
  const parsed = parseBookIndex(raw);
  if (parsed) return parsed;
  let index = emptyIndex();
  for (const key of keys()) {
    if (key.startsWith(BOOK_PREFIX) && isBookId(key.slice(BOOK_PREFIX.length))) index = addBook(index, key.slice(BOOK_PREFIX.length), Date.now());
  }
  return index;
}

/**
 * Merges with the stored index (same owner) so a tombstone written by another
 * tab is never lost; `replace` writes as given (account switch).
 */
export function saveIndex(index: BookIndex, replace = false): boolean {
  let next = index;
  if (!replace) {
    const stored = parseBookIndex(get(BOOK_INDEX_KEY));
    if (stored && stored.owner === index.owner) next = { ...mergeBookIndex(stored, index), ...(index.owner ? { owner: index.owner } : {}) };
  }
  const clean: BookIndex = { v: 1, ...(next.owner ? { owner: next.owner } : {}), books: next.books };
  return put(BOOK_INDEX_KEY, JSON.stringify(clean));
}

/** First run: borrow business name and UPI ID from the invoice generator draft. */
function seedFromInvoiceDraft(ws: Workspace): Workspace {
  try {
    const draft = JSON.parse(get(INVOICE_DRAFT_KEY) || "null") as { merchant?: string; upiId?: string } | null;
    if (!draft) return ws;
    const name = typeof draft.merchant === "string" && draft.merchant !== "ABC Solutions" ? draft.merchant.slice(0, 80) : "";
    const upiId = typeof draft.upiId === "string" && draft.upiId !== PLACEHOLDER_VPA ? draft.upiId.slice(0, 100) : "";
    if (!name && !upiId) return ws;
    return updateBusiness(ws, { name, upiId }, 0);
  } catch {
    return ws;
  }
}

// ---------------------------------------------------------------------------
// The foreign-section sidecar (docs/spec-foreign-clients.md §2.1)

/** Name of the set-aside copy that keeps another account's foreign section found on this device. */
export const OTHER_ACCOUNT_INTL = "Clients abroad (another account)";

function readSidecar(id: string, text: string | null = get(intlKey(id))): { owner: string | null; intl: IntlData | undefined } | null {
  const raw = parseJson(text) as { owner?: unknown; intl?: unknown } | null;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return { owner: typeof raw.owner === "string" ? raw.owner : null, intl: sanitizeWorkspace({ intl: raw.intl }).intl };
}

/**
 * Whether a sidecar written for `sideOwner` belongs to this device's current account: the same account, a
 * signed-out device's own, or a guest's data adopted by the first sign-in (no other account's stash here).
 * Older code switches accounts without moving sidecars, so anything else is another account's data.
 */
function sidecarJoins(sideOwner: string | null): boolean {
  const current = get(OWNER_KEY);
  if (sideOwner !== null) return sideOwner === current;
  if (current === null) return true;
  return get(STASH_KEY) === null && get(STASH_V2_KEY) === null;
}

/** The foreign section that may join book `id`; another account's is set aside (verified), then dropped. */
function sidecarIntl(id: string): IntlData | undefined {
  const side = readSidecar(id);
  if (!side) return undefined;
  if (sidecarJoins(side.owner)) return side.intl;
  if (!side.intl) drop(intlKey(id));
  else if (putAside(newBookId(), "other_account", { ...emptyWorkspace(), business: { ...emptyBusiness(0), name: OTHER_ACCOUNT_INTL }, intl: side.intl })) drop(intlKey(id));
  return undefined;
}

/** A book key's workspace joined with its sidecar. Merged, never overridden: intl found in a book key is kept. */
function joinSidecar(id: string, ws: Workspace): Workspace {
  if (get(intlKey(id)) === null) return ws;
  const side = sidecarIntl(id);
  return side ? sanitizeWorkspace({ ...ws, intl: mergeIntl(ws.intl, side) }) : ws;
}

/**
 * The only function that writes a book key. The sidecar goes first (a reader that sees the new book key also
 * sees its sidecar), tagged with the account at write time; then the book key, holding exactly what older code
 * would write. True only if both writes succeeded (`verified`: each read back).
 */
function writeBookKeys(id: string, ws: Workspace, verified = false, now = Date.now()): boolean {
  const write = verified ? putVerified : put;
  const pruned = pruneTombstones(ws, now);
  // Another account's sidecar (left by an older switch) is set aside first and never written over.
  const existing = readSidecar(id);
  if (existing && !sidecarJoins(existing.owner)) {
    sidecarIntl(id);
    if (get(intlKey(id)) !== null) return false;
  }
  let sideOk = true;
  if (pruned.intl) sideOk = write(intlKey(id), canonicalJson({ owner: get(OWNER_KEY), intl: pruned.intl } as unknown as Workspace));
  else drop(intlKey(id));
  const bookOk = write(bookKey(id), canonicalJson(withoutIntl(pruned)));
  return sideOk && bookOk;
}

/**
 * One book. The primary keeps today's behaviour (seeded from the invoice draft
 * on first run, empty when unreadable); other books never seed and give null
 * when their key is missing or unreadable. Either way the book's sidecar joins
 * it when it belongs to this device's account.
 */
export function loadBook(id: string): Workspace | null {
  if (!isBookId(id)) return null;
  const raw = get(bookKey(id));
  let ws: Workspace;
  if (id === PRIMARY_BOOK_ID) {
    if (raw === null) ws = storage() ? seedFromInvoiceDraft(emptyWorkspace()) : emptyWorkspace();
    else {
      try { ws = sanitizeWorkspace(JSON.parse(raw)); } catch { ws = emptyWorkspace(); }
    }
  } else {
    if (raw === null) return null;
    try { ws = sanitizeWorkspace(JSON.parse(raw)); } catch { return null; }
  }
  return joinSidecar(id, ws);
}

/**
 * The index and every live book stored on this device. A live id without a key
 * but with sync metadata is cloud-only (§2.5): it stays out of shelf.books and is
 * never replaced by an empty book.
 */
export function loadShelf(): { shelf: Shelf; cloudOnly: string[] } {
  const index = loadIndex();
  const books: Record<string, Workspace> = {};
  const cloudOnly: string[] = [];
  const meta = readSyncMeta();
  for (const id of liveBookIds(index)) {
    const ws = loadBook(id);
    if (ws) books[id] = repairIntl(ws, Date.now());
    else if (meta.books[id]) cloudOnly.push(id);
  }
  return { shelf: { index, books }, cloudOnly };
}

/** Saves one book. Refuses (false) ids that aren't live in the index, or that another tab has tombstoned. */
export function saveBook(index: BookIndex, id: string, ws: Workspace): boolean {
  if (!isBookId(id) || !liveBookIds(index).includes(id)) return false;
  if (id !== PRIMARY_BOOK_ID) {
    const stored = parseBookIndex(get(BOOK_INDEX_KEY));
    if (stored && isTombstoned(stored, id)) return false;
  }
  return writeBookKeys(id, ws);
}

/** Never for the primary (it can't be deleted; old code owns its key too). Drops the book key and its sidecar. */
export function removeBookStorage(id: string): void {
  if (!isBookId(id) || id === PRIMARY_BOOK_ID) return;
  drop(bookKey(id));
  drop(intlKey(id));
}

/**
 * deleted_elsewhere: this account's unsynced changes to a business deleted on another device;
 * read_only: changes made here after the business became read-only (the server copy replaced them);
 * other_account: another account's data (or data no account can be proven to own) that used this device;
 * stray: a book key on this device that no index lists.
 */
export type AsideReason = "deleted_elsewhere" | "stray" | "read_only" | "other_account";
export interface AsideBook {
  id: string;
  at: number;
  reason: AsideReason;
  name: string;
  workspace: Workspace;
  /** A first business (primary) of some account: downloaded as a plain workspace backup, so any device can restore it. */
  fromPrimary: boolean;
}

/**
 * Writes a set-aside copy and reads it back. An existing copy under the same
 * key is merged, never replaced. A copy only: nothing else is removed here.
 */
function putAside(id: string, reason: AsideReason, ws: Workspace, fromPrimary = false): boolean {
  if (!isBookId(id) || id === PRIMARY_BOOK_ID) return false;
  const key = `${ASIDE_PREFIX}${id}`;
  const before = parseJson(get(key)) as { workspace?: unknown } | null;
  const workspace = before?.workspace ? mergeWorkspaces(sanitizeWorkspace(before.workspace), ws) : ws;
  return putVerified(key, JSON.stringify({ at: Date.now(), reason, name: workspace.business.name, workspace, ...(fromPrimary ? { primary: true } : {}) }));
}

/** A verified set-aside copy of a book that stays on the shelf (its key is left alone). */
export function keepAside(id: string, reason: AsideReason, ws: Workspace): boolean {
  return putAside(id, reason, ws);
}

/** Keeps a book that is leaving the shelf with unsynced changes: write, read back, then remove the book key. */
export function setAside(id: string, reason: AsideReason, ws: Workspace): boolean {
  if (!putAside(id, reason, ws)) return false;
  removeBookStorage(id);
  return true;
}

export function listAside(): AsideBook[] {
  const out: AsideBook[] = [];
  for (const key of keys()) {
    if (!key.startsWith(ASIDE_PREFIX)) continue;
    const id = key.slice(ASIDE_PREFIX.length);
    const raw = parseJson(get(key)) as { at?: unknown; reason?: unknown; name?: unknown; workspace?: unknown; primary?: unknown } | null;
    if (!isBookId(id) || !raw) continue;
    out.push({
      id,
      at: typeof raw.at === "number" ? raw.at : 0,
      reason: raw.reason === "stray" || raw.reason === "read_only" || raw.reason === "other_account" ? raw.reason : "deleted_elsewhere",
      name: typeof raw.name === "string" ? raw.name.slice(0, 80) : "",
      workspace: sanitizeWorkspace(raw.workspace),
      fromPrimary: raw.primary === true,
    });
  }
  return out.sort((a, b) => a.at - b.at);
}

export function discardAside(id: string): void {
  if (isBookId(id)) drop(`${ASIDE_PREFIX}${id}`);
}

/**
 * Removal of a book whose index entry became a tombstone (§2.4). A book deleted
 * on this device is removed. Otherwise, when this device holds changes no server
 * has (no sync meta, or a different hash), it is set aside for download first.
 * "kept": setting aside failed (quota); the key stays and the caller shows the
 * book as deleted with a download button.
 */
export function retireBook(id: string, ws: Workspace | null, owner: string | null, deletedHere: boolean): "removed" | "aside" | "kept" {
  if (!isBookId(id) || id === PRIMARY_BOOK_ID) return "kept";
  const local = ws ?? loadBook(id);
  const meta = syncMetaFor(owner, id);
  if (deletedHere || !local || (meta && meta.hash === bookHash(local))) {
    removeBookStorage(id);
    dropSyncMeta(id);
    return "removed";
  }
  if (setAside(id, "deleted_elsewhere", local)) {
    dropSyncMeta(id);
    return "aside";
  }
  return "kept";
}

/** Book keys whose id isn't live in the index: removed when synced, else set aside. Returns the ids handled. */
export function sweepStrayBooks(index: BookIndex, owner: string | null = get(OWNER_KEY)): string[] {
  const live = new Set(liveBookIds(index));
  const handled: string[] = [];
  for (const key of keys()) {
    if (!key.startsWith(BOOK_PREFIX)) continue;
    const id = key.slice(BOOK_PREFIX.length);
    if (!isBookId(id) || id === PRIMARY_BOOK_ID || live.has(id)) continue;
    const ws = loadBook(id);
    const meta = syncMetaFor(owner, id);
    if (!ws || (meta && meta.hash === bookHash(ws))) {
      removeBookStorage(id);
      dropSyncMeta(id);
      handled.push(id);
    } else if (setAside(id, "stray", ws)) {
      dropSyncMeta(id);
      handled.push(id);
    }
  }
  sweepStrayIntl(index, owner);
  return handled;
}

/**
 * Sidecars whose id isn't live and has no book key: removed when the server has their content (same hash
 * rule as books), else set aside first. Never the primary's.
 */
export function sweepStrayIntl(index: BookIndex, owner: string | null = get(OWNER_KEY)): string[] {
  const live = new Set(liveBookIds(index));
  const handled: string[] = [];
  for (const key of keys()) {
    if (!key.startsWith(INTL_PREFIX)) continue;
    const id = key.slice(INTL_PREFIX.length);
    if (!isBookId(id) || id === PRIMARY_BOOK_ID || live.has(id) || get(bookKey(id)) !== null) continue;
    const side = readSidecar(id);
    const joined: Workspace | null = side?.intl ? { ...emptyWorkspace(), intl: side.intl } : null;
    const meta = syncMetaFor(owner, id);
    if (!joined || (meta && meta.hash === bookHash(joined))) {
      drop(key);
      handled.push(id);
      continue;
    }
    const asideId = get(`${ASIDE_PREFIX}${id}`) === null ? id : newBookId();
    if (putAside(asideId, sidecarJoins(side?.owner ?? null) ? "stray" : "other_account", joined)) {
      drop(key);
      handled.push(id);
    }
  }
  return handled;
}

/** The book a new tab opens: the last-used one while the business UI is on, else always the primary. */
export function loadActiveBook(index: BookIndex): string {
  if (!BOOKS_UI) return PRIMARY_BOOK_ID;
  const stored = get(ACTIVE_BOOK_KEY);
  return stored && isBookId(stored) && liveBookIds(index).includes(stored) ? stored : PRIMARY_BOOK_ID;
}

export function saveActiveBook(id: string): void {
  if (BOOKS_UI && isBookId(id)) put(ACTIVE_BOOK_KEY, id);
}

/**
 * Keeps several open tabs consistent (§2.2):
 * - OWNER_KEY changed to another account, or the index now belongs to one: ownerChanged()
 *   (the caller stops sync and reloads). Book writes are ignored from then on.
 * - the index: index(merged with this tab's index);
 * - a book key of a live id (old tabs write the primary): book(id, merged with this tab's copy).
 * Writes to tombstoned or unknown ids are ignored. Tabs that aren't signed in ignore owner changes.
 */
export function onShelfChange(
  owner: () => string | null,
  current: () => Shelf,
  h: { book(id: string, ws: Workspace, replace?: boolean): void; index(index: BookIndex): void; ownerChanged(): void },
): () => void {
  let switched = false;
  let seenResets = readResets();
  const otherAccount = () => {
    const mine = owner();
    const stored = get(OWNER_KEY);
    return Boolean(mine && stored && stored !== mine);
  };
  const handler = (event: StorageEvent) => {
    if (switched || !event.key) return;
    try {
      if (event.key === OWNER_KEY) {
        if (event.newValue && otherAccount()) { switched = true; h.ownerChanged(); }
        return;
      }
      if (event.key === BOOK_INDEX_KEY) {
        const parsed = event.newValue ? parseBookIndex(event.newValue) : null;
        if (!parsed) return;
        const mine = owner();
        if ((mine && parsed.owner && parsed.owner !== mine) || otherAccount()) { switched = true; h.ownerChanged(); return; }
        h.index(mergeBookIndex(current().index, parsed));
        return;
      }
      // A book key or its sidecar: both are re-read and joined (old tabs write only the book key).
      const id = event.key === WORKSPACE_KEY ? PRIMARY_BOOK_ID
        : event.key.startsWith(BOOK_PREFIX) ? event.key.slice(BOOK_PREFIX.length)
        : event.key.startsWith(INTL_PREFIX) ? event.key.slice(INTL_PREFIX.length) : "";
      if (!id || !event.newValue || !isBookId(id)) return;
      // Another account took over this device in another tab: never merge its data into this tab's books.
      if (otherAccount()) { switched = true; h.ownerChanged(); return; }
      const shelf = current();
      const stored = parseBookIndex(get(BOOK_INDEX_KEY));
      if (!liveBookIds(shelf.index).includes(id) || (stored && isTombstoned(stored, id))) return;
      // The book key as written (event or storage) joined with its sidecar when that belongs to this account.
      const bookRaw = event.key.startsWith(INTL_PREFIX) ? get(bookKey(id)) : event.newValue;
      if (bookRaw === null) return;
      const side = readSidecar(id, event.key.startsWith(INTL_PREFIX) ? event.newValue : get(intlKey(id)));
      const legacy = sanitizeWorkspace(JSON.parse(bookRaw));
      const incoming = side?.intl && sidecarJoins(side.owner) ? sanitizeWorkspace({ ...legacy, intl: mergeIntl(legacy.intl, side.intl) }) : legacy;
      // Another tab replaced this book with the server's copy (its device-only changes were set aside):
      // take the stored copy as is; merging would bring the set-aside changes back.
      const resets = readResets();
      if (id !== PRIMARY_BOOK_ID && resets[id] !== undefined && resets[id] !== seenResets[id]) {
        seenResets = resets;
        h.book(id, incoming, true);
        return;
      }
      const mine = shelf.books[id];
      h.book(id, mine ? mergeWorkspaces(mine, incoming) : incoming);
    } catch {
      // Ignore malformed writes from other tabs.
    }
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

// ---------------------------------------------------------------------------
// Back-compat aliases (the primary book only)

export function loadWorkspace(): Workspace {
  return loadBook(PRIMARY_BOOK_ID) ?? emptyWorkspace();
}

/** Returns false when storage is full or blocked so the UI can warn. */
export function saveWorkspace(ws: Workspace): boolean {
  return saveBook(emptyIndex(), PRIMARY_BOOK_ID, ws);
}

/** The primary book only (old behaviour), for callers that haven't moved to onShelfChange. */
export function onExternalChange(current: () => Workspace, apply: (ws: Workspace) => void): () => void {
  const handler = (event: StorageEvent) => {
    if ((event.key !== WORKSPACE_KEY && event.key !== intlKey(PRIMARY_BOOK_ID)) || !event.newValue) return;
    try {
      // The book key joined with its sidecar, as loadBook reads them.
      const raw = event.key === WORKSPACE_KEY ? event.newValue : get(WORKSPACE_KEY);
      if (raw === null) return;
      const side = readSidecar(PRIMARY_BOOK_ID, event.key === WORKSPACE_KEY ? get(intlKey(PRIMARY_BOOK_ID)) : event.newValue);
      const legacy = sanitizeWorkspace(JSON.parse(raw));
      apply(mergeWorkspaces(current(), side?.intl && sidecarJoins(side.owner) ? sanitizeWorkspace({ ...legacy, intl: mergeIntl(legacy.intl, side.intl) }) : legacy));
    } catch {
      // Ignore malformed writes from other tabs.
    }
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

// ---------------------------------------------------------------------------
// Account switch: the previous account's books are set aside, never uploaded.

export interface StashedAccount { owner: string | null; at: number; shelf: Shelf }

/** The other account's data set aside on this device, or null. */
export function loadStash(): StashedAccount | null {
  const primaryRaw = get(STASH_KEY);
  const meta = parseJson(get(STASH_V2_KEY)) as { owner?: unknown; at?: unknown; ids?: unknown } | null;
  const ids = meta && Array.isArray(meta.ids) ? meta.ids.filter((id): id is string => isBookId(id) && id !== PRIMARY_BOOK_ID) : [];
  if (primaryRaw === null && !ids.length) return null;
  let index = emptyIndex();
  const books: Record<string, Workspace> = { [PRIMARY_BOOK_ID]: sanitizeWorkspace(parseJson(primaryRaw)) };
  for (const id of ids) {
    const raw = get(`${STASH_BOOK_PREFIX}${id}`);
    if (raw === null) continue;
    index = addBook(index, id, 1);
    books[id] = sanitizeWorkspace(parseJson(raw));
  }
  return { owner: meta && typeof meta.owner === "string" ? meta.owner : null, at: meta && typeof meta.at === "number" ? meta.at : 0, shelf: { index, books } };
}

export function discardStash(): void {
  const meta = parseJson(get(STASH_V2_KEY)) as { ids?: unknown } | null;
  for (const key of keys()) if (key.startsWith(STASH_BOOK_PREFIX)) drop(key);
  if (meta) drop(STASH_V2_KEY);
  drop(STASH_KEY);
}

export type SwitchResult = { ok: true } | { ok: false; reason: "occupied" | "storage" };

/**
 * Whose data a stash from older code (no owner recorded) holds. Only an exact
 * UPI ID match with both IDs set counts; a name is never evidence (two accounts
 * can share a generic business name). Anything else: unknown.
 */
function stashBelongsTo(stashed: Workspace, previous: Workspace, next: Workspace): "previous" | "next" | null {
  const theirs = normUpi(stashed.business.upiId);
  if (!theirs) return null;
  if (theirs === normUpi(previous.business.upiId)) return "previous";
  if (theirs === normUpi(next.business.upiId)) return "next";
  return null;
}

/**
 * Moves the previous account's books aside and installs the new account's
 * primary copy (§3.6). Every write is read back before anything it replaces is
 * removed, so at every step each invoice exists in at least one verified key.
 *
 * One other account at a time; the stash already on the device decides:
 * - none, or the previous account's own (by its recorded owner, or for an older
 *   stash without an owner an exact UPI ID match): merged with what is set aside now;
 * - a third account's: the switch is refused ("occupied");
 * - the account signing in (recorded owner, or exact UPI ID match), or an
 *   ownerless stash that matches neither account: first turned into set-aside
 *   copies (verified, then the stash slot is cleared). After a successful
 *   switch, the signing-in account's own copies are merged back into its books;
 *   anything that can't be is left as a set-aside copy to download.
 * A failed switch keeps the previous owner and restores every book; what can't
 * be restored keeps its verified stash copy, listed in the stash meta.
 */
export function switchAccountStorage(previousOwner: string, newOwner: string, index: BookIndex, newPrimary: Workspace, now = Date.now()): SwitchResult {
  const primaryRaw = get(WORKSPACE_KEY);
  // Books move joined with their sidecars (the foreign section rides inside the stashed JSON).
  const primary = joinSidecar(PRIMARY_BOOK_ID, primaryRaw === null ? emptyWorkspace() : sanitizeWorkspace(parseJson(primaryRaw)));
  const primarySideRaw = get(intlKey(PRIMARY_BOOK_ID));
  let existing = loadStash();
  let stashOwner: string | null = existing?.owner ?? null;
  if (existing && stashOwner === null) {
    const who = stashBelongsTo(existing.shelf.books[PRIMARY_BOOK_ID], primary, newPrimary);
    stashOwner = who === "previous" ? previousOwner : who === "next" ? newOwner : null;
  }
  if (existing && stashOwner !== null && stashOwner !== previousOwner && stashOwner !== newOwner) return { ok: false, reason: "occupied" };

  // 1. The signing-in account's stash, or an unattributable one: set-aside copies first (all verified), then the slot is cleared.
  const returned: { asideId: string; bookId: string }[] = [];
  if (existing && stashOwner !== previousOwner) {
    const giveBack = stashOwner === newOwner;
    const written: string[] = [];
    for (const id of liveBookIds(existing.shelf.index)) {
      const ws = existing.shelf.books[id];
      if (!ws) continue;
      const asideId = id === PRIMARY_BOOK_ID || get(`${ASIDE_PREFIX}${id}`) !== null ? newBookId() : id;
      if (!putAside(asideId, giveBack ? "stray" : "other_account", ws, id === PRIMARY_BOOK_ID)) {
        for (const done of written) drop(`${ASIDE_PREFIX}${done}`);
        return { ok: false, reason: "storage" };
      }
      written.push(asideId);
      if (giveBack) returned.push({ asideId, bookId: id });
    }
    discardStash();
    existing = null;
  }
  const merging = existing;
  const oldPrimaryStash = get(STASH_KEY);
  const oldMeta = get(STASH_V2_KEY);
  const ownerBefore = get(OWNER_KEY);
  const moved: { id: string; raw: string; sideRaw: string | null; value: string; stashKey: string; stashBefore: string | null }[] = [];

  /** Puts one moved book back; its stash copy goes only after the book key verified. False: it stays stashed. */
  const putBack = (m: (typeof moved)[number]): boolean => {
    const restoreStash = () => { if (m.stashBefore === null) drop(m.stashKey); else put(m.stashKey, m.stashBefore); };
    if (m.sideRaw !== null && !putVerified(intlKey(m.id), m.sideRaw)) {
      drop(intlKey(m.id));
      if (putVerified(m.stashKey, m.value)) return false;
      putAside(m.id, "stray", sanitizeWorkspace(parseJson(m.value)));
      return false;
    }
    if (putVerified(bookKey(m.id), m.raw)) { restoreStash(); return true; }
    // Tight storage: the stash copy is 1 character longer than the book key, so freeing it makes room (the copy is in memory).
    drop(m.stashKey);
    if (putVerified(bookKey(m.id), m.raw)) { restoreStash(); return true; }
    drop(bookKey(m.id));
    drop(intlKey(m.id));
    if (putVerified(m.stashKey, m.value)) return false;
    putAside(m.id, "stray", sanitizeWorkspace(parseJson(m.value)));
    return false;
  };
  const fail = (): SwitchResult => {
    // The previous primary is still in WORKSPACE_KEY (it is replaced last, and a failed write leaves it as it was).
    if (get(WORKSPACE_KEY) !== primaryRaw && primaryRaw !== null) putVerified(WORKSPACE_KEY, primaryRaw);
    if (get(intlKey(PRIMARY_BOOK_ID)) !== primarySideRaw) {
      if (primarySideRaw === null) drop(intlKey(PRIMARY_BOOK_ID)); else putVerified(intlKey(PRIMARY_BOOK_ID), primarySideRaw);
    }
    if (ownerBefore === null) drop(OWNER_KEY); else put(OWNER_KEY, ownerBefore);
    // The stash slot: back to what it was only when that write verifies; the merged copy written by this
    // switch contains the old one, so keeping it (with its meta) loses nothing. Meta and payload always agree.
    let keptNewStash = false;
    if (get(STASH_KEY) !== oldPrimaryStash) {
      if (oldPrimaryStash === null) drop(STASH_KEY);
      else if (!putVerified(STASH_KEY, oldPrimaryStash)) keptNewStash = true;
    }
    if (!keptNewStash) { if (oldMeta === null) drop(STASH_V2_KEY); else put(STASH_V2_KEY, oldMeta); }
    const stuck = [...moved].reverse().filter((m) => !putBack(m)).map((m) => m.id);
    const metaNow = parseJson(get(STASH_V2_KEY)) as { ids?: unknown } | null;
    const listed = Array.isArray(metaNow?.ids) ? (metaNow.ids as string[]).filter((id) => get(`${STASH_BOOK_PREFIX}${id}`) !== null) : [];
    if (stuck.length || (metaNow && listed.length !== (metaNow.ids as unknown[]).length)) {
      put(STASH_V2_KEY, JSON.stringify({ owner: previousOwner, at: now, ids: [...new Set([...listed, ...stuck])] }));
    }
    return { ok: false, reason: "storage" };
  };

  // 2. The previous account's extra books, one at a time: write, read back, compare, then remove.
  for (const id of liveBookIds(index)) {
    if (id === PRIMARY_BOOK_ID) continue;
    const raw = get(bookKey(id));
    if (raw === null) continue;
    const sideRaw = get(intlKey(id));
    const joined = sideRaw === null ? null : joinSidecar(id, sanitizeWorkspace(parseJson(raw)));
    const stashKey = `${STASH_BOOK_PREFIX}${id}`;
    const stashBefore = get(stashKey);
    const value = stashBefore !== null
      ? canonicalJson(mergeWorkspaces(sanitizeWorkspace(parseJson(stashBefore)), joined ?? sanitizeWorkspace(parseJson(raw))))
      : joined ? canonicalJson(joined) : raw;
    if (!putVerified(stashKey, value)) {
      if (stashBefore !== null && get(stashKey) !== stashBefore) put(stashKey, stashBefore);
      return fail();
    }
    moved.push({ id, raw, sideRaw: get(intlKey(id)), value, stashKey, stashBefore });
    drop(bookKey(id));
    drop(intlKey(id));
  }
  // 3. The previous primary (merged with the previous account's older stash, which it then contains), verified.
  const primaryStash = merging && oldPrimaryStash !== null ? canonicalJson(mergeWorkspaces(sanitizeWorkspace(parseJson(oldPrimaryStash)), primary)) : canonicalJson(primary);
  const ids = [...new Set([...(merging ? liveBookIds(merging.shelf.index).filter((id) => id !== PRIMARY_BOOK_ID) : []), ...moved.map((m) => m.id)])];
  if (!putVerified(STASH_KEY, primaryStash) || !putVerified(STASH_V2_KEY, JSON.stringify({ owner: previousOwner, at: now, ids }))) return fail();
  // 4. The new owner first, so other tabs stop before they see the new account's primary; then the primary, last
  //    (both its keys: the previous account's sidecar is in the stash now and never stays attached to this account).
  if (!putVerified(OWNER_KEY, newOwner)) return fail();
  drop(intlKey(PRIMARY_BOOK_ID));
  if (!writeBookKeys(PRIMARY_BOOK_ID, newPrimary, true, now)) return fail();
  let nextIndex: BookIndex = { ...emptyIndex(), owner: newOwner };
  saveIndex(nextIndex, true);
  resetSyncMeta(newOwner);

  // 5. The signing-in account's own set-aside copies go back into its books (each verified before its copy goes).
  for (const { asideId, bookId } of returned) {
    const copy = parseJson(get(`${ASIDE_PREFIX}${asideId}`)) as { workspace?: unknown } | null;
    if (!copy?.workspace) continue;
    const ws = sanitizeWorkspace(copy.workspace);
    if (bookId === PRIMARY_BOOK_ID) {
      const current = loadBook(PRIMARY_BOOK_ID) ?? emptyWorkspace();
      if (writeBookKeys(PRIMARY_BOOK_ID, mergeWorkspaces(current, ws), true, now)) drop(`${ASIDE_PREFIX}${asideId}`);
      continue;
    }
    const candidate = addBook(nextIndex, bookId, now);
    if (candidate === nextIndex || get(bookKey(bookId)) !== null) continue;
    if (!writeBookKeys(bookId, ws, true, now)) { drop(bookKey(bookId)); drop(intlKey(bookId)); continue; }
    if (!saveIndex(candidate, true)) { drop(bookKey(bookId)); drop(intlKey(bookId)); continue; }
    nextIndex = candidate;
    drop(`${ASIDE_PREFIX}${asideId}`);
  }
  return { ok: true };
}

/**
 * The index on this device belongs to another account than the one signed in
 * (an older tab switched accounts and left the extra books behind): those books
 * are set aside, never merged into this account. False when storage is too full.
 */
export function setAsideOtherAccountBooks(index: BookIndex, owner: string): boolean {
  for (const id of liveBookIds(index)) {
    if (id === PRIMARY_BOOK_ID) continue;
    const ws = loadBook(id);
    if (ws && !setAside(id, "other_account", ws)) return false;
  }
  saveIndex({ ...emptyIndex(), owner }, true);
  resetSyncMeta(owner);
  return true;
}

/** The account this device's data last synced with (OWNER_KEY). */
export function storedOwner(): string | null {
  return get(OWNER_KEY);
}

/** Another tab moved this device to a different account than the one this tab syncs as. */
export function ownerChangedElsewhere(mine: string | null): boolean {
  const stored = get(OWNER_KEY);
  return Boolean(mine && stored && stored !== mine);
}

// ---------------------------------------------------------------------------
// Backups (§2.3)

type Entry = { id: string; workspace: Workspace };
/** blocked: read-only businesses the backup was meant for; nothing was merged into them. */
export type RestoreDone = { kind: "done"; shelf: Shelf; restored: number; skipped: number; into: string[]; blocked: string[] };
export type RestoreResult =
  | RestoreDone
  /** newBusiness: the backup's business isn't one of this account's; confirming adds it as a new business. */
  | { kind: "confirm"; target: string; active: string; backup: { name: string; upiId: string }; newBusiness?: boolean; apply: () => RestoreDone };

/**
 * { book: primary } → V1 tagged businessId "biz_primary" (old clients restore it into the primary);
 * { book: other } → BookBackup (old clients reject it instead of merging it into the primary);
 * "all" → V2 (every live book, the primary also as `workspace` for old clients) when there is more than one book.
 */
export function backupJson(shelf: Shelf, scope: { book: string } | "all", exportedAt = new Date().toISOString()): string {
  const live = liveBookIds(shelf.index).filter((id) => shelf.books[id]);
  const primary = shelf.books[PRIMARY_BOOK_ID] ?? emptyWorkspace();
  if (scope === "all" && live.length > 1) {
    return JSON.stringify({
      app: "proupiqr-workspace", formatVersion: 2, exportedAt, workspace: primary,
      businesses: live.map((id) => ({ id, workspace: shelf.books[id] })),
    }, null, 2);
  }
  const id = scope === "all" ? PRIMARY_BOOK_ID : scope.book;
  if (id !== PRIMARY_BOOK_ID && shelf.books[id]) {
    return JSON.stringify({ app: "proupiqr-business", formatVersion: 2, exportedAt, businesses: [{ id, workspace: shelf.books[id] }] }, null, 2);
  }
  return JSON.stringify({ app: "proupiqr-workspace", exportedAt, businessId: PRIMARY_BOOK_ID, workspace: primary }, null, 2);
}

function entriesOf(list: unknown): Entry[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: Entry[] = [];
  for (const item of list) {
    const e = item as { id?: unknown; workspace?: unknown } | null;
    if (!e || !isBookId(e.id) || seen.has(e.id) || !e.workspace || typeof e.workspace !== "object") continue;
    seen.add(e.id);
    out.push({ id: e.id, workspace: sanitizeWorkspace(e.workspace) });
  }
  return out;
}

const normUpi = (v: string) => v.trim().toLowerCase();

/**
 * Merges a backup file into the shelf, routed by identity (§2.3); throws on
 * unreadable input. Tagged entries go to the live book with that id; an unknown
 * or deleted id becomes a new book only while `allowNew` and the limit allow it
 * (a deleted id is never revived), else it is skipped. Untagged files (every
 * backup made before this change) go through routeLegacyBackup. A single-book
 * restore into a book other than the active one, or across two different UPI
 * IDs, returns "confirm" instead of merging.
 */
export function restoreBackup(
  shelf: Shelf, text: string, activeId: string, limit: number, now: number, allowNew: boolean = BOOKS_UI, readOnly: ReadonlySet<string> = new Set(),
): RestoreResult {
  const parsed = JSON.parse(text) as { app?: unknown; formatVersion?: unknown; businessId?: unknown; workspace?: unknown; businesses?: unknown };
  let entries: Entry[];
  let tagged = true;
  let all = false;
  if (parsed?.app === "proupiqr-business" && parsed.formatVersion === 2) {
    entries = entriesOf(parsed.businesses).slice(0, 1);
  } else if (parsed?.app === "proupiqr-workspace") {
    const v2 = parsed.formatVersion === 2 ? entriesOf(parsed.businesses) : [];
    if (v2.length) {
      entries = v2;
      all = true;
    } else {
      tagged = isBookId(parsed.businessId);
      entries = [{ id: tagged ? (parsed.businessId as string) : PRIMARY_BOOK_ID, workspace: sanitizeWorkspace(parsed.workspace) }];
    }
  } else {
    throw new Error("Not a Pro UPI QR workspace backup.");
  }
  if (!entries.length) throw new Error("Not a Pro UPI QR workspace backup.");

  const live = new Set(liveBookIds(shelf.index));
  const plan = (input: Shelf): RestoreDone => {
    let index = input.index;
    const books = { ...input.books };
    const into: string[] = [];
    const blocked: string[] = [];
    let skipped = 0;
    for (const entry of entries) {
      let target = entry.id;
      if (!tagged) target = routeLegacyBackup(input, entry.workspace.business, activeId).bookId;
      if (readOnly.has(target)) { blocked.push(target); continue; }
      else if (!live.has(target)) {
        // Unknown or deleted here: a new book with a fresh id (a deleted id is never revived), within the limit.
        if (!allowNew || !canAddBook(index, limit)) { skipped++; continue; }
        target = newBookId();
        index = addBook(index, target, now);
      }
      books[target] = restoreFrom(books[target] ?? emptyWorkspace(now), entry.workspace, now);
      into.push(target);
    }
    return { kind: "done", shelf: { index, books }, restored: into.length, skipped, into, blocked };
  };

  const differs = (entry: Entry, target: string) => {
    const theirs = normUpi(entry.workspace.business.upiId);
    const ours = normUpi(shelf.books[target]?.business.upiId ?? "");
    return theirs !== "" && ours !== "" && theirs !== ours;
  };
  const ask = (entry: Entry, target: string): Extract<RestoreResult, { kind: "confirm" }> =>
    ({ kind: "confirm", target, active: activeId, backup: { name: entry.workspace.business.name, upiId: entry.workspace.business.upiId }, apply: () => plan(shelf) });
  if (!all && entries.length === 1) {
    const entry = entries[0];
    const target = tagged ? (live.has(entry.id) ? entry.id : null) : routeLegacyBackup(shelf, entry.workspace.business, activeId).bookId;
    if (target && readOnly.has(target)) return plan(shelf);
    if (target && (target !== activeId || differs(entry, target))) return ask(entry, target);
    // A single business that isn't one of this account's: adding it is a choice, never silent.
    if (!target && tagged && allowNew && !isTombstoned(shelf.index, entry.id) && canAddBook(shelf.index, limit)) {
      return { ...ask(entry, activeId), newBusiness: true };
    }
  } else if (all) {
    // Every account's first business is biz_primary: a V2 file from another account must not merge into this one silently.
    const foreign = entries.find((entry) => live.has(entry.id) && differs(entry, entry.id));
    if (foreign) return ask(foreign, foreign.id);
  }
  return plan(shelf);
}

// ---------------------------------------------------------------------------
// Generator bridges (§7.5): receipts and invoices from the free generators.

export interface DocumentToTrack {
  merchant: string;
  upiId: string;
  customer: string;
  invoiceNo: string;
  invoiceDate: string;
  dueDate: string;
  totalPaise: number;
  description: string;
}
export type ReceiptToRecord = ReceiptPayment & { merchant: string; upiId: string };
export type PendingDocument = { kind: "receipt"; receipt: ReceiptToRecord } | { kind: "invoice"; doc: DocumentToTrack };

/**
 * The book a document goes into. One live book: the primary, exactly as before.
 * Several: an exact UPI ID, then name match; an unmatched real UPI ID asks the
 * user (only while the business UI is on; otherwise the active book). Never creates a book.
 */
function documentTarget(doc: { upiId: string; merchant: string }): { shelf: Shelf; bookId: string } | { ask: true } {
  const { shelf } = loadShelf();
  if (!shelf.books[PRIMARY_BOOK_ID]) shelf.books[PRIMARY_BOOK_ID] = loadWorkspace();
  const stored = liveBookIds(shelf.index).filter((id) => shelf.books[id]);
  if (stored.length <= 1) return { shelf, bookId: PRIMARY_BOOK_ID };
  const active = loadActiveBook(shelf.index);
  const picked = pickBookForDocument(shelf, doc, active, isValidVpa);
  if ("ask" in picked) return BOOKS_UI ? { ask: true } : { shelf, bookId: active };
  // A read-only business (after a downgrade) takes no new documents: the user picks a writable one.
  if (BOOKS_UI && readOnlyBookIds(shelf.index, cachedPlanLimit(get(OWNER_KEY))).has(picked.bookId)) return { ask: true };
  return { shelf, bookId: picked.bookId };
}

/** Seeds name and UPI ID from the document only when the target book has no name (today's rule). */
function seedBusiness(ws: Workspace, merchant: string, upiId: string, now: number): Workspace {
  if (ws.business.name || !merchant.trim() || merchant === "ABC Solutions") return ws;
  return updateBusiness(ws, { name: merchant.trim().slice(0, 80), upiId: upiId === PLACEHOLDER_VPA ? ws.business.upiId : upiId.trim().slice(0, 100) }, now);
}

function stashPending(pending: PendingDocument): boolean {
  try {
    sessionStorage.setItem(PENDING_DOCUMENT_KEY, JSON.stringify(pending));
    return true;
  } catch {
    return false;
  }
}

/** The generator document waiting for "Which business is this for?", removed once read. */
export function takePendingDocument(): PendingDocument | null {
  try {
    const raw = sessionStorage.getItem(PENDING_DOCUMENT_KEY);
    sessionStorage.removeItem(PENDING_DOCUMENT_KEY);
    const parsed = raw ? (JSON.parse(raw) as PendingDocument) : null;
    return parsed && (parsed.kind === "receipt" || parsed.kind === "invoice") ? parsed : null;
  } catch {
    return null;
  }
}

type ReceiptResult = { appliedPaise: number; entryId: string | null; duplicate: boolean; bookId: string };

/** Records a receipt into one book (the picker's answer). */
export function recordReceiptInto(bookId: string, receipt: ReceiptToRecord, shelf: Shelf = loadShelf().shelf): ReceiptResult | null {
  const now = Date.now();
  const base = bookId === PRIMARY_BOOK_ID ? (shelf.books[bookId] ?? loadWorkspace()) : shelf.books[bookId];
  if (!base || !liveBookIds(shelf.index).includes(bookId)) return null;
  const ws = seedBusiness(base, receipt.merchant, receipt.upiId, now);
  const result = recordReceiptPayment(ws, receipt, localToday(), now);
  if (!result) return null;
  if (result.duplicate) return { appliedPaise: 0, entryId: null, duplicate: true, bookId };
  return saveBook(shelf.index, bookId, result.ws) ? { appliedPaise: result.appliedPaise, entryId: result.entryId, duplicate: false, bookId } : null;
}

/**
 * "Save to payment book" from the receipt generator: settles the client's open
 * invoices (oldest first) and records any rest as a paid entry; see
 * recordReceiptPayment. Seeds the business from the receipt like trackDocument.
 * { pick: true }: the receipt waits in session storage for the user to choose a business.
 */
export function recordReceipt(receipt: ReceiptToRecord): ReceiptResult | { pick: true } | null {
  const target = documentTarget({ upiId: receipt.upiId, merchant: receipt.merchant });
  if ("ask" in target) return stashPending({ kind: "receipt", receipt }) ? { pick: true } : null;
  return recordReceiptInto(target.bookId, receipt, target.shelf);
}

type TrackResult = { invoiceId: string; created: boolean; bookId: string };

/** Adds or updates an invoice from the invoice generator in one book (the picker's answer). */
export function trackDocumentInto(bookId: string, doc: DocumentToTrack, shelf: Shelf = loadShelf().shelf): TrackResult | null {
  const number = doc.invoiceNo.trim().slice(0, 40);
  const customer = doc.customer.trim().slice(0, 80);
  if (!number || !customer || !Number.isSafeInteger(doc.totalPaise) || doc.totalPaise <= 0) return null;
  if (!isIsoDate(doc.invoiceDate)) return null;
  const dueDate = isIsoDate(doc.dueDate) && doc.dueDate >= doc.invoiceDate ? doc.dueDate : doc.invoiceDate;
  const now = Date.now();
  const base = bookId === PRIMARY_BOOK_ID ? (shelf.books[bookId] ?? loadWorkspace()) : shelf.books[bookId];
  if (!base || !liveBookIds(shelf.index).includes(bookId)) return null;
  const several = liveBookIds(shelf.index).filter((id) => shelf.books[id]).length > 1;
  let ws = seedBusiness(base, doc.merchant, doc.upiId, now);
  let client = findClient(ws, customer, "");
  if (!client) {
    client = { id: newId("cli"), name: customer, phone: "", email: "", gstin: "", createdAt: now, updatedAt: now };
    ws = upsertClient(ws, client, now);
  }
  // With several businesses, a document from another UPI ID never overwrites this book's invoice of the same number.
  const docUpi = normUpi(doc.upiId);
  const foreign = several && docUpi !== "" && docUpi !== PLACEHOLDER_VPA && docUpi !== normUpi(ws.business.upiId);
  // Matched among INR invoices only (liveInvoices): the generator bridge never touches a foreign-currency invoice.
  const existing = foreign ? undefined : liveInvoices(ws).find((i) => i.number.trim().toLowerCase() === number.toLowerCase());
  const invoiceId = existing?.id ?? newId("inv");
  ws = upsertInvoice(ws, {
    ...existing,
    id: invoiceId,
    number,
    clientId: client.id,
    issueDate: doc.invoiceDate,
    dueDate,
    amountPaise: doc.totalPaise,
    description: existing?.description || doc.description.trim().slice(0, 300),
    payments: existing?.payments ?? [],
    reminders: existing?.reminders ?? [],
    voided: existing?.voided ?? false,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }, now);
  return saveBook(shelf.index, bookId, ws) ? { invoiceId, created: !existing, bookId } : null;
}

/**
 * "Track payment" from the invoice generator: adds (or updates, matched by
 * invoice number) an invoice in the right book. Payments already recorded
 * against that invoice are kept. Returns null if the document is unusable.
 */
export function trackDocument(doc: DocumentToTrack): TrackResult | { pick: true } | null {
  const target = documentTarget({ upiId: doc.upiId, merchant: doc.merchant });
  if ("ask" in target) return stashPending({ kind: "invoice", doc }) ? { pick: true } : null;
  return trackDocumentInto(target.bookId, doc, target.shelf);
}

/**
 * Where the generator sends the user after saving. With several businesses on this device (and the business UI
 * on) the URL names the business the document went into, the first one included, so /app/ opens that one and
 * not the last-used one. One business: the base URL, as before.
 */
export function workspaceReturnUrl(base: string, result: { bookId: string } | { pick: true }): string {
  if ("pick" in result) return "/app/?pick=document";
  if (!BOOKS_UI || !isBookId(result.bookId)) return base;
  const stored = liveBookIds(loadIndex()).filter((id) => id === PRIMARY_BOOK_ID || get(bookKey(id)) !== null);
  if (stored.length <= 1) return base;
  return `${base}${base.includes("?") ? "&" : "?"}business=${encodeURIComponent(result.bookId)}`;
}
