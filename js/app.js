/**
 * app.js — orquestador de Costa Neón (Fase 2).
 *
 * Responsabilidades:
 *  - dibujar la ciudad (Canvas) y atender cámara/gestos;
 *  - pintar HUD y hojas de distrito desde el save migrado;
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
import { createPlayer } from "./city/player.js";
import { createViewSession } from "./city/view-session.js";
import { buildHud } from "./hud.js";
import { buildDistrictPanel } from "./district-figures.js";
import { renderHud, renderSheet, renderTabs } from "./hud-ui.js";
import { routeForDay } from "../src/gameplay.js";
import { campaignView } from "../src/campaign-state.js";
import { renderCampaign, renderDaily } from "./campaign-ui.js";
import { renderShop } from "./shop-ui.js";
import { equippedLook, shopItem } from "../src/shop.js";
import { DISTRICTS } from "./districts.js";
import { clipsRect } from "./city/layout.js";
import { newPlayerBundle } from "../src/new-player.js";
import {
  TAB_MOCHILA,
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
import { createSyncEngine, createDriveTransport } from "./sync.js";
import { DRIVE_CLIENT_ID } from "./sync-config.js";

const MAX_FILE_BYTES = 25 * 1024 * 1024;

const els = {
  canvas: document.getElementById("city-canvas"),
  hud: document.getElementById("hud"),
  version: document.getElementById("version-badge"),
  toasts: document.getElementById("toasts"),
  floatingImport: document.getElementById("floating-import"),
  phoneBackdrop: document.getElementById("phone-backdrop"),
  phoneHome: document.getElementById("phone-home"),
  phoneMissions: document.getElementById("phone-missions"),
  phoneClock: document.getElementById("phone-clock"),
  phoneHomeBtn: document.getElementById("phone-home-btn"),
  careerBackdrop: document.getElementById("career-backdrop"),
  careerDialog: document.getElementById("career-dialog"),
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
let player = null;
let cityWorld = null;
let walkOn = false;
let walkTabBtn = null;
/* Palanca invisible: dirección de mundo activa mientras el dedo arrastra
   en modo caminar (null = sin dirigir). El destino se renueva cada cuadro
   un tramo por delante del avatar, así camina continuo hasta soltar. */
let steerDir = null;
let steerActive = false;
const STEER_LOOKAHEAD = 600;
/* La dirección efectiva combina dos fuentes: la palanca táctil (touchDir)
   y el teclado de la PC (keyDir, flechas y WASD — pedido de José). El
   teclado manda mientras haya una tecla apretada; al soltarla, vuelve la
   palanca si sigue activa. En el teléfono no hay eventos de teclado, así
   que la versión móvil queda intacta. */
let touchDir = null;
let keyDir = null;
const keysDown = new Set();
const KEY_DIRS = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0]
};

function applySteer() {
  const next = keyDir || touchDir;
  if (next) {
    steerActive = true;
    steerDir = next;
  } else if (steerActive) {
    steerActive = false;
    steerDir = null;
    if (player) player.clearTarget();
  }
}

function keyboardDir() {
  let x = 0;
  let y = 0;
  for (const code of keysDown) {
    const d = KEY_DIRS[code];
    if (d) { x += d[0]; y += d[1]; }
  }
  if (!x && !y) return null;
  const len = Math.hypot(x, y);
  return { ux: x / len, uy: y / len };
}

function setupKeyboardWalk() {
  window.addEventListener("keydown", (event) => {
    if (!walkOn || !KEY_DIRS[event.code]) return;
    const t = event.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    /* Con el modo caminar activo, las flechas mueven al avatar y no la página. */
    if (event.code.startsWith("Arrow")) event.preventDefault();
    if (!keysDown.has(event.code)) {
      keysDown.add(event.code);
      keyDir = keyboardDir();
      applySteer();
    }
  });
  window.addEventListener("keyup", (event) => {
    if (!KEY_DIRS[event.code]) return;
    if (keysDown.delete(event.code)) {
      keyDir = keyboardDir();
      if (walkOn) applySteer();
    }
  });
  /* Si la ventana pierde el foco a mitad de tecla, no dejar al avatar caminando solo. */
  window.addEventListener("blur", () => {
    keysDown.clear();
    keyDir = null;
    if (walkOn) applySteer();
  });
}
let toasts = null;
let updateWatcher = null;
let storageWatcher = null;
let syncEngine = null;
/* Marca del último intento automático de renovación al volver a la app:
   como máximo uno cada 10 minutos, para que entrar y salir del juego
   nunca se convierta en una ráfaga de intentos contra Google. Arranca en
   «ahora» (al cargar el módulo): el intento de arranque ya ocurrió, y el
   visibilitychange que dispara la pantalla de bienvenida al abrir la app
   instalada no debe sumar un segundo inicio de sesión (José: «me lo hace
   dos veces»). */
