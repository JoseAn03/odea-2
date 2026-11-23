/**
 * inventory-ui.js — el INVENTARIO de Costa Neón (v0.45.0, Adenda §12
 * de las Dinámicas de Enganche): un hub con 3 secciones con nombre —
 * ATUENDOS, VEHÍCULOS y COLECCIÓN — y cada sección con su propia
 * interfaz a pantalla entera.
 *
 * Es PRESENTACIÓN PURA: estado nuevo CERO. Todo se deriva en lectura
 * de `tiendaState(bundle)` + `SHOP_ITEMS`; equipar usa las mismas
 * mutaciones `shop.equip` de siempre (la lógica no se mueve, solo la
 * UI). Si este hub se retirara en un PR, el save queda byte a byte
 * idéntico.
 *
 * Dos casas, una sola implementación (el patrón `root + actions` de
 * renderShop): la app «Inventario» 🎒 del teléfono y el acceso desde
 * la Tienda del Mercado (standalone sobre careerDialog).
 *
 * La sección COLECCIÓN nace como vitrina en preparación y cada fase
 * de las Dinámicas enciende ahí su vitrina: la Fase 3 (v0.47.0)
 * encendió los ESCUDOS DE RACHA (estado derivado de `play.racha`, sin
 * botones: se ganan jugando y el consumo es automático) y la Fase 4
 * (v0.48.0) los CASSETTES NEÓN (la mini-rejilla de los 20 de
 * `play.paquetes`, con el botón del premio final al 20/20); la Fase 5
 * encenderá el set legendario. Ningún binario nuevo: los iconos son
 * los sprites de siempre (pixel.js) o pixel art dibujado por código
 * acá.
 */

import { SHOP_ITEMS, shopItem, tiendaState, ownsItem } from "../src/shop.js";
import { rachaView } from "../src/racha-state.js";
import { PAQUETE_PALETTES, paquetesView } from "../src/paquetes-state.js";
import { legendarioViews } from "../src/legendario-state.js";
import { outfitSprite, vehicleSprite, relicCanvas } from "./city/pixel.js";
import { shopItemCard } from "./shop-ui.js";
import { fmt } from "./format.js";

function node(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined && text !== null) el.textContent = String(text);
  return el;
}

function backRow(label, onClick) {
  const head = node("div", "shop-head");
  const back = node("button", "shop-back", label);
  back.type = "button";
  back.addEventListener("click", onClick);
  head.append(back);
  return head;
}

/* Cassette Neón en pixel art por código (26×18): cuerpo rosado, ventana
   dorada y dos carretes cian — el icono de la sección Colección y la
   silueta de su vitrina. `silhouette` lo pinta todo en azul oscuro.
   Desde v0.48.0 acepta la paleta del spot (PAQUETE_PALETTES): cada
   cassette encontrado se exhibe en SU color, como se ve en la ciudad. */
function cassetteCanvas(silhouette = false, pal = null) {
  const c = document.createElement("canvas");
  c.width = 26; c.height = 18;
  const g = c.getContext("2d");
  const body = silhouette ? "#232842" : (pal ? pal.body : "#FF2E93");
  const dark = silhouette ? "#171B30" : (pal ? pal.dark : "#8E1220");
  const win = silhouette ? "#171B30" : "#FFD166";
  const reel = silhouette ? "#232842" : (pal ? pal.light : "#31EBDD");
  g.fillStyle = dark; g.fillRect(0, 0, 26, 18);
  g.fillStyle = body; g.fillRect(1, 1, 24, 16);
  g.fillStyle = win; g.fillRect(4, 3, 18, 7);
  g.fillStyle = dark; g.fillRect(5, 4, 16, 5);
  g.fillStyle = reel; g.fillRect(7, 5, 3, 3); g.fillRect(16, 5, 3, 3);
  g.fillStyle = dark; g.fillRect(8, 6, 1, 1); g.fillRect(17, 6, 1, 1);
  g.fillStyle = body; g.fillRect(6, 12, 14, 3);
  g.fillStyle = dark; g.fillRect(7, 13, 3, 1); g.fillRect(16, 13, 3, 1);
  return c;
}

