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
 * Fase D (v0.54.0) — MANOS QUE CRUZAN (diseño de manos §3.4–§3.6): las
 * 3 acciones que salen de las Diarias, con el modelo ya probado:
 * `snooze_garage_routine` (duerme el AVISO de una rutina del Garaje en
 * `play.jarvis.snoozes` — el reloj de `play.garaje` NO se toca),
 * `create_libreta_note` (la nota la crea el JUEGO con la mutación de la
 * Libreta de siempre, tras el «Aceptar»; aquí solo se valida el texto y
 * se registra con su `refId`) y `draft_evidence` (un borrador de texto
 * en `play.jarvis.drafts`, ≤5 con FIFO avisado — jamás se envía ni
 * completa nada). El Mundo de Ian queda FUERA a propósito (§3.7).
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
 *     // Fase D (v0.54.0), para los cruces:
 *     garage: [ { id, name, state, kind } ],   // rutinas/proyectos del Garaje (vista viva)
 *     garageComplete: boolean,                 // true si `garage` es el Garaje entero (reducer)
 *     snoozes: { "garaje:<id>": "YYYY-MM-DD" },// snoozes guardados
 *     drafts: [ { id, missionId, missionTitle, text, date, at } ],
 *     draftCount: number,
 *     missionTitles: { <missionId>: <título> } // campañas + diarias de hoy
 *   }
 */

export const JARVIS_ACT_DAILY_LIMIT = 10;
export const JARVIS_REQUEST_ID_PATTERN = /^[a-zA-Z0-9_-]{8,80}$/;

/* Fase D (v0.54.0): topes de las acciones que cruzan (diseño §3.5/§3.6). */
export const JARVIS_NOTE_TEXT_MAX = 500;
export const JARVIS_DRAFT_TEXT_MAX = 1000;
export const JARVIS_DRAFTS_MAX = 5;

/* ------------------------- fechas (claves YYYY-MM-DD) ------------------------- */

const DAY_MS = 86400000;

