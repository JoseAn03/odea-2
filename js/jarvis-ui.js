/**
 * jarvis-ui.js — el diálogo de JARVIS (v0.38.0), el robotcito compañero
 * de la Zona IA. Vive en el mismo #career-dialog de las campañas, con su
 * retrato, su bocadillo y cinco acciones:
 *
 *   ¿Qué hago hoy? · Practicar (quiz) · Preguntar algo ·
 *   Revisar mi evidencia · Campaña Zona IA
 *
 * El saludo degrada en tres niveles (spec §2.3): (1) el briefing del
 * Worker, en caché si ya se pidió hoy; (2) un saludo armado localmente
 * con el resumen, sin llamar a nadie; (3) el aviso de «todavía no estoy
 * conectado» si la URL del Worker está vacía. Sin internet, sin Worker o
 * sin clave, el juego sigue completo: Jarvis es un extra, nunca un candado.
 *
 * Nada de esto escribe el guardado directamente: cada registro pasa por
 * los callbacks de app.js → applyGameplayMutation → src/storage.js.
 */

import { CAMPAIGNS } from "../src/campaigns.js";
import {
  JARVIS_CHAT_DAILY_LIMIT,
  JARVIS_FEEDBACK_DAILY_LIMIT,
  JARVIS_QUIZ_DAILY_LIMIT,
  JARVIS_QUIZ_XP,
  JARVIS_QUIZ_XP_PER_HIT,
  JARVIS_TUTOR_DAILY_LIMIT,
} from "../src/jarvis-state.js";
import { buildTutorIndex, searchTutor, threadReusable } from "../src/tutor-index.js";
import { askJarvis, askTutor, jarvisConfigured } from "./jarvis-client.js";
import {
  JARVIS_ACT_DAILY_LIMIT,
  describeJarvisAction,
  jarvisStaleMessage,
  newJarvisRequestId,
  validateJarvisAction,
} from "../src/jarvis-actions.js";

const QUIZ_TOPICS = [
  { id: "entrevista", label: "Entrevista Envista", campaignId: "entrevista" },
  { id: "academia", label: "Academia", campaignId: "academia" },
  { id: "zonaia", label: "Zona IA", campaignId: "zonaia" },
  { id: "sabiduria", label: "Sabiduría", campaignId: "sabiduria" },
  { id: "brete", label: "El Brete", campaignId: "brete" },
  { id: "gamer", label: "Zona Gamer", campaignId: "gamer" },
  { id: "datos", label: "Datos en general", campaignId: null },
];

const NOT_CONNECTED =
  "Hola, José. Todavía no estoy conectado: falta configurar mi dirección en el juego. Mientras tanto, el juego sigue completo sin mí.";

const sessions = new WeakMap();

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.append(String(text));
  return node;
}

function actionButton(label, onClick) {
  const button = el("button", "campaign-button jarvis-action", label);
  button.type = "button";
  button.addEventListener("click", onClick);
  return button;
}

/** Saludo del nivel 2: se arma solo con el resumen local, sin red. */
export function jarvisLocalGreeting(summary) {
  if (!summary) return "Hola, José. Estoy revisando tu ciudad…";
  const parts = [];
  const dia = summary.diaDelPlan != null ? ` Hoy vas por el día ${summary.diaDelPlan} de tu plan` : "";
  parts.push(`Hola, José.${dia} y estás en el nivel ${summary.nivel}.`);
  if (summary.diarias) {
    if (summary.diarias.pendientes && summary.diarias.pendientes.length) {
      parts.push(`Te faltan diarias: ${summary.diarias.pendientes.join(", ")}.`);
    } else if (summary.diarias.total) {
      parts.push("Las diarias de hoy ya están hechas. Buen trabajo.");
    }
  }
  if (summary.garajePorVencer && summary.garajePorVencer.length) {
    parts.push(`Ojo con el garaje: ${summary.garajePorVencer.join(", ")}.`);
  }
  if (summary.ianPorVencer && summary.ianPorVencer.length) {
    parts.push(`Con Ian toca: ${summary.ianPorVencer.join(", ")}.`);
  }
  if (summary.entrevistaEnvista) {
    const dias = summary.entrevistaEnvista.diasRestantes;
    parts.push(dias === 0
      ? "¡Hoy es la entrevista de Envista! A las 10:35 a. m. Vos podés."
      : `La entrevista de Envista es en ${dias} día${dias === 1 ? "" : "s"}.`);
  }
  if (summary.proximaMisionCampana) {
    parts.push(`Tu próxima misión: «${summary.proximaMisionCampana.mision}» (${summary.proximaMisionCampana.campana}).`);
  }
  return parts.join(" ");
}

/** Material REAL del tema para el Worker: hasta 12 misiones de su
 *  campaña como { title, brief, deliverable } (el tope que acepta el
 *  Worker), muestreadas a lo largo de toda la campaña para no sesgar
 *  a los primeros capítulos. Para «Datos en general» van las de la
 *  Zona IA, que es su material de datos e IA. */
