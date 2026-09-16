import { useState, useEffect, useRef, useId, useMemo } from "react";
import QRCode from "qrcode";
import { safeToPng, downloadDataUrl, notifyExportError } from "../lib/export-image";

type LayoutGrid = "6-grid" | "4-grid" | "12-grid";
type QrContentType = "upi" | "url" | "text" | "wifi";
type AppSkin = "phonepe" | "gpay" | "paytm" | "bhim" | "neutral";
type LogoKey = keyof typeof presetLogos | "none";

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
};

const SKINS: Record<
  AppSkin,
  { label: string; header: string; headerText: string; logo: LogoKey; badge: string }
> = {
  phonepe: { label: "PhonePe", header: "#5f259f", headerText: "#ffffff", logo: "phonepe", badge: "PhonePe · UPI" },
  gpay: { label: "Google Pay", header: "#1a73e8", headerText: "#ffffff", logo: "gpay", badge: "GPay · UPI" },
  paytm: { label: "Paytm", header: "#00baf2", headerText: "#ffffff", logo: "paytm", badge: "Paytm · UPI" },
  bhim: { label: "BHIM", header: "#c2410c", headerText: "#ffffff", logo: "bhim", badge: "BHIM · UPI" },
  neutral: { label: "Plain UPI", header: "#113b2c", headerText: "#ffffff", logo: "none", badge: "UPI" },
};

const APP_ICONS = [
  { src: "/phonepe.png", label: "PhonePe" },
  { src: "/googlepay.png", label: "GPay" },
  { src: "/paytm.ico", label: "Paytm" },
  { src: "/bhim.ico", label: "BHIM" },
];

function readSkinFromUrl(): AppSkin {
  if (typeof window === "undefined") return "phonepe";
  const params = new URLSearchParams(window.location.search);
  const raw = (params.get("app") || window.location.hash.replace("#", "")).toLowerCase();
  if (raw === "gpay" || raw === "googlepay" || raw === "google-pay") return "gpay";
  if (raw === "paytm") return "paytm";
  if (raw === "bhim") return "bhim";
  if (raw === "neutral" || raw === "upi") return "neutral";
  if (raw === "phonepe") return "phonepe";
  return "phonepe";
}

