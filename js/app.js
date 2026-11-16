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
 * src/storage.js, a través de js/importer.js. Las misiones del Hub usan la
 * ruta ÚNICA `applyGameplayMutation`, dentro del lock de origen que aplica
 * `applyGameplayMutationLocked`; acá nunca se llama a saveOdea2.
 */
import { APP_VERSION } from "./version.js";
import { loadCatalog } from "./catalog.js";
import { getStorage } from "./browser-storage.js";
import { localDateKey } from "../src/derive.js";
import * as ui from "./ui.js";
import { buildWorld } from "./city/world.js";
import { createCityView } from "./city/engine.js";
import { createViewSession } from "./city/view-session.js";
import { buildHud } from "./hud.js";
import { buildDistrictPanel } from "./district-figures.js";
import { renderHud, renderChips, renderSheet, renderTabs } from "./hud-ui.js";
import {
  TAB_CHARACTER,
  TAB_CITY,
  TAB_MENU,
  TAB_TODAY,
  shouldShowTabbar,
  resolveTab
} from "./tabs.js";
import { createToasts } from "./toast.js";
import { createUpdateWatcher } from "./update-watcher.js";
import { createStorageWatcher } from "./storage-watch.js";
import { ambienceFor } from "./ambience.js";
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
  restoreBundle,
  applyGameplayMutationLocked
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
  tabbar: document.getElementById("tabbar"),
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
let overlayMode = null; /* "character" | "menu" | "flow" */
let activeTab = TAB_CITY;
let lastFocus = null;
let autoOpened = false;
let sheetOpen = false;
let sheetDistrictId = null;
let viewSession = null;
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
  openProgress: () => openCharacter(),
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
    viewSession = createViewSession(city.camera);
  } catch (error) {
    document.body.classList.add("no-city");
    if (els.canvas) els.canvas.hidden = true;
  }
}

function openDistrict(id) {
  if (!bundle || !catalog) return;
  const panel = buildDistrictPanel(id, bundle, catalog);
  if (!panel) return;

  /* Snapshot en memoria de sesión: se conserva el de la PRIMERA apertura. */
  if (viewSession) viewSession.capture();
  if (!sheetOpen) lastFocus = document.activeElement;
  hideSheetRaw();

  renderSheet(els.sheet, panel, {
    close: closeSheet,
    center: () => {
      if (city) city.focusDistrict(id);
    },
    completeMission: (missionId, system) => completeMission(missionId, system),
    checkin: () => checkin()
  });
  els.sheet.hidden = false;
  els.backdrop.hidden = false;
  document.body.classList.add("sheet-open");
  sheetOpen = true;
  sheetDistrictId = id;

  if (city) {
    city.selectDistrict(id);
    city.focusDistrict(id);
  }

  const close = els.sheet.querySelector(".sheet-close");
  if (close) close.focus({ preventScroll: true });
}

/** Oculta la hoja sin tocar la pestaña activa ni el foco. */
function hideSheetRaw() {
  els.sheet.hidden = true;
  els.backdrop.hidden = true;
  document.body.classList.remove("sheet-open");
  sheetOpen = false;
  sheetDistrictId = null;
  if (city) city.clearSelection();
}

function closeSheet() {
  if (!sheetOpen) return;
  hideSheetRaw();
  /* Restauración exacta de la cámara previa a la primera apertura (§5). */
  if (viewSession) viewSession.restore();
  setTab(TAB_CITY);
  restoreFocus();
}

/* ------------------------------ gameplay Hub ------------------------------ */

function gameplayDate() {
  const now = new Date();
  return { at: now.toISOString(), date: localDateKey(now) };
}

function completeMission(missionId, system = "hub") {
  if (!storage || !catalog) return;
  return applyGameplayMutationLocked(
    storage,
    catalog,
    { type: "mission.complete", system, missionId },
    gameplayDate()
  ).then((result) =>
    afterGameplay(result, `Misión ${missionId} completada.`, "Esa misión ya estaba completada.")
  );
}

function checkin() {
  if (!storage || !catalog) return;
  return applyGameplayMutationLocked(storage, catalog, { type: "hub.checkin" }, gameplayDate()).then(
    (result) => afterGameplay(result, "Día registrado. Racha actualizada.", "El día ya estaba registrado.")
  );
}

function afterGameplay(result, okMessage, duplicateMessage) {
  if (result.status === "rejected") {
    if (toasts) {
      toasts.show(`No se pudo guardar: ${result.error.code}`, { tone: "error" });
    }
    return;
  }
  if (result.status === "duplicate") {
    if (toasts) toasts.show(duplicateMessage, { tone: "info" });
    refresh();
    return;
  }
  if (toasts) toasts.show(okMessage, { tone: "ok" });
  refresh();
  if (sheetOpen && sheetDistrictId) openDistrict(sheetDistrictId);
}

/* ------------------------------- navegación ------------------------------- */

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function focusablesIn(container) {
  return Array.from(container.querySelectorAll(FOCUSABLE)).filter(
    (node) => node.offsetParent !== null || node === document.activeElement
  );
}