let lastForegroundSyncTry = Date.now();
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
let careerId = null;
let phoneView = "home";
let careerReturnFocus = null;
let phoneReturnFocus = null;
let campaignWritePending = false;

if (els.version) {
  els.version.textContent = `v${APP_VERSION}`;
  els.version.title = "ODEA 2 · Costa Neón";
}

/* -------------------------------- acciones -------------------------------- */

const actions = {
  startFresh,
  pickFile,
  exportBackup,
  openProgress: () => openCharacter(),
  acceptQuarantine: handleAcceptQuarantine,
  rejectQuarantine: handleRejectQuarantine,
  resetReimport: handleResetReimport,
  restoreConfirm: handleRestore,
  syncConnect: () => syncEngine && syncEngine.connect(),
  syncNow: () => syncEngine && syncEngine.syncNow(),
  syncDisconnect: () => syncEngine && syncEngine.disconnect(),
  syncUseCloud: () => syncEngine && syncEngine.useCloud(),
  syncUseLocal: () => syncEngine && syncEngine.useLocal(),
  cancel: () => {
    flash = null;
    refresh();
  }
};

function startFresh(name) {
  if (!storage || !catalog || bundle) return;
  try {
    if (currentBundle(storage) || pendingQuarantine(storage)) return;
    const result = importBundle(newPlayerBundle(catalog, { name, date: localDateKey() }), {
      storage, catalog, referenceDate: localDateKey()
    });
    if (result.status !== "active") throw new Error("No se pudo inicializar la partida vacía.");
    hideOverlayRaw();
    refresh();
    openCampaign("brete");
  } catch (error) {
    if (toasts) toasts.show(`No se pudo iniciar: ${error.message}`, { tone: "error" });
  }
}

/* --------------------------------- ciudad --------------------------------- */

function setCityActive(active) {
  document.body.dataset.hasSave = active ? "true" : "false";
}

/** Si el teléfono o un panel de pantalla completa tapa la ciudad, el bucle
 *  de dibujo se pausa: dibujarla detrás es quemar CPU y batería (v0.21.0).
 *  La hoja de distrito NO cuenta: es parcial y la ciudad se sigue viendo. */
function syncCityCover() {
  if (!city) return;
  const covered =
    (els.phoneBackdrop && !els.phoneBackdrop.hidden) || overlayOpen;
  city.setCovered(covered);
}

function initCity() {
  if (!els.canvas) return;
  try {
    const world = buildWorld();
    cityWorld = world;
    player = createPlayer(world.playerStart);
    city = createCityView({
      canvas: els.canvas,
      world,
      onSelectDistrict: openDistrict,
      onFrame: (dt) => {
        if (player && city) {
          if (walkOn && steerDir && cityWorld) {
            const st = player.state();
            const s = cityWorld.size;
            player.setTarget(
              Math.max(-s * 0.04, Math.min(s * 1.04, st.x + steerDir.ux * STEER_LOOKAHEAD)),
              Math.max(-s * 0.04, Math.min(s * 1.04, st.y + steerDir.uy * STEER_LOOKAHEAD))
            );
          }
          const pst = player.update(dt, cityWorld ? cityWorld.buildings : []);
          pst.look = bundle ? equippedLook(bundle) : null;
          city.setPlayer(pst);
        }
      },
      onSteer: (dir) => {
        touchDir = dir;
        applySteer();
      },
      onTapWorld: (pt) => {
        if (!walkOn || !player || !cityWorld) return;
        const s = cityWorld.size;
        player.setTarget(
          Math.max(-s * 0.04, Math.min(s * 1.04, pt.x)),
          Math.max(-s * 0.04, Math.min(s * 1.04, pt.y))
        );
      }
    });
    viewSession = createViewSession(city.camera);
    setupKeyboardWalk();
  } catch (error) {
    document.body.classList.add("no-city");
    if (els.canvas) els.canvas.hidden = true;
  }
}

