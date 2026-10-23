import { canonicalJson, newId, viewInvoice, type Workspace } from "./model.ts";

/**
 * Several businesses per payments workspace: one book (today's v1 `Workspace`)
 * per business, listed by a small book index. Pure functions, no DOM, no
 * storage; Node-importable (imports only ./model.ts, with .ts extensions).
 *
 * The index is add-once and delete-final, stamped by the server's clock: there
 * is no last-writer-wins clock on entries, a tombstone always beats a live
 * entry, and a deleted id never becomes live again (a restore gets a new id).
 * See docs/spec-multi-business.md §1.
 */

/** The existing workspace. The same id on every device, so offline devices converge. */
export const PRIMARY_BOOK_ID = "biz_primary";
/** "biz_primary" matches too. */
export const BOOK_ID_RE = /^biz_[A-Za-z0-9]{6,40}$/;
/** Index entries (live + tombstones). Live entries and unpurged tombstones are never evicted. */
export const MAX_BOOK_ENTRIES = 64;
/** Server-only list of purged, evicted tombstone ids. */
export const MAX_DELETED_IDS = 1000;
/** Generator placeholder UPI ID; never a reason to ask which business a document is for. */
const PLACEHOLDER_VPA = "merchant@upi";

export interface BookMeta {
  id: string;
  /** Epoch ms, stamped by the server on registration; primary = 0. */
  createdAt: number;
  /** Tombstone, stamped by the server; final. 0 is a tombstone too. */
  deletedAt?: number;
  /** Server only: cleanup of the book's KV data confirmed. */
  purgedAt?: number;
}

export interface BookIndex {
  v: 1;
  /** Local copies only: the account this index last synced with (absent = guest). */
  owner?: string;
  books: Record<string, BookMeta>;
  /** Stored server copy only: ids whose tombstones were evicted, oldest first; never sent by clients. */
  deleted?: string[];
}

/** All books held by one browser. books: live ids that are stored on this device. */
export interface Shelf {
  index: BookIndex;
  books: Record<string, Workspace>;
}

// ---------------------------------------------------------------------------
// Ids and the index

export function newBookId(): string {
  return newId("biz");
}

export const isBookId = (value: unknown): value is string => typeof value === "string" && BOOK_ID_RE.test(value);

const isTomb = (meta: BookMeta | undefined): boolean => meta !== undefined && meta.deletedAt !== undefined;
const primaryMeta = (): BookMeta => ({ id: PRIMARY_BOOK_ID, createdAt: 0 });

export function emptyIndex(): BookIndex {
  return { v: 1, books: { [PRIMARY_BOOK_ID]: primaryMeta() } };
}

const OWNER_RE = /^[a-f0-9]{32}$/;
const stamp = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;

function toObject(raw: unknown): Record<string, unknown> | null {
  const value = typeof raw === "string" ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw;
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/** Books object with keys sorted, so equal indexes serialize identically. */
function sortedBooks(books: Record<string, BookMeta>): Record<string, BookMeta> {
  return Object.fromEntries(Object.keys(books).sort().map((id) => [id, books[id]]));
}

function cleanMeta(id: string, raw: unknown): BookMeta | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r.id !== undefined && r.id !== id) return null;
  const meta: BookMeta = { id, createdAt: stamp(r.createdAt) ?? 0 };
  const deletedAt = stamp(r.deletedAt);
  if (deletedAt !== undefined) {
    meta.deletedAt = deletedAt;
    const purgedAt = stamp(r.purgedAt);
    if (purgedAt !== undefined) meta.purgedAt = purgedAt;
  }
  return meta;
}

/**
 * Any value → a valid index: bad ids and entries dropped, the primary re-added
 * (createdAt 0, never tombstoned), `deleted` de-duplicated and capped, then capBookIndex
 * (evicted ids are appended to `deleted`).
 */
export function sanitizeBookIndex(raw: unknown): BookIndex {
  const r = toObject(raw) ?? {};
  const rawBooks = toObject(r.books) ?? {};
  const books: Record<string, BookMeta> = {};
  for (const [id, value] of Object.entries(rawBooks)) {
    if (!isBookId(id) || id === PRIMARY_BOOK_ID) continue;
    const meta = cleanMeta(id, value);
    if (meta) books[id] = meta;
  }
  books[PRIMARY_BOOK_ID] = primaryMeta();
  const index: BookIndex = { v: 1, books: sortedBooks(books) };
  if (typeof r.owner === "string" && OWNER_RE.test(r.owner)) index.owner = r.owner;
  if (Array.isArray(r.deleted)) {
    const seen = new Set<string>();
    const deleted = r.deleted.filter((id): id is string => {
      if (!isBookId(id) || id === PRIMARY_BOOK_ID || seen.has(id) || books[id]) return false;
      seen.add(id);
      return true;
    });
    index.deleted = deleted.slice(-MAX_DELETED_IDS);
  }
  // Evicted tombstones move to `deleted`, so a deleted id can never come back as live.
  const { index: capped, evicted } = capBookIndex(index);
  if (evicted.length) capped.deleted = [...(index.deleted ?? []), ...evicted].slice(-MAX_DELETED_IDS);
  return capped;
}

