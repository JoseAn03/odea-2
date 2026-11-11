/**
 * migration.test.js — Tests de validación de la migración ODEA 1 → ODEA 2
 * Ejecutar: npm test   (node --test)
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { migrateBundle, legacyProjection, XP_COMPONENTS, MigrationError } from "../src/migrate.js";
import { validateMigration } from "../src/validate.js";
import {
  SAVE_FIELDS,
  SIBLING_KEYS,
  ACTIVE_WORLD_KEYS,
  LEGACY_KEYS,
  CRITICAL_FIELDS,
  fingerprintOf,
  deepEqual
} from "../src/shape.js";
import {
  STORAGE_KEYS,
  createMemoryStorage,
  importBundle,
  acceptQuarantine,
  rejectQuarantine,
  resetAndReimport,
  loadOdea2,
  saveOdea2,
  readOdea2,
  readQuarantine
} from "../src/storage.js";
import { sourcesFromLegacy, sourcesFromMigrated, derive } from "../src/derive.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const FIXTURE_PATH = join(root, "fixtures", "odea-progreso-sintetico.json");
const CATALOG_PATH = join(root, "data", "xp-catalog.json");

/** Fecha de referencia del fixture: fija las derivaciones de calendario. */
const REFERENCE_DATE = "2026-11-10";
const MIGRATED_AT = "2026-11-10T12:00:00.000Z";

function loadFixture() {
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));
}
function loadCatalog() {
  return JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
}
function migrate(fixture, catalog, extra = {}) {
  return migrateBundle(fixture, {
    catalog,
    referenceDate: REFERENCE_DATE,
    migratedAt: MIGRATED_AT,
    ...extra
  });
}
function reportIds(report) {
  return report.checks.filter((c) => !c.ok).map((c) => c.id);
}
function validate(fixture, migrated, catalog) {
  return validateMigration(fixture, migrated, catalog, { referenceDate: REFERENCE_DATE });
}
function backupKeys(storage) {
  return storage._keys().filter((k) => k.startsWith(STORAGE_KEYS.backupPrefix));
}

/* ========================================================================== */
/* 1. Forma del fixture y del contrato                                        */
/* ========================================================================== */
test("fixture: tiene exactamente 36 campos de save y 11 claves", () => {
  const f = loadFixture();
  assert.equal(f._format, "odea_bundle_v2");
  assert.equal(f.appVersion, "5.99");
  assert.equal(Object.keys(f.save).length, 36);
  assert.deepEqual(Object.keys(f.save).sort(), SAVE_FIELDS.map((x) => x.name).sort());
  assert.equal(Object.keys(f.keys).length, 11);
  assert.deepEqual(Object.keys(f.keys).sort(), SIBLING_KEYS.map((x) => x.key).sort());
});

test("fixture: los críticos tienen datos (el test negativo sería trivial si no)", () => {
  const f = loadFixture();
  for (const name of CRITICAL_FIELDS) {
    const value = f.save[name];
    assert.ok(value, `falta ${name}`);
    assert.ok(Array.isArray(value.log) && value.log.length > 0, `${name}.log sin datos`);
  }
});

test("contrato: 8 claves activas en worlds y 3 archivadas en legacy", () => {
  assert.equal(ACTIVE_WORLD_KEYS.length, 8);
  assert.equal(LEGACY_KEYS.length, 3);
  assert.deepEqual(LEGACY_KEYS.map((k) => k.key).sort(), ["odea_empleo_v2", "odea_events", "odea_quiz_v1"]);
});

/* ========================================================================== */
/* 2. Ningún campo ni clave se pierde sin registro                            */
/* ========================================================================== */
test("migración: ningún campo ni clave se pierde (36 + 11 con decisión)", () => {
  const f = loadFixture();
  const c = loadCatalog();
  const m = migrate(f, c);
  const r = validate(f, m, c);

  assert.equal(r.ok, true, r.errors.join("\n"));
  assert.equal(m.migration.decisions.length, 36);
  assert.equal(Object.keys(m.migration.worlds).length, 11);
  assert.equal(Object.keys(m.worlds).length, 8);
  assert.equal(Object.keys(m.legacy.keys).length, 3);
  assert.ok(!("save" in m), "el bundle v1 no debe tener `save` en la raíz");
  for (const id of ["FIELD_DECISIONS_COMPLETE", "KEY_DECISIONS_COMPLETE", "KEY_SECTION_ASSIGNMENT", "SECTIONS", "NO_LOSS_PROJECTION"]) {
    const chk = r.checks.find((x) => x.id === id);
    assert.ok(chk && chk.ok, `${id}: ${chk && chk.detail}`);
  }
});

