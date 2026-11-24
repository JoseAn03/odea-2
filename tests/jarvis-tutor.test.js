/**
 * jarvis-tutor.test.js — el Tutor de Estudio de Jarvis (v0.51.0),
 * diseño maestro §3/§6.5. Tres frentes:
 *
 *  1. El índice local (src/tutor-index.js): batería de preguntas
 *     reales de sus módulos → la lección esperada arriba; preguntas
 *     ajenas → CERO extractos (caen a extra etiquetada, jamás a una
 *     lección inventada). Presupuesto de extractos: K=4, ≤700 c/u.
 *  2. El estado (src/jarvis-state.js): el contador «tutor» cuenta con
 *     tope 15/día, es aditivo sin migración y su forma se valida.
 *  3. El cliente (js/jarvis-client.js): la cita se RE-VERIFICA contra
 *     los extractos enviados — una cita inventada se degrada a extra.
 *  4. LA PARIDAD (la prueba reina): usar el Tutor no mueve XP, ni
 *     componentes, ni monedas — byte a byte en lo derivado.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { CAMPAIGNS } from "../src/campaigns.js";
import { buildTutorIndex, searchTutor, threadReusable } from "../src/tutor-index.js";
import {
  JARVIS_TUTOR_DAILY_LIMIT,
  jarvisProblems,
  jarvisRewards,
  jarvisView,
} from "../src/jarvis-state.js";
import { validateTutorAnswer } from "../js/jarvis-client.js";
import { STORAGE_KEYS, createMemoryStorage, importBundle, applyGameplayMutation } from "../src/storage.js";
import { derive, sourcesFromMigrated } from "../src/derive.js";

const catalog = JSON.parse(fs.readFileSync(new URL("../data/xp-catalog.json", import.meta.url)));
const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/odea-progreso-sintetico.json", import.meta.url)));
const date = "2026-11-17";

const index = buildTutorIndex(CAMPAIGNS, catalog.daily);

/* ------------------------------ 1. el índice ------------------------------ */

test("tutor-index: el corpus son los 568 documentos reales (400 campañas + 168 diarias)", () => {
  /* 400 de campañas desde v0.57.0: DESPEGUE (La Torre de Control)
     sumó sus 58 misiones al material real del Tutor. */
  assert.equal(index.total, 568);
});

test("tutor-index: batería de preguntas reales — la lección esperada es el top-1", () => {
  /* [pregunta, ref esperado del top-1] — calibrado contra el corpus
     REAL del árbol: el JOIN de José vive en El Brete (brete-15), no en
     Academia; citar otra cosa sería inventar la lección. */
  const battery = [
    ["¿qué es un JOIN en SQL?", "brete/brete-sql/brete-15"],
    ["¿cómo funcionan las funciones de ventana en SQL?", "brete/brete-sql/brete-18"],
    ["¿qué tengo que hacer en el curso 3 de Google?", "academia/academia-google/academia-08"],
    ["¿cada cuánto hay que lavar el Accent?", "garaje/garaje-accent-rutina/garaje-01"],
    ["¿qué es DAX y para qué sirve en Power BI?", "academia/academia-microsoft/academia-14"],
    ["¿cómo se juega con Ian a los detectives de preguntas?", "mundoian/ian-curiosidad/mundoian-07"],
    ["¿qué es el overbooking y cómo se decide en una rentadora?", "eventos/eventos-motores/eventos-09"],
    ["¿cómo preparo el mock final de la entrevista?", "diarias/35/35B"],
    ["¿cómo limpio datos duplicados y nulos en un pipeline?", "eventos/eventos-pipeline/eventos-05"],
    ["¿qué es machine learning y en qué se diferencia de la estadística?", "academia/academia-google/academia-11"],
    ["¿cómo se cambia el aceite del Accent y cada cuánto toca?", "garaje/garaje-accent-rutina/garaje-07"],
    ["¿qué es una tabla dinámica en Excel?", "brete/brete-hojas/brete-11"],
    ["¿cómo subo un proyecto a GitHub con un buen README?", "academia/academia-vitrina/academia-26"],
    ["¿cómo se calcula un promedio ponderado en Excel?", "brete/brete-estadistica/brete-19"],
  ];
  for (const [question, expectedRef] of battery) {
    const results = searchTutor(index, question);
    assert.ok(results.length >= 1, `sin extractos para: ${question}`);
    assert.equal(results[0].ref, expectedRef, `top-1 inesperado para: ${question}`);
  }
});

