/**
 * jarvis-actions.test.js — JARVIS CON MANOS (v0.50.0, Fase A).
 *
 * Cubre el plan de pruebas §7.3.1 del diseño acotado a ESTA fase (las 3
 * acciones de Diarias; snooze/nota/borrador son v0.51+ y no existen):
 * paridad byte a byte de totales al aplicar y deshacer, defaults sin
 * migración, validadores por acción con los casos borde, idempotencia,
 * tope de 10 acciones/día, forma estricta, cliente con fetch simulado
 * (incl. Worker v3 sin `action`) y resumen con contexto ≤ 3 KB.
 *
 * v0.54.0 — la sección «cruces» al final cubre la Fase D (§7.3.2): las
 * 3 acciones que cruzan (snooze del Garaje, nota de la Libreta y
 * borrador de evidencia) con la misma vara: paridad, validadores,
 * FIFO avisado, deshacer que no pisa lo hecho a mano, forma estricta
 * y el tope de 10 acciones/día COMPARTIDO con las de Diarias.
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
import { garageView } from "../src/garage-state.js";
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

/* ================= MANOS QUE CRUZAN (v0.54.0, Fase D · §7.3.2) =================
   Las 3 acciones que salen de las Diarias: snooze_garage_routine
   (§3.4), create_libreta_note (§3.5) y draft_evidence (§3.6). El Mundo
   de Ian NO tiene acciones (§3.7): no hay nada que probar ahí porque
   no hay nada construido. */

const actRef = (s, name, args, requestId, refId, second = 0) =>
  applyGameplayMutation(s, catalog, { type: "jarvis.act", requestId, name, args, refId }, opts(date, second));
const clearSnooze = (s, routineId, second = 60) =>
  applyGameplayMutation(s, catalog, { type: "jarvis.snoozeClear", routineId }, opts(date, second));

/* El Garaje con tres estados vivos el 2026-11-17: garaje-01 (7 días)
   hecha el 1-nov → VENCIDA; garaje-15 (7 días) hecha el 13-nov →
   POR VENCER (vence el 20); garaje-02 (14 días) hecha el 16-nov →
   AL DÍA. Completar paga, así que los totales se fotografían DESPUÉS. */
function garageSetup(s) {
  const at = (d, sec) => ({ date: d, at: new Date(Date.UTC(2026, 10, 17, 12, 0, sec)).toISOString() });
  applyGameplayMutation(s, catalog, { type: "garage.complete", missionId: "garaje-01" }, at("2026-11-01", 1));
  applyGameplayMutation(s, catalog, { type: "garage.complete", missionId: "garaje-15" }, at("2026-11-13", 2));
  applyGameplayMutation(s, catalog, { type: "garage.complete", missionId: "garaje-02" }, at("2026-11-16", 3));
  const view = garageView(saved(s), date);
  const stateOf = (id) => view.missions.find((m) => m.id === id).state;
  assert.equal(stateOf("garaje-01"), "vencida");
  assert.equal(stateOf("garaje-15"), "por-vencer");
  assert.equal(stateOf("garaje-02"), "al-dia");
}

test("cruces: defaults sin migración — snoozes {} y borradores [] en un save que nunca cruzó", () => {
  const s = fresh();
  const view = jarvisView(saved(s), date);
  assert.deepEqual(view.snoozes, {});
  assert.deepEqual(view.drafts, []);
  assert.equal(view.draftCount, 0);
  applyGameplayMutation(s, catalog, { type: "jarvis.usage", kind: "chat" }, opts(date, 0));
  assert.equal(saved(s).play.version, PLAY_VERSION, "PLAY_VERSION no sube por claves aditivas");
});

test("cruces: paridad — snooze + borrador + foco aplicados y deshechos no mueven ni 1 XP ni 1 ₡", () => {
  const s = fresh();
  garageSetup(s);
  const before = totals(s);
  const garajeAntes = structuredClone(saved(s).play.garaje);

  assert.equal(act(s, "snooze_garage_routine", { routineId: "garaje-01", days: 5 }, rid(101), 10).status, "applied");
  assert.equal(jarvisView(saved(s), date).snoozes["garaje:garaje-01"], "2026-11-22");
  assert.deepEqual(saved(s).play.garaje, garajeAntes, "el snooze NO toca el reloj del Garaje");
  assert.equal(act(s, "draft_evidence", { text: "Subí el CSV con el cruce de reservas.", missionId: "brete-01" }, rid(102), 11).status, "applied");
  const drafts = jarvisView(saved(s), date).drafts;
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].missionTitle, "Tu punto de partida", "el título sale del catálogo, no de la IA");
  assert.equal(act(s, "set_daily_focus", { dailyId: "48A" }, rid(103), 12).status, "applied");
  assert.equal(JSON.stringify(totals(s)), JSON.stringify(before), "cruzar no mueve totales");

  assert.equal(undo(s, rid(103), 13).status, "applied");
  assert.equal(undo(s, rid(102), 14).status, "applied");
  assert.equal(undo(s, rid(101), 15).status, "applied");
  assert.equal(JSON.stringify(totals(s)), JSON.stringify(before), "deshacer cruces tampoco");
  const after = saved(s);
  assert.deepEqual(after.play.jarvis.snoozes, {});
  assert.deepEqual(jarvisView(after, date).drafts, []);
  assert.deepEqual(after.play.garaje, garajeAntes);
});

