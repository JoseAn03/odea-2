/**
 * Costa Neón: LA TORRE DE CONTROL viva (zona de inglés), sin DOM ni
 * almacenamiento. Fase A (v0.55.0) del diseño aprobado
 * (diseno-zona-ingles-odea2.md, expansión v3): el sistema vivo
 * «TURNOS DE TORRE» completo — 17 rutinas con su propio reloj y 9
 * hitos de una sola vez, TODO desbloqueado desde el día 1, con el
 * molde del Garaje Vivo y del Estudio Neón — más dos piezas propias
 * de la Torre:
 *
 *  · EL TOPE DE TURNO (§E.3): el vivo paga como máximo 850 XP / ₡58
 *    por semana (semana ISO). Pasado el tope, las rutinas se siguen
 *    completando y REGISTRANDO — cuentan para relojes, tarjeta
 *    semanal e hitos — pero su registro paga 0 hasta la semana
 *    siguiente. La práctica nunca se bloquea; la granja sí. Los
 *    hitos son de una sola vez y quedan FUERA del tope (son el
 *    bucket «una sola vez» de los totales del diseño, no el
 *    repetible). El registro guarda lo PAGADO en `reward` y, cuando
 *    el tope recortó, `capped: true` con el monto íntegro en
 *    `fullReward` para auditoría.
 *
 *  · EL TURNO DEL DÍA (§5.3): una sesión determinista por fecha con
 *    3 bloques (apertura · central · cierre) rotados por la matriz
 *    método × habilidad sobre las rutinas reales — completar un
 *    bloque ES completar su rutina, no hay sistema paralelo. El
 *    mismo método no abre dos días seguidos (rotación por índice
 *    sobre listas de ≥4) y el viernes el bloque central es el
 *    «Turno especial», alternando simulacro de entrevista y
 *    dictogloss por paridad de semana.
 *
 * La campaña DESPEGUE (58 misiones), el SRS, el Laboratorio de Voz y
 * el Tablero llegan en fases B–D: aquí no hay ni rastro de su estado
 * (srs/hvpt/bank del diseño §8 entran con su fase). El estado vive
 * SOLO en `play.ingles`, aditivo: un save sin la sección deriva 0 y
 * ningún total previo cambia (precedente marca/ian).
 */

import { isoWeekKey } from "./derive.js";

export const INGLES_VERSION = 1;
export const DUE_SOON_DAYS = 3;
export const TOPE_TURNO_XP = 850;
export const TOPE_TURNO_COINS = 58;

export const INGLES_SKILLS = {
  voz: { id: "voz", name: "VOZ", icon: "🗣️" },
  oido: { id: "oido", name: "OÍDO", icon: "👂" },
  palabras: { id: "palabras", name: "PALABRAS", icon: "🗂️" },
  entrevista: { id: "entrevista", name: "ENTREVISTA", icon: "🎙️" }
};

/* Catálogo v3 (§5.1 + §E.2): [habilidad, ranura del Turno del día,
   días de reloj, XP, ₡]. Primera vuelta de rutinas: 870 XP / ₡58;
   hitos: 780 XP / ₡48. */
