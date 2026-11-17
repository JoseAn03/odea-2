import { test } from "node:test";
import assert from "node:assert/strict";

import { steerVector, STEER_DEADZONE_PX } from "../js/city/joystick.js";

test("joystick: dentro de la zona muerta no dirige", () => {
  assert.equal(steerVector(0, 0), null);
  assert.equal(steerVector(5, -5), null);
  assert.equal(steerVector(STEER_DEADZONE_PX - 1, 0), null);
});

test("joystick: en el borde de la zona muerta ya dirige", () => {
  const v = steerVector(STEER_DEADZONE_PX, 0);
  assert.ok(v);
  assert.equal(v.ux, 1);
  assert.equal(v.uy, 0);
});

test("joystick: las cuatro direcciones salen unitarias", () => {
  assert.deepEqual(steerVector(40, 0), { ux: 1, uy: 0 });
  assert.deepEqual(steerVector(-40, 0), { ux: -1, uy: 0 });
  assert.deepEqual(steerVector(0, 40), { ux: 0, uy: 1 });
  assert.deepEqual(steerVector(0, -40), { ux: 0, uy: -1 });
});

test("joystick: la diagonal se normaliza a longitud 1", () => {
  const v = steerVector(30, 40);
  assert.ok(Math.abs(Math.hypot(v.ux, v.uy) - 1) < 1e-12);
  assert.ok(Math.abs(v.ux - 0.6) < 1e-12);
  assert.ok(Math.abs(v.uy - 0.8) < 1e-12);
});
