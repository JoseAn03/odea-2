import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { renderCampaign } from "../js/campaign-ui.js";
import { renderHud } from "../js/hud-ui.js";
import { renderCharacter } from "../js/ui.js";
import { campaignView } from "../src/campaign-state.js";
import { newPlayerBundle } from "../src/new-player.js";
import { createMemoryStorage, importBundle, applyGameplayMutation, STORAGE_KEYS } from "../src/storage.js";
import { createInput } from "../js/city/input.js";
import { clipsRect } from "../js/city/layout.js";
import { getDistrict } from "../js/districts.js";

// Deterministic DOM boundary, not a browser/layout simulation.
const roots = new Set();
class Element {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.dataset = {}; this.attrs = {};
    this.listeners = {}; this.className = ""; this._text = ""; this.id = "";
    this.style = { setProperty() {} }; this.scrollTop = 0; this.value = ""; this.disabled = false;
    this.classList = {
      add: (c) => { this.className += ` ${c}`; },
      remove: (c) => { this.className = this.className.split(" ").filter((x) => x !== c).join(" "); }
    };
  }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(""); }
  set textContent(v) { this._text = String(v); this.children = []; }
  append(...nodes) {
    for (const n of nodes) {
      const child = n instanceof Element ? n : Object.assign(new Element("#text"), { _text: String(n) });
      child.parent = this; this.children.push(child);
    }
  }
  replaceChildren(...nodes) { this._text = ""; this.children = []; this.append(...nodes); }
  get childElementCount() { return this.children.length; }
  get lastElementChild() { return this.children.at(-1); }
  contains(target) { return !!target && (target === this || this.children.some((c) => c.contains(target))); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  addEventListener(k, fn) { (this.listeners[k] ||= []).push(fn); }
  removeEventListener(k, fn) { this.listeners[k] = (this.listeners[k] || []).filter((x) => x !== fn); }
  matches(selector) {
    if (selector.startsWith(".")) return this.className.split(/\s+/).includes(selector.slice(1));
    if (selector.startsWith("[")) {
      const name = selector.slice(1, -1);
      if (name.startsWith("data-")) {
        const key = name.slice(5).replace(/-([a-z])/g, (_, x) => x.toUpperCase());
        return key in this.dataset;
      }
      return name in this.attrs;
    }
    return this.tagName === selector;
  }
  querySelectorAll(selector) {
    const matches = []; const selectors = selector.split(",").map((s) => s.trim());
    const walk = (e) => e.children.forEach((c) => {
      if (selectors.some((s) => c.matches(s))) matches.push(c);
      walk(c);
    });
    walk(this); return matches;
  }
  querySelector(s) { return this.querySelectorAll(s)[0] || null; }
  focus() { document.activeElement = this; }
  setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; }
  setCustomValidity() {}
  reportValidity() {}
  scrollIntoView() {}
  async fire(type, extra = {}) {
    return Promise.all((this.listeners[type] || []).map((fn) => fn({ preventDefault() {}, target: this, ...extra })));
  }
}
globalThis.document = {
  baseURI: "https://example.test/odea-2/",
  createElement: (tag) => new Element(tag),
  createTextNode: (value) => Object.assign(new Element("#text"), { _text: String(value) }),
  activeElement: null,
  getElementById: (id) => {
    for (const root of roots) {
      const all = [root, ...root.querySelectorAll("input, textarea, h1")];
      const match = all.find((e) => e.id === id); if (match) return match;
    }
    return null;
  }
};
const catalog = JSON.parse(fs.readFileSync(new URL("../data/xp-catalog.json", import.meta.url)));
const date = "2026-11-17";
const options = { date, at: "2026-11-17T12:00:00Z" };
globalThis.Node = Element;

