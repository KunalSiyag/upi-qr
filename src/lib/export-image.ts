import { toPng } from "html-to-image";

export const EXPORT_TIMEOUT_MS = 20000;

export function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), EXPORT_TIMEOUT_MS);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

/**
 * html-to-image wrapper that is resilient in the field:
 * - waits for web fonts so text renders correctly
 * - retries without font embedding if the first pass fails
 *   (the most common production failure mode)
 */
export async function safeToPng(
  node: HTMLElement,
  options: Parameters<typeof toPng>[1]
): Promise<string> {
  try {
    await (document as Document & { fonts?: FontFaceSet }).fonts?.ready;
  } catch {
    // Font API unavailable — render anyway.
  }
  try {
    return await toPng(node, options);
  } catch (err) {
    console.warn("[export] retrying without font embedding:", err);
    return await toPng(node, { ...(options as object), skipFonts: true });
  }
}

/**
 * Downloads a data URL by converting it to a Blob + object URL first.
 * Giant data: URLs are silently dropped by some mobile browsers
 * (notably iOS Safari), while blob downloads are broadly reliable.
 * Falls back to opening the image in a new tab if the click is ignored.
 */
export function downloadDataUrl(dataUrl: string, filename: string): void {
  fetch(dataUrl)
    .then((res) => res.blob())
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    })
    .catch((err) => {
      console.error("[export] download failed:", err);
      window.open(dataUrl, "_blank");
    });
}

/** Visible toast so failed exports never fail silently again. */
export function notifyExportError(message = "Export failed — please retry, or use the other format.") {
  if (document.getElementById("proupiqr-export-toast")) return;
  const toast = document.createElement("div");
  toast.id = "proupiqr-export-toast";
  toast.setAttribute("role", "alert");
  toast.style.cssText =
    "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:9999;background:#7f1d1d;color:#fff;padding:12px 20px;border-radius:9999px;font-size:13px;font-weight:700;box-shadow:0 10px 30px rgba(0,0,0,.25);max-width:90vw;text-align:center;";
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}
