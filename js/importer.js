/** importer.js — puente entre la UI y la lógica de Fase 0 (src/).
 *  No reimplementa validación ni migración: reexporta y orquesta las funciones
 *  ya probadas de `src/storage.js`.
 */
import {
  detectBundleFormat,
  importBundle,
  acceptQuarantine,
  rejectQuarantine,
  resetAndReimport,
  restoreBundle,
  readOdea2,
  readQuarantine,
  loadOdea2
} from "../src/storage.js";

export const FORMATS = {
  ODEA1: "odea_bundle_v2",
  ODEA2: "odea2_bundle_v1",
  UNKNOWN: "unknown"
};

/** Parsea el texto del archivo y clasifica su formato sin migrarlo. */
export function parseFileText(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error("El archivo no es JSON válido.");
  }
  const format = detectBundleFormat(data);
  return { data, format };
}

export function currentBundle(storage) {
  return readOdea2(storage);
}

export function pendingQuarantine(storage) {
  return readQuarantine(storage);
}

/** Carga el save activo recalculando el estado derivado (falla con XP_DRIFT). */
export function activeState(storage, catalog) {
  const bundle = readOdea2(storage);
  return bundle ? loadOdea2(bundle, catalog) : null;
}

export {
  importBundle,
  acceptQuarantine,
  rejectQuarantine,
  resetAndReimport,
  restoreBundle
};
