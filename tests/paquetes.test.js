/**
 * paquetes.test.js — PAQUETES NEÓN (v0.48.0, Dinámicas de Enganche
 * Fase 4): los 20 cassettes neón escondidos por la ciudad, que se
 * recogen caminando (proximidad, radio 44) y pagan 15 XP + ₡1 cada
 * uno, con premio final de 100 XP + ₡25 al completar la colección.
 *
 * Lo que se protege acá:
 *  - el catálogo es EXACTO el de §5.2: 20 spots, ids tape-01..tape-20,
 *    la distribución por zonas del diseño y paletas rotando 0..4;
 *  - los spots respetan las reglas de colocación contra el layout
 *    real (js/city/layout.js): nunca dentro del interior con piel de
 *    una manzana (inset 22), nunca en medio de una calle, nunca sobre
 *    el letrero de un local (pie sur-centro de su manzana);
 *  - collect es idempotente (DUPLICATE sin doble pago: el sprite ni
 *    se pinta) y el premio exige 20/20 y se cobra una sola vez;
 *  - los rewards derivados suman 400 XP y ₡45 al completar todo;
 *  - la validación es estricta (spots solo del catálogo, rewards
 *    congeladas exactas, premio sin colección completa = inválido);
 *  - un save sin actividad de paquetes deriva totales idénticos
 *    (paridad), con el componente nuevo `paquetes` en 0.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  PAQUETE_COLLECT_RADIUS, PAQUETE_PALETTES, PAQUETE_PRIZE_REWARD,
  PAQUETE_REWARD, PAQUETE_SPOTS, nearestCollectible, paqueteSpot,
  paquetesProblems, paquetesRewards, paquetesStateOf, paquetesView
} from "../src/paquetes-state.js";
import { applyMutation } from "../src/gameplay.js";
import {
  STORAGE_KEYS, createMemoryStorage, importBundle, applyGameplayMutation
} from "../src/storage.js";
import { derive, sourcesFromMigrated } from "../src/derive.js";
import { validatePlayState } from "../src/validate.js";
import { cellRect, GRID } from "../js/city/layout.js";

const catalog = JSON.parse(fs.readFileSync(new URL("../data/xp-catalog.json", import.meta.url)));
const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/odea-progreso-sintetico.json", import.meta.url)));

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

/* La rotación de respaldos conserva solo 3: limpiar entre pasos
   seguidos es housekeeping de la prueba, no del juego (ver
   contrato.test.js). */
function cleanBackups(s) {
  const keys = [];
  for (let i = 0; i < s.length; i += 1) {
    const key = s.key(i);
    if (key && key.startsWith(STORAGE_KEYS.backupPrefix)) keys.push(key);
  }
  for (const key of keys) s.removeItem(key);
}

function collectAll(s, date = "2026-11-23") {
  PAQUETE_SPOTS.forEach((spot, i) => {
    const r = mutateOn(s, { type: "paquete.collect", spotId: spot.id }, date, i);
    assert.equal(r.status, "applied", `${spot.id}: ${JSON.stringify(r.error)}`);
    cleanBackups(s);
  });
}

