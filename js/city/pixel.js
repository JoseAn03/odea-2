/**
 * pixel.js — capa de arte pixel para la ciudad (rama arte-pixel-ciudad).
 *
 * Arte retro por cuadritos generado por código en tiempo de carga (sin
 * archivos de imagen): tiles de 32×32 para calles y aceras, personajes de
 * 16×20 con caminar de 2 cuadros, postes de luz y un carro. Es SOLO una capa
 * visual sobre el render existente: no toca datos, progreso ni lógica.
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
/* . transparente · C gorra (SOLO jugador) · H pelo · S piel · T camisa ·
   P pantalón · Z zapatos */
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
  speckle(g, "#1B1B26", ["#23232F", "#14141D", "#2A2A38"], 110, seed);
}

const TILES = {
  asfalto: () => tileCanvas((g) => paintAsfalto(g, 1)),
  acera: () => tileCanvas((g) => {
    speckle(g, "#3A3A4A", ["#424254", "#323240"], 60, 3);
    g.fillStyle = "#2C2C3A";
    g.fillRect(0, 0, 32, 1); g.fillRect(0, 0, 1, 32);
    g.fillStyle = "#32323F";
    g.fillRect(15, 0, 1, 32); g.fillRect(0, 15, 32, 1);
  }),
  cebra: () => tileCanvas((g) => {
    paintAsfalto(g, 4);
    g.fillStyle = "#D2D2D7";
    for (const x of [3, 10, 17, 24]) g.fillRect(x, 2, 4, 28);
  }),
  grama: () => tileCanvas((g) => {
    speckle(g, "#0E2E22", ["#14532D", "#1B4332", "#0A241A"], 130, 5);
    g.fillStyle = ROSA; g.fillRect(7, 11, 1, 1);
    g.fillStyle = CIAN; g.fillRect(23, 25, 1, 1);
  }),
  plaza: () => tileCanvas((g) => {
    speckle(g, "#2A1430", ["#3D1D45", "#221028"], 70, 7);
    g.fillStyle = "#50245C"; g.fillRect(0, 0, 32, 1); g.fillRect(0, 0, 1, 32);
    g.fillStyle = "#42204E"; g.fillRect(15, 0, 1, 32); g.fillRect(0, 15, 32, 1);
    g.fillStyle = ROSA; g.fillRect(7, 7, 1, 1);
    g.fillStyle = CIAN; g.fillRect(23, 23, 1, 1);
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

function carroCanvas() {
  const c = mkCanvas(44, 22);
  const g = c.getContext("2d");
  g.fillStyle = "#101016";
  g.fillRect(6, 2, 4, 4); g.fillRect(6, 16, 4, 4); g.fillRect(34, 2, 4, 4); g.fillRect(34, 16, 4, 4);
  g.fillStyle = "#0096B4"; g.fillRect(2, 3, 40, 16);
  g.fillStyle = "#006E8C"; g.fillRect(13, 5, 17, 12);
  g.fillStyle = "#1E283C"; g.fillRect(10, 5, 3, 12); g.fillRect(30, 5, 3, 12);
  g.fillStyle = "#FFF0B4"; g.fillRect(41, 6, 1, 1); g.fillRect(41, 15, 1, 1);
  g.fillStyle = "#FF3C3C"; g.fillRect(2, 6, 1, 1); g.fillRect(2, 15, 1, 1);
  return c;
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
  const patterns = new WeakMap();
  return {
    tiles,
    player: frames(PAL_JUGADOR, true),
    npcs: [frames(PAL_NPC1, false), frames(PAL_NPC2, false)],
    poste: posteCanvas(),
    carro: carroCanvas(),
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
    }
  };
}
