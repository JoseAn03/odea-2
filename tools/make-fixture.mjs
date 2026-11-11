#!/usr/bin/env node
/**
 * make-fixture.mjs — Genera el fixture SINTÉTICO con la forma exacta del
 * bundle real `odea_bundle_v2` (36 campos + 11 claves). Valores falsos.
 *
 * Nunca lee ni copia el progreso real del usuario. Los XP derivados se
 * calculan con el oráculo (src/derive.js) sobre los ids reales del catálogo.
 */
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sourcesFromLegacy, derive, isoWeekKey } from "../src/derive.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const catalog = JSON.parse(fs.readFileSync(join(root, "data", "xp-catalog.json"), "utf8"));

const REFERENCE_DATE = "2026-11-10";
const WEEK = isoWeekKey(REFERENCE_DATE);

const save = {
  playerName: "Recluta Sintética",
  completedMissions: ["fl1_1", "fl1_3", "fl1_4"],
  completedDaily: ["1A", "1B", "1C", "2A", "2B", "2C"],
  completedWeekly: [1, 2],
  completedJobs: ["n1", "n2", "n3"],
  completedB2b: ["b0_1", "b1_2"],
  completedPuente: ["pg1", "pg2"],
  unlockedAch: ["ach_first", "ach_ten", "ach_st7", "ach_j5"],
  startDate: "2026-10-01",
  lastDailyDate: REFERENCE_DATE,
  streak: 8,
  shieldWeek: "2026-W45",
  vida: {
    log: [
      "hab-gym|2026-11-05",
      "hab-leer|2026-11-05",
      "hab-ahorro|2026-11-05",
      "reto9|2026-11-05",
      "kwk-parque|2026-11-04",
      "kd-cuento|2026-11-03"
    ],
    growth: ["grw-libro"],
    kid: ["kht-zapatos"],
    couple: ["cgo-presu"],
    pow: ["pow-48"],
    men: ["men-ep"],
    plan: ["pln-piscina"],
    orden: ["orw-limpieza"]
  },
  capital: { done: ["ca1_1", "ca1_3"], eng: ["en1_1"], ai: ["ia1_2"] },
  gods: { cronos: true, hades: true },
  shop: { spent: 100, owned: ["hl_iron", "bt_iron"], equipped: { cabeza: "hl_iron", pies: "bt_iron" } },
  sound: true,
  reto: { date: REFERENCE_DATE, id: "reto9", done: true },
  rewards: {
    unlocked: ["rw_d1", "rw_first", "rw_st14"],
    queue: [],
    equipped: { hombros: "rw_st14", torso: "rw_first" }
  },
  planner: { items: [{ f: "campaign", id: "fl1_1" }, { f: "daily", id: "1A" }] },
  diary: {
    date: REFERENCE_DATE,
    text: "Entrada de diario sintética.",
    log: [{ date: "2026-11-09", xp: 15 }, { date: REFERENCE_DATE, xp: 15 }]
  },
  activity: {
    "2026-11-05": { n: 5, by: { vida: 3, daily: 2 } },
    [REFERENCE_DATE]: { n: 2, by: { daily: 1, jobs: 1 } }
  },
  freezers: 1,
  applications: [],
  focus: {
    log: [
      { d: "carrera", xp: 25, date: "2026-11-06", t: 1762400000000 },
      { d: "estudio", xp: 25, date: "2026-11-07", t: 1762486400000 }
    ],
    date: "2026-11-07"
  },
  hunt: {
    created: "2026-10-01",
    quota: 5,
    quickShots: 3,
    radarChecks: { date: REFERENCE_DATE, done: [1, 2, 3] },
    applications: [
      {
        id: "app_1", company: "Empresa Sintética S.A.", role: "Analista de Datos",
        link: "https://example.com/job/1", channel: "Portal", industry: "Tecnología",
        date: "2026-11-01", status: "enviada", nextAction: "2026-11-08",
        notes: "Nota sintética", match: 80, adapted: true, letter: true,
        project: false, outside: false, respondedFast: true, xp: 45, coins: 2,
        ts: 1762000000000, followupDone: false, vacancyId: null, quick: false, targetId: null
      }
    ],
    vacancies: [
      {
        id: "vac_1", company: "Otra Empresa Sintética", role: "BI Analyst",
        link: "https://example.com/job/2", industry: "Finanzas", match: 70,
        date: "2026-11-02", status: "radar", notes: "", appId: null
      }
    ],
    forge: { vac_1: { keywords: true, project: false, letter: true } },
    followups: [{ id: "fu_1", appId: "app_1", date: "2026-11-08" }],
    missions: {
      daily: { date: REFERENCE_DATE, done: ["d_quota"] },
      weekly: { week: WEEK, done: [] }
    },
    log: [
      { key: "v2shot:shot_1", id: "shot_1", shotId: "shot_1", appId: null, kind: "shot", date: "2026-11-03", xp: 35, coins: 1, title: "Disparo sintético" },
      { key: "mission:d_quota:" + REFERENCE_DATE, id: "d_quota", shotId: null, appId: null, kind: "mission", date: REFERENCE_DATE, xp: 60, coins: 3, title: "Misión sintética" }
    ],
    manual: [],
    streak: 2,
    bestStreak: 3,
    lastPost: REFERENCE_DATE,
    combo: 2,
    comboDate: REFERENCE_DATE,
    quotaBonusDate: null,
    regenCount: 0,
    boss: { favorites: [], custom: [], history: [], failed: [] },
    settings: { fx: true, vibrate: true },
    surprise: { date: REFERENCE_DATE, type: "golden", done: false },
    v2: {
      legacyShots: 0,
      shots: [
        {
          id: "shot_1", ts: 1762000000000, date: "2026-11-03", mission: "d_quota",
          platform: "linkedin", xp: 35, coins: 1, crit: false, combo: 1, damage: 10
        }
      ],
      platform: "linkedin",
      chain: { lastDay: "2026-11-03", days: 2, best: 3 },
      lastUndo: {
        shotId: "shot_1",
        prevActivity: { "2026-11-03": { n: 1, by: { hunt: 1 } } },
        prevStreak: 2,
        prevLastDailyDate: "2026-11-02",
        prevShieldWeek: "",
        prevUnlockedAch: ["ach_first"],
        prevChain: { lastDay: "2026-11-02", days: 1, best: 2 },
        prevFreezers: 0
      }
    }
  },
  saveVersion: 3,
  eventRL: {
    log: [
      { id: "ev_sint_1", d: "2026-11-01", xp: 20, coins: 2 },
      { id: "ev_sint_2", d: "2026-11-02", xp: 40, coins: 3 }
    ]
  },
  farm: { log: [{ d: "2026-11-08", c: 4 }, { d: "2026-11-09", c: 2 }] },
  canje: {
    custom: [{ id: "cx_sint_1", ico: "🎁", n: "Recompensa sintética", price: 30, custom: true }],
    log: [{ id: "lr_movie", n: "Noche de película", ico: "🍿", price: 30, d: "2026-11-09", done: false }]
  },
  xpBreakdown: {},
  totalXP: 0,
  campaignLevel: 1,
  level: 1,
  odeLevel: 1,
  stats: {
    domains: [
      { id: "carrera", n: "Carrera", s: "Carrera", ico: "💼", c: "#ffaa00", xp: 480, pct: 12, lvl: 1 },
      { id: "estudio", n: "Estudio", s: "Estudio", ico: "📚", c: "#00ff88", xp: 760, pct: 9, lvl: 1 },
      { id: "proyectos", n: "Proyectos", s: "Proyectos", ico: "🛠️", c: "#00ccff", xp: 510, pct: 7, lvl: 1 },
      { id: "negocio", n: "Puente", s: "Puente", ico: "🌉", c: "#7c6cff", xp: 300, pct: 4, lvl: 1 },
      { id: "cuerpo", n: "Cuerpo", s: "Cuerpo", ico: "🧬", c: "#ff00ff", xp: 1015, pct: 8, lvl: 1 },
      { id: "capital", n: "Capital", s: "Capital", ico: "💰", c: "#ffd700", xp: 480, pct: 3, lvl: 1 }
    ]
  }
};