test("HUD: retrato pixel del atuendo, saldo ₡ con economía canónica y racha con estrella pixel", () => {
  const root = new Element("header");
  renderHud(root, {
    playerName: "Mira", level: 2, odeLevel: 3, totalXP: 125,
    xp: { atMax: false, ratio: 0.5, current: 25, next: 50 },
    coins: { balance: 12, earned: 20, spent: 8 }, streak: 5
  }, {});
  /* v0.43.0: el chip de estrella genérico es ahora el retrato pixel del
   * atuendo equipado (sin outfitId en el modelo → respaldo clásico). */
  const avatarImg = root.querySelector(".hud-avatar").querySelector("img");
  assert.equal(avatarImg.getAttribute("src"), "assets/hud-look-clasico.svg");
  assert.ok(root.textContent.includes("₡12"));
  const coinsChip = root.querySelector(".hud-chip");
  assert.ok(coinsChip.className.includes("coins"));
  assert.equal(coinsChip.querySelector("img").getAttribute("src"), "assets/hud-coin.svg");
  assert.ok(coinsChip.getAttribute("title").includes("Saldo virtual ODEA"));
  const streakChip = root.querySelectorAll(".hud-chip")[1];
  assert.ok(streakChip.className.includes("streak"));
  assert.equal(streakChip.querySelector("img").getAttribute("src"), "assets/hud-star.svg");
  assert.equal(streakChip.querySelector(".hud-chip-value").textContent, "5");
});

test("Personaje: renderCharacter existe y pinta la tarjeta con el saldo ₡", () => {
  const bundle = newPlayerBundle(catalog, { name: "Mira", date });
  const root = new Element("div");
  renderCharacter(root, bundle);
  assert.ok(root.textContent.includes("Saldo ODEA"));
  assert.ok(root.textContent.includes("₡"));
});

function setup() {
  const storage = createMemoryStorage();
  importBundle(newPlayerBundle(catalog, { date }), { storage, catalog, referenceDate: date });
  return storage;
}
const saved = (s) => JSON.parse(s.getItem(STORAGE_KEYS.bundle));
function mount(s, id, compact = false, callbacks = {}) {
  const root = new Element("main"); roots.add(root);
  const update = () => renderCampaign(root, {
    view: campaignView(saved(s), id), compact, onBack() {}, ...callbacks
  });
  update(); return { root, update };
}

test("UI: ambas campañas muestran escena, ocho capítulos, seis misiones y notas, sin escribir", () => {
  const s = setup(); const before = s.getItem(STORAGE_KEYS.bundle);
  for (const id of ["brete", "gamer"]) {
    for (const compact of [false, true]) {
      const { root } = mount(s, id, compact);
      assert.equal(root.querySelector("img").src, `assets/slots/${id}.webp`);
      assert.equal(root.querySelectorAll(".campaign-chapter").length, 8);
      assert.equal(root.querySelectorAll(".campaign-mission").length, 6);
      assert.equal(root.querySelectorAll(".campaign-evidence-form").length, 1);
      assert.ok(root.textContent.includes("₡ ODEA son recompensas virtuales"));
      assert.equal(root.querySelectorAll(".campaign-application-form").length, id === "brete" ? 1 : 0);
    }
  }
  assert.equal(s.getItem(STORAGE_KEYS.bundle), before);
});

test("UI → dominio → save → mapa/teléfono: una entrega paga una sola vez", async () => {
  const s = setup();
  const callbacks = {
    onComplete: async (missionId, evidence) => {
      const result = applyGameplayMutation(s, catalog, { type: "campaign.complete", missionId, evidence }, options);
      return { ok: result.status === "applied" };
    }
  };
  const map = mount(s, "gamer", false, callbacks);
  const phone = mount(s, "gamer", true, callbacks);
  const input = map.root.querySelector("textarea");
  input.value = "Grabación propia preparada y permisos de uso documentados.";
  await input.fire("input");
  const form = map.root.querySelector("form");
  await Promise.all([form.fire("submit"), form.fire("submit")]);
  assert.equal(campaignView(saved(s), "gamer").done, 1);
  map.update(); phone.update();
  assert.ok(map.root.textContent.includes("1 / 48 misiones"));
  assert.ok(phone.root.textContent.includes("1 / 48 misiones"));
  assert.equal(phone.root.querySelectorAll(".campaign-evidence-form").length, 1);
  assert.ok(phone.root.textContent.includes("Grabación propia"));
});

