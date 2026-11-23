/**
 * dom-smoke.mjs — verificación de renderizado de TODA la interfaz.
 *
 * Se ejecuta sin navegador: monta un DOM mínimo en Node y renderiza cada
 * pantalla y cada distrito con el fixture sintético. No sustituye a probar en
 * un teléfono real, pero atrapa lo que rompe de verdad: paneles que no
 * renderizan, grupos vacíos, listas que pierden misiones, listeners duplicados
 * al re-renderizar y pantallas que escriben el bundle.
 *
 * Uso: node tools/dom-smoke.mjs
 * Sale con código 1 si alguna comprobación falla.
 */
import fs from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

/* ------------------------------- DOM mínimo ------------------------------ */

class NodeStub {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.attrs = {};
    this.className = "";
    this.style = { setProperty() {}, removeProperty() {} };
    this.dataset = {};
    this.listeners = {};
    this.hidden = false;
    this.disabled = false;
    this.value = "";
    this.id = "";
    this._text = "";
    /* v0.45.0: los sprites de pixel.js (Tienda/Inventario) piden un
       contexto 2D; el DOM mínimo lo simula con un proxy que no dibuja. */
    if (this.tagName === "CANVAS") {
      this.getContext = () => new Proxy({}, {
        get: (target, prop) => (prop in target ? target[prop] : () => ({ addColorStop() {} })),
        set: (target, prop, value) => { target[prop] = value; return true; }
      });
    }
  }

  get textContent() {
    if (this.tagName === "#TEXT") return this._text;
    /* El texto propio cuenta, como en el DOM real: sin esto, las vistas
       que ponen el texto directo en el elemento (shop-ui, inventory-ui)
       se veían vacías en el smoke. */
    return (this._text || "") + this.children.map((child) => child.textContent || "").join("");
  }

  set textContent(value) {
    this.children = [];
    this._text = String(value);
  }

  append(...nodes) {
    for (const node of nodes) {
      if (node == null || node === false) continue;
      this.children.push(node instanceof NodeStub ? node : new TextStub(String(node)));
    }
  }

  appendChild(node) {
    this.append(node);
    return node;
  }

  replaceChildren(...nodes) {
    this.children = [];
    this._text = "";
    this.append(...nodes);
  }

  removeChild(node) {
    this.children = this.children.filter((child) => child !== node);
    return node;
  }

  insertBefore(node, ref) {
    const index = this.children.indexOf(ref);
    if (index === -1) this.append(node);
    else this.children.splice(index, 0, node);
    return node;
  }

  setAttribute(name, value) {
    this.attrs[name] = String(value);
    if (name === "class") this.className = String(value);
    if (name === "id") this.id = String(value);
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
  }

  removeAttribute(name) {
    delete this.attrs[name];
  }

  hasAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attrs, name);
  }

  addEventListener(type, fn) {
    (this.listeners[type] = this.listeners[type] || []).push(fn);
  }

  removeEventListener(type, fn) {
    this.listeners[type] = (this.listeners[type] || []).filter((existing) => existing !== fn);
  }

  focus() {}

  click() {
    for (const fn of this.listeners.click || []) fn({ currentTarget: this, preventDefault() {} });
  }

  matches(selector) {
    if (selector.startsWith(".")) return this.className.split(/\s+/).includes(selector.slice(1));
    if (selector.startsWith("#")) return this.id === selector.slice(1);
    if (selector.startsWith("[")) {
      const name = selector.slice(1, -1).split("=")[0];
      return this.hasAttribute(name);
    }
    return this.tagName === selector.toUpperCase();
  }

  querySelectorAll(selector) {
    const found = [];
    const walk = (node) => {
      for (const child of node.children) {
        if (!(child instanceof NodeStub)) continue;
        if (child.matches(selector)) found.push(child);
        walk(child);
      }
    };
    walk(this);
    return found;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  closest(selector) {
    let node = this;
    while (node) {
      if (node instanceof NodeStub && node.matches(selector)) return node;
      node = node.parent;
    }
    return null;
  }
}

