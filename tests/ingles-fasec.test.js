import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  LISTEN_CATALOG, DICTATION_CLIPS, BANK_QUESTIONS, RESCUE_PHRASES, ERROR_SOURCES
} from "../src/ingles-content.js";
import {
  inglesView, inglesRewards, inglesProblems
} from "../src/ingles-state.js";
import { CAMPAIGNS } from "../src/campaigns.js";
import { campaignView, campaignRewards } from "../src/campaign-state.js";
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
  date: d, at: new Date(Date.parse(`${d}T12:00:00.000Z`) + second * 1000).toISOString()
});
const mut = (s, m, d = date, second = 0) => applyGameplayMutation(s, catalog, m, opts(d, second));
const derived = (s) => derive(sourcesFromMigrated(saved(s), catalog), catalog, "2026-11-10");
const complete = (s, n, d = date, sec = 0) => mut(s, {
  type: "campaign.complete",
  missionId: `ingles-${String(n).padStart(2, "0")}`,
  evidence: "Evidencia de práctica registrada en el Center."
}, d, sec);
const completeRange = (s, from, to, d = date, base = 100) => {
  for (let n = from; n <= to; n++) {
    const r = complete(s, n, d, base + n);
    assert.equal(r.status, "applied", `ingles-${n} debió completar: ${r.error?.code || r.status}`);
  }
};

/* ------------------------------ Contenido ------------------------------ */

test("fase C contenido: catálogo de escucha de 34 fichas (10/14/10) con 7 controles válidos", () => {
  assert.equal(LISTEN_CATALOG.length, 34);
  assert.equal(new Set(LISTEN_CATALOG.map((m) => m.id)).size, 34, "ids únicos");
  const bySpeed = {};
  for (const m of LISTEN_CATALOG) {
    bySpeed[m.speed] = (bySpeed[m.speed] || 0) + 1;
    assert.ok(m.title && m.url && m.desc && m.minutes > 0, `${m.id}: ficha completa`);
    assert.ok(["us", "uk", "in", "otro"].includes(m.accent), `${m.id}: acento válido`);
  }
  assert.deepEqual(bySpeed, { claro: 10, real: 14, rapido: 10 });
  const withCheck = LISTEN_CATALOG.filter((m) => m.check);
  assert.equal(withCheck.length, 7, "7 materiales con control local");
  for (const m of withCheck) {
    assert.equal(m.check.length, 3, `${m.id}: control de 3 preguntas`);
    for (const item of m.check) {
      assert.ok(item.q && item.options.length >= 3, `${m.id}: pregunta con opciones`);
      assert.ok(Number.isSafeInteger(item.answer) && item.answer >= 0 && item.answer < item.options.length,
        `${m.id}: respuesta válida`);
    }
  }
  assert.equal(DICTATION_CLIPS.length, 6, "6 clips de dictado de referencia");
  for (const c of DICTATION_CLIPS) assert.ok(c.text.split(" ").length >= 20, `${c.id}: clip con sustancia`);
});

test("fase C contenido: banco de 18 tarjetas, 17 con semilla real y bank-15 en blanco", () => {
  assert.equal(BANK_QUESTIONS.length, 18);
  assert.equal(new Set(BANK_QUESTIONS.map((q) => q.id)).size, 18);
  for (const q of BANK_QUESTIONS) assert.ok(q.q && q.hint, `${q.id}: pregunta y pista`);
  const seeded = BANK_QUESTIONS.filter((q) => q.seed);
  assert.equal(seeded.length, 17, "todas con semilla menos la del desacuerdo");
  assert.equal(BANK_QUESTIONS.find((q) => q.id === "bank-15").seed, undefined);
  assert.equal(RESCUE_PHRASES.length, 3);
  assert.deepEqual(Object.keys(ERROR_SOURCES), ["dictogloss", "simulacro", "ab", "llamada", "manual"]);
});

/* ------------------------------ La campaña ------------------------------ */

