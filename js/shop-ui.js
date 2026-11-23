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
import { realesView } from "../src/reales-state.js";
import { outfitSprite, vehicleSprite } from "./city/pixel.js";
import { fmt } from "./format.js";

function node(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined && text !== null) el.textContent = String(text);
  return el;
}

/* Exportada como shopItemCard: el Inventario (js/inventory-ui.js)
   reutiliza EXACTAMENTE estas tarjetas para lo poseído, con los mismos
   botones Equipar / Equipado ✓ / Ir a pie vía shop.equip. */
export function itemCard(item, state, balance, actions) {
  const card = node("article", "shop-card");
  const preview = node("div", "shop-preview");
  const canvas = item.kind === "outfit" ? outfitSprite(item.pal, item.gorra, item.look) : vehicleSprite(item.spec);
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

export { itemCard as shopItemCard };

/* ------------------------- Recompensas Reales -------------------------
   v0.45.0: el puerto de ODEA 1 v5.93. Orden de la sección (§2.1 del
   diseño): franja «Por disfrutar», contador de disfrutadas, grilla del
   catálogo efectivo y el formulario «Creá la tuya». El CANJEAR no
   dispara la mutación: abre la confirmación con el saldo resultante
   (actions.redeem pide confirmación; actions.confirmRedeem canjea). */
function realesCard(item, balance, actions) {
  const card = node("article", "shop-card reales-card");
  if (item.custom) {
    const del = node("button", "reales-del", "✕");
    del.type = "button";
    del.setAttribute("aria-label", `Borrar recompensa ${item.n}`);
    del.addEventListener("click", () => actions.removeReales(item.id));
    card.append(del);
  }
  card.append(node("div", "reales-ico", item.ico || "🎁"));
  card.append(node("h4", "shop-name", item.n));
  card.append(node("p", "shop-tag", item.custom ? "TUYA · RECOMPENSA REAL" : "RECOMPENSA REAL"));
  if (balance >= item.price) {
    const btn = node("button", "shop-btn is-buy", `CANJEAR · ₡${fmt(item.price)}`);
    btn.type = "button";
    btn.addEventListener("click", () => actions.redeem(item));
    card.append(btn);
  } else {
    const btn = node("button", "shop-btn is-disabled", `Te faltan ₡${fmt(item.price - balance)}`);
    btn.type = "button";
    btn.disabled = true;
    card.append(btn);
  }
  return card;
}

function renderReales(root, { bundle, actions, confirmReward }) {
  const balance = Number(bundle?.core?.derived?.coins?.balance) || 0;
  const view = realesView(bundle);

  root.append(node("h4", "shop-section", "🎁 RECOMPENSAS REALES"));
  root.append(node(
    "p", "shop-note",
    "Premios de la vida real, pagados con tus ₡ ODEA. Canjeás acá y lo disfrutás afuera."
  ));

  if (view.pending.length) {
    const box = node("div", "reales-pending");
    box.append(node("p", "reales-pending-title", `🎉 Por disfrutar (${view.pending.length}):`));
    for (const entry of view.pending) {
      const row = node("div", "reales-pending-row");
      row.append(
        node("span", "reales-pending-ico", entry.ico || "🎁"),
        node("b", "reales-pending-name", entry.n),
        node("small", "reales-pending-date", entry.date || "")
      );
      const enjoy = node("button", "shop-btn reales-enjoy", "✓ YA LA DISFRUTÉ");
      enjoy.type = "button";
      enjoy.addEventListener("click", () => actions.enjoyReales(entry.key));
      row.append(enjoy);
      box.append(row);
    }
    root.append(box);
  }

  if (view.enjoyedCount) {
    root.append(node("p", "reales-done-count", `✅ Recompensas disfrutadas: ${view.enjoyedCount}`));
  }

  if (confirmReward) {
    const box = node("div", "reales-confirm");
    box.append(node(
      "p", "reales-confirm-text",
      `¿Canjear "${confirmReward.n}" por ₡${fmt(confirmReward.price)}? Te quedan ₡${fmt(balance - confirmReward.price)}.`
    ));
    const yes = node("button", "shop-btn is-buy", "Sí, canjear");
    yes.type = "button";
    yes.addEventListener("click", () => actions.confirmRedeem());
    const noBtn = node("button", "shop-btn is-ghost", "Cancelar");
    noBtn.type = "button";
    noBtn.addEventListener("click", () => actions.cancelRedeem());
    box.append(yes, noBtn);
    root.append(box);
  }

  const grid = node("div", "shop-grid");
  for (const item of view.catalog) grid.append(realesCard(item, balance, actions));
  root.append(grid);

  /* Formulario «Creá la tuya»: el mismo trío de ODEA 1 (nombre, emoji,
     precio), con los topes del diseño (nombre ≤ 48, precio 1–999). */
  const form = node("div", "reales-form");
  form.append(node("h5", "reales-form-title", "Creá la tuya"));
  const name = node("input", "reales-input");
  name.type = "text"; name.maxLength = 48;
  name.placeholder = "Nombre de tu recompensa";
  name.setAttribute("aria-label", "Nombre de tu recompensa");
  const ico = node("input", "reales-input is-ico");
  ico.type = "text"; ico.maxLength = 8;
  ico.placeholder = "🎁";
  ico.setAttribute("aria-label", "Emoji de tu recompensa");
  const price = node("input", "reales-input is-price");
  price.type = "number"; price.min = "1"; price.max = "999";
  price.placeholder = "₡";
  price.setAttribute("aria-label", "Precio en ₡ ODEA");
  const create = node("button", "shop-btn is-buy", "Crear recompensa");
  create.type = "button";
  create.addEventListener("click", () => {
    actions.createReales({ n: name.value, ico: ico.value, price: Number(price.value) });
  });
  const fields = node("div", "reales-form-fields");
  fields.append(ico, name, price);
  form.append(fields, create);
  root.append(form);
}

export function renderShop(root, { bundle, actions, standalone = false, confirmReward = null }) {
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

  /* v0.45.0 · El panel «Mi inventario · Atuendos» se eliminó (Adenda
     §12): lo tuyo vive en el Inventario, con sus 3 secciones. Acá
     queda UNA tarjeta de acceso bajo el saldo. */
  if (actions.onInventory) {
    const access = node("button", "shop-btn is-ghost inv-access", "🎒 INVENTARIO — Atuendos · Vehículos · Colección →");
    access.type = "button";
    access.addEventListener("click", () => actions.onInventory());
    root.append(access);
  }

  for (const [kind, title] of [["outfit", "Atuendos"], ["vehicle", "Vehículos"]]) {
    root.append(node("h4", "shop-section", title));
    const grid = node("div", "shop-grid");
    for (const item of SHOP_ITEMS.filter((i) => i.kind === kind)) {
      grid.append(itemCard(item, state, balance, actions));
    }
    root.append(grid);
  }

  /* v0.45.0 · Recompensas Reales: la sección cierra la Tienda, debajo
     de los vehículos (diseño §2.1). */
  renderReales(root, { bundle, actions, confirmReward });

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
