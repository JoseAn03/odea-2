/**
 * storage.js — Persistencia ODEA 2 (prefijo odea2_) y máquina de importación
 * ---------------------------------------------------------------------------
 * Fase 0 simula localStorage en memoria. El objetivo es demostrar que el
 * estado es ESTABLE (save → migrar → cargar → guardar → cargar) y que la
 * importación cumple la política acordada:
 *
 *   1. Backup SIEMPRE primero, antes de cualquier escritura.
 *   2. Reconciliación de totales (candado 1): si falla → ABORTA, no escribe.
 *   3. Checksum estructural (candado 2): si falla → CUARENTENA (preview),
 *      el usuario acepta o aborta de forma explícita.
 *   4. Reimportación: rechazada por defecto; solo "reset + reimportar" con
 *      backup previo del save actual.
 */
import { derive, deriveStreak, localDateKey, sourcesFromMigrated } from "./derive.js";
import {
  MIGRATION_SCHEMA_VERSION,
  ODEA2_BUNDLE_FORMAT,
  deepEqual,
  fingerprintOf,
  sameSource
} from "./shape.js";
import { migrateBundle, MigrationError } from "./migrate.js";
import { validateMigration, validatePlayState, playFailureCode } from "./validate.js";
import { validateCatalog } from "./catalog.js";
import { applyMutation } from "./gameplay.js";

export const STORAGE_KEYS = {
  bundle: "odea2_bundle_v1",
  quarantine: "odea2_quarantine_v1",
  backupPrefix: "odea2_backup_"
};

export function createMemoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(String(k), String(v)); },
    removeItem(k) { map.delete(k); },
    key(i) { return Array.from(map.keys())[i] ?? null; },
    get length() { return map.size; },
    _keys() { return Array.from(map.keys()); },
    _dump() { return Object.fromEntries(map); }
  };
}

function nowIso() {
  return new Date().toISOString();
}

/** Retención de respaldos automáticos de save (decisión de Fase 1). */
export const SAVE_BACKUP_RETENTION = 3;

/**
 * Rota los respaldos de un tipo dado, conservando los `keep` más recientes.
 * Las claves terminan en un ISO timestamp, así que el orden lexicográfico es
 * cronológico. Devuelve las claves eliminadas (vacío si no hubo exceso).
 */
export function pruneBackups(storage, kind, keep) {
  if (!Number.isFinite(keep) || keep < 0) return [];
  const prefix = `${STORAGE_KEYS.backupPrefix}${kind}_`;
  const keys = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && key.startsWith(prefix)) keys.push(key);
  }
  keys.sort();
  const excess = keys.length - keep;
  if (excess <= 0) return [];
  const removed = keys.slice(0, excess);
  for (const key of removed) storage.removeItem(key);
  return removed;
}

/**
 * Guarda el bundle ORIGINAL intacto. Se llama antes de cualquier escritura,
 * incluso si la importación va a abortarse.
 *
 * Retención: los respaldos `kind: "save"` se rotan a los últimos 3. El respaldo
 * del origen (`kind: "source"`) NO se rota nunca: es la copia del archivo que
 * el usuario importó y debe poder auditarse siempre.
 */
export function backupBundle(bundle, storage, { at = nowIso(), kind = "source" } = {}) {
  const fp = fingerprintOf(bundle);
  const key = `${STORAGE_KEYS.backupPrefix}${kind}_${fp.digest.slice(0, 8)}_${at}`;
  storage.setItem(key, JSON.stringify(bundle));
  const pruned = kind === "save" ? pruneBackups(storage, kind, SAVE_BACKUP_RETENTION) : [];
  return { key, digest: fp.digest, createdAt: at, kind, ...(pruned.length ? { pruned } : {}) };
}

/**
 * Regla de reimportación (decisión D4 de Fase 0):
 *  - un save `active` existente rechaza cualquier importación nueva;
 *  - el MISMO bundle (misma huella) se rechaza siempre, incluso con reset;
 *  - solo "reset + reimportar" explícito permite reemplazar un save activo.
 */
export function assertCanImport(existing, legacy, { allowReset = false } = {}) {
  if (!existing) return true;
  const state = existing.import && existing.import.state;
  if (state === "quarantine") return true; // preview, todavía no es save activo

  const fp = fingerprintOf(legacy);
  if (sameSource(existing.sourceFingerprint, fp)) {
    throw new MigrationError(
      "DUPLICATE_SOURCE",
      "Este mismo bundle ya fue importado (huella idéntica). Reimportarlo duplicaría créditos.",
      { digest: fp.digest }
    );
  }
  if (!allowReset) {
    throw new MigrationError(
      "ALREADY_IMPORTED",
      "Ya existe un save odea2_ activo. Reimportar requiere la acción explícita «reset + reimportar».",
      { existingFingerprint: existing.sourceFingerprint || null, incomingFingerprint: fp }
    );
  }
  return true;
}