const keys = {
  odea_academia_v1: {
    v: 1,
    hechas: { "ina-ia": "2026-10-25", "li-vitrina": "2026-10-27", "cv-final": "2026-10-30" },
    rutasAvisadas: []
  },
  odea_jefe_v1: {
    v: 1, semana: "2026-11-09", xpInicio: 1200, mejorSemana: "2026-10-26",
    mejorGanancia: 900, semanas: 1, victorias: 0, victoriaEn: ""
  },
  odea_empleo_v2: 1,
  odea_anomalia_v1: {
    ultimaCarta: REFERENCE_DATE, tipo: "trivia", progreso: 1, reclamada: true,
    fragmentos: 2, fragmentosVida: 3, pulsoHasta: null
  },
  odea_quiz_v1: {
    v: 1, fecha: "2026-11-06", seleccion: [3, 9, 15], respuestas: [true, false, true],
    aciertos: 2, respondidas: 3, dias: 4, racha: 1, ultimaJugada: "2026-11-06"
  },
  odea_tesoro_v1: {
    v: 1, monedas: 120, xpUltimo: 0, dia: REFERENCE_DATE, xpInicioDia: 0,
    racha: 1, mejorRacha: 2, escudos: 0, escudoUsadoEn: "",
    propios: ["tema-synthwave", "tema-aurora", "marco", "titulo"],
    tema: "", marco: true, titulo: true,
    sinergias: { "academia:2026-11-10": 2, "anomalia:2026-11-10": 3 },
    reclamos: ["ruta-2026-11-09"]
  },
  odea_sagas_v1: {
    v: 1,
    chapters: { "video-1": "2026-11-04", "video-2": "2026-11-06" },
    videos: { count: 0, log: [] },
    weekly: { week: WEEK, done: true }
  },
  odea_events: [
    { t: 1762400000000, tipo: "mission.completed", d: { id: "1A", source: "daily", xp: 60 }, id: "0-mission.completed" },
    { t: 1762486400000, tipo: "coins.spent", d: { id: "hl_iron", price: 130 }, id: "1-coins.spent" }
  ],
  odea_garaje_v1: {
    v: 1,
    km: { carro: 84500, moto: 3200 },
    misiones: [
      { id: "c-lavar", vehiculo: "carro", nombre: "Lavar el carro", dias: 7, ultima: "2026-11-09", base: true },
      { id: "c-llantas", vehiculo: "carro", nombre: "Revisar presión de llantas", dias: 14, ultima: "", base: true },
      { id: "m-lavar", vehiculo: "moto", nombre: "Lavar la moto", dias: 7, ultima: "2026-11-09", base: true }
    ],
    accesorios: []
  },
  odea_juice_v1: { muted: false },
  odea_hub_v1: {
    v: 1, rutaFecha: "2026-11-09",
    pendientes: [{ id: "ruta-2026-11-09", monedas: 15, tipo: "ruta", fecha: "2026-11-09" }]
  }
};

const bundle = { _format: "odea_bundle_v2", appVersion: "5.99", save, keys };

/* Derivados: se calculan desde las fuentes con el oráculo. */
const d = derive(sourcesFromLegacy(bundle), catalog, REFERENCE_DATE);
save.xpBreakdown = d.xpBreakdown;
save.totalXP = d.totalXP;
save.campaignLevel = d.campaignLevel;
save.level = d.level;
save.odeLevel = d.odeLevel;

fs.writeFileSync(join(root, "fixtures", "odea-progreso-sintetico.json"), JSON.stringify(bundle, null, 2) + "\n", "utf8");
console.log("Fixture sintético escrito. Campos save:", Object.keys(save).length, "| keys:", Object.keys(keys).length);
console.log("XP derivado:", JSON.stringify(d.xpBreakdown), "total", d.totalXP);