/** A stored or received index (JSON string or object, like cloud.ts parseStored); null when it can't be read. */
export function parseBookIndex(raw: unknown): BookIndex | null {
  const r = toObject(raw);
  if (!r || r.v !== 1 || !toObject(r.books)) return null;
  return sanitizeBookIndex(r);
}

/**
 * Keeps the index at MAX_BOOK_ENTRIES by evicting purged tombstones, oldest
 * deletedAt first (then id). Never evicts a live entry or a tombstone whose
 * cleanup isn't confirmed (§3.2 step 3), so it may stay above the cap until then.
 */
export function capBookIndex(index: BookIndex): { index: BookIndex; evicted: string[] } {
  const ids = Object.keys(index.books);
  const excess = ids.length - MAX_BOOK_ENTRIES;
  if (excess <= 0) return { index, evicted: [] };
  const evicted = ids
    .map((id) => index.books[id])
    .filter((meta) => isTomb(meta) && meta.purgedAt !== undefined && meta.id !== PRIMARY_BOOK_ID)
    .sort((a, b) => (a.deletedAt as number) - (b.deletedAt as number) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, excess)
    .map((meta) => meta.id);
  if (!evicted.length) return { index, evicted };
  const drop = new Set(evicted);
  const books = Object.fromEntries(Object.entries(index.books).filter(([id]) => !drop.has(id)));
  return { index: { ...index, books }, evicted };
}

const minDefined = (a: number | undefined, b: number | undefined) => (a === undefined ? b : b === undefined ? a : Math.min(a, b));
const maxDefined = (a: number | undefined, b: number | undefined) => (a === undefined ? b : b === undefined ? a : Math.max(a, b));

/**
 * Cross-tab / local merge, commutative: union of ids; a tombstone wins;
 * createdAt = min; deletedAt = min; purgedAt = max. Callers compare owners
 * first (a different owner is an account switch, never a merge); differing
 * owners give no owner. `deleted` is server-only and is not carried.
 */
export function mergeBookIndex(a: BookIndex, b: BookIndex): BookIndex {
  const books: Record<string, BookMeta> = {};
  for (const id of new Set([...Object.keys(a.books), ...Object.keys(b.books)])) {
    const x = a.books[id];
    const y = b.books[id];
    const meta: BookMeta = { id, createdAt: minDefined(x?.createdAt, y?.createdAt) ?? 0 };
    const deletedAt = minDefined(x?.deletedAt, y?.deletedAt);
    if (deletedAt !== undefined && id !== PRIMARY_BOOK_ID) {
      meta.deletedAt = deletedAt;
      const purgedAt = maxDefined(x?.purgedAt, y?.purgedAt);
      if (purgedAt !== undefined) meta.purgedAt = purgedAt;
    }
    books[id] = meta;
  }
  books[PRIMARY_BOOK_ID] = primaryMeta();
  const merged: BookIndex = { v: 1, books: sortedBooks(books) };
  const owner = a.owner === b.owner ? a.owner : a.owner === undefined ? b.owner : b.owner === undefined ? a.owner : undefined;
  if (owner !== undefined) merged.owner = owner;
  return merged;
}

/**
 * The server's merge of a client's index (§3.2). Both inputs sanitized.
 * - ids the server knows keep the server's entry; a server-live id that arrives
 *   as a tombstone gets deletedAt = now (the incoming deletedAt is ignored);
 * - incoming live ids unknown to the server are `added` with createdAt = now;
 * - incoming live ids in server.deleted come back in `deleted` (the reply
 *   returns them as tombstones; they are never revived);
 * - incoming tombstones of ids the server never registered hold no server data and are ignored;
 * - ids absent from incoming are unchanged: absence never deletes;
 * - removed = live(server) − live(merged).
 */
