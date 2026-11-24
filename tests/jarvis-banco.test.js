/**
 * jarvis-banco.test.js — el Banco de preguntas de Jarvis (v0.52.0),
 * diseño maestro §3.4/§5.3/§6.3/§6.5. Cuatro frentes:
 *
 *  1. El estado (src/jarvis-state.js): bankSave/bankRemove con forma
 *     estricta, tope 100 sin FIFO silencioso, duplicados y estampas
 *     de fecha/hora del contexto. Clave aditiva: sin migración y sin
 *     subir PLAY_VERSION.
 *  2. jarvisProblems: cada forma mala del banco se detecta ANTES de
 *     guardar (la escritura se invalida entera).
 *  3. La vista y el resumen: conteo, grupos por módulo y la línea
 *     del briefing «sin repasar» solo con ≥ 3 guardadas.
 *  4. LA PARIDAD (la prueba reina): guardar, borrar y repasar no
 *     mueven XP, ni componentes, ni monedas — y fuera de
 *     play.jarvis.bank el guardado queda byte a byte igual.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  JARVIS_BANK_A_MAX,
  JARVIS_BANK_CAP,
  JARVIS_BANK_Q_MAX,
  buildProgressSummary,
  jarvisBankGroups,
  jarvisProblems,
  jarvisRewards,
  jarvisStateOf,
  jarvisView,
} from "../src/jarvis-state.js";
import { STORAGE_KEYS, createMemoryStorage, importBundle, applyGameplayMutation } from "../src/storage.js";
import { derive, sourcesFromMigrated } from "../src/derive.js";

const catalog = JSON.parse(fs.readFileSync(new URL("../data/xp-catalog.json", import.meta.url)));
const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/odea-progreso-sintetico.json", import.meta.url)));
const date = "2026-11-17";

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
  date: d, at: new Date(Date.UTC(2026, 10, 17, 12, 0, second)).toISOString()
});

let seq = 0;
function entry(patch = {}) {
  seq += 1;
  return {
    id: `jb-test-${seq}`,
    q: "¿Qué es un JOIN en SQL?",
    a: "Un JOIN combina filas de dos tablas por una clave común.",
    kind: "lesson",
    ref: "brete/brete-sql/brete-15",
    module: "El Brete",
    ...patch,
  };
}
const save = (s, e, second = 0) =>
  applyGameplayMutation(s, catalog, { type: "jarvis.bankSave", entry: e }, opts(date, second));
const remove = (s, bankId, second = 0) =>
  applyGameplayMutation(s, catalog, { type: "jarvis.bankRemove", bankId }, opts(date, second));

/* ------------------------------ 1. el estado ------------------------------ */

test("banco-state: guardar aplica y la entrada queda con la forma del diseño y las estampas del contexto", () => {
  const s = fresh();
  const e = entry();
  const result = save(s, e, 5);
  assert.equal(result.status, "applied");
  const bank = jarvisStateOf(saved(s)).bank;
  assert.equal(bank.length, 1);
  assert.deepEqual(bank[0], {
    id: e.id, q: e.q, a: e.a, kind: "lesson", ref: e.ref, module: "El Brete",
    date, at: Date.UTC(2026, 10, 17, 12, 0, 5),
  });
});

test("banco-state: lo más reciente primero y las extras guardan ref/module en null", () => {
  const s = fresh();
  save(s, entry(), 1);
  const extra = entry({ kind: "extra", ref: null, module: null, q: "¿Qué es el ROAS?" });
  save(s, extra, 2);
  const bank = jarvisStateOf(saved(s)).bank;
  assert.equal(bank.length, 2);
  assert.equal(bank[0].id, extra.id);
  assert.equal(bank[0].kind, "extra");
  assert.equal(bank[0].ref, null);
  assert.equal(bank[0].module, null);
});

test("banco-state: un id duplicado sale DUPLICATE y el banco no cambia", () => {
  const s = fresh();
  const e = entry();
  assert.equal(save(s, e).status, "applied");
  const before = JSON.stringify(saved(s).play.jarvis.bank);
  const again = save(s, entry({ id: e.id, q: "Otra pregunta con el mismo id" }), 9);
  assert.equal(again.status, "duplicate");
  assert.equal(JSON.stringify(saved(s).play.jarvis.bank), before);
});