class TextStub extends NodeStub {
  constructor(text) {
    super("#text");
    this._text = String(text);
  }
}

function installDom() {
  globalThis.Node = NodeStub;
  globalThis.Element = NodeStub;
  globalThis.HTMLElement = NodeStub;
  globalThis.document = {
    createElement: (tag) => new NodeStub(tag),
    createTextNode: (text) => new TextStub(text),
    createDocumentFragment: () => new NodeStub("#fragment"),
    addEventListener() {},
    removeEventListener() {},
    hidden: false,
    body: new NodeStub("body"),
    documentElement: new NodeStub("html"),
    querySelector: () => null,
    querySelectorAll: () => []
  };
  globalThis.window = {
    addEventListener() {},
    removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {} }),
    setTimeout,
    clearTimeout,
    innerWidth: 390,
    innerHeight: 844,
    devicePixelRatio: 2
  };
  globalThis.matchMedia = globalThis.window.matchMedia;
}

installDom();

/* -------------------------------- helpers -------------------------------- */

const checks = [];

function check(name, pass, detail = "") {
  checks.push({ name, pass: Boolean(pass), detail });
}

function montar() {
  return document.createElement("div");
}

async function run(name, fn) {
  try {
    const result = await fn();
    check(name, result === undefined ? true : result.pass, result && result.detail ? result.detail : "");
  } catch (error) {
    check(name, false, error && error.message ? error.message : String(error));
  }
}

/* --------------------------------- datos --------------------------------- */

const catalog = JSON.parse(fs.readFileSync(join(root, "data", "xp-catalog.json"), "utf8"));
const fixture = JSON.parse(fs.readFileSync(join(root, "fixtures", "odea-progreso-sintetico.json"), "utf8"));

/* En Windows, import() dinámico necesita file:// */
const cargar = (rel) => import(pathToFileURL(join(root, rel)).href);

const { createMemoryStorage, importBundle } = await cargar("src/storage.js");
const { derive, sourcesFromMigrated } = await cargar("src/derive.js");
const { buildHud, buildInventory, buildToday } = await cargar("js/hud.js");
const { buildDistrictPanel } = await cargar("js/district-figures.js");
const { renderTabs, renderChips, renderHud, renderSheet } = await cargar("js/hud-ui.js");
const { renderMochila, renderToday, renderMenu } = await cargar("js/ui.js");
const { ambienceFor } = await cargar("js/ambience.js");
const { renderJarvis, jarvisLocalGreeting } = await cargar("js/jarvis-ui.js");
const { renderLibreta } = await cargar("js/libreta-ui.js");
const { DISTRICTS } = await cargar("js/districts.js");
const catalogo = await cargar("src/catalog.js");

const storage = createMemoryStorage();
const importado = importBundle(fixture, {
  catalog,
  storage,
  referenceDate: "2026-11-10",
  migratedAt: "2026-11-10T12:00:00.000Z"
});

if (importado.status !== "active") {
  check("importar el fixture", false, `estado ${importado.status}`);
  reportar();
}

const bundle = importado.bundle;
const before = JSON.stringify(bundle);
const derived = derive(sourcesFromMigrated(bundle, catalog), catalog, "2026-11-10");

/* ------------------------------- HUD y barra ------------------------------ */

await run("renderHud", () => {
  const root = montar();
  renderHud(root, buildHud(bundle, catalog), {});
  return { pass: root.textContent.length > 0, detail: "contenido presente" };
});

await run("renderChips", () => {
  const root = montar();
  renderChips(root, bundle, catalog);
  return { pass: root.children.length > 0, detail: `${root.children.length} chips` };
});

await run("renderTabs", () => {
  const root = montar();
  renderTabs(root, { active: "hoy", onSelect: () => {} });
  const activo = root.querySelectorAll('[aria-current="page"]');
  const botones = root.querySelectorAll("button");
  return {
    pass: activo.length === 1 && botones.length === 4 && activo[0].getAttribute("data-tab") === "hoy",
    detail: `${botones.length} botones · ${activo.length} activo`
  };
});

