/**
 * Costa Neón: el Mundo de Ian vivo, sin DOM ni almacenamiento.
 * La ruta de Ian Daniel con el sistema del Garaje vivo (pedido de José):
 * TODAS las misiones desbloqueadas desde el inicio, sin orden obligatorio.
 * Las misiones de práctica y juego (hábitos, rituales con papá, juegos)
 * son «rutinas» con su propio reloj: se repiten y pagan una vez por
 * ciclo (7 días; el paseo de exploradores, 15). Los «proyectos» y logros
 * se completan una sola vez. Los títulos, pasos, XP y monedas viven en
 * la campaña `mundoian` de campaigns.js (única fuente); aquí solo van el
 * tipo y el ritmo de cada misión.
 * Lo ya ganado en la campaña original (v0.35.0, secuencial) siembra el
 * reloj: su fecha cuenta como último registro y su pago ya quedó en
 * campaignRewards, por eso ianRewards solo suma los registros propios
 * (play.ian).
 */
import { CAMPAIGNS } from "./campaigns.js";

export const IAN_VERSION = 1;
export const DUE_SOON_DAYS = 3;

/* kind / days por misión (el orden es el de la campaña mundoian):
   rutinas de 7 días = hábitos y juegos que se repiten cada semana;
   el paseo (51) es rutina de 15 días; el resto son proyectos de una vez. */
const META = {
  "mundoian-01": ["proyecto", 0], "mundoian-02": ["rutina", 7],
  "mundoian-03": ["rutina", 7], "mundoian-04": ["proyecto", 0],
  "mundoian-05": ["rutina", 7], "mundoian-06": ["proyecto", 0],
  "mundoian-07": ["rutina", 7], "mundoian-08": ["rutina", 7],
  "mundoian-09": ["rutina", 7], "mundoian-10": ["rutina", 7],
  "mundoian-11": ["rutina", 7], "mundoian-12": ["proyecto", 0],
  "mundoian-13": ["rutina", 7], "mundoian-14": ["rutina", 7],
  "mundoian-15": ["rutina", 7], "mundoian-16": ["rutina", 7],
  "mundoian-17": ["proyecto", 0], "mundoian-18": ["proyecto", 0],
  "mundoian-19": ["rutina", 7], "mundoian-20": ["rutina", 7],
  "mundoian-21": ["proyecto", 0], "mundoian-22": ["proyecto", 0],
  "mundoian-23": ["rutina", 7], "mundoian-24": ["rutina", 7],
  "mundoian-25": ["rutina", 7], "mundoian-26": ["proyecto", 0],
  "mundoian-27": ["rutina", 7], "mundoian-28": ["rutina", 7],
  "mundoian-29": ["rutina", 7], "mundoian-30": ["rutina", 7],
  "mundoian-31": ["rutina", 7], "mundoian-32": ["proyecto", 0],
  "mundoian-33": ["rutina", 7], "mundoian-34": ["proyecto", 0],
  "mundoian-35": ["proyecto", 0], "mundoian-36": ["rutina", 7],
  "mundoian-37": ["proyecto", 0], "mundoian-38": ["proyecto", 0],
  "mundoian-39": ["proyecto", 0], "mundoian-40": ["rutina", 7],
  "mundoian-41": ["proyecto", 0], "mundoian-42": ["rutina", 7],
  "mundoian-43": ["proyecto", 0], "mundoian-44": ["proyecto", 0],
  "mundoian-45": ["rutina", 7], "mundoian-46": ["proyecto", 0],
  "mundoian-47": ["rutina", 7], "mundoian-48": ["proyecto", 0],
  "mundoian-49": ["rutina", 7], "mundoian-50": ["rutina", 7],
  "mundoian-51": ["rutina", 15], "mundoian-52": ["proyecto", 0],
  "mundoian-53": ["rutina", 7], "mundoian-54": ["proyecto", 0]
};

export const IAN_MISSIONS = CAMPAIGNS.mundoian.chapters
  .flatMap((chapter) => chapter.missions)
  .map((m) => {
    const [kind, days] = META[m.id] || ["proyecto", 0];
    return { ...m, kind, days };
  });
const byId = new Map(IAN_MISSIONS.map((m) => [m.id, m]));

const plain = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const DAY_MS = 86400000;
const dayNum = (d) => Math.round(Date.parse(`${d}T00:00:00Z`) / DAY_MS);
export const daysBetween = (a, b) => dayNum(b) - dayNum(a);
const addDays = (d, n) => new Date((dayNum(d) + n) * DAY_MS).toISOString().slice(0, 10);
const validDate = (d) => typeof d === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(`${d}T00:00:00Z`)) &&
  new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;

export function ianStateOf(bundle) {
  const value = bundle?.play?.ian;
  return plain(value) ? value : { version: IAN_VERSION, log: {}, records: {} };
}

/* Reloj efectivo por misión: el log propio manda; la campaña siembra. */
export function effectiveLog(bundle) {
  const state = ianStateOf(bundle);
  const out = {};
  for (const m of IAN_MISSIONS) {
    const own = plain(state.log) ? state.log[m.id] : null;
    const seed = bundle?.play?.campaigns?.completions?.[m.id];
    let entry = null;
    if (seed && typeof seed.date === "string") {
      entry = { lastDate: seed.date, times: 1, paidTimes: 1, seeded: true };
    }
    if (plain(own) && typeof own.lastDate === "string") {
      if (!entry || own.lastDate >= entry.lastDate) {
        entry = { lastDate: own.lastDate, times: own.times || 0, paidTimes: own.paidTimes || 0, seeded: false };
      }
    }
    if (entry) out[m.id] = entry;
  }
  return out;
}

