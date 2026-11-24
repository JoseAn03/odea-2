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
 * La Fase B (v0.56.0) suma las herramientas — SRS, HVPT, marcas de
 * voz y prueba del teclado — en claves aditivas del mismo
 * `play.ingles` (bloque «Fase B» más abajo): no pagan nada por sí
 * mismas y el oráculo ni las lee. La campaña DESPEGUE (58 misiones)
 * y el Tablero llegan en sus fases. El estado vive SOLO en
 * `play.ingles`, aditivo: un save sin la sección deriva 0 y ningún
 * total previo cambia (precedente marca/ian).
 */

import { isoWeekKey } from "./derive.js";
import {
  SRS_DECKS, SRS_CARDS, SRS_CARD_BY_ID,
  HVPT_CONTRASTS, HVPT_CONTRAST_BY_ID, LAB_PHRASES, LAB_PHRASE_BY_ID
} from "./ingles-content.js";

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

/* ================= Fase B (v0.56.0): Fraseología y Laboratorio ====
 * El SRS corregido (§6.2), el motor HVPT (§6.1.2), las marcas A/B
 * del Laboratorio (§6.1.1) y la prueba del teclado (§6.1.3) viven en
 * claves ADITIVAS de `play.ingles` (srs, custom, hvpt, voice, keys):
 * un save de la Fase A sin ellas valida igual y deriva igual — el
 * oráculo solo suma `records`, y ninguna de estas mutaciones crea
 * records: las herramientas NO pagan; pagan las rutinas de siempre
 * al registrarlas (la rutina paga por el hábito; la herramienta es
 * el gimnasio). Sin XP inventado y sin notas de voz: el HVPT tiene
 * respuesta correcta local porque el contenido está en el código;
 * el SRS y el A/B guardan la auto-marca de José, nada más. */

/* Leitner de 5 cajas (§6.2): intervalo en días por caja. */
export const SRS_INTERVALS = { 1: 1, 2: 2, 3: 4, 4: 7, 5: 15 };
export const SRS_GRAD_STREAK = 3;      // aciertos espaciados en caja 5, en días distintos
export const SRS_GRAD_RECHECK_DAYS = 30; // la graduada reaparece en chequeos mensuales
export const SRS_MAX_CUSTOM = 200;
export const HVPT_WINDOW = 20;         // la escalera se evalúa cada 20 intentos
export const HVPT_LEVEL_UP_PCT = 85;
export const HVPT_LEVEL_DOWN_PCT = 60;
export const KEYS_HISTORY_CAP = 24;
export const VOICE_MARKS = ["bien", "medio", "no"];
export const SRS_MARKS = ["se", "dude", "no"];

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
    faseB: inglesFaseBView(bundle, today),
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

/* ---------------- Fase B: acceso al estado nuevo ---------------- */

const srsOf = (state) => (plain(state.srs) ? state.srs : {});
const customOf = (state) => (plain(state.custom) ? state.custom : {});
const hvptOf = (state) => (plain(state.hvpt) ? state.hvpt : {});
const voiceOf = (state) => (plain(state.voice) ? state.voice : {});
const keysOf = (state) => (Array.isArray(state.keys) ? state.keys : []);

/** La tarjeta completa (base o guardada por José) o null. */
export function srsCardOf(state, cardId) {
  const base = SRS_CARD_BY_ID.get(cardId);
  if (base) return base;
  const custom = customOf(state)[cardId];
  if (!plain(custom)) return null;
  return {
    id: cardId, deck: "robadas", type: "prod",
    term: custom.term, pron: "", meaning: custom.meaning,
    example: custom.example || "", custom: true
  };
}

const srsEntryDefault = (today) => ({
  box: 1, due: today, seen: 0, gradStreak: 0, gradDay: null, graduated: false, lastAt: null
});

/**
 * La sesión de repaso (§6.2): primero las vencidas (due ≤ hoy),
 * entrelazadas por deck en ronda — recuperar en contextos variados
 * es lo que hace que la palabra salga en la llamada real — y después
 * hasta `maxNew` tarjetas nuevas, también entrelazadas. Las
 * graduadas solo vuelven cuando su chequeo mensual vence.
 */
