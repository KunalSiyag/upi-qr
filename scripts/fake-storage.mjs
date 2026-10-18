// In-memory Web Storage for Node tests of browser storage code (src/lib/workspace/localStore.ts, sync.ts).
// `quota` (bytes of keys + values, like browsers count UTF-16 code units ×2 ≈ length here) and `fail(key, value)`
// let tests make writes fail the way a full or blocked browser storage does.
export class FakeStorage {
  constructor({ quota = Infinity, fail = () => false } = {}) {
    this.map = new Map();
    this.quota = quota;
    this.fail = fail;
    this.writes = [];
  }
  get length() { return this.map.size; }
  key(i) { return [...this.map.keys()][i] ?? null; }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) {
    const v = String(value);
    if (this.fail(key, v)) throw new Error("QuotaExceededError");
    let used = key.length + v.length;
    for (const [k, existing] of this.map) if (k !== key) used += k.length + existing.length;
    if (used > this.quota) throw new Error("QuotaExceededError");
    this.map.set(key, v);
    this.writes.push(key);
  }
  removeItem(key) { this.map.delete(key); }
  clear() { this.map.clear(); }
  /** Plain object copy, for byte-identical comparisons. */
  snapshot() { return Object.fromEntries([...this.map].sort(([a], [b]) => (a < b ? -1 : 1))); }
}

/** Installs fresh localStorage/sessionStorage plus a window/document event target. */
export function installBrowser(opts) {
  const local = new FakeStorage(opts);
  globalThis.localStorage = local;
  globalThis.sessionStorage = new FakeStorage();
  if (!globalThis.window) globalThis.window = new EventTarget();
  if (!globalThis.document) {
    const doc = new EventTarget();
    doc.visibilityState = "visible";
    globalThis.document = doc;
  }
  return local;
}

/** A storage event as another tab's write would deliver it. */
export function storageEvent(key, newValue) {
  const event = new Event("storage");
  Object.assign(event, { key, newValue });
  globalThis.window.dispatchEvent(event);
}
