/**
 * racha.test.js — ESCUDO DE RACHA (v0.47.0, Dinámicas de Enganche
 * Fase 3): protección ganada contra el día fallado.
 *
 * Lo que se protege acá:
 *  - el inventario es DERIVADO (|grants| − |covered|) con TOPE 2:
 *    otorgar con el inventario lleno omite el grant;
 *  - solo hay dos fuentes: el cofre del Contrato (grant atómico en la
 *    misma escritura del reclamo; los reclamos viejos no se
 *    reescriben) y los hitos de racha 14/30 (el reducer verifica la
 *    racha real y fecha la clave con el día en que se alcanzó);
 *  - el consumo `racha.cover` revalida las 4 condiciones: exactamente
 *    un día perdido, actividad ya registrada hoy, inventario
 *    disponible y día no cubierto — un hueco de 2+ días no se salva;
 *  - el día cubierto preserva la cadena y el multiplicador SIN
 *    fabricar actividad (no cuenta para el Contrato, no suma XP);
 *  - sin escudo, la cadena se corta exactamente como hoy;
 *  - paridad total en saves sin actividad de racha: XP, componentes,
 *    saldo ₡, racha derivada y multiplicador idénticos — y la herencia
 *    de ODEA 1 (freezers / shieldWeek) NO se convierte en escudos.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  RACHA_MAX_SHIELDS, coverCandidate, grantShield, isGrantKey,
  milestoneReachDate, rachaProblems, rachaStateOf, rachaView,
  shieldInventory
} from "../src/racha-state.js";
import { contratoProgress } from "../src/contrato-state.js";
import { applyMutation, recentStreakDays } from "../src/gameplay.js";
import {
  STORAGE_KEYS, createMemoryStorage, importBundle, applyGameplayMutation
} from "../src/storage.js";
import { addDays, derive, deriveStreak, sourcesFromMigrated, streakMult } from "../src/derive.js";
import { validatePlayState } from "../src/validate.js";

const catalog = JSON.parse(fs.readFileSync(new URL("../data/xp-catalog.json", import.meta.url)));
const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/odea-progreso-sintetico.json", import.meta.url)));

function fresh() {
  const storage = createMemoryStorage();
  const imported = importBundle(structuredClone(fixture), {
    storage, catalog, referenceDate: "2026-11-10", migratedAt: "2026-11-10T12:00:00.000Z"
  });
  assert.equal(imported.status, "active");
  return storage;
}
const saved = (s) => JSON.parse(s.getItem(STORAGE_KEYS.bundle));
const derived = (s) => derive(sourcesFromMigrated(saved(s), catalog), catalog, "2026-11-10");
const on = (date, second = 0) => ({
  date, at: new Date(Date.parse(`${date}T12:00:00.000Z`) + second * 1000).toISOString()
});
const mutateOn = (s, mutation, date, second = 0) =>
  applyGameplayMutation(s, catalog, mutation, on(date, second));

/* La rotación de respaldos conserva solo 3: housekeeping de la prueba
   (mismo patrón que contrato.test.js). */
function cleanBackups(s) {
  const keys = [];
  for (let i = 0; i < s.length; i += 1) {
    const key = s.key(i);
    if (key && key.startsWith(STORAGE_KEYS.backupPrefix)) keys.push(key);
  }
  for (const key of keys) s.removeItem(key);
}
const mut = (s, mutation, date, second = 0) => {
  const r = mutateOn(s, mutation, date, second);
  cleanBackups(s);
  return r;
};
const checkin = (s, date, second = 0) => {
  const r = mut(s, { type: "hub.checkin" }, date, second);
  assert.equal(r.status, "applied", `checkin ${date}: ${JSON.stringify(r.error)}`);
};
const checkins = (s, from, count, second0 = 100) => {
  for (let i = 0; i < count; i += 1) checkin(s, addDays(from, i), second0 + i);
};

/* El fixture trae la línea base migrada: racha 8 anclada a 2026-11-10.
   Seis check-ins seguidos (11–16 nov) la llevan a 14, encadenada. */
const TO_14 = ["2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15", "2026-11-16"];

function seedTo14(s) {
  TO_14.forEach((d, i) => checkin(s, d, 10 + i));
  assert.equal(deriveStreak(saved(s)).streak, 14);
}

