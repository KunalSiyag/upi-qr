import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { safeToPng, downloadDataUrl, notifyExportError, withTimeout } from "../lib/export-image";
import { trackProductEvent } from "../lib/productEvents";
import { formatMoney, moneySymbol, type DocLang } from "../data/documentLang";
import { t } from "../data/phrases";

const DRAFT_KEY = "proupiqr-influencer-contract-draft";

function isValidUpiId(upiId: string) {
  return /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(upiId.trim());
}

export interface DeliverableItem {
  id: number;
  platform: string;
  type: string;
  desc: string;
  dueDate: string;
  fee: string;
}

let _delivId = 10;
function nextDelivId() {
  return ++_delivId;
}

export function InfluencerContractGenerator({ lang = "en" }: { lang?: DocLang } = {}) {
  const tr = (s: string) => t(lang, s);
  const money = (value: number) => formatMoney(value, lang);
  const symbol = moneySymbol(lang);
  const today = new Date().toISOString().slice(0, 10);
  const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  // Brand Info
  const [brandName, setBrandName] = useState("Acme Consumer Brands Pvt Ltd");
  const [brandRep, setBrandRep] = useState("Marketing Director / Brand Manager");
  const [brandEmail, setBrandEmail] = useState("partnerships@acmebrands.example");
  const [brandGstin, setBrandGstin] = useState("07AAAAA0000A1Z5");

  // Creator Info
  const [creatorName, setCreatorName] = useState("Priya Sharma");
  const [creatorHandle, setCreatorHandle] = useState("@priyastyle");
  const [primaryPlatform, setPrimaryPlatform] = useState("Instagram & YouTube");
  const [creatorEmail, setCreatorEmail] = useState("creator@example.com");
  const [creatorPan, setCreatorPan] = useState("ABCDE1234F");

  // Campaign Specs
  const [campaignName, setCampaignName] = useState("Summer Skincare Launch 2026");
  const [agreementDate, setAgreementDate] = useState(today);
  const [completionDate, setCompletionDate] = useState(nextMonth);

  // Deliverables
  const [deliverables, setDeliverables] = useState<DeliverableItem[]>([
    {
      id: 1,
      platform: "Instagram",
      type: "1x Reel (45-60s)",
      desc: "Product unboxing, application routine, brand tag @acmebrands, and #ad disclosure in caption.",
      dueDate: today,
      fee: "25000",
    },
    {
      id: 2,
      platform: "Instagram",
      type: "2x Stories with Link Sticker",
      desc: "Swipe-up / link sticker to official store, product highlight, and 24-hr retention.",
      dueDate: nextMonth,
      fee: "10000",
    },
  ]);

  // Protective Clauses
  const [reviewWindow, setReviewWindow] = useState("48 hours");
  const [maxRevisions, setMaxRevisions] = useState("2 rounds");
  const [exclusivity, setExclusivity] = useState("30 days post-publish (direct skincare competitors only)");
  const [usageRights, setUsageRights] = useState("Organic social posting on Creator handles + 30 days Brand paid ad whitelisting / Spark Ads");
  const [advancePercent, setAdvancePercent] = useState("50");
  const [paymentTerms, setPaymentTerms] = useState("Net 15 days upon live link submission and verified invoice");
  const [killFee, setKillFee] = useState("50% kill fee if Brand cancels post-script approval; 100% advance refund if Creator fails to deliver");

  // Payment UPI
  const [upiId, setUpiId] = useState("creator@okhdfcbank");
  const [payeeName, setPayeeName] = useState("Priya Sharma");
  const [qrDataUrl, setQrDataUrl] = useState("");

  // Signatures
  const [brandSignatory, setBrandSignatory] = useState("For Acme Consumer Brands Pvt Ltd");
  const [creatorSignatory, setCreatorSignatory] = useState("Priya Sharma (Creator)");

  // Export states
  const paperRef = useRef<HTMLDivElement | null>(null);
  const [pdfState, setPdfState] = useState<"idle" | "busy" | "error">("idle");
  const [pngState, setPngState] = useState<"idle" | "busy" | "error">("idle");
  const [copiedState, setCopiedState] = useState(false);

  // Persistence
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (!saved) return;
      const d = JSON.parse(saved);
      if (d.brandName) setBrandName(d.brandName);
      if (d.brandRep) setBrandRep(d.brandRep);
      if (d.brandEmail) setBrandEmail(d.brandEmail);
      if (d.brandGstin) setBrandGstin(d.brandGstin);
      if (d.creatorName) setCreatorName(d.creatorName);
      if (d.creatorHandle) setCreatorHandle(d.creatorHandle);
      if (d.primaryPlatform) setPrimaryPlatform(d.primaryPlatform);
      if (d.creatorEmail) setCreatorEmail(d.creatorEmail);
      if (d.creatorPan) setCreatorPan(d.creatorPan);
      if (d.campaignName) setCampaignName(d.campaignName);
      if (d.agreementDate) setAgreementDate(d.agreementDate);
      if (d.completionDate) setCompletionDate(d.completionDate);
      if (Array.isArray(d.deliverables) && d.deliverables.length > 0) setDeliverables(d.deliverables);
      if (d.reviewWindow) setReviewWindow(d.reviewWindow);
      if (d.maxRevisions) setMaxRevisions(d.maxRevisions);
      if (d.exclusivity) setExclusivity(d.exclusivity);
      if (d.usageRights) setUsageRights(d.usageRights);
      if (d.advancePercent) setAdvancePercent(d.advancePercent);
      if (d.paymentTerms) setPaymentTerms(d.paymentTerms);
      if (d.killFee) setKillFee(d.killFee);
      if (d.upiId) setUpiId(d.upiId);
      if (d.payeeName) setPayeeName(d.payeeName);
      if (d.brandSignatory) setBrandSignatory(d.brandSignatory);
      if (d.creatorSignatory) setCreatorSignatory(d.creatorSignatory);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          brandName, brandRep, brandEmail, brandGstin,
          creatorName, creatorHandle, primaryPlatform, creatorEmail, creatorPan,
          campaignName, agreementDate, completionDate, deliverables,
          reviewWindow, maxRevisions, exclusivity, usageRights,
          advancePercent, paymentTerms, killFee, upiId, payeeName,
          brandSignatory, creatorSignatory,
        })
      );
    } catch {}
  }, [
    brandName, brandRep, brandEmail, brandGstin,
    creatorName, creatorHandle, primaryPlatform, creatorEmail, creatorPan,
    campaignName, agreementDate, completionDate, deliverables,
    reviewWindow, maxRevisions, exclusivity, usageRights,
    advancePercent, paymentTerms, killFee, upiId, payeeName,
    brandSignatory, creatorSignatory,
  ]);

  // Financial Calculations
  const totals = useMemo(() => {
    const total = deliverables.reduce((acc, it) => acc + (Math.max(0, Number(it.fee) || 0)), 0);
    const advPct = Math.min(100, Math.max(0, Number(advancePercent) || 0));
    const advance = Math.round((total * advPct) / 100);
    const balance = total - advance;
    return { total, advPct, advance, balance };
  }, [deliverables, advancePercent]);

  // QR Code Generation
  useEffect(() => {
    if (upiId && isValidUpiId(upiId) && totals.advance > 0) {
      const uri = `upi://pay?pa=${encodeURIComponent(upiId.trim())}&pn=${encodeURIComponent(payeeName.trim() || creatorName.trim())}&am=${totals.advance}&cu=INR&tn=${encodeURIComponent(`Adv ${campaignName.slice(0, 20)}`)}`;
      QRCode.toDataURL(uri, { margin: 1, width: 140 }).then(setQrDataUrl).catch(() => setQrDataUrl(""));
    } else {
      setQrDataUrl("");
    }
  }, [upiId, payeeName, creatorName, totals.advance, campaignName]);

  const addDeliverable = () => {
    setDeliverables([
      ...deliverables,
      {
        id: nextDelivId(),
        platform: "Instagram",
        type: "1x Reel / Post",
        desc: "Product showcase with tags and #ad disclosure.",
        dueDate: completionDate,
        fee: "15000",
      },
    ]);
  };

  const removeDeliverable = (id: number) => {
    if (deliverables.length <= 1) return;
    setDeliverables(deliverables.filter((it) => it.id !== id));
  };

  const updateDeliverable = (id: number, field: keyof DeliverableItem, value: string) => {
    setDeliverables(deliverables.map((it) => (it.id === id ? { ...it, [field]: value } : it)));
  };

  async function renderPaper() {
    const el = paperRef.current;
    if (!el) throw new Error("Contract preview not ready");
    const clone = el.cloneNode(true) as HTMLDivElement;
    Object.assign(clone.style, {
      position: "fixed",
      left: "0",
      top: "0",
      zIndex: "-9999",
      opacity: "0",
      pointerEvents: "none",
      width: "820px",
      minWidth: "820px",
      maxWidth: "820px",
      padding: "40px",
      boxSizing: "border-box",
      height: "auto",
      backgroundColor: "#ffffff",
    });
    document.body.appendChild(clone);
    await new Promise((r) => setTimeout(r, 250));
    const h = clone.offsetHeight || 1200;
    try {
      return await safeToPng(clone, {
        cacheBust: true,
        pixelRatio: 2,
        width: 820,
        height: h,
        style: {
          opacity: "1",
          width: "820px",
          height: `${h}px`,
          maxWidth: "820px",
          maxHeight: `${h}px`,
          minWidth: "820px",
          minHeight: `${h}px`,
          padding: "40px",
          boxSizing: "border-box",
          backgroundColor: "#ffffff",
        },
      });
    } finally {
      document.body.removeChild(clone);
    }
  }

  async function downloadPdf() {
    try {
      setPdfState("busy");
      const [{ jsPDF }, du] = await Promise.all([withTimeout(import("jspdf"), "PDF"), renderPaper()]);
      const px = 0.2646;
      const w = 820 * px;
      const h = (paperRef.current?.offsetHeight || 1200) * px;
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: [w, h] });
      pdf.addImage(du, "PNG", 0, 0, w, h);
      pdf.save(`influencer-agreement-${campaignName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`);
      trackProductEvent("export_pdf", "influencer-contract");
      setPdfState("idle");
    } catch (e) {
      console.error(e);
      notifyExportError("PDF generation failed");
      setPdfState("error");
    }
  }

  async function downloadPng() {
    try {
      setPngState("busy");
      const du = await renderPaper();
      downloadDataUrl(du, `influencer-agreement-${campaignName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`);
      trackProductEvent("export_png", "influencer-contract");
      setPngState("idle");
    } catch (e) {
      console.error(e);
      notifyExportError("PNG generation failed");
      setPngState("error");
    }
  }

  function copyAgreementText() {
    const text = `INFLUENCER COLLABORATION AGREEMENT
Effective Date: ${agreementDate} | Campaign: ${campaignName}

1. PARTIES
Brand: ${brandName} (Rep: ${brandRep}, Contact: ${brandEmail}, GSTIN: ${brandGstin || "N/A"})
Creator: ${creatorName} (${creatorHandle} on ${primaryPlatform}, Contact: ${creatorEmail}, PAN: ${creatorPan || "N/A"})

2. SCOPE OF DELIVERABLES
${deliverables.map((d, i) => `${i + 1}. [${d.platform}] ${d.type} - ${d.desc} (Due: ${d.dueDate}, Fee: ${money(Number(d.fee) || 0)})`).join("\n")}

3. COMMERCIALS & PAYMENT TERMS
- Total Agreed Compensation: ${money(totals.total)}
- Advance Deposit (${totals.advPct}%): ${money(totals.advance)} (Due before production)
- Balance Amount: ${money(totals.balance)} payable via ${paymentTerms}
- UPI ID for Payment: ${upiId} (${payeeName})

4. KEY CLAUSES
- Approvals: Brand review window is ${reviewWindow}; includes ${maxRevisions} of revisions.
- Exclusivity: ${exclusivity}.
- Content Usage: ${usageRights}.
- Compliance: Mandatory ASCI & consumer protection disclosure (#ad, #collab, paid partnership).
- Kill Fee: ${killFee}.

SIGNATURES:
For Brand: ${brandSignatory} (Date: ${agreementDate})
For Creator: ${creatorSignatory} (Date: ${agreementDate})`;

    navigator.clipboard.writeText(text).then(() => {
      setCopiedState(true);
      trackProductEvent("copy", "influencer-contract");
      setTimeout(() => setCopiedState(false), 2500);
    });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
      {/* Editor Console */}
      <div className="no-print space-y-6 rounded-[2rem] border border-white/75 bg-white/90 p-5 shadow-[0_18px_48px_rgba(17,59,44,0.08)] sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-forest/10 pb-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-leaf">Creator & Brand Legal Tool</p>
            <h2 className="mt-1 text-2xl font-black text-forest">{tr("Influencer Contract")}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={copyAgreementText}
              className="rounded-full border border-forest/15 px-3.5 py-1.5 text-xs font-bold text-forest transition hover:bg-mint"
            >
              {copiedState ? "✓ Copied Text" : "Copy Text"}
            </button>
            <button
              onClick={downloadPng}
              disabled={pngState === "busy"}
              className="rounded-full border border-forest/15 px-3.5 py-1.5 text-xs font-bold text-forest transition hover:border-leaf"
            >
              {pngState === "busy" ? "..." : tr("Export PNG")}
            </button>
            <button
              onClick={downloadPdf}
              disabled={pdfState === "busy"}
              className="rounded-full bg-forest px-4 py-1.5 text-xs font-bold text-white transition hover:bg-leaf disabled:opacity-50"
            >
              {pdfState === "busy" ? tr("Generating...") : tr("Download PDF")}
            </button>
          </div>
        </div>


        {/* Section 1: Brand & Creator Info */}
        <div className="space-y-4">
          <h3 className="text-xs font-black uppercase tracking-wider text-forest/70">1. Parties</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-forest">
              Brand / Agency Name
              <input
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-xs outline-none focus:border-leaf"
              />
            </label>
            <label className="text-xs font-bold text-forest">
              Brand Representative
              <input
                value={brandRep}
                onChange={(e) => setBrandRep(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-xs outline-none focus:border-leaf"
              />
            </label>
            <label className="text-xs font-bold text-forest">
              Brand Contact Email
              <input
                value={brandEmail}
                onChange={(e) => setBrandEmail(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-xs outline-none focus:border-leaf"
              />
            </label>
            <label className="text-xs font-bold text-forest">
              Brand GSTIN / Tax ID
              <input
                value={brandGstin}
                onChange={(e) => setBrandGstin(e.target.value)}
                placeholder="07AAAAA0000A1Z5"
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-xs outline-none focus:border-leaf"
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 pt-2 border-t border-forest/10">
            <label className="text-xs font-bold text-forest">
              Creator Legal Name
              <input
                value={creatorName}
                onChange={(e) => setCreatorName(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-xs outline-none focus:border-leaf"
              />
            </label>
            <label className="text-xs font-bold text-forest">
              Creator Handle (@username)
              <input
                value={creatorHandle}
                onChange={(e) => setCreatorHandle(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-xs outline-none focus:border-leaf"
              />
            </label>
            <label className="text-xs font-bold text-forest">
              Primary Platform(s)
              <input
                value={primaryPlatform}
                onChange={(e) => setPrimaryPlatform(e.target.value)}
                placeholder="Instagram, YouTube, LinkedIn"
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-xs outline-none focus:border-leaf"
              />
            </label>
            <label className="text-xs font-bold text-forest">
              Creator PAN (for TDS 194R/194C)
              <input
                value={creatorPan}
                onChange={(e) => setCreatorPan(e.target.value)}
                placeholder="ABCDE1234F"
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-xs outline-none focus:border-leaf"
              />
            </label>
          </div>
        </div>

        {/* Section 2: Campaign & Deliverables */}
        <div className="space-y-3 pt-2 border-t border-forest/10">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-wider text-forest/70">2. Campaign & Deliverables</h3>
            <button onClick={addDeliverable} className="text-xs font-bold text-leaf hover:underline">
              + Add Deliverable
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs font-bold text-forest sm:col-span-3">
              Campaign Name / Hashtag
              <input
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-xs outline-none focus:border-leaf"
              />
            </label>
            <label className="text-xs font-bold text-forest">
              Agreement Date
              <input
                type="date"
                value={agreementDate}
                onChange={(e) => setAgreementDate(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-xs outline-none focus:border-leaf"
              />
            </label>
            <label className="text-xs font-bold text-forest sm:col-span-2">
              Campaign Completion Date
              <input
                type="date"
                value={completionDate}
                onChange={(e) => setCompletionDate(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-xs outline-none focus:border-leaf"
              />
            </label>
          </div>

          <div className="space-y-2.5 pt-2">
            {deliverables.map((item, idx) => (
              <div key={item.id} className="relative rounded-2xl border border-forest/10 bg-cream/50 p-3 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-forest">Deliverable #{idx + 1}</span>
                  {deliverables.length > 1 && (
                    <button onClick={() => removeDeliverable(item.id)} className="text-red-500 font-bold hover:underline">
                      Remove
                    </button>
                  )}
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <input
                    value={item.platform}
                    onChange={(e) => updateDeliverable(item.id, "platform", e.target.value)}
                    placeholder="Platform (e.g. Instagram)"
                    className="rounded-lg border border-forest/10 bg-white px-2.5 py-1.5 outline-none focus:border-leaf"
                  />
                  <input
                    value={item.type}
                    onChange={(e) => updateDeliverable(item.id, "type", e.target.value)}
                    placeholder="Format (e.g. 1x Reel 60s)"
                    className="rounded-lg border border-forest/10 bg-white px-2.5 py-1.5 outline-none focus:border-leaf"
                  />
                  <input
                    type="number"
                    value={item.fee}
                    onChange={(e) => updateDeliverable(item.id, "fee", e.target.value)}
                    placeholder={`Fee (${symbol})`}
                    className="rounded-lg border border-forest/10 bg-white px-2.5 py-1.5 font-bold outline-none focus:border-leaf"
                  />
                </div>
                <textarea
                  value={item.desc}
                  onChange={(e) => updateDeliverable(item.id, "desc", e.target.value)}
                  placeholder="Key messaging, talking points, mandatory tags, required hashtags..."
                  rows={2}
                  className="w-full rounded-lg border border-forest/10 bg-white px-2.5 py-1.5 outline-none focus:border-leaf"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Section 3: Commercials & Advance UPI */}
        <div className="space-y-3 pt-2 border-t border-forest/10">
          <h3 className="text-xs font-black uppercase tracking-wider text-forest/70">3. Commercials & Payment</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-forest">
              Advance Deposit Required (%)
              <input
                type="number"
                value={advancePercent}
                onChange={(e) => setAdvancePercent(e.target.value)}
                min="0"
                max="100"
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-xs outline-none focus:border-leaf"
              />
            </label>
            <label className="text-xs font-bold text-forest">
              Balance Payment Terms
              <input
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-xs outline-none focus:border-leaf"
              />
            </label>
            <label className="text-xs font-bold text-forest">
              Creator UPI ID for Advance
              <input
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                placeholder="creator@upi"
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-xs outline-none focus:border-leaf"
              />
            </label>
            <label className="text-xs font-bold text-forest">
              Payee Name on Bank Account
              <input
                value={payeeName}
                onChange={(e) => setPayeeName(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-xs outline-none focus:border-leaf"
              />
            </label>
          </div>
          <div className="rounded-xl bg-mint/50 p-3 text-xs flex justify-between items-center text-forest font-bold">
            <span>Total: {money(totals.total)}</span>
            <span>Advance ({totals.advPct}%): {money(totals.advance)}</span>
            <span>Balance: {money(totals.balance)}</span>
          </div>
        </div>

        {/* Section 4: Rights & Clauses */}
        <div className="space-y-3 pt-2 border-t border-forest/10">
          <h3 className="text-xs font-black uppercase tracking-wider text-forest/70">4. Legal Protection Terms</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-forest">
              Brand Review Window
              <input
                value={reviewWindow}
                onChange={(e) => setReviewWindow(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-xs outline-none focus:border-leaf"
              />
            </label>
            <label className="text-xs font-bold text-forest">
              Revision Rounds Included
              <input
                value={maxRevisions}
                onChange={(e) => setMaxRevisions(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-xs outline-none focus:border-leaf"
              />
            </label>
            <label className="text-xs font-bold text-forest sm:col-span-2">
              Category Exclusivity
              <input
                value={exclusivity}
                onChange={(e) => setExclusivity(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-xs outline-none focus:border-leaf"
              />
            </label>
            <label className="text-xs font-bold text-forest sm:col-span-2">
              Usage & Whitelisting Rights
              <input
                value={usageRights}
                onChange={(e) => setUsageRights(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-xs outline-none focus:border-leaf"
              />
            </label>
            <label className="text-xs font-bold text-forest sm:col-span-2">
              Cancellation & Kill Fee
              <input
                value={killFee}
                onChange={(e) => setKillFee(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-xs outline-none focus:border-leaf"
              />
            </label>
          </div>
        </div>
      </div>

      {/* Contract Paper Preview */}
      <div className="relative">
        <article
          ref={paperRef}
          className="mx-auto w-full max-w-[820px] rounded-[2rem] border border-forest/15 bg-white p-7 text-forest shadow-[0_24px_80px_rgba(17,59,44,0.12)] md:p-10 font-sans text-xs leading-relaxed"
        >
          {/* Header */}
          <header className="border-b-2 border-forest pb-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-leaf">Commercial Agreement</p>
                <div className="mt-1 text-2xl font-black tracking-tight text-forest">INFLUENCER COLLABORATION AGREEMENT</div>
                <p className="mt-1 font-semibold text-forest/70">Campaign: {campaignName || "Untitled Campaign"}</p>
              </div>
              <div className="text-right text-[11px] font-bold text-forest/70">
                <p>{tr("Date")}: {agreementDate}</p>
                <p>Valid Till: {completionDate}</p>
              </div>
            </div>
          </header>

          {/* 1. Parties */}
          <section className="mt-5 space-y-2">
            <h2 className="text-xs font-black uppercase tracking-wider text-leaf border-b border-forest/10 pb-1">
              1. Parties to the Agreement
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl bg-forest/5 p-3">
                <p className="font-black text-forest">THE BRAND / AGENCY:</p>
                <p className="font-bold">{brandName}</p>
                <p className="text-forest/70">Representative: {brandRep}</p>
                <p className="text-forest/70">Email: {brandEmail}</p>
                {brandGstin && <p className="text-forest/70">GSTIN: {brandGstin}</p>}
              </div>
              <div className="rounded-xl bg-mint/40 p-3">
                <p className="font-black text-forest">THE CREATOR / INFLUENCER:</p>
                <p className="font-bold">{creatorName} ({creatorHandle})</p>
                <p className="text-forest/70">Platform: {primaryPlatform}</p>
                <p className="text-forest/70">Email: {creatorEmail}</p>
                {creatorPan && <p className="text-forest/70">PAN: {creatorPan}</p>}
              </div>
            </div>
          </section>

          {/* 2. Deliverables Table */}
          <section className="mt-5 space-y-2">
            <h2 className="text-xs font-black uppercase tracking-wider text-leaf border-b border-forest/10 pb-1">
              2. Scope of Work & Deliverables
            </h2>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-forest/20 text-[10px] font-black uppercase text-forest/80">
                  <th className="py-1.5">#</th>
                  <th className="py-1.5">Platform & Format</th>
                  <th className="py-1.5">Specifications & Scope</th>
                  <th className="py-1.5 text-right">Due Date</th>
                  <th className="py-1.5 text-right">Fee</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-forest/10">
                {deliverables.map((d, i) => (
                  <tr key={d.id}>
                    <td className="py-2 font-bold">{i + 1}</td>
                    <td className="py-2 font-bold">{d.platform} - {d.type}</td>
                    <td className="py-2 text-forest/80">{d.desc}</td>
                    <td className="py-2 text-right whitespace-nowrap">{d.dueDate}</td>
                    <td className="py-2 text-right font-bold whitespace-nowrap">{money(Number(d.fee) || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* 3. Commercials & Advance QR */}
          <section className="mt-5 space-y-2">
            <h2 className="text-xs font-black uppercase tracking-wider text-leaf border-b border-forest/10 pb-1">
              3. Commercial Terms & Payment Schedule
            </h2>
            <div className="grid grid-cols-[1.5fr_1fr] gap-4 items-center">
              <div className="space-y-1.5">
                <div className="flex justify-between border-b border-forest/10 py-1">
                  <span className="font-semibold">Total Agreed Compensation:</span>
                  <span className="font-black text-sm">{money(totals.total)}</span>
                </div>
                <div className="flex justify-between border-b border-forest/10 py-1">
                  <span className="font-semibold">Advance Retainer ({totals.advPct}%):</span>
                  <span className="font-bold text-leaf">{money(totals.advance)}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="font-semibold">Remaining Balance ({100 - totals.advPct}%):</span>
                  <span className="font-bold">{money(totals.balance)}</span>
                </div>
                <p className="text-[10px] text-forest/70 pt-1">
                  <strong>Balance Terms:</strong> {paymentTerms}. Applicable TDS under Section 194R or 194C of the Income Tax Act will be deducted with certificate.
                </p>
              </div>

              {/* Advance UPI QR Box */}
              {qrDataUrl && (
                <div className="flex flex-col items-center justify-center rounded-xl border border-forest/10 bg-cream/40 p-2.5 text-center">
                  <img src={qrDataUrl} alt="Advance UPI QR" className="h-24 w-24 rounded-lg shadow-sm" />
                  <p className="mt-1 text-[9px] font-black text-forest">Scan to Pay Advance</p>
                  <p className="text-[9px] font-mono text-forest/70">{upiId}</p>
                </div>
              )}
            </div>
          </section>

          {/* 4. Protective Legal Clauses */}
          <section className="mt-5 space-y-2">
            <h2 className="text-xs font-black uppercase tracking-wider text-leaf border-b border-forest/10 pb-1">
              4. Key Terms & Operational Guidelines
            </h2>
            <ol className="list-decimal pl-4 space-y-1.5 text-[11px] text-forest/80">
              <li>
                <strong>Script & Draft Approvals:</strong> Creator will share draft/script with Brand prior to filming. Brand has <strong>{reviewWindow}</strong> to provide constructive feedback. Agreement includes up to <strong>{maxRevisions}</strong> of revisions. Additional rounds will be billed at standard hourly rates.
              </li>
              <li>
                <strong>Exclusivity:</strong> During the campaign period and for <strong>{exclusivity}</strong>, Creator agrees not to promote direct competing brands in the specified niche.
              </li>
              <li>
                <strong>Usage Rights & Whitelisting:</strong> {usageRights}. Brand shall not edit, modify, or repurpose content for television or print without separate written consent.
              </li>
              <li>
                <strong>Regulatory Disclosures (ASCI):</strong> In compliance with ASCI Guidelines and the Consumer Protection Act, all sponsored content must feature prominent disclosure labels (e.g., #ad, #collab, or platform "Paid Partnership" tags).
              </li>
              <li>
                <strong>Cancellation & Kill Fee:</strong> {killFee}.
              </li>
              <li>
                <strong>Independent Contractor:</strong> Creator acts solely as an independent contractor, not an agent or employee of Brand.
              </li>
            </ol>
          </section>

          {/* 5. Signatures */}
          <section className="mt-7 pt-4 border-t-2 border-forest">
            <p className="text-[10px] font-bold text-forest/60 mb-4">
              IN WITNESS WHEREOF, the parties hereto have executed this Collaboration Agreement as of the Effective Date.
            </p>
            <div className="grid grid-cols-2 gap-8 pt-4">
              <div className="border-t border-forest/30 pt-2">
                <p className="font-bold text-forest">{brandSignatory}</p>
                <p className="text-[10px] text-forest/60">Authorized Signatory (Brand)</p>
                <p className="text-[10px] text-forest/60">{tr("Date")}: {agreementDate}</p>
              </div>
              <div className="border-t border-forest/30 pt-2 text-right">
                <p className="font-bold text-forest">{creatorSignatory}</p>
                <p className="text-[10px] text-forest/60">Creator / Influencer</p>
                <p className="text-[10px] text-forest/60">{tr("Date")}: {agreementDate}</p>
              </div>
            </div>
          </section>

          <footer className="mt-6 pt-3 border-t border-forest/10 text-center text-[9px] text-forest/50">
            Prepared with Pro UPI QR Influencer Contract Generator &bull; Private, client-side, legal-ready document.
          </footer>
        </article>
      </div>
    </div>
  );
}
