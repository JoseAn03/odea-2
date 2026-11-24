/**
 * validate.js — Validación de la migración (falla cerrado, sin pérdidas silenciosas)
 * ---------------------------------------------------------------------------
 * Reglas verificadas:
 *  1. Ningún campo ni clave se pierde sin registro.
 *  2. totalXP y cada componente de xpBreakdown idénticos antes y después.
 *  3. shop.spent, eventRL, farm y canje sobreviven intactos.
 *  4. La re-derivación desde las fuentes migradas coincide con la guardada.
 *  5. Campos/claves desconocidos se preservan en migration.unmapped.
 *  6. El bundle respeta las tres secciones (core / worlds / legacy).
 *  7. La huella del origen está registrada y la importación tiene estado válido.
 *
 * Nota sobre cuarentena: un bundle en cuarentena NO es válido para jugar
 * (`ok: false`) hasta que el usuario lo acepte explícitamente. Aceptarlo
 * registra los checks fallidos en `import.acceptedChecks`; no los "repara".
 */
import {
  SAVE_FIELDS,
  SIBLING_KEYS,
  CRITICAL_FIELDS,
  CRITICAL_TARGETS,
  BUNDLE_SECTIONS,
  PLAY_VERSION,
  fingerprintOf,
  deepEqual,
  getPath
} from "./shape.js";
import { derive, deriveStreak, isoWeekKey, sourcesFromLegacy, sourcesFromMigrated } from "./derive.js";
import { missionOf, PHASE3_SYSTEMS } from "./catalog.js";
import { campaignProblems } from "./campaign-state.js";
import { garageProblems } from "./garage-state.js";
import { ianProblems } from "./ian-state.js";
import { jarvisProblems } from "./jarvis-state.js";
import { libretaProblems } from "./libreta-state.js";
import { marcaProblems } from "./marca-state.js";
import { inglesProblems } from "./ingles-state.js";
import { realesProblems } from "./reales-state.js";
import { contratoProblems } from "./contrato-state.js";
import { rachaProblems } from "./racha-state.js";
import { paquetesProblems } from "./paquetes-state.js";
import { legendarioProblems } from "./legendario-state.js";
import { occurrenceKey } from "./gameplay.js";
import { loadOdea2 } from "./storage.js";
import { legacyProjection, XP_COMPONENTS } from "./migrate.js";

function check(id, ok, detail) {
  return { id, ok: !!ok, detail: detail || "" };
}

function has(obj, key) {
  return obj != null && Object.prototype.hasOwnProperty.call(obj, key);
}

/**
 * Base estructural COMPARTIDA entre la validación de migración y la de
 * gameplay (Fase 3). Devuelve los mismos tres checks con los mismos ids:
 * `FORMAT`, `SECTIONS`, `IMPORT_STATE`.
 *
 * `validateMigration` los inserta en su orden histórico (0 y 8); la validación
 * de gameplay los usa como base. Así los dos validadores no se desincronizan.
 */
export function bundleBaseChecks(bundle2) {
  const format = check(
    "FORMAT",
    bundle2 && bundle2._format === "odea2_bundle_v1" && bundle2.schemaVersion === 1,
    `format=${bundle2 && bundle2._format} schemaVersion=${bundle2 && bundle2.schemaVersion}`
  );

  const sectionOk =
    bundle2 &&
    BUNDLE_SECTIONS.every((s) => bundle2[s] && typeof bundle2[s] === "object") &&
    !has(bundle2, "save");
  const sections = check(
    "SECTIONS",
    sectionOk,
    sectionOk
      ? `secciones ${BUNDLE_SECTIONS.join("/")} presentes; sin \`save\` en la raíz`
      : `secciones incompletas o \`save\` en la raíz: ${bundle2 ? Object.keys(bundle2).join(", ") : "sin bundle"}`
  );

  const imp = (bundle2 && bundle2.import) || {};
  const failed = Array.isArray(imp.failedChecks) ? imp.failedChecks : [];
  const accepted = Array.isArray(imp.acceptedChecks) ? imp.acceptedChecks : [];
  const acceptedCovers = failed.every((f) => accepted.includes(f));
  const stateOk = imp.state === "active" && acceptedCovers && imp.reconciled === true;
  const importState = check(
    "IMPORT_STATE",
    stateOk,
    imp.state === "quarantine"
      ? `EN CUARENTENA: pendiente de aceptación explícita. Checks fallidos: ${failed.join(", ") || "—"}`
      : imp.state === "aborted"
        ? `ABORTADA: los totales no reconcilian (${failed.join(", ") || "sin detalle"})`
        : !imp.reconciled
          ? "totales sin reconciliar"
          : `state=${imp.state} accepted=${accepted.length}`
  );

  return { format, sections, importState, imp };
}

