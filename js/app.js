/**
 * app.js — orquestador de Costa Neón (Fase 2).
 *
 * Responsabilidades:
 *  - dibujar la ciudad (Canvas) y atender cámara/gestos;
 *  - pintar HUD, chips y hojas de distrito desde el save migrado;
 *  - reutilizar la pantalla de importación/restauración de la Fase 1 dentro
 *    del overlay «Mi progreso»;
 *  - avisar de una versión nueva del SW y reaccionar a cambios de otra pestaña.
 *
 * La capa visual es SOLO LECTURA: el único módulo que escribe el save es
 * src/storage.js, a través de js/importer.js. Acá nunca se llama a saveOdea2.
 */
import { APP_VERSION } from "./version.js";
import { loadCatalog } from "./catalog.js";
import { getStorage } from "./browser-storage.js";
import * as ui from "./ui.js";
import { buildWorld } from "./city/world.js";
import { createCityView } from "./city/engine.js";
import { buildHud } from "./hud.js";
import { buildDistrictPanel } from "./district-figures.js";
import { renderHud, renderChips, renderSheet } from "./hud-ui.js";
import { createToasts } from "./toast.js";
import { createUpdateWatcher } from "./update-watcher.js";
import { createStorageWatcher } from "./storage-watch.js";
import {
  FORMATS,
  parseFileText,
  currentBundle,
  pendingQuarantine,
  activeState,
  importBundle,
  acceptQuarantine,
  rejectQuarantine,
  resetAndReimport,
  restoreBundle
} from "./importer.js";

const MAX_FILE_BYTES = 25 * 1024 * 1024;

const els = {
  canvas: document.getElementById("city-canvas"),
  hud: document.getElementById("hud"),
  chips: document.getElementById("district-chips"),
  version: document.getElementById("version-badge"),
  toasts: document.getElementById("toasts"),
  floatingImport: document.getElementById("floating-import"),
  backdrop: document.getElementById("sheet-backdrop"),
  sheet: document.getElementById("sheet"),
  overlay: document.getElementById("overlay"),
  overlayTitle: document.getElementById("overlay-title"),
  overlayContent: document.getElementById("overlay-content"),
  overlayClose: document.getElementById("overlay-close")
};

let storage = null;
let catalog = null;
let bundle = null;
let city = null;
let toasts = null;
let updateWatcher = null;
let storageWatcher = null;
let overlayOpen = false;
let autoOpened = false;
let sheetOpen = false;
let flash = null;
let lastOdea1 = null;
let fileInput = null;

if (els.version) {
  els.version.textContent = `v${APP_VERSION}`;
  els.version.title = "ODEA 2 · Costa Neón";
}

/* -------------------------------- acciones -------------------------------- */

const actions = {
  pickFile,
  exportBackup,
  openProgress: () => openOverlay(),
  acceptQuarantine: handleAcceptQuarantine,
  rejectQuarantine: handleRejectQuarantine,
  resetReimport: handleResetReimport,
  restoreConfirm: handleRestore,
  cancel: () => {
    flash = null;
    refresh();
  }
};

/* --------------------------------- ciudad --------------------------------- */

function setCityActive(active) {
  document.body.dataset.hasSave = active ? "true" : "false";
}

function initCity() {
  if (!els.canvas) return;
  try {
    const world = buildWorld();
    city = createCityView({
      canvas: els.canvas,
      world,
      onSelectDistrict: openDistrict
    });
  } catch (error) {
    document.body.classList.add("no-city");
    if (els.canvas) els.canvas.hidden = true;
  }
}

function openDistrict(id) {
  if (!bundle || !catalog) return;
  const panel = buildDistrictPanel(id, bundle, catalog);
  if (!panel) return;

  if (sheetOpen) closeSheet();
  renderSheet(els.sheet, panel, {
    close: closeSheet,
    center: () => {
      if (city) city.focusDistrict(id);
    }
  });
  els.sheet.hidden = false;
  els.backdrop.hidden = false;
  document.body.classList.add("sheet-open");
  sheetOpen = true;

  if (city) {
    city.selectDistrict(id);
    city.focusDistrict(id);
  }

  const close = els.sheet.querySelector(".sheet-close");
  if (close) close.focus({ preventScroll: true });
}

function closeSheet() {
  if (!sheetOpen) return;
  els.sheet.hidden = true;
  els.backdrop.hidden = true;
  document.body.classList.remove("sheet-open");
  sheetOpen = false;
  if (city) city.clearSelection();
}

/* -------------------------------- overlay -------------------------------- */

function openOverlay(title = null) {
  overlayOpen = true;
  els.overlay.hidden = false;
  if (title) els.overlayTitle.textContent = title;
  else if (bundle) els.overlayTitle.textContent = "Mi progreso";
  document.body.classList.add("overlay-open");
}

