import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

export function EmbedCard() {
  const [params, setParams] = useState({
    pa: "",
    pn: "",
    am: "",
    tn: "",
    theme: "#4f46e5",
    logo: "none",
  });
  const [qrUrl, setQrUrl] = useState("");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    // Parse query params in client
    const searchParams = new URLSearchParams(window.location.search);
    const pa = searchParams.get("pa") || "example@upi";
    const pn = searchParams.get("pn") || "Payee Name";
    const am = searchParams.get("am") || "";
    const tn = searchParams.get("tn") || "";
    const themeRaw = searchParams.get("theme") || "4f46e5";
    const theme = themeRaw.startsWith("#") ? themeRaw : `#${themeRaw}`;
    const logo = searchParams.get("logo") || "none";

    setParams({ pa, pn, am, tn, theme, logo });

    // Generate UPI URI
    const upiLink = `upi://pay?pa=${encodeURIComponent(pa)}&pn=${encodeURIComponent(pn)}${am ? `&am=${encodeURIComponent(am)}` : ""}${tn ? `&tn=${encodeURIComponent(tn)}` : ""}&cu=INR`;

    // Render QR Code
    QRCode.toDataURL(
      upiLink,
      {
        width: 400,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#ffffff",
        },
      },
      (err, url) => {
        if (!err) {
          setQrUrl(url);
        }
      }
    );
  }, []);

  const upiLink = `upi://pay?pa=${encodeURIComponent(params.pa)}&pn=${encodeURIComponent(params.pn)}${params.am ? `&am=${encodeURIComponent(params.am)}` : ""}${params.tn ? `&tn=${encodeURIComponent(params.tn)}` : ""}&cu=INR`;

  return (
    <div className="flex min-h-screen items-center justify-center bg-transparent p-4 font-sans select-none">
      <div className="w-full max-w-[340px] rounded-3xl border border-black/5 bg-white p-5 text-center shadow-xl transition-all duration-300">
        {/* Header */}
        <div className="mb-4">
          <h2 className="text-xs font-black uppercase tracking-widest text-neutral-400">Scan to Pay</h2>
          <p className="mt-1 text-base font-black text-neutral-800 truncate" title={params.pn}>
            {params.pn}
          </p>
          <p className="text-[10px] font-semibold text-neutral-400 truncate mt-0.5">{params.pa}</p>
        </div>

        {/* QR Code Container */}
        <div className="relative mx-auto my-4 flex h-[210px] w-[210px] items-center justify-center rounded-2xl border border-neutral-100 bg-white p-2.5 shadow-inner">
          {qrUrl ? (
            <img src={qrUrl} alt="UPI Payment QR Code" className="h-full w-full object-contain" />
          ) : (
            <div className="h-full w-full animate-pulse rounded-xl bg-neutral-100" />
          )}

          {/* Optional Overlay Logo */}
          {params.logo !== "none" && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="h-10 w-10 rounded-xl bg-white p-1 border border-neutral-100 shadow-md flex items-center justify-center overflow-hidden">
                {params.logo === "gpay" && (
                  <span className="text-[10px] font-black text-[#4285f4]">GPay</span>
                )}
                {params.logo === "phonepe" && (
                  <span className="text-[10px] font-black text-[#5f259f]">Pe</span>
                )}
                {params.logo === "paytm" && (
                  <span className="text-[9px] font-black text-[#00baf2]">Paytm</span>
                )}
                {params.logo === "bhim" && (
                  <span className="text-[9px] font-black text-[#e55523]">BHIM</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Optional Amount Badge */}
        {params.am && (
          <div className="my-3 inline-flex items-center gap-1 rounded-full bg-neutral-50 px-4 py-1.5 border border-neutral-100">
            <span className="text-xs font-bold text-neutral-400">Amount:</span>
            <span className="text-sm font-black text-neutral-800">₹{params.am}</span>
          </div>
        )}

        {/* Optional Note */}
        {params.tn && (
          <p className="mt-1 text-xs text-neutral-500 italic truncate max-w-[280px] mx-auto">
            &ldquo;{params.tn}&rdquo;
          </p>
        )}

        {/* Pay Button for Mobile Scan Redirect */}
        <div className="mt-5">
          <a
            href={upiLink}
            style={{ backgroundColor: params.theme }}
            className="flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-xs font-bold text-white shadow-md transition-all hover:brightness-95 active:scale-95"
          >
            <svg className="h-4.5 w-4.5 fill-current" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H7c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.04-.42 1.99-1.07 2.75z" />
            </svg>
            Pay Instantly with UPI App
          </a>
        </div>

        {/* Footer info */}
        <div className="mt-4 flex items-center justify-center gap-1 text-[9px] font-bold text-neutral-300">
          <span>Powered by</span>
          <a href="https://proupiqr.in" target="_blank" rel="noopener noreferrer" className="hover:underline hover:text-neutral-400">
            proupiqr.in
          </a>
        </div>
      </div>
    </div>
  );
}
