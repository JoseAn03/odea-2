/**
 * atuendos.test.js — v0.40.0: la colección de personajes de la Tienda,
 * el inventario (equipar lo poseído sin volver a pagar) y la geometría
 * del sprite grande 20×26 con caminar de 4 cuadros (charRows es puro).
 */
import test from "node:test";
import assert from "node:assert/strict";

import { SHOP_ITEMS, shopItem, applyShopMutation, tiendaState } from "../src/shop.js";
import { charRows, CHAR_W, CHAR_H } from "../js/city/pixel.js";

const NUEVOS = [
  ["la-sele", 90], ["cubico", 120], ["fontanero", 150], ["pirata-paja", 180],
  ["ejecutivo-vc", 220], ["guerrero-naranja", 260], ["gigante-verde", 320],
  ["heroe-aracnido", 400], ["rey-caparazon", 480], ["armadura-carmesi", 600]
];

test("atuendos: la colección nueva existe con su escalera de precios altos", () => {
  for (const [id, price] of NUEVOS) {
    const item = shopItem(id);
    assert.ok(item, `falta el atuendo ${id}`);
    assert.equal(item.kind, "outfit");
    assert.equal(item.price, price, `precio de ${id}`);
    assert.ok(item.look, `${id} debe traer receta look`);
  }
  const total = NUEVOS.reduce((a, [, p]) => a + p, 0);
  assert.equal(total, 2820, "el set completo cuesta ₡2.820 (más que lo ganable una sola vez: 1.855)");
  const outfits = SHOP_ITEMS.filter((i) => i.kind === "outfit").sort((a, b) => b.price - a.price);
  assert.deepEqual(
    outfits.slice(0, 3).map((i) => i.id),
    ["armadura-carmesi", "rey-caparazon", "heroe-aracnido"],
    "los tres atuendos más caros son los icónicos"
  );
});

test("atuendos: todo el catálogo de atuendos trae look completo y paleta cerrada", () => {
  for (const item of SHOP_ITEMS.filter((i) => i.kind === "outfit")) {
    assert.ok(item.look, `${item.id} sin look`);
    for (const dir of ["front", "back", "side"]) {
      for (let frame = 0; frame < 4; frame++) {
        const rows = charRows(dir, frame, item.look);
        assert.equal(rows.length, CHAR_H, `${item.id}/${dir}/${frame}: alto`);
        for (const row of rows) {
          assert.equal(row.length, CHAR_W, `${item.id}/${dir}/${frame}: ancho en «${row}»`);
          for (const ch of row) {
            assert.ok(ch === "." || item.look.pal[ch], `${item.id}/${dir}/${frame}: clave «${ch}» sin color`);
          }
        }
      }
    }
  }
});

test("atuendos: el ciclo de caminar cambia las piernas entre cuadros", () => {
  const look = shopItem("clasico").look;
  const legs = (dir, f) => charRows(dir, f, look).slice(18).join("\n");
  for (const dir of ["front", "back", "side"]) {
    assert.notEqual(legs(dir, 0), legs(dir, 1), `${dir}: zancada ≠ apoyo`);
    assert.notEqual(legs(dir, 0), legs(dir, 2), `${dir}: zancadas opuestas`);
    assert.notEqual(legs(dir, 1), legs(dir, 3), `${dir}: apoyos distintos`);
    assert.notEqual(legs(dir, 2), legs(dir, 3), `${dir}: zancada ≠ salida`);
  }
  /* El clásico se reconoce: gorra azul arriba y torso hawaiano. */
  const front = charRows("front", 1, look);
  assert.ok(front[1].includes("C"), "la gorra va en la cabeza");
  assert.ok(front[12].includes("T"), "el torso va en su zona");
});

test("atuendos: rasgos firma de los icónicos en la rejilla", () => {
  const front = (id) => charRows("front", 1, shopItem(id).look).join("\n");
  const back = (id) => charRows("back", 1, shopItem(id).look).join("\n");
  assert.ok(front("heroe-aracnido").includes("M"), "la máscara arácnida cubre la cabeza");
  assert.ok(front("armadura-carmesi").includes("A"), "la armadura trae su placa/reactor dorado");
  assert.ok(back("rey-caparazon").includes("G"), "el caparazón verde se ve por detrás");
  assert.ok(front("gigante-verde").includes("S"), "el gigante es piel verde al frente");
  assert.ok(front("cubico").includes("W"), "el cúbico trae sus ojos de bloque");
});

test("inventario: comprar, cambiar de atuendo y volver sin pagar de nuevo", () => {
  const draft = { core: { derived: { coins: { balance: 2000 } } }, play: {} };
  let r = applyShopMutation(draft, { type: "shop.buy", itemId: "la-sele" });
  assert.equal(r.changed, true);
  assert.equal(draft.play.tienda.outfit, "la-sele", "comprar equipa de una vez");
  r = applyShopMutation(draft, { type: "shop.buy", itemId: "armadura-carmesi" });
  assert.equal(r.changed, true);
  r = applyShopMutation(draft, { type: "shop.buy", itemId: "rey-caparazon" });
  assert.equal(r.changed, true);
  assert.equal(draft.play.tienda.spent, 90 + 600 + 480);
  assert.deepEqual(draft.play.tienda.owned, ["la-sele", "armadura-carmesi", "rey-caparazon"]);
  assert.equal(draft.play.tienda.outfit, "rey-caparazon");

  /* Cambiar entre poseídos es gratis y las veces que sea. */
  r = applyShopMutation(draft, { type: "shop.equip", itemId: "la-sele" });
  assert.equal(r.changed, true);
  r = applyShopMutation(draft, { type: "shop.equip", itemId: "armadura-carmesi" });
  assert.equal(r.changed, true);
  r = applyShopMutation(draft, { type: "shop.equip", itemId: "clasico" });
  assert.equal(r.changed, true, "el clásico siempre se puede volver a equipar");
  assert.equal(draft.play.tienda.spent, 1170, "equipar no cobra");
  const state = tiendaState(draft);
  assert.equal(state.outfit, "clasico");
  assert.deepEqual(state.owned, ["la-sele", "armadura-carmesi", "rey-caparazon"]);

  /* Lo no poseído no se puede equipar; lo caro no se compra sin saldo. */
  r = applyShopMutation(draft, { type: "shop.equip", itemId: "heroe-aracnido" });
  assert.equal(r.changed, false);
  assert.equal(r.reason, "NOT_OWNED");
  const pobre = { core: { derived: { coins: { balance: 100 } } }, play: {} };
  r = applyShopMutation(pobre, { type: "shop.buy", itemId: "armadura-carmesi" });
  assert.equal(r.changed, false);
  assert.equal(r.reason, "INSUFFICIENT_FUNDS");
});

test("inventario: un save viejo con atuendos de antes sigue resolviendo", () => {
  const bundle = {
    core: { shop: { spent: 38 } },
    play: { tienda: { owned: ["oficina", "gorra-rosa"], outfit: "oficina", vehicle: null, spent: 38 } }
  };
  const state = tiendaState(bundle);
  assert.deepEqual(state.owned, ["oficina", "gorra-rosa"]);
  assert.equal(state.outfit, "oficina");
  /* Los nuevos no aparecen como poseídos por arte de magia. */
  assert.ok(!state.owned.includes("armadura-carmesi"));
});
