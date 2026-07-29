/**
 * Global Dynamic QR Cloud & Analytics Engine
 * Single-Key KVDB Cloud Persistence (Zero 404 Console Errors).
 * Provides cross-device cloud persistence, global scan counters, device breakdowns,
 * shareable campaign links, free WhatsApp alert webhooks, and CSV export.
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

/**
 * Fetch total live scan counts for a dynamic QR code directly from primary KVDB cloud key.
 */
export async function getGlobalScanCount(id: string): Promise<{ scans: number; mobileScans: number; desktopScans: number }> {
  try {
    const res = await fetch(`${KVDB_BASE}/${id}`, { method: "GET" });
    if (res.status === 200) {
      const text = await res.text();
      if (text && text.trim().startsWith("{")) {
        const data = JSON.parse(text.trim());
        return {
          scans: data.scans || 0,
          mobileScans: data.mobileScans || 0,
          desktopScans: data.desktopScans || 0,
        };
      }
    }
  } catch (e) {}

  return { scans: 0, mobileScans: 0, desktopScans: 0 };
}

/**
 * Persist dynamic destination URL, scan counts, and metadata to primary cloud KV store.
 */
export async function syncDestinationToCloud(id: string, destinationUrl: string, metadata?: Partial<CloudLinkData>): Promise<boolean> {
  try {
    // Preserve existing scan metrics if already present in cloud
    let existingScans = metadata?.scans || 0;
    let existingMobile = metadata?.scansByDevice?.mobile || 0;
    let existingDesktop = metadata?.scansByDevice?.desktop || 0;

    try {
      const existingRes = await fetch(`${KVDB_BASE}/${id}`, { method: "GET" });
      if (existingRes.status === 200) {
        const text = await existingRes.text();
        if (text && text.trim().startsWith("{")) {
          const parsed = JSON.parse(text.trim());
          existingScans = Math.max(existingScans, parsed.scans || 0);
          existingMobile = Math.max(existingMobile, parsed.mobileScans || 0);
          existingDesktop = Math.max(existingDesktop, parsed.desktopScans || 0);
        }
      }
    } catch (e) {}

    const payload = JSON.stringify({
      destinationUrl,
      title: metadata?.title || "Dynamic QR Campaign",
      whatsappPhone: metadata?.whatsappPhone || "",
      whatsappApiKey: metadata?.whatsappApiKey || "",
      scans: existingScans,
      mobileScans: existingMobile,
      desktopScans: existingDesktop,
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
export async function getCloudDestination(id: string): Promise<{ destinationUrl: string; title?: string; whatsappPhone?: string; whatsappApiKey?: string; scans?: number; mobileScans?: number; desktopScans?: number } | null> {
  try {
    const res = await fetch(`${KVDB_BASE}/${id}`, { method: "GET" });
    if (res.status === 200) {
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
            scans: parsed.scans || 0,
            mobileScans: parsed.mobileScans || 0,
            desktopScans: parsed.desktopScans || 0,
          };
        } else if (trimmed.startsWith("http") || trimmed.startsWith("upi://")) {
          return { destinationUrl: trimmed };
        }
      }
    }
  } catch (e) {}
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
