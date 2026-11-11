/**
 * hud-ui.js — HUD del jugador, chips de distritos y hoja de detalle.
 *
 * Recibe SOLO modelos ya calculados (js/hud.js, js/district-figures.js) y
 * construye DOM con textContent. No lee el save ni recalcula nada: la capa
 * visual no escribe ni deriva por su cuenta.
 */

import { DISTRICTS } from "./districts.js";
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

function hudChip(className, label, value, title) {
  return h(
    "span",
    { class: `hud-chip ${className}`, title: title || null },
    h("span", { class: "hud-chip-icon", "aria-hidden": "true" }, label),
    h("span", { class: "hud-chip-value" }, fmt(value))
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
      h("span", { class: "hud-avatar", "aria-hidden": "true" }, "◆"),
      h("span", { class: "hud-name", title: hud.playerName }, hud.playerName),
      h("span", { class: "hud-level", title: "Nivel de campaña" }, `Nv ${fmt(hud.level)}`),
      h("span", { class: "hud-odea", title: "Nivel ODEA" }, `ODEA ${fmt(hud.odeLevel)}`),
      h(
        "div",
        { class: "hud-meta" },
        hudChip("coins", "◈", hud.coins.balance, `Ganadas ${fmt(hud.coins.earned)} · Gastadas ${fmt(hud.coins.spent)}`),
        hudChip("streak", "▲", hud.streak, "Racha actual en días")
      )
    ),
    h(
      "div",
      { class: "hud-xp-row" },
      bar,
      h("span", { class: "hud-xp-text", title: xpTitle }, xpText),
      h(
        "button",
        {
          class: "hud-btn",
          type: "button",
          title: "Exportar respaldo",
          "aria-label": "Exportar respaldo",
          onclick: () => actions.exportBackup()
        },
        h("span", { "aria-hidden": "true" }, "⤓"),
        h("span", { class: "hud-btn-label" }, "Respaldo")
      ),
      h(
        "button",
        {
          class: "hud-btn",
          type: "button",
          title: "Mi progreso",
          "aria-label": "Abrir Mi progreso",
          onclick: () => actions.openProgress()
        },
        h("span", { "aria-hidden": "true" }, "☰"),
        h("span", { class: "hud-btn-label" }, "Mi progreso")
      )
    )
  );
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
