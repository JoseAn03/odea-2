/* sw.js — Service worker de ODEA 2 (Fase 3 · Costa Neón)
 * Precachea SOLO el cascarón de la app (HTML, CSS, JS, manifest, ícono).
 * El catálogo de juego se cachea en runtime; el progreso del usuario nunca
 * pasa por la caché (vive en localStorage).
 *
 * Actualización automática (decisión F1-1 REVERTIDA por orden de José,
 * 2026-11-18): el install SÍ llama a skipWaiting() y el SW nuevo se activa
 * solo, sin esperar a nadie. Motivo: en su Chrome el aviso «Hay una versión
 * nueva / Recargar» nunca apareció tras 4 reinicios y la actualización quedó
 * trabada (su Samsung sí actualizó). Al activarse, `activate` reclama los
 * clientes y el update-watcher recarga la página ante el controllerchange,
 * así que la versión nueva entra sola. El mensaje SKIP_WAITING se conserva
 * como vía compatible para el botón «Recargar» si el aviso llega a verse.
 *
 * CACHE_VERSION debe subir en CADA release que cambie el SHELL. Usar un
 * nombre de caché distinto aísla el release nuevo del viejo: mientras el SW
 * anterior sigue controlando la pestaña, su caché queda intacto y no se
 * mezclan assets de dos versiones. `activate` borra los cachés viejos.
 */
const CACHE_VERSION = "odea2-v0.54.0-fase7";

const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/app.css",
  "./css/campaign.css",
  "./assets/slots/brete.webp",
  "./assets/slots/gamer.webp",
  "./assets/slots/diarias.webp",
  "./assets/slots/tienda.webp",
  "./assets/slots/eventos.webp",
  "./assets/slots/whatsapp.svg",
  "./assets/slots/garaje.webp",
  "./assets/slots/academia.webp",
  "./assets/slots/zonaia.webp",
  "./assets/slots/sabiduria.webp",
  "./assets/slots/mundoian.webp",
  "./assets/phone-wallpaper.webp",
  "./assets/city-map.webp",
  "./assets/jarvis.webp",
  "./assets/libreta.svg",
  "./assets/tab-ciudad.svg",
  "./assets/tab-hoy.svg",
  "./assets/tab-telefono.svg",
  "./assets/tab-mochila.svg",
  "./assets/tab-caminar.svg",
  "./assets/tab-parar.svg",
  "./assets/tab-menu.svg",
  "./assets/hud-coin.svg",
  "./assets/hud-star.svg",
  "./assets/hud-look-clasico.svg",
  "./assets/hud-look-gorra-rosa.svg",
  "./assets/hud-look-camiseta-dorada.svg",
  "./assets/hud-look-oficina.svg",
  "./assets/hud-look-neon-gamer.svg",
  "./assets/hud-look-vice-city.svg",
  "./assets/hud-look-la-sele.svg",
  "./assets/hud-look-cubico.svg",
  "./assets/hud-look-fontanero.svg",
  "./assets/hud-look-pirata-paja.svg",
  "./assets/hud-look-ejecutivo-vc.svg",
  "./assets/hud-look-guerrero-naranja.svg",
  "./assets/hud-look-gigante-verde.svg",
  "./assets/hud-look-heroe-aracnido.svg",
  "./assets/hud-look-rey-caparazon.svg",
  "./assets/hud-look-armadura-carmesi.svg",
  "./icons/icon.svg",
  "./js/app.js",
  "./js/campaign-ui.js",
  "./js/garage-ui.js",
  "./js/ian-ui.js",
  "./js/marca-ui.js",
  "./js/jarvis-ui.js",
  "./js/jarvis-client.js",
  "./js/jarvis-config.js",
  "./js/shop-ui.js",
  "./js/contrato-ui.js",
  "./js/inventory-ui.js",
  "./js/libreta-ui.js",
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
  "./src/shop.js",
  "./src/campaigns.js",
  "./src/campaign-state.js",
  "./src/garage-state.js",
  "./src/ian-state.js",
  "./src/marca-state.js",
  "./src/jarvis-state.js",
  "./src/tutor-index.js",
  "./src/jarvis-actions.js",
  "./src/libreta-state.js",
  "./src/reales-state.js",
  "./src/contrato-state.js",
  "./src/racha-state.js",
  "./src/paquetes-state.js",
  "./src/legendario-state.js",
  "./assets/hud-look-exo-automata.svg",
  "./src/new-player.js",
  "./src/migrate.js",
  "./src/validate.js",
  "./src/storage.js"
];

self.addEventListener("install", (event) => {
  /* Activación inmediata (orden de José, 2026-11-18): no esperar al usuario. */
  self.skipWaiting();
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

/* Vía compatible: si el aviso llega a verse y el usuario toca «Recargar», la
 * app pide aplicar la actualización. Ya no es el camino principal: el install
 * activa solo con skipWaiting() (orden de José, 2026-11-18). */
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
