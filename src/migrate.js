/**
 * migrate.js — Importador único ODEA 1 (odea_bundle_v2) → ODEA 2 (odea2_bundle_v1)
 * ---------------------------------------------------------------------------
 * Transformación PURA y determinista (si se fija migratedAt).
 * No toca el bundle de origen. No descarta campos: lo desconocido se preserva
 * en `migration.unmapped`.
 *
 * Política de integridad (decisión D-checksum de Fase 0), dos candados:
 *   Candado 1 — RECONCILIACIÓN: los totales recalculados desde las fuentes
 *   (totalXP, los 10 componentes de xpBreakdown y shop.spent) deben coincidir
 *   con los del bundle. Si no, la importación queda ABORTADA: no se escribe
 *   nada como save activo.
 *   Candado 2 — CHECKSUM ESTRUCTURAL: deben estar presentes los 36 campos, las
 *   11 claves y los 3 críticos. Si falla (pero los totales reconcilian), la
 *   importación queda en CUARENTENA: se escribe solo como preview y el usuario
 *   decide explícitamente aceptar o abortar.
 *
 * El backup del bundle original es responsabilidad de la capa de escritura
 * (`storage.js`): se hace SIEMPRE antes de cualquier escritura, incluso si la
 * importación termina abortada.
 */
import {
  MIGRATION_SCHEMA_VERSION,
  ODEA2_APP_VERSION,
  ODEA2_BUNDLE_FORMAT,
  SAVE_FIELDS,
  SIBLING_KEYS,
  SAVE_FIELD_SET,
  SIBLING_KEY_SET,
  CRITICAL_FIELDS,
  CRITICAL_TARGETS,
  fingerprintOf,
  getPath
} from "./shape.js";
import { derive, sourcesFromLegacy, sourcesFromMigrated } from "./derive.js";

export const XP_COMPONENTS = [
  "career", "ach", "vida", "capital", "focus",
  "diary", "bosses", "hunt", "evento", "farm"
];

export class MigrationError extends Error {
  constructor(code, message, detail) {
    super(message);
    this.name = "MigrationError";
    this.code = code;
    this.detail = detail;
  }
}

function clone(v) {
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}

function setPath(obj, path, value) {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (!cur[k] || typeof cur[k] !== "object") cur[k] = {};
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = value;
}

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function has(obj, key) {
  return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
}

/**
 * @param {object} legacy bundle odea_bundle_v2
 * @param {object} opts
 * @param {object} opts.catalog catálogo estático (data/xp-catalog.json). Requerido:
 *        sin catálogo no se pueden reconciliar totales y la importación no es válida.
 * @param {string} [opts.referenceDate] fecha de referencia para derivaciones
 *        dependientes del calendario. Default: save.lastDailyDate o hoy.
 * @param {string} [opts.migratedAt] ISO timestamp fijo para tests deterministas.
 */
