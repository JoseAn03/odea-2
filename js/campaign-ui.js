/**
 * Presentational campaign UI. Persistence, eligibility and rewards belong to
 * the caller. This module never writes to storage or changes a campaign view.
 */
const sessions = new WeakMap();
let instanceSequence = 0;

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

function safeLink(value) {
  if (!value) return null;
  try {
    const resolved = new URL(String(value), document.baseURI);
    return ["https:", "http:"].includes(resolved.protocol) ? resolved.href : null;
  } catch {
    return null;
  }
}

function artwork(view, brete) {
  // Relative assets also work when this source is hosted in a GitHub Pages subpath.
  const candidate = text(view.image);
  if (candidate && !candidate.startsWith("/") && !/^[a-z][a-z0-9+.-]*:/i.test(candidate)) {
    return candidate;
  }
  return `assets/slots/${brete ? "brete" : "gamer"}.webp`;
}

function redraw(root, state) {
  if (sessions.get(root) === state) paint(root, state);
}

function announce(state, message, kind = "success") {
  state.message = { text: message, kind };
}

function setPending(form, pending) {
  form.setAttribute("aria-busy", String(pending));
  form.querySelectorAll("button, input, textarea").forEach((control) => {
    control.disabled = pending;
  });
}

function statusMessage(message, kind = "info") {
  const element = node("p", `campaign-message campaign-message--${kind}`, message);
  element.setAttribute("role", kind === "error" ? "alert" : "status");
  element.setAttribute("aria-live", kind === "error" ? "assertive" : "polite");
  return element;
}

function rewards(mission) {
  const wrapper = node("span", "campaign-rewards");
  wrapper.append(
    node("span", "campaign-reward campaign-reward--xp", `+${format(mission.xp)} XP`),
    node("span", "campaign-reward campaign-reward--coin", `+${format(mission.coins)} monedas`)
  );
  return wrapper;
}

function moveToMission(root, state, missionId) {
  const chapters = state.options.view.chapters || [];
  const chapter = chapters.find((entry) => (entry.missions || []).some((mission) => mission.id === missionId));
  if (!chapter) return;
  state.chapter = text(chapter.id);
  state.open.add(text(missionId));
  root.dataset.campaignChapter = state.chapter;
  redraw(root, state);
  const destination = [...root.querySelectorAll("[data-campaign-mission]")]
    .find((entry) => entry.dataset.campaignMission === text(missionId));
  if (destination) {
    const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    destination.scrollIntoView?.({ behavior: reduced ? "auto" : "smooth", block: "nearest" });
    destination.querySelector("summary")?.focus({ preventScroll: true });
  }
}

function makeHero(root, state, view, brete) {
  const hero = node("header", "campaign-hero");
  const image = node("img", "campaign-hero-image");
  image.src = artwork(view, brete);
  image.alt = "";
  image.setAttribute("aria-hidden", "true");
  image.dataset.imageSlot = `campaign.${brete ? "brete" : "gamer"}`;
  image.decoding = "async";
  image.addEventListener("error", () => { image.hidden = true; }, { once: true });
  const top = node("div", "campaign-hero-top");
  const back = button("campaign-back", state.options.compact ? "← Volver" : "← Mapa", () => {
    state.options.onBack?.();
  });
  back.setAttribute("aria-label", state.options.compact ? "Volver al teléfono" : "Volver al mapa");
  const code = node("span", "campaign-code", brete ? "DISTRITO 01 / BRETE" : "DISTRITO 02 / GAMER");
  top.append(back, code);
  const content = node("div", "campaign-hero-content");
  const eyebrow = node("p", "campaign-eyebrow", "MODO CAMPAÑA · TU SIGUIENTE NIVEL");
  const title = node("h1", "campaign-title", text(view.name, brete ? "Conseguí brete" : "Subí de nivel"));
  title.id = `${state.prefix}-title`;
  const subtitle = node("p", "campaign-subtitle", view.subtitle);
  const goal = node("p", "campaign-goal", view.goal);
  content.append(eyebrow, title, subtitle);
  if (view.goal) content.append(goal);
  const bottom = node("div", "campaign-hero-bottom");
  bottom.append(
    node("span", "campaign-live-dot", "● CAMPAÑA PERSONAL"),
    node("span", "campaign-hero-caption", "PASO A PASO. A TU RITMO.")
  );
  hero.append(image, top, content, bottom);
  return hero;
}

