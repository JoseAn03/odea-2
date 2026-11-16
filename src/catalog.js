/**
 * catalog.js — contrato del catálogo de misiones para la Fase 3.
 *
 * El catálogo (data/xp-catalog.json) es data de juego inmutable: no es
 * progreso. Acá viven dos responsabilidades puras:
 *
 *   1. `validateCatalog`: regla aprobada 2026-11-15 — los ids de misión son
 *      ÚNICOS entre todos los mapas. Si se repiten, se falla rápido.
 *   2. `missionOf`: resolver un id a su mapa, XP y clase de idempotencia,
 *      sin que el resto del código conozca la forma interna del catálogo.
 */

/** Sistemas jugables en Fase 3 (el resto sigue de solo lectura). */
export const PHASE3_SYSTEMS = ["hub", "empleo", "vida", "capital"];

/** Mapas del catálogo por sistema. */
export const SYSTEM_MAPS = {
  hub: ["daily", "weekly"],
  empleo: ["jobs", "b2b", "puente"],
  vida: ["vida"],
  capital: ["capital.done", "capital.eng", "capital.ai"]
};

/** Todos los mapas con ids de misión (incluye sistemas aún no jugables). */
export const MISSION_MAPS = [
  "campaign",
  "daily",
  "weekly",
  "jobs",
  "b2b",
  "puente",
  "vida",
  "capital.done",
  "capital.eng",
  "capital.ai"
];

function mapOf(catalog, path) {
  let node = catalog;
  for (const part of path.split(".")) {
    node = node && node[part];
  }
  return node && typeof node === "object" ? node : null;
}

/**
 * Rechaza ids repetidos entre mapas. Devuelve siempre un reporte:
 * `{ ok, duplicates: [{ id, maps }] }`.
 */
export function validateCatalog(catalog) {
  const seen = new Map();
  const duplicates = new Map();

  for (const path of MISSION_MAPS) {
    const map = mapOf(catalog, path);
    if (!map) continue;
    for (const id of Object.keys(map)) {
      if (seen.has(id)) {
        const maps = duplicates.get(id) || [seen.get(id)];
        if (!maps.includes(path)) maps.push(path);
        duplicates.set(id, maps);
      } else {
        seen.set(id, path);
      }
    }
  }

  return {
    ok: duplicates.size === 0,
    duplicates: Array.from(duplicates, ([id, maps]) => ({ id, maps }))
  };
}

function missionClassOf(entry) {
  const kind = entry && typeof entry === "object" ? entry.kind : null;
  return kind === "daily" || kind === "weekly" ? kind : "one";
}

/**
 * Resuelve `{ map, xp, cls }` para un id dentro de un sistema.
 * Devuelve null si el sistema no es jugable o el id no existe en sus mapas.
 */
export function missionOf(catalog, system, missionId) {
  if (!PHASE3_SYSTEMS.includes(system)) return null;
  const maps = SYSTEM_MAPS[system] || [];
  for (const map of maps) {
    const entryMap = mapOf(catalog, map);
    if (!entryMap || !Object.prototype.hasOwnProperty.call(entryMap, missionId)) continue;
    const entry = entryMap[missionId];
    const xp = typeof entry === "object" && entry !== null ? Number(entry.xp) || 0 : Number(entry) || 0;
    return { map, xp, cls: missionClassOf(entry), entry };
  }
  return null;
}

/** Sistema al que pertenece un mapa del catálogo (para trazabilidad). */
export function systemOfMap(map) {
  for (const [system, maps] of Object.entries(SYSTEM_MAPS)) {
    if (maps.includes(map)) return system;
  }
  return null;
}

/**
 * Lista TODAS las misiones de un sistema jugable, en orden estable de mapa y
 * clave. Devuelve `{ id, map, xp, cls, entry }`.
 *
 * No conoce completaciones: eso lo agrega `src/gameplay.js`. Vida mezcla
 * `one`, `daily` y `weekly` en el mismo mapa, así que `cls` sale de cada
 * entrada y nunca se asume una frecuencia.
 */
export function missionsOf(catalog, system) {
  if (!PHASE3_SYSTEMS.includes(system)) return [];
  const out = [];
  for (const map of SYSTEM_MAPS[system] || []) {
    const entryMap = mapOf(catalog, map);
    if (!entryMap) continue;
    for (const id of Object.keys(entryMap)) {
      const entry = entryMap[id];
      const numeric = typeof entry === "object" && entry !== null ? Number(entry.xp) : Number(entry);
      out.push({
        id,
        map,
        xp: Number.isFinite(numeric) ? numeric : 0,
        cls: missionClassOf(entry),
        entry
      });
    }
  }
  return out;
}
