/**
 * fase3.test.js — Tests de la Fase 3 (Hub sobre la ciudad).
 *
 * Cubre los 25 puntos del §6 de docs/FASE3_SPEC.md: sección `play`, ruta única
 * de escritura, validadores, racha derivada, ruta del día y cámara.
 *
 * No modifica expectativas de Fase 0/1/2: usa el mismo fixture sintético y el
 * mismo catálogo real.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  STORAGE_KEYS,
  SAVE_BACKUP_RETENTION,
  applyGameplayMutation,
  createMemoryStorage,
  importBundle,
  loadOdea2
} from "../src/storage.js";
import {
  bundleBaseChecks,
  playFailureCode,
  validateMigration,
  validatePlayState
} from "../src/validate.js";
import { derive, deriveStreak, isoWeekKey, sourcesFromMigrated } from "../src/derive.js";
import { validateCatalog, missionOf } from "../src/catalog.js";
import { isMissionDone, routeForDay } from "../src/gameplay.js";
import { createCamera } from "../js/city/camera.js";
import { applyView, createViewSession, viewOf } from "../js/city/view-session.js";
import { WORLD_SIZE } from "../js/city/layout.js";
import { deriveBundle } from "../js/hud.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const FIXTURE_PATH = join(root, "fixtures", "odea-progreso-sintetico.json");
const CATALOG_PATH = join(root, "data", "xp-catalog.json");

const REFERENCE_DATE = "2026-11-10";
const MIGRATED_AT = "2026-11-10T12:00:00.000Z";
const AT = "2026-11-10T15:04:05.000Z";

function loadFixture() {
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));
}
function loadCatalog() {
  return JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
}
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
function freshSave() {
  const storage = createMemoryStorage();
  const catalog = loadCatalog();
  const imported = importBundle(loadFixture(), {
    catalog,
    storage,
    referenceDate: REFERENCE_DATE,
    migratedAt: MIGRATED_AT
  });
  assert.equal(imported.status, "active");
  return { storage, catalog, bundle: imported.bundle };
}
function rawSave(storage) {
  return storage.getItem(STORAGE_KEYS.bundle);
}
function backupKeys(storage, kind = null) {
  return storage
    ._keys()
    .filter((k) => k.startsWith(STORAGE_KEYS.backupPrefix))
    .filter((k) => (kind ? k.startsWith(`${STORAGE_KEYS.backupPrefix}${kind}_`) : true));
}
function coreSignature(bundle) {
  const core = clone(bundle.core || {});
  delete core.derived;
  return { core, worlds: clone(bundle.worlds), legacy: clone(bundle.legacy) };
}
function withPlay(bundle, play) {
  const copy = clone(bundle);
  copy.play = play;
  return copy;
}
function checkinMutation(date) {
  return { type: "hub.checkin", date };
}
function completeMutation(missionId, system = "hub", date = REFERENCE_DATE) {
  return { type: "mission.complete", system, missionId, date };
}
function apply(storage, catalog, mutation, opts = {}) {
  return applyGameplayMutation(storage, catalog, mutation, { at: AT, ...opts });
}

/* ========================================================================== */
/* 1. `play` perezoso                                                         */
/* ========================================================================== */
test("1. play perezoso: un save migrado sin play es válido y la primera escritura lo crea", () => {
  const { storage, catalog, bundle } = freshSave();
  assert.equal(bundle.play, undefined, "la migración no inventa play");

  assert.doesNotThrow(() => loadOdea2(bundle, catalog));

  const result = apply(storage, catalog, completeMutation("48A"));
  assert.equal(result.status, "applied");
  /* R1: la sección aditiva pasa a v2 (registros con recompensa congelada). */
  assert.equal(result.bundle.play.version, 2);
  assert.deepEqual(Object.keys(result.bundle.play.completions), ["48A"]);
  assert.deepEqual(result.bundle.play.checkins, {});
  assert.equal(result.bundle.schemaVersion, 1);
  assert.equal(result.bundle.migration.decisions.length, 36, "no se re-migra");
});

