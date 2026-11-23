/**
 * racha-state.js — ESCUDO DE RACHA (v0.47.0, Dinámicas de Enganche
 * Fase 3): protección GANADA contra el día fallado. Un solo día sin
 * jugar corta la cadena y la XP de diarias cae retroactivamente (el
 * multiplicador se aplica sobre todo el historial derivado); el escudo
 * cubre exactamente ese día y la cadena — y el multiplicador — siguen.
 *
 * ODEA 1 lo resolvía con DOS protecciones (escudo semanal `shieldWeek`
 * y congeladores comprados a ₡150, `freezers`); ODEA 2 lo unifica en
 * un solo inventario que SE GANA, no se compra (ni con ₡ ni con dinero
 * real: jamás se vende). La herencia migrada (`core.identity.freezers`
 * y `core.identity.shieldWeek`) queda como historia, SIN uso: no se
 * convierte, por decisión documentada en §4.3 del diseño.
 *
 *   play.racha = {
 *     version: 1,
 *     grants:  { "contrato@2026-W48": { date, at, via: "contrato" },
 *                "hito14@2026-11-20":  { date, at, via: "hito" } },
 *     covered: { "2026-11-21":        { at, via: "contrato@2026-W48" } }
 *   }
 *
 * INVENTARIO DERIVADO: disponibles = |grants| − |covered|, con TOPE 2
 * (el de los congeladores de ODEA 1). Otorgar con el inventario lleno
 * OMITE el grant (anti-acaparamiento): no se acumula para después.
 *
 * FUENTES DE GRANT (solo dos, ambas jugando):
 *   1. El cofre del Contrato Semanal: `contrato.claim` llama a
 *      `grantShield()` en la MISMA escritura atómica. Los reclamos
 *      anteriores a esta fase NO se reescriben: su reward congelado
 *      manda y el escudo solo nace en reclamos nuevos.
 *   2. Hitos de racha 14 (×1.5) y 30 (×2.0): mutación `racha.grant`;
 *      el reducer verifica con `deriveStreak` que la racha alcanzó el
 *      hito y registra la clave con la fecha en que se alcanzó —
 *      idempotente por cadena: racha rota y vuelta a 14 = fecha nueva
 *      = grant nuevo posible.
 *
 * CONSUMO AUTOMÁTICO: mutación `racha.cover { date }`. La app la
 * dispara cuando se cumplen TODAS las condiciones y el reducer las
 * revalida TODAS sobre el borrador:
 *   (a) existe exactamente UN día perdido entre el último día activo
 *       previo y hoy: perdido = previo+1, hoy = previo+2 (ojo: tras
 *       jugar hoy, el streakDate derivado ya es hoy; el previo es el
 *       último día activo anterior a hoy). Un hueco de 2+ días NO lo
 *       salvan ni dos escudos;
 *   (b) el jugador YA registró actividad hoy (check-in o completación
 *       hub de hoy): el escudo solo se gasta cuando la racha de verdad
 *       continúa, nunca por abrir la app un día tarde y no jugar;
 *   (c) hay inventario disponible;
 *   (d) ese día no está ya cubierto.
 *
 * El día cubierto protege la CADENA y el multiplicador; NO fabrica
 * actividad: no cuenta para el Contrato ni suma XP por sí mismo. El
 * oráculo (`deriveStreak`) solo agrega las fechas de `covered` al
 * conjunto de días activos: con `covered` vacío — todo save previo —
 * la derivación es idéntica a la de siempre, número por número.
 */

import { addDays, deriveStreak } from "./derive.js";

export const RACHA_VERSION = 1;
export const RACHA_MAX_SHIELDS = 2;
export const RACHA_MILESTONES = Object.freeze([14, 30]);

