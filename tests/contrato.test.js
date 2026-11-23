/**
 * contrato.test.js — CONTRATO SEMANAL (v0.46.0, Dinámicas de Enganche
 * Fase 2): 3 retos semanales armados solo con registros reales y un
 * cofre de 150 XP + ₡15 al cerrar los 3.
 *
 * Lo que se protege acá:
 *  - el pool de 6 plantillas es EXACTO el de §3.3 del diseño y la
 *    selección de 3 por semana es determinista (hash FNV-1a de la
 *    clave ISO): misma semana = mismo contrato, sin guardar nada;
 *  - el progreso NUNCA se guarda: se deriva de registros con fecha en
 *    la semana ISO (hub + checkins, sistemas vivos, campañas) y lo
 *    migrado de ODEA 1 (core) no cuenta;
 *  - el reclamo pasa por la puerta única, el reducer RECALCULA desde
 *    el borrador, es idempotente por semana (sin pago doble) y respeta
 *    la ventana: semana en curso + gracia hasta el miércoles siguiente;
 *  - un save sin reclamos deriva totales idénticos (paridad), con el
 *    componente nuevo `contrato` en 0.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  CONTRATO_REWARD, CONTRATO_TEMPLATES, contratoProblems, contratoProgress,
  contratoRewards, contratoStateOf, contratoTemplatesFor, contratoView,
  contratoWeekView, isWeekKey, mondayOfWeek, weekRange
} from "../src/contrato-state.js";
import { applyMutation } from "../src/gameplay.js";
import {
  STORAGE_KEYS, createMemoryStorage, importBundle, applyGameplayMutation
} from "../src/storage.js";
import { derive, isoWeekKey, sourcesFromMigrated } from "../src/derive.js";
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

/* Semana de trabajo de estas pruebas: 2026-W51 (lun 2026-12-14), cuyos
   retos deterministas son racha-firme, ruta-dias y rutinas-vivas. */
const WEEK = "2026-W51";

/* La rotación de respaldos del motor conserva solo 3 y ordena por la
   clave completa (huella + fecha): al sembrar muchas mutaciones seguidas
   en una misma prueba, un respaldo recién creado puede rotar fuera antes
   de su relectura y la escritura falla cerrada (BACKUP_FAILED). Limpiar
   los respaldos entre pasos es housekeeping de la prueba, no del juego. */
function cleanBackups(s) {
  const keys = [];
  for (let i = 0; i < s.length; i += 1) {
    const key = s.key(i);
    if (key && key.startsWith(STORAGE_KEYS.backupPrefix)) keys.push(key);
  }
  for (const key of keys) s.removeItem(key);
}

function seedWeek51(s) {
  /* 7 check-ins seguidos (11–17 dic): la racha derivada llega a 7 y la
     ruta suma 4 días distintos dentro de la semana (14–17). */
  ["2026-12-11", "2026-12-12", "2026-12-13", "2026-12-14", "2026-12-15", "2026-12-16", "2026-12-17"]
    .forEach((d, i) => {
      const r = mutateOn(s, { type: "hub.checkin" }, d, i);
      assert.equal(r.status, "applied", `checkin ${d}: ${JSON.stringify(r.error)}`);
      cleanBackups(s);
    });
  /* 6 rutinas del Garaje Vivo registradas el lunes de la semana. */
  ["garaje-01", "garaje-02", "garaje-03", "garaje-04", "garaje-05", "garaje-06"]
    .forEach((id, i) => {
      const r = mutateOn(s, { type: "garage.complete", missionId: id }, "2026-12-14", 20 + i);
      assert.equal(r.status, "applied", `garaje ${id}: ${JSON.stringify(r.error)}`);
      cleanBackups(s);
    });
}

test("contrato: el pool de 6 plantillas es exacto el del diseño §3.3", () => {
  assert.deepEqual(
    CONTRATO_TEMPLATES.map((t) => [t.id, t.target]),
    [
      ["ruta-dias", 4],
      ["ruta-completa", 3],
      ["rutinas-vivas", 6],
      ["avance-campana", 3],
      ["semana-activa", 12],
      ["racha-firme", 7]
    ]
  );
  assert.deepEqual(CONTRATO_REWARD, { xp: 150, coins: 15 });
});

test("contrato: la selección de 3 por semana es determinista, distinta y varía entre semanas", () => {
  for (let w = 1; w <= 53; w += 1) {
    const key = `2026-W${String(w).padStart(2, "0")}`;
    const a = contratoTemplatesFor(key).map((t) => t.id);
    const b = contratoTemplatesFor(key).map((t) => t.id);
    assert.deepEqual(a, b, `${key}: misma semana, mismo contrato`);
    assert.equal(a.length, 3);
    assert.equal(new Set(a).size, 3, `${key}: 3 plantillas distintas`);
    for (const id of a) assert.ok(CONTRATO_TEMPLATES.some((t) => t.id === id));
  }
  const sets = new Set();
  for (let w = 40; w <= 53; w += 1) {
    sets.add(contratoTemplatesFor(`2026-W${w}`).map((t) => t.id).join(","));
  }
  assert.ok(sets.size >= 5, "la selección varía de semana en semana");
  assert.deepEqual(contratoTemplatesFor("no-es-semana"), []);
});

