import React, { useState, useRef, useEffect } from "react";
import { trackProductEvent } from "../lib/productEvents";

interface ParsedUpiData {
  vpa: string;
  name: string;
  amount: string;
  note: string;
  currency: string;
  mcc: string;
  merchantId: string;
  transactionId: string;
  url: string;
  rawUri: string;
}

interface ValidationWarning {
  type: "error" | "warning" | "info";
  message: string;
  detail?: string;
}

interface SafetyVerdict {
  level: "safe" | "caution" | "suspicious";
  label: string;
  description: string;
  warnings: ValidationWarning[];
}

function validateUpiUri(uri: string, parsed: ParsedUpiData): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  const raw = uri.trim();

  if (!raw.toLowerCase().startsWith("upi://")) {
    return [{ type: "info", message: "Unknown QR type — not a standard UPI payment link.", detail: raw.substring(0, 80) }];
  }

  if (!raw.toLowerCase().startsWith("upi://pay")) {
    warnings.push({ type: "warning", message: "Non-payment UPI intent detected.", detail: "This QR uses a non-standard UPI action (e.g. upi://mandate, upi://collect). Confirm the intent before scanning." });
  }

  if (!parsed.vpa.trim()) {
    warnings.push({ type: "error", message: "Missing UPI ID (pa=) in QR payload.", detail: "The QR code decodes but contains no payee VPA. It may be a corrupted, tampered, or non-payment QR." });
  } else {
    if (!parsed.vpa.includes("@")) {
      warnings.push({ type: "error", message: "Invalid VPA format — no @ handle found.", detail: `"${parsed.vpa}" does not look like a valid UPI ID. A real VPA should be like name@bankhandle.` });
    }
    const handle = parsed.vpa.split("@")[1]?.toLowerCase();
    if (handle && handle.length < 3) {
      warnings.push({ type: "warning", message: "VPA bank handle appears unusually short.", detail: `"${handle}" is shorter than typical bank handles. Test with a ₹1 scan before displaying.` });
    }
  }

  if (parsed.name && parsed.name.length < 2) {
    warnings.push({ type: "warning", message: "Payee name is very short.", detail: `"${parsed.name}" may be a placeholder or truncated name. Confirm the shop or person name before paying.` });
  }

  if (parsed.name && parsed.vpa) {
    const nameParts = parsed.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    const vpaUser = parsed.vpa.split("@")[0]?.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (vpaUser && nameParts && vpaUser.length > 3 && !nameParts.includes(vpaUser) && !vpaUser.includes(nameParts.substring(0, 4))) {
      warnings.push({ type: "info", message: "Payee name doesn't overlap with VPA username.", detail: "This is common with branded VPAs but worth cross-checking — the name shown on the poster should match the confirmed payee." });
    }
  }

  if (parsed.amount) {
    const amt = parseInt(parsed.amount, 10);
    if (isNaN(amt) || amt < 0) {
      warnings.push({ type: "error", message: "QR contains an invalid amount.", detail: `"${parsed.amount}" is not a valid payment amount.` });
    } else if (amt > 100000) {
      warnings.push({ type: "warning", message: "Fixed amount exceeds ₹1,00,000 — above standard UPI per-transaction limit.", detail: "Many banks cap UPI transactions at ₹1,00,000 per transfer. This QR may fail at scan." });
    }
  }

  if (parsed.mcc) {
    const knownMcc = ["0000", "4814", "5411", "5499", "5812", "5814", "5912", "7299", "8299", "8999"];
    if (!knownMcc.includes(parsed.mcc)) {
      warnings.push({ type: "info", message: `Unrecognised merchant category code (mc=${parsed.mcc}).`, detail: "This does not mean the QR is unsafe, just that the MCC is non-standard." });
    }
  }

  return warnings;
}

function parseUpiUri(uri: string): ParsedUpiData {
  const cleanUri = uri.trim();

  if (cleanUri.includes("@") && !cleanUri.toLowerCase().startsWith("upi://")) {
    return {
      vpa: cleanUri,
      name: "",
      amount: "",
      note: "",
      currency: "INR",
      mcc: "",
      merchantId: "",
      transactionId: "",
      url: "",
      rawUri: `upi://pay?pa=${encodeURIComponent(cleanUri)}`,
    };
  }

  try {
    const url = new URL(cleanUri.replace(/^upi:\/\/pay\?/, "https://upi.dummy?"));
    const params = url.searchParams;
    return {
      vpa: params.get("pa") || "",
      name: params.get("pn") || "",
      amount: params.get("am") || "",
      note: params.get("tn") || params.get("tr") || "",
      currency: params.get("cu") || "INR",
      mcc: params.get("mc") || "",
      merchantId: params.get("mid") || "",
      transactionId: params.get("tid") || "",
      url: params.get("url") || "",
      rawUri: uri,
    };
  } catch {
    return {
      vpa: "",
      name: "",
      amount: "",
      note: "",
      currency: "INR",
      mcc: "",
      merchantId: "",
      transactionId: "",
      url: "",
      rawUri: uri,
    };
  }
}

