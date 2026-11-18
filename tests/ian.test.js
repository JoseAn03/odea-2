import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { IAN_MISSIONS, ianView, ianRewards, ianProblems } from "../src/ian-state.js";
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
  applyGameplayMutation(s, catalog, { type: "ian.complete", missionId: id }, opts(d, second));
const derived = (s) => derive(sourcesFromMigrated(saved(s), catalog), catalog, "2026-11-10");
const mission = (view, id) => view.missions.find((m) => m.id === id);

test("ian vivo: 54 misiones, 32 rutinas con su ritmo y 22 proyectos", () => {
  assert.equal(IAN_MISSIONS.length, 54);
  const rutinas = IAN_MISSIONS.filter((m) => m.kind === "rutina");
  const proyectos = IAN_MISSIONS.filter((m) => m.kind === "proyecto");
  assert.equal(rutinas.length, 32);
  assert.equal(proyectos.length, 22);
  const ritmo = Object.fromEntries(rutinas.map((m) => [m.id, m.days]));
  assert.equal(ritmo["mundoian-02"], 7, "los hábitos son semanales");
  assert.equal(ritmo["mundoian-49"], 7, "la noche de juegos es semanal");
  assert.equal(ritmo["mundoian-50"], 7, "el gran partido es semanal");
  assert.equal(ritmo["mundoian-51"], 15, "el paseo de exploradores es cada 15 días");
  assert.equal(rutinas.filter((m) => m.days === 7).length, 31);
});

test("ian vivo: la vista inicial marca todo sin hacer y la semana llena", () => {
  const s = fresh();
  const view = ianView(saved(s), date);
  assert.equal(view.probadas, 0);
  assert.equal(view.rank, false);
  assert.equal(view.rutinasAlDia, 0);
  assert.equal(view.week.length, 32);
  assert.equal(view.proyectosDone, 0);
  assert.equal(mission(view, "mundoian-01").state, "pendiente");
  assert.equal(mission(view, "mundoian-02").state, "sin-registro");
  assert.equal(view.chapters.length, 9);
  assert.deepEqual(ianRewards(saved(s)), { xp: 0, coins: 0 });
  assert.deepEqual(ianProblems(saved(s)), []);
});

test("ian vivo: TODO desbloqueado, la última misión se puede hacer primero", () => {
  const s = fresh();
  const before = derived(s);
  assert.equal(hecho(s, "mundoian-54").status, "applied", "sin candados secuenciales");
  const after = derived(s);
  assert.equal(after.totalXP - before.totalXP, 60);
  assert.equal(after.coins.balance - before.coins.balance, 4);
  assert.equal(after.xpBreakdown.ian, 60);
  const view = ianView(saved(s), date);
  assert.equal(mission(view, "mundoian-54").state, "completada");
  assert.equal(view.probadas, 1);
});

test("ian vivo: completar una rutina paga una vez y arranca su reloj semanal", () => {
  const s = fresh();
  const before = derived(s);
  assert.equal(hecho(s, "mundoian-02").status, "applied");
  const after = derived(s);
  assert.equal(after.totalXP - before.totalXP, 55);
  assert.equal(after.coins.balance - before.coins.balance, 4);
  assert.equal(after.xpBreakdown.ian, 55);
  const view = ianView(saved(s), date);
  const m = mission(view, "mundoian-02");
  assert.equal(m.state, "al-dia");
  assert.equal(m.dueIn, 7);
  assert.equal(m.lastDate, date);
  assert.equal(hecho(s, "mundoian-02", date, 30).status, "duplicate", "el mismo día no se registra dos veces");
});

test("ian vivo: registrar antes de tiempo actualiza la fecha pero no paga", () => {
  const s = fresh();
  hecho(s, "mundoian-02");
  const early = hecho(s, "mundoian-02", "2026-11-20", 5);
  assert.equal(early.status, "applied");
  assert.deepEqual(ianRewards(saved(s)), { xp: 55, coins: 4 }, "sin pago doble fuera de ciclo");
  const view = ianView(saved(s), "2026-11-20");
  assert.equal(mission(view, "mundoian-02").lastDate, "2026-11-20");
  assert.equal(mission(view, "mundoian-02").times, 2);
});

