/**
 * jarvis-actions.test.js — JARVIS CON MANOS (v0.50.0, Fase A).
 *
 * Cubre el plan de pruebas §7.3.1 del diseño acotado a ESTA fase (las 3
 * acciones de Diarias; snooze/nota/borrador son v0.51+ y no existen):
 * paridad byte a byte de totales al aplicar y deshacer, defaults sin
 * migración, validadores por acción con los casos borde, idempotencia,
 * tope de 10 acciones/día, forma estricta, cliente con fetch simulado
 * (incl. Worker v3 sin `action`) y resumen con contexto ≤ 3 KB.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildProgressSummary,
  dailyPlanView,
  jarvisDailyContext,
  jarvisProblems,
  jarvisView,
} from "../src/jarvis-state.js";
import {
  describeJarvisAction,
  jarvisActionArgsShape,
  newJarvisRequestId,
  validateJarvisAction,
} from "../src/jarvis-actions.js";
import { askJarvis } from "../js/jarvis-client.js";
import { STORAGE_KEYS, createMemoryStorage, importBundle, applyGameplayMutation } from "../src/storage.js";
import { derive, sourcesFromMigrated } from "../src/derive.js";
import { routeForDay } from "../src/gameplay.js";
import { PLAY_VERSION } from "../src/shape.js";

const catalog = JSON.parse(fs.readFileSync(new URL("../data/xp-catalog.json", import.meta.url)));
const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/odea-progreso-sintetico.json", import.meta.url)));
const date = "2026-11-17";
const IDS = ["48A", "48B", "48C"]; // la ruta del fixture el 2026-11-17

function fresh() {
  const storage = createMemoryStorage();
  const imported = importBundle(structuredClone(fixture), {
    storage, catalog, referenceDate: "2026-11-10", migratedAt: "2026-11-10T12:00:00.000Z"
  });
  assert.equal(imported.status, "active");
  return storage;
}
const saved = (s) => JSON.parse(s.getItem(STORAGE_KEYS.bundle));
const opts = (d = date, second = 0) => ({
  date: d, at: new Date(Date.UTC(2026, 10, 17, 12, 0, second)).toISOString()
});
const derived = (s) => derive(sourcesFromMigrated(saved(s), catalog), catalog, "2026-11-10");
const act = (s, name, args, requestId, second = 0) =>
  applyGameplayMutation(s, catalog, { type: "jarvis.act", requestId, name, args }, opts(date, second));
const undo = (s, requestId, second = 50) =>
  applyGameplayMutation(s, catalog, { type: "jarvis.actUndo", requestId }, opts(date, second));
const rid = (n) => `test-req-${String(n).padStart(4, "0")}`;

function totals(s) {
  const d = derived(s);
  return { totalXP: d.totalXP, breakdown: d.xpBreakdown, coins: d.coins };
}

/* --------------------------- paridad (la reina) --------------------------- */

