/**
 * contrato-ui.js — la tarjeta «📜 CONTRATO SEMANAL» (v0.46.0).
 *
 * Vive sobre la ruta en la pantalla de Diarias y la pinta UNA sola
 * implementación para sus dos casas (pestaña «Hoy» y app Misiones del
 * teléfono): `js/app.js → paintDaily` la inyecta antes de `renderDaily`.
 *
 * Estética (§3.8 del diseño): marco rosado neón — una jerarquía por
 * encima de las tarjetas azules de misión —, pergamino pixel dibujado
 * por código, barras de progreso SEGMENTADAS en cian como la barra de
 * XP del HUD, cofre pixel dorado/magenta y el botón RECLAMAR que pasa
 * de gris con candado a rosado brillante al cerrar los 3 retos.
 * Ningún binario: los dos sprites salen de rejillas de texto de aquí.
 */

function node(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined && text !== null) el.textContent = String(text);
  return el;
}

/* ---------------------- pixel art por código ------------------------ */

function pixelCanvas(rows, palette, scale = 3) {
  if (typeof document === "undefined") return null;
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.style.width = `${w * scale}px`;
  canvas.style.height = `${h * scale}px`;
  canvas.style.imageRendering = "pixelated";
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const color = palette[ch];
      if (!color) return;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    });
  });
  return canvas;
}

/* Pergamino enrollado: bordes café, papel crema con renglones rosados
   y el sello de cera magenta de Costa Neón. */
const PERGAMINO_ROWS = [
  ".KKKKKKKKKKKKKK.",
  "KWWWWWWWWWWWWWWK",
  "KWPPPPPPPPPPPPWK",
  "KWPWWWWWWWWWPWWK",
  "KWPWCCCCCCCCWPWK",
  "KWPWWWWWWWWWPWWK",
  "KWPWCCCCCCWWPWWK",
  "KWPWWWWWWWWWPWWK",
  "KWPWCCCCWWWWPWWK",
  "KWPWWWWSSWWWPWWK",
  "KWPWWWWSSSSWPWWK",
  "KWPWWWWSSWWWPWWK",
  "KWPPPPPPPPPPPPWK",
  "KWWWWWWWWWWWWWWK",
  ".KKKKKKKKKKKKKK."
];
const PERGAMINO_PAL = {
  K: "#7A4A21", W: "#F5E6C4", P: "#D9B878", C: "#8A93A8", S: "#FF2E93"
};

/* Cofre del contrato: tapa dorada, cuerpo café con herrajes magenta,
   cerradura brillante y destellos cian. */
const COFRE_ROWS = [
  ".....GGGGGG.....",
  "...GGYYYYYYGG...",
  "..GYYYYYYYYYYG..",
  ".GYMMMMMMMMMMYG.",
  ".GYYYYYYYYYYYG..",
  "KKKKKKKKKKKKKKKK",
  "KBBBBBKGGKBBBBBK",
  "KBBBBBKGGKBBBBBK",
  "KBBBBBKKKBBBBBBK",
  "KBBBBBKGGKBBBBBK",
  "KBBBBBKGGKBBBBBK",
  ".KKKKKKKKKKKKKK.",
  "..D..D....D..D.."
];
const COFRE_PAL = {
  G: "#FFC53D", Y: "#FFD166", M: "#FF2E93", K: "#3A2410",
  B: "#8A5A2B", D: "#31EBDD"
};

export function pergaminoSprite() {
  const canvas = pixelCanvas(PERGAMINO_ROWS, PERGAMINO_PAL, 3);
  if (canvas) canvas.className = "contrato-pergamino";
  return canvas;
}

export function cofreSprite() {
  const canvas = pixelCanvas(COFRE_ROWS, COFRE_PAL, 3);
  if (canvas) canvas.className = "contrato-cofre";
  return canvas;
}

/* --------------------------- la tarjeta ----------------------------- */

function segmentedBar(challenge) {
  const bar = node("div", "contrato-bar");
  bar.setAttribute("role", "progressbar");
  bar.setAttribute("aria-valuemin", "0");
  bar.setAttribute("aria-valuemax", String(challenge.target));
  bar.setAttribute("aria-valuenow", String(challenge.current));
  bar.setAttribute("aria-label", `${challenge.title}: ${challenge.current} de ${challenge.target}`);
  for (let i = 0; i < challenge.target; i += 1) {
    bar.append(node("span", `contrato-seg${i < challenge.current ? " is-on" : ""}`));
  }
  return bar;
}

