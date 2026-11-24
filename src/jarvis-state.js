/**
 * jarvis-state.js — estado y reglas de JARVIS (v0.38.0), el compañero IA
 * de la Zona IA: un robotcito que vive en la manzana (2,0) y ayuda con un
 * saludo del día, quizzes con XP acotado, chat y revisión de evidencias.
 *
 * La IA es un EXTRA: nunca es candado, nunca escribe el guardado por su
 * cuenta y nunca inventa misiones. Lo único que este módulo registra es
 * contable y derivado, como el Garaje Vivo y El Mundo de Ian:
 *
 *   play.jarvis = {
 *     quizXpByDate: { "2026-11-20": 10 },          // XP de quiz por día
 *     usage: { "2026-11-20": { quiz, chat, feedback, calls } },
 *     briefing: { date, text } | null,             // saludo del día en caché
 *     bank: [ { id, q, a, kind, ref, module, date, at } ],  // v0.52.0: el banco (§3.4), ≤ 100
 *     snoozes: { "garaje:<id>": "YYYY-MM-DD" },    // v0.54.0: avisos del Garaje dormidos (§3.4)
 *     drafts: { <draftId>: { missionId, missionTitle, text, date, at } },  // v0.54.0: borradores (§3.6), ≤ 5
 *   }
 *
 * El XP de quiz suma al bucket «career» vía derive() (jarvisRewards):
 * 2 XP por acierto en una ronda de 5 (máx. 10 por ronda), con tope duro
 * de 2 rondas con XP por día = 20 XP/día, sin monedas. La ronda se
 * registra SOLO al completarla (regla v0.39.1): abandonar antes de la
 * 5.ª pregunta no consume cupo ni paga nada.
 * Los contadores de uso ponen los límites diarios del Worker (chat 20,
 * feedback 5) del lado del cliente; el Worker impone los suyos propios.
 */

import { campaignView } from "./campaign-state.js";
import { garageView } from "./garage-state.js";
import { ianView } from "./ian-state.js";
import { derive, deriveStreak, sourcesFromMigrated } from "./derive.js";
import { planDayFor, routeForDay } from "./gameplay.js";
import { CAMPAIGNS } from "./campaigns.js";
import {
  JARVIS_ACT_DAILY_LIMIT,
  JARVIS_ACTION_NAMES,
  JARVIS_ACTIONS,
  JARVIS_DRAFTS_MAX,
  JARVIS_DRAFT_TEXT_MAX,
  JARVIS_REQUEST_ID_PATTERN,
  addDaysKey,
  jarvisActionArgsShape,
  jarvisActionPrevShape,
  jarvisAppliedIntact,
  validateJarvisAction,
} from "./jarvis-actions.js";

export { JARVIS_ACT_DAILY_LIMIT };

export const JARVIS_QUIZ_XP = 10;
export const JARVIS_QUIZ_XP_PER_HIT = 2;
export const JARVIS_QUIZ_DAILY_LIMIT = 2;
export const JARVIS_CHAT_DAILY_LIMIT = 20;
export const JARVIS_FEEDBACK_DAILY_LIMIT = 5;
/* v0.51.0 — el Tutor de Estudio (diseño maestro §3.6): preguntar no
   paga XP ni monedas; el tope solo acota las llamadas al Worker. */
export const JARVIS_TUTOR_DAILY_LIMIT = 15;
/* v0.52.0 — el Banco de preguntas (diseño maestro §3.4): guardar y
   repasar tampoco pagan XP ni monedas. Estos topes son de FORMA y de
   tamaño del save (100 entradas, pregunta ≤300, respuesta ≤1.200) y
   se validan estrictos en jarvisProblems, antes de guardar. */
export const JARVIS_BANK_CAP = 100;
export const JARVIS_BANK_Q_MAX = 300;
export const JARVIS_BANK_A_MAX = 1200;
export const JARVIS_BANK_REF_MAX = 120;
export const JARVIS_BANK_MODULE_MAX = 40;
export const JARVIS_BANK_ID_MAX = 64;
export const ENTREVISTA_FECHA = "2026-11-24";

