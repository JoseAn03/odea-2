import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GARAGE_MISSIONS, garageView, garageRewards, garageProblems } from "../src/garage-state.js";
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
  applyGameplayMutation(s, catalog, { type: "garage.complete", missionId: id }, opts(d, second));
const km = (s, vehicle, value, d = date) =>
  applyGameplayMutation(s, catalog, { type: "garage.km", vehicle, km: value }, opts(d));
const derived = (s) => derive(sourcesFromMigrated(saved(s), catalog), catalog, "2026-11-10");
const mission = (view, id) => view.missions.find((m) => m.id === id);

test("garaje vivo: 27 misiones, 15 rutinas con su ritmo y 12 proyectos", () => {
  assert.equal(GARAGE_MISSIONS.length, 27);
  const rutinas = GARAGE_MISSIONS.filter((m) => m.kind === "rutina");
  const proyectos = GARAGE_MISSIONS.filter((m) => m.kind === "proyecto");
  assert.equal(rutinas.length, 15);
  assert.equal(proyectos.length, 12);
  const ritmo = Object.fromEntries(rutinas.map((m) => [m.id, m.days]));
  assert.equal(ritmo["garaje-01"], 7);
  assert.equal(ritmo["garaje-04"], 15);
  assert.equal(ritmo["garaje-07"], 90);
  assert.equal(ritmo["garaje-14"], 365, "la Dekra del carro es anual");
  assert.equal(ritmo["garaje-27"], 365, "la Dekra de la moto es anual");
  assert.equal(GARAGE_MISSIONS.filter((m) => m.vehicle === "carro").length, 14);
  assert.equal(GARAGE_MISSIONS.filter((m) => m.vehicle === "moto").length, 13);
});

test("garaje vivo: la vista inicial marca todo sin registro y la semana llena", () => {
  const s = fresh();
  const view = garageView(saved(s), date);
  assert.equal(view.rutinasAlDia, 0);
  assert.equal(view.week.length, 15);
  assert.equal(view.proyectosDone, 0);
  assert.equal(mission(view, "garaje-01").state, "sin-registro");
  assert.deepEqual(garageRewards(saved(s)), { xp: 0, coins: 0 });
  assert.deepEqual(garageProblems(saved(s)), []);
});

test("garaje vivo: completar una rutina paga una vez y arranca su reloj", () => {
  const s = fresh();
  const before = derived(s);
  assert.equal(hecho(s, "garaje-02").status, "applied");
  const after = derived(s);
  assert.equal(after.totalXP - before.totalXP, 40);
  assert.equal(after.coins.balance - before.coins.balance, 3);
  assert.equal(after.xpBreakdown.garaje, 40);
  const view = garageView(saved(s), date);
  const m = mission(view, "garaje-02");
  assert.equal(m.state, "al-dia");
  assert.equal(m.dueIn, 14);
  assert.equal(m.lastDate, date);
  assert.equal(hecho(s, "garaje-02", date, 30).status, "duplicate", "el mismo día no se registra dos veces");
});

test("garaje vivo: registrar antes de tiempo actualiza la fecha pero no paga", () => {
  const s = fresh();
  hecho(s, "garaje-02");
  const early = hecho(s, "garaje-02", "2026-11-22", 5);
  assert.equal(early.status, "applied");
  assert.deepEqual(garageRewards(saved(s)), { xp: 40, coins: 3 }, "sin pago doble fuera de ciclo");
  const view = garageView(saved(s), "2026-11-22");
  assert.equal(mission(view, "garaje-02").lastDate, "2026-11-22");
  assert.equal(mission(view, "garaje-02").times, 2);
});

test("garaje vivo: la rutina vence, se marca vencida y volver a hacerla paga el nuevo ciclo", () => {
  const s = fresh();
  hecho(s, "garaje-01");
  const view = garageView(saved(s), "2026-11-27");
  const m = mission(view, "garaje-01");
  assert.equal(m.state, "vencida");
  assert.equal(m.dueIn, -3);
  assert.equal(view.vencidas, 1);
  assert.equal(hecho(s, "garaje-01", "2026-11-27").status, "applied");
  assert.deepEqual(garageRewards(saved(s)), { xp: 100, coins: 6 }, "dos ciclos pagos de 50 XP y ₡3");
  assert.equal(mission(garageView(saved(s), "2026-11-27"), "garaje-01").state, "al-dia");
});

test("garaje vivo: un proyecto se completa una sola vez", () => {
  const s = fresh();
  assert.equal(hecho(s, "garaje-08").status, "applied");
  assert.deepEqual(garageRewards(saved(s)), { xp: 80, coins: 5 });
  assert.equal(hecho(s, "garaje-08", "2026-11-20").status, "duplicate");
  const view = garageView(saved(s), "2026-11-20");
  assert.equal(mission(view, "garaje-08").state, "completada");
  assert.equal(view.proyectosDone, 1);
});

test("garaje vivo: el kilometraje se registra por vehículo y se valida", () => {
  const s = fresh();
  assert.equal(km(s, "carro", 185400).status, "applied");
  assert.equal(km(s, "moto", 23150).status, "applied");
  const view = garageView(saved(s), date);
  const carro = view.vehicles.find((v) => v.id === "carro");
  const moto = view.vehicles.find((v) => v.id === "moto");
  assert.equal(carro.km, 185400);
  assert.equal(carro.kmDate, date);
  assert.equal(moto.km, 23150);
  assert.equal(km(s, "carro", -5).error.code, "KM_INVALID");
  assert.equal(km(s, "carro", 1.5).error.code, "KM_INVALID");
  assert.equal(km(s, "avion", 100).error.code, "UNKNOWN_VEHICLE");
});

test("garaje vivo: lo ganado en la campaña v0.29 siembra el reloj sin pagar doble", () => {
  const s = fresh();
  const campaignDone = applyGameplayMutation(s, catalog,
    { type: "campaign.complete", missionId: "garaje-01", evidence: "Carro lavado y aspirado en casa." }, opts());
  assert.equal(campaignDone.status, "applied");
  const view = garageView(saved(s), date);
  const m = mission(view, "garaje-01");
  assert.equal(m.state, "al-dia", "la fecha de la campaña arranca el reloj");
  assert.equal(m.lastDate, date);
  assert.deepEqual(garageRewards(saved(s)), { xp: 0, coins: 0 }, "ese pago ya vive en la campaña");
  assert.equal(hecho(s, "garaje-01", date, 40).status, "duplicate", "el mismo día no se registra otra vez");
  const after = derived(s);
  assert.equal(after.xpBreakdown.garaje, 0);
  assert.equal(after.xpBreakdown.career > 0, true, "la XP de la campaña sigue en Carrera");
});

test("garaje vivo: un registro corrupto se detecta en la validación", () => {
  const s = fresh();
  hecho(s, "garaje-01");
  const bundle = saved(s);
  const key = Object.keys(bundle.play.garaje.records)[0];
  bundle.play.garaje.records[key].reward.xp = -10;
  assert.ok(garageProblems(bundle).length > 0);
  assert.equal(validatePlayState(bundle, catalog).ok, false);
  assert.equal(hecho(s, "no-existe").error.code, "UNKNOWN_MISSION");
});