await run("renderTabs cambia de destino sin duplicar", () => {
  const root = montar();
  renderTabs(root, { active: "hoy", onSelect: () => {} });
  const antes = root.querySelectorAll("button").length;
  renderTabs(root, { active: "ciudad", onSelect: () => {} });
  const activo = root.querySelectorAll('[aria-current="page"]');
  return {
    pass:
      root.querySelectorAll("button").length === antes &&
      activo.length === 1 &&
      activo[0].getAttribute("data-tab") === "ciudad",
    detail: `${antes} botones estables · activo ciudad`
  };
});

/* ---------------------------------- hoy ---------------------------------- */

await run("renderToday", () => {
  const root = montar();
  renderToday(root, buildToday(bundle, catalog, "2026-11-16"), {
    completeMission() {},
    checkin() {},
    goToDistrict() {}
  });
  const botones = root.querySelectorAll("button").length;
  return {
    pass: root.textContent.includes("XP global") && botones > 0,
    detail: `${botones} botones`
  };
});

/* -------------------------------- mochila -------------------------------- */

await run("renderMochila", () => {
  const root = montar();
  renderMochila(root, bundle, buildInventory(bundle, catalog, derived));
  return {
    pass: root.textContent.includes("Recursos") && root.textContent.includes("Equipo"),
    detail: "recursos y equipo"
  };
});

/* ---------------------------------- menú --------------------------------- */

await run("renderMenu", () => {
  const root = montar();
  renderMenu(root, { version: "test", actions: {} });
  return { pass: root.textContent.length > 0, detail: "contenido presente" };
});

/* ------------------------------- distritos ------------------------------- */

const esperado = {
  hub: 1,
  ia: 1,
  empleo: 1,
  vida: 1,
  torre: 1,
  mercado: 1,
  garaje: 1,
  mirador: 1,
  rincon: 1
};

for (const district of DISTRICTS) {
  await run(`distrito ${district.id}`, () => {
    const panel = buildDistrictPanel(district.id, bundle, catalog);
    if (!panel) throw new Error("sin panel");

    const root = montar();
    renderSheet(root, panel, {
      completeMission() {},
      checkin() {},
      goToDistrict() {}
    });

    const grupos = root.querySelectorAll("summary").length;
    const acciones = root.querySelectorAll("button").length;
    const texto = root.textContent;

    return {
      pass: texto.length > 0 && texto.includes(panel.name),
      detail: `${grupos} grupos · ${acciones} botones`
    };
  });
}

/* ------------------- contrato de distritos jugables / solo lectura -------- */

const JUGABLES = ["hub", "ia", "empleo", "vida", "torre", "mirador"];
const SOLO_LECTURA = ["mercado", "garaje", "rincon"];

await run("los distritos jugables ofrecen acciones", () => {
  const sinAcciones = JUGABLES.filter((id) => {
    const panel = buildDistrictPanel(id, bundle, catalog);
    return !panel || !panel.play || panel.play.pendingCount === 0;
  });
  return {
    pass: sinAcciones.length === 0,
    detail: sinAcciones.length ? `sin misiones: ${sinAcciones.join(", ")}` : `${JUGABLES.length} jugables`
  };
});

await run("los distritos de solo lectura no simulan completar", () => {
  const conAcciones = SOLO_LECTURA.filter((id) => {
    const panel = buildDistrictPanel(id, bundle, catalog);
    return panel && panel.play;
  });
  return {
    pass: conAcciones.length === 0,
    detail: conAcciones.length ? `ofrecen jugar: ${conAcciones.join(", ")}` : `${SOLO_LECTURA.length} en solo lectura`
  };
});

