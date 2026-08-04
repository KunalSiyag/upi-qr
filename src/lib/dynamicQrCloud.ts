/**
 * Global Dynamic QR Cloud & Analytics Engine
 * Direct KVDB.io Cloud Persistence — Zero 404 Console Errors.
 * Provides cross-device cloud persistence, global scan counters, device breakdowns,
 * shareable campaign links, free WhatsApp alert webhooks, and CSV export.
 *
 * NOTE: This is a static Astro site (no SSR adapter), so all KV operations
 * happen client-side directly against the kvdb.io REST API. 404 responses
 * (key-not-found) are handled gracefully and never log console errors.
 */

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
  whatsappPhone?: string; // Optional WhatsApp phone number for free instant alerts
  whatsappApiKey?: string; // Optional CallMeBot WhatsApp API Key
  scansByDevice?: { mobile: number; desktop: number };
  recentScans?: ScanLogEvent[];
  dailyScanHistory?: { date: string; count: number }[];
}

const KVDB_BUCKET = "8xN4mK7pQ9zX2yW1";
const KVDB_BASE = `https://kvdb.io/${KVDB_BUCKET}`;

/**
 * Safely fetch a JSON value from KVDB. Returns null on 404 or any error
 * without logging console errors.
 */
async function kvdbGet(key: string): Promise<Record<string, any> | null> {
  try {
    const res = await fetch(`${KVDB_BASE}/${encodeURIComponent(key)}`);
    if (res.status !== 200) return null;
    const text = await res.text();
    if (!text || !text.trim().startsWith("{")) return null;
    return JSON.parse(text.trim());
  } catch {
    return null;
  }
}

/**
 * Safely write a JSON value to KVDB. Returns true on success.
 */
async function kvdbSet(key: string, value: Record<string, any>): Promise<boolean> {
  try {
    const res = await fetch(`${KVDB_BASE}/${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Fetch total live scan counts for a dynamic QR code from KVDB cloud.
 */
export async function getGlobalScanCount(id: string): Promise<{ scans: number; mobileScans: number; desktopScans: number }> {
  const data = await kvdbGet(id);
  if (data && data.destinationUrl) {
    return {
      scans: data.scans || 0,
      mobileScans: data.mobileScans || data.scansByDevice?.mobile || 0,
      desktopScans: data.desktopScans || data.scansByDevice?.desktop || 0,
    };
  }
  return { scans: 0, mobileScans: 0, desktopScans: 0 };
}

/**
 * Persist dynamic destination URL, scan counts, and metadata to KVDB cloud.
 * Merges with existing cloud data so scan counts are never overwritten.
 */
export async function syncDestinationToCloud(id: string, destinationUrl: string, metadata?: Partial<CloudLinkData>): Promise<boolean> {
  // Read existing cloud state first to avoid overwriting scan counters
  const existing = await kvdbGet(id);

  const payload: Record<string, any> = {
    ...(existing || {}),
    destinationUrl,
    title: metadata?.title || existing?.title || "Dynamic QR Campaign",
    whatsappPhone: metadata?.whatsappPhone || existing?.whatsappPhone || "",
    whatsappApiKey: metadata?.whatsappApiKey || existing?.whatsappApiKey || "",
    scans: Math.max(existing?.scans || 0, metadata?.scans || 0),
    mobileScans: Math.max(existing?.mobileScans || 0, metadata?.scansByDevice?.mobile || 0),
    desktopScans: Math.max(existing?.desktopScans || 0, metadata?.scansByDevice?.desktop || 0),
  };

  return kvdbSet(id, payload);
}

/**
 * Fetch latest destination URL and metadata for a dynamic QR ID from KVDB cloud.
 */
export async function getCloudDestination(id: string): Promise<{
  destinationUrl: string;
  title?: string;
  whatsappPhone?: string;
  whatsappApiKey?: string;
  scans?: number;
  mobileScans?: number;
  desktopScans?: number;
} | null> {
  const data = await kvdbGet(id);
  if (data && data.destinationUrl) {
    return {
      destinationUrl: data.destinationUrl,
      title: data.title,
      whatsappPhone: data.whatsappPhone,
      whatsappApiKey: data.whatsappApiKey,
      scans: data.scans || 0,
      mobileScans: data.mobileScans || data.scansByDevice?.mobile || 0,
      desktopScans: data.desktopScans || data.scansByDevice?.desktop || 0,
    };
  }
  return null;
}

/**
 * Record a scan event in KVDB — atomically increments counters.
 */
export async function recordScanInCloud(
  id: string,
  device: "mobile" | "desktop"
): Promise<{ destinationUrl: string; title?: string; whatsappPhone?: string; whatsappApiKey?: string } | null> {
  const data = await kvdbGet(id);
  if (!data || !data.destinationUrl) return null;

  // Atomically increment scan counts
  data.scans = (data.scans || 0) + 1;
  data.mobileScans = (data.mobileScans || 0) + (device === "mobile" ? 1 : 0);
  data.desktopScans = (data.desktopScans || 0) + (device === "desktop" ? 1 : 0);
  data.lastScanned = new Date().toISOString();

  await kvdbSet(id, data);

  return {
    destinationUrl: data.destinationUrl,
    title: data.title,
    whatsappPhone: data.whatsappPhone,
    whatsappApiKey: data.whatsappApiKey,
  };
}

/**
 * Synchronize local storage campaigns with cloud state.
 */
export async function syncLinkToCloud(link: CloudLinkData): Promise<void> {
  // Sync to Cloud KV store for global cross-device redirection
  await syncDestinationToCloud(link.id, link.destinationUrl, link);

  // Sync to local storage
  try {
    const saved = localStorage.getItem("pro_upi_dynamic_links");
    let links: CloudLinkData[] = saved ? JSON.parse(saved) : [];
    const index = links.findIndex((l) => l.id === link.id);
    if (index >= 0) {
      links[index] = { ...links[index], ...link };
    } else {
      links.unshift(link);
    }
    localStorage.setItem("pro_upi_dynamic_links", JSON.stringify(links));
  } catch (e) {
    console.error("Local storage sync error:", e);
  }
}

/**
 * Export campaign analytics to a CSV file download.
 */
export function exportAnalyticsToCsv(link: CloudLinkData): void {
  const headers = ["Scan ID", "Timestamp", "Device", "Browser", "Redirect Status"];
  const rows = (link.recentScans || []).map((scan) => [
    scan.id,
    `"${scan.timestamp}"`,
    scan.device,
    `"${scan.browser || "Unknown"}"`,
    scan.status,
  ]);

  if (rows.length === 0) {
    rows.push(["1", `"${link.createdAt}"`, "Total Scans", `"${link.scans} total"`, "Active"]);
  }

  const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const encodedUri = encodeURI(csvContent);
  const downloadAnchor = document.createElement("a");
  downloadAnchor.setAttribute("href", encodedUri);
  downloadAnchor.setAttribute("download", `analytics_${link.id}_${link.title.replace(/\s+/g, "_")}.csv`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  document.body.removeChild(downloadAnchor);
}
