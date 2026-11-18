/**
 * Costa Neón: el Garaje vivo, sin DOM ni almacenamiento.
 * Las rutinas de vehículos de ODEA 1 con su reloj propio: cada misión
 * guarda su última fecha y vence según su ritmo (7/14/15/30/90/365 días).
 * Los proyectos de detalle se completan una sola vez. Los títulos, pasos,
 * XP y monedas viven en la campaña `garaje` de campaigns.js (única fuente);
 * aquí solo van el vehículo, el tipo y el ritmo de cada misión.
 * Lo ya ganado en la campaña del Garaje (v0.29.0) siembra el reloj: su
 * fecha cuenta como último registro y su pago ya quedó en campaignRewards,
 * por eso garageRewards solo suma los registros propios (play.garaje).
 */
import { CAMPAIGNS } from "./campaigns.js";

export const GARAGE_VERSION = 1;
export const DUE_SOON_DAYS = 3;

export const GARAGE_VEHICLES = {
  carro: { id: "carro", name: "Hyundai Accent 2017", detail: "Carro · manual", icon: "🚗" },
  moto: { id: "moto", name: "Formula X2", detail: "Moto", icon: "🏍️" }
};

/* vehicle / kind / days por misión (el orden es el de la campaña garaje):
   01–07 rutinas del carro, 08–13 proyectos del carro, 14 Dekra (365),
   15–20 rutinas de la moto, 21–26 proyectos de la moto, 27 Dekra (365). */
const META = {
  "garaje-01": ["carro", "rutina", 7], "garaje-02": ["carro", "rutina", 14],
  "garaje-03": ["carro", "rutina", 14], "garaje-04": ["carro", "rutina", 15],
  "garaje-05": ["carro", "rutina", 30], "garaje-06": ["carro", "rutina", 30],
  "garaje-07": ["carro", "rutina", 90],
  "garaje-08": ["carro", "proyecto", 0], "garaje-09": ["carro", "proyecto", 0],
  "garaje-10": ["carro", "proyecto", 0], "garaje-11": ["carro", "proyecto", 0],
  "garaje-12": ["carro", "proyecto", 0], "garaje-13": ["carro", "proyecto", 0],
  "garaje-14": ["carro", "rutina", 365],
  "garaje-15": ["moto", "rutina", 7], "garaje-16": ["moto", "rutina", 7],
  "garaje-17": ["moto", "rutina", 14], "garaje-18": ["moto", "rutina", 15],
  "garaje-19": ["moto", "rutina", 30], "garaje-20": ["moto", "rutina", 30],
  "garaje-21": ["moto", "proyecto", 0], "garaje-22": ["moto", "proyecto", 0],
  "garaje-23": ["moto", "proyecto", 0], "garaje-24": ["moto", "proyecto", 0],
  "garaje-25": ["moto", "proyecto", 0], "garaje-26": ["moto", "proyecto", 0],
  "garaje-27": ["moto", "rutina", 365]
};

export const GARAGE_MISSIONS = CAMPAIGNS.garaje.chapters
  .flatMap((chapter) => chapter.missions)
  .map((m) => {
    const [vehicle, kind, days] = META[m.id] || ["carro", "proyecto", 0];
    return { ...m, vehicle, kind, days };
  });
const byId = new Map(GARAGE_MISSIONS.map((m) => [m.id, m]));

const plain = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const DAY_MS = 86400000;
const dayNum = (d) => Math.round(Date.parse(`${d}T00:00:00Z`) / DAY_MS);
export const daysBetween = (a, b) => dayNum(b) - dayNum(a);
const addDays = (d, n) => new Date((dayNum(d) + n) * DAY_MS).toISOString().slice(0, 10);
const validDate = (d) => typeof d === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(`${d}T00:00:00Z`)) &&
  new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;

export function garageStateOf(bundle) {
  const value = bundle?.play?.garaje;
  return plain(value) ? value : { version: GARAGE_VERSION, log: {}, records: {}, km: {} };
}

/* Reloj efectivo por misión: el log propio manda; la campaña siembra. */
export function effectiveLog(bundle) {
  const state = garageStateOf(bundle);
  const out = {};
  for (const m of GARAGE_MISSIONS) {
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
      ? { state: "completada", label: "COMPLETADO", dueIn: null, paysNow: false }
      : { state: "pendiente", label: "PENDIENTE", dueIn: null, paysNow: true };
  }
  if (!entry) return { state: "sin-registro", label: "SIN REGISTRO", dueIn: null, paysNow: true };
  const due = addDays(entry.lastDate, mission.days);
  const dueIn = daysBetween(today, due);
  if (dueIn < 0) return { state: "vencida", label: "VENCIDA", dueIn, paysNow: true };
  if (dueIn <= DUE_SOON_DAYS) return { state: "por-vencer", label: "POR VENCER", dueIn, paysNow: true };
  return { state: "al-dia", label: "AL DÍA", dueIn, paysNow: false };
}