function challengeRow(challenge) {
  const row = node("li", `contrato-reto${challenge.done ? " is-done" : ""}`);
  const head = node("div", "contrato-reto-head");
  head.append(
    node("span", "contrato-reto-ico", challenge.icon),
    node("span", "contrato-reto-title", challenge.title),
    node("span", "contrato-reto-count", challenge.done ? "✓" : `${challenge.current}/${challenge.target}`)
  );
  row.append(head, node("p", "contrato-reto-detail", challenge.detail), segmentedBar(challenge));
  return row;
}

/**
 * Una tarjeta de contrato (una semana). `variant` distingue la semana
 * en curso ("actual") de la anterior en gracia ("gracia").
 */
export function contratoCard(week, { onClaim, variant = "actual" } = {}) {
  const card = node("section", "contrato-card");
  if (week.complete && !week.claimed) card.className += " is-complete";
  if (week.claimed) card.className += " is-claimed";
  if (variant === "gracia") card.className += " is-gracia";
  card.setAttribute("aria-label", `Contrato semanal, semana ${week.weekNumber}`);

  if (variant === "gracia") {
    card.append(node("p", "contrato-gracia-banner", week.complete
      ? `⏳ SEMANA PASADA EN GRACIA — Reclamá el cofre hasta el miércoles ${week.graceEnd} o se pierde.`
      : `⏳ SEMANA PASADA EN GRACIA — El reclamo cierra el miércoles ${week.graceEnd}.`));
  }

  const head = node("div", "contrato-head");
  const sprite = pergaminoSprite();
  if (sprite) head.append(sprite);
  const titles = node("div", "contrato-titles");
  titles.append(
    node("h2", "contrato-title", `📜 Contrato semanal — Semana ${week.weekNumber}`),
    node("p", "contrato-sub", variant === "gracia"
      ? "El contrato de la semana pasada: su progreso quedó congelado tal cual lo dejaste."
      : "Tres retos de tu semana real. Sin inventos: todo sale de tus registros de Costa Neón.")
  );
  head.append(titles);
  head.append(node("span", "contrato-pill", `${week.doneCount}/3 retos`));
  card.append(head);

  const list = node("ul", "contrato-retos");
  for (const challenge of week.challenges) list.append(challengeRow(challenge));
  card.append(list);

  const foot = node("div", "contrato-foot");
  const chest = node("div", "contrato-chest");
  const chestSprite = cofreSprite();
  if (chestSprite) chest.append(chestSprite);
  chest.append(node("span", "contrato-chest-text", "Cofre: 150 XP + ₡15"));
  foot.append(chest);

  if (week.claimed) {
    const btn = node("button", "contrato-claim is-claimed", "✓ COFRE RECLAMADO · +150 XP · +₡15");
    btn.type = "button";
    btn.disabled = true;
    foot.append(btn);
  } else if (week.complete) {
    const btn = node("button", "contrato-claim is-ready", "RECLAMAR COFRE");
    btn.type = "button";
    btn.addEventListener("click", () => { if (onClaim) onClaim(week.weekKey); });
    foot.append(btn);
  } else {
    const missing = week.total - week.doneCount;
    const btn = node("button", "contrato-claim is-locked",
      `🔒 RECLAMAR — te falta${missing === 1 ? "" : "n"} ${missing} reto${missing === 1 ? "" : "s"}`);
    btn.type = "button";
    btn.disabled = true;
    foot.append(btn);
  }
  card.append(foot);

  if (week.claimed) {
    card.append(node("p", "contrato-note", "Ya reclamaste este cofre. El de la semana que viene trae otros 3 retos."));
  } else if (variant === "actual") {
    card.append(node("p", "contrato-note",
      "Se cuenta solo lo de esta semana (lunes a domingo). Si cerrás los 3 y no reclamás, tenés hasta el miércoles siguiente."));
  }
  return card;
}

/**
 * Pinta el contrato en `root`: primero la semana en gracia si hay una
 * reclamable, y debajo la semana en curso.
 * @param {object} options.view  salida de contratoView(bundle, hoy)
 * @param {function} options.onClaim  (weekKey) => void
 */
export function renderContrato(root, { view, onClaim } = {}) {
  if (!root || typeof root.replaceChildren !== "function") {
    throw new TypeError("renderContrato necesita un elemento raíz del DOM.");
  }
  const wrap = node("div", "contrato-wrap");
  if (view?.grace) wrap.append(contratoCard(view.grace, { onClaim, variant: "gracia" }));
  if (view?.current) wrap.append(contratoCard(view.current, { onClaim, variant: "actual" }));
  root.replaceChildren(wrap);
  return root;
}
