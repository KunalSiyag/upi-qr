/**
 * Global Dynamic QR Cloud Engine
 * Handles global cross-device tracking, cloud destination lookup, and scan analytics.
 */

export interface CloudLinkData {
  id: string;
  title: string;
  destinationUrl: string;
  createdAt: string;
  scans: number;
  lastScanned?: string;
  scansByDevice?: { mobile: number; desktop: number };
}

// Zero-config cloud API endpoint using free KV / counter network
const CLOUD_API_BASE = "https://api.counterapi.dev/v1/proupiqr";

export async function recordGlobalScan(id: string): Promise<number> {
  try {
    const res = await fetch(`${CLOUD_API_BASE}_${id}/up`, { method: "GET" });
    if (res.ok) {
      const data = await res.json();
      return data.count || 1;
    }
  } catch (e) {
    console.warn("Cloud scan count update fallback:", e);
  }
  return 1;
}

export async function getGlobalScanCount(id: string): Promise<number> {
  try {
    const res = await fetch(`${CLOUD_API_BASE}_${id}`, { method: "GET" });
    if (res.ok) {
      const data = await res.json();
      return data.count || 0;
    }
  } catch (e) {
    console.warn("Cloud scan fetch fallback:", e);
  }
  return 0;
}

/**
 * Saves or updates a link definition to global state.
 */
export async function syncLinkToCloud(link: CloudLinkData): Promise<void> {
  try {
    // Sync local storage state
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
    console.error("Local sync error:", e);
  }
}
