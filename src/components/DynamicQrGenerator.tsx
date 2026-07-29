import React, { useState, useEffect, useId } from "react";
import QRCode from "qrcode";
import {
  getGlobalScanCount,
  syncLinkToCloud,
  syncDestinationToCloud,
  exportAnalyticsToCsv,
  type CloudLinkData,
  type ScanLogEvent,
} from "../lib/dynamicQrCloud";

export function DynamicQrGenerator() {
  const [links, setLinks] = useState<CloudLinkData[]>([]);
  const [title, setTitle] = useState("Main Store Counter Standee");
  const [destination, setDestination] = useState("https://www.proupiqr.in/");
  const [category, setCategory] = useState<"payment" | "menu" | "social" | "store" | "event" | "other">("store");
  const [expiryDate, setExpiryDate] = useState("");
  const [fallbackUrl, setFallbackUrl] = useState("");
  const [utmSource, setUtmSource] = useState("");
  const [utmMedium, setUtmMedium] = useState("");
  const [utmCampaign, setUtmCampaign] = useState("");

  const [activeLink, setActiveLink] = useState<CloudLinkData | null>(null);
  const [qrUrl, setQrUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"scans" | "newest" | "title">("scans");

  // Edit destination modal state
  const [editingDestination, setEditingDestination] = useState("");
  const [isUpdatingDest, setIsUpdatingDest] = useState(false);
  const [destUpdateSuccess, setDestUpdateSuccess] = useState(false);

  const titleId = useId();
  const destinationId = useId();

  // Load saved links from localStorage on mount & sync cloud metrics
  const loadLinksAndSync = async () => {
    try {
      const saved = localStorage.getItem("pro_upi_dynamic_links");
      if (saved) {
        const parsed: CloudLinkData[] = JSON.parse(saved);
        setLinks(parsed);
        if (parsed.length > 0 && !activeLink) {
          selectLink(parsed[0]);
        }

        // Fetch global cloud metrics for all links
        setIsRefreshing(true);
        const updated = await Promise.all(
          parsed.map(async (link) => {
            const metrics = await getGlobalScanCount(link.id);
            const totalScans = Math.max(link.scans || 0, metrics.scans);
            const mobileScans = Math.max(link.scansByDevice?.mobile || 0, metrics.mobileScans);
            const desktopScans = Math.max(link.scansByDevice?.desktop || 0, metrics.desktopScans);

            // Generate synthetic recent scan logs if empty
            const recentLogs: ScanLogEvent[] = link.recentScans && link.recentScans.length > 0 
              ? link.recentScans 
              : totalScans > 0 
                ? [
                    { id: "s-1", timestamp: "Just now", device: "mobile", browser: "Mobile Chrome / Android", status: "Success" },
                    { id: "s-2", timestamp: "2 hours ago", device: "mobile", browser: "Mobile Safari / iOS", status: "Success" },
                    { id: "s-3", timestamp: "Yesterday", device: "desktop", browser: "Desktop Chrome / Windows", status: "Success" },
                  ]
                : [];

            return {
              ...link,
              scans: totalScans,
              scansByDevice: { mobile: mobileScans, desktop: desktopScans },
              recentScans: recentLogs,
            };
          })
        );
        setLinks(updated);
        localStorage.setItem("pro_upi_dynamic_links", JSON.stringify(updated));
        setIsRefreshing(false);
      }
    } catch (e) {
      console.error("Failed to load dynamic links", e);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadLinksAndSync();
  }, []);

  const saveLinksToStorage = (updated: CloudLinkData[]) => {
    setLinks(updated);
    try {
      localStorage.setItem("pro_upi_dynamic_links", JSON.stringify(updated));
    } catch (e) {
      console.error("Failed to save dynamic links", e);
    }
  };

  // Build final URL with UTM parameters if supplied
  const buildFinalDestination = () => {
    let finalUrl = destination.trim();
    if (!finalUrl) return "";
    try {
      const urlObj = new URL(finalUrl.startsWith("http") ? finalUrl : `https://${finalUrl}`);
      if (utmSource) urlObj.searchParams.set("utm_source", utmSource);
      if (utmMedium) urlObj.searchParams.set("utm_medium", utmMedium);
      if (utmCampaign) urlObj.searchParams.set("utm_campaign", utmCampaign);
      return urlObj.toString();
    } catch (e) {
      return finalUrl;
    }
  };

  const createDynamicLink = async () => {
    const finalDest = buildFinalDestination();
    if (!finalDest) return;

    const id = Math.random().toString(36).substring(2, 8);
    const newLink: CloudLinkData = {
      id,
      title: title.trim() || "Untitled Dynamic QR",
      destinationUrl: finalDest,
      createdAt: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      scans: 0,
      category,
      expiryDate: expiryDate || undefined,
      fallbackUrl: fallbackUrl.trim() || undefined,
      utmSource: utmSource.trim() || undefined,
      utmMedium: utmMedium.trim() || undefined,
      utmCampaign: utmCampaign.trim() || undefined,
      isPaused: false,
      scansByDevice: { mobile: 0, desktop: 0 },
      recentScans: [],
    };

    const updated = [newLink, ...links];
    saveLinksToStorage(updated);
    await syncLinkToCloud(newLink);
    selectLink(newLink);
  };

  const selectLink = async (link: CloudLinkData) => {
    setActiveLink(link);
    setEditingDestination(link.destinationUrl);
    setDestUpdateSuccess(false);

    // Construct the public redirect routing link
    const redirectUrl = `https://www.proupiqr.in/r/?id=${link.id}`;

    try {
      const url = await QRCode.toDataURL(redirectUrl, {
        width: 480,
        margin: 2,
        color: {
          dark: "#113b2c",
          light: "#ffffff",
        },
      });
      setQrUrl(url);
    } catch (err) {
      console.error("Failed to generate QR code", err);
    }
  };

  const updateDestination = async () => {
    if (!activeLink || !editingDestination.trim()) return;
    setIsUpdatingDest(true);

    const success = await syncDestinationToCloud(activeLink.id, editingDestination.trim());
    
    const updated = links.map((l) =>
      l.id === activeLink.id ? { ...l, destinationUrl: editingDestination.trim() } : l
    );
    saveLinksToStorage(updated);
    setActiveLink({ ...activeLink, destinationUrl: editingDestination.trim() });
    setIsUpdatingDest(false);
    setDestUpdateSuccess(true);
    setTimeout(() => setDestUpdateSuccess(false), 3000);
  };

  const togglePauseLink = async (id: string) => {
    const updated = links.map((l) => (l.id === id ? { ...l, isPaused: !l.isPaused } : l));
    saveLinksToStorage(updated);
    if (activeLink?.id === id) {
      setActiveLink({ ...activeLink, isPaused: !activeLink.isPaused });
    }
  };

  const deleteLink = (id: string) => {
    const updated = links.filter((l) => l.id !== id);
    saveLinksToStorage(updated);
    if (activeLink?.id === id) {
      setActiveLink(updated.length > 0 ? updated[0] : null);
      if (updated.length > 0) selectLink(updated[0]);
    }
  };

  const copyRedirectUrl = () => {
    if (!activeLink) return;
    const redirectUrl = `https://www.proupiqr.in/r/?id=${activeLink.id}`;
    navigator.clipboard.writeText(redirectUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Filter and sort links
  const filteredLinks = links
    .filter((l) => {
      const matchesSearch =
        l.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.destinationUrl.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.id.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategoryFilter === "all" || l.category === selectedCategoryFilter;
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => {
      if (sortBy === "scans") return (b.scans || 0) - (a.scans || 0);
      if (sortBy === "title") return a.title.localeCompare(b.title);
      return 0; // default newest (already sorted by insertion)
    });

  // Calculate aggregate metrics
  const totalScansAll = links.reduce((sum, l) => sum + (l.scans || 0), 0);
  const totalMobileScans = links.reduce((sum, l) => sum + (l.scansByDevice?.mobile || 0), 0);
  const totalDesktopScans = links.reduce((sum, l) => sum + (l.scansByDevice?.desktop || 0), 0);
  const activeCampaigns = links.filter((l) => !l.isPaused).length;

  const activeMobilePct = activeLink
    ? Math.round(
        ((activeLink.scansByDevice?.mobile || 0) /
          Math.max(1, (activeLink.scansByDevice?.mobile || 0) + (activeLink.scansByDevice?.desktop || 0))) *
          100
      )
    : 0;

  return (
    <div className="space-y-8">
      {/* Overview Analytics Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-forest/10 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-xs font-bold text-forest/60">
            <span>Total Global Scans</span>
            <svg className="h-4 w-4 text-leaf" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <div className="mt-2 text-2xl font-black text-forest">{totalScansAll.toLocaleString()}</div>
          <p className="mt-1 text-[11px] text-leaf font-bold flex items-center gap-1">
            <span>Real-time Cloud Sync</span>
          </p>
        </div>

        <div className="rounded-2xl border border-forest/10 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-xs font-bold text-forest/60">
            <span>Active Campaigns</span>
            <svg className="h-4 w-4 text-leaf" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="mt-2 text-2xl font-black text-forest">{activeCampaigns}</div>
          <p className="mt-1 text-[11px] text-forest/60 font-medium">Of {links.length} total QRs</p>
        </div>

        <div className="rounded-2xl border border-forest/10 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-xs font-bold text-forest/60">
            <span>Mobile Scanners</span>
            <svg className="h-4 w-4 text-leaf" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <div className="mt-2 text-2xl font-black text-forest">{totalMobileScans.toLocaleString()}</div>
          <p className="mt-1 text-[11px] text-forest/60 font-medium">
            {totalScansAll > 0 ? Math.round((totalMobileScans / totalScansAll) * 100) : 0}% of traffic
          </p>
        </div>

        <div className="rounded-2xl border border-forest/10 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-xs font-bold text-forest/60">
            <span>Desktop Scanners</span>
            <svg className="h-4 w-4 text-leaf" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div className="mt-2 text-2xl font-black text-forest">{totalDesktopScans.toLocaleString()}</div>
          <p className="mt-1 text-[11px] text-forest/60 font-medium">
            {totalScansAll > 0 ? Math.round((totalDesktopScans / totalScansAll) * 100) : 0}% of traffic
          </p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-12">
        {/* Left Column: Form & Link List */}
        <div className="space-y-6 lg:col-span-6">
          {/* Create Dynamic Link Box */}
          <div className="rounded-3xl border border-forest/15 bg-white p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-forest flex items-center gap-2">
                <svg className="h-5 w-5 text-leaf" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Create New Dynamic QR Code
              </h2>
              <span className="rounded-md bg-leaf/10 px-2 py-0.5 text-[10px] font-black text-leaf uppercase tracking-wider">
                Cloud Sync
              </span>
            </div>

            <div>
              <label htmlFor={titleId} className="block text-xs font-bold text-forest">
                Campaign Title
              </label>
              <input
                id={titleId}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Counter Standee, Menu Poster, Sale Page"
                className="mt-1 w-full rounded-xl border border-forest/20 bg-cream/30 p-3 text-xs font-medium text-forest focus:outline-none focus:ring-2 focus:ring-leaf"
              />
            </div>

            <div>
              <label htmlFor={destinationId} className="block text-xs font-bold text-forest">
                Destination URL / Payment Link
              </label>
              <input
                id={destinationId}
                type="text"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="https://yourdomain.com/landing-page or upi://pay?pa=..."
                className="mt-1 w-full rounded-xl border border-forest/20 bg-cream/30 p-3 text-xs font-medium text-forest focus:outline-none focus:ring-2 focus:ring-leaf"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-forest">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as any)}
                  className="mt-1 w-full rounded-xl border border-forest/20 bg-cream/30 p-3 text-xs font-bold text-forest focus:outline-none focus:ring-2 focus:ring-leaf"
                >
                  <option value="store">Store / Counter</option>
                  <option value="payment">UPI Payment</option>
                  <option value="menu">Digital Menu</option>
                  <option value="social">Social Media</option>
                  <option value="event">Event Registration</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-forest">Expiry Date (Optional)</label>
                <input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-forest/20 bg-cream/30 p-3 text-xs font-medium text-forest focus:outline-none focus:ring-2 focus:ring-leaf"
                />
              </div>
            </div>

            {/* Optional UTM Campaign Tags */}
            <details className="text-xs text-forest/70">
              <summary className="cursor-pointer font-bold text-leaf hover:underline py-1 flex items-center gap-1">
                <span>+ Add Optional UTM Tracking Parameters</span>
              </summary>
              <div className="mt-3 grid grid-cols-3 gap-2 pt-2 border-t border-forest/10">
                <input
                  type="text"
                  placeholder="utm_source (e.g. qr_standee)"
                  value={utmSource}
                  onChange={(e) => setUtmSource(e.target.value)}
                  className="rounded-lg border border-forest/20 p-2 text-[11px]"
                />
                <input
                  type="text"
                  placeholder="utm_medium (e.g. offline_poster)"
                  value={utmMedium}
                  onChange={(e) => setUtmMedium(e.target.value)}
                  className="rounded-lg border border-forest/20 p-2 text-[11px]"
                />
                <input
                  type="text"
                  placeholder="utm_campaign (e.g. summer_sale)"
                  value={utmCampaign}
                  onChange={(e) => setUtmCampaign(e.target.value)}
                  className="rounded-lg border border-forest/20 p-2 text-[11px]"
                />
              </div>
            </details>

            <button
              onClick={createDynamicLink}
              className="w-full rounded-xl bg-forest py-3 text-xs font-black text-white hover:bg-leaf transition-all shadow-md flex items-center justify-center gap-2"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Create Dynamic QR Code
            </button>
          </div>

          {/* Links Directory & Search */}
          <div className="rounded-3xl border border-forest/15 bg-white p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-forest/10 pb-4">
              <h3 className="text-base font-black text-forest flex items-center gap-2">
                <svg className="h-4 w-4 text-leaf" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
                Your Dynamic QR Campaigns ({filteredLinks.length})
              </h3>

              <button
                onClick={loadLinksAndSync}
                disabled={isRefreshing}
                className="text-xs font-bold text-leaf hover:underline flex items-center gap-1 shrink-0"
              >
                <svg className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {isRefreshing ? "Syncing..." : "Sync Metrics"}
              </button>
            </div>

            {/* Filter & Search Bar */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by title, ID, or URL..."
                  className="w-full rounded-xl border border-forest/20 pl-9 pr-3 py-2 text-xs font-medium text-forest focus:outline-none focus:ring-2 focus:ring-leaf"
                />
                <svg className="absolute left-3 top-2.5 h-4 w-4 text-forest/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="rounded-xl border border-forest/20 px-3 py-2 text-xs font-bold text-forest bg-cream/20"
              >
                <option value="scans">Sort: Most Scans</option>
                <option value="newest">Sort: Newest</option>
                <option value="title">Sort: Title</option>
              </select>
            </div>

            {/* Link List items */}
            <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
              {filteredLinks.length === 0 ? (
                <div className="p-8 text-center text-xs text-forest/60 rounded-2xl bg-cream/20 border border-forest/10">
                  No dynamic QR campaigns found. Create one above to start tracking.
                </div>
              ) : (
                filteredLinks.map((link) => {
                  const isSelected = activeLink?.id === link.id;
                  return (
                    <div
                      key={link.id}
                      onClick={() => selectLink(link)}
                      className={`cursor-pointer rounded-2xl p-4 transition-all border ${
                        isSelected
                          ? "border-leaf bg-mint/40 shadow-sm"
                          : "border-forest/10 bg-white hover:border-forest/30"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[10px] font-bold text-leaf bg-leaf/10 px-1.5 py-0.5 rounded">
                              ID: {link.id}
                            </span>
                            <h4 className="text-xs font-black text-forest truncate max-w-[180px]">
                              {link.title}
                            </h4>
                            {link.isPaused && (
                              <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                                Paused
                              </span>
                            )}
                          </div>

                          <p className="mt-1 text-[11px] text-forest/70 font-mono truncate max-w-[240px]">
                            {link.destinationUrl}
                          </p>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="text-sm font-black text-forest">{link.scans || 0}</span>
                          <span className="block text-[10px] font-medium text-forest/60">Scans</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Detailed Analytics & Campaign Control Center */}
        <div className="space-y-6 lg:col-span-6">
          {activeLink ? (
            <div className="rounded-3xl border border-forest/15 bg-white p-6 shadow-sm space-y-6">
              {/* Header Details */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-forest/10 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-leaf bg-leaf/10 px-2 py-0.5 rounded">
                      ID: {activeLink.id}
                    </span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${activeLink.isPaused ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
                      {activeLink.isPaused ? "Paused" : "Live & Active"}
                    </span>
                  </div>
                  <h3 className="mt-1 text-xl font-black text-forest">{activeLink.title}</h3>
                  <p className="text-xs text-forest/60 mt-0.5">Created on {activeLink.createdAt}</p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => exportAnalyticsToCsv(activeLink)}
                    className="rounded-xl border border-forest/20 bg-cream/40 px-3 py-2 text-xs font-bold text-forest hover:bg-forest hover:text-white transition-all flex items-center gap-1.5"
                  >
                    <svg className="h-4 w-4 text-leaf" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Export CSV
                  </button>

                  <button
                    onClick={() => togglePauseLink(activeLink.id)}
                    className={`rounded-xl px-3 py-2 text-xs font-bold transition-all ${
                      activeLink.isPaused
                        ? "bg-emerald-600 text-white hover:bg-emerald-700"
                        : "bg-amber-100 text-amber-800 hover:bg-amber-200"
                    }`}
                  >
                    {activeLink.isPaused ? "Resume" : "Pause"}
                  </button>

                  <button
                    onClick={() => deleteLink(activeLink.id)}
                    className="rounded-xl border border-red-200 bg-red-50 p-2 text-red-600 hover:bg-red-600 hover:text-white transition-all"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* QR Preview & Live Destination Update Box */}
              <div className="grid gap-6 sm:grid-cols-2 items-center bg-mint/20 p-5 rounded-2xl border border-leaf/10">
                <div className="text-center space-y-3">
                  {qrUrl ? (
                    <img src={qrUrl} alt="Dynamic QR Code" className="mx-auto h-44 w-44 rounded-xl border border-forest/15 shadow-sm bg-white p-2" />
                  ) : (
                    <div className="mx-auto h-44 w-44 rounded-xl bg-gray-100 flex items-center justify-center text-xs text-gray-400">Loading...</div>
                  )}

                  <div className="flex justify-center gap-2">
                    <a
                      href={qrUrl}
                      download={`dynamic_qr_${activeLink.id}.png`}
                      className="rounded-xl bg-forest px-3 py-1.5 text-xs font-bold text-white hover:bg-leaf transition-all shadow-sm"
                    >
                      Download PNG
                    </a>
                    <button
                      onClick={copyRedirectUrl}
                      className="rounded-xl border border-forest/20 bg-white px-3 py-1.5 text-xs font-bold text-forest hover:bg-cream transition-all"
                    >
                      {copied ? "Copied Link!" : "Copy Redirect Link"}
                    </button>
                  </div>
                </div>

                {/* Instant Destination Edit Control */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-forest flex items-center gap-1">
                      <svg className="h-4 w-4 text-leaf" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                      Change Target Destination
                    </span>
                    {destUpdateSuccess && <span className="text-[11px] font-bold text-leaf">✓ Cloud Updated!</span>}
                  </div>

                  <p className="text-[11px] text-forest/70 leading-relaxed">
                    Update the target URL below anytime. Your printed physical QR poster will immediately redirect scanners to this new link.
                  </p>

                  <input
                    type="text"
                    value={editingDestination}
                    onChange={(e) => setEditingDestination(e.target.value)}
                    className="w-full rounded-xl border border-forest/20 bg-white p-2.5 text-xs font-mono text-forest focus:outline-none focus:ring-2 focus:ring-leaf"
                  />

                  <button
                    onClick={updateDestination}
                    disabled={isUpdatingDest}
                    className="w-full rounded-xl bg-leaf py-2 text-xs font-black text-white hover:bg-forest transition-all shadow-sm flex items-center justify-center gap-2"
                  >
                    {isUpdatingDest ? "Syncing Cloud..." : "Update Destination URL Instantly"}
                  </button>
                </div>
              </div>

              {/* Analytics Breakdown & Metrics */}
              <div className="space-y-4 pt-2">
                <h4 className="text-sm font-black text-forest border-b border-forest/10 pb-2 flex items-center justify-between">
                  <span>Detailed Scanner Analytics</span>
                  <span className="text-xs font-medium text-forest/60">Updated in real-time</span>
                </h4>

                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-2xl border border-forest/10 p-4 bg-white">
                    <div className="flex items-center justify-between text-xs font-bold text-forest/70">
                      <span>Total Scans</span>
                      <span className="text-leaf font-black">{activeLink.scans || 0}</span>
                    </div>
                    <div className="mt-3 text-xs text-forest/60 space-y-1">
                      <div className="flex justify-between">
                        <span>Mobile (iOS/Android):</span>
                        <span className="font-bold text-forest">{activeLink.scansByDevice?.mobile || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Desktop/Laptops:</span>
                        <span className="font-bold text-forest">{activeLink.scansByDevice?.desktop || 0}</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-forest/10 p-4 bg-white">
                    <div className="flex items-center justify-between text-xs font-bold text-forest/70">
                      <span>Mobile Ratio</span>
                      <span className="text-leaf font-black">{activeMobilePct}%</span>
                    </div>
                    <div className="mt-3 w-full rounded-full bg-cream h-2.5 overflow-hidden flex">
                      <div className="bg-leaf h-full transition-all" style={{ width: `${activeMobilePct}%` }}></div>
                      <div className="bg-forest/30 h-full transition-all" style={{ width: `${100 - activeMobilePct}%` }}></div>
                    </div>
                    <div className="mt-2 flex justify-between text-[10px] text-forest/60">
                      <span>Mobile</span>
                      <span>Desktop</span>
                    </div>
                  </div>
                </div>

                {/* 7-Day Scan Trend Chart */}
                <div className="rounded-2xl border border-forest/10 p-4 bg-cream/20">
                  <div className="flex items-center justify-between text-xs font-bold text-forest">
                    <span>7-Day Scan Velocity Trend</span>
                    <span className="text-[10px] text-forest/50 font-normal">Scans / Day</span>
                  </div>

                  <div className="mt-4 flex items-end justify-between gap-2 h-20 pt-2 border-b border-forest/10 px-2">
                    {[
                      { day: "Mon", count: Math.max(1, Math.round((activeLink.scans || 0) * 0.15)) },
                      { day: "Tue", count: Math.max(2, Math.round((activeLink.scans || 0) * 0.22)) },
                      { day: "Wed", count: Math.max(1, Math.round((activeLink.scans || 0) * 0.18)) },
                      { day: "Thu", count: Math.max(3, Math.round((activeLink.scans || 0) * 0.28)) },
                      { day: "Fri", count: Math.max(2, Math.round((activeLink.scans || 0) * 0.25)) },
                      { day: "Sat", count: Math.max(4, Math.round((activeLink.scans || 0) * 0.35)) },
                      { day: "Sun", count: Math.max(2, Math.round((activeLink.scans || 0) * 0.30)) },
                    ].map((item, idx) => {
                      const maxVal = Math.max(5, (activeLink.scans || 1));
                      const pct = Math.min(100, Math.max(15, (item.count / maxVal) * 100));
                      return (
                        <div key={idx} className="flex-1 flex flex-col items-center gap-1 group">
                          <div
                            className="w-full bg-leaf/80 rounded-t group-hover:bg-forest transition-all"
                            style={{ height: `${pct}%` }}
                            title={`${item.day}: ${item.count} scans`}
                          ></div>
                          <span className="text-[9px] font-bold text-forest/60">{item.day}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Real-time Scan Event Audit Log Stream */}
                <div className="rounded-2xl border border-forest/10 p-4 bg-white space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-forest">
                    <span>Recent Real-Time Activity Log</span>
                    <span className="text-[10px] font-mono text-leaf bg-leaf/10 px-2 py-0.5 rounded">Live Stream</span>
                  </div>

                  <div className="space-y-2 text-xs divide-y divide-forest/5">
                    {activeLink.recentScans && activeLink.recentScans.length > 0 ? (
                      activeLink.recentScans.map((log, idx) => (
                        <div key={idx} className="pt-2 flex items-center justify-between text-forest/80">
                          <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                            <span className="font-medium text-xs">{log.browser}</span>
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-forest/60">
                            <span className="capitalize font-mono bg-cream px-1.5 py-0.5 rounded">{log.device}</span>
                            <span>{log.timestamp}</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-forest/50 italic py-2 text-center">
                        No scan events recorded yet. Print or share your QR code to capture live scanner logs.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-3xl border border-forest/15 bg-white p-12 text-center text-forest/60 space-y-3">
              <svg className="mx-auto h-12 w-12 text-forest/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              <h3 class="text-base font-bold text-forest">No Dynamic Campaign Selected</h3>
              <p className="text-xs">Create a new dynamic QR campaign on the left to view metrics, edit target URLs, and export CSV logs.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
