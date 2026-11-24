/**
 * Presentational UI de LA TORRE DE CONTROL viva (zona de inglés).
 * La persistencia, los relojes, el Tope de Turno y las recompensas
 * pertenecen a src/ingles-state.js vía el llamador (app.js). Este
 * módulo nunca escribe en el almacenamiento: pinta el panel de la
 * manzana (2,3) con el Turno del día como vitrina (§5.3 del diseño),
 * la tarjeta «Esta semana toca», las 17 rutinas agrupadas por
 * habilidad y los 9 hitos — el mismo lenguaje visual del Garaje vivo
 * y del Estudio Neón, con el azul cielo #4FC3F7 de la Torre.
 *
 * Fase A (v0.55.0): solo el sistema vivo. La campaña DESPEGUE, el
 * Laboratorio de Voz, la Fraseología SRS y el Tablero de Habilidad
 * llegan en fases B–D y se anuncian en una tarjeta informativa —
 * sin botones que prometan lo que aún no existe.
 */
const sessions = new WeakMap();

const text = (value, fallback = "") => value == null ? fallback : String(value);
const number = (value) => Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0);
const format = (value) => new Intl.NumberFormat("es-CR").format(number(value));

function node(tag, className, content) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content != null) element.textContent = text(content);
  return element;
}

function button(className, label, handler) {
  const element = node("button", className, label);
  element.type = "button";
  if (handler) element.addEventListener("click", handler);
  return element;
}

function fmtDate(dateStr) {
  if (!dateStr) return "sin registro";
  const d = new Date(`${dateStr}T12:00:00`);
  if (!Number.isFinite(d.getTime())) return dateStr;
  return new Intl.DateTimeFormat("es-CR", { day: "numeric", month: "short", year: "numeric" }).format(d);
}

function dueText(mission) {
  if (mission.kind === "hito") return mission.state === "completada" ? "Hito completado" : "Hito de una sola vez";
  if (mission.state === "sin-registro") return "Nunca registrada: hacela y arranca su reloj";
  if (mission.state === "vencida") return `Venció hace ${Math.abs(mission.dueIn)} ${Math.abs(mission.dueIn) === 1 ? "día" : "días"}`;
  if (mission.state === "por-vencer") {
    if (mission.dueIn === 0) return "Vence hoy";
    if (mission.dueIn === 1) return "Vence mañana";
    return `Vence en ${mission.dueIn} días`;
  }
  return `Faltan ${mission.dueIn} días`;
}

function redraw(root, state) {
  if (sessions.get(root) === state) paint(root, state);
}

function makeHero(state, view) {
  const hero = node("header", "campaign-hero torre-hero");
  const top = node("div", "campaign-hero-top");
  const back = button("campaign-back", "← Mapa", () => state.options.onBack?.());
  back.setAttribute("aria-label", "Volver al mapa");
  top.append(back, node("span", "campaign-code", "MANZANA (2,3) / INGLÉS"));
  const content = node("div", "campaign-hero-content");
  content.append(
    node("p", "campaign-eyebrow", "ENGLISH CLUB · SJO TOWER"),
    node("h1", "campaign-title", "LA TORRE DE CONTROL"),
    node("p", "campaign-subtitle", "El inglés como idioma de trabajo: voz clara, oído rápido, palabras profesionales, entrevista."),
    node("p", "campaign-goal", "La meta no es sonar gringo: es que te entiendan a la primera. Todo está desbloqueado, como en el Garaje: las rutinas se repiten con su propio reloj y pagan una vez por ciclo; los hitos pagan una sola vez. El vivo paga hasta 850 XP y ₡58 por semana (Tope de Turno): pasado el tope, la práctica se registra igual, sin paga.")
  );
  const bottom = node("div", "campaign-hero-bottom");
  bottom.append(
    node("span", "campaign-live-dot", view.rank
      ? "★ LOS 9 HITOS COMPLETOS"
      : view.vencidas > 0 ? `● ${format(view.vencidas)} VENCIDA${view.vencidas === 1 ? "" : "S"}` : "● TODO DESBLOQUEADO"),
    node("span", "campaign-hero-caption", "QUE TE ENTIENDAN A LA PRIMERA.")
  );
  hero.append(top, content, bottom);
  return hero;
}

