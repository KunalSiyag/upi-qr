import { useState, useEffect, useRef, useId, useMemo } from "react";
import QRCode from "qrcode";
import { safeToPng, downloadDataUrl, notifyExportError } from "../lib/export-image";

type LayoutGrid = "6-grid" | "4-grid" | "12-grid";

const presetLogos: Record<string, string> = {
  phonepe: "/phonepe.png",
  gpay: "/googlepay.png",
  paytm: "/paytm.ico",
  bhim: "/bhim.ico",
  whatsapp: "/whatsapp.png",
  amazon: "/amazonpay.png",
  sbi: "/sbi.ico",
  hdfc: "/hdfc.ico",
  icici: "/icici.ico",
  axis: `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="24" fill="#97144d" /><path d="M50 20 L78 74 H22 Z" fill="#ffffff" /><path d="M50 40 L65 74 H35 Z" fill="#97144d" /><text x="50" y="92" font-family="sans-serif" font-weight="900" font-size="13" fill="#ffffff" text-anchor="middle">AXIS BANK</text></svg>`)}`
};

export function StickerSheetGenerator() {
  const [qrContentType, setQrContentType] = useState<"upi" | "url" | "text" | "wifi">("upi");
  const [payee, setPayee] = useState("Sharma General Store");
  const [upiId, setUpiId] = useState("sharmastore@upi");
  const [amount, setAmount] = useState("");
  const [urlValue, setUrlValue] = useState("https://www.proupiqr.in");
  const [textValue, setTextValue] = useState("Scan for store info");
  const [wifiSsid, setWifiSsid] = useState("Store_Guest_WiFi");
  const [wifiPass, setWifiPass] = useState("welcome123");
  const [layout, setLayout] = useState<LayoutGrid>("6-grid");
  const [logo, setLogo] = useState<keyof typeof presetLogos | "none">("phonepe");
  const [accentColor, setAccentColor] = useState("#113b2c");

  const [qrDataUrl, setQrDataUrl] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  const payeeId = useId();
  const upiIdId = useId();
  const amountId = useId();

  const rawQrPayload = useMemo(() => {
    if (qrContentType === "url") {
      let u = urlValue.trim();
      if (u && !u.startsWith("http://") && !u.startsWith("https://")) {
        u = "https://" + u;
      }
      return u || "https://www.proupiqr.in";
    }
    if (qrContentType === "text") {
      return textValue.trim() || "Pro UPI QR";
    }
    if (qrContentType === "wifi") {
      return `WIFI:S:${wifiSsid.trim() || "GuestWiFi"};T:WPA;P:${wifiPass.trim()};;`;
    }
    return `upi://pay?pa=${encodeURIComponent(upiId.trim() || "payee@upi")}&pn=${encodeURIComponent(payee.trim() || "Merchant")}${
      amount ? `&am=${encodeURIComponent(amount)}` : ""
    }&cu=INR`;
  }, [qrContentType, urlValue, textValue, wifiSsid, wifiPass, upiId, payee, amount]);

  useEffect(() => {
    async function buildQr() {
      try {
        const canvas = document.createElement("canvas");
        await QRCode.toCanvas(canvas, rawQrPayload, {
          width: 400,
          margin: 1,
          errorCorrectionLevel: "H",
          color: { dark: accentColor || "#113b2c", light: "#ffffff" }
        });

        if (logo !== "none" && presetLogos[logo]) {
          const ctx = canvas.getContext("2d");
          if (ctx) {
            const logoImg = new Image();
            logoImg.crossOrigin = "anonymous";
            logoImg.onload = () => {
              const size = 72;
              const x = (canvas.width - size) / 2;
              const y = (canvas.height - size) / 2;

              // Crisp white cutout box inside center of QR matrix
              ctx.fillStyle = "#ffffff";
              ctx.beginPath();
              if (ctx.roundRect) {
                ctx.roundRect(x - 6, y - 6, size + 12, size + 12, 14);
              } else {
                ctx.rect(x - 6, y - 6, size + 12, size + 12);
              }
              ctx.fill();

              ctx.drawImage(logoImg, x, y, size, size);
              setQrDataUrl(canvas.toDataURL("image/png"));
            };
            logoImg.src = presetLogos[logo];
          }
        } else {
          setQrDataUrl(canvas.toDataURL("image/png"));
        }
      } catch (e) {
        console.error(e);
      }
    }
    void buildQr();
  }, [rawQrPayload, logo, accentColor]);

  const countMap = {
    "4-grid": 4,
    "6-grid": 6,
    "12-grid": 12,
  };

  const gridClassMap = {
    "4-grid": "grid-cols-2 grid-rows-2 gap-4",
    "6-grid": "grid-cols-2 grid-rows-3 gap-3",
    "12-grid": "grid-cols-3 grid-rows-4 gap-2",
  };

  const qrSizeMap = {
    "4-grid": "max-w-[130px] max-h-[130px]",
    "6-grid": "max-w-[95px] max-h-[95px]",
    "12-grid": "max-w-[60px] max-h-[60px]"
  };

  const handleDownloadPng = async () => {
    if (!sheetRef.current) return;
    setIsGenerating(true);
    try {
      const dataUrl = await safeToPng(sheetRef.current, { pixelRatio: 3, cacheBust: true });
      downloadDataUrl(dataUrl, `upi-qr-stickers-${layout}.png`);
    } catch (e) {
      console.error("PNG export failed:", e);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!sheetRef.current) return;
    setIsGenerating(true);
    try {
      const { jsPDF } = await import("jspdf");
      const dataUrl = await safeToPng(sheetRef.current, { pixelRatio: 3, cacheBust: true });
      const pdf = new jsPDF("p", "mm", "a4");
      pdf.addImage(dataUrl, "PNG", 0, 0, 210, 297);
      pdf.save(`upi-qr-stickers-${layout}.pdf`);
    } catch (e) {
      console.error("PDF export failed:", e);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] w-full min-w-0">
      {/* Form Controls */}
      <div className="rounded-3xl border border-forest/10 bg-white p-4 sm:p-6 md:p-8 shadow-sm w-full min-w-0">
        <h3 className="text-xl font-black text-forest">A4 Sticker Sheet Generator</h3>
        <p className="mt-1 text-xs text-forest/60">Generate print-ready sticker sheets with logos centered right inside the QR code matrix.</p>

        <form className="mt-6 space-y-4">
          <div className="grid gap-1 min-w-0">
            <span className="text-xs font-bold text-forest">QR Data Type</span>
            <select
              value={qrContentType}
              onChange={(e) => setQrContentType(e.target.value as any)}
              className="w-full min-w-0 rounded-xl border border-forest/10 bg-cream/30 px-3.5 py-2.5 text-xs font-bold outline-none focus:border-leaf"
            >
              <option value="upi">💳 UPI Payment QR</option>
              <option value="url">🔗 Website / Link QR</option>
              <option value="text">📝 Plain Text / Note QR</option>
              <option value="wifi">📶 WiFi Network QR</option>
            </select>
          </div>

          <div className="grid gap-1 min-w-0">
            <label htmlFor={payeeId} className="text-xs font-bold text-forest">Sticker Title / Shop Name</label>
            <input
              id={payeeId}
              type="text"
              value={payee}
              onChange={(e) => setPayee(e.target.value)}
              className="w-full min-w-0 rounded-xl border border-forest/10 bg-cream/30 px-3.5 py-2.5 text-xs font-semibold outline-none focus:border-leaf"
              placeholder="e.g. Sharma Kirana Store"
            />
          </div>

          {qrContentType === "upi" && (
            <>
              <div className="grid gap-1 min-w-0">
                <label htmlFor={upiIdId} className="text-xs font-bold text-forest">UPI VPA ID</label>
                <input
                  id={upiIdId}
                  type="text"
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  className="w-full min-w-0 rounded-xl border border-forest/10 bg-cream/30 px-3.5 py-2.5 text-xs font-mono outline-none focus:border-leaf"
                  placeholder="e.g. sharmastore@upi"
                />
              </div>

              <div className="grid gap-3 grid-cols-2 min-w-0">
                <div className="grid gap-1 min-w-0">
                  <label htmlFor={amountId} className="text-xs font-bold text-forest">Fixed Amount (Optional ₹)</label>
                  <input
                    id={amountId}
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full min-w-0 rounded-xl border border-forest/10 bg-cream/30 px-3.5 py-2.5 text-xs outline-none focus:border-leaf"
                    placeholder="Open amount"
                  />
                </div>
                <div className="grid gap-1 min-w-0">
                  <label className="text-xs font-bold text-forest">QR Dark Color</label>
                  <input
                    type="color"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="w-full h-[38px] rounded-xl border border-forest/10 bg-cream/30 p-1 cursor-pointer"
                  />
                </div>
              </div>
            </>
          )}

          {qrContentType === "url" && (
            <div className="grid gap-1 min-w-0">
              <label className="text-xs font-bold text-forest">Target Website URL</label>
              <input
                type="text"
                value={urlValue}
                onChange={(e) => setUrlValue(e.target.value)}
                className="w-full min-w-0 rounded-xl border border-forest/10 bg-cream/30 px-3.5 py-2.5 text-xs font-mono outline-none focus:border-leaf"
                placeholder="https://example.com"
              />
            </div>
          )}

          {qrContentType === "text" && (
            <div className="grid gap-1 min-w-0">
              <label className="text-xs font-bold text-forest">QR Text Content</label>
              <textarea
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                rows={2}
                className="w-full min-w-0 rounded-xl border border-forest/10 bg-cream/30 px-3.5 py-2.5 text-xs outline-none focus:border-leaf"
                placeholder="Enter text..."
              />
            </div>
          )}

          {qrContentType === "wifi" && (
            <div className="grid gap-2 min-w-0 sm:grid-cols-2">
              <div className="grid gap-1 min-w-0">
                <label className="text-xs font-bold text-forest">WiFi Network Name (SSID)</label>
                <input
                  type="text"
                  value={wifiSsid}
                  onChange={(e) => setWifiSsid(e.target.value)}
                  className="w-full min-w-0 rounded-xl border border-forest/10 bg-cream/30 px-3.5 py-2.5 text-xs outline-none focus:border-leaf"
                />
              </div>
              <div className="grid gap-1 min-w-0">
                <label className="text-xs font-bold text-forest">WiFi Password</label>
                <input
                  type="password"
                  value={wifiPass}
                  onChange={(e) => setWifiPass(e.target.value)}
                  className="w-full min-w-0 rounded-xl border border-forest/10 bg-cream/30 px-3.5 py-2.5 text-xs outline-none focus:border-leaf"
                />
              </div>
            </div>
          )}

          <div className="grid gap-1 min-w-0">
            <span className="text-xs font-bold text-forest">Sticker Grid Layout</span>
            <select
              value={layout}
              onChange={(e) => setLayout(e.target.value as LayoutGrid)}
              className="w-full min-w-0 rounded-xl border border-forest/10 bg-cream/30 px-3.5 py-2.5 text-xs outline-none focus:border-leaf font-bold"
            >
              <option value="6-grid">6 Stickers per A4 (Standard Counter Size)</option>
              <option value="4-grid">4 Stickers per A4 (Large Desk Standees)</option>
              <option value="12-grid">12 Stickers per A4 (Compact Product Labels)</option>
            </select>
          </div>

          <div className="grid gap-1 min-w-0">
            <span className="text-xs font-bold text-forest">QR Center Logo Overlay</span>
            <select
              value={logo}
              onChange={(e) => setLogo(e.target.value as any)}
              className="w-full min-w-0 rounded-xl border border-forest/10 bg-cream/30 px-3.5 py-2.5 text-xs outline-none focus:border-leaf font-bold"
            >
              <option value="phonepe">PhonePe Logo</option>
              <option value="gpay">Google Pay Logo</option>
              <option value="paytm">Paytm Logo</option>
              <option value="bhim">BHIM UPI Logo</option>
              <option value="whatsapp">WhatsApp Pay Logo</option>
              <option value="amazon">Amazon Pay Logo</option>
              <option value="sbi">SBI Bank Logo</option>
              <option value="hdfc">HDFC Bank Logo</option>
              <option value="icici">ICICI Bank Logo</option>
              <option value="axis">Axis Bank Logo</option>
              <option value="none">Clean QR (No Center Logo)</option>
            </select>
          </div>
        </form>

        {/* Export Buttons */}
        <div className="mt-8 flex flex-col sm:flex-row items-center gap-3 pt-6 border-t border-forest/10">
          <button
            type="button"
            onClick={handleDownloadPng}
            disabled={isGenerating}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl bg-forest px-6 py-3.5 text-xs font-black text-white shadow-lg transition hover:bg-leaf active:scale-95 disabled:opacity-50"
          >
            🖼️ Download Sheet PNG
          </button>
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={isGenerating}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl border border-forest/15 bg-mint/50 px-6 py-3.5 text-xs font-black text-forest transition hover:bg-mint active:scale-95 disabled:opacity-50"
          >
            {isGenerating ? "Generating..." : "📄 Download A4 PDF"}
          </button>
        </div>
      </div>

      {/* Live A4 Preview Container */}
      <div className="flex flex-col items-center justify-center rounded-3xl border border-forest/10 bg-cream/20 p-4 sm:p-6 shadow-sm w-full min-w-0">
        <h4 className="mb-3 text-xs font-black uppercase tracking-widest text-forest/50">A4 Printable Page Preview</h4>
        
        {/* Scaled A4 Sheet Container */}
        <div className="w-full max-w-[420px] aspect-[1/1.414] bg-white border border-black/10 shadow-2xl rounded-xl p-3 overflow-hidden relative">
          <div
            ref={sheetRef}
            className={`w-full h-full bg-white grid ${gridClassMap[layout]} p-1 print:p-0`}
          >
            {Array.from({ length: countMap[layout] }).map((_, idx) => (
              <div
                key={idx}
                className="border-2 border-dashed border-neutral-300 rounded-xl p-2 flex flex-col items-center justify-between text-center bg-cream/10 relative overflow-hidden"
              >
                {/* Center Logo Embedded QR */}
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="UPI QR Code"
                    className={`w-full ${qrSizeMap[layout]} aspect-square object-contain mx-auto my-auto shrink-0`}
                  />
                ) : (
                  <div className="w-16 h-16 bg-neutral-100 rounded-lg flex items-center justify-center text-[10px] text-neutral-400">
                    Loading QR...
                  </div>
                )}

                {/* Merchant Details */}
                <div className="mt-0.5 w-full shrink-0">
                  <p className="font-black text-forest text-[10px] truncate leading-tight">
                    {payee || "Merchant Name"}
                  </p>
                  <p className="text-[8px] font-mono font-semibold text-neutral-500 truncate">
                    {upiId || "payee@upi"}
                  </p>
                  {amount && (
                    <span className="mt-0.5 inline-block rounded bg-mint px-1 py-0.2 text-[8px] font-black text-leaf">
                      Pay ₹{amount}
                    </span>
                  )}
                </div>

                {/* Footer */}
                <div className="mt-0.5 w-full border-t border-dashed border-neutral-200 pt-0.5 flex items-center justify-between text-[7px] font-bold text-neutral-400 uppercase tracking-wider shrink-0">
                  <span>ACCEPTED HERE</span>
                  <span>UPI</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-3 text-[10px] text-center text-forest/50 max-w-xs">
          Center-embedded bank/app logos. Standard A4 export fits 4, 6, or 12 stickers perfectly.
        </p>
      </div>
    </div>
  );
}