function seedWeek51(s) {
  ["2026-12-11", "2026-12-12", "2026-12-13", "2026-12-14", "2026-12-15", "2026-12-16", "2026-12-17"]
    .forEach((d, i) => checkin(s, d, 200 + i));
  ["garaje-01", "garaje-02", "garaje-03", "garaje-04", "garaje-05", "garaje-06"]
    .forEach((id, i) => {
      const r = mut(s, { type: "garage.complete", missionId: id }, "2026-12-14", 220 + i);
      assert.equal(r.status, "applied", `garaje ${id}: ${JSON.stringify(r.error)}`);
    });
}

/* ------------------------------- paridad ---------------------------- */

test("racha: un save sin play.racha se lee vacío y deriva idéntico (paridad total)", () => {
  const s = fresh();
  const bundle = saved(s);
  assert.equal(bundle.play?.racha, undefined);
  assert.deepEqual(rachaStateOf(bundle), { version: 1, grants: {}, covered: {} });
  assert.deepEqual(shieldInventory(bundle), { grants: 0, covered: 0, available: 0, cap: 2 });
  assert.deepEqual(rachaProblems(bundle), []);
  const d = derived(s);
  assert.equal(d.totalXP, 6915, "total del fixture, sin mover ni un punto");
  assert.deepEqual(d.coins, { earned: 141, spent: 100, balance: 41 });
  const streak = deriveStreak(bundle);
  assert.equal(streak.streak, 8, "la racha derivada no cambia");
  assert.equal(streak.streakDate, "2026-11-10");
  assert.equal(streakMult(streak.streak), 1.25, "el multiplicador no cambia");
});

test("racha: la herencia de ODEA 1 (freezers y shieldWeek) NO se convierte en escudos", () => {
  const s = fresh();
  const bundle = saved(s);
  /* El fixture migró con freezers y shieldWeek en core.identity… */
  assert.ok("freezers" in bundle.core.identity || "shieldWeek" in bundle.core.identity);
  /* …y aun así el inventario nace en 0: se gana, no se hereda (§4.3). */
  assert.equal(shieldInventory(bundle).available, 0);
  assert.equal(coverCandidate(bundle, "2026-11-12"), null);
});

test("racha: las claves de grant solo aceptan los formatos cerrados", () => {
  assert.ok(isGrantKey("contrato@2026-W48"));
  assert.ok(isGrantKey("hito14@2026-11-20"));
  assert.ok(isGrantKey("hito30@2026-12-10"));
  assert.ok(!isGrantKey("contrato@2026-48"));
  assert.ok(!isGrantKey("hito14@2026-02-30"), "fecha inexistente");
  assert.ok(!isGrantKey("hito7@2026-11-20"), "no hay hito de 7");
  assert.ok(!isGrantKey("tienda@2026-11-20"), "la tienda jamás vende escudos");
});

/* --------------------------- helper de grant ------------------------ */

test("racha: grantShield respeta el tope 2 y omite duplicados (anti-acaparamiento)", () => {
  const draft = { play: {} };
  const at = "2026-11-20T12:00:00.000Z";
  assert.deepEqual(
    grantShield(draft, { key: "contrato@2026-W47", via: "contrato", at, date: "2026-11-20" }),
    { granted: true, reason: null }
  );
  assert.deepEqual(
    grantShield(draft, { key: "hito14@2026-11-20", via: "hito", at, date: "2026-11-20" }),
    { granted: true, reason: null }
  );
  assert.equal(shieldInventory(draft).available, RACHA_MAX_SHIELDS);
  /* Inventario lleno: el tercer grant se OMITE, no se acumula. */
  assert.deepEqual(
    grantShield(draft, { key: "contrato@2026-W48", via: "contrato", at, date: "2026-11-27" }),
    { granted: false, reason: "INVENTORY_FULL" }
  );
  assert.equal(Object.keys(draft.play.racha.grants).length, 2);
  /* Duplicado y clave incoherente con su vía también se omiten. */
  assert.equal(grantShield(draft, { key: "contrato@2026-W47", via: "contrato", at, date: "2026-11-20" }).reason, "DUPLICATE");
  assert.equal(grantShield(draft, { key: "hito14@2026-11-21", via: "contrato", at, date: "2026-11-21" }).reason, "BAD_GRANT_KEY");
});

/* ------------------------------ hitos ------------------------------- */

