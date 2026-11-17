/** ui.js — pantalla única de estado (Fase 1).
 *  Construye DOM con textContent (sin innerHTML con datos del usuario).
 */
import { XP_ORDER, XP_LABELS, fmt, pct } from "./format.js";

/* ----------------------------- helpers DOM ------------------------------ */

function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === "checked" || key === "disabled") node[key] = Boolean(value);
    else node.setAttribute(key, String(value));
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function notice(message, tone = "") {
  return h("p", { class: `notice ${tone}`.trim() }, message);
}

function card(...children) {
  return h("section", { class: "card" }, ...children);
}

function stat(label, value, tone = "") {
  return h(
    "div",
    { class: "stat" },
    h("span", { class: "label" }, label),
    h("span", { class: `value ${tone}`.trim() }, String(value))
  );
}

function confirmRow(id, text) {
  const checkbox = h("input", { type: "checkbox", id });
  const row = h(
    "label",
    { class: "confirm", for: id },
    checkbox,
    h("span", {}, text)
  );
  return { row, checkbox };
}

function reportCell(label, value, ok) {
  return h(
    "div",
    { class: "report-cell" },
    h("span", { class: "label" }, label),
    h("span", { class: ok ? "ok" : "bad" }, String(value))
  );
}

/* ------------------------------- renderers ------------------------------ */

export function setVersion(node, version) {
  node.textContent = `v${version}`;
}

export function renderEmpty(root, actions) {
  root.replaceChildren(
    h(
      "section",
      { class: "card hero" },
      h("h2", {}, "Tu progreso, intacto."),
      h(
        "p",
        { class: "muted" },
        "Importá el archivo que exportaste de ODEA 1. Se valida completo antes de activarse y queda guardado solo en este dispositivo."
      ),
      h(
        "div",
        { class: "btn-row" },
        h("button", { class: "btn primary", onclick: () => actions.pickFile() }, "Importar mi progreso de ODEA 1")
      )
    ),
    notice(
      "Nada se envía a ningún servidor. El juego todavía no está construido: esta fase solo verifica que el progreso llega entero."
    )
  );
}

export function renderActive(root, bundle, actions, flash) {
  root.replaceChildren(
    characterCard(bundle, flash, actions),
    notice(
      "Este save vive en localStorage bajo la clave odea2_bundle_v1. Exportá un respaldo antes de probar una reimportación."
    )
  );
}

/* ------------------------------- mochila --------------------------------- */

function resourcePill(resource) {
  return h(
    "div",
    { class: "resource" },
    h("span", { class: "resource-label" }, resource.label),
    h("strong", { class: "resource-value" }, fmt(resource.value)),
    resource.hint ? h("span", { class: "sheet-hint" }, resource.hint) : null
  );
}

function itemRow(item, { showPower = false } = {}) {
  const meta = [];
  if (item.slotLabel) meta.push(item.slotLabel);
  if (showPower && item.power != null) meta.push(`${fmt(item.power)} de poder`);
  if (item.precio != null || item.price != null) meta.push(`${fmt(item.precio ?? item.price)} monedas`);

  return h(
    "div",
    { class: "item-row" },
    h(
      "div",
      { class: "item-main" },
      h("span", { class: "item-name" }, item.nombre),
      meta.length ? h("span", { class: "sheet-hint" }, meta.join(" · ")) : null
    ),
    item.equipado
      ? h("span", { class: "item-flag is-on" }, "Equipado")
      : item.conocido === false
        ? h("span", { class: "item-flag" }, "Sin catálogo")
        : null
  );
}

function mochilaSection(title, rows, extra = null) {
  if (!rows.length) {
    return [
      h("h4", { class: "sheet-group" }, title),
      h("p", { class: "sheet-hint" }, "Sin elementos.")
    ];
  }
  return [h("h4", { class: "sheet-group" }, title), h("div", { class: "item-list" }, ...rows), extra].filter(
    Boolean
  );
}