/**
 * @param {object} legacy  bundle original odea_bundle_v2
 * @param {object} migrated bundle odea2_bundle_v1 producido por migrateBundle
 * @param {object} catalog data/xp-catalog.json
 * @param {object} [opts] { referenceDate, requireBackup }
 * @returns {{ ok: boolean, state: string|null, accepted: boolean, checks: Array, errors: string[] }}
 */
export function validateMigration(legacy, migrated, catalog, opts = {}) {
  const checks = [];
  const srcSave = (legacy && legacy.save) || {};
  const srcKeys = (legacy && legacy.keys) || {};
  const ref = opts.referenceDate || (migrated && migrated.migration && migrated.migration.referenceDate) || srcSave.lastDailyDate;
  const base = bundleBaseChecks(migrated);

  /* ---------- 0. Formato y secciones ---------- */
  checks.push(base.format, base.sections);

  /* ---------- 1. Cobertura de los 36 campos ---------- */
  const decisions = (migrated.migration && migrated.migration.decisions) || [];
  const decisionBySource = new Map();
  for (const d of decisions) {
    if (decisionBySource.has(d.source)) {
      checks.push(check("FIELD_DUPLICATE_DECISION", false, `decisión duplicada para ${d.source}`));
    }
    decisionBySource.set(d.source, d);
  }

  const missingKnown = SAVE_FIELDS.filter((f) => !decisionBySource.has(`save.${f.name}`)).map((f) => f.name);
  checks.push(check(
    "FIELD_DECISIONS_COMPLETE",
    missingKnown.length === 0,
    missingKnown.length ? `sin decisión: ${missingKnown.join(", ")}` : "36/36 campos con decisión"
  ));

  const unmappedFields = (migrated.migration && migrated.migration.unmapped && migrated.migration.unmapped.fields) || {};
  const unregisteredFields = Object.keys(srcSave).filter(
    (k) => !SAVE_FIELDS.some((f) => f.name === k) && !has(unmappedFields, k)
  );
  checks.push(check(
    "FIELD_UNKNOWN_PRESERVED",
    unregisteredFields.length === 0,
    unregisteredFields.length ? `campos no registrados: ${unregisteredFields.join(", ")}` : "sin campos huérfanos"
  ));

  /* Cada campo presente debe existir en su destino y ser idéntico. */
  const fieldMismatches = [];
  for (const f of SAVE_FIELDS) {
    if (!has(srcSave, f.name)) continue;
    if (f.name === "saveVersion") {
      const got = getPath(migrated, "migratedFrom.saveVersion");
      if (!deepEqual(got, srcSave.saveVersion)) fieldMismatches.push(`saveVersion: ${got} != ${srcSave.saveVersion}`);
      continue;
    }
    const got = getPath(migrated, f.target);
    if (!deepEqual(got, srcSave[f.name])) {
      fieldMismatches.push(`${f.name} → ${f.target}`);
    }
  }
  checks.push(check(
    "FIELD_VALUES_IDENTICAL",
    fieldMismatches.length === 0,
    fieldMismatches.length ? `diferencias en: ${fieldMismatches.join("; ")}` : "todos los valores migrados son idénticos"
  ));

  /* ---------- 2. Cobertura de las 11 claves ---------- */
  const declaredWorlds = (migrated.migration && migrated.migration.worlds) || {};
  const missingWorlds = SIBLING_KEYS.filter((k) => has(srcKeys, k.key) && !declaredWorlds[k.name]).map((k) => k.key);
  checks.push(check(
    "KEY_DECISIONS_COMPLETE",
    missingWorlds.length === 0,
    missingWorlds.length ? `sin decisión: ${missingWorlds.join(", ")}` : "11/11 claves con decisión"
  ));

  /* Cada clave debe vivir en la sección que le corresponde. */
  const sectionDiffs = [];
  for (const def of SIBLING_KEYS) {
    if (!has(srcKeys, def.key)) continue;
    const inWorlds = !!(migrated.worlds && migrated.worlds[def.name]);
    const inLegacy = !!(migrated.legacy && migrated.legacy.keys && migrated.legacy.keys[def.name]);
    if (def.section === "worlds" && !(inWorlds && !inLegacy)) sectionDiffs.push(`${def.key} debe estar en worlds`);
    if (def.section === "legacy" && !(inLegacy && !inWorlds)) sectionDiffs.push(`${def.key} debe estar en legacy`);
  }
  checks.push(check(
    "KEY_SECTION_ASSIGNMENT",
    sectionDiffs.length === 0,
    sectionDiffs.length ? sectionDiffs.join("; ") : "8 claves activas en worlds y 3 archivadas en legacy"
  ));

  const unmappedKeys = (migrated.migration && migrated.migration.unmapped && migrated.migration.unmapped.keys) || {};
  const unregisteredKeys = Object.keys(srcKeys).filter(
    (k) => !SIBLING_KEYS.some((d) => d.key === k) && !has(unmappedKeys, k)
  );
  checks.push(check(
    "KEY_UNKNOWN_PRESERVED",
    unregisteredKeys.length === 0,
    unregisteredKeys.length ? `claves no registradas: ${unregisteredKeys.join(", ")}` : "sin claves huérfanas"
  ));

  const keyMismatches = [];
  for (const def of SIBLING_KEYS) {
    if (!has(srcKeys, def.key)) continue;
    const container = def.section === "worlds" ? (migrated.worlds || {}) : ((migrated.legacy && migrated.legacy.keys) || {});
    const world = container[def.name];
    if (!world) { keyMismatches.push(`${def.key}: sin entrada`); continue; }
    if (world.legacyKey !== def.key) keyMismatches.push(`${def.key}: legacyKey=${world.legacyKey}`);
    if (world.lifecycle !== def.lifecycle) keyMismatches.push(`${def.key}: lifecycle=${world.lifecycle}`);
    if (!deepEqual(world.data, srcKeys[def.key])) keyMismatches.push(`${def.key}: data distinta`);
  }
  checks.push(check(
    "KEY_VALUES_IDENTICAL",
    keyMismatches.length === 0,
    keyMismatches.length ? keyMismatches.join("; ") : "las 11 claves son idénticas"
  ));

  /* ---------- 3. Críticos: eventRL, farm, canje ---------- */
  for (const name of CRITICAL_FIELDS) {
    const target = CRITICAL_TARGETS[name];
    const sourcePresent = has(srcSave, name);
    const got = getPath(migrated, target);
    const ok = sourcePresent && got != null && deepEqual(got, srcSave[name]);
    checks.push(check(
      `CRITICAL_${name.toUpperCase()}`,
      ok,
      ok ? "sobrevive intacto"
        : !sourcePresent ? `FUENTE AUSENTE: save.${name}`
        : got == null ? `DESTINO VACÍO: ${target}`
        : `${target} difiere de save.${name}`
    ));
  }

  /* ---------- 4. shop.spent ---------- */
  const spentOk = deepEqual(getPath(migrated, "core.shop.spent"), getPath(legacy, "save.shop.spent"));
  checks.push(check(
    "SHOP_SPENT",
    spentOk,
    spentOk ? `spent=${getPath(migrated, "core.shop.spent")}` : `spent migrado=${getPath(migrated, "core.shop.spent")} original=${getPath(legacy, "save.shop.spent")}`
  ));

  /* ---------- 5. Paridad de XP (10 componentes + total) ---------- */
  const dLegacy = derive(sourcesFromLegacy(legacy), catalog, ref);
  const dMigrated = derive(sourcesFromMigrated(migrated), catalog, ref);
  const stored = srcSave.xpBreakdown || {};

  /* 5a. El oráculo reproduce el bundle original (integridad de la referencia). */
  const oracleDiffs = XP_COMPONENTS.filter((k) => Number(stored[k]) !== Number(dLegacy.xpBreakdown[k]));
  checks.push(check(
    "XP_ORACLE_MATCHES_SOURCE",
    oracleDiffs.length === 0 && Number(srcSave.totalXP) === Number(dLegacy.totalXP),
    oracleDiffs.length
      ? `oráculo vs guardado: ${oracleDiffs.map((k) => `${k}=${stored[k]}≠${dLegacy.xpBreakdown[k]}`).join(", ")}`
      : `oráculo = guardado (total ${dLegacy.totalXP})`
  ));

  /* 5b. Componente por componente: antes == después (fuentes migradas). */
  const parityDiffs = XP_COMPONENTS.filter((k) => Number(dLegacy.xpBreakdown[k]) !== Number(dMigrated.xpBreakdown[k]));
  checks.push(check(
    "XP_COMPONENTS_IDENTICAL",
    parityDiffs.length === 0,
    parityDiffs.length
      ? parityDiffs.map((k) => `${k}: ${dLegacy.xpBreakdown[k]}→${dMigrated.xpBreakdown[k]}`).join(", ")
      : XP_COMPONENTS.map((k) => `${k}=${dMigrated.xpBreakdown[k]}`).join(" ")
  ));

  /* 5c. totalXP idéntico. */
  checks.push(check(
    "XP_TOTAL_IDENTICAL",
    Number(dLegacy.totalXP) === Number(dMigrated.totalXP),
    `antes=${dLegacy.totalXP} después=${dMigrated.totalXP}`
  ));

  /* 5d. Snapshot derivado preservado tal cual en el bundle migrado. */
  const snapshotOk =
    deepEqual(getPath(migrated, "core.derived.xpBreakdown"), srcSave.xpBreakdown) &&
    Number(getPath(migrated, "core.derived.totalXP")) === Number(srcSave.totalXP);
  checks.push(check(
    "XP_SNAPSHOT_PRESERVED",
    snapshotOk,
    snapshotOk ? "xpBreakdown y totalXP guardados intactos" : "el snapshot derivado cambió"
  ));

  /* 5e. Niveles derivados. */
  const levelsOk =
    Number(getPath(migrated, "core.derived.campaignLevel")) === Number(dMigrated.campaignLevel) &&
    Number(getPath(migrated, "core.derived.odeLevel")) === Number(dMigrated.odeLevel);
  checks.push(check(
    "LEVELS_IDENTICAL",
    levelsOk,
    `campaignLevel=${dMigrated.campaignLevel} odeLevel=${dMigrated.odeLevel}`
  ));

  /* ---------- 6. Monedas ---------- */
  const coinsOk =
    dLegacy.coins.earned === dMigrated.coins.earned &&
    dLegacy.coins.spent === dMigrated.coins.spent &&
    dLegacy.coins.balance === dMigrated.coins.balance;
  checks.push(check(
    "COINS_IDENTICAL",
    coinsOk,
    `antes earned=${dLegacy.coins.earned} spent=${dLegacy.coins.spent} balance=${dLegacy.coins.balance} · después earned=${dMigrated.coins.earned} spent=${dMigrated.coins.spent} balance=${dMigrated.coins.balance}`
  ));

  /* ---------- 7. Huella del origen ---------- */
  const fpExpected = fingerprintOf(legacy);
  const fpOk = deepEqual(migrated.sourceFingerprint, fpExpected);
  checks.push(check(
    "SOURCE_FINGERPRINT",
    fpOk,
    fpOk
      ? `huella ${fpExpected.digest} · appVersion ${fpExpected.appVersion} · totalXP ${fpExpected.totalXP} · lastDailyDate ${fpExpected.lastDailyDate}`
      : "la huella del origen no coincide o falta"
  ));

  /* ---------- 8. Estado de importación ---------- */
  const imp = base.imp;
  checks.push(base.importState);

  /* ---------- 9. Backup previo a la escritura ---------- */
  if (opts.requireBackup) {
    const b = imp.backup;
    checks.push(check(
      "BACKUP_RECORDED",
      !!(b && b.key && b.digest),
      b ? `backup=${b.key}` : "no se registró backup del bundle original"
    ));
  }

  /* ---------- 10. Prueba agregada de no-pérdida (proyección legacy) ---------- */
  const projection = legacyProjection(migrated);
  const projDiffs = [];
  for (const f of SAVE_FIELDS) {
    if (f.name === "saveVersion") continue;
    if (!has(srcSave, f.name)) continue;
    if (!deepEqual(projection.save[f.name], srcSave[f.name])) projDiffs.push(f.name);
  }
  for (const def of SIBLING_KEYS) {
    if (!has(srcKeys, def.key)) continue;
    if (!deepEqual(projection.keys[def.key], srcKeys[def.key])) projDiffs.push(def.key);
  }
  checks.push(check(
    "NO_LOSS_PROJECTION",
    projDiffs.length === 0,
    projDiffs.length ? `se perderían: ${projDiffs.join(", ")}` : "proyección legacy idéntica al original"
  ));

  const errors = checks.filter((c) => !c.ok).map((c) => `${c.id}: ${c.detail}`);
  return {
    ok: errors.length === 0,
    state: imp.state || null,
    accepted: imp.state === "active" && (imp.acceptedChecks || []).length > 0,
    checks,
    errors
  };
}

