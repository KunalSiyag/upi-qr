import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { safeToPng, downloadDataUrl, notifyExportError, withTimeout } from "../lib/export-image";
import { trackProductEvent } from "../lib/productEvents";
import {
  collectStrings,
  formatMoney,
  isDocLang,
  swapIfDefault,
  type DocLang,
  withCurrencyDeep,
} from "../data/documentLang";
import {
  FREELANCE_COPY,
  formatClientSignatory,
  formatFreelancerSignatory,
  freelanceDefaults,
  type FreelanceCopy,
} from "../data/freelanceContractI18n";

const DRAFT_KEY = "proupiqr-freelance-contract-draft";

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

function sampleMilestones(copy: FreelanceCopy, today: string, nextMonth: string): MilestoneItem[] {
  return copy.sampleMilestones.map((item, index) => ({
    id: index + 1,
    title: item.title,
    desc: item.desc,
    dueDate: index === 0 ? today : nextMonth,
    amount: index === 0 ? "30000" : "45000",
  }));
}

export function FreelanceContractGenerator({ lang = "en" }: { lang?: DocLang } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const initialCopy = FREELANCE_COPY[lang] ?? FREELANCE_COPY.en;

  const t = withCurrencyDeep(FREELANCE_COPY[lang] ?? FREELANCE_COPY.en, lang);

  const [clientName, setClientName] = useState("Zenith Retail Pvt Ltd");
  const [clientRep, setClientRep] = useState("Rajesh Mehta (Director of Operations)");
  const [clientEmail, setClientEmail] = useState("rajesh@zenithretail.example");
  const [clientGstin, setClientGstin] = useState("27AAAAA0000A1Z5");

  const [freelancerName, setFreelancerName] = useState("Arjun Verma");
  const [tradeName, setTradeName] = useState("Verma Digital Studio");
  const [freelancerEmail, setFreelancerEmail] = useState("arjun@vermadigital.example");
  const [freelancerPan, setFreelancerPan] = useState("ABCDE9876K");

  const [projectName, setProjectName] = useState("E-Commerce Web Redesign & UPI Checkout");
  const [agreementDate, setAgreementDate] = useState(today);
  const [targetCompletionDate, setTargetCompletionDate] = useState(nextMonth);

  const [milestones, setMilestones] = useState<MilestoneItem[]>(() => sampleMilestones(initialCopy, today, nextMonth));

  const [advancePercent, setAdvancePercent] = useState("40");
  const [paymentTerms, setPaymentTerms] = useState(initialCopy.defaultPaymentTerms);
  const [revisionRounds, setRevisionRounds] = useState(initialCopy.defaultRevision);
  const [reviewTurnaround, setReviewTurnaround] = useState(initialCopy.defaultReview);
  const [ipClause, setIpClause] = useState(initialCopy.defaultIp);
  const [lateFee, setLateFee] = useState(initialCopy.defaultLateFee);
  const [killFee, setKillFee] = useState(initialCopy.defaultKillFee);

  const [upiId, setUpiId] = useState("arjun@okaxis");
  const [payeeName, setPayeeName] = useState("Arjun Verma");
  const [qrDataUrl, setQrDataUrl] = useState("");

  const [clientSignatory, setClientSignatory] = useState(() =>
    formatClientSignatory(initialCopy, "Zenith Retail Pvt Ltd")
  );
  const [freelancerSignatory, setFreelancerSignatory] = useState(() =>
    formatFreelancerSignatory(initialCopy, "Arjun Verma")
  );

  const paperRef = useRef<HTMLDivElement | null>(null);
  const persistReady = useRef(false);
  const [pdfState, setPdfState] = useState<"idle" | "busy" | "error">("idle");
  const [pngState, setPngState] = useState<"idle" | "busy" | "error">("idle");
  const [copiedState, setCopiedState] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const d = JSON.parse(saved);
        const savedLang: DocLang = isDocLang(d.docLang) ? d.docLang : lang;
        const copy = FREELANCE_COPY[savedLang] ?? FREELANCE_COPY.en;
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
        if (savedLang !== lang) {
          applyLanguage(lang, copy, false);
        }
      } else if (lang !== "en") {
        applyLanguage(lang, FREELANCE_COPY.en, true);
      }
    } catch {
      // Keep built-in sample if the draft is unreadable.
    } finally {
      persistReady.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!persistReady.current) return;
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          clientName,
          clientRep,
          clientEmail,
          clientGstin,
          freelancerName,
          tradeName,
          freelancerEmail,
          freelancerPan,
          projectName,
          agreementDate,
          targetCompletionDate,
          milestones,
          advancePercent,
          paymentTerms,
          revisionRounds,
          reviewTurnaround,
          ipClause,
          lateFee,
          killFee,
          upiId,
          payeeName,
          clientSignatory,
          freelancerSignatory,
        })
      );
    } catch {}
  }, [
    clientName,
    clientRep,
    clientEmail,
    clientGstin,
    freelancerName,
    tradeName,
    freelancerEmail,
    freelancerPan,
    projectName,
    agreementDate,
    targetCompletionDate,
    milestones,
    advancePercent,
    paymentTerms,
    revisionRounds,
    reviewTurnaround,
    ipClause,
    lateFee,
    killFee,
    upiId,
    payeeName,
    clientSignatory,
    freelancerSignatory,
  ]);

  const totals = useMemo(() => {
    const total = milestones.reduce((acc, m) => acc + Math.max(0, Number(m.amount) || 0), 0);
    const advPct = Math.min(100, Math.max(0, Number(advancePercent) || 0));
    const advance = Math.round((total * advPct) / 100);
    const balance = total - advance;
    return { total, advPct, advance, balance };
  }, [milestones, advancePercent]);

  const money = (value: number) => formatMoney(value, lang);

  useEffect(() => {
    if (upiId && isValidUpiId(upiId) && totals.advance > 0) {
      const uri = `upi://pay?pa=${encodeURIComponent(upiId.trim())}&pn=${encodeURIComponent(payeeName.trim() || freelancerName.trim())}&am=${totals.advance}&cu=INR&tn=${encodeURIComponent(`Adv ${projectName.slice(0, 20)}`)}`;
      QRCode.toDataURL(uri, { margin: 1, width: 140 }).then(setQrDataUrl).catch(() => setQrDataUrl(""));
    } else {
      setQrDataUrl("");
    }
  }, [upiId, payeeName, freelancerName, totals.advance, projectName]);

  function applyLanguage(next: DocLang, prevCopy: FreelanceCopy, forceDefaults: boolean) {
    const n = FREELANCE_COPY[next] ?? FREELANCE_COPY.en;
    const swap = (current: string, field: Parameters<typeof freelanceDefaults>[0]) =>
      forceDefaults ? n[field] : swapIfDefault(current, freelanceDefaults(field), n[field]);

    setPaymentTerms((current) => swap(current, "defaultPaymentTerms"));
    setRevisionRounds((current) => swap(current, "defaultRevision"));
    setReviewTurnaround((current) => swap(current, "defaultReview"));
    setIpClause((current) => swap(current, "defaultIp"));
    setLateFee((current) => swap(current, "defaultLateFee"));
    setKillFee((current) => swap(current, "defaultKillFee"));
    setClientSignatory((current) => {
      const prevDefault = formatClientSignatory(prevCopy, clientName);
      const nextDefault = formatClientSignatory(n, clientName);
      return forceDefaults || current === prevDefault ? nextDefault : current;
    });
    setFreelancerSignatory((current) => {
      const prevDefault = formatFreelancerSignatory(prevCopy, freelancerName);
      const nextDefault = formatFreelancerSignatory(n, freelancerName);
      return forceDefaults || current === prevDefault ? nextDefault : current;
    });
    setMilestones((current) => {
      if (forceDefaults) return sampleMilestones(n, today, nextMonth);
      return current.map((item, index) => {
        const nextSample =
          n.sampleMilestones[index] ??
          (index >= n.sampleMilestones.length ? n.addMilestoneSample : undefined);
        if (!nextSample) return item;
        const titleDefaults = collectStrings(FREELANCE_COPY, "addMilestoneSample")
          .concat(Object.values(FREELANCE_COPY).flatMap((c) => c.sampleMilestones.map((s) => s.title)));
        const descDefaults = Object.values(FREELANCE_COPY).flatMap((c) => [
          ...c.sampleMilestones.map((s) => s.desc),
          c.addMilestoneSample.desc,
        ]);
        return {
          ...item,
          title: swapIfDefault(item.title, titleDefaults, nextSample.title),
          desc: swapIfDefault(item.desc, descDefaults, nextSample.desc),
        };
      });
    });
  }

  const addMilestone = () => {
    setMilestones([
      ...milestones,
      {
        id: nextMilestoneId(),
        title: t.addMilestoneSample.title,
        desc: t.addMilestoneSample.desc,
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
      pdf.save(`freelance-agreement-${projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "contract"}.pdf`);
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
      downloadDataUrl(du, `freelance-agreement-${projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "contract"}.png`);
      trackProductEvent("export_png", "freelance-contract");
      setPngState("idle");
    } catch (e) {
      console.error(e);
      notifyExportError("PNG generation failed");
      setPngState("error");
    }
  }

  function copyAgreementText() {
    const text = `${t.copyDocTitle}
${t.date}: ${agreementDate} | ${t.project}: ${projectName}

${t.copyParties}
${t.copyClient}: ${clientName} (${t.representative}: ${clientRep}, ${t.email}: ${clientEmail}, ${t.gstin}: ${clientGstin || t.copyNA})
${t.copyContractor}: ${freelancerName} (${tradeName}, ${t.email}: ${freelancerEmail}, ${t.pan}: ${freelancerPan || t.copyNA})

${t.copyScope}
${milestones.map((m, i) => `${i + 1}. ${m.title} - ${m.desc} (${t.copyTargetDate}: ${m.dueDate}, ${t.copyAmount}: ${money(Number(m.amount) || 0)})`).join("\n")}

${t.copyCommercials}
- ${t.totalValue} ${money(totals.total)}
- ${t.advanceRetainer} (${totals.advPct}%): ${money(totals.advance)} (${t.copyAdvanceDue})
- ${t.balanceLabel}: ${money(totals.balance)} ${t.copyBalancePayable} ${paymentTerms}
- ${t.copyUpi}: ${upiId} (${payeeName})

${t.copyTerms}
- ${t.revisionLimits} ${revisionRounds}
- ${t.reviewApproval} ${reviewTurnaround}
- ${t.ipRights} ${ipClause}
- ${t.lateInterest} ${lateFee}
- ${t.termination} ${killFee}
- ${t.copyRelationship}

${t.copySignatures}
${t.copyForClient}: ${clientSignatory} (${t.date}: ${agreementDate})
${t.copyForFreelancer}: ${freelancerSignatory} (${t.date}: ${agreementDate})`;

    navigator.clipboard.writeText(text).then(() => {
      setCopiedState(true);
      trackProductEvent("copy", "freelance-contract");
      setTimeout(() => setCopiedState(false), 2500);
    });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
      <div className="no-print space-y-6 rounded-[2rem] border border-white/75 bg-white/90 p-5 shadow-[0_18px_48px_rgba(17,59,44,0.08)] sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-forest/10 pb-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-leaf">{t.eyebrow}</p>
            <h2 className="mt-1 text-2xl font-black text-forest">{t.heading}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={copyAgreementText}
              className="rounded-full border border-forest/15 px-3.5 py-1.5 text-xs font-bold text-forest transition hover:bg-mint"
            >
              {copiedState ? t.copied : t.copyText}
            </button>
            <button
              onClick={downloadPng}
              disabled={pngState === "busy"}
              className="rounded-full border border-forest/15 px-3.5 py-1.5 text-xs font-bold text-forest transition hover:border-leaf"
            >
              {pngState === "busy" ? "..." : t.exportPng}
            </button>
            <button
              onClick={downloadPdf}
              disabled={pdfState === "busy"}
              className="rounded-full bg-forest px-4 py-1.5 text-xs font-bold text-white transition hover:bg-leaf disabled:opacity-50"
            >
              {pdfState === "busy" ? t.generating : t.exportPdf}
            </button>
          </div>
        </div>


        <div className="space-y-4">
          <h3 className="text-xs font-black uppercase tracking-wider text-forest/70">{t.parties}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-forest">
              {t.clientName}
              <input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-xs outline-none focus:border-leaf"
              />
            </label>
            <label className="text-xs font-bold text-forest">
              {t.clientRep}
              <input
                value={clientRep}
                onChange={(e) => setClientRep(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-xs outline-none focus:border-leaf"
              />
            </label>
            <label className="text-xs font-bold text-forest">
              {t.clientEmail}
              <input
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-xs outline-none focus:border-leaf"
              />
            </label>
            <label className="text-xs font-bold text-forest">
              {t.clientGstin}
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
              {t.freelancerName}
              <input
                value={freelancerName}
                onChange={(e) => setFreelancerName(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-xs outline-none focus:border-leaf"
              />
            </label>
            <label className="text-xs font-bold text-forest">
              {t.tradeName}
              <input
                value={tradeName}
                onChange={(e) => setTradeName(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-xs outline-none focus:border-leaf"
              />
            </label>
            <label className="text-xs font-bold text-forest">
              {t.freelancerEmail}
              <input
                value={freelancerEmail}
                onChange={(e) => setFreelancerEmail(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-xs outline-none focus:border-leaf"
              />
            </label>
            <label className="text-xs font-bold text-forest">
              {t.freelancerPan}
              <input
                value={freelancerPan}
                onChange={(e) => setFreelancerPan(e.target.value)}
                placeholder="ABCDE9876K"
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-xs outline-none focus:border-leaf"
              />
            </label>
          </div>
        </div>

        <div className="space-y-3 pt-2 border-t border-forest/10">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-wider text-forest/70">{t.scope}</h3>
            <button onClick={addMilestone} className="text-xs font-bold text-leaf hover:underline">
              {t.addMilestone}
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs font-bold text-forest sm:col-span-3">
              {t.projectTitle}
              <input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-xs outline-none focus:border-leaf"
              />
            </label>
            <label className="text-xs font-bold text-forest">
              {t.contractDate}
              <input
                type="date"
                value={agreementDate}
                onChange={(e) => setAgreementDate(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-xs outline-none focus:border-leaf"
              />
            </label>
            <label className="text-xs font-bold text-forest sm:col-span-2">
              {t.targetDate}
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
                  <span className="font-bold text-forest">
                    {t.milestoneN} #{idx + 1}
                  </span>
                  {milestones.length > 1 && (
                    <button onClick={() => removeMilestone(item.id)} className="text-red-500 font-bold hover:underline">
                      {t.remove}
                    </button>
                  )}
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <input
                    value={item.title}
                    onChange={(e) => updateMilestone(item.id, "title", e.target.value)}
                    placeholder={t.milestoneTitle}
                    className="sm:col-span-2 rounded-lg border border-forest/10 bg-white px-2.5 py-1.5 outline-none focus:border-leaf font-semibold"
                  />
                  <input
                    type="number"
                    value={item.amount}
                    onChange={(e) => updateMilestone(item.id, "amount", e.target.value)}
                    placeholder={t.amountInr}
                    className="rounded-lg border border-forest/10 bg-white px-2.5 py-1.5 font-bold outline-none focus:border-leaf"
                  />
                </div>
                <textarea
                  value={item.desc}
                  onChange={(e) => updateMilestone(item.id, "desc", e.target.value)}
                  placeholder={t.deliverablePlaceholder}
                  rows={2}
                  className="w-full rounded-lg border border-forest/10 bg-white px-2.5 py-1.5 outline-none focus:border-leaf"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3 pt-2 border-t border-forest/10">
          <h3 className="text-xs font-black uppercase tracking-wider text-forest/70">{t.commercials}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-forest">
              {t.advancePct}
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
              {t.paymentTermsLabel}
              <input
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-xs outline-none focus:border-leaf"
              />
            </label>
            <label className="text-xs font-bold text-forest">
              {t.upiId}
              <input
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                placeholder="freelancer@upi"
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-xs outline-none focus:border-leaf"
              />
            </label>
            <label className="text-xs font-bold text-forest">
              {t.beneficiary}
              <input
                value={payeeName}
                onChange={(e) => setPayeeName(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-xs outline-none focus:border-leaf"
              />
            </label>
          </div>
          <div className="rounded-xl bg-mint/50 p-3 text-xs flex justify-between items-center text-forest font-bold gap-2 flex-wrap">
            <span>
              {t.total}: {money(totals.total)}
            </span>
            <span>
              {t.advanceDeposit} ({totals.advPct}%): {money(totals.advance)}
            </span>
            <span>
              {t.milestoneBalance}: {money(totals.balance)}
            </span>
          </div>
        </div>

        <div className="space-y-3 pt-2 border-t border-forest/10">
          <h3 className="text-xs font-black uppercase tracking-wider text-forest/70">{t.protective}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-forest sm:col-span-2">
              {t.revisionLabel}
              <input
                value={revisionRounds}
                onChange={(e) => setRevisionRounds(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-xs outline-none focus:border-leaf"
              />
            </label>
            <label className="text-xs font-bold text-forest sm:col-span-2">
              {t.reviewSla}
              <input
                value={reviewTurnaround}
                onChange={(e) => setReviewTurnaround(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-xs outline-none focus:border-leaf"
              />
            </label>
            <label className="text-xs font-bold text-forest sm:col-span-2">
              {t.ipLabel}
              <input
                value={ipClause}
                onChange={(e) => setIpClause(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-xs outline-none focus:border-leaf"
              />
            </label>
            <label className="text-xs font-bold text-forest">
              {t.lateFeeLabel}
              <input
                value={lateFee}
                onChange={(e) => setLateFee(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-xs outline-none focus:border-leaf"
              />
            </label>
            <label className="text-xs font-bold text-forest">
              {t.killFeeLabel}
              <input
                value={killFee}
                onChange={(e) => setKillFee(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-forest/10 bg-cream px-3 py-2 text-xs outline-none focus:border-leaf"
              />
            </label>
          </div>
        </div>
      </div>

      <div className="relative">
        <article
          ref={paperRef}
          className="mx-auto w-full max-w-[820px] rounded-[2rem] border border-forest/15 bg-white p-7 text-forest shadow-[0_24px_80px_rgba(17,59,44,0.12)] md:p-10 font-sans text-xs leading-relaxed"
          lang={lang}
        >
          <header className="border-b-2 border-forest pb-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-leaf">{t.docKicker}</p>
                <div className="mt-1 text-2xl font-black tracking-tight text-forest">{t.docTitle}</div>
                <p className="mt-1 font-semibold text-forest/70">
                  {t.project}: {projectName || t.untitled}
                </p>
              </div>
              <div className="text-right text-[11px] font-bold text-forest/70">
                <p>
                  {t.date}: {agreementDate}
                </p>
                <p>
                  {t.targetDelivery}: {targetCompletionDate}
                </p>
              </div>
            </div>
          </header>

          <section className="mt-5 space-y-2">
            <h2 className="text-xs font-black uppercase tracking-wider text-leaf border-b border-forest/10 pb-1">
              {t.partiesHeading}
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl bg-forest/5 p-3">
                <p className="font-black text-forest">{t.theClient}</p>
                <p className="font-bold">{clientName}</p>
                <p className="text-forest/70">
                  {t.representative}: {clientRep}
                </p>
                <p className="text-forest/70">
                  {t.email}: {clientEmail}
                </p>
                {clientGstin && (
                  <p className="text-forest/70">
                    {t.gstin}: {clientGstin}
                  </p>
                )}
              </div>
              <div className="rounded-xl bg-mint/40 p-3">
                <p className="font-black text-forest">{t.theContractor}</p>
                <p className="font-bold">
                  {freelancerName} {tradeName ? `(${tradeName})` : ""}
                </p>
                <p className="text-forest/70">
                  {t.email}: {freelancerEmail}
                </p>
                {freelancerPan && (
                  <p className="text-forest/70">
                    {t.pan}: {freelancerPan}
                  </p>
                )}
              </div>
            </div>
          </section>

          <section className="mt-5 space-y-2">
            <h2 className="text-xs font-black uppercase tracking-wider text-leaf border-b border-forest/10 pb-1">
              {t.scopeHeading}
            </h2>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-forest/20 text-[10px] font-black uppercase text-forest/80">
                  <th className="py-1.5">{t.colN}</th>
                  <th className="py-1.5">{t.colMilestone}</th>
                  <th className="py-1.5">{t.colDesc}</th>
                  <th className="py-1.5 text-right">{t.colDate}</th>
                  <th className="py-1.5 text-right">{t.colAmount}</th>
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

          <section className="mt-5 space-y-2">
            <h2 className="text-xs font-black uppercase tracking-wider text-leaf border-b border-forest/10 pb-1">
              {t.commercialHeading}
            </h2>
            <div className="grid grid-cols-[1.5fr_1fr] gap-4 items-center">
              <div className="space-y-1.5">
                <div className="flex justify-between border-b border-forest/10 py-1">
                  <span className="font-semibold">{t.totalValue}</span>
                  <span className="font-black text-sm">{money(totals.total)}</span>
                </div>
                <div className="flex justify-between border-b border-forest/10 py-1">
                  <span className="font-semibold">
                    {t.advanceRetainer} ({totals.advPct}%):
                  </span>
                  <span className="font-bold text-leaf">{money(totals.advance)}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="font-semibold">
                    {t.balanceLabel} ({100 - totals.advPct}%):
                  </span>
                  <span className="font-bold">{money(totals.balance)}</span>
                </div>
                <p className="text-[10px] text-forest/70 pt-1">
                  <strong>{t.invoicingTerms}</strong> {paymentTerms}. {t.workAfterAdvance}
                </p>
              </div>

              {qrDataUrl && (
                <div className="flex flex-col items-center justify-center rounded-xl border border-forest/10 bg-cream/40 p-2.5 text-center">
                  <img src={qrDataUrl} alt={t.scanDeposit} className="h-24 w-24 rounded-lg shadow-sm" />
                  <p className="mt-1 text-[9px] font-black text-forest">{t.scanDeposit}</p>
                  <p className="text-[9px] font-mono text-forest/70">{upiId}</p>
                </div>
              )}
            </div>
          </section>

          <section className="mt-5 space-y-2">
            <h2 className="text-xs font-black uppercase tracking-wider text-leaf border-b border-forest/10 pb-1">
              {t.termsHeading}
            </h2>
            <ol className="list-decimal pl-4 space-y-1.5 text-[11px] text-forest/80">
              <li>
                <strong>{t.revisionLimits}</strong> {revisionRounds}
              </li>
              <li>
                <strong>{t.reviewApproval}</strong> {reviewTurnaround}. {t.reviewDelay}
              </li>
              <li>
                <strong>{t.ipRights}</strong> {ipClause}
              </li>
              <li>
                <strong>{t.lateInterest}</strong> {t.overdueUntil} <strong>{lateFee}</strong>.
              </li>
              <li>
                <strong>{t.termination}</strong> {killFee}
              </li>
              <li>
                <strong>{t.independent}</strong> {t.independentBody}
              </li>
            </ol>
          </section>

          <section className="mt-7 pt-4 border-t-2 border-forest">
            <p className="text-[10px] font-bold text-forest/60 mb-4">{t.witness}</p>
            <div className="grid grid-cols-2 gap-8 pt-4">
              <div className="border-t border-forest/30 pt-2">
                <p className="font-bold text-forest">{clientSignatory}</p>
                <p className="text-[10px] text-forest/60">{t.clientSign}</p>
                <p className="text-[10px] text-forest/60">
                  {t.date}: {agreementDate}
                </p>
              </div>
              <div className="border-t border-forest/30 pt-2 text-right">
                <p className="font-bold text-forest">{freelancerSignatory}</p>
                <p className="text-[10px] text-forest/60">{t.contractorSign}</p>
                <p className="text-[10px] text-forest/60">
                  {t.date}: {agreementDate}
                </p>
              </div>
            </div>
          </section>

          <footer className="mt-6 pt-3 border-t border-forest/10 text-center text-[9px] text-forest/50">{t.footer}</footer>
        </article>
      </div>
    </div>
  );
}
