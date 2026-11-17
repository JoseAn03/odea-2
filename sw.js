/* sw.js — Service worker de ODEA 2 (Fase 3 · Costa Neón)
 * Precachea SOLO el cascarón de la app (HTML, CSS, JS, manifest, ícono).
 * El catálogo de juego se cachea en runtime; el progreso del usuario nunca
 * pasa por la caché (vive en localStorage).
 *
 * Actualización a pedido del usuario (decisión F1-1): el install NO llama a
 * skipWaiting(). El SW espera el mensaje SKIP_WAITING que envía la app cuando
 * el usuario toca «Recargar» en el aviso de versión nueva.
 *
 * CACHE_VERSION debe subir en CADA release que cambie el SHELL. Usar un
 * nombre de caché distinto aísla el release nuevo del viejo: mientras el SW
 * anterior sigue controlando la pestaña, su caché queda intacto y no se
 * mezclan assets de dos versiones. `activate` borra los cachés viejos.
 */
const CACHE_VERSION = "odea2-v0.21.0-fase5";

const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/app.css",
  "./css/campaign.css",
  "./assets/slots/brete.webp",
  "./assets/slots/gamer.webp",
  "./assets/slots/diarias.webp",
  "./icons/icon.svg",
  "./js/app.js",
  "./js/campaign-ui.js",
  "./js/version.js",
  "./js/tabs.js",
  "./js/ambience.js",
  "./js/format.js",
  "./js/catalog.js",
  "./js/browser-storage.js",
  "./js/importer.js",
  "./js/ui.js",
  "./js/toast.js",
  "./js/hud-ui.js",
  "./js/hud.js",
  "./js/districts.js",
  "./js/district-figures.js",
  "./js/update-watcher.js",
  "./js/storage-watch.js",
  "./js/sync.js",
  "./js/sync-config.js",
  "./js/city/layout.js",
  "./js/city/world.js",
  "./js/city/camera.js",
  "./js/city/render.js",
  "./js/city/pixel.js",
  "./js/city/input.js",
  "./js/city/joystick.js",
  "./js/city/player.js",
  "./js/city/engine.js",
  "./js/city/view-session.js",
  "./src/shape.js",
  "./src/derive.js",
  "./src/catalog.js",
  "./src/gameplay.js",
  "./src/campaigns.js",
  "./src/campaign-state.js",
  "./src/new-player.js",
  "./src/migrate.js",
  "./src/validate.js",
  "./src/storage.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* La app pide aplicar la actualización; nunca se hace sola. */
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith("/data/xp-catalog.json")) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_VERSION);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw error;
  }
}
