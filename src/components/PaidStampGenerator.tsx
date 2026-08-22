import { useCallback, useEffect, useRef, useState } from "react";

const draftKey = "proupiqr-paid-stamp-draft";
const MAX_DIMENSION = 1800;

const positions = {
  "center": { x: 0.5, y: 0.5, angle: 0 },
  "center-diagonal": { x: 0.5, y: 0.45, angle: -18 },
  "top-left": { x: 0.28, y: 0.2, angle: -14 },
  "top-right": { x: 0.72, y: 0.2, angle: 12 },
  "bottom-left": { x: 0.28, y: 0.8, angle: 10 },
  "bottom-right": { x: 0.72, y: 0.8, angle: -12 }
} as const;

type PositionKey = keyof typeof positions;

const colorOptions = [
  { label: "Paid Green", value: "#15803d" },
  { label: "Rejected Red", value: "#b91c1c" },
  { label: "Verified Blue", value: "#1d4ed8" },
  { label: "Ink Black", value: "#1f2937" }
];

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function PaidStampGenerator() {
  const [imageSrc, setImageSrc] = useState("");
  const [imageSize, setImageSize] = useState({ width: 1000, height: 700 });
  const [stampText, setStampText] = useState("PAID");
  const [dateLine, setDateLine] = useState("");
  const [color, setColor] = useState(colorOptions[0].value);
  const [position, setPosition] = useState<PositionKey>("center-diagonal");
  const [scale, setScale] = useState(60);
  const [opacity, setOpacity] = useState(85);
  const [fileName, setFileName] = useState("stamped-document");
  const [error, setError] = useState("");
  const [receivedBy, setReceivedBy] = useState("");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (!saved) return;
      const draft = JSON.parse(saved);
      setStampText(draft.stampText ?? "PAID");
      setColor(draft.color ?? colorOptions[0].value);
      setPosition(positions[draft.position as PositionKey] ? draft.position : "center-diagonal");
      setScale(typeof draft.scale === "number" ? draft.scale : 60);
      setOpacity(typeof draft.opacity === "number" ? draft.opacity : 85);
      setReceivedBy(draft.receivedBy ?? "");
    } catch {
      // Ignore broken local drafts and keep the built-in defaults.
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(draftKey, JSON.stringify({ stampText, color, position, scale, opacity, receivedBy }));
  }, [stampText, color, position, scale, opacity, receivedBy]);

  const drawStamp = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const preset = positions[position];
    const fontSize = Math.max(24, (Math.min(width, height) * scale) / 100);
    const cx = width * preset.x;
    const cy = height * preset.y;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((preset.angle * Math.PI) / 180);
    ctx.globalAlpha = opacity / 100;

    ctx.font = `900 ${fontSize}px Arial, Helvetica, sans-serif`;
    const textMetrics = ctx.measureText(stampText || "PAID");
    const padX = fontSize * 0.55;
    const padY = fontSize * 0.32;
    const boxW = textMetrics.width + padX * 2;
    const boxH = fontSize + padY * 2 + (dateLine ? fontSize * 0.7 : 0);

    const border = Math.max(3, fontSize * 0.08);
    ctx.strokeStyle = color;
    ctx.lineWidth = border;
    roundRectPath(ctx, -boxW / 2, -boxH / 2, boxW, boxH, fontSize * 0.18);
    ctx.stroke();

    ctx.lineWidth = border * 0.45;
    const inset = border * 1.6;
    roundRectPath(ctx, -boxW / 2 + inset, -boxH / 2 + inset, boxW - inset * 2, boxH - inset * 2, fontSize * 0.14);
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const textY = dateLine ? -boxH / 2 + padY + fontSize / 2 : 0;
    ctx.fillText(stampText || "PAID", 0, textY);

    if (dateLine) {
      ctx.font = `700 ${fontSize * 0.42}px Arial, Helvetica, sans-serif`;
      ctx.fillText(dateLine, 0, textY + fontSize * 0.85);
    }

    if (receivedBy) {
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = Math.min(1, opacity / 100 + 0.05);
      ctx.fillStyle = color;
      ctx.font = `italic 600 ${Math.max(16, fontSize * 0.34)}px Georgia, serif`;
      ctx.textAlign = "right";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(`for ${receivedBy}`, width - width * 0.04, height - height * 0.04);
    }

    ctx.restore();
  }, [stampText, dateLine, color, position, scale, opacity, receivedBy]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = imageSize.width;
    let height = imageSize.height;
    if (!imageSrc) {
      width = 1000;
      height = 640;
    }

    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);

    const img = imageRef.current;
    if (imageSrc && img && img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, 0, 0, width, height);
    } else if (imageSrc) {
      return;
    }

    drawStamp(ctx, width, height);
  }, [imageSrc, imageSize, drawStamp]);

  const handleFile = (file: File | undefined | null) => {
    setError("");
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file (PNG or JPG photo of your invoice or bill).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result);
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(1, MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight));
        setImageSize({ width: Math.round(img.naturalWidth * ratio), height: Math.round(img.naturalHeight * ratio) });
        imageRef.current = img;
        setImageSrc(src);
        const base = file.name.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        setFileName(base ? `${base}-paid-stamp` : "stamped-document");
      };
      img.onerror = () => setError("Could not read that image. Try a different PNG or JPG.");
      img.src = src;
    };
    reader.onerror = () => setError("Could not read that file. Please try again.");
    reader.readAsDataURL(file);
  };

  function downloadCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `${fileName}.png`;
    link.click();
  }

  async function downloadStampedPdf() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const { jsPDF } = await import("jspdf");
      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      const pxToMm = 0.2646;
      const widthMm = canvas.width * pxToMm;
      const heightMm = canvas.height * pxToMm;
      const pdf = new jsPDF({
        orientation: widthMm < heightMm ? "portrait" : "landscape",
        unit: "mm",
        format: [widthMm, heightMm]
      });
      pdf.addImage(dataUrl, "JPEG", 0, 0, widthMm, heightMm);
      pdf.save(`${fileName}.pdf`);
    } catch (err) {
      console.error("PDF download failed:", err);
      setError("Could not generate the PDF. Try downloading the PNG instead.");
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[0.92fr_1.08fr]">
      <div className="no-print rounded-[2rem] border border-white/75 bg-white/90 p-5 shadow-[0_18px_48px_rgba(17,59,44,0.08)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-forest/5 pb-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-leaf">Stamp studio</p>
            <h2 className="mt-1 text-2xl font-black text-forest">Mark It As Paid</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={downloadCanvas}
              className="rounded-full bg-mint px-4 py-2 text-xs font-bold text-forest hover:bg-leaf hover:text-white transition"
            >
              🖼️ Download PNG
            </button>
            <button
              onClick={downloadStampedPdf}
              disabled={!imageSrc}
              title={imageSrc ? "" : "Upload an invoice image first"}
              className="rounded-full bg-forest px-4 py-2 text-xs font-bold text-white hover:bg-leaf disabled:opacity-50 transition"
            >
              📄 Download PDF
            </button>
          </div>
        </div>

        <label className="mt-6 block cursor-pointer rounded-2xl border-2 border-dashed border-forest/20 bg-cream p-6 text-center transition hover:border-leaf/50">
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => handleFile(e.target.files?.[0])} />
          <span className="block text-sm font-black text-forest">{imageSrc ? "Replace invoice image" : "Upload invoice or bill photo"}</span>
          <span className="mt-1 block text-xs font-semibold text-forest/60">PNG or JPG. Processed locally in your browser — nothing is uploaded.</span>
        </label>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-bold text-forest">Stamp text<input value={stampText} onChange={(e) => setStampText(e.target.value)} maxLength={18} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Date line (optional)<input value={dateLine} onChange={(e) => setDateLine(e.target.value)} placeholder="Paid on 21 Aug 2026" maxLength={40} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Signature name (optional)<input value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} placeholder="Ravi Kumar" className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest">Stamp colour<select value={color} onChange={(e) => setColor(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf">{colorOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label className="text-sm font-bold text-forest">Position<select value={position} onChange={(e) => setPosition(e.target.value as PositionKey)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf">{Object.keys(positions).map((key) => <option key={key} value={key}>{key.replace("-", " ").replace(/\b\w/g, (c) => c.toUpperCase())}</option>)}</select></label>
          <label className="text-sm font-bold text-forest">Stamp size ({scale}%)<input type="range" min={25} max={90} value={scale} onChange={(e) => setScale(Number(e.target.value))} className="mt-4 w-full accent-[#15803d]" /></label>
          <label className="text-sm font-bold text-forest">Ink opacity ({opacity}%)<input type="range" min={30} max={100} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} className="mt-4 w-full accent-[#15803d]" /></label>
        </div>

        {error && <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
        {!imageSrc && !error && <p className="mt-4 rounded-2xl bg-mint px-4 py-3 text-sm font-semibold text-forest/80">No image yet? You can still download a transparent PAID stamp PNG and overlay it on any document.</p>}
      </div>

      <div className="rounded-[2rem] border border-white/75 bg-white/90 p-5 shadow-[0_18px_48px_rgba(17,59,44,0.08)]">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-leaf">Live preview</p>
        <div className="mt-4 overflow-hidden rounded-2xl border border-forest/10 bg-[repeating-conic-gradient(#f3f4f6_0%_25%,#ffffff_0%_50%)] bg-[length:24px_24px] p-3">
          <canvas ref={canvasRef} className="mx-auto block h-auto w-full max-w-full rounded-xl shadow-inner" />
        </div>
        <p className="mt-4 text-sm leading-6 text-forest/70">
          The checkerboard area is transparent in the downloaded PNG when no document is loaded. Stamping runs entirely on your device, so customer invoices never leave your phone or laptop.
        </p>
      </div>
    </div>
  );
}
