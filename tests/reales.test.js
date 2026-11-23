/**
 * reales.test.js — RECOMPENSAS REALES (v0.45.0, Dinámicas de Enganche
 * Fase 1): el puerto de ODEA 1 v5.93. El fixture sintético trae ₡41 de
 * saldo y una herencia canje con 1 personalizada (cx_sint_1, ₡30) y 1
 * canje pendiente (lr_movie, ₡30, sin disfrutar).
 *
 * Lo que se protege acá:
 *  - el catálogo base es EXACTO el de ODEA 1 (§2.2 del diseño);
 *  - `core.realRewards.canje` se lee y JAMÁS se escribe;
 *  - canjear cobra una sola vez (requestId idempotente) y el gasto
 *    entra al saldo por el oráculo (play.reales.spent), sin tocar XP;
 *  - un save sin play.reales deriva totales idénticos (paridad);
 *  - `spent` es autoconsistente con el log: si no cuadra, no valida.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  LIFE_REWARDS, heritageCanje, realesCatalog, realesProblems,
  realesStateOf, realesView,
} from "../src/reales-state.js";
import { applyMutation } from "../src/gameplay.js";
import {
  STORAGE_KEYS, createMemoryStorage, importBundle, applyGameplayMutation,
} from "../src/storage.js";
import { derive, sourcesFromMigrated } from "../src/derive.js";
import { validatePlayState } from "../src/validate.js";

const catalog = JSON.parse(fs.readFileSync(new URL("../data/xp-catalog.json", import.meta.url)));
const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/odea-progreso-sintetico.json", import.meta.url)));
const date = "2026-11-23";
const opts = (second = 0) => ({
  date, at: new Date(Date.UTC(2026, 10, 23, 12, 0, second)).toISOString()
});

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
const mutate = (s, mutation, second = 0) => applyGameplayMutation(s, catalog, mutation, opts(second));

test("reales: el catálogo base es exacto el de ODEA 1 v5.93", () => {
  assert.deepEqual(
    LIFE_REWARDS.map((r) => [r.id, r.ico, r.n, r.price]),
    [
      ["lr_movie", "🍿", "Noche de película con palomitas", 30],
      ["lr_sleep", "😴", "Dormir hasta tarde, sin alarma", 35],
      ["lr_game1h", "🎮", "1 hora de videojuegos sin culpa", 40],
      ["lr_ian", "🧩", "Tarde de juegos con Ian", 45],
      ["lr_cheat", "🍔", "Comida trampa: antojo libre", 50],
      ["lr_moto", "🏍️", "Salida en moto sin destino", 60],
      ["lr_gustito", "🛍️", "Gustito personal (hasta ₡5.000)", 100],
      ["lr_libre", "🌴", "Medio día libre de obligaciones", 120]
    ]
  );
});

test("reales: un save sin play.reales se lee con defaults y la herencia se ve, sin tocar el save", () => {
  const s = fresh();
  const bundle = saved(s);
  assert.equal(bundle.play?.reales, undefined);
  assert.deepEqual(realesStateOf(bundle), { version: 1, custom: [], log: [], hidden: [], enjoyed: [], spent: 0 });
  assert.deepEqual(realesProblems(bundle), []);
  const view = realesView(bundle);
  /* 8 base + 1 personalizada heredada del fixture. */
  assert.equal(view.catalog.length, 9);
  assert.ok(view.catalog.some((r) => r.id === "cx_sint_1" && r.origin === "heredada" && r.custom));
  /* El canje heredado pendiente del fixture entra como h:0. */
  assert.deepEqual(view.pending.map((p) => p.key), ["h:0"]);
  assert.equal(view.enjoyedCount, 0);
});

test("reales: la forma de jugador nuevo (rewards/history) también se normaliza", () => {
  const bundle = { core: { realRewards: { canje: { rewards: [], history: [] } } }, play: {} };
  assert.deepEqual(heritageCanje(bundle), { custom: [], log: [] });
  const view = realesView(bundle);
  assert.equal(view.catalog.length, 8);
  assert.deepEqual(view.pending, []);
});

