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
  return { quiz: 0, chat: 0, feedback: 0, calls: 0 };
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
      };
    }
  }

  const briefing =
    isPlainObject(raw.briefing) && isDateKey(raw.briefing.date) && typeof raw.briefing.text === "string" && raw.briefing.text
      ? { date: raw.briefing.date, text: raw.briefing.text }
      : null;

  return { quizXpByDate, usage, briefing };
}

/** Vista del día: topes restantes y el saludo en caché, si es de hoy. */
export function jarvisView(bundle, today) {
  const state = jarvisStateOf(bundle);
  const usageToday = state.usage[today] || emptyUsage();
  const quizRestantes = Math.max(0, JARVIS_QUIZ_DAILY_LIMIT - usageToday.quiz);
  return {
    quizXpToday: state.quizXpByDate[today] || 0,
    quizRestantes,
    quizXpDisponible: quizRestantes > 0 ? JARVIS_QUIZ_XP : 0,
    chatRestantes: Math.max(0, JARVIS_CHAT_DAILY_LIMIT - usageToday.chat),
    feedbackRestantes: Math.max(0, JARVIS_FEEDBACK_DAILY_LIMIT - usageToday.feedback),
    briefingHoy: state.briefing && state.briefing.date === today ? state.briefing.text : null,
  };
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
export function applyJarvisMutation(draft, mutation, { date } = {}) {
  const no = (reason) => ({ changed: false, duplicate: false, reason, paths: [] });
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
    },
  };
}
