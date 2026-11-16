/**
 * capital.test.js — Entrega F: La Torre (Capital) y paridad con lo migrado.
 *
 * Además de activar el dominio, cubre un bug de honestidad que afectaba a
 * Empleo, Vida y Hub: una misión que ODEA 1 ya tenía completa no debe ofrecerse
 * como pendiente, porque completarla no daría XP (`derive` deduplica) y la UI
 * estaría mintiendo.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { STORAGE_KEYS, applyGameplayMutation, createMemoryStorage, importBundle } from "../src/storage.js";
import { missionsOf } from "../src/catalog.js";
import { migratedKeys, systemMissions } from "../src/gameplay.js";
import { derive, sourcesFromMigrated } from "../src/derive.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const FIXTURE_PATH = join(root, "fixtures", "odea-progreso-sintetico.json");
const CATALOG_PATH = join(root, "data", "xp-catalog.json");

const REFERENCE_DATE = "2026-11-10";
const MIGRATED_AT = "2026-11-10T12:00:00.000Z";
const AT = "2026-11-10T15:04:05.000Z";
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

function capitalXP(bundle, catalog) {
  const derived = derive(sourcesFromMigrated(bundle, catalog), catalog, REFERENCE_DATE);
  return derived.xpBreakdown.capital;
}

function complete(storage, catalog, system, missionId, date = DAY) {
  return applyGameplayMutation(
    storage,
    catalog,
    { type: "mission.complete", system, missionId, date },
    { at: AT, date }
  );
}

/* ========================================================================== */

test("capital: 101 misiones repartidas en los tres submódulos", () => {
  const catalog = loadCatalog();
  const missions = missionsOf(catalog, "capital");

  assert.equal(missions.length, 40 + 30 + 31);
  const byMap = missions.reduce((acc, m) => ({ ...acc, [m.map]: (acc[m.map] || 0) + 1 }), {});
  assert.equal(byMap["capital.done"], 40);
  assert.equal(byMap["capital.eng"], 30);
  assert.equal(byMap["capital.ai"], 31);
  assert.ok(missions.every((m) => m.cls === "one"), "Capital no tiene repetibles");
});

test("capital: lo migrado se marca completado y no se ofrece", () => {
  const { catalog, bundle } = freshSave();
  const state = systemMissions(bundle, catalog, "capital", DAY);

  assert.equal(state.completed.length, 4, "2 de done + 1 de eng + 1 de ai");
  assert.ok(state.completed.every((m) => m.migrated), "todas vienen del save migrado");
  assert.equal(state.pending.length, 97);

  for (const id of ["ca1_1", "ca1_3", "en1_1", "ia1_2"]) {
    assert.equal(state.pending.find((m) => m.id === id), undefined, `${id} ya estaba hecho`);
  }
});

test("capital: completar una migrada es duplicate y no escribe", () => {
  const { storage, catalog } = freshSave();
  const before = storage.getItem(STORAGE_KEYS.bundle);

  const result = complete(storage, catalog, "capital", "ca1_1");
  assert.equal(result.status, "duplicate");
  assert.equal(result.backup, null, "un duplicado no respalda");
  assert.equal(storage.getItem(STORAGE_KEYS.bundle), before, "el save no cambió");
});

test("capital: completar una nueva suma XP sin tocar lo migrado", () => {
  const { storage, catalog, bundle } = freshSave();
  const fresh = systemMissions(bundle, catalog, "capital", DAY).pending[0];

  const before = capitalXP(bundle, catalog);
  assert.equal(complete(storage, catalog, "capital", fresh.id).status, "applied");

  const after = capitalXP(currentBundle(storage), catalog);
  assert.equal(after, before + fresh.xp, "suma exactamente el XP de la misión");
});

test("capital: el XP migrado nunca se cuenta dos veces", () => {
  const { storage, catalog, bundle } = freshSave();
  const before = capitalXP(bundle, catalog);

  /* Los cuatro migrados: los cuatro deben rechazarse como duplicados. */
  for (const id of ["ca1_1", "ca1_3", "en1_1", "ia1_2"]) {
    assert.equal(complete(storage, catalog, "capital", id).status, "duplicate");
  }

  assert.equal(capitalXP(currentBundle(storage), catalog), before, "el XP no se movió");
});

test("paridad: Empleo no ofrece como pendientes las misiones ya migradas", () => {
  const { catalog, bundle } = freshSave();
  const state = systemMissions(bundle, catalog, "empleo", DAY);

  assert.equal(state.completed.length, 7, "3 jobs + 2 b2b + 2 puente");
  for (const id of ["n1", "n2", "n3", "b0_1", "b1_2", "pg1", "pg2"]) {
    assert.equal(state.pending.find((m) => m.id === id), undefined, `${id} ya estaba hecho`);
  }
  assert.equal(complete(createMemoryStorage(), catalog, "empleo", "n1").status, "rejected");
});

test("paridad: el Hub no ofrece como pendientes las diarias migradas", () => {
  const { catalog, bundle } = freshSave();
  const keys = migratedKeys(bundle, catalog, "hub", DAY);

  for (const id of ["1A", "1B", "1C", "2A", "2B", "2C"]) {
    assert.ok(keys.has(id), `${id} debe estar en las claves migradas`);
  }
});

test("paridad: el Hub rechaza completar una diaria migrada", () => {
  const { storage, catalog } = freshSave();
  assert.equal(complete(storage, catalog, "hub", "1A").status, "duplicate");
});

test("paridad: una diaria de Vida hecha ayer sigue pendiente hoy", () => {
  const { catalog, bundle } = freshSave();
  /* El fixture trae hab-gym|2026-11-05, que es una diaria. */
  const state = systemMissions(bundle, catalog, "vida", DAY);
  assert.ok(state.pending.find((m) => m.id === "hab-gym"), "hoy vuelve a estar pendiente");

  const past = systemMissions(bundle, catalog, "vida", "2026-11-05");
  assert.equal(past.pending.find((m) => m.id === "hab-gym"), undefined, "ese día sí estaba hecha");
});