export function applyIncomingIndex(server: BookIndex, incoming: BookIndex, now: number): {
  merged: BookIndex; added: string[]; removed: string[]; deleted: string[];
} {
  const books: Record<string, BookMeta> = { ...server.books };
  if (!books[PRIMARY_BOOK_ID]) books[PRIMARY_BOOK_ID] = primaryMeta();
  const gone = new Set(server.deleted ?? []);
  const added: string[] = [];
  const deleted: string[] = [];
  for (const id of Object.keys(incoming.books).sort()) {
    const mine = books[id];
    const theirs = incoming.books[id];
    if (mine) {
      if (!isTomb(mine) && isTomb(theirs) && id !== PRIMARY_BOOK_ID) books[id] = { id, createdAt: mine.createdAt, deletedAt: now };
    } else if (!isTomb(theirs)) {
      if (gone.has(id)) deleted.push(id);
      else if (isBookId(id)) {
        books[id] = { id, createdAt: now };
        added.push(id);
      }
    }
  }
  const merged: BookIndex = { ...server, books: sortedBooks(books) };
  const stillLive = new Set(liveBookIds(merged));
  const removed = liveBookIds(server).filter((id) => !stillLive.has(id));
  return { merged, added, removed, deleted };
}

/** Live ids in rank order: primary first, then createdAt asc, then id asc. */
export function liveBookIds(index: BookIndex): string[] {
  return Object.values(index.books)
    .filter((meta) => !isTomb(meta))
    .sort((a, b) => {
      if (a.id === PRIMARY_BOOK_ID || b.id === PRIMARY_BOOK_ID) return a.id === PRIMARY_BOOK_ID ? -1 : 1;
      return a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    })
    .map((meta) => meta.id);
}

/** Position in liveBookIds, -1 if not live. Books ranked at or past the plan limit are the extra ones. */
export function bookRank(index: BookIndex, id: string): number {
  return liveBookIds(index).indexOf(id);
}

/** A tombstone entry, or an evicted id in the server's `deleted` list. */
export function isTombstoned(index: BookIndex, id: string): boolean {
  return isTomb(index.books[id]) || (index.deleted ?? []).includes(id);
}

/** Registers a new id. No-op for invalid ids, the primary, and any id already known (live, tombstoned or deleted). */
export function addBook(index: BookIndex, id: string, now: number): BookIndex {
  if (!isBookId(id) || id === PRIMARY_BOOK_ID || index.books[id] || (index.deleted ?? []).includes(id)) return index;
  return { ...index, books: sortedBooks({ ...index.books, [id]: { id, createdAt: now } }) };
}

/** Tombstones a live id. No-op for the primary (it can't be deleted), unknown ids and existing tombstones. */
export function deleteBook(index: BookIndex, id: string, now: number): BookIndex {
  const meta = index.books[id];
  if (id === PRIMARY_BOOK_ID || !meta || isTomb(meta)) return index;
  return { ...index, books: { ...index.books, [id]: { id, createdAt: meta.createdAt, deletedAt: now } } };
}

export function canAddBook(index: BookIndex, limit: number): boolean {
  return liveBookIds(index).length < limit;
}

/**
 * Plan check on additions only: keeps added ids in rank order while the live
 * count stays within `limit` and drops the rest from the index. Books that
 * were already live are never touched, even above the limit (downgrade).
 */
export function capAdditions(merged: BookIndex, added: string[], limit: number): { index: BookIndex; rejected: string[] } {
  const isAdded = new Set(added);
  const live = liveBookIds(merged);
  let room = limit - live.filter((id) => !isAdded.has(id)).length;
  const rejected: string[] = [];
  for (const id of live) {
    if (!isAdded.has(id)) continue;
    if (room > 0) room--;
    else rejected.push(id);
  }
  if (!rejected.length) return { index: merged, rejected };
  const drop = new Set(rejected);
  return { index: { ...merged, books: Object.fromEntries(Object.entries(merged.books).filter(([id]) => !drop.has(id))) }, rejected };
}

// ---------------------------------------------------------------------------
// Pay-link keys: the primary keeps bare subjects (byte-identical to today);
// other books qualify them as "<bookId>/<subject>".

/** primary → subject (legacy); else `${bookId}/${subject}`. Throws on an invalid id or a subject containing "/". */
export function linkKey(bookId: string, subject: string): string {
  if (!isBookId(bookId)) throw new RangeError("Invalid business id.");
  if (!subject || subject.includes("/")) throw new RangeError("Invalid pay-link subject.");
  return bookId === PRIMARY_BOOK_ID ? subject : `${bookId}/${subject}`;
}

/**
 * No "/" → the primary book. A prefix that isn't a valid non-primary book id
 * gives bookId "" (matches no book), so a malformed key never aliases a primary subject.
 */
export function parseLinkKey(key: string): { bookId: string; subject: string } {
  const slash = key.indexOf("/");
  if (slash < 0) return { bookId: PRIMARY_BOOK_ID, subject: key };
  const bookId = key.slice(0, slash);
  const subject = key.slice(slash + 1);
  return isBookId(bookId) && bookId !== PRIMARY_BOOK_ID && subject !== "" && !subject.includes("/")
    ? { bookId, subject }
    : { bookId: "", subject: key };
}