function makeSummary(state, view) {
  const section = node("section", "campaign-overview garage-overview");
  section.setAttribute("aria-label", "Tu Torre de un vistazo");
  const rutinas = node("div", "garage-stat");
  rutinas.append(
    node("span", "campaign-label", "RUTINAS AL DÍA"),
    node("strong", "", `${format(view.rutinasAlDia)} / ${format(view.rutinasTotal)}`)
  );
  const hitos = node("div", "garage-stat");
  hitos.append(
    node("span", "campaign-label", "HITOS"),
    node("strong", "", `${format(view.hitosDone)} / ${format(view.hitosTotal)}`)
  );
  const tope = node("div", "garage-stat");
  tope.append(
    node("span", "campaign-label", "TOPE DE TURNO · ESTA SEMANA"),
    node("strong", "", `${format(view.weekPaid.xp)} / ${format(view.weekPaid.capXp)} XP · ₡${format(view.weekPaid.coins)} / ₡${format(view.weekPaid.capCoins)}`)
  );
  section.append(rutinas, hitos, tope);
  return section;
}

function doButton(state, mission, compact = false) {
  const view = state.view;
  const capped = mission.kind === "rutina" && view.weekPaid.capReached;
  const pays = mission.paysNow && !capped;
  const action = button(
    `campaign-button ${pays ? "campaign-button--primary" : ""} garage-do`,
    mission.kind === "hito"
      ? `Completar ✓ · +${format(mission.xp)} XP · +₡${format(mission.coins)}`
      : capped && mission.paysNow
        ? "Registrar igual (tope de turno alcanzado: sin paga esta semana)"
        : pays
          ? `Hecho ✓ · +${format(mission.xp)} XP · +₡${format(mission.coins)}`
          : "Registrar igual (sin recompensa)",
    async () => {
      action.disabled = true;
      const result = await state.options.onComplete?.(mission.id);
      state.message = result || (pays
        ? { text: `Registrado: +${format(mission.xp)} XP y +₡${format(mission.coins)}.`, kind: "success" }
        : capped && mission.paysNow
          ? { text: "Registrado. El Tope de Turno de esta semana ya se alcanzó: cuenta para tus relojes e hitos, sin paga hasta la próxima semana.", kind: "success" }
          : { text: "Registrado. Todavía no tocaba: sin recompensa, pero el reloj reinició.", kind: "success" });
      redraw(state.root, state);
    }
  );
  return action;
}

function makeTurno(state, view) {
  const card = node("section", "torre-turno");
  card.append(node("h2", "torre-turno-title", view.turno.special ? "🗼 Turno del día · viernes de turno especial" : "🗼 Turno del día"));
  card.append(node("p", "torre-turno-sub", "Tu sesión de ~10–12 minutos en 3 bloques. Completar un bloque registra su rutina, con su paga y su reloj de siempre."));
  for (const block of view.turno.blocks) {
    const m = block.item;
    const row = node("div", "torre-turno-block");
    const head = node("div", "torre-turno-block-head");
    head.append(
      node("span", "torre-turno-slot", block.label),
      node("span", "torre-turno-name", m.title)
    );
    row.append(head);
    row.append(node("p", "torre-turno-brief", m.brief));
    const doneToday = m.lastDate && m.lastDate === view.today;
    if (doneToday) row.append(node("p", "garage-done", "✓ Registrado hoy"));
    else row.append(doButton(state, m, true));
    card.append(row);
  }
  return card;
}

