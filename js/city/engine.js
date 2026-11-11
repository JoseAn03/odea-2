/**
 * engine.js — ciclo de vida del mapa: canvas, cámara, entrada y rAF.
 *
 * - Escala por devicePixelRatio (tope 2) y responsive.
 * - Pausa el rAF cuando la pestaña no está visible.
 * - Respeta prefers-reduced-motion: sin parpadeos ni tráfico en movimiento.
 */

import { createCamera } from "./camera.js";
import { createRenderer } from "./render.js";
import { createInput } from "./input.js";
import { getDistrict } from "../districts.js";
import { MONUMENT } from "./world.js";

export function createCityView({ canvas, world, onSelectDistrict }) {
  const renderer = createRenderer(canvas);
  const camera = createCamera({ worldSize: world.size });
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reduced = motionQuery.matches;
  let running = false;
  let rafId = null;
  let lastTs = 0;
  let time = 0;
  let lastDraw = 0;
  let initialized = false;

  renderer.setReducedMotion(reduced);

  const input = createInput({
    canvas,
    camera,
    onSelectDistrict,
    onInteract: () => {
      if (reduced) drawNow();
    }
  });

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || window.innerWidth;
    const height = rect.height || window.innerHeight;
    renderer.resize(width, height, window.devicePixelRatio || 1);
    camera.setViewport(width, height);

    if (!initialized) {
      initialized = true;
      const zoom = Math.max(width, height) / world.size;
      camera.jumpTo(MONUMENT.x, MONUMENT.y + 90, Math.min(1, Math.max(camera.clampZoom(zoom), 0.22)));
    } else if (reduced) {
      drawNow();
    }
  }

  function drawNow() {
    renderer.draw(camera, world, reduced ? 0 : time);
  }

  function frame(ts) {
    if (!running) return;
    const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0.016;
    lastTs = ts;
    time += dt;

    /* Con movimiento reducido la cámara se asienta al instante. */
    if (reduced) {
      for (let i = 0; i < 12; i++) camera.update(0.05);
    } else {
      camera.update(dt);
    }

    if (!reduced || ts - lastDraw > 80) {
      lastDraw = ts;
      drawNow();
    }
    rafId = requestAnimationFrame(frame);
  }

  function start() {
    if (running || document.hidden) return;
    running = true;
    lastTs = 0;
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
  }

  function onVisibility() {
    if (document.hidden) stop();
    else start();
  }

  function onMotionChange() {
    reduced = motionQuery.matches;
    renderer.setReducedMotion(reduced);
    drawNow();
  }

  function onResize() {
    resize();
  }

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", onResize);
  if (typeof motionQuery.addEventListener === "function") {
    motionQuery.addEventListener("change", onMotionChange);
  }

  resize();
  start();

  return {
    camera,
    renderer,
    focusDistrict(id, { offsetY = 0, animate = true } = {}) {
      const d = getDistrict(id);
      if (!d) return;
      camera.focusRect(d.rect, { padding: 80, offsetY, maxFocusZoom: 1.1 });
      if (!animate) {
        camera.update(10);
        drawNow();
      }
    },
    selectDistrict(id) {
      const d = getDistrict(id);
      renderer.setSelected(d ? d.rect : null, d ? d.accent : "#FF2E93");
      drawNow();
    },
    clearSelection() {
      renderer.setSelected(null);
      drawNow();
    },
    setCredit(value) {
      renderer.setCredit(value);
      drawNow();
    },
    setPlayerVisible(value) {
      renderer.setPlayerVisible(value);
      drawNow();
    },
    recenter() {
      const zoom = Math.max(window.innerWidth, window.innerHeight) / world.size;
      camera.jumpTo(MONUMENT.x, MONUMENT.y + 90, Math.max(camera.clampZoom(zoom), 0.22));
      drawNow();
    },
    redraw: drawNow,
    destroy() {
      stop();
      input.destroy();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      if (typeof motionQuery.removeEventListener === "function") {
        motionQuery.removeEventListener("change", onMotionChange);
      }
    }
  };
}