/** Mantiene el foco dentro de la capa superior mientras está abierta. */
function trapTab(event, container) {
  if (event.key !== "Tab" || !container) return;
  const items = focusablesIn(container);
  if (!items.length) {
    event.preventDefault();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/** Devuelve el foco al control que abrió la capa (guía, pág. 7). */
function restoreFocus() {
  const target = lastFocus;
  lastFocus = null;
  if (target && typeof target.focus === "function" && document.contains(target)) {
    target.focus({ preventScroll: true });
  }
}

function setTab(tab) {
  activeTab = resolveTab(tab);
  renderTabbar();
}

function renderTabbar() {
  if (!els.tabbar) return;
  els.tabbar.hidden = !shouldShowTabbar({ hasSave: Boolean(bundle) });
  if (els.tabbar.hidden) return;
  renderTabs(els.tabbar, { active: activeTab, onSelect: selectTab });
}

/** Destino seleccionado en la barra: abre la capa que le corresponde. */
function selectTab(id) {
  const tab = resolveTab(id);

  if (tab === TAB_CITY) {
    hideOverlayRaw();
    hideSheetRaw();
    if (viewSession) viewSession.restore();
    setTab(TAB_CITY);
    return;
  }
  if (!bundle) return;

  if (tab === TAB_TODAY) {
    /* «Hoy» es un acceso directo al Hub: no duplica la lógica diaria. */
    hideOverlayRaw();
    setTab(TAB_TODAY);
    openDistrict("hub");
    return;
  }

  hideSheetRaw();
  /* Salir de la hoja por la barra también termina el recorrido del distrito. */
  if (viewSession) viewSession.restore();
  setTab(tab);
  if (tab === TAB_CHARACTER) openCharacter();
  else openMenu();
}

/* -------------------------------- overlay -------------------------------- */

function showOverlay() {
  if (!overlayOpen) lastFocus = document.activeElement;
  overlayOpen = true;
  els.overlay.hidden = false;
  document.body.classList.add("overlay-open");
  const first = focusablesIn(els.overlay)[0];
  if (first) first.focus({ preventScroll: true });
}

/** Oculta el overlay sin tocar la pestaña activa ni el foco. */
function hideOverlayRaw() {
  overlayOpen = false;
  overlayMode = null;
  els.overlay.hidden = true;
  document.body.classList.remove("overlay-open");
}

/** Pantalla «Personaje»: solo lectura del progreso. */
function openCharacter() {
  overlayMode = "character";
  els.overlayTitle.textContent = "Personaje";
  if (bundle) ui.renderCharacter(els.overlayContent, bundle);
  showOverlay();
}

/** Pantalla «Menú»: respaldo, importación y versión. */
function openMenu() {
  overlayMode = "menu";
  els.overlayTitle.textContent = "Menú";
  ui.renderMenu(els.overlayContent, { version: APP_VERSION, actions });
  showOverlay();
}

/** Pantallas de flujo (importar, cuarentena, restaurar, errores). */
function openOverlay(title = null) {
  overlayMode = "flow";
  if (title) els.overlayTitle.textContent = title;
  showOverlay();
}

function closeOverlay() {
  if (!overlayOpen) return;
  hideOverlayRaw();
  setTab(TAB_CITY);
  restoreFocus();
}

/* -------------------------------- ambiente -------------------------------- */

/**
 * Aplica el perfil visual (hora, clima del día, niveles por distrito).
 * Es SOLO LECTURA: deriva del bundle y nunca lo toca.
 */
function applyAmbience() {
  if (!city) return;
  const reduced =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  city.setAmbience(ambienceFor(bundle, { reducedMotion: reduced }));
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
      openOverlay("Problema al cargar");
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
    /* Con save, la barra de destinos reemplaza al botón flotante. */
    els.floatingImport.hidden = true;
    renderTabbar();

    if (city) {
      city.setPlayerVisible(true);
      city.setCredit(hud.xpBreakdown.evento + hud.xpBreakdown.farm);
    }
    applyAmbience();

    /* El overlay solo se repinta si la pestaña abierta lo usa; las pantallas
       de flujo (importar, cuarentena, errores) se gobiernan a sí mismas. */
    if (overlayMode === "character") {
      const message = flash;
      flash = null;
      ui.renderCharacter(els.overlayContent, bundle, message);
    } else if (overlayMode === "menu") {
      ui.renderMenu(els.overlayContent, { version: APP_VERSION, actions });
    }
    return;
  }

  setCityActive(false);
  if (city) {
    city.setPlayerVisible(false);
    city.setCredit(null);
    city.clearSelection();
  }
  applyAmbience();
  els.hud.hidden = true;
  els.chips.hidden = true;
  els.floatingImport.hidden = false;
  els.floatingImport.textContent = "Importar mi progreso";
  renderTabbar();
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
    openOverlay("Ese bundle ya fue importado");
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
    els.floatingImport.addEventListener("click", () => openOverlay("Importá tu progreso"));
  }
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (sheetOpen) closeSheet();
      else if (overlayOpen) closeOverlay();
      return;
    }
    /* El foco no se escapa de la capa superior mientras esté abierta. */
    if (sheetOpen) trapTab(event, els.sheet);
    else if (overlayOpen) trapTab(event, els.overlay);
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

  /* La luz depende de la hora: se revisa cada 5 minutos y al volver a la app,
     porque un teléfono puede quedar en segundo plano toda la tarde. */
  setInterval(applyAmbience, 5 * 60 * 1000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) applyAmbience();
  });
}

boot();
