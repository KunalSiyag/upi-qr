import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { buildUpiUri } from "../lib/upi-uri";

const DEFAULT_THEME = "#287a57";
const LOGO_OPTIONS = new Set(["gpay", "phonepe", "paytm", "bhim"]);

function normalizeTheme(raw: string | null): string {
  const hex = (raw || "287a57").replace("#", "").trim();
  return /^[0-9a-fA-F]{6}$/.test(hex) ? `#${hex}` : DEFAULT_THEME;
}

export function EmbedCard() {
  const [params, setParams] = useState({
    pa: "",
    pn: "",
    am: "",
    tn: "",
    theme: DEFAULT_THEME,
    logo: "none",
    showAttribution: true,
  });
  const [qrUrl, setQrUrl] = useState("");

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const pa = searchParams.get("pa")?.trim() || "example@upi";
    const pn = searchParams.get("pn")?.trim() || "Payee Name";
    const am = searchParams.get("am")?.trim() || "";
    const tn = searchParams.get("tn")?.trim() || "";
    const theme = normalizeTheme(searchParams.get("theme"));
    const logoRaw = (searchParams.get("logo") || "none").toLowerCase();
    const logo = LOGO_OPTIONS.has(logoRaw) ? logoRaw : "none";
    const showAttribution = searchParams.get("attribution") !== "none";

    setParams({ pa, pn, am, tn, theme, logo, showAttribution });

    const upiLink = buildUpiUri({
      pa,
      pn,
      am: am || undefined,
      tn: tn || undefined,
      cu: "INR",
    });

    void QRCode.toDataURL(upiLink, {
      width: 400,
      margin: 2,
      errorCorrectionLevel: logo === "none" ? "M" : "H",
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then(setQrUrl)
      .catch(() => setQrUrl(""));
  }, []);

  const upiLink = useMemo(
    () =>
      buildUpiUri({
        pa: params.pa,
        pn: params.pn,
        am: params.am || undefined,
        tn: params.tn || undefined,
        cu: "INR",
      }),
    [params.am, params.pa, params.pn, params.tn]
  );

  return (
    <div className="flex h-full min-h-[460px] items-center justify-center bg-transparent p-2 font-sans select-none">
      <div className="w-full max-w-[340px] rounded-3xl border border-black/5 bg-white p-4 text-center shadow-xl">
        <div className="mb-2">
          <h2 className="text-xs font-black uppercase tracking-widest text-neutral-400">Scan to Pay</h2>
          <p className="mt-1 truncate text-base font-black text-neutral-800" title={params.pn}>
            {params.pn}
          </p>
          <p className="mt-0.5 truncate text-[10px] font-semibold text-neutral-400">{params.pa}</p>
        </div>

        <div className="relative mx-auto my-3 flex h-[190px] w-[190px] items-center justify-center rounded-2xl border border-neutral-100 bg-white p-2.5 shadow-inner">
          {qrUrl ? (
            <img src={qrUrl} alt="UPI Payment QR Code" className="h-full w-full object-contain" />
          ) : (
            <div className="h-full w-full animate-pulse rounded-xl bg-neutral-100" />
          )}

          {params.logo !== "none" && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-neutral-100 bg-white p-1 shadow-md">
                {params.logo === "gpay" && <span className="text-[10px] font-black text-[#4285f4]">GPay</span>}
                {params.logo === "phonepe" && <img src="/phonepe.png" alt="PhonePe" className="h-full w-full object-contain" />}
                {params.logo === "paytm" && <span className="text-[9px] font-black text-[#00baf2]">Paytm</span>}
                {params.logo === "bhim" && <span className="text-[9px] font-black text-[#e55523]">BHIM</span>}
              </div>
            </div>
          )}
        </div>

        {params.am && (
          <div className="my-2 inline-flex items-center gap-1 rounded-full border border-neutral-100 bg-neutral-50 px-4 py-1.5">
            <span className="text-xs font-bold text-neutral-400">Amount:</span>
            <span className="text-sm font-black text-neutral-800">₹{params.am}</span>
          </div>
        )}

        {params.tn && (
          <p className="mx-auto mt-1 max-w-[280px] truncate text-xs italic text-neutral-500">&ldquo;{params.tn}&rdquo;</p>
        )}

        <div className="mt-4">
          <a
            href={upiLink}
            style={{ backgroundColor: params.theme }}
            className="flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-xs font-bold text-white shadow-md transition-all hover:brightness-95 active:scale-95"
          >
            <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H7c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.04-.42 1.99-1.07 2.75z" />
            </svg>
            Pay Instantly with UPI App
          </a>
        </div>

        {params.showAttribution && (
          <div className="mt-3 flex items-center justify-center gap-1 text-[9px] font-bold text-neutral-400">
            <span>Powered by</span>
            <a
              href="https://www.proupiqr.in/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline hover:text-neutral-600"
            >
              proupiqr.in
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
