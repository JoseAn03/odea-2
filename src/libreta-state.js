/**
 * libreta-state.js — estado y reglas de la LIBRETA (v0.41.0), la app de
 * notas personales del teléfono de Costa Neón: una libreta de espiral
 * estilo Vice City donde José anota lo que se le ocurra (ideas del juego,
 * pendientes, lo que sea) sin salir del ecosistema de ODEA 2.
 *
 * Es una libreta PERSONAL: no da XP, no da monedas y no tiene ninguna
 * relación con misiones, campañas ni sistemas vivos. Por eso NO toca
 * derive(): los totales del jugador quedan idénticos con o sin notas.
 *
 *   play.libreta = {
 *     notes: [
 *       { id, titulo, texto, ts },   // ts = ISO de creación/última edición
 *       ...
 *     ]
 *   }
 *
 * Como Jarvis, la sección se crea perezosamente en la primera escritura
 * (ensureState): un save de una versión anterior, sin `play.libreta`,
 * carga sin error y sin perder nada. Las notas viven dentro del bundle,
 * así que viajan solas en el respaldo manual (exportar/importar) y en la
 * restauración, sin ningún paso extra.
 *
 * Topes defensivos (protegen la cuota de localStorage): máximo de notas
 * y largos máximos de título y texto. Son generosos para un uso personal.
 */