test("tutor-index: batería por campaña — el top-1 cae en el módulo correcto", () => {
  const battery = [
    ["¿qué es un agente de IA y cómo se construye?", "zonaia"],
    ["¿cómo practico mi pitch para la entrevista?", "entrevista"],
    ["¿cómo edito un video para mi canal de clips?", "gamer"],
    ["¿qué es el pensamiento crítico?", "sabiduria"],
    ["¿qué es un prompt y cómo se escribe uno bueno para un agente?", "zonaia"],
    /* Desde v0.57.0 la respuesta de la debilidad vive en La Torre
       (misión «La debilidad, sin miedo» + tarjeta bank-09 del banco):
       el top-1 correcto ahora es ingles, no entrevista. */
    ["¿cómo respondo si me preguntan mi mayor debilidad en el screening?", "ingles"],
    ["¿qué es la inteligencia emocional y cómo se practica?", "sabiduria"],
    /* Recalibrado en v0.57.0: con el corpus crecido (568), el IDF se
       rebalanceó y la redacción vieja («grabo mi pantalla con OBS»)
       empataba con el título de brete-12 («Reporte de una pantalla»);
       la pregunta de captura que cae en gamer es esta. «OBS» ni
       siquiera está en el corpus: esa redacción da cero extractos. */
    ["¿cómo capturo mi gameplay para hacer clips?", "gamer"],
    ["¿qué es un ETL y para qué sirve?", "zonaia"],
  ];
  for (const [question, expectedCampaign] of battery) {
    const results = searchTutor(index, question);
    assert.ok(results.length >= 1, `sin extractos para: ${question}`);
    assert.equal(results[0].campaignId, expectedCampaign, `módulo inesperado para: ${question}`);
  }
});

test("tutor-index: preguntas ajenas a su material devuelven CERO extractos", () => {
  const alien = [
    "¿qué es el ROAS?",
    "¿cómo está el clima hoy en Heredia?",
    "¿cómo se hace una lasaña de carne?",
    "¿quién ganó el mundial de fútbol?",
    "¿cuánto cuesta el iPhone nuevo?",
    "¿qué es la fotosíntesis?",
    "¿qué hora es en Tokio?",
  ];
  for (const question of alien) {
    assert.deepEqual(searchTutor(index, question), [], `la pregunta ajena fundamentó: ${question}`);
  }
});

test("tutor-index: presupuesto de extractos — K=4, ≤700 caracteres cada uno, ≤2.800 en total", () => {
  for (const question of ["¿qué es un JOIN en SQL?", "¿cómo se construye un agente de IA?", "entrevista"]) {
    const results = searchTutor(index, question);
    assert.ok(results.length <= 4);
    const total = results.reduce((sum, r) => sum + r.extract.length, 0);
    assert.ok(results.every((r) => r.extract.length <= 700));
    assert.ok(total <= 2800, `extractos de ${total} caracteres para: ${question}`);
    assert.ok(results.every((r) => typeof r.label === "string" && r.label.includes("·")));
  }
});

test("tutor-index: el hilo se reusa en seguimientos y NO ante un tema nuevo", () => {
  const joinThread = ["brete/brete-sql/brete-15", "brete/brete-sql/brete-18"];
  assert.equal(threadReusable(index, "¿y un ejemplo con mis datos?", joinThread), true);
  assert.equal(threadReusable(index, "¿y el LEFT JOIN cómo cambia eso?", joinThread), true);
  assert.equal(threadReusable(index, "¿qué es el ROAS?", joinThread), false);
  assert.equal(threadReusable(index, "¿cómo se hace una lasaña de carne?", joinThread), false);
  assert.equal(threadReusable(index, "¿qué es un JOIN?", []), false);
});

/* ------------------------------ 2. el estado ------------------------------ */

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
const tutorUsage = (s, second = 0) =>
  applyGameplayMutation(s, catalog, { type: "jarvis.usage", kind: "tutor" }, opts(date, second));