function makeStats(view, state) {
  const section = node("section", "campaign-overview");
  section.setAttribute("aria-label", "Tu progreso en la campaña");
  const rank = node("div", "campaign-rank");
  const insignia = node("span", "campaign-rank-icon", "✦");
  insignia.setAttribute("aria-hidden", "true");
  const rankCopy = node("div", "campaign-rank-copy");
  rankCopy.append(node("span", "campaign-label", "RANGO ACTUAL"), node("strong", "", text(view.rank, "En ruta")));
  rank.append(insignia, rankCopy);
  const progression = node("div", "campaign-progression");
  const progressHead = node("div", "campaign-progress-head");
  const percent = Math.min(100, number(view.percent));
  progressHead.append(
    node("span", "campaign-label", "PROGRESO TOTAL"),
    node("strong", "campaign-percent", `${Math.round(percent)}%`)
  );
  const track = node("div", "campaign-progress-track");
  track.setAttribute("role", "progressbar");
  track.setAttribute("aria-label", "Campaña completada");
  track.setAttribute("aria-valuemin", "0");
  track.setAttribute("aria-valuemax", "100");
  track.setAttribute("aria-valuenow", String(percent));
  track.setAttribute("aria-valuetext", `${format(view.done)} de ${format(view.total)} misiones`);
  const fill = node("span", "campaign-progress-fill");
  fill.style.width = `${percent}%`;
  track.append(fill);
  progression.append(
    progressHead,
    track,
    node("span", "campaign-progress-caption", `${format(view.done)} / ${format(view.total)} misiones completadas`)
  );
  const signal = node("div", "campaign-signal");
  signal.append(node("span", "campaign-label", "ESTADO"), node("strong", "", percent >= 100 ? "Ruta completada" : "En movimiento"));
  section.append(rank, progression, signal);
  return section;
}

function makeNext(root, state, view) {
  const next = view.next;
  if (!next) {
    const finished = number(view.total) > 0 && number(view.done) >= number(view.total);
    const empty = node("section", "campaign-next campaign-next--quiet");
    empty.append(
      node("span", "campaign-next-icon", finished ? "✦" : "◇"),
      node("div", "campaign-next-copy")
    );
    empty.lastElementChild.append(
      node("p", "campaign-eyebrow", finished ? "MISIÓN CUMPLIDA" : "SIN MISIONES DISPONIBLES"),
      node("h2", "", finished ? "Esta ruta ya lleva tu firma." : "Tu próximo movimiento está en preparación."),
      node("p", "", finished ? "Podés volver a tus entregas y seguir practicando." : "Explorá los capítulos para ver sus requisitos.")
    );
    return empty;
  }
  const panel = node("section", "campaign-next");
  const icon = node("span", "campaign-next-icon", "↗");
  icon.setAttribute("aria-hidden", "true");
  const copy = node("div", "campaign-next-copy");
  copy.append(
    node("p", "campaign-eyebrow", "TU PRÓXIMO MOVIMIENTO"),
    node("h2", "", next.title),
    node("p", "", next.brief || "Una misión concreta para seguir avanzando.")
  );
  const action = button("campaign-button campaign-button--primary campaign-next-action", "Ir a la misión ↗", () => {
    moveToMission(root, state, next.id);
  });
  panel.append(icon, copy, action);
  return panel;
}

function makeEvidence(root, state, mission, completed) {
  const block = node("div", "campaign-evidence");
  if (completed) {
    block.append(node("p", "campaign-label", "TU ENTREGA REGISTRADA"));
    block.append(node("p", "campaign-proof", mission.evidence || state.saved.get(text(mission.id)) || "Misión completada. Tu avance quedó registrado."));
    return block;
  }
  if (!mission.unlocked) {
    block.append(node("p", "campaign-lock-note", "◇ Completá las misiones anteriores para desbloquear esta entrega."));
    return block;
  }
  const form = node("form", "campaign-evidence-form");
  const fieldId = `${state.prefix}-proof-${++state.fieldSequence}`;
  const hintId = `${fieldId}-hint`;
  const label = node("label", "campaign-field-label", "Evidencia de tu misión");
  label.htmlFor = fieldId;
  const hint = node("p", "campaign-field-hint", "Describí qué hiciste, el resultado o un enlace a tu entrega. Mínimo 12 caracteres.");
  hint.id = hintId;
  const input = node("textarea", "campaign-textarea");
  input.id = fieldId;
  input.name = "evidence";
  input.rows = 3;
  input.required = true;
  input.minLength = 12;
  input.maxLength = 2000;
  input.placeholder = "Lo que hice y lo que aprendí…";
  input.value = state.drafts.get(text(mission.id)) || "";
  input.setAttribute("aria-describedby", hintId);
  const footer = node("div", "campaign-form-footer");
  const count = node("span", "campaign-character-count", `${input.value.trim().length} / 12 mín.`);
  const submit = node("button", "campaign-button campaign-button--primary", "Completar misión ↗");
  submit.type = "submit";
  const pending = state.pending?.type === "mission" && state.pending.id === text(mission.id);
  submit.disabled = Boolean(state.pending) || input.value.trim().length < 12 || typeof state.options.onComplete !== "function";
  if (pending) submit.textContent = "Guardando entrega…";
  footer.append(count, submit);
  input.disabled = Boolean(state.pending);
  input.addEventListener("input", () => {
    state.drafts.set(text(mission.id), input.value);
    const length = input.value.trim().length;
    count.textContent = `${length} / 12 mín.`;
    submit.disabled = Boolean(state.pending) || length < 12 || typeof state.options.onComplete !== "function";
    input.setCustomValidity("");
  });
  form.append(label, hint, input, footer);
  if (pending) form.setAttribute("aria-busy", "true");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (state.pending || state.saved.has(text(mission.id)) || !mission.unlocked || mission.completed) return;
    const evidence = input.value.trim();
    if (evidence.length < 12) {
      input.setCustomValidity("Describí tu entrega con al menos 12 caracteres.");
      input.reportValidity();
      return;
    }
    if (typeof state.options.onComplete !== "function") return;
    state.pending = { type: "mission", id: text(mission.id) };
    state.message = null;
    setPending(form, true);
    submit.textContent = "Guardando entrega…";
    // Redraw all controls to lock every possible duplicate action, not only this form.
    redraw(root, state);
    try {
      const result = await state.options.onComplete(mission.id, evidence);
      if (!result?.ok) {
        announce(state, result?.message || "No pudimos guardar la entrega. Tu nota sigue acá; intentá de nuevo.", "error");
      } else {
        state.saved.set(text(mission.id), evidence);
        state.drafts.delete(text(mission.id));
        announce(state, result.message || "¡Misión registrada! Cada paso cuenta.");
      }
    } catch {
      announce(state, "No pudimos guardar la entrega. Revisá la conexión e intentá de nuevo; conservamos tu nota.", "error");
    } finally {
      state.pending = null;
      redraw(root, state);
    }
  });
  block.append(form);
  if (typeof state.options.onComplete !== "function") {
    block.append(statusMessage("La entrega no está disponible en esta vista.", "info"));
  }
  return block;
}