const CATALOG = [
  { id: "ingles-01", kind: "rutina", skill: "voz", slot: "central", days: 2, xp: 40, coins: 3,
    title: "Shadowing de turno",
    brief: "10 min repitiendo contra el modelo en voz alta, grabándote: pitch → respuestas de entrevista → clips de datos. La dosis del protocolo, no una versión aguada." },
  { id: "ingles-02", kind: "rutina", skill: "palabras", slot: "cierre", days: 2, xp: 40, coins: 3,
    title: "Repaso de fraseología",
    brief: "La sesión de tarjetas vencidas de tu fraseología: palabras y frases, reconocimiento y producción, decks entrelazados." },
  { id: "ingles-03", kind: "rutina", skill: "oido", slot: "central", days: 3, xp: 50, coins: 3,
    title: "Escucha real",
    brief: "10 min de podcast o video a velocidad real, con el ciclo corto: 1 predicción antes, 1 frase oída anotada después." },
  { id: "ingles-04", kind: "rutina", skill: "voz", slot: "cierre", days: 3, xp: 40, coins: 3,
    title: "Decilo en inglés",
    brief: "3 frases de tu trabajo de hoy, dichas en inglés y grabadas: una de datos, una de cliente, una libre." },
  { id: "ingles-05", kind: "rutina", skill: "entrevista", slot: "central", days: 3, xp: 40, coins: 3,
    title: "Radio con Jarvis",
    brief: "Conversación corta con Jarvis en inglés sobre tu día: 4 intercambios, una sola corrección por mensaje." },
  { id: "ingles-06", kind: "rutina", skill: "entrevista", slot: "central", days: 7, xp: 60, coins: 4,
    title: "Pregunta de entrevista",
    brief: "Una tarjeta del banco al azar, respondida en voz alta y grabada, sin prepararla. La misma vuelve el próximo ciclo: la segunda pasada es la que cuenta." },
  { id: "ingles-07", kind: "rutina", skill: "palabras", slot: "cierre", days: 7, xp: 60, coins: 4,
    title: "Frases en llamada real",
    brief: "Usá 3 palabras o frases de tu fraseología en llamadas reales del aeropuerto y registrá cuáles fueron. El mundo real como examen continuo." },
  { id: "ingles-08", kind: "rutina", skill: "oido", slot: "apertura", days: 7, xp: 50, coins: 3,
    title: "Dictado relámpago",
    brief: "60–90 s de clip nuevo: escribí 3 frases exactas. Segmentar el habla unida, sin pausa larga." },
  { id: "ingles-09", kind: "rutina", skill: "palabras", slot: "apertura", days: 7, xp: 50, coins: 3,
    title: "Quiz de fraseología",
    brief: "Un quiz de vocabulario con Jarvis, con las reglas del quiz de siempre. La rutina paga por el hábito; el quiz, por su propia regla." },
  { id: "ingles-10", kind: "rutina", skill: "voz", slot: "central", days: 30, xp: 80, coins: 5,
    title: "Chequeo de torre",
    brief: "El chequeo mensual: prueba del teclado (5 frases) + un dictado corto de referencia. Tu tendencia, sin prometer niveles." },
  { id: "ingles-11", kind: "rutina", skill: "oido", slot: "apertura", days: 7, xp: 50, coins: 3,
    title: "Contraste de la semana",
    brief: "La sesión del contraste en curso: identificación con voces rotando, feedback por intento. El oído con su propio turno fijo." },
  { id: "ingles-12", kind: "rutina", skill: "entrevista", slot: "central", days: 7, xp: 60, coins: 4,
    title: "Contrarreloj libre",
    brief: "Cualquier tarjeta del banco de entrevista en 60 → 45 → 30 segundos. La presión de tiempo automatiza los bloques." },
  { id: "ingles-13", kind: "rutina", skill: "oido", slot: "central", days: 7, xp: 60, coins: 4,
    title: "Noticias de datos",
    brief: "Oí un segmento corto de noticias de datos o negocios y decí un resumen de 3 frases en voz alta, grabado. Escucha que termina en boca." },
  { id: "ingles-14", kind: "rutina", skill: "palabras", slot: "cierre", days: 3, xp: 40, coins: 3,
    title: "Palabra robada",
    brief: "Rescatá 1 palabra o frase oída en el trabajo o en un video, guardala en tu fraseología con tu frase propia y usala una vez." },
  { id: "ingles-15", kind: "rutina", skill: "oido", slot: "central", days: 14, xp: 60, coins: 4,
    title: "Dictogloss exprés",
    brief: "Clip de ~45 s: reconstruí lo oído con tus notas y compará contra la transcripción. Un hueco va a tu bitácora de errores." },
  { id: "ingles-16", kind: "rutina", skill: "voz", slot: "cierre", days: 7, xp: 50, coins: 3,
    title: "Conversación libre",
    brief: "2 minutos hablando de un tema que no es trabajo: el fin de semana, un viaje, un juego de Ian, una película. Fluidez sin guion." },
  { id: "ingles-17", kind: "rutina", skill: "voz", slot: "apertura", days: 2, xp: 40, coins: 3,
    title: "Transmisión breve",
    brief: "Dictale 5 frases de tu fraseología al teclado en inglés y registrá cuántas salieron limpias. El espejo de inteligibilidad, en versión corta." },
  { id: "ingles-h1", kind: "hito", skill: "voz", slot: null, days: 0, xp: 60, coins: 4,
    title: "Primera transmisión",
    brief: "Tu primera grabación de práctica en la Torre: el pitch, de corrido, escuchado una vez entero." },
  { id: "ingles-h2", kind: "hito", skill: "palabras", slot: null, days: 0, xp: 80, coins: 5,
    title: "25 tarjetas graduadas",
    brief: "25 tarjetas de fraseología graduadas: aciertos espaciados repetidos, no un solo acierto." },
  { id: "ingles-h3", kind: "hito", skill: "palabras", slot: null, days: 0, xp: 80, coins: 5,
    title: "50 tarjetas graduadas",
    brief: "Media fraseología tuya, instalada." },
  { id: "ingles-h4", kind: "hito", skill: "palabras", slot: null, days: 0, xp: 100, coins: 6,
    title: "100 tarjetas graduadas",
    brief: "Casi todo el banco base, en tu boca." },
  { id: "ingles-h5", kind: "hito", skill: "oido", slot: null, days: 0, xp: 100, coins: 6,
    title: "Medición registrada",
    brief: "Tu primer EF SET hecho y registrado, sea el puntaje que sea. La Torre celebra que te midás, no el número." },
  { id: "ingles-h6", kind: "hito", skill: "entrevista", slot: null, days: 0, xp: 80, coins: 5,
    title: "Primer simulacro completo",
    brief: "Un mock entero grabado de corrido: pitch, estrella, brecha, salario y tus preguntas." },
  { id: "ingles-h7", kind: "hito", skill: "palabras", slot: null, days: 0, xp: 100, coins: 6,
    title: "150 tarjetas graduadas",
    brief: "Solo alcanzable cuando tu banco crece más allá de las 130 base: el hito que empuja el crecimiento." },
  { id: "ingles-h8", kind: "hito", skill: "entrevista", slot: null, days: 0, xp: 100, coins: 6,
    title: "Banco completo, dos pasadas",
    brief: "Las 18 tarjetas del banco de entrevista con 2 o más intentos grabados cada una: la repetición de tarea, completada en todo el banco." },
  { id: "ingles-h9", kind: "hito", skill: "oido", slot: null, days: 0, xp: 80, coins: 5,
    title: "Tres acentos",
    brief: "Controles aprobados en materiales de acento de EE. UU., británico e indio: el oído ya no tiene acento dueño." }
];

