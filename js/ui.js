/** ui.js — pantalla única de estado (Fase 1).
 *  Construye DOM con textContent (sin innerHTML con datos del usuario).
 */
import { XP_ORDER, XP_LABELS, fmt, pct } from "./format.js";
import { tiendaState, shopItem } from "../src/shop.js";

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
  const newName = h("input", { id: "new-player-name", type: "text", maxlength: "60", placeholder: "Tu nombre en Costa Neón", class: "campaign-input" });
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
    h("section", { class: "card" },
      h("h2", {}, "Tu primera partida"),
      h("p", { class: "muted" }, "Si no tenés un progreso anterior, empezá en cero. Las dos campañas se guardan en este dispositivo."),
      h("label", { for: "new-player-name" }, "Nombre del jugador (opcional)"),
      newName,
      h("button", { class: "btn primary", type: "button", onclick: () => actions.startFresh && actions.startFresh(newName.value) }, "Empezar desde cero")
    ),
    notice(
      "Tu progreso y tus notas se guardan sólo en este navegador. Exportá un respaldo desde Menú para conservarlos o cambiar de dispositivo."
    )
  );
}

export function renderActive(root, bundle, actions, flash) {
  root.replaceChildren(
    characterCard(bundle, flash, actions),
    notice(
      "Este save vive en el almacenamiento del navegador. Exportá un respaldo antes de probar una reimportación."
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
      "Tus ₡ ODEA son progreso virtual, no dinero real. Podés gastarlos en la Tienda del Mercado (también está en el teléfono). " +
        "El nivel, el XP y la racha se derivan del historial y no se editan a mano."
    )
  );
}

/* --------------------------------- hoy ------------------------------------ */

function missionStateFlag(mission) {
  return mission.completed
    ? h("span", { class: "item-flag is-on" }, "Hecha")
    : h("span", { class: "item-flag" }, "Pendiente");
}

function todayMissionRow(mission, actions) {
  return h(
    "div",
    { class: "today-mission" },
    h(
      "div",
      { class: "item-main" },
      h("span", { class: "item-name" }, mission.id),
      h(
        "span",
        { class: "sheet-hint" },
        `${fmt(mission.xp)} XP · ${mission.districtName}`
      )
    ),
    h(
      "div",
      { class: "today-actions" },
      missionStateFlag(mission),
      mission.completed
        ? null
        : h(
            "button",
            {
              class: "btn primary today-btn",
              type: "button",
              onclick: () => actions.completeMission && actions.completeMission(mission.id, "hub")
            },
            "Completar"
          ),
      h(
        "button",
        {
          class: "btn ghost today-btn",
          type: "button",
          "aria-label": `Ver ${mission.id} en ${mission.districtName}`,
          onclick: () => actions.goToDistrict && actions.goToDistrict(mission.districtId)
        },
        "Ver en el mapa"
      )
    )
  );
}

/**
 * Pantalla «Hoy»: el centro de control.
 *
 * Consume la MISMA proyección del HUD y la MISMA ruta diaria del Hub; no hay
 * segundo catálogo ni cálculo paralelo. La recompensa se reconoce al completar:
 * acá no se ofrece ningún botón de «reclamar».
 */
export function renderToday(root, today, actions) {
  const { hud, route, checkin } = today;
  const xpText = hud.xp.atMax
    ? `${fmt(hud.totalXP)} XP · nivel máximo`
    : `${fmt(hud.xp.current)} / ${fmt(hud.xp.next)} XP`;

  const progress = route.total
    ? h(
        "div",
        { class: "today-progress" },
        h("span", { class: "today-progress-text" }, `${route.done} de ${route.total} completadas`),
        h(
          "div",
          {
            class: "hud-bar",
            role: "progressbar",
            "aria-label": "Progreso de la ruta del día",
            "aria-valuemin": "0",
            "aria-valuemax": String(route.total),
            "aria-valuenow": String(route.done)
          },
          h("span", { style: `width:${Math.round((route.done / route.total) * 100)}%` })
        )
      )
    : null;

  const rows = route.missions.length
    ? route.missions.map((mission) => todayMissionRow(mission, actions))
    : [h("p", { class: "sheet-hint" }, "No hay misiones en la ruta de hoy.")];

  root.replaceChildren(
    card(
      h("h2", {}, `Hoy · día ${route.catalogDay}`),
      h("p", { class: "muted small" }, `Ruta del día · ${route.date}`),
      h(
        "div",
        { class: "stats" },
        stat("Nivel", fmt(hud.level), "pink"),
        stat("XP global", xpText, "cyan"),
        stat("Saldo ODEA", `₡${fmt(hud.coins.balance)}`, "orange"),
        stat("Racha", `${fmt(hud.streak)} días`, "")
      ),
      progress,
      h("div", { class: "item-list today-list" }, ...rows)
    ),
    card(
      h("h2", {}, "Cierre del día"),
      h(
        "div",
        { class: "item-row" },
        h(
          "div",
          { class: "item-main" },
          h("span", { class: "item-name" }, "Registrar el día"),
          h("span", { class: "sheet-hint" }, "Cuenta para la racha derivada de fechas")
        ),
        checkin.done
          ? h("span", { class: "item-flag is-on" }, "Día registrado")
          : h(
              "button",
              {
                class: "btn primary today-btn",
                type: "button",
                onclick: () => actions.checkin && actions.checkin()
              },
              "Registrar día"
            )
      )
    ),
    route.allDone
      ? notice(
          `Ruta completada: ${route.done} de ${route.total}. ` +
            "Las recompensas ya se reconocieron al completar cada misión."
        )
      : notice(
          "Completá una misión cuando hayas hecho la acción real. " +
            "La recompensa se reconoce después de guardar, no hace falta reclamarla."
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
    notice(
      "Tu partida vive solo en este aparato. Para pasarla a otro (o guardarla de respaldo), exportá el archivo desde aquí y importalo allá: nada se envía a ningún servidor."
    )
  );
}

/** ¿La app corre instalada (standalone) y no en una pestaña del navegador? */
function isStandalone() {
  try {
    return (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(display-mode: standalone)").matches
    );
  } catch (error) {
    return false;
  }
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
        stat("Saldo ODEA", `₡${fmt(coins.balance)}`, ""),
        stat("Atuendo", (shopItem(tiendaState(bundle).outfit) || {}).name || "Clásico", ""),
        stat("Vehículo", (shopItem(tiendaState(bundle).vehicle) || {}).name || "A pie", "")
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

/** Pantalla «Personaje» del overlay: la tarjeta de progreso, solo lectura.
 *  app.js la invoca al abrir Personaje; la tarjeta vive en characterCard. */
export function renderCharacter(root, bundle, flash) {
  root.replaceChildren(characterCard(bundle, flash, null));
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
        "Este archivo es un respaldo de ODEA 2. Restaurar NO es re-migrar: no toca la huella del origen ni las reglas de reimportación.",
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
