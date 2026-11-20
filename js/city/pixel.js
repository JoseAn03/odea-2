/**
 * pixel.js — capa de arte pixel para la ciudad (v3, mapa completo).
 *
 * Arte retro por cuadritos generado por código en tiempo de carga (sin
 * archivos de imagen): tiles de 32×32 para calles, aceras, techos, grama y
 * plaza; techos de edificios con detalles pixel (aires acondicionados,
 * tanques, tragaluces) e ícono pixel según el distrito; un parque pixel en
 * el centro, alrededor del Monumento; personajes de 16×20 con caminar de 2
 * cuadros; carros y moto con piloto bien dibujados. Es SOLO una capa visual
 * sobre el render existente: no toca datos, progreso ni lógica.
 *
 * El avatar del jugador es único: es el único personaje con gorra (azul).
 * Los NPC se generan sin gorra a propósito.
 *
 * Si no hay DOM (tests en Node), createPixelArt() devuelve null y el render
 * sigue exactamente como antes.
 */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ROSA = "#FF2E93";
const CIAN = "#00E5FF";

/* ------------------------------- sprites ------------------------------- */
const FRENTE_A = [
  "................", ".....CCCCCC.....", "....CCCCCCCC....", "....HHHHHHHH....",
  "....HSSSSSSH....", "....SSSSSSSS....", ".....SSSSSS.....", "....TTTTTTTT....",
  "...TTTTTTTTTT...", "...STTTTTTTTS...", "...STTTTTTTTS...", "....TTTTTTTT....",
  "....PPPPPPPP....", "....PPP..PPP....", "....PPP..PPP....", "....PPP..PPP....",
  "...ZZZ....ZZZ...", "...ZZZ....ZZZ...", "................", "................"
];
const FRENTE_B = [
  "................", ".....CCCCCC.....", "....CCCCCCCC....", "....HHHHHHHH....",
  "....HSSSSSSH....", "....SSSSSSSS....", ".....SSSSSS.....", "....TTTTTTTT....",
  "...TTTTTTTTTT...", "...STTTTTTTTS...", "...STTTTTTTTS...", "....TTTTTTTT....",
  "....PPPPPPPP....", ".....PPPPPP.....", ".....PPPPPP.....", ".....PPPPPP.....",
  ".....ZZZZZZ.....", ".....ZZZZZZ.....", "................", "................"
];
const ESPALDA_A = [
  "................", ".....CCCCCC.....", "....CCCCCCCC....", "....HHHHHHHH....",
  "....HHHHHHHH....", "....HHHHHHHH....", ".....HHHHHH.....", "....TTTTTTTT....",
  "...TTTTTTTTTT...", "...STTTTTTTTS...", "...STTTTTTTTS...", "....TTTTTTTT....",
  "....PPPPPPPP....", "....PPP..PPP....", "....PPP..PPP....", "....PPP..PPP....",
  "...ZZZ....ZZZ...", "...ZZZ....ZZZ...", "................", "................"
];
const ESPALDA_B = ESPALDA_A.map((r, i) =>
  i >= 13 ? r.replace("PPP..PPP", ".PPPPPP.").replace("ZZZ....ZZZ", ".ZZZZZZ.") : r);
const LADO_A = [
  "................", "......CCCCCC....", ".....CCCCCCC....", ".....HHHHHHH....",
  ".....HSSSSS.....", ".....SSSSS......", "......SSSS......", ".....TTTTTT.....",
  ".....TTTTTT.....", ".....TTTTTS.....", ".....TTTTT......", ".....TTTTTT.....",
  ".....PPPPPP.....", ".....PPP.PP.....", ".....PP...PP....", ".....PP...PP....",
  "....ZZZ...ZZZ...", "....ZZZ...ZZZ...", "................", "................"
];
const LADO_B = [
  "................", "......CCCCCC....", ".....CCCCCCC....", ".....HHHHHHH....",
  ".....HSSSSS.....", ".....SSSSS......", "......SSSS......", ".....TTTTTT.....",
  ".....TTTTTT.....", ".....TTTTTS.....", ".....TTTTT......", ".....TTTTTT.....",
  ".....PPPPPP.....", "......PPPP......", "......PPPP......", "......PPPP......",
  "......ZZZZ......", "......ZZZZ......", "................", "................"
];

const PAL_JUGADOR = { C: "#2255FF", H: "#2A1A2E", S: "#F2B183", T: "#00B8CC", P: "#23233A", Z: ROSA };
const PAL_NPC1 = { H: "#141018", S: "#C68658", T: ROSA, P: "#181828", Z: "#F0F0F5" };
const PAL_NPC2 = { H: "#5A3C28", S: "#FFCDA0", T: "#F0F0F5", P: "#00788C", Z: CIAN };

/* JARVIS (v0.38.0): el robotcito compañero de la Zona IA, en la misma
   rejilla 16×20 de los personajes: cuerpo redondo blanco flotante, cara
   de pantalla oscura con ojos cian, antena con luz rosada y propulsor
   cian. Las dos filas inferiores van vacías: flota sobre su ancla. */