test("despegue: 58 misiones en 5 fases (12/14/13/13/6), 3.100 XP / ₡219, finales 90/12", () => {
  const c = CAMPAIGNS.ingles;
  assert.ok(c, "la campaña ingles existe");
  assert.deepEqual(c.chapters.map((ch) => ch.missions.length), [12, 14, 13, 13, 6]);
  const all = c.chapters.flatMap((ch) => ch.missions);
  assert.equal(all.length, 58);
  assert.equal(all.reduce((n, m) => n + m.xp, 0), 3100);
  assert.equal(all.reduce((n, m) => n + m.coins, 0), 219);
  all.forEach((m, i) => {
    assert.equal(m.id, `ingles-${String(i + 1).padStart(2, "0")}`, "ids secuenciales");
    const isFinal = [12, 26, 39, 52, 58].includes(i + 1);
    assert.equal(m.xp, isFinal ? 90 : 50, `${m.id}: XP de ${isFinal ? "final" : "estándar"}`);
    assert.equal(m.coins, isFinal ? 12 : 3, `${m.id}: monedas`);
  });
});

test("despegue: las puertas honestas bloquean sin el registro del Center", () => {
  const s = fresh();
  completeRange(s, 1, 38);
  const r39 = complete(s, 39, date, 200);
  assert.notEqual(r39.status, "applied", "el Dictado a ciegas no completa sin dictado");
  assert.equal(r39.error?.code, "DICTATION_REQUIRED");
  assert.equal(mut(s, { type: "ingles.dictation", clipId: "dic-5", pct: 62 }, date, 210).status, "applied");
  assert.equal(complete(s, 39, date, 220).status, "applied", "con el dictado registrado, completa");
  completeRange(s, 40, 51, date, 300);
  const r52 = complete(s, 52, date, 400);
  assert.notEqual(r52.status, "applied");
  assert.equal(r52.error?.code, "MOCK_REQUIRED");
  assert.equal(mut(s, { type: "ingles.mock", secs: 500, pauses: 4 }, date, 410).status, "applied");
  assert.equal(complete(s, 52, date, 420).status, "applied");
  const r53 = complete(s, 53, date, 430);
  assert.notEqual(r53.status, "applied");
  assert.equal(r53.error?.code, "EFSET_REQUIRED");
});

test("despegue: campaña completa con las mediciones — rango «Bilingüe Certificado»", () => {
  const s = fresh();
  assert.equal(mut(s, { type: "ingles.dictation", clipId: "dic-5", pct: 70 }).status, "applied");
  assert.equal(mut(s, { type: "ingles.mock", secs: 470, pauses: 5 }, date, 1).status, "applied");
  assert.equal(mut(s, { type: "ingles.efset", score: "B1 · 52/100" }, date, 2).status, "applied");
  completeRange(s, 1, 53);
  const r54early = complete(s, 54, date, 200);
  assert.notEqual(r54early.status, "applied", "la segunda medición no llega antes de los 90 días");
  assert.equal(r54early.error?.code, "EFSET_SECOND_REQUIRED");
  const day90 = "2027-02-22";
  assert.equal(mut(s, { type: "ingles.efset", score: "B2 · 61/100" }, day90, 3).status, "applied");
  completeRange(s, 54, 58, day90);
  const view = campaignView(saved(s), "ingles");
  assert.equal(view.done, 58);
  assert.equal(view.total, 58);
  assert.equal(view.rank, "Bilingüe Certificado");
  const rewards = campaignRewards(saved(s));
  assert.equal(rewards.career, 3100, "la campaña paga sus 3.100 XP por el componente de campañas");
  assert.deepEqual(inglesProblems(saved(s)), []);
});

/* ------------------------------ Banco de entrevista ------------------------------ */

test("banco: guardar respuesta e intentos, con validación estricta", () => {
  const s = fresh();
  assert.equal(mut(s, { type: "ingles.bankSave", qid: "bank-01", answer: "Mi pitch, en mi voz." }).status, "applied");
  assert.equal(saved(s).play.ingles.bank["bank-01"].answer, "Mi pitch, en mi voz.");
  assert.notEqual(mut(s, { type: "ingles.bankSave", qid: "bank-99", answer: "x" }, date, 1).status, "applied");
  assert.notEqual(mut(s, { type: "ingles.bankSave", qid: "bank-01", answer: "x".repeat(2001) }, date, 2).status, "applied");
  assert.notEqual(mut(s, { type: "ingles.bankTry", qid: "bank-01", secs: 4 }, date, 3).status, "applied", "un intento de 4 s no es un intento");
  assert.equal(mut(s, { type: "ingles.bankTry", qid: "bank-01", secs: 68 }, date, 4).status, "applied");
  const view = inglesView(saved(s), date);
  const pitch = view.faseC.bank.questions.find((q) => q.id === "bank-01");
  assert.equal(pitch.tries, 1);
  assert.equal(pitch.bestSecs, 68);
  assert.equal(view.faseC.bank.answered, 1);
  assert.deepEqual(inglesProblems(saved(s)), []);
});

