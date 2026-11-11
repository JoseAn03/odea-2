/* sw.js — Service worker de ODEA 2 (Fase 2 · Costa Neón)
 * Precachea SOLO el cascarón de la app (HTML, CSS, JS, manifest, ícono).
 * El catálogo de juego se cachea en runtime; el progreso del usuario nunca
 * pasa por la caché (vive en localStorage).
 *
 * Actualización a pedido del usuario (decisión F1-1): el install NO llama a
 * skipWaiting(). El SW espera el mensaje SKIP_WAITING que envía la app cuando
 * el usuario toca «Recargar» en el aviso de versión nueva.
 */
const CACHE_VERSION = "odea2-v0.3.0-fase2";

const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/app.css",
  "./icons/icon.svg",
  "./js/app.js",
  "./js/version.js",
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
  "./js/city/layout.js",
  "./js/city/world.js",
  "./js/city/camera.js",
  "./js/city/render.js",
  "./js/city/input.js",
  "./js/city/engine.js",
  "./src/shape.js",
  "./src/derive.js",
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
