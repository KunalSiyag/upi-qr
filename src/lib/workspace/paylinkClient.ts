import { authedFetch } from "./sync.ts";
import { isBookId, parseLinkKey, PRIMARY_BOOK_ID } from "./books.ts";
import type { PaylinkClaim } from "./paylinks.ts";

/** Browser client for /api/v1/paylinks/ (the primary business) and /api/v1/paylinks/books/<id>/ (other businesses). */

export interface ClientPaylink {
  token: string;
  claims: PaylinkClaim[];
  /** The business the link belongs to, from its key ("<bookId>/<subject>"; bare = the primary). */
  bookId: string;
}

export interface PaylinkList {
  /** Keyed by the store key: the bare subject for the primary, "<bookId>/<subject>" otherwise. Read it through linkFor(). */
  byInvoice: Record<string, ClientPaylink>;
  plan: { id: string; activePaylinks: number; used: number; statementLinks?: boolean; businesses?: number } | null;
}

/** Who is asking: expectedOwner for the owner check, and whether the server has the books routes. */
export interface LinkContext {
  expectedOwner?: string | null;
  /** Legacy server (no books routes): links for other businesses are never requested. */
  legacy?: boolean;
}

export function paylinkUrl(token: string): string {
  return `${location.origin}/i/${token}/`;
}

export async function fetchPaylinks(): Promise<PaylinkList | null> {
  try {
    // intl=1: this client resolves foreign-currency invoices, so the server lists their links too (§1.7).
    const response = await authedFetch("/api/v1/paylinks/?books=1&intl=1", "GET");
    if (!response.ok) return null;
    const body = await response.json() as { links: { invoiceId: string; token: string; claims: PaylinkClaim[] }[]; plan: PaylinkList["plan"] };
    // An old server ignores ?books=1; the keys alone still tell which business a link belongs to.
    return {
      byInvoice: Object.fromEntries(body.links.map((l) => [l.invoiceId, { token: l.token, claims: l.claims, bookId: parseLinkKey(l.invoiceId).bookId }])),
      plan: body.plan,
    };
  } catch {
    return null;
  }
}

function linkRoute(bookId: string, ctx: LinkContext): string | null {
  if (bookId === PRIMARY_BOOK_ID) return "/api/v1/paylinks/";
  if (!isBookId(bookId) || ctx.legacy) return null;
  return `/api/v1/paylinks/books/${bookId}/`;
}

async function createLink(
  body: { invoiceId: string } | { clientId: string },
  bookId: string,
  ctx: LinkContext,
  failMessage: string,
  offlineMessage: string,
): Promise<{ token: string } | { error: string; code?: string }> {
  const route = linkRoute(bookId, ctx);
  if (!route) return { error: failMessage, code: "unavailable" };
  try {
    const response = await authedFetch(route, "POST", { ...body, ...(ctx.expectedOwner ? { expectedOwner: ctx.expectedOwner } : {}) });
    const reply = await response.json().catch(() => ({}));
    if (!response.ok) {
      // Calm, translatable messages for the multi-business answers; the server's text otherwise.
      if (reply.code === "plan_read_only") return { error: "This business is read-only on the Free plan. Upgrade to edit it again.", code: reply.code };
      if (reply.code === "owner_mismatch") return { error: "This tab is signed in to a different account now. Reload the page.", code: reply.code };
      return { error: reply.error ?? failMessage, code: reply.code };
    }
    return { token: reply.token };
  } catch {
    return { error: offlineMessage };
  }
}

export function createPaylinkFor(invoiceId: string, bookId: string = PRIMARY_BOOK_ID, ctx: LinkContext = {}): Promise<{ token: string } | { error: string; code?: string }> {
  return createLink({ invoiceId }, bookId, ctx, "Couldn't create a pay link. Try again.", "You're offline. Connect to create a pay link.");
}

/** Statement links (Pro): one per client, keyed "stmt:<clientId>" (book-qualified outside the primary). */
export function createStatementLinkFor(clientId: string, bookId: string = PRIMARY_BOOK_ID, ctx: LinkContext = {}): Promise<{ token: string } | { error: string; code?: string }> {
  return createLink({ clientId }, bookId, ctx, "Couldn't create a statement link. Try again.", "You're offline. Connect to create a statement link.");
}

export async function deletePaylink(token: string, scope: "claims" | "link"): Promise<boolean> {
  try {
    return (await authedFetch(`/api/v1/paylinks/${token}/?intl=1`, "DELETE", { scope })).ok;
  } catch {
    return false;
  }
}
