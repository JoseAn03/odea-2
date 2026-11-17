/**
 * gameplay.js — reducer PURO de la Fase 3 (sin storage, sin DOM).
 *
 * Toda escritura de gameplay se describe como una mutación y se aplica sobre
 * una COPIA del bundle. Este módulo no lee ni escribe storage: solo decide qué
 * cambia y devuelve las rutas tocadas.
 *
 * Reglas aprobadas (spec Fase 3 §2.3, §4):
 *   - clave de idempotencia `occurrenceKey`:
 *       única        → missionId
 *       diaria       → missionId@YYYY-MM-DD
 *       semanal      → missionId@YYYY-Www
 *   - la ruta del día se DERIVA de la fecha: nunca se persiste.
 *   - XP, monedas y racha se derivan; acá solo se registran completaciones.
 */
import { addDays, deriveStreak, epochDayOf, isoWeekKey, localDateKey } from "./derive.js";
import { missionOf, missionsOf, PHASE3_SYSTEMS } from "./catalog.js";
import { PLAY_VERSION, RULES_VERSION } from "./shape.js";

export const ROUTE_SIZE = 3;
export const DAILY_TOTAL_DAYS = 56;

/**
 * Monedas que otorga una completación bajo las reglas actuales.
 *
 * ODEA 1 cuenta una moneda por cosa completada (no hay campo de monedas en el
 * catálogo). Queda como constante explícita para que R1 la congele en el
 * registro: si mañana cambia, `RULES_VERSION` sube y lo viejo no se reinterpreta.
 */
export const COINS_PER_COMPLETION = 1;

/**
 * Monedas de sinergia de Academia (verificadas en `assets/odea-tesoro.js`):
 * `onAcademiaMision` paga +3 por misión con tope de 3 al día, y
 * `grantSinergia("ruta:" + id, 15)` paga +15 al cerrar una ruta.
 *
 * Las monedas van al libro del TESORO (`worlds.tesoro.data.monedas`), no al
 * saldo del núcleo: son cuentas distintas y no se convierten entre sí.
 */
export const ACADEMIA_SYNERGY_COINS = 3;
export const ACADEMIA_SYNERGY_DAILY_CAP = 3;
export const ACADEMIA_ROUTE_COINS = 15;

/**
 * Estado aditivo de Academia.
 *
 * `worlds` es **inmutable** (decisión cerrada: la forma migrada no se toca), así
 * que la sinergia no puede escribirse en `worlds.tesoro`. Se guarda como un
 * DELTA en `play.academia` y el saldo efectivo se deriva:
 *
 *     monedas del Tesoro = worlds.tesoro.data.monedas (migrado) + play.academia.monedasGanadas
 *
 * Igual que con el XP: nunca se edita un total, se acumulan registros.
 */
export function academiaStateOf(bundle2) {
  const play = (bundle2 && bundle2.play) || {};
  const state = play.academia && typeof play.academia === "object" ? play.academia : {};
  const migrated = (bundle2 && bundle2.worlds && bundle2.worlds.academia && bundle2.worlds.academia.data) || {};
  const tesoro = (bundle2 && bundle2.worlds && bundle2.worlds.tesoro && bundle2.worlds.tesoro.data) || {};

  const rutas = new Set(
    Array.isArray(migrated.rutasAvisadas) ? migrated.rutasAvisadas.map(String) : []
  );
  for (const id of Array.isArray(state.rutas) ? state.rutas : []) rutas.add(String(id));

  return {
    sinergias: state.sinergias && typeof state.sinergias === "object" ? state.sinergias : {},
    monedasGanadas: Number(state.monedasGanadas) || 0,
    rutas: Array.from(rutas),
    tesoroMigrado: Number(tesoro.monedas) || 0,
    /** Saldo del Tesoro = migrado + lo ganado con sinergias. */
    get monedas() {
      return this.tesoroMigrado + this.monedasGanadas;
    }
  };
}

/** Ids de Academia ya completados: migrados (`hechas`) + nuevos (`play`). */
function academiaDoneIds(bundle2, catalog) {
  const done = new Set();
  const data = (bundle2 && bundle2.worlds && bundle2.worlds.academia && bundle2.worlds.academia.data) || {};
  for (const id of Object.keys(data.hechas || {})) done.add(id);
  const completions = (bundle2 && bundle2.play && bundle2.play.completions) || {};
  for (const record of Object.values(completions)) {
    if (record && record.system === "academia" && typeof record.missionId === "string") {
      done.add(record.missionId);
    }
  }
  return done;
}