test("manos: aplicar foco+orden+busy y deshacer todo deja XP, componentes y ₡ byte a byte idénticos", () => {
  const s = fresh();
  const before = totals(s);
  /* Base de comparación del bundle: el motor refresca core.derived y
     crea la cáscara play ante CUALQUIER mutación, así que la base es el
     mismo save tras una mutación inofensiva (un contador de chat, que
     vive dentro de play.jarvis y se retira al comparar). */
  const baseStorage = fresh();
  applyGameplayMutation(baseStorage, catalog, { type: "jarvis.usage", kind: "chat" }, opts(date, 0));
  const beforeRaw = saved(baseStorage);
  applyGameplayMutation(s, catalog, { type: "jarvis.usage", kind: "chat" }, opts(date, 0));

  assert.equal(act(s, "set_daily_focus", { dailyId: "48B" }, rid(1), 1).status, "applied");
  assert.equal(act(s, "reorder_dailies", { order: ["48C", "48A", "48B"] }, rid(2), 2).status, "applied");
  assert.equal(act(s, "set_busy_day",
    { minutes: 25, chosen: ["48C"], deferred: ["48A", "48B"] }, rid(3), 3).status, "applied");

  const mid = totals(s);
  assert.equal(JSON.stringify(mid), JSON.stringify(before), "aplicar manos no mueve ni 1 XP ni 1 ₡");

  assert.equal(undo(s, rid(3), 4).status, "applied");
  assert.equal(undo(s, rid(2), 5).status, "applied");
  assert.equal(undo(s, rid(1), 6).status, "applied");

  assert.equal(JSON.stringify(totals(s)), JSON.stringify(before), "deshacer tampoco mueve totales");
  const after = saved(s);
  /* Fuera de play.jarvis, el bundle vuelve EXACTAMENTE al original. */
  const strip = (b) => {
    const copy = structuredClone(b);
    if (copy.play) {
      delete copy.play.jarvis;
      /* El motor crea la cáscara play {version, completions, checkins}
         ante CUALQUIER mutación; vacía, equivale a no tener play. */
      if (!beforeRaw.play &&
        Object.keys(copy.play).every((k) => ["version", "completions", "checkins"].includes(k)) &&
        !Object.keys(copy.play.completions || {}).length &&
        !Object.keys(copy.play.checkins || {}).length) {
        delete copy.play;
      }
    }
    return copy;
  };
  assert.deepEqual(strip(after), strip(beforeRaw));
  /* Y el plan del día quedó restaurado a los defaults. */
  const view = dailyPlanView(after, catalog, date);
  assert.equal(view.focusId, null);
  assert.deepEqual(view.order, IDS);
  assert.equal(view.busy, null);
});

test("manos: el registro guarda la foto prev exacta y marca undone al deshacer", () => {
  const s = fresh();
  act(s, "set_daily_focus", { dailyId: "48A" }, rid(1), 1);
  act(s, "set_daily_focus", { dailyId: "48B" }, rid(2), 2);
  const actions = saved(s).play.jarvis.actions;
  assert.deepEqual(actions[rid(1)].prev, { focusId: null });
  assert.deepEqual(actions[rid(2)].prev, { focusId: "48A" });
  assert.equal(actions[rid(1)].undone, false);
  undo(s, rid(2), 3);
  assert.equal(saved(s).play.jarvis.actions[rid(2)].undone, true);
  assert.equal(jarvisView(saved(s), date).dayPlan.focusId, "48A");
});

/* ------------------------- defaults sin migración ------------------------ */

test("manos: un save sin las claves nuevas carga con defaults y PLAY_VERSION no cambia", () => {
  const s = fresh();
  const bundle = saved(s);
  assert.equal(bundle.play?.jarvis?.dayPlan, undefined);
  const view = jarvisView(bundle, date);
  assert.deepEqual(view.dayPlan, { focusId: null, order: null, busy: null });
  assert.equal(view.accionesHoy, 0);
  assert.equal(view.actRestantes, 10);
  assert.deepEqual(jarvisProblems(bundle), []);
  act(s, "set_daily_focus", { dailyId: "48A" }, rid(1), 1);
  assert.equal(saved(s).play.version, PLAY_VERSION, "PLAY_VERSION intacto tras aplicar manos");
});

/* ------------------------------ validadores ------------------------------ */

test("manos: foco sobre diaria completada o ya-enfocada es ACTION_STALE; id ajeno es ACTION_BAD_ARGS", () => {
  const s = fresh();
  /* Completar 48A por la vía de siempre (el toque de José en el panel). */
  const done = applyGameplayMutation(s, catalog,
    { type: "mission.complete", system: "hub", missionId: "48A", date }, opts(date, 1));
  assert.equal(done.status, "applied");
  const stale = act(s, "set_daily_focus", { dailyId: "48A" }, rid(1), 2);
  assert.equal(stale.status, "rejected");
  assert.equal(stale.error.code, "ACTION_STALE");
  const ajeno = act(s, "set_daily_focus", { dailyId: "99Z" }, rid(2), 3);
  assert.equal(ajeno.error.code, "ACTION_BAD_ARGS");
  assert.equal(act(s, "set_daily_focus", { dailyId: "48B" }, rid(3), 4).status, "applied");
  const yaFoco = act(s, "set_daily_focus", { dailyId: "48B" }, rid(4), 5);
  assert.equal(yaFoco.error.code, "ACTION_STALE");
});

