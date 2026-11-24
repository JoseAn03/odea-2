import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  SRS_DECKS, SRS_CARDS, HVPT_CONTRASTS, LAB_PHRASES, KEYS_PHRASE_IDS
} from "../src/ingles-content.js";
import {
  inglesView, inglesRewards, inglesProblems, inglesWeekPaid, srsSession
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
const mut = (s, m, d = date, second = 0) => applyGameplayMutation(s, catalog, m, opts(d, second));
const mark = (s, cardId, m, d = date, sec = 0) => mut(s, { type: "ingles.srsMark", cardId, mark: m }, d, sec);
const derived = (s) => derive(sourcesFromMigrated(saved(s), catalog), catalog, "2026-11-10");
const srsEntry = (s, id) => saved(s).play.ingles.srs[id];

/* ------------------------------ Contenido ------------------------------ */

test("fase B contenido: 130 tarjetas SRS en 5 decks, completas y únicas", () => {
  assert.equal(SRS_CARDS.length, 130);
  assert.equal(new Set(SRS_CARDS.map((c) => c.id)).size, 130, "ids únicos");
  const counts = {};
  for (const c of SRS_CARDS) {
    counts[c.deck] = (counts[c.deck] || 0) + 1;
    assert.ok(c.term && c.meaning && c.example, `${c.id}: tarjeta completa`);
    assert.ok(["recon", "prod"].includes(c.type), `${c.id}: tipo válido`);
    assert.ok(SRS_DECKS.some((d) => d.id === c.deck), `${c.id}: deck válido`);
  }
  assert.deepEqual(counts, { datos: 40, entrevista: 25, aeropuerto: 30, reuniones: 20, verbos: 15 });
  assert.ok(SRS_CARDS.some((c) => c.type === "prod"), "hay tarjetas de producción");
});

test("fase B contenido: 8 contrastes HVPT con pares y frases; 14 frases de laboratorio", () => {
  assert.equal(HVPT_CONTRASTS.length, 8);
  let pairs = 0;
  for (const c of HVPT_CONTRASTS) {
    assert.ok(c.pairs.length >= 10, `${c.id}: al menos 10 pares`);
    pairs += c.pairs.length;
    for (const p of c.pairs) assert.ok(p.a && p.b && p.sa && p.sb, `${c.id}: par completo`);
  }
  assert.equal(pairs, 118);
  assert.equal(LAB_PHRASES.length, 14);
  for (const p of LAB_PHRASES) {
    assert.ok(p.text && p.marked && p.checks.length >= 2, `${p.id}: frase con chequeos`);
  }
  assert.equal(KEYS_PHRASE_IDS.length, 5);
  for (const id of KEYS_PHRASE_IDS) assert.ok(LAB_PHRASES.some((p) => p.id === id));
});

/* --------------------------------- SRS --------------------------------- */

test("srs: la primera marca crea la entrada y sube de caja con su intervalo", () => {
  const s = fresh();
  assert.equal(mark(s, "srs-d01", "se").status, "applied");
  const e = srsEntry(s, "srs-d01");
  assert.equal(e.box, 2);
  assert.equal(e.due, "2026-11-26", "caja 2 = 2 días");
  assert.equal(e.seen, 1);
  assert.equal(e.graduated, false);
  assert.deepEqual(inglesProblems(saved(s)), []);
});

test("srs: fallar vuelve a la caja 1 y dudar mantiene la caja", () => {
  const s = fresh();
  mark(s, "srs-d01", "se", date, 0);
  mark(s, "srs-d01", "se", date, 1);
  assert.equal(srsEntry(s, "srs-d01").box, 3);
  mark(s, "srs-d01", "dude", date, 2);
  assert.equal(srsEntry(s, "srs-d01").box, 3, "dudar no baja ni sube");
  assert.equal(srsEntry(s, "srs-d01").due, "2026-11-28", "caja 3 = 4 días");
  mark(s, "srs-d01", "no", date, 3);
  assert.equal(srsEntry(s, "srs-d01").box, 1);
  assert.equal(srsEntry(s, "srs-d01").due, "2026-11-25", "caja 1 = diaria");
});

test("srs: graduarse exige 3 aciertos en caja 5 en días distintos (Karpicke & Roediger)", () => {
  const s = fresh();
  /* Llevar la tarjeta a la caja 5: 4 aciertos. */
  for (let i = 0; i < 4; i++) mark(s, "srs-v01", "se", date, i);
  assert.equal(srsEntry(s, "srs-v01").box, 5);
  /* Dos aciertos el MISMO día en caja 5 cuentan uno solo. */
  mark(s, "srs-v01", "se", "2026-12-09", 10);
  mark(s, "srs-v01", "se", "2026-12-09", 11);
  assert.equal(srsEntry(s, "srs-v01").gradStreak, 1, "el mismo día no suma dos veces");
  assert.equal(srsEntry(s, "srs-v01").graduated, false);
  mark(s, "srs-v01", "se", "2026-12-24", 12);
  assert.equal(srsEntry(s, "srs-v01").gradStreak, 2);
  assert.equal(srsEntry(s, "srs-v01").graduated, false, "con 2 no se gradúa");
  mark(s, "srs-v01", "se", "2027-01-08", 13);
  assert.equal(srsEntry(s, "srs-v01").graduated, true, "el tercer acierto espaciado gradúa");
  assert.equal(srsEntry(s, "srs-v01").due, "2027-02-07", "la graduada reaparece en chequeo mensual (30 días)");
  const view = inglesView(saved(s), "2027-01-08");
  assert.equal(view.faseB.srs.graduated, 1);
  assert.deepEqual(inglesProblems(saved(s)), []);
});

test("srs: la sesión trae vencidas primero entrelazadas y hasta 5 nuevas", () => {
  const s = fresh();
  const first = srsSession(saved(s), date);
  assert.equal(first.length, 5, "sin vencidas: 5 nuevas");
  assert.ok(first.every((i) => i.isNew));
  assert.ok(new Set(first.map((i) => i.card.deck)).size >= 4, "las nuevas vienen entrelazadas por deck");
  /* Marcar dos como falladas hoy → vencen mañana; pasado mañana son la sesión. */
  mark(s, "srs-d01", "no", date, 0);
  mark(s, "srs-a01", "no", date, 1);
  const second = srsSession(saved(s), "2026-11-26");
  const dueIds = second.filter((i) => !i.isNew).map((i) => i.card.id);
  assert.deepEqual(new Set(dueIds), new Set(["srs-d01", "srs-a01"]), "las vencidas abren la sesión");
});

test("srsAdd: la palabra robada entra con su toque y se valida", () => {
  const s = fresh();
  const r = mut(s, { type: "ingles.srsAdd", term: "  cutoff  ", meaning: "hora de corte", example: "The cutoff is at noon." });
  assert.equal(r.status, "applied");
  const bundle = saved(s);
  assert.equal(bundle.play.ingles.custom["custom-1"].term, "cutoff", "se guarda recortada");
  assert.equal(bundle.play.ingles.srs["custom-1"].box, 1);
  const session = srsSession(bundle, date);
  assert.ok(session.some((i) => i.card.id === "custom-1"), "la robada entra en sesión");
  const bad = mut(s, { type: "ingles.srsAdd", term: "", meaning: "x", example: "" }, date, 5);
  assert.notEqual(bad.status, "applied", "sin término no entra");
  assert.deepEqual(inglesProblems(saved(s)), []);
});

/* --------------------------------- HVPT --------------------------------- */

test("hvpt: el reducer calcula la respuesta correcta y lleva la ventana", () => {
  const s = fresh();
  const ok = mut(s, { type: "ingles.hvptAttempt", contrastId: "hvpt-ii", pairIdx: 0, played: "a", picked: "a" });
  assert.equal(ok.status, "applied");
  mut(s, { type: "ingles.hvptAttempt", contrastId: "hvpt-ii", pairIdx: 1, played: "b", picked: "a" }, date, 1);
  const e = saved(s).play.ingles.hvpt["hvpt-ii"];
  assert.equal(e.attempts, 2);
  assert.equal(e.correct, 1, "el segundo intento fue error: lo sabe el reducer, no la UI");
  assert.deepEqual(e.window, [1, 0]);
  const bad = mut(s, { type: "ingles.hvptAttempt", contrastId: "hvpt-xx", pairIdx: 0, played: "a", picked: "a" }, date, 2);
  assert.notEqual(bad.status, "applied");
  assert.deepEqual(inglesProblems(saved(s)), []);
});

test("hvpt: la escalera sube con ≥85% en 20 y baja con <60%", () => {
  const s = fresh();
  for (let i = 0; i < 20; i++) {
    mut(s, { type: "ingles.hvptAttempt", contrastId: "hvpt-bv", pairIdx: i % 12, played: "a", picked: i < 18 ? "a" : "b" }, date, i);
  }
  let e = saved(s).play.ingles.hvpt["hvpt-bv"];
  assert.equal(e.level, 2, "18/20 = 90% → sube a nivel 2");
  assert.deepEqual(e.window, [], "la ventana se reinicia al evaluar");
  for (let i = 0; i < 20; i++) {
    mut(s, { type: "ingles.hvptAttempt", contrastId: "hvpt-bv", pairIdx: i % 12, played: "a", picked: i < 5 ? "a" : "b" }, date, 40 + i);
  }
  e = saved(s).play.ingles.hvpt["hvpt-bv"];
  assert.equal(e.level, 1, "5/20 = 25% → baja a nivel 1");
});

/* --------------------------- Voz y prueba del teclado --------------------------- */

test("voz y teclado: las marcas se guardan y se valida la forma", () => {
  const s = fresh();
  assert.equal(mut(s, { type: "ingles.voiceMark", phraseId: "lab-01", mark: "medio" }).status, "applied");
  assert.equal(saved(s).play.ingles.voice["lab-01"].lastSelf, "medio");
  assert.notEqual(mut(s, { type: "ingles.voiceMark", phraseId: "lab-99", mark: "bien" }, date, 1).status, "applied");
  assert.notEqual(mut(s, { type: "ingles.voiceMark", phraseId: "lab-01", mark: "genial" }, date, 2).status, "applied");
  assert.equal(mut(s, { type: "ingles.keysTest", clean: 4, total: 5 }, date, 3).status, "applied");
  assert.notEqual(mut(s, { type: "ingles.keysTest", clean: 6, total: 5 }, date, 4).status, "applied", "limpias no puede pasar el total");
  const view = inglesView(saved(s), date);
  assert.equal(view.faseB.voice.marked, 1);
  assert.equal(view.faseB.keys.last.clean, 4);
  assert.deepEqual(inglesProblems(saved(s)), []);
});

/* --------------------------- Paridad y honestidad --------------------------- */

test("fase B: las herramientas no pagan nada ni tocan el Tope — paridad total", () => {
  const s = fresh();
  const before = derived(s);
  mark(s, "srs-d01", "se");
  mut(s, { type: "ingles.srsAdd", term: "cutoff", meaning: "hora de corte", example: "" }, date, 1);
  mut(s, { type: "ingles.hvptAttempt", contrastId: "hvpt-ii", pairIdx: 0, played: "a", picked: "a" }, date, 2);
  mut(s, { type: "ingles.voiceMark", phraseId: "lab-03", mark: "bien" }, date, 3);
  mut(s, { type: "ingles.keysTest", clean: 5, total: 5 }, date, 4);
  const after = derived(s);
  assert.equal(after.totalXP, before.totalXP, "0 XP nuevo: las herramientas no pagan");
  assert.equal(after.coins.balance, before.coins.balance, "₡0 nuevo");
  assert.deepEqual(inglesRewards(saved(s)), { xp: 0, coins: 0 });
  assert.deepEqual(inglesWeekPaid(saved(s), date), { xp: 0, coins: 0, week: inglesWeekPaid(saved(s), date).week });
  assert.deepEqual(saved(s).play.ingles.records, {}, "sin records: nada pasó por el oráculo");
});

test("fase B: un save de la Fase A (solo log/records) valida y deriva igual", () => {
  const s = fresh();
  mut(s, { type: "ingles.complete", missionId: "ingles-01" });
  const before = derived(s);
  const bundle = saved(s);
  assert.equal(bundle.play.ingles.srs, undefined, "la Fase A no conocía estas claves");
  assert.deepEqual(inglesProblems(bundle), [], "sin claves nuevas no hay problemas de forma");
  mark(s, "srs-d01", "se", date, 9);
  const after = derived(s);
  assert.equal(after.totalXP, before.totalXP, "usar el SRS no mueve los totales de la Fase A");
  assert.deepEqual(inglesProblems(saved(s)), []);
});

test("fase B: la forma corrupta de las claves nuevas se detecta", () => {
  const s = fresh();
  mark(s, "srs-d01", "se");
  const bundle = saved(s);
  bundle.play.ingles.srs["srs-d01"].box = 9;
  assert.ok(inglesProblems(bundle).length > 0, "caja fuera de rango");
  bundle.play.ingles.srs["srs-d01"].box = 2;
  bundle.play.ingles.hvpt = { "hvpt-ii": { level: 9, attempts: 0, correct: 0, window: [], lastAt: null } };
  assert.ok(inglesProblems(bundle).length > 0, "nivel HVPT fuera de rango");
  bundle.play.ingles.hvpt = {};
  bundle.play.ingles.keys = [{ date, clean: 7, total: 5 }];
  assert.ok(inglesProblems(bundle).length > 0, "teclado imposible");
});