test("tutor-state: el contador cuenta hasta 15 y el 16.º se rechaza sin tocar nada", () => {
  const s = fresh();
  for (let i = 0; i < JARVIS_TUTOR_DAILY_LIMIT; i += 1) {
    assert.equal(tutorUsage(s, i).status, "applied", `la pregunta ${i + 1} debió contar`);
  }
  const view = jarvisView(saved(s), date);
  assert.equal(view.tutorHoy, 15);
  assert.equal(view.tutorRestantes, 0);
  const rejected = tutorUsage(s, 99);
  assert.equal(rejected.status, "rejected");
  assert.equal(jarvisView(saved(s), date).tutorHoy, 15);
});

test("tutor-state: un save sin la clave tutor lee 0 y no da problemas (aditivo, sin migración)", () => {
  const s = fresh();
  /* El fixture no conoce la clave: la vista deriva 0 y el validador
     no se queja — PLAY_VERSION no subió por el Tutor. */
  const view = jarvisView(saved(s), date);
  assert.equal(view.tutorHoy, 0);
  assert.equal(view.tutorRestantes, JARVIS_TUTOR_DAILY_LIMIT);
  assert.deepEqual(jarvisProblems(saved(s)), []);
});

test("tutor-state: una forma mala del contador tutor SÍ es problema", () => {
  const bundle = structuredClone(fixture);
  bundle.play = bundle.play || {};
  bundle.play.jarvis = {
    quizXpByDate: {},
    usage: { [date]: { quiz: 0, chat: 0, feedback: 0, calls: 0, tutor: -1 } },
    briefing: null,
  };
  const problems = jarvisProblems(bundle);
  assert.ok(problems.some((p) => p.includes("tutor")), `debió flaggear tutor: ${problems.join(" | ")}`);
});

/* ------------------------------ 3. el cliente ----------------------------- */

test("tutor-client: una cita válida entre los extractos enviados se conserva", () => {
  const answer = validateTutorAnswer(
    { type: "tutor", text: "Un JOIN combina filas de dos tablas…", grounded: true, ref: "brete/brete-sql/brete-15" },
    ["brete/brete-sql/brete-15", "brete/brete-sql/brete-18"]
  );
  assert.deepEqual(answer, {
    text: "Un JOIN combina filas de dos tablas…", grounded: true, ref: "brete/brete-sql/brete-15",
  });
});

test("tutor-client: una cita INVENTADA se degrada a extra (la muralla del cliente)", () => {
  const answer = validateTutorAnswer(
    { type: "tutor", text: "Según tu Academia…", grounded: true, ref: "academia/academia-google/academia-99" },
    ["brete/brete-sql/brete-15"]
  );
  assert.equal(answer.grounded, false);
  assert.equal(answer.ref, null);
  assert.equal(answer.text, "Según tu Academia…");
});

test("tutor-client: sobres mal formados se descartan enteros", () => {
  assert.equal(validateTutorAnswer(null, []), null);
  assert.equal(validateTutorAnswer({ type: "chat", text: "hola", grounded: false, ref: null }, []), null);
  assert.equal(validateTutorAnswer({ type: "tutor", text: "  ", grounded: false, ref: null }, []), null);
  assert.equal(validateTutorAnswer({ type: "tutor", text: "ok", grounded: "sí", ref: null }, []), null);
  const extra = validateTutorAnswer({ type: "tutor", text: "El ROAS es…", grounded: false, ref: "x/y/z" }, []);
  assert.deepEqual(extra, { text: "El ROAS es…", grounded: false, ref: null });
});

/* ------------------------------ 4. la paridad ----------------------------- */

test("tutor-paridad: 15 preguntas del Tutor no mueven XP, componentes ni monedas", () => {
  const s = fresh();
  const derived = () => derive(sourcesFromMigrated(saved(s), catalog), catalog, "2026-11-10");
  const before = derived();
  const rewardsBefore = jarvisRewards(saved(s));
  for (let i = 0; i < JARVIS_TUTOR_DAILY_LIMIT; i += 1) tutorUsage(s, i);
  const after = derived();
  assert.equal(after.totalXP, before.totalXP);
  assert.deepEqual(after.xpBreakdown, before.xpBreakdown);
  assert.deepEqual(after.coins, before.coins);
  assert.deepEqual(jarvisRewards(saved(s)), rewardsBefore);
});
