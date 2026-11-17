/**
 * extractor.test.js — reproducibilidad del catálogo (v0.27.1).
 *
 * El extractor documentado reescribía `data/xp-catalog.json` entero y borraba
 * `academia`, `shop` y `cosmetics`, que vienen de otra extracción. Estos tests
 * fijan el contrato: regenerar conserva esas secciones, lo declara en `meta` y
 * el catálogo entregado las tiene completas.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PRESERVED_SECTIONS,
  checkCatalog,
  mergeCatalog,
  preservedCounts
} from "../tools/catalog-build.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const catalog = JSON.parse(fs.readFileSync(join(root, "data", "xp-catalog.json"), "utf8"));

/** Catálogo "recién extraído": solo las secciones que el extractor genera. */
function builtSample() {
  return {
    meta: { source: "ODEA 1", appVersion: "6.00", generatedAt: "2026-11-17T00:00:00.000Z" },
    campaign: { "fl-1": 10 },
    daily: { "d-1": { xp: 5, day: 1, slot: "A" } },
    counters: { campaign: 1, daily: 1, vida: 0, bosses: 0, sagas: 0 }
  };
}

test("catálogo: el archivo entregado tiene las secciones preservadas completas", () => {
  const integrity = checkCatalog(catalog);
  assert.deepEqual(integrity, { ok: true, missing: [], empty: [] });

  const counts = preservedCounts(catalog);
  assert.equal(counts.academia, 29, "Academia son 28 reales + el paso meta");
  assert.equal(counts.shop, 25, "la Tienda heredada de ODEA 1");
  assert.equal(counts.cosmetics, 4, "los cosméticos del Tesoro");
  assert.equal(catalog.academia["meta-final"].meta, true, "el paso meta no es una misión completable");
});

test("catálogo: regenerar preserva las secciones que el extractor no genera", () => {
  const merged = mergeCatalog(builtSample(), catalog);

  for (const key of PRESERVED_SECTIONS) {
    assert.deepEqual(merged[key], catalog[key], `${key} debe conservarse tal cual`);
  }
  assert.deepEqual(merged.meta.preservedSections, PRESERVED_SECTIONS);
  assert.deepEqual(merged.meta.preservedCounts, { academia: 29, shop: 25, cosmetics: 4 });
  assert.equal(merged.meta.appVersion, "6.00", "lo extraído manda en meta");
});

test("catálogo: lo extraído manda sobre lo anterior y los contadores se respetan", () => {
  const previous = {
    ...catalog,
    campaign: { viejo: 1 },
    counters: { campaign: 999 }
  };
  const merged = mergeCatalog(builtSample(), previous);

  assert.deepEqual(merged.campaign, { "fl-1": 10 }, "la campaña se reemplaza, no se mezcla");
  assert.equal(merged.counters.campaign, 1, "los contadores son los del build");
  assert.deepEqual(merged.shop, catalog.shop);
});

test("catálogo: sin copia anterior avisa que falta lo preservado", () => {
  const merged = mergeCatalog(builtSample(), null);

  assert.deepEqual(merged.meta.preservedSections, []);
  assert.match(merged.meta.preservedNote, /Sin copia anterior/);
  const integrity = checkCatalog(merged);
  assert.equal(integrity.ok, false);
  assert.deepEqual(integrity.missing, PRESERVED_SECTIONS);
});

test("catálogo: una sección preservada vacía se considera incompleta", () => {
  const merged = mergeCatalog(builtSample(), { academia: {}, shop: { a: 1 }, cosmetics: [] });
  const integrity = checkCatalog(merged);
  assert.equal(integrity.ok, false);
  assert.deepEqual(integrity.empty, ["academia", "cosmetics"]);
});