function closeOverlay() {
  overlayOpen = false;
  els.overlay.hidden = true;
  document.body.classList.remove("overlay-open");
}

/* --------------------------------- estado --------------------------------- */

function refresh() {
  if (!storage || !catalog) return;

  let next = null;
  if (currentBundle(storage)) {
    try {
      next = activeState(storage, catalog);
    } catch (error) {
      bundle = null;
      setCityActive(false);
      els.hud.hidden = true;
      els.chips.hidden = true;
      openOverlay("Mi progreso");
      ui.renderFatal(
        els.overlayContent,
        `El save guardado no pudo cargarse: ${error.message}`
      );
      return;
    }
  }

  bundle = next;

  if (bundle) {
    setCityActive(true);
    const hud = buildHud(bundle, catalog);
    renderHud(els.hud, hud, actions);
    els.hud.hidden = false;
    els.chips.hidden = false;
    els.floatingImport.hidden = false;
    els.floatingImport.textContent = "Mi progreso";

    if (city) {
      city.setPlayerVisible(true);
      city.setCredit(hud.xpBreakdown.evento + hud.xpBreakdown.farm);
    }

    els.overlayTitle.textContent = "Mi progreso";
    const message = flash;
    flash = null;
    ui.renderActive(els.overlayContent, bundle, actions, message);
    return;
  }

  setCityActive(false);
  if (city) {
    city.setPlayerVisible(false);
    city.setCredit(null);
    city.clearSelection();
  }
  els.hud.hidden = true;
  els.chips.hidden = true;
  els.floatingImport.hidden = false;
  els.floatingImport.textContent = "Importar mi progreso";
  flash = null;
  closeSheet();

  const quarantine = pendingQuarantine(storage);
  if (quarantine) {
    els.overlayTitle.textContent = "Importación en cuarentena";
    ui.renderQuarantine(els.overlayContent, quarantine, actions);
  } else {
    els.overlayTitle.textContent = "Importá tu progreso";
    ui.renderEmpty(els.overlayContent, actions);
  }

  if (!overlayOpen && !autoOpened) {
    autoOpened = true;
    openOverlay();
  }
}

/* -------------------------------- archivos -------------------------------- */

function ensureFileInput() {
  if (fileInput) return fileInput;
  fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "application/json,.json";
  fileInput.id = "odea-file-input";
  fileInput.hidden = true;
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = "";
    if (file) await handleFile(file);
  });
  document.body.append(fileInput);
  return fileInput;
}

function pickFile() {
  ensureFileInput().click();
}

async function handleFile(file) {
  if (file.size > MAX_FILE_BYTES) {
    openOverlay("Importar progreso");
    ui.renderError(
      els.overlayContent,
      "El archivo es demasiado grande para ser un export de progreso.",
      actions
    );
    return;
  }

  let parsed;
  try {
    parsed = parseFileText(await file.text());
  } catch (error) {
    openOverlay("Importar progreso");
    ui.renderError(els.overlayContent, error.message, actions);
    return;
  }

  if (parsed.format === FORMATS.ODEA1) {
    lastOdea1 = parsed.data;
    handleImport(parsed.data);
    return;
  }
  if (parsed.format === FORMATS.ODEA2) {
    openOverlay("Restaurar respaldo");
    ui.renderRestorePrompt(els.overlayContent, parsed.data, actions);
    return;
  }
  openOverlay("Importar progreso");
  ui.renderError(
    els.overlayContent,
    "Formato no reconocido. Se espera un export de ODEA 1 (odea_bundle_v2) o un respaldo de ODEA 2 (odea2_bundle_v1).",
    actions
  );
}

/* ------------------------------ migración -------------------------------- */

function handleImport(legacy) {
  try {
    const result = importBundle(legacy, { catalog, storage });
    if (result.status === "active") {
      lastOdea1 = null;
      flash = "Progreso importado y validado: el XP y las monedas cuadran.";
      closeOverlay();
      closeSheet();
      refresh();
      if (toasts) toasts.show("Progreso importado. Bienvenido a Costa Neón.", { tone: "ok" });
      return;
    }
    if (result.status === "quarantine") {
      openOverlay("Importación en cuarentena");
      refresh();
      return;
    }
    openOverlay("Importación abortada");
    ui.renderAborted(els.overlayContent, result.report, actions);
  } catch (error) {
    handleImportError(error, legacy);
  }
}

function handleImportError(error, legacy) {
  if (error && error.code === "DUPLICATE_SOURCE") {
    openOverlay("Mi progreso");
    ui.renderDuplicate(els.overlayContent, actions);
    return;
  }
  if (error && error.code === "ALREADY_IMPORTED") {
    lastOdea1 = legacy;
    openOverlay("Ya hay un save");
    ui.renderAlreadyImported(els.overlayContent, actions);
    return;
  }
  openOverlay("Importar progreso");
  ui.renderError(els.overlayContent, (error && error.message) || String(error), actions);
}

