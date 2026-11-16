/**
 * input.js — arrastre, pellizco y rueda sobre el canvas.
 * Traduce gestos a movimientos de cámara y taps a selección de distrito.
 */

import { districtAt } from "../districts.js";

export function createInput({ canvas, camera, onSelectDistrict, onInteract }) {
  const pointers = new Map();
  let dragging = false;
  let moved = 0;
  let startedAt = 0;
  let lastX = 0;
  let lastY = 0;
  let pinch = null;

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
      canvas.classList.add("grabbing");
    } else if (pointers.size === 2) {
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
      canvas.classList.remove("grabbing");
      const elapsed = performance.now() - startedAt;
      if (p && moved < 9 && elapsed < 480) {
        const world = camera.screenToWorld(p.x, p.y);
        const district = districtAt(world.x, world.y);
        if (district && typeof onSelectDistrict === "function") onSelectDistrict(district.id);
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