function makeMission(root, state, mission, index, nextId) {
  const completed = Boolean(mission.completed || state.saved.has(text(mission.id)));
  const next = text(mission.id) === text(nextId) && !completed;
  const locked = !mission.unlocked && !completed;
  const classes = [
    "campaign-mission",
    completed ? "campaign-mission--done" : "",
    locked ? "campaign-mission--locked" : "",
    next ? "campaign-mission--next" : ""
  ].filter(Boolean).join(" ");
  const detail = node("details", classes);
  detail.dataset.campaignMission = text(mission.id);
  detail.open = state.open.has(text(mission.id));
  detail.addEventListener("toggle", () => {
    if (detail.open) state.open.add(text(mission.id));
    else state.open.delete(text(mission.id));
  });
  const summary = node("summary", "campaign-mission-summary");
  const marker = node("span", "campaign-mission-number", completed ? "✓" : String(index + 1).padStart(2, "0"));
  marker.setAttribute("aria-hidden", "true");
  const copy = node("span", "campaign-mission-copy");
  const metadata = node("span", "campaign-mission-meta");
  metadata.append(
    node("span", "campaign-mission-state", completed ? "COMPLETADA" : locked ? "BLOQUEADA" : next ? "SIGUIENTE MISIÓN" : "DISPONIBLE"),
    node("span", "campaign-duration", `${format(mission.minutes)} min`)
  );
  copy.append(metadata, node("span", "campaign-mission-title", mission.title), rewards(mission));
  const chevron = node("span", "campaign-chevron", "+");
  chevron.setAttribute("aria-hidden", "true");
  summary.append(marker, copy, chevron);
  const body = node("div", "campaign-mission-body");
  if (mission.brief) body.append(node("p", "campaign-brief", mission.brief));
  if (Array.isArray(mission.steps) && mission.steps.length) {
    const steps = node("ol", "campaign-steps");
    mission.steps.forEach((step) => steps.append(node("li", "", step)));
    body.append(steps);
  }
  const requirements = node("div", "campaign-requirements");
  if (mission.deliverable) {
    const deliverable = node("div", "campaign-requirement");
    deliverable.append(node("span", "campaign-label", "LO QUE VAS A ENTREGAR"), node("p", "", mission.deliverable));
    requirements.append(deliverable);
  }
  if (mission.criterion) {
    const criterion = node("div", "campaign-requirement");
    criterion.append(node("span", "campaign-label", "CÓMO SABÉS QUE ESTÁ LISTO"), node("p", "", mission.criterion));
    requirements.append(criterion);
  }
  if (requirements.childElementCount) body.append(requirements);
  const resourceURL = safeLink(mission.resource?.url);
  if (resourceURL) {
    const resource = node("a", "campaign-resource", `${text(mission.resource.label, "Abrir recurso")} ↗`);
    resource.href = resourceURL;
    resource.target = "_blank";
    resource.rel = "noopener noreferrer";
    body.append(resource);
  }
  body.append(makeEvidence(root, state, mission, completed));
  detail.append(summary, body);
  return detail;
}

