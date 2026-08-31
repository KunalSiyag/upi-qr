import React, { useState, useEffect, useId, useRef } from "react";
import QRCode from "qrcode";
import {
  deleteLinkFromCloud,
  getGlobalScanCount,
  listCloudLinks,
  syncLinkToCloud,
  updateCloudCampaign,
  exportAnalyticsToCsv,
  type CloudLinkData,
} from "../lib/dynamicQrCloud";

const LEGACY_LOCAL_KEY = "pro_upi_dynamic_links";

function readStoredLinks(key: string): CloudLinkData[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((link) => link
      && typeof link.id === "string"
      && typeof link.title === "string"
      && typeof link.destinationUrl === "string");
  } catch {
    return [];
  }
}

function mergeCloudCampaign(local: CloudLinkData | undefined, cloud: CloudLinkData): CloudLinkData {
  return {
    ...local,
    ...cloud,
    expiryDate: cloud.expiryDate,
    manageToken: undefined,
    scans: cloud.scans ?? local?.scans ?? 0,
    scansByDevice: {
      mobile: cloud.mobileScans ?? cloud.scansByDevice?.mobile ?? local?.scansByDevice?.mobile ?? 0,
      desktop: cloud.desktopScans ?? cloud.scansByDevice?.desktop ?? local?.scansByDevice?.desktop ?? 0,
    },
    recentScans: local?.recentScans,
  };
}

