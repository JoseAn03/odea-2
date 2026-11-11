/**
 * hud.js — modelo del HUD del jugador (datos puros, sin DOM).
 *
 * Prohibido duplicar lógica: llama a la MISMA derivación de la Fase 0
 * (src/derive.js) que usa el importador. La barra de nivel usa la única curva
 * oficial disponible en el catálogo: `odeLadder`. Si no hay umbral siguiente
 * (nivel máximo), no se calcula porcentaje.
 */

import { derive, sourcesFromMigrated, odeLevelFor } from "../src/derive.js";

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

export function referenceDateOf(bundle2) {
  return (
    (bundle2.migration && bundle2.migration.referenceDate) ||
    (bundle2.core && bundle2.core.identity && bundle2.core.identity.lastDailyDate) ||
    "1970-01-01"
  );
}

export function deriveBundle(bundle2, catalog) {
  return derive(sourcesFromMigrated(bundle2), catalog, referenceDateOf(bundle2));
}

/**
 * @param {object} bundle2  save `odea2_bundle_v1`
 * @param {object} catalog  data/xp-catalog.json
 */
export function buildHud(bundle2, catalog) {
  const derived = deriveBundle(bundle2, catalog);
  const identity = (bundle2.core && bundle2.core.identity) || {};
  const ladder = Array.isArray(catalog.odeLadder) ? catalog.odeLadder : [];
  const odeLevel = odeLevelFor(derived.totalXP, catalog);

  const previousXp = ladder.length ? Number(ladder[Math.max(0, odeLevel - 1)].xp) || 0 : 0;
  const nextEntry = odeLevel < ladder.length ? ladder[odeLevel] : null;
  const nextXp = nextEntry ? Number(nextEntry.xp) : null;
  const span = nextXp === null ? 0 : Math.max(1, nextXp - previousXp);
  const ratio = nextXp === null ? null : clamp01((derived.totalXP - previousXp) / span);

  return {
    playerName: identity.playerName || "Jugador",
    startDate: identity.startDate || null,
    lastDailyDate: identity.lastDailyDate || null,
    referenceDate: referenceDateOf(bundle2),
    level: derived.campaignLevel,
    odeLevel,
    totalXP: derived.totalXP,
    xp: {
      current: derived.totalXP,
      previous: previousXp,
      next: nextXp,
      span,
      ratio,
      atMax: nextXp === null
    },
    coins: { earned: derived.coins.earned, spent: derived.coins.spent, balance: derived.coins.balance },
    streak: Number(identity.streak) || 0,
    fullDays: derived.meta.fullDays,
    xpBreakdown: derived.xpBreakdown
  };
}
