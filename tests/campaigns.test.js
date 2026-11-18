import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { CAMPAIGNS, CAMPAIGN_MISSIONS } from "../src/campaigns.js";
import { campaignView, campaignProblems, campaignRewards, APPLICATION_REWARD } from "../src/campaign-state.js";
import { STORAGE_KEYS, createMemoryStorage, importBundle, applyGameplayMutation,
  applyGameplayMutationLocked, loadOdea2, restoreBundle } from "../src/storage.js";
import { derive, sourcesFromMigrated } from "../src/derive.js";
import { validatePlayState } from "../src/validate.js";
import { newPlayerBundle } from "../src/new-player.js";

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
const opts = (second = 0) => ({ date, at: new Date(Date.UTC(2026, 10, 17, 12, 0, second)).toISOString() });
const complete = (s, id, evidence = "Entregable elaborado y revisado con todos los criterios.") =>
  applyGameplayMutation(s, catalog, { type: "campaign.complete", missionId: id, evidence }, opts());
const apply = (s, count, id = `request_${count.toString().padStart(8, "0")}`, seconds = count) =>
  applyGameplayMutation(s, catalog, { type: "application.record", requestId: id, expectedCount: count,
    company: "Empresa de prueba", role: "Analista junior", note: "Enviada manualmente" }, opts(seconds));
const derived = (s) => derive(sourcesFromMigrated(saved(s), catalog), catalog, "2026-11-10");

test("partida nueva: cero XP, cero monedas, perfil vacío y campañas listas sin fixture", () => {
  const s = createMemoryStorage();
  const imported = importBundle(newPlayerBundle(catalog, { name: "Nuevo jugador", date }), { storage: s, catalog, referenceDate: date });
  assert.equal(imported.status, "active");
  assert.equal(derived(s).totalXP, 0);
  assert.equal(derived(s).coins.balance, 0);
  assert.equal(campaignView(saved(s), "brete").done, 0);
  assert.equal(campaignView(saved(s), "gamer").done, 0);
  assert.equal(complete(s, "brete-01").status, "applied");
});

test("campañas: 96 misiones únicas, 8 capítulos de 6 por ruta y entregables completos", () => {
  const rutas = Object.entries(CAMPAIGNS).filter(([id]) => !["eventos", "garaje", "academia", "zonaia", "sabiduria", "mundoian"].includes(id));
  const misiones = rutas.flatMap(([, c]) => c.chapters.flatMap((ch) => ch.missions));
  assert.equal(misiones.length, 96);
  assert.equal(new Set(misiones.map((m) => m.id)).size, 96);
  for (const [id, c] of rutas) {
    assert.equal(c.chapters.length, 8);
    for (const chapter of c.chapters) {
      assert.equal(chapter.missions.length, 6);
      for (const m of chapter.missions) {
        assert.equal(m.campaignId, id);
        assert.equal(m.chapterId, chapter.id);
        assert.equal(m.steps.length, 3);
        assert.ok(m.title && m.brief && m.deliverable && m.criterion);
        assert.ok(Number.isSafeInteger(m.minutes) && m.minutes > 0);
        assert.ok(Number.isSafeInteger(m.xp) && m.xp >= 50);
        assert.ok(Number.isSafeInteger(m.coins) && m.coins > 0);
        if (m.resource) assert.ok(m.resource.url.startsWith("https://"));
      }
    }
    assert.ok(fs.existsSync(new URL(`../${c.image}`, import.meta.url)));
  }
});

