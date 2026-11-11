/**
 * shape.js — Contrato estructural de la migración ODEA 1 → ODEA 2
 * ---------------------------------------------------------------------------
 * Fuente: bundle real verificado `odea_bundle_v2` de ODEA 1 v5.99.
 * 36 campos en `save` + 11 claves hermanas en `keys`.
 *
 * El bundle ODEA 2 v1 se organiza en TRES secciones de dominio:
 *   core    → estado del núcleo (36 campos de `save`)
 *   worlds  → claves hermanas activas (8)
 *   legacy  → claves archivadas explícitamente (3: empleo, quiz, events)
 *
 * Esa separación es la que permite, en el futuro, partir el bundle único en
 * claves separadas por dominio SIN cambiar de formato: cada sección ya es
 * autocontenida.
 *
 * Cada entrada declara:
 *   action: mapped | renamed | transformed | archived-legacy | derived-snapshot
 *   target: ruta en el bundle odea2_bundle_v1 (o metadato de migración)
 *   reason: por qué se mueve / renombra / archiva
 *   critical: true si perderlo ya costó progreso real (regresión v5.98)
 */

export const MIGRATION_SCHEMA_VERSION = 1;
export const ODEA2_BUNDLE_FORMAT = "odea2_bundle_v1";
export const ODEA2_APP_VERSION = "0.1.0-fase0";

/** Secciones internas del bundle único (decisión D1 de Fase 0). */
export const BUNDLE_SECTIONS = ["core", "worlds", "legacy"];

/** Estados posibles de una importación. `aborted` nunca se escribe como save. */
export const IMPORT_STATES = ["active", "quarantine", "aborted"];

