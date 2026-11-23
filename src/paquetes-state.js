/**
 * paquetes-state.js — PAQUETES NEÓN (v0.48.0, Dinámicas de Enganche
 * Fase 4): la cacería estilo GTA de los 20 cassettes neón escondidos
 * por Costa Neón. Caminar entre bloques ya no es solo tránsito: cada
 * paseo es una búsqueda y la ciudad misma es el tablero de colección.
 *
 *   play.paquetes = {
 *     version: 1,
 *     found: { "tape-07": { date, at, reward: { xp: 15, coins: 1 },
 *                           rulesVersion: 1 } },
 *     prize: null | { date, at, reward: { xp: 100, coins: 25 },
 *                     rulesVersion: 1 }
 *   }
 *
 * REGLAS (diseño §5):
 *   - Cada cassette paga 15 XP + ₡1, congelados en su registro (R1).
 *   - Al completar los 20, el panel de Colección del Inventario ofrece
 *     el premio final: 100 XP + ₡25, con mutación propia
 *     `paquete.prize` (reclamo manual = ceremonia; el reducer exige
 *     20/20 y `prize: null`).
 *   - Totales de la dinámica, una sola vez en la vida del save:
 *     20 × 15 + 100 = 400 XP y 20 × 1 + 25 = ₡45.
 *   - Anti-doble-pago estructural: `found[spotId]` es clave única —
 *     recoger dos veces el mismo punto es físicamente imposible (el
 *     sprite no se pinta) y la mutación devuelve DUPLICATE si ya
 *     existe. El premio, una sola vez por `prize: null → registro`.
 *   - Defaults/migración: sección ausente = 0 encontrados; la ciudad
 *     de un save viejo amanece con los 20 cassettes esperándolo (eso
 *     es contenido nuevo, no migración). El oráculo suma el componente
 *     nuevo `paquetes`, que vale 0 sin actividad: paridad byte a byte.
 *
 * LOS 20 PUNTOS (§5.2): coordenadas fijadas contra js/city/layout.js
 * (mundo 2720×2720, manzanas de 540 separadas por calles de 110, anillo
 * perimetral de 120) y verificadas caminando la ruta en Chrome real.
 * Reglas de colocación: sobre aceras (el marco de 22 unidades de cada
 * manzana, centro a 11 del borde), parques y borde de playa — NUNCA
 * dentro de un bloque con piel (las pieles cubren el interior desde el
 * inset 22), nunca en medio de una calle, nunca tras un letrero (los
 * letreros de local viven al pie sur-centro de su manzana; los spots
 * de manzana con local usan los marcos norte/este/oeste).
 */

export const PAQUETES_VERSION = 1;
export const PAQUETE_REWARD = Object.freeze({ xp: 15, coins: 1 });
export const PAQUETE_PRIZE_REWARD = Object.freeze({ xp: 100, coins: 25 });
export const PAQUETE_RULES_VERSION = 1;
/** Radio de recolección por proximidad, en unidades de mundo (§5.1). */
export const PAQUETE_COLLECT_RADIUS = 44;

/** Las 5 paletas del cassette, rotando por spot (§5.2). */
export const PAQUETE_PALETTES = Object.freeze([
  Object.freeze({ name: "rosado", body: "#FF2E93", dark: "#7A0E44", light: "#FF7AB8" }),
  Object.freeze({ name: "cian", body: "#00B8CC", dark: "#00586B", light: "#5FF2FF" }),
  Object.freeze({ name: "dorado", body: "#E8A812", dark: "#7A5200", light: "#FFD166" }),
  Object.freeze({ name: "verde", body: "#2FA84F", dark: "#14532A", light: "#7AE79B" }),
  Object.freeze({ name: "violeta", body: "#8B5CF6", dark: "#472B8A", light: "#C4A6FF" })
]);

/**
 * El catálogo cerrado de spots. `x`/`y` = centro del cassette en
 * unidades de mundo; `pal` = índice en PAQUETE_PALETTES.
 * Distribución exacta de §5.2: Hub 3 · playa oeste 3 · playa/Eventos 2
 * · Mirador 1 · Academia 1 · Zona IA 1 · Zona Gamer 1 · sur 2 ·
 * Mercado 1 · Garaje 1 · Mundo Ian 1 (acera) · Estudio Neón 1 (acera)
 * · rotonda central 1 · parque sur 1 = 20.
 */
