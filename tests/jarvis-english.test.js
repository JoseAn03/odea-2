/**
 * jarvis-english.test.js — FASE D del English Center (v0.59.0, diseño
 * §7): el modo inglés del chat de Jarvis (Worker v6), el tema de quiz
 * «Inglés · Fraseología» desde los mazos SRS, y la línea del Center en
 * el briefing. Sin red: la versión del Worker se prueba en su parser
 * puro, el material del quiz es contenido local, y la línea del
 * briefing sale del resumen derivado del save real.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildProgressSummary } from "../src/jarvis-state.js";
import { inglesView } from "../src/ingles-state.js";
import { SRS_CARDS } from "../src/ingles-content.js";
import { STORAGE_KEYS, createMemoryStorage, importBundle, applyGameplayMutation } from "../src/storage.js";
import { JARVIS_ENGLISH_MIN_WORKER, parseWorkerVersion } from "../js/jarvis-client.js";
import { fraseologiaQuizMaterial, jarvisLocalGreeting } from "../js/jarvis-ui.js";

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

/* ------------------------- versión del Worker ------------------------- */

test("fase D: el modo inglés exige Worker v6 y el parser de salud es estricto", () => {
  assert.equal(JARVIS_ENGLISH_MIN_WORKER, 6);
  assert.equal(parseWorkerVersion({ ok: true, service: "odea2-jarvis", v: 6 }), 6);
  assert.equal(parseWorkerVersion({ ok: true, service: "odea2-jarvis", v: 5 }), 5);
  assert.equal(parseWorkerVersion({ v: "6" }), 6);
  assert.equal(parseWorkerVersion({}), null);
  assert.equal(parseWorkerVersion({ v: 0 }), null);
  assert.equal(parseWorkerVersion({ v: -2 }), null);
  assert.equal(parseWorkerVersion({ v: "seis" }), null);
  assert.equal(parseWorkerVersion(null), null);
  assert.equal(parseWorkerVersion([6]), null);
});

/* --------------------------- quiz de fraseología --------------------------- */

test("fase D: el material del quiz de fraseología son 12 tarjetas reales de los 5 mazos", () => {
  const material = fraseologiaQuizMaterial();
  assert.equal(material.length, 12);
  const byTerm = new Map(SRS_CARDS.map((c) => [c.term, c]));
  const decks = new Set();
  for (const item of material) {
    assert.equal(typeof item.title, "string");
    assert.ok(item.title.length > 0);
    const card = byTerm.get(item.title);
    assert.ok(card, `«${item.title}» es una tarjeta SRS real`);
    decks.add(card.deck);
    assert.ok(item.brief.includes(card.meaning), "el brief trae el significado real");
    assert.ok(item.brief.includes(card.example), "el brief trae el ejemplo real");
    assert.ok(item.deliverable.includes(card.pron), "el deliverable trae la pronunciación real");
  }
  assert.equal(decks.size, 5, "el muestreo cruza los 5 mazos, no solo el primero");
});

test("fase D: el tema «Inglés · Fraseología» y el modo inglés están en la interfaz de Jarvis", () => {
  const ui = fs.readFileSync(new URL("../js/jarvis-ui.js", import.meta.url), "utf8");
  assert.ok(ui.includes("Inglés · Fraseología"), "el selector de temas suma la fraseología");
  assert.ok(ui.includes("Talk in English"), "el chat tiene el interruptor del modo inglés");
  assert.ok(ui.includes('mode: "en"'), "el envío del chat lleva el flag del modo");
  assert.ok(ui.includes("Worker v6"), "el aviso honesto nombra el paso del Worker v6");
  const inglesUi = fs.readFileSync(new URL("../js/ingles-ui.js", import.meta.url), "utf8");
  assert.ok(inglesUi.includes("Charla con Jarvis — ya abrió"), "el panel del Center anuncia la Fase D abierta");
  assert.ok(!inglesUi.includes("Próxima fase en este Center"), "ya no queda ninguna fase «en construcción» en el panel");
});

/* --------------------------- línea del briefing --------------------------- */

test("fase D: sin actividad del Center, el resumen trae el turno pendiente y 0 vencidas", () => {
  const s = fresh();
  const summary = buildProgressSummary(saved(s), catalog, date);
  assert.deepEqual(summary.inglesCenter, { turnoDelDiaHecho: false, tarjetasVencidas: 0 });
});

test("fase D: una tarjeta vencida aparece en la línea del Center, leída del save real", () => {
  const s = fresh();
  /* Marcar una tarjeta el 20-nov con «no» la deja vencida para el 24. */
  const marked = mut(s, { type: "ingles.srsMark", cardId: "srs-d01", mark: "no" }, "2026-11-20");
  assert.equal(marked.status, "applied");
  const summary = buildProgressSummary(saved(s), catalog, date);
  assert.equal(summary.inglesCenter.turnoDelDiaHecho, false);
  assert.ok(summary.inglesCenter.tarjetasVencidas >= 1,
    `vencidas reales: ${summary.inglesCenter.tarjetasVencidas}`);
});

test("fase D: con el turno del día completo y nada vencido, la línea no viaja (no naggea)", () => {
  const s = fresh();
  const view = inglesView(saved(s), date);
  assert.equal(view.turno.blocks.length, 3);
  view.turno.blocks.forEach((block, i) => {
    const done = mut(s, { type: "ingles.complete", missionId: block.item.id }, date, i);
    assert.equal(done.status, "applied", `bloque ${block.item.id}`);
  });
  const summary = buildProgressSummary(saved(s), catalog, date);
  assert.equal(summary.inglesCenter, null);
});

test("fase D: armar el resumen no toca el save (paridad byte a byte)", () => {
  const s = fresh();
  const before = s.getItem(STORAGE_KEYS.bundle);
  buildProgressSummary(saved(s), catalog, date);
  assert.equal(s.getItem(STORAGE_KEYS.bundle), before);
});

test("fase D: el saludo local dice la línea del Center tal cual viene en el resumen", () => {
  const conDatos = jarvisLocalGreeting({
    nivel: 5,
    inglesCenter: { turnoDelDiaHecho: false, tarjetasVencidas: 6 }
  });
  assert.ok(conDatos.includes("English Center"));
  assert.ok(conDatos.includes("te falta el turno del día del English Center"));
  assert.ok(conDatos.includes("6 tarjetas de fraseología por repasar"));
  const hecho = jarvisLocalGreeting({
    nivel: 5,
    inglesCenter: { turnoDelDiaHecho: true, tarjetasVencidas: 0 }
  });
  assert.ok(hecho.includes("el turno del día del English Center ya está hecho"));
  assert.ok(!hecho.includes("por repasar"));
  const sinLinea = jarvisLocalGreeting({ nivel: 5, inglesCenter: null });
  assert.ok(!sinLinea.includes("English Center"), "sin línea en el resumen, el saludo no la inventa");
});
