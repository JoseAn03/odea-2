/**
 * Costa Neón: el Estudio Neón vivo (marca personal), sin DOM ni
 * almacenamiento. El espejo jugable del plan «Marca personal en redes
 * sociales» de José (aprobado el 2026-11-22): dos pestañas — «YO MISMO»
 * (sus redes personales) y «EL ANALISTA» (LinkedIn) — con el sistema
 * del Garaje vivo y del Mundo de Ian vivo: TODO desbloqueado desde el
 * primer día, sin orden obligatorio. Las rutinas se repiten con su
 * propio reloj y pagan una vez por ciclo; los hitos pagan una sola
 * vez. Al completar los 10 hitos se gana el rango «Estrella de Costa
 * Neón». El catálogo vive aquí (no es campaña): títulos, textos, XP y
 * monedas son los del diseño aprobado (diseno-marca-personal-odea2).
 */

export const MARCA_VERSION = 1;
export const DUE_SOON_DAYS = 3;

export const MARCA_TABS = {
  yo: { id: "yo", name: "YO MISMO", icon: "📸", detail: "Instagram · WhatsApp · TikTok" },
  analista: { id: "analista", name: "EL ANALISTA", icon: "💼", detail: "LinkedIn · tu marca profesional" }
};

/* Catálogo: [pestaña, tipo, días, XP, ₡]. El orden es el del diseño:
   marca-01…06 rutinas «YO MISMO», 07…12 sus hitos; 13…18 rutinas de
   «EL ANALISTA», 19…22 sus hitos. */
