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
 * mismas y el oráculo ni las lee. El estado vive SOLO en
 * `play.ingles`, aditivo: un save sin la sección deriva 0 y ningún
 * total previo cambia (precedente marca/ian).
 *
 * La Fase C (v0.57.0) suma, en claves aditivas del mismo estado
 * (bloque «Fase C» más abajo): la campaña DESPEGUE (58 misiones en
 * src/campaigns.js, con el componente de campañas de siempre), el
 * banco de entrevista (18 tarjetas con las respuestas que escribe
 * José y sus intentos cronometrados), el catálogo de escucha (34
 * fichas con control local de 3 preguntas donde el material lo
 * trae, y los dictados de referencia con su % registrado) y el
 * Tablero de Habilidad (las 4 habilidades con niveles de Torre
 * derivados SOLO de evidencia registrada). Cuatro hitos del vivo se
 * otorgan solos cuando su evidencia existe — medición (h5),
 * simulacro (h6), banco en dos pasadas (h8) y tres acentos (h9) —
 * por la misma ruta de registro de los hitos manuales, fuera del
 * Tope como todo hito. Las herramientas nuevas tampoco pagan por sí
 * mismas: pagan los hitos y la campaña, como manda el diseño.
 */

import { isoWeekKey } from "./derive.js";
import {
  SRS_DECKS, SRS_CARDS, SRS_CARD_BY_ID,
  HVPT_CONTRASTS, HVPT_CONTRAST_BY_ID, LAB_PHRASES, LAB_PHRASE_BY_ID,
  LISTEN_CATALOG, LISTEN_BY_ID, DICTATION_BY_ID,
  BANK_QUESTIONS, BANK_BY_ID, ERROR_SOURCES
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
    title: "Charla con Jarvis",
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
    title: "Grabación breve",
    brief: "Dictale 5 frases de tu fraseología al teclado en inglés y registrá cuántas salieron limpias. El espejo de inteligibilidad, en versión corta." },
  { id: "ingles-h1", kind: "hito", skill: "voz", slot: null, days: 0, xp: 60, coins: 4,
    title: "Primera grabación",
    brief: "Tu primera grabación de práctica en el Center: el pitch, de corrido, escuchado una vez entero." },
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
    brief: "Tu primer EF SET hecho y registrado, sea el puntaje que sea. El Center celebra que te midás, no el número." },
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
    faseC: inglesFaseCView(bundle, today),
    tablero: inglesTableroView(bundle, today),
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

/* ================= Fase C (v0.57.0): banco, escucha, Tablero ====
 * Claves aditivas de `play.ingles`: listen {checks, dictRef}, bank,
 * errors, efset, mock. Nacen SOLO con una mutación de la Fase C —
 * un save de las fases A/B sin ellas valida y deriva igual. */

export const BANK_ANSWER_MAX = 2000;
export const BANK_TRIES_CAP = 50;
export const DICT_REF_CAP = 60;
export const ERRORS_CAP = 200;
export const ERROR_TEXT_MAX = 300;
export const MOCK_TRIES_CAP = 24;
export const EFSET_SECOND_DAYS = 90;
export const TORRE_LEVEL_NAMES = ["", "Arrancando", "En ritmo", "Con soltura", "Bilingüe"];

const listenOf = (state) => (plain(state.listen) ? state.listen : { checks: {}, dictRef: [] });
const bankOf = (state) => (plain(state.bank) ? state.bank : {});
const errorsOf = (state) => (Array.isArray(state.errors) ? state.errors : []);
const efsetOf = (state) => (plain(state.efset) ? state.efset : null);
const mockOf = (state) => (plain(state.mock) && Array.isArray(state.mock.tries) ? state.mock : { tries: [] });

/** La vista de la Fase C: banco, escucha, bitácora, medición y
 *  simulacros, todo derivado de lo registrado — nada inventado. */