/* ========================================================================== */
/* 2. Forma migrada intacta                                                   */
/* ========================================================================== */
test("2. forma migrada intacta: core (salvo derived), worlds y legacy no cambian", () => {
  const { storage, catalog, bundle } = freshSave();
  const before = coreSignature(bundle);
  const identityBefore = clone(bundle.core.identity);

  const result = apply(storage, catalog, completeMutation("48A"));
  assert.equal(result.status, "applied");
  assert.deepEqual(coreSignature(result.bundle), before);
  assert.deepEqual(result.bundle.core.identity, identityBefore);
  assert.equal(result.bundle.core.identity.streak, 8);
  assert.equal(result.bundle.core.identity.lastDailyDate, REFERENCE_DATE);
});

/* ========================================================================== */
/* 3. Ida y vuelta Hub                                                        */
/* ========================================================================== */
test("3. ida y vuelta: completar 48A guarda, relee y la derivación coincide", () => {
  const { storage, catalog, bundle } = freshSave();
  const baseXP = bundle.core.derived ? bundle.core.derived.totalXP : deriveBundle(bundle, catalog).totalXP;

  const result = apply(storage, catalog, completeMutation("48A"));
  assert.equal(result.status, "applied", JSON.stringify(result.error));

  const loaded = loadOdea2(result.bundle, catalog);
  const recomputed = derive(sourcesFromMigrated(loaded, catalog), catalog, loaded.migration.referenceDate);
  assert.equal(loaded.core.derived.totalXP, recomputed.totalXP);
  assert.deepEqual(loaded.core.derived.xpBreakdown, recomputed.xpBreakdown);

  /* 48A = 60 XP base × racha 8 (×1.25) = 75. */
  assert.equal(recomputed.totalXP - baseXP, 75);
});

/* ========================================================================== */
/* 4. Idempotencia                                                            */
/* ========================================================================== */
test("4. idempotencia: la segunda completación es duplicate, sin backup ni bytes nuevos", () => {
  const { storage, catalog } = freshSave();
  const first = apply(storage, catalog, completeMutation("48A"));
  assert.equal(first.status, "applied");

  const raw = rawSave(storage);
  const backups = backupKeys(storage, "save").length;
  const xp = first.bundle.core.derived.totalXP;
  const coins = first.bundle.core.derived.coins.balance;

  const second = apply(storage, catalog, completeMutation("48A"));
  assert.equal(second.status, "duplicate");
  assert.equal(second.backup, null);
  assert.deepEqual(second.changed, []);
  assert.equal(rawSave(storage), raw);
  assert.equal(backupKeys(storage, "save").length, backups);
  assert.equal(second.bundle.core.derived.totalXP, xp);
  assert.equal(second.bundle.core.derived.coins.balance, coins);
});

/* ========================================================================== */
/* 5. Vida diaria                                                             */
/* ========================================================================== */
test("5. vida diaria: misma fecha duplicate, día siguiente nueva ocurrencia", () => {
  const { storage, catalog } = freshSave();
  const day1 = apply(storage, catalog, completeMutation("hab-gym", "vida", "2026-11-11"));
  assert.equal(day1.status, "applied");
  assert.ok(day1.bundle.play.completions[`hab-gym@2026-11-11`]);

  const same = apply(storage, catalog, completeMutation("hab-gym", "vida", "2026-11-11"));
  assert.equal(same.status, "duplicate");

  const day2 = apply(storage, catalog, completeMutation("hab-gym", "vida", "2026-11-12"));
  assert.equal(day2.status, "applied");
  assert.equal(day2.bundle.play.completions[`hab-gym@2026-11-11`].period, "2026-11-11");
  assert.equal(day2.bundle.play.completions[`hab-gym@2026-11-12`].period, "2026-11-12");
});

