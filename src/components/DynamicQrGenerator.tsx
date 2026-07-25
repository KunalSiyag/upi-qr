import React, { useState, useEffect, useId } from "react";
import QRCode from "qrcode";
import {
  getGlobalScanCount,
  syncLinkToCloud,
  syncDestinationToCloud,
  type CloudLinkData,
} from "../lib/dynamicQrCloud";

export function DynamicQrGenerator() {
  const [links, setLinks] = useState<CloudLinkData[]>([]);
  const [title, setTitle] = useState("Main Store Counter Standee");
  const [destination, setDestination] = useState("https://www.proupiqr.in/");
  const [category, setCategory] = useState<"payment" | "menu" | "social" | "store" | "event" | "other">("store");
  const [expiryDate, setExpiryDate] = useState("");
  const [fallbackUrl, setFallbackUrl] = useState("");

  const [activeLink, setActiveLink] = useState<CloudLinkData | null>(null);
  const [qrUrl, setQrUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"scans" | "newest" | "title">("scans");
  const [cloudSyncStatus, setCloudSyncStatus] = useState<Record<string, string>>({});

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
            return {
              ...link,
              scans: totalScans,
              scansByDevice: {
                mobile: Math.max(link.scansByDevice?.mobile || 0, metrics.mobileScans),
                desktop: Math.max(link.scansByDevice?.desktop || 0, metrics.desktopScans),
              },
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

  const createDynamicLink = async () => {
    if (!destination.trim()) return;
    const id = Math.random().toString(36).substring(2, 8);
    const newLink: CloudLinkData = {
      id,
      title: title.trim() || "Untitled Dynamic QR",
      destinationUrl: destination.trim(),
      createdAt: new Date().toLocaleDateString(),
      scans: 0,
      category,
      expiryDate: expiryDate || undefined,
      fallbackUrl: fallbackUrl.trim() || undefined,
      isPaused: false,
      scansByDevice: { mobile: 0, desktop: 0 },
    };
    const updated = [newLink, ...links];
    saveLinksToStorage(updated);
    await syncLinkToCloud(newLink);
    selectLink(newLink);
  };

  const selectLink = async (link: CloudLinkData) => {
    setActiveLink(link);
    const shortUrl = `${window.location.origin}/r/?id=${link.id}`;
    try {
      const dataUrl = await QRCode.toDataURL(shortUrl, {
        width: 360,
        margin: 2,
        color: { dark: "#113b2c", light: "#ffffff" },
      });
      setQrUrl(dataUrl);
    } catch (e) {
      console.error("QR Error", e);
    }
  };

  const handleDestinationUpdate = async (id: string, newDest: string) => {
    setCloudSyncStatus((prev) => ({ ...prev, [id]: "Syncing..." }));
    const updated = links.map((l) => (l.id === id ? { ...l, destinationUrl: newDest } : l));
    saveLinksToStorage(updated);

    const ok = await syncDestinationToCloud(id, newDest);
    setCloudSyncStatus((prev) => ({ ...prev, [id]: ok ? "Cloud Synced ✓" : "Local Saved" }));
    setTimeout(() => {
      setCloudSyncStatus((prev) => ({ ...prev, [id]: "" }));
    }, 2500);

    if (activeLink?.id === id) {
      setActiveLink({ ...activeLink, destinationUrl: newDest });
    }
  };

  const togglePauseLink = async (id: string) => {
    const updated = links.map((l) => (l.id === id ? { ...l, isPaused: !l.isPaused } : l));
    saveLinksToStorage(updated);
    const target = updated.find((l) => l.id === id);
    if (target) await syncLinkToCloud(target);
    if (activeLink?.id === id && target) setActiveLink(target);
  };

  const updateLinkFields = async (id: string, fields: Partial<CloudLinkData>) => {
    const updated = links.map((l) => (l.id === id ? { ...l, ...fields } : l));
    saveLinksToStorage(updated);
    const target = updated.find((l) => l.id === id);
    if (target) await syncLinkToCloud(target);
    if (activeLink?.id === id && target) setActiveLink(target);
  };

  const deleteLink = (id: string) => {
    if (!window.confirm("Are you sure you want to delete this Dynamic QR campaign?")) return;
    const updated = links.filter((l) => l.id !== id);
    saveLinksToStorage(updated);
    if (activeLink?.id === id) {
      if (updated.length > 0) selectLink(updated[0]);
      else {
        setActiveLink(null);
        setQrUrl("");
      }
    }
  };

  const copyShortUrl = () => {
    if (!activeLink) return;
    const shortUrl = `${window.location.origin}/r/?id=${activeLink.id}`;
    navigator.clipboard.writeText(shortUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const exportAnalyticsCsv = () => {
    if (links.length === 0) return;
    const headers = [
      "ID",
      "Title",
      "Category",
      "Target URL",
      "Status",
      "Expiry Date",
      "Total Scans",
      "Mobile Scans",
      "Desktop Scans",
      "Created Date",
      "Last Scanned",
    ];
    const rows = links.map((l) => [
      l.id,
      `"${l.title.replace(/"/g, '""')}"`,
      l.category || "other",
      `"${l.destinationUrl.replace(/"/g, '""')}"`,
      l.isPaused ? "Paused" : "Active",
      l.expiryDate || "None",
      l.scans || 0,
      l.scansByDevice?.mobile || 0,
      l.scansByDevice?.desktop || 0,
      l.createdAt,
      l.lastScanned || "N/A",
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `proupiqr-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  // Filter & Sort links
  const filteredLinks = links
    .filter((l) => {
      const matchesSearch =
        l.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.destinationUrl.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCat = selectedCategoryFilter === "all" || (l.category || "other") === selectedCategoryFilter;
      return matchesSearch && matchesCat;
    })
    .sort((a, b) => {
      if (sortBy === "scans") return (b.scans || 0) - (a.scans || 0);
      if (sortBy === "title") return a.title.localeCompare(b.title);
      return b.id.localeCompare(a.id);
    });

  // Calculate overall metrics
  const totalScans = links.reduce((acc, l) => acc + (l.scans || 0), 0);
  const totalMobile = links.reduce((acc, l) => acc + (l.scansByDevice?.mobile || 0), 0);
  const mobilePercentage = totalScans > 0 ? Math.round((totalMobile / totalScans) * 100) : 0;
  const topCampaign = links.length > 0 ? [...links].sort((a, b) => (b.scans || 0) - (a.scans || 0))[0] : null;

  const getCategoryBadge = (cat?: string) => {
    switch (cat) {
      case "payment":
        return { label: "💳 Payment", color: "bg-emerald-100 text-emerald-800 border-emerald-300" };
      case "menu":
        return { label: "🍽️ Menu", color: "bg-amber-100 text-amber-800 border-amber-300" };
      case "social":
        return { label: "📱 Social", color: "bg-sky-100 text-sky-800 border-sky-300" };
      case "store":
        return { label: "🏪 Counter Standee", color: "bg-purple-100 text-purple-800 border-purple-300" };
      case "event":
        return { label: "🎉 Event", color: "bg-rose-100 text-rose-800 border-rose-300" };
      default:
        return { label: "🌐 Link", color: "bg-slate-100 text-slate-800 border-slate-300" };
    }
  };

  return (
    <div className="space-y-8">
      {/* Overview Analytics Banner */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-3xl border border-leaf/20 bg-gradient-to-br from-mint/50 to-white p-5 shadow-sm">
          <div className="text-xs font-black uppercase text-forest/60 tracking-wider">Total Scans</div>
          <div className="text-3xl font-black text-forest mt-1">📊 {totalScans}</div>
          <div className="text-[11px] text-forest/70 mt-1 font-medium">Across all QR campaigns</div>
        </div>

        <div className="rounded-3xl border border-leaf/20 bg-gradient-to-br from-mint/50 to-white p-5 shadow-sm">
          <div className="text-xs font-black uppercase text-forest/60 tracking-wider">Active Campaigns</div>
          <div className="text-3xl font-black text-leaf mt-1">🔗 {links.length}</div>
          <div className="text-[11px] text-forest/70 mt-1 font-medium">Editable redirect QRs</div>
        </div>

        <div className="rounded-3xl border border-leaf/20 bg-gradient-to-br from-mint/50 to-white p-5 shadow-sm">
          <div className="text-xs font-black uppercase text-forest/60 tracking-wider">Mobile Ratio</div>
          <div className="text-3xl font-black text-forest mt-1">📱 {mobilePercentage}%</div>
          <div className="text-[11px] text-forest/70 mt-1 font-medium">{totalMobile} smartphone scans</div>
        </div>

        <div className="rounded-3xl border border-leaf/20 bg-gradient-to-br from-mint/50 to-white p-5 shadow-sm">
          <div className="text-xs font-black uppercase text-forest/60 tracking-wider">Top Campaign</div>
          <div className="text-sm font-black text-forest truncate mt-2">
            ⭐ {topCampaign ? topCampaign.title : "None yet"}
          </div>
          <div className="text-[11px] text-leaf font-bold mt-1">
            {topCampaign ? `${topCampaign.scans || 0} total scans` : "Create QR to start"}
          </div>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-12">
        {/* Left Column: Creator & Campaign List */}
        <div className="lg:col-span-7 space-y-6">
          {/* Create Dynamic QR Form */}
          <div className="rounded-3xl border border-forest/10 bg-white p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-forest/10 pb-3">
              <h2 className="text-lg font-black text-forest flex items-center gap-2">
                <span className="text-leaf">⚡</span> Create New Dynamic QR Campaign
              </h2>
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-leaf bg-mint px-2.5 py-1 rounded-full border border-leaf/20">
                100% Cross-Device Sync
              </span>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor={titleId} className="block text-xs font-black uppercase text-forest/70 mb-1">
                  Campaign Title / Label
                </label>
                <input
                  id={titleId}
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Counter Standee, Table #1"
                  className="w-full rounded-xl border border-forest/20 p-2.5 text-xs font-bold text-forest outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/20"
                />
              </div>

              <div>
                <label className="block text-xs font-black uppercase text-forest/70 mb-1">Category Tag</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as any)}
                  className="w-full rounded-xl border border-forest/20 p-2.5 text-xs font-bold text-forest bg-white outline-none focus:border-leaf"
                >
                  <option value="store">🏪 Counter Standee</option>
                  <option value="payment">💳 Payment UPI</option>
                  <option value="menu">🍽️ Restaurant Menu</option>
                  <option value="social">📱 Social Media / Bio</option>
                  <option value="event">🎉 Event / Ticket</option>
                  <option value="other">🌐 General Link</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor={destinationId} className="block text-xs font-black uppercase text-forest/70 mb-1">
                Target Destination (URL or UPI ID)
              </label>
              <input
                id={destinationId}
                type="text"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="https://... or upi://pay?pa=shop@upi"
                className="w-full rounded-xl border border-forest/20 p-2.5 text-xs font-mono font-semibold text-forest outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/20"
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-4 pt-1">
              <div>
                <label className="block text-[11px] font-bold text-forest/70 mb-1">📅 Expiry Date (Optional)</label>
                <input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  className="w-full rounded-xl border border-forest/20 p-2 text-xs font-medium text-forest bg-white outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-forest/70 mb-1">🔄 Fallback URL (Optional)</label>
                <input
                  type="text"
                  value={fallbackUrl}
                  onChange={(e) => setFallbackUrl(e.target.value)}
                  placeholder="https://yourwebsite.com/expired"
                  className="w-full rounded-xl border border-forest/20 p-2 text-xs font-mono text-forest bg-white outline-none"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={createDynamicLink}
              className="w-full rounded-2xl bg-forest py-3 text-xs font-black text-white hover:bg-leaf transition-all shadow-md"
            >
              Generate True Dynamic QR Code →
            </button>
          </div>

          {/* Campaign List & Search / Filter Controls */}
          <div className="rounded-3xl border border-forest/10 bg-white p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-forest/10 pb-4">
              <div>
                <h3 className="text-base font-black text-forest">
                  Your Dynamic QR Campaigns ({filteredLinks.length})
                </h3>
                <p className="text-xs text-forest/60">Filter by category, edit targets & pause/resume links</p>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={exportAnalyticsCsv}
                  disabled={links.length === 0}
                  className="py-1.5 px-3 rounded-xl border border-forest/20 bg-cream text-forest hover:bg-mint text-xs font-bold transition-all disabled:opacity-50"
                >
                  📥 Export CSV
                </button>
                <button
                  type="button"
                  onClick={loadLinksAndSync}
                  disabled={isRefreshing}
                  className="py-1.5 px-3 rounded-xl bg-forest text-white hover:bg-leaf text-xs font-bold transition-all disabled:opacity-50"
                >
                  {isRefreshing ? "Syncing..." : "🔄 Sync"}
                </button>
              </div>
            </div>

            {/* Category Filter Pills */}
            <div className="flex flex-wrap gap-2 pt-1">
              {[
                { id: "all", label: "All QRs" },
                { id: "store", label: "🏪 Standees" },
                { id: "payment", label: "💳 Payments" },
                { id: "menu", label: "🍽️ Menus" },
                { id: "social", label: "📱 Social" },
                { id: "event", label: "🎉 Events" },
              ].map((pill) => (
                <button
                  key={pill.id}
                  onClick={() => setSelectedCategoryFilter(pill.id)}
                  className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${
                    selectedCategoryFilter === pill.id
                      ? "bg-forest text-white border-forest shadow-sm"
                      : "bg-cream text-forest/80 border-forest/10 hover:bg-mint"
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>

            {/* Filter & Sort Bar */}
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="🔍 Search campaigns by title, ID, or URL..."
                  className="w-full rounded-xl border border-forest/15 p-2 text-xs font-medium text-forest bg-slate-50 outline-none focus:border-leaf"
                />
              </div>

              <div>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="w-full rounded-xl border border-forest/15 p-2 text-xs font-bold text-forest bg-slate-50 outline-none focus:border-leaf"
                >
                  <option value="scans">Sort by Scans (High)</option>
                  <option value="newest">Sort by ID / Newest</option>
                  <option value="title">Sort by Title</option>
                </select>
              </div>
            </div>

            {/* List Items */}
            {filteredLinks.length === 0 ? (
              <div className="p-8 text-center text-xs text-forest/60 italic rounded-2xl border border-dashed border-forest/15 bg-cream">
                No matching dynamic QR campaigns found.
              </div>
            ) : (
              <div className="space-y-3 max-h-[550px] overflow-y-auto pr-1">
                {filteredLinks.map((link) => {
                  const syncText = cloudSyncStatus[link.id];
                  const isSelected = activeLink?.id === link.id;
                  const badge = getCategoryBadge(link.category);

                  return (
                    <div
                      key={link.id}
                      className={`rounded-2xl p-4 border transition-all space-y-3 ${
                        isSelected ? "bg-mint/40 border-leaf shadow-md" : "bg-white border-forest/10 hover:border-leaf/30"
                      } ${link.isPaused ? "opacity-75 bg-slate-50" : ""}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-black text-sm text-forest">{link.title}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badge.color}`}>
                            {badge.label}
                          </span>
                          <span className="font-mono text-[10px] bg-forest/10 text-forest px-2 py-0.5 rounded-full font-bold">
                            ID: {link.id}
                          </span>
                          {link.isPaused && (
                            <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full border border-amber-300">
                              ⏸️ PAUSED
                            </span>
                          )}
                          {syncText && (
                            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                              {syncText}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => togglePauseLink(link.id)}
                            className={`text-xs font-bold px-2.5 py-1 rounded-xl border transition-all ${
                              link.isPaused ? "bg-emerald-500 text-white border-emerald-600" : "bg-amber-100 text-amber-900 border-amber-300"
                            }`}
                          >
                            {link.isPaused ? "▶️ Resume" : "⏸️ Pause"}
                          </button>

                          <button
                            type="button"
                            onClick={() => selectLink(link)}
                            className="text-xs font-bold px-3 py-1 rounded-xl bg-forest text-white hover:bg-leaf transition-colors"
                          >
                            Select & View
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteLink(link.id)}
                            className="text-xs font-bold text-red-500 hover:text-red-700 px-2 py-1"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>

                      {/* Real-time Scan Metric Pill */}
                      <div className="flex items-center justify-between bg-white/90 p-2.5 rounded-xl border border-forest/10 text-xs">
                        <div className="flex items-center gap-3">
                          <span className="font-black text-leaf text-sm flex items-center gap-1">
                            📊 {link.scans || 0} Total Scans
                          </span>
                          <span className="text-[10px] text-forest/60">
                            📱 {link.scansByDevice?.mobile || 0} mobile | 💻 {link.scansByDevice?.desktop || 0} desktop
                          </span>
                        </div>
                        <span className="text-[10px] font-semibold text-forest/60">
                          {link.lastScanned ? link.lastScanned : `Created: ${link.createdAt}`}
                        </span>
                      </div>

                      {/* Editable Target Destination URL */}
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider text-forest/60 mb-1">
                          Editable Target URL (Updates Printed QR Instantly across all devices)
                        </label>
                        <input
                          type="text"
                          value={link.destinationUrl}
                          onChange={(e) => handleDestinationUpdate(link.id, e.target.value)}
                          className="w-full rounded-xl border border-forest/20 p-2 text-xs font-mono text-forest bg-white focus:border-leaf outline-none"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Selected QR Code & Analytics Detail */}
        <div className="lg:col-span-5 space-y-6">
          <div className="rounded-3xl border border-forest/10 bg-white p-6 shadow-md text-center space-y-5 sticky top-6">
            <h3 className="text-lg font-black text-forest">Campaign QR & Live Metrics</h3>

            {activeLink && qrUrl ? (
              <div className="space-y-4">
                {/* QR Code Container */}
                <div className="mx-auto w-52 h-52 border border-forest/15 p-4 rounded-3xl bg-white shadow-md flex items-center justify-center relative">
                  <img src={qrUrl} alt="Dynamic QR Code" className="w-full h-full object-contain" />
                  {activeLink.isPaused && (
                    <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-xs rounded-3xl flex items-center justify-center text-white font-black text-sm">
                      ⏸️ PAUSED
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <h4 className="text-base font-black text-forest">{activeLink.title}</h4>
                  <div className="text-[11px] font-mono text-forest/70 break-all bg-cream p-2.5 rounded-xl border border-forest/10 select-all">
                    {`${window.location.origin}/r/?id=${activeLink.id}`}
                  </div>
                </div>

                {/* Metrics Breakdown Card */}
                <div className="rounded-2xl bg-mint/40 p-4 border border-leaf/20 space-y-3 text-left">
                  <div className="flex items-center justify-between text-xs font-black text-forest">
                    <span>LIVE SCAN ANALYTICS</span>
                    <span className="text-[10px] font-mono bg-white px-2 py-0.5 rounded border border-forest/10">
                      ID: {activeLink.id}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div className="bg-white p-3 rounded-xl border border-forest/10">
                      <div className="text-[10px] font-black uppercase text-forest/60">Total Scans</div>
                      <div className="text-2xl font-black text-leaf">{activeLink.scans || 0}</div>
                    </div>
                    <div className="bg-white p-3 rounded-xl border border-forest/10">
                      <div className="text-[10px] font-black uppercase text-forest/60">Smartphone Scans</div>
                      <div className="text-2xl font-black text-forest">{activeLink.scansByDevice?.mobile || 0}</div>
                    </div>
                  </div>

                  {/* Print & Sticker Sheet Launcher Buttons */}
                  <div className="pt-2 border-t border-forest/10">
                    <p className="text-[10px] font-black uppercase text-forest/60 mb-2">Print Poster & Standee Launchers</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <a
                        href={`/qr-sticker-generator`}
                        className="py-2 px-3 rounded-xl bg-white border border-forest/20 text-forest hover:bg-mint font-bold text-[11px] text-center"
                      >
                        🏷️ Print Sticker Sheet
                      </a>
                      <a
                        href={`/offer-poster-generator`}
                        className="py-2 px-3 rounded-xl bg-white border border-forest/20 text-forest hover:bg-mint font-bold text-[11px] text-center"
                      >
                        📢 Print Offer Poster
                      </a>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="space-y-2 pt-2">
                  <button
                    type="button"
                    onClick={copyShortUrl}
                    className="w-full rounded-2xl bg-forest py-3 text-xs font-black text-white hover:bg-leaf transition-all shadow-md"
                  >
                    {copied ? "✓ Short Redirect Link Copied!" : "📋 Copy Short Redirect Link"}
                  </button>

                  <div className="grid grid-cols-2 gap-2">
                    <a
                      href={qrUrl}
                      download={`${activeLink.id}-dynamic-qr.png`}
                      className="block text-center rounded-xl bg-mint border border-leaf/20 py-2.5 text-xs font-bold text-forest hover:bg-leaf hover:text-white transition-all"
                    >
                      🖼️ Download PNG
                    </a>
                    <a
                      href={`${window.location.origin}/r/?id=${activeLink.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-center rounded-xl border border-forest/20 bg-cream py-2.5 text-xs font-bold text-forest hover:bg-white transition-all"
                    >
                      🧪 Test Redirect
                    </a>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-10 text-xs text-forest/60 italic rounded-2xl border border-dashed border-forest/15 bg-cream">
                Select or create a dynamic QR code campaign to view real-time metrics and download PNG.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
