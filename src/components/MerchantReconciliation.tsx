import React, { useState, useRef, useCallback, useEffect } from "react";
import { safeToPng, downloadDataUrl, notifyExportError } from "../lib/export-image";
import { trackProductEvent } from "../lib/productEvents";

interface BookEntry {
  id: number;
  date: string;
  utr: string;
  invoiceNo: string;
  expectedAmount: number; // in paise
  receivedAmount: number | null; // in paise
  customer: string;
  settled: boolean;
  difference: number | null; // in paise
}

type SortKey = "date" | "invoiceNo" | "customer" | "expectedAmount" | "receivedAmount" | "difference";
type SortDir = "asc" | "desc";

function fRs(paise: number | null | undefined): string {
  if (paise == null) return "—";
  return (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseAmt(v: string): number {
  const cleaned = v.replace(/[,\s]/g, "");
  const dot = cleaned.lastIndexOf(".");
  if (dot === -1) return parseInt(cleaned, 10) * 100;
  const whole = cleaned.substring(0, dot).replace(/[^0-9-]/g, "");
  const frac = cleaned.substring(dot + 1, dot + 3).padEnd(2, "0");
  return parseInt(whole + frac, 10);
}

function parseCsv(text: string): { id: number; date: string; invoiceNo: string; amountStr: string; customer: string }[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = lines[0].toLowerCase();
  const idx = {
    date: -1,
    invoice: -1,
    amount: -1,
    customer: -1,
  };
  header.split(",").forEach((col, i) => {
    const c = col.trim().replace(/[^a-z]/g, "");
    if (c === "date") idx.date = i;
    if (c === "invoice" || c === "invoiceno" || c === "invoicenumber") idx.invoice = i;
    if (c === "amount" || c === "expected" || c === "expectedamount") idx.amount = i;
    if (c === "customer" || c === "client" || c === "buyer") idx.customer = i;
  });
  if (idx.date === -1 || idx.invoice === -1 || idx.amount === -1) return [];
  return lines.slice(1).map((line, i) => {
    const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    return {
      id: i + 1,
      date: cols[idx.date] || "",
      invoiceNo: cols[idx.invoice] || "",
      amountStr: cols[idx.amount] || "",
      customer: idx.customer >= 0 ? cols[idx.customer] || "" : "",
    };
  });
}

function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const EMPTY_BOOK = JSON.stringify([]);

export function MerchantReconciliation() {
  const draftKey = "proupiqr-merchant-reconciliation-draft";

  const [entries, setEntries] = useState<BookEntry[]>(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });
  const [monthLabel, setMonthLabel] = useState("Reconciliation");
  const [fileError, setFileError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [pdfState, setPdfState] = useState<"idle" | "busy" | "error">("idle");
  const paperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem(draftKey, JSON.stringify(entries));
  }, [entries, draftKey]);

  const handleCsvUpload = useCallback((file: File) => {
    setFileError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseCsv(text);
      if (parsed.length === 0) {
        setFileError("Could not find the required columns. The CSV must have 'Date', 'Invoice', and 'Amount' columns.");
        return;
      }
      const existingDates = entries.map((e) => e.date).filter(Boolean);
      const newEntries: BookEntry[] = parsed
        .filter((p) => !existingDates.includes(p.date) || !entries.some((e) => e.date === p.date && e.invoiceNo === p.invoiceNo))
        .map((p) => {
          const expected = parseAmt(p.amountStr);
          const id = Date.now() + Math.random();
          return {
            id,
            date: p.date,
            utr: "",
            invoiceNo: p.invoiceNo,
            expectedAmount: expected,
            receivedAmount: null,
            customer: p.customer,
            settled: false,
            difference: null,
          };
        });

      if (parsed.length > 0) {
        const firstDate = parsed[0]?.date;
        if (firstDate) {
          const d = new Date(firstDate);
          const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
          if (!isNaN(d.getTime())) setMonthLabel(`${months[d.getMonth()]} ${d.getFullYear()} Reconciliation`);
        }
      }

      setEntries((prev) => {
        const existing = prev.filter((e) =>
          parsed.some((p) => p.date === e.date && p.invoiceNo === e.invoiceNo)
        );
        const merged = [...existing, ...newEntries];
        return merged;
      });
      trackProductEvent("csv_upload", "merchant-reconciliation");
    };
    reader.readAsText(file);
  }, [entries]);

  const updateEntry = useCallback((id: number, patch: Partial<BookEntry>) => {
    setEntries((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e;
        const updated = { ...e, ...patch };
        if (updated.receivedAmount != null && updated.expectedAmount > 0) {
          updated.difference = updated.receivedAmount - updated.expectedAmount;
          updated.settled = updated.difference === 0;
        } else {
          updated.difference = null;
        }
        return updated;
      })
    );
  }, []);

  const deleteEntry = useCallback((id: number) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    if (entries.length === 0 || !confirm("Delete all entries?")) return;
    setEntries([]);
    setMonthLabel("Reconciliation");
  }, [entries]);

  const sortedEntries = [...entries].sort((a, b) => {
    const get = (e: BookEntry, k: SortKey) => {
      if (k === "date") return e.date;
      if (k === "invoiceNo") return e.invoiceNo;
      if (k === "customer") return e.customer;
      if (k === "expectedAmount") return e.expectedAmount;
      if (k === "receivedAmount") return e.receivedAmount ?? 0;
      if (k === "difference") return e.difference ?? 0;
      return 0;
    };
    const va = get(a, sortKey);
    const vb = get(b, sortKey);
    if (typeof va === "string" && typeof vb === "string") {
      return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
    }
    return sortDir === "asc" ? (va as number) - (vb as number) : (vb as number) - (va as number);
  });

  const totals = {
    expected: entries.reduce((s, e) => s + e.expectedAmount, 0),
    received: entries.reduce((s, e) => s + (e.receivedAmount ?? 0), 0),
    diff: entries.reduce((s, e) => s + (e.difference ?? 0), 0),
    settled: entries.filter((e) => e.settled).length,
    pending: entries.filter((e) => !e.settled && (e.receivedAmount == null)).length,
    mismatch: entries.filter((e) => !e.settled && e.receivedAmount != null).length,
  };

  const exportCsv = () => {
    if (entries.length === 0) return;
    const rows = entries.map((e) => [
      e.date, e.invoiceNo, e.customer, fRs(e.expectedAmount),
      e.receivedAmount != null ? fRs(e.receivedAmount) : "",
      e.utr, e.settled ? "Yes" : "No",
      e.difference != null ? fRs(e.difference) : ""
    ]);
    downloadCsv("reconciliation.csv",
      ["Date", "Invoice", "Customer", "Expected", "Received", "UTR", "Settled", "Difference"],
      rows
    );
    trackProductEvent("export_csv", "merchant-reconciliation");
  };

  const renderPaper = async (): Promise<string> => {
    const el = paperRef.current;
    if (!el) throw new Error("Report not ready");
    const clone = el.cloneNode(true) as HTMLDivElement;
    Object.assign(clone.style, {
      position: "fixed", left: "0", top: "0", zIndex: "-9999", opacity: "0", pointerEvents: "none",
      width: "800px", minWidth: "800px", maxWidth: "800px", padding: "32px", boxSizing: "border-box",
      height: "auto", boxShadow: "none", border: "none", borderRadius: "0"
    });
    document.body.appendChild(clone);
    await new Promise((res) => setTimeout(res, 250));
    const targetHeight = clone.offsetHeight || 1200;
    try {
      return await safeToPng(clone, {
        cacheBust: true,
        pixelRatio: 2,
        width: 800,
        height: targetHeight,
      });
    } finally {
      document.body.removeChild(clone);
    }
  };

  const downloadPdf = async () => {
    if (entries.length === 0) return;
    try {
      setPdfState("busy");
      const [{ jsPDF }, dataUrl] = await Promise.all([
        import("jspdf"),
        renderPaper()
      ]);
      const pxToMm = 0.2646;
      const widthMm = 800 * pxToMm;
      const heightMm = (paperRef.current?.offsetHeight || 1200) * pxToMm;
      const pdf = new jsPDF({
        orientation: widthMm < heightMm ? "portrait" : "landscape",
        unit: "mm",
        format: [widthMm, heightMm]
      });
      pdf.addImage(dataUrl, "PNG", 0, 0, widthMm, heightMm);
      pdf.save("reconciliation-report.pdf");
      setPdfState("idle");
      trackProductEvent("export_pdf", "merchant-reconciliation");
    } catch (err) {
      console.error("PDF failed:", err);
      notifyExportError("PDF export failed — please retry.");
      setPdfState("error");
      trackProductEvent("tool_error", "merchant-reconciliation");
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) handleCsvUpload(e.target.files[0]);
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      {/* Upload */}
      {entries.length === 0 && (
        <div className="rounded-3xl border-2 border-dashed border-leaf/30 hover:border-leaf bg-mint/30 p-8 text-center">
          <input type="file" accept=".csv" onChange={handleFileInput} className="hidden" id="recon-file" />
          <label htmlFor="recon-file" className="cursor-pointer">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-white border border-leaf/20 flex items-center justify-center text-leaf mb-3">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            </div>
            <p className="text-lg font-black text-forest">Upload your sales register CSV</p>
            <p className="text-xs text-forest/70 mt-1">Required columns: <code className="bg-white/50 px-1 rounded">Date</code>, <code className="bg-white/50 px-1 rounded">Invoice</code>, <code className="bg-white/50 px-1 rounded">Amount</code>. Optional: <code className="bg-white/50 px-1 rounded">Customer</code>.</p>
          </label>
          {fileError && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-red-700 text-xs font-medium">{fileError}</div>
          )}
        </div>
      )}

      {/* Toolbar */}
      {entries.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1">
            <h2 className="text-xl font-black text-forest">{monthLabel}</h2>
            <p className="text-xs text-forest/60">{entries.length} entries · {totals.settled} settled · {totals.mismatch} mismatch · {totals.pending} pending</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="cursor-pointer rounded-full bg-mint border border-leaf/20 px-4 py-2 text-xs font-bold text-forest hover:bg-leaf/10 transition">
              Upload CSV<input type="file" accept=".csv" onChange={handleFileInput} className="hidden" />
            </label>
            <button onClick={exportCsv} className="rounded-full bg-white border border-forest/20 px-4 py-2 text-xs font-bold text-forest hover:bg-mint transition">Export CSV</button>
            <button onClick={downloadPdf} disabled={pdfState === "busy"} className="rounded-full bg-forest text-white px-4 py-2 text-xs font-bold hover:bg-leaf transition disabled:opacity-50">
              {pdfState === "busy" ? "PDF..." : "Export PDF"}
            </button>
            <button onClick={clearAll} className="rounded-full bg-red-50 border border-red-200 px-4 py-2 text-xs font-bold text-red-700 hover:bg-red-100 transition">Clear</button>
          </div>
        </div>
      )}

      {/* Totals Cards */}
      {entries.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="rounded-2xl bg-mint/40 border border-leaf/20 p-4">
            <p className="text-[10px] uppercase font-bold text-forest/60">Expected</p>
            <p className="text-lg font-black text-forest">₹{fRs(totals.expected)}</p>
          </div>
          <div className="rounded-2xl bg-cream border border-forest/10 p-4">
            <p className="text-[10px] uppercase font-bold text-forest/60">Received</p>
            <p className="text-lg font-black text-forest">₹{fRs(totals.received)}</p>
          </div>
          <div className={`rounded-2xl border p-4 ${totals.diff === 0 ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
            <p className="text-[10px] uppercase font-bold text-forest/60">Difference</p>
            <p className={`text-lg font-black ${totals.diff === 0 ? "text-emerald-700" : "text-amber-700"}`}>
              {totals.diff >= 0 ? "₹" : "-₹"}{fRs(Math.abs(totals.diff))}
            </p>
          </div>
          <div className="rounded-2xl bg-white border border-forest/10 p-4">
            <p className="text-[10px] uppercase font-bold text-forest/60">Settled</p>
            <p className="text-lg font-black text-emerald-600">{totals.settled}/{entries.length}</p>
          </div>
          <div className="rounded-2xl bg-white border border-forest/10 p-4">
            <p className="text-[10px] uppercase font-bold text-forest/60">Unmatched</p>
            <p className="text-lg font-black text-red-600">{totals.mismatch + totals.pending}</p>
          </div>
        </div>
      )}

      {/* Table */}
      {entries.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-forest/10 bg-white shadow-sm">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-mint/40 border-b border-forest/10">
                {(["date", "invoiceNo", "customer", "expectedAmount", "receivedAmount", "difference"] as SortKey[]).map((k) => (
                  <th key={k} className="px-3 py-2.5 text-left font-black text-forest/70 cursor-pointer hover:text-forest" onClick={() => { if (sortKey === k) setSortDir((d) => d === "asc" ? "desc" : "asc"); else { setSortKey(k); setSortDir("asc"); } }}>
                    <span className="flex items-center gap-1">
                      {k === "date" ? "Date" : k === "invoiceNo" ? "Invoice" : k === "customer" ? "Customer" : k === "expectedAmount" ? "Expected" : k === "receivedAmount" ? "Received" : "Diff"}
                      {sortKey === k && <span className="text-[9px]">{sortDir === "asc" ? "▲" : "▼"}</span>}
                    </span>
                  </th>
                ))}
                <th className="px-3 py-2.5 text-left font-black text-forest/70">UTR</th>
                <th className="px-3 py-2.5 text-left font-black text-forest/70">Status</th>
                <th className="px-2 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {sortedEntries.map((e) => (
                <tr key={e.id} className={`border-b border-forest/5 hover:bg-mint/20 transition-colors ${e.settled ? "bg-emerald-50/30" : e.difference != null ? "bg-amber-50/30" : ""}`}>
                  <td className="px-3 py-2 font-mono text-forest/80">{e.date}</td>
                  <td className="px-3 py-2 font-bold text-forest">{e.invoiceNo}</td>
                  <td className="px-3 py-2 text-forest/70">{e.customer}</td>
                  <td className="px-3 py-2 font-mono text-forest">₹{fRs(e.expectedAmount)}</td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="Enter amount"
                      value={e.receivedAmount != null ? (e.receivedAmount / 100).toString() : ""}
                      onChange={(ev) => {
                        const v = ev.target.value;
                        if (v === "") {
                          updateEntry(e.id, { receivedAmount: null, utr: "", difference: null, settled: false });
                        } else {
                          const amt = parseAmt(v);
                          updateEntry(e.id, { receivedAmount: amt });
                        }
                      }}
                      className="w-24 rounded-lg border border-forest/20 px-2 py-1 font-mono text-forest focus:border-leaf focus:outline-none"
                    />
                  </td>
                  <td className={`px-3 py-2 font-mono font-bold ${e.difference == null ? "text-forest/40" : e.difference === 0 ? "text-emerald-600" : e.difference > 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {e.difference != null ? (e.difference >= 0 ? "₹" : "-₹") + fRs(Math.abs(e.difference)) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      placeholder="UTR"
                      value={e.utr}
                      onChange={(ev) => updateEntry(e.id, { utr: ev.target.value })}
                      className="w-32 rounded-lg border border-forest/20 px-2 py-1 font-mono text-xs text-forest focus:border-leaf focus:outline-none"
                    />
                  </td>
                  <td className="px-3 py-2">
                    {e.settled ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">✓ Settled</span>
                    ) : e.difference != null ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">⚠ Mismatch</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-white border border-forest/20 px-2 py-0.5 text-[10px] font-bold text-forest/50">Pending</span>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <button onClick={() => deleteEntry(e.id)} className="text-forest/30 hover:text-red-600 text-sm" title="Delete">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Privacy badge */}
      {entries.length > 0 && (
        <div className="flex items-center gap-2 text-[10px] text-forest/50 font-medium">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
          100% private — all data stays in this browser. Nothing is uploaded to any server.
        </div>
      )}

      {/* Hidden paper for PDF rendering */}
      {entries.length > 0 && (
      <div ref={paperRef} className="hidden">
        <div className="bg-white text-black font-sans w-[800px] p-8 box-border" style={{ fontFamily: "system-ui, sans-serif" }}>
          <div className="border-b-2 border-gray-800 pb-4 mb-4">
            <h2 className="text-2xl font-bold">{monthLabel}</h2>
            <p className="text-sm text-gray-500 mt-1">Generated on {new Date().toLocaleDateString("en-IN")}</p>
          </div>
          <div className="grid grid-cols-5 gap-4 mb-6">
            <div><p className="text-[10px] uppercase text-gray-500">Expected</p><p className="text-lg font-bold">₹{fRs(totals.expected)}</p></div>
            <div><p className="text-[10px] uppercase text-gray-500">Received</p><p className="text-lg font-bold">₹{fRs(totals.received)}</p></div>
            <div><p className="text-[10px] uppercase text-gray-500">Difference</p><p className="text-lg font-bold">{totals.diff >= 0 ? "₹" : "-₹"}{fRs(Math.abs(totals.diff))}</p></div>
            <div><p className="text-[10px] uppercase text-gray-500">Settled</p><p className="text-lg font-bold">{totals.settled}/{entries.length}</p></div>
            <div><p className="text-[10px] uppercase text-gray-500">Unmatched</p><p className="text-lg font-bold">{totals.mismatch + totals.pending}</p></div>
          </div>
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-300">
                {["Date", "Invoice", "Customer", "Expected", "Received", "UTR", "Diff", "Status"].map((h) => (
                  <th key={h} className="text-left py-2 px-1 font-bold text-gray-700">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-gray-200">
                  <td className="py-2 px-1">{e.date}</td>
                  <td className="py-2 px-1 font-bold">{e.invoiceNo}</td>
                  <td className="py-2 px-1">{e.customer}</td>
                  <td className="py-2 px-1">₹{fRs(e.expectedAmount)}</td>
                  <td className="py-2 px-1">{e.receivedAmount != null ? `₹${fRs(e.receivedAmount)}` : "—"}</td>
                  <td className="py-2 px-1">{e.utr}</td>
                  <td className="py-2 px-1 font-bold">{e.difference != null ? (e.difference >= 0 ? "₹" : "-₹") + fRs(Math.abs(e.difference)) : "—"}</td>
                  <td className="py-2 px-1">{e.settled ? "Settled" : e.difference != null ? "Mismatch" : "Pending"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[9px] text-gray-400 mt-4">Prepared using Pro UPI QR's merchant reconciliation tool. All amounts in INR. Data processed entirely in-browser.</p>
        </div>
      </div>)}
    </div>
  );
}