import {
  deleteAllCloud, publicIndex, readBookIndex, readWorkspace, slotFor, sweepDeletedBooks, syncBookIndex, syncWorkspace, unpurgedIds,
  type BookStores, type CloudStore,
} from "./cloud.ts";
import { BOOK_ID_RE, bookRank, isTombstoned, linkKey, liveBookIds, PRIMARY_BOOK_ID, sanitizeBookIndex, type BookIndex } from "./books.ts";
import { bookProjection, type ProjectionStore } from "./digest.ts";
import { createPaylink, createStatementLink, refreshViews, type PaylinkStore } from "./paylinks.ts";
import { PLANS, type Plan } from "./entitlements.ts";
import type { MetricName } from "../metricsCore.ts";

/**
 * Request logic of the multi-business routes (docs/spec-multi-business.md §3.3,
 * §4.3), after authentication, CSRF and body parsing, which stay in the route
 * files. Stores, the strict plan lookup, the clock and metrics are injected, so
 * Node tests run every branch against memory stores.
 *
 * Non-primary books only: the primary keeps /api/v1/workspace/ and
 * /api/v1/paylinks/, unchanged for existing clients.
 */

export interface BooksDeps extends BookStores {
  docs: CloudStore;
  books: CloudStore;
  projections: ProjectionStore;
  paylinks: PaylinkStore;
  /** planForStrict: rethrows billing-store errors (a KV blip must never read as Free). */
  plan(owner: string): Promise<Plan>;
  now(): number;
  metric(name: MetricName, by?: number): Promise<void>;
}

export interface ApiResult {
  status: number;
  body: Record<string, unknown>;
}

const UNAVAILABLE = "Sync is unavailable right now. Your data is safe on this device.";
const res = (status: number, body: Record<string, unknown>): ApiResult => ({ status, body });
const ID_RE = /^inv_[A-Za-z0-9]{6,40}$/;
const CLIENT_RE = /^cli_[A-Za-z0-9]{6,40}$/;

/** expectedOwner, when sent, must be the signed-in account's owner (a tab still signed in as A never writes with B's session). */
export function ownerMismatch(body: Record<string, unknown>, owner: string): ApiResult | null {
  if (!("expectedOwner" in body) || body.expectedOwner === undefined || body.expectedOwner === owner) return null;
  return res(409, { error: "This tab belongs to another account. Reload the page.", code: "owner_mismatch" });
}

/** The /books/<id>/ routes take only valid non-primary ids. */
export function badBookId(id: unknown): ApiResult | null {
  if (typeof id !== "string" || !BOOK_ID_RE.test(id) || id === PRIMARY_BOOK_ID) return res(400, { error: "Unknown business.", code: "invalid_business" });
  return null;
}

/** The index must list the id as live: absent → 404, tombstoned → 410 (a 404 or 410 never deletes anything on a device). */
function notLive(index: BookIndex, id: string): ApiResult | null {
  if (liveBookIds(index).includes(id)) return null;
  if (isTombstoned(index, id)) return res(410, { error: "This business was deleted.", code: "business_deleted" });
  return res(404, { error: "This business isn't registered with your account yet.", code: "unknown_business" });
}

async function liveIndex(d: BooksDeps, owner: string, id: string): Promise<{ index: BookIndex } | ApiResult> {
  const current = await readBookIndex(d.books, owner);
  if (current === "corrupt") return res(503, { error: UNAVAILABLE });
  return notLive(current.index, id) ?? { index: current.index };
}

/**
 * Downgrade = read-only (owner decision 2026-10-18): books ranked past
 * PLANS.free.businesses take no writes and no new links unless the strict plan
 * allows them (paid Pro, or a trial up to TRIAL_BUSINESSES). The first business never reads billing here.
 */
async function readOnly(d: BooksDeps, owner: string, index: BookIndex, id: string): Promise<{ plan: Plan | null } | ApiResult> {
  const rank = bookRank(index, id);
  if (rank < PLANS.free.businesses) return { plan: null };
  let plan: Plan;
  try {
    plan = await d.plan(owner);
  } catch {
    return res(503, { error: "Couldn't check your plan right now. Try again shortly." });
  }
  if (rank >= plan.businesses) {
    return res(402, { error: "This business is read-only on the Free plan. Upgrade to edit it again.", code: "plan_read_only" });
  }
  return { plan };
}