test("manos: reorder exige permutación exacta de los ids de hoy", () => {
  const s = fresh();
  assert.equal(act(s, "reorder_dailies", { order: ["48B", "48A"] }, rid(1), 1).error.code, "ACTION_BAD_ARGS");
  assert.equal(act(s, "reorder_dailies", { order: ["48A", "48A", "48B"] }, rid(2), 2).error.code, "ACTION_BAD_ARGS");
  assert.equal(act(s, "reorder_dailies", { order: ["48A", "48B", "51A"] }, rid(3), 3).error.code, "ACTION_BAD_ARGS");
  assert.equal(act(s, "reorder_dailies", { order: ["48C", "48B", "48A"] }, rid(4), 4).status, "applied");
  assert.deepEqual(dailyPlanView(saved(s), catalog, date).order, ["48C", "48B", "48A"]);
});

test("manos: día ocupado exige la partición exacta de las pendientes", () => {
  const s = fresh();
  const bad = (args, n) => act(s, "set_busy_day", args, rid(n), n).error?.code;
  /* partición incompleta */
  assert.equal(bad({ minutes: 25, chosen: ["48A"], deferred: ["48B"] }, 1), "ACTION_BAD_ARGS");
  /* solapada */
  assert.equal(bad({ minutes: 25, chosen: ["48A", "48B"], deferred: ["48B", "48C"] }, 2), "ACTION_BAD_ARGS");
  /* minutes fuera de rango */
  assert.equal(bad({ minutes: 601, chosen: ["48A"], deferred: ["48B", "48C"] }, 3), "ACTION_BAD_ARGS");
  assert.equal(bad({ minutes: -1, chosen: ["48A"], deferred: ["48B", "48C"] }, 4), "ACTION_BAD_ARGS");
  assert.equal(bad({ minutes: 25.5, chosen: ["48A"], deferred: ["48B", "48C"] }, 5), "ACTION_BAD_ARGS");
  /* chosen vacío con minutes > 0 */
  assert.equal(bad({ minutes: 25, chosen: [], deferred: IDS }, 6), "ACTION_BAD_ARGS");
  /* chosen vacío SOLO válido con minutes = 0 */
  assert.equal(act(s, "set_busy_day", { minutes: 0, chosen: [], deferred: IDS }, rid(7), 7).status, "applied");
  const view = dailyPlanView(saved(s), catalog, date);
  assert.equal(view.busy.minutes, 0);
  assert.deepEqual(view.busy.deferred, IDS);
});

test("manos: día ocupado con una diaria ya completada en la partición es ACTION_BAD_ARGS", () => {
  const s = fresh();
  applyGameplayMutation(s, catalog,
    { type: "mission.complete", system: "hub", missionId: "48A", date }, opts(date, 1));
  const r = act(s, "set_busy_day",
    { minutes: 25, chosen: ["48A"], deferred: ["48B", "48C"] }, rid(1), 2);
  assert.equal(r.error.code, "ACTION_BAD_ARGS");
  /* La partición correcta tras completar una: solo las 2 pendientes. */
  assert.equal(act(s, "set_busy_day",
    { minutes: 25, chosen: ["48B"], deferred: ["48C"] }, rid(2), 3).status, "applied");
});