test("racha: el grant por hito exige la racha real y fecha la clave al alcanzarla", () => {
  const s = fresh();
  /* Con la base de 8 no hay hito: el reducer lo rechaza. */
  const early = mut(s, { type: "racha.grant", milestone: 14 }, "2026-11-11", 1);
  assert.equal(early.status, "rejected");
  assert.equal(early.error.code, "MILESTONE_NOT_REACHED");
  assert.equal(mut(s, { type: "racha.grant", milestone: 7 }, "2026-11-11", 2).error.code, "BAD_MILESTONE");

  seedTo14(s);
  assert.equal(milestoneReachDate(saved(s), 14), "2026-11-16");
  const granted = mut(s, { type: "racha.grant", milestone: 14 }, "2026-11-16", 30);
  assert.equal(granted.status, "applied", JSON.stringify(granted.error));
  assert.deepEqual(Object.keys(saved(s).play.racha.grants), ["hito14@2026-11-16"]);
  assert.equal(shieldInventory(saved(s)).available, 1);
  /* Repetirlo es DUPLICATE: un solo escudo por cadena y fecha. */
  assert.equal(mut(s, { type: "racha.grant", milestone: 14 }, "2026-11-16", 31).status, "duplicate");
  assert.equal(shieldInventory(saved(s)).available, 1);
});

test("racha: el hito de 30 llega con su propia fecha y clave", () => {
  const s = fresh();
  checkins(s, "2026-11-11", 22); /* base 8 + 22 = 30 el 2026-12-02 */
  assert.equal(deriveStreak(saved(s)).streak, 30);
  assert.equal(milestoneReachDate(saved(s), 30), "2026-12-02");
  const granted = mut(s, { type: "racha.grant", milestone: 30 }, "2026-12-02", 40);
  assert.equal(granted.status, "applied", JSON.stringify(granted.error));
  assert.deepEqual(Object.keys(saved(s).play.racha.grants), ["hito30@2026-12-02"]);
});

test("racha: cadena rota y vuelta a 14 = fecha nueva = grant nuevo posible", () => {
  const s = fresh();
  seedTo14(s);
  assert.equal(mut(s, { type: "racha.grant", milestone: 14 }, "2026-11-16", 30).status, "applied");
  /* Se rompe: falta el 17 y el 18 se juega solo (racha 1). */
  checkin(s, "2026-11-18", 50);
  assert.equal(deriveStreak(saved(s)).streak, 1);
  /* Se reconstruye: del 18-nov al 01-dic hay 14 días seguidos. */
  checkins(s, "2026-11-19", 13, 60);
  assert.equal(deriveStreak(saved(s)).streak, 14);
  assert.equal(milestoneReachDate(saved(s), 14), "2026-12-01");
  const again = mut(s, { type: "racha.grant", milestone: 14 }, "2026-12-01", 90);
  assert.equal(again.status, "applied", JSON.stringify(again.error));
  assert.deepEqual(
    Object.keys(saved(s).play.racha.grants).sort(),
    ["hito14@2026-11-16", "hito14@2026-12-01"]
  );
  assert.equal(shieldInventory(saved(s)).available, 2);
});

/* ------------------------- grant por contrato ----------------------- */

test("racha: el cofre del Contrato otorga el escudo en la MISMA escritura atómica", () => {
  const s = fresh();
  seedWeek51(s);
  const result = mut(s, { type: "contrato.claim", weekKey: "2026-W51" }, "2026-12-17", 240);
  assert.equal(result.status, "applied", JSON.stringify(result.error));
  const bundle = saved(s);
  assert.ok(bundle.play.contrato.claims["2026-W51"], "el reclamo quedó escrito");
  assert.deepEqual(
    bundle.play.racha.grants["contrato@2026-W51"],
    { date: "2026-12-17", at: "2026-12-17T12:04:00.000Z", via: "contrato" },
    "y el escudo nació en la misma mutación, con su clave de semana"
  );
  assert.ok(result.changed.some((p) => p.startsWith("play.racha.grants.")), "una sola escritura, dos rutas");
  assert.equal(shieldInventory(bundle).available, 1);
  /* El cofre sigue pagando su XP y sus ₡ congelados. */
  const d = derived(s);
  assert.equal(d.xpBreakdown.contrato, 150);
  /* Repetir el reclamo: DUPLICATE y ningún escudo extra. */
  assert.equal(mut(s, { type: "contrato.claim", weekKey: "2026-W51" }, "2026-12-17", 241).status, "duplicate");
  assert.equal(shieldInventory(saved(s)).available, 1);
});