function makeChapters(root, state, view) {
  const chapters = Array.isArray(view.chapters) ? view.chapters : [];
  const workspace = node("section", "campaign-workspace");
  workspace.setAttribute("aria-label", "Capítulos y misiones");
  if (!chapters.length) {
    workspace.append(statusMessage("Todavía no hay capítulos en esta campaña. Volvé pronto para conocer tu ruta.", "info"));
    return workspace;
  }
  const heading = node("div", "campaign-section-heading");
  heading.append(node("h2", "", "Tu ruta"), node("span", "campaign-label", `${chapters.length} CAPÍTULOS / SIN ATAJOS`));
  const layout = node("div", "campaign-chapter-layout");
  const rail = node("nav", "campaign-chapter-rail");
  rail.setAttribute("aria-label", "Elegí un capítulo");
  const current = chapters.find((chapter) => text(chapter.id) === state.chapter) || chapters[0];
  state.chapter = text(current.id);
  root.dataset.campaignChapter = state.chapter;
  chapters.forEach((chapter, index) => {
    const missions = Array.isArray(chapter.missions) ? chapter.missions : [];
    const count = missions.filter((mission) => mission.completed || state.saved.has(text(mission.id))).length;
    const selected = text(chapter.id) === state.chapter;
    const item = button(`campaign-chapter${selected ? " campaign-chapter--selected" : ""}`, null, () => {
      state.chapter = text(chapter.id);
      root.dataset.campaignChapter = state.chapter;
      redraw(root, state);
      root.querySelector(".campaign-chapter-panel")?.focus({ preventScroll: true });
    });
    item.setAttribute("aria-current", selected ? "step" : "false");
    const indexLabel = node("span", "campaign-chapter-index", `${String(index + 1).padStart(2, "0")} / CAPÍTULO`);
    item.append(indexLabel, node("strong", "campaign-chapter-title", chapter.title));
    const progress = node("span", "campaign-chapter-count", `${count} / ${missions.length} misiones ${count === missions.length && missions.length ? "✓" : "↗"}`);
    item.append(progress);
    rail.append(item);
  });
  const panel = node("section", "campaign-chapter-panel");
  panel.tabIndex = -1;
  const panelHeading = node("div", "campaign-panel-heading");
  panelHeading.append(node("p", "campaign-eyebrow", "EXPEDIENTE DE MISIONES"), node("h3", "", current.title));
  if (current.subtitle) panelHeading.append(node("p", "campaign-panel-subtitle", current.subtitle));
  panel.append(panelHeading);
  const missions = Array.isArray(current.missions) ? current.missions : [];
  if (!missions.length) panel.append(statusMessage("Este capítulo todavía no tiene misiones publicadas.", "info"));
  missions.forEach((mission, index) => panel.append(makeMission(root, state, mission, index, view.next?.id)));
  layout.append(rail, panel);
  workspace.append(heading, layout);
  return workspace;
}

function applicationField(state, name, labelText, multiline = false) {
  const wrapper = node("div", `campaign-field campaign-field--${name}`);
  const id = `${state.prefix}-application-${name}`;
  const label = node("label", "campaign-field-label", `${labelText} (opcional)`);
  label.htmlFor = id;
  const input = node(multiline ? "textarea" : "input", multiline ? "campaign-textarea" : "campaign-input");
  input.id = id;
  input.name = name;
  input.maxLength = multiline ? 1000 : 120;
  if (multiline) input.rows = 2;
  else input.type = "text";
  input.value = state.applicationDraft[name] || "";
  input.autocomplete = "off";
  input.disabled = Boolean(state.pending);
  input.placeholder = { company: "¿A dónde aplicaste?", role: "¿Para qué puesto?", note: "Un detalle que te sirva recordar…" }[name];
  input.addEventListener("input", () => { state.applicationDraft[name] = input.value; });
  wrapper.append(label, input);
  return wrapper;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-CR", { day: "numeric", month: "short" }).format(date);
}

