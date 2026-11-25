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
 *
 * v0.53.0 — LA NUEVA CARA DE JARVIS (la maqueta que eligió José, «El
 * orbe manda»): rediseño SOLO de la capa visual. El orbe grande se
 * dibuja por código (SVG en línea, cero binarios) con la cara-pantalla
 * de píxeles del diseño v2 (rejilla 11×7) y sus estados — reposo,
 * pensando, celebrando, sin conexión — que la propia interfaz activa
 * según lo que ya distingue (espera de red, quiz perfecto, acción
 * aplicada). Debajo: el briefing, las acciones como píldoras neón y la
 * barra de pestañas Chat/Tutor/Quiz/Banco siempre visible. Ni el
 * estado, ni las mutaciones, ni las reglas de XP cambian en nada.
 *
 * v0.59.0 — FASE D del English Center («Charla con Jarvis», diseño §7):
 * el chat suma el interruptor «🇬🇧 Talk in English» (modo inglés con
 * Worker v6+: Jarvis conversa en inglés simple y corrige UNA sola
 * cosa por mensaje; mismo chat, mismo historial, mismo tope), el quiz
 * suma el tema «Inglés · Fraseología» alimentado por los mazos SRS del
 * Center con las reglas de XP de siempre, y el saludo local dice la
 * línea del Center cuando el resumen la trae. Nada de eso reemplaza
 * el chat normal, las sugerencias rápidas, el briefing ni los quizzes.
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
import { SRS_CARDS } from "../src/ingles-content.js";
import { buildTutorIndex, searchTutor, threadReusable } from "../src/tutor-index.js";
import { JARVIS_ENGLISH_MIN_WORKER, askJarvis, askTutor, jarvisConfigured, jarvisWorkerVersion } from "./jarvis-client.js";
import {
  JARVIS_ACT_DAILY_LIMIT,
  JARVIS_DRAFTS_MAX,
  addDaysKey,
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
  /* v0.59.0 — Fase D del English Center (diseño §7.2): el tema de
     fraseología se alimenta de los 5 mazos SRS del Center, no de una
     campaña. Las reglas del quiz son las de siempre, sin excepción. */
  { id: "fraseologia", label: "Inglés · Fraseología", campaignId: null, ingles: true, workerTopic: "Inglés · Fraseología" },
];

const NOT_CONNECTED =
  "Hola, José. Todavía no estoy conectado: falta configurar mi dirección en el juego. Mientras tanto, el juego sigue completo sin mí.";

/* El orbe de la maqueta, dibujado por código (SVG en línea): cuerpo
 * perla, visor oscuro y la cara de luz en la rejilla de 11×7 del
 * diseño v2 — ojos cian #00E5FF, mejillas y punta de antena rosas
 * #FF2E93. Cada estado es un grupo <g class="orb-face--…"> y el CSS
 * muestra el que coincide con el data-face del contenedor. */
