/**
 * district-figures.js — cifras REALES de cada panel de distrito.
 *
 * Solo lectura: recibe el bundle y el catálogo, deriva con src/derive.js y
 * devuelve filas listas para pintar. No toca el save, no inventa datos:
 * los porcentajes solo aparecen cuando el catálogo aporta el denominador.
 */

import { deriveBundle } from "./hud.js";
import { fmt, XP_LABELS } from "./format.js";
import { getDistrict, KEY_HOME } from "./districts.js";

export const PANEL_FOOTNOTE =
  "Las misiones de este distrito se juegan aquí a partir de la Fase 3.";

function count(obj) {
  if (!obj) return 0;
  return Array.isArray(obj) ? obj.length : Object.keys(obj).length;
}

function rowsOf(rows) {
  return rows.filter(Boolean);
}

function row(id, label, value, opts = {}) {
  return {
    id,
    label,
    value: String(value),
    raw: opts.raw,
    hint: opts.hint || null,
    group: opts.group || null
  };
}

/* --------------------------------- accesos -------------------------------- */

function core(b) { return b.core || {}; }
function world(b, name) { return (b.worlds && b.worlds[name] && b.worlds[name].data) || null; }
function legacy(b, name) { return (b.legacy && b.legacy.keys && b.legacy.keys[name] && b.legacy.keys[name].data) || null; }

function catalogSize(catalog, ...path) {
  let node = catalog;
  for (const p of path) node = node && node[p];
  return count(node);
}

function progress(b) { return core(b).progress || {}; }
function identity(b) { return core(b).identity || {}; }
function shop(b) { return core(b).shop || { spent: 0, owned: [], equipped: {} }; }
function hunt(b) { return core(b).hunt || {}; }
function vida(b) { return core(b).vida || {}; }
function capital(b) { return core(b).capital || {}; }
function diary(b) { return core(b).diary || { log: [] }; }
function focus(b) { return core(b).focus || { log: [] }; }
function credits(b) { return core(b).credits || {}; }
function rewards(b) { return core(b).realRewards || {}; }

/* ---------------------------------- paneles -------------------------------- */

function hubPanel(b, catalog, d) {
  const id = identity(b);
  const p = progress(b);
  const derived = deriveBundle(b, catalog);
  const hub = world(b, "hub") || {};
  const events = legacy(b, "events") || [];
  const juice = world(b, "juice") || {};
  const pending = Array.isArray(hub.pendientes) ? hub.pendientes : [];
  const pendingCoins = pending.reduce((a, r) => a + (Number(r && r.monedas) || 0), 0);
  const credit = derived.xpBreakdown.evento + derived.xpBreakdown.farm;

  return {
    id: "hub",
    name: "El Hub",
    subtitle: "Plaza Central",
    description: getDistrict("hub").description,
    accent: getDistrict("hub").accent,
    systems: ["Hub", "Eventos (archivo)", "Preferencias"],
    xp: [
      { key: "ach", label: XP_LABELS.ach, value: fmt(derived.xpBreakdown.ach) },
      { key: "evento", label: XP_LABELS.evento, value: fmt(derived.xpBreakdown.evento) },
      { key: "farm", label: XP_LABELS.farm, value: fmt(derived.xpBreakdown.farm) }
    ],
    rows: rowsOf([
      row("player", "Jugador", id.playerName || "Jugador", { group: "Identidad" }),
      row("level", "Nivel de campaña", fmt(derived.campaignLevel), {
        raw: derived.campaignLevel,
        hint: `Nivel ODEA ${fmt(derived.odeLevel)}`
      }),
      row("totalxp", "XP total", fmt(derived.totalXP), { raw: derived.totalXP }),
      row("streak", "Racha", `${fmt(id.streak || 0)} días`, { raw: Number(id.streak) || 0 }),
      row("refdate", "Fecha de referencia", (b.migration && b.migration.referenceDate) || "—"),

      row("credit", "Crédito permanente", `${fmt(credit)} XP`, {
        raw: credit,
        group: "Monumento al crédito",
        hint: `Evento ${fmt(derived.xpBreakdown.evento)} + Farm ${fmt(derived.xpBreakdown.farm)} · ya no se gana, es tuyo`
      }),

      row("campaign", "Campaña", `${fmt(p.completedMissions ? p.completedMissions.length : 0)} de ${fmt(catalogSize(catalog, "campaign"))}`, { group: "Progreso" }),
      row("daily", "Misiones diarias", `${fmt(p.completedDaily ? p.completedDaily.length : 0)} de ${fmt(catalogSize(catalog, "daily"))}`),
      row("weekly", "Misiones semanales", `${fmt(p.completedWeekly ? p.completedWeekly.length : 0)} de ${fmt(catalogSize(catalog, "weekly"))}`),
      row("ach", "Logros", `${fmt(p.unlockedAch ? p.unlockedAch.length : 0)} de ${fmt(catalogSize(catalog, "achievements"))}`),
      row("pending", "Recompensas pendientes", `${fmt(pending.length)}`, {
        hint: pending.length ? `${fmt(pendingCoins)} monedas por reclamar` : null
      }),

      row("events", "Eventos archivados", `${fmt(events.length)}`, {
        group: "Archivo y preferencias",
        hint: "Log de auditoría: no es progreso activo"
      }),
      row("sound", "Sonido", juice.muted ? "Silenciado" : "Activo")
    ])
  };
}

