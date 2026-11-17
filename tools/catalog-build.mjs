/**
 * catalog-build.mjs — construcción y fusión del catálogo de juego.
 *
 * El catálogo `data/xp-catalog.json` tiene DOS procedencias y no una:
 *
 *   1. lo que `extract-catalog.mjs` saca de ODEA 1 v6.x (campaña, diarias,
 *      vida, capital, sagas, jefes, escalera…);
 *   2. lo que se extrajo con `extract-assets.mjs` y se FUSIONÓ a mano:
 *      `academia`, `shop` y `cosmetics`.
 *
 * El extractor viejo reescribía el archivo entero, así que regenerarlo borraba
 * esas tres secciones y dejaba el juego sin rutas de Academia ni precios de la
 * Mochila (y `tests/mochila.test.js` fallaba). Desde v0.27.1 el extractor
 * **preserva** lo que no sabe extraer y lo declara en `meta.preservedSections`,
 * para que "regenerar" vuelva a dar el mismo contenido.
 *
 * Este módulo no toca el sistema de archivos: es puro y se prueba en Node.
 */

export const PRESERVED_SECTIONS = ["academia", "shop", "cosmetics"];

/** Cuenta entradas de cada sección preservada (para poder auditarlas). */
export function preservedCounts(catalog) {
  const out = {};
  for (const key of PRESERVED_SECTIONS) {
    const value = catalog && catalog[key];
    if (!value || typeof value !== "object") continue;
    out[key] = Array.isArray(value) ? value.length : Object.keys(value).length;
  }
  return out;
}

/**
 * Fusiona el catálogo recién extraído con la copia anterior:
 *   - lo extraído manda;
 *   - lo preservado (academia/shop/cosmetics) se conserva tal cual y queda
 *     registrado en `meta.preservedSections` + `meta.preservedCounts`.
 *
 * `previous` puede ser `null` (primer build): entonces no se preserva nada y
 * el catálogo sale incompleto a propósito, con el aviso en meta.
 */
export function mergeCatalog(built, previous = null) {
  const merged = { ...built };
  const preserved = [];
  for (const key of PRESERVED_SECTIONS) {
    const value = previous && previous[key];
    if (value == null) continue;
    merged[key] = value;
    preserved.push(key);
  }
  merged.meta = {
    ...(built.meta || {}),
    preservedSections: preserved,
    preservedCounts: preservedCounts(merged),
    ...(preserved.length
      ? { preservedNote: "Secciones que este extractor no genera: se conservan de la copia anterior." }
      : { preservedNote: "Sin copia anterior: el catálogo sale sin las secciones preservadas." })
  };
  return merged;
}

/**
 * Comprobación mínima de integridad: las secciones preservadas existen y no
 * están vacías. Devuelve `{ ok, missing, empty }`.
 */
export function checkCatalog(catalog) {
  const missing = [];
  const empty = [];
  for (const key of PRESERVED_SECTIONS) {
    const value = catalog && catalog[key];
    if (value == null) missing.push(key);
    else if (typeof value !== "object" || Object.keys(value).length === 0) empty.push(key);
  }
  return { ok: missing.length === 0 && empty.length === 0, missing, empty };
}
