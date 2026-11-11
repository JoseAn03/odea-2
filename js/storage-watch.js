/**
 * storage-watch.js — multi-pestaña (decisión F1-3).
 *
 * Escucha el evento `storage` sobre la clave del save. Si otra pestaña la
 * escribe (o limpia el almacenamiento), avisa para recargar el estado desde
 * localStorage. Sin bloqueos distribuidos ni lógica extra.
 */

export const SAVE_KEY = "odea2_bundle_v1";

export function createStorageWatcher({ target, key = SAVE_KEY, onRemoteChange }) {
  if (!target || typeof target.addEventListener !== "function") {
    return { handleEvent() {}, dispose() {} };
  }

  function handleEvent(event) {
    if (!event) return;
    /* key === null → otra pestaña llamó a localStorage.clear(). */
    if (event.key !== key && event.key !== null) return;
    onRemoteChange({
      key: event.key,
      newValue: event.newValue == null ? null : event.newValue,
      cleared: event.key === null
    });
  }

  target.addEventListener("storage", handleEvent);

  return {
    handleEvent,
    dispose() {
      target.removeEventListener("storage", handleEvent);
    }
  };
}
