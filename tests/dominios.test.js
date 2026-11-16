/**
 * dominios.test.js — Entrega D: Empleo y Vida jugables.
 *
 * Cubre lo que la guía exige antes de abrir un dominio: inventario completo del
 * catálogo, frecuencia real por misión (Vida mezcla tres clases) y escritura
 * por la ruta única sin colisiones entre sistemas.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { STORAGE_KEYS, applyGameplayMutation, createMemoryStorage, importBundle } from "../src/storage.js";
import { missionsOf } from "../src/catalog.js";
import { occurrenceKey, systemMissions } from "../src/gameplay.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const FIXTURE_PATH = join(root, "fixtures", "odea-progreso-sintetico.json");
const CATALOG_PATH = join(root, "data", "xp-catalog.json");

const REFERENCE_DATE = "2026-11-10";
const MIGRATED_AT = "2026-11-10T12:00:00.000Z";
const AT = "2026-11-10T15:04:05.000Z";
const DAY = "2026-11-16";
const NEXT_DAY = "2026-11-17";

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

function complete(storage, catalog, system, missionId, date = DAY) {
  return applyGameplayMutation(
    storage,
    catalog,
    { type: "mission.complete", system, missionId, date },
    { at: AT, date }
  );
}

/** El save PERSISTIDO: `bundle` del import no refleja las mutaciones. */
function currentBundle(storage) {
  return JSON.parse(storage.getItem(STORAGE_KEYS.bundle));
}

/* ========================================================================== */

test("dominios: el inventario cubre Empleo y Vida completos", () => {
  const catalog = loadCatalog();

  assert.equal(missionsOf(catalog, "empleo").length, 30 + 18 + 32, "jobs + b2b + puente");
  assert.equal(missionsOf(catalog, "vida").length, 192);

  const maps = new Set(missionsOf(catalog, "empleo").map((m) => m.map));
  assert.deepEqual([...maps].sort(), ["b2b", "jobs", "puente"]);
});

test("dominios: un sistema no jugable no inventa misiones", () => {
  const catalog = loadCatalog();
  assert.deepEqual(missionsOf(catalog, "campaign"), []);
  assert.deepEqual(missionsOf(catalog, "inexistente"), []);
});

test("dominios: Vida respeta la frecuencia REAL de cada misión", () => {
  const catalog = loadCatalog();
  const vida = missionsOf(catalog, "vida");
  const byCls = vida.reduce((acc, m) => ({ ...acc, [m.cls]: (acc[m.cls] || 0) + 1 }), {});

  assert.equal(byCls.daily, 49);
  assert.equal(byCls.weekly, 60);
  assert.equal(byCls.one, 83);
  assert.equal(byCls.daily + byCls.weekly + byCls.one, vida.length);
});

test("dominios: Empleo es todo de una sola vez", () => {
  const catalog = loadCatalog();
  const empleo = missionsOf(catalog, "empleo");
  assert.ok(empleo.every((m) => m.cls === "one"), "jobs/b2b/puente no son repetibles");
  assert.ok(empleo.every((m) => m.xp > 0), "toda misión de Empleo tiene XP");
});

test("dominios: sin completaciones todo está pendiente y las pendientes van primero", () => {
  const catalog = loadCatalog();
  const empty = { core: {}, play: { completions: {}, checkins: {} } };

  const vida = systemMissions(empty, catalog, "vida", DAY);
  assert.equal(vida.pending.length, 192);
  assert.equal(vida.completed.length, 0);
  assert.deepEqual(
    vida.missions.map((m) => m.id),
    vida.pending.map((m) => m.id)
  );
});

test("dominios: una diaria vuelve a estar pendiente mañana", () => {
  const { storage, catalog, bundle } = freshSave();
  const daily = missionsOf(catalog, "vida").find((m) => m.cls === "daily");

  assert.equal(complete(storage, catalog, "vida", daily.id, DAY).status, "applied");

  const sameDay = systemMissions(currentBundle(storage), catalog, "vida", DAY);
  const nextDay = systemMissions(currentBundle(storage), catalog, "vida", NEXT_DAY);
  assert.equal(sameDay.pending.find((m) => m.id === daily.id), undefined, "hoy ya no está pendiente");
  assert.equal(sameDay.completed.find((m) => m.id === daily.id).id, daily.id);
  assert.ok(nextDay.pending.find((m) => m.id === daily.id), "mañana vuelve a estar pendiente");
});

test("dominios: una semanal cambia de periodo, no de identidad", () => {
  const { storage, catalog } = freshSave();
  const weekly = missionsOf(catalog, "vida").find((m) => m.cls === "weekly");

  assert.equal(complete(storage, catalog, "vida", weekly.id, DAY).status, "applied");
  assert.equal(
    complete(storage, catalog, "vida", weekly.id, DAY).status,
    "duplicate",
    "misma semana ISO → duplicada"
  );

  const nextWeek = "2026-11-24";
  assert.equal(complete(storage, catalog, "vida", weekly.id, nextWeek).status, "applied");
});

test("dominios: una de una sola vez queda hecha para siempre", () => {
  const { storage, catalog, bundle } = freshSave();
  const one = missionsOf(catalog, "vida").find((m) => m.cls === "one");

  assert.equal(complete(storage, catalog, "vida", one.id, DAY).status, "applied");
  const later = systemMissions(currentBundle(storage), catalog, "vida", NEXT_DAY);
  assert.equal(later.pending.find((m) => m.id === one.id), undefined);
  assert.equal(complete(storage, catalog, "vida", one.id, NEXT_DAY).status, "duplicate");
});

test("dominios: completar en Empleo escribe por la ruta única", () => {
  const { storage, catalog, bundle } = freshSave();
  /* Una que NO viniera ya completa de ODEA 1: las migradas se rechazan. */
  const mission = systemMissions(bundle, catalog, "empleo", DAY).pending.find((m) => m.map === "jobs");

  const result = complete(storage, catalog, "empleo", mission.id);
  assert.equal(result.status, "applied");
  assert.ok(result.backup, "la escritura deja backup");

  const saved = JSON.parse(storage.getItem(STORAGE_KEYS.bundle));
  assert.equal(saved.play.completions[mission.id].system, "empleo");
  assert.equal(saved.play.completions[mission.id].missionId, mission.id);
});

test("dominios: los sistemas no se pisan entre sí", () => {
  const { storage, catalog, bundle } = freshSave();
  const vidaDaily = missionsOf(catalog, "vida").find((m) => m.cls === "daily");
  const empleo = missionsOf(catalog, "empleo")[0];

  complete(storage, catalog, "vida", vidaDaily.id, DAY);
  complete(storage, catalog, "empleo", empleo.id, DAY);

  const vida = systemMissions(currentBundle(storage), catalog, "vida", DAY);
  const emp = systemMissions(currentBundle(storage), catalog, "empleo", DAY);
  assert.equal(vida.pending.find((m) => m.id === vidaDaily.id), undefined);
  assert.equal(emp.pending.find((m) => m.id === empleo.id), undefined);

  /* La clave de la diaria y la del único no colisionan. */
  assert.notEqual(occurrenceKey(vidaDaily.id, "daily", DAY), occurrenceKey(empleo.id, "one", DAY));
});
