/**
 * world.js — geometría determinista de Costa Neón (datos puros, sin DOM).
 *
 * Genera una sola vez: manzanas, edificios, árboles, luminarias, contenedores,
 * rótulos y tráfico inicial. El renderer solo dibuja; la cámara solo transforma.
 * Nada de esto toca el save: es puro dibujo.
 */

import { cellRect, cellsRect, allCells, WORLD_SIZE, GRID } from "./layout.js";
import { DISTRICTS, PALETTE, alpha, mix } from "../districts.js";

export const MONUMENT = { x: 1365, y: 1365, r: 96 };
export const PLAYER_START = { x: 1365, y: 1215 };
export const CREDIT_ANCHOR = { x: 1365, y: 1580 };

export const ROAD_NAMES = [
  { axis: "h", at: 715, text: "Ruta 3 · Heredia", labelAt: 0.2 },
  { axis: "h", at: 1365, text: "Av. Central", labelAt: 0.66 },
  { axis: "h", at: 2015, text: "Calle 5 · San José", labelAt: 0.4 },
  { axis: "v", at: 715, text: "Paseo Colón", labelAt: 0.3 },
  { axis: "v", at: 1365, text: "Av. 2", labelAt: 0.72 },
  { axis: "v", at: 2015, text: "Ruta 27 · Pacífico", labelAt: 0.46 },
  { axis: "h", at: GRID.margin / 2, text: "Circunvalación", labelAt: 0.5, ring: true }
];

const INNER_ROADS = ROAD_NAMES.filter((r) => !r.ring);

/* ------------------------------- aleatoriedad ------------------------------ */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* --------------------------------- helpers -------------------------------- */

function usable(rect, inset = 30) {
  return { x: rect.x + inset, y: rect.y + inset, w: rect.w - inset * 2, h: rect.h - inset * 2 };
}

function box(area, rel) {
  return {
    x: area.x + area.w * rel[0],
    y: area.y + area.h * rel[1],
    w: area.w * rel[2],
    h: area.h * rel[3]
  };
}

const STYLE_KIND = {
  tech: "glass",
  financial: "office",
  residential: "residential",
  tower: "tower",
  market: "stall",
  industrial: "warehouse",
  sagas: "office",
  glitch: "residential",
  hub: "office",
  filler: "office"
};

function makeBuilding(area, rel, accent, style, rand, opts = {}) {
  const b = box(area, rel);
  const depthBase =
    style === "tower" ? 0.95 : style === "financial" ? 0.7 : style === "tech" ? 0.4 : style === "residential" ? 0.1 : 0.3;
  return {
    x: b.x,
    y: b.y,
    w: b.w,
    h: b.h,
    depth: opts.depth != null ? opts.depth : depthBase * (0.7 + rand() * 0.5),
    kind: opts.kind || STYLE_KIND[style] || "office",
    accent: opts.accent || accent,
    lit: 0.35 + rand() * 0.55,
    seed: Math.floor(rand() * 0xffffff),
    districtId: opts.districtId || null,
    sign: opts.sign || null
  };
}

function treeAt(area, rx, ry, rand) {
  return {
    x: area.x + area.w * rx,
    y: area.y + area.h * ry,
    r: 7 + rand() * 8,
    tone: rand() > 0.5 ? PALETTE.cyan : PALETTE.orange
  };
}

/* ------------------------------ estilos de manzana ------------------------- */

