const CACHE_NAME = "proupiqr-v2";
const STATIC_DESTINATIONS = new Set(["script", "style", "image", "font"]);
const APP_SHELL = "/app/";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const destination = request.destination;
  const hashedAsset = url.pathname.startsWith("/_astro/");
  const cacheable = hashedAsset || STATIC_DESTINATIONS.has(destination);

  // The payments workspace must open offline: network-first, falling back to
  // the last copy of /app/ (query strings like ?tab= share one cached shell).
  if (request.mode === "navigate" && (url.pathname === "/app/" || url.pathname === "/app")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(APP_SHELL, copy));
          }
          return response;
        })
        .catch(() => caches.open(CACHE_NAME).then((cache) => cache.match(APP_SHELL)).then((cached) => cached || Response.error()))
    );
    return;
  }

  if (!cacheable) {
    event.respondWith(fetch(request));
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response && response.status === 200) {
        cache.put(request, response.clone());
      }
      return response;
    })
  );
});

// /app/ asks us to cache the shell and the assets it just loaded, so the
// workspace opens offline from the next launch (not only after a second visit).
self.addEventListener("message", (event) => {
  if (!event.data || event.data.type !== "warm-app-shell" || !Array.isArray(event.data.urls)) return;
  const urls = event.data.urls
    .map((value) => { try { return new URL(value, self.location.origin); } catch { return null; } })
    .filter((url) => url && url.origin === self.location.origin && (url.pathname.startsWith("/_astro/") || url.pathname.startsWith("/icons/") || url.pathname === APP_SHELL))
    .map((url) => url.pathname)
    .slice(0, 100);
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all([...new Set([APP_SHELL, ...urls])].map((path) =>
        cache.match(path).then((hit) => hit || fetch(path).then((response) => (response.ok ? cache.put(path, response) : undefined)).catch(() => undefined))
      ))
    )
  );
});

// Notification URLs must stay on this site: resolve against our origin and keep
// only same-origin results ("//evil.example" and "/\evil.example" resolve elsewhere).
function sameOriginPath(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value, self.location.origin);
    return url.origin === self.location.origin ? url.pathname + url.search + url.hash : null;
  } catch {
    return null;
  }
}

// Morning digest and test notifications (payload is encrypted end to end; see src/lib/push/).
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  const title = typeof data.title === "string" ? data.title : "Pro UPI QR";
  event.waitUntil(self.registration.showNotification(title, {
    body: typeof data.body === "string" ? data.body : "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: typeof data.tag === "string" ? data.tag : "proupiqr",
    data: { url: sameOriginPath(data.url) || "/app/" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(sameOriginPath(event.notification.data?.url) || "/app/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).pathname.startsWith("/app"));
      if (open) return open.focus().then(() => open.navigate(target)).catch(() => self.clients.openWindow(target));
      return self.clients.openWindow(target);
    })
  );
});