test("evento Decision Lab: las 14 misiones de ODEA 1, en sus 5 fases y con su XP", () => {
  const c = CAMPAIGNS.eventos;
  assert.ok(c, "la campaña del evento existe");
  assert.equal(c.chapters.length, 5);
  assert.deepEqual(c.chapters.map((ch) => ch.missions.length), [3, 3, 3, 2, 3]);
  const ms = c.chapters.flatMap((ch) => ch.missions);
  assert.equal(ms.length, 14);
  assert.equal(ms.reduce((a, m) => a + m.xp, 0), 1020, "el XP total es el de ODEA 1");
  assert.equal(ms[0].id, "eventos-01");
  assert.equal(ms[0].title, "Diseñar la operación");
  assert.equal(ms[13].id, "eventos-14");
  assert.equal(ms[13].title, "Frase para las cartas");
  for (const m of ms) {
    assert.equal(m.campaignId, "eventos");
    assert.ok(m.title && m.brief && m.deliverable && m.criterion);
    assert.ok(m.steps.length >= 2);
    assert.ok(Number.isSafeInteger(m.xp) && m.xp >= 40);
    assert.ok(Number.isSafeInteger(m.coins) && m.coins > 0);
  }
  assert.ok(fs.existsSync(new URL(`../${c.image}`, import.meta.url)), "la escena del estadio existe");
  const s = fresh();
  const view = campaignView(saved(s), "eventos");
  assert.equal(view.total, 14);
  assert.equal(view.next.id, "eventos-01");
  assert.equal(complete(s, "eventos-02").error.code, "MISSION_LOCKED", "el proyecto avanza en orden");
  assert.equal(complete(s, "eventos-01").status, "applied");
  const after = campaignView(saved(s), "eventos");
  assert.equal(after.done, 1);
  assert.equal(after.chapters[0].missions[1].unlocked, true);
});

test("garaje: las 13 rutinas de ODEA 1 + 14 de detalle, 27 misiones en 4 capítulos", () => {
  const c = CAMPAIGNS.garaje;
  assert.ok(c, "la campaña del Garaje existe");
  assert.deepEqual(c.chapters.map((ch) => ch.missions.length), [7, 7, 6, 7]);
  const ms = c.chapters.flatMap((ch) => ch.missions);
  assert.equal(ms.length, 27);
  const titulos = ms.map((m) => m.title);
  for (const t of ["Lavar el carro", "Revisar presión de llantas", "Limpiar el interior", "Revisar nivel de aceite",
    "Revisar refrigerante y líquido de frenos", "Revisar luces y escobillas", "Cambio de aceite y filtro",
    "Lavar la moto", "Limpiar y lubricar la cadena", "Revisar frenos", "Revisar luces",
    "Lavado completo y encerado", "Detalle interior profundo", "Kit de arrastre completo", "Lista para la revisión técnica (Dekra)"])
    assert.ok(titulos.includes(t), `falta «${t}»`);
  for (const m of ms) {
    assert.equal(m.campaignId, "garaje");
    assert.ok(m.title && m.brief && m.deliverable && m.criterion);
    assert.ok(m.steps.length >= 2);
    assert.ok(Number.isSafeInteger(m.xp) && m.xp >= 40);
    assert.ok(Number.isSafeInteger(m.coins) && m.coins > 0);
  }
  assert.ok(fs.existsSync(new URL(`../${c.image}`, import.meta.url)), "la escena del parqueo existe");
  const s = fresh();
  const view = campaignView(saved(s), "garaje");
  assert.equal(view.total, 27);
  assert.equal(view.next.id, "garaje-01");
  assert.equal(complete(s, "garaje-01").status, "applied");
  assert.equal(campaignView(saved(s), "garaje").done, 1);
});