test("cruces: el snooze valida contra el estado VIVO de la rutina", () => {
  const s = fresh();
  garageSetup(s);
  const stale = act(s, "snooze_garage_routine", { routineId: "garaje-02", days: 3 }, rid(110), 10);
  assert.equal(stale.status, "rejected");
  assert.equal(stale.error.code, "ACTION_STALE", "al día: no hay aviso que dormir");
  const sinRegistro = act(s, "snooze_garage_routine", { routineId: "garaje-04", days: 3 }, rid(111), 11);
  assert.equal(sinRegistro.error.code, "ACTION_STALE", "sin registro: tampoco urge");
  const inventada = act(s, "snooze_garage_routine", { routineId: "garaje-99", days: 3 }, rid(112), 12);
  assert.equal(inventada.error.code, "ACTION_BAD_ARGS", "id que no existe en el Garaje");
  const proyecto = act(s, "snooze_garage_routine", { routineId: "garaje-10", days: 3 }, rid(113), 13);
  assert.equal(proyecto.error.code, "ACTION_BAD_ARGS", "un proyecto de una vez no se duerme");
  assert.equal(act(s, "snooze_garage_routine", { routineId: "garaje-01", days: 0 }, rid(114), 14).error.code, "ACTION_BAD_ARGS");
  assert.equal(act(s, "snooze_garage_routine", { routineId: "garaje-01", days: 15 }, rid(115), 15).error.code, "ACTION_BAD_ARGS");
  assert.equal(jarvisView(saved(s), date).accionesHoy, 0, "los rechazos no consumen cupo");
});

test("cruces: snooze sobre snooze guarda la foto, deshacer restaura y despertar a mano no resucita", () => {
  const s = fresh();
  garageSetup(s);
  act(s, "snooze_garage_routine", { routineId: "garaje-01", days: 5 }, rid(120), 10);
  act(s, "snooze_garage_routine", { routineId: "garaje-01", days: 10 }, rid(121), 11);
  assert.equal(jarvisView(saved(s), date).snoozes["garaje:garaje-01"], "2026-11-27");
  assert.deepEqual(saved(s).play.jarvis.actions[rid(121)].prev, { until: "2026-11-22" });
  assert.equal(undo(s, rid(121), 12).status, "applied");
  assert.equal(jarvisView(saved(s), date).snoozes["garaje:garaje-01"], "2026-11-22", "vuelve el snooze anterior");

  /* Despertar a mano (el chip del Garaje) y luego deshacer el snooze
     original: el registro se marca, pero el aviso NO resucita. */
  assert.equal(clearSnooze(s, "garaje-01").status, "applied");
  assert.deepEqual(jarvisView(saved(s), date).snoozes, {});
  assert.equal(clearSnooze(s, "garaje-01").status, "duplicate", "sin snooze no hay nada que despertar");
  assert.equal(undo(s, rid(120), 13).status, "applied");
  assert.deepEqual(jarvisView(saved(s), date).snoozes, {}, "deshecho sin resucitar lo despertado a mano");

  /* Y si había un snooze ANTERIOR al despertado, deshacer el segundo
     no lo restaura a escondidas: ACTION_STALE, fail-closed. */
  act(s, "snooze_garage_routine", { routineId: "garaje-15", days: 2 }, rid(122), 14);
  act(s, "snooze_garage_routine", { routineId: "garaje-15", days: 4 }, rid(123), 15);
  clearSnooze(s, "garaje-15");
  const blocked = undo(s, rid(123), 16);
  assert.equal(blocked.status, "rejected");
  assert.equal(blocked.error.code, "ACTION_STALE");
  assert.equal(saved(s).play.jarvis.actions[rid(123)].undone, false);
});