/* ========================================================================== */
/* 6. Vida única/semanal                                                      */
/* ========================================================================== */
test("6. vida: una misión one es única para siempre y una weekly cambia por semana ISO", () => {
  const { storage, catalog } = freshSave();

  const one = apply(storage, catalog, completeMutation("grw-libro", "vida", "2026-11-11"));
  assert.equal(one.status, "applied");
  assert.ok(one.bundle.play.completions["grw-libro"]);
  assert.equal(one.bundle.play.completions["grw-libro"].period, undefined);
  const oneAgain = apply(storage, catalog, completeMutation("grw-libro", "vida", "2027-01-01"));
  assert.equal(oneAgain.status, "duplicate");

  const week1 = apply(storage, catalog, completeMutation("kwk-parque", "vida", "2026-11-11"));
  assert.equal(week1.status, "applied");
  assert.ok(week1.bundle.play.completions[`kwk-parque@${isoWeekKey("2026-11-11")}`]);
  const week1Again = apply(storage, catalog, completeMutation("kwk-parque", "vida", "2026-11-12"));
  assert.equal(week1Again.status, "duplicate");

  const week2 = apply(storage, catalog, completeMutation("kwk-parque", "vida", "2026-11-16"));
  assert.equal(week2.status, "applied");
  assert.ok(week2.bundle.play.completions[`kwk-parque@${isoWeekKey("2026-11-16")}`]);
  assert.notEqual(isoWeekKey("2026-11-11"), isoWeekKey("2026-11-16"));
});

/* ========================================================================== */
/* 7. Check-in                                                                */
/* ========================================================================== */
test("7. check-in: mismo día duplicate, día siguiente sube, hueco reinicia", () => {
  const { storage, catalog, bundle } = freshSave();

  /* 2026-11-10 es la línea base migrada: ya está contado. */
  const baseDay = apply(storage, catalog, checkinMutation("2026-11-10"));
  assert.equal(baseDay.status, "duplicate");

  const d1 = apply(storage, catalog, checkinMutation("2026-11-11"));
  assert.equal(d1.status, "applied");
  assert.equal(d1.bundle.core.derived.streak, 9);
  assert.equal(d1.bundle.core.derived.streakDate, "2026-11-11");
  assert.equal(d1.bundle.core.identity.streak, 8);
  assert.equal(d1.bundle.core.identity.lastDailyDate, REFERENCE_DATE);

  const d1Again = apply(storage, catalog, checkinMutation("2026-11-11"));
  assert.equal(d1Again.status, "duplicate");

  const d2 = apply(storage, catalog, checkinMutation("2026-11-12"));
  assert.equal(d2.status, "applied");
  assert.equal(d2.bundle.core.derived.streak, 10);

  /* Hueco real: 2026-11-12 sin el 11 reinicia a 1. */
  const gapBundle = withPlay(bundle, { version: 1, completions: {}, checkins: { "2026-11-12": { at: AT } } });
  assert.equal(deriveStreak(gapBundle).streak, 1);
});

/* ========================================================================== */
/* 8. Misión desconocida                                                      */
/* ========================================================================== */
test("8. misión desconocida: UNKNOWN_MISSION sin backup ni cambios", () => {
  const { storage, catalog } = freshSave();
  const raw = rawSave(storage);
  const backups = backupKeys(storage).length;

  const result = apply(storage, catalog, completeMutation("no-existe"));
  assert.equal(result.status, "rejected");
  assert.equal(result.error.code, "UNKNOWN_MISSION");
  assert.equal(rawSave(storage), raw);
  assert.equal(backupKeys(storage).length, backups);

  /* Capital ya es jugable (Entrega F); Sagas todavía no, así que sirve de
     ejemplo de sistema fuera de alcance. */
  const out = apply(storage, catalog, completeMutation("x", "sagas"));
  assert.equal(out.error.code, "OUT_OF_SCOPE");
});

/* ========================================================================== */
/* 9. Fail-closed de schema                                                   */
/* ========================================================================== */
test("9. fail-closed de schema: un play inválido devuelve SCHEMA_INVALID sin escribir", () => {
  const { storage, catalog } = freshSave();
  const tampered = JSON.parse(rawSave(storage));
  tampered.play = { version: 1, completions: {}, checkins: { "2026-11-09": {} } };
  storage.setItem(STORAGE_KEYS.bundle, JSON.stringify(tampered));
  const raw = rawSave(storage);

  const result = apply(storage, catalog, completeMutation("48A"));
  assert.equal(result.status, "rejected");
  assert.equal(result.error.code, "SCHEMA_INVALID");
  assert.equal(rawSave(storage), raw);
});