export const SAVE_FIELDS = [
  { name: "playerName", action: "mapped", target: "core.identity.playerName", reason: "Identidad del jugador." },
  { name: "completedMissions", action: "mapped", target: "core.progress.completedMissions", reason: "Fuente de XP de campaña y de monedas (conteo)." },
  { name: "completedDaily", action: "mapped", target: "core.progress.completedDaily", reason: "Fuente de XP diaria (con multiplicador de racha) y de monedas." },
  { name: "completedWeekly", action: "mapped", target: "core.progress.completedWeekly", reason: "Fuente de XP semanal y de monedas." },
  { name: "completedJobs", action: "mapped", target: "core.progress.completedJobs", reason: "Fuente de XP de noticias/empleo y de monedas." },
  { name: "completedB2b", action: "mapped", target: "core.progress.completedB2b", reason: "Crédito XP legacy del mundo B2B retirado; no borrar." },
  { name: "completedPuente", action: "mapped", target: "core.progress.completedPuente", reason: "Fuente de XP del Puente Global y de monedas." },
  { name: "unlockedAch", action: "mapped", target: "core.progress.unlockedAch", reason: "Fuente de XP de logros." },
  { name: "startDate", action: "mapped", target: "core.identity.startDate", reason: "Fecha de inicio del plan." },
  { name: "lastDailyDate", action: "mapped", target: "core.identity.lastDailyDate", reason: "Última fecha con misión diaria; también fija la fecha de referencia de la migración." },
  { name: "streak", action: "mapped", target: "core.identity.streak", reason: "Racha; multiplica el XP diario derivado." },
  { name: "shieldWeek", action: "mapped", target: "core.identity.shieldWeek", reason: "Semana ISO del escudo de racha." },
  { name: "vida", action: "mapped", target: "core.vida", reason: "Fuente de XP de vida (log, listas, bonus de equilibrio y sagas)." },
  { name: "capital", action: "mapped", target: "core.capital", reason: "Fuente de XP de Capital/Inglés/IA y de monedas (conteo)." },
  { name: "gods", action: "mapped", target: "core.gods", reason: "Fuente de XP de jefes y de monedas (50 por jefe)." },
  { name: "shop", action: "mapped", target: "core.shop", reason: "shop.spent es el libro de gastos de monedas; owned/equipped son equipo." },
  { name: "sound", action: "mapped", target: "core.identity.sound", reason: "Preferencia de sonido." },
  { name: "reto", action: "mapped", target: "core.reto", reason: "Reto diario." },
  { name: "rewards", action: "renamed", target: "core.gear", reason: "En ODEA 1 `rewards` es el ARSENAL/EQUIPO (gear). Se renombra para no ocupar el nombre `rewards` que ODEA 2 reserva para recompensas reales." },
  { name: "planner", action: "mapped", target: "core.planner", reason: "Plan personal (referencias a misiones)." },
  { name: "diary", action: "mapped", target: "core.diary", reason: "Fuente de XP del diario." },
  { name: "activity", action: "mapped", target: "core.activity", reason: "Registro de actividad por fecha; historial de racha." },
  { name: "freezers", action: "mapped", target: "core.identity.freezers", reason: "Congeladores de racha (máx. 2)." },
  { name: "applications", action: "mapped", target: "core.progress.applications", reason: "Fuentes de noticias que el jugador sigue." },
  { name: "focus", action: "mapped", target: "core.focus", reason: "Fuente de XP de enfoque (pomodoro)." },
  { name: "hunt", action: "mapped", target: "core.hunt", reason: "La Cacería completa (22 subcampos); hunt.log es fuente de XP y monedas." },
  { name: "saveVersion", action: "transformed", target: "migratedFrom.saveVersion", reason: "Versión de schema legacy (3). No se copia como schema de ODEA 2; queda como procedencia." },
  { name: "eventRL", action: "mapped", target: "core.credits.eventRL", reason: "CRÍTICO: crédito permanente del evento de entrevista. Ya no tiene UI en ODEA 1 pero su XP/monedas cuentan." , critical: true },
  { name: "farm", action: "mapped", target: "core.credits.farm", reason: "CRÍTICO: crédito permanente del Quiz Farmeo. Capa retirada, pero su XP/monedas cuentan." , critical: true },
  { name: "canje", action: "mapped", target: "core.realRewards.canje", reason: "CRÍTICO: Recompensas Reales creadas y canjeadas por el usuario. No reutilizar el nombre `rewards`." , critical: true },
  { name: "xpBreakdown", action: "derived-snapshot", target: "core.derived.xpBreakdown", reason: "Snapshot DERIVADO de 10 componentes. Se conserva como checksum; ODEA 2 recalcula desde las fuentes." },
  { name: "totalXP", action: "derived-snapshot", target: "core.derived.totalXP", reason: "Snapshot derivado. Checksum de la suma de componentes." },
  { name: "campaignLevel", action: "derived-snapshot", target: "core.derived.campaignLevel", reason: "Snapshot derivado (días completos + 1)." },
  { name: "level", action: "derived-snapshot", target: "core.derived.level", reason: "Alias de compatibilidad de campaignLevel en ODEA 1." },
  { name: "odeLevel", action: "derived-snapshot", target: "core.derived.odeLevel", reason: "Snapshot derivado del nivel global (escalera ODE de 63 niveles)." },
  { name: "stats", action: "derived-snapshot", target: "core.stats", reason: "stats.domains es derivado; se conserva como snapshot para paridad y se recalcula en ODEA 2." }
];

export const SAVE_FIELD_SET = new Set(SAVE_FIELDS.map((f) => f.name));

/**
 * 11 claves hermanas. `section` decide dónde vive su data en el bundle:
 *   worlds → activa (se usa en ODEA 2)
 *   legacy → archivada explícitamente, nunca se descarta en silencio
 */