function iaPanel(b) {
  const ac = world(b, "academia") || {};
  const hechas = ac.hechas || {};
  const entries = Object.entries(hechas);
  const rutas = Array.isArray(ac.rutasAvisadas) ? ac.rutasAvisadas : [];

  return {
    id: "ia",
    name: "Distrito IA",
    subtitle: "Zona Franca de Heredia",
    description: getDistrict("ia").description,
    accent: getDistrict("ia").accent,
    systems: ["Academia"],
    xp: [],
    rows: rowsOf([
      row("academia_done", "Actividades completadas", fmt(entries.length), {
        raw: entries.length,
        group: "Academia"
      }),
      row("academia_rutas", "Rutas avisadas", fmt(rutas.length), { raw: rutas.length })
    ]),
    list: entries.slice(0, 5).map(([name, date]) => ({ label: name, value: String(date) }))
  };
}

function empleoPanel(b, catalog, d) {
  const h = hunt(b);
  const p = progress(b);
  const applications = Array.isArray(h.applications) ? h.applications : [];
  const vacancies = Array.isArray(h.vacancies) ? h.vacancies : [];
  const followups = Array.isArray(h.followups) ? h.followups : [];

  return {
    id: "empleo",
    name: "Distrito Empleo",
    subtitle: "Centro Financiero",
    description: getDistrict("empleo").description,
    accent: getDistrict("empleo").accent,
    systems: ["Empleo"],
    xp: [
      { key: "career", label: XP_LABELS.career, value: fmt(d.xpBreakdown.career) },
      { key: "hunt", label: XP_LABELS.hunt, value: fmt(d.xpBreakdown.hunt) }
    ],
    rows: rowsOf([
      row("career_xp", "XP de carrera", fmt(d.xpBreakdown.career), { raw: d.xpBreakdown.career, group: "Cacería" }),
      row("hunt_xp", "XP de cacería", fmt(d.xpBreakdown.hunt), { raw: d.xpBreakdown.hunt }),
      row("apps", "Postulaciones", fmt(applications.length), { raw: applications.length }),
      row("vacancies", "Vacantes en radar", fmt(vacancies.length), { raw: vacancies.length }),
      row("followups", "Seguimientos", fmt(followups.length), { raw: followups.length }),
      row("hunt_streak", "Racha de cacería", `${fmt(h.streak || 0)} (mejor ${fmt(h.bestStreak || 0)})`),

      row("jobs", "Trabajos completados", `${fmt(p.completedJobs ? p.completedJobs.length : 0)} de ${fmt(catalogSize(catalog, "jobs"))}`, { group: "Empleo" }),
      row("b2b", "B2B", `${fmt(p.completedB2b ? p.completedB2b.length : 0)} de ${fmt(catalogSize(catalog, "b2b"))}`),
      row("puente", "Puente", `${fmt(p.completedPuente ? p.completedPuente.length : 0)} de ${fmt(catalogSize(catalog, "puente"))}`)
    ])
  };
}

