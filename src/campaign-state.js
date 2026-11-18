/**
 * Costa Neón: campañas aditivas, sin DOM ni almacenamiento.
 * Los premios se eligen aquí, nunca en botones ni en datos de la UI.
 * Los registros se conservan en el mismo bundle y viajan en sus respaldos.
 */
import { CAMPAIGNS, CAMPAIGN_MISSIONS } from "./campaigns.js";

export const APPLICATION_REWARD = Object.freeze({ xp: 25, coins: 2 });
export const CAMPAIGNS_VERSION = 1;
const missionById = () => new Map(CAMPAIGN_MISSIONS.map((m) => [m.id, m]));
const plain = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const clean = (v, max) => typeof v === "string" ? v.trim().slice(0, max) : "";
const requestKey = (v) => typeof v === "string" && /^[a-zA-Z0-9_-]{8,80}$/.test(v);

export function campaignStateOf(bundle) {
  const value = bundle?.play?.campaigns;
  return plain(value) ? value : { version: CAMPAIGNS_VERSION, completions: {}, applications: {} };
}

export function campaignView(bundle, id) {
  const campaign = CAMPAIGNS[id];
  if (!campaign) return null;
  const state = campaignStateOf(bundle);
  const records = state.completions || {};
  let previousDone = true;
  let done = 0;
  const chapters = campaign.chapters.map((chapter) => ({
    ...chapter,
    missions: chapter.missions.map((mission) => {
      const record = records[mission.id];
      const completed = !!record;
      const unlocked = previousDone;
      previousDone = previousDone && completed;
      if (completed) done++;
      return { ...mission, completed, unlocked, evidence: record?.evidence || "" };
    })
  }));
  const all = chapters.flatMap((chapter) => chapter.missions);
  const applications = Object.values(state.applications || {});
  return {
    ...campaign, chapters, done, total: all.length,
    percent: Math.round(done / Math.max(1, all.length) * 100),
    next: all.find((m) => !m.completed) || null,
    rank: done === all.length ? (id === "brete" ? "Ruta de analista completada" : id === "eventos" ? "Analista de Decisiones" : id === "garaje" ? "Mecánico de la casa" : id === "academia" ? "Analista Certificado" : id === "zonaia" ? "Arquitecto de Agentes" : id === "sabiduria" ? "Sabio con criterio" : id === "mundoian" ? "Pequeño Gran Hombre" : "Ruta profesional completada") :
      done >= 36 ? "Profesional en práctica" : done >= 24 ? "Constructor de portafolio" :
      done >= 12 ? "En formación" : "Primeros pasos",
    applications: {
      count: applications.length,
      totalXP: applications.reduce((n, r) => n + r.reward.xp, 0),
      totalCoins: applications.reduce((n, r) => n + r.reward.coins, 0),
      recent: applications.slice(-8).reverse()
    }
  };
}

export function campaignRewards(bundle) {
  const state = campaignStateOf(bundle);
  const out = { career: 0, evento: 0, hunt: 0, coins: 0 };
  for (const record of Object.values(state.completions || {})) {
    // Both are career learning. Never inflate the retired event's permanent credit.
    out.career += Number(record.reward?.xp) || 0;
    out.coins += Number(record.reward?.coins) || 0;
  }
  for (const record of Object.values(state.applications || {})) {
    out.hunt += Number(record.reward?.xp) || 0;
    out.coins += Number(record.reward?.coins) || 0;
  }
  return out;
}

