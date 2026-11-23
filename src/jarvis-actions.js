/**
 * jarvis-actions.js — JARVIS CON MANOS (v0.50.0): el catálogo ÚNICO de
 * acciones que Jarvis puede proponer. Lista blanca cerrada y versionada:
 * agregar una acción = agregar su ficha, su validador y sus tests.
 *
 * Fase A (v0.50.0): SOLO 3 acciones y todas escriben SOLO dentro de
 * `play.jarvis.dayPlan[hoy]` — { focusId, order, busy }. Ninguna completa
 * misiones, ninguna mueve XP ni ₡, ninguna inventa misiones y ninguna
 * toca core/worlds/legacy (líneas rojas del diseño §4). derive.js ni las
 * mira: son estado de vista puro.
 *
 * Este módulo es LÓGICA PURA (sin storage, sin DOM, sin red): recibe un
 * «contexto del día» ya armado por jarvis-state.js (o por la UI desde el
 * resumen) y decide si una propuesta es válida contra ese contexto, cómo
 * se describe en la tarjeta y qué foto `prev` hay que guardar para poder
 * deshacerla. La UI (al pintar) y el reducer `jarvis.act` (al aplicar)
 * consumen ESTE catálogo: una sola definición de «válido».
 *
 * Contexto del día (DailyContext):
 *   {
 *     date: "YYYY-MM-DD",
 *     dailies: [ { id, title, completed } ],   // la ruta de HOY, orden del catálogo
 *     focusId: string | null,                  // foco vigente
 *     order: [ids] | null,                     // orden guardado (o null = catálogo)
 *     busy: { minutes, chosen, deferred } | null
 *   }
 */

export const JARVIS_ACT_DAILY_LIMIT = 10;
export const JARVIS_REQUEST_ID_PATTERN = /^[a-zA-Z0-9_-]{8,80}$/;

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 64;
}

function isIdList(value, max = 8) {
  return Array.isArray(value) && value.length <= max &&
    value.every(isId) && new Set(value).size === value.length;
}

function sameSet(a, b) {
  if (a.length !== b.length) return false;
  const set = new Set(b);
  return a.every((item) => set.has(item));
}

function sameList(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length &&
    a.every((item, index) => item === b[index]);
}

function cloneBusy(busy) {
  if (!isPlainObject(busy)) return null;
  return {
    minutes: busy.minutes,
    chosen: Array.isArray(busy.chosen) ? [...busy.chosen] : [],
    deferred: Array.isArray(busy.deferred) ? [...busy.deferred] : [],
  };
}

function titleOf(ctx, id) {
  const daily = (ctx?.dailies || []).find((d) => d.id === id);
  return daily ? daily.title : id;
}

function exactKeys(obj, keys) {
  if (!isPlainObject(obj)) return false;
  const own = Object.keys(obj);
  return own.length === keys.length && keys.every((k) => Object.prototype.hasOwnProperty.call(obj, k));
}

/* ------------------------- forma de argumentos ------------------------- */
/* Validación de FORMA (sin contexto): la usa jarvisProblems para la
 * forma estricta del registro guardado y el Worker la espeja. */

export function jarvisActionArgsShape(name, args) {
  if (!isPlainObject(args)) return false;
  if (name === "set_daily_focus") {
    return exactKeys(args, ["dailyId"]) && isId(args.dailyId);
  }
  if (name === "reorder_dailies") {
    return exactKeys(args, ["order"]) && isIdList(args.order);
  }
  if (name === "set_busy_day") {
    return exactKeys(args, ["minutes", "chosen", "deferred"]) &&
      Number.isInteger(args.minutes) && args.minutes >= 0 && args.minutes <= 600 &&
      isIdList(args.chosen) && isIdList(args.deferred) &&
      !args.chosen.some((id) => args.deferred.includes(id));
  }
  return false;
}

