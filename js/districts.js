/**
 * districts.js — los 9 distritos de Costa Neón y el mapeo cerrado
 * sistema → distrito. Datos puros: lo usan la capa visual y los tests.
 *
 * Regla: cada componente de xpBreakdown y cada una de las 11 claves legacy
 * tiene EXACTAMENTE un distrito. `events` (log archivado) y `juice`
 * (preferencias) viven en El Hub porque no son sistemas de juego.
 */

import { cellRect, cellsRect } from "./city/layout.js";

export const PALETTE = {
  bg: "#12081F",
  pink: "#FF2E93",
  cyan: "#00E5FF",
  orange: "#FF8A3D"
};

/* --------------------------- utilidades de color --------------------------- */

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16)
  };
}

function rgbToHex({ r, g, b }) {
  return "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
}

/** Mezcla dos colores de la paleta. t=0 → a, t=1 → b. */
export function mix(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const k = Math.max(0, Math.min(1, t));
  return rgbToHex({
    r: ca.r + (cb.r - ca.r) * k,
    g: ca.g + (cb.g - ca.g) * k,
    b: ca.b + (cb.b - ca.b) * k
  });
}

/** Color con transparencia, para canvas/CSS. */
export function alpha(hex, a) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/* --------------------------------- distritos -------------------------------- */

function district(id, name, subtitle, cells, accent, style, description, xp = [], keys = []) {
  const rect = cellsRect(cells);
  return {
    id,
    name,
    subtitle,
    cells,
    rect,
    accent,
    style,
    description,
    xp,
    keys,
    label: { x: rect.x + rect.w / 2, y: rect.y + 58 },
    chipLabel: name.replace(/^(El|La) /, "")
  };
}

export const DISTRICTS = [
  district(
    "hub",
    "El Hub",
    "Plaza Central",
    [[1, 1], [2, 1], [1, 2], [2, 2]],
    PALETTE.pink,
    "hub",
    "El corazón de Costa Neón: tu progreso entero, de un vistazo.",
    ["ach", "evento", "farm"],
    ["hub", "events", "juice"]
  ),
  district(
    "ia",
    "Distrito IA",
    "Zona Franca de Heredia",
    [[1, 0], [2, 0]],
    PALETTE.cyan,
    "tech",
    "Vidrio cian y la Academia: donde se entrenan las rutas del futuro.",
    [],
    ["academia"]
  ),
  district(
    "empleo",
    "Distrito Empleo",
    "Centro Financiero",
    [[1, 3], [2, 3]],
    mix(PALETTE.cyan, PALETTE.pink, 0.18),
    "financial",
    "Torres de oficinas para la cacería: postulaciones, radar y carrera.",
    ["career", "hunt"],
    ["empleo"]
  ),
  district(
    "vida",
    "Barrio Vida",
    "Zona residencial",
    [[0, 1]],
    PALETTE.orange,
    "residential",
    "Casas cálidas para hábitos, diario personal y sesiones de enfoque.",
    ["vida", "diary", "focus"],
    []
  ),
  district(
    "torre",
    "La Torre",
    "Capital",
    [[0, 2]],
    mix(PALETTE.orange, PALETTE.pink, 0.35),
    "tower",
    "El rascacielos que guarda tu capital: ahorro, inglés e IA.",
    ["capital"],
    []
  ),
  district(
    "mercado",
    "El Mercado",
    "Tesoro y tienda",
    [[3, 1]],
    mix(PALETTE.pink, PALETTE.orange, 0.18),
    "market",
    "Puestos de neón para monedas, tesoro, equipo y canjes reales.",
    [],
    ["tesoro"]
  ),
  district(
    "garaje",
    "El Garaje",
    "Zona Industrial",
    [[3, 2]],
    mix(PALETTE.orange, PALETTE.pink, 0.12),
    "industrial",
    "Talleres, grúas y kilómetros: el taller de vehículos de ODEA 1.",
    [],
    ["garaje"]
  ),
  district(
    "mirador",
    "Mirador de Sagas",
    "Sagas y jefes",
    [[0, 0]],
    mix(PALETTE.pink, PALETTE.orange, 0.55),
    "sagas",
    "Lo alto de la ciudad: capítulos de sagas y jefes semanales.",
    ["bosses"],
    ["sagas", "jefe"]
  ),
  district(
    "rincon",
    "Rincón Anomalía",
    "Esquina con glitch",
    [[3, 3]],
    mix(PALETTE.cyan, PALETTE.pink, 0.5),
    "glitch",
    "Una esquina rara: anomalía diaria y el archivo legacy, con carácter.",
    [],
    ["anomalia", "quiz"]
  )
];

export const DISTRICT_IDS = DISTRICTS.map((d) => d.id);

export const DISTRICT_BY_ID = Object.fromEntries(DISTRICTS.map((d) => [d.id, d]));

export function getDistrict(id) {
  return DISTRICT_BY_ID[id] || null;
}

/** componente de xpBreakdown → id de distrito (exactamente uno). */
export const XP_HOME = Object.fromEntries(
  DISTRICTS.flatMap((d) => d.xp.map((component) => [component, d.id]))
);

/** clave legacy (nombre en SIBLING_KEYS) → id de distrito (exactamente uno). */
export const KEY_HOME = Object.fromEntries(
  DISTRICTS.flatMap((d) => d.keys.map((key) => [key, d.id]))
);

/**
 * Manzanas sin distrito: edificios genéricos que completan el damero.
 * (3,0) noreste y (0,3) suroeste.
 */
export const FILLER_CELLS = [[3, 0], [0, 3]];

export const FILLER_RECTS = FILLER_CELLS.map(([c, r]) => cellRect(c, r));

export function districtAt(x, y) {
  for (const d of DISTRICTS) {
    const r = d.rect;
    if (x >= r.x && y >= r.y && x <= r.x + r.w && y <= r.y + r.h) return d;
  }
  return null;
}

export const DISTRICTS_BY_STYLE = DISTRICTS.reduce((acc, d) => {
  acc[d.id] = d.style;
  return acc;
}, {});

export { cellsRect };
