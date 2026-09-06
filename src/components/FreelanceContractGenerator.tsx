import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { safeToPng, downloadDataUrl, notifyExportError, withTimeout } from "../lib/export-image";
import { trackProductEvent } from "../lib/productEvents";

const DRAFT_KEY = "proupiqr-freelance-contract-draft";

function money(value: number) {
  return `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value || 0)}`;
}

function isValidUpiId(upiId: string) {
  return /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(upiId.trim());
}

export interface MilestoneItem {
  id: number;
  title: string;
  desc: string;
  dueDate: string;
  amount: string;
}

let _milestoneId = 20;
function nextMilestoneId() {
  return ++_milestoneId;
}

export function FreelanceContractGenerator() {
  const today = new Date().toISOString().slice(0, 10);
  const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  // Client Details
  const [clientName, setClientName] = useState("Zenith Retail Pvt Ltd");
  const [clientRep, setClientRep] = useState("Rajesh Mehta (Director of Operations)");
  const [clientEmail, setClientEmail] = useState("rajesh@zenithretail.example");
  const [clientGstin, setClientGstin] = useState("27AAAAA0000A1Z5");

  // Freelancer / Studio Details
  const [freelancerName, setFreelancerName] = useState("Arjun Verma");
  const [tradeName, setTradeName] = useState("Verma Digital Studio");
  const [freelancerEmail, setFreelancerEmail] = useState("arjun@vermadigital.example");
  const [freelancerPan, setFreelancerPan] = useState("ABCDE9876K");

  // Project Info
  const [projectName, setProjectName] = useState("E-Commerce Web Redesign & UPI Checkout");
  const [agreementDate, setAgreementDate] = useState(today);
  const [targetCompletionDate, setTargetCompletionDate] = useState(nextMonth);

  // Milestones & Deliverables
  const [milestones, setMilestones] = useState<MilestoneItem[]>([
    {
      id: 1,
      title: "Discovery & UI/UX Wireframes",
      desc: "Information architecture, high-fidelity Figma prototypes for mobile and desktop checkouts.",
      dueDate: today,
      amount: "30000",
    },
    {
      id: 2,
      title: "Frontend & Payment Flow Development",
      desc: "Responsive frontend development, UPI intent integration, and cross-browser testing.",
      dueDate: nextMonth,
      amount: "45000",
    },
  ]);

  // Protective Clauses
  const [advancePercent, setAdvancePercent] = useState("40");
  const [paymentTerms, setPaymentTerms] = useState("Net 7 days upon milestone demo and invoice issuance");
  const [revisionRounds, setRevisionRounds] = useState("2 rounds included per milestone; additional scope billed at ₹1,500/hour");
  const [reviewTurnaround, setReviewTurnaround] = useState("3 business days; lack of feedback constitutes acceptance");
  const [ipClause, setIpClause] = useState("All intellectual property rights transfer to Client ONLY upon 100% receipt of final payment. Freelancer retains portfolio showcase rights.");
  const [lateFee, setLateFee] = useState("1.5% per month (or statutory Section 16 MSMED interest if MSME registered)");
  const [killFee, setKillFee] = useState("Either party may terminate with 7 days written notice. Client pays for completed work plus 25% kill fee on remaining project balance.");

  // Payment UPI
  const [upiId, setUpiId] = useState("arjun@okaxis");
  const [payeeName, setPayeeName] = useState("Arjun Verma");
  const [qrDataUrl, setQrDataUrl] = useState("");

  // Signatures
  const [clientSignatory, setClientSignatory] = useState("For Zenith Retail Pvt Ltd");
  const [freelancerSignatory, setFreelancerSignatory] = useState("Arjun Verma (Freelancer / Contractor)");

  // Export States
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
      if (d.clientName) setClientName(d.clientName);
      if (d.clientRep) setClientRep(d.clientRep);
      if (d.clientEmail) setClientEmail(d.clientEmail);
      if (d.clientGstin) setClientGstin(d.clientGstin);
      if (d.freelancerName) setFreelancerName(d.freelancerName);
      if (d.tradeName) setTradeName(d.tradeName);
      if (d.freelancerEmail) setFreelancerEmail(d.freelancerEmail);
      if (d.freelancerPan) setFreelancerPan(d.freelancerPan);
      if (d.projectName) setProjectName(d.projectName);
      if (d.agreementDate) setAgreementDate(d.agreementDate);
      if (d.targetCompletionDate) setTargetCompletionDate(d.targetCompletionDate);
      if (Array.isArray(d.milestones) && d.milestones.length > 0) setMilestones(d.milestones);
      if (d.advancePercent) setAdvancePercent(d.advancePercent);
      if (d.paymentTerms) setPaymentTerms(d.paymentTerms);
      if (d.revisionRounds) setRevisionRounds(d.revisionRounds);
      if (d.reviewTurnaround) setReviewTurnaround(d.reviewTurnaround);
      if (d.ipClause) setIpClause(d.ipClause);
      if (d.lateFee) setLateFee(d.lateFee);
      if (d.killFee) setKillFee(d.killFee);
      if (d.upiId) setUpiId(d.upiId);
      if (d.payeeName) setPayeeName(d.payeeName);
      if (d.clientSignatory) setClientSignatory(d.clientSignatory);
      if (d.freelancerSignatory) setFreelancerSignatory(d.freelancerSignatory);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          clientName, clientRep, clientEmail, clientGstin,
          freelancerName, tradeName, freelancerEmail, freelancerPan,
          projectName, agreementDate, targetCompletionDate, milestones,
          advancePercent, paymentTerms, revisionRounds, reviewTurnaround,
          ipClause, lateFee, killFee, upiId, payeeName,
          clientSignatory, freelancerSignatory,
        })
      );
    } catch {}
  }, [
    clientName, clientRep, clientEmail, clientGstin,
    freelancerName, tradeName, freelancerEmail, freelancerPan,
    projectName, agreementDate, targetCompletionDate, milestones,
    advancePercent, paymentTerms, revisionRounds, reviewTurnaround,
    ipClause, lateFee, killFee, upiId, payeeName,
    clientSignatory, freelancerSignatory,
  ]);

  // Calculations
  const totals = useMemo(() => {
    const total = milestones.reduce((acc, m) => acc + (Math.max(0, Number(m.amount) || 0)), 0);
    const advPct = Math.min(100, Math.max(0, Number(advancePercent) || 0));
    const advance = Math.round((total * advPct) / 100);
    const balance = total - advance;
    return { total, advPct, advance, balance };
  }, [milestones, advancePercent]);

  // QR Code Generation
  useEffect(() => {
    if (upiId && isValidUpiId(upiId) && totals.advance > 0) {
      const uri = `upi://pay?pa=${encodeURIComponent(upiId.trim())}&pn=${encodeURIComponent(payeeName.trim() || freelancerName.trim())}&am=${totals.advance}&cu=INR&tn=${encodeURIComponent(`Adv ${projectName.slice(0, 20)}`)}`;
      QRCode.toDataURL(uri, { margin: 1, width: 140 }).then(setQrDataUrl).catch(() => setQrDataUrl(""));
    } else {
      setQrDataUrl("");
    }
  }, [upiId, payeeName, freelancerName, totals.advance, projectName]);

  const addMilestone = () => {
    setMilestones([
      ...milestones,
      {
        id: nextMilestoneId(),
        title: "Quality Assurance & Production Launch",
        desc: "Final bug fixing, client walkthrough, and deployment to production hosting.",
        dueDate: targetCompletionDate,
        amount: "25000",
      },
    ]);
  };

  const removeMilestone = (id: number) => {
    if (milestones.length <= 1) return;
    setMilestones(milestones.filter((m) => m.id !== id));
  };

  const updateMilestone = (id: number, field: keyof MilestoneItem, value: string) => {
    setMilestones(milestones.map((m) => (m.id === id ? { ...m, [field]: value } : m)));
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
      pdf.save(`freelance-agreement-${projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`);
      trackProductEvent("export_pdf", "freelance-contract");
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
      downloadDataUrl(du, `freelance-agreement-${projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`);
      trackProductEvent("export_png", "freelance-contract");
      setPngState("idle");
    } catch (e) {
      console.error(e);
      notifyExportError("PNG generation failed");
      setPngState("error");
    }
  }

  function copyAgreementText() {
    const text = `FREELANCE SERVICE AGREEMENT & STATEMENT OF WORK
Effective Date: ${agreementDate} | Project: ${projectName}

1. PARTIES
Client: ${clientName} (Rep: ${clientRep}, Email: ${clientEmail}, GSTIN: ${clientGstin || "N/A"})
Contractor / Freelancer: ${freelancerName} (${tradeName}, Email: ${freelancerEmail}, PAN: ${freelancerPan || "N/A"})

2. SCOPE OF WORK & MILESTONES
${milestones.map((m, i) => `${i + 1}. ${m.title} - ${m.desc} (Target Date: ${m.dueDate}, Amount: ₹${m.amount})`).join("\n")}

3. COMMERCIALS & PAYMENT SCHEDULE
- Total Project Value: ${money(totals.total)}
- Advance Retainer (${totals.advPct}%): ${money(totals.advance)} (Due upon signing before work begins)
- Balance Amount: ${money(totals.balance)} payable per ${paymentTerms}
- UPI ID for Payment: ${upiId} (${payeeName})

4. KEY TERMS OF ENGAGEMENT
- Revisions: ${revisionRounds}.
- Client Review SLA: ${reviewTurnaround}.
- Intellectual Property: ${ipClause}.
- Late Payment Fee: ${lateFee}.
- Termination & Kill Fee: ${killFee}.
- Relationship: Independent contractor. Not an employer-employee relationship.

SIGNATURES:
For Client: ${clientSignatory} (Date: ${agreementDate})
For Freelancer: ${freelancerSignatory} (Date: ${agreementDate})`;

    navigator.clipboard.writeText(text).then(() => {
      setCopiedState(true);
      trackProductEvent("copy", "freelance-contract");
      setTimeout(() => setCopiedState(false), 2500);
    });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
      {/* Editor Console */}
      <div className="no-print space-y-6 rounded-[2rem] border border-white/75 bg-white/90 p-5 shadow-[0_18px_48px_rgba(17,59,44,0.08)] sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-forest/10 pb-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-leaf">Contractor Legal Protection</p>
            <h2 className="mt-1 text-2xl font-black text-forest">Freelance Agreement</h2>
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
              {pngState === "busy" ? "..." : "Export PNG"}
            </button>
            <button
              onClick={downloadPdf}
              disabled={pdfState === "busy"}
              className="rounded-full bg-forest px-4 py-1.5 text-xs font-bold text-white transition hover:bg-leaf disabled:opacity-50"
            >
              {pdfState === "busy" ? "Generating..." : "Export PDF"}
            </button>
          </div>
        </div>

        {/* Section 1: Client & Freelancer Info */}
        <div className="space-y-4">
          <h3 className="text-xs font-black uppercase tracking-wider text-forest/70">1. Parties</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-forest">
              Client / Company Name
              <input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-xs outline-none focus:border-leaf"
              />
            </label>
            <label className="text-xs font-bold text-forest">
              Client Contact Person
              <input
                value={clientRep}
                onChange={(e) => setClientRep(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-xs outline-none focus:border-leaf"
              />
            </label>
            <label className="text-xs font-bold text-forest">
              Client Email
              <input
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-xs outline-none focus:border-leaf"
              />
            </label>
            <label className="text-xs font-bold text-forest">
              Client GSTIN / Tax ID
              <input
                value={clientGstin}
                onChange={(e) => setClientGstin(e.target.value)}
                placeholder="27AAAAA0000A1Z5"
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-xs outline-none focus:border-leaf"
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 pt-2 border-t border-forest/10">
            <label className="text-xs font-bold text-forest">
              Freelancer Legal Name
              <input
                value={freelancerName}
                onChange={(e) => setFreelancerName(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-xs outline-none focus:border-leaf"
              />
            </label>
            <label className="text-xs font-bold text-forest">
              Studio / Trade Name (Optional)
              <input
                value={tradeName}
                onChange={(e) => setTradeName(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-xs outline-none focus:border-leaf"
              />
            </label>
            <label className="text-xs font-bold text-forest">
              Freelancer Email
              <input
                value={freelancerEmail}
                onChange={(e) => setFreelancerEmail(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-xs outline-none focus:border-leaf"
              />
            </label>
            <label className="text-xs font-bold text-forest">
              Freelancer PAN (for TDS 194J)
              <input
                value={freelancerPan}
                onChange={(e) => setFreelancerPan(e.target.value)}
                placeholder="ABCDE9876K"
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-xs outline-none focus:border-leaf"
              />
            </label>
          </div>
        </div>

        {/* Section 2: Project & Milestones */}
        <div className="space-y-3 pt-2 border-t border-forest/10">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-wider text-forest/70">2. Scope & Milestones</h3>
            <button onClick={addMilestone} className="text-xs font-bold text-leaf hover:underline">
              + Add Milestone
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs font-bold text-forest sm:col-span-3">
              Project Title / Objective
              <input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-xs outline-none focus:border-leaf"
              />
            </label>
            <label className="text-xs font-bold text-forest">
              Contract Date
              <input
                type="date"
                value={agreementDate}
                onChange={(e) => setAgreementDate(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-xs outline-none focus:border-leaf"
              />
            </label>
            <label className="text-xs font-bold text-forest sm:col-span-2">
              Target Completion Date
              <input
                type="date"
                value={targetCompletionDate}
                onChange={(e) => setTargetCompletionDate(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-xs outline-none focus:border-leaf"
              />
            </label>
          </div>

          <div className="space-y-2.5 pt-2">
            {milestones.map((item, idx) => (
              <div key={item.id} className="relative rounded-2xl border border-forest/10 bg-cream/50 p-3 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-forest">Milestone #{idx + 1}</span>
                  {milestones.length > 1 && (
                    <button onClick={() => removeMilestone(item.id)} className="text-red-500 font-bold hover:underline">
                      Remove
                    </button>
                  )}
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <input
                    value={item.title}
                    onChange={(e) => updateMilestone(item.id, "title", e.target.value)}
                    placeholder="Milestone Title"
                    className="sm:col-span-2 rounded-lg border border-forest/10 bg-white px-2.5 py-1.5 outline-none focus:border-leaf font-semibold"
                  />
                  <input
                    type="number"
                    value={item.amount}
                    onChange={(e) => updateMilestone(item.id, "amount", e.target.value)}
                    placeholder="Amount (₹)"
                    className="rounded-lg border border-forest/10 bg-white px-2.5 py-1.5 font-bold outline-none focus:border-leaf"
                  />
                </div>
                <textarea
                  value={item.desc}
                  onChange={(e) => updateMilestone(item.id, "desc", e.target.value)}
                  placeholder="Deliverable details, technical requirements, acceptance criteria..."
                  rows={2}
                  className="w-full rounded-lg border border-forest/10 bg-white px-2.5 py-1.5 outline-none focus:border-leaf"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Section 3: Commercials & Advance UPI */}
        <div className="space-y-3 pt-2 border-t border-forest/10">
          <h3 className="text-xs font-black uppercase tracking-wider text-forest/70">3. Commercials & Advance Deposit</h3>
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
              Milestone Payment Terms
              <input
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-xs outline-none focus:border-leaf"
              />
            </label>
            <label className="text-xs font-bold text-forest">
              Freelancer UPI ID
              <input
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                placeholder="freelancer@upi"
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-xs outline-none focus:border-leaf"
              />
            </label>
            <label className="text-xs font-bold text-forest">
              Beneficiary Name
              <input
                value={payeeName}
                onChange={(e) => setPayeeName(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-xs outline-none focus:border-leaf"
              />
            </label>
          </div>
          <div className="rounded-xl bg-mint/50 p-3 text-xs flex justify-between items-center text-forest font-bold">
            <span>Total: {money(totals.total)}</span>
            <span>Advance Deposit ({totals.advPct}%): {money(totals.advance)}</span>
            <span>Milestone Balance: {money(totals.balance)}</span>
          </div>
        </div>

        {/* Section 4: Protective Terms */}
        <div className="space-y-3 pt-2 border-t border-forest/10">
          <h3 className="text-xs font-black uppercase tracking-wider text-forest/70">4. Protective Legal Terms</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-forest sm:col-span-2">
              Revision Limit & Out-of-Scope Work
              <input
                value={revisionRounds}
                onChange={(e) => setRevisionRounds(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-xs outline-none focus:border-leaf"
              />
            </label>
            <label className="text-xs font-bold text-forest sm:col-span-2">
              Client Feedback Turnaround (SLA)
              <input
                value={reviewTurnaround}
                onChange={(e) => setReviewTurnaround(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-xs outline-none focus:border-leaf"
              />
            </label>
            <label className="text-xs font-bold text-forest sm:col-span-2">
              Intellectual Property (IP) Transfer Condition
              <input
                value={ipClause}
                onChange={(e) => setIpClause(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-xs outline-none focus:border-leaf"
              />
            </label>
            <label className="text-xs font-bold text-forest">
              Late Payment Interest
              <input
                value={lateFee}
                onChange={(e) => setLateFee(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-xs outline-none focus:border-leaf"
              />
            </label>
            <label className="text-xs font-bold text-forest">
              Termination & Kill Fee
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
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-leaf">Contractual Statement of Work</p>
                <div className="mt-1 text-2xl font-black tracking-tight text-forest">FREELANCE SERVICE AGREEMENT</div>
                <p className="mt-1 font-semibold text-forest/70">Project: {projectName || "Untitled Project"}</p>
              </div>
              <div className="text-right text-[11px] font-bold text-forest/70">
                <p>Date: {agreementDate}</p>
                <p>Target Delivery: {targetCompletionDate}</p>
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
                <p className="font-black text-forest">THE CLIENT:</p>
                <p className="font-bold">{clientName}</p>
                <p className="text-forest/70">Representative: {clientRep}</p>
                <p className="text-forest/70">Email: {clientEmail}</p>
                {clientGstin && <p className="text-forest/70">GSTIN: {clientGstin}</p>}
              </div>
              <div className="rounded-xl bg-mint/40 p-3">
                <p className="font-black text-forest">THE CONTRACTOR / FREELANCER:</p>
                <p className="font-bold">{freelancerName} {tradeName ? `(${tradeName})` : ""}</p>
                <p className="text-forest/70">Email: {freelancerEmail}</p>
                {freelancerPan && <p className="text-forest/70">PAN: {freelancerPan}</p>}
              </div>
            </div>
          </section>

          {/* 2. Scope & Milestones */}
          <section className="mt-5 space-y-2">
            <h2 className="text-xs font-black uppercase tracking-wider text-leaf border-b border-forest/10 pb-1">
              2. Scope of Work & Milestone Schedule
            </h2>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-forest/20 text-[10px] font-black uppercase text-forest/80">
                  <th className="py-1.5">#</th>
                  <th className="py-1.5">Milestone</th>
                  <th className="py-1.5">Deliverable Description</th>
                  <th className="py-1.5 text-right">Target Date</th>
                  <th className="py-1.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-forest/10">
                {milestones.map((m, i) => (
                  <tr key={m.id}>
                    <td className="py-2 font-bold">{i + 1}</td>
                    <td className="py-2 font-bold">{m.title}</td>
                    <td className="py-2 text-forest/80">{m.desc}</td>
                    <td className="py-2 text-right whitespace-nowrap">{m.dueDate}</td>
                    <td className="py-2 text-right font-bold whitespace-nowrap">{money(Number(m.amount) || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* 3. Commercials & Advance QR */}
          <section className="mt-5 space-y-2">
            <h2 className="text-xs font-black uppercase tracking-wider text-leaf border-b border-forest/10 pb-1">
              3. Commercial Terms & Payment Details
            </h2>
            <div className="grid grid-cols-[1.5fr_1fr] gap-4 items-center">
              <div className="space-y-1.5">
                <div className="flex justify-between border-b border-forest/10 py-1">
                  <span className="font-semibold">Total Project Value:</span>
                  <span className="font-black text-sm">{money(totals.total)}</span>
                </div>
                <div className="flex justify-between border-b border-forest/10 py-1">
                  <span className="font-semibold">Advance Retainer ({totals.advPct}%):</span>
                  <span className="font-bold text-leaf">{money(totals.advance)}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="font-semibold">Milestone Balance ({100 - totals.advPct}%):</span>
                  <span className="font-bold">{money(totals.balance)}</span>
                </div>
                <p className="text-[10px] text-forest/70 pt-1">
                  <strong>Invoicing Terms:</strong> {paymentTerms}. Work initiates only after advance confirmation.
                </p>
              </div>

              {/* Advance UPI QR Box */}
              {qrDataUrl && (
                <div className="flex flex-col items-center justify-center rounded-xl border border-forest/10 bg-cream/40 p-2.5 text-center">
                  <img src={qrDataUrl} alt="Advance Deposit QR" className="h-24 w-24 rounded-lg shadow-sm" />
                  <p className="mt-1 text-[9px] font-black text-forest">Scan to Pay Deposit</p>
                  <p className="text-[9px] font-mono text-forest/70">{upiId}</p>
                </div>
              )}
            </div>
          </section>

          {/* 4. Terms of Engagement */}
          <section className="mt-5 space-y-2">
            <h2 className="text-xs font-black uppercase tracking-wider text-leaf border-b border-forest/10 pb-1">
              4. Standard Terms of Engagement
            </h2>
            <ol className="list-decimal pl-4 space-y-1.5 text-[11px] text-forest/80">
              <li>
                <strong>Revision Limits:</strong> {revisionRounds}.
              </li>
              <li>
                <strong>Review & Approval SLA:</strong> {reviewTurnaround}. Delays in Client feedback directly push back target completion dates.
              </li>
              <li>
                <strong>Intellectual Property Rights:</strong> {ipClause}.
              </li>
              <li>
                <strong>Late Payment Interest:</strong> Overdue invoices incur interest at <strong>{lateFee}</strong> until settled in full.
              </li>
              <li>
                <strong>Termination & Kill Fee:</strong> {killFee}.
              </li>
              <li>
                <strong>Independent Contractor:</strong> The parties agree this agreement does not establish an employment, joint venture, or partnership arrangement.
              </li>
            </ol>
          </section>

          {/* 5. Signatures */}
          <section className="mt-7 pt-4 border-t-2 border-forest">
            <p className="text-[10px] font-bold text-forest/60 mb-4">
              IN WITNESS WHEREOF, both parties agree to the scope, deliverables, and commercial terms set forth above.
            </p>
            <div className="grid grid-cols-2 gap-8 pt-4">
              <div className="border-t border-forest/30 pt-2">
                <p className="font-bold text-forest">{clientSignatory}</p>
                <p className="text-[10px] text-forest/60">Authorized Signatory (Client)</p>
                <p className="text-[10px] text-forest/60">Date: {agreementDate}</p>
              </div>
              <div className="border-t border-forest/30 pt-2 text-right">
                <p className="font-bold text-forest">{freelancerSignatory}</p>
                <p className="text-[10px] text-forest/60">Contractor / Freelancer</p>
                <p className="text-[10px] text-forest/60">Date: {agreementDate}</p>
              </div>
            </div>
          </section>

          <footer className="mt-6 pt-3 border-t border-forest/10 text-center text-[9px] text-forest/50">
            Prepared with Pro UPI QR Freelance Contract Generator &bull; Private, client-side, legal-ready document.
          </footer>
        </article>
      </div>
    </div>
  );
}
