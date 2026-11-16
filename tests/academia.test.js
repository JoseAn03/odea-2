/**
 * academia.test.js — paridad de Academia con la regla real de ODEA 1.
 *
 * ODEA 1 no tiene catálogo de actividades de Academia en el export: guarda un
 * mapa `hechas` y calcula el avance con una fórmula fija (min 28 → 29). Estos
 * tests fijan esa regla para que el panel no muestre un contador sin
 * denominador ni un porcentaje inventado.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { ACADEMIA_TOTAL, academiaProgress } from "../src/derive.js";

function hechas(n) {
  const map = {};
  for (let i = 0; i < n; i++) map[`actividad-${i}`] = "2026-11-01";
  return map;
}

test("academia: el denominador es el real de ODEA 1", () => {
  assert.equal(ACADEMIA_TOTAL, 29);
});

test("academia: sin actividades el avance es cero", () => {
  const result = academiaProgress({ hechas: {} });
  assert.deepEqual(result, { count: 0, total: 29, effective: 0, pct: 0 });
});

test("academia: por debajo del tope cuenta una por una", () => {
  for (const n of [1, 3, 12, 27]) {
    const result = academiaProgress({ hechas: hechas(n) });
    assert.equal(result.count, n);
    assert.equal(result.effective, n);
    assert.equal(result.pct, Math.round((n / 29) * 100));
  }
});

test("academia: llegar a 28 marca el 100% (regla de ODEA 1)", () => {
  const at28 = academiaProgress({ hechas: hechas(28) });
  assert.equal(at28.count, 28);
  assert.equal(at28.effective, 29, "28 hechas se cuentan como 29");
  assert.equal(at28.pct, 100);
});

test("academia: por encima de 28 no desborda", () => {
  const at40 = academiaProgress({ hechas: hechas(40) });
  assert.equal(at40.count, 40, "el conteo real se informa");
  assert.equal(at40.effective, 29, "el efectivo se topa");
  assert.equal(at40.pct, 100, "nunca pasa de 100%");
});

test("academia: datos inválidos no rompen la vista", () => {
  for (const value of [null, undefined, {}, { hechas: null }, { hechas: [] }, { hechas: "x" }]) {
    const result = academiaProgress(value);
    assert.equal(result.pct, 0);
    assert.equal(result.total, 29);
  }
});

test("academia: el fixture produce el avance esperado", async () => {
  const fs = await import("node:fs");
  const { createMemoryStorage, importBundle } = await import("../src/storage.js");

  const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
  const catalog = JSON.parse(fs.readFileSync(`${root}/data/xp-catalog.json`, "utf8"));
  const imported = importBundle(
    JSON.parse(fs.readFileSync(`${root}/fixtures/odea-progreso-sintetico.json`, "utf8")),
    {
      catalog,
      storage: createMemoryStorage(),
      referenceDate: "2026-11-10",
      migratedAt: "2026-11-10T12:00:00.000Z"
    }
  );

  const academia = imported.bundle.worlds.academia.data;
  const result = academiaProgress(academia);
  assert.equal(result.count, Object.keys(academia.hechas).length);
  assert.equal(result.total, 29);
  assert.equal(result.pct, Math.round((result.effective / 29) * 100));
});
