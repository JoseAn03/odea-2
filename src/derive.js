/**
 * derive.js — Oráculo de derivación de ODEA 1 v5.99
 * ---------------------------------------------------------------------------
 * Port FIEL de las funciones de XP/monedas de ODEA 1 v5.99, usado SOLO para
 * validar la migración en Fase 0. No es UI ni lógica de juego nueva.
 *
 * Fuente de verdad:
 *   recomputeState()      odea.html v5.99, líneas ~5153-5172
 *   coinsEarned()         odea.html v5.99, líneas ~12160-12174
 *   vidaCompute()         odea.html v5.99, líneas ~9373-9428
 *   sagaAreaXP()          odea.html v5.99, líneas ~4667-4679
 *   farmXPGain()/coins    odea.html v5.99, líneas ~12363-12368
 *   capFrontCompute()     odea.html v5.99, líneas ~9791-9810
 *
 * El XP es DERIVADO: se recalcula desde las fuentes (misiones, logs, etc.).
 * Por eso la migración debe preservar FUENTES, no solo los totales.
 */

export const BALANCE_BONUS = 30;
export const FARM_XP_PER = 2;
export const FARM_PER_COIN = 4;
export const FARM_DAY_CAP = 40;
export const SAGA_WEEKLY_XP = 150;
const STREAK_MIN_MISSIONS = 5;