/* Escudo pixel por código (14×16), para la vitrina de Colección. */
function shieldCanvas(silhouette = false) {
  const c = document.createElement("canvas");
  c.width = 14; c.height = 16;
  const g = c.getContext("2d");
  const edge = silhouette ? "#232842" : "#31EBDD";
  const fill = silhouette ? "#171B30" : "#123A4A";
  const core = silhouette ? "#232842" : "#FFD166";
  g.fillStyle = edge;
  g.fillRect(2, 0, 10, 2); g.fillRect(1, 2, 12, 8); g.fillRect(3, 10, 8, 3); g.fillRect(5, 13, 4, 3);
  g.fillStyle = fill;
  g.fillRect(3, 2, 8, 7); g.fillRect(4, 9, 6, 3); g.fillRect(6, 12, 2, 2);
  g.fillStyle = core; g.fillRect(6, 4, 2, 5); g.fillRect(4, 6, 6, 2);
  return c;
}

/* Trofeo pixel por código (16×16), la silueta del set legendario. */
function trophyCanvas(silhouette = false) {
  const c = document.createElement("canvas");
  c.width = 16; c.height = 16;
  const g = c.getContext("2d");
  const gold = silhouette ? "#232842" : "#FFC53D";
  const dark = silhouette ? "#171B30" : "#B8860B";
  g.fillStyle = gold;
  g.fillRect(4, 1, 8, 6); g.fillRect(1, 2, 3, 4); g.fillRect(12, 2, 3, 4);
  g.fillRect(7, 7, 2, 3); g.fillRect(5, 10, 6, 2); g.fillRect(4, 12, 8, 2);
  g.fillStyle = dark; g.fillRect(5, 2, 6, 2); g.fillRect(2, 3, 1, 2); g.fillRect(13, 3, 1, 2);
  return c;
}

function sectionCard({ icon, title, count, status, onOpen }) {
  const card = node("button", "inv-card");
  card.type = "button";
  const preview = node("span", "inv-card-icon");
  if (icon) { icon.className = "inv-card-sprite"; preview.append(icon); }
  const body = node("span", "inv-card-body");
  body.append(
    node("span", "inv-card-title", title),
    node("span", "inv-card-count", count),
    node("span", "inv-card-status", status)
  );
  card.append(preview, body, node("span", "inv-card-arrow", "›"));
  card.addEventListener("click", onOpen);
  return card;
}

function renderHub(root, { bundle, actions, standalone, backLabel }) {
  const derived = (bundle && bundle.core && bundle.core.derived) || {};
  const balance = Number(derived.coins && derived.coins.balance) || 0;
  const state = tiendaState(bundle);
  /* Lo legendario (grantOnly) no cuenta en los totales comprables:
     vive en su vitrina de la Colección, no en estas dos secciones. */
  const outfits = SHOP_ITEMS.filter((i) => i.kind === "outfit" && !i.grantOnly);
  const vehicles = SHOP_ITEMS.filter((i) => i.kind === "vehicle" && !i.grantOnly);
  const ownedOutfits = outfits.filter((i) => ownsItem(state, i.id));
  const ownedVehicles = vehicles.filter((i) => ownsItem(state, i.id));
  const outfitItem = shopItem(state.outfit);
  const vehicleItem = state.vehicle ? shopItem(state.vehicle) : null;

  root.append(backRow(backLabel || (standalone ? "← Mapa" : "← Volver"), () => actions.onBack()));
  root.append(node("h3", "phone-screen-title", "Inventario"));
  root.append(node("p", "phone-screen-sub", "Todo lo tuyo, en tres secciones"));
  root.append(node("p", "shop-balance", `Tu saldo: ₡${fmt(balance)} ODEA virtuales`));

  const outfitIcon = outfitItem ? outfitSprite(outfitItem.pal, outfitItem.gorra, outfitItem.look) : null;
  root.append(sectionCard({
    icon: outfitIcon,
    title: "ATUENDOS",
    count: `${ownedOutfits.length} de ${outfits.length} tuyos`,
    status: `Puesto: ${outfitItem ? outfitItem.name : "Clásico Vice"}`,
    onOpen: () => actions.onSection("atuendos")
  }));

  const vehicleIcon = vehicleSprite(vehicleItem ? vehicleItem.spec : shopItem("accent").spec);
  root.append(sectionCard({
    icon: vehicleIcon,
    title: "VEHÍCULOS",
    count: `${ownedVehicles.length} de ${vehicles.length} tuyos`,
    status: vehicleItem ? `Andás en: ${vehicleItem.name}` : "A pie",
    onOpen: () => actions.onSection("vehiculos")
  }));

  const shields = rachaView(bundle);
  const tapes = paquetesView(bundle);
  const legendary = legendarioViews(bundle)[0] || null;
  root.append(sectionCard({
    icon: cassetteCanvas(false),
    title: "COLECCIÓN",
    count: "La vitrina de las dinámicas",
    status: `Cassettes ${tapes.foundCount}/${tapes.total} · Escudos ×${shields.available} · Set legendario ${legendary && legendary.claimed ? "ganado 🏆" : "por ganar"}`,
    onOpen: () => actions.onSection("coleccion")
  }));
}

