/**
 * r1.test.js — R1: recompensas históricas inmutables.
 *
 * Cada completación nueva congela `reward { xp, coins }` y la `rulesVersion`
 * usada al escribir. Un cambio posterior del catálogo no puede reescribir lo ya
 * reconocido. Lo heredado conserva su interpretación.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  STORAGE_KEYS,
  applyGameplayMutation,
  createMemoryStorage,
  importBundle,
  loadOdea2,
  restoreBundle
} from "../src/storage.js";
import { validatePlayState } from "../src/validate.js";
import { derive, sourcesFromMigrated } from "../src/derive.js";
import { missionsOf } from "../src/catalog.js";
import { systemMissions } from "../src/gameplay.js";
import { PLAY_VERSION, RULES_VERSION } from "../src/shape.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const FIXTURE_PATH = join(root, "fixtures", "odea-progreso-sintetico.json");
const CATALOG_PATH = join(root, "data", "xp-catalog.json");

const REFERENCE_DATE = "2026-11-10";
const MIGRATED_AT = "2026-11-10T12:00:00.000Z";
const AT = "2026-11-10T15:04:05.000Z";
const DAY = "2026-11-16";

function loadCatalog() {
  return JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
}

function freshSave() {
  const storage = createMemoryStorage();
  const catalog = loadCatalog();
  const imported = importBundle(JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")), {
    catalog,
    storage,
    referenceDate: REFERENCE_DATE,
    migratedAt: MIGRATED_AT
  });
  assert.equal(imported.status, "active");
  return { storage, catalog, bundle: imported.bundle };
}

function currentBundle(storage) {
  return JSON.parse(storage.getItem(STORAGE_KEYS.bundle));
}

function derived(bundle, catalog) {
  return derive(sourcesFromMigrated(bundle, catalog), catalog, REFERENCE_DATE);
}

function complete(storage, catalog, system, missionId, date = DAY) {
  return applyGameplayMutation(
    storage,
    catalog,
    { type: "mission.complete", system, missionId, date },
    { at: AT, date }
  );
}

function pendingOf(bundle, catalog, system) {
  return systemMissions(bundle, catalog, system, DAY).pending;
}

/* ========================================================================== */
/* 1. El registro persiste recompensa y versión                               */
/* ========================================================================== */

test("R1: una completación nueva fija recompensa y versión de reglas", () => {
  const { storage, catalog, bundle } = freshSave();
  const mission = pendingOf(bundle, catalog, "empleo")[0];

  const result = complete(storage, catalog, "empleo", mission.id);
  assert.equal(result.status, "applied");

  const record = currentBundle(storage).play.completions[mission.id];
  assert.deepEqual(record.reward, { xp: mission.xp, coins: 1 });
  assert.equal(record.rulesVersion, RULES_VERSION);
  assert.equal(currentBundle(storage).play.version, PLAY_VERSION);
});

/* ========================================================================== */
/* 2. Cambiar el catálogo no reescribe el pasado                              */
/* ========================================================================== */

test("R1: cambiar el catálogo después no altera la recompensa histórica", () => {
  const { storage, catalog, bundle } = freshSave();
  const mission = pendingOf(bundle, catalog, "empleo")[0];
  complete(storage, catalog, "empleo", mission.id);

  const saved = currentBundle(storage);
  const before = derived(saved, catalog);

  /* Catálogo "futuro": la misma misión pasa a valer 9.999 XP. */
  const futuro = JSON.parse(JSON.stringify(catalog));
  futuro.jobs[mission.id] = 9999;

  const after = derived(saved, futuro);
  assert.equal(
    after.xpBreakdown.career,
    before.xpBreakdown.career,
    "el XP de carrera no cambia por editar el catálogo"
  );
  assert.equal(after.totalXP, before.totalXP);
});

test("R1: lo NO congelado sigue leyendo el catálogo (compatibilidad)", () => {
  const { storage, catalog, bundle } = freshSave();
  const mission = pendingOf(bundle, catalog, "empleo")[0];
  complete(storage, catalog, "empleo", mission.id);

  /* Simula un registro anterior a R1: mismo id, sin reward. */
  const saved = currentBundle(storage);
  delete saved.play.completions[mission.id].reward;
  delete saved.play.completions[mission.id].rulesVersion;

  const before = derived(saved, catalog);
  const futuro = JSON.parse(JSON.stringify(catalog));
  futuro.jobs[mission.id] = 9999;
  const after = derived(saved, futuro);

  assert.notEqual(after.xpBreakdown.career, before.xpBreakdown.career, "sin reward sí depende del catálogo");
});

/* ========================================================================== */
/* 3. Idempotencia                                                           */
/* ========================================================================== */

