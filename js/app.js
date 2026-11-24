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
import { deriveStreak, localDateKey } from "../src/derive.js";
import * as ui from "./ui.js";
import { buildWorld } from "./city/world.js";
import { createCityView } from "./city/engine.js";
import { createPlayer } from "./city/player.js";
import { createViewSession } from "./city/view-session.js";
import { buildHud } from "./hud.js";
import { buildDistrictPanel } from "./district-figures.js";
import { renderHud, renderSheet, renderTabs } from "./hud-ui.js";
import { recentStreakDays, routeForDay } from "../src/gameplay.js";
import { campaignStateOf, campaignView } from "../src/campaign-state.js";
import { CAMPAIGNS, CAMPAIGN_MISSIONS } from "../src/campaigns.js";
import { garageView } from "../src/garage-state.js";
import { ianView } from "../src/ian-state.js";
import { marcaView } from "../src/marca-state.js";
import { buildProgressSummary, dailyPlanView, jarvisView } from "../src/jarvis-state.js";
import { newJarvisRequestId } from "../src/jarvis-actions.js";
import { libretaView } from "../src/libreta-state.js";
import { renderCampaign, renderDaily } from "./campaign-ui.js";
import { renderContrato } from "./contrato-ui.js";
import { contratoView } from "../src/contrato-state.js";
import {
  coverCandidate, milestoneReachDate, rachaView, shieldInventory,
  RACHA_MILESTONES
} from "../src/racha-state.js";
import { renderGarage } from "./garage-ui.js";
import { renderIan } from "./ian-ui.js";
import { renderMarca } from "./marca-ui.js";
import { renderJarvis } from "./jarvis-ui.js";
import { renderShop } from "./shop-ui.js";
import { renderInventory } from "./inventory-ui.js";
import { nearestCollectible, paquetesView } from "../src/paquetes-state.js";
import { legendarioView } from "../src/legendario-state.js";
import { renderLibreta } from "./libreta-ui.js";
import { fmt } from "./format.js";
import { equippedLook, shopItem } from "../src/shop.js";
import { DISTRICTS } from "./districts.js";
import { academiaRect, cellRect, clipsRect, eventosRect, jarvisRect, marcaRect, mundoianRect, pointInRect, sabiduriaRect, zonaiaRect } from "./city/layout.js";
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
let garageOpen = false;
let garageWritePending = false;
let ianOpen = false;
let ianWritePending = false;
let marcaOpen = false;
let marcaWritePending = false;
let jarvisOpen = false;
let jarvisWritePending = false;
let libretaUi = { mode: "list", noteId: null };
let libretaWritePending = false;

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
          /* Paquetes Neón (v0.48.0): recolección por PROXIMIDAD en el
             mismo tick — sin temporizadores nuevos, solo se lee la
             posición que el motor ya calculó. Pasar por encima de un
             cassette sin recoger dispara su mutación (una a la vez). */
          maybeCollectPaquete(pst);
        }
      },
      onSteer: (dir) => {
        touchDir = dir;
        applySteer();
      },
      onTapWorld: (pt) => {
        if (!walkOn || !player || !cityWorld) return;
        /* Jarvis (v0.38.0): caminando, tocar al robotcito abre su diálogo
           en vez de fijar el destino, igual que en el modo explorar. */
        if (pointInRect(jarvisRect(), pt.x, pt.y)) { openDistrict("jarvis"); return; }
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
    if (icon) icon.replaceChildren(tabIconImg(walkOn ? "assets/tab-parar.svg" : "assets/tab-caminar.svg"));
    if (label) label.textContent = walkOn ? "Parar" : "Caminar";
  }
  if (walkOn && player && city) {
    const st = player.state();
    city.camera.jumpTo(st.x, st.y + 12, city.camera.clampZoom(1));
  }
}