function setWalk(on) {
  walkOn = !!on;
  if (!walkOn) {
    /* Al salir del modo caminar el avatar se detiene donde quedó. */
    steerDir = null;
    steerActive = false;
    touchDir = null;
    keyDir = null;
    keysDown.clear();
    if (player) player.clearTarget();
  }
  if (city) city.setWalkMode(walkOn);
  if (walkTabBtn) {
    walkTabBtn.classList.toggle("on", walkOn);
    walkTabBtn.setAttribute("aria-pressed", walkOn ? "true" : "false");
    const icon = walkTabBtn.querySelector(".tab-icon");
    const label = walkTabBtn.querySelector(".tab-label");
    if (icon) icon.textContent = walkOn ? "⏹" : "🚶";
    if (label) label.textContent = walkOn ? "Parar" : "Caminar";
  }
  if (walkOn && player && city) {
    const st = player.state();
    city.camera.jumpTo(st.x, st.y + 12, city.camera.clampZoom(1));
  }
}

function openDistrict(id) {
  if (id === "gamer" || id === "empleo") {
    closePhone();
    openCampaign(id === "gamer" ? "gamer" : "brete");
    return;
  }
  if (id === "mercado") {
    /* La manzana de la Tienda abre la Tienda (pedido de José): el panel
       completo para comprar, con la escena de la tienda de fondo. El panel
       de cifras del Mercado queda a un botón dentro de la tienda. */
    openShopStandalone();
    return;
  }
  openDistrictArchive(id);
}