test("ian vivo: la rutina vence, se marca vencida y volver a hacerla paga el nuevo ciclo", () => {
  const s = fresh();
  hecho(s, "mundoian-49");
  const view = ianView(saved(s), "2026-11-27");
  const m = mission(view, "mundoian-49");
  assert.equal(m.state, "vencida");
  assert.equal(m.dueIn, -3);
  assert.equal(view.vencidas, 1);
  assert.equal(hecho(s, "mundoian-49", "2026-11-27").status, "applied");
  assert.deepEqual(ianRewards(saved(s)), { xp: 110, coins: 8 }, "dos ciclos pagos de 55 XP y ₡4");
  assert.equal(mission(ianView(saved(s), "2026-11-27"), "mundoian-49").state, "al-dia");
});

test("ian vivo: el paseo de exploradores corre con reloj de 15 días", () => {
  const s = fresh();
  assert.equal(hecho(s, "mundoian-51").status, "applied");
  const m = mission(ianView(saved(s), date), "mundoian-51");
  assert.equal(m.state, "al-dia");
  assert.equal(m.dueIn, 15);
  assert.equal(mission(ianView(saved(s), "2026-11-27"), "mundoian-51").state, "al-dia", "a los 10 días sigue al día");
});

test("ian vivo: un proyecto se completa una sola vez", () => {
  const s = fresh();
  assert.equal(hecho(s, "mundoian-01").status, "applied");
  assert.deepEqual(ianRewards(saved(s)), { xp: 55, coins: 4 });
  assert.equal(hecho(s, "mundoian-01", "2026-11-20").status, "duplicate");
  const view = ianView(saved(s), "2026-11-20");
  assert.equal(mission(view, "mundoian-01").state, "completada");
  assert.equal(view.proyectosDone, 1);
});

test("ian vivo: probar las 54 otorga la insignia Pequeño Gran Hombre y el total de la guía", () => {
  const s = fresh();
  for (const m of IAN_MISSIONS) {
    assert.equal(hecho(s, m.id).status, "applied", m.id);
  }
  const view = ianView(saved(s), date);
  assert.equal(view.probadas, 54);
  assert.equal(view.rank, true, "las 54 probadas: insignia ganada");
  assert.deepEqual(ianRewards(saved(s)), { xp: 3015, coins: 216 }, "el total de primeras veces es el de la guía");
});

test("ian vivo: lo ganado en la campaña v0.35 siembra el reloj sin pagar doble", () => {
  const s = fresh();
  assert.equal(applyGameplayMutation(s, catalog,
    { type: "campaign.complete", missionId: "mundoian-01", evidence: "Dijo la verdad sobre el vaso roto." }, opts()).status, "applied");
  const campaignDone = applyGameplayMutation(s, catalog,
    { type: "campaign.complete", missionId: "mundoian-02", evidence: "Dio las gracias toda la semana en casa." }, opts());
  assert.equal(campaignDone.status, "applied");
  const view = ianView(saved(s), date);
  const m = mission(view, "mundoian-02");
  assert.equal(m.state, "al-dia", "la fecha de la campaña arranca el reloj");
  assert.equal(m.lastDate, date);
  assert.deepEqual(ianRewards(saved(s)), { xp: 0, coins: 0 }, "ese pago ya vive en la campaña");
  assert.equal(hecho(s, "mundoian-02", date, 40).status, "duplicate", "el mismo día no se registra otra vez");
  const after = derived(s);
  assert.equal(after.xpBreakdown.ian, 0);
  assert.equal(after.xpBreakdown.career > 0, true, "la XP de la campaña sigue en Carrera");
});

test("ian vivo: un registro corrupto se detecta en la validación", () => {
  const s = fresh();
  hecho(s, "mundoian-02");
  const bundle = saved(s);
  const key = Object.keys(bundle.play.ian.records)[0];
  bundle.play.ian.records[key].reward.xp = -10;
  assert.ok(ianProblems(bundle).length > 0);
  assert.equal(validatePlayState(bundle, catalog).ok, false);
  assert.equal(hecho(s, "no-existe").error.code, "UNKNOWN_MISSION");
});