export function inglesFaseCView(bundle, today) {
  const state = inglesStateOf(bundle);
  const listen = listenOf(state);
  const checks = plain(listen.checks) ? listen.checks : {};
  const dictRef = Array.isArray(listen.dictRef) ? listen.dictRef : [];
  const materials = LISTEN_CATALOG.map((m) => {
    const entry = plain(checks[m.id]) ? checks[m.id] : null;
    return {
      ...m,
      checkState: m.check ? {
        best: entry ? entry.best : 0,
        attempts: entry ? entry.attempts : 0,
        approved: !!entry && entry.best >= 2
      } : null
    };
  });
  const accentsApproved = ["us", "uk", "in"].filter((accent) =>
    materials.some((m) => m.accent === accent && m.checkState && m.checkState.approved));
  const dictBest = {};
  for (const entry of dictRef) {
    if (!plain(entry)) continue;
    dictBest[entry.clipId] = Math.max(dictBest[entry.clipId] || 0, entry.pct || 0);
  }
  const bankState = bankOf(state);
  const bank = BANK_QUESTIONS.map((q) => {
    const entry = plain(bankState[q.id]) ? bankState[q.id] : null;
    const tries = entry && Array.isArray(entry.tries) ? entry.tries : [];
    return {
      ...q,
      answer: entry ? entry.answer : "",
      tries: tries.length,
      lastSecs: tries.length ? tries[tries.length - 1].secs : null,
      bestSecs: tries.length ? Math.min(...tries.map((t) => t.secs)) : null,
      twoPasses: tries.length >= 2
    };
  });
  const efset = efsetOf(state);
  const mock = mockOf(state);
  return {
    listen: {
      materials,
      total: materials.length,
      withCheck: materials.filter((m) => m.check).length,
      approved: materials.filter((m) => m.checkState && m.checkState.approved).length,
      accentsApproved,
      dictRef: dictRef.filter(plain),
      dictBest,
      dictCount: dictRef.length
    },
    bank: {
      questions: bank,
      total: bank.length,
      answered: bank.filter((q) => q.answer.trim().length > 0).length,
      twoPasses: bank.filter((q) => q.twoPasses).length
    },
    errors: errorsOf(state).filter(plain),
    efset: efset ? {
      first: { date: efset.date, score: efset.score },
      second: plain(efset.second) ? { date: efset.second.date, score: efset.second.score } : null,
      secondDue: addDays(efset.date, EFSET_SECOND_DAYS),
      canSecond: !efset.second && daysBetween(efset.date, today) >= EFSET_SECOND_DAYS
    } : null,
    mock: {
      tries: mock.tries.filter(plain),
      count: mock.tries.length,
      last: mock.tries.length ? mock.tries[mock.tries.length - 1] : null
    }
  };
}

/**
 * EL TABLERO DE HABILIDAD (§6.5): niveles de Torre 1–4 por
 * habilidad, derivados SOLO de evidencia registrada en la Torre —
 * marcas, intentos, registros — nunca de auto-declaraciones sueltas
 * ni de XP acumulado. Los criterios son los del diseño con la
 * calibración fijada en la construcción de la Fase C (documentada
 * en el diseño y en los textos «next» de cada habilidad).
 */