test("migración: campos y claves desconocidos se preservan, no se descartan", () => {
  const f = loadFixture();
  const c = loadCatalog();
  f.save.futureField = { hola: "mundo" };
  f.keys.odea_futuro_v1 = { v: 9, algo: [1, 2, 3] };

  const m = migrate(f, c);
  const r = validate(f, m, c);

  assert.equal(r.ok, true, r.errors.join("\n"));
  assert.deepEqual(m.migration.unmapped.fields.futureField, { hola: "mundo" });
  assert.deepEqual(m.migration.unmapped.keys.odea_futuro_v1, { v: 9, algo: [1, 2, 3] });
});

/* ========================================================================== */
/* 3. Totales de XP: totalXP y los 10 componentes idénticos                   */
/* ========================================================================== */
test("XP: totalXP y cada componente de xpBreakdown son idénticos antes y después", () => {
  const f = loadFixture();
  const c = loadCatalog();
  const m = migrate(f, c);

  const before = derive(sourcesFromLegacy(f), c, REFERENCE_DATE);
  const after = derive(sourcesFromLegacy(legacyProjection(m)), c, REFERENCE_DATE);
  const afterMigrated = derive(sourcesFromMigrated(m), c, REFERENCE_DATE);

  for (const k of XP_COMPONENTS) {
    assert.equal(after.xpBreakdown[k], before.xpBreakdown[k], `componente ${k} (proyección)`);
    assert.equal(afterMigrated.xpBreakdown[k], before.xpBreakdown[k], `componente ${k} (bundle v1)`);
    assert.equal(afterMigrated.xpBreakdown[k], f.save.xpBreakdown[k], `componente guardado ${k}`);
  }
  assert.equal(after.totalXP, before.totalXP);
  assert.equal(afterMigrated.totalXP, before.totalXP);
  assert.equal(m.core.derived.totalXP, f.save.totalXP);
  assert.deepEqual(m.core.derived.xpBreakdown, f.save.xpBreakdown);
});

test("XP: el oráculo reproduce el fixture (integridad de la referencia)", () => {
  const f = loadFixture();
  const c = loadCatalog();
  const d = derive(sourcesFromLegacy(f), c, REFERENCE_DATE);
  assert.deepEqual(d.xpBreakdown, f.save.xpBreakdown);
  assert.equal(d.totalXP, f.save.totalXP);
  assert.equal(d.campaignLevel, f.save.campaignLevel);
  assert.equal(d.odeLevel, f.save.odeLevel);
});

test("niveles: campaignLevel y odeLevel se conservan", () => {
  const f = loadFixture();
  const c = loadCatalog();
  const m = migrate(f, c);
  const r = validate(f, m, c);
  const chk = r.checks.find((x) => x.id === "LEVELS_IDENTICAL");
  assert.ok(chk && chk.ok, chk && chk.detail);
  assert.equal(m.core.derived.campaignLevel, f.save.campaignLevel);
  assert.equal(m.core.derived.odeLevel, f.save.odeLevel);
});

/* ========================================================================== */
/* 4. Críticos: shop.spent, eventRL, farm, canje                              */
/* ========================================================================== */
test("críticos: shop.spent, eventRL, farm y canje sobreviven idénticos", () => {
  const f = loadFixture();
  const c = loadCatalog();
  const m = migrate(f, c);

  assert.equal(m.core.shop.spent, f.save.shop.spent);
  assert.deepEqual(m.core.credits.eventRL, f.save.eventRL);
  assert.deepEqual(m.core.credits.farm, f.save.farm);
  assert.deepEqual(m.core.realRewards.canje, f.save.canje);

  const r = validate(f, m, c);
  for (const id of ["SHOP_SPENT", "CRITICAL_EVENTRL", "CRITICAL_FARM", "CRITICAL_CANJE", "COINS_IDENTICAL"]) {
    const chk = r.checks.find((x) => x.id === id);
    assert.ok(chk && chk.ok, `${id}: ${chk && chk.detail}`);
  }
});