test("UI: disparo sólo tras guardado confirmado; bloquea doble submit y envía sólo campos", async () => {
  const s = setup(); let payload; let release; let calls = 0;
  const gate = new Promise((resolve) => { release = resolve; });
  const { root, update } = mount(s, "brete", true, {
    onApply: async (data) => {
      calls++; payload = data; await gate;
      const r = applyGameplayMutation(s, catalog, { type: "application.record", ...data,
        requestId: "ui_application_one", expectedCount: 0 }, options);
      return { ok: r.status === "applied" };
    }
  });
  const form = root.querySelector(".campaign-application-form");
  const first = form.fire("submit"); const second = form.fire("submit");
  assert.equal(calls, 1);
  assert.equal(root.querySelectorAll(".campaign-target--hit").length, 0);
  release(); await Promise.all([first, second]);
  assert.deepEqual(Object.keys(payload).sort(), ["company", "note", "role"]);
  assert.equal(root.querySelectorAll(".campaign-target--hit").length, 1);
  update();
  assert.ok(root.textContent.includes("25 XP · +2 ₡ ODEA virtuales"));
  assert.equal(campaignView(saved(s), "brete").applications.count, 1);
});

test("UI: error de escritura conserva nota, no muestra premio y puede reintentarse", async () => {
  const s = setup();
  const { root } = mount(s, "brete", false, { onApply: async () => ({ ok: false, message: "No hay espacio disponible." }) });
  const field = root.querySelector(".campaign-application-form").querySelectorAll("input")[0];
  field.value = "Empresa con seguimiento"; await field.fire("input");
  await root.querySelector(".campaign-application-form").fire("submit");
  assert.equal(root.querySelectorAll(".campaign-target--hit").length, 0);
  assert.ok(root.textContent.includes("No hay espacio disponible."));
  assert.equal(root.querySelector(".campaign-application-form").querySelectorAll("input")[0].value, "Empresa con seguimiento");
  assert.equal(campaignView(saved(s), "brete").applications.count, 0);
});

test("UI: cambiar capítulo conserva selección, y un respaldo anterior elimina estados optimistas", async () => {
  const s = setup(); const before = saved(s);
  const { root, update } = mount(s, "gamer", false, {
    onComplete: async (missionId, evidence) => ({
      ok: applyGameplayMutation(s, catalog, { type: "campaign.complete", missionId, evidence }, options).status === "applied"
    })
  });
  const input = root.querySelector("textarea"); input.value = "Entrega propia revisada y registrada.";
  await input.fire("input"); await root.querySelector("form").fire("submit");
  renderCampaign(root, { view: campaignView(before, "gamer") });
  assert.equal(root.querySelectorAll(".campaign-mission--done").length, 0, "un optimista anterior no se vuelve una completación fantasma");
  await root.querySelectorAll(".campaign-chapter")[2].fire("click");
  const selected = root.dataset.campaignChapter;
  update();
  assert.equal(root.dataset.campaignChapter, selected);
});

test("mapa: tocar el cuadro gamer y empleo devuelve el destino correcto", async () => {
  const canvas = new Element("canvas");
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0 });
  canvas.setPointerCapture = () => {};
  const selected = [];
  const input = createInput({ canvas,
    camera: { screenToWorld: (x, y) => ({ x, y }) },
    onSelectDistrict: (id) => selected.push(id)
  });
  for (const r of [clipsRect(), getDistrict("empleo").rect]) {
    const event = { clientX: r.x + r.w / 2, clientY: r.y + r.h / 2, pointerId: 1, pointerType: "mouse", button: 0 };
    await canvas.fire("pointerdown", event); await canvas.fire("pointerup", event);
  }
  assert.deepEqual(selected, ["gamer", "empleo"]);
  input.destroy();
});