/**
 * Importación única. Nunca escribe un save activo si los totales no reconcilian.
 *
 * @returns {{status:"active"|"quarantine"|"aborted", bundle, report, backup, validation}}
 */
export function importBundle(legacy, opts = {}) {
  const { catalog, storage, referenceDate, allowReset = false } = opts;
  const at = opts.migratedAt || nowIso();
  if (!storage) throw new MigrationError("NO_STORAGE", "Falta el storage de destino.");
  if (!catalog) throw new MigrationError("NO_CATALOG", "Falta el catálogo estático de juego.");

  /* 1. Backup siempre primero. */
  const backup = backupBundle(legacy, storage, { at, kind: "source" });

  /* 2. Guardia de reimportación (antes de tocar el save activo). */
  assertCanImport(readOdea2(storage), legacy, { allowReset });

  /* 3. Migración pura. */
  const bundle = migrateBundle(legacy, { catalog, referenceDate, migratedAt: at });
  bundle.import.backup = { key: backup.key, digest: backup.digest, createdAt: backup.createdAt, kind: backup.kind };

  /* 4. Candado 1: si los totales no reconcilian, no se escribe nada como save. */
  if (bundle.import.state === "aborted") {
    return {
      status: "aborted",
      bundle: null,
      preview: bundle,
      report: bundle.import.report,
      backup,
      validation: validateMigration(legacy, bundle, catalog, { referenceDate, requireBackup: true })
    };
  }

  const validation = validateMigration(legacy, bundle, catalog, { referenceDate, requireBackup: true });

  /* 5. Candado 2: cuarentena = preview, nunca save activo. */
  if (bundle.import.state === "quarantine") {
    storage.setItem(STORAGE_KEYS.quarantine, JSON.stringify(bundle));
    return { status: "quarantine", bundle, report: bundle.import.report, backup, validation };
  }

  saveOdea2(storage, bundle);
  storage.removeItem(STORAGE_KEYS.quarantine);
  return { status: "active", bundle, report: bundle.import.report, backup, validation };
}

/** Aceptación explícita de una importación en cuarentena. */
export function acceptQuarantine(storage, { acceptedAt = nowIso(), note = "" } = {}) {
  const raw = storage.getItem(STORAGE_KEYS.quarantine);
  if (!raw) throw new MigrationError("NO_QUARANTINE", "No hay una importación en cuarentena para aceptar.");
  const bundle = JSON.parse(raw);
  if (!bundle.import || bundle.import.state !== "quarantine") {
    throw new MigrationError("NOT_QUARANTINE", `El preview no está en cuarentena (state=${bundle.import && bundle.import.state}).`);
  }
  bundle.import.state = "active";
  bundle.import.acceptedAt = acceptedAt;
  bundle.import.acceptedChecks = [...(bundle.import.failedChecks || [])];
  if (note) bundle.import.acceptNote = note;
  storage.setItem(STORAGE_KEYS.bundle, JSON.stringify(bundle));
  storage.removeItem(STORAGE_KEYS.quarantine);
  return bundle;
}

/** Aborta una cuarentena: descarta el preview (el backup del origen queda). */
export function rejectQuarantine(storage) {
  const raw = storage.getItem(STORAGE_KEYS.quarantine);
  if (!raw) throw new MigrationError("NO_QUARANTINE", "No hay una importación en cuarentena para abortar.");
  storage.removeItem(STORAGE_KEYS.quarantine);
  return true;
}

/**
 * «Reset + reimportar»: única vía para reemplazar un save activo.
 * Primero hace backup del save actual, después importa.
 */
export function resetAndReimport(legacy, opts = {}) {
  const { storage } = opts;
  if (!storage) throw new MigrationError("NO_STORAGE", "Falta el storage de destino.");
  const at = opts.migratedAt || nowIso();
  const current = readOdea2(storage);

  /* Misma huella que el save activo: se rechaza aunque haya reset,
     porque reimportar el mismo bundle duplicaría créditos. */
  if (current) assertCanImport(current, legacy, { allowReset: true });

  const backupOfCurrent = current
    ? backupBundle(current, storage, { at, kind: "save" })
    : null;

  storage.removeItem(STORAGE_KEYS.bundle);
  storage.removeItem(STORAGE_KEYS.quarantine);

  const result = importBundle(legacy, { ...opts, migratedAt: at, allowReset: true });
  return { ...result, backupOfCurrent };
}