test("academia: las 6 rutas y 29 pasos de ODEA 1, con Google Advanced como certificación principal", () => {
  const c = CAMPAIGNS.academia;
  assert.ok(c, "la campaña de la Academia existe");
  assert.deepEqual(c.chapters.map((ch) => ch.missions.length), [5, 7, 6, 4, 3, 4]);
  const ms = c.chapters.flatMap((ch) => ch.missions);
  assert.equal(ms.length, 29);
  assert.equal(ms.reduce((a, m) => a + m.xp, 0), 2170);
  assert.equal(ms.reduce((a, m) => a + m.coins, 0), 142);
  const titulos = ms.map((m) => m.title);
  for (const t of ["Examen de inglés EF SET", "Publicar el certificado EF SET", "Cerrar el curso INA de IA Moderna",
    "Instalar SQL Server Express + SSMS", "Puente T-SQL: 10 consultas de práctica",
    "Curso 1: Foundations of Data Science", "Curso 7: Capstone y certificado completo 🏅",
    "Power BI (Coursera): preparar y cargar datos", "Aprobar el examen con voucher: AI-900 (recomendado) o DP-900 🏅",
    "Google AI Essentials (Coursera)", "Kaggle Learn: Intro to Machine Learning",
    "Trailhead: ruta de reportes y dashboards (parte 1)", "SAP Learning: ruta introductoria",
    "GitHub: proyecto insignia con IA", "🏆 Analista de la era IA"])
    assert.ok(titulos.includes(t), `falta «${t}»`);
  assert.ok(!titulos.some((t) => /Ask Questions|Prepare Data for Exploration|Data Analysis with R/.test(t)),
    "la certificación básica de Google salió de la ruta");
  assert.equal(ms[0].id, "academia-01");
  assert.equal(ms[28].id, "academia-29");
  for (const m of ms) {
    assert.equal(m.campaignId, "academia");
    assert.ok(m.title && m.brief && m.deliverable && m.criterion);
    assert.ok(m.steps.length >= 2);
    assert.ok(Number.isSafeInteger(m.xp) && m.xp >= 40);
    assert.ok(Number.isSafeInteger(m.coins) && m.coins > 0);
  }
  assert.ok(fs.existsSync(new URL(`../${c.image}`, import.meta.url)), "la escena de la universidad existe");
  const s = fresh();
  const view = campaignView(saved(s), "academia");
  assert.equal(view.total, 29);
  assert.equal(view.next.id, "academia-01");
  assert.equal(complete(s, "academia-02").error.code, "MISSION_LOCKED", "la ruta avanza en orden");
  assert.equal(complete(s, "academia-01").status, "applied");
  const after = campaignView(saved(s), "academia");
  assert.equal(after.done, 1);
  assert.equal(after.chapters[0].missions[1].unlocked, true);
});

test("zonaia: las 48 misiones del PDF «Construir agentes de IA con criterio profesional»", () => {
  const c = CAMPAIGNS.zonaia;
  assert.ok(c, "la campaña de la Zona IA existe");
  assert.deepEqual(c.chapters.map((ch) => ch.missions.length), [6, 6, 6, 6, 6, 6, 6, 6]);
  assert.deepEqual(c.chapters.map((ch) => ch.title), [
    "01 · Fundamentos y criterio profesional",
    "02 · Automatización para analistas de datos",
    "03 · Construcción de agentes",
    "04 · Evaluación, seguridad y confiabilidad",
    "05 · Automatizaciones para trabajo y vida",
    "06 · De prototipo a producción",
    "07 · Portafolio y empleabilidad",
    "08 · Servicios profesionales",
  ]);
  const ms = c.chapters.flatMap((ch) => ch.missions);
  assert.equal(ms.length, 48);
  assert.equal(ms.reduce((a, m) => a + m.xp, 0), 2680);
  assert.equal(ms.reduce((a, m) => a + m.coins, 0), 192);
  const titulos = ms.map((m) => m.title);
  for (const t of ["Tu punto de partida técnico", "Automatización, workflow o agente", "Elegí un problema real",
    "Datos confiables antes de IA", "Conectate a una API", "Generá un informe recurrente",
    "Tu primer agente con herramientas", "RAG con fuentes verificables", "Conectá herramientas mediante MCP",
    "Orquestación sin complejidad innecesaria", "Medí calidad, no solo “se ve bien”",
    "Diseñá recuperación ante fallos", "Clasificador de correos que prepara borradores",
    "Privacidad y control personal", "Publicá una API para tu solución", "Hacé una prueba de operación",
    "Proyecto 1: copiloto de analista", "Traducí proyectos a oportunidades laborales",
    "Descubrí problemas de clientes", "Construí un piloto acotado", "Convertí el piloto en evidencia profesional"])
    assert.ok(titulos.includes(t), `falta «${t}»`);
  assert.equal(ms[0].id, "zonaia-01");
  assert.equal(ms[47].id, "zonaia-48");
  for (const m of ms) {
    assert.equal(m.campaignId, "zonaia");
    assert.ok(m.title && m.brief && m.deliverable && m.criterion);
    assert.ok(m.steps.length >= 2);
    assert.ok(Number.isSafeInteger(m.xp) && m.xp >= 50);
    assert.ok(Number.isSafeInteger(m.coins) && m.coins > 0);
  }
  assert.ok(fs.existsSync(new URL(`../${c.image}`, import.meta.url)), "la escena de la base de IA existe");
  const s = fresh();
  const view = campaignView(saved(s), "zonaia");
  assert.equal(view.total, 48);
  assert.equal(view.next.id, "zonaia-01");
  assert.equal(complete(s, "zonaia-02").error.code, "MISSION_LOCKED", "la ruta avanza en orden");
  assert.equal(complete(s, "zonaia-01").status, "applied");
  const after = campaignView(saved(s), "zonaia");
  assert.equal(after.done, 1);
  assert.equal(after.chapters[0].missions[1].unlocked, true);
  for (const m of ms.slice(1)) assert.equal(complete(s, m.id).status, "applied", m.id);
  const full = campaignView(saved(s), "zonaia");
  assert.equal(full.done, 48);
  assert.equal(full.rank, "Arquitecto de Agentes", "el rango final de la ruta");
});