test("cruces: borradores — misión del catálogo, topes de texto y FIFO avisado con deshacer", () => {
  const s = fresh();
  garageSetup(s);
  assert.equal(act(s, "draft_evidence", { text: "Evidencia sin misión." }, rid(130), 20).status, "applied");
  assert.equal(jarvisView(saved(s), date).drafts[0].missionId, null);
  assert.equal(act(s, "draft_evidence", { text: "x", missionId: "no-existe-99" }, rid(131), 21).error.code, "ACTION_BAD_ARGS");
  assert.equal(act(s, "draft_evidence", { text: "x".repeat(1001) }, rid(132), 22).error.code, "ACTION_BAD_ARGS");
  assert.equal(act(s, "draft_evidence", { text: "   " }, rid(133), 23).error.code, "ACTION_BAD_ARGS");

  const s2 = fresh();
  for (let i = 1; i <= 5; i += 1) {
    assert.equal(act(s2, "draft_evidence", { text: `borrador ${i}` }, rid(140 + i), 30 + i).status, "applied");
  }
  const sexto = act(s2, "draft_evidence", { text: "borrador 6" }, rid(146), 36);
  assert.equal(sexto.status, "applied");
  assert.ok(sexto.changed.includes("play.jarvis.drafts"));
  const record = saved(s2).play.jarvis.actions[rid(146)];
  assert.equal(record.prev.evicted.text, "borrador 1", "la foto guarda al desalojado por el FIFO");
  let texts = jarvisView(saved(s2), date).drafts.map((d) => d.text);
  assert.equal(texts.length, 5);
  assert.ok(!texts.includes("borrador 1") && texts.includes("borrador 6"));
  assert.equal(undo(s2, rid(146), 40).status, "applied");
  texts = jarvisView(saved(s2), date).drafts.map((d) => d.text);
  assert.equal(texts.length, 5);
  assert.ok(texts.includes("borrador 1") && !texts.includes("borrador 6"), "deshacer devuelve al desalojado");
});

test("cruces: la nota de la Libreta nace del juego y el registro exige su refId real", () => {
  const s = fresh();
  const before = totals(s);
  const texto = "Comprar el filtro de aire del Accent";
  /* Sin refId, o con un refId fantasma: no se registra nada. */
  assert.equal(act(s, "create_libreta_note", { text: texto }, rid(150), 10).error.code, "ACTION_BAD_ARGS");
  assert.equal(actRef(s, "create_libreta_note", { text: texto }, rid(151), "nota-fantasma", 11).error.code, "ACTION_BAD_ARGS");
  /* Una nota con título no respalda el registro (la de Jarvis nace sin título). */
  applyGameplayMutation(s, catalog, { type: "libreta.create", id: "nota-con-titulo", titulo: "Mía", texto }, opts(date, 12));
  assert.equal(actRef(s, "create_libreta_note", { text: texto }, rid(152), "nota-con-titulo", 13).error.code, "ACTION_BAD_ARGS");

  /* El flujo real: el juego crea la nota y DESPUÉS Jarvis registra. */
  applyGameplayMutation(s, catalog, { type: "libreta.create", id: "nota-jarvis-1", titulo: "", texto }, opts(date, 14));
  assert.equal(actRef(s, "create_libreta_note", { text: texto }, rid(153), "nota-jarvis-1", 15).status, "applied");
  const record = saved(s).play.jarvis.actions[rid(153)];
  assert.equal(record.refId, "nota-jarvis-1");
  assert.deepEqual(record.prev, { noteId: "nota-jarvis-1" });

  /* Deshacer + borrar la nota por la mutación de la Libreta: ciclo
     completo sin tocar totales ni dejar rastros fuera de play.jarvis. */
  assert.equal(undo(s, rid(153), 16).status, "applied");
  applyGameplayMutation(s, catalog, { type: "libreta.delete", id: "nota-jarvis-1" }, opts(date, 17));
  assert.equal(saved(s).play.libreta.notes.some((n) => n.id === "nota-jarvis-1"), false);
  assert.equal(JSON.stringify(totals(s)), JSON.stringify(before));
});

test("cruces: si José editó la nota a mano, el deshacer no la toca (ACTION_STALE)", () => {
  const s = fresh();
  const texto = "Idea para el video del domingo";
  applyGameplayMutation(s, catalog, { type: "libreta.create", id: "nota-jarvis-2", titulo: "", texto }, opts(date, 10));
  actRef(s, "create_libreta_note", { text: texto }, rid(160), "nota-jarvis-2", 11);
  applyGameplayMutation(s, catalog, { type: "libreta.update", id: "nota-jarvis-2", texto: "Idea EDITADA por José" }, opts(date, 12));
  const blocked = undo(s, rid(160), 13);
  assert.equal(blocked.status, "rejected");
  assert.equal(blocked.error.code, "ACTION_STALE");
  assert.equal(saved(s).play.jarvis.actions[rid(160)].undone, false);
  const note = saved(s).play.libreta.notes.find((n) => n.id === "nota-jarvis-2");
  assert.equal(note.texto, "Idea EDITADA por José", "la nota editada queda intacta");
});

