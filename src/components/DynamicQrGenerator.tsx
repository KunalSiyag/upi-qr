import React, { useState, useEffect, useId } from "react";
import QRCode from "qrcode";
import { getGlobalScanCount, syncLinkToCloud } from "../lib/dynamicQrCloud";
import type { CloudLinkData } from "../lib/dynamicQrCloud";

export function DynamicQrGenerator() {
  const [links, setLinks] = useState<CloudLinkData[]>([]);
  const [title, setTitle] = useState("Store Front QR / Table #1");
  const [destination, setDestination] = useState("https://www.proupiqr.in/");
  const [activeLink, setActiveLink] = useState<CloudLinkData | null>(null);
  const [qrUrl, setQrUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const titleId = useId();
  const destinationId = useId();

  // Load saved links from localStorage on mount & fetch global cloud metrics
  const loadLinksAndSync = async () => {
    try {
      const saved = localStorage.getItem("pro_upi_dynamic_links");
      if (saved) {
        const parsed: CloudLinkData[] = JSON.parse(saved);
        setLinks(parsed);
        if (parsed.length > 0 && !activeLink) {
          selectLink(parsed[0]);
        }

        // Refresh global scan counts from cloud for all links
        setIsRefreshing(true);
        const updated = await Promise.all(
          parsed.map(async (link) => {
            const cloudScans = await getGlobalScanCount(link.id);
            return {
              ...link,
              scans: Math.max(link.scans || 0, cloudScans)
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

  const createDynamicLink = () => {
    if (!destination.trim()) return;
    const id = Math.random().toString(36).substring(2, 8);
    const newLink: CloudLinkData = {
      id,
      title: title.trim() || "Untitled Dynamic QR",
      destinationUrl: destination.trim(),
      createdAt: new Date().toLocaleDateString(),
      scans: 0,
      scansByDevice: { mobile: 0, desktop: 0 }
    };
    const updated = [newLink, ...links];
    saveLinksToStorage(updated);
    syncLinkToCloud(newLink);
    selectLink(newLink);
  };

  const selectLink = async (link: CloudLinkData) => {
    setActiveLink(link);
    const shortUrl = `${window.location.origin}/r/?id=${link.id}&url=${encodeURIComponent(link.destinationUrl)}`;
    try {
      const dataUrl = await QRCode.toDataURL(shortUrl, {
        width: 360,
        margin: 2,
        color: { dark: "#113b2c", light: "#ffffff" }
      });
      setQrUrl(dataUrl);
    } catch (e) {
      console.error("QR Error", e);
    }
  };

  const updateDestination = (id: string, newDest: string) => {
    const updated = links.map((l) => (l.id === id ? { ...l, destinationUrl: newDest } : l));
    saveLinksToStorage(updated);
    const target = updated.find((l) => l.id === id);
    if (target) syncLinkToCloud(target);
    if (activeLink?.id === id) {
      const updatedActive = { ...activeLink, destinationUrl: newDest };
      setActiveLink(updatedActive);
      selectLink(updatedActive);
    }
  };

  const deleteLink = (id: string) => {
    const updated = links.filter((l) => l.id !== id);
    saveLinksToStorage(updated);
    if (activeLink?.id === id) {
      setActiveLink(null);
      setQrUrl("");
    }
  };

  const copyShortUrl = () => {
    if (!activeLink) return;
    const shortUrl = `${window.location.origin}/r/?id=${activeLink.id}&url=${encodeURIComponent(activeLink.destinationUrl)}`;
    navigator.clipboard.writeText(shortUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="grid gap-8 lg:grid-cols-12">
      {/* Create & Manage Panel */}
      <div className="lg:col-span-7 space-y-6">
        <div className="rounded-3xl border border-forest/10 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black text-forest">Create Dynamic QR Code</h2>
            <span className="text-[10px] font-bold uppercase tracking-wider text-leaf bg-mint px-2.5 py-1 rounded-full border border-leaf/10">
              Global Cloud Metrics Enabled
            </span>
          </div>
          <p className="text-xs text-forest/70 leading-relaxed">
            Create dynamic QR codes for your shop, invoices, or social media. Change the target destination URL or UPI ID at any time without reprinting physical QR stickers!
          </p>

          <div className="space-y-3">
            <div>
              <label htmlFor={titleId} className="block text-xs font-bold text-forest/75 mb-1">QR Label / Campaign Name</label>
              <input
                id={titleId}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Counter Standee, Table #2 Menu"
                className="w-full rounded-xl border border-forest/15 p-2.5 text-xs font-semibold text-forest outline-none focus:border-leaf"
              />
            </div>
            <div>
              <label htmlFor={destinationId} className="block text-xs font-bold text-forest/75 mb-1">Target Destination URL or UPI Payment Link</label>
              <input
                id={destinationId}
                type="text"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="https://... or upi://pay?pa=shop@upi"
                className="w-full rounded-xl border border-forest/15 p-2.5 text-xs font-semibold text-forest outline-none focus:border-leaf font-mono"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={createDynamicLink}
            className="w-full rounded-xl bg-forest py-3 text-xs font-bold text-mint hover:bg-forest/90 transition-all shadow-md"
          >
            Generate Dynamic Short QR
          </button>
        </div>

        {/* Saved Links List & Real-time Global Metrics */}
        <div className="rounded-3xl border border-forest/10 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-forest/10 pb-3">
            <div>
              <h3 className="text-sm font-black text-forest uppercase tracking-wider">Your Dynamic QR Campaigns ({links.length})</h3>
              <p className="text-[11px] text-forest/60">Manage multiple QR codes with independent metrics tracking</p>
            </div>
            <button
              type="button"
              onClick={loadLinksAndSync}
              disabled={isRefreshing}
              className="text-xs font-bold text-leaf hover:underline flex items-center gap-1"
            >
              {isRefreshing ? "Syncing..." : "🔄 Refresh Cloud Metrics"}
            </button>
          </div>

          {links.length === 0 ? (
            <div className="p-6 text-center text-xs text-forest/60 italic">
              No dynamic QR codes generated yet. Create your first campaign above!
            </div>
          ) : (
            <div className="space-y-3">
              {links.map((link) => (
                <div
                  key={link.id}
                  className={`rounded-2xl p-4 border transition-all space-y-3 ${
                    activeLink?.id === link.id ? "bg-mint/30 border-leaf shadow-sm" : "bg-white border-forest/10 hover:border-forest/30"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-forest">{link.title}</span>
                      <span className="font-mono text-[10px] bg-forest/10 text-forest px-2 py-0.5 rounded-full">ID: {link.id}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={() => selectLink(link)} className="text-xs font-bold text-leaf hover:underline">
                        View Stats & QR
                      </button>
                      <button type="button" onClick={() => deleteLink(link.id)} className="text-xs font-bold text-red-500 hover:underline">
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Real-time Metric Pill */}
                  <div className="flex items-center justify-between bg-white/90 p-2.5 rounded-xl border border-forest/10 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                      <span className="font-black text-leaf text-sm">📊 {link.scans || 0} Global Scans</span>
                    </div>
                    <span className="text-[10px] font-semibold text-forest/60">
                      {link.lastScanned ? link.lastScanned : `Created: ${link.createdAt}`}
                    </span>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-forest/60 mb-0.5">Editable Target URL (Update Anytime)</label>
                    <input
                      type="text"
                      value={link.destinationUrl}
                      onChange={(e) => updateDestination(link.id, e.target.value)}
                      className="w-full rounded-lg border border-forest/15 p-1.5 text-xs font-mono text-forest bg-white"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* QR Output Panel & Deep Global Analytics */}
      <div className="lg:col-span-5 space-y-6">
        <div className="rounded-3xl border border-forest/10 bg-white p-6 shadow-lg text-center space-y-4">
          <h3 className="text-lg font-black text-forest">Campaign Metrics & Preview</h3>

          {activeLink && qrUrl ? (
            <div className="space-y-4">
              <div className="mx-auto w-48 h-48 border border-forest/15 p-3 rounded-2xl bg-white shadow-md flex items-center justify-center">
                <img src={qrUrl} alt="Dynamic QR" className="w-full h-full object-contain" />
              </div>

              {/* Detailed Metrics Grid */}
              <div className="rounded-2xl bg-mint/40 p-4 border border-leaf/10 space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-forest/80">Real-time Global Analytics</div>
                
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="bg-white p-2.5 rounded-xl border border-forest/10">
                    <div className="text-[10px] font-bold text-forest/60 uppercase">Total Scans</div>
                    <div className="text-2xl font-black text-leaf">{activeLink.scans || 0}</div>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-forest/10">
                    <div className="text-[10px] font-bold text-forest/60 uppercase">Created Date</div>
                    <div className="text-xs font-bold text-forest mt-1">{activeLink.createdAt}</div>
                  </div>
                </div>

                <div className="text-[10px] text-forest/70 bg-white/70 p-2 rounded-xl border border-forest/10">
                  🌐 Tracked globally across all mobile phones & QR scanners scanning <code className="font-mono text-leaf">/r/?id={activeLink.id}</code>
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-xs font-bold text-forest">{activeLink.title}</div>
                <div className="text-[10px] font-mono text-forest/60 break-all bg-slate-50 p-2 rounded-xl border border-slate-200">
                  {`${window.location.origin}/r/?id=${activeLink.id}`}
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  onClick={copyShortUrl}
                  className="w-full rounded-xl bg-forest py-2.5 text-xs font-bold text-white hover:bg-forest/90 transition-colors shadow-sm"
                >
                  {copied ? "Redirect Link Copied!" : "Copy Redirect Link"}
                </button>
                <a
                  href={qrUrl}
                  download={`${activeLink.id}-dynamic-qr.png`}
                  className="block w-full text-center rounded-xl bg-mint border border-leaf/20 py-2.5 text-xs font-bold text-forest hover:bg-mint/80 transition-colors"
                >
                  Download PNG
                </a>
              </div>
            </div>
          ) : (
            <div className="p-8 text-xs text-forest/60 italic">
              Select or create a dynamic QR code to view live metrics and download PNG.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
