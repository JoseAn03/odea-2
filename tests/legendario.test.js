/**
 * legendario.test.js — SET LEGENDARIO EXO//AUTÓMATA (v0.49.0,
 * Dinámicas de Enganche Fase 5, diseño §6 + Adenda §12.2③): el
 * premio de fin de evento que NO se compra — solo se gana
 * completando la campaña `whatsapp` (Operación Confirmación).
 *
 * ESCENARIO AL CONSTRUIR (2026-11-23): la campaña `whatsapp` AÚN NO
 * existe en CAMPAIGNS (el evento entra el 2026-11-24). Por eso:
 *  - las pruebas de reclamo sin campaña fijan el comportamiento
 *    FAIL-CLOSED real de hoy: campaignView → null, claim imposible;
 *  - la prueba del reclamo válido registra una campaña fixture
 *    `whatsapp` de 14 misiones (reusando las misiones reales de
 *    `entrevista`, freeOrder, para que el pipeline completo las
 *    valide como cuando el evento real llegue) y la completa por la
 *    puerta única antes de reclamar. Cuando Operación Confirmación
 *    entre de verdad, el mismo flujo funciona sin tocar el código.
 *
 * Lo que se protege acá:
 *  - las 5 piezas exactas de §6.1, grantOnly con price null, y el
 *    kind nuevo "reliquia" en las 3 de vitrina;
 *  - shop.buy de grantOnly → GRANT_ONLY (ni por consola);
 *  - shop.equip de reliquia → NOT_EQUIPPABLE; de atuendo/vehículo
 *    legendarios poseídos → funciona;
 *  - claim sin campaña / campaña incompleta / sin set / con grant
 *    previo → rechazado o DUPLICATE, sin otorgar nada;
 *  - claim válido 14/14 → las 5 piezas en owned + atuendo equipado
 *    + grant registrado;
 *  - owned grantOnly sin grant → save inválido (fail-closed);
 *  - las piezas NO aparecen en la grilla de compra de la Tienda;
 *  - paridad total: el set no mueve XP ni ₡ (cosmético puro).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { SHOP_ITEMS, shopItem, applyShopMutation } from "../src/shop.js";
import { CAMPAIGNS } from "../src/campaigns.js";
import { campaignView } from "../src/campaign-state.js";
import {
  LEGENDARY_SETS, legendarySetFor, legendarioProblems,
  legendarioStateOf, legendarioView
} from "../src/legendario-state.js";
import { applyMutation } from "../src/gameplay.js";
import {
  STORAGE_KEYS, createMemoryStorage, importBundle, applyGameplayMutation
} from "../src/storage.js";
import { derive, sourcesFromMigrated } from "../src/derive.js";
import { validatePlayState } from "../src/validate.js";

const catalog = JSON.parse(fs.readFileSync(new URL("../data/xp-catalog.json", import.meta.url)));
const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/odea-progreso-sintetico.json", import.meta.url)));

const SET_IDS = ["exo-automata", "mensajero-gt", "nucleo-automata", "sello-confirmacion", "antena-dorada"];

function fresh() {
  const storage = createMemoryStorage();
  const imported = importBundle(structuredClone(fixture), {
    storage, catalog, referenceDate: "2026-11-10", migratedAt: "2026-11-10T12:00:00.000Z"
  });
  assert.equal(imported.status, "active");
  return storage;
}
const saved = (s) => JSON.parse(s.getItem(STORAGE_KEYS.bundle));
const derived = (s) => derive(sourcesFromMigrated(saved(s), catalog), catalog, "2026-11-10");
const on = (date, second = 0) => ({
  date, at: new Date(Date.parse(`${date}T12:00:00.000Z`) + second * 1000).toISOString()
});
const mutateOn = (s, mutation, date, second = 0) =>
  applyGameplayMutation(s, catalog, mutation, on(date, second));

function cleanBackups(s) {
  const keys = [];
  for (let i = 0; i < s.length; i += 1) {
    const key = s.key(i);
    if (key && key.startsWith(STORAGE_KEYS.backupPrefix)) keys.push(key);
  }
  for (const key of keys) s.removeItem(key);
}

/* Registra la campaña fixture `whatsapp` (14 misiones, freeOrder)
   reusando las misiones reales de `entrevista`: así campaignView la
   ve y el pipeline valida sus completaciones con las reglas de
   siempre — el mismo escenario que dejará el evento real al entrar. */
