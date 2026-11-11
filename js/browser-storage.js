/** browser-storage.js — adaptador de localStorage para la capa de Fase 0.
 *  `src/storage.js` solo necesita getItem/setItem/removeItem, así que
 *  localStorage cumple el contrato sin envoltorios adicionales.
 */

export function getStorage() {
  try {
    const probe = "__odea2_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch (error) {
    throw new Error(
      "Este navegador no permite guardar datos locales (localStorage bloqueado). " +
        "Habilitá el almacenamiento del sitio para importar tu progreso."
    );
  }
}
