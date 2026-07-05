// Service worker minimal — installe l'application (PWA) et met en cache les
// ressources statiques de base. Ne met JAMAIS en cache les pages HTML ni les
// appels /api (données toujours fraîches), afin de ne jamais afficher de
// contenu obsolète ou incorrect aux membres/administrateurs.
const CACHE_NAME = "tm-static-v1";
const STATIC_ASSETS = ["/style.css", "/app.js", "/manifest.json", "/icon.svg", "/icon-maskable.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api")) return; // jamais de cache sur les données

  if (STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res && res.ok) caches.open(CACHE_NAME).then((c) => c.put(req, res.clone()));
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
  // Toutes les autres requêtes (pages HTML, documents, etc.) : réseau direct,
  // jamais de contenu mis en cache par précaution.
});