export const SIBLING_KEYS = [
  { key: "odea_academia_v1", name: "academia", section: "worlds", lifecycle: "active", reason: "Academia; base del futuro Distrito IA (reskin, sin tocar lógica)." },
  { key: "odea_jefe_v1", name: "jefe", section: "worlds", lifecycle: "active", reason: "Jefe semanal." },
  { key: "odea_empleo_v2", name: "empleo", section: "legacy", lifecycle: "archived-legacy", reason: "Marca escalar de migración de empleo ya consumida por ODEA 1 (siempre 1). Se archiva como legacy." },
  { key: "odea_anomalia_v1", name: "anomalia", section: "worlds", lifecycle: "active", reason: "Anomalía diaria." },
  { key: "odea_quiz_v1", name: "quiz", section: "legacy", lifecycle: "archived-legacy", reason: "LEGACY PERMANENTE: capa quiz retirada de la interfaz en v5.99. Se archiva indefinidamente; no se elimina automáticamente en ninguna versión." },
  { key: "odea_tesoro_v1", name: "tesoro", section: "worlds", lifecycle: "active", reason: "Tesoro, rachas y sinergias." },
  { key: "odea_sagas_v1", name: "sagas", section: "worlds", lifecycle: "active", reason: "Sagas: aporta XP a vida (kid/pow) y monedas. CRÍTICO para la paridad de XP." },
  { key: "odea_events", name: "events", section: "legacy", lifecycle: "archived-log", reason: "Log del bus de eventos (máx. 500). No es estado de juego; se archiva para auditoría." },
  { key: "odea_garaje_v1", name: "garaje", section: "worlds", lifecycle: "active", reason: "Garaje: misiones de vehículos y kilómetros." },
  { key: "odea_juice_v1", name: "juice", section: "worlds", lifecycle: "active", reason: "Preferencias de sonido/juice." },
  { key: "odea_hub_v1", name: "hub", section: "worlds", lifecycle: "active", reason: "Hub: recompensas pendientes de monedas." }
];

export const SIBLING_KEY_SET = new Set(SIBLING_KEYS.map((k) => k.key));
export const ACTIVE_WORLD_KEYS = SIBLING_KEYS.filter((k) => k.section === "worlds");
export const LEGACY_KEYS = SIBLING_KEYS.filter((k) => k.section === "legacy");

/** Campos cuyo contenido NO puede faltar ni cambiar (regresión v5.98). */
export const CRITICAL_FIELDS = ["eventRL", "farm", "canje"];

/** Ruta destino de cada campo crítico en el bundle ODEA 2. */
export const CRITICAL_TARGETS = {
  eventRL: "core.credits.eventRL",
  farm: "core.credits.farm",
  canje: "core.realRewards.canje"
};

/** Rutas objetivo (dot-path) que el validador resuelve en el bundle ODEA 2. */
export function getPath(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function stableStringify(value) {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  const keys = Object.keys(value).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(value[k])).join(",") + "}";
}

export function deepEqual(a, b) {
  return stableStringify(a) === stableStringify(b);
}

/* ------------------------------------------------------------------------- */
/* Huella del bundle de origen (detección de duplicados y auditoría)          */
/* ------------------------------------------------------------------------- */

const FNV_OFFSET_64 = 0xcbf29ce484222325n;
const FNV_PRIME_64 = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

/**
 * FNV-1a de 64 bits sobre UTF-8. No es criptográfico: se usa como huella
 * estable para detectar el MISMO bundle importado dos veces. Portátil
 * (TextEncoder + BigInt), sin dependencias de Node ni de crypto.
 */
export function fnv1a64(text) {
  const bytes = new TextEncoder().encode(String(text));
  let h = FNV_OFFSET_64;
  for (const b of bytes) {
    h ^= BigInt(b);
    h = (h * FNV_PRIME_64) & MASK_64;
  }
  return h.toString(16).padStart(16, "0");
}

/**
 * Huella del bundle legacy: checksum estable + los 4 datos que pide la spec
 * (checksum, appVersion, totalXP, lastDailyDate) para detectar duplicados.
 */
export function fingerprintOf(legacy) {
  const save = (legacy && legacy.save) || null;
  const payload = stableStringify({
    _format: legacy && legacy._format,
    appVersion: legacy && legacy.appVersion,
    save: legacy && legacy.save,
    keys: legacy && legacy.keys
  });
  return {
    algorithm: "fnv1a64",
    digest: fnv1a64(payload),
    appVersion: (legacy && legacy.appVersion) || null,
    totalXP: save && save.totalXP !== undefined ? save.totalXP : null,
    lastDailyDate: (save && save.lastDailyDate) || null
  };
}

export function sameSource(a, b) {
  return !!a && !!b && a.digest === b.digest;
}
