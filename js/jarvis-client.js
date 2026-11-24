/**
 * jarvis-client.js — el único lugar que habla con el Worker de Jarvis.
 *
 * Protocolo REAL del Worker desplegado (verificado contra su código y
 * en vivo; difiere del borrador original del spec en la envoltura):
 *
 *   POST JSON PLANO { type, ...campos } →
 *     briefing → { type: "briefing", summary }
 *     chat     → { type: "chat", message, summary, history? }
 *     quiz     → { type: "quiz", topic, material: [{ title, brief, deliverable }] }
 *     feedback → { type: "feedback", missionTitle, deliverable, evidence }
 *
 *   Respuestas 200:
 *     briefing / chat / feedback → { type, text }
 *     quiz → { type: "quiz", topic, questions: [ { q, options[4], answer, why } × 5 ] }
 *   Errores: { error: "bad_request" | "limit" | "upstream" } con 400/429/502.
 *
 * Timeout de 20 s. Cualquier fallo devuelve { ok: false, error } y la
 * interfaz degrada con elegancia: Jarvis es un extra, nunca un candado.
 * El quiz se RE-VALIDA aquí (spec §4.3): si la forma no es exactamente
 * la esperada (5 preguntas, 4 opciones, answer 0–3), se descarta como
 * error y no paga XP. Las preguntas se normalizan a
 * { question, options, correctIndex, explanation } para la interfaz.
 */

import { JARVIS_WORKER_URL } from "./jarvis-config.js";

const TIMEOUT_MS = 20000;

export function jarvisConfigured() {
  return typeof JARVIS_WORKER_URL === "string" && JARVIS_WORKER_URL.trim().length > 0;
}

function validateQuestion(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const { q, options, answer, why } = raw;
  if (typeof q !== "string" || !q.trim()) return null;
  if (!Array.isArray(options) || options.length !== 4) return null;
  if (!options.every((option) => typeof option === "string" && Boolean(option.trim()))) return null;
  if (!Number.isInteger(answer) || answer < 0 || answer > 3) return null;
  if (typeof why !== "string") return null;
  return { question: q, options: [...options], correctIndex: answer, explanation: why };
}

function validateQuizSet(data) {
  if (!data || typeof data !== "object" || !Array.isArray(data.questions)) return null;
  if (data.questions.length !== 5) return null;
  const questions = data.questions.map(validateQuestion);
  if (questions.some((question) => question === null)) return null;
  return questions;
}

/**
 * v0.50.0 — la acción propuesta en el sobre de chat (Worker v4). Aquí se
 * valida SOLO la FORMA del sobre (nombre string, args objeto plano); la
 * validez de fondo (ids vivos, partición exacta, stale) es de
 * src/jarvis-actions.js contra el estado vivo. Una acción mal formada se
 * descarta en silencio y el chat sigue como texto, como con el Worker v3
 * (que nunca manda `action`: compatibilidad hacia atrás total).
 */
export function parseChatAction(data) {
  if (!data || typeof data !== "object") return null;
  const action = data.action;
  if (action == null) return null;
  if (typeof action !== "object" || Array.isArray(action)) return null;
  if (typeof action.name !== "string" || !action.name) return null;
  if (!action.args || typeof action.args !== "object" || Array.isArray(action.args)) return null;
  return { name: action.name, args: action.args };
}

/**
 * v0.51.0 — el sobre del Tutor (Worker v5): { type: "tutor", text,
 * grounded, ref }. Aquí se valida la FORMA y se RE-VERIFICA la cita
 * contra los extractos que el cliente envió (diseño maestro §6.1/§6.3):
 * el Worker ya degrada una cita inventada, pero la muralla final es
 * del cliente — si `grounded: true` trae un ref que NO está entre los
 * enviados, la respuesta se muestra como extra (grounded: false).
 * Función pura y exportada para tests, como parseChatAction.
 */
export function validateTutorAnswer(data, sentRefs) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  if (data.type !== "tutor") return null;
  const text = typeof data.text === "string" ? data.text.trim() : "";
  if (!text) return null;
  if (typeof data.grounded !== "boolean") return null;
  const refs = Array.isArray(sentRefs) ? sentRefs : [];
  let grounded = data.grounded;
  let ref = typeof data.ref === "string" ? data.ref : null;
  if (!grounded || !ref || !refs.includes(ref)) {
    grounded = false;
    ref = null;
  }
  return { text, grounded, ref };
}

export async function askJarvis(type, payload, { signal } = {}) {
  if (!jarvisConfigured()) return { ok: false, error: "not-configured" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const forwardAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", forwardAbort, { once: true });
  }

  try {
    const body = { type, ...(payload || {}) };
    /* v0.50.0: el contexto de acciones viaja también a nivel raíz para
       que el Worker (v4 o v5, indistinto) adjunte las tools SOLO cuando
       hay contexto. Con Worker v3 el campo extra se ignora: chat como hoy. */
    if (type === "chat" && body.summary && body.summary.accionesContext && !body.actionsContext) {
      body.actionsContext = body.summary.accionesContext;
    }
    const response = await fetch(JARVIS_WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, error: `http-${response.status}` };
    const data = await response.json().catch(() => null);
    if (!data || typeof data !== "object") return { ok: false, error: "bad-response" };

    if (type === "quiz") {
      const questions = validateQuizSet(data);
      if (!questions) return { ok: false, error: "invalid-quiz" };
      return { ok: true, questions };
    }
    if (type === "chat") {
      const action = parseChatAction(data);
      const text = typeof data.text === "string" ? data.text : "";
      /* Un tool_call válido puede venir SIN texto: el juego pinta su
         línea de plantilla. Texto vacío y sin acción sí es error. */
      if (!text.trim() && !action) return { ok: false, error: "empty-text" };
      return { ok: true, text, ...(action ? { action } : {}) };
    }
    if (type === "tutor") {
      const sentRefs = (Array.isArray(payload && payload.extracts) ? payload.extracts : [])
        .map((extract) => extract && extract.ref).filter((ref) => typeof ref === "string");
      const answer = validateTutorAnswer(data, sentRefs);
      if (!answer) return { ok: false, error: "invalid-tutor" };
      return { ok: true, ...answer };
    }
    if (typeof data.text !== "string" || !data.text.trim()) return { ok: false, error: "empty-text" };
    return { ok: true, text: data.text };
  } catch (error) {
    return { ok: false, error: error && error.name === "AbortError" ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", forwardAbort);
  }
}

/**
 * v0.51.0 — askTutor(payload, { signal }): la puerta del Tutor con las
 * razones del diseño maestro §6.3. `payload` = { question, summary,
 * extracts: [{ ref, label, text }], history }. Devuelve
 * { ok: true, text, grounded, ref } o { ok: false, reason } con
 * reason ∈ "offline" | "limit" | "bad" | "notutor":
 *  - "notutor": el Worker en vivo es v3/v4 y no conoce el tipo `tutor`
 *    (responde 400) — la vista lo dice en lenguaje de Jarvis, jamás
 *    como error técnico (§6.1.5 del diseño maestro).
 *  - "limit": 429 del Worker.  "offline": sin configurar/red/timeout.
 *  - "bad": 502 o sobre con forma inválida.
 * Sin tocar storage, como todo el cliente.
 */
export async function askTutor(payload, { signal } = {}) {
  const result = await askJarvis("tutor", payload, { signal });
  if (result.ok) return result;
  const reason =
    result.error === "http-400" ? "notutor"
    : result.error === "http-429" ? "limit"
    : result.error === "not-configured" || result.error === "network" || result.error === "timeout" ? "offline"
    : "bad";
  return { ok: false, reason };
}