function vidaPanel(b, catalog, d) {
  const v = vida(b);
  const dia = diary(b);
  const foc = focus(b);
  const id = identity(b);
  const entries = Array.isArray(dia.log) ? dia.log : [];
  const focusEntries = Array.isArray(foc.log) ? foc.log : [];

  return {
    id: "vida",
    name: "Barrio Vida",
    subtitle: "Zona residencial",
    description: getDistrict("vida").description,
    accent: getDistrict("vida").accent,
    systems: [],
    xp: [
      { key: "vida", label: XP_LABELS.vida, value: fmt(d.xpBreakdown.vida) },
      { key: "diary", label: XP_LABELS.diary, value: fmt(d.xpBreakdown.diary) },
      { key: "focus", label: XP_LABELS.focus, value: fmt(d.xpBreakdown.focus) }
    ],
    rows: rowsOf([
      row("vida_xp", "XP de vida", fmt(d.xpBreakdown.vida), { raw: d.xpBreakdown.vida, group: "Vida" }),
      row("vida_log", "Registros de vida", fmt(Array.isArray(v.log) ? v.log.length : 0), {
        raw: Array.isArray(v.log) ? v.log.length : 0
      }),
      row("streak", "Racha", `${fmt(id.streak || 0)} días`),

      row("diary", "Diario", `${fmt(entries.length)} entradas`, { group: "Diario y enfoque" }),
      row("diary_xp", "XP de diario", fmt(d.xpBreakdown.diary), { raw: d.xpBreakdown.diary }),
      row("focus", "Sesiones de enfoque", fmt(focusEntries.length), { raw: focusEntries.length }),
      row("focus_xp", "XP de enfoque", fmt(d.xpBreakdown.focus), { raw: d.xpBreakdown.focus })
    ]),
    list: entries.slice(0, 3).map((e) => ({ label: String(e.date || "—"), value: `${fmt(e.xp || 0)} XP` }))
  };
}

function torrePanel(b, catalog, d) {
  const c = capital(b);
  const done = Array.isArray(c.done) ? c.done : [];
  const eng = Array.isArray(c.eng) ? c.eng : [];
  const ai = Array.isArray(c.ai) ? c.ai : [];

  return {
    id: "torre",
    name: "La Torre",
    subtitle: "Capital",
    description: getDistrict("torre").description,
    accent: getDistrict("torre").accent,
    systems: [],
    xp: [{ key: "capital", label: XP_LABELS.capital, value: fmt(d.xpBreakdown.capital) }],
    rows: rowsOf([
      row("capital_xp", "XP de capital", fmt(d.xpBreakdown.capital), { raw: d.xpBreakdown.capital, group: "Capital" }),
      row("capital_done", "Módulos completados", `${fmt(done.length)} de ${fmt(catalogSize(catalog, "capital", "done"))}`, {
        raw: done.length
      }),
      row("capital_eng", "Inglés", `${fmt(eng.length)} de ${fmt(catalogSize(catalog, "capital", "eng"))}`, { raw: eng.length }),
      row("capital_ai", "IA", `${fmt(ai.length)} de ${fmt(catalogSize(catalog, "capital", "ai"))}`, { raw: ai.length })
    ])
  };
}