function makeWeekCard(state, view) {
  const card = node("section", "garage-week");
  card.append(node("h2", "garage-week-title", "📅 Esta semana toca"));
  if (!view.week.length) {
    card.append(node("p", "garage-week-empty", "Nada vence esta semana. La Torre descansa."));
    return card;
  }
  const list = node("ul", "garage-week-list");
  for (const m of view.week) {
    const item = node("li", "garage-week-item");
    item.append(
      node("span", "garage-week-name", `${m.title}`),
      node("span", `garage-chip garage-chip--${m.state}`, m.state === "sin-registro" ? "SIN REGISTRO" : dueText(m).toUpperCase())
    );
    list.append(item);
  }
  card.append(list);
  return card;
}

function makeMission(state, mission) {
  const card = node("article", `garage-mission garage-mission--${mission.state}`);
  card.dataset.missionId = mission.id;
  const top = node("div", "garage-mission-top");
  top.append(
    node("h3", "garage-mission-title", mission.title),
    node("span", `garage-chip garage-chip--${mission.state}`, mission.label)
  );
  card.append(top);
  card.append(node("p", "garage-mission-brief", mission.brief));
  const meta = [];
  if (mission.kind === "rutina") meta.push(`Cada ${format(mission.days)} días`);
  if (mission.lastDate) meta.push(`Última vez: ${fmtDate(mission.lastDate)}`);
  if (mission.times > 1) meta.push(`${format(mission.times)} veces registrada`);
  meta.push(dueText(mission));
  card.append(node("p", "garage-mission-meta", meta.join(" · ")));

  const doneToday = mission.lastDate && mission.lastDate === state.view.today;
  if (mission.kind === "hito" && mission.state === "completada") {
    card.append(node("p", "garage-done", "✓ Completado"));
    return card;
  }
  if (doneToday) {
    card.append(node("p", "garage-done", "✓ Registrado hoy"));
    return card;
  }
  card.append(doButton(state, mission));
  return card;
}

function makeComingSoon() {
  const card = node("section", "torre-coming");
  card.append(node("h2", "torre-coming-title", "🚧 En construcción en esta Torre"));
  card.append(node("p", "torre-coming-text",
    "La campaña DESPEGUE (58 misiones de estudio), el Laboratorio de Voz, la Fraseología con repaso espaciado y el Tablero de Habilidad llegan en las próximas fases. Los turnos de hoy ya corren y ya pagan: el hábito empieza desde el día 1."));
  return card;
}

function paint(root, state) {
  const view = state.options.view;
  state.view = view;
  /* La envoltura campaign-shell define las variables del tema (acento,
     panel, líneas): sin ella los botones y tarjetas pierden su fondo. */
  const shell = node("div", "campaign-shell torre-shell");
  shell.append(makeHero(state, view), makeSummary(state, view));
  if (state.message) {
    shell.append(node("p", `campaign-message campaign-message--${state.message.kind || "info"}`, state.message.text));
  }
  shell.append(makeTurno(state, view));
  const layout = node("div", "garage-layout");
  const rail = node("aside", "garage-rail");
  rail.append(makeWeekCard(state, view));
  const main = node("div", "garage-main");
  for (const skill of view.skills) {
    const group = node("section", "garage-group");
    group.append(node("h2", "garage-group-title", `${skill.icon} ${skill.name}`));
    for (const m of skill.rutinas) group.append(makeMission(state, m));
    main.append(group);
  }
  const hitosGroup = node("section", "garage-group");
  hitosGroup.append(node("h2", "garage-group-title", "🏆 Hitos · una sola vez"));
  for (const m of view.items.filter((i) => i.kind === "hito")) hitosGroup.append(makeMission(state, m));
  main.append(hitosGroup);
  main.append(makeComingSoon());
  layout.append(rail, main);
  shell.append(layout);
  root.replaceChildren(shell);
}

export function renderIngles(root, { view, onComplete, onBack } = {}) {
  if (!root || typeof root.replaceChildren !== "function") {
    throw new TypeError("renderIngles necesita un elemento raíz del DOM.");
  }
  let state = sessions.get(root);
  if (!state) {
    state = { root, message: null, view: null, options: null };
    sessions.set(root, state);
  }
  state.options = { view, onComplete, onBack };
  paint(root, state);
  return root;
}
