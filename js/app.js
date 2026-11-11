/** app.js — orquestador de la pantalla de estado (Fase 1).
 *  La lógica de migración/validación vive en src/ (Fase 0), no acá.
 */
import { APP_VERSION } from "./version.js";
import { loadCatalog } from "./catalog.js";
import { getStorage } from "./browser-storage.js";
import * as ui from "./ui.js";
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

const root = document.getElementById("app");
ui.setVersion(document.getElementById("app-version"), APP_VERSION);

const MAX_FILE_BYTES = 25 * 1024 * 1024;

let storage = null;
let catalog = null;
let flash = null;
let lastOdea1 = null;
let fileInput = null;

const actions = {
  pickFile,
  exportBackup,
  acceptQuarantine: handleAcceptQuarantine,
  rejectQuarantine: handleRejectQuarantine,
  resetReimport: handleResetReimport,
  restoreConfirm: handleRestore,
  cancel: () => {
    flash = null;
    refresh();
  }
};

/* ------------------------------- estado -------------------------------- */

function refresh() {
  if (!storage || !catalog) return;

  if (currentBundle(storage)) {
    try {
      const state = activeState(storage, catalog);
      const message = flash;
      flash = null;
      ui.renderActive(root, state, actions, message);
    } catch (error) {
      ui.renderFatal(root, `El save guardado no pudo cargarse: ${error.message}`);
    }
    return;
  }

  const quarantine = pendingQuarantine(storage);
  if (quarantine) {
    ui.renderQuarantine(root, quarantine, actions);
    return;
  }

  flash = null;
  ui.renderEmpty(root, actions);
}

/* ------------------------------ archivos -------------------------------- */

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
    ui.renderError(root, "El archivo es demasiado grande para ser un export de progreso.", actions);
    return;
  }

  let parsed;
  try {
    parsed = parseFileText(await file.text());
  } catch (error) {
    ui.renderError(root, error.message, actions);
    return;
  }

  if (parsed.format === FORMATS.ODEA1) {
    lastOdea1 = parsed.data;
    handleImport(parsed.data);
    return;
  }
  if (parsed.format === FORMATS.ODEA2) {
    ui.renderRestorePrompt(root, parsed.data, actions);
    return;
  }
  ui.renderError(
    root,
    "Formato no reconocido. Se espera un export de ODEA 1 (odea_bundle_v2) o un respaldo de ODEA 2 (odea2_bundle_v1).",
    actions
  );
}

/* ------------------------------ acciones -------------------------------- */

function handleImport(legacy) {
  try {
    const result = importBundle(legacy, { catalog, storage });
    if (result.status === "active") {
      lastOdea1 = null;
      flash = "Progreso importado y validado: el XP y las monedas cuadran.";
      refresh();
      return;
    }
    if (result.status === "quarantine") {
      refresh();
      return;
    }
    ui.renderAborted(root, result.report, actions);
  } catch (error) {
    handleImportError(error, legacy);
  }
}

function handleImportError(error, legacy) {
  if (error && error.code === "DUPLICATE_SOURCE") {
    ui.renderDuplicate(root, actions);
    return;
  }
  if (error && error.code === "ALREADY_IMPORTED") {
    lastOdea1 = legacy;
    ui.renderAlreadyImported(root, actions);
    return;
  }
  ui.renderError(root, (error && error.message) || String(error), actions);
}

function handleAcceptQuarantine() {
  try {
    acceptQuarantine(storage);
    flash = "Importación aceptada. Revisá que no falte ningún dato crítico.";
    refresh();
  } catch (error) {
    ui.renderError(root, error.message, actions);
  }
}

function handleRejectQuarantine() {
  try {
    rejectQuarantine(storage);
    flash = null;
    refresh();
  } catch (error) {
    ui.renderError(root, error.message, actions);
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
      refresh();
      return;
    }
    if (result.status === "quarantine") {
      refresh();
      return;
    }
    ui.renderAborted(root, result.report, actions);
  } catch (error) {
    handleImportError(error, lastOdea1);
  }
}

function handleRestore(bundle) {
  try {
    const { backupOfCurrent } = restoreBundle(bundle, { catalog, storage });
    flash = backupOfCurrent
      ? "Respaldo restaurado. Se guardó un backup del save anterior."
      : "Respaldo restaurado.";
    refresh();
  } catch (error) {
    ui.renderError(root, `No se pudo restaurar el respaldo: ${error.message}`, actions);
  }
}

function exportBackup() {
  const bundle = currentBundle(storage);
  if (!bundle) return;
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `odea2-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  flash = "Respaldo exportado.";
  refresh();
}

/* -------------------------------- arranque ------------------------------ */

function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  const register = () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      /* Sin service worker la app sigue funcionando; el cascarón no queda offline. */
    });
  };
  /* El módulo puede ejecutarse después de `load` (boot hace fetch del catálogo),
     así que no basta con escuchar el evento: si ya pasó, se registra ahora. */
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}

async function boot() {
  try {
    storage = getStorage();
  } catch (error) {
    ui.renderFatal(root, error.message);
    return;
  }
  try {
    catalog = await loadCatalog();
  } catch (error) {
    ui.renderFatal(
      root,
      `No se pudo cargar el catálogo de juego. Revisá la conexión y recargá. (${error.message})`
    );
    return;
  }
  refresh();
  registerServiceWorker();
}

boot();
