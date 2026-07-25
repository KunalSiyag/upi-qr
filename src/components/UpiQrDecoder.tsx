import React, { useState, useRef, useEffect } from "react";

interface ParsedUpiData {
  vpa: string;
  name: string;
  amount: string;
  note: string;
  currency: string;
  mcc: string;
  rawUri: string;
}

export function UpiQrDecoder() {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsedData, setParsedData] = useState<ParsedUpiData | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Helper to parse upi://pay URI strings
  const parseUpiUri = (uri: string): ParsedUpiData => {
    let cleanUri = uri.trim();
    if (!cleanUri.toLowerCase().startsWith("upi://pay")) {
      // If it's plain text or plain UPI ID
      if (cleanUri.includes("@")) {
        return {
          vpa: cleanUri,
          name: "",
          amount: "",
          note: "",
          currency: "INR",
          mcc: "",
          rawUri: `upi://pay?pa=${encodeURIComponent(cleanUri)}`,
        };
      }
    }

    try {
      const url = new URL(cleanUri.replace("upi://pay", "https://upi.dummy"));
      const params = url.searchParams;
      return {
        vpa: params.get("pa") || "",
        name: params.get("pn") || "",
        amount: params.get("am") || "",
        note: params.get("tn") || params.get("tr") || "",
        currency: params.get("cu") || "INR",
        mcc: params.get("mc") || "",
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
        rawUri: uri,
      };
    }
  };

  const processImageFile = async (file: File) => {
    setError(null);
    setLoading(true);
    setParsedData(null);

    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      setImagePreview(dataUrl);

      try {
        // Method 1: Check native BarcodeDetector API
        if ("BarcodeDetector" in window) {
          try {
            // @ts-ignore
            const barcodeDetector = new window.BarcodeDetector({ formats: ["qr_code"] });
            const img = new Image();
            img.src = dataUrl;
            await img.decode();
            const barcodes = await barcodeDetector.detect(img);
            if (barcodes && barcodes.length > 0) {
              const rawValue = barcodes[0].rawValue;
              setParsedData(parseUpiUri(rawValue));
              setLoading(false);
              return;
            }
          } catch (e) {
            console.warn("Native BarcodeDetector failed, trying canvas fallback:", e);
          }
        }

        // Canvas element decoding or fallbacks
        const img = new Image();
        img.src = dataUrl;
        await img.decode();

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Could not initialize 2D canvas");

        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        // Fetch jsQR dynamically or attempt BarcodeDetector with Blob
        if ("BarcodeDetector" in window) {
          // Retry with Blob if HTMLImageElement failed
          // @ts-ignore
          const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
          const barcodes = await detector.detect(canvas);
          if (barcodes && barcodes.length > 0) {
            setParsedData(parseUpiUri(barcodes[0].rawValue));
            setLoading(false);
            return;
          }
        }

        // If native BarcodeDetector is not available in browser
        setError("Could not detect a QR code in this image. Please ensure the QR code is clearly visible and well-lit.");
      } catch (err) {
        console.error(err);
        setError("Unable to parse QR code image. Please try uploading a clearer PNG or JPG image.");
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

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6">
      {/* Upload Box */}
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
          <p className="mt-2 text-sm font-bold text-forest">Decoding UPI QR Code...</p>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700 text-sm font-medium">
          ⚠️ {error}
        </div>
      )}

      {/* Results Section */}
      {parsedData && (
        <div className="rounded-3xl border border-leaf/20 bg-white p-6 shadow-md space-y-6">
          <div className="flex items-center justify-between border-b border-forest/10 pb-4">
            <h3 className="text-xl font-black text-forest flex items-center gap-2">
              <span className="text-leaf">✓</span> Extracted UPI Payment Details
            </h3>
            <span className="text-xs font-mono bg-mint text-forest px-2.5 py-1 rounded-full border border-leaf/20 font-bold">
              100% Private & Decoded Locally
            </span>
          </div>

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
                <p className="text-xs uppercase tracking-wider font-black text-forest/60">UPI ID / VPA</p>
                <div className="flex items-center justify-between mt-1">
                  <span className="font-mono text-lg font-bold text-forest break-all">
                    {parsedData.vpa || "Not specified in QR"}
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
                  <p className="text-[11px] uppercase tracking-wider font-bold text-forest/60">Payee Name</p>
                  <p className="text-sm font-bold text-forest mt-0.5">
                    {parsedData.name || "Standard UPI Account"}
                  </p>
                </div>

                <div className="bg-cream border border-forest/10 p-3.5 rounded-2xl">
                  <p className="text-[11px] uppercase tracking-wider font-bold text-forest/60">Preset Amount</p>
                  <p className="text-sm font-bold text-forest mt-0.5">
                    {parsedData.amount ? `₹${parsedData.amount} ${parsedData.currency}` : "Any Amount (User Enters)"}
                  </p>
                </div>
              </div>

              {/* Note / Reference */}
              {parsedData.note && (
                <div className="bg-cream border border-forest/10 p-3.5 rounded-2xl">
                  <p className="text-[11px] uppercase tracking-wider font-bold text-forest/60">Payment Note / Remark</p>
                  <p className="text-sm font-bold text-forest mt-0.5">{parsedData.note}</p>
                </div>
              )}

              {/* Action Link to Create Standee */}
              {parsedData.vpa && (
                <div className="pt-2">
                  <a
                    href={`/?upiId=${encodeURIComponent(parsedData.vpa)}&name=${encodeURIComponent(parsedData.name)}#generator`}
                    className="inline-flex items-center justify-center w-full py-3 px-5 rounded-2xl bg-leaf text-white font-black text-sm hover:bg-forest transition-all shadow-md gap-2"
                  >
                    🎨 Create & Print Counter Poster / Standee for this UPI ID →
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