const JARVIS_ORB_SVG = `
<svg viewBox="0 0 240 250" role="img" aria-label="Jarvis, el robot compañero de la Zona IA" focusable="false">
  <defs>
    <linearGradient id="jv-body" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#F7FAFD"/><stop offset="1" stop-color="#C3CEDD"/>
    </linearGradient>
    <radialGradient id="jv-visor" cx="0.5" cy="0.38" r="0.85">
      <stop offset="0" stop-color="#131B3D"/><stop offset="1" stop-color="#070B1D"/>
    </radialGradient>
    <filter id="jv-blur" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="6"/>
    </filter>
    <clipPath id="jv-clip"><ellipse cx="120" cy="142" rx="96" ry="80"/></clipPath>
  </defs>
  <ellipse cx="120" cy="234" rx="58" ry="9" fill="#00E5FF" opacity="0.35" filter="url(#jv-blur)"/>
  <rect x="117" y="26" width="6" height="32" rx="3" fill="#9AA7BD"/>
  <circle cx="120" cy="20" r="16" fill="#FF2E93" opacity="0.18"/>
  <circle class="orb-antenna-tip" cx="120" cy="20" r="9" fill="#FF2E93"/>
  <rect x="13" y="120" width="18" height="46" rx="9" fill="#9AA7BD"/>
  <rect x="209" y="120" width="18" height="46" rx="9" fill="#9AA7BD"/>
  <ellipse cx="120" cy="142" rx="96" ry="80" fill="url(#jv-body)"/>
  <g clip-path="url(#jv-clip)">
    <ellipse cx="120" cy="212" rx="76" ry="26" fill="#9AA7BD" opacity="0.22"/>
    <ellipse cx="82" cy="86" rx="52" ry="20" fill="#FFFFFF" opacity="0.35"/>
  </g>
  <g class="orb-sparkles" fill="#00E5FF">
    <path d="M30 52 h4 v6 h6 v4 h-6 v6 h-4 v-6 h-6 v-4 h6 z"/>
    <path d="M202 52 h4 v6 h6 v4 h-6 v6 h-4 v-6 h-6 v-4 h6 z" fill="#FF2E93"/>
    <path d="M22 196 h4 v6 h6 v4 h-6 v6 h-4 v-6 h-6 v-4 h6 z" fill="#FF2E93"/>
    <path d="M210 196 h4 v6 h6 v4 h-6 v6 h-4 v-6 h-6 v-4 h6 z"/>
  </g>
  <g class="orb-visor">
    <rect x="50" y="94" width="140" height="94" rx="47" fill="url(#jv-visor)" stroke="rgba(0,229,255,.4)" stroke-width="1.5"/>
    <g class="orb-face orb-face--idle"><g class="orb-eyes"><rect x="67" y="112" width="10" height="10" rx="2.5" fill="#00E5FF"/><rect x="79" y="112" width="10" height="10" rx="2.5" fill="#00E5FF"/><rect x="151" y="112" width="10" height="10" rx="2.5" fill="#00E5FF"/><rect x="163" y="112" width="10" height="10" rx="2.5" fill="#00E5FF"/><rect x="67" y="124" width="10" height="10" rx="2.5" fill="#00E5FF"/><rect x="79" y="124" width="10" height="10" rx="2.5" fill="#00E5FF"/><rect x="151" y="124" width="10" height="10" rx="2.5" fill="#00E5FF"/><rect x="163" y="124" width="10" height="10" rx="2.5" fill="#00E5FF"/><rect x="67" y="136" width="10" height="10" rx="2.5" fill="#00E5FF"/><rect x="79" y="136" width="10" height="10" rx="2.5" fill="#00E5FF"/><rect x="151" y="136" width="10" height="10" rx="2.5" fill="#00E5FF"/><rect x="163" y="136" width="10" height="10" rx="2.5" fill="#00E5FF"/></g><rect x="55" y="136" width="10" height="10" rx="2.5" fill="#FF2E93"/><rect x="175" y="136" width="10" height="10" rx="2.5" fill="#FF2E93"/><rect x="79" y="160" width="10" height="10" rx="2.5" fill="#00E5FF"/><rect x="151" y="160" width="10" height="10" rx="2.5" fill="#00E5FF"/><rect x="91" y="172" width="10" height="10" rx="2.5" fill="#00E5FF"/><rect x="103" y="172" width="10" height="10" rx="2.5" fill="#00E5FF"/><rect x="115" y="172" width="10" height="10" rx="2.5" fill="#00E5FF"/><rect x="127" y="172" width="10" height="10" rx="2.5" fill="#00E5FF"/><rect x="139" y="172" width="10" height="10" rx="2.5" fill="#00E5FF"/></g>
    <g class="orb-face orb-face--thinking"><rect x="55" y="100" width="10" height="10" rx="2.5" fill="#00E5FF"/><rect x="67" y="100" width="10" height="10" rx="2.5" fill="#00E5FF"/><rect x="139" y="100" width="10" height="10" rx="2.5" fill="#00E5FF"/><rect x="151" y="100" width="10" height="10" rx="2.5" fill="#00E5FF"/><rect x="55" y="112" width="10" height="10" rx="2.5" fill="#00E5FF"/><rect x="67" y="112" width="10" height="10" rx="2.5" fill="#00E5FF"/><rect x="139" y="112" width="10" height="10" rx="2.5" fill="#00E5FF"/><rect x="151" y="112" width="10" height="10" rx="2.5" fill="#00E5FF"/><rect x="91" y="160" width="10" height="10" rx="2.5" fill="#00E5FF" class="orb-dot orb-dot--1"/><rect x="115" y="160" width="10" height="10" rx="2.5" fill="#00E5FF" class="orb-dot orb-dot--2"/><rect x="139" y="160" width="10" height="10" rx="2.5" fill="#00E5FF" class="orb-dot orb-dot--3"/></g>
    <g class="orb-face orb-face--celebrate"><rect x="79" y="112" width="10" height="10" rx="2.5" fill="#00E5FF"/><rect x="151" y="112" width="10" height="10" rx="2.5" fill="#00E5FF"/><rect x="67" y="124" width="10" height="10" rx="2.5" fill="#00E5FF"/><rect x="91" y="124" width="10" height="10" rx="2.5" fill="#00E5FF"/><rect x="139" y="124" width="10" height="10" rx="2.5" fill="#00E5FF"/><rect x="163" y="124" width="10" height="10" rx="2.5" fill="#00E5FF"/><rect x="55" y="136" width="10" height="10" rx="2.5" fill="#FF2E93"/><rect x="175" y="136" width="10" height="10" rx="2.5" fill="#FF2E93"/><rect x="79" y="148" width="10" height="10" rx="2.5" fill="#00E5FF"/><rect x="151" y="148" width="10" height="10" rx="2.5" fill="#00E5FF"/><rect x="79" y="160" width="10" height="10" rx="2.5" fill="#00E5FF"/><rect x="91" y="160" width="10" height="10" rx="2.5" fill="#00E5FF"/><rect x="103" y="160" width="10" height="10" rx="2.5" fill="#00E5FF"/><rect x="115" y="160" width="10" height="10" rx="2.5" fill="#00E5FF"/><rect x="127" y="160" width="10" height="10" rx="2.5" fill="#00E5FF"/><rect x="139" y="160" width="10" height="10" rx="2.5" fill="#00E5FF"/><rect x="151" y="160" width="10" height="10" rx="2.5" fill="#00E5FF"/><rect x="91" y="172" width="10" height="10" rx="2.5" fill="#00E5FF"/><rect x="103" y="172" width="10" height="10" rx="2.5" fill="#00E5FF"/><rect x="115" y="172" width="10" height="10" rx="2.5" fill="#00E5FF"/><rect x="127" y="172" width="10" height="10" rx="2.5" fill="#00E5FF"/><rect x="139" y="172" width="10" height="10" rx="2.5" fill="#00E5FF"/></g>
    <g class="orb-face orb-face--offline"><rect x="67" y="124" width="10" height="10" rx="2.5" fill="#00E5FF"/><rect x="79" y="124" width="10" height="10" rx="2.5" fill="#00E5FF"/><rect x="151" y="124" width="10" height="10" rx="2.5" fill="#00E5FF"/><rect x="163" y="124" width="10" height="10" rx="2.5" fill="#00E5FF"/><rect x="103" y="160" width="10" height="10" rx="2.5" fill="#00E5FF"/><rect x="115" y="160" width="10" height="10" rx="2.5" fill="#00E5FF"/><rect x="127" y="160" width="10" height="10" rx="2.5" fill="#00E5FF"/></g>
  </g>
</svg>`;

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
  /* v0.52.0 — la línea del banco (§2.5): el resumen la trae solo con
     ≥ 3 guardadas sin repasar; el saludo local la dice tal cual. */
  if (summary.bancoSinRepasar) {
    parts.push(`Tenés ${summary.bancoSinRepasar} preguntas guardadas sin repasar. ¿Las vemos?`);
  }
  /* v0.59.0 — la línea del English Center (Fase D, §7.3): el resumen
     la trae solo cuando hay algo vivo; el saludo local la dice tal
     cual, con los datos reales del save. */
  if (summary.inglesCenter) {
    const center = summary.inglesCenter;
    const bits = [center.turnoDelDiaHecho
      ? "el turno del día del English Center ya está hecho"
      : "te falta el turno del día del English Center"];
    if (center.tarjetasVencidas > 0) {
      bits.push(`tenés ${center.tarjetasVencidas} tarjeta${center.tarjetasVencidas === 1 ? "" : "s"} de fraseología por repasar`);
    }
    parts.push(`En el English Center: ${bits.join(" y ")}.`);
  }
  return parts.join(" ");
}

