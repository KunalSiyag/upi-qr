import { useState, useEffect, useMemo } from "react";
import QRCode from "qrcode";

interface QrItem {
  id: string;
  payee: string;
  upiId: string;
  amount: string;
  note: string;
  qrDataUrl?: string;
  status: "valid" | "invalid";
}

const sampleCsvText = `Payee Name,UPI ID,Amount,Reference Note
Flat 101 Maintenance,society@oksbi,2500,July Maintenance #101
Flat 102 Maintenance,society@oksbi,2500,July Maintenance #102
Student Rahul,coaching@paytm,1200,Maths Tuition Fee
Vendor Auto Parts,parts@icici,4500,Invoice 8092`;

export function BulkQrGenerator() {
  const [rawText, setRawText] = useState(sampleCsvText);
  const [isGenerating, setIsGenerating] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState("");
  const [qrMap, setQrMap] = useState<Record<string, string>>({});

  const parsedItems = useMemo<QrItem[]>(() => {
    const lines = rawText.split("\n").map((line) => line.trim()).filter(Boolean);
    const items: QrItem[] = [];

    // Skip header line if present
    const startIndex = lines[0]?.toLowerCase().includes("upi") ? 1 : 0;

    for (let i = startIndex; i < lines.length; i++) {
      const parts = lines[i].split(",").map((p) => p.trim());
      if (parts.length < 2) continue;

      const payee = parts[0] || "Merchant";
      const upiId = parts[1] || "";
      const amount = parts[2] || "";
      const note = parts[3] || "";

      const isValid = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(upiId);

      items.push({
        id: `qr-${i}`,
        payee,
        upiId,
        amount,
        note,
        status: isValid ? "valid" : "invalid",
      });
    }

    return items;
  }, [rawText]);

  // Asynchronously generate preview QR data URLs for all items
  useEffect(() => {
    let canceled = false;
    async function generatePreviewQrs() {
      const newMap: Record<string, string> = {};
      for (const item of parsedItems) {
        if (item.status === "valid") {
          try {
            const params = new URLSearchParams({ pa: item.upiId, pn: item.payee });
            if (item.amount) params.set("am", item.amount);
            if (item.note) params.set("tn", item.note);
            params.set("cu", "INR");
            const upiUrl = `upi://pay?${params.toString()}`;

            const dataUrl = await QRCode.toDataURL(upiUrl, {
              width: 120,
              margin: 1,
              color: { dark: "#113b2c", light: "#ffffff" },
            });
            newMap[item.id] = dataUrl;
          } catch (e) {
            console.error("Preview QR generation error:", e);
          }
        }
      }
      if (!canceled) {
        setQrMap(newMap);
      }
    }
    void generatePreviewQrs();
    return () => {
      canceled = true;
    };
  }, [parsedItems]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) setRawText(text);
    };
    reader.readAsText(file);
  };

  const downloadSampleCsv = () => {
    const blob = new Blob([sampleCsvText], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "sample-bulk-upi-qr.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadZip = async () => {
    const validItems = parsedItems.filter((item) => item.status === "valid");
    if (validItems.length === 0) {
      alert("No valid UPI IDs found to generate QR codes.");
      return;
    }

    setIsGenerating(true);
    setDownloadProgress("Generating QR images...");

    try {
      const JSZipModule = await import("jszip");
      const JSZip = JSZipModule.default;
      const zip = new JSZip();

      for (let i = 0; i < validItems.length; i++) {
        const item = validItems[i];
        setDownloadProgress(`Processing ${i + 1} of ${validItems.length}...`);

        const params = new URLSearchParams({ pa: item.upiId, pn: item.payee });
        if (item.amount) params.set("am", item.amount);
        if (item.note) params.set("tn", item.note);
        params.set("cu", "INR");
        const upiUrl = `upi://pay?${params.toString()}`;

        const dataUrl = await QRCode.toDataURL(upiUrl, {
          width: 400,
          margin: 2,
          errorCorrectionLevel: "H",
          color: { dark: "#113b2c", light: "#ffffff" },
        });

        const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
        const fileName = `${i + 1}-${item.payee.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${item.amount || "open"}.png`;
        zip.file(fileName, base64Data, { base64: true });
      }

      setDownloadProgress("Creating ZIP archive...");
      const content = await zip.generateAsync({ type: "blob" });
      const zipUrl = URL.createObjectURL(content);

      const a = document.createElement("a");
      a.href = zipUrl;
      a.download = `bulk-upi-qr-codes-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(zipUrl);
    } catch (e) {
      console.error(e);
      alert("Error generating ZIP file.");
    } finally {
      setIsGenerating(false);
      setDownloadProgress("");
    }
  };

  const handleDownloadBatchPdf = async () => {
    const validItems = parsedItems.filter((item) => item.status === "valid");
    if (validItems.length === 0) return;

    setIsGenerating(true);
    setDownloadProgress("Creating Batch PDF...");

    try {
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF("p", "mm", "a4");
      let pageIndex = 0;

      for (let i = 0; i < validItems.length; i++) {
        if (i > 0 && i % 6 === 0) {
          pdf.addPage();
          pageIndex++;
        }

        const item = validItems[i];
        const params = new URLSearchParams({ pa: item.upiId, pn: item.payee });
        if (item.amount) params.set("am", item.amount);
        if (item.note) params.set("tn", item.note);
        params.set("cu", "INR");
        const upiUrl = `upi://pay?${params.toString()}`;

        const qrDataUrl = await QRCode.toDataURL(upiUrl, {
          width: 300,
          margin: 1,
          color: { dark: "#113b2c", light: "#ffffff" }
        });

        const slot = i % 6;
        const col = slot % 2;
        const row = Math.floor(slot / 2);

        const x = 15 + col * 95;
        const y = 20 + row * 85;

        pdf.setDrawColor(200, 200, 200);
        pdf.rect(x, y, 85, 75);
        pdf.addImage(qrDataUrl, "PNG", x + 17.5, y + 5, 50, 50);

        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(10);
        pdf.setTextColor(17, 59, 44);
        pdf.text(item.payee, x + 42.5, y + 60, { align: "center" });

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.setTextColor(100, 100, 100);
        pdf.text(item.upiId, x + 42.5, y + 66, { align: "center" });

        if (item.amount) {
          pdf.setFont("helvetica", "bold");
          pdf.setTextColor(40, 122, 87);
          pdf.text(`Pay INR ${item.amount}`, x + 42.5, y + 71, { align: "center" });
        }
      }

      pdf.save(`bulk-upi-qr-batch.pdf`);
    } catch (e) {
      console.error(e);
      alert("Failed to export PDF.");
    } finally {
      setIsGenerating(false);
      setDownloadProgress("");
    }
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] w-full min-w-0">
      {/* Input Data Console */}
      <div className="rounded-3xl border border-forest/10 bg-white p-4 sm:p-6 md:p-8 shadow-sm w-full min-w-0">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-black text-forest">CSV Bulk Configurator</h3>
          <button
            type="button"
            onClick={downloadSampleCsv}
            className="rounded-full border border-forest/15 bg-mint/40 px-3 py-1 text-[10px] font-bold text-forest hover:bg-mint transition"
          >
            📥 Sample CSV
          </button>
        </div>
        <p className="mt-1 text-xs text-forest/60">Upload a CSV file or paste tabular data with columns: <code>Payee, UPI_ID, Amount, Note</code>.</p>

        <div className="mt-4">
          <label className="block text-xs font-bold text-forest mb-1">Upload CSV File</label>
          <input
            type="file"
            accept=".csv, .txt"
            onChange={handleFileUpload}
            className="w-full text-xs text-forest/70 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-forest file:text-white file:font-bold hover:file:bg-leaf cursor-pointer"
          />
        </div>

        <div className="mt-4">
          <label className="block text-xs font-bold text-forest mb-1">Or Paste CSV Content below:</label>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={8}
            className="w-full rounded-2xl border border-forest/10 bg-cream/30 p-3.5 font-mono text-xs outline-none focus:border-leaf"
            placeholder="Payee Name,UPI ID,Amount,Reference Note"
          />
        </div>

        {/* Action Buttons: ZIP & PDF Exports ONLY */}
        <div className="mt-6 flex flex-col sm:flex-row items-center gap-3 pt-4 border-t border-forest/10">
          <button
            type="button"
            onClick={handleDownloadZip}
            disabled={isGenerating || parsedItems.length === 0}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl bg-forest px-6 py-3.5 text-xs font-black text-white shadow-lg transition hover:bg-leaf active:scale-95 disabled:opacity-50"
          >
            {isGenerating ? downloadProgress : `📦 Download ZIP (${parsedItems.filter(i => i.status === "valid").length} PNGs)`}
          </button>
          <button
            type="button"
            onClick={handleDownloadBatchPdf}
            disabled={isGenerating || parsedItems.length === 0}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl border border-forest/15 bg-mint/50 px-6 py-3.5 text-xs font-black text-forest transition hover:bg-mint active:scale-95 disabled:opacity-50"
          >
            📄 Download Batch PDF
          </button>
        </div>
      </div>

      {/* Live Preview List */}
      <div className="rounded-3xl border border-forest/10 bg-cream/20 p-4 sm:p-6 shadow-sm w-full min-w-0">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-xs font-black uppercase tracking-widest text-forest/50">
            Batch Preview ({parsedItems.length} Records)
          </h4>
          <span className="text-[10px] font-bold text-leaf">
            {parsedItems.filter((i) => i.status === "valid").length} Valid / {parsedItems.filter((i) => i.status === "invalid").length} Invalid
          </span>
        </div>

        <div className="max-h-[600px] overflow-y-auto space-y-3 pr-1">
          {parsedItems.map((item, index) => (
            <div
              key={item.id}
              className={`rounded-2xl border p-3.5 flex items-center justify-between gap-4 transition bg-white ${
                item.status === "valid" ? "border-forest/10" : "border-red-200 bg-red-50/50"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                {qrMap[item.id] ? (
                  <img
                    src={qrMap[item.id]}
                    alt={`QR for ${item.payee}`}
                    className="w-14 h-14 object-contain rounded-xl border border-forest/10 bg-white shrink-0 p-1 shadow-sm"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-xl border border-neutral-200 bg-neutral-100 flex items-center justify-center text-[9px] font-bold text-neutral-400 shrink-0">
                    {item.status === "valid" ? "Generating..." : "No QR"}
                  </div>
                )}
                <div className="min-w-0">
                  <span className="text-[10px] font-bold text-forest/40 uppercase">#{index + 1}</span>
                  <h5 className="font-black text-forest text-sm truncate">{item.payee}</h5>
                  <p className="text-xs font-mono text-neutral-500 truncate">{item.upiId}</p>
                  {item.note && <p className="text-[10px] text-forest/60 italic truncate">Note: {item.note}</p>}
                </div>
              </div>

              <div className="text-right shrink-0">
                {item.amount ? (
                  <span className="inline-block rounded-lg bg-mint px-2.5 py-1 text-xs font-black text-leaf">
                    ₹{item.amount}
                  </span>
                ) : (
                  <span className="inline-block rounded-lg bg-neutral-100 px-2.5 py-1 text-[10px] font-bold text-neutral-500">
                    Any Amount
                  </span>
                )}
                {item.status === "invalid" && (
                  <p className="text-[10px] font-bold text-red-600 mt-1">Invalid UPI ID</p>
                )}
              </div>
            </div>
          ))}

          {parsedItems.length === 0 && (
            <div className="p-8 text-center text-xs text-forest/50">
              No items parsed. Paste or upload CSV data above.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
