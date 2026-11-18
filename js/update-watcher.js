/**
 * update-watcher.js — aviso de versión nueva del service worker.
 *
 * Regla vigente (F1-1 revertida por orden de José, 2026-11-18): el service
 * worker llama a skipWaiting() al instalar y se activa SOLO, porque en su
 * Chrome el aviso «Recargar» nunca apareció y la actualización quedó trabada.
 * Este módulo recarga la página una sola vez cuando el controlador cambia,
 * haya o no toque del usuario. El aviso y accept() (mensaje SKIP_WAITING) se
 * conservan como vía compatible, no como requisito.
 *
 * Sin DOM: recibe el contenedor (navigator.serviceWorker) y callbacks, para
 * poder probarse con objetos simulados.
 */

export const SKIP_WAITING = "SKIP_WAITING";

export function createUpdateWatcher({
  container,
  onUpdateAvailable,
  reload = () => {},
  fallbackMs = 0
}) {
  let registration = null;
  let waiting = null;
  let notified = false;
  let reloadPending = false;
  let didReload = false;
  let fallbackTimer = null;

  const canListen = container && typeof container.addEventListener === "function";
  /* Si la página ya tenía controlador, un controllerchange significa que un
   * SW nuevo tomó el mando: hay versión nueva servida y toca recargar. En la
   * primera instalación no había controlador: no hay nada viejo que
   * reemplazar y recargar sería un salto gratuito. */
  const hadController = !!(container && container.controller);

  function notify(worker) {
    if (worker) waiting = worker;
    if (notified) return;
    notified = true;
    onUpdateAvailable();
  }

  function reloadOnce() {
    if (didReload) return;
    didReload = true;
    if (fallbackTimer !== null) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
    reload();
  }

  function onControllerChange() {
    if (reloadPending) {
      reloadPending = false;
      reloadOnce();
      return;
    }
    /* Activación automática (skipWaiting en el SW): recargar sin esperar al
     * usuario. Orden de José, 2026-11-18. */
    if (hadController) reloadOnce();
  }

  if (canListen) container.addEventListener("controllerchange", onControllerChange);

  /** Engancha una registration recién creada/obtenida. */
  function check(reg) {
    registration = reg || null;
    if (!registration) return null;

    /* Caso 1: ya había una versión esperando (recarga de la app). */
    if (registration.waiting && container && container.controller) {
      notify(registration.waiting);
    }

    /* Caso 2: el navegador encuentra una actualización mientras usamos la app. */
    if (typeof registration.addEventListener === "function") {
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        if (!worker || typeof worker.addEventListener !== "function") return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && container && container.controller) notify(worker);
        });
      });
    }
    return registration;
  }

  /** Acción del usuario (vía compatible): pide aplicar la actualización y
   * recarga una sola vez. Ya no es el camino principal: el SW se activa solo
   * y onControllerChange recarga sin intervención. */
  function accept() {
    if (reloadPending) return;
    reloadPending = true;
    const worker = (registration && registration.waiting) || waiting;
    if (!worker || typeof worker.postMessage !== "function") {
      reloadPending = false;
      reloadOnce();
      return;
    }
    worker.postMessage({ type: SKIP_WAITING });
    if (fallbackMs > 0) {
      fallbackTimer = setTimeout(() => {
        if (!reloadPending) return;
        reloadPending = false;
        fallbackTimer = null;
        reloadOnce();
      }, fallbackMs);
    }
  }

  function dispose() {
    if (canListen) container.removeEventListener("controllerchange", onControllerChange);
    if (fallbackTimer !== null) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
  }

  return {
    check,
    accept,
    dispose,
    hasUpdate: () => notified,
    isApplying: () => reloadPending
  };
}
