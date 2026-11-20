import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  JARVIS_QUIZ_XP,
  JARVIS_QUIZ_XP_PER_HIT,
  buildProgressSummary,
  jarvisProblems,
  jarvisRewards,
  jarvisView,
} from "../src/jarvis-state.js";
import { STORAGE_KEYS, createMemoryStorage, importBundle, applyGameplayMutation } from "../src/storage.js";
import { derive, sourcesFromMigrated } from "../src/derive.js";
import { validatePlayState } from "../src/validate.js";

const catalog = JSON.parse(fs.readFileSync(new URL("../data/xp-catalog.json", import.meta.url)));
const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/odea-progreso-sintetico.json", import.meta.url)));
const date = "2026-11-17";
const nextDate = "2026-11-18";

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
const derived = (s) => derive(sourcesFromMigrated(saved(s), catalog), catalog, "2026-11-10");
const quiz = (s, xp, d = date, second = 0) =>
  applyGameplayMutation(s, catalog, { type: "jarvis.quiz", xpAwarded: xp }, opts(d, second));
const usage = (s, kind, d = date, second = 0) =>
  applyGameplayMutation(s, catalog, { type: "jarvis.usage", kind }, opts(d, second));

test("jarvis: sin play.jarvis previo la vista es válida y no hay problemas", () => {
  const s = fresh();
  const view = jarvisView(saved(s), date);
  assert.equal(view.quizXpToday, 0);
  assert.equal(view.quizRestantes, 2);
  assert.equal(view.quizXpDisponible, JARVIS_QUIZ_XP);
  assert.equal(view.chatRestantes, 20);
  assert.equal(view.feedbackRestantes, 5);
  assert.equal(view.briefingHoy, null);
  assert.deepEqual(jarvisRewards(saved(s)), { xp: 0, coins: 0 });
  assert.deepEqual(jarvisProblems(saved(s)), []);
});

test("jarvis: un quiz correcto suma 10 XP al bucket career y 0 monedas", () => {
  const s = fresh();
  const before = derived(s);
  const result = quiz(s, 10);
  assert.equal(result.status, "applied");
  const after = derived(s);
  assert.equal(after.xpBreakdown.career, before.xpBreakdown.career + 10);
  assert.equal(after.totalXP, before.totalXP + 10);
  assert.equal(after.coins.balance, before.coins.balance);
  assert.deepEqual(jarvisRewards(saved(s)), { xp: 10, coins: 0 });
});

test("jarvis: dos quizzes por día suman máximo 20 XP y el tercero se rechaza", () => {
  const s = fresh();
  assert.equal(quiz(s, 10, date, 0).status, "applied");
  assert.equal(quiz(s, 10, date, 1).status, "applied");
  const third = quiz(s, 10, date, 2);
  assert.notEqual(third.status, "applied");
  assert.equal(derived(s).totalXP, 6915 + 20);
  const view = jarvisView(saved(s), date);
  assert.equal(view.quizXpToday, 20);
  assert.equal(view.quizRestantes, 0);
  assert.equal(view.quizXpDisponible, 0);
});

test("jarvis: una ronda completada con 3 aciertos paga 6 XP y consume UNA ronda (regla v0.39.1)", () => {
  const s = fresh();
  const xp = 3 * JARVIS_QUIZ_XP_PER_HIT;
  assert.equal(xp, 6);
  assert.equal(quiz(s, xp).status, "applied");
  const view = jarvisView(saved(s), date);
  assert.equal(view.quizXpToday, 6);
  assert.equal(view.quizRestantes, 1);
  assert.deepEqual(jarvisRewards(saved(s)), { xp: 6, coins: 0 });
});

test("jarvis: completar una ronda sin aciertos consume la ronda y paga 0 XP", () => {
  const s = fresh();
  assert.equal(quiz(s, 0).status, "applied");
  const view = jarvisView(saved(s), date);
  assert.equal(view.quizRestantes, 1);
  assert.equal(view.quizXpToday, 0);
});

test("jarvis: xpAwarded que no son 2 XP por acierto (impar) se rechaza sin tocar el save", () => {
  const s = fresh();
  const beforeRaw = s.getItem(STORAGE_KEYS.bundle);
  assert.notEqual(quiz(s, 5).status, "applied");
  assert.notEqual(quiz(s, 7).status, "applied");
  assert.equal(s.getItem(STORAGE_KEYS.bundle), beforeRaw);
});