test("cruces: el tope de 10 acciones/día es COMPARTIDO entre Diarias y cruces", () => {
  const s = fresh();
  for (let i = 0; i < 10; i += 1) {
    assert.equal(act(s, "draft_evidence", { text: `borrador ${i}` }, rid(170 + i), 20 + i).status, "applied");
  }
  const capped = act(s, "set_daily_focus", { dailyId: "48A" }, rid(181), 31);
  assert.equal(capped.status, "rejected");
  assert.equal(capped.error.code, "JARVIS_ACT_CAP");
  assert.equal(jarvisView(saved(s), date).draftCount, 5, "el FIFO mantiene 5 aunque se apliquen 10");
});

test("cruces: la forma estricta rechaza snoozes, borradores y registros corruptos", () => {
  const s = fresh();
  garageSetup(s);
  act(s, "snooze_garage_routine", { routineId: "garaje-01", days: 5 }, rid(190), 10);
  applyGameplayMutation(s, catalog, { type: "libreta.create", id: "nota-jarvis-3", titulo: "", texto: "Nota" }, opts(date, 11));
  actRef(s, "create_libreta_note", { text: "Nota" }, rid(191), "nota-jarvis-3", 12);
  assert.deepEqual(jarvisProblems(saved(s)), [], "el save con cruces válidos no tiene problemas");

  const badSnooze = saved(s);
  badSnooze.play.jarvis.snoozes = { "garaje:garaje-01": "ayer" };
  assert.ok(jarvisProblems(badSnooze).some((p) => p.includes("snoozes")), "fecha de snooze inválida");

  const badDrafts = saved(s);
  badDrafts.play.jarvis.drafts = Object.fromEntries(
    Array.from({ length: 6 }, (_, i) => [`d${i}`, { missionId: null, missionTitle: null, text: "x", date, at: "2026-11-17T12:00:00.000Z" }])
  );
  assert.ok(jarvisProblems(badDrafts).some((p) => p.includes("drafts")), "más de 5 borradores");

  const badRef = saved(s);
  delete badRef.play.jarvis.actions[rid(191)].refId;
  assert.ok(jarvisProblems(badRef).some((p) => p.includes("refId")), "registro de nota sin refId");
});

test("cruces: el resumen calla la rutina pospuesta y trae las próximas misiones con id real", () => {
  const s = fresh();
  garageSetup(s);
  act(s, "snooze_garage_routine", { routineId: "garaje-01", days: 5 }, rid(195), 10);
  const summary = buildProgressSummary(saved(s), catalog, date);
  assert.ok(!summary.garajePorVencer.some((name) => name.includes("Lavar el carro")),
    "el briefing no nombra la rutina dormida");
  assert.ok(summary.garajePorVencer.some((name) => name.includes("Lavar la moto")),
    "la que sigue despierta sí aparece");
  const ac = summary.accionesContext;
  assert.ok(!ac.garajePorVencer.some((g) => g.id === "garaje-01"));
  assert.ok(ac.garajePorVencer.some((g) => g.id === "garaje-15"));
  assert.ok(Array.isArray(ac.misiones) && ac.misiones.length >= 1, "universo de borradores presente");
  for (const m of ac.misiones) {
    assert.equal(typeof m.id, "string");
    assert.equal(typeof m.titulo, "string");
  }
  const size = Buffer.byteLength(JSON.stringify(summary), "utf8");
  assert.ok(size <= 3072, `resumen de ${size} bytes ≤ 3 KB con los cruces`);
});

test("cruces: las plantillas de la tarjeta dicen lo que va a pasar (con el aviso del FIFO)", () => {
  const s = fresh();
  garageSetup(s);
  const ctx = jarvisDailyContext(saved(s), catalog, date);
  const snooze = describeJarvisAction(ctx, "snooze_garage_routine", { routineId: "garaje-01", days: 5 });
  assert.ok(snooze.body.includes("Accent: Lavar el carro"));
  assert.ok(snooze.body.includes("sigue marcada como pendiente"), "la tarjeta aclara que el reloj no se toca");
  const nota = describeJarvisAction(ctx, "create_libreta_note", { text: "Comprar velas" });
  assert.ok(nota.body.includes("Comprar velas"));
  const full = { ...ctx, draftCount: 5 };
  const draft = describeJarvisAction(full, "draft_evidence", { text: "Mi evidencia" });
  assert.ok(draft.body.includes("sale el más viejo"), "con 5 borradores, la tarjeta avisa el FIFO");
  const notFull = describeJarvisAction(ctx, "draft_evidence", { text: "Mi evidencia" });
  assert.ok(!notFull.body.includes("sale el más viejo"));
});