function registerWhatsappFixture() {
  if (CAMPAIGNS.whatsapp) return CAMPAIGNS.whatsapp;
  const entrevista = CAMPAIGNS.entrevista;
  const missions = entrevista.chapters.flatMap((c) => c.missions);
  assert.equal(missions.length, 14, "la fixture parte de una campaña real de 14 misiones");
  CAMPAIGNS.whatsapp = {
    ...entrevista,
    id: "whatsapp",
    name: "Operación Confirmación",
    chapters: [{ id: "whatsapp-todo", title: "Operación Confirmación", subtitle: "", missions }]
  };
  return CAMPAIGNS.whatsapp;
}

function completeWhatsapp(s, date = "2026-11-23") {
  const view = campaignView(saved(s), "whatsapp");
  view.chapters.flatMap((c) => c.missions).forEach((mission, i) => {
    const r = mutateOn(s, {
      type: "campaign.complete", missionId: mission.id,
      evidence: "Evidencia de prueba del evento: el entregable real quedó hecho y revisado."
    }, date, i);
    assert.equal(r.status, "applied", `${mission.id}: ${JSON.stringify(r.error)}`);
    cleanBackups(s);
  });
}

test("legendario: las 5 piezas de §6.1 existen, grantOnly y price null", () => {
  assert.deepEqual(legendarySetFor("whatsapp").items, SET_IDS);
  assert.equal(legendarySetFor("whatsapp").name, "EXO//AUTÓMATA");
  assert.equal(legendarySetFor("eventos"), null, "el EXO//ORÁCULO NO se porta en esta fase");
  const kinds = Object.fromEntries(SET_IDS.map((id) => [id, shopItem(id).kind]));
  assert.deepEqual(kinds, {
    "exo-automata": "outfit",
    "mensajero-gt": "vehicle",
    "nucleo-automata": "reliquia",
    "sello-confirmacion": "reliquia",
    "antena-dorada": "reliquia"
  });
  for (const id of SET_IDS) {
    const item = shopItem(id);
    assert.equal(item.grantOnly, true, `${id}: grantOnly`);
    assert.equal(item.price, null, `${id}: price null (jamás vendible)`);
  }
  assert.ok(shopItem("exo-automata").look, "el atuendo trae look 18×28");
  assert.equal(shopItem("exo-automata").look.overlay, "circuits");
  assert.ok(shopItem("mensajero-gt").spec, "el vehículo trae spec");
  for (const id of SET_IDS.slice(2)) {
    assert.ok(shopItem(id).art && shopItem(id).art.rows.length === 16, `${id}: pixel art por código`);
  }
  assert.deepEqual(Object.keys(LEGENDARY_SETS), ["whatsapp"], "solo whatsapp tiene set en esta fase");
});

test("legendario: shop.buy rechaza grantOnly con GRANT_ONLY y equip de reliquia se rechaza", () => {
  const s = fresh();
  const draft = saved(s);
  for (const id of SET_IDS) {
    const r = applyShopMutation(draft, { type: "shop.buy", itemId: id });
    assert.equal(r.changed, false, `${id}: buy no cambia nada`);
    assert.equal(r.reason, "GRANT_ONLY", `${id}: razón GRANT_ONLY`);
  }
  for (const id of SET_IDS.slice(2)) {
    const r = applyShopMutation(draft, { type: "shop.equip", itemId: id });
    assert.equal(r.changed, false, `${id}: reliquia no equipable`);
    assert.equal(r.reason, "NOT_EQUIPPABLE");
  }
  /* Y por la puerta única completa, el buy también se rechaza. */
  const viaPipeline = mutateOn(s, { type: "shop.buy", itemId: "exo-automata" }, "2026-11-23");
  assert.notEqual(viaPipeline.status, "applied");
});