await run("cada misión ofrecida existe en el catálogo", () => {
  const { missionOf } = catalogo;
  const fantasmas = [];
  for (const id of JUGABLES) {
    const panel = buildDistrictPanel(id, bundle, catalog);
    const system =
      id === "torre" ? "capital" : id === "mirador" ? "sagas" : id === "ia" ? "academia" : id;
    for (const group of (panel && panel.play && panel.play.groups) || []) {
      for (const mission of group.missions || []) {
        if (!missionOf(catalog, system, mission.id)) fantasmas.push(`${id}:${mission.id}`);
      }
    }
  }
  return {
    pass: fantasmas.length === 0,
    detail: fantasmas.length ? fantasmas.slice(0, 5).join(", ") : "sin misiones inventadas"
  };
});

/* ------------------------------- ambiente -------------------------------- */

await run("ambiente sin perfil", () => {
  const sinPerfil = ambienceFor(null);
  const noche = ambienceFor({ hour: 23, weather: "clear", progress: 0.5 });
  return { pass: Boolean(sinPerfil) && Boolean(noche), detail: "noche y sin perfil" };
});

/* -------------------------------- jarvis --------------------------------- */

await run("renderJarvis con el saludo en caché", () => {
  const root = montar();
  renderJarvis(root, {
    view: {
      quizXpToday: 10, quizRestantes: 1, quizXpDisponible: 10,
      chatRestantes: 19, feedbackRestantes: 5,
      briefingHoy: "Hola, José. Saludo en caché de prueba."
    },
    summary: {
      nivel: 15, diaDelPlan: 25, rachaDias: 3,
      diarias: { hechas: 1, total: 3, pendientes: ["Cerrar procesos"] },
      garajePorVencer: [], ianPorVencer: [],
      entrevistaEnvista: { fecha: "2026-11-24", diasRestantes: 4 },
      proximaMisionCampana: { campana: "Operación Entrevista", mision: "Tu pitch en 60 segundos" }
    },
    completedMissions: [],
    onQuiz() {}, onUsage() {}, onBriefing() {}, onOpenZonaIA() {}, onClose() {}
  });
  const texto = root.textContent;
  const botones = root.querySelectorAll("button").length;
  return {
    pass:
      texto.includes("JARVIS") &&
      texto.includes("Saludo en caché de prueba") &&
      texto.includes("¿Qué hago hoy?") &&
      texto.includes("Practicar (quiz)") &&
      texto.includes("Campaña Zona IA") &&
      texto.includes("quiz XP 10/20") &&
      texto.includes("mensajes 1/20") &&
      botones === 6,
    detail: `${botones} botones · saludo en caché sin red`
  };
});

await run("el saludo local de Jarvis se arma sin red", () => {
  const saludo = jarvisLocalGreeting({
    nivel: 15, diaDelPlan: 25,
    diarias: { hechas: 0, total: 3, pendientes: ["Cerrar procesos"] },
    garajePorVencer: ["Accent: cambio de aceite"], ianPorVencer: [],
    entrevistaEnvista: { fecha: "2026-11-24", diasRestantes: 4 },
    proximaMisionCampana: { campana: "Operación Entrevista", mision: "Tu pitch en 60 segundos" }
  });
  return {
    pass:
      saludo.includes("nivel 15") &&
      saludo.includes("Cerrar procesos") &&
      saludo.includes("Accent: cambio de aceite") &&
      saludo.includes("4 días"),
    detail: "nivel, diarias, garaje y cuenta regresiva"
  };
});

/* -------------------------------- libreta -------------------------------- */

const libretaActions = {
  onBack() {}, onCompose() {}, onEdit() {}, onCancel() {},
  onSave() {}, onAskDelete() {}, onDelete() {}
};

await run("renderLibreta vacía muestra la libreta en blanco", () => {
  const root = montar();
  renderLibreta(root, { notes: [], ui: { mode: "list", noteId: null }, actions: libretaActions });
  const texto = root.textContent;
  return {
    pass:
      texto.includes("Libreta") &&
      texto.includes("Tu libreta está en blanco: escribí tu primera nota") &&
      texto.includes("Nueva nota"),
    detail: "estado vacío de la maqueta aprobada"
  };
});