test("racha: un reclamo de la Fase 2 ya escrito NO se reescribe ni gana escudo retroactivo", () => {
  const s = fresh();
  const bundle = saved(s);
  /* Borrador con un reclamo «viejo» (solo {xp, coins} congelados, sin
     play.racha): derivarlo no crea escudos de la nada… */
  const draft = structuredClone(bundle);
  draft.play = {
    ...(draft.play || {}),
    contrato: {
      version: 1,
      claims: {
        "2026-W51": {
          date: "2026-12-17", at: "2026-12-17T12:00:00.000Z",
          reward: { xp: 150, coins: 15 }, rulesVersion: 1
        }
      }
    }
  };
  assert.equal(shieldInventory(draft).available, 0);
  assert.deepEqual(rachaProblems(draft), []);
  /* …y reclamarlo de nuevo es DUPLICATE sin grant: su reward manda. */
  const again = applyMutation(draft, { type: "contrato.claim", weekKey: "2026-W51" }, catalog, on("2026-12-17", 5));
  assert.equal(again.duplicate, true);
  assert.equal(draft.play.racha, undefined, "ni siquiera se crea la sección");
});

test("racha: con el inventario lleno el cofre paga igual y el grant se omite", () => {
  const s = fresh();
  checkins(s, "2026-11-11", 22); /* racha 30 el 2026-12-02 */
  assert.equal(mut(s, { type: "racha.grant", milestone: 14 }, "2026-12-02", 300).status, "applied");
  assert.equal(mut(s, { type: "racha.grant", milestone: 30 }, "2026-12-02", 301).status, "applied");
  assert.equal(shieldInventory(saved(s)).available, 2, "inventario lleno antes del reclamo");
  seedWeek51(s);
  const result = mut(s, { type: "contrato.claim", weekKey: "2026-W51" }, "2026-12-17", 340);
  assert.equal(result.status, "applied", JSON.stringify(result.error));
  const bundle = saved(s);
  assert.equal(Object.keys(bundle.play.racha.grants).length, 2, "sin tercer escudo acumulado");
  assert.equal(bundle.play.racha.grants["contrato@2026-W51"], undefined);
  assert.equal(derived(s).xpBreakdown.contrato, 150, "el cofre pagó su XP igual");
});

/* ------------------------------- cover ------------------------------ */

function seedShielded14(s) {
  seedTo14(s);
  assert.equal(mut(s, { type: "racha.grant", milestone: 14 }, "2026-11-16", 30).status, "applied");
}

test("racha: cover preserva la cadena y el multiplicador, sin fabricar actividad", () => {
  const s = fresh();
  seedShielded14(s);
  /* El 17 no se juega; el 18 sí: sin escudo la racha ya cayó a 1. */
  checkin(s, "2026-11-18", 41);
  assert.equal(deriveStreak(saved(s)).streak, 1);
  assert.equal(coverCandidate(saved(s), "2026-11-18"), "2026-11-17");
  const covered = mut(s, { type: "racha.cover", date: "2026-11-17" }, "2026-11-18", 42);
  assert.equal(covered.status, "applied", JSON.stringify(covered.error));
  const bundle = saved(s);
  assert.deepEqual(bundle.play.racha.covered["2026-11-17"].via, "hito14@2026-11-16");
  const streak = deriveStreak(bundle);
  assert.equal(streak.streak, 16, "base 8 + 8 días de cadena (incluye el cubierto)");
  assert.equal(streakMult(streak.streak), 1.5, "el multiplicador ×1.5 queda intacto");
  assert.equal(shieldInventory(bundle).available, 0);
  assert.equal(validatePlayState(bundle, catalog).ok, true, "el save sigue válido");

  /* La misma cadena SIN hueco (jugando el 17) deriva la misma XP:
     el día cubierto no suma ni quita XP por sí mismo. */
  const s2 = fresh();
  seedTo14(s2);
  checkin(s2, "2026-11-17", 41);
  checkin(s2, "2026-11-18", 42);
  assert.equal(deriveStreak(saved(s2)).streak, 16);
  assert.equal(derived(s).totalXP, derived(s2).totalXP, "XP idéntica a la cadena sin hueco");

  /* Y no cuenta como día de ruta para el Contrato: la semana del
     16–22 nov (W47) solo ve los días reales 16 y 18, no el cubierto. */
  assert.equal(contratoProgress(bundle, "2026-W47")["ruta-dias"], 2);

  /* La semanita distingue el día cubierto con su punto-escudo. */
  const week = recentStreakDays(bundle, "2026-11-18", 7);
  assert.deepEqual(week.find((d) => d.date === "2026-11-17"), {
    date: "2026-11-17", checked: false, active: false, covered: true
  });
});