test("legendario: FAIL-CLOSED — sin campaña whatsapp el reclamo es imposible", () => {
  /* Este test fija el escenario real del 2026-11-23 ANTES de que el
     fixture se registre en otro test: si whatsapp ya existiera en el
     repo, el escenario cambia y el test lo dice, no lo esconde. */
  if (CAMPAIGNS.whatsapp && !CAMPAIGNS.whatsapp.__fixture) {
    assert.ok(campaignView(saved(fresh()), "whatsapp"), "whatsapp ya existe de verdad: escenario vivo");
    return;
  }
  const s = fresh();
  assert.equal(campaignView(saved(s), "whatsapp"), null, "sin campaña, campaignView es null");
  const r = mutateOn(s, { type: "legendario.claim", campaignId: "whatsapp" }, "2026-11-23");
  assert.notEqual(r.status, "applied", "el reclamo no se aplica sin campaña");
  const after = saved(s);
  assert.equal(legendarioStateOf(after).grants.whatsapp, undefined);
  for (const id of SET_IDS) assert.ok(!(after.play?.tienda?.owned || []).includes(id), `${id} no se otorgó`);
});

test("legendario: claim con campaña incompleta, sin set y con grant previo se rechaza", () => {
  registerWhatsappFixture();
  CAMPAIGNS.whatsapp.__fixture = true;
  const s = fresh();

  /* Sin set definido para la campaña. */
  const noSet = mutateOn(s, { type: "legendario.claim", campaignId: "brete" }, "2026-11-23");
  assert.notEqual(noSet.status, "applied");

  /* Campaña con set pero incompleta (0/14). */
  const incomplete = mutateOn(s, { type: "legendario.claim", campaignId: "whatsapp" }, "2026-11-23");
  assert.notEqual(incomplete.status, "applied");
  assert.equal(legendarioStateOf(saved(s)).grants.whatsapp, undefined);

  /* Completa → reclama → el segundo reclamo es DUPLICATE. */
  completeWhatsapp(s);
  const first = mutateOn(s, { type: "legendario.claim", campaignId: "whatsapp" }, "2026-11-23", 40);
  assert.equal(first.status, "applied", JSON.stringify(first.error));
  cleanBackups(s);
  const second = mutateOn(s, { type: "legendario.claim", campaignId: "whatsapp" }, "2026-11-23", 41);
  assert.equal(second.status, "duplicate", "sin doble grant");
  assert.deepEqual(legendarioStateOf(saved(s)).grants.whatsapp.items, SET_IDS);
});

test("legendario: claim válido 14/14 otorga las 5 piezas y equipa el atuendo, sin mover XP ni ₡", () => {
  registerWhatsappFixture();
  CAMPAIGNS.whatsapp.__fixture = true;
  const s = fresh();
  completeWhatsapp(s);
  const before = derived(s);
  const xpBefore = before.totalXP;
  const coinsBefore = before.coins.balance;

  const r = mutateOn(s, { type: "legendario.claim", campaignId: "whatsapp" }, "2026-11-23", 50);
  assert.equal(r.status, "applied", JSON.stringify(r.error));
  cleanBackups(s);

  const after = saved(s);
  for (const id of SET_IDS) assert.ok(after.play.tienda.owned.includes(id), `${id} en owned`);
  assert.equal(after.play.tienda.outfit, "exo-automata", "el atuendo se equipa al instante");
  const grant = legendarioStateOf(after).grants.whatsapp;
  assert.ok(grant && grant.date === "2026-11-23", "grant registrado con fecha");
  assert.deepEqual(grant.items, SET_IDS);

  const view = legendarioView(after, "whatsapp");
  assert.equal(view.claimed, true);
  assert.equal(view.canClaim, false);
  assert.ok(view.pieces.every((p) => p.owned));

  /* Cosmético puro: ni un punto de XP ni un ₡ se movieron. */
  const afterDerived = derived(s);
  assert.equal(afterDerived.totalXP, xpBefore, "XP idéntica tras el reclamo");
  assert.equal(afterDerived.coins.balance, coinsBefore, "saldo ₡ idéntico tras el reclamo");
  assert.deepEqual(afterDerived.xpBreakdown, before.xpBreakdown);

  /* Equipar lo ganado funciona (vehículo y atuendo, vía shop.equip). */
  const equipVehicle = mutateOn(s, { type: "shop.equip", itemId: "mensajero-gt" }, "2026-11-23", 51);
  assert.equal(equipVehicle.status, "applied", JSON.stringify(equipVehicle.error));
  assert.equal(saved(s).play.tienda.vehicle, "mensajero-gt");
});

