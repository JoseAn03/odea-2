/**
 * contrato-state.js — CONTRATO SEMANAL (v0.46.0, Dinámicas de Enganche
 * Fase 2): la tarjeta que convierte la semana en una misión. Tres retos
 * armados SOLO con registros de sistemas reales + un cofre al cerrar
 * los 3 (150 XP + ₡15).
 *
 * LA REGLA DE ORO: el progreso NO se guarda, se DERIVA. El estado guarda
 * únicamente los reclamos:
 *
 *   play.contrato = {
 *     version: 1,
 *     claims: {                       // clave: semana ISO "2026-W48"
 *       "2026-W48": { date, at, reward: { xp: 150, coins: 15 }, rulesVersion: 1 }
 *     }
 *   }
 *
 * El progreso de cada semana se recalcula siempre desde los registros
 * existentes con fecha dentro de la semana ISO (lunes–domingo):
 * completaciones hub y checkins, registros de sistemas vivos (garaje,
 * ian, marca), completaciones de campaña y el resto de completaciones
 * de `play`. Lo migrado de ODEA 1 vive en `core`, sin fechas en `play`,
 * y NO cuenta: el contrato mide la semana actual en ODEA 2.
 *
 * La selección de 3 retos por semana es DETERMINISTA: hash FNV-1a
 * (`fnv1a64` de shape.js) sobre la clave ISO. Misma semana = mismo
 * contrato en cualquier dispositivo, sin guardar la selección.
 *
 * El cofre NO incluye el Escudo de Racha: eso llega en la Fase 3. Los
 * reclamos de esta fase llevan solo { xp, coins } congelados (R1).
 *
 * El oráculo (derive.js) suma los claims vía `contratoRewards()`:
 * componente nuevo `contrato` en xpBreakdown (0 en saves viejos) y su
 * término en ₡ ganadas.
 */

import { addDays, deriveStreak, epochDayOf, isoWeekKey } from "./derive.js";
import { fnv1a64 } from "./shape.js";

