/** catalog.js — carga del catálogo estático de juego (data/xp-catalog.json).
 *  Es data de juego (ids → XP), no progreso del usuario. Sin catálogo no se
 *  puede reconciliar la importación, así que la app no arranca el flujo sin él.
 */
let cached = null;

export async function loadCatalog() {
  if (cached) return cached;
  const url = new URL("../data/xp-catalog.json", import.meta.url);
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`No se pudo cargar el catálogo de juego (HTTP ${response.status}).`);
  }
  cached = await response.json();
  return cached;
}