function openDistrict(id) {
  if (id === "jarvis") {
    /* El robotcito de la Zona IA abre su diálogo de compañero: saludo
       del día, quiz con XP acotado, chat y revisión de evidencias. La
       campaña de la manzana queda a un botón dentro del diálogo. */
    closePhone();
    openJarvis();
    return;
  }
  if (id === "academia") {
    /* La manzana de la universidad abre la Academia: la campaña de
       certificaciones portada de ODEA 1, en el panel de campañas. */
    closePhone();
    openCampaign("academia");
    return;
  }
  if (id === "zonaia") {
    /* La manzana de la base de IA abre la Zona IA: la campaña de las 48
       misiones del plan «Construir agentes de IA con criterio
       profesional», en el panel de campañas. */
    closePhone();
    openCampaign("zonaia");
    return;
  }
  if (id === "sabiduria") {
    /* La manzana del Mirador de Sagas abre Sabiduría Práctica: la
       campaña de las 60 misiones del PDF «Sabiduría para vivir con
       criterio», en el panel de campañas; la ficha del distrito
       Mirador (sagas y jefes) queda accesible desde el propio panel. */
    closePhone();
    openCampaign("sabiduria");
    return;
  }
  if (id === "mundoian") {
    /* La manzana sureste del Hub abre El Mundo de Ian VIVO: las 54
       misiones de la ruta de Ian Daniel (valores, curiosidad,
       responsabilidad, emociones, cuerpo, familia, creación, sueños y
       juego con papá), TODAS desbloqueadas con el sistema del Garaje:
       las de juego y hábito se repiten por ciclo y los proyectos se
       hacen una sola vez; la ficha del Hub queda accesible desde el
       propio panel. */
    closePhone();
    openIan();
    return;
  }
  if (id === "eventos") {
    /* La manzana del estadio abre el evento vigente (hoy Operación
       Confirmación, el proyecto de WhatsApp de José) en el panel de campañas. */
    closePhone();
    openCampaign("whatsapp");
    return;
  }
  if (id === "gamer" || id === "empleo") {
    closePhone();
    openCampaign(id === "gamer" ? "gamer" : "brete");
    return;
  }
  if (id === "garaje") {
    /* La manzana del Garaje abre el Garaje vivo (pedido de José): la misma
       interfaz de misiones, pero lista corrida sin capítulos, reloj por
       rutina y registro de kilometraje. El panel de cifras del distrito
       queda a un botón dentro, como el archivo de Empleo en El Brete. */
    closePhone();
    openGarage();
    return;
  }
  if (id === "vida" || id === "marca") {
    /* La manzana de Barrio Vida abre el ESTUDIO NEÓN (decisión de José,
       2026-11-22): el estudio de la marca personal ocupa el bloque
       entero, sin botón de convivencia. La ficha del distrito vida y
       sus misiones dejan de abrirse desde aquí; sus datos y su XP
       quedan intactos en el save, solo que sin venue. */
    closePhone();
    openMarca();
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
  if (phoneView === "inventario" && !els.phoneBackdrop.hidden) showPhoneInventory();
  if (inventoryStandalone) renderStandaloneInventory();
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

/* ------------------- Recompensas Reales (v0.45.0) --------------------
   El canje SIEMPRE pide confirmación con el saldo resultante antes de
   disparar la mutación (requisito del diseño §2.4): CANJEAR solo abre
   la confirmación; «Sí, canjear» genera un requestId fresco y canjea. */

let realesConfirm = null;

function rerenderShopHouses() {
  if (phoneView === "tienda" && !els.phoneBackdrop.hidden) showPhoneShop();
  if (shopStandalone) renderStandaloneShop();
}

function afterReales(result, okMessage, duplicateMessage) {
  if (result.status === "rejected") {
    const code = result.error && result.error.code;
    if (toasts) toasts.show(`No se pudo guardar: ${code}`, { tone: "error" });
    rerenderShopHouses();
    return;
  }
  if (result.status === "duplicate") {
    if (toasts) toasts.show(duplicateMessage, { tone: "info" });
  } else if (toasts) {
    toasts.show(okMessage, { tone: "ok" });
  }
  refresh();
  rerenderShopHouses();
}

function realesRequestId() {
  return `rq-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function askRedeemReales(item) {
  realesConfirm = { id: item.id, n: item.n, price: item.price };
  rerenderShopHouses();
}

function cancelRedeemReales() {
  realesConfirm = null;
  rerenderShopHouses();
}

function confirmRedeemReales() {
  if (!storage || !catalog || !realesConfirm) return;
  const reward = realesConfirm;
  realesConfirm = null;
  const balance = Number(bundle && bundle.core && bundle.core.derived && bundle.core.derived.coins && bundle.core.derived.coins.balance) || 0;
  if (balance < reward.price) {
    if (toasts) toasts.show(`🪙 No te alcanza — Te faltan ₡${fmt(reward.price - balance)} para "${reward.n}".`, { tone: "error" });
    rerenderShopHouses();
    return;
  }
  return applyGameplayMutationLocked(
    storage, catalog,
    { type: "reales.redeem", rewardId: reward.id, requestId: realesRequestId() },
    gameplayDate()
  ).then((result) => {
    if (result.status === "rejected" && result.error && result.error.code === "INSUFFICIENT_FUNDS") {
      const bal = Number(bundle && bundle.core && bundle.core.derived && bundle.core.derived.coins && bundle.core.derived.coins.balance) || 0;
      if (toasts) toasts.show(`🪙 No te alcanza — Te faltan ₡${fmt(Math.max(0, reward.price - bal))} para "${reward.n}".`, { tone: "error" });
      rerenderShopHouses();
      return;
    }
    afterReales(
      result,
      `🎁 ¡Recompensa canjeada! — "${reward.n}" quedó en tu lista por disfrutar. ¡Te la ganaste!`,
      "Ese canje ya estaba registrado."
    );
  });
}

function enjoyReales(key) {
  if (!storage || !catalog) return;
  return applyGameplayMutationLocked(
    storage, catalog, { type: "reales.enjoy", key }, gameplayDate()
  ).then((result) => afterReales(result, "✅ ¡Que la hayás disfrutado!", "Ya estaba marcada como disfrutada."));
}

function removeReales(rewardId) {
  if (!storage || !catalog) return;
  return applyGameplayMutationLocked(
    storage, catalog, { type: "reales.delete", rewardId }, gameplayDate()
  ).then((result) => afterReales(result, "Recompensa borrada de tu lista.", "Esa recompensa ya no estaba en tu lista."));
}

function createReales({ n, ico, price }) {
  if (!storage || !catalog) return;
  const name = String(n || "").trim();
  if (!name) {
    if (toasts) toasts.show("🎁 Falta el nombre — Escribí qué recompensa querés crear.", { tone: "error" });
    return;
  }
  if (!Number.isInteger(price) || price < 1 || price > 999) {
    if (toasts) toasts.show("🎁 Precio inválido — Poné un precio entre ₡1 y ₡999.", { tone: "error" });
    return;
  }
  return applyGameplayMutationLocked(
    storage, catalog, { type: "reales.create", n: name, ico: String(ico || "").trim(), price }, gameplayDate()
  ).then((result) => afterReales(
    result,
    `🎁 Recompensa creada — "${name}" por ₡${fmt(price)}. ¡A ganársela!`,
    "Esa recompensa ya estaba creada."
  ));
}

/* ------------------- Paquetes Neón (v0.48.0) -----------------------
   La cacería de los 20 cassettes: la ciudad pinta los que faltan
   (refresh manda la lista), el tick de caminar detecta la proximidad
   (radio 44 desde el centro del jugador) y la recolección pasa por la
   puerta única, como todo. El premio final se reclama a mano desde
   el botón del panel de Colección del Inventario (ceremonia). */

let paqueteCollectPending = false;

function maybeCollectPaquete(pst) {
  if (!bundle || !storage || !catalog || paqueteCollectPending) return;
  const spot = nearestCollectible(bundle, pst.x, pst.y);
  if (!spot) return;
  paqueteCollectPending = true;
  applyGameplayMutationLocked(
    storage, catalog, { type: "paquete.collect", spotId: spot.id }, gameplayDate()
  ).then((result) => {
    paqueteCollectPending = false;
    if (result.status === "rejected") {
      const code = result.error && result.error.code;
      if (toasts) toasts.show(`No se pudo guardar: ${code}`, { tone: "error" });
      return;
    }
    refresh();
    if (result.status === "applied") {
      const view = paquetesView(bundle);
      if (toasts) toasts.show(`📼 ¡Cassette neón! ${view.foundCount}/${view.total}`, { tone: "ok" });
    }
  }).catch(() => { paqueteCollectPending = false; });
}

function claimPaquetePrize() {
  if (!storage || !catalog) return;
  return applyGameplayMutationLocked(
    storage, catalog, { type: "paquete.prize" }, gameplayDate()
  ).then((result) => {
    if (result.status === "rejected") {
      const code = result.error && result.error.code;
      if (toasts) toasts.show(`No se pudo guardar: ${code}`, { tone: "error" });
      rerenderInventoryHouses();
      return;
    }
    if (result.status === "duplicate") {
      if (toasts) toasts.show("El premio final ya era tuyo.", { tone: "info" });
    } else if (toasts) {
      toasts.show("🏆 ¡Colección Neón completa! Los 20 cassettes son tuyos: +100 XP, +₡25.", { tone: "ok" });
    }
    refresh();
    rerenderInventoryHouses();
  });
}

/* ---------------------- Inventario (v0.45.0) -------------------------
   El hub de 3 secciones (Adenda §12): presentación pura, cero estado
   nuevo. Dos casas: la app 🎒 del teléfono y el standalone del Mercado
   sobre careerDialog, como la Tienda. */

let inventorySection = "hub";
let inventoryStandalone = false;
let inventoryFromShop = false;
let inventoryPhoneFromShop = false;

function inventoryActions(onBack, onShop) {
  return {
    equip: (itemId) => equipShopItem(itemId),
    onBack,
    onShop,
    onClaimPaquetePrize: () => claimPaquetePrize(),
    onSection: (section) => { inventorySection = section; rerenderInventoryHouses(); }
  };
}

function rerenderInventoryHouses() {
  if (phoneView === "inventario" && !els.phoneBackdrop.hidden) showPhoneInventory(inventoryPhoneFromShop);
  if (inventoryStandalone) renderStandaloneInventory();
}

function showPhoneInventory(fromShop = false) {
  if (!els.phoneMissions || !bundle || !catalog) return;
  inventoryPhoneFromShop = fromShop;
  phoneView = "inventario";
  els.phoneMissions.classList.remove("is-campaign");
  if (els.phoneHome) els.phoneHome.hidden = true;
  els.phoneMissions.hidden = false;
  renderInventory(els.phoneMissions, {
    bundle,
    section: inventorySection,
    actions: inventoryActions(
      () => { if (inventoryPhoneFromShop) showPhoneShop(); else showPhoneHome(); },
      () => showPhoneShop()
    )
  });
}

function openInventoryStandalone(fromShop = false) {
  if (!bundle || !catalog) return;
  if (!fromShop) {
    if (walkOn) setWalk(false);
    if (viewSession) viewSession.capture();
    hideSheetRaw();
    hideOverlayRaw();
    closePhone();
    careerId = null;
    garageOpen = false;
    ianOpen = false;
    marcaOpen = false;
    jarvisOpen = false;
    dailyStandalone = false;
    careerReturnFocus = document.activeElement;
    els.careerBackdrop.hidden = false;
    els.careerDialog.focus({ preventScroll: true });
  }
  shopStandalone = false;
  inventoryStandalone = true;
  inventoryFromShop = fromShop;
  inventorySection = "hub";
  renderStandaloneInventory();
}

function renderStandaloneInventory() {
  if (!inventoryStandalone || !bundle || !catalog) return;
  renderInventory(els.careerDialog, {
    bundle,
    standalone: true,
    backLabel: inventoryFromShop ? "← Tienda" : "← Mapa",
    section: inventorySection,
    actions: inventoryActions(
      () => closeInventoryStandalone(),
      () => { inventoryStandalone = false; shopStandalone = true; renderStandaloneShop(); }
    )
  });
}

function closeInventoryStandalone() {
  if (!inventoryStandalone) return;
  inventoryStandalone = false;
  if (inventoryFromShop) {
    inventoryFromShop = false;
    shopStandalone = true;
    renderStandaloneShop();
    return;
  }
  els.careerBackdrop.hidden = true;
  if (viewSession) viewSession.restore();
  setTab(TAB_CITY);
  if (careerReturnFocus && document.contains(careerReturnFocus)) careerReturnFocus.focus({ preventScroll: true });
  careerReturnFocus = null;
}

function openInventoryFromShop() {
  inventorySection = "hub";
  realesConfirm = null;
  if (shopStandalone) openInventoryStandalone(true);
  else showPhoneInventory(true);
}

/* Acciones compartidas de la Tienda en sus dos casas. */
function shopActions({ onBack, onDistrict } = {}) {
  return {
    buy: (itemId) => buyShopItem(itemId),
    equip: (itemId) => equipShopItem(itemId),
    onBack,
    ...(onDistrict ? { onDistrict } : {}),
    onInventory: () => openInventoryFromShop(),
    redeem: (item) => askRedeemReales(item),
    confirmRedeem: () => confirmRedeemReales(),
    cancelRedeem: () => cancelRedeemReales(),
    enjoyReales: (key) => enjoyReales(key),
    removeReales: (rewardId) => removeReales(rewardId),
    createReales: (data) => createReales(data)
  };
}

function showPhoneShop() {
  if (!els.phoneMissions || !bundle || !catalog) return;
  phoneView = "tienda";
  els.phoneMissions.classList.remove("is-campaign");
  if (els.phoneHome) els.phoneHome.hidden = true;
  els.phoneMissions.hidden = false;
  renderShop(els.phoneMissions, {
    bundle,
    confirmReward: realesConfirm,
    actions: shopActions({ onBack: () => showPhoneHome() })
  });
}

/* -------------------------------- Libreta --------------------------------
   La libreta de espiral del teléfono (v0.41.0): notas personales de José
   dentro del mismo save. Sin XP, sin monedas y sin misiones: el texto es
   suyo y solo pasa por applyGameplayMutationLocked, como todo lo demás. */

function showPhoneLibreta() {
  if (!els.phoneMissions || !bundle || !catalog) return;
  phoneView = "libreta";
  els.phoneMissions.classList.remove("is-campaign");
  if (els.phoneHome) els.phoneHome.hidden = true;
  els.phoneMissions.hidden = false;
  renderLibreta(els.phoneMissions, {
    notes: libretaView(bundle).notes,
    ui: libretaUi,
    actions: {
      onBack: () => showPhoneHome(),
      onCompose: () => { libretaUi = { mode: "new", noteId: null }; showPhoneLibreta(); },
      onEdit: (id) => { libretaUi = { mode: "edit", noteId: id }; showPhoneLibreta(); },
      onCancel: () => { libretaUi = { mode: "list", noteId: null }; showPhoneLibreta(); },
      onSave: (data) => saveLibretaNote(data),
      onAskDelete: (id) => { libretaUi = { mode: "confirm", noteId: id }; showPhoneLibreta(); },
      onDelete: (id) => deleteLibretaNote(id)
    }
  });
}

function afterLibreta(result, okMessage) {
  if (result.status === "rejected") {
    const code = result.error && result.error.code;
    const friendly =
      code === "EMPTY_NOTE" ? "La nota quedó vacía: escribí algo antes de guardar."
      : code === "LIBRETA_FULL" ? "Tu libreta llegó al máximo de notas. Borrá alguna vieja para seguir."
      : `No se pudo guardar: ${code}`;
    if (toasts) toasts.show(friendly, { tone: "error" });
    return;
  }
  if (result.status === "duplicate") {
    if (toasts) toasts.show("Sin cambios en la nota.", { tone: "info" });
  } else if (toasts) {
    toasts.show(okMessage, { tone: "ok" });
  }
  libretaUi = { mode: "list", noteId: null };
  refresh();
  if (phoneView === "libreta" && !els.phoneBackdrop.hidden) showPhoneLibreta();
}

async function saveLibretaNote({ id, titulo, texto }) {
  if (!storage || !catalog || libretaWritePending) return;
  libretaWritePending = true;
  try {
    const mutation = id
      ? { type: "libreta.update", id, titulo, texto }
      : {
          type: "libreta.create",
          id: globalThis.crypto?.randomUUID?.() || `nota_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          titulo,
          texto
        };
    const result = await applyGameplayMutationLocked(storage, catalog, mutation, gameplayDate());
    afterLibreta(result, id ? "Nota actualizada." : "Nota guardada en tu libreta.");
  } catch (error) {
    if (toasts) toasts.show("No se pudo guardar la nota.", { tone: "error" });
  } finally {
    libretaWritePending = false;
  }
}