test("legendario: owned grantOnly sin grant invalida el save (fail-closed)", () => {
  const s = fresh();
  const draft = saved(s);
  if (!draft.play) draft.play = {};
  if (!draft.play.tienda) draft.play.tienda = { owned: [], outfit: "clasico", vehicle: null, spent: 0 };
  draft.play.tienda.owned.push("nucleo-automata");
  const problems = legendarioProblems(draft);
  assert.ok(problems.some((p) => p.includes("nucleo-automata")), "la reliquia sin grant es problema");
  const report = validatePlayState(draft, catalog, {});
  assert.equal(report.ok, false, "el save con pieza sin grant no valida");

  /* Con su grant, el mismo owned es válido. */
  const withGrant = saved(fresh());
  if (!withGrant.play) withGrant.play = {};
  if (!withGrant.play.tienda) withGrant.play.tienda = { owned: [], outfit: "clasico", vehicle: null, spent: 0 };
  withGrant.play.tienda.owned.push(...SET_IDS);
  withGrant.play.legendario = {
    version: 1,
    grants: { whatsapp: { date: "2026-11-24", at: "2026-11-24T12:00:00.000Z", items: [...SET_IDS] } }
  };
  assert.deepEqual(legendarioProblems(withGrant), []);

  /* Un grant con items alterados también invalida. */
  const forged = structuredClone(withGrant);
  forged.play.legendario.grants.whatsapp.items = ["exo-automata"];
  assert.ok(legendarioProblems(forged).length > 0);
});

test("legendario: las piezas son invisibles en la grilla de compra y la paridad sin grants es total", () => {
  const shopUi = fs.readFileSync(new URL("../js/shop-ui.js", import.meta.url), "utf8");
  assert.match(shopUi, /!i\.grantOnly/, "renderShop filtra grantOnly de la grilla de compra");
  assert.equal(SHOP_ITEMS.filter((i) => i.grantOnly).length, 5);

  const s = fresh();
  const before = derived(s);
  /* Jugar otra cosa (una nota de la Libreta: sin XP, sin ₡ y sin
     tocar la racha) no crea la sección legendario ni mueve totales
     por la dinámica nueva. */
  const r = mutateOn(s, { type: "libreta.create", id: "nota-paridad-fase5", texto: "Nota de paridad de la Fase 5." }, "2026-11-23");
  assert.equal(r.status, "applied", JSON.stringify(r.error));
  const afterBundle = saved(s);
  assert.equal(afterBundle.play.legendario, undefined, "sin reclamo no nace play.legendario");
  const after = derived(s);
  assert.equal(after.totalXP, before.totalXP);
  assert.equal(after.coins.balance, before.coins.balance);
  assert.deepEqual(legendarioProblems(afterBundle), []);
  assert.equal(legendarioView(afterBundle, "whatsapp").claimed, false);
});

test("legendario: el reducer directo también es fail-closed (applyMutation)", () => {
  const s = fresh();
  const draft = saved(s);
  const r = applyMutation(draft, { type: "legendario.claim", campaignId: "whatsapp" }, catalog, on("2026-11-23"));
  if (!CAMPAIGNS.whatsapp) {
    assert.equal(r.reason, "NO_CAMPAIGN");
    assert.equal(r.changed, false);
  } else {
    assert.equal(r.reason, "NOT_COMPLETE");
    assert.equal(r.changed, false);
  }
});
