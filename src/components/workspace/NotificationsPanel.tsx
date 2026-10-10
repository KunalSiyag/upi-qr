import { useEffect, useState } from "react";
import { authedFetch } from "../../lib/workspace/sync";
import { trackProductEvent } from "../../lib/productEvents";
import { primaryButton, secondaryButton } from "./ui";
import { useWs } from "./i18n";

function keyBytes(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(base64url.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

type Status = "loading" | "unsupported" | "ios-install" | "unavailable" | "denied" | "off" | "on";

/** Morning "who to chase today" notifications (Web Push, needs a signed-in, synced workspace). */
export function NotificationsPanel({ signedIn, standalone, ios, onFlash }: {
  signedIn: boolean;
  standalone: boolean;
  ios: boolean;
  onFlash: (message: string) => void;
}) {
  const [status, setStatus] = useState<Status>("loading");
  const [publicKey, setPublicKey] = useState("");
  const [busy, setBusy] = useState(false);
  const { tr } = useWs();

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    (async () => {
      const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      if (!supported) return !cancelled && setStatus(ios && !standalone ? "ios-install" : "unsupported");
      try {
        const info = await (await fetch("/api/v1/push/")).json() as { available: boolean; publicKey: string | null };
        if (cancelled) return;
        if (!info.available || !info.publicKey) return setStatus("unavailable");
        setPublicKey(info.publicKey);
        if (Notification.permission === "denied") return setStatus("denied");
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        if (!cancelled) setStatus(existing ? "on" : "off");
      } catch {
        if (!cancelled) setStatus("unavailable");
      }
    })();
    return () => { cancelled = true; };
  }, [signedIn, ios, standalone]);

  if (!signedIn) return null;

  async function enable() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
      const response = await authedFetch("/api/v1/push/", "POST", { subscription: subscription.toJSON() });
      if (!response.ok) {
        await subscription.unsubscribe().catch(() => undefined);
        onFlash(tr((await response.json().catch(() => ({}))).error ?? "Couldn't turn on notifications."));
        return;
      }
      setStatus("on");
      trackProductEvent("push_enabled", "workspace");
      onFlash(tr("Morning notifications are on."));
    } catch {
      onFlash(tr("This browser couldn't turn on notifications."));
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await authedFetch("/api/v1/push/", "DELETE", { endpoint: subscription.endpoint }).catch(() => undefined);
        await subscription.unsubscribe().catch(() => undefined);
      }
      setStatus("off");
      onFlash(tr("Morning notifications are off on this device."));
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    try {
      const response = await authedFetch("/api/v1/push/", "POST", { action: "test" });
      const body = await response.json().catch(() => ({}));
      onFlash(response.ok ? tr("Test notification sent.") : tr(body.error ?? "Couldn't send a test."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-[1.5rem] border border-white/75 bg-white/90 p-5 shadow-sm">
      <h2 className="text-lg font-black text-forest">{tr("Morning reminders")}</h2>
      <p className="mt-1 text-sm text-forest/70">{tr("At 9 am, a notification on this device lists the invoices to chase that day, and another arrives as soon as a client says they've paid through a pay link. They show names and amounts, so turn them off on shared devices.")}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2" role="status">
        {status === "loading" && <span className="text-sm text-forest/60">{tr("Checking…")}</span>}
        {status === "unsupported" && <span className="text-sm text-forest/70">{tr("This browser doesn't support notifications.")}</span>}
        {status === "ios-install" && <span className="text-sm text-forest/70">{tr("On iPhone, first add the tracker to your Home Screen (Share → Add to Home Screen), then open it from there to turn this on.")}</span>}
        {status === "unavailable" && <span className="text-sm text-forest/70">{tr("Morning notifications are coming soon.")}</span>}
        {status === "denied" && <span className="text-sm text-forest/70">{tr("Notifications are blocked for this site. Allow them in your browser's site settings, then reload.")}</span>}
        {status === "off" && <button type="button" disabled={busy} onClick={enable} className={primaryButton}>{tr("Turn on morning reminders")}</button>}
        {status === "on" && (
          <>
            <span className="rounded-full bg-mint px-3 py-1 text-xs font-black text-leaf">{tr("On for this device")}</span>
            <button type="button" disabled={busy} onClick={test} className={secondaryButton}>{tr("Send a test")}</button>
            <button type="button" disabled={busy} onClick={disable} className="rounded-xl px-3 py-2 text-xs font-bold text-forest/50 hover:text-[#a8321d]">{tr("Turn off")}</button>
          </>
        )}
      </div>
    </section>
  );
}