function generateBlock(rect, district, rand, out) {
  const area = usable(rect);
  const accent = district ? district.accent : mixFiller(rand);
  const style = district ? district.style : "filler";
  const did = district ? district.id : null;

  const add = (rel, opts = {}) => {
    out.buildings.push(makeBuilding(area, rel, accent, style, rand, { ...opts, districtId: did }));
  };
  const tree = (rx, ry) => out.trees.push(treeAt(area, rx, ry, rand));

  switch (style) {
    case "tech": {
      add([0.04, 0.08, 0.42, 0.4], { depth: 0.36, sign: "TECNO" });
      add([0.5, 0.05, 0.44, 0.33], { depth: 0.5, kind: "glass" });
      add([0.06, 0.56, 0.44, 0.34], { depth: 0.18, kind: "glass" });
      add([0.56, 0.47, 0.36, 0.42], { depth: 0.26, kind: "office" });
      out.paths.push({ ...box(area, [0, 0.47, 1, 0.07]), color: alpha(accent, 0.16) });
      tree(0.09, 0.9); tree(0.95, 0.94); tree(0.97, 0.42);
      break;
    }
    case "financial": {
      add([0.05, 0.07, 0.3, 0.66], { depth: 0.95, kind: "office", sign: "BANCO" });
      add([0.4, 0.05, 0.26, 0.5], { depth: 0.8, kind: "glass" });
      add([0.7, 0.09, 0.26, 0.46], { depth: 0.66, kind: "office" });
      add([0.05, 0.79, 0.89, 0.13], { depth: 0.16, kind: "office" });
      break;
    }
    case "residential": {
      add([0.04, 0.05, 0.28, 0.22], { depth: 0.12, sign: "SODA" });
      add([0.36, 0.035, 0.26, 0.2], { depth: 0.09 });
      add([0.66, 0.07, 0.28, 0.24], { depth: 0.14 });
      add([0.06, 0.33, 0.24, 0.2], { depth: 0.1 });
      add([0.6, 0.35, 0.3, 0.22], { depth: 0.12, sign: "PULPERÍA" });
      add([0.1, 0.63, 0.34, 0.26], { depth: 0.11 });
      add([0.5, 0.63, 0.4, 0.24], { depth: 0.13 });
      out.paths.push({ ...box(area, [0, 0.575, 1, 0.045]), color: alpha(accent, 0.14) });
      for (let i = 0; i < 7; i++) tree(0.04 + rand() * 0.92, 0.52 + rand() * 0.42);
      break;
    }
    case "tower": {
      add([0.2, 0.12, 0.6, 0.6], { depth: 1, kind: "tower", sign: "CAPITAL" });
      add([0.1, 0.76, 0.8, 0.12], { depth: 0.2 });
      add([0.05, 0.05, 0.12, 0.09], { depth: 0.12 });
      add([0.83, 0.05, 0.12, 0.09], { depth: 0.12 });
      tree(0.06, 0.94); tree(0.94, 0.94);
      break;
    }
    case "market": {
      const cols = [0.04, 0.36, 0.68];
      const rows = [0.06, 0.4, 0.74];
      let n = 0;
      for (const y of rows) {
        for (const x of cols) {
          add([x, y, 0.24, 0.16], {
            depth: 0.05,
            kind: "stall",
            accent: n % 2 === 0 ? PALETTE.pink : PALETTE.orange,
            sign: n === 0 ? "MERCADO" : null
          });
          n++;
        }
      }
      add([0.04, 0.24, 0.2, 0.1], { depth: 0.22, kind: "warehouse" });
      add([0.74, 0.24, 0.22, 0.1], { depth: 0.2, kind: "warehouse" });
      break;
    }
    case "industrial": {
      add([0.04, 0.07, 0.5, 0.32], { depth: 0.3, kind: "warehouse", sign: "TALLER" });
      add([0.06, 0.47, 0.44, 0.28], { depth: 0.24, kind: "warehouse" });
      add([0.6, 0.06, 0.34, 0.26], { depth: 0.42, kind: "office" });
      out.containers.push(
        { ...box(area, [0.6, 0.42, 0.16, 0.09]), color: alpha(PALETTE.cyan, 0.55) },
        { ...box(area, [0.62, 0.56, 0.16, 0.09]), color: alpha(PALETTE.orange, 0.55) },
        { ...box(area, [0.8, 0.46, 0.14, 0.09]), color: alpha(PALETTE.pink, 0.5) },
        { ...box(area, [0.8, 0.6, 0.14, 0.09]), color: alpha(PALETTE.pink, 0.35) }
      );
      out.cranes.push({ x: area.x + area.w * 0.56, y: area.y + area.h * 0.84, h: 150 });
      out.paths.push({ ...box(area, [0.04, 0.86, 0.9, 0.06]), color: alpha(accent, 0.16) });
      break;
    }
    case "sagas": {
      add([0.05, 0.28, 0.32, 0.36], { depth: 0.46, kind: "office", sign: "SAGAS" });
      add([0.65, 0.07, 0.28, 0.36], { depth: 0.3, kind: "glass" });
      out.rings.push({ x: area.x + area.w * 0.66, y: area.y + area.h * 0.71, r: area.w * 0.15 });
      out.paths.push({ ...box(area, [0.05, 0.66, 0.5, 0.05]), color: alpha(accent, 0.18) });
      tree(0.12, 0.9); tree(0.32, 0.92); tree(0.92, 0.55); tree(0.9, 0.92);
      break;
    }
    case "glitch": {
      add([0.07, 0.1, 0.26, 0.2], { depth: 0.16, kind: "office", sign: "???" });
      add([0.63, 0.54, 0.24, 0.18], { depth: 0.1, kind: "residential" });
      for (let i = 0; i < 9; i++) {
        out.glitch.push({
          x: area.x + rand() * area.w,
          y: area.y + rand() * area.h,
          w: 8 + rand() * 40,
          h: 3 + rand() * 8,
          tone: rand() > 0.5 ? PALETTE.cyan : PALETTE.pink,
          phase: rand() * Math.PI * 2
        });
      }
      tree(0.9, 0.12);
      break;
    }
    case "hub": {
      /* Plaza Central: jardines y pabellones alrededor del monumento. */
      const cx = area.x + area.w / 2;
      const cy = area.y + area.h / 2;
      out.plazas.push({ x: cx, y: cy, r: area.w * 0.19 });
      out.paths.push({ ...box(area, [0, 0.47, 1, 0.06]), color: alpha(accent, 0.2) });
      out.paths.push({ ...box(area, [0.47, 0, 0.06, 1]), color: alpha(accent, 0.2) });
      add([0.03, 0.03, 0.19, 0.13], { depth: 0.14, kind: "office", sign: "CAFÉ" });
      add([0.78, 0.03, 0.19, 0.14], { depth: 0.18, kind: "glass" });
      add([0.03, 0.84, 0.19, 0.13], { depth: 0.12, kind: "office" });
      add([0.78, 0.83, 0.19, 0.14], { depth: 0.16, kind: "office", sign: "HOTEL" });
      for (let i = 0; i < 9; i++) {
        const ang = (i / 9) * Math.PI * 2;
        tree(
          0.5 + Math.cos(ang) * 0.36,
          0.5 + Math.sin(ang) * 0.36
        );
      }
      break;
    }
    default: {
      const names = ["HOTEL", "FARMACIA"];
      add([0.04, 0.07, 0.4, 0.34], { depth: 0.42, kind: "office", sign: names[Math.floor(rand() * names.length)] });
      add([0.5, 0.05, 0.44, 0.42], { depth: 0.55, kind: "glass" });
      add([0.07, 0.55, 0.4, 0.36], { depth: 0.2, kind: "office" });
      add([0.54, 0.57, 0.4, 0.34], { depth: 0.3, kind: "office" });
      break;
    }
  }
}