test("sabiduria: las 60 misiones del PDF «Sabiduría para vivir con criterio»", () => {
  const c = CAMPAIGNS.sabiduria;
  assert.ok(c, "la campaña de Sabiduría Práctica existe");
  assert.deepEqual(c.chapters.map((ch) => ch.missions.length), [6, 6, 6, 6, 6, 6, 6, 6, 6, 6]);
  assert.deepEqual(c.chapters.map((ch) => ch.title), [
    "01 · Carácter, propósito y responsabilidad",
    "02 · Pensamiento crítico y decisiones",
    "03 · Inteligencia emocional y adversidad",
    "04 · Relaciones, escucha y límites",
    "05 · Hábitos, atención y energía",
    "06 · Dinero, estabilidad y decisiones financieras",
    "07 · Economía, riesgo y oportunidades",
    "08 · Negocios y creación de valor",
    "09 · Ventas, persuasión y negociación",
    "10 · Poder, buen juicio y servicio",
  ]);
  const ms = c.chapters.flatMap((ch) => ch.missions);
  assert.equal(ms.length, 60);
  assert.equal(ms.reduce((a, m) => a + m.xp, 0), 3350);
  assert.equal(ms.reduce((a, m) => a + m.coins, 0), 240);
  const titulos = ms.map((m) => m.title);
  for (const t of ["Tu definición de una buena vida", "Tu código personal", "Tu diario de decisiones",
    "Detector de gurús y promesas", "Aprendé a nombrar lo que sentís", "Escuchá sin preparar tu discurso",
    "Decí no sin humillar", "Tu revisión semanal", "Tu radiografía financiera privada",
    "Deuda sin autoengaño", "Tu fondo para imprevistos", "Leé los incentivos",
    "Desarmá un negocio real", "Calculá antes de poner precio", "Preguntá antes de presentar",
    "Negociá intereses y alternativas", "Leé el poder con dos columnas",
    "Sabiduría puesta al servicio", "Tu manual de vida, versión 1"])
    assert.ok(titulos.includes(t), `falta «${t}»`);
  assert.equal(ms[0].id, "sabiduria-01");
  assert.equal(ms[0].title, "Tu definición de una buena vida");
  assert.equal(ms[59].id, "sabiduria-60");
  for (const m of ms) {
    assert.equal(m.campaignId, "sabiduria");
    assert.ok(m.title && m.brief && m.deliverable && m.criterion);
    assert.ok(m.brief.includes("La misión está lista cuando"), `la condición del PDF está en «${m.title}»`);
    assert.ok(m.steps.length >= 2);
    assert.ok(Number.isSafeInteger(m.xp) && (m.xp === 55 || m.xp === 60));
    assert.equal(m.coins, 4);
  }
  assert.ok(fs.existsSync(new URL(`../${c.image}`, import.meta.url)), "la escena del templo de la mente existe");
  const s = fresh();
  const view = campaignView(saved(s), "sabiduria");
  assert.equal(view.total, 60);
  assert.equal(view.next.id, "sabiduria-01");
  assert.equal(complete(s, "sabiduria-02").error.code, "MISSION_LOCKED", "la ruta avanza en orden");
  assert.equal(complete(s, "sabiduria-01").status, "applied");
  const after = campaignView(saved(s), "sabiduria");
  assert.equal(after.done, 1);
  assert.equal(after.chapters[0].missions[1].unlocked, true);
  for (const m of ms.slice(1)) assert.equal(complete(s, m.id).status, "applied", m.id);
  const full = campaignView(saved(s), "sabiduria");
  assert.equal(full.done, 60);
  assert.equal(full.rank, "Sabio con criterio", "el rango final de la ruta");
});

