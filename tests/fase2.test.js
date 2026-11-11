/**
 * fase2.test.js � Tests de la Fase 2 (Costa Neón)
 * Ejecutar: npm test   (node --test)
 *
 * Cubre lo que la fase promete:
 *  (a) mapeo de distritos completo y sin duplicados;
 *  (b) paridad del HUD con la derivación de la Fase 0;
 *  (c) watchers de versión nueva y multi-pestaña reaccionan a eventos simulados;
 *  (d) la capa visual no escribe el save (byte a byte).
 *
 * No repite ni cambia expectativas de Fase 0/1.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { STORAGE_KEYS, createMemoryStorage, importBundle, readOdea2 } from "../src/storage.js";
import { SIBLING_KEYS, ODEA2_APP_VERSION } from "../src/shape.js";
import { derive, sourcesFromMigrated } from "../src/derive.js";
import { XP_ORDER } from "../js/format.js";
import {
  DISTRICTS,
  XP_HOME,
  KEY_HOME,
  FILLER_CELLS,
  districtAt
} from "../js/districts.js";
import { allCells, GRID, WORLD_SIZE, cellRect } from "../js/city/layout.js";
import { buildWorld } from "../js/city/world.js";
import { buildHud } from "../js/hud.js";
import { buildDistrictPanel, PANEL_FOOTNOTE } from "../js/district-figures.js";
import { createStorageWatcher, SAVE_KEY } from "../js/storage-watch.js";
import { createUpdateWatcher, SKIP_WAITING } from "../js/update-watcher.js";
import { APP_VERSION } from "../js/version.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const FIXTURE_PATH = join(root, "fixtures", "odea-progreso-sintetico.json");
const CATALOG_PATH = join(root, "data", "xp-catalog.json");

const REFERENCE_DATE = "2026-11-10";
const MIGRATED_AT = "2026-11-10T12:00:00.000Z";

function loadFixture() {
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));
}
function loadCatalog() {
  return JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
}
function importFixture(storage, fixture = loadFixture()) {
  return importBundle(fixture, {
    catalog: loadCatalog(),
    storage,
    referenceDate: REFERENCE_DATE,
    migratedAt: MIGRATED_AT
  });
}

/* ========================================================================== */
/* (a) Mapeo de distritos: completo y sin duplicados                          */
/* ========================================================================== */

const EXPECTED_XP_HOME = {
  career: "empleo",
  ach: "hub",
  vida: "vida",
  capital: "torre",
  focus: "vida",
  diary: "vida",
  bosses: "mirador",
  hunt: "empleo",
  evento: "hub",
  farm: "hub"
};

const EXPECTED_KEY_HOME = {
  hub: "hub",
  events: "hub",
  juice: "hub",
  academia: "ia",
  empleo: "empleo",
  tesoro: "mercado",
  garaje: "garaje",
  sagas: "mirador",
  jefe: "mirador",
  anomalia: "rincon",
  quiz: "rincon"
};

test("fase 2 (a): cada componente de xpBreakdown tiene exactamente un distrito", () => {
  assert.equal(XP_ORDER.length, 10, "xpBreakdown debe tener 10 componentes");
  assert.deepEqual(XP_HOME, EXPECTED_XP_HOME);

  const assignments = DISTRICTS.flatMap((d) => d.xp);
  assert.equal(assignments.length, XP_ORDER.length, "no debe haber componentes repetidos");
  assert.deepEqual([...assignments].sort(), [...XP_ORDER].sort());

  for (const key of XP_ORDER) {
    assert.ok(XP_HOME[key], `componente sin distrito: ${key}`);
    assert.ok(
      DISTRICTS.some((d) => d.id === XP_HOME[key]),
      `distrito inexistente para ${key}`
    );
  }
});

test("fase 2 (a): cada una de las 11 claves tiene exactamente un distrito", () => {
  const names = SIBLING_KEYS.map((k) => k.name);
  assert.equal(names.length, 11);
  assert.deepEqual(KEY_HOME, EXPECTED_KEY_HOME);

  const assignments = DISTRICTS.flatMap((d) => d.keys);
  assert.equal(assignments.length, names.length, "no debe haber claves repetidas");
  assert.deepEqual([...assignments].sort(), [...names].sort());

  for (const name of names) {
    assert.ok(KEY_HOME[name], `clave sin distrito: ${name}`);
  }
});