function mixFiller(rand) {
  /* Solo la paleta oficial; los tonos extra son mezclas de ella. */
  const tones = [
    PALETTE.cyan,
    PALETTE.pink,
    PALETTE.orange,
    mix(PALETTE.cyan, PALETTE.pink, 0.5),
    mix(PALETTE.pink, PALETTE.orange, 0.5)
  ];
  return tones[Math.floor(rand() * tones.length)];
}

/* --------------------------------- ciudad --------------------------------- */

export function buildWorld() {
  const rand = mulberry32(0xc057a2);
  const out = {
    size: WORLD_SIZE,
    blocks: [],
    buildings: [],
    trees: [],
    lamps: [],
    containers: [],
    paths: [],
    rings: [],
    plazas: [],
    crosswalks: [],
    glitch: [],
    cranes: [],
    signs: [],
    cars: [],
    monument: MONUMENT,
    playerStart: PLAYER_START,
    creditAnchor: CREDIT_ANCHOR,
    roadNames: ROAD_NAMES
  };

  const cellDistrict = {};
  for (const d of DISTRICTS) for (const [c, r] of d.cells) cellDistrict[`${c},${r}`] = d;

  for (const [col, row] of allCells()) {
    const rect = cellRect(col, row);
    const district = cellDistrict[`${col},${row}`] || null;
    const style = district ? district.style : "filler";
    const accent = district ? district.accent : mixFiller(rand);
    out.blocks.push({ rect, districtId: district ? district.id : null, style, accent });

    generateBlock(rect, district, rand, out);

    /* Luminarias en el borde de la manzana. */
    for (const t of [0.22, 0.55, 0.86]) {
      out.lamps.push({ x: rect.x + 16, y: rect.y + rect.h * t });
      out.lamps.push({ x: rect.x + rect.w - 16, y: rect.y + rect.h * t });
      out.lamps.push({ x: rect.x + rect.w * t, y: rect.y + 16 });
      out.lamps.push({ x: rect.x + rect.w * t, y: rect.y + rect.h - 16 });
    }
  }

  /* Rótulos de distrito: uno por distrito, sobre la manzana principal. */
  for (const d of DISTRICTS) {
    out.signs.push({
      x: d.label.x,
      y: d.label.y,
      text: d.name.toUpperCase(),
      sub: d.subtitle,
      color: d.accent,
      size: d.id === "rincon" ? 22 : 30,
      districtLabel: true,
      districtId: d.id
    });
  }

  /* Tráfico: puntos que recorren las avenidas interiores. */
  for (const road of INNER_ROADS) {
    const count = 5;
    for (let i = 0; i < count; i++) {
      const dir = i % 2 === 0 ? 1 : -1;
      out.cars.push({
        axis: road.axis,
        at: road.at,
        lane: dir > 0 ? 17 : -17,
        t: (i / count + rand() * 0.16) % 1,
        dir,
        speed: 46 + rand() * 62,
        tone: dir > 0 ? "head" : "tail"
      });
    }
  }

  /* Pasos peatonales en los nueve cruces principales. */
  for (const cx of [715, 1365, 2015]) {
    for (const cy of [715, 1365, 2015]) {
      for (let i = 0; i < 5; i++) {
        const off = -44 + i * 22;
        out.crosswalks.push({ x: cx + off, y: cy - 84, w: 12, h: 24 });
        out.crosswalks.push({ x: cx + off, y: cy + 60, w: 12, h: 24 });
        out.crosswalks.push({ x: cx - 84, y: cy + off, w: 24, h: 12 });
        out.crosswalks.push({ x: cx + 60, y: cy + off, w: 24, h: 12 });
      }
    }
  }

  /* Rótulos de neón sueltos en manzanas genéricas. */
  const fillerWords = ["24H", "CAFÉ", "TECNO", "PULPERÍA"];
  for (const b of out.buildings) {
    if (!b.sign) continue;
    out.signs.push({
      x: b.x + b.w / 2,
      y: b.y + 12,
      text: b.sign,
      color: b.accent,
      size: 13,
      buildingSign: true
    });
  }
  const fillerBuildings = out.buildings.filter((b) => b.districtId === null).slice(0, 2);
  fillerBuildings.forEach((b, i) => {
    out.signs.push({
      x: b.x + b.w / 2,
      y: b.y + b.h * 0.55,
      text: fillerWords[i % fillerWords.length],
      color: i === 0 ? PALETTE.cyan : PALETTE.orange,
      size: 11,
      buildingSign: true
    });
  });

  /* Algunas farolas extra en el anillo. */
  for (let i = 0; i < 14; i++) {
    const t = (i + 0.5) / 14;
    out.lamps.push({ x: WORLD_SIZE * t, y: GRID.margin / 2 });
    out.lamps.push({ x: GRID.margin / 2, y: WORLD_SIZE * t });
  }

  /* Orden de dibujo: de norte a sur (los edificios del sur tapan a los del norte). */
  out.buildings.sort((a, b) => a.y + a.h - (b.y + b.h));
  out.signs.sort((a, b) => (a.districtLabel ? 1 : 0) - (b.districtLabel ? 1 : 0));

  return out;
}

export { cellsRect };