test("reales: paridad — sin actividad nueva los totales derivados son idénticos", () => {
  const s = fresh();
  const before = derived(s);
  realesView(saved(s));
  realesCatalog(saved(s));
  const after = derived(s);
  assert.deepEqual(after.coins, before.coins);
  assert.equal(after.totalXP, before.totalXP);
  assert.deepEqual(after.xpBreakdown, before.xpBreakdown);
});

test("reales: canjear cobra del saldo vía el oráculo, sin tocar XP ni la herencia", () => {
  const s = fresh();
  const before = derived(s);
  const heritageBefore = structuredClone(saved(s).core.realRewards);
  const result = mutate(s, { type: "reales.redeem", rewardId: "lr_movie", requestId: "rq-test-0001" });
  assert.equal(result.status, "applied");
  const bundle = saved(s);
  assert.equal(bundle.play.reales.spent, 30);
  assert.equal(bundle.play.reales.log.length, 1);
  assert.equal(bundle.play.reales.log[0].done, false);
  assert.equal(bundle.play.reales.log[0].n, "Noche de película con palomitas");
  const after = derived(s);
  assert.equal(after.coins.balance, before.coins.balance - 30);
  assert.equal(after.coins.spent, before.coins.spent + 30);
  assert.equal(after.totalXP, before.totalXP, "canjear no mueve XP");
  assert.deepEqual(bundle.core.realRewards, heritageBefore, "core.realRewards jamás se escribe");
  /* Y la recompensa canjeada aparece en «Por disfrutar». */
  const view = realesView(bundle);
  assert.ok(view.pending.some((p) => p.key === "rq-test-0001" && p.origin === "propia"));
});

test("reales: el mismo requestId no cobra dos veces (idempotencia)", () => {
  const s = fresh();
  assert.equal(mutate(s, { type: "reales.redeem", rewardId: "lr_movie", requestId: "rq-test-0002" }).status, "applied");
  const again = mutate(s, { type: "reales.redeem", rewardId: "lr_movie", requestId: "rq-test-0002" }, 5);
  assert.equal(again.status, "duplicate");
  assert.equal(saved(s).play.reales.spent, 30);
  assert.equal(saved(s).play.reales.log.length, 1);
});

test("reales: sin saldo el canje se rechaza y el save no cambia", () => {
  const s = fresh();
  const rawBefore = s.getItem(STORAGE_KEYS.bundle);
  const result = mutate(s, { type: "reales.redeem", rewardId: "lr_libre", requestId: "rq-test-0003" });
  assert.equal(result.status, "rejected");
  assert.equal(result.error.code, "INSUFFICIENT_FUNDS");
  assert.equal(s.getItem(STORAGE_KEYS.bundle), rawBefore);
});

test("reales: requestId inválido se rechaza", () => {
  const s = fresh();
  const result = mutate(s, { type: "reales.redeem", rewardId: "lr_movie", requestId: "corto" });
  assert.equal(result.status, "rejected");
  assert.equal(result.error.code, "BAD_REQUEST_ID");
});

test("reales: disfrutar un canje propio lo saca de pendientes y suma al contador", () => {
  const s = fresh();
  mutate(s, { type: "reales.redeem", rewardId: "lr_movie", requestId: "rq-test-0004" });
  const result = mutate(s, { type: "reales.enjoy", key: "rq-test-0004" }, 5);
  assert.equal(result.status, "applied");
  const bundle = saved(s);
  assert.equal(bundle.play.reales.log[0].done, true);
  assert.equal(bundle.play.reales.log[0].doneDate, date);
  const view = realesView(bundle);
  assert.ok(!view.pending.some((p) => p.key === "rq-test-0004"));
  assert.equal(view.enjoyedCount, 1);
  /* Repetirlo es duplicado, sin cambios. */
  assert.equal(mutate(s, { type: "reales.enjoy", key: "rq-test-0004" }, 9).status, "duplicate");
});

