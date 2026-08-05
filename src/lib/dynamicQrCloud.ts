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
  lastScanned?: string;
  category?: "payment" | "menu" | "social" | "store" | "event" | "other";
  expiryDate?: string;
  isPaused?: boolean;
  fallbackUrl?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  scansByDevice?: { mobile: number; desktop: number };
  recentScans?: ScanLogEvent[];
  /** Stored only in the campaign owner's browser; never included in a QR URL. */
  manageToken?: string;
}

const LOCAL_KEY = "pro_upi_dynamic_links";
const api = (path: string, init?: RequestInit) => fetch(`/api/dynamic${path}`, init);

function storeLocal(link: CloudLinkData): void {
  try {
    const existing: CloudLinkData[] = JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
    const index = existing.findIndex((item) => item.id === link.id);
    if (index >= 0) existing[index] = { ...existing[index], ...link };
    else existing.unshift(link);
    localStorage.setItem(LOCAL_KEY, JSON.stringify(existing));
  } catch {}
}

export async function getGlobalScanCount(id: string): Promise<{ scans: number; mobileScans: number; desktopScans: number }> {
  try {
    const response = await api(`/${encodeURIComponent(id)}?mode=stats`);
    if (!response.ok) return { scans: 0, mobileScans: 0, desktopScans: 0 };
    return await response.json();
  } catch { return { scans: 0, mobileScans: 0, desktopScans: 0 }; }
}

export async function syncDestinationToCloud(id: string, destinationUrl: string, metadata?: Partial<CloudLinkData>): Promise<boolean> {
  if (!metadata?.manageToken) return false;
  try {
    const response = await api(`/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ manageToken: metadata.manageToken, destinationUrl, title: metadata.title, category: metadata.category, expiryDate: metadata.expiryDate, isPaused: metadata.isPaused }),
    });
    return response.ok;
  } catch { return false; }
}

export async function getCloudDestination(id: string): Promise<{
  destinationUrl: string; title?: string; scans?: number; mobileScans?: number; desktopScans?: number;
} | null> {
  try {
    const response = await api(`/${encodeURIComponent(id)}?mode=details`);
    if (!response.ok) return null;
    const data = await response.json();
    return { destinationUrl: data.campaign.destinationUrl, title: data.campaign.title, scans: data.scans, mobileScans: data.mobileScans, desktopScans: data.desktopScans };
  } catch { return null; }
}

export async function recordScanInCloud(id: string, _device: "mobile" | "desktop") {
  try {
    const response = await api(`/${encodeURIComponent(id)}`);
    if (!response.ok) return null;
    const data = await response.json();
    return { destinationUrl: data.destinationUrl, title: data.title };
  } catch { return null; }
}

export async function syncLinkToCloud(link: CloudLinkData): Promise<CloudLinkData | null> {
  try {
    const response = await api("", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: link.id, title: link.title, destinationUrl: link.destinationUrl, category: link.category, expiryDate: link.expiryDate }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const saved = { ...link, ...data.campaign, scans: link.scans, scansByDevice: link.scansByDevice, recentScans: link.recentScans } as CloudLinkData;
    storeLocal(saved);
    return saved;
  } catch { return null; }
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
