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
 * Fase B (v0.56.0): la Fraseología (SRS) y el Laboratorio de Voz
 * abren de verdad, en sub-vistas del mismo panel:
 *  · FRASEOLOGÍA — la sesión de repaso espaciado (tarjetas de
 *    reconocimiento y de PRODUCCIÓN, marcas la sé / dudé / no la sé)
 *    y el formulario de «palabra robada» para guardar palabras de su
 *    vida real con su toque (§6.2: nada entra al banco sin él).
 *  · LABORATORIO — el motor HVPT de identificación con voces del
 *    dispositivo rotando y escalera por contraste (§6.1.2), el
 *    ciclo A/B con grabación LOCAL (MediaRecorder: el audio vive en
 *    la sesión, nunca sale del teléfono ni entra al save), el
 *    shadowing por niveles con su temporizador de 10 minutos
 *    (§6.1.4) y la prueba del teclado (§6.1.3).
 * HONESTIDAD (§6.1): ninguna herramienta califica su voz. El modelo
 * suena con el TTS del dispositivo (dos velocidades); lo que se
 * guarda son marcas, conteos y fechas — nunca audio, nunca notas
 * inventadas. Sin TTS o sin micrófono, la vista lo dice y el resto
 * de la Torre sigue entera.
 *
 * Fase C (v0.57.0): la Torre abre todo lo que quedaba anunciado:
 *  · DESPEGUE — la campaña de estudio (58 misiones) se abre desde
 *    su tarjeta con el sistema de campañas del juego; su progreso
 *    llega por las opciones (campaign) y se abre con onOpenCampaign.
 *  · ENTREVISTA — el banco de 18 tarjetas: la respuesta que José
 *    escribe (con su respuesta real como semilla editable, nunca
 *    autoguardada), los intentos cronometrados en la vista, las
 *    frases de rescate, el registro de simulacros y la bitácora de
 *    errores recurrentes (§6.3 y §6.4).
 *  · ESCUCHA — el catálogo de 34 fichas con el ciclo metacognitivo
 *    y el control local de 3 preguntas donde el material lo trae,
 *    más el dictado de referencia: el TTS lee el clip, José escribe
 *    lo que oyó y la comparación palabra por palabra (bolsa de
 *    palabras) le da su % — el número de su habilidad Oído (§6.4).
 *  · TABLERO — las 4 habilidades con sus niveles de Torre,
 *    derivados por src/ingles-state.js SOLO de evidencia
 *    registrada, y la medición EF SET con su registro (§6.5).
 */
import {
  SRS_DECKS, HVPT_CONTRASTS, LAB_PHRASES, LAB_PHRASE_BY_ID, KEYS_PHRASE_IDS,
  LISTEN_ACCENTS, DICTATION_CLIPS, DICTATION_BY_ID, RESCUE_PHRASES, ERROR_SOURCES
} from "../src/ingles-content.js";

const sessions = new WeakMap();

const text = (value, fallback = "") => value == null ? fallback : String(value);
const number = (value) => Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0);
const format = (value) => new Intl.NumberFormat("es-CR").format(number(value));
const deckName = (id) => (SRS_DECKS.find((d) => d.id === id)?.name) ||
  (id === "robadas" ? "Palabras robadas" : id);

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

/* El arte del ENGLISH CENTER (renombre v0.58.0, maqueta aprobada por
 * José): globo terráqueo con burbujas de diálogo y libro abierto,
 * dibujado por código (SVG en línea, sin binarios) en el azul cielo
 * #4FC3F7 de la zona y el rosa neón del juego. Arte fijo del panel:
 * no lleva datos del usuario. */
const CENTER_ART_SVG = `
<svg viewBox="0 0 340 76" role="img" aria-label="English Center: globo, burbujas de diálogo y libro abierto" focusable="false">
  <g fill="none" stroke="#4FC3F7" stroke-width="2.5">
    <circle cx="40" cy="38" r="26"/>
    <ellipse cx="40" cy="38" rx="11" ry="26"/>
    <path d="M14 38h52M19 24h42M19 52h42"/>
  </g>
  <g>
    <path d="M74 14h20a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5h-9l-7 7v-7h-4a5 5 0 0 1-5-5V19a5 5 0 0 1 5-5z" fill="#ff5da2"/>
    <circle cx="79" cy="24" r="2.2" fill="#0b1020"/>
    <circle cx="86" cy="24" r="2.2" fill="#0b1020"/>
    <circle cx="93" cy="24" r="2.2" fill="#0b1020"/>
  </g>
  <g>
    <path d="M84 46h16a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4h-3l-6 6v-6h-7a4 4 0 0 1-4-4v-8a4 4 0 0 1 4-4z" fill="#4FC3F7"/>
    <rect x="86" y="52" width="12" height="2.4" fill="#0b1020"/>
    <rect x="86" y="57" width="8" height="2.4" fill="#0b1020"/>
  </g>
  <g stroke-linejoin="round">
    <path d="M252 22c10-6 22-6 32 1v36c-10-7-22-7-32-1z" fill="#ff5da2" stroke="#ff5da2" stroke-width="2"/>
    <path d="M316 22c-10-6-22-6-32 1v36c10-7 22-7 32-1z" fill="#4FC3F7" stroke="#4FC3F7" stroke-width="2"/>
    <path d="M284 23v36" stroke="#0b1020" stroke-width="2"/>
    <path d="M258 30c7-3 13-3 20 0M258 39c7-3 13-3 20 0M290 30c7-3 13-3 20 0M290 39c7-3 13-3 20 0" fill="none" stroke="#0b1020" stroke-width="2"/>
  </g>
  <g fill="#ffd166">
    <path d="M128 18l1.8 3.7 4.1.6-3 2.9.7 4.1-3.6-1.9-3.6 1.9.7-4.1-3-2.9 4.1-.6z"/>
    <path d="M212 50l1.4 2.9 3.2.5-2.3 2.2.5 3.2-2.8-1.5-2.8 1.5.5-3.2-2.3-2.2 3.2-.5z" fill="#4FC3F7"/>
  </g>
</svg>`;

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

/* ------------------------- Audio del dispositivo -------------------------
 * TTS y grabación son del navegador: se piden al momento de usarlos
 * y todo va envuelto — sin voces o sin micrófono, la herramienta lo
 * dice y nada se rompe (el smoke de Node tampoco). */
function speech() {
  try { return globalThis.speechSynthesis || null; } catch { return null; }
}
function enVoices() {
  const s = speech();
  if (!s) return [];
  try { return s.getVoices().filter((v) => /^en([-_]|$)/i.test(v.lang || "")); }
  catch { return []; }
}
function speak(textToSay, { rate = 1, voice = null } = {}) {
  const s = speech();
  if (!s) return false;
  try {
    s.cancel();
    const u = new SpeechSynthesisUtterance(textToSay);
    u.lang = (voice && voice.lang) || "en-US";
    if (voice) u.voice = voice;
    u.rate = rate;
    s.speak(u);
    return true;
  } catch { return false; }
}

/* ============================ VISTA PRINCIPAL ============================ */

