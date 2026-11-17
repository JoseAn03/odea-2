/**
 * shop-ui.js — la Tienda dentro del teléfono (v0.23.0).
 *
 * Catálogo aprobado por José: atuendos pixel art y vehículos que se ven en
 * la ciudad. Comprar equipa de una vez (la mutación vive en src/shop.js y
 * pasa por el pipeline de guardado de siempre). Las vistas previas se
 * dibujan con los mismos constructores que usa la ciudad (pixel.js), así
 * que lo que se ve acá es exactamente lo que se ve en la calle.
 */

import { SHOP_ITEMS, tiendaState, ownsItem } from "../src/shop.js";
import { outfitSprite, vehicleSprite } from "./city/pixel.js";
import { fmt } from "./format.js";

function node(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined && text !== null) el.textContent = String(text);
  return el;
}

function itemCard(item, state, balance, actions) {
  const card = node("article", "shop-card");
  const preview = node("div", "shop-preview");
  const canvas = item.kind === "outfit" ? outfitSprite(item.pal, item.gorra) : vehicleSprite(item.spec);
  if (canvas) {
    canvas.className = item.kind === "outfit" ? "shop-sprite-outfit" : "shop-sprite-vehicle";
    preview.append(canvas);
  }
  card.append(preview);
  card.append(node("h4", "shop-name", item.name));
  if (item.tag) card.append(node("p", "shop-tag", item.tag));

  const owned = ownsItem(state, item.id);
  const equipped = item.kind === "outfit" ? state.outfit === item.id : state.vehicle === item.id;
  if (equipped) {
    card.append(node("button", "shop-btn is-equipped", "Equipado ✓"));
    if (item.kind === "vehicle") {
      const off = node("button", "shop-btn is-ghost", "Ir a pie");
      off.type = "button";
      off.addEventListener("click", () => actions.equip(null));
      card.append(off);
    }
  } else if (owned) {
    const btn = node("button", "shop-btn", "Equipar");
    btn.type = "button";
    btn.addEventListener("click", () => actions.equip(item.id));
    card.append(btn);
  } else if (balance >= item.price) {
    const btn = node("button", "shop-btn is-buy", `Comprar · ₡${fmt(item.price)}`);
    btn.type = "button";
    btn.addEventListener("click", () => actions.buy(item.id));
    card.append(btn);
  } else {
    const btn = node("button", "shop-btn is-disabled", `Te faltan ₡${fmt(item.price - balance)}`);
    btn.type = "button";
    btn.disabled = true;
    card.append(btn);
  }
  return card;
}

/* Cabecera con la escena de la tienda, como los héroes de campaña: es el
   fondo que José pidió al entrar desde la manzana de la ciudad. */
function shopHero(actions) {
  const hero = node("header", "campaign-hero");
  const image = node("img", "campaign-hero-image");
  image.src = "assets/slots/tienda.webp";
  image.alt = "";
  image.setAttribute("aria-hidden", "true");
  image.dataset.imageSlot = "shop.tienda";
  image.decoding = "async";
  image.addEventListener("error", () => { image.hidden = true; }, { once: true });
  const top = node("div", "campaign-hero-top");
  const back = node("button", "campaign-back", "← Mapa");
  back.type = "button";
  back.setAttribute("aria-label", "Volver al mapa");
  back.addEventListener("click", () => actions.onBack());
  top.append(back, node("span", "campaign-code", "EL MERCADO / TIENDA"));
  const content = node("div", "campaign-hero-content");
  content.append(
    node("p", "campaign-eyebrow", "PRECIOS BAJOS · ₡ ODEA VIRTUALES"),
    node("h1", "campaign-title", "TIENDA"),
    node("p", "campaign-subtitle", "Bienvenido a los precios bajos: atuendos y vehículos que se ven en la calle.")
  );
  const bottom = node("div", "campaign-hero-bottom");
  bottom.append(
    node("span", "campaign-live-dot", "● COMPRAR EQUIPA DE UNA VEZ"),
    node("span", "campaign-hero-caption", "A TU RITMO.")
  );
  hero.append(image, top, content, bottom);
  return hero;
}

export function renderShop(root, { bundle, actions, standalone = false }) {
  const derived = (bundle && bundle.core && bundle.core.derived) || {};
  const balance = Number(derived.coins && derived.coins.balance) || 0;
  const state = tiendaState(bundle);

  root.replaceChildren();

  if (standalone) {
    root.append(shopHero(actions));
  } else {
    const head = node("div", "shop-head");
    const back = node("button", "shop-back", "← Volver");
    back.type = "button";
    back.addEventListener("click", () => actions.onBack());
    head.append(back);
    root.append(head);

    root.append(node("h3", "phone-screen-title", "Tienda"));
    root.append(node("p", "phone-screen-sub", "Bienvenido a los precios bajos · El Mercado, manzana este"));
  }
  root.append(node("p", "shop-balance", `Tu saldo: ₡${fmt(balance)} ODEA virtuales`));

  for (const [kind, title] of [["outfit", "Atuendos"], ["vehicle", "Vehículos"]]) {
    root.append(node("h4", "shop-section", title));
    const grid = node("div", "shop-grid");
    for (const item of SHOP_ITEMS.filter((i) => i.kind === kind)) {
      grid.append(itemCard(item, state, balance, actions));
    }
    root.append(grid);
  }

  root.append(node(
    "p", "shop-note",
    "Los ₡ ODEA son progreso virtual: no son dinero real. Lo que comprés se guarda en tu partida y se respalda con la sincronización."
  ));

  if (standalone && actions.onDistrict) {
    const district = node("button", "shop-btn is-ghost shop-district-btn", "Ver el panel del Mercado (tesoro y canjes)");
    district.type = "button";
    district.addEventListener("click", () => actions.onDistrict());
    root.append(district);
  }
}