/** Material REAL del tema para el Worker: hasta 12 misiones de su
 *  campaña como { title, brief, deliverable } (el tope que acepta el
 *  Worker), muestreadas a lo largo de toda la campaña para no sesgar
 *  a los primeros capítulos. Para «Datos en general» van las de la
 *  Zona IA, que es su material de datos e IA. */
const MATERIAL_LIMIT = 12;

/** v0.59.0 — el material del tema «Inglés · Fraseología»: hasta 12
 *  tarjetas de los 5 mazos SRS del English Center, muestreadas a lo
 *  largo de todo el banco (130) para no sesgar a un solo mazo, en la
 *  forma { title, brief, deliverable } que acepta el Worker: la frase
 *  en inglés, su significado con un ejemplo de su mundo, y la guía de
 *  pronunciación. Exportada para tests, como jarvisLocalGreeting. */
export function fraseologiaQuizMaterial() {
  const step = SRS_CARDS.length / MATERIAL_LIMIT;
  const material = [];
  for (let i = 0; i < MATERIAL_LIMIT; i += 1) {
    const card = SRS_CARDS[Math.floor(i * step)];
    material.push({
      title: card.term,
      brief: `Significado: ${card.meaning}. Ejemplo: ${card.example}`,
      deliverable: `Pronunciación guía: ${card.pron}.`
    });
  }
  return material;
}

