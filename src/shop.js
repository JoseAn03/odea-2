/**
 * shop.js — la Tienda de ODEA 2 (v0.23.0, diseño aprobado por José).
 *
 * Catálogo propio de la Tienda: atuendos pixel art para el avatar y
 * vehículos que se ven en la ciudad con el personaje montado. Es una capa
 * DISTINTA del equipo RPG heredado de ODEA 1 (`catalog.shop`, espadas y
 * hachas que viven en `core.shop.owned/equipped` y se muestran en la
 * Mochila): lo de la Tienda vive en `play.tienda` para no mezclar
 * capas. El estado vive en `play.tienda` (la capa mutable: `core` es el
 * snapshot migrado y no se toca, como manda validatePlayState) y su gasto
 * se SUMA al libro mayor de siempre en la derivación:
 * spent total = core.shop.spent (migrado) + play.tienda.spent (Tienda),
 * y `derive` resta ese total del saldo (balance = earned − spent).
 *
 * Precios calibrados contra la economía real (derive.js): +1 ₡ por misión
 * o ítem completado; las Diarias rinden ≈ ₡3/día y las campañas suman sus
 * monedas (postulación +2 ₡). Lo básico cuesta días; el Accent, semanas;
 * el súper deportivo es la meta larga del plan.
 *
 * Las mutaciones pasan por el pipeline de siempre
 * (storage.applyGameplayMutationLocked → gameplay.applyMutation): acá solo
 * vive la lógica pura sobre el borrador.
 */

const S = "#F2B183"; // tono de piel del avatar (el mismo de pixel.js)

/** Catálogo de la Tienda. `pal` = paleta del sprite (C gorra, H pelo,
 *  S piel, T torso, P pantalón, Z zapatos); `spec` = dibujo del vehículo. */
export const SHOP_ITEMS = [
  /* ------------------------------ atuendos ------------------------------ */
  {
    id: "clasico", kind: "outfit", name: "Clásico", price: 0,
    pal: { C: "#2255FF", H: "#2A1A2E", S, T: "#00B8CC", P: "#23233A", Z: "#FF2E93" },
    gorra: true, tag: "El de siempre"
  },
  {
    id: "gorra-rosa", kind: "outfit", name: "Gorra Rosa Neón", price: 8,
    pal: { C: "#FF2B9D", H: "#2A1A2E", S, T: "#00B8CC", P: "#23233A", Z: "#FF2E93" },
    gorra: true, tag: "Básico"
  },
  {
    id: "camiseta-dorada", kind: "outfit", name: "Camiseta Dorada", price: 15,
    pal: { C: "#2255FF", H: "#2A1A2E", S, T: "#FFD166", P: "#23233A", Z: "#101016" },
    gorra: true, tag: "Básico"
  },
  {
    id: "oficina", kind: "outfit", name: "Oficina", price: 30,
    pal: { C: "#2A1A2E", H: "#2A1A2E", S, T: "#F0F0F5", P: "#2A2A35", Z: "#101016" },
    gorra: false, tag: "Sin gorra · formal"
  },
  {
    id: "neon-gamer", kind: "outfit", name: "Neón Gamer", price: 50,
    pal: { C: "#101016", H: "#141018", S, T: "#FF2B9D", P: "#1D2233", Z: "#31EBDD" },
    gorra: true, tag: "Elaborado"
  },
  {
    id: "vice-city", kind: "outfit", name: "Vice City", price: 75,
    pal: { C: "#FFD166", H: "#2A1A2E", S, T: "#FF2E93", P: "#F0F0F5", Z: "#FFD166" },
    gorra: true, tag: "Premium"
  },
  /* ------------------------------ vehículos ----------------------------- */
  {
    id: "moto", kind: "vehicle", name: "Moto deportiva", price: 70,
    spec: { type: "moto" }, tag: "Con piloto (vos)"
  },
  {
    id: "accent", kind: "vehicle", name: "Hyundai Accent 2017 · Negro", price: 120,
    spec: { type: "car", w: 48, h: 24, color: "#17171F", techo: "#20202A", luz: "#26262F", sombra: "#0B0B10" },
    tag: "¡El tuyo! Sedán"
  },
  {
    id: "suv", kind: "vehicle", name: "SUV Familiar", price: 180,
    spec: { type: "car", w: 52, h: 28, color: "#20503C", techo: "#18382A", luz: "#2E7A58", sombra: "#122A1E", roofW: 20, roofH: 16, rails: true, wheel: 6 },
    tag: "Techo alto · rieles"
  },
  {
    id: "deportivo", kind: "vehicle", name: "Deportivo GT", price: 250,
    spec: { type: "car", w: 50, h: 22, color: "#7A1020", techo: "#4A0A14", luz: "#C8283C", sombra: "#38060E", stripe: "#FFD166", spoiler: "#38060E", roofW: 15, roofH: 10 },
    tag: "Franja · alerón"
  },
  {
    id: "superdeportivo", kind: "vehicle", name: "Súper Deportivo (tipo Lamborghini)", price: 380,
    spec: { type: "car", w: 52, h: 24, color: "#FF7A00", techo: "#B35400", luz: "#FFA63D", sombra: "#8A3E00", spoiler: "#1A1A22", roofW: 13, roofH: 10 },
    tag: "La meta larga"
  }
];