function mercadoPanel(b, catalog, d) {
  const s = shop(b);
  const t = world(b, "tesoro") || {};
  const rw = rewards(b);
  const canje = rw.canje || {};
  const owned = Array.isArray(s.owned) ? s.owned : [];
  const equipped = s.equipped ? Object.keys(s.equipped) : [];
  const custom = Array.isArray(canje.custom) ? canje.custom : [];
  const log = Array.isArray(canje.log) ? canje.log : [];

  return {
    id: "mercado",
    name: "El Mercado",
    subtitle: "Tesoro y tienda",
    description: getDistrict("mercado").description,
    accent: getDistrict("mercado").accent,
    systems: ["Tesoro"],
    xp: [],
    rows: rowsOf([
      row("balance", "Balance de monedas", fmt(d.coins.balance), {
        raw: d.coins.balance,
        group: "Monedas",
        hint: `Ganadas ${fmt(d.coins.earned)} · Gastadas ${fmt(d.coins.spent)}`
      }),
      row("owned", "Objetos comprados", fmt(owned.length), { raw: owned.length }),
      row("equipped", "Equipados", fmt(equipped.length), { raw: equipped.length }),

      row("tesoro_coins", "Monedas del tesoro", fmt(t.monedas || 0), { group: "Tesoro", raw: Number(t.monedas) || 0 }),
      row("tesoro_streak", "Racha del tesoro", `${fmt(t.racha || 0)} (mejor ${fmt(t.mejorRacha || 0)})`),
      row("tesoro_shields", "Escudos", fmt(t.escudos || 0), { raw: Number(t.escudos) || 0 }),

      row("real_rewards", "Recompensas reales", `${fmt(custom.length)} personalizada(s)`, { group: "Canjes" }),
      row("real_history", "Historial de canjes", `${fmt(log.length)}`, { raw: log.length })
    ])
  };
}

function garajePanel(b) {
  const g = world(b, "garaje") || {};
  const km = g.km || {};
  const misiones = Array.isArray(g.misiones) ? g.misiones : [];
  const acc = Array.isArray(g.accesorios) ? g.accesorios : [];

  return {
    id: "garaje",
    name: "El Garaje",
    subtitle: "Zona Industrial",
    description: getDistrict("garaje").description,
    accent: getDistrict("garaje").accent,
    systems: ["Garaje"],
    xp: [],
    rows: rowsOf([
      row("km_car", "Kilómetros · carro", `${fmt(km.carro || 0)} km`, { raw: Number(km.carro) || 0, group: "Vehículos" }),
      row("km_moto", "Kilómetros · moto", `${fmt(km.moto || 0)} km`, { raw: Number(km.moto) || 0 }),
      row("missions", "Misiones de vehículo", fmt(misiones.length), { raw: misiones.length, group: "Taller" }),
      row("acc", "Accesorios", fmt(acc.length), { raw: acc.length })
    ]),
    list: misiones.slice(0, 4).map((m) => ({
      label: m.nombre || m.id || "—",
      value: m.ultima ? String(m.ultima) : "sin registro"
    }))
  };
}

