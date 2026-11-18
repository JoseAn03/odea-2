/**
 * Presentational UI del Garaje vivo. La persistencia, los relojes y las
 * recompensas pertenecen a src/garage-state.js vía el llamador (app.js).
 * Este módulo nunca escribe en el almacenamiento: pinta la lista corrida
 * de rutinas y proyectos, el panel de vehículos con su kilometraje y la
 * vista «Esta semana toca», con el mismo lenguaje visual de las campañas.
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
  const hero = node("header", "campaign-hero");
  const image = node("img", "campaign-hero-image");
  image.src = "assets/slots/garaje.webp";
  image.alt = "";
  image.setAttribute("aria-hidden", "true");
  image.dataset.imageSlot = "campaign.garaje";
  image.decoding = "async";
  image.addEventListener("error", () => { image.hidden = true; }, { once: true });
  const top = node("div", "campaign-hero-top");
  const back = button("campaign-back", "← Mapa", () => state.options.onBack?.());
  back.setAttribute("aria-label", "Volver al mapa");
  top.append(back, node("span", "campaign-code", "DISTRITO 03 / GARAJE"));
  const content = node("div", "campaign-hero-content");
  content.append(
    node("p", "campaign-eyebrow", "MODO GARAJE · TU TALLER VIVO"),
    node("h1", "campaign-title", "EL GARAJE"),
    node("p", "campaign-subtitle", "Tu taller personal: el Accent 2017 y la Formula X2, como en ODEA 1."),
    node("p", "campaign-goal", "Las rutinas de tus vehículos con su propio reloj, como en la vida real: cada una vence según su ritmo y completarlas a tiempo paga. Los proyectos de detalle se hacen una sola vez.")
  );
  const bottom = node("div", "campaign-hero-bottom");
  bottom.append(
    node("span", "campaign-live-dot", view.vencidas > 0 ? `● ${format(view.vencidas)} VENCIDA${view.vencidas === 1 ? "" : "S"}` : "● TODO BAJO CONTROL"),
    node("span", "campaign-hero-caption", "A TU RITMO. SIN ORDEN OBLIGATORIO.")
  );
  hero.append(image, top, content, bottom);
  return hero;
}

function makeSummary(state, view) {
  const section = node("section", "campaign-overview garage-overview");
  section.setAttribute("aria-label", "Tu garaje de un vistazo");
  const rutinas = node("div", "garage-stat");
  rutinas.append(
    node("span", "campaign-label", "RUTINAS AL DÍA"),
    node("strong", "", `${format(view.rutinasAlDia)} / ${format(view.rutinasTotal)}`)
  );
  const proyectos = node("div", "garage-stat");
  proyectos.append(
    node("span", "campaign-label", "PROYECTOS DE DETALLE"),
    node("strong", "", `${format(view.proyectosDone)} / ${format(view.proyectosTotal)}`)
  );
  const semana = node("div", "garage-stat");
  semana.append(
    node("span", "campaign-label", "ESTA SEMANA TOCAN"),
    node("strong", "", format(view.week.length))
  );
  section.append(rutinas, proyectos, semana);
  return section;
}

function makeVehicleCard(state, vehicle) {
  const card = node("section", "garage-vehicle");
  const head = node("div", "garage-vehicle-head");
  head.append(
    node("span", "garage-vehicle-icon", vehicle.icon),
    node("div", "garage-vehicle-name")
  );
  head.lastElementChild.append(node("strong", "", vehicle.name), node("span", "", vehicle.detail));
  card.append(head);
  const km = node("p", "garage-km", vehicle.km > 0 ? `${format(vehicle.km)} km` : "Sin kilometraje");
  card.append(km);
  card.append(node("p", "garage-km-date", vehicle.kmDate ? `Último registro: ${fmtDate(vehicle.kmDate)}` : "Registrá el km y el Garaje lleva la cuenta."));
  const form = node("form", "garage-km-form");
  const input = node("input", "garage-km-input");
  input.type = "number";
  input.min = "0";
  input.max = "2000000";
  input.step = "1";
  input.placeholder = "Kilometraje de hoy";
  input.setAttribute("aria-label", `Kilometraje del ${vehicle.name}`);
  const submit = button("campaign-button garage-km-button", "Registrar km");
  submit.type = "submit";
  form.append(input, submit);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const value = Number(input.value);
    if (!Number.isSafeInteger(value) || value < 0) {
      state.message = { text: "Escribí un kilometraje válido.", kind: "error" };
      redraw(state.root, state);
      return;
    }
    submit.disabled = true;
    const result = await state.options.onKm?.(vehicle.id, value);
    state.message = result || { text: "Kilometraje guardado.", kind: "success" };
    redraw(state.root, state);
  });
  card.append(form);
  return card;
}

function makeWeekCard(state, view) {
  const card = node("section", "garage-week");
  card.append(node("h2", "garage-week-title", "📅 Esta semana toca"));
  if (!view.week.length) {
    card.append(node("p", "garage-week-empty", "Nada vence esta semana. A rodar tranquilo."));
    return card;
  }
  const list = node("ul", "garage-week-list");
  for (const m of view.week) {
    const item = node("li", "garage-week-item");
    item.append(
      node("span", "garage-week-name", m.title),
      node("span", `garage-chip garage-chip--${m.state}`, m.state === "sin-registro" ? "SIN REGISTRO" : dueText(m).toUpperCase())
    );
    list.append(item);
  }
  card.append(list);
  return card;
}

function makeMission(state, mission) {
  const card = node("article", `garage-mission garage-mission--${mission.state}`);
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
  if (mission.kind === "rutina") meta.push(`Cada ${format(mission.days)} días`);
  if (mission.lastDate) meta.push(`Última vez: ${fmtDate(mission.lastDate)}`);
  if (mission.times > 1) meta.push(`${format(mission.times)} veces registrada`);
  meta.push(dueText(mission));
  card.append(node("p", "garage-mission-meta", meta.join(" · ")));

  const doneToday = mission.lastDate && mission.lastDate === state.view.today;
  if (mission.kind === "proyecto" && mission.state === "completada") {
    const done = node("p", "garage-done", "✓ Completado");
    card.append(done);
    return card;
  }
  if (doneToday) {
    card.append(node("p", "garage-done", "✓ Registrado hoy"));
    return card;
  }
  const pays = mission.paysNow;
  const action = button(
    `campaign-button ${pays ? "campaign-button--primary" : ""} garage-do`,
    mission.kind === "proyecto"
      ? `Completar ✓ · +${format(mission.xp)} XP · +₡${format(mission.coins)}`
      : pays
        ? `Hecho ✓ · +${format(mission.xp)} XP · +₡${format(mission.coins)}`
        : "Registrar igual (sin recompensa)",
    async () => {
      action.disabled = true;
      const result = await state.options.onComplete?.(mission.id);
      state.message = result || (pays
        ? { text: `Registrado: +${format(mission.xp)} XP y +₡${format(mission.coins)}.`, kind: "success" }
        : { text: "Registrado. Todavía no tocaba: sin recompensa, pero el reloj reinició.", kind: "success" });
      redraw(state.root, state);
    }
  );
  card.append(action);
  return card;
}

function makeGroup(state, vehicle) {
  const group = node("section", "garage-group");
  const head = node("h2", "garage-group-title", `${vehicle.icon} ${vehicle.name}`);
  group.append(head);
  const rutinas = vehicle.missions.filter((m) => m.kind === "rutina");
  const proyectos = vehicle.missions.filter((m) => m.kind === "proyecto");
  for (const m of rutinas) group.append(makeMission(state, m));
  if (proyectos.length) {
    group.append(node("h3", "garage-group-sub", "Proyectos de detalle · una sola vez"));
    for (const m of proyectos) group.append(makeMission(state, m));
  }
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
  for (const vehicle of view.vehicles) rail.append(makeVehicleCard(state, vehicle));
  const main = node("div", "garage-main");
  for (const vehicle of view.vehicles) main.append(makeGroup(state, vehicle));
  if (state.options.onArchive) {
    const archive = button("campaign-archive", "Ver misiones de vehículos heredadas de ODEA 1", () => state.options.onArchive());
    main.append(archive);
  }
  layout.append(rail, main);
  shell.append(layout);
  root.replaceChildren(shell);
}

export function renderGarage(root, { view, onComplete, onKm, onBack, onArchive } = {}) {
  if (!root || typeof root.replaceChildren !== "function") {
    throw new TypeError("renderGarage necesita un elemento raíz del DOM.");
  }
  let state = sessions.get(root);
  if (!state) {
    state = { root, message: null, view: null, options: null };
    sessions.set(root, state);
  }
  state.options = { view, onComplete, onKm, onBack, onArchive };
  paint(root, state);
  return root;
}