/** Forma exacta de la foto `prev` por acción (para jarvisProblems). */
export function jarvisActionPrevShape(name, prev) {
  if (!isPlainObject(prev)) return false;
  if (name === "set_daily_focus") {
    return exactKeys(prev, ["focusId"]) && (prev.focusId === null || isId(prev.focusId));
  }
  if (name === "reorder_dailies") {
    return exactKeys(prev, ["order"]) && (prev.order === null || isIdList(prev.order));
  }
  if (name === "set_busy_day") {
    if (!exactKeys(prev, ["busy"])) return false;
    if (prev.busy === null) return true;
    return isPlainObject(prev.busy) &&
      Number.isInteger(prev.busy.minutes) && prev.busy.minutes >= 0 && prev.busy.minutes <= 600 &&
      isIdList(prev.busy.chosen) && isIdList(prev.busy.deferred) &&
      !prev.busy.chosen.some((id) => prev.busy.deferred.includes(id));
  }
  return false;
}

/* ------------------------------ validadores ----------------------------- */

function validateFocus(ctx, args) {
  if (!jarvisActionArgsShape("set_daily_focus", args)) return "ACTION_BAD_ARGS";
  const daily = (ctx?.dailies || []).find((d) => d.id === args.dailyId);
  if (!daily) return "ACTION_BAD_ARGS";
  if (daily.completed) return "ACTION_STALE";
  if (ctx.focusId === args.dailyId) return "ACTION_STALE";
  return null;
}

function validateReorder(ctx, args) {
  if (!jarvisActionArgsShape("reorder_dailies", args)) return "ACTION_BAD_ARGS";
  const ids = (ctx?.dailies || []).map((d) => d.id);
  if (!sameSet(args.order, ids)) return "ACTION_BAD_ARGS";
  return null;
}

function validateBusy(ctx, args) {
  if (!jarvisActionArgsShape("set_busy_day", args)) return "ACTION_BAD_ARGS";
  const pending = (ctx?.dailies || []).filter((d) => !d.completed).map((d) => d.id);
  /* Partición EXACTA de las pendientes de hoy: ni una completada, ni una
     ajena, ni una repetida, ni una que falte (§3.3). */
  if (!sameSet([...args.chosen, ...args.deferred], pending)) return "ACTION_BAD_ARGS";
  /* `chosen` vacío solo es válido si José declaró 0 minutos. */
  if (args.chosen.length === 0 && args.minutes !== 0) return "ACTION_BAD_ARGS";
  return null;
}

/* ------------------------------ descripciones ---------------------------- */

function describeFocus(ctx, args) {
  const others = (ctx?.dailies || []).length - 1;
  return {
    title: "⭐ Foco del día",
    body: `La diaria «${titleOf(ctx, args.dailyId)}» queda como tu foco de hoy. ` +
      (others === 2
        ? "Las otras dos siguen en tu lista, sin cambios."
        : "Las demás siguen en tu lista, sin cambios."),
    applied: `foco de hoy = «${titleOf(ctx, args.dailyId)}».`,
  };
}

function describeReorder(ctx, args) {
  const list = args.order.map((id, i) => `${i + 1}. ${titleOf(ctx, id)}`).join(" · ");
  return {
    title: "↕️ Orden de hoy",
    body: list,
    applied: "orden de hoy actualizado.",
  };
}

function describeBusy(ctx, args) {
  const hoy = args.chosen.length
    ? args.chosen.map((id) => `«${titleOf(ctx, id)}»`).join(", ")
    : "ninguna";
  const manana = args.deferred.length
    ? args.deferred.map((id) => `«${titleOf(ctx, id)}»`).join(", ")
    : "ninguna";
  return {
    title: `⏱️ Día ocupado · ${args.minutes} min`,
    body: `Hoy: ${hoy}. Para mañana: ${manana}. Nada se completa ni se pierde: quedan sugeridas.`,
    applied: `día ocupado activo (${args.minutes} min). ` +
      `${args.chosen.length} diaria${args.chosen.length === 1 ? "" : "s"} hoy, ` +
      `${args.deferred.length} para mañana.`,
  };
}

/* -------------------------------- catálogo ------------------------------- */