/** The one lookup of a pay-link map by book and subject; never another book's entry. */
export function linkFor<T>(byKey: Record<string, T> | undefined, bookId: string, subject: string): T | undefined {
  if (!byKey || !isBookId(bookId) || !subject || subject.includes("/")) return undefined;
  const key = linkKey(bookId, subject);
  return Object.prototype.hasOwnProperty.call(byKey, key) ? byKey[key] : undefined;
}

// ---------------------------------------------------------------------------
// Routing documents and backups to a book

const norm = (value: string) => value.trim().toLowerCase();

/** Live ids stored on this device, in rank order. */
function storedLive(shelf: Shelf): string[] {
  return liveBookIds(shelf.index).filter((id) => shelf.books[id] !== undefined);
}

function matchBook(shelf: Shelf, ids: string[], activeId: string, upiId: string, name: string): string | null {
  const prefer = (found: string[]) => (found.includes(activeId) ? activeId : found[0]);
  const upi = norm(upiId);
  if (upi) {
    const found = ids.filter((id) => norm(shelf.books[id].business.upiId) === upi);
    if (found.length) return prefer(found);
  }
  const wanted = name.trim();
  if (wanted) {
    const found = ids.filter((id) => shelf.books[id].business.name.trim() === wanted);
    if (found.length) return prefer(found);
  }
  return null;
}

/**
 * Which book a generator document (receipt / invoice) belongs to: an exact UPI
 * ID match (trimmed, lower-case), then an exact name match. With several books
 * and no match, a real VPA asks the user; an empty, invalid or placeholder UPI
 * ID uses the active book. Never creates a book.
 */
export function pickBookForDocument(
  shelf: Shelf,
  doc: { upiId: string; merchant: string },
  activeId: string,
  validVpa: (v: string) => boolean,
): { bookId: string } | { ask: true } {
  const ids = storedLive(shelf);
  const fallback = ids.includes(activeId) ? activeId : PRIMARY_BOOK_ID;
  if (ids.length <= 1) return { bookId: ids[0] ?? fallback };
  const match = matchBook(shelf, ids, activeId, doc.upiId, doc.merchant);
  if (match) return { bookId: match };
  const upi = doc.upiId.trim();
  if (upi && norm(upi) !== PLACEHOLDER_VPA && validVpa(upi)) return { ask: true };
  return { bookId: fallback };
}

/**
 * Target book for an untagged (pre-multi-business) V1 backup: matching UPI ID,
 * then exact name, else the active book. `confirm` when the target isn't the
 * active book, or both UPI IDs are set and differ: nothing merges silently across businesses.
 */
export function routeLegacyBackup(shelf: Shelf, business: { upiId: string; name: string }, activeId: string): { bookId: string; confirm: boolean } {
  const ids = storedLive(shelf);
  const fallback = ids.includes(activeId) ? activeId : PRIMARY_BOOK_ID;
  const bookId = matchBook(shelf, ids, activeId, business.upiId, business.name) ?? fallback;
  const theirs = norm(business.upiId);
  const ours = norm(shelf.books[bookId]?.business.upiId ?? "");
  return { bookId, confirm: bookId !== activeId || (theirs !== "" && ours !== "" && theirs !== ours) };
}

/**
 * Tokens of invoice pay links that can be turned off as "paid": the invoice is
 * missing, deleted, void or fully paid in its own book. Only books in `synced`
 * that are live and stored on this device count; statement links never do.
 */
export function paidLinkTokens(links: Record<string, { token: string }>, shelf: Shelf, synced: Set<string>, today: string): string[] {
  const live = new Set(liveBookIds(shelf.index));
  const tokens: string[] = [];
  for (const [key, link] of Object.entries(links)) {
    const { bookId, subject } = parseLinkKey(key);
    const ws = shelf.books[bookId];
    if (!bookId || !synced.has(bookId) || !live.has(bookId) || !ws || subject.startsWith("stmt:")) continue;
    const invoice = Object.prototype.hasOwnProperty.call(ws.invoices, subject) ? ws.invoices[subject] : undefined;
    if (!invoice || invoice.deletedAt !== undefined || viewInvoice(invoice, ws.clients, today).balancePaise === 0) tokens.push(link.token);
  }
  return tokens;
}

// ---------------------------------------------------------------------------
// Hashes for the sync skip check

/** 32-bit FNV-1a over UTF-16 code units, as 8 hex digits. */
export function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function bookHash(ws: Workspace): string {
  return fnv1a(canonicalJson(ws));
}

/** canonicalJson of { index, books }: equal shelves serialize identically. */
export function shelfCanonical(shelf: Shelf): string {
  return canonicalJson({ index: shelf.index, books: shelf.books } as unknown as Workspace);
}
