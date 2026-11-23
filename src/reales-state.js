/**
 * reales-state.js — RECOMPENSAS REALES (v0.45.0, Dinámicas de Enganche
 * Fase 1): el puerto fiel de ODEA 1 v5.93. Gastás ₡ ODEA en premios de
 * la vida real que vos definís: el sumidero con sentido, que convierte
 * el saldo en motivación fuera de la pantalla.
 *
 * La herencia de ODEA 1 vive en `core.realRewards.canje` (campo CRÍTICO
 * de la migración) y es INMUTABLE en gameplay: este módulo solo la LEE.
 * Todo lo nuevo se escribe en la sección aditiva `play.reales`:
 *
 *   play.reales = {
 *     version: 1,
 *     custom:  [ { id, ico, n, price, at } ],                 // creadas en ODEA 2
 *     log:     [ { key, id, n, ico, price, date, at, done, doneDate } ],
 *     hidden:  [ rewardId ],        // tumbas: personalizadas HEREDADAS borradas
 *     enjoyed: [ "h:<índice>" ],    // tumbas: canjes HEREDADOS ya disfrutados
 *     spent:   0                    // libro propio de gasto (entero ≥ 0)
 *   }
 *
 * `key` del log propio es el `requestId` del canje: la idempotencia es
 * estructural (un requestId repetido es DUPLICATE sin cargo), igual que
 * el patrón `application.record`. La clave heredada `h:<índice>` es
 * estable porque `core` nunca cambia y el orden del log tampoco.
 *
 * El oráculo (derive.js) suma `play.reales.spent` al gasto total vía
 * mergePlaySources: canjear no da ni quita XP, solo mueve ₡. Por eso no
 * hay `realesRewards`: no nace ninguna recompensa, nace un gasto.
 * `spent` es autoconsistente por validación: debe ser EXACTAMENTE la
 * suma de precios del log propio, o la escritura se rechaza.
 *
 * Un save sin `play.reales` se lee con defaults en memoria, sin tocar
 * el save; la primera mutación crea la estructura completa.
 */

export const REALES_VERSION = 1;
export const REALES_MAX_CUSTOM = 30;
export const REALES_MAX_LOG = 1000;
export const REALES_NAME_MAX = 48;
export const REALES_ICON_MAX = 4;
export const REALES_PRICE_MIN = 1;
export const REALES_PRICE_MAX = 999;
export const REQUEST_ID_PATTERN = /^[a-zA-Z0-9_-]{8,80}$/;

/* Catálogo base: portado EXACTO de ODEA 1 (`LIFE_REWARDS`, v5.93),
   con sus precios calibrados contra esta misma economía (₡30–120). */
export const LIFE_REWARDS = [
  { id: "lr_movie", ico: "🍿", n: "Noche de película con palomitas", price: 30 },
  { id: "lr_sleep", ico: "😴", n: "Dormir hasta tarde, sin alarma", price: 35 },
  { id: "lr_game1h", ico: "🎮", n: "1 hora de videojuegos sin culpa", price: 40 },
  { id: "lr_ian", ico: "🧩", n: "Tarde de juegos con Ian", price: 45 },
  { id: "lr_cheat", ico: "🍔", n: "Comida trampa: antojo libre", price: 50 },
  { id: "lr_moto", ico: "🏍️", n: "Salida en moto sin destino", price: 60 },
  { id: "lr_gustito", ico: "🛍️", n: "Gustito personal (hasta ₡5.000)", price: 100 },
  { id: "lr_libre", ico: "🌴", n: "Medio día libre de obligaciones", price: 120 }
];