/**
 * Carga de ODEA 2: exige un save ACTIVO, recalcula el estado derivado y, si no
 * coincide con el snapshot guardado, falla cerrado (XP_DRIFT).
 */
export function loadOdea2(bundle2, catalog, opts = {}) {
  if (!bundle2 || bundle2._format !== ODEA2_BUNDLE_FORMAT) {
    throw new MigrationError("BAD_BUNDLE", `Bundle ODEA 2 inválido: ${bundle2 && bundle2._format}`);
  }
  const state = bundle2.import && bundle2.import.state;
  if (state !== "active") {
    throw new MigrationError(
      "IMPORT_NOT_ACTIVE",
      `La importación está en estado "${state}". No se puede usar como save activo hasta aceptarla.`
    );
  }
  const clone = JSON.parse(JSON.stringify(bundle2));
  const ref = (clone.migration && clone.migration.referenceDate) || opts.referenceDate;
  const d = derive(sourcesFromMigrated(clone, catalog), catalog, ref);
  const streak = deriveStreak(clone);

  const snapshot = (clone.core.derived && clone.core.derived.xpBreakdown) || null;
  const tolerance = Number(opts.toleranceXP || 0);
  let drift = null;
  if (snapshot) {
    const comps = Object.keys(snapshot);
    const mismatch = comps.filter((k) => Math.abs(Number(snapshot[k]) - Number(d.xpBreakdown[k])) > tolerance);
    const totalMismatch = Math.abs(Number(clone.core.derived.totalXP) - Number(d.totalXP)) > tolerance;
    if (mismatch.length || totalMismatch) {
      drift = { components: mismatch, total: totalMismatch, stored: snapshot, recomputed: d.xpBreakdown };
    }
  }
  if (drift && !opts.allowDrift) {
    const err = new Error("XP_DRIFT: el estado guardado no coincide con las fuentes. Importación abortada.");
    err.name = "XpDriftError";
    err.detail = drift;
    throw err;
  }

  clone.core.derived = {
    xpBreakdown: d.xpBreakdown,
    totalXP: d.totalXP,
    campaignLevel: d.campaignLevel,
    level: d.level,
    odeLevel: d.odeLevel,
    coins: d.coins,
    streak: streak.streak,
    streakDate: streak.streakDate
  };
  return clone;
}

/** Escribe el bundle SOLO si está activo. Una cuarentena nunca es save. */
export function saveOdea2(storage, bundle2) {
  if (!bundle2 || bundle2._format !== ODEA2_BUNDLE_FORMAT) {
    throw new MigrationError("BAD_BUNDLE", `Bundle ODEA 2 inválido: ${bundle2 && bundle2._format}`);
  }
  const state = bundle2.import && bundle2.import.state;
  if (state !== "active") {
    throw new MigrationError(
      "IMPORT_NOT_ACTIVE",
      `No se puede guardar como save activo un bundle en estado "${state}". Usá aceptar/abortar la cuarentena primero.`
    );
  }
  if (bundle2.schemaVersion !== MIGRATION_SCHEMA_VERSION) {
    throw new MigrationError(
      "BAD_SCHEMA_VERSION",
      `schemaVersion ${bundle2.schemaVersion} no soportada (esperada ${MIGRATION_SCHEMA_VERSION}).`
    );
  }
  storage.setItem(STORAGE_KEYS.bundle, JSON.stringify(bundle2));
  return bundle2;
}

export function readOdea2(storage) {
  const raw = storage.getItem(STORAGE_KEYS.bundle);
  if (!raw) return null;
  return JSON.parse(raw);
}

/* ========================================================================== */
/* Fase 3 — ruta ÚNICA de escritura de gameplay                              */
/* ========================================================================== */

function rejected(code, message, { bundle = null, detail = null, backup = null } = {}) {
  return {
    status: "rejected",
    bundle,
    backup,
    changed: [],
    error: { code, message, ...(detail ? { detail } : {}) }
  };
}

/** Refresca el snapshot derivado con la MISMA forma que `loadOdea2`. */
function refreshDerived(bundle2, catalog) {
  const ref = bundle2.migration && bundle2.migration.referenceDate;
  const d = derive(sourcesFromMigrated(bundle2, catalog), catalog, ref);
  const streak = deriveStreak(bundle2);
  bundle2.core.derived = {
    xpBreakdown: d.xpBreakdown,
    totalXP: d.totalXP,
    campaignLevel: d.campaignLevel,
    level: d.level,
    odeLevel: d.odeLevel,
    coins: d.coins,
    streak: streak.streak,
    streakDate: streak.streakDate
  };
  return { derived: d, streak };
}

