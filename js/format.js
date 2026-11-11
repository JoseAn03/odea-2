/** format.js — etiquetas y formato de números para la pantalla de estado. */

/** Los 10 componentes de xpBreakdown, en el orden de ODEA 1. */
export const XP_ORDER = [
  "career",
  "ach",
  "vida",
  "capital",
  "focus",
  "diary",
  "bosses",
  "hunt",
  "evento",
  "farm"
];

export const XP_LABELS = {
  career: "Carrera",
  ach: "Logros",
  vida: "Vida",
  capital: "Capital",
  focus: "Enfoque",
  diary: "Diario",
  bosses: "Jefes",
  hunt: "Cacería",
  evento: "Evento",
  farm: "Farmeo"
};

const numberFormat = new Intl.NumberFormat("es-ES", { useGrouping: "always" });

export function fmt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? numberFormat.format(n) : "—";
}

export function pct(part, total) {
  const t = Number(total);
  if (!t || !Number.isFinite(t)) return 0;
  return Math.max(0, Math.min(100, (Number(part) / t) * 100));
}