test("banco: las 18 tarjetas con 2 pasadas otorgan el hito h8 una sola vez", () => {
  const s = fresh();
  let sec = 0;
  for (const q of BANK_QUESTIONS) {
    mut(s, { type: "ingles.bankTry", qid: q.id, secs: 60 }, date, sec++);
    mut(s, { type: "ingles.bankTry", qid: q.id, secs: 55 }, date, sec++);
  }
  const bundle = saved(s);
  assert.ok(bundle.play.ingles.log["ingles-h8"], "el hito h8 quedó ganado");
  assert.deepEqual(inglesRewards(bundle), { xp: 100, coins: 6 }, "solo paga el hito h8");
  const before = inglesRewards(bundle);
  mut(s, { type: "ingles.bankTry", qid: "bank-01", secs: 50 }, date, sec++);
  assert.deepEqual(inglesRewards(saved(s)), before, "el hito no se paga dos veces");
  const view = inglesView(bundle, date);
  assert.equal(view.faseC.bank.twoPasses, 18);
});

/* ------------------------------ Escucha ------------------------------ */

test("escucha: el control se registra con su mejor marca y valida la forma", () => {
  const s = fresh();
  assert.notEqual(mut(s, { type: "ingles.listenCheck", matId: "esc-xx", correct: 2 }).status, "applied");
  assert.notEqual(mut(s, { type: "ingles.listenCheck", matId: "esc-c01", correct: 2 }, date, 1).status, "applied", "sin control en el material");
  assert.notEqual(mut(s, { type: "ingles.listenCheck", matId: "esc-c06", correct: 4 }, date, 2).status, "applied");
  assert.equal(mut(s, { type: "ingles.listenCheck", matId: "esc-c06", correct: 1 }, date, 3).status, "applied");
  assert.equal(mut(s, { type: "ingles.listenCheck", matId: "esc-c06", correct: 3 }, date, 4).status, "applied");
  const view = inglesView(saved(s), date);
  const mat = view.faseC.listen.materials.find((m) => m.id === "esc-c06");
  assert.equal(mat.checkState.best, 3, "queda la mejor marca");
  assert.equal(mat.checkState.attempts, 2);
  assert.equal(mat.checkState.approved, true);
  assert.deepEqual(inglesProblems(saved(s)), []);
});

test("escucha: tres acentos aprobados otorgan el hito h9", () => {
  const s = fresh();
  mut(s, { type: "ingles.listenCheck", matId: "esc-c06", correct: 2 });            // us
  mut(s, { type: "ingles.listenCheck", matId: "esc-r02", correct: 3 }, date, 1);   // uk
  assert.equal(saved(s).play.ingles.log["ingles-h9"], undefined, "todavía falta el indio");
  mut(s, { type: "ingles.listenCheck", matId: "esc-r07", correct: 2 }, date, 2);   // in
  assert.ok(saved(s).play.ingles.log["ingles-h9"], "h9 ganado con los tres acentos");
  assert.deepEqual(inglesRewards(saved(s)), { xp: 80, coins: 5 });
  const view = inglesView(saved(s), date);
  assert.deepEqual(view.faseC.listen.accentsApproved, ["us", "uk", "in"]);
});

test("dictado: el % se registra y el primer intento de cada clip queda marcado", () => {
  const s = fresh();
  assert.notEqual(mut(s, { type: "ingles.dictation", clipId: "dic-9", pct: 50 }).status, "applied");
  assert.notEqual(mut(s, { type: "ingles.dictation", clipId: "dic-1", pct: 101 }, date, 1).status, "applied");
  mut(s, { type: "ingles.dictation", clipId: "dic-1", pct: 55 }, date, 2);
  mut(s, { type: "ingles.dictation", clipId: "dic-1", pct: 72 }, date, 3);
  const view = inglesView(saved(s), date);
  assert.equal(view.faseC.listen.dictCount, 2);
  assert.equal(view.faseC.listen.dictBest["dic-1"], 72);
  assert.equal(view.faseC.listen.dictRef[0].first, true);
  assert.equal(view.faseC.listen.dictRef[1].first, false);
  assert.deepEqual(inglesProblems(saved(s)), []);
});

