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
import { applyCampaignMutation } from "./campaign-state.js";
import { applyGarageMutation } from "./garage-state.js";
import { applyIanMutation } from "./ian-state.js";
import { applyJarvisMutation } from "./jarvis-state.js";
import { applyLibretaMutation } from "./libreta-state.js";
import { applyMarcaMutation } from "./marca-state.js";
import { applyInglesMutation } from "./ingles-state.js";
import { applyRealesMutation } from "./reales-state.js";
import { applyContratoMutation } from "./contrato-state.js";
import { applyRachaMutation } from "./racha-state.js";
import { applyPaquetesMutation } from "./paquetes-state.js";
import { applyLegendarioMutation } from "./legendario-state.js";
import { applyShopMutation } from "./shop.js";

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
  /* `every` usa la misma forma de clave que `daily` —una por fecha— pero la
     disponibilidad la decide el ciclo desde la última completación. */
  if (cls === "every") return `${missionId}@${dateKey}`;
  return missionId;
}

/** Última fecha en que se completó esa misión (cualquier ciclo), o null. */
export function lastCompletionDate(play, missionId) {
  const prefix = `${missionId}@`;
  let last = null;
  for (const key of Object.keys((play && play.completions) || {})) {
    if (!key.startsWith(prefix)) continue;
    const date = key.slice(prefix.length);
    if (!isValidDateKey(date)) continue;
    if (!last || date > last) last = date;
  }
  return last;
}

/**
 * ¿Está debida una misión de ciclo `every`?
 * Vuelve a estarlo cuando pasaron `days` días desde la última completación.
 */