export function assertValidMigration(legacy, migrated, catalog, opts = {}) {
  const report = validateMigration(legacy, migrated, catalog, opts);
  if (!report.ok) {
    const err = new Error("Migración inválida:\n" + report.errors.join("\n"));
    err.name = "MigrationValidationError";
    err.report = report;
    throw err;
  }
  return report;
}

/* ========================================================================== */
/* Fase 3 — validación de la sección aditiva de gameplay                      */
/* ========================================================================== */

function stripDerived(bundle2) {
  const core = { ...((bundle2 && bundle2.core) || {}) };
  delete core.derived;
  return core;
}

function isDateKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Compara la parte migrada contra el bundle persistido anterior. */
export function migratedUnchanged(draft, previous) {
  if (!previous) return [check("MIGRATED_UNCHANGED", true, "sin bundle previo: no hay paridad que exigir")];
  const sameCore = deepEqual(stripDerived(draft), stripDerived(previous));
  const sameWorlds = deepEqual(draft.worlds, previous.worlds);
  const sameLegacy = deepEqual(draft.legacy, previous.legacy);
  const ok = sameCore && sameWorlds && sameLegacy;
  return [
    check(
      ok ? "MIGRATED_UNCHANGED" : "IMMUTABLE_CHANGED",
      ok,
      ok ? "core (salvo derived), worlds y legacy intactos" : "la mutación tocó datos migrados"
    )
  ];
}

