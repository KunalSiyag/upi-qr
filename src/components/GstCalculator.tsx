import { useEffect, useId, useMemo, useState } from "react";
import QRCode from "qrcode";
import { GST_CATALOG, GST_LEGACY_SLABS, GST_SLABS, searchGstCatalog, type GstCatalogItem } from "../data/gstCatalog";
import { gstLine, ratePercentToBps, rupeesToPaise } from "../lib/gstMath";
import type { DocLang } from "../data/documentLang";
import { useToolLang } from "../lib/useToolLang";

const draftKey = "proupiqr-gst-draft-v2";

type Supply = "intra" | "inter";
type Mode = "exclusive" | "inclusive";

type Line = {
  id: number;
  name: string;
  amount: string;
  rate: number;
  catalogId?: string;
};

function nid() {
  return Date.now() + Math.floor(Math.random() * 1000);
}

export function GstCalculator({ lang = "en" }: { lang?: DocLang } = {}) {
  const { tr, money: formatMajor } = useToolLang(lang);
  const money = (paise: number) => formatMajor(paise / 100, 2);
  const [mode, setMode] = useState<Mode>("exclusive");
  const [supply, setSupply] = useState<Supply>("intra");
  const [composition, setComposition] = useState(false);
  const [lines, setLines] = useState<Line[]>([
    { id: 1, name: "IT / freelance service", amount: "10000", rate: 18, catalogId: "it-freelance" },
  ]);
  const [search, setSearch] = useState("");
  const [activeLine, setActiveLine] = useState<number | null>(null);
  const [vpa, setVpa] = useState("");
  const [payee, setPayee] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [copied, setCopied] = useState(false);

  const amountId = useId();
  const vpaId = useId();
  const nameId = useId();

  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (!saved) return;
      const d = JSON.parse(saved);
      if (d.mode === "inclusive" || d.mode === "exclusive") setMode(d.mode);
      if (d.supply === "intra" || d.supply === "inter") setSupply(d.supply);
      if (typeof d.composition === "boolean") setComposition(d.composition);
      if (Array.isArray(d.lines) && d.lines.length) {
        setLines(d.lines.map((row: Line, i: number) => ({
          id: Number(row.id) || i + 1,
          name: String(row.name ?? ""),
          amount: String(row.amount ?? ""),
          rate: Number(row.rate) >= 0 ? Number(row.rate) : 18,
          catalogId: row.catalogId,
        })));
      }
      setVpa(String(d.vpa ?? ""));
      setPayee(String(d.payee ?? ""));
    } catch {
      // Ignore broken drafts.
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(draftKey, JSON.stringify({ mode, supply, composition, lines, vpa, payee }));
  }, [mode, supply, composition, lines, vpa, payee]);

  const hits = useMemo(() => searchGstCatalog(search), [search]);

  const computed = useMemo(() => {
    const rows = lines.map((line) => {
      const rate = composition ? 0 : line.rate;
      const math = gstLine(rupeesToPaise(line.amount), ratePercentToBps(rate), mode, supply);
      return { ...line, rate, ...math };
    });
    const sum = rows.reduce(
      (acc, row) => ({
        basePaise: acc.basePaise + row.basePaise,
        gstPaise: acc.gstPaise + row.gstPaise,
        totalPaise: acc.totalPaise + row.totalPaise,
        cgstPaise: acc.cgstPaise + row.cgstPaise,
        sgstPaise: acc.sgstPaise + row.sgstPaise,
        igstPaise: acc.igstPaise + row.igstPaise,
      }),
      { basePaise: 0, gstPaise: 0, totalPaise: 0, cgstPaise: 0, sgstPaise: 0, igstPaise: 0 }
    );
    return { rows, sum };
  }, [lines, mode, supply, composition]);

  const catalogNotes = useMemo(() => {
    const notes = new Set<string>();
    lines.forEach((line) => {
      const item = GST_CATALOG.find((c) => c.id === line.catalogId);
      if (item?.note) notes.add(item.note);
    });
    return [...notes];
  }, [lines]);

  function patchLine(id: number, patch: Partial<Line>) {
    setLines((cur) => cur.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function applyCatalog(lineId: number, item: GstCatalogItem) {
    patchLine(lineId, { name: item.name, rate: item.rate, catalogId: item.id });
    setSearch("");
    setActiveLine(null);
  }

  function addLine() {
    const id = nid();
    setLines((cur) => [...cur, { id, name: "", amount: "", rate: 18 }]);
    setActiveLine(id);
  }

  async function generateQr() {
    if (!vpa.trim()) return;
    const rupees = (computed.sum.totalPaise / 100).toFixed(2);
    const upiUri = `upi://pay?pa=${encodeURIComponent(vpa.trim())}&pn=${encodeURIComponent(payee.trim() || "Merchant")}&am=${rupees}&cu=INR&tn=${encodeURIComponent("GST invoice payment")}`;
    try {
      const url = await QRCode.toDataURL(upiUri, {
        width: 360,
        margin: 2,
        color: { dark: "#113b2c", light: "#ffffff" },
      });
      setQrDataUrl(url);
    } catch (err) {
      console.error("Failed to generate QR code", err);
    }
  }

  function copyBreakdown() {
    const taxLines =
      supply === "inter"
        ? `IGST: ${money(computed.sum.igstPaise)}`
        : `CGST: ${money(computed.sum.cgstPaise)}\nSGST: ${money(computed.sum.sgstPaise)}`;
    const text = `GST calculation (GST 2.0)
Mode: ${mode === "exclusive" ? "Add GST" : "Remove GST"} · ${supply === "intra" ? "Intra-state" : "Inter-state"}${composition ? " · Composition (no GST charged)" : ""}
${computed.rows.map((row) => `• ${row.name || "Item"} @ ${row.rate}% — ${money(row.totalPaise)}`).join("\n")}
Base: ${money(computed.sum.basePaise)}
${taxLines}
Total GST: ${money(computed.sum.gstPaise)}
Payable: ${money(computed.sum.totalPaise)}

Generated via Pro UPI QR (https://www.proupiqr.in/gst-calculator/)`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const slabButtons = [...GST_SLABS, ...GST_LEGACY_SLABS];

  return (
    <div className="grid gap-8 lg:grid-cols-12">

      <div className="lg:col-span-7 space-y-6">
        <div className="rounded-3xl border border-forest/10 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black text-forest">{tr("1. What are you billing?")}</h2>
          <p className="mt-1 text-xs leading-5 text-forest/65">
            Search a product or service. GST 2.0 is 0 / 5 / 18 / 40 (plus 3% gold). Confirm the HSN on the GST portal before you file.
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3 p-1.5 rounded-2xl bg-mint/50">
            <button type="button" onClick={() => setMode("exclusive")} className={`py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold ${mode === "exclusive" ? "bg-forest text-white shadow-md" : "text-forest/70 hover:text-forest"}`}>
              {tr("Add GST (exclusive)")}
            </button>
            <button type="button" onClick={() => setMode("inclusive")} className={`py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold ${mode === "inclusive" ? "bg-forest text-white shadow-md" : "text-forest/70 hover:text-forest"}`}>
              {tr("Remove GST (MRP)")}
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setSupply("intra")} aria-pressed={supply === "intra"} className={`rounded-2xl border px-3 py-3 text-left ${supply === "intra" ? "border-leaf bg-mint/40" : "border-forest/10 bg-cream/40"}`}>
              <div className="text-sm font-black text-forest">{tr("Intra-state")}</div>
              <div className="text-[11px] text-forest/60">{tr("CGST + SGST, same state")}</div>
            </button>
            <button type="button" onClick={() => setSupply("inter")} aria-pressed={supply === "inter"} className={`rounded-2xl border px-3 py-3 text-left ${supply === "inter" ? "border-leaf bg-mint/40" : "border-forest/10 bg-cream/40"}`}>
              <div className="text-sm font-black text-forest">{tr("Inter-state")}</div>
              <div className="text-[11px] text-forest/60">{tr("IGST at the full slab")}</div>
            </button>
          </div>

          <label className="mt-4 flex items-center gap-2 text-xs font-bold text-forest">
            <input type="checkbox" checked={composition} onChange={(e) => setComposition(e.target.checked)} className="h-4 w-4 accent-[#15803d]" />
            {tr("Composition dealer — I cannot charge GST (bill of supply)")}
          </label>

          <div className="mt-5 space-y-4">
            {lines.map((line, index) => (
              <div key={line.id} className="rounded-2xl border border-forest/10 bg-cream/40 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-black uppercase tracking-wider text-forest/50">Item {index + 1}</p>
                  {lines.length > 1 && (
                    <button type="button" onClick={() => setLines((cur) => cur.filter((row) => row.id !== line.id))} className="text-[11px] font-bold text-red-600 hover:underline">
                      {tr("Remove")}
                    </button>
                  )}
                </div>
                <label className="block text-xs font-bold text-forest">
                  {tr("Product / service")}
                  <input
                    value={activeLine === line.id ? search : line.name}
                    onFocus={() => {
                      setActiveLine(line.id);
                      setSearch(line.name);
                    }}
                    onChange={(e) => {
                      setActiveLine(line.id);
                      setSearch(e.target.value);
                      patchLine(line.id, { name: e.target.value, catalogId: undefined });
                    }}
                    placeholder="Search: soap, freelance, restaurant, gold…"
                    className="mt-1 w-full rounded-xl border border-forest/15 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-leaf"
                  />
                </label>
                {activeLine === line.id && hits.length > 0 && (
                  <ul className="max-h-48 overflow-y-auto rounded-xl border border-forest/10 bg-white text-sm">
                    {hits.map((item) => (
                      <li key={item.id}>
                        <button type="button" onClick={() => applyCatalog(line.id, item)} className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left hover:bg-mint/50">
                          <span>
                            <span className="font-bold text-forest">{item.name}</span>
                            <span className="block text-[11px] text-forest/55">{item.group}{item.hsn ? ` · HSN ${item.hsn}` : ""}</span>
                          </span>
                          <span className="shrink-0 font-black text-leaf">{item.rate}%</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                  <label className="text-xs font-bold text-forest">
                    {mode === "exclusive" ? tr("Taxable amount ₹") : tr("Amount including GST ₹")}
                    <input
                      id={index === 0 ? amountId : undefined}
                      type="number"
                      min="0"
                      step="any"
                      value={line.amount}
                      onChange={(e) => patchLine(line.id, { amount: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-forest/15 bg-white px-3 py-2.5 font-mono text-sm font-bold outline-none focus:border-leaf"
                    />
                  </label>
                  <div>
                    <p className="text-xs font-bold text-forest">{tr("Rate")}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {slabButtons.map((slab) => (
                        <button
                          key={slab.rate}
                          type="button"
                          disabled={composition}
                          onClick={() => patchLine(line.id, { rate: slab.rate })}
                          className={`rounded-lg border px-2 py-1.5 text-[11px] font-black ${line.rate === slab.rate && !composition ? "border-leaf bg-leaf text-white" : "border-forest/10 bg-white text-forest"} disabled:opacity-40`}
                        >
                          {slab.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button type="button" onClick={addLine} className="mt-4 rounded-full border border-forest/15 px-4 py-2 text-xs font-bold text-forest hover:border-leaf">
            {tr("+ Add another item")}
          </button>
        </div>

        <div className="rounded-3xl border border-leaf/20 bg-mint/30 p-6 space-y-4">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-leaf text-white text-xs font-bold">2</span>
            <h3 className="text-base font-black text-forest">{tr("UPI QR for the payable total")}</h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={vpaId} className="block text-[11px] font-bold text-forest/75 mb-1">{tr("Your UPI ID")}</label>
              <input id={vpaId} type="text" placeholder="shop@oksbi" value={vpa} onChange={(e) => setVpa(e.target.value)} className="w-full rounded-xl border border-forest/15 bg-white p-2.5 text-xs font-semibold outline-none focus:border-leaf" />
            </div>
            <div>
              <label htmlFor={nameId} className="block text-[11px] font-bold text-forest/75 mb-1">{tr("Payee name")}</label>
              <input id={nameId} type="text" placeholder="Store name" value={payee} onChange={(e) => setPayee(e.target.value)} className="w-full rounded-xl border border-forest/15 bg-white p-2.5 text-xs font-semibold outline-none focus:border-leaf" />
            </div>
          </div>
          <button type="button" onClick={generateQr} className="w-full rounded-xl bg-forest py-3 text-xs font-bold uppercase tracking-wider text-mint hover:bg-forest/90 shadow-md">
            Create payment QR for {money(computed.sum.totalPaise)}
          </button>
        </div>
      </div>

      <div className="lg:col-span-5 space-y-6">
        <div className="rounded-3xl border border-forest/10 bg-white p-6 shadow-lg space-y-5">
          <div className="flex items-center justify-between border-b border-forest/10 pb-4">
            <h3 className="text-lg font-black text-forest">{tr("Tax breakdown")}</h3>
            <span className="rounded-full bg-mint px-3 py-1 text-xs font-bold text-leaf">{composition ? "Composition" : supply === "intra" ? "CGST + SGST" : "IGST"}</span>
          </div>

          <div className="space-y-2 text-sm">
            {computed.rows.map((row) => (
              <div key={row.id} className="flex items-start justify-between gap-3">
                <span className="text-forest/70 font-semibold">{row.name || "Item"} <span className="text-[11px] text-forest/45">@{row.rate}%</span></span>
                <span className="font-mono font-bold text-forest">{money(row.totalPaise)}</span>
              </div>
            ))}
          </div>

          <div className="space-y-3 border-t border-forest/10 pt-4 text-sm">
            <div className="flex justify-between"><span className="text-forest/70 font-semibold">{tr("Taxable value")}</span><span className="font-mono font-bold">{money(computed.sum.basePaise)}</span></div>
            {supply === "intra" ? (
              <>
                <div className="flex justify-between"><span className="text-forest/70 font-semibold">CGST</span><span className="font-mono font-bold text-leaf">+ {money(computed.sum.cgstPaise)}</span></div>
                <div className="flex justify-between"><span className="text-forest/70 font-semibold">SGST</span><span className="font-mono font-bold text-leaf">+ {money(computed.sum.sgstPaise)}</span></div>
              </>
            ) : (
              <div className="flex justify-between"><span className="text-forest/70 font-semibold">IGST</span><span className="font-mono font-bold text-leaf">+ {money(computed.sum.igstPaise)}</span></div>
            )}
            <div className="flex justify-between border-t border-forest/10 pt-3"><span className="font-bold text-forest/80">{tr("Total GST")}</span><span className="font-mono font-bold text-leaf">{money(computed.sum.gstPaise)}</span></div>
          </div>

          <div className="rounded-2xl bg-forest p-4 text-mint flex items-center justify-between shadow-md">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest opacity-80">{tr("Amount payable")}</div>
              <div className="text-2xl font-black font-mono">{money(computed.sum.totalPaise)}</div>
            </div>
            <button type="button" onClick={copyBreakdown} className="rounded-xl bg-mint/20 px-3 py-2 text-xs font-bold text-mint hover:bg-mint/30">
              {copied ? tr("Copied!") : "Copy"}
            </button>
          </div>

          {catalogNotes.map((note) => (
            <p key={note} className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-5 font-semibold text-amber-900">{note}</p>
          ))}

          {qrDataUrl && (
            <div className="border-t border-forest/10 pt-6 text-center space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-forest/75">{tr("Payment QR")}</div>
              <div className="mx-auto w-48 h-48 p-2 rounded-2xl bg-white border border-forest/15 shadow-md">
                <img src={qrDataUrl} alt="UPI payment QR for GST total" className="w-full h-full object-contain" />
              </div>
              <a href={qrDataUrl} download={`gst-payment-qr-${(computed.sum.totalPaise / 100).toFixed(0)}.png`} className="inline-block rounded-xl bg-leaf px-4 py-2 text-xs font-bold text-white hover:bg-leaf/90">
                Download QR
              </a>
            </div>
          )}
        </div>
        <p className="text-[11px] leading-5 text-forest/55">
          Rates are GST 2.0 (from 22 Sep 2025) for common items, not a substitute for the HSN on{" "}
          <a className="font-bold text-leaf underline" href="https://services.gst.gov.in/services/searchhsnsac" rel="noopener noreferrer" target="_blank">gst.gov.in</a>.
          This page does not file returns.
        </p>
      </div>
    </div>
  );
}
