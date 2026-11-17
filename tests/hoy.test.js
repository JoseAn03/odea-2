/**
 * hoy.test.js — Centro «Hoy» (entrega 2).
 *
 * Verifica que «Hoy» sea un centro de control real sobre la MISMA ruta diaria
 * del Hub y la MISMA proyección del HUD: sin segundo catálogo, sin cálculos
 * paralelos y sin premios por reclamar.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { STORAGE_KEYS, applyGameplayMutation, createMemoryStorage, importBundle } from "../src/storage.js";
import { buildHud, buildToday } from "../js/hud.js";
import { routeForDay } from "../src/gameplay.js";
import { derive, sourcesFromMigrated } from "../src/derive.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const FIXTURE_PATH = join(root, "fixtures", "odea-progreso-sintetico.json");
const CATALOG_PATH = join(root, "data", "xp-catalog.json");

const REFERENCE_DATE = "2026-11-10";
const MIGRATED_AT = "2026-11-10T12:00:00.000Z";
const DAY = "2026-11-16";

function freshSave() {
  const storage = createMemoryStorage();
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
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

function complete(storage, catalog, missionId) {
  return applyGameplayMutation(
    storage,
    catalog,
    { type: "mission.complete", system: "hub", missionId, date: DAY },
    { at: `${DAY}T12:00:00.000Z`, date: DAY }
  );
}

/* ========================================================================== */

test("hoy: usa la MISMA proyección que el HUD", () => {
  const { catalog, bundle } = freshSave();
  const today = buildToday(bundle, catalog, DAY);
  const hud = buildHud(bundle, catalog);

  assert.deepEqual(today.hud, hud, "no hay una segunda proyección de nivel/XP/saldo");
  assert.equal(today.hud.totalXP, hud.totalXP);
  assert.equal(today.hud.coins.balance, hud.coins.balance);
  assert.equal(today.hud.streak, hud.streak);
});

test("hoy: usa la MISMA ruta diaria del Hub", () => {
  const { catalog, bundle } = freshSave();
  const today = buildToday(bundle, catalog, DAY);
  const route = routeForDay(bundle, catalog, DAY);

  assert.equal(today.route.date, route.date);
  assert.equal(today.route.catalogDay, route.catalogDay);
  assert.deepEqual(
    today.route.missions.map((m) => m.id),
    route.missions.map((m) => m.id),
    "no hay segundo catálogo diario"
  );
});

test("hoy: cada misión declara su distrito", () => {
  const { catalog, bundle } = freshSave();
  const today = buildToday(bundle, catalog, DAY);

  assert.ok(today.route.missions.length > 0);
  for (const mission of today.route.missions) {
    assert.equal(mission.districtId, "hub");
    assert.equal(mission.districtName, "Plaza Central");
    assert.ok(Number.isFinite(mission.xp), `${mission.id} sin XP`);
  }
});

test("hoy: la ruta arranca con su progreso real", () => {
  const { catalog, bundle } = freshSave();
  const today = buildToday(bundle, catalog, DAY);

  assert.equal(today.route.total, today.route.missions.length);
  assert.equal(today.route.done, today.route.missions.filter((m) => m.completed).length);
  assert.equal(today.route.allDone, today.route.done === today.route.total);
  assert.equal(typeof today.checkin.done, "boolean");
});

test("hoy: completar desde Hoy actualiza la ruta y el estado de la misión", () => {
  const { storage, catalog, bundle } = freshSave();
  const before = buildToday(bundle, catalog, DAY);
  const mision = before.route.pending[0];
  assert.ok(mision, "debe haber al menos una pendiente");

  assert.equal(complete(storage, catalog, mision.id).status, "applied");

  const after = buildToday(currentBundle(storage), catalog, DAY);
  assert.equal(after.route.done, before.route.done + 1, "la ruta avanza");
  assert.ok(
    after.route.missions.find((m) => m.id === mision.id).completed,
    "la misión figura hecha en la ruta"
  );
});

test("hoy: la misma misión no paga dos veces", () => {
  const { storage, catalog, bundle } = freshSave();
  const mision = buildToday(bundle, catalog, DAY).route.pending[0];

  complete(storage, catalog, mision.id);
  const xpDespues = derive(sourcesFromMigrated(currentBundle(storage), catalog), catalog, REFERENCE_DATE).totalXP;

  const reintento = complete(storage, catalog, mision.id);
  assert.equal(reintento.status, "duplicate");

  const xpFinal = derive(sourcesFromMigrated(currentBundle(storage), catalog), catalog, REFERENCE_DATE).totalXP;
  assert.equal(xpFinal, xpDespues, "el XP no se movió");
});

test("hoy: al completar la ruta no hay premio extra por reclamar", () => {
  const { storage, catalog, bundle } = freshSave();
  let today = buildToday(bundle, catalog, DAY);

  for (const mision of today.route.pending) complete(storage, catalog, mision.id);

  today = buildToday(currentBundle(storage), catalog, DAY);
  assert.equal(today.route.allDone, true, "la ruta queda completa");

  const derived = derive(sourcesFromMigrated(currentBundle(storage), catalog), catalog, REFERENCE_DATE);
  const coins = derived.coins.earned;

  /* Volver a mirar la ruta no otorga nada. */
  const otraVez = buildToday(currentBundle(storage), catalog, DAY);
  assert.equal(otraVez.route.allDone, true);
  assert.equal(
    derive(sourcesFromMigrated(currentBundle(storage), catalog), catalog, REFERENCE_DATE).coins.earned,
    coins,
    "consultar la ruta no cambia el saldo"
  );
});

test("hoy: construir el centro no escribe el bundle", () => {
  const { catalog, bundle } = freshSave();
  const before = JSON.stringify(bundle);

  buildToday(bundle, catalog, DAY);
  buildToday(bundle, catalog, DAY);

  assert.equal(JSON.stringify(bundle), before);
});