/* ========================================================================== */
/* 10. Fail-closed de derivación                                              */
/* ========================================================================== */
test("10. fail-closed de derivación: un derived inconsistente es DERIVE_DRIFT y no escribe", () => {
  const { storage, catalog, bundle } = freshSave();
  const draft = clone(bundle);
  draft.core.derived = { ...(draft.core.derived || {}), totalXP: 1, streak: 99 };

  const report = validatePlayState(draft, catalog, { previous: bundle });
  assert.equal(report.ok, false);
  assert.ok(report.checks.some((c) => c.id === "DERIVED_MATCH" && !c.ok));
  assert.equal(playFailureCode(report), "DERIVE_DRIFT");

  /* La ruta de escritura refresca el snapshot antes de validar; si aun así
     hubiera drift, el código mapeado impide escribir (fail-closed). */
  const raw = rawSave(storage);
  const result = apply(storage, catalog, completeMutation("48A"));
  assert.equal(result.status, "applied");
  assert.equal(result.bundle.core.derived.streak, 8);
  assert.notEqual(rawSave(storage), raw);

  /* Si el save persistido quedara con play editado y derived viejo, el
     validador lo detecta como RUNTIME_LOAD (XP_DRIFT) y el código es
     DERIVE_DRIFT: la ruta de escritura no procedería. */
  const tampered = JSON.parse(rawSave(storage));
  tampered.play.completions["48B"] = { missionId: "48B", system: "hub", date: REFERENCE_DATE, at: AT };
  const driftReport = validatePlayState(tampered, catalog, { previous: tampered });
  assert.equal(driftReport.ok, false);
  assert.equal(playFailureCode(driftReport), "DERIVE_DRIFT");
});

/* ========================================================================== */
/* 11. Arranque tras escribir                                                 */
/* ========================================================================== */
test("11. arranque tras escribir: loadOdea2 no reporta XP_DRIFT", () => {
  const { storage, catalog } = freshSave();
  apply(storage, catalog, completeMutation("48A"));
  apply(storage, catalog, checkinMutation("2026-11-11"));

  const stored = JSON.parse(rawSave(storage));
  assert.doesNotThrow(() => loadOdea2(stored, catalog));
  assert.equal(loadOdea2(stored, catalog).core.derived.streak, 9);
});

/* ========================================================================== */
/* 12. Edición manual                                                         */
/* ========================================================================== */
test("12. edición manual: play alterado sin refrescar derived falla cerrado", () => {
  const { storage, catalog } = freshSave();
  apply(storage, catalog, completeMutation("48A"));

  const edited = JSON.parse(rawSave(storage));
  edited.play.completions["48B"] = {
    missionId: "48B",
    system: "hub",
    date: REFERENCE_DATE,
    at: AT
  };
  storage.setItem(STORAGE_KEYS.bundle, JSON.stringify(edited));

  assert.throws(() => loadOdea2(edited, catalog), /XP_DRIFT/);
});

/* ========================================================================== */
/* 13. Rotación de backups                                                    */
/* ========================================================================== */
test("13. backups: cuatro escrituras dejan 3 save y conservan el source", () => {
  const { storage, catalog } = freshSave();
  assert.equal(backupKeys(storage, "source").length, 1);
  assert.equal(backupKeys(storage, "save").length, 0);

  for (const [index, date] of ["2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14"].entries()) {
    const result = apply(storage, catalog, checkinMutation(date), {
      at: `2026-11-1${index + 1}T08:00:00.000Z`
    });
    assert.equal(result.status, "applied", date);
  }

  assert.equal(backupKeys(storage, "save").length, SAVE_BACKUP_RETENTION);
  assert.equal(backupKeys(storage, "source").length, 1);
});