test("campañas: un save anterior empieza en cero y conserva su progreso migrado", () => {
  const s = fresh();
  const before = saved(s);
  const view = campaignView(before, "brete");
  assert.equal(view.done, 0);
  assert.equal(view.total, 48);
  assert.equal(view.next.id, "brete-01");
  assert.equal(view.chapters[0].missions[0].unlocked, true);
  assert.equal(view.chapters[0].missions[1].unlocked, false);
  assert.equal(complete(s, "brete-02").error.code, "MISSION_LOCKED");
  assert.deepEqual(saved(s), before, "un paso bloqueado no escribe ni paga");
  assert.equal(complete(s, "brete-01", "corto").error.code, "EVIDENCE_REQUIRED");
  assert.equal(complete(s, "no-existe").error.code, "UNKNOWN_MISSION");
  assert.deepEqual(saved(s), before);
});

test("campañas: premio exacto, sin duplicación entre teléfono y mapa, y siguiente paso desbloqueado", () => {
  const s = fresh();
  const before = saved(s);
  const initial = derived(s);
  const first = CAMPAIGN_MISSIONS.find((m) => m.id === "brete-01");
  assert.equal(complete(s, first.id).status, "applied");
  assert.equal(complete(s, first.id).status, "duplicate");
  const state = saved(s);
  assert.equal(derived(s).totalXP, initial.totalXP + first.xp);
  assert.equal(derived(s).coins.balance, initial.coins.balance + first.coins);
  assert.equal(campaignView(state, "brete").done, 1);
  assert.equal(campaignView(state, "brete").next.id, "brete-02");
  assert.equal(campaignView(state, "gamer").done, 0);
  const core = structuredClone(state.core);
  delete core.derived;
  const oldCore = structuredClone(before.core);
  delete oldCore.derived;
  assert.deepEqual(core, oldCore);
  assert.deepEqual(state.worlds, before.worlds);
  assert.deepEqual(state.legacy, before.legacy);
  assert.equal(validatePlayState(state, catalog, { previous: before }).ok, true);
});

test("postulaciones: ilimitadas el mismo día, premio fijo y conteo exacto", () => {
  const s = fresh();
  const initial = derived(s);
  for (let i = 0; i < 125; i++) assert.equal(apply(s, i).status, "applied", `registro ${i}`);
  const view = campaignView(saved(s), "brete");
  assert.equal(view.applications.count, 125);
  assert.equal(view.applications.totalXP, 125 * APPLICATION_REWARD.xp);
  assert.equal(view.applications.totalCoins, 125 * APPLICATION_REWARD.coins);
  assert.equal(derived(s).totalXP, initial.totalXP + 3125);
  assert.equal(derived(s).coins.balance, initial.coins.balance + 250);
  assert.equal(view.applications.recent.length, 8);
  assert.equal(validatePlayState(saved(s), catalog).ok, true);
});