export function inglesTableroView(bundle, today) {
  const state = inglesStateOf(bundle);
  const faseB = inglesFaseBView(bundle, today);
  const faseC = inglesFaseCView(bundle, today);
  const completions = plain(bundle?.play?.campaigns?.completions)
    ? bundle.play.campaigns.completions : {};
  const log = plain(state.log) ? state.log : {};

  /* VOZ: contrastes dominados (≥20 intentos, ≥85% histórico, nivel
     ≥2 de escalera; el contraste de acento no cuenta como vocálico),
     últimas dos pruebas del teclado ≥4/5 y marcas «bien» del A/B. */
  const vowelMastered = faseB.hvpt.filter((c) => !c.stress && c.attempts >= 20 &&
    c.attempts > 0 && (c.correct / c.attempts) >= 0.85 && c.level >= 2).length;
  const keysHist = keysOf(state).filter(plain);
  const lastTwoKeys = keysHist.slice(-2);
  const keysOk = lastTwoKeys.length >= 2 &&
    lastTwoKeys.every((k) => k.total > 0 && (k.clean / k.total) >= 0.8);
  const vozT2 = vowelMastered >= 3;
  const vozT3 = vozT2 && keysOk && faseB.voice.bien >= 7 && faseB.voice.marked >= 7;
  const vozT4 = vozT3 && !!completions["ingles-58"];
  const vozLevel = vozT4 ? 4 : vozT3 ? 3 : vozT2 ? 2 : 1;

  /* OÍDO: el dictado de referencia manda (% registrado), más
     controles aprobados en materiales a velocidad real. */
  const dictEntries = faseC.listen.dictRef;
  const dictBestPct = dictEntries.length ? Math.max(...dictEntries.map((e) => e.pct || 0)) : 0;
  const dictFirstBest = dictEntries.filter((e) => e.first).length
    ? Math.max(...dictEntries.filter((e) => e.first).map((e) => e.pct || 0)) : 0;
  const realApproved = faseC.listen.materials.filter((m) =>
    m.speed === "real" && m.checkState && m.checkState.approved).length;
  const oidoT2 = dictBestPct >= 60;
  const oidoT3 = dictBestPct >= 75 && realApproved >= 2;
  const oidoT4 = dictFirstBest >= 85;
  const oidoLevel = oidoT4 ? 4 : oidoT3 ? 3 : oidoT2 ? 2 : 1;

  /* PALABRAS: graduadas del SRS + uso en llamada real (3 frases por
     cada registro de la rutina «Frases en llamada real»). */
  const graduated = faseB.srs.graduated;
  const usedReal = 3 * ((plain(log["ingles-07"]) && log["ingles-07"].times) || 0);
  const palT2 = graduated >= 25;
  const palT3 = graduated >= 60 && usedReal >= 10;
  const palT4 = graduated >= 100 && usedReal >= 25;
  const palLevel = palT4 ? 4 : palT3 ? 3 : palT2 ? 2 : 1;

  /* ENTREVISTA: intentos cronometrados del banco (pitch y estrella
     4/3/2) y el simulacro completo registrado. */
  const bankById = new Map(faseC.bank.questions.map((q) => [q.id, q]));
  const pitch = bankById.get("bank-01");
  const star = bankById.get("bank-03");
  const mockTries = faseC.mock.tries;
  const mockT3 = mockTries.some((t) => t.secs <= 480 && t.pauses <= 5);
  const mockT4 = mockTries.some((t) => t.secs <= 420 && t.pauses <= 3);
  const entT2 = !!pitch && pitch.bestSecs != null && pitch.bestSecs <= 75;
  const entT3 = entT2 && mockT3;
  const entT4 = entT3 && mockT4 && !!star && star.bestSecs != null && star.bestSecs <= 50;
  const entLevel = entT4 ? 4 : entT3 ? 3 : entT2 ? 2 : 1;

  const skill = (meta, level, indicators, next) => ({
    ...meta, level, levelName: TORRE_LEVEL_NAMES[level], indicators, next
  });
  return {
    skills: [
      skill(INGLES_SKILLS.voz, vozLevel, [
        { label: "Contrastes vocálicos dominados", value: `${vowelMastered} / 3`, ok: vozT2 },
        { label: "Últimas 2 pruebas del teclado ≥ 4/5", value: keysOk ? "Sí" : "Todavía no", ok: keysOk },
        { label: "Frases del Laboratorio marcadas «bien»", value: `${faseB.voice.bien} / 7`, ok: faseB.voice.bien >= 7 && faseB.voice.marked >= 7 },
        { label: "DESPEGUE completado (misión 58)", value: completions["ingles-58"] ? "Sí" : "Todavía no", ok: !!completions["ingles-58"] }
      ], vozLevel >= 4 ? "Nivel máximo." :
        vozLevel === 3 ? "Para Nivel 4: completá la campaña DESPEGUE (la comparación A/B de la misión 58)." :
        vozLevel === 2 ? "Para Nivel 3: dos pruebas del teclado seguidas con ≥4/5 limpias y 7 frases del Laboratorio marcadas «bien»." :
        "Para Nivel 2: dominá 3 contrastes vocálicos (≥20 intentos, ≥85% y nivel 2 de escalera en el HVPT)."),
      skill(INGLES_SKILLS.oido, oidoLevel, [
        { label: "Mejor dictado de referencia", value: dictEntries.length ? `${dictBestPct}%` : "Sin registro", ok: oidoT2 },
        { label: "Materiales «real» con control aprobado", value: `${realApproved} / 2`, ok: realApproved >= 2 },
        { label: "Dictado ≥85% en el primer intento de un clip", value: dictFirstBest ? `${dictFirstBest}%` : "Sin registro", ok: oidoT4 },
        { label: "Acentos con control aprobado", value: faseC.listen.accentsApproved.length ? faseC.listen.accentsApproved.map((a) => ({ us: "EE. UU.", uk: "Británico", in: "Indio" }[a] || a)).join(" · ") : "Ninguno", ok: faseC.listen.accentsApproved.length >= 3 }
      ], oidoLevel >= 4 ? "Nivel máximo." :
        oidoLevel === 3 ? "Para Nivel 4: un dictado de referencia con ≥85% en el PRIMER intento de ese clip." :
        oidoLevel === 2 ? "Para Nivel 3: un dictado con ≥75% y 2 materiales a velocidad real con el control aprobado." :
        "Para Nivel 2: un dictado de referencia con ≥60% de palabras correctas."),
      skill(INGLES_SKILLS.palabras, palLevel, [
        { label: "Tarjetas graduadas", value: `${graduated}`, ok: palT2 },
        { label: "Frases usadas en llamadas reales", value: `${usedReal}`, ok: usedReal >= 10 },
        { label: "Graduadas para Nivel 4", value: `${graduated} / 100`, ok: graduated >= 100 },
        { label: "Usadas en llamada real para Nivel 4", value: `${usedReal} / 25`, ok: usedReal >= 25 }
      ], palLevel >= 4 ? "Nivel máximo." :
        palLevel === 3 ? "Para Nivel 4: 100 graduadas y 25 frases usadas en llamadas reales." :
        palLevel === 2 ? "Para Nivel 3: 60 graduadas y 10 frases usadas en llamadas reales (rutina «Frases en llamada real»)." :
        "Para Nivel 2: 25 tarjetas graduadas del SRS (3 aciertos espaciados en caja 5)."),
      skill(INGLES_SKILLS.entrevista, entLevel, [
        { label: "Pitch (bank-01) en ≤75 s", value: pitch && pitch.bestSecs != null ? `${pitch.bestSecs} s` : "Sin intento", ok: entT2 },
        { label: "Simulacro ≤8 min y ≤5 pausas largas", value: mockT3 ? "Sí" : "Todavía no", ok: mockT3 },
        { label: "Simulacro ≤7 min y ≤3 pausas largas", value: mockT4 ? "Sí" : "Todavía no", ok: mockT4 },
        { label: "Estrella (bank-03) en ≤50 s", value: star && star.bestSecs != null ? `${star.bestSecs} s` : "Sin intento", ok: !!star && star.bestSecs != null && star.bestSecs <= 50 }
      ], entLevel >= 4 ? "Nivel máximo." :
        entLevel === 3 ? "Para Nivel 4: un simulacro en ≤7 min con ≤3 pausas largas y tu estrella en ≤50 s (el paso de 50 del 4/3/2)." :
        entLevel === 2 ? "Para Nivel 3: un simulacro completo registrado en ≤8 min con ≤5 pausas largas." :
        "Para Nivel 2: un intento del pitch (bank-01) en 75 segundos o menos.")
    ],
    efset: faseC.efset
  };
}