test("manos: acción desconocida es ACTION_UNKNOWN y args mal formados ACTION_BAD_ARGS, sin tocar el save", () => {
  const s = fresh();
  const beforeRaw = s.getItem(STORAGE_KEYS.bundle);
  assert.equal(act(s, "complete_dailies", {}, rid(1), 1).error.code, "ACTION_UNKNOWN");
  assert.equal(act(s, "set_daily_focus", { dailyId: 42 }, rid(2), 2).error.code, "ACTION_BAD_ARGS");
  assert.equal(act(s, "set_daily_focus", { dailyId: "48A", extra: 1 }, rid(3), 3).error.code, "ACTION_BAD_ARGS");
  assert.equal(act(s, "set_daily_focus", { dailyId: "48A" }, "bad id!", 4).error.code, "ACTION_BAD_ARGS");
  assert.equal(s.getItem(STORAGE_KEYS.bundle), beforeRaw, "fail-closed: ni un byte cambió");
});

test("manos: validateJarvisAction directo — el catálogo es la única definición de válido", () => {
  const s = fresh();
  const ctx = jarvisDailyContext(saved(s), catalog, date);
  assert.equal(validateJarvisAction(ctx, "set_daily_focus", { dailyId: "48A" }), null);
  assert.equal(validateJarvisAction(ctx, "nope", {}), "ACTION_UNKNOWN");
  assert.equal(validateJarvisAction(ctx, "set_busy_day",
    { minutes: 10, chosen: ["48A", "48B", "48C"], deferred: [] }), null);
  const desc = describeJarvisAction(ctx, "set_busy_day",
    { minutes: 20, chosen: ["48A"], deferred: ["48B", "48C"] });
  assert.ok(desc.title.includes("20 min"));
  assert.ok(desc.body.includes("Para mañana"));
  assert.equal(jarvisActionArgsShape("set_busy_day",
    { minutes: 20, chosen: ["48A"], deferred: ["48B"] }), true);
  assert.equal(jarvisActionArgsShape("set_busy_day",
    { minutes: 20, chosen: ["48A"], deferred: ["48A"] }), false);
  assert.ok(/^[a-zA-Z0-9_-]{8,80}$/.test(newJarvisRequestId()));
});

/* ------------------------------ idempotencia ----------------------------- */

test("manos: mismo requestId dos veces → DUPLICATE con un solo efecto; actUndo dos veces → DUPLICATE", () => {
  const s = fresh();
  assert.equal(act(s, "set_daily_focus", { dailyId: "48A" }, rid(1), 1).status, "applied");
  const again = act(s, "set_daily_focus", { dailyId: "48B" }, rid(1), 2);
  assert.equal(again.status, "duplicate");
  assert.equal(jarvisView(saved(s), date).dayPlan.focusId, "48A", "el efecto es el primero y único");
  assert.equal(jarvisView(saved(s), date).accionesHoy, 1, "un solo cargo al contador");
  assert.equal(undo(s, rid(1), 3).status, "applied");
  assert.equal(undo(s, rid(1), 4).status, "duplicate");
  assert.equal(undo(s, rid(99), 5).status, "duplicate", "deshacer un registro inexistente es DUPLICATE");
});

test("manos: deshacer no pisa un ajuste que José cambió a mano después", () => {
  const s = fresh();
  act(s, "set_daily_focus", { dailyId: "48A" }, rid(1), 1);
  /* José cambia el foco a mano (la ⭐ del panel, misma mutación). */
  act(s, "set_daily_focus", { dailyId: "48B" }, rid(2), 2);
  const r = undo(s, rid(1), 3);
  assert.equal(r.status, "rejected");
  assert.equal(r.error.code, "ACTION_STALE");
  assert.equal(jarvisView(saved(s), date).dayPlan.focusId, "48B", "el ajuste manual gana");
});

/* --------------------------------- topes --------------------------------- */

