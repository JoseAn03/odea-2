/**
 * shop.test.js — la Tienda (v0.23.0): comprar y equipar atuendos y
 * vehículos por el pipeline de mutaciones de siempre.
 *
 * El fixture sintético trae ₡41 de saldo: alcanza para la Oficina (₡30)
 * pero no para el Accent (₡120). Los vehículos caros se prueban además a
 * nivel de la mutación pura con un borrador de saldo controlado.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { STORAGE_KEYS, applyGameplayMutation, createMemoryStorage, importBundle } from "../src/storage.js";
import { applyShopMutation, tiendaState, equippedLook } from "../src/shop.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const catalog = JSON.parse(fs.readFileSync(join(root, "data", "xp-catalog.json"), "utf8"));
const AT = "2026-11-17T15:00:00.000Z";
const DAY = "2026-11-17";

function freshSave() {
  const storage = createMemoryStorage();
  const imported = importBundle(JSON.parse(fs.readFileSync(join(root, "fixtures", "odea-progreso-sintetico.json"), "utf8")), {
    catalog, storage, referenceDate: "2026-11-10", migratedAt: "2026-11-10T12:00:00.000Z"
  });
  assert.equal(imported.status, "active");
  return { storage, bundle: imported.bundle };
}
const saved = (storage) => JSON.parse(storage.getItem(STORAGE_KEYS.bundle));
const mutate = (storage, mutation) => applyGameplayMutation(storage, catalog, mutation, { at: AT, date: DAY });

test("tienda: el fixture arranca sin capa tienda y el estado se lee con defaults", () => {
  const { bundle } = freshSave();
  const state = tiendaState(bundle);
  assert.deepEqual(state.owned, []);
  assert.equal(state.outfit, "clasico");
  assert.equal(state.vehicle, null);
  assert.deepEqual(equippedLook(bundle), { outfitId: "clasico", vehicleId: null });
});

test("tienda: comprar la Oficina descuenta del saldo, la posee y la equipa", () => {
  const { storage, bundle } = freshSave();
  const before = bundle.core.derived.coins.balance;
  assert.equal(before, 41);
  const result = mutate(storage, { type: "shop.buy", itemId: "oficina" });
  assert.equal(result.status, "applied");
  const after = saved(storage);
  assert.equal(after.core.shop.spent, 100, "el libro migrado no se toca (el fixture ya traía 100 gastados en ODEA 1)");
  assert.equal(after.play.tienda.spent, 30);
  assert.equal(after.core.derived.coins.balance, 11);
  const state = tiendaState(after);
  assert.deepEqual(state.owned, ["oficina"]);
  assert.equal(state.outfit, "oficina");
});

test("tienda: recomprar es duplicado y no vuelve a cobrar", () => {
  const { storage } = freshSave();
  assert.equal(mutate(storage, { type: "shop.buy", itemId: "gorra-rosa" }).status, "applied");
  assert.equal(mutate(storage, { type: "shop.buy", itemId: "gorra-rosa" }).status, "duplicate");
  assert.equal(saved(storage).play.tienda.spent, 8);
});

test("tienda: sin saldo suficiente la compra se rechaza y el save no cambia", () => {
  const { storage } = freshSave();
  const result = mutate(storage, { type: "shop.buy", itemId: "accent" });
  assert.equal(result.status, "rejected");
  assert.equal(result.error.code, "INSUFFICIENT_FUNDS");
  assert.equal(saved(storage).play?.tienda?.spent || 0, 0);
  assert.equal(saved(storage).core.derived.coins.balance, 41);
});

test("tienda: equipar algo no comprado se rechaza; el clásico siempre se puede equipar", () => {
  const { storage } = freshSave();
  assert.equal(mutate(storage, { type: "shop.equip", itemId: "neon-gamer" }).status, "rejected");
  assert.equal(mutate(storage, { type: "shop.buy", itemId: "oficina" }).status, "applied");
  assert.equal(mutate(storage, { type: "shop.equip", itemId: "clasico" }).status, "applied");
  assert.equal(tiendaState(saved(storage)).outfit, "clasico");
  assert.equal(mutate(storage, { type: "shop.equip", itemId: "oficina" }).status, "applied");
  assert.equal(mutate(storage, { type: "shop.equip", itemId: "oficina" }).status, "duplicate");
});

test("tienda: ítem desconocido se rechaza", () => {
  const { storage } = freshSave();
  assert.equal(mutate(storage, { type: "shop.buy", itemId: "no-existe" }).status, "rejected");
  assert.equal(mutate(storage, { type: "shop.equip", itemId: "no-existe" }).status, "rejected");
});

test("tienda (mutación pura): comprar el Accent y la moto, equipar y bajarse a pie", () => {
  const draft = { core: { derived: { coins: { balance: 500 } } }, play: {} };
  let r = applyShopMutation(draft, { type: "shop.buy", itemId: "accent" });
  assert.equal(r.changed, true);
  assert.equal(draft.play.tienda.spent, 120);
  assert.equal(draft.play.tienda.vehicle, "accent");
  r = applyShopMutation(draft, { type: "shop.buy", itemId: "moto" });
  assert.equal(r.changed, true);
  assert.equal(draft.play.tienda.vehicle, "moto");
  assert.deepEqual(draft.play.tienda.owned, ["accent", "moto"]);
  r = applyShopMutation(draft, { type: "shop.equip", itemId: "accent" });
  assert.equal(r.changed, true);
  assert.equal(draft.play.tienda.vehicle, "accent");
  r = applyShopMutation(draft, { type: "shop.equip", itemId: null });
  assert.equal(r.changed, true);
  assert.equal(draft.play.tienda.vehicle, null);
  r = applyShopMutation(draft, { type: "shop.equip", itemId: null });
  assert.equal(r.duplicate, true);
});