/** Agrupa el catálogo de Academia por ruta, conservando el paso narrativo. */
export function academiaRoutes(catalog) {
  const out = {};
  for (const [id, entry] of Object.entries((catalog && catalog.academia) || {})) {
    if (!entry || typeof entry !== "object") continue;
    const route = entry.ruta || "desconocida";
    (out[route] = out[route] || []).push({
      id,
      meta: Boolean(entry.meta),
      label: entry.rutaNombre || route
    });
  }
  return out;
}

/**
 * Efectos de una completación de Academia sobre la sección ADITIVA:
 * sinergia diaria (+3, tope 3) y cierre de ruta (+15, una vez por ruta).
 */
function applyAcademiaEffects(draft, catalog, dateKey) {
  const play = draft.play;
  if (!play.academia || typeof play.academia !== "object") {
    play.academia = { sinergias: {}, monedasGanadas: 0, rutas: [] };
  }
  const state = play.academia;
  if (!state.sinergias || typeof state.sinergias !== "object") state.sinergias = {};
  if (!Array.isArray(state.rutas)) state.rutas = [];
  state.monedasGanadas = Number(state.monedasGanadas) || 0;

  const paths = [];

  /* 1. Sinergia por misión, con su tope diario exacto. */
  const key = `academia:${dateKey}`;
  const used = Number(state.sinergias[key]) || 0;
  if (used < ACADEMIA_SYNERGY_DAILY_CAP) {
    state.sinergias[key] = used + 1;
    state.monedasGanadas += ACADEMIA_SYNERGY_COINS;
    paths.push(`play.academia.sinergias.${key}`, "play.academia.monedasGanadas");
  }

  /* 2. Cierre de ruta. El paso `meta` solo cuenta cuando las 28 reales están
        hechas, igual que `routeProgress()` de la fuente. */
  const done = academiaDoneIds(draft, catalog);
  const routes = academiaRoutes(catalog);
  const realTotal = Object.values(routes).flat().filter((m) => !m.meta).length;
  const allRealDone = done.size >= realTotal;

  for (const [routeId, entries] of Object.entries(routes)) {
    if (state.rutas.includes(routeId)) continue;
    const completed = entries.filter((m) => (m.meta ? allRealDone : done.has(m.id))).length;
    if (completed < entries.length) continue;
    state.rutas.push(routeId);
    state.monedasGanadas += ACADEMIA_ROUTE_COINS;
    paths.push("play.academia.rutas", "play.academia.monedasGanadas");
  }

  return paths;
}

export function emptyPlay() {
  return { version: PLAY_VERSION, completions: {}, checkins: {} };
}

/**
 * Recompensa que el DOMINIO calcula desde el catálogo al escribir (R1).
 *
 * La UI nunca manda cantidades: solo `{ type, system, missionId }`. Esto se
 * congela en el registro para que un cambio futuro del catálogo no reescriba
 * el historial.
 */
export function rewardOf(mission, system = null) {
  const xp = Number(mission && mission.xp) || 0;
  const cat = mission && mission.entry && mission.entry.cat ? String(mission.entry.cat) : null;
  /* Academia no paga monedas por completación: su recompensa es la sinergia del
     Tesoro, que tiene tope diario y se aplica aparte. */
  const coins = system === "academia" ? 0 : COINS_PER_COMPLETION;
  return {
    xp,
    coins,
    /* Vida necesita la categoría para su cálculo por pilares; se guarda con la
       recompensa para no depender del catálogo vigente. */
    ...(cat ? { cat } : {})
  };
}

export function playStateOf(bundle2) {
  const play = bundle2 && bundle2.play;
  if (!play || typeof play !== "object") return emptyPlay();
  return {
    version: play.version || PLAY_VERSION,
    completions: play.completions && typeof play.completions === "object" ? play.completions : {},
    checkins: play.checkins && typeof play.checkins === "object" ? play.checkins : {}
  };
}

export function occurrenceKey(missionId, cls, dateKey) {
  if (cls === "daily") return `${missionId}@${dateKey}`;
  if (cls === "weekly") return `${missionId}@${isoWeekKey(dateKey)}`;
  return missionId;
}

/** ¿Está completada la ocurrencia concreta de hoy? */
export function isCompleted(bundle2, missionId, cls, dateKey) {
  const play = playStateOf(bundle2);
  return !!play.completions[occurrenceKey(missionId, cls, dateKey)];
}

/** ¿Está completada la misión alguna vez (para la ruta del Hub)? */
export function isMissionDone(bundle2, missionId) {
  const play = playStateOf(bundle2);
  if (play.completions[missionId]) return true;
  const daily = (bundle2.core && bundle2.core.progress && bundle2.core.progress.completedDaily) || [];
  return daily.includes(missionId);
}

