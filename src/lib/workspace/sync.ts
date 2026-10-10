import { canonicalJson, mergeWorkspaces, sanitizeWorkspace, type Workspace } from "./model";

/**
 * Browser side of optional cloud sync. The local workspace stays the source of
 * truth; when the user is signed in, changes are pushed (debounced, one
 * request in flight) and the server's merged copy is merged back in, so edits
 * made while a request is in flight are never lost.
 *
 * Account switching: local data is tagged with the account it last synced to.
 * Guest data (no tag) merges into the first account that signs in. Data tagged
 * with a different account is set aside, never uploaded to the new account.
 */

export const SYNC_URL = "/api/v1/workspace/";
export const OWNER_KEY = "proupiqr-workspace-owner";
export const STASH_KEY = "proupiqr-workspace-v1-other-account";
const DEBOUNCE_MS = 1500;
const RETRY_MS = 30_000;

export type SyncStatus = "checking" | "signed_out" | "syncing" | "synced" | "offline" | "error" | "too_large";
export interface SyncState {
  status: SyncStatus;
  lastSyncedAt: number | null;
  message: string;
}

interface ClerkLike {
  loaded?: boolean;
  user?: unknown;
  session?: { getToken: () => Promise<string | null> } | null;
  signOut?: () => Promise<unknown>;
}

function clerk(): ClerkLike | undefined {
  return (window as unknown as { Clerk?: ClerkLike }).Clerk;
}

/** Waits for the Clerk SDK (loaded by <ClerkClient />); undefined if it never arrives. */
async function clerkReady(timeoutMs: number): Promise<ClerkLike | undefined> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const c = clerk();
    if (c?.loaded) return c;
    await new Promise((r) => setTimeout(r, 100));
  }
  return undefined;
}

function storageGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function storageSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* blocked storage: sync still works in-memory */ }
}

/** Same-origin JSON request carrying a fresh Clerk session token when available. */
export async function authedFetch(url: string, method: "GET" | "POST" | "PUT" | "DELETE", body?: unknown): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  try {
    const token = await clerk()?.session?.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    // Fall back to the session cookie.
  }
  return fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: "same-origin" });
}

export function createSync(opts: {
  get: () => Workspace;
  apply: (ws: Workspace) => void;
  onState: (state: SyncState) => void;
  clerkTimeoutMs?: number;
}) {
  let state: SyncState = { status: "checking", lastSyncedAt: null, message: "" };
  let lastJson = "";
  let inFlight = false;
  let again = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const set = (patch: Partial<SyncState>) => {
    state = { ...state, ...patch };
    opts.onState(state);
  };
  const active = () => !stopped && state.status !== "signed_out" && state.status !== "checking" && state.status !== "too_large";

  const request = (method: "GET" | "PUT" | "DELETE", body?: unknown) => authedFetch(SYNC_URL, method, body);

  function schedule(delay: number) {
    clearTimeout(timer);
    timer = setTimeout(() => void push(), delay);
  }

  function acceptServer(serverRaw: unknown) {
    const server = sanitizeWorkspace(serverRaw);
    lastJson = canonicalJson(server);
    const local = opts.get();
    const next = mergeWorkspaces(local, server);
    if (canonicalJson(next) !== canonicalJson(local)) opts.apply(next);
    return next;
  }

  async function push(): Promise<void> {
    if (stopped) return;
    if (inFlight) { again = true; return; }
    inFlight = true;
    again = false;
    set({ status: "syncing", message: "" });
    try {
      const response = await request("PUT", { workspace: opts.get() });
      if (response.status === 401) return set({ status: "signed_out", message: "" });
      if (response.status === 413) return set({ status: "too_large", message: (await response.json().catch(() => ({}))).error ?? "Workspace too large to sync." });
      if (!response.ok) {
        set({ status: "error", message: (await response.json().catch(() => ({}))).error ?? "Sync failed. Retrying soon." });
        schedule(RETRY_MS);
        return;
      }
      const body = await response.json();
      acceptServer(body.workspace);
      set({ status: "synced", lastSyncedAt: Date.now(), message: "" });
    } catch {
      set({ status: "offline", message: "" });
      return;
    } finally {
      inFlight = false;
    }
    if (again || canonicalJson(opts.get()) !== lastJson) schedule(200);
  }

  async function start(): Promise<void> {
    const c = await clerkReady(opts.clerkTimeoutMs ?? 10_000);
    if (stopped) return;
    if (c && !c.user) return set({ status: "signed_out" });
    // Without the Clerk SDK (offline launch, blocked script) we can't tell who
    // is signed in: only a successful response, or an account that synced on
    // this device before, counts as signed in. Never show anonymous users a
    // sync error.
    const knownAccount = Boolean(c?.user) || Boolean(storageGet(OWNER_KEY));
    let response: Response;
    try {
      response = await request("GET");
    } catch {
      return set({ status: knownAccount ? "offline" : "signed_out" });
    }
    if (response.status === 401) return set({ status: "signed_out" });
    if (!response.ok) {
      if (!knownAccount) return set({ status: "signed_out" });
      set({ status: "error", message: "Sync is unavailable right now. Your data is safe on this device." });
      schedule(RETRY_MS);
      return;
    }
    const body = await response.json() as { workspace: unknown; owner: string };
    const previousOwner = storageGet(OWNER_KEY);
    if (previousOwner && previousOwner !== body.owner) {
      // Different account on this device: set local data aside, load this account's copy.
      storageSet(STASH_KEY, canonicalJson(opts.get()));
      const server = sanitizeWorkspace(body.workspace);
      lastJson = canonicalJson(server);
      opts.apply(server);
      storageSet(OWNER_KEY, body.owner);
      set({ status: "synced", lastSyncedAt: Date.now(), message: "Loaded this account's data. The previous account's data on this device was set aside (Settings)." });
      return;
    }
    storageSet(OWNER_KEY, body.owner);
    acceptServer(body.workspace);
    set({ status: "synced", lastSyncedAt: Date.now() });
    if (canonicalJson(opts.get()) !== lastJson) void push();
  }

  const onOnline = () => { if (state.status === "offline" || state.status === "error") void push(); };
  const onVisible = () => { if (document.visibilityState === "visible" && active()) void push(); };
  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisible);

  return {
    start,
    /** Call after every local change; cheap when nothing new needs uploading. */
    changed() {
      if (!active()) return;
      if (canonicalJson(opts.get()) === lastJson) return;
      schedule(DEBOUNCE_MS);
    },
    /** Pushes now and resolves once the server has this device's latest copy. */
    async flush(): Promise<boolean> {
      if (state.status === "signed_out" || state.status === "checking") return false;
      clearTimeout(timer);
      for (let i = 0; i < 50 && inFlight; i++) await new Promise((r) => setTimeout(r, 100));
      await push();
      return state.status === "synced" && canonicalJson(opts.get()) === lastJson;
    },
    syncNow() {
      if (state.status === "signed_out" || state.status === "checking") return;
      void push();
    },
    async deleteCloudCopy(): Promise<boolean> {
      try {
        const response = await request("DELETE");
        if (!response.ok) return false;
        lastJson = "";
        await signOut();
        return true;
      } catch {
        return false;
      }
    },
    signOut,
    stop() {
      stopped = true;
      clearTimeout(timer);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    },
  };

  async function signOut(): Promise<void> {
    clearTimeout(timer);
    try { await clerk()?.signOut?.(); } catch { /* ignore */ }
    set({ status: "signed_out", message: "" });
  }
}
