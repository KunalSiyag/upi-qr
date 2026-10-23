/**
 * The payment tracker's storage code for the generators' "Track payment" and "Save to payment book" buttons. It
 * stays off the page's first load, but is fetched once the page is idle (and again on intent if that failed), so
 * the click itself needs no network: it works after the connection drops, or after a deploy replaced the chunk.
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

/** Starts the load once the page is idle after hydration. Returns a cancel function for effect cleanup. */
export function prefetchBridgeWhenIdle(): () => void {
  if (typeof window === "undefined") return () => undefined;
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void });
  if (idle.requestIdleCallback && idle.cancelIdleCallback) {
    const id = idle.requestIdleCallback(prefetchBridge, { timeout: 5000 });
    return () => idle.cancelIdleCallback?.(id);
  }
  const timer = window.setTimeout(prefetchBridge, 2500);
  return () => window.clearTimeout(timer);
}