/**
 * Claves de ocurrencia que YA estaban completas en el progreso MIGRADO.
 *
 * Sin esto, un distrito ofrece como pendiente algo que ODEA 1 ya tenía hecho:
 * el jugador lo "completa" y no gana nada, porque `derive` deduplica. El
 * problema no es de XP —esa nunca se duplica— sino de honestidad de la UI y de
 * no ensuciar `play.completions` con registros que no aportan.
 *
 * Devuelve el mismo espacio de claves que `occurrenceKey`, así que compara
 * directo contra lo persistido.
 */
export function migratedKeys(bundle2, catalog, system, dateKey = localDateKey()) {
  const core = (bundle2 && bundle2.core) || {};
  const progress = core.progress || {};
  const keys = new Set();
  const add = (id, cls, date) => {
    if (typeof id === "string" || typeof id === "number") {
      keys.add(occurrenceKey(String(id), cls, date));
    }
  };

  if (system === "hub") {
    for (const id of progress.completedDaily || []) add(id, "one", dateKey);
  }

  if (system === "empleo") {
    for (const id of progress.completedJobs || []) add(id, "one", dateKey);
    for (const id of progress.completedB2b || []) add(id, "one", dateKey);
    for (const id of progress.completedPuente || []) add(id, "one", dateKey);
  }

  if (system === "capital") {
    const capital = core.capital || {};
    for (const id of capital.done || []) add(id, "one", dateKey);
    for (const id of capital.eng || []) add(id, "one", dateKey);
    for (const id of capital.ai || []) add(id, "one", dateKey);
  }

  if (system === "vida") {
    /* El log heredado es `id|YYYY-MM-DD`; la clase la decide el catálogo,
       nunca la forma del log. */
    for (const entry of core.vida && core.vida.log ? core.vida.log : []) {
      const [id, date] = String(entry).split("|");
      if (!id || !isValidDateKey(date)) continue;
      const mission = missionOf(catalog, "vida", id);
      if (!mission) continue;
      add(id, mission.cls, date);
    }
  }

  if (system === "sagas") {
    /* Capítulos migrados (mapa con fecha) y jefes derrotados (`true`). */
    const data = (bundle2 && bundle2.worlds && bundle2.worlds.sagas && bundle2.worlds.sagas.data) || {};
    for (const id of Object.keys(data.chapters || {})) add(id, "one", dateKey);
    for (const id of Object.keys(core.gods || {})) add(id, "one", dateKey);
  }

  if (system === "academia") {
    /* Lo que ODEA 1 ya tenía hecho en `hechas` no se vuelve a ofrecer. */
    const data = (bundle2 && bundle2.worlds && bundle2.worlds.academia && bundle2.worlds.academia.data) || {};
    for (const id of Object.keys(data.hechas || {})) add(id, "one", dateKey);
  }

  return keys;
}

/**
 * Ruta del día del Hub: 3 misiones derivadas de la fecha local.
 * `missions` incluye las ya completadas con su flag; `pending` es la ruta
 * jugable. No se guarda nada.
 */
export function routeForDay(bundle2, catalog, dateKey = localDateKey()) {
  const epochDay = epochDayOf(dateKey);
  const catalogDay = (((epochDay % DAILY_TOTAL_DAYS) + DAILY_TOTAL_DAYS) % DAILY_TOTAL_DAYS) + 1;
  const daily = (catalog && catalog.daily) || {};

  const all = Object.entries(daily)
    .filter(([, mission]) => Number(mission && mission.day) === catalogDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, ROUTE_SIZE)
    .map(([id, mission]) => ({
      id,
      xp: Number(mission && mission.xp) || 0,
      slot: (mission && mission.slot) || null,
      day: catalogDay,
      completed: isMissionDone(bundle2, id)
    }));

  return {
    date: dateKey,
    epochDay,
    catalogDay,
    missions: all,
    pending: all.filter((mission) => !mission.completed)
  };
}

export function streakInfoOf(bundle2) {
  return deriveStreak(bundle2);
}

function isValidDateKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/**
 * Aplica una mutación sobre `draft` (ya clonado). Devuelve:
 *   { changed, duplicate, reason, paths }
 * `reason` usa los códigos de la spec (UNKNOWN_MISSION, OUT_OF_SCOPE, ...).
 */