const CATALOG = [
  { id: "marca-01", tab: "yo", kind: "rutina", days: 3, xp: 40, coins: 3,
    title: "Capturar el momento",
    brief: "Foto o clip de 10 s: con Ian, con tu pareja, vos solo o de algo que valga la pena. Sin revisar ni borrar en el momento." },
  { id: "marca-02", tab: "yo", kind: "rutina", days: 5, xp: 40, coins: 3,
    title: "Historia o estado",
    brief: "Una historia de Instagram o un estado de WhatsApp con algo de hoy. Dura 24 h: cero presión." },
  { id: "marca-03", tab: "yo", kind: "rutina", days: 7, xp: 50, coins: 3,
    title: "Clip corto de tu vida",
    brief: "10–20 s de algo real: el carro, una partida, un paseo, los perros. Sin hablar si no querés." },
  { id: "marca-04", tab: "yo", kind: "rutina", days: 7, xp: 60, coins: 4,
    title: "Publicación personal",
    brief: "Una foto en tu Instagram con una línea honesta, de tu álbum, sin producir nada nuevo." },
  { id: "marca-05", tab: "yo", kind: "rutina", days: 14, xp: 40, coins: 3,
    title: "Ordenar el álbum",
    brief: "Revisá las fotos del teléfono y marcá como favoritas las que cuentan algo: ese es tu banco para compartir." },
  { id: "marca-06", tab: "yo", kind: "rutina", days: 14, xp: 50, coins: 3,
    title: "Foto vieja con historia",
    brief: "Rescatá una foto vieja y contá en una línea dónde estabas y qué pasaba." },
  { id: "marca-07", tab: "yo", kind: "hito", days: 0, xp: 60, coins: 4,
    title: "Perfiles al día",
    brief: "Foto y bio de Instagram que te representen hoy, y foto de WhatsApp actual." },
  { id: "marca-08", tab: "yo", kind: "hito", days: 0, xp: 60, coins: 4,
    title: "Primera historia",
    brief: "Tu primera historia de Instagram o estado de WhatsApp. La primera es la que más cuesta." },
  { id: "marca-09", tab: "yo", kind: "hito", days: 0, xp: 80, coins: 5,
    title: "Primera publicación personal",
    brief: "Tu primera foto publicada en Instagram." },
  { id: "marca-10", tab: "yo", kind: "hito", days: 0, xp: 80, coins: 5,
    title: "Primer TikTok",
    brief: "Subí tu primer video a TikTok; el de Jarvis ya es material listo." },
  { id: "marca-11", tab: "yo", kind: "hito", days: 0, xp: 80, coins: 5,
    title: "Primer Reel",
    brief: "Tu primer Reel de Instagram con un video que ya tengás." },
  { id: "marca-12", tab: "yo", kind: "hito", days: 0, xp: 100, coins: 6,
    title: "Cara a cámara: 30 segundos",
    brief: "Grabate hablando 30 s contando una cosa. No tiene que salir perfecto: tiene que existir." },
  { id: "marca-13", tab: "analista", kind: "rutina", days: 4, xp: 60, coins: 4,
    title: "Post de LinkedIn",
    brief: "Una publicación de tu banco de ideas: lo que construís, datos en la vida real o el camino." },
  { id: "marca-14", tab: "analista", kind: "rutina", days: 5, xp: 40, coins: 3,
    title: "Comentar con aporte",
    brief: "Un comentario con sustancia en la publicación de otro profesional de datos. No «buen post»: un aporte." },
  { id: "marca-15", tab: "analista", kind: "rutina", days: 7, xp: 70, coins: 5,
    title: "Contar un mini caso",
    brief: "Un caso corto con datos sintéticos: el problema, qué encontraste, qué cambió (como el doble conteo de no-shows)." },
  { id: "marca-16", tab: "analista", kind: "rutina", days: 7, xp: 60, coins: 4,
    title: "Clip de proyecto",
    brief: "15 s de algo que estás construyendo, con tu voz sobre la pantalla: Jarvis respondiendo, la ciudad moviéndose." },
  { id: "marca-17", tab: "analista", kind: "rutina", days: 7, xp: 50, coins: 3,
    title: "Reutilizar un material",
    brief: "Un material que ya salió en una plataforma, adaptado a otra: grabar una vez, publicar en varios lados." },
  { id: "marca-18", tab: "analista", kind: "rutina", days: 30, xp: 80, coins: 5,
    title: "Revisión de la marca",
    brief: "15 min: qué se publicó, qué conectó más y UN solo ajuste para el mes siguiente." },
  { id: "marca-19", tab: "analista", kind: "hito", days: 0, xp: 80, coins: 5,
    title: "Publicación #1: Jarvis",
    brief: "El post de Jarvis en LinkedIn con el video de tu teléfono. El primer ladrillo de la marca." },
  { id: "marca-20", tab: "analista", kind: "hito", days: 0, xp: 100, coins: 6,
    title: "Triple salida",
    brief: "Un mismo material publicado en 3 plataformas (LinkedIn + TikTok + Reel). El sistema funcionando." },
  { id: "marca-21", tab: "analista", kind: "hito", days: 0, xp: 80, coins: 5,
    title: "Primera conversación abierta",
    brief: "Un comentario tuyo en LinkedIn que recibe respuesta del autor." },
  { id: "marca-22", tab: "analista", kind: "hito", days: 0, xp: 80, coins: 5,
    title: "Contar tu camino",
    brief: "Tu primer post del pilar «el camino»: empleo, estudios o construir siendo papá." }
];

export const MARCA_ITEMS = CATALOG;
const byId = new Map(MARCA_ITEMS.map((m) => [m.id, m]));

const plain = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const DAY_MS = 86400000;
const dayNum = (d) => Math.round(Date.parse(`${d}T00:00:00Z`) / DAY_MS);
export const daysBetween = (a, b) => dayNum(b) - dayNum(a);
const addDays = (d, n) => new Date((dayNum(d) + n) * DAY_MS).toISOString().slice(0, 10);
const validDate = (d) => typeof d === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(`${d}T00:00:00Z`)) &&
  new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;