test("postulaciones: token idempotente, doble toque y contador obsoleto no pagan", () => {
  const s = fresh();
  assert.equal(apply(s, 0, "unique_request_one", 0).status, "applied");
  const before = s.getItem(STORAGE_KEYS.bundle);
  assert.equal(apply(s, 0, "unique_request_one", 1).status, "duplicate");
  assert.equal(apply(s, 0, "unique_request_two", 2).error.code, "STALE_APPLICATION_COUNT");
  assert.equal(apply(s, 1, "unique_request_two", 0).error.code, "TOO_FAST");
  assert.equal(s.getItem(STORAGE_KEYS.bundle), before);
  assert.equal(apply(s, 1, "unique_request_two", 1).status, "applied");
  assert.equal(campaignView(saved(s), "brete").applications.count, 2);
});

test("postulaciones: campos seguros y cantidades de premios ignoradas", () => {
  const s = fresh();
  const initial = derived(s);
  const result = applyGameplayMutation(s, catalog, {
    type: "application.record", requestId: "manual_request_123", expectedCount: 0,
    company: "a".repeat(500), role: "<script>alert(1)</script>", note: "n".repeat(2000),
    xp: 999999, coins: 999999, reward: { xp: 999999, coins: 999999 }
  }, opts());
  assert.equal(result.status, "applied");
  const r = saved(s).play.campaigns.applications.manual_request_123;
  assert.equal(r.company.length, 120);
  assert.equal(r.note.length, 1000);
  assert.equal(derived(s).totalXP - initial.totalXP, 25);
  assert.equal(derived(s).coins.balance - initial.coins.balance, 2);
});

test("campañas: recorrido de ambas rutas completo, totales congelados, recarga y restauración", () => {
  const s = fresh();
  const initial = derived(s);
  for (const mission of CAMPAIGN_MISSIONS) assert.equal(complete(s, mission.id).status, "applied", mission.id);
  assert.equal(campaignView(saved(s), "brete").done, 48);
  assert.equal(campaignView(saved(s), "gamer").next, null);
  assert.equal(campaignView(saved(s), "gamer").percent, 100);
  const expected = CAMPAIGN_MISSIONS.reduce((n, m) => n + m.xp, 0);
  assert.equal(derived(s).totalXP - initial.totalXP, expected);
  assert.equal(derived(s).xpBreakdown.evento, initial.xpBreakdown.evento, "clipping no altera el crédito permanente del evento retirado");
  assert.equal(derived(s).xpBreakdown.farm, initial.xpBreakdown.farm, "el farmeo histórico permanece intacto");
  const snapshot = saved(s);
  const loaded = loadOdea2(snapshot, catalog);
  assert.deepEqual(loaded.play.campaigns, snapshot.play.campaigns);
  const target = createMemoryStorage();
  restoreBundle(JSON.parse(JSON.stringify(snapshot)), { storage: target, catalog });
  assert.deepEqual(saved(target).play.campaigns, snapshot.play.campaigns);
  assert.equal(derived(target).totalXP, derived(s).totalXP);
  const old = CAMPAIGN_MISSIONS[0].xp;
  CAMPAIGN_MISSIONS[0].xp += 1000;
  assert.equal(campaignRewards(snapshot).career, campaignRewards(saved(target)).career);
  assert.equal(derived(s).totalXP - initial.totalXP, expected, "el catálogo no reescribe premios anteriores");
  CAMPAIGN_MISSIONS[0].xp = old;
});