function handleAcceptQuarantine() {
  try {
    acceptQuarantine(storage);
    flash = "Importación aceptada. Revisá que no falte ningún dato crítico.";
    closeOverlay();
    refresh();
    if (toasts) toasts.show("Importación aceptada.", { tone: "ok" });
  } catch (error) {
    openOverlay("Importación en cuarentena");
    ui.renderError(els.overlayContent, error.message, actions);
  }
}

function handleRejectQuarantine() {
  try {
    rejectQuarantine(storage);
    flash = null;
    closeOverlay();
    refresh();
  } catch (error) {
    openOverlay("Importación en cuarentena");
    ui.renderError(els.overlayContent, error.message, actions);
  }
}

function handleResetReimport() {
  if (!lastOdea1) {
    refresh();
    return;
  }
  try {
    const result = resetAndReimport(lastOdea1, { catalog, storage });
    lastOdea1 = null;
    if (result.status === "active") {
      flash = "Save reemplazado. Se guardó un backup del save anterior.";
      closeOverlay();
      refresh();
      if (toasts) toasts.show("Save reemplazado con respaldo previo.", { tone: "ok" });
      return;
    }
    if (result.status === "quarantine") {
      openOverlay("Importación en cuarentena");
      refresh();
      return;
    }
    openOverlay("Importación abortada");
    ui.renderAborted(els.overlayContent, result.report, actions);
  } catch (error) {
    handleImportError(error, lastOdea1);
  }
}

function handleRestore(saved) {
  try {
    const { backupOfCurrent } = restoreBundle(saved, { catalog, storage });
    flash = backupOfCurrent
      ? "Respaldo restaurado. Se guardó un backup del save anterior."
      : "Respaldo restaurado.";
    closeOverlay();
    closeSheet();
    refresh();
    if (toasts) toasts.show("Respaldo restaurado.", { tone: "ok" });
  } catch (error) {
    openOverlay("Restaurar respaldo");
    ui.renderError(
      els.overlayContent,
      `No se pudo restaurar el respaldo: ${error.message}`,
      actions
    );
  }
}

/* -------------------------------- respaldo -------------------------------- */

function exportBackup() {
  const current = currentBundle(storage);
  if (!current) return;
  const blob = new Blob([JSON.stringify(current, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `odea2-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  if (toasts) toasts.show("Respaldo exportado.", { tone: "ok" });
}

/* ------------------------------ version nueva ----------------------------- */

function setupServiceWorker() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;

  updateWatcher = createUpdateWatcher({
    container: navigator.serviceWorker,
    onUpdateAvailable: () => {
      if (!toasts) return;
      toasts.show("Hay una versión nueva", {
        tone: "update",
        key: "update",
        duration: 0,
        actionLabel: "Recargar",
        onAction: () => updateWatcher.accept()
      });
    },
    reload: () => location.reload(),
    fallbackMs: 4000
  });

  const register = async () => {
    try {
      const registration = await navigator.serviceWorker.register("./sw.js");
      updateWatcher.check(registration);
    } catch (error) {
      /* Sin service worker la app sigue funcionando; solo no queda offline. */
    }
  };

  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}

/* -------------------------------- multi-pestaña --------------------------- */

function setupStorageWatcher() {
  storageWatcher = createStorageWatcher({
    target: window,
    onRemoteChange: () => {
      closeSheet();
      refresh();
      if (toasts) {
        toasts.show("Tu progreso cambió en otra pestaña", {
          tone: "info",
          key: "remote"
        });
      }
    }
  });
}

/* --------------------------------- arranque ------------------------------- */

async function boot() {
  toasts = createToasts(els.toasts);

  try {
    storage = getStorage();
  } catch (error) {
    if (els.overlay) {
      els.overlay.hidden = false;
      ui.renderFatal(els.overlayContent, error.message);
    }
    return;
  }

  initCity();
  setCityActive(false);
  setupStorageWatcher();

  if (els.overlayClose) {
    els.overlayClose.addEventListener("click", closeOverlay);
  }
  if (els.backdrop) {
    els.backdrop.addEventListener("click", closeSheet);
  }
  if (els.floatingImport) {
    els.floatingImport.addEventListener("click", () => {
      openOverlay(bundle ? "Mi progreso" : "Importá tu progreso");
    });
  }
  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (sheetOpen) closeSheet();
    else if (overlayOpen) closeOverlay();
  });

  try {
    catalog = await loadCatalog();
  } catch (error) {
    openOverlay("ODEA 2 no puede arrancar");
    ui.renderFatal(
      els.overlayContent,
      `No se pudo cargar el catálogo de juego. Revisá la conexión y recargá. (${error.message})`
    );
    return;
  }

  renderChips(els.chips, { onDistrict: openDistrict });
  refresh();
  setupServiceWorker();
}

boot();
