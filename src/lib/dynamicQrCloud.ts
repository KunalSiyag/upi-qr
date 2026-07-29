/**
 * Global Dynamic QR Cloud & Analytics Engine
 * Provides cross-device cloud persistence, KVDB global scan counters, device breakdowns,
 * 7-day trend history, shareable campaign links, free WhatsApp alert webhooks, and CSV export.
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

const KVDB_BASE = `https://kvdb.io/8xN4mK7pQ9zX2yW1`;
const CLOUD_COUNTER_BASE = "https://api.counterapi.dev/v1/proupiqr";

/**
 * Record a scan event globally in KVDB & Counter API from any mobile scanner.
 */
export async function recordGlobalScan(
  id: string,
  device: "mobile" | "desktop" = "mobile",
  browser: string = "Mobile Browser"
): Promise<number> {
  let count = 1;

  // 1. Primary KVDB Cloud Increment
  try {
    const res = await fetch(`${KVDB_BASE}/cnt_${id}`);
    let current = 0;
    if (res.ok) {
      const text = await res.text();
      current = parseInt(text) || 0;
    }
    count = current + 1;
    await fetch(`${KVDB_BASE}/cnt_${id}`, {
      method: "POST",
      body: count.toString(),
    });
  } catch (e) {
    console.warn("KVDB scan increment fallback:", e);
  }

  // 2. Increment Device Specific KVDB Metric
  try {
    const resDev = await fetch(`${KVDB_BASE}/cnt_${id}_${device}`);
    let currentDev = 0;
    if (resDev.ok) {
      const textDev = await resDev.text();
      currentDev = parseInt(textDev) || 0;
    }
    await fetch(`${KVDB_BASE}/cnt_${id}_${device}`, {
      method: "POST",
      body: (currentDev + 1).toString(),
    });
  } catch (e) {}

  // 3. Backup Counter API
  try {
    fetch(`${CLOUD_COUNTER_BASE}_${id}/up`, { method: "GET" }).catch(() => {});
  } catch (e) {}

  return count;
}

/**
 * Fetch total live scan counts for a dynamic QR code from KVDB & Counter API.
 */
export async function getGlobalScanCount(id: string): Promise<{ scans: number; mobileScans: number; desktopScans: number }> {
  let scans = 0;
  let mobileScans = 0;
  let desktopScans = 0;

  // Fetch primary from KVDB
  try {
    const res = await fetch(`${KVDB_BASE}/cnt_${id}`);
    if (res.ok) {
      const text = await res.text();
      scans = parseInt(text) || 0;
    }
  } catch (e) {}

  try {
    const resM = await fetch(`${KVDB_BASE}/cnt_${id}_mobile`);
    if (resM.ok) {
      const textM = await resM.text();
      mobileScans = parseInt(textM) || 0;
    }
  } catch (e) {}

  try {
    const resD = await fetch(`${KVDB_BASE}/cnt_${id}_desktop`);
    if (resD.ok) {
      const textD = await resD.text();
      desktopScans = parseInt(textD) || 0;
    }
  } catch (e) {}

  // Fallback to Counter API if KVDB count is 0
  if (scans === 0) {
    try {
      const res = await fetch(`${CLOUD_COUNTER_BASE}_${id}`);
      if (res.ok) {
        const data = await res.json();
        scans = data.count || 0;
      }
    } catch (e) {}
  }

  return { scans, mobileScans, desktopScans };
}

/**
 * Persist dynamic destination URL and metadata to public cloud KV store so ANY mobile phone
 * scanning the printed physical QR code immediately lands on the NEW target URL.
 */
export async function syncDestinationToCloud(id: string, destinationUrl: string, metadata?: Partial<CloudLinkData>): Promise<boolean> {
  try {
    const payload = JSON.stringify({
      destinationUrl,
      title: metadata?.title || "Dynamic QR Campaign",
      whatsappPhone: metadata?.whatsappPhone || "",
      whatsappApiKey: metadata?.whatsappApiKey || "",
      updatedAt: new Date().toISOString(),
    });

    const res = await fetch(`${KVDB_BASE}/${id}`, {
      method: "POST",
      body: payload,
    });
    return res.ok;
  } catch (e) {
    console.warn("KVDB Cloud destination sync failed:", e);
    return false;
  }
}

/**
 * Fetch latest destination URL and metadata for a dynamic QR ID from cloud KV store.
 */
export async function getCloudDestination(id: string): Promise<{ destinationUrl: string; title?: string; whatsappPhone?: string; whatsappApiKey?: string } | null> {
  try {
    const res = await fetch(`${KVDB_BASE}/${id}`, { method: "GET" });
    if (res.ok) {
      const text = await res.text();
      if (text && text.trim()) {
        const trimmed = text.trim();
        if (trimmed.startsWith("{")) {
          const parsed = JSON.parse(trimmed);
          return {
            destinationUrl: parsed.destinationUrl,
            title: parsed.title,
            whatsappPhone: parsed.whatsappPhone,
            whatsappApiKey: parsed.whatsappApiKey,
          };
        } else if (trimmed.startsWith("http") || trimmed.startsWith("upi://")) {
          return { destinationUrl: trimmed };
        }
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