/* ------------------------------ Bitácora, EF SET y simulacro ------------------------------ */

test("bitácora: anotar y quitar errores con su fuente", () => {
  const s = fresh();
  assert.notEqual(mut(s, { type: "ingles.errorAdd", text: "me como el -ed", source: "otro" }).status, "applied");
  assert.equal(mut(s, { type: "ingles.errorAdd", text: "me como el -ed de worked", source: "dictogloss" }).status, "applied");
  const id = saved(s).play.ingles.errors[0].id;
  assert.equal(id, "err-1");
  assert.notEqual(mut(s, { type: "ingles.errorRemove", errorId: "err-99" }, date, 1).status, "applied");
  assert.equal(mut(s, { type: "ingles.errorRemove", errorId: id }, date, 2).status, "applied");
  assert.equal(saved(s).play.ingles.errors.length, 0);
  assert.deepEqual(inglesProblems(saved(s)), []);
});

test("efset: la primera medición otorga h5; la segunda espera 90 días y no hay tercera", () => {
  const s = fresh();
  assert.equal(mut(s, { type: "ingles.efset", score: "B1 · 52/100" }).status, "applied");
  assert.ok(saved(s).play.ingles.log["ingles-h5"], "h5 al registrar la medición");
  assert.deepEqual(inglesRewards(saved(s)), { xp: 100, coins: 6 });
  const early = mut(s, { type: "ingles.efset", score: "B2" }, "2026-12-24", 1);
  assert.notEqual(early.status, "applied");
  assert.equal(early.error?.code, "EFSET_TOO_EARLY");
  assert.equal(mut(s, { type: "ingles.efset", score: "B2 · 61/100" }, "2027-02-22", 2).status, "applied");
  const done = mut(s, { type: "ingles.efset", score: "C1" }, "2027-06-01", 3);
  assert.notEqual(done.status, "applied");
  assert.equal(done.error?.code, "EFSET_DONE");
  const view = inglesView(saved(s), "2027-06-01");
  assert.equal(view.faseC.efset.first.score, "B1 · 52/100");
  assert.equal(view.faseC.efset.second.score, "B2 · 61/100");
  assert.deepEqual(inglesProblems(saved(s)), []);
});

test("simulacro: registrar otorga h6 y valida tiempo y pausas", () => {
  const s = fresh();
  assert.notEqual(mut(s, { type: "ingles.mock", secs: 30, pauses: 2 }).status, "applied", "30 s no es un simulacro");
  assert.notEqual(mut(s, { type: "ingles.mock", secs: 500, pauses: -1 }, date, 1).status, "applied");
  assert.equal(mut(s, { type: "ingles.mock", secs: 500, pauses: 4 }, date, 2).status, "applied");
  assert.ok(saved(s).play.ingles.log["ingles-h6"]);
  assert.deepEqual(inglesRewards(saved(s)), { xp: 80, coins: 5 });
  mut(s, { type: "ingles.mock", secs: 430, pauses: 3 }, date, 3);
  assert.deepEqual(inglesRewards(saved(s)), { xp: 80, coins: 5 }, "h6 no se repite");
  assert.equal(inglesView(saved(s), date).faseC.mock.count, 2);
});

/* ------------------------------ Tablero ------------------------------ */

test("tablero: sin evidencia todo arranca en Torre 1 y la evidencia mueve los niveles", () => {
  const s = fresh();
  let board = inglesView(saved(s), date).tablero;
  assert.deepEqual(board.skills.map((x) => x.level), [1, 1, 1, 1], "voz, oído, palabras, entrevista en Nivel 1");
  /* OÍDO a Nivel 2 con un dictado ≥60%. */
  mut(s, { type: "ingles.dictation", clipId: "dic-2", pct: 64 });
  /* ENTREVISTA a Nivel 2 con el pitch en ≤75 s. */
  mut(s, { type: "ingles.bankTry", qid: "bank-01", secs: 70 }, date, 1);
  board = inglesView(saved(s), date).tablero;
  assert.equal(board.skills.find((x) => x.id === "oido").level, 2);
  assert.equal(board.skills.find((x) => x.id === "entrevista").level, 2);
  assert.equal(board.skills.find((x) => x.id === "voz").level, 1, "la voz no se mueve sin su evidencia");
});