/**
 * Pantalla «Mochila»: progreso + inventario, equipo, cosméticos y recursos.
 *
 * Todo es CONSULTA: comprar y equipar no están activos en esta fase, así que no
 * se ofrecen botones que aparenten hacerlo. `inventory` viene proyectado desde
 * `js/inventory.js`; acá no se calcula nada.
 */
export function renderMochila(root, bundle, inventory, flash) {
  const inv = inventory || {
    equipment: [],
    equipmentEquipped: [],
    equipmentStored: [],
    rewards: [],
    cosmetics: [],
    resources: [],
    readOnly: true
  };

  root.replaceChildren(
    characterCard(bundle, flash, null),
    card(
      h("h2", {}, "Recursos"),
      h("div", { class: "resources" }, ...inv.resources.map(resourcePill))
    ),
    card(
      h("h2", {}, "Equipo"),
      ...mochilaSection(
        `Equipado (${inv.equipmentEquipped.length})`,
        inv.equipmentEquipped.map((item) => itemRow(item, { showPower: true }))
      ),
      ...mochilaSection(
        `Guardado (${inv.equipmentStored.length})`,
        inv.equipmentStored.map((item) => itemRow(item, { showPower: true }))
      )
    ),
    card(
      h("h2", {}, "Cosméticos del Tesoro"),
      h(
        "p",
        { class: "muted small" },
        "Tienda aparte de la del núcleo: sus objetos y sus monedas no se mezclan."
      ),
      ...mochilaSection("Propios", inv.cosmetics.map((item) => itemRow(item)))
    ),
    card(
      h("h2", {}, "Recompensas desbloqueadas"),
      ...mochilaSection("Capa de recompensas", inv.rewards.map((item) => itemRow(item)))
    ),
    notice(
      "La Mochila es de consulta: comprar y equipar todavía no están activos. " +
        "El nivel, el XP y la racha se derivan del historial y no se editan a mano."
    )
  );
}

/** Pantalla «Menú»: respaldo, importación y datos de la aplicación. */
export function renderMenu(root, { version, actions } = {}) {
  root.replaceChildren(
    card(
      h("h2", {}, "Respaldo y datos"),
      h(
        "p",
        { class: "muted" },
        "Exportá una copia fuera del teléfono antes de cualquier cambio grande. Restaurar un respaldo reemplaza el save actual y guarda uno previo."
      ),
      h(
        "div",
        { class: "btn-row" },
        h("button", { class: "btn primary", onclick: () => actions.exportBackup() }, "Exportar respaldo"),
        h("button", { class: "btn ghost", onclick: () => actions.pickFile() }, "Restaurar o importar archivo")
      ),
      h("h3", {}, "Aplicación"),
      h(
        "p",
        { class: "muted small" },
        `Versión ${version} · progreso local · sin servidor`
      )
    ),
    notice("Nada se envía a ningún servidor. Las capturas y diagnósticos nunca incluyen tus datos personales.")
  );
}

/** Tarjeta compartida por «Personaje» y «Mi progreso». Sin acciones si `actions` es null. */
function characterCard(bundle, flash, actions) {
  const core = bundle.core || {};
  const identity = core.identity || {};
  const derived = core.derived || {};
  const coins = derived.coins || {};
  const breakdown = derived.xpBreakdown || {};
  const total = Number(derived.totalXP) || 0;
  const referenceDate = (bundle.migration && bundle.migration.referenceDate) || "—";

  const rows = XP_ORDER.map((key) =>
    h(
      "tr",
      {},
      h("td", {}, XP_LABELS[key] || key),
      h(
        "td",
        {},
        h("div", { class: "bar" }, h("span", { style: `width:${pct(breakdown[key], total).toFixed(1)}%` }))
      ),
      h("td", {}, fmt(breakdown[key]))
    )
  );

  return card(
      h(
        "div",
        { class: "player-head" },
        h("h2", { class: "player-name" }, identity.playerName || "Jugador"),
        h("span", { class: "badge" }, "● Save activo")
      ),
      h(
        "div",
        { class: "stats" },
        stat("Nivel", fmt(derived.campaignLevel), "pink"),
        stat("XP total", fmt(total), "cyan"),
        stat("Racha", `${fmt(identity.streak)} días`, "orange"),
        stat("Monedas", fmt(coins.balance), "")
      ),
      h("h3", {}, "Desglose de XP por componente"),
      h(
        "table",
        { class: "breakdown" },
        h(
          "thead",
          {},
          h("tr", {}, h("th", {}, "Componente"), h("th", {}, ""), h("th", {}, "XP"))
        ),
        h("tbody", {}, ...rows)
      ),
      h(
        "p",
        { class: "muted small", style: "margin-top:14px" },
        `Nivel ODEA ${fmt(derived.odeLevel)} · monedas ganadas ${fmt(coins.earned)} · ` +
          `gastadas ${fmt(coins.spent)} · fecha de referencia ${referenceDate}`
      ),
      flash ? notice(flash, "ok") : null,
      actions
        ? h(
            "div",
            { class: "btn-row" },
            h("button", { class: "btn primary", onclick: () => actions.exportBackup() }, "Exportar respaldo"),
            h("button", { class: "btn ghost", onclick: () => actions.pickFile() }, "Importar otro archivo")
          )
        : null
  );
}

