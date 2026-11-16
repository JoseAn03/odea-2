/**
 * sagas.test.js — Mirador de Sagas: capítulos y jefes.
 *
 * Sagas es el único dominio con dos fuentes de XP y ninguna es un mapa plano:
 * los capítulos reparten su XP entre dos categorías (`split`), los jefes suman
 * un valor fijo. Estos tests fijan las dos rutas por separado.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { STORAGE_KEYS, applyGameplayMutation, createMemoryStorage, importBundle } from "../src/storage.js";
import { missionsOf } from "../src/catalog.js";
import { systemMissions } from "../src/gameplay.js";
import { derive, sourcesFromMigrated } from "../src/derive.js";

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

function complete(storage, catalog, missionId, date = DAY) {
  return applyGameplayMutation(
    storage,
    catalog,
    { type: "mission.complete", system: "sagas", missionId, date },
    { at: AT, date }
  );
}

/* ========================================================================== */

test("sagas: 12 capítulos y 16 jefes, todo de una sola vez", () => {
  const catalog = loadCatalog();
  const missions = missionsOf(catalog, "sagas");

  const chapters = missions.filter((m) => m.map.startsWith("sagas."));
  const bosses = missions.filter((m) => m.map === "bosses");

  assert.equal(chapters.length, 5 + 7, "video 5 + roblox 7");
  assert.equal(bosses.length, 16);
  assert.equal(missions.length, 28);
  assert.ok(missions.every((m) => m.cls === "one"), "ninguna es repetible");
});

test("sagas: los capítulos conservan el XP del catálogo", () => {
  const catalog = loadCatalog();
  const missions = missionsOf(catalog, "sagas");
  const byId = Object.fromEntries(missions.map((m) => [m.id, m]));

  assert.equal(byId["video-1"].xp, 200);
  assert.equal(byId["roblox-5"].xp, 280);
  assert.equal(byId.cronos.xp, 600, "los jefes traen su XP del mapa bosses");
  assert.equal(byId["video-1"].map, "sagas.video");
  assert.equal(byId["roblox-1"].map, "sagas.roblox");
});

test("sagas: lo migrado se marca completado y no se ofrece", () => {
  const { catalog, bundle } = freshSave();
  const state = systemMissions(bundle, catalog, "sagas", DAY);

  assert.equal(state.completed.length, 4, "2 capítulos + 2 jefes");
  for (const id of ["video-1", "video-2", "cronos", "hades"]) {
    assert.equal(state.pending.find((m) => m.id === id), undefined, `${id} ya estaba hecho`);
  }
  assert.equal(state.pending.length, 24);
});

test("sagas: completar un capítulo reparte el XP entre las dos categorías", () => {
  const { storage, catalog, bundle } = freshSave();
  const saga = catalog.sagas.find((s) => s.id === "video");
  const chapter = saga.chapters.find((ch) => ch.id === "video-3");
  const expected = Math.round(chapter.xp * saga.split.kid) + Math.round(chapter.xp * saga.split.pow);

  const before = derived(bundle, catalog).totalXP;
  assert.equal(complete(storage, catalog, "video-3").status, "applied");
  const after = derived(currentBundle(storage), catalog).totalXP;

  assert.equal(after - before, expected, "el total sube exactamente el reparto del capítulo");
});

test("sagas: completar un jefe suma el componente de jefes", () => {
  const { storage, catalog, bundle } = freshSave();
  const before = derived(bundle, catalog).xpBreakdown.bosses;

  assert.equal(complete(storage, catalog, "atenea").status, "applied");
  const after = derived(currentBundle(storage), catalog).xpBreakdown.bosses;

  assert.equal(after - before, Number(catalog.bosses.atenea));
});

test("sagas: completar algo migrado es duplicate y no escribe", () => {
  const { storage, catalog } = freshSave();
  const raw = storage.getItem(STORAGE_KEYS.bundle);

  for (const id of ["video-1", "cronos"]) {
    assert.equal(complete(storage, catalog, id).status, "duplicate", `${id} ya estaba hecho`);
  }
  assert.equal(storage.getItem(STORAGE_KEYS.bundle), raw, "el save no cambió");
});

test("sagas: el XP migrado no se cuenta dos veces", () => {
  const { storage, catalog, bundle } = freshSave();
  const before = derived(bundle, catalog).totalXP;

  for (const id of ["video-1", "video-2", "cronos", "hades"]) complete(storage, catalog, id);

  assert.equal(derived(currentBundle(storage), catalog).totalXP, before);
});

test("sagas: la saga semanal y el jefe semanal siguen fuera del alcance", () => {
  const { storage, catalog, bundle } = freshSave();
  const weeklyBefore = JSON.stringify(
    (currentBundle(storage).worlds.sagas || {}).data
      ? currentBundle(storage).worlds.sagas.data.weekly
      : null
  );

  complete(storage, catalog, "video-3");

  const after = currentBundle(storage);
  const weeklyAfter = after.worlds.sagas.data.weekly;
  assert.equal(JSON.stringify(weeklyAfter), weeklyBefore, "la mecánica semanal no se toca");
});

/* ========================================================================== */
/* R1 + Sagas: el XP congelado manda sobre el catálogo                        */
/* ========================================================================== */

test("sagas + R1: cambiar el capítulo en el catálogo no reescribe el historial", () => {
  const { storage, catalog, bundle } = freshSave();
  const fresh = systemMissions(bundle, catalog, "sagas", DAY).pending.find((m) => m.map === "sagas.video");

  assert.equal(complete(storage, catalog, fresh.id).status, "applied");
  const saved = currentBundle(storage);
  const before = derived(saved, catalog);

  const futuro = JSON.parse(JSON.stringify(catalog));
  const saga = futuro.sagas.find((s) => s.id === "video");
  saga.chapters.find((ch) => ch.id === fresh.id).xp = 9999;

  const after = derived(saved, futuro);
  assert.equal(after.totalXP, before.totalXP, "el capítulo congelado no se revaloriza");
  assert.equal(after.xpBreakdown.vida, before.xpBreakdown.vida);
});

test("sagas + R1: cambiar el jefe en el catálogo no reescribe el historial", () => {
  const { storage, catalog, bundle } = freshSave();
  const boss = systemMissions(bundle, catalog, "sagas", DAY).pending.find((m) => m.map === "bosses");

  assert.equal(complete(storage, catalog, boss.id).status, "applied");
  const saved = currentBundle(storage);
  const before = derived(saved, catalog).xpBreakdown.bosses;

  const futuro = JSON.parse(JSON.stringify(catalog));
  futuro.bosses[boss.id] = 9999;

  assert.equal(derived(saved, futuro).xpBreakdown.bosses, before);
});