function makeApplications(root, state, view) {
  const data = view.applications || {};
  const section = node("section", "campaign-applications");
  section.setAttribute("aria-label", "Registro de postulaciones enviadas");
  const pitch = node("div", "campaign-application-pitch");
  const kicker = node("p", "campaign-eyebrow", "BONUS REPETIBLE / BRETE");
  const title = node("h2", "", "Apuntá. Aplicá.");
  title.append(node("em", "", " Registrá."));
  const description = node("p", "campaign-application-disclaimer", "Registrá una postulación que ya enviaste. No envía solicitudes.");
  const target = node("div", `campaign-target${state.hit ? " campaign-target--hit" : ""}`);
  target.setAttribute("aria-hidden", "true");
  target.append(node("span", "campaign-target-ring"), node("span", "campaign-target-core", "↗"), node("span", "campaign-target-tag", "ENFOQUE / ACCIÓN"));
  const burst = node("span", "campaign-reward-burst", "+25 XP · +2 monedas");
  target.append(burst);
  const totals = node("div", "campaign-application-totals");
  totals.append(
    node("strong", "", format(data.count)),
    node("span", "", "postulaciones registradas"),
    node("small", "", `${format(data.totalXP)} XP · ${format(data.totalCoins)} monedas ficticias`)
  );
  pitch.append(kicker, title, description, target, totals);
  const activity = node("div", "campaign-application-activity");
  const form = node("form", "campaign-application-form");
  const fields = node("div", "campaign-application-fields");
  fields.append(
    applicationField(state, "company", "Empresa"),
    applicationField(state, "role", "Puesto"),
    applicationField(state, "note", "Nota", true)
  );
  const submit = node("button", "campaign-button campaign-button--coral", "Disparar postulación · +25 XP · +2 monedas");
  submit.type = "submit";
  submit.disabled = Boolean(state.pending) || typeof state.options.onApply !== "function";
  if (state.pending?.type === "application") {
    submit.textContent = "Registrando postulación…";
    form.setAttribute("aria-busy", "true");
  }
  form.append(fields, submit, node("p", "campaign-application-footnote", "Sin límite diario. Cada clic registra una postulación ya enviada por vos."));
  if (state.applicationMessage) {
    form.append(statusMessage(state.applicationMessage.text, state.applicationMessage.kind));
  } else {
    const live = node("p", "campaign-application-live");
    live.setAttribute("aria-live", "polite");
    live.setAttribute("role", "status");
    form.append(live);
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (state.pending || typeof state.options.onApply !== "function") return;
    const payload = {
      company: text(state.applicationDraft.company).trim(),
      role: text(state.applicationDraft.role).trim(),
      note: text(state.applicationDraft.note).trim()
    };
    state.pending = { type: "application" };
    state.applicationMessage = null;
    state.hit = false;
    setPending(form, true);
    redraw(root, state);
    try {
      // No reward quantities are accepted from the UI.
      const result = await state.options.onApply(payload);
      if (!result?.ok) {
        state.applicationMessage = { kind: "error", text: result?.message || "No pudimos registrar la postulación. Conservamos tus datos para reintentar." };
      } else {
        state.applicationDraft = { company: "", role: "", note: "" };
        state.applicationMessage = { kind: "success", text: "¡En el blanco! Postulación registrada: +25 XP · +2 monedas ficticias." };
        state.hit = true;
        clearTimeout(state.hitTimer);
        state.hitTimer = setTimeout(() => {
          state.hit = false;
          // Remove animation without rebuilding or disturbing another form's focus.
          if (sessions.get(root) === state) root.querySelector(".campaign-target")?.classList.remove("campaign-target--hit");
        }, 1900);
      }
    } catch {
      state.applicationMessage = { kind: "error", text: "No pudimos registrar la postulación. Revisá tu conexión e intentá de nuevo." };
    } finally {
      state.pending = null;
      redraw(root, state);
    }
  });
  activity.append(form);
  const recent = Array.isArray(data.recent) ? data.recent.slice(0, 5) : [];
  const history = node("div", "campaign-history");
  history.append(node("h3", "", "Últimos movimientos"));
  if (!recent.length) {
    history.append(node("p", "campaign-history-empty", "Tu primera postulación registrada aparecerá acá. Un paso real, una marca en el mapa."));
  } else {
    const list = node("ul", "campaign-history-list");
    recent.forEach((entry) => {
      const item = node("li", "campaign-history-item");
      const copy = node("div", "campaign-history-copy");
      copy.append(node("strong", "", entry.company || "Postulación registrada"));
      if (entry.role) copy.append(node("span", "", entry.role));
      if (entry.note) copy.append(node("p", "", entry.note));
      const date = node("span", "campaign-history-date", formatDate(entry.date || entry.at));
      item.append(node("span", "campaign-history-check", "↗"), copy, date);
      list.append(item);
    });
    history.append(list);
  }
  activity.append(history);
  section.append(pitch, activity);
  return section;
}

function paint(root, state) {
  const { view, compact } = state.options;
  state.fieldSequence = 0;
  const shell = node("div", `campaign-shell${compact ? " campaign-shell--compact" : ""}`);
  if (!view || view.loading) {
    shell.append(statusMessage("Cargando tu campaña…", "loading"));
    root.replaceChildren(shell);
    return;
  }
  if (view.error) {
    shell.append(
      button("campaign-back", "← Volver", () => state.options.onBack?.()),
      statusMessage(text(view.error, "No pudimos cargar la campaña. Volvé a abrirla para reintentar."), "error")
    );
    root.replaceChildren(shell);
    return;
  }
  const brete = text(view.id).toLowerCase().includes("brete");
  let accent = brete ? "#77ead2" : "#ff85d1";
  if (view.accent && typeof CSS !== "undefined" && CSS.supports?.("color", view.accent)) accent = view.accent;
  shell.style.setProperty("--campaign-accent", accent);
  shell.setAttribute("aria-labelledby", `${state.prefix}-title`);
  shell.append(makeHero(root, state, view, brete));
  const interior = node("div", "campaign-interior");
  interior.append(makeStats(view, state));
  if (state.message) interior.append(statusMessage(state.message.text, state.message.kind));
  interior.append(makeNext(root, state, view));
  if (brete) interior.append(makeApplications(root, state, view));
  interior.append(makeChapters(root, state, view));
  const footer = node("footer", "campaign-footer");
  footer.append(
    node("span", "campaign-footer-mark", "✦ HECHO PARA AVANZAR"),
    node("p", "", "XP y monedas son recompensas ficticias del juego: no representan ingresos reales."),
    node("p", "", "Las misiones de IA son actividades educativas. Esta pantalla no conecta una IA en vivo.")
  );
  interior.append(footer);
  shell.append(interior);
  const previousScroll = root.scrollTop;
  const focused = document.activeElement;
  const focusedId = root.contains(focused) ? focused?.id : null;
  const selectionStart = focusedId ? focused.selectionStart : null;
  const selectionEnd = focusedId ? focused.selectionEnd : null;
  root.replaceChildren(shell);
  root.scrollTop = previousScroll;
  if (focusedId) {
    const replacement = document.getElementById(focusedId);
    if (replacement && root.contains(replacement) && !replacement.disabled) {
      replacement.focus({ preventScroll: true });
      if (typeof replacement.setSelectionRange === "function" && selectionStart != null) {
        replacement.setSelectionRange(selectionStart, selectionEnd);
      }
    }
  }
}

