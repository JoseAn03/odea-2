import { test } from "node:test";
import assert from "node:assert/strict";

import { createPlayer } from "../js/city/player.js";

test("jugador: camina hacia el destino y se detiene al llegar", () => {
  const p = createPlayer({ x: 0, y: 0 });
  p.setTarget(100, 0);
  let st = p.update(0.5, []);
  assert.equal(st.moving, true);
  assert.ok(st.x > 60 && st.x < 90, `x intermedia = ${st.x}`);
  st = p.update(1, []);
  assert.ok(Math.abs(st.x - 100) <= 7, `x al llegar = ${st.x}`);
  st = p.update(0.1, []);
  assert.equal(st.moving, false);
  assert.equal(st.hasTarget, false);
});

test("jugador: dirección y volteo según el rumbo", () => {
  const left = createPlayer({ x: 0, y: 0 });
  left.setTarget(-100, 0);
  const stL = left.update(0.1, []);
  assert.equal(stL.dir, "side");
  assert.equal(stL.flip, true);

  const up = createPlayer({ x: 0, y: 0 });
  up.setTarget(0, -100);
  assert.equal(up.update(0.1, []).dir, "back");

  const down = createPlayer({ x: 0, y: 0 });
  down.setTarget(0, 100);
  assert.equal(down.update(0.1, []).dir, "front");
});

test("jugador: no atraviesa edificios; se desliza y no queda dentro", () => {
  const wall = { x: 40, y: -50, w: 20, h: 100 };
  const p = createPlayer({ x: 0, y: 0 });
  p.setTarget(200, 30);
  let st = p.state();
  for (let i = 0; i < 40; i++) st = p.update(0.1, [wall]);
  const inside =
    st.x > wall.x - 13 && st.x < wall.x + wall.w + 13 &&
    st.y > wall.y - 4 && st.y < wall.y + wall.h + 18;
  assert.equal(inside, false, `posición final ${st.x},${st.y}`);
});

test("jugador: sin destino no se mueve", () => {
  const p = createPlayer({ x: 10, y: 20 });
  const st = p.update(0.5, []);
  assert.equal(st.x, 10);
  assert.equal(st.y, 20);
  assert.equal(st.moving, false);
});