function renderOutfits(root, { bundle, actions }) {
  const derived = (bundle && bundle.core && bundle.core.derived) || {};
  const balance = Number(derived.coins && derived.coins.balance) || 0;
  const state = tiendaState(bundle);
  const outfitItem = shopItem(state.outfit);
  const owned = SHOP_ITEMS.filter((i) => i.kind === "outfit" && !i.grantOnly && ownsItem(state, i.id));

  root.append(backRow("← Volver", () => actions.onSection("hub")));
  root.append(node("h3", "phone-screen-title", "Atuendos"));

  const hero = node("div", "inv-hero");
  const frame = node("div", "inv-hero-frame");
  if (outfitItem) {
    const sprite = outfitSprite(outfitItem.pal, outfitItem.gorra, outfitItem.look);
    if (sprite) { sprite.className = "inv-hero-sprite"; frame.append(sprite); }
  }
  hero.append(frame, node("p", "inv-hero-name", `Puesto ahora: ${outfitItem ? outfitItem.name : "Clásico Vice"}`));
  root.append(hero);

  root.append(node(
    "p", "shop-note",
    "Esto ya es tuyo: cambialo cuando quieras, no se vuelve a pagar."
  ));

  const grid = node("div", "shop-grid");
  for (const item of owned) grid.append(shopItemCard(item, state, balance, actions));
  root.append(grid);

  const toShop = node("button", "shop-btn is-ghost shop-district-btn", "¿Te falta alguno? Ver en la Tienda →");
  toShop.type = "button";
  toShop.addEventListener("click", () => actions.onShop());
  root.append(toShop);
}

function renderVehicles(root, { bundle, actions }) {
  const derived = (bundle && bundle.core && bundle.core.derived) || {};
  const balance = Number(derived.coins && derived.coins.balance) || 0;
  const state = tiendaState(bundle);
  const vehicleItem = state.vehicle ? shopItem(state.vehicle) : null;
  const owned = SHOP_ITEMS.filter((i) => i.kind === "vehicle" && !i.grantOnly && ownsItem(state, i.id));

  root.append(backRow("← Volver", () => actions.onSection("hub")));
  root.append(node("h3", "phone-screen-title", "Vehículos"));

  const hero = node("div", "inv-hero");
  if (vehicleItem) {
    const frame = node("div", "inv-hero-frame is-vehicle");
    const sprite = vehicleSprite(vehicleItem.spec);
    if (sprite) { sprite.className = "inv-hero-vehicle"; frame.append(sprite); }
    hero.append(frame, node("p", "inv-hero-name", `Andás en: ${vehicleItem.name}`));
  } else {
    hero.append(node("p", "inv-hero-name", "A pie — como siempre, a tu ritmo."));
  }
  root.append(hero);

  root.append(node(
    "p", "shop-note",
    "Esto ya es tuyo: cambialo cuando quieras, no se vuelve a pagar."
  ));

  if (owned.length) {
    const grid = node("div", "shop-grid");
    for (const item of owned) grid.append(shopItemCard(item, state, balance, actions));
    root.append(grid);
  } else {
    root.append(node("p", "shop-note", "Todavía no tenés vehículos. El primero te espera en la Tienda del Mercado."));
  }

  const toShop = node("button", "shop-btn is-ghost shop-district-btn", "¿Te falta alguno? Ver en la Tienda →");
  toShop.type = "button";
  toShop.addEventListener("click", () => actions.onShop());
  root.append(toShop);
}

/* Una pieza de la Vitrina Legendaria: a color si es tuya (atuendo y
   vehículo con su sprite real y «Equipar» directo vía shop.equip;
   reliquias con su pixel art, solo exhibidas) y en silueta oscura
   con «Se gana, no se compra» si todavía no la ganaste. */