/**
 * @param {HTMLElement} root Mount point; can be used inside a dialog or a phone.
 * @param {object} options
 * @param {object|null} options.view Authoritative campaign view and unlock states.
 * @param {function} options.onComplete async (missionId, evidence) => {ok, message?}
 * @param {function} options.onApply async ({company, role, note}) => {ok, message?}
 * @param {function} options.onBack Navigation callback.
 * @param {boolean} [options.compact=false] Narrow embedded phone presentation.
 * @returns {HTMLElement} The mount point.
 */
export function renderCampaign(root, { view, onComplete, onApply, onBack, compact = false } = {}) {
  if (!root || typeof root.replaceChildren !== "function") {
    throw new TypeError("renderCampaign necesita un elemento raíz del DOM.");
  }
  const id = text(view?.id, "loading");
  let state = sessions.get(root);
  if (!state || (state.id !== id && id !== "loading")) {
    if (state) clearTimeout(state.hitTimer);
    const remembered = root.dataset.campaignId === id ? root.dataset.campaignChapter : "";
    const nextChapter = (view?.chapters || []).find((chapter) => (chapter.missions || []).some((mission) => mission.id === view?.next?.id));
    state = {
      id,
      prefix: `campaign-${++instanceSequence}`,
      chapter: remembered || text(nextChapter?.id || view?.chapters?.[0]?.id),
      open: new Set(view?.next?.id != null ? [text(view.next.id)] : []),
      saved: new Map(),
      drafts: new Map(),
      applicationDraft: { company: "", role: "", note: "" },
      pending: null,
      message: null,
      applicationMessage: null,
      hit: false,
      hitTimer: null,
      fieldSequence: 0,
      options: null
    };
    sessions.set(root, state);
  }
  state.id = id;
  state.options = { view, onComplete, onApply, onBack, compact };
  // The save is authoritative, including after importing/restoring an older backup.
  state.saved.clear();
  root.dataset.campaignId = id;
  paint(root, state);
  return root;
}

/* ====================== Misiones Diarias (v0.19.0) =======================
   La ruta del día con EL MISMO sistema visual de las campañas — pedido de
   José: que se vea «igual, igual, igual» a El Brete y Zona Gamer —
   ajustado a la esencia diaria de ODEA 1: sin capítulos secuenciales ni
   evidencia escrita obligatoria; la verificación se muestra como criterio
   («cómo sabés que está listo») y completar es un toque, como siempre. */

const dailySessions = new WeakMap();
let dailyInstanceSequence = 0;

function announceDaily(state, message, kind = "success") {
  state.message = message ? { text: message, kind } : null;
}

function redrawDaily(root, state) {
  paintDaily(root, state);
}

function moveDailyMission(root, state, missionId) {
  state.open.add(text(missionId));
  redrawDaily(root, state);
  const destination = [...root.querySelectorAll("[data-campaign-mission]")]
    .find((entry) => entry.dataset.campaignMission === text(missionId));
  if (destination) {
    const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    destination.scrollIntoView?.({ behavior: reduced ? "auto" : "smooth", block: "nearest" });
    destination.querySelector("summary")?.focus({ preventScroll: true });
  }
}

function makeDailyHero(state, view) {
  const hero = node("header", "campaign-hero");
  const image = node("img", "campaign-hero-image");
  image.src = "assets/slots/diarias.webp";
  image.alt = "";
  image.setAttribute("aria-hidden", "true");
  image.dataset.imageSlot = "daily.diarias";
  image.decoding = "async";
  image.addEventListener("error", () => { image.hidden = true; }, { once: true });
  const top = node("div", "campaign-hero-top");
  const back = button("campaign-back", state.options.compact ? "← Volver" : "← Mapa", () => {
    state.options.onBack?.();
  });
  back.setAttribute("aria-label", state.options.compact ? "Volver al teléfono" : "Volver al mapa");
  top.append(back, node("span", "campaign-code", "HUB / RUTA DEL DÍA"));
  const content = node("div", "campaign-hero-content");
  const title = node("h1", "campaign-title", "Misiones Diarias");
  title.id = `${state.prefix}-title`;
  content.append(
    node("p", "campaign-eyebrow", "MODO CAMPAÑA · TU RITMO DIARIO"),
    title,
    node("p", "campaign-subtitle", `Día ${format(view.day)} de ${format(56)} · tu plan personal, como en ODEA 1`),
    node("p", "campaign-goal", "Tres misiones. Un día a la vez.")
  );
  const bottom = node("div", "campaign-hero-bottom");
  bottom.append(
    node("span", "campaign-live-dot", "● RUTA DE HOY"),
    node("span", "campaign-hero-caption", "PASO A PASO. A TU RITMO.")
  );
  hero.append(image, top, content, bottom);
  return hero;
}

