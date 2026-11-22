/**
 * libreta-ui.js — la Libreta dentro del teléfono (v0.41.0).
 *
 * La libreta de espiral de Costa Neón: papel crema con renglones, línea
 * de margen rosada y espiral metálica a la izquierda, en el marco neón
 * rosado/turquesa del teléfono. Sirve para anotar lo que sea — ideas del
 * juego, pendientes, ocurrencias — sin salir de ODEA 2.
 *
 * Este módulo SOLO pinta y recoge toques: no lee ni escribe el guardado.
 * Toda escritura nace en app.js y pasa por applyGameplayMutationLocked
 * (mutaciones libreta.create / libreta.update / libreta.delete).
 */

function node(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined && text !== null) el.append(String(text));
  return el;
}

function fechaDe(ts) {
  const d = new Date(ts);
  if (!Number.isFinite(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("es-CR", { day: "numeric", month: "short", year: "numeric" }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

function backButton(actions) {
  const back = node("button", "libreta-back", "← Volver");
  back.type = "button";
  back.addEventListener("click", () => actions.onBack());
  return back;
}

function bookShell() {
  const book = node("div", "libreta-book");
  const spiral = node("div", "libreta-spiral");
  spiral.setAttribute("aria-hidden", "true");
  const page = node("div", "libreta-page");
  book.append(spiral, page);
  return { book, page };
}

function noteRow(note, actions) {
  const row = node("button", "libreta-note");
  row.type = "button";
  row.append(node("span", "libreta-note-title", note.displayTitle));
  if (note.excerpt && note.excerpt !== note.displayTitle) {
    row.append(node("span", "libreta-note-excerpt", note.excerpt));
  }
  const fecha = fechaDe(note.ts);
  if (fecha) row.append(node("span", "libreta-note-date", fecha));
  row.addEventListener("click", () => actions.onEdit(note.id));
  return row;
}

function renderList(page, notes, actions) {
  page.append(node("h3", "libreta-title", "Libreta"));
  page.append(node(
    "p", "libreta-sub",
    notes.length
      ? `${notes.length} ${notes.length === 1 ? "nota" : "notas"} · tu rincón en Costa Neón`
      : "Tu rincón en Costa Neón"
  ));

  const nueva = node("button", "libreta-btn is-primary", "✎ Nueva nota");
  nueva.type = "button";
  nueva.addEventListener("click", () => actions.onCompose());
  page.append(nueva);

  if (!notes.length) {
    const empty = node("div", "libreta-empty");
    empty.append(node("p", "libreta-empty-icon", "🌴"));
    empty.append(node("p", "libreta-empty-text", "Tu libreta está en blanco: escribí tu primera nota"));
    page.append(empty);
    return;
  }

  const list = node("div", "libreta-list");
  for (const note of notes) list.append(noteRow(note, actions));
  page.append(list);
}

function renderEditor(page, ui, notes, actions) {
  const editing = ui.mode === "edit" ? notes.find((note) => note.id === ui.noteId) || null : null;
  page.append(node("h3", "libreta-title", editing ? "Editar nota" : "Nueva nota"));

  const titulo = node("input", "libreta-input");
  titulo.type = "text";
  titulo.placeholder = "Título (si querés)";
  titulo.maxLength = 120;
  titulo.value = editing ? editing.titulo : "";
  page.append(titulo);

  const texto = node("textarea", "libreta-textarea");
  texto.placeholder = "Escribí lo que se te ocurra…";
  texto.maxLength = 5000;
  texto.rows = 9;
  texto.value = editing ? editing.texto : "";
  page.append(texto);

  const row = node("div", "libreta-actions");
  const guardar = node("button", "libreta-btn is-primary", editing ? "Guardar cambios" : "Guardar nota");
  guardar.type = "button";
  guardar.addEventListener("click", () => {
    actions.onSave({
      id: editing ? editing.id : null,
      titulo: titulo.value,
      texto: texto.value
    });
  });
  const cancelar = node("button", "libreta-btn is-ghost", "Cancelar");
  cancelar.type = "button";
  cancelar.addEventListener("click", () => actions.onCancel());
  row.append(guardar, cancelar);
  page.append(row);

  if (editing) {
    const borrar = node("button", "libreta-btn is-danger", "Borrar esta nota");
    borrar.type = "button";
    borrar.addEventListener("click", () => actions.onAskDelete(editing.id));
    page.append(borrar);
  }
}

function renderConfirm(page, ui, notes, actions) {
  const note = notes.find((entry) => entry.id === ui.noteId) || null;
  page.append(node("h3", "libreta-title", "¿Borrar esta nota?"));
  page.append(node(
    "p", "libreta-confirm-text",
    note ? `«${note.displayTitle}» se va de tu libreta para siempre.` : "Esta nota se va de tu libreta para siempre."
  ));
  const row = node("div", "libreta-actions");
  const si = node("button", "libreta-btn is-danger", "Sí, borrar");
  si.type = "button";
  si.addEventListener("click", () => actions.onDelete(ui.noteId));
  const no = node("button", "libreta-btn is-ghost", "Mejor no");
  no.type = "button";
  no.addEventListener("click", () => actions.onCancel());
  row.append(si, no);
  page.append(row);
}

/**
 * Pinta la Libreta en `root` (el contenedor de pantallas del teléfono).
 * `notes` viene de libretaView(bundle).notes; `ui` es el modo actual
 * ({ mode: "list" | "new" | "edit" | "confirm", noteId }).
 */
export function renderLibreta(root, { notes = [], ui = { mode: "list", noteId: null }, actions = {} } = {}) {
  root.replaceChildren();
  const shell = node("section", "libreta");
  const head = node("div", "libreta-head");
  head.append(backButton(actions));
  shell.append(head);

  const { book, page } = bookShell();
  if (ui.mode === "new" || ui.mode === "edit") renderEditor(page, ui, notes, actions);
  else if (ui.mode === "confirm") renderConfirm(page, ui, notes, actions);
  else renderList(page, notes, actions);
  shell.append(book);
  root.append(shell);
}