test("racha: cover se rechaza si el jugador todavía no registró actividad hoy", () => {
  const s = fresh();
  seedShielded14(s);
  /* Amanece el 18 sin jugar: abrir la app no gasta el escudo. */
  assert.equal(coverCandidate(saved(s), "2026-11-18"), null);
  const result = mut(s, { type: "racha.cover", date: "2026-11-17" }, "2026-11-18", 40);
  assert.equal(result.status, "rejected");
  assert.equal(result.error.code, "NO_ACTIVITY_TODAY");
  assert.equal(shieldInventory(saved(s)).available, 1, "el escudo sigue guardado");
});

test("racha: un hueco de 2+ días NO lo salvan ni dos escudos", () => {
  const s = fresh();
  seedShielded14(s);
  /* Faltan 17 y 18; se vuelve el 19. */
  checkin(s, "2026-11-19", 50);
  assert.equal(coverCandidate(saved(s), "2026-11-19"), null);
  assert.equal(mut(s, { type: "racha.cover", date: "2026-11-17" }, "2026-11-19", 51).error.code, "GAP_NOT_COVERABLE");
  assert.equal(mut(s, { type: "racha.cover", date: "2026-11-18" }, "2026-11-19", 52).error.code, "GAP_NOT_COVERABLE");
  assert.equal(deriveStreak(saved(s)).streak, 1, "la cadena se cortó como siempre");
  assert.equal(shieldInventory(saved(s)).available, 1, "ningún escudo se gastó");
});

test("racha: cover sin inventario se rechaza y la cadena se corta como hoy", () => {
  const s = fresh();
  seedTo14(s); /* racha 14 pero SIN grant: inventario en 0 */
  checkin(s, "2026-11-18", 41);
  const result = mut(s, { type: "racha.cover", date: "2026-11-17" }, "2026-11-18", 42);
  assert.equal(result.status, "rejected");
  assert.equal(result.error.code, "NO_SHIELDS");
  const streak = deriveStreak(saved(s));
  assert.equal(streak.streak, 1);
  assert.equal(streakMult(streak.streak), 1, "sin escudo, el comportamiento es el de hoy");
});

test("racha: cubrir dos veces el mismo día es DUPLICATE y no gasta otro escudo", () => {
  const s = fresh();
  seedShielded14(s);
  /* Segundo escudo vía contrato para que quede inventario tras cubrir. */
  checkin(s, "2026-11-18", 41);
  assert.equal(mut(s, { type: "racha.cover", date: "2026-11-17" }, "2026-11-18", 42).status, "applied");
  const again = mut(s, { type: "racha.cover", date: "2026-11-17" }, "2026-11-18", 43);
  assert.equal(again.status, "duplicate");
  assert.equal(Object.keys(saved(s).play.racha.covered).length, 1);
});

/* ---------------------------- validación ---------------------------- */

test("racha: rachaProblems caza formas imposibles (fail-closed)", () => {
  const base = saved(fresh());
  const withRacha = (racha) => ({ ...base, play: { ...base.play, racha } });
  const grant = { date: "2026-11-20", at: "2026-11-20T12:00:00.000Z", via: "contrato" };
  assert.deepEqual(rachaProblems(withRacha({
    version: 1, grants: { "contrato@2026-W47": grant }, covered: {}
  })), [], "la forma buena pasa");
  assert.ok(rachaProblems(withRacha({
    version: 1, grants: {}, covered: { "2026-11-21": { at: "2026-11-22T12:00:00.000Z", via: "contrato@2026-W47" } }
  })).length > 0, "|covered| ≤ |grants| y via con grant existente");
  assert.ok(rachaProblems(withRacha({
    version: 1, grants: { "tienda@2026-W47": grant }, covered: {}
  })).length > 0, "clave fuera de los formatos cerrados");
  assert.ok(rachaProblems(withRacha({
    version: 1, grants: { "contrato@2026-W47": { ...grant, via: "hito" } }, covered: {}
  })).length > 0, "via incoherente con la clave");
  assert.ok(rachaProblems(withRacha({
    version: 1,
    grants: { "contrato@2026-W47": grant },
    covered: { "21-11-2026": { at: "2026-11-22T12:00:00.000Z", via: "contrato@2026-W47" } }
  })).length > 0, "día cubierto con fecha inválida");
});

test("racha: la vista expone el inventario para el chip y la vitrina", () => {
  const s = fresh();
  seedShielded14(s);
  const view = rachaView(saved(s));
  assert.equal(view.available, 1);
  assert.equal(view.cap, 2);
  assert.equal(view.full, false);
  assert.deepEqual(view.grantKeys, ["hito14@2026-11-16"]);
  assert.deepEqual(view.coveredDates, []);
});