/* ========================================================================== */
/* 5. Importación: backup, estados y cuarentena                               */
/* ========================================================================== */
test("importación limpia: estado active, backup intacto y validación OK", () => {
  const f = loadFixture();
  const c = loadCatalog();
  const storage = createMemoryStorage();

  const res = importBundle(f, { catalog: c, storage, referenceDate: REFERENCE_DATE, migratedAt: MIGRATED_AT });

  assert.equal(res.status, "active");
  assert.equal(res.bundle.import.state, "active");
  assert.equal(res.validation.ok, true, res.validation.errors.join("\n"));
  assert.equal(readOdea2(storage).import.state, "active");
  assert.equal(readQuarantine(storage), null);

  const keys = backupKeys(storage);
  assert.equal(keys.length, 1, "debe haber exactamente un backup del origen");
  assert.deepEqual(JSON.parse(storage.getItem(keys[0])), f, "el backup debe ser el bundle original intacto");
  assert.equal(res.bundle.import.backup.key, keys[0]);
});

test("candado 1: si los totales no reconcilian, se ABORTA sin escribir save", () => {
  const f = loadFixture();
  const c = loadCatalog();
  const storage = createMemoryStorage();
  f.save.totalXP = f.save.totalXP + 1; // el bundle miente

  const res = importBundle(f, { catalog: c, storage, referenceDate: REFERENCE_DATE, migratedAt: MIGRATED_AT });

  assert.equal(res.status, "aborted");
  assert.equal(res.bundle, null);
  assert.equal(readOdea2(storage), null, "no debe existir save activo");
  assert.equal(readQuarantine(storage), null, "abortar tampoco deja preview");
  assert.equal(backupKeys(storage).length, 1, "el backup se hace igual");
  assert.ok(res.report.totals.totalXP.ok === false);
  assert.match(res.report.totals.totalXP.stored + "", /\d+/);
});

test("candado 1: si un componente de XP no reconcilia, también aborta", () => {
  const f = loadFixture();
  const c = loadCatalog();
  const storage = createMemoryStorage();
  f.save.xpBreakdown.hunt = f.save.xpBreakdown.hunt - 1;

  const res = importBundle(f, { catalog: c, storage, referenceDate: REFERENCE_DATE, migratedAt: MIGRATED_AT });
  assert.equal(res.status, "aborted");
  assert.deepEqual(res.report.totals.xpBreakdown.diffs, ["hunt"]);
  assert.equal(readOdea2(storage), null);
});

test("candado 2: sin canje queda en CUARENTENA, nunca como save activo", () => {
  const f = loadFixture();
  const c = loadCatalog();
  const storage = createMemoryStorage();
  delete f.save.canje; // no afecta XP, por eso hace falta el candado estructural

  const res = importBundle(f, { catalog: c, storage, referenceDate: REFERENCE_DATE, migratedAt: MIGRATED_AT });

  assert.equal(res.status, "quarantine");
  assert.equal(res.bundle.import.state, "quarantine");
  assert.equal(readOdea2(storage), null, "la cuarentena no puede ser save activo");
  assert.ok(readQuarantine(storage), "debe existir el preview en cuarentena");
  assert.ok(res.report.criticals.canje === false);
  assert.ok(res.validation.checks.find((x) => x.id === "CRITICAL_CANJE" && !x.ok));
  assert.throws(() => saveOdea2(storage, res.bundle), (e) => e.code === "IMPORT_NOT_ACTIVE");
  assert.throws(() => loadOdea2(res.bundle, c), /estado "quarantine"/);
});