test("banco-state: la forma mala se rechaza entera (BAD_BANK_ENTRY) y nada se guarda", () => {
  const s = fresh();
  const bad = [
    entry({ q: "" }),
    entry({ q: "x".repeat(JARVIS_BANK_Q_MAX + 1) }),
    entry({ a: "" }),
    entry({ a: "x".repeat(JARVIS_BANK_A_MAX + 1) }),
    entry({ kind: "otra" }),
    entry({ ref: "x".repeat(121) }),
    entry({ module: "x".repeat(41) }),
    entry({ id: "" }),
    entry({ id: "x".repeat(65) }),
    null,
    "no-soy-un-objeto",
  ];
  for (const candidate of bad) {
    const result = save(s, candidate);
    assert.equal(result.status, "rejected", `debió rechazar: ${JSON.stringify(candidate)?.slice(0, 60)}`);
    assert.equal(result.error.code, "BAD_BANK_ENTRY");
  }
  assert.equal(jarvisStateOf(saved(s)).bank.length, 0);
});

test("banco-state: los largos exactos del tope SÍ guardan (300 y 1.200)", () => {
  const s = fresh();
  const e = entry({ q: "q".repeat(JARVIS_BANK_Q_MAX), a: "a".repeat(JARVIS_BANK_A_MAX) });
  assert.equal(save(s, e).status, "applied");
  assert.equal(jarvisStateOf(saved(s)).bank[0].a.length, JARVIS_BANK_A_MAX);
});

test("banco-state: al llegar a 100, guardar exige borrar (JARVIS_BANK_CAP, sin FIFO silencioso)", () => {
  const s = fresh();
  const bundle = saved(s);
  bundle.play = { jarvis: { quizXpByDate: {}, usage: {}, briefing: null } };
  bundle.play.jarvis.bank = Array.from({ length: JARVIS_BANK_CAP }, (_, i) => ({
    id: `jb-seed-${i}`,
    q: `Pregunta semilla ${i}`,
    a: `Respuesta semilla ${i}`,
    kind: i % 2 ? "extra" : "lesson",
    ref: i % 2 ? null : "brete/brete-sql/brete-15",
    module: i % 2 ? null : "El Brete",
    date,
    at: i,
  }));
  s.setItem(STORAGE_KEYS.bundle, JSON.stringify(bundle));
  const result = save(s, entry(), 3);
  assert.equal(result.status, "rejected");
  assert.equal(result.error.code, "JARVIS_BANK_CAP");
  /* Ni se guardó la nueva ni se borró la más vieja: el banco es suyo. */
  const bank = jarvisStateOf(saved(s)).bank;
  assert.equal(bank.length, JARVIS_BANK_CAP);
  assert.equal(bank[bank.length - 1].id, `jb-seed-${JARVIS_BANK_CAP - 1}`);
});

test("banco-state: borrar quita la entrada; borrar un id inexistente es DUPLICATE sin cambios", () => {
  const s = fresh();
  const e1 = entry();
  const e2 = entry({ q: "¿Y el LEFT JOIN?" });
  save(s, e1, 1);
  save(s, e2, 2);
  assert.equal(remove(s, e1.id).status, "applied");
  const bank = jarvisStateOf(saved(s)).bank;
  assert.equal(bank.length, 1);
  assert.equal(bank[0].id, e2.id);
  const again = remove(s, e1.id);
  assert.equal(again.status, "duplicate");
  assert.equal(jarvisStateOf(saved(s)).bank.length, 1);
});

test("banco-state: es aditivo — un save sin la clave lee banco vacío, sin problemas ni migración", () => {
  const s = fresh();
  const bundle = saved(s);
  assert.equal(bundle.play?.jarvis?.bank, undefined);
  assert.deepEqual(jarvisStateOf(bundle).bank, []);
  assert.equal(jarvisView(bundle, date).bankCount, 0);
  assert.deepEqual(jarvisProblems(bundle), []);
});

test("banco-state: otras mutaciones de Jarvis preservan el banco intacto", () => {
  const s = fresh();
  save(s, entry(), 1);
  const before = JSON.stringify(saved(s).play.jarvis.bank);
  const usage = applyGameplayMutation(s, catalog, { type: "jarvis.usage", kind: "chat" }, opts(date, 2));
  assert.equal(usage.status, "applied");
  assert.equal(JSON.stringify(saved(s).play.jarvis.bank), before);
});

/* --------------------------- 2. jarvisProblems ---------------------------- */