/* ========================================================================== */
/* 14. Re-lectura distinta                                                    */
/* ========================================================================== */
test("14. re-lectura distinta: WRITE_VERIFY_FAILED y rollback al rawBefore", () => {
  const { storage, catalog } = freshSave();
  const rawBefore = rawSave(storage);

  let stale = false;
  const flaky = {
    getItem(k) {
      if (k === STORAGE_KEYS.bundle && stale) return rawBefore;
      return storage.getItem(k);
    },
    setItem(k, v) {
      storage.setItem(k, v);
      if (k === STORAGE_KEYS.bundle) stale = true;
    },
    removeItem(k) {
      storage.removeItem(k);
    },
    key(i) {
      return storage.key(i);
    },
    get length() {
      return storage.length;
    },
    _keys() {
      return storage._keys();
    }
  };

  const result = applyGameplayMutation(flaky, catalog, completeMutation("48A"), { at: AT });
  assert.equal(result.status, "rejected");
  assert.equal(result.error.code, "WRITE_VERIFY_FAILED");
  assert.equal(rawSave(storage), rawBefore, "rollback exacto");
});

/* ========================================================================== */
/* 15. Cuota                                                                  */
/* ========================================================================== */
test("15. cuota: QUOTA_EXCEEDED deja el save intacto", () => {
  const { storage, catalog } = freshSave();
  const rawBefore = rawSave(storage);

  let throwQuota = false;
  const full = {
    getItem: (k) => storage.getItem(k),
    setItem(k, v) {
      if (throwQuota && k === STORAGE_KEYS.bundle) {
        const error = new Error("QuotaExceededError");
        error.name = "QuotaExceededError";
        throw error;
      }
      storage.setItem(k, v);
    },
    removeItem: (k) => storage.removeItem(k),
    key: (i) => storage.key(i),
    get length() {
      return storage.length;
    },
    _keys: () => storage._keys()
  };

  throwQuota = true;
  const result = applyGameplayMutation(full, catalog, completeMutation("48A"), { at: AT });
  assert.equal(result.status, "rejected");
  assert.equal(result.error.code, "QUOTA_EXCEEDED");
  assert.equal(rawSave(storage), rawBefore);
});

/* ========================================================================== */
/* 16. Concurrencia                                                           */
/* ========================================================================== */
test("16. concurrencia: escritura externa entre lectura y CAS produce CONCURRENT_CHANGE", () => {
  const { storage, catalog } = freshSave();
  const rawBefore = rawSave(storage);
  const other = JSON.parse(rawBefore);
  other.import.note = "otra pestaña";
  const rawOther = JSON.stringify(other);
  storage.setItem(STORAGE_KEYS.bundle, rawOther);

  let reads = 0;
  const race = {
    getItem(k) {
      if (k !== STORAGE_KEYS.bundle) return storage.getItem(k);
      reads += 1;
      return reads === 1 ? rawBefore : storage.getItem(k);
    },
    setItem: (k, v) => storage.setItem(k, v),
    removeItem: (k) => storage.removeItem(k),
    key: (i) => storage.key(i),
    get length() {
      return storage.length;
    },
    _keys: () => storage._keys()
  };

  const result = applyGameplayMutation(race, catalog, completeMutation("48A"), { at: AT });
  assert.equal(result.status, "rejected");
  assert.equal(result.error.code, "CONCURRENT_CHANGE");
  assert.equal(rawSave(storage), rawOther, "la escritura externa se conserva");
});