const JARVIS_GRID = [
  ".......AA.......", ".......PP.......", ".......AA.......", "....WWWWWWWW....",
  "..WWWWWWWWWWWW..", "..WWWWWWWWWWWW..", "..WWFFFFFFFFWW..", "..WWFEEFFEEFWW..",
  "..WWFFFFFFFFWW..", "..WWFFFFFFFFWW..", "..WWFFFEEFFFWW..", "...WWWWWWWWWW...",
  "....WWWWWWWW....", ".....DDDDDD.....", "....DTTTTTTD....", ".....TTTTTT.....",
  "......TTTT......", ".......TT.......", "................", "................"
];
const PAL_JARVIS = { W: "#E8F4F8", D: "#39465C", F: "#0B1520", E: CIAN, P: ROSA, A: "#8A97A8", T: "#00B8CC" };

/* Íconos de distrito (8×8): X = color del distrito, o = blanco. */
const ICONOS = {
  hub: ["...XX...", "...XX...", "XXXXXXXX", ".XXXXXX.", "..XXXX..", ".XX..XX.", "XX....XX", "........"],
  ia: [".X.XX.X.", "........", ".XXXXXX.", ".X....X.", ".X.oo.X.", ".X....X.", ".XXXXXX.", ".X.XX.X."],
  empleo: ["..XXXX..", ".X....X.", "XXXXXXXX", "XX.oo.XX", "XXXXXXXX", "XXXXXXXX", "........", "........"],
  vida: [".XX..XX.", "XXXXXXXX", "XXXXXXXX", ".XXXXXX.", "..XXXX..", "...XX...", "........", "........"],
  torre: ["...XX...", "...XX...", "..XXXX..", "..XXXX..", ".XXXXXX.", ".XXXXXX.", "XXXXXXXX", "XXXXXXXX"],
  mercado: [".XXXXXX.", "X.XXXX.X", "X.X..X.X", "X.X..X.X", "X..XX..X", "X.XXXX.X", ".XXXXXX.", "........"],
  garaje: ["........", ".XXXXXX.", "XX.oo.XX", "XXXXXXXX", "X.XXXX.X", ".X....X.", "XX....XX", "........"],
  sagas: ["X..XX..X", "XX.XX.XX", "XXXXXXXX", "XXXXXXXX", ".XXXXXX.", "........", "........", "........"],
  anomalia: ["..XXXX..", ".X....X.", "XX.oo.XX", "XX.oo.XX", ".X....X.", "..XXXX..", "........", "........"]
};

function mkCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}

function spriteCanvas(rows, pal, gorra) {
  const c = mkCanvas(16, 20);
  const g = c.getContext("2d");
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const key = !gorra && ch === "C" ? "H" : ch;
      if (pal[key]) { g.fillStyle = pal[key]; g.fillRect(x, y, 1, 1); }
    });
  });
  return c;
}

/* -------------------------------- tiles -------------------------------- */
function tileCanvas(paint) {
  const c = mkCanvas(32, 32);
  paint(c.getContext("2d"));
  return c;
}

function speckle(g, base, colors, n, seed) {
  g.fillStyle = base; g.fillRect(0, 0, 32, 32);
  const rnd = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[Math.floor(rnd() * colors.length)];
    g.fillRect(Math.floor(rnd() * 32), Math.floor(rnd() * 32), 1, 1);
  }
}

function paintAsfalto(g, seed = 1) {
  speckle(g, "#343A52", ["#424B6B", "#2A3049", "#4E5A7D"], 92, seed);
}

const TILES = {
  asfalto: () => tileCanvas((g) => paintAsfalto(g, 1)),
  acera: () => tileCanvas((g) => {
    speckle(g, "#B7875B", ["#C59664", "#A97851", "#D0A778"], 46, 3);
    g.fillStyle = "#8B684D";
    g.fillRect(0, 0, 32, 1); g.fillRect(0, 0, 1, 32);
    g.fillStyle = "#D5AE7A";
    g.fillRect(15, 0, 1, 32); g.fillRect(0, 15, 32, 1);
  }),
  cebra: () => tileCanvas((g) => {
    paintAsfalto(g, 4);
    g.fillStyle = "#FFF0C8";
    for (const x of [3, 10, 17, 24]) g.fillRect(x, 2, 4, 28);
  }),
  grama: () => tileCanvas((g) => {
    speckle(g, "#2E7D43", ["#3FA34D", "#256B38", "#4CAF50"], 140, 5);
    g.fillStyle = ROSA; g.fillRect(7, 11, 1, 1); g.fillRect(25, 5, 1, 1);
    g.fillStyle = CIAN; g.fillRect(23, 25, 1, 1); g.fillRect(4, 27, 1, 1);
    g.fillStyle = "#FFD678"; g.fillRect(15, 19, 1, 1);
  }),
  plaza: () => tileCanvas((g) => {
    speckle(g, "#806184", ["#A0728F", "#694F78", "#A77282"], 52, 7);
    g.fillStyle = "#B58091"; g.fillRect(0, 0, 32, 1); g.fillRect(0, 0, 1, 32);
    g.fillStyle = "#72576F"; g.fillRect(15, 0, 1, 32); g.fillRect(0, 15, 32, 1);
    g.fillStyle = ROSA; g.fillRect(7, 7, 1, 1);
    g.fillStyle = CIAN; g.fillRect(23, 23, 1, 1);
  }),
  piso: () => tileCanvas((g) => {
    speckle(g, "#9A8A76", ["#A8977F", "#8A7967"], 50, 9);
    g.fillStyle = "#7E6E5B"; g.fillRect(0, 0, 32, 1); g.fillRect(0, 0, 1, 32);
    g.fillStyle = "#8A7967"; g.fillRect(15, 0, 1, 32); g.fillRect(0, 15, 32, 1);
  }),
  techo: () => tileCanvas((g) => {
    speckle(g, "#404967", ["#56617F", "#343D5A", "#6A597C"], 44, 12);
    g.fillStyle = "#30384F";
    g.fillRect(0, 0, 32, 1); g.fillRect(0, 0, 1, 32);
  })
};