test("cuarentena: aceptar explícitamente la activa y registra los checks aceptados", () => {
  const f = loadFixture();
  const c = loadCatalog();
  const storage = createMemoryStorage();
  delete f.save.canje;

  const res = importBundle(f, { catalog: c, storage, referenceDate: REFERENCE_DATE, migratedAt: MIGRATED_AT });
  const accepted = acceptQuarantine(storage, { acceptedAt: "2026-11-11T09:00:00.000Z" });

  assert.equal(accepted.import.state, "active");
  assert.equal(accepted.import.acceptedAt, "2026-11-11T09:00:00.000Z");
  assert.deepEqual(accepted.import.acceptedChecks, [...accepted.import.failedChecks]);
  assert.ok(accepted.import.acceptedChecks.includes("CRITICAL_CANJE"));
  assert.equal(readQuarantine(storage), null);
  assert.equal(readOdea2(storage).import.state, "active");

  const loaded = loadOdea2(readOdea2(storage), c);
  assert.equal(loaded.core.derived.totalXP, f.save.totalXP);

  // Aceptar no repara: el check sigue fallando y queda registrado.
  const r = validate(f, accepted, c);
  assert.equal(r.ok, false);
  assert.ok(reportIds(r).includes("CRITICAL_CANJE"));
});

test("cuarentena: abortar descarta el preview y conserva el backup del origen", () => {
  const f = loadFixture();
  const c = loadCatalog();
  const storage = createMemoryStorage();
  delete f.save.canje;

  importBundle(f, { catalog: c, storage, referenceDate: REFERENCE_DATE, migratedAt: MIGRATED_AT });
  assert.ok(readQuarantine(storage));

  rejectQuarantine(storage);
  assert.equal(readQuarantine(storage), null);
  assert.equal(readOdea2(storage), null);
  assert.equal(backupKeys(storage).length, 1);
});

/* ========================================================================== */
/* 6. Reimportación: rechazo por defecto y «reset + reimportar»               */
/* ========================================================================== */
test("reimportación: un save activo rechaza un segundo import", () => {
  const f = loadFixture();
  const c = loadCatalog();
  const storage = createMemoryStorage();
  importBundle(f, { catalog: c, storage, referenceDate: REFERENCE_DATE, migratedAt: MIGRATED_AT });

  const otro = loadFixture();
  otro.save.playerName = "Otro Recluta";
  assert.throws(
    () => importBundle(otro, { catalog: c, storage, referenceDate: REFERENCE_DATE, migratedAt: MIGRATED_AT }),
    (e) => e instanceof MigrationError && e.code === "ALREADY_IMPORTED"
  );
});

test("reimportación: el MISMO bundle se rechaza incluso con reset (huella)", () => {
  const f = loadFixture();
  const c = loadCatalog();
  const storage = createMemoryStorage();
  importBundle(f, { catalog: c, storage, referenceDate: REFERENCE_DATE, migratedAt: MIGRATED_AT });

  assert.throws(
    () => resetAndReimport(f, { catalog: c, storage, referenceDate: REFERENCE_DATE, migratedAt: MIGRATED_AT }),
    (e) => e instanceof MigrationError && e.code === "DUPLICATE_SOURCE"
  );
});

test("reset + reimportar: reemplaza el save y primero respalda el actual", () => {
  const f = loadFixture();
  const c = loadCatalog();
  const storage = createMemoryStorage();
  importBundle(f, { catalog: c, storage, referenceDate: REFERENCE_DATE, migratedAt: MIGRATED_AT });

  const otro = loadFixture();
  otro.save.playerName = "Otro Recluta";
  const res = resetAndReimport(otro, {
    catalog: c, storage, referenceDate: REFERENCE_DATE, migratedAt: "2026-11-12T10:00:00.000Z"
  });

  assert.equal(res.status, "active");
  assert.ok(res.backupOfCurrent, "debe respaldar el save actual antes de reemplazarlo");
  assert.deepEqual(JSON.parse(storage.getItem(res.backupOfCurrent.key)).core.identity.playerName, "Recluta Sintética");
  assert.equal(readOdea2(storage).core.identity.playerName, "Otro Recluta");
});

/* ========================================================================== */
/* 7. Ida y vuelta: save → migrar → cargar → guardar → cargar                 */
/* ========================================================================== */
test("ida y vuelta: importar → cargar → guardar → cargar es estable", () => {
  const f = loadFixture();
  const c = loadCatalog();
  const storage = createMemoryStorage();

  importBundle(f, { catalog: c, storage, referenceDate: REFERENCE_DATE, migratedAt: MIGRATED_AT });
  const loaded1 = loadOdea2(readOdea2(storage), c);
  saveOdea2(storage, loaded1);
  const loaded2 = loadOdea2(readOdea2(storage), c);

  assert.deepEqual(loaded2.core, loaded1.core);
  assert.deepEqual(loaded2.worlds, loaded1.worlds);
  assert.deepEqual(loaded2.legacy, loaded1.legacy);
  assert.equal(loaded2.core.derived.totalXP, f.save.totalXP);
  assert.equal(loaded2.core.derived.coins.balance, loaded1.core.derived.coins.balance);
});

