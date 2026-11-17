/**
 * hud-ui.js — HUD del jugador, chips de distritos y hoja de detalle.
 *
 * Recibe SOLO modelos ya calculados (js/hud.js, js/district-figures.js) y
 * construye DOM con textContent. No lee el save ni recalcula nada: la capa
 * visual no escribe ni deriva por su cuenta.
 */

import { DISTRICTS } from "./districts.js";
import { TABS } from "./tabs.js";
import { fmt } from "./format.js";

function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "style") node.setAttribute("style", value);
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === "disabled") node[key] = Boolean(value);
    else node.setAttribute(key, String(value));
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

/* ---------------------------------- HUD ----------------------------------- */

function hudChip(className, label, value, title, prefix = "") {
  return h(
    "span",
    { class: `hud-chip ${className}`, title: title || null },
    h("span", { class: "hud-chip-icon", "aria-hidden": "true" }, label),
    h("span", { class: "hud-chip-value" }, `${prefix}${fmt(value)}`)
  );
}

export function renderHud(root, hud, actions) {
  const atMax = hud.xp.atMax;
  const ratio = atMax ? 1 : Math.max(0, Math.min(1, hud.xp.ratio || 0));
  const percent = Math.round(ratio * 1000) / 10;
  const xpText = atMax
    ? `${fmt(hud.totalXP)} XP · nivel máximo`
    : `${fmt(hud.xp.current)} / ${fmt(hud.xp.next)} XP`;
  const xpTitle = atMax
    ? "Nivel ODEA máximo alcanzado"
    : `Nivel ODEA ${fmt(hud.odeLevel)} · faltan ${fmt(hud.xp.next - hud.xp.current)} XP para el siguiente`;

  const bar = h(
    "div",
    {
      class: "hud-bar",
      role: "progressbar",
      "aria-label": "Progreso de XP al siguiente nivel ODEA",
      "aria-valuemin": "0",
      "aria-valuemax": "100",
      "aria-valuenow": String(percent),
      title: xpTitle
    },
    h("span", { style: `width:${percent}%` })
  );

  root.replaceChildren(
    h(
      "div",
      { class: "hud-top" },
      h("span", { class: "hud-avatar", "aria-hidden": "true" }, "★"),
      h("span", { class: "hud-name", title: hud.playerName }, hud.playerName),
      h("span", { class: "hud-level", title: "Nivel de campaña" }, `Nv ${fmt(hud.level)}`),
      h("span", { class: "hud-odea", title: "Nivel ODEA" }, `ODEA ${fmt(hud.odeLevel)}`),
      h(
        "div",
        { class: "hud-meta" },
        hudChip("coins", "●", hud.coins.balance, `Saldo virtual ODEA · ganadas ${fmt(hud.coins.earned)} · gastadas ${fmt(hud.coins.spent)} · sin tienda activa, no es dinero real ni canjeable`, "₡"),
        hudChip("streak", "★", hud.streak, "Racha actual de metas en días")
      )
    ),
    h(
      "div",
      { class: "hud-xp-row" },
      bar,
      h("span", { class: "hud-xp-text", title: xpTitle }, xpText)
    )
  );
}

/* ---------------------------------- tabs ---------------------------------- */

/**
 * Barra de destinos. Se construye una sola vez y luego solo se actualiza
 * `aria-current`: reemplazar los botones en cada refresh destruiría el que
 * tiene el foco y lo devolvería al body.
 */