/* ========================================================================== */
/* 17. Ruta determinista                                                      */
/* ========================================================================== */
test("17. ruta del día: determinista, 48A/48B/48C, filtra completadas y cicla a los 56 días", () => {
  const { bundle, catalog } = freshSave();

  const a = routeForDay(bundle, catalog, "2026-11-10");
  const b = routeForDay(bundle, catalog, "2026-11-10");
  assert.deepEqual(a, b);
  assert.equal(a.catalogDay, 48);
  assert.deepEqual(a.missions.map((m) => m.id), ["48A", "48B", "48C"]);
  assert.deepEqual(a.pending.map((m) => m.id), ["48A", "48B", "48C"]);
  assert.deepEqual(a.missions.map((m) => m.xp), [60, 140, 50]);

  const done = clone(bundle);
  done.play = {
    version: 1,
    completions: { "48A": { missionId: "48A", system: "hub", date: REFERENCE_DATE, at: AT } },
    checkins: {}
  };
  const filtered = routeForDay(done, catalog, "2026-11-10");
  assert.deepEqual(filtered.pending.map((m) => m.id), ["48B", "48C"]);
  assert.equal(filtered.missions.find((m) => m.id === "48A").completed, true);

  /* 2026-11-19: epoch 20776 → 20776 mod 56 = 0 → día 1. */
  assert.equal(routeForDay(bundle, catalog, "2026-11-19").catalogDay, 1);

  /* Todo completado: la ruta queda vacía. */
  const allDone = clone(bundle);
  allDone.core.progress.completedDaily = Object.keys(catalog.daily);
  assert.deepEqual(routeForDay(allDone, catalog, "2026-11-10").pending, []);
  assert.equal(isMissionDone(allDone, "48A"), true);
});

/* ========================================================================== */
/* 18. Cámara                                                                 */
/* ========================================================================== */
test("18. cámara: snapshot exacto, se conserva al cambiar de distrito y no sobrevive a recargar", () => {
  const camera = createCamera({ worldSize: WORLD_SIZE });
  camera.setViewport(900, 700);
  const initial = viewOf(camera);

  camera.focusRect({ x: 100, y: 100, w: 300, h: 300 }, { padding: 80 });
  camera.update(10);
  assert.notDeepEqual(viewOf(camera), initial);

  applyView(camera, initial, { instant: true });
  assert.deepEqual(viewOf(camera), initial);

  const session = createViewSession(camera);
  const first = session.capture();
  camera.focusRect({ x: 50, y: 900, w: 300, h: 300 });
  camera.update(10);
  session.capture(); /* cambiar de distrito conserva el snapshot original */
  assert.deepEqual(session.peek(), first);
  assert.equal(session.restore(), true);
  assert.deepEqual(viewOf(camera), first);

  /* Recarga: sesión nueva sin snapshot → vista por defecto intacta. */
  const reloaded = createViewSession(camera);
  const current = viewOf(camera);
  assert.equal(reloaded.restore(), false);
  assert.deepEqual(viewOf(camera), current);
});

/* ========================================================================== */
/* 19. Ruta única de escritura                                                */
/* ========================================================================== */
test("19. ruta única: los módulos de la app no escriben la clave del save", async () => {
  const { scanWritePath } = await import("../tools/check-write-path.mjs");
  assert.deepEqual(scanWritePath(root), []);
});

/* ========================================================================== */
/* 20. Sin regresiones                                                        */
/* ========================================================================== */
test("20. sin regresiones: validateMigration conserva sus check ids y mensajes", () => {
  const fixture = loadFixture();
  const catalog = loadCatalog();
  const storage = createMemoryStorage();
  const imported = importBundle(fixture, {
    catalog,
    storage,
    referenceDate: REFERENCE_DATE,
    migratedAt: MIGRATED_AT
  });

  const report = validateMigration(fixture, imported.bundle, catalog, { referenceDate: REFERENCE_DATE });
  assert.equal(report.ok, true, report.errors.join("\n"));
  const ids = report.checks.map((c) => c.id);
  assert.deepEqual(ids, [
    "FORMAT",
    "SECTIONS",
    "FIELD_DECISIONS_COMPLETE",
    "FIELD_UNKNOWN_PRESERVED",
    "FIELD_VALUES_IDENTICAL",
    "KEY_DECISIONS_COMPLETE",
    "KEY_SECTION_ASSIGNMENT",
    "KEY_UNKNOWN_PRESERVED",
    "KEY_VALUES_IDENTICAL",
    "CRITICAL_EVENTRL",
    "CRITICAL_FARM",
    "CRITICAL_CANJE",
    "SHOP_SPENT",
    "XP_ORACLE_MATCHES_SOURCE",
    "XP_COMPONENTS_IDENTICAL",
    "XP_TOTAL_IDENTICAL",
    "XP_SNAPSHOT_PRESERVED",
    "LEVELS_IDENTICAL",
    "COINS_IDENTICAL",
    "SOURCE_FINGERPRINT",
    "IMPORT_STATE",
    "NO_LOSS_PROJECTION"
  ]);
});

