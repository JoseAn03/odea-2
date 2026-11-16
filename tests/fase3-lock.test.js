/**
 * fase3-lock.test.js — exclusión entre pestañas de la ruta única de escritura.
 *
 * La guía maestra (pág. 20) exige que dos pestañas no compitan: leer, validar,
 * respaldar, escribir y verificar dentro de una exclusión. Estos tests cubren
 * el lock, su orden, el fallback cuando el navegador no expone Web Locks y la
 * liberación ante un error.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  GAMEPLAY_LOCK_NAME,
  STORAGE_KEYS,
  applyGameplayMutationLocked,
  createMemoryStorage,
  importBundle
} from "../src/storage.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const FIXTURE_PATH = join(root, "fixtures", "odea-progreso-sintetico.json");
const CATALOG_PATH = join(root, "data", "xp-catalog.json");

const REFERENCE_DATE = "2026-11-10";
const MIGRATED_AT = "2026-11-10T12:00:00.000Z";
const AT = "2026-11-10T15:04:05.000Z";

function loadCatalog() {
  return JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
}

function freshSave() {
  const storage = createMemoryStorage();
  const catalog = loadCatalog();
  const imported = importBundle(
    JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")),
    { catalog, storage, referenceDate: REFERENCE_DATE, migratedAt: MIGRATED_AT }
  );
  assert.equal(imported.status, "active");
  return { storage, catalog };
}

/**
 * Web Locks simulado: una sola cola de origen, como el navegador.
 * Registra los pedidos para poder afirmar nombre y modo.
 */
function createFakeLocks() {
  const requests = [];
  let tail = Promise.resolve();
  return {
    requests,
    request(name, options, callback) {
      requests.push({ name, mode: options && options.mode });
      const result = tail.then(() => callback());
      tail = result.then(
        () => {},
        () => {}
      );
      return result;
    }
  };
}

function completeHub(missionId) {
  return { type: "mission.complete", system: "hub", missionId, date: REFERENCE_DATE };
}

function backupKeys(storage, kind = "save") {
  const prefix = `${STORAGE_KEYS.backupPrefix}${kind}_`;
  return storage._keys().filter((key) => key.startsWith(prefix));
}

/* ========================================================================== */

test("lock: pide exclusión de origen y serializa dos mutaciones concurrentes", async () => {
  const { storage, catalog } = freshSave();
  const locks = createFakeLocks();

  /* Dos pestañas pidiendo la MISMA misión al mismo tiempo. */
  const results = await Promise.all([
    applyGameplayMutationLocked(storage, catalog, completeHub("48A"), { at: AT, locks }),
    applyGameplayMutationLocked(storage, catalog, completeHub("48A"), { at: AT, locks })
  ]);

  assert.deepEqual(
    results.map((r) => r.status).sort(),
    ["applied", "duplicate"],
    "una sola completación se aplica; la otra es duplicada"
  );
  assert.ok(
    results.every((r) => r.locked === true),
    "ambos resultados informan que corrieron bajo lock"
  );

  /* El lock se pidió con el nombre de origen y en modo exclusivo. */
  assert.equal(locks.requests.length, 2);
  for (const request of locks.requests) {
    assert.equal(request.name, GAMEPLAY_LOCK_NAME);
    assert.equal(request.mode, "exclusive");
  }

  /* La duplicada no respalda: solo la que escribe deja un backup de save. */
  assert.equal(backupKeys(storage).length, 1, "solo la mutación aplicada respalda");
});

test("lock: sin Web Locks cae al CAS y lo informa", async () => {
  const { storage, catalog } = freshSave();

  /* `locks: false` fuerza el camino sin exclusión (Node moderno sí expone
     `navigator.locks`, así que no basta con no inyectar nada). */
  const result = await applyGameplayMutationLocked(storage, catalog, completeHub("48A"), {
    at: AT,
    locks: false
  });

  assert.equal(result.status, "applied");
  assert.equal(result.locked, false, "sin exclusión disponible se informa locked:false");
});

test("lock: el fallback conserva la idempotencia", async () => {
  const { storage, catalog } = freshSave();

  const first = await applyGameplayMutationLocked(storage, catalog, completeHub("48A"), {
    at: AT,
    locks: false
  });
  const second = await applyGameplayMutationLocked(storage, catalog, completeHub("48A"), {
    at: AT,
    locks: false
  });

  assert.equal(first.status, "applied");
  assert.equal(second.status, "duplicate");
  assert.equal(second.backup, null, "la duplicada no crea backup");
});

test("lock: un error libera el lock y la siguiente mutación procede", async () => {
  const { storage, catalog } = freshSave();
  const locks = createFakeLocks();

  /* Sin storage, applyGameplayMutation lanza TypeError (error de programador). */
  await assert.rejects(
    () => applyGameplayMutationLocked(null, catalog, completeHub("48A"), { at: AT, locks }),
    /falta el storage/
  );

  /* La cola no quedó trabada: la operación siguiente corre normal. */
  const result = await applyGameplayMutationLocked(storage, catalog, completeHub("48A"), {
    at: AT,
    locks
  });
  assert.equal(result.status, "applied");
  assert.equal(result.locked, true);
});

test("lock: el nombre del lock es estable y de origen", () => {
  assert.equal(typeof GAMEPLAY_LOCK_NAME, "string");
  assert.ok(GAMEPLAY_LOCK_NAME.startsWith("odea2:"), "el lock se prefija con el dominio de la app");
});