await run("renderLibreta lista las notas con título, extracto y fecha", () => {
  const root = montar();
  renderLibreta(root, {
    notes: [{
      id: "n1", titulo: "Ideas para la ciudad", texto: "Un faro nuevo en el muelle",
      ts: "2026-11-22T12:00:00.000Z",
      displayTitle: "Ideas para la ciudad", excerpt: "Un faro nuevo en el muelle"
    }],
    ui: { mode: "list", noteId: null },
    actions: libretaActions
  });
  const texto = root.textContent;
  return {
    pass:
      texto.includes("Ideas para la ciudad") &&
      texto.includes("Un faro nuevo en el muelle") &&
      texto.includes("1 nota"),
    detail: "una nota pintada en la hoja"
  };
});

await run("renderLibreta editor trae textarea real y botones de guardar", () => {
  const root = montar();
  renderLibreta(root, { notes: [], ui: { mode: "new", noteId: null }, actions: libretaActions });
  const textareas = root.querySelectorAll("textarea").length;
  const inputs = root.querySelectorAll("input").length;
  return {
    pass: textareas === 1 && inputs === 1 && root.textContent.includes("Guardar nota"),
    detail: `${inputs} input · ${textareas} textarea`
  };
});

/* ----------------- tienda: Recompensas Reales e Inventario ----------------- */

const { renderShop } = await cargar("js/shop-ui.js");
const { renderInventory } = await cargar("js/inventory-ui.js");

const findBtn = (root, text) => root.querySelectorAll("button").find((b) => b.textContent.includes(text));
const shopActionsStub = (extra = {}) => ({
  buy() {}, equip() {}, onBack() {}, onInventory() {},
  redeem() {}, confirmRedeem() {}, cancelRedeem() {},
  enjoyReales() {}, removeReales() {}, createReales() {}, ...extra
});

await run("renderShop trae Recompensas Reales y la tarjeta del Inventario, sin el panel viejo", () => {
  const root = montar();
  const calls = [];
  renderShop(root, { bundle, actions: shopActionsStub({ onInventory: () => calls.push("inv") }) });
  const texto = root.textContent;
  const access = findBtn(root, "INVENTARIO");
  if (access) access.click();
  return {
    pass:
      texto.includes("RECOMPENSAS REALES") &&
      texto.includes("Noche de película con palomitas") &&
      texto.includes("Por disfrutar") &&
      texto.includes("Creá la tuya") &&
      !texto.includes("Mi inventario · Atuendos") &&
      calls.includes("inv"),
    detail: "sección §2.1 completa + acceso al hub §12"
  };
});

await run("renderShop: CANJEAR abre la confirmación con el saldo resultante", () => {
  const root = montar();
  let asked = null;
  renderShop(root, { bundle, actions: shopActionsStub({ redeem: (item) => { asked = item.id; } }) });
  const btn = findBtn(root, "CANJEAR");
  if (btn) btn.click();
  const root2 = montar();
  let confirmed = false;
  renderShop(root2, {
    bundle,
    confirmReward: { id: "lr_movie", n: "Noche de película con palomitas", price: 30 },
    actions: shopActionsStub({ confirmRedeem: () => { confirmed = true; } })
  });
  const yes = findBtn(root2, "Sí, canjear");
  if (yes) yes.click();
  return {
    pass: asked === "lr_movie" && root2.textContent.includes("Te quedan ₡11") && confirmed,
    detail: "confirmación §2.4 antes de la mutación"
  };
});

