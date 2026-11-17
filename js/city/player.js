/**
 * player.js — el avatar de José caminando por Costa Neón.
 *
 * Controlador puro y determinista: posición, destino y dirección de
 * caminata. No toca el DOM ni el save; el motor lo actualiza por cuadro
 * y el renderizador solo lee su estado. La posición vive solo en la
 * sesión: recargar la página lo devuelve a la Plaza Central.
 */

export const PLAYER_SPEED = 155; /* unidades de mundo por segundo */

const ARRIVE = 7;        /* distancia a la que se considera llegado */
const MARGIN_X = 13;     /* holgura lateral contra los edificios */
const MARGIN_TOP = 4;    /* puede pegarse a la pared norte */
const MARGIN_BOTTOM = 18;/* la fachada sur ocupa su franja propia */

export function createPlayer(start) {
  let x = start.x;
  let y = start.y;
  let tx = null;
  let ty = null;
  let dir = "front";
  let flip = false;
  let moving = false;

  function blocked(px, py, buildings) {
    for (const b of buildings) {
      if (
        px > b.x - MARGIN_X && px < b.x + b.w + MARGIN_X &&
        py > b.y - MARGIN_TOP && py < b.y + b.h + MARGIN_BOTTOM
      ) {
        return true;
      }
    }
    return false;
  }

  function state() {
    return { x, y, dir, flip, moving, hasTarget: tx !== null };
  }

  return {
    state,
    setTarget(nx, ny) {
      tx = nx;
      ty = ny;
    },
    clearTarget() {
      tx = null;
      ty = null;
    },
    update(dt, buildings = []) {
      moving = false;
      if (tx === null) return state();

      const dx = tx - x;
      const dy = ty - y;
      const dist = Math.hypot(dx, dy);
      if (dist <= ARRIVE) {
        tx = null;
        ty = null;
        return state();
      }

      const stepLen = Math.min(dist, PLAYER_SPEED * Math.max(0, dt));
      const ux = dx / dist;
      const uy = dy / dist;
      const ox = x;
      const oy = y;

      /* Colisión por ejes: si una pared bloquea un eje, se desliza por
         el otro en vez de atravesar el edificio. */
      const nx = x + ux * stepLen;
      if (!blocked(nx, y, buildings)) x = nx;
      const ny = y + uy * stepLen;
      if (!blocked(x, ny, buildings)) y = ny;

      if (x === ox && y === oy) {
        /* Atascado contra una pared: se rinde con ese destino. */
        tx = null;
        ty = null;
        return state();
      }

      moving = true;
      if (Math.abs(ux) > Math.abs(uy)) {
        dir = "side";
        flip = ux < 0;
      } else {
        dir = uy > 0 ? "front" : "back";
        flip = false;
      }
      return state();
    }
  };
}
