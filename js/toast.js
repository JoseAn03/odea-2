/**
 * toast.js — avisos efímeros de la ciudad (versión nueva, multi-pestaña,
 * respaldo exportado). Construye DOM con textContent: sin innerHTML.
 *
 * No conoce la lógica de actualización ni de almacenamiento: solo pinta el
 * mensaje y llama al callback de su botón cuando el usuario lo toca.
 */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
}

export function createToasts(host) {
  if (!host) {
    return { show: () => null, dismiss: () => {}, clear: () => {} };
  }

  const live = new Map();
  let seq = 0;

  function dismiss(id) {
    const entry = live.get(id);
    if (!entry) return;
    if (entry.timer !== null) clearTimeout(entry.timer);
    entry.node.remove();
    live.delete(id);
  }

  /**
   * @param {string} message
   * @param {{tone?:string, key?:string, actionLabel?:string, onAction?:Function,
   *          duration?:number}} options duration 0 = no se cierra solo.
   */
  function show(message, options = {}) {
    const {
      tone = "",
      key = null,
      actionLabel = null,
      onAction = null,
      duration = 4200
    } = options;

    const id = key || `toast-${++seq}`;
    dismiss(id);

    const node = el("div", `toast ${tone}`.trim());
    node.append(el("span", "toast-text", message));

    if (actionLabel) {
      const action = el("button", "toast-action", actionLabel);
      action.type = "button";
      action.addEventListener("click", () => {
        if (typeof onAction === "function") onAction();
      });
      node.append(action);
    }

    host.append(node);

    let timer = null;
    if (duration > 0) {
      timer = setTimeout(() => dismiss(id), duration);
      if (timer && typeof timer.unref === "function") timer.unref();
    }

    live.set(id, { node, timer });

    return {
      id,
      dismiss: () => dismiss(id)
    };
  }

  function clear() {
    for (const id of [...live.keys()]) dismiss(id);
  }

  return { show, dismiss, clear };
}