/** Capa aditiva: SOLO la forma y la coherencia de `play`. */
export function validatePlaySection(bundle2, catalog) {
  const checks = [];
  const play = bundle2 && bundle2.play;

  if (play == null) {
    checks.push(check("PLAY_PRESENT", true, "sin sección play: bundle migrado válido"));
    return checks;
  }

  const plain = typeof play === "object" && !Array.isArray(play);
  checks.push(check("PLAY_SHAPE", plain, plain ? "play es un objeto plano" : "play no es un objeto plano"));
  if (!plain) return checks;

  /* Se aceptan bundles aditivos v1 (anteriores a R1, sin recompensa congelada)
     y v2. Una versión MAYOR se rechaza en la ruta de mutación: un cliente viejo
     no debe sobrescribir datos que no entiende. */
  const versionOk = play.version === 1 || play.version === PLAY_VERSION;
  checks.push(
    check(
      "PLAY_VERSION",
      versionOk,
      `version=${play.version} aceptadas=1,${PLAY_VERSION}`
    )
  );

  const completions = play.completions;
  const checkins = play.checkins;
  checks.push(
    check(
      "PLAY_MAPS",
      !!completions && typeof completions === "object" && !Array.isArray(completions) &&
        !!checkins && typeof checkins === "object" && !Array.isArray(checkins),
      "completions y checkins deben ser mapas"
    )
  );

  const problems = [];
  const seen = new Set();
  for (const [key, record] of Object.entries(completions || {})) {
    if (!record || typeof record !== "object") {
      problems.push(`${key}: registro inválido`);
      continue;
    }
    if (typeof record.missionId !== "string") problems.push(`${key}: missionId`);
    if (!isDateKey(record.date)) problems.push(`${key}: date`);
    if (typeof record.at !== "string" || Number.isNaN(Date.parse(record.at))) problems.push(`${key}: at`);
    if (!PHASE3_SYSTEMS.includes(record.system)) problems.push(`${key}: system`);

    const mission = missionOf(catalog, record.system, record.missionId);
    if (!mission) {
      problems.push(`${key}: missionId desconocido`);
      continue;
    }
    const expected = occurrenceKey(record.missionId, mission.cls, record.date);
    if (key !== expected) problems.push(`${key}: occurrenceKey esperada ${expected}`);
    if (mission.cls === "one") {
      if (record.period != null) problems.push(`${key}: misión única sin period`);
    } else {
      const expectedPeriod = mission.cls === "weekly" ? isoWeekKey(record.date) : record.date;
      if (record.period !== expectedPeriod) problems.push(`${key}: period esperada ${expectedPeriod}`);
    }

    const occurrence = `${record.missionId}|${record.period || ""}`;
    if (seen.has(occurrence)) problems.push(`${key}: ocurrencia duplicada`);
    seen.add(occurrence);

    /* R1: la recompensa congelada debe ser coherente y legible. */
    if (record.reward != null) {
      if (play.version === 1) {
        problems.push(`${key}: reward no permitido en play v1`);
      } else if (!record.reward || typeof record.reward !== "object" || Array.isArray(record.reward)) {
        problems.push(`${key}: reward inválido`);
      } else {
        const r = record.reward;
        if (!Number.isFinite(Number(r.xp)) || Number(r.xp) < 0) problems.push(`${key}: reward.xp`);
        if (!Number.isInteger(Number(r.coins)) || Number(r.coins) < 0) problems.push(`${key}: reward.coins`);
        if (r.cat != null && typeof r.cat !== "string") problems.push(`${key}: reward.cat`);
        if (!Number.isInteger(record.rulesVersion) || record.rulesVersion < 1) {
          problems.push(`${key}: rulesVersion`);
        }
      }
    }
  }

  for (const [date, record] of Object.entries(checkins || {})) {
    if (!isDateKey(date)) problems.push(`checkin ${date}: fecha`);
    if (!record || typeof record !== "object" || typeof record.at !== "string" || Number.isNaN(Date.parse(record.at))) {
      problems.push(`checkin ${date}: at`);
    }
  }

  /* Academia: estado aditivo opcional (sinergias, delta de monedas y rutas). */
  if (play.academia != null) {
    const ac = play.academia;
    if (!ac || typeof ac !== "object" || Array.isArray(ac)) {
      problems.push("academia: debe ser un objeto");
    } else {
      if (ac.sinergias != null) {
        if (typeof ac.sinergias !== "object" || Array.isArray(ac.sinergias)) {
          problems.push("academia.sinergias: debe ser un mapa");
        } else {
          for (const [key, value] of Object.entries(ac.sinergias)) {
            if (!Number.isInteger(Number(value)) || Number(value) < 0) {
              problems.push(`academia.sinergias.${key}: entero >= 0`);
            }
          }
        }
      }
      if (ac.monedasGanadas != null) {
        if (!Number.isInteger(Number(ac.monedasGanadas)) || Number(ac.monedasGanadas) < 0) {
          problems.push("academia.monedasGanadas: entero >= 0");
        }
      }
      if (ac.rutas != null) {
        if (!Array.isArray(ac.rutas) || ac.rutas.some((r) => typeof r !== "string")) {
          problems.push("academia.rutas: lista de ids");
        }
      }
    }
  }

  /* Tienda: estado aditivo opcional (ítems, atuendo/vehículo, gasto). */
  if (play.tienda != null) {
    const t = play.tienda;
    if (!t || typeof t !== "object" || Array.isArray(t)) {
      problems.push("tienda: debe ser un objeto");
    } else {
      if (t.owned != null && (!Array.isArray(t.owned) || t.owned.some((id) => typeof id !== "string"))) {
        problems.push("tienda.owned: lista de ids");
      }
      if (t.outfit != null && typeof t.outfit !== "string") {
        problems.push("tienda.outfit: id de atuendo");
      }
      if (t.vehicle != null && typeof t.vehicle !== "string") {
        problems.push("tienda.vehicle: id de vehículo o null");
      }
      if (t.spent != null && (!Number.isInteger(Number(t.spent)) || Number(t.spent) < 0)) {
        problems.push("tienda.spent: entero >= 0");
      }
    }
  }

  problems.push(...campaignProblems(bundle2));
  problems.push(...garageProblems(bundle2));
  problems.push(...ianProblems(bundle2));
  problems.push(...jarvisProblems(bundle2));
  problems.push(...libretaProblems(bundle2));
  problems.push(...marcaProblems(bundle2));
  problems.push(...inglesProblems(bundle2));
  problems.push(...realesProblems(bundle2));
  problems.push(...contratoProblems(bundle2));
  problems.push(...rachaProblems(bundle2));
  problems.push(...paquetesProblems(bundle2));
  problems.push(...legendarioProblems(bundle2));
  checks.push(
    check(
      "PLAY_RECORDS",
      problems.length === 0,
      problems.length ? problems.join("; ") : `${Object.keys(completions || {}).length} completaciones, ${Object.keys(checkins || {}).length} check-ins`
    )
  );

  return checks;
}