export function renderQuarantine(root, bundle, actions) {
  const imp = bundle.import || {};
  const report = imp.report || {};
  const totals = report.totals || {};
  const totalXP = totals.totalXP || {};
  const spent = (totals.shop && totals.shop.spent) || {};
  const missing = report.missing || {};
  const failed = imp.failedChecks || [];

  const { row, checkbox } = confirmRow(
    "q-accept",
    "Entiendo que faltan datos y acepto activar esta importación igual. Aceptar no repara el hueco: queda registrado."
  );
  const acceptBtn = h(
    "button",
    { class: "btn primary", disabled: true, onclick: () => actions.acceptQuarantine() },
    "Aceptar y activar"
  );
  checkbox.addEventListener("change", () => {
    acceptBtn.disabled = !checkbox.checked;
  });

  root.replaceChildren(
    card(
      h("h2", {}, "Importación en cuarentena"),
      notice(
        "La estructura no está completa, pero los totales sí reconcilian. Nada se activó todavía: revisá el reporte y decidí.",
        "warn"
      ),
      h(
        "div",
        { class: "report-grid" },
        reportCell("XP total (guardado)", fmt(totalXP.stored), totalXP.ok),
        reportCell("XP total (recalculado)", fmt(totalXP.recomputed), totalXP.ok),
        reportCell("shop.spent (guardado)", fmt(spent.stored), spent.ok),
        reportCell("shop.spent (recalculado)", fmt(spent.recomputed), spent.ok)
      ),
      failed.length
        ? h(
            "div",
            {},
            h("h3", {}, "Checks fallidos"),
            h("ul", { class: "checks" }, ...failed.map((id) => h("li", {}, id)))
          )
        : null,
      missing.criticals && missing.criticals.length
        ? notice(`Faltan críticos: ${missing.criticals.join(", ")}.`, "danger")
        : null,
      row,
      h(
        "div",
        { class: "btn-row" },
        acceptBtn,
        h("button", { class: "btn danger", onclick: () => actions.rejectQuarantine() }, "Abortar importación")
      )
    ),
    notice("Si abortás, se descarta el preview. El backup del archivo original queda guardado.")
  );
}

export function renderAborted(root, report, actions) {
  const totals = (report && report.totals) || {};
  const totalXP = totals.totalXP || {};
  const spent = (totals.shop && totals.shop.spent) || {};
  const diffs = (totals.xpBreakdown && totals.xpBreakdown.diffs) || [];

  root.replaceChildren(
    card(
      h("h2", {}, "Importación abortada"),
      notice(
        "Los totales del archivo no coinciden con sus propias fuentes. No se escribió ningún save: tu progreso actual no se tocó.",
        "danger"
      ),
      h(
        "div",
        { class: "report-grid" },
        reportCell("XP total (archivo)", fmt(totalXP.stored), totalXP.ok),
        reportCell("XP total (recalculado)", fmt(totalXP.recomputed), totalXP.ok),
        reportCell("shop.spent (archivo)", fmt(spent.stored), spent.ok),
        reportCell("shop.spent (recalculado)", fmt(spent.recomputed), spent.ok)
      ),
      diffs.length
        ? h(
            "div",
            {},
            h("h3", {}, "Componentes que no cuadran"),
            h("ul", { class: "checks" }, ...diffs.map((id) => h("li", {}, id)))
          )
        : null,
      h(
        "div",
        { class: "btn-row" },
        h("button", { class: "btn primary", onclick: () => actions.pickFile() }, "Elegir otro archivo")
      )
    ),
    notice("El backup del archivo original quedó guardado por si lo necesitás auditar.")
  );
}