test("R1: doble toque no duplica completación ni recompensa", () => {
  const { storage, catalog, bundle } = freshSave();
  const mission = pendingOf(bundle, catalog, "empleo")[0];

  const first = complete(storage, catalog, "empleo", mission.id);
  const before = derived(currentBundle(storage), catalog).totalXP;
  const second = complete(storage, catalog, "empleo", mission.id);

  assert.equal(first.status, "applied");
  assert.equal(second.status, "duplicate");
  assert.equal(Object.keys(currentBundle(storage).play.completions).length, 1);
  assert.equal(derived(currentBundle(storage), catalog).totalXP, before, "el XP no se movió");
});

test("R1: la diaria solo paga una vez por fecha civil", () => {
  const { storage, catalog, bundle } = freshSave();
  const daily = systemMissions(bundle, catalog, "vida", DAY).pending.find((m) => m.cls === "daily");

  assert.equal(complete(storage, catalog, "vida", daily.id, DAY).status, "applied");
  const after = derived(currentBundle(storage), catalog).totalXP;

  assert.equal(complete(storage, catalog, "vida", daily.id, DAY).status, "duplicate");
  assert.equal(derived(currentBundle(storage), catalog).totalXP, after);

  assert.equal(complete(storage, catalog, "vida", daily.id, "2026-11-17").status, "applied");
});

/* ========================================================================== */
/* 4. Lo migrado no se vuelve a pagar                                        */
/* ========================================================================== */

test("R1: una misión migrada no se paga de nuevo ni cambia sus proyecciones", () => {
  const { storage, catalog, bundle } = freshSave();
  const before = derived(bundle, catalog);

  /* "n1" ya venía completo de ODEA 1. */
  assert.equal(complete(storage, catalog, "empleo", "n1").status, "duplicate");

  const after = derived(currentBundle(storage), catalog);
  assert.equal(after.totalXP, before.totalXP);
  assert.equal(after.xpBreakdown.career, before.xpBreakdown.career);
  assert.equal(
    currentBundle(storage).play?.completions
      ? Object.keys(currentBundle(storage).play.completions).length
      : 0,
    0,
    "un duplicado no crea registro"
  );
});

test("R1: el crédito permanente se conserva sin duplicación", () => {
  const { storage, catalog, bundle } = freshSave();
  const credit = (b) => b.core.derived.xpBreakdown.evento + b.core.derived.xpBreakdown.farm;
  const before = credit(bundle);

  const mission = pendingOf(bundle, catalog, "capital")[0];
  complete(storage, catalog, "capital", mission.id);

  const after = currentBundle(storage);
  assert.equal(credit(after), before, "evento + farm intactos");
});

/* ========================================================================== */
/* 5. Rechazos sin escribir                                                  */
/* ========================================================================== */

test("R1: id inválido se rechaza sin escribir", () => {
  const { storage, catalog } = freshSave();
  const raw = storage.getItem(STORAGE_KEYS.bundle);

  const result = complete(storage, catalog, "empleo", "no-existe");
  assert.equal(result.status, "rejected");
  assert.equal(result.error.code, "UNKNOWN_MISSION");
  assert.equal(storage.getItem(STORAGE_KEYS.bundle), raw);
});

test("R1: recompensa inválida invalida la sección y no deja mutar", () => {
  const { storage, catalog, bundle } = freshSave();
  const mission = pendingOf(bundle, catalog, "empleo")[0];
  complete(storage, catalog, "empleo", mission.id);

  for (const bad of [{ xp: -5, coins: 1 }, { xp: "x", coins: 1 }, { xp: 10, coins: 1.5 }]) {
    const corrupted = currentBundle(storage);
    corrupted.play.completions[mission.id].reward = bad;
    const report = validatePlayState(corrupted, catalog, {});
    assert.equal(report.ok, false, `reward ${JSON.stringify(bad)} debe rechazarse`);
  }
});

test("R1: reward presente en play v1 es incoherente y se rechaza", () => {
  const { storage, catalog, bundle } = freshSave();
  const mission = pendingOf(bundle, catalog, "empleo")[0];
  complete(storage, catalog, "empleo", mission.id);

  const corrupted = currentBundle(storage);
  corrupted.play.version = 1; // versión vieja con registros nuevos
  const report = validatePlayState(corrupted, catalog, {});
  assert.equal(report.ok, false);
});

/* ========================================================================== */
/* 6. Fallos de backup y de escritura                                        */
/* ========================================================================== */

function storageWithFailingBackup(inner) {
  return {
    getItem: (k) => inner.getItem(k),
    setItem: (k, v) => {
      if (String(k).startsWith(STORAGE_KEYS.backupPrefix)) throw new Error("cuota de backup agotada");
      inner.setItem(k, v);
    },
    removeItem: (k) => inner.removeItem(k),
    key: (i) => inner.key(i),
    get length() {
      return inner.length;
    },
    _keys: () => inner._keys()
  };
}

