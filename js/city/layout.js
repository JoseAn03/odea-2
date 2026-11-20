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

/* La Zona CLIPS: una manzana libre (sin distrito) al noreste, junto al
   Distrito IA. Es el primer espacio que se ocupa en la ciudad. */
export const CLIPS_CELL = { col: 3, row: 0 };

/* La Zona de EVENTOS: la manzana (0,3), esquina suroeste, la única sin
   distrito. Ahí vive el estadio y el evento vigente (hoy el SJO Decision
   Lab de ODEA 1); el evento rota, la zona se queda. */
export const EVENTOS_CELL = { col: 0, row: 3 };

/* La ACADEMIA: la manzana oeste del Distrito IA (1,0), el distrito que ya
   guardaba la clave legacy «academia» y cuya descripción la nombra («Vidrio
   cian y la Academia»). Ahí vive la universidad y su campaña de
   certificaciones portada de ODEA 1. */
export const ACADEMIA_CELL = { col: 1, row: 0 };

/* La ZONA IA: la manzana este del Distrito IA (2,0). Ahí vive la base de
   operaciones de IA y su campaña «Construir agentes de IA con criterio
   profesional»: las 48 misiones del plan que José subió en PDF. Con esta
   manzana, el Distrito IA queda completo: Academia al oeste, Zona IA al
   este. */
export const ZONAIA_CELL = { col: 2, row: 0 };

/* SABIDURÍA PRÁCTICA: la manzana del Mirador de Sagas (0,0), esquina
   noroeste. Ahí vive el templo de la imagen aprobada — la «universidad
   de la mente» de José — y su campaña de las 60 misiones del PDF
   «Sabiduría para vivir con criterio». El letrero de la manzana dice
   «UCR DE LA MENTE», el nombre que José le puso a la zona. */
export const SABIDURIA_CELL = { col: 0, row: 0 };

/* EL MUNDO DE IAN: la manzana sureste del Hub (2,2), una de las cuatro
   centrales junto a la rotonda donde aparece el muñequito (pedido de
   José: cuadrito propio y cerca del avatar). Ahí vive el patio de juegos
   de la imagen aprobada — papá e Ian con la bola, la casa del árbol y el
   rincón de videojuegos — y su campaña de 54 misiones para Ian Daniel. */
export const MUNDOIAN_CELL = { col: 2, row: 2 };

export const WORLD_SIZE =
  GRID.margin * 2 + GRID.cols * GRID.block + (GRID.cols - 1) * GRID.road;

export const CELL_STEP = GRID.block + GRID.road;

/** Rectángulo de la Zona CLIPS. */
export function clipsRect() {
  return cellRect(CLIPS_CELL.col, CLIPS_CELL.row);
}

/** Rectángulo de la Zona de Eventos. */
export function eventosRect() {
  return cellRect(EVENTOS_CELL.col, EVENTOS_CELL.row);
}

/** Rectángulo de la Academia. */
export function academiaRect() {
  return cellRect(ACADEMIA_CELL.col, ACADEMIA_CELL.row);
}

/** Rectángulo de la Zona IA. */
export function zonaiaRect() {
  return cellRect(ZONAIA_CELL.col, ZONAIA_CELL.row);
}

/** Rectángulo de Sabiduría Práctica (la manzana del Mirador de Sagas). */
export function sabiduriaRect() {
  return cellRect(SABIDURIA_CELL.col, SABIDURIA_CELL.row);
}

/** Rectángulo del Mundo de Ian (la manzana sureste del Hub). */
export function mundoianRect() {
  return cellRect(MUNDOIAN_CELL.col, MUNDOIAN_CELL.row);
}

/* JARVIS (v0.38.0): el robotcito compañero vive DENTRO de la manzana de
   la Zona IA, anclado a su esquina noroeste para no tapar el rótulo
   «ZONA IA» (que va en la franja superior de la manzana) y dejar libre
   casi toda la imagen de la base de operaciones. Su rect de toque es
   generoso a propósito: en el teléfono tiene que ser fácil de atinar.
   El sprite se dibuja del mismo tamaño (140 de lado, ver render.js). */
export const JARVIS_SIZE = 140;

export function jarvisRect() {
  const z = zonaiaRect();
  return { x: z.x + 24, y: z.y + 150, w: JARVIS_SIZE, h: JARVIS_SIZE };
}

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