export function renderAlreadyImported(root, actions) {
  const { row, checkbox } = confirmRow(
    "reset-ack",
    "Entiendo que el reset respalda mi save actual y lo reemplaza por el archivo de ODEA 1."
  );
  const resetBtn = h(
    "button",
    { class: "btn danger", disabled: true, onclick: () => actions.resetReimport() },
    "Reset + reimportar"
  );
  checkbox.addEventListener("change", () => {
    resetBtn.disabled = !checkbox.checked;
  });

  root.replaceChildren(
    card(
      h("h2", {}, "Ya hay un save de ODEA 2"),
      notice(
        "Por seguridad, un segundo import de ODEA 1 se rechaza. Reimportar solo es posible con «reset + reimportar», que primero respalda el save actual.",
        "warn"
      ),
      row,
      h(
        "div",
        { class: "btn-row" },
        resetBtn,
        h("button", { class: "btn ghost", onclick: () => actions.cancel() }, "Cancelar")
      )
    )
  );
}

export function renderDuplicate(root, actions) {
  root.replaceChildren(
    card(
      h("h2", {}, "Ese bundle ya fue importado"),
      notice(
        "La huella del archivo coincide con la del save actual. Reimportarlo duplicaría créditos, así que se rechaza incluso con reset.",
        "danger"
      ),
      h("div", { class: "btn-row" }, h("button", { class: "btn primary", onclick: () => actions.cancel() }, "Entendido"))
    )
  );
}

export function renderRestorePrompt(root, bundle, actions) {
  const core = bundle.core || {};
  const identity = core.identity || {};
  const derived = core.derived || {};
  const referenceDate = (bundle.migration && bundle.migration.referenceDate) || "—";

  const { row, checkbox } = confirmRow(
    "restore-ack",
    "Entiendo que restaurar reemplaza mi save actual. Se guardará un backup automático del save que tengo ahora."
  );
  const restoreBtn = h(
    "button",
    { class: "btn primary", disabled: true, onclick: () => actions.restoreConfirm(bundle) },
    "Restaurar respaldo"
  );
  checkbox.addEventListener("change", () => {
    restoreBtn.disabled = !checkbox.checked;
  });

  root.replaceChildren(
    card(
      h("h2", {}, "Restaurar respaldo de ODEA 2"),
      notice(
        "Este archivo es un respaldo odea2_bundle_v1. Restaurar NO es re-migrar: no toca la huella del origen ni las reglas de reimportación.",
        "warn"
      ),
      h(
        "div",
        { class: "stats" },
        stat("Jugador", identity.playerName || "Jugador"),
        stat("Nivel", fmt(derived.campaignLevel), "pink"),
        stat("XP total", fmt(derived.totalXP), "cyan"),
        stat("Referencia", referenceDate, "")
      ),
      row,
      h(
        "div",
        { class: "btn-row" },
        restoreBtn,
        h("button", { class: "btn ghost", onclick: () => actions.cancel() }, "Cancelar")
      )
    )
  );
}

export function renderError(root, message, actions) {
  root.replaceChildren(
    card(
      h("h2", {}, "No se pudo completar"),
      notice(message, "danger"),
      h("div", { class: "btn-row" }, h("button", { class: "btn primary", onclick: () => actions.cancel() }, "Volver"))
    )
  );
}

export function renderFatal(root, message) {
  root.replaceChildren(
    card(h("h2", {}, "ODEA 2 no puede arrancar"), notice(message, "danger"))
  );
}
