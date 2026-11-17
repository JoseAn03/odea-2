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
  speckle(g, "#25283C", ["#30354A", "#1F2233", "#394056"], 92, seed);
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
    speckle(g, "#246342", ["#2D8050", "#1B573A", "#377F4A"], 140, 5);
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
  blob(14, 11, 10, "#10422A"); blob(8, 14, 6, "#14532D"); blob(20, 14, 6, "#14532D"); blob(14, 6, 6, "#185E34");
  const rnd = mulberry32(11);
  g.fillStyle = "#289654";
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
    banca: bancaCanvas(),
    carro: carroCian,
    carroRosa,
    carroV: rotar90(carroRosa),
    motoPiloto: motoPilotoCanvas(),
    moto: motoCanvas(),
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
    roof(ctx, b) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(b.x, b.y, b.w, b.h);
      ctx.clip();
      ctx.globalAlpha = 0.5;
      api.fill(ctx, "techo", b.x, b.y, b.w, b.h);
      ctx.globalAlpha = 1;
      const rnd = mulberry32((b.x * 73 + b.y * 149) >>> 0);
      const n = Math.max(2, Math.floor((b.w * b.h) / 24000));
      for (let i = 0; i < n; i++) {
        const dx = b.x + 8 + Math.floor(rnd() * Math.max(8, b.w - 42));
        const dy = b.y + 8 + Math.floor(rnd() * Math.max(8, b.h - 34));
        const kind = rnd();
        if (kind < 0.45) {
          ctx.fillStyle = "#3B2A55"; ctx.fillRect(dx, dy, 26, 18);
          ctx.fillStyle = "#2A1D40"; ctx.fillRect(dx + 3, dy + 3, 20, 12);
          ctx.fillStyle = "#4A3870"; ctx.fillRect(dx + 3, dy + 3, 20, 2);
        } else if (kind < 0.75) {
          ctx.fillStyle = "#46335F"; ctx.fillRect(dx, dy, 16, 16);
          ctx.fillStyle = "#33234A"; ctx.fillRect(dx + 4, dy + 4, 8, 8);
        } else {
          ctx.fillStyle = "rgba(0,229,255,0.30)"; ctx.fillRect(dx, dy, 22, 12);
          ctx.fillStyle = "rgba(255,255,255,0.20)"; ctx.fillRect(dx, dy, 22, 2);
        }
      }
      ctx.restore();
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