export function srsSession(bundle, today, { maxNew = 5, maxCards = 20 } = {}) {
  const state = inglesStateOf(bundle);
  const srs = srsOf(state);
  const allIds = [...SRS_CARDS.map((c) => c.id), ...Object.keys(customOf(state))];
  const due = [];
  const fresh = [];
  for (const id of allIds) {
    const entry = plain(srs[id]) ? srs[id] : null;
    if (!entry) { fresh.push(id); continue; }
    if (entry.due <= today) due.push(id);
  }
  const interleave = (ids) => {
    const byDeck = new Map();
    for (const id of ids) {
      const card = srsCardOf(state, id);
      const key = card ? card.deck : "?";
      if (!byDeck.has(key)) byDeck.set(key, []);
      byDeck.get(key).push(id);
    }
    const out = [];
    let moved = true;
    while (moved) {
      moved = false;
      for (const list of byDeck.values()) {
        if (list.length) { out.push(list.shift()); moved = true; }
      }
    }
    return out;
  };
  const ordered = [...interleave(due), ...interleave(fresh).slice(0, Math.max(0, maxNew))];
  return ordered.slice(0, maxCards).map((id) => {
    const entry = plain(srs[id]) ? srs[id] : null;
    return {
      card: srsCardOf(state, id),
      isNew: !entry,
      box: entry ? entry.box : 1,
      graduated: entry ? entry.graduated === true : false
    };
  });
}

/** Resúmenes de la Fase B para la vista (el tablero llega en su fase;
 *  esto es solo el conteo honesto que el panel muestra). */