/**
 * Otorga un hito del vivo por la MISMA ruta de registro que
 * `ingles.complete` (log + record íntegro, fuera del Tope), solo si
 * todavía no está ganado. Devuelve el recordId o null. Lo usan las
 * mutaciones de la Fase C cuya evidencia ES el hito: la medición
 * registrada (h5), el simulacro registrado (h6), el banco con dos
 * pasadas en las 18 (h8) y los tres acentos aprobados (h9).
 */
function awardHito(state, hitoId, date, at) {
  const item = byId.get(hitoId);
  if (!item || item.kind !== "hito") return null;
  if (plain(state.log[hitoId])) return null;
  state.log[hitoId] = { lastDate: date, times: 1, paidTimes: 1 };
  const recordId = `${hitoId}@${date}#1`;
  state.records[recordId] = {
    missionId: hitoId, date, at,
    reward: { xp: item.xp, coins: item.coins }, rulesVersion: 1
  };
  return recordId;
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
  /* Fase C: claves opcionales con forma estricta si están. */
  const atOK = (v) => typeof v === "string" && Number.isFinite(Date.parse(v));
  if (state.listen !== undefined) {
    const listen = state.listen;
    if (!plain(listen) || !plain(listen.checks) || !Array.isArray(listen.dictRef) ||
        listen.dictRef.length > DICT_REF_CAP) {
      errors.push("ingles.listen: forma inválida");
    } else {
      for (const [id, e] of Object.entries(listen.checks)) {
        const mat = LISTEN_BY_ID.get(id);
        if (!mat || !mat.check || !plain(e) ||
            !Number.isSafeInteger(e.best) || e.best < 0 || e.best > 3 ||
            !Number.isSafeInteger(e.attempts) || e.attempts < 1 ||
            !validDate(e.lastDate) || !atOK(e.at)) {
          errors.push(`ingles.listen.checks.${id}: registro inválido`);
        }
      }
      for (const e of listen.dictRef) {
        if (!plain(e) || !DICTATION_BY_ID.has(e.clipId) ||
            !Number.isSafeInteger(e.pct) || e.pct < 0 || e.pct > 100 ||
            !validDate(e.date) || !atOK(e.at) || typeof e.first !== "boolean") {
          errors.push("ingles.listen.dictRef: registro inválido");
          break;
        }
      }
    }
  }
  if (state.bank !== undefined) {
    if (!plain(state.bank)) {
      errors.push("ingles.bank: forma inválida");
    } else {
      for (const [id, e] of Object.entries(state.bank)) {
        if (!BANK_BY_ID.has(id) || !plain(e) ||
            typeof e.answer !== "string" || e.answer.length > BANK_ANSWER_MAX ||
            !atOK(e.updatedAt) || !Array.isArray(e.tries) || e.tries.length > BANK_TRIES_CAP ||
            e.tries.some((t) => !plain(t) || !validDate(t.date) || !atOK(t.at) ||
              !Number.isSafeInteger(t.secs) || t.secs < 5 || t.secs > 3600)) {
          errors.push(`ingles.bank.${id}: registro inválido`);
        }
      }
    }
  }
  if (state.errors !== undefined) {
    if (!Array.isArray(state.errors) || state.errors.length > ERRORS_CAP) {
      errors.push("ingles.errors: forma inválida");
    } else {
      for (const e of state.errors) {
        if (!plain(e) || typeof e.id !== "string" || !/^err-\d+$/.test(e.id) ||
            typeof e.text !== "string" || !e.text.length || e.text.length > ERROR_TEXT_MAX ||
            !Object.hasOwn(ERROR_SOURCES, e.source) ||
            !validDate(e.date) || !atOK(e.at)) {
          errors.push("ingles.errors: registro inválido");
          break;
        }
      }
    }
  }
  if (state.efset !== undefined && state.efset !== null) {
    const ef = state.efset;
    const oneOK = (o) => plain(o) && validDate(o.date) &&
      typeof o.score === "string" && o.score.length >= 1 && o.score.length <= 40 && atOK(o.at);
    if (!oneOK(ef) || (ef.second !== undefined && ef.second !== null &&
        (!oneOK(ef.second) || daysBetween(ef.date, ef.second.date) < EFSET_SECOND_DAYS))) {
      errors.push("ingles.efset: registro inválido");
    }
  }
  if (state.mock !== undefined) {
    if (!plain(state.mock) || !Array.isArray(state.mock.tries) ||
        state.mock.tries.length > MOCK_TRIES_CAP) {
      errors.push("ingles.mock: forma inválida");
    } else {
      for (const t of state.mock.tries) {
        if (!plain(t) || !validDate(t.date) || !atOK(t.at) ||
            !Number.isSafeInteger(t.secs) || t.secs < 60 || t.secs > 3600 ||
            !Number.isSafeInteger(t.pauses) || t.pauses < 0 || t.pauses > 99) {
          errors.push("ingles.mock: registro inválido");
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

/* Ídem Fase C: las claves nuevas nacen solo con una mutación suya. */
function ensureFaseC(state) {
  if (!plain(state.listen)) state.listen = { checks: {}, dictRef: [] };
  if (!plain(state.listen.checks)) state.listen.checks = {};
  if (!Array.isArray(state.listen.dictRef)) state.listen.dictRef = [];
  if (!plain(state.bank)) state.bank = {};
  if (!Array.isArray(state.errors)) state.errors = [];
  if (state.efset === undefined) state.efset = null;
  if (!plain(state.mock)) state.mock = { tries: [] };
  if (!Array.isArray(state.mock.tries)) state.mock.tries = [];
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

  /* -------- Fase C: banco, escucha, bitácora, medición ----------
   * Tampoco pagan por sí mismas (0 XP / ₡0); lo único que otorgan
   * son los hitos cuya evidencia ES el registro (h5, h6, h8, h9),
   * por la ruta de awardHito. */

  if (mutation.type === "ingles.bankSave") {
    if (!BANK_BY_ID.has(mutation.qid)) return no("UNKNOWN_QUESTION");
    const answer = typeof mutation.answer === "string" ? mutation.answer.trim() : null;
    if (answer === null || answer.length > BANK_ANSWER_MAX) return no("BAD_ANSWER");
    const state = ensureFaseC(ensureState(draft));
    const entry = plain(state.bank[mutation.qid])
      ? state.bank[mutation.qid]
      : { answer: "", tries: [], updatedAt: at };
    entry.answer = answer;
    entry.updatedAt = at;
    state.bank[mutation.qid] = entry;
    return { changed: true, duplicate: false, reason: null, paths: [`play.ingles.bank.${mutation.qid}`] };
  }

  if (mutation.type === "ingles.bankTry") {
    if (!BANK_BY_ID.has(mutation.qid)) return no("UNKNOWN_QUESTION");
    if (!Number.isSafeInteger(mutation.secs) || mutation.secs < 5 || mutation.secs > 3600) {
      return no("BAD_TRY");
    }
    const state = ensureFaseC(ensureState(draft));
    const entry = plain(state.bank[mutation.qid])
      ? state.bank[mutation.qid]
      : { answer: "", tries: [], updatedAt: at };
    entry.tries = [...(Array.isArray(entry.tries) ? entry.tries : []),
      { date, secs: mutation.secs, at }].slice(-BANK_TRIES_CAP);
    entry.updatedAt = at;
    state.bank[mutation.qid] = entry;
    /* HITO h8: las 18 tarjetas con ≥2 intentos registrados. */
    const allTwo = BANK_QUESTIONS.every((q) => {
      const e = plain(state.bank[q.id]) ? state.bank[q.id] : null;
      return e && Array.isArray(e.tries) && e.tries.length >= 2;
    });
    if (allTwo) awardHito(state, "ingles-h8", date, at);
    return { changed: true, duplicate: false, reason: null, paths: [`play.ingles.bank.${mutation.qid}`] };
  }

  if (mutation.type === "ingles.listenCheck") {
    const material = LISTEN_BY_ID.get(mutation.matId);
    if (!material) return no("UNKNOWN_MATERIAL");
    if (!material.check) return no("NO_CHECK");
    if (!Number.isSafeInteger(mutation.correct) || mutation.correct < 0 || mutation.correct > 3) {
      return no("BAD_CHECK");
    }
    const state = ensureFaseC(ensureState(draft));
    const entry = plain(state.listen.checks[mutation.matId])
      ? state.listen.checks[mutation.matId]
      : { best: 0, attempts: 0, lastDate: date, at };
    entry.attempts += 1;
    entry.best = Math.max(entry.best, mutation.correct);
    entry.lastDate = date;
    entry.at = at;
    state.listen.checks[mutation.matId] = entry;
    /* HITO h9: controles aprobados (≥2/3) en acentos us + uk + in. */
    const approved = new Set();
    for (const [id, e] of Object.entries(state.listen.checks)) {
      const m = LISTEN_BY_ID.get(id);
      if (m && plain(e) && e.best >= 2) approved.add(m.accent);
    }
    if (["us", "uk", "in"].every((a) => approved.has(a))) awardHito(state, "ingles-h9", date, at);
    return { changed: true, duplicate: false, reason: null, paths: [`play.ingles.listen.checks.${mutation.matId}`] };
  }

  if (mutation.type === "ingles.dictation") {
    if (!DICTATION_BY_ID.has(mutation.clipId)) return no("UNKNOWN_CLIP");
    if (!Number.isSafeInteger(mutation.pct) || mutation.pct < 0 || mutation.pct > 100) {
      return no("BAD_PCT");
    }
    const state = ensureFaseC(ensureState(draft));
    const first = !state.listen.dictRef.some((e) => plain(e) && e.clipId === mutation.clipId);
    state.listen.dictRef = [...state.listen.dictRef,
      { clipId: mutation.clipId, pct: mutation.pct, date, at, first }].slice(-DICT_REF_CAP);
    return { changed: true, duplicate: false, reason: null, paths: ["play.ingles.listen.dictRef"] };
  }

  if (mutation.type === "ingles.errorAdd") {
    const text = typeof mutation.text === "string" ? mutation.text.trim() : "";
    if (!text || text.length > ERROR_TEXT_MAX) return no("BAD_ERROR");
    if (!Object.hasOwn(ERROR_SOURCES, mutation.source)) return no("BAD_SOURCE");
    const state = ensureFaseC(ensureState(draft));
    if (state.errors.length >= ERRORS_CAP) return no("ERRORS_FULL");
    let n = 1;
    const used = new Set(state.errors.map((e) => plain(e) && e.id));
    while (used.has(`err-${n}`)) n += 1;
    const id = `err-${n}`;
    state.errors = [...state.errors, { id, text, source: mutation.source, date, at }];
    return { changed: true, duplicate: false, reason: null, paths: [`play.ingles.errors.${id}`] };
  }

  if (mutation.type === "ingles.errorRemove") {
    const state0 = inglesStateOf(draft);
    if (!errorsOf(state0).some((e) => plain(e) && e.id === mutation.errorId)) {
      return no("UNKNOWN_ERROR");
    }
    const state = ensureFaseC(ensureState(draft));
    state.errors = state.errors.filter((e) => !(plain(e) && e.id === mutation.errorId));
    return { changed: true, duplicate: false, reason: null, paths: ["play.ingles.errors"] };
  }

  if (mutation.type === "ingles.efset") {
    const score = typeof mutation.score === "string" ? mutation.score.trim() : "";
    if (!score || score.length > 40) return no("BAD_SCORE");
    const state = ensureFaseC(ensureState(draft));
    if (!state.efset) {
      state.efset = { date, score, at };
      /* HITO h5: la medición registrada — la XP es por medirte. */
      awardHito(state, "ingles-h5", date, at);
      return { changed: true, duplicate: false, reason: null, paths: ["play.ingles.efset"] };
    }
    if (state.efset.second) return no("EFSET_DONE");
    if (daysBetween(state.efset.date, date) < EFSET_SECOND_DAYS) return no("EFSET_TOO_EARLY");
    state.efset.second = { date, score, at };
    return { changed: true, duplicate: false, reason: null, paths: ["play.ingles.efset.second"] };
  }

  if (mutation.type === "ingles.mock") {
    if (!Number.isSafeInteger(mutation.secs) || mutation.secs < 60 || mutation.secs > 3600 ||
        !Number.isSafeInteger(mutation.pauses) || mutation.pauses < 0 || mutation.pauses > 99) {
      return no("BAD_MOCK");
    }
    const state = ensureFaseC(ensureState(draft));
    state.mock.tries = [...state.mock.tries,
      { date, secs: mutation.secs, pauses: mutation.pauses, at }].slice(-MOCK_TRIES_CAP);
    /* HITO h6: el primer simulacro completo registrado. */
    awardHito(state, "ingles-h6", date, at);
    return { changed: true, duplicate: false, reason: null, paths: ["play.ingles.mock.tries"] };
  }

  return no("UNKNOWN_MUTATION");
}