export const PAQUETE_SPOTS = Object.freeze([
  { id: "tape-01", zona: "Parque del Hub", x: 1040, y: 1105, pal: 0 },
  { id: "tape-02", zona: "Parque del Hub", x: 1625, y: 1040, pal: 1 },
  { id: "tape-03", zona: "Parque del Hub", x: 1040, y: 1625, pal: 2 },
  { id: "tape-04", zona: "Playa oeste", x: 24, y: 500, pal: 3 },
  { id: "tape-05", zona: "Playa oeste", x: 24, y: 1100, pal: 4 },
  { id: "tape-06", zona: "Playa oeste", x: 24, y: 2200, pal: 0 },
  { id: "tape-07", zona: "Playa · Zona de Eventos", x: 390, y: 2700, pal: 1 },
  { id: "tape-08", zona: "Playa este", x: 2700, y: 1040, pal: 2 },
  { id: "tape-09", zona: "Mirador · UCR de la Mente", x: 131, y: 390, pal: 3 },
  { id: "tape-10", zona: "Academia", x: 781, y: 390, pal: 4 },
  { id: "tape-11", zona: "Zona IA", x: 1949, y: 390, pal: 0 },
  { id: "tape-12", zona: "Zona Gamer", x: 2081, y: 390, pal: 1 },
  { id: "tape-13", zona: "El Brete", x: 1040, y: 2081, pal: 2 },
  { id: "tape-14", zona: "Edificios del sur", x: 1690, y: 2081, pal: 3 },
  { id: "tape-15", zona: "Mercado · Tienda", x: 2081, y: 1040, pal: 4 },
  { id: "tape-16", zona: "Garaje", x: 2599, y: 1690, pal: 0 },
  { id: "tape-17", zona: "Mundo de Ian", x: 1431, y: 1690, pal: 1 },
  { id: "tape-18", zona: "Estudio Neón", x: 390, y: 781, pal: 2 },
  { id: "tape-19", zona: "La rotonda central", x: 1471, y: 1259, pal: 3 },
  { id: "tape-20", zona: "Parque sur", x: 1105, y: 1690, pal: 4 }
].map((spot) => Object.freeze(spot)));

export const PAQUETE_SPOT_IDS = Object.freeze(PAQUETE_SPOTS.map((s) => s.id));
const SPOT_BY_ID = Object.fromEntries(PAQUETE_SPOTS.map((s) => [s.id, s]));

export function paqueteSpot(spotId) {
  return SPOT_BY_ID[spotId] || null;
}

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

function frozenRecord(reward, rulesVersion) {
  return {
    xp: Number(reward && reward.xp),
    coins: Number(reward && reward.coins),
    rulesVersion
  };
}

function isFrozenRecord(record, expected) {
  return plain(record) &&
    isValidDateKey(record.date) &&
    isValidTs(record.at) &&
    plain(record.reward) &&
    record.reward.xp === expected.xp &&
    record.reward.coins === expected.coins &&
    record.rulesVersion === PAQUETE_RULES_VERSION;
}

/* ------------------------------ estado ------------------------------ */

export function paquetesStateOf(bundle) {
  const raw = plain(bundle?.play?.paquetes) ? bundle.play.paquetes : {};
  const found = {};
  if (plain(raw.found)) {
    for (const [spotId, record] of Object.entries(raw.found)) {
      if (!SPOT_BY_ID[spotId] || !isFrozenRecord(record, PAQUETE_REWARD)) continue;
      found[spotId] = {
        date: record.date,
        at: record.at,
        reward: { xp: PAQUETE_REWARD.xp, coins: PAQUETE_REWARD.coins },
        rulesVersion: PAQUETE_RULES_VERSION
      };
    }
  }
  const prize = isFrozenRecord(raw.prize, PAQUETE_PRIZE_REWARD)
    ? {
        date: raw.prize.date,
        at: raw.prize.at,
        reward: { xp: PAQUETE_PRIZE_REWARD.xp, coins: PAQUETE_PRIZE_REWARD.coins },
        rulesVersion: PAQUETE_RULES_VERSION
      }
    : null;
  return { version: PAQUETES_VERSION, found, prize };
}

/** Recompensas derivadas: lo que el oráculo suma (componente `paquetes`). */
export function paquetesRewards(bundle) {
  const state = paquetesStateOf(bundle);
  const out = { xp: 0, coins: 0 };
  for (const record of Object.values(state.found)) {
    out.xp += record.reward.xp;
    out.coins += record.reward.coins;
  }
  if (state.prize) {
    out.xp += state.prize.reward.xp;
    out.coins += state.prize.reward.coins;
  }
  return out;
}

/** Vista para la ciudad (qué pintar) y el panel de Colección. */
export function paquetesView(bundle) {
  const state = paquetesStateOf(bundle);
  const foundCount = Object.keys(state.found).length;
  const complete = foundCount >= PAQUETE_SPOTS.length;
  return {
    total: PAQUETE_SPOTS.length,
    foundCount,
    complete,
    prizeClaimed: state.prize !== null,
    canClaimPrize: complete && state.prize === null,
    spots: PAQUETE_SPOTS.map((spot) => ({
      ...spot,
      found: Boolean(state.found[spot.id]),
      date: state.found[spot.id] ? state.found[spot.id].date : null
    })),
    rewards: paquetesRewards(bundle)
  };
}

/**
 * El cassette sin recoger más cercano al jugador dentro del radio de
 * recolección, o null. Lectura pura: la usan el tick de la ciudad
 * (app.js) para disparar `paquete.collect` y las pruebas.
 */