function miradorPanel(b, catalog, d) {
  const sg = world(b, "sagas") || {};
  const jf = world(b, "jefe") || {};
  const chapters = sg.chapters || {};
  const sagas = Array.isArray(catalog.sagas) ? catalog.sagas : [];
  const totalChapters = sagas.reduce((a, s) => a + (Array.isArray(s.chapters) ? s.chapters.length : 0), 0);
  const doneChapters = Object.keys(chapters).length;
  const gods = core(b).gods || {};
  const weekly = sg.weekly || {};

  return {
    id: "mirador",
    name: "Mirador de Sagas",
    subtitle: "Sagas y jefes",
    description: getDistrict("mirador").description,
    accent: getDistrict("mirador").accent,
    systems: ["Sagas", "Jefe semanal"],
    xp: [{ key: "bosses", label: XP_LABELS.bosses, value: fmt(d.xpBreakdown.bosses) }],
    rows: rowsOf([
      row("sagas_chapters", "Capítulos de sagas", `${fmt(doneChapters)} de ${fmt(totalChapters)}`, {
        raw: doneChapters,
        group: "Sagas"
      }),
      row("sagas_weekly", "Saga semanal", weekly.done ? "Completada" : "Pendiente"),

      row("bosses", "Jefes derrotados", `${fmt(Object.keys(gods).length)} de ${fmt(catalogSize(catalog, "bosses"))}`, {
        raw: Object.keys(gods).length,
        group: "Jefes"
      }),
      row("bosses_xp", "XP de jefes", fmt(d.xpBreakdown.bosses), { raw: d.xpBreakdown.bosses }),
      row("weekly_boss", "Jefe semanal", `${fmt(jf.victorias || 0)} victorias · ${fmt(jf.semanas || 0)} semanas`),
      row("best", "Mejor ganancia semanal", fmt(jf.mejorGanancia || 0), { raw: Number(jf.mejorGanancia) || 0 })
    ])
  };
}

function rinconPanel(b) {
  const an = world(b, "anomalia") || {};
  const quiz = legacy(b, "quiz") || {};
  const empleo = legacy(b, "empleo");
  const events = legacy(b, "events") || [];

  return {
    id: "rincon",
    name: "Rincón Anomalía",
    subtitle: "Esquina con glitch",
    description: getDistrict("rincon").description,
    accent: getDistrict("rincon").accent,
    systems: ["Anomalía", "Quiz (archivo)"],
    xp: [],
    archivedNotice:
      "Datos legacy archivados: se conservan, pero no cuentan como progreso activo.",
    rows: rowsOf([
      row("anomaly_type", "Anomalía", `${an.tipo || "—"} · progreso ${fmt(an.progreso || 0)}`, { group: "Anomalía activa" }),
      row("anomaly_frag", "Fragmentos", fmt(an.fragmentos || 0), { raw: Number(an.fragmentos) || 0 }),
      row("anomaly_fragvida", "Fragmentos de vida", fmt(an.fragmentosVida || 0), { raw: Number(an.fragmentosVida) || 0 }),
      row("anomaly_claimed", "Reclamada", an.reclamada ? "Sí" : "No"),
      row("anomaly_last", "Última carta", an.ultimaCarta || "—"),

      row("quiz_days", "Quiz · días jugados", fmt(quiz.dias || 0), { group: "Archivo legacy", raw: Number(quiz.dias) || 0 }),
      row("quiz_acc", "Quiz · aciertos", `${fmt(quiz.aciertos || 0)} de ${fmt(quiz.respondidas || 0)}`),
      row("quiz_streak", "Quiz · racha", fmt(quiz.racha || 0), { raw: Number(quiz.racha) || 0 }),
      row("empleo_legacy", "Empleo legacy", empleo === null ? "—" : String(empleo)),
      row("events", "Eventos archivados", fmt(events.length), { raw: events.length })
    ])
  };
}

/* ---------------------------------- API ----------------------------------- */

const BUILDERS = {
  hub: hubPanel,
  ia: iaPanel,
  empleo: empleoPanel,
  vida: vidaPanel,
  torre: torrePanel,
  mercado: mercadoPanel,
  garaje: garajePanel,
  mirador: miradorPanel,
  rincon: rinconPanel
};

export function buildDistrictPanel(districtId, bundle2, catalog) {
  const district = getDistrict(districtId);
  if (!district || !bundle2 || !catalog) return null;
  const builder = BUILDERS[district.id];
  if (!builder) return null;
  const derived = deriveBundle(bundle2, catalog);
  const panel = builder(bundle2, catalog, derived);
  return {
    ...panel,
    id: district.id,
    footnote: PANEL_FOOTNOTE,
    keys: district.keys.filter((k) => KEY_HOME[k] === district.id)
  };
}