function legendaryPieceCard(piece, state, balance, actions) {
  const { item, owned } = piece;
  if (owned) {
    if (item.kind === "reliquia") {
      const card = node("article", "shop-card inv-legend-piece is-owned");
      const preview = node("div", "shop-preview");
      const canvas = relicCanvas(item);
      if (canvas) { canvas.className = "shop-sprite-relic"; preview.append(canvas); }
      card.append(preview, node("h4", "shop-name", item.name), node("p", "shop-tag", "RELIQUIA · SOLO SE EXHIBE"));
      return card;
    }
    return shopItemCard(item, state, balance, actions);
  }
  const card = node("article", "shop-card inv-legend-piece is-silhouette");
  const preview = node("div", "shop-preview");
  const canvas = item.kind === "outfit" ? outfitSprite(item.pal, item.gorra, item.look)
    : item.kind === "reliquia" ? relicCanvas(item, true)
    : vehicleSprite(item.spec);
  if (canvas) {
    canvas.className = item.kind === "outfit" ? "shop-sprite-outfit" : item.kind === "reliquia" ? "shop-sprite-relic" : "shop-sprite-vehicle";
    canvas.style.filter = "brightness(0.22) saturate(0.4)";
    preview.append(canvas);
  }
  card.append(preview, node("h4", "shop-name", item.name), node("p", "shop-tag", "SE GANA, NO SE COMPRA"));
  return card;
}

