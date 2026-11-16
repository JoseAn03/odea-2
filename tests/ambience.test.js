/**
 * ambience.test.js — perfil visual derivado (Entrega E).
 *
 * La guía exige que la ciudad responda a datos de lectura sin tocar el
 * progreso: determinismo, fases del día, clima estable por fecha y niveles de
 * distrito con umbrales reproducibles.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PHASE_DAY,
  PHASE_DUSK,
  PHASE_NIGHT,
  WEATHER_CLEAR,
  WEATHER_DRIZZLE,
  WEATHER_RAIN,
  ambienceFor,
  districtLevels,
  phaseForHour,
  weatherForDate
} from "../js/ambience.js";
import { createMemoryStorage, importBundle } from "../src/storage.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const FIXTURE_PATH = join(root, "fixtures", "odea-progreso-sintetico.json");
const CATALOG_PATH = join(root, "data", "xp-catalog.json");

function migratedBundle() {
  const storage = createMemoryStorage();
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
  const imported = importBundle(JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")), {
    catalog,
    storage,
    referenceDate: "2026-11-10",
    migratedAt: "2026-11-10T12:00:00.000Z"
  });
  assert.equal(imported.status, "active");
  return imported.bundle;
}

/* ========================================================================== */

test("ambiente: las fases del día cubren las 24 horas sin huecos", () => {
  const phases = Array.from({ length: 24 }, (_, h) => phaseForHour(h));

  assert.equal(phases[0], PHASE_NIGHT, "05:00 sigue siendo noche");
  assert.equal(phases[6], PHASE_DAY, "06:00 amanece");
  assert.equal(phases[12], PHASE_DAY, "mediodía");
  assert.equal(phases[17], PHASE_DAY, "17:59 todavía es de día");
  assert.equal(phases[18], PHASE_DUSK, "18:00 atardece");
  assert.equal(phases[20], PHASE_NIGHT, "20:00 es de noche");
  assert.equal(phases[23], PHASE_NIGHT);

  /* Ninguna hora queda sin fase asignada. */
  assert.ok(phases.every((p) => [PHASE_DAY, PHASE_DUSK, PHASE_NIGHT].includes(p)));
});

test("ambiente: la hora se normaliza y lo inválido cae en día", () => {
  assert.equal(phaseForHour(30), phaseForHour(6), "30 h equivale a 06:00");
  assert.equal(phaseForHour(-1), PHASE_NIGHT, "-1 h equivale a 23:00");
  assert.equal(phaseForHour(18.9), PHASE_DUSK, "se trunca la hora");
  assert.equal(phaseForHour("12"), PHASE_DAY, "acepta string numérico");
  assert.equal(phaseForHour(NaN), PHASE_DAY);
  assert.equal(phaseForHour(undefined), PHASE_DAY);
});

test("ambiente: el clima es estable por fecha y determinista", () => {
  const a = weatherForDate("2026-11-16");
  const b = weatherForDate("2026-11-16");
  assert.equal(a, b, "misma fecha, mismo clima");

  assert.ok([WEATHER_CLEAR, WEATHER_DRIZZLE, WEATHER_RAIN].includes(a));

  /* En un año entero deben aparecer las tres variantes: si no, la semilla no
     está distribuyendo y el clima sería siempre el mismo. */
  const seen = new Set();
  for (let day = 1; day <= 28; day++) {
    for (let month = 1; month <= 12; month++) {
      const key = `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      seen.add(weatherForDate(key));
    }
  }
  assert.equal(seen.size, 3, "el año debe producir las tres variantes");
});

test("ambiente: los niveles de distrito usan umbrales documentados", () => {
  const bundle = migratedBundle();
  const levels = districtLevels(bundle);

  /* El fixture tiene XP migrado: los distritos con componentes deben estar en 1. */
  assert.equal(levels.hub.level, 1, "hub con XP migrado, sin completaciones nuevas");
  assert.equal(levels.empleo.level, 1);
  assert.equal(levels.vida.level, 1);

  /* Un distrito sin componentes de XP ni completaciones se queda en 0. */
  assert.equal(levels.ia.level, 0);
  assert.equal(levels.mercado.level, 0);
});

test("ambiente: completar una misión sube el nivel del distrito a 2", () => {
  const bundle = migratedBundle();
  bundle.play = {
    completions: {
      "hab-gym@2026-11-16": { missionId: "hab-gym", system: "vida", date: "2026-11-16" }
    },
    checkins: {}
  };

  const levels = districtLevels(bundle);
  assert.equal(levels.vida.level, 2, "vida tiene ahora actividad nueva");
  assert.equal(levels.vida.newCompletions, 1);
  assert.equal(levels.hub.level, 1, "el resto no cambia");
});

test("ambiente: el perfil no muta el bundle ni inventa datos", () => {
  const bundle = migratedBundle();
  const before = JSON.stringify(bundle);

  const profile = ambienceFor(bundle, { date: "2026-11-16", hour: 21 });
  ambienceFor(bundle, { date: "2026-11-16", hour: 9 });

  assert.equal(JSON.stringify(bundle), before, "derivar el perfil no escribe nada");
  assert.equal(profile.phase, PHASE_NIGHT);
  assert.equal(profile.night, true);
  assert.equal(profile.lights, true);
  assert.ok(profile.tint.alpha > 0, "de noche hay tinte");
});

test("ambiente: mismo día y hora producen el mismo perfil", () => {
  const bundle = migratedBundle();
  const a = ambienceFor(bundle, { date: "2026-11-16", hour: 19 });
  const b = ambienceFor(bundle, { date: "2026-11-16", hour: 19 });
  assert.deepEqual(a, b);
});

test("ambiente: el movimiento reducido baja el tráfico sin apagar la ciudad", () => {
  const bundle = migratedBundle();
  const normal = ambienceFor(bundle, { date: "2026-11-16", hour: 12 });
  const reduced = ambienceFor(bundle, { date: "2026-11-16", hour: 12, reducedMotion: true });

  assert.equal(normal.traffic, 2);
  assert.equal(reduced.traffic, 1);
  assert.equal(reduced.lights, normal.lights, "la reducción de movimiento no cambia la luz");
});