export function inglesFaseBView(bundle, today) {
  const state = inglesStateOf(bundle);
  const srs = srsOf(state);
  const custom = customOf(state);
  const allIds = [...SRS_CARDS.map((c) => c.id), ...Object.keys(custom)];
  let seen = 0, graduated = 0, dueCount = 0;
  for (const id of allIds) {
    const entry = plain(srs[id]) ? srs[id] : null;
    if (!entry) continue;
    seen += 1;
    if (entry.graduated === true) graduated += 1;
    if (entry.due <= today) dueCount += 1;
  }
  const decks = SRS_DECKS.map((d) => {
    const ids = SRS_CARDS.filter((c) => c.deck === d.id).map((c) => c.id);
    return {
      ...d,
      total: ids.length,
      seen: ids.filter((id) => plain(srs[id])).length,
      graduated: ids.filter((id) => plain(srs[id]) && srs[id].graduated === true).length
    };
  });
  if (Object.keys(custom).length) {
    decks.push({
      id: "robadas", name: "Palabras robadas", icon: "🕵️",
      total: Object.keys(custom).length,
      seen: Object.keys(custom).filter((id) => plain(srs[id])).length,
      graduated: Object.keys(custom).filter((id) => plain(srs[id]) && srs[id].graduated === true).length
    });
  }
  const hvptState = hvptOf(state);
  const hvpt = HVPT_CONTRASTS.map((c) => {
    const e = plain(hvptState[c.id]) ? hvptState[c.id] : null;
    const window = e && Array.isArray(e.window) ? e.window : [];
    return {
      id: c.id, name: c.name, detail: c.detail, stress: c.stress === true,
      pairs: c.pairs.length,
      level: e ? e.level : 1,
      attempts: e ? e.attempts : 0,
      correct: e ? e.correct : 0,
      windowCount: window.length,
      windowPct: window.length ? Math.round((window.reduce((a, b) => a + b, 0) / window.length) * 100) : null
    };
  });
  const voice = voiceOf(state);
  const voiceMarks = Object.values(voice).filter(plain);
  const keys = keysOf(state).filter(plain);
  return {
    srs: {
      total: allIds.length, seen, graduated, dueCount,
      newCount: allIds.length - seen, decks
    },
    hvpt,
    voice: {
      phrases: LAB_PHRASES.length,
      marked: voiceMarks.length,
      bien: voiceMarks.filter((v) => v.lastSelf === "bien").length
    },
    keys: {
      count: keys.length,
      last: keys.length ? keys[keys.length - 1] : null
    }
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
  /* Fase B: las claves nuevas son opcionales — un save de la Fase A
     sin ellas es válido; si están, su forma es estricta. */
  if (state.custom !== undefined) {
    if (!plain(state.custom) || Object.keys(state.custom).length > SRS_MAX_CUSTOM) {
      errors.push("ingles.custom: forma inválida");
    } else {
      for (const [id, c] of Object.entries(state.custom)) {
        if (!/^custom-\d+$/.test(id) || !plain(c) ||
            typeof c.term !== "string" || !c.term.length || c.term.length > 80 ||
            typeof c.meaning !== "string" || !c.meaning.length || c.meaning.length > 160 ||
            typeof c.example !== "string" || c.example.length > 200 ||
            typeof c.at !== "string" || !Number.isFinite(Date.parse(c.at))) {
          errors.push(`ingles.custom.${id}: tarjeta inválida`);
        }
      }
    }
  }
  if (state.srs !== undefined) {
    if (!plain(state.srs)) {
      errors.push("ingles.srs: forma inválida");
    } else {
      for (const [id, e] of Object.entries(state.srs)) {
        if (!srsCardOf(state, id) || !plain(e) ||
            !Number.isSafeInteger(e.box) || e.box < 1 || e.box > 5 ||
            !validDate(e.due) ||
            !Number.isSafeInteger(e.seen) || e.seen < 0 ||
            !Number.isSafeInteger(e.gradStreak) || e.gradStreak < 0 || e.gradStreak > SRS_GRAD_STREAK ||
            !(e.gradDay === null || validDate(e.gradDay)) ||
            typeof e.graduated !== "boolean" ||
            !(e.lastAt === null || (typeof e.lastAt === "string" && Number.isFinite(Date.parse(e.lastAt))))) {
          errors.push(`ingles.srs.${id}: registro inválido`);
        }
      }
    }
  }
  if (state.hvpt !== undefined) {
    if (!plain(state.hvpt)) {
      errors.push("ingles.hvpt: forma inválida");
    } else {
      for (const [id, e] of Object.entries(state.hvpt)) {
        if (!HVPT_CONTRAST_BY_ID.has(id) || !plain(e) ||
            !Number.isSafeInteger(e.level) || e.level < 1 || e.level > 3 ||
            !Number.isSafeInteger(e.attempts) || e.attempts < 0 ||
            !Number.isSafeInteger(e.correct) || e.correct < 0 || e.correct > e.attempts ||
            !Array.isArray(e.window) || e.window.length > HVPT_WINDOW ||
            e.window.some((v) => v !== 0 && v !== 1) ||
            !(e.lastAt === null || (typeof e.lastAt === "string" && Number.isFinite(Date.parse(e.lastAt))))) {
          errors.push(`ingles.hvpt.${id}: registro inválido`);
        }
      }
    }
  }
  if (state.voice !== undefined) {
    if (!plain(state.voice)) {
      errors.push("ingles.voice: forma inválida");
    } else {
      for (const [id, v] of Object.entries(state.voice)) {
        if (!LAB_PHRASE_BY_ID.has(id) || !plain(v) || !VOICE_MARKS.includes(v.lastSelf) ||
            typeof v.at !== "string" || !Number.isFinite(Date.parse(v.at))) {
          errors.push(`ingles.voice.${id}: marca inválida`);
        }
      }
    }
  }
  if (state.keys !== undefined) {
    if (!Array.isArray(state.keys) || state.keys.length > KEYS_HISTORY_CAP) {
      errors.push("ingles.keys: forma inválida");
    } else {
      for (const k of state.keys) {
        if (!plain(k) || !validDate(k.date) ||
            !Number.isSafeInteger(k.clean) || !Number.isSafeInteger(k.total) ||
            k.total < 1 || k.total > 10 || k.clean < 0 || k.clean > k.total) {
          errors.push("ingles.keys: registro inválido");
          break;
        }
      }
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

/* Las claves de la Fase B nacen SOLO con una mutación de la Fase B:
   un save que solo usó la Fase A conserva su forma exacta. */
function ensureFaseB(state) {
  if (!plain(state.srs)) state.srs = {};
  if (!plain(state.custom)) state.custom = {};
  if (!plain(state.hvpt)) state.hvpt = {};
  if (!plain(state.voice)) state.voice = {};
  if (!Array.isArray(state.keys)) state.keys = [];
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

  /* -------- Fase B: herramientas sin paga (0 XP / ₡0 siempre) ---- */

  if (mutation.type === "ingles.srsMark") {
    if (!SRS_MARKS.includes(mutation.mark)) return no("BAD_MARK");
    const state0 = inglesStateOf(draft);
    if (!srsCardOf(state0, mutation.cardId)) return no("UNKNOWN_CARD");
    const state = ensureFaseB(ensureState(draft));
    const entry = plain(state.srs[mutation.cardId])
      ? state.srs[mutation.cardId]
      : srsEntryDefault(date);
    entry.seen = (entry.seen || 0) + 1;
    entry.lastAt = at;
    if (mutation.mark === "no") {
      entry.box = 1;
      entry.gradStreak = 0;
      entry.due = addDays(date, SRS_INTERVALS[1]);
    } else if (mutation.mark === "dude") {
      entry.due = addDays(date, SRS_INTERVALS[entry.box] || 1);
    } else if (entry.box < 5) {
      entry.box += 1;
      entry.due = addDays(date, SRS_INTERVALS[entry.box]);
    } else if (entry.graduated) {
      entry.due = addDays(date, SRS_GRAD_RECHECK_DAYS);
    } else {
      /* LA CORRECCIÓN KARPIKE & ROEDIGER (§6.2): en caja 5 no basta
         un acierto — graduarse exige 3 aciertos espaciados en días
         distintos; dos aciertos el mismo día cuentan uno. */
      if (entry.gradDay !== date) {
        entry.gradStreak = (entry.gradStreak || 0) + 1;
        entry.gradDay = date;
      }
      if (entry.gradStreak >= SRS_GRAD_STREAK) {
        entry.graduated = true;
        entry.due = addDays(date, SRS_GRAD_RECHECK_DAYS);
      } else {
        entry.due = addDays(date, SRS_INTERVALS[5]);
      }
    }
    state.srs[mutation.cardId] = entry;
    return { changed: true, duplicate: false, reason: null, paths: [`play.ingles.srs.${mutation.cardId}`] };
  }

  if (mutation.type === "ingles.srsAdd") {
    const term = typeof mutation.term === "string" ? mutation.term.trim() : "";
    const meaning = typeof mutation.meaning === "string" ? mutation.meaning.trim() : "";
    const example = typeof mutation.example === "string" ? mutation.example.trim() : "";
    if (!term || term.length > 80 || !meaning || meaning.length > 160 || example.length > 200) {
      return no("BAD_CARD");
    }
    const state = ensureFaseB(ensureState(draft));
    if (Object.keys(state.custom).length >= SRS_MAX_CUSTOM) return no("CUSTOM_FULL");
    let n = Object.keys(state.custom).length + 1;
    while (state.custom[`custom-${n}`]) n += 1;
    const id = `custom-${n}`;
    state.custom[id] = { term, meaning, example, at };
    state.srs[id] = srsEntryDefault(date);
    return { changed: true, duplicate: false, reason: null, paths: [`play.ingles.custom.${id}`] };
  }

  if (mutation.type === "ingles.hvptAttempt") {
    const contrast = HVPT_CONTRAST_BY_ID.get(mutation.contrastId);
    if (!contrast) return no("UNKNOWN_CONTRAST");
    const pair = contrast.pairs[mutation.pairIdx];
    if (!pair || !["a", "b"].includes(mutation.played) || !["a", "b"].includes(mutation.picked)) {
      return no("BAD_ATTEMPT");
    }
    /* La respuesta correcta la calcula el reducer desde el
       contenido en código — la UI no se califica a sí misma. */
    const correct = mutation.played === mutation.picked;
    const state = ensureFaseB(ensureState(draft));
    const entry = plain(state.hvpt[mutation.contrastId])
      ? state.hvpt[mutation.contrastId]
      : { level: 1, attempts: 0, correct: 0, window: [], lastAt: null };
    entry.attempts += 1;
    if (correct) entry.correct += 1;
    entry.window = [...(Array.isArray(entry.window) ? entry.window : []), correct ? 1 : 0].slice(-HVPT_WINDOW);
    entry.lastAt = at;
    if (entry.window.length >= HVPT_WINDOW) {
      /* LA ESCALERA (§6.1.2): ≥85% en 20 intentos sube; <60% baja. */
      const pct = (entry.window.reduce((a, b) => a + b, 0) / HVPT_WINDOW) * 100;
      if (pct >= HVPT_LEVEL_UP_PCT && entry.level < 3) entry.level += 1;
      else if (pct < HVPT_LEVEL_DOWN_PCT && entry.level > 1) entry.level -= 1;
      entry.window = [];
    }
    state.hvpt[mutation.contrastId] = entry;
    return { changed: true, duplicate: false, reason: null, paths: [`play.ingles.hvpt.${mutation.contrastId}`] };
  }

  if (mutation.type === "ingles.voiceMark") {
    if (!LAB_PHRASE_BY_ID.has(mutation.phraseId)) return no("UNKNOWN_PHRASE");
    if (!VOICE_MARKS.includes(mutation.mark)) return no("BAD_MARK");
    const state = ensureFaseB(ensureState(draft));
    state.voice[mutation.phraseId] = { lastSelf: mutation.mark, at };
    return { changed: true, duplicate: false, reason: null, paths: [`play.ingles.voice.${mutation.phraseId}`] };
  }

  if (mutation.type === "ingles.keysTest") {
    const { clean, total } = mutation;
    if (!Number.isSafeInteger(total) || total < 1 || total > 10 ||
        !Number.isSafeInteger(clean) || clean < 0 || clean > total) {
      return no("BAD_KEYS");
    }
    const state = ensureFaseB(ensureState(draft));
    state.keys = [...state.keys, { date, clean, total }].slice(-KEYS_HISTORY_CAP);
    return { changed: true, duplicate: false, reason: null, paths: ["play.ingles.keys"] };
  }

  return no("UNKNOWN_MUTATION");
}