test("contrato: el calendario ISO (lunes, domingo y gracia al miércoles) es correcto", () => {
  assert.equal(mondayOfWeek("2026-W48"), "2026-11-23");
  assert.deepEqual(weekRange("2026-W48"), {
    monday: "2026-11-23", sunday: "2026-11-29", graceEnd: "2026-12-02"
  });
  for (let w = 1; w <= 52; w += 1) {
    const key = `2026-W${String(w).padStart(2, "0")}`;
    assert.equal(isoWeekKey(mondayOfWeek(key)), key, `roundtrip ${key}`);
  }
  assert.ok(isWeekKey("2026-W48"));
  assert.ok(!isWeekKey("2026-W99"));
  assert.ok(!isWeekKey("2026-48"));
});

test("contrato: el progreso se deriva de registros con fecha en la semana; core no cuenta", () => {
  const rec = (system, date) => ({ missionId: "x", system, date, at: `${date}T12:00:00.000Z` });
  const bundle = {
    core: {
      identity: { streak: 0, lastDailyDate: null },
      progress: { completedDaily: ["1A", "1B", "1C"] },
      activity: {}
    },
    play: {
      completions: {
        "a@2026-11-23": rec("hub", "2026-11-23"),
        "b@2026-11-23": rec("hub", "2026-11-23"),
        "c@2026-11-23": rec("hub", "2026-11-23"),
        "d@2026-11-25": rec("hub", "2026-11-25"),
        "fuera@2026-11-30": rec("hub", "2026-11-30"),
        "vida@2026-11-24": rec("vida", "2026-11-24")
      },
      checkins: { "2026-11-27": { at: "2026-11-27T12:00:00.000Z" } },
      garaje: { records: { g1: { date: "2026-11-24" }, g2: { date: "2026-11-28" }, gF: { date: "2026-12-01" } } },
      ian: { records: { i1: { date: "2026-11-26" } } },
      marca: { records: { m1: { date: "2026-11-23" }, m2: { date: "2026-11-25" }, m3: { date: "2026-11-29" } } },
      campaigns: {
        completions: {
          c1: { date: "2026-11-23" }, c2: { date: "2026-11-26" },
          c3: { date: "2026-11-29" }, cF: { date: "2026-11-20" }
        }
      }
    }
  };
  const p = contratoProgress(bundle, "2026-W48");
  assert.equal(p["ruta-dias"], 3, "23 y 25 por hub + 27 por check-in");
  assert.equal(p["ruta-completa"], 3, "el mejor día trae 3 hub");
  assert.equal(p["rutinas-vivas"], 6, "2 garaje + 1 ian + 3 marca, solo en la semana");
  assert.equal(p["avance-campana"], 3);
  assert.equal(p["semana-activa"], 14, "5 completaciones play + 6 vivas + 3 de campaña");
  assert.equal(p["racha-firme"], 4, "la racha es global: cuentan los 4 días activos con hub/checkin (23, 25, 27 y 30)");
  /* La semana siguiente solo ve su propio registro del 30. */
  const next = contratoProgress(bundle, "2026-W49");
  assert.equal(next["ruta-dias"], 1);
  assert.equal(next["avance-campana"], 0);
});

test("contrato: un save sin play.contrato se lee vacío y deriva idéntico (paridad)", () => {
  const s = fresh();
  const bundle = saved(s);
  assert.equal(bundle.play?.contrato, undefined);
  assert.deepEqual(contratoStateOf(bundle), { version: 1, claims: {} });
  assert.deepEqual(contratoRewards(bundle), { xp: 0, coins: 0 });
  assert.deepEqual(contratoProblems(bundle), []);
  const d = derived(s);
  assert.equal(d.xpBreakdown.contrato, 0, "el componente nuevo nace en 0");
  assert.equal(d.totalXP, 6915, "total del fixture, sin mover ni un punto");
  assert.deepEqual(d.coins, { earned: 141, spent: 100, balance: 41 });
});