export function marcaStateOf(bundle) {
  const value = bundle?.play?.marca;
  return plain(value) ? value : { version: MARCA_VERSION, log: {}, records: {} };
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

export function marcaView(bundle, today) {
  const state = marcaStateOf(bundle);
  const log = plain(state.log) ? state.log : {};
  const items = MARCA_ITEMS.map((m) => {
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
  const tabs = Object.values(MARCA_TABS).map((tab) => ({
    ...tab,
    items: items.filter((m) => m.tab === tab.id),
    rutinas: items.filter((m) => m.tab === tab.id && m.kind === "rutina"),
    hitos: items.filter((m) => m.tab === tab.id && m.kind === "hito")
  }));
  const rutinas = items.filter((m) => m.kind === "rutina");
  const hitos = items.filter((m) => m.kind === "hito");
  /* La tarjeta semanal mezcla las DOS pestañas: rutinas vencidas, por
     vencer o sin registro, y las que vencen dentro de 7 días. */
  const week = rutinas.filter((m) => m.state !== "al-dia" || (m.dueIn != null && m.dueIn <= 7));
  const hitosDone = hitos.filter((m) => m.state === "completada").length;
  return {
    today, items, tabs, week,
    byItemId,
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

export function marcaRewards(bundle) {
  const state = marcaStateOf(bundle);
  const out = { xp: 0, coins: 0 };
  for (const record of Object.values(plain(state.records) ? state.records : {})) {
    out.xp += Number(record?.reward?.xp) || 0;
    out.coins += Number(record?.reward?.coins) || 0;
  }
  return out;
}

export function marcaProblems(bundle) {
  const state = bundle?.play?.marca;
  if (state == null) return [];
  const errors = [];
  if (!plain(state) || state.version !== MARCA_VERSION ||
      !plain(state.log) || !plain(state.records)) {
    return ["marca: forma o versión inválida"];
  }
  for (const [id, e] of Object.entries(state.log)) {
    if (!byId.has(id) || !plain(e) || !validDate(e.lastDate) ||
        !Number.isSafeInteger(e.times) || e.times < 0 ||
        !Number.isSafeInteger(e.paidTimes) || e.paidTimes < 0) {
      errors.push(`marca.log.${id}: registro inválido`);
    }
  }
  for (const [id, r] of Object.entries(state.records)) {
    if (!plain(r) || !byId.has(r.missionId) || !validDate(r.date) ||
        typeof r.at !== "string" || !Number.isFinite(Date.parse(r.at)) ||
        !plain(r.reward) || !Number.isSafeInteger(r.reward.xp) || r.reward.xp < 0 ||
        !Number.isSafeInteger(r.reward.coins) || r.reward.coins < 0 || r.rulesVersion !== 1) {
      errors.push(`marca.records.${id}: registro inválido`);
    }
  }
  return errors;
}

function ensureState(draft) {
  if (!plain(draft.play)) draft.play = {};
  if (!plain(draft.play.marca)) {
    draft.play.marca = { version: MARCA_VERSION, log: {}, records: {} };
  }
  const state = draft.play.marca;
  if (!plain(state.log)) state.log = {};
  if (!plain(state.records)) state.records = {};
  return state;
}

/** Called only by gameplay.applyMutation after it has checked the date. */
export function applyMarcaMutation(draft, mutation, { at, date }) {
  const no = (reason, duplicate = false) => ({ changed: false, duplicate, reason, paths: [] });
  if (marcaProblems(draft).length) return no("SCHEMA_INVALID");

  if (mutation.type === "marca.complete") {
    const item = byId.get(mutation.missionId);
    if (!item) return no("UNKNOWN_MISSION");
    const state0 = marcaStateOf(draft);
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
      state.records[recordId] = {
        missionId: item.id, date, at,
        reward: { xp: item.xp, coins: item.coins }, rulesVersion: 1
      };
    }
    state.log[item.id] = own;
    return { changed: true, duplicate: false, reason: null, paths: [`play.marca.log.${item.id}`] };
  }

  return no("UNKNOWN_MUTATION");
}
