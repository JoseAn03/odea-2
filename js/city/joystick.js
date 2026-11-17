/**
 * joystick.js — palanca invisible para caminar.
 *
 * Sin interfaz visible: en modo caminar, el jugador desliza el dedo (o el
 * ratón) sobre la ciudad y el avatar camina en la dirección del arrastre;
 * al soltar, se detiene. Este módulo solo hace la matemática del gesto —
 * vector unitario a partir del desplazamiento en píxeles de pantalla, con
 * zona muerta para no pisar el toque simple — y no toca DOM ni el save.
 */

/* Desplazamiento mínimo (px de pantalla) para que el arrastre dirija. */
export const STEER_DEADZONE_PX = 12;

/**
 * Vector de dirección del arrastre (dx, dy en px de pantalla desde el
 * punto donde bajó el dedo). Devuelve null dentro de la zona muerta y un
 * vector unitario { ux, uy } fuera de ella.
 */
export function steerVector(dx, dy) {
  const dist = Math.hypot(dx, dy);
  if (!(dist >= STEER_DEADZONE_PX)) return null;
  return { ux: dx / dist, uy: dy / dist };
}
