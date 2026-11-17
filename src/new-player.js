import { derive, sourcesFromLegacy } from "./derive.js";

/**
 * A genuinely empty profile, not the synthetic test fixture.
 * Reuse the verified importer to initialize every required field and checksum.
 * No existing save may be overwritten by this action (enforced by the caller).
 */
export function newPlayerBundle(catalog, { name = "Jugador", date } = {}) {
  const legacy = {
    _format: "odea_bundle_v2",
    appVersion: "odea2-new-player",
    exportedAt: `${date}T12:00:00.000Z`,
    save: {
      playerName: String(name).trim().slice(0, 60) || "Jugador",
      completedMissions: [], completedDaily: [], completedWeekly: [],
      completedJobs: [], completedB2b: [], completedPuente: [], unlockedAch: [],
      startDate: date, lastDailyDate: null, streak: 0, shieldWeek: null,
      vida: { log: [], done: [], sagas: {} },
      capital: { done: [], eng: [], ai: [] }, gods: {},
      shop: { spent: 0, owned: [], equipped: {} }, sound: false,
      reto: {}, rewards: {}, planner: {}, diary: { log: [] }, activity: {},
      freezers: 0, applications: [], focus: { log: [] },
      hunt: { log: [] }, saveVersion: 3, eventRL: { log: [] },
      farm: { log: [] }, canje: { rewards: [], history: [] },
      xpBreakdown: {}, totalXP: 0, campaignLevel: 1, level: 1,
      odeLevel: 1, stats: { domains: {} }
    },
    keys: {
      odea_academia_v1: { hechas: {}, rutasAvisadas: [] },
      odea_jefe_v1: {}, odea_empleo_v2: 1, odea_anomalia_v1: {},
      odea_quiz_v1: {}, odea_tesoro_v1: { monedas: 0 },
      odea_sagas_v1: { chapters: {}, weekly: { done: false } },
      odea_events: [], odea_garaje_v1: {}, odea_juice_v1: {}, odea_hub_v1: {}
    }
  };
  const computed = derive(sourcesFromLegacy(legacy), catalog, date);
  Object.assign(legacy.save, {
    xpBreakdown: computed.xpBreakdown, totalXP: computed.totalXP,
    campaignLevel: computed.campaignLevel, level: computed.level, odeLevel: computed.odeLevel
  });
  return legacy;
}