const WEEK_KEY = /^\d{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$/;
const GRANT_CONTRATO = /^contrato@(\d{4}-W(?:0[1-9]|[1-4][0-9]|5[0-3]))$/;
const GRANT_HITO = /^hito(14|30)@(\d{4}-\d{2}-\d{2})$/;

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

/** Formato cerrado de clave de grant, o null si no es ninguna válida. */
export function grantKeyKind(key) {
  if (typeof key !== "string") return null;
  const contrato = GRANT_CONTRATO.exec(key);
  if (contrato) return { kind: "contrato", via: "contrato", ref: contrato[1] };
  const hito = GRANT_HITO.exec(key);
  if (hito && isValidDateKey(hito[2])) {
    return { kind: "hito", via: "hito", milestone: Number(hito[1]), ref: hito[2] };
  }
  return null;
}

export function isGrantKey(key) {
  return grantKeyKind(key) !== null;
}

/* ------------------------------ estado ------------------------------ */

export function rachaStateOf(bundle) {
  const raw = plain(bundle?.play?.racha) ? bundle.play.racha : {};
  const grants = {};
  if (plain(raw.grants)) {
    for (const [key, grant] of Object.entries(raw.grants)) {
      if (!isGrantKey(key) || !plain(grant)) continue;
      grants[key] = {
        date: isValidDateKey(grant.date) ? grant.date : "",
        at: isValidTs(grant.at) ? grant.at : null,
        via: typeof grant.via === "string" ? grant.via : ""
      };
    }
  }
  const covered = {};
  if (plain(raw.covered)) {
    for (const [date, entry] of Object.entries(raw.covered)) {
      if (!isValidDateKey(date) || !plain(entry)) continue;
      covered[date] = {
        at: isValidTs(entry.at) ? entry.at : null,
        via: typeof entry.via === "string" ? entry.via : ""
      };
    }
  }
  return { version: RACHA_VERSION, grants, covered };
}

/** Inventario derivado: lo ganado menos lo ya gastado en días cubiertos. */
export function shieldInventory(bundle) {
  const state = rachaStateOf(bundle);
  const grants = Object.keys(state.grants).length;
  const covered = Object.keys(state.covered).length;
  return {
    grants,
    covered,
    available: Math.max(0, grants - covered),
    cap: RACHA_MAX_SHIELDS
  };
}

/** Vista para la UI (chip de Diarias y vitrina de Colección). */
export function rachaView(bundle) {
  const state = rachaStateOf(bundle);
  const inventory = shieldInventory(bundle);
  return {
    ...inventory,
    full: inventory.available >= RACHA_MAX_SHIELDS,
    grantKeys: Object.keys(state.grants).sort(),
    coveredDates: Object.keys(state.covered).sort()
  };
}

/* --------------------------- cadena e hitos -------------------------- */

/**
 * La cadena vigente con la racha acumulada al cierre de cada día,
 * replicando la aritmética de `deriveStreak` (línea base migrada +
 * cadena posterior consecutiva). Sirve para fechar los hitos: la
 * «fecha en que se alcanzó» es el primer día de la cadena cuyo
 * acumulado llega al hito.
 */
function streakChain(bundle) {
  const info = deriveStreak(bundle || {});
  const days = Array.isArray(info.days) ? info.days : [];
  if (!days.length || info.streakDate == null) {
    return { info, chain: [] };
  }
  /* Última cadena consecutiva: la que termina en streakDate. */
  let start = days.length - 1;
  while (start > 0 && addDays(days[start - 1], 1) === days[start]) start -= 1;
  const run = days.slice(start);
  const posterior = info.baselineDate ? run.filter((d) => d > info.baselineDate) : run;
  const encadenada = Boolean(info.baselineDate) && posterior.length > 0 &&
    posterior[0] === addDays(info.baselineDate, 1);
  const chain = posterior.map((date, i) => ({
    date,
    streakAt: encadenada ? (Number(info.baseline) || 0) + i + 1 : i + 1
  }));
  return { info, chain };
}

/** Fecha en que la cadena vigente alcanzó el hito, o null si no llegó. */
export function milestoneReachDate(bundle, milestone) {
  if (!RACHA_MILESTONES.includes(milestone)) return null;
  const { info, chain } = streakChain(bundle);
  if ((info.streak || 0) < milestone) return null;
  for (const step of chain) {
    if (step.streakAt >= milestone) return step.date;
  }
  /* La línea base migrada ya traía el hito (sin días posteriores que
     lo fechen): se ancla a su propia fecha. */
  return info.baselineDate || info.streakDate || null;
}

/* ------------------------------ grants ------------------------------- */

function ensureState(draft) {
  if (!plain(draft.play)) draft.play = {};
  if (!plain(draft.play.racha)) {
    draft.play.racha = { version: RACHA_VERSION, grants: {}, covered: {} };
  }
  const state = draft.play.racha;
  if (!plain(state.grants)) state.grants = {};
  if (!plain(state.covered)) state.covered = {};
  return state;
}

/**
 * Helper de grant reutilizable: otorga 1 escudo sobre el borrador.
 * Lo usa el reclamo del Contrato (misma escritura atómica) y la
 * mutación de hitos. Reglas: clave con formato cerrado y coherente
 * con `via`; duplicado → se omite; inventario lleno (tope 2) → se
 * omite (anti-acaparamiento). Devuelve { granted, reason }.
 */
export function grantShield(draft, { key, via, at, date } = {}) {
  const kind = grantKeyKind(key);
  if (!kind || kind.via !== via) return { granted: false, reason: "BAD_GRANT_KEY" };
  if (rachaStateOf(draft).grants[key]) return { granted: false, reason: "DUPLICATE" };
  const inventory = shieldInventory(draft);
  if (inventory.available >= RACHA_MAX_SHIELDS) {
    return { granted: false, reason: "INVENTORY_FULL" };
  }
  const state = ensureState(draft);
  const ts = isValidTs(at) ? at : new Date().toISOString();
  state.grants[key] = { date: isValidDateKey(date) ? date : ts.slice(0, 10), at: ts, via };
  return { granted: true, reason: null };
}

/* ------------------------------ consumo ------------------------------ */

/** ¿Registró el jugador actividad HOY en el borrador? (condición b). */
function hasActivityOn(bundle, dateKey) {
  const play = plain(bundle?.play) ? bundle.play : {};
  if (plain(play.checkins) && play.checkins[dateKey]) return true;
  if (plain(play.completions)) {
    for (const record of Object.values(play.completions)) {
      if (record && record.system === "hub" && record.date === dateKey) return true;
    }
  }
  return false;
}

/**
 * Último día activo ANTES de hoy. Ojo: cuando el jugador ya jugó hoy,
 * el `streakDate` de `deriveStreak` ES hoy — el día perdido vive entre
 * este día previo y hoy, así que la condición (a) se mide desde acá.
 */
function lastActiveBefore(info, today) {
  const all = new Set(Array.isArray(info.days) ? info.days : []);
  if (info.baselineDate) all.add(info.baselineDate);
  if (info.streakDate) all.add(info.streakDate);
  let prev = null;
  for (const day of all) {
    if (day < today && (!prev || day > prev)) prev = day;
  }
  return prev;
}

/**
 * El día perdido que un escudo cubriría hoy, o null si no se cumplen
 * las condiciones (a)–(d). Lectura pura: la usan la app (detección al
 * abrir Diarias) y el reducer (revalidación sobre el borrador).
 */
export function coverCandidate(bundle, today) {
  if (!isValidDateKey(today)) return null;
  const state = rachaStateOf(bundle);
  const inventory = shieldInventory(bundle);
  if (inventory.available <= 0) return null;                    /* (c) */
  const info = deriveStreak(bundle || {});
  const prev = lastActiveBefore(info, today);
  if (!prev) return null;
  const missed = addDays(prev, 1);
  if (today !== addDays(prev, 2)) return null;                  /* (a) */
  if (state.covered[missed]) return null;                       /* (d) */
  if (!hasActivityOn(bundle, today)) return null;               /* (b) */
  return missed;
}

/** La clave de grant que paga un día cubierto: la más vieja sin usar. */
function grantKeyForCover(state) {
  const used = new Set(Object.values(state.covered).map((entry) => entry.via));
  const keys = Object.keys(state.grants).sort((a, b) => {
    const da = state.grants[a].date || "";
    const db = state.grants[b].date || "";
    return da === db ? (a < b ? -1 : 1) : (da < db ? -1 : 1);
  });
  return keys.find((key) => !used.has(key)) || keys[0] || null;
}

/* ----------------------------- validación ---------------------------- */

export function rachaProblems(bundle) {
  const raw = bundle?.play?.racha;
  if (raw == null) return [];
  if (!plain(raw)) return ["play.racha debe ser un objeto"];
  const problems = [];
  if (raw.version !== RACHA_VERSION) {
    problems.push(`play.racha.version debe ser ${RACHA_VERSION}`);
  }
  if (!plain(raw.grants)) {
    problems.push("play.racha.grants debe ser un mapa de grants");
  } else {
    for (const [key, grant] of Object.entries(raw.grants)) {
      const at = `play.racha.grants.${key}`;
      const kind = grantKeyKind(key);
      if (!kind) {
        problems.push(`${at}: clave fuera de los formatos cerrados (contrato@YYYY-Www, hito14@fecha, hito30@fecha)`);
        continue;
      }
      if (!plain(grant)) { problems.push(`${at} debe ser un objeto`); continue; }
      if (!isValidDateKey(grant.date)) problems.push(`${at}.date debe ser una fecha válida`);
      if (!isValidTs(grant.at)) problems.push(`${at}.at debe ser una fecha ISO válida`);
      if (grant.via !== kind.via) problems.push(`${at}.via debe ser "${kind.via}"`);
    }
  }
  if (!plain(raw.covered)) {
    problems.push("play.racha.covered debe ser un mapa de días cubiertos");
  } else {
    for (const [date, entry] of Object.entries(raw.covered)) {
      const at = `play.racha.covered.${date}`;
      if (!isValidDateKey(date)) {
        problems.push(`${at}: la clave debe ser una fecha válida`);
        continue;
      }
      if (!plain(entry)) { problems.push(`${at} debe ser un objeto`); continue; }
      if (!isValidTs(entry.at)) problems.push(`${at}.at debe ser una fecha ISO válida`);
      if (typeof entry.via !== "string" || !plain(raw.grants) || !raw.grants[entry.via]) {
        problems.push(`${at}.via debe ser la clave del grant que lo pagó`);
      }
    }
  }
  if (plain(raw.grants) && plain(raw.covered) &&
      Object.keys(raw.covered).length > Object.keys(raw.grants).length) {
    problems.push("play.racha: no puede haber más días cubiertos que grants (|covered| ≤ |grants|)");
  }
  return problems;
}

/* ----------------------------- mutaciones ---------------------------- */

/**
 * Mutaciones del Escudo de Racha:
 *   racha.grant { milestone: 14|30 } — el hito se verifica contra la
 *     racha derivada del borrador; la clave lleva la fecha en que la
 *     cadena alcanzó el hito.
 *   racha.cover { date } — consumo automático: revalida (a)–(d) sobre
 *     el borrador; `date` es el día perdido y «hoy» es la fecha de la
 *     mutación (la fecha de juego que pasa la puerta única).
 */
export function applyRachaMutation(draft, mutation, { at, date } = {}) {
  const no = (reason) => ({ changed: false, duplicate: false, reason, paths: [] });
  const dup = () => ({ changed: false, duplicate: true, reason: "DUPLICATE", paths: [] });
  if (rachaProblems(draft).length) return no("SCHEMA_INVALID");
  const ts = isValidTs(at) ? at : new Date().toISOString();
  const today = isValidDateKey(date) ? date : ts.slice(0, 10);

  if (mutation.type === "racha.grant") {
    const milestone = Number(mutation.milestone);
    if (!RACHA_MILESTONES.includes(milestone)) return no("BAD_MILESTONE");
    const info = deriveStreak(draft);
    if ((info.streak || 0) < milestone) return no("MILESTONE_NOT_REACHED");
    const reach = milestoneReachDate(draft, milestone);
    if (!reach) return no("MILESTONE_NOT_REACHED");
    const key = `hito${milestone}@${reach}`;
    if (rachaStateOf(draft).grants[key]) return dup();
    const result = grantShield(draft, { key, via: "hito", at: ts, date: today });
    if (!result.granted) return no(result.reason || "GRANT_OMITTED");
    return { changed: true, duplicate: false, reason: null, paths: [`play.racha.grants.${key}`] };
  }

  if (mutation.type === "racha.cover") {
    const missed = typeof mutation.date === "string" ? mutation.date : "";
    if (!isValidDateKey(missed)) return no("BAD_DATE");
    const state = rachaStateOf(draft);
    if (state.covered[missed]) return dup();
    if (shieldInventory(draft).available <= 0) return no("NO_SHIELDS");
    const info = deriveStreak(draft);
    const prev = lastActiveBefore(info, today);
    if (!prev) return no("NO_STREAK");
    /* (a) exactamente un día perdido entre el último día activo previo
       y hoy: ni otro día, ni hueco de 2+ (que no lo salvan ni dos
       escudos). */
    if (missed !== addDays(prev, 1) || today !== addDays(prev, 2)) {
      return no("GAP_NOT_COVERABLE");
    }
    /* (b) la racha continúa de verdad: ya hubo actividad hoy. */
    if (!hasActivityOn(draft, today)) return no("NO_ACTIVITY_TODAY");
    const target = ensureState(draft);
    const via = grantKeyForCover(rachaStateOf(draft));
    if (!via) return no("NO_SHIELDS");
    target.covered[missed] = { at: ts, via };
    return { changed: true, duplicate: false, reason: null, paths: [`play.racha.covered.${missed}`] };
  }

  return no("UNKNOWN_MUTATION");
}