export const INGLES_ITEMS = CATALOG;
const byId = new Map(INGLES_ITEMS.map((m) => [m.id, m]));

const plain = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const DAY_MS = 86400000;
const dayNum = (d) => Math.round(Date.parse(`${d}T00:00:00Z`) / DAY_MS);
export const daysBetween = (a, b) => dayNum(b) - dayNum(a);
const addDays = (d, n) => new Date((dayNum(d) + n) * DAY_MS).toISOString().slice(0, 10);
const validDate = (d) => typeof d === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(`${d}T00:00:00Z`)) &&
  new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;

export function inglesStateOf(bundle) {
  const value = bundle?.play?.ingles;
  return plain(value) ? value : { version: INGLES_VERSION, log: {}, records: {} };
}

function itemStatus(item, entry, today) {
  if (item.kind === "hito") {
    return entry
      ? { state: "completada", label: "COMPLETADO", dueIn: null, paysNow: false }
      : { state: "pendiente", label: "PENDIENTE", dueIn: null, paysNow: true };
  }
  if (!entry) return { state: "sin-registro", label: "SIN REGISTRO", dueIn: null, paysNow: true };
  const due = addDays(entry.lastDate, item.days);
  const dueIn = daysBetween(today, due);
  if (dueIn < 0) return { state: "vencida", label: "VENCIDA", dueIn, paysNow: true };
  if (dueIn <= DUE_SOON_DAYS) return { state: "por-vencer", label: "POR VENCER", dueIn, paysNow: true };
  return { state: "al-dia", label: "AL DÍA", dueIn, paysNow: false };
}

