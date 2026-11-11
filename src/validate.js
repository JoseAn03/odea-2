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
  fingerprintOf,
  deepEqual,
  getPath
} from "./shape.js";
import { derive, sourcesFromLegacy, sourcesFromMigrated } from "./derive.js";
import { legacyProjection, XP_COMPONENTS } from "./migrate.js";

function check(id, ok, detail) {
  return { id, ok: !!ok, detail: detail || "" };
}

function has(obj, key) {
  return obj != null && Object.prototype.hasOwnProperty.call(obj, key);
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

  /* ---------- 0. Formato y secciones ---------- */
  checks.push(check(
    "FORMAT",
    migrated && migrated._format === "odea2_bundle_v1" && migrated.schemaVersion === 1,
    `format=${migrated && migrated._format} schemaVersion=${migrated && migrated.schemaVersion}`
  ));

  const sectionOk =
    migrated &&
    BUNDLE_SECTIONS.every((s) => migrated[s] && typeof migrated[s] === "object") &&
    !has(migrated, "save");
  checks.push(check(
    "SECTIONS",
    sectionOk,
    sectionOk
      ? `secciones ${BUNDLE_SECTIONS.join("/")} presentes; sin \`save\` en la raíz`
      : `secciones incompletas o \`save\` en la raíz: ${migrated ? Object.keys(migrated).join(", ") : "sin bundle"}`
  ));

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
  const imp = migrated.import || {};
  const failed = Array.isArray(imp.failedChecks) ? imp.failedChecks : [];
  const accepted = Array.isArray(imp.acceptedChecks) ? imp.acceptedChecks : [];
  const acceptedCovers = failed.every((f) => accepted.includes(f));
  const stateOk = imp.state === "active" && acceptedCovers && imp.reconciled === true;
  checks.push(check(
    "IMPORT_STATE",
    stateOk,
    imp.state === "quarantine"
      ? `EN CUARENTENA: pendiente de aceptación explícita. Checks fallidos: ${failed.join(", ") || "—"}`
      : imp.state === "aborted"
        ? `ABORTADA: los totales no reconcilian (${failed.join(", ") || "sin detalle"})`
        : !imp.reconciled
          ? "totales sin reconciliar"
          : `state=${imp.state} accepted=${accepted.length}`
  ));

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
    accepted: imp.state === "active" && accepted.length > 0,
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