test("manos: la 11.ª acción aplicada del día es JARVIS_ACT_CAP y deshacer NO libera cupo", () => {
  const s = fresh();
  const seq = ["48A", "48B", "48A", "48B", "48A", "48B", "48A", "48B", "48A", "48B"];
  seq.forEach((id, i) => {
    assert.equal(act(s, "set_daily_focus", { dailyId: id }, rid(i + 1), i + 1).status, "applied", `acción ${i + 1}`);
  });
  assert.equal(jarvisView(saved(s), date).accionesHoy, 10);
  const once = act(s, "set_daily_focus", { dailyId: "48A" }, rid(11), 11);
  assert.equal(once.status, "rejected");
  assert.equal(once.error.code, "JARVIS_ACT_CAP");
  assert.equal(undo(s, rid(10), 12).status, "applied");
  const trasDeshacer = act(s, "set_daily_focus", { dailyId: "48A" }, rid(12), 13);
  assert.equal(trasDeshacer.error.code, "JARVIS_ACT_CAP", "deshacer no devuelve cupo");
});

/* ----------------------------- forma estricta ---------------------------- */

test("manos: jarvisProblems rechaza cada clave nueva mal formada antes de guardar", () => {
  const base = () => {
    const b = saved(fresh());
    b.play = b.play || { version: PLAY_VERSION, completions: {}, checkins: {} };
    return b;
  };
  const cases = [
    (b) => { b.play.jarvis = { dayPlan: { [date]: { focusId: 5, order: null, busy: null } } }; },
    (b) => { b.play.jarvis = { dayPlan: { [date]: { focusId: null, order: ["a", "a"], busy: null } } }; },
    (b) => { b.play.jarvis = { dayPlan: { [date]: { focusId: null, order: null, busy: { minutes: 999, chosen: [], deferred: [] } } } }; },
    (b) => { b.play.jarvis = { dayPlan: { "no-fecha": { focusId: null, order: null, busy: null } } }; },
    (b) => { b.play.jarvis = { actions: { "bad id!": { name: "set_daily_focus", args: { dailyId: "48A" }, date, at: "2026-11-17T12:00:00.000Z", undone: false, prev: { focusId: null } } } }; },
    (b) => { b.play.jarvis = { actions: { [rid(1)]: { name: "hack", args: {}, date, at: "2026-11-17T12:00:00.000Z", undone: false, prev: {} } } }; },
    (b) => { b.play.jarvis = { actions: { [rid(1)]: { name: "set_daily_focus", args: { dailyId: "48A" }, date, at: "2026-11-17T12:00:00.000Z", undone: false, prev: { order: null } } } }; },
    (b) => { b.play.jarvis = { usage: { [date]: { quiz: 0, chat: 0, feedback: 0, calls: 0, act: -1 } } }; },
  ];
  for (const mutate of cases) {
    const b = base();
    mutate(b);
    assert.ok(jarvisProblems(b).length > 0, "debe reportar problemas");
  }
  /* Y la forma buena pasa limpia. */
  const ok = base();
  ok.play.jarvis = {
    quizXpByDate: {},
    briefing: null,
    dayPlan: { [date]: { focusId: "48A", order: IDS, busy: { minutes: 20, chosen: ["48A"], deferred: ["48B", "48C"] } } },
    actions: { [rid(1)]: { name: "set_daily_focus", args: { dailyId: "48A" }, date, at: "2026-11-17T12:00:00.000Z", undone: false, prev: { focusId: null } } },
    usage: { [date]: { quiz: 0, chat: 1, feedback: 0, calls: 1, act: 1 } },
  };
  assert.deepEqual(jarvisProblems(ok), []);
});

test("manos: un cliente viejo que guarda otra cosa preserva las claves de manos", () => {
  const s = fresh();
  act(s, "set_busy_day", { minutes: 15, chosen: ["48A"], deferred: ["48B", "48C"] }, rid(1), 1);
  /* Otra mutación cualquiera (un contador de chat) no conoce dayPlan ni
     actions: deben sobrevivir intactas en el save. */
  applyGameplayMutation(s, catalog, { type: "jarvis.usage", kind: "chat" }, opts(date, 2));
  const j = saved(s).play.jarvis;
  assert.equal(j.dayPlan[date].busy.minutes, 15);
  assert.equal(j.actions[rid(1)].name, "set_busy_day");
});

