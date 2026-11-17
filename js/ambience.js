/**
 * ambience.js — perfil visual de la ciudad derivado de datos de LECTURA.
 *
 * Módulo PURO: no toca DOM, no lee ni escribe el save por su cuenta y nunca
 * llama a la función de mutación. El renderizador consume este perfil; nada de
 * lo que pasa acá altera elegibilidad, recompensas ni progreso (guía, pág. 13:
 * «Ningún vehículo, reflejo o cambio de luz puede llamar a la función de
 * mutación»).
 *
 * Todo es determinista y reproducible: misma fecha y misma hora producen el
 * mismo perfil, también después de recargar.
 */

import { DISTRICTS, XP_HOME } from "./districts.js";

export const PHASE_DAY = "day";
export const PHASE_DUSK = "dusk";
export const PHASE_NIGHT = "night";

/* Amanecer ~6:00 y anochecer ~18:00 en Costa Rica (zona tropical). */
const DAY_START = 6;
const DUSK_START = 18;
const NIGHT_START = 20;

export const WEATHER_CLEAR = "clear";
export const WEATHER_DRIZZLE = "drizzle";
export const WEATHER_RAIN = "rain";

/** Fase del día. Acepta cualquier entero y normaliza al rango 0–23. */
export function phaseForHour(hour) {
  const value = Number(hour);
  if (!Number.isFinite(value)) return PHASE_DAY;
  const h = ((Math.floor(value) % 24) + 24) % 24;
  if (h >= NIGHT_START || h < DAY_START) return PHASE_NIGHT;
  if (h >= DUSK_START) return PHASE_DUSK;
  return PHASE_DAY;
}

/** FNV-1a de 32 bits: mismo texto → mismo número, sin Math.random. */
function seedOf(text) {
  let hash = 0x811c9dc5;
  const value = String(text);
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Clima ficticio y ESTABLE del día, derivado de la fecha local.
 *
 * No es meteorología real y la UI no debe presentarlo como tal: es una semilla
 * para que dos cargas del mismo día se vean igual.
 */
export function weatherForDate(dateKey) {
  const roll = seedOf(`odea2-weather:${String(dateKey || "")}`) % 100;
  if (roll < 62) return WEATHER_CLEAR;
  if (roll < 86) return WEATHER_DRIZZLE;
  return WEATHER_RAIN;
}

/** Sistemas jugables → distrito, para contar completaciones nuevas. */
const SYSTEM_DISTRICT = { hub: "hub", empleo: "empleo", vida: "vida" };

/**
 * Nivel de progreso por distrito, con umbrales documentados:
 *
 *   0 → sin actividad
 *   1 → hay XP migrado del distrito (progreso heredado de ODEA 1)
 *   2 → además hay completaciones nuevas registradas en ODEA 2
 *
 * No inventa denominadores ni porcentajes: solo distingue presencia de
 * actividad real, que es lo que el render usa para encender más o menos.
 */
export function districtLevels(bundle) {
  const breakdown = (bundle && bundle.core && bundle.core.derived && bundle.core.derived.xpBreakdown) || {};
  const completions = (bundle && bundle.play && bundle.play.completions) || {};

  const newByDistrict = {};
  for (const record of Object.values(completions)) {
    const district = record && SYSTEM_DISTRICT[record.system];
    if (district) newByDistrict[district] = (newByDistrict[district] || 0) + 1;
  }

  const levels = {};
  for (const district of DISTRICTS) {
    const keys = Object.keys(XP_HOME).filter((key) => XP_HOME[key] === district.id);
    const migratedXP = keys.reduce((sum, key) => sum + (Number(breakdown[key]) || 0), 0);
    const level = newByDistrict[district.id] ? 2 : migratedXP > 0 ? 1 : 0;
    levels[district.id] = { level, migratedXP, newCompletions: newByDistrict[district.id] || 0 };
  }
  return levels;
}

/**
 * Perfil completo que consume el renderizador.
 *
 * @param {object} bundle save activo (solo lectura)
 * @param {{date?: string, hour?: number, reducedMotion?: boolean}} options
 */
export function ambienceFor(bundle, options = {}) {
  const now = new Date();
  const date = typeof options.date === "string" ? options.date : localKey(now);
  const hour = Number.isFinite(Number(options.hour)) ? Number(options.hour) : now.getHours();
  const phase = phaseForHour(hour);
  const weather = weatherForDate(date);
  const reducedMotion = Boolean(options.reducedMotion);

  const night = phase === PHASE_NIGHT;
  const dusk = phase === PHASE_DUSK;

  /* El tinte se aplica encima del mundo con alfa bajo: la guía pide emoción
     sin castigo, y apagar la ciudad de golpe rompe la lectura del mapa. */
  const tint = night
    ? { color: "#160A24", alpha: 0.15 }
    : dusk
      ? { color: "#3A1430", alpha: 0.10 }
      : { color: "#000000", alpha: 0 };

  return {
    date,
    hour,
    phase,
    night,
    dusk,
    weather,
    tint,
    /* Las luces se encienden de noche y al atardecer; de día casi no se notan. */
    lights: night || dusk,
    windowBoost: night ? 1.25 : dusk ? 1.1 : 0.72,
    /* Tráfico limitado: se reduce antes de tocar la interacción (pág. 13). */
    traffic: reducedMotion ? 1 : night ? 1 : 2,
    districts: districtLevels(bundle)
  };
}

function localKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
