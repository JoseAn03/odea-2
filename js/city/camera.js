/**
 * camera.js — cámara 2D con arrastre, zoom y límites suaves (sin DOM).
 * Coordenadas de mundo ↔ pantalla.
 */

export function createCamera({ worldSize, maxZoom = 2.6, horizontalScale = 1 }) {
  const state = {
    x: worldSize / 2,
    y: worldSize / 2,
    zoom: 0.35,
    vw: 1,
    vh: 1,
    worldSize,
    horizontalScale: Math.max(0.75, horizontalScale),
    minZoom: 0.08,
    maxZoom
  };
  const target = { x: state.x, y: state.y, zoom: state.zoom };
  const MARGIN_PX = 56;

  function clampZoom(z) {
    return Math.max(state.minZoom, Math.min(state.maxZoom, z));
  }

  function clampPosition(x, y, zoom) {
    const halfW = state.vw / (2 * zoom * state.horizontalScale);
    const halfH = state.vh / (2 * zoom);
    const m = MARGIN_PX / zoom;
    const coastGutter = state.worldSize * 0.12;
    const loX = Math.min(halfW, state.worldSize / 2) - m - coastGutter;
    const hiX = Math.max(state.worldSize - halfW, state.worldSize / 2) + m + coastGutter;
    const loY = Math.min(halfH, state.worldSize / 2) - m - coastGutter;
    const hiY = Math.max(state.worldSize - halfH, state.worldSize / 2) + m + coastGutter;
    return {
      x: Math.max(loX, Math.min(hiX, x)),
      y: Math.max(loY, Math.min(hiY, y))
    };
  }

  function setViewport(width, height) {
    state.vw = Math.max(1, width);
    state.vh = Math.max(1, height);
    const coastSpan = state.worldSize * 1.24;
    const fitWidth = state.vw / (coastSpan * state.horizontalScale);
    const fitHeight = state.vh / coastSpan;
    state.minZoom = Math.max(0.035, Math.min(fitWidth, fitHeight) * 0.86);
    state.zoom = clampZoom(state.zoom);
    const p = clampPosition(state.x, state.y, state.zoom);
    state.x = p.x;
    state.y = p.y;
    target.x = state.x;
    target.y = state.y;
    target.zoom = state.zoom;
  }

  function setHorizontalScale(scale) {
    state.horizontalScale = Math.max(0.75, Math.min(2, Number(scale) || 1));
  }

  function jumpTo(x, y, zoom = state.zoom) {
    state.zoom = clampZoom(zoom);
    const p = clampPosition(x, y, state.zoom);
    state.x = p.x;
    state.y = p.y;
    target.x = state.x;
    target.y = state.y;
    target.zoom = state.zoom;
  }

  function panBy(dxScreen, dyScreen) {
    const p = clampPosition(
      state.x - dxScreen / (state.zoom * state.horizontalScale),
      state.y - dyScreen / state.zoom,
      state.zoom
    );
    state.x = p.x;
    state.y = p.y;
    target.x = p.x;
    target.y = p.y;
    target.zoom = state.zoom;
  }

  function zoomAt(screenX, screenY, factor) {
    const before = screenToWorld(screenX, screenY);
    const zoom = clampZoom(state.zoom * factor);
    state.zoom = zoom;
    const after = screenToWorld(screenX, screenY);
    const p = clampPosition(state.x + (before.x - after.x), state.y + (before.y - after.y), zoom);
    state.x = p.x;
    state.y = p.y;
    target.x = p.x;
    target.y = p.y;
    target.zoom = zoom;
  }

  function setCenter(x, y, zoom = state.zoom) {
    target.zoom = clampZoom(zoom);
    const p = clampPosition(x, y, target.zoom);
    target.x = p.x;
    target.y = p.y;
  }

  function focusRect(rect, { padding = 90, offsetY = 0, maxFocusZoom = 1.25 } = {}) {
    const fitX = state.vw / (rect.w * state.horizontalScale + padding * 2);
    const fitY = state.vh / (rect.h + padding * 2);
    const zoom = clampZoom(Math.min(maxFocusZoom, Math.max(state.minZoom, Math.min(fitX, fitY))));
    setCenter(rect.x + rect.w / 2, rect.y + rect.h / 2 + offsetY / zoom, zoom);
  }

  function screenToWorld(sx, sy) {
    return {
      x: state.x + (sx - state.vw / 2) / (state.zoom * state.horizontalScale),
      y: state.y + (sy - state.vh / 2) / state.zoom
    };
  }

  function worldToScreen(wx, wy) {
    return {
      x: (wx - state.x) * state.zoom * state.horizontalScale + state.vw / 2,
      y: (wy - state.y) * state.zoom + state.vh / 2
    };
  }

  function update(dt) {
    const k = 1 - Math.exp(-Math.min(dt, 0.05) * 7.5);
    state.x += (target.x - state.x) * k;
    state.y += (target.y - state.y) * k;
    state.zoom += (target.zoom - state.zoom) * k;
    if (Math.abs(target.x - state.x) < 0.15 && Math.abs(target.y - state.y) < 0.15 &&
        Math.abs(target.zoom - state.zoom) < 0.0006) {
      state.x = target.x;
      state.y = target.y;
      state.zoom = target.zoom;
    }
    const p = clampPosition(state.x, state.y, state.zoom);
    state.x = p.x;
    state.y = p.y;
  }

  function isSettled() {
    return state.x === target.x && state.y === target.y && state.zoom === target.zoom;
  }

  return {
    state,
    setHorizontalScale,
    setViewport,
    jumpTo,
    panBy,
    zoomAt,
    setCenter,
    focusRect,
    screenToWorld,
    worldToScreen,
    update,
    isSettled,
    clampZoom
  };
}