/* ========================================================================== */
/* 21. Racha de arranque                                                      */
/* ========================================================================== */
test("21. racha de arranque: la base migrada no se reinicia sin hueco real", () => {
  const { bundle } = freshSave();
  const emptyPlay = { version: 1, completions: {}, checkins: {} };
  const checkin = (dates) =>
    withPlay(bundle, {
      version: 1,
      completions: {},
      checkins: Object.fromEntries(dates.map((d) => [d, { at: AT }]))
    });

  assert.equal(deriveStreak(withPlay(bundle, emptyPlay)).streak, 8);
  assert.equal(deriveStreak(bundle).streak, 8, "sin play también es 8");
  assert.equal(deriveStreak(checkin(["2026-11-10"])).streak, 8);
  assert.equal(deriveStreak(checkin(["2026-11-11"])).streak, 9);
  assert.equal(deriveStreak(checkin(["2026-11-11", "2026-11-12"])).streak, 10);
  assert.equal(deriveStreak(checkin(["2026-11-12"])).streak, 1);
  assert.equal(deriveStreak(checkin(["2026-11-20"])).streak, 1);
});

/* ========================================================================== */
/* 22. Racha siempre derivada                                                 */
/* ========================================================================== */
test("22. racha siempre derivada: el snapshot no manda y la identidad no se escribe", () => {
  const { storage, catalog, bundle } = freshSave();

  /* Alterar el snapshot no cambia la racha calculada. */
  const withBadSnapshot = clone(bundle);
  withBadSnapshot.core.derived = { ...(withBadSnapshot.core.derived || {}), streak: 999, streakDate: "2030-01-01" };
  assert.equal(deriveStreak(withBadSnapshot).streak, deriveStreak(bundle).streak);

  const day = apply(storage, catalog, checkinMutation("2026-11-11"));
  assert.equal(day.status, "applied");
  assert.equal(day.bundle.core.identity.streak, 8, "identity.streak no se escribe");
  assert.equal(day.bundle.core.identity.lastDailyDate, REFERENCE_DATE, "lastDailyDate no se escribe");
  assert.equal(day.bundle.core.derived.streak, 9);

  /* El multiplicador de XP usa la racha derivada (15 días → ×1.5). */
  const dates = ["2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15", "2026-11-16", "2026-11-17"];
  const long = withPlay(bundle, {
    version: 1,
    completions: {},
    checkins: Object.fromEntries(dates.map((d) => [d, { at: AT }]))
  });
  const sources = sourcesFromMigrated(long, catalog);
  const derived = derive(sources, catalog, REFERENCE_DATE);
  assert.equal(deriveStreak(long).streak, 15);
  assert.equal(sources.identity.streak, 15);
  assert.equal(derived.meta.streakMult, 1.5);
  assert.ok(derived.totalXP > deriveBundle(bundle, catalog).totalXP);
});

/* ========================================================================== */
/* 23. Catálogo duplicado                                                     */
/* ========================================================================== */
test("23. catálogo duplicado: DUPLICATE_MISSION_ID y BAD_CATALOG sin escribir", () => {
  const { storage } = freshSave();
  const catalog = loadCatalog();
  catalog.jobs["48A"] = { xp: 1 };

  const check = validateCatalog(catalog);
  assert.equal(check.ok, false);
  assert.deepEqual(check.duplicates.map((d) => d.id), ["48A"]);
  assert.deepEqual(check.duplicates[0].maps, ["daily", "jobs"]);

  const raw = rawSave(storage);
  const backups = backupKeys(storage).length;
  const result = apply(storage, catalog, completeMutation("48A"));
  assert.equal(result.status, "rejected");
  assert.equal(result.error.code, "BAD_CATALOG");
  assert.equal(result.error.detail.duplicates[0].id, "48A");
  assert.equal(rawSave(storage), raw);
  assert.equal(backupKeys(storage).length, backups);

  /* El catálogo real sigue siendo único. */
  assert.equal(validateCatalog(loadCatalog()).ok, true);
  assert.equal(missionOf(loadCatalog(), "hub", "48A").cls, "one");
});