function missionStatus(mission, entry, today) {
  if (mission.kind === "proyecto") {
    return entry
      ? { state: "completada", label: "COMPLETADA", dueIn: null, paysNow: false }
      : { state: "pendiente", label: "PENDIENTE", dueIn: null, paysNow: true };
  }
  if (!entry) return { state: "sin-registro", label: "SIN HACER", dueIn: null, paysNow: true };
  const due = addDays(entry.lastDate, mission.days);
  const dueIn = daysBetween(today, due);
  if (dueIn < 0) return { state: "vencida", label: "VENCIDA", dueIn, paysNow: true };
  if (dueIn <= DUE_SOON_DAYS) return { state: "por-vencer", label: "POR VENCER", dueIn, paysNow: true };
  return { state: "al-dia", label: "AL DÍA", dueIn, paysNow: false };
}

export function ianView(bundle, today) {
  const log = effectiveLog(bundle);
  const missions = IAN_MISSIONS.map((m) => {
    const entry = log[m.id] || null;
    const status = missionStatus(m, entry, today);
    return { ...m, lastDate: entry?.lastDate || null, times: entry?.times || 0, ...status };
  });
  const byMissionId = new Map(missions.map((m) => [m.id, m]));
  const chapters = CAMPAIGNS.mundoian.chapters.map((chapter) => ({
    id: chapter.id,
    title: chapter.title,
    subtitle: chapter.subtitle,
    missions: chapter.missions.map((m) => byMissionId.get(m.id))
  }));
  const rutinas = missions.filter((m) => m.kind === "rutina");
  const week = rutinas.filter((m) => m.state !== "al-dia" || (m.dueIn != null && m.dueIn <= 7));
  const probadas = missions.filter((m) => m.times > 0).length;
  return {
    today, missions, chapters, week,
    probadas, total: missions.length,
    rank: probadas === missions.length,
    rutinasAlDia: rutinas.filter((m) => m.state === "al-dia").length,
    rutinasTotal: rutinas.length,
    vencidas: rutinas.filter((m) => m.state === "vencida").length,
    proyectosDone: missions.filter((m) => m.kind === "proyecto" && m.state === "completada").length,
    proyectosTotal: missions.filter((m) => m.kind === "proyecto").length
  };
}

export function ianRewards(bundle) {
  const state = ianStateOf(bundle);
  const out = { xp: 0, coins: 0 };
  for (const record of Object.values(plain(state.records) ? state.records : {})) {
    out.xp += Number(record?.reward?.xp) || 0;
    out.coins += Number(record?.reward?.coins) || 0;
  }
  return out;
}

export function ianProblems(bundle) {
  const state = bundle?.play?.ian;
  if (state == null) return [];
  const errors = [];
  if (!plain(state) || state.version !== IAN_VERSION ||
      !plain(state.log) || !plain(state.records)) {
    return ["ian: forma o versión inválida"];
  }
  for (const [id, e] of Object.entries(state.log)) {
    if (!byId.has(id) || !plain(e) || !validDate(e.lastDate) ||
        !Number.isSafeInteger(e.times) || e.times < 0 ||
        !Number.isSafeInteger(e.paidTimes) || e.paidTimes < 0) {
      errors.push(`ian.log.${id}: registro inválido`);
    }
  }
  for (const [id, r] of Object.entries(state.records)) {
    if (!plain(r) || !byId.has(r.missionId) || !validDate(r.date) ||
        typeof r.at !== "string" || !Number.isFinite(Date.parse(r.at)) ||
        !plain(r.reward) || !Number.isSafeInteger(r.reward.xp) || r.reward.xp < 0 ||
        !Number.isSafeInteger(r.reward.coins) || r.reward.coins < 0 || r.rulesVersion !== 1) {
      errors.push(`ian.records.${id}: registro inválido`);
    }
  }
  return errors;
}

function ensureState(draft) {
  if (!plain(draft.play)) draft.play = {};
  if (!plain(draft.play.ian)) {
    draft.play.ian = { version: IAN_VERSION, log: {}, records: {} };
  }
  const state = draft.play.ian;
  if (!plain(state.log)) state.log = {};
  if (!plain(state.records)) state.records = {};
  return state;
}

/** Called only by gameplay.applyMutation after it has checked the date. */
export function applyIanMutation(draft, mutation, { at, date }) {
  const no = (reason, duplicate = false) => ({ changed: false, duplicate, reason, paths: [] });
  if (ianProblems(draft).length) return no("SCHEMA_INVALID");

  if (mutation.type === "ian.complete") {
    const mission = byId.get(mutation.missionId);
    if (!mission) return no("UNKNOWN_MISSION");
    const log = effectiveLog(draft);
    const entry = log[mission.id] || null;
    if (entry && entry.lastDate === date) return no("DUPLICATE", true);
    if (mission.kind === "proyecto" && entry) return no("DUPLICATE", true);
    const status = missionStatus(mission, entry, date);
    const state = ensureState(draft);
    const own = plain(state.log[mission.id])
      ? state.log[mission.id]
      : { lastDate: entry?.lastDate || date, times: entry?.times || 0, paidTimes: entry?.paidTimes || 0 };
    own.lastDate = date;
    own.times = (own.times || 0) + 1;
    if (status.paysNow) {
      own.paidTimes = (own.paidTimes || 0) + 1;
      const recordId = `${mission.id}@${date}#${own.paidTimes}`;
      state.records[recordId] = {
        missionId: mission.id, date, at,
        reward: { xp: mission.xp, coins: mission.coins }, rulesVersion: 1
      };
    }
    state.log[mission.id] = own;
    return { changed: true, duplicate: false, reason: null, paths: [`play.ian.log.${mission.id}`] };
  }

  return no("UNKNOWN_MUTATION");
}