test("R1: si falla el backup, el bundle activo queda byte a byte igual", () => {
  const { storage, catalog, bundle } = freshSave();
  const mission = pendingOf(bundle, catalog, "empleo")[0];
  const raw = storage.getItem(STORAGE_KEYS.bundle);

  const result = applyGameplayMutation(
    storageWithFailingBackup(storage),
    catalog,
    { type: "mission.complete", system: "empleo", missionId: mission.id, date: DAY },
    { at: AT, date: DAY }
  );

  assert.equal(result.status, "rejected");
  assert.equal(result.error.code, "BACKUP_FAILED");
  assert.equal(storage.getItem(STORAGE_KEYS.bundle), raw, "nada se escribió");
});

function storageWithIgnoredWrite(inner) {
  return {
    getItem: (k) => inner.getItem(k),
    setItem: (k, v) => {
      if (k === STORAGE_KEYS.bundle) return; // escritura silenciosamente perdida
      inner.setItem(k, v);
    },
    removeItem: (k) => inner.removeItem(k),
    key: (i) => inner.key(i),
    get length() {
      return inner.length;
    },
    _keys: () => inner._keys()
  };
}

test("R1: si la relectura no coincide, no hay éxito falso y el save es recuperable", () => {
  const { storage, catalog, bundle } = freshSave();
  const mission = pendingOf(bundle, catalog, "empleo")[0];
  const raw = storage.getItem(STORAGE_KEYS.bundle);

  const result = applyGameplayMutation(
    storageWithIgnoredWrite(storage),
    catalog,
    { type: "mission.complete", system: "empleo", missionId: mission.id, date: DAY },
    { at: AT, date: DAY }
  );

  assert.equal(result.status, "rejected");
  assert.equal(result.error.code, "WRITE_VERIFY_FAILED");
  const after = storage.getItem(STORAGE_KEYS.bundle);
  assert.equal(after, raw, "el activo sigue siendo el previo");
  assert.doesNotThrow(() => loadOdea2(JSON.parse(after), catalog), "el save previo sigue cargando");
});

/* ========================================================================== */
/* 7. Export / restauración con recompensa fijada                            */
/* ========================================================================== */

test("R1: exportar y restaurar conserva el significado de la recompensa", () => {
  const { storage, catalog, bundle } = freshSave();
  const mission = pendingOf(bundle, catalog, "empleo")[0];
  complete(storage, catalog, "empleo", mission.id);

  const exported = currentBundle(storage);
  const expected = derived(exported, catalog).totalXP;

  const destino = createMemoryStorage();
  const restored = restoreBundle(JSON.parse(JSON.stringify(exported)), { storage: destino, catalog });

  assert.equal(derived(restored.bundle, catalog).totalXP, expected);
  assert.deepEqual(
    restored.bundle.play.completions[mission.id].reward,
    exported.play.completions[mission.id].reward
  );
});

/* ========================================================================== */
/* 8. Versión incompatible: solo lectura                                     */
/* ========================================================================== */

test("R1: un play de versión futura no permite mutar", () => {
  const { storage, catalog, bundle } = freshSave();
  const mission = pendingOf(bundle, catalog, "empleo")[0];
  complete(storage, catalog, "empleo", mission.id);

  const futuro = currentBundle(storage);
  futuro.play.version = PLAY_VERSION + 1;
  storage.setItem(STORAGE_KEYS.bundle, JSON.stringify(futuro));

  const otra = pendingOf(bundle, catalog, "empleo")[1];
  const result = complete(storage, catalog, "empleo", otra.id);

  assert.equal(result.status, "rejected");
  assert.equal(result.error.code, "BUNDLE_TOO_NEW");
  assert.equal(
    JSON.parse(storage.getItem(STORAGE_KEYS.bundle)).play.version,
    PLAY_VERSION + 1,
    "el bundle no se degradó"
  );
});

/* ========================================================================== */
/* 9. Vida: el XP congelado manda sobre la curva                             */
/* ========================================================================== */

test("R1: en Vida el XP congelado se usa en vez del catálogo", () => {
  const { storage, catalog, bundle } = freshSave();
  const one = pendingOf(bundle, catalog, "vida").find((m) => m.cls === "one");
  complete(storage, catalog, "vida", one.id);

  const saved = currentBundle(storage);
  const before = derived(saved, catalog).xpBreakdown.vida;

  const futuro = JSON.parse(JSON.stringify(catalog));
  futuro.vida[one.id].xp = 9999;

  assert.equal(derived(saved, futuro).xpBreakdown.vida, before);
});