test("ida y vuelta: la migración es determinista con timestamps fijos", () => {
  const f = loadFixture();
  const c = loadCatalog();
  assert.deepEqual(migrate(f, c), migrate(f, c));
});

test("cargar: si las fuentes no cuadran con el snapshot, falla cerrado (XP_DRIFT)", () => {
  const f = loadFixture();
  const c = loadCatalog();
  const m = migrate(f, c);
  delete m.core.credits.farm.log[0].c; // altera una fuente sin tocar el snapshot
  assert.throws(() => loadOdea2(m, c), /XP_DRIFT/);
});

/* ========================================================================== */
/* 8. referenceDate: fijada en lastDailyDate, sin compensaciones              */
/* ========================================================================== */
test("referenceDate: se fija en lastDailyDate y no se compensa el efecto de calendario", () => {
  const f = loadFixture();
  const c = loadCatalog();

  const m = migrateBundle(f, { catalog: c, migratedAt: MIGRATED_AT }); // sin referenceDate explícita
  assert.equal(m.migration.referenceDate, f.save.lastDailyDate);

  const inside = derive(sourcesFromMigrated(m), c, m.migration.referenceDate);
  const outside = derive(sourcesFromMigrated(m), c, "2026-12-31");

  assert.equal(inside.totalXP, f.save.totalXP, "en la fecha de referencia los totales cuadran");
  assert.notEqual(outside.xpBreakdown.vida, inside.xpBreakdown.vida, "fuera de semana el bonus de sagas cae");
  assert.notEqual(outside.totalXP, f.save.totalXP, "no hay compensación manual: se acepta el recálculo");
});

/* ========================================================================== */
/* 9. Test negativo: quitar eventRL, farm o canje DEBE fallar                 */
/* ========================================================================== */
test("negativo: sin eventRL el validador falla", () => {
  const f = loadFixture();
  const c = loadCatalog();
  delete f.save.eventRL;

  const m = migrate(f, c);
  const r = validate(f, m, c);

  assert.equal(r.ok, false, "el validador debió fallar sin eventRL");
  assert.ok(reportIds(r).includes("CRITICAL_EVENTRL"), reportIds(r).join(", "));
  assert.equal(m.import.state, "aborted", "sin el XP del evento los totales no reconcilian");
});

test("negativo: sin farm el validador falla", () => {
  const f = loadFixture();
  const c = loadCatalog();
  delete f.save.farm;

  const m = migrate(f, c);
  const r = validate(f, m, c);

  assert.equal(r.ok, false, "el validador debió fallar sin farm");
  assert.ok(reportIds(r).includes("CRITICAL_FARM"), reportIds(r).join(", "));
});

test("negativo: sin canje el validador falla (aunque el XP cuadre)", () => {
  const f = loadFixture();
  const c = loadCatalog();
  delete f.save.canje;

  const m = migrate(f, c);
  const r = validate(f, m, c);

  assert.equal(r.ok, false, "el validador debió fallar sin canje");
  assert.ok(reportIds(r).includes("CRITICAL_CANJE"), reportIds(r).join(", "));
  assert.equal(m.import.state, "quarantine", "el XP reconcilia: va a cuarentena, no a aborto");
});

test("negativo: si el XP del evento se altera, la paridad falla", () => {
  const f = loadFixture();
  const c = loadCatalog();
  f.save.eventRL.log[0].xp = 0; // el snapshot guardado sigue diciendo 60

  const m = migrate(f, c);
  const r = validate(f, m, c);

  assert.equal(r.ok, false);
  assert.ok(
    reportIds(r).includes("XP_ORACLE_MATCHES_SOURCE") || reportIds(r).includes("XP_COMPONENTS_IDENTICAL"),
    reportIds(r).join(", ")
  );
  assert.equal(m.import.state, "aborted");
});