function verdictFromWarnings(warnings: ValidationWarning[]): SafetyVerdict {
  const hasError = warnings.some((w) => w.type === "error");
  const hasWarning = warnings.some((w) => w.type === "warning");

  if (hasError) {
    return {
      level: "suspicious",
      label: "Suspicious",
      description: "This QR may be invalid, corrupted, or tampered. Do not use it as a payment poster without verifying the UPI ID.",
      warnings,
    };
  }
  if (hasWarning || warnings.length > 2) {
    return {
      level: "caution",
      label: "Use with Caution",
      description: "Some fields look unusual. Test the QR with a ₹1 scan before printing or displaying it publicly.",
      warnings,
    };
  }
  return {
    level: "safe",
    label: "Looks Safe",
    description: "All checks passed. The payload conforms to standard upi://pay syntax with a valid payee VPA.",
    warnings,
  };
}

export function UpiQrDecoder() {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsedData, setParsedData] = useState<ParsedUpiData | null>(null);
  const [verdict, setVerdict] = useState<SafetyVerdict | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const processImageFile = async (file: File) => {
    setError(null);
    setLoading(true);
    setParsedData(null);
    setVerdict(null);

    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      setImagePreview(dataUrl);

      try {
        if ("BarcodeDetector" in window) {
          try {
            const barcodeDetector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
            const img = new Image();
            img.src = dataUrl;
            await img.decode();
            const barcodes = await barcodeDetector.detect(img);
            if (barcodes && barcodes.length > 0) {
              const rawValue = barcodes[0].rawValue;
              const parsed = parseUpiUri(rawValue);
              const warnings = validateUpiUri(rawValue, parsed);
              setParsedData(parsed);
              setVerdict(verdictFromWarnings(warnings));
              setLoading(false);
              trackProductEvent("decode_complete", "upi-qr-decoder");
              return;
            } else {
              trackProductEvent("decode_no_qr_found", "upi-qr-decoder");
            }
          } catch (e) {
            console.warn("Native BarcodeDetector failed, trying canvas fallback:", e);
          }
        }

        const img = new Image();
        img.src = dataUrl;
        await img.decode();

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Could not initialize 2D canvas");

        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        try {
          const { default: jsQR } = await import("jsqr");
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code) {
            const parsed = parseUpiUri(code.data);
            const warnings = validateUpiUri(code.data, parsed);
            setParsedData(parsed);
            setVerdict(verdictFromWarnings(warnings));
            setLoading(false);
            trackProductEvent("decode_complete", "upi-qr-decoder");
            return;
          } else {
            trackProductEvent("decode_no_qr_found", "upi-qr-decoder");
          }
        } catch (jsqrErr) {
          console.warn("jsQR fallback failed:", jsqrErr);
          trackProductEvent("decode_error", "upi-qr-decoder");
        }

        setError("Could not detect a QR code in this image. Please ensure the QR code is clearly visible and well-lit.");
      } catch (err) {
        console.error(err);
        setError("Unable to parse QR code image. Please try uploading a clearer PNG or JPG image.");
        trackProductEvent("decode_error", "upi-qr-decoder");
      } finally {
        setLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processImageFile(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processImageFile(e.dataTransfer.files[0]);
    }
  };

  const handlePaste = (e: ClipboardEvent) => {
    if (e.clipboardData && e.clipboardData.files && e.clipboardData.files[0]) {
      processImageFile(e.clipboardData.files[0]);
    }
  };

  useEffect(() => {
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  const copyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const verdictColors: Record<SafetyVerdict["level"], { bg: string; border: string; text: string; icon: string }> = {
    safe: { bg: "bg-emerald-50", border: "border-emerald-300", text: "text-emerald-800", icon: "✓" },
    caution: { bg: "bg-amber-50", border: "border-amber-300", text: "text-amber-800", icon: "⚠" },
    suspicious: { bg: "bg-red-50", border: "border-red-300", text: "text-red-800", icon: "✗" },
  };

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className="relative border-2 border-dashed border-leaf/30 hover:border-leaf bg-mint/30 hover:bg-mint/50 transition-all rounded-3xl p-8 text-center cursor-pointer group shadow-sm"
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/*"
          className="hidden"
        />

        <div className="flex flex-col items-center justify-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-white border border-leaf/20 flex items-center justify-center text-leaf group-hover:scale-110 transition-transform shadow-sm">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <p className="text-lg font-black text-forest">
              Drop your QR code image here or <span className="text-leaf underline">Browse</span>
            </p>
            <p className="text-xs text-forest/70 mt-1">
              Supports PNG, JPG, WebP. You can also press <kbd className="px-1.5 py-0.5 bg-white border border-forest/20 rounded text-[10px] font-mono">Ctrl + V</kbd> to paste an image screenshot.
            </p>
          </div>
        </div>
      </div>

      {loading && (
        <div className="rounded-2xl border border-leaf/20 bg-white p-6 text-center shadow-sm">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-leaf border-t-transparent"></div>
          <p className="mt-2 text-sm font-bold text-forest">Decoding and validating UPI QR Code...</p>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700 text-sm font-medium">
          {error}
        </div>
      )}

      {parsedData && verdict && (
        <div className="rounded-3xl border border-leaf/20 bg-white p-6 shadow-md space-y-5">
          <div className="flex items-center justify-between border-b border-forest/10 pb-4">
            <h3 className="text-xl font-black text-forest flex items-center gap-2">
              Decoded UPI QR — Safety Report
            </h3>
            <span className="text-xs font-mono bg-mint text-forest px-2.5 py-1 rounded-full border border-leaf/20 font-bold">
              100% Private & Decoded Locally
            </span>
          </div>

          {/* Safety Verdict Banner */}
          <div className={`rounded-2xl ${verdictColors[verdict.level].bg} border ${verdictColors[verdict.level].border} p-5`}>
            <div className="flex items-start gap-3">
              <span className={`text-2xl shrink-0 font-black ${verdictColors[verdict.level].text}`}>
                {verdictColors[verdict.level].icon}
              </span>
              <div className="space-y-1.5">
                <p className={`text-lg font-black ${verdictColors[verdict.level].text}`}>
                  {verdict.label}
                </p>
                <p className={`text-sm ${verdictColors[verdict.level].text}/80 leading-relaxed`}>
                  {verdict.description}
                </p>
              </div>
            </div>

            {verdict.warnings.length > 0 && (
              <div className="mt-4 space-y-2">
                {verdict.warnings.map((w, i) => (
                  <div key={i} className={`rounded-xl border p-3 ${
                    w.type === "error" ? "border-red-300 bg-red-100/50 text-red-800" :
                    w.type === "warning" ? "border-amber-300 bg-amber-100/50 text-amber-800" :
                    "border-blue-200 bg-blue-50 text-blue-700"
                  }`}>
                    <div className="flex items-start gap-2">
                      <span className="text-sm font-black shrink-0 mt-0.5">
                        {w.type === "error" ? "✗" : w.type === "warning" ? "⚠" : "ℹ"}
                      </span>
                      <div>
                        <p className="text-xs font-bold">{w.message}</p>
                        {w.detail && <p className="text-[11px] mt-0.5 opacity-80">{w.detail}</p>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Payee Field Grid */}
          <div className="grid md:grid-cols-3 gap-6 items-start">
            {imagePreview && (
              <div className="md:col-span-1 flex flex-col items-center">
                <img
                  src={imagePreview}
                  alt="Scanned QR Code"
                  className="w-44 h-44 object-contain rounded-2xl border border-forest/10 shadow-inner bg-cream p-2"
                />
                <span className="text-[11px] text-forest/60 mt-2 font-medium">Uploaded QR Preview</span>
              </div>
            )}

            <div className="md:col-span-2 space-y-4">
              {/* UPI ID (VPA) */}
              <div className="bg-mint/40 border border-leaf/20 p-4 rounded-2xl">
                <p className="text-xs uppercase tracking-wider font-black text-forest/60">UPI ID / VPA (pa=)</p>
                <div className="flex items-center justify-between mt-1">
                  <span className="font-mono text-lg font-bold text-forest break-all">
                    {parsedData.vpa || <span className="text-red-600 italic">Not specified — QR may be invalid</span>}
                  </span>
                  {parsedData.vpa && (
                    <button
                      onClick={() => copyToClipboard(parsedData.vpa, "vpa")}
                      className="ml-3 shrink-0 px-3 py-1.5 rounded-xl bg-forest text-white hover:bg-leaf text-xs font-bold transition-all shadow-sm"
                    >
                      {copiedField === "vpa" ? "✓ Copied!" : "Copy VPA"}
                    </button>
                  )}
                </div>
              </div>

              {/* Payee Name & Amount */}
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="bg-cream border border-forest/10 p-3.5 rounded-2xl">
                  <p className="text-[11px] uppercase tracking-wider font-bold text-forest/60">Payee Name (pn=)</p>
                  <p className="text-sm font-bold text-forest mt-0.5">
                    {parsedData.name || <span className="text-forest/40 italic">Not specified</span>}
                  </p>
                </div>

                <div className="bg-cream border border-forest/10 p-3.5 rounded-2xl">
                  <p className="text-[11px] uppercase tracking-wider font-bold text-forest/60">Preset Amount (am=)</p>
                  <p className="text-sm font-bold text-forest mt-0.5">
                    {parsedData.amount ? `₹${parsedData.amount} ${parsedData.currency}` : "Any Amount (User Enters)"}
                  </p>
                </div>
              </div>

              {/* Note, MCC, Merchant ID — shown if present */}
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="bg-cream border border-forest/10 p-3.5 rounded-2xl">
                  <p className="text-[11px] uppercase tracking-wider font-bold text-forest/60">Payment Note (tn=)</p>
                  <p className="text-sm font-bold text-forest mt-0.5">
                    {parsedData.note || <span className="text-forest/40 italic">Not specified</span>}
                  </p>
                </div>

                <div className="bg-cream border border-forest/10 p-3.5 rounded-2xl">
                  <p className="text-[11px] uppercase tracking-wider font-bold text-forest/60">Merchant Code (mc=)</p>
                  <p className="text-sm font-bold text-forest mt-0.5">
                    {parsedData.mcc || <span className="text-forest/40 italic">Not specified</span>}
                  </p>
                </div>
              </div>

              {/* Additional fields if present */}
              {(parsedData.merchantId || parsedData.transactionId || parsedData.url) && (
                <div className="bg-cream border border-forest/10 p-3.5 rounded-2xl space-y-2">
                  <p className="text-[11px] uppercase tracking-wider font-bold text-forest/60">Additional Fields</p>
                  <div className="grid grid-cols-3 gap-2 text-[11px] text-forest/70">
                    {parsedData.merchantId && (
                      <div><span className="font-bold">MID:</span> {parsedData.merchantId}</div>
                    )}
                    {parsedData.transactionId && (
                      <div><span className="font-bold">TID:</span> {parsedData.transactionId}</div>
                    )}
                    {parsedData.url && (
                      <div className="col-span-3"><span className="font-bold">URL:</span> <code className="text-[10px] break-all">{parsedData.url}</code></div>
                    )}
                  </div>
                </div>
              )}

              {/* Raw URI */}
              <div className="bg-white border border-forest/10 p-3.5 rounded-2xl">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[11px] uppercase tracking-wider font-bold text-forest/60">Raw upi://pay URI</p>
                  <button
                    onClick={() => copyToClipboard(parsedData.rawUri, "raw")}
                    className="px-2.5 py-1 rounded-lg bg-forest/10 text-forest hover:bg-forest/20 text-[10px] font-bold transition-all"
                  >
                    {copiedField === "raw" ? "✓ Copied!" : "Copy URI"}
                  </button>
                </div>
                <code className="block text-[11px] font-mono text-forest/80 break-all bg-forest/5 rounded-lg p-2.5 max-h-20 overflow-y-auto">
                  {parsedData.rawUri}
                </code>
              </div>

              {/* Create Standee Button */}
              {parsedData.vpa && (
                <div className="pt-2 flex flex-col sm:flex-row gap-3">
                  <a
                    href={`/?upiId=${encodeURIComponent(parsedData.vpa)}&name=${encodeURIComponent(parsedData.name)}#generator`}
                    className="inline-flex items-center justify-center flex-1 py-3 px-5 rounded-2xl bg-leaf text-white font-black text-sm hover:bg-forest transition-all shadow-md gap-2"
                  >
                    🎨 Create & Print Counter Standee for this UPI ID →
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}