function validateFailureCode(report) {
  return playFailureCode(report);
}

/**
 * Única puerta de escritura de gameplay (Fase 3, spec §3.2).
 *
 * Flujo: catálogo → lectura → duplicado sin backup → copia → mutar →
 * refrescar snapshot → `validatePlayState` → backup exacto (verificado byte a
 * byte) → CAS → escritura → relectura → rollback si no coincide.
 *
 * No lanza por errores de datos: devuelve `{ status, bundle, backup, changed,
 * error }`. Solo `TypeError` si faltan `storage` o `catalog` (error de
 * programador).
 */
export function applyGameplayMutation(storage, catalog, mutation, opts = {}) {
  if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") {
    throw new TypeError("applyGameplayMutation: falta el storage.");
  }
  if (!catalog || typeof catalog !== "object") {
    throw new TypeError("applyGameplayMutation: falta el catálogo.");
  }

  /* 0. Catálogo fail-fast: ids duplicados abortan sin leer ni escribir. */
  const catalogCheck = validateCatalog(catalog);
  if (!catalogCheck.ok) {
    return rejected("BAD_CATALOG", "El catálogo tiene ids de misión duplicados.", {
      detail: { duplicates: catalogCheck.duplicates }
    });
  }

  const at = opts.at || nowIso();
  const date = opts.date || localDateKey(new Date());

  /* 1-2. Lectura y save activo. */
  const rawBefore = storage.getItem(STORAGE_KEYS.bundle);
  if (!rawBefore) return rejected("NO_SAVE", "No hay un save ODEA 2 para mutar.");

  let bundle;
  try {
    bundle = JSON.parse(rawBefore);
  } catch {
    return rejected("BAD_BUNDLE", "El save persistido no es JSON válido.");
  }
  if (!bundle || bundle._format !== ODEA2_BUNDLE_FORMAT) {
    return rejected("BAD_BUNDLE", `Bundle ODEA 2 inválido: ${bundle && bundle._format}`, { bundle });
  }
  const state = bundle.import && bundle.import.state;
  if (state !== "active") {
    return rejected(
      "SAVE_NOT_ACTIVE",
      `La importación está en estado "${state}"; no es un save activo.`,
      { bundle }
    );
  }

  /* 3-6. Copia y mutación. Duplicado/errores salen sin backup. */
  const draft = JSON.parse(JSON.stringify(bundle));
  const result = applyMutation(draft, mutation, catalog, { at, date });

  if (result.duplicate) {
    return { status: "duplicate", bundle, backup: null, changed: [], error: null };
  }
  if (!result.changed) {
    return rejected(result.reason || "UNKNOWN_MUTATION", `Mutación rechazada: ${result.reason || "sin cambios"}.`, {
      bundle
    });
  }

  /* 7. Snapshot derivado (nunca se edita un total a mano). */
  refreshDerived(draft, catalog);

  /* 8. Validación fail-closed de la copia ANTES de tocar el save. */
  const report = validatePlayState(draft, catalog, { previous: bundle });
  if (!report.ok) {
    const code = validateFailureCode(report);
    return rejected(code, `La mutación no es válida (${code}).`, {
      bundle,
      detail: { errors: report.errors }
    });
  }

  /* 9. Backup exacto del save persistido actual, verificado byte a byte. */
  let backup;
  try {
    backup = backupBundle(bundle, storage, { at, kind: "save" });
  } catch (error) {
    return rejected("BACKUP_FAILED", `No se pudo crear el backup: ${error.message}`, { bundle });
  }
  const backupRaw = storage.getItem(backup.key);
  if (backupRaw == null) {
    return rejected("BACKUP_FAILED", "El backup no quedó legible.", { bundle, backup });
  }
  if (backupRaw !== rawBefore) {
    return rejected("BACKUP_MISMATCH", "El backup no coincide byte a byte con el save previo.", {
      bundle,
      backup
    });
  }

  /* 10. CAS: otra pestaña no puede haber escrito entre la lectura y acá. */
  const rawNow = storage.getItem(STORAGE_KEYS.bundle);
  if (rawNow !== rawBefore) {
    return rejected("CONCURRENT_CHANGE", "Otra pestaña escribió el save durante la mutación.", {
      bundle,
      backup
    });
  }

  /* 11. Escritura. */
  const serialized = JSON.stringify(draft);
  try {
    storage.setItem(STORAGE_KEYS.bundle, serialized);
  } catch (error) {
    /* Cuota: se verifica que el save no haya cambiado. */
    try {
      if (storage.getItem(STORAGE_KEYS.bundle) !== rawBefore) {
        storage.setItem(STORAGE_KEYS.bundle, rawBefore);
      }
    } catch {
      /* sin margen: la relectura ya falla cerrado */
    }
    return rejected("QUOTA_EXCEEDED", `No se pudo escribir el save: ${error.message}`, { bundle, backup });
  }

  /* 12. Relectura y verificación (string exacto o, en su defecto, deepEqual). */
  const rawAfter = storage.getItem(STORAGE_KEYS.bundle);
  let verified = rawAfter === serialized;
  if (!verified && rawAfter != null) {
    try {
      verified = deepEqual(JSON.parse(rawAfter), draft);
    } catch {
      verified = false;
    }
  }
  if (!verified) {
    try {
      storage.setItem(STORAGE_KEYS.bundle, rawBefore);
    } catch {
      /* rollback best-effort; el error se reporta igual */
    }
    return rejected("WRITE_VERIFY_FAILED", "La relectura no coincide con lo escrito; se revirtió el save.", {
      bundle,
      backup
    });
  }

  return { status: "applied", bundle: draft, backup, changed: result.paths, error: null };
}

