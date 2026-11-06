import { safeToPng } from "./export-image";

const EXPORT_TIMEOUT_MS = 20000;

export function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), EXPORT_TIMEOUT_MS);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

/** Renders a document element to a PNG data URL at 800 px wide, from an off-screen clone so the page never jumps. */
export async function renderPaperPng(el: HTMLElement | null): Promise<string> {
  if (!el) throw new Error("Document not ready");
  const clone = el.cloneNode(true) as HTMLDivElement;
  Object.assign(clone.style, {
    position: "fixed", left: "0", top: "0", zIndex: "-9999", opacity: "0", pointerEvents: "none",
    width: "800px", minWidth: "800px", maxWidth: "800px", padding: "36px", boxSizing: "border-box",
    height: "auto", boxShadow: "none", border: "none", borderRadius: "0",
  });
  document.body.appendChild(clone);
  await new Promise((res) => setTimeout(res, 250));
  const targetHeight = clone.offsetHeight || 1100;
  try {
    return await safeToPng(clone, {
      cacheBust: true, pixelRatio: 2, width: 800, height: targetHeight,
      style: {
        opacity: "1", transform: "none", transformOrigin: "top left", width: "800px", height: `${targetHeight}px`,
        maxWidth: "800px", maxHeight: `${targetHeight}px`, minWidth: "800px", minHeight: `${targetHeight}px`,
        margin: "0", padding: "36px", boxSizing: "border-box", backgroundColor: "#ffffff", boxShadow: "none", border: "none", borderRadius: "0",
      },
    });
  } finally {
    document.body.removeChild(clone);
  }
}

/** Renders the element and saves it as a one-page PDF. jsPDF is loaded only now. */
export async function savePaperPdf(el: HTMLElement | null, fileName: string): Promise<void> {
  const [{ jsPDF }, dataUrl] = await Promise.all([withTimeout(import("jspdf"), "PDF engine"), renderPaperPng(el)]);
  const pxToMm = 0.2646;
  const widthMm = 800 * pxToMm;
  const heightMm = (el?.offsetHeight || 1100) * pxToMm;
  const pdf = new jsPDF({ orientation: widthMm < heightMm ? "portrait" : "landscape", unit: "mm", format: [widthMm, heightMm] });
  pdf.addImage(dataUrl, "PNG", 0, 0, widthMm, heightMm);
  pdf.save(`${fileName}.pdf`);
}