export const CONTRATO_VERSION = 1;
export const CONTRATO_REWARD = Object.freeze({ xp: 150, coins: 15 });
export const CONTRATO_RULES_VERSION = 1;
export const WEEK_KEY_PATTERN = /^\d{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$/;

/* Pool EXACTO de 6 plantillas (§3.3 del diseño). `target` es la meta
   que pinta la barra segmentada; `count` describe cómo se cuenta. */
export const CONTRATO_TEMPLATES = [
  {
    id: "ruta-dias", target: 4, icon: "🗓️",
    title: "Ruta diaria en 4 días",
    detail: "4 días distintos con al menos 1 misión de la ruta o tu check-in."
  },
  {
    id: "ruta-completa", target: 3, icon: "🎯",
    title: "Un día de ruta completa",
    detail: "Un solo día con las 3 misiones de la ruta hechas (3/3)."
  },
  {
    id: "rutinas-vivas", target: 6, icon: "🔧",
    title: "6 rutinas vivas",
    detail: "6 registros de Garaje Vivo, Mundo de Ian o Estudio Neón."
  },
  {
    id: "avance-campana", target: 3, icon: "🗺️",
    title: "3 misiones de campaña",
    detail: "3 misiones de cualquier campaña: Brete, Gamer, Academia, Zona IA, Sabiduría o el evento."
  },
  {
    id: "semana-activa", target: 12, icon: "⚡",
    title: "Semana activa: 12 completaciones",
    detail: "12 completaciones en total entre ruta, campañas y sistemas vivos."
  },
  {
    id: "racha-firme", target: 7, icon: "🔥",
    title: "Racha firme de 7 días",
    detail: "Tu racha llega a 7 días o más al momento de reclamar."
  }
];

const templateById = new Map(CONTRATO_TEMPLATES.map((t) => [t.id, t]));

const plain = (v) => !!v && typeof v === "object" && !Array.isArray(v);

function isValidDateKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function isValidTs(value) {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

export function isWeekKey(value) {
  return typeof value === "string" && WEEK_KEY_PATTERN.test(value);
}

/* ------------------------- calendario ISO --------------------------- */

/** Lunes (YYYY-MM-DD) de la semana ISO `weekKey`. */
export function mondayOfWeek(weekKey) {
  if (!isWeekKey(weekKey)) return null;
  const [yearText, weekText] = weekKey.split("-W");
  const year = Number(yearText);
  const week = Number(weekText);
  /* El 4 de enero siempre cae en la semana 1: su lunes es la base. */
  const jan4 = `${year}-01-04`;
  const dowMon0 = ((epochDayOf(jan4) + 3) % 7 + 7) % 7; /* 0 = lunes */
  const mondayWeek1 = addDays(jan4, -dowMon0);
  return addDays(mondayWeek1, (week - 1) * 7);
}

export function weekRange(weekKey) {
  const monday = mondayOfWeek(weekKey);
  if (!monday) return null;
  return {
    monday,
    sunday: addDays(monday, 6),
    /* Gracia: hasta el miércoles 23:59 de la semana siguiente. */
    graceEnd: addDays(monday, 9)
  };
}

export function weekNumberOf(weekKey) {
  return isWeekKey(weekKey) ? Number(weekKey.split("-W")[1]) : null;
}

function previousWeekKey(weekKey) {
  const monday = mondayOfWeek(weekKey);
  if (!monday) return null;
  return isoWeekKey(addDays(monday, -1));
}

/* --------------------- selección determinista ----------------------- */

/**
 * Los 3 retos de una semana: hash FNV-1a de la clave ISO (con un sufijo
 * por ranura) eligiendo sin reemplazo del pool de 6. Determinista entre
 * dispositivos y ejecuciones; la selección jamás se persiste.
 */
export function contratoTemplatesFor(weekKey) {
  if (!isWeekKey(weekKey)) return [];
  const pool = [...CONTRATO_TEMPLATES];
  const picked = [];
  for (let slot = 0; slot < 3; slot += 1) {
    const hash = BigInt(`0x${fnv1a64(`${weekKey}#contrato-${slot}`)}`);
    const index = Number(hash % BigInt(pool.length));
    picked.push(pool.splice(index, 1)[0]);
  }
  return picked;
}

/* ------------------------------ estado ------------------------------ */

export function contratoStateOf(bundle) {
  const raw = plain(bundle?.play?.contrato) ? bundle.play.contrato : {};
  const claims = {};
  if (plain(raw.claims)) {
    for (const [weekKey, claim] of Object.entries(raw.claims)) {
      if (!isWeekKey(weekKey) || !plain(claim)) continue;
      claims[weekKey] = {
        date: isValidDateKey(claim.date) ? claim.date : "",
        at: isValidTs(claim.at) ? claim.at : null,
        reward: {
          xp: Number.isInteger(claim.reward?.xp) ? claim.reward.xp : 0,
          coins: Number.isInteger(claim.reward?.coins) ? claim.reward.coins : 0
        },
        rulesVersion: claim.rulesVersion
      };
    }
  }
  return { version: CONTRATO_VERSION, claims };
}

/** Suma de los reclamos: lo único que el oráculo lee de esta dinámica. */
export function contratoRewards(bundle) {
  const state = contratoStateOf(bundle);
  const out = { xp: 0, coins: 0 };
  for (const claim of Object.values(state.claims)) {
    out.xp += Number(claim.reward?.xp) || 0;
    out.coins += Number(claim.reward?.coins) || 0;
  }
  return out;
}

/* ------------------------- progreso derivado ------------------------ */

function recordsInWeek(records, monday, sunday) {
  let count = 0;
  if (!plain(records)) return 0;
  for (const record of Object.values(records)) {
    if (record && isValidDateKey(record.date) && record.date >= monday && record.date <= sunday) {
      count += 1;
    }
  }
  return count;
}

/**
 * Progreso crudo de una semana, derivado SOLO de registros con fecha.
 * Devuelve el conteo por plantilla (sin tope): la vista aplica el tope
 * de cada meta y el reducer decide con `done`.
 */
export function contratoProgress(bundle, weekKey) {
  const range = weekRange(weekKey);
  const zero = {
    "ruta-dias": 0, "ruta-completa": 0, "rutinas-vivas": 0,
    "avance-campana": 0, "semana-activa": 0, "racha-firme": 0
  };
  if (!range) return zero;
  const { monday, sunday } = range;
  const inWeek = (date) => isValidDateKey(date) && date >= monday && date <= sunday;
  const play = plain(bundle?.play) ? bundle.play : {};

  const hubByDate = new Map();
  let completionsTotal = 0;
  if (plain(play.completions)) {
    for (const record of Object.values(play.completions)) {
      if (!record || !inWeek(record.date)) continue;
      completionsTotal += 1;
      if (record.system === "hub") {
        hubByDate.set(record.date, (hubByDate.get(record.date) || 0) + 1);
      }
    }
  }

  const rutaDates = new Set(hubByDate.keys());
  if (plain(play.checkins)) {
    for (const date of Object.keys(play.checkins)) {
      if (inWeek(date)) rutaDates.add(date);
    }
  }

  let bestHubDay = 0;
  for (const count of hubByDate.values()) bestHubDay = Math.max(bestHubDay, count);

  const liveRecords =
    recordsInWeek(play.garaje?.records, monday, sunday) +
    recordsInWeek(play.ian?.records, monday, sunday) +
    recordsInWeek(play.marca?.records, monday, sunday);

  const campaignCount = recordsInWeek(play.campaigns?.completions, monday, sunday);

  const streak = deriveStreak(bundle || {}).streak || 0;

  return {
    "ruta-dias": rutaDates.size,
    "ruta-completa": bestHubDay,
    "rutinas-vivas": liveRecords,
    "avance-campana": campaignCount,
    "semana-activa": completionsTotal + liveRecords + campaignCount,
    "racha-firme": streak
  };
}

/* ------------------------------- vista ------------------------------ */

export function contratoWeekView(bundle, weekKey, today) {
  const range = weekRange(weekKey);
  const state = contratoStateOf(bundle);
  const claim = state.claims[weekKey] || null;
  const progress = contratoProgress(bundle, weekKey);
  const challenges = contratoTemplatesFor(weekKey).map((template) => {
    const raw = progress[template.id] || 0;
    return {
      ...template,
      current: Math.min(raw, template.target),
      raw,
      done: raw >= template.target
    };
  });
  const doneCount = challenges.filter((c) => c.done).length;
  const inWindow = Boolean(range) && isValidDateKey(today) &&
    today >= range.monday && today <= range.graceEnd;
  return {
    weekKey,
    weekNumber: weekNumberOf(weekKey),
    monday: range?.monday || null,
    sunday: range?.sunday || null,
    graceEnd: range?.graceEnd || null,
    challenges,
    doneCount,
    total: challenges.length,
    complete: doneCount === 3,
    claimed: Boolean(claim),
    claim,
    reward: { ...CONTRATO_REWARD },
    inWindow,
    expired: Boolean(range) && isValidDateKey(today) && today > range.graceEnd,
    isGrace: Boolean(range) && isValidDateKey(today) &&
      today > range.sunday && today <= range.graceEnd
  };
}

/**
 * Vista para la UI: la semana en curso y, si aplica, la semana pasada
 * todavía en gracia (lunes a miércoles) sin reclamar — su progreso está
 * congelado por las fechas, pero el reclamo sigue abierto.
 */
export function contratoView(bundle, today) {
  const dateKey = isValidDateKey(today) ? today : isoWeekKeySafe(today);
  const weekKey = isoWeekKey(dateKey);
  const current = contratoWeekView(bundle, weekKey, dateKey);
  let grace = null;
  const prevKey = previousWeekKey(weekKey);
  if (prevKey) {
    const prev = contratoWeekView(bundle, prevKey, dateKey);
    /* En gracia = hoy ya pasó el domingo de esa semana y la ventana
       (hasta el miércoles siguiente) sigue abierta, sin reclamar. */
    if (!prev.claimed && prev.inWindow && prev.isGrace) grace = prev;
  }
  return {
    today: dateKey,
    weekKey,
    weekNumber: current.weekNumber,
    current,
    grace,
    /* Atajos de la semana en curso, para consumidores simples. */
    challenges: current.challenges,
    doneCount: current.doneCount,
    complete: current.complete,
    claimed: current.claimed,
    reward: current.reward
  };
}

function isoWeekKeySafe(value) {
  /* `today` inválido: se deriva de la fecha local del dispositivo. */
  const now = new Date();
  const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return isValidDateKey(value) ? value : key;
}

/* ----------------------------- validación --------------------------- */

export function contratoProblems(bundle) {
  const raw = bundle?.play?.contrato;
  if (raw == null) return [];
  if (!plain(raw)) return ["play.contrato debe ser un objeto"];
  const problems = [];
  if (raw.version !== CONTRATO_VERSION) {
    problems.push(`play.contrato.version debe ser ${CONTRATO_VERSION}`);
  }
  if (!plain(raw.claims)) {
    problems.push("play.contrato.claims debe ser un mapa de reclamos");
    return problems;
  }
  for (const [weekKey, claim] of Object.entries(raw.claims)) {
    const at = `play.contrato.claims.${weekKey}`;
    if (!isWeekKey(weekKey)) {
      problems.push(`${at}: clave de semana inválida (YYYY-Www)`);
      continue;
    }
    if (!plain(claim)) { problems.push(`${at} debe ser un objeto`); continue; }
    if (!isValidDateKey(claim.date)) problems.push(`${at}.date debe ser una fecha válida`);
    if (!isValidTs(claim.at)) problems.push(`${at}.at debe ser una fecha ISO válida`);
    if (!plain(claim.reward)) {
      problems.push(`${at}.reward debe ser un objeto`);
    } else {
      if (!Number.isInteger(claim.reward.xp) || claim.reward.xp < 0) {
        problems.push(`${at}.reward.xp debe ser un entero >= 0`);
      }
      if (!Number.isInteger(claim.reward.coins) || claim.reward.coins < 0) {
        problems.push(`${at}.reward.coins debe ser un entero >= 0`);
      }
      /* R1: el reclamo congela EXACTAMENTE el cofre vigente al reclamar. */
      if (claim.reward.xp !== CONTRATO_REWARD.xp || claim.reward.coins !== CONTRATO_REWARD.coins) {
        problems.push(`${at}.reward debe ser exactamente el cofre vigente (${CONTRATO_REWARD.xp} XP + ₡${CONTRATO_REWARD.coins})`);
      }
    }
    if (claim.rulesVersion !== CONTRATO_RULES_VERSION) {
      problems.push(`${at}.rulesVersion debe ser ${CONTRATO_RULES_VERSION}`);
    }
  }
  return problems;
}

/* ----------------------------- mutaciones --------------------------- */

function ensureState(draft) {
  if (!plain(draft.play)) draft.play = {};
  if (!plain(draft.play.contrato)) {
    draft.play.contrato = { version: CONTRATO_VERSION, claims: {} };
  }
  const state = draft.play.contrato;
  if (!plain(state.claims)) state.claims = {};
  return state;
}

/**
 * Mutación única del Contrato: `contrato.claim { weekKey }`.
 * El reducer RECALCULA el progreso desde el borrador (nunca confía en
 * la UI): si los 3 retos de esa semana están cumplidos, la semana está
 * dentro de su ventana (la semana en curso + gracia hasta el miércoles
 * siguiente) y no existe reclamo previo, escribe el reclamo con el
 * cofre congelado. Repetirlo → DUPLICATE, sin pago doble.
 */
export function applyContratoMutation(draft, mutation, { at, date } = {}) {
  const no = (reason) => ({ changed: false, duplicate: false, reason, paths: [] });
  const dup = () => ({ changed: false, duplicate: true, reason: "DUPLICATE", paths: [] });
  if (contratoProblems(draft).length) return no("SCHEMA_INVALID");
  const ts = isValidTs(at) ? at : new Date().toISOString();
  const dateKey = isValidDateKey(date) ? date : ts.slice(0, 10);

  if (mutation.type !== "contrato.claim") return no("UNKNOWN_MUTATION");

  const weekKey = typeof mutation.weekKey === "string" ? mutation.weekKey : "";
  if (!isWeekKey(weekKey)) return no("BAD_WEEK_KEY");

  const state = contratoStateOf(draft);
  if (state.claims[weekKey]) return dup();

  const view = contratoWeekView(draft, weekKey, dateKey);
  if (!view.inWindow) return no(view.expired ? "CLAIM_EXPIRED" : "OUT_OF_WINDOW");
  if (!view.complete) return no("CONTRACT_INCOMPLETE");

  const target = ensureState(draft);
  target.claims[weekKey] = {
    date: dateKey,
    at: ts,
    reward: { ...CONTRATO_REWARD },
    rulesVersion: CONTRATO_RULES_VERSION
  };
  return { changed: true, duplicate: false, reason: null, paths: [`play.contrato.claims.${weekKey}`] };
}

export { templateById as contratoTemplateById };