export function StickerSheetGenerator() {
  const [qrContentType, setQrContentType] = useState<QrContentType>("upi");
  const [skin, setSkin] = useState<AppSkin>("phonepe");
  const [payee, setPayee] = useState("Sharma General Store");
  const [upiId, setUpiId] = useState("sharmastore@ybl");
  const [amount, setAmount] = useState("");
  const [urlValue, setUrlValue] = useState("https://www.proupiqr.in");
  const [textValue, setTextValue] = useState("Scan for store info");
  const [wifiSsid, setWifiSsid] = useState("Store_Guest_WiFi");
  const [wifiPass, setWifiPass] = useState("welcome123");
  const [layout, setLayout] = useState<LayoutGrid>("6-grid");
  const [logo, setLogo] = useState<LogoKey>("phonepe");

  const [qrDataUrl, setQrDataUrl] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  const payeeId = useId();
  const upiIdId = useId();
  const amountId = useId();
  const typeId = useId();
  const urlId = useId();
  const textId = useId();
  const wifiSsidId = useId();
  const wifiPassId = useId();
  const layoutId = useId();
  const logoId = useId();
  const skinGroupId = useId();

  useEffect(() => {
    const next = readSkinFromUrl();
    setSkin(next);
    setLogo(SKINS[next].logo);
  }, []);

  const applySkin = (next: AppSkin) => {
    setSkin(next);
    setLogo(SKINS[next].logo);
    setQrContentType("upi");
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("app", next);
      window.history.replaceState({}, "", url);
    }
  };

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
        const logoSize = layout === "12-grid" ? 48 : 72;
        await QRCode.toCanvas(canvas, rawQrPayload, {
          width: 400,
          margin: 1,
          errorCorrectionLevel: "H",
          color: { dark: "#111111", light: "#ffffff" },
        });

        if (logo !== "none" && presetLogos[logo] && layout !== "12-grid") {
          const ctx = canvas.getContext("2d");
          if (ctx) {
            const logoImg = new Image();
            logoImg.crossOrigin = "anonymous";
            logoImg.onload = () => {
              const x = (canvas.width - logoSize) / 2;
              const y = (canvas.height - logoSize) / 2;
              ctx.fillStyle = "#ffffff";
              ctx.beginPath();
              if (ctx.roundRect) {
                ctx.roundRect(x - 6, y - 6, logoSize + 12, logoSize + 12, 14);
              } else {
                ctx.rect(x - 6, y - 6, logoSize + 12, logoSize + 12);
              }
              ctx.fill();
              ctx.drawImage(logoImg, x, y, logoSize, logoSize);
              setQrDataUrl(canvas.toDataURL("image/png"));
            };
            logoImg.onerror = () => setQrDataUrl(canvas.toDataURL("image/png"));
            logoImg.src = presetLogos[logo];
            return;
          }
        }
        setQrDataUrl(canvas.toDataURL("image/png"));
      } catch (e) {
        console.error(e);
      }
    }
    void buildQr();
  }, [rawQrPayload, logo, layout]);

  const countMap = { "4-grid": 4, "6-grid": 6, "12-grid": 12 };
  const gridClassMap = {
    "4-grid": "grid-cols-2 grid-rows-2 gap-2",
    "6-grid": "grid-cols-2 grid-rows-3 gap-1.5",
    "12-grid": "grid-cols-3 grid-rows-4 gap-1",
  };
  const compact = layout === "12-grid";
  const theme = SKINS[skin];

  const handleDownloadPng = async () => {
    if (!sheetRef.current) return;
    setIsGenerating(true);
    try {
      const dataUrl = await safeToPng(sheetRef.current, { pixelRatio: 3, cacheBust: true });
      downloadDataUrl(dataUrl, `${skin}-upi-qr-stickers-${layout}.png`);
    } catch (e) {
      console.error("PNG export failed:", e);
      notifyExportError();
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
      pdf.save(`${skin}-upi-qr-stickers-${layout}.pdf`);
    } catch (e) {
      console.error("PDF export failed:", e);
      notifyExportError();
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] w-full min-w-0">
      <div className="rounded-3xl border border-forest/10 bg-white p-4 sm:p-6 md:p-8 shadow-sm w-full min-w-0">
        <h2 className="text-xl font-black text-forest">Shop QR sticker</h2>
        <p className="mt-1 text-xs text-forest/60">
          PhonePe / GPay look on the sticker. The code is a normal UPI QR — any app can scan it.
        </p>

        <form className="mt-6 space-y-4" onSubmit={(e) => e.preventDefault()}>
          <fieldset>
            <legend className="text-xs font-bold text-forest" id={skinGroupId}>
              Sticker look
            </legend>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-labelledby={skinGroupId}>
              {(Object.keys(SKINS) as AppSkin[]).map((key) => {
                const item = SKINS[key];
                const selected = skin === key;
                return (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => applySkin(key)}
                    className={`rounded-xl border px-3 py-2 text-left text-xs font-black transition focus-visible:ring-2 focus-visible:ring-leaf ${
                      selected ? "border-transparent text-white shadow-sm" : "border-forest/10 bg-cream/40 text-forest hover:border-forest/25"
                    }`}
                    style={selected ? { backgroundColor: item.header, color: item.headerText } : undefined}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="grid gap-1 min-w-0">
            <label htmlFor={payeeId} className="text-xs font-bold text-forest">
              Shop name
            </label>
            <input
              id={payeeId}
              type="text"
              value={payee}
              onChange={(e) => setPayee(e.target.value)}
              autoComplete="organization"
              className="w-full min-w-0 rounded-xl border border-forest/10 bg-cream/30 px-3.5 py-2.5 text-xs font-semibold outline-none focus:border-leaf focus-visible:ring-2 focus-visible:ring-leaf"
              placeholder="e.g. Sharma Kirana Store"
            />
          </div>

          {qrContentType === "upi" && (
            <>
              <div className="grid gap-1 min-w-0">
                <label htmlFor={upiIdId} className="text-xs font-bold text-forest">
                  UPI ID
                </label>
                <input
                  id={upiIdId}
                  type="text"
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  inputMode="email"
                  className="w-full min-w-0 rounded-xl border border-forest/10 bg-cream/30 px-3.5 py-2.5 text-xs font-mono outline-none focus:border-leaf focus-visible:ring-2 focus-visible:ring-leaf"
                  placeholder="e.g. shop@ybl"
                />
              </div>
              <div className="grid gap-1 min-w-0">
                <label htmlFor={amountId} className="text-xs font-bold text-forest">
                  Fixed amount (optional ₹)
                </label>
                <input
                  id={amountId}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full min-w-0 rounded-xl border border-forest/10 bg-cream/30 px-3.5 py-2.5 text-xs outline-none focus:border-leaf focus-visible:ring-2 focus-visible:ring-leaf"
                  placeholder="Open amount"
                />
              </div>
            </>
          )}

          {qrContentType === "url" && (
            <div className="grid gap-1 min-w-0">
              <label htmlFor={urlId} className="text-xs font-bold text-forest">
                Website URL
              </label>
              <input
                id={urlId}
                type="url"
                value={urlValue}
                onChange={(e) => setUrlValue(e.target.value)}
                className="w-full min-w-0 rounded-xl border border-forest/10 bg-cream/30 px-3.5 py-2.5 text-xs font-mono outline-none focus:border-leaf focus-visible:ring-2 focus-visible:ring-leaf"
                placeholder="https://example.com"
              />
            </div>
          )}

          {qrContentType === "text" && (
            <div className="grid gap-1 min-w-0">
              <label htmlFor={textId} className="text-xs font-bold text-forest">
                QR text
              </label>
              <textarea
                id={textId}
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                rows={2}
                className="w-full min-w-0 rounded-xl border border-forest/10 bg-cream/30 px-3.5 py-2.5 text-xs outline-none focus:border-leaf focus-visible:ring-2 focus-visible:ring-leaf"
                placeholder="Enter text..."
              />
            </div>
          )}

          {qrContentType === "wifi" && (
            <div className="grid gap-2 min-w-0 sm:grid-cols-2">
              <div className="grid gap-1 min-w-0">
                <label htmlFor={wifiSsidId} className="text-xs font-bold text-forest">
                  WiFi name (SSID)
                </label>
                <input
                  id={wifiSsidId}
                  type="text"
                  value={wifiSsid}
                  onChange={(e) => setWifiSsid(e.target.value)}
                  className="w-full min-w-0 rounded-xl border border-forest/10 bg-cream/30 px-3.5 py-2.5 text-xs outline-none focus:border-leaf focus-visible:ring-2 focus-visible:ring-leaf"
                />
              </div>
              <div className="grid gap-1 min-w-0">
                <label htmlFor={wifiPassId} className="text-xs font-bold text-forest">
                  WiFi password
                </label>
                <input
                  id={wifiPassId}
                  type="password"
                  autoComplete="off"
                  value={wifiPass}
                  onChange={(e) => setWifiPass(e.target.value)}
                  className="w-full min-w-0 rounded-xl border border-forest/10 bg-cream/30 px-3.5 py-2.5 text-xs outline-none focus:border-leaf focus-visible:ring-2 focus-visible:ring-leaf"
                />
              </div>
            </div>
          )}

          <div className="grid gap-1 min-w-0">
            <label htmlFor={layoutId} className="text-xs font-bold text-forest">
              Stickers per A4
            </label>
            <select
              id={layoutId}
              value={layout}
              onChange={(e) => setLayout(e.target.value as LayoutGrid)}
              className="w-full min-w-0 rounded-xl border border-forest/10 bg-cream/30 px-3.5 py-2.5 text-xs font-bold outline-none focus:border-leaf focus-visible:ring-2 focus-visible:ring-leaf"
            >
              <option value="6-grid">6 — standard counter sticker</option>
              <option value="4-grid">4 — large desk / glass</option>
              <option value="12-grid">12 — parcels and extra tills</option>
            </select>
          </div>

          <details className="rounded-xl border border-forest/10 bg-cream/20 p-3">
            <summary className="cursor-pointer text-xs font-bold text-forest">More options (URL, WiFi, logo)</summary>
            <div className="mt-3 space-y-3">
              <div className="grid gap-1 min-w-0">
                <label htmlFor={typeId} className="text-xs font-bold text-forest">
                  QR data type
                </label>
                <select
                  id={typeId}
                  value={qrContentType}
                  onChange={(e) => setQrContentType(e.target.value as QrContentType)}
                  className="w-full min-w-0 rounded-xl border border-forest/10 bg-white px-3.5 py-2.5 text-xs font-bold outline-none focus:border-leaf focus-visible:ring-2 focus-visible:ring-leaf"
                >
                  <option value="upi">UPI payment QR</option>
                  <option value="url">Website / link QR</option>
                  <option value="text">Plain text QR</option>
                  <option value="wifi">WiFi QR</option>
                </select>
              </div>
              <div className="grid gap-1 min-w-0">
                <label htmlFor={logoId} className="text-xs font-bold text-forest">
                  QR centre logo
                </label>
                <select
                  id={logoId}
                  value={logo}
                  onChange={(e) => setLogo(e.target.value as LogoKey)}
                  className="w-full min-w-0 rounded-xl border border-forest/10 bg-white px-3.5 py-2.5 text-xs font-bold outline-none focus:border-leaf focus-visible:ring-2 focus-visible:ring-leaf"
                >
                  <option value="phonepe">PhonePe</option>
                  <option value="gpay">Google Pay</option>
                  <option value="paytm">Paytm</option>
                  <option value="bhim">BHIM</option>
                  <option value="whatsapp">WhatsApp Pay</option>
                  <option value="amazon">Amazon Pay</option>
                  <option value="sbi">SBI</option>
                  <option value="hdfc">HDFC</option>
                  <option value="icici">ICICI</option>
                  <option value="none">No centre logo</option>
                </select>
              </div>
            </div>
          </details>
        </form>

        <p className="mt-4 rounded-xl bg-mint/50 px-3 py-2 text-[11px] leading-relaxed text-forest/75">
          Not an official PhonePe, Google Pay, or Paytm merchant kit. The sticker encodes your UPI ID. Customers pay from any UPI app.
        </p>

        <div className="mt-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-5 border-t border-forest/10">
          <button
            type="button"
            onClick={handleDownloadPng}
            disabled={isGenerating}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-forest px-6 py-3.5 text-xs font-black text-white shadow-lg transition hover:bg-leaf focus-visible:ring-2 focus-visible:ring-leaf active:scale-95 disabled:opacity-50"
          >
            {isGenerating ? "Generating..." : "Download sticker PNG"}
          </button>
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={isGenerating}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-forest/15 bg-mint/50 px-6 py-3.5 text-xs font-black text-forest transition hover:bg-mint focus-visible:ring-2 focus-visible:ring-leaf active:scale-95 disabled:opacity-50"
          >
            {isGenerating ? "Generating..." : "Download A4 PDF"}
          </button>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center rounded-3xl border border-forest/10 bg-cream/20 p-4 sm:p-6 shadow-sm w-full min-w-0">
        <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-forest/50">A4 printable preview</h3>

        <div className="w-full max-w-[420px] aspect-[1/1.414] bg-neutral-200 border border-black/10 shadow-2xl rounded-xl p-2 overflow-hidden relative">
          <div ref={sheetRef} className={`w-full h-full bg-white grid ${gridClassMap[layout]} p-1`}>
            {Array.from({ length: countMap[layout] }).map((_, idx) => (
              <article
                key={idx}
                className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-black/10 bg-white"
              >
                <div
                  className="flex shrink-0 items-center justify-between px-1.5"
                  style={{
                    backgroundColor: theme.header,
                    color: theme.headerText,
                    paddingTop: compact ? 2 : 4,
                    paddingBottom: compact ? 2 : 4,
                  }}
                >
                  <span className={`font-black leading-none ${compact ? "text-[6px]" : "text-[8px]"}`}>
                    {theme.badge}
                  </span>
                  {theme.logo !== "none" && presetLogos[theme.logo] ? (
                    <img
                      src={presetLogos[theme.logo]}
                      alt=""
                      width={12}
                      height={12}
                      className={compact ? "h-2.5 w-2.5 rounded-full object-contain" : "h-3.5 w-3.5 rounded-full object-contain"}
                    />
                  ) : null}
                </div>

                <div className="flex min-h-0 flex-1 flex-col items-center justify-between px-1 py-1 text-center">
                  <p
                    className={`w-full truncate font-black leading-tight text-forest ${compact ? "text-[7px]" : "text-[10px]"}`}
                  >
                    {payee || "Shop name"}
                  </p>

                  {qrDataUrl ? (
                    <img
                      src={qrDataUrl}
                      alt=""
                      width={120}
                      height={120}
                      className={`aspect-square w-[72%] max-h-[58%] object-contain ${compact ? "max-h-[50%]" : ""}`}
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded bg-neutral-100 text-[8px] text-neutral-400">
                      Loading
                    </div>
                  )}

                  <div className="w-full shrink-0">
                    {qrContentType === "upi" ? (
                      <p className={`truncate font-mono font-semibold text-neutral-600 ${compact ? "text-[6px]" : "text-[8px]"}`}>
                        {upiId || "payee@upi"}
                      </p>
                    ) : null}
                    {amount && qrContentType === "upi" ? (
                      <p className={`font-black text-forest ${compact ? "text-[6px]" : "text-[8px]"}`}>Pay ₹{amount}</p>
                    ) : null}
                    {!compact ? (
                      <p className="mt-0.5 text-[6px] font-bold uppercase tracking-wider text-neutral-400">
                        Scan &amp; pay · any UPI app
                      </p>
                    ) : null}
                    {!compact ? (
                      <div className="mt-0.5 flex items-center justify-center gap-1">
                        {APP_ICONS.map((icon) => (
                          <img
                            key={icon.label}
                            src={icon.src}
                            alt=""
                            width={10}
                            height={10}
                            className="h-2.5 w-2.5 rounded-full object-contain"
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>

        <p className="mt-3 max-w-xs text-center text-[10px] text-forest/50">
          Print on matte sticker paper. Test-scan at the counter before you laminate.
        </p>
      </div>
    </div>
  );
}
