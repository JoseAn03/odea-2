/**
 * render.js — dibuja Costa Neón en Canvas 2D (vista cenital).
 *
 * Sin imágenes externas: todo es geometría, gradientes y texto. El detalle se
 * activa por niveles según el zoom (LOD) para que corra fluido en gama media.
 */

import { PALETTE, DISTRICTS, alpha, mix } from "../districts.js";
import { fmt } from "../format.js";

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

const C = {
  base: "#0F0618",
  ground: "#1B0D2F",
  sidewalk: "#2C1A45",
  road: "#150A24",
  roof: "#2A1442",
  side: "#0B0514",
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
  let selectedRect = null;
  let selectedAccent = PALETTE.pink;
  let reduced = false;
  let glow = null;

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
    const pad = 11;
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
    vignette.addColorStop(1, "rgba(5,2,10,0.62)");

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
    const halfW = vw / (2 * view.zoom) + pad;
    const halfH = vh / (2 * view.zoom) + pad;
    return x + w > view.x - halfW && x < view.x + halfW && y + h > view.y - halfH && y < view.y + halfH;
  }

  function roofColor(b) {
    return mix(C.roof, b.accent, 0.2 + b.lit * 0.16);
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
    ctx.fillStyle = C.road;
    for (const b of bands) {
      if (!visible(view, b.x, b.y, b.w, b.h)) continue;
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
  }

  function drawBlocks(view, world) {
    for (const block of world.blocks) {
      const r = block.rect;
      if (!visible(view, r.x, r.y, r.w, r.h)) continue;
      ctx.fillStyle = C.sidewalk;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = C.ground;
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

    /* Ventanas iluminadas en la cara visible (derecha y abajo). */
    if (view.zoom > 0.55) {
      const warm = b.kind === "residential" || b.kind === "stall";
      const litColor = warm ? "#FFC46B" : mix(PALETTE.cyan, "#FFFFFF", 0.25);
      for (let i = 0; i < Math.max(2, b.h / 22); i++) {
        if (hash(b.seed, i, 3) > b.lit) continue;
        const yy = b.y + off + 8 + i * 18;
        if (yy > b.y + off + b.h - 10) break;
        ctx.fillStyle = alpha(litColor, 0.55 + 0.35 * hash(b.seed, i, 11));
        ctx.fillRect(b.x + off + b.w - 4, yy, 3, 6);
      }
      for (let i = 0; i < Math.max(2, b.w / 24); i++) {
        if (hash(b.seed, i, 5) > b.lit) continue;
        const xx = b.x + off + 8 + i * 22;
        if (xx > b.x + off + b.w - 12) break;
        ctx.fillStyle = alpha(litColor, 0.5 + 0.35 * hash(b.seed, i, 13));
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
          if (hash(b.seed, i, j) > b.lit * 0.72) continue;
          ctx.fillStyle = alpha(litColor, 0.3 + 0.4 * hash(b.seed, i, j + 9));
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
    for (const car of world.cars) {
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
    const view = { zoom: state.zoom, x: state.x, y: state.y };
    ctx.save();
    ctx.translate(vw / 2, vh / 2);
    ctx.scale(state.zoom, state.zoom);
    ctx.translate(-state.x, -state.y);

    /* Base de la ciudad. */
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

    /* Rótulos de edificios (escala con el mapa). */
    if (state.zoom > 0.62) {
      for (const s of world.signs) {
        if (s.districtLabel) continue;
        if (!visible(view, s.x - 80, s.y - 20, 160, 40, 40)) continue;
        const sprite = labelSprite(`b:${s.text}:${s.color}:${s.size}`, s.text, {
          color: s.color,
          size: s.size,
          weight: 800,
          letter: 1
        });
        ctx.globalAlpha = flicker(s.x + s.y, time, reduced);
        ctx.drawImage(sprite.canvas, s.x - sprite.w / 2, s.y - sprite.h / 2, sprite.w, sprite.h);
        ctx.globalAlpha = 1;
      }
    }

    drawGlitch(view, world, time);
    drawMonument(view, world, time);
    drawTraffic(view, world, time);
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

    /* ---------------------------- capa de pantalla -------------------------- */
    if (glow) {
      ctx.fillStyle = glow.vignette;
      ctx.fillRect(0, 0, vw, vh);
    }
    drawScreenLabels(camera, world, time);
  }

  function drawScreenLabels(camera, world, time) {
    const z = camera.state.zoom;

    /* Rótulos de avenidas: solo con zoom suficiente. */
    if (z > 0.46) {
      for (const road of world.roadNames) {
        const t = road.labelAt;
        const wx = road.axis === "h" ? t * world.size : road.at;
        const wy = road.axis === "h" ? road.at : t * world.size;
        const p = camera.worldToScreen(wx, wy);
        if (p.x < -160 || p.x > vw + 160 || p.y < -60 || p.y > vh + 60) continue;
        const sprite = labelSprite(`road:${road.text}`, road.text, {
          color: PALETTE.cyan,
          size: 14,
          weight: 700,
          letter: 1.1
        });
        ctx.globalAlpha = Math.min(0.85, 0.5 + z * 0.3);
        drawSprite(sprite, p.x, p.y, 0.9, road.axis === "v" ? -Math.PI / 2 : 0);
        ctx.globalAlpha = 1;
      }
    }

    /* Rótulos de distrito. */
    const labelScale = Math.max(0.74, Math.min(1.12, z * 1.05));
    for (const d of DISTRICTS) {
      const p = camera.worldToScreen(d.label.x, d.label.y);
      if (p.x < -140 || p.x > vw + 140 || p.y < -60 || p.y > vh + 60) continue;
      const sprite = labelSprite(`d:${d.id}`, d.name.toUpperCase(), {
        color: d.accent,
        size: d.id === "rincon" ? 18 : 22,
        sub: d.subtitle,
        weight: 800
      });
      ctx.globalAlpha = 0.94;
      drawSprite(sprite, p.x, p.y, labelScale);
      ctx.globalAlpha = 1;
    }

    /* Crédito permanente junto al monumento. */
    if (creditXP != null && z > 0.42) {
      const m = world.monument;
      const p = camera.worldToScreen(m.x, m.y + m.r + 34);
      const sprite = labelSprite(`credit:${creditXP}`, `CRÉDITO · ${fmt(creditXP)} XP`, {
        color: PALETTE.cyan,
        size: 12,
        weight: 700,
        letter: 1
      });
      drawSprite(sprite, p.x, p.y, Math.max(0.8, Math.min(1.05, z)));
    }

    /* Marcador del jugador en El Hub. */
    if (playerVisible) {
      const p = camera.worldToScreen(world.playerStart.x, world.playerStart.y);
      const pulse = reduced ? 0 : Math.sin(time * 2.6) * 3;
      ctx.fillStyle = alpha(PALETTE.cyan, 0.09);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 17 + pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = alpha(PALETTE.cyan, 0.6);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 13, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#0B0416";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = PALETTE.cyan;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = PALETTE.cyan;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - 10);
      ctx.lineTo(p.x + 4.5, p.y - 2);
      ctx.lineTo(p.x - 4.5, p.y - 2);
      ctx.closePath();
      ctx.fill();
    }
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
    setSelected(rect, accent = PALETTE.pink) {
      selectedRect = rect || null;
      selectedAccent = accent;
    },
    setReducedMotion(value) {
      reduced = !!value;
    },
    get reducedMotion() {
      return reduced;
    }
  };
}