test("paquetes: el catálogo es exacto el de §5.2 (20 spots, zonas y paletas)", () => {
  assert.equal(PAQUETE_SPOTS.length, 20);
  assert.deepEqual(
    PAQUETE_SPOTS.map((s) => s.id),
    Array.from({ length: 20 }, (_, i) => `tape-${String(i + 1).padStart(2, "0")}`)
  );
  const porZona = {};
  for (const s of PAQUETE_SPOTS) porZona[s.zona] = (porZona[s.zona] || 0) + 1;
  assert.deepEqual(porZona, {
    "Parque del Hub": 3,
    "Playa oeste": 3,
    "Playa · Zona de Eventos": 1,
    "Playa este": 1,
    "Mirador · UCR de la Mente": 1,
    "Academia": 1,
    "Zona IA": 1,
    "Zona Gamer": 1,
    "El Brete": 1,
    "Edificios del sur": 1,
    "Mercado · Tienda": 1,
    "Garaje": 1,
    "Mundo de Ian": 1,
    "Estudio Neón": 1,
    "La rotonda central": 1,
    "Parque sur": 1
  });
  assert.equal(PAQUETE_PALETTES.length, 5);
  for (const s of PAQUETE_SPOTS) {
    assert.ok(Number.isInteger(s.pal) && s.pal >= 0 && s.pal <= 4, `${s.id}: pal 0..4`);
    assert.ok(s.x >= 0 && s.x <= 2720 && s.y >= 0 && s.y <= 2720, `${s.id}: dentro del mundo`);
  }
  assert.deepEqual(PAQUETE_REWARD, { xp: 15, coins: 1 });
  assert.deepEqual(PAQUETE_PRIZE_REWARD, { xp: 100, coins: 25 });
  assert.equal(PAQUETE_COLLECT_RADIUS, 44);
});

test("paquetes: ningún spot cae en medio de una calle ni dentro de una piel", () => {
  /* Centros de calle del layout (ROAD_LINES): el anillo perimetral y
     las 3 avenidas interiores por eje. «En medio de una calle» = a
     menos de 30 unidades del centro de una avenida en CUALQUIER eje
     (las avenidas son bandas continuas de 110 de ancho). */
  const roadCenters = [GRID.margin / 2, 715, 1365, 2015, 2720 - GRID.margin / 2];
  const nearRoadCenter = (v) => roadCenters.some((c) => Math.abs(v - c) < 30);
  /* Manzanas con piel de local: su interior (inset 22) es intocable. */
  const skinCells = [[1, 3], [3, 0], [3, 1], [0, 3], [3, 2], [1, 0], [2, 0], [0, 0], [2, 2], [0, 1]];
  for (const spot of PAQUETE_SPOTS) {
    assert.ok(
      !nearRoadCenter(spot.x) && !nearRoadCenter(spot.y),
      `${spot.id}: cae en medio de una calle`
    );
    for (const [col, row] of skinCells) {
      const r = cellRect(col, row);
      const insideSkin =
        spot.x > r.x + 22 && spot.x < r.x + r.w - 22 &&
        spot.y > r.y + 22 && spot.y < r.y + r.h - 22;
      assert.ok(!insideSkin, `${spot.id}: dentro de la piel de (${col},${row})`);
      /* Nunca tras el letrero: el cartel del local vive al pie
         sur-centro de su manzana (184×42, a 78 del borde sur). */
      const signX = r.x + r.w / 2;
      const signY = r.y + r.h - 57;
      assert.ok(
        Math.hypot(spot.x - signX, spot.y - signY) > 120,
        `${spot.id}: demasiado cerca del letrero de (${col},${row})`
      );
    }
  }
  /* Mundo Ian y Estudio Neón: en la ACERA de su manzana (el marco de
     22), nunca dentro del patio ni del lote. */
  for (const id of ["tape-17", "tape-18"]) {
    const spot = paqueteSpot(id);
    const r = id === "tape-17" ? cellRect(2, 2) : cellRect(0, 1);
    const onFrame =
      ((spot.x >= r.x && spot.x <= r.x + 22) || (spot.x >= r.x + r.w - 22 && spot.x <= r.x + r.w) ||
       (spot.y >= r.y && spot.y <= r.y + 22) || (spot.y >= r.y + r.h - 22 && spot.y <= r.y + r.h)) &&
      spot.x >= r.x && spot.x <= r.x + r.w && spot.y >= r.y && spot.y <= r.y + r.h;
    assert.ok(onFrame, `${id}: debe vivir en el marco de acera de su manzana`);
  }
});

