#!/usr/bin/env node
/**
 * extract-catalog.mjs
 * ---------------------------------------------------------------------------
 * Extrae de ODEA 1 (v5.99) los CATÁLOGOS ESTÁTICOS de juego necesarios para
 * re-derivar XP y monedas con paridad exacta durante la migración a ODEA 2.
 *
 * IMPORTANTE: este script NO lee, escribe ni necesita el archivo de progreso
 * del usuario. Solo consume código fuente público de ODEA 1:
 *   - odea.html        (constantes de datos + XP)
 *   - flujos_odea.js   (FL_MISSIONS / FL_CHAPTERS)
 *
 * Uso:
 *   node tools/extract-catalog.mjs <ruta/odea.html> <ruta/flujos_odea.js> [salida.json]
 *
 * El resultado (data/xp-catalog.json) es data de juego, no progreso personal.
 * ---------------------------------------------------------------------------
 */
import fs from "node:fs";
import vm from "node:vm";
import crypto from "node:crypto";

const [, , htmlPath, flujosPath, outPath = "data/xp-catalog.json"] = process.argv;
if (!htmlPath || !flujosPath) {
  console.error("Uso: node tools/extract-catalog.mjs <odea.html> <flujos_odea.js> [salida.json]");
  process.exit(2);
}

const html = fs.readFileSync(htmlPath, "utf8");
const flujos = fs.readFileSync(flujosPath, "utf8");

/** Devuelve el texto de la expresión de `const NAME = <expr>;` (nivel 0). */
function declarationExpr(src, name, originLabel) {
  const re = new RegExp(`\\b(?:const|let|var)\\s+${name}\\s*=`);
  const m = re.exec(src);
  if (!m) throw new Error(`No se encontró la declaración de ${name} en ${originLabel}`);
  let i = m.index + m[0].length;
  const start = i;
  let depth = 0;
  let quote = null;
  for (; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === "\\") { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      const nl = src.indexOf("\n", i);
      i = nl < 0 ? src.length : nl;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end < 0 ? src.length : end + 1;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "[" || c === "{" || c === "(") { depth++; continue; }
    if (c === "]" || c === "}" || c === ")") { depth--; continue; }
    if (c === ";" && depth === 0) return src.slice(start, i).trim();
  }
  throw new Error(`Declaración sin cierre: ${name}`);
}

function evalDecl(src, name, label, globals = {}) {
  const expr = declarationExpr(src, name, label);
  try {
    return vm.runInNewContext(`(${expr})`, Object.assign(Object.create(null), globals), { timeout: 2000 });
  } catch (e) {
    throw new Error(`No se pudo evaluar ${name} (${label}): ${e.message}`);
  }
}

function keyByXp(list) {
  const out = {};
  for (const item of list) out[String(item.id)] = Number(item.xp) || 0;
  return out;
}