export function applyMutation(draft, mutation, catalog, { at, date } = {}) {
  const atIso = typeof at === "string" ? at : new Date().toISOString();
  const dateKey = mutation && typeof mutation.date === "string" ? mutation.date : date;

  if (!isValidDateKey(dateKey)) {
    return { changed: false, duplicate: false, reason: "BAD_DATE", paths: [] };
  }

  const play = draft.play && typeof draft.play === "object" ? draft.play : emptyPlay();
  play.version = PLAY_VERSION;
  if (!play.completions || typeof play.completions !== "object") play.completions = {};
  if (!play.checkins || typeof play.checkins !== "object") play.checkins = {};
  draft.play = play;

  if (mutation && mutation.type === "hub.checkin") {
    /* El día migrado (`lastDailyDate`) ya está contado en la racha base: un
       check-in en esa fecha (o anterior) no aporta un día nuevo. */
    const baselineDate = (draft.core && draft.core.identity && draft.core.identity.lastDailyDate) || null;
    if (play.checkins[dateKey] || (baselineDate && dateKey <= baselineDate)) {
      return { changed: false, duplicate: true, reason: "DUPLICATE", paths: [] };
    }
    play.checkins[dateKey] = { at: atIso };
    return { changed: true, duplicate: false, reason: null, paths: [`play.checkins.${dateKey}`] };
  }

  if (!mutation || mutation.type !== "mission.complete") {
    return { changed: false, duplicate: false, reason: "UNKNOWN_MUTATION", paths: [] };
  }

  const system = mutation.system;
  if (!PHASE3_SYSTEMS.includes(system)) {
    return { changed: false, duplicate: false, reason: "OUT_OF_SCOPE", paths: [] };
  }

  const mission = missionOf(catalog, system, mutation.missionId);
  if (!mission) {
    return { changed: false, duplicate: false, reason: "UNKNOWN_MISSION", paths: [] };
  }

  const key = occurrenceKey(mutation.missionId, mission.cls, dateKey);
  if (play.completions[key]) {
    return { changed: false, duplicate: true, reason: "DUPLICATE", paths: [] };
  }
  /* Ya venía completo de ODEA 1: no se registra de nuevo, porque `derive`
     deduplica y el resultado sería un "aplicado" sin XP ganada. */
  if (migratedKeys(draft, catalog, system, dateKey).has(key)) {
    return { changed: false, duplicate: true, reason: "DUPLICATE", paths: [] };
  }

  play.completions[key] = {
    missionId: mutation.missionId,
    system,
    date: dateKey,
    at: atIso,
    ...(mission.cls === "one" ? {} : { period: mission.cls === "weekly" ? isoWeekKey(dateKey) : dateKey }),
    /* R1: recompensa congelada + versión de reglas con la que se calculó. */
    reward: rewardOf(mission, system),
    rulesVersion: RULES_VERSION
  };

  /* Academia tiene efectos propios sobre el Tesoro y sus rutas. */
  if (system === "academia") {
    applyAcademiaEffects(draft, catalog, dateKey);
  }

  return { changed: true, duplicate: false, reason: null, paths: [`play.completions.${key}`] };
}

/**
 * Misiones de un sistema con su estado de completación para `dateKey`.
 *
 * La clave de ocurrencia sale de la clase REAL de cada misión: en Vida
 * conviven diarias, semanales y únicas en el mismo mapa, así que una diaria
 * vuelve a estar pendiente mañana mientras una única queda hecha para siempre.
 *
 * Devuelve `{ system, date, missions, pending, completed }`, con las
 * pendientes primero para que la lista abra en lo accionable.
 */
export function systemMissions(bundle2, catalog, system, dateKey = localDateKey()) {
  const play = playStateOf(bundle2);
  const migrated = migratedKeys(bundle2, catalog, system, dateKey);
  const missions = missionsOf(catalog, system).map((mission) => {
    const key = occurrenceKey(mission.id, mission.cls, dateKey);
    return {
      ...mission,
      key,
      period: mission.cls === "one" ? null : mission.cls === "weekly" ? isoWeekKey(dateKey) : dateKey,
      completed: migrated.has(key) || Boolean(play.completions[key]),
      migrated: migrated.has(key)
    };
  });

  const pending = missions.filter((mission) => !mission.completed);
  const completed = missions.filter((mission) => mission.completed);
  return { system, date: dateKey, missions: [...pending, ...completed], pending, completed };
}

/** Vecindario de días para la UI de la racha (no persiste nada). */export function recentStreakDays(bundle2, dateKey = localDateKey(), span = 7) {
  const play = playStateOf(bundle2);
  const days = [];
  for (let i = span - 1; i >= 0; i--) {
    const day = addDays(dateKey, -i);
    const checked = !!play.checkins[day];
    days.push({ date: day, checked });
  }
  return days;
}