/**
 * Detecta el formato de un archivo soltado por el usuario, SIN migrarlo.
 * Permite que la UI mande cada formato por su ruta:
 *   odea_bundle_v2   → migración ODEA 1 (D1–D5, una sola vez)
 *   odea2_bundle_v1 → restauración de respaldo propio (no es re-migración)
 */
export function detectBundleFormat(obj) {
  if (obj && obj._format === ODEA2_BUNDLE_FORMAT) return ODEA2_BUNDLE_FORMAT;
  if (obj && obj._format === "odea_bundle_v2") return "odea_bundle_v2";
  return "unknown";
}

/**
 * Restauración de un respaldo propio `odea2_bundle_v1`.
 *
 * NO es una reimportación de ODEA 1 y por eso no choca con D4: no toca la
 * huella del origen ni el guardia `ALREADY_IMPORTED`.
 *
 * Garantías:
 *   1. El archivo debe ser un respaldo ODEA 2 activo y de schema soportado.
 *   2. Se valida que las fuentes sigan cuadrando con el snapshot (XP_DRIFT).
 *   3. Se respalda el save actual (`kind: "save"`) ANTES de reemplazarlo.
 *   4. La confirmación explícita del usuario es responsabilidad de la UI.
 */
export function restoreBundle(bundle2, opts = {}) {
  const { storage, catalog } = opts;
  if (!storage) throw new MigrationError("NO_STORAGE", "Falta el storage de destino.");
  if (!catalog) throw new MigrationError("NO_CATALOG", "Falta el catálogo estático de juego.");
  if (!bundle2 || bundle2._format !== ODEA2_BUNDLE_FORMAT) {
    throw new MigrationError(
      "BAD_RESTORE_FORMAT",
      `El archivo no es un respaldo de ODEA 2 (${bundle2 && bundle2._format}).`
    );
  }
  if (bundle2.schemaVersion !== MIGRATION_SCHEMA_VERSION) {
    throw new MigrationError(
      "BAD_SCHEMA_VERSION",
      `schemaVersion ${bundle2.schemaVersion} no soportada (esperada ${MIGRATION_SCHEMA_VERSION}).`
    );
  }
  if (!bundle2.import || bundle2.import.state !== "active") {
    throw new MigrationError(
      "IMPORT_NOT_ACTIVE",
      `El respaldo está en estado "${bundle2.import && bundle2.import.state}". Solo se restaura un save activo.`
    );
  }

  /* Valida ANTES de escribir: si el respaldo está corrupto, no se toca nada. */
  const at = opts.at || nowIso();
  const restored = loadOdea2(bundle2, catalog, { referenceDate: opts.referenceDate });
  const current = readOdea2(storage);
  const backupOfCurrent = current ? backupBundle(current, storage, { at, kind: "save" }) : null;

  restored.import = { ...restored.import, restoredAt: at };
  storage.setItem(STORAGE_KEYS.bundle, JSON.stringify(restored));
  storage.removeItem(STORAGE_KEYS.quarantine);
  return { bundle: restored, backupOfCurrent };
}


export function readQuarantine(storage) {
  const raw = storage.getItem(STORAGE_KEYS.quarantine);
  if (!raw) return null;
  return JSON.parse(raw);
}