test("banco-problems: cada forma mala del banco se detecta antes de guardar", () => {
  const base = entry();
  const cases = [
    ["bank no es lista", { bank: {} }],
    ["101 entradas", {
      bank: Array.from({ length: JARVIS_BANK_CAP + 1 }, (_, i) => ({
        ...base, id: `jb-x-${i}`, date, at: i,
      })),
    }],
    ["id duplicado", { bank: [{ ...base, date, at: 1 }, { ...base, date, at: 2 }] }],
    ["q vacía", { bank: [{ ...base, q: "", date, at: 1 }] }],
    ["q larga", { bank: [{ ...base, q: "x".repeat(301), date, at: 1 }] }],
    ["a larga", { bank: [{ ...base, a: "x".repeat(1201), date, at: 1 }] }],
    ["kind inválido", { bank: [{ ...base, kind: "quiz", date, at: 1 }] }],
    ["ref larga", { bank: [{ ...base, ref: "x".repeat(121), date, at: 1 }] }],
    ["module largo", { bank: [{ ...base, module: "x".repeat(41), date, at: 1 }] }],
    ["date inválida", { bank: [{ ...base, date: "2026-13-40", at: 1 }] }],
    ["at no numérico", { bank: [{ ...base, date, at: "ayer" }] }],
    ["entrada no objeto", { bank: ["texto"] }],
  ];
  for (const [label, patch] of cases) {
    const bundle = structuredClone(fixture);
    bundle.play = { jarvis: { quizXpByDate: {}, usage: {}, briefing: null, ...patch } };
    const problems = jarvisProblems(bundle);
    assert.ok(problems.some((p) => p.includes("bank")), `${label}: debió flaggear bank — ${problems.join(" | ")}`);
  }
  /* Y la forma buena completa no da problemas. */
  const bundle = structuredClone(fixture);
  bundle.play = { jarvis: { quizXpByDate: {}, usage: {}, briefing: null, bank: [{ ...base, date, at: 1 }] } };
  assert.deepEqual(jarvisProblems(bundle), []);
});

/* ------------------------- 3. la vista y el resumen ------------------------ */

test("banco-view: conteo, entradas y grupos por módulo (las extras en su grupo null)", () => {
  const s = fresh();
  save(s, entry(), 1);
  save(s, entry({ kind: "extra", ref: null, module: null, q: "¿Qué es el ROAS?" }), 2);
  save(s, entry({ module: "La Academia", ref: "academia/academia-google/academia-08", q: "¿El curso 3 de Google?" }), 3);
  const view = jarvisView(saved(s), date);
  assert.equal(view.bankCount, 3);
  assert.equal(view.bankEntries.length, 3);
  const groups = jarvisBankGroups(view.bankEntries);
  assert.deepEqual(groups.map((g) => g.module), ["La Academia", null, "El Brete"]);
  assert.equal(groups[1].entries[0].kind, "extra");
  assert.deepEqual(view.bankGroups, groups);
});

test("banco-resumen: la línea «sin repasar» solo viaja con ≥ 3 guardadas", () => {
  const s = fresh();
  save(s, entry(), 1);
  save(s, entry(), 2);
  assert.equal(buildProgressSummary(saved(s), catalog, date).bancoSinRepasar, null);
  save(s, entry(), 3);
  assert.equal(buildProgressSummary(saved(s), catalog, date).bancoSinRepasar, 3);
});

/* ------------------------------ 4. la paridad ----------------------------- */

test("banco-paridad: guardar y borrar no mueven XP, componentes ni monedas", () => {
  const s = fresh();
  const derived = () => derive(sourcesFromMigrated(saved(s), catalog), catalog, "2026-11-10");
  const before = derived();
  const rewardsBefore = jarvisRewards(saved(s));
  for (let i = 0; i < 5; i += 1) save(s, entry(), i + 1);
  remove(s, jarvisStateOf(saved(s)).bank[0].id, 9);
  const after = derived();
  assert.equal(after.totalXP, before.totalXP);
  assert.deepEqual(after.xpBreakdown, before.xpBreakdown);
  assert.deepEqual(after.coins, before.coins);
  assert.deepEqual(jarvisRewards(saved(s)), rewardsBefore);
});

test("banco-paridad: fuera de play.jarvis.bank, el guardado queda idéntico", () => {
  const s = fresh();
  /* Una mutación previa crea la base de play.jarvis (ensureState);
     desde ahí, el banco no puede tocar nada fuera de su clave. */
  applyGameplayMutation(s, catalog, { type: "jarvis.usage", kind: "chat" }, opts(date, 0));
  const before = saved(s);
  save(s, entry(), 1);
  save(s, entry({ kind: "extra", ref: null, module: null }), 2);
  const after = saved(s);
  const jarvisBefore = { ...(before.play.jarvis || {}) };
  const jarvisAfter = { ...after.play.jarvis };
  delete jarvisAfter.bank;
  assert.deepEqual(jarvisAfter, jarvisBefore);
  const restBefore = { ...before, play: { ...before.play, jarvis: jarvisBefore } };
  const restAfter = { ...after, play: { ...after.play, jarvis: jarvisAfter } };
  assert.deepEqual(restAfter, restBefore);
  assert.equal(after.play.jarvis.bank.length, 2);
});