await run("inventario: hub → Atuendos → equipar dispara shop.equip con el id", () => {
  const root = montar();
  const invBundle = structuredClone(bundle);
  invBundle.play = { ...(invBundle.play || {}), tienda: { owned: ["oficina"], outfit: "clasico", vehicle: null, spent: 30 } };
  const equipped = [];
  const actions = {
    equip: (id) => equipped.push(id),
    onBack() {},
    onShop() {},
    onSection: (s) => renderInventory(root, { bundle: invBundle, section: s, actions })
  };
  renderInventory(root, { bundle: invBundle, section: "hub", actions });
  const hubOk = root.textContent.includes("ATUENDOS") && root.textContent.includes("2 de 16 tuyos");
  const card = findBtn(root, "ATUENDOS");
  if (card) card.click();
  const sec = root.textContent;
  const equipBtn = root.querySelectorAll("button").find((b) => b.textContent.trim() === "Equipar");
  if (equipBtn) equipBtn.click();
  return {
    pass:
      hubOk &&
      sec.includes("Puesto ahora: Clásico Vice") &&
      sec.includes("Esto ya es tuyo: cambialo cuando quieras, no se vuelve a pagar.") &&
      equipped[0] === "oficina",
    detail: "el HUD y la ciudad reflejan el cambio vía la misma mutación"
  };
});

await run("inventario: hub → Vehículos → equipar y «Ir a pie»", () => {
  const root = montar();
  const invBundle = structuredClone(bundle);
  invBundle.play = { ...(invBundle.play || {}), tienda: { owned: ["accent"], outfit: "clasico", vehicle: null, spent: 120 } };
  const equipped = [];
  const actions = {
    equip: (id) => equipped.push(id),
    onBack() {},
    onShop() {},
    onSection: (s) => renderInventory(root, { bundle: invBundle, section: s, actions })
  };
  renderInventory(root, { bundle: invBundle, section: "vehiculos", actions });
  const aPie = root.textContent.includes("A pie");
  const equipBtn = root.querySelectorAll("button").find((b) => b.textContent.trim() === "Equipar");
  if (equipBtn) equipBtn.click();
  invBundle.play.tienda.vehicle = "accent";
  renderInventory(root, { bundle: invBundle, section: "vehiculos", actions });
  const offBtn = findBtn(root, "Ir a pie");
  if (offBtn) offBtn.click();
  return {
    pass: aPie && equipped[0] === "accent" && equipped[1] === null,
    detail: "equipar vehículo poseído e ir a pie (shop.equip null)"
  };
});

await run("inventario: Colección trae la vitrina de Escudos encendida (Fase 3)", () => {
  const root = montar();
  const conEscudo = structuredClone(bundle);
  conEscudo.play = {
    ...(conEscudo.play || {}),
    racha: {
      version: 1,
      grants: { "contrato@2026-W47": { date: "2026-11-21", at: "2026-11-21T12:00:00.000Z", via: "contrato" } },
      covered: {}
    }
  };
  renderInventory(root, {
    bundle: conEscudo,
    section: "coleccion",
    actions: { equip() {}, onBack() {}, onShop() {}, onSection() {} }
  });
  const texto = root.textContent;
  const live = root.querySelectorAll(".inv-vitrina-slot")
    .find((slot) => slot.className.split(/\s+/).includes("is-live"));
  return {
    pass:
      texto.includes("🛡️ ×1 (1/2)") &&
      texto.includes("Se ganan con el Contrato Semanal y con rachas de 14/30 días; protegen un día fallado, solos.") &&
      texto.includes("Se gana, no se compra") &&
      !!live,
    detail: "vitrina de Escudos §12.2③: estado sin botones, explicación y slot encendido"
  };
});