function derivedMatches(draft, catalog) {
  const ref = draft.migration && draft.migration.referenceDate;
  const d = derive(sourcesFromMigrated(draft, catalog), catalog, ref);
  const streak = deriveStreak(draft);
  const snapshot = (draft.core && draft.core.derived) || {};

  const problems = [];
  if (Number(snapshot.totalXP) !== Number(d.totalXP)) problems.push("totalXP");
  if (!deepEqual(snapshot.xpBreakdown, d.xpBreakdown)) problems.push("xpBreakdown");
  if (Number(snapshot.campaignLevel) !== Number(d.campaignLevel)) problems.push("campaignLevel");
  if (Number(snapshot.odeLevel) !== Number(d.odeLevel)) problems.push("odeLevel");
  if (Number(snapshot.streak) !== Number(streak.streak)) problems.push("streak");
  if ((snapshot.streakDate || null) !== (streak.streakDate || null)) problems.push("streakDate");

  return { ok: problems.length === 0, problems, derived: d, streak };
}

/**
 * Validación de una escritura de gameplay. NO es un fork de `validateMigration`:
 *   1. base estructural compartida (`bundleBaseChecks`),
 *   2. validación runtime existente (`loadOdea2`: formato, save activo, drift),
 *   3. capa aditiva (`validatePlaySection`),
 *   4. parte migrada intacta (`migratedUnchanged`).
 * Devuelve `{ ok, checks, errors, derived, streak }`.
 */