export function migrateBundle(legacy, opts = {}) {
  if (!isPlainObject(legacy)) {
    throw new MigrationError("NOT_OBJECT", "El bundle no es un objeto JSON.");
  }
  if (legacy._format !== "odea_bundle_v2") {
    throw new MigrationError("BAD_FORMAT", `Formato inesperado: ${legacy._format}. Se esperaba odea_bundle_v2.`);
  }
  if (!isPlainObject(legacy.save)) {
    throw new MigrationError("NO_SAVE", "El bundle no contiene un objeto `save`.");
  }
  if (!isPlainObject(legacy.keys)) {
    throw new MigrationError("NO_KEYS", "El bundle no contiene un objeto `keys`.");
  }
  if (!isPlainObject(opts.catalog)) {
    throw new MigrationError(
      "NO_CATALOG",
      "Falta el catálogo estático de juego: sin él no se pueden reconciliar los totales y la importación no es verificable."
    );
  }

  const srcSave = legacy.save;
  const srcKeys = legacy.keys;
  const catalog = opts.catalog;
  const referenceDate = opts.referenceDate || srcSave.lastDailyDate || new Date().toISOString().slice(0, 10);
  const migratedAt = opts.migratedAt || new Date().toISOString();

  /* ---------------------------------------------------------------- core -- */
  const core = { schemaVersion: MIGRATION_SCHEMA_VERSION };
  const decisions = [];

  for (const field of SAVE_FIELDS) {
    const present = has(srcSave, field.name);
    if (present) {
      const value = clone(srcSave[field.name]);
      if (field.name === "saveVersion") {
        /* Va a migratedFrom.saveVersion, no a core. */
        decisions.push({
          source: `save.${field.name}`,
          action: field.action,
          target: field.target,
          present: true,
          reason: field.reason
        });
        continue;
      }
      if (field.target.startsWith("core.")) {
        setPath(core, field.target.slice(5), value);
      }
    }
    decisions.push({
      source: `save.${field.name}`,
      action: field.action,
      target: field.target,
      present,
      reason: field.reason,
      ...(field.critical ? { critical: true } : {})
    });
  }

  /* Críticos siempre explícitos, incluso ausentes (null), para que el
     validador pueda señalarlos en vez de encontrarse con un hueco mudo. */
  core.credits = {
    eventRL: has(srcSave, "eventRL") ? clone(srcSave.eventRL) : null,
    farm: has(srcSave, "farm") ? clone(srcSave.farm) : null
  };
  core.realRewards = {
    canje: has(srcSave, "canje") ? clone(srcSave.canje) : null
  };

  core.derived = core.derived || {};

  /* ------------------------------------------------- worlds + legacy ----- */
  const worlds = {};
  const legacyKeys = {};
  const keyDecisions = {};

  for (const def of SIBLING_KEYS) {
    const present = has(srcKeys, def.key);
    keyDecisions[def.name] = {
      legacyKey: def.key,
      section: def.section,
      lifecycle: def.lifecycle,
      reason: def.reason,
      present
    };
    if (!present) continue;
    const data = clone(srcKeys[def.key]);
    const entry = {
      legacyKey: def.key,
      schemaVersion: isPlainObject(data) && typeof data.v === "number" ? data.v : null,
      lifecycle: def.lifecycle,
      reason: def.reason,
      data
    };
    if (def.section === "worlds") worlds[def.name] = entry;
    else legacyKeys[def.name] = entry;
  }

  /* ------------------------------------------- nada se pierde: unknowns -- */
  const unknownFields = {};
  for (const [k, v] of Object.entries(srcSave)) {
    if (!SAVE_FIELD_SET.has(k)) unknownFields[k] = clone(v);
  }
  const unknownKeys = {};
  for (const [k, v] of Object.entries(srcKeys)) {
    if (!SIBLING_KEY_SET.has(k)) unknownKeys[k] = clone(v);
  }

  const bundle2 = {
    _format: ODEA2_BUNDLE_FORMAT,
    schemaVersion: MIGRATION_SCHEMA_VERSION,
    appVersion: ODEA2_APP_VERSION,
    migratedFrom: {
      format: legacy._format,
      appVersion: legacy.appVersion || null,
      saveVersion: has(srcSave, "saveVersion") ? srcSave.saveVersion : null,
      migratedAt
    },
    sourceFingerprint: fingerprintOf(legacy),
    migration: {
      referenceDate,
      decisions,
      worlds: keyDecisions,
      unmapped: { fields: unknownFields, keys: unknownKeys }
    },
    core,
    worlds,
    legacy: { keys: legacyKeys }
  };

  /* -------------------------------------------------- candado 1: totales -- */
  const dLegacy = derive(sourcesFromLegacy(legacy), catalog, referenceDate);
  const dMigrated = derive(sourcesFromMigrated(bundle2), catalog, referenceDate);

  const storedBreakdown = isPlainObject(srcSave.xpBreakdown) ? srcSave.xpBreakdown : null;
  const storedTotal = srcSave.totalXP !== undefined ? Number(srcSave.totalXP) : null;
  const storedSpent = Number(getPath(srcSave, "shop.spent") || 0);

  const componentDiffs = XP_COMPONENTS.filter(
    (k) => !storedBreakdown || Number(storedBreakdown[k]) !== Number(dLegacy.xpBreakdown[k])
  );
  const totalDiffers = storedTotal === null || storedTotal !== Number(dLegacy.totalXP);
  const spentDiffers = storedSpent !== Number(dLegacy.coins.spent);
  const reconciled = componentDiffs.length === 0 && !totalDiffers && !spentDiffers;

  /* ------------------------------------------- candado 2: checksum shape -- */
  const missingFields = SAVE_FIELDS.filter((f) => !has(srcSave, f.name)).map((f) => f.name);
  const missingKeys = SIBLING_KEYS.filter((k) => !has(srcKeys, k.key)).map((k) => k.key);
  const missingCriticals = CRITICAL_FIELDS.filter((f) => !has(srcSave, f));
  const checksumOk = missingFields.length === 0 && missingKeys.length === 0 && missingCriticals.length === 0;

  /* ------------------------------------------------------- reporte -------- */
  const report = {
    referenceDate,
    totals: {
      totalXP: { stored: storedTotal, recomputed: dLegacy.totalXP, ok: !totalDiffers },
      xpBreakdown: {
        stored: clone(storedBreakdown),
        recomputed: dLegacy.xpBreakdown,
        diffs: componentDiffs,
        ok: componentDiffs.length === 0
      },
      shop: {
        spent: { stored: storedSpent, recomputed: dLegacy.coins.spent, ok: !spentDiffers },
        coins: dLegacy.coins
      }
    },
    missing: { fields: missingFields, keys: missingKeys, criticals: missingCriticals },
    criticals: Object.fromEntries(CRITICAL_FIELDS.map((f) => [f, has(srcSave, f)]))
  };

  const failedChecks = [
    ...componentDiffs.map((k) => `XP_COMPONENT_${k.toUpperCase()}`),
    ...(totalDiffers ? ["XP_TOTAL"] : []),
    ...(spentDiffers ? ["SHOP_SPENT"] : []),
    ...missingCriticals.map((f) => `CRITICAL_${f.toUpperCase()}`),
    ...missingFields.map((f) => `FIELD_MISSING_${f}`),
    ...missingKeys.map((k) => `KEY_MISSING_${k}`)
  ];

  const state = !reconciled ? "aborted" : checksumOk ? "active" : "quarantine";

  bundle2.import = {
    state,
    checksumOk,
    reconciled,
    attemptedAt: migratedAt,
    acceptedAt: null,
    acceptedChecks: [],
    failedChecks,
    report,
    backup: null
  };

  core.derived.coins = dMigrated.coins;
  bundle2.migration.importCheck = {
    ok: reconciled && checksumOk,
    stored: { totalXP: storedTotal, xpBreakdown: clone(storedBreakdown), shopSpent: storedSpent },
    recomputed: { totalXP: dLegacy.totalXP, xpBreakdown: dLegacy.xpBreakdown, shopSpent: dLegacy.coins.spent },
    recomputedFromMigrated: { totalXP: dMigrated.totalXP, xpBreakdown: dMigrated.xpBreakdown },
    parityOk:
      dMigrated.totalXP === dLegacy.totalXP &&
      XP_COMPONENTS.every((k) => dMigrated.xpBreakdown[k] === dLegacy.xpBreakdown[k])
  };

  return bundle2;
}