const MATERIAL_LIMIT = 12;

function topicMaterial(topic) {
  const campaign = CAMPAIGNS[topic.campaignId || "zonaia"];
  if (!campaign) return [];
  const all = campaign.chapters.flatMap((chapter) => chapter.missions);
  const pick = (mission) => ({
    title: mission.title,
    brief: mission.brief,
    deliverable: mission.deliverable
  });
  if (all.length <= MATERIAL_LIMIT) return all.map(pick);
  const step = all.length / MATERIAL_LIMIT;
  const sampled = [];
  for (let i = 0; i < MATERIAL_LIMIT; i += 1) {
    sampled.push(pick(all[Math.floor(i * step)]));
  }
  return sampled;
}

export function renderJarvis(root, options = {}) {
  const previous = sessions.get(root);
  if (previous) previous.controller.abort();
  const controller = new AbortController();
  const session = {
    controller,
    view: options.view || {},
    summary: options.summary || null,
    briefingText: options.view && options.view.briefingHoy ? options.view.briefingHoy : null,
    counts: {
      quizXp: (options.view && options.view.quizXpToday) || 0,
      quizUsed: JARVIS_QUIZ_DAILY_LIMIT - ((options.view && options.view.quizRestantes) || 0),
      chatUsed: JARVIS_CHAT_DAILY_LIMIT - ((options.view && options.view.chatRestantes) || 0),
      feedbackUsed: JARVIS_FEEDBACK_DAILY_LIMIT - ((options.view && options.view.feedbackRestantes) || 0),
      /* v0.51.0 — el Tutor: preguntas usadas hoy (vista: tutorHoy). */
      tutorUsed: (options.view && options.view.tutorHoy) || 0,
    },
    /* v0.51.0 — el Tutor vive en la sesión del diálogo: el hilo (tema,
       extractos e historial) NO se guarda, como el historial del chat;
       el índice se construye perezoso en memoria (src/tutor-index.js). */
    tutorLog: [],
    tutorThread: null,
    tutorMode: "auto",
    tutorIndex: null,
    tutorIndexFailed: false,
    chatLog: [],
    /* v0.50.0 — manos: contador de acciones aplicadas hoy, el plan del
       día conocido (para re-validar propuestas contra el estado vivo) y
       la ÚNICA tarjeta que puede estar pendiente a la vez. */
    actUsed: (options.view && options.view.accionesHoy) || 0,
    plan: {
      focusId: (options.view && options.view.dayPlan && options.view.dayPlan.focusId) || null,
      order: (options.view && options.view.dayPlan && options.view.dayPlan.order) || null,
      busy: (options.view && options.view.dayPlan && options.view.dayPlan.busy) || null,
    },
    pendingCard: null,
  };
  sessions.set(root, session);
  root.replaceChildren();

  const shell = el("div", "campaign-shell jarvis-shell");
  shell.style.setProperty("--campaign-accent", "#FF2E93");

  /* ------------------------------ encabezado ------------------------------ */
  const head = el("header", "jarvis-head");
  const portrait = el("img", "jarvis-portrait");
  portrait.src = "assets/jarvis.webp";
  portrait.alt = "Jarvis, el robot compañero de la Zona IA";
  portrait.addEventListener("error", () => { portrait.hidden = true; });
  const headCopy = el("div", "jarvis-head-copy");
  headCopy.append(
    el("p", "campaign-eyebrow", "ZONA IA · TU COMPAÑERO"),
    el("h2", "jarvis-name", "JARVIS"),
    el("p", "jarvis-sub", "Robot compañero de la Zona IA. Te ayudo con el día, práctica y tus evidencias.")
  );
  const close = el("button", "campaign-back jarvis-close", "Cerrar");
  close.type = "button";
  close.addEventListener("click", () => { if (typeof options.onClose === "function") options.onClose(); });
  head.append(portrait, headCopy, close);
  shell.append(head);

  /* ------------------------------- bocadillo ------------------------------ */
  const bubble = el("div", "jarvis-bubble");
  const bubbleText = el("p", "jarvis-bubble-text", "Un momento, estoy revisando tu ciudad…");
  bubble.append(bubbleText);
  shell.append(bubble);

  /* ------------------------------- acciones ------------------------------- */
  const panel = el("div", "jarvis-panel");
  const actions = el("nav", "jarvis-actions");
  actions.setAttribute("aria-label", "Acciones de Jarvis");
  actions.append(
    actionButton("¿Qué hago hoy?", () => showBriefing(false)),
    actionButton("Practicar (quiz)", () => showQuizTopics()),
    actionButton("Preguntar algo", () => showChat()),
    actionButton("📚 Estudiar", () => showTutor()),
    actionButton("Revisar mi evidencia", () => showFeedback()),
    actionButton("Campaña Zona IA", () => { if (typeof options.onOpenZonaIA === "function") options.onOpenZonaIA(); })
  );
  shell.append(actions, panel);

  /* --------------------------------- pie ---------------------------------- */
  const foot = el("p", "jarvis-foot");
  shell.append(foot);
  root.append(shell);

  function renderFoot() {
    foot.replaceChildren(
      `Hoy: quiz XP ${session.counts.quizXp}/${JARVIS_QUIZ_XP * JARVIS_QUIZ_DAILY_LIMIT}` +
      ` · rondas con XP: ${session.counts.quizUsed}/${JARVIS_QUIZ_DAILY_LIMIT}` +
      ` · mensajes ${session.counts.chatUsed}/${JARVIS_CHAT_DAILY_LIMIT}` +
      ` · revisiones ${session.counts.feedbackUsed}/${JARVIS_FEEDBACK_DAILY_LIMIT}` +
      ` · tutor ${session.counts.tutorUsed}/${JARVIS_TUTOR_DAILY_LIMIT}` +
      ` · Acciones de hoy: ${session.actUsed}/${JARVIS_ACT_DAILY_LIMIT}`);
  }
  renderFoot();

  function setBubble(text) {
    bubbleText.replaceChildren(String(text));
  }

  /* ------------------------------- briefing ------------------------------- */
  async function showBriefing(force) {
    if (session.briefingText && !force) {
      setBubble(session.briefingText);
      return;
    }
    if (!jarvisConfigured()) {
      setBubble(NOT_CONNECTED);
      return;
    }
    setBubble("Un momento, estoy revisando tu ciudad…");
    const result = await askJarvis("briefing", { summary: session.summary }, { signal: controller.signal });
    if (controller.signal.aborted) return;
    if (result.ok) {
      session.briefingText = result.text;
      setBubble(result.text);
      if (typeof options.onBriefing === "function") options.onBriefing(result.text);
    } else {
      setBubble(jarvisLocalGreeting(session.summary));
    }
  }

  /* --------------------------------- quiz --------------------------------- */
  function showQuizTopics() {
    panel.replaceChildren();
    panel.append(el("h3", "jarvis-panel-title", "Practicar — elegí un tema"));
    const restantes = JARVIS_QUIZ_DAILY_LIMIT - session.counts.quizUsed;
    if (restantes > 0) {
      panel.append(el("p", "jarvis-note",
        `Te queda${restantes === 1 ? "" : "n"} ${restantes} ronda${restantes === 1 ? "" : "s"} con XP hoy: ` +
        `${JARVIS_QUIZ_XP_PER_HIT} XP por acierto, y la ronda cuenta solo cuando la completás.`));
    } else {
      panel.append(el("p", "jarvis-note",
        "Ya usaste tus 2 rondas con XP de hoy. Podés seguir practicando, pero sin XP."));
    }
    const list = el("div", "jarvis-topics");
    for (const topic of QUIZ_TOPICS) {
      list.append(actionButton(topic.label, () => startQuiz(topic)));
    }
    panel.append(list);
  }

  async function startQuiz(topic) {
    panel.replaceChildren();
    panel.append(el("p", "jarvis-note", "Preparando tus preguntas…"));
    const result = await askJarvis("quiz",
      { topic: topic.id, material: topicMaterial(topic) }, { signal: controller.signal });
    if (controller.signal.aborted) return;
    if (!result.ok) {
      panel.replaceChildren();
      panel.append(el("p", "jarvis-note",
        "No pude preparar el quiz (sin conexión o el servicio falló). El juego sigue: practicá desde la campaña."));
      panel.append(actionButton("Volver", showQuizTopics));
      return;
    }
    /* El Worker devuelve una ronda de 5 preguntas. Regla v0.39.1: la
     * ronda se registra SOLO al completarla (ver showQuestion), paga
     * 2 XP por acierto (máx. 10 por ronda) y hay hasta 2 rondas con XP
     * al día; abandonar antes no consume nada y las rondas extra son
     * práctica sin XP. */
    const round = {
      withXp: session.counts.quizUsed < JARVIS_QUIZ_DAILY_LIMIT,
      hits: 0
    };
    showQuestion(topic, result.questions, 0, round);
  }

  function showQuestion(topic, questions, index, round) {
    const quiz = questions[index];
    const isFirst = index === 0;
    const isLast = index === questions.length - 1;
    panel.replaceChildren();
    panel.append(el("p", "campaign-eyebrow",
      `QUIZ · ${topic.label.toUpperCase()} · PREGUNTA ${index + 1} DE ${questions.length}${isFirst ? (round.withXp ? ` · ${JARVIS_QUIZ_XP_PER_HIT} XP POR ACIERTO` : " · PRÁCTICA SIN XP") : ""}`));
    panel.append(el("h3", "jarvis-panel-title", quiz.question));
    const optionsBox = el("div", "jarvis-options");
    const feedback = el("p", "jarvis-note");
    let answered = false;

    quiz.options.forEach((text, optionIndex) => {
      const button = actionButton(text, async () => {
        if (answered) return;
        answered = true;
        const correct = optionIndex === quiz.correctIndex;
        if (correct) round.hits += 1;
        for (const child of optionsBox.children) child.disabled = true;
        optionsBox.children[quiz.correctIndex].classList.add("jarvis-opt--ok");
        if (!correct) button.classList.add("jarvis-opt--bad");

        let line = correct ? "¡Correcto!" : "Esta vez no: la respuesta correcta está marcada.";
        if (quiz.explanation) line += ` ${quiz.explanation}`;
        if (isLast && round.withXp) {
          /* Regla v0.39.1: recién AQUÍ, al completar la ronda, se
           * despacha la ÚNICA mutación del quiz, con el XP de los
           * aciertos (2 XP c/u). Abandonar antes no consume ni paga. */
          const xp = round.hits * JARVIS_QUIZ_XP_PER_HIT;
          const recorded = typeof options.onQuiz === "function" ? await options.onQuiz(xp) : null;
          if (recorded && recorded.status === "applied") {
            session.counts.quizUsed += 1;
            session.counts.quizXp += xp;
            renderFoot();
            line += ` Ronda terminada: acertaste ${round.hits} de ${questions.length}. +${xp} XP para vos.`;
          } else {
            line += ` Ronda terminada: acertaste ${round.hits} de ${questions.length}. (No se pudo registrar el XP, pero la práctica cuenta.)`;
          }
        } else if (isLast) {
          line += ` Ronda terminada: acertaste ${round.hits} de ${questions.length}.`;
        }
        feedback.replaceChildren(line);
        const nav = el("div", "jarvis-topics");
        if (!isLast) {
          nav.append(actionButton("Siguiente pregunta",
            () => showQuestion(topic, questions, index + 1, round)));
        } else {
          nav.append(
            actionButton("Otro quiz", showQuizTopics),
            actionButton("Terminar", () => panel.replaceChildren())
          );
        }
        panel.append(nav);
      });
      optionsBox.append(button);
    });
    panel.append(optionsBox, feedback);
  }

  /* --------------------- manos: la tarjeta de acción ----------------------
     El ciclo completo (§2/§5 del diseño): Jarvis propone en JSON, el
     JUEGO re-valida contra el estado vivo y pinta la tarjeta con SUS
     plantillas; nada se aplica sin el toque de José en «Aceptar», y la
     confirmación la pone el juego, nunca el modelo. Máx. 1 pendiente. */

  function actionContext() {
    const ac = session.summary && session.summary.accionesContext;
    return {
      date: null,
      dailies: ac && Array.isArray(ac.diarias)
        ? ac.diarias.map((d) => ({ id: d.id, title: d.titulo, completed: Boolean(d.hecha) }))
        : [],
      focusId: session.plan.focusId,
      order: session.plan.order,
      busy: session.plan.busy,
    };
  }

  function applyPlanLocally(name, args) {
    if (name === "set_daily_focus") session.plan.focusId = args.dailyId;
    else if (name === "reorder_dailies") session.plan.order = [...args.order];
    else if (name === "set_busy_day") {
      session.plan.busy = { minutes: args.minutes, chosen: [...args.chosen], deferred: [...args.deferred] };
    }
  }

  function handleActionProposal(action, log) {
    if (session.pendingCard) return; /* una pendiente a la vez */
    if (typeof options.onAct !== "function") return;
    const ctx = actionContext();
    const code = validateJarvisAction(ctx, action.name, action.args);
    if (code === "ACTION_UNKNOWN" || code === "ACTION_BAD_ARGS") {
      /* Fail-closed en silencio: el hilo sigue solo con el texto. */
      return;
    }
    const desc = describeJarvisAction(ctx, action.name, action.args);
    if (!desc) return;
    const card = el("div", "jarvis-action-card");
    if (code === "ACTION_STALE") {
      card.classList.add("jarvis-action-card--stale");
      card.append(
        el("p", "jarvis-action-title", desc.title),
        el("p", "jarvis-action-body", `Ya no aplica: ${jarvisStaleMessage(ctx, action.name, action.args)}.`)
      );
      log.append(card);
      return;
    }

    const requestId = newJarvisRequestId();
    const planSnapshot = structuredClone(session.plan);
    session.pendingCard = { requestId, name: action.name, args: action.args };
    card.append(
      el("p", "jarvis-action-title", desc.title),
      el("p", "jarvis-action-body", desc.body)
    );
    const row = el("div", "jarvis-action-row");
    const accept = el("button", "jarvis-action-accept", "Aceptar");
    accept.type = "button";
    const discard = el("button", "jarvis-action-discard", "Descartar");
    discard.type = "button";
    row.append(accept, discard);
    card.append(row);
    log.append(card);

    discard.addEventListener("click", () => {
      session.pendingCard = null;
      card.replaceChildren(el("p", "jarvis-action-discarded", "Propuesta descartada"));
      card.classList.add("jarvis-action-card--collapsed");
    });

    accept.addEventListener("click", async () => {
      accept.disabled = true;
      discard.disabled = true;
      const result = await options.onAct({ type: "jarvis.act", requestId, name: action.name, args: action.args });
      if (controller.signal.aborted) return;
      if (result && (result.status === "applied" || result.status === "duplicate")) {
        if (result.status === "applied") session.actUsed += 1;
        applyPlanLocally(action.name, action.args);
        session.pendingCard = null;
        renderFoot();
        card.classList.add("jarvis-action-card--applied");
        card.replaceChildren(
          el("p", "jarvis-action-title", `✅ Aplicado: ${desc.applied}`),
        );
        const undo = el("button", "jarvis-action-undo", "Deshacer");
        undo.type = "button";
        undo.addEventListener("click", async () => {
          undo.disabled = true;
          const undone = await options.onActUndo({ type: "jarvis.actUndo", requestId });
          if (controller.signal.aborted) return;
          if (undone && undone.status === "applied") {
            session.plan = planSnapshot;
            card.replaceChildren(el("p", "jarvis-action-discarded", "↩️ Deshecho: quedó como estaba."));
          } else {
            card.replaceChildren(el("p", "jarvis-action-discarded", "Ya no se puede deshacer: el ajuste cambió después."));
          }
        });
        const undoRow = el("div", "jarvis-action-row");
        undoRow.append(undo);
        card.append(undoRow);
        log.append(el("p", "jarvis-msg jarvis-msg--game", `✅ Aplicado: ${desc.applied}`));
      } else {
        const failCode = result && result.error && result.error.code;
        session.pendingCard = null;
        if (failCode === "ACTION_STALE") {
          card.classList.add("jarvis-action-card--stale");
          card.replaceChildren(
            el("p", "jarvis-action-title", desc.title),
            el("p", "jarvis-action-body", `Ya no aplica: ${jarvisStaleMessage(actionContext(), action.name, action.args)}.`)
          );
        } else if (failCode === "JARVIS_ACT_CAP") {
          card.classList.add("jarvis-action-card--stale");
          card.replaceChildren(el("p", "jarvis-action-body", "Hoy ya aplicaste 10 ajustes; mañana seguimos."));
        } else {
          card.replaceChildren(el("p", "jarvis-action-body", "No se pudo aplicar. Probá de nuevo en un rato."));
        }
      }
    });
  }

  /* --------------------------------- chat --------------------------------- */
  function showChat() {
    panel.replaceChildren();
    panel.append(el("h3", "jarvis-panel-title", "Preguntar algo"));
    const log = el("div", "jarvis-chat-log");
    for (const entry of session.chatLog) {
      log.append(el("p", entry.role === "user" ? "jarvis-msg jarvis-msg--user" : "jarvis-msg jarvis-msg--jarvis", entry.text));
    }
    panel.append(log);

    if (session.counts.chatUsed >= JARVIS_CHAT_DAILY_LIMIT) {
      panel.append(el("p", "jarvis-note", "Por hoy llegamos al límite de mensajes. Mañana seguimos."));
      return;
    }

    const input = el("textarea", "jarvis-input");
    input.rows = 3;
    input.placeholder = "Preguntame lo que sea de tu plan, tus campañas o tu preparación…";
    const send = actionButton("Enviar", async () => {
      const message = String(input.value || "").trim();
      if (!message) return;
      send.disabled = true;
      input.disabled = true;
      session.chatLog.push({ role: "user", text: message });
      log.append(el("p", "jarvis-msg jarvis-msg--user", message));
      const pending = el("p", "jarvis-msg jarvis-msg--jarvis", "Jarvis está escribiendo…");
      log.append(pending);

      const result = await askJarvis("chat", {
        message,
        summary: session.summary,
        history: session.chatLog.slice(-6)
      }, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (result.ok) {
        if (result.text && result.text.trim()) {
          pending.replaceChildren(result.text);
          session.chatLog.push({ role: "jarvis", text: result.text });
        } else if (result.action) {
          /* Tool_call sin texto: el juego pone su línea de plantilla. */
          const desc = describeJarvisAction(actionContext(), result.action.name, result.action.args);
          pending.replaceChildren(desc ? `Te preparé una propuesta: ${desc.title}. Revisala y decidí vos.` : "Te preparé una propuesta en la tarjeta de abajo.");
        } else {
          pending.replaceChildren("…");
        }
        if (result.action) handleActionProposal(result.action, log);
        const recorded = typeof options.onUsage === "function" ? await options.onUsage("chat") : null;
        if (recorded && recorded.status === "applied") {
          session.counts.chatUsed += 1;
          renderFoot();
        }
        input.value = "";
        input.disabled = false;
        send.disabled = session.counts.chatUsed >= JARVIS_CHAT_DAILY_LIMIT;
        if (session.counts.chatUsed >= JARVIS_CHAT_DAILY_LIMIT) showChat();
      } else {
        pending.replaceChildren("No pude responder (sin conexión o el servicio falló). Probá de nuevo en un rato.");
        input.disabled = false;
        send.disabled = false;
      }
    });
    const row = el("div", "jarvis-send-row");
    row.append(input, send);
    panel.append(row);
  }

  /* ------------------------------- feedback ------------------------------- */
  function showFeedback() {
    panel.replaceChildren();
    panel.append(el("h3", "jarvis-panel-title", "Revisar mi evidencia"));
    const completed = Array.isArray(options.completedMissions) ? options.completedMissions : [];
    if (!completed.length) {
      panel.append(el("p", "jarvis-note",
        "Todavía no completaste misiones de campaña. Cuando completes una, traé tu evidencia y la revisamos juntos."));
      return;
    }
    if (session.counts.feedbackUsed >= JARVIS_FEEDBACK_DAILY_LIMIT) {
      panel.append(el("p", "jarvis-note", "Por hoy llegamos al límite de revisiones. Mañana seguimos."));
      return;
    }

    const campaignIds = [...new Set(completed.map((mission) => mission.campaignId))];
    const campaignSelect = el("select", "jarvis-select");
    for (const id of campaignIds) {
      const option = el("option", "", (CAMPAIGNS[id] && CAMPAIGNS[id].name) || id);
      option.value = id;
      campaignSelect.append(option);
    }
    const missionSelect = el("select", "jarvis-select");
    const evidence = el("textarea", "jarvis-input");
    evidence.rows = 5;
    evidence.placeholder = "Tu evidencia (lo que entregaste de verdad)…";

    function syncMissions() {
      const campaignId = campaignSelect.value || campaignIds[0];
      const missions = completed.filter((mission) => mission.campaignId === campaignId);
      missionSelect.replaceChildren();
      for (const mission of missions) {
        const option = el("option", "", mission.title);
        option.value = mission.missionId;
        missionSelect.append(option);
      }
      const current = missions[0];
      evidence.value = current && current.evidence ? current.evidence : "";
    }
    campaignSelect.addEventListener("change", syncMissions);
    missionSelect.addEventListener("change", () => {
      const current = completed.find((mission) => mission.missionId === missionSelect.value);
      evidence.value = current && current.evidence ? current.evidence : "";
    });

    const resultBox = el("div", "jarvis-feedback-result");
    const submit = actionButton("Pedir revisión", async () => {
      const mission = completed.find((item) => item.missionId === missionSelect.value);
      const text = String(evidence.value || "").trim();
      if (!mission || !text) {
        resultBox.replaceChildren(el("p", "jarvis-note", "Escribí tu evidencia antes de pedir la revisión."));
        return;
      }
      submit.disabled = true;
      resultBox.replaceChildren(el("p", "jarvis-note", "Estoy leyendo tu evidencia…"));
      const result = await askJarvis("feedback", {
        missionTitle: mission.title,
        deliverable: mission.deliverable,
        evidence: text,
      }, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (result.ok) {
        resultBox.replaceChildren(el("p", "jarvis-feedback-text", result.text));
        const recorded = typeof options.onUsage === "function" ? await options.onUsage("feedback") : null;
        if (recorded && recorded.status === "applied") {
          session.counts.feedbackUsed += 1;
          renderFoot();
        }
        if (session.counts.feedbackUsed >= JARVIS_FEEDBACK_DAILY_LIMIT) showFeedback();
      } else {
        resultBox.replaceChildren(el("p", "jarvis-note",
          "No pude revisar tu evidencia (sin conexión o el servicio falló). Tu evidencia sigue guardada en la campaña."));
        submit.disabled = false;
      }
    });

    panel.append(
      el("label", "campaign-label", "CAMPAÑA"), campaignSelect,
      el("label", "campaign-label", "MISIÓN COMPLETADA"), missionSelect,
      el("label", "campaign-label", "TU EVIDENCIA"), evidence,
      submit, resultBox
    );
    /* Con los selects ya en el documento, su value es confiable:
       se pueblan las misiones y la evidencia precargada. */
    syncMissions();
  }

  /* --------------------- el Tutor de Estudio (v0.51.0) ---------------------
     Diseño maestro §3/§5.2: José escribe preguntas y Jarvis responde
     DESDE su material real. El JUEGO busca en el índice local
     (src/tutor-index.js) y manda al Worker solo los extractos que
     superan el umbral; sin extractos, la pregunta es EXTRA y su chip
     «💬 Fuera de tu material» lo pinta el juego según la bandera
     validada — nunca depende de que el modelo lo confiese. La cita se
     valida dos veces (Worker + cliente, jarvis-client.js) y el chip
     muestra la referencia del extracto REAL enviado. Preguntar no
     paga XP: solo consume el contador jarvis.usage «tutor» (15/día).
     El hilo vive en la sesión; lo que José quiera conservar irá al
     banco (v0.52.0, aquí solo su vista «en preparación»). */

  const TUTOR_NOT_FOUND =
    "Eso no lo encontré en tu material, José. Puede estar con otras palabras — probá nombrando el módulo — o te lo respondo como pregunta extra, marcado como fuera de tu material.";
  const TUTOR_NO_TUTOR =
    "Todavía no estoy conectado con mi modo tutor: falta actualizar mi cerebro en Cloudflare. Mientras tanto, el juego completo sigue con vos.";
  const TUTOR_LIMIT =
    "Hoy ya me preguntaste 15 veces, José — buenísimo ritmo. Mañana seguimos con el Tutor.";
  const TUTOR_OFFLINE =
    "Estoy sin conexión ahorita: no puedo pensar respuestas nuevas, pero el juego completo sigue con vos.";

  function getTutorIndex() {
    if (session.tutorIndex || session.tutorIndexFailed) return session.tutorIndex;
    try {
      session.tutorIndex = buildTutorIndex(CAMPAIGNS, options.catalog || null);
    } catch {
      /* Sin índice no hay fundamentación posible: toda pregunta cae a
         extra etiquetada, y el diálogo jamás se rompe por el Tutor. */
      session.tutorIndexFailed = true;
    }
    return session.tutorIndex;
  }

  function tutorChipNode(chip) {
    if (!chip) return null;
    if (chip.kind === "lesson") {
      const canOpen = chip.campaignId && chip.campaignId !== "diarias" &&
        CAMPAIGNS[chip.campaignId] && typeof options.onOpenCampaign === "function";
      const node = el(canOpen ? "button" : "p", "jarvis-tutor-chip jarvis-tutor-chip--lesson",
        `📚 ${chip.label}`);
      if (canOpen) {
        node.type = "button";
        node.title = "Abrir la lección en su campaña";
        node.addEventListener("click", () => options.onOpenCampaign(chip.campaignId));
      }
      return node;
    }
    if (chip.kind === "extra") {
      return el("p", "jarvis-tutor-chip jarvis-tutor-chip--extra", "💬 Fuera de tu material");
    }
    return null;
  }

  function showBankPlaceholder() {
    panel.replaceChildren();
    panel.append(el("h3", "jarvis-panel-title", "📌 Mi banco de preguntas"));
    panel.append(el("p", "jarvis-note",
      "Tu banco llega en la próxima fase: vas a guardar las respuestas útiles del Tutor con un toque 📌, " +
      "organizadas por módulo, y repasarlas sin conexión como tarjetas. Por ahora el Tutor ya responde desde tu material."));
    panel.append(actionButton("Volver al Tutor", () => showTutor()));
  }

  function showTutor() {
    panel.replaceChildren();
    panel.append(el("h3", "jarvis-panel-title", "Estudiar — preguntale a Jarvis de tus lecciones"));

    const modes = el("div", "jarvis-tutor-modes");
    for (const [id, label] of [["auto", "Automático"], ["material", "De mi material"], ["libre", "Pregunta libre"]]) {
      const chip = el("button", `jarvis-tutor-mode${session.tutorMode === id ? " jarvis-tutor-mode--active" : ""}`, label);
      chip.type = "button";
      chip.addEventListener("click", () => { session.tutorMode = id; showTutor(); });
      modes.append(chip);
    }
    panel.append(modes);

    if (session.tutorThread && session.tutorThread.topicLabel) {
      panel.append(el("p", "jarvis-tutor-topic", `Tema: ${session.tutorThread.topicLabel}`));
    }

    const log = el("div", "jarvis-chat-log jarvis-tutor-log");
    for (const entry of session.tutorLog) {
      log.append(el("p", entry.role === "user" ? "jarvis-msg jarvis-msg--user" : "jarvis-msg jarvis-msg--jarvis", entry.text));
      const chipNode = tutorChipNode(entry.chip);
      if (chipNode) log.append(chipNode);
    }
    panel.append(log);

    const bankButton = actionButton("📌 Mi banco (0)", () => showBankPlaceholder());
    bankButton.classList.add("jarvis-tutor-bank");

    if (session.counts.tutorUsed >= JARVIS_TUTOR_DAILY_LIMIT) {
      panel.append(el("p", "jarvis-note", TUTOR_LIMIT), bankButton);
      return;
    }
    if (!jarvisConfigured()) {
      panel.append(el("p", "jarvis-note", TUTOR_OFFLINE), bankButton);
      return;
    }

    const input = el("textarea", "jarvis-input jarvis-tutor-input");
    input.rows = 3;
    input.maxLength = 1000;
    input.placeholder = "Preguntame de tus lecciones: un JOIN, un curso de la Academia, un agente…";
    const send = actionButton("Preguntar", async () => {
      const question = String(input.value || "").trim();
      if (!question) return;
      send.disabled = true;
      input.disabled = true;
      session.tutorLog.push({ role: "user", text: question });
      log.append(el("p", "jarvis-msg jarvis-msg--user", question));
      const pending = el("p", "jarvis-msg jarvis-msg--jarvis", "Buscando en tu material…");
      log.append(pending);

      /* 1) Búsqueda local: ¿hay extractos sobre el umbral? En modo
         libre no se busca (extra declarada). En seguimiento sin
         resultados nuevos, se reusan los extractos del hilo (§3.3). */
      let extracts = [];
      if (session.tutorMode !== "libre") {
        const index = getTutorIndex();
        extracts = index ? searchTutor(index, question) : [];
        /* Seguimiento: se reusan los extractos del hilo SOLO si la
           pregunta no introduce un concepto específico nuevo
           (threadReusable): un tema nuevo jamás hereda citas ajenas. */
        if (!extracts.length && session.tutorMode === "auto" &&
          session.tutorThread && session.tutorThread.extracts.length &&
          threadReusable(index, question, session.tutorThread.extracts.map((extract) => extract.ref))) {
          extracts = session.tutorThread.extracts;
        }
      }

      /* 2) «De mi material» sin match: responde el JUEGO, local, sin
         gastar llamada ni contador (§3.2). */
      if (session.tutorMode === "material" && !extracts.length) {
        pending.replaceChildren(TUTOR_NOT_FOUND);
        session.tutorLog.push({ role: "jarvis", text: TUTOR_NOT_FOUND, chip: null });
        input.disabled = false;
        send.disabled = false;
        return;
      }

      /* 3) La llamada: pregunta + extractos + historial del hilo. */
      pending.replaceChildren("Jarvis está pensando…");
      const history = session.tutorThread ? session.tutorThread.history.slice(-6) : [];
      const result = await askTutor({
        question,
        summary: session.summary,
        extracts: extracts.map((extract) => ({ ref: extract.ref, label: extract.label, text: extract.extract })),
        history,
      }, { signal: controller.signal });
      if (controller.signal.aborted) return;

      if (!result.ok) {
        const line = result.reason === "notutor" ? TUTOR_NO_TUTOR
          : result.reason === "limit" ? TUTOR_LIMIT
          : result.reason === "offline" ? "No pude responder (sin conexión o el servicio falló). Probá de nuevo en un rato."
          : "Algo falló con mi modo tutor. Probá de nuevo en un rato.";
        pending.replaceChildren(line);
        session.tutorLog.push({ role: "jarvis", text: line, chip: null });
        input.disabled = false;
        send.disabled = false;
        return;
      }

      /* 4) La respuesta validada: el chip sale del ref RE-VERIFICADO
         contra los extractos enviados, no de la prosa del modelo. */
      let chip = { kind: "extra" };
      let cited = null;
      if (result.grounded && result.ref) {
        cited = extracts.find((extract) => extract.ref === result.ref) || null;
        if (cited) {
          chip = { kind: "lesson", label: cited.label, ref: cited.ref, campaignId: cited.campaignId };
        }
      }
      pending.replaceChildren(result.text);
      const chipNode = tutorChipNode(chip);
      if (chipNode) log.append(chipNode);

      /* 5) El hilo: tema, extractos e historial para seguimientos. */
      const previousModule = session.tutorThread ? session.tutorThread.topicLabel : null;
      if (!session.tutorThread) session.tutorThread = { topicLabel: null, extracts: [], history: [] };
      if (extracts.length) {
        session.tutorThread.extracts = extracts;
        session.tutorThread.topicLabel = extracts[0].moduleLabel;
        if (previousModule && previousModule !== extracts[0].moduleLabel) {
          log.append(el("p", "jarvis-msg jarvis-msg--game", `Cambiamos de tema: esto ya es de ${extracts[0].moduleLabel}.`));
        }
      }
      session.tutorThread.history.push(
        { role: "user", text: question },
        { role: "jarvis", text: result.text }
      );
      session.tutorLog.push({ role: "jarvis", text: result.text, chip });

      /* 6) «Practicar esto»: el puente de una vía al quiz (§3.5), con
         las reglas y topes del quiz de siempre. */
      if (chip.kind === "lesson" && cited) {
        const topic = QUIZ_TOPICS.find((item) => item.campaignId === cited.campaignId);
        if (topic) {
          const practice = actionButton("Practicar esto", () => startQuiz(topic));
          practice.classList.add("jarvis-tutor-practice");
          log.append(practice);
        }
      }

      /* 7) El consumo: SOLO el contador del Tutor, vía la ruta única.
         Preguntar no paga XP ni monedas, hoy ni nunca (§3.5). */
      const recorded = typeof options.onUsage === "function" ? await options.onUsage("tutor") : null;
      if (recorded && recorded.status === "applied") {
        session.counts.tutorUsed += 1;
        renderFoot();
      }
      input.value = "";
      input.disabled = false;
      send.disabled = session.counts.tutorUsed >= JARVIS_TUTOR_DAILY_LIMIT;
      if (session.counts.tutorUsed >= JARVIS_TUTOR_DAILY_LIMIT) showTutor();
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        send.click();
      }
    });
    const row = el("div", "jarvis-send-row");
    row.append(input, send);
    panel.append(row, bankButton);
  }

  /* ------------------------------ saludo inicial --------------------------- */
  if (session.briefingText) setBubble(session.briefingText);
  else showBriefing(false);
}