/** Lo ya PAGADO por rutinas en la semana ISO de `date` (el Tope). */
export function inglesWeekPaid(bundle, date) {
  const state = inglesStateOf(bundle);
  const week = isoWeekKey(date);
  const out = { xp: 0, coins: 0, week };
  for (const record of Object.values(plain(state.records) ? state.records : {})) {
    const item = byId.get(record?.missionId);
    if (!item || item.kind !== "rutina" || !validDate(record.date)) continue;
    if (isoWeekKey(record.date) !== week) continue;
    out.xp += Number(record?.reward?.xp) || 0;
    out.coins += Number(record?.reward?.coins) || 0;
  }
  return out;
}

/**
 * El Turno del día (§5.3): 3 bloques deterministas por fecha sobre
 * las rutinas de la vista. Apertura rota por índice entre las de su
 * ranura (nunca el mismo método dos días seguidos: las ranuras
 * mezclan habilidades y cada lista tiene ≥4), el viernes el bloque
 * central es el Turno especial (entrevista en semanas pares de
 * índice, dictogloss en impares).
 */
export function turnoDelDia(items, today) {
  const rutinas = items.filter((m) => m.kind === "rutina" && m.slot);
  const pick = (slot, stride) => {
    const list = rutinas.filter((m) => m.slot === slot);
    if (!list.length) return null;
    return list[Math.abs(dayNum(today) * stride) % list.length];
  };
  let central = pick("central", 1);
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
  let special = false;
  if (dow === 5) {
    const weekIndex = Math.floor(dayNum(today) / 7);
    const specialId = weekIndex % 2 === 0 ? "ingles-06" : "ingles-15";
    central = rutinas.find((m) => m.id === specialId) || central;
    special = true;
  }
  const blocks = [
    { slot: "apertura", label: "APERTURA", item: pick("apertura", 1) },
    { slot: "central", label: special ? "CENTRAL · TURNO ESPECIAL" : "CENTRAL", item: central },
    { slot: "cierre", label: "CIERRE", item: pick("cierre", 1) }
  ].filter((b) => b.item);
  return { date: today, special, blocks };
}

export function inglesView(bundle, today) {
  const state = inglesStateOf(bundle);
  const log = plain(state.log) ? state.log : {};
  const items = INGLES_ITEMS.map((m) => {
    const entry = plain(log[m.id]) ? log[m.id] : null;
    const status = itemStatus(m, entry, today);
    return {
      ...m,
      lastDate: entry?.lastDate || null,
      times: entry?.times || 0,
      ...status
    };
  });
  const byItemId = new Map(items.map((m) => [m.id, m]));
  const rutinas = items.filter((m) => m.kind === "rutina");
  const hitos = items.filter((m) => m.kind === "hito");
  const week = rutinas.filter((m) => m.state !== "al-dia" || (m.dueIn != null && m.dueIn <= 7));
  const hitosDone = hitos.filter((m) => m.state === "completada").length;
  const weekPaid = inglesWeekPaid(bundle, today);
  return {
    today, items, week,
    byItemId,
    skills: Object.values(INGLES_SKILLS).map((s) => ({
      ...s,
      rutinas: rutinas.filter((m) => m.skill === s.id)
    })),
    turno: turnoDelDia(items, today),
    weekPaid: {
      ...weekPaid,
      capXp: TOPE_TURNO_XP,
      capCoins: TOPE_TURNO_COINS,
      capReached: weekPaid.xp >= TOPE_TURNO_XP && weekPaid.coins >= TOPE_TURNO_COINS
    },
    probadas: items.filter((m) => m.times > 0).length,
    total: items.length,
    rutinasAlDia: rutinas.filter((m) => m.state === "al-dia").length,
    rutinasTotal: rutinas.length,
    vencidas: rutinas.filter((m) => m.state === "vencida").length,
    hitosDone,
    hitosTotal: hitos.length,
    rank: hitosDone === hitos.length
  };
}

export function inglesRewards(bundle) {
  const state = inglesStateOf(bundle);
  const out = { xp: 0, coins: 0 };
  for (const record of Object.values(plain(state.records) ? state.records : {})) {
    out.xp += Number(record?.reward?.xp) || 0;
    out.coins += Number(record?.reward?.coins) || 0;
  }
  return out;
}