test("reales: disfrutar un canje heredado usa la tumba enjoyed y no toca core", () => {
  const s = fresh();
  const heritageBefore = structuredClone(saved(s).core.realRewards);
  const result = mutate(s, { type: "reales.enjoy", key: "h:0" });
  assert.equal(result.status, "applied");
  const bundle = saved(s);
  assert.deepEqual(bundle.play.reales.enjoyed, ["h:0"]);
  assert.deepEqual(bundle.core.realRewards, heritageBefore);
  const view = realesView(bundle);
  assert.deepEqual(view.pending, []);
  assert.equal(view.enjoyedCount, 1);
});

test("reales: crear una personalizada la suma al catálogo y borrarla la saca", () => {
  const s = fresh();
  const created = mutate(s, { type: "reales.create", n: "Cena con mi pareja", ico: "🍣", price: 80 });
  assert.equal(created.status, "applied");
  let view = realesView(saved(s));
  const mine = view.catalog.find((r) => r.n === "Cena con mi pareja");
  assert.ok(mine && mine.origin === "propia" && mine.custom && mine.price === 80);
  const removed = mutate(s, { type: "reales.delete", rewardId: mine.id }, 5);
  assert.equal(removed.status, "applied");
  view = realesView(saved(s));
  assert.ok(!view.catalog.some((r) => r.id === mine.id));
});

test("reales: borrar una heredada la oculta con tumba hidden y core queda intacto", () => {
  const s = fresh();
  const result = mutate(s, { type: "reales.delete", rewardId: "cx_sint_1" });
  assert.equal(result.status, "applied");
  const bundle = saved(s);
  assert.deepEqual(bundle.play.reales.hidden, ["cx_sint_1"]);
  assert.ok(bundle.core.realRewards.canje.custom.some((r) => r.id === "cx_sint_1"), "la herencia sigue en core");
  assert.ok(!realesView(bundle).catalog.some((r) => r.id === "cx_sint_1"));
});

test("reales: las del catálogo base no se pueden borrar", () => {
  const s = fresh();
  const result = mutate(s, { type: "reales.delete", rewardId: "lr_movie" });
  assert.equal(result.status, "rejected");
  assert.equal(result.error.code, "NOT_CUSTOM");
});

test("reales: crear valida nombre, icono y precio (1–999)", () => {
  const s = fresh();
  assert.equal(mutate(s, { type: "reales.create", n: "", ico: "🎁", price: 50 }).status, "rejected");
  assert.equal(mutate(s, { type: "reales.create", n: "X", ico: "🎁", price: 0 }).status, "rejected");
  assert.equal(mutate(s, { type: "reales.create", n: "X", ico: "🎁", price: 1000 }).status, "rejected");
  assert.equal(saved(s).play?.reales, undefined, "ningún rechazo creó la sección");
});

test("reales: un spent que no cuadra con el log invalida la sección y bloquea mutaciones", () => {
  const s = fresh();
  mutate(s, { type: "reales.redeem", rewardId: "lr_movie", requestId: "rq-test-0005" });
  const bundle = saved(s);
  bundle.play.reales.spent = 999;
  assert.ok(realesProblems(bundle).some((p) => p.includes("no cuadra")));
  const report = validatePlayState(bundle, catalog);
  assert.equal(report.ok, false, "validatePlayState debe fallar con un spent que no cuadra");
  const draft = structuredClone(bundle);
  const result = applyMutation(draft, { type: "reales.enjoy", key: "rq-test-0005" }, catalog, opts());
  assert.equal(result.changed, false);
  assert.equal(result.reason, "SCHEMA_INVALID");
});

test("reales: canjear una personalizada heredada cobra su precio y guarda su foto en el log", () => {
  const s = fresh();
  const result = mutate(s, { type: "reales.redeem", rewardId: "cx_sint_1", requestId: "rq-test-0006" });
  assert.equal(result.status, "applied");
  const bundle = saved(s);
  assert.equal(bundle.play.reales.spent, 30);
  assert.equal(bundle.play.reales.log[0].n, "Recompensa sintética");
  /* Borrar la heredada después no deja huérfano el historial. */
  mutate(s, { type: "reales.delete", rewardId: "cx_sint_1" }, 5);
  const view = realesView(saved(s));
  assert.ok(view.pending.some((p) => p.key === "rq-test-0006"));
});