async function indexReply(d: BooksDeps, owner: string, index: BookIndex, plan?: Plan | null): Promise<Record<string, unknown>> {
  const live = liveBookIds(index);
  const revList = await d.docs.revs(live.map((id) => slotFor(owner, id)));
  const revs = Object.fromEntries(live.map((id, i) => [id, revList[i] ?? 0]));
  const known = plan !== undefined ? plan : await d.plan(owner).catch(() => null);
  return { index: publicIndex(index), revs, owner, plan: known ? { id: known.id, businesses: known.businesses } : null };
}

/** GET /api/v1/workspace/books/: the index (after retrying any unfinished cleanup), revisions per live book, the plan or null. */
export async function getBookIndex(d: BooksDeps, owner: string): Promise<ApiResult> {
  const current = await readBookIndex(d.books, owner);
  if (current === "corrupt") return res(503, { error: UNAVAILABLE });
  let index = current.index;
  const unpurged = unpurgedIds(index);
  if (unpurged.length) index = (await sweepDeletedBooks(d, owner, unpurged, d.now()).catch(() => null)) ?? index;
  return res(200, await indexReply(d, owner, index));
}

/**
 * PUT /api/v1/workspace/books/ { index, expectedOwner }. consumeAdd(units) is the
 * 60-adds-per-day budget: it is charged one unit per business the request would
 * add (live ids the stored index doesn't know), all or nothing, and the request is
 * refused (429) when the remaining budget can't cover them.
 */
export async function putBookIndex(d: BooksDeps, owner: string, body: Record<string, unknown>, consumeAdd: (units: number) => Promise<boolean>): Promise<ApiResult> {
  const mismatch = ownerMismatch(body, owner);
  if (mismatch) return mismatch;
  if (!body.index || typeof body.index !== "object" || Array.isArray(body.index)) return res(400, { error: "index required." });
  const incoming = sanitizeBookIndex(body.index);
  const current = await readBookIndex(d.books, owner);
  if (current === "corrupt") return res(503, { error: UNAVAILABLE });
  const known = new Set([...Object.keys(current.index.books), ...(current.index.deleted ?? [])]);
  const adding = liveBookIds(incoming).filter((id) => !known.has(id)).length;
  if (adding > 0 && !(await consumeAdd(adding))) {
    return res(429, { error: "Too many businesses added today. Try again tomorrow." });
  }
  let plan: Plan | undefined;
  let result;
  try {
    result = await syncBookIndex(d.books, owner, incoming, d.now(), async () => (plan = await d.plan(owner)).businesses);
  } catch {
    return res(503, { error: "Couldn't check your plan right now. Try again shortly." });
  }
  if (result.status === "corrupt") return res(503, { error: UNAVAILABLE });
  if (result.status === "conflict") return res(409, { error: "Another device is syncing. Retrying shortly." });
  let index = result.index;
  if (result.unpurged.length) index = (await sweepDeletedBooks(d, owner, result.unpurged, d.now()).catch(() => null)) ?? index;
  if (result.added.length) await d.metric("business_added", result.added.length).catch(() => undefined);
  if (result.rejected.length) await d.metric("business_limit").catch(() => undefined);
  const reply = await indexReply(d, owner, index, plan);
  // Ids this account deleted long ago come back as tombstones, so the device removes them.
  const books = (reply.index as BookIndex).books;
  for (const id of result.deleted) books[id] = { id, createdAt: 0, deletedAt: 0 };
  return res(200, { ...reply, rejected: result.rejected, ...(result.rejected.length ? { code: "business_limit" } : {}) });
}

/** GET /api/v1/workspace/books/<id>/ */
export async function getBook(d: BooksDeps, owner: string, id: string): Promise<ApiResult> {
  const bad = badBookId(id);
  if (bad) return bad;
  const live = await liveIndex(d, owner, id);
  if ("status" in live) return live;
  const { workspace, rev } = await readWorkspace(d.docs, slotFor(owner, id));
  return res(200, { workspace, rev, owner, businessId: id });
}

/**
 * PUT /api/v1/workspace/books/<id>/ { workspace, expectedOwner }. After the
 * write and its derived data, the index is read again: if the book was deleted
 * (or unregistered) meanwhile, every write of this request is undone.
 */