test("contrato: reclamar al 3/3 paga el cofre congelado por el oráculo, una sola vez", () => {
  const s = fresh();
  seedWeek51(s);
  const view = contratoView(saved(s), "2026-12-17");
  assert.equal(view.weekKey, WEEK);
  assert.equal(view.complete, true, `retos: ${JSON.stringify(view.challenges)}`);
  const before = derived(s);
  const result = mutateOn(s, { type: "contrato.claim", weekKey: WEEK }, "2026-12-17", 40);
  assert.equal(result.status, "applied", JSON.stringify(result.error));
  const bundle = saved(s);
  assert.deepEqual(bundle.play.contrato.claims[WEEK], {
    date: "2026-12-17",
    at: bundle.play.contrato.claims[WEEK].at,
    reward: { xp: 150, coins: 15 },
    rulesVersion: 1
  });
  assert.ok(Number.isFinite(Date.parse(bundle.play.contrato.claims[WEEK].at)));
  const after = derived(s);
  assert.equal(after.totalXP, before.totalXP + 150);
  assert.equal(after.xpBreakdown.contrato, 150);
  assert.equal(after.coins.earned, before.coins.earned + 15);
  assert.equal(after.coins.balance, before.coins.balance + 15);
  assert.equal(validatePlayState(bundle, catalog).ok, true);
  /* Repetir el reclamo: duplicado, sin pago doble. */
  const again = mutateOn(s, { type: "contrato.claim", weekKey: WEEK }, "2026-12-17", 50);
  assert.equal(again.status, "duplicate");
  assert.deepEqual(derived(s), after);
  assert.equal(Object.keys(saved(s).play.contrato.claims).length, 1);
});

test("contrato: la gracia permite reclamar la semana pasada hasta el miércoles", () => {
  const s = fresh();
  seedWeek51(s);
  /* La vista del lunes 21 ya muestra la semana W51 en gracia. */
  const view = contratoView(saved(s), "2026-12-21");
  assert.equal(view.grace?.weekKey, WEEK);
  assert.equal(view.grace?.isGrace, true);
  assert.equal(view.grace?.complete, true);
  /* Miércoles 23 (último día de gracia): el reclamo entra. */
  const result = mutateOn(s, { type: "contrato.claim", weekKey: WEEK }, "2026-12-23");
  assert.equal(result.status, "applied", JSON.stringify(result.error));
  assert.equal(derived(s).xpBreakdown.contrato, 150);
});

test("contrato: pasada la gracia (jueves) el contrato expira y no paga", () => {
  const s = fresh();
  seedWeek51(s);
  assert.equal(contratoView(saved(s), "2026-12-24").grace, null);
  const rawBefore = s.getItem(STORAGE_KEYS.bundle);
  const result = mutateOn(s, { type: "contrato.claim", weekKey: WEEK }, "2026-12-24");
  assert.equal(result.status, "rejected");
  assert.equal(result.error.code, "CLAIM_EXPIRED");
  assert.equal(s.getItem(STORAGE_KEYS.bundle), rawBefore);
  assert.equal(derived(s).xpBreakdown.contrato, 0);
});

test("contrato: sin los 3 retos el reducer rechaza — no confía en la UI", () => {
  const s = fresh();
  const view = contratoView(saved(s), "2026-12-17");
  assert.equal(view.complete, false);
  const result = mutateOn(s, { type: "contrato.claim", weekKey: WEEK }, "2026-12-17");
  assert.equal(result.status, "rejected");
  assert.equal(result.error.code, "CONTRACT_INCOMPLETE");
  assert.equal(saved(s).play?.contrato, undefined, "ningún rechazo creó la sección");
  /* Y a nivel de reducer puro pasa lo mismo con un borrador sembrado a medias. */
  const draft = structuredClone(saved(s));
  const pure = applyMutation(draft, { type: "contrato.claim", weekKey: WEEK }, catalog, on("2026-12-17"));
  assert.equal(pure.changed, false);
  assert.equal(pure.reason, "CONTRACT_INCOMPLETE");
});

test("contrato: clave de semana inválida se rechaza", () => {
  const s = fresh();
  const result = mutateOn(s, { type: "contrato.claim", weekKey: "2026-51" }, "2026-12-17");
  assert.equal(result.status, "rejected");
  assert.equal(result.error.code, "BAD_WEEK_KEY");
});

test("contrato: un reclamo manipulado (cofre distinto o rulesVersion) invalida el save", () => {
  const s = fresh();
  seedWeek51(s);
  mutateOn(s, { type: "contrato.claim", weekKey: WEEK }, "2026-12-17", 40);
  const bundle = saved(s);
  bundle.play.contrato.claims[WEEK].reward.xp = 999;
  assert.ok(contratoProblems(bundle).some((p) => p.includes("exactamente el cofre vigente")));
  assert.equal(validatePlayState(bundle, catalog).ok, false);
  const bundle2 = saved(s);
  bundle2.play.contrato.claims[WEEK].rulesVersion = 2;
  assert.ok(contratoProblems(bundle2).some((p) => p.includes("rulesVersion")));
  const bundle3 = saved(s);
  bundle3.play.contrato.claims["2026-W99"] = bundle3.play.contrato.claims[WEEK];
  assert.ok(contratoProblems(bundle3).some((p) => p.includes("clave de semana inválida")));
  /* La vista de semana expone el reclamo y el estado reclamado. */
  const view = contratoWeekView(saved(s), WEEK, "2026-12-17");
  assert.equal(view.claimed, true);
  assert.equal(view.claim.reward.xp, 150);
});
