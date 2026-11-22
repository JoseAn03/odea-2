import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  LIBRETA_MAX_NOTES,
  libretaProblems,
  libretaStateOf,
  libretaView,
} from "../src/libreta-state.js";
import { applyMutation } from "../src/gameplay.js";
import {
  STORAGE_KEYS, createMemoryStorage, importBundle, applyGameplayMutation,
  readOdea2, restoreBundle,
} from "../src/storage.js";
import { derive, sourcesFromMigrated } from "../src/derive.js";
import { validatePlayState } from "../src/validate.js";

const catalog = JSON.parse(fs.readFileSync(new URL("../data/xp-catalog.json", import.meta.url)));
const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/odea-progreso-sintetico.json", import.meta.url)));
const date = "2026-11-22";

function fresh() {
  const storage = createMemoryStorage();
  const imported = importBundle(structuredClone(fixture), {
    storage, catalog, referenceDate: "2026-11-10", migratedAt: "2026-11-10T12:00:00.000Z"
  });
  assert.equal(imported.status, "active");
  return storage;
}
const saved = (s) => JSON.parse(s.getItem(STORAGE_KEYS.bundle));
const opts = (second = 0) => ({
  date, at: new Date(Date.UTC(2026, 10, 22, 12, 0, second)).toISOString()
});
const derived = (s) => derive(sourcesFromMigrated(saved(s), catalog), catalog, "2026-11-10");
const create = (s, id, titulo, texto, second = 0) =>
  applyGameplayMutation(s, catalog, { type: "libreta.create", id, titulo, texto }, opts(second));
const update = (s, id, titulo, texto, second = 0) =>
  applyGameplayMutation(s, catalog, { type: "libreta.update", id, titulo, texto }, opts(second));
const remove = (s, id, second = 0) =>
  applyGameplayMutation(s, catalog, { type: "libreta.delete", id }, opts(second));

test("libreta: un save sin play.libreta (versión anterior) carga válido y con la libreta vacía", () => {
  const s = fresh();
  const bundle = saved(s);
  assert.equal(bundle.play?.libreta, undefined, "el fixture importado no trae la sección nueva");
  assert.deepEqual(libretaStateOf(bundle), { notes: [] });
  assert.deepEqual(libretaView(bundle), { notes: [], count: 0 });
  assert.deepEqual(libretaProblems(bundle), []);
  /* La primera escritura sobre ese save viejo pasa la validación completa
     del pipeline (validatePlayState corre dentro de applyGameplayMutation)
     y crea la sección sin tocar nada más: es la prueba de migración. */
});

test("libreta: crear una nota la guarda con título, texto y fecha, sin tocar XP ni monedas", () => {
  const s = fresh();
  const before = derived(s);
  const result = create(s, "nota-1", "Ideas para la ciudad", "Un faro nuevo en el muelle");
  assert.equal(result.status, "applied");
  const bundle = saved(s);
  assert.equal(bundle.play.libreta.notes.length, 1);
  const [note] = bundle.play.libreta.notes;
  assert.equal(note.id, "nota-1");
  assert.equal(note.titulo, "Ideas para la ciudad");
  assert.equal(note.texto, "Un faro nuevo en el muelle");
  assert.equal(note.ts, opts(0).at);
  const after = derived(s);
  assert.equal(after.totalXP, before.totalXP, "la libreta no da XP");
  assert.equal(after.coins.balance, before.coins.balance, "la libreta no da monedas");
  assert.deepEqual(after.xpBreakdown, before.xpBreakdown);
});

test("libreta: la vista ordena por edición reciente y resuelve título y extracto", () => {
  const s = fresh();
  create(s, "a", "Primera", "texto uno", 0);
  create(s, "b", "", "Solo cuerpo, sin título\nsegunda línea", 30);
  const view = libretaView(saved(s));
  assert.equal(view.count, 2);
  assert.equal(view.notes[0].id, "b", "la editada/creada más reciente va primero");
  assert.equal(view.notes[0].displayTitle, "Solo cuerpo, sin título");
  assert.equal(view.notes[0].excerpt, "Solo cuerpo, sin título segunda línea");
  assert.equal(view.notes[1].displayTitle, "Primera");
});

test("libreta: crear con un id repetido es duplicado y no toca el save", () => {
  const s = fresh();
  create(s, "nota-1", "Una", "texto");
  const rawBefore = s.getItem(STORAGE_KEYS.bundle);
  const result = create(s, "nota-1", "Otra", "otro texto", 5);
  assert.equal(result.status, "duplicate");
  assert.equal(s.getItem(STORAGE_KEYS.bundle), rawBefore);
});

test("libreta: una nota vacía (sin título ni texto) se rechaza sin tocar el save", () => {
  const s = fresh();
  const rawBefore = s.getItem(STORAGE_KEYS.bundle);
  assert.notEqual(create(s, "nota-1", "   ", "  \n ").status, "applied");
  assert.notEqual(create(s, "nota-1", "", "").status, "applied");
  assert.equal(s.getItem(STORAGE_KEYS.bundle), rawBefore);
});

test("libreta: editar cambia título y texto, renueva la fecha y sube la nota al frente", () => {
  const s = fresh();
  create(s, "a", "Vieja", "texto viejo", 0);
  create(s, "b", "Otra", "texto", 10);
  const result = update(s, "a", "Nueva", "texto nuevo", 40);
  assert.equal(result.status, "applied");
  const view = libretaView(saved(s));
  assert.equal(view.notes[0].id, "a");
  assert.equal(view.notes[0].titulo, "Nueva");
  assert.equal(view.notes[0].texto, "texto nuevo");
  assert.equal(view.notes[0].ts, opts(40).at);
});