test("jarvis: la UI registra el quiz SOLO al completar la ronda (regla v0.39.1)", () => {
  const ui = fs.readFileSync(new URL("../js/jarvis-ui.js", import.meta.url), "utf8");
  assert.ok(ui.includes("JARVIS_QUIZ_XP_PER_HIT"), "la UI paga 2 XP por acierto");
  assert.ok(ui.includes("round.hits * JARVIS_QUIZ_XP_PER_HIT"), "el XP se calcula con los aciertos al cierre de la ronda");
  assert.equal((ui.match(/options\.onQuiz\(/g) || []).length, 1, "hay UN solo despacho de quiz: el del cierre");
  assert.ok(!ui.includes("LA PRIMERA VALE"), "la regla vieja (la 1.ª pregunta paga) quedó abolida");
  assert.ok(!ui.includes("El intento quedó registrado"), "ya no se registra nada al responder la 1.ª pregunta");
  assert.ok(ui.includes("rondas con XP:"), "el pie muestra las rondas con XP del día");
});

test("jarvis: xpAwarded fuera de rango (50) se rechaza sin tocar el save", () => {
  const s = fresh();
  const beforeRaw = s.getItem(STORAGE_KEYS.bundle);
  const result = quiz(s, 50);
  assert.notEqual(result.status, "applied");
  assert.equal(s.getItem(STORAGE_KEYS.bundle), beforeRaw);
  assert.deepEqual(jarvisRewards(saved(s)), { xp: 0, coins: 0 });
});

test("jarvis: el chat acepta 20 usos y rechaza el 21; kind inválido se rechaza", () => {
  const s = fresh();
  for (let i = 0; i < 20; i++) {
    assert.equal(usage(s, "chat", date, i).status, "applied", `chat ${i + 1}`);
  }
  assert.notEqual(usage(s, "chat", date, 30).status, "applied");
  assert.equal(jarvisView(saved(s), date).chatRestantes, 0);
  assert.notEqual(usage(s, "briefing", date, 31).status, "applied");
  assert.notEqual(usage(s, "quiz", date, 32).status, "applied");
});

test("jarvis: el briefing se guarda y solo se expone como de hoy ese día", () => {
  const s = fresh();
  const result = applyGameplayMutation(s, catalog,
    { type: "jarvis.briefing", text: "Hola, José. Hoy toca cerrar las diarias." }, opts());
  assert.equal(result.status, "applied");
  assert.equal(jarvisView(saved(s), date).briefingHoy, "Hola, José. Hoy toca cerrar las diarias.");
  assert.equal(jarvisView(saved(s), nextDate).briefingHoy, null);
  const empty = applyGameplayMutation(s, catalog, { type: "jarvis.briefing", text: "   " }, opts(nextDate));
  assert.notEqual(empty.status, "applied");
});

test("jarvis: al día siguiente el cupo de quiz vuelve a estar disponible", () => {
  const s = fresh();
  assert.equal(quiz(s, 10, date, 0).status, "applied");
  assert.equal(quiz(s, 10, date, 1).status, "applied");
  assert.equal(jarvisView(saved(s), date).quizRestantes, 0);
  const view = jarvisView(saved(s), nextDate);
  assert.equal(view.quizRestantes, 2);
  assert.equal(view.quizXpToday, 0);
  assert.equal(quiz(s, 0, nextDate, 2).status, "applied");
  assert.equal(jarvisRewards(saved(s)).xp, 20);
});

test("jarvis: buildProgressSummary devuelve la forma del spec con el fixture", () => {
  const s = fresh();
  const summary = buildProgressSummary(saved(s), catalog, "2026-11-20");
  assert.equal(typeof summary.nivel, "number");
  assert.ok(summary.nivel >= 1);
  assert.equal(typeof summary.xpTotal, "number");
  assert.equal(typeof summary.xpParaSiguienteNivel, "number");
  assert.equal(typeof summary.rachaDias, "number");
  assert.equal(summary.diarias.total, 3);
  assert.ok(Array.isArray(summary.diarias.pendientes));
  assert.ok(summary.proximaMisionCampana === null ||
    (typeof summary.proximaMisionCampana.campana === "string" &&
     typeof summary.proximaMisionCampana.mision === "string"));
  assert.ok(Array.isArray(summary.garajePorVencer));
  assert.ok(Array.isArray(summary.ianPorVencer));
  assert.deepEqual(summary.entrevistaEnvista, { fecha: "2026-11-24", diasRestantes: 4 });
  assert.deepEqual(Object.keys(summary.jarvisHoy).sort(),
    ["chatRestantes", "feedbackRestantes", "quizRestantes", "quizXp"]);
  const despues = buildProgressSummary(saved(s), catalog, "2026-11-25");
  assert.equal(despues.entrevistaEnvista, null);
});

test("jarvis: un play.jarvis corrupto lo reportan jarvisProblems y validatePlayState", () => {
  const s = fresh();
  const bundle = saved(s);
  bundle.play = {
    version: 3, completions: {}, checkins: {},
    jarvis: {
      quizXpByDate: { "2026-11-17": -5 },
      usage: { "2026-11-17": { quiz: -1, chat: 0, feedback: 0, calls: 0 } },
      briefing: { date: "no-es-fecha", text: "hola" },
    },
  };
  const problems = jarvisProblems(bundle);
  assert.ok(problems.length >= 3, problems.join("; "));
  const report = validatePlayState(bundle, catalog, {});
  assert.equal(report.ok, false);
});

test("jarvis: el teléfono lo abre como app con su retrato (segunda puerta al mismo Jarvis)", () => {
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.ok(html.includes('data-app="jarvis"'), "la pantalla principal del teléfono tiene la app de Jarvis");
  assert.ok(html.includes("assets/jarvis.webp"), "el ícono de la app es el retrato del robot");
  const app = fs.readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
  assert.ok(app.includes('app === "jarvis")'), "el teléfono despacha la app de Jarvis");
  assert.ok(app.includes("openJarvis()"), "la app abre el mismo diálogo de siempre");
});

test("jarvis: ninguna mutación de Jarvis mueve el saldo de monedas", () => {
  const s = fresh();
  const before = derived(s).coins.balance;
  quiz(s, 10, date, 0);
  usage(s, "chat", date, 1);
  usage(s, "feedback", date, 2);
  applyGameplayMutation(s, catalog, { type: "jarvis.briefing", text: "Saludo de prueba." }, opts(date, 3));
  assert.equal(derived(s).coins.balance, before);
  assert.equal(jarvisRewards(saved(s)).coins, 0);
});
