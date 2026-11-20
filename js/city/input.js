/**
 * input.js — arrastre, pellizco y rueda sobre el canvas.
 * Traduce gestos a movimientos de cámara y taps a selección de distrito.
 */

import { districtAt } from "../districts.js";
import { steerVector } from "./joystick.js";
import { academiaRect, clipsRect, eventosRect, jarvisRect, mundoianRect, pointInRect, sabiduriaRect, zonaiaRect } from "./layout.js";

export function createInput({ canvas, camera, onSelectDistrict, onInteract, onTapWorld, onSteer, walkModeActive }) {
  const pointers = new Map();
  let dragging = false;
  let moved = 0;
  let startedAt = 0;
  let lastX = 0;
  let lastY = 0;
  let pinch = null;
  let downX = 0;
  let downY = 0;
  let steering = false;

  function inWalkMode() {
    return typeof walkModeActive === "function" && walkModeActive();
  }

  function cancelSteer() {
    if (!steering) return;
    steering = false;
    if (typeof onSteer === "function") onSteer(null);
  }

  function localPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function notifyInteract() {
    if (typeof onInteract === "function") onInteract();
  }

  function onPointerDown(event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const p = localPoint(event);
    pointers.set(event.pointerId, p);
    try { canvas.setPointerCapture(event.pointerId); } catch (_) { /* sin captura */ }

    if (pointers.size === 1) {
      dragging = true;
      moved = 0;
      startedAt = performance.now();
      lastX = p.x;
      lastY = p.y;
      downX = p.x;
      downY = p.y;
      canvas.classList.add("grabbing");
    } else if (pointers.size === 2) {
      cancelSteer();
      const [a, b] = [...pointers.values()];
      pinch = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      };
      dragging = false;
      moved = 999;
    }
    notifyInteract();
  }

  function onPointerMove(event) {
    const p = localPoint(event);
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, p);

    if (pointers.size === 1 && dragging) {
      const dx = p.x - lastX;
      const dy = p.y - lastY;
      lastX = p.x;
      lastY = p.y;
      moved += Math.abs(dx) + Math.abs(dy);

      /* En modo caminar el arrastre NO mueve la cámara: dirige al avatar
         (palanca invisible). La dirección de pantalla se convierte a
         dirección de mundo con dos puntos por la cámara, exacto aunque
         haya escala horizontal. Al volver a la zona muerta, se detiene. */
      if (inWalkMode()) {
        const v = steerVector(p.x - downX, p.y - downY);
        if (v) {
          const w0 = camera.screenToWorld(downX, downY);
          const w1 = camera.screenToWorld(downX + v.ux * 100, downY + v.uy * 100);
          const wx = w1.x - w0.x;
          const wy = w1.y - w0.y;
          const wl = Math.hypot(wx, wy) || 1;
          steering = true;
          if (typeof onSteer === "function") onSteer({ ux: wx / wl, uy: wy / wl });
        } else {
          cancelSteer();
        }
        notifyInteract();
        return;
      }

      camera.panBy(dx, dy);
      notifyInteract();
      return;
    }

    if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (pinch.dist > 0) camera.zoomAt(mid.x, mid.y, dist / pinch.dist);
      camera.panBy(mid.x - pinch.mid.x, mid.y - pinch.mid.y);
      pinch = { dist, mid };
      moved += 4;
      notifyInteract();
    }
  }

  function endPointer(event) {
    const p = pointers.get(event.pointerId);
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 1) {
      const [only] = [...pointers.values()];
      lastX = only.x;
      lastY = only.y;
      dragging = true;
      moved = 999;
    }
    if (pointers.size === 0) {
      cancelSteer();
      canvas.classList.remove("grabbing");
      const elapsed = performance.now() - startedAt;
      if (p && moved < 9 && elapsed < 480) {
        const world = camera.screenToWorld(p.x, p.y);
        if (inWalkMode()) {
          if (typeof onTapWorld === "function") onTapWorld(world);
        } else {
          const district = districtAt(world.x, world.y);
          if (typeof onSelectDistrict === "function") {
            if (pointInRect(jarvisRect(), world.x, world.y)) onSelectDistrict("jarvis");
            else if (pointInRect(clipsRect(), world.x, world.y)) onSelectDistrict("gamer");
            else if (pointInRect(eventosRect(), world.x, world.y)) onSelectDistrict("eventos");
            else if (pointInRect(academiaRect(), world.x, world.y)) onSelectDistrict("academia");
            else if (pointInRect(zonaiaRect(), world.x, world.y)) onSelectDistrict("zonaia");
            else if (pointInRect(sabiduriaRect(), world.x, world.y)) onSelectDistrict("sabiduria");
            else if (pointInRect(mundoianRect(), world.x, world.y)) onSelectDistrict("mundoian");
            else if (district) onSelectDistrict(district.id);
          }
        }
      }
      dragging = false;
    }
  }

  function onWheel(event) {
    event.preventDefault();
    const p = localPoint(event);
    const factor = Math.exp(-event.deltaY * 0.0016);
    camera.zoomAt(p.x, p.y, factor);
    notifyInteract();
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("wheel", onWheel, { passive: false });

  return {
    destroy() {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", endPointer);
      canvas.removeEventListener("pointercancel", endPointer);
      canvas.removeEventListener("wheel", onWheel);
    }
  };
}