test("paquetes: paridad sin actividad — totales idénticos y componente en 0", () => {
  const s = fresh();
  const before = derived(s);
  assert.equal(before.xpBreakdown.paquetes, 0);
  const bundle = saved(s);
  assert.equal(bundle.play && bundle.play.paquetes, undefined, "sin actividad no se crea la sección");
  assert.deepEqual(paquetesRewards(bundle), { xp: 0, coins: 0 });
  assert.deepEqual(paquetesProblems(bundle), []);
  const view = paquetesView(bundle);
  assert.equal(view.foundCount, 0);
  assert.equal(view.complete, false);
  assert.equal(view.canClaimPrize, false);
});

test("paquetes: collect aplica una vez y el duplicado no paga doble", () => {
  const s = fresh();
  const base = derived(s);
  const r1 = mutateOn(s, { type: "paquete.collect", spotId: "tape-01" }, "2026-11-23");
  assert.equal(r1.status, "applied");
  cleanBackups(s);
  const after1 = derived(s);
  assert.equal(after1.xpBreakdown.paquetes, 15);
  assert.equal(after1.totalXP, base.totalXP + 15);
  assert.equal(after1.coins.earned, base.coins.earned + 1);
  assert.equal(after1.coins.balance, base.coins.balance + 1);

  const r2 = mutateOn(s, { type: "paquete.collect", spotId: "tape-01" }, "2026-11-23", 5);
  assert.equal(r2.status, "duplicate");
  const after2 = derived(s);
  assert.equal(after2.xpBreakdown.paquetes, 15, "el duplicado no suma XP");
  assert.equal(after2.coins.earned, after1.coins.earned, "el duplicado no suma ₡");

  const bad = mutateOn(s, { type: "paquete.collect", spotId: "tape-99" }, "2026-11-23", 9);
  assert.equal(bad.status, "rejected");
});

test("paquetes: la proximidad encuentra solo cassettes sin recoger dentro del radio", () => {
  const s = fresh();
  const bundle0 = saved(s);
  const spot = paqueteSpot("tape-01");
  assert.equal(nearestCollectible(bundle0, spot.x, spot.y).id, "tape-01");
  assert.equal(nearestCollectible(bundle0, spot.x + PAQUETE_COLLECT_RADIUS, spot.y).id, "tape-01");
  assert.equal(nearestCollectible(bundle0, spot.x + PAQUETE_COLLECT_RADIUS + 1, spot.y), null);
  assert.equal(nearestCollectible(bundle0, 60, 60), null, "la esquina noroeste no tiene cassette cerca");
  mutateOn(s, { type: "paquete.collect", spotId: "tape-01" }, "2026-11-23");
  const bundle1 = saved(s);
  assert.equal(nearestCollectible(bundle1, spot.x, spot.y), null, "el recogido ya no se ofrece");
});

test("paquetes: el premio exige 20/20, se cobra una vez y cierra en 400 XP / ₡45", () => {
  const s = fresh();
  const base = derived(s);
  const early = mutateOn(s, { type: "paquete.prize" }, "2026-11-23");
  assert.equal(early.status, "rejected", "sin la colección completa no hay premio");
  cleanBackups(s);

  collectAll(s);
  const full = derived(s);
  assert.equal(full.xpBreakdown.paquetes, 300);
  assert.deepEqual(paquetesRewards(saved(s)), { xp: 300, coins: 20 });
  const view = paquetesView(saved(s));
  assert.equal(view.complete, true);
  assert.equal(view.canClaimPrize, true);

  const prize = mutateOn(s, { type: "paquete.prize" }, "2026-11-23", 40);
  assert.equal(prize.status, "applied");
  cleanBackups(s);
  const done = derived(s);
  assert.equal(done.xpBreakdown.paquetes, 400, "20×15 + 100 = 400 XP");
  assert.equal(done.totalXP, base.totalXP + 400);
  assert.equal(done.coins.earned, base.coins.earned + 45, "20×1 + 25 = ₡45");
  assert.equal(done.coins.balance, base.coins.balance + 45);
  assert.deepEqual(paquetesRewards(saved(s)), { xp: 400, coins: 45 });

  const again = mutateOn(s, { type: "paquete.prize" }, "2026-11-23", 50);
  assert.equal(again.status, "duplicate", "el premio se cobra una sola vez");
  assert.equal(derived(s).xpBreakdown.paquetes, 400);
});