export function nearestCollectible(bundle, x, y, radius = PAQUETE_COLLECT_RADIUS) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const state = paquetesStateOf(bundle);
  let best = null;
  for (const spot of PAQUETE_SPOTS) {
    if (state.found[spot.id]) continue;
    const dist = Math.hypot(spot.x - x, spot.y - y);
    if (dist <= radius && (!best || dist < best.dist)) best = { spot, dist };
  }
  return best ? best.spot : null;
}

/* ----------------------------- validación ---------------------------- */

export function paquetesProblems(bundle) {
  const raw = bundle?.play?.paquetes;
  if (raw == null) return [];
  if (!plain(raw)) return ["play.paquetes debe ser un objeto"];
  const problems = [];
  if (raw.version !== PAQUETES_VERSION) {
    problems.push(`play.paquetes.version debe ser ${PAQUETES_VERSION}`);
  }
  if (!plain(raw.found)) {
    problems.push("play.paquetes.found debe ser un mapa de cassettes encontrados");
  } else {
    for (const [spotId, record] of Object.entries(raw.found)) {
      const at = `play.paquetes.found.${spotId}`;
      if (!SPOT_BY_ID[spotId]) {
        problems.push(`${at}: spot fuera del catálogo cerrado de ${PAQUETE_SPOTS.length}`);
        continue;
      }
      if (!isFrozenRecord(record, PAQUETE_REWARD)) {
        problems.push(`${at}: registro inválido (date/at válidos, reward congelada {xp:${PAQUETE_REWARD.xp}, coins:${PAQUETE_REWARD.coins}, rulesVersion ${PAQUETE_RULES_VERSION})`);
      }
    }
  }
  if (raw.prize !== null && raw.prize !== undefined) {
    if (!isFrozenRecord(raw.prize, PAQUETE_PRIZE_REWARD)) {
      problems.push(`play.paquetes.prize: registro inválido (date/at válidos, reward congelada {xp:${PAQUETE_PRIZE_REWARD.xp}, coins:${PAQUETE_PRIZE_REWARD.coins}, rulesVersion ${PAQUETE_RULES_VERSION})`);
    } else if (plain(raw.found) && Object.keys(raw.found).length < PAQUETE_SPOTS.length) {
      problems.push("play.paquetes.prize: el premio exige la colección completa (20/20)");
    }
  }
  return problems;
}

/* ----------------------------- mutaciones ---------------------------- */

function ensureState(draft) {
  if (!plain(draft.play)) draft.play = {};
  if (!plain(draft.play.paquetes)) {
    draft.play.paquetes = { version: PAQUETES_VERSION, found: {}, prize: null };
  }
  const state = draft.play.paquetes;
  if (!plain(state.found)) state.found = {};
  if (state.prize === undefined) state.prize = null;
  return state;
}

/**
 * Mutaciones de Paquetes Neón:
 *   paquete.collect { spotId } — la recolección por proximidad en la
 *     ciudad. DUPLICATE si el spot ya está en `found` (el sprite ni se
 *     pinta: físicamente imposible de repetir).
 *   paquete.prize {} — el premio final, reclamo manual desde el botón
 *     del panel de Colección (ceremonia): exige 20/20 y `prize: null`.
 */
export function applyPaquetesMutation(draft, mutation, { at, date } = {}) {
  const no = (reason) => ({ changed: false, duplicate: false, reason, paths: [] });
  const dup = () => ({ changed: false, duplicate: true, reason: "DUPLICATE", paths: [] });
  if (paquetesProblems(draft).length) return no("SCHEMA_INVALID");
  const ts = isValidTs(at) ? at : new Date().toISOString();
  const today = isValidDateKey(date) ? date : ts.slice(0, 10);

  if (mutation.type === "paquete.collect") {
    const spot = paqueteSpot(mutation.spotId);
    if (!spot) return no("UNKNOWN_SPOT");
    if (paquetesStateOf(draft).found[spot.id]) return dup();
    const state = ensureState(draft);
    state.found[spot.id] = {
      date: today,
      at: ts,
      reward: { ...PAQUETE_REWARD },
      rulesVersion: PAQUETE_RULES_VERSION
    };
    return { changed: true, duplicate: false, reason: null, paths: [`play.paquetes.found.${spot.id}`] };
  }

  if (mutation.type === "paquete.prize") {
    const current = paquetesStateOf(draft);
    if (current.prize) return dup();
    if (Object.keys(current.found).length < PAQUETE_SPOTS.length) return no("NOT_COMPLETE");
    const state = ensureState(draft);
    state.prize = {
      date: today,
      at: ts,
      reward: { ...PAQUETE_PRIZE_REWARD },
      rulesVersion: PAQUETE_RULES_VERSION
    };
    return { changed: true, duplicate: false, reason: null, paths: ["play.paquetes.prize"] };
  }

  return no("UNKNOWN_MUTATION");
}