export function garageView(bundle, today) {
  const state = garageStateOf(bundle);
  const log = effectiveLog(bundle);
  const missions = GARAGE_MISSIONS.map((m) => {
    const entry = log[m.id] || null;
    const status = missionStatus(m, entry, today);
    return { ...m, lastDate: entry?.lastDate || null, times: entry?.times || 0, ...status };
  });
  const rutinas = missions.filter((m) => m.kind === "rutina");
  const week = rutinas.filter((m) => m.state !== "al-dia" || (m.dueIn != null && m.dueIn <= 7));
  const vehicles = Object.values(GARAGE_VEHICLES).map((v) => {
    const kmState = plain(state.km) && plain(state.km[v.id]) ? state.km[v.id] : { current: 0, entries: [] };
    const entries = Array.isArray(kmState.entries) ? kmState.entries : [];
    return {
      ...v,
      km: Number(kmState.current) || 0,
      kmDate: entries.length ? entries[entries.length - 1].date : null,
      missions: missions.filter((m) => m.vehicle === v.id)
    };
  });
  return {
    today, missions, vehicles, week,
    rutinasAlDia: rutinas.filter((m) => m.state === "al-dia").length,
    rutinasTotal: rutinas.length,
    vencidas: rutinas.filter((m) => m.state === "vencida").length,
    proyectosDone: missions.filter((m) => m.kind === "proyecto" && m.state === "completada").length,
    proyectosTotal: missions.filter((m) => m.kind === "proyecto").length
  };
}

export function garageRewards(bundle) {
  const state = garageStateOf(bundle);
  const out = { xp: 0, coins: 0 };
  for (const record of Object.values(plain(state.records) ? state.records : {})) {
    out.xp += Number(record?.reward?.xp) || 0;
    out.coins += Number(record?.reward?.coins) || 0;
  }
  return out;
}

export function garageProblems(bundle) {
  const state = bundle?.play?.garaje;
  if (state == null) return [];
  const errors = [];
  if (!plain(state) || state.version !== GARAGE_VERSION ||
      !plain(state.log) || !plain(state.records) || !plain(state.km)) {
    return ["garaje: forma o versión inválida"];
  }
  for (const [id, e] of Object.entries(state.log)) {
    if (!byId.has(id) || !plain(e) || !validDate(e.lastDate) ||
        !Number.isSafeInteger(e.times) || e.times < 0 ||
        !Number.isSafeInteger(e.paidTimes) || e.paidTimes < 0) {
      errors.push(`garaje.log.${id}: registro inválido`);
    }
  }
  for (const [id, r] of Object.entries(state.records)) {
    if (!plain(r) || !byId.has(r.missionId) || !validDate(r.date) ||
        typeof r.at !== "string" || !Number.isFinite(Date.parse(r.at)) ||
        !plain(r.reward) || !Number.isSafeInteger(r.reward.xp) || r.reward.xp < 0 ||
        !Number.isSafeInteger(r.reward.coins) || r.reward.coins < 0 || r.rulesVersion !== 1) {
      errors.push(`garaje.records.${id}: registro inválido`);
    }
  }
  for (const [vehicle, k] of Object.entries(state.km)) {
    if (!GARAGE_VEHICLES[vehicle] || !plain(k) || !Number.isSafeInteger(k.current) || k.current < 0 ||
        !Array.isArray(k.entries) || k.entries.length > 200 ||
        k.entries.some((e) => !plain(e) || !Number.isSafeInteger(e.km) || e.km < 0 || !validDate(e.date))) {
      errors.push(`garaje.km.${vehicle}: registro inválido`);
    }
  }
  return errors;
}

function ensureState(draft) {
  if (!plain(draft.play)) draft.play = {};
  if (!plain(draft.play.garaje)) {
    draft.play.garaje = { version: GARAGE_VERSION, log: {}, records: {}, km: {} };
  }
  const state = draft.play.garaje;
  if (!plain(state.log)) state.log = {};
  if (!plain(state.records)) state.records = {};
  if (!plain(state.km)) state.km = {};
  return state;
}

/** Called only by gameplay.applyMutation after it has checked the date. */
export function applyGarageMutation(draft, mutation, { at, date }) {
  const no = (reason, duplicate = false) => ({ changed: false, duplicate, reason, paths: [] });
  if (garageProblems(draft).length) return no("SCHEMA_INVALID");

  if (mutation.type === "garage.complete") {
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
    return { changed: true, duplicate: false, reason: null, paths: [`play.garaje.log.${mission.id}`] };
  }

  if (mutation.type === "garage.km") {
    const vehicle = GARAGE_VEHICLES[mutation.vehicle];
    if (!vehicle) return no("UNKNOWN_VEHICLE");
    const km = mutation.km;
    if (!Number.isSafeInteger(km) || km < 0 || km > 2000000) return no("KM_INVALID");
    const state = ensureState(draft);
    if (!plain(state.km[vehicle.id])) state.km[vehicle.id] = { current: 0, entries: [] };
    const slot = state.km[vehicle.id];
    slot.entries = [...(Array.isArray(slot.entries) ? slot.entries : []), { km, date, at }].slice(-200);
    slot.current = km;
    return { changed: true, duplicate: false, reason: null, paths: [`play.garaje.km.${vehicle.id}`] };
  }

  return no("UNKNOWN_MUTATION");
}
