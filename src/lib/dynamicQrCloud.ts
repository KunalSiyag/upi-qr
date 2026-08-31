/** Browser client for the first-party Vercel KV dynamic QR API. */
export interface ScanLogEvent {
  id: string;
  timestamp: string;
  device: "mobile" | "desktop";
  browser?: string;
  os?: string;
  status: "Success" | "Redirected" | "Fallback";
}

export interface CloudLinkData {
  id: string;
  title: string;
  destinationUrl: string;
  createdAt: string;
  scans: number;
  mobileScans?: number;
  desktopScans?: number;
  lastScanned?: string;
  category?: "payment" | "menu" | "social" | "store" | "event" | "other";
  expiryDate?: string;
  isPaused?: boolean;
  version?: number;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  scansByDevice?: { mobile: number; desktop: number };
  recentScans?: ScanLogEvent[];
  /** Legacy capability used once to claim an older anonymous campaign. */
  manageToken?: string;
}

export interface CloudApiResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}

const api = (path: string, init?: RequestInit) => fetch(path ? `/api/dynamic${path}` : "/api/dynamic/", init);

async function result<T>(response: Response): Promise<CloudApiResult<T>> {
  const body = await response.json().catch(() => ({}));
  return response.ok
    ? { ok: true, status: response.status, data: body as T }
    : { ok: false, status: response.status, error: typeof body.error === "string" ? body.error : "Request failed." };
}

export async function getGlobalScanCount(id: string): Promise<{ scans: number; mobileScans: number; desktopScans: number }> {
  try {
    const response = await api(`/${encodeURIComponent(id)}/?mode=stats`);
    if (!response.ok) return { scans: 0, mobileScans: 0, desktopScans: 0 };
    return await response.json();
  } catch { return { scans: 0, mobileScans: 0, desktopScans: 0 }; }
}

export async function listCloudLinks(): Promise<CloudApiResult<{ campaigns: CloudLinkData[]; cacheKey: string }>> {
  try {
    return result<{ campaigns: CloudLinkData[]; cacheKey: string }>(await api(""));
  } catch {
    return { ok: false, status: 0, error: "Could not reach the dynamic QR service." };
  }
}

export async function updateCloudCampaign(
  id: string,
  changes: Partial<Pick<CloudLinkData, "destinationUrl" | "title" | "category" | "isPaused">> & { expiryDate?: string | null },
  legacyManageToken?: string,
): Promise<CloudApiResult<{ campaign: CloudLinkData }>> {
  try {
    return result<{ campaign: CloudLinkData }>(await api(`/${encodeURIComponent(id)}/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...changes, manageToken: legacyManageToken }),
    }));
  } catch {
    return { ok: false, status: 0, error: "Could not reach the dynamic QR service." };
  }
}

export async function syncLinkToCloud(
  link: Pick<CloudLinkData, "title" | "destinationUrl" | "category" | "expiryDate">,
): Promise<CloudApiResult<{ campaign: CloudLinkData }>> {
  try {
    return await result<{ campaign: CloudLinkData }>(await api("", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(link),
    }));
  } catch {
    return { ok: false, status: 0, error: "Could not reach the dynamic QR service." };
  }
}

export async function deleteLinkFromCloud(id: string, legacyManageToken?: string): Promise<CloudApiResult<never>> {
  try {
    const response = await api(`/${encodeURIComponent(id)}/`, {
      method: "DELETE",
      headers: legacyManageToken ? { "X-Campaign-Manage-Token": legacyManageToken } : undefined,
    });
    if (response.status === 204) return { ok: true, status: 204 };
    return result<never>(response);
  } catch {
    return { ok: false, status: 0, error: "Could not reach the dynamic QR service." };
  }
}

export function exportAnalyticsToCsv(link: CloudLinkData): void {
  const rows = (link.recentScans || []).map((scan) => [scan.id, `"${scan.timestamp}"`, scan.device, `"${scan.browser || "Unknown"}"`, scan.status]);
  if (!rows.length) rows.push(["1", `"${link.createdAt}"`, "Total Scans", `"${link.scans} total"`, "Active"]);
  const csv = ["Scan ID,Timestamp,Device,Browser,Redirect Status", ...rows.map((row) => row.join(","))].join("\n");
  const anchor = document.createElement("a");
  anchor.href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
  anchor.download = `analytics_${link.id}_${link.title.replace(/\s+/g, "_")}.csv`;
  anchor.click();
}
