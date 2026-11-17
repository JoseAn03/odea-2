/**
 * regresion-vistas.test.js — entrega 5: una sola fuente para XP y saldo.
 *
 * Las pantallas («HUD», «Hoy», «Mochila») no calculan nada por su cuenta: todas
 * consumen `derive()`. Este test fija ese contrato y falla si alguna se separa.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { STORAGE_KEYS, applyGameplayMutation, createMemoryStorage, importBundle } from "../src/storage.js";
import { buildHud, buildToday, buildInventory } from "../js/hud.js";
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

function canonico(bundle, catalog) {
  return derive(sourcesFromMigrated(bundle, catalog), catalog, REFERENCE_DATE);
}

/* ========================================================================== */

test("vistas: XP y saldo coinciden en HUD, Hoy y Mochila", () => {
  const { catalog, bundle } = freshSave();
  const derived = canonico(bundle, catalog);
  const hud = buildHud(bundle, catalog);
  const today = buildToday(bundle, catalog, DAY);
  const inv = buildInventory(bundle, catalog, derived);

  assert.equal(hud.totalXP, derived.totalXP);
  assert.equal(today.hud.totalXP, derived.totalXP, "Hoy no recalcula el XP");
  assert.equal(hud.coins.balance, derived.coins.balance);
  assert.equal(today.hud.coins.balance, derived.coins.balance, "Hoy no recalcula el saldo");

  const recursos = inv.resources.find((r) => r.id === "coins");
  assert.equal(recursos.value, derived.coins.balance, "la Mochila no recalcula el saldo");
});

test("vistas: siguen coincidiendo después de completar", () => {
  const { storage, catalog, bundle } = freshSave();
  /* Se completa en la MISMA fecha de referencia: completar días después
     cambia la racha y por tanto los multiplicadores de XP. Eso es correcto,
     pero no es lo que este test mide. */
  const mision = buildToday(bundle, catalog, REFERENCE_DATE).route.pending[0];
  assert.ok(mision);

  const resultado = applyGameplayMutation(
    storage,
    catalog,
    { type: "mission.complete", system: "hub", missionId: mision.id, date: REFERENCE_DATE },
    { at: `${REFERENCE_DATE}T12:00:00.000Z`, date: REFERENCE_DATE }
  );
  assert.equal(resultado.status, "applied");

  const after = JSON.parse(storage.getItem(STORAGE_KEYS.bundle));
  const derived = canonico(after, catalog);
  const hud = buildHud(after, catalog);
  const today = buildToday(after, catalog, REFERENCE_DATE);

  assert.equal(hud.totalXP, derived.totalXP);
  assert.equal(today.hud.totalXP, hud.totalXP);
  assert.equal(today.hud.coins.balance, hud.coins.balance);
  assert.ok(
    derived.totalXP > canonico(bundle, catalog).totalXP,
    "el XP subió en la misma fecha de referencia"
  );
});

test("vistas: el saldo sale del historial, no de un total guardado", () => {
  const { catalog, bundle } = freshSave();
  const derived = canonico(bundle, catalog);

  /* `balance` es earned - spent, ambos derivados de registros. */
  assert.equal(
    derived.coins.balance,
    Math.max(0, derived.coins.earned - derived.coins.spent),
    "el saldo es una resta de registros"
  );

  /* Y el HUD muestra exactamente eso. */
  const hud = buildHud(bundle, catalog);
  assert.equal(hud.coins.earned, derived.coins.earned);
  assert.equal(hud.coins.spent, derived.coins.spent);
});

test("vistas: abrir las tres pantallas no escribe el bundle", () => {
  const { catalog, bundle } = freshSave();
  const before = JSON.stringify(bundle);

  const derived = canonico(bundle, catalog);
  buildHud(bundle, catalog);
  buildToday(bundle, catalog, DAY);
  buildInventory(bundle, catalog, derived);

  assert.equal(JSON.stringify(bundle), before);
});

test("vistas: el Tesoro no se reinterpreta como moneda del núcleo", () => {
  const { catalog, bundle } = freshSave();
  const derived = canonico(bundle, catalog);
  const inv = buildInventory(bundle, catalog, derived);

  const nucleo = inv.resources.find((r) => r.id === "coins");
  const tesoro = inv.resources.find((r) => r.id === "tesoro");

  assert.equal(tesoro.value, bundle.worlds.tesoro.data.monedas);
  assert.notEqual(nucleo.value, tesoro.value, "son cuentas distintas y no se suman");
  assert.equal(nucleo.value, derived.coins.balance);
});