export function inglesProblems(bundle) {
  const state = bundle?.play?.ingles;
  if (state == null) return [];
  const errors = [];
  if (!plain(state) || state.version !== INGLES_VERSION ||
      !plain(state.log) || !plain(state.records)) {
    return ["ingles: forma o versión inválida"];
  }
  for (const [id, e] of Object.entries(state.log)) {
    if (!byId.has(id) || !plain(e) || !validDate(e.lastDate) ||
        !Number.isSafeInteger(e.times) || e.times < 0 ||
        !Number.isSafeInteger(e.paidTimes) || e.paidTimes < 0) {
      errors.push(`ingles.log.${id}: registro inválido`);
    }
  }
  for (const [id, r] of Object.entries(state.records)) {
    if (!plain(r) || !byId.has(r.missionId) || !validDate(r.date) ||
        typeof r.at !== "string" || !Number.isFinite(Date.parse(r.at)) ||
        !plain(r.reward) || !Number.isSafeInteger(r.reward.xp) || r.reward.xp < 0 ||
        !Number.isSafeInteger(r.reward.coins) || r.reward.coins < 0 || r.rulesVersion !== 1 ||
        (r.capped !== undefined && (r.capped !== true ||
          !plain(r.fullReward) || !Number.isSafeInteger(r.fullReward.xp) ||
          !Number.isSafeInteger(r.fullReward.coins)))) {
      errors.push(`ingles.records.${id}: registro inválido`);
    }
  }
  return errors;
}

function ensureState(draft) {
  if (!plain(draft.play)) draft.play = {};
  if (!plain(draft.play.ingles)) {
    draft.play.ingles = { version: INGLES_VERSION, log: {}, records: {} };
  }
  const state = draft.play.ingles;
  if (!plain(state.log)) state.log = {};
  if (!plain(state.records)) state.records = {};
  return state;
}

/** Called only by gameplay.applyMutation after it has checked the date. */
export function applyInglesMutation(draft, mutation, { at, date }) {
  const no = (reason, duplicate = false) => ({ changed: false, duplicate, reason, paths: [] });
  if (inglesProblems(draft).length) return no("SCHEMA_INVALID");

  if (mutation.type === "ingles.complete") {
    const item = byId.get(mutation.missionId);
    if (!item) return no("UNKNOWN_MISSION");
    const state0 = inglesStateOf(draft);
    const entry = plain(state0.log) && plain(state0.log[item.id]) ? state0.log[item.id] : null;
    if (entry && entry.lastDate === date) return no("DUPLICATE", true);
    if (item.kind === "hito" && entry) return no("DUPLICATE", true);
    const status = itemStatus(item, entry, date);
    const state = ensureState(draft);
    const own = plain(state.log[item.id])
      ? state.log[item.id]
      : { lastDate: date, times: 0, paidTimes: 0 };
    own.lastDate = date;
    own.times = (own.times || 0) + 1;
    if (status.paysNow) {
      own.paidTimes = (own.paidTimes || 0) + 1;
      const recordId = `${item.id}@${date}#${own.paidTimes}`;
      if (item.kind === "rutina") {
        /* EL TOPE DE TURNO: lo pagado por rutinas esta semana no
           pasa de 850 XP / ₡58; el resto se registra sin paga. */
        const paid = inglesWeekPaid(draft, date);
        const payXp = Math.max(0, Math.min(item.xp, TOPE_TURNO_XP - paid.xp));
        const payCoins = Math.max(0, Math.min(item.coins, TOPE_TURNO_COINS - paid.coins));
        const record = {
          missionId: item.id, date, at,
          reward: { xp: payXp, coins: payCoins }, rulesVersion: 1
        };
        if (payXp < item.xp || payCoins < item.coins) {
          record.capped = true;
          record.fullReward = { xp: item.xp, coins: item.coins };
        }
        state.records[recordId] = record;
      } else {
        state.records[recordId] = {
          missionId: item.id, date, at,
          reward: { xp: item.xp, coins: item.coins }, rulesVersion: 1
        };
      }
    }
    state.log[item.id] = own;
    return { changed: true, duplicate: false, reason: null, paths: [`play.ingles.log.${item.id}`] };
  }

  return no("UNKNOWN_MUTATION");
}