test("paquetes: validación estricta — catálogo cerrado y rewards congeladas exactas", () => {
  const good = {
    play: {
      paquetes: {
        version: 1,
        found: {
          "tape-03": { date: "2026-11-23", at: "2026-11-23T12:00:00.000Z", reward: { xp: 15, coins: 1 }, rulesVersion: 1 }
        },
        prize: null
      }
    }
  };
  assert.deepEqual(paquetesProblems(good), []);
  assert.deepEqual(paquetesProblems({ play: {} }), [], "ausente = válido");
  assert.ok(paquetesProblems({ play: { paquetes: { version: 2, found: {}, prize: null } } }).length > 0, "versión distinta");
  assert.ok(paquetesProblems({
    play: { paquetes: { version: 1, found: { "tape-99": { date: "2026-11-23", at: "2026-11-23T12:00:00.000Z", reward: { xp: 15, coins: 1 }, rulesVersion: 1 } }, prize: null } }
  }).length > 0, "spot fuera del catálogo");
  assert.ok(paquetesProblems({
    play: { paquetes: { version: 1, found: { "tape-03": { date: "2026-11-23", at: "2026-11-23T12:00:00.000Z", reward: { xp: 50, coins: 1 }, rulesVersion: 1 } }, prize: null } }
  }).length > 0, "reward alterada");
  assert.ok(paquetesProblems({
    play: { paquetes: { version: 1, found: {}, prize: { date: "2026-11-23", at: "2026-11-23T12:00:00.000Z", reward: { xp: 100, coins: 25 }, rulesVersion: 1 } } }
  }).length > 0, "premio sin colección completa");
  assert.ok(paquetesProblems({ play: { paquetes: "nope" } }).length > 0, "forma inválida");

  /* validatePlayState sobre un save real con la sección bien formada
     no reporta problemas nuevos (la puerta es fail-closed). */
  const s = fresh();
  mutateOn(s, { type: "paquete.collect", spotId: "tape-03" }, "2026-11-23");
  const real = saved(s);
  assert.ok(real.play && real.play.paquetes, "la primera recolección crea la sección");
  assert.equal(validatePlayState(real, catalog).ok, true, "el save con paquetes válidos pasa validatePlayState");
  const corrupt = structuredClone(real);
  corrupt.play.paquetes = {
    version: 1,
    found: { "tape-99": { date: "2026-11-23", at: "2026-11-23T12:00:00.000Z", reward: { xp: 15, coins: 1 }, rulesVersion: 1 } },
    prize: null
  };
  assert.equal(validatePlayState(corrupt, catalog).ok, false, "un spot inventado invalida el save");
});

test("paquetes: el reducer puro no toca core y registra la recompensa congelada", () => {
  const s = fresh();
  const draft = saved(s);
  const coreBefore = JSON.stringify(draft.core);
  const result = applyMutation(draft, { type: "paquete.collect", spotId: "tape-12" }, catalog, on("2026-11-23"));
  assert.equal(result.changed, true);
  assert.equal(JSON.stringify(draft.core), coreBefore, "core queda intacto");
  const record = draft.play.paquetes.found["tape-12"];
  assert.deepEqual(record.reward, { xp: 15, coins: 1 });
  assert.equal(record.rulesVersion, 1);
  assert.equal(record.date, "2026-11-23");
  const dup = applyMutation(draft, { type: "paquete.collect", spotId: "tape-12" }, catalog, on("2026-11-23", 3));
  assert.equal(dup.duplicate, true);
  assert.deepEqual(paquetesStateOf(draft).found["tape-12"].reward, { xp: 15, coins: 1 });
});
