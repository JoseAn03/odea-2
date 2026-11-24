import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  INGLES_ITEMS, TOPE_TURNO_XP, TOPE_TURNO_COINS,
  inglesView, inglesRewards, inglesProblems, inglesWeekPaid, turnoDelDia
} from "../src/ingles-state.js";
import { STORAGE_KEYS, createMemoryStorage, importBundle, applyGameplayMutation } from "../src/storage.js";
import { derive, sourcesFromMigrated } from "../src/derive.js";

const catalog = JSON.parse(fs.readFileSync(new URL("../data/xp-catalog.json", import.meta.url)));
const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/odea-progreso-sintetico.json", import.meta.url)));
const date = "2026-11-24";
function fresh() {
  const storage = createMemoryStorage();
  const imported = importBundle(structuredClone(fixture), {
    storage, catalog, referenceDate: "2026-11-10", migratedAt: "2026-11-10T12:00:00.000Z"
  });
  assert.equal(imported.status, "active");
  return storage;
}
const saved = (s) => JSON.parse(s.getItem(STORAGE_KEYS.bundle));
const opts = (d = date, second = 0) => ({
  date: d, at: new Date(Date.UTC(2026, 10, 24, 12, 0, second)).toISOString()
});
const hecho = (s, id, d = date, second = 0) =>
  applyGameplayMutation(s, catalog, { type: "ingles.complete", missionId: id }, opts(d, second));
const derived = (s) => derive(sourcesFromMigrated(saved(s), catalog), catalog, "2026-11-10");
const item = (view, id) => view.items.find((m) => m.id === id);

test("torre vivo: 26 ítems — 17 rutinas y 9 hitos (expansión v3)", () => {
  assert.equal(INGLES_ITEMS.length, 26);
  const rutinas = INGLES_ITEMS.filter((m) => m.kind === "rutina");
  const hitos = INGLES_ITEMS.filter((m) => m.kind === "hito");
  assert.equal(rutinas.length, 17);
  assert.equal(hitos.length, 9);
  const ritmo = Object.fromEntries(INGLES_ITEMS.map((m) => [m.id, m.days]));
  assert.equal(ritmo["ingles-01"], 2, "shadowing: cada 2 días ≈ 3–4 sesiones/semana (dosis del protocolo)");
  assert.equal(ritmo["ingles-10"], 30, "chequeo de torre: mensual");
  assert.equal(ritmo["ingles-15"], 14, "dictogloss exprés: reloj largo, es la práctica más pesada");
  for (const skill of ["voz", "oido", "palabras", "entrevista"]) {
    assert.ok(rutinas.some((m) => m.skill === skill), `sin rutinas de ${skill}`);
  }
});

test("torre vivo: la economía es la de la expansión v3", () => {
  const sum = (list) => list.reduce((a, m) => ({ xp: a.xp + m.xp, coins: a.coins + m.coins }), { xp: 0, coins: 0 });
  const rutinas = sum(INGLES_ITEMS.filter((m) => m.kind === "rutina"));
  const hitos = sum(INGLES_ITEMS.filter((m) => m.kind === "hito"));
  assert.deepEqual(rutinas, { xp: 870, coins: 58 }, "primera vuelta de rutinas: 870 XP / ₡58");
  assert.deepEqual(hitos, { xp: 780, coins: 48 }, "los 9 hitos pagan 780 XP / ₡48 una vez");
  assert.equal(TOPE_TURNO_XP, 850);
  assert.equal(TOPE_TURNO_COINS, 58);
});

test("torre vivo: la vista inicial marca todo sin hacer y la semana llena", () => {
  const s = fresh();
  const view = inglesView(saved(s), date);
  assert.equal(view.probadas, 0);
  assert.equal(view.rank, false);
  assert.equal(view.rutinasAlDia, 0);
  assert.equal(view.week.length, 17, "las 17 rutinas tocan la primera semana");
  assert.equal(view.hitosDone, 0);
  assert.equal(view.weekPaid.xp, 0);
  assert.equal(view.weekPaid.capReached, false);
  assert.deepEqual(inglesRewards(saved(s)), { xp: 0, coins: 0 });
  assert.deepEqual(inglesProblems(saved(s)), []);
});

