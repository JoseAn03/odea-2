/**
 * view-session.js — snapshot de cámara en memoria de sesión (Fase 3, §5).
 *
 * La ciudad no persiste la cámara: el snapshot vive mientras la página está
 * abierta y solo sirve para volver a la vista previa al cerrar la hoja. Al
 * recargar no hay snapshot y se usa la vista por defecto del engine.
 *
 * Sin DOM: opera sobre la cámara pura (js/city/camera.js) para poder testearse.
 */

export function viewOf(camera) {
  return { x: camera.state.x, y: camera.state.y, zoom: camera.state.zoom };
}

export function applyView(camera, view, { instant = true } = {}) {
  if (!view) return;
  camera.jumpTo(view.x, view.y, view.zoom);
  if (instant) camera.update(10);
}

export function createViewSession(camera) {
  let snapshot = null;

  return {
    /** Captura la vista actual solo la PRIMERA vez (cambiar de distrito no la pisa). */
    capture() {
      if (!snapshot) snapshot = viewOf(camera);
      return snapshot;
    },
    /** Restaura la vista capturada y olvida el snapshot. */
    restore() {
      if (!snapshot) return false;
      const view = snapshot;
      snapshot = null;
      applyView(camera, view, { instant: true });
      return true;
    },
    peek() {
      return snapshot;
    }
  };
}