async function deleteLibretaNote(id) {
  if (!storage || !catalog || libretaWritePending) return;
  libretaWritePending = true;
  try {
    const result = await applyGameplayMutationLocked(
      storage, catalog, { type: "libreta.delete", id }, gameplayDate()
    );
    afterLibreta(result, "Nota borrada.");
  } catch (error) {
    if (toasts) toasts.show("No se pudo borrar la nota.", { tone: "error" });
  } finally {
    libretaWritePending = false;
  }
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
  /* Primera actividad del día registrada: si ayer se falló y hay un
     escudo guardado, este es el momento en que protege la racha. */
  detectRachaShield();
  if (sheetOpen && sheetDistrictId) openDistrictArchive(sheetDistrictId);
  if (phoneView === "missions" && !els.phoneBackdrop.hidden) showPhoneMissions();
  if (phoneView === "diarias" && !els.phoneBackdrop.hidden) renderActiveDaily();
}

/* ------------------------ campañas: un solo estado ----------------------- */

function openCampaign(id, inPhone = false) {
  if (!bundle || !catalog || !campaignView(bundle, id)) return;
  dailyStandalone = false;
  shopStandalone = false;
  garageOpen = false;
  ianOpen = false;
  marcaOpen = false;
  jarvisOpen = false;
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
    else if (id === "eventos" || id === "entrevista" || id === "whatsapp") {
      const r = eventosRect();
      city.camera.jumpTo(r.x + r.w / 2, r.y + r.h / 2, city.camera.clampZoom(0.8));
    } else if (id === "academia") {
      const r = academiaRect();
      city.camera.jumpTo(r.x + r.w / 2, r.y + r.h / 2, city.camera.clampZoom(0.8));
    } else if (id === "zonaia") {
      const r = zonaiaRect();
      city.camera.jumpTo(r.x + r.w / 2, r.y + r.h / 2, city.camera.clampZoom(0.8));
    } else if (id === "sabiduria") {
      const r = sabiduriaRect();
      city.camera.jumpTo(r.x + r.w / 2, r.y + r.h / 2, city.camera.clampZoom(0.8));
    } else if (id === "mundoian") {
      const r = mundoianRect();
      city.camera.jumpTo(r.x + r.w / 2, r.y + r.h / 2, city.camera.clampZoom(0.8));
    } else if (id === "garaje") {
      const r = cellRect(3, 2);
      city.camera.jumpTo(r.x + r.w / 2, r.y + r.h / 2, city.camera.clampZoom(0.8));
    } else {
      const r = clipsRect();
      city.camera.jumpTo(r.x + r.w / 2, r.y + r.h / 2, city.camera.clampZoom(0.8));
    }
  }
  renderActiveCampaign();
}

