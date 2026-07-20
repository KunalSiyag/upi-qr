import React, { useState, useEffect, useId } from "react";
import QRCode from "qrcode";

interface DynamicLink {
  id: string;
  title: string;
  destinationUrl: string;
  createdAt: string;
  scans: number;
}

export function DynamicQrGenerator() {
  const [links, setLinks] = useState<DynamicLink[]>([]);
  const [title, setTitle] = useState("Store Offer / Payment Link");
  const [destination, setDestination] = useState("https://www.proupiqr.in/");
  const [activeLink, setActiveLink] = useState<DynamicLink | null>(null);
  const [qrUrl, setQrUrl] = useState("");
  const [copied, setCopied] = useState(false);

  const titleId = useId();
  const destinationId = useId();

  // Load links from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("pro_upi_dynamic_links");
      if (saved) {
        setLinks(JSON.parse(saved));
      }
    } catch (e) {
      console.error("Failed to load dynamic links", e);
    }
  }, []);

  // Save links to localStorage on change
  const saveLinksToStorage = (updated: DynamicLink[]) => {
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
    const newLink: DynamicLink = {
      id,
      title: title.trim() || "Untitled Dynamic QR",
      destinationUrl: destination.trim(),
      createdAt: new Date().toLocaleDateString(),
      scans: 0
    };
    const updated = [newLink, ...links];
    saveLinksToStorage(updated);
    selectLink(newLink);
  };

  const selectLink = async (link: DynamicLink) => {
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
          <h2 className="text-xl font-black text-forest">Create Dynamic Redirect QR</h2>
          <p className="text-xs text-forest/70">
            Dynamic QRs encode a short redirect link. You can change the target destination URL or UPI ID at any time without reprinting the QR code!
          </p>

          <div className="space-y-3">
            <div>
              <label htmlFor={titleId} className="block text-xs font-bold text-forest/75 mb-1">QR Label / Title</label>
              <input
                id={titleId}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Summer Promo Poster, Shop Table #4"
                className="w-full rounded-xl border border-forest/15 p-2.5 text-xs font-semibold text-forest outline-none focus:border-leaf"
              />
            </div>
            <div>
              <label htmlFor={destinationId} className="block text-xs font-bold text-forest/75 mb-1">Target Destination URL or UPI Pay Link</label>
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

        {/* Saved Links List */}
        <div className="rounded-3xl border border-forest/10 bg-white p-6 shadow-sm space-y-4">
          <h3 className="text-sm font-black text-forest uppercase tracking-wider">Your Dynamic QR Codes ({links.length})</h3>

          {links.length === 0 ? (
            <p className="text-xs text-forest/60 italic">No dynamic links created yet. Create one above to manage editable destinations.</p>
          ) : (
            <div className="space-y-3">
              {links.map((link) => (
                <div
                  key={link.id}
                  className={`rounded-2xl p-4 border transition-all space-y-2 ${
                    activeLink?.id === link.id ? "bg-mint/30 border-leaf shadow-sm" : "bg-white border-forest/10 hover:border-forest/30"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold text-xs text-forest">{link.title}</span>
                      <span className="ml-2 font-mono text-[10px] bg-forest/10 text-forest px-2 py-0.5 rounded-full">ID: {link.id}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => selectLink(link)} className="text-xs font-bold text-leaf hover:underline">
                        View QR
                      </button>
                      <button type="button" onClick={() => deleteLink(link.id)} className="text-xs font-bold text-red-500 hover:underline">
                        Delete
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-forest/60 mb-0.5">Editable Destination URL</label>
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

      {/* QR Output Panel */}
      <div className="lg:col-span-5 space-y-6">
        <div className="rounded-3xl border border-forest/10 bg-white p-6 shadow-lg text-center space-y-4">
          <h3 className="text-lg font-black text-forest">Dynamic QR Preview</h3>

          {activeLink && qrUrl ? (
            <div className="space-y-4">
              <div className="mx-auto w-48 h-48 border border-forest/15 p-3 rounded-2xl bg-white shadow-md flex items-center justify-center">
                <img src={qrUrl} alt="Dynamic QR" className="w-full h-full object-contain" />
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
              Select or create a dynamic link to view and edit its QR code.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
