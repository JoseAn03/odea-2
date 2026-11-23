import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { MARCA_ITEMS, marcaView, marcaRewards, marcaProblems } from "../src/marca-state.js";
import { STORAGE_KEYS, createMemoryStorage, importBundle, applyGameplayMutation } from "../src/storage.js";
import { derive, sourcesFromMigrated } from "../src/derive.js";
import { validatePlayState } from "../src/validate.js";

const catalog = JSON.parse(fs.readFileSync(new URL("../data/xp-catalog.json", import.meta.url)));
const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/odea-progreso-sintetico.json", import.meta.url)));
const date = "2026-11-17";
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
const hecho = (s, id, d = date, second = 0) =>
  applyGameplayMutation(s, catalog, { type: "marca.complete", missionId: id }, opts(d, second));
const derived = (s) => derive(sourcesFromMigrated(saved(s), catalog), catalog, "2026-11-10");
const item = (view, id) => view.items.find((m) => m.id === id);

test("marca vivo: 22 ítems — 12 rutinas y 10 hitos en dos pestañas", () => {
  assert.equal(MARCA_ITEMS.length, 22);
  const rutinas = MARCA_ITEMS.filter((m) => m.kind === "rutina");
  const hitos = MARCA_ITEMS.filter((m) => m.kind === "hito");
  assert.equal(rutinas.length, 12);
  assert.equal(hitos.length, 10);
  assert.equal(MARCA_ITEMS.filter((m) => m.tab === "yo").length, 12);
  assert.equal(MARCA_ITEMS.filter((m) => m.tab === "analista").length, 10);
  const ritmo = Object.fromEntries(MARCA_ITEMS.map((m) => [m.id, m.days]));
  assert.equal(ritmo["marca-01"], 3, "capturar el momento: cada 3 días");
  assert.equal(ritmo["marca-02"], 5, "historia o estado: cada 5 días");
  assert.equal(ritmo["marca-13"], 4, "post de LinkedIn: cada 4 días ≈ 2 por semana");
  assert.equal(ritmo["marca-18"], 30, "revisión de la marca: mensual");
});

test("marca vivo: la economía es la del diseño aprobado", () => {
  const sum = (list) => list.reduce((a, m) => ({ xp: a.xp + m.xp, coins: a.coins + m.coins }), { xp: 0, coins: 0 });
  const rutinas = sum(MARCA_ITEMS.filter((m) => m.kind === "rutina"));
  const hitos = sum(MARCA_ITEMS.filter((m) => m.kind === "hito"));
  assert.deepEqual(hitos, { xp: 800, coins: 50 }, "los 10 hitos pagan 800 XP / ₡50 una vez");
  assert.deepEqual(
    { xp: rutinas.xp + hitos.xp, coins: rutinas.coins + hitos.coins },
    { xp: 1440, coins: 93 },
    "primera vuelta completa: 1.440 XP / ₡93"
  );
});

test("marca vivo: la vista inicial marca todo sin hacer y la semana llena", () => {
  const s = fresh();
  const view = marcaView(saved(s), date);
  assert.equal(view.probadas, 0);
  assert.equal(view.rank, false);
  assert.equal(view.rutinasAlDia, 0);
  assert.equal(view.week.length, 12, "las 12 rutinas de ambas pestañas tocan");
  assert.equal(view.hitosDone, 0);
  assert.equal(view.tabs.length, 2);
  assert.equal(item(view, "marca-07").state, "pendiente");
  assert.equal(item(view, "marca-01").state, "sin-registro");
  assert.deepEqual(marcaRewards(saved(s)), { xp: 0, coins: 0 });
  assert.deepEqual(marcaProblems(saved(s)), []);
});

test("marca vivo: TODO desbloqueado, el último hito se puede hacer primero", () => {
  const s = fresh();
  const before = derived(s);
  assert.equal(hecho(s, "marca-22").status, "applied", "sin candados secuenciales");
  const after = derived(s);
  assert.equal(after.totalXP - before.totalXP, 80);
  assert.equal(after.coins.balance - before.coins.balance, 5);
  assert.equal(after.xpBreakdown.marca, 80);
  const view = marcaView(saved(s), date);
  assert.equal(item(view, "marca-22").state, "completada");
  assert.equal(view.hitosDone, 1);
});

