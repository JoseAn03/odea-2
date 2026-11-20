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
const SS = "#D98E5F"; // sombra de piel

/* v0.40.0/v0.40.1: los atuendos traen `look`, la receta del sprite
   grande (18×28, caminar de 4 cuadros) que pinta js/city/pixel.js: cabeza,
   cara, torso, brazos, piernas, detalle (overlay) y la paleta completa
   con las claves de pierna 1/2/3 (zonas alta/media/baja), 4/5/6 (sus
   sombras para la pierna lejana en vista lateral) y z (sombra del
   zapato). `pal`/`gorra` quedan como respaldo del sprite clásico. */
const legsLong = (p, shade) => ({ "1": p, "2": p, "3": p, "4": shade, "5": shade, "6": shade });

/** Catálogo de la Tienda. `pal` = paleta del sprite (C gorra, H pelo,
 *  S piel, T torso, P pantalón, Z zapatos); `spec` = dibujo del vehículo. */
export const SHOP_ITEMS = [
  /* ------------------------------ atuendos ------------------------------ */
  {
    id: "clasico", kind: "outfit", name: "Clásico Vice", price: 0,
    pal: { C: "#2E7CD6", H: "#6B4A2B", S, T: "#FF9FB2", P: "#2E6BD8", Z: "#F4F7FA" },
    gorra: true, tag: "El nuevo de siempre",
    look: {
      head: "cap", emblem: "star", face: "normal", torso: "shirt", arms: "normal", legs: "long", overlay: "palms",
      pal: {
        C: "#2E7CD6", c: "#1B5FBF", H: "#6B4A2B", S, s: SS, T: "#FF9FB2", t: "#35C4D8",
        U: "#FFF3F6", P: "#2E6BD8", Z: "#F4F7FA", z: "#35C4D8", A: "#7FE7F2", K: "#1A1A22", W: "#FFFFFF", E: "#241A20",
        ...legsLong("#2E6BD8", "#2456AC")
      }
    }
  },
  {
    id: "gorra-rosa", kind: "outfit", name: "Gorra Rosa Neón", price: 8,
    pal: { C: "#FF2B9D", H: "#2A1A2E", S, T: "#00B8CC", P: "#23233A", Z: "#FF2E93" },
    gorra: true, tag: "Básico",
    look: {
      head: "cap", face: "normal", torso: "shirt", arms: "normal", legs: "long",
      pal: {
        C: "#FF2B9D", c: "#D10E78", H: "#2A1A2E", S, s: SS, T: "#00B8CC", t: "#00858A",
        U: "#E8FBFF", P: "#23233A", Z: "#FF2E93", z: "#D10E78", A: "#7FE7F2", K: "#1A1A22", W: "#FFFFFF", E: "#241A20",
        ...legsLong("#23233A", "#171724")
      }
    }
  },
  {
    id: "camiseta-dorada", kind: "outfit", name: "Camiseta Dorada", price: 15,
    pal: { C: "#2255FF", H: "#2A1A2E", S, T: "#FFD166", P: "#23233A", Z: "#101016" },
    gorra: true, tag: "Básico",
    look: {
      head: "cap", face: "normal", torso: "shirt", arms: "normal", legs: "long",
      pal: {
        C: "#2255FF", c: "#1B439C", H: "#2A1A2E", S, s: SS, T: "#FFD166", t: "#D9A62E",
        U: "#FFF6D5", P: "#23233A", Z: "#101016", z: "#000000", A: "#7FE7F2", K: "#1A1A22", W: "#FFFFFF", E: "#241A20",
        ...legsLong("#23233A", "#171724")
      }
    }
  },
  {
    id: "oficina", kind: "outfit", name: "Oficina", price: 30,
    pal: { C: "#2A1A2E", H: "#2A1A2E", S, T: "#F0F0F5", P: "#2A2A35", Z: "#101016" },
    gorra: false, tag: "Sin gorra · formal",
    look: {
      head: "hair", face: "normal", torso: "suit", tie: true, arms: "normal", legs: "long",
      pal: {
        C: "#2A1A2E", c: "#1A1A22", H: "#2A1A2E", S, s: SS, T: "#F0F0F5", t: "#C9C9D4",
        U: "#F0F0F5", P: "#2A2A35", Z: "#101016", z: "#000000", A: "#7FE7F2", K: "#8E1220", W: "#FFFFFF", E: "#241A20",
        ...legsLong("#2A2A35", "#1D1D26")
      }
    }
  },
  {
    id: "neon-gamer", kind: "outfit", name: "Neón Gamer", price: 50,
    pal: { C: "#101016", H: "#141018", S, T: "#FF2B9D", P: "#1D2233", Z: "#31EBDD" },
    gorra: true, tag: "Elaborado",
    look: {
      head: "cap", face: "normal", torso: "shirt", arms: "normal", legs: "long",
      pal: {
        C: "#101016", c: "#000000", H: "#141018", S, s: SS, T: "#FF2B9D", t: "#C40E72",
        U: "#FFE3F1", P: "#1D2233", Z: "#31EBDD", z: "#1FA89C", A: "#7FE7F2", K: "#1A1A22", W: "#FFFFFF", E: "#241A20",
        ...legsLong("#1D2233", "#12141F")
      }
    }
  },
  {
    id: "vice-city", kind: "outfit", name: "Vice City", price: 75,
    pal: { C: "#FFD166", H: "#2A1A2E", S, T: "#FF2E93", P: "#F0F0F5", Z: "#FFD166" },
    gorra: true, tag: "Premium",
    look: {
      head: "cap", face: "normal", torso: "shirt", arms: "normal", legs: "long", overlay: "palms",
      pal: {
        C: "#FFD166", c: "#D9A62E", H: "#2A1A2E", S, s: SS, T: "#FF2E93", t: "#F4F7FA",
        U: "#FFE3F1", P: "#F0F0F5", Z: "#FFD166", z: "#D9A62E", A: "#7FE7F2", K: "#1A1A22", W: "#FFFFFF", E: "#241A20",
        ...legsLong("#F0F0F5", "#C9C9D4")
      }
    }
  },
  /* --------- v0.40.0: la colección de personajes (precios altos) ---------
   * Escalera calibrada contra la economía real del juego: entre
   * campañas (1.687 ₡), diarias (168 ₡) se ganan 1.855 ₡ una sola vez,
   * más los ciclos del Garaje Vivo (115 ₡) y el Mundo de Ian (216 ₡).
   * El set completo cuesta 2.820 ₡ (más que todo lo ganable una vez:
   * exige campañas + ciclos por semanas) y la Armadura Carmesí sola
   * (₡600, ~32 % del total único) es la meta larga, por encima del
   * súper deportivo (₡380). */
  {
    id: "la-sele", kind: "outfit", name: "La Sele", price: 90,
    pal: { C: "#2A1A2E", H: "#2A1A2E", S, T: "#D7263D", P: "#F4F7FA", Z: "#14141C" },
    gorra: false, tag: "La Sele · Costa Rica",
    look: {
      head: "hair", face: "normal", torso: "jersey", arms: "normal", legs: "kit", overlay: "flag",
      pal: {
        C: "#2A1A2E", c: "#1A1A22", H: "#2A1A2E", S, s: SS, T: "#D7263D", t: "#F4F7FA",
        U: "#F4F7FA", P: "#F4F7FA", Z: "#14141C", z: "#000000", A: "#2456C8", K: "#1A1A22", W: "#FFFFFF", E: "#241A20",
        "1": "#F4F7FA", "2": S, "3": "#D7263D", "4": "#D8DEE6", "5": SS, "6": "#A31A2C"
      }
    }
  },
  {
    id: "cubico", kind: "outfit", name: "Cúbico", price: 120,
    pal: { C: "#3A2410", H: "#3A2410", S: "#C68658", T: "#00A8A8", P: "#3B4BD8", Z: "#6E6E7A" },
    gorra: false, tag: "Puro bloque",
    look: {
      head: "cube", face: "normal", torso: "shirt", arms: "normal", legs: "long",
      pal: {
        C: "#3A2410", c: "#2A1A0A", H: "#3A2410", S: "#C68658", s: "#9E6A42", T: "#00A8A8", t: "#00858A",
        U: "#D8FBFF", P: "#3B4BD8", Z: "#6E6E7A", z: "#54545F", A: "#7FE7F2", K: "#1A1A22", W: "#FFFFFF", E: "#46329E",
        ...legsLong("#3B4BD8", "#2E3AAC")
      }
    }
  },
  {
    id: "fontanero", kind: "outfit", name: "Fontanero Rojo", price: 150,
    pal: { C: "#D7263D", H: "#4A2A12", S, T: "#D7263D", P: "#2456C8", Z: "#6B3A1F" },
    gorra: true, tag: "Fontanero",
    look: {
      head: "cap", emblem: "circle", face: "mustache", torso: "overol", arms: "gloves", legs: "long",
      pal: {
        C: "#D7263D", c: "#A31A2C", H: "#4A2A12", S, s: SS, T: "#D7263D", t: "#A31A2C",
        U: "#FFE3E8", P: "#2456C8", Z: "#6B3A1F", z: "#54301A", A: "#FFD166", K: "#2A1A0E", W: "#FFFFFF", E: "#241A20",
        ...legsLong("#2456C8", "#1B439C")
      }
    }
  },
  {
    id: "pirata-paja", kind: "outfit", name: "Pirata de Paja", price: 180,
    pal: { C: "#E8C95A", H: "#14100C", S, T: "#D7263D", P: "#2456C8", Z: "#8A5A2B" },
    gorra: true, tag: "Pirata",
    look: {
      head: "straw", face: "scar", torso: "vest", arms: "bare", legs: "shorts",
      pal: {
        C: "#E8C95A", c: "#D7263D", H: "#14100C", S, s: SS, T: "#D7263D", t: "#A31A2C",
        U: "#FFE3E8", P: "#2456C8", Z: "#8A5A2B", z: "#6E4520", A: "#FFD166", K: "#7A4A21", W: "#FFFFFF", E: "#241A20",
        "1": "#2456C8", "2": S, "3": S, "4": "#1B439C", "5": SS, "6": SS
      }
    }
  },
  {
    id: "ejecutivo-vc", kind: "outfit", name: "Ejecutivo Vice City", price: 220,
    pal: { C: "#1D1410", H: "#1D1410", S, T: "#F4F1EA", P: "#E8E2D4", Z: "#2A2A35" },
    gorra: false, tag: "Premium · con lentes",
    look: {
      head: "hair", face: "sunglasses", torso: "suit", tie: false, watch: true, arms: "normal", legs: "long",
      pal: {
        C: "#1D1410", c: "#000000", H: "#1D1410", S, s: SS, T: "#F4F1EA", t: "#D8D2C4",
        U: "#FF9FB2", P: "#E8E2D4", Z: "#2A2A35", z: "#14141C", A: "#FFD166", K: "#14141C", W: "#FFFFFF", E: "#241A20",
        ...legsLong("#E8E2D4", "#CFC8B8")
      }
    }
  },
  {
    id: "guerrero-naranja", kind: "outfit", name: "Guerrero Naranja", price: 260,
    pal: { C: "#14100C", H: "#14100C", S, T: "#F27A1A", P: "#F27A1A", Z: "#2456C8" },
    gorra: false, tag: "Guerrero",
    look: {
      head: "spiky", face: "normal", torso: "gi", wrist: true, arms: "normal", legs: "long",
      pal: {
        C: "#14100C", c: "#000000", H: "#14100C", S, s: SS, T: "#F27A1A", t: "#D96200",
        U: "#2456C8", P: "#F27A1A", Z: "#2456C8", z: "#1B439C", A: "#FFD166", K: "#1B439C", W: "#FFFFFF", E: "#241A20",
        B: "#2456C8", ...legsLong("#F27A1A", "#C75F10")
      }
    }
  },
  {
    id: "gigante-verde", kind: "outfit", name: "Gigante Verde", price: 320,
    pal: { C: "#101408", H: "#101408", S: "#43B02A", T: "#43B02A", P: "#6A3FA0", Z: "#2E7D1F" },
    gorra: false, tag: "Gigante",
    look: {
      head: "hair", face: "angry", torso: "bare", arms: "muscle", legs: "torn",
      pal: {
        C: "#101408", c: "#000000", H: "#101408", S: "#43B02A", s: "#2E7D1F", T: "#43B02A", t: "#2E7D1F",
        U: "#43B02A", P: "#6A3FA0", Z: "#2E7D1F", z: "#256B18", A: "#FFD166", K: "#12240C", W: "#FFFFFF", E: "#12240C",
        "1": "#6A3FA0", "2": "#6A3FA0", "3": "#43B02A", "4": "#54327E", "5": "#54327E", "6": "#2E7D1F"
      }
    }
  },
  {
    id: "heroe-aracnido", kind: "outfit", name: "Héroe Arácnido", price: 400,
    pal: { C: "#D7263D", H: "#D7263D", S: "#D7263D", T: "#D7263D", P: "#2456C8", Z: "#D7263D" },
    gorra: true, tag: "Icónico",
    look: {
      head: "mask", face: "maskeyes", torso: "shirt", arms: "armor", legs: "long", overlay: "webs",
      pal: {
        C: "#D7263D", c: "#A31A2C", H: "#D7263D", S: "#D7263D", s: "#A31A2C", T: "#D7263D", t: "#8E1220",
        U: "#D7263D", P: "#2456C8", Z: "#D7263D", z: "#A31A2C", A: "#7FE7F2", K: "#14141C", W: "#FFFFFF", E: "#14141C",
        M: "#D7263D", ...legsLong("#2456C8", "#1B439C")
      }
    }
  },
  {
    id: "rey-caparazon", kind: "outfit", name: "Rey Caparazón", price: 480,
    pal: { C: "#D7263D", H: "#D7263D", S: "#F2A65A", T: "#F2E3B3", P: "#E07B2A", Z: "#E07B2A" },
    gorra: false, tag: "Icónico",
    look: {
      head: "horns", face: "normal", torso: "cream", arms: "bare", legs: "long",
      pal: {
        C: "#D7263D", c: "#A31A2C", H: "#D7263D", S: "#F2A65A", s: "#D98E3F", T: "#F2E3B3", t: "#FFF6E0",
        U: "#E07B2A", P: "#E07B2A", Z: "#E07B2A", z: "#B85E1C", A: "#FFD166", K: "#7A2E0E", W: "#FFF6E0", E: "#241A20",
        G: "#43B02A", ...legsLong("#E07B2A", "#B85E1C")
      }
    }
  },
  {
    id: "armadura-carmesi", kind: "outfit", name: "Armadura Carmesí", price: 600,
    pal: { C: "#C01824", H: "#C01824", S: "#F2B134", T: "#C01824", P: "#C01824", Z: "#F2B134" },
    gorra: true, tag: "Icónico · la meta",
    look: {
      head: "helmet", face: "normal", torso: "armor", arms: "armor", handKey: "t", legs: "long", overlay: "reactor",
      pal: {
        C: "#C01824", c: "#8E1220", H: "#C01824", S: "#F2B134", s: "#C78F22", T: "#C01824", t: "#F2B134",
        U: "#F2B134", P: "#C01824", Z: "#F2B134", z: "#C78F22", A: "#7FE7F2", K: "#5E0A10", W: "#BFF6FF", E: "#5E0A10",
        ...legsLong("#C01824", "#8E1220")
      }
    }
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
