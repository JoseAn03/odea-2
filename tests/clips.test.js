import { test } from "node:test";
import assert from "node:assert/strict";

import { DISTRICTS } from "../js/districts.js";
import { CLIPS_CELL, WORLD_SIZE, cellRect } from "../js/city/layout.js";
import { TABS } from "../js/tabs.js";

test("zona CLIPS: su celda no pertenece a ningún distrito", () => {
  for (const d of DISTRICTS) {
    assert.ok(
      !d.cells.some(([c, r]) => c === CLIPS_CELL.col && r === CLIPS_CELL.row),
      `la celda CLIPS cae dentro de ${d.id}`
    );
  }
});

test("zona CLIPS: el rectángulo cae dentro del mundo", () => {
  const r = cellRect(CLIPS_CELL.col, CLIPS_CELL.row);
  assert.ok(r.x >= 0 && r.y >= 0, "origen dentro del mundo");
  assert.ok(r.x + r.w <= WORLD_SIZE && r.y + r.h <= WORLD_SIZE, "fin dentro del mundo");
});

test("teléfono: no es una pestaña más; la barra sigue con sus 4 destinos", () => {
  assert.equal(TABS.length, 4);
  assert.deepEqual(
    TABS.map((t) => t.label),
    ["Ciudad", "Hoy", "Mochila", "Menú"]
  );
});