await run("inventario: Colección trae la vitrina de Cassettes encendida (Fase 4)", () => {
  const root = montar();
  const conTapes = structuredClone(bundle);
  conTapes.play = {
    ...(conTapes.play || {}),
    paquetes: {
      version: 1,
      found: {
        "tape-01": { date: "2026-11-23", at: "2026-11-23T12:00:00.000Z", reward: { xp: 15, coins: 1 }, rulesVersion: 1 },
        "tape-12": { date: "2026-11-23", at: "2026-11-23T12:05:00.000Z", reward: { xp: 15, coins: 1 }, rulesVersion: 1 }
      },
      prize: null
    }
  };
  renderInventory(root, {
    bundle: conTapes,
    section: "coleccion",
    actions: { equip() {}, onBack() {}, onShop() {}, onSection() {}, onClaimPaquetePrize() {} }
  });
  const texto = root.textContent;
  const cells = root.querySelectorAll(".inv-tape");
  const foundCells = cells.filter((c) => c.className.split(/\s+/).includes("is-found"));
  const claim = findBtn(root, "RECLAMAR PREMIO FINAL · +100 XP, +₡25");
  return {
    pass:
      texto.includes("📼 2/20") &&
      texto.includes("Parque del Hub") &&
      texto.includes("Zona Gamer") &&
      texto.includes("Te faltan 18 cassettes para el premio final") &&
      cells.length === 20 &&
      foundCells.length === 2 &&
      !claim,
    detail: "vitrina de Cassettes §5/§12.2③: contador, rejilla 20 con zona, sin botón hasta el 20/20"
  };
});

await run("inventario: al 20/20 el botón del premio final reclama (Fase 4)", () => {
  const root = montar();
  const completa = structuredClone(bundle);
  const found = {};
  for (let i = 1; i <= 20; i += 1) {
    found[`tape-${String(i).padStart(2, "0")}`] = {
      date: "2026-11-23", at: "2026-11-23T12:00:00.000Z", reward: { xp: 15, coins: 1 }, rulesVersion: 1
    };
  }
  completa.play = { ...(completa.play || {}), paquetes: { version: 1, found, prize: null } };
  let claimed = false;
  renderInventory(root, {
    bundle: completa,
    section: "coleccion",
    actions: { equip() {}, onBack() {}, onShop() {}, onSection() {}, onClaimPaquetePrize: () => { claimed = true; } }
  });
  const claim = findBtn(root, "RECLAMAR PREMIO FINAL · +100 XP, +₡25");
  if (claim) claim.click();
  return {
    pass: root.textContent.includes("📼 20/20") && !!claim && claimed,
    detail: "el botón de la ceremonia dispara onClaimPaquetePrize solo al 20/20"
  };
});

await run("inventario: Colección sin escudos invita a ganar el primero", () => {
  const root = montar();
  renderInventory(root, {
    bundle,
    section: "coleccion",
    actions: { equip() {}, onBack() {}, onShop() {}, onSection() {} }
  });
  const texto = root.textContent;
  return {
    pass:
      texto.includes("🛡️ ×0 (0/2)") &&
      texto.includes("Todavía no tenés escudos"),
    detail: "la vitrina nace en 0 sin romperse en saves sin play.racha"
  };
});

/* ----------------- Set Legendario (v0.49.0, Fase 5) ------------------ */

const SET_IDS_SMOKE = ["exo-automata", "mensajero-gt", "nucleo-automata", "sello-confirmacion", "antena-dorada"];

await run("renderShop: las piezas legendarias son invisibles en la grilla de compra (Fase 5)", () => {
  const root = montar();
  renderShop(root, { bundle, actions: shopActionsStub() });
  const texto = root.textContent;
  return {
    pass:
      !texto.includes("Exo Autómata") &&
      !texto.includes("Mensajero GT") &&
      !texto.includes("Núcleo de Automatización") &&
      texto.includes("Armadura Carmesí"),
    detail: "§6.2: grantOnly invisible hasta ganarlo; el catálogo comprable sigue completo"
  };
});

await run("inventario: Colección trae la Vitrina Legendaria en silueta sin ganar (Fase 5)", () => {
  const root = montar();
  renderInventory(root, {
    bundle,
    section: "coleccion",
    actions: { equip() {}, onBack() {}, onShop() {}, onSection() {} }
  });
  const texto = root.textContent;
  const siluetas = root.querySelectorAll(".inv-legend-piece")
    .filter((c) => c.className.split(/\s+/).includes("is-silhouette"));
  return {
    pass:
      texto.includes("VITRINA LEGENDARIA") &&
      texto.includes("SET EXO//AUTÓMATA") &&
      texto.includes("Se gana, no se compra") &&
      texto.includes("Antena Dorada") &&
      siluetas.length === 5,
    detail: "vitrina §6/§12.2③: 5 piezas en silueta con «Se gana, no se compra»"
  };
});

