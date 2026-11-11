/**
 * update-watcher.js — aviso de versión nueva del service worker.
 *
 * Regla de la Fase 1 (F1-1): la actualización se aplica SOLO cuando el usuario
 * toca «Recargar». El service worker ya no llama a skipWaiting() al instalar;
 * espera el mensaje SKIP_WAITING que este módulo envía.
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
  let fallbackTimer = null;

  const canListen = container && typeof container.addEventListener === "function";

  function notify(worker) {
    if (worker) waiting = worker;
    if (notified) return;
    notified = true;
    onUpdateAvailable();
  }

  function onControllerChange() {
    if (!reloadPending) return;
    reloadPending = false;
    if (fallbackTimer !== null) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
    reload();
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

  /** Acción del usuario: aplica la actualización y recarga una sola vez. */
  function accept() {
    if (reloadPending) return;
    reloadPending = true;
    const worker = (registration && registration.waiting) || waiting;
    if (!worker || typeof worker.postMessage !== "function") {
      reloadPending = false;
      reload();
      return;
    }
    worker.postMessage({ type: SKIP_WAITING });
    if (fallbackMs > 0) {
      fallbackTimer = setTimeout(() => {
        if (!reloadPending) return;
        reloadPending = false;
        fallbackTimer = null;
        reload();
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
