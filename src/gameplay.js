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
import { PLAY_VERSION } from "./shape.js";

export const ROUTE_SIZE = 3;
export const DAILY_TOTAL_DAYS = 56;

export function emptyPlay() {
  return { version: PLAY_VERSION, completions: {}, checkins: {} };
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

  play.completions[key] = {
    missionId: mutation.missionId,
    system,
    date: dateKey,
    at: atIso,
    ...(mission.cls === "one" ? {} : { period: mission.cls === "weekly" ? isoWeekKey(dateKey) : dateKey })
  };

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
  const missions = missionsOf(catalog, system).map((mission) => {
    const key = occurrenceKey(mission.id, mission.cls, dateKey);
    return {
      ...mission,
      key,
      period: mission.cls === "one" ? null : mission.cls === "weekly" ? isoWeekKey(dateKey) : dateKey,
      completed: Boolean(play.completions[key])
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