/** The migrated employment missions remain accessible as a separate archive. */
function openDistrictArchive(id) {
  if (walkOn) setWalk(false);
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

/* --------------------------------- Tienda -------------------------------- */

function afterShop(result, okMessage, duplicateMessage) {
  if (result.status === "rejected") {
    const code = result.error && result.error.code;
    const friendly =
      code === "INSUFFICIENT_FUNDS" ? "Te faltan ₡ para eso."
      : code === "NOT_OWNED" ? "Todavía no tenés ese ítem."
      : `No se pudo guardar: ${code}`;
    if (toasts) toasts.show(friendly, { tone: "error" });
    return;
  }
  if (result.status === "duplicate") {
    if (toasts) toasts.show(duplicateMessage, { tone: "info" });
  } else if (toasts) {
    toasts.show(okMessage, { tone: "ok" });
  }
  refresh();
  if (phoneView === "tienda" && !els.phoneBackdrop.hidden) showPhoneShop();
  if (shopStandalone) renderStandaloneShop();
}

function buyShopItem(itemId) {
  if (!storage || !catalog) return;
  const item = shopItem(itemId);
  return applyGameplayMutationLocked(
    storage, catalog, { type: "shop.buy", itemId }, gameplayDate()
  ).then((result) =>
    afterShop(result, `Comprado: ${item ? item.name : "ítem"}. Ya quedó equipado.`, "Ya tenías ese ítem.")
  );
}

function equipShopItem(itemId) {
  if (!storage || !catalog) return;
  const item = itemId ? shopItem(itemId) : null;
  return applyGameplayMutationLocked(
    storage, catalog, { type: "shop.equip", itemId }, gameplayDate()
  ).then((result) =>
    afterShop(
      result,
      itemId === null ? "A pie, como siempre." : `Equipado: ${item ? item.name : "ítem"}.`,
      "Eso ya estaba equipado."
    )
  );
}

function showPhoneShop() {
  if (!els.phoneMissions || !bundle || !catalog) return;
  phoneView = "tienda";
  els.phoneMissions.classList.remove("is-campaign");
  if (els.phoneHome) els.phoneHome.hidden = true;
  els.phoneMissions.hidden = false;
  renderShop(els.phoneMissions, {
    bundle,
    actions: {
      buy: (itemId) => buyShopItem(itemId),
      equip: (itemId) => equipShopItem(itemId),
      onBack: () => showPhoneHome()
    }
  });
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
  if (sheetOpen && sheetDistrictId) openDistrictArchive(sheetDistrictId);
  if (phoneView === "missions" && !els.phoneBackdrop.hidden) showPhoneMissions();
  if (phoneView === "diarias" && !els.phoneBackdrop.hidden) renderActiveDaily();
}

/* ------------------------ campañas: un solo estado ----------------------- */

function openCampaign(id, inPhone = false) {
  if (!bundle || !catalog || !campaignView(bundle, id)) return;
  dailyStandalone = false;
  shopStandalone = false;
  if (walkOn) setWalk(false);
  if (viewSession) viewSession.capture();
  hideSheetRaw();
  hideOverlayRaw();
  if (inPhone) {
    careerId = null;
    phoneView = id;
    els.phoneHome.hidden = true;
    els.phoneMissions.hidden = false;
    els.phoneMissions.classList.add("is-campaign");
  } else {
    closePhone();
    careerReturnFocus = document.activeElement;
    careerId = id;
    els.careerBackdrop.hidden = false;
    els.careerDialog.focus({ preventScroll: true });
  }
  if (city) {
    if (id === "brete") city.focusDistrict("empleo");
    else {
      const r = clipsRect();
      city.camera.jumpTo(r.x + r.w / 2, r.y + r.h / 2, city.camera.clampZoom(0.8));
    }
  }
  renderActiveCampaign();
}

function closeCampaign() {
  if (!careerId) return;
  careerId = null;
  els.careerBackdrop.hidden = true;
  if (viewSession) viewSession.restore();
  setTab(TAB_CITY);
  if (careerReturnFocus && document.contains(careerReturnFocus)) careerReturnFocus.focus({ preventScroll: true });
  careerReturnFocus = null;
}

function renderActiveCampaign() {
  const inPhone = !els.phoneBackdrop.hidden && ["brete", "gamer"].includes(phoneView);
  const id = inPhone ? phoneView : careerId;
  if (!id || !bundle) return;
  const root = inPhone ? els.phoneMissions : els.careerDialog;
  const view = campaignView(bundle, id);
  renderCampaign(root, {
    view, compact: inPhone,
    onBack: () => inPhone ? showPhoneHome() : closeCampaign(),
    onComplete: (missionId, evidence) => saveCampaignAction({ type: "campaign.complete", missionId, evidence }),
    onApply: (details) => saveCampaignAction({
      type: "application.record", ...details,
      requestId: globalThis.crypto?.randomUUID?.() || `application_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      expectedCount: view.applications.count
    })
  });
  if (id === "brete") {
    const archive = phoneEl("button", "campaign-archive", "Ver misiones de empleo heredadas de ODEA 1");
    archive.type = "button";
    archive.addEventListener("click", () => {
      closeCampaign();
      closePhone();
      openDistrictArchive("empleo");
    });
    root.append(archive);
  }
}

/* --------------------- Misiones Diarias (v0.19.0) -----------------------
   La ruta del día como un bloque más del sistema de campañas, dentro del
   teléfono: misma escena de cabecera, mismo expediente, misma mecánica de
   tarjetas — ajustado a la esencia diaria (un toque para completar). */

function openDaily() {
  if (!bundle || !catalog) return;
  if (walkOn) setWalk(false);
  phoneView = "diarias";
  els.phoneHome.hidden = true;
  els.phoneMissions.hidden = false;
  els.phoneMissions.classList.add("is-campaign");
  renderActiveDaily();
}

/* El panel de Diarias se pinta igual en sus dos casas (el teléfono y la
   pestaña «Hoy»): mismo root intercambiable, misma ruta, mismo registro. */
function paintDaily(root, { compact, onBack }) {
  const route = routeForDay(bundle, catalog);
  renderDaily(root, {
    compact,
    view: {
      day: route.catalogDay,
      date: route.date,
      missions: route.missions
    },
    onBack,
    onComplete: async (missionId) => {
      await completeMission(missionId, "hub");
      const fresh = routeForDay(bundle, catalog);
      const doneNow = fresh.missions.find((m) => m.id === missionId)?.completed;
      paintDaily(root, { compact, onBack });
      return doneNow
        ? { ok: true, message: "¡Misión registrada! Cada paso cuenta." }
        : { ok: false, message: "No se pudo registrar la misión. Intentá de nuevo." };
    }
  });
}

function renderActiveDaily() {
  if (phoneView !== "diarias" || !bundle || !catalog) return;
  paintDaily(els.phoneMissions, { compact: true, onBack: () => showPhoneMissions() });
}

/* «Hoy» (pedido de José): el MISMO panel de Diarias del teléfono, a un
   toque desde la barra inferior, sin abrir el teléfono. Vive en la capa
   de campañas (careerDialog) con su propia bandera de estado. */
let dailyStandalone = false;

function openDailyStandalone() {
  if (!bundle || !catalog) return;
  if (walkOn) setWalk(false);
  if (viewSession) viewSession.capture();
  hideSheetRaw();
  hideOverlayRaw();
  closePhone();
  careerId = null;
  shopStandalone = false;
  careerReturnFocus = document.activeElement;
  dailyStandalone = true;
  els.careerBackdrop.hidden = false;
  els.careerDialog.focus({ preventScroll: true });
  renderStandaloneDaily();
}

function renderStandaloneDaily() {
  if (!dailyStandalone || !bundle || !catalog) return;
  paintDaily(els.careerDialog, { compact: false, onBack: () => closeDailyStandalone() });
}

function closeDailyStandalone() {
  if (!dailyStandalone) return;
  dailyStandalone = false;
  els.careerBackdrop.hidden = true;
  if (viewSession) viewSession.restore();
  setTab(TAB_CITY);
  if (careerReturnFocus && document.contains(careerReturnFocus)) careerReturnFocus.focus({ preventScroll: true });
  careerReturnFocus = null;
}

/* La Tienda desde su manzana (pedido de José): el mismo panel de compras
   del teléfono, en la capa de campañas y con la escena de la tienda de
   fondo. El panel de cifras del Mercado se abre desde adentro. */
let shopStandalone = false;

function openShopStandalone() {
  if (!bundle || !catalog) return;
  if (walkOn) setWalk(false);
  if (viewSession) viewSession.capture();
  hideSheetRaw();
  hideOverlayRaw();
  closePhone();
  careerId = null;
  dailyStandalone = false;
  careerReturnFocus = document.activeElement;
  shopStandalone = true;
  els.careerBackdrop.hidden = false;
  els.careerDialog.focus({ preventScroll: true });
  renderStandaloneShop();
}

function renderStandaloneShop() {
  if (!shopStandalone || !bundle || !catalog) return;
  renderShop(els.careerDialog, {
    bundle,
    standalone: true,
    actions: {
      buy: (itemId) => buyShopItem(itemId),
      equip: (itemId) => equipShopItem(itemId),
      onBack: () => closeShopStandalone(),
      onDistrict: () => {
        closeShopStandalone();
        openDistrictArchive("mercado");
      }
    }
  });
}

function closeShopStandalone() {
  if (!shopStandalone) return;
  shopStandalone = false;
  els.careerBackdrop.hidden = true;
  if (viewSession) viewSession.restore();
  setTab(TAB_CITY);
  if (careerReturnFocus && document.contains(careerReturnFocus)) careerReturnFocus.focus({ preventScroll: true });
  careerReturnFocus = null;
}

async function saveCampaignAction(mutation) {
  if (campaignWritePending) return { ok: false, message: "Ya hay un registro en curso." };
  campaignWritePending = true;
  try {
    const result = await applyGameplayMutationLocked(storage, catalog, mutation, gameplayDate());
    if (result.status !== "applied") {
      const messages = {
        EVIDENCE_REQUIRED: "Contá qué hiciste o pegá el enlace de tu entregable (mínimo 12 caracteres).",
        MISSION_LOCKED: "Primero completá la misión anterior.",
        STALE_APPLICATION_COUNT: "El contador cambió en otra pantalla. Ya lo actualizamos; revisalo y volvé a registrar.",
        TOO_FAST: "Esperá un instante antes de registrar otra postulación.",
        QUOTA_EXCEEDED: "No hay espacio para guardar. Exportá un respaldo y liberá espacio antes de continuar.",
        CONCURRENT_CHANGE: "Otra pestaña cambió el progreso. Revisá el contador antes de volver a registrar."
      };
      refresh();
      setTimeout(renderActiveCampaign, 1100);
      return { ok: false, message: messages[result.error?.code] ||
        (result.status === "duplicate" ? "Ese registro ya estaba guardado; no se pagó otra vez." :
          `No se pudo guardar (${result.error?.code || "error"}). No se otorgaron premios.`) };
    }
    refresh();
    // Let the successful shot/reward animation finish before rebuilding the shared view.
    setTimeout(renderActiveCampaign, mutation.type === "application.record" ? 950 : 500);
    return { ok: true, message: mutation.type === "application.record" ?
      "Postulación registrada: +25 XP y +2 monedas del juego." : "Misión guardada. Recompensa añadida al HUD." };
  } catch (error) {
    return { ok: false, message: "No se pudo guardar. Tu progreso anterior sigue intacto; exportá un respaldo y reintentá." };
  } finally {
    campaignWritePending = false;
  }
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
  renderTabs(els.tabbar, { active: activeTab, onSelect: selectTab, exclude: [TAB_MENU] });
  mountPhoneTabButton();
  mountWalkTabButton();
}

/** Caminar vive en la barra, en el puesto que dejó Menú (v0.19.0, pedido
 *  de José): el botón flotante estorbaba sobre el mapa en su teléfono.
 *  Menú no desaparece: sigue abriéndose desde Ajustes del teléfono. */
function mountWalkTabButton() {
  if (!els.tabbar || els.tabbar.querySelector(".walk-tab")) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "tab walk-tab";
  btn.setAttribute("aria-label", "Caminar por la ciudad: tocá para caminar, tocá de nuevo para parar");
  btn.setAttribute("aria-pressed", "false");
  const icon = document.createElement("span");
  icon.className = "tab-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "🚶";
  const label = document.createElement("span");
  label.className = "tab-label";
  label.textContent = "Caminar";
  btn.append(icon, label);
  btn.addEventListener("click", () => {
    if (walkOn) { setWalk(false); return; }
    closePhone();
    selectTab(TAB_CITY);
    setWalk(true);
  });
  els.tabbar.append(btn);
  walkTabBtn = btn;
}

/** El Teléfono vive en el centro de la barra, pero NO es una pestaña:
 *  abre una capa (el teléfono) sobre la ciudad. */
function mountPhoneTabButton() {
  if (!els.tabbar || els.tabbar.querySelector(".phone-tab")) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "tab phone-tab";
  btn.setAttribute("aria-label", "Abrir el teléfono: misiones y opciones");
  const icon = document.createElement("span");
  icon.className = "tab-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "📱";
  const label = document.createElement("span");
  label.className = "tab-label";
  label.textContent = "Teléfono";
  btn.append(icon, label);
  btn.addEventListener("click", openPhone);
  els.tabbar.insertBefore(btn, els.tabbar.children[2] || null);
}

/* ------------------------------- teléfono ------------------------------- */

function phoneEl(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function updatePhoneClock() {
  if (!els.phoneClock) return;
  const d = new Date();
  els.phoneClock.textContent =
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function openPhone() {
  if (!bundle || !catalog || !els.phoneBackdrop) return;
  if (walkOn) setWalk(false);
  closeCampaign();
  hideOverlayRaw();
  phoneReturnFocus = document.activeElement;
  hideSheetRaw();
  els.phoneBackdrop.hidden = false;
  requestAnimationFrame(() => els.phoneBackdrop.classList.add("is-open"));
  showPhoneHome();
  updatePhoneClock();
  syncCityCover();
  const first = els.phoneHome.querySelector("button");
  if (first) first.focus({ preventScroll: true });
}

function closePhone() {
  if (!els.phoneBackdrop) return;
  const wasOpen = !els.phoneBackdrop.hidden;
  els.phoneBackdrop.classList.remove("is-open");
  els.phoneBackdrop.hidden = true;
  phoneView = "home";
  syncCityCover();
  if (wasOpen && viewSession) viewSession.restore();
  if (wasOpen && phoneReturnFocus && document.contains(phoneReturnFocus)) phoneReturnFocus.focus({ preventScroll: true });
  phoneReturnFocus = null;
}

function showPhoneHome() {
  phoneView = "home";
  els.phoneMissions?.classList.remove("is-campaign");
  if (els.phoneHome) els.phoneHome.hidden = false;
  if (els.phoneMissions) els.phoneMissions.hidden = true;
}

function showPhoneMissions() {
  if (!els.phoneMissions || !bundle || !catalog) return;
  const route = routeForDay(bundle, catalog);
  phoneView = "missions";
  els.phoneMissions.classList.remove("is-campaign");
  const root = els.phoneMissions;
  root.replaceChildren();
  root.append(phoneEl("h3", "phone-screen-title", "Misiones"));
  root.append(phoneEl("p", "phone-screen-sub", `Ruta de hoy · Día ${route.catalogDay} de 56 · tu plan personal`));
  /* v0.19.0 (pedido de José): la ruta diaria es un bloque más del MISMO
     sistema de campañas — su propia pantalla con escena, progreso y
     expediente de misiones, igual a El Brete y Zona Gamer. */
  const dailyDone = route.missions.filter((m) => m.completed).length;
  const dailyTotal = route.missions.length;
  const dailyBtn = phoneEl("button", "campaign-phone-route",
    `Misiones Diarias · Día ${route.catalogDay} · ${dailyDone}/${dailyTotal}${dailyTotal ? ` · ${Math.round((dailyDone / dailyTotal) * 100)}%` : ""}`);
  dailyBtn.type = "button";
  dailyBtn.addEventListener("click", () => openDaily());
  root.append(dailyBtn);
  root.append(phoneEl("h4", "phone-screen-group", "Tus campañas profesionales"));
  for (const id of ["brete", "gamer"]) {
    const view = campaignView(bundle, id);
    const button = phoneEl("button", "campaign-phone-route", `${view.name} · ${view.done}/${view.total} · ${view.percent}%`);
    button.type = "button";
    button.addEventListener("click", () => openCampaign(id, true));
    root.append(button);
  }
  if (els.phoneHome) els.phoneHome.hidden = true;
  root.hidden = false;
}

function showPhoneMap() {
  phoneView = "map";
  els.phoneMissions.classList.remove("is-campaign");
  els.phoneHome.hidden = true;
  const root = els.phoneMissions;
  root.hidden = false;
  root.replaceChildren(phoneEl("h3", "phone-screen-title", "Destinos de Costa Neón"),
    phoneEl("p", "phone-screen-sub", "Elegí un destino. Se abre su localización en el mapa."));
  for (const destination of [{ id: "gamer", name: "Zona Gamer · Estudio de clips" },
    ...DISTRICTS.map((d) => ({ id: d.id, name: d.id === "empleo" ? "El Brete · Analista de datos" : d.name }))]) {
    const button = phoneEl("button", "campaign-phone-route", destination.name);
    button.type = "button";
    button.addEventListener("click", () => {
      closePhone();
      openDistrict(destination.id);
    });
    root.append(button);
  }
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
    /* «Hoy» abre el panel de Misiones Diarias tal cual vive en el teléfono
       (pedido de José): la misma interfaz, a un toque desde la barra. */
    hideOverlayRaw();
    setTab(TAB_TODAY);
    openDailyStandalone();
    return;
  }

  hideSheetRaw();
  /* Salir de la hoja por la barra también termina el recorrido del distrito. */
  if (viewSession) viewSession.restore();
  setTab(tab);
  if (tab === TAB_MOCHILA) openCharacter();
  else openMenu();
}

/* -------------------------------- overlay -------------------------------- */

function showOverlay() {
  if (!overlayOpen) lastFocus = document.activeElement;
  overlayOpen = true;
  els.overlay.hidden = false;
  document.body.classList.add("overlay-open");
  syncCityCover();
  const first = focusablesIn(els.overlay)[0];
  if (first) first.focus({ preventScroll: true });
}

/** Oculta el overlay sin tocar la pestaña activa ni el foco. */
function hideOverlayRaw() {
  overlayOpen = false;
  overlayMode = null;
  els.overlay.hidden = true;
  document.body.classList.remove("overlay-open");
  syncCityCover();
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
  ui.renderMenu(els.overlayContent, {
    version: APP_VERSION,
    actions,
    sync: syncEngine ? syncEngine.getState() : null
  });
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
      ui.renderMenu(els.overlayContent, {
        version: APP_VERSION,
        actions,
        sync: syncEngine ? syncEngine.getState() : null
      });
    }
    return;
  }

  setCityActive(false);
  if (city) {
    city.setPlayerVisible(false);
    city.setCredit(null);
    city.clearSelection();
  }
  setWalk(false);
  applyAmbience();
  els.hud.hidden = true;
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
    ui.renderEmpty(els.overlayContent, actions, syncEngine ? syncEngine.getState() : null);
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
      renderActiveCampaign();
      if (phoneView === "missions" && !els.phoneBackdrop.hidden) showPhoneMissions();
      if (phoneView === "diarias" && !els.phoneBackdrop.hidden) renderActiveDaily();
      if (dailyStandalone) renderStandaloneDaily();
      if (shopStandalone) renderStandaloneShop();
      if (toasts) {
        toasts.show("Tu progreso cambió en otra pestaña", {
          tone: "info",
          key: "remote"
        });
      }
    }
  });
}

/* --------------------------- sincronización Drive -------------------------- */

/**
 * La sincronización es opcional y nunca bloquea el arranque: el motor se
 * crea con el storage y el catálogo ya listos, intenta conciliar en segundo
 * plano si estaba activada, y observa cambios del save cada 5 s para subir.
 * Bajar una copia pasa por restoreBundle (valida y respalda antes de
 * escribir), la misma ruta que restaurar un respaldo a mano.
 */
function setupSync() {
  const transport = DRIVE_CLIENT_ID ? createDriveTransport({ clientId: DRIVE_CLIENT_ID }) : null;
  syncEngine = createSyncEngine({
    storage,
    transport,
    readRawSave: () => {
      const current = currentBundle(storage);
      return current ? JSON.stringify(current) : null;
    },
    applySave: (text) => {
      let data;
      try {
        data = JSON.parse(text);
      } catch (error) {
        throw new Error("La copia de Drive no es un respaldo válido.");
      }
      restoreBundle(data, { catalog, storage });
    },
    onState: () => {
      if (overlayOpen && overlayMode === "menu") {
        ui.renderMenu(els.overlayContent, {
          version: APP_VERSION,
          actions,
          sync: syncEngine.getState()
        });
      } else if (!bundle && overlayOpen) {
        /* La pantalla sin partida muestra el estado de la recuperación. */
        refresh();
      }
    },
    onPulled: ({ conflict }) => {
      closeSheet();
      refresh();
      if (toasts) {
        toasts.show(
          conflict
            ? "Conflicto resuelto: se aplicó la copia de Drive y la de este aparato quedó guardada en Drive."
            : "Progreso sincronizado desde Drive.",
          { tone: "ok" }
        );
      }
    }
  });
  syncEngine.init();
  setInterval(() => syncEngine.notifyChanged(), 5000);
  window.addEventListener("online", () => syncEngine.syncNow());
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
  if (els.phoneHomeBtn) {
    els.phoneHomeBtn.addEventListener("click", () => {
      if (els.phoneMissions && !els.phoneMissions.hidden) showPhoneHome();
      else closePhone();
    });
  }
  if (els.phoneBackdrop) {
    els.phoneBackdrop.addEventListener("click", (event) => {
      if (event.target === els.phoneBackdrop) closePhone();
    });
  }
  if (els.careerBackdrop) {
    els.careerBackdrop.addEventListener("click", (event) => {
      if (event.target === els.careerBackdrop) {
        if (dailyStandalone) closeDailyStandalone();
        else if (shopStandalone) closeShopStandalone();
        else closeCampaign();
      }
    });
  }
  if (els.phoneHome) {
    for (const appBtn of els.phoneHome.querySelectorAll(".phone-app")) {
      appBtn.addEventListener("click", () => {
        const app = appBtn.dataset.app;
        if (app === "missions") showPhoneMissions();
        else if (app === "brete" || app === "gamer") openCampaign(app, true);
        else if (app === "tienda") showPhoneShop();
        else if (app === "map") showPhoneMap();
        else if (app === "bag") { closePhone(); selectTab(TAB_MOCHILA); }
        else if (app === "gear") { closePhone(); selectTab(TAB_MENU); }
      });
    }
  }
  if (els.floatingImport) {
    els.floatingImport.addEventListener("click", () => openOverlay("Importá tu progreso"));
  }
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (careerId) closeCampaign();
      else if (dailyStandalone) closeDailyStandalone();
      else if (shopStandalone) closeShopStandalone();
      else if (!els.phoneBackdrop.hidden) closePhone();
      else if (sheetOpen) closeSheet();
      else if (overlayOpen) closeOverlay();
      return;
    }
    /* El foco no se escapa de la capa superior mientras esté abierta. */
    if (careerId || dailyStandalone || shopStandalone) trapTab(event, els.careerDialog);
    else if (!els.phoneBackdrop.hidden) trapTab(event, els.phoneBackdrop);
    else if (sheetOpen) trapTab(event, els.sheet);
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

  refresh();
  setupSync();
  setupServiceWorker();

  /* La luz depende de la hora: se revisa cada 5 minutos y al volver a la app,
     porque un teléfono puede quedar en segundo plano toda la tarde. */
  setInterval(applyAmbience, 5 * 60 * 1000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      applyAmbience();
      /* Si la sesión de Google quedó esperando reconexión, al volver a la
         app se intenta renovar EN SILENCIO (prompt "none": sin ninguna
         pantalla de inicio de sesión), como máximo una vez cada 10
         minutos. Si Google no renueva solo, el juego se queda tranquilo:
         la reconexión manual vive en el Menú, cuando José la quiera. */
      if (
        syncEngine &&
        syncEngine.getState().status === "needsReconnect" &&
        Date.now() - lastForegroundSyncTry > 10 * 60 * 1000
      ) {
        lastForegroundSyncTry = Date.now();
        syncEngine.syncNow();
      }
    }
  });
}

boot();