function makeHero(state, view) {
  const hero = node("header", "campaign-hero torre-hero");
  const top = node("div", "campaign-hero-top");
  const back = button("campaign-back", "← Mapa", () => state.options.onBack?.());
  back.setAttribute("aria-label", "Volver al mapa");
  top.append(back, node("span", "campaign-code", "MANZANA (2,3) / INGLÉS"));
  const content = node("div", "campaign-hero-content");
  const art = node("div", "torre-hero-art");
  art.innerHTML = CENTER_ART_SVG;
  content.append(
    art,
    node("p", "campaign-eyebrow", "ENGLISH CENTER · LANGUAGE SCHOOL · SJO"),
    node("h1", "campaign-title", "ENGLISH CENTER"),
    node("p", "campaign-subtitle", "El inglés como idioma de trabajo: voz clara, oído rápido, palabras profesionales, entrevista."),
    node("p", "campaign-goal", "La meta no es sonar gringo: es que te entiendan a la primera. Todo está desbloqueado, como en el Garaje: las rutinas se repiten con su propio reloj y pagan una vez por ciclo; los hitos pagan una sola vez. El vivo paga hasta 850 XP y ₡58 por semana (Tope de Turno): pasado el tope, la práctica se registra igual, sin paga."),
    node("p", "torre-badge", "★ Nivel · Bilingüe en formación")
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
  section.setAttribute("aria-label", "Tu English Center de un vistazo");
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
  card.append(node("h2", "torre-turno-title", view.turno.special ? "📅 Rutinas del día · viernes especial" : "📅 Rutinas del día"));
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
    card.append(node("p", "garage-week-empty", "Nada vence esta semana. El Center descansa."));
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

function makeToolEntries(state, view) {
  const wrap = node("div", "torre-tools");
  const srs = view.faseB.srs;
  const srsCard = node("section", "torre-tool-card");
  srsCard.append(
    node("h2", "torre-tool-title", "🗂️ Fraseología — tu banco SRS"),
    node("p", "torre-tool-text", `${format(srs.total)} tarjetas de tu vida real (datos, entrevista, aeropuerto, reuniones, tus verbos). ${format(srs.dueCount)} por repasar hoy · ${format(srs.graduated)} graduadas. Una tarjeta se gradúa tras 3 aciertos espaciados en la caja 5, no al primer acierto.`)
  );
  srsCard.append(button("campaign-button campaign-button--primary", "Abrir Fraseología", () => {
    state.sub = "srs";
    redraw(state.root, state);
  }));
  const hv = view.faseB.hvpt;
  const attempts = hv.reduce((a, c) => a + c.attempts, 0);
  const labCard = node("section", "torre-tool-card");
  labCard.append(
    node("h2", "torre-tool-title", "🎙️ Laboratorio de Voz"),
    node("p", "torre-tool-text", `Entrenamiento de oído HVPT (${format(attempts)} intentos registrados), ciclo A/B con grabación local, shadowing de 10 minutos y la prueba del teclado. Nadie califica tu voz: el oído se mide con respuestas correctas y la boca, con tu autoevaluación guiada.`)
  );
  labCard.append(button("campaign-button campaign-button--primary", "Abrir el Laboratorio", () => {
    state.sub = "lab";
    redraw(state.root, state);
  }));
  wrap.append(srsCard, labCard);

  /* Fase C: banco de entrevista, escucha y Tablero. */
  const fc = view.faseC;
  const bankCard = node("section", "torre-tool-card");
  bankCard.append(
    node("h2", "torre-tool-title", "🎙️ Banco de entrevista"),
    node("p", "torre-tool-text", `Las ${format(fc.bank.total)} preguntas del screening con TUS respuestas: ${format(fc.bank.answered)} escritas · ${format(fc.bank.twoPasses)} con dos pasadas grabadas. Tus respuestas reales ya vienen como semilla editable en la mayoría — nada se guarda hasta que tocás «Guardar».`)
  );
  bankCard.append(button("campaign-button campaign-button--primary", "Abrir el banco", () => {
    state.sub = "bank";
    redraw(state.root, state);
  }));
  const listenCard = node("section", "torre-tool-card");
  listenCard.append(
    node("h2", "torre-tool-title", "🎧 Escucha y dictado"),
    node("p", "torre-tool-text", `${format(fc.listen.total)} materiales reales con el ciclo predecir → escuchar → verificar → anotar (${format(fc.listen.approved)} controles aprobados) y el dictado de referencia: tu % de palabras correctas es el número de tu oído (${format(fc.listen.dictCount)} dictados registrados).`)
  );
  listenCard.append(button("campaign-button campaign-button--primary", "Abrir Escucha", () => {
    state.sub = "listen";
    redraw(state.root, state);
  }));
  const boardCard = node("section", "torre-tool-card");
  const levels = view.tablero.skills.map((s) => `${s.name} · Nivel ${format(s.level)}`).join(" — ");
  boardCard.append(
    node("h2", "torre-tool-title", "📊 Tablero de Habilidad"),
    node("p", "torre-tool-text", `Tus 4 habilidades con su Nivel, calculado solo de evidencia registrada — nunca de XP ni de auto-declaraciones: ${levels}. Acá también registras tu medición EF SET.`)
  );
  boardCard.append(button("campaign-button campaign-button--primary", "Abrir el Tablero", () => {
    state.sub = "board";
    redraw(state.root, state);
  }));
  wrap.append(bankCard, listenCard, boardCard);
  return wrap;
}

/* La tarjeta de la campaña DESPEGUE (Fase C): el progreso llega del
   sistema de campañas vía las opciones; abrirla es salir al panel
   de campaña del juego (onOpenCampaign). */
function makeDespegue(state, view) {
  const campaign = state.options.campaign;
  const wrap = node("div", "torre-tools");
  if (campaign) {
    const card = node("section", "torre-tool-card torre-despegue");
    card.append(
      node("h2", "torre-tool-title", "🚀 DESPEGUE — la campaña del Center"),
      node("p", "torre-tool-text", campaign.done >= campaign.total
        ? `¡Campaña completa! ${format(campaign.done)} de ${format(campaign.total)} misiones · rango «Bilingüe Certificado» ganado.`
        : `${format(campaign.done)} de ${format(campaign.total)} misiones · 5 fases: Voz, Fraseología, Oído, Entrevista y Medición. Sigue: «${campaign.next ? campaign.next.title : ""}». Al completarla: rango «Bilingüe Certificado».`)
    );
    card.append(button("campaign-button campaign-button--primary",
      campaign.done >= campaign.total ? "Ver la campaña completa" : "Abrir la campaña DESPEGUE",
      () => state.options.onOpenCampaign?.()));
    wrap.append(card);
  }
  const faseD = node("section", "torre-coming");
  faseD.append(node("h2", "torre-coming-title", "🔜 Próxima fase en este Center"));
  faseD.append(node("p", "torre-coming-text",
    "Fase D: Jarvis en inglés — conversación en inglés dentro del chat de Jarvis, para practicar hablando con él. Todo lo demás del Center ya abrió: vivo, Fraseología, Laboratorio, banco, escucha, Tablero y DESPEGUE."));
  wrap.append(faseD);
  return wrap;
}

function paintHome(root, state) {
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
  const rutinasHead = node("div", "torre-rutinas-head");
  rutinasHead.append(
    node("h2", "torre-rutinas-title", "📚 Rutinas del Center"),
    node("span", "torre-rutinas-count", `${format(view.rutinasTotal)} rutinas · ${format(view.hitosTotal)} hitos`)
  );
  main.append(rutinasHead);
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
  main.append(makeToolEntries(state, view));
  main.append(makeDespegue(state, view));
  layout.append(rail, main);
  shell.append(layout);
  root.replaceChildren(shell);
}

/* ============================ FRASEOLOGÍA (SRS) ============================ */

function subHeader(state, title, sub) {
  const head = node("header", "torre-sub-head");
  const back = button("campaign-back", "← Center", () => {
    stopShadow(state);
    state.sub = "home";
    redraw(state.root, state);
  });
  back.setAttribute("aria-label", "Volver al Center");
  head.append(back, node("span", "campaign-code", "ENGLISH CENTER"));
  const box = node("div", "torre-sub-title");
  box.append(node("h1", "campaign-title", title), node("p", "campaign-subtitle", sub));
  head.append(box);
  return head;
}

function srsSpeakRow(card) {
  const row = node("div", "torre-say-row");
  row.append(
    button("torre-say", "🔊 Palabra", () => {
      if (!speak(card.term, { rate: 0.85 })) row.append(node("span", "torre-nospeech", "Sin voz en este dispositivo."));
    }),
    button("torre-say", "🔊 Frase", () => {
      if (!speak(card.example || card.term, { rate: 0.95 })) row.append(node("span", "torre-nospeech", "Sin voz en este dispositivo."));
    })
  );
  return row;
}

function makeSrsSession(state) {
  const s = state.srs;
  const wrap = node("section", "torre-srs-session");
  if (!s || !s.queue.length) {
    wrap.append(node("p", "torre-tool-text", "No hay sesión armada."));
    return wrap;
  }
  if (s.finished) {
    const m = s.marks;
    wrap.append(
      node("h2", "torre-tool-title", "✅ Sesión completa"),
      node("p", "torre-tool-text", `Repasaste ${format(s.queue.length)} tarjetas: ${format(m.se)} «la sé» · ${format(m.dude)} «dudé» · ${format(m.no)} «no la sé». Las que dudaste o fallaste vuelven antes; las que sabés, se espacian.`),
      node("p", "torre-tool-text", "Si todavía no registraste hoy la rutina «Repaso de fraseología» en la lista del Center, hacelo al volver: la rutina paga por el hábito.")
    );
    wrap.append(button("campaign-button", "Armar otra sesión", () => {
      state.srs = null;
      redraw(state.root, state);
    }));
    return wrap;
  }
  const item = s.queue[s.idx];
  const card = item.card;
  const head = node("div", "torre-srs-head");
  head.append(
    node("span", "torre-srs-count", `Tarjeta ${format(s.idx + 1)} / ${format(s.queue.length)}`),
    node("span", "torre-srs-deck", `${deckName(card.deck)} · ${card.type === "prod" ? "PRODUCCIÓN" : "RECONOCIMIENTO"}${item.isNew ? " · NUEVA" : ` · CAJA ${format(item.box)}`}${item.graduated ? " · GRADUADA" : ""}`)
  );
  wrap.append(head);
  const face = node("div", "torre-srs-card");
  if (!s.flipped) {
    if (card.type === "prod") {
      face.append(
        node("p", "torre-srs-prompt", "Decila en voz alta, sin leerla:"),
        node("p", "torre-srs-term", card.meaning),
        node("p", "torre-srs-hint", "Cuando la hayás dicho, volteá la tarjeta y marcá cómo te fue.")
      );
    } else {
      face.append(
        node("p", "torre-srs-term", card.term),
        node("p", "torre-srs-pron", card.pron || ""),
        srsSpeakRow(card),
        node("p", "torre-srs-hint", "¿Qué significa? Decilo — en español o en voz alta — y volteá para verificar.")
      );
    }
    face.append(button("campaign-button campaign-button--primary", "Voltear tarjeta", () => {
      s.flipped = true;
      redraw(state.root, state);
    }));
  } else {
    face.append(
      node("p", "torre-srs-term", card.term),
      node("p", "torre-srs-pron", card.pron || ""),
      node("p", "torre-srs-meaning", card.meaning),
      node("p", "torre-srs-example", card.example || ""),
      srsSpeakRow(card)
    );
    const marks = node("div", "torre-srs-marks");
    const mark = async (value, label) => {
      await state.options.onMutate?.({ type: "ingles.srsMark", cardId: card.id, mark: value });
      s.marks[value] += 1;
      s.idx += 1;
      s.flipped = false;
      if (s.idx >= s.queue.length) s.finished = true;
      redraw(state.root, state);
    };
    marks.append(
      button("torre-mark torre-mark--ok", "La sé ✓", () => mark("se")),
      button("torre-mark", "Dudé", () => mark("dude")),
      button("torre-mark torre-mark--no", "No la sé", () => mark("no"))
    );
    face.append(marks);
  }
  wrap.append(face);
  return wrap;
}

function makeSrsView(root, state) {
  const view = state.options.view;
  state.view = view;
  const shell = node("div", "campaign-shell torre-shell");
  shell.append(subHeader(state, "🗂️ FRASEOLOGÍA", "Tu fraseología profesional: frases completas y producción, con graduación por aciertos espaciados."));
  if (state.message) {
    shell.append(node("p", `campaign-message campaign-message--${state.message.kind || "info"}`, state.message.text));
  }
  const srs = view.faseB.srs;
  const stats = node("section", "torre-tool-card");
  stats.append(
    node("h2", "torre-tool-title", "Tu banco de un vistazo"),
    node("p", "torre-tool-text", `${format(srs.dueCount)} por repasar hoy · ${format(srs.newCount)} nuevas por conocer · ${format(srs.graduated)} graduadas de ${format(srs.total)}. Cajas: 1 diaria · 2 a 2 días · 3 a 4 días · 4 a 7 días · 5 a 15 días. En la caja 5, graduarse pide 3 aciertos en días distintos.`)
  );
  for (const d of srs.decks) {
    const row = node("div", "torre-deck-row");
    row.append(
      node("span", "torre-deck-name", `${d.icon} ${d.name}`),
      node("span", "torre-deck-count", `${format(d.graduated)} graduadas · ${format(d.seen)}/${format(d.total)} vistas`)
    );
    stats.append(row);
  }
  shell.append(stats);

  if (state.srs) {
    shell.append(makeSrsSession(state));
  } else {
    const start = node("section", "torre-tool-card");
    start.append(
      node("h2", "torre-tool-title", "Sesión de repaso"),
      node("p", "torre-tool-text", "La sesión mezcla decks — datos, entrevista, aeropuerto — porque la palabra tiene que salir en la llamada real, no solo en su lista. Si no hay vencidas, presenta tarjetas nuevas.")
    );
    start.append(button("campaign-button campaign-button--primary", "Empezar sesión", () => {
      const queue = state.options.getSrsSession?.() || [];
      state.srs = { queue, idx: 0, flipped: false, finished: queue.length === 0, marks: { se: 0, dude: 0, no: 0 } };
      if (!queue.length) state.message = { text: "No hay tarjetas por repasar ni nuevas por ahora. Volvé mañana.", kind: "info" };
      redraw(state.root, state);
    }));
    shell.append(start);
  }

  /* Palabra robada (§6.2): nada entra al banco sin su toque. */
  const form = state.srsForm || (state.srsForm = { term: "", meaning: "", example: "" });
  const steal = node("section", "torre-tool-card");
  steal.append(
    node("h2", "torre-tool-title", "🕵️ Palabra robada"),
    node("p", "torre-tool-text", "¿Oíste una palabra o frase en el trabajo o en un video? Guardala con tu propia frase: entra a tu banco como tarjeta de producción.")
  );
  const mkInput = (key, placeholder, max) => {
    const input = node("input", "torre-input");
    input.type = "text";
    input.placeholder = placeholder;
    input.maxLength = max;
    input.value = form[key];
    input.addEventListener("input", () => { form[key] = input.value; });
    return input;
  };
  steal.append(
    mkInput("term", "La palabra o frase en inglés", 80),
    mkInput("meaning", "Qué significa, en tus palabras", 160),
    mkInput("example", "Tu frase con ella (opcional)", 200)
  );
  steal.append(button("campaign-button", "Guardar en mi banco", async () => {
    const result = await state.options.onMutate?.({
      type: "ingles.srsAdd",
      term: form.term, meaning: form.meaning, example: form.example
    });
    if (result && result.kind === "error") {
      state.message = result;
    } else {
      state.srsForm = { term: "", meaning: "", example: "" };
      state.message = { text: "Guardada en tu banco: entra en tu próxima sesión como tarjeta nueva.", kind: "success" };
    }
    redraw(state.root, state);
  }));
  shell.append(steal);
  root.replaceChildren(shell);
}

/* ============================ LABORATORIO DE VOZ ============================ */

function labState(state) {
  if (!state.lab) {
    state.lab = {
      mode: "ab",
      phraseId: LAB_PHRASES[0].id,
      recUrl: null, recording: false, recMsg: null,
      hvpt: { contrastId: HVPT_CONTRASTS[0].id, cur: null, feedback: null, count: 0, correct: 0, usedVoices: [] },
      shadow: { level: 1, running: false, left: 600, timers: [] },
      keys: { values: {}, result: null }
    };
  }
  return state.lab;
}

/* Grabación local: el audio vive en un blob de la sesión. Nunca se
 * sube, nunca entra al save (§6.1). */
let media = { recorder: null, chunks: [], stream: null };
async function toggleRecord(state) {
  const lab = labState(state);
  if (lab.recording && media.recorder) {
    try { media.recorder.stop(); } catch { /* ya detenido */ }
    return;
  }
  try {
    if (!globalThis.navigator?.mediaDevices?.getUserMedia || typeof globalThis.MediaRecorder !== "function") {
      lab.recMsg = "Este dispositivo no expone grabación al navegador. Practicá el ciclo sin grabar: modelo → tu voz → autoevaluación.";
      redraw(state.root, state);
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    media = { recorder: new MediaRecorder(stream), chunks: [], stream };
    media.recorder.addEventListener("dataavailable", (e) => { if (e.data && e.data.size) media.chunks.push(e.data); });
    media.recorder.addEventListener("stop", () => {
      try { media.stream?.getTracks().forEach((t) => t.stop()); } catch { /* nada */ }
      lab.recording = false;
      try {
        if (media.chunks.length && globalThis.URL?.createObjectURL) {
          if (lab.recUrl) { try { URL.revokeObjectURL(lab.recUrl); } catch { /* nada */ } }
          lab.recUrl = URL.createObjectURL(new Blob(media.chunks, { type: media.chunks[0].type || "audio/webm" }));
        }
      } catch { lab.recUrl = null; }
      lab.recMsg = "Grabación lista: escuchala contra el modelo.";
      redraw(state.root, state);
    });
    media.recorder.start();
    lab.recording = true;
    lab.recMsg = "Grabando… tu voz queda en este teléfono, en esta sesión.";
  } catch {
    lab.recording = false;
    lab.recMsg = "No se pudo usar el micrófono (permiso o dispositivo). El ciclo sigue sin grabación.";
  }
  redraw(state.root, state);
}

function playRecording(state) {
  const lab = labState(state);
  if (!lab.recUrl) return;
  try { new Audio(lab.recUrl).play(); }
  catch { lab.recMsg = "No se pudo reproducir la grabación en este dispositivo."; redraw(state.root, state); }
}

/* ------------------------------- Shadowing ------------------------------- */

function stopShadow(state) {
  const lab = state.lab;
  if (!lab) return;
  for (const t of lab.shadow.timers) { try { clearTimeout(t); clearInterval(t); } catch { /* nada */ } }
  lab.shadow.timers = [];
  lab.shadow.running = false;
  try { speech()?.cancel(); } catch { /* nada */ }
}

function startShadow(state) {
  const lab = labState(state);
  const sh = lab.shadow;
  stopShadow(state);
  if (!speech()) {
    lab.recMsg = "Sin voz (TTS) en este dispositivo no hay modelo para el shadowing.";
    redraw(state.root, state);
    return;
  }
  sh.running = true;
  sh.left = 600;
  let idx = 0;
  const rate = sh.level === 1 ? 0.85 : sh.level === 2 ? 0.95 : 1.0;
  const speakNext = () => {
    if (!sh.running) return;
    if (sh.left <= 30) return; // el cierre es habla libre, sin modelo
    const phrase = LAB_PHRASES[idx % LAB_PHRASES.length];
    idx += 1;
    const el = state.root.querySelector?.(".torre-shadow-now");
    if (el) el.textContent = sh.level === 2 ? "🎧 (a ciegas: solo oído y voz)" : sh.level === 3 ? phrase.marked : phrase.text;
    speak(phrase.text, { rate });
    sh.timers.push(setTimeout(speakNext, 9000));
  };
  speakNext();
  const clock = setInterval(() => {
    sh.left -= 1;
    const el = state.root.querySelector?.(".torre-shadow-clock");
    if (el) {
      const mm = String(Math.floor(Math.max(0, sh.left) / 60)).padStart(2, "0");
      const ss = String(Math.max(0, sh.left) % 60).padStart(2, "0");
      el.textContent = `${mm}:${ss}${sh.left <= 30 && sh.left > 0 ? " · cierre: 30 s hablando libre del mismo tema" : ""}`;
    }
    if (sh.left <= 0) {
      stopShadow(state);
      lab.recMsg = "Sesión de shadowing completa: 10 minutos. Si todavía no registraste la rutina «Shadowing de turno», hacelo al volver al Center.";
      redraw(state.root, state);
    }
  }, 1000);
  sh.timers.push(clock);
  redraw(state.root, state);
}

function makeShadow(state) {
  const lab = labState(state);
  const sh = lab.shadow;
  const card = node("section", "torre-tool-card");
  card.append(
    node("h2", "torre-tool-title", "🔁 Shadowing · protocolo de 10 minutos"),
    node("p", "torre-tool-text", "La dosis que funcionó en la investigación: 10 minutos repitiendo contra el modelo, grabándote. Material: tus frases del laboratorio, en rotación. Los últimos 30 segundos son habla libre del mismo tema.")
  );
  const levels = node("div", "torre-mode-row");
  for (const [lvl, label] of [[1, "N1 · Eco con texto"], [2, "N2 · Eco a ciegas"], [3, "N3 · Prosodia marcada"]]) {
    const b = button(`torre-mode ${sh.level === lvl ? "torre-mode--on" : ""}`, label, () => {
      sh.level = lvl;
      redraw(state.root, state);
    });
    levels.append(b);
  }
  card.append(levels);
  card.append(node("p", "torre-shadow-clock", sh.running ? "10:00" : "10:00 · listo"));
  card.append(node("p", "torre-shadow-now", sh.running ? "" : "El modelo suena frase por frase; repetí en voz alta, casi encima de él."));
  const row = node("div", "torre-say-row");
  if (sh.running) {
    row.append(button("campaign-button", "Detener sesión", () => { stopShadow(state); redraw(state.root, state); }));
  } else {
    row.append(button("campaign-button campaign-button--primary", "Empezar los 10 minutos", () => startShadow(state)));
  }
  row.append(button("torre-say", lab.recording ? "⏹ Detener grabación" : "🎙️ Grabarme", () => toggleRecord(state)));
  card.append(row);
  return card;
}

/* --------------------------------- Ciclo A/B --------------------------------- */

function makeAB(state) {
  const lab = labState(state);
  const phrase = LAB_PHRASE_BY_ID.get(lab.phraseId) || LAB_PHRASES[0];
  const card = node("section", "torre-tool-card");
  card.append(
    node("h2", "torre-tool-title", "🎙️ Ciclo A/B · escuchar → grabar → comparar"),
    node("p", "torre-tool-text", "El modelo suena a dos velocidades. Grabate, escuchá ambos seguidos (modelo–yo, modelo–yo) y marcá cómo salió con la lista de chequeo de ESTA frase. Esa marca es tu medición honesta: nadie más califica tu voz.")
  );
  const chips = node("div", "torre-chip-row");
  for (const p of LAB_PHRASES) {
    const chip = button(`torre-chip ${p.id === phrase.id ? "torre-chip--on" : ""}`, p.text, () => {
      lab.phraseId = p.id;
      redraw(state.root, state);
    });
    chips.append(chip);
  }
  card.append(chips);
  card.append(node("p", "torre-lab-marked", phrase.marked));
  const row = node("div", "torre-say-row");
  row.append(
    button("torre-say", "🔊 Modelo · clara", () => { if (!speak(phrase.text, { rate: 0.8 })) { lab.recMsg = "Sin voz (TTS) en este dispositivo."; redraw(state.root, state); } }),
    button("torre-say", "🔊 Modelo · real", () => { if (!speak(phrase.text, { rate: 1 })) { lab.recMsg = "Sin voz (TTS) en este dispositivo."; redraw(state.root, state); } }),
    button("torre-say", lab.recording ? "⏹ Detener" : "🎙️ Grabarme", () => toggleRecord(state)),
    button("torre-say", "▶️ Mi grabación", () => playRecording(state))
  );
  card.append(row);
  if (lab.recMsg) card.append(node("p", "torre-lab-msg", lab.recMsg));
  const checks = node("div", "torre-checks");
  checks.append(node("p", "torre-checks-title", "Autoevaluación guiada de esta frase:"));
  for (const c of phrase.checks) checks.append(node("p", "torre-check", `· ${c}`));
  const marks = node("div", "torre-srs-marks");
  const voiceOf = state.view.faseB;
  marks.append(
    button("torre-mark torre-mark--ok", "Se oyó ✓", async () => { await state.options.onMutate?.({ type: "ingles.voiceMark", phraseId: phrase.id, mark: "bien" }); lab.recMsg = "Marca guardada: «se oyó»."; redraw(state.root, state); }),
    button("torre-mark", "Más o menos", async () => { await state.options.onMutate?.({ type: "ingles.voiceMark", phraseId: phrase.id, mark: "medio" }); lab.recMsg = "Marca guardada: «más o menos» — vuelve en tu próxima práctica."; redraw(state.root, state); }),
    button("torre-mark torre-mark--no", "No salió", async () => { await state.options.onMutate?.({ type: "ingles.voiceMark", phraseId: phrase.id, mark: "no" }); lab.recMsg = "Marca guardada: «no salió» — esta frase pide otra vuelta hoy."; redraw(state.root, state); })
  );
  checks.append(marks);
  checks.append(node("p", "torre-tool-text", `Frases marcadas hasta hoy: ${format(voiceOf.voice.marked)} de ${format(voiceOf.voice.phrases)} · con «se oyó»: ${format(voiceOf.voice.bien)}.`));
  card.append(checks);
  return card;
}

/* ----------------------------------- HVPT ----------------------------------- */

function hvptPlay(state, contrast) {
  const lab = labState(state);
  const hv = lab.hvpt;
  const pairIdx = Math.floor(Math.random() * contrast.pairs.length);
  const played = Math.random() < 0.5 ? "a" : "b";
  const pair = contrast.pairs[pairIdx];
  const view = state.view.faseB.hvpt.find((c) => c.id === contrast.id);
  const level = view ? view.level : 1;
  const voices = enVoices();
  let voice = null;
  if (voices.length) {
    const fresh = voices.filter((v) => !hv.usedVoices.includes(v.name));
    voice = (level === 3 && fresh.length ? fresh[0] : voices[Math.floor(Math.random() * voices.length)]);
    if (voice && !hv.usedVoices.includes(voice.name)) hv.usedVoices.push(voice.name);
  }
  const sentence = played === "a" ? pair.sa : pair.sb;
  const word = played === "a" ? pair.a : pair.b;
  const spoken = contrast.stress || level >= 2 ? sentence : word;
  const ok = speak(spoken, { rate: level === 1 ? 0.8 : 1, voice });
  hv.cur = { pairIdx, played, heard: ok };
  hv.feedback = null;
  return ok;
}

function makeHVPT(state) {
  const lab = labState(state);
  const hv = lab.hvpt;
  const card = node("section", "torre-tool-card");
  card.append(
    node("h2", "torre-tool-title", "👂 HVPT · oído con voces rotando"),
    node("p", "torre-tool-text", "Suena UNA palabra (o frase) con una voz distinta cada vez: tocá cuál oíste. La escalera sube al sostener ≥85% en 20 intentos y baja si cae bajo 60%: nivel 1, palabra sola y clara · nivel 2, en frase a velocidad real · nivel 3, voz nueva en frase.")
  );
  const chips = node("div", "torre-chip-row");
  for (const c of HVPT_CONTRASTS) {
    const v = state.view.faseB.hvpt.find((x) => x.id === c.id);
    const chip = button(`torre-chip ${hv.contrastId === c.id ? "torre-chip--on" : ""}`,
      `${c.name} · N${format(v ? v.level : 1)}${v && v.windowPct != null ? ` · ${format(v.windowPct)}%` : ""}`,
      () => {
        hv.contrastId = c.id;
        hv.cur = null;
        hv.feedback = null;
        redraw(state.root, state);
      });
    chips.append(chip);
  }
  card.append(chips);
  const contrast = HVPT_CONTRASTS.find((c) => c.id === hv.contrastId) || HVPT_CONTRASTS[0];
  card.append(node("p", "torre-tool-text", contrast.detail));
  const view = state.view.faseB.hvpt.find((c) => c.id === contrast.id);
  card.append(node("p", "torre-hvpt-status",
    `Nivel ${format(view ? view.level : 1)} · ventana: ${format(view ? view.windowCount : 0)}/20 intentos${view && view.windowPct != null ? ` · ${format(view.windowPct)}% en la ventana` : ""} · histórico: ${format(view ? view.correct : 0)}/${format(view ? view.attempts : 0)}`));

  if (!hv.cur) {
    card.append(button("campaign-button campaign-button--primary", "🔊 Escuchar el intento", () => {
      const ok = hvptPlay(state, contrast);
      if (!ok) lab.recMsg = "Sin voz (TTS) en este dispositivo: el HVPT necesita el modelo sonoro.";
      redraw(state.root, state);
    }));
  } else {
    const pair = contrast.pairs[hv.cur.pairIdx];
    card.append(node("p", "torre-tool-text", hv.feedback ? "" : "¿Cuál oíste?"));
    const opts = node("div", "torre-srs-marks");
    for (const side of ["a", "b"]) {
      const label = contrast.stress ? (side === "a" ? pair.ma : pair.mb) : pair[side];
      opts.append(button("torre-mark", label, async () => {
        if (hv.feedback) return;
        const correct = hv.cur.played === side;
        hv.count += 1;
        if (correct) hv.correct += 1;
        hv.feedback = { correct, playedWord: pair[hv.cur.played] };
        await state.options.onMutate?.({
          type: "ingles.hvptAttempt", contrastId: contrast.id,
          pairIdx: hv.cur.pairIdx, played: hv.cur.played, picked: side
        });
        redraw(state.root, state);
      }));
    }
    card.append(opts);
    card.append(button("torre-say", "🔊 Oírlo de nuevo", () => {
      const pair2 = contrast.pairs[hv.cur.pairIdx];
      const sentence = hv.cur.played === "a" ? pair2.sa : pair2.sb;
      const word = hv.cur.played === "a" ? pair2.a : pair2.b;
      const lvl = view ? view.level : 1;
      speak(contrast.stress || lvl >= 2 ? sentence : word, { rate: lvl === 1 ? 0.8 : 1 });
    }));
    if (hv.feedback) {
      card.append(node("p", `torre-hvpt-feedback ${hv.feedback.correct ? "torre-hvpt-feedback--ok" : "torre-hvpt-feedback--no"}`,
        hv.feedback.correct ? `✓ Era «${hv.feedback.playedWord}».` : `✗ Era «${hv.feedback.playedWord}». El oído se entrena así: intento, feedback, otro intento.`));
      card.append(node("p", "torre-tool-text", `Sesión: ${format(hv.correct)}/${format(hv.count)} correctos.`));
      card.append(button("campaign-button campaign-button--primary", "Siguiente intento →", () => {
        hvptPlay(state, contrast);
        redraw(state.root, state);
      }));
    }
  }
  if (lab.recMsg) card.append(node("p", "torre-lab-msg", lab.recMsg));
  return card;
}

/* ----------------------------- Prueba del teclado ----------------------------- */

const normalizeText = (s) => String(s || "").toLowerCase().replace(/[.,!?¿¡'’""]/g, "").replace(/\s+/g, " ").trim();

function makeKeys(state) {
  const lab = labState(state);
  const keys = lab.keys;
  const card = node("section", "torre-tool-card");
  card.append(
    node("h2", "torre-tool-title", "⌨️ Prueba del teclado · el espejo"),
    node("p", "torre-tool-text", "Dictale cada frase a tu teclado en inglés (el micrófono de Gboard, fuera del juego). Si el teclado la escribe tal cual, un reconocedor entrenado con millones de voces te entendió a la primera: el mejor espejo de inteligibilidad que hay sin pagar nada. Es opcional: si el teclado o la red fallan, el ciclo A/B sigue siendo tu medición.")
  );
  const phrases = KEYS_PHRASE_IDS.map((id) => LAB_PHRASE_BY_ID.get(id)).filter(Boolean);
  phrases.forEach((p, i) => {
    const row = node("div", "torre-keys-row");
    row.append(node("p", "torre-keys-phrase", `${format(i + 1)}. ${p.text}`));
    const input = node("input", "torre-input");
    input.type = "text";
    input.placeholder = "Dictá o escribí lo que el teclado entendió…";
    input.value = keys.values[i] || "";
    input.addEventListener("input", () => { keys.values[i] = input.value; keys.result = null; });
    row.append(input);
    if (keys.result) {
      const ok = normalizeText(keys.values[i]) === normalizeText(p.text);
      row.append(node("p", `torre-hvpt-feedback ${ok ? "torre-hvpt-feedback--ok" : "torre-hvpt-feedback--no"}`,
        ok ? "✓ Limpia: salió tal cual." : "✗ No salió limpia: compará palabra por palabra."));
    }
    card.append(row);
  });
  const last = state.view.faseB.keys.last;
  if (last) {
    card.append(node("p", "torre-tool-text", `Última prueba registrada: ${format(last.clean)}/${format(last.total)} limpias · ${fmtDate(last.date)}.`));
  }
  const row = node("div", "torre-say-row");
  row.append(button("campaign-button", "Comparar", () => {
    let clean = 0;
    phrases.forEach((p, i) => { if (normalizeText(keys.values[i]) === normalizeText(p.text)) clean += 1; });
    keys.result = { clean, total: phrases.length };
    redraw(state.root, state);
  }));
  if (keys.result) {
    row.append(button("campaign-button campaign-button--primary", `Registrar resultado · ${format(keys.result.clean)}/${format(keys.result.total)}`, async () => {
      await state.options.onMutate?.({ type: "ingles.keysTest", clean: keys.result.clean, total: keys.result.total });
      lab.recMsg = "Resultado registrado: tu tendencia queda en el Center.";
      keys.result = null;
      redraw(state.root, state);
    }));
  }
  card.append(row);
  return card;
}

/* --------------------------------- La vista --------------------------------- */

function makeLabView(root, state) {
  const view = state.options.view;
  state.view = view;
  const lab = labState(state);
  const shell = node("div", "campaign-shell torre-shell");
  shell.append(subHeader(state, "🎙️ LABORATORIO DE VOZ", "El gimnasio: oído, boca y espejo. Nada de esto paga por sí solo — las rutinas del Center pagan el hábito de venir."));
  if (state.message) {
    shell.append(node("p", `campaign-message campaign-message--${state.message.kind || "info"}`, state.message.text));
  }
  const modes = node("div", "torre-mode-row");
  for (const [mode, label] of [["ab", "🎙️ Ciclo A/B + Shadowing"], ["hvpt", "👂 HVPT"], ["keys", "⌨️ Prueba del teclado"]]) {
    modes.append(button(`torre-mode ${lab.mode === mode ? "torre-mode--on" : ""}`, label, () => {
      if (lab.mode !== mode) stopShadow(state);
      lab.mode = mode;
      redraw(state.root, state);
    }));
  }
  shell.append(modes);
  if (lab.mode === "ab") {
    shell.append(makeAB(state), makeShadow(state));
  } else if (lab.mode === "hvpt") {
    shell.append(makeHVPT(state));
  } else {
    shell.append(makeKeys(state));
  }
  root.replaceChildren(shell);
}

/* ============================ BANCO DE ENTREVISTA ============================
 * §6.3: las 18 tarjetas con la respuesta que José ESCRIBE. La semilla
 * (su respuesta real) se muestra editable pero NO se guarda sola:
 * solo entra a su banco cuando toca «Guardar». Los intentos se
 * cronometran en la vista (Date.now, sin intervalos) y se registran
 * con ingles.bankTry — el tiempo es suyo, declarado por su toque. */

const fmtSecs = (s) => `${Math.floor(s / 60)}:${String(Math.max(0, s % 60)).padStart(2, "0")}`;

function bankDraft(state, q) {
  if (!state.bankDraft) state.bankDraft = {};
  if (state.bankDraft[q.id] === undefined) {
    state.bankDraft[q.id] = q.answer || q.seed || "";
  }
  return state.bankDraft[q.id];
}

function makeBankQuestion(state, q, index) {
  const card = node("section", "torre-tool-card");
  const head = node("div", "torre-srs-head");
  head.append(
    node("span", "torre-srs-count", `Tarjeta ${format(index + 1)} / 18`),
    node("span", "torre-srs-deck", q.target ? `META ~${format(q.target)} s` : "SIN META DE TIEMPO")
  );
  card.append(head);
  card.append(node("h3", "torre-bank-q", q.q));
  card.append(node("p", "torre-tool-text", q.hint));
  const sayRow = node("div", "torre-say-row");
  sayRow.append(button("torre-say", "🔊 Oír la pregunta", () => {
    if (!speak(q.q, { rate: 0.95 })) card.append(node("p", "torre-nospeech", "Sin voz en este dispositivo."));
  }));
  card.append(sayRow);

  const draft = bankDraft(state, q);
  const area = node("textarea", "torre-input torre-textarea");
  area.rows = 5;
  area.maxLength = 2000;
  area.value = draft;
  area.placeholder = "Escribí TU respuesta, con tus números y tu voz…";
  area.addEventListener("input", () => { state.bankDraft[q.id] = area.value; });
  card.append(area);
  if (q.seed && !q.answer) {
    card.append(node("p", "torre-tool-text", "✍️ Esto es tu respuesta real de la preparación de Envista, como semilla: editala a tu voz de hoy y guardala. Nada se guarda solo."));
  }
  const actions = node("div", "torre-say-row");
  actions.append(button("campaign-button", q.answer ? "Actualizar mi respuesta" : "Guardar mi respuesta", async () => {
    const result = await state.options.onMutate?.({ type: "ingles.bankSave", qid: q.id, answer: state.bankDraft[q.id] });
    if (result && result.kind === "error") state.message = result;
    else {
      delete state.bankDraft[q.id];
      state.message = { text: "Respuesta guardada en tu banco.", kind: "success" };
    }
    redraw(state.root, state);
  }));
  if (state.bankTimer && state.bankTimer.qid === q.id) {
    actions.append(button("campaign-button campaign-button--primary", "⏹ Terminar intento y registrar", async () => {
      const secs = Math.max(5, Math.round((Date.now() - state.bankTimer.startedAt) / 1000));
      state.bankTimer = null;
      const result = await state.options.onMutate?.({ type: "ingles.bankTry", qid: q.id, secs });
      if (result && result.kind === "error") state.message = result;
      else state.message = { text: `Intento registrado: ${fmtSecs(secs)}. La segunda pasada de la misma tarjeta es la que hace el trabajo.`, kind: "success" };
      redraw(state.root, state);
    }));
    card.append(node("p", "torre-lab-msg", "⏱ Intento corriendo: respondé en voz alta, de corrido, y tocá «Terminar» al cerrar."));
  } else {
    actions.append(button("campaign-button", "▶ Empezar intento cronometrado", () => {
      state.bankTimer = { qid: q.id, startedAt: Date.now() };
      redraw(state.root, state);
    }));
  }
  card.append(actions);
  const meta = [];
  meta.push(q.tries ? `${format(q.tries)} intento${q.tries === 1 ? "" : "s"}` : "Sin intentos todavía");
  if (q.bestSecs != null) meta.push(`mejor: ${fmtSecs(q.bestSecs)}`);
  if (q.twoPasses) meta.push("✓ dos pasadas");
  card.append(node("p", "garage-mission-meta", meta.join(" · ")));
  return card;
}

function makeMockCard(state, view) {
  const fc = view.faseC;
  if (!state.mockForm) state.mockForm = { min: "", sec: "", pauses: "" };
  const form = state.mockForm;
  const card = node("section", "torre-tool-card");
  card.append(
    node("h2", "torre-tool-title", "🎬 Simulacro completo"),
    node("p", "torre-tool-text", "El mock entero de corrido (pitch + estrella + brecha + salario + tus preguntas), grabado con el teléfono. Al terminar, registrá acá el tiempo total y cuántas pausas largas (>3 s) contaste al escucharlo. Ese registro alimenta tu Tablero, el hito «Primer simulacro completo» y la misión final de la fase Entrevista de DESPEGUE.")
  );
  if (fc.mock.count) {
    const last = fc.mock.last;
    card.append(node("p", "torre-tool-text", `Simulacros registrados: ${format(fc.mock.count)} · último: ${fmtSecs(last.secs)} con ${format(last.pauses)} pausas largas · ${fmtDate(last.date)}.`));
  }
  const row = node("div", "torre-say-row");
  const mkNum = (key, placeholder, max) => {
    const input = node("input", "torre-input torre-num");
    input.type = "number";
    input.min = "0";
    input.max = String(max);
    input.placeholder = placeholder;
    input.value = form[key];
    input.addEventListener("input", () => { form[key] = input.value; });
    return input;
  };
  row.append(mkNum("min", "min", 59), mkNum("sec", "seg", 59), mkNum("pauses", "pausas >3 s", 99));
  card.append(row);
  card.append(button("campaign-button campaign-button--primary", "Registrar simulacro", async () => {
    const secs = (Number(form.min) || 0) * 60 + (Number(form.sec) || 0);
    const pauses = Number(form.pauses);
    if (secs < 60 || !Number.isSafeInteger(pauses) || pauses < 0) {
      state.message = { text: "Registrá el tiempo total (mínimo 1 minuto) y el número de pausas largas.", kind: "error" };
      redraw(state.root, state);
      return;
    }
    const result = await state.options.onMutate?.({ type: "ingles.mock", secs, pauses });
    if (result && result.kind === "error") state.message = result;
    else {
      state.mockForm = { min: "", sec: "", pauses: "" };
      state.message = { text: "Simulacro registrado en tu Tablero.", kind: "success" };
    }
    redraw(state.root, state);
  }));
  return card;
}

function makeErrorLog(state, view) {
  const fc = view.faseC;
  if (!state.errForm) state.errForm = { text: "", source: "dictogloss" };
  const form = state.errForm;
  const card = node("section", "torre-tool-card");
  card.append(
    node("h2", "torre-tool-title", "📓 Bitácora de errores"),
    node("p", "torre-tool-text", "Tus errores recurrentes, anotados donde aparecen: el hueco del dictogloss, la frase del simulacro que transcribiste, lo que el A/B te mostró, la palabra de la llamada real. Lo que se repite acá es lo que tu próximo turno ataca.")
  );
  if (!fc.errors.length) {
    card.append(node("p", "torre-tool-text", "Bitácora vacía por ahora: el primer hueco que anotes empieza tu mapa de errores."));
  }
  for (const e of fc.errors) {
    const row = node("div", "torre-deck-row");
    row.append(
      node("span", "torre-deck-name", e.text),
      node("span", "torre-deck-count", `${ERROR_SOURCES[e.source] || e.source} · ${fmtDate(e.date)}`)
    );
    row.append(button("torre-say", "Quitar", async () => {
      await state.options.onMutate?.({ type: "ingles.errorRemove", errorId: e.id });
      redraw(state.root, state);
    }));
    card.append(row);
  }
  const input = node("input", "torre-input");
  input.type = "text";
  input.maxLength = 300;
  input.placeholder = "El error, en pocas palabras (ej.: «me como el -ed de worked»)…";
  input.value = form.text;
  input.addEventListener("input", () => { form.text = input.value; });
  card.append(input);
  const srcRow = node("div", "torre-chip-row");
  for (const [id, label] of Object.entries(ERROR_SOURCES)) {
    srcRow.append(button(`torre-chip ${form.source === id ? "torre-chip--on" : ""}`, label, () => {
      form.source = id;
      redraw(state.root, state);
    }));
  }
  card.append(srcRow);
  card.append(button("campaign-button", "Anotar en la bitácora", async () => {
    const result = await state.options.onMutate?.({ type: "ingles.errorAdd", text: form.text, source: form.source });
    if (result && result.kind === "error") state.message = result;
    else {
      state.errForm = { text: "", source: form.source };
      state.message = { text: "Anotado: ese hueco ya tiene nombre.", kind: "success" };
    }
    redraw(state.root, state);
  }));
  return card;
}

function makeBankView(root, state) {
  const view = state.options.view;
  state.view = view;
  const shell = node("div", "campaign-shell torre-shell");
  shell.append(subHeader(state, "🎙️ BANCO DE ENTREVISTA", "Tus 18 respuestas, escritas por vos y dichas en voz alta: la segunda pasada es donde la forma aparece."));
  if (state.message) {
    shell.append(node("p", `campaign-message campaign-message--${state.message.kind || "info"}`, state.message.text));
  }
  const rescue = node("section", "torre-tool-card");
  rescue.append(
    node("h2", "torre-tool-title", "🛟 Frases de rescate"),
    node("p", "torre-tool-text", "Cuando una palabra no sale, estas tres frases te dan tiempo sin sonar perdido. Decilas hasta que salgan solas.")
  );
  for (const phrase of RESCUE_PHRASES) {
    const row = node("div", "torre-say-row");
    row.append(
      node("span", "torre-rescue", phrase),
      button("torre-say", "🔊", () => speak(phrase, { rate: 0.9 }))
    );
    rescue.append(row);
  }
  shell.append(rescue);
  view.faseC.bank.questions.forEach((q, i) => shell.append(makeBankQuestion(state, q, i)));
  shell.append(makeMockCard(state, view));
  shell.append(makeErrorLog(state, view));
  root.replaceChildren(shell);
}

/* ============================ ESCUCHA Y DICTADO ============================
 * §6.4: el catálogo con el ciclo metacognitivo y, donde el material
 * lo trae, un control local de 3 preguntas — la única «nota» de la
 * zona que no es autoevaluación, porque las respuestas están en el
 * contenido. El dictado de referencia compara por bolsa de palabras:
 * el % y las palabras que se escaparon son el feedback. */

function dictScore(targetText, heardText) {
  const words = (s) => normalizeText(s).split(" ").filter(Boolean);
  const target = words(targetText);
  const bag = new Map();
  for (const w of words(heardText)) bag.set(w, (bag.get(w) || 0) + 1);
  let hit = 0;
  const missed = [];
  for (const w of target) {
    if ((bag.get(w) || 0) > 0) { hit += 1; bag.set(w, bag.get(w) - 1); }
    else missed.push(w);
  }
  return { pct: target.length ? Math.round((hit / target.length) * 100) : 0, missed, total: target.length };
}

function makeDictation(state, view) {
  if (!state.dict) state.dict = { clipId: "dic-5", heard: "", result: null };
  const d = state.dict;
  const clip = DICTATION_BY_ID.get(d.clipId) || DICTATION_CLIPS[0];
  const fc = view.faseC;
  const card = node("section", "torre-tool-card");
  card.append(
    node("h2", "torre-tool-title", "✍️ Dictado de referencia"),
    node("p", "torre-tool-text", "El modelo lee el clip a velocidad real (el botón lento es solo para rescatar un tramo). Escribí todo lo que oigas SIN mirar el texto, compará y registrá tu %: ese número alimenta tu habilidad Oído y abre la misión «Dictado a ciegas» de DESPEGUE. El clip largo (dic-5) es la referencia de la zona.")
  );
  const chips = node("div", "torre-chip-row");
  for (const c of DICTATION_CLIPS) {
    const best = fc.listen.dictBest[c.id];
    chips.append(button(`torre-chip ${clip.id === c.id ? "torre-chip--on" : ""}`,
      `${c.title}${best != null ? ` · mejor ${format(best)}%` : ""}`,
      () => { d.clipId = c.id; d.result = null; redraw(state.root, state); }));
  }
  card.append(chips);
  const sayRow = node("div", "torre-say-row");
  sayRow.append(
    button("torre-say", "🔊 Escuchar a velocidad real", () => { if (!speak(clip.text, { rate: 1 })) card.append(node("p", "torre-nospeech", "Sin voz en este dispositivo.")); }),
    button("torre-say", "🔊 Rescate lento (0.8×)", () => speak(clip.text, { rate: 0.8 }))
  );
  card.append(sayRow);
  const area = node("textarea", "torre-input torre-textarea");
  area.rows = 5;
  area.placeholder = "Escribí lo que oíste, frase por frase…";
  area.value = d.heard;
  area.addEventListener("input", () => { d.heard = area.value; d.result = null; });
  card.append(area);
  const actions = node("div", "torre-say-row");
  actions.append(button("campaign-button", "Comparar con el original", () => {
    if (!d.heard.trim()) {
      state.message = { text: "Escribí primero lo que oíste: el dictado es escribir sin mirar.", kind: "error" };
    } else {
      d.result = dictScore(clip.text, d.heard);
    }
    redraw(state.root, state);
  }));
  if (d.result) {
    actions.append(button("campaign-button campaign-button--primary", `Registrar mi ${format(d.result.pct)}%`, async () => {
      const result = await state.options.onMutate?.({ type: "ingles.dictation", clipId: clip.id, pct: d.result.pct });
      if (result && result.kind === "error") state.message = result;
      else state.message = { text: `Dictado registrado: ${format(d.result.pct)}% de palabras correctas.`, kind: "success" };
      d.result = null;
      redraw(state.root, state);
    }));
  }
  card.append(actions);
  if (d.result) {
    card.append(node("p", "torre-dict-pct", `${format(d.result.pct)}%`));
    card.append(node("p", "torre-tool-text", d.result.missed.length
      ? `Palabras que se escaparon (${format(d.result.missed.length)} de ${format(d.result.total)}): ${d.result.missed.slice(0, 30).join(" · ")}${d.result.missed.length > 30 ? "…" : ""}. Si un hueco se repite, anotalo en tu bitácora (en el banco de entrevista).`
      : "¡Completo! Ni una palabra se escapó en este clip."));
    const original = node("details", "torre-original");
    const sum = node("summary", "", "Ver el texto original del clip");
    original.append(sum, node("p", "torre-tool-text", clip.text));
    card.append(original);
  }
  if (fc.listen.dictRef.length) {
    const last = fc.listen.dictRef[fc.listen.dictRef.length - 1];
    const lastClip = DICTATION_BY_ID.get(last.clipId);
    card.append(node("p", "torre-tool-text", `Dictados registrados: ${format(fc.listen.dictCount)} · último: «${lastClip ? lastClip.title : last.clipId}» con ${format(last.pct)}% · ${fmtDate(last.date)}${last.first ? " · primer intento de ese clip" : ""}.`));
  }
  return card;
}

function makeMaterial(state, m) {
  const card = node("section", "torre-tool-card");
  const badges = [
    m.kind, `~${format(m.minutes)} min`, LISTEN_ACCENTS[m.accent] || m.accent,
    m.speed === "claro" ? "Velocidad clara" : m.speed === "real" ? "Velocidad real" : "Rápido",
    m.coverage === "fluye" ? "Fluye sin guion" : "Exige: pausá y repetí"
  ];
  if (m.series) badges.push("Serie: misma voz");
  if (m.transcript) badges.push("Con transcripción/subtítulos");
  card.append(node("h3", "torre-bank-q", m.title));
  card.append(node("p", "garage-mission-meta", badges.join(" · ")));
  card.append(node("p", "torre-tool-text", m.desc));
  card.append(node("p", "torre-tool-text", "El ciclo: ① PREDICCIÓN — escribí de qué va y 3 palabras que esperás oír. ② ESCUCHA — de corrido, sin pausar ni subtitular la primera pasada. ③ VERIFICACIÓN — con la transcripción o el control: ¿qué se escapó? ④ ANOTACIÓN — 1 frase oída tal cual va a tu evidencia (y a la bitácora si es un hueco)."));
  const link = node("a", "torre-say torre-link", "▶ Abrir el material");
  link.href = m.url;
  link.target = "_blank";
  link.rel = "noopener";
  card.append(link);
  if (m.check) {
    if (!state.listenPick) state.listenPick = {};
    const picks = state.listenPick[m.id] || (state.listenPick[m.id] = []);
    card.append(node("p", "torre-checks-title", "Control de comprensión (local, sin nota de voz):"));
    m.check.forEach((item, qi) => {
      card.append(node("p", "torre-tool-text", `${format(qi + 1)}. ${item.q}`));
      const opts = node("div", "torre-chip-row");
      item.options.forEach((opt, oi) => {
        opts.append(button(`torre-chip ${picks[qi] === oi ? "torre-chip--on" : ""}`, opt, () => {
          picks[qi] = oi;
          redraw(state.root, state);
        }));
      });
      card.append(opts);
    });
    const answered = m.check.every((_, qi) => picks[qi] !== undefined);
    if (m.checkState) {
      card.append(node("p", "garage-mission-meta", `Tu control: mejor ${format(m.checkState.best)}/3 · ${format(m.checkState.attempts)} intento${m.checkState.attempts === 1 ? "" : "s"}${m.checkState.approved ? " · ✓ aprobado" : ""}`));
    }
    if (answered) {
      const correct = m.check.reduce((n, item, qi) => n + (picks[qi] === item.answer ? 1 : 0), 0);
      card.append(node("p", "torre-tool-text", `Tu resultado en este intento: ${format(correct)}/3.`));
      card.append(button("campaign-button campaign-button--primary", "Registrar el control", async () => {
        const result = await state.options.onMutate?.({ type: "ingles.listenCheck", matId: m.id, correct });
        if (result && result.kind === "error") state.message = result;
        else state.message = { text: `Control registrado: ${format(correct)}/3. Con controles aprobados en EE. UU., británico e indio cae el hito «Tres acentos».`, kind: "success" };
        redraw(state.root, state);
      }));
    }
  }
  return card;
}

function makeListenView(root, state) {
  const view = state.options.view;
  state.view = view;
  const shell = node("div", "campaign-shell torre-shell");
  shell.append(subHeader(state, "🎧 ESCUCHA", "Cantidad que fluye + dictado que segmenta: los dos carriles del oído, con material real y controles locales."));
  if (state.message) {
    shell.append(node("p", `campaign-message campaign-message--${state.message.kind || "info"}`, state.message.text));
  }
  shell.append(makeDictation(state, view));
  for (const [speed, title] of [["claro", "🟢 Carril claro — que fluya"], ["real", "🟡 Velocidad real"], ["rapido", "🔴 Rápido — para cuando el real ya fluye"]]) {
    const group = view.faseC.listen.materials.filter((m) => m.speed === speed);
    if (!group.length) continue;
    const section = node("section", "garage-group");
    section.append(node("h2", "garage-group-title", title));
    for (const m of group) section.append(makeMaterial(state, m));
    shell.append(section);
  }
  root.replaceChildren(shell);
}

/* ============================ TABLERO DE HABILIDAD ============================
 * §6.5: lo que pinta esta vista lo calculó inglesTableroView SOLO
 * de registros. La medición EF SET se registra acá: la XP del hito
 * es por medirte, jamás por el puntaje (que se guarda como texto,
 * tal cual lo reporta el EF SET). */

function makeBoardView(root, state) {
  const view = state.options.view;
  state.view = view;
  const shell = node("div", "campaign-shell torre-shell");
  shell.append(subHeader(state, "📊 TABLERO DE HABILIDAD", "Tus niveles por evidencia registrada: marcas, intentos y mediciones — no XP, no impresiones."));
  if (state.message) {
    shell.append(node("p", `campaign-message campaign-message--${state.message.kind || "info"}`, state.message.text));
  }
  for (const s of view.tablero.skills) {
    const card = node("section", "torre-tool-card");
    const head = node("div", "torre-srs-head");
    head.append(
      node("span", "torre-srs-count", `${s.icon} ${s.name}`),
      node("span", "torre-srs-deck", `NIVEL ${format(s.level)} · ${s.levelName.toUpperCase()}`)
    );
    card.append(head);
    for (const ind of s.indicators) {
      const row = node("div", "torre-deck-row");
      row.append(
        node("span", "torre-deck-name", `${ind.ok ? "✓" : "·"} ${ind.label}`),
        node("span", "torre-deck-count", ind.value)
      );
      card.append(row);
    }
    card.append(node("p", "torre-tool-text", `Siguiente nivel: ${s.next}`));
    shell.append(card);
  }

  const ef = view.faseC.efset;
  const card = node("section", "torre-tool-card");
  card.append(
    node("h2", "torre-tool-title", "📏 Medición externa · EF SET"),
    node("p", "torre-tool-text", "Tu nivel no lo dice el Center: lo mide el EF SET gratuito (50 minutos, lectura y escucha — el habla se sigue con tus grabaciones A/B). El Center paga el hito por MEDIRTE, sea el puntaje que sea; el número se guarda tal cual, sin convertirlo en promesas.")
  );
  const link = node("a", "torre-say torre-link", "▶ Hacer el EF SET (efset.org)");
  link.href = "https://www.efset.org/";
  link.target = "_blank";
  link.rel = "noopener";
  card.append(link);
  if (!state.efsetDraft && state.efsetDraft !== "") state.efsetDraft = "";
  const scoreInput = () => {
    const input = node("input", "torre-input");
    input.type = "text";
    input.maxLength = 40;
    input.placeholder = "Tu resultado, tal cual (ej.: B1 · 52/100)…";
    input.value = state.efsetDraft || "";
    input.addEventListener("input", () => { state.efsetDraft = input.value; });
    return input;
  };
  if (!ef) {
    card.append(node("p", "torre-tool-text", "Todavía no hay medición registrada: hacé el test y pegá acá el resultado."));
    card.append(scoreInput());
    card.append(button("campaign-button campaign-button--primary", "Registrar mi medición", async () => {
      const result = await state.options.onMutate?.({ type: "ingles.efset", score: state.efsetDraft || "" });
      if (result && result.kind === "error") state.message = result;
      else {
        state.efsetDraft = "";
        state.message = { text: "Medición registrada: cayó el hito «Medición registrada». La XP fue por medirte, no por el número.", kind: "success" };
      }
      redraw(state.root, state);
    }));
  } else if (!ef.second) {
    card.append(node("p", "torre-tool-text", `Primera medición: ${ef.first.score} · ${fmtDate(ef.first.date)}.`));
    if (ef.canSecond) {
      card.append(node("p", "torre-tool-text", "Ya pasaron 90 días: la segunda medición está habilitada — es el segundo punto de tu curva."));
      card.append(scoreInput());
      card.append(button("campaign-button campaign-button--primary", "Registrar la segunda medición", async () => {
        const result = await state.options.onMutate?.({ type: "ingles.efset", score: state.efsetDraft || "" });
        if (result && result.kind === "error") state.message = result;
        else {
          state.efsetDraft = "";
          state.message = { text: "Segunda medición registrada: tu curva ya tiene dos puntos honestos.", kind: "success" };
        }
        redraw(state.root, state);
      }));
    } else {
      card.append(node("p", "torre-tool-text", `La segunda medición se habilita el ${fmtDate(ef.secondDue)} (90 días después de la primera): dos puntos hacen una curva; uno solo, una foto.`));
    }
  } else {
    card.append(node("p", "torre-tool-text", `Tu curva: ${ef.first.score} (${fmtDate(ef.first.date)}) → ${ef.second.score} (${fmtDate(ef.second.date)}). Dos mediciones reales, sin intermediarios.`));
  }
  shell.append(card);
  root.replaceChildren(shell);
}

/* --------------------------------- Entrada --------------------------------- */

function paint(root, state) {
  if (state.sub === "srs") { makeSrsView(root, state); return; }
  if (state.sub === "lab") { makeLabView(root, state); return; }
  if (state.sub === "bank") { makeBankView(root, state); return; }
  if (state.sub === "listen") { makeListenView(root, state); return; }
  if (state.sub === "board") { makeBoardView(root, state); return; }
  paintHome(root, state);
}

export function renderIngles(root, { view, onComplete, onMutate, getSrsSession, onBack, campaign, onOpenCampaign } = {}) {
  if (!root || typeof root.replaceChildren !== "function") {
    throw new TypeError("renderIngles necesita un elemento raíz del DOM.");
  }
  let state = sessions.get(root);
  if (!state) {
    state = {
      root, message: null, view: null, options: null, sub: "home", srs: null, srsForm: null, lab: null,
      bankDraft: null, bankTimer: null, errForm: null, mockForm: null,
      listenPick: null, dict: null, efsetDraft: ""
    };
    sessions.set(root, state);
  }
  state.options = { view, onComplete, onMutate, getSrsSession, onBack, campaign, onOpenCampaign };
  paint(root, state);
  return root;
}