test("negativo: si el destino de canje se vacía, el validador falla", () => {
  const f = loadFixture();
  const c = loadCatalog();
  const m = migrate(f, c);
  m.core.realRewards.canje = null;

  const r = validate(f, m, c);
  assert.equal(r.ok, false);
  assert.ok(reportIds(r).includes("CRITICAL_CANJE"));
});

/* ========================================================================== */
/* 10. Contrato del importador y legacy permanente                            */
/* ========================================================================== */
test("importador: rechaza un formato que no es odea_bundle_v2", () => {
  const f = loadFixture();
  f._format = "otra_cosa";
  assert.throws(() => migrateBundle(f, {}), (e) => e instanceof MigrationError && e.code === "BAD_FORMAT");
});

test("importador: exige catálogo (sin él no hay reconciliación posible)", () => {
  const f = loadFixture();
  assert.throws(() => migrateBundle(f, {}), (e) => e instanceof MigrationError && e.code === "NO_CATALOG");
});

test("importador: el mapeo de nombres reservados es explícito (rewards→gear, canje→realRewards)", () => {
  const f = loadFixture();
  const c = loadCatalog();
  const m = migrate(f, c);
  assert.ok(m.core.gear && !m.core.rewards, "rewards debe renombrarse a gear");
  assert.ok(m.core.realRewards && m.core.realRewards.canje, "canje debe vivir en realRewards");
  assert.ok(!m.core.canje, "canje no debe quedar colisionando en la raíz del núcleo");
  assert.deepEqual(m.core.gear, f.save.rewards);
});

test("legacy: odea_quiz_v1 se archiva indefinidamente y sobrevive a reset + reimportar", () => {
  const f = loadFixture();
  const c = loadCatalog();
  const storage = createMemoryStorage();
  importBundle(f, { catalog: c, storage, referenceDate: REFERENCE_DATE, migratedAt: MIGRATED_AT });

  const activo = readOdea2(storage);
  assert.ok(activo.legacy.keys.quiz, "quiz debe estar archivada desde el primer día");
  assert.deepEqual(activo.legacy.keys.quiz.data, f.keys.odea_quiz_v1);
  assert.equal(activo.legacy.keys.quiz.lifecycle, "archived-legacy");

  const otro = loadFixture();
  otro.save.playerName = "Otro Recluta";
  const res = resetAndReimport(otro, { catalog: c, storage, referenceDate: REFERENCE_DATE, migratedAt: "2026-11-12T10:00:00.000Z" });
  assert.ok(res.bundle.legacy.keys.quiz, "reset + reimportar no debe borrar quiz");
  assert.deepEqual(res.bundle.legacy.keys.quiz.data, otro.keys.odea_quiz_v1);
});

test("huella: se registra el checksum, appVersion, totalXP y lastDailyDate", () => {
  const f = loadFixture();
  const c = loadCatalog();
  const m = migrate(f, c);
  const fp = fingerprintOf(f);

  assert.deepEqual(m.sourceFingerprint, fp);
  assert.match(fp.digest, /^[0-9a-f]{16}$/);
  assert.equal(fp.appVersion, "5.99");
  assert.equal(fp.totalXP, f.save.totalXP);
  assert.equal(fp.lastDailyDate, f.save.lastDailyDate);
  assert.equal(validate(f, m, c).checks.find((x) => x.id === "SOURCE_FINGERPRINT").ok, true);

  const otro = loadFixture();
  otro.save.playerName = "Otra Persona";
  assert.notEqual(fingerprintOf(otro).digest, fp.digest, "bundles distintos deben tener huellas distintas");
});

test("validación: exige backup registrado cuando lo pide la capa de escritura", () => {
  const f = loadFixture();
  const c = loadCatalog();
  const m = migrate(f, c);

  const sinBackup = validateMigration(f, m, c, { referenceDate: REFERENCE_DATE, requireBackup: true });
  assert.equal(sinBackup.ok, false);
  assert.ok(reportIds(sinBackup).includes("BACKUP_RECORDED"));

  const storage = createMemoryStorage();
  const res = importBundle(f, { catalog: c, storage, referenceDate: REFERENCE_DATE, migratedAt: MIGRATED_AT });
  assert.equal(res.validation.ok, true, res.validation.errors.join("\n"));
});