test("marca vivo: completar una rutina paga una vez y arranca su reloj", () => {
  const s = fresh();
  const before = derived(s);
  assert.equal(hecho(s, "marca-03").status, "applied");
  const after = derived(s);
  assert.equal(after.totalXP - before.totalXP, 50);
  assert.equal(after.coins.balance - before.coins.balance, 3);
  assert.equal(after.xpBreakdown.marca, 50);
  const view = marcaView(saved(s), date);
  const m = item(view, "marca-03");
  assert.equal(m.state, "al-dia");
  assert.equal(m.dueIn, 7);
  assert.equal(m.lastDate, date);
  assert.equal(hecho(s, "marca-03", date, 30).status, "duplicate", "el mismo día no se registra dos veces");
  /* La rutina de 3 días queda «por vencer» al registrarse: su ciclo
     entero cae dentro de la ventana de aviso de 3 días, la regla
     compartida con el Garaje y el Mundo de Ian. */
  hecho(s, "marca-01");
  const corta = item(marcaView(saved(s), date), "marca-01");
  assert.equal(corta.state, "por-vencer");
  assert.equal(corta.dueIn, 3);
});

test("marca vivo: registrar antes de tiempo actualiza la fecha pero no paga", () => {
  const s = fresh();
  hecho(s, "marca-05");
  const early = hecho(s, "marca-05", "2026-11-18", 5);
  assert.equal(early.status, "applied");
  const view = marcaView(saved(s), "2026-11-18");
  const m = item(view, "marca-05");
  assert.equal(m.state, "al-dia", "con 14 días de ciclo, al día siguiente sigue al día");
  assert.equal(m.lastDate, "2026-11-18", "el reloj reinició");
  assert.equal(m.times, 2);
  assert.deepEqual(marcaRewards(saved(s)), { xp: 40, coins: 3 }, "sin segundo pago");
});

test("marca vivo: la rutina vencida vuelve a pagar al registrarse", () => {
  const s = fresh();
  hecho(s, "marca-01");
  const view = marcaView(saved(s), "2026-11-25");
  assert.equal(item(view, "marca-01").state, "vencida");
  assert.equal(hecho(s, "marca-01", "2026-11-25", 5).status, "applied");
  assert.deepEqual(marcaRewards(saved(s)), { xp: 80, coins: 6 }, "segundo ciclo, segundo pago");
});

test("marca vivo: un hito paga una sola vez en la vida", () => {
  const s = fresh();
  assert.equal(hecho(s, "marca-19").status, "applied");
  assert.equal(hecho(s, "marca-19", "2026-11-20", 5).status, "duplicate");
  assert.deepEqual(marcaRewards(saved(s)), { xp: 80, coins: 5 });
});

test("marca vivo: los 10 hitos dan el rango Estrella de Costa Neón", () => {
  const s = fresh();
  for (const m of MARCA_ITEMS.filter((x) => x.kind === "hito")) {
    assert.equal(hecho(s, m.id).status, "applied", m.id);
  }
  const view = marcaView(saved(s), date);
  assert.equal(view.hitosDone, 10);
  assert.equal(view.rank, true);
  assert.equal(derived(s).xpBreakdown.marca, 800);
});

test("marca vivo: un save sin play.marca deriva idéntico y la escritura no toca nada más", () => {
  const s = fresh();
  const before = saved(s);
  assert.equal((before.play || {}).marca, undefined, "la sección nace perezosa");
  const d0 = derived(s);
  assert.equal(d0.xpBreakdown.marca, 0, "sin marca, el componente deriva 0");
  assert.equal(hecho(s, "marca-13").status, "applied");
  const after = saved(s);
  const a = structuredClone(after);
  const b = structuredClone(before);
  delete a.play.marca;
  /* La sección play nace perezosa en la primera escritura de gameplay
     (igual que con el Garaje o Ian): fuera de marca, queda el cascarón
     vacío estándar y nada más se movió. */
  assert.deepEqual(a.play, { version: 3, completions: {}, checkins: {} });
  delete a.play;
  delete a.core.derived;
  delete b.core.derived;
  assert.deepEqual(a, b, "fuera de play.marca y el snapshot derivado, el bundle es byte a byte el mismo");
  const report = validatePlayState(after, catalog);
  assert.equal(report.ok, true, report.errors?.join("; "));
});

test("marca vivo: la validación detecta un estado corrupto", () => {
  const s = fresh();
  hecho(s, "marca-01");
  const bundle = saved(s);
  bundle.play.marca.log["marca-01"].times = -1;
  assert.ok(marcaProblems(bundle).length > 0);
  bundle.play.marca.log["marca-01"].times = 1;
  bundle.play.marca.records["x"] = { missionId: "nope", date: "2026-11-17", at: "x", reward: { xp: 1, coins: 1 }, rulesVersion: 1 };
  assert.ok(marcaProblems(bundle).length > 0);
});