test("fase 2 (a): los 9 distritos tienen celdas únicas y no se solapan", () => {
  assert.equal(DISTRICTS.length, 9);
  assert.equal(new Set(DISTRICTS.map((d) => d.id)).size, 9);

  const cellOwner = new Map();
  for (const district of DISTRICTS) {
    assert.ok(district.cells.length > 0, `${district.id} sin celdas`);
    for (const [col, row] of district.cells) {
      assert.ok(col >= 0 && col < GRID.cols && row >= 0 && row < GRID.rows);
      const key = `${col},${row}`;
      assert.ok(!cellOwner.has(key), `celda ${key} repetida entre distritos`);
      cellOwner.set(key, district.id);
    }
  }

  for (const [col, row] of FILLER_CELLS) {
    const key = `${col},${row}`;
    assert.ok(!cellOwner.has(key), `celda filler ${key} también es distrito`);
  }

  const all = allCells().map(([c, r]) => `${c},${r}`);
  assert.deepEqual(
    [...cellOwner.keys(), ...FILLER_CELLS.map(([c, r]) => `${c},${r}`)].sort(),
    [...all].sort()
  );

  for (const district of DISTRICTS) {
    const center = {
      x: district.rect.x + district.rect.w / 2,
      y: district.rect.y + district.rect.h / 2
    };
    const hit = districtAt(center.x, center.y);
    assert.equal(hit && hit.id, district.id, `districtAt falla en ${district.id}`);
    assert.ok(district.rect.x >= 0 && district.rect.y >= 0);
    assert.ok(district.rect.x + district.rect.w <= WORLD_SIZE);
    assert.ok(district.rect.y + district.rect.h <= WORLD_SIZE);
    assert.match(district.accent, /^#[0-9a-f]{6}$/i, `acento inválido en ${district.id}`);
  }

  assert.equal(districtAt(-50, -50), null);
});

test("fase 2 (a): la geometría genera las 16 manzanas y un mundo estable", () => {
  const world = buildWorld();
  assert.equal(world.size, WORLD_SIZE);
  assert.equal(world.blocks.length, 16);
  assert.equal(new Set(world.blocks.map((b) => `${b.rect.x},${b.rect.y}`)).size, 16);
  assert.ok(world.buildings.length > 40, "la ciudad debe tener edificios");
  assert.equal(world.monument.x, 1365);
  assert.equal(world.monument.y, 1365);
  assert.ok(world.roadNames.some((r) => r.text.includes("Av. Central")));

  const again = buildWorld();
  assert.deepEqual(again.blocks, world.blocks, "la geometría debe ser determinista");

  const first = cellRect(0, 0);
  assert.deepEqual(first, { x: 120, y: 120, w: 540, h: 540 });
});

/* ========================================================================== */
/* (b) Paridad del HUD con la derivación de la Fase 0                         */
/* ========================================================================== */

test("fase 2 (b): el HUD coincide con la derivación del fixture sintético", () => {
  const fixture = loadFixture();
  const catalog = loadCatalog();
  const storage = createMemoryStorage();
  const result = importFixture(storage, fixture);
  assert.equal(result.status, "active");

  const bundle = readOdea2(storage);
  const expected = derive(
    sourcesFromMigrated(bundle),
    catalog,
    bundle.migration.referenceDate
  );
  const hud = buildHud(bundle, catalog);

  assert.equal(hud.playerName, "Recluta Sintética");
  assert.equal(hud.totalXP, expected.totalXP);
  assert.equal(hud.totalXP, fixture.save.totalXP);
  assert.equal(hud.totalXP, 6915);

  assert.equal(hud.coins.balance, expected.coins.balance);
  assert.equal(hud.coins.balance, 41);
  assert.equal(hud.coins.earned, 141);
  assert.equal(hud.coins.spent, 100);

  assert.equal(hud.streak, 8);
  assert.equal(hud.level, expected.campaignLevel);
  assert.equal(hud.level, 3);
  assert.equal(hud.odeLevel, expected.odeLevel);
  assert.equal(hud.odeLevel, 13);

  assert.deepEqual(hud.xpBreakdown, expected.xpBreakdown);

  /* La barra usa la única curva oficial del catálogo: odeLadder. */
  assert.equal(hud.xp.next, catalog.odeLadder[13].xp);
  assert.equal(hud.xp.previous, catalog.odeLadder[12].xp);
  assert.equal(hud.xp.current, hud.totalXP);
  assert.equal(
    hud.xp.ratio,
    (hud.totalXP - hud.xp.previous) / (hud.xp.next - hud.xp.previous)
  );
  assert.ok(hud.xp.ratio > 0 && hud.xp.ratio < 1);
  assert.equal(hud.xp.atMax, false);
});

test("fase 2 (b): el crédito permanente del Hub es evento + farm", () => {
  const catalog = loadCatalog();
  const storage = createMemoryStorage();
  importFixture(storage);
  const bundle = readOdea2(storage);
  const hud = buildHud(bundle, catalog);

  assert.equal(hud.xpBreakdown.evento, 60);
  assert.equal(hud.xpBreakdown.farm, 12);

  const panel = buildDistrictPanel("hub", bundle, catalog);
  const credit = panel.rows.find((row) => row.id === "credit");
  assert.ok(credit, "el panel del Hub debe mostrar el crédito permanente");
  assert.equal(credit.value, "72 XP");
  assert.equal(panel.footnote, PANEL_FOOTNOTE);
});

test("fase 2 (b): los 9 paneles existen y muestran cifras del save", () => {
  const catalog = loadCatalog();
  const storage = createMemoryStorage();
  importFixture(storage);
  const bundle = readOdea2(storage);

  for (const district of DISTRICTS) {
    const panel = buildDistrictPanel(district.id, bundle, catalog);
    assert.ok(panel, `panel faltante: ${district.id}`);
    assert.equal(panel.id, district.id);
    assert.equal(panel.name, district.name);
    assert.equal(panel.footnote, PANEL_FOOTNOTE);
    assert.ok(panel.rows.length > 0, `${district.id} no tiene cifras`);
    for (const row of panel.rows) {
      assert.equal(typeof row.label, "string");
      assert.equal(typeof row.value, "string");
    }
  }

  const torre = buildDistrictPanel("torre", bundle, catalog);
  assert.equal(torre.rows.find((r) => r.id === "capital_xp").value, "630");

  const mercado = buildDistrictPanel("mercado", bundle, catalog);
  assert.equal(mercado.rows.find((r) => r.id === "balance").value, "41");

  const rincon = buildDistrictPanel("rincon", bundle, catalog);
  assert.ok(rincon.archivedNotice.includes("archivados"));
});

/* ========================================================================== */
/* (c) Watchers: versión nueva y multi-pestaña                               */
/* ========================================================================== */

function fakeTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      if (listeners.has(type)) listeners.get(type).delete(fn);
    },
    dispatch(type, event) {
      for (const fn of [...(listeners.get(type) || [])]) fn(event);
    },
    count(type) {
      return (listeners.get(type) || new Set()).size;
    }
  };
}