/* ------------------------- cliente con fetch falso ------------------------ */

function stubFetch(payload, status = 200) {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  });
  return () => { globalThis.fetch = original; };
}

test("manos/cliente: chat con action válida llega tipada; Worker v3 (sin action) es chat normal", async () => {
  let restore = stubFetch({
    type: "chat", text: "Te lo armo así.",
    action: { name: "set_busy_day", args: { minutes: 20, chosen: ["48A"], deferred: ["48B", "48C"] } },
  });
  try {
    const r = await askJarvis("chat", { message: "hoy estoy full", summary: {} });
    assert.equal(r.ok, true);
    assert.deepEqual(r.action, { name: "set_busy_day", args: { minutes: 20, chosen: ["48A"], deferred: ["48B", "48C"] } });
  } finally { restore(); }

  restore = stubFetch({ type: "chat", text: "Como siempre." });
  try {
    const r = await askJarvis("chat", { message: "hola", summary: {} });
    assert.equal(r.ok, true);
    assert.equal(r.text, "Como siempre.");
    assert.equal(r.action, undefined, "sin action: exactamente el chat de hoy");
  } finally { restore(); }
});

test("manos/cliente: action mal formada se descarta; tool_call sin texto sigue ok con la acción", async () => {
  let restore = stubFetch({ type: "chat", text: "Dale.", action: { name: 42, args: "no" } });
  try {
    const r = await askJarvis("chat", { message: "x", summary: {} });
    assert.equal(r.ok, true);
    assert.equal(r.action, undefined);
  } finally { restore(); }

  restore = stubFetch({
    type: "chat", text: "",
    action: { name: "set_daily_focus", args: { dailyId: "48A" } },
  });
  try {
    const r = await askJarvis("chat", { message: "x", summary: {} });
    assert.equal(r.ok, true, "sin texto pero con acción: el juego pinta su plantilla");
    assert.equal(r.action.name, "set_daily_focus");
  } finally { restore(); }
});

/* -------------------------------- resumen -------------------------------- */

test("manos: buildProgressSummary suma accionesContext con ids reales y el total queda ≤ 3 KB", () => {
  const s = fresh();
  act(s, "set_daily_focus", { dailyId: "48B" }, rid(1), 1);
  const summary = buildProgressSummary(saved(s), catalog, "2026-11-20");
  const ac = summary.accionesContext;
  assert.equal(ac.diarias.length, 3);
  for (const d of ac.diarias) {
    assert.equal(typeof d.id, "string");
    assert.equal(typeof d.titulo, "string");
    assert.equal(typeof d.hecha, "boolean");
    assert.equal(typeof d.foco, "boolean");
  }
  assert.ok(Array.isArray(ac.garajePorVencer) && ac.garajePorVencer.length <= 3);
  for (const g of ac.garajePorVencer) {
    assert.equal(typeof g.id, "string");
    assert.equal(typeof g.nombre, "string");
    assert.ok(g.estado === "vencida" || g.estado === "por-vencer");
  }
  assert.equal(ac.diaOcupado, null);
  assert.equal(summary.jarvisHoy.acciones, 0, "el conteo es del día del resumen (2026-11-20), no del 17");
  const size = Buffer.byteLength(JSON.stringify(summary), "utf8");
  assert.ok(size <= 3072, `resumen de ${size} bytes ≤ 3 KB`);
  const route = routeForDay(saved(s), catalog, "2026-11-20");
  assert.deepEqual(ac.diarias.map((d) => d.id), route.missions.map((m) => m.id), "solo ids de HOY");
});