export async function putBook(d: BooksDeps, owner: string, id: string, body: Record<string, unknown>): Promise<ApiResult> {
  const bad = badBookId(id) ?? ownerMismatch(body, owner);
  if (bad) return bad;
  const live = await liveIndex(d, owner, id);
  if ("status" in live) return live;
  const gate = await readOnly(d, owner, live.index, id);
  if ("status" in gate) return gate;
  const slot = slotFor(owner, id);
  const result = await syncWorkspace(d.docs, slot, body.workspace, d.now());
  if (result.status === "too_large") {
    return res(413, { error: "This business is too large to sync. Export old invoices to CSV and delete them, then try again." });
  }
  if (result.status === "conflict") return res(409, { error: "Another device is syncing. Retrying shortly." });
  await d.projections.put(owner, id, bookProjection(result.workspace)).catch(() => undefined);
  const viewed = await refreshViews(d.paylinks, owner, id, result.workspace).catch((): string[] => []);
  const after = await readBookIndex(d.books, owner);
  if (after === "corrupt") return res(503, { error: UNAVAILABLE });
  const gone = notLive(after.index, id);
  if (gone) {
    await d.docs.removeDocs([slot]);
    await d.projections.drop(owner, id);
    await d.paylinks.removeBook(owner, id);
    // Snapshots this request wrote after the delete's cleanup ran are no longer listed in pl:own.
    if (viewed.length) await d.paylinks.patchViews(owner, {}, viewed);
    return gone;
  }
  await d.metric("sync").catch(() => undefined);
  return res(200, { workspace: result.workspace, rev: result.rev, owner, businessId: id });
}

/** POST /api/v1/paylinks/books/<id>/ { invoiceId | clientId, expectedOwner }: a pay or statement link in a non-primary book. */
export async function createBookLink(
  d: BooksDeps,
  owner: string,
  id: string,
  body: Record<string, unknown>,
  newToken: () => string,
  validVpa: (vpa: string) => boolean,
): Promise<ApiResult> {
  const bad = badBookId(id) ?? ownerMismatch(body, owner);
  if (bad) return bad;
  const isStatement = typeof body.clientId === "string";
  if (isStatement ? !CLIENT_RE.test(body.clientId as string) : (typeof body.invoiceId !== "string" || !ID_RE.test(body.invoiceId))) {
    return res(400, { error: isStatement ? "Unknown client." : "Unknown invoice." });
  }
  const live = await liveIndex(d, owner, id);
  if ("status" in live) return live;
  const gate = await readOnly(d, owner, live.index, id);
  if ("status" in gate) return gate;
  const plan = gate.plan ?? (await d.plan(owner).catch(() => PLANS.free));
  const { workspace } = await readWorkspace(d.docs, slotFor(owner, id));
  const subject = isStatement ? `stmt:${body.clientId as string}` : (body.invoiceId as string);
  const key = linkKey(id, subject);
  const now = d.now();
  const result = isStatement
    ? await createStatementLink(d.paylinks, owner, workspace, body.clientId as string, newToken, now, plan, validVpa, key)
    : await createPaylink(d.paylinks, owner, workspace, body.invoiceId as string, newToken, now, plan.activePaylinks, validVpa, key);
  if (result.status !== "ok") return res(result.status === "limit" || result.status === "not_pro" ? 402 : 409, { error: result.message, code: result.status });
  let viewed: string[] = [];
  if (result.created) {
    await d.metric("paylink_created").catch(() => undefined);
    viewed = await refreshViews(d.paylinks, owner, id, workspace).catch((): string[] => []);
  }
  // A link can't outlive a concurrent delete of its business, and neither can a snapshot this request wrote.
  const after = await readBookIndex(d.books, owner);
  const gone = after === "corrupt" ? null : notLive(after.index, id);
  if (gone) {
    if (result.created) await d.paylinks.remove(owner, result.token, key);
    await d.paylinks.removeBook(owner, id);
    if (viewed.length) await d.paylinks.patchViews(owner, {}, viewed);
    return gone;
  }
  return res(result.created ? 201 : 200, { token: result.token, created: result.created });
}

/** DELETE /api/v1/workspace/: the cloud copy of every book (see deleteAllCloud). */
export async function deleteCloudCopy(d: BooksDeps, owner: string): Promise<ApiResult> {
  await deleteAllCloud(d, owner, d.now());
  return res(200, { ok: true });
}