function fakeWorker(state = "installing") {
  const listeners = new Map();
  return {
    state,
    messages: [],
    postMessage(message) {
      this.messages.push(message);
    },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    fire(type) {
      for (const fn of [...(listeners.get(type) || [])]) fn();
    }
  };
}

function fakeRegistration() {
  const listeners = new Map();
  return {
    waiting: null,
    installing: null,
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    fire(type) {
      for (const fn of [...(listeners.get(type) || [])]) fn();
    }
  };
}

test("fase 2 (c): el listener de storage solo reacciona a la clave del save", () => {
  const target = fakeTarget();
  const events = [];
  const watcher = createStorageWatcher({
    target,
    onRemoteChange: (event) => events.push(event)
  });

  assert.equal(target.count("storage"), 1);
  target.dispatch("storage", { key: "otra_clave", newValue: "x" });
  assert.equal(events.length, 0);

  watcher.handleEvent({ key: SAVE_KEY, newValue: '{"a":1}' });
  assert.equal(events.length, 1);
  assert.equal(events[0].cleared, false);
  assert.equal(events[0].newValue, '{"a":1}');

  watcher.handleEvent({ key: null, newValue: null });
  assert.equal(events.length, 2);
  assert.equal(events[1].cleared, true);

  watcher.dispose();
  assert.equal(target.count("storage"), 0);
  watcher.handleEvent({ key: SAVE_KEY, newValue: "{}" });
  assert.equal(events.length, 3, "handleEvent directo sigue disponible para tests");
});