export function renderTabs(root, { active, onSelect, exclude = [] } = {}) {
  if (root.dataset.ready !== "true") {
    root.replaceChildren(
      ...TABS.filter((tab) => !exclude.includes(tab.id)).map((tab) =>
        h(
          "button",
          {
            class: "tab",
            type: "button",
            "data-tab": tab.id,
            "aria-label": tab.hint,
            onclick: () => onSelect && onSelect(tab.id)
          },
          h("span", { class: "tab-icon", "aria-hidden": "true" }, tab.icon),
          h("span", { class: "tab-label" }, tab.label)
        )
      )
    );
    root.dataset.ready = "true";
  }
  for (const button of root.querySelectorAll(".tab")) {
    if (button.getAttribute("data-tab") === active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
}

/* --------------------------------- chips ---------------------------------- */

export function renderChips(root, { onDistrict, activeId = null } = {}) {
  const buttons = DISTRICTS.map((district) =>
    h(
      "button",
      {
        class: `chip${activeId === district.id ? " is-active" : ""}`,
        type: "button",
        style: `--chip:${district.accent}`,
        title: `${district.name} · ${district.subtitle}`,
        onclick: () => onDistrict && onDistrict(district.id)
      },
      h("span", { class: "chip-dot", "aria-hidden": "true" }),
      district.chipLabel
    )
  );
  root.replaceChildren(...buttons);
}

/* ---------------------------------- hoja ---------------------------------- */

function sheetRow(row) {
  return h(
    "div",
    { class: "sheet-row" },
    h(
      "span",
      { class: "sheet-row-label" },
      row.label,
      row.hint ? h("span", { class: "sheet-hint" }, row.hint) : null
    ),
    h("span", { class: "sheet-row-value" }, row.value)
  );
}

function sheetRows(rows) {
  const out = [];
  let group = null;
  for (const row of rows) {
    if (row.group && row.group !== group) {
      group = row.group;
      out.push(h("h4", { class: "sheet-group" }, group));
    }
    out.push(sheetRow(row));
  }
  return out;
}

/* ----------------------------- misiones de hoy ---------------------------- */

function missionState(mission, actions, system) {
  if (mission.completed) return h("span", { class: "sheet-mission-done" }, "Hecha");
  return h(
    "button",
    {
      class: "btn ghost sheet-mission-btn",
      type: "button",
      onclick: () => actions.completeMission && actions.completeMission(mission.id, system)
    },
    "Completar"
  );
}

function missionRow(mission, actions, system) {
  const freq =
    mission.cls === "daily" ? "diaria" : mission.cls === "weekly" ? "semanal" : null;
  const hint = [
    `${fmt(mission.xp)} XP`,
    mission.slot ? `slot ${mission.slot}` : null,
    freq
  ]
    .filter(Boolean)
    .join(" · ");

  return h(
    "div",
    { class: `sheet-mission${mission.completed ? " is-done" : ""}` },
    h(
      "div",
      { class: "sheet-mission-info" },
      h("span", { class: "sheet-mission-id" }, mission.id),
      h("span", { class: "sheet-hint" }, hint)
    ),
    missionState(mission, actions, system)
  );
}

/**
 * Bloques agrupados de un sistema (Empleo por mapa, Vida por frecuencia).
 *
 * Cada grupo es un `<details>` nativo: Vida tiene 192 misiones y volcarlas
 * todas abiertas convierte la hoja en una pared de botones donde es fácil
 * completar por error algo que no hiciste. El primero abre; el resto queda a
 * un toque. Sin estado propio: lo resuelve el navegador, con teclado incluido.
 */
function playGroups(play, actions) {
  const nodes = [];
  let opened = false;
  for (const group of play.groups || []) {
    const missions = group.missions || [];
    if (!missions.length) continue;
    const open = !opened;
    opened = true;
    const details = h(
      "details",
      { class: "sheet-group-details", ...(open ? { open: "" } : {}) },
      h("summary", { class: "sheet-group-summary" }, `${group.label} · ${fmt(missions.length)}`),
      h(
        "div",
        { class: "sheet-missions" },
        ...missions.map((mission) => missionRow(mission, actions, play.system))
      )
    );
    nodes.push(details);
  }
  return nodes;
}

function playSection(play, actions) {
  if (!play) return [];

  /* Hub: la ruta del día con su check-in. Es el único con lógica diaria. */
  if (play.catalogDay != null) {
    const missions = (play.missions || []).map((mission) =>
      h(
        "div",
        { class: `sheet-mission${mission.completed ? " is-done" : ""}` },
        h(
          "div",
          { class: "sheet-mission-info" },
          h("span", { class: "sheet-mission-id" }, mission.id),
          h(
            "span",
            { class: "sheet-hint" },
            `${fmt(mission.xp)} XP${mission.slot ? ` · slot ${mission.slot}` : ""}`
          )
        ),
        missionState(mission, actions, "hub")
      )
    );

    return [
      h("h4", { class: "sheet-group" }, `Misiones de hoy · día ${play.catalogDay}`),
      h(
        "div",
        { class: "sheet-play" },
        missions.length
          ? h("div", { class: "sheet-missions" }, ...missions)
          : h("p", { class: "sheet-hint" }, "No quedan misiones pendientes para hoy."),
        h(
          "div",
          { class: "sheet-checkin" },
          h(
            "span",
            { class: "sheet-hint" },
            `Racha derivada: ${fmt(play.checkin.streak)} días${play.checkin.streakDate ? ` · último ${play.checkin.streakDate}` : ""}`
          ),
          play.checkin.done
            ? h("span", { class: "sheet-mission-done" }, "Día registrado")
            : h(
                "button",
                {
                  class: "btn primary sheet-checkin-btn",
                  type: "button",
                  onclick: () => actions.checkin && actions.checkin()
                },
                "Registrar día"
              )
        )
      )
    ];
  }

  /* Resto de sistemas: pendientes agrupadas. Las completadas no se listan
     porque no requieren acción; el conteo queda a la vista. */
  const empty = !play.groups || play.groups.every((group) => !(group.missions || []).length);
  return [
    h(
      "div",
      { class: "sheet-play" },
      h(
        "p",
        { class: "sheet-hint" },
        `${fmt(play.pendingCount)} pendientes · ${fmt(play.completedCount)} completadas`
      ),
      empty
        ? h("p", { class: "sheet-hint" }, "No queda nada pendiente en este distrito.")
        : h("div", {}, ...playGroups(play, actions))
    )
  ];
}

export function renderSheet(root, panel, actions = {}) {
  const accent = panel.accent || "#FF2E93";
  root.style.setProperty("--accent", accent);
  const xpChips = panel.xp && panel.xp.length
    ? [
        h("h4", { class: "sheet-group" }, "XP de este distrito"),
        h(
          "div",
          { class: "sheet-xp" },
          ...panel.xp.map((item) =>
            h(
              "span",
              { class: "xp-chip" },
              h("span", { class: "xp-chip-label" }, item.label),
              h("strong", { class: "xp-chip-value" }, item.value)
            )
          )
        )
      ]
    : [];

  const list = panel.list && panel.list.length
    ? [
        h("h4", { class: "sheet-group" }, "Detalle"),
        h(
          "div",
          { class: "sheet-list" },
          ...panel.list.map((item) =>
            h(
              "div",
              { class: "sheet-list-item" },
              h("span", {}, item.label),
              h("span", { class: "sheet-row-value" }, item.value)
            )
          )
        )
      ]
    : [];

  const children = [
    h(
      "header",
      { class: "sheet-head" },
      h(
        "div",
        { class: "sheet-heading" },
        h("p", { class: "sheet-sub" }, panel.subtitle),
        h("h2", { class: "sheet-title", id: "sheet-title" }, panel.name)
      ),
      h(
        "button",
        {
          class: "icon-btn sheet-close",
          type: "button",
          "aria-label": "Cerrar panel del distrito",
          onclick: () => actions.close && actions.close()
        },
        "✕"
      )
    ),
    h("p", { class: "sheet-desc" }, panel.description),
    panel.systems && panel.systems.length
      ? h("p", { class: "sheet-systems" }, `Sistemas: ${panel.systems.join(" · ")}`)
      : null,
    panel.archivedNotice ? h("p", { class: "notice warn" }, panel.archivedNotice) : null,
    ...xpChips,
    ...sheetRows(panel.rows || []),
    ...playSection(panel.play, actions),
    ...list,
    h("p", { class: "sheet-footnote" }, panel.footnote),
    h(
      "div",
      { class: "sheet-actions" },
      h(
        "button",
        {
          class: "btn ghost",
          type: "button",
          onclick: () => actions.center && actions.center()
        },
        "Centrar en el mapa"
      ),
      h(
        "button",
        {
          class: "btn primary",
          type: "button",
          onclick: () => actions.close && actions.close()
        },
        "Volver a la ciudad"
      )
    )
  ];

  root.replaceChildren(...children.filter(Boolean));
}