function closeCampaign() {
  if (!careerId && !garageOpen && !ianOpen && !marcaOpen && !jarvisOpen) return;
  careerId = null;
  garageOpen = false;
  ianOpen = false;
  marcaOpen = false;
  jarvisOpen = false;
  els.careerBackdrop.hidden = true;
  if (viewSession) viewSession.restore();
  setTab(TAB_CITY);
  if (careerReturnFocus && document.contains(careerReturnFocus)) careerReturnFocus.focus({ preventScroll: true });
  careerReturnFocus = null;
}

function renderActiveCampaign() {
  const inPhone = !els.phoneBackdrop.hidden && Boolean(CAMPAIGNS[phoneView]);
  if (garageOpen && !inPhone) { renderGaragePanel(); return; }
  if (ianOpen && !inPhone) { renderIanPanel(); return; }
  if (marcaOpen && !inPhone) { renderMarcaPanel(); return; }
  if (jarvisOpen && !inPhone) { renderJarvisPanel(); return; }
  const id = inPhone ? phoneView : careerId;
  if (!id || !bundle) return;
  const root = inPhone ? els.phoneMissions : els.careerDialog;
  const view = campaignView(bundle, id);
  renderCampaign(root, {
    view, compact: inPhone,
    /* Set Legendario (v0.49.0): la vitrina del panel solo aparece si
       la campaña tiene set definido y está completa; el reclamo va
       por saveCampaignAction (la puerta única) como todo lo demás. */
    legendary: legendarioView(bundle, id),
    onClaimLegendary: (campaignId) => saveCampaignAction({ type: "legendario.claim", campaignId }).then((r) => {
      if (r.ok && toasts) toasts.show("✨ ¡Set EXO//AUTÓMATA en tu inventario! El atuendo ya está equipado.", { tone: "ok" });
      return r;
    }),
    onBack: () => inPhone ? showPhoneHome() : closeCampaign(),
    onComplete: (missionId, evidence) => saveCampaignAction({ type: "campaign.complete", missionId, evidence }),
    onApply: (details) => saveCampaignAction({
      type: "application.record", ...details,
      requestId: globalThis.crypto?.randomUUID?.() || `application_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      expectedCount: view.applications.count
    })
  });
  const archiveFor = id === "brete" ? "empleo" : id === "sabiduria" ? "mirador" : id === "mundoian" ? "hub" : null;
  if (archiveFor) {
    const archive = phoneEl("button", "campaign-archive",
      id === "sabiduria" ? "Ver la ficha del Mirador de Sagas" : id === "mundoian" ? "Ver la ficha del Hub" : "Ver misiones de empleo heredadas de ODEA 1");
    archive.type = "button";
    archive.addEventListener("click", () => {
      closeCampaign();
      closePhone();
      openDistrictArchive(archiveFor);
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

/* ------------------- Contrato Semanal (v0.46.0) ---------------------
   La tarjeta «📜 CONTRATO SEMANAL» se inyecta en paintDaily ANTES de
   renderDaily, sobre la ruta: como paintDaily alimenta las dos casas
   (pestaña «Hoy» y app Misiones), la tarjeta aparece en ambas con una
   sola implementación. Cada casa conserva sus dos hosts (contrato y
   diarias) entre repintados: renderDaily sigue recibiendo SU host, así
   su sesión (acordeones, mensajes) no se reinicia, y lo que hubiera en
   la raíz de otra pantalla se retira al abrir Diarias. */

const dailyHosts = new WeakMap();

function dailyHostsFor(root) {
  let hosts = dailyHosts.get(root);
  if (!hosts) {
    hosts = {
      contrato: document.createElement("div"),
      racha: document.createElement("div"),
      daily: document.createElement("div")
    };
    hosts.contrato.className = "contrato-host";
    hosts.racha.className = "racha-host";
    dailyHosts.set(root, hosts);
  }
  for (const child of [...root.childNodes]) {
    if (child !== hosts.contrato && child !== hosts.racha && child !== hosts.daily) child.remove();
  }
  root.append(hosts.contrato, hosts.racha, hosts.daily);
  return hosts;
}

/* ------------------- Escudo de Racha (v0.47.0) ---------------------
   La barra de racha vive en Diarias/«Hoy», entre el Contrato y la
   ruta: llama de la racha derivada, chip «🛡️ ×N» con su explicación
   y la semanita de actividad reciente, donde el día cubierto por un
   escudo se distingue con un punto-escudo en vez del punto lleno.
   La DETECCIÓN es automática (como en ODEA 1): al abrir Diarias y al
   registrar actividad, si ayer se falló, hoy ya se jugó y hay un
   escudo guardado, la mutación `racha.cover` lo gasta sola y el
   toast lo celebra; los hitos de 14/30 días otorgan su escudo por la
   mutación `racha.grant`. El reducer revalida todo: acá solo se
   detecta y se avisa. */

function rachaEl(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined && text !== null) el.textContent = String(text);
  return el;
}

function paintRacha(host) {
  host.replaceChildren();
  if (!bundle) return;
  const today = localDateKey();
  const streak = deriveStreak(bundle);
  const shields = rachaView(bundle);
  const bar = rachaEl("div", "racha-bar");
  const head = rachaEl("div", "racha-head");
  head.append(
    rachaEl("span", "racha-flame", `🔥 Racha: ${streak.streak} ${streak.streak === 1 ? "día" : "días"}`),
    rachaEl("span", "racha-chip", `🛡️ ×${shields.available}`)
  );
  const week = rachaEl("div", "racha-week");
  week.setAttribute("aria-label", "Tu actividad de los últimos 7 días");
  for (const day of recentStreakDays(bundle, today, 7)) {
    const dot = rachaEl("span", `racha-dot${day.covered ? " is-covered" : day.active ? " is-active" : ""}`, day.covered ? "🛡️" : "●");
    dot.title = day.covered
      ? `${day.date} — día salvado por un escudo`
      : day.active ? `${day.date} — jugaste` : `${day.date} — sin actividad`;
    week.append(dot);
  }
  bar.append(
    head,
    week,
    rachaEl("p", "racha-detail", "Se gana con el Contrato Semanal y con rachas de 14/30 días. Protege un día fallado.")
  );
  host.append(bar);
}

let rachaDetectBusy = false;

function repaintDailyHouses() {
  if (phoneView === "diarias" && !els.phoneBackdrop.hidden) renderActiveDaily();
  if (dailyStandalone) renderStandaloneDaily();
}

async function detectRachaShield() {
  if (rachaDetectBusy || !storage || !catalog || !bundle) return;
  const today = localDateKey();
  const missed = coverCandidate(bundle, today);
  const streakNow = deriveStreak(bundle).streak;
  const inventory = shieldInventory(bundle);
  let milestone = null;
  if (inventory.available < inventory.cap) {
    for (const candidate of RACHA_MILESTONES) {
      const reach = milestoneReachDate(bundle, candidate);
      if (streakNow >= candidate && reach && !rachaView(bundle).grantKeys.includes(`hito${candidate}@${reach}`)) {
        milestone = candidate;
        break;
      }
    }
  }
  if (!missed && milestone == null) return;
  rachaDetectBusy = true;
  try {
    if (missed) {
      const result = await applyGameplayMutationLocked(
        storage, catalog, { type: "racha.cover", date: missed }, gameplayDate()
      );
      if (result.status === "applied") {
        refresh();
        const kept = deriveStreak(bundle).streak;
        const left = shieldInventory(bundle).available;
        if (toasts) {
          toasts.show(
            `🛡️ ¡Escudo de racha activado! — Un día perdido no rompió tu racha de ${kept} días. Te quedan ${left}.`,
            { tone: "ok" }
          );
        }
        repaintDailyHouses();
        return;
      }
    }
    if (milestone != null) {
      const result = await applyGameplayMutationLocked(
        storage, catalog, { type: "racha.grant", milestone }, gameplayDate()
      );
      if (result.status === "applied") {
        refresh();
        const total = shieldInventory(bundle).available;
        if (toasts) {
          toasts.show(
            `🛡️ ¡Escudo de racha ganado! — Tu racha de ${milestone} días te premia. Tenés ${total}.`,
            { tone: "ok" }
          );
        }
        repaintDailyHouses();
      }
    }
  } catch (error) {
    /* La detección nunca rompe la pantalla: si la escritura falla, el
       reducer no aplicó nada y la racha queda como estaba. */
  } finally {
    rachaDetectBusy = false;
  }
}

function claimContrato(weekKey, root, { compact, onBack }) {
  if (!storage || !catalog) return;
  return applyGameplayMutationLocked(
    storage, catalog, { type: "contrato.claim", weekKey }, gameplayDate()
  ).then((result) => {
    if (result.status === "rejected") {
      const code = result.error && result.error.code;
      const friendly =
        code === "CONTRACT_INCOMPLETE" ? "Todavía te faltan retos para cerrar el contrato."
        : code === "CLAIM_EXPIRED" ? "Ese contrato ya expiró: la gracia terminó el miércoles."
        : `No se pudo guardar: ${code}`;
      if (toasts) toasts.show(friendly, { tone: "error" });
    } else if (result.status === "duplicate") {
      if (toasts) toasts.show("Ese cofre ya lo habías reclamado.", { tone: "info" });
    } else if (toasts) {
      /* Desde la Fase 3 el cofre también trae 1 Escudo de Racha si
         había espacio en el inventario (misma escritura atómica). */
      const withShield = Array.isArray(result.changed) &&
        result.changed.some((path) => String(path).startsWith("play.racha.grants."));
      toasts.show(
        withShield
          ? "🎉 ¡Contrato cumplido! El cofre es tuyo: +150 XP, +₡15 y 🛡️ un Escudo de Racha."
          : "🎉 ¡Contrato cumplido! El cofre es tuyo: +150 XP, +₡15.",
        { tone: "ok" }
      );
    }
    refresh();
    if (bundle && catalog) paintDaily(root, { compact, onBack });
  });
}

function paintContrato(host, root, { compact, onBack }) {
  renderContrato(host, {
    view: contratoView(bundle, localDateKey()),
    onClaim: (weekKey) => claimContrato(weekKey, root, { compact, onBack })
  });
}

/* La ⭐ manual del panel Hoy: la MISMA mutación jarvis.act que usa la
   tarjeta de Jarvis, con origen manual y SIN pasar por la API — el
   panel es la segunda puerta del ajuste. Si la diaria ya es el foco,
   tocarla de nuevo no hace nada (el reducer respondería ACTION_STALE). */
async function toggleDailyFocus(missionId, root, { compact, onBack }) {
  if (!storage || !catalog || !bundle) return;
  const today = localDateKey();
  if (dailyPlanView(bundle, catalog, today).focusId === missionId) return;
  const result = await applyGameplayMutationLocked(
    storage, catalog,
    { type: "jarvis.act", requestId: newJarvisRequestId(), name: "set_daily_focus", args: { dailyId: missionId } },
    gameplayDate()
  );
  if (result.status === "applied") {
    refresh();
    if (toasts) toasts.show("⭐ Foco de hoy actualizado.", { tone: "ok" });
  } else if (result.status === "rejected" && toasts) {
    toasts.show("No se pudo marcar el foco. Intentá de nuevo.", { tone: "error" });
  }
  if (bundle && catalog) paintDaily(root, { compact, onBack });
}

/* «Volver al día completo»: apaga el modo día ocupado deshaciendo la
   acción que lo sostiene (jarvis.actUndo), sin API. Si el modo ya no
   está sostenido por una acción (no debería pasar), no toca nada. */
async function clearBusyDay(plan, root, { compact, onBack }) {
  if (!storage || !catalog || !bundle) return;
  if (plan.busyRequestId) {
    const result = await applyGameplayMutationLocked(
      storage, catalog, { type: "jarvis.actUndo", requestId: plan.busyRequestId }, gameplayDate()
    );
    if (result.status === "applied") {
      refresh();
      if (toasts) toasts.show("⏱️ Día completo de nuevo: las 3 diarias están en tu lista.", { tone: "ok" });
    } else if (toasts) {
      toasts.show("El día ocupado ya había cambiado; revisá tu lista.", { tone: "info" });
    }
  }
  if (bundle && catalog) paintDaily(root, { compact, onBack });
}

/* El panel de Diarias se pinta igual en sus dos casas (el teléfono y la
   pestaña «Hoy»): mismo root intercambiable, misma ruta, mismo registro. */
function paintDaily(root, { compact, onBack }) {
  const hosts = dailyHostsFor(root);
  paintContrato(hosts.contrato, root, { compact, onBack });
  paintRacha(hosts.racha);
  /* Detección del Escudo de Racha al abrir Diarias/«Hoy»: si ayer se
     falló y hoy ya hubo actividad, el escudo se gasta solo. */
  detectRachaShield();
  const route = routeForDay(bundle, catalog);
  /* Jarvis con manos (v0.50.0): el panel REFLEJA el plan del día que
     vive en play.jarvis — foco (⭐ + pastilla), orden guardado y día
     ocupado (elegidas hoy, diferidas en «Para mañana»). Es estado de
     vista puro: la ruta, la racha y el multiplicador no se enteran. */
  const plan = dailyPlanView(bundle, catalog, route.date);
  const byId = new Map(route.missions.map((m) => [m.id, m]));
  const ordered = plan.order.map((id) => byId.get(id)).filter(Boolean);
  const deferredIds = new Set(plan.busy ? plan.busy.deferred : []);
  const missions = ordered.map((m) => ({
    ...m,
    focus: plan.focusId === m.id,
    deferred: deferredIds.has(m.id)
  }));
  /* Con día ocupado, las diferidas van AL FINAL (su sección); el resto
     conserva el orden guardado, con el foco en su posición. */
  missions.sort((a, b) => Number(a.deferred) - Number(b.deferred));
  renderDaily(hosts.daily, {
    compact,
    view: {
      day: route.catalogDay,
      date: route.date,
      missions,
      busy: plan.busy ? { minutes: plan.busy.minutes } : null
    },
    onBack,
    onToggleFocus: (missionId) => toggleDailyFocus(missionId, root, { compact, onBack }),
    onClearBusy: () => clearBusyDay(plan, root, { compact, onBack }),
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
  garageOpen = false;
  ianOpen = false;
  marcaOpen = false;
  jarvisOpen = false;
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
  garageOpen = false;
  ianOpen = false;
  marcaOpen = false;
  jarvisOpen = false;
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
    confirmReward: realesConfirm,
    actions: shopActions({
      onBack: () => closeShopStandalone(),
      onDistrict: () => {
        closeShopStandalone();
        openDistrictArchive("mercado");
      }
    })
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

/* ------------------------- el Garaje vivo ------------------------- */

function openGarage() {
  if (!bundle || !catalog) return;
  dailyStandalone = false;
  shopStandalone = false;
  jarvisOpen = false;
  if (walkOn) setWalk(false);
  if (viewSession) viewSession.capture();
  hideSheetRaw();
  hideOverlayRaw();
  closePhone();
  careerReturnFocus = document.activeElement;
  careerId = null;
  marcaOpen = false;
  garageOpen = true;
  els.careerBackdrop.hidden = false;
  els.careerDialog.focus({ preventScroll: true });
  if (city) {
    const r = cellRect(3, 2);
    city.camera.jumpTo(r.x + r.w / 2, r.y + r.h / 2, city.camera.clampZoom(0.8));
  }
  renderGaragePanel();
}

function renderGaragePanel() {
  if (!garageOpen || !bundle) return;
  const today = gameplayDate().date;
  const view = garageView(bundle, today);
  /* v0.54.0 — los snoozes de Jarvis (§3.4): una rutina vencida o por
     vencer con snooze vigente se pinta «pospuesta hasta…» con su
     botón de despertar, y sale de la tarjeta «Esta semana toca». El
     reloj de la rutina NO se toca: sigue vencida, solo calla el aviso. */
  const snoozes = jarvisView(bundle, today).snoozes || {};
  const snoozedUntil = (mission) => {
    const until = snoozes[`garaje:${mission.id}`];
    return typeof until === "string" && until >= today ? until : null;
  };
  for (const mission of view.missions) {
    if (mission.state !== "vencida" && mission.state !== "por-vencer") continue;
    const until = snoozedUntil(mission);
    if (until) mission.snoozedUntil = until;
  }
  view.week = view.week.filter((mission) => !snoozedUntil(mission));
  renderGarage(els.careerDialog, {
    view,
    onBack: () => closeCampaign(),
    onComplete: (missionId) => saveGarageAction({ type: "garage.complete", missionId }),
    onKm: (vehicle, km) => saveGarageAction({ type: "garage.km", vehicle, km }),
    onWakeSnooze: (missionId) => saveGarageAction({ type: "jarvis.snoozeClear", routineId: missionId }),
    onArchive: () => {
      closeCampaign();
      closePhone();
      openDistrictArchive("garaje");
    }
  });
}

async function saveGarageAction(mutation) {
  if (garageWritePending) return { text: "Ya hay un registro en curso.", kind: "error" };
  garageWritePending = true;
  try {
    const result = await applyGameplayMutationLocked(storage, catalog, mutation, gameplayDate());
    if (result.status !== "applied") {
      const messages = {
        DUPLICATE: "Ese registro ya estaba guardado hoy; no se pagó otra vez.",
        KM_INVALID: "Ese kilometraje no es válido.",
        QUOTA_EXCEEDED: "No hay espacio para guardar. Exportá un respaldo y liberá espacio antes de continuar.",
        CONCURRENT_CHANGE: "Otra pestaña cambió el progreso. Revisá el registro antes de volver a intentar."
      };
      refresh();
      setTimeout(renderGaragePanel, 1100);
      return { text: messages[result.error?.code] ||
        (result.status === "duplicate" ? messages.DUPLICATE :
          `No se pudo guardar (${result.error?.code || "error"}). No se otorgaron premios.`), kind: "error" };
    }
    refresh();
    setTimeout(renderGaragePanel, 500);
    return null;
  } catch (error) {
    return { text: "No se pudo guardar. Tu progreso anterior sigue intacto; exportá un respaldo y reintentá.", kind: "error" };
  } finally {
    garageWritePending = false;
  }
}

/* ------------------------- el Mundo de Ian vivo ------------------------- */

function openIan() {
  if (!bundle || !catalog) return;
  dailyStandalone = false;
  shopStandalone = false;
  garageOpen = false;
  jarvisOpen = false;
  if (walkOn) setWalk(false);
  if (viewSession) viewSession.capture();
  hideSheetRaw();
  hideOverlayRaw();
  closePhone();
  careerReturnFocus = document.activeElement;
  careerId = null;
  marcaOpen = false;
  ianOpen = true;
  els.careerBackdrop.hidden = false;
  els.careerDialog.focus({ preventScroll: true });
  if (city) {
    const r = mundoianRect();
    city.camera.jumpTo(r.x + r.w / 2, r.y + r.h / 2, city.camera.clampZoom(0.8));
  }
  renderIanPanel();
}

function renderIanPanel() {
  if (!ianOpen || !bundle) return;
  renderIan(els.careerDialog, {
    view: ianView(bundle, gameplayDate().date),
    onBack: () => closeCampaign(),
    onComplete: (missionId) => saveIanAction({ type: "ian.complete", missionId }),
    onArchive: () => {
      closeCampaign();
      closePhone();
      openDistrictArchive("hub");
    }
  });
}

async function saveIanAction(mutation) {
  if (ianWritePending) return { text: "Ya hay un registro en curso.", kind: "error" };
  ianWritePending = true;
  try {
    const result = await applyGameplayMutationLocked(storage, catalog, mutation, gameplayDate());
    if (result.status !== "applied") {
      const messages = {
        DUPLICATE: "Esa misión ya estaba registrada hoy; no se pagó otra vez.",
        QUOTA_EXCEEDED: "No hay espacio para guardar. Exportá un respaldo y liberá espacio antes de continuar.",
        CONCURRENT_CHANGE: "Otra pestaña cambió el progreso. Revisá el registro antes de volver a intentar."
      };
      refresh();
      setTimeout(renderIanPanel, 1100);
      return { text: messages[result.error?.code] ||
        (result.status === "duplicate" ? messages.DUPLICATE :
          `No se pudo guardar (${result.error?.code || "error"}). No se otorgaron premios.`), kind: "error" };
    }
    refresh();
    setTimeout(renderIanPanel, 500);
    return null;
  } catch (error) {
    return { text: "No se pudo guardar. Tu progreso anterior sigue intacto; exportá un respaldo y reintentá.", kind: "error" };
  } finally {
    ianWritePending = false;
  }
}

/* ------------------- el Estudio Neón vivo (marca) ------------------- */

function openMarca() {
  if (!bundle || !catalog) return;
  dailyStandalone = false;
  shopStandalone = false;
  garageOpen = false;
  ianOpen = false;
  jarvisOpen = false;
  if (walkOn) setWalk(false);
  if (viewSession) viewSession.capture();
  hideSheetRaw();
  hideOverlayRaw();
  closePhone();
  careerReturnFocus = document.activeElement;
  careerId = null;
  marcaOpen = true;
  els.careerBackdrop.hidden = false;
  els.careerDialog.focus({ preventScroll: true });
  if (city) {
    const r = marcaRect();
    city.camera.jumpTo(r.x + r.w / 2, r.y + r.h / 2, city.camera.clampZoom(0.8));
  }
  renderMarcaPanel();
}

function renderMarcaPanel() {
  if (!marcaOpen || !bundle) return;
  renderMarca(els.careerDialog, {
    view: marcaView(bundle, gameplayDate().date),
    onBack: () => closeCampaign(),
    onComplete: (missionId) => saveMarcaAction({ type: "marca.complete", missionId })
  });
}

async function saveMarcaAction(mutation) {
  if (marcaWritePending) return { text: "Ya hay un registro en curso.", kind: "error" };
  marcaWritePending = true;
  try {
    const result = await applyGameplayMutationLocked(storage, catalog, mutation, gameplayDate());
    if (result.status !== "applied") {
      const messages = {
        DUPLICATE: "Eso ya estaba registrado hoy; no se pagó otra vez.",
        QUOTA_EXCEEDED: "No hay espacio para guardar. Exportá un respaldo y liberá espacio antes de continuar.",
        CONCURRENT_CHANGE: "Otra pestaña cambió el progreso. Revisá el registro antes de volver a intentar."
      };
      refresh();
      setTimeout(renderMarcaPanel, 1100);
      return { text: messages[result.error?.code] ||
        (result.status === "duplicate" ? messages.DUPLICATE :
          `No se pudo guardar (${result.error?.code || "error"}). No se otorgaron premios.`), kind: "error" };
    }
    refresh();
    setTimeout(renderMarcaPanel, 500);
    return null;
  } catch (error) {
    return { text: "No se pudo guardar. Tu progreso anterior sigue intacto; exportá un respaldo y reintentá.", kind: "error" };
  } finally {
    marcaWritePending = false;
  }
}

/* ------------------------- Jarvis, el compañero -------------------------
   El robotcito de la Zona IA (v0.38.0): vive en el mismo #career-dialog
   de las campañas, con su propia bandera como el Garaje e Ian. La IA es
   un extra — sin Worker, sin internet o sin clave, el diálogo degrada a
   un saludo local y el juego sigue completo. Nada de Jarvis escribe el
   guardado fuera de applyGameplayMutationLocked. */

function openJarvis() {
  if (!bundle || !catalog) return;
  dailyStandalone = false;
  shopStandalone = false;
  garageOpen = false;
  ianOpen = false;
  marcaOpen = false;
  if (walkOn) setWalk(false);
  if (viewSession) viewSession.capture();
  hideSheetRaw();
  hideOverlayRaw();
  closePhone();
  careerReturnFocus = document.activeElement;
  careerId = null;
  jarvisOpen = true;
  els.careerBackdrop.hidden = false;
  els.careerDialog.focus({ preventScroll: true });
  if (city) {
    const r = zonaiaRect();
    city.camera.jumpTo(r.x + r.w / 2, r.y + r.h / 2, city.camera.clampZoom(0.8));
  }
  renderJarvisPanel();
}

function jarvisCompletedMissions() {
  const state = campaignStateOf(bundle);
  const byId = new Map(CAMPAIGN_MISSIONS.map((mission) => [mission.id, mission]));
  return Object.values(state.completions || {}).flatMap((record) => {
    const mission = byId.get(record.missionId);
    if (!mission) return [];
    return [{
      campaignId: record.campaignId,
      missionId: record.missionId,
      title: mission.title,
      deliverable: mission.deliverable,
      criterion: mission.criterion,
      evidence: record.evidence || ""
    }];
  });
}

function renderJarvisPanel() {
  if (!jarvisOpen || !bundle) return;
  const today = gameplayDate().date;
  renderJarvis(els.careerDialog, {
    view: jarvisView(bundle, today),
    summary: buildProgressSummary(bundle, catalog, today),
    completedMissions: jarvisCompletedMissions(),
    onQuiz: (xpAwarded) => saveJarvisAction({ type: "jarvis.quiz", xpAwarded }),
    onUsage: (kind) => saveJarvisAction({ type: "jarvis.usage", kind }),
    onBriefing: (text) => saveJarvisAction({ type: "jarvis.briefing", text }),
    /* v0.50.0 — manos: la tarjeta despacha por la ruta única de siempre. */
    onAct: (mutation) => saveJarvisAction(mutation),
    onActUndo: (mutation) => saveJarvisAction(mutation),
    /* v0.52.0 — el banco de preguntas: guardar/borrar una entrada,
       por la misma ruta única. Sin XP, sin monedas, sin Worker. */
    onBankSave: (entry) => saveJarvisAction({ type: "jarvis.bankSave", entry }),
    onBankRemove: (bankId) => saveJarvisAction({ type: "jarvis.bankRemove", bankId }),
    /* v0.54.0 — el cruce a la Libreta (§3.5): la nota la crea/borra el
       JUEGO con las mutaciones de la Libreta de siempre, por la misma
       ruta única; Jarvis solo registra la acción con su refId. El id
       lo genera el juego, jamás la IA. */
    onLibretaCreate: async (text) => {
      const id = (typeof crypto !== "undefined" && crypto.randomUUID)
        ? crypto.randomUUID()
        : `nota_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
      const created = await saveJarvisAction({ type: "libreta.create", id, titulo: "", texto: text });
      return created && (created.status === "applied" || created.status === "duplicate")
        ? { ok: true, noteId: id }
        : { ok: false };
    },
    onLibretaDelete: (noteId) => saveJarvisAction({ type: "libreta.delete", id: noteId }),
    onOpenZonaIA: () => { closeCampaign(); openCampaign("zonaia"); },
    /* v0.51.0 — el Tutor: el catálogo (para el índice local de
       lecciones, que lee su clave `daily`) y la apertura de la campaña
       de una cita al tocar su chip. */
    catalog,
    onOpenCampaign: (campaignId) => { closeCampaign(); openCampaign(campaignId); },
    onClose: () => closeCampaign()
  });
}

async function saveJarvisAction(mutation) {
  if (jarvisWritePending) return { status: "rejected", error: { code: "WRITE_PENDING" } };
  jarvisWritePending = true;
  try {
    const result = await applyGameplayMutationLocked(storage, catalog, mutation, gameplayDate());
    /* Solo se refresca el HUD: el diálogo conserva su sesión (el quiz y
       el chat en curso no se reinician por registrar un contador). */
    refresh();
    return result;
  } catch (error) {
    return { status: "rejected", error: { code: "EXCEPTION" } };
  } finally {
    jarvisWritePending = false;
  }
}

/** ¿Tiene Jarvis algo que contar hoy? (spec §1.4, cálculo 100% local). */
function jarvisHasNews(bundle2) {
  try {
    const today = gameplayDate().date;
    const garage = garageView(bundle2, today);
    /* v0.54.0: una rutina con snooze vigente no enciende el «!» (§3.4). */
    const snoozes = jarvisView(bundle2, today).snoozes || {};
    const garageUrgent = garage.missions.some((mission) => {
      if (mission.state !== "vencida" && mission.state !== "por-vencer") return false;
      const until = snoozes[`garaje:${mission.id}`];
      return !(typeof until === "string" && until >= today);
    });
    if (garageUrgent) return true;
    const ian = ianView(bundle2, today);
    if (ian.missions.some((mission) => mission.state === "vencida" || mission.state === "por-vencer")) return true;
    const dias = Math.round((Date.parse("2026-11-24T00:00:00.000Z") - Date.parse(`${today}T00:00:00.000Z`)) / 86400000);
    if (dias >= 0 && dias <= 4) return true;
    if (!jarvisView(bundle2, today).briefingHoy) return true;
    return false;
  } catch (error) {
    return false;
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

/** Pixel art de la barra (v0.42.0): los iconos son SVG de rects como el de
 *  la Libreta, nunca emojis. El span `.tab-icon` envuelve la imagen. */
function tabIconImg(src) {
  const img = document.createElement("img");
  img.className = "tab-icon-img";
  img.src = src;
  img.alt = "";
  img.draggable = false;
  return img;
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
  icon.append(tabIconImg("assets/tab-caminar.svg"));
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
  icon.append(tabIconImg("assets/tab-telefono.svg"));
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
  /* v0.40.2 (auditoría completa, pedido de José): la app de Misiones debe
     mostrar TODAS las campañas y sistemas activos, no solo El Brete y
     Zona Gamer. Las demás campañas se abren en el mismo teléfono; los
     sistemas vivos (Garaje e Ian) abren su panel, como desde la ciudad.
     El SJO Decision Lab («eventos») y Operación Entrevista («entrevista»)
     quedan fuera a propósito: son los eventos guardados, no el activo
     (hoy el activo es Operación Confirmación). */
  root.append(phoneEl("h4", "phone-screen-group", "Más campañas"));
  for (const id of ["academia", "zonaia", "sabiduria", "whatsapp"]) {
    const view = campaignView(bundle, id);
    const button = phoneEl("button", "campaign-phone-route", `${view.name} · ${view.done}/${view.total} · ${view.percent}%`);
    button.type = "button";
    button.addEventListener("click", () => openCampaign(id, true));
    root.append(button);
  }
  root.append(phoneEl("h4", "phone-screen-group", "Sistemas vivos"));
  const garage = garageView(bundle, gameplayDate().date);
  const garageDone = garage.missions.filter((m) => m.times > 0).length;
  const garageBtn = phoneEl("button", "campaign-phone-route", `Garaje Vivo · ${garageDone}/${garage.missions.length} rutinas probadas`);
  garageBtn.type = "button";
  garageBtn.addEventListener("click", () => { closePhone(); openGarage(); });
  root.append(garageBtn);
  const ian = ianView(bundle, gameplayDate().date);
  const ianBtn = phoneEl("button", "campaign-phone-route", `El Mundo de Ian · ${ian.probadas}/${ian.total} actividades probadas`);
  ianBtn.type = "button";
  ianBtn.addEventListener("click", () => { closePhone(); openIan(); });
  root.append(ianBtn);
  /* v0.44.0: el Estudio Neón (marca personal) se suma a Sistemas vivos
     con su conteo de hitos, como el Garaje y el Mundo de Ian. */
  const marca = marcaView(bundle, gameplayDate().date);
  const marcaBtn = phoneEl("button", "campaign-phone-route", `Estudio Neón · ${marca.hitosDone}/${marca.hitosTotal} hitos`);
  marcaBtn.type = "button";
  marcaBtn.addEventListener("click", () => { closePhone(); openMarca(); });
  root.append(marcaBtn);
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
    ...DISTRICTS.map((d) => ({ id: d.id, name: d.id === "empleo" ? "El Brete · Analista de datos" : d.id === "vida" ? "Estudio Neón · Marca personal" : d.name }))]) {
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
    actions
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
      city.setJarvisAlert(jarvisHasNews(bundle));
      city.setPaquetes(paquetesView(bundle).spots.filter((s) => !s.found));
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
        actions
      });
    }
    return;
  }

  setCityActive(false);
  if (city) {
    city.setPlayerVisible(false);
    city.setCredit(null);
    city.setJarvisAlert(false);
    city.setPaquetes([]);
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
        else if (inventoryStandalone) closeInventoryStandalone();
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
        else if (app === "jarvis") openJarvis();
        else if (app === "libreta") { libretaUi = { mode: "list", noteId: null }; showPhoneLibreta(); }
        else if (app === "brete" || app === "gamer") openCampaign(app, true);
        else if (app === "tienda") showPhoneShop();
        else if (app === "map") showPhoneMap();
        else if (app === "bag") { inventorySection = "hub"; showPhoneInventory(false); }
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
      else if (garageOpen) closeCampaign();
      else if (ianOpen) closeCampaign();
      else if (marcaOpen) closeCampaign();
      else if (jarvisOpen) closeCampaign();
      else if (dailyStandalone) closeDailyStandalone();
      else if (inventoryStandalone) closeInventoryStandalone();
      else if (shopStandalone) closeShopStandalone();
      else if (!els.phoneBackdrop.hidden) closePhone();
      else if (sheetOpen) closeSheet();
      else if (overlayOpen) closeOverlay();
      return;
    }
    /* El foco no se escapa de la capa superior mientras esté abierta. */
    if (careerId || jarvisOpen || dailyStandalone || shopStandalone) trapTab(event, els.careerDialog);
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
  /* La sincronización con Google Drive se retiró a pedido de José
     (v0.27.0): el respaldo es manual, exportando el archivo. Se borra la
     metadata que la sync dejó en este aparato; la partida no se toca. */
  try { localStorage.removeItem("odea2_sync_v1"); } catch (_) { /* sin storage */ }
  setupServiceWorker();

  /* La luz depende de la hora: se revisa cada 5 minutos y al volver a la app,
     porque un teléfono puede quedar en segundo plano toda la tarde. */
  setInterval(applyAmbience, 5 * 60 * 1000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) applyAmbience();
  });
}

boot();