function makeDailyNext(root, state, view) {
  const next = view.next;
  if (!next) {
    const finished = number(view.total) > 0 && number(view.done) >= number(view.total);
    const empty = node("section", "campaign-next campaign-next--quiet");
    empty.append(
      node("span", "campaign-next-icon", finished ? "✦" : "◇"),
      node("div", "campaign-next-copy")
    );
    empty.lastElementChild.append(
      node("p", "campaign-eyebrow", finished ? "MISIÓN CUMPLIDA" : "SIN MISIONES DISPONIBLES"),
      node("h2", "", finished ? "Esta ruta ya lleva tu firma." : "Tu próximo movimiento está en preparación."),
      node("p", "", finished ? "Día cerrado: mañana amanece la siguiente ruta." : "Volvé mañana por la ruta del nuevo día.")
    );
    return empty;
  }
  const panel = node("section", "campaign-next");
  const icon = node("span", "campaign-next-icon", "↗");
  icon.setAttribute("aria-hidden", "true");
  const copy = node("div", "campaign-next-copy");
  copy.append(
    node("p", "campaign-eyebrow", "TU PRÓXIMO MOVIMIENTO"),
    node("h2", "", next.title),
    node("p", "", next.brief || "Una misión concreta para seguir avanzando.")
  );
  const action = button("campaign-button campaign-button--primary campaign-next-action", "Ir a la misión ↗", () => {
    moveDailyMission(root, state, next.id);
  });
  panel.append(icon, copy, action);
  return panel;
}

function makeDailyComplete(root, state, mission, completed) {
  const block = node("div", "campaign-evidence");
  if (completed) {
    block.append(node("p", "campaign-label", "TU ENTREGA REGISTRADA"));
    block.append(node("p", "campaign-proof", "Misión completada. Tu avance quedó registrado."));
    return block;
  }
  const footer = node("div", "campaign-form-footer");
  const note = node("span", "campaign-character-count", "Se registra al momento, como en ODEA 1.");
  const pending = state.pending?.type === "mission" && state.pending.id === text(mission.id);
  const submit = button(
    "campaign-button campaign-button--primary",
    pending ? "Registrando…" : "Completar misión ↗",
    async () => {
      if (state.pending || state.saved.has(text(mission.id))) return;
      if (typeof state.options.onComplete !== "function") return;
      state.pending = { type: "mission", id: text(mission.id) };
      state.message = null;
      redrawDaily(root, state);
      try {
        const result = await state.options.onComplete(mission.id);
        if (!result?.ok) {
          announceDaily(state, result?.message || "No pudimos registrar la misión. Intentá de nuevo.", "error");
        } else {
          state.saved.add(text(mission.id));
          announceDaily(state, result.message || "¡Misión registrada! Cada paso cuenta.");
        }
      } catch {
        announceDaily(state, "No pudimos registrar la misión. Revisá la conexión e intentá de nuevo.", "error");
      } finally {
        state.pending = null;
        redrawDaily(root, state);
      }
    }
  );
  submit.disabled = Boolean(state.pending) || typeof state.options.onComplete !== "function";
  footer.append(note, submit);
  block.append(footer);
  if (typeof state.options.onComplete !== "function") {
    block.append(statusMessage("El registro no está disponible en esta vista.", "info"));
  }
  return block;
}

function makeDailyMission(root, state, mission, index, nextId) {
  const completed = Boolean(mission.completed || state.saved.has(text(mission.id)));
  const next = text(mission.id) === text(nextId) && !completed;
  const classes = [
    "campaign-mission",
    completed ? "campaign-mission--done" : "",
    next ? "campaign-mission--next" : ""
  ].filter(Boolean).join(" ");
  const detail = node("details", classes);
  detail.dataset.campaignMission = text(mission.id);
  detail.open = state.open.has(text(mission.id));
  detail.addEventListener("toggle", () => {
    if (detail.open) state.open.add(text(mission.id));
    else state.open.delete(text(mission.id));
  });
  const summary = node("summary", "campaign-mission-summary");
  const marker = node("span", "campaign-mission-number", completed ? "✓" : String(index + 1).padStart(2, "0"));
  marker.setAttribute("aria-hidden", "true");
  const copy = node("span", "campaign-mission-copy");
  const metadata = node("span", "campaign-mission-meta");
  metadata.append(
    node("span", "campaign-mission-state", completed ? "COMPLETADA" : next ? "SIGUIENTE MISIÓN" : "DISPONIBLE"),
    node("span", "campaign-duration", `${format(mission.time || 0)} min`)
  );
  copy.append(metadata, node("span", "campaign-mission-title", mission.title), rewards({ xp: mission.xp, coins: 1 }));
  const chevron = node("span", "campaign-chevron", "+");
  chevron.setAttribute("aria-hidden", "true");
  summary.append(marker, copy, chevron);
  const body = node("div", "campaign-mission-body");
  if (mission.description) body.append(node("p", "campaign-brief", mission.description));
  if (mission.verification) {
    const requirements = node("div", "campaign-requirements");
    const criterion = node("div", "campaign-requirement");
    criterion.append(node("span", "campaign-label", "CÓMO SABÉS QUE ESTÁ LISTO"), node("p", "", mission.verification));
    requirements.append(criterion);
    body.append(requirements);
  }
  body.append(makeDailyComplete(root, state, mission, completed));
  detail.append(summary, body);
  return detail;
}