const baseById = new Map(LIFE_REWARDS.map((r) => [r.id, r]));

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isValidTs(value) {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

function isValidDateKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

const iconLen = (value) => [...String(value || "")].length;

/* ------------------------------ herencia ------------------------------ */

/**
 * La herencia migrada de ODEA 1, normalizada. Un jugador migrado trae
 * `canje: { custom, log }`; un jugador nuevo (sin migrar) trae la forma
 * distinta `canje: { rewards, history }`. Se aceptan ambas, solo lectura.
 */
export function heritageCanje(bundle) {
  const canje = bundle?.core?.realRewards?.canje;
  if (!isPlainObject(canje)) return { custom: [], log: [] };
  const rawCustom = Array.isArray(canje.custom) ? canje.custom
    : Array.isArray(canje.rewards) ? canje.rewards : [];
  const rawLog = Array.isArray(canje.log) ? canje.log
    : Array.isArray(canje.history) ? canje.history : [];
  const custom = [];
  for (const entry of rawCustom) {
    if (!isPlainObject(entry)) continue;
    const id = typeof entry.id === "string" ? entry.id : "";
    const n = typeof entry.n === "string" ? entry.n : "";
    const price = Number(entry.price);
    if (!id || !n || !Number.isFinite(price) || price <= 0) continue;
    custom.push({ id, ico: typeof entry.ico === "string" && entry.ico ? entry.ico : "🎁", n, price });
  }
  const log = [];
  for (const entry of rawLog) {
    if (!isPlainObject(entry)) continue;
    log.push({
      id: typeof entry.id === "string" ? entry.id : "",
      n: typeof entry.n === "string" ? entry.n : "",
      ico: typeof entry.ico === "string" && entry.ico ? entry.ico : "🎁",
      price: Number(entry.price) || 0,
      date: typeof entry.d === "string" ? entry.d : typeof entry.date === "string" ? entry.date : "",
      done: entry.done === true,
      doneDate: typeof entry.doneDate === "string" ? entry.doneDate : null
    });
  }
  return { custom, log };
}

/* ------------------------------- estado ------------------------------- */

function cleanCustom(raw) {
  if (!isPlainObject(raw)) return null;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const n = typeof raw.n === "string" ? raw.n.trim() : "";
  const ico = typeof raw.ico === "string" ? raw.ico.trim() : "";
  if (!id || !n || n.length > REALES_NAME_MAX) return null;
  if (ico && iconLen(ico) > REALES_ICON_MAX) return null;
  if (!Number.isInteger(raw.price) || raw.price < REALES_PRICE_MIN || raw.price > REALES_PRICE_MAX) return null;
  return { id, ico: ico || "🎁", n, price: raw.price, at: isValidTs(raw.at) ? raw.at : null };
}

function cleanLogEntry(raw) {
  if (!isPlainObject(raw)) return null;
  const key = typeof raw.key === "string" ? raw.key : "";
  if (!REQUEST_ID_PATTERN.test(key)) return null;
  const n = typeof raw.n === "string" ? raw.n : "";
  if (!n) return null;
  if (!Number.isInteger(raw.price) || raw.price < REALES_PRICE_MIN || raw.price > REALES_PRICE_MAX) return null;
  return {
    key,
    id: typeof raw.id === "string" ? raw.id : "",
    n,
    ico: typeof raw.ico === "string" && raw.ico ? raw.ico : "🎁",
    price: raw.price,
    date: isValidDateKey(raw.date) ? raw.date : "",
    at: isValidTs(raw.at) ? raw.at : null,
    done: raw.done === true,
    doneDate: isValidDateKey(raw.doneDate) ? raw.doneDate : null
  };
}

/** Estado propio normalizado (lectura segura ante cualquier guardado). */
export function realesStateOf(bundle) {
  const raw = isPlainObject(bundle?.play?.reales) ? bundle.play.reales : {};
  const custom = [];
  const seenCustom = new Set();
  if (Array.isArray(raw.custom)) {
    for (const entry of raw.custom) {
      const item = cleanCustom(entry);
      if (!item || seenCustom.has(item.id)) continue;
      seenCustom.add(item.id);
      custom.push(item);
    }
  }
  const log = [];
  const seenKeys = new Set();
  if (Array.isArray(raw.log)) {
    for (const entry of raw.log) {
      const item = cleanLogEntry(entry);
      if (!item || seenKeys.has(item.key)) continue;
      seenKeys.add(item.key);
      log.push(item);
    }
  }
  const hidden = Array.isArray(raw.hidden)
    ? [...new Set(raw.hidden.filter((id) => typeof id === "string" && id))]
    : [];
  const enjoyed = Array.isArray(raw.enjoyed)
    ? [...new Set(raw.enjoyed.filter((key) => typeof key === "string" && /^h:\d+$/.test(key)))]
    : [];
  const spent = Number.isInteger(raw.spent) && raw.spent >= 0 ? raw.spent : 0;
  return { version: REALES_VERSION, custom, log, hidden, enjoyed, spent };
}

/** Catálogo efectivo: base + heredadas visibles + nuevas. */
export function realesCatalog(bundle) {
  const state = realesStateOf(bundle);
  const heritage = heritageCanje(bundle);
  const hidden = new Set(state.hidden);
  const out = LIFE_REWARDS.map((r) => ({ ...r, origin: "base", custom: false }));
  for (const item of heritage.custom) {
    if (hidden.has(item.id) || baseById.has(item.id)) continue;
    out.push({ ...item, origin: "heredada", custom: true });
  }
  for (const item of state.custom) {
    out.push({ id: item.id, ico: item.ico, n: item.n, price: item.price, origin: "propia", custom: true });
  }
  return out;
}

/**
 * Vista para la UI: catálogo efectivo, la franja «Por disfrutar»
 * (canjes propios pendientes + heredados pendientes sin disfrutar) y
 * el contador de disfrutadas (heredadas + nuevas).
 */
export function realesView(bundle) {
  const state = realesStateOf(bundle);
  const heritage = heritageCanje(bundle);
  const enjoyedKeys = new Set(state.enjoyed);
  const pending = [];
  let enjoyedCount = 0;

  heritage.log.forEach((entry, index) => {
    const key = `h:${index}`;
    if (entry.done || enjoyedKeys.has(key)) {
      enjoyedCount += 1;
    } else {
      pending.push({ key, origin: "heredada", ...entry });
    }
  });
  for (const entry of state.log) {
    if (entry.done) {
      enjoyedCount += 1;
    } else {
      pending.push({ key: entry.key, origin: "propia", ...entry });
    }
  }

  return {
    catalog: realesCatalog(bundle),
    pending,
    enjoyedCount,
    spent: state.spent,
    customCount: state.custom.length
  };
}

/* ----------------------------- validación ----------------------------- */

/** Problemas estructurales de play.reales (para validatePlayState). */
export function realesProblems(bundle) {
  const raw = bundle?.play?.reales;
  if (raw == null) return [];
  if (!isPlainObject(raw)) return ["play.reales debe ser un objeto"];
  const problems = [];

  if (raw.version !== REALES_VERSION) {
    problems.push(`play.reales.version debe ser ${REALES_VERSION}`);
  }

  if (!Array.isArray(raw.custom)) {
    problems.push("play.reales.custom debe ser una lista");
  } else {
    if (raw.custom.length > REALES_MAX_CUSTOM) {
      problems.push(`play.reales.custom supera el máximo de ${REALES_MAX_CUSTOM} recompensas`);
    }
    const seen = new Set();
    raw.custom.forEach((entry, index) => {
      const at = `play.reales.custom[${index}]`;
      if (!isPlainObject(entry)) { problems.push(`${at} debe ser un objeto`); return; }
      if (typeof entry.id !== "string" || !entry.id.trim() || entry.id.length > 80) {
        problems.push(`${at}.id debe ser un texto no vacío de hasta 80 caracteres`);
      } else if (seen.has(entry.id)) {
        problems.push(`${at}.id está duplicado: ${entry.id}`);
      } else seen.add(entry.id);
      if (typeof entry.n !== "string" || !entry.n.trim() || entry.n.length > REALES_NAME_MAX) {
        problems.push(`${at}.n debe ser un texto de 1 a ${REALES_NAME_MAX} caracteres`);
      }
      if (typeof entry.ico !== "string" || iconLen(entry.ico) > REALES_ICON_MAX) {
        problems.push(`${at}.ico debe ser un texto de hasta ${REALES_ICON_MAX} caracteres`);
      }
      if (!Number.isInteger(entry.price) || entry.price < REALES_PRICE_MIN || entry.price > REALES_PRICE_MAX) {
        problems.push(`${at}.price debe ser un entero entre ${REALES_PRICE_MIN} y ${REALES_PRICE_MAX}`);
      }
      if (!isValidTs(entry.at)) problems.push(`${at}.at debe ser una fecha ISO válida`);
    });
  }

  let logSum = 0;
  if (!Array.isArray(raw.log)) {
    problems.push("play.reales.log debe ser una lista");
  } else {
    if (raw.log.length > REALES_MAX_LOG) {
      problems.push(`play.reales.log supera el máximo de ${REALES_MAX_LOG} canjes`);
    }
    const seen = new Set();
    raw.log.forEach((entry, index) => {
      const at = `play.reales.log[${index}]`;
      if (!isPlainObject(entry)) { problems.push(`${at} debe ser un objeto`); return; }
      if (typeof entry.key !== "string" || !REQUEST_ID_PATTERN.test(entry.key)) {
        problems.push(`${at}.key debe ser un requestId válido`);
      } else if (seen.has(entry.key)) {
        problems.push(`${at}.key está duplicado: ${entry.key}`);
      } else seen.add(entry.key);
      if (typeof entry.id !== "string" || !entry.id) problems.push(`${at}.id debe ser un texto no vacío`);
      if (typeof entry.n !== "string" || !entry.n || entry.n.length > REALES_NAME_MAX) {
        problems.push(`${at}.n debe ser un texto de 1 a ${REALES_NAME_MAX} caracteres`);
      }
      if (typeof entry.ico !== "string" || iconLen(entry.ico) > REALES_ICON_MAX) {
        problems.push(`${at}.ico debe ser un texto de hasta ${REALES_ICON_MAX} caracteres`);
      }
      if (!Number.isInteger(entry.price) || entry.price < REALES_PRICE_MIN || entry.price > REALES_PRICE_MAX) {
        problems.push(`${at}.price debe ser un entero entre ${REALES_PRICE_MIN} y ${REALES_PRICE_MAX}`);
      } else logSum += entry.price;
      if (!isValidDateKey(entry.date)) problems.push(`${at}.date debe ser una fecha válida`);
      if (!isValidTs(entry.at)) problems.push(`${at}.at debe ser una fecha ISO válida`);
      if (typeof entry.done !== "boolean") problems.push(`${at}.done debe ser booleano`);
      if (entry.doneDate != null && !isValidDateKey(entry.doneDate)) {
        problems.push(`${at}.doneDate debe ser una fecha válida o null`);
      }
    });
  }

  if (!Array.isArray(raw.hidden) || raw.hidden.some((id) => typeof id !== "string" || !id)) {
    problems.push("play.reales.hidden debe ser una lista de ids");
  } else if (new Set(raw.hidden).size !== raw.hidden.length) {
    problems.push("play.reales.hidden tiene ids duplicados");
  }

  if (!Array.isArray(raw.enjoyed) || raw.enjoyed.some((key) => typeof key !== "string" || !/^h:\d+$/.test(key))) {
    problems.push("play.reales.enjoyed debe ser una lista de claves heredadas (h:<índice>)");
  } else if (new Set(raw.enjoyed).size !== raw.enjoyed.length) {
    problems.push("play.reales.enjoyed tiene claves duplicadas");
  }

  if (!Number.isInteger(raw.spent) || raw.spent < 0) {
    problems.push("play.reales.spent debe ser un entero >= 0");
  } else if (Array.isArray(raw.log) && raw.spent !== logSum) {
    problems.push(`play.reales.spent (${raw.spent}) no cuadra con la suma del log (${logSum})`);
  }

  return problems;
}

/* ----------------------------- mutaciones ----------------------------- */

function ensureState(draft) {
  if (!isPlainObject(draft.play)) draft.play = {};
  if (!isPlainObject(draft.play.reales)) {
    draft.play.reales = { version: REALES_VERSION, custom: [], log: [], hidden: [], enjoyed: [], spent: 0 };
  }
  const state = draft.play.reales;
  if (!Array.isArray(state.custom)) state.custom = [];
  if (!Array.isArray(state.log)) state.log = [];
  if (!Array.isArray(state.hidden)) state.hidden = [];
  if (!Array.isArray(state.enjoyed)) state.enjoyed = [];
  if (!Number.isInteger(state.spent)) state.spent = 0;
  return state;
}

/**
 * Mutaciones de Recompensas Reales. Las despacha gameplay.applyMutation
 * y SIEMPRE pasan por applyGameplayMutation (la única escritura).
 * Contrato del motor: { changed, duplicate, reason, paths }.
 */
export function applyRealesMutation(draft, mutation, { at, date } = {}) {
  const no = (reason) => ({ changed: false, duplicate: false, reason, paths: [] });
  const dup = () => ({ changed: false, duplicate: true, reason: "DUPLICATE", paths: [] });
  if (realesProblems(draft).length) return no("SCHEMA_INVALID");
  const ts = isValidTs(at) ? at : new Date().toISOString();
  const dateKey = isValidDateKey(date) ? date : ts.slice(0, 10);
  const state = realesStateOf(draft);
  const heritage = heritageCanje(draft);

  if (mutation.type === "reales.create") {
    const n = typeof mutation.n === "string" ? mutation.n.trim().slice(0, REALES_NAME_MAX) : "";
    if (!n) return no("BAD_NAME");
    const icoRaw = typeof mutation.ico === "string" ? mutation.ico.trim() : "";
    if (icoRaw && iconLen(icoRaw) > REALES_ICON_MAX) return no("BAD_ICON");
    const ico = icoRaw || "🎁";
    const price = Number(mutation.price);
    if (!Number.isInteger(price) || price < REALES_PRICE_MIN || price > REALES_PRICE_MAX) return no("BAD_PRICE");
    if (state.custom.length >= REALES_MAX_CUSTOM) return no("REALES_FULL");
    const taken = new Set(realesCatalog(draft).map((r) => r.id));
    const seed = (Date.parse(ts) || 0).toString(36);
    let id = `cx2-${seed}`;
    let suffix = 0;
    while (taken.has(id)) { suffix += 1; id = `cx2-${seed}-${suffix}`; }
    const target = ensureState(draft);
    target.custom.push({ id, ico, n, price, at: ts });
    return { changed: true, duplicate: false, reason: null, paths: ["play.reales.custom"] };
  }

  if (mutation.type === "reales.delete") {
    const rewardId = typeof mutation.rewardId === "string" ? mutation.rewardId : "";
    if (!rewardId) return no("BAD_REWARD_ID");
    if (baseById.has(rewardId)) return no("NOT_CUSTOM");
    if (state.custom.some((item) => item.id === rewardId)) {
      const target = ensureState(draft);
      target.custom = target.custom.filter((item) => item.id !== rewardId);
      return { changed: true, duplicate: false, reason: null, paths: ["play.reales.custom"] };
    }
    /* Heredada: core no se toca; el id entra en las tumbas `hidden`. */
    if (heritage.custom.some((item) => item.id === rewardId)) {
      if (state.hidden.includes(rewardId)) return dup();
      const target = ensureState(draft);
      target.hidden.push(rewardId);
      return { changed: true, duplicate: false, reason: null, paths: ["play.reales.hidden"] };
    }
    return no("UNKNOWN_REWARD");
  }

  if (mutation.type === "reales.redeem") {
    const requestId = typeof mutation.requestId === "string" ? mutation.requestId : "";
    if (!REQUEST_ID_PATTERN.test(requestId)) return no("BAD_REQUEST_ID");
    /* Idempotencia: el mismo requestId jamás cobra dos veces. */
    if (state.log.some((entry) => entry.key === requestId)) return dup();
    const reward = realesCatalog(draft).find((item) => item.id === mutation.rewardId);
    if (!reward) return no("UNKNOWN_REWARD");
    if (state.log.length >= REALES_MAX_LOG) return no("REALES_LOG_FULL");
    const balance = Number(draft.core?.derived?.coins?.balance) || 0;
    if (balance < reward.price) return no("INSUFFICIENT_FUNDS");
    const target = ensureState(draft);
    target.spent += reward.price;
    target.log.push({
      key: requestId, id: reward.id, n: reward.n, ico: reward.ico,
      price: reward.price, date: dateKey, at: ts, done: false, doneDate: null
    });
    return { changed: true, duplicate: false, reason: null, paths: ["play.reales.spent", "play.reales.log"] };
  }

  if (mutation.type === "reales.enjoy") {
    const key = typeof mutation.key === "string" ? mutation.key : "";
    if (/^h:\d+$/.test(key)) {
      const index = Number(key.slice(2));
      const entry = heritage.log[index];
      if (!entry) return no("UNKNOWN_KEY");
      if (entry.done || state.enjoyed.includes(key)) return dup();
      const target = ensureState(draft);
      target.enjoyed.push(key);
      return { changed: true, duplicate: false, reason: null, paths: ["play.reales.enjoyed"] };
    }
    const entry = state.log.find((item) => item.key === key);
    if (!entry) return no("UNKNOWN_KEY");
    if (entry.done) return dup();
    const target = ensureState(draft);
    const saved = target.log.find((item) => item.key === key);
    saved.done = true;
    saved.doneDate = dateKey;
    return { changed: true, duplicate: false, reason: null, paths: ["play.reales.log"] };
  }

  return no("UNKNOWN_MUTATION");
}
