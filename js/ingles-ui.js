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
 */
import {
  SRS_DECKS, HVPT_CONTRASTS, LAB_PHRASES, LAB_PHRASE_BY_ID, KEYS_PHRASE_IDS
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
  return wrap;
}

function makeComingSoon() {
  const card = node("section", "torre-coming");
  card.append(node("h2", "torre-coming-title", "🚧 En construcción en esta Torre"));
  card.append(node("p", "torre-coming-text",
    "La campaña DESPEGUE (58 misiones de estudio) y el Tablero de Habilidad llegan en las próximas fases. La Fraseología y el Laboratorio ya abrieron: a practicar."));
  return card;
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
  main.append(makeComingSoon());
  layout.append(rail, main);
  shell.append(layout);
  root.replaceChildren(shell);
}

/* ============================ FRASEOLOGÍA (SRS) ============================ */

function subHeader(state, title, sub) {
  const head = node("header", "torre-sub-head");
  const back = button("campaign-back", "← Torre", () => {
    stopShadow(state);
    state.sub = "home";
    redraw(state.root, state);
  });
  back.setAttribute("aria-label", "Volver a la Torre");
  head.append(back, node("span", "campaign-code", "LA TORRE DE CONTROL"));
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
      node("p", "torre-tool-text", "Si todavía no registraste hoy la rutina «Repaso de fraseología» en la lista de la Torre, hacelo al volver: la rutina paga por el hábito.")
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
      lab.recMsg = "Sesión de shadowing completa: 10 minutos. Si todavía no registraste la rutina «Shadowing de turno», hacelo al volver a la Torre.";
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
      lab.recMsg = "Resultado registrado: tu tendencia queda en la Torre.";
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
  shell.append(subHeader(state, "🎙️ LABORATORIO DE VOZ", "El gimnasio: oído, boca y espejo. Nada de esto paga por sí solo — las rutinas de la Torre pagan el hábito de venir."));
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

/* --------------------------------- Entrada --------------------------------- */

function paint(root, state) {
  if (state.sub === "srs") { makeSrsView(root, state); return; }
  if (state.sub === "lab") { makeLabView(root, state); return; }
  paintHome(root, state);
}

export function renderIngles(root, { view, onComplete, onMutate, getSrsSession, onBack } = {}) {
  if (!root || typeof root.replaceChildren !== "function") {
    throw new TypeError("renderIngles necesita un elemento raíz del DOM.");
  }
  let state = sessions.get(root);
  if (!state) {
    state = { root, message: null, view: null, options: null, sub: "home", srs: null, srsForm: null, lab: null };
    sessions.set(root, state);
  }
  state.options = { view, onComplete, onMutate, getSrsSession, onBack };
  paint(root, state);
  return root;
}
