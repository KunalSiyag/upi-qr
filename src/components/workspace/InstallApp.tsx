import { useEffect, useState } from "react";
import { trackProductEvent } from "../../lib/productEvents";
import { useWs } from "./i18n";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Warms the offline cache and offers "Install app" where the browser supports it. */
export function useInstallPrompt() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    setStandalone(window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true);
    const onPrompt = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPromptEvent); };
    const onInstalled = () => { setPrompt(null); trackProductEvent("app_installed", "workspace"); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    // Hand the service worker everything this page loaded so /app/ opens offline next time.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        const urls = performance.getEntriesByType("resource").map((entry) => entry.name);
        registration.active?.postMessage({ type: "warm-app-shell", urls });
      }).catch(() => {});
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice.catch(() => undefined);
    setPrompt(null);
  }

  const ios = typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
  return { canInstall: !!prompt && !standalone, install, standalone, ios };
}

export function InstallHint({ standalone, ios }: { standalone: boolean; ios: boolean }) {
  const { tr } = useWs();
  if (standalone) return null;
  return (
    <section className="rounded-[1.5rem] bg-white ring-1 ring-forest/[0.07] shadow-[0_1px_2px_rgba(13,31,23,0.04),0_12px_32px_-18px_rgba(13,31,23,0.18)] p-5">
      <h2 className="text-lg font-black text-forest">{tr("Use it like an app")}</h2>
      <p className="mt-1 text-sm text-forest/70">
        {ios
          ? tr("In Safari, tap the Share button, then “Add to Home Screen”. The tracker opens full-screen and works offline.")
          : tr("In Chrome, open the ⋮ menu and choose “Install app” or “Add to Home screen”. The tracker opens full-screen and works offline.")}
      </p>
    </section>
  );
}