function topicMaterial(topic) {
  if (topic.ingles) return fraseologiaQuizMaterial();
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
    /* v0.52.0 — el Banco de preguntas: copia de sesión de las entradas
       guardadas (llegan de jarvisView vía options.view.bankEntries).
       Guardar y borrar pasan por los callbacks de app.js → la ruta
       única de escritura; el repaso es 100 % local (sin mutaciones,
       sin XP, sin red). */
    bank: Array.isArray(options.view && options.view.bankEntries) ? [...options.view.bankEntries] : [],
    bankFilter: { kind: "all", module: null },
    bankQuery: "",
    chatLog: [],
    /* v0.59.0 — Fase D del English Center: el modo inglés del chat es
       de SESIÓN (como el historial: no se guarda en el save) y la nota
       bajo su botón guarda el último aviso (encendido, sin conexión o
       «se activa cuando actualices tu Jarvis»). */
    chatEnglish: false,
    chatNote: null,
    /* v0.50.0 — manos: contador de acciones aplicadas hoy, el plan del
       día conocido (para re-validar propuestas contra el estado vivo) y
       la ÚNICA tarjeta que puede estar pendiente a la vez. */
    actUsed: (options.view && options.view.accionesHoy) || 0,
    plan: {
      focusId: (options.view && options.view.dayPlan && options.view.dayPlan.focusId) || null,
      order: (options.view && options.view.dayPlan && options.view.dayPlan.order) || null,
      busy: (options.view && options.view.dayPlan && options.view.dayPlan.busy) || null,
    },
    /* v0.54.0 — MANOS QUE CRUZAN: copia de sesión de los snoozes del
       Garaje y los borradores (llegan de jarvisView vía options.view),
       para re-validar propuestas de cruce contra el estado vivo y
       espejar lo aplicado sin recargar el panel. */
    cross: {
      snoozes: (options.view && options.view.snoozes) || {},
      drafts: Array.isArray(options.view && options.view.drafts) ? [...options.view.drafts] : [],
    },
    pendingCard: null,
  };
  sessions.set(root, session);
  root.replaceChildren();

  const shell = el("div", "campaign-shell jarvis-shell");
  shell.style.setProperty("--campaign-accent", "#FF2E93");

  /* --------------------- encabezado: el orbe manda ----------------------
     v0.53.0: el héroe de la maqueta — el orbe GRANDE presidiendo, el
     nombre en neón y la línea de estado (conexión + racha real del
     resumen). La cara cambia con setFace() según lo que la interfaz
     ya distingue; es presentación pura, sin tocar lógica. */
  const baseFace = jarvisConfigured() ? "idle" : "offline";
  const head = el("header", "jarvis-head");
  const headTop = el("div", "jarvis-head-top");
  headTop.append(el("p", "campaign-eyebrow", "ZONA IA · TU COMPAÑERO"));
  const close = el("button", "campaign-back jarvis-close", "Cerrar");
  close.type = "button";
  close.addEventListener("click", () => { if (typeof options.onClose === "function") options.onClose(); });
  headTop.append(close);
  const orb = el("div", "jarvis-orb");
  orb.innerHTML = JARVIS_ORB_SVG;
  orb.dataset.face = baseFace;
  const status = el("p", "jarvis-status");
  status.append(el("span", jarvisConfigured() ? "jarvis-status-on" : "jarvis-status-off",
    jarvisConfigured() ? "EN LÍNEA" : "SIN CONEXIÓN"));
  const racha = session.summary && session.summary.rachaDias;
  if (typeof racha === "number" && racha > 0) {
    status.append(" · ", el("span", "jarvis-status-streak", `RACHA DE ${racha} DÍA${racha === 1 ? "" : "S"} 🔥`));
  }
  head.append(headTop, orb, el("h2", "jarvis-name", "JARVIS"), status);
  shell.append(head);

  /* La cara del orbe: reposo (o sin conexión) es la base; «pensando»
     dura lo que dura la llamada en vuelo; «celebrando» es un gesto
     breve (quiz perfecto, acción aplicada) y vuelve solo a la base. */
  let faceTimer = null;
  function setFace(face) {
    orb.dataset.face = face;
  }
  function celebrate() {
    setFace("celebrate");
    if (faceTimer) clearTimeout(faceTimer);
    faceTimer = setTimeout(() => { if (!controller.signal.aborted) setFace(baseFace); }, 2100);
  }

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

  /* --------------------- barra de pestañas (v0.53.0) ----------------------
     La barra inferior de la maqueta: Chat/Tutor/Quiz/Banco siempre
     visibles (sticky al pie del diálogo). Cada pestaña abre la MISMA
     vista que ya abrían las acciones de arriba — es un segundo camino
     visual, sin lógica nueva; el Banco gana por fin puerta propia. */
  const tabbar = el("nav", "jarvis-tabbar");
  tabbar.setAttribute("aria-label", "Secciones de Jarvis");
  const tabs = {};
  function makeTab(id, icon, label, onClick) {
    const tab = el("button", "jarvis-tab");
    tab.type = "button";
    tab.append(el("span", "jarvis-tab-icon", icon), el("span", "jarvis-tab-label", label));
    tab.addEventListener("click", onClick);
    tabs[id] = tab;
    return tab;
  }
  function setActiveTab(id) {
    for (const [key, tab] of Object.entries(tabs)) {
      tab.classList.toggle("jarvis-tab--active", key === id);
    }
  }
  tabbar.append(
    makeTab("chat", "💬", "CHAT", () => showChat()),
    makeTab("tutor", "📚", "TUTOR", () => showTutor()),
    makeTab("quiz", "🎯", "QUIZ", () => showQuizTopics()),
    makeTab("banco", "📌", "BANCO", () => showBank())
  );
  shell.append(tabbar);
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
    setFace("thinking");
    const result = await askJarvis("briefing", { summary: session.summary }, { signal: controller.signal });
    if (controller.signal.aborted) return;
    setFace(baseFace);
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
    setActiveTab("quiz");
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
    setActiveTab("quiz");
    panel.replaceChildren();
    panel.append(el("p", "jarvis-note", "Preparando tus preguntas…"));
    setFace("thinking");
    const result = await askJarvis("quiz",
      { topic: topic.workerTopic || topic.id, material: topicMaterial(topic) }, { signal: controller.signal });
    if (controller.signal.aborted) return;
    setFace(baseFace);
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
        /* v0.53.0 — quiz perfecto: el orbe celebra (lo dispara el juego
           con el dato real de la ronda, nunca el modelo). */
        if (isLast && round.hits === questions.length) celebrate();
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
    const dailies = ac && Array.isArray(ac.diarias)
      ? ac.diarias.map((d) => ({ id: d.id, title: d.titulo, completed: Boolean(d.hecha) }))
      : [];
    /* v0.54.0 — el universo de los cruces en la sesión: las rutinas
       urgentes del resumen (el validador local las contrasta; el
       reducer re-valida contra el Garaje ENTERO), los snoozes y
       borradores de la sesión, y el mapa id→título de misiones
       (próximas de campaña + diarias de hoy) para draft_evidence. */
    const missionTitles = {};
    if (ac && Array.isArray(ac.misiones)) {
      for (const m of ac.misiones) missionTitles[m.id] = m.titulo;
    }
    for (const d of dailies) missionTitles[d.id] = d.title;
    return {
      date: localTodayKey(),
      dailies,
      focusId: session.plan.focusId,
      order: session.plan.order,
      busy: session.plan.busy,
      garage: ac && Array.isArray(ac.garajePorVencer)
        ? ac.garajePorVencer.map((r) => ({ id: r.id, name: r.nombre, state: r.estado, kind: "rutina" }))
        : [],
      garageComplete: false,
      snoozes: session.cross.snoozes,
      drafts: session.cross.drafts,
      draftCount: session.cross.drafts.length,
      missionTitles,
    };
  }

  function applyPlanLocally(name, args) {
    if (name === "set_daily_focus") session.plan.focusId = args.dailyId;
    else if (name === "reorder_dailies") session.plan.order = [...args.order];
    else if (name === "set_busy_day") {
      session.plan.busy = { minutes: args.minutes, chosen: [...args.chosen], deferred: [...args.deferred] };
    }
  }

  /* v0.54.0 — espejo local de un cruce aplicado (el reducer ya lo
     guardó; esto solo mantiene viva la sesión): el snooze con su
     fecha calculada y el borrador con su FIFO, como en el save. */
  function applyCrossLocally(name, args, requestId) {
    if (name === "snooze_garage_routine") {
      const until = addDaysKey(localTodayKey(), args.days);
      if (until) session.cross.snoozes[`garaje:${args.routineId}`] = until;
    } else if (name === "draft_evidence") {
      if (session.cross.drafts.length >= JARVIS_DRAFTS_MAX) {
        const oldest = [...session.cross.drafts]
          .sort((a, b) => String(a.at).localeCompare(String(b.at)) || String(a.id).localeCompare(String(b.id)))[0];
        session.cross.drafts = session.cross.drafts.filter((d) => d.id !== oldest.id);
      }
      const titles = actionContext().missionTitles;
      session.cross.drafts.unshift({
        id: requestId,
        missionId: args.missionId ?? null,
        missionTitle: args.missionId ? (titles[args.missionId] ?? null) : null,
        text: args.text,
        date: localTodayKey(),
        at: new Date().toISOString(),
      });
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
    const crossSnapshot = structuredClone(session.cross);
    session.pendingCard = { requestId, name: action.name, args: action.args };
    card.append(
      el("p", "jarvis-action-eyebrow", "🖐 JARVIS PROPONE"),
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
      /* v0.54.0 — el cruce a la Libreta (§3.5): la nota la crea el
         JUEGO primero, con la mutación de la Libreta de siempre, y el
         registro de Jarvis nace DESPUÉS con su refId. Si la nota no
         se pudo crear, no hay registro: la tarjeta lo dice y listo. */
      let noteId = null;
      if (action.name === "create_libreta_note") {
        if (typeof options.onLibretaCreate !== "function") {
          session.pendingCard = null;
          card.replaceChildren(el("p", "jarvis-action-body", "No se pudo aplicar. Probá de nuevo en un rato."));
          return;
        }
        const created = await options.onLibretaCreate(action.args.text);
        if (controller.signal.aborted) return;
        if (!created || !created.ok || !created.noteId) {
          session.pendingCard = null;
          card.replaceChildren(el("p", "jarvis-action-body", "No se pudo crear la nota. Probá de nuevo en un rato."));
          return;
        }
        noteId = created.noteId;
      }
      const mutation = { type: "jarvis.act", requestId, name: action.name, args: action.args };
      if (noteId) mutation.refId = noteId;
      const result = await options.onAct(mutation);
      if (controller.signal.aborted) return;
      if (result && (result.status === "applied" || result.status === "duplicate")) {
        if (result.status === "applied") session.actUsed += 1;
        applyPlanLocally(action.name, action.args);
        applyCrossLocally(action.name, action.args, requestId);
        session.pendingCard = null;
        renderFoot();
        celebrate();
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
            session.cross = crossSnapshot;
            /* La nota del cruce se borra con la mutación de la
               Libreta, tras el OK del deshacer (§3.5). */
            if (noteId && typeof options.onLibretaDelete === "function") {
              await options.onLibretaDelete(noteId);
              if (controller.signal.aborted) return;
            }
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
        /* La nota quedó creada pero el registro falló: se compensa
           borrándola — nunca queda una nota huérfana de un registro. */
        if (noteId && typeof options.onLibretaDelete === "function") {
          try { await options.onLibretaDelete(noteId); } catch { /* compensación best-effort */ }
          if (controller.signal.aborted) return;
        }
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

  /* --------------------- el Banco de preguntas (v0.52.0) -------------------
     Diseño maestro §3.4: las respuestas útiles de Jarvis se guardan
     con un toque 📌 en play.jarvis.bank (mutación del JUEGO por la
     ruta única — la IA ni se entera), se organizan por módulo y se
     repasan sin conexión como tarjetas. Guardar y repasar NO pagan
     XP ni monedas, ni gastan llamadas: todo es local. */

  const BANK_Q_MAX = 300;
  const BANK_A_MAX = 1200;

  /* La respuesta guardada se recorta a 1.200 con «…» final: la propia
     entrada indica que fue recortada (§3.4.2). */
  function bankAnswerText(text) {
    const value = String(text || "");
    return value.length > BANK_A_MAX ? `${value.slice(0, BANK_A_MAX - 1)}…` : value;
  }

  function localTodayKey() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }

  /* El botón 📌 de una respuesta (Tutor o chat). Al aplicar, la línea
     de confirmación la pone EL JUEGO («📌 Guardada en tu banco · X»),
     nunca el modelo (§3.4.1). Banco lleno = se dice antes, sin FIFO
     silencioso. */
  function bankSaveButton(payload, onSaved) {
    const wrap = el("div", "jarvis-bank-savewrap");
    const button = actionButton("📌 Guardar", async () => {
      if (typeof options.onBankSave !== "function") return;
      button.disabled = true;
      const entry = {
        id: newJarvisRequestId(),
        q: String(payload.q || "").slice(0, BANK_Q_MAX),
        a: bankAnswerText(payload.a),
        kind: payload.kind === "lesson" ? "lesson" : "extra",
        ref: payload.kind === "lesson" && payload.ref ? String(payload.ref).slice(0, 120) : null,
        module: payload.module ? String(payload.module).slice(0, 40) : null,
      };
      const result = await options.onBankSave(entry);
      if (controller.signal.aborted) return;
      if (result && (result.status === "applied" || result.status === "duplicate")) {
        if (result.status === "applied") {
          session.bank.unshift({ ...entry, date: localTodayKey(), at: Date.now() });
        }
        if (typeof onSaved === "function") onSaved(entry);
        wrap.replaceChildren(el("p", "jarvis-bank-saved",
          `📌 Guardada en tu banco · ${entry.module || "Extras"}`));
      } else if (result && result.error && result.error.code === "JARVIS_BANK_CAP") {
        wrap.replaceChildren(el("p", "jarvis-note",
          "Tu banco está lleno (100/100): borrá una entrada para guardar esta."));
      } else {
        button.disabled = false;
        wrap.append(el("p", "jarvis-note", "No se pudo guardar. Probá de nuevo en un rato."));
      }
    });
    button.classList.add("jarvis-bank-save");
    wrap.append(button);
    return wrap;
  }

  /* La línea/botón de guardado bajo una respuesta ya pintada: si la
     entrada del hilo ya se guardó en esta sesión, se ve la línea;
     si no, el botón. `payload` es { q, a, kind, ref, module }. */
  function bankSaveNode(logEntry, payload) {
    if (logEntry.savedBankId) {
      return el("p", "jarvis-bank-saved", `📌 Guardada en tu banco · ${payload.module || "Extras"}`);
    }
    return bankSaveButton(payload, (saved) => { logEntry.savedBankId = saved.id; });
  }

  function groupBankEntries(entries) {
    const groups = [];
    const byModule = new Map();
    for (const entry of entries) {
      const key = entry.module || null;
      if (!byModule.has(key)) {
        const group = { module: key, entries: [] };
        byModule.set(key, group);
        groups.push(group);
      }
      byModule.get(key).entries.push(entry);
    }
    return groups;
  }

  function foldBankText(value) {
    return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function bankFilteredEntries() {
    const filter = session.bankFilter;
    let list = session.bank;
    if (filter.kind === "module") list = list.filter((entry) => (entry.module || null) === filter.module);
    else if (filter.kind === "extras") list = list.filter((entry) => !entry.module);
    const query = foldBankText(session.bankQuery).trim();
    if (query) {
      list = list.filter((entry) => foldBankText(`${entry.q} ${entry.a}`).includes(query));
    }
    return list;
  }

  /* --------------------------------- chat --------------------------------- */
  function showChat() {
    setActiveTab("chat");
    panel.replaceChildren();
    panel.append(el("h3", "jarvis-panel-title", "Preguntar algo"));
    /* v0.59.0 — «🇬🇧 Talk in English» (diseño §7.1): el modo inglés
       NO reemplaza el chat — es un interruptor sobre este mismo chat,
       con su mismo historial y su mismo tope de 20 mensajes/día.
       Encenderlo pregunta primero la versión del Worker en vivo: con
       v6+ enciende; con v5 o menos muestra el aviso honesto de que se
       activa al pegar el Worker v6; sin conexión no abre. Apagarlo
       vuelve al español al instante. */
    const enToggle = el("button",
      `jarvis-en-toggle${session.chatEnglish ? " jarvis-en-toggle--on" : ""}`,
      session.chatEnglish
        ? "🇬🇧 English mode: ON — tocá para volver al español"
        : "🇬🇧 Talk in English");
    enToggle.type = "button";
    enToggle.addEventListener("click", async () => {
      if (session.chatEnglish) {
        session.chatEnglish = false;
        session.chatNote = null;
        showChat();
        return;
      }
      enToggle.disabled = true;
      enToggle.textContent = "🇬🇧 Un momento, reviso mi versión…";
      const version = await jarvisWorkerVersion({ signal: controller.signal });
      if (controller.signal.aborted) return;
      if (version != null && version >= JARVIS_ENGLISH_MIN_WORKER) {
        session.chatEnglish = true;
        session.chatNote = "English mode is ON: I'll reply in simple English and fix just one thing per message. Tell me about your day! 🇬🇧";
      } else if (version == null) {
        session.chatNote = jarvisConfigured()
          ? "No pude verificar mi versión (sin conexión). El modo inglés se enciende apenas me conecte."
          : "Todavía no estoy conectado: el modo inglés llega cuando me conectés.";
      } else {
        session.chatNote = "Mi modo inglés se activa cuando actualices tu Jarvis: pegá el Worker v6 en Cloudflare (el paso de tu PC) y este botón se enciende solo. Mientras tanto, charlemos como siempre.";
      }
      showChat();
    });
    panel.append(enToggle);
    if (session.chatNote) panel.append(el("p", "jarvis-note", session.chatNote));
    const log = el("div", "jarvis-chat-log");
    for (const entry of session.chatLog) {
      log.append(el("p", entry.role === "user" ? "jarvis-msg jarvis-msg--user" : "jarvis-msg jarvis-msg--jarvis", entry.text));
      /* v0.52.0 — una respuesta del chat también se puede guardar
         (§3.4.1): nace como EXTRA (el chat no cita material), en el
         grupo «Extras» del banco. */
      if (entry.role === "jarvis" && entry.bankQ) {
        log.append(bankSaveNode(entry,
          { q: entry.bankQ, a: entry.text, kind: "extra", ref: null, module: null }));
      }
    }
    panel.append(log);

    if (session.counts.chatUsed >= JARVIS_CHAT_DAILY_LIMIT) {
      panel.append(el("p", "jarvis-note", "Por hoy llegamos al límite de mensajes. Mañana seguimos."));
      return;
    }

    const input = el("textarea", "jarvis-input");
    input.rows = 3;
    input.placeholder = session.chatEnglish
      ? "Write to me in English — your day, your work, anything…"
      : "Preguntame lo que sea de tu plan, tus campañas o tu preparación…";
    const send = actionButton("➤", async () => {
      const message = String(input.value || "").trim();
      if (!message) return;
      send.disabled = true;
      input.disabled = true;
      session.chatLog.push({ role: "user", text: message });
      log.append(el("p", "jarvis-msg jarvis-msg--user", message));
      const pending = el("p", "jarvis-msg jarvis-msg--jarvis", "Jarvis está escribiendo…");
      log.append(pending);
      setFace("thinking");

      const result = await askJarvis("chat", {
        message,
        summary: session.summary,
        history: session.chatLog.slice(-6),
        /* v0.59.0 — el flag del modo inglés: solo viaja encendido, y
           solo pudo encenderse con Worker v6+ verificado. */
        ...(session.chatEnglish ? { mode: "en" } : {})
      }, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setFace(baseFace);
      if (result.ok) {
        if (result.text && result.text.trim()) {
          pending.replaceChildren(result.text);
          const logEntry = { role: "jarvis", text: result.text, bankQ: message };
          session.chatLog.push(logEntry);
          /* v0.52.0 — 📌 Guardar bajo la respuesta del chat (extra). */
          log.append(bankSaveNode(logEntry,
            { q: message, a: result.text, kind: "extra", ref: null, module: null }));
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
    /* v0.53.0 — el botón de envío de la maqueta: círculo rosa con la
       flecha; el nombre accesible sigue siendo «Enviar». */
    send.classList.add("jarvis-send-round");
    send.setAttribute("aria-label", "Enviar");
    send.title = "Enviar";

    /* v0.53.0 — las preguntas rápidas de la maqueta, como píldoras
       neón sobre el campo: dejan la pregunta escrita en el campo
       (José la manda con el mismo botón de siempre, o la edita) y el
       atajo al quiz. Ningún camino nuevo: el envío es el de siempre. */
    const chips = el("div", "jarvis-quick-chips");
    for (const text of (session.chatEnglish
      ? ["How is my day going?", "What should I practice today?"]
      : ["¿Qué me falta hoy?", "¿Cómo va mi plan?"])) {
      const chip = el("button", "jarvis-quick-chip", text);
      chip.type = "button";
      chip.addEventListener("click", () => { input.value = text; input.focus(); });
      chips.append(chip);
    }
    const quizChip = el("button", "jarvis-quick-chip jarvis-quick-chip--quiz", "🎯 Quiz rápido");
    quizChip.type = "button";
    quizChip.addEventListener("click", () => showQuizTopics());
    chips.append(quizChip);

    const row = el("div", "jarvis-send-row");
    row.append(input, send);
    panel.append(chips, row);
  }

  /* ------------------------------- feedback ------------------------------- */
  function showFeedback() {
    setActiveTab(null);
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
      setFace("thinking");
      const result = await askJarvis("feedback", {
        missionTitle: mission.title,
        deliverable: mission.deliverable,
        evidence: text,
      }, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setFace(baseFace);
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

    /* v0.54.0 — «Usar un borrador» (§3.6): carga el texto de un
       borrador que Jarvis guardó en el campo de evidencia, EDITABLE
       antes de enviar. Usarlo NO borra el borrador: sigue guardado
       hasta que el FIFO lo saque o José deshaga la acción. */
    const draftSelect = el("select", "jarvis-select");
    if (session.cross.drafts.length) {
      const placeholder = el("option", "", "Usar un borrador…");
      placeholder.value = "";
      draftSelect.append(placeholder);
      for (const draft of session.cross.drafts) {
        const option = el("option", "", draft.missionTitle ? `✍️ ${draft.missionTitle}` : "✍️ Borrador sin misión");
        option.value = draft.id;
        draftSelect.append(option);
      }
      draftSelect.addEventListener("change", () => {
        const draft = session.cross.drafts.find((d) => d.id === draftSelect.value);
        if (draft) evidence.value = draft.text;
        draftSelect.value = "";
      });
    }

    panel.append(
      el("label", "campaign-label", "CAMPAÑA"), campaignSelect,
      el("label", "campaign-label", "MISIÓN COMPLETADA"), missionSelect,
      el("label", "campaign-label", "TU EVIDENCIA"), evidence,
      ...(session.cross.drafts.length
        ? [el("label", "campaign-label", "O CARGÁ UN BORRADOR"), draftSelect]
        : []),
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
     El hilo vive en la sesión; lo que José quiere conservar queda en
     el banco (v0.52.0: botón 📌 por respuesta, vista por módulo y
     repaso offline — el bloque «Banco de preguntas» de este archivo). */

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

  /* --------------------- la vista del Banco (§5.3) ---------------------
     Grupos por módulo con chips de filtro, buscador local sobre
     pregunta+respuesta, cada entrada con su chip de tipo y su ✕ con
     confirmación, y el botón «Repasar» con el filtro de módulo
     activo. El pie dice cuántas van de 100 (y avisa desde las 90). */

  function showBank() {
    setActiveTab("banco");
    panel.replaceChildren();
    panel.append(el("h3", "jarvis-panel-title", "📌 Mi banco de preguntas"));
    const total = session.bank.length;

    if (!total) {
      panel.append(el("p", "jarvis-note",
        "Todavía no guardaste ninguna respuesta. En el Tutor (o en el chat), tocá «📌 Guardar» bajo una " +
        "respuesta y queda acá: organizada por módulo y lista para repasar sin conexión, como tarjetas."));
      panel.append(actionButton("Volver al Tutor", () => showTutor()));
      return;
    }

    const chips = el("div", "jarvis-bank-chips");
    const chipFor = (label, filter) => {
      const active = session.bankFilter.kind === filter.kind && session.bankFilter.module === filter.module;
      const chip = el("button", `jarvis-bank-chip${active ? " jarvis-bank-chip--active" : ""}`, label);
      chip.type = "button";
      chip.addEventListener("click", () => { session.bankFilter = filter; showBank(); });
      chips.append(chip);
    };
    chipFor(`Todos (${total})`, { kind: "all", module: null });
    const groups = groupBankEntries(session.bank);
    for (const group of groups) {
      if (group.module) chipFor(`${group.module} (${group.entries.length})`, { kind: "module", module: group.module });
    }
    const extrasGroup = groups.find((group) => group.module === null);
    if (extrasGroup) chipFor(`Extras (${extrasGroup.entries.length})`, { kind: "extras", module: null });
    panel.append(chips);

    const search = el("input", "jarvis-input jarvis-bank-search");
    search.type = "search";
    search.placeholder = "Buscar en tu banco…";
    search.value = session.bankQuery;
    panel.append(search);

    const reviewButton = actionButton("Repasar", () => {
      const filter = session.bankFilter;
      let list = session.bank;
      if (filter.kind === "module") list = list.filter((entry) => (entry.module || null) === filter.module);
      else if (filter.kind === "extras") list = list.filter((entry) => !entry.module);
      showReview(list,
        filter.kind === "module" ? filter.module : filter.kind === "extras" ? "Extras" : "Todo tu banco");
    });
    reviewButton.classList.add("jarvis-bank-review");
    panel.append(reviewButton);

    const listBox = el("div", "jarvis-bank-list");
    panel.append(listBox);
    renderBankList(listBox);

    panel.append(el("p", "jarvis-bank-foot",
      `${total}/100 guardadas${total >= 90 ? ` · Te quedan ${100 - total} espacios` : ""}`));
    panel.append(actionButton("Volver al Tutor", () => showTutor()));

    /* El buscador re-pinta SOLO la lista: el foco queda en el campo. */
    search.addEventListener("input", () => {
      session.bankQuery = search.value;
      renderBankList(listBox);
    });
  }

  function renderBankList(listBox) {
    listBox.replaceChildren();
    const list = bankFilteredEntries();
    if (!list.length) {
      listBox.append(el("p", "jarvis-note",
        "Nada por acá con ese filtro. Probá con otro módulo o limpiá la búsqueda."));
      return;
    }
    for (const group of groupBankEntries(list)) {
      listBox.append(el("h4", "jarvis-bank-group", group.module || "Extras"));
      for (const entry of group.entries) listBox.append(bankEntryNode(entry));
    }
  }

  function bankEntryNode(entry) {
    const card = el("div", "jarvis-bank-entry");
    card.append(el("p", "jarvis-bank-q", entry.q));
    const answer = el("p", "jarvis-bank-a", entry.a);
    card.append(answer);

    const meta = el("div", "jarvis-bank-meta");
    meta.append(el("span",
      entry.kind === "lesson"
        ? "jarvis-tutor-chip jarvis-tutor-chip--lesson"
        : "jarvis-tutor-chip jarvis-tutor-chip--extra",
      entry.kind === "lesson" ? `📚 ${entry.module || "Lección"}` : "💬 Fuera de tu material"));
    meta.append(el("span", "jarvis-bank-date", entry.date));
    const toggle = el("button", "jarvis-bank-toggle", "Ver más");
    toggle.type = "button";
    toggle.addEventListener("click", () => {
      const open = answer.classList.toggle("jarvis-bank-a--open");
      toggle.textContent = open ? "Ver menos" : "Ver más";
    });
    meta.append(toggle);
    const del = el("button", "jarvis-bank-del", "✕");
    del.type = "button";
    del.title = "Borrar del banco";
    del.addEventListener("click", () => {
      /* La confirmación habitual de la casa: dos pasos, en el sitio. */
      const yes = el("button", "jarvis-bank-del jarvis-bank-del--confirm", "Borrar");
      yes.type = "button";
      const no = el("button", "jarvis-bank-toggle", "Cancelar");
      no.type = "button";
      no.addEventListener("click", () => showBank());
      yes.addEventListener("click", async () => {
        if (typeof options.onBankRemove !== "function") return;
        yes.disabled = true;
        const result = await options.onBankRemove(entry.id);
        if (controller.signal.aborted) return;
        if (result && (result.status === "applied" || result.status === "duplicate")) {
          session.bank = session.bank.filter((item) => item.id !== entry.id);
          showBank();
        } else {
          yes.disabled = false;
        }
      });
      meta.replaceChildren(
        el("span", "jarvis-bank-confirm-label", "¿Borrar esta entrada?"), yes, no);
    });
    meta.append(del);
    card.append(meta);
    return card;
  }

  /* --------------------- el modo repaso (§3.4.3) ---------------------
     Tarjetas de a una, 100 % local: primero la pregunta (y su
     módulo), toque para revelar la respuesta, y «La sabía» /
     «Repasarla luego» solo ordenan ESTA sesión — v1 sin notas ni
     historial persistente. Funciona sin conexión y sin gastar
     llamadas, y no paga XP: repasar es el hábito, no la granja. */

  function showReview(entries, filterLabel) {
    setActiveTab("banco");
    panel.replaceChildren();
    panel.append(el("h3", "jarvis-panel-title", `Repasar — ${filterLabel}`));
    if (!entries.length) {
      panel.append(el("p", "jarvis-note", "No hay tarjetas para repasar con este filtro."));
      panel.append(actionButton("Volver al banco", () => showBank()));
      return;
    }
    const queue = [...entries];
    const total = entries.length;
    let known = 0;
    const box = el("div", "jarvis-review-box");
    panel.append(box);
    panel.append(actionButton("Volver al banco", () => showBank()));

    function showCard() {
      box.replaceChildren();
      if (!queue.length) {
        box.append(el("p", "jarvis-review-done", `🎉 Repaso terminado: sabías ${known} de ${total}.`));
        box.append(actionButton("Repasar de nuevo", () => showReview(entries, filterLabel)));
        return;
      }
      const entry = queue[0];
      box.append(el("p", "jarvis-review-progress", `Quedan ${queue.length} · Sabidas: ${known} de ${total}`));
      box.append(el("p", "jarvis-review-module", entry.module || "Extras"));
      box.append(el("p", "jarvis-review-q", entry.q));
      const revealBox = el("div", "jarvis-review-reveal");
      const reveal = actionButton("Mostrar respuesta", () => {
        const row = el("div", "jarvis-action-row");
        const knew = el("button", "jarvis-action-accept", "La sabía");
        knew.type = "button";
        knew.addEventListener("click", () => { queue.shift(); known += 1; showCard(); });
        const later = el("button", "jarvis-action-discard", "Repasarla luego");
        later.type = "button";
        later.addEventListener("click", () => { queue.push(queue.shift()); showCard(); });
        row.append(knew, later);
        revealBox.replaceChildren(el("p", "jarvis-review-a", entry.a), row);
      });
      revealBox.append(reveal);
      box.append(revealBox);
    }
    showCard();
  }

  function showTutor() {
    setActiveTab("tutor");
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
      /* v0.52.0 — el 📌 de cada respuesta del hilo (lección o extra). */
      if (entry.role === "jarvis" && entry.bank) log.append(bankSaveNode(entry, entry.bank));
    }
    panel.append(log);

    const bankButton = actionButton(`📌 Mi banco (${session.bank.length})`, () => showBank());
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
      setFace("thinking");
      const history = session.tutorThread ? session.tutorThread.history.slice(-6) : [];
      const result = await askTutor({
        question,
        summary: session.summary,
        extracts: extracts.map((extract) => ({ ref: extract.ref, label: extract.label, text: extract.extract })),
        history,
      }, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setFace(baseFace);

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

      /* 5) El 📌 del banco (§3.4.1): la pregunta guardada es la que
         José hizo; si fue un seguimiento de lección, se le antepone
         el módulo para que se entienda sola fuera del hilo. */
      const savePayload = {
        q: chip.kind === "lesson" && cited && history.length
          ? `${cited.moduleLabel} · ${question}`
          : question,
        a: result.text,
        kind: chip.kind,
        ref: chip.kind === "lesson" && cited ? cited.ref : null,
        module: chip.kind === "lesson" && cited ? cited.moduleLabel : null,
      };
      const tutorEntry = { role: "jarvis", text: result.text, chip, bank: savePayload };
      log.append(bankSaveNode(tutorEntry, savePayload));

      /* 6) El hilo: tema, extractos e historial para seguimientos. */
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
      session.tutorLog.push(tutorEntry);

      /* 7) «Practicar esto»: el puente de una vía al quiz (§3.5), con
         las reglas y topes del quiz de siempre. */
      if (chip.kind === "lesson" && cited) {
        const topic = QUIZ_TOPICS.find((item) => item.campaignId === cited.campaignId);
        if (topic) {
          const practice = actionButton("Practicar esto", () => startQuiz(topic));
          practice.classList.add("jarvis-tutor-practice");
          log.append(practice);
        }
      }

      /* 8) El consumo: SOLO el contador del Tutor, vía la ruta única.
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
    send.classList.add("jarvis-send-pill");
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