test("libreta: editar sin cambios es duplicado; editar o borrar un id desconocido se rechaza", () => {
  const s = fresh();
  create(s, "a", "Título", "texto");
  assert.equal(update(s, "a", "Título", "texto", 5).status, "duplicate");
  const rawBefore = s.getItem(STORAGE_KEYS.bundle);
  assert.notEqual(update(s, "no-existe", "X", "y", 6).status, "applied");
  assert.notEqual(remove(s, "no-existe", 7).status, "applied");
  assert.equal(s.getItem(STORAGE_KEYS.bundle), rawBefore);
});

test("libreta: borrar quita la nota y la libreta puede quedar vacía otra vez", () => {
  const s = fresh();
  create(s, "a", "Una", "texto");
  create(s, "b", "Dos", "texto");
  assert.equal(remove(s, "a", 5).status, "applied");
  assert.deepEqual(libretaStateOf(saved(s)).notes.map((n) => n.id), ["b"]);
  assert.equal(remove(s, "b", 6).status, "applied");
  assert.deepEqual(libretaView(saved(s)), { notes: [], count: 0 });
});

test("libreta: las notas persisten tras recargar el save desde el storage crudo", () => {
  const s = fresh();
  create(s, "a", "Persistente", "esto tiene que seguir ahí");
  const reloaded = readOdea2(s);
  assert.equal(libretaStateOf(reloaded).notes.length, 1);
  assert.equal(libretaStateOf(reloaded).notes[0].titulo, "Persistente");
  /* Y una segunda sesión sobre el mismo storage crudo sigue editando. */
  assert.equal(update(s, "a", "Persistente 2", "sigue ahí", 9).status, "applied");
  assert.equal(libretaStateOf(readOdea2(s)).notes[0].titulo, "Persistente 2");
});

test("libreta: el respaldo exportado incluye las notas y restaurarlas las conserva", () => {
  const s = fresh();
  create(s, "a", "Para el respaldo", "contenido importante");
  create(s, "b", "", "otra nota");
  /* El respaldo manual de la app es el bundle completo en JSON. */
  const exported = JSON.parse(JSON.stringify(readOdea2(s)));
  assert.equal(exported.play.libreta.notes.length, 2);

  const target = createMemoryStorage();
  const { bundle } = restoreBundle(exported, { storage: target, catalog });
  assert.equal(bundle.import.state, "active");
  assert.deepEqual(
    libretaStateOf(readOdea2(target)).notes.map((n) => n.id).sort(),
    ["a", "b"]
  );
  assert.equal(libretaStateOf(readOdea2(target)).notes.find((n) => n.id === "a").texto, "contenido importante");
});

test("libreta: un play.libreta corrupto lo reportan libretaProblems y validatePlayState", () => {
  const s = fresh();
  const bundle = saved(s);
  bundle.play = {
    version: 3, completions: {}, checkins: {},
    libreta: { notes: [{ id: "", titulo: 5, texto: "x", ts: "no-es-fecha" }, "basura"] },
  };
  const problems = libretaProblems(bundle);
  assert.ok(problems.length >= 3, problems.join("; "));
  assert.equal(validatePlayState(bundle, catalog, {}).ok, false);
  /* Y la lectura segura no revienta: filtra lo inválido. */
  assert.deepEqual(libretaStateOf(bundle), { notes: [] });
});

test("libreta: el tope de notas protege el guardado (LIBRETA_FULL)", () => {
  const s = fresh();
  const bundle = saved(s);
  bundle.play = bundle.play || {};
  bundle.play.libreta = {
    notes: Array.from({ length: LIBRETA_MAX_NOTES }, (_, i) => ({
      id: `n${i}`, titulo: `Nota ${i}`, texto: "x", ts: "2026-11-22T12:00:00.000Z"
    }))
  };
  const result = applyMutation(bundle, { type: "libreta.create", id: "una-mas", titulo: "X", texto: "y" }, catalog, opts());
  assert.equal(result.changed, false);
  assert.equal(result.reason, "LIBRETA_FULL");
});

test("libreta: la app del teléfono existe, con su ícono pixel art, y despacha a showPhoneLibreta", () => {
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.ok(html.includes('data-app="libreta"'), "la pantalla principal del teléfono tiene la app Libreta");
  assert.ok(html.includes("assets/libreta.svg"), "el ícono de la app es la libreta pixel art");
  const app = fs.readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
  assert.ok(app.includes('app === "libreta"'), "el teléfono despacha la app Libreta");
  assert.ok(app.includes("showPhoneLibreta()"), "la app abre la libreta en el teléfono");
  const icon = fs.readFileSync(new URL("../assets/libreta.svg", import.meta.url), "utf8");
  assert.ok(icon.includes('shape-rendering="crispEdges"'), "el ícono es pixel art de bordes duros");
});

test("libreta: la UI no escribe el guardado y trae el estado vacío aprobado", () => {
  const ui = fs.readFileSync(new URL("../js/libreta-ui.js", import.meta.url), "utf8");
  assert.ok(!/localStorage|saveOdea2|setItem\s*\(/.test(ui), "la UI de la Libreta no toca el storage");
  assert.ok(ui.includes("Tu libreta está en blanco: escribí tu primera nota"), "estado vacío de la maqueta aprobada");
  assert.ok(ui.includes('createElement("textarea")') || ui.includes('"textarea"'), "el editor usa un textarea real");
});