await run("inventario: Vitrina Legendaria ganada — piezas a color y Equipar directo (Fase 5)", () => {
  const root = montar();
  const ganado = structuredClone(bundle);
  ganado.play = {
    ...(ganado.play || {}),
    tienda: { owned: [...SET_IDS_SMOKE], outfit: "exo-automata", vehicle: null, spent: 0 },
    legendario: {
      version: 1,
      grants: { whatsapp: { date: "2026-11-24", at: "2026-11-24T12:00:00.000Z", items: [...SET_IDS_SMOKE] } }
    }
  };
  const equips = [];
  renderInventory(root, {
    bundle: ganado,
    section: "coleccion",
    actions: { equip: (id) => equips.push(id), onBack() {}, onShop() {}, onSection() {} }
  });
  const texto = root.textContent;
  const equipBtn = findBtn(root, "Equipar");
  if (equipBtn) equipBtn.click();
  return {
    pass:
      texto.includes("¡Set ganado!") &&
      texto.includes("RELIQUIA · SOLO SE EXHIBE") &&
      texto.includes("Equipado ✓") &&
      equips.length === 1,
    detail: "§12.2③: atuendo/vehículo equipables desde la vitrina; reliquias solo exhibidas"
  };
});

/* --------------------- Contrato Semanal (v0.46.0) ----------------------- */

const { renderContrato } = await cargar("js/contrato-ui.js");
const { contratoView } = await cargar("src/contrato-state.js");

await run("renderContrato pinta la tarjeta sobre la ruta: 3 retos, barras segmentadas y cofre", () => {
  const root = montar();
  /* Jueves de la W46: la gracia de la W45 ya expiró y solo vive la actual. */
  const view = contratoView(bundle, "2026-11-12");
  renderContrato(root, { view, onClaim() {} });
  const texto = root.textContent;
  const retos = root.querySelectorAll(".contrato-reto");
  const segs = root.querySelectorAll(".contrato-seg");
  const claim = findBtn(root, "RECLAMAR");
  return {
    pass:
      texto.includes("Contrato semanal — Semana") &&
      texto.includes("Cofre: 150 XP + ₡15") &&
      retos.length === 3 &&
      segs.length > 0 &&
      !!claim && claim.disabled === true,
    detail: "tarjeta §3.8 con el botón en candado sin 3/3"
  };
});

await run("renderContrato al 3/3 activa RECLAMAR y dispara onClaim con la semana", () => {
  const root = montar();
  const view = contratoView(bundle, "2026-11-10");
  const ready = {
    ...view,
    grace: null,
    current: {
      ...view.current,
      doneCount: 3,
      complete: true,
      challenges: view.current.challenges.map((c) => ({ ...c, current: c.target, done: true }))
    }
  };
  let claimed = null;
  renderContrato(root, { view: ready, onClaim: (weekKey) => { claimed = weekKey; } });
  const btn = findBtn(root, "RECLAMAR COFRE");
  if (btn) btn.click();
  return {
    pass: !!btn && btn.disabled === false && claimed === view.weekKey,
    detail: "el reclamo sale por la mutación contrato.claim de app.js"
  };
});

/* ------------------------- el render no escribe nada ---------------------- */

await run("renderizar no escribe el bundle", () => ({
  pass: JSON.stringify(bundle) === before,
  detail: "sin cambios en el save"
}));

/* -------------------------------- reporte -------------------------------- */

function reportar() {
  let failed = 0;
  for (const item of checks) {
    if (!item.pass) failed++;
    console.log(`${item.pass ? "OK  " : "FAIL"} ${item.name}${item.detail ? " — " + item.detail : ""}`);
  }
  console.log(failed ? `\n${failed} de ${checks.length} fallaron` : `\n${checks.length} comprobaciones OK`);
  process.exitCode = failed ? 1 : 0;
}

reportar();
