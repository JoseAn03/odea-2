/**
 * catalogo-live.test.js — invariantes de los catálogos extraídos de ODEA 1.
 *
 * `data/xp-catalog-live.json` lo produce `tools/extract-assets.mjs` desde el
 * commit ebb0fce (v6.00). Estos tests no extraen: verifican que lo extraído
 * siga siendo coherente y que nadie lo edite a mano para «cuadrar» números.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const catalog = JSON.parse(fs.readFileSync(join(root, "data", "xp-catalog-live.json"), "utf8"));

test("catálogo vivo: cada sección declara su fuente y su hash", () => {
  assert.match(catalog.meta.source, /ebb0fce/);

  for (const section of ["academia", "tesoro", "tesoroModulo", "garaje", "jefe", "anomalias"]) {
    assert.ok(catalog[section], `falta la sección ${section}`);
    assert.ok(catalog[section].source, `${section} sin fuente declarada`);
    assert.match(catalog[section].sha256, /^[0-9a-f]{64}$/, `${section} sin hash válido`);
  }
});

test("academia: 28 misiones y denominador 29", () => {
  const { missions, count, percentageTotal } = catalog.academia;

  assert.equal(count, 28);
  assert.equal(percentageTotal, 29, "el 29 es el denominador del porcentaje, no la cantidad");
  assert.equal(missions.length, 28);

  const ids = missions.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length, "sin ids repetidos");
  assert.ok(ids.includes("efset-examen") && ids.includes("ina-ia"));
  assert.ok(
    missions.every((m) => m.ruta && m.paso > 0),
    "toda misión declara su ruta y su paso"
  );
});

test("academia: la fuente no asigna XP a sus misiones", () => {
  /* Si algún día apareciera un campo de XP, este test avisa: cambiaría el
     modelo de recompensas del distrito. */
  const withXP = catalog.academia.missions.filter((m) => m.xp != null || m.puntos != null);
  assert.deepEqual(withXP, [], "Academia es checklist, no fuente de XP");
});

test("tesoro: 25 objetos, 20 comprables y 5 solo otorgados", () => {
  const { items, count, purchasable, grantedOnly } = catalog.tesoro;

  assert.equal(count, 25);
  assert.equal(items.length, 25);
  assert.equal(purchasable, 20);
  assert.equal(grantedOnly, 5);

  const ids = items.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length, "sin ids repetidos entre las dos tiendas");

  for (const item of items) {
    assert.ok(item.slot, `${item.id} sin slot`);
    assert.ok(item.power > 0, `${item.id} sin poder`);
    if (item.grantOnly) assert.equal(item.price, 0, `${item.id} es otorgado, no se cobra`);
    else assert.ok(item.price > 0, `${item.id} comprable debe tener precio`);
  }
});

test("tesoro: la tienda de cosméticos es distinta de la de equipamiento", () => {
  const equipment = new Set(catalog.tesoro.items.map((i) => i.id));
  const cosmetics = catalog.tesoroModulo.cosmetics;

  assert.equal(cosmetics.length, 4);
  for (const c of cosmetics) {
    assert.ok(!equipment.has(c.id), `${c.id} no debe estar en las dos tiendas`);
    assert.ok(c.precio > 0, `${c.id} sin precio`);
  }
  assert.deepEqual(catalog.tesoroModulo.rules, {
    precioEscudo: 20,
    maxEscudos: 2,
    xpPorMoneda: 10
  });
});

test("garaje: 13 misiones sobre vehículos que existen", () => {
  const { vehicles, missions, count } = catalog.garaje;

  assert.equal(vehicles.length, 2);
  assert.equal(count, 13);
  const known = new Set(vehicles.map((v) => v.id));
  for (const m of missions) {
    assert.ok(known.has(m.vehiculo), `${m.id} apunta a un vehículo inexistente`);
    assert.ok(m.dias > 0, `${m.id} sin periodicidad`);
  }

  const carro = missions.filter((m) => m.vehiculo === "carro");
  const moto = missions.filter((m) => m.vehiculo === "moto");
  assert.equal(carro.length, 7);
  assert.equal(moto.length, 6);
});

test("jefe y anomalías: sin id inventado en la fuente", () => {
  assert.equal(catalog.jefe.count, 4);
  assert.ok(
    catalog.jefe.bosses.every((b) => b.index >= 0 && !("id" in b)),
    "los jefes se identifican por índice, no por id fabricado"
  );

  assert.equal(catalog.anomalias.count, 8);
  assert.ok(
    catalog.anomalias.trivia.every((t) => t.index >= 0 && t.q && t.opciones.length >= 2),
    "cada carta tiene pregunta y opciones"
  );
  assert.ok(
    catalog.anomalias.trivia.every((t) => t.correcta >= 0 && t.correcta < t.opciones.length),
    "el índice correcto cae dentro de las opciones"
  );
});