test("campañas: validación rechaza estado corrupto sin excepciones", () => {
  const s = fresh();
  complete(s, "gamer-01");
  for (const bad of [
    { version: 99, completions: {}, applications: {} },
    { version: 1, completions: [], applications: {} },
    { version: 1, completions: { fantasma: {} }, applications: {} }
  ]) {
    const state = saved(s);
    state.play.campaigns = bad;
    assert.ok(campaignProblems(state).length);
  }
  const state = saved(s);
  state.play.campaigns.completions["gamer-01"].date = "2026-99-99";
  assert.ok(campaignProblems(state).length);
});

test("postulaciones: lock entre pestañas conserva un solo premio para un mismo contador", async () => {
  const s = fresh();
  let tail = Promise.resolve();
  const locks = { request(_name, _config, fn) {
    if (typeof _config === "function") fn = _config;
    const job = tail.then(fn); tail = job.catch(() => {}); return job;
  } };
  const mutation = (requestId) => ({ type: "application.record", requestId, expectedCount: 0 });
  const results = await Promise.all([
    applyGameplayMutationLocked(s, catalog, mutation("parallel_request_a"), { ...opts(), locks }),
    applyGameplayMutationLocked(s, catalog, mutation("parallel_request_b"), { ...opts(1), locks })
  ]);
  assert.equal(results.filter((r) => r.status === "applied").length, 1);
  assert.equal(campaignView(saved(s), "brete").applications.count, 1);
});

test("mundoian: las 54 misiones de la ruta de Ian Daniel", () => {
  const c = CAMPAIGNS.mundoian;
  assert.ok(c, "la campaña del Mundo de Ian existe");
  assert.deepEqual(c.chapters.map((ch) => ch.missions.length), [6, 6, 6, 6, 6, 6, 6, 6, 6]);
  assert.deepEqual(c.chapters.map((ch) => ch.title), [
    "01 · Un corazón bueno",
    "02 · Mente curiosa",
    "03 · Responsable como un grande",
    "04 · Emociones con nombre",
    "05 · Cuerpo fuerte y sano",
    "06 · Familia y amigos",
    "07 · Crear e imaginar",
    "08 · Sueños y valentía",
    "09 · A jugar con papá",
  ]);
  const ms = c.chapters.flatMap((ch) => ch.missions);
  assert.equal(ms.length, 54);
  assert.equal(ms.reduce((a, m) => a + m.xp, 0), 3015);
  assert.equal(ms.reduce((a, m) => a + m.coins, 0), 216);
  const titulos = ms.map((m) => m.title);
  for (const t of ["Decir la verdad aunque cueste", "Cazador de letras", "Profesor Ian",
    "La noche de juegos", "Paseo de exploradores", "La guarida secreta",
    "El semáforo de mis emociones", "Todavía no puedo", "Mi mapa de gustos"])
    assert.ok(titulos.includes(t), `falta «${t}»`);
  assert.equal(ms[0].id, "mundoian-01");
  assert.equal(ms[0].title, "Decir la verdad aunque cueste");
  assert.equal(ms[53].id, "mundoian-54");
  for (const m of ms) {
    assert.equal(m.campaignId, "mundoian");
    assert.ok(m.title && m.brief && m.deliverable && m.criterion);
    assert.ok(m.brief.includes("La misión está lista cuando"), `la condición de la guía está en «${m.title}»`);
    assert.equal(m.steps.length, 3);
    assert.ok(Number.isSafeInteger(m.xp) && (m.xp === 55 || m.xp === 60));
    assert.equal(m.coins, 4);
  }
  assert.ok(fs.existsSync(new URL(`../${c.image}`, import.meta.url)), "la escena del patio de juegos existe");
  /* Desde v0.36.0 el Mundo de Ian es un sistema VIVO (todo desbloqueado,
     rutinas con reloj y proyectos de una vez, como el Garaje): su flujo
     y su insignia «Pequeño Gran Hombre» se prueban en tests/ian.test.js;
     aquí solo vive el catálogo. */
});