test("torre vivo: TODO desbloqueado, el último hito se puede hacer primero", () => {
  const s = fresh();
  const before = derived(s);
  assert.equal(hecho(s, "ingles-h9").status, "applied", "sin candados secuenciales");
  const after = derived(s);
  assert.equal(after.totalXP - before.totalXP, 80);
  assert.equal(after.coins.balance - before.coins.balance, 5);
  assert.equal(after.xpBreakdown.ingles, 80);
  assert.equal(item(inglesView(saved(s), date), "ingles-h9").state, "completada");
});

test("torre vivo: completar una rutina paga una vez y arranca su reloj", () => {
  const s = fresh();
  const before = derived(s);
  assert.equal(hecho(s, "ingles-03").status, "applied");
  const after = derived(s);
  assert.equal(after.totalXP - before.totalXP, 50);
  assert.equal(after.coins.balance - before.coins.balance, 3);
  assert.equal(after.xpBreakdown.ingles, 50);
  const m = item(inglesView(saved(s), date), "ingles-03");
  /* Con 3 días de ciclo, el ciclo entero cae dentro de la ventana de
     aviso de 3 días: queda «por vencer», la regla compartida con el
     Garaje, el Mundo de Ian y el Estudio. */
  assert.equal(m.state, "por-vencer");
  assert.equal(m.dueIn, 3);
  assert.equal(hecho(s, "ingles-03", date, 30).status, "duplicate", "el mismo día no se registra dos veces");
});

test("torre vivo: registrar antes de tiempo actualiza la fecha pero no paga", () => {
  const s = fresh();
  hecho(s, "ingles-15");
  const early = hecho(s, "ingles-15", "2026-11-25", 5);
  assert.equal(early.status, "applied");
  const view = inglesView(saved(s), "2026-11-25");
  const m = item(view, "ingles-15");
  assert.equal(m.state, "al-dia");
  assert.equal(m.lastDate, "2026-11-25", "el reloj reinició");
  assert.equal(m.times, 2);
  assert.deepEqual(inglesRewards(saved(s)), { xp: 60, coins: 4 }, "sin segundo pago");
});

test("torre vivo: paridad byte a byte en un save sin actividad de la zona", () => {
  const s = fresh();
  const bundle = saved(s);
  assert.equal(bundle.play?.ingles, undefined, "la sección nace perezosa: sin actividad no existe");
  const d = derived(s);
  assert.equal(d.xpBreakdown.ingles, 0, "sin ingles, el componente deriva 0");
  assert.deepEqual(inglesProblems(bundle), [], "sin sección, sin problemas de forma");
});

test("torre vivo: Empleo no se toca — career/hunt idénticos tras usar la Torre", () => {
  const s = fresh();
  const before = derived(s);
  hecho(s, "ingles-01");
  hecho(s, "ingles-h1");
  const after = derived(s);
  assert.equal(after.xpBreakdown.career, before.xpBreakdown.career, "career deriva de registros: la manzana no lo mueve");
  assert.equal(after.xpBreakdown.hunt, before.xpBreakdown.hunt, "hunt deriva de registros: la manzana no lo mueve");
  assert.equal(after.xpBreakdown.ingles, 100, "solo sumó la Torre (40 de rutina + 60 de hito)");
});

test("tope de turno: la semana paga como máximo 850 XP / ₡58 en rutinas", () => {
  const s = fresh();
  /* Lunes 2026-11-23 a sábado 2026-11-28: misma semana ISO. Se
     completan rutinas en días distintos (cada una paga al vencer su
     reloj o al no tener registro) hasta pasar el tope. */
  const dias = ["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28"];
  const ids = INGLES_ITEMS.filter((m) => m.kind === "rutina").map((m) => m.id);
  let sec = 0;
  for (const d of dias) {
    for (const id of ids) {
      hecho(s, id, d, sec++);
    }
  }
  const paid = inglesWeekPaid(saved(s), "2026-11-28");
  assert.ok(paid.xp <= TOPE_TURNO_XP, `pagó ${paid.xp} XP: sobre el tope`);
  assert.ok(paid.coins <= TOPE_TURNO_COINS, `pagó ₡${paid.coins}: sobre el tope`);
  assert.equal(paid.xp, TOPE_TURNO_XP, "el tope se alcanza exacto, sin pasarse");
  const records = Object.values(saved(s).play.ingles.records);
  assert.ok(records.some((r) => r.capped === true), "hubo registros recortados por el tope");
  const capped = records.filter((r) => r.capped);
  assert.ok(capped.every((r) => r.fullReward && r.reward.xp <= r.fullReward.xp), "el registro guarda lo íntegro en fullReward");
  assert.deepEqual(inglesProblems(saved(s)), [], "los registros recortados son forma válida");
});