/* ========================================================================== */
/* 24. Backup exacto y fail-closed                                            */
/* ========================================================================== */
test("24. backup: exacto byte a byte, fail-closed si falla o no coincide", () => {
  const { storage, catalog } = freshSave();
  const rawBefore = rawSave(storage);

  const applied = apply(storage, catalog, completeMutation("48A"));
  assert.equal(applied.status, "applied");
  assert.equal(applied.backup.kind, "save");
  assert.equal(storage.getItem(applied.backup.key), rawBefore);

  /* (b) el backup no se puede crear → no se escribe. */
  const raw1 = rawSave(storage);
  const noBackup = {
    getItem: (k) => storage.getItem(k),
    setItem(k, v) {
      if (k.includes(`${STORAGE_KEYS.backupPrefix}save_`)) throw new Error("disk full");
      storage.setItem(k, v);
    },
    removeItem: (k) => storage.removeItem(k),
    key: (i) => storage.key(i),
    get length() {
      return storage.length;
    },
    _keys: () => storage._keys()
  };
  const failed = applyGameplayMutation(noBackup, catalog, checkinMutation("2026-11-11"), { at: AT });
  assert.equal(failed.status, "rejected");
  assert.equal(failed.error.code, "BACKUP_FAILED");
  assert.equal(rawSave(storage), raw1);

  /* El contenido no coincide → BACKUP_MISMATCH, sin escritura. */
  const raw2 = rawSave(storage);
  const tamper = {
    getItem: (k) => storage.getItem(k),
    setItem(k, v) {
      if (k.includes(`${STORAGE_KEYS.backupPrefix}save_`)) storage.setItem(k, `${v} `);
      else storage.setItem(k, v);
    },
    removeItem: (k) => storage.removeItem(k),
    key: (i) => storage.key(i),
    get length() {
      return storage.length;
    },
    _keys: () => storage._keys()
  };
  const mismatch = applyGameplayMutation(tamper, catalog, checkinMutation("2026-11-11"), { at: AT });
  assert.equal(mismatch.status, "rejected");
  assert.equal(mismatch.error.code, "BACKUP_MISMATCH");
  assert.equal(rawSave(storage), raw2);
});

/* ========================================================================== */
/* 25. Base compartida de validación                                          */
/* ========================================================================== */
test("25. base compartida: validatePlayState usa la misma base que validateMigration", () => {
  const { catalog, bundle } = freshSave();
  const loaded = loadOdea2(bundle, catalog);
  const base = bundleBaseChecks(loaded);
  assert.equal(base.format.id, "FORMAT");
  assert.equal(base.sections.id, "SECTIONS");
  assert.equal(base.importState.id, "IMPORT_STATE");
  assert.equal(base.format.ok, true);
  assert.equal(base.sections.ok, true);
  assert.equal(base.importState.ok, true);

  const migrated = validateMigration(loadFixture(), bundle, catalog, { referenceDate: REFERENCE_DATE });
  for (const id of ["FORMAT", "SECTIONS", "IMPORT_STATE"]) {
    assert.equal(migrated.checks.filter((c) => c.id === id).length, 1);
  }

  const play = validatePlayState(loaded, catalog, { previous: loaded });
  assert.equal(play.ok, true, play.errors.join("\n"));
  for (const id of ["FORMAT", "SECTIONS", "IMPORT_STATE"]) {
    assert.equal(play.checks.filter((c) => c.id === id).length, 1, `${id} no se duplica`);
  }
  assert.ok(play.checks.some((c) => c.id === "RUNTIME_LOAD"));
  assert.ok(play.checks.some((c) => c.id === "DERIVED_MATCH"));
  assert.ok(play.checks.some((c) => c.id === "MIGRATED_UNCHANGED"));
});