function paintDaily(root, state) {
  const { view, compact } = state.options;
  const shell = node("div", `campaign-shell${compact ? " campaign-shell--compact" : ""}`);
  let accent = "#ffb35c";
  if (view.accent && typeof CSS !== "undefined" && CSS.supports?.("color", view.accent)) accent = view.accent;
  shell.style.setProperty("--campaign-accent", accent);
  shell.setAttribute("aria-labelledby", `${state.prefix}-title`);
  shell.append(makeDailyHero(state, view));
  const interior = node("div", "campaign-interior");
  interior.append(makeStats({
    rank: `Día ${format(view.day)} de 56`,
    percent: number(view.total) ? (number(view.done) / number(view.total)) * 100 : 0,
    done: view.done,
    total: view.total
  }, state));
  if (state.message) interior.append(statusMessage(state.message.text, state.message.kind));
  interior.append(makeDailyNext(root, state, view));
  const workspace = node("section", "campaign-workspace");
  workspace.setAttribute("aria-label", "Misiones de hoy");
  const heading = node("div", "campaign-section-heading");
  heading.append(node("h2", "", "Tu ruta"), node("span", "campaign-label", `${format(view.total)} MISIONES / SIN ATAJOS`));
  const layout = node("div", "campaign-chapter-layout");
  const rail = node("nav", "campaign-chapter-rail");
  rail.setAttribute("aria-label", "Ruta del día");
  const chapterBtn = button("campaign-chapter campaign-chapter--selected", null, () => {});
  chapterBtn.setAttribute("aria-current", "step");
  chapterBtn.append(
    node("span", "campaign-chapter-index", "01 / RUTA"),
    node("strong", "campaign-chapter-title", `Día ${format(view.day)}`),
    node("span", "campaign-chapter-count", `${format(view.done)} / ${format(view.total)} misiones ${number(view.total) && number(view.done) >= number(view.total) ? "✓" : "↗"}`)
  );
  rail.append(chapterBtn);
  const panel = node("section", "campaign-chapter-panel");
  panel.tabIndex = -1;
  const panelHeading = node("div", "campaign-panel-heading");
  panelHeading.append(node("p", "campaign-eyebrow", "EXPEDIENTE DE MISIONES"), node("h3", "", "Ruta de hoy"));
  panelHeading.append(node("p", "campaign-panel-subtitle", "Las misiones de tu día, en el orden de tu plan."));
  panel.append(panelHeading);
  const missions = Array.isArray(view.missions) ? view.missions : [];
  if (!missions.length) panel.append(statusMessage("Hoy no hay misiones en la ruta.", "info"));
  missions.forEach((mission, index) => panel.append(makeDailyMission(root, state, mission, index, view.next?.id)));
  layout.append(rail, panel);
  workspace.append(heading, layout);
  interior.append(workspace);
  const footer = node("footer", "campaign-footer");
  footer.append(
    node("span", "campaign-footer-mark", "✦ HECHO PARA AVANZAR"),
    node("p", "", "XP y monedas son recompensas ficticias del juego: no representan ingresos reales.")
  );
  interior.append(footer);
  shell.append(interior);
  const previousScroll = root.scrollTop;
  root.replaceChildren(shell);
  root.scrollTop = previousScroll;
}

/**
 * La ruta diaria con el sistema de campañas.
 * @param {HTMLElement} root Mount point (teléfono o diálogo).
 * @param {object} options
 * @param {object} options.view { day, missions, done, total, next? } — la ruta
 *   del día ya derivada (routeForDay); `next` se calcula si no viene.
 * @param {function} options.onComplete async (missionId) => {ok, message?}
 * @param {function} options.onBack Navigation callback.
 * @param {boolean} [options.compact=false]
 */
export function renderDaily(root, { view, onComplete, onBack, compact = false } = {}) {
  if (!root || typeof root.replaceChildren !== "function") {
    throw new TypeError("renderDaily necesita un elemento raíz del DOM.");
  }
  let state = dailySessions.get(root);
  if (!state) {
    state = {
      prefix: `daily-${++dailyInstanceSequence}`,
      open: new Set(),
      saved: new Set(),
      pending: null,
      message: null,
      options: null
    };
    dailySessions.set(root, state);
  }
  const missions = Array.isArray(view?.missions) ? view.missions : [];
  const done = missions.filter((mission) => mission.completed || state.saved.has(text(mission.id))).length;
  const next = missions.find((mission) => !mission.completed && !state.saved.has(text(mission.id))) || null;
  state.options = {
    view: {
      ...view,
      missions,
      done,
      total: missions.length,
      next: next ? { id: next.id, title: next.title, brief: next.description } : null
    },
    onComplete,
    onBack,
    compact
  };
  if (next && !state.open.size) state.open.add(text(next.id));
  paintDaily(root, state);
  return root;
}