export function isEveryDue(play, mission, dateKey) {
  const days = Number(mission && mission.days) || 1;
  const last = lastCompletionDate(play, mission.id);
  if (!last) return true;
  return addDays(last, days) <= dateKey;
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
 * Día del plan PERSONAL del jugador (v0.19.0, pedido de José): en ODEA 1 el
 * día se cuenta desde SU fecha de inicio (`core.identity.startDate`, el
 * día 1) y avanza con el calendario: si empezó el 27-oct, el 17-nov va por
 * el día 22. Antes la ruta se derivaba del epoch crudo y caía en un día
 * arbitrario del catálogo que no era el suyo. Sin startDate válida se
 * conserva el ciclo por epoch (compatibilidad con pruebas y partidas sin
 * migrar). El resultado se acota a 1..DAILY_TOTAL_DAYS.
 */
export function planDayFor(bundle2, dateKey = localDateKey()) {
  const startDate = bundle2 && bundle2.core && bundle2.core.identity
    ? bundle2.core.identity.startDate
    : null;
  const epochDay = epochDayOf(dateKey);
  if (isValidDateKey(startDate)) {
    const planDay = epochDay - epochDayOf(startDate) + 1;
    return Math.min(Math.max(planDay, 1), DAILY_TOTAL_DAYS);
  }
  return (((epochDay % DAILY_TOTAL_DAYS) + DAILY_TOTAL_DAYS) % DAILY_TOTAL_DAYS) + 1;
}

/**
 * Ruta del día del Hub: las 3 misiones del día del plan del jugador.
 * `missions` incluye las ya completadas con su flag y los textos del
 * catálogo (título, descripción, tiempo y evidencia) para que la UI las
 * presente con el mismo formato que las misiones de campaña; `pending`
 * es la ruta jugable. No se guarda nada.
 */
export function routeForDay(bundle2, catalog, dateKey = localDateKey()) {
  const epochDay = epochDayOf(dateKey);
  const catalogDay = planDayFor(bundle2, dateKey);
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
      title: (mission && mission.title) || id,
      description: (mission && mission.description) || "",
      time: Number(mission && mission.time) || null,
      verification: (mission && mission.verification) || "",
      category: (mission && mission.category) || null,
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

  if (mutation && ["campaign.complete", "application.record"].includes(mutation.type)) {
    return applyCampaignMutation(draft, mutation, { at: atIso, date: dateKey });
  }

  if (mutation && ["garage.complete", "garage.km"].includes(mutation.type)) {
    return applyGarageMutation(draft, mutation, { at: atIso, date: dateKey });
  }

  if (mutation && mutation.type === "ian.complete") {
    return applyIanMutation(draft, mutation, { at: atIso, date: dateKey });
  }

  /* Estudio Neón (v0.44.0): la marca personal viva de Barrio Vida —
     rutinas con reloj e hitos de una vez, en dos pestañas. */
  if (mutation && mutation.type === "marca.complete") {
    return applyMarcaMutation(draft, mutation, { at: atIso, date: dateKey });
  }

  /* La Torre de Control (v0.55.0): el vivo de inglés — rutinas con
     reloj e hitos de una vez, con el Tope de Turno semanal aplicado
     dentro del reducer (ingles-state), nunca en la UI. */
  if (mutation && mutation.type === "ingles.complete") {
    return applyInglesMutation(draft, mutation, { at: atIso, date: dateKey });
  }

  /* Jarvis (v0.38.0): quiz con XP acotado, contadores de uso del Worker
     y el saludo del día en caché. La IA nunca escribe por su cuenta:
     todo pasa por aquí y por applyGameplayMutation. v0.52.0 suma el
     banco de preguntas (bankSave/bankRemove): mutaciones del juego
     que dispara el toque de José, sin XP ni monedas. */
  if (mutation && ["jarvis.quiz", "jarvis.usage", "jarvis.briefing", "jarvis.act", "jarvis.actUndo", "jarvis.bankSave", "jarvis.bankRemove", "jarvis.snoozeClear"].includes(mutation.type)) {
    return applyJarvisMutation(draft, mutation, { at: atIso, date: dateKey, catalog });
  }

  /* Libreta (v0.41.0): notas personales del teléfono. Sin XP, sin
     monedas y sin relación con misiones: solo texto del jugador, que
     nunca pasa por derive(). */
  if (mutation && ["libreta.create", "libreta.update", "libreta.delete"].includes(mutation.type)) {
    return applyLibretaMutation(draft, mutation, { at: atIso, date: dateKey });
  }

  /* Recompensas Reales (v0.45.0): canjes de la vida real contra el
     saldo ₡. La herencia de ODEA 1 (core.realRewards.canje) solo se
     lee; todo lo nuevo se escribe en play.reales y su gasto entra al
     saldo vía derive (mergePlaySources). */
  if (mutation && ["reales.create", "reales.delete", "reales.redeem", "reales.enjoy"].includes(mutation.type)) {
    return applyRealesMutation(draft, mutation, { at: atIso, date: dateKey });
  }

  /* Contrato Semanal (v0.46.0): el reclamo del cofre. El reducer
     recalcula el progreso derivado desde el borrador — nunca confía
     en la UI — y solo escribe el reclamo en play.contrato.claims. */
  if (mutation && mutation.type === "contrato.claim") {
    return applyContratoMutation(draft, mutation, { at: atIso, date: dateKey });
  }

  /* Escudo de Racha (v0.47.0): grants por hitos de racha (14/30) y el
     consumo automático que cubre un día perdido. El reducer revalida
     TODAS las condiciones sobre el borrador; el oráculo solo agrega
     los días cubiertos al conjunto de días activos de la racha.
     OJO: en `racha.cover` el `date` DE LA MUTACIÓN es el día perdido,
     no la fecha de juego — por eso acá se pasa el `date` de las
     opciones (hoy) y no el `dateKey` derivado de la mutación. */
  if (mutation && ["racha.cover", "racha.grant"].includes(mutation.type)) {
    return applyRachaMutation(draft, mutation, { at: atIso, date });
  }

  /* Paquetes Neón (v0.48.0): la recolección de cassettes caminando por
     la ciudad y el premio final de la colección. La recolección es
     físicamente irrepetible (el sprite no se pinta) y el reducer
     además devuelve DUPLICATE si el spot ya está en `found`; el
     premio exige 20/20 y se reclama una sola vez. */
  if (mutation && ["paquete.collect", "paquete.prize"].includes(mutation.type)) {
    return applyPaquetesMutation(draft, mutation, { at: atIso, date: dateKey });
  }

  /* Set Legendario (v0.49.0): el reclamo del set de fin de evento.
     El reducer revalida con campaignView que la campaña esté
     completa (done === total), que exista set para esa campaña y
     que no haya grant previo; sin la campaña en CAMPAIGNS el
     reclamo es imposible (fail-closed). Cosmético puro: ₡0, 0 XP. */
  if (mutation && mutation.type === "legendario.claim") {
    return applyLegendarioMutation(draft, mutation, { at: atIso, date: dateKey });
  }

  if (mutation && (mutation.type === "shop.buy" || mutation.type === "shop.equip")) {
    return applyShopMutation(draft, mutation);
  }

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
  /* Ciclo `every`: no se puede adelantar antes de que venza el intervalo. */
  if (mission.cls === "every" && !isEveryDue(play, mission, dateKey)) {
    return { changed: false, duplicate: false, reason: "NOT_DUE", paths: [] };
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
    if (mission.cls === "every") {
      const last = lastCompletionDate(play, mission.id);
      const due = isEveryDue(play, mission, dateKey);
      return {
        ...mission,
        key,
        period: dateKey,
        /* `completed` aquí significa «en su ciclo vigente»: si no está debida,
           no se ofrece. Se expone `dueDate` para poder decirlo en la UI. */
        completed: !due,
        migrated: false,
        lastCompleted: last,
        dueDate: last ? addDays(last, Number(mission.days) || 1) : null
      };
    }
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

/** Vecindario de días para la UI de la racha (no persiste nada).
 * Desde v0.47.0 cada día trae también `covered` (lo cubrió un Escudo
 * de Racha: se distingue con un punto-escudo en la semanita) y
 * `active` (hub o check-in reales de ese día). */
export function recentStreakDays(bundle2, dateKey = localDateKey(), span = 7) {
  const play = playStateOf(bundle2);
  const covered = (bundle2 && bundle2.play && bundle2.play.racha && bundle2.play.racha.covered) || {};
  const hubDates = new Set();
  for (const record of Object.values(play.completions)) {
    if (record && record.system === "hub" && typeof record.date === "string") hubDates.add(record.date);
  }
  const days = [];
  for (let i = span - 1; i >= 0; i--) {
    const day = addDays(dateKey, -i);
    const checked = !!play.checkins[day];
    days.push({
      date: day,
      checked,
      active: checked || hubDates.has(day),
      covered: Boolean(covered[day])
    });
  }
  return days;
}