function renderCollection(root, { bundle, actions }) {
  const shields = rachaView(bundle);
  const tapes = paquetesView(bundle);
  const legendary = legendarioViews(bundle)[0] || null;
  const derived = (bundle && bundle.core && bundle.core.derived) || {};
  const balance = Number(derived.coins && derived.coins.balance) || 0;
  const state = tiendaState(bundle);
  root.append(backRow("← Volver", () => actions.onSection("hub")));
  root.append(node("h3", "phone-screen-title", "Colección"));
  root.append(node("p", "phone-screen-sub", "La vitrina de las dinámicas nuevas"));

  const vitrina = node("div", "inv-vitrina");
  for (const [canvas, label, live] of [
    [cassetteCanvas(tapes.foundCount <= 0), "CASSETTES NEÓN", tapes.foundCount > 0],
    [shieldCanvas(shields.available <= 0), "ESCUDOS DE RACHA", shields.available > 0],
    [trophyCanvas(!(legendary && legendary.claimed)), "SET LEGENDARIO", Boolean(legendary && legendary.claimed)]
  ]) {
    const slot = node("div", `inv-vitrina-slot${live ? " is-live" : ""}`);
    canvas.className = "inv-vitrina-sprite";
    slot.append(canvas, node("span", "inv-vitrina-label", label));
    vitrina.append(slot);
  }
  root.append(vitrina);

  /* Vitrina de CASSETTES encendida (Fase 4, §5 + §12.2③): la
     mini-rejilla de los 20 — encontrados a todo color con su zona,
     faltantes en silueta azul oscuro con la pista de su zona — el
     contador N/20 y el botón del premio final, activo solo al 20/20
     (reclamo manual = ceremonia, mutación `paquete.prize`). */
  const tapesBox = node("section", "inv-tapes");
  const tapesHead = node("div", "inv-tapes-head");
  const tapesTitles = node("div", "inv-escudos-titles");
  tapesTitles.append(
    node("h4", "inv-escudos-title", "CASSETTES NEÓN"),
    node("p", "inv-tapes-count", `📼 ${tapes.foundCount}/${tapes.total}`)
  );
  tapesHead.append(tapesTitles);
  tapesBox.append(tapesHead);
  tapesBox.append(node(
    "p", "inv-escudos-text",
    "Veinte cassettes neón escondidos por toda Costa Neón. Se recogen caminando: pasales por encima y son tuyos. Cada uno paga +15 XP y +₡1."
  ));
  const tapesGrid = node("div", "inv-tapes-grid");
  for (const spot of tapes.spots) {
    const cell = node("div", `inv-tape${spot.found ? " is-found" : ""}`);
    const sprite = cassetteCanvas(!spot.found, PAQUETE_PALETTES[spot.pal]);
    sprite.className = "inv-tape-sprite";
    cell.append(sprite, node("span", "inv-tape-zone", spot.zona));
    tapesGrid.append(cell);
  }
  tapesBox.append(tapesGrid);
  if (tapes.prizeClaimed) {
    tapesBox.append(node(
      "p", "inv-tapes-prize-done",
      "🏆 ¡Colección Neón completa! Ya reclamaste el premio final: +100 XP, +₡25."
    ));
  } else if (tapes.canClaimPrize) {
    const claim = node("button", "inv-tapes-claim", "🏆 RECLAMAR PREMIO FINAL · +100 XP, +₡25");
    claim.type = "button";
    claim.addEventListener("click", () => { if (actions.onClaimPaquetePrize) actions.onClaimPaquetePrize(); });
    tapesBox.append(claim);
  } else {
    tapesBox.append(node(
      "p", "shop-note",
      tapes.foundCount === 0
        ? "Todavía no tenés ninguno: el primero te espera en el Parque del Hub, a la vuelta de donde aparecés."
        : `Te faltan ${tapes.total - tapes.foundCount} cassettes para el premio final de +100 XP y +₡25. Las siluetas te dicen la zona.`
    ));
  }
  root.append(tapesBox);

  /* Vitrina LEGENDARIA encendida (Fase 5, §6 + §12.2③): las 5 piezas
     EXO//AUTÓMATA del evento Operación Confirmación. Ganadas: a
     color, con Equipar directo en atuendo/vehículo y las reliquias
     solo exhibidas. Sin ganar: siluetas con «Se gana, no se
     compra». El reclamo NO vive acá: se hace en la vitrina del
     panel de la campaña al completarla (§6.2). */
  if (legendary) {
    const box = node("section", "inv-legend");
    const head = node("div", "inv-escudos-head");
    const trophy = trophyCanvas(!legendary.claimed);
    trophy.className = "inv-escudos-sprite";
    const titles = node("div", "inv-escudos-titles");
    titles.append(
      node("h4", "inv-escudos-title", "VITRINA LEGENDARIA"),
      node("p", "inv-tapes-count", `🏆 SET ${legendary.name}`)
    );
    head.append(trophy, titles);
    box.append(head);
    box.append(node(
      "p", "inv-escudos-text",
      legendary.claimed
        ? "¡Set ganado! Completaste Operación Confirmación y el set es tuyo para siempre. El atuendo y el vehículo se equipan desde acá; las reliquias solo se exhiben, como buen trofeo."
        : "Completaste… todavía no. Este set es el premio de Operación Confirmación: se gana completando las 14 misiones del evento y reclamándolo en su panel. No está en la Tienda y ningún ₡ lo compra."
    ));
    const grid = node("div", "shop-grid");
    for (const piece of legendary.pieces) grid.append(legendaryPieceCard(piece, state, balance, actions));
    box.append(grid);
    if (!legendary.claimed) {
      box.append(node("p", "shop-note", "Se gana, no se compra."));
    }
    root.append(box);
  }

  /* Vitrina de ESCUDOS encendida (Fase 3, §12.2③): exhibición y
     estado, SIN botones a propósito — se ganan jugando (Contrato
     Semanal y rachas de 14/30 días) y el consumo es automático. */
  const escudos = node("section", "inv-escudos");
  const escHead = node("div", "inv-escudos-head");
  const escSprite = shieldCanvas(shields.available <= 0);
  escSprite.className = "inv-escudos-sprite";
  const escTitles = node("div", "inv-escudos-titles");
  escTitles.append(
    node("h4", "inv-escudos-title", "ESCUDOS DE RACHA"),
    node("p", "inv-escudos-count", `🛡️ ×${shields.available} (${shields.available}/${shields.cap})`)
  );
  escHead.append(escSprite, escTitles);
  escudos.append(escHead);
  escudos.append(node(
    "p", "inv-escudos-text",
    "Se ganan con el Contrato Semanal y con rachas de 14/30 días; protegen un día fallado, solos."
  ));
  if (shields.available <= 0) {
    escudos.append(node(
      "p", "shop-note",
      "Todavía no tenés escudos: cerrá el Contrato Semanal o llegá a una racha de 14 días para ganar el primero."
    ));
  } else if (shields.full) {
    escudos.append(node(
      "p", "shop-note",
      "Inventario lleno: el próximo escudo se gana cuando uno proteja un día fallado."
    ));
  }
  if (shields.covered > 0) {
    escudos.append(node(
      "p", "shop-note",
      shields.covered === 1
        ? "Ya hay 1 día salvado por un escudo: tu racha siguió como si nada."
        : `Ya hay ${shields.covered} días salvados por escudos: tu racha siguió como si nada.`
    ));
  }
  root.append(escudos);

  root.append(node(
    "p", "shop-note",
    "Se gana, no se compra: cada vitrina de esta Colección se enciende jugando."
  ));
}

/**
 * Renderiza el Inventario. `section`: "hub" | "atuendos" | "vehiculos"
 * | "coleccion". actions: { equip, onBack, onSection, onShop,
 * onClaimPaquetePrize }.
 */
export function renderInventory(root, { bundle, actions, section = "hub", standalone = false, backLabel = null }) {
  root.replaceChildren();
  if (section === "atuendos") renderOutfits(root, { bundle, actions });
  else if (section === "vehiculos") renderVehicles(root, { bundle, actions });
  else if (section === "coleccion") renderCollection(root, { bundle, actions });
  else renderHub(root, { bundle, actions, standalone, backLabel });
}