test("entrega: assets y módulos precacheados existen; teléfono enlaza campañas y mapa", () => {
  const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  for (const [, path] of sw.matchAll(/"(\.\/[^"]*)"/g)) {
    assert.ok(fs.existsSync(new URL(`../${path}`, import.meta.url)), path);
  }
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  for (const id of ["brete", "gamer", "map", "missions"]) assert.ok(html.includes(`data-app="${id}"`));
  assert.ok(!html.includes("phone-soon"));
  const app = fs.readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
  assert.ok(app.includes('if (id === "gamer" || id === "empleo")'));
  assert.ok(app.includes("applyGameplayMutationLocked(storage, catalog, mutation"));
});

test("Set Legendario (v0.49.0): la vitrina dorada aparece solo con la campaña completa y RECLAMAR SET dispara onClaimLegendary", async () => {
  const { shopItem } = await import("../src/shop.js");
  const ids = ["exo-automata", "mensajero-gt", "nucleo-automata", "sello-confirmacion", "antena-dorada"];
  const view = {
    id: "whatsapp", name: "Operación Confirmación", subtitle: "El evento de confirmación de reservas.",
    goal: "Automatizar la confirmación.", chapters: [], done: 14, total: 14, percent: 100,
    rank: "Automatizador de Reservas", next: null,
    applications: { count: 0, totalXP: 0, totalCoins: 0, recent: [] }
  };
  const legendary = {
    campaignId: "whatsapp", name: "EXO//AUTÓMATA", campaignName: "Operación Confirmación",
    complete: true, claimed: false, canClaim: true,
    pieces: ids.map((id) => ({ item: shopItem(id), owned: false }))
  };
  const root = new Element("main"); roots.add(root);
  let claimedId = null;
  renderCampaign(root, {
    view, legendary,
    onClaimLegendary: async (id) => { claimedId = id; return { ok: true }; },
    onComplete() {}, onApply() {}, onBack() {}
  });
  assert.ok(root.textContent.includes("🏆 SET LEGENDARIO — EXO//AUTÓMATA"));
  assert.ok(root.textContent.includes("Completaste Operación Confirmación. Este set no se compra: se gana."));
  assert.ok(root.textContent.includes("Mensajero GT"));
  assert.ok(root.textContent.includes("Antena Dorada"));
  const claim = root.querySelectorAll("button").find((b) => b.textContent.includes("RECLAMAR SET"));
  assert.ok(claim, "el botón RECLAMAR SET existe");
  await claim.fire("click");
  assert.equal(claimedId, "whatsapp");

  /* Sin completar, la vitrina no aparece. */
  const root2 = new Element("main"); roots.add(root2);
  renderCampaign(root2, {
    view: { ...view, done: 9, percent: 64 },
    legendary: { ...legendary, complete: false, canClaim: false },
    onClaimLegendary: async () => ({ ok: true }), onComplete() {}, onApply() {}, onBack() {}
  });
  assert.ok(!root2.textContent.includes("SET LEGENDARIO —"));

  /* Reclamado: la vitrina muestra la confirmación, sin botón. */
  const root3 = new Element("main"); roots.add(root3);
  renderCampaign(root3, {
    view, legendary: { ...legendary, claimed: true, canClaim: false },
    onClaimLegendary: async () => ({ ok: true }), onComplete() {}, onApply() {}, onBack() {}
  });
  assert.ok(root3.textContent.includes("✨ ¡Set EXO//AUTÓMATA en tu inventario! El atuendo ya está equipado."));
  assert.ok(!root3.querySelectorAll("button").some((b) => b.textContent.includes("RECLAMAR SET")));
});