/* --- Fechas (réplica de ODEA 1) --- */
export function isoWeekKey(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const t = new Date(d.getTime());
  t.setHours(0, 0, 0, 0);
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
  const w1 = new Date(t.getFullYear(), 0, 4);
  const wk = 1 + Math.round(((t - w1) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7);
  return t.getFullYear() + "-W" + String(wk).padStart(2, "0");
}

export function streakMult(streak) {
  const s = Number(streak) || 0;
  if (s >= 30) return 2;
  if (s >= 14) return 1.5;
  if (s >= 7) return 1.25;
  if (s >= 3) return 1.1;
  return 1;
}

/* --- Normalización de fuentes (legacy ODEA 1) --- */
export function sourcesFromLegacy(bundle) {
  const s = bundle.save || {};
  return {
    identity: { streak: s.streak || 0 },
    progress: {
      completedMissions: clone(s.completedMissions || []),
      completedDaily: clone(s.completedDaily || []),
      completedWeekly: clone(s.completedWeekly || []),
      completedJobs: clone(s.completedJobs || []),
      completedB2b: clone(s.completedB2b || []),
      completedPuente: clone(s.completedPuente || []),
      unlockedAch: clone(s.unlockedAch || [])
    },
    vida: clone(s.vida || {}),
    capital: clone(s.capital || {}),
    gods: clone(s.gods || {}),
    focus: clone(s.focus || { log: [] }),
    diary: clone(s.diary || { log: [] }),
    hunt: clone(s.hunt || { log: [] }),
    credits: {
      eventRL: clone(s.eventRL || { log: [] }),
      farm: clone(s.farm || { log: [] })
    },
    shop: clone(s.shop || { spent: 0 }),
    sagas: clone((bundle.keys && bundle.keys.odea_sagas_v1) || { chapters: {}, weekly: { done: false } })
  };
}

/* --- Normalización de fuentes (ODE A2 v1) --- */
export function sourcesFromMigrated(bundle2) {
  const s = bundle2.core || {};
  return {
    identity: { streak: s.identity && s.identity.streak || 0 },
    progress: {
      completedMissions: clone(s.progress && s.progress.completedMissions || []),
      completedDaily: clone(s.progress && s.progress.completedDaily || []),
      completedWeekly: clone(s.progress && s.progress.completedWeekly || []),
      completedJobs: clone(s.progress && s.progress.completedJobs || []),
      completedB2b: clone(s.progress && s.progress.completedB2b || []),
      completedPuente: clone(s.progress && s.progress.completedPuente || []),
      unlockedAch: clone(s.progress && s.progress.unlockedAch || [])
    },
    vida: clone(s.vida || {}),
    capital: clone(s.capital || {}),
    gods: clone(s.gods || {}),
    focus: clone(s.focus || { log: [] }),
    diary: clone(s.diary || { log: [] }),
    hunt: clone(s.hunt || { log: [] }),
    credits: {
      eventRL: clone(s.credits && s.credits.eventRL || { log: [] }),
      farm: clone(s.credits && s.credits.farm || { log: [] })
    },
    shop: clone(s.shop || { spent: 0 }),
    sagas: clone((bundle2.worlds && bundle2.worlds.sagas && bundle2.worlds.sagas.data) || { chapters: {}, weekly: { done: false } })
  };
}

/* --- Componentes de XP --- */
function sumXpForIds(map, ids) {
  return (ids || []).reduce((acc, id) => acc + (Number(map[String(id)]) || 0), 0);
}

function sagaAreaXP(sagas, cat) {
  if (cat !== "kid" && cat !== "pow") return 0;
  const state = sagas || {};
  const chapterState = state.chapters || {};
  let total = 0;
  for (const saga of CATALOG_SAGAS_HOLDER.current) {
    const share = (saga.split && saga.split[cat]) || 0;
    if (!share) continue;
    for (const ch of saga.chapters) {
      if (chapterState[ch.id]) total += Math.round(ch.xp * share);
    }
  }
  const today = CATALOG_SAGAS_HOLDER.referenceDate;
  const weekly = state.weekly || {};
  if (weekly.done && weekly.week === isoWeekKey(today)) total += Math.round(SAGA_WEEKLY_XP / 2);
  return total;
}

/* Holder para no pasar el catálogo por cada helper. Se fija por derive(). */
const CATALOG_SAGAS_HOLDER = { current: [], referenceDate: "1970-01-01" };

export function vidaCompute(sources) {
  const gv = sources.vida || {};
  const log = Array.isArray(gv.log) ? gv.log : [];
  const catalog = CATALOG_SAGAS_HOLDER.catalog;
  const habitDates = {};
  const dayPilars = {};
  const xp = { eq: 0, kid: 0, cpl: 0, pow: 0, men: 0, plan: 0, orden: 0 };

  for (const entry of log) {
    if (typeof entry !== "string") continue;
    const i = entry.indexOf("|");
    if (i <= 0) continue;
    const id = entry.slice(0, i);
    const key = entry.slice(i + 1);
    const o = catalog.vida[id];
    if (!o) continue;
    xp[o.cat] += o.xp;
    if (id.indexOf("hab-") === 0) {
      (habitDates[id] = habitDates[id] || new Set()).add(key);
      (dayPilars[key] = dayPilars[key] || new Set()).add(o.p);
    }
  }

  const balanceDates = new Set();
  for (const k of Object.keys(dayPilars)) {
    if (dayPilars[k].size === 3) balanceDates.add(k);
  }
  xp.eq += balanceDates.size * BALANCE_BONUS;

  for (const list of ["growth", "kid", "couple", "pow", "men", "plan", "orden"]) {
    for (const id of (Array.isArray(gv[list]) ? gv[list] : [])) {
      const o = catalog.vida[id];
      if (o) xp[o.cat] += o.xp;
    }
  }

  xp.kid += sagaAreaXP(sources.sagas, "kid");
  xp.pow += sagaAreaXP(sources.sagas, "pow");

  const total = xp.eq + xp.kid + xp.cpl + xp.pow + xp.men + xp.plan + xp.orden;
  return { xp, total };
}

export function farmByDay(farm) {
  const m = {};
  for (const e of ((farm && farm.log) || [])) {
    if (e && e.d) m[e.d] = (m[e.d] || 0) + (Number(e.c) || 0);
  }
  return m;
}

export function farmCounted(farm) {
  const m = farmByDay(farm);
  let c = 0;
  for (const d of Object.keys(m)) c += Math.min(m[d], FARM_DAY_CAP);
  return c;
}

export function farmXPGain(farm) { return farmCounted(farm) * FARM_XP_PER; }

export function farmCoinsEarned(farm) {
  const m = farmByDay(farm);
  let n = 0;
  for (const d of Object.keys(m)) n += Math.floor(Math.min(m[d], FARM_DAY_CAP) / FARM_PER_COIN);
  return n;
}

export function sagaCoinsEarned(sagas, catalog, referenceDate) {
  const state = sagas || {};
  const chapters = state.chapters || {};
  let coins = 0;
  for (const saga of catalog.sagas) {
    const done = saga.chapters.filter((c) => chapters[c.id]).length;
    coins += done + (done === saga.chapters.length ? 5 : 0);
  }
  const weekly = state.weekly || {};
  if (weekly.done && weekly.week === isoWeekKey(referenceDate)) coins += 1;
  return coins;
}

export function fullDaysCount(progress, catalog) {
  const done = new Set(progress.completedDaily || []);
  const byDay = {};
  for (const [id, m] of Object.entries(catalog.daily)) {
    (byDay[m.day] = byDay[m.day] || []).push(id);
  }
  let n = 0;
  for (const day of Object.keys(byDay)) {
    if (byDay[day].every((id) => done.has(id))) n++;
  }
  return n;
}

export function odeLevelFor(totalXP, catalog) {
  let lvl = 1;
  for (let i = 0; i < catalog.odeLadder.length; i++) {
    if (totalXP >= catalog.odeLadder[i].xp) lvl = i + 1;
  }
  return lvl;
}

/**
 * Deriva XP y monedas desde las fuentes.
 * @param {object} sources  salida de sourcesFromLegacy / sourcesFromMigrated
 * @param {object} catalog  data/xp-catalog.json
 * @param {string} referenceDate  fecha de referencia (export/migración) para
 *                                componentes dependientes del calendario.
 */
export function derive(sources, catalog, referenceDate) {
  CATALOG_SAGAS_HOLDER.current = catalog.sagas;
  CATALOG_SAGAS_HOLDER.referenceDate = referenceDate;
  CATALOG_SAGAS_HOLDER.catalog = catalog;

  const p = sources.progress;
  const campaign = sumXpForIds(catalog.campaign, p.completedMissions);
  const dailyRaw = sumXpForIds(
    Object.fromEntries(Object.entries(catalog.daily).map(([id, m]) => [id, m.xp])),
    p.completedDaily
  );
  const daily = Math.round(dailyRaw * streakMult(sources.identity.streak));
  const weekly = sumXpForIds(catalog.weekly, (p.completedWeekly || []).map(String));
  const jobs = sumXpForIds(catalog.jobs, p.completedJobs);
  const b2b = sumXpForIds(catalog.b2b, p.completedB2b) + sumXpForIds(catalog.puente, p.completedPuente);
  const career = campaign + daily + weekly + jobs + b2b;

  const ach = sumXpForIds(catalog.achievements, p.unlockedAch);
  const vida = vidaCompute(sources).total;
  const capital =
    sumXpForIds(catalog.capital.done, sources.capital.done) +
    sumXpForIds(catalog.capital.eng, sources.capital.eng) +
    sumXpForIds(catalog.capital.ai, sources.capital.ai);
  const focus = ((sources.focus && sources.focus.log) || []).reduce((a, e) => a + (Number(e && e.xp) || 0), 0);
  const diary = ((sources.diary && sources.diary.log) || []).reduce((a, e) => a + (Number(e && e.xp) || 0), 0);
  const bosses = Object.keys(sources.gods || {}).reduce((a, id) => a + (Number(catalog.bosses[id]) || 0), 0);
  const hunt = ((sources.hunt && sources.hunt.log) || []).reduce((a, e) => a + Math.max(0, Number(e && e.xp) || 0), 0);
  const evento = ((sources.credits.eventRL && sources.credits.eventRL.log) || [])
    .reduce((a, e) => a + Math.max(0, Number(e && e.xp) || 0), 0);
  const farm = farmXPGain(sources.credits.farm);

  const xpBreakdown = { career, ach, vida, capital, focus, diary, bosses, hunt, evento, farm };
  const totalXP = career + ach + vida + capital + focus + diary + bosses + hunt + evento + farm;

  const fullDays = fullDaysCount(p, catalog);
  const campaignLevel = Math.min(fullDays + 1, catalog.dailyTotalDays + 1);
  const odeLevel = odeLevelFor(totalXP, catalog);

  /* --- Monedas --- */
  const capitalCount = ["done", "eng", "ai"].reduce(
    (a, k) => a + (Array.isArray(sources.capital[k]) ? sources.capital[k].length : 0), 0
  );
  const coinsEarned =
    p.completedDaily.length + p.completedMissions.length + p.completedWeekly.length +
    p.completedJobs.length + p.completedB2b.length + p.completedPuente.length +
    ((sources.vida && sources.vida.log) ? sources.vida.log.length : 0) +
    capitalCount +
    sagaCoinsEarned(sources.sagas, catalog, referenceDate) +
    ((sources.hunt && sources.hunt.log || []).reduce((a, e) => a + Math.max(0, Number(e.coins) || 0), 0)) +
    ((sources.credits.eventRL && sources.credits.eventRL.log || []).reduce((a, e) => a + Math.max(0, Number(e.coins) || 0), 0)) +
    farmCoinsEarned(sources.credits.farm) +
    (Object.keys(sources.gods || {}).length * 50);
  const spent = Number((sources.shop && sources.shop.spent) || 0) || 0;
  const balance = Math.max(0, coinsEarned - spent);

  return {
    xpBreakdown,
    totalXP,
    campaignLevel,
    level: campaignLevel,
    odeLevel,
    coins: { earned: coinsEarned, spent, balance },
    meta: { fullDays, streakMult: streakMult(sources.identity.streak), referenceDate }
  };
}

export function clone(v) {
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}