test("fase 2 (c): versión esperando -> aviso, y recarga solo al aceptar", () => {
  const container = fakeTarget();
  container.controller = {};
  const worker = fakeWorker("installed");
  let notified = 0;
  let reloaded = 0;

  const watcher = createUpdateWatcher({
    container,
    onUpdateAvailable: () => { notified++; },
    reload: () => { reloaded++; }
  });

  const registration = fakeRegistration();
  registration.waiting = worker;
  watcher.check(registration);

  assert.equal(notified, 1);
  assert.equal(reloaded, 0, "no debe recargar sin acción del usuario");

  watcher.accept();
  assert.deepEqual(worker.messages, [{ type: SKIP_WAITING }]);
  assert.equal(reloaded, 0, "la recarga espera al controllerchange");

  container.dispatch("controllerchange", {});
  assert.equal(reloaded, 1);

  container.dispatch("controllerchange", {});
  assert.equal(reloaded, 1, "la recarga ocurre una sola vez");
  watcher.dispose();
});

test("fase 2 (c): una actualización encontrada en uso también avisa", () => {
  const container = fakeTarget();
  container.controller = {};
  let notified = 0;

  const watcher = createUpdateWatcher({
    container,
    onUpdateAvailable: () => { notified++; },
    reload: () => {}
  });

  const registration = fakeRegistration();
  watcher.check(registration);
  assert.equal(notified, 0);

  const installing = fakeWorker("installing");
  registration.installing = installing;
  registration.fire("updatefound");
  installing.state = "installed";
  installing.fire("statechange");

  assert.equal(notified, 1);
  assert.equal(watcher.hasUpdate(), true);
  watcher.dispose();
});

/* ========================================================================== */
/* (d) La capa visual no escribe el save                                     */
/* ========================================================================== */

test("fase 2 (d): abrir la ciudad y consultar paneles no toca el bundle", () => {
  const catalog = loadCatalog();
  const base = createMemoryStorage();
  const writes = [];
  const storage = {
    getItem: (k) => base.getItem(k),
    setItem: (k, v) => { writes.push(`set:${k}`); base.setItem(k, v); },
    removeItem: (k) => { writes.push(`remove:${k}`); base.removeItem(k); }
  };

  const result = importFixture(storage);
  assert.equal(result.status, "active");

  const before = base.getItem(STORAGE_KEYS.bundle);
  assert.ok(before, "el fixture debe quedar guardado");
  writes.length = 0;

  /* «Abrir» la ciudad: geometría + HUD + todos los paneles. */
  buildWorld();
  const bundle = readOdea2(storage);
  const hud = buildHud(bundle, catalog);
  assert.ok(hud.totalXP > 0);
  for (const district of DISTRICTS) {
    assert.ok(buildDistrictPanel(district.id, bundle, catalog));
  }

  assert.deepEqual(writes, [], "ninguna capa visual debe escribir en storage");
  const after = base.getItem(STORAGE_KEYS.bundle);
  assert.equal(after, before, "el bundle debe quedar byte a byte igual");
  assert.deepEqual(readOdea2(storage), bundle);
});

test("fase 2 (d): los módulos de datos puros no importan funciones de escritura", () => {
  const files = [
    "js/districts.js",
    "js/hud.js",
    "js/district-figures.js",
    "js/city/layout.js",
    "js/city/world.js"
  ];
  for (const file of files) {
    const source = fs.readFileSync(join(root, file), "utf8");
    assert.ok(!/saveOdea2|backupBundle|setItem\s*\(/.test(source), `${file} no debe escribir el save`);
    assert.ok(!/localStorage/.test(source), `${file} no debe tocar localStorage`);
  }
});

/* ========================================================================== */
/* Versión de la fase                                                         */
/* ========================================================================== */

test("fase 2: versión visible, bundle y caché del SW están sincronizados", () => {
  const pkg = JSON.parse(fs.readFileSync(join(root, "package.json"), "utf8"));
  const sw = fs.readFileSync(join(root, "sw.js"), "utf8");

  assert.equal(APP_VERSION, "0.3.0-fase2");
  assert.equal(pkg.version, APP_VERSION);
  assert.equal(ODEA2_APP_VERSION, APP_VERSION);
  assert.ok(sw.includes(`"odea2-v${APP_VERSION}"`), "la caché del SW debe usar la versión de la app");

  const install = sw.slice(sw.indexOf('"install"'), sw.indexOf('"activate"'));
  assert.ok(!install.includes("skipWaiting"), "install no debe aplicar skipWaiting solo");
  assert.ok(sw.includes('"message"') && sw.includes("SKIP_WAITING"));
});