const USAGE_KINDS = ["quiz", "chat", "feedback", "calls"];

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isDateKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function daysBetween(fromKey, toKey) {
  const from = Date.parse(`${fromKey}T00:00:00.000Z`);
  const to = Date.parse(`${toKey}T00:00:00.000Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return Math.round((to - from) / 86400000);
}

function cleanCount(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function emptyUsage() {
  return { quiz: 0, chat: 0, feedback: 0, calls: 0, act: 0, tutor: 0 };
}

export const JARVIS_DAYPLAN_MAX_DAYS = 62;
export const JARVIS_ACTIONS_MAX = 200;
export const JARVIS_ACTIONS_KEEP_DAYS = 30;
/* v0.54.0 — MANOS QUE CRUZAN (diseño de manos §3.4/§6.3): los snoozes
   del Garaje viven en play.jarvis.snoozes (≤40, con fecha válida) y
   los borradores de evidencia en play.jarvis.drafts (≤5, FIFO). Son
   claves opcionales aditivas: PLAY_VERSION no sube. */
export const JARVIS_SNOOZES_MAX = 40;
export { JARVIS_DRAFTS_MAX };

function isValidTs(value) {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

function cleanDayPlanEntry(raw) {
  if (!isPlainObject(raw)) return null;
  const focusId = typeof raw.focusId === "string" && raw.focusId.length <= 64 ? raw.focusId : null;
  const order = Array.isArray(raw.order) && raw.order.length <= 8 &&
    raw.order.every((id) => typeof id === "string" && id.length <= 64)
    ? [...raw.order] : null;
  let busy = null;
  if (isPlainObject(raw.busy) && Number.isInteger(raw.busy.minutes) &&
    raw.busy.minutes >= 0 && raw.busy.minutes <= 600 &&
    Array.isArray(raw.busy.chosen) && Array.isArray(raw.busy.deferred)) {
    busy = {
      minutes: raw.busy.minutes,
      chosen: raw.busy.chosen.filter((id) => typeof id === "string"),
      deferred: raw.busy.deferred.filter((id) => typeof id === "string"),
    };
  }
  return { focusId, order, busy };
}

function cleanActions(raw) {
  const out = {};
  if (!isPlainObject(raw)) return out;
  for (const [requestId, record] of Object.entries(raw)) {
    if (!JARVIS_REQUEST_ID_PATTERN.test(requestId)) continue;
    if (!isPlainObject(record) || !JARVIS_ACTION_NAMES.includes(record.name)) continue;
    if (!jarvisActionArgsShape(record.name, record.args)) continue;
    if (!isDateKey(record.date) || !isValidTs(record.at)) continue;
    if (typeof record.undone !== "boolean") continue;
    if (!jarvisActionPrevShape(record.name, record.prev)) continue;
    out[requestId] = {
      name: record.name,
      args: structuredClone(record.args),
      date: record.date,
      at: record.at,
      undone: record.undone,
      prev: structuredClone(record.prev),
      /* v0.54.0: la nota de la Libreta que respalda un cruce (su id);
         solo la trae create_libreta_note. */
      ...(typeof record.refId === "string" && record.refId.length > 0 && record.refId.length <= 80
        ? { refId: record.refId }
        : {}),
    };
  }
  return out;
}

/* v0.54.0 — los snoozes del Garaje, limpios para lectura: claves
   «garaje:<id>» con fecha válida. Lo que no cuadra no se lee (la
   validación dura vive en jarvisProblems, antes de guardar). */
function cleanSnoozes(raw) {
  const out = {};
  if (!isPlainObject(raw)) return out;
  for (const [key, until] of Object.entries(raw)) {
    if (!/^garaje:[^:]{1,64}$/.test(key)) continue;
    if (!isDateKey(until)) continue;
    out[key] = until;
  }
  return out;
}

/* v0.54.0 — un borrador de evidencia, limpio para lectura: la misma
   forma estricta que jarvisProblems exige al guardar. */
function cleanDraftEntry(raw) {
  if (!isPlainObject(raw)) return null;
  if (typeof raw.text !== "string" || !raw.text || raw.text.length > JARVIS_DRAFT_TEXT_MAX) return null;
  if (raw.missionId !== null && raw.missionId !== undefined &&
    (typeof raw.missionId !== "string" || !raw.missionId || raw.missionId.length > 64)) return null;
  if (raw.missionTitle !== null && raw.missionTitle !== undefined &&
    (typeof raw.missionTitle !== "string" || raw.missionTitle.length > 200)) return null;
  if (!isDateKey(raw.date) || !isValidTs(raw.at)) return null;
  return {
    missionId: raw.missionId ?? null,
    missionTitle: raw.missionTitle ?? null,
    text: raw.text,
    date: raw.date,
    at: raw.at,
  };
}

function cleanDrafts(raw) {
  const out = {};
  if (!isPlainObject(raw)) return out;
  for (const [id, entry] of Object.entries(raw)) {
    if (!id || id.length > 80) continue;
    const clean = cleanDraftEntry(entry);
    if (clean) out[id] = clean;
  }
  return out;
}

/** Los borradores como lista con su id, del más reciente al más viejo. */
function draftList(drafts) {
  return Object.entries(drafts || {})
    .map(([id, entry]) => ({ id, ...entry }))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)) || String(b.id).localeCompare(String(a.id)));
}

/* v0.52.0 — una entrada del banco, limpia para lectura: la misma forma
   estricta que jarvisProblems exige al guardar. Lo que no cuadra no se
   pinta (la validación dura vive en jarvisProblems y en bankSave). */
function cleanBankEntry(raw) {
  if (!isPlainObject(raw)) return null;
  const id = typeof raw.id === "string" ? raw.id : "";
  if (!id || id.length > JARVIS_BANK_ID_MAX) return null;
  if (typeof raw.q !== "string" || !raw.q || raw.q.length > JARVIS_BANK_Q_MAX) return null;
  if (typeof raw.a !== "string" || !raw.a || raw.a.length > JARVIS_BANK_A_MAX) return null;
  if (raw.kind !== "lesson" && raw.kind !== "extra") return null;
  const ref = raw.ref === undefined ? null : raw.ref;
  if (ref !== null && (typeof ref !== "string" || ref.length > JARVIS_BANK_REF_MAX)) return null;
  const module = raw.module === undefined ? null : raw.module;
  if (module !== null && (typeof module !== "string" || module.length > JARVIS_BANK_MODULE_MAX)) return null;
  if (!isDateKey(raw.date)) return null;
  if (typeof raw.at !== "number" || !Number.isFinite(raw.at) || raw.at < 0) return null;
  return { id, q: raw.q, a: raw.a, kind: raw.kind, ref, module, date: raw.date, at: raw.at };
}

function cleanBank(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const entry of raw) {
    const clean = cleanBankEntry(entry);
    if (!clean || seen.has(clean.id)) continue;
    seen.add(clean.id);
    out.push(clean);
  }
  return out;
}

/** El banco agrupado por módulo (derivación de lectura, §3.4.2): los
    grupos nacen en el orden de su entrada más reciente y dentro de
    cada grupo manda el orden del array (lo más reciente primero).
    El grupo de las extras lleva `module: null`. */
export function jarvisBankGroups(bank) {
  const groups = [];
  const byModule = new Map();
  for (const entry of Array.isArray(bank) ? bank : []) {
    const key = entry.module || null;
    if (!byModule.has(key)) {
      const group = { module: key, entries: [] };
      byModule.set(key, group);
      groups.push(group);
    }
    byModule.get(key).entries.push(entry);
  }
  return groups;
}

/** Estado de Jarvis normalizado (lectura segura ante cualquier guardado). */
export function jarvisStateOf(bundle) {
  const raw = isPlainObject(bundle?.play?.jarvis) ? bundle.play.jarvis : {};

  const quizXpByDate = {};
  if (isPlainObject(raw.quizXpByDate)) {
    for (const [date, xp] of Object.entries(raw.quizXpByDate)) {
      if (isDateKey(date)) quizXpByDate[date] = cleanCount(xp);
    }
  }

  const usage = {};
  if (isPlainObject(raw.usage)) {
    for (const [date, entry] of Object.entries(raw.usage)) {
      if (!isDateKey(date) || !isPlainObject(entry)) continue;
      usage[date] = {
        quiz: cleanCount(entry.quiz),
        chat: cleanCount(entry.chat),
        feedback: cleanCount(entry.feedback),
        calls: cleanCount(entry.calls),
        /* v0.50.0: acciones aplicadas del día (Jarvis con manos). Clave
           opcional aditiva: un save viejo sin `act` lee 0, sin migración. */
        act: cleanCount(entry.act),
        /* v0.51.0: preguntas del Tutor del día. Misma regla aditiva:
           un save sin `tutor` lee 0, sin migración ni PLAY_VERSION. */
        tutor: cleanCount(entry.tutor),
      };
    }
  }

  const briefing =
    isPlainObject(raw.briefing) && isDateKey(raw.briefing.date) && typeof raw.briefing.text === "string" && raw.briefing.text
      ? { date: raw.briefing.date, text: raw.briefing.text }
      : null;

  /* v0.50.0 (Jarvis con manos): claves opcionales aditivas. Ausentes =
     defaults en memoria; el save no se toca hasta el primer uso y
     PLAY_VERSION no sube (precedente Tienda/Marca/Libreta/Reales). */
  const dayPlan = {};
  if (isPlainObject(raw.dayPlan)) {
    for (const [date, entry] of Object.entries(raw.dayPlan)) {
      if (!isDateKey(date)) continue;
      const clean = cleanDayPlanEntry(entry);
      if (clean) dayPlan[date] = clean;
    }
  }
  const actions = cleanActions(raw.actions);

  /* v0.52.0 — el banco: clave opcional aditiva con la misma regla de
     siempre. Ausente = banco vacío en memoria; el save no se toca
     hasta el primer 📌 y PLAY_VERSION no sube. */
  const bank = cleanBank(raw.bank);

  /* v0.54.0 — los cruces: snoozes y borradores, misma regla aditiva.
     Ausentes = mapas vacíos en memoria; el save no se toca hasta la
     primera acción que cruza y PLAY_VERSION no sube. */
  const snoozes = cleanSnoozes(raw.snoozes);
  const drafts = cleanDrafts(raw.drafts);

  return { quizXpByDate, usage, briefing, dayPlan, actions, bank, snoozes, drafts };
}

/** Vista del día: topes restantes y el saludo en caché, si es de hoy. */
export function jarvisView(bundle, today) {
  const state = jarvisStateOf(bundle);
  const usageToday = state.usage[today] || emptyUsage();
  const quizRestantes = Math.max(0, JARVIS_QUIZ_DAILY_LIMIT - usageToday.quiz);
  const dayPlan = state.dayPlan[today] || { focusId: null, order: null, busy: null };
  return {
    quizXpToday: state.quizXpByDate[today] || 0,
    quizRestantes,
    quizXpDisponible: quizRestantes > 0 ? JARVIS_QUIZ_XP : 0,
    chatRestantes: Math.max(0, JARVIS_CHAT_DAILY_LIMIT - usageToday.chat),
    feedbackRestantes: Math.max(0, JARVIS_FEEDBACK_DAILY_LIMIT - usageToday.feedback),
    briefingHoy: state.briefing && state.briefing.date === today ? state.briefing.text : null,
    /* v0.50.0: manos — plan del día guardado y contador de acciones. */
    dayPlan,
    accionesHoy: usageToday.act || 0,
    actRestantes: Math.max(0, JARVIS_ACT_DAILY_LIMIT - (usageToday.act || 0)),
    /* v0.51.0: el Tutor del día (usadas y restantes, para el pie). */
    tutorHoy: usageToday.tutor || 0,
    tutorRestantes: Math.max(0, JARVIS_TUTOR_DAILY_LIMIT - (usageToday.tutor || 0)),
    /* v0.52.0: el banco — conteo, entradas limpias (lo más reciente
       primero) y la agrupación por módulo para su vista (§5.3). */
    bankCount: state.bank.length,
    bankEntries: state.bank,
    bankGroups: jarvisBankGroups(state.bank),
    /* v0.54.0: los cruces — snoozes vigentes o no (la UI filtra por
       fecha) y los borradores para el selector del formulario de
       feedback, del más reciente al más viejo. */
    snoozes: state.snoozes,
    drafts: draftList(state.drafts),
    draftCount: Object.keys(state.drafts).length,
  };
}

/**
 * El contexto del día para validar propuestas (lo consume el catálogo
 * jarvis-actions.js): la ruta REAL de hoy desde routeForDay + el plan
 * guardado. Si un id no está aquí, no existe para Jarvis (§1.4).
 */
export function jarvisDailyContext(bundle, catalog, today) {
  const route = routeForDay(bundle, catalog, today);
  const state = jarvisStateOf(bundle);
  const plan = state.dayPlan[today] || { focusId: null, order: null, busy: null };
  const dailies = route
    ? route.missions.map((m) => ({ id: m.id, title: m.title, completed: Boolean(m.completed) }))
    : [];
  /* v0.54.0 — el universo de los cruces, con la MISMA verdad viva:
     el Garaje entero según garageView (para validar el snooze contra
     el estado real, no contra el resumen), los snoozes y borradores
     guardados, y el mapa id→título de TODAS las misiones de campaña
     más las diarias de hoy (el universo cerrado de draft_evidence,
     §3.6). Este contexto es LOCAL (reducer y tests): lo que viaja al
     Worker es el resumen, con su propio recorte (§6.3). */
  const garage = garageView(bundle, today);
  const missionTitles = {};
  for (const campaign of Object.values(CAMPAIGNS)) {
    for (const chapter of campaign.chapters || []) {
      for (const mission of chapter.missions || []) {
        if (mission && typeof mission.id === "string") missionTitles[mission.id] = mission.title;
      }
    }
  }
  for (const daily of dailies) missionTitles[daily.id] = daily.title;
  return {
    date: today,
    dailies,
    focusId: plan.focusId,
    order: plan.order,
    busy: plan.busy,
    garage: garage.missions.map((m) => ({
      id: m.id,
      name: `${VEHICLE_SHORT[m.vehicle] || m.vehicleName || m.vehicle}: ${m.title}`,
      state: m.state,
      kind: m.kind,
    })),
    garageComplete: true,
    snoozes: state.snoozes,
    drafts: draftList(state.drafts),
    draftCount: Object.keys(state.drafts).length,
    missionTitles,
  };
}

/**
 * Vista del plan del día para paintDaily: orden efectivo (el guardado si
 * sigue siendo una permutación exacta de la ruta; si no, el del catálogo),
 * foco y día ocupado con la partición recortada a las pendientes vivas
 * (una diaria completada a mano sale sola de su lista, sin invalidar el
 * modo). `busyRequestId` es la acción aplicada que sostiene el modo, para
 * que «Volver al día completo» deshaga SIN pasar por la API.
 */
export function dailyPlanView(bundle, catalog, today) {
  const ctx = jarvisDailyContext(bundle, catalog, today);
  const state = jarvisStateOf(bundle);
  const ids = ctx.dailies.map((d) => d.id);
  const order = Array.isArray(ctx.order) && ctx.order.length === ids.length &&
    ids.every((id) => ctx.order.includes(id))
    ? [...ctx.order]
    : ids;
  const pendingIds = new Set(ctx.dailies.filter((d) => !d.completed).map((d) => d.id));
  let busy = null;
  if (ctx.busy) {
    busy = {
      minutes: ctx.busy.minutes,
      chosen: ctx.busy.chosen.filter((id) => pendingIds.has(id)),
      deferred: ctx.busy.deferred.filter((id) => pendingIds.has(id)),
    };
  }
  let busyRequestId = null;
  if (busy) {
    for (const [requestId, record] of Object.entries(state.actions)) {
      if (record.name !== "set_busy_day" || record.undone || record.date !== today) continue;
      if (record.args.minutes === ctx.busy.minutes &&
        JSON.stringify(record.args.chosen) === JSON.stringify(ctx.busy.chosen) &&
        JSON.stringify(record.args.deferred) === JSON.stringify(ctx.busy.deferred)) {
        busyRequestId = requestId;
      }
    }
  }
  return { date: today, focusId: ctx.focusId, order, busy, busyRequestId };
}

/** Recompensa derivada de Jarvis: solo XP de quiz, jamás monedas. */
export function jarvisRewards(bundle) {
  const state = jarvisStateOf(bundle);
  const xp = Object.values(state.quizXpByDate).reduce((sum, value) => sum + value, 0);
  return { xp, coins: 0 };
}

/** Problemas estructurales de play.jarvis (para validatePlayState). */
export function jarvisProblems(bundle) {
  const raw = bundle?.play?.jarvis;
  if (raw == null) return [];
  if (!isPlainObject(raw)) return ["play.jarvis debe ser un objeto"];
  const problems = [];

  if (!isPlainObject(raw.quizXpByDate)) {
    problems.push("play.jarvis.quizXpByDate debe ser un objeto");
  } else {
    for (const [date, xp] of Object.entries(raw.quizXpByDate)) {
      if (!isDateKey(date)) problems.push(`play.jarvis.quizXpByDate tiene una fecha inválida: ${date}`);
      else if (!Number.isInteger(xp) || xp < 0) problems.push(`play.jarvis.quizXpByDate.${date} debe ser un entero ≥ 0`);
    }
  }

  if (!isPlainObject(raw.usage)) {
    problems.push("play.jarvis.usage debe ser un objeto");
  } else {
    for (const [date, entry] of Object.entries(raw.usage)) {
      if (!isDateKey(date)) {
        problems.push(`play.jarvis.usage tiene una fecha inválida: ${date}`);
        continue;
      }
      if (!isPlainObject(entry)) {
        problems.push(`play.jarvis.usage.${date} debe ser un objeto`);
        continue;
      }
      for (const kind of USAGE_KINDS) {
        if (!Number.isInteger(entry[kind]) || entry[kind] < 0) {
          problems.push(`play.jarvis.usage.${date}.${kind} debe ser un entero ≥ 0`);
        }
      }
    }
  }

  if (raw.briefing !== null && raw.briefing !== undefined) {
    if (!isPlainObject(raw.briefing)) problems.push("play.jarvis.briefing debe ser un objeto o null");
    else {
      if (!isDateKey(raw.briefing.date)) problems.push("play.jarvis.briefing.date no es una fecha válida");
      if (typeof raw.briefing.text !== "string" || !raw.briefing.text) {
        problems.push("play.jarvis.briefing.text debe ser un texto no vacío");
      }
    }
  }

  /* `act` es opcional en usage (saves viejos no lo traen): si viene,
     debe ser un entero ≥ 0. */
  if (isPlainObject(raw.usage)) {
    for (const [date, entry] of Object.entries(raw.usage)) {
      if (!isPlainObject(entry) || entry.act === undefined) continue;
      if (!Number.isInteger(entry.act) || entry.act < 0) {
        problems.push(`play.jarvis.usage.${date}.act debe ser un entero ≥ 0`);
      }
    }
  }

  /* `tutor` (v0.51.0) es opcional con la misma regla que `act`. */
  if (isPlainObject(raw.usage)) {
    for (const [date, entry] of Object.entries(raw.usage)) {
      if (!isPlainObject(entry) || entry.tutor === undefined) continue;
      if (!Number.isInteger(entry.tutor) || entry.tutor < 0) {
        problems.push(`play.jarvis.usage.${date}.tutor debe ser un entero ≥ 0`);
      }
    }
  }

  /* v0.50.0 — forma ESTRICTA de las claves de manos (§6.3): una forma que
     no cuadra invalida la escritura ANTES de guardar, como en Reales. */
  if (raw.dayPlan !== undefined) {
    if (!isPlainObject(raw.dayPlan)) {
      problems.push("play.jarvis.dayPlan debe ser un objeto");
    } else {
      const dates = Object.keys(raw.dayPlan);
      if (dates.length > JARVIS_DAYPLAN_MAX_DAYS) {
        problems.push(`play.jarvis.dayPlan supera el máximo de ${JARVIS_DAYPLAN_MAX_DAYS} días`);
      }
      for (const [date, entry] of Object.entries(raw.dayPlan)) {
        const at = `play.jarvis.dayPlan.${date}`;
        if (!isDateKey(date)) { problems.push(`${at} tiene una fecha inválida`); continue; }
        if (!isPlainObject(entry)) { problems.push(`${at} debe ser un objeto`); continue; }
        if (entry.focusId !== null && entry.focusId !== undefined &&
          (typeof entry.focusId !== "string" || entry.focusId.length > 64)) {
          problems.push(`${at}.focusId debe ser un id de hasta 64 caracteres o null`);
        }
        if (entry.order !== null && entry.order !== undefined) {
          if (!Array.isArray(entry.order) || entry.order.length > 8 ||
            entry.order.some((id) => typeof id !== "string" || id.length > 64) ||
            new Set(entry.order).size !== entry.order.length) {
            problems.push(`${at}.order debe ser una lista de hasta 8 ids de hasta 64 caracteres, sin duplicados`);
          }
        }
        if (entry.busy !== null && entry.busy !== undefined) {
          const busy = entry.busy;
          const idsOk = (list) => Array.isArray(list) && list.length <= 8 &&
            list.every((id) => typeof id === "string" && id.length <= 64) &&
            new Set(list).size === list.length;
          if (!isPlainObject(busy) || !Number.isInteger(busy.minutes) ||
            busy.minutes < 0 || busy.minutes > 600 || !idsOk(busy.chosen) || !idsOk(busy.deferred) ||
            (Array.isArray(busy.chosen) && Array.isArray(busy.deferred) &&
              busy.chosen.some((id) => busy.deferred.includes(id)))) {
            problems.push(`${at}.busy debe ser { minutes: 0–600, chosen, deferred } con ids válidos y sin solape`);
          }
        }
      }
    }
  }

  if (raw.actions !== undefined) {
    if (!isPlainObject(raw.actions)) {
      problems.push("play.jarvis.actions debe ser un objeto");
    } else {
      const ids = Object.keys(raw.actions);
      if (ids.length > JARVIS_ACTIONS_MAX) {
        problems.push(`play.jarvis.actions supera el máximo de ${JARVIS_ACTIONS_MAX} registros`);
      }
      for (const [requestId, record] of Object.entries(raw.actions)) {
        const at = `play.jarvis.actions.${requestId}`;
        if (!JARVIS_REQUEST_ID_PATTERN.test(requestId)) {
          problems.push(`${at} no es un requestId válido`);
          continue;
        }
        if (!isPlainObject(record)) { problems.push(`${at} debe ser un objeto`); continue; }
        if (!JARVIS_ACTION_NAMES.includes(record.name)) {
          problems.push(`${at}.name no es una acción de la lista blanca`);
          continue;
        }
        if (!jarvisActionArgsShape(record.name, record.args)) {
          problems.push(`${at}.args no tiene la forma exacta de ${record.name}`);
        }
        if (!isDateKey(record.date)) problems.push(`${at}.date no es una fecha válida`);
        if (!isValidTs(record.at)) problems.push(`${at}.at debe ser una fecha ISO válida`);
        if (typeof record.undone !== "boolean") problems.push(`${at}.undone debe ser booleano`);
        if (!jarvisActionPrevShape(record.name, record.prev)) {
          problems.push(`${at}.prev no tiene la forma exacta de ${record.name}`);
        }
        /* v0.54.0: el cruce a la Libreta respalda su registro con el
           id de la nota creada (refId): obligatorio y con forma. */
        if (record.name === "create_libreta_note") {
          if (typeof record.refId !== "string" || !record.refId || record.refId.length > 80) {
            problems.push(`${at}.refId debe ser el id de la nota creada (hasta 80 caracteres)`);
          } else if (isPlainObject(record.prev) && record.prev.noteId !== record.refId) {
            problems.push(`${at}.prev.noteId debe coincidir con refId`);
          }
        } else if (record.refId !== undefined) {
          problems.push(`${at}.refId solo existe en create_libreta_note`);
        }
      }
    }
  }

  /* v0.54.0 — forma ESTRICTA de los cruces (§6.3): snoozes ≤40 con
     clave «garaje:<id>» y fecha válida; borradores ≤5 con su forma
     exacta. Una forma que no cuadra invalida la escritura ANTES de
     guardar, como todo lo de las manos. */
  if (raw.snoozes !== undefined) {
    if (!isPlainObject(raw.snoozes)) {
      problems.push("play.jarvis.snoozes debe ser un objeto");
    } else {
      const keys = Object.keys(raw.snoozes);
      if (keys.length > JARVIS_SNOOZES_MAX) {
        problems.push(`play.jarvis.snoozes supera el máximo de ${JARVIS_SNOOZES_MAX} entradas`);
      }
      for (const [key, until] of Object.entries(raw.snoozes)) {
        const at = `play.jarvis.snoozes.${key}`;
        if (!/^garaje:[^:]{1,64}$/.test(key)) {
          problems.push(`${at} no es una clave de snooze válida («garaje:<id>»)`);
        }
        if (!isDateKey(until)) problems.push(`${at} debe ser una fecha válida (el «hasta» del snooze)`);
      }
    }
  }

  if (raw.drafts !== undefined) {
    if (!isPlainObject(raw.drafts)) {
      problems.push("play.jarvis.drafts debe ser un objeto");
    } else {
      const ids = Object.keys(raw.drafts);
      if (ids.length > JARVIS_DRAFTS_MAX) {
        problems.push(`play.jarvis.drafts supera el máximo de ${JARVIS_DRAFTS_MAX} borradores`);
      }
      for (const [draftId, entry] of Object.entries(raw.drafts)) {
        const at = `play.jarvis.drafts.${draftId}`;
        if (!draftId || draftId.length > 80) {
          problems.push(`${at} no es un id de borrador válido`);
          continue;
        }
        if (!isPlainObject(entry)) { problems.push(`${at} debe ser un objeto`); continue; }
        if (entry.missionId !== null && entry.missionId !== undefined &&
          (typeof entry.missionId !== "string" || !entry.missionId || entry.missionId.length > 64)) {
          problems.push(`${at}.missionId debe ser un id de hasta 64 caracteres o null`);
        }
        if (entry.missionTitle !== null && entry.missionTitle !== undefined &&
          (typeof entry.missionTitle !== "string" || entry.missionTitle.length > 200)) {
          problems.push(`${at}.missionTitle debe ser un texto de hasta 200 caracteres o null`);
        }
        if (typeof entry.text !== "string" || !entry.text || entry.text.length > JARVIS_DRAFT_TEXT_MAX) {
          problems.push(`${at}.text debe ser un texto no vacío de hasta ${JARVIS_DRAFT_TEXT_MAX} caracteres`);
        }
        if (!isDateKey(entry.date)) problems.push(`${at}.date no es una fecha válida`);
        if (!isValidTs(entry.at)) problems.push(`${at}.at debe ser una fecha ISO válida`);
      }
    }
  }

  /* v0.52.0 — forma ESTRICTA del banco (§3.4.2/§6.3): topes duros de
     cantidad (100) y de largo por campo. Una forma que no cuadra
     invalida la escritura ANTES de guardar, como en Reales. */
  if (raw.bank !== undefined) {
    if (!Array.isArray(raw.bank)) {
      problems.push("play.jarvis.bank debe ser una lista");
    } else {
      if (raw.bank.length > JARVIS_BANK_CAP) {
        problems.push(`play.jarvis.bank supera el máximo de ${JARVIS_BANK_CAP} entradas`);
      }
      const seen = new Set();
      raw.bank.forEach((entry, index) => {
        const at = `play.jarvis.bank[${index}]`;
        if (!isPlainObject(entry)) {
          problems.push(`${at} debe ser un objeto`);
          return;
        }
        if (typeof entry.id !== "string" || !entry.id || entry.id.length > JARVIS_BANK_ID_MAX) {
          problems.push(`${at}.id debe ser un texto no vacío de hasta ${JARVIS_BANK_ID_MAX} caracteres`);
        } else if (seen.has(entry.id)) {
          problems.push(`${at}.id está duplicado: ${entry.id}`);
        } else {
          seen.add(entry.id);
        }
        if (typeof entry.q !== "string" || !entry.q || entry.q.length > JARVIS_BANK_Q_MAX) {
          problems.push(`${at}.q debe ser un texto no vacío de hasta ${JARVIS_BANK_Q_MAX} caracteres`);
        }
        if (typeof entry.a !== "string" || !entry.a || entry.a.length > JARVIS_BANK_A_MAX) {
          problems.push(`${at}.a debe ser un texto no vacío de hasta ${JARVIS_BANK_A_MAX} caracteres`);
        }
        if (entry.kind !== "lesson" && entry.kind !== "extra") {
          problems.push(`${at}.kind debe ser "lesson" o "extra"`);
        }
        if (entry.ref !== null && entry.ref !== undefined &&
          (typeof entry.ref !== "string" || entry.ref.length > JARVIS_BANK_REF_MAX)) {
          problems.push(`${at}.ref debe ser un texto de hasta ${JARVIS_BANK_REF_MAX} caracteres o null`);
        }
        if (entry.module !== null && entry.module !== undefined &&
          (typeof entry.module !== "string" || entry.module.length > JARVIS_BANK_MODULE_MAX)) {
          problems.push(`${at}.module debe ser un texto de hasta ${JARVIS_BANK_MODULE_MAX} caracteres o null`);
        }
        if (!isDateKey(entry.date)) problems.push(`${at}.date no es una fecha válida`);
        if (typeof entry.at !== "number" || !Number.isFinite(entry.at) || entry.at < 0) {
          problems.push(`${at}.at debe ser un número ≥ 0`);
        }
      });
    }
  }

  return problems;
}

function ensureState(draft) {
  if (!isPlainObject(draft.play)) draft.play = {};
  if (!isPlainObject(draft.play.jarvis)) draft.play.jarvis = { quizXpByDate: {}, usage: {}, briefing: null };
  const state = draft.play.jarvis;
  if (!isPlainObject(state.quizXpByDate)) state.quizXpByDate = {};
  if (!isPlainObject(state.usage)) state.usage = {};
  if (state.briefing === undefined) state.briefing = null;
  return state;
}

function usageOf(state, date) {
  if (!isPlainObject(state.usage[date])) state.usage[date] = emptyUsage();
  return state.usage[date];
}

/* v0.52.0 — el contenido de una entrada del banco, validado estricto
   ANTES de guardar (§6.3): la UI manda la pregunta y la respuesta ya
   recortadas a los topes; aquí NADA se recorta — lo que no cuadra se
   rechaza entero (BAD_BANK_ENTRY) y el save no se toca. La fecha y la
   hora las estampa la mutación desde el contexto, como en la Libreta. */
function cleanBankInput(raw) {
  if (!isPlainObject(raw)) return null;
  const id = typeof raw.id === "string" ? raw.id : "";
  if (!id || id.length > JARVIS_BANK_ID_MAX) return null;
  if (typeof raw.q !== "string" || !raw.q || raw.q.length > JARVIS_BANK_Q_MAX) return null;
  if (typeof raw.a !== "string" || !raw.a || raw.a.length > JARVIS_BANK_A_MAX) return null;
  if (raw.kind !== "lesson" && raw.kind !== "extra") return null;
  const ref = raw.ref === undefined ? null : raw.ref;
  if (ref !== null && (typeof ref !== "string" || !ref || ref.length > JARVIS_BANK_REF_MAX)) return null;
  const module = raw.module === undefined ? null : raw.module;
  if (module !== null && (typeof module !== "string" || !module || module.length > JARVIS_BANK_MODULE_MAX)) return null;
  return { id, q: raw.q, a: raw.a, kind: raw.kind, ref, module };
}

/**
 * Mutaciones de Jarvis. Las despacha gameplay.applyMutation y SIEMPRE
 * pasan por applyGameplayMutation (la única escritura del guardado).
 * Contrato del motor: { changed, duplicate, reason, paths }.
 */
export function applyJarvisMutation(draft, mutation, { date, at, catalog } = {}) {
  const no = (reason) => ({ changed: false, duplicate: false, reason, paths: [] });
  const dup = () => ({ changed: false, duplicate: true, reason: "DUPLICATE", paths: [] });
  if (jarvisProblems(draft).length) return no("SCHEMA_INVALID");
  const state = ensureState(draft);

  if (mutation.type === "jarvis.quiz") {
    /* La despacha la UI UNA sola vez, al completar la ronda: xpAwarded
     * son los aciertos × JARVIS_QUIZ_XP_PER_HIT (0, 2, 4, 6, 8 o 10).
     * Recién aquí se consume la ronda con XP del día. */
    const xp = mutation.xpAwarded;
    if (!Number.isInteger(xp) || xp < 0 || xp > JARVIS_QUIZ_XP || xp % JARVIS_QUIZ_XP_PER_HIT !== 0) {
      return no("BAD_QUIZ_XP");
    }
    const usage = usageOf(state, date);
    if (usage.quiz >= JARVIS_QUIZ_DAILY_LIMIT) return no("JARVIS_QUIZ_LIMIT");
    usage.quiz += 1;
    usage.calls += 1;
    state.quizXpByDate[date] = (state.quizXpByDate[date] || 0) + xp;
    return {
      changed: true, duplicate: false, reason: null,
      paths: [`play.jarvis.usage.${date}`, `play.jarvis.quizXpByDate.${date}`],
    };
  }

  if (mutation.type === "jarvis.usage") {
    const kind = mutation.kind;
    if (kind !== "chat" && kind !== "feedback" && kind !== "tutor") return no("BAD_USAGE_KIND");
    const limit = kind === "chat"
      ? JARVIS_CHAT_DAILY_LIMIT
      : kind === "feedback" ? JARVIS_FEEDBACK_DAILY_LIMIT : JARVIS_TUTOR_DAILY_LIMIT;
    const usage = usageOf(state, date);
    if (usage[kind] >= limit) {
      return no(kind === "chat" ? "JARVIS_CHAT_LIMIT" : kind === "feedback" ? "JARVIS_FEEDBACK_LIMIT" : "JARVIS_TUTOR_LIMIT");
    }
    usage[kind] = (usage[kind] || 0) + 1;
    usage.calls += 1;
    return { changed: true, duplicate: false, reason: null, paths: [`play.jarvis.usage.${date}`] };
  }

  if (mutation.type === "jarvis.briefing") {
    const text = typeof mutation.text === "string" ? mutation.text.trim() : "";
    if (!text) return no("BAD_BRIEFING");
    state.briefing = { date, text };
    return { changed: true, duplicate: false, reason: null, paths: ["play.jarvis.briefing"] };
  }

  /* ---- v0.50.0 · JARVIS CON MANOS: aplicar / deshacer una acción ----
     Tercera validación (la verdad final): todo se re-valida contra el
     borrador real con el catálogo jarvis-actions.js. Fail-closed:
     desconocida, mal formada o vieja = no se toca nada. Las 3 de
     Diarias viven en play.jarvis.dayPlan[date]; los cruces de la Fase
     D (v0.54.0) viven en play.jarvis.snoozes / play.jarvis.drafts, y
     la nota del cruce a la Libreta la creó el JUEGO antes (§3.5):
     aquí solo se registra, respaldada por su refId. El registro de
     todo, siempre en play.jarvis.actions. */
  if (mutation.type === "jarvis.act" || mutation.type === "jarvis.actUndo") {
    if (!isPlainObject(state.dayPlan)) state.dayPlan = {};
    if (!isPlainObject(state.actions)) state.actions = {};
    const requestId = typeof mutation.requestId === "string" ? mutation.requestId : "";
    if (!JARVIS_REQUEST_ID_PATTERN.test(requestId)) return no("ACTION_BAD_ARGS");
    const ts = isValidTs(at) ? at : new Date().toISOString();

    if (mutation.type === "jarvis.actUndo") {
      const record = state.actions[requestId];
      if (!record || record.undone) return dup();
      const action = JARVIS_ACTIONS[record.name];
      if (!action) return no("ACTION_UNKNOWN");

      if (action.cross === "snooze") {
        if (!isPlainObject(state.snoozes)) state.snoozes = {};
        const key = `garaje:${record.args.routineId}`;
        const appliedUntil = addDaysKey(record.date, record.args.days);
        const current = typeof state.snoozes[key] === "string" ? state.snoozes[key] : null;
        if (current === appliedUntil) {
          /* Sigue vivo el snooze de ESTA acción: se restaura el anterior. */
          if (record.prev.until) state.snoozes[key] = record.prev.until;
          else delete state.snoozes[key];
        } else if (current !== null || record.prev.until) {
          /* El snooze vivo ya no es el de esta acción (otro lo
             reemplazó), o José lo despertó a mano y había un snooze
             anterior que NO debe resucitar: el deshacer no pisa lo
             que él hizo después (§7.2 #9). */
          return no("ACTION_STALE");
        }
        /* current === null y prev.until === null: José ya lo despertó
           a mano; el efecto no existe y solo se marca el registro. */
        record.undone = true;
        return {
          changed: true, duplicate: false, reason: null,
          paths: ["play.jarvis.snoozes", `play.jarvis.actions.${requestId}`],
        };
      }

      if (action.cross === "draft") {
        if (!isPlainObject(state.drafts)) state.drafts = {};
        const entry = state.drafts[requestId];
        /* Un borrador no se edita desde ningún panel: si el texto vivo
           difiere del aplicado, fail-closed. Si ya no está (un FIFO
           posterior lo sacó), no hay nada que borrar. */
        if (entry && entry.text !== record.args.text) return no("ACTION_STALE");
        if (entry) delete state.drafts[requestId];
        /* El desalojado por el FIFO vuelve SOLO si hay lugar: si un
           borrador posterior ocupa el cupo, su propio deshacer lo
           restaurará — nunca se supera el tope de 5. */
        if (record.prev.evicted && !state.drafts[record.prev.evicted.id] &&
          Object.keys(state.drafts).length < JARVIS_DRAFTS_MAX) {
          const ev = record.prev.evicted;
          state.drafts[ev.id] = {
            missionId: ev.missionId, missionTitle: ev.missionTitle,
            text: ev.text, date: ev.date, at: ev.at,
          };
        }
        record.undone = true;
        return {
          changed: true, duplicate: false, reason: null,
          paths: ["play.jarvis.drafts", `play.jarvis.actions.${requestId}`],
        };
      }

      if (action.cross === "libreta") {
        /* La nota es de José: si la editó a mano después, el deshacer
           NO la toca ni marca nada (§3.5). Si sigue intacta (o ya no
           existe), aquí solo se marca el registro: el borrado lo
           despacha la UI con libreta.delete tras este OK — la
           mutación de la Libreta de siempre, no este reducer. */
        const notes = isPlainObject(draft.play?.libreta) && Array.isArray(draft.play.libreta.notes)
          ? draft.play.libreta.notes : [];
        const note = notes.find((n) => isPlainObject(n) && n.id === record.refId);
        if (note && (note.texto !== record.args.text ||
          (typeof note.titulo === "string" ? note.titulo : "") !== "")) {
          return no("ACTION_STALE");
        }
        record.undone = true;
        return {
          changed: true, duplicate: false, reason: null,
          paths: [`play.jarvis.actions.${requestId}`],
        };
      }

      const entry = isPlainObject(state.dayPlan[record.date])
        ? state.dayPlan[record.date]
        : { focusId: null, order: null, busy: null };
      /* Si José cambió el ajuste a mano después, el deshacer NO lo pisa. */
      if (!jarvisAppliedIntact(record.name, record.args, entry)) return no("ACTION_STALE");
      action.revertTo(entry, record.prev);
      state.dayPlan[record.date] = entry;
      record.undone = true;
      /* Deshacer NO libera cupo del día: el tope es de aplicaciones. */
      return {
        changed: true, duplicate: false, reason: null,
        paths: [`play.jarvis.dayPlan.${record.date}`, `play.jarvis.actions.${requestId}`],
      };
    }

    /* jarvis.act */
    if (state.actions[requestId]) return dup();
    const name = typeof mutation.name === "string" ? mutation.name : "";
    const action = JARVIS_ACTIONS[name];
    if (!action) return no("ACTION_UNKNOWN");
    const usage = usageOf(state, date);
    if ((usage.act || 0) >= JARVIS_ACT_DAILY_LIMIT) return no("JARVIS_ACT_CAP");
    if (!catalog) return no("ACTION_BAD_ARGS");
    const ctx = jarvisDailyContext(draft, catalog, date);
    const code = validateJarvisAction(ctx, name, mutation.args);
    if (code) return no(code);
    const args = structuredClone(mutation.args);
    const record = { name, args, date, at: ts, undone: false, prev: null };
    const paths = [`play.jarvis.actions.${requestId}`, `play.jarvis.usage.${date}`];

    if (action.cross === "snooze") {
      /* §3.4: solo se duerme el AVISO — play.garaje y su reloj jamás
         se tocan; la rutina sigue vencida/por vencer en su panel. */
      if (!isPlainObject(state.snoozes)) state.snoozes = {};
      record.prev = action.prevOf(ctx, args);
      state.snoozes[`garaje:${args.routineId}`] = addDaysKey(date, args.days);
      paths.unshift("play.jarvis.snoozes");
    } else if (action.cross === "draft") {
      /* §3.6: el borrador se guarda con su misión resuelta DESDE el
         catálogo (jamás desde la IA) y el FIFO saca el más viejo —
         el desalojado queda en la foto para poder deshacer. */
      if (!isPlainObject(state.drafts)) state.drafts = {};
      record.prev = action.prevOf(ctx, args);
      if (record.prev.evicted) delete state.drafts[record.prev.evicted.id];
      state.drafts[requestId] = {
        missionId: args.missionId ?? null,
        missionTitle: args.missionId ? (ctx.missionTitles[args.missionId] ?? null) : null,
        text: args.text,
        date,
        at: ts,
      };
      paths.unshift("play.jarvis.drafts");
    } else if (action.cross === "libreta") {
      /* §3.5 — orden registro-DESPUÉS: la nota YA la creó la UI con
         libreta.create (tras el «Aceptar») y su id viaja como refId.
         Sin una nota real que respalde el registro — con EXACTAMENTE
         el texto dictado y sin título — no se registra nada:
         fail-closed, como todo lo de las manos. */
      const refId = typeof mutation.refId === "string" ? mutation.refId : "";
      if (!refId || refId.length > 80) return no("ACTION_BAD_ARGS");
      const notes = isPlainObject(draft.play?.libreta) && Array.isArray(draft.play.libreta.notes)
        ? draft.play.libreta.notes : [];
      const note = notes.find((n) => isPlainObject(n) && n.id === refId);
      if (!note || note.texto !== args.text ||
        (typeof note.titulo === "string" ? note.titulo : "") !== "") {
        return no("ACTION_BAD_ARGS");
      }
      record.prev = { noteId: refId };
      record.refId = refId;
    } else {
      record.prev = action.prevOf(ctx, args);
      const entry = isPlainObject(state.dayPlan[date])
        ? state.dayPlan[date]
        : { focusId: null, order: null, busy: null };
      if (!isPlainObject(entry)) return no("ACTION_BAD_ARGS");
      const cleanEntry = {
        focusId: typeof entry.focusId === "string" ? entry.focusId : null,
        order: Array.isArray(entry.order) ? [...entry.order] : null,
        busy: isPlainObject(entry.busy) ? structuredClone(entry.busy) : null,
      };
      action.applyTo(cleanEntry, args);
      state.dayPlan[date] = cleanEntry;
      paths.unshift(`play.jarvis.dayPlan.${date}`);
    }

    state.actions[requestId] = record;
    usage.act = (usage.act || 0) + 1;
    /* Podas (§6.3): dayPlan ≤ 62 días y actions ≤ 200 con ventana de
       30 días — el registro se mantiene en pocos KB. */
    const planDates = Object.keys(state.dayPlan).sort();
    while (planDates.length > JARVIS_DAYPLAN_MAX_DAYS) {
      delete state.dayPlan[planDates.shift()];
    }
    const cutoff = new Date(Date.parse(`${date}T00:00:00.000Z`) - JARVIS_ACTIONS_KEEP_DAYS * 86400000)
      .toISOString().slice(0, 10);
    for (const [id, record] of Object.entries(state.actions)) {
      if (record.date < cutoff) delete state.actions[id];
    }
    const actionIds = Object.keys(state.actions)
      .sort((a, b) => String(state.actions[a].at).localeCompare(String(state.actions[b].at)));
    while (actionIds.length > JARVIS_ACTIONS_MAX) {
      delete state.actions[actionIds.shift()];
    }
    return { changed: true, duplicate: false, reason: null, paths };
  }

  /* ---- v0.54.0 · DESPERTAR UN AVISO DEL GARAJE A MANO (§3.4) ----
     El chip «pospuesta hasta…» del Garaje se despierta con un toque:
     se borra el snooze si existe (el «!» y el briefing vuelven a
     contar la rutina). No es una acción de Jarvis: no consume cupo,
     no entra al registro y no pasa por el Worker. Si no había snooze,
     es duplicate (nada que hacer). */
  if (mutation.type === "jarvis.snoozeClear") {
    const routineId = typeof mutation.routineId === "string" ? mutation.routineId : "";
    if (!routineId || routineId.length > 64) return no("ACTION_BAD_ARGS");
    if (!isPlainObject(state.snoozes)) state.snoozes = {};
    const key = `garaje:${routineId}`;
    if (!(key in state.snoozes)) return dup();
    delete state.snoozes[key];
    return { changed: true, duplicate: false, reason: null, paths: ["play.jarvis.snoozes"] };
  }

  /* ---- v0.52.0 · EL BANCO DE PREGUNTAS (§3.4) ----
     Guardar y borrar son mutaciones del JUEGO (el 📌 y el ✕ de José),
     jamás algo que el modelo haga o afirme: Jarvis ni se entera. Sin
     XP y sin monedas — el banco escribe SOLO play.jarvis.bank, y
     derive() ni lo mira. Al tope de 100, guardar exige borrar una
     primero (JARVIS_BANK_CAP): FIFO silencioso, nunca. */
  if (mutation.type === "jarvis.bankSave") {
    if (!Array.isArray(state.bank)) state.bank = [];
    const entry = cleanBankInput(mutation.entry);
    if (!entry) return no("BAD_BANK_ENTRY");
    if (state.bank.some((saved) => saved.id === entry.id)) return dup();
    if (state.bank.length >= JARVIS_BANK_CAP) return no("JARVIS_BANK_CAP");
    const atMs = Date.parse(at);
    state.bank.unshift({
      ...entry,
      date,
      at: Number.isFinite(atMs) ? atMs : Date.now(),
    });
    return { changed: true, duplicate: false, reason: null, paths: ["play.jarvis.bank"] };
  }

  if (mutation.type === "jarvis.bankRemove") {
    if (!Array.isArray(state.bank)) state.bank = [];
    const bankId = typeof mutation.bankId === "string" ? mutation.bankId : "";
    const index = state.bank.findIndex((saved) => saved.id === bankId);
    /* Id inexistente = ya no está: DUPLICATE sin cambios (§6.3). */
    if (index < 0) return dup();
    state.bank.splice(index, 1);
    return { changed: true, duplicate: false, reason: null, paths: ["play.jarvis.bank"] };
  }

  return no("UNKNOWN_MUTATION");
}

const VEHICLE_SHORT = { carro: "Accent", moto: "Formula X2" };

/**
 * El resumen de progreso que viaja al Worker (spec §4.5): se arma SOLO
 * con las vistas existentes — derive(), campaignView(), garageView(),
 * ianView() y el mismo cálculo de Diarias del panel «Hoy» — y contiene
 * únicamente datos del juego. Nada de correos, nombres de terceros ni
 * identificadores.
 */
export function buildProgressSummary(bundle, catalog, today) {
  const derived = derive(sourcesFromMigrated(bundle, catalog), catalog, today);
  const streak = deriveStreak(bundle);
  const route = routeForDay(bundle, catalog, today);

  const diarias = {
    hechas: route ? route.missions.filter((mission) => mission.completed).length : 0,
    total: route ? route.missions.length : 0,
    pendientes: route
      ? route.missions.filter((mission) => !mission.completed).map((mission) => mission.title).slice(0, 3)
      : [],
  };

  /* La próxima misión de campaña: primero el evento activo (Operación
     Entrevista) y luego el resto de campañas en su orden del catálogo. */
  let proximaMisionCampana = null;
  const order = ["entrevista", ...Object.keys(CAMPAIGNS).filter((id) => id !== "entrevista")];
  for (const id of order) {
    const view = campaignView(bundle, id);
    if (!view) continue;
    const next = view.chapters
      .flatMap((chapter) => chapter.missions)
      .find((mission) => !mission.completed && mission.unlocked);
    if (next) {
      proximaMisionCampana = { campana: view.name, mision: next.title };
      break;
    }
  }

  const garage = garageView(bundle, today);
  /* v0.54.0 — la supresión del snooze ocurre AQUÍ, al componer la
     vista (§3.4): una rutina con snooze vigente (until ≥ hoy) no
     aparece en el briefing ni en el contexto de acciones, aunque su
     reloj sigue corriendo y su panel la muestra pospuesta. */
  const snoozes = jarvisStateOf(bundle).snoozes;
  const isSnoozed = (mission) => {
    const until = snoozes[`garaje:${mission.id}`];
    return typeof until === "string" && until >= today;
  };
  const garajePorVencer = garage.missions
    .filter((mission) => (mission.state === "vencida" || mission.state === "por-vencer") && !isSnoozed(mission))
    .slice(0, 3)
    .map((mission) => `${VEHICLE_SHORT[mission.vehicle] || mission.vehicleName}: ${mission.title}`);

  /* v0.50.0 — CONTEXTO DE ACCIONES (§6.3): los ids REALES y vigentes
     sobre los que Jarvis puede proponer. Si un id no está aquí, no
     existe para Jarvis. El Worker v3 lo ignora; el v4 lo usa para
     validar tool_calls. El resumen completo se mantiene ≤ 3 KB. */
  const ctx = jarvisDailyContext(bundle, catalog, today);
  /* v0.54.0 — el universo de draft_evidence (§3.6): la próxima misión
     pendiente y desbloqueada de CADA campaña, con su id real — el
     Worker solo puede citar ids de esta lista (o de las diarias). */
  const misiones = [];
  for (const id of Object.keys(CAMPAIGNS)) {
    const view2 = campaignView(bundle, id);
    if (!view2) continue;
    const next = view2.chapters
      .flatMap((chapter) => chapter.missions)
      .find((mission) => !mission.completed && mission.unlocked);
    if (next) misiones.push({ id: next.id, titulo: next.title });
    if (misiones.length >= 12) break;
  }
  const accionesContext = {
    diarias: ctx.dailies.map((d) => ({
      id: d.id, titulo: d.title, hecha: d.completed, foco: ctx.focusId === d.id,
    })),
    garajePorVencer: garage.missions
      .filter((mission) => (mission.state === "vencida" || mission.state === "por-vencer") && !isSnoozed(mission))
      .slice(0, 3)
      .map((mission) => ({
        id: mission.id,
        nombre: `${VEHICLE_SHORT[mission.vehicle] || mission.vehicleName}: ${mission.title}`,
        estado: mission.state,
      })),
    misiones,
    diaOcupado: ctx.busy
      ? { minutes: ctx.busy.minutes, chosen: [...ctx.busy.chosen], deferred: [...ctx.busy.deferred] }
      : null,
  };

  const ian = ianView(bundle, today);
  const ianPorVencer = ian.missions
    .filter((mission) => mission.state === "vencida" || mission.state === "por-vencer")
    .slice(0, 3)
    .map((mission) => mission.title);

  const diasEntrevista = daysBetween(today, ENTREVISTA_FECHA);
  const view = jarvisView(bundle, today);
  const ladder = Array.isArray(catalog?.odeLadder) ? catalog.odeLadder : [];
  const nextRung = ladder.find((rung) => Number(rung.xp) > derived.totalXP);

  return {
    nivel: derived.odeLevel,
    xpTotal: derived.totalXP,
    xpParaSiguienteNivel: nextRung ? nextRung.xp - derived.totalXP : 0,
    rachaDias: streak.streak,
    diaDelPlan: planDayFor(bundle, today),
    diarias,
    proximaMisionCampana,
    garajePorVencer,
    ianPorVencer,
    entrevistaEnvista: diasEntrevista !== null && diasEntrevista >= 0
      ? { fecha: ENTREVISTA_FECHA, diasRestantes: diasEntrevista }
      : null,
    jarvisHoy: {
      quizXp: view.quizXpToday,
      quizRestantes: view.quizRestantes,
      chatRestantes: view.chatRestantes,
      feedbackRestantes: view.feedbackRestantes,
      acciones: view.accionesHoy,
    },
    /* v0.52.0 — la línea del banco en el briefing (§2.5): el resumen
       lleva el conteo SOLO si hay ≥ 3 guardadas sin repasar, para no
       naggear. El Worker puede usarlo en su saludo y el saludo local
       (jarvisLocalGreeting) lo dice tal cual. Como el repaso de v1 no
       guarda calificaciones (§3.4.3), «sin repasar» = guardadas. */
    bancoSinRepasar: view.bankCount >= 3 ? view.bankCount : null,
    accionesContext,
  };
}
