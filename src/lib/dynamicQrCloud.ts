/**
 * Global Dynamic QR Cloud & Analytics Engine
 * Provides cross-device cloud persistence, global scan metrics, and multi-QR analytics tracking.
 */

export interface ScanLogEvent {
  timestamp: string;
  device: "mobile" | "desktop";
  userAgent?: string;
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
  scansByDevice?: { mobile: number; desktop: number };
  recentScans?: ScanLogEvent[];
}

const CLOUD_COUNTER_BASE = "https://api.counterapi.dev/v1/proupiqr";
const KVDB_BUCKET = "proupiqr_v1_links";
const KVDB_BASE = `https://kvdb.io/8xN4mK7pQ9zX2yW1`;

/**
 * Record a scan event from any mobile scanner or web device globally.
 */
export async function recordGlobalScan(id: string, device: "mobile" | "desktop" = "mobile"): Promise<number> {
  let count = 1;
  try {
    const res = await fetch(`${CLOUD_COUNTER_BASE}_${id}/up`, { method: "GET" });
    if (res.ok) {
      const data = await res.json();
      count = data.count || 1;
    }
  } catch (e) {
    console.warn("Cloud scan count update fallback:", e);
  }

  // Also log device specific metric counter if supported
  try {
    fetch(`${CLOUD_COUNTER_BASE}_${id}_${device}/up`, { method: "GET" }).catch(() => {});
  } catch (e) {}

  return count;
}

/**
 * Fetch total live scan counts for a dynamic QR code from cloud.
 */
export async function getGlobalScanCount(id: string): Promise<{ scans: number; mobileScans: number; desktopScans: number }> {
  let scans = 0;
  let mobileScans = 0;
  let desktopScans = 0;

  try {
    const res = await fetch(`${CLOUD_COUNTER_BASE}_${id}`, { method: "GET" });
    if (res.ok) {
      const data = await res.json();
      scans = data.count || 0;
    }
  } catch (e) {
    console.warn("Cloud scan count fetch fallback:", e);
  }

  try {
    const resM = await fetch(`${CLOUD_COUNTER_BASE}_${id}_mobile`, { method: "GET" });
    if (resM.ok) {
      const dataM = await resM.json();
      mobileScans = dataM.count || 0;
    }
  } catch (e) {}

  try {
    const resD = await fetch(`${CLOUD_COUNTER_BASE}_${id}_desktop`, { method: "GET" });
    if (resD.ok) {
      const dataD = await resD.json();
      desktopScans = dataD.count || 0;
    }
  } catch (e) {}

  return { scans, mobileScans, desktopScans };
}

/**
 * Persist dynamic destination URL to public cloud KV store so ANY mobile phone
 * scanning the printed physical QR code immediately lands on the NEW target URL.
 */
export async function syncDestinationToCloud(id: string, destinationUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${KVDB_BASE}/${id}`, {
      method: "POST",
      body: destinationUrl,
    });
    return res.ok;
  } catch (e) {
    console.warn("KVDB Cloud destination sync failed:", e);
    return false;
  }
}

/**
 * Fetch latest destination URL for a dynamic QR ID from cloud KV store.
 */
export async function getCloudDestination(id: string): Promise<string | null> {
  try {
    const res = await fetch(`${KVDB_BASE}/${id}`, { method: "GET" });
    if (res.ok) {
      const text = await res.text();
      if (text && text.trim().startsWith("http") || text.trim().startsWith("upi://")) {
        return text.trim();
      }
    }
  } catch (e) {
    console.warn("KVDB Cloud fetch fallback:", e);
  }
  return null;
}

/**
 * Synchronize local storage campaigns with cloud state.
 */
export async function syncLinkToCloud(link: CloudLinkData): Promise<void> {
  // Sync to Cloud KV store for global cross-device redirection
  await syncDestinationToCloud(link.id, link.destinationUrl);

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
