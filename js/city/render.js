/**
 * render.js — dibuja Costa Neón en Canvas 2D (vista cenital).
 *
 * Sin imágenes externas: todo es geometría, gradientes y texto. El detalle se
 * activa por niveles según el zoom (LOD) para que corra fluido en gama media.
 */

import { PALETTE, DISTRICTS, alpha, mix } from "../districts.js";
import { fmt } from "../format.js";
import { createPixelArt } from "./pixel.js";
import { clipsRect, cellRect } from "./layout.js";

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

const C = {
  base: "#3E9B67",
  ground: "#3A7A4C",
  sidewalk: "#B7875B",
  road: "#2E3248",
  roof: "#55628A",
  side: "#2A3550",
  text: "#F3ECFF",
  muted: "#B6A9CC"
};

function hash(seed, a, b) {
  let h = (seed ^ Math.imul(a, 374761393) ^ Math.imul(b, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function flicker(seed, time, reduced) {
  if (reduced) return 1;
  const wave = 0.82 + 0.18 * Math.sin(time * 1.9 + seed);
  const dip = hash(seed, Math.floor(time * 5), 7) > 0.972 ? 0.4 : 1;
  return wave * dip;
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext("2d", { alpha: false });
  const sprites = new Map();
  let dpr = 1;
  let vw = 1;
  let vh = 1;
  let creditXP = null;
  let playerVisible = false;
  let playerState = null;
  let selectedRect = null;
  let selectedAccent = PALETTE.pink;
  let reduced = false;
  let glow = null;
  const venuePictures = {};
  if (typeof Image !== "undefined") {
    for (const id of ["brete", "gamer"]) {
      const image = new Image();
      image.src = new URL(`../../assets/slots/${id}.webp`, import.meta.url).href;
      venuePictures[id] = image;
    }
  }

  /* Capa de arte pixel (rama arte-pixel-main): se crea una sola vez y
     puede ser null sin DOM; si es null, el render es exactamente el previo. */
  let pixelArt = null;
  let pixelTried = false;
  function art() {
    if (!pixelTried) {
      pixelTried = true;
      try { pixelArt = createPixelArt(); } catch { pixelArt = null; }
    }
    return pixelArt;
  }
  let ambience = null;

  /** Nivel visual del distrito (0–2) según el progreso real. */
  function districtLevelOf(id) {
    if (!ambience || !ambience.districts || !id) return 0;
    const entry = ambience.districts[id];
    return entry ? entry.level : 0;
  }

  function windowBoost() {
    return ambience && Number.isFinite(ambience.windowBoost) ? ambience.windowBoost : 1;
  }

  /* ------------------------------ sprites de texto ------------------------- */

  function measure(text, size, weight) {
    const c = document.createElement("canvas").getContext("2d");
    c.font = `${weight} ${size}px ${FONT}`;
    let w = 0;
    for (const ch of text) w += c.measureText(ch).width;
    return w;
  }

  function labelSprite(key, text, { color = C.text, size = 22, sub = null, weight = 800, letter = 1.6 } = {}) {
    if (sprites.has(key)) return sprites.get(key);

    const scale = 2;
    const pad = 9;
    const subSize = size * 0.46;
    const mainW = measure(text, size, weight) + letter * Math.max(0, text.length - 1);
    const subW = sub ? measure(sub, subSize, 600) + letter * 0.6 * Math.max(0, sub.length - 1) : 0;
    const bodyW = Math.max(mainW, subW);
    const bodyH = size * 1.18 + (sub ? subSize * 1.5 : 0);
    const w = bodyW + pad * 2;
    const h = bodyH + pad * 2;

    const c = document.createElement("canvas");
    c.width = Math.ceil(w * scale);
    c.height = Math.ceil(h * scale);
    const g = c.getContext("2d");
    g.scale(scale, scale);

    /* Fondo tipo cartel, para que el rótulo se lea sobre cualquier edificio. */
    g.fillStyle = "rgba(18,8,31,0.74)";
    g.strokeStyle = alpha(color, 0.34);
    g.lineWidth = 1;
    roundRect(g, 0.5, 0.5, w - 1, h - 1, 8);
    g.fill();
    g.stroke();

    g.textBaseline = "top";
    g.font = `${weight} ${size}px ${FONT}`;
    g.shadowColor = color;
    g.shadowBlur = size * 0.6;
    g.fillStyle = color;
    let x = pad;
    for (const ch of text) {
      g.fillText(ch, x, pad);
      x += g.measureText(ch).width + letter;
    }
    g.shadowBlur = 0;

    if (sub) {
      g.font = `600 ${subSize}px ${FONT}`;
      g.fillStyle = "rgba(214,202,232,0.82)";
      let sx = pad;
      for (const ch of sub) {
        g.fillText(ch, sx, pad + size * 1.25);
        sx += g.measureText(ch).width + letter * 0.6;
      }
    }

    const sprite = { canvas: c, w, h };
    sprites.set(key, sprite);
    return sprite;
  }

  function drawSprite(sprite, x, y, scale = 1, rotation = 0) {
    const w = sprite.w * scale;
    const h = sprite.h * scale;
    if (rotation) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      ctx.drawImage(sprite.canvas, -w / 2, -h / 2, w, h);
      ctx.restore();
    } else {
      ctx.drawImage(sprite.canvas, x - w / 2, y - h / 2, w, h);
    }
  }

  /* --------------------------------- tamaño -------------------------------- */

  function resize(cssW, cssH, ratio) {
    dpr = Math.max(1, Math.min(2, ratio || 1));
    vw = Math.max(1, Math.round(cssW));
    vh = Math.max(1, Math.round(cssH));
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    canvas.style.width = vw + "px";
    canvas.style.height = vh + "px";

    const vignette = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.32, vw / 2, vh / 2, Math.max(vw, vh) * 0.78);
    vignette.addColorStop(0, "rgba(5,2,10,0)");
    vignette.addColorStop(1, "rgba(5,2,10,0.30)");

    const pinkGlow = ctx.createRadialGradient(vw * 0.14, vh * 0.05, 0, vw * 0.14, vh * 0.05, Math.max(vw, vh) * 0.42);
    pinkGlow.addColorStop(0, "rgba(255,46,147,0.16)");
    pinkGlow.addColorStop(1, "rgba(255,46,147,0)");

    const cyanGlow = ctx.createRadialGradient(vw * 0.92, vh * 0.75, 0, vw * 0.92, vh * 0.75, Math.max(vw, vh) * 0.45);
    cyanGlow.addColorStop(0, "rgba(0,229,255,0.12)");
    cyanGlow.addColorStop(1, "rgba(0,229,255,0)");

    glow = { vignette, pinkGlow, cyanGlow };
  }

  /* --------------------------------- helpers ------------------------------- */

  function visible(view, x, y, w, h, pad = 140) {
    const halfW = vw / (2 * view.zoom * view.horizontalScale) + pad;
    const halfH = vh / (2 * view.zoom) + pad;
    return x + w > view.x - halfW && x < view.x + halfW && y + h > view.y - halfH && y < view.y + halfH;
  }

  function roofColor(b) {
    return mix(C.roof, b.accent, 0.2 + b.lit * 0.16);
  }

  function traceIsland(size) {
    const s = size;
    ctx.beginPath();
    ctx.moveTo(s * 0.07, -s * 0.06);
    ctx.bezierCurveTo(s * 0.25, -s * 0.09, s * 0.31, -s * 0.055, s * 0.43, -s * 0.065);
    ctx.bezierCurveTo(s * 0.61, -s * 0.085, s * 0.78, -s * 0.09, s * 0.91, -s * 0.045);
    ctx.bezierCurveTo(s * 1.04, -s * 0.01, s * 1.055, s * 0.08, s * 1.03, s * 0.2);
    ctx.bezierCurveTo(s * 1.015, s * 0.31, s * 1.07, s * 0.37, s * 1.035, s * 0.48);
    ctx.bezierCurveTo(s * 1.01, s * 0.57, s * 1.065, s * 0.66, s * 1.035, s * 0.77);
    ctx.bezierCurveTo(s * 1.005, s * 0.91, s * 0.965, s * 1.005, s * 0.85, s * 1.035);
    ctx.bezierCurveTo(s * 0.74, s * 1.065, s * 0.68, s * 1.025, s * 0.59, s * 1.07);
    ctx.bezierCurveTo(s * 0.49, s * 1.12, s * 0.41, s * 1.105, s * 0.32, s * 1.07);
    ctx.bezierCurveTo(s * 0.22, s * 1.035, s * 0.12, s * 1.08, s * 0.035, s * 1.02);
    ctx.bezierCurveTo(-s * 0.055, s * 0.95, -s * 0.055, s * 0.85, -s * 0.025, s * 0.75);
    ctx.bezierCurveTo(s * 0.005, s * 0.65, -s * 0.07, s * 0.57, -s * 0.04, s * 0.47);
    ctx.bezierCurveTo(-s * 0.005, s * 0.35, -s * 0.06, s * 0.27, -s * 0.035, s * 0.17);
    ctx.bezierCurveTo(-s * 0.01, s * 0.075, -s * 0.035, s * 0.01, s * 0.07, -s * 0.06);
    ctx.closePath();
  }

  function drawOcean(view, world) {
    const halfW = vw / (2 * view.zoom * view.horizontalScale);
    const halfH = vh / (2 * view.zoom);
    const x = view.x - halfW - 260;
    const y = view.y - halfH - 260;
    const w = halfW * 2 + 520;
    const h = halfH * 2 + 520;
    const sea = ctx.createRadialGradient(
      world.size * 0.52, world.size * 0.48, world.size * 0.16,
      world.size * 0.52, world.size * 0.48, world.size * 1.7
    );
    sea.addColorStop(0, "#38B9C1");
    sea.addColorStop(0.38, "#188DAA");
    sea.addColorStop(1, "#105B83");
    ctx.fillStyle = sea;
    ctx.fillRect(x, y, w, h);

    const step = 210;
    const left = Math.floor(x / step);
    const right = Math.ceil((x + w) / step);
    const top = Math.floor(y / step);
    const bottom = Math.ceil((y + h) / step);
    ctx.lineWidth = 3;
    for (let row = top; row <= bottom; row++) {
      for (let col = left; col <= right; col++) {
        const seed = hash(81, col, row);
        if (seed < 0.62) continue;
        const px = col * step + 24 + seed * 92;
        const py = row * step + 30 + hash(19, row, col) * 110;
        ctx.strokeStyle = `rgba(197,248,230,${0.13 + seed * 0.12})`;
        ctx.beginPath();
        ctx.moveTo(px - 24, py);
        ctx.quadraticCurveTo(px, py - 8, px + 26, py);
        ctx.stroke();
      }
    }
  }

  function drawCoast(world) {
    traceIsland(world.size);
    ctx.fillStyle = "#3E9B67";
    ctx.fill();

    /* Arena clara, espuma menta y un filo turquesa recorren toda la costa. */
    ctx.strokeStyle = "#E9C37D";
    ctx.lineWidth = 138;
    ctx.stroke();
    ctx.strokeStyle = "rgba(189,250,228,0.92)";
    ctx.lineWidth = 17;
    ctx.stroke();
    ctx.strokeStyle = "rgba(0,229,255,0.44)";
    ctx.lineWidth = 5;
    ctx.setLineDash([34, 46]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawLighthouse(x, y, time) {
    const pulse = reduced ? 0.7 : 0.48 + Math.sin(time * 2.1) * 0.12;
    const beam = ctx.createRadialGradient(x, y - 18, 0, x, y - 18, 135);
    beam.addColorStop(0, `rgba(255,246,196,${pulse})`);
    beam.addColorStop(1, "rgba(255,246,196,0)");
    ctx.fillStyle = beam;
    ctx.fillRect(x - 140, y - 155, 280, 280);

    ctx.fillStyle = "rgba(9,35,49,0.32)";
    ctx.fillRect(x - 32, y + 35, 64, 11);
    ctx.fillStyle = "#F6E3C1";
    ctx.beginPath();
    ctx.moveTo(x - 22, y + 28);
    ctx.lineTo(x - 15, y - 23);
    ctx.lineTo(x + 15, y - 23);
    ctx.lineTo(x + 22, y + 28);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PALETTE.pink;
    ctx.fillRect(x - 17, y - 2, 34, 8);
    ctx.fillStyle = "#25314A";
    ctx.fillRect(x - 17, y - 25, 34, 10);
    ctx.fillStyle = "#FFE9A9";
    ctx.fillRect(x - 12, y - 21, 24, 4);
    ctx.fillStyle = "#FFF6D5";
    ctx.fillRect(x - 4, y + 7, 8, 14);
  }

  function drawPier(x, y) {
    ctx.fillStyle = "rgba(8,39,51,0.38)";
    ctx.fillRect(x + 12, y + 14, 390, 24);
    ctx.fillStyle = "#A9784E";
    ctx.fillRect(x, y, 390, 18);
    ctx.fillStyle = "#F0C77B";
    ctx.fillRect(x, y, 390, 4);
    ctx.fillStyle = "#654B3A";
    for (const post of [18, 104, 190, 276, 362]) {
      ctx.fillRect(x + post, y - 10, 8, 42);
    }
    ctx.fillStyle = "#EAF9D4";
    ctx.fillRect(x + 356, y - 20, 18, 16);
    ctx.fillStyle = PALETTE.pink;
    ctx.fillRect(x + 359, y - 17, 12, 7);
  }

  function drawCoastalLandmarks(world, view, time) {
    const s = world.size;
    drawLighthouse(-s * 0.015, s * 0.53, time);
    drawPier(s * 1.005, s * 0.43);

    const px = art();
    if (!px || !px.palmera) return;
    const palms = [
      [s * 0.19, -s * 0.035],
      [s * 0.36, -s * 0.05],
      [s * 0.66, -s * 0.045],
      [s * 0.89, s * 0.17],
      [s * 1.015, s * 0.31],
      [s * 1.02, s * 0.75],
      [s * 0.78, s * 1.015],
      [s * 0.55, s * 1.04],
      [s * 0.27, s * 1.02],
      [-s * 0.02, s * 0.82],
      [-s * 0.025, s * 0.26]
    ];
    for (const [x, y] of palms) {
      if (!visible(view, x - 70, y - 80, 140, 160, 60)) continue;
      px.draw(ctx, px.palmera, x, y + 42, 76, 86);
    }
  }

  function drawExpansionIslands(world, view) {
    const spots = [
      { x: -world.size * 0.12, y: world.size * 0.5, rx: 120, ry: 205 },
      { x: world.size * 1.12, y: world.size * 0.58, rx: 172, ry: 115 }
    ];
    spots.forEach((island, index) => {
      if (!visible(view, island.x - island.rx, island.y - island.ry, island.rx * 2, island.ry * 2, 30)) return;
      ctx.fillStyle = "rgba(4,46,67,0.2)";
      ctx.beginPath();
      ctx.ellipse(island.x + 18, island.y + 18, island.rx, island.ry, -0.16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#D9B775";
      ctx.beginPath();
      ctx.ellipse(island.x, island.y, island.rx, island.ry, -0.16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#398A61";
      ctx.beginPath();
      ctx.ellipse(island.x - 7, island.y - 7, island.rx * 0.7, island.ry * 0.64, -0.16, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = alpha(PALETTE.cyan, 0.62);
      ctx.lineWidth = 5;
      ctx.setLineDash([18, 15]);
      ctx.beginPath();
      ctx.ellipse(island.x, island.y, island.rx * 0.88, island.ry * 0.86, -0.16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      const beacon = island.y - island.ry * 0.72;
      ctx.fillStyle = "rgba(10,31,49,0.88)";
      roundRect(ctx, island.x - 28, beacon - 25, 56, 48, 12);
      ctx.fill();
      ctx.strokeStyle = alpha(PALETTE.orange, 0.8);
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = PALETTE.orange;
      ctx.font = "700 22px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(index === 0 ? "02" : "03", island.x, beacon - 1);
      ctx.textAlign = "start";
      ctx.textBaseline = "alphabetic";
    });
  }

  /* ------------------------------- piezas ---------------------------------- */

  function drawRoads(view, world, time) {
    const S = world.size;
    const bands = [
      { x: 0, y: 0, w: S, h: 120 },
      { x: 0, y: 660, w: S, h: 110 },
      { x: 0, y: 1310, w: S, h: 110 },
      { x: 0, y: 1960, w: S, h: 110 },
      { x: 0, y: 2610, w: S, h: 120 },
      { x: 0, y: 0, w: 120, h: S },
      { x: 660, y: 0, w: 110, h: S },
      { x: 1310, y: 0, w: 110, h: S },
      { x: 1960, y: 0, w: 110, h: S },
      { x: 2610, y: 0, w: 120, h: S }
    ];
    const pxRoads = art();
    for (const b of bands) {
      if (!visible(view, b.x, b.y, b.w, b.h)) continue;
      if (pxRoads) pxRoads.fill(ctx, "asfalto", b.x, b.y, b.w, b.h);
      ctx.fillStyle = alpha(C.road, pxRoads ? 0.30 : 1);
      ctx.fillRect(b.x, b.y, b.w, b.h);
    }

    /* Líneas centrales discontinuas + brillo tenue. */
    const pulse = reduced ? 0.12 : 0.1 + 0.035 * Math.sin(time * 0.9);
    ctx.strokeStyle = alpha(PALETTE.cyan, pulse);
    ctx.lineWidth = 3;
    ctx.setLineDash([30, 38]);
    ctx.beginPath();
    for (const y of [715, 1365, 2015]) {
      ctx.moveTo(0, y);
      ctx.lineTo(S, y);
    }
    for (const x of [715, 1365, 2015]) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, S);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    /* Borde de calzada. */
    ctx.strokeStyle = "rgba(255,255,255,0.055)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(120, 120, S - 240, S - 240);

    /* Pasos de cebra pixel en los cruces principales. */
    if (pxRoads) {
      for (const gx of [715, 1365, 2015]) {
        for (const gy of [715, 1365, 2015]) {
          if (!visible(view, gx - 130, gy - 130, 260, 260)) continue;
          pxRoads.fill(ctx, "cebra", gx - 108, gy - 55, 36, 110);
          pxRoads.fill(ctx, "cebra", gx + 72, gy - 55, 36, 110);
          pxRoads.fill(ctx, "cebra", gx - 55, gy - 108, 110, 36);
          pxRoads.fill(ctx, "cebra", gx - 55, gy + 72, 110, 36);
        }
      }
    }
  }

  function drawBlocks(view, world) {
    const pxBlocks = art();
    for (const block of world.blocks) {
      const r = block.rect;
      if (!visible(view, r.x, r.y, r.w, r.h)) continue;
      if (pxBlocks) pxBlocks.fill(ctx, "acera", r.x, r.y, r.w, r.h);
      ctx.fillStyle = pxBlocks ? alpha(C.sidewalk, 0.30) : C.sidewalk;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      if (pxBlocks) {
        pxBlocks.fill(ctx, block.zone === "clips" ? "plaza" : block.districtId === "vida" ? "grama" : "piso",
          r.x + 22, r.y + 22, r.w - 44, r.h - 44);
      }
      ctx.fillStyle = pxBlocks ? alpha(block.zone === "clips" ? PALETTE.pink : C.ground, 0.30) : C.ground;
      ctx.fillRect(r.x + 22, r.y + 22, r.w - 44, r.h - 44);
      ctx.fillStyle = alpha(block.accent, 0.075);
      ctx.fillRect(r.x + 22, r.y + 22, r.w - 44, r.h - 44);
      ctx.strokeStyle = alpha(block.accent, 0.22);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(r.x + 22.5, r.y + 22.5, r.w - 45, r.h - 45);
    }
  }

  function drawDecor(view, world, time) {
    for (const p of world.paths) {
      if (!visible(view, p.x, p.y, p.w, p.h)) continue;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.w, p.h);
    }

    /* Pasos peatonales: textura vial que se lee incluso con poco zoom. */
    ctx.fillStyle = "rgba(226,214,255,0.13)";
    for (const c of world.crosswalks) {
      if (!visible(view, c.x, c.y, c.w, c.h, 20)) continue;
      ctx.fillRect(c.x, c.y, c.w, c.h);
    }

    /* Plazas del Hub: jardín, anillos y fuente. */
    for (const plaza of world.plazas) {
      const pr = plaza.r;
      if (!visible(view, plaza.x - pr, plaza.y - pr, pr * 2, pr * 2)) continue;
      ctx.fillStyle = alpha(PALETTE.orange, 0.07);
      ctx.beginPath();
      ctx.arc(plaza.x, plaza.y, pr, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = alpha(PALETTE.orange, 0.28);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(plaza.x, plaza.y, pr * 0.94, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = alpha(PALETTE.cyan, 0.22);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(plaza.x, plaza.y, pr * 0.52, 0, Math.PI * 2);
      ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(plaza.x + Math.cos(ang) * pr * 0.52, plaza.y + Math.sin(ang) * pr * 0.52);
        ctx.lineTo(plaza.x + Math.cos(ang) * pr * 0.94, plaza.y + Math.sin(ang) * pr * 0.94);
        ctx.stroke();
      }
      ctx.fillStyle = alpha(PALETTE.cyan, 0.3);
      ctx.beginPath();
      ctx.arc(plaza.x, plaza.y, pr * 0.17, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const c of world.containers) {
      if (!visible(view, c.x, c.y, c.w, c.h)) continue;
      ctx.fillStyle = "rgba(10,5,18,0.55)";
      ctx.fillRect(c.x + 3, c.y + 4, c.w, c.h);
      ctx.fillStyle = c.color;
      ctx.fillRect(c.x, c.y, c.w, c.h);
      ctx.strokeStyle = "rgba(255,255,255,0.16)";
      ctx.lineWidth = 1;
      ctx.strokeRect(c.x + 0.5, c.y + 0.5, c.w - 1, c.h - 1);
    }

    for (const ring of world.rings) {
      if (!visible(view, ring.x - ring.r, ring.y - ring.r, ring.r * 2, ring.r * 2)) continue;
      ctx.strokeStyle = alpha(PALETTE.orange, 0.35);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = alpha(PALETTE.orange, 0.16);
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.r * 0.62, 0, Math.PI * 2);
      ctx.stroke();
    }

    for (const crane of world.cranes) {
      if (!visible(view, crane.x - 90, crane.y - crane.h, 180, crane.h + 40)) continue;
      ctx.strokeStyle = alpha(PALETTE.orange, 0.55);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(crane.x, crane.y);
      ctx.lineTo(crane.x, crane.y - crane.h);
      ctx.lineTo(crane.x - 74, crane.y - crane.h);
      ctx.stroke();
      ctx.strokeStyle = alpha(PALETTE.orange, 0.28);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(crane.x - 20, crane.y - crane.h + 8);
      ctx.lineTo(crane.x - 20, crane.y - crane.h + 46);
      ctx.stroke();
      ctx.fillStyle = alpha(PALETTE.orange, 0.7);
      ctx.fillRect(crane.x - 27, crane.y - crane.h + 46, 14, 10);
    }

    for (const t of world.trees) {
      if (!visible(view, t.x - t.r, t.y - t.r, t.r * 2, t.r * 2)) continue;
      ctx.fillStyle = alpha(t.tone, 0.1);
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r * 1.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = mix(C.ground, t.tone, 0.22);
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = alpha(t.tone, 0.5);
      ctx.lineWidth = 1.2;
      ctx.stroke();

      /* Palmas: cuatro frondas al sol. */
      if (view.zoom > 0.42) {
        ctx.strokeStyle = alpha(t.tone, 0.34);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const ang = (i / 4) * Math.PI * 2 + 0.5;
          ctx.moveTo(t.x, t.y);
          ctx.lineTo(
            t.x + Math.cos(ang) * t.r * 1.45,
            t.y + Math.sin(ang) * t.r * 1.45
          );
        }
        ctx.stroke();
      }
    }

    /* Luminarias: halo cálido + punto. */
    for (const l of world.lamps) {
      if (!visible(view, l.x - 14, l.y - 14, 28, 28, 40)) continue;
      ctx.fillStyle = alpha(PALETTE.orange, 0.16);
      ctx.beginPath();
      ctx.arc(l.x, l.y, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = alpha(PALETTE.orange, reduced ? 0.85 : 0.7 + 0.25 * Math.sin(time * 2 + l.x * 0.01));
      ctx.beginPath();
      ctx.arc(l.x, l.y, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawBuilding(b, view, time) {
    const off = 9 + b.depth * 22;
    const accent = b.accent;
    /* Un distrito con progreso real enciende más ventanas; de noche, además,
       todas brillan un poco más. Nunca se apaga lo que ya estaba encendido. */
    const level = districtLevelOf(b.districtId);
    const lit = Math.min(1, b.lit + level * 0.12);
    const boost = windowBoost();
    const litAlpha = (value) => Math.min(1, value * boost);

    /* Sombra proyectada. */
    ctx.fillStyle = "rgba(2,1,6,0.5)";
    ctx.fillRect(b.x + off + 3, b.y + off + 6, b.w, b.h);

    /* Cara lateral (da la sensación de altura). */
    ctx.fillStyle = C.side;
    ctx.fillRect(b.x + off, b.y + off, b.w, b.h);
    ctx.fillStyle = alpha(accent, 0.16);
    ctx.fillRect(b.x + off, b.y + off, b.w, b.h);

    /* Techo. */
    ctx.fillStyle = roofColor(b);
    ctx.fillRect(b.x, b.y, b.w, b.h);

    if (b.kind === "glass") {
      ctx.fillStyle = alpha(PALETTE.cyan, 0.1);
      ctx.fillRect(b.x, b.y, b.w, b.h);
    } else if (b.kind === "residential") {
      ctx.fillStyle = alpha(PALETTE.orange, 0.07);
      ctx.fillRect(b.x, b.y, b.w, b.h);
    } else if (b.kind === "tower") {
      ctx.fillStyle = alpha(accent, 0.12);
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = alpha(accent, 0.3);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(b.x + b.w * 0.18, b.y + b.h * 0.18, b.w * 0.64, b.h * 0.64);
    } else if (b.kind === "stall") {
      const stripeW = b.w / 6;
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = i % 2 === 0 ? alpha(accent, 0.5) : alpha(PALETTE.pink, 0.16);
        ctx.fillRect(b.x + i * stripeW, b.y, stripeW, Math.min(12, b.h * 0.18));
      }
    } else if (b.kind === "warehouse") {
      ctx.strokeStyle = "rgba(255,255,255,0.07)";
      ctx.lineWidth = 1;
      for (let yy = b.y + 10; yy < b.y + b.h - 4; yy += 13) {
        ctx.beginPath();
        ctx.moveTo(b.x + 4, yy);
        ctx.lineTo(b.x + b.w - 4, yy);
        ctx.stroke();
      }
    }

    /* Capa pixel: textura de techo con detalles e ícono del distrito. */
    const pxB = art();
    if (pxB && view.zoom > 0.4) pxB.roof(ctx, b, { lit });

    /* Ventanas iluminadas en la cara visible (derecha y abajo). */
    if (view.zoom > 0.55) {
      const warm = b.kind === "residential" || b.kind === "stall";
      const litColor = warm ? "#FFC46B" : mix(PALETTE.cyan, "#FFFFFF", 0.25);
      for (let i = 0; i < Math.max(2, b.h / 22); i++) {
        if (hash(b.seed, i, 3) > lit) continue;
        const yy = b.y + off + 8 + i * 18;
        if (yy > b.y + off + b.h - 10) break;
        ctx.fillStyle = alpha(litColor, litAlpha(0.55 + 0.35 * hash(b.seed, i, 11)));
        ctx.fillRect(b.x + off + b.w - 4, yy, 3, 6);
      }
      for (let i = 0; i < Math.max(2, b.w / 24); i++) {
        if (hash(b.seed, i, 5) > lit) continue;
        const xx = b.x + off + 8 + i * 22;
        if (xx > b.x + off + b.w - 12) break;
        ctx.fillStyle = alpha(litColor, litAlpha(0.5 + 0.35 * hash(b.seed, i, 13)));
        ctx.fillRect(xx, b.y + off + b.h - 4, 6, 3);
      }
    }

    /* Ventanas de azotea: se leen como luces incluso con zoom bajo. */
    if (view.zoom > 0.4 && (b.kind === "office" || b.kind === "glass" || b.kind === "tower") && b.w > 44 && b.h > 34) {
      const cols = Math.min(6, Math.max(2, Math.round(b.w / 32)));
      const rows = Math.min(5, Math.max(2, Math.round(b.h / 30)));
      const cw = b.w / cols;
      const ch = b.h / rows;
      const litColor = mix(PALETTE.cyan, "#FFFFFF", 0.35);
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          if (hash(b.seed, i, j) > lit * 0.72) continue;
          ctx.fillStyle = alpha(litColor, litAlpha(0.3 + 0.4 * hash(b.seed, i, j + 9)));
          const dot = view.zoom > 0.8 ? 5 : 4;
          ctx.fillRect(b.x + cw * (i + 0.42), b.y + ch * (j + 0.42), dot, dot);
        }
      }
    }

    /* Rejilla de vidrio. */
    if (b.kind === "glass" && view.zoom > 0.5) {
      ctx.strokeStyle = alpha(PALETTE.cyan, 0.16);
      ctx.lineWidth = 1;
      for (let xx = b.x + 12; xx < b.x + b.w - 6; xx += 22) {
        ctx.beginPath();
        ctx.moveTo(xx, b.y + 4);
        ctx.lineTo(xx, b.y + b.h - 4);
        ctx.stroke();
      }
      for (let yy = b.y + 12; yy < b.y + b.h - 6; yy += 22) {
        ctx.beginPath();
        ctx.moveTo(b.x + 4, yy);
        ctx.lineTo(b.x + b.w - 4, yy);
        ctx.stroke();
      }
    }

    /* Detalle de azotea. */
    if (view.zoom > 0.9) {
      ctx.fillStyle = "rgba(8,4,14,0.6)";
      ctx.fillRect(b.x + b.w * 0.62, b.y + b.h * 0.24, 12, 9);
      ctx.fillRect(b.x + b.w * 0.24, b.y + b.h * 0.58, 9, 7);
      ctx.strokeStyle = alpha(accent, 0.35);
      ctx.lineWidth = 1.4;
      const ax = b.x + b.w * 0.4;
      const ay = b.y + b.h * 0.36;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax, ay - 12);
      ctx.stroke();
      const blink = reduced ? 0.8 : 0.35 + 0.65 * Math.abs(Math.sin(time * 2.4 + b.seed));
      ctx.fillStyle = `rgba(255,80,110,${blink * 0.85})`;
      ctx.beginPath();
      ctx.arc(ax, ay - 13, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    /* Helipuerto de La Torre. */
    if (b.kind === "tower" && view.zoom > 0.5) {
      const hx = b.x + b.w * 0.52;
      const hy = b.y + b.h * 0.56;
      const hr = Math.min(b.w, b.h) * 0.17;
      ctx.strokeStyle = alpha(PALETTE.orange, 0.5);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(hx, hy, hr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = alpha(PALETTE.orange, 0.7);
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(hx - hr * 0.4, hy - hr * 0.45);
      ctx.lineTo(hx - hr * 0.4, hy + hr * 0.45);
      ctx.moveTo(hx + hr * 0.4, hy - hr * 0.45);
      ctx.lineTo(hx + hr * 0.4, hy + hr * 0.45);
      ctx.moveTo(hx - hr * 0.4, hy);
      ctx.lineTo(hx + hr * 0.4, hy);
      ctx.stroke();
    }

    /* Borde de neón + halo. */
    if (view.zoom > 0.5) {
      ctx.strokeStyle = alpha(accent, 0.16);
      ctx.lineWidth = 6;
      ctx.strokeRect(b.x, b.y, b.w, b.h);
    }
    ctx.strokeStyle = alpha(accent, 0.72);
    ctx.lineWidth = 1.3;
    ctx.strokeRect(b.x + 0.6, b.y + 0.6, b.w - 1.2, b.h - 1.2);

    /* Filo iluminado (norte y oeste): lee la altura y la luz de la ciudad. */
    ctx.strokeStyle = alpha(mix(accent, "#FFFFFF", 0.35), 0.5 + b.lit * 0.35);
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y + b.h);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(b.x + b.w, b.y);
    ctx.stroke();
  }

  function drawMonument(view, world, time) {
    const m = world.monument;
    if (!visible(view, m.x - 150, m.y - 150, 300, 300)) return;

    ctx.fillStyle = alpha(PALETTE.pink, 0.07);
    ctx.beginPath();
    ctx.arc(m.x, m.y, 132, 0, Math.PI * 2);
    ctx.fill();

    for (const [r, a, wdt] of [[132, 0.28, 2], [96, 0.5, 2.5], [64, 0.3, 1.5]]) {
      ctx.strokeStyle = alpha(PALETTE.pink, a);
      ctx.lineWidth = wdt;
      ctx.beginPath();
      ctx.arc(m.x, m.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.strokeStyle = alpha(PALETTE.cyan, 0.25);
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(m.x + Math.cos(ang) * 30, m.y + Math.sin(ang) * 30);
      ctx.lineTo(m.x + Math.cos(ang) * 96, m.y + Math.sin(ang) * 96);
      ctx.stroke();
    }

    /* Obelisco. */
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = "rgba(3,1,8,0.5)";
    ctx.fillRect(-16, -12, 38, 38);
    ctx.fillStyle = mix(C.roof, PALETTE.pink, 0.24);
    ctx.fillRect(-21, -21, 42, 42);
    ctx.strokeStyle = alpha(PALETTE.pink, 0.8);
    ctx.lineWidth = 2;
    ctx.strokeRect(-21, -21, 42, 42);
    ctx.fillStyle = alpha(PALETTE.cyan, reduced ? 0.85 : 0.6 + 0.35 * Math.sin(time * 1.6));
    ctx.fillRect(-6, -6, 12, 12);
    ctx.restore();
  }

  function drawTraffic(view, world, time) {
    const size = world.size;
    /* Tráfico limitado: con nivel 1 se dibuja la mitad de los vehículos. La
       reducción se aplica antes de tocar cualquier interacción (pág. 13). */
    const step = ambience && ambience.traffic === 1 ? 2 : 1;
    for (let index = 0; index < world.cars.length; index++) {
      if (step > 1 && index % step === 1) continue;
      const car = world.cars[index];
      let t = reduced ? car.t : (car.t + (time * car.speed * car.dir) / size) % 1;
      if (t < 0) t += 1;
      const pos = t * size;
      const x = car.axis === "h" ? pos : car.at + car.lane;
      const y = car.axis === "h" ? car.at + car.lane : pos;
      if (!visible(view, x - 14, y - 14, 28, 28, 60)) continue;

      const color = car.tone === "head" ? PALETTE.cyan : PALETTE.orange;
      ctx.fillStyle = alpha(color, 0.2);
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, Math.PI * 2);
      ctx.fill();

      /* Haz delantero tenue. */
      if (!reduced) {
        ctx.fillStyle = alpha(color, 0.09);
        if (car.axis === "h") {
          ctx.fillRect(car.dir > 0 ? x + 6 : x - 24, y - 3, 18, 6);
        } else {
          ctx.fillRect(x - 3, car.dir > 0 ? y + 6 : y - 24, 6, 18);
        }
      }

      ctx.fillStyle = alpha(color, 0.92);
      if (car.axis === "h") ctx.fillRect(x - 5, y - 1.8, 10, 3.6);
      else ctx.fillRect(x - 1.8, y - 5, 3.6, 10);

      /* Estela corta que marca la dirección. */
      ctx.strokeStyle = alpha(color, 0.26);
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (car.axis === "h") {
        ctx.moveTo(x, y);
        ctx.lineTo(x - car.dir * 15, y);
      } else {
        ctx.moveTo(x, y);
        ctx.lineTo(x, y - car.dir * 15);
      }
      ctx.stroke();
    }
  }

  /* Vida pixel: postes con halo en los cruces, vecinos caminando por las
     aceras y un carro pixel por la avenida sur. Todo determinista desde
     `time` (con reduced, time llega en 0 y la escena queda quieta). */
  /* La Zona Gamer ocupa su cuadrado entero (v0.18.2, dibujo de José):
     la escena ES el suelo del cuadrado y solo queda visible la acera
     café alrededor, con su letrero de entrada bien visible. */
  function drawClipsZone(view, world, time) {
    const R = clipsRect();
    if (!visible(view, R.x - 60, R.y - 60, R.w + 120, R.h + 120)) return;
    drawVenueSkin("gamer", R);
    drawVenueSign("ZONA GAMER", R, PALETTE.pink);
  }

  /* La escena del local cubre TODO el cuadrado interior de su manzana
     (recorte «cover» centrado): tapa suelo y edificios, y deja intacto
     el marco de acera color café de 22 unidades. */
  function drawVenueSkin(id, rect) {
    const image = venuePictures[id];
    if (!image || !image.complete || !image.naturalWidth) return;
    const x = rect.x + 22, y = rect.y + 22, w = rect.w - 44, h = rect.h - 44;
    const ir = image.naturalWidth / image.naturalHeight;
    const tr = w / h;
    let sx = 0, sy = 0, sw = image.naturalWidth, sh = image.naturalHeight;
    if (ir > tr) { sw = sh * tr; sx = (image.naturalWidth - sw) / 2; }
    else if (ir < tr) { sh = sw / tr; sy = (image.naturalHeight - sh) / 2; }
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(image, sx, sy, sw, sh, x, y, w, h);
    ctx.strokeStyle = "rgba(5,8,24,0.55)";
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
  }

  /* Letrero de entrada del local, al pie del cuadrado sobre la acera:
     tablero oscuro con borde de neón y brillo, nombre en letras
     espaciadas con núcleo claro (tubo de neón) y dos postes cortos.
     Tamaño parecido a la plaquita anterior, pero imposible de perder. */
  function drawVenueSign(name, rect, color) {
    const bw = 184, bh = 42;
    const bx = rect.x + (rect.w - bw) / 2;
    const by = rect.y + rect.h - 78;
    const cy = by + bh / 2;
    /* Postes y sombra sobre la acera. */
    ctx.fillStyle = "rgba(3,6,18,0.35)";
    ctx.beginPath();
    ctx.ellipse(bx + bw / 2, rect.y + rect.h - 6, bw * 0.44, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#131a38";
    ctx.fillRect(bx + 26, by + bh, 6, rect.y + rect.h - 10 - (by + bh));
    ctx.fillRect(bx + bw - 32, by + bh, 6, rect.y + rect.h - 10 - (by + bh));
    /* Tablero con borde de neón brillante. */
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 15;
    ctx.fillStyle = "rgba(6,9,26,0.96)";
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.4;
    ctx.strokeRect(bx, by, bw, bh);
    ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 3.5, by + 3.5, bw - 7, bh - 7);
    /* Tornillos de luz en las esquinas del tablero. */
    ctx.fillStyle = color;
    for (const dx of [11, bw - 11]) {
      ctx.beginPath();
      ctx.arc(bx + dx, cy, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    /* Nombre: halo de color + núcleo claro, como tubo de neón. */
    ctx.font = "800 19px 'Avenir Next', 'Segoe UI', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    try { ctx.letterSpacing = "3px"; } catch { /* navegadores sin letterSpacing */ }
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 11;
    ctx.fillStyle = color;
    ctx.fillText(name, bx + bw / 2, cy + 0.5, bw - 34);
    ctx.restore();
    ctx.fillStyle = mix(color, "#ffffff", 0.55);
    ctx.fillText(name, bx + bw / 2, cy + 0.5, bw - 34);
    try { ctx.letterSpacing = "0px"; } catch { /* idem */ }
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }

  function drawPixelLife(view, world, time) {
    const px = art();
    if (!px) return;
    const S = world.size;
    const step = reduced ? 0 : Math.floor(time * 5) % 2;

    /* Postes en las esquinas NE de los cruces principales. */
    for (const gx of [715, 1365, 2015]) {
      for (const gy of [715, 1365, 2015]) {
        const lx = gx + 66, ly = gy + 66;
        if (!visible(view, lx - 100, ly - 110, 200, 200)) continue;
        const pulse = reduced ? 0.16 : 0.15 + 0.03 * Math.sin(time * 1.3 + gx * 0.01 + gy * 0.017);
        px.glow(ctx, lx, ly - 54, 95, pulse);
        px.draw(ctx, px.poste, lx, ly, 26, 60);
      }
    }

    /* Árboles pixel sobre las posiciones de árboles del mundo. */
    for (const t of world.trees) {
      if (!visible(view, t.x - 45, t.y - 45, 90, 90)) continue;
      const sz = Math.max(32, t.r * 3);
      px.draw(ctx, px.arbol, t.x, t.y + sz * 0.32, sz, sz);
    }

    /* Vecinos con rutas deterministas (ida y vuelta). */
    const walk = (offset, speed, span) => {
      const ph = (((offset + time * speed) % (2 * span)) + 2 * span) % (2 * span);
      return { pos: ph < span ? ph : 2 * span - ph, dir: ph < span ? 1 : -1 };
    };
    const n1 = walk(0, 55, 2330);
    if (visible(view, 170 + n1.pos, 1250, 70, 70)) {
      px.draw(ctx, px.npcs[0].side[step], 200 + n1.pos, 1308, 42, 52, n1.dir < 0);
    }
    const n2 = walk(600, 42, 2330);
    if (visible(view, 615, 170 + n2.pos, 70, 70)) {
      const f2 = n2.dir > 0 ? px.npcs[1].front[step] : px.npcs[1].back[step];
      px.draw(ctx, f2, 650, 200 + n2.pos, 42, 52);
    }
    /* Vecino dando la vuelta al Monumento. */
    const ang = reduced ? 0.6 : time * 0.12;
    const mx = 1365 + Math.cos(ang) * 168, my = 1365 + Math.sin(ang) * 168;
    if (visible(view, mx - 45, my - 45, 90, 90)) {
      const c = Math.cos(ang), sn = Math.sin(ang);
      const f3 = Math.abs(c) > Math.abs(sn)
        ? px.npcs[0].side[step]
        : (sn > 0 ? px.npcs[0].front[step] : px.npcs[0].back[step]);
      px.draw(ctx, f3, mx, my + 26, 42, 52, c < 0);
    }

    /* El jugador: el avatar único con gorra, del tamaño de los vecinos,
       con su flecha «estás aquí» y la pastilla VOS sobre la cabeza. */
    if (playerVisible && playerState) {
      const st = playerState;
      if (visible(view, st.x - 60, st.y - 100, 120, 160)) {
        ctx.fillStyle = "rgba(6,10,18,0.30)";
        ctx.beginPath();
        ctx.ellipse(st.x, st.y + 24, 17, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        const pstep = st.moving && !reduced ? Math.floor(time * 7) % 2 : 0;
        const set = st.dir === "back" ? px.player.back : st.dir === "side" ? px.player.side : px.player.front;
        px.draw(ctx, set[pstep], st.x, st.y + 26, 42, 52, st.flip);
        const bob = reduced ? 0 : Math.sin(time * 3) * 3;
        if (px.vos) px.draw(ctx, px.vos, st.x, st.y - 36 + bob, 56, 25);
        ctx.fillStyle = PALETTE.cyan;
        ctx.beginPath();
        ctx.moveTo(st.x - 6, st.y - 34 + bob);
        ctx.lineTo(st.x + 6, st.y - 34 + bob);
        ctx.lineTo(st.x, st.y - 25 + bob);
        ctx.closePath();
        ctx.fill();
      }
    }

    /* Carro pixel por la avenida horizontal sur (centro y = 2015). */
    const cx = reduced ? 420 : ((time * 120) % (S + 320)) - 160;
    if (visible(view, cx - 75, 1975, 150, 90)) {
      px.draw(ctx, px.carro, cx, 2050, 120, 60);
    }

    /* Carro rosa vertical por la avenida oeste (centro x = 715). */
    const cy2 = reduced ? 620 : ((time * 95) % (S + 320)) - 160;
    if (visible(view, 640, cy2 - 80, 150, 160)) {
      px.draw(ctx, px.carroV, 715, cy2 + 62, 62, 124);
    }

    /* Moto con piloto por la avenida central (y = 1365), sentido contrario. */
    const mx2 = reduced ? 1800 : (S + 140) - ((time * 175) % (S + 280));
    if (visible(view, mx2 - 65, 1355, 130, 60)) {
      px.draw(ctx, px.motoPiloto, mx2, 1414, 88, 42, true);
    }

    /* Parqueados: carro rosa al este y una moto junto al parque. */
    if (visible(view, 2600, 830, 140, 160)) px.draw(ctx, px.carroV, 2670, 960, 62, 124);
    if (visible(view, 1450, 1400, 130, 80)) px.draw(ctx, px.moto, 1518, 1472, 58, 24);
  }

  /* Parque pixel central: grama y plaza alrededor del Monumento, con
     árboles, bancas y halos de luz. El Monumento se dibuja encima. */
  function drawPixelPark(view, world, time) {
    const px = art();
    if (!px) return;
    const cx = 1365, cy = 1365;
    if (!visible(view, cx - 210, cy - 210, 420, 420)) return;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, 182, 0, Math.PI * 2); ctx.clip();
    px.fill(ctx, "grama", cx - 182, cy - 182, 364, 364);
    ctx.fillStyle = "rgba(10,20,14,0.22)";
    ctx.fillRect(cx - 182, cy - 182, 364, 364);
    ctx.beginPath(); ctx.arc(cx, cy, 118, 0, Math.PI * 2); ctx.clip();
    px.fill(ctx, "plaza", cx - 118, cy - 118, 236, 236);
    ctx.fillStyle = "rgba(18,8,31,0.15)";
    ctx.fillRect(cx - 118, cy - 118, 236, 236);
    ctx.restore();
    ctx.strokeStyle = alpha(PALETTE.pink, 0.35);
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy, 182, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.39;
      px.draw(ctx, px.arbol, cx + Math.cos(a) * 150, cy + Math.sin(a) * 150 + 16, 52, 52);
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      px.draw(ctx, px.banca, cx + Math.cos(a) * 128, cy + Math.sin(a) * 128 + 6, 40, 17);
      const lx = cx + Math.cos(a + Math.PI / 4) * 166, ly = cy + Math.sin(a + Math.PI / 4) * 166;
      px.glow(ctx, lx, ly - 18, 58, 0.13);
    }
    if (!reduced) {
      for (let i = 0; i < 6; i++) {
        const a = time * 0.25 + (i / 6) * Math.PI * 2;
        ctx.fillStyle = alpha(i % 2 ? PALETTE.cyan : PALETTE.pink, 0.5);
        ctx.fillRect(cx + Math.cos(a) * 104 - 1.5, cy + Math.sin(a) * 104 - 1.5, 3, 3);
      }
    }
  }

  function drawGlitch(view, world, time) {
    if (!visible(view, 2070, 2070, 540, 540)) return;
    const base = 2070 + 28;
    ctx.save();
    ctx.beginPath();
    ctx.rect(2070, 2070, 540, 540);
    ctx.clip();
    for (const f of world.glitch) {
      const jitter = reduced ? 0 : Math.sin(time * 2.2 + f.phase) * 3;
      ctx.fillStyle = alpha(f.tone, reduced ? 0.18 : 0.12 + 0.16 * Math.abs(Math.sin(time * 1.4 + f.phase)));
      ctx.fillRect(f.x + jitter, f.y, f.w, f.h);
    }
    const scan = reduced ? 0.05 : 0.05 + 0.05 * Math.abs(Math.sin(time * 0.7));
    ctx.fillStyle = alpha(PALETTE.cyan, scan);
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(base, base + i * 34, 480, 2);
    }
    ctx.restore();
  }

  function drawSelection(view) {
    if (!selectedRect) return;
    const r = selectedRect;
    const z = view.zoom;
    ctx.fillStyle = alpha(selectedAccent, 0.035);
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = alpha(selectedAccent, 0.75);
    ctx.lineWidth = 2 / z;
    ctx.setLineDash([14 / z, 10 / z]);
    ctx.strokeRect(r.x + 9, r.y + 9, r.w - 18, r.h - 18);
    ctx.setLineDash([]);
  }

  /* --------------------------------- frame --------------------------------- */

  function draw(camera, world, time = 0) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = PALETTE.bg;
    ctx.fillRect(0, 0, vw, vh);
    if (glow) {
      ctx.fillStyle = glow.pinkGlow;
      ctx.fillRect(0, 0, vw, vh);
      ctx.fillStyle = glow.cyanGlow;
      ctx.fillRect(0, 0, vw, vh);
    }

    const state = camera.state;
    const view = {
      zoom: state.zoom,
      x: state.x,
      y: state.y,
      horizontalScale: state.horizontalScale || 1
    };
    ctx.save();
    ctx.translate(vw / 2, vh / 2);
    ctx.scale(state.zoom * view.horizontalScale, state.zoom);
    ctx.translate(-state.x, -state.y);

    drawOcean(view, world);
    drawCoast(world);
    drawCoastalLandmarks(world, view, time);
    drawExpansionIslands(world, view);

    /* Todo el damero vive dentro de la costa; las zonas futuras siguen libres. */
    ctx.save();
    traceIsland(world.size);
    ctx.clip();

    /* Base verde de Costa Neón bajo las avenidas y las manzanas. */
    if (visible(view, 0, 0, world.size, world.size, 300)) {
      ctx.fillStyle = C.base;
      ctx.fillRect(0, 0, world.size, world.size);
    }

    /* Tinte de distrito bajo las calles. */
    for (const d of DISTRICTS) {
      if (!visible(view, d.rect.x, d.rect.y, d.rect.w, d.rect.h)) continue;
      ctx.fillStyle = alpha(d.accent, 0.045);
      ctx.fillRect(d.rect.x, d.rect.y, d.rect.w, d.rect.h);
    }

    drawRoads(view, world, time);
    drawBlocks(view, world);
    drawDecor(view, world, time);

    for (const b of world.buildings) {
      if (!visible(view, b.x - 30, b.y - 30, b.w + 50, b.h + 50)) continue;
      drawBuilding(b, view, time);
    }

    drawGlitch(view, world, time);
    drawPixelPark(view, world, time);
    drawMonument(view, world, time);
    drawTraffic(view, world, time);
    drawClipsZone(view, world, time);
    /* El Brete vive en el cuadrado oeste de Empleo (el que José marcó):
       su escena cubre el cuadrado entero y el letrero va a la entrada. */
    const breteCell = cellRect(1, 3);
    if (visible(view, breteCell.x, breteCell.y, breteCell.w, breteCell.h)) {
      drawVenueSkin("brete", breteCell);
      drawVenueSign("EL BRETE", breteCell, PALETTE.cyan);
    }
    drawPixelLife(view, world, time);
    drawSelection(view);

    /* Luces de tráfico: pequeños destellos en cruces principales. */
    if (state.zoom > 0.5) {
      for (const gx of [715, 1365, 2015]) {
        for (const gy of [715, 1365, 2015]) {
          if (!visible(view, gx - 30, gy - 30, 60, 60, 40)) continue;
          const on = reduced ? 0.8 : 0.5 + 0.5 * Math.sin(time * 2 + gx * 0.01 + gy * 0.013);
          ctx.fillStyle = alpha(PALETTE.orange, 0.3 + on * 0.4);
          ctx.beginPath();
          ctx.arc(gx, gy, 3.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    ctx.restore();
    ctx.restore();

    /* Tinte de ambiente: sobre el mundo y DEBAJO de los rótulos, para que los
       nombres sigan legibles de noche. */
    if (ambience && ambience.tint && ambience.tint.alpha > 0) {
      ctx.fillStyle = alpha(ambience.tint.color, ambience.tint.alpha);
      ctx.fillRect(0, 0, vw, vh);
    }

    /* ---------------------------- capa de pantalla -------------------------- */
    if (glow) {
      ctx.fillStyle = glow.vignette;
      ctx.fillRect(0, 0, vw, vh);
    }
    drawScreenLabels(camera, world, time);
  }

  function drawScreenLabels(camera, world, time) {
    /* v0.18.1: sin rótulos flotantes. Los nombres de los locales viven en
       la plaquita de su cartel callejero (drawVenueBillboard), integrados
       al mundo y sutiles, como pidió José. El mapa vuelve a estar quieto. */
  }

  /* ---------------------------------- API ---------------------------------- */

  return {
    resize,
    draw,
    setCredit(value) {
      creditXP = value == null ? null : Number(value) || 0;
    },
    setPlayerVisible(value) {
      playerVisible = !!value;
    },
    setPlayer(state) {
      playerState = state || null;
    },
    setSelected(rect, accent = PALETTE.pink) {
      selectedRect = rect || null;
      selectedAccent = accent;
    },
    setReducedMotion(value) {
      reduced = !!value;
    },
    /** Perfil de `js/ambience.js`: solo lectura, nunca escribe progreso. */
    setAmbience(value) {
      ambience = value || null;
    },
    get reducedMotion() {
      return reduced;
    }
  };
}