export const DEFAULT_OUTFIT_ID = "clasico";

const byId = new Map(SHOP_ITEMS.map((item) => [item.id, item]));

export function shopItem(id) {
  return byId.get(id) || null;
}

/**
 * Estado de la Tienda normalizado desde el bundle. Saves viejos (como el
 * real de José) no traen `tienda`: se lee con defaults sin tocar el save;
 * la primera compra escribe la estructura completa.
 */
export function tiendaState(bundle) {
  const coreShop = (bundle && bundle.core && bundle.core.shop) || {};
  const t = (bundle && bundle.play && bundle.play.tienda && typeof bundle.play.tienda === "object")
    ? bundle.play.tienda : {};
  const owned = Array.isArray(t.owned) ? t.owned.map(String).filter((id) => byId.has(id)) : [];
  const outfit = byId.has(t.outfit) && shopItem(t.outfit).kind === "outfit" ? t.outfit : DEFAULT_OUTFIT_ID;
  const vehicle = byId.has(t.vehicle) && shopItem(t.vehicle).kind === "vehicle" ? t.vehicle : null;
  return {
    /* El gasto total: lo migrado en ODEA 1 más lo gastado en esta Tienda. */
    spent: (Number(coreShop.spent) || 0) + (Number(t.spent) || 0),
    owned,
    outfit,
    vehicle
  };
}

/** ¿El jugador ya tiene este ítem? El atuendo clásico es de nacimiento. */
export function ownsItem(state, itemId) {
  if (itemId === DEFAULT_OUTFIT_ID) return true;
  return state.owned.includes(itemId);
}

/** Look actual para el render: ids de atuendo y vehículo equipados. */
export function equippedLook(bundle) {
  const state = tiendaState(bundle);
  return { outfitId: state.outfit, vehicleId: state.vehicle };
}

function ensureTienda(draft) {
  if (!draft.play || typeof draft.play !== "object") draft.play = {};
  if (!draft.play.tienda || typeof draft.play.tienda !== "object") {
    draft.play.tienda = { owned: [], outfit: DEFAULT_OUTFIT_ID, vehicle: null, spent: 0 };
  }
  if (!Array.isArray(draft.play.tienda.owned)) draft.play.tienda.owned = [];
  return draft.play.tienda;
}

/**
 * Mutaciones de la Tienda para gameplay.applyMutation.
 * Devuelve el mismo contrato que el resto: { changed, duplicate, reason, paths }.
 * El saldo se lee del snapshot derivado vigente del borrador (anterior a la
 * mutación); refreshDerived lo recalcula después con el gasto aplicado.
 */
export function applyShopMutation(draft, mutation) {
  const item = shopItem(mutation.itemId);
  const state = tiendaState(draft);

  if (mutation.type === "shop.buy") {
    if (!item) return { changed: false, duplicate: false, reason: "UNKNOWN_ITEM", paths: [] };
    if (ownsItem(state, item.id)) {
      return { changed: false, duplicate: true, reason: "DUPLICATE", paths: [] };
    }
    const balance = Number(draft.core && draft.core.derived && draft.core.derived.coins && draft.core.derived.coins.balance) || 0;
    if (balance < item.price) {
      return { changed: false, duplicate: false, reason: "INSUFFICIENT_FUNDS", paths: [] };
    }
    const tienda = ensureTienda(draft);
    tienda.spent = (Number(tienda.spent) || 0) + item.price;
    tienda.owned.push(item.id);
    /* Comprar equipa de una vez: el cambio se ve al salir a la ciudad. */
    if (item.kind === "outfit") tienda.outfit = item.id;
    else tienda.vehicle = item.id;
    return {
      changed: true, duplicate: false, reason: null,
      paths: ["play.tienda.spent", "play.tienda.owned", item.kind === "outfit" ? "play.tienda.outfit" : "play.tienda.vehicle"]
    };
  }

  if (mutation.type === "shop.equip") {
    /* Bajar del vehículo: itemId null equipa «a pie». */
    if (mutation.itemId === null || mutation.itemId === undefined) {
      if (state.vehicle === null) return { changed: false, duplicate: true, reason: "DUPLICATE", paths: [] };
      const tienda = ensureTienda(draft);
      tienda.vehicle = null;
      return { changed: true, duplicate: false, reason: null, paths: ["play.tienda.vehicle"] };
    }
    if (!item) return { changed: false, duplicate: false, reason: "UNKNOWN_ITEM", paths: [] };
    if (!ownsItem(state, item.id)) {
      return { changed: false, duplicate: false, reason: "NOT_OWNED", paths: [] };
    }
    const current = item.kind === "outfit" ? state.outfit : state.vehicle;
    if (current === item.id) {
      return { changed: false, duplicate: true, reason: "DUPLICATE", paths: [] };
    }
    const tienda = ensureTienda(draft);
    if (item.kind === "outfit") tienda.outfit = item.id;
    else tienda.vehicle = item.id;
    return {
      changed: true, duplicate: false, reason: null,
      paths: [item.kind === "outfit" ? "play.tienda.outfit" : "play.tienda.vehicle"]
    };
  }

  return { changed: false, duplicate: false, reason: "UNKNOWN_MUTATION", paths: [] };
}