function sha256(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

/* --- Campaña (Taller de Flujos) --- */
const FL_MISSIONS = evalDecl(flujos, "FL_MISSIONS", "flujos_odea.js");
const FL_CHAPTERS = evalDecl(flujos, "FL_CHAPTERS", "flujos_odea.js");
const FL_BOSS_IDS = FL_CHAPTERS.map((ch) => {
  const list = FL_MISSIONS.filter((m) => m.cap === ch.cap);
  return list.length ? list[list.length - 1].id : null;
}).filter(Boolean);

/* --- Resto de catálogos inline en odea.html --- */
const dailyMissions = evalDecl(html, "dailyMissions", "odea.html");
const weeklyMissions = evalDecl(html, "weeklyMissions", "odea.html");
const employmentMissions = evalDecl(html, "employmentMissions", "odea.html");
const PUENTE_MISSIONS = evalDecl(html, "PUENTE_MISSIONS", "odea.html");
const B2B_LEGACY_XP = evalDecl(html, "B2B_LEGACY_XP", "odea.html");
const achievements = evalDecl(html, "achievements", "odea.html");

const CAP_MISSIONS = evalDecl(html, "CAP_MISSIONS", "odea.html");
const ENG_MISSIONS = evalDecl(html, "ENG_MISSIONS", "odea.html");
const AI_MISSIONS = evalDecl(html, "AI_MISSIONS", "odea.html");

const HABITOS = evalDecl(html, "HABITOS", "odea.html");
const VIDA_GROWTH = evalDecl(html, "VIDA_GROWTH", "odea.html");
const KID_DAILY = evalDecl(html, "KID_DAILY", "odea.html");
const KID_WEEK = evalDecl(html, "KID_WEEK", "odea.html");
const KID_HITS = evalDecl(html, "KID_HITS", "odea.html");
const KID_LEARN = evalDecl(html, "KID_LEARN", "odea.html");
const KID_FUN = evalDecl(html, "KID_FUN", "odea.html");
const CPL_WEEK = evalDecl(html, "CPL_WEEK", "odea.html");
const CPL_GOALS = evalDecl(html, "CPL_GOALS", "odea.html");
const RETOS = evalDecl(html, "RETOS", "odea.html");
const POW_WEEK = evalDecl(html, "POW_WEEK", "odea.html");
const POW_HITS = evalDecl(html, "POW_HITS", "odea.html");
const MEN_WEEK = evalDecl(html, "MEN_WEEK", "odea.html");
const MEN_HITS = evalDecl(html, "MEN_HITS", "odea.html");
const PLAN_WEEK = evalDecl(html, "PLAN_WEEK", "odea.html");
const PLAN_HITS = evalDecl(html, "PLAN_HITS", "odea.html");
const ORDEN_DAILY = evalDecl(html, "ORDEN_DAILY", "odea.html");
const ORDEN_WEEK = evalDecl(html, "ORDEN_WEEK", "odea.html");
const ORDEN_HITS = evalDecl(html, "ORDEN_HITS", "odea.html");

const GOD_BOSSES = evalDecl(html, "GOD_BOSSES", "odea.html");
const TITAN_BOSSES = evalDecl(html, "TITAN_BOSSES", "odea.html");
const VIDA_BOSSES = evalDecl(html, "VIDA_BOSSES", "odea.html");

const SAGAS = evalDecl(html, "SAGAS", "odea.html");
/* ODE_LADDER es un IIFE que usa constantes de nivel definidas justo antes. */
const ODE_LADDER = evalDecl(html, "ODE_LADDER", "odea.html", {
  LEVELS: new Array(9).fill(0),
  ODE_MAX_LEVEL: 63,
  ODE_MAX_XP: 120000,
  ODE_CURVE: 1.75
});

/* --- Índice de vida: id -> { xp, cat, p? } (misma construcción que ODEA 1) --- */
const VIDA_OBJ = {};
HABITOS.forEach((o) => { VIDA_OBJ[o.id] = { xp: o.xp, cat: "eq", kind: "daily", p: o.p }; });
VIDA_GROWTH.forEach((o) => { VIDA_OBJ[o.id] = { xp: o.xp, cat: "eq", kind: "one" }; });
KID_DAILY.forEach((o) => { VIDA_OBJ[o.id] = { xp: o.xp, cat: "kid", kind: "daily" }; });
KID_WEEK.forEach((o) => { VIDA_OBJ[o.id] = { xp: o.xp, cat: "kid", kind: "weekly" }; });
KID_HITS.forEach((o) => { VIDA_OBJ[o.id] = { xp: o.xp, cat: "kid", kind: "one" }; });
KID_LEARN.forEach((o) => { VIDA_OBJ[o.id] = { xp: o.xp, cat: "kid", kind: "weekly" }; });
KID_FUN.forEach((o) => { VIDA_OBJ[o.id] = { xp: o.xp, cat: "kid", kind: "weekly" }; });
CPL_WEEK.forEach((o) => { VIDA_OBJ[o.id] = { xp: o.xp, cat: "cpl", kind: "weekly" }; });
CPL_GOALS.forEach((o) => { VIDA_OBJ[o.id] = { xp: o.xp, cat: "cpl", kind: "one" }; });
RETOS.forEach((o) => { VIDA_OBJ[o.id] = { xp: o.xp, cat: "eq", kind: "daily" }; });
POW_WEEK.forEach((o) => { VIDA_OBJ[o.id] = { xp: o.xp, cat: "pow", kind: "weekly" }; });
POW_HITS.forEach((o) => { VIDA_OBJ[o.id] = { xp: o.xp, cat: "pow", kind: "one" }; });
MEN_WEEK.forEach((o) => { VIDA_OBJ[o.id] = { xp: o.xp, cat: "men", kind: "weekly" }; });
MEN_HITS.forEach((o) => { VIDA_OBJ[o.id] = { xp: o.xp, cat: "men", kind: "one" }; });
PLAN_WEEK.forEach((o) => { VIDA_OBJ[o.id] = { xp: o.xp, cat: "plan", kind: "weekly" }; });
PLAN_HITS.forEach((o) => { VIDA_OBJ[o.id] = { xp: o.xp, cat: "plan", kind: "one" }; });
ORDEN_DAILY.forEach((o) => { VIDA_OBJ[o.id] = { xp: o.xp, cat: "orden", kind: "daily" }; });
ORDEN_WEEK.forEach((o) => { VIDA_OBJ[o.id] = { xp: o.xp, cat: "orden", kind: "weekly" }; });
ORDEN_HITS.forEach((o) => { VIDA_OBJ[o.id] = { xp: o.xp, cat: "orden", kind: "one" }; });

const catalog = {
  meta: {
    source: "ODEA 1",
    appVersion: "5.99",
    generatedAt: new Date().toISOString(),
    sourceFiles: {
      "odea.html": { sha256: sha256(html) },
      "flujos_odea.js": { sha256: sha256(flujos) }
    },
    note: "Catálogos estáticos de juego. No contiene progreso de usuario."
  },
  campaign: keyByXp(FL_MISSIONS),
  campaignBossIds: FL_BOSS_IDS,
  daily: Object.fromEntries(dailyMissions.map((m) => [m.id, { xp: Number(m.xp) || 0, day: m.day, slot: m.slot }])),
  dailyTotalDays: new Set(dailyMissions.map((m) => m.day)).size,
  weekly: Object.fromEntries(weeklyMissions.map((m) => [String(m.week), Number(m.xp) || 0])),
  jobs: keyByXp(employmentMissions),
  b2b: B2B_LEGACY_XP,
  puente: keyByXp(PUENTE_MISSIONS),
  achievements: keyByXp(achievements),
  capital: {
    done: keyByXp(CAP_MISSIONS),
    eng: keyByXp(ENG_MISSIONS),
    ai: keyByXp(AI_MISSIONS)
  },
  vida: VIDA_OBJ,
  bosses: Object.fromEntries(
    [...GOD_BOSSES, ...TITAN_BOSSES, ...VIDA_BOSSES].map((b) => [String(b.id), Number(b.xp) || 0])
  ),
  sagas: SAGAS.map((s) => ({
    id: s.id,
    split: s.split || {},
    chapters: s.chapters.map((c) => ({ id: c.id, xp: Number(c.xp) || 0 }))
  })),
  sagaWeeklyXp: 150,
  odeLadder: ODE_LADDER.map((l) => ({ xp: l.xp, n: l.n })),
  counters: {
    campaign: FL_MISSIONS.length,
    daily: dailyMissions.length,
    weekly: weeklyMissions.length,
    jobs: employmentMissions.length,
    puente: PUENTE_MISSIONS.length,
    achievements: achievements.length,
    capital: CAP_MISSIONS.length + ENG_MISSIONS.length + AI_MISSIONS.length,
    vida: Object.keys(VIDA_OBJ).length,
    bosses: GOD_BOSSES.length + TITAN_BOSSES.length + VIDA_BOSSES.length,
    sagas: SAGAS.length
  }
};

fs.mkdirSync(outPath.replace(/[\\/][^\\/]+$/, ""), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(catalog, null, 2) + "\n", "utf8");
console.log(`Catálogo escrito en ${outPath}`);
console.log(`  campaña=${catalog.counters.campaign} diarias=${catalog.counters.daily} semanales=${catalog.counters.weekly}`);
console.log(`  trabajos=${catalog.counters.jobs} logros=${catalog.counters.achievements} capital=${catalog.counters.capital}`);
console.log(`  vida=${catalog.counters.vida} jefes=${catalog.counters.bosses} sagas=${catalog.counters.sagas}`);
