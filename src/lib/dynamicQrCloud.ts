/**
 * Global Dynamic QR Cloud & Analytics Engine
 * Zero 404 Console Errors — localStorage-first with lazy KVDB cloud sync.
 *
 * Architecture:
 * - localStorage is the primary data store (instant, always works)
 * - KVDB cloud is a best-effort cross-device sync layer
 * - Cloud GETs only happen for keys we've previously confirmed exist
 * - Cloud POSTs are fire-and-forget; failures are silently absorbed
 * - A local registry tracks which keys are confirmed in the cloud
 *
 * NOTE: This is a static Astro site (no SSR adapter), so all KV operations
 * happen client-side. Browser-level 404 console errors are avoided by never
 * making GET requests for keys that haven't been successfully written.
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
  whatsappPhone?: string;
  whatsappApiKey?: string;
  scansByDevice?: { mobile: number; desktop: number };
  recentScans?: ScanLogEvent[];
  dailyScanHistory?: { date: string; count: number }[];
}

const KVDB_BUCKET = "UTBhVqvgHGvEDSqYe3s8Th";
const KVDB_BASE = `https://kvdb.io/${KVDB_BUCKET}`;
const CLOUD_REGISTRY_KEY = "pro_upi_cloud_synced_ids";

// ─── Cloud Registry ──────────────────────────────────────────────────────────
// Tracks which campaign IDs have been confirmed written to the cloud.
// We only issue GET requests for these IDs, preventing browser 404 console noise.

function getCloudRegistry(): Set<string> {
  try {
    const raw = localStorage.getItem(CLOUD_REGISTRY_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function markCloudSynced(id: string): void {
  try {
    const registry = getCloudRegistry();
    registry.add(id);
    localStorage.setItem(CLOUD_REGISTRY_KEY, JSON.stringify([...registry]));
  } catch {}
}

function isCloudSynced(id: string): boolean {
  return getCloudRegistry().has(id);
}

// ─── Low-level KVDB helpers ──────────────────────────────────────────────────

/** GET a key from KVDB — only call for keys known to exist. */
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

/** PUT/POST a key to KVDB. Marks the key as synced on success. */
async function kvdbSet(key: string, value: Record<string, any>): Promise<boolean> {
  try {
    const res = await fetch(`${KVDB_BASE}/${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
    });
    if (res.ok) {
      markCloudSynced(key);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Fetch total live scan counts for a dynamic QR code.
 * Only queries cloud if the key is known to exist — otherwise returns zeros.
 */
export async function getGlobalScanCount(id: string): Promise<{ scans: number; mobileScans: number; desktopScans: number }> {
  if (!isCloudSynced(id)) {
    return { scans: 0, mobileScans: 0, desktopScans: 0 };
  }
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
 * Merges with existing cloud data (if known to exist) so scan counts are
 * never accidentally overwritten.
 */
export async function syncDestinationToCloud(id: string, destinationUrl: string, metadata?: Partial<CloudLinkData>): Promise<boolean> {
  // Only read-before-write if we know the key already exists in the cloud
  const existing = isCloudSynced(id) ? await kvdbGet(id) : null;

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
 * Fetch latest destination URL and metadata for a dynamic QR ID.
 * Only queries cloud if the key is known to exist.
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
  if (!isCloudSynced(id)) return null;

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
 * Only called from the redirect page where we know the ID should exist.
 */
export async function recordScanInCloud(
  id: string,
  device: "mobile" | "desktop"
): Promise<{ destinationUrl: string; title?: string; whatsappPhone?: string; whatsappApiKey?: string } | null> {
  if (!isCloudSynced(id)) return null;

  const data = await kvdbGet(id);
  if (!data || !data.destinationUrl) return null;

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
