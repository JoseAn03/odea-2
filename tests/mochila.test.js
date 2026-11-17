/**
 * mochila.test.js — proyección de la Mochila (solo lectura).
 *
 * Verifica que la Mochila junte lo que existe de verdad en el save y que no
 * invente objetos, precios ni nombres. Las dos tiendas de ODEA 1 se mantienen
 * separadas: equipo del núcleo y cosméticos del Tesoro.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createMemoryStorage, importBundle } from "../src/storage.js";
import { derive, sourcesFromMigrated } from "../src/derive.js";
import { buildInventory } from "../js/hud.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const FIXTURE_PATH = join(root, "fixtures", "odea-progreso-sintetico.json");
const CATALOG_PATH = join(root, "data", "xp-catalog.json");

function freshSave() {
  const storage = createMemoryStorage();
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
  const imported = importBundle(JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")), {
    catalog,
    storage,
    referenceDate: "2026-11-10",
    migratedAt: "2026-11-10T12:00:00.000Z"
  });
  assert.equal(imported.status, "active");
  return { catalog, bundle: imported.bundle };
}

function inventoryOf(bundle, catalog) {
  const derived = derive(sourcesFromMigrated(bundle, catalog), catalog, "2026-11-10");
  return buildInventory(bundle, catalog, derived);
}

/* ========================================================================== */

test("mochila: el catálogo de equipo viene de la fuente", () => {
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
  assert.equal(Object.keys(catalog.shop).length, 25);
  assert.equal(Object.values(catalog.shop).filter((i) => i.grantOnly).length, 5);
  assert.equal(Object.keys(catalog.cosmetics).length, 4);
  assert.equal(catalog.shop.hl_iron.nombre, "Casco de Hierro");
  assert.equal(catalog.shop.hl_iron.power, 300);
});

test("mochila: el equipo sale de core.shop con nombres y estado", () => {
  const { catalog, bundle } = freshSave();
  const inv = inventoryOf(bundle, catalog);

  const casco = inv.equipment.find((i) => i.id === "hl_iron");
  assert.equal(casco.nombre, "Casco de Hierro");
  assert.equal(casco.power, 300);
  assert.equal(casco.slotLabel, "Cabeza");
  assert.equal(casco.equipado, true);
  assert.equal(casco.conocido, true);

  assert.equal(inv.equipmentEquipped.length, 2, "casco y botas están equipados");
  assert.equal(inv.equipmentStored.length, 0);
});

test("mochila: un objeto sin catálogo no se inventa", () => {
  const { catalog, bundle } = freshSave();
  const copia = JSON.parse(JSON.stringify(bundle));
  copia.core.shop.owned.push("objeto-inexistente");

  const inv = buildInventory(copia, catalog, derive(sourcesFromMigrated(copia, catalog), catalog, "2026-11-10"));
  const raro = inv.equipment.find((i) => i.id === "objeto-inexistente");

  assert.equal(raro.conocido, false, "sin catálogo se marca como desconocido");
  assert.equal(raro.nombre, "objeto-inexistente", "se muestra el id, no un nombre inventado");
  assert.equal(raro.power, null, "no se inventan propiedades");
});

test("mochila: los cosméticos del Tesoro son otra tienda", () => {
  const { catalog, bundle } = freshSave();
  const inv = inventoryOf(bundle, catalog);

  assert.equal(inv.cosmetics.length, 4);
  assert.ok(inv.cosmetics.every((c) => c.conocido), "los cuatro están en el catálogo");

  const equipoIds = new Set(inv.equipment.map((i) => i.id));
  for (const cosmetico of inv.cosmetics) {
    assert.ok(!equipoIds.has(cosmetico.id), `${cosmetico.id} no puede estar en las dos tiendas`);
  }
});

test("mochila: los recursos no se mezclan ni se recalculan", () => {
  const { catalog, bundle } = freshSave();
  const inv = inventoryOf(bundle, catalog);

  const nucleo = inv.resources.find((r) => r.id === "coins");
  const tesoro = inv.resources.find((r) => r.id === "tesoro");

  assert.equal(tesoro.value, bundle.worlds.tesoro.data.monedas, "monedas del Tesoro tal cual");
  assert.ok(Number.isFinite(nucleo.value), "el saldo del núcleo es derivado y finito");
  assert.notEqual(nucleo.id, tesoro.id, "son cuentas distintas");
});

test("mochila: abrir la mochila no escribe nada", () => {
  const { catalog, bundle } = freshSave();
  const before = JSON.stringify(bundle);

  inventoryOf(bundle, catalog);
  inventoryOf(bundle, catalog);

  assert.equal(JSON.stringify(bundle), before, "la proyección no muta el bundle");
});

test("mochila: es de solo consulta y lo declara", () => {
  const { catalog, bundle } = freshSave();
  const inv = inventoryOf(bundle, catalog);
  assert.equal(inv.readOnly, true);
});