export function DynamicQrGenerator() {
  const [links, setLinks] = useState<CloudLinkData[]>([]);
  const [title, setTitle] = useState("Main Store Counter Standee");
  const [destination, setDestination] = useState("https://www.proupiqr.in/");
  const [category, setCategory] = useState<"payment" | "menu" | "social" | "store" | "event" | "other">("store");
  const [expiryDate, setExpiryDate] = useState("");
  const [utmSource, setUtmSource] = useState("");
  const [utmMedium, setUtmMedium] = useState("");
  const [utmCampaign, setUtmCampaign] = useState("");

  const [activeLink, setActiveLink] = useState<CloudLinkData | null>(null);
  const [qrUrl, setQrUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [accountStatus, setAccountStatus] = useState<"checking" | "signed-in" | "signed-out" | "unavailable">("checking");
  const [cloudError, setCloudError] = useState("");
  const [localStorageKey, setLocalStorageKey] = useState<string | null>(null);
  const [legacyLinks, setLegacyLinks] = useState<CloudLinkData[]>([]);
  const [isClaimingLegacy, setIsClaimingLegacy] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"scans" | "newest" | "title">("scans");

  // Edit destination modal state
  const [editingDestination, setEditingDestination] = useState("");
  const [isUpdatingDest, setIsUpdatingDest] = useState(false);
  const [destUpdateSuccess, setDestUpdateSuccess] = useState(false);

  const titleId = useId();
  const destinationId = useId();
  const selectedLinkId = useRef<string | null>(null);
  const creatingRef = useRef(false);

  const getRedirectUrl = (link: Pick<CloudLinkData, "id">) =>
    `https://www.proupiqr.in/r/?id=${encodeURIComponent(link.id)}`;
  const isLinkExpired = (link: Pick<CloudLinkData, "expiryDate">) => Boolean(
    link.expiryDate && new Date(`${link.expiryDate}T23:59:59.999Z`).valueOf() < Date.now()
  );

  // Load saved links from localStorage on mount & sync cloud metrics
  const loadLinksAndSync = async () => {
    setIsRefreshing(true);
    try {
      const legacy = readStoredLinks(LEGACY_LOCAL_KEY);
      setLegacyLinks(legacy);
      let parsed: CloudLinkData[] = [];

      const cloudResult = await listCloudLinks();
      if (cloudResult.ok && cloudResult.data) {
        const accountKey = `${LEGACY_LOCAL_KEY}:${cloudResult.data.cacheKey}`;
        const cached = readStoredLinks(accountKey);
        const localById = new Map(cached.map((link) => [link.id, link]));
        parsed = cloudResult.data.campaigns.map((link) => mergeCloudCampaign(localById.get(link.id), link));
        setLocalStorageKey(accountKey);
        try { localStorage.setItem(accountKey, JSON.stringify(parsed)); } catch {}
        setAccountStatus("signed-in");
        setCloudError("");
      } else {
        setLocalStorageKey(null);
        setAccountStatus(cloudResult.status === 401 ? "signed-out" : "unavailable");
        setCloudError(cloudResult.error || "Cloud campaigns are unavailable.");
      }

      setLinks(parsed);

      if (parsed.length > 0) {
        selectLink(parsed[0]);
      } else {
        selectedLinkId.current = null;
        setActiveLink(null);
        setQrUrl("");
      }

      setIsRefreshing(false);
    } catch (e) {
      console.error("Failed to load dynamic links", e);
      setAccountStatus("unavailable");
      setCloudError("Cloud campaigns are unavailable.");
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadLinksAndSync();
  }, []);

  const saveLinksToStorage = (updated: CloudLinkData[]) => {
    setLinks(updated);
    if (localStorageKey) {
      try {
        localStorage.setItem(localStorageKey, JSON.stringify(updated));
      } catch (e) {
        console.error("Failed to save dynamic links", e);
      }
    }
  };

  const applyServerCampaign = (campaign: CloudLinkData) => {
    setLinks((currentLinks) => {
      const updated = currentLinks.map((current) => {
        if (current.id !== campaign.id) return current;
        if ((current.version || 0) > (campaign.version || 0)) return current;
        return mergeCloudCampaign(current, campaign);
      });
      if (localStorageKey) {
        try { localStorage.setItem(localStorageKey, JSON.stringify(updated)); } catch {}
      }
      return updated;
    });
    setActiveLink((current) => {
      if (!current || current.id !== campaign.id || selectedLinkId.current !== campaign.id) return current;
      if ((current.version || 0) > (campaign.version || 0)) return current;
      return mergeCloudCampaign(current, campaign);
    });
  };

  const claimLegacyCampaigns = async () => {
    const claimable = legacyLinks.filter((link) => link.manageToken);
    if (!claimable.length) return;
    setIsClaimingLegacy(true);
    const claimedIds = new Set<string>();
    for (const link of claimable) {
      const result = await updateCloudCampaign(link.id, {}, link.manageToken);
      if (result.ok) claimedIds.add(link.id);
    }
    const remaining = legacyLinks.filter((link) => !claimedIds.has(link.id));
    localStorage.setItem(LEGACY_LOCAL_KEY, JSON.stringify(remaining));
    setLegacyLinks(remaining);
    setIsClaimingLegacy(false);
    await loadLinksAndSync();
  };

  // Build final URL with UTM parameters if supplied
  const buildFinalDestination = () => {
    const input = destination.trim();
    if (!input) return "";
    if (/^upi:\/\/pay\?/i.test(input)) return input;
    try {
      const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(input);
      const urlObj = new URL(/^https:\/\//i.test(input) || hasScheme ? input : `https://${input}`);
      if (urlObj.protocol !== "https:") return input;
      if (utmSource) urlObj.searchParams.set("utm_source", utmSource);
      if (utmMedium) urlObj.searchParams.set("utm_medium", utmMedium);
      if (utmCampaign) urlObj.searchParams.set("utm_campaign", utmCampaign);
      return urlObj.toString();
    } catch {
      return input;
    }
  };

  const createDynamicLink = async () => {
    if (creatingRef.current) return;
    const finalDest = buildFinalDestination();
    if (!finalDest) return;
    creatingRef.current = true;
    setIsCreating(true);

    const newLink = {
      title: title.trim() || "Untitled Dynamic QR",
      destinationUrl: finalDest,
      category,
      expiryDate: expiryDate || undefined,
    };

    const result = await syncLinkToCloud(newLink);
    if (!result.ok || !result.data?.campaign) {
      if (result.status === 401) setAccountStatus("signed-out");
      setCloudError(result.error || "We could not create the dynamic QR.");
      creatingRef.current = false;
      setIsCreating(false);
      return;
    }
    const savedLink: CloudLinkData = {
      ...result.data.campaign,
      scans: 0,
      scansByDevice: { mobile: 0, desktop: 0 },
      recentScans: [],
      utmSource: utmSource.trim() || undefined,
      utmMedium: utmMedium.trim() || undefined,
      utmCampaign: utmCampaign.trim() || undefined,
    };
    setAccountStatus("signed-in");
    setCloudError("");
    setLinks((currentLinks) => {
      const updated = [savedLink, ...currentLinks];
      if (localStorageKey) {
        try { localStorage.setItem(localStorageKey, JSON.stringify(updated)); } catch {}
      }
      return updated;
    });
    creatingRef.current = false;
    setIsCreating(false);
    selectLink(savedLink);
  };

  const selectLink = async (link: CloudLinkData) => {
    selectedLinkId.current = link.id;
    setActiveLink(link);
    setQrUrl("");
    setEditingDestination(link.destinationUrl);
    setDestUpdateSuccess(false);

    const redirectUrl = getRedirectUrl(link);
    try {
      const [metrics, url] = await Promise.all([
        getGlobalScanCount(link.id),
        QRCode.toDataURL(redirectUrl, {
          width: 480,
          margin: 2,
          color: { dark: "#113b2c", light: "#ffffff" },
        }),
      ]);
      if (selectedLinkId.current !== link.id) return;

      setActiveLink((current) => current?.id === link.id
        ? {
            ...current,
            scans: Math.max(current.scans || 0, metrics.scans),
            scansByDevice: {
              mobile: Math.max(current.scansByDevice?.mobile || 0, metrics.mobileScans),
              desktop: Math.max(current.scansByDevice?.desktop || 0, metrics.desktopScans),
            },
          }
        : current);
      setQrUrl(url);
    } catch (err) {
      console.error("Failed to generate QR code", err);
    }
  };

  const updateDestination = async () => {
    if (!activeLink || !editingDestination.trim()) return;
    setIsUpdatingDest(true);

    const campaignId = activeLink.id;
    const result = await updateCloudCampaign(
      campaignId,
      { destinationUrl: editingDestination.trim() },
      activeLink.manageToken,
    );

    if (!result.ok || !result.data?.campaign) {
      setIsUpdatingDest(false);
      if (result.status === 401) setAccountStatus("signed-out");
      setCloudError(result.error || "The destination could not be updated.");
      return;
    }
    applyServerCampaign(result.data.campaign);
    setIsUpdatingDest(false);
    setCloudError("");
    if (selectedLinkId.current === campaignId) {
      setEditingDestination(result.data.campaign.destinationUrl);
      setDestUpdateSuccess(true);
      setTimeout(() => setDestUpdateSuccess(false), 3000);
    }
  };

  const togglePauseLink = async (id: string) => {
    const current = links.find((link) => link.id === id);
    if (!current) return;
    const expired = isLinkExpired(current);
    const result = await updateCloudCampaign(
      id,
      expired ? { isPaused: false, expiryDate: null } : { isPaused: !current.isPaused },
      current.manageToken,
    );
    if (!result.ok || !result.data?.campaign) {
      if (result.status === 401) setAccountStatus("signed-out");
      setCloudError(result.error || "This campaign could not be updated.");
      return;
    }
    applyServerCampaign(result.data.campaign);
    setCloudError("");
  };

  const deleteLink = async (id: string) => {
    if (!window.confirm("Delete this cloud campaign? Printed QR codes for it will stop working.")) return;
    const localLink = links.find((link) => link.id === id);
    const result = await deleteLinkFromCloud(id, localLink?.manageToken);
    if (!result.ok) {
      if (result.status === 401) setAccountStatus("signed-out");
      setCloudError(result.error || "This campaign could not be deleted.");
      return;
    }
    const updated = links.filter((l) => l.id !== id);
    saveLinksToStorage(updated);
    if (activeLink?.id === id) {
      selectedLinkId.current = updated[0]?.id || null;
      setActiveLink(updated.length > 0 ? updated[0] : null);
      if (updated.length === 0) setQrUrl("");
      if (updated.length > 0) selectLink(updated[0]);
    }
  };

  const copyRedirectUrl = () => {
    if (!activeLink) return;
    const redirectUrl = getRedirectUrl(activeLink);
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
      return 0;
    });

  const totalScansAll = links.reduce((sum, l) => sum + (l.scans || 0), 0);
  const totalMobileScans = links.reduce((sum, l) => sum + (l.scansByDevice?.mobile || 0), 0);
  const totalDesktopScans = links.reduce((sum, l) => sum + (l.scansByDevice?.desktop || 0), 0);
  const activeCampaigns = links.filter((l) => !l.isPaused && !isLinkExpired(l)).length;

  const activeMobilePct = activeLink
    ? Math.round(
        ((activeLink.scansByDevice?.mobile || 0) /
          Math.max(1, (activeLink.scansByDevice?.mobile || 0) + (activeLink.scansByDevice?.desktop || 0))) *
          100
      )
    : 0;

  return (
    <div className="space-y-8">
      <div className={`rounded-2xl border p-4 text-sm ${accountStatus === "signed-out" ? "border-amber-200 bg-amber-50 text-amber-950" : "border-leaf/20 bg-mint/40 text-forest"}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-black">Dynamic redirects require a free account</p>
            <p className="mt-1 text-xs leading-5 opacity-80">Campaign destinations and aggregate scan counts are stored in Vercel KV. Public QR links contain only a server-generated campaign ID.</p>
          </div>
          {accountStatus === "signed-out" && (
            <a href="/sign-in/?redirect_url=/dynamic-qr-generator/" className="shrink-0 rounded-xl bg-forest px-4 py-2 text-center text-xs font-black text-white hover:bg-leaf">
              Sign in to continue
            </a>
          )}
        </div>
        {cloudError && accountStatus !== "signed-out" && <p className="mt-2 text-xs font-bold text-red-700">{cloudError}</p>}
        {accountStatus === "signed-in" && legacyLinks.length > 0 && (
          <div className="mt-3 border-t border-forest/10 pt-3 text-xs">
            <p>{legacyLinks.filter((link) => link.manageToken).length} legacy browser campaign(s) may be eligible to claim into this account. Records without a management token stay hidden and should be recreated before reprinting.</p>
            {legacyLinks.some((link) => link.manageToken) && (
              <button type="button" onClick={claimLegacyCampaigns} disabled={isClaimingLegacy} className="mt-2 rounded-lg border border-forest/20 bg-white px-3 py-2 font-black text-forest hover:bg-mint disabled:opacity-60">
                {isClaimingLegacy ? "Claiming..." : "Claim Legacy Campaigns"}
              </button>
            )}
          </div>
        )}
      </div>

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
            <span>Real-time Vercel KV Sync</span>
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

            {accountStatus === "signed-out" ? (
              <a href="/sign-in/?redirect_url=/dynamic-qr-generator/" className="flex w-full items-center justify-center rounded-xl bg-forest py-3 text-xs font-black text-white shadow-md transition-all hover:bg-leaf">
                Sign in to Create a Dynamic QR
              </a>
            ) : (
              <button
                type="button"
                onClick={createDynamicLink}
                disabled={accountStatus === "checking" || isCreating}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-forest py-3 text-xs font-black text-white shadow-md transition-all hover:bg-leaf disabled:cursor-wait disabled:opacity-60"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                {accountStatus === "checking" ? "Checking Account..." : isCreating ? "Creating..." : "Create Dynamic QR Code"}
              </button>
            )}
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
                {isRefreshing ? "Syncing Cloud..." : "Sync Cloud Metrics"}
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
                            {(link.isPaused || isLinkExpired(link)) && (
                              <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                                {isLinkExpired(link) ? "Expired" : "Paused"}
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
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${activeLink.isPaused || isLinkExpired(activeLink) ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
                      {isLinkExpired(activeLink) ? "Expired" : activeLink.isPaused ? "Paused" : "Live & Active"}
                    </span>
                  </div>
                  <h3 className="mt-1 text-xl font-black text-forest">{activeLink.title}</h3>
                  <p className="text-xs text-forest/60 mt-0.5">Created on {activeLink.createdAt}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
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
                    {isLinkExpired(activeLink) ? "Reactivate" : activeLink.isPaused ? "Resume" : "Pause"}
                  </button>

                  <button
                    onClick={() => deleteLink(activeLink.id)}
                    aria-label="Delete dynamic QR campaign"
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
                  <button
                    onClick={loadLinksAndSync}
                    className="text-xs font-bold text-leaf hover:underline flex items-center gap-1"
                  >
                    <svg className={`h-3 w-3 ${isRefreshing ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Refresh Scan Metrics
                  </button>
                </h4>

                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-2xl border border-forest/10 p-4 bg-white">
                    <div className="flex items-center justify-between text-xs font-bold text-forest/70">
                      <span>Total Scans</span>
                      <span className="text-leaf font-black text-base">{activeLink.scans || 0}</span>
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
                      <span className="text-leaf font-black text-base">{activeMobilePct}%</span>
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

                {/* Real-time Scan Event Audit Log Stream */}
                <div className="rounded-2xl border border-forest/10 p-4 bg-white space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-forest">
                    <span>Browser-Local Activity Notes</span>
                    <span className="text-[10px] font-mono text-leaf bg-leaf/10 px-2 py-0.5 rounded">Local only</span>
                  </div>

                  <div className="space-y-2 text-xs divide-y divide-forest/5">
                    {activeLink.recentScans && activeLink.recentScans.length > 0 ? (
                      activeLink.recentScans.map((log, idx) => (
                        <div key={idx} className="pt-2 flex items-center justify-between text-forest/80">
                          <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                            <span className="font-medium text-xs">{log.browser || "Mobile Scanner"}</span>
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-forest/60">
                            <span className="capitalize font-mono bg-cream px-1.5 py-0.5 rounded">{log.device}</span>
                            <span>{log.timestamp}</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-forest/50 italic py-2 text-center">
                        Individual scan events are not retained. Use the aggregate mobile and desktop counts above.
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
              <h3 className="text-base font-bold text-forest">No Dynamic Campaign Selected</h3>
              <p className="text-xs">Create a new dynamic QR campaign on the left to view metrics, edit target URLs, and export CSV logs.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