/* ------------------------------ props ---------------------------------- */
function posteCanvas() {
  const c = mkCanvas(12, 28);
  const g = c.getContext("2d");
  g.fillStyle = "#343442"; g.fillRect(5, 8, 2, 20); g.fillRect(2, 6, 8, 2);
  g.fillStyle = "#FFD678"; g.beginPath(); g.ellipse(5.5, 3, 3.5, 3, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#FFF0BE"; g.beginPath(); g.ellipse(5.5, 3, 1.5, 1.5, 0, 0, Math.PI * 2); g.fill();
  return c;
}

function arbolCanvas() {
  const c = mkCanvas(28, 28);
  const g = c.getContext("2d");
  g.fillStyle = "#4A3424"; g.fillRect(13, 20, 3, 8);
  const blob = (x, y, r, col) => { g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
  blob(14, 11, 10, "#1E6B3A"); blob(8, 14, 6, "#2E8B47"); blob(20, 14, 6, "#2E8B47"); blob(14, 6, 6, "#35A355");
  const rnd = mulberry32(11);
  g.fillStyle = "#4CC36E";
  for (let i = 0; i < 14; i++) g.fillRect(4 + Math.floor(rnd() * 20), 2 + Math.floor(rnd() * 18), 1, 1);
  g.fillStyle = ROSA; g.fillRect(9, 9, 1, 1);
  g.fillStyle = CIAN; g.fillRect(19, 13, 1, 1);
  return c;
}

function palmeraCanvas() {
  const c = mkCanvas(32, 40);
  const g = c.getContext("2d");
  g.fillStyle = "#5A3A2A";
  for (let y = 10; y < 39; y += 4) {
    const bend = Math.floor((y - 10) / 8);
    g.fillRect(15 + bend, y, 4, 5);
  }
  g.fillStyle = "#8B593A";
  for (let y = 14; y < 36; y += 8) {
    const bend = Math.floor((y - 10) / 8);
    g.fillRect(15 + bend, y, 2, 4);
  }

  const leaves = [
    [14, 0, 5, 13, "#52B85B"],
    [5, 2, 12, 5, "#43A94E"],
    [17, 2, 12, 5, "#2F9650"],
    [1, 9, 14, 5, "#2B8A49"],
    [18, 9, 13, 5, "#55B857"],
    [4, 15, 12, 5, "#348B48"],
    [17, 15, 11, 5, "#297844"]
  ];
  for (const [x, y, w, h, color] of leaves) {
    g.fillStyle = color;
    g.fillRect(x, y, w, h);
    g.fillStyle = "rgba(202,255,142,0.35)";
    g.fillRect(x + 1, y + 1, Math.max(2, w - 4), 1);
  }
  g.fillStyle = "#FFE38A";
  g.fillRect(14, 9, 3, 3);
  g.fillRect(18, 11, 3, 3);
  return c;
}

function bancaCanvas() {
  const c = mkCanvas(24, 10);
  const g = c.getContext("2d");
  g.fillStyle = "#6E4A2C"; g.fillRect(0, 2, 24, 3);
  g.fillStyle = "#604026"; g.fillRect(0, 6, 24, 2);
  g.fillStyle = "#282834"; g.fillRect(2, 8, 3, 2); g.fillRect(19, 8, 3, 2);
  return c;
}

/* Pastilla «VOS» que flota sobre el jugador: así se sabe cuál es él. */
function vosCanvas() {
  const c = mkCanvas(56, 25);
  const g = c.getContext("2d");
  g.fillStyle = "rgba(11,4,22,0.88)";
  g.fillRect(0, 0, 56, 25);
  g.strokeStyle = CIAN;
  g.lineWidth = 2;
  g.strokeRect(1, 1, 54, 23);
  g.fillStyle = CIAN;
  g.font = "800 13px system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("VOS", 28, 13.5);
  return c;
}

/* ------------------------- props Zona CLIPS --------------------------- */

function arcadeCanvas() {
  const c = mkCanvas(28, 36);
  const g = c.getContext("2d");
  g.fillStyle = "#17102A"; g.fillRect(0, 0, 28, 36);
  g.fillStyle = ROSA; g.fillRect(0, 0, 3, 36); g.fillRect(25, 0, 3, 36);
  g.fillStyle = ROSA; g.fillRect(4, 1, 20, 4);
  g.fillStyle = CIAN; g.fillRect(6, 2, 3, 2); g.fillRect(13, 2, 3, 2); g.fillRect(20, 2, 2, 2);
  g.fillStyle = "#0B2B3A"; g.fillRect(5, 7, 18, 12);
  g.fillStyle = CIAN; g.fillRect(7, 9, 14, 8);
  g.fillStyle = ROSA; g.fillRect(9, 11, 5, 2); g.fillRect(15, 14, 5, 2);
  g.fillStyle = "#FFF6D5"; g.fillRect(18, 9, 3, 2);
  g.fillStyle = "#241743"; g.fillRect(4, 21, 20, 6);
  g.fillStyle = "#0D0919"; g.fillRect(8, 22, 2, 4);
  g.fillStyle = ROSA; g.fillRect(7, 21, 4, 2);
  g.fillStyle = CIAN; g.fillRect(17, 23, 4, 4);
  g.fillStyle = "#0D0919"; g.fillRect(0, 32, 28, 4);
  return c;
}

function sillaCanvas(trim) {
  const c = mkCanvas(26, 34);
  const g = c.getContext("2d");
  g.fillStyle = "#12101E"; g.fillRect(4, 2, 18, 21);
  g.fillStyle = trim; g.fillRect(2, 6, 3, 14); g.fillRect(21, 6, 3, 14);
  g.fillStyle = trim; g.fillRect(8, 4, 10, 5);
  g.fillStyle = "#0B0916"; g.fillRect(11, 5, 4, 3);
  g.fillStyle = "#1D1830"; g.fillRect(7, 11, 12, 10);
  g.fillStyle = trim; g.fillRect(12, 11, 2, 10);
  g.fillStyle = "#1D1830"; g.fillRect(4, 22, 18, 5);
  g.fillStyle = "#12101E"; g.fillRect(1, 19, 4, 8); g.fillRect(21, 19, 4, 8);
  g.fillStyle = trim; g.fillRect(1, 19, 4, 2); g.fillRect(21, 19, 4, 2);
  g.fillStyle = "#333340"; g.fillRect(12, 27, 3, 4); g.fillRect(6, 31, 14, 2);
  return c;
}

function pantallaCanvas() {
  const c = mkCanvas(58, 40);
  const g = c.getContext("2d");
  g.fillStyle = "#0B0B12"; g.fillRect(0, 0, 58, 31);
  g.fillStyle = CIAN; g.fillRect(3, 3, 52, 9);
  g.fillStyle = "#7A4FD0"; g.fillRect(3, 12, 52, 8);
  g.fillStyle = ROSA; g.fillRect(3, 20, 52, 8);
  g.fillStyle = "rgba(255,255,255,0.25)"; g.fillRect(3, 3, 52, 2);
  g.fillStyle = "#FFFFFF";
  g.fillRect(26, 10, 3, 11); g.fillRect(29, 12, 3, 7); g.fillRect(32, 14, 3, 3);
  g.fillStyle = "#0B0B12"; g.fillRect(26, 30, 6, 6); g.fillRect(18, 36, 22, 3);
  return c;
}

function mandoCanvas() {
  const c = mkCanvas(66, 46);
  const g = c.getContext("2d");
  g.fillStyle = "rgba(16,10,28,0.92)"; g.fillRect(4, 8, 58, 30);
  g.fillStyle = "rgba(255,46,147,0.5)"; g.fillRect(4, 8, 58, 3);
  g.fillStyle = "#3A3352"; g.fillRect(14, 15, 5, 17); g.fillRect(8, 21, 17, 5);
  g.fillStyle = "#565064"; g.fillRect(15, 16, 3, 15); g.fillRect(9, 22, 15, 3);
  g.fillStyle = ROSA; g.fillRect(47, 14, 6, 6);
  g.fillStyle = CIAN; g.fillRect(55, 21, 6, 6);
  g.fillStyle = "#FFD23F"; g.fillRect(47, 28, 6, 6);
  g.fillStyle = "#4CAF50"; g.fillRect(39, 21, 6, 6);
  g.fillStyle = "#3A3352"; g.fillRect(29, 22, 8, 3);
  return c;
}

function tiendaCanvas() {
  const c = mkCanvas(68, 46);
  const g = c.getContext("2d");
  for (let x = 0, i = 0; x < 68; x += 8, i++) {
    g.fillStyle = i % 2 === 0 ? ROSA : "#F3E9D2";
    g.fillRect(x, 2, 8, 10);
  }
  g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(0, 11, 68, 2);
  g.fillStyle = "#1A1428"; g.fillRect(0, 13, 68, 33);
  g.fillStyle = "#0D0919"; g.fillRect(0, 13, 68, 5);
  g.fillStyle = ROSA; g.fillRect(4, 15, 3, 2); g.fillRect(14, 15, 3, 2); g.fillRect(24, 15, 3, 2);
  g.fillStyle = CIAN; g.fillRect(34, 15, 3, 2); g.fillRect(44, 15, 3, 2); g.fillRect(54, 15, 3, 2);
  g.fillStyle = "#0E2A3A"; g.fillRect(5, 21, 36, 17);
  g.fillStyle = "rgba(0,229,255,0.35)"; g.fillRect(5, 21, 36, 3);
  g.fillStyle = "#0B0B12"; g.fillRect(15, 26, 16, 8);
  g.fillStyle = ROSA; g.fillRect(27, 28, 3, 3);
  g.fillStyle = CIAN; g.fillRect(17, 28, 3, 3);
  g.fillStyle = "#241743"; g.fillRect(47, 21, 14, 25);
  g.fillStyle = CIAN; g.fillRect(57, 32, 2, 2);
  return c;
}

function carroCanvas(color, techo, luz, sombra) {
  const c = mkCanvas(48, 24);
  const g = c.getContext("2d");
  g.fillStyle = "#101016";
  g.fillRect(7, 2, 5, 5); g.fillRect(7, 17, 5, 5); g.fillRect(36, 2, 5, 5); g.fillRect(36, 17, 5, 5);
  g.fillStyle = color; g.fillRect(2, 3, 44, 18);
  g.fillStyle = luz; g.fillRect(2, 3, 44, 3);
  g.fillStyle = sombra; g.fillRect(2, 17, 44, 4);
  g.fillStyle = techo; g.fillRect(15, 6, 17, 12);
  g.fillStyle = "#1E283C"; g.fillRect(12, 6, 3, 12); g.fillRect(32, 6, 3, 12);
  g.fillStyle = "rgba(255,255,255,0.25)"; g.fillRect(12, 6, 3, 3);
  g.fillStyle = "#FFF0B4"; g.fillRect(45, 6, 2, 2); g.fillRect(45, 16, 2, 2);
  g.fillStyle = "#FF3C3C"; g.fillRect(1, 6, 2, 2); g.fillRect(1, 16, 2, 2);
  return c;
}

function rotar90(canvas) {
  const c = mkCanvas(canvas.height, canvas.width);
  const g = c.getContext("2d");
  g.translate(canvas.height, 0);
  g.rotate(Math.PI / 2);
  g.drawImage(canvas, 0, 0);
  return c;
}

function motoPilotoCanvas() {
  const c = mkCanvas(30, 14);
  const g = c.getContext("2d");
  g.fillStyle = "#0E0E14"; g.fillRect(2, 9, 6, 4); g.fillRect(22, 9, 6, 4);
  g.fillStyle = "#C81E3C"; g.fillRect(4, 8, 22, 3); g.fillRect(11, 6, 7, 3);
  g.fillStyle = "#23233A"; g.fillRect(11, 6, 6, 3);
  g.fillStyle = "#2255FF"; g.fillRect(12, 2, 7, 5);
  g.fillRect(18, 4, 5, 2);
  g.fillStyle = "#F0F0F5"; g.beginPath(); g.arc(16, 2, 3, 0, Math.PI * 2); g.fill();
  g.fillStyle = CIAN; g.fillRect(14, 1, 4, 1);
  g.fillStyle = "#FFF0B4"; g.fillRect(27, 6, 2, 2);
  return c;
}

function motoCanvas() {
  const c = mkCanvas(26, 10);
  const g = c.getContext("2d");
  g.fillStyle = "#0E0E14"; g.fillRect(1, 3, 5, 4); g.fillRect(20, 3, 5, 4);
  g.fillStyle = "#C81E3C"; g.fillRect(4, 4, 17, 2);
  g.fillStyle = "#1E1E2C"; g.fillRect(8, 3, 6, 3);
  g.fillStyle = "#DCDCE6"; g.fillRect(24, 2, 1, 1); g.fillRect(24, 7, 1, 1);
  return c;
}

/* --------------------- Tienda: atuendos y vehículos ----------------------
 * Constructores sueltos (sin crear todo el set de arte) para que la Tienda
 * pinte las vistas previas y el render arme los sprites del jugador.
 * El carro de la Tienda sigue el dibujo aprobado por José en la vista
 * previa del catálogo (variantes por tamaño, techo, franja y alerón). */
function carroTiendaCanvas(spec) {
  const w = spec.w || 48, h = spec.h || 24;
  const c = mkCanvas(w, h);
  const g = c.getContext("2d");
  const wr = spec.wheel || 5;
  g.fillStyle = "#101016";
  g.fillRect(7, 2, wr, wr); g.fillRect(7, h - 2 - wr, wr, wr);
  g.fillRect(w - 7 - wr, 2, wr, wr); g.fillRect(w - 7 - wr, h - 2 - wr, wr, wr);
  g.fillStyle = spec.color; g.fillRect(2, 3, w - 4, h - 6);
  g.fillStyle = spec.luz; g.fillRect(2, 3, w - 4, 3);
  g.fillStyle = spec.sombra; g.fillRect(2, h - 5, w - 4, 2);
  if (spec.stripe) { g.fillStyle = spec.stripe; g.fillRect(2, Math.floor(h / 2) - 1, w - 4, 2); }
  const rw = spec.roofW || 17, rh = spec.roofH || (h - 12);
  g.fillStyle = spec.techo; g.fillRect(15, (h - rh) / 2, rw, rh);
  g.fillStyle = "#1E283C";
  g.fillRect(12, (h - rh) / 2, 3, rh); g.fillRect(15 + rw, (h - rh) / 2, 3, rh);
  g.fillStyle = "rgba(255,255,255,0.25)"; g.fillRect(12, (h - rh) / 2, 3, 3);
  if (spec.rails) {
    g.fillStyle = "#0C0C12";
    g.fillRect(17, (h - rh) / 2 + 1, rw - 4, 1); g.fillRect(17, (h - rh) / 2 + rh - 2, rw - 4, 1);
  }
  if (spec.spoiler) { g.fillStyle = spec.spoiler; g.fillRect(0, 2, 3, h - 4); }
  g.fillStyle = "#FFF0B4"; g.fillRect(w - 3, 5, 2, 2); g.fillRect(w - 3, h - 7, 2, 2);
  g.fillStyle = "#FF3C3C"; g.fillRect(1, 5, 2, 2); g.fillRect(1, h - 7, 2, 2);
  return c;
}

/** Sprite frontal de un atuendo (para la Tienda y el Personaje). */
export function outfitSprite(pal, gorra) {
  if (typeof document === "undefined") return null;
  return spriteCanvas(FRENTE_A, pal, gorra);
}

/** Sprite lateral (horizontal) de un vehículo de la Tienda. */
export function vehicleSprite(spec) {
  if (typeof document === "undefined" || !spec) return null;
  return spec.type === "moto" ? motoPilotoCanvas() : carroTiendaCanvas(spec);
}

/* --------------------------------- API ---------------------------------- */
export function createPixelArt() {
  if (typeof document === "undefined") return null;
  const tiles = {};
  for (const [name, make] of Object.entries(TILES)) tiles[name] = make();
  const frames = (pal, gorra) => ({
    front: [spriteCanvas(FRENTE_A, pal, gorra), spriteCanvas(FRENTE_B, pal, gorra)],
    back: [spriteCanvas(ESPALDA_A, pal, gorra), spriteCanvas(ESPALDA_B, pal, gorra)],
    side: [spriteCanvas(LADO_A, pal, gorra), spriteCanvas(LADO_B, pal, gorra)]
  });
  const carroCian = carroCanvas("#0096B4", "#006E8C", "#2AB8D8", "#00708C");
  const carroRosa = carroCanvas("#C8286E", "#96205A", "#E85A94", "#9E2050");
  const iconCache = new Map();
  const patterns = new WeakMap();

  const api = {
    tiles,
    player: frames(PAL_JUGADOR, true),
    npcs: [frames(PAL_NPC1, false), frames(PAL_NPC2, false)],
    poste: posteCanvas(),
    arbol: arbolCanvas(),
    palmera: palmeraCanvas(),
    vos: vosCanvas(),
    arcade: arcadeCanvas(),
    sillaRosa: sillaCanvas(ROSA),
    sillaCian: sillaCanvas(CIAN),
    pantalla: pantallaCanvas(),
    mando: mandoCanvas(),
    tienda: tiendaCanvas(),
    banca: bancaCanvas(),
    jarvis: spriteCanvas(JARVIS_GRID, PAL_JARVIS, false),
    carro: carroCian,
    carroRosa,
    carroV: rotar90(carroRosa),
    motoPiloto: motoPilotoCanvas(),
    moto: motoCanvas(),
    /* Tienda: cuadros del jugador con cualquier paleta (atuendos) y los
       sprites de un vehículo en horizontal y vertical. */
    characterFrames: (pal, gorra) => frames(pal, gorra),
    shopVehicle: (spec) => {
      const side = vehicleSprite(spec);
      return side ? { side, vert: rotar90(side) } : null;
    },
    /** Rellena un rectángulo con un tile repetido, alineado al origen. */
    fill(ctx, name, x, y, w, h) {
      let per = patterns.get(ctx);
      if (!per) { per = {}; patterns.set(ctx, per); }
      if (!per[name]) per[name] = ctx.createPattern(tiles[name], "repeat");
      ctx.fillStyle = per[name];
      ctx.fillRect(x, y, w, h);
    },
    /** Dibuja un sprite centrado en los pies (x, yBase), con espejo opcional. */
    draw(ctx, canvas, x, yBase, w, h, flip = false) {
      ctx.save();
      if (flip) { ctx.translate(x, 0); ctx.scale(-1, 1); ctx.drawImage(canvas, -w / 2, yBase - h, w, h); }
      else ctx.drawImage(canvas, x - w / 2, yBase - h, w, h);
      ctx.restore();
    },
    /** Halo cálido de poste (gradiente radial). */
    glow(ctx, x, y, r, alpha) {
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(255,198,90,${alpha})`);
      grad.addColorStop(1, "rgba(255,198,90,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    },
    /** Ícono pixel del distrito, cacheado por id + color. */
    iconCanvas(districtId, accent) {
      const key = `${districtId}:${accent}`;
      if (iconCache.has(key)) return iconCache.get(key);
      const map = ICONOS[districtId];
      if (!map) { iconCache.set(key, null); return null; }
      const c = mkCanvas(8, 8);
      const g = c.getContext("2d");
      map.forEach((row, y) => {
        [...row].forEach((ch, x) => {
          if (ch === "X") { g.fillStyle = accent; g.fillRect(x, y, 1, 1); }
          else if (ch === "o") { g.fillStyle = "#FFFFFF"; g.fillRect(x, y, 1, 1); }
        });
      });
      iconCache.set(key, c);
      return c;
    },
    /**
     * Techo pixel de un edificio: textura + detalles deterministas por su
     * posición (aires acondicionados, tanques, tragaluces) y el ícono del
     * distrito en la esquina. Se recorta al rectángulo del techo.
     */
    roof(ctx, b, opts = {}) {
      const lit = Math.max(0, Math.min(1, Number(opts.lit ?? 0.4)));
      const rnd = mulberry32((b.x * 73 + b.y * 149) >>> 0);
      const off = 9 + (b.depth || 0) * 22;
      const esVidrio = b.kind === "glass" || b.kind === "tower";
      const winLit = (r) => r < 0.22 + lit * 0.55;
      const win = (x, y, w, h, r) => {
        if (winLit(r)) {
          ctx.fillStyle = esVidrio ? "#A8ECFF" : "#FFD98A";
          ctx.fillRect(x, y, w, h);
          ctx.fillStyle = "rgba(255,255,255,0.5)";
          ctx.fillRect(x, y, w, 2);
        } else {
          ctx.fillStyle = "#26374E";
          ctx.fillRect(x, y, w, h);
          ctx.fillStyle = "rgba(255,255,255,0.22)";
          ctx.fillRect(x, y, w, 2);
        }
      };

      /* Fachada pixel en las caras visibles (abajo y derecha): color
         pastel por edificio, ventanas en rejilla y puerta. */
      const FACHADAS = ["#E8A37C", "#EAD9B0", "#A8C8A0", "#9FB8D8", "#E5A0B4", "#D8B98A", "#B0A8D8", "#F0C8A0"];
      const fBase = esVidrio ? "#2C4A73" : FACHADAS[Math.floor(rnd() * FACHADAS.length)];
      const fy = b.y + b.h, fx = b.x + off;
      ctx.fillStyle = fBase;
      ctx.fillRect(fx, fy, b.w, off);
      ctx.fillRect(b.x + b.w, b.y + off, off, b.h);
      ctx.fillStyle = "rgba(0,0,0,0.16)";
      ctx.fillRect(fx, fy, b.w, 3);
      const rows = off >= 34 ? 2 : 1;
      for (let row = 0; row < rows; row++) {
        const wy = fy + 6 + row * 14;
        if (wy + 8 > fy + off - 2) break;
        for (let wx = fx + 7; wx + 11 <= fx + b.w - 4; wx += 20) win(wx, wy, 11, 8, rnd());
      }
      const doorH = Math.min(off - 2, 20);
      const doorX = fx + 10 + Math.floor(rnd() * Math.max(1, b.w - 40));
      ctx.fillStyle = "#2A1E33";
      ctx.fillRect(doorX, fy + off - doorH, 12, doorH);
      for (let wy = b.y + off + 7; wy + 11 <= b.y + b.h + off - 4; wy += 20) {
        win(b.x + b.w + Math.floor((off - 8) / 2), wy, 8, 11, rnd());
      }
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fillRect(fx, fy + off - 3, b.w + off, 3);

      /* Techo pixel según el tipo de edificio. */
      ctx.save();
      ctx.beginPath();
      ctx.rect(b.x, b.y, b.w, b.h);
      ctx.clip();
      if (esVidrio) {
        ctx.fillStyle = "#1F3A5F";
        ctx.fillRect(b.x, b.y, b.w, b.h);
        const hx = b.x + b.w * 0.52, hy = b.y + b.h * 0.56;
        const hr = Math.min(b.w, b.h) * 0.21;
        const blues = ["#2C5A8C", "#35689E", "#28507E"];
        for (let gy = b.y + 6; gy + 9 <= b.y + b.h - 4; gy += 14) {
          for (let gx = b.x + 6; gx + 12 <= b.x + b.w - 4; gx += 17) {
            if (b.kind === "tower") {
              const dx = gx + 6 - hx, dy = gy + 4 - hy;
              if (dx * dx + dy * dy < hr * hr) continue;
            }
            const r = rnd();
            if (r < 0.05) ctx.fillStyle = "#DFF6FF";
            else if (winLit(r)) ctx.fillStyle = b.kind === "glass" ? "#A8ECFF" : "#FFD98A";
            else ctx.fillStyle = blues[Math.floor(rnd() * blues.length)];
            ctx.fillRect(gx, gy, 12, 9);
          }
        }
      } else if (b.kind === "residential") {
        const tones = ["#B5542F", "#C05A33", "#A34A2E", "#96604A"];
        ctx.fillStyle = tones[Math.floor(rnd() * tones.length)];
        ctx.fillRect(b.x, b.y, b.w, b.h);
        for (let ry = b.y; ry < b.y + b.h; ry += 8) {
          ctx.fillStyle = "rgba(0,0,0,0.20)";
          ctx.fillRect(b.x, ry + 6, b.w, 2);
          ctx.fillStyle = "rgba(0,0,0,0.10)";
          const offRow = Math.round((ry - b.y) / 8) % 2 === 0 ? 0 : 9;
          for (let jx = b.x + offRow; jx < b.x + b.w; jx += 18) ctx.fillRect(jx, ry, 1, 6);
        }
        ctx.fillStyle = "rgba(0,0,0,0.18)";
        ctx.fillRect(b.x + b.w / 2 - 4, b.y, 8, b.h);
        ctx.fillStyle = "rgba(255,255,255,0.16)";
        ctx.fillRect(b.x + b.w / 2 - 1, b.y, 2, b.h);
      } else if (b.kind === "stall") {
        for (let sx = b.x, i = 0; sx < b.x + b.w; sx += 11, i++) {
          ctx.fillStyle = i % 2 === 0 ? b.accent : "#F3E9D2";
          ctx.fillRect(sx, b.y, Math.min(11, b.x + b.w - sx), b.h);
        }
        ctx.fillStyle = "rgba(0,0,0,0.10)";
        for (let sy = b.y + 9; sy < b.y + b.h; sy += 18) ctx.fillRect(b.x, sy, b.w, 2);
      } else if (b.kind === "warehouse") {
        ctx.fillStyle = "#66788A";
        ctx.fillRect(b.x, b.y, b.w, b.h);
        for (let ly = b.y + 3; ly < b.y + b.h; ly += 7) {
          ctx.fillStyle = "rgba(255,255,255,0.10)";
          ctx.fillRect(b.x, ly, b.w, 1);
          ctx.fillStyle = "rgba(0,0,0,0.10)";
          ctx.fillRect(b.x, ly + 3, b.w, 1);
        }
        for (let i = 0; i < 2; i++) {
          const px2 = b.x + 12 + rnd() * Math.max(10, b.w - 60);
          const py2 = b.y + 10 + rnd() * Math.max(10, b.h - 40);
          ctx.fillStyle = "#3A4A5A"; ctx.fillRect(px2 - 2, py2 - 2, 34, 20);
          ctx.fillStyle = "rgba(165,240,255,0.55)"; ctx.fillRect(px2, py2, 30, 16);
        }
      } else {
        ctx.fillStyle = "#707A94";
        ctx.fillRect(b.x, b.y, b.w, b.h);
        for (let i = 0; i < 46; i++) {
          ctx.fillStyle = rnd() > 0.5 ? "#7E88A2" : "#626C84";
          ctx.fillRect(b.x + rnd() * b.w, b.y + rnd() * b.h, 3, 3);
        }
        const feat = rnd();
        if (feat < 0.34) {
          const gx2 = b.x + b.w * 0.16, gy2 = b.y + b.h * 0.16;
          ctx.fillStyle = "#2E7D43"; ctx.fillRect(gx2, gy2, b.w * 0.42, b.h * 0.42);
          ctx.fillStyle = "#4CC36E";
          for (let i = 0; i < 12; i++) ctx.fillRect(gx2 + rnd() * b.w * 0.4, gy2 + rnd() * b.h * 0.4, 4, 4);
        } else if (feat < 0.62) {
          const px3 = b.x + b.w * 0.14, py3 = b.y + b.h * 0.14;
          ctx.fillStyle = "#1D2F4D"; ctx.fillRect(px3, py3, b.w * 0.46, b.h * 0.4);
          ctx.strokeStyle = "rgba(0,229,255,0.4)"; ctx.lineWidth = 1;
          for (let lx = px3 + 8; lx < px3 + b.w * 0.46; lx += 8) {
            ctx.beginPath(); ctx.moveTo(lx, py3); ctx.lineTo(lx, py3 + b.h * 0.4); ctx.stroke();
          }
        } else {
          const n = Math.max(2, Math.floor((b.w * b.h) / 24000));
          for (let i = 0; i < n; i++) {
            const dx = b.x + 8 + Math.floor(rnd() * Math.max(8, b.w - 42));
            const dy = b.y + 8 + Math.floor(rnd() * Math.max(8, b.h - 34));
            if (rnd() < 0.55) {
              ctx.fillStyle = "#54627F"; ctx.fillRect(dx, dy, 26, 18);
              ctx.fillStyle = "#3C4A63"; ctx.fillRect(dx + 3, dy + 3, 20, 12);
              ctx.fillStyle = "#6B7B99"; ctx.fillRect(dx + 3, dy + 3, 20, 2);
            } else {
              ctx.fillStyle = "#5A6B8C"; ctx.fillRect(dx, dy, 16, 16);
              ctx.fillStyle = "#43536E"; ctx.fillRect(dx + 4, dy + 4, 8, 8);
            }
          }
        }
      }
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fillRect(b.x, b.y, b.w, 3); ctx.fillRect(b.x, b.y, 3, b.h);
      ctx.fillStyle = "rgba(0,0,0,0.20)";
      ctx.fillRect(b.x, b.y + b.h - 3, b.w, 3); ctx.fillRect(b.x + b.w - 3, b.y, 3, b.h);
      ctx.restore();

      /* Ícono del distrito en la esquina del techo. */
      if (b.districtId && b.w >= 110 && b.h >= 110) {
        const ic = api.iconCanvas(b.districtId, b.accent);
        if (ic) {
          ctx.save();
          ctx.globalAlpha = 0.9;
          ctx.drawImage(ic, b.x + b.w - 42, b.y + 10, 32, 32);
          ctx.restore();
        }
      }
    }
  };
  return api;
}
