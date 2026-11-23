/**
 * Presentational UI del Estudio Neón vivo (marca personal). La
 * persistencia, los relojes y las recompensas pertenecen a
 * src/marca-state.js vía el llamador (app.js). Este módulo nunca
 * escribe en el almacenamiento: pinta el estudio de Barrio Vida con
 * sus DOS pestañas — «YO MISMO» (redes personales) y «EL ANALISTA»
 * (LinkedIn) — la tarjeta «Esta semana toca» mezclando ambas, y el
 * mismo lenguaje visual del Garaje vivo y del Mundo de Ian vivo.
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
  const hero = node("header", "campaign-hero");
  const image = node("img", "campaign-hero-image");
  image.src = "assets/slots/marca.webp";
  image.alt = "";
  image.setAttribute("aria-hidden", "true");
  image.dataset.imageSlot = "campaign.marca";
  image.decoding = "async";
  image.addEventListener("error", () => { image.hidden = true; }, { once: true });
  const top = node("div", "campaign-hero-top");
  const back = button("campaign-back", "← Mapa", () => state.options.onBack?.());
  back.setAttribute("aria-label", "Volver al mapa");
  top.append(back, node("span", "campaign-code", "BARRIO VIDA / ESTUDIO"));
  const content = node("div", "campaign-hero-content");
  content.append(
    node("p", "campaign-eyebrow", "MODO MARCA · TU ESTUDIO EN BARRIO VIDA"),
    node("h1", "campaign-title", "ESTUDIO NEÓN"),
    node("p", "campaign-subtitle", "Tu marca personal en vivo: vos mismo en tus redes, y el analista en LinkedIn."),
    node("p", "campaign-goal", "Todo está desbloqueado, como en el Garaje: sin orden obligatorio. Las rutinas se repiten con su propio reloj y pagan una vez por ciclo; los hitos pagan una sola vez. Al completar los 10 hitos ganás tu estrella en el paseo: Estrella de Costa Neón.")
  );
  const bottom = node("div", "campaign-hero-bottom");
  bottom.append(
    node("span", "campaign-live-dot", view.rank
      ? "★ RANGO GANADO: ESTRELLA DE COSTA NEÓN"
      : view.vencidas > 0 ? `● ${format(view.vencidas)} VENCIDA${view.vencidas === 1 ? "" : "S"}` : "● TODO DESBLOQUEADO"),
    node("span", "campaign-hero-caption", "GRABAR UNA VEZ, PUBLICAR EN VARIOS LADOS.")
  );
  hero.append(image, top, content, bottom);
  return hero;
}

function makeSummary(state, view) {
  const section = node("section", "campaign-overview garage-overview");
  section.setAttribute("aria-label", "Tu marca de un vistazo");
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
  const semana = node("div", "garage-stat");
  semana.append(
    node("span", "campaign-label", "ESTA SEMANA TOCAN"),
    node("strong", "", format(view.week.length))
  );
  section.append(rutinas, hitos, semana);
  return section;
}

function makeTabs(state, view) {
  const bar = node("div", "marca-tabs");
  bar.setAttribute("role", "group");
  bar.setAttribute("aria-label", "Pestañas del Estudio Neón");
  for (const tab of view.tabs) {
    const isActive = state.tab === tab.id;
    const btn = button(
      `marca-tab${isActive ? " marca-tab--active" : ""}`,
      `${tab.icon} ${tab.name}`,
      () => { state.tab = tab.id; redraw(state.root, state); }
    );
    btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    bar.append(btn);
  }
  return bar;
}

function makeWeekCard(state, view) {
  const card = node("section", "garage-week");
  card.append(node("h2", "garage-week-title", "📅 Esta semana toca"));
  if (!view.week.length) {
    card.append(node("p", "garage-week-empty", "Nada vence esta semana. El estudio descansa."));
    return card;
  }
  const list = node("ul", "garage-week-list");
  for (const m of view.week) {
    const tab = view.tabs.find((t) => t.id === m.tab);
    const item = node("li", "garage-week-item");
    item.append(
      node("span", "garage-week-name", `${tab ? tab.icon : ""} ${m.title}`),
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
  const pays = mission.paysNow;
  const action = button(
    `campaign-button ${pays ? "campaign-button--primary" : ""} garage-do`,
    mission.kind === "hito"
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

function makeGroup(state, title, subtitle, missions) {
  const group = node("section", "garage-group");
  group.append(node("h2", "garage-group-title", title));
  if (subtitle) group.append(node("p", "garage-group-sub", subtitle));
  for (const m of missions) group.append(makeMission(state, m));
  return group;
}

function paint(root, state) {
  const view = state.options.view;
  state.view = view;
  if (!view.tabs.some((t) => t.id === state.tab)) state.tab = view.tabs[0].id;
  /* La envoltura campaign-shell define las variables del tema (acento,
     panel, líneas): sin ella los botones y tarjetas pierden su fondo. */
  const shell = node("div", "campaign-shell");
  shell.append(makeHero(state, view), makeSummary(state, view));
  if (state.message) {
    shell.append(node("p", `campaign-message campaign-message--${state.message.kind || "info"}`, state.message.text));
  }
  shell.append(makeTabs(state, view));
  const layout = node("div", "garage-layout");
  const rail = node("aside", "garage-rail");
  rail.append(makeWeekCard(state, view));
  const main = node("div", "garage-main");
  const tab = view.tabs.find((t) => t.id === state.tab);
  main.append(makeGroup(state, `${tab.icon} ${tab.name}`, tab.detail, tab.rutinas));
  const hitosGroup = node("section", "garage-group");
  hitosGroup.append(node("h3", "garage-group-sub", "Hitos · una sola vez"));
  for (const m of tab.hitos) hitosGroup.append(makeMission(state, m));
  main.append(hitosGroup);
  layout.append(rail, main);
  shell.append(layout);
  root.replaceChildren(shell);
}

export function renderMarca(root, { view, onComplete, onBack } = {}) {
  if (!root || typeof root.replaceChildren !== "function") {
    throw new TypeError("renderMarca necesita un elemento raíz del DOM.");
  }
  let state = sessions.get(root);
  if (!state) {
    state = { root, message: null, view: null, options: null, tab: "yo" };
    sessions.set(root, state);
  }
  state.options = { view, onComplete, onBack };
  paint(root, state);
  return root;
}