test("tope de turno: pasado el tope se registra igual, sin paga, y la semana siguiente paga de nuevo", () => {
  const s = fresh();
  const dias = ["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28"];
  const ids = INGLES_ITEMS.filter((m) => m.kind === "rutina").map((m) => m.id);
  let sec = 0;
  for (const d of dias) for (const id of ids) hecho(s, id, d, sec++);
  const antes = inglesRewards(saved(s));
  /* Domingo de la misma semana: la rutina de 2 días ya venció su
     reloj (último registro el sábado), paga… pero el tope manda. */
  const r = hecho(s, "ingles-01", "2026-11-29", 99);
  assert.equal(r.status, "applied", "la práctica nunca se bloquea");
  assert.deepEqual(inglesRewards(saved(s)), antes, "pasado el tope: 0 XP / ₡0 nuevos");
  const view = inglesView(saved(s), "2026-11-29");
  assert.equal(item(view, "ingles-01").lastDate, "2026-11-29", "quedó registrado");
  assert.equal(view.weekPaid.capReached, true);
  /* Lunes de la semana siguiente: el tope se reinicia. */
  const r2 = hecho(s, "ingles-17", "2026-11-30", 100);
  assert.equal(r2.status, "applied");
  assert.equal(inglesWeekPaid(saved(s), "2026-11-30").xp, 40, "la semana nueva paga de nuevo");
});

test("tope de turno: los hitos quedan fuera del tope (bucket de una sola vez)", () => {
  const s = fresh();
  const dias = ["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28"];
  const ids = INGLES_ITEMS.filter((m) => m.kind === "rutina").map((m) => m.id);
  let sec = 0;
  for (const d of dias) for (const id of ids) hecho(s, id, d, sec++);
  assert.equal(inglesWeekPaid(saved(s), "2026-11-28").xp, TOPE_TURNO_XP);
  const before = inglesRewards(saved(s));
  assert.equal(hecho(s, "ingles-h5", "2026-11-28", 500).status, "applied");
  const after = inglesRewards(saved(s));
  assert.equal(after.xp - before.xp, 100, "el hito paga íntegro aunque el tope de rutinas esté lleno");
  assert.equal(inglesWeekPaid(saved(s), "2026-11-28").xp, TOPE_TURNO_XP, "el hito no consume tope de rutinas");
});

test("turno del día: 3 bloques reales, deterministas y rotativos", () => {
  const s = fresh();
  const view = inglesView(saved(s), date);
  assert.equal(view.turno.blocks.length, 3);
  assert.deepEqual(view.turno.blocks.map((b) => b.slot), ["apertura", "central", "cierre"]);
  for (const b of view.turno.blocks) {
    assert.equal(b.item.kind, "rutina", "cada bloque ES una rutina real, no un sistema paralelo");
    assert.equal(b.item.slot, b.slot === "central" && view.turno.special ? b.item.slot : b.slot);
  }
  const t1 = turnoDelDia(view.items, "2026-11-24");
  const t2 = turnoDelDia(view.items, "2026-11-24");
  assert.deepEqual(t1.blocks.map((b) => b.item.id), t2.blocks.map((b) => b.item.id), "misma fecha, mismo turno");
  const aperturas = new Set();
  for (let d = 24; d <= 30; d++) {
    aperturas.add(turnoDelDia(view.items, `2026-11-${d}`).blocks[0].item.id);
  }
  assert.ok(aperturas.size > 1, "la apertura rota entre días");
  const viernes = turnoDelDia(view.items, "2026-11-27");
  assert.equal(viernes.special, true, "el viernes es turno especial");
  assert.ok(["ingles-06", "ingles-15"].includes(viernes.blocks[1].item.id), "el especial alterna entrevista/dictogloss");
});

test("torre vivo: misión desconocida y forma corrupta se rechazan", () => {
  const s = fresh();
  const bad = applyGameplayMutation(s, catalog, { type: "ingles.complete", missionId: "ingles-99" }, opts());
  assert.notEqual(bad.status, "applied");
  const bundle = saved(s);
  bundle.play = { ingles: { version: 99, log: {}, records: {} } };
  assert.ok(inglesProblems(bundle).length > 0);
  bundle.play = { ingles: { version: 1, log: { "ingles-01": { lastDate: "ayer", times: 1, paidTimes: 1 } }, records: {} } };
  assert.ok(inglesProblems(bundle).length > 0, "fecha inválida en el log se detecta");
});
