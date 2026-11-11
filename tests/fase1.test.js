/**
 * fase1.test.js — Tests de la Fase 1 (PWA + rutas de importación/restauración)
 * Ejecutar: npm test   (node --test)
 *
 * No modifica ni repite las expectativas de Fase 0: agrega la ida y vuelta en
 * almacenamiento, las dos rutas (migración y restauración) y la detección de
 * formato que usa la app.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  STORAGE_KEYS,
  SAVE_BACKUP_RETENTION,
  createMemoryStorage,
  backupBundle,
  importBundle,
  resetAndReimport,
  restoreBundle,
  detectBundleFormat,
  loadOdea2,
  readOdea2,
  saveOdea2
} from "../src/storage.js";
import { SAVE_FIELDS, SIBLING_KEYS } from "../src/shape.js";
import { parseFileText } from "../js/importer.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const FIXTURE_PATH = join(root, "fixtures", "odea-progreso-sintetico.json");
const CATALOG_PATH = join(root, "data", "xp-catalog.json");

const REFERENCE_DATE = "2026-11-10";
const MIGRATED_AT = "2026-11-10T12:00:00.000Z";

function loadFixture() {
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));
}
function loadCatalog() {
  return JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
}
function importFixture(storage, fixture = loadFixture()) {
  return importBundle(fixture, {
    catalog: loadCatalog(),
    storage,
    referenceDate: REFERENCE_DATE,
    migratedAt: MIGRATED_AT
  });
}
function backupKeys(storage) {
  return storage._keys().filter((k) => k.startsWith(STORAGE_KEYS.backupPrefix));
}

/* ========================================================================== */
/* (a) Ida y vuelta en almacenamiento                                         */
/* ========================================================================== */
test("fase 1: escribir, leer y volver a guardar deja un estado idéntico", () => {
  const fixture = loadFixture();
  const catalog = loadCatalog();
  const storage = createMemoryStorage();

  const result = importFixture(storage, fixture);
  assert.equal(result.status, "active");

  const written = readOdea2(storage);
  assert.deepEqual(written.core, result.bundle.core);
  assert.deepEqual(written.worlds, result.bundle.worlds);
  assert.deepEqual(written.legacy, result.bundle.legacy);

  saveOdea2(storage, written);
  const reread = readOdea2(storage);
  assert.deepEqual(reread, written);

  const loaded = loadOdea2(reread, catalog);
  assert.equal(loaded.core.derived.totalXP, fixture.save.totalXP);
  assert.equal(loaded.core.derived.campaignLevel, fixture.save.campaignLevel);
});

/* ========================================================================== */
/* (b) Forma exacta del real y rechazo de críticos faltantes                  */
/* ========================================================================== */
test("fase 1: el importador acepta un bundle con la forma exacta del real (36 + 11)", () => {
  const fixture = loadFixture();
  assert.equal(Object.keys(fixture.save).length, 36);
  assert.equal(Object.keys(fixture.keys).length, 11);
  assert.deepEqual(Object.keys(fixture.save).sort(), SAVE_FIELDS.map((f) => f.name).sort());
  assert.deepEqual(Object.keys(fixture.keys).sort(), SIBLING_KEYS.map((k) => k.key).sort());

  const storage = createMemoryStorage();
  const result = importFixture(storage, fixture);

  assert.equal(result.status, "active");
  assert.equal(result.validation.ok, true, result.validation.errors.join("\n"));
  assert.equal(result.bundle.migration.decisions.length, 36);
  assert.equal(Object.keys(result.bundle.migration.worlds).length, 11);
  assert.ok(readOdea2(storage), "el save activo debe quedar escrito");
});

