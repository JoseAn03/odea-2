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
} from "../src/jarvis-state.js";
import { askJarvis, jarvisConfigured } from "./jarvis-client.js";

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
    },
    chatLog: [],
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
      ` · mensajes ${session.counts.chatUsed}/${JARVIS_CHAT_DAILY_LIMIT}` +
      ` · revisiones ${session.counts.feedbackUsed}/${JARVIS_FEEDBACK_DAILY_LIMIT}`);
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
    if (session.counts.quizUsed >= JARVIS_QUIZ_DAILY_LIMIT) {
      panel.append(el("p", "jarvis-note",
        "Ya usaste tus 2 quizzes con XP de hoy. Podés seguir practicando, pero sin XP."));
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
    /* El Worker devuelve una ronda de 5 preguntas. La economía del
     * spec no cambia: la ronda cuenta como UN quiz y solo la PRIMERA
     * pregunta paga los 10 XP (máx. 2 rondas con XP al día); las
     * demás son práctica, que es justo lo que José necesita. */
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
      `QUIZ · ${topic.label.toUpperCase()} · PREGUNTA ${index + 1} DE ${questions.length}${isFirst && round.withXp ? ` · LA PRIMERA VALE ${JARVIS_QUIZ_XP} XP` : ""}`));
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
        if (isFirst && round.withXp) {
          const xp = correct ? JARVIS_QUIZ_XP : 0;
          const recorded = typeof options.onQuiz === "function" ? await options.onQuiz(xp) : null;
          if (recorded && recorded.status === "applied") {
            session.counts.quizUsed += 1;
            session.counts.quizXp += xp;
            renderFoot();
            line = correct ? `¡Correcto! +${xp} XP para vos.` : "Esta vez no: la respuesta correcta está marcada. El intento quedó registrado.";
          } else {
            line += " (No se pudo registrar el XP, pero la práctica cuenta.)";
          }
        }
        if (quiz.explanation) line += ` ${quiz.explanation}`;
        if (isLast) line += ` Ronda terminada: acertaste ${round.hits} de ${questions.length}.`;
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
        pending.replaceChildren(result.text);
        session.chatLog.push({ role: "jarvis", text: result.text });
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

  /* ------------------------------ saludo inicial --------------------------- */
  if (session.briefingText) setBubble(session.briefingText);
  else showBriefing(false);
}