test("tablero voz: 3 contrastes vocálicos dominados suben a Nivel 2 (el de acento no cuenta)", () => {
  const s = fresh();
  let sec = 0;
  const master = (contrastId) => {
    for (let i = 0; i < 20; i++) {
      mut(s, { type: "ingles.hvptAttempt", contrastId, pairIdx: 0, played: "a", picked: "a" }, date, sec++);
    }
  };
  master("hvpt-ii");
  master("hvpt-aeu");
  master("hvpt-stress"); // dominado, pero es de acento: no suma como vocálico
  let voz = inglesView(saved(s), date).tablero.skills.find((x) => x.id === "voz");
  assert.equal(voz.level, 1, "con 2 vocálicos + el de acento no alcanza");
  master("hvpt-uu");
  voz = inglesView(saved(s), date).tablero.skills.find((x) => x.id === "voz");
  assert.equal(voz.level, 2, "3 vocálicos dominados = Nivel 2");
  assert.deepEqual(inglesProblems(saved(s)), []);
});

/* ------------------------------ Paridad y forma ------------------------------ */

test("fase C: las herramientas no pagan por sí mismas — solo los hitos que otorgan", () => {
  const s = fresh();
  const before = derived(s);
  mut(s, { type: "ingles.bankSave", qid: "bank-02", answer: "Mi respuesta." });
  mut(s, { type: "ingles.bankTry", qid: "bank-02", secs: 80 }, date, 1);
  mut(s, { type: "ingles.listenCheck", matId: "esc-c06", correct: 1 }, date, 2);
  mut(s, { type: "ingles.dictation", clipId: "dic-3", pct: 40 }, date, 3);
  mut(s, { type: "ingles.errorAdd", text: "finales caídos", source: "ab" }, date, 4);
  const after = derived(s);
  assert.equal(after.totalXP, before.totalXP, "0 XP nuevo sin hito de por medio");
  assert.equal(after.coins.balance, before.coins.balance);
  assert.deepEqual(inglesRewards(saved(s)), { xp: 0, coins: 0 });
});

test("fase C: un save sin las claves nuevas valida y la vista deriva en vacío", () => {
  const s = fresh();
  mut(s, { type: "ingles.complete", missionId: "ingles-01" });
  const bundle = saved(s);
  assert.equal(bundle.play.ingles.bank, undefined, "la Fase A/B no conocía estas claves");
  assert.equal(bundle.play.ingles.listen, undefined);
  assert.deepEqual(inglesProblems(bundle), []);
  const view = inglesView(bundle, date);
  assert.equal(view.faseC.bank.answered, 0);
  assert.equal(view.faseC.listen.total, 34);
  assert.equal(view.faseC.efset, null);
  assert.deepEqual(view.tablero.skills.map((x) => x.level), [1, 1, 1, 1]);
});

test("fase C: la forma corrupta de las claves nuevas se detecta", () => {
  const s = fresh();
  mut(s, { type: "ingles.bankSave", qid: "bank-01", answer: "ok" });
  const bundle = saved(s);
  bundle.play.ingles.bank["bank-01"].answer = 42;
  assert.ok(inglesProblems(bundle).length > 0, "respuesta no textual");
  bundle.play.ingles.bank["bank-01"].answer = "ok";
  bundle.play.ingles.listen = { checks: {}, dictRef: [{ clipId: "dic-1", pct: 140, date, at: "x", first: true }] };
  assert.ok(inglesProblems(bundle).length > 0, "dictado imposible");
  bundle.play.ingles.listen = { checks: {}, dictRef: [] };
  bundle.play.ingles.efset = { date, score: "B1", at: "x", second: { date: "2026-12-01", score: "B2", at: "x" } };
  assert.ok(inglesProblems(bundle).length > 0, "segunda medición antes de 90 días");
  bundle.play.ingles.efset = null;
  bundle.play.ingles.mock = { tries: [{ date, secs: 10, pauses: 0, at: "x" }] };
  assert.ok(inglesProblems(bundle).length > 0, "simulacro imposible");
});