export function isDateKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Suma días a una clave de fecha (aritmética UTC, sin husos). */
export function addDaysKey(dateKey, days) {
  if (!isDateKey(dateKey) || !Number.isInteger(days)) return null;
  return new Date(Date.parse(`${dateKey}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

const WEEKDAYS_ES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTHS_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** «2026-11-30» → «lunes 30 de noviembre» (la fecha de las tarjetas). */
export function formatDateHuman(dateKey) {
  if (!isDateKey(dateKey)) return dateKey;
  const parsed = new Date(`${dateKey}T00:00:00.000Z`);
  return `${WEEKDAYS_ES[parsed.getUTCDay()]} ${parsed.getUTCDate()} de ${MONTHS_ES[parsed.getUTCMonth()]}`;
}

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
  if (name === "snooze_garage_routine") {
    return exactKeys(args, ["routineId", "days"]) && isId(args.routineId) &&
      Number.isInteger(args.days) && args.days >= 1 && args.days <= 14;
  }
  if (name === "create_libreta_note") {
    return exactKeys(args, ["text"]) && typeof args.text === "string" &&
      args.text.trim().length > 0 && args.text.length <= JARVIS_NOTE_TEXT_MAX;
  }
  if (name === "draft_evidence") {
    const keysOk = exactKeys(args, ["text"]) || exactKeys(args, ["text", "missionId"]);
    if (!keysOk) return false;
    if (typeof args.text !== "string" || !args.text.trim() || args.text.length > JARVIS_DRAFT_TEXT_MAX) return false;
    if ("missionId" in args && !isId(args.missionId)) return false;
    return true;
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
  if (name === "snooze_garage_routine") {
    /* La foto: el `until` que había antes (o null si no había snooze). */
    return exactKeys(prev, ["until"]) && (prev.until === null || isDateKey(prev.until));
  }
  if (name === "create_libreta_note") {
    /* La foto: la nota que el juego creó para esta acción (su id). */
    return exactKeys(prev, ["noteId"]) &&
      typeof prev.noteId === "string" && prev.noteId.length > 0 && prev.noteId.length <= 80;
  }
  if (name === "draft_evidence") {
    /* La foto: el borrador que el FIFO sacó al guardar este (o null). */
    if (!exactKeys(prev, ["evicted"])) return false;
    if (prev.evicted === null) return true;
    const ev = prev.evicted;
    return isPlainObject(ev) && exactKeys(ev, ["id", "missionId", "missionTitle", "text", "date", "at"]) &&
      typeof ev.id === "string" && ev.id.length > 0 && ev.id.length <= 80 &&
      (ev.missionId === null || isId(ev.missionId)) &&
      (ev.missionTitle === null || (typeof ev.missionTitle === "string" && ev.missionTitle.length <= 200)) &&
      typeof ev.text === "string" && ev.text.length > 0 && ev.text.length <= JARVIS_DRAFT_TEXT_MAX &&
      isDateKey(ev.date) && typeof ev.at === "string" && ev.at.length > 0;
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

/* --------------------- Fase D: las que cruzan (§3.4–§3.6) --------------------- */

function validateSnooze(ctx, args) {
  if (!jarvisActionArgsShape("snooze_garage_routine", args)) return "ACTION_BAD_ARGS";
  const routine = (ctx?.garage || []).find((r) => r.id === args.routineId);
  if (routine) {
    /* Solo RUTINAS con reloj: un proyecto de una sola vez no se duerme. */
    if (routine.kind && routine.kind !== "rutina") return "ACTION_BAD_ARGS";
    /* La rutina tiene que estar vencida o por vencer EN VIVO (§3.4):
       si está al día, no hay nada que dormir. */
    return routine.state === "vencida" || routine.state === "por-vencer" ? null : "ACTION_STALE";
  }
  /* El contexto del REDUCER trae el Garaje completo (garageComplete):
     un id ausente ahí no existe → BAD_ARGS. El de la UI trae solo las
     que el resumen mandó (las urgentes): ausente = ya no urge → STALE,
     que es la tarjeta amable «Ya no aplica». El Worker ya descartó los
     ids inventados contra SU contexto, así que a la UI solo llegan ids
     reales que dejaron de urgir. */
  return ctx?.garageComplete ? "ACTION_BAD_ARGS" : "ACTION_STALE";
}

function validateLibreta(ctx, args) {
  /* La nota es texto libre dictado por José: es DATO, jamás se
     interpreta (§7.2 #6). Solo la forma se valida; la creación la
     ejecuta el juego con la mutación de la Libreta (§3.5). */
  if (!jarvisActionArgsShape("create_libreta_note", args)) return "ACTION_BAD_ARGS";
  return null;
}

function validateDraft(ctx, args) {
  if (!jarvisActionArgsShape("draft_evidence", args)) return "ACTION_BAD_ARGS";
  /* missionId, si viene, ∈ catálogo de campañas o ruta de hoy (§3.6):
     el mapa de títulos del contexto ES ese universo cerrado. */
  if (args.missionId != null && !(ctx?.missionTitles && args.missionId in ctx.missionTitles)) {
    return "ACTION_BAD_ARGS";
  }
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

function garageNameOf(ctx, routineId) {
  const routine = (ctx?.garage || []).find((r) => r.id === routineId);
  return routine ? routine.name : routineId;
}

function describeSnooze(ctx, args) {
  const name = garageNameOf(ctx, args.routineId);
  const until = ctx?.date ? addDaysKey(ctx.date, args.days) : null;
  const fecha = until ? formatDateHuman(until) : null;
  return {
    title: "🔕 Posponer aviso",
    body: `Dejo de recordarte «${name}»${fecha ? ` hasta el ${fecha}` : ` por ${args.days} días`}. ` +
      "En el Garaje sigue marcada como pendiente, con su fecha real.",
    applied: `aviso de «${name}» pospuesto${fecha ? ` hasta el ${fecha}` : ""}.`,
  };
}

function describeLibreta(ctx, args) {
  return {
    title: "📝 Nota para tu Libreta",
    body: `«${args.text}»`,
    applied: "nota creada en tu Libreta.",
  };
}

function describeDraft(ctx, args) {
  const missionTitle = args.missionId ? ctx?.missionTitles?.[args.missionId] : null;
  let body = `${missionTitle ? `Para «${missionTitle}»: ` : ""}«${args.text}» ` +
    "Queda guardado como borrador: vos lo revisás y lo pegás donde va. No completa la misión.";
  /* El FIFO se avisa en la tarjeta ANTES de guardar (§3.6), no después. */
  if ((ctx?.draftCount || 0) >= JARVIS_DRAFTS_MAX) {
    body += ` Ojo: ya tenés ${JARVIS_DRAFTS_MAX} borradores guardados; al guardar este, sale el más viejo.`;
  }
  return {
    title: "✍️ Borrador de evidencia",
    body,
    applied: "borrador de evidencia guardado.",
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
  /* ---- Fase D (v0.54.0): las que cruzan. Su efecto NO vive en el
     dayPlan: el reducer despacha por `cross` (snoozes / drafts dentro
     de play.jarvis; la nota, en play.libreta vía el juego). ---- */
  snooze_garage_routine: {
    name: "snooze_garage_routine",
    icon: "🔕",
    cross: "snooze",
    validate: validateSnooze,
    describe: describeSnooze,
    prevOf: (ctx, args) => ({
      until: (ctx?.snoozes && typeof ctx.snoozes[`garaje:${args.routineId}`] === "string")
        ? ctx.snoozes[`garaje:${args.routineId}`]
        : null,
    }),
  },
  create_libreta_note: {
    name: "create_libreta_note",
    icon: "📝",
    cross: "libreta",
    /* La mutación jarvis.act de esta acción exige `refId` (la nota que
       el juego YA creó con libreta.create): el registro nace DESPUÉS
       de la nota, nunca antes (§3.5/§7.2 #5), y su `prev` lo arma el
       reducer como { noteId: refId }. */
    needsRef: true,
    validate: validateLibreta,
    describe: describeLibreta,
    prevOf: () => null,
  },
  draft_evidence: {
    name: "draft_evidence",
    icon: "✍️",
    cross: "draft",
    validate: validateDraft,
    describe: describeDraft,
    prevOf: (ctx) => {
      const drafts = Array.isArray(ctx?.drafts) ? [...ctx.drafts] : [];
      if (drafts.length < JARVIS_DRAFTS_MAX) return { evicted: null };
      drafts.sort((a, b) => String(a.at).localeCompare(String(b.at)) || String(a.id).localeCompare(String(b.id)));
      const oldest = drafts[0];
      return {
        evicted: {
          id: oldest.id,
          missionId: oldest.missionId ?? null,
          missionTitle: oldest.missionTitle ?? null,
          text: oldest.text,
          date: oldest.date,
          at: oldest.at,
        },
      };
    },
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
  if (name === "snooze_garage_routine") {
    return "esa rutina ya no está vencida ni por vencer";
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