export function validatePlayState(draft, catalog, opts = {}) {
  const checks = [];
  const base = bundleBaseChecks(draft);
  checks.push(base.format, base.sections, base.importState);

  let runtimeOk = true;
  let runtimeDetail = "loadOdea2 válido";
  try {
    loadOdea2(draft, catalog);
  } catch (error) {
    runtimeOk = false;
    runtimeDetail = error.message;
  }
  checks.push(check("RUNTIME_LOAD", runtimeOk, runtimeDetail));

  checks.push(...validatePlaySection(draft, catalog));

  const derived = derivedMatches(draft, catalog);
  checks.push(
    check(
      "DERIVED_MATCH",
      derived.ok,
      derived.ok ? `totalXP=${derived.derived.totalXP} streak=${derived.streak.streak}` : `desajuste en ${derived.problems.join(", ")}`
    )
  );

  checks.push(...migratedUnchanged(draft, opts.previous));

  const errors = checks.filter((c) => !c.ok).map((c) => `${c.id}: ${c.detail}`);
  return {
    ok: errors.length === 0,
    checks,
    errors,
    derived: derived.derived,
    streak: derived.streak
  };
}

/** Traduce un reporte fallido de `validatePlayState` al código de error tipado. */
export function playFailureCode(report) {
  const failed = (report.checks || []).filter((c) => !c.ok).map((c) => c.id);
  if (failed.includes("IMMUTABLE_CHANGED")) return "IMMUTABLE_CHANGED";
  if (failed.includes("DERIVED_MATCH")) return "DERIVE_DRIFT";
  if (failed.includes("RUNTIME_LOAD") && (report.errors || []).some((e) => /^RUNTIME_LOAD: XP_DRIFT/.test(e))) {
    return "DERIVE_DRIFT";
  }
  return "SCHEMA_INVALID";
}
