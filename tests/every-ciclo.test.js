/**
 * every-ciclo.test.js — cuarta clase de idempotencia: `every:Nd`.
 *
 * Las misiones de Garaje no son diarias ni semanales: cada una trae su propio
 * intervalo en días (`MISIONES_BASE[].dias`). Esta clase cubre ese caso:
 *
 *   clave        → id@fecha (una completación por fecha)
 *   disponibilidad → vuelve a estar debida cuando pasan N días desde la última
 *
 * El mecanismo se prueba con una misión sintética inyectada en el catálogo, para
 * no depender de que Garaje esté activado.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { STORAGE_KEYS, applyGameplayMutation, createMemoryStorage, importBundle } from "../src/storage.js";
import { missionsOf } from "../src/catalog.js";
import { isEveryDue, occurrenceKey, systemMissions } from "../src/gameplay.js";
import { validatePlayState } from "../src/validate.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const FIXTURE_PATH = join(root, "fixtures", "odea-progreso-sintetico.json");
const CATALOG_PATH = join(root, "data", "xp-catalog.json");

const REFERENCE_DATE = "2026-11-10";
const MIGRATED_AT = "2026-11-10T12:00:00.000Z";
const AT = "2026-11-01T12:00:00.000Z";

const ID = "c-lavar";
const DIAS = 7;

/** Catálogo del repo + una misión de ciclo dentro de Vida (solo para el test). */
function catalogWithEvery() {
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
  catalog.vida[ID] = { xp: 40, kind: "every", days: DIAS, cat: "eq" };
  return catalog;
}

function freshSave(catalog = catalogWithEvery()) {
  const storage = createMemoryStorage();
  const imported = importBundle(JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")), {
    catalog,
    storage,
    referenceDate: REFERENCE_DATE,
    migratedAt: MIGRATED_AT
  });
  assert.equal(imported.status, "active");
  return { storage, catalog, bundle: imported.bundle };
}

function complete(storage, catalog, date) {
  return applyGameplayMutation(
    storage,
    catalog,
    { type: "mission.complete", system: "vida", missionId: ID, date },
    { at: `${date}T12:00:00.000Z`, date }
  );
}

function stateOf(storage, catalog, date) {
  return systemMissions(JSON.parse(storage.getItem(STORAGE_KEYS.bundle)), catalog, "vida", date);
}

/* ========================================================================== */

test("every: el catálogo expone la clase y el intervalo", () => {
  const catalog = catalogWithEvery();
  const mission = missionsOf(catalog, "vida").find((m) => m.id === ID);

  assert.equal(mission.cls, "every");
  assert.equal(mission.days, DIAS);
  assert.equal(occurrenceKey(ID, "every", "2026-11-01"), `${ID}@2026-11-01`);
});

test("every: una entrada sin `days` válido no es de ciclo", () => {
  const catalog = catalogWithEvery();
  catalog.vida[ID] = { xp: 40, kind: "every", days: 0, cat: "eq" };
  const mission = missionsOf(catalog, "vida").find((m) => m.id === ID);
  assert.equal(mission.cls, "one", "sin intervalo cae en una sola vez");
  assert.equal(mission.days, null);
});

test("every: la primera completación se aplica y fija la clave por fecha", () => {
  const { storage, catalog } = freshSave();
  assert.equal(complete(storage, catalog, "2026-11-01").status, "applied");

  const record = JSON.parse(storage.getItem(STORAGE_KEYS.bundle)).play.completions[`${ID}@2026-11-01`];
  assert.ok(record, "clave id@fecha");
  assert.equal(record.period, "2026-11-01");
  assert.equal(record.reward.xp, 40);
});

test("every: no se puede adelantar antes de que venza el ciclo", () => {
  const { storage, catalog } = freshSave();
  complete(storage, catalog, "2026-11-01");

  /* El mismo día ya lo cubre la prueba de duplicado; acá van los días
     posteriores dentro del ciclo. */
  for (const day of ["2026-11-02", "2026-11-06", "2026-11-07"]) {
    const result = complete(storage, catalog, day);
    assert.equal(result.status, "rejected", `${day} no debe permitir completar`);
    assert.equal(result.error.code, "NOT_DUE");
  }
});

test("every: el mismo día es duplicado, no 'no debido'", () => {
  const { storage, catalog } = freshSave();
  complete(storage, catalog, "2026-11-01");
  assert.equal(complete(storage, catalog, "2026-11-01").status, "duplicate");
});

test("every: al vencer el intervalo vuelve a estar debida", () => {
  const { storage, catalog } = freshSave();
  complete(storage, catalog, "2026-11-01");

  const pendiente = stateOf(storage, catalog, "2026-11-07");
  assert.equal(pendiente.pending.find((m) => m.id === ID), undefined, "todavía no");

  const vencida = stateOf(storage, catalog, "2026-11-08");
  assert.ok(vencida.pending.find((m) => m.id === ID), "a los 7 días vuelve");

  assert.equal(complete(storage, catalog, "2026-11-08").status, "applied");
  const record = JSON.parse(storage.getItem(STORAGE_KEYS.bundle)).play.completions[`${ID}@2026-11-08`];
  assert.ok(record, "queda un segundo registro, con su propia fecha");
});

test("every: el estado informa cuándo vence", () => {
  const { storage, catalog } = freshSave();
  complete(storage, catalog, "2026-11-01");

  const state = stateOf(storage, catalog, "2026-11-03");
  const mission = state.missions.find((m) => m.id === ID);
  assert.equal(mission.completed, true, "en su ciclo vigente cuenta como hecha");
  assert.equal(mission.lastCompleted, "2026-11-01");
  assert.equal(mission.dueDate, "2026-11-08");
});

test("every: isEveryDue es coherente con la última completación", () => {
  const play = { completions: { [`${ID}@2026-11-01`]: { date: "2026-11-01" } }, checkins: {} };
  const mission = { id: ID, days: DIAS };

  assert.equal(isEveryDue(play, mission, "2026-11-07"), false);
  assert.equal(isEveryDue(play, mission, "2026-11-08"), true);
  assert.equal(isEveryDue({ completions: {} }, mission, "2026-11-08"), true, "sin historial está debida");
});

test("every: el registro valida y el bundle sigue siendo correcto", () => {
  const { storage, catalog } = freshSave();
  complete(storage, catalog, "2026-11-01");

  const saved = JSON.parse(storage.getItem(STORAGE_KEYS.bundle));
  const report = validatePlayState(saved, catalog, {});
  assert.equal(report.ok, true, JSON.stringify(report.errors || report.checks));
});
