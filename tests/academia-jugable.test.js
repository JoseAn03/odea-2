/**
 * academia-jugable.test.js — Distrito IA: Academia jugable sin XP.
 *
 * Decisión C1: las misiones de Academia otorgan **0 XP**. Su recompensa es la
 * sinergia del Tesoro, verificada en `assets/odea-tesoro.js`:
 *
 *   onAcademiaMision()  → +3 monedas, máximo 3 al día  (clave academia:fecha)
 *   grantSinergia("ruta:"+id, 15) → +15 al cerrar una ruta
 *
 * `worlds` es inmutable, así que la sinergia se guarda como DELTA en
 * `play.academia` y el saldo del Tesoro se deriva.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { STORAGE_KEYS, applyGameplayMutation, createMemoryStorage, importBundle } from "../src/storage.js";
import { missionsOf } from "../src/catalog.js";
import {
  ACADEMIA_ROUTE_COINS,
  ACADEMIA_SYNERGY_COINS,
  ACADEMIA_SYNERGY_DAILY_CAP,
  academiaRoutes,
  academiaStateOf,
  systemMissions
} from "../src/gameplay.js";
import { validatePlayState } from "../src/validate.js";
import { derive, sourcesFromMigrated } from "../src/derive.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const FIXTURE_PATH = join(root, "fixtures", "odea-progreso-sintetico.json");
const CATALOG_PATH = join(root, "data", "xp-catalog.json");

const REFERENCE_DATE = "2026-11-10";
const MIGRATED_AT = "2026-11-10T12:00:00.000Z";
const AT = "2026-11-16T15:00:00.000Z";
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

function complete(storage, catalog, missionId, date = DAY) {
  return applyGameplayMutation(
    storage,
    catalog,
    { type: "mission.complete", system: "academia", missionId, date },
    { at: AT, date }
  );
}

/* ========================================================================== */

test("academia: catálogo de 28 misiones reales en 6 rutas", () => {
  const catalog = loadCatalog();
  const missions = missionsOf(catalog, "academia");

  assert.equal(missions.length, 28, "el paso meta no es una misión completable");
  assert.equal(Object.keys(catalog.academia).length, 29, "29 entradas: 28 + el paso meta");

  const routes = academiaRoutes(catalog);
  assert.equal(Object.keys(routes).length, 6);
  assert.deepEqual(
    Object.fromEntries(Object.entries(routes).map(([id, list]) => [id, list.length])),
    { arranque: 5, google: 7, microsoft: 6, ia: 4, demanda: 3, vitrina: 4 }
  );
  assert.ok(missions.every((m) => m.xp === 0), "ninguna misión otorga XP");
});

test("academia: el paso meta no se puede completar", () => {
  const { storage, catalog } = freshSave();
  const result = complete(storage, catalog, "meta-final");
  assert.equal(result.status, "rejected");
  assert.equal(result.error.code, "UNKNOWN_MISSION");
});

test("academia: la completación registra xp 0 y monedas 0", () => {
  const { storage, catalog, bundle } = freshSave();
  const mission = systemMissions(bundle, catalog, "academia", DAY).pending[0];

  assert.equal(complete(storage, catalog, mission.id).status, "applied");
  const record = currentBundle(storage).play.completions[mission.id];
  assert.equal(record.reward.xp, 0);
  assert.equal(record.reward.coins, 0, "Academia no paga monedas por completación");
});

test("academia: no aporta XP ni monedas al saldo del núcleo", () => {
  const { storage, catalog, bundle } = freshSave();
  const before = derive(sourcesFromMigrated(bundle, catalog), catalog, REFERENCE_DATE);

  const missions = systemMissions(bundle, catalog, "academia", DAY).pending.slice(0, 4);
  for (const mission of missions) complete(storage, catalog, mission.id);

  const after = derive(sourcesFromMigrated(currentBundle(storage), catalog), catalog, REFERENCE_DATE);
  assert.equal(after.totalXP, before.totalXP, "el XP total no se mueve");
  assert.equal(after.coins.earned, before.coins.earned, "el saldo del núcleo no se mueve");
});

