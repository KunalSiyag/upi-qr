import { authedFetch } from "./sync";
import type { PaylinkClaim } from "./paylinks";

/** Browser client for /api/v1/paylinks/. */

export interface ClientPaylink {
  token: string;
  claims: PaylinkClaim[];
}

export interface PaylinkList {
  byInvoice: Record<string, ClientPaylink>;
  plan: { id: string; activePaylinks: number; used: number; statementLinks?: boolean } | null;
}

export function paylinkUrl(token: string): string {
  return `${location.origin}/i/${token}/`;
}

export async function fetchPaylinks(): Promise<PaylinkList | null> {
  try {
    const response = await authedFetch("/api/v1/paylinks/", "GET");
    if (!response.ok) return null;
    const body = await response.json() as { links: { invoiceId: string; token: string; claims: PaylinkClaim[] }[]; plan: PaylinkList["plan"] };
    return {
      byInvoice: Object.fromEntries(body.links.map((l) => [l.invoiceId, { token: l.token, claims: l.claims }])),
      plan: body.plan,
    };
  } catch {
    return null;
  }
}

export async function createPaylinkFor(invoiceId: string): Promise<{ token: string } | { error: string; code?: string }> {
  try {
    const response = await authedFetch("/api/v1/paylinks/", "POST", { invoiceId });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return { error: body.error ?? "Couldn't create a pay link. Try again.", code: body.code };
    return { token: body.token };
  } catch {
    return { error: "You're offline. Connect to create a pay link." };
  }
}

/** Statement links (Pro): one per client, keyed "stmt:<clientId>" in byInvoice. */
export async function createStatementLinkFor(clientId: string): Promise<{ token: string } | { error: string; code?: string }> {
  try {
    const response = await authedFetch("/api/v1/paylinks/", "POST", { clientId });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return { error: body.error ?? "Couldn't create a statement link. Try again.", code: body.code };
    return { token: body.token };
  } catch {
    return { error: "You're offline. Connect to create a statement link." };
  }
}

export async function deletePaylink(token: string, scope: "claims" | "link"): Promise<boolean> {
  try {
    return (await authedFetch(`/api/v1/paylinks/${token}/`, "DELETE", { scope })).ok;
  } catch {
    return false;
  }
}
