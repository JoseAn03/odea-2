/**
 * hud.js — modelo del HUD del jugador (datos puros, sin DOM).
 *
 * Prohibido duplicar lógica: llama a la MISMA derivación de la Fase 0
 * (src/derive.js) que usa el importador. La barra de nivel usa la única curva
 * oficial disponible en el catálogo: `odeLadder`. Si no hay umbral siguiente
 * (nivel máximo), no se calcula porcentaje.
 */

import { derive, deriveStreak, sourcesFromMigrated, odeLevelFor } from "../src/derive.js";

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
  return derive(sourcesFromMigrated(bundle2, catalog), catalog, referenceDateOf(bundle2));
}

/**
 * @param {object} bundle2  save `odea2_bundle_v1`
 * @param {object} catalog  data/xp-catalog.json
 */
export function buildHud(bundle2, catalog) {
  const derived = deriveBundle(bundle2, catalog);
  const identity = (bundle2.core && bundle2.core.identity) || {};
  const streak = deriveStreak(bundle2);
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
    streak: streak.streak,
    streakDate: streak.streakDate,
    fullDays: derived.meta.fullDays,
    xpBreakdown: derived.xpBreakdown
  };
}

/* ------------------------------- mochila ---------------------------------
 * Proyección de la Mochila desde el bundle. SOLO LECTURA: no calcula nada
 * nuevo, solo junta lo que existe de verdad y respeta que las tiendas de
 * ODEA 1 no se mezclan.
 */

const SLOT_LABEL = {
  mano: "Mano",
  escudo: "Escudo",
  cabeza: "Cabeza",
  torso: "Torso",
  pies: "Pies",
  hombros: "Hombros"
};

function slotName(slot) {
  return SLOT_LABEL[slot] || slot || "—";
}

/**
 * @param {object} bundle save activo (solo lectura)
 * @param {object} catalog catálogo de juego
 * @param {object} derived proyección canónica (`derive()`), para no recalcular
 */
export function buildInventory(bundle, catalog, derived) {
  const core = (bundle && bundle.core) || {};
  const shop = core.shop || {};
  const gear = core.gear || {};
  const tesoro = (bundle && bundle.worlds && bundle.worlds.tesoro && bundle.worlds.tesoro.data) || {};
  const garaje = (bundle && bundle.worlds && bundle.worlds.garaje && bundle.worlds.garaje.data) || {};

  const shopCatalog = (catalog && catalog.shop) || {};
  const cosmeticsCatalog = (catalog && catalog.cosmetics) || {};

  /* --- Equipo del núcleo ------------------------------------------------- */
  const owned = Array.isArray(shop.owned) ? shop.owned.map(String) : [];
  const equipped = shop.equipped && typeof shop.equipped === "object" ? shop.equipped : {};
  const equippedIds = new Set(Object.values(equipped).map(String));

  const equipment = owned.map((id) => {
    const item = shopCatalog[id] || null;
    return {
      id,
      nombre: item ? item.nombre : id,
      slot: item ? item.slot : null,
      slotLabel: item ? slotName(item.slot) : "—",
      power: item ? item.power : null,
      price: item ? item.price : null,
      equipado: equippedIds.has(id),
      /** Sin catálogo no se inventan propiedades. */
      conocido: Boolean(item)
    };
  });

  const equipmentEquipped = equipment.filter((item) => item.equipado);
  const equipmentStored = equipment.filter((item) => !item.equipado);

  /* --- Capa de recompensas (gear) ---------------------------------------- */
  const gearUnlocked = Array.isArray(gear.unlocked) ? gear.unlocked.map(String) : [];
  const gearEquipped = gear.equipped && typeof gear.equipped === "object" ? gear.equipped : {};
  const gearIdsEquipped = new Set(Object.values(gearEquipped).map(String));

  const rewards = gearUnlocked.map((id) => ({
    id,
    /* No hay catálogo de esta capa en la fuente: se muestra el id, no un nombre
       inventado. */
    nombre: null,
    equipado: gearIdsEquipped.has(id)
  }));

  /* --- Cosméticos del Tesoro (tienda aparte) ----------------------------- */
  const cosmeticOwned = Array.isArray(tesoro.propios) ? tesoro.propios.map(String) : [];
  const cosmetics = cosmeticOwned.map((id) => {
    const item = cosmeticsCatalog[id] || null;
    return {
      id,
      nombre: item ? item.nombre : id,
      precio: item ? item.price : null,
      desc: item ? item.desc : null,
      conocido: Boolean(item)
    };
  });

  /* --- Recursos ---------------------------------------------------------- */
  const coins = (derived && derived.coins) || {};
  const resources = [
    { id: "coins", label: "Monedas del núcleo", value: Number(coins.balance) || 0, hint: "Ganadas menos gastadas" },
    {
      id: "tesoro",
      label: "Monedas del Tesoro",
      value: Number(tesoro.monedas) || 0,
      hint: "Cuenta aparte: no se convierte con las del núcleo"
    },
    { id: "escudos", label: "Escudos", value: Number(tesoro.escudos) || 0, hint: "Recurso del Tesoro" },
    {
      id: "km-carro",
      label: "Kilómetros · carro",
      value: Number(garaje.km && garaje.km.carro) || 0,
      hint: null
    }
  ];

  return {
    equipment,
    equipmentEquipped,
    equipmentStored,
    rewards,
    cosmetics,
    resources,
    /** La mochila es de consulta: no hay compra ni equipamiento activos. */
    readOnly: true,
    slots: Object.keys(equipped).map((slot) => ({ slot, slotLabel: slotName(slot), id: String(equipped[slot]) }))
  };
}