export const JARVIS_ACTIONS = {
  set_daily_focus: {
    name: "set_daily_focus",
    icon: "⭐",
    validate: validateFocus,
    describe: describeFocus,
    prevOf: (ctx) => ({ focusId: ctx?.focusId ?? null }),
    applyTo: (entry, args) => { entry.focusId = args.dailyId; },
    revertTo: (entry, prev) => { entry.focusId = prev.focusId; },
    appliedValue: (args) => args.dailyId,
    currentValue: (entry) => entry?.focusId ?? null,
  },
  reorder_dailies: {
    name: "reorder_dailies",
    icon: "↕️",
    validate: validateReorder,
    describe: describeReorder,
    prevOf: (ctx) => ({ order: Array.isArray(ctx?.order) ? [...ctx.order] : null }),
    applyTo: (entry, args) => { entry.order = [...args.order]; },
    revertTo: (entry, prev) => { entry.order = prev.order ? [...prev.order] : null; },
    appliedValue: (args) => [...args.order],
    currentValue: (entry) => (Array.isArray(entry?.order) ? [...entry.order] : null),
  },
  set_busy_day: {
    name: "set_busy_day",
    icon: "⏱️",
    validate: validateBusy,
    describe: describeBusy,
    prevOf: (ctx) => ({ busy: cloneBusy(ctx?.busy) }),
    applyTo: (entry, args) => {
      entry.busy = { minutes: args.minutes, chosen: [...args.chosen], deferred: [...args.deferred] };
    },
    revertTo: (entry, prev) => { entry.busy = cloneBusy(prev.busy); },
    appliedValue: (args) => ({ minutes: args.minutes, chosen: [...args.chosen], deferred: [...args.deferred] }),
    currentValue: (entry) => cloneBusy(entry?.busy),
  },
};

export const JARVIS_ACTION_NAMES = Object.keys(JARVIS_ACTIONS);

/**
 * Valida una propuesta contra el contexto VIVO del día.
 * Devuelve null si es válida, o el código fail-closed:
 * ACTION_UNKNOWN / ACTION_BAD_ARGS / ACTION_STALE.
 */
export function validateJarvisAction(ctx, name, args) {
  const action = JARVIS_ACTIONS[name];
  if (!action) return "ACTION_UNKNOWN";
  return action.validate(ctx, args);
}

/** La tarjeta se arma SOLO desde args ya validados (plantillas del juego). */
export function describeJarvisAction(ctx, name, args) {
  const action = JARVIS_ACTIONS[name];
  if (!action) return null;
  return action.describe(ctx, args);
}

/** Razón en humano cuando una propuesta ya no aplica (tarjeta «Ya no aplica»). */
export function jarvisStaleMessage(ctx, name, args) {
  if (name === "set_daily_focus") {
    const daily = (ctx?.dailies || []).find((d) => d.id === args?.dailyId);
    if (daily?.completed) return "esa diaria ya la completaste 🎉";
    if (ctx?.focusId === args?.dailyId) return "esa diaria ya es tu foco de hoy";
  }
  return "eso ya cambió desde que lo preparamos";
}

/** ¿El valor vivo sigue siendo EXACTAMENTE el que esta acción aplicó?
 *  Si José lo cambió a mano después, el deshacer no lo pisa (§7.2 #9). */
export function jarvisAppliedIntact(name, args, entry) {
  const action = JARVIS_ACTIONS[name];
  if (!action) return false;
  const current = action.currentValue(entry);
  const applied = action.appliedValue(args);
  if (Array.isArray(applied)) return sameList(current, applied);
  if (isPlainObject(applied)) {
    return isPlainObject(current) &&
      current.minutes === applied.minutes &&
      sameList(current.chosen, applied.chosen) &&
      sameList(current.deferred, applied.deferred);
  }
  return current === applied;
}

/** requestId fresco para una tarjeta (regex de la casa, §2.4). */
export function newJarvisRequestId() {
  const seed = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 8)}`;
  return `ja-${seed}`.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
}
