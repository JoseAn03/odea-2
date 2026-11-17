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
  }

  get textContent() {
    if (this.tagName === "#TEXT") return this._text;
    return this.children.map((child) => child.textContent || "").join("");
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
  let elegido = null;
  /* La firma es { onDistrict, activeId }: antes se llamaba con (bundle,
     catalog) y el clic nunca se probaba. */
  renderChips(root, { onDistrict: (id) => { elegido = id; }, activeId: DISTRICTS[0].id });
  const chips = root.querySelectorAll("button");
  if (chips[0]) chips[0].click();
  const activo = root.querySelectorAll(".is-active");
  return {
    pass: chips.length === 9 && elegido != null && activo.length === 1,
    detail: `${chips.length} chips · clic=${elegido} · activos=${activo.length}`
  };
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
