/**
 * layout.js — grilla urbana de Costa Neón (datos puros, sin DOM).
 *
 * La ciudad es un damero de 4×4 manzanas separadas por avenidas. Las manzanas
 * se agrupan en distritos (ver js/districts.js). Todo se expresa en unidades
 * de mundo; la cámara se encarga de escalar.
 */

export const GRID = {
  margin: 120, // anillo perimetral
  block: 540,
  road: 110,
  cols: 4,
  rows: 4
};

export const WORLD_SIZE =
  GRID.margin * 2 + GRID.cols * GRID.block + (GRID.cols - 1) * GRID.road;

export const CELL_STEP = GRID.block + GRID.road;

/** Rectángulo de una manzana (col, row) con row 0 = norte. */
export function cellRect(col, row) {
  return {
    x: GRID.margin + col * CELL_STEP,
    y: GRID.margin + row * CELL_STEP,
    w: GRID.block,
    h: GRID.block
  };
}

/** Rectángulo que envuelve un conjunto de manzanas. */
export function cellsRect(cells) {
  const rects = cells.map(([c, r]) => cellRect(c, r));
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.w));
  const bottom = Math.max(...rects.map((r) => r.y + r.h));
  return { x, y, w: right - x, h: bottom - y };
}

export function rectCenter(rect) {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

export function pointInRect(rect, x, y) {
  return x >= rect.x && y >= rect.y && x <= rect.x + rect.w && y <= rect.y + rect.h;
}

/** Centros de las avenidas interiores y del anillo. */
export const ROAD_LINES = {
  vertical: [GRID.margin / 2, GRID.margin + GRID.block + GRID.road / 2,
    GRID.margin + 2 * CELL_STEP + GRID.road / 2,
    GRID.margin + 3 * CELL_STEP + GRID.road / 2,
    WORLD_SIZE - GRID.margin / 2],
  horizontal: [GRID.margin / 2, GRID.margin + GRID.block + GRID.road / 2,
    GRID.margin + 2 * CELL_STEP + GRID.road / 2,
    GRID.margin + 3 * CELL_STEP + GRID.road / 2,
    WORLD_SIZE - GRID.margin / 2]
};

/** Todas las manzanas del damero. */
export function allCells() {
  const cells = [];
  for (let row = 0; row < GRID.rows; row++) {
    for (let col = 0; col < GRID.cols; col++) cells.push([col, row]);
  }
  return cells;
}