export const LIBRETA_MAX_NOTES = 200;
export const LIBRETA_TITLE_MAX = 120;
export const LIBRETA_TEXT_MAX = 5000;
export const LIBRETA_ID_MAX = 80;

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isValidTs(value) {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

function cleanText(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanNote(raw) {
  if (!isPlainObject(raw)) return null;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!id || id.length > LIBRETA_ID_MAX) return null;
  const titulo = typeof raw.titulo === "string" ? raw.titulo : "";
  const texto = typeof raw.texto === "string" ? raw.texto : "";
  if (!isValidTs(raw.ts)) return null;
  if (!titulo.trim() && !texto.trim()) return null;
  return { id, titulo, texto, ts: raw.ts };
}

/** Estado de la Libreta normalizado (lectura segura ante cualquier guardado). */
export function libretaStateOf(bundle) {
  const raw = isPlainObject(bundle?.play?.libreta) ? bundle.play.libreta : {};
  const notes = [];
  const seen = new Set();
  if (Array.isArray(raw.notes)) {
    for (const entry of raw.notes) {
      const note = cleanNote(entry);
      if (!note || seen.has(note.id)) continue;
      seen.add(note.id);
      notes.push(note);
    }
  }
  return { notes };
}

/**
 * Vista para la UI: las notas ordenadas por última edición (la más
 * reciente primero), con el título visible ya resuelto — si la nota no
 * tiene título, se usa la primera línea del texto o «Sin título».
 */
export function libretaView(bundle) {
  const { notes } = libretaStateOf(bundle);
  const sorted = [...notes].sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
  return {
    notes: sorted.map((note) => ({
      ...note,
      displayTitle: note.titulo.trim() || firstLine(note.texto) || "Sin título",
      excerpt: excerptOf(note.texto),
    })),
    count: sorted.length,
  };
}

function firstLine(texto) {
  const line = String(texto || "").split("\n").map((part) => part.trim()).find(Boolean);
  return line ? line.slice(0, LIBRETA_TITLE_MAX) : "";
}

function excerptOf(texto) {
  const flat = String(texto || "").replace(/\s+/g, " ").trim();
  return flat.length > 90 ? `${flat.slice(0, 90)}…` : flat;
}

/** Problemas estructurales de play.libreta (para validatePlayState). */
export function libretaProblems(bundle) {
  const raw = bundle?.play?.libreta;
  if (raw == null) return [];
  if (!isPlainObject(raw)) return ["play.libreta debe ser un objeto"];
  const problems = [];

  if (!Array.isArray(raw.notes)) {
    problems.push("play.libreta.notes debe ser una lista");
    return problems;
  }
  if (raw.notes.length > LIBRETA_MAX_NOTES) {
    problems.push(`play.libreta.notes supera el máximo de ${LIBRETA_MAX_NOTES} notas`);
  }
  const seen = new Set();
  raw.notes.forEach((note, index) => {
    const at = `play.libreta.notes[${index}]`;
    if (!isPlainObject(note)) {
      problems.push(`${at} debe ser un objeto`);
      return;
    }
    if (typeof note.id !== "string" || !note.id.trim() || note.id.length > LIBRETA_ID_MAX) {
      problems.push(`${at}.id debe ser un texto no vacío de hasta ${LIBRETA_ID_MAX} caracteres`);
    } else if (seen.has(note.id)) {
      problems.push(`${at}.id está duplicado: ${note.id}`);
    } else {
      seen.add(note.id);
    }
    if (typeof note.titulo !== "string" || note.titulo.length > LIBRETA_TITLE_MAX) {
      problems.push(`${at}.titulo debe ser un texto de hasta ${LIBRETA_TITLE_MAX} caracteres`);
    }
    if (typeof note.texto !== "string" || note.texto.length > LIBRETA_TEXT_MAX) {
      problems.push(`${at}.texto debe ser un texto de hasta ${LIBRETA_TEXT_MAX} caracteres`);
    }
    if (
      typeof note.titulo === "string" && typeof note.texto === "string" &&
      !note.titulo.trim() && !note.texto.trim()
    ) {
      problems.push(`${at} no puede estar vacía (sin título ni texto)`);
    }
    if (!isValidTs(note.ts)) problems.push(`${at}.ts debe ser una fecha ISO válida`);
  });

  return problems;
}

function ensureState(draft) {
  if (!isPlainObject(draft.play)) draft.play = {};
  if (!isPlainObject(draft.play.libreta)) draft.play.libreta = { notes: [] };
  const state = draft.play.libreta;
  if (!Array.isArray(state.notes)) state.notes = [];
  return state;
}

/**
 * Mutaciones de la Libreta. Las despacha gameplay.applyMutation y SIEMPRE
 * pasan por applyGameplayMutation (la única escritura del guardado).
 * Contrato del motor: { changed, duplicate, reason, paths }.
 */
export function applyLibretaMutation(draft, mutation, { at } = {}) {
  const no = (reason) => ({ changed: false, duplicate: false, reason, paths: [] });
  if (libretaProblems(draft).length) return no("SCHEMA_INVALID");
  const state = ensureState(draft);
  const ts = isValidTs(at) ? at : new Date().toISOString();

  if (mutation.type === "libreta.create") {
    const id = typeof mutation.id === "string" ? mutation.id.trim() : "";
    if (!id || id.length > LIBRETA_ID_MAX) return no("BAD_NOTE_ID");
    if (state.notes.some((note) => note.id === id)) {
      return { changed: false, duplicate: true, reason: "DUPLICATE", paths: [] };
    }
    const titulo = cleanText(mutation.titulo, LIBRETA_TITLE_MAX);
    const texto = cleanText(mutation.texto, LIBRETA_TEXT_MAX);
    if (!titulo && !texto) return no("EMPTY_NOTE");
    if (state.notes.length >= LIBRETA_MAX_NOTES) return no("LIBRETA_FULL");
    state.notes.unshift({ id, titulo, texto, ts });
    return { changed: true, duplicate: false, reason: null, paths: ["play.libreta.notes"] };
  }

  if (mutation.type === "libreta.update") {
    const id = typeof mutation.id === "string" ? mutation.id.trim() : "";
    const note = state.notes.find((entry) => entry.id === id);
    if (!note) return no("UNKNOWN_NOTE");
    const titulo = cleanText(mutation.titulo, LIBRETA_TITLE_MAX);
    const texto = cleanText(mutation.texto, LIBRETA_TEXT_MAX);
    if (!titulo && !texto) return no("EMPTY_NOTE");
    if (note.titulo === titulo && note.texto === texto) {
      return { changed: false, duplicate: true, reason: "DUPLICATE", paths: [] };
    }
    note.titulo = titulo;
    note.texto = texto;
    note.ts = ts;
    return { changed: true, duplicate: false, reason: null, paths: ["play.libreta.notes"] };
  }

  if (mutation.type === "libreta.delete") {
    const id = typeof mutation.id === "string" ? mutation.id.trim() : "";
    const index = state.notes.findIndex((entry) => entry.id === id);
    if (index === -1) return no("UNKNOWN_NOTE");
    state.notes.splice(index, 1);
    return { changed: true, duplicate: false, reason: null, paths: ["play.libreta.notes"] };
  }

  return no("UNKNOWN_MUTATION");
}
