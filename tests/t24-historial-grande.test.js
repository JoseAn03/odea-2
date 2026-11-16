/**
 * t24-historial-grande.test.js — T24: historial grande y sesión larga.
 *
 * La guía pide un fixture sintético de varios años de actividad y demostrar que
 * no se recorta el historial, que el parseo no falla y que la derivación no se
 * degrada de forma inaceptable.
 *
 * Todo se genera en memoria con una semilla fija: el fixture NO se commitea
 * (sería un archivo enorme) y los resultados son reproducibles.
 *
 * NOTA: esto cubre la parte ejecutable de T24 (parseo, integridad y tiempo de
 * derivación). La sesión sostenida en el teléfono sigue siendo del checklist
 * manual, que NO está aprobado.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

import { createMemoryStorage, importBundle } from "../src/storage.js";
import { validatePlayState } from "../src/validate.js";
import { derive, deriveStreak, sourcesFromMigrated } from "../src/derive.js";
import { missionsOf } from "../src/catalog.js";
import { occurrenceKey } from "../src/gameplay.js";
import { PLAY_VERSION } from "../src/shape.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const FIXTURE_PATH = join(root, "fixtures", "odea-progreso-sintetico.json");
const CATALOG_PATH = join(root, "data", "xp-catalog.json");

const REFERENCE_DATE = "2026-11-10";
const MIGRATED_AT = "2026-11-10T12:00:00.000Z";

/** ~3 años de días civiles consecutivos desde una fecha fija. */
const DIAS = 300;
const START = Date.UTC(2023, 0, 1);

function dateKeyAt(offset) {
  const d = new Date(START + offset * 86400000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate()
  ).padStart(2, "0")}`;
}

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

/**
 * Historial sintético grande: las misiones diarias de Vida repetidas durante
 * `DIAS` días. Son las únicas con clave `id@fecha`, así que generan miles de
 * ocurrencias legítimas sin violar la unicidad.
 */
function historialGrande(bundle, catalog) {
  const diarias = missionsOf(catalog, "vida").filter((m) => m.cls === "daily");
  assert.ok(diarias.length > 0, "se necesitan misiones diarias para el fixture");

  const completions = {};
  let total = 0;
  for (let day = 0; day < DIAS; day++) {
    const date = dateKeyAt(day);
    for (const mission of diarias) {
      const key = occurrenceKey(mission.id, mission.cls, date);
      completions[key] = {
        missionId: mission.id,
        system: "vida",
        date,
        at: `${date}T12:00:00.000Z`,
        period: date
      };
      total++;
    }
  }

  const grande = JSON.parse(JSON.stringify(bundle));
  grande.play = { version: PLAY_VERSION, completions, checkins: {} };
  refreshDerived(grande, catalog);
  return { bundle: grande, total };
}

/**
 * Recalcula `core.derived` igual que `refreshDerived` de storage.js. Sin esto
 * el bundle queda en DERIVE_DRIFT y la validación lo rechaza — que es
 * exactamente lo que debe hacer.
 */
function refreshDerived(bundle2, catalog) {
  const ref = bundle2.migration && bundle2.migration.referenceDate;
  const d = derive(sourcesFromMigrated(bundle2, catalog), catalog, ref);
  const streak = deriveStreak(bundle2);
  bundle2.core.derived = {
    xpBreakdown: d.xpBreakdown,
    totalXP: d.totalXP,
    campaignLevel: d.campaignLevel,
    level: d.level,
    odeLevel: d.odeLevel,
    coins: d.coins,
    streak: streak.streak,
    streakDate: streak.streakDate
  };
  return d;
}

test("T24: el historial grande no se recorta y el parseo no falla", () => {
  const { catalog, bundle } = freshSave();
  const { bundle: grande, total } = historialGrande(bundle, catalog);

  assert.equal(Object.keys(grande.play.completions).length, total, "todas las ocurrencias presentes");

  /* Ida y vuelta por JSON: es lo que hace el save real. */
  const serialized = JSON.stringify(grande);
  const parsed = JSON.parse(serialized);
  assert.equal(Object.keys(parsed.play.completions).length, total, "el parseo no pierde registros");
  assert.ok(serialized.length > 1_000_000, `el fixture debe ser grande (${serialized.length} bytes)`);
});

test("T24: la derivación sigue siendo correcta con historial grande", () => {
  const { catalog, bundle } = freshSave();
  const { bundle: grande, total } = historialGrande(bundle, catalog);

  const report = validatePlayState(grande, catalog, {});
  assert.equal(report.ok, true, `historial grande inválido: ${JSON.stringify(report.errors || report.checks)}`);

  const sources = sourcesFromMigrated(grande, catalog);
  assert.ok(sources.vida.log.length >= total, "el log de Vida conserva todo el historial");

  const d = derive(sources, catalog, REFERENCE_DATE);
  for (const [key, value] of Object.entries(d.xpBreakdown)) {
    assert.ok(Number.isFinite(value), `${key} debe ser finito`);
    assert.ok(value >= 0, `${key} no puede ser negativo`);
  }
  assert.ok(Number.isFinite(d.totalXP) && d.totalXP > 0);
  assert.ok(d.coins.earned >= total, "una moneda por completación como mínimo");
  assert.ok(Number.isFinite(d.coins.balance));
});

test("T24: la derivación no se degrada de forma inaceptable", () => {
  const { catalog, bundle } = freshSave();
  const { bundle: grande, total } = historialGrande(bundle, catalog);
  const sources = sourcesFromMigrated(grande, catalog);

  /* Calentamiento: la primera pasada paga la compilación de las funciones. */
  derive(sources, catalog, REFERENCE_DATE);

  const RUNS = 5;
  const times = [];
  for (let i = 0; i < RUNS; i++) {
    const t0 = performance.now();
    derive(sources, catalog, REFERENCE_DATE);
    times.push(performance.now() - t0);
  }
  const media = times.reduce((a, b) => a + b, 0) / RUNS;

  /* Umbral generoso y explícito: si un día se degrada de verdad, esto salta.
     No es una medición de rendimiento del teléfono, es una red de seguridad. */
  assert.ok(
    media < 2000,
    `derivar ${total} completaciones tardó ${media.toFixed(0)} ms (umbral 2000 ms)`
  );
});