/** Reconstruye una vista legacy mínima (para tests de no-pérdida / diff). */
export function legacyProjection(bundle2) {
  const c = bundle2.core || {};
  const w = bundle2.worlds || {};
  const l = (bundle2.legacy && bundle2.legacy.keys) || {};
  const allKeys = { ...w, ...l };
  return {
    _format: "odea_bundle_v2",
    appVersion: (bundle2.migratedFrom && bundle2.migratedFrom.appVersion) || null,
    save: {
      playerName: getPath(c, "identity.playerName"),
      completedMissions: getPath(c, "progress.completedMissions"),
      completedDaily: getPath(c, "progress.completedDaily"),
      completedWeekly: getPath(c, "progress.completedWeekly"),
      completedJobs: getPath(c, "progress.completedJobs"),
      completedB2b: getPath(c, "progress.completedB2b"),
      completedPuente: getPath(c, "progress.completedPuente"),
      unlockedAch: getPath(c, "progress.unlockedAch"),
      startDate: getPath(c, "identity.startDate"),
      lastDailyDate: getPath(c, "identity.lastDailyDate"),
      streak: getPath(c, "identity.streak"),
      shieldWeek: getPath(c, "identity.shieldWeek"),
      vida: c.vida,
      capital: c.capital,
      gods: c.gods,
      shop: c.shop,
      sound: getPath(c, "identity.sound"),
      reto: c.reto,
      rewards: c.gear,
      planner: c.planner,
      diary: c.diary,
      activity: c.activity,
      freezers: getPath(c, "identity.freezers"),
      applications: getPath(c, "progress.applications"),
      focus: c.focus,
      hunt: c.hunt,
      saveVersion: bundle2.migratedFrom ? bundle2.migratedFrom.saveVersion : null,
      eventRL: getPath(c, "credits.eventRL"),
      farm: getPath(c, "credits.farm"),
      canje: getPath(c, "realRewards.canje"),
      xpBreakdown: getPath(c, "derived.xpBreakdown"),
      totalXP: getPath(c, "derived.totalXP"),
      campaignLevel: getPath(c, "derived.campaignLevel"),
      level: getPath(c, "derived.level"),
      odeLevel: getPath(c, "derived.odeLevel"),
      stats: c.stats
    },
    keys: Object.fromEntries(Object.entries(allKeys).map(([, def]) => [def.legacyKey, def.data]))
  };
}

export { CRITICAL_TARGETS };
