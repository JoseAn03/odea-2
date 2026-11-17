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

import { campaignRewards } from "./campaign-state.js";

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

/* --- Fechas locales de juego (Fase 3) -------------------------------------
 * La fecha de juego es la del DISPOSITIVO, en componentes locales. Nunca se
 * usa toISOString().slice(0,10), que puede cruzar de día por UTC.
 */

export function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function epochDayOf(dateKey) {
  const [y, m, d] = String(dateKey).split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

export function addDays(dateKey, days) {
  const date = new Date(epochDayOf(dateKey) * 86400000 + days * 86400000);
  return localDateKeyUTC(date);
}

function localDateKeyUTC(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate()
  ).padStart(2, "0")}`;
}

export function streakMult(streak) {
  const s = Number(streak) || 0;
  if (s >= 30) return 2;
  if (s >= 14) return 1.5;
  if (s >= 7) return 1.25;
  if (s >= 3) return 1.1;
  return 1;
}

/* --- Racha derivada de fechas (Fase 3, decisión 2026-11-15) ---------------
 * La racha NUNCA se guarda como contador. Se calcula de las fechas activas:
 *   - `core.activity` migrada (días con `by.daily >= 1`),
 *   - completaciones de Hub,
 *   - check-ins.
 * La racha migrada (`core.identity.streak`, anclada a `lastDailyDate` por D3)
 * es la línea base: el primer día en ODEA 2 no la reinicia salvo hueco real.
 *
 * Sin actividad de Hub ni check-ins devuelve la base tal cual: así la
 * migración y los bundles de Fase 2 derivan exactamente igual.
 */
export function deriveStreak(bundle2) {
  const core = (bundle2 && bundle2.core) || {};
  const identity = core.identity || {};
  const baseline = Number(identity.streak) || 0;
  const baselineDate = identity.lastDailyDate || null;
  const play = (bundle2 && bundle2.play) || {};
  const completions = play.completions || {};
  const checkins = play.checkins || {};

  const active = new Set();
  for (const record of Object.values(completions)) {
    if (record && record.system === "hub" && isDateKey(record.date)) active.add(record.date);
  }
  for (const date of Object.keys(checkins)) {
    if (isDateKey(date)) active.add(date);
  }

  if (!active.size) {
    return { streak: baseline, streakDate: baselineDate, baseline, baselineDate, days: [] };
  }

  const activity = core.activity || {};
  for (const [date, value] of Object.entries(activity)) {
    const dailyCount = value && value.by ? Number(value.by.daily) || 0 : 0;
    if (dailyCount >= 1 && isDateKey(date)) active.add(date);
  }

  const days = Array.from(active).sort();

  if (!baselineDate) {
    return { streak: days.length, streakDate: days[days.length - 1] || null, baseline, baselineDate, days };
  }

  const posterior = days.filter((date) => date > baselineDate);
  if (!posterior.length) {
    return { streak: baseline, streakDate: baselineDate, baseline, baselineDate, days };
  }

  /* Última cadena consecutiva: la que termina en streakDate. */
  let chainStart = posterior[posterior.length - 1];
  let chainLength = 1;
  for (let i = posterior.length - 2; i >= 0; i--) {
    if (addDays(posterior[i], 1) === chainStart) {
      chainStart = posterior[i];
      chainLength += 1;
    } else {
      break;
    }
  }

  const encadenada = chainStart === addDays(baselineDate, 1);
  return {
    streak: encadenada ? baseline + chainLength : chainLength,
    streakDate: posterior[posterior.length - 1],
    baseline,
    baselineDate,
    days
  };
}

function isDateKey(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
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

/* --- Academia -------------------------------------------------------------
 * ODEA 1 no guarda un catálogo de actividades de Academia: guarda un mapa
 * `hechas` y calcula el avance con una regla fija (odea.html, cálculo de
 * `acPct`):
 *
 *     n = min(28, count(hechas))
 *     si n >= 28 → n = 29
 *     pct = round(n / 29 * 100)
 *
 * El 29 es el denominador REAL del juego, no una invención nuestra. Los ids y
 * el XP de cada actividad viven en `assets/odea-academia.js`, que no forma
 * parte del export: por eso Academia se muestra con paridad de avance pero
 * sigue sin ser jugable.
 */
export const ACADEMIA_TOTAL = 29;

export function academiaProgress(data) {
  const hechas =
    data && data.hechas && typeof data.hechas === "object" && !Array.isArray(data.hechas)
      ? data.hechas
      : {};
  const count = Object.keys(hechas).length;
  const effective = count >= 28 ? 29 : count;
  return {
    count,
    total: ACADEMIA_TOTAL,
    effective,
    pct: Math.round((effective / ACADEMIA_TOTAL) * 100)
  };
}

/* --- Normalización de fuentes (ODE A2 v1) --- */
export function sourcesFromMigrated(bundle2, catalog = null) {
  const s = bundle2.core || {};
  const extra = mergePlaySources(bundle2, catalog);
  const streakInfo = deriveStreak(bundle2);
  return {
    campaignRewards: campaignRewards(bundle2),
    identity: { streak: streakInfo.streak },
    progress: {
      completedMissions: clone(s.progress && s.progress.completedMissions || []),
      completedDaily: union(s.progress && s.progress.completedDaily, extra.daily),
      completedWeekly: union(s.progress && s.progress.completedWeekly, extra.weekly),
      completedJobs: union(s.progress && s.progress.completedJobs, extra.jobs),
      completedB2b: union(s.progress && s.progress.completedB2b, extra.b2b),
      completedPuente: union(s.progress && s.progress.completedPuente, extra.puente),
      unlockedAch: clone(s.progress && s.progress.unlockedAch || [])
    },
    vida: {
      ...clone(s.vida || {}),
      log: union(s.vida && s.vida.log, extra.vida),
      /* R1: XP congelado por entrada (`id|period`) y por id, para no releer
         el catálogo en ninguna de las dos rutas de Vida. */
      frozen: { ...extra.frozenVida },
      frozenById: { ...extra.frozenVidaById }
    },
    /* R1: XP congelado por missionId (hub, empleo, capital). */
    frozen: { ...extra.frozenXP },
    /* Capital: lo migrado y lo nuevo se unen con deduplicación, así que
       completar algo que ODEA 1 ya tenía nunca suma XP dos veces. */
    capital: {
      ...clone(s.capital || {}),
      done: union(s.capital && s.capital.done, extra.capital.done),
      eng: union(s.capital && s.capital.eng, extra.capital.eng),
      ai: union(s.capital && s.capital.ai, extra.capital.ai)
    },
    /* Jefes: los migrados están como `true` en el mapa; los nuevos se suman
       igual sin pisar el valor previo. */
    gods: { ...clone(s.gods || {}), ...trueMap(extra.gods) },
    focus: clone(s.focus || { log: [] }),
    diary: clone(s.diary || { log: [] }),
    hunt: clone(s.hunt || { log: [] }),
    credits: {
      eventRL: clone(s.credits && s.credits.eventRL || { log: [] }),
      farm: clone(s.credits && s.credits.farm || { log: [] })
    },
    shop: clone(s.shop || { spent: 0 }),
    /* Sagas: los capítulos migrados llevan fecha; los nuevos se registran con
       `true` porque `sagaAreaXP` solo mira la presencia de la clave. */
    sagas: (() => {
      const base = clone(
        (bundle2.worlds && bundle2.worlds.sagas && bundle2.worlds.sagas.data) || {
          chapters: {},
          weekly: { done: false }
        }
      );
      return { ...base, chapters: { ...clone(base.chapters || {}), ...trueMap(extra.sagas) } };
    })()
  };
}

function trueMap(ids) {
  const out = {};
  for (const id of ids || []) out[id] = true;
  return out;
}

function union(base, extra) {
  const out = clone(Array.isArray(base) ? base : []);
  for (const value of extra || []) {
    if (!out.includes(value)) out.push(value);
  }
  return out;
}

/**
 * Traduce `play.completions` a las fuentes que `derive()` ya entiende.
 * No muta el bundle: devuelve listas para unir en memoria.
 */
function mergePlaySources(bundle2, catalog) {
  const out = {
    daily: [],
    weekly: [],
    jobs: [],
    b2b: [],
    puente: [],
    vida: [],
    capital: { done: [], eng: [], ai: [] },
    sagas: [],
    gods: [],
    /* R1: valores congelados al escribir. Se usan EN LUGAR del catálogo para
       esas ocurrencias; el resto sigue leyendo el catálogo (compatibilidad). */
    frozenXP: {},
    frozenVida: {},
    frozenVidaById: {}
  };
  const play = bundle2 && bundle2.play;
  if (!play || !play.completions) return out;

  for (const record of Object.values(play.completions)) {
    if (!record || typeof record.missionId !== "string") continue;
    const id = record.missionId;
    const reward = record.reward && typeof record.reward === "object" ? record.reward : null;
    const frozenXP = reward && Number.isFinite(Number(reward.xp)) ? Number(reward.xp) : null;

    if (record.system === "hub") {
      if (catalog && catalog.weekly && hasId(catalog.weekly, id)) out.weekly.push(id);
      else out.daily.push(id);
      if (frozenXP != null) out.frozenXP[id] = frozenXP;
      continue;
    }
    if (record.system === "empleo") {
      if (catalog && catalog.b2b && hasId(catalog.b2b, id)) out.b2b.push(id);
      else if (catalog && catalog.puente && hasId(catalog.puente, id)) out.puente.push(id);
      else out.jobs.push(id);
      if (frozenXP != null) out.frozenXP[id] = frozenXP;
      continue;
    }
    if (record.system === "vida") {
      const entry = `${id}|${record.period || "once"}`;
      out.vida.push(entry);
      if (frozenXP != null) {
        out.frozenVida[entry] = { xp: frozenXP, cat: reward.cat ? String(reward.cat) : null };
        /* Vida también se lee por id en los arrays `growth`/`kid`/...: el mismo
           valor congelado tiene que mandar en las dos rutas. */
        out.frozenVidaById[id] = { xp: frozenXP, cat: reward.cat ? String(reward.cat) : null };
      }
      continue;
    }
    if (record.system === "capital" && catalog && catalog.capital) {
      if (hasId(catalog.capital.done, id)) out.capital.done.push(id);
      else if (hasId(catalog.capital.eng, id)) out.capital.eng.push(id);
      else if (hasId(catalog.capital.ai, id)) out.capital.ai.push(id);
      if (frozenXP != null) out.frozenXP[id] = frozenXP;
      continue;
    }
    if (record.system === "sagas") {
      /* Sagas mezcla capítulos y jefes: el catálogo de jefes es el que decide. */
      if (catalog && catalog.bosses && hasId(catalog.bosses, id)) out.gods.push(id);
      else out.sagas.push(id);
      /* R1: el XP del capítulo o del jefe también queda congelado. */
      if (frozenXP != null) out.frozenXP[id] = frozenXP;
    }
  }
  return out;
}

/**
 * Suma el XP de una lista de ids usando el valor CONGELADO cuando existe.
 * Es la pieza que hace que un cambio de catálogo no reescriba el pasado.
 */
function sumXpWithFrozen(map, ids, frozen) {
  return (ids || []).reduce((acc, rawId) => {
    const id = String(rawId);
    const frozenXP = frozen && Object.prototype.hasOwnProperty.call(frozen, id) ? frozen[id] : null;
    if (frozenXP != null) return acc + frozenXP;
    return acc + (Number(map && map[id]) || 0);
  }, 0);
}

function hasId(map, id) {
  return !!map && Object.prototype.hasOwnProperty.call(map, id);
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
      if (!chapterState[ch.id]) continue;
      /* R1: si el capítulo se completó con recompensa congelada, ese XP base
         manda; el reparto por `split` sigue siendo la regla. */
      const frozen = CATALOG_SAGAS_HOLDER.frozen;
      const baseXp =
        frozen && Object.prototype.hasOwnProperty.call(frozen, ch.id) ? frozen[ch.id] : ch.xp;
      total += Math.round(baseXp * share);
    }
  }
  const today = CATALOG_SAGAS_HOLDER.referenceDate;
  const weekly = state.weekly || {};
  if (weekly.done && weekly.week === isoWeekKey(today)) total += Math.round(SAGA_WEEKLY_XP / 2);
  return total;
}

/* Holder para no pasar el catálogo por cada helper. Se fija por derive(). */
const CATALOG_SAGAS_HOLDER = { current: [], referenceDate: "1970-01-01", frozen: {} };

export function vidaCompute(sources) {
  /* R1: los capítulos de saga congelados se leen desde acá también. */
  CATALOG_SAGAS_HOLDER.frozen = (sources && sources.frozen) || {};
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
    /* R1: si la entrada trae XP congelado, ese manda; el catálogo solo se usa
       para las entradas heredadas o anteriores a la congelación. */
    const frozen = (gv.frozen && gv.frozen[entry]) || null;
    if (frozen) {
      xp[frozen.cat || "eq"] = (xp[frozen.cat || "eq"] || 0) + frozen.xp;
      if (id.indexOf("hab-") === 0) {
        (habitDates[id] = habitDates[id] || new Set()).add(key);
      }
      continue;
    }
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
      const fz = gv.frozenById && gv.frozenById[id];
      if (fz) {
        xp[fz.cat || "eq"] = (xp[fz.cat || "eq"] || 0) + fz.xp;
        continue;
      }
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
  const frozen = sources.frozen || {};
  const campaign = sumXpForIds(catalog.campaign, p.completedMissions);
  const dailyRaw = sumXpWithFrozen(
    Object.fromEntries(Object.entries(catalog.daily).map(([id, m]) => [id, m.xp])),
    p.completedDaily,
    frozen
  );
  const daily = Math.round(dailyRaw * streakMult(sources.identity.streak));
  const weekly = sumXpWithFrozen(catalog.weekly, (p.completedWeekly || []).map(String), frozen);
  const jobs = sumXpWithFrozen(catalog.jobs, p.completedJobs, frozen);
  const b2b =
    sumXpWithFrozen(catalog.b2b, p.completedB2b, frozen) +
    sumXpWithFrozen(catalog.puente, p.completedPuente, frozen);
  const extraCampaign = sources.campaignRewards || {};
  const career = campaign + daily + weekly + jobs + b2b + (extraCampaign.career || 0);

  const ach = sumXpForIds(catalog.achievements, p.unlockedAch);
  const vida = vidaCompute(sources).total;
  const capital =
    sumXpWithFrozen(catalog.capital.done, sources.capital.done, frozen) +
    sumXpWithFrozen(catalog.capital.eng, sources.capital.eng, frozen) +
    sumXpWithFrozen(catalog.capital.ai, sources.capital.ai, frozen);
  const focus = ((sources.focus && sources.focus.log) || []).reduce((a, e) => a + (Number(e && e.xp) || 0), 0);
  const diary = ((sources.diary && sources.diary.log) || []).reduce((a, e) => a + (Number(e && e.xp) || 0), 0);
  const bosses = Object.keys(sources.gods || {}).reduce((a, id) => {
    /* R1: el XP del jefe congelado manda sobre el catálogo. */
    const frozenXP = Object.prototype.hasOwnProperty.call(frozen, id) ? frozen[id] : null;
    return a + (frozenXP != null ? frozenXP : Number(catalog.bosses[id]) || 0);
  }, 0);
  const hunt = ((sources.hunt && sources.hunt.log) || []).reduce((a, e) => a + Math.max(0, Number(e && e.xp) || 0), 0) + (extraCampaign.hunt || 0);
  const evento = ((sources.credits.eventRL && sources.credits.eventRL.log) || [])
    .reduce((a, e) => a + Math.max(0, Number(e && e.xp) || 0), 0) + (extraCampaign.evento || 0);
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
    (Object.keys(sources.gods || {}).length * 50) + (extraCampaign.coins || 0);
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