for (const critical of ["eventRL", "farm", "canje"]) {
  test(`fase 1: el importador rechaza un bundle sin ${critical}`, () => {
    const fixture = loadFixture();
    delete fixture.save[critical];
    const storage = createMemoryStorage();

    const result = importFixture(storage, fixture);

    assert.notEqual(result.status, "active", `sin ${critical} no puede activarse`);
    assert.equal(readOdea2(storage), null, "no debe quedar save activo");
    assert.ok(
      result.validation.checks.some((c) => c.id === `CRITICAL_${critical.toUpperCase()}` && !c.ok),
      `debe fallar el check CRITICAL_${critical.toUpperCase()}`
    );
  });
}

/* ========================================================================== */
/* (c) Restauración vs. migración                                             */
/* ========================================================================== */
test("fase 1: la restauración acepta un odea2_bundle_v1 exportado", () => {
  const catalog = loadCatalog();
  const source = createMemoryStorage();
  importFixture(source, loadFixture());

  const exported = JSON.parse(JSON.stringify(readOdea2(source)));
  assert.equal(detectBundleFormat(exported), "odea2_bundle_v1");

  const target = createMemoryStorage();
  const { bundle, backupOfCurrent } = restoreBundle(exported, {
    catalog,
    storage: target,
    at: MIGRATED_AT
  });

  assert.equal(backupOfCurrent, null, "sin save previo no hay nada que respaldar");
  assert.equal(bundle.import.state, "active");
  assert.equal(bundle.import.restoredAt, MIGRATED_AT);
  assert.equal(readOdea2(target).core.identity.playerName, "Recluta Sintética");
  assert.equal(readOdea2(target).core.derived.totalXP, loadFixture().save.totalXP);
});

test("fase 1: restaurar sobre un save existente respalda el actual antes de reemplazarlo", () => {
  const catalog = loadCatalog();

  const currentStorage = createMemoryStorage();
  importFixture(currentStorage, loadFixture());

  const otherFixture = loadFixture();
  otherFixture.save.playerName = "Otro Recluta";
  const otherStorage = createMemoryStorage();
  importFixture(otherStorage, otherFixture);
  const incoming = readOdea2(otherStorage);

  const { backupOfCurrent } = restoreBundle(incoming, {
    catalog,
    storage: currentStorage,
    at: "2026-11-12T10:00:00.000Z"
  });

  assert.ok(backupOfCurrent, "debe respaldar el save actual");
  const backup = JSON.parse(currentStorage.getItem(backupOfCurrent.key));
  assert.equal(backup.core.identity.playerName, "Recluta Sintética");
  assert.equal(readOdea2(currentStorage).core.identity.playerName, "Otro Recluta");
});

test("fase 1: la ruta de migración rechaza un segundo import de ODEA 1", () => {
  const storage = createMemoryStorage();
  importFixture(storage, loadFixture());

  const otherFixture = loadFixture();
  otherFixture.save.playerName = "Otro Recluta";

  assert.throws(
    () => importFixture(storage, otherFixture),
    (error) => error.code === "ALREADY_IMPORTED"
  );
  assert.throws(
    () => resetAndReimport(loadFixture(), {
      catalog: loadCatalog(),
      storage,
      referenceDate: REFERENCE_DATE,
      migratedAt: MIGRATED_AT
    }),
    (error) => error.code === "DUPLICATE_SOURCE"
  );
});

test("fase 1: la restauración rechaza un archivo de ODEA 1 (no es su ruta)", () => {
  const storage = createMemoryStorage();
  assert.throws(
    () => restoreBundle(loadFixture(), { catalog: loadCatalog(), storage }),
    (error) => error.code === "BAD_RESTORE_FORMAT"
  );
  assert.equal(readOdea2(storage), null);
});