test("academia: la sinergia paga +3 y respeta el tope diario de 3", () => {
  const { storage, catalog, bundle } = freshSave();
  const missions = systemMissions(bundle, catalog, "academia", DAY).pending;

  const start = academiaStateOf(bundle).monedasGanadas;
  /* Cinco completaciones el mismo día: solo tres pagan sinergia. */
  for (const mission of missions.slice(0, 5)) complete(storage, catalog, mission.id, DAY);

  const state = academiaStateOf(currentBundle(storage));
  assert.equal(state.sinergias[`academia:${DAY}`], ACADEMIA_SYNERGY_DAILY_CAP);
  /* +3 sinergias × 3 + posible cierre de ruta de esas misiones. */
  assert.ok(
    state.monedasGanadas - start >= ACADEMIA_SYNERGY_COINS * ACADEMIA_SYNERGY_DAILY_CAP,
    "al menos las tres sinergias del día"
  );
});

test("academia: cerrar una ruta paga +15 una sola vez", () => {
  const { storage, catalog, bundle } = freshSave();
  const routes = academiaRoutes(catalog);
  const arranque = routes.arranque.map((m) => m.id);
  const pending = systemMissions(bundle, catalog, "academia", DAY).pending.map((m) => m.id);

  /* Completa lo que falte de la ruta "arranque" (tiene 5 pasos, todos reales). */
  const toComplete = arranque.filter((id) => pending.includes(id));
  for (const id of toComplete) complete(storage, catalog, id, DAY);

  const state = academiaStateOf(currentBundle(storage));
  assert.ok(state.rutas.includes("arranque"), "la ruta queda avisada");
  assert.equal(
    state.monedasGanadas,
    ACADEMIA_SYNERGY_COINS * ACADEMIA_SYNERGY_DAILY_CAP + ACADEMIA_ROUTE_COINS,
    "3 sinergias + una ruta"
  );

  /* Completar otra misión no vuelve a pagar la ruta. */
  const otra = systemMissions(currentBundle(storage), catalog, "academia", "2026-11-17").pending[0];
  complete(storage, catalog, otra.id, "2026-11-17");
  const after = academiaStateOf(currentBundle(storage));
  assert.equal(after.rutas.filter((r) => r === "arranque").length, 1, "la ruta no se duplica");
});

test("academia: el saldo del Tesoro se deriva del delta, no se edita", () => {
  const { storage, catalog, bundle } = freshSave();
  const base = academiaStateOf(bundle);
  const mission = systemMissions(bundle, catalog, "academia", DAY).pending[0];

  complete(storage, catalog, mission.id);

  const after = academiaStateOf(currentBundle(storage));
  assert.equal(after.tesoroMigrado, base.tesoroMigrado, "el mundo migrado no se toca");
  assert.equal(after.monedas, after.tesoroMigrado + after.monedasGanadas);
  assert.equal(
    currentBundle(storage).worlds.tesoro.data.monedas,
    bundle.worlds.tesoro.data.monedas,
    "worlds.tesoro sigue intacto"
  );
});

test("academia: lo migrado no se ofrece y la validación sigue intacta", () => {
  const { storage, catalog, bundle } = freshSave();
  const state = systemMissions(bundle, catalog, "academia", DAY);

  assert.equal(state.completed.length, 3, "las tres de `hechas` en el fixture");
  for (const id of ["ina-ia", "li-vitrina", "cv-final"]) {
    assert.equal(state.pending.find((m) => m.id === id), undefined, `${id} ya estaba hecha`);
  }

  const mission = state.pending[0];
  complete(storage, catalog, mission.id);
  const saved = currentBundle(storage);

  assert.equal(validatePlayState(saved, catalog, {}).ok, true);
  assert.equal(saved.play.version, 3);
});

test("academia: una sección aditiva corrupta se rechaza", () => {
  const { storage, catalog, bundle } = freshSave();
  const mission = systemMissions(bundle, catalog, "academia", DAY).pending[0];
  complete(storage, catalog, mission.id);

  for (const bad of [
    { monedasGanadas: -5 },
    { monedasGanadas: 1.5 },
    { rutas: "arranque" },
    { sinergias: { "academia:x": -1 } }
  ]) {
    const corrupted = currentBundle(storage);
    corrupted.play.academia = { sinergias: {}, monedasGanadas: 0, rutas: [], ...bad };
    assert.equal(validatePlayState(corrupted, catalog, {}).ok, false, JSON.stringify(bad));
  }
});