/** Called only by gameplay.applyMutation after it has checked the date. */
export function applyCampaignMutation(draft, mutation, { at, date }) {
  const no = (reason, duplicate = false) => ({ changed: false, duplicate, reason, paths: [] });
  const current = campaignStateOf(draft);
  if (current.version !== CAMPAIGNS_VERSION) return no("CAMPAIGN_TOO_NEW");
  if (campaignProblems(draft).length) return no("SCHEMA_INVALID");
  if (mutation.type === "campaign.complete") {
    const mission = missionById().get(mutation.missionId);
    if (!mission) return no("UNKNOWN_MISSION");
    if (current.completions?.[mission.id]) return no("DUPLICATE", true);
    const campaign = CAMPAIGNS[mission.campaignId];
    const all = campaign.chapters.flatMap((c) => c.missions);
    const index = all.findIndex((m) => m.id === mission.id);
    if (!all.slice(0, index).every((m) => current.completions?.[m.id])) return no("MISSION_LOCKED");
    const evidence = clean(mutation.evidence, 2000);
    if (evidence.length < 12) return no("EVIDENCE_REQUIRED");
    const state = ensureState(draft);
    state.completions[mission.id] = {
      missionId: mission.id, campaignId: mission.campaignId, date, at, evidence,
      reward: { xp: mission.xp, coins: mission.coins }, rulesVersion: 1
    };
    return { changed: true, duplicate: false, reason: null, paths: [`play.campaigns.completions.${mission.id}`] };
  }
  if (mutation.type === "application.record") {
    if (!requestKey(mutation.requestId)) return no("BAD_REQUEST_ID");
    if (current.applications?.[mutation.requestId]) return no("DUPLICATE", true);
    const entries = Object.values(current.applications || {});
    // A stale phone/map/tab must refresh before recording a new deliberate action.
    if (!Number.isSafeInteger(mutation.expectedCount) || mutation.expectedCount !== entries.length) {
      return no("STALE_APPLICATION_COUNT");
    }
    // No daily or lifetime cap. A short persisted debounce avoids accidental double taps.
    const last = entries[entries.length - 1];
    if (last && Date.parse(at) - Date.parse(last.at) < 650) return no("TOO_FAST");
    const state = ensureState(draft);
    state.applications[mutation.requestId] = {
      id: mutation.requestId, company: clean(mutation.company, 120),
      role: clean(mutation.role, 120), note: clean(mutation.note, 1000),
      date, at, reward: { ...APPLICATION_REWARD }, rulesVersion: 1
    };
    return { changed: true, duplicate: false, reason: null, paths: [`play.campaigns.applications.${mutation.requestId}`] };
  }
  return no("UNKNOWN_MUTATION");
}

function ensureState(draft) {
  if (!draft.play.campaigns) {
    draft.play.campaigns = { version: CAMPAIGNS_VERSION, completions: {}, applications: {} };
  }
  return draft.play.campaigns;
}

/** Strict additive validation; old saves with no campaigns remain valid. */
export function campaignProblems(bundle) {
  const state = bundle?.play?.campaigns;
  if (state == null) return [];
  const errors = [];
  if (!plain(state) || state.version !== CAMPAIGNS_VERSION ||
      !plain(state.completions) || !plain(state.applications)) return ["campaigns: forma o versión inválida"];
  const missions = missionById();
  const recordOK = (r) => plain(r) && /^\d{4}-\d{2}-\d{2}$/.test(r.date) &&
    Number.isFinite(Date.parse(`${r.date}T00:00:00Z`)) &&
    new Date(`${r.date}T00:00:00Z`).toISOString().slice(0, 10) === r.date &&
    typeof r.at === "string" && Number.isFinite(Date.parse(r.at)) &&
    plain(r.reward) && Number.isSafeInteger(r.reward.xp) && r.reward.xp >= 0 &&
    Number.isSafeInteger(r.reward.coins) && r.reward.coins >= 0 && r.rulesVersion === 1;
  for (const [id, r] of Object.entries(state.completions)) {
    const m = missions.get(id);
    if (!m || !recordOK(r) || r.missionId !== id || r.campaignId !== m.campaignId ||
        typeof r.evidence !== "string" || r.evidence.trim().length < 12 || r.evidence.length > 2000) {
      errors.push(`campaigns.completions.${id}: registro inválido`);
    }
  }
  for (const campaign of Object.values(CAMPAIGNS)) {
    let gap = false;
    for (const m of campaign.chapters.flatMap((c) => c.missions)) {
      if (!state.completions[m.id]) gap = true;
      else if (gap) errors.push(`campaigns.${m.id}: prerrequisito pendiente`);
    }
  }
  for (const [id, r] of Object.entries(state.applications)) {
    if (!requestKey(id) || !recordOK(r) || r.id !== id ||
        typeof r.company !== "string" || r.company.length > 120 ||
        typeof r.role !== "string" || r.role.length > 120 ||
        typeof r.note !== "string" || r.note.length > 1000) {
      errors.push(`campaigns.applications.${id}: registro inválido`);
    }
  }
  return errors;
}
