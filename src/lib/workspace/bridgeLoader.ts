/**
 * The payment tracker's storage code for the generators' "Track payment" and "Save to payment book" buttons. It
 * stays off the page's first load. It is fetched once the page is idle when this device already has a payment book,
 * else once the visitor edits the document (a visitor who only reads the page never downloads it, review round 4),
 * and again on intent if that failed, so the click itself needs no network: it works after the connection drops,
 * or after a deploy replaced the chunk.
 */
type Bridge = typeof import("./localStore");

let pending: Promise<Bridge> | null = null;

/** The module, loaded once; a failed load is retried on the next call. */
export function loadBridge(): Promise<Bridge> {
  if (!pending) {
    pending = import("./localStore").catch((err: unknown) => {
      pending = null;
      throw err;
    });
  }
  return pending;
}

/** Starts the load without waiting for it (pointer, focus or touch on the button). */
export function prefetchBridge(): void {
  loadBridge().catch(() => undefined);
}

/**
 * Whether this device already has a payment book (proupiqr-workspace-v1 / proupiqr-books-v1, see localStore.ts;
 * named here so this module never imports it).
 */
function hasPaymentBook(): boolean {
  try {
    const s = window.localStorage;
    return s.getItem("proupiqr-workspace-v1") !== null || s.getItem("proupiqr-books-v1") !== null;
  } catch {
    return false;
  }
}

/**
 * Starts the load once the page is idle after hydration: right away for a device with a payment book, otherwise
 * after the first edit anywhere on the page (input or change). Returns a cancel function for effect cleanup.
 */
export function prefetchBridgeWhenIdle(): () => void {
  if (typeof window === "undefined") return () => undefined;
  let cancelIdle = (): void => undefined;
  const schedule = () => {
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void });
    if (idle.requestIdleCallback && idle.cancelIdleCallback) {
      const id = idle.requestIdleCallback(prefetchBridge, { timeout: 5000 });
      cancelIdle = () => idle.cancelIdleCallback?.(id);
      return;
    }
    const timer = window.setTimeout(prefetchBridge, 2500);
    cancelIdle = () => window.clearTimeout(timer);
  };
  if (hasPaymentBook()) {
    schedule();
    return () => cancelIdle();
  }
  const events = ["input", "change"] as const;
  const stop = () => { for (const type of events) document.removeEventListener(type, onEdit, true); };
  function onEdit() {
    stop();
    schedule();
  }
  for (const type of events) document.addEventListener(type, onEdit, true);
  return () => { stop(); cancelIdle(); };
}