test("fase 1: un respaldo con XP que no cuadra se rechaza sin escribir ni respaldar", () => {
  const catalog = loadCatalog();
  const source = createMemoryStorage();
  importFixture(source, loadFixture());

  const corrupted = JSON.parse(JSON.stringify(readOdea2(source)));
  corrupted.core.credits.farm.log[0].c = 0; // altera la fuente sin tocar el snapshot

  const target = createMemoryStorage();
  assert.throws(() => restoreBundle(corrupted, { catalog, storage: target }), /XP_DRIFT/);
  assert.equal(readOdea2(target), null);
  assert.equal(backupKeys(target).length, 0, "no se respalda un respaldo inválido");
});

/* ========================================================================== */
/* Detección de formato (lo que usa la UI para elegir ruta)                   */
/* ========================================================================== */
test("fase 1: distingue los dos formatos y rechaza lo desconocido", () => {
  const fixture = loadFixture();
  const storage = createMemoryStorage();
  importFixture(storage, fixture);

  assert.equal(detectBundleFormat(fixture), "odea_bundle_v2");
  assert.equal(detectBundleFormat(readOdea2(storage)), "odea2_bundle_v1");
  assert.equal(detectBundleFormat({ hola: 1 }), "unknown");
  assert.equal(detectBundleFormat(null), "unknown");
});

test("fase 1: parseFileText clasifica el archivo y falla con JSON inválido", () => {
  const fixture = loadFixture();
  const parsed = parseFileText(JSON.stringify(fixture));
  assert.equal(parsed.format, "odea_bundle_v2");
  assert.equal(parsed.data.save.playerName, "Recluta Sintética");

  assert.throws(() => parseFileText("{no es json"), /JSON válido/);
  assert.equal(parseFileText(JSON.stringify({ _format: "otra_cosa" })).format, "unknown");
});

/* ========================================================================== */
/* Retención de backups (decisión de Fase 1): últimos 3 de save               */
/* ========================================================================== */
test("fase 1: rota los backups de save y conserva los últimos 3", () => {
  const fixture = loadFixture();
  const storage = createMemoryStorage();
  const times = [
    "2026-11-10T10:00:00.000Z",
    "2026-11-10T11:00:00.000Z",
    "2026-11-10T12:00:00.000Z",
    "2026-11-10T13:00:00.000Z",
    "2026-11-10T14:00:00.000Z"
  ];

  for (const at of times) backupBundle(fixture, storage, { at, kind: "save" });

  const keys = storage._keys().filter((k) => k.startsWith(STORAGE_KEYS.backupPrefix + "save_"));
  assert.equal(keys.length, SAVE_BACKUP_RETENTION);
  assert.ok(!keys.some((k) => k.includes(times[0])), "el más viejo debe eliminarse");
  assert.ok(!keys.some((k) => k.includes(times[1])), "el segundo más viejo debe eliminarse");
  for (const recent of times.slice(-3)) {
    assert.ok(keys.some((k) => k.includes(recent)), `debe conservar ${recent}`);
  }
});

test("fase 1: los backups del origen nunca se rotan", () => {
  const fixture = loadFixture();
  const storage = createMemoryStorage();

  for (let i = 0; i < 6; i++) {
    backupBundle(fixture, storage, { at: `2026-11-10T1${i}:00:00.000Z`, kind: "source" });
  }

  const keys = storage._keys().filter((k) => k.startsWith(STORAGE_KEYS.backupPrefix + "source_"));
  assert.equal(keys.length, 6, "el backup del archivo importado se conserva siempre");
});

test("fase 1: restoreBundle también aplica la rotación de backups de save", () => {
  const catalog = loadCatalog();
  const storage = createMemoryStorage();
  importFixture(storage, loadFixture());
  const exported = JSON.parse(JSON.stringify(readOdea2(storage)));

  for (let i = 0; i < 5; i++) {
    restoreBundle(exported, {
      catalog,
      storage,
      at: `2026-11-1${i + 1}T10:00:00.000Z`
    });
  }

  const keys = storage._keys().filter((k) => k.startsWith(STORAGE_KEYS.backupPrefix + "save_"));
  assert.equal(keys.length, SAVE_BACKUP_RETENTION);
});
