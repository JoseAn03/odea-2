/**
 * Presentational UI del Mundo de Ian vivo. La persistencia, los relojes
 * y las recompensas pertenecen a src/ian-state.js vía el llamador
 * (app.js). Este módulo nunca escribe en el almacenamiento: pinta la
 * ruta completa de Ian Daniel, TODA desbloqueada, con la vista «Esta
 * semana a jugar» y el mismo lenguaje visual del Garaje vivo.
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
  if (mission.kind === "proyecto") return mission.state === "completada" ? "Proyecto terminado" : "Proyecto de una sola vez";
  if (mission.state === "sin-registro") return "Todavía no la hacen: jueguen y arranca su reloj";
  if (mission.state === "vencida") return `Venció hace ${Math.abs(mission.dueIn)} ${Math.abs(mission.dueIn) === 1 ? "día" : "días"}`;
  if (mission.state === "por-vencer") {
    if (mission.dueIn === 0) return "Toca otra vez hoy";
    if (mission.dueIn === 1) return "Toca otra vez mañana";
    return `Toca otra vez en ${mission.dueIn} días`;
  }
  return `Toca otra vez en ${mission.dueIn} días`;
}

function redraw(root, state) {
  if (sessions.get(root) === state) paint(root, state);
}

function makeHero(state, view) {
  const hero = node("header", "campaign-hero");
  const image = node("img", "campaign-hero-image");
  image.src = "assets/slots/mundoian.webp";
  image.alt = "";
  image.setAttribute("aria-hidden", "true");
  image.dataset.imageSlot = "campaign.mundoian";
  image.decoding = "async";
  image.addEventListener("error", () => { image.hidden = true; }, { once: true });
  const top = node("div", "campaign-hero-top");
  const back = button("campaign-back", "← Mapa", () => state.options.onBack?.());
  back.setAttribute("aria-label", "Volver al mapa");
  top.append(back, node("span", "campaign-code", "ZONA / MUNDO IAN"));
  const content = node("div", "campaign-hero-content");
  content.append(
    node("p", "campaign-eyebrow", "MODO IAN · EL MUNDO DE IAN DANIEL, VIVO"),
    node("h1", "campaign-title", "EL MUNDO DE IAN"),
    node("p", "campaign-subtitle", "La ruta de Ian Daniel: un corazón bueno, una mente curiosa y un papá presente."),
    node("p", "campaign-goal", "Todo está desbloqueado, como en el Garaje: sin orden obligatorio. Las misiones de juego y hábito se repiten y pagan una vez por semana (el paseo, cada 15 días); los proyectos se hacen una sola vez. Al probar las 54, Ian gana su insignia: Pequeño Gran Hombre.")
  );
  const bottom = node("div", "campaign-hero-bottom");
  bottom.append(
    node("span", "campaign-live-dot", view.rank
      ? "★ INSIGNIA GANADA: PEQUEÑO GRAN HOMBRE"
      : view.vencidas > 0 ? `● ${format(view.vencidas)} POR REPETIR` : "● TODO DESBLOQUEADO"),
    node("span", "campaign-hero-caption", "A SU RITMO. SIN ORDEN OBLIGATORIO.")
  );
  hero.append(image, top, content, bottom);
  return hero;
}

function makeSummary(state, view) {
  const section = node("section", "campaign-overview garage-overview");
  section.setAttribute("aria-label", "El mundo de Ian de un vistazo");
  const probadas = node("div", "garage-stat");
  probadas.append(
    node("span", "campaign-label", "MISIONES PROBADAS"),
    node("strong", "", `${format(view.probadas)} / ${format(view.total)}`)
  );
  const rutinas = node("div", "garage-stat");
  rutinas.append(
    node("span", "campaign-label", "JUEGOS Y HÁBITOS AL DÍA"),
    node("strong", "", `${format(view.rutinasAlDia)} / ${format(view.rutinasTotal)}`)
  );
  const proyectos = node("div", "garage-stat");
  proyectos.append(
    node("span", "campaign-label", "PROYECTOS TERMINADOS"),
    node("strong", "", `${format(view.proyectosDone)} / ${format(view.proyectosTotal)}`)
  );
  section.append(probadas, rutinas, proyectos);
  return section;
}

function makeWeekCard(state, view) {
  const card = node("section", "garage-week");
  card.append(node("h2", "garage-week-title", "🎲 Esta semana a jugar y practicar"));
  if (!view.week.length) {
    card.append(node("p", "garage-week-empty", "Todo al día esta semana. A jugar libre."));
    return card;
  }
  const list = node("ul", "garage-week-list");
  for (const m of view.week) {
    const item = node("li", "garage-week-item");
    item.append(
      node("span", "garage-week-name", m.title),
      node("span", `garage-chip garage-chip--${m.state}`, m.state === "sin-registro" ? "SIN HACER" : dueText(m).toUpperCase())
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
  if (Array.isArray(mission.steps) && mission.steps.length) {
    const steps = node("ul", "garage-steps");
    for (const step of mission.steps) steps.append(node("li", "", step));
    card.append(steps);
  }
  const meta = [];
  if (mission.kind === "rutina") meta.push(mission.days === 15 ? "Cada 15 días" : "Cada semana");
  if (mission.lastDate) meta.push(`Última vez: ${fmtDate(mission.lastDate)}`);
  if (mission.times > 1) meta.push(`${format(mission.times)} veces hecha`);
  meta.push(dueText(mission));
  card.append(node("p", "garage-mission-meta", meta.join(" · ")));

  const doneToday = mission.lastDate && mission.lastDate === state.view.today;
  if (mission.kind === "proyecto" && mission.state === "completada") {
    card.append(node("p", "garage-done", "✓ Completada"));
    return card;
  }
  if (doneToday) {
    card.append(node("p", "garage-done", "✓ Hecha hoy"));
    return card;
  }
  const pays = mission.paysNow;
  const action = button(
    `campaign-button ${pays ? "campaign-button--primary" : ""} garage-do`,
    mission.kind === "proyecto"
      ? `Completar ✓ · +${format(mission.xp)} XP · +₡${format(mission.coins)}`
      : pays
        ? `¡Ya la hicimos! ✓ · +${format(mission.xp)} XP · +₡${format(mission.coins)}`
        : "Registrar igual (sin recompensa)",
    async () => {
      action.disabled = true;
      const result = await state.options.onComplete?.(mission.id);
      state.message = result || (pays
        ? { text: `Registrada: +${format(mission.xp)} XP y +₡${format(mission.coins)}.`, kind: "success" }
        : { text: "Registrada. Todavía no tocaba: sin recompensa, pero su reloj reinició.", kind: "success" });
      redraw(state.root, state);
    }
  );
  card.append(action);
  return card;
}

function makeGroup(state, chapter) {
  const group = node("section", "garage-group");
  group.append(node("h2", "garage-group-title", chapter.title));
  if (chapter.subtitle) group.append(node("p", "garage-group-sub", chapter.subtitle));
  for (const m of chapter.missions) group.append(makeMission(state, m));
  return group;
}

function paint(root, state) {
  const view = state.options.view;
  state.view = view;
  /* La envoltura campaign-shell define las variables del tema (acento,
     panel, líneas): sin ella los botones y tarjetas pierden su fondo. */
  const shell = node("div", "campaign-shell");
  shell.append(makeHero(state, view), makeSummary(state, view));
  if (state.message) {
    shell.append(node("p", `campaign-message campaign-message--${state.message.kind || "info"}`, state.message.text));
  }
  const layout = node("div", "garage-layout");
  const rail = node("aside", "garage-rail");
  rail.append(makeWeekCard(state, view));
  const main = node("div", "garage-main");
  for (const chapter of view.chapters) main.append(makeGroup(state, chapter));
  if (state.options.onArchive) {
    const archive = button("campaign-archive", "Ver la ficha del Hub", () => state.options.onArchive());
    main.append(archive);
  }
  layout.append(rail, main);
  shell.append(layout);
  root.replaceChildren(shell);
}

export function renderIan(root, { view, onComplete, onBack, onArchive } = {}) {
  if (!root || typeof root.replaceChildren !== "function") {
    throw new TypeError("renderIan necesita un elemento raíz del DOM.");
  }
  let state = sessions.get(root);
  if (!state) {
    state = { root, message: null, view: null, options: null };
    sessions.set(root, state);
  }
  state.options = { view, onComplete, onBack, onArchive };
  paint(root, state);
  return root;
}
