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
  JARVIS_REQUEST_ID_PATTERN,
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
  return { quiz: 0, chat: 0, feedback: 0, calls: 0, act: 0 };
}

export const JARVIS_DAYPLAN_MAX_DAYS = 62;
export const JARVIS_ACTIONS_MAX = 200;
export const JARVIS_ACTIONS_KEEP_DAYS = 30;

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
    };
  }
  return out;
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

  return { quizXpByDate, usage, briefing, dayPlan, actions };
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
  return {
    date: today,
    dailies: route
      ? route.missions.map((m) => ({ id: m.id, title: m.title, completed: Boolean(m.completed) }))
      : [],
    focusId: plan.focusId,
    order: plan.order,
    busy: plan.busy,
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
      }
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
    if (kind !== "chat" && kind !== "feedback") return no("BAD_USAGE_KIND");
    const limit = kind === "chat" ? JARVIS_CHAT_DAILY_LIMIT : JARVIS_FEEDBACK_DAILY_LIMIT;
    const usage = usageOf(state, date);
    if (usage[kind] >= limit) return no(kind === "chat" ? "JARVIS_CHAT_LIMIT" : "JARVIS_FEEDBACK_LIMIT");
    usage[kind] += 1;
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
     desconocida, mal formada o vieja = no se toca nada. El efecto vive
     SOLO en play.jarvis.dayPlan[date]; el registro, en play.jarvis.actions. */
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
    const prev = action.prevOf(ctx);
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
    state.actions[requestId] = { name, args, date, at: ts, undone: false, prev };
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
    return {
      changed: true, duplicate: false, reason: null,
      paths: [
        `play.jarvis.dayPlan.${date}`,
        `play.jarvis.actions.${requestId}`,
        `play.jarvis.usage.${date}`,
      ],
    };
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
  const garajePorVencer = garage.missions
    .filter((mission) => mission.state === "vencida" || mission.state === "por-vencer")
    .slice(0, 3)
    .map((mission) => `${VEHICLE_SHORT[mission.vehicle] || mission.vehicleName}: ${mission.title}`);

  /* v0.50.0 — CONTEXTO DE ACCIONES (§6.3): los ids REALES y vigentes
     sobre los que Jarvis puede proponer. Si un id no está aquí, no
     existe para Jarvis. El Worker v3 lo ignora; el v4 lo usa para
     validar tool_calls. El resumen completo se mantiene ≤ 3 KB. */
  const ctx = jarvisDailyContext(bundle, catalog, today);
  const accionesContext = {
    diarias: ctx.dailies.map((d) => ({
      id: d.id, titulo: d.title, hecha: d.completed, foco: ctx.focusId === d.id,
    })),
    garajePorVencer: garage.missions
      .filter((mission) => mission.state === "vencida" || mission.state === "por-vencer")
      .slice(0, 3)
      .map((mission) => ({
        id: mission.id,
        nombre: `${VEHICLE_SHORT[mission.vehicle] || mission.vehicleName}: ${mission.title}`,
        estado: mission.state,
      })),
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
    accionesContext,
  };
}
