import {
  canonicalJson, emptyWorkspace, findClient, isIsoDate, liveInvoices, localToday, mergeWorkspaces, newId, pruneTombstones,
  recordReceiptPayment, restoreFrom, sanitizeWorkspace, updateBusiness, upsertClient, upsertInvoice, type ReceiptPayment, type Workspace,
} from "./model";

/**
 * Browser persistence for the payments workspace. localStorage is the source of
 * truth for signed-out users; cloud sync (when enabled) merges on top of it.
 */

export const WORKSPACE_KEY = "proupiqr-workspace-v1";
const INVOICE_DRAFT_KEY = "proupiqr-invoice-draft";

export function loadWorkspace(): Workspace {
  try {
    const raw = localStorage.getItem(WORKSPACE_KEY);
    if (!raw) return seedFromInvoiceDraft(emptyWorkspace());
    return sanitizeWorkspace(JSON.parse(raw));
  } catch {
    return emptyWorkspace();
  }
}

/** Returns false when storage is full or blocked so the UI can warn. */
export function saveWorkspace(ws: Workspace): boolean {
  try {
    const json = canonicalJson(pruneTombstones(ws, Date.now()));
    if (localStorage.getItem(WORKSPACE_KEY) !== json) localStorage.setItem(WORKSPACE_KEY, json);
    return true;
  } catch {
    return false;
  }
}

/** Keeps several open tabs consistent: merges whatever another tab saved. */
export function onExternalChange(current: () => Workspace, apply: (ws: Workspace) => void): () => void {
  const handler = (event: StorageEvent) => {
    if (event.key !== WORKSPACE_KEY || !event.newValue) return;
    try {
      apply(mergeWorkspaces(current(), sanitizeWorkspace(JSON.parse(event.newValue))));
    } catch {
      // Ignore malformed writes from other tabs.
    }
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

/** First run: borrow business name and UPI ID from the invoice generator draft. */
function seedFromInvoiceDraft(ws: Workspace): Workspace {
  try {
    const draft = JSON.parse(localStorage.getItem(INVOICE_DRAFT_KEY) || "null") as { merchant?: string; upiId?: string } | null;
    if (!draft) return ws;
    const name = typeof draft.merchant === "string" && draft.merchant !== "ABC Solutions" ? draft.merchant.slice(0, 80) : "";
    const upiId = typeof draft.upiId === "string" && draft.upiId !== "merchant@upi" ? draft.upiId.slice(0, 100) : "";
    if (!name && !upiId) return ws;
    return updateBusiness(ws, { name, upiId }, 0);
  } catch {
    return ws;
  }
}

export function backupJson(ws: Workspace): string {
  return JSON.stringify({ app: "proupiqr-workspace", exportedAt: new Date().toISOString(), workspace: ws }, null, 2);
}

/** Merges a backup file into the current workspace; throws on unreadable input. */
export function restoreBackup(current: Workspace, text: string): Workspace {
  const parsed = JSON.parse(text) as { app?: string; workspace?: unknown };
  if (parsed?.app !== "proupiqr-workspace") throw new Error("Not a Pro UPI QR workspace backup.");
  return restoreFrom(current, sanitizeWorkspace(parsed.workspace), Date.now());
}

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

/**
 * "Track payment" from the invoice generator: adds (or updates, matched by
 * invoice number) an invoice in the local workspace. Payments already recorded
 * against that invoice are kept. Returns null if the document is unusable.
 */
/**
 * "Save to payment book" from the receipt generator: settles the client's open
 * invoices (oldest first) and records any rest as a paid entry; see
 * recordReceiptPayment. Seeds the business from the receipt like trackDocument.
 */
export function recordReceipt(
  receipt: ReceiptPayment & { merchant: string; upiId: string },
): { appliedPaise: number; entryId: string | null; duplicate: boolean } | null {
  const now = Date.now();
  let ws = loadWorkspace();
  if (!ws.business.name && receipt.merchant.trim() && receipt.merchant !== "ABC Solutions") {
    ws = updateBusiness(ws, { name: receipt.merchant.trim().slice(0, 80), upiId: receipt.upiId === "merchant@upi" ? ws.business.upiId : receipt.upiId.trim().slice(0, 100) }, now);
  }
  const result = recordReceiptPayment(ws, receipt, localToday(), now);
  if (!result) return null;
  if (result.duplicate) return { appliedPaise: 0, entryId: null, duplicate: true };
  return saveWorkspace(result.ws) ? { appliedPaise: result.appliedPaise, entryId: result.entryId, duplicate: false } : null;
}

export function trackDocument(doc: DocumentToTrack): { invoiceId: string; created: boolean } | null {
  const number = doc.invoiceNo.trim().slice(0, 40);
  const customer = doc.customer.trim().slice(0, 80);
  if (!number || !customer || !Number.isSafeInteger(doc.totalPaise) || doc.totalPaise <= 0) return null;
  if (!isIsoDate(doc.invoiceDate)) return null;
  const dueDate = isIsoDate(doc.dueDate) && doc.dueDate >= doc.invoiceDate ? doc.dueDate : doc.invoiceDate;
  const now = Date.now();
  let ws = loadWorkspace();
  if (!ws.business.name && doc.merchant.trim() && doc.merchant !== "ABC Solutions") {
    ws = updateBusiness(ws, { name: doc.merchant.trim().slice(0, 80), upiId: doc.upiId === "merchant@upi" ? ws.business.upiId : doc.upiId.trim().slice(0, 100) }, now);
  }
  let client = findClient(ws, customer, "");
  if (!client) {
    client = { id: newId("cli"), name: customer, phone: "", email: "", gstin: "", createdAt: now, updatedAt: now };
    ws = upsertClient(ws, client, now);
  }
  const existing = liveInvoices(ws).find((i) => i.number.trim().toLowerCase() === number.toLowerCase());
  const invoiceId = existing?.id ?? newId("inv");
  ws = upsertInvoice(ws, {
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
  return saveWorkspace(ws) ? { invoiceId, created: !existing } : null;
}
